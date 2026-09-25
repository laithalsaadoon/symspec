/**
 * PHRASE KEYS — when two phrases are the same phrase, stated by the engine's own keys.
 *
 * "Same phrase" means phrase-key equality (plan gap G16), and a phrase key is exactly the key
 * the engine already puts a slot under: the atom body for a guard, feature or action, the scope
 * for a system, the quantity label key for a quantity. Nothing here normalizes by a rule of its
 * own. A vocabulary keyed more leniently than the engine would call two phrases one symbol that
 * the engine reads as two atoms, and rewriting one to the other would MERGE atoms no author
 * merged (the propose/decide lesson); keyed more strictly, it would give one atom two symbols,
 * and rewriting one of them would SPLIT an atom and delete the findings it carried. Equal keys
 * are the only choice under which the projection is the identity until an author commits an
 * alias (plan 4.2 (a), `resolve.test.ts` property 1).
 *
 * ## The collision domains
 *
 * A domain is a namespace in which a key has at most one owning symbol (invariant V1):
 *
 * - `system`: `normalizeScope`, which KEEPS the article (`A Gateway` is not `Gateway`).
 * - `guard`: events and states, ONE namespace (spec 007 AC-3-3): a trigger and a precondition
 *   of the same text are one atom to every propositional tier.
 * - `feature`: an optional-feature precondition.
 * - `action`: the response, under the document's antonym, glossary and term tables, so an
 *   inflected head (`opens the valve`) keys as its lemma, exactly as it atomizes.
 * - `quantity`: the numeric tier's label key.
 *
 * ## This module computes keys; `resolve.ts` looks them up
 *
 * Kept apart so the validator (`invariants.ts`) and the implicit vocabulary (`implicit.ts`) can
 * key phrases without importing the index they are inputs to. No module outside
 * `domain/vocabulary/` resolves a phrase to a symbol.
 */

import { type AntonymEntry, buildAntonymIndexWithDoc } from '../engine/formal/antonyms.ts'
import {
  type Atomize,
  DIGIT_SEPARATOR,
  glossaryIndex,
  makeAtomize,
  normalize,
  normalizeScope,
  termIndex,
} from '../engine/formal/atomize.ts'
import type { NumericComparator } from '../engine/formal/encode.ts'
import { toEncodable } from '../engine/formal/encode.ts'
import {
  actionOccurrences,
  extractNumericPredicates,
  type NumericPredicate,
  type PredicateSlot,
  requirementBounds,
} from '../engine/formal/numeric.ts'
import type { Requirement, RequirementsDocument, SymbolKind } from '../requirements/document.ts'

/** A namespace in which each phrase key has at most one owning symbol (invariant V1). */
export type CollisionDomain = 'system' | 'guard' | 'feature' | 'action' | 'quantity'

/** The collision domain of each symbol kind. `event` and `state` share `guard`. */
export const DOMAIN_OF_KIND = {
  system: 'system',
  feature: 'feature',
  event: 'guard',
  state: 'guard',
  action: 'action',
  quantity: 'quantity',
} as const satisfies Record<SymbolKind, CollisionDomain>

/**
 * The document's committed tables, as the engine reads them: the glossary, the antonym index
 * and the term index, and the one atomizer built over all three.
 */
export interface PhraseTables {
  readonly glossary: ReadonlyMap<string, string>
  readonly antonyms: ReadonlyMap<string, AntonymEntry> | undefined
  readonly terms: ReadonlyMap<string, readonly string[]>
  readonly atomize: Atomize
}

/**
 * The document's antonym index, built exactly as the engine's check pipeline builds it:
 * normalized heads folded into the seed table, and the seed table alone when the committed
 * pairs are inconsistent, so a malformed table degrades rather than throws.
 */
const antonymIndexOf = (
  pairs: RequirementsDocument['antonyms'],
): ReadonlyMap<string, AntonymEntry> | undefined => {
  if (pairs.length === 0) return undefined
  try {
    return buildAntonymIndexWithDoc(pairs.map((p) => [normalize(p.a), normalize(p.b)] as const))
  } catch {
    return undefined
  }
}

/** The document's {@link PhraseTables}. */
export const tablesOf = (
  doc: Pick<RequirementsDocument, 'glossary' | 'antonyms' | 'terms'>,
): PhraseTables => {
  const glossary = glossaryIndex(doc.glossary)
  const antonyms = antonymIndexOf(doc.antonyms)
  const terms = termIndex(doc.terms)
  return { glossary, antonyms, terms, atomize: makeAtomize(glossary, antonyms, terms) }
}

