/**
 * Semantic paraphrase finder (AC-9-5) — the bridge from embeddings (PROPOSE) to
 * the committed glossary (DECIDE).
 *
 * For each pair of requirements under the SAME system whose response atoms did
 * NOT already unify (via atomize + antonym table + glossary), it embeds the two
 * response phrasings and, when their cosine similarity is ≥ threshold, emits an
 * info-tier `FND_SIMILAR_SEMANTIC` finding suggesting a concrete
 * `symspec glossary add` merge. It NEVER emits a conflict verdict — its only
 * durable effect is a suggestion the calling agent may confirm into the
 * glossary, after which the deterministic SMT tier can prove any real conflict
 * the shared atom exposes.
 *
 * Scope discipline (mirrors similar.ts): only responses under the same
 * `systemName` are compared — two systems with the same wording are genuinely
 * distinct atoms (AC-4-2a per-system scoping), so bridging across systems would
 * be unsound. Pairs already unified by atomize are skipped (nothing to bridge).
 */

import { shellQuoted, shellWord } from '../core/shell-word.ts'
import { ANTONYM_INDEX, type AntonymEntry } from './antonyms.ts'
import {
  type Atomize,
  areContrary,
  atomize,
  deInflectHead,
  makeAtomize,
  normalize,
  normalizeScope,
  type Opposition,
} from './atomize.ts'
import type { Embedder } from './embed.ts'

/** An info-severity semantic-similarity finding (Appendix B `FND_SIMILAR_SEMANTIC`). */
export interface SimilarSemanticFinding {
  readonly code: 'FND_SIMILAR_SEMANTIC'
  readonly severity: 'info'
  /** Both requirement ids, lexicographically ordered for stability. */
  readonly requirementIds: [string, string]
  /** The cosine similarity that triggered the finding, rounded to 3 dp. */
  readonly cosine: number
  /**
   * AC-3-6: the two responses are the same words up to inflection or number
   * ({@link differsOnlyByInflection}), compared in opposition-key space, and would conflict if
   * those words named one thing ({@link wouldConflict}): one atom at OPPOSITE polarity ("open the
   * door" vs "shall not open the doors"), or both asserted on OPPOSITE sides of one antonym class
   * ("open the door" vs "close the doors", contraries under AC-2-1). The solver cannot see it
   * (two atoms, or two keys), so the pipeline DEMOTES on it until the pair is aliased (the
   * {@link merge}, which lands both on one atom or on one key), rewritten, or declared distinct
   * (a waiver of this finding). A demotion, never a verdict: the fold below never reaches an atom.
   */
  readonly oppositePolarityVariant: boolean
  /**
   * The glossary merge the message proposes, or undefined when it withholds one. Chosen by
   * {@link suggestMerge}: never a merge that aliases a phrase to a contrary of itself or splits an
   * atom the document already shares, so for an {@link oppositePolarityVariant} pair a merge,
   * when present, lands the two on ONE atom at opposite polarity or on the two sides of ONE
   * opposition key, where the solver compares them.
   */
  readonly merge: GlossaryMerge | undefined
  readonly message: string
}

/** A `symspec glossary <canonical> <alias>` proposal: `alias` is rewritten to `canonical`. */
export interface GlossaryMerge {
  readonly canonical: string
  readonly alias: string
}

/** A requirement projection this module needs: id, system, response, polarity. */
export interface SemanticRequirement {
  readonly id: string
  readonly systemName: string
  readonly systemResponse: string
  readonly negated?: boolean
  /**
   * Optional trigger clause. When two high-cosine responses fire under the SAME
   * system AND the SAME trigger, the pair is a candidate for opposition (polar
   * opposites), not just synonymy — so `findSimilarSemantic` extends its message
   * to ALSO point at `antonym add` in that case. Callers pass the stored trigger
   * (a `ReqView` already carries it); omitted ⇒ the antonym hint is not added.
   * Declared `string | undefined` (not merely optional) so a `ReqView` — whose
   * `trigger` is `string | undefined` — is assignable under
   * `exactOptionalPropertyTypes`.
   */
  readonly trigger?: string | undefined
}

/** Options for {@link findSimilarSemantic}. */
export interface FindSimilarSemanticOptions {
  /**
   * Cosine threshold to fire a finding (default {@link DEFAULT_SEMANTIC_THRESHOLD},
   * overridable via `--semantic-threshold`).
   */
  threshold?: number
  /** Glossary index (AC-9-2): pairs that already unify through it are skipped. */
  glossary?: ReadonlyMap<string, string>
  /**
   * The document's own atomizer — the SAME closure the solver tiers get, so the committed
   * glossary, antonym table and terms all apply. Supersedes {@link glossary} when given.
   * Without it the finder atomizes against the glossary and the SEED antonym table only,
   * which misses a doc-committed opposite (open/shut): the pair reads at the wrong
   * polarity, and a pair the solver already unified is proposed as a merge.
   */
  atomize?: Atomize
  /**
   * The caller's whole-document check on a candidate merge: true when committing `merge` puts
   * the two requirements of `pair` on one response atom, or on the two sides of one opposition
   * key (contraries, spec 007 AC-2-1), AND leaves every relation the document already has intact
   * (no two slots that share an atom today end up on different atoms or at a different relative
   * polarity, and no two responses that share an opposition key today end up on different keys
   * or sides). Lookup is one hop, so aliasing a phrase that the committed glossary, a term or an
   * inflection already routes another phrase onto moves that phrase alone, and a conflict the
   * shared atom or key carried disappears.
   * Only the caller holds every slot of every requirement, so only the caller can answer.
   * Omitted: a candidate is checked against the pair alone.
   */
  admitsMerge?: (merge: GlossaryMerge, pair: readonly [string, string]) => boolean
}

