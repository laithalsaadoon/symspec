---
title: Bounded LTL→SMT conflict checks need an F(antecedent) reachability assertion, or every G(trig→…) is vacuously SAT
track: knowledge
category: architecture
module: src/domain/engine/formal/temporal.ts, src/domain/engine/formal/temporal-patterns.ts
component: z3-solver
severity: high
tags: [temporal, ltl, smt, z3, bounded-model-checking, reachability, vacuity, fret, dwyer]
applies_when:
  - encoding EARS/temporal requirements as bounded LTL→SMT for consistency checking
  - a temporal contradiction check returns SAT (no conflict) when you expect UNSAT
  - requirements are guarded implications G(trigger → response)
pattern: |
  symspec's temporal tier maps EARS to LTL (event-driven AND unwanted-behavior →
  G((P ∧ T) → F R), the same obligation the propositional tier's (P ∧ T) ⇒ R
  encodes) and lowers to a bounded finite-trace SMT encoding on Z3-WASM. The
  first working version returned SAT for an obvious "eventually R" vs "never R"
  pair — no conflict found — because a `G(ante → cons)` obligation is VACUOUSLY
  satisfiable by keeping `ante` false at every step. The solver just sets the
  trigger false forever and both requirements hold. This is the exact temporal
  analogue of the propositional reachability subtlety contradiction.ts already
  documents ("(X⇒Y) ∧ (X⇒¬Y) is SAT with X=false").

  Fix: assert antecedent REACHABILITY. For every distinct guarded antecedent,
  add `F(ante)` (ante true at SOME step, i.e. ⋁_{t≤k} ante@t). Antecedents dedupe
  by atom name, so two requirements guarded by the same trigger become reachable
  TOGETHER — exposing the conflict — without asserting mutually-exclusive
  triggers simultaneously true (which would manufacture spurious conflicts). This
  mirrors contradiction.ts's "assert THIS group's context atoms true, never every
  trigger at once."

  Also load-bearing for temporal correctness:
  - Unwanted-behavior is an OBLIGATION, not an absence. This lesson used to
    record G(T → ¬resp) (SPS Absence) as the intended reading, with a "two-way
    polarity trap" note about double negation. That reading was a DEFECT (spec
    007 AC-2-7): "If a disk write error occurs, then the audit logger shall
    record the event" demands the recording, and reading it as a prohibition
    made it an error-severity FND_TEMPORAL_CONTRADICTION against "The audit
    logger shall record the event." — a fabricated verdict on a consistent
    document. Every tier is a projection of ONE reading of the sentence (I-3):
    the template contributes no ¬; a prohibition is `negated: true` and threads
    onto the response literal exactly as for every other pattern. The
    precondition is part of the antecedent for event-driven and
    unwanted-behavior too (EARS complex `While P, when T`); dropping it made the
    obligation fire on T alone. `temporal.test.ts` pins antecedent = context and
    consequent = response for every pattern × slot combination.
  - A response obligation G(T → F R) does NOT conflict with a state-scoped
    prohibition G(P → ¬R) (a negated `While`) even when P = T: respond after the
    guard clears is a valid trace. A real
    temporal contradiction needs a GLOBAL absence G(¬R) (ubiquitous, negated) vs
    the eventual response. Trigger-scoped clashes are propositional, not temporal.
  - The encoding is loop-free (sound-for-UNSAT): UNSAT is a real contradiction;
    SAT-at-k is NOT a consistency certificate. Report {bound, complete:false}.
example_files:
  - src/domain/engine/formal/temporal.ts
  - src/domain/engine/formal/temporal-patterns.ts
  - src/domain/engine/formal/temporal.test.ts
  - src/domain/engine/formal/contradiction.ts
---

# Why this matters

Without the reachability assertion the temporal tier is worse than useless — it
returns SAT (looks like "consistent") on genuinely contradictory specs, the most
dangerous possible failure for a consistency checker. The vacuous-satisfaction
trap is subtle because the unit test that builds `G(T ∧ ¬R)` by hand (T true
every step) DOES catch a conflict, masking the bug until an end-to-end run with
real `G(T → …)` guarded formulas exposes it.

# What NOT to do

Do not assert all antecedents true at once (manufactures conflicts between
mutually-exclusive triggers). Do not read SAT-at-bound-k as "consistent" — it is
only "no conflict within k steps." Do not give any EARS template
its own polarity — the template's reading must equal the propositional tier's.