/**
 * The system name every key is computed under. An atom BODY does not depend on its scope (the
 * scope is only prefixed), so one fixed scope keys every phrase; an opposition key does carry
 * it, which is why every opposition this module compares is computed under this one scope.
 */
export const KEY_SCOPE = 'x'

/**
 * What the numeric tier folds to `_` in a quantity label. Restated from the tier's private
 * `quantityKey` (the engine tier is not edited to export it); `resolve.test.ts` pins this
 * restatement against the tier's own quantity key on every bound in the corpus.
 */
const KEY_PUNCTUATION = new RegExp(String.raw`(?:(?!${DIGIT_SEPARATOR})[^\p{L}\p{N}])+`, 'gu')

/**
 * The numeric tier's key for a quantity label, without its `sys__<scope>__qty__` prefix: the
 * label through the committed glossary, then lowercased, a leading `the` dropped, and each run
 * of punctuation made one `_`.
 */
export const quantityLabelKey = (label: string, glossary: ReadonlyMap<string, string>): string =>
  (glossary.get(normalize(label)) ?? label)
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(KEY_PUNCTUATION, '_')
    .replace(/^_+|_+$/g, '')

/** The phrase key of `text` in `domain`: the key the engine puts that slot text under. */
export const phraseKey = (domain: CollisionDomain, text: string, tables: PhraseTables): string => {
  switch (domain) {
    case 'system':
      return normalizeScope(text)
    case 'guard':
      return tables.atomize('pre', text, KEY_SCOPE, false).ref?.body ?? ''
    case 'feature':
      return tables.atomize('feat', text, KEY_SCOPE, false).ref?.body ?? ''
    case 'action':
      return tables.atomize('resp', text, KEY_SCOPE, false).ref?.body ?? ''
    case 'quantity':
      return quantityLabelKey(text, tables.glossary)
  }
}

/**
 * The key the engine's glossary is looked up on, for any slot: `normalize(text)`. The glossary is
 * KIND-BLIND — one row rewrites a matching guard, action or quantity label alike — which is what
 * the cross-domain half of V1 guards (`invariants.ts`).
 */
export const glossaryKey = (text: string): string => normalize(text)

// ---------------------------------------------------------------------------
// Slots: which phrases a requirement uses, and which kinds each may resolve to
// ---------------------------------------------------------------------------

/** A requirement slot that names a symbol. `quantity` is each label a bound is read on. */
export type SlotName = 'systemName' | 'trigger' | 'preCondition' | 'systemResponse' | 'quantity'

/** One bound a quantity use carries, as the binding records it. */
export interface BoundReading {
  readonly comparator: NumericComparator
  /** The bound in the base unit, as an exact rational `numerator/denominator`. */
  readonly value: string
  /** The base unit (`ms`, `m`, …), a raw unit, or `''` for none. */
  readonly unit: string
  /** The numeric tier's dimension name, `unrecognized`, or `''` for no unit. */
  readonly dimension: string
  readonly slot: PredicateSlot
}

/** One phrase a requirement uses, where it sits, and what it may resolve to. */
export interface SlotUse {
  readonly slot: SlotName
  /** The phrase as the engine reads it: a response has its stored negator removed. */
  readonly text: string
  readonly domain: CollisionDomain
  /** The kinds this slot accepts, in {@link SymbolKind} order. */
  readonly kinds: readonly SymbolKind[]
  /** Present on a `quantity` use: the bound read on the label. */
  readonly bound?: BoundReading
}

/** The slot projection the engine's readers take. */
const viewOf = (r: Requirement) => ({
  id: r.id,
  patternType: r.patternType,
  systemName: r.systemName,
  systemResponse: r.systemResponse,
  negated: r.negated,
  sentence: r.sentence,
  priority: r.priority,
  status: r.status,
  ...(r.preCondition !== undefined ? { preCondition: r.preCondition } : {}),
  ...(r.trigger !== undefined ? { trigger: r.trigger } : {}),
})

/** The response as the encoder reads it, and the stored text before it (a leading negator). */
export const responseOf = (r: Requirement): { readonly text: string; readonly prefix: string } => {
  const text = toEncodable(viewOf(r)).systemResponse
  return { text, prefix: r.systemResponse.slice(0, r.systemResponse.length - text.length) }
}

/** Whether the requirement's response is negated, as the encoder reads it. */
export const negatedOf = (r: Requirement): boolean => toEncodable(viewOf(r)).negated === true

/** A bound as the binding records it. */
const readingOf = (p: NumericPredicate): BoundReading => ({
  comparator: p.comparator,
  value: `${p.exact.numerator}/${p.exact.denominator}`,
  unit: p.baseUnit,
  dimension: p.dimension,
  slot: p.slot,
})