/**
 * Default cosine similarity above which a same-system, un-unified response pair
 * is proposed as a glossary merge (`FND_SIMILAR_SEMANTIC`).
 *
 * ## What the number measures
 *
 * A cosine over CLS-pooled, L2-normalized `Xenova/bge-base-en-v1.5` embeddings
 * (see {@link Embedder} / `embed.ts`). The pair's raw response phrasings are
 * embedded with NO instruction prefix — BGE was trained with a retrieval query
 * prefix ("Represent this sentence for searching relevant passages:"), so
 * symmetric raw-text pairs score MORE COMPRESSED than the numbers quoted from
 * BGE retrieval benchmarks. Do not calibrate this threshold against those
 * benchmark figures; calibrate it against the real same-model, same-pooling,
 * no-prefix band below.
 *
 * ## Measured separation band (this model + CLS pooling + no prefix)
 *
 * Measured over generic requirement-response pairs with the repo's own embedder
 * (`loadEmbedder`), cosines cluster into two clearly separated bands:
 *   - Unrelated same-domain pairs (different intent): ~0.44–0.58 — the noise
 *     floor.
 *   - Divergent-wording paraphrases (same intent, different head nouns/verbs):
 *     ~0.75–0.79, e.g. "issue a session token" vs "issue a login credential"
 *     ≈ 0.75, "reject the connection" vs "deny the request" ≈ 0.77.
 *   - Near-identical paraphrases: ~0.87–0.89.
 *
 * The old default of 0.82 sat ABOVE the divergent-paraphrase band, so every
 * genuine same-intent pair with different word choice was silently missed and
 * only near-verbatim restatements ever fired.
 *
 * ## Why 0.72
 *
 * 0.72 sits below the divergent-paraphrase band (capturing the ~0.75 pairs, with
 * a little headroom for slight wording variants) while keeping a ~0.14 margin
 * above the ~0.58 unrelated-same-domain noise floor. This tier is PROPOSE-only:
 * a `FND_SIMILAR_SEMANTIC` finding is an info-tier suggestion to add a glossary
 * entry — it NEVER decides a verdict. A false suggestion costs the agent one
 * ignored glossary line; a MISS hides a real paraphrased conflict the SMT tier
 * could then prove. That asymmetry means recall is worth far more than precision
 * here, so we tune to the recall-favoring edge of the safe gap rather than the
 * middle.
 *
 * Overridable per-run via `--semantic-threshold` (mapped to
 * {@link FindSimilarSemanticOptions.threshold}).
 */
export const DEFAULT_SEMANTIC_THRESHOLD = 0.72

/**
 * A response atom as this module reads it: name, polarity, and the canonical body — the
 * slot text after glossary, terms and antonym rewriting. `body` is undefined only when an
 * injected atomizer returns no structured ref (a hand-written test double); the name is
 * never parsed for it.
 */
interface ResponseAtom {
  readonly name: string
  readonly negated: boolean
  readonly body: string | undefined
  /** The antonym-class membership (AC-2-1), so a contrary pair is never proposed as synonyms. */
  readonly opposition?: Opposition
}

/**
 * The scoped RESPONSE atom for a requirement: through the document's atomizer when the
 * caller supplied one, else the glossary (AC-9-2) over the seed antonym table.
 */
