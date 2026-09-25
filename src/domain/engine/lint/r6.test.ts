/**
 * GTWR_R6_MISSING_UNITS — which numerals are amounts that forgot their unit.
 *
 * An R6 ERROR excludes its requirement from the formal tier, so R6 fails in two directions.
 * An error on a numeral that is not an amount turns a consistent document into exit 1: spec
 * 007 AC-2-6 lists "hold zone 1 temperature above 20 degrees celsius" plus "hold zone 2
 * temperature below 5 degrees celsius" with "Required: no error for any of them". A missing
 * error on a unitless amount admits a setpoint no tier compares, so "set the fan to 80" beside
 * "set the fan to 20" reaches `verified: true`.
 *
 * The readings that relax the rule all come from the numeric tier rather than from R6:
 *   - a unit the numeric tier converts (`DIMENSIONS`) is a unit;
 *   - a digit run inside a number that tier reads with such a unit is part of that number
 *     (`1` in `1,500 ms`);
 *   - a numeral inside the quantity subject of a bound that tier reads with a converted unit,
 *     between a noun whose instances are numbered and the noun naming what the bound
 *     measures (`zone 1 temperature`), names WHICH quantity it is, when that numbered noun
 *     is the object of a verb that governs a quantity (`hold`, `keep`) or starts a guard.
 * Everything else is an R6 error exactly as before; `src/testing/r6-corpus.test.ts` pins that.
 */

import { describe, expect, it } from 'vitest'
import { renderSentence } from '../core/render.ts'
import type { Requirement } from '../core/schema.ts'
import { DIMENSIONS } from '../formal/numeric.ts'
import { runCheck } from '../pipeline/check.ts'
import { checkGtWRules, R6_GOVERNING_VERBS, R6_NUMBERED_NOUNS, R6_QUANTITY_NOUNS } from './gtwr.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ID_B = 'aaaaaaaa-0000-4000-8000-00000000000b'

type Slots = Pick<Requirement, 'patternType' | 'systemName' | 'systemResponse'> &
  Partial<Pick<Requirement, 'trigger' | 'preCondition' | 'negated'>>

const stored = (id: string, slots: Slots): Requirement => {
  const r: Requirement = {
    id,
    negated: false,
    ...slots,
    sentence: '',
    priority: 'medium',
    status: 'draft',
    derives: [],
    satisfies: [],
    verifies: [],
    refines: [],
    createdAt: TS,
    updatedAt: TS,
  }
  return { ...r, sentence: renderSentence(r) }
}

const ubiquitous = (systemResponse: string, systemName = 'controller'): Slots => ({
  patternType: 'ubiquitous',
  systemName,
  systemResponse,
})

const r6Numerals = (slots: Slots): string[] => {
  const r = stored(ID_A, slots)
  return checkGtWRules(r, r.sentence)
    .filter((f) => f.code === 'GTWR_R6_MISSING_UNITS')
    .map((f) => r.sentence.slice(f.span[0], f.span[1]))
}

const pairDoc = (a: Slots, b: Slots) => ({
  requirements: { [ID_A]: stored(ID_A, a), [ID_B]: stored(ID_B, b) },
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
  stateModel: { variables: [] },
})

const checkPair = (a: Slots, b: Slots) => runCheck(pairDoc(a, b) as never, {})

