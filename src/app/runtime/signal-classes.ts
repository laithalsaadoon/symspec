/**
 * THE SIGNAL CLASSES — what every finding code and every demotion reason MEANS, as data.
 *
 * ## Why a second classification, when the catalog already has `tier` and `severity`
 *
 * Because neither of those answers the question a gate asks. `tier` says which pipeline stage
 * emitted a code, and the formal tier emits proofs (FND_CONTRADICTION), "I could not decide"
 * (FND_NEEDS_REVIEW), and propose-only candidates (FND_OPPOSITION_CANDIDATE) alike. `severity`
 * says whether the code gates the exit, and an `info` code can be a proof
 * (FND_REACHABILITY_PROVED) while an `error` code can be a wording defect
 * (FND_EXACT_DUPLICATE). A rule written over either one — "formal findings cannot be waived",
 * "errors are verdicts" — is wrong on a named code the moment it is written. See
 * `.erpaval/solutions/architecture/an-i-dont-know-is-not-a-comparison.md`.
 *
 * So this module classifies BY MEANING, one code at a time, with the reason in words. Three
 * things read it:
 *
 * - **D, the verdict-bearing set.** Op directions (`OP_DIRECTION` in `requirements/ops.ts`)
 *   are stated over D, and the gaming gate measures them over D (G-D).
 * - **Waivability.** {@link WAIVABILITY} is derived from the class, never stated per code.
 * - **The manifest and AGENTS.md**, which publish both tables so an agent reads what a code
 *   means before it decides what to do about it.
 *
 * ## Exhaustive by construction
 *
 * {@link FINDING_CLASS} is `satisfies Record<every FND code | 'GTWR', …>` and
 * {@link DEMOTION_CLASS} is `satisfies Record<AppDemotionReason, …>`, so a code or a reason
 * appended anywhere without being classified here does not compile. `GTWR` is ONE row for
 * the whole lint family: every GtWR rule is a wording rule, and a per-rule row would be 24
 * copies of one decision.
 */

import type { FND_CODES } from '../../domain/engine/formal/codes.ts'
import type { CoverageDemotion } from '../../domain/engine/pipeline/check.ts'
import type { REACHABILITY_FND_CODES } from '../../domain/reachability/reachability-codes.ts'
import type { ReachabilityDemotionReason } from '../../domain/reachability/reachability-report.ts'
import { OP_DIRECTIONS, type OpDirection, opDirectionRows } from '../../domain/requirements/ops.ts'
import type { TERMINOLOGY_FND_CODES } from '../../domain/terminology/terminology-codes.ts'
import type { ManifestOpDirections, ManifestSignalClasses } from './operation.ts'

// ---------------------------------------------------------------------------
// Finding classes
// ---------------------------------------------------------------------------

/**
 * The finding classes, each with what a finding of that class claims.
 *
 * Published verbatim, so the sentence is the definition an agent reads.
 */
export const FINDING_CLASS_MEANING = {
  verdict:
    'The document is inconsistent, or a declared constraint is violated, and the tool proved it. Discharged only by changing what the document says.',
  disclosure:
    '"I did not decide": a comparison was not attempted, not finished, or holds only under an assumption. It claims nothing about the document either way.',
  triage:
    'A propose-side candidate: two phrases or numbers that may be one thing, or may conflict. Discharged by committing the table entry the finding proposes, or by rewording.',
  hygiene:
    'An obligation the document has not met (a requirement no tier could read, a slot its pattern needs, an edge target that does not exist). Discharged by supplying what is missing.',
  wording:
    'A wording defect a reviewer can accept: a GtWR rule, an ambiguity, a duplicate spelling, a term used two ways. It says nothing about consistency.',
  structural:
    'A fact about the trace graph (an orphan, a cycle, a missing link), not about what any requirement means.',
  anchor:
    'A change to something the loop may not change from inside: intent, policy, the pinned configuration, or the baseline binding.',
} as const

export type FindingClass = keyof typeof FINDING_CLASS_MEANING

/** The classes in publication order. */
export const FINDING_CLASSES = Object.keys(FINDING_CLASS_MEANING) as readonly FindingClass[]

