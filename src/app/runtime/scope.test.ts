/**
 * The honest-scope corpus, pinned claim by claim against a frozen snapshot.
 *
 * These nine sentences are the load-bearing honesty of the tool: "silence is not a
 * consistency certificate" is what stops a clean `check` from being read as a proof.
 *
 * The direction of the risk is what shapes this file. The dangerous edit to a disclosure
 * is not a typo, it is a paraphrase that drifts toward reassurance — and a softened claim
 * still reads fine, so review alone does not catch it. Byte-equality does, which is why
 * {@link FROZEN} spells all nine out in full rather than sampling them: changing a
 * disclosure has to be a deliberate two-place edit that shows up as a diff on this file.
 *
 * The phrase-level assertions below are kept SEPARATE from the byte-diff, because they
 * survive a lockstep edit to both places. Those are the phrases whose disappearance
 * matters however the two copies agree.
 */

import { describe, expect, it } from 'vitest'
import { SCOPE, SCOPE_ESSENTIAL, SCOPE_KEYS, scopeParagraphs } from './scope.ts'

/** The nine claims, verbatim. A diff here is the review signal. */
const FROZEN: Record<(typeof SCOPE_KEYS)[number], string> = {
  soundness:
    'The formal (SMT) tier is sound modulo atomization, given the conservative near-exact normalization of the atom table: every reported conflict is a genuine logical conflict of the requirements as atomized, and the atom table attached to each finding shows exactly what the solver compared.',
  silence:
    'Because paraphrases become distinct atoms, a real conflict can be missed (a false negative): silence is not a consistency certificate, so the formal tier reporting no conflict does not prove the spec consistent.',
  overUnification:
    'The one false-positive risk is over-unification: too-aggressive normalization collapsing two distinct conditions into one atom, or a committed vocabulary entry relating two things the domain keeps apart (a glossary or term alias naming two different things as one, or an antonym pair naming two compatible actions as contraries). It is mitigated by conservative normalization (no stemming or stopword-stripping beyond a leading article, a single copula in a trigger or precondition, and a closed third-person -s rule on the leading response verb), by the refusal of any term that rewrites a verb the solver reads, and by the info-severity FND_SIMILAR_UNUNIFIED reporter.',
  contextualAmbiguityNotChecked:
    'Deterministic ambiguity detectors (vague terms, quantifier/coordination scope, and referential ambiguity) run and report; but whether a phrase is vague in its domain context — pragmatic/contextual ambiguity — is surfaced for review (FND_AMBIGUITY_NEEDS_JUDGMENT), not decided by symspec, and any LLM ambiguity judgment is propose-only, never a verdict.',
  semanticProposeOnly:
    'Semantic similarity is a propose-only assist: the always-on embedding tier suggests glossary merges and opposition candidates for paraphrased or polar-opposite responses but never emits a conflict verdict, so `check` remains reproducible given the document, its glossary, and the pinned embedding model. A missing model fails the run closed (ERR_EMBED_MODEL_MISSING) rather than silently skipping the tier; pre-warm with `symspec download-model`.',
  numericChecked:
    'Numeric conflicts are checked over linear integer/real arithmetic (LIA/LRA): requirements placing jointly unsatisfiable bounds on the same per-system quantity, in one role and one dimension, are reported as FND_NUMERIC_CONTRADICTION. A deadline (`within`), a duration (`for`), and a period (`every`) are three roles, an unmarked bound meets every role, and units convert exactly within a dimension. A pair the tier cannot decide as written (a deadline against a duration, two units no conversion relates, or guards the solver never asserted together) is disclosed as FND_NUMERIC_UNCOMPARED, which demotes verified and is never a verdict. Nonlinear-integer arithmetic remains out of scope (undecidable).',
  reachabilityModelScoped:
    'The unbounded reachability tier proves a declared constraint over EVERY reachable state with no bound on path length (Z3 Spacer), every proof is independently re-verified by three plain-SMT obligations so a claim never rests on trusting the solver, and a violation carries the counterexample trace naming which requirements fired, in order. But the claim is about the STATE MODEL you declared, not about the requirement text: the `classify` expressions ARE the model, so a mis-declared effect yields a sound proof of the wrong thing. It runs only when a state model is committed (otherwise FND_REACHABILITY_NOT_CHECKED discloses that it did not run), every proof over a small model is ALSO re-decided by an independent explicit-state search (a disagreement is FND_CERTIFICATE_DISAGREES and withdraws the proof, and a search that stops without showing the model is too large to cover withholds the proof as FND_REACHABILITY_UNKNOWN), a proof that needs variables held fixed is FND_REACHABILITY_UNDER_HYPOTHESES only when the document DECLARES them `frame: stable` — and demotes verified — while one that needs undeclared frames is FND_REACHABILITY_UNKNOWN naming them, a write outside a declared range is FND_RANGE_VIOLATION rather than a silently disabled step, and an unsatisfiable initial state makes every constraint hold vacuously, reported at error severity because it MASKS violations rather than merely failing to prove one.',
  pinnedConfig:
    "The pinned run configuration is a gate only inside a boundary: a CI job that checks a fresh clone, with `symspec.config.json` under code-owner review. There the config is read from one place, `symspec.config.json` at the toplevel `git rev-parse --show-toplevel` prints for the document's real directory (symlinks resolved), asked with `safe.bareRepository=explicit` so a committed directory laid out as a bare repository is refused as ERR_CONFIG_INVALID rather than taken for a toplevel (git 2.38 or later honors that setting; an older git ignores it), nothing is searched, so a config committed beside the document is not read, and `data.run.config` reports `{path, source}` for the job to assert (`source` is `toplevel` and `path` is its checkout's config). Outside that boundary it is a disclosure, not a guard: a local agent that can write `.git/`, pass `--config` or set `SYMSPEC_CONFIG` can change which config a local run reads, and that run names what it read and why in `data.run.config`. A run below any pin is demoted `run-weakened`, so a config can only push `verified` toward false.",
  // Ruling R30 (S3-042) replaces the frozen clause "(committed via ... , or waived)": an opposition
  // candidate is triage, never waivable. Ruling R51 (S3-046) appends the content-hash sentence as the
  // last sentence of this claim, word for word.
  coverageDemotion:
    '`data.verified` is a COVERAGE claim about the whole document, not a verdict on it: it is true only when every requirement that COULD be cross-compared was (each was asserted together with a peer it shares vocabulary with, in a context group the solver decided — sharing a word is not a comparison), no two requirements demand opposite things of one response (an action and its negation, or two contrary actions such as open and close) under guards the solver never asserted together, every opposition candidate has been triaged (committed via `symspec antonym` / `symspec glossary`), no committed glossary entry names two contraries as one action, no solver call returned unknown, a decide-tier comparison actually ran, and the run itself was not weakened (the TEST stub embedder demotes, disclosed as `data.run.embedder`, and so does a `--semantic-threshold` above its default, disclosed as `data.run.semanticThreshold`). Two things it therefore does NOT mean. It does not account for proven findings: a document with a proven FND_CONTRADICTION reports `verified: true` and exits 1, because "I compared enough to certify" and "the spec is correct" are different claims and the exit codes are what keep them apart. And a document with fewer than two requirements is vacuously verified — there is no peer to share vocabulary with, so the absence of any cross-comparison is disclosed in `data.coverage.pairsCheckedNote` and `data.residualRisk` rather than as a demotion that could never be discharged. Propose-only findings and coverage statistics can only demote verified, never promote it. Each demotion is listed in `data.coverage.demotions` with the concrete command that discharges it, or the reads that inform the rewrite it needs, so an agent can iterate: `check --strict` (exit 3 on demotion) -> apply the listed ops or rewrite the named requirements -> re-check -> exit 0. A waiver\'s content hash binds the text it was reviewed on, not the reviewer: any writer can mint a waiver whose hash matches, so a scoped waiver of a wording or structural finding records that the current text was accepted, not who accepted it.',
}

