# S3 waivability (AC-5-6): evidence, VDD run 2

Role: evidence (pipeline role; independence: a reader of the build, not its author). Job 1007 for the coordinator, job 815.
Build HEAD: `7afb20e` (`feat(waivers)!: enforce waivability: refuse never-class and unscoped waivers, inert stored ones`), parent `ae177c2`, branch `vdd/s3-waivability`. Base of the run: `0fca043`.
Measured with `SYMSPEC_EMBED_STUB=1 NO_COLOR=1 CI=1`, node 24, pnpm 11.21.0. Nothing here edits code, tests or other docs, and no gap is marked ruled.
Every sabotage, base build and probe ran in throwaway `git clone --no-hardlinks` copies of the run clone (`pnpm install --offline --frozen-lockfile`), never in the run clone. The only commands run in the run clone are `pnpm check` and read-only `git`.

## 1. The whole gate, `pnpm check`, at 7afb20e in the run clone

`pnpm check` = `biome ci . && tsc --noEmit && pnpm run check:agents && pnpm run gate:reachability && pnpm run build && vitest run && pnpm run knip`. Exit 0.

| leg | result | count |
|---|---|---|
| `biome ci .` | pass | 241 files checked, no fixes |
| `tsc --noEmit` | pass | exit 0 |
| `check:agents` | pass | `gen-agents --stdout` equals committed `AGENTS.md` |
| `gate:reachability` | pass | FEASIBLE: sound, catches the planted defect, 1421 ms within the 5000 ms budget (12 variables) |
| `build` (tsdown) | pass | `dist/cli.mjs` 2.75 MB |
| `vitest run` | pass | 112 files, 3494 tests passed, 0 failed |
| `knip` | pass | no findings |

Second full run in a separate clone (`probe`, JSON reporter): 112 files, 3494 passed, 0 failed. All 164 tests of `contract-failing-on-base.txt` are present by name and pass (164 of 164). The counts of base (3488 tests, 163/164 failing) come from absence-2 and contract-3, not re-measured here.

## 2. Sabotage replays

Method: `sab.py` applies one string replacement to a clean HEAD clone (asserting the old text occurs exactly as expected), runs the named test files with `vitest -t <ids>` first unsabotaged (0 red every time) and then sabotaged, records the red tests, and restores with `git checkout -- .` (tree checked clean after each). Reds are counted by vitest assertion results, not by exit code.

### 2a. The 17 sabotages the build commit names

| # | sabotage (my own edit of HEAD) | tests the commit names | result | verdict |
|---|---|---|---|---|
| 1 | accept a code-only waive: the refs refusal disabled (mutate.ts applyWaive) | waive-fold [S3-002] [S3-003] [S3-006] [S3-011] code-only | 4 red, 2 green | RED, as named |
| 2 | policy skipped when the waive is unscoped (mutate.ts applyWaive) | check-waivers [S3-038] write half | 1 red, 1 green | RED, as named |
| 3 | waive-by-code KNOWN_ESCAPES row re-added for contrary-pair (gaming.ts) | shard b [S3-048]; registry [S3-047] [S3-048] [S3-050] (file-wide rerun S103: 4 red, adds 2 more registry tests) | 2 red, 1 green | RED, as named |
| 4 | ', or waived' restored in scope.ts coverageDemotion | scope [S3-042] VERBATIM; [S3-042] no longer counts a waived candidate | 2 red, 1 green | RED, as named |
| 5 | waived-blocking-lint demotion dropped (check.ts) | check-waivers [S3-033] [S3-034] [S3-035] [S3-036] x2; roundtrip [S3-033] [S3-035] | 7 red, 1 green | RED, as named |
| 6 | waivedBlockingIds fewer-than-two vacuity removed (R53) | shard f [S3-048] (+ its matrix snapshot) | 1 red, 1 green | RED, as named |
| 7 | classifier by GTWR_ prefix (waivability.ts findingClassOf) | waive-fold [S3-009]; compat [S3-009] [S3-010] [S3-030] | 2 red, 6 green | RED, as named |
| 8 | hygiene class made scoped (waivability.ts WAIVABILITY) | check-waivers [S3-016] run-equals-deleted; [S3-025] | 2 red, 2 green | RED, as named |
| 9 | old 'repair waiver' prose in pipeline/check.ts (opposition action) | repair.test [S3-040] pipeline/check.ts sweep | 1 red, 11 green | RED, as named |
| 10 | 'waive this finding' restored in semantic.ts variantMessage | repair.test [S3-040] semantic.ts sweep; report-corpus [S3-040] finding message | 2 red, 16 green | RED, as named |
| 11 | old FND_NUMERIC_UNCOMPARED catalog description ('or waive it') | waive-fold [S3-040] no catalog row advises a waiver | 1 red, 0 green | RED, as named |
| 12 | WAIVABILITY_ENFORCED false | waivability [S3-044] flag is true; no surface says NOT enforced | 2 red, 4 green | RED, as named |
| 13 | import widening of an unresolvable --ref restored (import.ts) | import [S3-013] x2, [S3-015]; the two [S3-012] reds the build message names were not reproduced by this narrower variant (cli.test.ts included, S113) | 3 red, 5 green | RED, as named |
| 14 | repair offers a waive op for FND_EXCLUDED_FROM_FORMAL (repair.ts) | report-corpus [S3-039] x2; roundtrip [S3-033]; (file-wide S114 adds idempotence and [S3-041]) | 3 red, 5 green | RED, as named |
| 15 | marker no longer appended to the replacement waive reason (compat.ts) | check-waivers [S3-024] [S3-026]; [S3-024] | 2 red, 0 green | RED, as named |
| 16 | appliedWaivers left empty (waiver-accounting.ts) | check-waivers [S3-046] | 1 red, 0 green | RED, as named |
| 17 | 're-review' dropped from the stale-hash note (compat.ts) | check-waivers [S3-029] | 1 red, 0 green | RED, as named |

