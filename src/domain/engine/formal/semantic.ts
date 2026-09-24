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

import { ANTONYM_INDEX, type AntonymEntry } from './antonyms.ts'
import { type Atomize, atomize, deInflectHead, normalize } from './atomize.ts'
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
   * AC-3-6: the two responses sit at OPPOSITE polarity and are the same words up to
   * inflection or number ({@link differsOnlyByInflection}) — "open the door" vs "shall
   * not open the doors". If they mean one thing, the pair is a contradiction the solver
   * cannot see (two atoms), so the pipeline DEMOTES on it until the pair is aliased
   * (the {@link merge}, which lands both on one atom at opposite polarity), rewritten, or
   * declared distinct (a waiver of this finding). A demotion, never a verdict: the fold
   * below never reaches an atom.
   */
  readonly oppositePolarityVariant: boolean
  /**
   * The glossary merge the message proposes, or undefined when it withholds one. Chosen by
   * {@link suggestMerge}: never a merge that aliases a phrase to its own opposite, so for an
   * {@link oppositePolarityVariant} pair a merge, when present, lands the two on ONE atom at
   * opposite polarity.
   */
  readonly merge: GlossaryMerge | undefined
  readonly message: string
}

/** A `symspec glossary add <canonical> <alias>` proposal: `alias` is rewritten to `canonical`. */
interface GlossaryMerge {
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
    return { name: lit.atom, negated: lit.negated, body: lit.ref?.body }
  }
  const atom = atomize({
    kind: 'resp',
    text: req.systemResponse,
    systemName: req.systemName,
    ...(req.negated !== undefined ? { negated: req.negated } : {}),
    ...(options.glossary !== undefined ? { glossary: options.glossary } : {}),
  })
  return { name: atom.name, negated: atom.negated, body: atom.ref.body }
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

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
 * True when two response PHRASES are contraries under the document's own vocabulary: they
 * atomize at opposite polarity over the same words up to inflection or number — "open the
 * door" (`close_the_door`, negated, once open/close is committed) against "close the doors".
 * A glossary entry declares two phrases SYNONYMS, so committing one over a contrary pair
 * aliases a phrase to its own opposite: the antonym flip is erased and the solver reads a
 * contradiction as an equivalence. Both phrases are read unnegated, since a glossary entry
 * maps text, and a requirement's `shall not` composes with whatever the text becomes.
 */
function areContraryPhrases(
  x: string,
  y: string,
  systemName: string,
  options: { readonly glossary?: ReadonlyMap<string, string>; readonly atomize?: Atomize },
): boolean {
  const ax = responseAtom({ id: '', systemName, systemResponse: x }, options)
  const ay = responseAtom({ id: '', systemName, systemResponse: y }, options)
  if (ax.negated === ay.negated) return false
  const [wx, wy] = ax.body !== undefined && ay.body !== undefined ? [ax.body, ay.body] : [x, y]
  return normalize(wx) === normalize(wy) || differsOnlyByInflection(wx, wy)
}

/**
 * The glossary merge to propose for a high-cosine pair, or undefined when every candidate
 * would alias a phrase to its own opposite ({@link areContraryPhrases}).
 *
 * The candidates, in order: the two raw responses (the author's own wording), then each
 * requirement's raw response aliased to the OTHER's canonical body. The second form is the
 * one an antonym flip needs: "open the door" / "close the doors" are contraries as phrases,
 * but their canonical bodies `close_the_door` / `close_the_doors` differ only in number, so
 * the right merge is "close the doors" -> "close the door". A body candidate must re-atomize
 * onto its owner's atom, or the merge it names would not unify anything.
 *
 * The alias is always a requirement's RAW response, because a glossary entry is keyed on the
 * author's wording (it runs before term and antonym rewriting).
 */