function responseAtom(
  req: SemanticRequirement,
  options: { readonly glossary?: ReadonlyMap<string, string>; readonly atomize?: Atomize },
): ResponseAtom {
  if (options.atomize !== undefined) {
    const lit = options.atomize('resp', req.systemResponse, req.systemName, req.negated ?? false)
    return {
      name: lit.atom,
      negated: lit.negated,
      body: lit.ref?.body,
      ...(lit.opposition !== undefined ? { opposition: lit.opposition } : {}),
    }
  }
  const atom = atomize({
    kind: 'resp',
    text: req.systemResponse,
    systemName: req.systemName,
    ...(req.negated !== undefined ? { negated: req.negated } : {}),
    ...(options.glossary !== undefined ? { glossary: options.glossary } : {}),
  })
  return {
    name: atom.name,
    negated: atom.negated,
    body: atom.ref.body,
    ...(atom.opposition !== undefined ? { opposition: atom.opposition } : {}),
  }
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * The words an atom is compared on for AC-3-6: its opposition key's class-and-remainder body when
 * its head is in an antonym class, else its own body. Under AC-2-1 "open the door" is the atom
 * `open_the_door`, but its key body is `close_the_door`, the same space "close the doors"
 * (`close_the_doors`) lives in — so the two are one number apart there, and a head apart in atom
 * space. Undefined only for an injected atomizer that reports no body.
 */
const keyBody = (atom: ResponseAtom): string | undefined => atom.opposition?.body ?? atom.body

/**
 * Whether ANY two key bodies of the atoms — every reading of an opposition ({@link keyBody} is the
 * first), else the atom body, else the raw response — satisfy `test`. An atom in a governed class
 * reads the literal remainder and the one with its own governed preposition marked out, and a
 * pair can meet on either: "include the file in the box" and "exclude the file in the boxes" meet
 * only on the literal one, "include the tile in the view" and "exclude the tiles from the view"
 * only on the governed one.
 */
function someKeyPair(
  a: ResponseAtom,
  b: ResponseAtom,
  raw: readonly [string, string],
  test: (x: string, y: string) => boolean,
): boolean {
  const bodies = (atom: ResponseAtom): readonly string[] =>
    atom.opposition !== undefined
      ? [atom.opposition.body, ...(atom.opposition.via ?? []).map((r) => r.body)]
      : atom.body !== undefined
        ? [atom.body]
        : []
  const [xs, ys] = [bodies(a), bodies(b)]
  if (xs.length === 0 || ys.length === 0) return test(raw[0], raw[1])
  return xs.some((x) => ys.some((y) => test(x, y)))
}

/**
 * True when two response atoms would CONFLICT if their words named one thing (spec 007 AC-2-1
 * semantics). On one side of a class, or outside any class, an atom is only its own opposite, so
 * the pair conflicts exactly when the polarities differ (`X` against `¬X`). On OPPOSITE sides of
 * a class the two are contraries, `¬(A ∧ B)`: only both asserted conflicts, and "shall not open"
 * plus "shall not close" is the consistent "do neither", never a contradiction.
 */
function wouldConflict(a: ConflictLiteral, b: ConflictLiteral): boolean {
  const contrarySides =
    a.opposition !== undefined &&
    b.opposition !== undefined &&
    a.opposition.negative !== b.opposition.negative
  return contrarySides ? !a.negated && !b.negated : a.negated !== b.negated
}

/** The part of a response literal {@link wouldConflict} and {@link literalsConflict} read. */
export interface ConflictLiteral {
  readonly name: string
  readonly negated: boolean
  readonly opposition?: Opposition
}

/**
 * True when two response literals CONFLICT as written, both holding (spec 007 AC-2-1): one atom
 * at opposite polarity (`X` against `¬X`), or two contraries — distinct atoms on opposite sides
 * of ONE opposition key ({@link areContrary}) — both asserted. Both negated is the consistent
 * "do neither", never a conflict.
 *
 * {@link wouldConflict} with the "same thing" half made exact: there the words are compared up
 * to inflection by the caller, here the two must be one atom or one key. The pipeline's AC-3-2
 * conditional-conflict scan reads this, so that detector and the AC-3-6 near-duplicate rule
 * share one reading of "would conflict" and cannot drift apart.
 */
export function literalsConflict(a: ConflictLiteral, b: ConflictLiteral): boolean {
  return (a.name === b.name || areContrary(a, b)) && wouldConflict(a, b)
}

/**
 * True when two response texts are the same token sequence up to inflection or number:
 * equal length after {@link normalize}, and every token pair either equal or equal once
 * both are passed through {@link deInflectHead} (irregular past forms, 3sg `-s`/`-es`/
 * `-ies`, which is also the regular plural). At least one token must differ, or the two
 * would already share an atom.
 *
 * This is a lenient fold applied to EVERY token, which is exactly what the decide key
 * must never do (`normalization-for-a-propose-signal-must-not-touch-the-decide-key`). It
 * is safe here because it only ever selects a pair to DEMOTE on — it names no atom and
 * asserts nothing, so a false match costs an author one triage and can fabricate no
 * finding.
 */
export function differsOnlyByInflection(a: string, b: string): boolean {
  const ta = normalize(a).split('_')
  const tb = normalize(b).split('_')
  if (ta.length !== tb.length || ta.length === 0) return false
  let differs = false
  for (let i = 0; i < ta.length; i++) {
    const x = ta[i] as string
    const y = tb[i] as string
    if (x === y) continue
    if (deInflectHead(x) !== deInflectHead(y)) return false
    differs = true
  }
  return differs
}
const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** A canonical body (underscore-joined, normalized) spelled back as a phrase. */
const phraseOf = (body: string): string => body.replace(/_/g, ' ')

/**
 * True when two response PHRASES are contraries under the document's own vocabulary: both
 * asserted, they would conflict ({@link wouldConflict}) over the same key words up to inflection
 * or number ({@link keyBody}) — "open the door" (`open_the_door`, key `close_the_door`, once
 * open/close is committed) against "close the doors" (key `close_the_doors`). A glossary entry
 * declares two phrases SYNONYMS, so committing one over a contrary pair aliases a phrase to its
 * own opposite: the two land on one atom at one polarity, and the solver reads the contradiction
 * as a redundancy. Both phrases are read unnegated, since a glossary entry maps text, and a
 * requirement's `shall not` composes with whatever the text becomes.
 */
function areContraryPhrases(
  x: string,
  y: string,
  systemName: string,
  options: { readonly glossary?: ReadonlyMap<string, string>; readonly atomize?: Atomize },
): boolean {
  const ax = responseAtom({ id: '', systemName, systemResponse: x }, options)
  const ay = responseAtom({ id: '', systemName, systemResponse: y }, options)
  if (!wouldConflict(ax, ay)) return false
  return someKeyPair(
    ax,
    ay,
    [x, y],
    (wx, wy) => normalize(wx) === normalize(wy) || differsOnlyByInflection(wx, wy),
  )
}

/**
 * `raw` with the tokens where `from` and `to` differ replaced by `to`'s: the other
 * requirement's inflection or number, written in this requirement's own words. "open the door"
 * with `close_the_door` -> `close_the_doors` is "open the doors". Undefined when the three do not
 * align token for token (a multiword antonym head, a dropped preposition), since then no
 * position maps across.
 */
function transportInflection(raw: string, from: string, to: string): string | undefined {
  const r = normalize(raw).split('_')
  const f = from.split('_')
  const t = to.split('_')
  if (r.length !== f.length || f.length !== t.length) return undefined
  return r.map((token, i) => (f[i] === t[i] ? token : (t[i] as string))).join(' ')
}

/**
 * The glossary merge to propose for a high-cosine pair, or undefined when no candidate survives.
 *
 * The candidates, in order: the two raw responses (the author's own wording); each raw response
 * aliased to the OTHER requirement's canonical body; each raw response aliased to itself with
 * the other's inflection transported in ({@link transportInflection}), in opposition-key space
 * ({@link keyBody}). The later forms are the ones a contrary pair needs: "open the door" / "close
 * the doors" are contraries as phrases, but their keys `close_the_door` / `close_the_doors`
 * differ only in number, so the merge is "close the doors" -> "close the door", or "open the
 * door" -> "open the doors" — each lands the pair on the two sides of ONE key, where the contrary
 * axiom relates them.
 *
 * A candidate is refused when:
 * - its two phrases are contraries ({@link areContraryPhrases}): a glossary entry declares
 *   synonyms, so it would alias a phrase to its own opposite;
 * - the canonical re-atomizes neither onto its owner's atom nor onto a contrary of it (one key,
 *   the other side), so the merge would relate nothing;
 * - the committed glossary already uses either phrase in a way the `glossary` op refuses or the
 *   entry would break: the alias is already an alias (of anything) or already a canonical (its
 *   own aliases would be orphaned, since lookup is one hop), or the canonical is itself an alias;
 * - the caller's {@link FindSimilarSemanticOptions.admitsMerge} rejects it.
 *
 * The alias is always a requirement's response as the solver reads it, because a glossary entry
 * is keyed on the author's wording (it runs before term and antonym rewriting).
 */
function suggestMerge(
  a: SemanticRequirement,
  b: SemanticRequirement,
  atomA: ResponseAtom,
  atomB: ResponseAtom,
  options: {
    readonly glossary?: ReadonlyMap<string, string>
    readonly atomize?: Atomize
    readonly admitsMerge?: FindSimilarSemanticOptions['admitsMerge']
  },
): GlossaryMerge | undefined {
  const toward = (
    self: SemanticRequirement,
    atomSelf: ResponseAtom,
    atomOther: ResponseAtom,
  ): string | undefined => {
    const from = keyBody(atomSelf)
    const to = keyBody(atomOther)
    return from !== undefined && to !== undefined
      ? transportInflection(self.systemResponse, from, to)
      : undefined
  }
  const intoB = toward(a, atomA, atomB)
  const intoA = toward(b, atomB, atomA)
  const candidates: { merge: GlossaryMerge; owner: ResponseAtom }[] = [
    { merge: { canonical: a.systemResponse, alias: b.systemResponse }, owner: atomA },
    ...(atomA.body !== undefined
      ? [{ merge: { canonical: phraseOf(atomA.body), alias: b.systemResponse }, owner: atomA }]
      : []),
    ...(atomB.body !== undefined
      ? [{ merge: { canonical: phraseOf(atomB.body), alias: a.systemResponse }, owner: atomB }]
      : []),
    ...(intoA !== undefined
      ? [{ merge: { canonical: intoA, alias: b.systemResponse }, owner: atomA }]
      : []),
    ...(intoB !== undefined
      ? [{ merge: { canonical: intoB, alias: a.systemResponse }, owner: atomB }]
      : []),
  ]
  const committed = options.glossary
  const canonicals = new Set(committed?.values() ?? [])
  for (const { merge, owner } of candidates) {
    const canonicalKey = normalize(merge.canonical)
    const aliasKey = normalize(merge.alias)
    // A glossary entry needs two different keys (`glossary add` refuses one that is not).
    if (canonicalKey === aliasKey) continue
    if (areContraryPhrases(merge.canonical, merge.alias, a.systemName, options)) continue
    const lands = responseAtom(
      { id: '', systemName: a.systemName, systemResponse: merge.canonical },
      options,
    )
    if (lands.name !== owner.name && !areContrary(lands, owner)) continue
    if (committed?.has(aliasKey) === true || canonicals.has(aliasKey)) continue
    if (committed?.has(canonicalKey) === true) continue
    if (options.admitsMerge?.(merge, [a.id, b.id]) === false) continue
    return merge
  }
  return undefined
}

/**
 * Embed response phrasings and report high-cosine pairs that did NOT already
 * unify to one atom. Async because embedding is (AC-9-5). Requires an injected
 * {@link Embedder} — the caller (the `check --semantic` path) loads it lazily
 * so the default `check` never touches the model.
 *
 * `cosine` is imported lazily-per-call rather than at module top so this file
 * does not pull the embed backend into the default import graph.
 */
export async function findSimilarSemantic(
  reqs: readonly SemanticRequirement[],
  embedder: Embedder,
  options: FindSimilarSemanticOptions = {},
): Promise<SimilarSemanticFinding[]> {
  const threshold = options.threshold ?? DEFAULT_SEMANTIC_THRESHOLD
  if (reqs.length < 2) return []

  const { cosine } = await import('./embed.ts')

  // Embed every distinct response text once (dedup by normalized-free raw text).
  const texts = reqs.map((r) => r.systemResponse)
  const vectors = await embedder(texts)

  const findings: SimilarSemanticFinding[] = []
  const seen = new Set<string>()

  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i] as SemanticRequirement
      const b = reqs[j] as SemanticRequirement
      // Same-system only (per-system atom scoping, AC-4-2a), by the scope the atoms carry: two
      // spellings of one system ("Access Controller" / "access controller") are one scope.
      if (normalizeScope(a.systemName) !== normalizeScope(b.systemName)) continue

      // Skip pairs already unified by atomize (glossary/identical), and contraries the seed
      // table already relates (AC-2-1) — a synonym proposal for those would be a merge of opposites.
      const atomA = responseAtom(a, options)
      const atomB = responseAtom(b, options)
      if (atomA.name === atomB.name || areContrary(atomA, atomB)) continue

      const key = pairKey(a.id, b.id)
      if (seen.has(key)) continue

      const va = vectors[i]
      const vb = vectors[j]
      if (va === undefined || vb === undefined) continue
      const score = cosine(va, vb)
      if (score < threshold) continue

      seen.add(key)
      const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]

      // When the two responses fire under the SAME trigger (not just the same
      // system), high cosine is equally consistent with them being polar
      // OPPOSITES (antonyms embed close — shared topic — so cosine cannot tell
      // opposites from synonyms). In that case also point at `antonym add`, so an
      // agent triaging a same-trigger paraphrase is not railroaded toward
      // `glossary add` when the pair might really be a contradiction. Reuse the
      // same head-extraction as findOppositionCandidates for a concrete verb
      // suggestion; fall back to a generic pointer if a clean head is unavailable.
      const sameTrigger =
        a.trigger !== undefined &&
        b.trigger !== undefined &&
        normalize(a.trigger) === normalize(b.trigger)
      // AC-3-6 variant pairs are decided below, before the hint: they already conflict over one
      // set of key words, by polarity or by the table, so an antonym link has nothing to add.
      // Offering one hands an agent a command that commits a pair the table already holds, or
      // none at all.
      const oppositePolarityVariant =
        wouldConflict(atomA, atomB) &&
        someKeyPair(atomA, atomB, [a.systemResponse, b.systemResponse], differsOnlyByInflection)
      let antonymHint = ''
      if (sameTrigger && !oppositePolarityVariant) {
        const [headA] = headOf(normalize(a.systemResponse), ANTONYM_INDEX)
        const [headB] = headOf(normalize(b.systemResponse), ANTONYM_INDEX)
        antonymHint =
          headA !== '' && headB !== '' && headA !== headB
            ? ` These fire under the SAME trigger, so if they are polar OPPOSITES rather than ` +
              `synonyms, run \`symspec antonym ${shellWord(headA)} ${shellWord(headB)}\` instead — the formal tier ` +
              'will then treat them as contraries (they cannot both hold) and can prove the conflict.'
            : ' These fire under the SAME trigger, so if these responses are opposites rather than ' +
              'synonyms, register an antonym instead (see `symspec antonym <verbA> <verbB>`).'
      }

      // AC-3-6: a would-be conflict over the same words up to inflection/number, BOTH halves
      // read off the atoms. The words half compares the opposition-key bodies, not the raw
      // text: "open the door" and "close the doors" differ in a head the antonym table relates
      // (key `close_the_door` against `close_the_doors`), so a raw-text test would never match
      // that pair. Raw text is the fallback only for an atomizer that reports no canonical body.
      // (Computed above, before the antonym hint it suppresses.)
      // The merge is chosen in the same canonical space as the test above, never aliases a
      // phrase to its own opposite, and never breaks a unification the document already has;
      // when no candidate survives, the message withholds it.
      const merge = suggestMerge(a, b, atomA, atomB, options)
      const mergeAdvice =
        merge !== undefined
          ? ` If they mean the same thing, run \`symspec glossary ${shellQuoted(merge.canonical)} ` +
            `${shellQuoted(merge.alias)}\` so the formal tier treats them as one atom, then re-run ` +
            '`symspec check` to surface any conflict the shared atom exposes.'
          : ' No glossary merge is proposed: every merge of these phrasings either aliases a ' +
            'phrase to its own opposite under the committed antonyms (which turns the conflict ' +
            'into a redundancy) or ' +
            're-points a phrase the committed vocabulary already unifies with another (which ' +
            'splits that atom). If they mean the same thing, rewrite one to use the same words ' +
            'as the other.'
      // Which of the two AC-2-1 shapes the variant is: both asserted on opposite sides of a class
      // (contraries), or one atom's two polarities.
      const contrary = atomA.negated === atomB.negated
      const variantNote = oppositePolarityVariant
        ? ` These two differ only in inflection or number and ${
            contrary
              ? 'sit on OPPOSITE sides of a committed antonym pair'
              : 'sit at OPPOSITE polarity'
          }, so if they mean the same thing they contradict each other — this DEMOTES ` +
          '`verified` until ' +
          (merge !== undefined
            ? `you commit the glossary merge above (it puts both on ${
                contrary ? 'one antonym key as contraries' : 'one atom at opposite polarity'
              }, which the solver compares like any other pair) `
            : 'you rewrite one of them as above ') +
          'or reword one so the two plainly name different actions.'
        : ''

      findings.push({
        code: 'FND_SIMILAR_SEMANTIC',
        severity: 'info',
        requirementIds: [lo, hi],
        cosine: round3(score),
        oppositePolarityVariant,
        merge,
        message:
          `${lo} and ${hi} have semantically similar responses (cosine ${round3(score)} ≥ ` +
          `${threshold}) under the same system, but atomized to different atoms.${mergeAdvice}` +
          `${antonymHint}${variantNote} This is a suggestion, not a verdict.`,
      })
    }
  }

  return findings
}

