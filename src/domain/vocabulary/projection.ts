/**
 * THE PROJECTION (plan 4.2) — what the engine is handed for a document with a vocabulary.
 *
 * The one trusted component: the only place a committed alias changes what the engine reads.
 * Slice S8 threads {@link projectedDocument} through `compat.toEngineDoc`; the validator
 * (`invariants.ts`) measures exactly that document, so what it admits is what the engine reads.
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
 * - **Quantity aliases** become synthesized glossary rows: the class canonical, and every label
 *   of the class whose quantity key differs from the canonical's. "Every label" is every label the
 *   numeric tier reads a bound on, in the document AS PROJECTED as well as as written (a rewritten
 *   response hands the tier its canonical's label), and in every declared phrase, plus the
 *   declared quantity phrases. The engine looks a row up on `normalize` of a label, not on its
 *   quantity key, so a label left out of the row stays where it was and splits the class; the
 *   validator refuses any row that still does, or that captures another class's label.
 * - **Probes.** Each declared guard, feature and action phrase is also set in a synthetic
 *   requirement and projected like a document slot, and each declared quantity phrase is read as a
 *   label. They are what the validator measures a vocabulary on beyond the document's own slots,
 *   so a declared alias is judged by what it would do to every phrase it names, not only to the
 *   ones the requirements happen to use today. The engine is never handed a probe.
 * - **A requirement with an unresolved slot** is rewritten not at all and reported, so a caller
 *   can exclude it rather than check half-projected text.
 */

import { requirementBounds } from '../engine/formal/numeric.ts'
import { requirementsContentHash, waiverBinding } from '../requirements/content-hash.ts'
import type {
  Requirement,
  RequirementsDocument,
  SymbolId,
  SymbolKind,
} from '../requirements/document.ts'
import type { VocabularyViolation } from './invariants.ts'
import {
  type CollisionDomain,
  DOMAIN_OF_KIND,
  phraseKey,
  responseOf,
  slotUses,
  viewOf,
} from './keys.ts'
import type { LabelUnit, ProbeSlot } from './outcome.ts'
import {
  type RequirementBinding,
  resolvePhrase,
  resolveRequirement,
  type UnresolvedSlot,
  type VocabularyIndex,
} from './resolve.ts'

/** The slots a projection may rewrite, with their new text. Absent means verbatim. */
export type SlotRewrite = Partial<
  Record<'systemName' | 'trigger' | 'preCondition' | 'systemResponse', string>
>

/** One synthesized quantity-alias row: the class canonical, and every label keyed apart from it. */
export interface QuantityAliasRow {
  readonly canonical: string
  readonly aliases: readonly string[]
}

/** A declared phrase set in a synthetic requirement, as written and as projected. */
export interface Probe {
  readonly id: string
  readonly symbol: SymbolId
  /** The symbol the phrase resolves to in its slot: the one it is declared under, when admitted. */
  readonly owner?: SymbolId
  readonly slot: ProbeSlot
  readonly requirement: Requirement
  readonly projected: Requirement
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
  /** Every declared guard, feature and action phrase, set in a synthetic requirement. */
  readonly probes: readonly Probe[]
  /** Every declared quantity phrase, as the label a bound on it would be read on. */
  readonly labelProbes: readonly (LabelUnit & { readonly symbol: SymbolId })[]
}

/** The system every probe but a feature's is set under. Its atoms and quantity keys are its own. */
export const PROBE_SYSTEM = 'vocabulary probe'

/**
 * The system a FEATURE probe is set under, apart from every other probe. The encoder reads an
 * optional-feature precondition in the `guard` namespace, so a declared feature and a declared
 * state spelled alike would be one atom under one probe system while the vocabulary declares
 * them two kinds, and every such vocabulary would be refused whatever the document says. What
 * the engine joins is a feature and a guard spelled alike IN ONE SYSTEM of the document, and
 * that is refused on the document's own requirements (V-KIND, decision D10).
 */
