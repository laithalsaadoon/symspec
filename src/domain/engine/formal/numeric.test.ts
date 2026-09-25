/**
 * What a numeric predicate CLAIMS is a function of the slot it was read out of.
 *
 * A bound in a guard slot is part of the antecedent that decides where a requirement is
 * live; the same bound in the response is the obligation it imposes there. The tier
 * reports the role in `evidence.numeric.predicates[].slot`, so the stamp is output bytes
 * and a caller cannot hand over a slot the extractor then relabels.
 */

import { describe, expect, it } from 'vitest'
import { extractNumericPredicates, type PredicateSlot, RAW_UNIT_DIMENSION } from './numeric.ts'

describe('a numeric predicate is stamped with the slot it was read out of', () => {
  const SLOTS: readonly PredicateSlot[] = ['resp', 'trig', 'pre']

  it.each(SLOTS)('stamps %s on every predicate the caller attributes to it', (slot) => {
    const preds = extractNumericPredicates(
      'the temperature is above 5 degrees celsius',
      'vent controller',
      slot,
    )
    expect(preds.map((p) => p.slot)).toEqual([slot])
  })

  it('reads the same bound identically out of every slot but the stamp', () => {
    // The stamp must be the ONLY difference: a slot that also moved the quantity key or
    // the comparator would partition bounds the document places on one thing, which is a
    // MISS the split-only argument does not license.
    const [resp, trig, pre] = SLOTS.map((slot) =>
      extractNumericPredicates('respond within 200 ms', 'gateway', slot),
    )
    expect(resp).toHaveLength(1)
    const withoutSlot = (preds: ReturnType<typeof extractNumericPredicates>) =>
      preds.map(({ slot: _slot, ...rest }) => rest)
    expect(withoutSlot(trig ?? [])).toEqual(withoutSlot(resp ?? []))
    expect(withoutSlot(pre ?? [])).toEqual(withoutSlot(resp ?? []))
  })

  it('stamps EVERY bound in a multi-bound slot, not just the first', () => {
    // A guard can carry two conditions, and the tier reads a predicate out of each. A
    // stamp applied once would leave the second bound labelled by whatever the field
    // defaulted to.
    const preds = extractNumericPredicates(
      'the request latency is above 5 ms and the queue depth is below 3',
      'gateway',
      'pre',
    )
    expect(preds.map((p) => [p.comparator, p.value, p.slot])).toEqual([
      ['<', 3, 'pre'],
      ['>', 5, 'pre'],
    ])
  })
})

describe('a bound carries its dimension, its unit, and an exact value (spec 007 AC-2-5)', () => {
  const one = (text: string) => {
    const preds = extractNumericPredicates(text, 'svc', 'resp')
    expect(preds).toHaveLength(1)
    const [p] = preds
    return {
      exact: `${p?.exact.numerator}/${p?.exact.denominator}`,
      dimension: p?.dimension,
      baseUnit: p?.baseUnit,
    }
  }

  it('converts a recognized unit into its base exactly', () => {
    expect(one('keep the session open at least 1.1 hours')).toEqual({
      exact: '3960000/1',
      dimension: 'time',
      baseUnit: 'ms',
    })
    expect(one('hold the cabin temperature at least 51 degrees fahrenheit')).toEqual({
      exact: '95/9',
      dimension: 'temperature',
      baseUnit: '°C',
    })
  })

  it('keys an unrecognized unit on its raw text, case and rate suffix included', () => {
    expect(one('retain audit logs for at least 3 months')).toEqual({
      exact: '3/1',
      dimension: RAW_UNIT_DIMENSION,
      baseUnit: 'months',
    })
    expect(one('sample the sensor at least 100 times per minute')).toEqual({
      exact: '100/1',
      dimension: RAW_UNIT_DIMENSION,
      baseUnit: 'times per minute',
    })
    expect(one('keep the firmware image at least 64 Mb').baseUnit).toBe('Mb')
  })

  it('reads a day or a week as a time, carrying its length in civil days', () => {
    // A civil day is 23 to 25 hours across a daylight-saving change, so the nominal 24-hour
    // value is only the display and disclosure reading; the proof reads `days` against a
    // bounded day length (`numeric-contradiction.ts`).
    const civil = (text: string) => {
      const [p] = extractNumericPredicates(text, 'svc', 'resp')
      return [p?.dimension, p?.baseUnit, p?.value, `${p?.days?.numerator}/${p?.days?.denominator}`]
    }
    expect(civil('retain logs for at least 2 days')).toEqual(['time', 'ms', 172_800_000, '2/1'])
    expect(civil('retain logs for at least 1 day')).toEqual(['time', 'ms', 86_400_000, '1/1'])
    expect(civil('retain logs for at most 1.5 weeks')).toEqual(['time', 'ms', 907_200_000, '21/2'])
    // A fixed-length unit carries no civil-day count.
    expect(civil('retain logs for at most 24 hours')[3]).toBe('undefined/undefined')
  })

  it('reads `%` and `percent` as one percent dimension, never as a bare number', () => {
    // `%` matched no unit pattern, so `at least 50%` was the unitless `50`, and it met `at
    // most 0.9` on one variable.
    const percent = { exact: '50/1', dimension: 'percent', baseUnit: '%' }
    expect(one('keep the valve opening at least 50%')).toEqual(percent)
    expect(one('keep the valve opening at least 50 %')).toEqual(percent)
    expect(one('keep the valve opening at least 50 percent')).toEqual(percent)
  })

  it('reads scientific notation exactly, never as a mantissa with the unit `e`', () => {
    // `1e3 ms` was read as `1` in the unit `e`, and `at most 1e3 ms` against `at least 5e2
    // ms` was `<= 1 ∧ >= 5`, an error on a satisfiable pair.
    expect(one('respond in at most 1e3 ms')).toEqual({
      exact: '1000/1',
      dimension: 'time',
      baseUnit: 'ms',
    })
    expect(one('respond in at least 1.5E-3 s')).toEqual({
      exact: '3/2',
      dimension: 'time',
      baseUnit: 'ms',
    })
    expect(one('keep latency below 2e+2')).toEqual({ exact: '200/1', dimension: '', baseUnit: '' })
  })

  it('declines an exponent too long to be one, rather than reading a prefix of it', () => {
    expect(extractNumericPredicates('respond in at most 1e1234 ms', 'svc', 'resp')).toEqual([])
  })

  it('leaves a bare number unitless, and a function word after it is not a unit', () => {
    expect(one('keep latency below 100')).toEqual({ exact: '100/1', dimension: '', baseUnit: '' })
    expect(one('keep latency below 100 and log it')).toEqual({
      exact: '100/1',
      dimension: '',
      baseUnit: '',
    })
  })
})

