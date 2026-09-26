/**
 * THE VOCABULARY INVARIANTS (plan 4.3) — one validator, two call sites.
 *
 * The fold refuses an op whose result has any violation; `check` DROPS each violating entry,
 * discloses it, and demotes. Both read this one function, so a hand-edited document cannot pass a
 * check the fold would have refused. The drop is always toward FEWER equalities: a dropped symbol
 * leaves its phrases unresolved, a dropped alias or merge leaves two phrases apart. Nothing is
 * ever added to repair a violation, so the validated vocabulary can only say less than the
 * document does, never something it does not.
 *
 * | id | invariant |
 * |---|---|
 * | V1 | each phrase key has one owning symbol per collision domain; and the projection reads the atoms as the join of the atoms the engine reads today and the classes the vocabulary declares |
 * | V2 | aliases are one hop: an alias is never another symbol's canonical |
 * | V-OPP | the projection keeps every slot's polarity, exactly the contrary pairs the engine reads today (none inside one class), and every guard implication |
 * | V-NUM | the projection keeps every bound's claim, reads the quantity keys as the join of today's keys and the declared quantity classes, and keeps what every response performs on a bounded quantity |
 * | V-KIND | a class is one kind; a distinct record names two symbols of one kind |
 * | V-STATE | the states of one class name one variable value |
 * | V-PARENT | parents exist, are systems, and form no cycle; merged systems do not have different parents |
 * | V-REF | a merge or distinct record names declared symbols |
 * | V-DISTINCT | no merge unites a pair stated distinct |
 * | V-FROZEN | the glossary and terms digest equals the one taken when the vocabulary was adopted |
 * | V-READ | every tier that reads a slot's words (lint, the propose and disclosure tiers, `readers.ts`) reads the projection as it reads the original, less what the declaration implies |
 *
 * ## Two halves: the record, and the outcome
 *
 * The RECORD checks (V1's ownership, V2, V-KIND, V-STATE, V-PARENT, V-REF, V-DISTINCT, V-FROZEN)
 * are about the vocabulary as written, and need no engine. The OUTCOME checks (V1's atoms, V-OPP,
 * V-NUM, V-READ) are about what the engine would read: the validator builds the projection a vocabulary
 * gives (`projection.ts`, the same function the engine is handed), reads the original and the
 * projected document with the engine's own readers, and admits the vocabulary only when the two
 * readings differ by exactly what the declaration merges (`outcome.ts`). It never predicts a hazard
 * from the original text: a vocabulary is refused for what its projection does, and for nothing
 * else.
 *
 * The outcome is measured over the document's requirements AND one probe per declared phrase
 * (`projection.ts`), so an alias is judged by what it does to every phrase the vocabulary names,
 * not only by the phrases the requirements use today: `heat the cabin` merged with `cool the
 * cabin` is refused before any requirement says either.
 *
 * ## What is dropped when the outcome differs
 *
 * The whole admitted set is measured first; almost always it passes, and that is the only
 * measurement. When it does not, the admission is rebuilt one entry at a time, in a fixed order:
 * every symbol with only the aliases that rewrite nothing (those that share their canonical's key),
 * then each rewriting alias, symbol by symbol in id order, then each merge in (min, max) id order.
 * An entry is kept when the vocabulary with it still measures clean, and dropped, with the
 * refusal naming the phrases involved, when it does not. The result is a function of the document
 * and the vocabulary alone, and it was measured.
 */

import { sha256Hex } from '../requirements/content-hash.ts'
import {
  type RequirementsDocument,
  type SymbolId,
  type VocabSymbol,
  type Vocabulary,
  vocabularyOf,
} from '../requirements/document.ts'
import {
  type CollisionDomain,
  DOMAIN_OF_KIND,
  type PhraseTables,
  phraseKey,
  tablesOf,
} from './keys.ts'
import { compareOutcome, type Declared, type Mismatch, readOutcome, type Unit } from './outcome.ts'
import { projectedDocument, projectVocabulary } from './projection.ts'
import { indexVocabulary, resolvePhrase, resolveRequirement } from './resolve.ts'

/** Every invariant the validator enforces. */
export const INVARIANT_IDS = [
  'V1',
  'V2',
  'V-OPP',
  'V-NUM',
  'V-KIND',
  'V-STATE',
  'V-PARENT',
  'V-REF',
  'V-DISTINCT',
  'V-FROZEN',
  'V-READ',
] as const
export type InvariantId = (typeof INVARIANT_IDS)[number]