Divergences from the commit message, stated plainly: #3 named tests red as claimed (file-wide rerun S103: 4 red). #13: my narrower variant leaves the two `[S3-012]` tests green, so the build message's `[S3-012]` x2 is not reproduced; `[S3-013]` x2 and `[S3-015]` are red. #15 as the build describes it (marker no longer appended) is red; a different sabotage of the same site survives, see 2c.

### 2b. Extra sabotages for behaviors the commit names no replay for

| # | sabotage | S3 ids red | result |
|---|---|---|---|
| 22 | never-class refusal disabled (mutate.ts waiverClassRefusal) | S3-001 | 2 red, 1 green |
| 23 | ref no longer normalized to refs [ref] (mutate.ts) | S3-005, S3-006 | 3 red, 1 green |
| 24 | hash-less stored waiver treated as qualifying (compat.ts) | S3-018, S3-019 | 2 red, 3 green |
| 25 | stale-hash waivers not listed in ignoredWaivers | S3-028 | 2 red, 0 green |
| 26 | import JSONL schema loses refs/contentHash | S3-014 | 1 red, 5 green |
| 27 | contentHash mismatch no longer refused | S3-008 | 1 red, 0 green |
| 28 | craft.ts skill body offers the reviewed waiver again | S3-043 | 4 red, 2 green |
| 29 | never-class check removed from waiverStanding (never waivers cross) | S3-016, S3-030 | 6 red, 4 green |
| 31 | a crossed waiver that matches no finding is not disclosed (S3-022) | S3-007, S3-022 | 1 red, 0 green |
| 32 | import folds with no options (no policy) | S3-003, S3-005, S3-012, S3-013, S3-015 | 7 red, 14 green |
| 33 | scoped-class waives refused too | S3-001, S3-004, S3-005, S3-007, S3-008, S3-011, S3-012, S3-013, S3-014 | 12 red, 27 green |
| 34 | hash-matching stored waiver treated as stale (nothing qualifies) | S3-007, S3-010, S3-016, S3-018, S3-019, S3-020, S3-021, S3-022, S3-028, S3-030, S3-033, S3-034, S3-035, S3-036, S3-046 | 19 red, 21 green |
| 35 | waiver-inert unwaive op loses its refs scope | S3-007, S3-022, S3-024, S3-025, S3-029, S3-045 | 4 red, 27 green |

### 2c. Survivors (sabotages no test catches)

Each was also run against the whole suite (`vitest run`, 3494 tests) and stayed green there: 3494 passed, 0 failed.

| # | sabotage | targeted tests | whole suite | what it shows |
|---|---|---|---|---|
| 18 | `RESCOPED_REASON_MARKER` set to the empty string (constant kept and exported) | S3-024 S3-026: 2 green | 3494 passed | the provenance marker of S3-026 (R41) may be empty: the test pins only `typeof MARKER === 'string'` and `reason === legacy + MARKER` |
| 19 | `number-spelling-candidate` action in `pipeline/check.ts` says to accept the pair with a reviewed waiver of FND_NUMBER_SPELLING_CANDIDATE | S3-039/040/045 (repair, report-corpus, waive-fold, check tests): 176 green | 3494 passed | a never-class demotion action can advise a waiver; the site is reached by no document and the static regex `NEVER_WAIVE_SPELLINGS` does not match this wording |
| 20 | `inconclusive-group` action says `Waiving FND_NEEDS_REVIEW discharges this once a reviewer has read the group` | 176 green | 3494 passed | same, through the word `Waiving`: the sweeps match `/waive/i`, which does not match `waiving` |
| 21 | `semantic.ts` `variantMessage` tail says `waiving this finding is accepted once you have checked the objects differ` | 176 green | 3494 passed | semantic.ts is in `NEVER_ONLY_SITES` and still passes: the `/waive/i` sweep misses `waiving` (and FND_SIMILAR_SEMANTIC is reached by no document) |
| 30 | the `others` exemption in `accountWaivers` removed (a crossed waiver that matches only a terminology or reachability finding would be disclosed as matching nothing) | 62 green (check-waivers, compat, check, roundtrip, report-corpus, pattern `S3`) | 3494 passed | no test holds the terminology-code branch of `accountWaivers`, see section 7 |
| 36 | `repair.ts` `inconclusive-group`/`solver-unknown` arm offers `{op:'waive', code:'FND_NEEDS_REVIEW', refs}` (type-checks: `tsc --noEmit` exit 0 with the sabotage) | 178 green (adds roundtrip) | 3494 passed | a never-class waive op from a repair arm no document reaches is caught by nothing |