describe('a negated response is read through its negation, or not at all (spec 007 AC-2-6)', () => {
  const negated = (text: string) =>
    extractNumericPredicates(text, 'door controller', 'resp', undefined, true).map((p) => [
      p.comparator,
      p.value,
      p.sourceText,
    ])

  it('negates the one bound of a response that is only that bound', () => {
    expect(negated('keep the door unlocked above 30 seconds')).toEqual([
      ['<=', 30_000, 'not above 30 seconds'],
    ])
  })

  it('does not count a word that merely starts with a comparator as a declined bound', () => {
    // `under` opens `underfloor`; read as a comparator with no number it would be a
    // declined bound, and the negated response would be dropped for nothing.
    expect(negated('keep the underfloor heater on above 30 seconds')).toEqual([
      ['<=', 30_000, 'not above 30 seconds'],
    ])
  })

  it('declines two bounds: NOT (A and B) is not (NOT A) and (NOT B)', () => {
    expect(negated('keep the door unlocked above 30 seconds and below 60 seconds')).toEqual([])
  })

  it('declines a bound followed by a qualifier it cannot read', () => {
    expect(negated('keep the door unlocked below 30 seconds during a fire drill')).toEqual([])
  })

  it('declines a bound beside a comparator it could not read', () => {
    expect(
      negated('keep the door unlocked above the alarm threshold and below 30 seconds'),
    ).toEqual([])
  })

  it('refuses a negation on a guard slot, which the modal does not govern', () => {
    expect(() =>
      extractNumericPredicates('the door is open above 30 seconds', 'door', 'pre', undefined, true),
    ).toThrow(RangeError)
  })
})

describe('a bound is read with its role and its whole subject (spec 007 AC-2-6)', () => {
  const read = (text: string) =>
    extractNumericPredicates(text, 'svc', 'resp').map((p) => [p.label, p.role, p.comparator])

  it('reads the role off the word that introduces the bound', () => {
    expect(read('sound the siren within 2 seconds')).toEqual([
      ['sound the siren', 'deadline', '<='],
    ])
    expect(read('respond in at most 2 seconds')).toEqual([['respond', 'deadline', '<=']])
    expect(read('sound the siren for at least 30 seconds')).toEqual([
      ['sound the siren', 'duration', '>='],
    ])
    expect(read('poll the sensor at least once every 5 seconds')).toEqual([
      ['poll the sensor', 'period', '<='],
    ])
    expect(read('keep the flight radius at most 2 km')).toEqual([
      ['keep the flight radius', '', '<='],
    ])
  })

  it('declines a count or a sign between the comparator and the number', () => {
    expect(read('poll the sensor at least twice every 5 seconds')).toEqual([])
    expect(read('keep the tank temperature below minus 5 degrees celsius')).toEqual([])
    expect(read('keep at least one of 3 replicas online')).toEqual([])
  })

  it('keeps a trailing condition on the bound, so it is never asserted unconditionally', () => {
    const qualifier = (text: string) =>
      extractNumericPredicates(text, 'svc', 'resp').map((p) => [p.label, p.qualifier])
    expect(
      qualifier('keep the temperature above 30 degrees celsius when the mode is heating'),
    ).toEqual([['keep the temperature', 'when the mode is heating']])
    expect(qualifier('run the pump at most 2 minutes after the tank fills.')).toEqual([
      ['run the pump', 'after the tank fills'],
    ])
    expect(qualifier('respond within 30 ms to a request,  While   Idle')).toEqual([
      ['respond', 'to a request, while idle'],
    ])
    // Whatever the words: no list of condition words decides what the bound holds under.
    expect(qualifier('keep the temperature above 30 degrees celsius in case of frost')).toEqual([
      ['keep the temperature', 'in case of frost'],
    ])
    expect(qualifier('store at least 30 days of logs')).toEqual([['store', 'of logs']])
    expect(qualifier('respond within 30 ms')).toEqual([['respond', undefined]])
    expect(qualifier('respond within 30 ms.')).toEqual([['respond', undefined]])
  })

  it('does not read a comparator inside a longer word', () => {
    expect(read('complete the handover 5 seconds after the alarm')).toEqual([])
  })

  it('keeps digits and non-Latin words in the subject', () => {
    expect(read('hold zone 1 temperature above 20 degrees celsius')).toEqual([
      ['hold zone 1 temperature', '', '>'],
    ])
    const [cjk] = extractNumericPredicates('keep the 温度 reading below 30 percent', 'hvac', 'resp')
    expect(cjk?.quantity).toBe('sys__hvac__qty__keep_the_温度_reading')
  })
})
