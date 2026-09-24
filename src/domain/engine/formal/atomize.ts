/**
 * The load-bearing atomization contract (AC-4-2a).
 *
 * `atomize` is the SINGLE pure function that turns an EARS slot's text into a
 * Boolean SMT atom. Every formal finding — contradiction (AC-4-4), subsumption
 * / redundancy (AC-4-5), vacuity, incompleteness (AC-4-5a) — is only as sound
 * as this function, because two requirements "conflict" in the solver exactly
 * when their responses resolve to the SAME atom with opposite polarity. That
 * makes this the spec's designated load-bearing component (research-smt.md §4;
 * spec AC-4-2a, AC-4-11 "sound modulo atomization").
 *
 * The four invariants this module guarantees, each directly tested:
 *
 *   1. PURITY / DETERMINISM. `atomize` depends only on its arguments and the
 *      frozen seed antonym table. No clock, no randomness, no mutation of its
 *      inputs, no module-level mutable state. Same input → byte-identical
 *      output, always. Downstream unsat-core minimization and the "exactly two
 *      IDs" contradiction test (AC-4-4) rely on this.
 *
 *   2. CONSERVATIVE, NEAR-EXACT NORMALIZATION. The pipeline is EXACTLY:
 *        lowercase → strip leading articles (a|an|the) → strip punctuation
 *        → collapse whitespace → underscore-join → glossary rewrite →
 *        copula strip (guard slots only) → leading-verb de-inflection +
 *        antonym-class lookup (response slots only; it sets the atom's
 *        {@link Opposition}, never its name's head or its polarity).
 *      It MUST NOT stem, lemmatize, or strip stopwords from the REMAINDER of a
 *      slot. Three closed, deterministic head/token rules are the whole
 *      exception surface (each below, each tested):
 *        - the LEADING RESPONSE VERB is de-inflected by a closed third-person
 *          -s rule ({@link deInflectHead}), so "shall opens the valve" and
 *          "shall open the valve" collide on one atom;
 *        - GUARD slots ({@link GUARD_KINDS}: pre/trig/feat) drop a single copula
 *          token ({@link stripCopula}), so "the session is authenticated" and
 *          "the session authenticated" name one guard state;
 *        - when (and only when) the head is in an ANTONYM class, one preposition
 *          token is dropped from the remainder ({@link canonicalizeAntonymRest}),
 *          so "include X in the view" / "exclude X from the view" share one
 *          opposition key and are contraries.
 *      Everything else stays near-exact: aggressive normalization is the one
 *      false-positive risk class (AC-4-11), so we buy only what closed rules
 *      can honestly deliver.
 *
 *   3. PER-systemName SCOPING. Every atom is prefixed `sys__<system>__<namespace>__`
 *      (rendered by {@link renderAtom}, the one place that format is written; trigger and
 *      precondition share the `guard` namespace — {@link atomNamespace}).
 *      Identical response text under two different systems therefore yields two
 *      distinct atoms and can never unify into a spurious cross-system
 *      contradiction (spec AC-4-2a; research-smt.md §4.1 — "scope atoms per
 *      systemName ... keep that").
 *
 *   4. NEGATION-ON-THE-SAME-ATOM. The response negation from AC-2-4 (the
 *      `negated` flag on the Tier-1 parse) is consumed as the atom's POLARITY,
 *      not baked into the atom text. "shall not store plaintext" and "shall
 *      store plaintext" produce the SAME atom with opposite polarity, so the
 *      solver sees `R` vs `¬R` and can find the conflict — the whole point of
 *      extracting negation as a flag rather than leaving "not" in the string.
 *      The curated seed antonym table (antonyms.ts) extends this to lexical
 *      opposites — as a CONTRARY, not a negation (spec 007 AC-2-1): "grant
 *      access" / "revoke access" are two atoms plus the axiom
 *      `¬(grant_access ∧ revoke_access)` ({@link contraryPairs}), so "shall grant"
 *      plus "shall revoke" is still unsatisfiable while "shall not grant" plus
 *      "shall not revoke" — do neither — is not. The rename `revoke ≡ ¬grant` this
 *      replaced asserted that one of the two always happens, and fabricated an
 *      error-severity contradiction on exactly that consistent document.
 *
 * ## ONE atomizer for BOTH tiers (AC-2-7)
 *
 * This module is the SINGLE atomizer for the propositional tier (`encode.ts`)
 * AND the bounded-temporal tier (`temporal-patterns.ts`). It did not used to be:
 * `temporal-patterns.ts` carried a private normalizer that diverged from this one
 * in nine measured ways (punctuation class, copula strip, glossary, antonym
 * unification, de-inflection, a fourth `feat` kind, `not` baked into the atom
 * NAME, empty-slot atoms, and a different requirement population). The
 * consequence was that `--temporal` was blind to every glossary/antonym
 * commitment — structurally, because `earsToTemporal` took no such parameter.
 *
 * The divergences are resolved in favour of the semantics BELOW in every case:
 * this is the tier whose behavior is pinned by `atomize.test.ts` and whose
 * conservatism argument (invariant 2) is the documented one. `earsToTemporal`
 * now takes an injected {@link Atomize} — the SAME function instance the
 * propositional encoder receives — so the two tiers cannot drift again without a
 * signature change.
 *
 * **Propose/decide note.** Nothing in this pipeline is a propose-only leniency
 * being promoted into a decide key (the trap
 * `.erpaval/solutions/architecture/normalization-for-a-propose-signal-must-not-touch-the-decide-key.md`
 * records). The glossary and antonym indexes are DOC-COMMITTED artifacts — the
 * decide half of propose/decide — and the copula strip, leading-verb
 * de-inflection and antonym-remainder rule are closed deterministic rules that
 * were already in the propositional DECIDE key before AC-2-7. Unification makes
 * two decide tiers agree; it does not make either one looser than it was.
 */

