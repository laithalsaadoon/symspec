/**
 * `verified` never certifies what the solver did not compare (spec 007, Story 3).
 *
 * Every case here drives `runCheck` directly, because the claim under test is the
 * pipeline's: a tier can return correct findings and the run can still certify a
 * document the solver never decided. Each fixture carries a CONTROL — the same
 * document without the defect the case is about — so an assertion that passes cannot
 * be passing because the fixture never reached the branch.
 *
 * The embedder is a hand-built ORTHOGONAL table (every distinct text is its own unit
 * vector, so every cross-text cosine is 0). That keeps the semantic tier running —
 * its absence is itself a demotion — while guaranteeing it proposes nothing, so the
 * demotion list each case reads is exactly the one the case is about.
 */

import { describe, expect, it } from 'vitest'
import type { Embedder } from '../formal/embed.ts'
import { type CheckOptions, runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'

/** One-hot vectors keyed on the exact text: distinct texts are orthogonal. */
const orthogonalEmbedder = (): Embedder => {
  const index = new Map<string, number>()
  const DIM = 64
  return async (texts) =>
    texts.map((t) => {
      if (!index.has(t)) index.set(t, index.size)
      const v = new Float32Array(DIM)
      v[(index.get(t) as number) % DIM] = 1
      return v
    })
}

const SEMANTIC = (): Pick<CheckOptions, 'semantic'> => ({
  semantic: { embedder: orthogonalEmbedder() },
})

interface ReqSpec {
  readonly id: string
  readonly systemName: string
  readonly systemResponse: string
  readonly trigger?: string
  readonly preCondition?: string
  readonly negated?: boolean
}

const sentenceOf = (r: ReqSpec): string => {
  const lead = [
    ...(r.preCondition !== undefined ? [`While ${r.preCondition}`] : []),
    ...(r.trigger !== undefined ? [`when ${r.trigger}`] : []),
  ].join(', ')
  const body = `the ${r.systemName} shall ${r.negated === true ? 'not ' : ''}${r.systemResponse}.`
  if (lead === '') return body.charAt(0).toUpperCase() + body.slice(1)
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}, ${body}`
}

const reqOf = (r: ReqSpec) => ({
  id: r.id,
  patternType:
    r.trigger !== undefined
      ? ('event-driven' as const)
      : r.preCondition !== undefined
        ? ('state-driven' as const)
        : ('ubiquitous' as const),
  systemName: r.systemName,
  systemResponse: r.systemResponse,
  ...(r.trigger !== undefined ? { trigger: r.trigger } : {}),
  ...(r.preCondition !== undefined ? { preCondition: r.preCondition } : {}),
  negated: r.negated === true,
  sentence: sentenceOf(r),
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

const docOf = (reqs: readonly ReqSpec[]) =>
  ({
    requirements: Object.fromEntries(reqs.map((r) => [r.id, reqOf(r)])),
    glossary: [],
    antonyms: [],
    waivers: [],
    terms: [],
    stateModel: { variables: [] },
  }) as never

const reasons = (report: Awaited<ReturnType<typeof runCheck>>) =>
  report.coverage.demotions.map((d) => d.reason)

// ---------------------------------------------------------------------------
// AC-3-4 — an `unknown` anywhere in the contradiction enumeration demotes
// ---------------------------------------------------------------------------

/**
 * Two independent conflicts, each in its own context group: a gate pair under one trigger
 * and a door pair under another. Explicit `shall not` on both, so neither conflict rests on
 * a seeded antonym table another tier may re-encode.
 */
const R1 = 'req-1-gate-lower'
const R2 = 'req-2-gate-not-lower'
const R3 = 'req-3-door-open'
const R4 = 'req-4-door-not-open'
const twoConflictDoc = () =>
  docOf([
    {
      id: R1,
      systemName: 'gate controller',
      trigger: 'the train approaches',
      systemResponse: 'lower the barrier',
    },
    {
      id: R2,
      systemName: 'gate controller',
      trigger: 'the train approaches',
      systemResponse: 'lower the barrier',
      negated: true,
    },
    {
      id: R3,
      systemName: 'door controller',
      trigger: 'the passenger presses the open button',
      systemResponse: 'open the door',
    },
    {
      id: R4,
      systemName: 'door controller',
      trigger: 'the passenger presses the open button',
      systemResponse: 'open the door',
      negated: true,
    },
  ])

/**
 * Forces `unknown` for every enumeration call in the door group and nothing else. A real
 * `--timeout-ms 1` cannot isolate this branch: it makes the needs-review tier's own solve
 * unknown too, and that tier's `inconclusive-group` demotion would then hide whether THIS
 * one fired. The needs-review tier here runs on the real solver and decides the door group
 * (`unsat`), which is exactly the "separate solve" the spec says must not be relied on.
 */
const unknownForDoorGroup: NonNullable<CheckOptions['contradictionCheck']> = async (
  solver,
  assumptions,
  group,
) =>
  group.contextAtoms.some((a) => a.includes('door_controller'))
    ? 'unknown'
    : solver.check(...assumptions)

describe('AC-3-4: a solver unknown inside the contradiction enumeration', () => {
  it('control: both conflicts are found and nothing demotes', async () => {
    const report = await runCheck(twoConflictDoc(), SEMANTIC())
    expect(
      report.findings.filter((f) => f.code === 'FND_CONTRADICTION').map((f) => f.requirementIds),
    ).toEqual([
      [R1, R2],
      [R3, R4],
    ])
    expect(report.coverage.demotions).toEqual([])
    expect(report.verified).toBe(true)
  })

  it('records a solver-unknown demotion naming the undecided group', async () => {
    const report = await runCheck(twoConflictDoc(), {
      ...SEMANTIC(),
      contradictionCheck: unknownForDoorGroup,
    })
    // Premise: the door conflict really was lost, and the needs-review tier's separate solve
    // did NOT disclose it — otherwise a green run here could be that tier's demotion.
    expect(
      report.findings.filter((f) => f.code === 'FND_CONTRADICTION').map((f) => f.requirementIds),
    ).toEqual([[R1, R2]])
    expect(report.findings.map((f) => f.code)).not.toContain('FND_NEEDS_REVIEW')
    expect(reasons(report)).not.toContain('inconclusive-group')

    const unknown = report.coverage.demotions.filter((d) => d.reason === 'solver-unknown')
    expect(unknown.map((d) => d.requirementIds)).toEqual([[R3, R4]])
    expect(unknown[0]?.action).toContain('--timeout-ms')
    expect(report.verified).toBe(false)
  })

  it('records an unknown that arrives AFTER the group already yielded one conflict', async () => {
    // The `--timeout-ms 2` shape from the review: one group hosting two disjoint conflicts,
    // where the first check is `unsat` and the re-check for the second conflict is not
    // decided. The first conflict is reported, so the run looks like it did its job — and
    // the second conflict was never looked for.
    const trigger = 'the operator presses the button'
    const doc = docOf([
      { id: 'g-a', systemName: 'station controller', trigger, systemResponse: 'open the door' },
      {
        id: 'g-b',
        systemName: 'station controller',
        trigger,
        systemResponse: 'open the door',
        negated: true,
      },
      { id: 'g-c', systemName: 'station controller', trigger, systemResponse: 'sound the chime' },
      {
        id: 'g-d',
        systemName: 'station controller',
        trigger,
        systemResponse: 'sound the chime',
        negated: true,
      },
    ])
    const calls = new Map<string, number>()
    const firstOnly: NonNullable<CheckOptions['contradictionCheck']> = async (s, a, g) => {
      const n = (calls.get(g.key) ?? 0) + 1
      calls.set(g.key, n)
      return n === 1 || g.contextAtoms.length === 0 ? s.check(...a) : 'unknown'
    }
    const control = await runCheck(doc, SEMANTIC())
    expect(control.findings.filter((f) => f.code === 'FND_CONTRADICTION')).toHaveLength(2)
    expect(reasons(control)).not.toContain('solver-unknown')

    const report = await runCheck(doc, { ...SEMANTIC(), contradictionCheck: firstOnly })
    expect(report.findings.filter((f) => f.code === 'FND_CONTRADICTION')).toHaveLength(1)
    expect(
      report.coverage.demotions
        .filter((d) => d.reason === 'solver-unknown')
        .map((d) => d.requirementIds),
    ).toEqual([['g-a', 'g-b', 'g-c', 'g-d']])
    expect(report.verified).toBe(false)
  })
})

describe('AC-3-4: a solver unknown in the temporal tier', () => {
  /** A temporal check at a large bound, cut at 1ms: the encoding alone is thousands of terms,
   * so the solver cannot decide it inside the timeout on any machine. */
  const temporalDoc = () =>
    docOf([
      {
        id: 't-a',
        systemName: 'audit logger',
        trigger: 'a disk write error occurs',
        systemResponse: 'record the event',
      },
      {
        id: 't-b',
        systemName: 'audit logger',
        trigger: 'the operator clears the log',
        systemResponse: 'record the event',
        negated: true,
      },
      { id: 't-c', systemName: 'audit logger', systemResponse: 'flush the buffer' },
    ])
  const temporalUnknowns = (report: Awaited<ReturnType<typeof runCheck>>) =>
    report.coverage.demotions.filter(
      (d) => d.reason === 'solver-unknown' && d.action.includes('temporal tier'),
    )

  it('control: at the default timeout the temporal check decides, and nothing is disclosed', async () => {
    const report = await runCheck(temporalDoc(), { ...SEMANTIC(), temporal: { bound: 60 } })
    expect(temporalUnknowns(report)).toEqual([])
  })

  it('records a solver-unknown demotion naming every requirement the check covered', async () => {
    const report = await runCheck(temporalDoc(), {
      ...SEMANTIC(),
      temporal: { bound: 60 },
      timeoutMs: 1,
    })
    expect(temporalUnknowns(report).map((d) => d.requirementIds)).toEqual([['t-a', 't-b', 't-c']])
    expect(report.verified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC-3-1 / AC-3-2 — participation is co-liveness, and a conditional conflict demotes
// ---------------------------------------------------------------------------

/**
 * The canonical feature-interaction conflict: a passenger may open the door; the door may
 * not open while the train moves. Both constrain one response atom at opposite polarity, and
 * because their guards differ no context group asserts both — the solver never asks whether
 * they can hold at once. The chime pair doubles it, so a fix that special-cases one pair
 * cannot pass.
 */
const D1 = 'door-1-open-on-button'
const D2 = 'door-2-not-open-moving'
const C1 = 'door-3-chime-on-button'
const C2 = 'door-4-no-chime-moving'
const PRESS = 'the passenger presses the open button'
const MOVING = 'the train is moving'
const doorTrainDoc = () =>
  docOf([
    { id: D1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
    {
      id: D2,
      systemName: 'door controller',
      preCondition: MOVING,
      systemResponse: 'open the door',
      negated: true,
    },
    { id: C1, systemName: 'door controller', trigger: PRESS, systemResponse: 'sound the chime' },
    {
      id: C2,
      systemName: 'door controller',
      preCondition: MOVING,
      systemResponse: 'sound the chime',
      negated: true,
    },
  ])

/** Just the door pair: nothing else shares a guard with either requirement. */
const doorPairDoc = () =>
  docOf([
    { id: D1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
    {
      id: D2,
      systemName: 'door controller',
      preCondition: MOVING,
      systemResponse: 'open the door',
      negated: true,
    },
  ])

const conditional = (report: Awaited<ReturnType<typeof runCheck>>) =>
  report.coverage.demotions.filter((d) => d.reason === 'conditional-conflict-unchecked')

describe('AC-3-1: a requirement participates only when co-live with a peer in a decided group', () => {
  it('sharing a response atom across two guards that never meet is NOT participation', async () => {
    const report = await runCheck(doorPairDoc(), SEMANTIC())
    // Premise: the response atom is shared and only the two guards are singletons, so the
    // pre-AC-3-1 predicate ("shares an atom") would mark both as compared.
    expect(report.residualRisk.unmatchedAtoms).toBe(2)
    expect(report.coverage.requirements.map((r) => [r.id, r.participates])).toEqual([
      [D1, false],
      [D2, false],
    ])
    expect(reasons(report).filter((r) => r === 'uncovered-requirement')).toHaveLength(2)
    // The row must not hand out vocabulary advice to requirements that already share it.
    for (const row of report.coverage.requirements) {
      expect(row.suggestion).not.toMatch(/share guard\/response vocabulary/i)
    }
  })

  it('co-live requirements that share an atom DO participate', async () => {
    // One trigger, two different responses: both live in the one group, sharing its guard.
    const report = await runCheck(
      docOf([
        {
          id: 'p-a',
          systemName: 'door controller',
          trigger: PRESS,
          systemResponse: 'open the door',
        },
        {
          id: 'p-b',
          systemName: 'door controller',
          trigger: PRESS,
          systemResponse: 'sound the chime',
        },
      ]),
      SEMANTIC(),
    )
    expect(report.coverage.requirements.map((r) => r.participates)).toEqual([true, true])
    expect(report.coverage.demotions).toEqual([])
    expect(report.verified).toBe(true)
  })

  it('co-liveness in a group the solver did NOT decide is not participation', async () => {
    const report = await runCheck(twoConflictDoc(), {
      ...SEMANTIC(),
      contradictionCheck: unknownForDoorGroup,
    })
    const byId = new Map(report.coverage.requirements.map((r) => [r.id, r.participates]))
    // The gate pair was decided (and conflicts); the door pair was only co-live in a group
    // whose every check came back unknown.
    expect([byId.get(R1), byId.get(R2), byId.get(R3), byId.get(R4)]).toEqual([
      true,
      true,
      false,
      false,
    ])
  })
})

describe('AC-3-2: opposite polarity on one response atom under guards no checked group joins', () => {
  it('demotes with conditional-conflict-unchecked, naming both ids and the union of contexts', async () => {
    const report = await runCheck(doorTrainDoc(), { ...SEMANTIC(), strict: true })
    // Premise: the decide tier reports nothing — this is the `verified: true` of the review.
    expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
    // And every requirement DOES participate — each is co-live with its sibling under the
    // same guard — so participation alone cannot demote this document. The pair demotion is
    // the only thing standing between it and `verified: true`.
    expect(report.coverage.requirements.map((r) => r.participates)).toEqual([
      true,
      true,
      true,
      true,
    ])
    expect(reasons(report).filter((r) => r !== 'conditional-conflict-unchecked')).toEqual([])

    const demotions = conditional(report)
    expect(demotions.map((d) => d.requirementIds)).toEqual([
      [D1, D2],
      [C1, C2],
    ])
    for (const d of demotions) {
      expect(d.action).toContain(PRESS)
      expect(d.action).toContain(MOVING)
      // The one repair that would be wrong: the requirements already share their vocabulary.
      expect(d.action).not.toMatch(/align vocabulary/i)
    }
    expect(report.verified).toBe(false)
    expect(report.strictGate).toBe('fail')
  })

  it('on the bare door pair, no demotion tells the author to align vocabulary it already shares', async () => {
    // Two requirements and no sibling, so `pairsChecked` is 0 and the run is also
    // inconclusive — the `no-decide-tier-comparison` demotion fires beside the pair demotion,
    // and its generic advice ("align vocabulary") would be the wrong remedy here too.
    const report = await runCheck(doorPairDoc(), SEMANTIC())
    expect(conditional(report).map((d) => d.requirementIds)).toEqual([[D1, D2]])
    expect(reasons(report)).toContain('no-decide-tier-comparison')
    for (const d of report.coverage.demotions) expect(d.action).not.toMatch(/align vocabulary/i)
  })

  it('does not fire once a checked group makes both live — the solver then decides the pair', async () => {
    // Nest the guards: the forbidding rule now carries the button press too, so the group
    // {press, moving} has both obligations live and the conflict becomes a proof.
    const report = await runCheck(
      docOf([
        { id: D1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
        {
          id: D2,
          systemName: 'door controller',
          preCondition: MOVING,
          trigger: PRESS,
          systemResponse: 'open the door',
          negated: true,
        },
      ]),
      SEMANTIC(),
    )
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
    expect(conditional(report)).toEqual([])
  })

  it('does not fire for SAME-polarity pairs, which cannot conflict with each other', async () => {
    const report = await runCheck(
      docOf([
        { id: D1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
        {
          id: D2,
          systemName: 'door controller',
          preCondition: MOVING,
          systemResponse: 'open the door',
        },
      ]),
      SEMANTIC(),
    )
    expect(conditional(report)).toEqual([])
  })

  it('does not fire across two systems, whose atoms are distinct', async () => {
    const report = await runCheck(
      docOf([
        { id: D1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
        {
          id: D2,
          systemName: 'hatch controller',
          preCondition: MOVING,
          systemResponse: 'open the door',
          negated: true,
        },
      ]),
      SEMANTIC(),
    )
    expect(conditional(report)).toEqual([])
  })
})
