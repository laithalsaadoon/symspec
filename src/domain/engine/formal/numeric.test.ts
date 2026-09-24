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
    expect(one('retain audit logs for at least 90 days')).toEqual({
      exact: '90/1',
      dimension: RAW_UNIT_DIMENSION,
      baseUnit: 'days',
    })
    expect(one('sample the sensor at least 100 times per minute')).toEqual({
      exact: '100/1',
      dimension: RAW_UNIT_DIMENSION,
      baseUnit: 'times per minute',
    })
    expect(one('keep the firmware image at least 64 Mb').baseUnit).toBe('Mb')
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