/** An info-severity opposition-candidate finding (Appendix B `FND_OPPOSITION_CANDIDATE`). */
export interface OppositionCandidateFinding {
  readonly code: 'FND_OPPOSITION_CANDIDATE'
  readonly severity: 'info'
  /** Both requirement ids, lexicographically ordered for stability. */
  readonly requirementIds: [string, string]
  /** The two differing verb heads, ordered `[a, b]` as they should be committed. */
  readonly verbs: [string, string]
  /** The cosine similarity that confirmed topical relatedness, rounded to 3 dp. */
  readonly cosine: number
  readonly message: string
}

/**
 * Default cosine FLOOR above which two same-object/different-verb responses are
 * topically related enough to propose as an opposition candidate (#6).
 *
 * ## Why a FLOOR, and why cosine is only a confirmation here
 *
 * Cosine CANNOT distinguish antonymy from synonymy — antonyms embed CLOSE
 * (shared context/topic), not far. So low cosine does NOT signal opposition; it
 * signals unrelatedness. The load-bearing opposition signal is DETERMINISTIC:
 * two same-system responses that share an object remainder but differ on the
 * leading verb and did not already unify through the antonym/glossary tables.
 * Cosine is used only as a topical-relatedness FLOOR — to drop pairs whose
 * shared object is coincidental noise — never as the primary signal. The floor
 * is deliberately generous (below the synonym band) because the deterministic
 * structural match already carries the precision.
 */
