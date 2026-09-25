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
 * One reading relaxes the rule, and it comes from the numeric tier rather than from R6: a
 * unit the numeric tier converts (`DIMENSIONS`) is a unit.
 * Everything else is an R6 error exactly as before; `src/testing/r6-corpus.test.ts` pins that.
 */

import { describe, expect, it } from 'vitest'
import { renderSentence } from '../core/render.ts'
import type { Requirement } from '../core/schema.ts'
import { DIMENSIONS } from '../formal/numeric.ts'
import { runCheck } from '../pipeline/check.ts'
import { checkGtWRules } from './gtwr.ts'

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
