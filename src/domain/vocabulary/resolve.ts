/**
 * THE RESOLUTION CHOKEPOINT (plan 4.1) — the one place a phrase becomes a symbol.
 *
 * Every caller that asks "which symbol does this slot name" asks here: the fold (slice S7, through
 * an injected resolver, because `domain/requirements` may not import the engine), the projection
 * at `compat` (S8), the drift binding (S16), `propose-vocabulary` (S9) and the vocabulary tier
 * (S10). One lookup, so two readers can never disagree about what a requirement names (the
 * stable-key-resolution lesson).
 *
 * ## Two modes, one resolver
 *
 * A document that declares symbols is resolved against them, after the validator has dropped
 * every entry that breaks an invariant (`invariants.ts`, through `build.ts`); what it dropped
 * comes back in `invalid`, so `check` can disclose and demote instead of throwing. A document that declares
 * none is resolved against its IMPLICIT vocabulary (`implicit.ts`), which is valid by
 * construction and resolves every phrase it uses. Both modes bind through the same functions, so
 * a legacy baseline and its bootstrapped successor bind every requirement to the same ids.
 *
 * ## Resolution never guesses
 *
 * An unresolved phrase returns the nearest declared symbols of the kinds the slot accepts, ranked
 * by token Jaccard, then shared token prefix, then id: deterministic, no embedding. They are
 * CANDIDATES. Nothing here binds one, and a caller that did would turn a refusal into a silent
 * rename (AC-4-3).
 */

import type {
  EarsPattern,
  Requirement,
  SymbolId,
  SymbolKind,
  VocabSymbol,
  Vocabulary,
} from '../requirements/document.ts'
import {
  type BoundReading,
  type CollisionDomain,
  DOMAIN_OF_KIND,
  negatedOf,
  type PhraseTables,
  phraseKey,
  type SlotName,
  slotUses,
} from './keys.ts'

/** How a phrase reached its symbol. `implicit` is every resolution in a document with no vocabulary. */
export type ResolvedVia = 'canonical' | 'alias' | 'implicit'

/** A declared symbol near an unresolved phrase. */
export interface Candidate {
  readonly id: SymbolId
  readonly canonical: string
}

/** A resolved phrase. */
export interface Resolved {
  readonly id: SymbolId
  readonly via: ResolvedVia
}

/** An unresolved phrase, and the symbols nearest it. Never bound to any of them. */
export interface Unresolved {
  readonly unresolved: true
  readonly candidates: readonly Candidate[]
}

/** A slot of a requirement that resolved to nothing. */
export interface UnresolvedSlot {
  readonly slot: SlotName
  readonly text: string
  readonly kinds: readonly SymbolKind[]
  readonly candidates: readonly Candidate[]
}

/** One numeric bound a requirement places, on a quantity symbol. */
export interface QuantityBinding extends BoundReading {
  readonly label: SymbolId
}

/**
 * What a requirement MEANS, as symbol ids: the seam the Phase 4 typed IR binds its slot literals
 * from, and the record drift is keyed on (S16).
 *
 * Every id is the symbol that OWNS the phrase, not its class representative, so committing a
 * merge rebinds nothing. `sentence`, `intentRef`, `derived` and every metadata field are outside
 * it: rewording the sentence or retargeting the intent changes no binding.
 */
export interface RequirementBinding {
  readonly patternType: EarsPattern
  /** The response polarity as the encoder reads it: the stored flag, or a stored leading negator. */
  readonly negated: boolean
  readonly system: SymbolId
  readonly trigger?: SymbolId
  /** A state-driven (or other non-feature) precondition. */
  readonly preCondition?: SymbolId
  /** An optional-feature precondition. */
  readonly feature?: SymbolId
  /** The whole response slot. */
  readonly response: SymbolId
  /** Each bound the numeric tier reads, in its order: response, trigger, precondition. */
  readonly quantities: readonly QuantityBinding[]
  readonly responseKind?: 'effect' | 'constraint'
  readonly stateEffect?: string
  readonly stateConstraint?: string
}