export const DEFAULT_OPPOSITION_COSINE_FLOOR = 0.5

/** Split a normalized response body into `[head, rest]` (rest keeps no leading `_`). */
function headAndRest(body: string): [string, string] {
  const sep = body.indexOf('_')
  if (sep === -1) return [body, '']
  return [body.slice(0, sep), body.slice(sep + 1)]
}

/**
 * Split a normalized response body into a DE-INFLECTED head and rest, fusing a
 * standalone negating-prefix token back onto the verb it modifies: normalize
 * turns "de-energize the coil" into `de_energize_the_coil`, whose first token
 * is just `de`; this reassembles the head as `de_energize` so it compares
 * against "energizes the coil" (head `energize`) as a prefix pair.
 */
function fuseNegatingPrefix(body: string): [string, string] {
  const tokens = body.split('_')
  const first = tokens[0] ?? ''
  if ((first === 'de' || first === 'un' || first === 'dis') && tokens.length >= 2) {
    const head = `${first}_${deInflectHead(tokens[1] as string)}`
    return [head, tokens.slice(2).join('_')]
  }
  const [head, rest] = headAndRest(body)
  return [deInflectHead(head), rest]
}

/**
 * Split a normalized response body into its de-inflected HEAD and rest the way the atomizer does
 * (atomize.ts `antonymReading`): a two-token head the antonym table lists ("roll back", "rolls
 * back") is read whole before the one-token one, and otherwise {@link fuseNegatingPrefix} applies.
 * Reading only the first token made "roll back the batch from the ledger" the head `roll` with rest
 * `back_the_batch_…`, which met no class and lined up with nothing, so a pair the table relates
 * escaped the candidate tier and `verified` came back true over it.
 */
