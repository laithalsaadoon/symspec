/**
 * What a numeric predicate CLAIMS is a function of the slot it was read out of.
 *
 * A bound in a guard slot is part of the antecedent that decides where a requirement is
 * live; the same bound in the response is the obligation it imposes there. The tier
 * reports the role in `evidence.numeric.predicates[].slot`, so the stamp is output bytes
 * and a caller cannot hand over a slot the extractor then relabels.
 */

import { describe, expect, it } from 'vitest'
import type { NumericComparator } from './encode.ts'
import {
  COMPARATOR_LEXICON,
  extractNumericPredicates,
  mayPerform,
  type PredicateSlot,
  RAW_UNIT_DIMENSION,
  unreadQuantities,
} from './numeric.ts'

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
    expect(qualifier('run at most 2 minutes after the tank fills.')).toEqual([
      ['run', 'after the tank fills'],
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
    expect(qualifier('keep the temperature below 5 degrees celsius')).toEqual([undefined])
    expect(qualifier('be open for at most 5 seconds')).toEqual([undefined])
    // And a guard's subject is predicated by its own `is`: that is the guard, not a clause in it.
    const [guard] = extractNumericPredicates('the level is above 5 meters', 'svc', 'trig')
    expect(guard?.qualifier).toBeUndefined()
  })

  it('reads a response bound as the obligation only in a shape that says so', () => {
    // Spec 007 C1/C2. The subject key is exact, but that the subject NAMES the quantity the
    // response holds to the bound is a reading: in `log every request above 200 milliseconds` the
    // bound picks out requests. Outside the shapes below, a response bound carries its whole slot
    // as its qualifier, so it meets no bound spelled differently and the pair is disclosed.
    const read = (text: string) =>
      extractNumericPredicates(text, 'svc', 'resp').map((p) => [p.qualifier, p.clause])
    for (const [text, clause] of [
      ['log every request above 200 milliseconds', 'the word "every"'],
      ['sound the alarm for readings above 90 degrees celsius', 'the word "for"'],
      ['keep the height of the drone that flew above 100 meters', 'the word "of"'],
      ['stop the pump the float slid below 3 meters', 'the word "the"'],
      ['have a latency below 200 milliseconds', 'the word "a"'],
      ['reject payments exceeding 1000 dollars', 'the plural "payments"'],
      ['keep the readings above 90 degrees celsius', 'the plural "readings"'],
      ['flag the sessions idle for at least 30 minutes', 'the plural "sessions"'],
      ['log the request above 200 milliseconds', 'the verb "log"'],
      ['sound the siren above 5 seconds', 'the verb "sound"'],
      ['charge the battery to exactly 80 percent', 'the verb "charge"'],
      [
        'close the session idle for at least 30 minutes',
        'the verb "close" and the words "session idle"',
      ],
      [
        'run the backup once-daily for at most 2 hours',
        'the verb "run" and the words "backup once-daily"',
      ],
      // A point in time after a postmodifier: which ticket, not when to escalate.
      [
        'escalate the ticket unresolved after at least 3 days',
        'the verb "escalate" and the words "ticket unresolved"',
      ],
      [
        'expire the idle session after at most 30 minutes',
        'the verb "expire" and the words "idle session"',
      ],
      [
        'flag the call answered in under 2 seconds',
        'the verb "flag" and the words "call answered"',
      ],
      // Nor is a compound told from a noun and its postmodifier: both are disclosed.
      ['flush the write cache within 2 seconds', 'the verb "flush" and the words "write cache"'],
      ['retain audit logs for at least 90 days', 'the verb "retain" and the words "audit logs"'],
      // A role word before a bound that is not a recognized time marks no span of the action.
      // The plural a time's role word lets end the object is no exemption for anything else.
      ['retain the logs for at least 9 months', 'the plural "logs"'],
      ['retain the log for at least 9 months', 'the verb "retain", on a bound that is not a time'],
      [
        'approve the loan for over 50000 dollars',
        'the verb "approve", on a bound that is not a time',
      ],
      ['waive the fee for at least 10 items', 'the verb "waive", on a bound that is not a time'],
      ['discount the order for over 10', 'the verb "discount", on a bound that is not a time'],
      ['keep the record for over 1000 dollars', 'the verb "keep", on a bound that is not a time'],
      // A holding verb's object of two content words, on a bound that is not a time: the second
      // may be the state the object is held in, and the bound when it holds.
      ['keep the pump stopped above 5 meters', 'the verb "keep" and the words "pump stopped"'],
      ['keep the tank level below 3 meters', 'the verb "keep" and the words "tank level"'],
      ["keep the tank's level below 3 meters", 'the verb "keep" and the words "tank\'s level"'],
      // A verb with a second sense in which the bound picks out the object.
      ['hold the order above 1000 dollars', 'the verb "hold"'],
      ['hold zone 1 temperature above 20 degrees celsius', 'the verb "hold"'],
      ['limit the latency to at most 200 milliseconds', 'the verb "limit"'],
      // The verb alone on a bound that is not a time: a condition on an unnamed quantity.
      ['sound above 90 degrees celsius', 'the verb "sound" alone, on a bound that is not a time'],
      ['open above 5 bar', 'the verb "open" alone, on a bound that is not a time'],
    ] as const) {
      expect(read(text), text).toEqual([[text, clause]])
    }
    // The shapes that are proved: the verb alone on a time, or after `be`; a holding verb on one
    // noun, or on content words and a time; a time bound its own role word introduces after one
    // noun. None splits the bound off.
    for (const text of [
      'respond within 200 milliseconds',
      'respond in at least 500 milliseconds',
      'be below 5 meters',
      'keep the response time below 200 milliseconds',
      'maintain the latency at most 200 milliseconds',
      'keep the level below 3 meters',
      'have the level below 3 meters',
      'keep the door unlocked for at least 30 seconds',
      'keep the door unlocked above 30 seconds',
      'keep the ISIS latency below 200 milliseconds',
      'run the pump for at least 10 minutes',
      'sound the siren within 2 seconds',
      'retain the logs for at least 90 days',
      'expire the session after at most 30 minutes',
      'hold the lock until at most 5 seconds',
      'poll the sensor at least once every 5 seconds',
    ]) {
      expect(read(text), text).toEqual([[undefined, undefined]])
    }
    // A guard's subject is predicated by its own copula, and is never read so.
    const [guard] = extractNumericPredicates(
      'every reading is above 90 degrees celsius',
      'svc',
      'trig',
    )
    expect(guard?.qualifier).toBeUndefined()
  })

  it('splits no bound off on a subject that holds no clause spelling', () => {
    const qualifier = (text: string) =>
      extractNumericPredicates(text, 'svc', 'resp').map((p) => p.qualifier)
    // The two exact rules: a time preposition that is the bound's own word, and a connective
    // inside a hyphenated compound, which is part of a word.
    for (const text of [
      'expire the session after at most 30 minutes',
      'hold the lock until at most 5 seconds',
      'keep the once-daily pump running for at most 5 minutes',
    ]) {
      expect(qualifier(text), text).toEqual([undefined])
    }
  })

  it('reads a clause spelling as a clause, with no guess about the words around it', () => {
    // Spec 007, the demote-not-prove contract: whether `is` is a complement's copula, `can` a
    // noun, `during` a span, or `following` a modifier is a grammar guess, and a guess may never
    // widen a proof. Each bound here is inside its own qualifier, and names what put it there.
    const read = (text: string) =>
      extractNumericPredicates(text, 'svc', 'resp').map((p) => [p.qualifier, p.clause])
    for (const [text, qualifier, clause] of [
      [
        'ensure that the response time is below 200 milliseconds',
        'ensure that the response time is below 200 milliseconds',
        'the finite verb "is"',
      ],
      [
        'confirm the water can reach at most 60 degrees celsius',
        'confirm the water can reach at most 60 degrees celsius',
        'the finite verb "can"',
      ],
      [
        'fill the can with at most 2 liters',
        'fill the can with at most 2 liters',
        'the finite verb "can"',
      ],
      [
        'keep the latency during peak hours below 200 milliseconds',
        'during peak hours below 200 milliseconds',
        'the connective "during"',
      ],
      [
        'retain the following events for at most 30 days',
        'following events for at most 30 days',
        'the connective "following"',
      ],
      [
        'keep the height after the drone flew above 100 meters',
        'after the drone flew above 100 meters',
        'the connective "after"',
      ],
      [
        'keep the instant current below 500 mA',
        'the instant current below 500 ma',
        'the connective "the instant"',
      ],
      [
        'report that the level is above 5 meters',
        'report that the level is above 5 meters',
        'the finite verb "is"',
      ],
      [
        'open the door after at least 5 people arrive',
        'after at least 5 people arrive',
        'the connective "after"',
      ],
      [
        'expire the session after the user leaves at most 30 minutes',
        'after the user leaves at most 30 minutes',
        'the connective "after"',
      ],
    ] as const) {
      expect(read(text), text).toEqual([[qualifier, clause]])
    }
    // Text after the bound is a qualifier with no clause: the bound is not inside it.
    expect(read('keep the temperature above 30 degrees celsius when heating')).toEqual([
      ['when heating', undefined],
    ])
    // A later bound is inside the first one's trailing text.
    expect(read('run for at least 10 seconds when the level is above 5 meters')).toEqual([
      ['when the level is above 5 meters', undefined],
      ['when the level is above 5 meters', 'an earlier bound'],
    ])
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

  it('keeps a digit separator inside its number in the quantity key', () => {
    // `1,500` and `1.500` are 1500 and 1.5 to this tier's own NUMBER reader, so the subjects
    // `zone 1,500 door` and `zone 1.500 door` name two zones. Deleting the separator keyed both
    // `zone_1_500_door`, one Real, and two zones' bounds were one proved conflict.
    const key = (text: string) => extractNumericPredicates(text, 'plant', 'resp')[0]?.quantity
    const comma = key('keep the zone 1,500 door unlocked for at most 30 seconds')
    const dot = key('keep the zone 1.500 door unlocked for at most 30 seconds')
    expect(comma).toBe('sys__plant__qty__keep_the_zone_1,500_door_unlocked')
    expect(dot).toBe('sys__plant__qty__keep_the_zone_1.500_door_unlocked')
    expect(key('keep the zone 1500 door unlocked for at most 30 seconds')).toBe(
      'sys__plant__qty__keep_the_zone_1500_door_unlocked',
    )
    // The negative guard: no key deletes the separator.
    for (const k of [comma, dot]) expect(k).not.toContain('1_500')
    // A `,` or `.` that is not between two digits is still punctuation.
    expect(key('keep the zone 1, door unlocked for at most 30 seconds')).toBe(
      'sys__plant__qty__keep_the_zone_1_door_unlocked',
    )
  })
})

