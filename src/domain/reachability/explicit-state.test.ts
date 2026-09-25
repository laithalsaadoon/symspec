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
  REACHABILITY_BFS_SUCCESSOR_CAP,
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

const run = (
  document: RequirementsDocument,
  options: { readonly timeoutMs?: number } = {},
): Promise<ReachabilityReport> =>
  Effect.runPromise(
    runReachability(document, options).pipe(Effect.provide(Layer.fresh(solverServiceLayer))),
  )

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

  it('a free variable outside its range may KEEP its value, so no frame loses a pinned state', () => {
    // x = 3 is reached by A; D writes only y. Under `full` x stays 3; a free x must be able
    // to stay 3 too, or the `none` relation is not a superset of the `full` one and a proof
    // under `none` says nothing about the document.
    const document = docOf(
      [
        { name: 'x', type: 'int', frame: 'volatile', domain: { min: 0, max: 2 }, initial: 'x = 2' },
        { name: 'y', type: 'int', frame: 'volatile', domain: { min: 0, max: 2 }, initial: 'y = 2' },
      ],
      [
        effect(1, 'A', 'when x = 2: x := x + 1'),
        effect(2, 'D', 'when y = 2: y := y + 1'),
        constraint(3, 'C', 'not (x = 3 and y = 3)'),
      ],
    )
    const predicate = predicateOf(document, 'not (x = 3 and y = 3)')
    for (const frame of ['none', 'declared', 'full'] as const) {
      const verdict = explicitCheck(prepareModel(document), predicate, frame)
      expect(verdict.status, frame).toBe('violated')
      expect(verdict.status === 'violated' && verdict.path.at(-1), frame).toEqual({
        x: '3',
        y: '3',
      })
    }
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
      beyondCap: true,
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
      beyondCap: true,
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
      reason: `a step from a reachable state has more than ${REACHABILITY_BFS_STATE_CAP} distinct successors`,
      beyondCap: true,
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
// 1c. Duplicates never count as work, and declaration order never decides applicability
// ---------------------------------------------------------------------------

/**
 * The verifier's AC-1-5 reproducer: a counter that opens the valve at ten, and a volatile
 * sensor `reading` that no effect writes. Under the `none` frame `reading` is free on every
 * step, so every state fans out over its full `0..READING_MAX` range, but the fan-out from
 * the eleven states of one counter value lands on the SAME states. So the reachable space is
 * `1 + 11 * (READING_MAX + 1)` states (3312 at READING_MAX = 300). That is under the state
 * cap, while the successors generated with duplicates, about `11 * 301^2`, are over the old
 * work cap.
 */
const READING_MAX = 300
const SENSOR_STATES = 1 + 11 * (READING_MAX + 1)
const SENSOR = (constraintText = 'valve = shut or valve = ajar'): RequirementsDocument =>
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
        initial: 'valve = ajar',
      },
      { name: 'c', type: 'int', frame: 'volatile', domain: { min: 0, max: 10 }, initial: 'c = 0' },
      {
        name: 'reading',
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: READING_MAX },
        initial: 'reading = 0',
      },
    ],
    [
      effect(1, 'TICK', 'when c < 10 and valve = ajar: c := c + 1, valve := valve, door := door'),
      effect(2, 'OPEN', 'when c = 10 and valve = ajar: valve := open, c := c, door := door'),
      constraint(3, 'C1', constraintText),
    ],
  )

/**
 * The verifier's declaration-order reproducer: {@link FLAGS} bools each initialised
 * `fi = g`, with `g` DECLARED LAST and pinned `g = false`. Pruning by prefix cannot begin
 * until `g` is assigned, so an order that puts `g` last examines 2^FLAGS.length prefixes.
 * The model has ONE reachable state. `lastFirst` reverses the declarations, so the
 * test also shows that the answer does not depend on declaration order.
 */
