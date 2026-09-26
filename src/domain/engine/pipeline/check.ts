/**
 * The default `check` command pipeline — AC-6-8 (wiring) + AC-5-5 (no-Lean guard).
 *
 * This module wires ALL tiers into one report — the load-bearing contract that
 * `symspec check` returns structural, lint, and formal findings together:
 *
 *   Tier 0  structural   — `core/analyze.ts` (dangling refs, missing slots,
 *                          cycles, orphans), mapped to `FND_*` via the
 *                          single-source bridges in `formal/codes.ts`.
 *   Lint    free + GtWR  — exact duplicates via the solver orchestrator
 *                          (`solvers/index.ts`) and the ~24 GtWR T1 rules
 *                          (`lint/gtwr.ts`, per-statement + set-level).
 *   Formal  SMT (Tier S) — contradiction / subsumption / redundancy / vacuity
 *                          / completeness-heuristic / similar-ununified /
 *                          needs-review over the AC-3-7 gate's INCLUDED subset
 *                          only, each finding carrying AC-4-6 `evidence`.
 *
 * AC-5-5 invariant: nothing in this module (or its import graph) touches the
 * Lean tier. `certify` is a separate command; `check` succeeds on a system
 * with no Lean toolchain. The import list below is the proof — no
 * `../certify/*` import exists.
 *
 * ## Pipeline order is forced (AC-3-7, research-ears-incose.md §4)
 *
 * parse → lint → symbolize → solve. The {@link gateRequirements} partition
 * runs BEFORE the formal tier, and the formal tier only ever sees
 * `included` — an `error`-severity surface check excludes a statement from
 * symbolization, so the SMT layer never receives unsound input. Excluded
 * statements are reported in {@link CheckReport.excluded} (their blocking
 * findings already appear in the lint findings; they are not double-counted).
 *
 * ## Free-tier ambiguity findings are superseded by GtWR
 *
 * `runSolvers` also emits a 33-phrase weasel `Ambiguity` finding, but the GtWR
 * rules (AC-3-2: R7 vague / R8 escape / R9 open-ended …) cover the same
 * lexicons WITH stable codes, character spans, and rewrite suggestions.
 * Reporting both would duplicate every weasel hit, so this wiring keeps the
 * GtWR finding and drops the free-tier `Ambiguity` projection (the free-tier
 * detector still runs for its report side-effects).
 *
 * ## Stored negation view
 *
 * The parse tier extracts response negation as a flag (AC-2-4), and a stored
 * `Requirement` now persists it (`negated`, C1 fix): the schema flag is the
 * source of truth. So {@link toEncodable} threads the stored `negated` flag
 * straight into `EncodableRequirement.negated`. As a FALLBACK for
 * hand-authored documents that baked negation into the response text, it also
 * runs a conservative leading-negator scan ("not …", "never …", "do/does
 * not …") and strips it — but the schema flag wins: if `negated` is already
 * set, the stored text is trusted as-is (positive) and no scan is applied.
 * "not only …" is not a negator here, exactly as it is not one in the parse's
 * `extractNegation`: "shall not only X but also Y" obliges both halves (spec 007
 * AC-2-3), and the parse stores it `negated: false` with "not only" kept in the
 * response, which this scan must not then re-negate.
 * Either way the atomizer receives positive text + a polarity flag, restoring
 * the same atom-polarity discipline (same atom, opposite polarity) the parse
 * tier established.
 *
 * ## One atomizer, one requirement population, both tiers (AC-2-7)
 *
 * This module is where the propositional and bounded-temporal tiers are wired,
 * and it is therefore where they used to be wired DIFFERENTLY. Two fixes here:
 *
 *   - **One atomizer instance.** The `makeAtomize(glossary, antonyms)` closure
 *     (now owned by `formal/atomize.ts`) is built ONCE per run and handed to BOTH
 *     `encode` and `earsToTemporal`. The temporal tier previously received none —
 *     `earsToTemporal(req)` took no glossary or antonym parameter at all — so
 *     `--temporal` was structurally blind to every committed glossary alias and
 *     antonym pair. Passing the same instance, plus the same contrary axioms
 *     (spec 007 AC-2-1), is what makes `G(grant_x)` vs `G(t → F revoke_x)`
 *     provable once `antonym add grant revoke` is committed.
 *   - **One requirement population.** Both tiers now score the AC-3-7 gate's
 *     INCLUDED subset. The temporal tier previously scored raw `reqs`, so the two
 *     error-severity tiers disagreed about which document they were checking, and
 *     `FND_EXCLUDED_FROM_FORMAL` ("the solver never saw this") was false about
 *     one of them. The full rationale is at the temporal call site in
 *     {@link runCheck}.
 */

import { analyze, type Finding } from '../core/analyze.ts'
import type { Doc } from '../core/doc.ts'
import { listRequirements } from '../core/doc.ts'
import type { Requirement, Waiver } from '../core/schema.ts'
import { shellQuoted } from '../core/shell-word.ts'
import { detectAmbiguity } from '../formal/ambiguity.ts'
import type { AntonymEntry } from '../formal/antonyms.ts'
import {
  antonymIndexOf,
  areContrary,
  contraryPairs,
  glossaryContraries,
  glossaryIndex,
  makeAtomize,
  makeDigitSeparatorFoldAtomize,
  normalize,
  type Opposition,
  termIndex,
} from '../formal/atomize.ts'
import { getContext } from '../formal/backend.ts'
import { type SolverBounds, SolverBudget } from '../formal/budget.ts'
import { type FndCode, structuralKindToFndCode } from '../formal/codes.ts'
import {
  analyzeContradictions,
  type CheckedContextGroup,
  contextAtomsOf,
  type GroupSolverCheck,
  liveIn,
  planGroups,
} from '../formal/contradiction.ts'
import {
  excludedFromFormalFinding,
  noPairsCheckedFinding,
  relationalUncheckedFinding,
} from '../formal/coverage.ts'
import type { Embedder } from '../formal/embed.ts'
import {
  type Atomize,
  type EncodableRequirement,
  type EncodedRequirement,
  encode,
  toEncodable,
} from '../formal/encode.ts'
import { attachEvidenceToAll, type Evidence } from '../formal/finding.ts'
import { buildSimilarityGraph, type GraphRequirement } from '../formal/graph.ts'
import { checkCompleteness } from '../formal/incomplete.ts'
import {
  findNeedsReview,
  type GroupChecker,
  SolverBudgetExceededError,
} from '../formal/needs-review.ts'
import { findNumberSpellingCandidates } from '../formal/number-spelling.ts'
import {
  type NumericPredicate,
  requirementBounds,
  responseOccurrences,
  unreadQuantities,
} from '../formal/numeric.ts'
import {
  analyzeNumericBounds,
  disclosureOfUnreadQuantities,
} from '../formal/numeric-contradiction.ts'
import { findQuantityAliasCandidates, guardKeyOf } from '../formal/quantity-alias.ts'
import { findRelationalUnchecked } from '../formal/relational.ts'
import {
  DEFAULT_SEMANTIC_THRESHOLD,
  findOppositionCandidates,
  findSimilarSemantic,
  type GlossaryMerge,
  literalsConflict,
} from '../formal/semantic.ts'
import { findSimilarUnunified } from '../formal/similar.ts'
import { checkSubsumption } from '../formal/subsumption.ts'
import { findTemporalContradictions, type TemporalSolverCheck } from '../formal/temporal.ts'
import { earsToTemporal, G, tAnd, tAtom, tNot } from '../formal/temporal-patterns.ts'
import { checkVacuity } from '../formal/vacuity.ts'
import { checkGtWRules, checkGtWRulesSet, lintSentenceOf } from '../lint/gtwr.ts'
import { type FormalTierResult, runSolvers } from '../solvers/index.ts'
import { asView } from '../solvers/types.ts'
import { type Exclusion, excludedIds, gateRequirements, namesExactly } from './gate.ts'

/** Which pipeline tier produced a finding. */
export type CheckTier = 'structural' | 'lint' | 'formal'

/** Shared severity scale across every tier (matches GtWR + FND semantics). */
export type CheckSeverity = 'error' | 'warn' | 'info'

/**
 * One normalized finding in the single `findings[]` AC-6-8 mandates. Every
 * tier's native shape projects into this: a stable `code` (`FND_*` or
 * `GTWR_*`), the severity the exit-code contract (AC-6-2b) keys on, the
 * requirement ids involved, and the optional per-tier extras (span +
 * suggestion from lint, `evidence` from the formal tier per AC-4-6).
 */
export interface CheckFinding {
  code: string
  severity: CheckSeverity
  tier: CheckTier
  requirementIds: string[]
  message: string
  /** Character span in the rendered sentence (lint tier only). */
  span?: [number, number]
  /** Mechanical rewrite suggestion (lint tier only). */
  suggestion?: string
  /** AC-4-6 machine-checkable evidence (formal tier only). */
  evidence?: Evidence
}

/** Options threaded through to the tiers. */
export interface CheckOptions {
  /** Pairwise lexical-similarity threshold override (free tier + AC-4-12). */
  similarityThreshold?: number
  /**
   * Per-solver timeout in ms (AC-4-7, `--timeout-ms`). Default 2000. Applied via
   * `solver.set('timeout', …)` to EVERY solver every tier constructs (AC-1-7):
   * contradiction, subsumption, vacuity, incomplete, numeric, temporal, and
   * needs-review. A solver that hits it returns `unknown`, which each tier
   * already handles conservatively, so the timeout can only withhold a finding.
   */
  timeoutMs?: number
  /**
   * Whole-run solver budget in ms (`--solver-budget-ms`). A wall-clock deadline
   * spanning EVERY solver tier (AC-1-7), not one tier: the pipeline builds one
   * {@link SolverBudget} and each tier consults it before each unit of work.
   *
   * A tier that stops early records a truncation, which becomes a
   * `solver-budget-exhausted` {@link CoverageDemotion} — so a truncated run can
   * never report `verified: true`. The stricter `ERR_SOLVER_TIMEOUT` abort stays
   * exactly where AC-4-7 put it: `findNeedsReview` throwing when the budget dies
   * inside its own group loop.
   */
  solverBudgetMs?: number
  /**
   * Opt-in semantic paraphrase pass (AC-9-5, `--semantic`). When provided, an
   * embedder proposes `FND_SIMILAR_SEMANTIC` glossary merges for high-cosine
   * unmerged response pairs. Off by default so the base `check` path never
   * loads the embedding model. Propose-only — never a verdict.
   */
  semantic?: {
    embedder: Embedder
    /** Cosine threshold (default `DEFAULT_SEMANTIC_THRESHOLD`, `--semantic-threshold`). */
    threshold?: number
    /**
     * True when `embedder` is the deterministic TEST stub (AC-3-5). The stub's cosines are
     * a hash, so the opposition detector — part of the certification surface — cannot find
     * what the pinned model would: the run is WEAKENED, demotes with `run-weakened`, and is
     * disclosed as `run.embedder: 'stub'`. The caller that loaded the embedder knows which
     * one it loaded, so it says so here; the engine never infers it.
     */
    stub?: boolean
  }
  /**
   * Opt-in bounded temporal tier (AC-33-2, `--temporal`). When set, EARS
   * requirements map to LTL (Dwyer/FRET) and a bounded LTL→SMT check proves
   * temporal contradictions (FND_TEMPORAL_CONTRADICTION). Off by default. The
   * `bound` is the finite trace length (default 10); the tier is sound-for-UNSAT
   * (a `sat` result at the bound is not a consistency certificate).
   */
  temporal?: {
    /** Trace bound k for the bounded encoding (default 10). */
    bound?: number
  }
  /**
   * Strict coverage gate (wishlist #4, `--strict`). When true, an INCONCLUSIVE
   * run — one where the formal tier compared nothing across requirements
   * ({@link CheckReport.verified} is `false`) — escalates from a silent clean
   * exit to a gate failure ({@link CheckReport.strictGate} `'fail'` →
   * `EXIT_INCONCLUSIVE`). Off by default so the base contract is unchanged: an
   * agent must OPT IN to "I couldn't verify this is a build failure." Encodes the
   * manifest doctrine that silence is not a consistency certificate.
   */
  strict?: boolean
  /**
   * Strict unmatched-atom gate (wishlist #4, `--fail-on-unmatched <n>`). When
   * set, a run whose {@link ResidualRisk.unmatchedAtoms} strictly EXCEEDS this
   * threshold fails the gate ({@link CheckReport.strictGate} `'fail'`). An
   * unmatched atom (owned by exactly one requirement) can never form a candidate
   * pair, so it went uncompared; a high count means broad coverage holes.
   * Independent of {@link strict} — either gate tripping fails the run. `0` fails
   * on ANY unmatched atom.
   */
  failOnUnmatched?: number
  /**
   * Injectable per-group solver check for the AC-4-7 needs-review tier — the same
   * seam `findNeedsReview` exposes, threaded one level up.
   *
   * It lives on the PIPELINE's options because the verdict consequences of an
   * undecided group are computed here, not in the tier: an `unknown` group decides
   * whether `verified` demotes with `inconclusive-group`, whether the run still
   * counts as having made a decide-tier comparison, and whether the
   * `FND_NO_PAIRS_CHECKED` disclaimer fires. A test cannot reach the `unknown`
   * branch through {@link timeoutMs}: z3 reads `timeout: 0` as "no timeout", and
   * any document small enough to assert on is decided in microseconds at `1`, so
   * the outcome would be a race rather than a fixture.
   */
  needsReviewCheckGroup?: GroupChecker
  /**
   * Injectable solver call for the contradiction tier's enumeration loop — the seam
   * `findContradictions` exposes, threaded one level up for the same reason as
   * {@link needsReviewCheckGroup}: the verdict consequence of an `unknown` part-way
   * through a group (the `solver-unknown` demotion, AC-3-4) is computed here, and no
   * `timeoutMs` can put an `unknown` in ONE group without also putting one in the
   * needs-review tier's separate solve, whose own demotion would then hide this one.
   */
  contradictionCheck?: GroupSolverCheck
  /**
   * Injectable joint check for the bounded temporal tier — the seam
   * `findTemporalContradictions` exposes, threaded one level up for the same reason as
   * {@link contradictionCheck}: the verdict consequence of a temporal `unknown` (the
   * `solver-unknown` demotion, AC-3-4) is computed here, and {@link timeoutMs} cannot
   * produce one deterministically. Ignored unless {@link temporal} is set.
   */
  temporalCheck?: TemporalSolverCheck
}

/**
 * Rolled-up residual-risk summary (wishlist #5b): the one-glance surface of what
 * `check` did NOT verify. The tool's honest scope is "silence is not a
 * consistency certificate", and the residual risk lives in the info-tier
 * findings + counters that a careless reader skims past. This object hoists those
 * numbers to the top level so over-trusting silence is harder: when every count
 * is zero AND `pairsChecked > 0`, the run is genuinely clean; any nonzero count
 * (or `noPairsChecked`) names an axis the formal tier could not close.
 *
 * All counts are derived from the SAME kept (post-waiver) finding set the report
 * publishes, so a waived residual-risk finding correctly drops out of the summary
 * too — a reviewed baseline reads as lower residual risk, not silent neglect.
 */