## 3. Snapshot attribution (S3-051) and the gaming set (S3-050)

`git diff 0fca043..HEAD -- src/testing/__snapshots__/` changes 11 files (74 insertions, 39 deletions). The snapshots are untouched between `0fca043` and `ae177c2`: every delta is in the build commit. I parsed every row of both revisions and classified each changed, added and removed row.

| files | rows | delta | attributed to |
|---|---|---|---|
| gaming-a,b,c,d,e,f,g,h,i | 17 `waive-by-code` rows (one per fixture) | 11 were `CLEAN verified=true`, 5 `exit 3` and 1 `exit 1` (fired); now all `refused waive:ERR_WAIVER_REFUSED` | S3-001 S3-003 S3-048 (the 11 deleted KNOWN_ESCAPES rows are the 11 CLEAN ones) |
| same | 16 new `waive-scoped-never` rows, all `refused waive:ERR_WAIVER_REFUSED`; derives-cycle `inapplicable` | added | S3-049, R45 |
| same | 17 new `waive-raw` rows: equal to the fixture's `(baseline)` verdict (signal fires with the baseline's errors and demotions; derives-cycle `inapplicable`), checked field by field | added | S3-016 S3-030 S3-049 (raw never waivers are inert) |
| gaming-f | 18 `waived-blocking-lint` rows gain the `waived-blocking-lint` demotion and go `verified=false` (`(baseline)`, rename-system@first/@second, flip-negated@first/@second, condition-into-response@first/@second, add-decoys, shall-to-should@first/@second, link-culprits, add-negation, add-equivalent@exact/@case, embedding-stub, semantic-off, temporal-bound-1, temporal-off); 5 of them (`(baseline)`, add-decoys, link-culprits, temporal-bound-1, temporal-off) were `verified=true` before | changed | S3-033 S3-035 (G3) |
| gaming-f | `(control)` row removed | removed | R26, S3-035: the control twin can no longer verify once its waiver demotes |
| gaming-moves | `waive-by-code` `registered-escapes-known-gap AC-5-6` to `registered-caught`; `waive-scoped-never` and `waive-raw` added `registered-caught` | changed, 2 added | S3-048 S3-049 |
| report-corpus | `gaming-control/waived-blocking-lint` exit 0 verified=true to exit 3 verified=false with `waived-blocking-lint[WBL-R1,WBL-R2]`; `gaming/waived-blocking-lint` verified=true to false, same demotion, exit 1 unchanged | 2 changed | S3-033 S3-035 S3-051 |

Unexplained rows: 0. Rows that moved toward `verified=true`: 0.

S3-050, clean pairs: across the 9 shards base has 75 `CLEAN` rows and HEAD 63. The 12 removed are the 11 `waive-by-code` pairs (contrary-pair, dangling-target, derives-cycle, glossary-bridged, numeric-conflict, one-trigger-contradiction, overlapping-contrary, registered-contrary, temporal-conflict, term-bridged, waived-blocking-lint) plus the `waived-blocking-lint (control)` row, which is not a move. Clean move pairs added: 0. So the clean (fixture, move) pairs are base minus the 11 `waive-by-code` rows, none added.

## 4. TA3: advice and suggestion sites against the documents that reach them

Reach was measured, not read from the tests: a probe ran `check` (strict, as the report-corpus row runs it) over the two document sets the S3-039/040/045 sweeps read, the 53-row report corpus and the 21 S3 fixture documents (74 documents), and collected every demotion reason with its action and ops, every finding code with message and suggestion, and every `waiver-inert` diagnostic. "Gaming" is the set of demotion reasons and error codes in the 9 gaming shard snapshots (reached, but the prose there is never read by a sweep).

Who says "waive" today: a scan of every string literal in `src/` (non-test, outside `src/testing`) that contains `waiv`: no never-code action, message or suggestion advises a waiver. The literals that mention one are negations (`not waivable`, `Waiving cannot discharge this`, `never waivable`), the `excluded-from-formal` scoped-lint remedy (S3-041) and the `waived-blocking-lint` action. So the build is clean today; this table measures how well the guard would notice a regression.

Engine demotion actions (`src/domain/engine/pipeline/check.ts`) and `repair.ts` arms (`src/domain/advice/repair.ts`; only the `excluded-from-formal` arm, line 219, emits ops):

