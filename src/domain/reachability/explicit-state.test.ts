/**
 * SPEC 007 AC-1-5 — every proof over a small model is re-decided by an explicit-state
 * search that shares nothing with the SMT encoder beyond the parsed expression AST.
 *
 * Three layers: the search itself on models whose answer is known by hand; the projection
 * of a disagreement onto `FND_CERTIFICATE_DISAGREES`; and a seeded DIFFERENTIAL over random
 * small models, where the two checkers must never disagree and every VIOLATED must be
 * confirmed by the search. The differential is the gate that proves the second checker is
 * independent: reintroducing the AC-1-1 enum defect into the encoder makes it fire.
 */

import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import {
  DOC_VERSION,
  type Requirement,
  type RequirementsDocument,
  type StateVariable,
} from '../requirements/document.ts'
import { isExprError, validateExpression } from '../requirements/state-expr.ts'
import {
  explicitCheck,
  REACHABILITY_BFS_STATE_CAP,
  REACHABILITY_BFS_WORK_CAP,
} from './explicit-state.ts'
import {
  type ConstraintResult,
  prepareModel,
  type ReachabilityReport,
  runReachability,
} from './reachability.ts'
import { projectReachability } from './reachability-report.ts'

const TS = '2026-01-01T00:00:00.000Z'
const uuid = (n: number): string => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`

const req = (
  n: number,
  key: string,
  fields: Partial<Requirement> & Pick<Requirement, 'responseKind'>,
): Requirement => ({
  id: uuid(n),
  key,
  patternType: 'ubiquitous',
  systemName: 'controller',
  systemResponse: 'behave',
  negated: false,
  sentence: 'The controller shall behave.',
  priority: 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: TS,
  updatedAt: TS,
  ...fields,
})
const effect = (n: number, key: string, stateEffect: string) =>
  req(n, key, { responseKind: 'effect', stateEffect })
const constraint = (n: number, key: string, stateConstraint: string) =>
  req(n, key, { responseKind: 'constraint', stateConstraint })

const docOf = (
  variables: readonly StateVariable[],
  requirements: readonly Requirement[],
): RequirementsDocument => ({
  docVersion: DOC_VERSION,
  requirements: Object.fromEntries(requirements.map((r) => [r.id, r])),
  stateModel: { variables: [...variables] },
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
})

const run = (document: RequirementsDocument): Promise<ReachabilityReport> =>
  Effect.runPromise(runReachability(document).pipe(Effect.provide(Layer.fresh(solverServiceLayer))))

const SHARED_MEMBER = (): RequirementsDocument =>
  docOf(
    [
      { name: 'door', type: 'enum', frame: 'volatile', domain: ['open', 'closed'] },
      {
        name: 'valve',
        type: 'enum',
        frame: 'volatile',
        domain: ['shut', 'ajar', 'open'],
        initial: 'valve = open',
      },
    ],
    [effect(1, 'E1', 'when valve = open: valve := open'), constraint(2, 'C1', 'valve = shut')],
  )

const LOCK = (): RequirementsDocument =>
  docOf(
    [
      {
        name: 'granted',
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: 4 },
        initial: 'granted = 0',
      },
    ],
    [
      effect(1, 'GRANT', 'when granted = 0: granted := granted + 1'),
      effect(2, 'RELEASE', 'when granted = 1: granted := granted - 1'),
      constraint(3, 'AT_MOST_ONE', 'granted <= 1'),
    ],
  )

/** The constraint predicate of a document, validated, for driving the search directly. */
const predicateOf = (document: RequirementsDocument, source: string) => {
  const parsed = validateExpression(source, document.stateModel, 'constraint')
  if (isExprError(parsed)) throw new Error(parsed.error)
  return parsed
}

// ---------------------------------------------------------------------------
// 1. The search, on answers known by hand
// ---------------------------------------------------------------------------

describe('explicitCheck decides small models on its own', () => {
  it('finds the AC-1-1 violation in the initial state, reading members by NAME', () => {
    const document = SHARED_MEMBER()
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'valve = shut'),
      'none',
    )
    expect(verdict.status).toBe('violated')
    if (verdict.status === 'violated') {
      expect(verdict.trace).toEqual([])
      expect(verdict.path[0]?.valve).toBe('open')
    }
  })

  it('proves the guarded lock by enumerating its two reachable states', () => {
    const document = LOCK()
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'granted <= 1'),
      'none',
    )
    expect(verdict).toEqual({ status: 'holds', states: 2 })
  })

  it('a written value escapes its range rather than disabling the step (AC-1-2 semantics)', () => {
    const document = docOf(
      [{ name: 'n', type: 'int', frame: 'volatile', domain: { min: 0, max: 1 }, initial: 'n = 1' }],
      [effect(1, 'BUMP', 'n := n + 1'), constraint(2, 'SMALL', 'n <= 1')],
    )
    const verdict = explicitCheck(prepareModel(document), predicateOf(document, 'n <= 1'), 'full')
    expect(verdict.status === 'violated' && verdict.trace).toEqual(['BUMP'])
  })

  it('declines, with the reason, when a free variable is an unbounded int', () => {
    const document = docOf(
      [
        { name: 'x', type: 'int', frame: 'volatile', initial: 'x = 0' },
        { name: 'b', type: 'bool', frame: 'volatile', initial: 'b = false' },
      ],
      [effect(1, 'FLIP', 'b := not b'), constraint(2, 'C', 'x = 0')],
    )
    const verdict = explicitCheck(prepareModel(document), predicateOf(document, 'x = 0'), 'none')
    expect(verdict.status).toBe('not-applicable')
    // Pinned, the same model IS finite: `x` never changes under the full frame.
    expect(explicitCheck(prepareModel(document), predicateOf(document, 'x = 0'), 'full')).toEqual({
      status: 'holds',
      states: 2,
    })
  })

  it('declines past the state cap rather than claiming anything', () => {
    const document = docOf(
      [{ name: 'n', type: 'int', frame: 'volatile', initial: 'n = 0' }],
      [effect(1, 'TICK', 'n := n + 1'), constraint(2, 'C', 'n >= 0')],
    )
    const verdict = explicitCheck(prepareModel(document), predicateOf(document, 'n >= 0'), 'full')
    expect(verdict).toEqual({
      status: 'not-applicable',
      reason: `more than ${REACHABILITY_BFS_STATE_CAP} reachable states`,
    })
    expect(REACHABILITY_BFS_WORK_CAP).toBeGreaterThan(REACHABILITY_BFS_STATE_CAP)
  })
})

// ---------------------------------------------------------------------------
// 1b. The caps bound the states VISITED, never the declared domains
// ---------------------------------------------------------------------------

/** Eleven reachable states inside a billion-value declared range. */
const METER = (initial = 'count = 0'): RequirementsDocument =>
  docOf(
    [
      {
        name: 'count',
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: 1_000_000_000 },
        initial,
      },
    ],
    [effect(1, 'INC', 'when count < 10: count := count + 1'), constraint(2, 'CAP', 'count <= 10')],
  )

/**
 * Enough initialised bools that their declared product, 2^FLAGS.length, exceeds the
 * work cap on its own: an initial search that only filtered complete assignments would
 * have to decline, so these fixtures gate the PRUNING, not just the answer.
 */
const FLAGS = Array.from({ length: 20 }, (_, i) => `f${i}`)

/**
 * The AC-1-1 reproducer widened by {@link FLAGS} initialised bools. The declared product is
 * millions of assignments; the initial predicates pin every variable, and the one
 * effect writes every variable, so the reachable space is exactly ONE state.
 */
const WIDE_SHARED_MEMBER = (): RequirementsDocument =>
  docOf(
    [
      {
        name: 'door',
        type: 'enum',
        frame: 'volatile',
        domain: ['open', 'closed'],
        initial: 'door = closed',
      },
      {
        name: 'valve',
        type: 'enum',
        frame: 'volatile',
        domain: ['shut', 'ajar', 'open'],
        initial: 'valve = open',
      },
      ...FLAGS.map(
        (name): StateVariable => ({
          name,
          type: 'bool',
          frame: 'volatile',
          initial: `${name} = false`,
        }),
      ),
    ],
    [
      effect(
        1,
        'E1',
        `when valve = open: valve := open, door := door, ${FLAGS.map((f) => `${f} := ${f}`).join(', ')}`,
      ),
      constraint(2, 'C1', 'valve = shut'),
    ],
  )

describe('the caps bound the states the search visits, not the declared domains', () => {
  it('cross-checks eleven reachable states inside a billion-value declared range', () => {
    const document = METER()
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'count <= 10'),
      'none',
    )
    expect(verdict).toEqual({ status: 'holds', states: 11 })
  })

  it('the tier reports that meter PROVED with the cross-check AGREEING', async () => {
    const result = (await run(METER())).results[0]
    expect(result?.verdict).toBe('PROVED')
    expect(result?.crossCheck).toEqual({ status: 'agrees', states: 11 })
  })

  it('narrows an int initial to the interval its top-level comparisons bound', () => {
    const document = METER('count > 2 and 4 >= count')
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'count <= 10'),
      'none',
    )
    expect(verdict).toEqual({ status: 'holds', states: 8 })
  })

  it('declines an initial predicate that admits more states than the cap, without enumerating the range', () => {
    const document = METER('count >= 0')
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'count <= 10'),
      'none',
    )
    expect(verdict).toEqual({
      status: 'not-applicable',
      reason: `more than ${REACHABILITY_BFS_STATE_CAP} initial states`,
    })
  })

  it('declines a step that leaves a billion-value int free, without enumerating the range', () => {
    const document = docOf(
      [
        {
          name: 'count',
          type: 'int',
          frame: 'volatile',
          domain: { min: 0, max: 1_000_000_000 },
          initial: 'count = 0',
        },
        { name: 'b', type: 'bool', frame: 'volatile', initial: 'b = false' },
      ],
      [effect(1, 'FLIP', 'b := not b'), constraint(2, 'C', 'count >= 0')],
    )
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'count >= 0'),
      'none',
    )
    expect(verdict).toEqual({
      status: 'not-applicable',
      reason: `more than ${REACHABILITY_BFS_WORK_CAP} successors to generate`,
    })
  })

  it('sizes FLAGS past the work cap, so the pruning is what the next cases exercise', () => {
    expect(2 ** FLAGS.length).toBeGreaterThan(REACHABILITY_BFS_WORK_CAP)
  })

  it('prunes the initial search by predicate: every bool initialised is ONE initial state', () => {
    const document = WIDE_SHARED_MEMBER()
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'valve = shut'),
      'none',
    )
    expect(verdict.status).toBe('violated')
    if (verdict.status === 'violated') {
      expect(verdict.states).toBe(1)
      expect(verdict.path[0]?.valve).toBe('open')
    }
  })

  it('the widened AC-1-1 reproducer yields no PROVED and no disagreement', async () => {
    const codes = projectReachability(await run(WIDE_SHARED_MEMBER()), 'doc.json').findings.map(
      (f) => f.code,
    )
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).not.toContain('FND_CERTIFICATE_DISAGREES')
  })

  it('cross-checks a proof over many stable bools with two reachable states', async () => {
    const document = docOf(
      FLAGS.map(
        (name): StateVariable => ({
          name,
          type: 'bool',
          frame: 'stable',
          initial: `${name} = false`,
        }),
      ),
      [effect(1, 'TOGGLE', 'f0 := not f0'), constraint(2, 'QUIET', 'not f1')],
    )
    const result = (await run(document)).results[0]
    expect(['PROVED', 'PROVED_UNDER_HYPOTHESES']).toContain(result?.verdict)
    expect(result?.crossCheck).toEqual({ status: 'agrees', states: 2 })
  })
})

// ---------------------------------------------------------------------------
// 2. The tier cross-checks its proofs, and a disagreement withdraws the proof
// ---------------------------------------------------------------------------

describe('a PROVED verdict carries the cross-check that re-decided it', () => {
  it('the lock proof is PROVED and the explicit search AGREES over its reachable states', async () => {
    const report = await run(LOCK())
    const result = report.results[0]
    expect(result?.verdict).toBe('PROVED')
    expect(result?.crossCheck).toEqual({ status: 'agrees', states: 2 })
  })

  it('the AC-1-1 reproducer yields no PROVED and no disagreement', async () => {
    const codes = projectReachability(await run(SHARED_MEMBER()), 'doc.json').findings.map(
      (f) => f.code,
    )
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).not.toContain('FND_CERTIFICATE_DISAGREES')
  })
})

describe('a disagreement is FND_CERTIFICATE_DISAGREES, never a proof', () => {
  const disagreeing: ConstraintResult = {
    label: 'C1',
    requirementId: uuid(2),
    verdict: 'UNKNOWN',
    strict: 'unreachable',
    elapsedMs: 5,
    refusedParams: [],
    proofFrame: 'none',
    crossCheck: {
      status: 'disagrees',
      frame: 'none',
      trace: [],
      path: [{ door: 'open', valve: 'open' }],
    },
  }
  const projection = projectReachability(
    {
      results: [disagreeing],
      rangeChecks: [],
      skipped: [],
      effects: 1,
      variables: 2,
      frameDrift: [],
      emptyTransitionRelation: false,
      vacuousInitialState: false,
      initialPredicates: [],
      refusedParams: [],
      elapsedMs: 5,
      timeoutMs: 2000,
    },
    'doc.json',
  )

  it('reports FND_CERTIFICATE_DISAGREES at error severity, with the explicit witness', () => {
    const finding = projection.findings.find((f) => f.code === 'FND_CERTIFICATE_DISAGREES')
    expect(finding?.severity).toBe('error')
    expect(finding?.requirementIds).toEqual([uuid(2)])
    expect(finding?.evidence?.path).toEqual([{ door: 'open', valve: 'open' }])
  })

  it('reports neither the proof nor an ordinary UNKNOWN for it', () => {
    const codes = projection.findings.map((f) => f.code)
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).not.toContain('FND_REACHABILITY_UNKNOWN')
  })

  it('demotes, so `verified` cannot stand on a withdrawn proof', () => {
    expect(projection.demotions.map((d) => d.reason)).toContain(
      'reachability-certificate-disagrees',
    )
  })
})

// ---------------------------------------------------------------------------
// 3. The differential: random small models, two checkers, zero disagreements
// ---------------------------------------------------------------------------

/** A tiny deterministic PRNG (mulberry32), so every failing seed reproduces. */
const rng = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One random model: two or three variables drawn from bool / bounded int / enum, where
 * the enums deliberately SHARE member names (the AC-1-1 shape), one to three guarded
 * effects, and two constraints. Rendered as text so it goes through the real validator.
 */
const randomModel = (seed: number): RequirementsDocument => {
  const r = rng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T
  const members = ['on', 'off', 'idle', 'busy']
  const variables: StateVariable[] = []
  const count = 2 + Math.floor(r() * 2)
  for (let i = 0; i < count; i += 1) {
    const name = `v${i}`
    // The first two variables are ENUMS over shuffled subsets of one member pool, so a
    // member routinely sits at different indices in two enums — the AC-1-1 shape.
    const kind = i < 2 ? 'enum' : pick(['bool', 'int', 'enum'] as const)
    if (kind === 'bool') {
      variables.push({
        name,
        type: 'bool',
        frame: 'volatile',
        initial: `${name} = ${pick(['true', 'false'])}`,
      })
    } else if (kind === 'int') {
      variables.push({
        name,
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: 2 },
        initial: `${name} = ${pick(['0', '1', '2'])}`,
      })
    } else {
      const shuffled = [...members].sort(() => r() - 0.5)
      const domain = shuffled.filter(() => r() < 0.7)
      const safe = domain.length >= 2 ? domain : shuffled.slice(0, 2)
      variables.push({
        name,
        type: 'enum',
        frame: 'volatile',
        domain: safe,
        initial: `${name} = ${pick(safe)}`,
      })
    }
  }
  const atom = (v: StateVariable): string =>
    v.type === 'bool'
      ? pick([v.name, `not ${v.name}`])
      : v.type === 'int'
        ? `${v.name} ${pick(['=', '!=', '<', '>='])} ${pick(['0', '1', '2'])}`
        : `${v.name} ${pick(['=', '!='])} ${pick(v.domain)}`
  const value = (v: StateVariable): string =>
    v.type === 'bool'
      ? pick(['true', 'false', `not ${v.name}`])
      : v.type === 'int'
        ? pick([`${v.name} + 1`, `${v.name} - 1`, '0', '1'])
        : pick(v.domain)
  const requirements: Requirement[] = []
  const effects = 1 + Math.floor(r() * 3)
  for (let e = 0; e < effects; e += 1) {
    const target = pick(variables)
    const guard = r() < 0.8 ? `when ${atom(pick(variables))}: ` : ''
    requirements.push(effect(e + 1, `E${e}`, `${guard}${target.name} := ${value(target)}`))
  }
  requirements.push(constraint(10, 'C0', atom(pick(variables))))
  requirements.push(
    constraint(
      11,
      'C1',
      `${atom(pick(variables))} ${pick(['and', 'or'])} ${atom(pick(variables))}`,
    ),
  )
  return docOf(variables, requirements)
}

describe('DIFFERENTIAL — the Horn tier and the explicit search never disagree', () => {
  const SEEDS = Array.from({ length: 16 }, (_, i) => 7001 + i)

  it(`agrees on ${SEEDS.length} seeded random models, and confirms every VIOLATED`, async () => {
    const disagreements: string[] = []
    for (const seed of SEEDS) {
      const document = randomModel(seed)
      const report = await run(document)
      const prepared = prepareModel(document)
      for (const result of report.results) {
        if (result.crossCheck?.status === 'disagrees') {
          disagreements.push(`seed ${seed} ${result.label}: the Horn tier's proof was refuted`)
        }
        if (result.verdict === 'VIOLATED') {
          const predicate = prepared.constraints.find((c) => c.label === result.label)?.predicate
          if (predicate === undefined) continue
          const confirm = explicitCheck(prepared, predicate, 'full')
          if (confirm.status === 'holds') {
            disagreements.push(
              `seed ${seed} ${result.label}: VIOLATED but the search says it holds`,
            )
          }
        }
      }
    }
    expect(disagreements).toEqual([])
  }, 120_000)
})