import { ANTONYM_INDEX, type AntonymEntry } from './antonyms.ts'
import { deInflectHead } from './lemma.ts'

export { deInflectHead } from './lemma.ts'

/**
 * Which EARS slot an atom was derived from (research-smt.md §4.1). The SINGLE
 * declaration of this union: `encode.ts` used to declare a structurally
 * identical copy, which is exactly the kind of duplication that let the two
 * tiers drift (AC-2-7). `encode.ts` now imports this type.
 *
 * `feat` is produced ONLY by the temporal tier's `optional-feature` mapping
 * (`temporal-patterns.ts`); the propositional encoder never emits one, so no
 * propositional consumer's behavior changes by its presence in the union. Its
 * survival is a live semantic question — see the `feat` note on
 * {@link GUARD_KINDS}.
 */
export type AtomKind = 'trig' | 'pre' | 'resp' | 'feat'

/**
 * The GUARD kinds — the slot kinds that describe a condition rather than a
 * response, and therefore the kinds the copula strip applies to.
 *
 * `feat` is in this set because an `optional-feature` requirement's `feat` atom
 * is derived from the very same `preCondition` slot a `state-driven`
 * requirement's `pre` atom comes from; treating the two slots differently under
 * normalization would be a divergence of exactly the kind AC-2-7 removes.
 *
 * **Open semantic question, deliberately NOT resolved here (AC-2-7 note (a)).**
 * Whether `feat` should exist at all: one slot yielding two different atom
 * namespaces depending on `patternType` is arguably wrong, and collapsing
 * `feat` into the shared `guard` namespace `pre` and `trig` render into (spec 007
 * AC-3-3, {@link atomNamespace}) is arguably more correct. It is NOT a refactor —
 * collapsing it makes an `optional-feature` precondition share an atom with a
 * `state-driven` precondition of the same text, which can only INCREASE
 * unification and therefore increase error-severity findings. The conservative choice (keep the
 * namespaces separate, exactly as shipped) is what is implemented, because the
 * other direction moves in the false-positive direction and needs a human.
 */
export const GUARD_KINDS: ReadonlySet<AtomKind> = new Set<AtomKind>(['pre', 'trig', 'feat'])

/**
 * The STRUCTURED identity of an atom, before it is rendered to a name.
 *
 * The whole reason this exists (AC-2-7): an atom used to be nothing but a
 * pre-joined string, so any consumer that wanted to know an atom's KIND had to
 * look for `__resp__` as an embedded substring of the name. That is a parse of a
 * rendering — it cannot distinguish a real kind marker from body text, and it
 * silently answers a well-formed question wrongly. Carrying `{scope, kind, body}`
 * and rendering on demand makes kind a field, so the question is answered by a
 * lookup that cannot be fooled.
 *
 * `scope` and `body` are ALREADY {@link normalize}d; `renderAtom` only joins.
 */
export interface AtomRef {
  /** The normalized `systemName` the atom is scoped under (invariant 3). */
  readonly scope: string
  /**
   * Which EARS slot the atom came from. NOT the name's namespace: `trig` and `pre` render into the
   * one `guard` namespace ({@link atomNamespace}), so two refs that differ only in this field name
   * one atom.
   */
  readonly kind: AtomKind
  /**
   * The normalized slot body, post-glossary / copula / antonym rewriting. Empty
   * exactly when the slot was absent or normalized away to nothing — which is
   * what lets a caller OMIT the slot rather than emit a well-formed-but-empty
   * atom that two unrelated malformed requirements would then share.
   */
  readonly body: string
}

/**
 * The NAMESPACE an atom of each slot kind is named in — the `<ns>` of `sys__<scope>__<ns>__<body>`.
 *
 * Trigger and precondition share ONE namespace, `guard` (spec 007 AC-3-3). They used to be named
 * by slot (`trig` / `pre`), which made "When the train is moving" and "While the train is moving"
 * two unrelated Booleans: the contradiction tier keys a context group on the exact guard-atom set,
 * so a requirement guarded one way never met one guarded the other way, and a real conflict went
 * uncompared while the document counted as verified. Every propositional tier evaluates a single
 * snapshot, in which both clauses assert the same thing — the condition holds now — so they are
 * one atom. The SLOT is not forgotten: it stays on {@link AtomRef.kind} and on every atom-table
 * row, which is where `incomplete.ts` reads trigger-versus-precondition.
 *
 * `resp` stays its own namespace, so a response can never be a guard by naming the same words
 * (the subsumption lemma and the vacuity blame analysis both rest on that). `feat` stays its own
 * namespace too: whether an optional-feature precondition should share the guard namespace is the
 * open question recorded on {@link GUARD_KINDS}, and this AC does not decide it.
 */
