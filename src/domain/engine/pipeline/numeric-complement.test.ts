/**
 * A bound in the complement clause of a verb that asserts it (spec 007 AC-2-6), through
 * `runCheck`: `ensure that the response time is below 200 milliseconds`. Split from
 * `numeric-qualifier.test.ts`, whose finite-verb rule this one pins on complements.
 *
 * Under the demote-not-prove contract (spec 007), a proof rests only on identical subjects and
 * identical qualifiers, and whether a complement's `is` is its copula or a condition's verb is a
 * grammar guess. So every pair here is DISCLOSED, never proved: the genuinely conflicting ones
 * 669c0e9 proved (each now a named demotion whose message gives the restatement that proves it),
 * and the consistent controls (a relative clause, a reported clause, `whether`) that an
 * exemption for complements proved, or came one word list short of proving.
 *
 * Its own file, like `numeric-disclosure.test.ts`: every `runCheck` in a vitest worker shares
 * one z3 WASM heap, fixed at 2 GiB.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ID_B = 'aaaaaaaa-0000-4000-8000-00000000000b'

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

const pairDoc = (a: ReqSpec, b: ReqSpec) => ({
  requirements: { [ID_A]: reqOf(ID_A, a), [ID_B]: reqOf(ID_B, b) },
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
  stateModel: { variables: [] },
})

/** The error codes of the pair, and the id sets and messages of its numeric disclosures. */
const verdict = async (system: string, a: string, b: string) => {
  const report = await runCheck(
    pairDoc(
      { systemName: system, systemResponse: a },
      { systemName: system, systemResponse: b },
    ) as never,
    {},
  )
  const uncompared = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
  return {
    errors: report.findings.filter((f) => f.severity === 'error').map((f) => f.code),
    uncompared: uncompared.map((f) => f.requirementIds),
    messages: uncompared.map((f) => f.message),
  }
}