function suggestMerge(
  a: SemanticRequirement,
  b: SemanticRequirement,
  atomA: ResponseAtom,
  atomB: ResponseAtom,
  options: { readonly glossary?: ReadonlyMap<string, string>; readonly atomize?: Atomize },
): GlossaryMerge | undefined {
  const candidates: { merge: GlossaryMerge; owner: ResponseAtom }[] = [
    { merge: { canonical: a.systemResponse, alias: b.systemResponse }, owner: atomA },
    ...(atomA.body !== undefined
      ? [{ merge: { canonical: phraseOf(atomA.body), alias: b.systemResponse }, owner: atomA }]
      : []),
    ...(atomB.body !== undefined
      ? [{ merge: { canonical: phraseOf(atomB.body), alias: a.systemResponse }, owner: atomB }]
      : []),
  ]
  for (const { merge, owner } of candidates) {
    // A glossary entry needs two different keys (`glossary add` refuses one that is not).
    if (normalize(merge.canonical) === normalize(merge.alias)) continue
    if (areContraryPhrases(merge.canonical, merge.alias, a.systemName, options)) continue
    const lands = responseAtom(
      { id: '', systemName: a.systemName, systemResponse: merge.canonical },
      options,
    )
    if (lands.name !== owner.name) continue
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
      // Same-system only (per-system atom scoping, AC-4-2a).
      if (a.systemName !== b.systemName) continue

      // Skip pairs already unified by atomize (glossary/antonym/identical).
      const atomA = responseAtom(a, options)
      const atomB = responseAtom(b, options)
      if (atomA.name === atomB.name) continue

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
      let antonymHint = ''
      if (sameTrigger) {
        const [headA] = fuseNegatingPrefix(normalize(a.systemResponse))
        const [headB] = fuseNegatingPrefix(normalize(b.systemResponse))
        antonymHint =
          headA !== '' && headB !== '' && headA !== headB
            ? ` These fire under the SAME trigger, so if they are polar OPPOSITES rather than ` +
              `synonyms, run \`symspec antonym add ${headA} ${headB}\` instead — the formal tier ` +
              'will then collapse them to one atom at opposite polarity and can prove the conflict.'
            : ' These fire under the SAME trigger, so if these responses are opposites rather than ' +
              'synonyms, register an antonym instead (see `symspec antonym add`).'
      }

      // AC-3-6: opposite polarity over the same words up to inflection/number, BOTH halves
      // read off the atoms. The words half compares the canonical bodies, not the raw text:
      // an antonym flip rewrites the head ("open the door" is `close_the_door` at negated
      // polarity), so the raw strings "open the door"/"close the doors" differ in a word the
      // solver itself treats as one, and a raw-text test would never match that pair. Raw
      // text is the fallback only for an atomizer that reports no canonical body.
      const [wordsA, wordsB] =
        atomA.body !== undefined && atomB.body !== undefined
          ? [atomA.body, atomB.body]
          : [a.systemResponse, b.systemResponse]
      const oppositePolarityVariant =
        atomA.negated !== atomB.negated && differsOnlyByInflection(wordsA, wordsB)
      const waiver = `\`symspec waive add FND_SIMILAR_SEMANTIC --ref ${hi} --reason "…"\``
      // The merge is chosen in the same canonical space as the test above, and never aliases a
      // phrase to its own opposite; when no candidate survives, the message withholds it.
      const merge = suggestMerge(a, b, atomA, atomB, options)
      const mergeAdvice =
        merge !== undefined
          ? ` If they mean the same thing, run \`symspec glossary add "${merge.canonical}" ` +
            `"${merge.alias}"\` so the formal tier treats them as one atom, then re-run ` +
            '`symspec check` to surface any conflict the shared atom exposes.'
          : ' No glossary merge is proposed: aliasing either phrasing to the other would alias a ' +
            'phrase to its own opposite under the committed antonyms, which erases the flip. If ' +
            'they mean the same thing, rewrite one to use the same words as the other.'
      const variantNote = oppositePolarityVariant
        ? ` These two differ only in inflection or number and sit at OPPOSITE polarity, so if ` +
          'they mean the same thing they contradict each other — this DEMOTES `verified` until ' +
          (merge !== undefined
            ? 'you commit the glossary merge above (it puts both on one atom at opposite ' +
              'polarity, which the solver compares like any other pair) '
            : 'you rewrite one of them as above ') +
          `or declare them distinct with ${waiver}.`
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
 */
export async function findOppositionCandidates(
  reqs: readonly SemanticRequirement[],
  embedder: Embedder,
  options: {
    cosineFloor?: number
    glossary?: ReadonlyMap<string, string>
    antonyms?: ReadonlyMap<string, AntonymEntry>
  } = {},
): Promise<OppositionCandidateFinding[]> {
  const floor = options.cosineFloor ?? DEFAULT_OPPOSITION_COSINE_FLOOR
  const antonyms = options.antonyms ?? ANTONYM_INDEX
  if (reqs.length < 2) return []

  const { cosine } = await import('./embed.ts')
  const vectors = await embedder(reqs.map((r) => r.systemResponse))

  const findings: OppositionCandidateFinding[] = []
  const seen = new Set<string>()

  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i] as SemanticRequirement
      const b = reqs[j] as SemanticRequirement
      if (a.systemName !== b.systemName) continue

      // Already unified (glossary/antonym/identical) ⇒ not a candidate.
      const atomA = responseAtom(a, {
        ...(options.glossary !== undefined ? { glossary: options.glossary } : {}),
      })
      const atomB = responseAtom(b, {
        ...(options.glossary !== undefined ? { glossary: options.glossary } : {}),
      })
      if (atomA.name === atomB.name) continue

      // Structural opposition shape: same object remainder, different verb head.
      // Heads are de-inflected (opens/open) and a negating prefix token
      // (de-/un-/dis-, split off by punctuation normalization: "de-energize" →
      // `de_energize`) is fused back onto the verb so prefix opposites compare
      // as one head against their base form.
      const [headA, restA] = fuseNegatingPrefix(normalize(a.systemResponse))
      const [headB, restB] = fuseNegatingPrefix(normalize(b.systemResponse))
      if (restA === '' || restA !== restB) continue
      if (headA === headB) continue

      // Skip pairs the antonym tables ALREADY relate — those unify (handled
      // above) or are a real conflict, not a candidate to propose.
      const entryA = antonyms.get(headA)
      const entryB = antonyms.get(headB)
      if (entryA !== undefined && entryB !== undefined && entryA.canonical === entryB.canonical) {
        continue
      }

      const key = pairKey(a.id, b.id)
      if (seen.has(key)) continue

      // A negating-prefix pair (seal/unseal, energize/de-energize) is opposition
      // by MORPHOLOGY — deterministic structure, no embedding needed — so it is
      // proposed regardless of the topical cosine floor.
      const prefixPair = isNegatingPrefixPair(headA, headB)
      const va = vectors[i]
      const vb = vectors[j]
      const score = va !== undefined && vb !== undefined ? cosine(va, vb) : 0
      // Cosine is a topical-relatedness FLOOR only (antonyms embed close), not
      // the opposition signal — the shared-object/different-verb structure is.
      if (!prefixPair && score < floor) continue

      seen.add(key)
      const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
      findings.push({
        code: 'FND_OPPOSITION_CANDIDATE',
        severity: 'info',
        requirementIds: [lo, hi],
        verbs: [headA, headB],
        cosine: round3(score),
        message:
          `${lo} and ${hi} respond under the same system with the same object but different ` +
          `leading verbs ("${headA}" vs "${headB}"). These verbs differ, but embeddings CANNOT ` +
          'tell opposites (open/shut) from synonyms (delete/remove) — decide which these are: ' +
          `if they are polar OPPOSITES, run \`symspec antonym add ${headA} ${headB}\` (the formal ` +
          'tier will then collapse them to one atom at opposite polarity and can prove a conflict); ' +
          `if they are SYNONYMS, run \`symspec glossary add "${a.systemResponse}" "${b.systemResponse}"\` ` +
          'instead. Committing the WRONG one manufactures a false contradiction, so confirm the ' +
          'direction before applying. This is a suggestion, not a verdict.',
      })
    }
  }

  return findings
}
