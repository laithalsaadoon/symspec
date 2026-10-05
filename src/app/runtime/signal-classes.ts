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

import type { CoverageDemotion } from '../../domain/engine/pipeline/check.ts'
import type { ReachabilityDemotionReason } from '../../domain/reachability/reachability-report.ts'
import { OP_DIRECTIONS, type OpDirection, opDirectionRows } from '../../domain/requirements/ops.ts'
import {
  FINDING_CLASS,
  FINDING_CLASS_MEANING,
  FINDING_CLASSES,
  type FindingClass,
  type FindingKey,
  findingClassOf,
  WAIVABILITY,
  type Waivability,
  waivabilityOf,
} from '../../domain/waivability.ts'
import type { ManifestOpDirections, ManifestSignalClasses } from './operation.ts'

// ---------------------------------------------------------------------------
// Finding classes and waivability — owned by the domain, re-exported here
// ---------------------------------------------------------------------------

export {
  FINDING_CLASS,
  FINDING_CLASS_MEANING,
  FINDING_CLASSES,
  type FindingClass,
  findingClassOf,
  WAIVABILITY,
  type Waivability,
  waivabilityOf,
}

// ---------------------------------------------------------------------------
// Waivability enforcement
// ---------------------------------------------------------------------------

/**
 * Whether this build ENFORCES {@link WAIVABILITY}: whether `waive` refuses a `never` code and
 * `check` ignores a stored waiver on one.
 *
 * `true` as of S3 (spec 007 AC-5-6): the fold `apply`, `symspec waive` and `import` run under
 * (`MUTATE_OPTIONS.waiverPolicy`) refuses a `never` code with `ERR_WAIVER_REFUSED`, and
 * `toEngineDoc` forwards no stored waiver of one, so `check` discloses it `waiver-inert` and the
 * finding stands. `app/operations/waivability.test.ts` holds the constant to what the fold and
 * `check` do, in both directions. Every surface that publishes the column publishes this beside
 * it ({@link waivabilityStatement}), so a `never` is never read as a guarantee it is not.
 */
export const WAIVABILITY_ENFORCED: boolean = true

/** The sentence every surface publishes beside the `waivable` column. */
export const waivabilityStatement = (): string =>
  WAIVABILITY_ENFORCED
    ? 'Waivability is enforced: `waive` refuses a `never` code, and `check` ignores a stored waiver on one.'
    : 'Waivability is published policy, NOT enforced by this build: `waive` still commits a waiver on a `never` code, and `check` still suppresses the finding it names. Do not read `never` as a guarantee that `verified: true` excludes a waived finding.'

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
 * Every demotion reason `check` can publish: the engine's own, each greenfield tier's, and
 * `waived-blocking-lint`, which `check` raises at the boundary (spec 007 AC-5-6, G3).
 *
 * `waived-blocking-lint` is deliberately NOT in the engine's `CoverageDemotion['reason']`: the
 * engine does not raise it and its repair table (`advice/repair.ts`) is exhaustive over the
 * engine's reasons only. It is the type of `data.coverage.demotions[].reason` in
 * `app/operations/check.ts`, which replaced the reachability splice's cast.
 */