const LATE_PIN = (lastFirst = false): RequirementsDocument => {
  const flags = FLAGS.slice(1).map(
    (name): StateVariable => ({ name, type: 'bool', frame: 'volatile', initial: `${name} = g` }),
  )
  const variables: StateVariable[] = [
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
    ...flags,
    { name: 'g', type: 'bool', frame: 'volatile', initial: 'g = false' },
  ]
  return docOf(lastFirst ? [...variables].reverse() : variables, [
    effect(
      1,
      'E1',
      `when valve = open: valve := open, door := door, g := g, ${flags.map((f) => `${f.name} := ${f.name}`).join(', ')}`,
    ),
    constraint(2, 'C1', 'valve = shut'),
  ])
}

/**
 * THE SAFETY VALVE's fixture. Seven digits whose initial sum is 63, so each one is 9 and
 * there is ONE initial state. A sum is not a definition the search can solve for, and a
 * partial sum refutes nothing, so the search visits 10^7 leaves before it finds that state.
 * The work cap trips before the state count is known. The Horn tier proves `a = 9`.
 */
const DIGITS = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
const SUM_OF_NINES = (): RequirementsDocument =>
  docOf(
    DIGITS.map(
      (name, i): StateVariable => ({
        name,
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: 9 },
        ...(i === 0 ? { initial: `${DIGITS.join(' + ')} = 63` } : {}),
      }),
    ),
    [effect(1, 'HOLD', 'when a = 9: a := a'), constraint(2, 'NINE', 'a = 9')],
  )

describe('the search counts distinct states, never duplicates or declaration order', () => {
  it('sizes the sensor reproducer under the state cap and its duplicate fan-out over the work cap', () => {
    expect(SENSOR_STATES).toBeLessThanOrEqual(REACHABILITY_BFS_STATE_CAP)
    expect(11 * (READING_MAX + 1) ** 2).toBeGreaterThan(REACHABILITY_BFS_WORK_CAP)
  })

  it('enumerates the sensor model state by state: a free sensor adds states, not work', () => {
    const document = SENSOR('c <= 10')
    expect(explicitCheck(prepareModel(document), predicateOf(document, 'c <= 10'), 'none')).toEqual(
      { status: 'holds', states: SENSOR_STATES },
    )
  })

  it('finds the sensor violation at depth twelve', () => {
    const document = SENSOR()
    const verdict = explicitCheck(
      prepareModel(document),
      predicateOf(document, 'valve = shut or valve = ajar'),
      'none',
    )
    expect(verdict.status === 'violated' && verdict.trace).toEqual([
      ...Array.from({ length: 10 }, () => 'TICK'),
      'OPEN',
    ])
  })

  it('the tier reports the sensor proof PROVED with the cross-check AGREEING', async () => {
    const result = (await run(SENSOR('c <= 10'))).results[0]
    expect(result?.verdict).toBe('PROVED')
    expect(result?.crossCheck).toEqual({ status: 'agrees', states: SENSOR_STATES })
  })

  it('the sensor reproducer is VIOLATED, with no PROVED and no disagreement', async () => {
    // Spacer needs ~1.6s of the 2s default to find this depth-12 counterexample (measured),
    // and a budget-exhausted UNKNOWN would hide both a VIOLATED and a disagreement. The
    // budget is not what this test is about, so it gets a wide one.
    const report = await run(SENSOR(), { timeoutMs: 20_000 })
    const codes = projectReachability(report, 'doc.json').findings.map((f) => f.code)
    expect(codes).toContain('FND_REACHABILITY_VIOLATED')
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).not.toContain('FND_CERTIFICATE_DISAGREES')
  })

  it('solves the late-pinned bools by propagation, in either declaration order', () => {
    for (const lastFirst of [false, true]) {
      const document = LATE_PIN(lastFirst)
      const verdict = explicitCheck(
        prepareModel(document),
        predicateOf(document, 'valve = shut'),
        'none',
      )
      expect(verdict.status === 'violated' && verdict.states).toBe(1)
    }
  })

  it('the late-pinned reproducer yields no PROVED and no disagreement', async () => {
    const codes = projectReachability(await run(LATE_PIN()), 'doc.json').findings.map((f) => f.code)
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).not.toContain('FND_CERTIFICATE_DISAGREES')
  })

  it('solves an unbounded int that an initial equation defines', () => {
    const document = docOf(
      [
        { name: 'x', type: 'int', frame: 'volatile', initial: 'x = y + 1' },
        { name: 'y', type: 'int', frame: 'volatile', domain: { min: 0, max: 3 } },
      ],
      [effect(1, 'HOLD', 'x := x, y := y'), constraint(2, 'POS', 'x >= 1')],
    )
    expect(explicitCheck(prepareModel(document), predicateOf(document, 'x >= 1'), 'none')).toEqual({
      status: 'holds',
      states: 4,
    })
  })

  it('drops a defined value that falls outside its declared range', () => {
    // y is narrower, so it is branched and x is COMPUTED. y = 2 would define x = 4, outside
    // 0..3, so it is not an initial state, as in the Horn encoding.
    const document = docOf(
      [
        {
          name: 'x',
          type: 'int',
          frame: 'volatile',
          domain: { min: 0, max: 3 },
          initial: 'x = y + 2',
        },
        { name: 'y', type: 'int', frame: 'volatile', domain: { min: 0, max: 2 } },
      ],
      [effect(1, 'HOLD', 'x := x, y := y'), constraint(2, 'POS', 'x >= 1')],
    )
    expect(explicitCheck(prepareModel(document), predicateOf(document, 'x >= 1'), 'none')).toEqual({
      status: 'holds',
      states: 2,
    })
  })

  it('branches first on the variable the initial predicates mention most, in either declaration order', () => {
    // No definition here: `fi != g` and `not g` are not `x = e`. Only the order helps.
    // Branching `g` first lets each `fi != g` refute a wrong value at its own level.
    // Declaration order would put `g` last and examine 2^19 prefixes.
    const flags = FLAGS.slice(1)
    const variables: StateVariable[] = [
      ...flags.map(
        (name): StateVariable => ({
          name,
          type: 'bool',
          frame: 'volatile',
          initial: `${name} != g`,
        }),
      ),
      { name: 'g', type: 'bool', frame: 'volatile', initial: 'not g' },
    ]
    for (const ordered of [variables, [...variables].reverse()]) {
      const document = docOf(ordered, [
        effect(1, 'HOLD', `g := g, ${flags.map((f) => `${f} := ${f}`).join(', ')}`),
        constraint(2, 'C', 'not g'),
      ])
      expect(explicitCheck(prepareModel(document), predicateOf(document, 'not g'), 'none')).toEqual(
        { status: 'holds', states: 1 },
      )
    }
  })
})

