/**
 * THE REACHABILITY FINDING CODES — greenfield-owned.
 *
 * ## Why these are not in `engine/formal/codes.ts`
 *
 * Codes live with the tier that emits them. That file is the engine's catalog — the
 * transplanted 30, closed over what the engine's pipeline fires — and this tier is
 * greenfield, so its codes are owned here and unioned in `kernel/catalog.ts`.
 *
 * So the split is by PROVENANCE rather than by kind. The transplanted 30 `FND_*` codes
 * stay where they are; these are v5's own, and `kernel/catalog.ts` unions them so
 * `explain` and the manifest see one flat vocabulary. An agent cannot tell the difference
 * and should not need to — the codes are the API, and where the bytes live is an
 * implementation detail of keeping the vendored tier untouched.
 *
 * ## Append-only, and the ordering rule
 *
 * Same discipline as the three transplanted catalogs: never renumber, never rename,
 * never remove. New codes go at the END of {@link REACHABILITY_FND_CODES}. The count is
 * pinned in `catalog.test.ts` so growing the vocabulary is a visible edit in review.
 *
 * ## Why each code exists, and why each severity
 *
 * Each code answers a question with a DIFFERENT remedy, which is the test for whether a
 * code deserves to exist. The list is {@link REACHABILITY_FND_CODES}; the paragraphs below
 * are the reasons, not a count:
 *
 * - `FND_REACHABILITY_VIOLATED` — **error**. A reachable state violates a declared
 *   constraint, with a trace naming the requirements that get there. This is the only
 *   error-severity code in the family, and it earns that: the verdict survived BOTH the
 *   strict and the framed run (AC-2-5), so it is not an artifact of having assumed
 *   nothing.
 * - `FND_REACHABILITY_PROVED` — **info**. A positive result, reported because a proof
 *   the tool performed and did not mention is a proof the reader cannot rely on. Carries
 *   the inferred invariant and the fact that it independently re-verified.
 * - `FND_REACHABILITY_UNDER_HYPOTHESES` — **info**, and DEMOTES. The property holds only
 *   with the declared frames, so it is true given something the document does not say.
 *   Names the variables relied upon and their writers.
 * - `FND_REACHABILITY_UNKNOWN` — **info**, and DEMOTES. The solver did not decide. Split
 *   by cause in the MESSAGE (budget vs undecidable) rather than into two codes, because
 *   the code is what an agent branches on and both branches lead to the same place:
 *   read the reason, then either raise the budget or bound the model.
 * - `FND_REACHABILITY_NOT_CHECKED` — **info**. The tier did not run, or ran over less than
 *   the whole document. THE "silence made visible" code, in the `FND_NO_PAIRS_CHECKED`
 *   tradition: without it, a document with no state model looks exactly like a document
 *   that passed. It DEMOTES when a committed model leaves a gap; with no model at all the
 *   tier is opt-in and the `check` boundary emits it without a demotion.
 *
 * - `FND_REACHABILITY_VACUOUS_INITIAL` — **error**, and DEMOTES every constraint. The
 *   initial-state predicate conjoined with the declared ranges is UNSATISFIABLE, so the
 *   reachable-state set is EMPTY and every invariant holds vacuously. Its own code rather
 *   than a `NOT_CHECKED` disclosure because the failure mode is categorically different:
 *   not-checked says "the question was not asked", while this says "the question was
 *   asked, answered `unreachable` on every constraint, and that answer means NOTHING".
 *   Error severity because it silently masks REAL violations — measured on the gold
 *   fixture, adding `held = 0 and held = 2` to the model flipped a genuine
 *   `FND_REACHABILITY_VIOLATED` into `PROVED ... with nothing assumed` and the exit code
 *   from 1 to 0.
 * - `FND_CERTIFICATE_DISAGREES` — **error** (spec 007 AC-1-5). The independent
 *   explicit-state search refuted a proof. The V28 certificate re-checks the SAME encoding,
 *   so an encoder that asks the wrong question passes it; only a second route to the answer
 *   sees that. Error, and the proof is withdrawn, because the tool cannot tell which
 *   checker is wrong and must not publish a claim one of its own checkers refutes.
 * - `FND_RANGE_VIOLATION` — **error** (spec 007 AC-1-2). An effect writes outside its
 *   target's declared `--min`/`--max` from a reachable state, under the full frame. Its own
 *   code because the remedy is about the EFFECT or the RANGE, not about any constraint —
 *   and because the alternative, conjoining the range into the transition relation,
 *   silently disabled the overflowing step and "proved" its consequences impossible.
 *
 * `FND_REACHABILITY_CERTIFICATE_FAILED` is deliberately NOT here. When the three
 * obligations do not discharge, the tier does not report a weaker proof — it reports
 * `FND_REACHABILITY_UNKNOWN`, because an answer that did not re-verify is an answer the
 * tool has no basis to state. Adding a code for "we proved it but could not check the
 * proof" would create a rung on the confidence ladder that the contract does not have.
 *
 * ## Why the certificate check cannot substitute for the vacuous-initial gate
 *
 * The obvious objection to a dedicated gate is that V28's independent certificate check
 * should already catch a fabricated proof. It cannot, and the reason is worth stating
 * because it is the whole justification for a sixth code: when `Init` is unsatisfiable
 * Spacer infers `Inv := false`, and `false` discharges ALL THREE obligations VALIDLY —
 * `Init ⇒ false` holds because `Init` is itself false, `false ∧ T ⇒ false'` holds
 * trivially, and `false ⇒ ¬Bad` holds trivially. So the certificate is sound and the
 * conclusion is still worthless. Vacuity is not a solver error; it is a question that was
 * never really asked, and only a satisfiability check on `Init` itself can see it.
 */

