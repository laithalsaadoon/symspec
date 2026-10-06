/**
 * THE HONEST-SCOPE CORPUS — what symspec guarantees, and what it does not.
 *
 * ## Why every word is pinned
 *
 * These sentences are the LOAD-BEARING HONESTY of the whole tool. "Silence is not a
 * consistency certificate" is the claim that keeps a clean `check` from being read as a
 * proof, and a paraphrase of it that drifted toward reassurance would be the single most
 * damaging edit anyone could make to this repo.
 *
 * `scope.test.ts` pins every claim verbatim against a frozen copy, so rewording one is a
 * deliberate two-place edit that shows up as a diff — never a silent softening.
 *
 * ## One claim per TIER that can be believed
 *
 * A tier that reaches a verdict owes the reader its boundary. The pairwise formal tier and
 * the unbounded reachability tier make DIFFERENT claims — the first about requirements as
 * atomized, the second about a state model a human declared — and the second is the
 * stronger claim, which is exactly why its limits have to be stated here rather than left
 * to whoever reads the `FND_REACHABILITY_*` descriptions. A tier whose guarantee is
 * documented only in its own finding codes is a guarantee an agent learns AFTER trusting it.
 *
 * ## Why this module owns the corpus
 *
 * The two agent-facing surfaces — the installed skill body and the generated `AGENTS.md`
 * — both have to quote the disclosure, and they must quote it from a module inside the
 * package they ship with.
 *
 * ## No pre-joined blob
 *
 * There is deliberately no single string holding every claim at once. A joined paragraph is
 * worse than the parts for every consumer: an agent switching on a specific claim wants the
 * named field, and a rendered surface wants the claims as separate quoted paragraphs.
 * {@link scopeParagraphs} produces the latter on demand, so nothing needs a constant that
 * could fall out of sync with its own parts.
 */

/**
 * The honest-scope claims, each a named field so an agent can branch on the one it cares
 * about rather than grepping a paragraph.
 *
 * The order is the order they are worth reading: what the pairwise formal tier proves, what
 * its silence does NOT mean, the one false-positive risk, the not-decided boundaries, what
 * the unbounded reachability tier proves and about WHAT, the boundary inside which a pinned
 * config is a gate, and finally the demotion-only rule
 * that ties `verified` to all of it.
 */
export const SCOPE = {
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
  coverageDemotion:
    '`data.verified` is a COVERAGE claim about the whole document, not a verdict on it: it is true only when every requirement that COULD be cross-compared was (each was asserted together with a peer it shares vocabulary with, in a context group the solver decided — sharing a word is not a comparison), no two requirements demand opposite things of one response (an action and its negation, or two contrary actions such as open and close) under guards the solver never asserted together, every opposition candidate has been triaged (committed via `symspec antonym` / `symspec glossary`), no committed glossary entry names two contraries as one action, no solver call returned unknown, a decide-tier comparison actually ran, and the run itself was not weakened (the TEST stub embedder demotes, disclosed as `data.run.embedder`, and so does a `--semantic-threshold` above its default, disclosed as `data.run.semanticThreshold`). Two things it therefore does NOT mean. It does not account for proven findings: a document with a proven FND_CONTRADICTION reports `verified: true` and exits 1, because "I compared enough to certify" and "the spec is correct" are different claims and the exit codes are what keep them apart. And a document with fewer than two requirements is vacuously verified — there is no peer to share vocabulary with, so the absence of any cross-comparison is disclosed in `data.coverage.pairsCheckedNote` and `data.residualRisk` rather than as a demotion that could never be discharged. Propose-only findings and coverage statistics can only demote verified, never promote it. Each demotion is listed in `data.coverage.demotions` with the concrete command that discharges it, or the reads that inform the rewrite it needs, so an agent can iterate: `check --strict` (exit 3 on demotion) -> apply the listed ops or rewrite the named requirements -> re-check -> exit 0. A waiver\'s content hash binds the text it was reviewed on, not the reviewer: any writer can mint a waiver whose hash matches, so a scoped waiver of a wording or structural finding records that the current text was accepted, not who accepted it.',
} as const

/** The claim keys, for a surface that wants to iterate rather than name them. */
export const SCOPE_KEYS = [
  'soundness',
  'silence',
  'overUnification',
  'contextualAmbiguityNotChecked',
  'semanticProposeOnly',
  'numericChecked',
  'reachabilityModelScoped',
  'pinnedConfig',
  'coverageDemotion',
] as const satisfies readonly (keyof typeof SCOPE)[]

/**
 * The claims as separate paragraphs, in reading order — what a Markdown surface renders
 * as consecutive blockquotes.
 *
 * A FUNCTION returning an array rather than a pre-joined constant, so the rendered
 * surfaces cannot drift from the named fields the way v4's `SCOPE.text` could.
 */
export const scopeParagraphs = (): readonly string[] => SCOPE_KEYS.map((key) => SCOPE[key])

/**
 * The two claims a THIN-POINTER surface must carry even when it carries nothing else.
 *
 * The installed skill body is deliberately short (the codegraph lesson: a skill that
 * duplicates the docs drifts from them), so it has to choose. These two are the choice,
 * because they are the ones whose absence changes what an agent CONCLUDES: `soundness`
 * says a reported conflict is real, and `silence` says the absence of one is not a
 * proof. Every other claim refines a decision an agent has already made correctly if it
 * has these two.
 */
export const SCOPE_ESSENTIAL = [SCOPE.soundness, SCOPE.silence] as const
