/**
 * THE TEXT READERS — what every tier that reads a slot's WORDS reads, beyond its atom.
 *
 * `outcome.ts` measures what the decide tier reads: atoms, polarity, contraries, bounds,
 * occurrences and bridges. The engine also reads slot text in tiers the atoms do not determine,
 * and a rewrite that keeps every atom can still change what those tiers read, and so the verdict
 * (S6-D3): a lost opposition candidate or relational disclosure is a lost demotion, and
 * `verified` goes to true over a document the declared partition says nothing about.
 *
 * Every such reader in the check path is listed here, read by the engine's OWN function over the
 * inputs `check` builds for it, and compared between the original and the projected document:
 *
 * | reader | engine function | how it is compared |
 * |---|---|---|
 * | GtWR lint per requirement (R6 reads the slots' rendering) | `checkGtWRules` on `lintSentenceOf` | equal |
 * | GtWR lint over the set | `checkGtWRulesSet` | equal |
 * | ambiguity family (the distinct system spellings) | `detectAmbiguity` | equal |
 * | quantities in a converted unit no bound read | `unreadQuantities` | equal |
 * | inter-entity comparison words | `hasRelationalLanguage` | equal |
 * | the text the similarity graph embeds | `sentence`, else the response | equal |
 * | the waivers the check honours | `bindsCurrentText` | equal |
 * | a response that may perform a prohibited action | `mayPerform` | equal |
 * | opposition candidates, every pair related | `oppositionCandidatesOver` | per pair, and see the cosine |
 * | similarity suggestions, every pair related | `similarSemanticOver` | see the cosine |
 * | relational / aggregate disclosures | `findRelationalUnchecked` over `relationalInputsOf` | per pair, and per group |
 * | quantity-alias candidates | `findQuantityAliasCandidates` | per pair |
 * | digit-separator spellings | `findNumberSpellingCandidates` | per pair |
 * | lexically similar, un-unified responses | `findSimilarUnunified` | per pair |
 * | candidate pairs for the pairwise tier | `emitCandidatePairs` | per pair |
 * | exact duplicates | `detectExactDuplicates` | per pair |
 *
 * A reader of ONE requirement must read the same thing after the projection as before: nothing
 * the declaration says makes a requirement's lint, unread numbers or comparison words change.
 *
 * Two readers are not listed because the atom comparison already decides them. The
 * contrary-glossary-alias demotion names the responses whose phrase is in an entry with
 * contraries, which are exactly the responses linked to that entry's atom (the `entry` use). And
 * the tiers' own same-atom and contrary skips read the atoms.
 *
 * A PAIR reader may change only as the declaration implies, and each reader says how. A pair a
 * tier stops reporting is implied only where the pair's own subject became one class (a
 * similarity suggestion or an opposition candidate is discharged by the merge its message names
 * for synonyms; a quantity-alias candidate by the quantity merge), or, for the relational tier,
 * where a member's singleton atom joined another's. A pair a tier starts reporting is implied only
 * where the pair's context became one class (two systems merged, two guards merged: for the
 * relational tier, a guard atom of each newly one, since it groups on the guard's words, which a
 * committed glossary can already have joined into one atom). Anything else is a refusal naming
 * the pair.
 *
 * Where a one-requirement or whole-set reader would change under a merge (two systems merged
 * leave fewer spellings for a reference to be ambiguous among), the merge is refused too: the
 * direction a refusal errs in is fewer equalities, never a verdict the vocabulary did not state.
 *
 * ## The cosine is not the text's to change
 *
 * The opposition and similarity tiers gate their pairs on the embedder's cosine, which is the
 * model's reading of the response text: a rewrite changes it, and no model runs here. So each is
 * read at both extremes (every pair unrelated, every pair related). Every pair the similarity tier
 * reports with every pair related rests on its threshold, and so does an opposition candidate
 * reported at one extreme and not the other: such a pair must keep both its texts, so the model
 * reads it as it did, unless the declaration makes it one response (the tier then skips it, as
 * implied). The opposition candidates reported with every pair related must be the same pairs
 * before and after (a structural one is reported at both extremes, so this is where a rewrite that
 * deletes the structure is caught). `FND_NO_PAIRS_CHECKED` is read off the same pairs, so it
 * cannot move either. The similarity graph embeds the stored sentence, which a projection never
 * rewrites, or the response where no sentence is stored, and that text is held equal.
 */