function headOf(body: string, antonyms: ReadonlyMap<string, AntonymEntry>): [string, string] {
  const tokens = body.split('_')
  if (tokens.length >= 2) {
    const two = `${deInflectHead(tokens[0] as string)}_${tokens[1] as string}`
    if (antonyms.has(two)) return [two, tokens.slice(2).join('_')]
  }
  return fuseNegatingPrefix(body)
}

/**
 * True when two de-inflected verb heads relate by a negating prefix —
 * `de-`/`un-`/`dis-` — i.e. one is exactly the other with the prefix attached
 * (energize/de_energize → deenergize after normalize drops the hyphen? No:
 * normalize turns "de-energize" into `de_energize`, whose HEAD token is `de`,
 * so multiword-head handling upstream fuses it; here we compare the fused or
 * plain heads: seal/unseal, engage/disengage, energize/deenergize). Purely
 * structural and deterministic — no embedding involved — so a prefix pair is
 * proposed as an opposition candidate even below the topical cosine floor.
 */
function isNegatingPrefixPair(a: string, b: string): boolean {
  const plain = (s: string) => s.replace(/_/g, '')
  const pa = plain(a)
  const pb = plain(b)
  for (const prefix of ['de', 'un', 'dis']) {
    if (pa === prefix + pb || pb === prefix + pa) return true
  }
  return false
}

/**
 * Every preposition a remainder may name a place with: the ones the antonym-remainder rule used to
 * drop after ANY antonym head (669c0e9), and `with`, which the governed-preposition table also
 * reads as a place (`connect`/`engage`). A PROPOSE signal only ({@link prepositionFree}): the
 * decide key marks a preposition only where the head verb's own row governs it
 * (`GOVERNED_PREPOSITIONS` in antonyms.ts), and otherwise keeps every one.
 */
const PREPOSITIONS: ReadonlySet<string> = new Set([
  'at',
  'from',
  'in',
  'inside',
  'into',
  'on',
  'onto',
  'to',
  'with',
  'within',
])

/**
 * An object remainder with EVERY preposition token removed, at any position and however many:
 * "access to only admins" and "access only from admins" are both `access_only_admins`, "the pump
 * on Monday" and "the pump Monday" both `the_pump_monday`. Base 669c0e9 dropped the first
 * preposition after the remainder's first token wherever it sat, so any two remainders it read as
 * one object are equal here too; this is strictly coarser, which is the safe direction for a rule
 * that only ever demotes.
 */
const prepositionFree = (rest: string): string =>
  rest
    .split('_')
    .filter((t) => !PREPOSITIONS.has(t))
    .join('_')

/**
 * THE preposition-variant rule, the one propose-tier rule for two responses the decide tier keeps
 * apart only by their prepositions (spec 007, demote-not-prove C2). It holds when two responses'
 * remainders DIFFER but are equal once every preposition is removed ({@link prepositionFree}),
 * and the heads could conflict were the two remainders one object:
 *
 *   - `same-verb`: one antonym-table verb at OPPOSITE polarity ("stop the pump on Monday" / "shall
 *     not stop the pump Monday"), which would be one atom, `X ∧ ¬X`;
 *   - `contrary`: two verbs an explicit seeded or committed row relates, BOTH asserted ("grant
 *     access to only admins" / "revoke access only from admins"), which would be one key on
 *     opposite sides, `¬(A ∧ B)` violated. With either side negated no reading conflicts —
 *     "do neither" and "do one, not the other" are consistent — so there is no edit that could make
 *     the pair provable, and nothing to propose;
 *   - `class`: two other verbs of one antonym class (one side, `grant`/`allow`, or two rows apart,
 *     `conceal`/`unseal`), which the table relates by no row, at any polarity: the author decides
 *     what they are.
 *
 * It never proves. The decide key cannot tell "on Monday" from "Monday", or `to` from `from`,
 * without a grammar guess, and a guess may not create a proof (C1); so the pair is proposed and
 * demotes `verified` until the author aligns the preposition or commits a glossary entry, either of
 * which puts the two on one exact key the solver decides, or waives it. Undefined when the rule
 * does not hold.
 */
function prepositionVariant(
  a: { readonly head: string; readonly rest: string; readonly negated: boolean },
  b: { readonly head: string; readonly rest: string; readonly negated: boolean },
  antonyms: ReadonlyMap<string, AntonymEntry>,
): 'same-verb' | 'contrary' | 'class' | undefined {
  if (a.rest === b.rest || prepositionFree(a.rest) !== prepositionFree(b.rest)) return undefined
  const entryA = antonyms.get(a.head)
  const entryB = antonyms.get(b.head)
  if (entryA === undefined || entryB === undefined) return undefined
  if (a.head === b.head) return a.negated !== b.negated ? 'same-verb' : undefined
  if (entryA.canonical !== entryB.canonical) return undefined
  if (!entryA.opposes.includes(b.head)) return 'class'
  return !a.negated && !b.negated ? 'contrary' : undefined
}

/** The structural opposition shape of one response pair ({@link oppositionShapesOf}). */
interface OppositionShape {
  readonly headA: string
  readonly restA: string
  readonly headB: string
  readonly restB: string
  /** Both heads sit in one antonym class (either side), or are one antonym-table verb. */
  readonly sameClass: boolean
  /** Both heads sit on one polarity side of their class (never true across a row). */
  readonly sameSide: boolean
  /** Which {@link prepositionVariant} the pair is, when its remainders differ. */
  readonly variant: 'same-verb' | 'contrary' | 'class' | undefined
  /** The shape was read off the committed-vocabulary bodies, not the raw wording. */
  readonly committed: boolean
}

