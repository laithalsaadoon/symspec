/**
 * THE PROJECTION (plan 4.2) — what the engine is handed for a document with a vocabulary.
 *
 * The one trusted component: the only place a committed alias changes what the engine reads.
 * Slice S8 threads it through `compat.toEngineDoc`; this module computes it and has no caller
 * yet.
 *
 * - **Classes** are the union-find over the admitted merges. A class's representative is its
 *   minimum id, so neither the direction a merge was written in nor which symbol's canonical an
 *   author picked first can change what a class rewrites to.
 * - **Slot rewrite.** A resolved slot whose phrase key differs from its class canonical's is
 *   replaced by the canonical TEXT, never the id: every engine reader then reads one rewritten
 *   text, so none of them can disagree with another about it, and a reader keyed on a looser
 *   normalization than the atom key (relational groups on `normalize`) still sees the words it
 *   groups on. A spelling that shares its canonical's key is left verbatim, which is what makes
 *   the implicit vocabulary project to the identity. A stored leading negator is kept.
 * - **Quantity aliases** become synthesized glossary rows: the class canonical, and each phrase of
 *   the class whose label key differs from it.
 * - **A requirement with an unresolved slot** is rewritten not at all and reported, so a caller
 *   can exclude it rather than check half-projected text.
 * - **A legacy document** (no declared symbol) has no projection: `undefined`.
 */

import type { RequirementsDocument, SymbolId } from '../requirements/document.ts'
import { vocabularyOf } from '../requirements/document.ts'
import type { VocabularyViolation } from './invariants.ts'
import { type CollisionDomain, phraseKey, responseOf } from './keys.ts'
import { buildVocabularyIndex, resolveRequirement, type UnresolvedSlot } from './resolve.ts'

/** The slots a projection may rewrite, with their new text. Absent means verbatim. */
export type SlotRewrite = Partial<
  Record<'systemName' | 'trigger' | 'preCondition' | 'systemResponse', string>
>

/** One synthesized quantity-alias row: every phrase that keys differently from the canonical. */
export interface QuantityAliasRow {
  readonly canonical: string
  readonly aliases: readonly string[]
}

/** The projection of one document. */
export interface Projection {
  /** What the validator dropped, for the caller to disclose. */
  readonly invalid: readonly VocabularyViolation[]
  readonly representative: ReadonlyMap<SymbolId, SymbolId>
  /** The canonical of a symbol's class: its representative's canonical. */
  readonly canonicalOf: (id: SymbolId) => string
  /** Per requirement id, the slots rewritten. A requirement with nothing rewritten is absent. */
  readonly rewrites: ReadonlyMap<string, SlotRewrite>
  /** Per requirement id, the slots that did not resolve. */
  readonly unresolved: ReadonlyMap<string, readonly UnresolvedSlot[]>
  readonly quantityAliases: readonly QuantityAliasRow[]
}

/** The projection of a document with a declared vocabulary; `undefined` for a legacy document. */
export const buildProjection = (doc: RequirementsDocument): Projection | undefined => {
  if (vocabularyOf(doc).symbols.length === 0) return undefined
  const { index, invalid } = buildVocabularyIndex(doc)
  const { representative, byId, tables } = index
  const canonicalOf = (id: SymbolId): string =>
    byId.get(representative.get(id) ?? id)?.canonical ?? ''
  const rewritten = (domain: CollisionDomain, text: string, id: SymbolId | undefined) => {
    if (id === undefined) return undefined
    const canonical = canonicalOf(id)
    return phraseKey(domain, text, tables) === phraseKey(domain, canonical, tables)
      ? undefined
      : canonical
  }

  const rewrites = new Map<string, SlotRewrite>()
  const unresolved = new Map<string, readonly UnresolvedSlot[]>()
  for (const r of Object.values(doc.requirements)) {
    const res = resolveRequirement(index, r)
    if ('unresolved' in res) {
      unresolved.set(r.id, res.unresolved)
      continue
    }
    const b = res.binding
    const rewrite: SlotRewrite = {}
    const system = rewritten('system', r.systemName, b.system)
    if (system !== undefined) rewrite.systemName = system
    if (r.trigger !== undefined) {
      const trigger = rewritten('guard', r.trigger, b.trigger)
      if (trigger !== undefined) rewrite.trigger = trigger
    }
    if (r.preCondition !== undefined) {
      const pre =
        b.feature !== undefined
          ? rewritten('feature', r.preCondition, b.feature)
          : rewritten('guard', r.preCondition, b.preCondition)
      if (pre !== undefined) rewrite.preCondition = pre
    }
    const response = responseOf(r)
    const action = rewritten('action', response.text, b.response)
    if (action !== undefined) rewrite.systemResponse = `${response.prefix}${action}`
    if (Object.keys(rewrite).length > 0) rewrites.set(r.id, rewrite)
  }

  const classes = new Map<SymbolId, string[]>()
  for (const s of index.symbols) {
    if (s.kind !== 'quantity') continue
    const root = representative.get(s.id) ?? s.id
    classes.set(root, [...(classes.get(root) ?? []), s.canonical, ...s.aliases])
  }
  const quantityAliases: QuantityAliasRow[] = []
  for (const root of [...classes.keys()].sort()) {
    const canonical = canonicalOf(root)
    const key = phraseKey('quantity', canonical, tables)
    const aliases = [...new Set(classes.get(root) ?? [])]
      .filter((p) => phraseKey('quantity', p, tables) !== key)
      .sort()
    if (aliases.length > 0) quantityAliases.push({ canonical, aliases })
  }

  return { invalid, representative, canonicalOf, rewrites, unresolved, quantityAliases }
}
