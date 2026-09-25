/**
 * The numeric tier's NUMBER token over digit groups it does not read, through `runCheck`:
 * `2_000_000 ms`, `2 000 000 ms` and `2'000 ms` are declined whole, never read as their
 * leading group.
 *
 * Its own file, like `numeric-key.test.ts`: every `runCheck` in a vitest worker shares one z3
 * WASM heap, fixed at 2 GiB, and `numeric-tier.test.ts` sits close to it.
 */

import { describe, expect, it } from 'vitest'
import { extractNumericPredicates } from '../formal/numeric.ts'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-5555-4555-8555-00000000000a'
const ID_B = 'aaaaaaaa-5555-4555-8555-00000000000b'

interface ReqSpec {
  readonly systemName: string
  readonly systemResponse: string
}

const reqOf = (id: string, s: ReqSpec) => ({
  id,
  patternType: 'ubiquitous' as const,
  systemName: s.systemName,
  systemResponse: s.systemResponse,
  negated: false,
  sentence: `The ${s.systemName} shall ${s.systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

const numericFindings = async (a: ReqSpec, b: ReqSpec) =>
  (
    await runCheck(
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
  ).findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')

describe('a number grouped by a separator the NUMBER token does not read', () => {
  // `2_000_000 ms`, `2 000 000 ms` and `2'000 ms` group digits with a separator the NUMBER
  // token does not read. It used to read the leading group alone, as a UNITLESS `<= 2`, so the
  // consistent pair below (at most 2,000,000 ms, at least 3,000 ms) was proved as `<= 2` against
  // `>= 3`. R6 reads each group of such a number on its own (05632b8), not the whole group, so
  // the tier declines the number: no predicate, so no proof.
  it.each([
    ['_', '2_000_000', '3_000'],
    ['space', '2 000 000', '3 000'],
    ['narrow no-break space', '2\u202f000\u202f000', '3\u202f000'],
    ['apostrophe', "2'000'000", "3'000"],
    ['right single quote', '2\u2019000\u2019000', '3\u2019000'],
  ])('declines a number grouped by %s rather than reading its leading group', async (_, x, y) => {
    const gateway = (systemResponse: string): ReqSpec => ({
      systemName: 'api gateway',
      systemResponse,
    })
    expect(
      await numericFindings(
        gateway(`respond within ${x} ms`),
        gateway(`respond in at least ${y} ms`),
      ),
    ).toEqual([])
    for (const text of [`respond within ${x} ms`, `respond in at least ${y} ms`]) {
      expect(extractNumericPredicates(text, 'api gateway', 'resp'), text).toEqual([])
    }
  })

  it('still reads a number that a space, `_` or quote does not group', () => {
    const read = (text: string) =>
      extractNumericPredicates(text, 'api gateway', 'resp').map((p) => [p.comparator, p.value])
    expect(read('respond within 30 ms 100 times')).toEqual([['<=', 30]])
    expect(read('respond within 2,000,000 ms')).toEqual([['<=', 2_000_000]])
    expect(read("respond within 30 ms, the 'fast' path")).toEqual([['<=', 30]])
  })
})
