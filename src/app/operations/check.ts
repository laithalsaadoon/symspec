/**
 * `check` — the formal conflict detector, and the reason symspec exists.
 *
 * ## What this operation is, structurally
 *
 * A thin Effect shell over the engine pipeline (`engine/pipeline/check.ts`), plus two
 * v5 additions its report shape does not carry. The boundary keeps one property: every
 * behavioral claim this tool makes about a proof comes from the engine's own verdict —
 * this file adds only at the seam, and never rewrites a verdict inside it.
 *
 * The shell's four jobs:
 *
 * 1. Project the v3 document onto the v2 view the tier reads (`../formal/compat.ts`
 *    — one function, one crossing).
 * 2. Run `runCheck` THROUGH the `SolverService` Layer, so every solver call rides
 *    the Layer-owned WASM instance and the process can exit cleanly.
 * 3. Add the v5 fields: `repair` on every demotion (AC-A-1), `data.progress`
 *    (AC-A-2), and `data.budgetHint` (AC-A-8, G3) — all ADDITIVE, so the tier's own
 *    `findings` / `demotions` / `verified` pass through unmodified and a reader can tell
 *    which parts of the envelope the tier decided from which parts this shell added.
 * 4. Validate the option surface up front, with v4's exact usage errors.
 *
 * ## Why the whole run is ONE Effect.promise and not per-tier Effects
 *
 * `runCheck` is a plain `async` function that internally calls seven solver tiers.
 * Effect-izing its interior would thread a framework through the whole proof core for
 * no behavioral gain. So the whole run is wrapped once, and the interruption
 * discipline is satisfied differently but soundly:
 *
 * - the Layer OWNS the module, so the process can always be brought to a clean
 *   exit by closing the scope;
 * - the tiers' own `--timeout-ms` (per-solver `solver.set('timeout', …)`) and
 *   `--solver-budget-ms` (whole-run deadline, consulted between tiers) are the
 *   in-band bounds, and they are v4's, unchanged;
 * - `SolverService.solve` / `interruptibleSolve` remains the sanctioned primitive
 *   for anything the greenfield writes NEW against Z3 — which in G2a is the guard
 *   test, and in G4 will be the Spacer reachability tier.
 *
 * The honest limit, stated rather than papered over: interrupting THIS operation
 * mid-`runCheck` (an outer `Effect.timeout`, a SIGINT) abandons whatever query is
 * in flight, which wedges the module for the rest of the process. That is
 * acceptable here and only here, because `check` is the last thing a CLI process
 * does before emitting its envelope and exiting — there is no "rest of the
 * process" to protect. It would NOT be acceptable in a long-lived server, and
 * {@link CHECK_IS_TERMINAL} records that so a future server surface has to
 * confront it.
 *
 * ## The temporal bound's cap is a MEASUREMENT, not a taste
 *
 * `--temporal-bound` is capped at 200 and the cap is enforced here with the
 * v4's exact rationale, because the encode phase is NOT interruptible by either
 * budget knob: `--timeout-ms` is a per-solver setting and the cost is paid building
 * the term graph before any solver sees it, while `--solver-budget-ms` is consulted
 * only BEFORE the tier starts (temporal is one whole-spec unit of work). So a large
 * bound is a denial of service with no abort. Donor measurements, carried verbatim
 * because they are the justification: 100 requirements at k=200 → 13.5s / 2.0 GB;
 * at k=300 → 55s / 4.0 GB, which is Node's default heap limit — the process aborts
 * with no envelope at all. 200 is the last bound with headroom under that cliff.
 */

import { Effect, Schema } from 'effect'
import { type BudgetHint, budgetHintFor } from '../../domain/advice/budget-hint.ts'
import { repairForDemotion } from '../../domain/advice/repair.ts'
import { type IgnoredWaiver, toEngineDoc } from '../../domain/compat.ts'
import {
  belowPinned,
  type EffectivePins,
  effectivePins,
  type GatePins,
  KNOB_DEFAULTS,
  type Knob,
  MAX_TEMPORAL_BOUND,
  pinDemotionAction,
  pinnedInvocation,
  type RunSettings,
  resolveReachabilityTimeoutMs,
} from '../../domain/config/config.ts'
import type { Embedder } from '../../domain/engine/formal/embed.ts'
import { DEFAULT_SEMANTIC_THRESHOLD } from '../../domain/engine/formal/semantic.ts'
import type {
  CheckFinding,
  CheckOptions,
  CheckReport,
  CheckSeverity,
  CheckTier,
  CoverageDemotion,
  RunDisclosure,
} from '../../domain/engine/pipeline/check.ts'
import { filterReport, runCheck } from '../../domain/engine/pipeline/check.ts'
import type { Exclusion } from '../../domain/engine/pipeline/gate.ts'
import { type ReachabilityReport, runReachability } from '../../domain/reachability/reachability.ts'
import {
  projectReachability,
  type ReachabilityFinding,
} from '../../domain/reachability/reachability-report.ts'
import { requirementsContentHash } from '../../domain/requirements/content-hash.ts'
import type {
  DocumentDiagnostic,
  RequirementsDocument,
} from '../../domain/requirements/document.ts'
import { runTerminology } from '../../domain/terminology/terminology.ts'
import {
  type AppliedWaiver,
  accountWaivers,
  isLintCode,
  lintFindingScopes,
  suppressedByCrossed,
  waivedBlockingIds,
} from '../../domain/waiver-accounting.ts'
import { runnableInProse } from '../../ports/command-form.ts'
import {
  CONFIG_PATH_CONVENTION,
  type ConfigLocation,
  DocPath,
  DocStore,
} from '../../ports/doc-store.ts'
import { EmbedderService } from '../../ports/embedder.ts'
import { ErrSolverInconclusive, ErrUsage } from '../../ports/errors.ts'
import { SolverService } from '../../ports/solver.ts'
import { ok, type Repair } from '../runtime/envelope.ts'
import { defineOperation } from '../runtime/operation.ts'
import type { AppDemotionReason } from '../runtime/signal-classes.ts'

// ---------------------------------------------------------------------------
// The two bounds that are policy, stated as values
// ---------------------------------------------------------------------------

// `MAX_TEMPORAL_BOUND` (see the module header for its measurements) and
// `resolveReachabilityTimeoutMs` (see `REACHABILITY_TIMEOUT_IS_CANCELLABILITY` below) live in
// `domain/config/config.ts`, beside the pinned-config table that compares on them, and are
// re-exported here where the flags they govern are defined.
export { MAX_TEMPORAL_BOUND, resolveReachabilityTimeoutMs }

/**
 * `check` is the TERMINAL operation of a CLI process, and that is what makes
 * wrapping `runCheck` in a single `Effect.promise` sound.
 *
 * A `false` here would mean the process outlives the check — a server, a watch
 * mode, a batch runner — and then an interrupted `runCheck` would leave the WASM
 * module wedged for every subsequent request. The fix at that point is to route
 * each tier through `SolverService.solve`, which means Effect-izing the engine's
 * interior. Recorded as a value so that trade is a deliberate
 * decision rather than a surprise.
 */
export const CHECK_IS_TERMINAL = true

/**
 * The reachability tier's per-query bound is a CANCELLABILITY mechanism, not merely a
 * budget — which is why `--reachability-timeout-ms 0` inherits `--timeout-ms` rather than
 * meaning "unbounded".
 *
 * MEASURED on z3-solver 5.0.0 (the G4 probe that settled whether worker isolation is
 * needed):
 *
 * | what was interrupted | latency |
 * |---|---|
 * | raw `Z3.interrupt(ctx)`, 300ms into a 10s-budgeted query | 3ms |
 * | `Fiber.interrupt` through the tier, same model, `timeoutMs: 10_000` | 10232ms |
 *
 * The second number is the query's OWN timeout, and it is not a coincidence:
 * `Z3_interrupt` sets a cancel flag Spacer checks at its own yield points and does not
 * check at all of them, and the canceler must AWAIT the in-flight promise (that await is
 * what releases Asyncify's single capability slot — dropping it wedges the module). So
 * when the flag is not observed, cancellation costs what the query would have cost anyway.
 *
 * The honest guarantee: **cancellation is bounded by the per-query timeout, and the module
 * survives it.** An unbounded query is an uncancellable one, which is a second independent
 * reason never to offer `--reachability-timeout-ms 0` as "unbounded, thorough" — on top of
 * the V14/V21 unkillable-hang hazard.
 *
 * Recorded as a value so a future `0 means unbounded` proposal has to confront the
 * measurement rather than rediscover it.
 */
