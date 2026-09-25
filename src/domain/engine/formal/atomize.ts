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
 *        strip leading articles (a|an|the) → spell comparison and sign symbols →
 *        strip identity-free punctuation, keep every other symbol as a token →
 *        fold case (not unit tokens) → underscore-join → glossary rewrite →
 *        copula strip (guard slots only) → leading-verb de-inflection +
 *        antonym-class lookup (response slots only; it sets the atom's
 *        {@link Opposition} and nothing else — the head stays the author's verb,
 *        and the polarity stays the parse's).
 *      It MUST NOT stem, lemmatize, or strip stopwords from the REMAINDER of a
 *      slot. The closed, deterministic head/token rules below are the whole
 *      exception surface (each tested):
 *        - the LEADING RESPONSE VERB is de-inflected by a closed third-person
 *          -s rule ({@link deInflectHead}), so "shall opens the valve" and
 *          "shall open the valve" collide on one atom, and an antonym-table verb
 *          spelled as one word is read as the table's multiword spelling of it
 *          ({@link spelling}: "rollback" is "roll back");
 *        - GUARD slots ({@link GUARD_KINDS}: pre/trig/feat) drop a single copula
 *          token ({@link stripCopula}), so "the session is authenticated" and
 *          "the session authenticated" name one guard state;
 *        - when (and only when) the head is in an ANTONYM class, the atom gains an
 *          {@link Opposition} naming the class and the verbs a pair opposes to it,
 *          and the first place preposition, when the head verb governs it, is marked out of a further KEY
 *          ({@link governedReadings}), so "include X in the view" /
 *          "exclude X from the view" share one opposition key and are contraries.
 *          The body is never touched: `approve` and `accept` are two atoms, and so
 *          are "allow calls to X" and "allow calls from X".
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
 *      access" / "revoke access" are two atoms (`grant_access`, `revoke_access`)
 *      plus the axiom `¬(grant_access ∧ revoke_access)` ({@link contraryPairs}),
 *      because grant↔revoke is a seed pair, so "shall grant"
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
  // A scope that is not `_`-joined non-empty tokens (whitespace, a leading or trailing `_`, or a
  // `__`) makes the rendered name ambiguous to parse, and the format is parsed: `catalog.ts` and
  // the atom-corpus gate both split on `__`.
  if (ref.scope === '') throw new Error('renderAtom: empty scope — see normalizeScope')
  if (!/^[^\s_]+(?:_[^\s_]+)*$/u.test(ref.scope)) {
    throw new Error(`renderAtom: scope is not normalized tokens: ${JSON.stringify(ref.scope)}`)
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
   * Present exactly when the response's leading verb — or that of a committed glossary phrase
   * naming the same atom — is in an antonym class (seed or doc-committed): which
   * class-and-remainder the atom belongs to, and which side of it. Two atoms are CONTRARIES when
   * a pair relates them over one key — see {@link contraryPairs}.
   */
  opposition?: Opposition
  /**
   * The ENTRY atom of the glossary entry this response names, present exactly when that entry
   * names two contraries as one action ({@link glossaryEntryAtom}). The encoder links the two,
   * `atom ↔ entry`, under the requirement's own guard.
   */
  entry?: string
}

/**
 * The atom one glossary entry's ACTION renders to, under one system: `sys__<scope>__entry__<the
 * entry's normalized canonical>`. Its own namespace, so it is never a slot's atom.
 *
 * Only an entry that names two CONTRARIES gets one ({@link glossaryGroupContraries}). Such an
 * entry cannot merge its phrases onto one atom — "open the door" + "close the door" would read
 * as a redundancy — so each contrary phrase keeps its own atom, where the contrary axiom relates
 * it. What the entry still says is that every phrase names ONE action, and dropping that lost
 * the conflict in "open the door" + "not shut the door" under open ≡ shut. So each requirement
 * whose response is a phrase of the entry asserts `phrase ↔ entry`, guarded by its own id
 * (`encode`). Two such requirements then share the entry atom exactly as a merge would have
 * shared one atom, and the contrary axiom still relates their phrases.
 *
 * Guarded, not a background axiom: the entry together with the contrary says that neither phrase
 * can ever happen, so as background vocabulary every one requirement using either phrase would
 * be unsatisfiable ON ITS OWN, and a one-requirement core is not a contradiction the solver can
 * report. Under the guard a requirement links only its own phrase, so a conflict still takes two
 * of them. Every link is a consequence of the entry, so nothing the solver proves with it is
 * outside what the document's own vocabulary entails.
 */
export function glossaryEntryAtom(scope: string, canonical: string): string {
  return `sys__${scope}__entry__${canonical}`
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
  /**
   * The class-and-remainder body {@link key} renders from (`close_the_door` for "open the door"
   * under open/close), so a propose tier can compare two keys up to inflection or number without
   * parsing a rendered name — "open the door" and "close the doors" are contraries whose keys
   * differ only in `door`/`doors` (AC-3-6).
   */
  readonly body: string
  /** Which polarity side of the class the head verb sits on (`reject`, `decline` vs `accept`). */
  readonly negative: boolean
  /** The antonym-table verb the head resolved to (`roll_back` for "rolls back the batch"). */
  readonly head: string
  /**
   * The verbs a seeded or committed pair opposes to {@link head} directly
   * ({@link AntonymEntry.opposes}). Sharing a key and sitting on opposite sides is not enough to
   * be contraries: `approve` and `decline` share the accept/reject class and nothing relates
   * them, because no pair does.
   */
  readonly opposes: readonly string[]
  /**
   * The same atom's OTHER readings, when they differ from the reading above: its LITERAL
   * remainder when the fields above read a governed one (see `governedReadings`), and the
   * opposition of every committed glossary phrase that names it (spec 007 I-1).
   *
   * A glossary entry says two phrases are one action, so a contrary of either is a contrary of
   * the atom. The fields above read the CANONICAL phrase, which is what the propose tiers compare
   * on; the axioms ({@link contraryPairs}) read every reading. Without this, aliasing one side of
   * a proven pair ("open the door" → "open the hatch" beside "close the door") moved that side off
   * the key it shared with the other and turned FND_CONTRADICTION into `verified: true` — a
   * strengthening move removing a finding.
   */
  readonly via?: readonly OppositionReading[]
}

/** One reading of an atom in an antonym class: {@link Opposition} without its other readings. */
export type OppositionReading = Omit<Opposition, 'via'>

/** Every reading of an opposition: its first, then the others ({@link Opposition.via}). */
const readingsOf = (o: Opposition): readonly OppositionReading[] =>
  o.via === undefined ? [o] : [o, ...o.via]

/** Whether two single readings are contraries: one key, opposite sides, a pair joining the heads. */
function readingsOpposed(a: OppositionReading, b: OppositionReading): boolean {
  return a.key === b.key && a.negative !== b.negative && a.opposes.includes(b.head)
}

/**
 * Whether two oppositions relate their atoms by a contrary axiom (spec 007 AC-2-1): some reading
 * of each shares one class-and-remainder key with the other, on opposite sides, with a seeded or
 * committed pair joining the two heads. The table relates exactly its pairs — two contraries of
 * one verb are not thereby synonyms, and a verb two pairs away is not thereby opposed.
 */
function opposed(a: Opposition, b: Opposition): boolean {
  return readingsOf(a).some((x) => readingsOf(b).some((y) => readingsOpposed(x, y)))
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
  /** The glossary ENTRY atom a response links to, when it has one (see {@link Atom.entry}). */
  entry?: string
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
      ...(a.entry !== undefined ? { entry: a.entry } : {}),
    }
  }
}