describe('GTWR_R6 in a full check: identifier numerals in a consistent document', () => {
  const reproducers = [
    [
      'AC-2-6 zone reproducer',
      'refrigeration controller',
      'hold zone 1 temperature above 20 degrees celsius',
      'hold zone 2 temperature below 5 degrees celsius',
    ],
    [
      'B8 digit1 (link) reproducer',
      'network controller',
      'keep link 1 throughput above 500 Mbps',
      'keep link 2 throughput below 100 Mbps',
    ],
  ] as const

  for (const [name, system, a, b] of reproducers) {
    it(`${name}: counts.error is 0 and nothing is excluded from the formal tier`, async () => {
      const report = await checkPair(ubiquitous(a, system), ubiquitous(b, system))
      expect(report.counts.error, JSON.stringify(report.findings)).toBe(0)
      const codes = report.findings.map((f) => f.code)
      expect(codes).not.toContain('GTWR_R6_MISSING_UNITS')
      expect(codes).not.toContain('FND_EXCLUDED_FROM_FORMAL')
    })
  }

  it('the control reaches the solver: one link, opposed time bounds, one contradiction', async () => {
    // Admitting the requirement is what makes this proof possible at all: under the old R6
    // error both sides were excluded and nothing was compared. A holding verb's TIME bound is
    // held whatever its object (`numeric.ts` `unheldBy`), so the numeric tier proves it.
    const report = await checkPair(
      ubiquitous('keep link 1 latency above 20 milliseconds', 'network controller'),
      ubiquitous('keep link 1 latency below 5 milliseconds', 'network controller'),
    )
    const codes = report.findings.map((f) => f.code)
    expect(codes).toContain('FND_NUMERIC_CONTRADICTION')
    expect(codes).not.toContain('FND_EXCLUDED_FROM_FORMAL')
  })

  it('the zone control is admitted and disclosed, never proved: `hold` holds no compound', async () => {
    // `hold zone 1 temperature` is admitted by R6, so nothing is excluded. The numeric tier
    // proves a non-time bound only after a holding verb and ONE noun (`unheldBy`, a244027):
    // `zone 1 temperature` may be a state the zone is held in, so the opposed pair is
    // disclosed and `verified` is false.
    const report = await checkPair(
      ubiquitous('hold zone 1 temperature above 20 degrees celsius', 'refrigeration controller'),
      ubiquitous('hold zone 1 temperature below 5 degrees celsius', 'refrigeration controller'),
    )
    const codes = report.findings.map((f) => f.code)
    expect(codes).toContain('FND_NUMERIC_UNCOMPARED')
    expect(codes).not.toContain('FND_NUMERIC_CONTRADICTION')
    expect(codes).not.toContain('FND_EXCLUDED_FROM_FORMAL')
    expect(report.verified).toBe(false)
  })
})

