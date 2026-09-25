/**
 * A quantity the numeric tier never read is disclosed, never certified (spec 007 Phase 1, the
 * original review's C6), through `runCheck`.
 *
 * `respond within 200 ms` against `respond in more than 500 ms`, under one trigger, is a
 * conflict. With `more than` missing from the comparator lexicon it verified clean: the tier
 * read one bound, compared it with nothing, and the shared trigger atom counted the pair as
 * compared. The lexicon now reads the phrase, and the structural guard behind it
 * (`numeric.ts` `unreadQuantities`) makes the NEXT missing phrase cost `verified` instead of
 * correctness: a number in a converted unit that no read bound covers is
 * `FND_NUMERIC_UNCOMPARED`, naming the requirement and the unread text.
 *
 * Its own file rather than a block of `numeric-tier.test.ts`: every `runCheck` in a worker
 * shares one z3 WASM heap, fixed at 2 GiB, and that file sits close to it.
 */

import { describe, expect, it } from 'vitest'
import type { Embedder } from '../formal/embed.ts'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ID_B = 'aaaaaaaa-0000-4000-8000-00000000000b'

const reqOf = (id: string, systemResponse: string) => ({
  id,
  patternType: 'event-driven' as const,
  systemName: 'API gateway',
  trigger: 'a request arrives',
  systemResponse,
  negated: false,
  sentence: `When a request arrives, the API gateway shall ${systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

/**
 * One-hot vectors keyed on the exact text, so distinct texts are orthogonal: the semantic tier
 * runs, and proposes nothing, so the only demotion left is the one under test.
 */
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

const gateway = (a: string, b: string) =>
  runCheck(
    {
      requirements: { [ID_A]: reqOf(ID_A, a), [ID_B]: reqOf(ID_B, b) },
      glossary: [],
      antonyms: [],
      waivers: [],
      terms: [],
      stateModel: { variables: [] },
    } as never,
    { semantic: { embedder: orthogonalEmbedder() } },
  )

describe('C6: a comparator phrase the lexicon reads is proved, one it does not is disclosed', () => {
  it('proves `within 200 ms` against `more than 500 ms` at error severity', async () => {
    const report = await gateway('respond within 200 ms', 'respond in more than 500 ms')
    const proved = report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
    expect(proved.map((f) => [f.severity, [...f.requirementIds].sort()])).toEqual([
      ['error', [ID_A, ID_B]],
    ])
    expect(report.verified).toBe(false)
  })

  it('reads the consistent twin as read and consistent, so the proof is the arithmetic', async () => {
    // Not `verified: true`: two bounds under one guard also raise the relational tier's
    // pre-existing `relational-reasoning-not-attempted`, whatever their phrases. What this
    // twin pins is the numeric half: no proof, and nothing unread.
    const report = await gateway('respond within 200 ms', 'respond in more than 100 ms')
    expect(report.findings.map((f) => f.code)).not.toContain('FND_NUMERIC_CONTRADICTION')
    expect(report.findings.map((f) => f.code)).not.toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.coverage.demotions.map((d) => d.reason)).not.toContain(
      'numeric-bounds-uncompared',
    )
  })

  it('demotes a phrase the lexicon does not know, naming the requirement and the quantity', async () => {
    // `upwards of` is not an entry: the tier reads no bound on `500 ms`. Before the guard this
    // was the reproducer's shape exactly, certified clean.
    const report = await gateway('respond within 200 ms', 'respond in upwards of 500 ms')
    const unread = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
    expect(unread.map((f) => [f.severity, f.requirementIds])).toEqual([['info', [ID_B]]])
    expect(unread[0]?.message).toContain(`Requirement ${ID_B} states "500 ms"`)
    // The guard's demotion is the ONLY one: without it this run verifies.
    expect(report.coverage.demotions.map((d) => [d.reason, d.requirementIds])).toEqual([
      ['numeric-bounds-uncompared', [ID_B]],
    ])
    expect(report.verified).toBe(false)
  })

  it('control: the same shape in a unit no dimension converts still verifies', async () => {
    // `3 months` is a quantity no dimension converts (a month has no fixed length), and a unit
    // it does not convert is the unit partition's business: the guard is keyed on the unit.
    const report = await gateway(
      'respond within 200 ms',
      'retain the request log for upwards of 3 months',
    )
    expect(report.findings.map((f) => f.code)).not.toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.coverage.demotions).toEqual([])
    expect(report.verified).toBe(true)
  })

  it('names each unread quantity of a requirement in one finding', async () => {
    const report = await gateway(
      'respond within 200 ms',
      'poll the upstream every 5 seconds and retry after 3 s',
    )
    const unread = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
    expect(unread.map((f) => f.requirementIds)).toEqual([[ID_B]])
    expect(unread[0]?.message).toContain('states "5 seconds", "3 s" in its response')
    expect(report.verified).toBe(false)
  })
})

describe('two verifier repros after the lexicon change', () => {
  it('`up to date … within 5 minutes` is never proved against a duration on `keep the cache`', async () => {
    // With `up to` as an entry, it claimed the `within` number, lost the deadline role, and
    // proved a consistent pair contradictory at error severity.
    const report = await gateway(
      'keep the cache up to date within 5 minutes',
      'keep the cache for at least 10 minutes',
    )
    expect(report.findings.map((f) => f.code)).not.toContain('FND_NUMERIC_CONTRADICTION')
  })

  it('a leading-decimal quantity is disclosed, so a conflict it hides cannot verify', async () => {
    // `.5 s` is declined by NUMBER; before the guard saw it, `within 200 ms` against `at least
    // .5 s` (a real conflict) verified with exit 0.
    const report = await gateway('respond within 200 ms', 'respond in at least .5 s')
    const unread = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
    expect(unread.map((f) => f.requirementIds)).toEqual([[ID_B]])
    expect(report.verified).toBe(false)
  })
})