export function atomNamespace(kind: AtomKind): string {
  return kind === 'trig' || kind === 'pre' ? 'guard' : kind
}

/**
 * Render an {@link AtomRef} to its scoped atom name. The ONE place the name
 * format `sys__<system>__<namespace>__<body>` is written down ({@link atomNamespace}), so both
 * tiers' atom names are byte-identical by construction rather than by comment.
 */
export function renderAtom(ref: AtomRef): string {
  // POSTCONDITIONS, not comments. An empty scope makes `sys____<kind>__<body>`, which merges every
  // system whose name normalizes away into ONE namespace — two unrelated systems' responses then
  // land on one atom and, at opposite polarity, prove a contradiction neither document contains.
  // A scope carrying anything but letters, marks, digits (any script) and `_` makes the rendered
  // name ambiguous to parse, and the format is parsed: `catalog.ts` and the atom-corpus gate both
  // split on `__`.
  if (ref.scope === '') throw new Error('renderAtom: empty scope — see normalizeScope')
  if (!/^[\p{L}\p{M}\p{N}_]+$/u.test(ref.scope) || ref.scope.includes('__')) {
    throw new Error(`renderAtom: scope outside [letters digits _]: ${JSON.stringify(ref.scope)}`)
  }
  return `sys__${ref.scope}__${atomNamespace(ref.kind)}__${ref.body}`
}

/** A single Boolean atom: its fully-scoped name plus the polarity to assert. */
export interface Atom {
  /**
   * The scoped atom name, e.g. `sys__auth_service__resp__issue_a_session_token`.
   * Two slot texts collide iff they produce the same `name`. Always exactly
   * `renderAtom(ref)`.
   */
  name: string
  /** When true, the formula asserts `¬name` rather than `name`. */
  negated: boolean
  /** The structured identity `name` renders from (see {@link AtomRef}). */
  ref: AtomRef
  /**
   * Present exactly when the response's leading verb is in an antonym class (seed or
   * doc-committed): which class-and-remainder the atom belongs to, and which side of it. Two
   * atoms with one `key` and opposite `negative` are CONTRARIES — see {@link contraryPairs}.
   */
  opposition?: Opposition
}

/**
 * An atom's place in an antonym class (spec 007 AC-2-1).
 *
 * Opposition is a CONTRARY relation between two distinct atoms, `¬(A ∧ B)`, and never the rename
 * `A ≡ ¬B`. The rename asserted that one of the two actions always happens, so "shall not accept
 * the order" plus "shall not reject the order" — a document that only says "do neither" — was
 * `¬A ∧ A` and an error-severity FND_CONTRADICTION. The contrary axiom says only what the table
 * means: both cannot happen at once.
 */
export interface Opposition {
  /**
   * The class-and-remainder identity: the atom name the pre-AC-2-1 rename would have produced
   * (`sys__<scope>__resp__<class canonical>_<remainder>`). Two atoms share a key exactly when the
   * rename used to collapse them onto one atom, so the axioms relate exactly the pairs the rename
   * related, and nothing else.
   */
  readonly key: string
  /** Which polarity side of the class the head verb sits on (`reject`, `decline` vs `accept`). */
  readonly negative: boolean
}

/**
 * A Boolean atom paired with its polarity, as the injected {@link Atomize}
 * contract returns it. `negated: true` means the requirement asserts `¬atom` — an
 * explicit `shall not` per AC-2-4, and nothing else (an antonym is a contrary
 * axiom, never a polarity flip — AC-2-1). The atom name is the *positive* atom,
 * so `shall X` and `shall not X` share one atom with opposite polarity.
 *
 * Declared HERE rather than in `encode.ts` (AC-2-7): the atomization contract
 * belongs to the atomizer, and having the encoder own a second copy of the atom
 * vocabulary is what let the temporal tier grow a third.
 */
export interface AtomLit {
  atom: string
  negated: boolean
  /**
   * The structured identity, when the atomizer supplied one. OPTIONAL because
   * unit tests legitimately inject a hand-written atomizer that returns only a
   * name; a consumer that needs the structure must handle its absence rather
   * than fall back to parsing `atom` (see {@link AtomRef}).
   */
  ref?: AtomRef
  /** The atom's antonym-class membership, when it has one (see {@link Opposition}). */
  opposition?: Opposition
}

/**
 * The atom-table function (AC-4-2a), INJECTED into both the propositional
 * encoder (`encode`) and the temporal mapper (`earsToTemporal`) so the two tiers
 * provably share one atomizer: they receive the same function instance from
 * `src/pipeline/check.ts`, and neither can be called without one.
 *
 * Given a slot kind, the raw slot text, the owning `systemName` (for per-system
 * scoping so identical response text under two systems yields two distinct atoms
 * — invariant 3), and the parse-time `negated` flag (AC-2-4), it returns the
 * scoped atom name and its polarity.
 *
 * Context slots (`trig`/`pre`/`feat`) pass `negated = false`; only the response
 * slot threads the requirement's `negated` flag.
 */
