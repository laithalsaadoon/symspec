# Evidence: S6 resolver chokepoint, run 4

Assembled by the clerk (job 2257) from the role records. The clerk judges nothing. Contract `971c904835f2`, base `2b0364406121fc441a4b30b1da36d771b9eecf97` (2b03644), heads: contract role 2ce1b05, contract-r1 and attack-r1 7b1fc2b88250dc87c3c95e3e05ab7a35a4111579. A number the clerk measured is marked "clerk run" with its command. Every other number is a role's record, named by job.

## 1. G0 legs, base against H

H = 7b1fc2b. Product tree at H = base: `git diff --name-only 2b03644..7b1fc2b` is `src/domain/vocabulary/s6-properties.test.ts` only. Commands are the legs of `package.json` `check`.

| leg | command | base 2b03644 (contract g0_base) | 2ce1b05 (job 2211) | H 7b1fc2b (clerk run) |
|---|---|---|---|---|
| biome | `biome ci .` | exit 0, 259 files, No fixes applied | exit 0, 260 files | exit 0, "Checked 260 files in 245ms. No fixes applied." |
| tsc | `tsc --noEmit` | exit 0 | exit 0 | exit 0 |
| agents | `pnpm run check:agents` | exit 0 | exit 0 | exit 0 |
| reachability | `pnpm run gate:reachability` | exit 0, FEASIBLE sound, 836 ms of 5000 | exit 0, 690 ms | exit 0, "FEASIBLE ... 658ms is within the 5000ms budget" |
| build | `pnpm run build` | exit 0 | exit 0 (tsdown 2372 ms) | exit 0, "Build complete in 295ms" |
| vitest | `vitest run` | exit 0, 3859 passed, 118 files | exit 0, 3889 passed, 119 files | exit 0, "Test Files 119 passed (119)", "Tests 3890 passed (3890)", duration 151.69 s |
| knip | `pnpm run knip` | exit 0, no findings | exit 0, no findings | exit 0, no findings |
| whole | `/usr/bin/time -v pnpm check` | exit 0, 2:47, peak RSS 5.3 GB | exit 0, 2:59.09, peak RSS 7.2 GB (host load 13-17) | exit 0, 2:48.14, peak RSS 3,224,636 KB (3.2 GB) |

Clerk run: fresh clone of the run clone at 7b1fc2b in `/home/lalsaado/bonk-fs/.chora/work/job-2257/clone`, `pnpm install --offline --frozen-lockfile`, then `/usr/bin/time -v pnpm check`, node v24 on PATH, log `/home/lalsaado/bonk-fs/.chora/work/job-2257/check.log`. `git status --short` empty afterwards. Host load average at the end of the run window was 7.99 (`uptime`).

- 3890 = 3859 base + 31 tests in `s6-properties.test.ts` (30 at 2ce1b05, one added by contract-r1).
- KNOWN_ESCAPES length 51 at H (clerk run: a tsx import of `src/testing/gaming.ts` from outside the tree printed `KNOWN_ESCAPES 51`); job 2211 counted 51 at 2ce1b05; the contract records 51 at base. `src/testing` is untouched between base and H.
- Snapshots: `git diff --name-only 9605b2c..2b03644 | grep -ci snap` printed 0 (clerk run); `git diff --stat 2b03644..HEAD -- '**/__snapshots__/**'` is empty (clerk run, job 2211 the same at 2ce1b05).
- Contract-r1 (job 2245) measured `pnpm check` at 7b1fc2b: exit 0, 3890 tests in 119 files, vitest 157.75 s, reachability 756 ms clean and 1030 ms buggy.
- CI runs the same single command (`.github/workflows/check.yml`: `pnpm install --frozen-lockfile`, then `pnpm check`, node 24; job 2211).

## 2. Absence (job 2206, fresh clone at 2ce1b05; legacy entry)

- Diff: `git diff --name-only 2b03644..2ce1b05` is `src/domain/vocabulary/s6-properties.test.ts` (923 insertions); product source and the existing vocabulary test files have 0 diff lines.
- Every criterion command exits 0 with 0 failed, matching the contract role's counts (3, 3, 5, 5, 1, 1, 1, 2, 9, 3, 3 at 2ce1b05) except the existing `resolve.test.ts -t "implicit vocabulary"` filter, which selects 16 (7 in "the implicit vocabulary over the corpus", 9 in "the implicit vocabulary on multi-spelling fixtures"), where the contract text says 15. Decision D-4-2 records 16; `contract.json` is not edited.
- Existing filters: `(2) declaring` 1; `(3) mints|mintSymbolIds` 5; invariants `property (4)|V-OPP` 6; invariants `heat` 2.
- Anti-vacuity (read in lines 290-923): the shared test asserts fixture 14 rows, 26 symbols, variant 15 rows, 73 documents, 204 requirements, 375 symbols; each corpus test asserts its own totals; S6-004 X21 asserts pairs > 0 (not an exact pair count). No test passes on an empty corpus or fixture.
- Nothing broken: `hygiene invariants readers resolve s6-properties` 152 tests passed in 31 s; the vocabulary directory 6 files, 153 tests, 0 failed.
- No build phase ran: no criterion was red on base.