export const REACHABILITY_TIMEOUT_IS_CANCELLABILITY = true

// ---------------------------------------------------------------------------
// The v5 report additions
// ---------------------------------------------------------------------------

/**
 * A demotion with its runnable remedy attached (spec AC-A-1).
 *
 * `repair` is OPTIONAL, and the absence is meaningful rather than an omission: an
 * `uncovered-requirement` demotion discharges through a human rewrite, and there
 * is no command that performs one. Emitting an empty `{ops:[],commands:[]}` would
 * tell an agent "there is a repair, it is nothing"; omitting the key says "no
 * mechanical fix exists, read `action`". See `../formal/repair.ts`.
 */
export interface RepairableDemotion extends Omit<CoverageDemotion, 'reason'> {
  /**
   * The engine's reasons, each greenfield tier's, and `waived-blocking-lint`, which `check`
   * raises at the boundary (spec 007 AC-5-6, G3): every reason `DEMOTION_CLASS` classifies.
   */
  readonly reason: AppDemotionReason
  readonly repair?: Repair
}

/**
 * The GRADIENT an agent iterates against (spec AC-A-2).
 *
 * `verified: false` is a work list, not a verdict, and an agent applying repairs
 * needs to know whether it is converging. Three numbers, chosen because each falls
 * for a different reason and together they cover every discharge path:
 *
 * - `demotions` — how many reasons `verified` is still false. Falls when a demotion
 *   is discharged (a committed glossary/antonym link, a reviewed waiver, a rewrite).
 * - `openFindings` — how many error-severity findings remain. Falls when a real
 *   conflict is fixed. Deliberately error-only: warn/info findings are outside the
 *   pass/fail gate, so counting them would make the gradient move on changes that
 *   do not affect the outcome.
 * - `atomsUncompared` — how many atoms have no cross-requirement partner. Falls
 *   when vocabulary is aligned, which is the lever behind most
 *   `uncovered-requirement` demotions and the one an agent can act on without
 *   understanding the domain.
 *
 * All three reaching zero is exactly the fixed point: no demotions means
 * `verified` is true, no error findings means exit 0, no uncompared atoms means the
 * formal tier saw the whole document.
 */
export interface CheckProgress {
  /** Open demotion count — `verified` is true exactly when this is 0. */
  readonly demotions: number
  /** Error-severity findings remaining. Excludes warn/info by design. */
  readonly openFindings: number
  /** Atoms owned by exactly one requirement, so never cross-compared. */
  readonly atomsUncompared: number
}

/**
 * What the reachability tier did, as numbers an agent can act on (G4).
 *
 * Reported alongside the findings rather than instead of them: the findings carry the
 * evidence and the remedies, and this is the one-glance answer to "how much of my state
 * model did the solver actually decide?" — the same job `coverage.encoded` does for the
 * propositional tier.
 *
 * `elapsedMs` is REPORTED, never gated on. The latency budget lives in the feasibility
 * gate, which is a separate artifact for a reason v4 learned the hard way: a
 * budget enforced inside the tier is a budget that silently changes verdicts.
 */
export interface ReachabilitySummary {
  /** Declared state variables. */
  readonly variables: number
  /** Requirements contributing a transition. */
  readonly effects: number
  /** Constraints the tier actually decided. */
  readonly constraints: number
  /** Constraints PROVED with nothing assumed (frame-closed). */
  readonly proved: number
  /** Constraints proved only under the declared frames — each DEMOTES. */
  readonly provedUnderHypotheses: number
  /** Constraints with a reachable violation, each an error-severity finding. */
  readonly violated: number
  /** Constraints the solver did not decide — each DEMOTES. */
  readonly unknown: number
  /** Total wall-clock ms across every reachability query. Reported only. */
  readonly elapsedMs: number
  /** The per-query timeout used, so an `unknownReason` is interpretable. */
  readonly timeoutMs: number
}

/**
 * The `check` payload: v4's report shape, plus the two v5 additions.
 *
 * Every engine field keeps its name and meaning — `findings`, `excluded`,
 * `pairsChecked`, `waived`, `counts`, `residualRisk`, `coverage`, `verified`,
 * `strictGate`. That is agent API, not legacy. `progress` and the `repair` inside
 * `coverage.demotions[]` are ADDITIVE, so a consumer reading only the tier's fields sees
 * exactly what the tier decided, and the two v5 fields are separable from it by name.
 */
/** The terminology tier's coverage counters, as published on the payload. */
export interface TerminologySummary {
  /** Committed vocabulary keys occurring in two or more requirements of one system. */
  readonly keysExamined: number
  /** Requirement pairs whose slot texts were compared by cosine. */
  readonly pairsCompared: number
  /** Distinct acronyms found in the document text, the shared common ones excluded. */
  readonly acronymsExamined: number
}

/**
 * `data.run`: the engine's disclosure of what the run was made of, plus the pins it was
 * compared against when a `symspec.config.json` exists (spec 007 AC-5-10).
 *
 * The three pin keys are ABSENT with no config, so a document with no config reports exactly
 * the engine's `run`, byte for byte.
 */
export interface PinnedRunDisclosure extends RunDisclosure {
  /**
   * The config the pins were read from, and the rule that chose it: `toplevel` (the
   * repository's), `directory` (no repository), or `flag`/`env` (named explicitly). A CI job
   * asserts `source` and `path` to know the committed config governed the run.
   */
  readonly config?: ConfigLocation
  /** The effective pins, per knob. */
  readonly pinned?: EffectivePins
  /** The knobs this run ran below their pin, each also a `run-weakened` demotion. */
  readonly belowPinned?: readonly Knob[]
}

export interface CheckPayload extends Omit<CheckReport, 'coverage' | 'run'> {
  readonly run: PinnedRunDisclosure
  readonly coverage: Omit<CheckReport['coverage'], 'demotions'> & {
    readonly demotions: readonly RepairableDemotion[]
  }
  /** The v5 iteration gradient (AC-A-2). */
  readonly progress: CheckProgress
  /**
   * The unbounded reachability tier's own summary (G4) — present ONLY when a state model
   * is committed.
   *
   * ABSENT, not empty, on a document with no state model: the tier did not run, so it has
   * no numbers to report. The tier's own "I did not run" disclosure travels as a FINDING
   * (`FND_REACHABILITY_NOT_CHECKED`, info, no demotion) rather than as this field, because a
   * disclosure an agent has to know to look for is not a disclosure.
   *
   * See `../formal/reachability.ts` for what the numbers mean and
   * `../formal/reachability-report.ts` for how they become findings.
   */
  readonly reachability?: ReachabilitySummary
  /**
   * What the terminology tier EXAMINED — present ONLY when the semantic tier ran.
   *
   * Absent under `--semantic=false`, so the absence means "the tier did not run" and a
   * zero means "it ran and had nothing to look at". Those are different facts with
   * different remedies (supply an embedder vs commit some vocabulary), and reporting both
   * as silence is the shape `FND_NO_PAIRS_CHECKED` exists to prevent.
   *
   * Counters only. The tier's findings travel in `findings[]` like every other tier's, and
   * it contributes no demotion at all — see `../../domain/terminology/terminology-codes.ts`
   * for why a vocabulary opinion must not become a gate.
   */
  readonly terminology?: TerminologySummary
  /** The resolved document path, so an agent can quote it in a follow-up. */
  readonly path: string
  /**
   * The load's info-grade disclosures (V27 channel), surfaced on every read, then one
   * `waiver-inert` entry per stored waiver the waivability policy keeps from the engine (spec
   * 007 AC-5-6) and per applied-scope waiver that matches no finding.
   */
  readonly diagnostics: readonly DocumentDiagnostic[]
  /**
   * Every stale-hash waiver of a `scoped` code: the text it was reviewed on changed, so the
   * finding it covered is back (spec 007 AC-5-6, R21). ALWAYS present, `[]` when none, and never
   * filtered by `--min-severity` or `--findings-only`: a waiver that silently stopped applying is
   * exactly what an output filter must not hide.
   */
  readonly ignoredWaivers: readonly IgnoredWaiver[]
  /**
   * Every waiver the engine applied, with its code, requirement ids and reason (R33), so each
   * suppressed finding is accounted for by name rather than by the `waived` count alone.
   */
  readonly appliedWaivers: readonly AppliedWaiver[]
  /**
   * The measured budget recommendation (AC-A-8) — present ONLY when the run has
   * something measured to say about its own `--solver-budget-ms`.
   *
   * OMITTED on an unbounded run (the default) and on a bounded run with comfortable
   * headroom, and the absence is the message: there is no budget to correct, or the
   * budget is fine. Emitting a hint on every run would make it noise, and emitting
   * one on an unbounded run would push a bound onto a caller who did not ask for it.
   *
   * See `../formal/budget-hint.ts` for why the number is anchored on THIS run's
   * clock rather than on a committed cost table.
   */
  readonly budgetHint?: BudgetHint
}