describe('a response that holds an action behind other words may perform it (spec 007 AC-2-6)', () => {
  const [prohibition] = extractNumericPredicates(
    'keep the door unlocked above 30 seconds',
    'door controller',
    'resp',
    undefined,
    true,
  )
  const may = (text: string, system = 'door controller') =>
    mayPerform(text, system, prohibition!.quantity, prohibition!.label)

  it('admits the action behind a leading word, or with an article dropped', () => {
    for (const text of [
      'keep the door unlocked',
      'immediately keep the door unlocked',
      'also keep the door unlocked',
      'continue to keep the door unlocked',
      'keep door unlocked',
      'keep the door unlocked, then sound the buzzer',
    ]) {
      expect(may(text), text).toBe(true)
    }
  })

  it('refuses another action, words out of order, and another system', () => {
    expect(may('immediately keep the door locked')).toBe(false)
    expect(may('log the entry')).toBe(false)
    expect(may('unlocked the door keep')).toBe(false)
    expect(may('immediately keep the door unlocked', 'gate controller')).toBe(false)
  })
})

describe('every comparator phrase, alone, yields exactly its comparator', () => {
  // One row per COMPARATOR_LEXICON entry, plus the phrases the `not` path reads through an
  // entry (`not more than` through `more than`), which are deliberately NOT entries. A lexicon
  // entry with no row is a red test below, so no entry ships without its own fixture
  // (`.erpaval/solutions/conventions/lexicon-entries-need-per-entry-reachability-tests.md`).
  const EXPECTED: ReadonlyArray<readonly [string, NumericComparator]> = [
    ['no more than', '<='],
    ['no less than', '>='],
    ['no fewer than', '>='],
    ['no greater than', '<='],
    ['no lower than', '>='],
    ['at most', '<='],
    ['at least', '>='],
    ['a maximum of', '<='],
    ['a minimum of', '>='],
    ['up to', '<='],
    ['less than or equal to', '<='],
    ['greater than or equal to', '>='],
    ['less than', '<'],
    ['fewer than', '<'],
    ['greater than', '>'],
    ['more than', '>'],
    ['not exceeding', '<='],
    ['not exceed', '<='],
    ['exceeding', '>'],
    ['exceed', '>'],
    ['within', '<='],
    ['under', '<'],
    ['below', '<'],
    ['over', '>'],
    ['above', '>'],
    ['exactly', '='],
    ['equal to', '='],
    // Through the negation of the one comparison a `not` governs.
    ['not more than', '<='],
    ['not less than', '>='],
  ]

  it.each(EXPECTED)('"%s" reads as %s', (phrase, comparator) => {
    const preds = extractNumericPredicates(`keep the latency ${phrase} 200 ms`, 'svc', 'resp')
    expect(preds.map((p) => [p.label, p.comparator, p.value])).toEqual([
      ['keep the latency', comparator, 200],
    ])
  })

  it('has a row for every lexicon entry, and no `not` phrase is an entry', () => {
    const phrases = COMPARATOR_LEXICON.map((e) => e.phrase)
    const rows = new Set(EXPECTED.map(([phrase]) => phrase))
    expect(phrases.filter((p) => !rows.has(p))).toEqual([])
    expect(phrases.filter((p) => p.startsWith('not ') && !p.startsWith('not exceed'))).toEqual([])
  })

  it('lists every phrase before any phrase it contains', () => {
    const phrases = COMPARATOR_LEXICON.map((e) => e.phrase)
    for (const [i, shorter] of phrases.entries()) {
      for (const longer of phrases.slice(i + 1)) {
        const contained = new RegExp(`(?:^| )${shorter}(?: |$)`).test(longer)
        expect(contained, `"${longer}" is listed after "${shorter}"`).toBe(false)
      }
    }
  })
})

