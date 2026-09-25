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

  it('gives an unmarked time bound before other text its own role', () => {
    expect(read('run the pump at most 2 minutes after the tank fills')).toEqual([
      ['run the pump', 'anchored', '<='],
    ])
    // A marked role is kept, and a non-time dimension carries none.
    expect(read('run the pump for at most 2 minutes after the tank fills')).toEqual([
      ['run the pump', 'duration', '<='],
    ])
    expect(read('keep the temperature above 30 degrees celsius when heating')).toEqual([
      ['keep the temperature', '', '>'],
    ])
  })

  it('reads a bound inside a condition with the whole clause as its qualifier', () => {
    const qualifier = (text: string) =>
      extractNumericPredicates(text, 'svc', 'resp').map((p) => [p.label, p.qualifier])
    // After another bound: the clause after THAT bound, this one included.
    expect(qualifier('run for at least 10 seconds when the level is above 5 meters')).toEqual([
      ['run', 'when the level is above 5 meters'],
      ['run for at least 10 seconds when the level', 'when the level is above 5 meters'],
    ])
    // After a toleranced bound the tier declined, too.
    expect(qualifier('respond within 30 ± 5 ms and keep the load below 80 percent')).toEqual([
      ['respond within 30 5 ms and keep the load', '± 5 ms and keep the load below 80 percent'],
    ])
    // The only bound, inside the response's condition.
    expect(qualifier('open the drain when the level is above 5 meters')).toEqual([
      ['open the drain when the level', 'when the level is above 5 meters'],
    ])
  })

  it('reads a bound in its subject clause as conditional, by connective or by finite verb', () => {
    const qualifier = (text: string) =>
      extractNumericPredicates(text, 'svc', 'resp').map((p) => p.qualifier)
    // Every connective, each before a lexical verb so no finite `is` gives the clause away.
    for (const connective of [
      'when',
      'whenever',
      'while',
      'whilst',
      'if',
      'unless',
      'until',
      'till',
      'after',
      'before',
      'once',
      'since',
      'where',
      'wherever',
      'whereupon',
      'provided',
      'providing',
      'assuming',
      'as soon as',
      'as long as',
      'so long as',
      'in case',
      'in the event that',
      'in the case that',
      'on condition that',
      'any time',
      'anytime',
      'each time',
      'every time',
      'the moment',
      'the instant',
      'by the time',
      'now that',
      'given that',
    ]) {
      expect(
        qualifier(`open the drain ${connective} the level rises above 5 meters`),
        connective,
      ).toEqual([`${connective} the level rises above 5 meters`])
    }
    // Prepositions that open a condition on a noun rather than a clause.
    for (const connective of ['during', 'upon', 'following']) {
      expect(qualifier(`open the drain ${connective} a flood above 5 meters`), connective).toEqual([
        `${connective} a flood above 5 meters`,
      ])
    }
    // No connective, but a finite verb or modal: a response's own verb follows `shall` in its
    // base form, so one of these is a nested clause's, and the bound is in that clause.
    for (const verb of [
      'is',
      'are',
      'was',
      'were',
      'has risen',
      'had risen',
      'does rise',
      'did rise',
      'can rise',
      'cannot rise',
      'could rise',
      'will rise',
      "won't rise",
      'would rise',
      'may rise',
      'might rise',
      'must rise',
      'should rise',
      'shall rise',
    ]) {
      const text = `open the drain of a tank whose level ${verb} above 5 meters`
      expect(qualifier(text), verb).toEqual([text])
    }
    // The controls: a subject with neither is the obligation's own, with no qualifier.
    expect(qualifier('keep the temperature of the tank below 5 degrees celsius')).toEqual([
      undefined,
    ])
    expect(qualifier('be open for at most 5 seconds')).toEqual([undefined])
    // And a guard's subject is predicated by its own `is`: that is the guard, not a clause in it.
    const [guard] = extractNumericPredicates('the level is above 5 meters', 'svc', 'trig')
    expect(guard?.qualifier).toBeUndefined()
  })

  it('splits no bound off on a subject that holds no clause', () => {
    const qualifier = (text: string) =>
      extractNumericPredicates(text, 'svc', 'resp').map((p) => p.qualifier)
    // Each would pass the clause rules above, and each is one obligation with no condition.
    for (const text of [
      // The complement clause of a verb that asserts it: its copula is the obligation's.
      'ensure that the response time is below 200 milliseconds',
      'verify that the response time is below 200 milliseconds',
      'confirm the water can reach at most 60 degrees celsius',
      // A time preposition governing the time bound itself.
      'expire the idle session after at most 30 minutes',
      'hold the lock until at most 5 seconds',
      // A connective inside a hyphenated compound, and a modal spelling used as a noun.
      'keep the once-daily dose below 5 milligrams',
      'fill the can with at most 2 liters',
    ]) {
      expect(qualifier(text), text).toEqual([undefined])
    }
    // The controls: each still holds a clause, and keeps it.
    for (const [text, clause] of [
      ['report that the level is above 5 meters', 'report that the level is above 5 meters'],
      ['verify whether the level is above 5 meters', 'verify whether the level is above 5 meters'],
      [
        'ensure that the tank whose level is above 5 meters is drained',
        'ensure that the tank whose level is above 5 meters is drained',
      ],
      [
        'ensure that the pump is off and the level is above 5 meters',
        'ensure that the pump is off and the level is above 5 meters',
      ],
      ['open the door after at least 5 people arrive', 'after at least 5 people arrive'],
      [
        'expire the session after the user leaves at most 30 minutes',
        'after the user leaves at most 30 minutes',
      ],
    ] as const) {
      expect(qualifier(text), text).toEqual([clause])
    }
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