## 3. Evidence matrix (job 2211; floors by the evidence role for a pure domain function: false certificate 2, binding drift 2, gate drift 1)

Levels: 1 example, 2 generated or corpus-input property, 3 type rule. Layer for every row: domain (pure, no solver).

| id | behavior | class | floor | achieved | verdict |
|---|---|---|---|---|---|
| S6-001 | P1 symbols never finer than engine atoms and quantity keys | false certificate | 2 | 2 (73 documents) | ok |
| S6-002 | P2 declaring rendered ops rebuilds the index | binding drift | 2 | 2 | ok |
| S6-003 | P3 minted ids are fixed points, order-free | binding drift | 2 | 2 | ok |
| S6-004 | P4 rewrite keeps contrary pairs | false certificate | 2 | 2 | ok |
| S6-005 | SAB-1 target | binding drift | 2 | 1 plus sabotage kill | gap candidate (accepted in D-4-2 by the person's "accept the rest"; a single example) |
| S6-006 | SAB-2 target | binding drift | 2 | 1 plus sabotage kill | gap candidate (same) |
| S6-007 | SAB-3 target | false certificate | 2 | 1 on the tagged test; 2 via S6-004 X21 | ok (shared) |
| S6-008 | SAB-4 target | gate drift | 1 | 1 | ok |
| S6-009 | slot to kind | binding drift | 2 | 1 on X1-X8; 2 from X21 | ok |
| S6-010 | min-id representative, different-key rewrite | binding drift | 2 | 1 | gap candidate (residual "S6-010 projection evidence is example-only", D-4-2, revisit S8) |
| S6-011 | direct and transitive contrary merges | false certificate | 2 | 1 on tagged tests; 2 via S6-004 and invariants V-OPP | ok (shared) |
| S6-012 | G0 | gate drift | 1 | n/a | green |

Note for the reader: the reconciler proposed S6-005..008 as "false certificate" (section 3 of its record); the evidence role assigned its floors itself. Both are recorded in `behaviors.json`. The person's D-4-2 answer ("Fix M24 as recommended, accept the rest") closed the gap candidates as accepted residuals only for S6-010 by name; S6-005 and S6-006 are listed here as the matrix recorded them.

Residual candidates the matrix named (no criterion): `renderVocabularyOps` edge cases; `projectedDocument`; `frozenTablesDigest`; `readers.ts` V-READ; `waiverBinding` in `content-hash.ts` (no test names it; content-hash.test.ts has 7 tests, 0 mention waiver; indirect cover through readers.test.ts waiver cases around lines 884-1019, check-waivers.test.ts 37, waiver-scope.test.ts 5); the engine refactors (check.test.ts 20, waiver-scope 5, numeric-*.test.ts, encode.test.ts 16 with 2 added in the range, package-boundary.test.ts 9 with 1 added; behavior preservation rests on the whole suite and unchanged snapshots, assumption A1); solver-service `letGo` (11 tests, 1 added in the range, no direct reference outside `solver-service.ts`). Full matrix text: `job-2211/evidence-matrix.md`.

## 4. Memory measurements (`/usr/bin/time -v`, maximum resident set size)

| measurement | value | by |
|---|---|---|
| `pnpm check` at base | 5.3 GB, 2:47 | coordinator, contract g0_base |
| `pnpm check` at 2ce1b05 | 3,391,368 KB (3.4 GB), 2:40.9 | contract role, job 2197 |
| `pnpm check` at 2ce1b05, host load 13-17 | 7,169,852 KB (7.2 GB), 2:59.09 | evidence role, job 2211 |
| `pnpm check` at 7b1fc2b | 3,224,636 KB (3.2 GB), 2:48.14 | clerk run |
| `s6-properties.test.ts` alone, 30 tests | 222,760 KB (223 MB), 3.6 s | job 2197 |
| `s6-properties.test.ts` alone, 30 tests | 233,120 KB (233 MB), 4.61 s | job 2211 |
| `outcome.test.ts` alone (existing, boots z3 per document) | 3,337 MB, 88.0 s | intake, job 2176 |
| `outcome.test.ts` alone | 5,205,020 KB (5.2 GB), 1:32.42 | absence, job 2206 |
| `outcome.test.ts` alone | 3,213,000 KB (3.2 GB), 1:36.52 | job 2211 |

The contract bound is 4 GB for a new test that boots a solver per document; the new file boots no solver and stays near 0.2 GB. `outcome.test.ts` is an existing test and varies from 3.2 to 5.2 GB on this shared host (follow-up). The GitHub runner has 16 GB.

## 5. Attack round 1 (job 2217, codex; `job-2217/attack-ledger.md`) and replay (job 2250)

- Set: 45 generated mutants over 10 product files (targeted operators over keys, union-find, refusal and waiver code; no throw or catch sites in scope, so no smell operators). 4 rejected by `tsc` (M19, M23, M26, M28), 41 valid. Round 1 at 2ce1b05: 31 killed, 10 survived (75.61%, no contractual floor); both passes had identical per-mutant outcomes; no timeouts or tool errors.
- Frozen set hash, SHA-256 of `JSON.stringify(parsed mutants.json)`: `7a6d59545faf7ba0939cad37cf9412a5156c9cd790a9b7a7be4a9a9925ee1a1b`. The replay verified the same hash.
- Sabotage controls (each type-checks, exits 1, restores with `git diff --quiet` exit 0): SAB-1 2 sites, 17 failing tests, caught at `s6-properties.test.ts:552:26` (S6-005); SAB-2 2 sites, 12 failing, caught at `:418:21` (S6-006); SAB-3 5 sites, 11 failing, caught at `:725:39` (S6-007); SAB-4 5 sites, 15 failing, caught at `:770:28` (S6-008). SAB-4-partial (three numeric-bound return sites only) leaves both S6-008 tests green, as reading B found; the whole SAB-4 is the required control.
- Round 1 verdict red on S6-004: M24 (`invariants.ts:224`, `w.aliases = w.aliases.filter((a) => a !== phrase)` replaced by `w.aliases = w.aliases`) survived all 30 S6 tests and 122 other pure vocabulary tests in both passes and violates P4 on a V2 collision with declared contraries (a missing case). Probes: original passes twice, mutant fails twice at `check-p4-probe.mjs:8:8`.
- Equivalents: M01 (KEY_SCOPE literal), M13 (empty-label guard under the extractor's invariant), M27 (maximum instead of minimum representative preserves the partition).
- Surviving non-criterion residual candidates at round 1: M04, M09, M15, M30, M32, M43 (see decisions below).
- Replay at 7b1fc2b (attack-r1, job 2250, ledger SHA-256 `a9931355d0d38d259d1de317dddae0542e7932291730e32bf95714a312a01704`): baseline `tsc` exit 0 and 230 tests passed (s6-properties 31, invariants/hygiene/readers/resolve 122, compat/requirements/content-hash/check-waivers/waiver-scope 76, outcome 1); 55 executions; 32 killed, 9 survived, 4 type-rejected; M24 killed in both passes at `s6-properties.test.ts:769` ("expected [ 'open the valve' ] to not include 'open the valve'"); all 31 round-1 kills still die; the nine survivors are M01, M04, M09, M13, M15, M27, M30, M32, M43; no new mutants; product source and oracle hashes unchanged; clean restoration every time.
- Round 1 survivor table (job 2217): M04 `ids.ts:51` 64-character slug boundary; M09 `implicit.ts:84` numberType for mixed int and real bounds (S5 payloads); M15 `resolve.ts:195` suggestion count; M30 `outcome.ts:488` contrary-adding scope merge (V-OPP versus V-READ attribution); M32 `outcome.ts:557` V-NUM performer membership for an action alias sharing a declared quantity label; M43 `content-hash.ts:199` truncated waiver hash compare (the L1 canary planted the same class).

## 6. Contract-r1 (job 2245)

- Commit 7b1fc2b, one file (+32 lines): the test "[S6-004] a refused V2 alias leaves no contrary pair in its class: `open the valve` is dropped from act_close". Fixture: empty document, antonyms open/close, frozen tables, `act_open` (`open the valve`), `act_close` (`close the valve`, alias `open the valve`). Asserts the V2 violation, the refused alias absent, 2 action symbols, one contrary pair, `contraryLosses` empty, different representatives.
- `-t "S6-004"` 6 passed (was 5). Under M24 in a throwaway copy: 1 failed, 5 passed, at `s6-properties.test.ts:769:32`.

## 7. Review round 1 (jobs 2218, 2222, 2223; `review-ledger.json`)

- Prep (codex, 2218): three blind items over `9605b2c..2ce1b05` (33 files, 22,170 source lines, 8,900 diff lines each), one clean and two one-line canaries, the key file kept outside the readers; key SHA-256 `27dbff09ef27db211da51e2a797b047e133acdbc5d25c17534f7ae667597b878`, verified. Each item passed `tsc` and 179 pure vocabulary tests.
- Mapping (review closed): v1 canary L2 (test oracle weakened, `s6-properties.test.ts:786`), v2 clean, v3 canary L1 (prefix-only waiver hash, `content-hash.ts:199`).
- L1 (job 2222) and L2 (job 2223), codex, a different family from the Claude authors, each read 26,700 of 26,700 diff lines (self-reported; the auditor checks the trace) and each caught both canaries.
- Findings on the clean item v2, neither naming a criterion: RV-1 `projection.ts:100` a real system named `vocabulary probe` collides with the synthetic probe scope and gets 2 false V-KIND reports (repro `job-2222/v2-probe-repro.ts`, exit 1); RV-2 `solver-service.ts:151` a second module copy cannot release its pending mailbox wait (simulated runtime, repro `job-2223/review-v2/repro-mailbox.mjs`, exit 1, no WASM boot, not seen in the suite).
- Both are accepted residuals under D-4-2. Findings on the canary items are the planted defects and are not product findings.

## 8. Decisions and residuals

See `receipt.md` section 2 and 3. The machine-readable copy is the coordinator's `records/decisions.json` (D-4-1, D-4-2, residuals, assumptions, follow-ups).