/** Every finding code a `check` can emit, plus `GTWR` for the whole lint family. */
type FindingKey =
  | (typeof FND_CODES)[number]
  | (typeof REACHABILITY_FND_CODES)[number]
  | (typeof TERMINOLOGY_FND_CODES)[number]
  | 'GTWR'

interface FindingClassRow {
  readonly class: FindingClass
  readonly why: string
}

/**
 * Every finding code's class, decided one code at a time by what the code MEANS.
 *
 * Rows worth reading twice, because each looks wrong and is not:
 *
 * - `FND_EXACT_DUPLICATE` is `wording` though it is `error` severity: two identical slot
 *   tuples say one thing twice, which is a spelling defect and not an inconsistency.
 * - `FND_CERTIFIED` is `disclosure` though it reads like a proof: the generated Lean
 *   theorems are placeholders, so it certifies the toolchain and nothing about the spec.
 * - `FND_REACHABILITY_PROVED` is `disclosure`: it is information, not a finding against the
 *   document, and it must never become something a waiver or a direction label reasons about.
 * - `FND_NUMBER_SPELLING_CANDIDATE` is `triage`: whether `1.5` and `1,5` are one number turns
 *   on a decimal convention no rule fixes, so it is a candidate for the author to settle.
 */
export const FINDING_CLASS = {
  FND_DANGLING_REFERENCE: {
    class: 'hygiene',
    why: 'An edge names a requirement that does not exist: an obligation, discharged by supplying the target (an `add` with that `id`) or by removing the edge. Not structural, because `add` discharges it and `add` is strengthening.',
  },
  FND_MISSING_TRIGGER: {
    class: 'hygiene',
    why: "The requirement's pattern needs a trigger it does not carry, so no tier can read it as its pattern says. Discharged by supplying the trigger.",
  },
  FND_MISSING_PRECONDITION: {
    class: 'hygiene',
    why: "The requirement's pattern needs a precondition it does not carry, so no tier can read it as its pattern says. Discharged by supplying the precondition.",
  },
  FND_CYCLE: {
    class: 'structural',
    why: 'A cycle in the derives/refines graph: a fact about the trace graph.',
  },
  FND_ORPHAN: {
    class: 'structural',
    why: 'A requirement with no trace edge: a fact about the trace graph.',
  },
  FND_EXACT_DUPLICATE: {
    class: 'wording',
    why: 'Two requirements with identical slots say one thing twice: a duplicate spelling, not an inconsistency.',
  },
  FND_CONTRADICTION: {
    class: 'verdict',
    why: 'A context group is unsatisfiable: the solver proved the requirements cannot all hold.',
  },
  FND_SUBSUMPTION: {
    class: 'verdict',
    why: 'The solver proved one requirement implies another, a claim about what the two mean.',
  },
  FND_REDUNDANCY: {
    class: 'verdict',
    why: 'The solver proved two requirements equivalent, a claim about what the two mean.',
  },
  FND_VACUITY: {
    class: 'verdict',
    why: 'A guard is unreachable given every other requirement: a proved claim about the document.',
  },
  FND_SIMILAR_UNUNIFIED: {
    class: 'triage',
    why: 'Two responses overlap lexically but are two atoms: a candidate to unify or reword.',
  },
  FND_NEEDS_REVIEW: {
    class: 'disclosure',
    why: 'The solver returned unknown or timed out on a group: the tool did not decide it.',
  },
  FND_INCOMPLETE: {
    class: 'disclosure',
    why: 'A heuristic guard-coverage gap: an eligibility note, not a comparison and not a proof.',
  },
  FND_CERTIFIED: {
    class: 'disclosure',
    why: 'The Lean toolchain elaborated placeholder theorems: it certifies the toolchain, not the spec.',
  },
  FND_CERTIFY_FAILED: {
    class: 'disclosure',
    why: 'The Lean toolchain reported an error: a statement about the certification run, not the spec.',
  },
  FND_SIMILAR_SEMANTIC: {
    class: 'triage',
    why: 'Two responses embed close but are two atoms: a propose-only candidate for a glossary entry.',
  },
  FND_NUMERIC_CONTRADICTION: {
    class: 'verdict',
    why: 'The solver proved the numeric bounds on one quantity jointly unsatisfiable.',
  },
  FND_LEAF_UNVERIFIABLE: {
    class: 'structural',
    why: 'A refinement leaf with no verifies edge: a fact about the trace graph.',
  },
  FND_MISSING_TRACE_LINK: {
    class: 'structural',
    why: 'Two close requirements share no trace edge: a candidate edge in the trace graph.',
  },
  FND_DUPLICATE_CLUSTER: {
    class: 'triage',
    why: 'Three or more requirements cluster tightly: a propose-only candidate for near-duplication.',
  },
  FND_AMBIGUOUS_VAGUE: {
    class: 'wording',
    why: 'A vague term with no measurable meaning: a wording defect a reviewer can accept.',
  },
  FND_AMBIGUOUS_QUANTIFIER: {
    class: 'wording',
    why: 'An ambiguous quantifier or coordination: a wording defect a reviewer can accept.',
  },
  FND_AMBIGUOUS_REFERENCE: {
    class: 'wording',
    why: 'A pronoun with several candidate antecedents: a wording defect a reviewer can accept.',
  },
  FND_AMBIGUITY_NEEDS_JUDGMENT: {
    class: 'wording',
    why: 'Pragmatic ambiguity handed to a reviewer: a wording prompt, never a verdict.',
  },
  FND_TEMPORAL_CONTRADICTION: {
    class: 'verdict',
    why: 'No bounded trace satisfies the requirements jointly: a proved temporal inconsistency.',
  },
  FND_NO_PAIRS_CHECKED: {
    class: 'disclosure',
    why: 'The formal tier compared no pair: a statement that nothing was decided.',
  },
  FND_OPPOSITION_CANDIDATE: {
    class: 'triage',
    why: 'Two responses may be contraries that no table relates: a candidate for an antonym entry or a rewrite.',
  },
  FND_EXCLUDED_FROM_FORMAL: {
    class: 'hygiene',
    why: 'A blocking lint or parse finding kept the requirement from the solver. Discharged by fixing the blocking finding, which puts it back.',
  },
  FND_QUANTITY_ALIAS_CANDIDATE: {
    class: 'triage',
    why: 'Two co-active bounds landed on different quantity keys that may be one quantity: a candidate for a glossary entry.',
  },
  FND_RELATIONAL_UNCHECKED: {
    class: 'disclosure',
    why: 'The shape where aggregate or cross-quantity conflicts hide, which the numeric tier does not attempt: not compared.',
  },
  FND_NUMERIC_UNCOMPARED: {
    class: 'disclosure',
    why: 'Bounds on one quantity were neither proved nor dismissed, because the sentences do not fix a reading: not compared.',
  },
  FND_NUMBER_SPELLING_CANDIDATE: {
    class: 'triage',
    why: 'Two numbers differ only in a digit separator, and whether they are one number is a convention no rule fixes: a candidate for the author.',
  },
  FND_REACHABILITY_VIOLATED: {
    class: 'verdict',
    why: 'A reachable state violates a declared constraint, proved over all reachable states with a trace.',
  },
  FND_REACHABILITY_PROVED: {
    class: 'disclosure',
    why: 'A constraint holds in every reachable state. Information about the run, never a finding against the document.',
  },
  FND_REACHABILITY_UNDER_HYPOTHESES: {
    class: 'disclosure',
    why: 'A constraint holds only under the declared frame assumptions: a proof that depends on what was assumed.',
  },
  FND_REACHABILITY_UNKNOWN: {
    class: 'disclosure',
    why: 'Whether a constraint can be violated was not decided.',
  },
  FND_REACHABILITY_NOT_CHECKED: {
    class: 'disclosure',
    why: 'The reachability tier did not cover part or all of the document.',
  },
  FND_REACHABILITY_VACUOUS_INITIAL: {
    class: 'verdict',
    why: 'The initial state is unsatisfiable, a proved defect of the declared model.',
  },
  FND_RANGE_VIOLATION: {
    class: 'verdict',
    why: 'An effect writes a value outside its declared range from a reachable state: a proved violation.',
  },
  FND_CERTIFICATE_DISAGREES: {
    class: 'verdict',
    why: 'An independent explicit-state search refuted a solver proof: the reachable violating state is a proved fact, and a checker is wrong.',
  },
  FND_TERM_INCONSISTENT: {
    class: 'wording',
    why: 'One committed term applied in unrelated contexts: a spelling used for two things, a wording prompt.',
  },
  FND_ACRONYM_UNDEFINED: {
    class: 'wording',
    why: 'An acronym no committed table expands: a wording defect a reviewer can accept.',
  },
  GTWR: {
    class: 'wording',
    why: 'Every INCOSE GtWR rule is a wording rule. A waived rule still re-admits its requirement to the solver, and says nothing about consistency.',
  },
} as const satisfies Record<FindingKey, FindingClassRow>

