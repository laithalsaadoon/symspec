/**
 * `OP_DIRECTION` — every op verb carries its I-1 direction as data (spec 007 AC-5-1).
 *
 * The `satisfies Record<OpVerb, …>` bound makes a verb appended to `OP_VERBS` without a row a
 * `tsc` error. This file holds the runtime half: the table's keys are exactly the verbs (a row
 * for a verb that does not exist is a direction nobody can emit), every value is one of the
 * three published directions, and every row says WHY in words. What the labels CLAIM is
 * measured separately, by G-D in the gaming gate, because a table can be complete and wrong.
 */

import { describe, expect, it } from 'vitest'
import {
  joinDirections,
  OP_DIRECTION,
  OP_DIRECTIONS,
  OP_VERBS,
  type OpDirection,
  opDirectionRows,
} from './ops.ts'

describe('OP_DIRECTION', () => {
  it('has exactly one row per op verb, in no other order than OP_VERBS', () => {
    expect(Object.keys(OP_DIRECTION).sort()).toEqual([...OP_VERBS].sort())
    // The published rows follow the append-only verb order, so a manifest diff is a real change.
    expect(opDirectionRows().map((r) => r.verb)).toEqual([...OP_VERBS])
  })

  it('labels every verb with one of the three published directions, and says why', () => {
    for (const verb of OP_VERBS) {
      const row = OP_DIRECTION[verb]
      expect(OP_DIRECTIONS, verb).toContain(row.direction)
      expect(row.why.length, `${verb}: a direction with no reason is an assertion`).toBeGreaterThan(
        40,
      )
    }
  })

  it('publishes the three directions in lattice order, and nothing else', () => {
    // `run-weakening` is NOT an op direction: a run knob is not an op (spec gap G25).
    expect([...OP_DIRECTIONS]).toEqual(['strengthening', 'conditional', 'weakening'])
  })
})

describe('joinDirections', () => {
  it('is the least upper bound: any weakening verb makes the batch weakening', () => {
    const cases: readonly (readonly [readonly OpDirection[], OpDirection])[] = [
      [['strengthening'], 'strengthening'],
      [['strengthening', 'strengthening'], 'strengthening'],
      [['strengthening', 'conditional'], 'conditional'],
      [['conditional', 'weakening', 'strengthening'], 'weakening'],
      [['weakening', 'strengthening'], 'weakening'],
    ]
    for (const [directions, joined] of cases) {
      expect(joinDirections(directions), directions.join('+')).toBe(joined)
    }
  })

  it('has no direction for an empty batch — no op, nothing to label', () => {
    expect(joinDirections([])).toBeUndefined()
  })
})
