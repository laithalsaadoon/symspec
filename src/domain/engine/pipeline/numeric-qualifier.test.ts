/**
 * What the numeric tier reads around a bound (spec 007 AC-2-6), through `runCheck`: the text
 * that follows it, a bound inside another bound's clause, and a delay anchored on an event.
 *
 * Every case is a consistent document the tier proved contradictory at error severity,
 * because it read a bound as holding everywhere, or as bounding a thing, when the sentence
 * does not say so. Each pairs the fix with a POSITIVE control that differs only in the
 * property read, so a case cannot pass because the tier stopped comparing.
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

describe('AC-2-6: the text after a bound is part of what it bounds', () => {
  it('never asserts a bound across trailing text it does not read, whatever the words', async () => {
    // A closed list of condition words (`when`, `after`, …) left every other phrasing read as
    // unconditional: two modes, two emergencies, or an anchor the list did not name were one
    // variable, and `> 30 °C ∧ < 20 °C` an error on a heater that heats and cools.
    for (const [system, a, b] of [
      [
        'heater',
        'keep the temperature above 30 degrees celsius in heating mode',
        'keep the temperature below 20 degrees celsius in cooling mode',
      ],
      [
        'heater',
        'keep the temperature above 30 degrees celsius as long as the mode is heating',
        'keep the temperature below 20 degrees celsius as long as the mode is cooling',
      ],
      [
        'heater',
        'keep the temperature above 30 degrees celsius provided that the mode is heating',
        'keep the temperature below 20 degrees celsius provided that the mode is cooling',
      ],
      [
        'heater',
        'keep the temperature above 30 degrees celsius in case of frost',
        'keep the temperature below 20 degrees celsius in case of fire',
      ],
      [
        'alarm',
        'sound the siren at least 5 seconds following the door opening',
        'sound the siren for at most 3 seconds',
      ],
      [
        'pump controller',
        'run the pump for at least 10 minutes',
        'run the pump at most 2 minutes from the moment the tank fills',
      ],
      [
        'alarm',
        'sound the siren at least 30 seconds since the alarm cleared',
        'sound the siren within 2 seconds',
      ],
    ] as const) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).toEqual([])
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
    }
  })

  it('never compares two bounds on what different referents count', async () => {
    // `30 days of logs` and `2 hours of video` bound two things. Once days converted to hours
    // and `%` met `percent`, the pairs the unit partition used to keep apart were proved.
    for (const [system, a, b] of [
      ['recorder', 'store at least 30 days of logs', 'store at most 2 hours of video'],
      ['scheduler', 'allow at least 2 days of notice', 'allow at most 12 hours of downtime'],
      ['pump', 'run at least 50 percent of the time', 'run at most 40% of rated speed'],
    ] as const) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).toEqual([])
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
    }
  })

  it('still proves two bounds under the SAME trailing text', async () => {
    // The controls: one referent, one mode, one anchor, and the conflict is real.
    for (const [system, a, b] of [
      ['recorder', 'store at least 30 days of logs', 'store at most 2 hours of logs'],
      ['pump', 'run at least 50 percent of the time', 'run at most 40% of the time'],
      [
        'heater',
        'keep the temperature above 30 degrees celsius in case of frost',
        'keep the temperature below 20 degrees celsius in case of frost',
      ],
    ] as const) {
      expect((await verdict(system, a, b)).errors, a).toEqual(['FND_NUMERIC_CONTRADICTION'])
    }
  })
})

describe('AC-2-6: a bound inside a condition is not an obligation', () => {
  it('never asserts a number in a trailing condition as an unconditional bound', async () => {
    // `when the level is above 5 meters` keyed a second bound on `run for at least 10 seconds
    // when the level`, an obligation with no qualifier, so two requirements with one
    // obligation under two level conditions were `level > 5 ∧ level < 3`, an error.
    for (const [system, a, b] of [
      [
        'pump',
        'run for at least 10 seconds when the level is above 5 meters',
        'run for at least 10 seconds when the level is below 3 meters',
      ],
      [
        'heater',
        'keep the temperature above 30 degrees celsius when the level is above 5 meters',
        'keep the temperature above 30 degrees celsius when the level is below 3 meters',
      ],
      // The response's only bound, inside its condition.
      [
        'drain controller',
        'open the drain when the level is above 5 meters',
        'open the drain when the level is below 3 meters',
      ],
    ] as const) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).toEqual([])
      // The two conditions are disclosed, not dropped: the tier cannot tell a condition from a
      // second obligation it did not read.
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
    }
  })

  it('discloses, and never certifies, a second obligation behind a first bound', async () => {
    // Whatever joins them, a later bound in the slot lies in the text after the first, and
    // the tier does not know whether it is a condition or a conjunct. `and keep the level
    // below 3 meters` is a conjunct, and against `above 5 meters` a real conflict.
    const out = await verdict(
      'pump',
      'run for at least 10 seconds and keep the level below 3 meters',
      'run for at least 10 seconds and keep the level above 5 meters',
    )
    expect(out.errors).toEqual([])
    expect(out.uncompared).toEqual([[ID_A, ID_B]])
  })

  it('still proves the first bound under one shared condition', async () => {
    const out = await verdict(
      'pump',
      'run for at least 10 seconds when the level is above 5 meters',
      'run for at most 5 seconds when the level is above 5 meters',
    )
    expect(out.errors).toEqual(['FND_NUMERIC_CONTRADICTION'])
  })
})