export interface ResidualRisk {
  /**
   * Count of kept `FND_SIMILAR_UNUNIFIED` findings — response pairs that read as
   * near-synonyms but stayed on distinct atoms, so a real conflict between them
   * could hide (AC-4-12). Each is an unverified paraphrase pair.
   */
  similarUnunifiedPairs: number
  /**
   * Count of kept `FND_SIMILAR_SEMANTIC` findings — high-cosine paraphrase merge
   * proposals from the opt-in `--semantic` pass. 0 when `--semantic` is off.
   */
  semanticSuggestions: number
  /**
   * How many candidate pairs the pairwise tier compared (mirrors
   * {@link CheckReport.pairsChecked} for one-glance reading).
   */
  pairsChecked: number
  /**
   * True when {@link pairsChecked} is 0 — the formal tier compared nothing across
   * requirements. The boolean form so a reader does not have to interpret the
   * counter. Pairs with the `FND_NO_PAIRS_CHECKED` info finding.
   */
  noPairsChecked: boolean
  /**
   * How many requirements the AC-3-7 gate excluded, so the formal tier never saw
   * them (mirrors `excluded.length`). Their blocking findings appear in the lint
   * tier; this counter surfaces the coverage hole the exclusion left behind.
   */
  excludedRequirements: number
  /**
   * How many atoms appear in exactly ONE of the gate-included requirements — an
   * atom with no cross-requirement partner can never form a candidate pair, so it
   * went uncompared. Computed over the same encoded (included) atom roster the
   * formal tier built, so it costs nothing beyond a tally.
   */
  unmatchedAtoms: number
  /**
   * How many gate-included requirements the decide tier never actually
   * constrained against a peer — never co-live, in a decided context group, with a
   * requirement they share an atom with (AC-3-1). Mirrors `coverage.requirements[].participates`
   * for one-glance reading; any nonzero count demotes {@link CheckReport.verified}.
   */
  uncoveredRequirements: number
}

/** One requirement's participation row in {@link CoverageReport}. */
export interface CoverageRequirementRow {
  id: string
  /**
   * True when this requirement was CO-LIVE with ≥1 other gate-included requirement it
   * shares an atom with, in a context group the contradiction solver decided — i.e. the
   * SMT conjunction genuinely asserted the two obligations together (AC-3-1) — or when a
   * decide-tier cross-requirement finding names it. Sharing an atom alone does not count:
   * two requirements whose guards no group asserts together were never compared, however
   * much vocabulary they share. A non-participating requirement was never cross-compared,
   * so its conflicts are invisible no matter what the rest of the document proves.
   */
  participates: boolean
  /** This requirement's singleton atoms (atoms no other requirement references). */
  unmatchedAtoms: string[]
  /** Actionable next step when `participates` is false. */
  suggestion?: string
}

/** Why `verified` was demoted, with the concrete discharging action. */
export interface CoverageDemotion {
  reason:
    | 'uncovered-requirement'
    | 'open-opposition-candidate'
    | 'no-decide-tier-comparison'
    | 'semantic-tier-skipped'
    // A requirement was dropped from the formal tier by an error-severity
    // lint/parse finding, so the solver never saw it — `verified` cannot cover
    // it. Discharged by fixing the blocking finding (rephrase), NOT by waiving.
    | 'excluded-from-formal'
    // Co-active opposed numeric bounds — same system, same guard, or both
    // unguarded — whose labels differ only by verb landed on distinct
    // quantity keys and were never compared, so a possible single-quantity
    // conflict went unexamined. Discharged by a `glossary add` alias (or waiving
    // if genuinely distinct quantities).
    | 'quantity-alias-candidate'
    // A shared guard carries numeric bounds alongside unmatched atoms — the
    // shape where aggregate/conservation or cross-quantity relational conflicts
    // hide, which symspec's pairwise numeric tier does not attempt. An honest
    // "not attempted" caveat so `verified` never outruns what was compared.
    | 'relational-reasoning-not-attempted'
    // Co-live bounds on one quantity key that the numeric tier neither proved nor
    // dismissed, because the verdict turns on a reading the sentences do not fix (a
    // deadline vs a duration, an absolute vs a difference temperature, two units no
    // conversion relates). Discharged by restating the bounds, or by a reviewed waiver.
    | 'numeric-bounds-uncompared'
    // AC-1-7: the whole-run `--solver-budget-ms` deadline expired and at least
    // one solver tier stopped before finishing its units of work. The run did
    // NOT compare everything it would otherwise have compared, so it cannot
    // certify. One demotion per truncated tier, naming the unrun unit count.
    // Discharged by raising `--solver-budget-ms` (or shrinking the document),
    // never by waiving: a suppressed disclosure is not a completed comparison.
    | 'solver-budget-exhausted'
    // AC-4-7: a per-group solver check returned `unknown` (undecidable at the
    // per-group `--timeout-ms`, or the timeout fired — the z3-solver API does not
    // distinguish them). That group's requirements were NOT decided, so `verified`
    // cannot cover them however many other pairs were compared. Discharged by
    // raising `--timeout-ms` and re-running, never by waiving the
    // `FND_NEEDS_REVIEW` disclosure: suppressing "I could not decide" does not
    // decide it.
    | 'inconclusive-group'
    // AC-3-4: a solver call INSIDE the contradiction enumeration (a group check or a
    // core-minimization re-check) or the temporal tier's joint check returned
    // `unknown`. The enumeration stops at an `unknown`, so any conflict after it in
    // that group was never looked for — even when an earlier conflict in the same group
    // was reported, and even when the needs-review tier's separate solve of the group
    // happened to finish. Recorded where the `unknown` happened, never inferred from
    // another tier. Discharged by raising `--timeout-ms`; there is no finding to waive.
    | 'solver-unknown'
    // AC-3-2: two requirements under one system demand responses that conflict as written —
    // the same response atom at opposite polarity, or two contraries (AC-2-1) both asserted —
    // and no context group makes both live — so the solver never
    // asserted them together and never asked whether they can hold at once. The
    // detect-and-demote bridge for a conflict whose reachability (can the two guards
    // co-occur?) this tier cannot decide. Not waivable: there is no finding behind it.
    | 'conditional-conflict-unchecked'
    // AC-3-5 / invariant I-1: the run itself was weakened — the semantic tier ran on the
    // deterministic TEST stub embedder, whose cosines are meaningless, so the opposition
    // detector could not find what the pinned model would; or it ran with a
    // `--semantic-threshold` above the default, so it proposed less. A statement about the
    // RUN, not the document: discharged by re-running without the weakening, never by waiving.
    | 'run-weakened'
    // AC-3-6: a kept FND_SIMILAR_SEMANTIC pair whose responses differ only in inflection or
    // number and would conflict as one thing: OPPOSITE polarity ("open the door" / "shall not
    // open the doors"), or both asserted on opposite sides of an antonym class ("open the door"
    // / "close the doors", contraries under AC-2-1). If they mean one thing it is a
    // contradiction on two atoms (or two keys) the solver cannot see. Discharged by the glossary
    // merge the finding proposes (it lands both on one atom at opposite polarity, or on one key
    // as contraries; it is withheld when every merge would alias a phrase to its own opposite
    // or split an atom the document already shares, and a rewrite is the route instead) or by
    // waiving the finding (declared distinct) — the finding is the triage record.
    | 'opposite-polarity-near-duplicate'
    // AC-2-4: two requirements write one phrase with numbers that differ only in a digit
    // separator (`1.5` / `1,5`, `1_500` / `1.500`), so they sit on two atoms and were never
    // compared. Whether they are one number turns on the decimal convention, which no closed
    // rule fixes, so the pair is demoted and never proved. Discharged by spelling the number
    // identically in both (one atom, compared by the solver) or by waiving the
    // FND_NUMBER_SPELLING_CANDIDATE finding for the pair when they are different numbers.
    | 'number-spelling-candidate'
    // A committed glossary entry names two CONTRARIES as one action ("open the door" with alias
    // "close the door"). With the antonym table's ¬(A ∧ B) that entry makes both actions
    // impossible, which no requirement is checked against, so the atomizer keeps each contrary
    // phrase on its own atom (where the axiom still relates it) and this demotes over every
    // requirement whose response the entry names. Discharged by removing the contrary alias.
    | 'contrary-glossary-alias'
  requirementIds: string[]
  /** The exact command (or rewrite guidance) that discharges this demotion. */
  action: string
}

/**
 * Per-requirement coverage detail (adversarial-eval hardening): the structured
 * answer to "what exactly did the decide tier NOT verify, and what do I do
 * about it?". This is the driving surface of the agent iteration loop —
 * `verified: false` is not a dead end but a work list: each {@link demotions}
 * entry names its discharging op (`antonym add` / `glossary add` / `waive` /
 * rewrite), and applying them then re-running `check` converges to
 * `verified: true` because every demotion reason is finitely dischargeable.
 *
 * Design principle (the demotion-only rule): propose-only findings and
 * coverage statistics may DEMOTE `verified` toward abstention, but can never
 * PROMOTE it — the dual of the propose/decide split. A fuzzy signal can raise
 * the alarm; only the deterministic decide tier can sound the all-clear.
 */
export interface CoverageReport {
  /** One row per gate-included requirement, ordered by id. */
  requirements: CoverageRequirementRow[]
  /** Count of kept (post-waiver) `FND_OPPOSITION_CANDIDATE` findings. */
  openOppositionCandidates: number
  /** Every reason `verified` is false, empty exactly when `verified` is true. */
  demotions: CoverageDemotion[]
  /**
   * How many requirements reached the formal (SMT) tier — the count the solver
   * actually encoded and could reason about. A first-class, one-glance answer to
   * "how much of the document did `check` formally see?" so a reader never has to
   * infer coverage from the absence of findings.
   */
  encoded: number
  /**
   * How many requirements the AC-3-7 gate excluded from the formal tier (an
   * error-severity lint/parse finding blocked their surface). Nonzero means
   * `verified` is demoted with an `excluded-from-formal` reason per requirement:
   * silence over a requirement the solver never saw is not a consistency
   * certificate. Fix the blocking finding (rephrase) to re-admit it; waiving the
   * finding suppresses the report line but does NOT restore formal coverage.
   */
  excluded: number
  /**
   * A plain-English interpretation of `pairsChecked`, so a low count is not
   * misread as "the tool barely looked". Requirements describing disjoint
   * transitions across different systems/triggers share no atom group and have
   * no same-context peer to conflict with — a singleton is not a coverage gap.
   */
  pairsCheckedNote: string
}

/** The complete `check` result the CLI wraps in its envelope (AC-6-2). */
export interface CheckReport {
  /** Every tier's findings, normalized and stably ordered. */
  findings: CheckFinding[]
  /** AC-3-7 exclusions: statements the formal tier never saw, with evidence. */
  excluded: Exclusion[]
  /**
   * How many candidate pairs the pairwise tier COMPARED (AC-8-3 counter): the
   * candidate pairs over gate-included requirements, minus the ones that tier
   * skipped before either implication solve (atom-disjoint, or carrying a
   * degenerate body). A skipped pair and a compared-but-inconclusive pair emit the
   * same empty output, so this counter is the only place a widening prune is
   * visible.
   *
   * Pairs a whole-run budget deadline cut are still counted, so this is a
   * comparison count only on a run that finished. Truncation is reported through
   * the `solver-budget-exhausted` demotion and its unrun-unit count instead,
   * which demotes `verified` rather than merely shrinking a statistic.
   */
  pairsChecked: number
  /**
   * How many findings were dropped by a committed waiver (wishlist #3). A
   * waived finding is removed from {@link findings} AND from {@link counts}, so
   * the exit gate honors the waiver too; this counter keeps the suppression
   * visible so a reader can tell a reviewed baseline from silent neglect.
   */
  waived: number
  /** Findings tallied by severity — the exit-code contract's input. */
  counts: { error: number; warn: number; info: number }
  /** Rolled-up residual-risk summary (wishlist #5b) — what was NOT verified. */
  residualRisk: ResidualRisk
  /** Per-requirement coverage + the actionable demotion list (agent loop). */
  coverage: CoverageReport
  /**
   * First-class "did the formal tier actually verify anything across
   * requirements?" flag (wishlist #5, hardened after the Run 3 adversarial
   * eval). `true` requires ALL of:
   *   (a) PARTICIPATION — every gate-included requirement was co-live, in a
   *       context group the solver decided, with a peer it shares ≥1 atom with
   *       (AC-3-1), so the SMT conjunction genuinely asserted it against that
   *       peer. This kills the eval's winning shape:
   *       dense distractor vocabulary buying one checked pair while the
   *       conflicting pair's atoms stayed singletons;
   *   (b) NO OPEN OPPOSITION CANDIDATES — every kept `FND_OPPOSITION_CANDIDATE`
   *       has been triaged (committed via `antonym add`/`glossary add`, or
   *       waived). An untriaged candidate is a possible conflict the decide
   *       tier cannot see, so certifying over it would be dishonest;
   *   (c) a decide-tier cross-requirement comparison actually happened
   *       (pairsChecked > 0 or a non-propose-only cross-requirement finding);
   *   (d) when ≥2 requirements exist, the semantic tier ran (an embedder was
   *       supplied) — the opposition detector is part of the certification
   *       surface, so skipping it demotes.
   * A spec with <2 requirements is vacuously verified. Every demotion is
   * enumerated with its discharging action in {@link CheckReport.coverage}.
   *
   * Demotion-only invariant: propose-only findings and coverage stats can only
   * push this flag toward `false` (abstention), never toward `true`.
   */
  verified: boolean
  /**
   * Outcome of the opt-in strict coverage gate (wishlist #4). `undefined` when
   * neither {@link CheckOptions.strict} nor {@link CheckOptions.failOnUnmatched}
   * was requested (the gate did not run). `'pass'` when a requested gate ran and
   * held; `'fail'` when it tripped (inconclusive under `--strict`, or
   * `unmatchedAtoms` over the `--fail-on-unmatched` threshold). The exit-code
   * mapping reads this to return `EXIT_INCONCLUSIVE` for a `'fail'` with no
   * error-severity finding.
   */
  strictGate?: 'pass' | 'fail'
  /**
   * What this run was made of, where it can weaken the verdict (spec 007 invariant I-1).
   * `embedder` is `'model'` when the semantic tier ran on a caller-supplied embedder,
   * `'stub'` when it ran on the deterministic TEST stub (which demotes with
   * `run-weakened`), and `'off'` when it did not run (which demotes with
   * `semantic-tier-skipped`). `semanticThreshold` is the cosine threshold the semantic tier
   * ran at, present exactly when it ran; above `DEFAULT_SEMANTIC_THRESHOLD` it demotes with
   * `run-weakened`.
   */
  run: RunDisclosure
}

/** See {@link CheckReport.run}. */
export interface RunDisclosure {
  readonly embedder: 'model' | 'stub' | 'off'
  readonly semanticThreshold?: number
}