export type Atomize = (
  kind: AtomKind,
  slotText: string,
  systemName: string,
  negated: boolean,
) => AtomLit

/**
 * Build the injected {@link Atomize} both tiers consume, closing over an optional
 * glossary index (AC-9-2) so agent-confirmed synonyms canonicalize to one atom,
 * and an optional doc-augmented antonym index (#1) so agent-confirmed opposites
 * become contraries ({@link Opposition}). With neither, behavior is
 * byte-identical to the pre-feature run.
 *
 * This lives here rather than in the pipeline (AC-2-7) precisely so the temporal
 * tier can be handed the same closure the propositional tier gets — the previous
 * arrangement (a private adapter inside `check.ts`) is what made the temporal
 * tier's blindness structural.
 */
export function makeAtomize(
  glossary?: ReadonlyMap<string, string>,
  antonyms?: ReadonlyMap<string, AntonymEntry>,
  terms?: ReadonlyMap<string, readonly string[]>,
): Atomize {
  return (kind, slotText, systemName, negated) => {
    const a = atomize({
      kind,
      text: slotText,
      systemName,
      negated,
      ...(glossary !== undefined ? { glossary } : {}),
      ...(antonyms !== undefined ? { antonyms } : {}),
      ...(terms !== undefined ? { terms } : {}),
    })
    return {
      atom: a.name,
      negated: a.negated,
      ref: a.ref,
      ...(a.opposition !== undefined ? { opposition: a.opposition } : {}),
    }
  }
}

/**
 * Whether two atoms are contraries (spec 007 AC-2-1): distinct atoms on opposite sides of one
 * antonym class over one remainder. For the PROPOSE tiers, which used to skip such a pair because
 * the rename gave both one atom name; now the names differ, and without this they would propose
 * `accept X` and `reject X` as synonyms to merge.
 */
export function areContrary(
  a: { readonly name: string; readonly opposition?: Opposition },
  b: { readonly name: string; readonly opposition?: Opposition },
): boolean {
  return (
    a.name !== b.name &&
    a.opposition !== undefined &&
    b.opposition !== undefined &&
    a.opposition.key === b.opposition.key &&
    a.opposition.negative !== b.opposition.negative
  )
}

/**
 * The contrary pairs among a set of atoms (spec 007 AC-2-1): every two DISTINCT atoms that share
 * an {@link Opposition.key} and sit on opposite sides of it. Each pair `[a, b]` is the axiom
 * `¬(a ∧ b)`, which every solver-driving tier asserts as a plain (unguarded) background fact —
 * it is part of the vocabulary, not of any requirement, so it never appears in an unsat core.
 *
 * Same-side members of one class (`accept`, `approve`) get NO axiom and stay distinct atoms. The
 * rename used to merge them as a side effect — two verbs opposite to one third verb were forced
 * equal — which contraries do not entail, and which asserted a synonymy nobody committed.
 *
 * Pure; the output is sorted and deduplicated, so it is a function of the atom SET.
 */
export function contraryPairs(
  lits: Iterable<{ readonly atom: string; readonly opposition?: Opposition }>,
): Array<readonly [string, string]> {
  const sides = new Map<string, { pos: Set<string>; neg: Set<string> }>()
  for (const lit of lits) {
    if (lit.opposition === undefined) continue
    let entry = sides.get(lit.opposition.key)
    if (entry === undefined) {
      entry = { pos: new Set(), neg: new Set() }
      sides.set(lit.opposition.key, entry)
    }
    ;(lit.opposition.negative ? entry.neg : entry.pos).add(lit.atom)
  }
  const pairs = new Map<string, readonly [string, string]>()
  for (const { pos, neg } of sides.values()) {
    for (const p of pos) {
      for (const n of neg) {
        if (p === n) continue
        const pair = (p < n ? [p, n] : [n, p]) as readonly [string, string]
        pairs.set(`${pair[0]}\u0000${pair[1]}`, pair)
      }
    }
  }
  return [...pairs.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([, v]) => v)
}

/** Arguments to {@link atomize}. */
export interface AtomizeArgs {
  /** The EARS slot kind this text came from. */
  kind: AtomKind
  /** The raw slot text (trigger / precondition / response). */
  text: string
  /** The requirement's `systemName`; the atom is scoped under its normalization. */
  systemName: string
  /**
   * Response negation from AC-2-4. Consumed as the atom's polarity so `¬R`
   * lands on the SAME atom as `R`. Callers pass this only for `resp` slots;
   * omitted elsewhere. Never `undefined`-widened (exactOptionalPropertyTypes).
   */
  negated?: boolean
  /**
   * Optional glossary (AC-9-2): a map from a NORMALIZED alias phrase to its
   * NORMALIZED canonical phrase. When the normalized slot text matches an
   * alias, the canonical phrase is atomized instead, so agent-confirmed
   * synonyms ("issue a session token" ≡ "issue a login credential") collide on
   * one atom and a paraphrased contradiction becomes provable. Omitted ⇒
   * behavior is byte-identical to a glossary-free run. Built by
   * {@link glossaryIndex} from the document's committed glossary — the fuzzy
   * embedding step only PROPOSES entries; this deterministic lookup is what
   * actually merges them.
   */
  glossary?: ReadonlyMap<string, string>
  /**
   * Optional antonym index (#1): the resolved signed equivalence classes the
   * `resp` leading-verb unification consults. When omitted, the code-committed
   * seed table ({@link ANTONYM_INDEX}) is used, so behavior is byte-identical to
   * the pre-feature path. Callers that have doc-committed antonym pairs pass a
   * merged index (built by `buildAntonymIndexWithDoc`) so an agent-confirmed
   * pair like open/shut becomes a contrary exactly like a seed pair. Consulted only
   * for `resp` slots, after the glossary rewrite.
   */
  antonyms?: ReadonlyMap<string, AntonymEntry>
  /**
   * Optional term index: committed NOUN-PHRASE substitutions, applied INSIDE the body.
   *
   * The compositional half of {@link glossary}. That map replaces a whole body; this one
   * rewrites a token run within it, so one committed entry aligns a noun everywhere it appears
   * — including in requirements written after the entry. Built by {@link termIndex} from the
   * document's committed `terms`. Omitted ⇒ behavior is byte-identical to a term-free run.
   *
   * Consulted for EVERY slot kind, after the glossary rewrite and before the copula strip.
   */
  terms?: ReadonlyMap<string, readonly string[]>
}