/** The class of one finding code, or `undefined` for a code no catalog publishes. */
export const findingClassOf = (code: string): FindingClass | undefined => {
  if (code.startsWith('GTWR_')) return FINDING_CLASS.GTWR.class
  return code in FINDING_CLASS ? FINDING_CLASS[code as FindingKey].class : undefined
}

// ---------------------------------------------------------------------------
// Waivability — derived from the class, never stated per code
// ---------------------------------------------------------------------------

/** `scoped`: waivable only over named requirements and their current text. `never`: not at all. */
export type Waivability = 'scoped' | 'never'

/**
 * Whether this build ENFORCES {@link WAIVABILITY}: whether `waive` refuses a `never` code and
 * `check` ignores a stored waiver on one.
 *
 * `false` on this build. The column is the policy the classes imply, and it is published so an
 * agent can read it now, but `waive FND_CONTRADICTION` still commits and still suppresses the
 * finding. The slice that enforces it (S3, AC-5-6) flips this constant, and
 * `app/operations/waivability.test.ts` holds the constant to what the fold and `check` do, in
 * both directions. Every surface that publishes the column publishes this beside it
 * ({@link waivabilityStatement}), so a `never` is never read as a guarantee it is not.
 */
export const WAIVABILITY_ENFORCED: boolean = false

