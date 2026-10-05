/**
 * WAIVABILITY, as data the domain can read: every finding code's class, and which classes a
 * waiver may suppress (spec 007 AC-5-6, S3).
 *
 * The table lives in the domain ring because the two places that ENFORCE it are domain code:
 * the boundary projection `compat.ts` (`toEngineDoc` forwards no stored waiver the policy
 * refuses) and the write-time classifier `app/operations/mutate-options.ts` hands the fold. The
 * ring rule (`package-boundary.test.ts`) lets `app/` read `domain/` and never the reverse, so a
 * table under `app/runtime/` would leave the check-time half unable to see it.
 * `app/runtime/signal-classes.ts` re-exports every name here, beside the demotion classes and
 * the published enforcement flag, so the manifest, `explain` and AGENTS.md read one table.
 */

import type { FND_CODES } from './engine/formal/codes.ts'
import { GTWR_CODES } from './engine/lint/codes.ts'
import type { REACHABILITY_FND_CODES } from './reachability/reachability-codes.ts'
import type { TERMINOLOGY_FND_CODES } from './terminology/terminology-codes.ts'

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
export type FindingKey =
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
  // A PUBLISHED rule only: `GTWR_R99_NOT_A_RULE` shares the prefix and is no code, so a prefix
  // test would classify a code no catalog publishes as `wording` and let a waiver of it in.
  if (code.startsWith('GTWR_')) {
    return (GTWR_CODES as readonly string[]).includes(code) ? FINDING_CLASS.GTWR.class : undefined
  }
  // An OWN row only: `code in FINDING_CLASS` is true for `constructor`, `toString` and every
  // other key on `Object.prototype`, and a classifier a waiver's code can steer to an inherited
  // key is a classifier a hand-edited document can game.
  return Object.hasOwn(FINDING_CLASS, code) && code !== 'GTWR'
    ? FINDING_CLASS[code as FindingKey].class
    : undefined
}

// ---------------------------------------------------------------------------
// Waivability — derived from the class, never stated per code
// ---------------------------------------------------------------------------

/** `scoped`: waivable only over named requirements and their current text. `never`: not at all. */
export type Waivability = 'scoped' | 'never'

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
