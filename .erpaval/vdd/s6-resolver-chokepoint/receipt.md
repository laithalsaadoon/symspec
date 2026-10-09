# Receipt: symspec spec 007 Phase 3 slice S6 (resolver chokepoint, implicit vocabulary, invariants), VDD run 4

Written by the clerk (job 2257, board item clerk, swarm vdd-4-s6-resolver) from the records in this branch and the run's role records, for the coordinator (job 2172). The clerk judges nothing: every verdict below is a role's, with the record named. The numbers the clerk measured itself are marked "clerk run" and carry the command. No approval was written and no approve command was run.

| | |
|---|---|
| Branch | `vdd/s6-resolver-chokepoint` (local only, never pushed) |
| Run clone | `/home/lalsaado/bonk-fs/.chora/work/job-2172/repo` |
| Base (run 4) | `2b0364406121fc441a4b30b1da36d771b9eecf97` (2b03644, head of draft PR #20) |
| Head read | `7b1fc2b88250dc87c3c95e3e05ab7a35a4111579` (7b1fc2b, `test(vocabulary): [S6-004] a refused V2 alias leaves no contrary pair in its class`); this receipt is the commit on top of it |
| Product tree | equal to base: `git diff --name-only 2b03644..7b1fc2b` is `src/domain/vocabulary/s6-properties.test.ts` only |
| Receipted change | `9605b2c884692d82a281724c3135c6fe5c467e3b..2b03644` (13 commits, 32 files, +7213/-233), unchanged by this run |
| Run contract | hash `971c904835f2`, tier 3, entry legacy, 12 criteria |
| Approval state | The person answered the contract question and the round-1 question during the run (D-4-1, D-4-2). Final approval of the contract hash and the residuals is pending; no approvals file exists in the tree. |

## 1. For the person: is this the right thing?

### 1.1 What the run proves about S6

S6 is the pure part of the controlled vocabulary: it names every slot of a requirement as a system, state, event, action, quantity or feature, gives equal engine atoms one symbol, and checks a vocabulary before it can change what the engine reads. Its code was already written (PR #20). This run wrote tests for it and measured those tests. It changed no product code.

- **The four roadmap properties hold on 73 real documents and a constructed fixture.** The 73 documents are 53 report documents and 20 generated ladder documents, 204 requirements and 375 implicit symbols; the fixture is 14 requirements and 26 symbols with two spellings, article variants and the MW/mw unit case. (1) Two slots with one engine atom share one symbol, or the symbols are coarser. (2) Declaring the rendered implicit vocabulary rebuilds the same index and bindings. (3) Every minted id is a fixed point of the scope and quantity-label normalizers, and the vocabulary does not depend on requirement order. (4) The alias and merge checks keep every contrary action pair. Records: contract role job 2197, absence job 2206, evidence job 2211, `behaviors.json`.
- **Each of the four planned sabotages turns its test red.** Keying actions with `normalize` (SAB-1), keying systems with `normalize` (SAB-2), disabling every V-OPP return (SAB-3) and disabling every V-NUM return (SAB-4) each fail the test aimed at them, in a throwaway clone, and the clone restores clean. Records: jobs 2197 and 2217, section 4.
- **The attack found one real gap and it is closed.** Deleting the line that removes a refused alias (mutant M24, `invariants.ts:224`) passed every test and broke property (4). A test for it was added (7b1fc2b) and the replay kills M24 in both passes; the other 31 kills still hold. Records: jobs 2217, 2245, 2250.
- **The repo's own check passes at the head.** Clerk run on a fresh clone of 7b1fc2b: `pnpm check` exit 0, 119 files, 3890 tests, KNOWN_ESCAPES 51, no snapshot file touched.
- **Review found no false certificate.** Two blind reviewers of a different model family read all 26,700 diff lines across three items and each caught both planted defects. They raised two real issues on the clean item, neither tied to a criterion (section 3: RV-1, RV-2).

### 1.2 What it does not prove

- **S6 has no callers.** AC-4-1, AC-4-2 and AC-4-6 are proved only as far as the pure functions go. The rest waits on later slices and is a residual, not a red: S5 schema and per-kind payloads and the S7 declaration through the fold and `symspec vocab`; the S8 atoms scoped through the projection and the spec's own Door Controller sabotage; the S7 write-time refusal of a `vocab alias`.
- **The engine and z3 refactors in the receipted range are not re-proved.** They rest on the whole suite and unchanged snapshot files (assumption A1, owner Laith). No z3 verdict is rerun by the new tests.
- **The attack is a fixed set, not an exhaustive mutation run.** 45 generated mutants over 10 files; 41 valid; 32 killed at the head and 9 survive. Three survivors are argued equivalent by the attacker; six are residual test gaps (section 3).
- **Three criteria rest on one example each.** S6-005 and S6-006 are one example each backed by a sabotage kill, and S6-010 has no generated property (level 1 against the evidence role's floor of 2). S6-010 is an accepted residual; S6-005 and S6-006 are recorded as gap candidates in the matrix.
- **Two defects the review found are not fixed.** RV-1 (a real system named `vocabulary probe` gets two false V-KIND reports) demotes and never certifies. RV-2 (a second loaded copy of the solver-service module cannot release its mailbox wait) is a lifecycle leak found by a simulated repro, not seen in the suite.
- **The plan text and the base disagree in four places** (follow-ups B1 to B3 and B9 in section 3). The tests assert the base behavior the person ruled on.

### 1.3 End state

Done with accepted risk, pending the person's approval of contract `971c904835f2` and the residuals in section 3. Every criterion is green at the head (section 4.2). No criterion is open.

### 1.4 What is asked

1. Approve, reject or redirect this receipt and its contract hash `971c904835f2` with the residual list in section 3. A redirect that changes a ruling (RQ1 to RQ9) changes the contract hash and sends the change back to the contract role.
2. Separately, decide whether to carry the branch to PR #20. That is outside this run.

### 1.5 PR #20

PR #20 on GitHub (`laithalsaadoon/symspec`, branch `ask/10-s6-onto-main`) is untouched. Nothing was pushed, no PR was opened or changed, and the source clone `push10` and `/mnt/uv-cache/workplace/symspec` were not touched. To bring the branch into your own checkout:

```
git fetch /home/lalsaado/bonk-fs/.chora/work/job-2172/repo vdd/s6-resolver-chokepoint:vdd/s6-resolver-chokepoint
```

## 2. Decisions, verbatim from `records/decisions.json`

- **D-4-1.** kind: contract. By: person (Laith) via ask_human, job 2172, 2026-10-09. Question: "run contract with RQ1-RQ9". Answer: "Approve all as recommended". Effect: "RQ1 a tier 3 with a third reading (reader-b) before the contract, no threat model; RQ2 a records committed under .erpaval/vdd/s6-resolver-chokepoint/; RQ3 a; RQ4 b; RQ5 a; RQ6 a; RQ7 a; RQ8 a; RQ9 b".
- **D-4-2.** kind: decision. By: person (Laith) via ask_human, job 2172, 2026-10-09. Question: "round 1 reds (M24 on S6-004) and residuals". Answer: "Fix M24 as recommended, accept the rest". Effect: "contract-r1 adds the M24 fixture (test only) and attack-r1 replays it; S6-001's existing filter is recorded as 16 passed where the contract text says 15 (draft off-by-one; the contract text is not edited); residuals below accepted".

The contract text's "15 passed" for the existing `resolve.test.ts -t "implicit vocabulary"` filter (S6-001) is recorded as 16 under D-4-2. The filter selects 16 tests (7 in "the implicit vocabulary over the corpus", 9 in "the implicit vocabulary on multi-spelling fixtures"; absence job 2206). `contract.json` in this folder is a byte copy of the run contract and is not edited.

## 3. Residuals, assumptions, follow-ups

### Residuals (accepted in D-4-2; owner Laith for all test and defect items)

| item | class | owner | revisit |
|---|---|---|---|
| RV-1 a real system named `vocabulary probe` collides with the validator's synthetic probe scope (`projection.ts:100`) and gets 2 false V-KIND reports; demotes, never certifies | false refusal | Laith | S7/S8 |
| RV-2 solver-service `letGo` cannot release a second loaded copy of the module (process-global `Atomics.waitAsync` filter, per-copy registry, `solver-service.ts:151`); simulated repro, not seen in the suite | lifecycle | Laith | S7/S8 or the next solver-service change |
| M43 no test catches a truncated waiver hash compare in `waiverBinding` (`content-hash.ts`); the L1 canary planted the same class | false certificate (test gap) | Laith | S7/S8 |
| M32 V-NUM performer membership for an action alias sharing a declared quantity label is untested | test gap | Laith | S7/S8 |
| M30 contrary-adding scope merge path (V-OPP versus V-READ attribution) is untested | test gap | Laith | S7/S8 |
| M04 64-character id slug boundary is untested | test gap | Laith | S7/S8 |
| M09 numberType for mixed int and real bounds is untested (S5 payloads) | test gap | Laith | S7/S8 |
| M15 resolver suggestion count is untested | test gap | Laith | S7/S8 |
| S6-010 projection evidence is example-only (level 1 against the evidence role's floor 2) | evidence gap | Laith | S8 |
| AC-4-1: S5 schema and per-kind payloads; S7 declaration through the fold and `symspec vocab` | scope (later slices) | S5/S7 | those slices |
| AC-4-2: S8 atoms scoped through the projection at `compat.toEngineDoc` and the spec's Door Controller sabotage | scope (later slices) | S8 | S8 |
| AC-4-6: S7 `vocab alias` refusing at write time | scope (later slices) | S7 | S7 |

The matrix also named S6-005 and S6-006 as gap candidates (one example each plus a sabotage kill); they are not in the decision's residual list. They are stated here so the person can add them.

### Assumptions (owner)

- A1 the engine refactors in the receipted range preserve behavior (unchanged snapshots, G0 vitest), owner Laith.
- A2 S8 feeds the engine through `projectedDocument` text alone, owner S8.
- A3 the test stand-in `declare` matches S7's fold for vocab ops, owner S7.

### Follow-ups

- B1/RQ3: plan 4.2(b) says an alias can only add findings; base refuses a contrary-adding merge (V-OPP). Align the plan text (S8/S17).
- B2/RQ4: plan F4 and 4.3 V-OPP text say every phrase shares the canonical's opposition; base admits a differing opposition with no contrary counterpart. Align the text; the S7 fold re-validates.
- B3: plan P3 names `quantityKey(id)`; the label key is meant.
- B9: a declared quantity's unit against its bounds (MW versus mw) is unchecked (S5/S7).
- Reading B N2: V-OPP also refuses a merge that adds a contrary pair (boundary sentence).
- Reading B N3: P3 under a glossary row whose canonical is an id (boundary).
- `s6-properties.test.ts` title "X9 ... 19 atoms on every row" asserts 19 in total and at least one per row: rename.
- `outcome.test.ts` peak RSS varies 3.2 to 5.2 GB on this shared host (existing test; 4.07 GB in 2b03644's message).
- The plan names `mintSymbolId`; the code exports `mintSymbolIds`.

### Coordinator notes (recorded as received)

- A coordinator `git push` to a local bare repo fired the clone's lefthook pre-push (`pnpm check`) for about 2 minutes beside the attacker; killed, the clone was clean, no commit affected.
- Job 2222's goal had a garbled environment line naming a GitHub clone; the auditor checks its trace.

## 4. Machine verdicts: was it built right?

### 4.1 Story, contract and tier

The story is `vdd_runs` id 4, verbatim in `readings.md` section 1. Run contract hash `971c904835f2`: the first 12 hex of SHA-256 over the contract's canonical JSON (keys sorted, separators `,` and `:`, UTF-8). Recomputed by the clerk with:

```
python3 -c "import json,hashlib;d=json.load(open('contract.json'));print(hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')).hexdigest()[:12])"
```

run in this folder, which printed `971c904835f2` (clerk run; `ensure_ascii=True` gives a different digest because the contract holds non-ASCII text, so the stated form is the one that matches). Tier 3 by RQ1 (a): the receipted range edits engine core and the z3 adapter, a third reading (reader-b) ran before the contract role, and no threat model was written because intake found no trust boundary.

### 4.2 Criteria, verdicts and the record that proves each

Verdicts are the roles' (`records/exits.json`). The contract role's tests are in `s6-properties.test.ts` (31 tests at 7b1fc2b); test names and `-t` counts are in `behaviors.json`.

| id | line | `-t` count (own file) | verdict | proving exit record |
|---|---|---|---|---|
| S6-001 | P1 | 3 (+ existing `implicit vocabulary` 16) | green | contract (job 2197, base) and absence (job 2206), evidence job 2211 |
| S6-002 | P2 | 3 (+ existing `(2) declaring` 1) | green | contract, absence |
| S6-003 | P3 | 5 (+ existing 5) | green | contract, absence |
| S6-004 | P4 | 6 (was 5 at 2ce1b05; + existing 6) | green; attack round 1 was red on M24 | contract and absence green, attack red (job 2217, M24), contract-r1 green (job 2245, 7b1fc2b), attack-r1 green (job 2250) |
| S6-005 | SAB-1 | 1 | green | attack (job 2217) and attack-r1 (job 2250); contract sabotage run job 2197 |
| S6-006 | SAB-2 | 1 | green | attack, attack-r1; job 2197 |
| S6-007 | SAB-3 | 1 | green | attack, attack-r1; job 2197 |
| S6-008 | SAB-4 | 2 | green | attack, attack-r1; job 2197 |
| S6-009 | AC-4-1 (S6 part) | 9 | green | contract, absence |
| S6-010 | AC-4-2 (S6 part) | 3 | green | contract, absence |
| S6-011 | AC-4-6 (S6 part) | 3 (+ existing `heat` 2) | green | contract, absence |
| S6-012 | G0 | n/a | green | evidence (job 2211, 2ce1b05), contract-r1 (job 2245, 7b1fc2b), clerk run (below) |

The clerk found no record that contradicts a criterion's verdict.

### 4.3 G0 legs at base and head

| leg | base 2b03644 | head 7b1fc2b (clerk run) |
|---|---|---|
| `biome ci .` | exit 0, 259 files, No fixes applied | exit 0, 260 files, No fixes applied |
| `tsc --noEmit` | exit 0 | exit 0 |
| `check:agents` | exit 0 | exit 0 |
| `gate:reachability` | exit 0, FEASIBLE, 836 ms of 5000 | exit 0, FEASIBLE, 658 ms of 5000 |
| `build` | exit 0 | exit 0 |
| `vitest run` | exit 0, 3859 passed, 118 files | exit 0, 3890 passed, 119 files |
| `knip` | exit 0, no findings | exit 0, no findings |
| whole `pnpm check` | exit 0, 2:47, peak RSS 5.3 GB | exit 0, 2:48.14, peak RSS 3,224,636 KB |

Clerk run command: in a fresh clone of the run clone checked out at 7b1fc2b (`/home/lalsaado/bonk-fs/.chora/work/job-2257/clone`), `pnpm install --offline --frozen-lockfile`, then `/usr/bin/time -v pnpm check` with node 24 on PATH. Log: `/home/lalsaado/bonk-fs/.chora/work/job-2257/check.log`. `git status --short` was empty afterwards.

- KNOWN_ESCAPES: 51 (clerk run: a `tsx` import of `src/testing/gaming.ts` printed `KNOWN_ESCAPES 51`; base 51 per the contract; job 2211 51).
- Snapshots unchanged: `git diff --name-only 9605b2c..2b03644 | grep -ci snap` printed 0, and no snapshot path appears in `git diff --name-only 2b03644..7b1fc2b` (clerk run).
- `biome ci` stays green: the 260 files include `s6-properties.test.ts`; `biome.json` `files.includes` is `src/**/*.ts`, `scripts/**/*.ts`, `*.ts`, `*.json`, `*.jsonc`, so JSON under `.erpaval/` is outside its scope, as intake found; clerk run: with the six files of this folder copied into the fresh clone, `npx biome ci .` printed "Checked 260 files in 260ms. No fixes applied." (exit 0, still 260 files, so the folder is outside its scope), and `npx biome ci .erpaval/vdd/s6-resolver-chokepoint` checked no file.

### 4.4 Changed paths

- Base to H (`git diff --name-only 2b03644..7b1fc2b`): `src/domain/vocabulary/s6-properties.test.ts` only (+955 lines over the two test commits: 923 and 32).
- This receipt's commit adds only the files under `.erpaval/vdd/s6-resolver-chokepoint/`: `contract.json`, `readings.md`, `behaviors.json`, `evidence.md`, `review-ledger.json`, `receipt.md`.
- The receipted range `9605b2c..2b03644` (32 files, not changed by this run): `.erpaval/INDEX.md`, `.erpaval/solutions/architecture/admit-a-rewrite-by-partition-equality-not-a-join.md`, `src/adapters/z3/solver-service.{ts,test.ts}`, `src/domain/compat.ts`, `src/domain/engine/formal/{atomize,encode,numeric,quantity-alias,relational,semantic}.ts` and `encode.test.ts`, `src/domain/engine/lint/gtwr.ts`, `src/domain/engine/pipeline/{check,gate}.ts`, `src/domain/requirements/content-hash.ts`, `src/domain/vocabulary/{build,ids,implicit,invariants,keys,outcome,projection,readers,resolve}.ts` with `hygiene`, `invariants`, `outcome`, `readers` and `resolve` tests, `src/package-boundary.test.ts`, `src/testing/gaming.ts`.

### 4.5 Commits and the semver effect

| commit | subject | type |
|---|---|---|
| 2ce1b05 | `test(vocabulary): S6 property and sabotage-target tests (contract 971c904835f2)` | test |
| 7b1fc2b | `test(vocabulary): [S6-004] a refused V2 alias leaves no contrary pair in its class (contract-r1, contract 971c904835f2)` | test |
| this commit | `docs(erpaval): S6 resolver chokepoint VDD receipt (contract 971c904835f2)` | docs |

The run adds commits of type test and docs only: no `feat`, no `fix`, no breaking footer, no source change. Inference from the commit types, with release-please (`release-please-config.json`, release type node, manifest 2.0.0): this run adds no release bump of its own. The clerk did not run release-please. The 13 commits of the receipted range (fix, feat, refactor) are PR #20's and are not changed here. No tag was created and `CHANGELOG.md` is untouched.

### 4.6 Independence and isolation

Roles and families: intake opus (2176); reading A opus (2180); reading C codex (2181); reconciler (2184); reading B sonnet (2186); contract role Claude (2197); absence (2206); evidence (2211); attacker codex (2217, replay 2250); review prep codex (2218); reviewers L1 2222 and L2 2223, codex; contract-r1 (2245); clerk (2257). The attackers and reviewers are a different family from the Claude test authors. Sabotages and mutants ran only in throwaway clones. Mutation ran serially and the solver-booting `outcome.test.ts` ran alone. The canary key stays in `job-2172/canary/`, which the clerk did not read; the canary mapping in this receipt comes from `records/review-1.json`.

### 4.7 Where the evidence is

`readings.md` (story, intake, readings, agreement table, X1 to X21, RQ1 to RQ9), `behaviors.json` (S6-001 to S6-012 with tests and counts), `evidence.md` (G0 base against head, absence, matrix, memory, attack, replay, review), `review-ledger.json` (review round 1 with lines read and canaries caught), `contract.json` (byte copy of the run contract). Role appendices: `job-2176/intake-s6-tables.md`, `job-2180/reading-a.md`, `job-2181/reading-c.md`, `job-2184/reconcile.md`, `job-2211/evidence-matrix.md`, `job-2217/attack-ledger.md`.
