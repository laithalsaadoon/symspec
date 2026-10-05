# Release hardening: evidence (VDD run 3, role evidence, job 866)

Base 0fca0433eb82, build HEAD ca83661 on vdd/release-hardening (clone repo3). Node 24 (mise), pnpm 11.21.0,
`SYMSPEC_EMBED_STUB=1 NO_COLOR=1 CI=1`. No code, test or other doc was edited; sabotage ran in a throwaway
`git clone --no-hardlinks` of repo3 at ca83661 (`pnpm install --offline --frozen-lockfile`), which is discarded.
This record rules nothing: every gap below is open for the coordinator.

## 1. The whole gate: `pnpm check` at ca83661, exit 0

| leg | command | verdict | count |
|---|---|---|---|
| 1 format and lint | `biome ci .` | pass | 234 files checked, no fixes |
| 2 types | `tsc --noEmit` | pass | exit 0 |
| 3 generated doc | `pnpm run check:agents` | pass | AGENTS.md equals the generator's output |
| 4 reachability | `pnpm run gate:reachability` | pass | variables=12, clean=554ms, buggy=785ms; "sound ... catches the planted defect" |
| 5 build | `pnpm run build` (tsdown) | pass | dist/cli.mjs 2.74 MB + model-cache 7.02 kB |
| 6 tests | `vitest run` | pass | 108 files, 3276 tests, 3276 passed, 0 failed, 0 skipped |
| 7 dead code | `pnpm run knip` | pass | no findings |

Seven of seven legs ran, none failed. The tree was clean before and after. Tests carrying an RH id: 19
(cli 7, publish 5, document 3, agents-doc 3, scope 1); the absence record's 15 red on base plus 4 pinned that
already passed (RH-004 x2, RH-005, RH-006) make the same 19, all green here.

## 2. Sabotage replays (16 plants, each alone on a clean checkout, then restored)

Run with `vitest run <file> -t "RH-"` on the file holding the guard; plants that touch the CLI rebuilt
`dist/cli.mjs` first (the CLI tests spawn the built bundle). All 16 went red on the named test; after the
last, `git checkout` and a rebuild left `git status` clean.