| site (reason, check.ts action line; repair.ts arm line) | never-class code it speaks for | documents reaching it (sweep set) | gaming shards | static guard | status |
|---|---|---|---|---|---|
| uncovered-requirement (2081; 387) | none | 22 | 141 rows | none needed | reached |
| conditional-conflict-unchecked (2097; 362) | FND_* conditional (text says `not waivable`) | 6 | 14 | regex | reached |
| excluded-from-formal (2124; 187, ops at 219) | scoped lint; FND_EXCLUDED_FROM_FORMAL never | 19 (ops `waive:GTWR_R7_VAGUE` x19, all scoped) | 13 | S3-041 tests | reached |
| quantity-alias-candidate (2141; 253) | FND_QUANTITY_ALIAS_CANDIDATE | 2 | 0 | regex | reached |
| relational-reasoning-not-attempted (2156; 256) | FND_RELATIONAL_UNCHECKED | 3 | 0 | regex | reached |
| open-opposition-candidate (2268; 242) | FND_OPPOSITION_CANDIDATE | 25 | 39 | regex | reached |
| no-decide-tier-comparison (2304; 376) | none | 5 | 110 | none needed | reached |
| waived-blocking-lint (app check.ts 1118; no arm, no ops) | scoped lint | 6 | 19 | S3-033/034/035 | reached |
| numeric-bounds-uncompared (2171; 270) | FND_NUMERIC_UNCOMPARED | 0 | 0 | regex only | **unreached** |
| number-spelling-candidate (2188; 283) | FND_NUMBER_SPELLING_CANDIDATE | 0 | 0 | regex only | **unreached** |
| opposite-polarity-near-duplicate (2206; 248) | FND_SIMILAR_SEMANTIC | 0 | 0 | regex + semantic.ts literal sweep | **unreached** |
| inconclusive-group (2371; 306) | FND_NEEDS_REVIEW | 0 | 0 | regex only | **unreached** |
| solver-unknown (2424, 2436; 307) | FND_NEEDS_REVIEW | 0 | 0 | regex only | **unreached** |
| solver-budget-exhausted (2398; 298) | disclosure | 0 | 0 | regex only | **unreached** |
| contrary-glossary-alias (2250; 350) | glossary contrary | 0 | 0 | regex only | **unreached** |
| run-weakened (2314, 2331; 321) | run disclosure | 0 (sweeps run the fixture embedder) | 17 | regex only | prose unread |
| semantic-tier-skipped (2343; 336) | run disclosure | 0 | 17 | regex only | prose unread |
| reachability tier demotions (`src/domain/reachability/*`) | FND_REACHABILITY_* (all never) | 0 | 4 | none | prose unread |
| `unappliedNote` (check.ts 714-735, appended to the open-opposition action) | FND_OPPOSITION_CANDIDATE | 0 | 0 | regex | **unreached, and dead at the product boundary**: `toEngineDoc` no longer forwards a never-code waiver, so `unappliedWaivers()` is empty for every document the CLI can build |

Of the 7 demotion reasons `report-corpus.test.ts` maps to a never code (`DEMOTION_CODE`), 3 are reached by a document (open-opposition-candidate, quantity-alias-candidate, relational-reasoning-not-attempted) and 4 are not (opposite-polarity-near-duplicate, numeric-bounds-uncompared, number-spelling-candidate, inconclusive-group).

Finding messages and suggestions: of the 31 never-class finding codes (verdict 10, disclosure 11, triage 6, hygiene 4), 15 are emitted by some sweep document and 16 are not: FND_CERTIFICATE_DISAGREES, FND_CERTIFIED, FND_CERTIFY_FAILED, FND_DUPLICATE_CLUSTER, FND_INCOMPLETE, FND_MISSING_PRECONDITION, FND_MISSING_TRIGGER, FND_NEEDS_REVIEW, FND_NUMBER_SPELLING_CANDIDATE, FND_NUMERIC_UNCOMPARED, FND_RANGE_VIOLATION, FND_REACHABILITY_UNDER_HYPOTHESES, FND_REACHABILITY_UNKNOWN, FND_REACHABILITY_VACUOUS_INITIAL (only as a gaming error), FND_SIMILAR_SEMANTIC, FND_SUBSUMPTION. The catalog descriptions of all never codes are swept (S3-040 waive-fold), so the catalog row is guarded; the runtime message and suggestion are not.

Static guards cover five engine files by a `/waive/i` literal sweep (`semantic.ts`, `numeric-contradiction.ts`, `number-spelling.ts`, `quantity-alias.ts`, `coverage.ts`) and `pipeline/check.ts` by a regex of the spellings base shipped. Planted rewordings 19, 20, 21 and 36 (section 2c) pass every guard and the whole suite. **TA3 is not discharged:** 4 of 7 never-class demotion actions, 16 of 31 never-class finding messages and the repair arms for 6 demotion reasons (inconclusive-group, solver-unknown, solver-budget-exhausted, run-weakened, semantic-tier-skipped, contrary-glossary-alias) have no document reaching them, and the static guards are bypassed by a one-word change.

