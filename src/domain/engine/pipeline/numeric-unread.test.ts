/**
 * A quantity the numeric tier never read is disclosed, never certified (spec 007 Phase 1, the
 * original review's C6), through `runCheck`.
 *
 * `respond within 200 ms` against `respond in more than 500 ms`, under one trigger, is a
 * conflict. With `more than` missing from the comparator lexicon it verified clean: the tier
 * read one bound, compared it with nothing, and the shared trigger atom counted the pair as
 * compared. The lexicon now reads the phrase.
 *
 * Its own file rather than a block of `numeric-tier.test.ts`: every `runCheck` in a worker
 * shares one z3 WASM heap, fixed at 2 GiB, and that file sits close to it.
 */

import { describe, expect, it } from 'vitest'
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
    {},
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
})