import { detectAmbiguity } from '../engine/formal/ambiguity.ts'
import type { AntonymEntry } from '../engine/formal/antonyms.ts'
import {
  type Atomize,
  glossaryIndex,
  makeAtomize,
  makeDigitSeparatorFoldAtomize,
  termIndex,
} from '../engine/formal/atomize.ts'
import { atomOwnerRoster, encode, toEncodable } from '../engine/formal/encode.ts'
import { findNumberSpellingCandidates } from '../engine/formal/number-spelling.ts'
import { mayPerform, requirementBounds, unreadQuantities } from '../engine/formal/numeric.ts'
import { findQuantityAliasCandidates, guardKeyOf } from '../engine/formal/quantity-alias.ts'
import {
  findRelationalUnchecked,
  hasRelationalLanguage,
  relationalInputsOf,
  singletonOwners,
} from '../engine/formal/relational.ts'
import {
  oppositionCandidatesOver,
  type PairCosine,
  similarSemanticOver,
} from '../engine/formal/semantic.ts'
import { findSimilarUnunified } from '../engine/formal/similar.ts'
import { checkGtWRules, checkGtWRulesSet, lintSentenceOf } from '../engine/lint/gtwr.ts'
import { isBlocked } from '../engine/pipeline/gate.ts'
import { detectExactDuplicates } from '../engine/solvers/free/duplicates.ts'
import { emitCandidatePairs } from '../engine/solvers/free/pairwise-filter.ts'
import type { Requirement, Waiver } from '../requirements/document.ts'
import { viewOf } from './keys.ts'

const SEP = '\u0000'

/** The pair readers, each a set of requirement pairs `lo\0hi`. */
export const PAIR_READERS = [
  'opposition',
  'relational',
  'quantity-alias',
  'number-spelling',
  'similar-ununified',
  'candidate-pair',
  'exact-duplicate',
] as const
export type PairReader = (typeof PAIR_READERS)[number]

/** What the text readers read on a set of requirements. */
export interface TextReading {
  /** Keyed `<requirement>\0<reader>`: what a one-requirement reader reads, as one string. */
  readonly unary: ReadonlyMap<string, string>
  /** Keyed by reader: what a whole-set reader reads, as one string. */
  readonly whole: ReadonlyMap<string, string>
  readonly pairs: ReadonlyMap<PairReader, ReadonlySet<string>>
  /** The pairs reported whatever the cosine: opposition candidates with every pair unrelated. */
  readonly structural: ReadonlySet<string>
  /** The similarity suggestions with every pair related: each is gated on the cosine. */
  readonly similar: ReadonlySet<string>
  /** Each relational / aggregate disclosure, as its sorted requirement ids. */
  readonly relationalGroups: ReadonlySet<string>
  /** The requirements owning an atom no other included requirement shares. */
  readonly unmatched: ReadonlySet<string>
  /** Per requirement, the response text the embedder reads. */
  readonly embedded: ReadonlyMap<string, string>
  /** Keyed `<requirement>\0<kind>`: each slot's atom in digit-separator fold space. */
  readonly folded: ReadonlyMap<string, string>
  /** `<response requirement>\0<bound use>`: a response `mayPerform` reads as doing a prohibited action. */
  readonly loose: ReadonlySet<string>
}

const pairOf = (a: string, b: string): string => (a < b ? `${a}${SEP}${b}` : `${b}${SEP}${a}`)

const sortedJson = (items: readonly string[]): string => JSON.stringify([...items].sort())

/** Every pair at the two cosine extremes. */
const UNRELATED: PairCosine = () => 0
const RELATED: PairCosine = () => 1

