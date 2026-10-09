# Readings: S6 resolver chokepoint, run 4 (legacy entry)

Assembled by the clerk (job 2257, board item clerk, swarm vdd-4-s6-resolver) from the role records named at each section. The clerk judges nothing. Base `2b0364406121fc441a4b30b1da36d771b9eecf97`; receipted range `9605b2c884692d82a281724c3135c6fe5c467e3b..2b03644`.

## 1. Story as received (vdd_runs id 4, verbatim)

> Write the VDD receipt for symspec spec 007 Phase 3 slice S6, "Resolver chokepoint, implicit vocabulary, invariants (pure)" (AC-4-1, AC-4-2, AC-4-6), the code of which already exists: entry legacy. Repo: /home/lalsaado/bonk-fs/.chora/agents/symspec/lead/push10, a clean clone whose HEAD 2b0364406121fc441a4b30b1da36d771b9eecf97 (local branch ask/11-s6-sweep-memory) is the head of draft PR #20 on GitHub (laithalsaadoon/symspec, branch ask/10-s6-onto-main, check run 37861302887 green). The run's base is that HEAD. The S6 change under review is 9605b2c884692d82a281724c3135c6fe5c467e3b..2b03644 (origin/main 9605b2c = release 2.0.0 plus PRs #17 and #18; 13 commits, 32 files, +7213/-233): phraseKey, buildVocabularyIndex (V1 to V-FROZEN), resolvePhrase, resolveRequirement, bindingOf, implicitVocabulary, renderVocabularyOps, mintSymbolId and buildProjection (union-find with the minimum-id representative), under src/domain/vocabulary/, with waiverBinding in content-hash.ts shared by the boundary and the projection (compat.ts keeps main's S3 waiverStanding). S6 has no callers yet (S7 and S8 add them), so AC-4-1, AC-4-2 and AC-4-6 are met only as far as the pure functions go: the contract states which parts of each AC this slice proves and which wait on S7/S8, and those parts are residuals, not reds. The roadmap's property tests are the acceptance lines: (1) two slots with one atom name share one implicit symbol (coarser-or-equal); (2) buildVocabularyIndex(render(implicit(D))) equals implicit(D); (3) normalizeScope(id) === id and quantityKey(id) === id for every minted id; (4) V-OPP preserves areContrary across the canonical rewrite for every pair of phrases in two classes; each over every corpus document plus constructed multi-spelling fixtures (two spellings, article variants, unit case MW/mw). G0 is the repo's own `pnpm check` (seven legs, 118 files, 3859 tests at 2b03644 on this host, about 150 s), the gaming harness's KNOWN_ESCAPES, the report-corpus snapshot and CLAUDE.md's sabotage rule, frozen at base. Write scope: tests and fixtures for the four properties and any unproved S6 behavior, the receipt under .erpaval/vdd/s6-resolver-chokepoint/ (the folder pattern S3's .erpaval/vdd/s3-waivability/ uses), and product code under src/domain/vocabulary/ only when a criterion turns red. Memory: GitHub's ubuntu-latest runner has 16 GB; src/domain/vocabulary/outcome.test.ts once peaked at 36 GB RSS because z3-solver 5.0.0 modules booted per document were never freed (fixed by 2b03644). Any new test that boots the solver per document must stay under 4 GB RSS, measured with /usr/bin/time -v npx vitest run <file>; mutation testing must not run unbounded solver boots in parallel. Never push, never open or change a PR, never touch /mnt/uv-cache/workplace/symspec (its live workflow worktree wf_53c3a6df-1a3-2 holds p3/s6) or the source clone push10 beyond `git clone`. The run ends with the receipt on branch vdd/<slug> in the run clone and the fetch command; carrying it to PR #20 is a separate decision for the owner. The owner has not delegated rulings: put the run contract and each round's reds to the owner through ask_human.

## 2. Intake (job 2176, opus; tables in `intake-s6-tables.md`)

