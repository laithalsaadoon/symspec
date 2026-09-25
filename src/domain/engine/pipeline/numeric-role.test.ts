/**
 * Spec 007 C3 for the numeric tier's role words, through `runCheck`: a role word (`for`, `in`,
 * `after`, `within`) marks a span or a point of the ACTION only on a recognized time. Before a
 * unit no dimension recognizes (currency, a count, a calendar word nothing converts) or before a
 * bare number, it marks nothing of the action: the bound picks out the object, and the pair is
 * disclosed, never proved.
 *
 * Its own file, like `numeric-held.test.ts`: every `runCheck` in a vitest worker shares one z3
 * WASM heap, fixed at 2 GiB, and that file sits close to it.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idAt = (i: number) => `aaaaaaaa-3333-4333-8333-${String(i).padStart(12, '0')}`

const reqOf = (id: string, systemName: string, systemResponse: string) => ({
  id,
  patternType: 'ubiquitous' as const,
  systemName,
  systemResponse,
  negated: false,
  sentence: `The ${systemName} shall ${systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

/** Run `responses` as one document of `system`; the numeric verdict on it. */
const check = async (system: string, responses: readonly string[]) => {
  const reqs = responses.map((r, i) => reqOf(idAt(i), system, r))
  const report = await runCheck(
    {
      requirements: Object.fromEntries(reqs.map((r) => [r.id, r])),
      glossary: [],
      antonyms: [],
      waivers: [],
      terms: [],
      stateModel: { variables: [] },
    } as never,
    {},
  )
  const uncompared = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
  return {
    ids: reqs.map((r) => r.id),
    errors: report.findings
      .filter((f) => f.severity === 'error' && f.code.startsWith('FND_'))
      .map((f) => f.code),
    proved: report.findings
      .filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
      .map((f) => [...f.requirementIds].sort()),
    uncompared: uncompared.map((f) => [...f.requirementIds].sort()),
    messages: uncompared.map((f) => f.message),
    demoted: report.coverage.demotions
      .filter((d) => d.reason === 'numeric-bounds-uncompared')
      .map((d) => [...d.requirementIds].sort()),
    verified: report.verified,
  }
}

/**
 * Every pair here holds together: a role word (`for`, `in`, `after`, `upon`) introduces a bound
 * that is NOT a time, so it is no span or point of the action. It picks out which object the
 * action applies to (a loan over 50000 dollars, an order of at least 10 items). Currency and
 * counts are units no dimension recognizes, and a bare number has none, so each took the
 * role-marked time path and was proved at error severity by 669c0e9, 2aaa8e8, and a244027. A
 * role-marked bound is the action's own only on a recognized time.
 */
const NOT_A_TIME: ReadonlyArray<readonly [string, string, string]> = [
  ['bank', 'approve the loan for over 50000 dollars', 'approve the loan for under 500 dollars'],
  ['checkout system', 'waive the fee for at least 10 items', 'waive the fee for at most 2 items'],
  ['bank', 'review the transfer in over 3 currencies', 'review the transfer in under 2 currencies'],
  [
    'moderation system',
    'suspend the user for at least 3 violations',
    'suspend the user for at most 1 violations',
  ],
  ['billing system', 'discount the order for over 10', 'discount the order for under 2'],
  ['shop', 'ship the order for at least 100 euros', 'ship the order for at most 5 euros'],
  ['shop', 'ship the order for at least 100 USD', 'ship the order for at most 5 USD'],
  ['shop', 'ship the order for at least 100 $', 'ship the order for at most 5 $'],
  ['shop', 'ship the order after at least 3 payments', 'ship the order after at most 1 payments'],
  // A holding verb's role-marked bound that is not a time is no span of the holding either.
  ['archive', 'keep the record for over 1000 dollars', 'keep the record for under 10 dollars'],
  // A calendar word no dimension converts is not read as a time: the author names the unit.
  ['archiver', 'retain the logs for at least 9 months', 'retain the logs for at most 3 months'],
]

describe('spec 007 C3: a role word marks the action only on a recognized time', () => {
  it('DISCLOSES, and never proves, a role-marked bound that is not a time', async () => {
    for (const [system, a, b] of NOT_A_TIME) {
      const out = await check(system, [a, b])
      const pair = [...out.ids].sort()
      expect(out.errors, a).toEqual([])
      expect(out.uncompared, a).toContainEqual(pair)
      expect(out.demoted, a).toContainEqual(pair)
      expect(out.verified, a).toBe(false)
    }
    const named = await check('bank', [NOT_A_TIME[0]![1], NOT_A_TIME[0]![2]])
    expect(named.messages.join(' ')).toContain('the verb "approve", on a bound that is not a time')
  })

  it('PROVES the same role-marked shapes on a recognized time', async () => {
    // The control: the gate is the dimension, not the role word or the shape.
    for (const [system, a, b] of [
      ['bank', 'approve the loan for over 7 days', 'approve the loan for under 1 day'],
      [
        'checkout system',
        'waive the fee for at least 10 minutes',
        'waive the fee for at most 2 minutes',
      ],
      ['bank', 'review the transfer in over 3 hours', 'review the transfer in under 2 hours'],
      ['archive', 'keep the record for over 10 seconds', 'keep the record for under 1 second'],
    ] as const) {
      const out = await check(system, [a, b])
      expect(out.proved, a).toContainEqual([...out.ids].sort())
    }
  })
})