describe('a cross-check that runs out of work WITHHOLDS the proof', () => {
  it('trips the work cap on the sum of nines, without claiming the model is large', () => {
    const document = SUM_OF_NINES()
    const verdict = explicitCheck(prepareModel(document), predicateOf(document, 'a = 9'), 'none')
    expect(verdict).toEqual({
      status: 'not-applicable',
      reason: `more than ${REACHABILITY_BFS_WORK_CAP} candidate initial assignments examined`,
      beyondCap: false,
    })
  })

  it('the tier withdraws that proof instead of reporting it unchecked', async () => {
    const result = (await run(SUM_OF_NINES())).results[0]
    expect(result?.verdict).toBe('UNKNOWN')
    expect(result?.crossCheck).toMatchObject({ status: 'not-applicable', beyondCap: false })
    const projection = projectReachability(await run(SUM_OF_NINES()), 'doc.json')
    const codes = projection.findings.map((f) => f.code)
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).toContain('FND_REACHABILITY_UNKNOWN')
    expect(projection.demotions.map((d) => d.reason)).toContain(
      'reachability-cross-check-incomplete',
    )
  })

  it('an initial predicate it cannot enumerate withholds too, but an independent unbounded int does not', () => {
    const tangled = docOf(
      [
        { name: 'x', type: 'int', frame: 'volatile', initial: 'x + y = 3' },
        { name: 'y', type: 'int', frame: 'volatile', domain: { min: 0, max: 3 } },
      ],
      [effect(1, 'HOLD', 'x := x, y := y'), constraint(2, 'C', 'y <= 3')],
    )
    expect(
      explicitCheck(prepareModel(tangled), predicateOf(tangled, 'y <= 3'), 'none'),
    ).toMatchObject({ status: 'not-applicable', beyondCap: false })
    const independent = docOf(
      [
        { name: 'x', type: 'int', frame: 'volatile', initial: 'x >= 0' },
        { name: 'y', type: 'int', frame: 'volatile', domain: { min: 0, max: 3 } },
      ],
      [effect(1, 'HOLD', 'x := x, y := y'), constraint(2, 'C', 'y <= 3')],
    )
    expect(
      explicitCheck(prepareModel(independent), predicateOf(independent, 'y <= 3'), 'none'),
    ).toMatchObject({ status: 'not-applicable', beyondCap: true })
  })
})