/**
 * Build the normalized alias→canonical lookup {@link atomize} consumes from a
 * document's committed glossary entries (AC-9-1). Both sides are run through
 * {@link normalize} so a glossary authored in natural phrasing matches the
 * normalized slot body. A canonical mapped to itself is harmless (idempotent).
 */
/**
 * Build the token-sequence substitution table {@link atomize} consumes from a document's
 * committed `terms`.
 *
 * Keyed on the underscore-joined NORMALIZED alias, valued as the canonical's TOKEN LIST — so
 * the substitution below can splice tokens without re-splitting on every hit. Both sides run
 * through {@link normalize}, exactly as {@link glossaryIndex} does, so a term authored in
 * natural phrasing matches a normalized body.
 *
 * An alias that normalizes to nothing is dropped rather than stored: an empty key would match
 * at every position.
 */
export function termIndex(
  entries: ReadonlyArray<{ canonical: string; aliases: readonly string[] }>,
): Map<string, readonly string[]> {
  const index = new Map<string, readonly string[]>()
  for (const { canonical, aliases } of entries) {
    const canonTokens = normalize(canonical).split('_').filter(Boolean)
    if (canonTokens.length === 0) continue
    for (const alias of aliases) {
      const key = normalize(alias)
      if (key.length === 0) continue
      index.set(key, canonTokens)
    }
  }
  return index
}

/**
 * Substitute committed terms inside a normalized body. Pure; returns `body` unchanged when
 * the index is empty or nothing matches.
 *
 * ## The rule, in one sentence
 *
 * Scan the token list left to right; at each position take the LONGEST alias that matches a
 * run of whole tokens starting there; write the canonical's tokens and continue AFTER them.
 *
 * Each clause is load-bearing:
 *
 * - **Whole tokens.** Matching is over the token list, never the joined string, so a term
 *   `token` cannot rewrite the inside of `tokenizer`. Substring matching here would be the
 *   lenient-normalization trap the propose/decide lesson was written about, arriving through a
 *   committed table instead of a heuristic.
 * - **Longest first.** With both `session_token` and `token` committed, the three-word phrase
 *   wins at that position, so a more specific entry is never shadowed by a shorter one and the
 *   result does not depend on table order.
 * - **Continue after the tokens just written.** One pass, no re-entry: `a→b` plus `b→c` does
 *   NOT chain to `c`. That makes the table one-hop, the same rule `glossaryIndex` follows, and
 *   it is why {@link atomize} is confluent — there is exactly one output per input, with no
 *   dependence on how many passes a reader imagines.
 */
function substituteTerms(body: string, index: ReadonlyMap<string, readonly string[]>): string {
  if (index.size === 0 || body.length === 0) return body
  const tokens = body.split('_')
  // The longest alias in the table bounds the probe window, so a big table costs no more per
  // position than its widest entry.
  let widest = 1
  for (const key of index.keys()) {
    const width = key.split('_').length
    if (width > widest) widest = width
  }

  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    let hit: readonly string[] | undefined
    let span = 0
    for (let width = Math.min(widest, tokens.length - i); width >= 1; width--) {
      const candidate = index.get(tokens.slice(i, i + width).join('_'))
      if (candidate !== undefined) {
        hit = candidate
        span = width
        break
      }
    }
    if (hit === undefined) {
      out.push(tokens[i] as string)
      i += 1
      continue
    }
    out.push(...hit)
    i += span
  }
  return out.join('_')
}

export function glossaryIndex(
  entries: ReadonlyArray<{ canonical: string; aliases: readonly string[] }>,
): Map<string, string> {
  const index = new Map<string, string>()
  for (const { canonical, aliases } of entries) {
    const canon = normalize(canonical)
    for (const alias of aliases) index.set(normalize(alias), canon)
  }
  return index
}