/**
 * The reachability finding codes, in append-only order.
 *
 * Prefixed `FND_REACHABILITY_` so the family is greppable and so
 * `nearestCodesAll`'s shared-prefix ranking keeps a misspelling inside the family — the
 * same property that keeps a misspelled `GTWR_*` from suggesting `ERR_*` codes.
 */
export const REACHABILITY_FND_CODES = [
  'FND_REACHABILITY_VIOLATED',
  'FND_REACHABILITY_PROVED',
  'FND_REACHABILITY_UNDER_HYPOTHESES',
  'FND_REACHABILITY_UNKNOWN',
  'FND_REACHABILITY_NOT_CHECKED',
  // APPENDED at the HARDENING wave, never inserted — see the append-only rule above.
  'FND_REACHABILITY_VACUOUS_INITIAL',
  // APPENDED for spec 007 Story 1. Named by the spec rather than by the family prefix:
  // a range overflow is a defect in the declared MODEL, not a verdict about a constraint.
  'FND_RANGE_VIOLATION',
  'FND_CERTIFICATE_DISAGREES',
] as const

export type ReachabilityFndCode = (typeof REACHABILITY_FND_CODES)[number]

/**
 * The description corpus.
 *
 * Written in v4's own shape so `kernel/catalog.ts` can parse them with the SAME
 * parsers it uses on the transplanted families rather than a second set: a leading
 * `<severity> — ` prefix (em dash, U+2014 — a hyphen matches nothing), and a trailing
 * `Suggestion:` clause where there is a remedy. That is why these read a little
 * formulaically; the format is load-bearing.
 */
export const ReachabilityFndCodeMeta: Record<
  ReachabilityFndCode,
  { readonly code: ReachabilityFndCode; readonly description: string }