// ---------------------------------------------------------------------------
// Input schema — the G2a option subset
// ---------------------------------------------------------------------------

const lines = (...xs: readonly string[]): string => xs.join('\n')

/** An optional integer flag with a schema-visible default. */
const intFlag = (value: number, description: string) =>
  Schema.withDecodingDefaultKey<Schema.Int>(Effect.succeed(value))(
    Schema.Int.annotate({ default: value, description }),
  )

/** An optional boolean flag with a schema-visible default. */
const boolFlag = (description: string) =>
  Schema.withDecodingDefaultKey<Schema.Boolean>(Effect.succeed(false))(
    Schema.Boolean.annotate({ default: false, description }),
  )

/**
 * The G2a option surface. Deliberately a SUBSET of v4's `check` flags —
 * `--emit-smt2`, `--solver z3-bin|cvc5`, `--solver-path`, `--semantic-threshold`,
 * and `--similarity-threshold` are G2b/G3 — and every included flag keeps the
 * v4's exact name, meaning, and default.
 *
 * `--temporal-bound` has no `--temporal` companion here, on purpose: v4
 * needed both because commander cannot express "a bound implies the tier", and the
 * result is a flag that silently does nothing without its partner. A single
 * `--temporal-bound` whose DEFAULT is 0 (meaning off) is the same capability with
 * one fewer way to get it wrong. Supplying a bound IS opting in.
 */