describe('a quantity in a converted unit that no bound reads is reported unread', () => {
  const view = (systemResponse: string, extra: { negated?: boolean; trigger?: string } = {}) => ({
    id: 'r',
    patternType: extra.trigger === undefined ? ('ubiquitous' as const) : ('event-driven' as const),
    systemName: 'gateway',
    systemResponse,
    sentence: '',
    priority: 'medium' as const,
    status: 'draft' as const,
    negated: extra.negated ?? false,
    ...(extra.trigger !== undefined ? { trigger: extra.trigger } : {}),
  })
  const unread = (text: string, extra?: { negated?: boolean; trigger?: string }) =>
    unreadQuantities(view(text, extra)).map((q) => q.text)

  it('reads nothing unread in a response whose every quantity is a bound', () => {
    expect(unread('respond within 200 ms')).toEqual([])
    expect(unread('respond in more than 500 ms')).toEqual([])
    expect(unread('respond within 1,500 ms')).toEqual([])
    expect(unread('respond in at most 1e3 ms')).toEqual([])
    expect(unread('poll the sensor at least once every 5 seconds')).toEqual([])
  })

  it('names a quantity no comparator phrase introduces', () => {
    expect(unread('poll the sensor every 5 seconds')).toEqual(['5 seconds'])
    expect(unread('lock the account after 5 minutes')).toEqual(['5 minutes'])
    expect(unread('respond within 200 ms and retry after 3 s')).toEqual(['3 s'])
    expect(unread('heat the tank to 60 degrees celsius')).toEqual(['60 degrees celsius'])
    expect(unread('cut the load by 20%')).toEqual(['20%'])
  })

  it('names a spelling the number token declines whole, never its trailing group', () => {
    expect(unread('respond within 2_000_000 ms')).toEqual(['2_000_000 ms'])
    expect(unread('respond within 2 000 ms')).toEqual(['2 000 ms'])
    expect(unread('respond within 1,5 seconds')).toEqual(['1,5 seconds'])
  })

  it('names the numbers of a negated response it reads as nothing', () => {
    expect(
      unread('keep the door unlocked above 30 seconds and below 60 seconds', { negated: true }),
    ).toEqual(['30 seconds', '60 seconds'])
    expect(unread('keep the door unlocked above 30 seconds', { negated: true })).toEqual([])
  })

  it('reports offsets into the stored response, a leading negator included', () => {
    const [q] = unreadQuantities(view('not poll the sensor every 5 seconds'))
    expect(q?.span).toEqual([26, 35])
    expect(q?.text).toBe('5 seconds')
  })

  it('leaves a bare number, an unconverted unit, and the guard slots to the other rules', () => {
    expect(unread('keep at most 3 retries')).toEqual([])
    expect(unread('retain the logs for 3 months')).toEqual([])
    expect(unread('respond with 5 entries')).toEqual([])
    expect(unread('respond within 200 ms', { trigger: 'the queue is idle for 5 minutes' })).toEqual(
      [],
    )
  })
})