/**
 * Whether two atoms are contraries (spec 007 AC-2-1): distinct atoms whose oppositions are
 * {@link opposed}. For the PROPOSE tiers, which used to skip such a pair because the rename gave
 * both one atom name; now the names differ, and without this they would propose `accept X` and
 * `reject X` as synonyms to merge.
 */
export function areContrary(
  a: { readonly name: string; readonly opposition?: Opposition },
  b: { readonly name: string; readonly opposition?: Opposition },
): boolean {
  return (
    a.name !== b.name &&
    a.opposition !== undefined &&
    b.opposition !== undefined &&
    opposed(a.opposition, b.opposition)
  )
}

/**
 * The contrary pairs among a set of atoms (spec 007 AC-2-1): every two DISTINCT atoms whose
 * oppositions are {@link opposed} — one key, opposite sides, a pair joining the heads. Each pair
 * `[a, b]` is the axiom `¬(a ∧ b)`, which every solver-driving tier asserts as a plain
 * (unguarded) background fact — it is part of the vocabulary, not of any requirement, so it never
 * appears in an unsat core.
 *
 * Two members of one side (`accept`, `approve`) get no axiom and no shared atom: they are two
 * actions a third one opposes, which is not a statement that they are one action. Every reading
 * of an atom counts ({@link Opposition.via}), so a glossary alias keeps its phrase's contraries.
 *
 * Pure; the output is sorted and deduplicated, so it is a function of the atom SET.
 */