## 5. The AC-5-6 reproducer, end to end on `dist/cli.mjs`

Base build: a copy at `0fca043` (`pnpm install`, `tsdown` via `prepare`). HEAD build: a copy at `7afb20e`. Real embedder (the cached model; no stub), so `verified` means what it says. Documents: `repro/b.json` is `init` plus the four fixture adds (CAB-R1 "heat the cabin", CAB-R2 "cool the cabin" under one trigger; TNK-R1 "fill the tank", TNK-R2 "drain the tank" under another). Ops files are in the job scratch folder.

**R43a, the code-only waiver** (`{"op":"waive","code":"FND_OPPOSITION_CANDIDATE","reason":"heating and cooling are separate climate modes"}`):

| step | base `0fca043` | HEAD `7afb20e` |
|---|---|---|
| `apply --ops waive.jsonl` on the CAB+TNK document | exit 0, `results[0] {ok:true}`, waiver stored `{code, reason}` | exit 1, `written:false`, `results[0] {ok:false, code:"ERR_WAIVER_REFUSED"}`; message "`FND_OPPOSITION_CANDIDATE` is a triage-class finding, and a triage finding is never waivable, in any scope"; the file is byte-identical (sha256 `9f851e5e...` before and after) |
| `check` of the document the base `apply` wrote (stored code-only waiver) | exit 0 (`--strict` exit 3), `verified:false`, `waived:0`, two `open-opposition-candidate` demotions (CAB pair and TNK pair) | exit 0 (`--strict` exit 3), `verified:false`, `waived:0`, the same two demotions, FND_OPPOSITION_CANDIDATE x2 still in findings, one info `waiver-inert` diagnostic naming the triage class with ops `[{"op":"unwaive","code":"FND_OPPOSITION_CANDIDATE"}]`, `ignoredWaivers: []`, `appliedWaivers: []` |

So the write half and the check half hold on HEAD: refused, byte-identical, stored legacy waiver inert and disclosed, both pairs demote. **The base half of R43 is false for the code-only waiver.** On base the stored code-only waiver is not applied (`PAIR_BOUND_CODES`, `waived:0`), the two demotions and `verified:false` are the same with and without it. Confirmed a second way, in process with `fixtureEmbedder` on base (`src/testing/_repro.test.ts` in the base copy): `verified:false`, exit 3, two `open-opposition-candidate`, with and without the waiver. The `verified:true` of AC-5-6's "Today" line holds for the exact-set waiver, next row.

**The scoped waiver, where base does return `verified:true`** (CAB pair alone, `{"op":"waive","code":"FND_OPPOSITION_CANDIDATE","refs":[CAB-R1, CAB-R2]}`):

| step | base | HEAD |
|---|---|---|
| `apply` of the refs waive | exit 0, hash computed and stored | exit 1, `ERR_WAIVER_REFUSED` (never-class, although properly scoped), file byte-identical (`cmp`) |
| `check` of the base-written document | `verified:true`, exit 0, `waived:1`, no demotion | `verified:false`, `waived:0`, `open-opposition-candidate[CAB-R1,CAB-R2]`, FND_OPPOSITION_CANDIDATE back, one `waiver-inert` diagnostic |
| same in process with the fixture embedder, CAB+TNK with the CAB waiver | `verified:false`, `waived:1`, one demotion (the TNK pair) | n/a |

Also measured in process on base with the fixture embedder: CAB alone with no waiver or a code-only waiver, `verified:false`; CAB alone with the refs+hash waiver, `verified:true`.

## 6. Reproducer tests in the suite

`check-waivers.test.ts` holds `[S3-038]` write half and check half; sabotage 2 turns the write half red. The base half of S3-038 is not asserted by any test (it cannot be: see section 5), so R43's "asserted on base" is unimplemented and, as measured, unsatisfiable for the code-only waiver.

## 7. Candidate gap: a stored waiver of a terminology code (FND_TERM_INCONSISTENT, FND_ACRONYM_UNDEFINED)

The build reports that such a waiver is neither applied nor reported. Measured.

Why it is special: `src/domain/waivability.ts` classes both terminology codes `wording`, so `waivabilityOf` says `scoped` and the write path accepts a refs + hash waiver. Both findings come from `runTerminology` at the app boundary (`check.ts` ~1046), after `runCheck`, so the engine's waivers never see them. `accountWaivers(document, preWaiver, findings, others)` passes the terminology findings as `others`: a crossed waiver that matches one is "not disclosed as matching nothing because it does match a finding", yet nothing applies it. Both findings are `info` and push no demotion, so `verified` and the exit code cannot move; the effect is a waiver that does nothing and says nothing.

