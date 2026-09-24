/**
 * THE ANTONYM CLASS MAP — the snapshot `antonyms.ts` says exists.
 *
 * `SEED_ANTONYM_PAIRS`s docstring promises "the resolved class → canonical map is
 * snapshot-tested so any edit that silently merges or re-canonicalizes classes fails loudly".
 * This file is that snapshot, and the reason it has to be a whole-map snapshot rather than a
 * handful of assertions is the canonical rule itself:
 *
 *     canonical = [...members].sort()[0]
 *
 * A class canonical is not a stable identifier — it is a function of the class MEMBERSHIP. So
 * adding one pair that merely touches an existing class renames every atom that class owns and
 * flips the polarity of every member that lands on the far side of the new smallest member. One
 * committed `abort ↔ commit` pair rewrites `commit_the_transaction` to `abort_the_transaction`
 * at inverted polarity, across every requirement in every document — and the last case in this
 * file drives that consequence through `atomize` so the blast radius is a gate, not a warning.
 *
 * A polarity flip on a response atom is not cosmetic: `FND_CONTRADICTION` fires exactly when two
 * responses land on one atom at opposite polarity, so the sign IS the verdict.
 */

import { describe, expect, it } from 'vitest'
import {
  ANTONYM_INDEX,
  type AntonymEntry,
  buildAntonymIndex,
  buildAntonymIndexWithDoc,
  SEED_ANTONYM_PAIRS,
} from './antonyms.ts'
import { atomize } from './atomize.ts'

/** Every verb the seed table mentions, from the table itself rather than a typed list. */
const SEED_VERBS = [...new Set(SEED_ANTONYM_PAIRS.flat())].sort()

/** One row per member: `<canonical>  <polarity>  <verb>`, sorted, so a diff names the verb. */
const render = (index: ReadonlyMap<string, AntonymEntry>): string => {
  const rows = [...index].map(
    ([verb, e]) => `${e.canonical}\t${e.negated ? '-' : '+'}\t${e.side}\t${verb}`,
  )
  return `${rows.sort().join('\n')}\n`
}

describe('the resolved seed index', () => {
  it('renders every class with every member, byte-stable', async () => {
    await expect(render(ANTONYM_INDEX)).toMatchFileSnapshot('./__snapshots__/antonym-classes.txt')
  })

  it('is non-vacuous — every seed verb is in it, and nothing else is', () => {
    // A snapshot of an empty map passes forever. The floor is derived from the pair table, so a
    // seed pair that stops resolving shrinks the map and fails here as well as in the snapshot.
    expect([...ANTONYM_INDEX.keys()].sort()).toEqual(SEED_VERBS)
  })

  it('puts every pair on one canonical at opposite polarity', () => {
    // The defining property of the table, asserted over the whole table rather than by example:
    // this is what "a response led by `a` and one led by `b` resolve to the same atom with
    // opposite polarity" means operationally.
    for (const [a, b] of SEED_ANTONYM_PAIRS) {
      const ea = ANTONYM_INDEX.get(a)
      const eb = ANTONYM_INDEX.get(b)
      expect(ea?.canonical, `${a} unresolved`).toBe(eb?.canonical)
      expect(ea?.negated, `${a} / ${b} share a polarity`).not.toBe(eb?.negated)
    }
  })

  it('canonicalizes on the lexicographically smallest member, itself positive', () => {
    const membersOf = new Map<string, string[]>()
    for (const [verb, e] of ANTONYM_INDEX) {
      membersOf.set(e.canonical, [...(membersOf.get(e.canonical) ?? []), verb])
    }
    for (const [canonical, members] of membersOf) {
      expect([...members].sort()[0]).toBe(canonical)
      expect(ANTONYM_INDEX.get(canonical)?.negated, `${canonical} is negative`).toBe(false)
    }
  })

  it('resolves a shared member into ONE class rather than an ambiguous pair', () => {
    // `accept↔reject`, `approve↔reject` and `accept↔decline` all touch the same two verbs. A
    // flat pair map would make `reject` ambiguous; the signed union-find puts all four in one
    // class, and each SIDE resolves to its smallest member, so the same-side near-synonyms are
    // one atom (spec 007 AC-2-1 retires only the cross-side rename).
    for (const verb of ['accept', 'approve']) {
      expect(ANTONYM_INDEX.get(verb)).toEqual({
        canonical: 'accept',
        negated: false,
        side: 'accept',
      })
    }
    for (const verb of ['reject', 'decline']) {
      expect(ANTONYM_INDEX.get(verb)).toEqual({
        canonical: 'accept',
        negated: true,
        side: 'decline',
      })
    }
  })
})