// ---------------------------------------------------------------------------
// 1d. Many distinct free sets: duplicates across them never withhold a small model
// ---------------------------------------------------------------------------

/**
 * The verifier's many-free-sets reproducer: {@link PAIR_BITS} bools, and one effect per PAIR
 * of them that flips that pair and writes the mode variables. Under the `none` frame each
 * effect leaves the other bools free, so every effect has a different free set. The
 * reachable space is every assignment of the bools with the valve ajar, plus the one state
 * OPEN reaches. The successors of ONE free set are distinct states, but the same state is a
 * successor under many free sets: the search generates about {@link PAIR_SUCCESSORS}
 * successors to find {@link PAIRS_STATES} states. That exceeded the single work valve the
 * search used to share between its phases, so a proof over a model under the state cap was
 * withheld, and a valve reported as `beyondCap` would have let a false proof through.
 * `opens` is what OPEN writes: `open` violates C1, `shut` keeps it. The verifier's version
 * also wrote a bounded int `c := c`, which only adds a range obligation per effect to the
 * solver's bill, so it is left out.
 */
const PAIR_BITS = Array.from({ length: 13 }, (_, i) => `b${i}`)
const PAIR_EFFECTS = PAIR_BITS.flatMap((bi, i) => PAIR_BITS.slice(i + 1).map((bj) => [bi, bj]))
const PAIRS_STATES = 2 ** PAIR_BITS.length + 1
/** Per free set: four post-state projections of the flipped pair, times 2^11 free values. */
const PAIR_SUCCESSORS = PAIR_EFFECTS.length * 4 * 2 ** (PAIR_BITS.length - 2)
const PAIRS = (opens: 'open' | 'shut' = 'open'): RequirementsDocument =>
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
        initial: 'valve = ajar',
      },
      ...PAIR_BITS.map(
        (name): StateVariable => ({
          name,
          type: 'bool',
          frame: 'volatile',
          initial: `${name} = false`,
        }),
      ),
    ],
    [
      ...PAIR_EFFECTS.map(([bi, bj], n) =>
        effect(
          n + 1,
          `E${bi}x${bj}`,
          `when valve = ajar: valve := valve, door := door, ${bi} := not ${bi}, ${bj} := not ${bj}`,
        ),
      ),
      effect(
        100,
        'OPEN',
        `when valve = ajar and ${PAIR_BITS.join(' and ')}: valve := ${opens}, door := door, ${PAIR_BITS.map((b) => `${b} := ${b}`).join(', ')}`,
      ),
      constraint(101, 'C1', 'valve = shut or valve = ajar'),
    ],
  )