const CheckInput = Schema.Struct({
  file: Schema.withDecodingDefaultKey<Schema.optionalKey<Schema.NullOr<Schema.String>>>(
    Effect.succeed(null),
  )(
    Schema.optionalKey(
      Schema.NullOr(Schema.String).annotate({
        default: null,
        description: lines(
          'Path to the requirements document to check.',
          'Resolution precedence, in order: the supplied path, then the SYMSPEC_DOC environment',
          'variable, then the ./requirements.json default.',
        ),
      }),
    ),
  ),
  config: Schema.withDecodingDefaultKey<Schema.NullOr<Schema.String>>(Effect.succeed(null))(
    Schema.NullOr(Schema.String).annotate({
      default: null,
      description: lines(
        'Path to the symspec.config.json whose pins this run is compared against.',
        CONFIG_PATH_CONVENTION,
        'A named config that cannot be read is ERR_CONFIG_INVALID, never "no config".',
      ),
    }),
  ),
  timeoutMs: intFlag(
    KNOB_DEFAULTS.timeoutMs,
    lines(
      'Per-solver timeout in milliseconds, applied to EVERY solver every tier constructs',
      '(contradiction, subsumption, vacuity, incomplete, numeric, temporal, needs-review).',
      'A solver that hits it returns `unknown`, which each tier handles conservatively — so this',
      'can only WITHHOLD a finding, never manufacture one.',
      'Note: it does NOT bound the temporal tier`s ENCODE phase; see --temporal-bound.',
    ),
  ),
  // ITS OWN FLAG, split from `--timeout-ms` at G5, and the reason is a MEASUREMENT
  // rather than tidiness. See {@link resolveReachabilityTimeoutMs} for the sentinel and
  // {@link REACHABILITY_TIMEOUT_IS_CANCELLABILITY} for why the bound is not merely a budget.
  reachabilityTimeoutMs: intFlag(
    KNOB_DEFAULTS.reachabilityTimeoutMs,
    lines(
      'Per-query timeout in milliseconds for the UNBOUNDED reachability tier (Z3 Spacer), applied to',
      'each Horn query the tier issues. 0 (the default) INHERITS --timeout-ms, so omitting this flag',
      'reproduces the shared behavior exactly.',
      '0 does NOT mean unbounded, and that is deliberate: `Z3_interrupt` is COOPERATIVE — Spacer',
      'checks the cancel flag at its own yield points and not at all of them — so when the flag is',
      'not observed, a cancel costs what the query would have cost anyway. MEASURED: a raw',
      'Z3.interrupt landed in 3ms, while interrupting the same query through the tier took 10232ms',
      'against a 10000ms bound. So THIS BOUND IS THE CANCELLABILITY MECHANISM: an unbounded',
      'reachability query is an UNCANCELLABLE one, and the worst-case time to abandon the tier is',
      'exactly the value set here.',
      'Split from --timeout-ms because the two bound different work: --timeout-ms bounds seven',
      'per-pair propositional/arithmetic solvers where a raise is cheap, while a reachability query',
      'is one whole-model fixedpoint search — so an author raising the reachability budget 20x to',
      'decide an UNKNOWN should not simultaneously hand every other tier 20x the rope.',
    ),
  ),
  solverBudgetMs: intFlag(
    KNOB_DEFAULTS.solverBudgetMs,
    lines(
      'Whole-run wall-clock solver budget in milliseconds, spanning every solver tier. 0 means',
      'unbounded (the default), which is the engine behavior when the flag is absent.',
      'A tier that stops early records a truncation, which becomes a `solver-budget-exhausted`',
      'demotion — so a truncated run can NEVER report verified: true. The budget starts at the',
      'first solver contact, not at document load, so no solver knob governs parse/lint time.',
    ),
  ),
  temporalBound: intFlag(
    KNOB_DEFAULTS.temporalBound,
    lines(
      'Trace bound k for the OPT-IN bounded LTL→SMT temporal tier. 0 (the default) means the tier',
      'does not run; any value from 1 to 200 enables it — supplying a bound IS opting in.',
      'The tier maps EARS requirements to LTL (Dwyer/FRET) and proves temporal-ordering',
      'contradictions (FND_TEMPORAL_CONTRADICTION). Sound-for-UNSAT: a `sat` result at the bound',
      'is NOT a consistency certificate.',
      'CAPPED AT 200, from measurement: the lowering is O(k²)–O(k³) and the expensive half is',
      'ENCODING, which neither --timeout-ms (a per-solver setting) nor --solver-budget-ms (checked',
      'only before the tier starts) can interrupt. Measured: 100 requirements at k=200 takes 13.5s',
      'and 2.0 GB; at k=300 it takes 55s and 4.0 GB — Node`s heap limit, where the process aborts',
      'with no envelope at all. 200 is 20x the default trace length and the last bound with real',
      'headroom under that cliff.',
    ),
  ),
  strict: boolFlag(
    lines(
      'Gate: fail with exit 3 when data.verified is false — any uncovered requirement, any',
      'untriaged opposition candidate, or no decide-tier comparison at all.',
      'Off by default so the base contract is unchanged: an agent must OPT IN to',
      '"I could not verify this is a build failure". coverage.demotions[] lists every reason with',
      'the exact discharging ops and commands, so a tripped gate is a work list, not a dead end.',
    ),
  ),
  // NULLABLE, not a negative sentinel, and the reason is a hard CLI limitation
  // discovered end-to-end: `--fail-on-unmatched -1` does not parse as "the value
  // -1". The CLI reads a leading `-` as the start of the NEXT flag, so the
  // invocation degrades to a help dump — which means a negative disabled-sentinel
  // is UNREACHABLE from the command line no matter what the schema says.
  //
  // 0 cannot be the sentinel either: it is the most useful threshold there is
  // ("fail on ANY unmatched atom"), and a count-valued gate has no other natural
  // out-of-band number. So absence is modelled as absence — `null` — the same
  // convention the doc-path field uses, and it is expressible: omitting the flag IS
  // disabling the gate.
  //
  // NOT wrapped in `Schema.optionalKey`. `withDecodingDefaultKey` ALREADY makes the
  // key optional on the ENCODED side (its declared result is
  // `decodeTo<S, optionalKey<toEncoded<S>>>`); adding an explicit `optionalKey`
  // makes it optional on the TYPE side too, so the decoded value types
  // `failOnUnmatched?: number | null | undefined` even though decoding ALWAYS
  // materializes it — forcing a needless `!= null` at every read and stopping the
  // compiler from catching a genuinely missing field. Optional in `Encoded`,
  // required in `Type`, is exactly what a default expresses.
  failOnUnmatched: Schema.withDecodingDefaultKey<Schema.NullOr<Schema.Int>>(Effect.succeed(null))(
    Schema.NullOr(Schema.Int).annotate({
      default: null,
      description: lines(
        'Gate: fail with exit 3 when more than <n> atoms went uncompared',
        '(residualRisk.unmatchedAtoms). OMIT the flag to disable the gate (the default);',
        'pass 0 to fail on ANY unmatched atom.',
        'An unmatched atom is owned by exactly one requirement, so it can never form a candidate',
        'pair — a high count means broad coverage holes.',
        'Independent of --strict: either gate tripping fails the run.',
      ),
    }),
  ),
  // NOTE the `readonly` in the type argument. `Schema.Literals([...])` infers its
  // `literals` tuple as READONLY, and `Literals<readonly [...]>` is not assignable
  // to `Literals<[...]>` (the tuple is invariant), so spelling the type argument
  // without `readonly` is a TS2345 at the `withDecodingDefaultKey` call — not at
  // the `Literals` call, which is what makes it read as a mystery.
  minSeverity: Schema.withDecodingDefaultKey<Schema.Literals<readonly ['error', 'warn', 'info']>>(
    Effect.succeed('info'),
  )(
    Schema.Literals(['error', 'warn', 'info']).annotate({
      default: 'info',
      description: lines(
        'Output filter: drop findings below this severity. `error` keeps only error-severity;',
        '`warn` keeps error+warn; `info` (the default) keeps everything.',
        'SAFE for the exit gate by construction — `error` is the top of the order, so this can',
        'never remove the finding the gate keys on. `counts` continues to reflect the FULL',
        'post-waiver set, so a filtered view still says how much it hid.',
      ),
    }),
  ),
  findingsOnly: boolFlag(
    lines(
      'Output filter: return only findings[] (plus the counts/waived tallies), dropping the',
      'heavier `excluded` table. The findings themselves — and therefore the exit code — are',
      'untouched.',
    ),
  ),
  // DEFAULTS TRUE — the opposite of every other boolean flag here, and the reason is
  // a red-team result rather than a preference. v4 shipped the semantic tier
  // opt-in, and an eval defeated `--strict` 25/30 by OMISSION: a certification gate
  // whose opposition detector can be skipped is gameable by not running it. So the
  // tier is on, and turning it OFF is the thing you have to ask for.
  semantic: Schema.withDecodingDefaultKey<Schema.Boolean>(Effect.succeed(true))(
    Schema.Boolean.annotate({
      default: true,
      description: lines(
        'Run the semantic tier: embed response phrasings and PROPOSE glossary merges',
        '(FND_SIMILAR_SEMANTIC) and opposition candidates (FND_OPPOSITION_CANDIDATE) for pairs that',
        'did not already unify. ON by default.',
        'PROPOSE-ONLY, and that is doctrine rather than caution: a cosine never decides a conflict.',
        'The only durable output is a SUGGESTED `symspec glossary "<canonical>" "<alias>"` / `symspec antonym <a> <b>` op you commit after',
        'review, and the deterministic solver then reads the COMMITTED table — which is what keeps',
        '`check` byte-reproducible given (document + tables + pinned model).',
        'These findings are info severity and can DEMOTE `data.verified` toward abstention (an',
        'untriaged opposition candidate means a conflict was not ruled out); they can NEVER promote it.',
        'Pass --semantic=false to skip the tier. The skip is DISCLOSED as a `semantic-tier-skipped`',
        'demotion, so `verified` cannot be true — silence is not a certificate.',
        'A missing model FAILS CLOSED with ERR_EMBED_MODEL_MISSING rather than skipping quietly.',
      ),
    }),
  ),
  semanticThreshold: Schema.withDecodingDefaultKey<Schema.NullOr<Schema.Number>>(
    Effect.succeed(null),
  )(
    Schema.NullOr(Schema.Number).annotate({
      default: null,
      description: lines(
        `Cosine threshold for the paraphrase pass. Omit for the measured default of ${DEFAULT_SEMANTIC_THRESHOLD}.`,
        'The default is MEASURED, not guessed, and the number is interpolated from the code constant so',
        'this text cannot drift from it. Over this model with CLS pooling and NO instruction prefix,',
        'cosines band at ~0.44-0.58 (unrelated), ~0.75-0.79 (divergent-wording paraphrase), and',
        '~0.87-0.89 (near-identical). A previous default of 0.82 sat ABOVE the entire paraphrase band,',
        'so every same-intent/different-wording pair was silently missed.',
        'FAVOR RECALL when tuning: this tier is propose-only, so a false suggestion costs one ignored',
        'op while a MISS hides a real paraphrased conflict behind two distinct atoms.',
        'A value ABOVE the default is a run-weakening move: it can drop proposals and near-duplicate',
        'demotions the default run raises, so it demotes `data.verified` with `run-weakened`. The value',
        'the tier ran at is always disclosed as `data.run.semanticThreshold`.',
      ),
    }),
  ),
})

// ---------------------------------------------------------------------------
// Option validation — v4's usage errors, exactly
// ---------------------------------------------------------------------------

/**
 * Validate the numeric knobs before any work starts, so a typo is a clean
 * `ERR_USAGE` rather than a silently-disabled gate or an unbounded run.
 *
 * v4 validated these in its commander action for the same reason; the
 * messages are carried over with the same substance. The one addition is `repair`
 * on each: the corrected invocation is a command an agent can run verbatim, which
 * is the AC-A-9 discipline applied to usage errors too.
 */
const validate = (input: typeof CheckInput.Type, path: string): Effect.Effect<void, ErrUsage> => {
  const usage = (error: string, corrected: string) =>
    Effect.fail(
      new ErrUsage({
        error,
        suggestions: [`Usage: ${corrected}`],
        repair: { ops: [], commands: [corrected] },
      }),
    )

  if (input.timeoutMs < 1) {
    return usage(
      `--timeout-ms expects a positive integer, got ${input.timeoutMs}.`,
      `symspec check ${path} --timeout-ms 2000`,
    )
  }
  if (input.reachabilityTimeoutMs < 0) {
    return usage(
      `--reachability-timeout-ms expects a non-negative integer (0 inherits --timeout-ms), got ${input.reachabilityTimeoutMs}.`,
      `symspec check ${path} --reachability-timeout-ms 8000`,
    )
  }
  if (input.solverBudgetMs < 0) {
    return usage(
      `--solver-budget-ms expects a non-negative integer (0 means unbounded), got ${input.solverBudgetMs}.`,
      `symspec check ${path} --solver-budget-ms 0`,
    )
  }
  if (input.failOnUnmatched !== null && input.failOnUnmatched < 0) {
    return usage(
      `--fail-on-unmatched expects a non-negative integer (omit the flag to disable the gate), got ${input.failOnUnmatched}.`,
      `symspec check ${path} --fail-on-unmatched 0`,
    )
  }
  if (input.temporalBound < 0) {
    return usage(
      `--temporal-bound expects an integer >= 1 to enable the tier, or 0 to disable it, got ${input.temporalBound}.`,
      `symspec check ${path} --temporal-bound <1..${MAX_TEMPORAL_BOUND}>`,
    )
  }
  if (input.temporalBound > MAX_TEMPORAL_BOUND) {
    // v4's rationale, verbatim in substance: this is the one usage error
    // whose MESSAGE is the justification, because a bare "max is 200" invites the
    // reader to assume the cap is arbitrary and route around it.
    return usage(
      `--temporal-bound ${input.temporalBound} exceeds the maximum of ${MAX_TEMPORAL_BOUND}. The bounded ` +
        'LTL→SMT encoding is O(k²)–O(k³) in the bound, and the encode phase is not interruptible by ' +
        '--timeout-ms (a per-solver timeout) or --solver-budget-ms (checked only before the tier ' +
        'starts), so a larger bound is a denial of service with no way to abort it. Measured: 100 ' +
        'requirements at k=200 takes 13.5s and 2.0 GB; at k=300 it takes 55s and 4.0 GB, which is ' +
        "Node's heap limit — the process aborts with no envelope at all.",
      `symspec check ${path} --temporal-bound <1..${MAX_TEMPORAL_BOUND}>`,
    )
  }
  return Effect.void
}

