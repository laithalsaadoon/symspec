---
slug: symspec-controlled-vocabulary
sequence: 007
session: session-20facd
---

**Status:** PROPOSED

## Why this is specified rather than just built

The consumer of `check` is an agent in a loop: it writes requirements, runs `check`, applies
the repairs it is handed, and stops when the exit code says it may. That consumer optimizes for
the stop condition. Any move that reaches exit 0 without making the spec right is a move it
will eventually find, and the tool has to be built so that no such move exists, or so that every
such move is visible to a human before it counts.

A formal-methods review of `1.2.1` (HEAD `5e2638f`, `pnpm check` green) reproduced three defect
classes on the built CLI. The reproducers are inline in the acceptance criteria below, so this
spec does not depend on the review's scratch files.

1. **False proofs in the state-model tier.** A constraint that fails in the initial state is
   reported `FND_REACHABILITY_PROVED` with a re-verified certificate, because a bare enum member
   resolves against the first enum that declares it. The certificate agrees because it re-checks
   the same encoding.
2. **Error-severity findings on consistent documents,** most of which are not the
   over-unification that the published scope names as the only false-positive risk: opposites
   encoded as logical negations, a dropped `Unless` clause, `negated` ignored by the numeric
   tier, the unwanted-behavior pattern inverted in the temporal tier, unknown units sharing one
   key.
3. **`verified: true` over real conflicts.** The canonical feature-interaction conflict passes
   `check --strict` with exit 0, because the solver co-asserts only identical context sets while
   coverage counts "shares an atom with a peer" as "compared".

The third class is the one an agent loop exploits without trying. The same root, string atoms
scoped by a normalized `systemName`, also gives an agent a cheap escape: name the system a
second way and two conflicting requirements never meet. The reverse error is just as available:
merge two systems that are merely similar (`front door controller`, `rear door controller`) and
the tool proves conflicts the document does not contain.

This spec does three things, in this order:

- closes the reproduced defects (Stories 1–3);
- introduces a controlled vocabulary that every slot must resolve against, so one thing has
  exactly one name and two things never share one (Story 4);
- classifies every agent move by its direction on the verdict, and admits a weakening move only
  with a certificate symspec checks itself (Stories 5–8).

**The author is assumed to be more capable than any reviewer, including symspec.** The agent
writing the spec may be far better at requirements engineering than the person who owns it, and
the gap is growing. So no verdict may rest on a human reviewing an agent's argument per move: a
human approving a superhuman rationale adds no assurance, and becomes the bottleneck the loop
routes around. The design follows the de Bruijn criterion instead. The author can be arbitrarily
smart, and it must hand symspec every repair in a form a small, sound kernel can check. Humans
state intent and policy once, upstream. They do not approve moves.

It extends the typed-atom plan (`~/.claude/plans/biggest-opportunity-seems-to-concurrent-sprout.md`,
Phase B slice 10 and Phase C slices 11–15). It does not replace it. Where this spec and that
plan overlap, the plan's slice owns the IR mechanics and this spec owns the vocabulary, the
semantics, and the gate.

---

## Invariants every story holds

**I-1 Direction.** Every operation is classified by the direction it can move the finding set,
and the classification is data, not prose:

| class | can do | examples | policy |
|---|---|---|---|
| `strengthening` | only add findings | add a requirement, alias two names, commit a contrary axiom, add a state constraint | free |
| `weakening` | remove findings | refine a requirement, assume something about the environment, declare two names distinct when merging them would add findings, delete or re-bind a requirement, waive a formal finding | admitted only with a certificate the kernel checks (Story 5); otherwise the obligation stays open |
| `run-weakening` | remove findings for one run | `--semantic=false`, the embedding stub, a budget below the pinned config, a low `--temporal-bound` | demotes and is disclosed in `data.run` |

The argument that makes this sound: in the logic the decide tier uses, adding constraints or
equalities cannot turn an unsatisfiable set satisfiable. So an agent that reaches exit 0 on a
conflicting spec has either changed a requirement's meaning or made a weakening move, and both
are enumerable.

**I-2 Propose/decide is unchanged.** Mapping prose to vocabulary is a PROPOSAL. It becomes
decide-side only as a committed op. No embedding, lexicon, or model ever binds a slot on the
decide side.

**I-3 One semantics.** Every tier is a sound projection of the single reactive semantics in
Story 6. A tier that reads a sentence differently from that semantics is a defect, not a design
choice.

**I-4 The sabotage rule applies to every AC.** Each AC names the sabotage that must turn a gate
red, per `CLAUDE.md`. An AC whose sabotage does not fire is not done.

**I-5 A deletion is a finding.** Every gate scores disappearance as well as appearance. A
change that makes a finding or a demotion stop firing is reported, not celebrated. See
`.erpaval/solutions/architecture/a-finer-key-is-not-uniformly-safer.md`.