> = {
  FND_REACHABILITY_VIOLATED: {
    code: 'FND_REACHABILITY_VIOLATED',
    description:
      'error — a REACHABLE state violates a declared constraint, and the evidence carries the ' +
      'counterexample trace naming which requirements fired, in order, to get there. Proven over ' +
      'ALL reachable states with no bound (Z3 Spacer), and proven in BOTH the strict and the framed ' +
      'configuration, so it is a genuine defect rather than an artifact of assuming nothing about ' +
      'unwritten variables. Suggestion: read the trace, then either fix the requirement whose ' +
      'effect reaches the bad state or correct the constraint if it states more than intended.',
  },
  FND_REACHABILITY_PROVED: {
    code: 'FND_REACHABILITY_PROVED',
    description:
      'info — a declared constraint holds in EVERY reachable state, proven with no bound and with ' +
      'nothing assumed beyond the document (frame-closed). The evidence carries the inductive ' +
      'invariant the solver inferred, which was then INDEPENDENTLY re-checked by three plain-SMT ' +
      'obligations (Init implies Inv, Inv and the transition relation imply Inv-prime, Inv implies ' +
      'not-Bad) — so the claim does not rest on trusting the solver. Reported rather than left ' +
      'silent because a proof the tool performed and did not mention is a proof the reader cannot rely on.',
  },
  FND_REACHABILITY_UNDER_HYPOTHESES: {
    code: 'FND_REACHABILITY_UNDER_HYPOTHESES',
    description:
      'info — a declared constraint holds only WHEN the declared frame assumptions are granted: it ' +
      'is reachable-violating with nothing assumed, and unreachable once the variables declared ' +
      '`frame: stable` are held fixed except where a requirement writes them. That is a proof given ' +
      'a hypothesis NO REQUIREMENT ESTABLISHES, so it DEMOTES `verified` and names the exact ' +
      'variables relied upon together with the requirements that write them. Never rendered as ' +
      'proven-unconditionally. Suggestion: either add the requirements that justify the stable ' +
      'declaration, or apply the repair ops, which re-declare those variables `volatile` with their ' +
      'own type, range, and initial — the verdict then becomes FND_REACHABILITY_UNKNOWN with reason ' +
      'frame-undeclared, the honest weaker claim.',
  },
  FND_REACHABILITY_UNKNOWN: {
    code: 'FND_REACHABILITY_UNKNOWN',
    description:
      'info — whether a declared constraint (or a declared range) can be violated was not decided, ' +
      'so nothing is claimed either way and `verified` is DEMOTED. The message states which cause ' +
      'applies, because the causes need different remedies. Budget exhaustion and undecidability ' +
      'are solver limits the solver cannot be asked about: a timed-out Spacer query reports its reason as the literal string ' +
      '"ok", so budget exhaustion is told from undecidability out-of-band, by measured elapsed time ' +
      'against the budget that was set. Frame-undeclared is not a solver limit: the ' +
      'constraint holds once every unwritten variable is held fixed and is violable when the ' +
      'variables the document declares `volatile` change on their own, which the document does not ' +
      'rule out. Cross-check-incomplete withholds a proof: the solver proved the ' +
      'constraint, but the independent explicit-state search stopped without showing the model is ' +
      'beyond the size it must re-decide. Suggestion: for budget exhaustion raise ' +
      '--reachability-timeout-ms (this tier`s own ' +
      'per-query bound, which defaults to --timeout-ms when absent); for genuine undecidability bound ' +
      'the integer domains in the state model instead, since more time will not help; for ' +
      'frame-undeclared either author the requirements that keep the named variables fixed or apply ' +
      'the repair ops, which declare them `frame: stable` (the verdict becomes ' +
      'FND_REACHABILITY_UNDER_HYPOTHESES, still demoted); for cross-check-incomplete state each ' +
      'initial value as `name = <value or expression>` or narrow the declared ranges, so the search ' +
      'can enumerate the model.',
  },
  FND_REACHABILITY_NOT_CHECKED: {
    code: 'FND_REACHABILITY_NOT_CHECKED',
    description:
      'info — the unbounded reachability tier did NOT cover part or all of this document. Emitted ' +
      'when no state model is committed (the tier is opt-in, so this one does not demote ' +
      '`verified`), and — DEMOTING `verified` — when a committed model leaves a gap: no ' +
      'requirement carries a constraint to check, a classified requirement could not be read, ' +
      'or the model admits no transitions at all (in which case only the initial state exists ' +
      'and any invariant over it holds almost vacuously). This is a coverage DISCLOSURE, not a ' +
      'defect: silence over a question that was never asked reads exactly like a pass, which is the ' +
      'one thing this tool must never do. Suggestion: declare state variables with `symspec state <name> --type <bool|int|enum>`, ' +
      'then classify the responses that touch them with `symspec classify <ref> --kind constraint --expression "<predicate>"`.',
  },
  FND_REACHABILITY_VACUOUS_INITIAL: {
    code: 'FND_REACHABILITY_VACUOUS_INITIAL',
    description:
      'error — the INITIAL STATE is UNSATISFIABLE: the model-wide `initial` predicate, the ' +
      'per-variable `initial` predicates, and the declared integer/enum ranges cannot all hold at ' +
      'once, so the model has NO initial state, the reachable-state set is EMPTY, and every ' +
      'constraint holds VACUOUSLY. Nothing is proven about anything and every constraint is ' +
      'DEMOTED. Error severity rather than a disclosure because a vacuous model does not merely ' +
      'fail to prove — it MASKS proven violations: measured, adding a contradictory initial ' +
      'predicate to a document with a genuine reachable violation turned an error-severity ' +
      'FND_REACHABILITY_VIOLATED into a confident "PROVED with nothing assumed" and flipped the ' +
      'exit code from 1 to 0. The independent certificate check cannot catch this, because an ' +
      'unsatisfiable Init makes `Inv := false` discharge all three obligations validly. ' +
      'Suggestion: inspect the predicates with `symspec list`, then fix the contradiction — ' +
      '`symspec state-initial "<satisfiable predicate>"` for the model-wide one, ' +
      '`symspec state <name> --type <type> --initial "<predicate>"` for a per-variable one, or ' +
      '`symspec state-initial --clear` to drop the model-wide constraint entirely. Also check ' +
      'the declared --min/--max bounds do not exclude the initial value.',
  },
  FND_RANGE_VIOLATION: {
    code: 'FND_RANGE_VIOLATION',
    description:
      'error — an EFFECT writes a value OUTSIDE its target variable`s declared --min/--max range ' +
      'from a REACHABLE state, so the declared range is false of the system as specified. The ' +
      'evidence names the effect, the variable, the value written, the reachable pre-state, and ' +
      'the trace that reaches it (every step requirement-sanctioned). The step is NOT disabled: ' +
      'enforcing the range by conjoining it into the transition relation made an overflowing ' +
      'step silently never fire, which "proved" everything downstream of it impossible. ' +
      'Suggestion: guard the effect so it cannot fire at the bound, clamp the value it writes, or ' +
      'widen the declared range if the overflow is intended.',
  },
  FND_CERTIFICATE_DISAGREES: {
    code: 'FND_CERTIFICATE_DISAGREES',
    description:
      'error — the unbounded solver PROVED a constraint (or proved it under hypotheses), and an ' +
      'INDEPENDENT explicit-state search of the same model found a reachable state that violates ' +
      'it. The search shares nothing with the SMT encoder beyond the parsed expression, and it ' +
      'runs on every proof over a model whose reachable state space is small enough to ' +
      'enumerate, so a disagreement means one of the two checkers is wrong about THIS model. ' +
      'The proof is WITHDRAWN rather than reported, and `verified` is demoted. The evidence ' +
      'carries the explicit witness: the path of states and the requirements that fired. ' +
      'Suggestion: this is a tool defect, not a document defect — read the witness against the ' +
      'model to see which checker is right, and report it with the document attached.',
  },
}