/**
 * Translate the validated input into v4's `CheckOptions`.
 *
 * Every absent option is an ABSENT KEY, never `undefined`. That is not just
 * `exactOptionalPropertyTypes` hygiene here — v4 branches on
 * `options.temporal !== undefined` and `options.solverBudgetMs !== undefined`, so
 * `{temporal: undefined}` and `{}` mean the same thing to the tier but the sentinel
 * translation must be explicit or a `0` bound would enable the tier with k=0.
 */
const toCheckOptions = (
  input: typeof CheckInput.Type,
  /**
   * The loaded embedder, or `undefined` when the tier is off.
   *
   * Passed IN rather than loaded here, because loading is an Effect that can fail and
   * this function is a pure translation. The `undefined` case is one the
   * engine handles first-class: `options.semantic` absent means the tier
   * did not run, which the pipeline reports as a `semantic-tier-skipped` demotion
   * rather than treating as a clean run.
   */
  embedder: Embedder | undefined,
  /** Whether `embedder` is the TEST stub — `EmbedderService.isStub`, never re-derived. */
  embedderIsStub: boolean,
): CheckOptions => ({
  timeoutMs: input.timeoutMs,
  // 0 is the "unbounded" sentinel; v4 expresses unbounded as an absent key.
  ...(input.solverBudgetMs > 0 ? { solverBudgetMs: input.solverBudgetMs } : {}),
  // A bound of 0 means the tier is off; any positive bound enables it.
  ...(input.temporalBound > 0 ? { temporal: { bound: input.temporalBound } } : {}),
  ...(input.strict ? { strict: true } : {}),
  // `null` disables the gate; 0 is a MEANINGFUL threshold (fail on ANY unmatched
  // atom), so the guard is on nullness — NOT on `> 0`, which would silently turn
  // the strictest legal setting into no gate at all.
  ...(input.failOnUnmatched !== null ? { failOnUnmatched: input.failOnUnmatched } : {}),
  // The semantic tier is enabled by the PRESENCE of this key, so the embedder's
  // absence and the flag being off converge on one code path — v4's.
  ...(embedder !== undefined
    ? {
        semantic: {
          embedder,
          // AC-3-5: the stub DEMOTES. Forwarded from the service's own disclosure so the
          // engine never guesses which embedder ran.
          ...(embedderIsStub ? { stub: true } : {}),
          ...(input.semanticThreshold !== null && Number.isFinite(input.semanticThreshold)
            ? { threshold: input.semanticThreshold }
            : {}),
        },
      }
    : {}),
})

// ---------------------------------------------------------------------------
// The v5 additions, computed from the finished report
// ---------------------------------------------------------------------------

/**
 * Count atoms with no cross-requirement partner.
 *
 * Read off the report's own `residualRisk.unmatchedAtoms` rather than recomputed:
 * the pipeline tallied it from the SAME encoded roster the formal tier built, and a
 * second computation here would be a second source of truth for one number — able
 * to disagree with the field published next to it.
 */
const atomsUncompared = (report: CheckReport): number => report.residualRisk.unmatchedAtoms

/** Build the AC-A-2 gradient from the finished report. */
const progressOf = (report: CheckReport): CheckProgress => ({
  demotions: report.coverage.demotions.length,
  openFindings: report.counts.error,
  atomsUncompared: atomsUncompared(report),
})

/**
 * The severity order, as a predicate — so the reachability findings honor
 * `--min-severity` through the SAME rule the transplanted tier does.
 *
 * Re-derived here rather than imported because v4's `filterReport` applies the
 * rule internally and exposes no predicate. Keeping it a three-element index comparison
 * (rather than a set per level) is what makes "error is the top of the order, so
 * `--min-severity error` can never hide the finding the exit gate keys on" true by
 * construction instead of by inspection.
 */
const SEVERITY_ORDER: readonly CheckSeverity[] = ['error', 'warn', 'info']
const severityAtLeast = (severity: CheckSeverity, minimum: CheckSeverity): boolean =>
  SEVERITY_ORDER.indexOf(severity) <= SEVERITY_ORDER.indexOf(minimum)

/**
 * The reachability tier's "I did not run" disclosure for a document with NO state model.
 *
 * The published scope (`reachabilityModelScoped`) says the tier runs only when a state model is
 * committed, "otherwise FND_REACHABILITY_NOT_CHECKED discloses that it did not run", and the
 * craft guide says such a document gets the code "rather than silence". The tier itself never
 * runs here, so this boundary emits the disclosure on its behalf.
 *
 * Info, and NOT a demotion. The tier is opt-in, exactly like the bounded temporal tier, whose
 * absence does not demote either: `verified` speaks for the tiers that ran, and demoting every
 * document that has not authored a state model would make the certificate unreachable for the
 * input→output specifications the propositional tiers fully cover. A committed-but-incomplete
 * model is different — the author asked the question — and the tier's own projection demotes it.
 */
const noStateModelDisclosure = (docPath: string): ReachabilityFinding => ({
  code: 'FND_REACHABILITY_NOT_CHECKED',
  severity: 'info',
  requirementIds: [],
  message:
    'The unbounded reachability tier did not run: no state model is committed, so no ' +
    'reachability question was asked. This is a coverage DISCLOSURE, not a defect, and it does ' +
    'not demote `verified` (the tier is opt-in). To have `check` prove invariants over every ' +
    'reachable state, declare the state variables (`symspec state <name> --type bool|int|enum ' +
    `--file ${docPath}\`), then classify the responses that touch them (\`symspec classify <ref> ` +
    `--kind constraint --expression "<predicate>" --file ${docPath}\`).`,
})

/** Roll a finished reachability run up into the payload's summary. */
const summarizeReachability = (run: ReachabilityReport): ReachabilitySummary => {
  const count = (verdict: string) => run.results.filter((r) => r.verdict === verdict).length
  return {
    variables: run.variables,
    effects: run.effects,
    constraints: run.results.length,
    proved: count('PROVED'),
    provedUnderHypotheses: count('PROVED_UNDER_HYPOTHESES'),
    violated: count('VIOLATED'),
    unknown: count('UNKNOWN'),
    elapsedMs: run.elapsedMs,
    timeoutMs: run.timeoutMs,
  }
}

/**
 * Attach a runnable `repair` to every demotion (AC-A-1).
 *
 * The repairs are computed from the UNFILTERED report's findings, even when
 * `--min-severity` hid some: a demotion's repair depends on the finding that
 * RAISED it, and an output filter is a presentation choice that must not change
 * what remedy is offered. Getting this backwards would make `--min-severity error`
 * silently strip the repairs off every info-tier demotion — the exact demotions an
 * agent most needs a command for.
 */
