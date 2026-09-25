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
