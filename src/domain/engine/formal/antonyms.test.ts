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
  GOVERNED_PREPOSITIONS,
  SEED_ANTONYM_PAIRS,
} from './antonyms.ts'
import { atomize, contraryPairs } from './atomize.ts'

/** Every verb the seed table mentions, from the table itself rather than a typed list. */
const SEED_VERBS = [...new Set(SEED_ANTONYM_PAIRS.flat())].sort()

/**
 * One row per member: `<canonical>  <polarity>  <verb>  <opposes>  <governs>  <outside>`, sorted,
 * so a diff names the verb. `opposes` is the whole relation the table asserts about `verb`
 * (AC-2-1), `governs` the prepositions that verb's governed opposition keys mark out, and
 * `outside` those of them that introduce the second place (quarantine/release).
 */
const render = (index: ReadonlyMap<string, AntonymEntry>): string => {
  const rows = [...index].map(
    ([verb, e]) =>
      `${e.canonical}\t${e.negated ? '-' : '+'}\t${verb}\t${e.opposes.join(',')}\t${e.governs.join(',')}\t${e.outside.join(',')}`,
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

  it('resolves a shared member into ONE class, and relates only the pairs in it', () => {
    // `seal↔unseal`, `seal↔expose` and `expose↔conceal` all touch `seal`/`expose`. The signed
    // union-find puts all four in one class — the key two contraries share — but the class
    // asserts nothing by itself (spec 007 AC-2-1): each verb opposes exactly the verbs a pair
    // names, so `conceal` and `unseal` are unrelated, and `seal` and `conceal` are not synonyms.
    expect(ANTONYM_INDEX.get('seal')).toEqual({
      canonical: 'conceal',
      negated: false,
      opposes: ['expose', 'unseal'],
      governs: ['from'],
      outside: [],
    })
    expect(ANTONYM_INDEX.get('conceal')).toEqual({
      canonical: 'conceal',
      negated: false,
      opposes: ['expose'],
      governs: ['from'],
      outside: [],
    })
    expect(ANTONYM_INDEX.get('expose')).toEqual({
      canonical: 'conceal',
      negated: true,
      opposes: ['conceal', 'seal'],
      governs: ['into', 'onto', 'to'],
      outside: [],
    })
    expect(ANTONYM_INDEX.get('unseal')).toEqual({
      canonical: 'conceal',
      negated: true,
      opposes: ['seal'],
      governs: [],
      outside: [],
    })
  })

  it('gives each verb its OWN governed prepositions, never the class union', () => {
    // Per verb: `connect` governs `to` and `disconnect` governs `from`. The class union let
    // `connect` drop `from` too, so "connect calls FROM the number" and "disconnect calls TO the
    // number" shared a key. Identical remainders ("include/exclude the file in the box") stay one
    // key through the LITERAL reading every response keeps, so no mark has to be shared.
    expect(ANTONYM_INDEX.get('include')?.governs).toEqual(['into', 'onto', 'to'])
    expect(ANTONYM_INDEX.get('exclude')?.governs).toEqual(['from'])
    expect(ANTONYM_INDEX.get('connect')?.governs).toEqual(['into', 'onto', 'to', 'with'])
    expect(ANTONYM_INDEX.get('disconnect')?.governs).toEqual(['from'])
    expect(ANTONYM_INDEX.get('grant')?.governs).toEqual(['into', 'onto', 'to'])
    // revoke takes away a right, which names its place with `to` as grant does ("revoke access
    // to the server" / "grant access into the server").
    expect(ANTONYM_INDEX.get('revoke')?.governs).toEqual(['from', 'to'])
    // No verb governs a locative: whether `at`, `in`, `inside`, `on` or `within` names a place or
    // a time is a guess about the words after it ("at ten" / "in ten", "in time" / "on time", "in
    // a moment" / "within a moment"), and a guess may not create a proof.
    for (const [verb, entry] of ANTONYM_INDEX) {
      for (const p of ['at', 'in', 'inside', 'on', 'within']) {
        expect(entry.governs, `${verb} ${p}`).not.toContain(p)
      }
    }
    // No verb that does not remove its object FROM the place governs `from`, and no verb that
    // does governs a goal, but for the `to` of revoke, the remover of a right: those prepositions
    // carry direction ("allow calls to" / "deny calls from", "remove the item to the trash").
    // `release … to` is the one other goal after a from-verb, and it names the OTHER place.
    // `suspend` removes, but its one contrary, `resume`, names the place only with a locative, so
    // a `from` after suspend would meet no mark: it governs nothing.
    const removers = new Set([
      'exclude',
      'remove',
      'withdraw',
      'disconnect',
      'revoke',
      'hide',
      'conceal',
      'seal',
      'retract',
      'disengage',
      'roll_back',
      'rollback',
      'release',
    ])
    for (const [verb, entry] of ANTONYM_INDEX) {
      expect(entry.governs.includes('from'), `${verb} from`).toBe(
        removers.has(verb) || verb === 'quarantine',
      )
      if (removers.has(verb)) {
        for (const goal of ['to', 'into', 'onto']) {
          expect(
            entry.governs.includes(goal) && !entry.outside.includes(goal),
            `${verb} ${goal}`,
          ).toBe(goal === 'to' && verb === 'revoke')
        }
      }
    }
    expect(ANTONYM_INDEX.get('quarantine')?.outside).toEqual(['from'])
    // Every row is under the rule (A3): only seed verbs have an entry, and a verb whose every
    // contrary names the place only with a locative (start/stop, open/close, suspend/resume, …)
    // governs nothing, so it has none.
    for (const verb of GOVERNED_PREPOSITIONS.keys()) expect(SEED_VERBS, verb).toContain(verb)
    for (const verb of [
      'start',
      'stop',
      'open',
      'close',
      'enable',
      'disable',
      'suspend',
      'resume',
    ]) {
      expect(ANTONYM_INDEX.get(verb)?.governs, verb).toEqual([])
    }
    expect(ANTONYM_INDEX.get('release')?.outside).toEqual(['into', 'onto', 'to'])
    for (const [verb, entry] of ANTONYM_INDEX) {
      const places = [...(GOVERNED_PREPOSITIONS.get(verb) ?? new Map())]
      expect(entry.governs, verb).toEqual(places.map(([p]) => p).sort())
      expect(entry.outside, verb).toEqual(
        places
          .filter(([, place]) => place === 'outside')
          .map(([p]) => p)
          .sort(),
      )
    }
  })

  it('opposes exactly the pairs in the table — every edge, both ways, and nothing else', () => {
    // The whole-table form of the property above: the relation IS the pair list.
    const edges = new Set(SEED_ANTONYM_PAIRS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]))
    const listed = [...ANTONYM_INDEX].flatMap(([verb, e]) => e.opposes.map((o) => `${verb}|${o}`))
    expect(new Set(listed)).toEqual(edges)
    expect(listed).toHaveLength(edges.size)
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
      opposes: ['roll_back', 'rollback'],
      governs: ['into', 'onto', 'to'],
      outside: [],
    })
    expect(merged.get('commit')).toEqual({
      canonical: 'abort',
      negated: true,
      opposes: ['abort', 'roll_back', 'rollback'],
      governs: ['into', 'onto', 'to'],
      outside: [],
    })
    expect(merged.get('roll_back')).toEqual({
      canonical: 'abort',
      negated: false,
      opposes: ['commit'],
      governs: ['from'],
      outside: [],
    })
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
      opposition: {
        key: 'sys__ledger__resp__commit_the_transaction',
        body: 'commit_the_transaction',
        negative: false,
      },
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
      opposition: {
        key: 'sys__ledger__resp__abort_the_transaction',
        body: 'abort_the_transaction',
        negative: true,
      },
    })
  })

  it('keeps a doc member that joins a seed side its OWN atom — a class is not a synonym table', () => {
    // `abort` joins `roll_back`/`rollback` on the side opposite `commit`. The pair says only
    // `¬(abort ∧ commit)`; it says nothing about `roll back`, so `abort` and `roll back` stay two
    // atoms, and `abort` is a contrary of `commit` alone (spec 007 AC-2-1). `rollback` is
    // `roll back` spelled as one word — an orthographic identity, not a table inference.
    const antonyms = buildAntonymIndexWithDoc([['abort', 'commit']])
    const at = (text: string) => atomize({ kind: 'resp', text, systemName: 'ledger', antonyms })
    expect(at('roll back the transaction').name).toBe(
      'sys__ledger__resp__roll_back_the_transaction',
    )
    expect(at('abort the transaction').name).toBe('sys__ledger__resp__abort_the_transaction')
    expect(at('rollback the transaction').name).toBe(at('roll back the transaction').name)
    const lits = ['abort', 'roll back', 'rollback', 'commit'].map((verb) => {
      const a = at(`${verb} the transaction`)
      return { atom: a.name, ...(a.opposition !== undefined ? { opposition: a.opposition } : {}) }
    })
    expect(contraryPairs(lits)).toEqual([
      ['sys__ledger__resp__abort_the_transaction', 'sys__ledger__resp__commit_the_transaction'],
      ['sys__ledger__resp__commit_the_transaction', 'sys__ledger__resp__roll_back_the_transaction'],
    ])
  })

  it('never chains two committed pairs into a synonymy (hold ≡ quarantine, finish ≡ stop)', () => {
    // The seed `quarantine↔release` plus a committed `hold↔release` put `hold` and `quarantine`
    // on one side; the seed `start↔stop` plus `start↔finish` put `finish` and `stop` on one.
    // Neither is a statement that the two are one action.
    const name = (text: string, pairs: ReadonlyArray<readonly [string, string]>) =>
      atomize({ kind: 'resp', text, systemName: 'shop', antonyms: buildAntonymIndexWithDoc(pairs) })
        .name
    expect(name('hold the order', [['hold', 'release']])).toBe('sys__shop__resp__hold_the_order')
    expect(name('quarantine the order', [['hold', 'release']])).toBe(
      'sys__shop__resp__quarantine_the_order',
    )
    expect(name('finish the job', [['start', 'finish']])).not.toBe(
      name('stop the job', [['start', 'finish']]),
    )
  })
})
