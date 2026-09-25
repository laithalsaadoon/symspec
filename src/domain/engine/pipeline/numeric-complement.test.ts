/**
 * A bound in the complement clause of a verb that asserts it (spec 007 AC-2-6), through
 * `runCheck`: `ensure that the response time is below 200 milliseconds` bounds the response
 * time, and its `is` is the complement's copula, not a condition's. Split from
 * `numeric-qualifier.test.ts`, whose rules this one narrows.
 *
 * Every PROVES case is a genuinely conflicting pair 669c0e9 proved and the finite-verb rule
 * only disclosed; every control is a consistent pair (a relative clause, a reported clause,
 * `whether`) that must stay disclosed, never proved.
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

/** The error codes of the pair, and the id sets of its numeric disclosures. */
const verdict = async (system: string, a: string, b: string) => {
  const report = await runCheck(
    pairDoc(
      { systemName: system, systemResponse: a },
      { systemName: system, systemResponse: b },
    ) as never,
    {},
  )
  return {
    errors: report.findings.filter((f) => f.severity === 'error').map((f) => f.code),
    uncompared: report.findings
      .filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
      .map((f) => f.requirementIds),
  }
}

describe('AC-2-6: a complement-clause copula is not a condition', () => {
  // The finite-verb rule splits a bound off into its clause, and a split can only drop a
  // proof. It drops a REAL one whenever it fires on a complement the verb asserts, so each
  // exemption is pinned against a conflicting pair, beside the controls it must not reach.

  it('PROVES two bounds in the complement clause of ensure, verify, confirm, or guarantee', async () => {
    // `ensure that the response time is below 200 ms`: the `is` is the complement clause's
    // copula, and the clause is the obligation. The finite-verb rule read it as a condition,
    // and a conflict 669c0e9 proved became an info disclosure.
    for (const verb of [
      'ensure that',
      'verify that',
      'confirm that',
      'guarantee that',
      'assure that',
      'ensure',
      // Every other verb that asserts its complement, and an adverbial before `that`: each was
      // read through the finite-verb rule, and a pair 669c0e9 proved became a disclosure.
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
      for (const [system, a, b] of [
        [
          'server',
          'the response time is below 200 milliseconds',
          'the response time is above 500 milliseconds',
        ],
        [
          'boiler',
          'the water can reach at most 60 degrees celsius',
          'the water can reach at least 80 degrees celsius',
        ],
      ] as const) {
        const out = await verdict(system, `${verb} ${a}`, `${verb} ${b}`)
        // `at all times` also draws the absolute-term lint, which is not this tier's verdict.
        expect(
          out.errors.filter((code) => code.startsWith('FND_')),
          `${verb} ${a}`,
        ).toEqual(['FND_NUMERIC_CONTRADICTION'])
      }
    }
    // A relative clause with its own verb, before the complement's copula: the bound is the
    // complement's, not the relative clause's.
    for (const relative of ['which the client observes', 'who the operator supervises']) {
      const out = await verdict(
        'server',
        `ensure that the latency ${relative} is below 200 milliseconds`,
        `ensure that the latency ${relative} is above 500 milliseconds`,
      )
      expect(out.errors, relative).toEqual(['FND_NUMERIC_CONTRADICTION'])
    }
    // Every closed relative clause, whatever its pronoun or verb count, and a trailing condition
    // clause after the bound, which the tier reads as the bound's qualifier. Each pair is one
    // 669c0e9 proved, and the relative-clause rule only disclosed.
    for (const [system, a, b] of [
      [
        'server',
        'ensure that the latency which the client observes is below 200 milliseconds when the load is high',
        'ensure that the latency which the client observes is above 500 milliseconds when the load is high',
      ],
      [
        'server',
        'ensure that the latency that the client observes is below 200 milliseconds',
        'ensure that the latency that the client observes is above 500 milliseconds',
      ],
      [
        'gateway',
        'ensure that the percentage of requests that fail is below 1 percent',
        'ensure that the percentage of requests that fail is above 5 percent',
      ],
      [
        'gateway',
        'ensure that the latency of requests that the gateway forwards is below 200 milliseconds',
        'ensure that the latency of requests that the gateway forwards is above 500 milliseconds',
      ],
      [
        'panel',
        'ensure that the number of alarms that are active is below 3',
        'ensure that the number of alarms that are active is above 5',
      ],
    ] as const) {
      const out = await verdict(system, a, b)
      // A count with no unit also draws the unit lint (GTWR R6), which is not this tier's verdict.
      expect(
        out.errors.filter((code) => code.startsWith('FND_')),
        a,
      ).toEqual(['FND_NUMERIC_CONTRADICTION'])
    }
    // The consistent twin stays consistent.
    const ok = await verdict(
      'server',
      'ensure that the response time is below 500 milliseconds',
      'ensure that the response time is above 200 milliseconds',
    )
    expect(ok).toEqual({ errors: [], uncompared: [] })
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
