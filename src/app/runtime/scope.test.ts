/**
 * The honest-scope corpus, pinned claim by claim against a frozen snapshot.
 *
 * These eight sentences are the load-bearing honesty of the tool: "silence is not a
 * consistency certificate" is what stops a clean `check` from being read as a proof.
 *
 * The direction of the risk is what shapes this file. The dangerous edit to a disclosure
 * is not a typo, it is a paraphrase that drifts toward reassurance — and a softened claim
 * still reads fine, so review alone does not catch it. Byte-equality does, which is why
 * {@link FROZEN} spells all eight out in full rather than sampling them: changing a
 * disclosure has to be a deliberate two-place edit that shows up as a diff on this file.
 *
 * The phrase-level assertions below are kept SEPARATE from the byte-diff, because they
 * survive a lockstep edit to both places. Those are the phrases whose disappearance
 * matters however the two copies agree.
 */

import { describe, expect, it } from 'vitest'
import { SCOPE, SCOPE_ESSENTIAL, SCOPE_KEYS, scopeParagraphs } from './scope.ts'

/** The eight claims, verbatim. A diff here is the review signal. */
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
  coverageDemotion:
    '`data.verified` is a COVERAGE claim about the whole document, not a verdict on it: it is true only when every requirement that COULD be cross-compared was (each was asserted together with a peer it shares vocabulary with, in a context group the solver decided — sharing a word is not a comparison), no two requirements demand opposite things of one response (an action and its negation, or two contrary actions such as open and close) under guards the solver never asserted together, every opposition candidate has been triaged (committed via `symspec antonym` / `symspec glossary`, or waived), no committed glossary entry names two contraries as one action, no solver call returned unknown, a decide-tier comparison actually ran, and the run itself was not weakened (the TEST stub embedder demotes, disclosed as `data.run.embedder`, and so does a `--semantic-threshold` above its default, disclosed as `data.run.semanticThreshold`). Two things it therefore does NOT mean. It does not account for proven findings: a document with a proven FND_CONTRADICTION reports `verified: true` and exits 1, because "I compared enough to certify" and "the spec is correct" are different claims and the exit codes are what keep them apart. And a document with fewer than two requirements is vacuously verified — there is no peer to share vocabulary with, so the absence of any cross-comparison is disclosed in `data.coverage.pairsCheckedNote` and `data.residualRisk` rather than as a demotion that could never be discharged. Propose-only findings and coverage statistics can only demote verified, never promote it. Each demotion is listed in `data.coverage.demotions` with the concrete command that discharges it, or the reads that inform the rewrite it needs, so an agent can iterate: `check --strict` (exit 3 on demotion) -> apply the listed ops or rewrite the named requirements -> re-check -> exit 0.',
}

describe('the scope corpus is pinned, claim by claim', () => {
  it('carries all eight claims', () => {
    // A NUMBER, so adding or dropping a claim is a visible edit in review rather than a
    // silently shorter disclosure.
    expect(SCOPE_KEYS).toHaveLength(8)
    expect(Object.keys(SCOPE).sort()).toEqual([...SCOPE_KEYS].sort())
  })

  it('matches the frozen corpus VERBATIM, claim by claim', () => {
    for (const key of SCOPE_KEYS) {
      expect(SCOPE[key], `${key} was reworded`).toBe(FROZEN[key])
    }
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
  })

  it('renders as separate paragraphs in reading order', () => {
    const paragraphs = scopeParagraphs()
    expect(paragraphs).toHaveLength(8)
    expect(paragraphs[0]).toBe(SCOPE.soundness)
    expect(paragraphs[1]).toBe(SCOPE.silence)
    // The demotion-only rule stays LAST: it is the claim that ties `verified` to every
    // other one, so it only reads correctly after them.
    expect(paragraphs[7]).toBe(SCOPE.coverageDemotion)
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