/** The sentence every surface publishes beside the `waivable` column. */
export const waivabilityStatement = (): string =>
  WAIVABILITY_ENFORCED
    ? 'Waivability is enforced: `waive` refuses a `never` code, and `check` ignores a stored waiver on one.'
    : 'Waivability is published policy, NOT enforced by this build: `waive` still commits a waiver on a `never` code, and `check` still suppresses the finding it names. Do not read `never` as a guarantee that `verified: true` excludes a waived finding.'

/**
 * Which classes a waiver may suppress.
 *
 * `wording` and `structural` are `scoped`: a reviewer may accept a wording defect or a trace
 * gap over named requirements. Every other class is `never`. A verdict is discharged by
 * changing the document; a triage candidate by the table entry it proposes; a hygiene
 * obligation by supplying what is missing; and a disclosure (decision D1) by rewording into a
 * form the solver compares, because a waiver on "not compared" is a claim the tool cannot
 * check.
 */
export const WAIVABILITY = {
  verdict: 'never',
  disclosure: 'never',
  triage: 'never',
  hygiene: 'never',
  wording: 'scoped',
  structural: 'scoped',
  anchor: 'never',
} as const satisfies Record<FindingClass, Waivability>

/** The waivability of one finding code, or `undefined` for a code no catalog publishes. */
export const waivabilityOf = (code: string): Waivability | undefined => {
  const cls = findingClassOf(code)
  return cls === undefined ? undefined : WAIVABILITY[cls]
}

// ---------------------------------------------------------------------------
// Demotion classes
// ---------------------------------------------------------------------------

