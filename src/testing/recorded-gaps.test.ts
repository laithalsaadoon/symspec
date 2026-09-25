/**
 * RECORDED GAPS: consistent documents the tool still gets wrong, pinned at their CURRENT wrong
 * outcome (spec 007 invariant I-5, the pattern of `fabrication.test.ts`'s "the recorded gap is
 * still open").
 *
 * Each gap rests on an ambiguity English does not mark: which phrase a prepositional phrase
 * attaches to, whether a preposition names a time or a place, which sense a verb has. No closed
 * rule over the words tells the readings apart, so under the demote-not-prove contract another
 * heuristic would buy each case with many honest proofs. The owner is the controlled vocabulary
 * (spec 007 Phase 3, Story 4: the author binds each phrase to a declared symbol) or the typed
 * quantities and IR (Phase 4, typed-atom slices 10-14).
 *
 * Every assertion here states the WRONG outcome, and the comment beside it names the correct one.
 * A fix therefore turns this file red, and the gap is retired on purpose, by deleting its case,
 * not by a later change that silently moves it.
 *
 * One `describe` per owning group, so groups append without touching each other's block.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from '../domain/engine/pipeline/check.ts'

const TS = '2026-01-01T00:00:00.000Z'

describe('recorded gaps: num', () => {
  const idAt = (i: number) => `aaaaaaaa-6666-4666-8666-${String(i).padStart(12, '0')}`

  const reqOf = (id: string, systemName: string, systemResponse: string, trigger?: string) => ({
    id,
    patternType: trigger !== undefined ? ('event-driven' as const) : ('ubiquitous' as const),
    systemName,
    ...(trigger !== undefined ? { trigger } : {}),
    systemResponse,
    negated: false,
    sentence: `${trigger !== undefined ? `When ${trigger}, the` : 'The'} ${systemName} shall ${systemResponse}.`,
    priority: 'medium' as const,
    status: 'draft' as const,
    createdAt: TS,
    updatedAt: TS,
    derives: [],
    satisfies: [],
    verifies: [],
    refines: [],
  })

  /** Check the pair `a`/`b` of `system`; the numeric verdict on it. */
  const checkPair = async (system: string, a: string, b: string, trigger?: string) => {
    const reqs = [reqOf(idAt(0), system, a, trigger), reqOf(idAt(1), system, b, trigger)]
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
    const pair = reqs.map((r) => r.id).sort()
    const of = (code: string) =>
      report.findings.filter((f) => f.code === code).map((f) => [...f.requirementIds].sort())
    return {
      pair,
      proved: of('FND_NUMERIC_CONTRADICTION'),
      disclosed: of('FND_NUMERIC_UNCOMPARED'),
      verified: report.verified,
    }
  }

  it('the recorded gap is still open: a time phrase after one noun is read as the action’s', async () => {
    // AMBIGUITY: prepositional-phrase attachment. In `discount rentals for over 7 days` the
    // `for` phrase may be the action's duration (discount for a week) or a postmodifier of the
    // noun (rentals that last over 7 days). Here it is the noun's: a weekly-rental discount and
    // an hourly promo hold together, as do flagging long calls and very short ones. The tier
    // reads the verb attachment after ONE object noun, and the two bounds become one proved
    // obligation at error severity. The same ambiguity one word later (`close the session idle
    // for at least 30 minutes`) is already disclosed; demoting this shape too would also demote
    // `run the pump for at least 10 minutes` and `retain the logs for at least 90 days`.
    // OWNER: spec 007 Phase 3, AC-4-1 `quantity` symbols (with AC-4-3 refusing an unresolved
    // quantity phrase): the author binds `for over 7 days` either to the discount's duration or
    // to the rental's length, and Phase 4's typed quantities key the bound on that symbol.
    // CORRECT OUTCOME: no FND_NUMERIC_CONTRADICTION. Bound to the rental's length, each bound
    // is a condition picking out rentals, and the pair is consistent; until the binding exists,
    // the pair is disclosed (FND_NUMERIC_UNCOMPARED) and `verified` is false.
    for (const [system, a, b, trigger] of [
      ['rental system', 'discount rentals for over 7 days', 'discount rentals for under 1 day'],
      [
        'rental system',
        'discount the rental for over 7 days',
        'discount the rental for under 1 day',
      ],
      ['billing system', 'bill stays for over 30 days', 'bill stays for under 1 day'],
      ['call monitor', 'flag calls for over 60 minutes', 'flag calls for under 5 seconds'],
      ['parking system', 'charge stays for over 24 hours', 'charge stays for under 15 minutes'],
      ['fleet monitor', 'flag trips for over 12 hours', 'flag trips for under 1 minute'],
      ['auditor', 'audit sessions for over 8 hours', 'audit sessions for under 1 second'],
      [
        'call monitor',
        'flag the call for over 60 minutes',
        'flag the call for under 5 seconds',
        'a call ends',
      ],
    ] as const) {
      const out = await checkPair(system, a, b, trigger)
      expect(out.proved, `${a}: the recorded gap is still open`).toEqual([out.pair])
      expect(out.verified, a).toBe(false)
    }
  })

  it('the recorded gap is still open: `keep` meaning retain is read as holding a quantity', async () => {
    // AMBIGUITY: a verb sense. `keep the record above 1000 dollars` is either keep=maintain (hold
    // the record's value above 1000 dollars) or keep=retain (keep the records worth over 1000
    // dollars). Here it is retain: the archive retains high-value and low-value records, which
    // is consistent. `keep` is a holding verb, one noun is its object, and the pair is proved at
    // error severity. `hold` and `limit` were removed from the holding verbs for this second
    // sense; removing `keep` would demote every `keep the latency below 200 milliseconds`.
    // OWNER: spec 007 Phase 3, AC-4-1 `quantity` symbols (the author declares `record value` as
    // a quantity, or does not), with Phase 4's typed quantities keying the bound on the
    // declared symbol rather than on the verb phrase.
    // CORRECT OUTCOME: no FND_NUMERIC_CONTRADICTION. With no quantity symbol bound to the
    // phrase, the pair is disclosed (FND_NUMERIC_UNCOMPARED) and `verified` is false.
    for (const [system, a, b] of [
      ['archive', 'keep the record above 1000 dollars', 'keep the record below 10 dollars'],
      ['cache', 'keep the file below 1 MB', 'keep the file above 100 MB'],
    ] as const) {
      const out = await checkPair(system, a, b)
      expect(out.proved, `${a}: the recorded gap is still open`).toEqual([out.pair])
      expect(out.disclosed, a).toEqual([])
      expect(out.verified, a).toBe(false)
    }
  })
})