/** Which symbol owns a phrase key, and whether through its canonical or an alias. */
interface Owner {
  readonly id: SymbolId
  readonly via: 'canonical' | 'alias'
}

/** A validated vocabulary, indexed for lookup. */
export interface VocabularyIndex {
  readonly mode: 'explicit' | 'implicit'
  readonly tables: PhraseTables
  /** Every admitted symbol, with its admitted aliases, sorted by id. */
  readonly symbols: readonly VocabSymbol[]
  readonly byId: ReadonlyMap<SymbolId, VocabSymbol>
  /** The admitted merges and distinct records. */
  readonly merges: Vocabulary['merges']
  readonly distinct: Vocabulary['distinct']
  /** Each symbol's class representative: the minimum id of the class its admitted merges form. */
  readonly representative: ReadonlyMap<SymbolId, SymbolId>
  /** Phrase-key ownership, keyed `<domain>\0<key>`. */
  readonly owners: ReadonlyMap<string, Owner>
}

const ownerKey = (domain: CollisionDomain, key: string) => `${domain}\u0000${key}`

/** The class representatives of a set of symbols under a set of merges: the minimum id of each class. */
const representativesOf = (
  symbols: readonly VocabSymbol[],
  merges: Vocabulary['merges'],
): ReadonlyMap<SymbolId, SymbolId> => {
  const parent = new Map(symbols.map((s) => [s.id, s.id]))
  const find = (id: SymbolId): SymbolId => {
    let r = id
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r) ?? r
    return r
  }
  for (const m of merges) {
    const a = find(m.a)
    const b = find(m.b)
    if (a === b) continue
    if (a < b) parent.set(b, a)
    else parent.set(a, b)
  }
  return new Map(symbols.map((s) => [s.id, find(s.id)]))
}

/**
 * Index a vocabulary for lookup, AS GIVEN: nothing is validated here. `build.ts`'s
 * `buildVocabularyIndex` is the entry point every caller uses, and it indexes only what the
 * validator admitted; the validator itself indexes each candidate it measures through this.
 */
export const indexVocabulary = (
  vocabulary: Pick<Vocabulary, 'symbols' | 'merges' | 'distinct'>,
  tables: PhraseTables,
  mode: 'explicit' | 'implicit',
): VocabularyIndex => {
  const symbols = [...vocabulary.symbols].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const owners = new Map<string, Owner>()
  for (const s of symbols) {
    const domain = DOMAIN_OF_KIND[s.kind]
    owners.set(ownerKey(domain, phraseKey(domain, s.canonical, tables)), {
      id: s.id,
      via: 'canonical',
    })
  }
  for (const s of symbols) {
    const domain = DOMAIN_OF_KIND[s.kind]
    for (const alias of s.aliases) {
      const at = ownerKey(domain, phraseKey(domain, alias, tables))
      if (!owners.has(at)) owners.set(at, { id: s.id, via: 'alias' })
    }
  }
  return {
    mode,
    tables,
    symbols,
    byId: new Map(symbols.map((s) => [s.id, s])),
    merges: vocabulary.merges,
    distinct: vocabulary.distinct,
    representative: representativesOf(symbols, vocabulary.merges),
    owners,
  }
}

/** The tokens a candidate is ranked on: the phrase key's words, less articles. */
const tokensOf = (key: string): readonly string[] =>
  key.split('_').filter((t) => t !== '' && t !== 'a' && t !== 'an' && t !== 'the')

/** How many CANDIDATES an unresolved phrase carries. */
const CANDIDATE_LIMIT = 3