export const FEATURE_PROBE_SYSTEM = 'vocabulary feature probe'

/** The response a guard probe carries; only the probe's own slot is ever read. */
const PROBE_RESPONSE = 'hold'

/** The slot a declared phrase of each kind is set in, and the pattern that slot needs. */
const PROBE_SHAPE: Readonly<
  Record<
    Exclude<SymbolKind, 'system' | 'quantity'>,
    { slot: ProbeSlot; pattern: string; system: string }
  >
> = {
  action: { slot: 'resp', pattern: 'ubiquitous', system: PROBE_SYSTEM },
  event: { slot: 'trig', pattern: 'event-driven', system: PROBE_SYSTEM },
  state: { slot: 'pre', pattern: 'state-driven', system: PROBE_SYSTEM },
  feature: { slot: 'pre', pattern: 'optional-feature', system: FEATURE_PROBE_SYSTEM },
}

const probeRequirement = (
  id: string,
  kind: keyof typeof PROBE_SHAPE,
  phrase: string,
): Requirement => {
  const { slot, pattern, system } = PROBE_SHAPE[kind]
  const systemResponse = slot === 'resp' ? phrase : PROBE_RESPONSE
  return {
    id,
    patternType: pattern as Requirement['patternType'],
    systemName: system,
    systemResponse,
    negated: false,
    sentence: '',
    priority: 'medium',
    status: 'draft',
    derives: [],
    satisfies: [],
    verifies: [],
    refines: [],
    createdAt: '',
    updatedAt: '',
    ...(slot === 'trig' ? { trigger: phrase } : {}),
    ...(slot === 'pre' ? { preCondition: phrase } : {}),
  }
}

/**
 * The projection of a document under an index (validated or not). `buildProjection` in
 * `build.ts` is the entry point every caller uses; the validator calls this on each candidate it
 * measures.
 */
export const projectVocabulary = (
  doc: RequirementsDocument,
  index: VocabularyIndex,
  invalid: readonly VocabularyViolation[] = [],
): Projection => {
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
  const rewriteOf = (
    r: Requirement,
    b: Partial<
      Pick<RequirementBinding, 'system' | 'trigger' | 'preCondition' | 'feature' | 'response'>
    >,
  ): SlotRewrite => {
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
    return rewrite
  }

  const rewrites = new Map<string, SlotRewrite>()
  const unresolved = new Map<string, readonly UnresolvedSlot[]>()
  for (const r of Object.values(doc.requirements)) {
    const res = resolveRequirement(index, r)
    if ('unresolved' in res) {
      unresolved.set(r.id, res.unresolved)
      continue
    }
    const rewrite = rewriteOf(r, res.binding)
    if (Object.keys(rewrite).length > 0) rewrites.set(r.id, rewrite)
  }

  // Probes: each declared phrase in its own slot, bound to the symbol it resolves to there.
  const probes: Probe[] = []
  const labelProbes: (LabelUnit & { symbol: SymbolId })[] = []
  for (const s of index.symbols) {
    for (const [i, phrase] of [s.canonical, ...s.aliases].entries()) {
      const id = `probe:${s.id}:${i}`
      if (s.kind === 'quantity') {
        labelProbes.push({ id, symbol: s.id, system: PROBE_SYSTEM, label: phrase })
        continue
      }
      if (s.kind === 'system') continue
      const requirement = probeRequirement(id, s.kind, phrase)
      const slot = PROBE_SHAPE[s.kind].slot
      const use = slotUses(requirement, tables).find(
        (u) => u.domain === DOMAIN_OF_KIND[s.kind] && u.slot !== 'systemName',
      )
      const res = use === undefined ? undefined : resolvePhrase(index, [s.kind], use.text)
      const owner = res === undefined || 'unresolved' in res ? undefined : res.id
      const binding =
        owner === undefined
          ? {}
          : slot === 'resp'
            ? { response: owner }
            : slot === 'trig'
              ? { trigger: owner }
              : s.kind === 'feature'
                ? { feature: owner }
                : { preCondition: owner }
      probes.push({
        id,
        symbol: s.id,
        ...(owner !== undefined ? { owner } : {}),
        slot,
        requirement,
        projected: { ...requirement, ...rewriteOf(requirement, binding) },
      })
    }
  }

  // Every label of each quantity class, as written and as projected, then its row.
  const classes = new Map<SymbolId, string[]>()
  const spell = (label: string) => {
    if (label.trim() === '') return
    const res = resolvePhrase(index, ['quantity'], label)
    if ('unresolved' in res) return
    const root = representative.get(res.id) ?? res.id
    classes.set(root, [...(classes.get(root) ?? []), label])
  }
  const read = (r: Requirement) => {
    for (const { predicate } of requirementBounds(viewOf(r), tables.glossary))
      spell(predicate.label)
  }
  for (const r of Object.values(doc.requirements)) {
    read(r)
    read({ ...r, ...(rewrites.get(r.id) ?? {}) })
  }
  for (const p of probes) {
    read(p.requirement)
    read(p.projected)
  }
  for (const l of labelProbes) spell(l.label)
  const quantityAliases: QuantityAliasRow[] = []
  for (const root of [...classes.keys()].sort()) {
    const canonical = canonicalOf(root)
    const key = phraseKey('quantity', canonical, tables)
    const aliases = [...new Set(classes.get(root) ?? [])]
      .filter((label) => phraseKey('quantity', label, tables) !== key)
      .sort()
    if (aliases.length > 0) quantityAliases.push({ canonical, aliases })
  }

  return {
    invalid,
    representative,
    canonicalOf,
    rewrites,
    unresolved,
    quantityAliases,
    probes,
    labelProbes,
  }
}