describe('GTWR_R6 in a full check: a unitless amount keeps the requirement out', () => {
  // Each pair is two setpoints that conflict and that no tier compares, because neither has
  // a unit. The R6 error is the only thing between it and `verified: true`. The shapes are
  // the ones every earlier relaxation of R6 was caught admitting, plus the ones a numeral
  // inside a converted bound's subject could be mistaken for.
  const pairs = [
    ['set the fan to 80', 'set the fan to 20', '80'],
    ['set the fan to 80 within 5 seconds', 'set the fan to 20 within 5 seconds', '80'],
    [
      'set the fan to 80 while the zone temperature is above 20 degrees celsius',
      'set the fan to 20 while the zone temperature is above 20 degrees celsius',
      '80',
    ],
    [
      'set the heater to 80 temperature above 20 °C',
      'set the heater to 20 temperature above 20 °C',
      '80',
    ],
    ['keep the room 22 constant above 18 °C', 'keep the room 18 constant above 18 °C', '22'],
    ['keep the fan 80 spinning above 20 Hz', 'keep the fan 20 spinning above 20 Hz', '80'],
    ['keep the pump 50 running over 10 minutes', 'keep the pump 20 running over 10 minutes', '50'],
    ['keep the room 22 constant', 'keep the room 18 constant', '22'],
    ['hold the motor 3000 steady', 'hold the motor 1500 steady', '3000'],
    [
      'set the fan to 80, 5 seconds after the alarm',
      'set the fan to 20, 5 seconds after the alarm',
      '80',
    ],
    ['set the delay to 30 due to the fault', 'set the delay to 60 due to the fault', '30'],
    ['hold each item 30 before release', 'hold each item 60 before release', '30'],
    ['set zone 1 to 20', 'set zone 1 to 30', '20'],
    // a numbered noun before the numeral, and a word after it that is not what the bound
    // measures (the quantity-noun gate in identifierNumerals), or a quantity noun of another
    // dimension than the bound's (the gate's dimension keying)
    [
      'keep the valve 30 open for at least 10 minutes',
      'keep the valve 70 open for at least 10 minutes',
      '30',
    ],
    ['keep tank 80 full for at least 5 minutes', 'keep tank 20 full for at least 5 minutes', '80'],
    [
      'keep oven 180 temperature for at least 10 minutes',
      'keep oven 220 temperature for at least 10 minutes',
      '180',
    ],
    // an `_` digit-group separator: `_` is a word character, so a `\b`-bounded digit run
    // never started inside `1_500`, and the amount had no R6 finding at all
    ['set the fan to 1_500', 'set the fan to 2_000', '1'],
    ['set the delay to 30_000', 'set the delay to 60_000', '30'],
  ] as const

  for (const [a, b, amount] of pairs) {
    it(`"${a}" / "${b}": R6 error on ${amount}, both excluded, not verified`, async () => {
      const report = await checkPair(ubiquitous(a), ubiquitous(b))
      const r6 = report.findings.filter((f) => f.code === 'GTWR_R6_MISSING_UNITS')
      expect(r6.map((f) => f.severity)).toContain('error')
      expect(r6.some((f) => f.message.includes(`"${amount}"`))).toBe(true)
      expect(report.findings.filter((f) => f.code === 'FND_EXCLUDED_FROM_FORMAL')).toHaveLength(2)
      expect(report.verified).toBe(false)
    })
  }
})

describe('GTWR_R6 in a full check: an amount written before its quantity noun keeps its error', () => {
  // '<verb or modifier> N <quantity noun> <comparator> <converted unit>' has the numeral inside
  // a converted bound's subject, directly before the noun naming what the bound measures, yet
  // the numeral is an AMOUNT (a target, a delay, a setpoint), not which quantity it is. Each
  // pair clashes on that amount, and no tier compares it, so the R6 error is the only guard.
  const event = (systemResponse: string): Slots => ({
    patternType: 'event-driven',
    systemName: 'controller',
    trigger: 'the alarm sounds',
    systemResponse,
  })
  const pairs: ReadonlyArray<readonly [Slots, Slots, string, string]> = [
    [
      ubiquitous('target 5 latency below 10 ms', 'encoder'),
      {
        patternType: 'state-driven',
        systemName: 'encoder',
        preCondition: 'streaming',
        systemResponse: 'target 8 latency below 10 ms',
      },
      '5',
      '8',
    ],
    [
      event('apply 30 delay below 60 seconds'),
      event('apply 90 delay below 60 seconds'),
      '30',
      '90',
    ],
    [
      ubiquitous('deliver 50 volume below 500 L', 'pump'),
      ubiquitous('deliver 20 volume below 500 L', 'pump'),
      '50',
      '20',
    ],
    [
      ubiquitous('keep setpoint 22 temperature above 18 °C'),
      ubiquitous('keep setpoint 16 temperature above 18 °C'),
      '22',
      '16',
    ],
    [
      ubiquitous('pump 50 volume below 500 L', 'system'),
      ubiquitous('pump 20 volume below 500 L', 'system'),
      '50',
      '20',
    ],
    // a numbered noun as the indirect object of a double-object verb, after a quantifier:
    // `each job 30` cannot name one job, so 30 is the amount each one is given
    [
      ubiquitous('grant each job 30 timeout below 60 seconds', 'scheduler'),
      ubiquitous('grant each job 50 timeout below 60 seconds', 'scheduler'),
      '30',
      '50',
    ],
    [
      {
        patternType: 'event-driven',
        systemName: 'cache',
        trigger: 'the pool starts',
        systemResponse: 'allocate each worker 512 memory below 1 GB',
      },
      {
        patternType: 'event-driven',
        systemName: 'cache',
        trigger: 'the pool starts',
        systemResponse: 'allocate each worker 256 memory below 1 GB',
      },
      '512',
      '256',
    ],
    // ... and after `the`, where only the governing verb says the numeral is an amount
    [
      ubiquitous('assign the replica 64 storage below 1 GB', 'cluster'),
      ubiquitous('assign the replica 32 storage below 1 GB', 'cluster'),
      '64',
      '32',
    ],
  ]

  for (const [a, b, amountA, amountB] of pairs) {
    it(`"${a.systemResponse}" / "${b.systemResponse}": R6 errors, both excluded, exit-1 counts`, async () => {
      const report = await checkPair(a, b)
      const r6 = report.findings.filter((f) => f.code === 'GTWR_R6_MISSING_UNITS')
      for (const amount of [amountA, amountB]) {
        expect(
          r6.some((f) => f.severity === 'error' && f.message.includes(`"${amount}"`)),
          `${amount}: ${JSON.stringify(r6)}`,
        ).toBe(true)
      }
      expect(report.counts.error).toBeGreaterThanOrEqual(2)
      expect(report.findings.filter((f) => f.code === 'FND_EXCLUDED_FROM_FORMAL')).toHaveLength(2)
      expect(report.verified).toBe(false)
    })
  }
})