describe('AC-2-6: a bound in a complement clause is disclosed, never proved', () => {
  // The finite-verb rule matches a spelling. An exemption that read a complement's `is` as its
  // copula proved consistent pairs whenever it misread the clause (`the latency, which the client
  // observes, is`, `the pressure in that tank is`), and needed another verb for every phrasing
  // (`make sure`, `see to it`, `check continuously`). Each case below is a genuinely conflicting
  // pair 669c0e9 proved; each is now a disclosure that names both requirements, the verb that
  // split it, and the restatement (`keep <quantity> below <N>`) that `numeric-qualifier.test.ts`
  // pins as proved.

  it('DISCLOSES two bounds in the complement clause of any asserting verb, naming the repair', async () => {
    const pairs: Array<readonly [string, string, string, string]> = []
    for (const verb of [
      'ensure that',
      'verify that',
      'confirm that',
      'guarantee that',
      'assure that',
      'ensure',
      'make sure that',
      'make sure',
      'make certain that',
      'check that',
      'validate that',
      'enforce that',
      'require that',
      'see to it that',
      'maintain that',
      'ensure at all times that',
      'verify, at all times, that',
      'check continuously that',
    ]) {
      pairs.push(
        [
          'server',
          `${verb} the response time is below 200 milliseconds`,
          `${verb} the response time is above 500 milliseconds`,
          'is',
        ],
        [
          'boiler',
          `${verb} the water can reach at most 60 degrees celsius`,
          `${verb} the water can reach at least 80 degrees celsius`,
          'can',
        ],
      )
    }
    // A relative clause before the complement's copula, closed by a verb, by commas, or read as a
    // demonstrative: each was a rule, and each rule was wrong on one of these.
    for (const [system, a, b] of [
      [
        'server',
        'ensure that the latency which the client observes is below 200 milliseconds',
        'ensure that the latency which the client observes is above 500 milliseconds',
      ],
      [
        'server',
        'ensure that the latency, which the client observes, is below 200 milliseconds',
        'ensure that the latency, which the client observes, is above 500 milliseconds',
      ],
      [
        'clinic system',
        'ensure that the wait for the patient, whom the nurse admits, is below 20 minutes',
        'ensure that the wait for the patient, whom the nurse admits, is above 40 minutes',
      ],
      [
        'server',
        'ensure that the response time for that endpoint is below 200 milliseconds',
        'ensure that the response time for that endpoint is above 500 milliseconds',
      ],
      [
        'pump controller',
        'ensure that the pressure in that tank is below 5 bar',
        'ensure that the pressure in that tank is above 8 bar',
      ],
      [
        'server',
        'ensure that the latency which the client observes is below 200 milliseconds when the load is high',
        'ensure that the latency which the client observes is above 500 milliseconds when the load is high',
      ],
      [
        'gateway',
        'ensure that the percentage of requests that fail is below 1 percent',
        'ensure that the percentage of requests that fail is above 5 percent',
      ],
      [
        'panel',
        'ensure that the number of alarms that are active is below 3',
        'ensure that the number of alarms that are active is above 5',
      ],
    ] as const) {
      // The first finite spelling names the split: `are` in `the alarms that are active is`.
      pairs.push([system, a, b, / are /.test(a) ? 'are' : 'is'])
    }
    for (const [system, a, b, verb] of pairs) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).not.toContain('FND_NUMERIC_CONTRADICTION')
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
      const message = out.messages.join(' ')
      expect(message, a).toContain(`after the finite verb "${verb}"`)
      expect(message, a).toContain('"keep <quantity> below <N>" for "ensure that <quantity> is')
    }
    // The consistent twin is neither proved nor disclosed: the two bounds hold together.
    const ok = await verdict(
      'server',
      'ensure that the response time is below 500 milliseconds',
      'ensure that the response time is above 200 milliseconds',
    )
    expect(ok).toEqual({ errors: [], uncompared: [], messages: [] })
  })

  it('still discloses a bound in a relative clause or a reported clause, never proves it', async () => {
    // The controls: a relative clause picks WHICH tank, and `report that` asserts a message,
    // not the pressure. Both pairs are consistent, and base proved each one.
    for (const [a, b] of [
      [
        'ensure that the tank whose level is above 5 meters is drained',
        'ensure that the tank whose level is below 3 meters is drained',
      ],
      [
        'ensure that the tank that is above 5 meters is drained',
        'ensure that the tank that is below 3 meters is drained',
      ],
      ['report that the level is above 5 meters', 'report that the level is below 3 meters'],
      ['verify whether the level is above 5 meters', 'verify whether the level is below 3 meters'],
      ['check whether the level is above 5 meters', 'check whether the level is below 3 meters'],
      ['log that the level is above 5 meters', 'log that the level is below 3 meters'],
      // No complementizer: the words after `ensure` are its object, and `that` a relative.
      [
        'ensure the tank that is above 5 meters is drained',
        'ensure the tank that is below 3 meters is drained',
      ],
      // A relative clause that holds the verb, whatever its pronoun.
      [
        'ensure that the tank which is above 5 meters is drained',
        'ensure that the tank which is below 3 meters is drained',
      ],
      [
        'ensure that the tank which still is above 5 meters is drained',
        'ensure that the tank which still is below 3 meters is drained',
      ],
      // A relative clause with a subject of its own that holds the verb: the complement's own
      // verb follows the bound.
      [
        'ensure that the heater which the operator can set above 50 degrees celsius is off',
        'ensure that the heater which the operator can set below 30 degrees celsius is off',
      ],
      // With nothing after the bound, one word between the pronoun and the verb still leaves
      // the verb to the relative clause.
      [
        'ensure that the tank which still is above 5 meters',
        'ensure that the tank which still is below 3 meters',
      ],
      // `whose` takes the next verb, however many words its noun has.
      [
        'ensure that the tank whose water level is above 5 meters',
        'ensure that the tank whose water level is below 3 meters',
      ],
      // A second complement under a verb that reports it.
      [
        'ensure that the display reports that the level is above 5 meters',
        'ensure that the display reports that the level is below 3 meters',
      ],
      [
        'ensure that the pump is off and the level is above 5 meters',
        'ensure that the pump is off and the level is below 3 meters',
      ],
      // A clause after the noun it completes, not a relative: `the warning that ...` is followed
      // by the complement's own verb, which is no condition.
      [
        'ensure that the warning that the level is above 5 meters appears',
        'ensure that the warning that the level is below 3 meters appears',
      ],
      // A `that` clause completing its noun has a subject and no gap: no relative closes.
      [
        'ensure that the reports that the latency is below 200 milliseconds',
        'ensure that the reports that the latency is above 500 milliseconds',
      ],
      // Nor one with a pronoun subject, whose noun's own verb follows the bound.
      [
        'ensure that the warning that it is above 5 meters appears',
        'ensure that the warning that it is below 3 meters appears',
      ],
      // A second complement after a verb, whatever its subject.
      [
        'ensure that the display reports that it is above 5 meters',
        'ensure that the display reports that it is below 3 meters',
      ],
      // A second complement under a pronoun-like subject that reports it.
      [
        'ensure that each confirms that the level is above 5 meters',
        'ensure that each confirms that the level is below 3 meters',
      ],
      // A trailing condition with no subject of its own, before the complement's own verb.
      [
        'ensure that the heater which the operator can set above 50 degrees celsius when needed is off',
        'ensure that the heater which the operator can set below 30 degrees celsius when needed is off',
      ],
      // A conjunct after a relative clause's verb.
      [
        'ensure that the pump which runs is off and the level is above 5 meters',
        'ensure that the pump which runs is off and the level is below 3 meters',
      ],
    ] as const) {
      const out = await verdict('pump controller', a, b)
      expect(out.errors, a).toEqual([])
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
    }
  })
})