Probe (`repro/term.sh`, output `repro/term.out`): a two-requirement document, ACR-R1 names an unexpanded acronym "ECU" (fires `GTWR_R37_ACRONYM` and `FND_ACRONYM_UNDEFINED` on ACR-R1). Legacy waivers written by the base build, then `check` on base and HEAD, real embedder:

| stored waiver of FND_ACRONYM_UNDEFINED | qualifies on HEAD? | base: waived, finding, diagnostics | HEAD: waived, finding, diagnostics, applied, ignored |
|---|---|---|---|
| refs [ACR-R1] + matching hash (**qualifying**) | yes | 0, finding stays, none | **0, finding stays, `[]`, `appliedWaivers []`, `ignoredWaivers 0`: neither applied nor reported** |
| refs [ACR-R2] + matching hash (matches no finding) | yes | 0, stays, none | 0, stays, one `waiver-inert` ("matches no finding") |
| code-only | no | 0, stays, none | 0, stays, one `waiver-inert` ("names no requirement") |
| one `ref` (requirementId), no hash | no | 0, stays, none | 0, stays, one `waiver-inert` |
| requirementIds, no hash (hand edit) | no | 0, stays, none | 0, stays, one `waiver-inert` |
| refs [ACR-R1] + hash that no longer matches (stale) | stale | 0, stays, none | 0, stays, none, `ignoredWaivers` lists it with stored and current hash |
| control: `GTWR_R37_ACRONYM` refs [ACR-R1] + hash | yes | waived 1, finding gone | waived 1, finding gone, `appliedWaivers` lists it |

`--strict` exits 3 on both builds in every row run with it (the stale row ran without it, exit 0): the document also carries untriaged demotions unrelated to the waiver. Base behaves the same for the qualifying row (a waiver of a terminology code was never applied on base, and base reported nothing for any row); so this is not a regression. S3 made it visible: every non-qualifying shape is now disclosed, and the one shape the write path accepts and `toEngineDoc` forwards is the one shape that stays silent. The same code path serves FND_TERM_INCONSISTENT (`others` is `terminology.findings`); I did not build a document that fires that code, so its row is by reading, not by run.

Which behaviors it touches: S3-004 (accepted at write: holds), S3-021 ("qualifies and suppresses exactly its finding": fails for the two terminology codes), S3-022 (the disclosure branch for `others` has no test: survivor 30), S3-046 ("every waiver the engine applied is listed": true, because none was applied). No test waives a terminology code (`grep` over `*.test.ts`: none). The twin test S3-030 proves forwarded implies fold-accepted; it does not say forwarded implies applied, which is what this needs.

Weighing it as a gap: consequence is low (info finding, no demotion, finding stays visible: it cannot certify anything) but it is the exact shape the story is about, an accepted reviewed waiver that silently does nothing. Options for a person: refuse terminology waivers at write (class them `never`, or add them to a short "scoped but not engine-applied" list), apply them in `check.ts` the way `preWaiverOther` does for the engine, or disclose them as `waiver-inert` with cause `not-applied`. Not ruled here.

## 8. Evidence level per behavior against its floor (behaviors.json)

Levels: 1 executable example, 2 generated-input property, 3 type or domain rule, 4 boundary contract. The repo has no property library (no `fast-check`); a level-2 entry here is an exhaustive sweep of the closed published catalog (`allCodes()`, `FINDING_CLASS`) across six scope shapes or across all 21 fixture documents, each with an anti-vacuity count (`NEVER.length > 10`, `measured >= 4`, `reached >= SCOPED.length*2`). Columns: tests = tests whose name carries the id / files; sabotage = sabotages (section 2) that turned a test of this id red.