describe('GTWR_R6: a unit the numeric tier converts is never a missing unit', () => {
  // One source: R6 reads the numeric tier's DIMENSIONS through the tier's own unit reader,
  // so every spelling the tier compares arithmetically is a unit to R6 as well.
  const spellings = DIMENSIONS.flatMap((d) => [...Object.keys(d.symbols), ...Object.keys(d.words)])

  it.each(spellings)('"at most 5 %s" carries its unit', (unit) => {
    expect(r6Numerals(ubiquitous(`keep the reading at most 5 ${unit}`))).toEqual([])
  })

  it('a spelling no dimension lists is still missing a unit', () => {
    expect(r6Numerals(ubiquitous('keep the pressure at most 5 bar'))).toEqual(['5'])
    expect(r6Numerals(ubiquitous('keep the concentration below 5 ppm'))).toEqual(['5'])
  })
})

describe('GTWR_R6: a number the numeric tier reads with a converted unit carries it whole', () => {
  // The numeric tier's NUMBER token reads `1,500 ms` as 1500 ms. R6's digit run stops at the
  // comma, so without the tier's number spans it reads `1` against `,500 ms` and calls a
  // correctly united bound a bare number.
  it.each([
    ['respond within 1,500 ms'],
    ['respond within 12,345.5 ms'],
    ['keep the queue delay below 1,000,000 ms'],
    ['keep zone 1 temperature below 1,000 °C'],
  ])('"%s": no R6 finding', (response) => {
    expect(r6Numerals(ubiquitous(response))).toEqual([])
  })

  it('reads the number through the stored negation, flag or leading negator', () => {
    expect(r6Numerals({ ...ubiquitous('respond within 1,500 ms'), negated: true })).toEqual([])
    expect(r6Numerals(ubiquitous('not respond within 1,500 ms'))).toEqual([])
    // `never ` is longer than the number's tail after its first digit run (`,500`), so a span
    // left at the unstripped offset no longer covers the `1`
    expect(r6Numerals(ubiquitous('never respond within 1,500 ms'))).toEqual([])
  })

  it('reads a guard slot at its own offset', () => {
    expect(
      r6Numerals({
        patternType: 'event-driven',
        systemName: 'gateway',
        trigger: 'the queue delay is above 1,500 ms',
        systemResponse: 'shed load',
      }),
    ).toEqual([])
  })

  it.each([
    // no bound: nothing the tier reads, so every digit run is a bare number
    ['set the fan to 1,500', ['1', '500']],
    // a bound whose unit the tier does not convert
    ['keep the pressure below 1,500 bar', ['1', '500']],
    // a decimal comma, which the tier's NUMBER token refuses to read at all
    ['respond within 1,5 ms', ['1']],
    // a toleranced value, which the tier declines as a bound
    ['respond within 1,500 ms ± 5 ms', ['1']],
    // an `_` digit-group separator, which the tier's NUMBER token does not read: each digit
    // group is a digit run, as each `,` group is
    ['set the fan to 1_500', ['1', '500']],
    ['respond within 1_500 ms', ['1']],
    ['respond within 30_000 ms', ['30']],
  ] as const)('"%s": R6 errors on %j', (response, numerals) => {
    expect(r6Numerals(ubiquitous(response))).toEqual(numerals)
  })

  it('an `_` inside a name is not a digit-group separator', () => {
    expect(r6Numerals(ubiquitous('log sensor_2 within 5 ms'))).toEqual([])
    expect(r6Numerals(ubiquitous('read the v2_config within 5 ms'))).toEqual([])
  })

  it('in a full check both sides are admitted, and a real clash on them is proved', async () => {
    const gateway = (systemResponse: string): Slots => ({
      patternType: 'event-driven',
      systemName: 'api gateway',
      trigger: 'the request arrives',
      systemResponse,
    })
    const consistent = await checkPair(
      gateway('respond within 1,500 ms'),
      gateway('respond within 2,000 ms'),
    )
    const codes = consistent.findings.map((f) => f.code)
    expect(consistent.counts.error, JSON.stringify(consistent.findings)).toBe(0)
    expect(codes).not.toContain('GTWR_R6_MISSING_UNITS')
    expect(codes).not.toContain('FND_EXCLUDED_FROM_FORMAL')

    const clash = await checkPair(
      gateway('respond within 1,500 ms'),
      gateway('respond in at least 2,000 ms'),
    )
    expect(clash.findings.map((f) => f.code)).toContain('FND_NUMERIC_CONTRADICTION')
  })
})