describe('many distinct free sets under the state cap are cross-checked, not withheld', () => {
  const C1 = 'valve = shut or valve = ajar'

  it('sizes the pairs reproducer under the state cap, its duplicates past the initial-search valve, and inside the successor valve', () => {
    expect(PAIRS_STATES).toBeLessThanOrEqual(REACHABILITY_BFS_STATE_CAP)
    expect(PAIR_SUCCESSORS).toBeGreaterThan(REACHABILITY_BFS_WORK_CAP)
    expect(PAIR_SUCCESSORS).toBeLessThanOrEqual(REACHABILITY_BFS_SUCCESSOR_CAP)
  })

  it('enumerates every pairs state and proves C1 when OPEN shuts the valve', () => {
    const document = PAIRS('shut')
    expect(explicitCheck(prepareModel(document), predicateOf(document, C1), 'none')).toEqual({
      status: 'holds',
      states: PAIRS_STATES,
    })
  })

  it('finds the pairs violation two steps deep: one pair flip frees the rest, then OPEN', () => {
    const document = PAIRS()
    const verdict = explicitCheck(prepareModel(document), predicateOf(document, C1), 'none')
    expect(verdict.status).toBe('violated')
    if (verdict.status === 'violated') {
      expect(verdict.trace).toHaveLength(2)
      expect(verdict.trace[1]).toBe('OPEN')
      expect(verdict.path.at(-1)?.valve).toBe('open')
    }
  })

  it('the tier reports the shut-valve pairs proof PROVED with the cross-check AGREEING', async () => {
    // An explicit per-query budget, not the 2000 ms default. The claim is that the cross-check
    // AGREES with a proof, and Spacer needs the default's whole margin here: measured 3.1 s for
    // this case alone, and UNKNOWN under full-suite CPU contention on a 16-core box, which made
    // the assertion a load detector. 20 s is the budget the neighbouring case already measured.
    const result = (await run(PAIRS('shut'), { timeoutMs: 20_000 })).results[0]
    expect(result?.verdict).toBe('PROVED')
    expect(result?.crossCheck).toEqual({ status: 'agrees', states: PAIRS_STATES })
  })

  it('the pairs reproducer yields no PROVED and no disagreement', async () => {
    // Spacer spends its budget without a verdict here (measured: UNKNOWN at 20s too), so
    // this is the spec's sabotage gate: an encoder that reads `valve := open` as `shut`
    // proves C1, and only the explicit search, finishing, can refuse that proof.
    const codes = projectReachability(await run(PAIRS()), 'doc.json').findings.map((f) => f.code)
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).not.toContain('FND_CERTIFICATE_DISAGREES')
  })
})

/**
 * THE STEP VALVE's fixture: the pairs model with one effect per TRIPLE of bools, each
 * flipping its three and leaving the other ten free. Its reachable space is the
 * {@link TRIPLES_STATES} assignments of the bools, under the state cap. But it has so many
 * distinct free sets that the successors generated with duplicates,
 * {@link TRIPLE_SUCCESSORS}, pass {@link REACHABILITY_BFS_SUCCESSOR_CAP} (with the valve
 * raised, the search finishes and proves C1: measured). So the valve trips on a SMALL
 * model, which is exactly when it must withhold the proof rather than call the model large.
 */
const TRIPLE_EFFECTS = PAIR_BITS.flatMap((bi, i) =>
  PAIR_BITS.slice(i + 1).flatMap((bj, j) =>
    PAIR_BITS.slice(i + j + 2).map((bk) => [bi, bj, bk] as const),
  ),
)
const TRIPLES_STATES = 2 ** PAIR_BITS.length
/** Per free set: eight post-state projections of the flipped triple, times 2^10 free values. */
const TRIPLE_SUCCESSORS = TRIPLE_EFFECTS.length * 8 * 2 ** (PAIR_BITS.length - 3)
const TRIPLES = (): RequirementsDocument =>
  docOf(
    [
      {
        name: 'valve',
        type: 'enum',
        frame: 'volatile',
        domain: ['shut', 'ajar', 'open'],
        initial: 'valve = ajar',
      },
      ...PAIR_BITS.map(
        (name): StateVariable => ({
          name,
          type: 'bool',
          frame: 'volatile',
          initial: `${name} = false`,
        }),
      ),
    ],
    [
      ...TRIPLE_EFFECTS.map(([bi, bj, bk], n) =>
        effect(
          n + 1,
          `E${bi}x${bj}x${bk}`,
          `when valve = ajar: valve := valve, ${bi} := not ${bi}, ${bj} := not ${bj}, ${bk} := not ${bk}`,
        ),
      ),
      constraint(1000, 'C1', 'valve = shut or valve = ajar'),
    ],
  )

