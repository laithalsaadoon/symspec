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
 * Two readings relax the rule, and both come from the numeric tier rather than from R6:
 *   - a unit the numeric tier converts (`DIMENSIONS`) is a unit;
 *   - a numeral inside the quantity subject of a bound that tier reads with a converted unit,
 *     directly before the noun naming what the bound measures, names WHICH quantity it is.
 * Everything else is an R6 error exactly as before; `src/testing/r6-corpus.test.ts` pins that.
 */

import { describe, expect, it } from 'vitest'
import { renderSentence } from '../core/render.ts'
import type { Requirement } from '../core/schema.ts'
import { DIMENSIONS } from '../formal/numeric.ts'
import { runCheck } from '../pipeline/check.ts'
import { checkGtWRules, R6_QUANTITY_NOUNS } from './gtwr.ts'

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

  it('the control reaches the solver: one zone, opposed bounds, one contradiction', async () => {
    // Admitting the requirement is what makes this proof possible at all: under the old R6
    // error both sides were excluded and nothing was compared.
    const report = await checkPair(
      ubiquitous('hold zone 1 temperature above 20 degrees celsius', 'refrigeration controller'),
      ubiquitous('hold zone 1 temperature below 5 degrees celsius', 'refrigeration controller'),
    )
    const codes = report.findings.map((f) => f.code)
    expect(codes).toContain('FND_NUMERIC_CONTRADICTION')
    expect(codes).not.toContain('FND_EXCLUDED_FROM_FORMAL')
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

describe('GTWR_R6: a numeral naming which quantity a converted bound is on', () => {
  it.each([
    ['hold zone 1 temperature above 20 degrees celsius'],
    ['keep link 2 throughput below 100 Mbps'],
    ['hold zone 1 temperature not above 20 °C'],
    ['keep disk 2 usage below 5 GB'],
    ['keep axis 3 position within 5 mm'],
    ['keep link 1 latency below 5 ms'],
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
    // the bound's unit is not converted, so no dimension says what it measures
    ['keep pump 3 pressure below 5 bar', ['3', '5']],
    // no bound at all: `exceeds` is not a comparator the numeric tier reads
    ['hold zone 1 temperature exceeding nothing and set the fan to 80', ['1', '80']],
  ] as const)('"%s": R6 errors on %j', (response, numerals) => {
    expect(r6Numerals(ubiquitous(response))).toEqual(numerals)
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
        expect(r6Numerals(ubiquitous(`keep unit 7 ${noun} below 5 ${unit}`)), noun).toEqual([])
      }
    }
  })
})