| id | floor | achieved | tests / files | sabotage | verdict | basis |
|---|---|---|---|---|---|---|
| S3-001 | 2 | 2 | 18 / 8 | S22,S33 | ok | sweep: every never-class code x 6 scope shapes (fold refuses, nothing written) + catalog pins |
| S3-002 | 1 | 1 | 5 / 2 | S1 | ok | 4 fold streams + 4 CLI applies, byte-identical file |
| S3-003 | 2 | 2 | 4 / 3 | S1,S32 | ok | sweep: every published code, code-only; CLI; import of 2 recorded hex-bonk streams |
| S3-004 | 1 | 2 | 1 / 1 | S33 | ok | sweep: every scoped-class code with refs + matching hash (green on base, regression) |
| S3-005 | 2 | 2 | 5 / 3 | S23,S32,S33 | ok | sweep: every scoped code, refs without hash and single ref; CLI; import examples |
| S3-006 | 2 | 2 | 2 / 2 | S1,S23 | ok | sweep: every finding code x 6 scope shapes, no requirementId / hashless stored |
| S3-007 | 1 | 1 | 2 / 2 | S31,S33,S34,S35 | ok | fold accept example + check example (lint-wrong-set) |
| S3-008 | 1 | 1 | 1 / 1 | S27,S33 | ok | one example (lint-hash-mismatch) ERR_USAGE, nothing written |
| S3-009 | 2 | 2 | 4 / 3 | S7 | ok | sweep: every published code has its own class row; 6 unclassified names refused; compat twin |
| S3-010 | 2 | 2 | 3 / 3 | S7,S34 | ok | sweep: case/whitespace variants of every never code refused at write, inert at check |
| S3-011 | 1 | 1 | 4 / 2 | S1,S33 | ok | 3 fold message tests + CLI |
| S3-012 | 2 | 1 | 8 / 2 | S32,S33 | below the minimum | examples: v4-waivers I1/I3/I5, 4-probe differential, 2 recorded hex-bonk streams; no sweep of code x scope through import |
| S3-013 | 1 | 1 | 3 / 2 | S13,S32,S33 | ok | examples: I4, unresolvable ref, CLI |
| S3-014 | 1 | 1 | 1 / 1 | S26,S33 | ok | one example (scoped-record.txt) |
| S3-015 | 1 | 1 | 1 / 1 | S13,S32 | ok | one example (each refusal named with line, code, scope, replacement) |
| S3-016 | 4 | 4 | 18 / 3 | S8,S29,S34 | ok | compat twin over every never code x 6 stored shapes (toEngineDoc) + check twin on raw channel + 14 check.test demotion tests |
| S3-017 | 2 | 2 | 3 / 2 | - | ok | sweep: code-only stored waiver of every code + unknown; fixtures |
| S3-018 | 2 | 2 | 3 / 2 | S24,S34 | ok | sweep: every scoped code, requirementId / requirementIds without hash |
| S3-019 | 1 | 2 | 3 / 2 | S24,S34 | ok | sweep: as S3-018 |
| S3-020 | 1 | 1 | 3 / 2 | S34 | ok | sweep over scoped codes at compat + hand-ref-with-hash check |
| S3-021 | 1 | 1 | 3 / 2 | S34 | ok | sweep over scoped codes at compat + 4 stored fixtures suppress exactly their finding (terminology codes NOT covered, see gap G1) |
| S3-022 | 1 | 1 | 1 / 1 | S31,S34,S35 | ok | lint-wrong-set example; the terminology branch (others) has no test, see gap G1 |
| S3-023 | 2 | 2 | 3 / 2 | - | ok | metamorphic over all 21 fixture documents: deleting any inert waiver changes nothing |
| S3-024 | 1 | 1 | 2 / 1 | S15,S35 | ok | examples over 4 fixture shapes |
| S3-025 | 1 | 1 | 1 / 1 | S8,S35 | ok | example |
| S3-026 | 1 | 1 | 1 / 1 | S15 | ok | example (marker may be the empty string, survivor S18) |
| S3-027 | 2 | 2 | 1 / 1 | - | ok | sweep: every op on every waiver-inert and ignoredWaivers entry over all fixture documents decodes and folds |
| S3-028 | 1 | 1 | 2 / 1 | S25,S34 | ok | example + filter example |
| S3-029 | 1 | 1 | 1 / 1 | S17,S35 | ok | example |
| S3-030 | 4 | 4 | 7 / 2 | S7,S29,S34 | ok | differential twin: every forwarded stored waiver is accepted by the fold as the same op, every code x 6 shapes; converse only sampled |
| S3-031 | 1 | 1 | 1 / 1 | - | ok | engine tier unchanged: one diff/regression test |
| S3-032 | 2 | 2 | 1 / 1 | - | ok | sweep: every waiver shape over the ORD pair, isWaivedBlocking vs isWaived |
| S3-033 | 1 | 1 | 4 / 3 | S5,S14,S34 | ok | examples + roundtrip + DEMOTION_CLASS pin |
| S3-034 | 1 | 1 | 2 / 2 | S5,S34 | ok | example + CLI |
| S3-035 | 1 | 1 | 2 / 2 | S5,S34 | ok | example + roundtrip fixed point |
| S3-036 | 2 | 2 | 3 / 1 | S5,S34 | ok | differential over all 21 fixture documents (ids = bare minus waived) + 3 inert additions |
| S3-037 | 1 | 1 | 2 / 1 | - | ok | 2 examples (stored reproducer inert, both pairs demote) |
| S3-038 | 1 | 1 | 2 / 1 | S2 | ok | 2 examples (write half, check half); base half of R43 false, see section 6 |
| S3-039 | 2 | 2 | 45 / 3 | S10,S14 | ok | sweep of every repair op over 74 documents + 6 pair reasons unit-tested; 7 of 13 action arms and 16 of 31 never codes unreached (TA3) |
| S3-040 | 1 | 1 | 20 / 4 | S9,S10,S11,S14 | ok | runtime sweep over 74 documents + static literal sweeps; bypassed by S19, S20, S21 (TA3) |
| S3-041 | 1 | 1 | 5 / 1 | - | ok | 5 examples on base.json |
| S3-042 | 1 | 1 | 3 / 1 | S4 | ok | frozen corpus verbatim + absence |
| S3-043 | 1 | 1 | 6 / 1 | S28 | ok | 6 skill-body tests |
| S3-044 | 4 | 4 | 6 / 1 | S12 | ok | flag + both halves + surfaces; write half per never class, check half for one code |
| S3-045 | 1 | 1 | 125 / 3 | S8,S10,S14,S35 | ok | static sweep of every src file + runtime sweep over 74 documents |
| S3-046 | 1 | 1 | 3 / 2 | S4,S16,S34 | ok | 3 examples (appliedWaivers, scope sentence) |
| S3-047 | 1 | 1 | 2 / 2 | S3 | ok | registry test + scoped-waive test |
| S3-048 | 1 | 1 | 19 / 10 | S3,S6 | ok | 9 shards x exactness + registry |
| S3-049 | 1 | 1 | 11 / 10 | - | ok | 9 shards + harness tests |
| S3-050 | 1 | 1 | 10 / 10 | S3 | ok | 9 shards + registry; set equality confirmed in section 4 |
| S3-051 | 1 | 1 | 0 / 0 | - | ok | file-snapshot tests (11 files) + attribution in section 4 |
| S3-052 | 1 | 0 | 0 / 0 | - | below the minimum | no executable test; commit 7afb20e inspected (section 9) |
| S3-053 | 1 | 0 | 0 / 0 | - | below the minimum | no executable test; version files inspected (section 9) |