describe('the step valve trips only as a safety valve, and then WITHHOLDS the proof', () => {
  const C1 = 'valve = shut or valve = ajar'

  it('sizes the triples model under the state cap and its duplicates past the step valve', () => {
    expect(TRIPLES_STATES).toBeLessThanOrEqual(REACHABILITY_BFS_STATE_CAP)
    expect(TRIPLE_SUCCESSORS).toBeGreaterThan(REACHABILITY_BFS_SUCCESSOR_CAP)
  })

  it('trips the step valve on the triples model, without claiming the model is large', () => {
    const document = TRIPLES()
    expect(explicitCheck(prepareModel(document), predicateOf(document, C1), 'none')).toEqual({
      status: 'not-applicable',
      reason: `more than ${REACHABILITY_BFS_SUCCESSOR_CAP} successors to generate`,
      beyondCap: false,
    })
  })

  it('the tier withholds the triples proof instead of reporting it unchecked', async () => {
    const report = await run(TRIPLES())
    expect(report.results[0]?.verdict).toBe('UNKNOWN')
    expect(report.results[0]?.crossCheck).toMatchObject({
      status: 'not-applicable',
      beyondCap: false,
    })
    const projection = projectReachability(report, 'doc.json')
    const codes = projection.findings.map((f) => f.code)
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(codes).toContain('FND_REACHABILITY_UNKNOWN')
    expect(projection.demotions.map((d) => d.reason)).toContain(
      'reachability-cross-check-incomplete',
    )
  })
})

// ---------------------------------------------------------------------------
// 1e. A computed initial value obeys whichever bound is declared
// ---------------------------------------------------------------------------

/**
 * `x` is defined by `x = y - 5` and declares ONE bound. The Horn tier applies a lone bound
 * (`rangeConstraints` emits `x >= min` without a max), so the initial states are y in 5..10
 * for `{ min: 0 }`, and y in 0..5 for `{ max: 0 }`. A computed value outside the lone bound
 * is not an initial state: counting one would fabricate a violation of a valid proof.
 */
const HALF_BOUNDED = (bound: { readonly min: number } | { readonly max: number }, c: string) =>
  docOf(
    [
      {
        name: 'y',
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: 10 },
        initial: 'y <= 10',
      },
      { name: 'x', type: 'int', frame: 'volatile', domain: bound, initial: 'x = y - 5' },
    ],
    [effect(1, 'NEVER', 'when y > 100: x := x, y := y'), constraint(2, 'C', c)],
  )

/**
 * The verifier's ledger reproducer, a consistent document: `remaining >= 0` (a lone bound)
 * and `remaining = budget - spent` force `spent <= budget` initially, and AUDIT writes every
 * variable. 51 initial states (spent 0..50), each audited or not.
 */
const LEDGER = (): RequirementsDocument =>
  docOf(
    [
      {
        name: 'budget',
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: 100 },
        initial: 'budget = 50',
      },
      {
        name: 'spent',
        type: 'int',
        frame: 'volatile',
        domain: { min: 0, max: 100 },
        initial: 'spent <= 100',
      },
      {
        name: 'remaining',
        type: 'int',
        frame: 'volatile',
        domain: { min: 0 },
        initial: 'remaining = budget - spent',
      },
      { name: 'audited', type: 'bool', frame: 'volatile', initial: 'audited = false' },
    ],
    [
      effect(
        1,
        'AUDIT',
        'when audited = false: audited := true, budget := budget, spent := spent, remaining := remaining',
      ),
      constraint(2, 'C1', 'spent <= budget'),
    ],
  )