describe('buildAntonymIndex', () => {
  it('rejects an odd polarity cycle, so atomization cannot become order-dependent', () => {
    expect(() =>
      buildAntonymIndex([
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ]),
    ).toThrow(/Inconsistent antonym pairs/)
  })

  it('is order-independent over the pair list', () => {
    expect(render(buildAntonymIndex([...SEED_ANTONYM_PAIRS].reverse()))).toBe(render(ANTONYM_INDEX))
  })
})

describe('a document pair that touches a seed class', () => {
  it('leaves the seed index untouched when the document commits nothing', () => {
    expect(buildAntonymIndexWithDoc([])).toBe(ANTONYM_INDEX)
  })

  it('renames the class and flips every member below the new canonical', () => {
    // `commit` is its own class canonical against `roll_back`/`rollback`. Committing
    // `abort ↔ commit` makes `abort` the smallest member, so `commit` becomes the NEGATIVE side
    // of a class named after a verb no requirement used.
    const merged = buildAntonymIndexWithDoc([['abort', 'commit']])
    expect(ANTONYM_INDEX.get('commit')).toEqual({
      canonical: 'commit',
      negated: false,
      side: 'commit',
    })
    expect(merged.get('commit')).toEqual({ canonical: 'abort', negated: true, side: 'commit' })
    expect(merged.get('roll_back')).toEqual({ canonical: 'abort', negated: false, side: 'abort' })
  })

  it('moves only the opposition KEY — never an atom NAME or a polarity (AC-2-1)', () => {
    // Under the pre-AC-2-1 rename this commit renamed `commit the transaction` to
    // `abort_the_transaction` and inverted its sign, so a document consistent under the seed
    // table could report a contradiction under the merged one with no requirement edited. With
    // opposition as a contrary axiom the index decides only which atoms are CONTRARIES; `commit`
    // is still alone on its side, so its atom and its polarity are unchanged.
    const seeded = atomize({ kind: 'resp', text: 'commit the transaction', systemName: 'ledger' })
    expect(seeded).toMatchObject({
      name: 'sys__ledger__resp__commit_the_transaction',
      negated: false,
      opposition: { key: 'sys__ledger__resp__commit_the_transaction', negative: false },
    })
    const merged = atomize({
      kind: 'resp',
      text: 'commit the transaction',
      systemName: 'ledger',
      antonyms: buildAntonymIndexWithDoc([['abort', 'commit']]),
    })
    expect(merged).toMatchObject({
      name: 'sys__ledger__resp__commit_the_transaction',
      negated: false,
      opposition: { key: 'sys__ledger__resp__abort_the_transaction', negative: true },
    })
  })

  it('merges a doc member into the seed side it joins — an equality, which only adds findings', () => {
    // `abort` joins `roll_back`/`rollback` on the side opposite `commit`, and is now that side's
    // smallest member, so the three are one atom. Merging names is strengthening (spec 007 I-1).
    const antonyms = buildAntonymIndexWithDoc([['abort', 'commit']])
    const name = (text: string) =>
      atomize({ kind: 'resp', text, systemName: 'ledger', antonyms }).name
    expect(name('roll back the transaction')).toBe('sys__ledger__resp__abort_the_transaction')
    expect(name('rollback the transaction')).toBe(name('abort the transaction'))
  })
})