const withRepairs = (
  demotions: readonly CoverageDemotion[],
  findings: readonly CheckFinding[],
  excluded: readonly Exclusion[],
  input: typeof CheckInput.Type,
  path: string,
  /**
   * The MEASURED budget recommendation, when the run produced one.
   *
   * Threaded through so the `solver-budget-exhausted` repair command names the SAME
   * number `data.budgetHint.recommendedBudgetMs` publishes. Two renderings of one
   * answer that could disagree is the drift this codebase treats as a defect, and here
   * it would be visible to an agent as the envelope contradicting itself in two
   * adjacent fields.
   */
  recommendedBudgetMs: number | undefined,
  /** `data.run`, so a `run-weakened` repair undoes the weakening this run actually had. */
  run: RunDisclosure,
  /** The checked document, so a pair waiver op carries the hash of the text it was raised on. */
  document: RequirementsDocument,
): readonly RepairableDemotion[] => {
  const exclusionsById = new Map(excluded.map((e) => [e.id, e]))
  const contentHash = (ids: readonly string[]) => requirementsContentHash(document, ids)
  return demotions.map((demotion) => {
    const repair = repairForDemotion(demotion, {
      exclusionsById,
      findings,
      docPath: path,
      run,
      contentHash,
      timeoutMs: input.timeoutMs,
      ...(input.solverBudgetMs > 0 ? { solverBudgetMs: input.solverBudgetMs } : {}),
      ...(recommendedBudgetMs !== undefined ? { recommendedBudgetMs } : {}),
    })
    // An empty repair is OMITTED, not emitted as two empty arrays — the same rule
    // the error envelope follows, and for the same reason: "there is a repair, it is
    // nothing" is a worse signal than "no mechanical fix exists".
    const hasRepair = repair.ops.length > 0 || repair.commands.length > 0
    return hasRepair ? { ...demotion, repair } : demotion
  })
}

// ---------------------------------------------------------------------------
// The pinned run (spec 007 AC-5-10)
// ---------------------------------------------------------------------------

/**
 * What this run was made of, as the knob table reads it: the flags, plus the embedder the
 * engine reports it actually ran (`data.run.embedder`) and the threshold it ran at.
 */
const runSettingsOf = (input: typeof CheckInput.Type, run: RunDisclosure): RunSettings => ({
  semantic: input.semantic,
  embedder: run.embedder,
  semanticThreshold:
    run.semanticThreshold ??
    (input.semanticThreshold !== null && Number.isFinite(input.semanticThreshold)
      ? input.semanticThreshold
      : KNOB_DEFAULTS.semanticThreshold),
  timeoutMs: input.timeoutMs,
  reachabilityTimeoutMs: input.reachabilityTimeoutMs,
  solverBudgetMs: input.solverBudgetMs,
  temporalBound: input.temporalBound,
  strict: input.strict,
})

/**
 * Compare one run against the pins of one config: the `data.run` disclosure and one
 * `run-weakened` demotion per knob below its pin.
 *
 * Every such demotion carries the SAME repair — one command at every pin — because running it
 * discharges all of them, where a per-knob command would discharge one and re-weaken the rest.
 * A demotion can only push `verified` toward false, so a config can never make a run verify
 * that would not verify without it.
 */
const pinnedRunOf = (
  config: ConfigLocation,
  gate: GatePins,
  run: RunSettings,
  docPath: string,
): {
  readonly disclosure: Required<Pick<PinnedRunDisclosure, 'config' | 'pinned' | 'belowPinned'>>
  readonly demotions: readonly RepairableDemotion[]
} => {
  const pinned = effectivePins(gate)
  const below = belowPinned(run, pinned)
  const command = pinnedInvocation(
    docPath,
    run,
    pinned,
    config.source === 'flag' ? config.path : undefined,
  )
  return {
    disclosure: {
      config: { path: config.path, source: config.source },
      pinned,
      belowPinned: below,
    },
    demotions: below.map((knob) => ({
      reason: 'run-weakened' as const,
      requirementIds: [],
      action: pinDemotionAction(knob, run, pinned, config.path, command),
      repair: { ops: [], commands: [command] },
    })),
  }
}

// ---------------------------------------------------------------------------
// The operation
// ---------------------------------------------------------------------------

/**
 * `check` — run every tier and report findings, coverage, and the verdict.
 *
 * Exit codes come from the kernel's contract, computed from the ENVELOPE rather
 * than returned by this handler: an error-severity finding in `data.findings` maps
 * to 1, a tripped `data.strictGate` with no error finding maps to 3, and a clean
 * run maps to 0. That is v4's semantics exactly, and it lands for free
 * because `exitCodeForEnvelope` already reads both fields structurally.
 */