- **Corpus.** 73 documents (53 report: eval-rounds 12, fabrication 11, gaming 17, gaming-control 13; plus 20 generated ladder tiers 1-4 at 5 each), 204 requirements, 375 implicit symbols, 8 multi-spelling classes (7 action, 1 quantity). The commit message d209075 says 59 documents and 314 symbols: the corpus grew since.
- **Components.** Domain `src/domain/vocabulary/{keys,ids,implicit,resolve,build,projection,invariants,outcome,readers}.ts`, `src/domain/requirements/content-hash.ts` (`waiverBinding`), `src/domain/compat.ts`, the engine refactors in `src/domain/engine/formal/*`, `engine/lint/gtwr.ts`, `engine/pipeline/{check,gate}.ts`, the z3 adapter `solver-service.ts` (`letGo`), `src/package-boundary.test.ts`, `src/testing/gaming.ts`.
- **No callers.** No module outside `src/domain/vocabulary` calls `buildProjection`, `projectedDocument`, `resolveRequirement` or `buildVocabularyIndex` at base. No trust boundary (pure in-process functions), so no threat model.
- **Properties at base.** P1 and P3 proved at base by `resolve.test.ts`; P2 and P4 partly (P2 compares symbols and bindings only; P4 runs over the 53 report documents, not the ladder). Sabotages SAB-1..4 were recorded in the commit messages d209075 and ced2906 but not re-observed at 2b03644.
- **G0 at base.** biome ci exit 0 (259 files), tsc exit 0, check:agents exit 0, gate:reachability exit 0 (FEASIBLE, 836 ms of 5000), build exit 0, vitest 3859 passed in 118 files, knip exit 0; `pnpm check` 2:47, peak RSS 5.3 GB. Per-file vitest at base: invariants 26, resolve 59, hygiene 7, readers 30, outcome 1 (88 s, 3.3 GB), encode 32, package-boundary 9, compat 27, solver-service 11.
- **Biome scope.** `biome.json` `files.includes` is `src/**/*.ts`, `scripts/**/*.ts`, `*.ts`, `*.json`, `*.jsonc`, `!!.claude`; the repo already commits JSON under `.erpaval/vdd/s3-waivability/`, so JSON under `.erpaval/` is outside what `biome ci` checks (confirmed by the clerk run in the receipt, section 4).
- **Tier proposed.** 2 (one new test file); both readings later said 3 (RQ1).
- **Questions Q1-Q8** went to the readings; the reconciler settled or raised them as RQ1-RQ9.

## 3. Readings

All three read the same 14-requirement fixture (R1-R14, antonyms open/shut, empty glossary and terms) and the overlays D1 and D2. Each outcome below is "measured" by the reader or "predicted" from the code; the reconciler ran no probe.

### 3.1 Reading A (job 2180, opus, Claude family; `job-2180/reading-a.md`)

- Fixture: 26 symbols (6 system, 1 state, 3 event, 14 action, 2 quantity, no feature), 0 violations, 0 unresolved, `buildProjection(fixture)` undefined.
- P1-P4 hold on the fixture. D1 (alias `shut the valve` of `seal the valve`) is refused V-OPP; D2 (alias `at most 25 C` of `at most 20 C`) is refused V-NUM.
- SAB-2 and SAB-4 turn the fixture red; SAB-1 needs an extra open-the-valve requirement (the 14 rows cannot show it); SAB-3 over the implicit form is caught by V-READ, so (4) stays green there.
- Raised: base refuses a contrary-adding merge (`outcome.ts:487-494`) where plan 4.2(b) says an alias can only add findings (B1); a gate path with sentence `x` includes 0 of 14 rows (RQ7); open questions Q9-Q13.

### 3.2 Reading C (job 2181, codex, GPT family; `job-2181/reading-c.md`)

- Same fixture outcomes, with 19 atoms and 20 engine keys including numeric bounds; labels the quantity-key reading of P3 as `quantityKey('x',id).slice(quantityKey('x','').length) === id`.
- Reads AC-4-2 "only through a committed alias" as governed by phrase-key identity (RQ6 a); the feature kind is not minted without a use (RQ8 a).
- Raised: D1 without `act_open` and without R8 leaves alias `shut the valve` of `act_seal` admitted with 0 violations, against the F4 text "same opposition as the canonical" (B2, RQ4).
- Corpus: P1 (gate atoms plus all numeric bounds), P2, P3, P4 (14 pair observations) pass on the 73 documents (measured), 3 documents encode no requirement.

### 3.3 Reading B (job 2186, sonnet, reader-b; third reading added by RQ1 a)

- Agrees with the approved contract; no code at base contradicts an acceptance line. It supersedes its own tier-2 answer with the person's RQ1 a.
- N1: keep V-NUM red as the violation list. N2: V-OPP also refuses a merge that adds a contrary pair (boundary sentence). N3: P3 under a glossary row whose canonical is an id (boundary). None adds an assertion; all are recorded here.
- Attacker note: dropping only the V-NUM bound blocks leaves 20 C / 25 C green (the three numeric-bound return sites are not the whole of V-NUM).

