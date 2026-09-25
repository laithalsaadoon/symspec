/**
 * Every row of the antonym tables is reachable: each seed pair relates its own two verbs, and
 * each cross-side contrary the class chaining used to imply is a row that proves end to end.
 *
 * A table entry nothing exercises is dead code with a green suite (see
 * `.erpaval/solutions/conventions/lexicon-entries-need-per-entry-reachability-tests.md`). The
 * whole-table sweep reads the rows off the table itself, so a row that stops resolving fails by
 * name; the named lists below pin the rows a lead decision added, so deleting one fails too.
 *
 * Kept apart from `opposition.test.ts` on purpose: every `runCheck` grows the one z3 heap a test
 * file shares, and the sweep is atom-level (`areContrary`, the relation the contrary axioms are
 * built from) so it costs no solver call.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import { SEED_ANTONYM_PAIRS } from './antonyms.ts'
import { areContrary, atomize } from './atomize.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idOf = (n: number) => `0d0d0d0d-0000-4000-8000-${String(n).padStart(12, '0')}`
const BUTTON = 'When the operator presses the button, the controller shall'

/** Parse each sentence through the real ladder and build an engine document from the slots. */
const docOf = async (sentences: readonly string[]) => {
  const requirements: Record<string, unknown> = {}
  for (const [i, sentence] of sentences.entries()) {
    const parsed = await parseLine(sentence)
    if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
    const id = idOf(i + 1)
    requirements[id] = {
      id,
      patternType: parsed.slots.patternType,
      systemName: parsed.slots.systemName,
      systemResponse: parsed.slots.systemResponse,
      ...(parsed.slots.trigger !== undefined ? { trigger: parsed.slots.trigger } : {}),
      negated: parsed.negated,
      sentence,
      priority: 'medium',
      status: 'draft',
      createdAt: TS,
      updatedAt: TS,
      derives: [],
      satisfies: [],
      verifies: [],
      refines: [],
    }
  }
  return {
    requirements,
    glossary: [],
    antonyms: [],
    waivers: [],
    terms: [],
    stateModel: { variables: [] },
  } as never
}

const contradictionsOf = async (sentences: readonly string[]) =>
  (await runCheck(await docOf(sentences))).findings
    .filter((f) => f.code === 'FND_CONTRADICTION')
    .map((f) => f.requirementIds)

const errorsOf = async (sentences: readonly string[]) =>
  (await runCheck(await docOf(sentences))).findings
    .filter((f) => f.severity === 'error')
    .map((f) => f.code)

const resp = (text: string) => atomize({ kind: 'resp', text, systemName: 'controller' })

describe('every seed row relates its own two verbs', () => {
  for (const [a, b] of SEED_ANTONYM_PAIRS) {
    const [x, y] = [a.replace('_', ' '), b.replace('_', ' ')]
    it(`${x} / ${y}`, () => {
      expect(areContrary(resp(`${x} the box`), resp(`${y} the box`))).toBe(true)
      expect(areContrary(resp(`${y} the box`), resp(`${x} the box`))).toBe(true)
    })
  }
})

describe('every cross-side contrary the class chaining meant is a row of its own (AC-2-1)', () => {
  // Before the table related only its rows, every positive member of a class opposed every
  // negative one. Relating only rows is right (chaining is how publish ≡ extend arose), but it
  // also dropped the cross-side pairs the chaining used to reach: each document below is a real
  // conflict base 669c0e9 proved as FND_CONTRADICTION, and without its own row it fell to the
  // opposition-candidate tier, exit 0 without `--strict`.
  const CROSS_SIDE_ROWS = [
    ['approve', 'decline', 'the invoice'],
    ['grant', 'forbid', 'access to the user'],
    ['allow', 'forbid', 'the transfer'],
    ['allow', 'revoke', 'access to the user'],
    ['authorize', 'forbid', 'the payment'],
    ['authorize', 'revoke', 'the payment'],
    ['permit', 'revoke', 'the transfer'],
  ] as const

  it('each is a seed row', () => {
    const rows = new Set(SEED_ANTONYM_PAIRS.map(([a, b]) => [a, b].sort().join('|')))
    for (const [x, y] of CROSS_SIDE_ROWS) {
      expect(rows.has([x, y].sort().join('|')), `${x} / ${y}`).toBe(true)
    }
  })

  for (const [x, y, object] of CROSS_SIDE_ROWS) {
    it(`${x} / ${y} ${object} is FND_CONTRADICTION, in either order`, async () => {
      for (const [p, q] of [
        [x, y],
        [y, x],
      ] as const) {
        expect(
          await contradictionsOf([`${BUTTON} ${p} ${object}.`, `${BUTTON} ${q} ${object}.`]),
          `${p} / ${q}`,
        ).toEqual([[idOf(1), idOf(2)]])
      }
    })

    it(`not ${x} / not ${y} ${object} ("do neither") is no error`, async () => {
      expect(
        await errorsOf([`${BUTTON} not ${x} ${object}.`, `${BUTTON} not ${y} ${object}.`]),
      ).toEqual([])
    })
  }

  it('conceal / unseal, the one cross-side pair that is no contrary, stays unrelated', () => {
    // Unsealing an envelope and keeping it out of sight are compatible; only seal and expose
    // connect the two, and that chain is exactly what the table no longer reads.
    expect(areContrary(resp('conceal the box'), resp('unseal the box'))).toBe(false)
  })
})