describe('GTWR_R6: a numeral naming which quantity a converted bound is on', () => {
  it.each([
    ['hold zone 1 temperature above 20 degrees celsius'],
    ['keep link 2 throughput below 100 Mbps'],
    ['hold zone 1 temperature not above 20 °C'],
    ['keep disk 2 usage below 5 GB'],
    ['keep axis 3 position within 5 mm'],
    ['keep link 1 latency below 5 ms'],
    ['keep the zone 1 temperature above 20 °C'],
    ['keep the tank 2 volume below 500 L'],
  ])('"%s": no R6 finding', (response) => {
    expect(r6Numerals(ubiquitous(response))).toEqual([])
  })

  it('reads the subject through the stored negation, flag or leading `not`', () => {
    const response = 'hold zone 1 temperature above 20 degrees celsius'
    expect(r6Numerals({ ...ubiquitous(response), negated: true })).toEqual([])
    expect(r6Numerals(ubiquitous(`not ${response}`))).toEqual([])
    // A negated response with a trailing qualifier is one the numeric tier declines, so it
    // has no bound, and its numeral stays an amount.
    expect(r6Numerals(ubiquitous(`not ${response} during defrost`))).toEqual(['1'])
  })

  it('reads guard slots at their own offsets in the rendered sentence', () => {
    expect(
      r6Numerals({
        patternType: 'event-driven',
        systemName: 'controller',
        preCondition: 'zone 2 temperature is below 5 degrees celsius',
        trigger: 'the door opens',
        systemResponse: 'set the fan to 80',
      }),
    ).toEqual(['80'])
  })

  it.each([
    // the subject ends at the numeral: the comparator bounds the numeral's own phrase
    ['hold zone 1 above 20 °C', ['1']],
    // more subject follows the numeral than the measured noun
    ['hold zone 1 air temperature above 20 degrees celsius', ['1']],
    ['set the fan to 80 while the zone temperature is above 20 degrees celsius', ['80']],
    // an amount's position: after a word the numeric tier reads as "no unit follows"
    ['set the heater to 80 temperature above 20 °C', ['80']],
    ['keep the room at 22 temperature above 18 °C', ['22']],
    // the last word does not name what the dimension measures
    ['keep the room 22 constant above 18 °C', ['22']],
    ['keep the pump 50 running over 10 minutes', ['50']],
    // ... even after a numbered noun, where only the quantity-noun gate stands in the way
    ['keep the valve 30 open for at least 10 minutes', ['30']],
    ['keep heater 80 running over 10 minutes', ['80']],
    ['keep the heater 80 constant above 20 °C', ['80']],
    ['keep tank 80 full for at least 5 minutes', ['80']],
    // the last word names what ANOTHER dimension measures than the bound's
    ['keep oven 180 temperature for at least 10 minutes', ['180']],
    ['keep zone 1 latency above 20 °C', ['1']],
    ['keep disk 2 temperature below 5 GB', ['2']],
    // the word before the numeral is not a noun that numbers its instances: a verb or a
    // modifier stands there, and the numeral is the amount it sets
    ['target 5 latency below 10 ms', ['5']],
    ['allocate 512 memory below 1 GB', ['512']],
    ['use 30 timeout below 60 seconds', ['30']],
    ['add 5 delay within 10 seconds', ['5']],
    ['hold max 80 temperature below 90 °C', ['80']],
    ['keep target 22 temperature above 18 °C', ['22']],
    ['keep setpoint 22 temperature above 18 °C', ['22']],
    ['keep ambient 22 temperature above 18 °C', ['22']],
    ['keep room 22 temperature above 18 °C', ['22']],
    ['keep water 60 temperature above 50 °C', ['60']],
    // a numbered noun that is the response's verb is still the verb
    ['pump 50 volume below 500 L', ['50']],
    ['scale 1 load below 5 kg', ['1']],
    ['link 1 throughput above 500 Mbps', ['1']],
    // the bound's unit is not converted, so no dimension says what it measures
    ['keep pump 3 pressure below 5 bar', ['3', '5']],
    // no bound at all: `exceeds` is not a comparator the numeric tier reads
    ['hold zone 1 temperature exceeding nothing and set the fan to 80', ['1', '80']],
    // a quantifier before the numbered noun: `each job 30` cannot name one job
    ['grant each job 30 timeout below 60 seconds', ['30']],
    ['give every worker 30 timeout below 60 seconds', ['30']],
    ['assign each node 64 memory below 1 GB', ['64']],
    ['allow each instance 30 delay below 60 seconds', ['30']],
    ['give each heater 80 temperature above 20 °C', ['80']],
    ['give each zone 22 temperature above 18 °C', ['22']],
    ['allocate each worker 512 memory below 1 GB', ['512']],
    // a verb that does not govern a quantity as its object: a double-object verb gives the
    // numbered noun the amount, with or without a determiner, and any other verb is ambiguous
    ['assign the replica 64 storage below 1 GB', ['64']],
    ['grant job 30 timeout below 60 seconds', ['30']],
    ['set zone 1 temperature above 20 °C', ['1']],
    ['immediately grant the job 30 timeout below 60 seconds', ['30']],
  ] as const)('"%s": R6 errors on %j', (response, numerals) => {
    expect(r6Numerals(ubiquitous(response))).toEqual(numerals)
  })

  // Quantifying determiners: before a numbered noun each makes the numeral an amount per
  // instance. None is a governing verb, so none is ever read past.
  it.each([
    'each',
    'every',
    'any',
    'a',
    'an',
    'per',
    'all',
  ])('a quantifier `%s` before the numbered noun keeps the error', (q) => {
    expect(r6Numerals(ubiquitous(`keep ${q} zone 7 temperature above 5 °C`))).toEqual(['7'])
    expect(r6Numerals(ubiquitous(`keep ${q} job 7 timeout below 60 seconds`))).toEqual(['7'])
  })

  it('every governing verb reads the numeral after its numbered object as a label', () => {
    for (const verb of R6_GOVERNING_VERBS) {
      expect(r6Numerals(ubiquitous(`${verb} zone 7 temperature above 5 °C`)), verb).toEqual([])
      expect(r6Numerals(ubiquitous(`${verb} the zone 7 temperature above 5 °C`)), verb).toEqual([])
      expect(
        r6Numerals({
          patternType: 'state-driven',
          systemName: 'plant',
          preCondition: `the controller ${verb}s zone 7 temperature above 5 °C`,
          systemResponse: 'log the state',
        }),
        `${verb}s`,
      ).toEqual([])
    }
  })

  it('reads a guard slot the same way: a quantifier or a non-governing word keeps the error', () => {
    const pre = (preCondition: string): Slots => ({
      patternType: 'state-driven',
      systemName: 'controller',
      preCondition,
      systemResponse: 'log the state',
    })
    expect(r6Numerals(pre('each zone 2 temperature is below 5 °C'))).toEqual(['2'])
    expect(r6Numerals(pre('the pump runs and zone 2 temperature is below 5 °C'))).toEqual(['2'])
    expect(r6Numerals(pre('the zone 2 temperature is below 5 °C'))).toEqual([])
    expect(
      r6Numerals({
        patternType: 'event-driven',
        systemName: 'scheduler',
        trigger: 'the job starts',
        systemResponse: 'grant each job 30 timeout below 60 seconds',
      }),
    ).toEqual(['30'])
  })

  it('reads a guard slot the same way: a verb before the numeral keeps its error', () => {
    const guarded = (trigger: string): Slots => ({
      patternType: 'event-driven',
      systemName: 'controller',
      trigger,
      systemResponse: 'stop',
    })
    expect(r6Numerals(guarded('the fan reaches 80 temperature above 20 °C'))).toEqual(['80'])
    expect(r6Numerals(guarded('zone 1 temperature is above 20 °C'))).toEqual([])
  })

  it('reads only a sentence that is the requirement rendering', () => {
    // The spans come from the slots; a sentence the slots do not render has none.
    const r = stored(ID_A, ubiquitous('hold zone 1 temperature above 20 degrees celsius'))
    const other = 'The controller shall hold zone 1 temperature above 20 degrees celsius!'
    const r6 = checkGtWRules(r, other).filter((f) => f.code === 'GTWR_R6_MISSING_UNITS')
    expect(r6.map((f) => other.slice(f.span[0], f.span[1]))).toEqual(['1'])
  })

  it('every quantity noun is keyed by a converted dimension and reads a numeral as a label', () => {
    // A key no dimension carries is dead, and a noun that never exempts is dead too.
    const byName = new Map(DIMENSIONS.map((d) => [d.name, d]))
    for (const [dimension, nouns] of Object.entries(R6_QUANTITY_NOUNS)) {
      const dim = byName.get(dimension)
      expect(dim, dimension).toBeDefined()
      const unit = Object.keys(dim?.words ?? {})[0] ?? Object.keys(dim?.symbols ?? {})[0]
      for (const noun of nouns) {
        expect(r6Numerals(ubiquitous(`keep zone 7 ${noun} below 5 ${unit}`)), noun).toEqual([])
      }
    }
  })

  it("every numbered noun reads the numeral after it as a label, and none as a response's first word", () => {
    for (const noun of R6_NUMBERED_NOUNS) {
      expect(r6Numerals(ubiquitous(`keep ${noun} 7 temperature above 5 °C`)), noun).toEqual([])
      expect(r6Numerals(ubiquitous(`${noun} 7 temperature above 5 °C`)), noun).toEqual(['7'])
    }
  })
})