/**
 * The formal-tier finding codes whose analysis inherently spans ≥2 requirements
 * — the "cross-requirement conflict" family. Grounded in `formal/codes.ts`
 * (Appendix B): the contradiction/subsumption/redundancy propositional checks,
 * the numeric and bounded-temporal conflict tiers, and the two similar-pair
 * reporters. Used to suppress the contradictory `FND_NO_PAIRS_CHECKED` info
 * finding (see {@link runCheck}). Every genuine cross-requirement finding also
 * names ≥2 ids, so the id-count predicate is the primary signal; this set is the
 * belt-and-suspenders guard for a degenerate core that minimized to one id.
 */
const CROSS_REQUIREMENT_FND_CODES: ReadonlySet<string> = new Set<FndCode>([
  'FND_CONTRADICTION',
  'FND_SUBSUMPTION',
  'FND_REDUNDANCY',
  'FND_NUMERIC_CONTRADICTION',
  'FND_TEMPORAL_CONTRADICTION',
  'FND_SIMILAR_UNUNIFIED',
  'FND_SIMILAR_SEMANTIC',
])

/**
 * Propose-only info codes: they SPAN two requirements (so they suppress the
 * `FND_NO_PAIRS_CHECKED` "nothing was compared" disclaimer — a comparison DID
 * happen) but they are NOT verdicts — each is an agent-confirmable SUGGESTION,
 * not a proven consistency result. So they must NOT count toward
 * {@link CheckReport.verified} (#5): a fuzzy cosine proposal is the opposite of
 * a verification, and letting one flip `verified` to `true` would quiet the
 * "silence is not a consistency certificate" signal that the `--strict` gate
 * (#4) rests on. This is the distinction the adversarial review surfaced:
 * "compared" (disclaimer) and "verified" (the boolean/gate) are different
 * claims, and only a DECIDE-tier finding establishes the latter.
 */
const PROPOSE_ONLY_FND_CODES: ReadonlySet<string> = new Set<FndCode>([
  'FND_SIMILAR_UNUNIFIED',
  'FND_SIMILAR_SEMANTIC',
  'FND_OPPOSITION_CANDIDATE',
  'FND_MISSING_TRACE_LINK',
  'FND_DUPLICATE_CLUSTER',
  // Demotion-only coverage disclosures: each RAISES the alarm (demotes
  // `verified`) but is never itself a verdict, and — unlike the similar-pair
  // reporters above — must NOT suppress `FND_NO_PAIRS_CHECKED`, because each
  // signals that a comparison did NOT happen (a requirement went unencoded, two
  // bounds never met, or relational reasoning was skipped). So they are
  // deliberately excluded from CROSS_REQUIREMENT_FND_CODES.
  'FND_EXCLUDED_FROM_FORMAL',
  'FND_QUANTITY_ALIAS_CANDIDATE',
  'FND_RELATIONAL_UNCHECKED',
  'FND_NUMERIC_UNCOMPARED',
  'FND_NUMBER_SPELLING_CANDIDATE',
  // The completeness heuristic names its whole same-trigger group, so it always
  // spans ≥2 ids — but its solver answer is fixed by the encoding, not read off
  // the document: `encode` emits every `pre` row positive, and a disjunction of
  // positive atoms is always falsifiable, so `¬(C1 ∨ … ∨ Cn)` is SAT for every
  // eligible group (see `formal/incomplete.ts`). An answer no document can change
  // verifies nothing, so it must not certify — membership here, not its `info`
  // severity, is what keeps it out of the `verified` predicate.
  'FND_INCOMPLETE',
  // The per-group `unknown` (AC-4-7). It names its whole context group, so a group
  // with ≥2 members spans ≥2 ids — and it is the tier's own statement that the
  // solver DECLINED to decide, which `formal/needs-review.ts` says is "NEVER
  // interpreted as no conflict". An answer of "I don't know" is the strongest
  // possible non-verdict, so it must not certify: absence from this set is what
  // would make an undecided group COUNT AS a decide-tier comparison.
  'FND_NEEDS_REVIEW',
])

/**
 * The coverage-GAP subset of the propose-only codes: findings that span ≥2
 * requirement ids yet mean "a comparison did NOT happen" (a requirement was
 * excluded from the solver, two numeric bounds landed on different keys,
 * aggregate/relational reasoning was not attempted, the group's SAT answer was
 * fixed by the encoding, or the solver returned `unknown` for the group). They must
 * NOT suppress the `FND_NO_PAIRS_CHECKED`
 * disclaimer through the id-count clause — doing so would let the report both
 * claim nothing was compared (`residualRisk.noPairsChecked`) and hide the
 * disclaimer that says so. Distinct from the semantic-tier propose codes
 * (similar/opposition/missing-trace-link), which DO reflect a real embedding
 * comparison and legitimately suppress the disclaimer.
 */
const COVERAGE_GAP_FND_CODES: ReadonlySet<string> = new Set<FndCode>([
  'FND_EXCLUDED_FROM_FORMAL',
  'FND_QUANTITY_ALIAS_CANDIDATE',
  'FND_RELATIONAL_UNCHECKED',
  'FND_NUMERIC_UNCOMPARED',
  'FND_NUMBER_SPELLING_CANDIDATE',
  'FND_INCOMPLETE',
  'FND_NEEDS_REVIEW',
])

/**
 * True when finding `f` is suppressed by waiver `w` (wishlist #3): the codes
 * match, and every scope the waiver carries holds — the finding names its
 * `requirementId`, and names exactly its `requirementIds`. A waiver with neither
 * is document-wide. Scoped waivers only bite findings that actually reference
 * the scoped requirements.
 */
function isWaived(f: CheckFinding, w: Waiver): boolean {
  if (PAIR_BOUND_CODES.has(f.code) && (w.requirementIds === undefined || w.textBound !== true)) {
    return false
  }
  return reachesFinding(f, w)
}

/** The scope test alone: the code matches and every scope the waiver carries holds. */
function reachesFinding(f: CheckFinding, w: Waiver): boolean {
  if (f.code !== w.code) return false
  if (w.requirementIds !== undefined && !namesExactly(f.requirementIds, w.requirementIds)) {
    return false
  }
  if (w.requirementId === undefined) return true
  return f.requirementIds.includes(w.requirementId)
}

/**
 * Codes a waiver discharges only over EXACTLY the finding's requirement set and only while it is
 * bound to their current text (`textBound`, set at the boundary from a matching content hash).
 *
 * An opposition candidate is often a pair a base build PROVED (spec 007, demote-not-prove C3): the
 * preposition-variant rule demotes what base proved by dropping a preposition. A waiver by code, or
 * by one requirement, reaches every candidate that names it — including ones created after the
 * triage, over pairs nobody read — and would turn that base proof into `verified: true`. Such a
 * waiver (a legacy one, or one hand-written) is kept in the document but not applied, and the
 * candidate's demotion says so.
 */
const PAIR_BOUND_CODES: ReadonlySet<string> = new Set<FndCode>(['FND_OPPOSITION_CANDIDATE'])

/** Waivers that reach `f` by scope but are not applied to it, because its code is pair-bound. */
function unappliedWaivers(f: CheckFinding, waivers: readonly Waiver[]): Waiver[] {
  if (!PAIR_BOUND_CODES.has(f.code)) return []
  return waivers.filter((w) => reachesFinding(f, w) && !isWaived(f, w))
}

/** The demotion-action sentence naming the waivers {@link unappliedWaivers} found, if any. */
function unappliedNote(unapplied: readonly Waiver[]): string {
  if (unapplied.length === 0) return ''
  const scopes = unapplied.map((w) =>
    w.requirementIds !== undefined
      ? `the one over ${w.requirementIds.join(' and ')}, whose content hash is missing or no longer matches`
      : w.requirementId !== undefined
        ? `the one scoped to ${w.requirementId} alone`
        : 'the document-wide one',
  )
  const one = unapplied.length === 1
  return (
    ` ${one ? 'A stored suppression' : `${unapplied.length} stored suppressions`} of ${unapplied[0]!.code} ` +
    `${one ? 'reaches' : 'reach'} this pair but ${one ? 'was' : 'were'} not applied (${scopes.join('; ')}): ` +
    'a triage candidate is decided only by an edit that lets the solver compare the pair, so ' +
    'no suppression of it certifies a pair, and one by code or by one requirement reaches pairs nobody read.'
  )
}

const SEVERITY_RANK: Record<CheckSeverity, number> = { error: 0, warn: 1, info: 2 }

/** Output-shaping options for {@link filterReport} (wishlist #5). */
export interface ReportFilter {
  /**
   * Drop findings below this severity from the emitted report. `error` keeps
   * only error-severity findings; `warn` keeps error+warn; `info` (default)
   * keeps everything. SAFE for the exit gate: because `error` is the top of the
   * severity order, a min-severity filter can never remove the error-severity
   * finding the gate keys on, so it only ever hides warn/info noise.
   */
  minSeverity?: CheckSeverity
  /**
   * Return only the findings array (plus the always-cheap `counts`/`waived`
   * tallies), dropping the heavier `excluded` table. The findings themselves —
   * and therefore the exit gate — are untouched.
   */
  findingsOnly?: boolean
}

/**
 * Apply the output-shaping filters (wishlist #5) to a finished report, upstream
 * of rendering. This is a presentation projection for a tight fix loop, NOT a
 * semantic change: it never removes an error-severity finding (min-severity
 * stops at `error`) and never alters `counts`, so `exitCodeForEnvelope` returns
 * the same code whether or not the caller filtered. `counts` continues to
 * reflect the FULL post-waiver finding set, so a `--min-severity error` view
 * still truthfully reports how many warn/info findings were hidden.
 */
export function filterReport(report: CheckReport, filter: ReportFilter): CheckReport {
  const min = filter.minSeverity ?? 'info'
  const threshold = SEVERITY_RANK[min]
  const findings =
    threshold === SEVERITY_RANK.info
      ? report.findings
      : report.findings.filter((f) => SEVERITY_RANK[f.severity] <= threshold)
  const next: CheckReport = { ...report, findings }
  if (filter.findingsOnly === true) next.excluded = []
  return next
}

/**
 * Marker retained for the AC-5-5 boundary test (`check-no-lean.test.ts`),
 * which predates this wiring and asserts the module loads without Lean.
 */
export const CheckResultSymbol = Symbol('CheckResult')

/** Legacy alias kept for the AC-5-5 guard's published shape. */
export interface CheckResult {
  findings: CheckFinding[]
}

/** The antonym index a check run consults: the document's committed pairs ({@link antonymIndexOf}). */
function docAntonymIndex(doc: Doc): ReadonlyMap<string, AntonymEntry> | undefined {
  return antonymIndexOf(doc.antonyms ?? [])
}

/**
 * THE atomizer for this document — one construction, both tiers.
 *
 * AC-2-7 says the propositional tier and the temporal tier share one atomizer instance. That
 * guarantee used to rest on two textually-identical `makeAtomize(...)` expressions on two
 * lines, with no shared constant and nothing comparing their output. Threading a new committed
 * table into one and not the other is a recorded prior bug, and it is invisible: `makeAtomize`
 * takes positional args, so a missing third argument still compiles, and no test contrasts the
 * two sites.
 *
 * Naming it once makes that divergence unrepresentable rather than merely detectable, which is
 * strictly better than the test it replaces — and the test exists too.
 */
function pipelineAtomize(doc: Doc): Atomize {
  return makeAtomize(glossaryIndex(doc.glossary), docAntonymIndex(doc), termIndex(doc.terms ?? []))
}

/**
 * {@link pipelineAtomize} in digit-separator fold space, over the same committed tables: the
 * PROPOSE-only encoding `findNumberSpellingCandidates` compares against the real one. Built from
 * the same three indexes, so a table threaded into one and not the other cannot compile away.
 */
function pipelineDigitSeparatorFoldAtomize(doc: Doc): Atomize {
  return makeDigitSeparatorFoldAtomize(
    glossaryIndex(doc.glossary),
    docAntonymIndex(doc),
    termIndex(doc.terms ?? []),
  )
}

/**
 * AC-3-6: the whole-document admission test for a glossary merge the semantic tier proposes
 * ({@link FindSimilarSemanticOptions.admitsMerge}). The semantic finder sees one pair; a
 * glossary entry is global, so only here can a candidate be tried against every slot.
 *
 * Every slot of every requirement (`reqs`, not the gate-included subset: an entry rewrites
 * all of them) is atomized twice through {@link pipelineAtomize}, once as committed and once
 * with the candidate entry added. The merge is admitted when the pair's two responses land on
 * one atom or on the two sides of one opposition key (contraries, spec 007 AC-2-1), AND the old
 * partitions survive: every set of slots that shares an atom today still shares one, at the same
 * relative polarity, and every set of responses that shares an opposition key today still shares
 * one, on the same relative sides. The second half is the one a pair-local check cannot see.
 * Lookup is one hop, so aliasing "close the doors" away while the glossary routes "arm the
 * barrier" onto it moves "close the doors" alone; so does an inflection ("closes the doors") or
 * a term that shares its atom, and so does an alias that moves "open the door" off the key
 * "close the door" shares with it. Any conflict the shared atom or key carried is then gone, and
 * a later `check` certifies over it.
 */
function glossaryMergeAdmission(
  doc: Doc,
  reqs: readonly EncodableRequirement[],
): (merge: GlossaryMerge, pair: readonly [string, string]) => boolean {
  const slotsUnder = (atomize: Atomize) => {
    const slots = new Map<string, { atom: string; negated: boolean; opposition?: Opposition }>()
    for (const r of reqs) {
      for (const row of encode(r, atomize).atoms) {
        slots.set(`${r.id}|${row.kind}`, {
          atom: row.atom,
          negated: row.negated,
          ...(row.opposition !== undefined ? { opposition: row.opposition } : {}),
        })
      }
    }
    return slots
  }
  const now = slotsUnder(pipelineAtomize(doc))
  return (merge, [a, b]) => {
    const glossary = [...doc.glossary, { canonical: merge.canonical, aliases: [merge.alias] }]
    const merged = slotsUnder(pipelineAtomize({ ...doc, glossary }))
    const ra = merged.get(`${a}|resp`)
    const rb = merged.get(`${b}|resp`)
    if (ra === undefined || rb === undefined) return false
    const related =
      ra.atom === rb.atom || areContrary({ name: ra.atom, ...ra }, { name: rb.atom, ...rb })
    if (!related) return false
    // old atom -> the one new atom its slots all move to, and whether they flip polarity; old
    // opposition key -> the one new key its responses all move to, and whether they flip side.
    const movesTo = new Map<string, string>()
    const keyMovesTo = new Map<string, string>()
    const agrees = (table: Map<string, string>, from: string, to: string): boolean => {
      const seen = table.get(from)
      if (seen === undefined) table.set(from, to)
      return seen === undefined || seen === to
    }
    for (const [slot, before] of now) {
      const after = merged.get(slot)
      if (after === undefined) return false
      if (!agrees(movesTo, before.atom, `${after.atom}|${after.negated !== before.negated}`)) {
        return false
      }
      if (before.opposition === undefined) continue
      if (after.opposition === undefined) return false
      const side = after.opposition.negative !== before.opposition.negative
      if (!agrees(keyMovesTo, before.opposition.key, `${after.opposition.key}|${side}`)) {
        return false
      }
    }
    return true
  }
}

