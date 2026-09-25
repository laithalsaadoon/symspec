/**
 * `FND_NUMBER_SPELLING_CANDIDATE` — a phrase whose numbers differ only in a digit separator
 * (spec 007 AC-2-4; the demote-not-prove contract).
 *
 * ## The pair this demotes
 *
 * `normalize` keeps a `,` or `.` between two digits inside its number, because the separator
 * decides which number it is: the numeric tier reads `1,500 ms` as 1500 ms and `1.500 ms` as
 * 1.5 ms. When the separator was deleted, `1,500` and `1.500` shared one atom and the
 * propositional tier proved `respond within 1,500 ms` / `not respond within 1.500 ms`, a
 * consistent pair. The same deletion also collapsed `1.5` with a decimal-comma `1,5`, and
 * `1_500` with a European `1.500`, where the proof was right. Keeping the separator stops the
 * false proof, but it leaves each of those pairs on two atoms, and when another requirement
 * covers each atom nothing else in the check names the pair: exit 0, `verified: true`.
 *
 * ## Why this demotes and never proves
 *
 * No closed rule says whether `1,500` and `1.500` are one number: it depends on the author's
 * decimal convention. A proof may rest only on exact keys, so the two atoms stay apart, and this
 * tier names the pair instead: a propose-only info finding for every pair of requirements with
 * two different atoms (or two different antonym keys) whose {@link digitSeparatorFold} is equal,
 * that is, every pair the old deletion collapsed and the split separated. Its demotion is
 * discharged by spelling the number identically in both requirements, which puts them on one
 * atom where the solver compares them, or by a reviewed waiver when they are different numbers.
 * Polarity is not read: one spelling per number is the repair either way, and a demotion is
 * always sound.
 */

import { digitSeparatorFold } from './atomize.ts'
import type { EncodedRequirement } from './encode.ts'

/** A propose-only number-spelling finding (info; DEMOTES `verified`). */
export interface NumberSpellingCandidateFinding {
  readonly code: 'FND_NUMBER_SPELLING_CANDIDATE'
  readonly severity: 'info'
  /** The two requirement ids, sorted. */
  readonly requirementIds: [string, string]
  readonly message: string
}

/** One identity a requirement's atom row carries: its atom name, or its antonym key. */
interface Spelling {
  readonly id: string
  readonly identity: string
  readonly slotText: string
}

/**
 * Every pair of requirements that write one phrase with numbers differing only in a digit
 * separator, sorted by id pair. At most one finding per pair (the first split found).
 */
export function findNumberSpellingCandidates(
  encoded: readonly EncodedRequirement[],
): NumberSpellingCandidateFinding[] {
  // Every identity a row carries. Atom names and antonym keys live in two namespaces (U+0000
  // cannot occur in either), so an atom is never paired with a key.
  const spellings: Spelling[] = encoded.flatMap((e) =>
    e.atoms.flatMap((row) => [
      { id: e.id, identity: `atom\u0000${row.atom}`, slotText: row.slotText },
      ...(row.opposition !== undefined
        ? [{ id: e.id, identity: `key\u0000${row.opposition.key}`, slotText: row.slotText }]
        : []),
    ]),
  )
  // Fold -> the spellings under it. A class is opened only by a spelling WITH a separator, and a
  // separator-free spelling (`1_500`, `1 500`) that folds to itself joins a class already open.
  const byFold = new Map<string, Spelling[]>()
  for (const s of spellings) {
    const fold = digitSeparatorFold(s.identity)
    if (fold !== s.identity) byFold.set(fold, [...(byFold.get(fold) ?? []), s])
  }
  for (const s of spellings) byFold.get(s.identity)?.push(s)

  const found = new Map<string, NumberSpellingCandidateFinding>()
  for (const members of byFold.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const x = members[i] as Spelling
        const y = members[j] as Spelling
        if (x.id === y.id || x.identity === y.identity) continue
        const [lo, hi] = x.id < y.id ? [x, y] : [y, x]
        const key = `${lo.id}|${hi.id}`
        if (found.has(key)) continue
        found.set(key, {
          code: 'FND_NUMBER_SPELLING_CANDIDATE',
          severity: 'info',
          requirementIds: [lo.id, hi.id],
          message:
            `${lo.id} and ${hi.id} write the same phrase with numbers that differ only in a ` +
            `digit separator ("${lo.slotText}" vs "${hi.slotText}"), so they are two atoms and ` +
            'the solver never compared them. A `,` or `.` between digits is a thousands ' +
            'separator in one convention and a decimal point in the other, so symspec does not ' +
            'decide whether they are one number. If they are, rewrite one requirement with ' +
            '`symspec update` so both spell the number identically: they then share one atom and ' +
            're-running `symspec check` proves any conflict. If they are different numbers, ' +
            'waive this finding for the pair. This is a suggestion, not a verdict.',
        })
      }
    }
  }
  return [...found.values()].sort((a, b) => {
    const ka = a.requirementIds.join('|')
    const kb = b.requirementIds.join('|')
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}
