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
import { DEFAULT_SEMANTIC_THRESHOLD, differsOnlyByInflection } from '../formal/semantic.ts'
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

/**
 * AC-3-2 read in the AC-2-1 contrary model. An antonym pair is two DISTINCT atoms under the
 * axiom `¬(A ∧ B)`, so "open the door" under the button press and "close the door" while the
 * train is moving share no atom and neither is negated — yet they would conflict wherever both
 * guards hold, exactly as the `shall not open` form does. "Would conflict" is the AC-3-6 rule
 * (`wouldConflict` in `formal/semantic.ts`): one atom at opposite polarity, or both asserted on
 * opposite sides of one opposition key, and "do neither" (both negated) is consistent.
 */
describe('AC-3-2: contraries under guards no checked group joins (AC-2-1)', () => {
  /** The door/train document with `second` as the moving-train response. */
  const contraryDoc = (
    second: string,
    o: { negated?: boolean; firstNegated?: boolean; antonyms?: readonly object[] } = {},
  ) => {
    const doc = docOf([
      {
        id: D1,
        systemName: 'door controller',
        trigger: PRESS,
        systemResponse: 'open the door',
        negated: o.firstNegated === true,
      },
      {
        id: D2,
        systemName: 'door controller',
        preCondition: MOVING,
        systemResponse: second,
        negated: o.negated === true,
      },
      { id: C1, systemName: 'door controller', trigger: PRESS, systemResponse: 'sound the chime' },
      {
        id: C2,
        systemName: 'door controller',
        preCondition: MOVING,
        systemResponse: 'show the warning light',
      },
    ]) as unknown as { antonyms: unknown[] }
    doc.antonyms = [...(o.antonyms ?? [])]
    return doc as never
  }

  it('demotes a SEEDED contrary pair ("open" / "close"), naming both ids and the union of contexts', async () => {
    const report = await runCheck(contraryDoc('close the door'), { ...SEMANTIC(), strict: true })
    // Premise: nothing is proven and every requirement participates through its sibling, so
    // without the pair demotion this is the `verified: true` of the review.
    expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
    expect(report.coverage.requirements.every((r) => r.participates)).toBe(true)
    const demotions = conditional(report)
    expect(demotions.map((d) => d.requirementIds)).toEqual([[D1, D2]])
    const [d] = demotions
    expect(d?.action).toContain(PRESS)
    expect(d?.action).toContain(MOVING)
    expect(d?.action).toContain('"open the door"')
    expect(d?.action).toContain('"close the door"')
    // Negative guard: a contrary pair is not "the same response at opposite polarity".
    expect(d?.action).not.toMatch(/the same response/)
    expect(reasons(report)).toEqual(['conditional-conflict-unchecked'])
    expect(report.verified).toBe(false)
    expect(report.strictGate).toBe('fail')
  })

  it('demotes a DOC-committed contrary pair ("open" / "shut")', async () => {
    const report = await runCheck(
      contraryDoc('shut the door', { antonyms: [{ a: 'open', b: 'shut' }] }),
      SEMANTIC(),
    )
    expect(conditional(report).map((d) => d.requirementIds)).toEqual([[D1, D2]])
    expect(report.verified).toBe(false)
  })

  it('control: without the committed pair, "shut" is just another verb', async () => {
    const report = await runCheck(contraryDoc('shut the door'), SEMANTIC())
    expect(conditional(report)).toEqual([])
    expect(report.verified).toBe(true)
  })

  it('control: a contrary pair with one side NEGATED does not demote ("open" and "not close")', async () => {
    const report = await runCheck(contraryDoc('close the door', { negated: true }), SEMANTIC())
    expect(conditional(report)).toEqual([])
    expect(report.verified).toBe(true)
  })

  it('control: BOTH sides negated does not demote — "do neither" is consistent', async () => {
    const report = await runCheck(
      contraryDoc('close the door', { negated: true, firstNegated: true }),
      SEMANTIC(),
    )
    expect(conditional(report)).toEqual([])
    expect(report.verified).toBe(true)
  })

  it('is monotone: restating "shall not open" as the stronger "shall close" keeps the demotion', async () => {
    const weak = await runCheck(contraryDoc('open the door', { negated: true }), SEMANTIC())
    const strong = await runCheck(contraryDoc('close the door'), SEMANTIC())
    expect(conditional(weak).map((d) => d.requirementIds)).toEqual([[D1, D2]])
    expect(conditional(strong).map((d) => d.requirementIds)).toEqual([[D1, D2]])
  })

  it('does not fire once a checked group makes both live — the solver then proves the pair', async () => {
    const doc = docOf([
      { id: D1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
      {
        id: D2,
        systemName: 'door controller',
        preCondition: MOVING,
        trigger: PRESS,
        systemResponse: 'close the door',
      },
    ])
    const report = await runCheck(doc, SEMANTIC())
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
    expect(conditional(report)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// AC-3-6 — an opposite-polarity pair that differs only in inflection or number
// ---------------------------------------------------------------------------

/**
 * A hand-authored vector table: texts listed in the same group embed to one unit vector
 * (cosine 1), every other text is orthogonal. The stub's cosines are a hash, so a
 * threshold-crossing case has to state its cosines rather than hope for them.
 */
const tableEmbedder = (groups: readonly (readonly string[])[]): Embedder => {
  const DIM = 64
  const groupOf = new Map<string, number>()
  groups.forEach((g, i) => {
    for (const t of g) groupOf.set(t, i)
  })
  const fresh = new Map<string, number>()
  return async (texts) =>
    texts.map((t) => {
      const v = new Float32Array(DIM)
      const g = groupOf.get(t)
      if (g !== undefined) v[g] = 1
      else {
        if (!fresh.has(t)) fresh.set(t, groups.length + fresh.size)
        v[(fresh.get(t) as number) % DIM] = 1
      }
      return v
    })
}

const P1 = 'para-1-open-door'
const P2 = 'para-2-not-open-doors'
const paraDoc = (o: { second?: string; negated?: boolean } = {}) =>
  docOf([
    { id: P1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
    {
      id: P2,
      systemName: 'door controller',
      trigger: PRESS,
      systemResponse: o.second ?? 'open the doors',
      negated: o.negated ?? true,
    },
  ])
const nearDuplicate = (report: Awaited<ReturnType<typeof runCheck>>) =>
  report.coverage.demotions.filter((d) => d.reason === 'opposite-polarity-near-duplicate')

describe('AC-3-6: opposite polarity, same words up to inflection or number', () => {
  const embedder = () =>
    tableEmbedder([
      ['open the door', 'open the doors'],
      ['open the door ', 'unlock the door'],
    ])

  it('demotes until the pair is aliased or declared distinct', async () => {
    const report = await runCheck(paraDoc(), { semantic: { embedder: embedder() } })
    // Premise: the semantic tier proposed the merge, and nothing else demotes — the two
    // are co-live under one trigger, so without this demotion the run certifies.
    expect(report.findings.map((f) => f.code)).toContain('FND_SIMILAR_SEMANTIC')
    expect(report.findings.map((f) => f.code)).not.toContain('FND_CONTRADICTION')
    expect(nearDuplicate(report).map((d) => d.requirementIds)).toEqual([[P1, P2]])
    expect(reasons(report)).toEqual(['opposite-polarity-near-duplicate'])
    expect(report.verified).toBe(false)
  })

  it('control: the SAME polarity pair proposes the merge but does not demote', async () => {
    const report = await runCheck(paraDoc({ negated: false }), {
      semantic: { embedder: embedder() },
    })
    expect(report.findings.map((f) => f.code)).toContain('FND_SIMILAR_SEMANTIC')
    expect(nearDuplicate(report)).toEqual([])
  })

  it('control: opposite polarity over DIFFERENT words does not demote on this rule', async () => {
    const report = await runCheck(
      docOf([
        { id: P1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door ' },
        {
          id: P2,
          systemName: 'door controller',
          trigger: PRESS,
          systemResponse: 'unlock the door',
          negated: true,
        },
      ]),
      { semantic: { embedder: embedder() } },
    )
    expect(report.findings.map((f) => f.code)).toContain('FND_SIMILAR_SEMANTIC')
    expect(nearDuplicate(report)).toEqual([])
  })

  it('is discharged by the alias, which turns the pair into a proof', async () => {
    const doc = paraDoc() as unknown as { glossary: unknown[] }
    doc.glossary = [{ canonical: 'open the door', aliases: ['open the doors'] }]
    const report = await runCheck(doc as never, { semantic: { embedder: embedder() } })
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
    expect(nearDuplicate(report)).toEqual([])
  })

  it('is discharged by a waiver of the proposal (declared distinct)', async () => {
    const doc = paraDoc() as unknown as { waivers: unknown[] }
    doc.waivers = [
      {
        code: 'FND_SIMILAR_SEMANTIC',
        requirementId: P2,
        reason: 'distinct: a single door vs the whole set',
        createdAt: TS,
      },
    ]
    const report = await runCheck(doc as never, { semantic: { embedder: embedder() } })
    expect(nearDuplicate(report)).toEqual([])
  })
})

/**
 * The inflection test reads the CANONICAL response atoms, not the raw text. Under spec 007
 * AC-2-1 an antonym pair is two contrary atoms, `¬(A ∧ B)`, so "open the door" / "close the
 * doors" are the same words up to number once read in opposition-key space (`close_the_door` /
 * `close_the_doors`), and would conflict as one thing exactly when BOTH are asserted: the
 * conflict half is read off the atoms' polarity and class side, and the words half off the keys,
 * or a contrary head never matches its partner's surface verb.
 */
describe('AC-3-6: the inflection test runs in the atomizer canonical space', () => {
  const antonymDoc = (second: string, negated: boolean, antonyms: readonly object[] = []) => {
    const doc = docOf([
      { id: P1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
      { id: P2, systemName: 'door controller', trigger: PRESS, systemResponse: second, negated },
    ]) as unknown as { antonyms: unknown[] }
    doc.antonyms = [...antonyms]
    return doc as never
  }
  const pairEmbedder = (second: string) => tableEmbedder([['open the door', second]])

  it('demotes on a SEED-contrary variant ("open the door" / "close the doors")', async () => {
    const report = await runCheck(antonymDoc('close the doors', false), {
      semantic: { embedder: pairEmbedder('close the doors') },
    })
    expect(report.findings.map((f) => f.code)).toContain('FND_SIMILAR_SEMANTIC')
    expect(report.findings.map((f) => f.code)).not.toContain('FND_CONTRADICTION')
    expect(nearDuplicate(report).map((d) => d.requirementIds)).toEqual([[P1, P2]])
    expect(report.verified).toBe(false)
  })

  it('demotes on a DOC-committed-contrary variant ("open the door" / "shut the doors")', async () => {
    const report = await runCheck(antonymDoc('shut the doors', false, [{ a: 'open', b: 'shut' }]), {
      semantic: { embedder: pairEmbedder('shut the doors') },
    })
    expect(report.findings.map((f) => f.code)).toContain('FND_SIMILAR_SEMANTIC')
    expect(nearDuplicate(report).map((d) => d.requirementIds)).toEqual([[P1, P2]])
    expect(report.verified).toBe(false)
  })

  it('control: a contrary pair with one side NEGATED does not demote', async () => {
    // "open the door" and "shall not close the doors" is `A ∧ ¬B` over contraries A, B: the
    // contrary axiom `¬(A ∧ B)` holds, so even as one door nothing contradicts.
    const report = await runCheck(antonymDoc('close the doors', true), {
      semantic: { embedder: pairEmbedder('close the doors') },
    })
    expect(report.findings.map((f) => f.code)).toContain('FND_SIMILAR_SEMANTIC')
    expect(nearDuplicate(report)).toEqual([])
  })

  it('control: BOTH sides negated does not demote — "do neither" is consistent (AC-2-1)', async () => {
    // The rename model read "shall not open the door" as `close_the_door` and "shall not close
    // the doors" as `¬close_the_doors`: opposite polarity, a demotion. Under the contrary axiom
    // `¬A ∧ ¬B` is satisfiable, so demoting here would charge the author for a consistent pair.
    const report = await runCheck(
      docOf([
        {
          id: P1,
          systemName: 'door controller',
          trigger: PRESS,
          systemResponse: 'open the door',
          negated: true,
        },
        {
          id: P2,
          systemName: 'door controller',
          trigger: PRESS,
          systemResponse: 'close the doors',
          negated: true,
        },
      ]),
      { semantic: { embedder: pairEmbedder('close the doors') } },
    )
    expect(report.findings.map((f) => f.code)).toContain('FND_SIMILAR_SEMANTIC')
    expect(nearDuplicate(report)).toEqual([])
  })

  it('control: without the committed pair, "shut" is just another verb', async () => {
    const report = await runCheck(antonymDoc('shut the doors', false), {
      semantic: { embedder: pairEmbedder('shut the doors') },
    })
    expect(nearDuplicate(report)).toEqual([])
  })
})

/**
 * The merge the finding proposes lives in the same opposition-key space as the test that raised
 * it. A glossary entry declares two phrases synonyms, so the raw pair "open the door" / "close
 * the doors" would alias a phrase to its own contrary under open/close: both land on one atom at
 * one polarity, and the solver reads the contradiction as a redundancy. The merge that keeps it
 * a contradiction aligns the number only, so the two become contraries over ONE key.
 */
describe('AC-3-6: the proposed merge never aliases a phrase to its own opposite', () => {
  const pair = (first: string, second: string) =>
    docOf([
      { id: P1, systemName: 'door controller', trigger: PRESS, systemResponse: first },
      { id: P2, systemName: 'door controller', trigger: PRESS, systemResponse: second },
    ])
  const similar = (report: Awaited<ReturnType<typeof runCheck>>) =>
    report.findings.filter((f) => f.code === 'FND_SIMILAR_SEMANTIC').map((f) => f.message)

  it('proposes the number merge in canonical space, not the raw antonym pair', async () => {
    const report = await runCheck(pair('open the door', 'close the doors'), {
      semantic: { embedder: tableEmbedder([['open the door', 'close the doors']]) },
    })
    const [message] = similar(report)
    expect(message).toContain('`symspec glossary add "close the door" "close the doors"`')
    expect(message).not.toContain('"open the door" "close the doors"')
    expect(message).not.toContain('"close the doors" "open the door"')
    expect(nearDuplicate(report).map((d) => d.requirementIds)).toEqual([[P1, P2]])
    // Negative guard on the promise the raw merge broke.
    for (const text of [message, ...nearDuplicate(report).map((d) => d.action)]) {
      expect(text).not.toContain('the solver then decides the pair')
    }
  })

  it("keeps the author's wording when the raw merge is not a contrary pair", async () => {
    const report = await runCheck(paraDoc(), {
      semantic: { embedder: tableEmbedder([['open the door', 'open the doors']]) },
    })
    expect(similar(report)[0]).toContain('`symspec glossary add "open the door" "open the doors"`')
  })

  it('withholds the merge, and says why, when every candidate is a contrary pair', async () => {
    // The antonym rest rule drops ONE preposition, so a canonical body with a second one does
    // not re-atomize onto itself, and the raw pair is include/exclude: nothing survives.
    const first = 'include the file in the box in the archive'
    const second = 'exclude the file in the box in the archives'
    const report = await runCheck(pair(first, second), {
      semantic: { embedder: tableEmbedder([[first, second]]) },
    })
    const [message] = similar(report)
    expect(message).not.toContain('symspec glossary')
    expect(message).toContain('No glossary merge is proposed')
    const [demotion] = nearDuplicate(report)
    expect(demotion?.requirementIds).toEqual([P1, P2])
    expect(demotion?.action).toContain('no glossary merge is offered')
    expect(demotion?.action).not.toContain('`symspec glossary add` merge')
    expect(report.verified).toBe(false)
  })
})

/**
 * A glossary entry is global and its lookup is one hop, so a merge that is right for the pair
 * can still break a unification the document already has. The finder refuses such a candidate
 * and falls through to one that moves nothing else: the pair's number difference written in
 * the other requirement's own words.
 */
describe('AC-3-6: the proposed merge never splits an atom the document already shares', () => {
  const DEPART = 'the train departs'
  const withGlossary = (
    doc: ReturnType<typeof docOf>,
    glossary: { canonical: string; aliases: string[] }[],
  ) => ({ ...(doc as object), glossary }) as never
  const doors = (extra: ReqSpec[] = []) =>
    docOf([
      { id: P1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
      { id: P2, systemName: 'door controller', trigger: PRESS, systemResponse: 'close the doors' },
      ...extra,
    ])
  const embedder = () => tableEmbedder([['open the door', 'close the doors']])
  const messageOf = (report: Awaited<ReturnType<typeof runCheck>>) =>
    report.findings.find(
      (f) => f.code === 'FND_SIMILAR_SEMANTIC' && f.requirementIds.join('|') === `${P1}|${P2}`,
    )?.message ?? ''
  const contradictions = (report: Awaited<ReturnType<typeof runCheck>>) =>
    report.findings
      .filter((f) => f.code === 'FND_CONTRADICTION')
      .map((f) => [...f.requirementIds].sort().join('|'))
      .sort()

  it('refuses to alias a committed canonical, even one no requirement routes onto', async () => {
    // "seal the portal" -> "close the doors" is committed; aliasing "close the doors" away would
    // orphan it for every requirement written that way later.
    const glossary = [{ canonical: 'close the doors', aliases: ['seal the portal'] }]
    const report = await runCheck(withGlossary(doors(), glossary), {
      semantic: { embedder: embedder() },
    })
    const message = messageOf(report)
    expect(message).not.toContain('"close the door" "close the doors"')
    expect(message).toContain('`symspec glossary add "open the doors" "open the door"`')
    const after = await runCheck(
      withGlossary(doors(), [
        ...glossary,
        { canonical: 'open the doors', aliases: ['open the door'] },
      ]),
      { semantic: { embedder: embedder() } },
    )
    expect(contradictions(after)).toEqual([`${P1}|${P2}`])
  })

  it('refuses to move a phrase off an opposition key the document already shares', async () => {
    // P5 "close the door" is the contrary of P1 "open the door" over the key `close_the_door`,
    // and both fire on PRESS, so they contradict. With "close the doors" a committed canonical,
    // the one merge left is "open the doors" <- "open the door": it moves P1 alone onto the key
    // `close_the_doors`, off the key it shares with P5, and the P1/P5 contradiction disappears.
    // No atom is split (P1 is alone on `open_the_door`), so only the key partition sees it.
    const P5 = 'para-5-close-door'
    const glossary = [{ canonical: 'close the doors', aliases: ['seal the portal'] }]
    const extra: ReqSpec[] = [
      { id: P5, systemName: 'door controller', trigger: PRESS, systemResponse: 'close the door' },
    ]
    const report = await runCheck(withGlossary(doors(extra), glossary), {
      semantic: { embedder: embedder() },
    })
    expect(contradictions(report)).toEqual([`${P1}|${P5}`])
    const message = messageOf(report)
    expect(message).not.toContain('"open the doors" "open the door"')
    expect(message).toContain('No glossary merge is proposed')
    expect(nearDuplicate(report).map((d) => d.requirementIds)).toContainEqual([P1, P2])
    // The fixture discriminates: the refused merge, committed anyway, loses P1/P5.
    const moved = await runCheck(
      withGlossary(doors(extra), [
        ...glossary,
        { canonical: 'open the doors', aliases: ['open the door'] },
      ]),
      { semantic: { embedder: embedder() } },
    )
    expect(contradictions(moved)).not.toContain(`${P1}|${P5}`)
  })

  it('refuses to move a phrase an inflection already shares an atom with', async () => {
    // "closes the doors" de-inflects onto `close_the_doors`, the atom P2 is on, and conflicts
    // there with "open the doors". Aliasing "close the doors" away would move P2 alone.
    const P3 = 'para-3-closes-doors'
    const P4 = 'para-4-open-doors'
    const extra: ReqSpec[] = [
      {
        id: P3,
        systemName: 'door controller',
        trigger: DEPART,
        systemResponse: 'closes the doors',
      },
      { id: P4, systemName: 'door controller', trigger: DEPART, systemResponse: 'open the doors' },
    ]
    const report = await runCheck(doors(extra), { semantic: { embedder: embedder() } })
    expect(contradictions(report)).toEqual([`${P3}|${P4}`])
    const message = messageOf(report)
    expect(message).not.toContain('"close the door" "close the doors"')
    expect(message).toContain('`symspec glossary add "open the doors" "open the door"`')
  })

  it('a variant pair carries no antonym hint: the table already relates it', async () => {
    const report = await runCheck(doors(), { semantic: { embedder: embedder() } })
    const message = messageOf(report)
    expect(message).toContain('DEMOTES')
    expect(message).not.toContain('symspec antonym')
  })
})

describe('differsOnlyByInflection', () => {
  it.each([
    ['open the door', 'open the doors', true],
    ['opens the valve', 'open the valves', true],
    ['empty the battery', 'empty the batteries', true],
    ['open the door', 'open the door', false],
    ['open the door', 'unlock the door', false],
    ['open the door', 'open the front door', false],
    ['open the gas valve', 'open the gap valve', false],
  ] as const)('%s / %s -> %s', (a, b, expected) => {
    expect(differsOnlyByInflection(a, b)).toBe(expected)
  })
})

/**
 * Invariant I-1's run-weakening row, for the semantic threshold. The paraphrase pass (and with
 * it the AC-3-6 near-duplicate demotion) only sees pairs at or above the threshold, so a run with
 * the threshold RAISED above the measured default can drop a demotion the pinned run would keep.
 * It is a statement about the run, exactly like the stub embedder: disclosed in `run`, and a
 * `run-weakened` demotion. Lowering it only proposes more, which weakens nothing.
 */
describe('I-1: a --semantic-threshold above the default is a run-weakening move', () => {
  // Cosine 1 for the pair, so the proposal survives any threshold and the only thing under
  // test is whether the raised threshold is disclosed and demotes.
  const embedder = () => tableEmbedder([['open the door', 'open the doors']])
  const run = (threshold?: number) =>
    runCheck(paraDoc({ negated: false }), {
      semantic: { embedder: embedder(), ...(threshold !== undefined ? { threshold } : {}) },
    })

  it('control: the default threshold neither demotes nor weakens, and is disclosed', async () => {
    const report = await run()
    expect(reasons(report)).toEqual([])
    expect(report.run).toEqual({ embedder: 'model', semanticThreshold: DEFAULT_SEMANTIC_THRESHOLD })
  })

  it('a threshold ABOVE the default demotes with run-weakened, naming the flag', async () => {
    const report = await run(0.99)
    expect(reasons(report)).toEqual(['run-weakened'])
    const [d] = report.coverage.demotions
    expect(d?.action).toContain('--semantic-threshold')
    expect(d?.action).toContain(String(DEFAULT_SEMANTIC_THRESHOLD))
    expect(report.run.semanticThreshold).toBe(0.99)
    expect(report.verified).toBe(false)
  })

  it('control: a threshold AT or BELOW the default does not weaken the run', async () => {
    for (const threshold of [DEFAULT_SEMANTIC_THRESHOLD, 0.5]) {
      const report = await run(threshold)
      expect(reasons(report)).not.toContain('run-weakened')
      expect(report.run.semanticThreshold).toBe(threshold)
    }
  })

  it('discloses no threshold when the semantic tier did not run', async () => {
    const report = await runCheck(paraDoc({ negated: false }))
    expect(report.run).toEqual({ embedder: 'off' })
  })
})

/**
 * Following the AC-3-6 discharge the tool itself offers must never reach `verified: true` over
 * the conflict it was raised on. The committed merge lands "open the door" and "close the doors"
 * on ONE opposition key as contraries; under two guards no checked group joins, the solver still
 * never asserts them together, so the AC-3-2 detector — which reads contraries through the same
 * `literalsConflict` rule — has to take over the demotion.
 */
describe('AC-3-6 discharge under guards no checked group joins', () => {
  const guardedDoc = (glossary: readonly object[] = []) => {
    const doc = docOf([
      { id: P1, systemName: 'door controller', trigger: PRESS, systemResponse: 'open the door' },
      {
        id: P2,
        systemName: 'door controller',
        preCondition: MOVING,
        systemResponse: 'close the doors',
      },
      { id: C1, systemName: 'door controller', trigger: PRESS, systemResponse: 'sound the chime' },
      {
        id: C2,
        systemName: 'door controller',
        preCondition: MOVING,
        systemResponse: 'illuminate the warning lamp',
      },
    ]) as unknown as { glossary: unknown[] }
    doc.glossary = [...glossary]
    return doc as never
  }
  const embedder = () => tableEmbedder([['open the door', 'close the doors']])

  it('before the merge: the near-duplicate demotes, and its action does not promise a comparison', async () => {
    const report = await runCheck(guardedDoc(), { semantic: { embedder: embedder() } })
    const [d] = nearDuplicate(report)
    expect(d?.requirementIds).toEqual([P1, P2])
    expect(d?.action).toContain('conditional-conflict-unchecked')
    // Negative guard: the old text promised an unconditional comparison, which the solver never
    // makes when the two guards are never asserted together.
    expect(d?.action).not.toContain('compares like any other pair')
  })

  it('after the offered merge: the pair demotes as conditional-conflict-unchecked', async () => {
    const report = await runCheck(
      guardedDoc([{ canonical: 'close the door', aliases: ['close the doors'] }]),
      { semantic: { embedder: embedder() }, strict: true },
    )
    expect(nearDuplicate(report)).toEqual([])
    expect(conditional(report).map((d) => d.requirementIds)).toEqual([[P1, P2]])
    expect(report.verified).toBe(false)
    expect(report.strictGate).toBe('fail')
  })
})