export const checkOp = defineOperation({
  name: 'check',
  summary:
    'Check a requirements document for contradictions, subsumption, vacuity, and coverage gaps',
  type: 'check',
  input: CheckInput,
  handler: (input) =>
    Effect.gen(function* () {
      const docPath = yield* DocPath
      const store = yield* DocStore
      const path = docPath.resolve(input.file)

      yield* validate(input, path)

      // The document, plus the pinned config (named explicitly, or at its default location) and
      // the split anchors (spec 007 AC-5-10). A config that cannot be read fails closed with
      // ERR_CONFIG_INVALID rather than checking as though there were none.
      const bundle = yield* store.loadBundle(path, docPath.resolveConfig(input.config))
      const loaded = bundle.loaded

      // Yielding `boot` is what actually starts the WASM module, and it happens
      // HERE — after validation and after the document loaded — so a usage error or
      // a missing document never pays the ~200-1000ms init. This is also the call
      // that primes the transplanted tier's memo, which is why `runCheck` below can
      // reach Z3 through v4's unchanged `getContext` with the Layer-owned
      // instance. Not merely reaching the service: a provided Layer is BUILT
      // eagerly on beta.102 (probed), so reaching it proves nothing; yielding the
      // cached boot is the operative step.
      yield* (yield* SolverService).boot

      // The SEMANTIC tier's embedder, loaded here — after validation and the document
      // read, so a usage error or a missing document never pays the model load.
      //
      // Loaded BEFORE `runCheck` rather than lazily inside it, and that ordering is
      // the fail-closed rule: a missing model must produce ERR_EMBED_MODEL_MISSING
      // (exit 2) instead of a report whose opposition detector silently did not run.
      // A detector that can be skipped is a gate that can be gamed by omission.
      const embedderService = yield* EmbedderService
      const embedder = input.semantic ? yield* embedderService.load : undefined
      const engineDoc = toEngineDoc(loaded.document)

      // The AC-A-8 ANCHOR. Measured around the pipeline call and nowhere else, so it
      // is the wall clock the solver tiers actually consumed on this machine under
      // this load — which is the only figure a portable recommendation can rest on
      // (`../formal/budget-hint.ts` records the contention measurement that ruled out
      // a committed cost table). Started AFTER the WASM boot and the embedder load, so
      // it measures the same span `--solver-budget-ms` bounds rather than including
      // two one-off costs no budget governs.
      const startedAt = Date.now()

      const full = yield* Effect.tryPromise({
        try: () => runCheck(engineDoc, toCheckOptions(input, embedder, embedderService.isStub)),
        catch: (cause) =>
          // The tier's own typed failures (a `SolverBudgetExceededError` escaping
          // `findNeedsReview` to a direct caller) and any genuine defect both land
          // here. `ERR_SOLVER_INCONCLUSIVE` is v4's catch-all code for a
          // check that could not complete, and it is the honest one: the run
          // reached no verdict, which is different from both "the spec is bad" and
          // "the tool is misconfigured".
          new ErrSolverInconclusive({
            error: `The check did not complete: ${cause instanceof Error ? cause.message : String(cause)}`,
            suggestions: [
              'Raise --solver-budget-ms, or lower --timeout-ms so individual solvers give up sooner.',
              'If --temporal-bound is set, lower it — the temporal encoding is superlinear in the bound.',
              `Run \`symspec list ${path}\` to see how large the document is.`,
            ],
            repair: {
              ops: [],
              commands: [`symspec check ${path} --solver-budget-ms 30000`],
            },
          }),
      })

      const measuredMs = Date.now() - startedAt

      // ---------------------------------------------------------------------
      // THE REACHABILITY TIER (G4) — runs only when a state model is committed
      // ---------------------------------------------------------------------
      //
      // The gate is `stateModel.variables.length > 0`. A document with no state model takes
      // the `undefined` branch: its payload has no `reachability` key and no reachability
      // demotion — the tier is opt-in, like the temporal tier, so its absence does not demote
      // `verified`. It DOES get one info `FND_REACHABILITY_NOT_CHECKED`
      // ({@link noStateModelDisclosure}), because the published scope promises the tier's
      // absence is disclosed, and a question never asked must not read like a pass.
      //
      // Deliberately AFTER `runCheck` and outside the `--solver-budget-ms` measurement:
      // the budget bounds the transplanted tiers, and folding a new tier into the number
      // it measures would change the `budgetHint` on documents that gained a state model
      // — a G3 output moving for a G4 reason.
      // The BOUND is the tier's own, resolved from `--reachability-timeout-ms` with
      // `--timeout-ms` as the inherited default — so the flag is a pure addition (absent
      // reproduces G4's shared-knob behavior byte for byte) while a reachability UNKNOWN can
      // be resolved without handing every propositional solver the same multiple.
      const reachabilityRun =
        loaded.document.stateModel.variables.length > 0
          ? yield* runReachability(loaded.document, {
              timeoutMs: resolveReachabilityTimeoutMs(input.reachabilityTimeoutMs, input.timeoutMs),
            })
          : undefined

      const reachabilityProjection =
        reachabilityRun !== undefined ? projectReachability(reachabilityRun, path) : undefined

      // The TERMINOLOGY tier — set-level vocabulary consistency, propose-only.
      //
      // Runs HERE, at the app boundary, for the same reason `runReachability` does: it needs
      // the greenfield document (both committed side tables) and the engine pipeline never
      // sees that shape. `engine/pipeline/check.ts` is untouched.
      //
      // The position is load-bearing in one specific way. `FND_NO_PAIRS_CHECKED` — "nothing
      // was compared across requirements, so this is NOT a consistency certificate" — is
      // suppressed by the engine when any finding spans two or more requirement ids, and it
      // is computed INSIDE `runCheck`, which has already returned. So a terminology finding
      // physically cannot quiet that disclaimer. That matters because this tier compares
      // requirements for VOCABULARY, never for consistency: letting it suppress the
      // disclaimer would assert a comparison that never happened. The property is asserted
      // in the suite rather than left to rest on this comment, so relocating the splice
      // cannot silently take the disclaimer with it.
      //
      // Gated on the same `embedder` every other semantic detector is, so `--semantic=false`
      // skips it under the EXISTING `semantic-tier-skipped` demotion. No second demotion
      // reason for one fact.
      const terminology =
        embedder !== undefined
          ? yield* Effect.tryPromise({
              // No options. `--semantic-threshold` is deliberately NOT forwarded: it tunes
              // recall-favoring paraphrase detection at 0.72, while this floor is
              // precision-favoring at a measured 0.62. Forwarding one number into both would
              // couple two opposite judgments through a single flag, and the calibration
              // lesson's closing rule is that a shared value must not become a shared knob.
              try: () => runTerminology(loaded.document, embedder),
              // A propose-only vocabulary opinion must never be able to fail a check. The
              // tier has no solver contact and its only fallible step is the embedder call
              // — which already failed closed above, at `EmbedderService.load`, so reaching
              // this catch means a genuine defect. Report it as an inconclusive check rather
              // than swallowing it, because a silently-empty propose tier is exactly the
              // "detector skipped by omission" shape the embedder load is ordered to prevent.
              catch: (cause) =>
                new ErrSolverInconclusive({
                  error: `The terminology tier did not complete: ${cause instanceof Error ? cause.message : String(cause)}`,
                  suggestions: [
                    'Re-run with --semantic=false to skip the vocabulary tier; the formal verdict does not depend on it.',
                  ],
                }),
            })
          : undefined

      // THE WAIVER ACCOUNT (spec 007 AC-5-6). Whether a crossed waiver applied needs the
      // findings from before it applied, and the engine reports only a count. Lint findings do
      // not depend on any waiver, so they are recomputed; every other crossed code is read off a
      // second run that keeps only the lint waivers — the only ones the AC-3-7 gate reads, so the
      // second run's formal tier saw exactly the requirements this one did. It runs only when a
      // non-lint waiver crossed, which a document with no such waiver never pays for.
      const crossedOther = (engineDoc.waivers ?? []).some((w) => !isLintCode(w.code))
      const preWaiverOther = crossedOther
        ? (yield* Effect.tryPromise({
            try: () =>
              runCheck(
                {
                  ...engineDoc,
                  waivers: (engineDoc.waivers ?? []).filter((w) => isLintCode(w.code)),
                },
                toCheckOptions(input, embedder, embedderService.isStub),
              ),
            catch: (cause) =>
              new ErrSolverInconclusive({
                error: `The check did not complete: ${cause instanceof Error ? cause.message : String(cause)}`,
                suggestions: [
                  'Raise --solver-budget-ms, or lower --timeout-ms so individual solvers give up sooner.',
                ],
              }),
          })).findings.filter((f) => !isLintCode(f.code))
        : []
      // The terminology tier runs here, outside the engine, so the engine never applied a waiver
      // to its findings: the boundary does, by the engine's exact-set rule (ruling R57). Its
      // findings never depend on a waiver, so the whole set is pre-waiver.
      const terminologyAll = terminology?.findings ?? []
      const terminologyKept = terminologyAll.filter((f) => !suppressedByCrossed(engineDoc, f))
      const waiverAccount = accountWaivers(
        loaded.document,
        [...lintFindingScopes(engineDoc), ...preWaiverOther, ...terminologyAll],
        [...full.findings, ...(reachabilityProjection?.findings ?? []), ...terminologyAll],
        reachabilityProjection?.findings ?? [],
      )

      // A waived blocking lint re-admits its requirement to the solver (the waiver-aware gate),
      // and a comparison over wording a reviewer accepted rather than fixed certifies nothing
      // (G3, R26): ONE demotion naming every re-admitted requirement (R40), in place of the
      // `excluded-from-formal` the waiver lifted. No repair ops: the discharge is the rephrase,
      // which no op performs, and an op here would keep the round-trip from a fixed point.
      const readmitted = waivedBlockingIds(engineDoc)
      const waivedBlockingDemotions: readonly RepairableDemotion[] =
        readmitted.length > 0
          ? [
              {
                reason: 'waived-blocking-lint',
                requirementIds: [...readmitted],
                action:
                  `${readmitted.join(', ')} ${readmitted.length === 1 ? 'reaches' : 'reach'} the ` +
                  'formal tier only through a waiver of the error-severity lint that blocked ' +
                  `${readmitted.length === 1 ? 'it' : 'them'}: the waiver-aware gate re-admits a ` +
                  'requirement whose blocking wording a reviewer accepted, and a comparison over ' +
                  'wording accepted rather than fixed certifies nothing, so this run cannot ' +
                  'verify while the waiver stands. Rephrase each to clear the blocking finding ' +
                  "(the finding's message names it), remove its waiver, then re-run `symspec " +
                  'check`.',
              },
            ]
          : []

      // Output shaping is applied AFTER the repairs are computed from the full
      // report, so a filter cannot strip a remedy. Presentation only: it never
      // touches `counts`, so the exit code is identical filtered or not.
      const shaped =
        input.minSeverity !== 'info' || input.findingsOnly
          ? filterReport(full, {
              minSeverity: input.minSeverity satisfies CheckSeverity,
              ...(input.findingsOnly ? { findingsOnly: true } : {}),
            })
          : full

      // Computed from the UNFILTERED report and the FULL demotion set, for the same
      // reason the repairs are: `--min-severity` is a presentation choice, and letting
      // it change what budget is recommended would strip the hint off exactly the
      // info-tier truncation demotions that raise it.
      const budgetHint = budgetHintFor(full, input.solverBudgetMs, measuredMs)

      // The reachability findings are SPLICED into the same `findings[]` every other
      // tier writes to, and filtered by the SAME `--min-severity` rule — a second
      // findings array would make an agent read two places to learn what `check` found,
      // and would leave the exit contract reading only one of them. Filtered only where
      // they join `findings[]` below: `counts` is the FULL post-waiver tally, filter or not.
      const reachabilityFindings: readonly CheckFinding[] = (
        reachabilityProjection?.findings ?? [noStateModelDisclosure(path)]
      ).map(
        (f): CheckFinding => ({
          code: f.code,
          severity: f.severity,
          // `'formal'` because the reachability tier IS the formal tier's unbounded half
          // — it runs Z3 over the document's own semantics. Not `'structural'`, which
          // the catalog reserves for facts about the graph the solver never saw.
          tier: 'formal' satisfies CheckTier,
          requirementIds: [...f.requirementIds],
          message: f.message,
          ...(f.evidence !== undefined
            ? // The tier's `Evidence` shape is an atom table plus an unsat core, which a
              // reachability invariant is not. Cast at this ONE boundary rather than
              // widening a type every engine solver then has to satisfy.
              { evidence: f.evidence as unknown as NonNullable<CheckFinding['evidence']> }
            : {}),
        }),
      )

      // Filtered by the SAME `--min-severity` rule as every other tier, so
      // `--min-severity error` drops these exactly as it drops any other info finding.
      // Tier `'formal'` because that is what `FND_SIMILAR_SEMANTIC` reports and this is the
      // dual of it — one kind of claim, one tier.
      const terminologyFindings: readonly CheckFinding[] = terminologyKept.map(
        (f): CheckFinding => ({
          code: f.code,
          severity: f.severity,
          tier: 'formal' satisfies CheckTier,
          requirementIds: [...f.requirementIds],
          message: f.message,
          suggestion: f.suggestion,
        }),
      )

      const reachabilityDemotions: readonly RepairableDemotion[] = (
        reachabilityProjection?.demotions ?? []
      ).map((d) => ({
        // The reachability tier types its reason as a string on its wire shape; every value it
        // emits is a `ReachabilityDemotionReason`, which `AppDemotionReason` includes.
        reason: d.reason as AppDemotionReason,
        requirementIds: [...d.requirementIds],
        action: d.action,
        ...(d.repair !== undefined ? { repair: d.repair } : {}),
      }))

      // Every piece of ADVICE prose leaves through here in the form the CLI accepts.
      // The vendored tier spells the three side tables with `import`'s `add` verb (see
      // `kernel/command-form.ts`), and a human reading `--pretty` copies the command out
      // of the message, not out of `repair.commands`. Normalizing one and not the other
      // would print two spellings of one command in adjacent fields of one envelope.
      const allFindings = [
        ...shaped.findings,
        ...[...reachabilityFindings, ...terminologyFindings].filter((f) =>
          severityAtLeast(f.severity, input.minSeverity),
        ),
      ].map((f) => ({
        ...f,
        message: runnableInProse(f.message),
        ...(f.suggestion !== undefined ? { suggestion: runnableInProse(f.suggestion) } : {}),
      }))
      // THE PINNED RUN (spec 007 AC-5-10) — only when a config exists. Compared AFTER the run,
      // on what it was actually made of (`full.run` says which embedder ran), so a pin reads
      // the effective settings and never the flags alone.
      const pinning =
        bundle.config !== undefined
          ? pinnedRunOf(
              bundle.config,
              bundle.config.config.gate,
              runSettingsOf(input, full.run),
              path,
            )
          : undefined

      const allDemotions = [
        ...withRepairs(
          full.coverage.demotions,
          full.findings,
          full.excluded,
          input,
          path,
          budgetHint?.recommendedBudgetMs,
          full.run,
          loaded.document,
        ),
        ...waivedBlockingDemotions,
        ...reachabilityDemotions,
        // AC-5-10: one `run-weakened` per knob this run ran below its pin.
        ...(pinning?.demotions ?? []),
      ]

      // Counts are RECOMPUTED over the merged set rather than incremented, so the exit
      // code keys on the same numbers the payload publishes. A reachability VIOLATED
      // finding is error-severity, so it drives exit 1 through the existing contract with
      // no new wiring — which is the whole reason it goes in `findings[]`.
      //
      // The terminology tier is counted here too, and it can only ever move `info`: its
      // finding type declares `severity: 'info'` as a literal, so an `error` from it is a
      // `tsc` failure rather than a runtime surprise. That is what makes "this tier cannot
      // change the exit code" a checked property instead of a promise — `counts.error` is
      // the only number `exitCodeForEnvelope` reads, and no term drift can reach it.
      const spliced = [...reachabilityFindings, ...terminologyFindings]
      const counts = {
        error: shaped.counts.error + spliced.filter((f) => f.severity === 'error').length,
        warn: shaped.counts.warn + spliced.filter((f) => f.severity === 'warn').length,
        info: shaped.counts.info + spliced.filter((f) => f.severity === 'info').length,
      }

      const payload: CheckPayload = {
        ...shaped,
        // With no config this IS the engine's `run`; with one, the pins ride beside it.
        run: pinning !== undefined ? { ...shaped.run, ...pinning.disclosure } : shaped.run,
        findings: allFindings,
        counts,
        // A terminology finding a crossed waiver suppressed is tallied like any other (R57).
        waived: shaped.waived + (terminologyAll.length - terminologyKept.length),
        coverage: {
          ...shaped.coverage,
          requirements: shaped.coverage.requirements.map((row) => ({
            ...row,
            ...(row.suggestion !== undefined
              ? { suggestion: runnableInProse(row.suggestion) }
              : {}),
          })),
          demotions: allDemotions.map((d) => ({ ...d, action: runnableInProse(d.action) })),
        },
        // `verified` is recomputed from the MERGED demotion set, preserving v4's
        // single-writer rule (`verified = demotions.length === 0`). A reachability
        // demotion can therefore only push it toward false — the demotion-only doctrine,
        // which holds because nothing here ever REMOVES a demotion.
        verified: allDemotions.length === 0,
        // And `strictGate` is recomputed from the SAME merged set, because it is a
        // projection of `verified` and the two must not disagree in one envelope.
        //
        // The tier computes its gate before this boundary splices in the reachability
        // demotions, so a run demoted ONLY by reachability published `verified: false`
        // beside `strictGate: 'pass'` and exited 0 — while `--strict`'s own flag text
        // promises exit 3 exactly when `verified` is false. `kernel/exit.ts` reads the
        // field, not the boolean, so the gate is where the promise has to be kept.
        //
        // The `--fail-on-unmatched` half is deliberately NOT re-derived: it keys on
        // `unmatchedAtoms`, which nothing here changes, so the tier's answer is already
        // correct and recomputing it would mean duplicating a threshold comparison.
        // Reading it back off the tier's own verdict keeps one owner per trigger.
        ...(shaped.strictGate !== undefined
          ? {
              strictGate:
                shaped.strictGate === 'fail' || (input.strict === true && allDemotions.length > 0)
                  ? ('fail' as const)
                  : ('pass' as const),
            }
          : {}),
        progress: {
          ...progressOf(full),
          demotions: allDemotions.length,
          openFindings: counts.error,
        },
        path,
        diagnostics: [...loaded.diagnostics, ...waiverAccount.diagnostics],
        ignoredWaivers: waiverAccount.ignoredWaivers,
        appliedWaivers: waiverAccount.appliedWaivers,
        // ABSENT, not `undefined`. A run with nothing measured to say about its budget
        // emits no key at all — the same convention `repair` and `partial` follow, and
        // the reason `budgetHint?:` is optional rather than nullable.
        ...(budgetHint !== undefined ? { budgetHint } : {}),
        ...(reachabilityRun !== undefined
          ? { reachability: summarizeReachability(reachabilityRun) }
          : {}),
        // Counters only, and ABSENT when the tier did not run — see `TerminologySummary`.
        ...(terminology !== undefined
          ? {
              terminology: {
                keysExamined: terminology.keysExamined,
                pairsCompared: terminology.pairsCompared,
                acronymsExamined: terminology.acronymsExamined,
              },
            }
          : {}),
      }

      return ok('check', payload)
    }),
})