| # | behavior | plant | result |
|---|---|---|---|
| 1 | RH-002 | README CI link (line 924) back to theagenticguy/symspec | red: [RH-002] package.json, README.md, RELEASING.md, AGENTS.md and src/ never say theagenticguy (1 failed, 4 passed) |
| 2 | RH-001 | package.json homepage without `#readme` | red: [RH-001] names the repository the next publish is built from (1 failed, 4 passed) |
| 3 | RH-003 | `data.run` no longer takes `bundle.unresolvedConfig` (check.ts) | red: [RH-003] with no config anywhere, a git refusal runs exactly as no repository and discloses the refusal |
| 4 | RH-003 | `gitRefusal` = whole stderr, not its first line | red: same [RH-003] test |
| 5 | RH-004 | the `present !== undefined` refusal removed (store.ts) | red: both [RH-004] tests (config beside the document; config in an ANCESTOR) (2 failed) |
| 6 | RH-005 | bare-repository check removed | red: [RH-005] the bare-repository refusal stays ERR_CONFIG_INVALID |
| 7 | RH-006 | `explicit !== undefined` check removed | red: [RH-006] --config and SYMSPEC_CONFIG under a git refusal behave as they do today |
| 8 | RH-007 | statement dropped from intentRef's description | red: [RH-007] the vocabulary, intent and policy keys and the intentRef and derived fields interpolate it |
| 9 | RH-007 | "With a vocabulary those two tables are frozen." added to a description | red: [RH-007] states neither unqualified enforcement claim anywhere in the document schema |
| 10 | RH-007 | constant reworded (drops "preserved on save" and "no check tier") | red: [RH-007] one exported constant states that v4 is experimental and read by no check tier |
| 11 | RH-008 | `--split` description retyped instead of the constant | red: [RH-008] init --split says in its help, its manifest entry and its result ... |
| 12 | RH-008 | `data.anchorsNote` removed from init's result | red: same [RH-008] test |
| 13 | RH-009 | AGENTS.md init --split paragraph retyped (generator) | red: [RH-009] every paragraph about init --split, intent.json, policy.json or format v4 carries the statement |
| 14 | RH-009 | statement appended to the pins paragraph | red: [RH-009] the config`s pins are not labelled experimental |
| 15 | RH-009 | scope.ts pinnedConfig old wording ("and the intent and policy files it names") | red: [RH-009] the pinned-config claim puts the config, and nothing no tier reads, under code-owner review |
| 16 | RH-009 | README blockquote old wording | red: README [RH-009] the unqualified enforcement claims are absent |

My first plant for #9 put the phrase in an exported constant outside the schema; it stayed green (3 passed),
which is correct for that test (it reads the schema), so I replanted inside the intentRef description.
These sixteen runs replay the 15 plants the three build commits name (2 + 5 + 8; the --split bullet is two runs,
#11 and #12), independently.
A branch nobody sabotaged and no test catches: see G1.

## 3. B3 end to end on dist/cli.mjs (fresh temp dir, no symspec.config.json in it or any ancestor, checked by walking to /)

`git` shim first on PATH: prints `fatal: detected dubious ownership in repository at '<pwd>'` plus three more
lines to stderr, exit 128. "No-git" run: PATH holds no git at all.

| run | exit | type / verified / findings | data.run.config |
|---|---|---|---|
| clean document, no git | 0 | check, verified true, FND_REACHABILITY_NOT_CHECKED | absent |
| clean document, shim | 0 | identical | `{path: <dir>/symspec.config.json, source: "directory", gitRefusal: "fatal: detected dubious ownership in repository at '<dir>'"}` |
| document with R1 and R2 contradicting (door unlock / not unlock), no git | 1 | verified false, FND_CONTRADICTION, GTWR_R16_NEGATION, FND_REACHABILITY_NOT_CHECKED, same demotions | absent |
| the same document, shim | 1 | identical verified, finding codes and demotions (compared whole in a script: `identical true`) | same disclosure; the three later stderr lines ("To add an exception...") are not in it |
| shim, symspec.config.json in an ANCESTOR | 2 | ERR_CONFIG_INVALID, error names git's refusal and the config found, no `data` | none; the ancestor config is not loaded |
| shim, symspec.config.json beside the document | 2 | ERR_CONFIG_INVALID naming the refusal | none |

The document sat in a subdirectory (`specs/door/`) of the temp dir, so the disclosed path is the document's
own directory, as RH-003 pins. `add` through the shim still exits 0 (only `check` reads the config).
RH-005 and RH-006 at process level are the cli.test.ts tests (passing); I did not repeat them by hand.
The v1.2.1 exit-0 claim of the audit was not re-run by me.

## 4. `npm pack --dry-run` (`--json --ignore-scripts`, then a real pack unpacked under my scratch folder)

symspec 1.2.1, symspec-1.2.1.tgz, 6 entries, 780,599 bytes packed, 2,815,244 unpacked: LICENSE, README.md,
bin/symspec.mjs, dist/cli.mjs, dist/model-cache-PZRCo9qP.mjs, package.json. The packed package.json reads
`repository.url` git+https://github.com/laithalsaadoon/symspec.git, `homepage`
https://github.com/laithalsaadoon/symspec#readme, `bugs.url` https://github.com/laithalsaadoon/symspec/issues
(exact, matching RH-001). `theagenticguy` occurs in none of the six packed files; in the repo it occurs
only in CHANGELOG.md (83, release-please history, untouched by ruling), src/publish.test.ts (the guard's
own constant and a comment) and the .erpaval records; RELEASING.md's `npm trust github symspec --repo
laithalsaadoon/symspec --file release-please.yml --allow-publish` is correct. A plain `npm pack --dry-run`
runs `prepare` (tsdown) and rebuilds the ignored dist; nothing tracked changed.

## 5. Evidence by behavior

| id | strongest evidence | layer reached | sabotage |
|---|---|---|---|
| RH-001 | example: package.json read, three URLs compared exactly; plus the packed manifest (section 4) | manifest | #2 |
| RH-002 | example: negative scan of package.json, README, RELEASING, AGENTS, non-test src; install, clone and trust lines positive | files that ship | #1 |
| RH-003 | two example tests through the spawned bundle, shim vs no git, whole findings/demotions/verified/exit; section 3 by hand | real CLI | #3, #4 |
| RH-004 | two example tests through the bundle (beside, ancestor; ancestor never loaded); section 3 | real CLI | #5 |
| RH-005 | example through the bundle (a worktree pointing into a fake bare repo) | real CLI | #6 |
| RH-006 | example through the bundle (--config and SYMSPEC_CONFIG under refusal; flag disclosed with git absent) | real CLI | #7 |
| RH-007 | three examples on the Schema annotations (constant, interpolation into five keys, no unqualified claim) | module (no CLI surface, see G2) | #8, #9, #10 |
| RH-008 | example through the bundle: `--help`, the manifest entry and the result | real CLI and manifest | #11, #12 |
| RH-009 | examples over AGENTS.md (generated, byte-equal), README and scope.ts text | files that ship | #13..#16 |

## 6. Gaps (evidence weaker than an example through the real CLI or manifest, or unpinned)

- G1 (RH-004, fail-closed): the branch "a path whose existence cannot be determined counts as present" in
  `configAtOrAbove` (`Effect.orElseSucceed(() => true)`, src/adapters/fs/store.ts) has no test. Changed to
  `() => false` on the copy, cli.test.ts, store.test.ts and src/app all stayed green (28 files, 818 tests).
  The build message claims the behavior; nothing pins it. An unreadable ancestor directory would then let a
  governed run proceed unpinned. Needs a test (an ancestor with mode 000 or an injected fs error) or a ruling.
- G2 (RH-007): the v4 descriptions (vocabulary, intent, policy, intentRef, derived) appear on no shipped
  surface: `grep` finds no `intentRef` or `frozenTables` in manifest output or AGENTS.md, and the statement
  occurs once in dist/cli.mjs (the constant). The evidence is therefore module-level examples on the Schema
  annotations, the only level that exists; it is weaker than a CLI/manifest test only because none can read
  these strings today. If a later release exposes the schema, the test should move to that surface.
- G3 (C8, from the build; unchanged): `src/app/runtime/signal-classes.ts` `anchor` class still reads "intent,
  policy, the pinned configuration, or the baseline binding", and `SymspecConfig` `files.intent`/`files.policy`
  descriptions are neutral and unlabelled. No test pins either; left for the reviewer.
- G4 (RH-001/RH-002): the guards read files in the working tree; nothing asserts the published tarball's
  package.json. I checked it once by hand (section 4); no test does.
- G5 (RH-003): the shim refuses `git` wholesale, and the document in all tests is a plain file in a temp
  directory. A refusal that comes only from `rev-parse --show-toplevel` while other git calls work was not run.
- G6 (RH-006/RH-005): run only through the committed tests; not repeated by hand, and the v1.2.1 baseline
  (exit 0 on the no-config refusal) was taken from the audit, not re-run.

G1 is the only one with a reachable sabotage that no test catches; the rest are scope notes.

Behaviors: RH-001, RH-002, RH-003, RH-004, RH-005, RH-006, RH-007, RH-008, RH-009