Below the minimum: **S3-012** (floor 2, achieved 1: only examples reach import; no sweep of code x scope through the JSONL path), **S3-052** and **S3-053** (floor 1, achieved 0: process behaviors with no executable test; inspected instead, section 9). Floor-4 behaviors (S3-016, S3-030, S3-044) reach 4 through the write/check twin (`compat.test.ts`, `foldOps` as oracle) and the flag-against-both-enforcement-points test. No behavior has a class or floor missing from `behaviors.json`.

No sabotage replayed for S3-017, S3-023, S3-027, S3-031, S3-032, S3-037, S3-041, S3-049, S3-051, S3-052, S3-053 (tests exist and pass; replay would be new work).

## 9. Release behaviors by inspection (S3-052, S3-053)

- S3-052: the build commit subject is `feat(waivers)!: ...`, the body has one `BREAKING CHANGE:` footer line, and the last paragraphs are `Behaviors: S3-001, ..., S3-053` then `Co-Authored-By`. There is no test or gate for this in the suite.
- S3-053: `git diff --name-only 0fca043..HEAD` outside `src/` and `.erpaval/` is `AGENTS.md`, `README.md`, `package.json`. The `package.json` diff is the `description` line only (89 to 90 stable codes); `src/app/runtime/version.ts` is untouched; no `1.2.1` or release-please marker line moved in README or AGENTS.md.

## 10. Gap list (none marked ruled; the coordinator and a person decide)

| id | gap | reason |
|---|---|---|
| G1 | A qualifying stored waiver of a terminology code (FND_TERM_INCONSISTENT, FND_ACRONYM_UNDEFINED) is accepted at write, forwarded by `toEngineDoc`, matches a terminology finding, and is neither applied nor reported (section 7). Behaviors S3-021 S3-022 S3-046 | contract gap, measured on base and HEAD; survivor 30; not a regression (base never applied it); consequence low (info, no demotion) |
| G2 | TA3 not discharged: 4 of 7 never-class demotion actions, 16 of 31 never-class finding messages, 6 repair arms and the `unappliedNote` site are reached by no document; the guards for them are a `/waive/i` or spelling regex that survives `Waiving`, `accept ... with a waiver` and a planted waive op (survivors 19, 20, 21, 36). Behaviors S3-039 S3-040 S3-045 | below the minimum of reach for the TA3 assumption; the fix is documents or unit tests that reach the sites plus a guard on `/waiv/i` |
| G3 | S3-012 import equals apply has example evidence only | below the minimum (floor 2, achieved 1) |
| G4 | S3-052, S3-053 have no executable evidence | below the minimum (floor 1, achieved 0); inspected here, process behaviors |
| G5 | S3-026 provenance marker may be empty (survivor 18) | test strength under floor; the marker is the only trace that a waiver was rescoped |
| G6 | R43's base assertion (code-only opposition waiver gives `verified:true` on base) is false; `verified:true` on base needs the exact-set waiver (section 5) | record correction for the ruling and the S3-038 title, not a defect of the build |

## 11. Reproduce

Base and HEAD copies: `git clone --no-hardlinks <run clone> base && git -C base checkout 0fca043`, same for `7afb20e`, then `pnpm install --offline --frozen-lockfile` (its `prepare` builds `dist/cli.mjs`). Sabotage harness `sab.py N...` (job 1007 scratch), one replacement per sabotage, numbers as in section 2. Reproducer: `apply`/`check` as in section 5 with `env -u SYMSPEC_EMBED_STUB` for the real embedder. Terminology probe: `repro/term.sh`.
