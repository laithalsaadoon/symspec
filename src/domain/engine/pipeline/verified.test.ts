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