/** The demotion classes, each with what a demotion of that class says. */
export const DEMOTION_CLASS_MEANING = {
  'conflict-signal':
    'A conflict the document may carry that the decide tier could not see. The signal is evidence about the document.',
  coverage:
    'A requirement, or a group, that no decide-tier comparison covered. Adding requirements can discharge it, so it is outside D.',
  disclosure: '"I did not decide": a comparison not attempted, not finished, or not expressible.',
  triage: 'A candidate the author settles, by a table entry or a rewrite.',
  hygiene: 'A committed table entry that cannot mean what it says. Discharged by removing it.',
  run: 'The run itself was weakened below the armed configuration.',
  anchor: 'The document moved against its baseline, intent, or pinned configuration.',
} as const

export type DemotionClass = keyof typeof DEMOTION_CLASS_MEANING

/** The demotion classes in publication order. */
export const DEMOTION_CLASSES = Object.keys(DEMOTION_CLASS_MEANING) as readonly DemotionClass[]

/**
 * Every demotion reason `check` can publish: the engine's own, and each greenfield tier's.
 *
 * The union a later slice uses to replace the `as CoverageDemotion['reason']` cast at the
 * reachability splice in `app/operations/check.ts`.
 */
export type AppDemotionReason = CoverageDemotion['reason'] | ReachabilityDemotionReason

interface DemotionClassRow {
  readonly class: DemotionClass
  /**
   * Whether removing this demotion across a baseline can be drift. True only for the
   * conflict signals, because only those are evidence of a conflict; every other class
   * disappearing is a repair or a better run.
   */
  readonly drift: boolean
  readonly why: string
}

/** Every demotion reason's class, with the reason in words. */
export const DEMOTION_CLASS = {
  'uncovered-requirement': {
    class: 'coverage',
    drift: false,
    why: 'The requirement shared no atom with any other, so nothing compared it. Adding requirements discharges it.',
  },
  'open-opposition-candidate': {
    class: 'conflict-signal',
    drift: true,
    why: 'Two responses may be contraries no table relates: evidence of a conflict the solver cannot see.',
  },
  'no-decide-tier-comparison': {
    class: 'coverage',
    drift: false,
    why: 'No decide-tier comparison happened anywhere in the run, so nothing was verified.',
  },
  'semantic-tier-skipped': {
    class: 'disclosure',
    drift: false,
    why: 'The semantic tier did not run, so the candidates it proposes were never looked for.',
  },
  'excluded-from-formal': {
    class: 'coverage',
    drift: false,
    why: 'A blocking lint finding kept the requirement from the solver, so no comparison covered it.',
  },
  'quantity-alias-candidate': {
    class: 'conflict-signal',
    drift: true,
    why: 'Two co-active bounds may be one quantity: evidence of a numeric conflict never compared.',
  },
  'relational-reasoning-not-attempted': {
    class: 'disclosure',
    drift: false,
    why: 'Aggregate or cross-quantity reasoning is not attempted by the numeric tier.',
  },
  'numeric-bounds-uncompared': {
    class: 'disclosure',
    drift: false,
    why: 'Bounds on one quantity were neither proved nor dismissed, because the sentences do not fix a reading.',
  },
  'solver-budget-exhausted': {
    class: 'disclosure',
    drift: false,
    why: 'The whole-run solver budget ran out before a tier finished its work.',
  },
  'inconclusive-group': {
    class: 'coverage',
    drift: false,
    why: "A group's solver check returned unknown, so its requirements are not covered.",
  },
  'solver-unknown': {
    class: 'disclosure',
    drift: false,
    why: 'A solver call inside the enumeration returned unknown, so conflicts after it were never looked for.',
  },
  'conditional-conflict-unchecked': {
    class: 'conflict-signal',
    drift: true,
    why: 'Two responses conflict as written under guards no context group makes co-live: evidence of a conflict whose reachability is undecided.',
  },
  'run-weakened': {
    class: 'run',
    drift: false,
    why: 'The run used the stub embedder or a raised threshold: a statement about the run, not the document.',
  },
  'opposite-polarity-near-duplicate': {
    class: 'conflict-signal',
    drift: true,
    why: 'Two near-identical responses at opposite polarity: evidence of a contradiction on two atoms the solver cannot see as one.',
  },
  'number-spelling-candidate': {
    class: 'triage',
    drift: false,
    why: 'Two numbers differ only in a digit separator. Settled by spelling them one way, which is a rewrite, not a drift.',
  },
  'contrary-glossary-alias': {
    class: 'hygiene',
    drift: false,
    why: 'A committed glossary entry names two contraries as one action, which cannot mean what it says. Discharged by removing the alias.',
  },
  'reachability-not-checked': {
    class: 'disclosure',
    drift: false,
    why: 'The reachability tier left part of a committed state model unchecked.',
  },
  'reachability-frame-relied-upon': {
    class: 'disclosure',
    drift: false,
    why: 'A proof holds only under declared frame assumptions.',
  },
  'reachability-budget-exhausted': {
    class: 'disclosure',
    drift: false,
    why: 'The reachability budget ran out before the constraint was decided.',
  },
  'reachability-undecidable': {
    class: 'disclosure',
    drift: false,
    why: 'The solver could not decide the constraint over an unbounded model.',
  },
  'reachability-vacuous-initial-state': {
    class: 'disclosure',
    drift: false,
    why: 'The model has no initial state, so no constraint was checked. The error finding beside it is the verdict.',
  },
  'reachability-certificate-disagrees': {
    class: 'disclosure',
    drift: false,
    why: 'A proof was withdrawn because an independent search refuted it. The error finding beside it is the verdict.',
  },
  'reachability-frame-undeclared': {
    class: 'disclosure',
    drift: false,
    why: 'The proof needs a frame the document does not declare, so it was withheld.',
  },
  'reachability-cross-check-incomplete': {
    class: 'disclosure',
    drift: false,
    why: 'The explicit-state cross-check did not finish, so the proof was withheld.',
  },
} as const satisfies Record<AppDemotionReason, DemotionClassRow>