/** What the validator removed to restore the invariant. `nothing` for V-FROZEN, which removes nothing. */
export type Dropped = 'symbol' | 'alias' | 'merge' | 'distinct' | 'parent' | 'nothing'

/** One violation, naming what was dropped. */
export interface VocabularyViolation {
  readonly invariant: InvariantId
  readonly dropped: Dropped
  /** What is wrong, in words an author can act on. */
  readonly detail: string
  /** The symbols involved, sorted. For a merge or distinct record, its two ends. */
  readonly symbols: readonly SymbolId[]
  /** The phrase dropped or refused, when a phrase is what was dropped. */
  readonly phrase?: string
  /** For an outcome refusal, the phrases whose reading the projection would have changed. */
  readonly colliding?: readonly string[]
}

/** The result of validating a vocabulary: what survives, and every violation found on the way. */
export interface ValidatedVocabulary {
  /** The input vocabulary less every dropped entry, in the input's own order. */
  readonly admitted: Vocabulary
  readonly violations: readonly VocabularyViolation[]
}

/**
 * The digest the glossary and term tables are frozen under: sha256 over their content, with
 * each entry's keys in one fixed order so a reordered object key is not an edit.
 */
export const frozenTablesDigest = (doc: Pick<RequirementsDocument, 'glossary' | 'terms'>): string =>
  sha256Hex(
    JSON.stringify({
      glossary: doc.glossary.map((e) => ({ canonical: e.canonical, aliases: [...e.aliases] })),
      terms: doc.terms.map((e) => ({ canonical: e.canonical, aliases: [...e.aliases] })),
    }),
  )

/** The digest of empty tables: what an absent `frozenTables` is read as. */
const EMPTY_TABLES_DIGEST = frozenTablesDigest({ glossary: [], terms: [] })

const sorted = (...ids: readonly SymbolId[]): SymbolId[] => [...ids].sort()

/** A symbol under validation: its aliases and parent as they currently stand. */
interface Working {
  readonly symbol: VocabSymbol
  readonly domain: CollisionDomain
  readonly canonicalKey: string
  aliases: string[]
  parent: SymbolId | undefined
}

/**
 * The part-of parent a symbol declares, if any. Narrowed by key rather than by `kind`: the
 * schema types every member's `kind` as the whole kind union, so `kind` does not discriminate.
 */
const parentOf = (s: VocabSymbol): SymbolId | undefined =>
  s.kind === 'system' && 'parent' in s ? s.parent : undefined

/** A state symbol's variable value, as one comparable string. */
const stateValueOf = (s: VocabSymbol): string => {
  if (s.kind !== 'state') return ''
  const variable = 'variable' in s ? s.variable : undefined
  const value = 'value' in s ? s.value : undefined
  return JSON.stringify([variable ?? null, value ?? null])
}

/**
 * Validate a vocabulary against the document's tables (plan 4.3). `vocabulary` defaults to the
 * document's own; `implicit` skips V-FROZEN, which guards only a vocabulary an author adopted.
 */