/**
 * Every phrase a requirement uses, in slot order, with the kinds it may resolve to (plan 4.1):
 *
 * | slot | kinds |
 * |---|---|
 * | systemName | system |
 * | trigger | event or state |
 * | preCondition, optional-feature | feature |
 * | preCondition, any other pattern | state |
 * | systemResponse | action |
 * | each label a bound is read on | quantity |
 *
 * A slot that carries a bound resolves BOTH as a whole phrase, numerals included, AND through
 * each label the numeric tier reads on it; there is one extractor and no exemption. A bound
 * with an empty label names no quantity a vocabulary could declare, and is left out.
 */
export const slotUses = (r: Requirement, tables: PhraseTables): readonly SlotUse[] => {
  const uses: SlotUse[] = [
    { slot: 'systemName', text: r.systemName, domain: 'system', kinds: ['system'] },
  ]
  if (r.trigger !== undefined && r.trigger !== '') {
    uses.push({ slot: 'trigger', text: r.trigger, domain: 'guard', kinds: ['event', 'state'] })
  }
  if (r.preCondition !== undefined && r.preCondition !== '') {
    uses.push(
      r.patternType === 'optional-feature'
        ? { slot: 'preCondition', text: r.preCondition, domain: 'feature', kinds: ['feature'] }
        : { slot: 'preCondition', text: r.preCondition, domain: 'guard', kinds: ['state'] },
    )
  }
  uses.push({
    slot: 'systemResponse',
    text: responseOf(r).text,
    domain: 'action',
    kinds: ['action'],
  })
  for (const { predicate } of requirementBounds(viewOf(r), tables.glossary)) {
    if (predicate.label.trim() === '') continue
    uses.push({
      slot: 'quantity',
      text: predicate.label,
      domain: 'quantity',
      kinds: ['quantity'],
      bound: readingOf(predicate),
    })
  }
  return uses
}

// ---------------------------------------------------------------------------
// Signatures the invariants compare
// ---------------------------------------------------------------------------

/** The slot the numeric tier reads a phrase of each domain in, where it reads one at all. */
const NUMERIC_SLOT: Readonly<Record<CollisionDomain, PredicateSlot | undefined>> = {
  system: undefined,
  guard: 'pre',
  feature: 'pre',
  action: 'resp',
  quantity: undefined,
}

/**
 * A phrase's numeric signature (invariant V-NUM): every bound the numeric tier reads in it, as
 * the label key and every field that carries a claim (the tier's own dedupe key, less the
 * audit text), sorted. Two phrases with equal signatures hand the tier the same predicates in
 * the same comparison class, so rewriting one to the other changes no numeric conclusion.
 *
 * Wider than the plan's comparator-value-unit-dimension on purpose, because each extra field
 * decides which bounds the tier compares a bound with. The label: `hold … at most 20 C`
 * rewritten to `keep … at most 20 C` moves the bound off the `hold` quantity, away from that
 * quantity's other bounds. The qualifier and role: `… at most 20 C now` rewritten to `… at most
 * 20 C` leaves the comparison class of every other bound qualified `now`. Either move can drop
 * a numeric contradiction, which a merge must never do.
 */
export const numericSignature = (
  domain: CollisionDomain,
  text: string,
  tables: PhraseTables,
): string => {
  const slot = NUMERIC_SLOT[domain]
  if (slot === undefined) return ''
  const rational = (r: { numerator: bigint; denominator: bigint } | undefined) =>
    r === undefined ? '' : `${r.numerator}/${r.denominator}`
  return extractNumericPredicates(text, KEY_SCOPE, slot)
    .map((p) =>
      JSON.stringify([
        quantityLabelKey(p.label, tables.glossary),
        p.comparator,
        rational(p.exact),
        rational(p.difference),
        rational(p.days),
        p.dimension,
        p.baseUnit,
        p.role,
        p.negated === true,
        p.qualifier ?? '',
        p.clause ?? '',
      ]),
    )
    .sort()
    .join('\n')
}

/** The prefix every numeric-tier quantity key carries under {@link KEY_SCOPE}. */
const QUANTITY_PREFIX = `sys__${normalizeScope(KEY_SCOPE)}__qty__`

