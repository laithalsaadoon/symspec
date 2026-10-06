/**
 * Formal-coverage disclosure (wishlist #6).
 *
 * The formal tier only performs cross-requirement conflict/subsumption analysis
 * on candidate PAIRS — two requirements that share at least one atom. A document
 * whose requirements share no vocabulary produces `pairsChecked: 0`, meaning the
 * SMT layer proved nothing about consistency ACROSS requirements. That silence
 * reads exactly like a clean pass to a careless reader, which is the one place
 * the tool's honesty gap actually bites.
 *
 * `noPairsCheckedFinding` turns that silent zero into a loud `info` finding so
 * the coverage gap is visible in `findings[]` rather than only in a numeric
 * field an agent has to remember to print. It is emitted by the `check`
 * pipeline (see `pipeline/check.ts`) exactly when `pairsChecked === 0` on a
 * document that actually had ≥2 requirements to relate.
 */

import type { FndCode } from './codes.ts'

/** The shape the `check` pipeline pushes into its normalized `findings[]`. */
export interface CoverageFinding {
  readonly code: FndCode
  readonly severity: 'info'
  readonly requirementIds: readonly string[]
  readonly message: string
}

/** Why no pair was evaluated, as far as the pipeline can tell, so the message names the cause. */
export interface NoPairsCause {
  /** Some atom is owned by two or more requirements: vocabulary is not the gap. */
  readonly atomsShared: boolean
  /** An `FND_EXACT_DUPLICATE` fired: that pair is reported, not compared. */
  readonly exactDuplicates: boolean
}

/**
 * Build the `FND_NO_PAIRS_CHECKED` info finding. Names every requirement id so a
 * reader can see the whole set that went uncompared. Info severity, so it never
 * moves the exit gate — it is a disclosure, not a defect.
 *
 * The cause clause follows `cause`: "no two requirements shared an atom" and the vocabulary
 * advice are said only when that is the case. Two copies of one requirement share every atom,
 * and telling their author to align vocabulary contradicts `coverage.requirements`.
 */
export function noPairsCheckedFinding(
  requirementIds: readonly string[],
  cause: NoPairsCause = { atomsShared: false, exactDuplicates: false },
): CoverageFinding {
  const because = !cause.atomsShared
    ? 'no two requirements shared an atom, so no cross-requirement contradiction/subsumption ' +
      'analysis ran. This is NOT a consistency certificate — consider adding glossary entries ' +
      'to align vocabulary so related requirements share atoms and can be compared.'
    : 'the requirements do share atoms, so vocabulary is not the gap, but no pair of them was ' +
      'compared: ' +
      (cause.exactDuplicates
        ? 'an exact-duplicate pair is reported as FND_EXACT_DUPLICATE rather than compared. '
        : 'requirements whose guards no decided context group asserts together are never ' +
          'paired. ') +
      'This is NOT a consistency certificate — `coverage.requirements` says which requirements ' +
      'were asserted together with a peer.'
  return {
    code: 'FND_NO_PAIRS_CHECKED',
    severity: 'info',
    requirementIds: [...requirementIds],
    message: `The formal tier evaluated 0 candidate pairs: ${because}`,
  }
}

/**
 * Build the `FND_EXCLUDED_FROM_FORMAL` info finding for ONE requirement the
 * AC-3-7 gate dropped from the SMT tier. A LOUD, first-class coverage signal
 * (not buried in `residualRisk`) so an author never reads "0 contradictions,
 * verified: true" over a document a third of which the solver never saw.
 *
 * `reason` is the gate's exclusion reason (`'parse-failure'` |
 * `'blocking-surface-check'`); `blockingCodes` names the finding codes that
 * blocked the surface, so the discharge instruction is concrete. The fix is to
 * REPHRASE (clear the blocking finding). The message names no waiver: the code is
 * never waivable (spec 007 AC-5-6), and the scoped alternative for the blocking lint,
 * with why it cannot verify, is the `excluded-from-formal` demotion's to state.
 */
export function excludedFromFormalFinding(
  requirementId: string,
  reason: string,
  blockingCodes: readonly string[],
): CoverageFinding {
  const codes = blockingCodes.length > 0 ? blockingCodes.join(', ') : reason
  const how =
    reason === 'parse-failure'
      ? 'the requirement did not parse into an EARS pattern the encoder accepts'
      : `an error-severity finding (${codes}) blocked its surface`
  return {
    code: 'FND_EXCLUDED_FROM_FORMAL',
    severity: 'info',
    requirementIds: [requirementId],
    message:
      `${requirementId} was excluded from the formal (SMT) tier because ${how}, so no ` +
      'cross-requirement analysis covered it and `verified` does not account for it. Fix the ' +
      'blocking finding (rephrase the requirement) to re-admit it to the solver: a clean surface ' +
      'is the only discharge that can reach `verified: true`, and the `excluded-from-formal` ' +
      'demotion says what else its repair offers and why that cannot verify.',
  }
}

/**
 * Build the `FND_RELATIONAL_UNCHECKED` info finding. Emitted when requirements
 * under one shared guard carry numeric bounds alongside unmatched (singleton)
 * atoms — the structural shape where aggregate/conservation constraints (N
 * reservations summing past a capacity) or cross-quantity relational conflicts
 * (triangle inequality, end = start + duration, rate cascades) hide. symspec's
 * numeric tier is pairwise and same-quantity only: it never sums bounds across
 * requirements nor relates distinct quantities. This finding is the honest
 * "aggregate/relational reasoning not attempted" caveat, so `verified` never
 * outruns what the solver actually compared. Info severity; DEMOTES `verified`.
 */
export function relationalUncheckedFinding(requirementIds: readonly string[]): CoverageFinding {
  return {
    code: 'FND_RELATIONAL_UNCHECKED',
    severity: 'info',
    requirementIds: [...requirementIds],
    message:
      'These requirements share a guard condition and carry numeric bounds alongside atoms no ' +
      "other requirement references. symspec's numeric tier compares bounds PAIRWISE on the same " +
      'per-quantity key only — it does NOT sum bounds across requirements (aggregate/conservation) ' +
      'nor relate distinct quantities (e.g. end = start + duration, rate cascades, pigeonhole/' +
      'cardinality). Such reasoning was NOT attempted, so a `verified` result here does not cover ' +
      'aggregate or cross-quantity conflicts. If the requirements share a finite resource or a ' +
      'quantitative relation, verify that constraint by hand or restate it as a same-quantity bound.',
  }
}