/** The declared symbols nearest `key`, of the given kinds; none that shares no token with it. */
const candidatesFor = (
  index: VocabularyIndex,
  kinds: readonly SymbolKind[],
  domain: CollisionDomain,
  key: string,
): Candidate[] => {
  const want = tokensOf(key)
  const wanted = new Set(want)
  const ranked: { id: SymbolId; canonical: string; jaccard: number; prefix: number }[] = []
  for (const s of index.symbols) {
    if (!kinds.includes(s.kind)) continue
    let jaccard = 0
    let prefix = 0
    for (const phrase of [s.canonical, ...s.aliases]) {
      const have = tokensOf(phraseKey(domain, phrase, index.tables))
      const shared = new Set(have.filter((t) => wanted.has(t))).size
      const union = new Set([...want, ...have]).size
      const j = union === 0 ? 0 : shared / union
      let p = 0
      while (p < want.length && p < have.length && want[p] === have[p]) p += 1
      if (j > jaccard || (j === jaccard && p > prefix)) {
        jaccard = j
        prefix = p
      }
    }
    if (jaccard > 0 || prefix > 0)
      ranked.push({ id: s.id, canonical: s.canonical, jaccard, prefix })
  }
  ranked.sort((x, y) =>
    x.jaccard !== y.jaccard
      ? y.jaccard - x.jaccard
      : x.prefix !== y.prefix
        ? y.prefix - x.prefix
        : x.id < y.id
          ? -1
          : 1,
  )
  return ranked.slice(0, CANDIDATE_LIMIT).map(({ id, canonical }) => ({ id, canonical }))
}

/**
 * Resolve one phrase to a symbol of one of `kinds`, all of which share one collision domain.
 * A phrase whose key is owned by a symbol of another kind is unresolved.
 */
export const resolvePhrase = (
  index: VocabularyIndex,
  kinds: readonly SymbolKind[],
  text: string,
): Resolved | Unresolved => {
  const [first] = kinds
  if (first === undefined) return { unresolved: true, candidates: [] }
  const domain = DOMAIN_OF_KIND[first]
  const key = phraseKey(domain, text, index.tables)
  const owner = index.owners.get(ownerKey(domain, key))
  const kind = owner === undefined ? undefined : index.byId.get(owner.id)?.kind
  if (owner !== undefined && kind !== undefined && kinds.includes(kind)) {
    return { id: owner.id, via: index.mode === 'implicit' ? 'implicit' : owner.via }
  }
  return { unresolved: true, candidates: candidatesFor(index, kinds, domain, key) }
}

/**
 * Resolve every slot of a requirement: its binding, or every slot that did not resolve. A
 * requirement is bound only when ALL of its slots are; a partial binding would let a caller
 * treat an unresolved slot as absent.
 */
export const resolveRequirement = (
  index: VocabularyIndex,
  r: Requirement,
):
  | { readonly binding: RequirementBinding }
  | { readonly unresolved: readonly UnresolvedSlot[] } => {
  const unresolved: UnresolvedSlot[] = []
  const bound = new Map<SlotName, SymbolId>()
  const quantities: QuantityBinding[] = []
  for (const use of slotUses(r, index.tables)) {
    const res = resolvePhrase(index, use.kinds, use.text)
    if ('unresolved' in res) {
      unresolved.push({
        slot: use.slot,
        text: use.text,
        kinds: use.kinds,
        candidates: res.candidates,
      })
    } else if (use.bound !== undefined) {
      quantities.push({ label: res.id, ...use.bound })
    } else {
      bound.set(use.slot, res.id)
    }
  }
  if (unresolved.length > 0) return { unresolved }
  const system = bound.get('systemName') ?? ''
  const response = bound.get('systemResponse') ?? ''
  const trigger = bound.get('trigger')
  const precondition = bound.get('preCondition')
  const feature = r.patternType === 'optional-feature'
  return {
    binding: {
      patternType: r.patternType,
      negated: negatedOf(r),
      system,
      ...(trigger !== undefined ? { trigger } : {}),
      ...(precondition !== undefined
        ? feature
          ? { feature: precondition }
          : { preCondition: precondition }
        : {}),
      response,
      quantities,
      ...(r.responseKind !== undefined ? { responseKind: r.responseKind } : {}),
      ...(r.stateEffect !== undefined ? { stateEffect: r.stateEffect } : {}),
      ...(r.stateConstraint !== undefined ? { stateConstraint: r.stateConstraint } : {}),
    },
  }
}

/** A requirement's binding, or `undefined` when any slot of it is unresolved. */
export const bindingOf = (
  index: VocabularyIndex,
  r: Requirement,
): RequirementBinding | undefined => {
  const res = resolveRequirement(index, r)
  return 'binding' in res ? res.binding : undefined
}