describe('a computed initial value obeys a lone declared bound, as in the Horn encoding', () => {
  it('drops a defined value below a lone min', () => {
    const document = HALF_BOUNDED({ min: 0 }, 'x >= 0')
    expect(explicitCheck(prepareModel(document), predicateOf(document, 'x >= 0'), 'none')).toEqual({
      status: 'holds',
      states: 6,
    })
  })

  it('drops a defined value above a lone max', () => {
    const document = HALF_BOUNDED({ max: 0 }, 'x <= 0')
    expect(explicitCheck(prepareModel(document), predicateOf(document, 'x <= 0'), 'none')).toEqual({
      status: 'holds',
      states: 6,
    })
  })

  it('the ledger proof is PROVED with the cross-check AGREEING, and nothing is an error', async () => {
    const report = await run(LEDGER())
    expect(report.results[0]?.verdict).toBe('PROVED')
    expect(report.results[0]?.crossCheck).toEqual({ status: 'agrees', states: 102 })
    const findings = projectReachability(report, 'doc.json').findings
    expect(findings.map((f) => f.code)).not.toContain('FND_CERTIFICATE_DISAGREES')
    expect(findings.filter((f) => f.severity === 'error')).toEqual([])
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
 *
 * Each variable's `frame` is drawn from a SEPARATE stream, so adding it left every other
 * draw of every seed as it was. A bounded int's `+ 1` / `- 1` writes leave its 0..2 range,
 * which is the shape where a free variable's semantics decide whether the frames nest.
 */
const randomModel = (seed: number): RequirementsDocument => {
  const r = rng(seed)
  const frames = rng(seed ^ 0x5eed)
  const frame = (): StateVariable['frame'] => (frames() < 0.5 ? 'stable' : 'volatile')
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
        frame: frame(),
        initial: `${name} = ${pick(['true', 'false'])}`,
      })
    } else if (kind === 'int') {
      variables.push({
        name,
        type: 'int',
        frame: frame(),
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
        frame: frame(),
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

/**
 * One random OVERFLOW model: two or three ints declared 0..2 with random frames. Each may
 * count up inside its range, overflow (`when n = 2: n := n + 1`), or underflow
 * (`when n = 0: n := n - 1`), and a write may be guarded on another variable's value.
 * Every write is guarded at a bound, so every value stays in -1..3 and the reachable set is a few dozen states. `C0`
 * forbids two out-of-range values at once; `C1` mixes in-range and out-of-range tests.
 *
 * The shape where a FREE variable's reading decides whether the frames nest: with nothing
 * pinned every in-range value is already reachable, so a proof can be wrong only over values
 * that ONLY writes produce — two out-of-range values at once, or one beside a pinned write.
 * {@link randomModel} draws at most one int and never builds it.
 */
const overflowModel = (seed: number): RequirementsDocument => {
  const r = rng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T
  const count = 2 + Math.floor(r() * 2)
  const names = Array.from({ length: count }, (_, i) => `n${i}`)
  const variables: StateVariable[] = names.map((name) => ({
    name,
    type: 'int',
    frame: pick(['stable', 'volatile'] as const),
    domain: { min: 0, max: 2 },
    initial: `${name} = ${pick(['0', '1', '2'])}`,
  }))
  const at = (name: string): string =>
    pick([`${name} >= 3`, `${name} < 0`, `${name} = 2`, `${name} = 0`])
  const requirements: Requirement[] = []
  const add = (stateEffect: string) =>
    requirements.push(effect(requirements.length + 1, `E${requirements.length}`, stateEffect))
  const beyond = (name: string): string => pick([`${name} >= 3`, `${name} < 0`])
  for (const name of names) {
    if (r() < 0.6) add(`when ${name} < 2: ${name} := ${name} + 1`)
    if (r() < 0.8) add(`when ${name} = 2: ${name} := ${name} + 1`)
    if (r() < 0.4) add(`when ${name} = 0: ${name} := ${name} - 1`)
    if (r() < 0.4) add(`when ${at(pick(names))}: ${name} := ${pick(['0', '2'])}`)
  }
  if (requirements.length === 0) add(`when n0 = 2: n0 := n0 + 1`)
  const two = (): readonly [string, string] => {
    const first = pick(names)
    return [first, pick(names.filter((n) => n !== first))]
  }
  const [a, b] = two()
  const [c, d] = two()
  requirements.push(constraint(20, 'C0', `not (${beyond(a)} and ${beyond(b)})`))
  requirements.push(constraint(21, 'C1', `${at(c)} or ${at(d)}`))
  return docOf(variables, requirements)
}

/**
 * Every way the Horn tier and the explicit search can be caught disagreeing on one model.
 *
 * - A proof the tier's own cross-check refuted.
 * - A VIOLATED the `full` search, where every step is requirement-sanctioned, cannot reach.
 * - THE FRAMES NEST: a proof under a weaker frame must hold under every stronger one. The
 *   `full` search leaves nothing free, so it is the one oracle here that does not share the
 *   two checkers' reading of a free variable. A search that re-decides a proof under its
 *   OWN frame agrees with an encoding both got wrong the same way, and that is how a
 *   `none` run that redrew an out-of-range value inside its range reported PROVED over a
 *   violation reachable under every frame.
 */
const disagreementsIn = async (
  seed: number,
  document: RequirementsDocument,
): Promise<readonly string[]> => {
  const found: string[] = []
  const report = await run(document)
  const prepared = prepareModel(document)
  for (const result of report.results) {
    if (result.crossCheck?.status === 'disagrees') {
      found.push(`seed ${seed} ${result.label}: the Horn tier's proof was refuted`)
    }
    const predicate = prepared.constraints.find((c) => c.label === result.label)?.predicate
    if (predicate === undefined) continue
    if (result.verdict === 'VIOLATED') {
      if (explicitCheck(prepared, predicate, 'full').status === 'holds') {
        found.push(`seed ${seed} ${result.label}: VIOLATED but the search says it holds`)
      }
    }
    const stronger: readonly ('declared' | 'full')[] =
      result.verdict === 'PROVED'
        ? ['declared', 'full']
        : result.verdict === 'PROVED_UNDER_HYPOTHESES'
          ? ['full']
          : []
    for (const frame of stronger) {
      const confirm = explicitCheck(prepared, predicate, frame)
      if (confirm.status === 'violated') {
        found.push(
          `seed ${seed} ${result.label}: ${result.verdict} but the ${frame} search reaches a violation via ${confirm.trace.join(' -> ')}`,
        )
      }
    }
    // The search's OWN frames nest too: a violation it reaches under a stronger frame it
    // reaches under every weaker one. Without this, a search that drops states under a weak
    // frame only ever AGREES with a correct proof, and nothing above can see it.
    const weakestFirst = ['none', 'declared', 'full'] as const
    const bySearch = weakestFirst.map((frame) => explicitCheck(prepared, predicate, frame).status)
    for (let weak = 0; weak < weakestFirst.length; weak += 1) {
      for (let strong = weak + 1; strong < weakestFirst.length; strong += 1) {
        if (bySearch[strong] === 'violated' && bySearch[weak] === 'holds') {
          found.push(
            `seed ${seed} ${result.label}: the search reaches a violation under ${weakestFirst[strong]} but not under ${weakestFirst[weak]}`,
          )
        }
      }
    }
  }
  return found
}

describe('DIFFERENTIAL — the Horn tier and the explicit search never disagree', () => {
  const SEEDS = Array.from({ length: 16 }, (_, i) => 7001 + i)
  const OVERFLOW_SEEDS = Array.from({ length: 24 }, (_, i) => 9001 + i)

  it(`agrees on ${SEEDS.length} seeded random models, confirms every VIOLATED, and every proof under every stronger frame`, async () => {
    const disagreements: string[] = []
    for (const seed of SEEDS)
      disagreements.push(...(await disagreementsIn(seed, randomModel(seed))))
    expect(disagreements).toEqual([])
  }, 120_000)

  it(`agrees on ${OVERFLOW_SEEDS.length} seeded overflow models, where a free variable's reading decides whether the frames nest`, async () => {
    const disagreements: string[] = []
    for (const seed of OVERFLOW_SEEDS) {
      disagreements.push(...(await disagreementsIn(seed, overflowModel(seed))))
    }
    expect(disagreements).toEqual([])
  }, 120_000)
})