export const validateVocabulary = (
  doc: RequirementsDocument,
  vocabulary: Vocabulary = vocabularyOf(doc),
  mode: 'explicit' | 'implicit' = 'explicit',
  tables: PhraseTables = tablesOf(doc),
): ValidatedVocabulary => {
  const early: VocabularyViolation[] = []
  const keyCache = new Map<string, string>()
  const key = (domain: CollisionDomain, text: string): string => {
    const at = `${domain}\u0000${text}`
    const hit = keyCache.get(at)
    if (hit !== undefined) return hit
    const k = phraseKey(domain, text, tables)
    keyCache.set(at, k)
    return k
  }

  // V-FROZEN: nothing to drop, only to disclose; the legacy tables still apply as written.
  if (mode === 'explicit' && vocabulary.symbols.length > 0) {
    const expected = vocabulary.frozenTables?.sha256 ?? EMPTY_TABLES_DIGEST
    if (frozenTablesDigest(doc) !== expected) {
      early.push({
        invariant: 'V-FROZEN',
        dropped: 'nothing',
        detail:
          'the glossary or terms table changed after the vocabulary was adopted; with a vocabulary both are frozen, and an alias is declared with `vocab alias`',
        symbols: [],
      })
    }
  }

  // V1 over canonicals, in id order: the first symbol to claim a key owns it.
  const live = new Map<SymbolId, Working>()
  const owner = new Map<string, { id: SymbolId; canonical: boolean }>()
  const at = (domain: CollisionDomain, k: string) => `${domain}\u0000${k}`
  for (const symbol of [...vocabulary.symbols].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const domain = DOMAIN_OF_KIND[symbol.kind]
    const canonicalKey = key(domain, symbol.canonical)
    const held = owner.get(at(domain, canonicalKey))
    if (held !== undefined) {
      early.push({
        invariant: 'V1',
        dropped: 'symbol',
        detail: `"${symbol.canonical}" is the same ${domain} phrase as ${held.id}'s; one phrase names one symbol`,
        symbols: sorted(held.id, symbol.id),
        phrase: symbol.canonical,
      })
      continue
    }
    owner.set(at(domain, canonicalKey), { id: symbol.id, canonical: true })
    live.set(symbol.id, {
      symbol,
      domain,
      canonicalKey,
      aliases: [...symbol.aliases],
      parent: parentOf(symbol),
    })
  }

  const dropAlias = (w: Working, phrase: string, v: Omit<VocabularyViolation, 'dropped'>) => {
    w.aliases = w.aliases.filter((a) => a !== phrase)
    early.push({ ...v, dropped: 'alias', phrase })
  }

  // V1 and V2 over aliases.
  for (const w of live.values()) {
    for (const alias of [...w.aliases]) {
      const k = key(w.domain, alias)
      if (k === w.canonicalKey) continue
      const held = owner.get(at(w.domain, k))
      if (held === undefined) {
        owner.set(at(w.domain, k), { id: w.symbol.id, canonical: false })
      } else if (held.id !== w.symbol.id) {
        dropAlias(w, alias, {
          invariant: held.canonical ? 'V2' : 'V1',
          detail: held.canonical
            ? `"${alias}" is ${held.id}'s canonical phrase; an alias is never another symbol's canonical`
            : `"${alias}" is already an alias of ${held.id}; one phrase names one symbol`,
          symbols: sorted(held.id, w.symbol.id),
        })
      }
    }
  }

  // V-PARENT: a parent that is missing or not a system, then part-of cycles, broken at the
  // first symbol (in id order) found on one.
  for (const w of live.values()) {
    if (w.parent === undefined) continue
    const parent = live.get(w.parent)
    if (parent === undefined || parent.symbol.kind !== 'system') {
      early.push({
        invariant: 'V-PARENT',
        dropped: 'parent',
        detail: `the parent ${w.parent} of ${w.symbol.id} is ${parent === undefined ? 'not declared' : `a ${parent.symbol.kind}, not a system`}`,
        symbols: [w.symbol.id],
      })
      w.parent = undefined
    }
  }
  for (const w of live.values()) {
    const seen = new Set<SymbolId>()
    for (let at = w.parent; at !== undefined && !seen.has(at); at = live.get(at)?.parent) {
      if (at === w.symbol.id) {
        early.push({
          invariant: 'V-PARENT',
          dropped: 'parent',
          detail: `${w.symbol.id} is its own part-of ancestor; the part-of chain has no cycles`,
          symbols: [w.symbol.id],
        })
        w.parent = undefined
        break
      }
      seen.add(at)
    }
  }

  // Distinct records: reference integrity and kind, before any merge reads them.
  const distinctViolations: VocabularyViolation[] = []
  const distinct = vocabulary.distinct.filter((d) => {
    const a = live.get(d.a)
    const b = live.get(d.b)
    const symbols = sorted(d.a, d.b)
    if (a === undefined || b === undefined) {
      distinctViolations.push({
        invariant: 'V-REF',
        dropped: 'distinct',
        detail: `the distinct record ${symbols.join(' / ')} names an undeclared symbol`,
        symbols,
      })
      return false
    }
    if (a.symbol.kind !== b.symbol.kind) {
      distinctViolations.push({
        invariant: 'V-KIND',
        dropped: 'distinct',
        detail: `a distinct record names two symbols of one kind; ${d.a} is a ${a.symbol.kind} and ${d.b} a ${b.symbol.kind}`,
        symbols,
      })
      return false
    }
    return true
  })

  // Merges, in (min, max) id order, each admitted as a record only if the class it forms is one
  // kind, one state value and one parent, and unites no distinct pair. A class's representative
  // is its minimum id, so a merge's direction never matters.
  const mergeViolations: VocabularyViolation[] = []
  const rep = new Map<SymbolId, SymbolId>([...live.keys()].map((id) => [id, id]))
  const find = (id: SymbolId): SymbolId => {
    let r = id
    while (rep.get(r) !== r) r = rep.get(r) ?? r
    return r
  }
  const members = (root: SymbolId) => [...live.values()].filter((w) => find(w.symbol.id) === root)
  const order = vocabulary.merges
    .map((m, i) => ({ m, i, lo: m.a < m.b ? m.a : m.b, hi: m.a < m.b ? m.b : m.a }))
    .sort((x, y) =>
      x.lo !== y.lo ? (x.lo < y.lo ? -1 : 1) : x.hi < y.hi ? -1 : x.hi > y.hi ? 1 : 0,
    )
  const recordMerges: { i: number; lo: SymbolId; hi: SymbolId }[] = []
  for (const { i, lo, hi } of order) {
    const symbols = [lo, hi]
    const refuse = (invariant: InvariantId, detail: string) =>
      mergeViolations.push({ invariant, dropped: 'merge', detail, symbols })
    const a = live.get(lo)
    const b = live.get(hi)
    if (a === undefined || b === undefined) {
      refuse('V-REF', `the merge ${lo} / ${hi} names an undeclared symbol`)
      continue
    }
    const ra = find(lo)
    const rb = find(hi)
    if (ra === rb) {
      recordMerges.push({ i, lo, hi })
      continue
    }
    if (a.symbol.kind !== b.symbol.kind) {
      refuse(
        'V-KIND',
        `a class is one kind; ${lo} is a ${a.symbol.kind} and ${hi} a ${b.symbol.kind}`,
      )
      continue
    }
    const inA = new Set(members(ra).map((w) => w.symbol.id))
    const inB = new Set(members(rb).map((w) => w.symbol.id))
    const split = distinct.find(
      (d) => (inA.has(d.a) && inB.has(d.b)) || (inA.has(d.b) && inB.has(d.a)),
    )
    if (split !== undefined) {
      refuse(
        'V-DISTINCT',
        `the merge would unite ${split.a} and ${split.b}, stated distinct: ${split.reason}`,
      )
      continue
    }
    if (stateValueOf(a.symbol) !== stateValueOf(b.symbol)) {
      refuse('V-STATE', `the states of one class name one variable value; ${lo} and ${hi} name two`)
      continue
    }
    const parents = new Set(
      [...members(ra), ...members(rb)].flatMap((w) => (w.parent === undefined ? [] : [w.parent])),
    )
    if (parents.size > 1) {
      refuse(
        'V-PARENT',
        `merged systems have one parent; this class would have ${[...parents].sort().join(', ')}`,
      )
      continue
    }
    const root = ra < rb ? ra : rb
    rep.set(ra === root ? rb : ra, root)
    recordMerges.push({ i, lo, hi })
  }

  // The vocabulary a set of admitted aliases and merges forms, in the input's own order.
  const assemble = (
    aliasesOf: (w: Working) => readonly string[],
    merges: ReadonlySet<number>,
  ): Vocabulary => ({
    ...vocabulary,
    symbols: vocabulary.symbols.flatMap((s): VocabSymbol[] => {
      const w = live.get(s.id)
      if (w === undefined) return []
      const kept = aliasesOf(w)
      const aliases = s.aliases.filter((a) => kept.includes(a))
      if ('parent' in s && s.parent !== undefined && w.parent === undefined) {
        const { parent: _dropped, ...rest } = s
        return [{ ...rest, aliases }]
      }
      return [aliases.length === s.aliases.length ? s : { ...s, aliases }]
    }),
    merges: vocabulary.merges.filter((_, i) => merges.has(i)),
    distinct,
  })

  // The outcome: what the projection of each candidate hands the engine, against the original.
  const measure = measureOf(doc, tables, mode)
  const outcomeAliasViolations: VocabularyViolation[] = []
  const outcomeMergeViolations: VocabularyViolation[] = []
  const allMerges = new Set(recordMerges.map((m) => m.i))
  let admitted = assemble((w) => w.aliases, allMerges)
  if (measure(admitted) !== undefined) {
    const rewrites = (w: Working, alias: string) => key(w.domain, alias) !== w.canonicalKey
    const kept = new Map<SymbolId, string[]>(
      [...live.values()].map((w) => [w.symbol.id, w.aliases.filter((a) => !rewrites(w, a))]),
    )
    const merges = new Set<number>()
    const current = () => assemble((w) => kept.get(w.symbol.id) ?? [], merges)
    // The floor rewrites nothing, so the projection is the identity and cannot move a verdict;
    // a floor that still differs is disclosed, and every rewriting entry is refused with it.
    const floor = measure(current())
    if (floor !== undefined) {
      outcomeAliasViolations.push({
        invariant: floor.invariant,
        dropped: 'nothing',
        detail: `with no alias that rewrites and no merge, ${floor.detail}`,
        symbols: [],
        colliding: floor.phrases,
      })
    }
    for (const w of [...live.values()].sort((a, b) => (a.symbol.id < b.symbol.id ? -1 : 1))) {
      for (const alias of w.aliases.filter((a) => rewrites(w, a))) {
        const list = kept.get(w.symbol.id) ?? []
        list.push(alias)
        const m = floor ?? measure(current())
        if (m === undefined) continue
        list.pop()
        outcomeAliasViolations.push({
          invariant: m.invariant,
          dropped: 'alias',
          detail: m.detail,
          symbols: [w.symbol.id],
          phrase: alias,
          colliding: m.phrases,
        })
      }
    }
    for (const { i, lo, hi } of recordMerges) {
      merges.add(i)
      const m = floor ?? measure(current())
      if (m === undefined) continue
      merges.delete(i)
      outcomeMergeViolations.push({
        invariant: m.invariant,
        dropped: 'merge',
        detail: m.detail,
        symbols: [lo, hi],
        colliding: m.phrases,
      })
    }
    admitted = current()
  }

  return {
    admitted,
    violations: [
      ...early,
      ...outcomeAliasViolations,
      ...mergeViolations,
      ...outcomeMergeViolations,
      ...distinctViolations,
    ],
  }
}