/**
 * Symbol spellings that carry a slot's entire meaning, mapped to the word phrase the symbol IS by
 * definition. A CLOSED, reviewed table — the same category as {@link COPULA_TOKENS}, not a
 * heuristic, and not extensible by inference.
 *
 * ## The fabrication this prevents
 *
 * Without it, step 4 below DELETES the comparator, because `>` is punctuation. Reproduced on the
 * built CLI before this table existed:
 *
 * ```
 * While the request latency is >= 30 ms, the gateway shall enable the response cache.
 * While the request latency is <  30 ms, the gateway shall disable the response cache.
 *   -> both guards: sys__gateway__pre__request_latency_30_ms
 *   -> both responses: sys__gateway__resp__disable_the_response_cache, opposite polarity
 *   -> error FND_CONTRADICTION, exit 1, `verified: true`
 * ```
 *
 * Two mutually exclusive guards share one atom, so `planContextGroups` puts both requirements in
 * ONE group, and their opposed responses prove a conflict the document does not contain. All eight
 * spellings collapsed the same way, including `≥ ≤ != ==`.
 *
 * ## Why the word forms are the ones they are
 *
 * They are `COMPARATOR_LEXICON`'s spellings (`numeric.ts`), so `>= 30 ms` and `at least 30 ms`
 * land on ONE atom. That merge is sound in the strong sense: the two phrasings assert the same
 * bound, so treating them as one condition asserts nothing the author did not.
 *
 * ## Direction
 *
 * This only ADDS tokens where punctuation was deleted, so the partition it induces is strictly
 * finer except for those deliberate symbol-to-word unifications. It cannot merge two slots that
 * are distinct today — which is the only direction a change to the decide key may move.
 *
 * A committed table cannot desync from a body: `glossaryIndex` keys on `normalize(alias)` and
 * values on `normalize(canonical)`, and `substituteTerms` runs on already-normalized tokens, so
 * both sides pass through this same function.
 */
export const SYMBOL_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  // Multi-character before single-character, and `==` before `=`, or the shorter row wins first
  // and `>=` degrades to `greater than` + a stray `equal to`.
  [/>=|≥/g, ' at least '],
  [/<=|≤/g, ' at most '],
  [/!=|≠/g, ' not equal to '],
  [/==/g, ' equal to '],
  [/>/g, ' greater than '],
  [/</g, ' less than '],
  [/=/g, ' equal to '],
  // SIGN, not arithmetic: only a `+`/`-` that leads a number, so `de-duplicate` and `roll-back`
  // (letter-preceded) and `1-2` (digit-preceded) are untouched. Without the guard, every hyphenated
  // word in the corpus would gain a `minus` token. The Unicode MINUS SIGN (U+2212) is the same
  // sign and spells the same word (spec 007 AC-2-4): deleting it as punctuation read `−5 °C` as
  // `5 °C`. Letters and digits of every script count as the preceding word, so `α-2` stays a
  // hyphenated name.
  [/(?<![\p{L}\p{N}])\+(?=\p{N})/gu, ' plus '],
  [/(?<![\p{L}\p{N}])[-\u2212](?=\p{N})/gu, ' minus '],
]

/**
 * Whether a raw token is a NUMBER, the position after which a token is a unit (AC-2-4). Digits in
 * any script, because `normalize` keeps every script's digits.
 */
const NUMBER_TOKEN = /^\p{N}+$/u

/** A token that OPENS with a number and continues with a unit: `100Mbps`, `5G`. */
const NUMBER_THEN_UNIT = /^(\p{N}+)(.+)$/u

/**
 * Fold one surviving token's case, keeping it where case IS the identity (spec 007 AC-2-4).
 *
 * A unit token is the one place ordinary text carries meaning in case: `Mbps` is megabits and
 * `MBps` megabytes, `mW` a milliwatt and `MW` a megawatt. So a token that directly follows a
 * number keeps its case, as does the unit tail of a token that opens with digits (`100MBps`).
 * Everything else is lowercased as before. The rule can only SPLIT: every pair it keeps apart was
 * one token under full lowercasing, and nothing it produces could have been two tokens before.
 */
function foldCase(token: string, previous: string | undefined): string {
  if (previous !== undefined && NUMBER_TOKEN.test(previous)) return token
  const unit = NUMBER_THEN_UNIT.exec(token)
  if (unit !== null) return `${unit[1] as string}${unit[2] as string}`
  return token.toLowerCase()
}

/**
 * The conservative, near-exact normalization pipeline (AC-4-2a). Pure.
 *
 * Order is normative and load-bearing:
 *   1. strip a single LEADING article (`a`/`an`/`the`, any case) — internal articles
 *      ("issue a session token") are preserved deliberately
 *   2. spell out the {@link SYMBOL_PHRASES} symbols — BEFORE step 3, which would otherwise
 *      delete them
 *   3. strip punctuation: every character that is not a letter, combining mark or digit IN ANY
 *      SCRIPT, and not whitespace, becomes a space; this also normalizes input underscores so
 *      `auth_service` is idempotent
 *   4. split on whitespace and fold each token's case ({@link foldCase}: lowercase, except a
 *      unit token, whose case is its identity)
 *   5. underscore-join the surviving tokens
 *
 * ## What it may delete (spec 007 AC-2-4)
 *
 * Only punctuation that carries no identity. It used to delete everything outside
 * `[a-z0-9\s]` after lowercasing, which is a MERGE rule: `العربية` and `日本語` both normalized to
 * the empty body, `valve α` and `valve β` to one guard, `−5 °C` to `5 °C`, and `100 Mbps` to
 * `100 MBps`. A merged guard puts two requirements into one context group, so two exclusive
 * conditions could prove a contradiction the document does not contain. Keeping more characters
 * only ever refines the partition, so this change cannot merge two bodies that were distinct.
 *
 * No stemming, no lemmatization, no stopword removal beyond the leading article.
 */