/**
 * Encode the AC-3-7-INCLUDED requirements into the same guarded-implication
 * {@link EncodedRequirement} set the in-process formal tier asserts. Reuses the pipeline's own
 * gate + `toEncodable` + {@link pipelineAtomize} so the encoding is the one `check` evaluates
 * rather than a parallel one that could drift — which is what lets the propose tier
 * (`domain/glossary/glossary-plan.ts`, its only non-test consumer) derive its node set from
 * exactly the atoms the solver compares. Pure and Z3-free (no `getContext`, no solver contact):
 * it only builds the plain-data formula AST, so a vocabulary pass pays no WASM boot.
 */
export function encodeIncluded(doc: Doc): EncodedRequirement[] {
  const requirements = listRequirements(doc)
  // Waiver-aware gate (waiver-vs-exclusion soundness): a waived blocking finding
  // re-admits its requirement to the formal tier, so this exports the SAME included
  // set `check` evaluates. Empty waivers ⇒ identical partition.
  const excluded = excludedIds(gateRequirements(requirements, doc.waivers ?? []))
  const atomize = pipelineAtomize(doc)
  return requirements
    .map(asView)
    .filter((r) => !excluded.has(r.id))
    .map(toEncodable)
    .map((r) => encode(r, atomize))
}

const STRUCTURAL_SEVERITY: Record<FndCode & `FND_${string}`, CheckSeverity> = {
  FND_DANGLING_REFERENCE: 'error',
  FND_MISSING_TRIGGER: 'error',
  FND_MISSING_PRECONDITION: 'error',
  FND_CYCLE: 'error',
  FND_ORPHAN: 'warn',
  FND_LEAF_UNVERIFIABLE: 'warn',
} as Record<FndCode, CheckSeverity>

/** The requirement ids a Tier-0 structural finding names, per finding kind. */
function structuralIds(finding: Finding): string[] {
  if (finding.kind === 'DanglingReference') return [finding.from]
  if (finding.kind === 'CycleDetected') return [...finding.nodes]
  return [finding.id]
}

function normalizeStructural(findings: Finding[]): CheckFinding[] {
  return findings.map((f) => {
    const code = structuralKindToFndCode[f.kind]
    return {
      code,
      severity: STRUCTURAL_SEVERITY[code] ?? 'error',
      tier: 'structural' as const,
      requirementIds: structuralIds(f),
      message: f.message,
    }
  })
}

function normalizeLint(requirements: readonly Requirement[]): CheckFinding[] {
  const withSentences = requirements.map((requirement) => ({
    requirement,
    sentence: lintSentenceOf(requirement),
  }))

  const perStatement = withSentences.flatMap(({ requirement, sentence }) =>
    checkGtWRules(requirement, sentence).map((f) => ({
      code: f.code,
      severity: f.severity,
      tier: 'lint' as const,
      requirementIds: [requirement.id],
      message: f.message,
      span: f.span,
      ...(f.suggestion !== undefined ? { suggestion: f.suggestion } : {}),
    })),
  )

  const setLevel = checkGtWRulesSet(withSentences).map((f) => ({
    code: f.code,
    severity: f.severity,
    tier: 'lint' as const,
    requirementIds: f.requirementId !== undefined ? [f.requirementId] : [],
    message: f.message,
    span: f.span,
    ...(f.suggestion !== undefined ? { suggestion: f.suggestion } : {}),
  }))

  return [...perStatement, ...setLevel]
}

/**
 * Between-tier whole-run deadline gate (AC-1-7). Returns `true` — and records the
 * skip on the budget's truncation ledger — when `budget` is present and already
 * expired, so the caller can skip a whole tier that would otherwise start work it
 * cannot finish. Returns `false` when there is no budget (unbounded run) or time
 * remains.
 *
 * Used for the two tiers whose internal loop is NOT cut mid-flight: the
 * contradiction tier (whose per-context-group discipline must not be
 * restructured) and the needs-review tier (which owns the `ERR_SOLVER_TIMEOUT`
 * boundary). Every recorded skip becomes a `solver-budget-exhausted` demotion, so
 * a skipped tier can never be mistaken for a clean one.
 */
function budgetSpent(budget: SolverBudget | undefined, tier: string, units: number): boolean {
  if (budget === undefined || !budget.expired()) return false
  budget.truncate(tier, units)
  return true
}

/** Stable output order: severity, then code, then first requirement id. */
function compareFindings(a: CheckFinding, b: CheckFinding): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  if (bySeverity !== 0) return bySeverity
  const byCode = a.code.localeCompare(b.code)
  if (byCode !== 0) return byCode
  return (a.requirementIds[0] ?? '').localeCompare(b.requirementIds[0] ?? '')
}

/**
 * AC-3-1: the requirements the contradiction solver actually asserted TOGETHER with a
 * peer they share an atom with — co-live ({@link liveIn}, carried as `liveIds`) in a
 * context group whose every check was decided.
 *
 * Both halves are necessary. Co-liveness without a shared atom is a conjunction that
 * constrains nothing across the pair (two unconditional rules about unrelated things),
 * which the atom-sharing rule this replaces never counted either. A shared atom without
 * co-liveness is the defect: the obligations were never asserted in the same solver call.
 * An `unknown` group decided nothing, so it confers no participation (its members are
 * disclosed by the `solver-unknown` demotion instead).
 */
function coLiveParticipants(
  groups: readonly CheckedContextGroup[],
  atomOwners: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const atomsOf = new Map<string, string[]>()
  for (const [atom, owners] of atomOwners) {
    if (owners.size < 2) continue
    for (const id of owners) {
      const list = atomsOf.get(id)
      if (list === undefined) atomsOf.set(id, [atom])
      else list.push(atom)
    }
  }
  const shareAtom = (a: string, b: string): boolean =>
    (atomsOf.get(a) ?? []).some((atom) => atomOwners.get(atom)?.has(b) === true)

  const participants = new Set<string>()
  for (const group of groups) {
    if (group.outcome !== 'decided') continue
    const live = group.liveIds
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i] as string
        const b = live[j] as string
        if (shareAtom(a, b)) {
          participants.add(a)
          participants.add(b)
        }
      }
    }
  }
  return participants
}

/**
 * One AC-3-2 pair: two responses that conflict as written ({@link literalsConflict}) — one
 * atom at opposite polarity, or contraries both asserted — never co-live.
 */
interface ConditionalConflict {
  readonly a: string
  readonly b: string
  /** Each requirement's response slot text. */
  readonly responseA: string
  readonly responseB: string
  /** True for two contrary atoms (AC-2-1), false for one atom at opposite polarity. */
  readonly contrary: boolean
  /** Each requirement's guard slot texts (empty = unconditional). */
  readonly contextA: readonly string[]
  readonly contextB: readonly string[]
  /** The union of both guard texts, deduplicated, in slot order. */
  readonly union: readonly string[]
}

/** Render a requirement's guard texts for a demotion action. */
function describeContext(context: readonly string[]): string {
  return context.length === 0
    ? 'unconditionally'
    : `when ${context.map((t) => `"${t}"`).join(' and ')}`
}