/**
 * The outcome measurement of candidate vocabularies over one document: the projection each gives
 * (`projection.ts`, the function the engine is handed), read with the engine's own readers beside
 * the original (`outcome.ts`). `undefined` when the two readings differ by exactly what the
 * candidate declares.
 */
const measureOf =
  (doc: RequirementsDocument, tables: PhraseTables, mode: 'explicit' | 'implicit') =>
  (candidate: Vocabulary): Mismatch | undefined => {
    const index = indexVocabulary(candidate, tables, mode)
    const projection = projectVocabulary(doc, index)
    const projected = projectedDocument(doc, projection)
    const rep = (id: SymbolId) => index.representative.get(id) ?? id
    const units = (after: boolean): Unit[] => [
      ...Object.values((after ? projected : doc).requirements).map((requirement) => ({
        id: requirement.id,
        requirement,
      })),
      ...projection.probes.map((p) => ({
        id: p.id,
        requirement: after ? p.projected : p.requirement,
        slot: p.slot,
      })),
    ]
    const read = (after: boolean) =>
      readOutcome(units(after), projection.labelProbes, {
        glossary: (after ? projected : doc).glossary,
        antonyms: tables.antonyms,
        terms: doc.terms,
      })
    const before = read(false)
    const after = read(true)

    // The class each use is declared in: its system's class and its symbol's class.
    const slotClass = new Map<string, string>()
    const systemClass = new Map<string, string>()
    for (const r of Object.values(doc.requirements)) {
      const system = resolvePhrase(index, ['system'], r.systemName)
      if (!('unresolved' in system)) {
        systemClass.set(r.id, rep(system.id))
        slotClass.set(`${r.id}\u0000sys`, rep(system.id))
      }
      const res = resolveRequirement(index, r)
      if ('unresolved' in res) continue
      const b = res.binding
      const at = (kind: string, id: SymbolId | undefined) => {
        if (id !== undefined) slotClass.set(`${r.id}\u0000${kind}`, `${rep(b.system)}|${rep(id)}`)
      }
      at('resp', b.response)
      at('trig', b.trigger)
      at('pre', b.preCondition ?? b.feature)
    }
    for (const p of projection.probes) {
      systemClass.set(p.id, PROBE_CLASS)
      slotClass.set(`${p.id}\u0000sys`, PROBE_CLASS)
      if (p.owner !== undefined)
        slotClass.set(`${p.id}\u0000${p.slot}`, `${PROBE_CLASS}|${rep(p.owner)}`)
    }
    for (const l of projection.labelProbes) systemClass.set(l.id, PROBE_CLASS)
    const declared: Declared = {
      atom: (use) => slotClass.get(use),
      bound: (use) => {
        const label = before.bounds.get(use)?.label ?? ''
        const system = systemClass.get(use.split('\u0000')[0] ?? '')
        if (system === undefined || label.trim() === '') return undefined
        const q = resolvePhrase(index, ['quantity'], label)
        return 'unresolved' in q ? undefined : `${system}|${rep(q.id)}`
      },
    }
    return compareOutcome(before, after, declared)
  }

/** The system class every probe is declared under. */
const PROBE_CLASS = '\u0000probe'