export function normalize(text: string): string {
  const deArticled = text.replace(/^(?:a|an|the)\s+/i, '')
  let spelled = deArticled
  for (const [pattern, phrase] of SYMBOL_PHRASES) spelled = spelled.replace(pattern, phrase)
  const tokens = spelled
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return tokens.map((token, i) => foldCase(token, tokens[i - 1])).join('_')
}

/**
 * Normalize a SYSTEM NAME into an atom scope.
 *
 * Two deliberate differences from {@link normalize}, both of which only ever SPLIT namespaces:
 *
 * 1. **No leading-article strip.** `normalize` drops a leading `a`/`an`/`the` because an article
 *    carries no meaning inside a slot phrase. In a system NAME it is part of the identifier:
 *    without this, `A Gateway` and `Gateway` are one system, and two products whose names differ
 *    only by an article share every atom they own.
 * 2. **Never empty.** A name with no letter or digit in any script (`—`, `🚀`) has nothing to
 *    keep. Measured when the keep-set was still `[a-z0-9]`, `ゲートウェイ` and `认证服务` both
 *    vanished and produced one atom for two systems — `grant access` and `revoke access` at
 *    OPPOSITE polarity, a provable contradiction across documents that share nothing.
 *
 * It keeps letters, combining marks and digits in EVERY script, the same keep-set as
 * {@link normalize} (spec 007 AC-2-4): with the ASCII-only set, `α valve controller` and
 * `β valve controller` were one namespace, and so was any pair of names that differed only in
 * their non-Latin part. Unlike `normalize` it folds ALL case — a system name has no unit token.
 *
 * The fallback is a 32-bit FNV-1a over the name's code points, spelled out here rather than taken
 * from `node:crypto`, so the engine tier gains no import and stays byte-reproducible on any host.
 * It is a LAST resort, and a hashed scope is deliberately ugly so it reads as "this name did not
 * survive normalization" in an atom table rather than as a normal identifier.
 */