/** The tables a document is read under, as the engine indexes them, and the waivers it honours. */
export interface TextTables {
  readonly glossary: ReadonlyArray<{ canonical: string; aliases: readonly string[] }>
  readonly antonyms: ReadonlyMap<string, AntonymEntry> | undefined
  readonly terms: ReadonlyArray<{ canonical: string; aliases: readonly string[] }>
  /**
   * The waivers that bind the current text (`bindsCurrentText`). The boundary also drops a
   * `never`-class code, a filter this tier cannot read (`compat.ts` is its caller), and need not:
   * the only waivers a reader here applies are the gate's, of blocking GtWR codes, every one of
   * them `scoped`, so over those this set is exactly the one the engine is handed.
   */
  readonly waivers: readonly Waiver[]
}

/** Read every text reader over `requirements`, under `tables`. */
export const readText = (requirements: readonly Requirement[], tables: TextTables): TextReading => {
  const glossary = glossaryIndex(tables.glossary)
  const terms = termIndex(tables.terms)
  const atomize: Atomize = makeAtomize(glossary, tables.antonyms, terms)
  const fold: Atomize = makeDigitSeparatorFoldAtomize(glossary, tables.antonyms, terms)
  const views = requirements.map(viewOf)
  const encodable = views.map(toEncodable)

  const unary = new Map<string, string>()
  const embedded = new Map<string, string>()
  const folded = new Map<string, string>()
  for (const [i, view] of views.entries()) {
    const at = (reader: string, value: string) => unary.set(`${view.id}${SEP}${reader}`, value)
    at(
      'lint',
      sortedJson(checkGtWRules(view, lintSentenceOf(view)).map((f) => `${f.severity} ${f.code}`)),
    )
    at('unread', JSON.stringify(unreadQuantities(view).map((q) => q.text)))
    at('relational-language', String(hasRelationalLanguage(view.systemResponse)))
    at('graph-text', view.sentence || view.systemResponse)
    const enc = encodable[i] ?? toEncodable(view)
    embedded.set(view.id, enc.systemResponse)
    for (const row of encode(enc, fold).atoms) folded.set(`${view.id}${SEP}${row.kind}`, row.atom)
  }

  const whole = new Map<string, string>([
    [
      'ambiguity',
      sortedJson(detectAmbiguity(views).map((f) => `${f.code} ${f.requirementIds.join(',')}`)),
    ],
    [
      'lint-set',
      sortedJson(
        checkGtWRulesSet(views.map((v) => ({ requirement: v, sentence: lintSentenceOf(v) }))).map(
          (f) => `${f.code} ${f.requirementId ?? ''}`,
        ),
      ),
    ],
    [
      'waivers',
      JSON.stringify(
        tables.waivers.map((w) => [
          w.code,
          w.reason,
          w.requirementId ?? null,
          w.requirementIds ?? null,
          w.contentHash !== undefined,
        ]),
      ),
    ],
  ])

  const bounds = views.map((v) => requirementBounds(v, glossary).map((b) => b.predicate))
  const pairsOf = (findings: readonly { readonly requirementIds: readonly string[] }[]) =>
    new Set(findings.map((f) => pairOf(f.requirementIds[0] ?? '', f.requirementIds[1] ?? '')))
  const semanticOptions = {
    glossary,
    atomize,
    ...(tables.antonyms !== undefined ? { antonyms: tables.antonyms } : {}),
  }
  const structural = pairsOf(oppositionCandidatesOver(encodable, UNRELATED, semanticOptions))
  const similar = pairsOf(similarSemanticOver(encodable, RELATED, { glossary, atomize }))

  // The relational tier, over what `check` hands it: every requirement, each marked by whether it
  // owns an atom the roster of the requirements the gate admits shares with no other.
  const admitted = views.flatMap((v, i) =>
    isBlocked(v, tables.waivers) ? [] : [encode(encodable[i] ?? toEncodable(v), atomize)],
  )
  const unmatched = singletonOwners(atomOwnerRoster(admitted))
  const boundCount = new Map(views.map((v, i) => [v.id, (bounds[i] ?? []).length]))
  const relational = findRelationalUnchecked(
    relationalInputsOf(views, (id) => (boundCount.get(id) ?? 0) > 0, unmatched),
  )
  const relationalGroups = new Set(relational.map((f) => f.requirementIds.join(',')))
  const pairs = new Map<PairReader, ReadonlySet<string>>([
    ['opposition', pairsOf(oppositionCandidatesOver(encodable, RELATED, semanticOptions))],
    [
      'relational',
      new Set(
        relational.flatMap((f) =>
          f.requirementIds.flatMap((a, i) =>
            f.requirementIds.slice(i + 1).map((b) => pairOf(a, b)),
          ),
        ),
      ),
    ],
    [
      'quantity-alias',
      pairsOf(
        findQuantityAliasCandidates(
          views.map((v, i) => ({
            id: v.id,
            systemName: v.systemName,
            guardKey: guardKeyOf(v),
            predicates: bounds[i] ?? [],
          })),
        ),
      ),
    ],
    [
      'number-spelling',
      pairsOf(
        findNumberSpellingCandidates(
          encodable.map((r) => encode(r, atomize)),
          encodable.map((r) => encode(r, fold)),
        ),
      ),
    ],
    ['similar-ununified', pairsOf(findSimilarUnunified(encodable))],
    ['candidate-pair', new Set(emitCandidatePairs(views).map((p) => pairOf(p.a, p.b)))],
    [
      'exact-duplicate',
      new Set(
        detectExactDuplicates(views).flatMap((f) =>
          f.kind === 'ExactDuplicate' ? [pairOf(f.ids[0], f.ids[1])] : [],
        ),
      ),
    ],
  ])

  // What `analyzeNumericBounds` reads when no keyed performer does a prohibited action: a
  // non-negated response whose words hold the prohibited bound's label.
  const loose = new Set<string>()
  for (const [i, view] of views.entries()) {
    const enc = encodable[i]
    if (enc === undefined || enc.negated === true) continue
    const text = enc.systemResponse.trim()
    for (const [j, other] of views.entries()) {
      for (const [k, p] of (bounds[j] ?? []).entries()) {
        if (p.slot !== 'resp' || p.negated !== true) continue
        if (mayPerform(text, view.systemName, p.quantity, p.label)) {
          loose.add(`${view.id}${SEP}${other.id}${SEP}${k}`)
        }
      }
    }
  }

  return {
    unary,
    whole,
    pairs,
    structural,
    similar,
    relationalGroups,
    unmatched,
    embedded,
    folded,
    loose,
  }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** What the comparison needs of the rest of the outcome: the atoms and bound keys, both sides. */
export interface Joins {
  /** A slot's atom (`resp`, `trig`, `pre`, `sys`), before or after the projection. */
  readonly atom: (side: 'before' | 'after', requirement: string, kind: string) => string | undefined
  /** Every bound quantity key of a requirement, by index, before or after. */
  readonly boundKeys: (side: 'before' | 'after', requirement: string) => readonly string[]
  /** The words to name a requirement by in a refusal. */
  readonly textOf: (requirement: string) => string
}

/** A refusal: what changed, in words, and the phrases involved. */
export interface TextMismatch {
  readonly detail: string
  readonly phrases: readonly string[]
}

const READER_WORDS: Readonly<Record<string, string>> = {
  lint: 'the GtWR lint findings',
  unread: 'the quantities the numeric tier discloses as unread',
  'relational-language': 'the comparison words the relational tier reads',
  'graph-text': 'the text the similarity graph embeds',
  waivers: 'the waivers the check honours',
  relational: 'the relational disclosures',
  ambiguity: 'the ambiguity findings',
  'lint-set': 'the set-level GtWR lint findings',
  opposition: 'the opposition candidates',
  'quantity-alias': 'the quantity-alias candidates',
  'number-spelling': 'the digit-separator spelling candidates',
  'similar-ununified': 'the lexically similar, un-unified pairs',
  'candidate-pair': 'the pairs the pairwise tier compares',
  'exact-duplicate': 'the exact duplicates',
}

/** Which change to each pair reader the declaration implies: lost, and gained. */
type Implied = (a: string, b: string, j: PairJoins) => boolean

interface PairJoins {
  readonly slot: (a: string, b: string, kinds: readonly string[]) => boolean
  /** A guard atom of `a` and one of `b`, in either guard slot, newly one. */
  readonly guards: (a: string, b: string) => boolean
  readonly bounds: (a: string, b: string) => boolean
  readonly spelling: (a: string, b: string) => boolean
  /** Whether `a` or `b` owns an unshared atom on one side and not the other. */
  readonly unmatched: (a: string, b: string) => boolean
}

const never: Implied = () => false
const GUARD_KINDS = ['trig', 'pre'] as const
const systems: Implied = (a, b, j) => j.slot(a, b, ['sys'])
const responses: Implied = (a, b, j) => j.slot(a, b, ['resp'])
const anySlot: Implied = (a, b, j) => j.slot(a, b, ['sys', 'resp', 'trig', 'pre'])

const IMPLIED: Readonly<Record<PairReader, { readonly lost: Implied; readonly gained: Implied }>> =
  {
    // A candidate's own advice for synonyms is the merge: one atom, which the solver decides.
    opposition: { lost: responses, gained: systems },
    relational: {
      lost: (a, b, j) => j.unmatched(a, b),
      gained: (a, b, j) => j.slot(a, b, ['sys']) || j.guards(a, b) || j.unmatched(a, b),
    },
    'quantity-alias': {
      lost: (a, b, j) => j.bounds(a, b),
      gained: (a, b, j) => j.slot(a, b, ['sys', 'trig', 'pre']),
    },
    'number-spelling': { lost: (a, b, j) => j.spelling(a, b), gained: never },
    'similar-ununified': { lost: responses, gained: never },
    'candidate-pair': { lost: anySlot, gained: anySlot },
    'exact-duplicate': { lost: never, gained: anySlot },
  }

/**
 * Compare the text readers of the original and the projection. `undefined` when every reader
 * reads the projection as it reads the original, less what the declaration implies.
 */
export const compareText = (
  before: TextReading,
  after: TextReading,
  joins: Joins,
): TextMismatch | undefined => {
  const unitOf = (key: string) => key.split(SEP)[0] ?? ''

  // One-requirement readers: equal.
  for (const key of new Set([...before.unary.keys(), ...after.unary.keys()])) {
    if (before.unary.get(key) === after.unary.get(key)) continue
    const unit = unitOf(key)
    const reader = key.split(SEP)[1] ?? ''
    return {
      detail: `the projection would change ${READER_WORDS[reader] ?? reader} on "${joins.textOf(unit)}"`,
      phrases: [joins.textOf(unit)],
    }
  }
  for (const [reader, value] of before.whole) {
    if (after.whole.get(reader) === value) continue
    return { detail: `the projection would change ${READER_WORDS[reader] ?? reader}`, phrases: [] }
  }
  for (const key of new Set([...before.loose, ...after.loose])) {
    if (before.loose.has(key) === after.loose.has(key)) continue
    const unit = unitOf(key)
    return {
      detail: `the projection would change whether the numeric tier reads "${joins.textOf(unit)}" as performing a prohibited action`,
      phrases: [joins.textOf(unit)],
    }
  }

  // Pair readers: changed only where the declaration implies it.
  const pairJoins: PairJoins = {
    slot: (a, b, kinds) =>
      kinds.some((k) => {
        const ba = joins.atom('before', a, k)
        const bb = joins.atom('before', b, k)
        return (
          ba !== undefined &&
          bb !== undefined &&
          ba !== bb &&
          joins.atom('after', a, k) === joins.atom('after', b, k)
        )
      }),
    guards: (a, b) =>
      GUARD_KINDS.some((ka) =>
        GUARD_KINDS.some((kb) => {
          const ba = joins.atom('before', a, ka)
          const bb = joins.atom('before', b, kb)
          const aa = joins.atom('after', a, ka)
          return (
            ba !== undefined &&
            bb !== undefined &&
            ba !== bb &&
            aa !== undefined &&
            aa === joins.atom('after', b, kb)
          )
        }),
      ),
    unmatched: (a, b) => [a, b].some((u) => before.unmatched.has(u) !== after.unmatched.has(u)),
    bounds: (a, b) => {
      const ba = joins.boundKeys('before', a)
      const bb = joins.boundKeys('before', b)
      const aa = joins.boundKeys('after', a)
      const ab = joins.boundKeys('after', b)
      return ba.some((ka, i) => bb.some((kb, k) => ka !== kb && aa[i] === ab[k]))
    },
    spelling: (a, b) =>
      ['resp', 'trig', 'pre'].some((k) => {
        const fa = before.folded.get(`${a}${SEP}${k}`)
        return (
          fa !== undefined &&
          fa === before.folded.get(`${b}${SEP}${k}`) &&
          pairJoins.slot(a, b, [k])
        )
      }),
  }
  for (const reader of PAIR_READERS) {
    const was = before.pairs.get(reader) ?? new Set<string>()
    const is = after.pairs.get(reader) ?? new Set<string>()
    for (const [pairs, other, how, change] of [
      [was, is, IMPLIED[reader].lost, 'lose'],
      [is, was, IMPLIED[reader].gained, 'add'],
    ] as const) {
      for (const pair of pairs) {
        if (other.has(pair)) continue
        const [a = '', b = ''] = pair.split(SEP)
        if (how(a, b, pairJoins)) continue
        return {
          detail: `the projection would ${change} ${READER_WORDS[reader]} "${joins.textOf(a)}" / "${joins.textOf(b)}", which the vocabulary does not imply`,
          phrases: [joins.textOf(a), joins.textOf(b)],
        }
      }
    }
  }

  // A relational disclosure names a whole group, and a regroup can leave every pair reported
  // (three pair disclosures become one over the three): it is implied only where one of the
  // group's pairs could change as the declaration implies.
  for (const group of [...before.relationalGroups, ...after.relationalGroups]) {
    if (before.relationalGroups.has(group) === after.relationalGroups.has(group)) continue
    const ids = group.split(',')
    const { lost, gained } = IMPLIED.relational
    const implied = ids.some((a, i) =>
      ids.slice(i + 1).some((b) => lost(a, b, pairJoins) || gained(a, b, pairJoins)),
    )
    if (implied) continue
    return {
      detail: `the projection would regroup ${READER_WORDS.relational} over ${ids.map((u) => `"${joins.textOf(u)}"`).join(', ')}, which the vocabulary does not imply`,
      phrases: ids.map((u) => joins.textOf(u)),
    }
  }

  // A pair the cosine gates keeps both texts, or the model may read it differently: every
  // similarity suggestion, and an opposition candidate reported at one extreme and not the other.
  const changedText = (u: string) => before.embedded.get(u) !== after.embedded.get(u)
  const cosineGated = [before, after].flatMap((r) => [
    ...[...(r.pairs.get('opposition') ?? [])].filter((p) => !r.structural.has(p)),
    ...r.similar,
  ])
  for (const pair of cosineGated) {
    const [a = '', b = ''] = pair.split(SEP)
    // A pair the declaration makes one response is decided by the solver, not proposed.
    if (pairJoins.slot(a, b, ['resp'])) continue
    if (!changedText(a) && !changedText(b)) continue
    return {
      detail: `the projection would rewrite "${joins.textOf(changedText(a) ? a : b)}", and whether "${joins.textOf(a)}" / "${joins.textOf(b)}" is proposed rests on the embedding of its words`,
      phrases: [joins.textOf(a), joins.textOf(b)],
    }
  }
  return undefined
}
