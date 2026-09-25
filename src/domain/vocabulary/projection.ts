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
 *   the class whose label key differs from it, the document's bound labels included. The engine
 *   looks a row up on `normalize` of each label, not on its quantity key, so a label that resolves
 *   into the class by key (`keep the level%` beside `keep the level`) is re-keyed only by a row
 *   of its own; without one, the class would be split. The validator measures this same row
 *   (`quantityRowOf`) against every other label and every action occurrence it could re-key.
 * - **A requirement with an unresolved slot** is rewritten not at all and reported, so a caller
 *   can exclude it rather than check half-projected text.
 * - **A legacy document** (no declared symbol) has no projection: `undefined`.
 */

import type { RequirementsDocument, SymbolId } from '../requirements/document.ts'
import { vocabularyOf } from '../requirements/document.ts'
import type { VocabularyViolation } from './invariants.ts'
import {
  type CollisionDomain,
  phraseKey,
  type QuantityAliasRow,
  quantityRowOf,
  responseOf,
  slotUses,
} from './keys.ts'
import {
  buildVocabularyIndex,
  resolvePhrase,
  resolveRequirement,
  type UnresolvedSlot,
} from './resolve.ts'

/** The slots a projection may rewrite, with their new text. Absent means verbatim. */
export type SlotRewrite = Partial<
  Record<'systemName' | 'trigger' | 'preCondition' | 'systemResponse', string>
>

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

  // Every spelling of each quantity class: its declared phrases, then every bound label of any
  // requirement (resolved or not, as the validator reads them) that resolves into it.
  const classes = new Map<SymbolId, string[]>()
  const spell = (id: SymbolId, texts: readonly string[]) => {
    const root = representative.get(id) ?? id
    classes.set(root, [...(classes.get(root) ?? []), ...texts])
  }
  for (const s of index.symbols) if (s.kind === 'quantity') spell(s.id, [s.canonical, ...s.aliases])
  for (const r of Object.values(doc.requirements)) {
    for (const use of slotUses(r, tables)) {
      if (use.domain !== 'quantity') continue
      const res = resolvePhrase(index, use.kinds, use.text)
      if (!('unresolved' in res)) spell(res.id, [use.text])
    }
  }
  const quantityAliases: QuantityAliasRow[] = []
  for (const root of [...classes.keys()].sort()) {
    const row = quantityRowOf(canonicalOf(root), classes.get(root) ?? [], tables)
    if (row !== undefined) quantityAliases.push(row)
  }

  return { invalid, representative, canonicalOf, rewrites, unresolved, quantityAliases }
}