// ---------------------------------------------------------------------------
// D — the verdict-bearing set, and what the op directions mean over it
// ---------------------------------------------------------------------------

/**
 * D, as data: the error findings of these classes, and the demotions of these classes.
 *
 * Coverage demotions, disclosures, wording and hygiene are OUTSIDE D. That exclusion is why
 * `add` is strengthening although it discharges `uncovered-requirement`: coverage going away
 * is the point of adding requirements, and a decoy that buys coverage is a separate problem.
 * It is also why FND_DANGLING_REFERENCE is `hygiene` and not `structural`: an `add` with the
 * missing `id` discharges it, and the gaming gate measures that (`supply-dangling-target`).
 */
export const VERDICT_BEARING = {
  findingSeverity: 'error',
  findingClasses: ['verdict', 'structural'],
  demotionClasses: ['conflict-signal', 'triage'],
} as const satisfies {
  readonly findingSeverity: string
  readonly findingClasses: readonly FindingClass[]
  readonly demotionClasses: readonly DemotionClass[]
}

/** D's definition as one sentence, built from {@link VERDICT_BEARING} so it cannot disagree. */
export const verdictBearingRule = (): string =>
  `D, the verdict-bearing set, is every ${VERDICT_BEARING.findingSeverity}-severity finding of class ${VERDICT_BEARING.findingClasses.map((c) => `\`${c}\``).join(' or ')}, and every demotion of class ${VERDICT_BEARING.demotionClasses.map((c) => `\`${c}\``).join(' or ')}.`

/** What each op direction claims about D. */
export const DIRECTION_MEANING = {
  strengthening: 'The verb can only ADD members of D.',
  conditional:
    'symspec decides the effect per instance, with a counterfactual run or baseline drift attribution.',
  weakening: 'The verb can remove a member of D.',
} as const satisfies Record<OpDirection, string>

/** One member of D: a finding or a demotion, over the requirements it names (sorted). */
export interface DMember {
  readonly kind: 'finding' | 'demotion'
  readonly name: string
  readonly class: FindingClass | DemotionClass
  readonly requirementIds: readonly string[]
}

/** A {@link DMember} whose class has been widened to a string, as a consumer outside this
 * module holds it. {@link dCovers} reads only the class NAMES, so it accepts either. */
type DMemberLike = Omit<DMember, 'class'> & { readonly class: string }

/** The slice of a `check` payload D is read from. `CheckPayload` satisfies it structurally. */
export interface ReportView {
  readonly findings: readonly {
    readonly code: string
    readonly severity: string
    readonly requirementIds: readonly string[]
  }[]
  readonly coverage: {
    readonly demotions: readonly {
      readonly reason: string
      readonly requirementIds: readonly string[]
    }[]
  }
}

const inClasses = (classes: readonly string[], cls: string | undefined): boolean =>
  cls !== undefined && classes.includes(cls)

/** Project a report onto D, findings first, each member's ids sorted. */
export const verdictBearingOf = (report: ReportView): readonly DMember[] => [
  ...report.findings.flatMap((f): DMember[] => {
    const cls = findingClassOf(f.code)
    return f.severity === VERDICT_BEARING.findingSeverity &&
      cls !== undefined &&
      inClasses(VERDICT_BEARING.findingClasses, cls)
      ? [
          {
            kind: 'finding',
            name: f.code,
            class: cls,
            requirementIds: [...f.requirementIds].sort(),
          },
        ]
      : []
  }),
  ...report.coverage.demotions.flatMap((d): DMember[] => {
    const cls =
      d.reason in DEMOTION_CLASS ? DEMOTION_CLASS[d.reason as AppDemotionReason].class : undefined
    return cls !== undefined && inClasses(VERDICT_BEARING.demotionClasses, cls)
      ? [
          {
            kind: 'demotion',
            name: d.reason,
            class: cls,
            requirementIds: [...d.requirementIds].sort(),
          },
        ]
      : []
  }),
]

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i])

/**
 * Whether `member` of D before a move is still in D after it, under the one identity map
 * Phase 3 needs: a `conflict-signal` demotion is KEPT when a `verdict` finding now names every
 * requirement it named. The demotion was the tool saying "these may conflict and I cannot see
 * it"; a proof over them is the same conflict, seen. Every other member is kept only by
 * itself, over the same requirements.
 *
 * The other identity map G-D is specified with, a symbol merge renaming evidence, has nothing
 * to rename yet: D is keyed on codes, reasons and requirement ids, and no op merges symbols.
 */
export const dCovers = (member: DMemberLike, after: readonly DMemberLike[]): boolean =>
  after.some(
    (m) =>
      (m.kind === member.kind &&
        m.name === member.name &&
        sameIds(m.requirementIds, member.requirementIds)) ||
      (member.class === 'conflict-signal' &&
        m.class === 'verdict' &&
        member.requirementIds.every((id) => m.requirementIds.includes(id))),
  )

// ---------------------------------------------------------------------------
// The manifest projections
// ---------------------------------------------------------------------------

/** The op-direction table as the manifest publishes it: D's rule, the directions, the verbs. */
export const manifestOpDirections = (): ManifestOpDirections => ({
  rule: verdictBearingRule(),
  directions: OP_DIRECTIONS.map((direction) => ({
    direction,
    meaning: DIRECTION_MEANING[direction],
  })),
  verbs: opDirectionRows(),
})

/** Both class tables as the manifest publishes them, every row with its reason. */
export const manifestSignalClasses = (): ManifestSignalClasses => ({
  waivability: { enforced: WAIVABILITY_ENFORCED, statement: waivabilityStatement() },
  findingClasses: FINDING_CLASSES.map((cls) => ({
    class: cls,
    meaning: FINDING_CLASS_MEANING[cls],
    waivable: WAIVABILITY[cls],
    verdictBearing: inClasses(VERDICT_BEARING.findingClasses, cls),
  })),
  demotionClasses: DEMOTION_CLASSES.map((cls) => ({
    class: cls,
    meaning: DEMOTION_CLASS_MEANING[cls],
    verdictBearing: inClasses(VERDICT_BEARING.demotionClasses, cls),
  })),
  findings: Object.entries(FINDING_CLASS).map(([code, row]) => ({
    code,
    class: row.class,
    waivable: WAIVABILITY[row.class],
    why: row.why,
  })),
  demotions: Object.entries(DEMOTION_CLASS).map(([reason, row]) => ({
    reason,
    class: row.class,
    drift: row.drift,
    why: row.why,
  })),
})