describe('the scope corpus is pinned, claim by claim', () => {
  it('carries all nine claims', () => {
    // A NUMBER, so adding or dropping a claim is a visible edit in review rather than a
    // silently shorter disclosure.
    expect(SCOPE_KEYS).toHaveLength(9)
    expect(Object.keys(SCOPE).sort()).toEqual([...SCOPE_KEYS].sort())
  })

  // Ruling R30 (S3-042) replaces the pinned "or waived" in FROZEN.coverageDemotion; ruling R51
  // (S3-046) appends the content-hash sentence to it.
  it('[S3-042] matches the frozen corpus VERBATIM, claim by claim', () => {
    // `pinnedConfig` is compared by [RH-009] below, the ruling that reworded it.
    for (const key of SCOPE_KEYS.filter((k) => k !== 'pinnedConfig')) {
      expect(SCOPE[key], `${key} was reworded`).toBe(FROZEN[key])
    }
  })

  /**
   * Ruling RH-R3. No check tier reads the intent or the policy in this release, so putting
   * them "under code-owner review" as part of the gate's boundary told a reader they guard
   * something. The claim keeps the config, whose pins ARE enforced (run-weakened), and drops
   * the anchors; it is still compared byte for byte.
   */
  it('[RH-009] the pinned-config claim puts the config, and nothing no tier reads, under code-owner review', () => {
    expect(SCOPE.pinnedConfig, 'pinnedConfig was reworded').toBe(FROZEN.pinnedConfig)
    expect(SCOPE.pinnedConfig).toContain('`symspec.config.json` under code-owner review')
    expect(SCOPE.pinnedConfig).not.toContain('intent and policy files')
  })

  /**
   * The phrases the disclosure exists to say. Asserted independently of the byte-diff
   * above, because a lockstep edit to both places passes that one and this one still
   * fails — and these are the phrases whose disappearance changes what a reader concludes.
   */
  it('preserves the phrases the disclosure exists to say', () => {
    expect(SCOPE.soundness).toContain('sound modulo atomization')
    expect(SCOPE.silence).toContain('silence is not a consistency certificate')
    expect(SCOPE.overUnification).toContain('over-unification')
    expect(SCOPE.contextualAmbiguityNotChecked).toContain('not decided by symspec')
    expect(SCOPE.semanticProposeOnly).toContain('propose-only assist')
    expect(SCOPE.numericChecked).toContain('LIA/LRA')
    // Spec 007 AC-2-5/2-6: a bound is compared only within one role and one dimension, and
    // the pair it keeps apart is DISCLOSED rather than dropped. The pre-role wording claimed
    // every jointly unsatisfiable pair on one quantity key is proved, which a deadline
    // against a duration now is not, so it is asserted ABSENT.
    expect(SCOPE.numericChecked).toContain('FND_NUMERIC_UNCOMPARED')
    expect(SCOPE.numericChecked).toContain('in one role and one dimension')
    expect(SCOPE.numericChecked).not.toContain('per-system quantity (unit-normalized) are reported')
    // The decide key strips a guard copula and de-inflects the leading verb, so "nothing
    // beyond leading articles" was false; and a committed table can over-unify too.
    expect(SCOPE.overUnification).toContain('a single copula in a trigger or precondition')
    expect(SCOPE.overUnification).toContain('committed vocabulary entry')
    expect(SCOPE.overUnification).not.toContain('beyond leading articles)')
    expect(SCOPE.coverageDemotion).toContain('demote verified, never promote')
    // Spec 007 Story 3: the claim must say that sharing vocabulary is not a comparison, and
    // that a weakened run cannot certify — and must not keep the old, looser wording.
    expect(SCOPE.coverageDemotion).toContain('sharing a word is not a comparison')
    expect(SCOPE.coverageDemotion).toContain('data.run.embedder')
    expect(SCOPE.coverageDemotion).not.toContain('each participates in a comparison with a peer')
    // The reachability tier's claim has to say what it is ABOUT, not only that it proves:
    // it is sound over the DECLARED MODEL, so a mis-declared effect yields a valid proof of
    // the wrong thing. A disclosure that stated only the strength would be the reassuring
    // half of the truth.
    expect(SCOPE.reachabilityModelScoped).toContain('EVERY reachable state')
    expect(SCOPE.reachabilityModelScoped).toContain('independently re-verified')
    expect(SCOPE.reachabilityModelScoped).toContain('STATE MODEL you declared')
    expect(SCOPE.reachabilityModelScoped).toContain('sound proof of the wrong thing')
    expect(SCOPE.reachabilityModelScoped).toContain('demotes verified')
    expect(SCOPE.reachabilityModelScoped).toContain('MASKS violations')
    // Spec 007 S11: the pinned config is a gate only inside the CI-on-a-fresh-clone boundary,
    // and a local run that reads another config discloses it. The claim must not promise that a
    // config beside the document can never be read, which a local `.git/` edit can arrange.
    expect(SCOPE.pinnedConfig).toContain('a fresh clone')
    expect(SCOPE.pinnedConfig).toContain('a disclosure, not a guard')
    expect(SCOPE.pinnedConfig).toContain('data.run.config')
    expect(SCOPE.pinnedConfig).not.toContain('never read')
    // A committed bare-repository layout is the one repository committed content can hold.
    expect(SCOPE.pinnedConfig).toContain('safe.bareRepository=explicit')
  })

  it('renders as separate paragraphs in reading order', () => {
    const paragraphs = scopeParagraphs()
    expect(paragraphs).toHaveLength(9)
    expect(paragraphs[0]).toBe(SCOPE.soundness)
    expect(paragraphs[1]).toBe(SCOPE.silence)
    // The demotion-only rule stays LAST: it is the claim that ties `verified` to every
    // other one, so it only reads correctly after them.
    expect(paragraphs[8]).toBe(SCOPE.coverageDemotion)
  })

  it('does NOT ship a pre-joined blob', () => {
    // v4's `SCOPE.text` is deliberately absent: a joined paragraph can fall out
    // of sync with its own parts, and neither consumer here wants it.
    expect('text' in SCOPE).toBe(false)
  })

  it('names the two claims a thin-pointer surface must not drop', () => {
    // soundness (a reported conflict is real) and silence (its absence is not a proof)
    // are the two whose omission changes what an agent CONCLUDES.
    expect(SCOPE_ESSENTIAL).toEqual([SCOPE.soundness, SCOPE.silence])
  })
})

// ---------------------------------------------------------------------------
// S3 (spec 007 AC-5-6): an opposition candidate is not waivable, and a hash binds text
// ---------------------------------------------------------------------------

describe('[S3-042][S3-046] the scope says what a waiver can and cannot do', () => {
  it('[S3-042] coverageDemotion no longer counts a waived opposition candidate as triaged', () => {
    // NEGATIVE guard: the stale clause is what an agent reads as "waive it to verify".
    expect(SCOPE.coverageDemotion).not.toContain('or waived')
    for (const paragraph of scopeParagraphs()) expect(paragraph).not.toContain('or waived')
  })

  it('[S3-046] the published scope says a content hash binds the text, not the reviewer', () => {
    const sentences = scopeParagraphs().flatMap((p) => p.split(/(?<=[.!?])\s+/))
    const binding = sentences.filter(
      (s) =>
        /content hash/i.test(s) &&
        /\bnot\b[^.]*\b(?:the reviewer|who reviewed|reviewer)\b/i.test(s) &&
        /\btext\b/i.test(s),
    )
    expect(
      binding,
      'no scope sentence says a content hash binds the text, not the reviewer',
    ).not.toEqual([])
  })
})