/**
 * The document the engine is handed: each rewritten slot replaced, each quantity-alias row
 * appended to the glossary, the channel the numeric tier reads its aliases from, and each waiver
 * bound to the requirements as the author wrote them. The sentence, and every other field, is
 * passed verbatim.
 *
 * A waiver's `contentHash` binds it to the text a reviewer read, and the boundary forwards one only
 * while its requirements still hash to it (`waiverBinding`, the one binding function). The author's
 * text is the document's, and a projection does not edit it, so each waiver keeps the standing it
 * has on the document as written:
 *
 * - one that `binds` is rebound to the requirements as projected;
 * - one that is `stale` is dropped, as the boundary drops it on the original: kept, a rewrite that
 *   restored the words it was reviewed on would revive it;
 * - one that is `unbound` is kept verbatim: its cause reads no words, so it stays unbound, by the
 *   same cause, on the projected document.
 *
 * The code's waivability class reads no words either, so the check honours exactly the waivers it
 * honours on the original: a rewrite neither resurrects a finding someone reviewed nor revives a
 * review of other words.
 */
export const projectedDocument = (
  doc: RequirementsDocument,
  projection: Projection,
): RequirementsDocument => {
  const requirements = Object.fromEntries(
    Object.values(doc.requirements).map((r) => [
      r.id,
      { ...r, ...(projection.rewrites.get(r.id) ?? {}) },
    ]),
  )
  const waivers = doc.waivers.flatMap((w) => {
    const binding = waiverBinding(doc, w)
    if (binding.kind === 'unbound') return [w]
    if (binding.kind === 'stale') return []
    const contentHash = requirementsContentHash({ requirements }, binding.ids)
    return contentHash === undefined ? [] : [{ ...w, contentHash }]
  })
  return {
    ...doc,
    glossary: [
      ...doc.glossary,
      ...projection.quantityAliases.map((row) => ({
        canonical: row.canonical,
        aliases: [...row.aliases],
      })),
    ],
    requirements,
    waivers,
  }
}
