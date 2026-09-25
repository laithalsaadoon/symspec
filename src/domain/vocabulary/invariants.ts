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
 * | V1 | each phrase key has one owning symbol per collision domain; and a phrase the projection would rewrite shares no atom, and no glossary key, with another domain |
 * | V2 | aliases are one hop: an alias is never another symbol's canonical |
 * | V-OPP | every phrase of a class has its canonical's opposition, and every contrary pair of phrases survives the rewrite |
 * | V-NUM | every phrase of a class hands the numeric tier its canonical's bounds |
 * | V-KIND | a class is one kind; a distinct record names two symbols of one kind |
 * | V-STATE | the states of one class name one variable value |
 * | V-PARENT | parents exist, are systems, and form no cycle; merged systems do not have different parents |
 * | V-REF | a merge or distinct record names declared symbols |
 * | V-DISTINCT | no merge unites a pair stated distinct |
 * | V-FROZEN | the glossary and terms digest equals the one taken when the vocabulary was adopted |
 *
 * ## Where this goes beyond the plan's table, and why
 *
 * - **V-OPP has two halves.** The plan's literal rule compares each phrase's opposition key and
 *   side with its canonical's. That is not enough for the claim it is there to make, "if p in A is
 *   contrary to q in B, canon(A) is contrary to canon(B)": contrariety also needs a committed PAIR
 *   joining the two heads, and two heads on one side of one class can be paired with different
 *   verbs. `close` and `shut` share open's class and side; commit `unbar`/`shut` and `shut the
 *   gate` opposes `unbar the gate` while `close the gate` does not. So the second half checks the
 *   claim itself, over every contrary pair among the vocabulary's phrases.
 * - **V1 has a cross-domain half.** The engine reads two domains' phrases on one key in two
 *   places: the propositional encoder names an optional-feature precondition in the `guard`
 *   namespace, and the glossary a quantity alias would be synthesized into is looked up on every
 *   slot. A rewrite in one domain must not move a phrase off a key another domain's phrase still
 *   holds, or it splits an atom, or re-keys a slot nobody aliased.
 * - **V-REF and V-DISTINCT** are the reference-integrity checks the schema cannot state.
 */

import { areContrary } from '../engine/formal/atomize.ts'
import { sha256Hex } from '../requirements/content-hash.ts'
import {
  type RequirementsDocument,
  type SymbolId,
  type VocabSymbol,
  type Vocabulary,
  vocabularyOf,
} from '../requirements/document.ts'
import {
  actionAtom,
  type CollisionDomain,
  DOMAIN_OF_KIND,
  glossaryKey,
  numericSignature,
  oppositionSignature,
  type PhraseTables,
  phraseKey,
  tablesOf,
} from './keys.ts'

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
  const key = (domain: CollisionDomain, text: string) => phraseKey(domain, text, tables)

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

  // V-OPP (literal half) and V-NUM, alias against its own canonical.
  for (const w of live.values()) {
    for (const alias of [...w.aliases]) {
      if (key(w.domain, alias) === w.canonicalKey) continue
      const refusal = classRefusal(w.domain, w.symbol.canonical, alias, tables)
      if (refusal !== undefined) {
        dropAlias(w, alias, { ...refusal, symbols: [w.symbol.id] })
      }
    }
  }

  // V1 (cross-domain half), alias against its own canonical.
  const phrasesIn = crossDomainKeys(live, tables)
  for (const w of live.values()) {
    for (const alias of [...w.aliases]) {
      const hazard = rewriteHazard(w, alias, w.symbol.canonical, phrasesIn, tables)
      if (hazard !== undefined) dropAlias(w, alias, { ...hazard, symbols: [w.symbol.id] })
    }
  }

  // V-OPP (claim half), with each symbol its own class: drop every alias on a contrary pair the
  // canonicals do not keep.
  const rep = new Map<SymbolId, SymbolId>([...live.keys()].map((id) => [id, id]))
  for (const loss of contraryLosses(live, rep, tables)) {
    for (const end of [loss.p, loss.q]) {
      const w = live.get(end.id)
      if (w === undefined || end.text === w.symbol.canonical || !w.aliases.includes(end.text)) {
        continue
      }
      dropAlias(w, end.text, {
        invariant: 'V-OPP',
        detail: loss.detail,
        symbols: sorted(loss.p.id, loss.q.id),
      })
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

  // Merges, in (min, max) id order, each admitted only if the class it forms keeps every
  // invariant. A class's representative is its minimum id, so a merge's direction never matters.
  const mergeViolations: VocabularyViolation[] = []
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
  const admittedMerges = new Set<number>()
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
      admittedMerges.add(i)
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
    const canonical = live.get(root)?.symbol.canonical ?? ''
    const other = live.get(root === ra ? rb : ra)?.symbol.canonical ?? ''
    // Each class already agrees with its own canonical, so the merged class agrees with the new
    // canonical exactly when the two canonicals agree.
    const refusal = classRefusal(a.domain, canonical, other, tables)
    if (refusal !== undefined) {
      refuse(refusal.invariant, refusal.detail)
      continue
    }
    const hazard = [...members(ra), ...members(rb)]
      .flatMap((w) => [w.symbol.canonical, ...w.aliases].map((text) => ({ w, text })))
      .map(({ w, text }) => rewriteHazard(w, text, canonical, phrasesIn, tables))
      .find((h) => h !== undefined)
    if (hazard !== undefined) {
      refuse(hazard.invariant, hazard.detail)
      continue
    }
    const tentative = new Map(rep)
    tentative.set(ra === root ? rb : ra, root)
    const [loss] = contraryLosses(live, tentative, tables)
    if (loss !== undefined) {
      refuse('V-OPP', loss.detail)
      continue
    }
    rep.set(ra === root ? rb : ra, root)
    admittedMerges.add(i)
  }

  const admittedSymbols = vocabulary.symbols.flatMap((s): VocabSymbol[] => {
    const w = live.get(s.id)
    if (w === undefined) return []
    const aliases = s.aliases.filter((a) => w.aliases.includes(a))
    if ('parent' in s && s.parent !== undefined && w.parent === undefined) {
      const { parent: _dropped, ...rest } = s
      return [{ ...rest, aliases }]
    }
    return [aliases.length === s.aliases.length ? s : { ...s, aliases }]
  })
  return {
    admitted: {
      ...vocabulary,
      symbols: admittedSymbols,
      merges: vocabulary.merges.filter((_, i) => admittedMerges.has(i)),
      distinct,
    },
    violations: [...early, ...mergeViolations, ...distinctViolations],
  }
}

/**
 * Whether `phrase` may join a class whose canonical is `canonical`: V-OPP's literal half (one
 * opposition key and side, or none on both) for an action, and V-NUM for any phrase the numeric
 * tier reads bounds in.
 */
const classRefusal = (
  domain: CollisionDomain,
  canonical: string,
  phrase: string,
  tables: PhraseTables,
): { invariant: InvariantId; detail: string } | undefined => {
  if (
    domain === 'action' &&
    oppositionSignature(phrase, tables) !== oppositionSignature(canonical, tables)
  ) {
    return {
      invariant: 'V-OPP',
      detail: `"${phrase}" and "${canonical}" sit in different antonym positions, so one class would hold what one opposes and the other does not`,
    }
  }
  if (numericSignature(domain, phrase, tables) !== numericSignature(domain, canonical, tables)) {
    return {
      invariant: 'V-NUM',
      detail: `"${phrase}" and "${canonical}" carry different numeric bounds, so rewriting one to the other would change what the numeric tier compares`,
    }
  }
  return undefined
}

/** The keys other domains hold that a rewrite in one domain must not move a phrase off. */
interface CrossDomainKeys {
  /** Every guard and every feature phrase key (the propositional `guard` namespace). */
  readonly guard: ReadonlySet<string>
  readonly feature: ReadonlySet<string>
  /** The glossary key of every guard, feature and action phrase. */
  readonly slotGlossary: ReadonlySet<string>
}

const crossDomainKeys = (
  live: ReadonlyMap<SymbolId, Working>,
  tables: PhraseTables,
): CrossDomainKeys => {
  const guard = new Set<string>()
  const feature = new Set<string>()
  const slotGlossary = new Set<string>()
  for (const w of live.values()) {
    for (const text of [w.symbol.canonical, ...w.aliases]) {
      if (w.domain === 'guard') guard.add(phraseKey('guard', text, tables))
      if (w.domain === 'feature') feature.add(phraseKey('feature', text, tables))
      if (w.domain === 'guard' || w.domain === 'feature' || w.domain === 'action') {
        slotGlossary.add(glossaryKey(text))
      }
    }
  }
  return { guard, feature, slotGlossary }
}

/**
 * V1's cross-domain half: whether rewriting `phrase` (of symbol `w`) to `canonical` would move it
 * off a key another domain's phrase holds. A phrase whose key already equals the canonical's is
 * never rewritten, and is never a hazard.
 */
const rewriteHazard = (
  w: Working,
  phrase: string,
  canonical: string,
  keys: CrossDomainKeys,
  tables: PhraseTables,
): { invariant: InvariantId; detail: string } | undefined => {
  const k = phraseKey(w.domain, phrase, tables)
  if (k === phraseKey(w.domain, canonical, tables)) return undefined
  const across =
    w.domain === 'feature' && keys.guard.has(k)
      ? 'a state or event'
      : w.domain === 'guard' && keys.feature.has(k)
        ? 'a feature'
        : w.domain === 'quantity' && keys.slotGlossary.has(glossaryKey(phrase))
          ? 'a guard, feature or action'
          : undefined
  return across === undefined
    ? undefined
    : {
        invariant: 'V1',
        detail: `"${phrase}" is also ${across} phrase; rewriting it to "${canonical}" would re-key that phrase too, or split the atom the two share`,
      }
}

/** One contrary pair the class canonicals do not keep. */
interface ContraryLoss {
  readonly p: { readonly id: SymbolId; readonly text: string }
  readonly q: { readonly id: SymbolId; readonly text: string }
  readonly detail: string
}

/**
 * V-OPP's claim half: every two action phrases the engine reads as contraries whose class
 * canonicals are not contraries, or which sit in one class. `rep` maps each symbol to its class
 * representative.
 */
const contraryLosses = (
  live: ReadonlyMap<SymbolId, Working>,
  rep: ReadonlyMap<SymbolId, SymbolId>,
  tables: PhraseTables,
): ContraryLoss[] => {
  const root = (id: SymbolId): SymbolId => {
    let r = id
    while (rep.get(r) !== undefined && rep.get(r) !== r) r = rep.get(r) ?? r
    return r
  }
  const phrases = [...live.values()]
    .filter((w) => w.domain === 'action')
    .flatMap((w) => [w.symbol.canonical, ...w.aliases].map((text) => ({ id: w.symbol.id, text })))
  const atoms = new Map(phrases.map((p) => [p.text, actionAtom(p.text, tables)]))
  const atomOf = (text: string) => atoms.get(text) ?? actionAtom(text, tables)
  const losses: ContraryLoss[] = []
  for (const [i, p] of phrases.entries()) {
    for (const q of phrases.slice(i + 1)) {
      if (!areContrary(atomOf(p.text), atomOf(q.text))) continue
      const rp = root(p.id)
      const rq = root(q.id)
      const cp = live.get(rp)?.symbol.canonical ?? p.text
      const cq = live.get(rq)?.symbol.canonical ?? q.text
      if (rp === rq) {
        losses.push({
          p,
          q,
          detail: `"${p.text}" and "${q.text}" are contraries, and one class would name both`,
        })
      } else if (!areContrary(atomOf(cp), atomOf(cq))) {
        losses.push({
          p,
          q,
          detail: `"${p.text}" and "${q.text}" are contraries, and their canonicals "${cp}" and "${cq}" are not; the rewrite would lose the contrary`,
        })
      }
    }
  }
  return losses
}