## 4. Reconcile agreement table (job 2184; `job-2184/reconcile.md` section 1)

| row | reading A | reading C | outcome |
|---|---|---|---|
| S6-P1 coarser-or-equal | atom and quantity-key groups each map to one (system, slot symbol) pair; fixture 0 violations | same grouping, 19 atoms, 20 groups; fixture 0 violations | settled |
| S6-P1 path (encoder vs gate) | sentence `x` includes 0 of 14, the template sentence 10; used the pure encoder | same; recommends pure encoder over all 14 plus the gate set | question RQ7 |
| S6-P2 round trip | 26 ops; symbols, byId, representative, owners, merges, distinct deep-equal; 14 bindings equal; mode and via differ by design | same field set plus raw minted symbols | settled |
| S6-P3 fixed points | all 26 ids pattern, length <= 64, scope fixed point, label key fixed point; literal `quantityKey(id)===id` false (2-arg, scope prefix) | same | settled (label-key reading) |
| S6-P4 contraries kept | one scope, 2 pairs scoped (grant/revoke also with the scope-blind helper) | 3 pairs lock/unlock, opens/shut, grant/revoke, all kept | settled |
| S6-P4 D1 control | D1 drops alias V-OPP; under SAB-3 D1-only red in (4) | same; no-alias control 0 violations | settled (form is RQ5) |
| S6-SAB-1 | 14 rows stay green; with R15 event-driven P1 red (measured) | second slot must be explicit; P1 red (predicted) | settled that 14 rows cannot show it; the extra row is RQ9 |
| S6-SAB-2 | one system `sys_gateway`, V1 invalid 1, P1 green (measured) | two-symbol assertion fails, P1 need not (predicted) | settled |
| S6-SAB-3 | all V-OPP returns disabled: D1-only admitted, (4) red; implicit form stays green via V-READ | same (predicted, listed form) | settled for the listed form; RQ5 |
| S6-SAB-4 | all V-NUM returns disabled: D2 admitted, red (measured) | same (predicted) | settled |
| AC-4-1 (S6 part) | slot-to-kind table; five kinds on the fixture, no feature | same five kinds; no feature without a use | settled; feature row is RQ8 |
| AC-4-2 (S6 part) | min-id representative either direction; Door Controller alias rewrites only that requirement (measured) | min-id representative; different-key slot projects to canonical text, same-key verbatim (rule) | settled |
| AC-4-2 "only through a committed alias" | Q11 open | phrase-key identity governs | question RQ6 |
| AC-4-6 (S6 part) | open+shut, alias `shut the valve`, lock/unlock refused V-OPP; heat/cool direct and transitive | heat/cool direct refused; heat~warm admitted, warm~cool refused | settled |
| AC-4-6 chain open~seal, seal~shut | first V-READ, second V-OPP (measured) | silent | held out of the contract (transitivity carried by heat/warm/cool) |
| contrary-adding merge (A C1) | merge sys_a_gateway+sys_gateway refused V-OPP, against plan 4.2(b) | silent | question RQ3 |
| F4 signature (C #1) | silent | alias `shut` of `seal` admitted 0 violations (`invariants.test.ts:266`), against F4 | question RQ4 |
| order independence | reversed order deep-equals (measured) | reordering must not change the `_2` owner | settled |
| corpus (73 docs) | no numbers; cites base tests | P1-P4 pass (measured) | settled as expected green |
| Q1 tier | (c) | (c) | readings agree; put to the person as RQ1 |
| Q2 P2 equality | (b) | (b) plus raw minted | settled |
| Q3 P4 corpus | (b) | (b) | settled |
| Q4 unit case | (c) | (c) | settled |
| Q5 sabotage evidence | (b); (c) only for V-OPP | (b) | settled (b) |
| Q6 records | (a) committed | (c) receipt only | question RQ2 |
| Q7 ids in names | (a) | (a) | settled |
| Q8 SAB-4 target | (a) | (a) | settled |
| G0 | not rerun | not rerun | intake base verdicts stand |

Tally (reconciler): 21 settled rows, 9 questions, 1 row held out.

## 5. Settled examples X1-X21 (shared fixture, base 2b03644)

- **X1 implicit vocabulary.** mode implicit, 0 violations, 0 unresolved, 26 symbols: 6 system, 1 state, 3 event, 14 action, 2 quantity, 0 feature; no merges, no distinct; `buildProjection(fixture)` undefined.
- **X2 one system, two spellings.** `sys_door_controller` canonical `door controller`, aliases [`Door Controller`]; R1, R2, R3, R6, R7 bind it.
- **X3 one state, article and copula.** `st_train_moving` canonical `the train is moving`, aliases [`train moving`]; R6 preCondition and R7 trigger bind it.
- **X4 article keeps two systems.** `sys_a_gateway` (`A Gateway`, R4) and `sys_gateway` (`Gateway`, R5).
- **X5 inflected head.** R8 binds `act_open_the_valve` (canonical `opens the valve`, no alias on the 14 rows); R9 `act_shut_the_valve`; R10 `act_seal_the_valve`.
- **X6 unit case MW/mw.** R11 `act_limit_the_output_to_at_most_5_mw` (`5 MW`), R12 `..._5_mw_2` (`5 mw`); one quantity `qty_limit_the_output` {dimension unrecognized, unit `MW`, numberType int}; bindings <= 5/1 MW and <= 5/1 mw; engine key `sys__inverter__qty__limit_the_output`.
- **X7 two bounds, one quantity.** `qty_keep_the_cabin_temperature` {unrecognized, `C`, int}; R13 <= 20/1 C, R14 <= 25/1 C; key `sys__hvac__qty__keep_the_cabin_temperature`; R13 and R14 stay two actions.
- **X8 events.** `evt_tank_full` (R9), `evt_leak_alarm_sounds` (R10), `evt_door_opens` (R14).
- **X9 P1.** 0 violations over all 14 rows with `encode(toEncodable(viewOf(r)), tablesOf(D).atomize)` plus the four numeric bindings (19 atoms).
- **X10 P2.** `renderVocabularyOps` gives 26 ops; redeclared: invalid [], symbols, byId, representative, owners, merges and distinct deep-equal; 14 `bindingOf` equal; explicit symbols equal raw minted; projection 0 rewrites, 0 unresolved, 0 quantity rows; mode implicit vs explicit.
- **X11 P3.** All 26 ids pass pattern, length <= 64, scope fixed point and label-key fixed point, the `_2` id included; full key `quantityKey('x','act_open_the_valve')` = `sys__x__qty__act_open_the_valve`, not equal to the id, by design.
- **X12 P4.** At one probe scope 3 contrary pairs (lock/unlock the door, opens/shut the valve, grant/revoke access), 0 losses; `seal the valve` contrary to neither.
- **X13 D1.** Exactly one violation {V-OPP, alias, [act_seal], `shut the valve`}; `act_seal` and `act_open` survive with empty aliases; an unchecked rewrite turns (`open the valve`, `shut the valve`) contrary true into (`open the valve`, `seal the valve`) false. Control without the alias: 0 violations.
- **X14 D2.** Exactly one violation {V-NUM, alias, [act_keep], `keep the cabin temperature at most 25 C`}; an unchecked rewrite reads <= 25/1 C as <= 20/1 C. Control without the alias: 0 violations.
- **X15 AC-4-6.** heat/cool direct merge refused V-OPP, admitted merges []; heat~warm admitted, warm~cool refused V-OPP; class representative `act_a_heat`. On the fixture: open+shut and lock+unlock merges refused V-OPP.
- **X16 AC-4-2.** Declared system canonical `door-controller` with alias `The Door Controller`: alias admitted, only the `The Door Controller` requirement rewritten to systemName `door-controller`. The union-find representative is the minimum id in either merge direction.
- **X17 order.** `implicitVocabulary` over the reversed requirement order deep-equals the original (the `_2` owner unchanged).
- **X18 SAB-2.** Under `normalize` system keys: one system `sys_gateway` canonical `A Gateway` aliases [`Gateway`] (two expected: red), P1 green.
- **X19 SAB-3.** Under V-OPP disabled: D1 (listed form) admitted, P4 red on open/shut vs open/seal.
- **X20 SAB-4.** Under V-NUM disabled: D2 admitted with 0 violations, against expected X14: red.
- **X21 corpus.** 73 documents, 204 requirements, 375 symbols: P1, P2, P3, P4 (action phrases) pass at base.

## 6. Rulings RQ1-RQ9 and the person's answer

Asked once through `ask_human` (job 2172, 2026-10-09). The person (Laith) answered "Approve all as recommended" (decision D-4-1). Each row gives the question as the reconciler put it (`reconcile.md` section 5), the recommended letter, and the letter in force.

| id | behavior | question | options | ruled |
|---|---|---|---|---|
| RQ1 | S6-012 | Tier. The receipted range edits engine core and the z3 adapter. | (a) tier 3 with a third reading (reader-b) before the contract, no threat model; (b) tier 3 with the two readings as run, the missing third reading a residual; (c) tier 2, engine and z3 refactors rest on G0 plus unchanged snapshots | **a** |
| RQ2 | S6-012 | Records | (a) commit `.erpaval/vdd/s6-resolver-chokepoint/{readings.md, behaviors.json, ...}`; (b) ledger only; (c) receipt only | **a** |
| RQ3 | S6-004 | A merge that adds a contrary pair (sys_a_gateway + sys_gateway) | (a) refused V-OPP, systems stay apart (base); (b) admitted (plan 4.2(b)); (c) system merges admitted, action merges refused | **a** (plan text mismatch becomes follow-up B1) |
| RQ4 | S6-004 | Opposition signature without a counterpart (alias `shut the valve` of `act_seal`, no `act_open`) | (a) dropped with V-OPP (F4 text); (b) admitted with 0 violations, refused once a contrary counterpart is declared or used (base) | **b** (follow-up B2) |
| RQ5 | S6-007 | Overlay form for D1/D2 | (a) exactly the listed symbols; (b) the implicit vocabulary with the listed symbols replacing those naming the same phrases; (c) both | **a** |
| RQ6 | S6-010 | Same-key spellings in explicit mode | (a) `Door Controller` and `door-controller` resolve to canonical `door controller` (same phrase key); `The Door Controller` needs an alias; (b) only exact canonical and alias strings | **a** |
| RQ7 | S6-001 | P1 path and fixture sentence | (a) pure encoder over every requirement, sentence pinned to `The <system> shall <response>.`, test also asserts the gate-included count (10 of 14) and a nonzero atom count per row; (b) shipping included set only | **a** |
| RQ8 | S6-009 | Feature kind on the fixture | (a) no feature row, kind stays covered by `resolve.test.ts` "feature vs state"; (b) add an optional-feature requirement | **a** |
| RQ9 | S6-005 | SAB-1 fixture | (a) no variant; (b) fixture + R15 event-driven, trigger `the tank is empty`, `pump controller`, `open the valve`; (c) fixture + R15 ubiquitous | **b** |

## 7. Assumptions with owners

- A1 the engine refactors in 9605b2c..2b03644 preserve behavior (unchanged snapshot files and the G0 vitest leg), owner Laith.
- A2 S8 feeds the engine through `projectedDocument` text alone, so S6's partition argument transfers, owner S8.
- A3 the test stand-in `declare` matches S7's fold for vocab ops, owner S7.

## 8. Boundaries (no executable check)

S5 schema and per-kind payloads; S7 fold, `vocab` and `vocab alias` write-time refusal, ERR_UNRESOLVED_SYMBOL, frozen tables at write, antonym re-validation; S8 `toEngineDoc(document, projection)`, AC-4-2's own Door Controller sabotage at check, FND_VOCABULARY_INVALID demotion, twins and parity gates; S9-S10 proposals; S14/S16 baseline `removed[]` and drift; S17 distinct counterfactuals; any z3 verdict (the `outcome.test.ts` sweep is not rerun by the new tests); unit or dimension agreement between a quantity and its bounds (B9); same-key aliases reporting `via: alias`.

## 9. Base against the acceptance lines (reconcile section 4)

No base behavior breaks a criterion as the readings settled its wording. Each mismatch is a question or a follow-up: B1 contrary-adding merge refused (RQ3); B2 F4 signature weaker at base (RQ4); B3 P3 literal wording `quantityKey(id)===id` (label key meant); B4 P2 literal object equality (mode and provenance differ by design; closed by S6-002); B5 vacuous gate path with sentence `x` (RQ7); B6 SAB-1 not observable on the 14 rows (RQ9); B7 SAB-3 over the implicit form is caught by V-READ (RQ5); B8 gaps closed by settled answers; B9 declared quantity unit versus its bounds unchecked (S5/S7).
