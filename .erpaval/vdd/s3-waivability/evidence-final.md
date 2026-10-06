# S3 waivability and release hardening: evidence for the 2.0.0 tree

Role: evidence (release), board item evidence-final-2 (#211, inputs: #201's body, integrate-2). Job 1116 for the coordinator, job 815.
Tree measured: `2d3e5fe3368d8a2166f50a32156c26734df253e8` (`merge: release hardening for 2.0.0 (B1, B3, B4)`), branch `vdd/s3-waivability`, which is `v1.2.1-226-g2d3e5fe`. Parents: `d3db1d0` (S3) and `935ce70` (run 3, `vdd/release-hardening`).
Environment: node 24.21.0, pnpm 11.21.0, `SYMSPEC_EMBED_STUB=1 NO_COLOR=1 CI=1` for the gate. The reproducers in sections 3 and 4 unset `SYMSPEC_EMBED_STUB` (they need the real embedder, which is cached and ran offline; with the stub there is no FND_OPPOSITION_CANDIDATE to waive, measured).
Nothing in this file edits code, tests or other docs, and no gap below is marked ruled.
Everything ran in a throwaway `git clone --no-hardlinks` of the run clone (`job-1116/fresh`, checked out at 2d3e5fe; tree clean before and after every leg; `dist/` is gitignored). The run clone was only read.

## 1. CI equivalence: `.github/workflows/check.yml`

The workflow is: checkout, `pnpm/action-setup` (version from `packageManager`, `pnpm@11.21.0`), node 24, `pnpm install --frozen-lockfile`, then one `pnpm check`.

Install: `pnpm install --frozen-lockfile` in the fresh clone, exit 0, 4.3 s. I ran it online (no `--offline` flag); pnpm printed `Lockfile is up to date, resolution step is skipped`, `Packages: +169` and `downloaded 0`, so every package came from the local content-addressable store and I did not exercise a network fetch. `prepare` ran `tsdown` (`dist/cli.mjs` 2.76 MB).

`pnpm check` = `biome ci . && tsc --noEmit && pnpm run check:agents && pnpm run gate:reachability && pnpm run build && vitest run && pnpm run knip`. **Exit 0**, 2 min 40 s wall.

| leg | verdict | count |
|---|---|---|
| `biome ci .` | pass | 242 files checked, no fixes applied |
| `tsc --noEmit` | pass | exit 0 |
| `check:agents` | pass | `gen-agents --stdout` equals committed `AGENTS.md` (no stale message) |
| `gate:reachability` | pass | FEASIBLE: 12 variables, clean verdict PROVED_UNDER_HYPOTHESES, buggy verdict VIOLATED, 713 ms within the 5000 ms budget |
| `build` (tsdown) | pass | `dist/cli.mjs` 2.76 MB, `dist/model-cache-PZRCo9qP.mjs` 7.02 kB |
| `vitest run` | pass | 112 files passed (112), 3587 tests passed (3587), 0 failed, duration 140 s |
| `knip --no-progress` | pass | no output, exit 0 |

Same numbers as integrate-2's run in the run clone (242 files, 112 files, 3587 tests). The log is `job-1116/check.log`.

## 2. `npm pack --dry-run` (the published artifact)

`npm pack --dry-run` ran `prepack` (tsdown) and `prepare`, exit 0. 6 files, package size 787.4 kB, unpacked 2.8 MB, `symspec-1.2.1.tgz`:

| file | size |
|---|---|
| LICENSE | 11.4 kB |
| README.md | 55.1 kB |
| bin/symspec.mjs | 223 B |
| dist/cli.mjs | 2.8 MB |
| dist/model-cache-PZRCo9qP.mjs | 7.0 kB |
| package.json | 2.7 kB |

`files` in package.json is `["dist", "README.md", "LICENSE"]`; `bin/symspec.mjs` is included because it is the `bin` target. No `.erpaval/`, `src/`, tests or fixtures ship.

The packed package.json (npm packs the file unchanged):

| field | value | expected |
|---|---|---|
| version | `1.2.1` | still 1.2.1, release-please bumps it: yes |
| repository.url | `git+https://github.com/laithalsaadoon/symspec.git` | RH-001: yes |
| homepage | `https://github.com/laithalsaadoon/symspec#readme` | yes |
| bugs.url | `https://github.com/laithalsaadoon/symspec/issues` | yes |
| description | ends `... typed JSON envelopes and 90 stable codes.` | 24 ERR + 42 FND + 24 GTWR = 90 |

The code count is checked two ways: `node bin/symspec.mjs manifest` lists 24 errorCodes (ERR_WAIVER_REFUSED among them), 42 findingCodes and 24 lintCodes; README.md has one `90 stable codes` and no `89 stable`. The four version carriers agree at 1.2.1: package.json, `src/app/runtime/version.ts` (`VERSION = '1.2.1' // x-release-please-version`), README.md line 933 and AGENTS.md line 12 (both carry the `x-release-please-version` marker), and `symspec manifest` reports `version` 1.2.1. `.release-please-manifest.json` says `{".": "1.2.1"}`.
The repository.url differs from v1.2.1's (`theagenticguy`) on purpose: commit 16905f2 (RH-R1) records that the GitHub account was renamed and npm provenance compares the OIDC repository claim with package.json exactly. The CHANGELOG.md compare links still name `theagenticguy`; release-please history, untouched by design.

## 3. The AC-5-6 headline reproducer on `dist/cli.mjs` (R43a)

Fixture: `.erpaval/vdd/s3-waivability/fixture/` (`base.json`, sha256 `781fff94...`; six fixed-id requirements, the CAB heat/cool pair and the ORD/LOG ones). Real embedder. Scripts: `job-1116/rep/run.sh`, `rep/meta.sh`.

Write half. `cases/repro-code-only.ops.jsonl` is the AC's stream: a code-only `waive FND_OPPOSITION_CANDIDATE`, then `add` TNK-R1 (fill the tank) and TNK-R2 (drain the tank) under their own trigger:

| case | exit | result |
|---|---|---|
| `apply` repro-code-only on a copy of base.json | 1 | `written: false`, `results[0] {op: waive, ok: false, code: "ERR_WAIVER_REFUSED"}`; error: "`FND_OPPOSITION_CANDIDATE` is a triage-class finding, and a triage finding is never waivable, in any scope: only a change to what the document says discharges it."; suggestions name `symspec update --ref`, `symspec antonym`, `symspec glossary` and `symspec explain --code FND_OPPOSITION_CANDIDATE` (all commands this build parses). File **byte-identical** to base.json (`cmp`, sha256 unchanged `781fff94...`); the two TNK adds were not written either (atomic stream) |
| `apply` repro-scoped (refs CAB-R1, CAB-R2 and hash) | 1 | `ERR_WAIVER_REFUSED`, file byte-identical. Refused by class, although properly scoped |
| `apply` repro-single-ref | 1 | `ERR_WAIVER_REFUSED`, file byte-identical |
| `apply` never-verdict (two lint waivers, then a `FND_CONTRADICTION` waive) | 1 | `written: false`; the two lint waives report `ok: true` and the third `ERR_WAIVER_REFUSED`; file byte-identical (the whole stream aborts) |
| `apply` lint-scoped (control: refs + hash waive of GTWR_R5) | 0 | `written: true`, `ok: true`; the file changes |

Check half. The `*.stored.json` files are what the base build's `apply` wrote (the legacy channel). `check` on HEAD:

| stored document | exit (`--strict` exit) | verified | waived / appliedWaivers / ignoredWaivers | FND_OPPOSITION_CANDIDATE / FND_CONTRADICTION | demotions | diagnostics |
|---|---|---|---|---|---|---|
| repro-code-only (CAB + TNK, code-only waiver) | 1 (1) | false | 0 / 0 / 0 | 2 findings stay | open-opposition-candidate x2 (the CAB pair and the TNK pair, each 2 requirements), excluded-from-formal x2 | one info `waiver-inert`: "The stored waiver of FND_OPPOSITION_CANDIDATE is inert: ... a triage-class finding, which is never waivable, so `check` ignores ...", ops `[{"op":"unwaive","code":"FND_OPPOSITION_CANDIDATE"}]` |
| repro-scoped (refs CAB-R1, CAB-R2 + hash) | 1 (1) | false | 0 / 0 / 0 | stays | same four demotions | one `waiver-inert` naming the triage class, unwaive op carries the two refs |
| repro-single-ref | 1 (1) | false | 0 / 0 / 0 | stays | same | one `waiver-inert`, unwaive op carries the `ref` |
| never-verdict | 1 (1) | false | 2 / 2 / 0 (the two lint waivers) | FND_CONTRADICTION **stays** | open-opposition-candidate, waived-blocking-lint[2] | one `waiver-inert`, "FND_CONTRADICTION is a verdict-class finding, which is never waivable" |
| lint-scoped (control) | 1 (1) | false | 1 / 1 / 0 | n/a | no waived-blocking-lint (the waived lint does not block) | none |
| base.json, no waivers | 1 | false | 0 / 0 / 0 | one opposition candidate (CAB) | excluded-from-formal x2, open-opposition-candidate[2] | none |

The exit is 1 in every row because the fixture's ORD requirements carry an error-severity GTWR_R7_VAGUE; `verified` is false on the fixture whatever S3 does, so read the findings, demotions and diagnostics, not `verified` alone (the intake and the earlier evidence say the same).

Inert means ignored, metamorphic (S3-016): repro-code-only.stored.json compared whole with the same document with `waivers: []`: the only differences are the path strings (`data.path`, the repair command strings that echo the path, one finding message) and the single `waiver-inert` diagnostic. Findings 16 = 16, demotions 4 = 4, verified false = false.

R43's base half is still false for the code-only waiver (recorded in evidence.md section 5, job 1007, and not re-measured here): on base the stored code-only opposition waiver does not apply (`PAIR_BOUND_CODES`), so `verified:true` needs the exact-set waiver. The HEAD behavior (refuse, byte-identical, inert and disclosed, both pairs demote) is what this section confirms.

Terminology carry-over, re-measured because the old evidence.md listed it as gap G1: `rep/term.sh`, a document with ACR-R1 naming an unexpanded "ECU". Before: GTWR_R37_ACRONYM and FND_ACRONYM_UNDEFINED on ACR-R1, waived 0. `apply` of `waive FND_ACRONYM_UNDEFINED refs [ACR-R1]` (the hash is folded): exit written true, `ok: true`. After: waived 1, `appliedWaivers` lists it, the FND_ACRONYM_UNDEFINED finding is gone, ignoredWaivers 0, diagnostics 0. So R57 (c66eecf) closed it for FND_ACRONYM_UNDEFINED; I did not build a document that fires FND_TERM_INCONSISTENT (by reading of `suppressedByCrossed`, the same path).

## 4. The release hardening headline reproducer (B3)

Script: `job-1116/rep/b3.sh`. A temp directory, the document at `specs/door/requirements.json` (init plus one event-driven requirement, which checks to `verified: true`, findings `FND_REACHABILITY_NOT_CHECKED`), no `symspec.config.json` in the directory or any ancestor (walked to `/`, none found). A `git` shim first on PATH prints `fatal: detected dubious ownership in repository at '<pwd>'` plus three lines, exit 128. "No git" is a PATH holding no git. `check` run from the document's directory.

| run | exit | type / verified / findings | `data.run.config` |
|---|---|---|---|
| no git on PATH | 0 | check, verified true, FND_REACHABILITY_NOT_CHECKED | null |
| git shim (dubious ownership), no config anywhere | **0** | check, verified true, FND_REACHABILITY_NOT_CHECKED (identical) | `{"path": "<dir>/specs/door/symspec.config.json", "source": "directory", "gitRefusal": "fatal: detected dubious ownership in repository at '<dir>/specs/door'"}`, the refusal disclosed |
| shim, `symspec.config.json` in an ANCESTOR | **2** | `ERR_CONFIG_INVALID`: "`git rev-parse --show-toplevel` failed in <dir>/specs/door (exit 128): fatal: detected dubious ownership ... The pinned config is read at the repository toplevel, so its location cannot be known. A config exists at <ancestor>/symspec.config.json, so the run does not proceed without knowing whether it governs this document." | none: the ancestor config is not loaded |
| shim, `symspec.config.json` beside the document | 2 | `ERR_CONFIG_INVALID` naming the refusal | none |
| control: no git, config in an ancestor | 0 | check, verified true | null (no repository, no pinned config read: as base) |

Behaviors RH-003 (fall back and disclose), RH-004 (fail closed with a config present) hold on the merged bundle. RH-005, RH-006, RH-010 and RH-011 are the `cli.test.ts` tests in the 3587 passing above; I did not repeat them by hand. The earlier release-hardening evidence (job 930) ran the same table on 6509f0f; this is the same observable behavior on the merged tree.

## 5. The burn down: KNOWN_ESCAPES rows

Method: `KNOWN_ESCAPES` imported with `tsx` from `src/testing/gaming.ts` in a clone at the base `0fca043` (node_modules of the fresh clone symlinked) and in the fresh clone at 2d3e5fe; rows named `<fixture> x <move>`.

| | rows |
|---|---|
| base 0fca043 | **62** (62 distinct) |
| HEAD 2d3e5fe | **51** (51 distinct) |
| left | 11 |
| added | 0 |

The 11 that left are exactly the waive-by-code rows: one-trigger-contradiction, contrary-pair, registered-contrary, numeric-conflict, temporal-conflict, glossary-bridged, term-bridged, waived-blocking-lint, dangling-target, overlapping-contrary and derives-cycle, each `x waive-by-code`. No other row changed. (Two surviving rows contain the word waive only in a fixture name, `waived-blocking-lint x delete-requirement@first` and `@second`; they are not waive moves.) S3-048 says the 11 rows are deleted with the move still registered; the registered move and exactness are asserted by the gaming shard and registry tests in the passing suite.

## 6. release-please preview from `git log v1.2.1..HEAD`

The tag `v1.2.1` is in the run clone and points at `532eea7a28b18d10cbd05c7746f754ba2ae9ff19`, the same commit `git rev-parse v1.2.1` gives in `/mnt/uv-cache/workplace/symspec` (read-only). Configuration: `release-please-config.json` (release-type node, no component in the tag, `bootstrap-sha` d15af29, extra-files `src/app/runtime/version.ts`, `README.md`, `AGENTS.md`), manifest `{".": "1.2.1"}`. No pre-major bump settings, and the current version is 1.2.1, so a breaking commit bumps major.

Range `v1.2.1..HEAD`: 226 commits, of which 32 are merge commits (subjects `merge: ...`, not conventional, ignored by release-please) and 194 are not.

| type (non-merge) | commits | changelog section |
|---|---|---|
| fix | 130 | Bug Fixes |
| test | 45 | hidden (not a release-please default section) |
| docs | 14 | hidden |
| feat | 4 | Features (`0d0b8a0` config, `4502693` ops, `38bb6fc` document, `1dcf401` numeric) |
| feat! | 1 | Features, flagged BREAKING: `7afb20e feat(waivers)!: enforce waivability: refuse never-class and unscoped waivers, inert stored ones` |

Breaking markers in the whole range, searched by subject (`type(scope)!:`) and by a line starting `BREAKING CHANGE` or `BREAKING-CHANGE` in any commit message: **exactly one commit, 7afb20e**, both ways. Its body carries the footer `BREAKING CHANGE: code-only, hash-less single-ref and never-class waivers stop applying. ...` as a trailer paragraph (above `Behaviors:` and `Co-Authored-By:`). So release-please computes **2.0.0** (major from 1.2.1), and would bump `package.json`, `.release-please-manifest.json` and the three extra files; 1.2.1 stands until then (section 2). The busiest fix scopes: engine 57, parse 11, reachability 10, formal 9, numeric 8, config 8, lint 6, waivers 5. I did not run the release-please action itself (no network, no token); this is a count by the published commit rules, not the tool's output.

## 7. Gap list (none marked ruled; the coordinator and a person decide)

From this run's measurements: none open. Every headline reproducer behaves as the ruling says, the gate is green, the pack is the expected six files, the burn down is exactly 62 to 51, and exactly one breaking commit makes the next version 2.0.0.

Carried from the earlier evidence (`evidence.md`, job 1007, measured at 7afb20e), not re-measured in this job. No commit after 7afb20e names G3 to G6 or TA3 in its subject; the closure round (R54 to R57, commits b2c2713 to d3db1d0) did change some waive prose (R56) and the terminology path, so G2 may be narrower than written. The coordinator should confirm each against the attack and review ledgers:

| id | gap | state |
|---|---|---|
| G2 | TA3 not discharged: 4 of 7 never-class demotion actions, 16 of 31 never-class finding messages, 6 repair arms and the `unappliedNote` site are reached by no document; the guards are `/waive/i` and spelling regexes that survive planted rewordings (survivors 19, 20, 21, 36). S3-039, S3-040, S3-045 | open as of 7afb20e, below the minimum of reach; TA3 was not accepted by the owner |
| G3 | S3-012 (import equals apply) has example evidence only (floor 2, achieved 1) | open |
| G4 | S3-052 and S3-053 have no executable evidence. Inspected in this job: the one `feat!` with a `BREAKING CHANGE:` footer (section 6), and the four version carriers unchanged at 1.2.1 (section 2) | inspection only, not a test |
| G5 | the S3-026 provenance marker may be empty (survivor 18) | open |
| G6 | R43's base assertion is false for the code-only waiver (needs the exact-set waiver for `verified: true` on base) | record correction for the ruling and the S3-038 title, not a defect of the build |

Closed since that evidence: the old G1 (terminology waivers neither applied nor reported) is closed for FND_ACRONYM_UNDEFINED at this tree (section 3, last paragraph).

## 8. Reproduce

```
git clone --no-hardlinks <run clone> fresh && git -C fresh checkout 2d3e5fe
cd fresh && pnpm install --frozen-lockfile
SYMSPEC_EMBED_STUB=1 NO_COLOR=1 CI=1 pnpm check
npm pack --dry-run
bash rep/run.sh; bash rep/meta.sh; bash rep/term.sh; bash rep/b3.sh      # reproducers (real embedder; unset SYMSPEC_EMBED_STUB)
# burn down: tsx a one-liner importing KNOWN_ESCAPES from src/testing/gaming.ts at 0fca043 and at HEAD
git log --no-merges --format='%h %s' v1.2.1..HEAD                         # release-please input
```

Scripts and logs are in `/home/lalsaado/bonk-fs/projects/mods-webapp-poc/run/work/job-1116/` (`check.log`, `install.log`, `pack.out`, `esc-base.json`, `esc-fresh.json`, `rep/`).

## After the final closure

Role: evidence (release), board item evidence-final-3 (#246, input build-6), job 1204 for the coordinator, job 815.
Tree measured: `6f7e95799ae7e107b99aee110aea5096469918f8` (`fix(cli): every printed command is shell-safe and names full arguments (R60, R61)`), branch `vdd/s3-waivability`, on top of be4516f (R59), 772aee6 (tests for R59-R62), 19bd46f, bc9a87d and cf4f3bc; `v1.2.1-232-g6f7e957`.
Environment: node 24.21.0, pnpm 11.21.0, `SYMSPEC_EMBED_STUB=1 NO_COLOR=1 CI=1`. Everything ran in throwaway `git clone --no-hardlinks` copies under `/home/lalsaado/bonk-fs/projects/mods-webapp-poc/run/work/job-1204/` (`fresh` at 6f7e957, `base` at 0fca043, `v121` at the v1.2.1 tag); the run clone was only read, and `git status` of `fresh` was empty before and after every leg. Nothing here edits code, tests or other docs, and no gap below is marked ruled. Logs: `check.log`, `install.log`, `pack.out`, `list-*.txt`, `pipe.py`, `e-head.json`, `e-base.json` in that folder.

### A. `.github/workflows/check.yml` on 6f7e957

The workflow is unchanged from section 1 (checkout, pnpm/action-setup from `packageManager`, node 24, `pnpm install --frozen-lockfile`, one `pnpm check`). Install: exit 0, 3.8 s, `prepare` ran tsdown. `pnpm check` = `biome ci . && tsc --noEmit && pnpm run check:agents && pnpm run gate:reachability && pnpm run build && vitest run && pnpm run knip`: **exit 0**, 2 min 58 s wall.

| leg | verdict | count |
|---|---|---|
| `biome ci .` | pass | 243 files checked, no fixes applied (242 at 2d3e5fe; the new file is `src/domain/engine/core/shell-word.ts`) |
| `tsc --noEmit` | pass | exit 0 |
| `check:agents` | pass | `gen-agents --stdout` equals the committed AGENTS.md (build-6 regenerated one row) |
| `gate:reachability` | pass | FEASIBLE: 12 variables, clean PROVED_UNDER_HYPOTHESES, buggy VIOLATED, clean 876 ms, buggy 776 ms, budget 5000 ms |
| `build` (tsdown) | pass | `dist/cli.mjs` 2.77 MB, `dist/model-cache-PZRCo9qP.mjs` 7.02 kB |
| `vitest run` | pass | 112 files (112), **3654 tests passed (3654)**, 0 failed, 157 s |
| `knip --no-progress` | pass | no output, exit 0 |

### B. 3654 versus 3651

Three numbers are in play: 3587 (the whole tree at 2d3e5fe, and still at 19bd46f), 3651 (absence-6.json, `totals.tests`: 3621 passed, 30 failed, run on the tests of 772aee6 with the product files of 2d3e5fe) and 3654 (6f7e957). I listed every test with `vitest list` at 2d3e5fe, 19bd46f, 772aee6, be4516f and 6f7e957 (same environment, stub embedder) and compared the full names.

| commit | listed tests |
|---|---|
| 2d3e5fe | 3587 |
| 19bd46f | 3587 |
| 772aee6 | 3651 (2d3e5fe plus exactly 64 names, none removed: matches absence-6 `newTests.total` 64) |
| be4516f | 3651 (R59 changed no test names) |
| 6f7e957 | 3654 |

Sorted-name diff 772aee6 to 6f7e957: exactly three added names and none removed, all in `src/domain/advice/repair.test.ts`, all one per source file of a source-walking test:
- `[S3-045] no source string names a command this build lacks (static) > [S3-045] src/domain/engine/core/shell-word.ts`
- `no source file spells a command the CLI cannot run > src/domain/engine/core/shell-word.ts`
- `no source string hand-types a count of the tool's own surface > src/domain/engine/core/shell-word.ts`

Cause: build-6 added the new source file `src/domain/engine/core/shell-word.ts` (R60), and those three tests are generated once per file under `src/`, so each adds one test for it. 3651 + 3 = 3654; the 30 reds of absence-6 are green and the count of tests did not change by any other route. No test file was touched by build-6. So the difference is explained and is not a lost or skipped test.

### C. `npm pack --dry-run` on 6f7e957

Exit 0 (`prepack`/`prepare` ran tsdown). `symspec@1.2.1`, `symspec-1.2.1.tgz`, **6 files**, package size 790.5 kB, unpacked 2.8 MB: LICENSE 11.4 kB, README.md 55.1 kB, bin/symspec.mjs 223 B, dist/cli.mjs 2.8 MB, dist/model-cache-PZRCo9qP.mjs 7.0 kB, package.json 2.7 kB. No `src/`, `.erpaval/`, tests or fixtures ship (package size was 787.4 kB at 2d3e5fe; the difference is the build-6 code in `dist/cli.mjs`).

| field | value | verdict |
|---|---|---|
| version | 1.2.1 | as expected, release-please bumps it |
| repository.url | `git+https://github.com/laithalsaadoon/symspec.git` | ok |
| homepage | `https://github.com/laithalsaadoon/symspec#readme` | ok |
| bugs.url | `https://github.com/laithalsaadoon/symspec/issues` | ok |
| description | ends `... typed JSON envelopes and 90 stable codes.` | ok |

Code count: `node bin/symspec.mjs manifest` gives 24 errorCodes, 42 findingCodes, 24 lintCodes = 90; README has one `90 stable codes`, no `89 stable`. Version carriers all read 1.2.1: `.release-please-manifest.json`, package.json, `src/app/runtime/version.ts`, README.md:933, AGENTS.md:12.

### D. KNOWN_ESCAPES and the release-please preview on 6f7e957

Method as in section 5: `KNOWN_ESCAPES` imported with tsx from `src/testing/gaming.ts` in a clone at 0fca043 and in `fresh`.

| | rows |
|---|---|
| base 0fca043 | 62 (62 distinct) |
| HEAD 6f7e957 | **51** (51 distinct) |
| left | 11, exactly the `x waive-by-code` rows closedBy AC-5-6 (one-trigger-contradiction, contrary-pair, registered-contrary, numeric-conflict, temporal-conflict, glossary-bridged, term-bridged, waived-blocking-lint, dangling-target, overlapping-contrary, derives-cycle) |
| added | 0 |

Unchanged from 2d3e5fe (62 to 51).

`git log --no-merges v1.2.1..HEAD` (tag `v1.2.1` = `532eea7a28b18d10cbd05c7746f754ba2ae9ff19`, same in Laith's checkout read-only): 232 commits in the range, 32 merges, 200 non-merge: fix 132, test 49, docs 14, feat 4, **feat! 1**. The breaking markers searched two ways (subject `type(scope)!:`, and a line starting `BREAKING CHANGE` or `BREAKING-CHANGE` in any message body): **exactly one commit, 7afb20e `feat(waivers)!: ...`**, both ways; the six commits since 2d3e5fe (cf4f3bc to 6f7e957) add none. So release-please computes **2.0.0** from 1.2.1. I did not run the release-please action (no token); this is a count by its published commit rules, as in section 6.

### E. Piped CLI output cut at the pipe size: regression or pre-existing?

The reviewer saw JSON cut at 8192 bytes through a pipe with a slow reader while a regular file was complete. I built `0fca043` (base), the `v1.2.1` tag commit (`532eea7`) and 6f7e957 (`pnpm install --frozen-lockfile`, prepare builds `dist/`) and ran each with stdout to a pipe whose reader starts after a delay. Two inputs: a large `check` result, and `manifest`.

Setup: `pipe.py` creates the pipe, sets its capacity with F_SETPIPE_SZ, starts the CLI, sleeps 1 s and then reads to EOF; the shell form `| (sleep 1; wc -c)` gives the same numbers at the default 64 KiB capacity. The large document `d-<build>.json` was built by `import` of 200 generated `add` ops (`big.ops.jsonl`); `check` on it exits 1 and prints 639,899 bytes (base), 638,685 (v1.2.1), 712,960 (HEAD) to a file. The small case is `check` on the fixture `base.json` (exit 1): 9,470 bytes (base), 7,938 (v1.2.1), 10,252 (HEAD) to a file.

| build | large `check`, file | large `check`, default 64 KiB pipe, slow reader | fixture `check` (full size), pipe capacity 8192 | fixture `check`, capacity 16384 | fixture `check`, capacity 4096 | `manifest` (exit 0), capacity 4096 |
|---|---|---|---|---|---|---|
| base 0fca043 | 639,899 | **65,536** | **8,192** of 9,470 | 9,470 | 4,096 | 109,764 of 109,764 |
| v1.2.1 | 638,685 | **65,536** | 7,938 of 7,938 (fits) | 7,938 | 4,096 of 7,938 | 71,167 of 71,167 |
| HEAD 6f7e957 | 712,960 | **65,536** | **8,192** of 10,252 | 10,252 | 4,096 | 112,090 of 112,090 |

Reading: the cut lands exactly at the pipe's capacity, on all three builds, and only for output that exits non-zero (`check` exit 1); an exit-0 command (`manifest`, 71 KB to 112 KB) arrives whole through a 4096-byte pipe on all three; `import` results are 380 to 384 bytes and never reach the limit. The 8192 the reviewer saw is a pipe of that capacity (or a reader that lets 8192 bytes fill the pipe before it drains it). v1.2.1 is not cut at 8192 on the fixture only because its 7,938-byte output fits; at a 4096 pipe, and at the default 64 KiB pipe with the large document, it is cut the same way. `src/main.ts` is identical on base, v1.2.1 and HEAD (`NodeRuntime.runMain` tears down with a non-zero exit code); the mechanism (exit before the stdout write drains) is my inference from that, not something I traced in a debugger.

Verdict: **a pre-existing defect, not a regression**: identical cut points on 0fca043, v1.2.1 and 6f7e957. It is outside S3 waivability's behaviors and I changed nothing. It matters to any consumer that pipes `check` output of more than the pipe capacity (stdout to a pipe with a slow reader, exit 1): it gets truncated, invalid JSON.

### F. Gaps (none marked ruled)

New from this job:
- G7 (new, pre-existing on base and v1.2.1): non-zero-exit CLI output larger than the pipe capacity is truncated when the reader is slow (section E). Not a behavior of this change; no test pins it; a person decides whether it is a follow-up issue.

Measured and closed by this job: the 3654 versus 3651 question (section B), the pack contents and metadata (C), the 62 to 51 burn down and the single breaking commit (D), the full gate (A).

Carried, not re-measured (a note on each: no commit since 2d3e5fe addresses it by name, and R59-R61 changed only unwaive ref resolution, printed command quoting and some help/catalog prose): G2 (TA3 not discharged; R60 and R61 touched its repair arms and prose, so it may be narrower than written; the attack and review ledgers decide), G3 (S3-012 import equals apply has example evidence only), G4 (S3-052 and S3-053 inspection only: the one `feat!` with its footer, and the four version carriers still at 1.2.1, both re-inspected in C and D), G5 (S3-026 provenance marker may be empty, survivor 18), G6 (R43's base assertion is false for the code-only waiver; a record correction).

Not re-run in this job: the AC-5-6 and B3 reproducers of sections 3 and 4 (they need the real embedder); the 3654 tests include their test forms, all green.