export function normalizeScope(systemName: string): string {
  const lowered = systemName.toLowerCase()
  const dePunct = lowered.replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
  const scope = dePunct.split(/\s+/).filter(Boolean).join('_')
  if (scope !== '') return scope
  let hash = 0x811c9dc5
  for (const ch of systemName) {
    hash ^= ch.codePointAt(0) ?? 0
    // FNV-1a's 32-bit prime, as shifts so the arithmetic stays in int32 and cannot vary by host.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) | 0
  }
  return `h${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * The copula tokens a GUARD (pre/trig) body drops — exactly one, the first
 * occurrence — so "the session is authenticated" and "the session
 * authenticated" (the state a bridge like "mark the session as authenticated"
 * establishes) atomize identically. This both lets guard-implication bridges
 * (#2) match guards naturally and soundly merges copula/non-copula phrasings of
 * the same real-world condition into one context group.
 */
const COPULA_TOKENS: ReadonlySet<string> = new Set([
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'becomes',
  'remains',
])

/** Strip the FIRST standalone copula token from an underscore-joined guard body. */
function stripCopula(body: string): string {
  const tokens = body.split('_')
  const i = tokens.findIndex((t) => COPULA_TOKENS.has(t))
  if (i === -1) return body
  tokens.splice(i, 1)
  return tokens.join('_')
}

/**
 * Prepositions dropped from an antonym-class response remainder (A4). Fires
 * ONLY after an antonym head hit, and drops exactly ONE token — the first
 * preposition appearing after at least one non-preposition token — so
 * "exclude that tile from the default gallery view" and "include that tile in
 * the default gallery view" share one opposition key and are contraries. Direction within an
 * antonym class is carried by the HEAD (include vs exclude), never by the
 * preposition, which is what makes this sound; verbs outside the antonym
 * table ("move X to A" / "move X from A") are never touched, and differing
 * landing sites ("…gallery A" vs "…gallery B") still produce distinct atoms
 * because only the preposition itself is dropped, never the noun phrase.
 * It applies to the atom BODY as well as the key, so the partition is exactly the
 * pre-AC-2-1 one refined by head: nothing that was two atoms became one.
 */
const REST_PREPOSITIONS: ReadonlySet<string> = new Set([
  'in',
  'into',
  'from',
  'within',
  'inside',
  'to',
  'onto',
  'at',
  'on',
])

/** Drop the first mid-remainder preposition token (antonym-hit responses only). */
function canonicalizeAntonymRest(rest: string): string {
  if (rest === '') return rest
  const tokens = rest.split('_')
  for (let i = 1; i < tokens.length; i++) {
    if (REST_PREPOSITIONS.has(tokens[i] as string)) {
      tokens.splice(i, 1)
      return tokens.join('_')
    }
  }
  return rest
}

/**
 * Turn one EARS slot into a scoped Boolean {@link Atom}. Pure and deterministic.
 *
 * For `resp` slots, the leading verb is checked against the antonym index: on a
 * hit the atom keeps its own de-inflected head and gains an {@link Opposition},
 * which is what makes it a contrary of the class's other-side members. Polarity is
 * the AC-2-4 `negated` flag, unmodified.
 */
export function atomize(args: AtomizeArgs): Atom {
  const scope = normalizeScope(args.systemName)
  let body = normalize(args.text)
  const negated = args.negated ?? false
  let opposition: Opposition | undefined

  // Glossary canonicalization (AC-9-2) runs FIRST, before the antonym lookup,
  // so an agent-confirmed synonym is rewritten to its canonical phrasing and
  // then participates in the same antonym/atom logic as any native phrase.
  // A no-op when no glossary is supplied or the body is not an alias.
  if (args.glossary !== undefined) {
    const canonical = args.glossary.get(body)
    if (canonical !== undefined) body = canonical
  }

  // Term substitution runs AFTER the whole-body glossary lookup and BEFORE the copula strip.
  //
  // After the glossary, because a committed glossary entry is keyed on the AUTHOR'S wording:
  // rewriting terms first would mean every existing entry's key had to be written in
  // canonical-term space, which no author does, so every committed entry would silently stop
  // matching. Before the copula strip, because guard glossary entries are keyed pre-strip too —
  // the two committed tables share one key space, and a term that only matched post-strip
  // bodies would be a third.
  //
  // Applied to EVERY slot kind. A noun is a noun in a trigger and in a response, and a rule
  // that fired per-kind would make one committed entry mean two things.
  if (args.terms !== undefined) {
    body = substituteTerms(body, args.terms)
  }

  // Copula strip applies only to GUARD slots (pre/trig/feat), AFTER the glossary
  // rewrite so committed glossary entries keyed on the natural phrasing keep
  // matching. "the session is authenticated" ⇒ "session_authenticated", the
  // same atom the guard-implication tier derives from a "mark the session as
  // authenticated" bridge — the copula was the byte gap that dropped those
  // bridges as inert (Run 2/3 adversarial escape).
  //
  // AC-2-7: `feat` joins this set. It is derived from the same `preCondition`
  // slot as `pre`, so leaving it un-stripped would keep exactly the divergence
  // this AC removes (the temporal tier's `optional-feature` guard previously kept
  // its copula while every propositional guard dropped one).
  if (GUARD_KINDS.has(args.kind)) {
    body = stripCopula(body)
  }

  // The antonym lookup applies only to responses (spec AC-4-2a: "polar-opposite
  // responses"). The leading verb is de-inflected (closed 3sg rule) and looked
  // up longest-prefix-first — two tokens ("roll_back") before one ("roll") — so
  // multiword opposites like commit/roll-back resolve. On a hit one remainder
  // preposition is dropped (see canonicalizeAntonymRest) and the atom records its
  // class-and-remainder key; the rest of the remainder must still be
  // byte-identical, so "grant access"/"revoke access" are contraries but "grant
  // access"/"revoke permission" are unrelated. Either way the de-inflected head
  // replaces the surface head, so "opens the valve" and "open the valve" collide.
  if (args.kind === 'resp' && body.length > 0) {
    const tokens = body.split('_')
    const tok1 = deInflectHead(tokens[0] as string)
    // Consult the doc-augmented antonym index when supplied (#1), else the
    // code-committed seed table — same lookup shape, so an agent-confirmed pair
    // (open/shut) unifies exactly like a seed pair (grant/revoke).
    const index = args.antonyms ?? ANTONYM_INDEX
    // Longest-prefix probe: try the de-inflected two-token head first (so
    // "rolls back" → "roll_back" matches a multiword class member), then one.
    const twoTok = tokens.length >= 2 ? `${tok1}_${tokens[1] as string}` : undefined
    const twoEntry = twoTok !== undefined ? index.get(twoTok) : undefined
    const entry = twoEntry ?? index.get(tok1)
    const headLen = twoEntry !== undefined ? 2 : 1
    if (entry) {
      const rest = tokens.slice(headLen).join('_')
      const canonRest = canonicalizeAntonymRest(rest)
      // The atom keeps ITS OWN head (de-inflected), so `reject the order` is its own atom rather
      // than `accept the order` at flipped polarity (AC-2-1). The class canonical goes into the
      // opposition KEY only, and polarity is the parse's `negated` and nothing else.
      const head = twoEntry !== undefined ? (twoTok as string) : tok1
      body = canonRest === '' ? head : `${head}_${canonRest}`
      const classBody = canonRest === '' ? entry.canonical : `${entry.canonical}_${canonRest}`
      opposition = {
        key: renderAtom({ scope, kind: 'resp', body: classBody }),
        negative: entry.negated,
      }
    } else if (tok1 !== tokens[0]) {
      tokens[0] = tok1
      body = tokens.join('_')
    }
  }

  const ref: AtomRef = { scope, kind: args.kind, body }
  return {
    name: renderAtom(ref),
    negated,
    ref,
    ...(opposition !== undefined ? { opposition } : {}),
  }
}
