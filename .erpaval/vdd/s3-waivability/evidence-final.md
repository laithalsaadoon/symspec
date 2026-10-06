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