/**
 * An action phrase's occurrence signature (invariant V-NUM, its other half): the quantity keys a
 * response of this text hands the numeric tier as ACTIONS it performs, beside its bounds, with
 * each one's qualifier, restricted to `live`, sorted. The tier reads them with the same filter
 * `check.ts` applies (`occurrencesOf`): a key a bound of the text already names is not repeated,
 * and a text with a bound keeps only the qualified ones.
 *
 * A bound-free response is what makes two opposed prohibitions on one quantity a numeric
 * contradiction (`keep the door unlocked` against `shall not keep the door unlocked above 30
 * seconds` and `... below 40 seconds`), and it has no bound for {@link numericSignature} to see.
 * Rewriting it to a canonical whose occurrences differ moves it off that key and deletes the
 * contradiction. Only the keys some bound or declared quantity names (`live`) can meet a bound,
 * so only those are compared: otherwise every action alias with other words would differ.
 */
export const occurrenceSignature = (
  text: string,
  tables: PhraseTables,
  live: ReadonlySet<string>,
): string => {
  const bound = extractNumericPredicates(text, KEY_SCOPE, 'resp', tables.glossary)
  const keyed = new Set(bound.map((p) => p.quantity))
  return actionOccurrences(text, KEY_SCOPE, tables.glossary)
    .filter((a) => !keyed.has(a.quantity))
    .filter((a) => bound.length === 0 || a.qualifier !== undefined)
    .map((a) => ({ label: a.quantity.slice(QUANTITY_PREFIX.length), qualifier: a.qualifier }))
    .filter((a) => live.has(a.label))
    .map((a) => JSON.stringify([a.label, a.qualifier ?? '']))
    .sort()
    .join('\n')
}

/**
 * The actions a response of `text` performs as the numeric tier keys them, in its order, each as
 * its label key (no `sys__<scope>__qty__` prefix) and qualifier: {@link occurrenceSignature}'s
 * occurrences, keyed under `glossary` rather than the committed table and unfiltered. Used to
 * measure a synthesized glossary row against what the tier would read with it.
 */
export const occurrenceKeys = (
  text: string,
  glossary: ReadonlyMap<string, string>,
): readonly { readonly label: string; readonly qualifier: string }[] =>
  actionOccurrences(text, KEY_SCOPE, glossary).map((a) => ({
    label: a.quantity.slice(QUANTITY_PREFIX.length),
    qualifier: a.qualifier ?? '',
  }))

/**
 * Whether the encoder reads `text`, stored as a response with no negation flag, as NEGATED: it
 * opens with a negator the encoder strips (`never`, `not`, `does not`). The projection writes a
 * class canonical after a requirement's own stored negator, so a canonical that carries one
 * would flip the polarity of every positive spelling it replaced.
 */
export const readsNegated = (text: string): boolean =>
  toEncodable({
    id: '',
    patternType: 'ubiquitous',
    systemName: KEY_SCOPE,
    systemResponse: text,
    negated: false,
    sentence: '',
    priority: 'medium',
    status: 'draft',
  }).negated === true

/** One synthesized quantity-alias row: every phrase that keys differently from the canonical. */
export interface QuantityAliasRow {
  readonly canonical: string
  readonly aliases: readonly string[]
}

/**
 * The glossary row a quantity class is synthesized into: its canonical, and every spelling of
 * the class (declared, or a label the document reads a bound on) whose label key differs from
 * the canonical's, sorted. `undefined` when no spelling differs, so nothing is rewritten. The
 * projection and the validator both call this, so the row the validator measures is the row
 * the engine is handed.
 */
export const quantityRowOf = (
  canonical: string,
  spellings: readonly string[],
  tables: PhraseTables,
): QuantityAliasRow | undefined => {
  const key = phraseKey('quantity', canonical, tables)
  const aliases = [...new Set(spellings)]
    .filter((p) => phraseKey('quantity', p, tables) !== key)
    .sort()
  return aliases.length === 0 ? undefined : { canonical, aliases }
}

/** The committed glossary with synthesized rows appended, as the engine indexes the two. */
export const glossaryWithRows = (
  glossary: ReadonlyMap<string, string>,
  rows: readonly QuantityAliasRow[],
): ReadonlyMap<string, string> => new Map([...glossary, ...glossaryIndex(rows)])

/** An action phrase's atom under {@link KEY_SCOPE}, in the shape `areContrary` reads. */
export const actionAtom = (text: string, tables: PhraseTables) => {
  const lit = tables.atomize('resp', text, KEY_SCOPE, false)
  return {
    name: lit.atom,
    ...(lit.opposition !== undefined ? { opposition: lit.opposition } : {}),
  }
}

/**
 * An action phrase's opposition signature (invariant V-OPP, literal half): its first reading's
 * class-and-remainder body and polarity side, or `''` when it is in no antonym class.
 */
export const oppositionSignature = (text: string, tables: PhraseTables): string => {
  const o = actionAtom(text, tables).opposition
  return o === undefined ? '' : `${o.body}|${o.negative}`
}