/** Pair key over two requirement ids; U+0000 cannot occur in an id. */
const pairKeyOf = (x: string, y: string): string => (x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`)

/**
 * AC-3-2: every pair of included requirements whose responses CONFLICT as written while no
 * planned context group makes both live. "Conflict" is {@link literalsConflict}, the reading
 * the AC-3-6 near-duplicate rule uses: the SAME response atom at OPPOSITE polarity, or two
 * contraries (spec 007 AC-2-1: distinct atoms on opposite sides of one opposition key) both
 * asserted. Both negated ("do neither") satisfies the contrary axiom and is not a pair. Without
 * the contrary half, "open the door" / "close the door" under two guards certified where
 * "open the door" / "shall not open the door" demoted, so the positive restatement GtWR
 * recommends (and the STRONGER claim under the axiom) cleared the demotion.
 *
 * Rows are bucketed by opposition key when the atom has one, else by atom: one atom always
 * carries one key, and contraries share theirs, so every candidate pair meets in one bucket.
 * Both names are system-scoped, so "under one system" is carried by the bucket. Planned
 * groups rather than decided ones: a pair co-live in a group the solver did not decide is
 * disclosed by `solver-unknown` (or the budget demotion when the tier never ran), and
 * naming it here too would claim its contexts were never asserted together when they
 * were. A pair a `FND_CONTRADICTION` already names was compared — a guard-implication
 * bridge can make a requirement live in a group its own guard does not name — so it is
 * excluded.
 */
function conditionalConflicts(
  encoded: readonly EncodedRequirement[],
  formal: readonly CheckFinding[],
): ConditionalConflict[] {
  const groups = planGroups(encoded.map(contextAtomsOf))
  const contradicted = new Set<string>()
  for (const f of formal) {
    if (f.code !== 'FND_CONTRADICTION') continue
    for (const x of f.requirementIds)
      for (const y of f.requirementIds) if (x !== y) contradicted.add(pairKeyOf(x, y))
  }

  interface RespRow {
    readonly enc: EncodedRequirement
    readonly lit: { name: string; negated: boolean; opposition?: Opposition }
    readonly text: string
  }
  const buckets = new Map<string, RespRow[]>()
  for (const enc of encoded) {
    for (const row of enc.atoms) {
      if (row.kind !== 'resp') continue
      // U+0000 cannot occur in an atom name or a key, so the two namespaces cannot collide.
      const bucket =
        row.opposition !== undefined ? `key\u0000${row.opposition.key}` : `atom\u0000${row.atom}`
      const list = buckets.get(bucket) ?? []
      list.push({
        enc,
        lit: {
          name: row.atom,
          negated: row.negated,
          ...(row.opposition !== undefined ? { opposition: row.opposition } : {}),
        },
        text: row.slotText,
      })
      buckets.set(bucket, list)
    }
  }

  const guardTexts = (e: EncodedRequirement): string[] =>
    e.atoms.filter((r) => r.kind === 'pre' || r.kind === 'trig').map((r) => r.slotText)

  const out = new Map<string, ConditionalConflict>()
  for (const rows of buckets.values()) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const x = rows[i] as RespRow
        const y = rows[j] as RespRow
        if (x.enc.id === y.enc.id || !literalsConflict(x.lit, y.lit)) continue
        const key = pairKeyOf(x.enc.id, y.enc.id)
        if (out.has(key) || contradicted.has(key)) continue
        const ctxX = contextAtomsOf(x.enc)
        const ctxY = contextAtomsOf(y.enc)
        if (groups.some((g) => liveIn(g, ctxX) && liveIn(g, ctxY))) continue
        const [first, second] = x.enc.id < y.enc.id ? [x, y] : [y, x]
        const contextA = guardTexts(first.enc)
        const contextB = guardTexts(second.enc)
        out.set(key, {
          a: first.enc.id,
          b: second.enc.id,
          responseA: first.text,
          responseB: second.text,
          contrary: first.lit.name !== second.lit.name,
          contextA,
          contextB,
          union: [...new Set([...contextA, ...contextB])],
        })
      }
    }
  }
  return [...out.values()].sort((x, y) => {
    if (x.a !== y.a) return x.a < y.a ? -1 : 1
    if (x.b !== y.b) return x.b < y.b ? -1 : 1
    return 0
  })
}

/**
 * Run the full default `check` pipeline over a loaded document. Never touches
 * Lean (AC-5-5); never hands a gate-excluded statement to the SMT layer
 * (AC-3-7); every formal finding carries `evidence` (AC-4-6).
 */
export async function runCheck(doc: Doc, options: CheckOptions = {}): Promise<CheckReport> {
  const requirements = listRequirements(doc)

  // ---- Tier 0: structural ------------------------------------------------
  const findings: CheckFinding[] = normalizeStructural(analyze(doc))

  // ---- Lint: GtWR (per-statement + set-level) ----------------------------
  findings.push(...normalizeLint(requirements))

  // ---- Ambiguity family (AC-31): deterministic, always-on ----------------
  // Vague/quantifier/reference detectors + the structured contextual-ambiguity
  // punt. Pure over the requirement set (no solver, no model), so it runs on
  // the default `check` path like structural + lint.
  for (const f of detectAmbiguity(requirements.map(asView))) {
    findings.push({
      code: f.code,
      severity: f.severity,
      tier: 'lint',
      requirementIds: [...f.requirementIds],
      message: f.message,
      ...(f.span !== undefined ? { span: f.span } : {}),
    })
  }

  // ---- AC-3-7 gate: partition before symbolization -----------------------
  // Waiver-aware (waiver-vs-exclusion soundness): a committed waiver on a
  // formal-blocking finding re-admits its requirement to the formal tier, so
  // gateResult.excluded naturally shrinks and the FND_EXCLUDED_FROM_FORMAL loop
  // below no longer fires for a requirement the author took responsibility for.
  // Empty waivers ⇒ the exact pre-feature partition.
  const gateResult = gateRequirements(requirements, doc.waivers ?? [])
  const excluded = excludedIds(gateResult)

  // ---- Free tier + formal tier via the solver orchestrator ---------------
  // The formal runner captures its rich (FND-coded, evidence-carrying)
  // findings in this closure; it reports `findings: []` back to the
  // orchestrator so nothing is double-counted between the SolverReport
  // projection and the rich findings below.
  const formal: CheckFinding[] = []

  // Wishlist #5b: count atoms that appear in exactly ONE gate-included
  // requirement. Such an atom has no cross-requirement partner, so it can never
  // form a candidate pair and went uncompared — a residual-risk axis. Captured
  // from the SAME encoded roster the formal tier builds (so it is free), inside
  // the closure where `encoded` is in scope.
  let unmatchedAtoms = 0
  // Adversarial-eval hardening: the full atom→owners map escapes the closure so
  // the per-requirement participation coverage (and its demotion of `verified`)
  // is computed from the same roster.
  let coverageAtomOwners: ReadonlyMap<string, ReadonlySet<string>> = new Map()
  let coverageIncludedIds: readonly string[] = []
  // AC-3-2: the encoded (included) requirements, for the opposite-polarity pair scan.
  let coverageEncoded: readonly EncodedRequirement[] = []

  // AC-1-7: the ONE whole-run solver deadline every tier shares, plus its
  // truncation ledger. Constructed inside the formal runner (so the clock starts
  // at the first solver contact, not at document load — no solver knob governs
  // parse/lint time) and hoisted here so the demotion loop below can read the
  // ledger after `runSolvers` returns. `undefined` when no budget was requested,
  // in which case every tier runs unbounded exactly as before.
  let solverBudget: SolverBudget | undefined

  // AC-3-4 / AC-3-1: what the contradiction tier's solver actually decided, per planned
  // context group. Empty when the tier was skipped (budget) or had <2 requirements.
  let contradictionGroups: readonly CheckedContextGroup[] = []
  // AC-3-4: `unknown`s reported by tiers that have no group structure of their own (the
  // temporal tier's single joint check), each naming the requirements it covered.
  const tierUnknowns: { tier: string; requirementIds: string[] }[] = []
  // AC-3-6: the FND_SIMILAR_SEMANTIC pairs that are opposite-polarity inflection variants,
  // keyed `lo|hi`, each mapped to whether its finding proposes a glossary merge (it withholds
  // one that would alias a phrase to its own opposite or split a shared atom). The demotion
  // reads the KEPT findings, so a waiver discharges it.
  const oppositeVariantPairs = new Map<string, boolean>()

  const report = await runSolvers(doc, {
    ...(options.similarityThreshold !== undefined
      ? { similarityThreshold: options.similarityThreshold }
      : {}),
    formal: async ({ reqs, pairs }): Promise<FormalTierResult> => {
      const included = reqs.filter((r) => !excluded.has(r.id))
      const includedIdSet = new Set(included.map((r) => r.id))
      const encodable = included.map(toEncodable)

      const timeoutMs = options.timeoutMs ?? 2000
      // AC-1-7: start the whole-run deadline here — the first line of the formal
      // runner — so it measures SOLVER time. Every tier below receives `bounds`
      // and therefore both knobs; `bounds.budget` is undefined when the caller
      // asked for no budget, which makes every tier's deadline check a no-op.
      solverBudget =
        options.solverBudgetMs !== undefined ? new SolverBudget(options.solverBudgetMs) : undefined
      const bounds: SolverBounds = {
        timeoutMs,
        ...(solverBudget !== undefined ? { budget: solverBudget } : {}),
        onUnknown: (tier, requirementIds) => {
          tierUnknowns.push({ tier, requirementIds: [...requirementIds].sort() })
        },
      }
      // AC-9-3: canonicalize atoms through the committed glossary so
      // agent-confirmed paraphrases collide and paraphrased contradictions
      // become provable. Empty glossary ⇒ identical to a glossary-free run.
      // #1: fold the committed antonym pairs into the seed table so
      // agent-confirmed opposites (open/shut) become contraries — two atoms and
      // the axiom `¬(open ∧ shut)` every solver tier asserts (spec 007 AC-2-1).
      // Empty ⇒ seed-only.
      // #6: committed noun-phrase terms are substituted inside every slot body, so one entry
      // aligns a noun document-wide. Empty ⇒ identical to a term-free run.
      const atomize = pipelineAtomize(doc)
      const contradictionOpts = {
        atomize,
        timeoutMs,
        ...(options.contradictionCheck !== undefined ? { check: options.contradictionCheck } : {}),
      }

      // Whole-spec checks (contradiction / vacuity / completeness / review)
      // and pairwise checks (subsumption / redundancy) share one encoding.
      const ctx = await getContext('symspec-check')
      const encoded = encodable.map((r) => encode(r, atomize))
      const encodedById: ReadonlyMap<string, EncodedRequirement> = new Map(
        encoded.map((e) => [e.id, e]),
      )

      // Wishlist #5b: tally the spec-wide atom roster and count singletons —
      // atoms that appear in exactly one included requirement. An atom counts
      // once per requirement (a requirement that repeats an atom across slots
      // does not make it "matched"); an atom is "matched" only when ≥2 distinct
      // requirements reference it. Deterministic, no solver contact.
      const atomOwners = new Map<string, Set<string>>()
      for (const e of encoded) {
        for (const row of e.atoms) {
          let owners = atomOwners.get(row.atom)
          if (owners === undefined) {
            owners = new Set<string>()
            atomOwners.set(row.atom, owners)
          }
          owners.add(e.id)
        }
      }
      // Spec 007 AC-2-1: a contrary axiom compares two atoms exactly as the old rename's one shared
      // atom did, so each side's atom counts the other side's owners as partners. Two members of
      // one side get no credit: nothing relates them, so nothing compared them. Read from a
      // snapshot so the credit is one hop.
      const contraryOwners = contraryPairs(encoded.flatMap((e) => e.atoms)).map(
        ([a, b]) => [a, b, [...(atomOwners.get(a) ?? [])], [...(atomOwners.get(b) ?? [])]] as const,
      )
      for (const [a, b, ownersA, ownersB] of contraryOwners) {
        for (const id of ownersB) atomOwners.get(a)?.add(id)
        for (const id of ownersA) atomOwners.get(b)?.add(id)
      }
      for (const owners of atomOwners.values()) {
        if (owners.size === 1) unmatchedAtoms += 1
      }
      coverageAtomOwners = atomOwners
      coverageIncludedIds = included.map((r) => r.id)
      coverageEncoded = encoded

      const includedPairs = pairs.filter((p) => includedIdSet.has(p.a) && includedIdSet.has(p.b))

      // AC-1-7: the contradiction tier already bounds each per-group solver
      // internally (`contradiction.ts` sets `timeout` per group), so the
      // whole-run deadline is enforced BETWEEN tiers here — the tier is skipped
      // wholesale if the budget is already spent, and the skip is recorded so it
      // demotes `verified`. Deliberately NOT a mid-loop cut inside
      // `findContradictions`: its per-context-group discipline is load-bearing
      // (the reachability lesson), and this task must not restructure it.
      const contradictionRun = budgetSpent(solverBudget, 'contradiction', encodable.length)
        ? { findings: [], groups: [] }
        : await analyzeContradictions(encodable, contradictionOpts)
      const contradictions = contradictionRun.findings
      contradictionGroups = contradictionRun.groups
      const subsumption = await checkSubsumption(ctx, encodedById, includedPairs, bounds)
      const subsumptions = subsumption.findings
      const vacuities = await checkVacuity(ctx, encoded, bounds)
      const incompletes = await checkCompleteness(ctx, encoded, bounds)
      const similar = findSimilarUnunified(
        encodable,
        options.similarityThreshold !== undefined
          ? { similarityThreshold: options.similarityThreshold }
          : {},
      )
      // AC-4-7 boundary, preserved exactly. `findNeedsReview` is the ONE tier
      // allowed to raise `ERR_SOLVER_TIMEOUT`, and it does so when the budget
      // dies inside its own group loop. So it is handed the REMAINING budget
      // rather than the original figure — otherwise a run that had already burned
      // the budget in subsumption would hand this tier a full fresh budget and
      // the documented whole-run abort would be unreachable.
      //
      // When the budget is ALREADY spent before this tier starts, the tier is
      // skipped and the skip recorded, rather than entered so it can throw: a
      // reportable demotion beats an error envelope with no report, and
      // `verified` is false either way. The throw stays reachable for the
      // budget-expires-mid-loop case, which is precisely the whole-run boundary
      // AC-4-7 defines.
      //
      // AC-1-7 follow-up. Handing this tier the remaining budget made the
      // pipeline's failure mode NON-MONOTONE in the budget, which was verified
      // live on a 100-requirement document: budgets of 1/100/500/1000/1500ms and
      // 3000ms+ all returned a usable report with honest truncation demotions,
      // but 2000ms — the band where the budget survives subsumption and then
      // dies inside this tier's group loop — produced `ERR_SOLVER_TIMEOUT`,
      // exit 2, and NO report at all. A tighter budget failing more softly than
      // a looser one is incoherent, and it hands an agent an error envelope on
      // exactly the runs where a partial verdict is most useful.
      //
      // So the pipeline treats a mid-loop budget death the same way it treats
      // every other tier's truncation: record it and demote. The throw itself is
      // preserved (its contract is directly tested in
      // `formal/needs-review.test.ts`) and remains the behavior for a
      // direct library caller of `findNeedsReview`; only the PIPELINE, which has
      // a report to return and a demotion channel to return it through, absorbs
      // it. `verified` is false either way, so this trades no soundness.
      let review: Awaited<ReturnType<typeof findNeedsReview>> = []
      if (!budgetSpent(solverBudget, 'needs-review', encodable.length)) {
        try {
          review = await findNeedsReview(encodable, {
            atomize,
            timeoutMs,
            ...(options.needsReviewCheckGroup !== undefined
              ? { checkGroup: options.needsReviewCheckGroup }
              : {}),
            ...(solverBudget !== undefined
              ? { solverBudgetMs: Math.max(0, solverBudget.remainingMs()) }
              : {}),
          })
        } catch (e) {
          if (!(e instanceof SolverBudgetExceededError)) throw e
          // Unrun group count is unknown from here; record the tier as truncated
          // so the demotion fires and the coverage report stays honest.
          solverBudget?.truncate('needs-review', encodable.length)
        }
      }

      // AC-30-3: numeric/arithmetic conflict tier. Extract per-slot numeric
      // predicates (deterministic, unit-normalized, per-system quantity keys)
      // and prove any same-quantity set jointly unsatisfiable over LIA/LRA.
      // Runs over ALL requirements, NOT the gate-included subset: numeric
      // conflict detection is independent of the propositional-encoding
      // soundness the AC-3-7 gate protects, so a lint-blocking finding (e.g. a
      // missing-units warning on a bare number) must not hide a real numeric
      // contradiction. Reuses the shared context.
      // #3: reuse the committed synonym glossary as a quantity-alias map so two
      // phrasings of one physical quantity ("keep valid for" vs "expire after")
      // key to a single quantity and the LIA/LRA solver compares them. Empty
      // glossary ⇒ identical to the pre-feature numeric path.
      //
      // The committed TERM table is deliberately NOT folded in here, and this is a soundness
      // boundary rather than an oversight. `quantityAliases` is safe because `glossaryIndex` is
      // whole-phrase exact-match and `quantityKey` does a single `get(normalize(label))` — a
      // committed, one-hop, all-or-nothing lookup. Term substitution is per-token, and a
      // quantity label's last words are exactly where phrasal-verb tails live, so substituting
      // inside one could collapse "the carry over" and "the carry" onto a single quantity key
      // and emit FND_NUMERIC_CONTRADICTION — error severity — between a billing carry-over and
      // an in-flight transfer. That is the defect
      // `.erpaval/solutions/architecture/normalization-for-a-propose-signal-must-not-touch-the-decide-key.md`
      // records, and it must not arrive through a new door.
      //
      // Each input also carries the requirement's CONTEXT — its guard atoms, in the
      // projection `contextAtomsOf` returns — so the tier sweeps per reachable
      // context instead of asserting every requirement's bounds as simultaneous
      // facts. Derived here rather than read off `encodedById` because this tier's
      // population is `reqs`, not the AC-3-7 gate's included subset, and a
      // gate-excluded requirement with no context would read as unconditional and
      // co-assert its bounds with everything. `encode` is pure and Z3-free, so the
      // extra encodings cost no solver time.
      const quantityAliases = glossaryIndex(doc.glossary)
      // `requirementBounds` reads the response through the SAME negation view the
      // propositional tier encodes (`toEncodable`): the stored `negated` flag, or a leading
      // `not`/`never` stripped from hand-authored text. `shall not … above 30 seconds`
      // bounds the quantity at `<= 30 s`; read without the flag it asserted `> 30 s` (spec
      // 007 AC-2-6). The R6 lint reads its bounds through the same function.
      //
      // What a response performs beside its bounds (`responseOccurrences`, where the rule is
      // stated): the occurrence two opposed prohibitions on one quantity cannot both survive.
      const occurrencesOf = (r: (typeof reqs)[number], response: readonly NumericPredicate[]) =>
        responseOccurrences(r, response, quantityAliases)
      const numericReqPreds = reqs.map((r) => {
        const predicates = requirementBounds(r, quantityAliases).map((b) => b.predicate)
        const response = predicates.filter((p) => p.slot === 'resp')
        return {
          id: r.id,
          contextAtoms: contextAtomsOf(encode(toEncodable(r), atomize)),
          occurrences: occurrencesOf(r, response),
          ...(toEncodable(r).negated === true
            ? {}
            : {
                response: { systemName: r.systemName, text: toEncodable(r).systemResponse.trim() },
              }),
          predicates,
        }
      })
      // The decide half (`contradictions`) and what it declined to decide (`uncompared`,
      // demotion-only): a proof must hold under every reading of a role or a temperature,
      // and a pair the readings split is disclosed rather than dropped.
      const { contradictions: numericContradictions, uncompared: numericUncompared } =
        await analyzeNumericBounds(ctx, numericReqPreds, bounds)
      // What it never read: a quantity in a converted unit that no bound it extracted covers
      // (`poll every 5 seconds`, a comparator phrase the lexicon does not know). Over the same
      // population as the bounds, so a requirement is disclosed exactly where its numbers were
      // not handed to the decide half. Demotion-only, through `numeric-bounds-uncompared`.
      const numericUnread = disclosureOfUnreadQuantities(
        reqs.map((r) => ({ id: r.id, response: r.systemResponse, unread: unreadQuantities(r) })),
      )

      // Issue #2 (reproducer a): the numeric tier keys a quantity off the phrase
      // before the comparator, so ONE physical quantity described with two
      // different verbs ("complete the infusion within ≤30 min" vs "run the
      // infusion for ≥60 min") splits into two keys and the joint bound is never
      // compared. Propose-only: flag co-active opposed bounds — same system and
      // guard, or both unguarded — whose labels share an object but differ
      // in verb, suggesting a `glossary add` alias that routes both to one
      // quantity key (DECIDE tier). Demotes `verified`; never a verdict. Reuses
      // the predicates already extracted (with the committed alias map applied),
      // so a pair already unified via the glossary no longer differs and the
      // candidate stops firing.
      const predsById = new Map(numericReqPreds.map((p) => [p.id, p.predicates]))
      const quantityAliasCandidates = findQuantityAliasCandidates(
        reqs.map((r) => ({
          id: r.id,
          systemName: r.systemName,
          guardKey: guardKeyOf(r),
          predicates: predsById.get(r.id) ?? [],
        })),
      )

      // AC-2-4: a phrase whose numbers differ only in a digit separator is two atoms, and no
      // closed rule says whether they are one number. Propose-only: name the pair so it is
      // demoted, never silently covered. Over EVERY requirement, gate-excluded ones too, encoded
      // through the solver's own atomizer: a `1_500 ms` that R6 keeps out is still half of a
      // pair 669c0e9 proved against `1.500 ms`, and only a pair demotion names its partner. A
      // propose-only demotion over an untrusted slot can only withhold `verified`.
      //
      // A committed glossary or term alias is a spelling too: an alias written `1,5 m pipe`
      // no longer matches a body that spells `1.5 m pipe`, so the table rewrites one side only
      // and the two atoms' folds differ. Each requirement is therefore also encoded in fold
      // space, tables included, and a pair that shares an atom THERE is named as well.
      const foldAtomize = pipelineDigitSeparatorFoldAtomize(doc)
      const numberSpellingCandidates = findNumberSpellingCandidates(
        reqs.map((r) => encodedById.get(r.id) ?? encode(toEncodable(r), atomize)),
        reqs.map((r) => encode(toEncodable(r), foldAtomize)),
      )

      // Issue #2 (reproducer b + aggregate/relational families): detect the
      // STRUCTURAL SHAPE where aggregate/conservation or emergent-structural
      // (odd-cycle 2-coloring, pigeonhole, transitivity) conflicts hide — bounds
      // or inter-entity relational language under one shared guard that the
      // pairwise same-quantity numeric tier does not attempt. Demotion-only: it
      // declines to certify (DEMOTES `verified`), never asserts a conflict, so
      // it cannot manufacture a false one. Per-requirement `hasUnmatchedAtom` is
      // read from the atom-owner roster built above (owners.size === 1).
      const singletonOwnerIds = new Set<string>()
      for (const [, owners] of atomOwners) {
        if (owners.size === 1) for (const id of owners) singletonOwnerIds.add(id)
      }
      const relationalUnchecked = findRelationalUnchecked(
        reqs.map((r) => ({
          id: r.id,
          systemName: r.systemName,
          guardKey: guardKeyOf(r),
          // The RAW slots too: this tier groups per slot rather than per slot PAIR, because a
          // discloser wants a coarser key than the prover it shares `guardKeyOf` with. See
          // `relational.ts`'s grouping comment for the direction argument.
          ...(r.preCondition !== undefined ? { preCondition: r.preCondition } : {}),
          ...(r.trigger !== undefined ? { trigger: r.trigger } : {}),
          responseText: r.systemResponse,
          hasNumericBound: (predsById.get(r.id) ?? []).length > 0,
          hasUnmatchedAtom: singletonOwnerIds.has(r.id),
        })),
      )

      // AC-33-2: opt-in bounded temporal tier. Map each requirement to LTL
      // (Dwyer/FRET) and prove temporal contradictions via bounded LTL→SMT on
      // the shared Z3-WASM context. Sound-for-UNSAT.
      //
      // ## Which requirements the temporal tier scores (AC-2-7 divergence 8)
      //
      // It scores `encodable` — the AC-3-7 gate's INCLUDED subset, threaded
      // through `toEncodable`. It used to score raw `reqs`, so the two tiers
      // reasoned over DIFFERENT requirement populations while both reported at
      // error severity. That is resolved deliberately, in favour of the gated
      // set, for three reasons:
      //
      //   1. **The gate exists because unsound input makes a solver verdict
      //      unsound, and that argument is tier-agnostic.** AC-3-7's forced
      //      pipeline order (parse → lint → symbolize → solve) rests on "a
      //      statement that fails a surface check has no trustworthy slot set".
      //      A requirement whose sentence does not match any EARS pattern has no
      //      trustworthy TRIGGER either — and the temporal tier's whole shape is
      //      `G(trigger → …)`. Feeding it a slot the lint tier just declared
      //      untrustworthy, and then reporting `FND_TEMPORAL_CONTRADICTION` at
      //      error severity on the strength of it, is the propose/decide rule
      //      inverted: the decide tier would be LOOSER about its input than the
      //      tier that gates it. `decide-tier-must-carry-every-guard-the-propose-
      //      tier-has` is the general form of that bug.
      //   2. **Nothing is silently lost, because the coverage hole is already
      //      disclosed and already demotes.** An excluded requirement produces
      //      `FND_EXCLUDED_FROM_FORMAL` plus an `excluded-from-formal` demotion
      //      per requirement, so `verified` cannot be true over it — for BOTH
      //      tiers now, with one disclosure covering both. Under the previous
      //      split, an excluded requirement was un-scored propositionally and
      //      scored temporally, so `FND_EXCLUDED_FROM_FORMAL` was literally
      //      false about the temporal tier: the solver HAD seen it.
      //   3. **It is the direction that cannot fabricate.** Scoring fewer
      //      requirements can only withhold an `unsat` (a false negative, the
      //      honest direction for a sound-for-UNSAT tier), and the gate is
      //      waiver-aware: `symspec waive add <blocking-code> --ref <id>`
      //      re-admits a requirement to BOTH tiers at once, which is a reviewed,
      //      reasoned discharge rather than a silent one.
      //
      // The numeric tier deliberately keeps scoring raw `reqs`, and that is not
      // an inconsistency: its soundness does not depend on the propositional
      // atomization the gate protects (a bare number with a missing-units warning
      // still carries a real, comparable bound), whereas the temporal tier is
      // built on exactly the atoms and slots the gate is about. That distinction
      // is already written down at the numeric tier's call site above.
      const temporalContradictions =
        options.temporal !== undefined
          ? await findTemporalContradictions(
              ctx,
              encodable.map((r) => ({ id: r.id, formula: earsToTemporal(r, atomize) })),
              options.temporal.bound ?? 10,
              bounds,
              // Spec 007 AC-2-1: the same contrary axioms the propositional tiers assert, over the
              // same atoms — `encoded` is `encodable` through the same atomizer.
              contraryPairs(encoded.flatMap((e) => e.atoms)).map(([a, b]) =>
                G(tNot(tAnd([tAtom(a), tAtom(b)]))),
              ),
              options.temporalCheck,
            )
          : []

      // AC-9-5: opt-in semantic paraphrase pass. Propose-only — emits
      // FND_SIMILAR_SEMANTIC info findings suggesting glossary merges for
      // high-cosine response pairs that atomize (incl. the glossary) did not
      // already unify. Runs over the SAME included set; never a verdict.
      const semantic =
        options.semantic !== undefined
          ? // The ENCODABLE rows, as every solver tier reads them: `toEncodable` strips a
            // stored leading "not " into polarity, so a raw row would put "not open the doors"
            // on its own positive atom, miss the AC-3-6 variant, and key a merge on text the
            // glossary lookup never sees.
            await findSimilarSemantic(encodable, options.semantic.embedder, {
              glossary: glossaryIndex(doc.glossary),
              atomize: pipelineAtomize(doc),
              admitsMerge: glossaryMergeAdmission(doc, reqs.map(toEncodable)),
              ...(options.semantic.threshold !== undefined
                ? { threshold: options.semantic.threshold }
                : {}),
            })
          : []

      for (const f of semantic) {
        if (f.oppositePolarityVariant) {
          oppositeVariantPairs.set(f.requirementIds.join('|'), f.merge !== undefined)
        }
      }

      // #6: opt-in opposition-candidate proposals. Same embedder, propose-only —
      // emits FND_OPPOSITION_CANDIDATE for same-system responses that share an
      // object but differ on the leading verb and are not already unified as
      // antonyms, suggesting `symspec antonym add`. Cosine is only a
      // topical-relatedness floor; the structure is the signal. Never a verdict.
      const opposition =
        options.semantic !== undefined
          ? // The ENCODABLE rows through the pipeline's own atomizer, so the shape is also read
            // off the body every solver tier reads: after the committed glossary and terms.
            await findOppositionCandidates(encodable, options.semantic.embedder, {
              glossary: glossaryIndex(doc.glossary),
              atomize: pipelineAtomize(doc),
              ...(docAntonymIndex(doc) !== undefined
                ? { antonyms: docAntonymIndex(doc) as ReadonlyMap<string, AntonymEntry> }
                : {}),
            })
          : []

      // AC-32-2/4: always-on-when-semantic embedding graph. Builds a
      // deterministic kNN similarity graph over the INCLUDED requirements'
      // rendered sentences and proposes (info-only) missing trace links +
      // near-duplicate clusters. Reuses the same injected embedder as the
      // paraphrase pass; propose-only, never a verdict.
      const graph =
        options.semantic !== undefined
          ? await buildSimilarityGraph(
              included.map((r): GraphRequirement => {
                const full = doc.requirements[r.id]
                const linkedTo = full ? [...full.refines, ...full.derives, ...full.satisfies] : []
                return { id: r.id, text: r.sentence || r.systemResponse, linkedTo }
              }),
              options.semantic.embedder,
              options.semantic.threshold !== undefined
                ? { threshold: options.semantic.threshold }
                : {},
            )
          : []

      // AC-4-6: unsat-triggered findings carry the atom table + core.
      const withEvidence = attachEvidenceToAll(
        [...contradictions, ...subsumptions, ...vacuities],
        encodedById,
      )

      for (const f of withEvidence) {
        const requirementIds = f.code === 'FND_VACUITY' ? [f.requirementId] : [...f.requirementIds]
        formal.push({
          code: f.code,
          severity: f.severity,
          tier: 'formal',
          requirementIds,
          message: f.message,
          evidence: f.evidence,
        })
      }
      for (const f of [
        ...incompletes,
        ...similar,
        ...review,
        ...semantic,
        ...graph,
        ...opposition,
        ...quantityAliasCandidates,
        ...numberSpellingCandidates,
        ...numericUncompared,
        ...numericUnread,
      ]) {
        formal.push({
          code: f.code,
          severity: f.severity,
          tier: 'formal',
          requirementIds: [...f.requirementIds],
          message: f.message,
        })
      }

      // AC-30-3: numeric contradictions carry their own arithmetic-predicate
      // evidence (quantity + normalized comparators/values), distinct from the
      // atom-table evidence of the propositional checks.
      for (const f of numericContradictions) {
        formal.push({
          code: f.code,
          severity: f.severity,
          tier: 'formal',
          requirementIds: [...f.requirementIds],
          message: f.message,
          evidence: f.evidence,
        })
      }

      // AC-33-2: temporal contradictions carry bounded-check evidence.
      for (const f of temporalContradictions) {
        formal.push({
          code: f.code,
          severity: f.severity,
          tier: 'formal',
          requirementIds: [...f.requirementIds],
          message: f.message,
          evidence: f.evidence,
        })
      }

      // Issue #2: relational/aggregate blind-spot disclosures. Demotion-only
      // info findings that name the shared-trigger group whose aggregate or
      // cross-entity relation the pairwise numeric tier did not attempt.
      for (const f of relationalUnchecked) {
        const finding = relationalUncheckedFinding(f.requirementIds)
        formal.push({
          code: finding.code,
          severity: finding.severity,
          tier: 'formal',
          requirementIds: [...finding.requirementIds],
          message: finding.message,
        })
      }

      // `pairsChecked` counts pairs the pairwise tier COMPARED, so the tier's own
      // count of pairs it skipped before any implication solve comes off the
      // candidate total. Without the subtraction the coverage note reports every
      // atom-disjoint pair as "shared an atom and were compared", which is the
      // one statement that would hide a prune widening to eat real pairs.
      return { findings: [], pairsChecked: includedPairs.length - subsumption.pruned }
    },
  })

  // Free-tier projections: exact duplicates keep their FND code; the
  // free-tier weasel `Ambiguity` findings are superseded by GtWR (header).
  for (const f of report.findings) {
    if (f.kind === 'ExactDuplicate') {
      findings.push({
        code: 'FND_EXACT_DUPLICATE',
        severity: 'error',
        tier: 'lint',
        requirementIds: [...f.ids],
        message: f.message,
      })
    }
  }

  findings.push(...formal)

  // Formal-exclusion disclosure: emit one loud FND_EXCLUDED_FROM_FORMAL info
  // finding per requirement the AC-3-7 gate dropped, so a coverage hole the
  // solver never saw is visible in findings[] — not merely a count buried in
  // residualRisk. Each also DEMOTES `verified` below. This is the fix for the
  // "0 contradictions, verified: true, but a third of the doc was never checked"
  // false-confidence trap (both feedback sources).
  for (const ex of gateResult.excluded) {
    const blockingCodes = ex.findings.map((f) => f.code)
    const finding = excludedFromFormalFinding(ex.id, ex.reason, blockingCodes)
    findings.push({
      code: finding.code,
      severity: finding.severity,
      // A gate-phase coverage disclosure, NOT a solver output: the requirement
      // was excluded at the AC-3-7 gate (structural boundary) before
      // symbolization, so it is tagged 'structural'. This keeps it distinct from
      // formal-tier (solver) findings — nothing the SMT layer reasoned about
      // names an excluded requirement, but this disclosure deliberately does.
      tier: 'structural',
      requirementIds: [...finding.requirementIds],
      message: finding.message,
    })
  }

  // Wishlist #6: a formal tier that compared zero PAIRS proved nothing via the
  // pairwise (subsumption/redundancy) route. Emit a loud info finding (only when
  // there were ≥2 requirements that COULD have been related) so the coverage
  // gap is visible in findings[] rather than only in the numeric pairsChecked
  // field.
  //
  // BUT suppress it when a genuine cross-requirement finding already fired
  // (item 4): `pairsChecked` counts ONLY the pairwise tier's candidate pairs,
  // while the contradiction / numeric / temporal / similar tiers reason across
  // ALL requirements independent of that pair filter. So a `--temporal` (or
  // numeric, or contradiction) run can prove an error across two requirements
  // while `pairsChecked === 0` — and emitting "no two requirements were compared
  // across requirements" alongside a proven cross-requirement error is a
  // contradictory signal. The disclaimer is only truthful when NOTHING
  // cross-requirement fired.
  //
  // Condition: suppress when any accumulated formal finding either names ≥2
  // requirement ids (the primary signal — every genuine cross-requirement
  // finding names the ≥2 ids its analysis spanned) OR carries one of the known
  // cross-requirement conflict codes (a backstop for a degenerate unsat core
  // that minimized down to a single id). Single-requirement findings
  // (ambiguity, GtWR lint, a lone vacuity/needs-review naming one id) do NOT
  // suppress it, so the disclosure still fires when truly nothing was compared
  // across requirements.
  // A cross-requirement finding of ANY kind (verdict OR propose-only proposal)
  // means a comparison DID happen, so the "nothing was compared" disclaimer must
  // not fire alongside it (coverage-disclaimer lesson).
  //
  // EXCEPTION (adversarial review): the coverage-GAP codes are the opposite —
  // each spans ≥2 ids yet signals a comparison did NOT happen (a requirement was
  // excluded from the solver, two bounds landed on different keys, or aggregate/
  // relational reasoning was skipped). If one of those suppressed the disclaimer
  // via the `length >= 2` clause, the report would claim (residualRisk.
  // noPairsChecked=true) that nothing was compared while omitting the finding
  // that says so — an internal contradiction. So they never count as "a
  // comparison happened". The semantic-tier propose codes (opposition / similar /
  // missing-trace-link) still DO suppress: those come from a real embedding
  // comparison of the pair.
  const crossRequirementFired = formal.some(
    (f) =>
      (f.requirementIds.length >= 2 && !COVERAGE_GAP_FND_CODES.has(f.code)) ||
      CROSS_REQUIREMENT_FND_CODES.has(f.code),
  )
  // Wishlist #6 disclaimer: emit the FND_NO_PAIRS_CHECKED info finding when the
  // pairwise tier checked nothing AND no cross-requirement finding (of any kind)
  // fired. A single-requirement finding (ambiguity, lint, lone vacuity) does not
  // suppress it, so the disclosure still fires when truly nothing was compared.
  const noPairsChecked =
    report.pairsChecked === 0 && requirements.length >= 2 && !crossRequirementFired
  // Why nothing was compared, so neither the disclaimer nor the `no-decide-tier-comparison`
  // advice names a cause the coverage rows contradict: shared atoms are not a vocabulary gap,
  // and an exact-duplicate pair is reported rather than compared.
  const noPairsCause = {
    atomsShared: [...coverageAtomOwners.values()].some((o) => o.size >= 2),
    exactDuplicates: findings.some((f) => f.code === 'FND_EXACT_DUPLICATE'),
  }
  if (noPairsChecked) {
    const coverage = noPairsCheckedFinding(
      requirements.map((r) => r.id),
      noPairsCause,
    )
    findings.push({
      code: coverage.code,
      severity: coverage.severity,
      tier: 'formal',
      requirementIds: [...coverage.requirementIds],
      message: coverage.message,
    })
  }

  // Wishlist #3: drop findings suppressed by a committed waiver BEFORE tallying,
  // so the exit-code gate honors the waiver too. Count what was dropped so the
  // report can surface a reviewed-baseline `waived` number. Runs BEFORE the
  // `verified` computation because a waived opposition candidate is a triaged
  // one — it must stop demoting (agent-loop convergence).
  const waivers = doc.waivers ?? []
  let waived = 0
  const kept = findings.filter((f) => {
    if (waivers.some((w) => isWaived(f, w))) {
      waived += 1
      return false
    }
    return true
  })
  kept.sort(compareFindings)

  const counts = { error: 0, warn: 0, info: 0 }
  for (const f of kept) counts[f.severity] += 1

  // Wishlist #5, hardened after the Run 3 adversarial eval: `verified` is a
  // STRICTER claim than "something was compared" — it is "the decide tier
  // actually verified consistency across the WHOLE document". The eval's
  // winning shape was 10-12 requirements with dense shared guard vocabulary
  // buying one checked pair (verified=true under the old any-pair predicate)
  // while the genuinely conflicting responses sat on singleton atoms nobody
  // compared. The hardened predicate demotes on:
  //   - any gate-included requirement whose atoms are ALL singletons
  //     (participation — clause a);
  //   - any kept FND_OPPOSITION_CANDIDATE (untriaged possible conflict —
  //     clause b; waived candidates were triaged and do not demote);
  //   - no decide-tier cross-requirement comparison at all (clause c, the
  //     original predicate);
  //   - the semantic tier not running over a ≥2-requirement doc (clause d —
  //     the opposition detector is part of the certification surface).
  // Demotion-only invariant: propose-only findings and coverage stats can push
  // `verified` to false but NEVER to true — a fuzzy cosine proposal must not
  // quiet the "silence is not a consistency certificate" signal the `--strict`
  // gate rests on. Every demotion carries its discharging action so an agent
  // can iterate: apply the op (antonym add / glossary add / waive / rewrite),
  // re-run check, converge.
  const decideTierCrossReqFired = formal.some(
    (f) => f.requirementIds.length >= 2 && !PROPOSE_ONLY_FND_CODES.has(f.code),
  )
  const inconclusive =
    report.pairsChecked === 0 && requirements.length >= 2 && !decideTierCrossReqFired

  // AC-3-1: a requirement participates when (a) it was CO-LIVE with a peer it shares ≥1
  // atom with, in a context group the contradiction solver DECIDED — the only situation in
  // which the SMT conjunction actually asserted the two obligations together — OR (b) a
  // decide-tier cross-requirement finding names it (the numeric/temporal tiers compare
  // requirements the propositional groups cannot see). Sharing an atom is NOT enough: two
  // requirements under guards no group asserts together share their response atom and were
  // still never compared, which is exactly how the canonical feature-interaction conflict
  // earned `verified: true`.
  const decideFindingParticipants = new Set<string>()
  for (const f of formal) {
    if (f.requirementIds.length >= 2 && !PROPOSE_ONLY_FND_CODES.has(f.code)) {
      for (const id of f.requirementIds) decideFindingParticipants.add(id)
    }
  }
  const coLive = coLiveParticipants(contradictionGroups, coverageAtomOwners)
  const coverageRows: CoverageRequirementRow[] = [...coverageIncludedIds]
    .sort()
    .map((id): CoverageRequirementRow => {
      const singletons: string[] = []
      const vocabularyPeers = new Set<string>()
      const shares = decideFindingParticipants.has(id) || coLive.has(id)
      for (const [atomName, owners] of coverageAtomOwners) {
        if (!owners.has(id)) continue
        if (owners.size >= 2) {
          for (const peer of owners) if (peer !== id) vocabularyPeers.add(peer)
        } else singletons.push(atomName)
      }
      singletons.sort()
      return {
        id,
        participates: shares,
        unmatchedAtoms: singletons,
        ...(shares
          ? {}
          : {
              // A one-requirement document gets the TRUTH, not the rewrite
              // advice: there are no peers to share vocabulary with, and an
              // agent handed the generic suggestion would churn the only
              // requirement forever without ever changing this row.
              suggestion:
                requirements.length < 2
                  ? `${id} is the only requirement, so there is nothing to cross-compare yet. ` +
                    'Coverage begins when a second requirement lands (`symspec add`); this row ' +
                    'will then say whether the two share vocabulary.'
                  : vocabularyPeers.size > 0
                    ? // The vocabulary is ALREADY shared, so the rewrite-for-vocabulary advice
                      // would be wrong: what is missing is a context in which both hold.
                      `${id} shares atoms with ${[...vocabularyPeers].sort().join(', ')}, but no ` +
                      'context group the solver decided asserted it together with any of them: ' +
                      'their guards are only ever asserted separately, so their obligations were ' +
                      'never compared. symspec checks each distinct guard set on its own (asserting ' +
                      'unrelated guards together would fake conflicts between mutually exclusive ' +
                      'triggers) and cannot yet decide whether these guards co-occur. See any ' +
                      `\`conditional-conflict-unchecked\` demotion naming ${id}.`
                    : `Rewrite ${id} to share guard/response vocabulary with the requirements it ` +
                      'relates to, or link its terms via `symspec glossary "<canonical>" "<alias>"`/`symspec antonym <a> <b>` ' +
                      'so the formal tier can cross-compare it.',
            }),
      }
    })
  const uncoveredRows = coverageRows.filter((r) => !r.participates)

  const openOppositionFindings = kept.filter((f) => f.code === 'FND_OPPOSITION_CANDIDATE')
  // NOTE: the excluded-from-formal demotion is driven by `gateResult.excluded`
  // (a structural fact), NOT by the post-waiver `kept` set — see the demotion
  // loop below. Quantity-alias and relational demotions ARE keyed off `kept` on
  // purpose: those findings are genuinely triaged away by a waiver (the author
  // confirmed the quantities differ, or hand-verified the aggregate), which is a
  // legitimate discharge, unlike suppressing a coverage FACT.
  const quantityAliasFindings = kept.filter((f) => f.code === 'FND_QUANTITY_ALIAS_CANDIDATE')
  const relationalFindings = kept.filter((f) => f.code === 'FND_RELATIONAL_UNCHECKED')
  const numericUncomparedFindings = kept.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
  const numberSpellingFindings = kept.filter((f) => f.code === 'FND_NUMBER_SPELLING_CANDIDATE')

  const demotions: CoverageDemotion[] = []
  if (requirements.length >= 2) {
    for (const row of uncoveredRows) {
      demotions.push({
        reason: 'uncovered-requirement',
        requirementIds: [row.id],
        action: row.suggestion ?? '',
      })
    }
    // AC-3-2: two requirements whose responses conflict as written — one response atom at
    // opposite polarity, or contraries both asserted (AC-2-1) — under guards no planned
    // context group makes both live, are a conflict the solver never looked for: it asserts
    // each guard set on its own. Detect and demote: whether the guards can co-occur is not
    // something this tier can decide.
    for (const c of conditionalConflicts(coverageEncoded, formal)) {
      const what = c.contrary
        ? `demand contrary responses ("${c.responseA}" and "${c.responseB}": opposite sides of ` +
          'one antonym pair, which cannot both hold)'
        : `constrain the same response ("${c.responseA}") at opposite polarity`
      demotions.push({
        reason: 'conditional-conflict-unchecked',
        requirementIds: [c.a, c.b],
        action:
          `${c.a} and ${c.b} ${what}, ` +
          `under contexts that are never asserted together: ${c.a} applies ${describeContext(c.contextA)}` +
          ` and ${c.b} applies ${describeContext(c.contextB)}. No context group the solver checked ` +
          'makes both live, so it never tested whether they can hold at once — and if ' +
          `${c.union.map((t) => `"${t}"`).join(' and ')} can hold together, they conflict there. ` +
          'Decide whether those contexts can overlap. If they can, change one of the two ' +
          'requirements so it no longer demands the opposite of the other in the overlap, then ' +
          're-run `symspec check`. If they cannot, symspec has no way yet to record that the ' +
          'guards are mutually exclusive, so this stays demoted; it is not waivable, because ' +
          'nothing was decided.',
      })
    }
    // Excluded-from-formal: the solver never saw these requirements, so
    // `verified` cannot cover them. Discharged by fixing the blocking finding
    // (rephrase) — or by WAIVING that blocking finding, which the waiver-aware
    // gate honors by re-admitting the requirement (so `gateResult.excluded`
    // shrinks and this demotion disappears). It is computed from
    // `gateResult.excluded` (the structural fact), NOT from the post-waiver
    // finding set: waiving the DISCLOSURE code (`FND_EXCLUDED_FROM_FORMAL`)
    // hides the report line but must NEVER promote `verified` over a requirement
    // the solver still never saw — that would be a demotion-only violation
    // (a suppression is not a decide-tier proof). Adversarial-review hardened.
    for (const ex of gateResult.excluded) {
      demotions.push({
        reason: 'excluded-from-formal',
        requirementIds: [ex.id],
        action:
          `Rephrase ${ex.id} to clear the error-severity lint/parse finding that blocked it from ` +
          'the formal tier (see the finding message for the blocking code), then re-run `symspec ' +
          'check`: that is the only discharge that can reach `verified: true`. Alternatively, when ' +
          'the blocking finding is a lint whose wording a reviewer accepts as written, the repair ' +
          `carries a waive op of that code over exactly ${ex.id} and its current text (refs plus ` +
          'the content hash): the waiver-aware gate re-admits the requirement to the solver, but ' +
          'the run then demotes `waived-blocking-lint` in place of this demotion, so it cannot ' +
          'verify. The FND_EXCLUDED_FROM_FORMAL disclosure itself is never waivable.',
      })
    }
    // Quantity-alias candidates: a possible single-quantity numeric conflict
    // was never compared because two verb-phrasings split one quantity.
    for (const f of quantityAliasFindings) {
      demotions.push({
        reason: 'quantity-alias-candidate',
        requirementIds: [...f.requirementIds],
        action:
          'Two co-active opposed numeric bounds landed on different quantity keys. If they ' +
          'constrain one physical quantity, commit the `symspec glossary "<canonical>" "<alias>"` alias from the ' +
          "finding's message so the numeric tier compares them; otherwise reword one so each " +
          'names its own quantity in different words. Then re-run `symspec check`.',
      })
    }
    // Relational/aggregate blind spot: the pairwise same-quantity numeric tier
    // did not attempt aggregate sums or cross-entity relations under this shared
    // trigger. An honest "not attempted" caveat, dischargeable by hand-verifying
    // (then waiving) or restating as a same-quantity bound.
    for (const f of relationalFindings) {
      demotions.push({
        reason: 'relational-reasoning-not-attempted',
        requirementIds: [...f.requirementIds],
        action:
          `Aggregate/cross-quantity reasoning over ${f.requirementIds.join(', ')} was not attempted ` +
          '(the numeric tier is pairwise same-quantity only). Restate the constraint as a ' +
          'same-quantity numeric bound the solver can check: a relation the tier did not attempt ' +
          'is discharged only by a restatement it decides, never by accepting it as written.',
      })
    }
    // Numeric bounds the tier neither proved nor dismissed: a verdict that turns on a
    // reading the sentences do not fix is not a comparison that happened.
    // A finding naming one requirement is a quantity the tier never read a bound on
    // (`disclosureOfUnreadQuantities`), so it has no partner to be consistent with.
    for (const f of numericUncomparedFindings) {
      demotions.push({
        reason: 'numeric-bounds-uncompared',
        requirementIds: [...f.requirementIds],
        action:
          f.requirementIds.length === 1
            ? `${f.requirementIds[0]} states a quantity the numeric tier read no bound on, so it ` +
              "was compared with nothing (the finding's message names it). Restate it after a " +
              'comparator phrase the tier reads so the numeric tier can decide it. Then re-run ' +
              '`symspec check`.'
            : `The numeric bounds of ${f.requirementIds.join(', ')} were neither proved nor dismissed ` +
              "(the finding's message says which reading splits them). Restate them in one sense and " +
              'one recognized unit so the numeric tier can decide them. Then re-run `symspec check`.',
      })
    }
    // AC-2-4: a number spelled with two digit separators. Off the KEPT set, so the reviewed
    // waiver that declares the two numbers different discharges it.
    for (const f of numberSpellingFindings) {
      demotions.push({
        reason: 'number-spelling-candidate',
        requirementIds: [...f.requirementIds],
        action:
          `${f.requirementIds.join(' and ')} write one phrase with numbers that differ only in a ` +
          'digit separator, on two atoms the solver never compared. If they are one number, ' +
          'rewrite one with `symspec update --ref <id> <attr> "<wording>"` so both spell it identically, then re-run `symspec ' +
          'check`: the shared atom makes any conflict provable. If they are different numbers, ' +
          'rewrite one so both follow one digit-separator convention.',
      })
    }
    // AC-3-6: an untriaged opposite-polarity inflection variant is a possible
    // contradiction on two atoms, so it demotes exactly like an opposition candidate:
    // off the KEPT set, so the waiver that declares the pair distinct discharges it.
    for (const f of kept) {
      if (f.code !== 'FND_SIMILAR_SEMANTIC') continue
      const hasMerge = oppositeVariantPairs.get(f.requirementIds.join('|'))
      if (hasMerge === undefined) continue
      demotions.push({
        reason: 'opposite-polarity-near-duplicate',
        requirementIds: [...f.requirementIds],
        action:
          `${f.requirementIds.join(' and ')} respond with the same words up to inflection or ` +
          'number at OPPOSITE polarity, or as contraries under the committed antonyms, on two ' +
          'different atoms or keys, so if they mean one thing they contradict each other and ' +
          'the solver cannot see it. ' +
          (hasMerge
            ? 'If they are the same, commit the `symspec glossary "<canonical>" "<alias>"` merge from the finding\'s ' +
              'message: it puts both on one atom at opposite polarity, or on one antonym key as ' +
              'contraries. The solver then compares them wherever a checked context makes both ' +
              'live; if their guards are never asserted together, the pair stays demoted as ' +
              '`conditional-conflict-unchecked` until you settle whether the guards can overlap. '
            : "If they are the same, rewrite one to use the other's words: no glossary merge is " +
              'offered, because every merge of these phrasings aliases a phrase to its own ' +
              'opposite or splits an atom the document already shares. ') +
          'If they are genuinely distinct, reword one so the two plainly name different actions. ' +
          'Then re-run `symspec check`.',
      })
    }
    // A glossary entry naming two contraries as one action: its consequence (neither action ever
    // happens) is not decided. The atomizer keeps the contraries apart and links each requirement's
    // phrase to the entry under its own guard, so a conflict still takes two requirements; one
    // requirement demanding either action is impossible alone, and no tier reports that.
    const glossaryEntries = new Map(doc.glossary.map((e) => [normalize(e.canonical), e]))
    for (const entry of glossaryContraries(
      glossaryIndex(doc.glossary),
      docAntonymIndex(doc),
      termIndex(doc.terms ?? []),
    )) {
      const phrases = new Set(entry.phrases)
      const ids = requirements
        .filter((r) => phrases.has(normalize(r.systemResponse)))
        .map((r) => r.id)
        .sort()
      if (ids.length === 0) continue
      const stored = glossaryEntries.get(entry.canonical)
      const spelled = (phrase: string) =>
        stored?.aliases.find((a) => normalize(a) === phrase) ?? phrase.replace(/_/g, ' ')
      const canonical = stored?.canonical ?? entry.canonical.replace(/_/g, ' ')
      const removals = [...new Set(entry.contraries.flat())]
        .filter((phrase) => phrase !== entry.canonical)
        .map(
          (phrase) =>
            `\`symspec glossary ${shellQuoted(canonical)} ${shellQuoted(spelled(phrase))} --remove\``,
        )
      demotions.push({
        reason: 'contrary-glossary-alias',
        requirementIds: ids,
        action:
          `The glossary entry "${canonical}" names contraries as one action (` +
          entry.contraries
            .map(([p, q]) => `"${p.replace(/_/g, ' ')}" / "${q.replace(/_/g, ' ')}"`)
            .join(', ') +
          '). The antonym table says the two cannot both happen, so an entry saying they are ' +
          'one action says neither ever happens. The formal tier keeps each contrary phrase on ' +
          'its own atom and links it to the entry, so two requirements the entry puts at odds ' +
          'are still compared, but a requirement above that demands either action is impossible ' +
          'on its own, and nothing reports that. ' +
          'If they are two actions, remove the alias that names the opposite one: ' +
          `${removals.join(' or ')}. Then re-run \`symspec check\`.`,
      })
    }
    for (const f of openOppositionFindings) {
      demotions.push({
        reason: 'open-opposition-candidate',
        requirementIds: [...f.requirementIds],
        // The waiver named here is the exact-pair one the repair carries: a candidate is often
        // a pair a base build PROVED, so a document-wide or one-requirement waiver would
        // certify every other candidate it reaches, none of which anyone triaged.
        action:
          `Triage the opposition candidate over ${f.requirementIds.join(' and ')}: make the pair ` +
          "provable with the edit the finding's message names (the rewrite, `symspec antonym <verbA> <verbB>` " +
          'if the verbs are opposites, or `symspec glossary "<canonical>" "<alias>"` if synonyms), or, if the two do ' +
          'not conflict, reword one so they no longer read as opposite responses: a candidate is ' +
          'decided by an edit, never by accepting it as written. Then re-run `symspec check`.' +
          unappliedNote(unappliedWaivers(f, waivers)),
      })
    }
    if (inconclusive) {
      // When the requirements ALREADY share vocabulary, "align vocabulary" is the wrong
      // advice, and the cause the prose names must agree with the coverage rows: an
      // exact-duplicate pair is reported rather than compared; requirements no decided group
      // asserted together are named by the rows and any `conditional-conflict-unchecked` /
      // `solver-unknown` demotion; and co-live requirements may still yield no candidate pair.
      const action = !noPairsCause.atomsShared
        ? 'No cross-requirement comparison happened. Align vocabulary across requirements (shared ' +
          'guards/objects) or commit glossary/antonym links so the decide tier can compare pairs.'
        : noPairsCause.exactDuplicates
          ? 'No decide-tier pair comparison was recorded. The requirements share atoms, but an ' +
            'exact-duplicate pair is reported as FND_EXACT_DUPLICATE rather than compared. Delete ' +
            'one copy of each duplicate, then re-run `symspec check`.'
          : coLive.size === 0
            ? 'No cross-requirement comparison happened. The requirements share atoms, but no ' +
              'context group the solver decided asserted any two of them together, so no pair ' +
              'was compared — see `coverage.requirements` and any `conditional-conflict-unchecked` ' +
              'or `solver-unknown` demotion for which.'
            : 'No decide-tier pair comparison was recorded. The requirements share atoms and ' +
              'some were asserted together in a decided context group, but no pair of them was ' +
              'a candidate for the pairwise tier — see `coverage.requirements`.'
      demotions.push({
        reason: 'no-decide-tier-comparison',
        requirementIds: requirements.map((r) => r.id),
        action,
      })
    }
    // AC-3-5: the stub ran in the model's place. Inside the ≥2 guard with
    // `semantic-tier-skipped`, for the same reason: with fewer than two requirements the
    // semantic tier has nothing to compare, so which embedder ran cannot weaken anything.
    if (options.semantic?.stub === true) {
      demotions.push({
        reason: 'run-weakened',
        requirementIds: [],
        action:
          'The semantic tier ran on the deterministic TEST stub embedder (SYMSPEC_EMBED_STUB=1), ' +
          'whose cosines are a hash rather than a similarity, so opposition candidates and ' +
          'paraphrase merges the pinned model would propose may be missing — this run cannot ' +
          'certify. Unset SYMSPEC_EMBED_STUB and re-run `symspec check` (pre-warm an air-gapped ' +
          'host with `symspec download-model`). Waiving cannot discharge this: nothing was compared.',
      })
    }
    // Invariant I-1: a semantic threshold RAISED above the measured default is a
    // run-weakening move too. The paraphrase pass only proposes pairs at or above it, and the
    // AC-3-6 near-duplicate demotion rides on those proposals, so one run with a high
    // threshold drops a demotion the pinned run keeps. Lowering it only proposes more.
    const threshold = options.semantic?.threshold
    if (threshold !== undefined && threshold > DEFAULT_SEMANTIC_THRESHOLD) {
      demotions.push({
        reason: 'run-weakened',
        requirementIds: [],
        action:
          `The semantic tier ran with --semantic-threshold ${threshold}, above the measured ` +
          `default of ${DEFAULT_SEMANTIC_THRESHOLD}, so paraphrase merges and near-duplicate ` +
          'demotions the default run would raise may be missing — this run cannot certify. ' +
          'Re-run `symspec check` without --semantic-threshold (or with a value at or below ' +
          'the default). Waiving cannot discharge this: nothing was compared.',
      })
    }
    if (options.semantic === undefined) {
      demotions.push({
        reason: 'semantic-tier-skipped',
        requirementIds: [],
        action:
          'The semantic/opposition tier did not run, so untriaged opposition candidates may exist. ' +
          'Run `symspec check` via the CLI (which loads the embedding model), or supply an embedder ' +
          'to runCheck; pre-warm an air-gapped host with `symspec download-model`.',
      })
    }
  }

  // AC-4-7 — the per-group `unknown`. Membership in PROPOSE_ONLY_FND_CODES stops an
  // undecided group from CERTIFYING, but on its own it does not make one DEMOTE: a
  // document with one decided pair and one undecided group would otherwise report
  // `verified: true` while the solver said "I don't know" about part of it. An
  // undecided group is a coverage fact, so it gets the same treatment as a truncated
  // tier — its own demotion, naming the group's members and the raise-the-timeout
  // action.
  //
  // Outside the `requirements.length >= 2` guard for the same reason truncation is:
  // that guard encodes "a spec with <2 requirements is VACUOUSLY verified", which
  // holds only when the tiers ran to completion. An `unknown` is a statement about
  // the RUN.
  //
  // Keyed off the raw `formal` set rather than the post-waiver `kept` set, matching
  // `excluded-from-formal`: waiving the FND_NEEDS_REVIEW disclosure hides the report
  // line but the group is still undecided, and a suppression is not a decision.
  for (const f of formal.filter((f) => f.code === 'FND_NEEDS_REVIEW')) {
    demotions.push({
      reason: 'inconclusive-group',
      requirementIds: [...f.requirementIds],
      action:
        `The solver returned unknown for the context group covering ${f.requirementIds.join(', ')} ` +
        '(undecidable within the per-group timeout, or the timeout fired), so that group was never ' +
        'decided — an unknown is never read as "no conflict". Raise --timeout-ms and re-run ' +
        '`symspec check`. Suppressing FND_NEEDS_REVIEW cannot discharge this: the group is still undecided.',
    })
  }

  // AC-1-7 — the soundness-critical demotion. A run whose `--solver-budget-ms`
  // deadline cut a tier short did NOT compare everything it would otherwise have
  // compared, so it must not certify. One demotion per truncated tier, naming the
  // unrun unit count, with the raise-the-budget action.
  //
  // Deliberately OUTSIDE the `requirements.length >= 2` guard above. That guard
  // encodes "a spec with <2 requirements is VACUOUSLY verified" — true only when
  // the tiers actually ran to completion. Truncation is a statement about the
  // RUN, not about the document's size, so it demotes unconditionally. This is
  // the one demotion reason a small document cannot escape.
  //
  // Not waiver-discharged: `demotions` is not derived from the finding set here,
  // so waiving a code cannot suppress it. Truncation is a coverage FACT (the same
  // reasoning that keeps `excluded-from-formal` keyed off `gateResult.excluded`
  // rather than the post-waiver `kept` set) — a suppression is not a comparison.
  for (const t of solverBudget?.truncations() ?? []) {
    demotions.push({
      reason: 'solver-budget-exhausted',
      // No specific requirement is at fault: the whole run was cut short. An
      // empty id list matches the `semantic-tier-skipped` precedent for a
      // run-scoped (not requirement-scoped) demotion.
      requirementIds: [],
      action:
        `The ${t.tier} tier stopped after the whole-run --solver-budget-ms deadline ` +
        `(${solverBudget?.budgetMs ?? 0}ms) expired, leaving ${t.skipped} unit(s) of work unrun, so ` +
        'this run compared less than it would have. Raise --solver-budget-ms (or reduce the ' +
        'document / raise --similarity-threshold to shrink the candidate-pair set), then re-run ' +
        '`symspec check`. Waiving a finding cannot discharge this — the comparison did not happen.',
    })
  }
  // AC-3-4 — an `unknown` INSIDE the contradiction enumeration, or in the temporal
  // tier's joint check. Recorded at the call that returned it rather than inferred from
  // the needs-review tier: that tier runs its OWN solve of each group, and a group whose
  // enumeration stopped at an `unknown` after one reported conflict (or whose second
  // check timed out where the first did not) is decided there just often enough to hide
  // the gap. Outside the ≥2-requirement guard for the reason truncation is: it is a
  // statement about the RUN. Not waiver-discharged: there is no finding behind it.
  for (const g of contradictionGroups.filter((g) => g.outcome === 'unknown')) {
    const where =
      g.contextAtoms.length === 0
        ? 'the unconditional (baseline) context group'
        : `the context group asserting ${g.contextAtoms.join(' ∧ ')}`
    demotions.push({
      reason: 'solver-unknown',
      requirementIds: [...g.liveIds],
      action:
        `The contradiction tier's solver returned unknown inside ${where}` +
        (g.liveIds.length > 0 ? ` (live: ${g.liveIds.join(', ')})` : '') +
        ', so its enumeration stopped there and any conflict it had not yet reached was never ' +
        'looked for — an unknown is never read as "no conflict", and a conflict already reported ' +
        'for this group does not mean it was the only one. Raise --timeout-ms and re-run `symspec check`.',
    })
  }
  for (const u of tierUnknowns) {
    demotions.push({
      reason: 'solver-unknown',
      requirementIds: [...u.requirementIds],
      action:
        `The ${u.tier} tier's solver returned unknown for its check over ` +
        `${u.requirementIds.join(', ')}, so that check decided nothing — an unknown is never read ` +
        'as "no conflict". Raise --timeout-ms and re-run `symspec check`.',
    })
  }
  const verified = demotions.length === 0
  const encodedCount = coverageIncludedIds.length
  const excludedCount = gateResult.excluded.length
  const pairsCheckedNote =
    requirements.length < 2
      ? 'Fewer than two requirements: nothing to cross-compare.'
      : `${encodedCount} requirement(s) reached the formal tier` +
        (excludedCount > 0 ? ` (${excludedCount} excluded by blocking lint/parse findings)` : '') +
        `; ${report.pairsChecked} candidate pair(s) shared an atom and were compared. A low count ` +
        'is expected for requirements describing disjoint transitions across different ' +
        'systems/triggers — a singleton with no same-context peer is not a coverage gap. ' +
        'Non-participating requirements are listed in `coverage.requirements` with a rewrite hint.'
  const coverageReport: CoverageReport = {
    requirements: coverageRows,
    openOppositionCandidates: openOppositionFindings.length,
    demotions,
    encoded: encodedCount,
    excluded: excludedCount,
    pairsCheckedNote,
  }

  // Wishlist #5b: roll the residual-risk axes up from the KEPT (post-waiver)
  // finding set, so a waived residual-risk finding drops out of the summary too.
  const residualRisk: ResidualRisk = {
    similarUnunifiedPairs: kept.filter((f) => f.code === 'FND_SIMILAR_UNUNIFIED').length,
    semanticSuggestions: kept.filter((f) => f.code === 'FND_SIMILAR_SEMANTIC').length,
    pairsChecked: report.pairsChecked,
    noPairsChecked: report.pairsChecked === 0,
    excludedRequirements: gateResult.excluded.length,
    unmatchedAtoms,
    uncoveredRequirements: uncoveredRows.length,
  }

  // Wishlist #4: resolve the opt-in strict coverage gate. It runs only when a
  // gate was requested; when it runs it fails if the run is inconclusive (under
  // `--strict`) OR the unmatched-atom count exceeds the `--fail-on-unmatched`
  // threshold. A tripped gate maps to EXIT_INCONCLUSIVE unless an error-severity
  // finding already claims the stronger EXIT_FINDINGS_FAILURE (resolved in
  // exit.ts). Left undefined when no gate was requested so a default run's
  // contract is untouched.
  const gateRequested = options.strict === true || options.failOnUnmatched !== undefined
  const gateTripped =
    (options.strict === true && !verified) ||
    (options.failOnUnmatched !== undefined && unmatchedAtoms > options.failOnUnmatched)
  const strictGate: 'pass' | 'fail' | undefined = gateRequested
    ? gateTripped
      ? 'fail'
      : 'pass'
    : undefined

  return {
    findings: kept,
    excluded: gateResult.excluded,
    pairsChecked: report.pairsChecked,
    waived,
    counts,
    residualRisk,
    coverage: coverageReport,
    verified,
    ...(strictGate !== undefined ? { strictGate } : {}),
    run: {
      embedder:
        options.semantic === undefined ? 'off' : options.semantic.stub === true ? 'stub' : 'model',
      ...(options.semantic !== undefined
        ? { semanticThreshold: options.semantic.threshold ?? DEFAULT_SEMANTIC_THRESHOLD }
        : {}),
    },
  }
}