**I-6 The checker is weaker than the author, and that is fine.** A verdict depends only on the
typed IR, the committed intent (Story 5's `intent` artifact), the committed policy, and
certificates the kernel checks. It never depends on a heuristic an optimizing author can steer, on
an argument the kernel cannot check, or on a per-move human approval. Checking a certificate must
be cheap relative to producing it, so the author does the search and symspec does the check.

**I-7 Intent is the anchor.** The only inputs no agent may change from inside the loop are the
intent artifact and the policy. Everything the agent writes is judged against them. An agent that
edits either one has not repaired the spec, and the gate says so (AC-5-2).

---

## User Story 1 — the state-model tier never proves a false claim

*As an agent relying on `FND_REACHABILITY_PROVED`, I want a proof to mean the constraint holds in
every reachable state of the model I declared, because a certified false proof is the one output
a verifier must never produce.*

### Acceptance Criteria

AC-1-1 [P]
Ubiquitous: The reachability encoder shall resolve every enum member against the enum sort the
type checker (`state-expr.ts` `sortOf`) assigned to that position in the expression, and shall
never resolve it by searching declared enums in order.
Reproducer: `door{open,closed}`, `valve{shut,ajar,open}`, initial `valve = open`, constraint
`valve = shut`. Today: `FND_REACHABILITY_PROVED`, exit 0. Required: `FND_REACHABILITY_VIOLATED`
with the trace `init -> C1`.
Sabotage: restore first-match lookup in `enumMemberIndex`; the reproducer test goes red.

AC-1-2 [P]
Unwanted behavior: If an effect's assignment would write a value outside a variable's declared
range, then the reachability tier shall report `FND_RANGE_VIOLATION` (error) naming the effect
and the reachable pre-state. It shall not conjoin the range into the transition relation in a
way that silently disables the step.
Reproducer: `queue_len` 0..2, `ENQ_FULL: when queue_len = 2: queue_len := queue_len + 1, dropped
:= true`, constraint `not dropped`. Today: PROVED_UNDER_HYPOTHESES, exit 0. Required:
`FND_RANGE_VIOLATION` for `ENQ_FULL`.
Sabotage: re-add the range to the transition relation; the reproducer goes green-for-the-wrong-
reason and the test asserting `FND_RANGE_VIOLATION` goes red.

AC-1-3 [P]
Ubiquitous: A counterexample trace shall be reconstructed from the solver's state sequence, and
each step shall name a requirement whose guard holds in that step's pre-state and whose effect
produces that step's post-state. The trace shall be identical under every permutation of
requirement ids.
Reproducer: `st{IDLE,RUNNING,DONE}`, `START: when st = IDLE`, `FINISH: when st = RUNNING`, with
FINISH's id sorting first. Today: trace `FINISH -> BROKEN`. Required: `init -> START -> ...`.
Sabotage: name steps by sorted rule order; the permutation test goes red.

AC-1-4 [P]
Ubiquitous: State-variable names shall be refused when they equal any expression keyword under
case folding (`True`, `NOT`, `And`), and integer literals shall be carried to Z3 as their decimal
source string, never through a JavaScript `Number`.
Sabotage: accept `True` as a name, or parse `9007199254740993` with `Number`; the paired tests go
red.

AC-1-5
Dependencies: AC-1-1
Ubiquitous: Every `PROVED` and `PROVED_UNDER_HYPOTHESES` over a model whose reachable state space
is at most `REACHABILITY_BFS_STATE_CAP` states shall be cross-checked by an explicit-state
breadth-first search that shares no code with the SMT encoder beyond the parsed expression AST.
When the two disagree, `check` shall report `FND_CERTIFICATE_DISAGREES` (error) and shall not
report the proof.
Sabotage: reintroduce the AC-1-1 defect with the BFS in place; the BFS must catch it and
`FND_CERTIFICATE_DISAGREES` must fire. This is the test that proves the second checker is
independent.

AC-1-6
Dependencies: AC-1-5
Ubiquitous: The `frame` setting's documented behavior and its implemented behavior shall agree,
and the suggested repair for `FND_REACHABILITY_UNDER_HYPOTHESES` shall be an op that `apply`
accepts for the variable's declared type and that, once applied, changes the verdict. A refused
op in a batch shall make `apply` exit non-zero.
Sabotage: emit `type: 'bool'` for an int variable; the round-trip test (apply the repair, re-check,
assert the verdict moved) goes red.

---

## User Story 2 — no error-severity finding on a consistent document

*As an agent in a loop, I want an error finding to mean the requirements genuinely conflict,
because every fabricated error teaches me to rewrite a correct requirement.*

### Acceptance Criteria

AC-2-1
Ubiquitous: A committed or seeded opposition between two actions shall be encoded as the contrary
axiom `¬(A ∧ B)` over two distinct atoms, and never as the rename `A ≡ ¬B`.
Reproducers: "When a flagged purchase order is received, the procurement system shall not accept
the purchase order" plus "… shall not reject the purchase order"; "While the maintenance mode is
active, the conveyor controller shall not start the conveyor" plus "… shall not stop the
conveyor". Today: `FND_CONTRADICTION`, exit 1. Required: no error finding. "shall accept" plus
"shall reject" under one context shall still be `FND_CONTRADICTION`.
Sabotage: restore the XOR at the antonym head flip; both reproducers go red.
Note: this moves the typed-atom plan's deferred "axiom, not rename" change forward, because the
fabrication is live on `main`.

AC-2-2 [P]
Unwanted behavior: If a sentence carries a leading clause the parser does not classify (`Unless`,
`Provided that`, `In case`, `Except`, `Before`, `Until`), then `parse` shall return
`ERR_CLAUSE_UNBOUND` naming the clause, and shall not store the requirement with the clause
removed.
Reproducer: "Unless the guard door is closed, the press controller shall not start the press."
Today: stored as ubiquitous without the clause. Required: `ERR_CLAUSE_UNBOUND`.
Sabotage: return `undefined` from the classifier; the reproducer goes red.

AC-2-3 [P]
Ubiquitous: The response's `negated` flag shall be set only by a negation that governs the modal
(`shall not`, `shall never`), and never by a negation token elsewhere in the response.
Reproducer: "The gateway shall forward requests that are not cached." Required: `negated: false`,
text unchanged.
Sabotage: restore `responseTokens.some(t => t.negationFlag)`; the reproducer goes red.

AC-2-4 [P]
Ubiquitous: Slot-body normalization shall preserve every letter and digit in any script, the
Unicode minus sign, and the case of unit tokens. Characters it removes shall be only
punctuation that carries no identity.
Reproducers: `العربية` vs `日本語`, `α` vs `β`, `−5 °C` vs `5 °C`, `100 Mbps` vs `100 MBps`. Today:
each pair shares one atom. Required: distinct atoms.
Sabotage: restore `[^a-z0-9\s]`; the four reproducers go red.

AC-2-5
Ubiquitous: The numeric tier shall key a bound on `(quantity, dimension, unit)` where an
unrecognized unit contributes its raw text, shall convert units with exact rationals, and shall
compare two bounds only when they share a dimension.
Reproducers: "at least 90 days" vs "at most 1 year"; "at least 1.1 hours" vs "at most 66
minutes"; "at most 2 km" vs "at least 500 meters". Today: each `FND_NUMERIC_CONTRADICTION`.
Required: no error.
Sabotage: key unrecognized units on `''`; the first reproducer goes red.

AC-2-6
Dependencies: AC-2-5
Ubiquitous: The numeric tier shall read a bound through the requirement's `negated` flag, shall
keep deadline (`within`), duration (`for at least`), and period (`every`) as three distinct
quantity roles, and shall keep digits and non-Latin words in the quantity subject.
Reproducers: "shall not keep the door unlocked above 30 seconds" plus "shall keep the door
unlocked below 10 seconds"; "sound the siren within 2 seconds" plus "sound the siren for at least
30 seconds"; "hold zone 1 temperature above 20 degrees celsius" plus "hold zone 2 temperature
below 5 degrees celsius". Required: no error for any of them.
Sabotage: drop `negated` at the extractor call site; the first reproducer goes red.

AC-2-7
Ubiquitous: The bounded temporal tier shall encode unwanted-behavior as `G((P ∧ T) → F R)`,
the same obligation the propositional tier encodes, and shall include the precondition for
event-driven and unwanted-behavior requirements.
Reproducer: "The audit logger shall record the event." plus "If a disk write error occurs, then
the audit logger shall record the event." Today: `FND_TEMPORAL_CONTRADICTION`, exit 1. Required:
no finding.
Sabotage: restore `G(T → ¬R)`; the reproducer goes red.

AC-2-8
Dependencies: AC-2-7
Unwanted behavior: If a bounded temporal UNSAT depends on the `F(antecedent)` premise being
satisfied within `k` steps, then the finding shall be `warn` severity, shall state the bound, and
shall not state that it is not a truncation artifact. An UNSAT that persists with the premise
removed keeps `error`.
Reproducer: a consistent three-mode machine (six `While` rules) at `--temporal-bound 1`.
Sabotage: keep `error` unconditionally; the reproducer goes red.

AC-2-9
Ubiquitous: A guard-implication bridge derived from an event-driven requirement shall establish
its state at the NEXT step, not at the trigger step.
Reproducer: "When the operator presses start, the pump controller shall set the mode to running"
plus "While the mode is running, the pump controller shall not accept a start command" plus "When
the operator presses start, the pump controller shall accept a start command". Today:
`FND_CONTRADICTION`. Required: no error.
Sabotage: emit the bridge at the same step; the reproducer goes red.

---

## User Story 3 — `verified` never certifies what the solver did not compare

*As an agent whose stop condition is `verified: true`, I want it to be false whenever two
obligations that could clash were never asserted together.*

### Acceptance Criteria

AC-3-1
Ubiquitous: A requirement shall count as participating only when it is co-live (`liveIn`) with
at least one other requirement in a group the solver actually checked. Sharing an atom shall not
count.

AC-3-2
Dependencies: AC-3-1
Event-driven: When two requirements under one system constrain the same response atom at opposite
polarity and no checked group makes both live, `check` shall demote `verified` with reason
`conditional-conflict-unchecked` naming both requirements and the union of their contexts.
Reproducer: "When the passenger presses the open button, the door controller shall open the
door." plus "While the train is moving, the door controller shall not open the door." plus the
same pair for "sound the chime". Today: `verified: true`, `--strict` exit 0. Required:
`verified: false`, `--strict` exit 3.
Sabotage: count atom-sharing as participation; the reproducer goes red.
Note: this is the detect-and-demote bridge. Story 6 replaces it with a decision.
Note (with AC-2-1): "constrain the same response atom at opposite polarity" reads as the AC-3-6
"would conflict" rule, exactly: one atom at opposite polarity, or two contraries (opposite sides
of one opposition key) both asserted. So "open the door" under the button press and "close the
door" while the train is moving demote, and restating "shall not open" as the stronger "shall
close" never clears the demotion. Both negated ("do neither") is consistent and does not demote.

AC-3-3 [P]
Ubiquitous: Trigger and precondition slots shall resolve into one guard namespace, so "When the
train is moving" and "While the train is moving" name one guard.
Sabotage: restore the `trig`/`pre` kind in the guard atom name; the "When X" / "While X"
reproducer goes red.

AC-3-4 [P]
Unwanted behavior: If any solver call inside the contradiction enumeration or the temporal tier
returns `unknown`, then `check` shall demote `verified` with reason `solver-unknown` naming the
group, and shall not rely on a separate solve to disclose it.
Sabotage: `break` on `unknown` without recording; a `--timeout-ms 1` two-conflict fixture goes red.

AC-3-5 [P]
Unwanted behavior: If the embedder is the stub, then `check` shall demote `verified` with reason
`run-weakened` and disclose `data.run.embedder: "stub"`.
Reproducer: "heat the cabin" / "cool the cabin" under one trigger. Today: `verified: false`
normally and `true` with `SYMSPEC_EMBED_STUB=1`. Required: `false` in both.
Sabotage: read `isStub` only in `propose-glossary`; the reproducer goes red.

AC-3-6 [P]
Unwanted behavior: If an opposite-polarity pair's responses score above the semantic threshold
and differ only in inflection or number ("open the door" / "open the doors"), then `check` shall
demote `verified` until the pair is aliased or declared distinct.
Sabotage: leave `FND_SIMILAR_SEMANTIC` non-demoting for opposite polarity; the reproducer goes red.
Note (with AC-2-1): an antonym pair is two contrary atoms, so "opposite polarity" reads as "would
conflict if the words named one thing": one atom at opposite polarity, or both asserted on
opposite sides of one class whose opposition keys differ only in inflection or number ("open the
door" / "close the doors"). Both negated ("do neither") is consistent and does not demote. A
proposed merge never unifies two contraries, and never splits a shared atom or opposition key.

---

## User Story 4 — one thing has exactly one name

*As the agent writing the spec, I want every system, feature, event, state, action, and quantity
declared once and referenced by id, so the same system cannot appear under three names and two
different systems cannot share one.*

### Acceptance Criteria

AC-4-1
Ubiquitous: The document shall carry a `vocabulary` with six symbol kinds: `system` (optional
part-of parent), `feature`, `event` (an environment input), `state` (a `stateModel` variable and
its domain), `action` (a system output with its contraries and its state effects), and `quantity`
(dimension, unit, and whether it is an integer or a real). Each symbol has an id, one canonical
phrase, and zero or more aliases.

AC-4-2
Dependencies: AC-4-1
Ubiquitous: Atoms shall be scoped by vocabulary id, not by a normalized string. Two phrases are
the same symbol only through a committed alias.
Sabotage: scope by `normalizeScope(systemName)`; the "The Door Controller" / "door-controller"
fixture goes red.

AC-4-3
Dependencies: AC-4-1
State-driven: While a document has a non-empty vocabulary, `apply` shall refuse a requirement
whose system, feature, guard, action, or quantity phrase does not resolve to a declared symbol or
alias, returning `ERR_UNRESOLVED_SYMBOL` with the nearest declared symbols as candidates. It shall
never bind to a candidate automatically.
Sabotage: bind the top candidate; the fixture that expects the error goes red.

AC-4-4
Dependencies: AC-4-3
Event-driven: When an op declares a new symbol whose phrase is within the alias-proposal
threshold of an existing symbol of the same kind, `check` shall report `FND_SYMBOL_ALIAS_CANDIDATE`
and demote `verified` until the pair is triaged with `symspec vocab alias` or `symspec vocab
distinct`.

AC-4-5
Dependencies: AC-4-4
Ubiquitous: `propose-vocabulary` shall withhold an alias proposal, and say why, when the two
phrases differ by one token, carry different numerals, have different part-of parents, or are
registered contraries. Withheld pairs keep "leave distinct" as the first remedy.
Reproducers: `front door controller` / `rear door controller`; `pump 1` / `pump 2`; `primary
database` / `backup database`.
Sabotage: drop the single-token signal; the first reproducer is proposed as an alias and the test
goes red.

AC-4-6
Dependencies: AC-4-4
Ubiquitous: `vocab alias` shall refuse to merge two actions that are, directly or transitively,
registered contraries.
Sabotage: skip the contrary check at write time; "heat the cabin" / "cool the cabin" merges and
the test goes red.

AC-4-7
Dependencies: AC-4-1
Event-driven: When `propose-vocabulary` runs over a document without a vocabulary, it shall
return an op stream that declares a vocabulary covering every phrase the document uses, grouped
by its proposed aliases and withheld pairs. Applying that stream shall leave every existing
requirement resolved.

---

## User Story 5 — every weakening move carries a certificate the kernel checks

*As the owner of a spec a more capable agent maintains, I want the agent free to make any repair
it can justify in a form symspec checks, and unable to make any repair it cannot, so the loop runs
without me and still cannot game the verdict.*

### Three inputs, and who changes them

| input | written by | changed from inside the loop? |
|---|---|---|
| `intent` | upstream: stakeholder text, an imported standard, or a parent spec | never; replaced only by `import`, and hash-pinned |
| `policy` | the owner, once: a criticality level per intent item, the yield order between levels, and which kinds of environment fact are admissible | never |
| spec: vocabulary, bindings, refinements, certificates | the agent | freely |

A human writes intent and policy. A human never reviews a move. When policy is silent on a
conflict, the owner's action is to add a policy rule that decides every conflict of that shape,
not to adjudicate the one in front of them (AC-5-4).

### Why a certificate, with the door/train example

The conflict is R1 "When the passenger presses open, the door controller shall open the door"
against R2 "While the train is moving, the door controller shall not open the door". The repair
an expert writes is "R1 applies only while the train is stopped". That repair is a weakening of
R1, so it cannot be free. But it has a shape the kernel can check: it removes R1's obligation
exactly on the region where R1 and R2 cannot both hold, and nowhere else, in favour of the
requirement the policy ranks higher. An agent that carves out MORE than the conflict region, or
yields the wrong way, is refused mechanically. No one has to understand the agent's reasoning.
They only have to trust a subset check and an ordering lookup.

### Acceptance Criteria

AC-5-1
Ubiquitous: Every op in `ops.ts` shall carry a `direction` of `strengthening`, `weakening`, or
`conditional`, published in `manifest`, generated into `AGENTS.md`, and asserted exhaustive by a
test over the op union.
Sabotage: add an op without a direction; `tsc` or the exhaustiveness test goes red.

AC-5-2
Dependencies: AC-5-1
Ubiquitous: Every requirement shall carry an `intentRef` to an intent item, or be marked
`derived`. `check` shall report `FND_INTENT_UNCOVERED` (error) for an intent item no requirement
binds, `FND_INTENT_CHANGED` (error) when `intent` or `policy` differs from the `--baseline`, and
shall refuse a `derived` requirement whose effect on the finding set is weakening.
Reproducers: delete R1 (its intent item becomes uncovered); edit the intent text of R2 (intent
changed).
Sabotage: skip the uncovered-intent sweep; the deletion reproducer reaches `verified: true` and
the test goes red.

AC-5-3
Dependencies: AC-5-2, AC-6-2
Event-driven: When a `narrow` op names a requirement `R`, a guard expression `carveOut` over the
vocabulary, the requirements `R` yields to, and the `FND_UNREALIZABLE` witness it resolves, the
kernel shall admit it only when all of the following hold:
1. the refined obligation is `R`'s obligation restricted to `¬carveOut`, and nothing else changed;
2. within `R`'s guard, every state and input satisfying `carveOut` is one where `R` and the
   requirements it yields to are jointly unsatisfiable (`carveOut ∧ guard(R) ∧ ¬conflict` is
   UNSAT), so the carve-out never exceeds the conflict region;
3. `policy` ranks every requirement `R` yields to strictly above `R`;
4. the witness is no longer a violation of the refined spec.
A refused op shall name the failed condition and a model of it.
Reproducers, with R2 ranked safety and R1 ranked comfort: carve-out `moving` is admitted;
carve-out `true` (which silently deletes R1) is refused by condition 2; R2 yielding to R1 is
refused by condition 3.
Sabotage: skip condition 2; carve-out `true` is admitted and the test goes red.

AC-5-4
Dependencies: AC-5-3
Unwanted behavior: If the conflicting requirements' levels are equal, or `policy` does not order
them, then no `refine` shall be admissible. The obligation shall stay open as `FND_UNREALIZABLE`
with reason `policy-silent`, and the finding shall carry a proposed policy rule (propose-only)
that would order every conflict of that shape.

AC-5-5
Dependencies: AC-5-2, AC-6-2
Ubiquitous: An environment assumption shall be admitted only when it is traced by `intentRef` to
an intent item that states it and `policy` admits that kind of fact, or when the kernel proves it
is guaranteed by the rest of the spec in every reachable state (assume-guarantee). Otherwise it
shall not be applied, and the obligation it would discharge stays open.
Reproducer: "passengers never press open while the train is moving", untraced, is refused; the
same fact follows once the spec adds "While the train is moving, the door controller shall
disable the open button", and is then admitted as guaranteed.
Sabotage: admit untraced assumptions; the first reproducer reaches `verified: true` and the test
goes red.

AC-5-6 [P]
Ubiquitous: A formal-tier finding shall not be waivable. A wording (lint) finding shall be
waivable only for the requirement ids and content hash it was raised on, and a waived finding that
excludes a requirement from the formal tier shall still demote.
Reproducer: waive `FND_OPPOSITION_CANDIDATE` for "heat/cool the cabin", then add "fill the tank" /
"drain the tank". Today: `verified: true`. Required: the waiver is refused, and the new pair
demotes.
Sabotage: accept a code-only waiver; the reproducer goes red.

AC-5-7
Dependencies: AC-4-4, AC-5-1, AC-5-2
Ubiquitous: `vocab distinct` shall be `conditional`. symspec shall compute the findings that
would exist if the two symbols were aliased, and when that set is larger, admit the op only with
an intent item or declared vocabulary fact that distinguishes the two (different part-of parents,
or intent naming both). Otherwise it reports `FND_DISTINCTION_UNSUPPORTED` (warn, demoting),
whose evidence is the conflict signals of the merged counterfactual run; the main report stays
on the declared partition, so nothing is fabricated.
Reproducer: "door controller" / "door control unit" with the door/train conflict split across the
two names.
Sabotage: classify `distinct` as always free; the reproducer goes red.

AC-5-8
Dependencies: AC-5-2
Ubiquitous: `check --baseline <git-ref>` shall report `data.semanticDelta`: the findings and
demotions present at the baseline and absent now, each attributed to the op or edit that removed
it, and the certificate that admitted it, if any.
Sabotage: diff findings by code only; a fixture that swaps one contradiction for a different one
reads as "no delta" and the test goes red.

AC-5-9
Dependencies: AC-5-8
Unwanted behavior: If a requirement's binding changed since the baseline without a `refine`
certificate, and the change removed a finding, then `check` shall report `FND_SEMANTIC_DRIFT`
(error).
Sabotage: compare rendered English instead of the binding; a re-binding fixture goes red.

AC-5-10 [P]
Ubiquitous: A committed `symspec.config.json` shall pin the run settings the gate uses (semantic
tier, budgets, temporal bound). Any run below a pinned setting shall be `run-weakening`: disclosed
in `data.run` and demoted with reason `run-weakened`.

AC-5-11
Dependencies: AC-5-3
Ubiquitous: Certificates shall be re-checked by the kernel on every `check`, never cached as
trusted, so a later edit that invalidates one reopens its obligation.
Sabotage: skip re-checking stored certificates; a fixture that widens R2 after R1's refinement was
admitted stays green and the test goes red.

AC-5-12
Dependencies: AC-5-3
Ubiquitous: The certificate kernel shall live in its own subtree, importing only the typed IR and
the solver port, enforced by `src/package-boundary.test.ts`. Condition 2 of AC-5-3 shall
additionally be checked by the explicit-state search of AC-1-5 when the model is under its cap.

AC-5-13
Dependencies: AC-5-2
Ubiquitous: `symspec init --split` shall write `intent` and `policy` as separate files, and
`symspec install` shall generate a CODEOWNERS stanza for those two files and `symspec.config.json`, which pins the gate. The published scope
shall state what the gate guarantees: any change to intent or policy is detected against the
baseline, and every weakening in the spec is admitted by a re-checked certificate or not at all.

AC-5-14
Dependencies: AC-5-2, AC-5-3
Event-driven: When `import` brings in an `intent` that is itself a symspec document, symspec shall
treat it as the parent spec and check that the child refines it. Every parent obligation shall be
entailed by the child, or narrowed only by a `narrow` certificate the kernel admits against the
parent's own policy. A child that drops or weakens a parent obligation without a certificate
shall report `FND_INTENT_NOT_REFINED` (error). The check shall apply level by level, so a
guarantee proved at one level holds against every ancestor.
Reproducer: a parent with R2 "While the train is moving, the door controller shall not open the
door", and a child that omits it. Required: `FND_INTENT_NOT_REFINED` naming R2.
Sabotage: pin the parent's hash only; the reproducer reaches `verified: true` and the test goes red.

---

## User Story 6 — one semantics, and consistency decided under it

*As an agent verifying a spec that defines a state machine, I want every tier to mean the same
thing by a requirement, and conflicts between requirements with different conditions to be
decided rather than skipped.*

### Acceptance Criteria

AC-6-1
Ubiquitous: symspec shall define one synchronous reactive semantics over the vocabulary:

| pattern | obligation at step `t` |
|---|---|
| ubiquitous | `R` at every `t` |
| event-driven `When E` | `E@t ∧ P@t ⇒ R@t` |
| unwanted-behavior `If E, then` | `E@t ∧ P@t ⇒ R@t` |
| state-driven `While P` | `P@t ⇒ R@t` |
| optional-feature `Where F` | `F ⇒ …`, with `F` constant over the run |
| action effects | take hold at `t+1` |

Every tier's encoding shall be a documented sound projection of this table, and a test shall
assert each projection on the same fixture corpus.
Sabotage: make one tier read a pattern differently; the cross-tier agreement test goes red.

AC-6-2
Dependencies: AC-6-1, AC-4-1
Ubiquitous: Consistency shall be decided as one-step realizability. In every reachable state, and
for every assignment to events and features that the committed environment assumptions allow,
the obligations in force shall be jointly satisfiable over the actions. A violation shall be
reported as `FND_UNREALIZABLE` (error) with the witness state, the witness inputs, and the
minimal set of conflicting requirements.
Reproducer: the door/train pair. Required: `FND_UNREALIZABLE` with witness `{moving = true,
open_pressed = true}`.
Sabotage: quantify the inputs existentially instead of universally; the reproducer goes red.

AC-6-3
Dependencies: AC-6-2, AC-5-2
Ubiquitous: `FND_UNREALIZABLE` shall carry the witness and offer three discharges, each checked
rather than trusted: a `narrow` op whose certificate passes AC-5-3; an environment assumption
admitted under AC-5-5; or a strengthening that removes the witness state from the reachable set
(for example an interlock requirement). The finding shall not offer a waiver.

AC-6-4
Dependencies: AC-6-2
Ubiquitous: The state-model obligations shall include, next to each declared constraint: two
effects enabled in one reachable step that write different values to one variable
(`FND_CONFLICTING_WRITES`); a requirement whose guard is unsatisfiable in every reachable state
(`FND_DEAD_REQUIREMENT`); and a reachable state with a reachable input where no obligation set is
satisfiable (`FND_UNREALIZABLE`).
Sabotage: skip the conflicting-writes obligation; the `H_conflicting_writes` fixture goes red.

AC-6-5
Dependencies: AC-6-2
Ubiquitous: The string-atom tier shall remain as a pre-filter that may emit findings and demote
`verified`, and shall never be sufficient on its own to make `verified` true once a document has a
vocabulary.

AC-6-6
Dependencies: AC-6-1
Ubiquitous: Prose-to-binding shall stay propose-only. `parse` shall return a proposed binding and
the rendered back-translation of that binding, and `check` shall report `FND_BINDING_DRIFT`
(info, demoting) when the back-translation's cosine to `source` falls below a measured floor.

---

## User Story 7 — `verified` is an obligation ledger

*As an agent whose stop condition is a number, I want that number to count obligations the solver
decided, not vocabulary that happens to overlap, so decoy requirements cannot move it.*

### Acceptance Criteria

AC-7-1
Dependencies: AC-6-2
Ubiquitous: `data.obligations` shall list every obligation Story 6 generates, each with status
`PROVED`, `VIOLATED`, `UNKNOWN`, or `CERTIFIED` (with the certificate id and the intent items and
policy rule it rests on).

AC-7-2
Dependencies: AC-7-1
Ubiquitous: `verified` shall be true only when every obligation is `PROVED`, or `CERTIFIED` by a
certificate the kernel re-checked on this run, and no intent item is uncovered. `data.progress`
shall be `{open, violated, unknown, policySilent}`, derived from `data.obligations`.
Sabotage: count atom overlap in `progress`; a fixture that adds decoy requirements moves
`progress` and the test goes red.

AC-7-3
Dependencies: AC-7-2
Ubiquitous: The published scope corpus (`src/app/runtime/scope.ts`) shall be checked against the
code catalog: every finding code, tier, demotion reason, and op direction shall be named by some
claim, so adding one without a claim fails the suite.
Sabotage: add a demotion reason with no claim; the catalog-coverage test goes red.

---

## User Story 8 — gaming is measured, not assumed away

*As the maintainer, I want a standing gate that tries every known gaming move against a seeded
defect and fails the build when one reaches a clean verdict unseen.*

### Acceptance Criteria

AC-8-1
Ubiquitous: `src/testing/gaming.ts` shall apply each registered gaming move to each seeded-defect
fixture and assert that the result is not "`verified: true` and exit 0" unless the move is a
repair the kernel certified against intent and policy.

AC-8-2
Dependencies: AC-8-1
Ubiquitous: The registered moves shall include at least: rename a system; alias two contraries;
waive by code; delete a requirement; flip `negated`; move a condition into the response text;
add decoy requirements; change `shall` to `should`; split a system into two parents; edit
`intent`; edit `policy`; submit a `refine` whose carve-out exceeds the conflict region; yield
against the policy order; add an untraced environment assumption; add a `derived` requirement
that weakens; run with the embedding stub, `--semantic=false`, a one-millisecond budget, and
`--temporal-bound 1`. A new op shall not merge without a registered move or a written reason it
has none.

AC-8-3
Dependencies: AC-8-1
Ubiquitous: The gate shall run in `pnpm check`. Its first commit shall record, per move, the
sabotage that made it fire.

---

## Order of work

Each phase keeps `pnpm check` green, and its gate must be observed red before it counts.

1. **Stories 1–3.** Closes every reproduced defect on the current string-atom representation.
   AC-3-2 is the detect-and-demote bridge that Story 6 later replaces.
2. **Story 8's harness,** registered with the moves that already exist, so every later phase is
   measured against it.
3. **Story 4, and the half of Story 5 that needs no solver:** the vocabulary, resolution, the
   intent and policy artifacts, move directions, scoped waivers, the baseline delta, and the
   pinned config (AC-5-1, 5-2, 5-6 to 5-10, 5-13).
4. **Typed-atom plan slices 10–14,** extended from `attr`/`cmp` to the six vocabulary kinds.
5. **Story 6 and Story 7:** the single semantics, one-step realizability, the state-model
   obligations, the BFS cross-check, and the obligation ledger.
6. **The certificate kernel:** `refine`, the policy-silent case, certified environment
   assumptions, re-checking, the kernel boundary, and parent-refinement on import
   (AC-5-3 to 5-5, 5-11, 5-12, 5-14). Until this
   lands, a weakening move has no admission path, so its obligation stays open. That is the safe
   default, not a gap.

---

## Out of scope, and the honest ceiling

- **Full GR(1) realizability.** One-step realizability decides conflicts inside a step. A spec
  that is unrealizable only across steps, where the environment can force a conflict two steps
  ahead, is not decided. The published scope states this.
- **Real-time semantics.** "within 2 seconds" stays a deadline-role quantity in the numeric tier.
  There is no MTL or timed-automaton layer, and the published scope shall say that timing
  conflicts across steps are not checked.
- **Whether intent and policy are right.** symspec can prove the spec is consistent, covers every
  intent item, and weakens nothing except where a certificate shows policy demands it. It cannot
  prove the intent is what the world needs, or that the policy ranks safety correctly. Those are
  the two artifacts a human still owns, and they are small, stable, and written once.
- **Whether a binding matches the author's intent.** AC-6-6 measures drift and demotes. The
  binding is still a proposal a human or agent committed.

## Decisions

Settled with the owner on 2026-09-24.

- **Admission rule for a narrowing fix:** both checks in AC-5-3. The carve-out must stay inside
  the conflict region, and policy must rank the requirement being yielded to strictly higher. No
  minimality proof beyond that.
- **Agent-written intent:** checked against its parent as a refinement, level by level (AC-5-14),
  not pinned by hash alone. A guarantee therefore composes up the chain of specs.
- **Policy granularity:** one criticality level per intent item plus a yield order between
  levels. Conflicts inside one level stay `policy-silent` (AC-5-4). Finer policy, such as rules per
  system or per mode, is not in scope.

### Phase 3 decisions (2026-09-25)

The Phase 3 plan (`phase3-plan.md`, section 12) lists 26 spec gaps with proposed resolutions; all
are accepted. The five decisions it left open:

- **D1** Disclosure codes that mean "not compared" (`FND_NUMERIC_UNCOMPARED`,
  `FND_RELATIONAL_UNCHECKED`, and their siblings) are never waivable. A waiver there is an
  uncheckable claim by the author; the discharge is rewording into a form the solver compares.
- **D2** An owner's legitimate change to intent or policy is re-pinned through `config.anchors` in
  the CODEOWNED config, which turns `FND_INTENT_CHANGED` into info `FND_ANCHOR_REPINNED`.
- **D3** The document format bumps to v4; `import` migrates.
- **D4** Legacy documents lose the waiver discharge for opposition candidates; they rewrite or opt
  into a vocabulary.
- **D5** CODEOWNERS covers `symspec.config.json` as well as intent and policy (AC-5-13 amended).
- The Phase 6 certificate op is named `narrow`, because `refine` is an existing edge verb (G1).

