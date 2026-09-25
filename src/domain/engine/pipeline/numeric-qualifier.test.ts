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
  /** A `While` precondition: the requirement is state-driven when present. */
  readonly preCondition?: string
}

const reqOf = (id: string, s: ReqSpec) => ({
  id,
  ...(s.preCondition === undefined
    ? { patternType: 'ubiquitous' as const }
    : { patternType: 'state-driven' as const, preCondition: s.preCondition }),
  systemName: s.systemName,
  systemResponse: s.systemResponse,
  negated: false,
  sentence:
    s.preCondition === undefined
      ? `The ${s.systemName} shall ${s.systemResponse}.`
      : `While ${s.preCondition}, the ${s.systemName} shall ${s.systemResponse}.`,
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

/**
 * The error codes of the pair, and the id sets and messages of its numeric disclosures. With
 * `preCondition`, both requirements are state-driven under it.
 */
const verdict = async (system: string, a: string, b: string, preCondition?: string) => {
  const pre = preCondition === undefined ? {} : { preCondition }
  const report = await runCheck(
    pairDoc(
      { systemName: system, systemResponse: a, ...pre },
      { systemName: system, systemResponse: b, ...pre },
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
      [
        'pump',
        'keep the load at least 50 percent of the time',
        'keep the load at most 40% of the time',
      ],
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

  it('never asserts a number inside a condition, whatever connective opens it', async () => {
    // `open the drain <C> the level is above 5 meters` against `... below 3 meters` is one
    // action under two disjoint conditions. Only a listed connective gave the bound its
    // clause, and every connective below was an error.
    for (const connective of [
      'as soon as',
      'in the event that',
      'in case',
      'as long as',
      'where',
      'any time',
      'each time',
      'so long as',
      'on condition that',
      'in the case that',
    ]) {
      const out = await verdict(
        'pump controller',
        `open the drain ${connective} the level is above 5 meters`,
        `open the drain ${connective} the level is below 3 meters`,
      )
      expect(out.errors, connective).toEqual([])
      expect(out.uncompared, connective).toEqual([[ID_A, ID_B]])
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

describe('AC-2-6: an unmarked time bound before other text is its own role', () => {
  it('never reads a delay after an event as a duration after the same event', async () => {
    // The qualifier split a delay from a duration only when their clauses differed. Under one
    // clause, the unmarked `at least 5 seconds` was asserted on the duration's variable, and
    // `delay >= 5 s ∧ duration <= 3 s`, satisfiable, was an error.
    for (const [system, a, b] of [
      [
        'alarm',
        'sound the siren at least 5 seconds after the door opens',
        'sound the siren for at most 3 seconds after the door opens',
      ],
      [
        'pump controller',
        'run the pump for at least 10 minutes after the tank fills',
        'run the pump at most 2 minutes after the tank fills',
      ],
      [
        'alarm',
        'sound the siren within 2 seconds after the door opens',
        'sound the siren at least 30 seconds after the door opens',
      ],
    ] as const) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).toEqual([])
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
    }
  })

  it('still proves two unmarked bounds after one event, and an unmarked bound on its own', async () => {
    // The controls: two delays after one event are one variable, and without trailing text an
    // unmarked bound still meets a marked one. The verb alone, so each bound is its obligation
    // (an unmarked bound on an object is not read so: `numeric-held.test.ts`).
    for (const [a, b] of [
      [
        'sound at least 5 seconds after the door opens',
        'sound at most 3 seconds after the door opens',
      ],
      ['sound above 5 seconds', 'sound for at most 3 seconds'],
    ] as const) {
      expect((await verdict('alarm', a, b)).errors, a).toEqual(['FND_NUMERIC_CONTRADICTION'])
    }
  })
})

describe('AC-2-6: every rule that splits a bound off is tested against a pair that shares one', () => {
  // A qualifier rule only ever SPLITS a comparison class, and a split can only drop a proof. Under
  // the demote-not-prove contract (spec 007) a split that fires on a subject holding no clause is
  // acceptable only when the pair it drops is DISCLOSED, naming both requirements and the
  // restatement that proves it. Two rules are exact, not guesses, and keep a pair in one cell: a
  // time preposition that is the bound's own word, and a connective inside a hyphenated compound.
  // Every other exemption the tier held was a grammar guess in the proving direction, and is gone.

  it('PROVES two time bounds a time preposition introduces, and discloses a clause it opens', async () => {
    // `expire the session after at most 30 minutes`: `after` governs the bound itself, a delay,
    // and opens no clause. The condition-word rule split the gaming harness's own numeric
    // baseline, and every preposition below, off into two qualifiers.
    for (const word of ['after', 'before', 'until', 'upon', 'following', 'since', 'during']) {
      const out = await verdict(
        'session service',
        `expire the session ${word} at most 30 minutes`,
        `expire the session ${word} at least 45 minutes`,
      )
      expect(out.errors, word).toEqual(['FND_NUMERIC_CONTRADICTION'])
    }
    // The controls: a count after the same word is a clause's subject (`after at least 5
    // people arrive`), and `when` is never a preposition.
    for (const [a, b] of [
      [
        'open the door after at least 5 people arrive',
        'open the door after at most 2 people arrive',
      ],
      [
        'open the door when at least 5 people are waiting',
        'open the door when at most 2 people are waiting',
      ],
    ] as const) {
      const out = await verdict('door controller', a, b)
      // `people` is no unit the lint knows (GTWR R6), which is not this tier's verdict.
      expect(out.errors, a).not.toContain('FND_NUMERIC_CONTRADICTION')
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
    }
  })

  it('PROVES two bounds whose subject holds a condition word inside a hyphenated compound', async () => {
    const out = await verdict(
      'dispenser',
      'keep the once-daily pump running for at most 5 minutes',
      'keep the once-daily pump running for at least 8 minutes',
    )
    expect(out.errors).toEqual(['FND_NUMERIC_CONTRADICTION'])
  })

  it('DISCLOSES, and never proves, a bound behind a finite-verb spelling, whatever the word is', async () => {
    // `fill the can with ...`, `retain logs from May ...`, `fill can 3 ...`: a spelling of a modal
    // is matched as a spelling (spec 007, the demote-not-prove contract). Reading it as a noun
    // was a grammar guess that could only widen a proof, and each pair, which 669c0e9 proved, is
    // now disclosed, naming both requirements and the verb that split it.
    for (const [system, a, b, verb] of [
      [
        'filler',
        'fill the can with at most 2 liters',
        'fill the can with at least 5 liters',
        'can',
      ],
      [
        'archiver',
        'retain logs from May for at most 30 days',
        'retain logs from May for at least 60 days',
        'may',
      ],
      ['filler', 'fill can 3 with at most 2 liters', 'fill can 3 with at least 3 liters', 'can'],
      [
        'pump controller',
        'open the drain of a tank whose level can rise above 5 meters',
        'open the drain of a tank whose level can rise below 3 meters',
        'can',
      ],
      [
        'archiver',
        'retain logs whose size may grow for at most 30 days',
        'retain logs whose size may grow for at least 60 days',
        'may',
      ],
    ] as const) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).not.toContain('FND_NUMERIC_CONTRADICTION')
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
      expect(out.messages.join(' '), a).toContain(`after the finite verb "${verb}"`)
    }
  })

  it('DISCLOSES, and never proves, a bound behind a connective, whatever phrase it opens', async () => {
    // A span a kept measure is taken over (`keep the delay before the retry below 5 seconds`), a
    // modifier (`the following events`), and a condition (`before the water rises`) are one
    // spelling apart, and no rule the tier held told them apart without a word list: a verb
    // missing from it (`flew`, `slid`, `shot`, `swung`, `dove`, the plural `fish`) turned a
    // consistent pair below into a proof. A proof rests only on identical subjects and identical
    // qualifiers, so every pair here is disclosed, never proved.
    const conflicting = [
      [
        'retry controller',
        'keep the delay before the retry below 5 seconds',
        'keep the delay before the retry above 10 seconds',
        'before',
      ],
      [
        'calibration monitor',
        'keep the time since the last calibration below 30 days',
        'keep the time since the last calibration above 60 days',
        'since',
      ],
      [
        'boiler controller',
        'keep the pressure during startup below 5 bar',
        'keep the pressure during startup above 8 bar',
        'during',
      ],
      [
        'server',
        'keep the latency during peak hours below 200 milliseconds',
        'keep the latency during peak hours above 500 milliseconds',
        'during',
      ],
      [
        'heater',
        'keep the temperature during cold nights below 20 degrees celsius',
        'keep the temperature during cold nights above 30 degrees celsius',
        'during',
      ],
      [
        'governor',
        'keep the speed during startup below 100 rpm',
        'keep the speed during startup above 200 rpm',
        'during',
      ],
      [
        'archiver',
        'retain the following events for at most 30 days',
        'retain the following events for at least 60 days',
        'following',
      ],
      [
        'archiver',
        'store the provided data for at most 30 days',
        'store the provided data for at least 60 days',
        'provided',
      ],
      [
        'meter',
        'keep the instant current below 500 mA',
        'keep the instant current above 800 mA',
        'the instant',
      ],
    ] as const
    const consistent = [
      [
        'drone controller',
        'keep the height after the drone flew above 100 meters',
        'keep the height after the drone flew below 10 meters',
        'after',
      ],
      [
        'pump controller',
        'keep the level until the float slid below 3 meters',
        'keep the level until the float slid above 5 meters',
        'until',
      ],
      [
        'heater',
        'keep the temperature after the reading shot above 90 degrees celsius',
        'keep the temperature after the reading shot below 5 degrees celsius',
        'after',
      ],
      [
        'heater',
        'keep the temperature after the reading swung above 90 degrees celsius',
        'keep the temperature after the reading swung below 5 degrees celsius',
        'after',
      ],
      [
        'pump controller',
        'keep the level after the float dove below 3 meters',
        'keep the level after the float dove above 5 meters',
        'after',
      ],
      [
        'pump controller',
        'keep the level until the fish swim below 3 meters',
        'keep the level until the fish swim above 5 meters',
        'until',
      ],
      [
        'heater',
        'keep the temperature before the water rises above 60 degrees celsius',
        'keep the temperature before the water rises below 40 degrees celsius',
        'before',
      ],
      [
        'drain controller',
        'open the drain during a flood above 5 meters',
        'open the drain during a flood below 3 meters',
        'during',
      ],
      [
        'heater',
        'keep the temperature during a flood above 5 meters',
        'keep the temperature during a flood below 3 meters',
        'during',
      ],
      [
        'heater',
        'maintain the temperature after the water above 60 degrees celsius',
        'maintain the temperature after the water below 40 degrees celsius',
        'after',
      ],
      [
        'drain controller',
        'open the drain the instant the level rises above 5 meters',
        'open the drain the instant the level rises below 3 meters',
        'the instant',
      ],
    ] as const
    for (const [system, a, b, word] of [...conflicting, ...consistent]) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).not.toContain('FND_NUMERIC_CONTRADICTION')
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
      const message = out.messages.join(' ')
      expect(message, a).toContain(`after the connective "${word}"`)
      expect(message, a).toContain('While <condition>')
    }
  })

  it('PROVES the restatement a clause disclosure names, so the repair it offers is real', async () => {
    // The condition moved into the precondition, and the bound stated as the obligation: each
    // subject and qualifier is then identical, and the conflict the disclosure hid is proved.
    const stated = await verdict(
      'server',
      'keep the latency below 200 milliseconds',
      'keep the latency above 500 milliseconds',
      'peak hours are active',
    )
    expect(stated.errors).toEqual(['FND_NUMERIC_CONTRADICTION'])
    const complement = await verdict(
      'server',
      'keep the response time below 200 milliseconds',
      'keep the response time above 500 milliseconds',
    )
    expect(complement.errors).toEqual(['FND_NUMERIC_CONTRADICTION'])
  })

  it('DISCLOSES a bound after a nested clause that ends in a participle, whose bound it may be', async () => {
    // `keep the temperature where the sensor is mounted below 20 degrees celsius` bounds the
    // temperature, and 669c0e9 proved it; `keep the temperature where the water is heated above
    // 60 degrees celsius` bounds the water inside the clause, and its pair is consistent. The two
    // differ only in which participle, and no rule this tier holds tells `mounted` from `heated`,
    // so both are disclosed and neither is proved (spec 007 N4: undecidable, disclosed).
    for (const [system, a, b] of [
      [
        'heater',
        'keep the temperature where the sensor is mounted below 20 degrees celsius',
        'keep the temperature where the sensor is mounted above 30 degrees celsius',
      ],
      [
        'heater',
        'keep the temperature where the water is heated above 60 degrees celsius',
        'keep the temperature where the water is heated below 40 degrees celsius',
      ],
      [
        'cooler',
        'keep the temperature of the room that is occupied below 20 degrees celsius',
        'keep the temperature of the room that is occupied above 30 degrees celsius',
      ],
      [
        'heater',
        'keep the temperature of the water that is heated above 60 degrees celsius',
        'keep the temperature of the water that is heated below 40 degrees celsius',
      ],
    ] as const) {
      const out = await verdict(system, a, b)
      expect(out.errors, a).toEqual([])
      expect(out.uncompared, a).toEqual([[ID_A, ID_B]])
    }
  })
})