/**
 * The readings of a response pair that have the opposition shape — a shared object remainder under
 * two different heads, or a {@link prepositionVariant} — the RAW normalized wording first, then
 * the atom bodies after the committed glossary and terms. Empty when neither reading has it.
 */
function oppositionShapesOf(
  raw: readonly [string, string],
  committed: readonly [string, string] | undefined,
  negated: readonly [boolean, boolean],
  antonyms: ReadonlyMap<string, AntonymEntry>,
): OppositionShape[] {
  const readings: Array<readonly [string, string, boolean]> = [[raw[0], raw[1], false]]
  if (committed !== undefined) readings.push([committed[0], committed[1], true])
  const shapes: OppositionShape[] = []
  for (const [x, y, fromCommitted] of readings) {
    const [headA, restA] = headOf(x, antonyms)
    const [headB, restB] = headOf(y, antonyms)
    if (restA === '') continue
    const variant = prepositionVariant(
      { head: headA, rest: restA, negated: negated[0] },
      { head: headB, rest: restB, negated: negated[1] },
      antonyms,
    )
    if (variant === undefined && (restA !== restB || headA === headB)) continue
    const entryA = antonyms.get(headA)
    const entryB = antonyms.get(headB)
    const sameClass =
      entryA !== undefined && entryB !== undefined && entryA.canonical === entryB.canonical
    const sameSide = sameClass && entryA.negated === entryB.negated
    shapes.push({
      headA,
      restA,
      headB,
      restB,
      sameClass,
      sameSide,
      variant,
      committed: fromCommitted,
    })
  }
  return shapes
}

/**
 * Propose opposition candidates (#6): same-system response pairs that share an
 * object remainder but differ on the leading verb and are NOT already unified as
 * antonyms. Propose-only (info-tier) — it suggests `symspec antonym add`, which
 * is what actually changes a verdict, mirroring how `FND_SIMILAR_SEMANTIC`
 * suggests `glossary add`. Reuses the SAME embedder as the paraphrase pass; the
 * cosine is only a topical-relatedness floor (see {@link DEFAULT_OPPOSITION_COSINE_FLOOR}).
 *
 * The `antonyms` index (default {@link ANTONYM_INDEX}, or a doc-augmented one) is
 * consulted so a pair the antonym tables ALREADY unify is skipped — that pair is
 * a proven-or-provable conflict, not a candidate needing confirmation.
 *
 * The shape is read twice: off the author's RAW wording, and off the atom body the solver
 * reads — after the committed glossary and terms (`atomize`, the pipeline's own atomizer when
 * the caller supplies it). Either one proposes. Committed vocabulary is a strengthening move
 * (spec 007 I-1), and a term ("access" ≡ "entry") or an alias is exactly what lines up two
 * objects the raw text keeps apart: read off the raw text alone, committing the term lifted the
 * demotion the same words earn without it, and `verified: true` came back over the pair.
 */
export async function findOppositionCandidates(
  reqs: readonly SemanticRequirement[],
  embedder: Embedder,
  options: {
    cosineFloor?: number
    glossary?: ReadonlyMap<string, string>
    antonyms?: ReadonlyMap<string, AntonymEntry>
    /** The document's atomizer (glossary, terms and antonyms), as every solver tier reads it. */
    atomize?: Atomize
  } = {},
): Promise<OppositionCandidateFinding[]> {
  const floor = options.cosineFloor ?? DEFAULT_OPPOSITION_COSINE_FLOOR
  const antonyms = options.antonyms ?? ANTONYM_INDEX
  if (reqs.length < 2) return []

  const { cosine } = await import('./embed.ts')
  const vectors = await embedder(reqs.map((r) => r.systemResponse))
  const atomizer = options.atomize ?? makeAtomize(options.glossary, antonyms)
  const atoms = reqs.map((r) => responseAtom(r, { atomize: atomizer }))

  const findings: OppositionCandidateFinding[] = []
  const seen = new Set<string>()

  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i] as SemanticRequirement
      const b = reqs[j] as SemanticRequirement
      // One system by the scope its atoms carry, never by the raw name: "Access Controller" and
      // "access controller" are one scope to the solver, and a pair skipped here on spelling alone
      // is a pair the decide tier may not relate either, so nothing demotes over it.
      if (normalizeScope(a.systemName) !== normalizeScope(b.systemName)) continue

      // Already one atom (glossary, terms, identical) ⇒ the solver compares them at polarity; a
      // pair the antonym tables ALREADY relate ⇒ the solver relates them by a contrary axiom.
      // Neither is a candidate. ONLY those: two verbs that merely share a class (`grant`/`allow`
      // on one side, `conceal`/`unseal` two pairs apart) are two unrelated atoms to the solver
      // (AC-2-1), and so are two objects a direction-carrying preposition apart ("allow calls
      // to the number" / "deny calls from the number"), which the key keeps. The table's own
      // evidence that such a pair is related is proposed like a negating prefix, regardless of
      // cosine, and demotes until the author commits a glossary entry or an antonym, rewrites
      // one, or waives it.
      const atomA = atoms[i] as ResponseAtom
      const atomB = atoms[j] as ResponseAtom
      if (atomA.name === atomB.name || areContrary(atomA, atomB)) continue

      // Structural opposition shape: same object remainder, different verb head.
      // Heads are de-inflected (opens/open) and a negating prefix token
      // (de-/un-/dis-, split off by punctuation normalization: "de-energize" →
      // `de_energize`) is fused back onto the verb so prefix opposites compare
      // as one head against their base form.
      const shapes = oppositionShapesOf(
        [normalize(a.systemResponse), normalize(b.systemResponse)],
        atomA.body !== undefined && atomB.body !== undefined ? [atomA.body, atomB.body] : undefined,
        [atomA.negated, atomB.negated],
        antonyms,
      )
      if (shapes.length === 0) continue

      const key = pairKey(a.id, b.id)
      if (seen.has(key)) continue

      // A negating-prefix pair (seal/unseal, energize/de-energize) is opposition
      // by MORPHOLOGY — deterministic structure, no embedding needed — so it is
      // proposed regardless of the topical cosine floor, as is a pair of one class.
      // Cosine is a topical-relatedness FLOOR only (antonyms embed close), not
      // the opposition signal — the shared-object/different-verb structure is.
      const va = vectors[i]
      const vb = vectors[j]
      const score = va !== undefined && vb !== undefined ? cosine(va, vb) : 0
      const shape = shapes.find(
        (s) => s.sameClass || isNegatingPrefixPair(s.headA, s.headB) || score >= floor,
      )
      if (shape === undefined) continue
      const { headA, restA, headB, restB } = shape

      seen.add(key)
      const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
      // Read through the committed vocabulary, the verbs and objects above need not be the
      // author's own words for either requirement, so the message says where they came from.
      const through = shape.committed
        ? ' (Read through the committed glossary and terms, which the formal tier applies: ' +
          `"${phraseOf(`${headA}_${restA}`)}" vs "${phraseOf(`${headB}_${restB}`)}".)`
        : ''
      findings.push({
        code: 'FND_OPPOSITION_CANDIDATE',
        severity: 'info',
        requirementIds: [lo, hi],
        verbs: [headA, headB],
        cosine: round3(score),
        message:
          shape.variant !== undefined
            ? variantMessage(lo, hi, shape, a, b, through)
            : oppositionMessage(lo, hi, headA, headB, a, b, through),
      })
    }
  }

  return findings
}