export function contraryPairs(
  lits: Iterable<{ readonly atom: string; readonly opposition?: Opposition }>,
): Array<readonly [string, string]> {
  const byKey = new Map<string, { atom: string; reading: OppositionReading }[]>()
  for (const lit of lits) {
    if (lit.opposition === undefined) continue
    for (const reading of readingsOf(lit.opposition)) {
      const member = { atom: lit.atom, reading }
      const members = byKey.get(reading.key)
      if (members === undefined) byKey.set(reading.key, [member])
      else members.push(member)
    }
  }
  const pairs = new Map<string, readonly [string, string]>()
  for (const members of byKey.values()) {
    for (const { atom: p, reading: pr } of members) {
      for (const { atom: n, reading: nr } of members) {
        if (p === n || !readingsOpposed(pr, nr)) continue
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
  // `5 °C`. So is every dash that leads a number — HYPHEN through HORIZONTAL BAR (U+2010–U+2015),
  // SMALL HYPHEN-MINUS (U+FE63) and FULLWIDTH HYPHEN-MINUS (U+FF0D) — because a word processor
  // substitutes an en dash for a typed leading minus and a CJK input method types the fullwidth
  // one; deleted as `\p{Pd}`, `–20 °C` and `20 °C` were one guard. Letters and digits of every
  // script count as the preceding word, so `α-2` stays a hyphenated name and `10–20` a range.
  [/(?<![\p{L}\p{N}])\+(?=\p{N})/gu, ' plus '],
  [/(?<![\p{L}\p{N}])[-\u2010-\u2015\u2212\uFE63\uFF0D](?=\p{N})/gu, ' minus '],
]

/**
 * The punctuation {@link normalize} deletes: the characters that carry no identity (spec 007
 * AC-2-4). Each becomes a token boundary. The set is closed:
 *   - connectors, dashes, brackets and quotes (`\p{Pc}` `\p{Pd}` `\p{Ps}` `\p{Pe}` `\p{Pi}`
 *     `\p{Pf}`, `\p{Quotation_Mark}`), so `response-cache`, `(warm)` and `"x"` keep only words;
 *   - sentence and clause punctuation in every script (`\p{Terminal_Punctuation}`: `. , ; : ! ?`,
 *     `。`, `،`, `।` and the rest);
 *   - separators and emphasis that join or decorate words and name nothing: `/ \ | * \` ´ … ‥ • ‣ ⁃ ¡ ¿`
 *     (`input/output` is two words, `**bold**` is one). `|` and `\` also cannot appear inside a
 *     quoted SMT-LIB symbol, and atom names are Z3 symbols;
 *   - control and format characters (`\p{Cc}` `\p{Cf}`) and variation selectors, which change how
 *     a character is drawn, not which character it is.
 * Every other character outside letters, marks and digits is kept ({@link IDENTITY_SYMBOL}).
 */
const IDENTITY_FREE =
  /[\s\p{Pc}\p{Pd}\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Quotation_Mark}\p{Terminal_Punctuation}\p{Cc}\p{Cf}\p{Variation_Selector}/\\|*`´…‥•‣⁃¡¿]+/gu

/**
 * A character {@link normalize} KEEPS although it is neither a letter, a mark nor a digit: a
 * symbol with identity, with any combining marks that follow it. Currency (`$` vs `€`), the `#`
 * and `+` of `C#` and `C++`, `%` and `‰`, `°`, `&`, `@`, `§`, primes, and every emoji are
 * different things. Deleting them merged `the invoice currency is $` with `… €` into one guard, and
 * two exclusive conditions then proved a contradiction the document does not contain. Each one
 * becomes its OWN token, so `$5` and `$ 5`, or `50%` and `50 %`, stay one phrase.
 */
const IDENTITY_SYMBOL = /[^\p{L}\p{M}\p{N}\s]\p{M}*/gu

/** Delete {@link IDENTITY_FREE} punctuation and split every {@link IDENTITY_SYMBOL} into its own token. */
function tokenize(text: string): string[] {
  return text
    .replace(IDENTITY_FREE, ' ')
    .replace(IDENTITY_SYMBOL, (symbol) => ` ${symbol} `)
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Whether a raw token is a NUMBER, the position after which a token is a unit (AC-2-4). Digits in
 * any script, because `normalize` keeps every script's digits.
 */
const NUMBER_TOKEN = /^\p{N}+$/u

/**
 * A token a unit may follow: a {@link NUMBER_TOKEN}, or the degree sign that {@link tokenize} splits
 * off `5 °C`, so the `C` after it is read as a unit exactly as it was when `°` was deleted.
 */
const UNIT_POSITION = new RegExp(`${NUMBER_TOKEN.source}|^°$`, 'u')

/** A token that OPENS with a number and continues with a unit: `100Mbps`, `5G`. */
const NUMBER_THEN_UNIT = /^(\p{N}+)(.+)$/u

/**
 * A UNIT token, the closed grammar whose case is kept (spec 007 AC-2-4): an optional SI or binary
 * prefix, then an optional base symbol, then an optional `ps` rate suffix, and at least one of the
 * first two. Matched case-SENSITIVELY. That is the point: `mW` (milliwatt) and `MW` (megawatt)
 * both match, and each keeps its own spelling. `Times`, `Seconds` and `Drains` match nothing, so
 * they fold like any other word. A bare prefix letter counts too (`5 G`, `5 M`, `3 K`), because a
 * single letter after a number is a unit or a scale, not a word.
 */
const UNIT_TOKEN = new RegExp(
  '^(?=.)' +
    '(?:da|[KMGTPEZY]i|[qryzafpnµμumcdhkKMGTPEZYRQ])?' +
    '(?:bit|Bit|Byte|b|B|Hz|Wh|W|VA|var|V|Ah|A|Ω|ohm|eV|J|Pa|bar|N|mol|cd|lm|lx|Bq|Gy|Sv|Wb|' +
    'rad|sr|rpm|dBm|dBA|dB|K|C|F|H|S|T|g|m|s|t|l|L)?' +
    '(?:ps)?$',
  'u',
)

/** Whether `token` is a unit in the {@link UNIT_TOKEN} grammar and not the bare rate suffix. */
function isUnitToken(token: string): boolean {
  return token !== 'ps' && UNIT_TOKEN.test(token)
}

/**
 * Fold one surviving token's case, keeping it where case IS the identity (spec 007 AC-2-4).
 *
 * A unit token is the one place ordinary text carries meaning in case: `Mbps` is megabits and
 * `MBps` megabytes, `mW` a milliwatt and `MW` a megawatt. So a {@link UNIT_TOKEN} that directly
 * follows a number keeps its case, as does a unit tail of a token that opens with digits
 * (`100MBps`). Every other token is lowercased, including an ordinary word after a number:
 * `3 Times` and `3 times` are one phrase, and keeping them apart hid a real contradiction. The
 * rule can only SPLIT relative to full lowercasing, and only over unit spellings.
 */
function foldCase(token: string, previous: string | undefined): string {
  if (previous !== undefined && UNIT_POSITION.test(previous) && isUnitToken(token)) return token
  const unit = NUMBER_THEN_UNIT.exec(token)
  if (unit !== null && isUnitToken(unit[2] as string)) return token
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
 *   3. {@link tokenize}: {@link IDENTITY_FREE} punctuation becomes a space, which also normalizes
 *      input underscores so `auth_service` is idempotent; every other character that is not a
 *      letter, combining mark or digit IN ANY SCRIPT is an {@link IDENTITY_SYMBOL} and becomes its
 *      own token
 *   4. split on whitespace and fold each token's case ({@link foldCase}: lowercase, except a
 *      {@link UNIT_TOKEN} after a number, whose case is its identity)
 *   5. underscore-join the surviving tokens
 *
 * ## What it may delete (spec 007 AC-2-4)
 *
 * Only punctuation that carries no identity. It used to delete everything outside
 * `[a-z0-9\s]` after lowercasing, which is a MERGE rule: `العربية` and `日本語` both normalized to
 * the empty body, `valve α` and `valve β` to one guard, `−5 °C` to `5 °C`, and `100 Mbps` to
 * `100 MBps`. A merged guard puts two requirements into one context group, so two exclusive
 * conditions could prove a contradiction the document does not contain. The same held for every
 * symbol: `$` and `€`, `C#` and `C++`, `🔴` and `🟢`, `50%` and `50`. Keeping a symbol as its own
 * token only refines that partition. The one exception is a variation selector, which changes how
 * a character is drawn and not which character it is.
 *
 * No stemming, no lemmatization, no stopword removal beyond the leading article.
 */
export function normalize(text: string): string {
  const deArticled = text.replace(/^(?:a|an|the)\s+/i, '')
  let spelled = deArticled
  for (const [pattern, phrase] of SYMBOL_PHRASES) spelled = spelled.replace(pattern, phrase)
  const tokens = tokenize(spelled)
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
 * 2. **Never empty.** A name made only of identity-free punctuation (`—`, `( … )`) has nothing
 *    to keep. Measured when the keep-set was still `[a-z0-9]`, `ゲートウェイ` and `认证服务` both
 *    vanished and produced one atom for two systems — `grant access` and `revoke access` at
 *    OPPOSITE polarity, a provable contradiction across documents that share nothing.
 *
 * It keeps letters, combining marks and digits in EVERY script, and every identity-bearing
 * symbol, through the same {@link tokenize} as {@link normalize} (spec 007 AC-2-4): with the
 * ASCII-only set, `α valve controller` and `β valve controller` were one namespace, and so were
 * `C# compiler` and `C++ compiler`. Unlike `normalize` it folds ALL case — a system name has no unit token.
 *
 * The fallback is a 32-bit FNV-1a over the name's code points, spelled out here rather than taken
 * from `node:crypto`, so the engine tier gains no import and stays byte-reproducible on any host.
 * It is a LAST resort, and a hashed scope is deliberately ugly so it reads as "this name did not
 * survive normalization" in an atom table rather than as a normal identifier.
 */
export function normalizeScope(systemName: string): string {
  const scope = tokenize(systemName.toLowerCase()).join('_')
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
 * The prepositions the antonym-remainder rule once dropped after ANY antonym head, the first of
 * them wherever it fell (669c0e9). A governed key still marks at most that one position: the FIRST
 * of these, or of the head's own governed prepositions, after the remainder's first token. So no
 * governed key relates two remainders the old rule kept apart, and a preposition that modifies a
 * noun further on ("add the filter on messages TO the admin" / "remove the filter on messages FROM
 * the admin": outbound and inbound messages) is never read as the verb's own place.
 */
const PLACE_PREPOSITIONS: ReadonlySet<string> = new Set([
  'at',
  'from',
  'in',
  'inside',
  'into',
  'on',
  'onto',
  'to',
  'within',
])

/**
 * The GOVERNED opposition-key remainders of an antonym-class response (A4). The remainder's
 * first place preposition ({@link PLACE_PREPOSITIONS}, or one the head governs) after its first
 * token is the verb's own place when the head ITSELF governs it ({@link AntonymEntry.governs}),
 * and then the key replaces it with the mark of that place — an empty token for the place, two
 * for the outside ({@link AntonymEntry.outside}). So "hide the alarm from the display" and "show
 * the alarm to the display" both read `the_alarm__the_display` and are contraries: for those verbs
 * the HEAD carries the direction (show vs hide) and the preposition only introduces the place.
 * When that first preposition is one the head does not govern (a locative — `at`, `in`, `inside`,
 * `on`, `within` — which no verb governs, among them), the remainder has no governed key: the
 * preposition after it modifies something else, or names a time rather than a place.
 *
 * Marked, not dropped, and per verb. The mark keeps the position, and `normalize` never emits an
 * empty token, so a governed key can meet only another governed key with the same mark in the
 * same place — never a literal remainder that happens to lack the word, and never the other
 * place's mark. Per verb, because a preposition only the CONTRARY governs carries direction after
 * this verb: "connect calls FROM the number" and "disconnect calls TO the number" are consistent,
 * and a class-wide set made them one key. Every response also keeps its LITERAL remainder as a key
 * ({@link antonymReading}), so identical remainders are contraries whatever their prepositions.
 *
 * No other key. Whether a remainder LEFT OUT a locative ("stop the pump on Monday" / "start the
 * pump Monday"), or moved its preposition a word ("grant access to only admins" / "revoke access
 * only from admins"), is a grammar guess no table row states, and a guess may not create a proof
 * (spec 007 demote-not-prove C1): those pairs are the opposition-candidate tier's, which demotes
 * on every two remainders equal once their prepositions are removed (semantic.ts
 * `prepositionVariant`).
 *
 * Only in the key. "allow calls to the number" and "allow calls from the number" are different
 * acts, and the rule that dropped the first of `in into from within inside to onto at on` for
 * every antonym head — from the atom BODY as well — made them one atom, so the pair was an
 * error-severity FND_CONTRADICTION. Differing landing sites ("…gallery A" vs "…gallery B") still
 * produce distinct keys, because only the preposition is marked, never the noun phrase; and the
 * atom body keeps every token, so no two remainders that differ in a word share an atom.
 */
function governedReadings(rest: string, entry: AntonymEntry): readonly string[] {
  if (rest === '' || entry.governs.length === 0) return []
  const tokens = rest.split('_')
  const i = tokens.findIndex(
    (t, at) => at > 0 && (PLACE_PREPOSITIONS.has(t) || entry.governs.includes(t)),
  )
  if (i === -1) return []
  const token = tokens[i] as string
  if (!entry.governs.includes(token)) return []
  const outside = entry.outside.includes(token)
  const marked = [...tokens]
  // `_` joins to `a___b`: two empty tokens, which neither `normalize` nor the place mark emits.
  marked[i] = outside ? '_' : ''
  return [marked.join('_')]
}

/**
 * One verb spelled two ways is one verb: a one-token head the table also lists as a multiword
 * member once its underscores are removed (`rollback` / `roll_back`) is read as the multiword
 * spelling, and opposes what either spelling does. Orthography, closed and deterministic like
 * the 3sg rule — NOT a synonymy read off the table, which relates the two spellings only by
 * listing both against `commit`. Only within one class and one side, so no doc pair that put
 * the spellings on opposite sides is ever collapsed; otherwise the head stays as written.
 */
function spelling(
  head: string,
  entry: AntonymEntry,
  index: ReadonlyMap<string, AntonymEntry>,
): readonly [string, readonly string[]] {
  if (head.includes('_')) return [head, entry.opposes]
  for (const [member, other] of index) {
    if (!member.includes('_') || member.replace(/_/g, '') !== head) continue
    if (other.canonical !== entry.canonical || other.negated !== entry.negated) continue
    return [member, [...new Set([...entry.opposes, ...other.opposes])].sort()]
  }
  return [head, entry.opposes]
}

/**
 * The response-head reading of a normalized body: the leading verb de-inflected (closed 3sg
 * rule) and looked up longest-prefix-first — two tokens ("roll_back") before one ("roll") — so
 * multiword opposites like commit/roll-back resolve. On a hit the result carries its
 * class-and-remainder readings: the GOVERNED ones first when the head governs a preposition in the
 * remainder (see {@link governedReadings}), then the LITERAL one. Each must match another reading
 * byte for byte, so "grant access"/"revoke access" are contraries but "grant access"/"revoke
 * permission" are unrelated. Either way the de-inflected head replaces the surface head, so
 * "opens the valve" and "open the valve" collide.
 */
function antonymReading(
  body: string,
  scope: string,
  index: ReadonlyMap<string, AntonymEntry>,
): { body: string; readings: readonly OppositionReading[] } {
  if (body.length === 0) return { body, readings: [] }
  const tokens = body.split('_')
  const tok1 = deInflectHead(tokens[0] as string)
  const twoTok = tokens.length >= 2 ? `${tok1}_${tokens[1] as string}` : undefined
  const twoEntry = twoTok !== undefined ? index.get(twoTok) : undefined
  const entry = twoEntry ?? index.get(tok1)
  if (entry === undefined) {
    if (tok1 === tokens[0]) return { body, readings: [] }
    tokens[0] = tok1
    return { body: tokens.join('_'), readings: [] }
  }
  const [head, opposes] = spelling(twoEntry !== undefined ? (twoTok as string) : tok1, entry, index)
  const rest = tokens.slice(twoEntry !== undefined ? 2 : 1).join('_')
  // The atom's head is the author's own verb, so `reject the order` is its own atom rather
  // than `accept the order` at flipped polarity, and `approve the order` is its own atom
  // rather than `accept the order` (AC-2-1: the table relates pairs by a contrary axiom and
  // asserts no synonymy). The class canonical and the governed-preposition mark go into the
  // opposition KEY only, and polarity is the parse's `negated` and nothing else.
  const reading = (keyRest: string): OppositionReading => {
    const classBody = keyRest === '' ? entry.canonical : `${entry.canonical}_${keyRest}`
    return {
      key: renderAtom({ scope, kind: 'resp', body: classBody }),
      body: classBody,
      negative: entry.negated,
      head,
      opposes,
    }
  }
  return {
    body: rest === '' ? head : `${head}_${rest}`,
    readings: [...governedReadings(rest, entry).map(reading), reading(rest)],
  }
}

const NO_PHRASES: ReadonlySet<string> = new Set()

/**
 * The CONTRARY pairs among the phrases one glossary entry names — its canonical and every alias
 * mapped to it, all normalized — sorted, each pair sorted: two phrases some reading of which a
 * seeded or committed antonym pair relates over one key, read through the same terms step as a
 * slot body. Empty for an entry that names no two contraries, which is every entry an author
 * means.
 *
 * An entry says its phrases are ONE action; the antonym table says two of them cannot both
 * happen. Together they say neither ever happens — which no requirement is checked against —
 * and merging the two onto one atom read "open the door" + "close the door" as a redundancy,
 * turning FND_CONTRADICTION into `verified: true`. So {@link atomize} keeps each contrary phrase
 * on its own atom, where the contrary axiom still relates it, links every phrase of the entry to
 * the entry's action ({@link glossaryEntryAtom}) so the equivalence is not lost either, and
 * `check` demotes over the consequence it does not decide (`contrary-glossary-alias`). One scope stands in for every
 * system: the phrases of one entry are always read under one system, and a key's scope never
 * decides whether two of its readings are opposed.
 */
function glossaryGroupContraries(
  canonical: string,
  glossary: ReadonlyMap<string, string>,
  index: ReadonlyMap<string, AntonymEntry>,
  terms: ReadonlyMap<string, readonly string[]> | undefined,
): Array<readonly [string, string]> {
  const phrases = [canonical]
  for (const [alias, target] of glossary) {
    if (target === canonical && alias !== canonical) phrases.push(alias)
  }
  if (phrases.length < 2) return []
  const readings = phrases.map(
    (p) =>
      antonymReading(terms !== undefined ? substituteTerms(p, terms) : p, 'glossary', index)
        .readings,
  )
  const pairs: Array<readonly [string, string]> = []
  for (let i = 0; i < phrases.length; i++) {
    for (let j = i + 1; j < phrases.length; j++) {
      const [ri, rj] = [readings[i] ?? [], readings[j] ?? []]
      if (!ri.some((x) => rj.some((y) => readingsOpposed(x, y)))) continue
      const [p, q] = [phrases[i] as string, phrases[j] as string]
      pairs.push(p < q ? [p, q] : [q, p])
    }
  }
  return pairs.sort(([a, b], [c, d]) => (a !== c ? (a < c ? -1 : 1) : b < d ? -1 : b > d ? 1 : 0))
}

/** Every phrase that appears in one of the pairs. */
const contraryPhrases = (pairs: ReadonlyArray<readonly [string, string]>): ReadonlySet<string> =>
  pairs.length === 0 ? NO_PHRASES : new Set(pairs.flat())

/** One glossary entry that names two contraries as one action ({@link glossaryContraries}). */
export interface ContraryGlossaryEntry {
  /** The entry's normalized canonical. */
  readonly canonical: string
  /** Every normalized phrase the entry names: the canonical, then its aliases. */
  readonly phrases: readonly string[]
  /** The contrary pairs among {@link phrases}, sorted. */
  readonly contraries: ReadonlyArray<readonly [string, string]>
}

/**
 * Every committed glossary entry that names two CONTRARIES as one action (see
 * `glossaryGroupContraries`), sorted by canonical — the entries whose contrary aliases
 * {@link atomize} keeps on their own atoms. `check` demotes over each one a requirement uses,
 * and the `glossary` op refuses to create one.
 */
export function glossaryContraries(
  glossary: ReadonlyMap<string, string>,
  antonyms: ReadonlyMap<string, AntonymEntry> = ANTONYM_INDEX,
  terms?: ReadonlyMap<string, readonly string[]>,
): ContraryGlossaryEntry[] {
  const out: ContraryGlossaryEntry[] = []
  for (const canonical of [...new Set(glossary.values())].sort()) {
    const contraries = glossaryGroupContraries(canonical, glossary, antonyms, terms)
    if (contraries.length === 0) continue
    const aliases = [...glossary].filter(([a, c]) => c === canonical && a !== canonical)
    out.push({ canonical, phrases: [canonical, ...aliases.map(([a]) => a)], contraries })
  }
  return out
}

/**
 * Turn one EARS slot into a scoped Boolean {@link Atom}. Pure and deterministic.
 *
 * For `resp` slots, the leading verb is checked against the antonym index: on a
 * hit the atom gains an {@link Opposition}, which is what makes it a contrary of an atom led by a
 * verb a pair opposes to it. The head is the author's (de-inflected) verb, never a class member
 * standing in for it. Polarity is the AC-2-4 `negated` flag, unmodified.
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
  //
  // Except, for a RESPONSE, an alias that is a contrary of another phrase its entry names
  // ({@link glossaryGroupContraries}): it keeps its own atom, so the contrary axiom still relates
  // the two. Merging them read "open the door" + "close the door" as a redundancy. What the entry
  // still says — every phrase names one action — is carried by the ENTRY atom the response links
  // to ({@link glossaryEntryAtom}).
  const index = args.antonyms ?? ANTONYM_INDEX
  // The entry this slot's phrase belongs to: the canonical it is an alias of, or itself when it
  // is one. Only a response reads it; a guard is never an antonym and always merges.
  const entryOf = (phrase: string): string | undefined => {
    if (args.kind !== 'resp' || args.glossary === undefined) return undefined
    const canonical = args.glossary.get(phrase)
    if (canonical !== undefined) return canonical
    for (const value of args.glossary.values()) if (value === phrase) return phrase
    return undefined
  }
  const entryCanonical = entryOf(body)
  const contrary =
    entryCanonical !== undefined && args.glossary !== undefined
      ? contraryPhrases(glossaryGroupContraries(entryCanonical, args.glossary, index, args.terms))
      : NO_PHRASES
  if (args.glossary !== undefined) {
    const canonical = args.glossary.get(body)
    if (canonical !== undefined && !contrary.has(body)) body = canonical
  }
  // The committed phrase this slot names, before terms: the key every alias of it maps to.
  const named = body
  const entry =
    entryCanonical !== undefined && contrary.size > 0
      ? glossaryEntryAtom(scope, entryCanonical)
      : undefined

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
  // responses"); see antonymReading for the head rule and the key it records.
  if (args.kind === 'resp' && body.length > 0) {
    // `index` is the doc-augmented antonym index when supplied (#1), else the
    // code-committed seed table — same lookup shape, so an agent-confirmed pair
    // (open/shut) unifies exactly like a seed pair (grant/revoke).
    const own = antonymReading(body, scope, index)
    body = own.body
    // Every OTHER committed phrase of this atom's entry is the same action, so its contraries are
    // this atom's too (spec 007 I-1): each alias of the canonical this atom names, and — for a
    // contrary alias on its own atom — the canonical and the entry's other aliases. A pair the
    // entry itself holds lands on one atom's own readings and relates nothing (contraryPairs
    // skips an atom against itself), which is why the ENTRY link carries it, not these.
    const via: OppositionReading[] = []
    const same = (a: OppositionReading, b: OppositionReading) =>
      a.key === b.key && a.head === b.head && a.negative === b.negative
    if (args.glossary !== undefined && entryCanonical !== undefined) {
      const phrases = [entryCanonical]
      for (const [alias, canonical] of args.glossary) {
        if (canonical === entryCanonical && alias !== entryCanonical) phrases.push(alias)
      }
      for (const phrase of phrases) {
        if (phrase === named) continue
        // The phrase's own readings, through the same terms step this body went through.
        const phraseBody = args.terms !== undefined ? substituteTerms(phrase, args.terms) : phrase
        for (const reading of antonymReading(phraseBody, scope, index).readings) {
          if (own.readings.some((r) => same(r, reading)) || via.some((r) => same(r, reading))) {
            continue
          }
          via.push(reading)
        }
      }
      via.sort((x, y) =>
        x.key < y.key ? -1 : x.key > y.key ? 1 : x.head < y.head ? -1 : x.head > y.head ? 1 : 0,
      )
    }
    // The canonical's own readings lead — its first one is what the propose tiers compare on;
    // when the canonical is outside every class, the first alias reading stands in.
    const [first, ...others] = [...own.readings, ...via]
    if (first !== undefined) opposition = others.length > 0 ? { ...first, via: others } : first
  }

  const ref: AtomRef = { scope, kind: args.kind, body }
  return {
    name: renderAtom(ref),
    negated,
    ref,
    ...(opposition !== undefined ? { opposition } : {}),
    ...(entry !== undefined ? { entry } : {}),
  }
}