export type AppDemotionReason =
  | CoverageDemotion['reason']
  | ReachabilityDemotionReason
  | 'waived-blocking-lint'

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
  'waived-blocking-lint': {
    class: 'coverage',
    drift: false,
    why: "A requirement a blocking wording defect excluded reached the solver only through a reviewer's waiver of that defect, so its comparison cannot certify. It replaces `excluded-from-formal` for the same requirement; rephrasing discharges it.",
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

/**
 * The finding codes that state two requirements are EQUIVALENT: the same slots
 * (FND_EXACT_DUPLICATE), or formulas that imply each other (FND_REDUNDANCY, a bi-implication).
 * FND_SUBSUMPTION is one-way, so it is not here: a verdict on the stronger requirement is not a
 * verdict on the weaker one.
 */
export const EQUIVALENCE_CODES = [
  'FND_EXACT_DUPLICATE',
  'FND_REDUNDANCY',
] as const satisfies readonly (keyof typeof FINDING_CLASS)[]

const codeList = (codes: readonly string[]): string => codes.map((c) => `\`${c}\``).join(', ')

/**
 * How a member of D is compared across an edit, as one paragraph built from the tables it names.
 * It is what "contains" means in each direction's claim, so it is published beside them.
 */
export const dIdentityStatement = (): string =>
  `A member of D is its code or demotion reason over the requirements it names, compared under these identity maps. A \`conflict-signal\` demotion is kept by a \`verdict\` finding that names every requirement it named: the proof is the same conflict, seen. And requirements the same report states equivalent (${codeList(EQUIVALENCE_CODES)}) count as one: an equivalent pair makes two overlapping conflicts, and the formal tier reports one representative of them.`

/**
 * How far a new member of D can take a lost one's place in the report. A tier that reports ONE
 * representative where several conflicts exist can hand a strengthening edit's new conflict the
 * report while the old one is still in the document, and how far that reaches is the tier's
 * reporting granularity:
 *
 * - `overlap`: the tier reports conflicts that share no requirement separately, so only a new
 *   member over an overlapping set of requirements can take an old one's place.
 * - `cell`: the tier reports one member per comparison cell, so any new member in the same cell
 *   can, whether or not it shares a requirement.
 * - `code`: the tier reports one member for the whole document, so any new member of the code can.
 */
export type DisplacementGranularity = 'overlap' | 'cell' | 'code'

interface DisplacementRow {
  readonly by: DisplacementGranularity
  /** The tier, and what it reports, as the clause {@link DIRECTION_MEANING} publishes. */
  readonly reports: string
}

/**
 * Every code a new member can DISPLACE, keyed by the tier's reporting granularity. A member of D
 * whose code has no row here is displaced by nothing: a loss of one is a removal.
 *
 * Only the numeric tier's `cell` needs the report to say where a member sits, and the report
 * names a numeric finding's cell by the quantity and base unit in its `evidence.numeric`
 * ({@link DMember.cell}). The context group, the cell's third coordinate, is not in the report,
 * so the gate compares the two the report carries: coarser than the tier's cell by the group.
 *
 * Reporting every core instead of one per granularity is an engine change, out of Phase 3; the
 * numeric and temporal halves are pinned in `testing/recorded-gaps.test.ts`.
 */
export const DISPLACEMENT = {
  FND_CONTRADICTION: {
    by: 'overlap',
    reports:
      'the propositional contradiction tier enumerates pairwise-disjoint minimal cores in each context group, so a new member of the same code over an overlapping set of requirements displaces',
  },
  FND_NUMERIC_CONTRADICTION: {
    by: 'cell',
    reports:
      'the numeric tier proves each (quantity, base unit, context group) cell once and reports one minimized core per cell, so a new member of the same code in the SAME CELL displaces, whether or not it shares a requirement',
  },
  FND_TEMPORAL_CONTRADICTION: {
    by: 'code',
    reports:
      'the temporal tier makes one joint check over the whole document and reports one minimized core, so ANY new member of the same code displaces',
  },
  FND_CYCLE: {
    by: 'overlap',
    reports:
      'the trace tier reports the cycle each depth-first back edge closes, so a new member of the same code over an overlapping set of requirements displaces',
  },
} as const satisfies Partial<Record<FindingKey, DisplacementRow>>

const displacementOf = (code: string): DisplacementRow | undefined =>
  code in DISPLACEMENT ? DISPLACEMENT[code as keyof typeof DISPLACEMENT] : undefined

/** What each op direction claims about D. The `strengthening` bound is built from {@link DISPLACEMENT}. */
export const DIRECTION_MEANING = {
  strengthening: `The verb only adds constraints, so no conflict the document carries goes away. What it can do to the REPORT is DISPLACE a member of D, as far as the reporting granularity of the tier that emits it reaches: ${Object.entries(
    DISPLACEMENT,
  )
    .map(([code, row]) => `for \`${code}\`, ${row.reports}`)
    .join(
      '; ',
    )}. A numeric finding names its cell by the quantity and base unit in its evidence, and not its context group, so that pair is the cell compared. No other member of D is displaced by anything. That is the only loss the label allows. The gaming gate lists every measured displacement, and fails on any loss that is not one.`,
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
  /**
   * The comparison cell a `cell`-granular finding ({@link DISPLACEMENT}) sits in, as the report
   * names it: its evidence's quantity and base units. Absent on every other member.
   */
  readonly cell?: string
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
    readonly evidence?: {
      readonly numeric?: {
        readonly quantity: string
        readonly predicates: readonly { readonly unit: string }[]
      }
    }
  }[]
  readonly coverage: {
    readonly demotions: readonly {
      readonly reason: string
      readonly requirementIds: readonly string[]
    }[]
  }
}

/** The numeric cell a finding's evidence names: its quantity and its sorted base units. */
const cellOf = (f: ReportView['findings'][number]): string | undefined => {
  const numeric = f.evidence?.numeric
  if (displacementOf(f.code)?.by !== 'cell' || numeric === undefined) return undefined
  return JSON.stringify([
    numeric.quantity,
    [...new Set(numeric.predicates.map((p) => p.unit))].sort(),
  ])
}

const inClasses = (classes: readonly string[], cls: string | undefined): boolean =>
  cls !== undefined && classes.includes(cls)

/** Project a report onto D, findings first, each member's ids sorted. */
export const verdictBearingOf = (report: ReportView): readonly DMember[] => [
  ...report.findings.flatMap((f): DMember[] => {
    const cls = findingClassOf(f.code)
    const cell = cellOf(f)
    return f.severity === VERDICT_BEARING.findingSeverity &&
      cls !== undefined &&
      inClasses(VERDICT_BEARING.findingClasses, cls)
      ? [
          {
            kind: 'finding',
            name: f.code,
            class: cls,
            requirementIds: [...f.requirementIds].sort(),
            ...(cell !== undefined ? { cell } : {}),
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

/** The equivalence groups a report states: each {@link EQUIVALENCE_CODES} finding's ids, sorted. */
export const equivalencesOf = (report: ReportView): readonly (readonly string[])[] =>
  report.findings
    .filter((f) => (EQUIVALENCE_CODES as readonly string[]).includes(f.code))
    .map((f) => [...f.requirementIds].sort())

/**
 * Each id's representative under the stated equivalences: the least id of its connected group
 * (the groups are joined transitively, so `a≡b` and `b≡c` put all three in one). An id no group
 * names is its own representative.
 */
const representativeOf = (groups: readonly (readonly string[])[]): ((id: string) => string) => {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const p = parent.get(id)
    if (p === undefined || p === id) return id
    const root = find(p)
    parent.set(id, root)
    return root
  }
  for (const group of groups) {
    for (const id of group) {
      const [a, b] = [find(group[0] ?? id), find(id)]
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b)
    }
  }
  return find
}

/**
 * Whether `member` of D before a move is still in D after it, under the identity maps
 * {@link dIdentityStatement} publishes.
 *
 * 1. A `conflict-signal` demotion is KEPT when a `verdict` finding now names every requirement
 *    it named. The demotion was the tool saying "these may conflict and I cannot see it"; a
 *    proof over them is the same conflict, seen.
 * 2. Requirement ids are compared through `equivalences`, the groups the AFTER report states
 *    equivalent ({@link equivalencesOf}). An `add` of a requirement equivalent to R1 makes the
 *    cores {R1,R2} and {R3,R2} overlap, and the formal tier reports one of them, so the verdict
 *    on (R1,R2) comes back as (R3,R2). The report itself says R3 ≡ R1, so that is the same
 *    verdict under another representative. Only equivalences the report STATES are used: a
 *    requirement that merely looks alike, or one that subsumes another, is not the same one.
 *
 * Every other member is kept only by itself, over the same requirements. The identity map the
 * plan also names, a symbol merge renaming evidence, has nothing to rename yet: D is keyed on
 * codes, reasons and requirement ids, and no op merges symbols.
 */
export const dCovers = (
  member: DMemberLike,
  after: readonly DMemberLike[],
  equivalences: readonly (readonly string[])[] = [],
): boolean => {
  const rep = representativeOf(equivalences)
  const canon = (ids: readonly string[]): readonly string[] => ids.map(rep).sort()
  const ids = canon(member.requirementIds)
  return after.some((m) => {
    const other = canon(m.requirementIds)
    return (
      (m.kind === member.kind && m.name === member.name && sameIds(other, ids)) ||
      (member.class === 'conflict-signal' &&
        m.class === 'verdict' &&
        ids.every((id) => other.includes(id)))
    )
  })
}

/**
 * Whether a member of D that a move lost was DISPLACED rather than removed: the after-set holds a
 * member of the same kind and code that the code's tier could have reported in its place, at the
 * granularity {@link DISPLACEMENT} records for it. A code with no row is displaced by nothing.
 * This is the only loss {@link DIRECTION_MEANING}'s `strengthening` row allows, and the gaming gate
 * holds every loss a strengthening move shows to it.
 */
export const dDisplaced = (member: DMemberLike, after: readonly DMemberLike[]): boolean => {
  const by = member.kind === 'finding' ? displacementOf(member.name)?.by : undefined
  if (by === undefined) return false
  return after.some(
    (m) =>
      m.kind === member.kind &&
      m.name === member.name &&
      (by === 'code' ||
        (by === 'cell' && member.cell !== undefined && m.cell === member.cell) ||
        (by === 'overlap' && m.requirementIds.some((id) => member.requirementIds.includes(id)))),
  )
}

// ---------------------------------------------------------------------------
// The manifest projections
// ---------------------------------------------------------------------------

/** The op-direction table as the manifest publishes it: D's rule, the directions, the verbs. */
export const manifestOpDirections = (): ManifestOpDirections => ({
  rule: verdictBearingRule(),
  identity: dIdentityStatement(),
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