/**
 * The message for a {@link prepositionVariant} candidate, naming the exact edit that makes the pair
 * provable: the second requirement ({@link b}) rewritten with the first one's object — for one verb
 * the first response verbatim, so the two are one atom at opposite polarity; for a contrary row
 * the second verb over the first object, so the two are one key on opposite sides — or the
 * glossary entry that says the same. A `class` pair is two verbs no row relates, so aligning the
 * object alone decides nothing, and the message says which table entry would.
 */
function variantMessage(
  lo: string,
  hi: string,
  shape: OppositionShape,
  a: SemanticRequirement,
  b: SemanticRequirement,
  through: string,
): string {
  const { headA, restA, headB, restB, variant } = shape
  const objects = `("${phraseOf(restA)}" vs "${phraseOf(restB)}")`
  const why =
    'The formal tier does not read those as one object, because a preposition can name a ' +
    'different place or carry direction (to/from), so it compared nothing between them.'
  const tail = ` If they are different objects, reword one so its object differs in more than a preposition (name the place or the direction in full).${through} This is a suggestion, not a verdict.`
  if (variant === 'same-verb') {
    return (
      `${lo} and ${hi} respond under the same system with the same verb ("${headA}"), one of them ` +
      `under "shall not", over objects that differ only by prepositions ${objects}. ${why} If they ` +
      'name ONE object, make the pair provable: align the preposition with ' +
      `\`symspec update --ref ${shellWord(b.id)} systemResponse ${shellQuoted(a.systemResponse)}\`, or commit the two ` +
      `phrasings as one action with \`symspec glossary ${shellQuoted(a.systemResponse)} ${shellQuoted(b.systemResponse)}\`; ` +
      'either puts both on one atom at opposite polarity, and the solver decides the conflict.' +
      tail
    )
  }
  if (variant === 'contrary') {
    const aligned = phraseOf(`${headB}_${restA}`)
    return (
      `${lo} and ${hi} respond under the same system with verbs an antonym row relates ` +
      `("${headA}" vs "${headB}") over objects that differ only by prepositions ${objects}. ${why} ` +
      'If they name ONE object, make the pair provable: align the preposition with ' +
      `\`symspec update --ref ${shellWord(b.id)} systemResponse ${shellQuoted(aligned)}\`, or commit the rewording as ` +
      `one action with \`symspec glossary ${shellQuoted(aligned)} ${shellQuoted(b.systemResponse)}\`; either puts ` +
      'both on one key on opposite sides of the row, and the solver decides the conflict.' +
      tail
    )
  }
  // Two verbs no row relates: one side of a class ("grant" / "allow") may be one action, which a
  // rewrite in the other's words makes one atom; two sides may be opposites, which a row makes
  // contraries once the objects are aligned.
  const repair = shape.sameSide
    ? `If they ARE one action on one object, rewrite one requirement in the other's words ` +
      `(\`symspec update --ref ${shellWord(b.id)} systemResponse ${shellQuoted(a.systemResponse)}\`), so the two share ` +
      'one atom and the solver decides the conflict.'
    : 'If they are opposites acting on one object, align the preposition ' +
      `(\`symspec update --ref ${shellWord(b.id)} systemResponse ${shellQuoted(phraseOf(`${headB}_${restA}`))}\`) and ` +
      `commit the pair (\`symspec antonym ${shellWord(headA)} ${shellWord(headB)}\`), so the solver decides the conflict.`
  return (
    `${lo} and ${hi} respond under the same system with verbs one antonym class holds but no row ` +
    `relates ("${headA}" vs "${headB}"), over objects that differ only by prepositions ${objects}. ` +
    `${why} ${repair}${tail}`
  )
}

/** The message for a same-object, different-verb opposition candidate. */
function oppositionMessage(
  lo: string,
  hi: string,
  headA: string,
  headB: string,
  a: SemanticRequirement,
  b: SemanticRequirement,
  through: string,
): string {
  return (
    `${lo} and ${hi} respond under the same system with the same object but different ` +
    `leading verbs ("${headA}" vs "${headB}"). These verbs differ, but embeddings CANNOT ` +
    'tell opposites (open/shut) from synonyms (delete/remove) — decide which these are: ' +
    `if they are polar OPPOSITES, run \`symspec antonym ${shellWord(headA)} ${shellWord(headB)}\` (the formal ` +
    'tier will then treat them as contraries — they cannot both hold — and can prove a conflict); ' +
    `if they are SYNONYMS, run \`symspec glossary ${shellQuoted(a.systemResponse)} ${shellQuoted(b.systemResponse)}\` ` +
    'instead. Committing the WRONG one manufactures a false contradiction, so confirm the ' +
    `direction before applying.${through} This is a suggestion, not a verdict.`
  )
}
