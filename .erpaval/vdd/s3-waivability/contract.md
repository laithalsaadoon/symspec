# S3 contract (VDD run 2, contract role, job 863)

Base code: 0fca0433eb82 (the branch's docs commits only add `.erpaval/`). Every test whose name
carries an `[S3-0nn]` id pins that behavior. Expected outcomes come from `readings.md`
(## Settled examples, ## Rulings R1-R46). The failing list on base is
`contract-failing-on-base.txt` (148 tests from job 863, the 15 contract-2 re-pins and the 1 contract-3 re-pin below, every one by assertion or file-snapshot mismatch; none
by a compile error, a missing import or a TypeError).

## Names the builder implements (the tests read them)

Write side (fold under `MUTATE_OPTIONS`; `apply`, `symspec waive`, `import` all fold through it):
- refused waive: `FoldEntry { ok: false, code: 'ERR_WAIVER_REFUSED', error, suggestions }`; the
  atomic stream aborts and nothing is written; apply exits 1. `ERR_WAIVER_REFUSED` is a catalog code
  (`lookupCode`).
- a never-class code (FINDING_CLASS verdict, disclosure, triage, hygiene, anchor) is refused in every
  scope shape; the error names the code, its class and the word `never`.
- no `ref`/`refs` is refused for every code (the message names `refs`); `ref X` is normalized to
  `refs [X]`; a missing `contentHash` is computed; the stored waiver is always
  `{ code, requirementIds, contentHash, reason }`, never `requirementId` (R37).
- a code with no own FINDING_CLASS row (`FND_NOT_A_CODE`, `constructor`, `toString`,
  `hasOwnProperty`, `__proto__`, an unpublished `GTWR_R99_NOT_A_RULE`) and every case or whitespace
  variant of a never code is refused.
- import: refused waiver records are `refused[]` and `problems[]` on their line (detail names the
  finding code and the scope as written, suggestions give a replacement); an unresolvable `--ref` is
  refused, never widened; JSONL records accept `refs` + `contentHash`; import exits 1 and still writes
  the requirements.

Check side (`compat` decides what crosses; the engine is unchanged):
- `toEngineDoc(doc).waivers` holds only scoped-class waivers with `requirementIds` (a stored single
  `requirementId` + matching hash crosses as `requirementIds [id]`) and a matching hash, `textBound: true`.
- `data.diagnostics[]` entry per non-qualifying stored waiver:
  `{ kind: 'waiver-inert', severity: 'info', detail, waiver: <the stored waiver as stored>, ops }`.
  `ops[0]` is the exact unwaive for the stored scope (`ref` for `requirementId`, `refs` for
  `requirementIds`). Scoped class: then one `{ op: 'waive', code, refs, contentHash, reason }` per
  finding it matches today, `reason` = legacy reason + `RESCOPED_REASON_MARKER` (one exported string
  constant in `src/domain/compat.ts`). Never class: `detail` says `rewrite required`, no waive op.
  Refs that match no finding: `detail` says `matches no finding` (R38: plus a scoped waive per finding
  it suppressed at base; on the fixture that is none).
- `data.ignoredWaivers[]` (always present, `[]` when none), per stale-hash waiver of a scoped code:
  `{ code, requirementIds, storedHash, currentHash, reason, note, ops: [<unwaive>] }`, `note` says the
  text changed and must be re-reviewed (`re-review`); listed under any `minSeverity`/`findingsOnly`.
  A stale-hash waiver of a never code is waiver-inert instead.
- `data.appliedWaivers[]`: every waiver the engine applied, `{ code, requirementIds, reason }`.
- demotion `waived-blocking-lint` with the re-admitted ids (one row for all of them, R40).

Advice and prose: no repair op, demotion action, finding message, suggestion or catalog description of
a never-class code says `waive`; the excluded-from-formal remedy says rephrase first and, when it
offers the waive, offers `refs` + `contentHash` and says the run then demotes `waived-blocking-lint`
(R44; the round-trip tests pin that the waive IS offered); nothing names `vocab distinct`,
`propose-vocabulary` or `--rescope-waivers`; `scope.ts` drops "or waived" and gains one sentence that a
content hash binds the text, not the reviewer (R51: the exact sentence is now pinned in `scope.test.ts`
`FROZEN`; write it into `scope.ts` byte for byte);
the installed skill body drops the reviewed-waiver advice for opposition candidates;
`WAIVABILITY_ENFORCED` is true and "NOT enforced" is absent everywhere (run `pnpm gen:agents`).

## Harness changes (src/testing, the contract owns them)

- `KNOWN_ESCAPES`: the 11 `waive-by-code` rows are deleted; the move stays registered.
- new moves `waive-scoped-never` (scoped never-code waive per baseline finding) and `waive-raw` (the same
  waivers plus a code-only one per never code, written into the stored document with no fold; new edit
  kind `raw-waivers`); both inapplicable on fixtures whose seeded finding is scoped-class (R45).
  `OP_COVERAGE.waive` = `waive-by-code`, `waive-scoped-never`. `GamingWiring.waivability` is injected by
  every shard.
- `waived-blocking-lint`'s control is `{ none }` under R26/G3 (its consistent twin cannot be clean); the
  twin is `WAIVED_LINT_CONTROL_TWIN`, still a `report-corpus` row.
- The gaming shard and moves file snapshots (`__snapshots__/gaming-*.txt`) were NOT regenerated; they
  mismatch on base by the new move rows and the removed control row. The builder regenerates them
  and the report-corpus snapshot, and reviews every delta (S3-051).

## Earlier tests rewritten to the ruled outcome

- `src/app/operations/import.test.ts`: hex-bonk round trip `imports every side-table row` (waiver count
  split out) and `reports NO ... unreadable lines` (problems = refused lines) under R13; new
  `[S3-012] [S3-003] refuses every unscoped v4 waiver`; `resolves a waiver scope written as a KEY` ->
  `[S3-005] ... as refs [id] plus the hash` (R37); `WIDENS an unresolvable waiver scope` ->
  `[S3-013] REFUSES ...` (R13).
- `src/cli.test.ts`: `imports the agent-run-triggers stream` -> `[S3-012] ... refusing its 8 unscoped
  waivers (exit 1)` (R13).
- `src/app/operations/roundtrip.test.ts`: `discharges every demotion that carried OPS, and progress
  strictly improves` -> `[S3-033] ... trading excluded-from-formal for one waived-blocking-lint`; the
  fixed-point test -> `[S3-035] [S3-033] ... does NOT verify` (R26, G3).
- `src/app/operations/check.test.ts`: the numeric/relational and the opposition-candidate repair-waiver
  blocks -> `[S3-039] [S3-016] ...` (R2/D1, R15/D4, R29): no waive offered, a stored exact-pair waiver
  discharges nothing and is waiver-inert (the engine's "was not applied" note is no longer reached).
- `src/domain/compat.test.ts`: `preserves a committed waiver` -> `[S3-021]` (scoped + hash);
  `preserves a SCOPED waiver's requirementId` -> `[S3-018] [S3-020]`; the exact-set binding test ->
  `[S3-019]` on a wording code (R3, R16, R39).
- `src/app/operations/mutation.test.ts`: the waive dry-run and V27 cases now name `ref: 'G1'` (R5).
- `src/domain/advice/repair.test.ts`: five pair-repair tests -> `[S3-039] ...` (R29);
  `src/app/runtime/scope.test.ts`: `FROZEN.coverageDemotion` drops ", or waived" (R30).
- `src/testing/report-corpus.test.ts`: the gaming-control count adds the kept twin.

## Loop-back contract-2 (job 929): counts and lists the S3 additions move (R47-R50)

Build job 893 stopped on a contract gap: earlier tests pinned counts and lists that any correct S3
build moves. Rulings R47-R50 (coordinator, job 815) settle them; each re-pinned test now carries its
behavior id and ruling in its name and fails on base by assertion (15 tests, appended to
`contract-failing-on-base.txt`). The scan for further pins: a scratch clone with the four additions
simulated (an `ErrWaiverRefused` class appended to `ERR_CLASSES`, a `waived-blocking-lint` row in
`DEMOTION_CLASS`, `waiver-inert` appended to `DIAGNOSTIC_KINDS`, `ignoredWaivers: []` and
`appliedWaivers: []` on check's data) ran the whole suite: exactly 13 earlier tests went red, all
covered below, plus `agents-doc.test.ts` 'is byte-identical to a fresh render', which is the builder's
`pnpm gen:agents` and no pin. With the re-pinned tests copied in, README/package.json at 90 (R50) and
AGENTS.md regenerated, all 7 files pass (295 tests).

- R47 (S3-001), `ERR_WAIVER_REFUSED` is an `ERR_CLASSES` append, 24 ERR / 42 FND / 24 GTWR = 90:
  - `src/app/runtime/catalog.test.ts`: '[S3-001] holds exactly 24 ERR_* / 42 FND_* / 24 GTWR_* = 90 ...'
    (literal counts, plus `ERR` is not 23 and `ERR_WAIVER_REFUSED` resolves as family ERR);
    '[S3-001] resolves EVERY code ...' (length derived from `catalogCounts().total`, contains the
    append); '[S3-001] lists the families in order ...' (offsets derived from the family lists, the last
    two ERR rows are `ERR_CONFIG_INVALID`, `ERR_WAIVER_REFUSED`); '[S3-001] draws from all 90 code strings ...'.
  - `src/app/runtime/errors.test.ts`: `ERR_CODES_SNAPSHOT` gains `ERR_WAIVER_REFUSED` at index 23;
    '[S3-001] holds the 21 v4 codes plus the greenfield appends ...' (24, not 23, last is the append);
    '[S3-001] keeps every shipped code at its original index', '[S3-001] may only GROW ...',
    '[S3-001] matches the snapshot as a PREFIX ...', and the negative controls '[S3-001] passes on the
    real catalog', '[S3-001] passes on an APPEND ...' (red on base because base lacks the append). The
    removal, rename, reorder and prepend controls keep their names and stay green.
  - `src/app/operations/index.test.ts`: '[S3-001] resolves every code the MANIFEST publishes ...' (90,
    contains the append).
  - `src/app/runtime/agents-doc.test.ts`: describe renamed to 'every code is projected, in all three
    families' (no count in prose; its sibling tests keep their status); '[S3-001] names every code from
    every catalog: all 90, ERR_WAIVER_REFUSED included' (90, and the rendered doc names the code).
- R47 + R50 (S3-001): `src/publish.test.ts` new '[S3-001] README and package.json state the post-S3
  count, not the pre-S3 "89 stable codes"': derived positive half (`**${codeCount} stable codes**`,
  `${codeCount} stable codes`), the stale literal `89 stable codes` ABSENT from README.md and the
  description, and the manifest's ERR list contains the append. The two derived tests beside it are
  unchanged: they pass on base and go red after the build until the builder makes the R50 edit.
- R48 (S3-033): `src/app/runtime/signal-classes.test.ts` '[S3-033] pins every demotion reason with its
  class, waived-blocking-lint as coverage': the row `'waived-blocking-lint': 'coverage'`, drift false,
  the same class and drift as `excluded-from-formal`.
- R49 (S3-023): `src/domain/requirements/document.test.ts` '[S3-023] DIAGNOSTIC_KINDS, waiver-inert
  appended': `['unknown-top-level-key', 'sentence-drift', 'waiver-inert']`.


## Loop-back contract-3 (job 945): the scope corpus re-pin (R51) and the feasibility pass

Build job 935 stopped on a contract gap: `scope.test.ts` '[S3-042] matches the frozen corpus VERBATIM'
pinned `FROZEN.coverageDemotion` with no content-hash sentence, while '[S3-046] the published scope
says a content hash binds the text, not the reviewer' needs one in `scopeParagraphs()`.

- R51 (S3-042, S3-046): `FROZEN.coverageDemotion` ends with the ruled sentence, appended after
  "-> re-check -> exit 0.": "A waiver's content hash binds the text it was reviewed on, not the
  reviewer: any writer can mint a waiver whose hash matches, so a scoped waiver of a wording or
  structural finding records that the current text was accepted, not who accepted it." The ", or
  waived" clause stays out of FROZEN and the negative guard is kept. The builder writes the same
  coverageDemotion string into `src/app/runtime/scope.ts`. Test names are unchanged; on base the three
  scope tests stay red by assertion, as before.

Earlier tests a correct S3 build turns red, found by the feasibility simulation below and re-pinned
under the ruling they follow:

- R13 (S3-012): `src/cli.test.ts` 'import --dry-run reports everything and writes NOTHING' expected
  exit 0 on the agent-run-triggers stream, whose non-dry-run import R13 already pins at exit 1 (its 8
  code-only waivers are refused). Renamed '[S3-012] import --dry-run reports everything, refusing the
  8 unscoped waivers (exit 1), and writes NOTHING (R13)': exit 1, `written: false`, 25 requirements,
  `imported.waivers` 0, 8 problems naming `ERR_WAIVER_REFUSED`, no file. Red on base by assertion
  (`expected +0 to be 1`); appended to `contract-failing-on-base.txt` (163 -> 164).
- R10 (S3-009): `src/app/operations/import.test.ts` 'writes the side tables EXACTLY as `apply` folds
  the same records' waived the bare prefix `GTWR_R6`, which is no published code, so the S3 fold under
  `MUTATE_OPTIONS` refuses it and the parity test would fail on `abortedAt`. It now waives the published
  `GTWR_R6_MISSING_UNITS` and asserts exactly one folded waiver (not vacuous). Name unchanged; it is a
  parity guard and passes on base and under the simulation.

Feasibility simulation (scratch clone of 2c71aa9 plus these test edits, never committed): the fold
refuses a never-class, unpublished or code-only waive and normalizes `ref` to `refs` + hash, gated by
a flag only `MUTATE_OPTIONS` carries; `toEngineDoc` forwards only scoped-class waivers with ids and a
matching hash; `WAIVABILITY_ENFORCED` true; `scope.ts` per R30 + R51; README's honest-scope quote
updated; `pnpm gen:agents`. Full vitest: 3491 tests, 113 failed. Every failure is either a test in
`contract-failing-on-base.txt` that needs product work the simulation did not do (111), the simulation's
own domain -> app import (`package-boundary.test.ts`, the real build moves the class table into a
domain module), or `report-corpus.test.ts` '[S3-039] every repair op decodes and folds' (repair advice
still offers never-code waives until the builder changes `repair.ts`). 52 contract tests already pass.
Without the README quote edit, `publish.test.ts` 'quotes EVERY scope claim verbatim' fails (see below).

Constraints the builder must respect (each measured or read, none a test edit):
- Waive refusal and `ref` normalization go behind a `MutateOptions` hook that `MUTATE_OPTIONS`
  supplies, not into the bare `applyWaive`: ungated (first simulation run), 7 `mutate.test.ts`
  side-table tests and the V27 reachability guard ('`waive` preserves the whole state model') went red;
  the S3-016 block in `check.test.ts` also stores its legacy waivers through the bare `foldOps`.
- The classifier needs an own-row lookup (`Object.hasOwn`) and `GTWR_CODES` membership: the current
  `findingClassOf` maps any `GTWR_` prefix to wording (S3-009, `GTWR_R99_NOT_A_RULE`).
- `waived-blocking-lint` stays out of the engine's `CoverageDemotion['reason']` union:
  `src/domain/advice/repair.test.ts:211` types `REASONS` as `Record<CoverageDemotion['reason'], true>`
  without it, and test files are type-checked. Widen `AppDemotionReason` instead (R48).
- `waived-blocking-lint` carries no repair ops (roundtrip's fixed-point loop), and follows the
  existing fewer-than-two-requirements vacuity: base emits no coverage demotion on a one-requirement
  document, and the S3-036 formula reads `excluded-from-formal` demotions. If the build emitted it on a
  one-requirement document, the shard f rows `waived-blocking-lint × delete-requirement@first/@second`
  in `KNOWN_ESCAPES` (gaming.ts:1911, :1931) would stop escaping and '[S3-048] every KNOWN_ESCAPES row
  still escapes' would fail.

Open for the coordinator (not fixable in the contract role):
- `src/publish.test.ts` 'quotes EVERY scope claim verbatim, and nothing else, as the section says'
  (green on base) requires README.md's '## Honest scope' blockquotes to equal `scopeParagraphs()`. After
  R30 and R51 the coverageDemotion quote (README.md:829-849 at 2c71aa9) must drop ", or waived" and gain the R51
  sentence, but R50 lets the builder change only the code count in README.md. Needs a ruling that lets
  the builder update that blockquote to quote `scope.ts` verbatim.
- README.md:386-403 and :444 still show and recommend a waive of FND_QUANTITY_ALIAS_CANDIDATE (a
  disclosure, never class). No test reads that prose; after S3 it teaches an op the fold refuses.

## Not pinned by a vitest test

- S3-051: a test cannot attribute a snapshot delta to AC-5-6 without the regenerated snapshot; a person
  reviews the report-corpus diff row by row.
- S3-052, S3-053: properties of the build commit and the version files over the commit range (commit
  gate and receipt), not of the code; a vitest assertion on `package.json`'s version would break the
  release PR.
- S3-031's first clause (the engine diff is prose only) is a diff property for review; its second
  clause is pinned.
- S3-038's base half: R43 asserts the code-only waiver verifies at base on a CAB+TNK document. Measured:
  it does not (`PAIR_BOUND_CODES` declines a code-only opposition waiver; the CAB and TNK pairs demote
  at base, verified false). The test pins the S3 half on that document; red on base comes from the
  write half (base accepts the waive) and the missing waiver-inert diagnostic.

## Behavior -> tests

### S3-001 — The fold refuses a waive of any never-class code (verdict, disclosure, triage, hygiene, anchor), whatever its scope and hash, with ERR_WAIVER_REFUSED
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-001] [S3-011] symspec waive FND_CONTRADICTION --ref ORD-R1 is refused ERR_WAIVER_REFUSED, naming the code and its class, exit 1, file untouched — FAILS on base
- `src/app/operations/check.test.ts` — [S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing [S3-001] the fold under MUTATE_OPTIONS refuses the waive the base tool offered — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-001] measures every never class the catalog publishes: verdict, disclosure, triage, hygiene (and anchor once a code has it) — passes on base (regression)
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-001] every never-class code is refused ERR_WAIVER_REFUSED in every scope shape, and nothing is written — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-001] the readings’ never streams are refused on their waive op: repro-scoped, repro-single-ref, never-verdict, never-hygiene — FAILS on base

### S3-002 — A refused waive aborts the whole atomic stream: nothing is written, the document is byte-identical, exit 1
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-002] apply repro-code-only: the refused waive aborts the stream, exit 1, nothing written, the file byte-identical — FAILS on base
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-002] apply never-verdict: the refused waive aborts the stream, exit 1, nothing written, the file byte-identical — FAILS on base
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-002] apply lint-code-only: the refused waive aborts the stream, exit 1, nothing written, the file byte-identical — FAILS on base
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-002] apply structural-cycle-code-only: the refused waive aborts the stream, exit 1, nothing written, the file byte-identical — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-002] a refused waive aborts the whole atomic stream: write false, the document returned is the input, untouched — FAILS on base

### S3-003 — The fold refuses a code-only waive of every code, scoped classes included, through apply and symspec waive
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-003] symspec waive GTWR_R5_INDEFINITE_ARTICLE with no --ref is refused ERR_WAIVER_REFUSED, file untouched — FAILS on base
- `src/app/operations/import.test.ts` — round trip: hex-bonk 'agent-run-triggers' [S3-012] [S3-003] refuses every unscoped v4 waiver the source carried with ERR_WAIVER_REFUSED, on its line, and imports no waiver — FAILS on base
- `src/app/operations/import.test.ts` — round trip: hex-bonk 'schedule-management' [S3-012] [S3-003] refuses every unscoped v4 waiver the source carried with ERR_WAIVER_REFUSED, on its line, and imports no waiver — passes on base (regression)
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-003] a code-only waive is refused for every published code, scoped classes included — FAILS on base

### S3-004 — A refs plus matching contentHash waive of a scoped-class code is accepted and stored as requirementIds plus that hash
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-004] a refs + matching contentHash waive of every scoped-class code is accepted and stored as requirementIds plus that hash — passes on base (regression)

### S3-005 — A waive op with refs but no contentHash, or a single ref, is accepted through apply, symspec waive and import: ref is normalized to refs [ref], the fold computes the contentHash from the current text, and the stored waiver always has refs and a contentHash
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-005] [S3-006] symspec waive GTWR_R5_INDEFINITE_ARTICLE --ref LOG-R1 keeps working: stored as requirementIds [LOG-R1] plus the hash of its text — FAILS on base
- `src/app/operations/import.test.ts` — fold semantics [S3-005] resolves a waiver scope written as a KEY into the stored UUID, as refs [id] plus the hash of its text — FAILS on base
- `src/app/operations/import.test.ts` — S3: import refuses the waivers apply refuses (readings settled examples 14 and 15) [S3-012] [S3-005] v4-waivers.txt: I2 and I6 are accepted as refs [id] plus the computed hash (imported.waivers 2) — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-005] refs with no contentHash, or a single ref, is accepted for every scoped code: ref becomes refs [ref] and the fold computes the hash — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-005] the readings’ streams: lint-single-ref stores refs [LOG-R1] + sha256:fd8b2c50…, structural-cycle-scoped stores the computed cycle hash — FAILS on base

### S3-006 — No waiver is ever stored as requirementId without a contentHash
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-005] [S3-006] symspec waive GTWR_R5_INDEFINITE_ARTICLE --ref LOG-R1 keeps working: stored as requirementIds [LOG-R1] plus the hash of its text — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-006] no accepted waive ever stores requirementId, and every stored waiver carries a contentHash — FAILS on base

### S3-007 — A waive whose refs equal no finding's set is accepted at write and suppresses no finding at check
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-007] [S3-022] lint-wrong-set suppresses neither GTWR_R5 finding and is disclosed as waiver-inert (matches no finding) with its unwaive op only — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-007] lint-wrong-set (refs [LOG-R1, LOG-R2] + sha256:716cbd99…) is accepted at write and stored as written — passes on base (regression)

### S3-008 — A supplied contentHash that differs from the current text is refused with ERR_USAGE, as at base, and nothing is written
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-008] lint-hash-mismatch: the waive whose contentHash differs from the current text is refused ERR_USAGE, not ERR_WAIVER_REFUSED, and nothing is written — passes on base (regression)

### S3-009 — A code with no own FINDING_CLASS row is refused at write and inert at check, and every published code has its own row
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-009] [S3-010] [S3-030] a stored waiver of an unclassified code, or a case or whitespace variant of a never code, never reaches the engine, even scoped and hash-bound — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-009] [S3-017] a stored waiver of a code with no own FINDING_CLASS row (constructor) is inert and disclosed — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-009] a code with no own FINDING_CLASS row is refused ERR_WAIVER_REFUSED, even fully scoped — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-009] every finding code the catalog publishes has its own FINDING_CLASS row (GTWR_* through the GTWR row) — passes on base (regression)

### S3-010 — Every case or whitespace variant of a never code is refused at write, inert at check and suppresses nothing
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-009] [S3-010] [S3-030] a stored waiver of an unclassified code, or a case or whitespace variant of a never code, never reaches the engine, even scoped and hash-bound — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-010] [S3-030] case and whitespace variants of FND_CONTRADICTION written raw suppress nothing, are inert and disclosed — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-010] every case or whitespace variant of every never code is refused at write — FAILS on base

### S3-011 — A refusal names the code and its never class, or the missing refs and hash, and names only commands this build has
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-001] [S3-011] symspec waive FND_CONTRADICTION --ref ORD-R1 is refused ERR_WAIVER_REFUSED, naming the code and its class, exit 1, file untouched — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-011] a never-code refusal names the code, its class and that it is never waivable — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-011] a code-only refusal says the waive must name the requirement ids (refs) — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-011] a refusal names only commands this build has, never vocab distinct or propose-vocabulary --rescope-waivers — FAILS on base

### S3-012 — Import folds every waiver record through apply's classifier: refused records go to problems[] with ERR_WAIVER_REFUSED, the requirements are written, and import exits 1
- `src/cli.test.ts` — the document lifecycle end to end [S3-012] imports the agent-run-triggers stream from --file, with exact counts, refusing its 8 unscoped waivers (exit 1) — FAILS on base
- `src/cli.test.ts` — the document lifecycle end to end [S3-012] import --dry-run reports everything, refusing the 8 unscoped waivers (exit 1), and writes NOTHING (R13) — FAILS on base
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-012] [S3-013] import v4-waivers.txt writes the six requirements, refuses I1, I3, I4 and I5 into problems[], and exits 1 — FAILS on base
- `src/app/operations/import.test.ts` — round trip: hex-bonk 'agent-run-triggers' [S3-012] [S3-003] refuses every unscoped v4 waiver the source carried with ERR_WAIVER_REFUSED, on its line, and imports no waiver — FAILS on base
- `src/app/operations/import.test.ts` — round trip: hex-bonk 'schedule-management' [S3-012] [S3-003] refuses every unscoped v4 waiver the source carried with ERR_WAIVER_REFUSED, on its line, and imports no waiver — passes on base (regression)
- `src/app/operations/import.test.ts` — S3: import refuses the waivers apply refuses (readings settled examples 14 and 15) [S3-012] v4-waivers.txt: I1 (code-only), I3 and I5 (never class) are refused ERR_WAIVER_REFUSED into problems[], and the six requirements are written — FAILS on base
- `src/app/operations/import.test.ts` — S3: import refuses the waivers apply refuses (readings settled examples 14 and 15) [S3-012] [S3-005] v4-waivers.txt: I2 and I6 are accepted as refs [id] plus the computed hash (imported.waivers 2) — FAILS on base
- `src/app/operations/import.test.ts` — S3: import refuses the waivers apply refuses (readings settled examples 14 and 15) [S3-012] import folds waivers exactly as apply does: each record refused or stored the same way under MUTATE_OPTIONS — FAILS on base

### S3-013 — An unresolvable import --ref is refused and never widened to a document-wide waiver
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-012] [S3-013] import v4-waivers.txt writes the six requirements, refuses I1, I3, I4 and I5 into problems[], and exits 1 — FAILS on base
- `src/app/operations/import.test.ts` — fold semantics [S3-013] REFUSES an unresolvable waiver scope and never widens it to a document-wide waiver — FAILS on base
- `src/app/operations/import.test.ts` — S3: import refuses the waivers apply refuses (readings settled examples 14 and 15) [S3-013] v4-waivers.txt: I4, whose --ref matches no requirement, is refused and never widened to a document-wide GTWR_R7_VAGUE waiver — FAILS on base

### S3-014 — Import accepts a JSONL waive record in the refs plus contentHash form apply accepts
- `src/app/operations/import.test.ts` — S3: import refuses the waivers apply refuses (readings settled examples 14 and 15) [S3-014] scoped-record.txt: a JSONL waive record with refs and contentHash is accepted (no unexpected-keys problem) and stored as requirementIds [LOG-R1] plus that hash — FAILS on base

### S3-015 — Each waiver import refuses is named with its line, code, scope and replacement
- `src/app/operations/import.test.ts` — S3: import refuses the waivers apply refuses (readings settled examples 14 and 15) [S3-015] each refused waiver is named with its line, its finding code, its scope as written and a replacement, and no remedy this build lacks — FAILS on base

### S3-016 — A stored never-class waiver is inert whatever its scope and hash, disclosed once as waiver-inert, and the run equals the document with it deleted
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-016] [S3-030] a stored never-class waiver never reaches the engine, in any stored scope shape, hash or not — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-016] each stored never-class waiver has exactly one waiver-inert diagnostic, and the run equals the document with that waiver deleted — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-016] never-verdict.stored reports FND_CONTRADICTION (error) on ORD-R1, ORD-R2 again — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-016] a stale-hash waiver of a never code is disclosed once, as waiver-inert, and not in ignoredWaivers — FAILS on base
- `src/app/operations/check.test.ts` — [S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing [S3-039] offers no waive op on either demotion — FAILS on base
- `src/app/operations/check.test.ts` — [S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing [S3-016] a pair triaged under the base tool is no longer discharged: both demotions stand and both waivers are inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing [S3-001] the fold under MUTATE_OPTIONS refuses the waive the base tool offered — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-039] offers no waive op, only the edits that decide the pair — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-040] the demotion action never instructs or offers a waiver — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] a pair triaged under the base tool is no longer discharged, and its waiver is disclosed inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (1) does not discharge a pair a third requirement forms with the negated side — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (1) does not discharge a pair a third requirement forms with the asserted side — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (2) triaging three pairs of a four-cycle leaves all four demoting — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] a one-id ref waiver (the base repair op) leaves the candidate demoting, and is disclosed waiver-inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] a document-wide waiver (the base action) leaves the candidate demoting, and is disclosed waiver-inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] an exact-set waiver with no content hash leaves the candidate demoting, and is disclosed waiver-inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it U-ref: a ref waiver for one triaged candidate does not reach a pair added after it — passes on base (regression)
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (4) does not discharge the pair once one side is edited — passes on base (regression)

### S3-017 — A stored code-only waiver of any code, an unknown code included, is inert and disclosed
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-017] [S3-030] a stored code-only waiver of every code, an unknown code included, never reaches the engine — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-017] lint-code-only.stored, structural-cycle-code-only.stored, hand-unknown-code and legacy-mixed W1 are inert, and all four GTWR_R5 findings (or FND_CYCLE [CYC-A, CYC-B]) come back — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-009] [S3-017] a stored waiver of a code with no own FINDING_CLASS row (constructor) is inert and disclosed — FAILS on base

### S3-018 — A stored single requirementId waiver with no hash is inert, even when it names the finding's one requirement
- `src/domain/compat.test.ts` — compat — every projected field the tier reads [S3-018] [S3-020] keeps a one-requirement waiver only bound to its text, as the exact set [id] — FAILS on base
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-018] [S3-019] [S3-030] a stored single requirementId with no hash, or requirementIds with no hash, never reaches the engine, for every scoped code — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-018] lint-single-ref.stored and legacy-mixed W2 are inert though each names the finding’s one requirement, and the finding comes back — FAILS on base

### S3-019 — A stored requirementIds waiver with no contentHash is inert
- `src/domain/compat.test.ts` — compat — every projected field the tier reads [S3-019] carries an exact-set waiver while its reviewed text is unchanged, and drops it after — FAILS on base
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-018] [S3-019] [S3-030] a stored single requirementId with no hash, or requirementIds with no hash, never reaches the engine, for every scoped code — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-019] hand-refs-no-hash (requirementIds [LOG-R1], no hash) is inert, and GTWR_R5 on LOG-R1 comes back — FAILS on base

### S3-020 — A stored single requirementId with a matching contentHash qualifies as refs [id] plus that hash: it suppresses exactly its finding, with no diagnostic
- `src/domain/compat.test.ts` — compat — every projected field the tier reads [S3-018] [S3-020] keeps a one-requirement waiver only bound to its text, as the exact set [id] — FAILS on base
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-020] [S3-021] a stored scoped-class waiver with refs (or one requirementId) and the matching hash reaches the engine, as an exact set bound to the text — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-020] hand-ref-with-hash (one requirementId plus the matching hash) qualifies: GTWR_R5 on LOG-R1 stays suppressed, with no diagnostic — passes on base (regression)

### S3-021 — A stored refs plus matching hash waiver of a scoped code qualifies and suppresses exactly its finding, with no diagnostic
- `src/domain/compat.test.ts` — compat — every projected field the tier reads [S3-021] preserves a committed scoped waiver, so a reviewed baseline stays suppressed — passes on base (regression)
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-020] [S3-021] a stored scoped-class waiver with refs (or one requirementId) and the matching hash reaches the engine, as an exact set bound to the text — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-021] lint-scoped, lint-refs-no-hash, structural-cycle-scoped and legacy-mixed W4 qualify: each suppresses exactly its finding, with no diagnostic about it — passes on base (regression)

### S3-022 — A stored waiver whose refs match no finding's id set suppresses nothing and is disclosed as waiver-inert (matches no finding) with its unwaive op, plus one scoped waive refs+current hash per finding it suppressed at base (unwaive only when it suppressed nothing at base)
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-007] [S3-022] lint-wrong-set suppresses neither GTWR_R5 finding and is disclosed as waiver-inert (matches no finding) with its unwaive op only — FAILS on base

### S3-023 — waiver-inert is an info data.diagnostics entry that demotes nothing; deleting an inert waiver changes no finding, demotion or verified
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-023] waiver-inert is an info data.diagnostics entry that demotes nothing — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-023] [S3-036] deleting any inert waiver from any fixture document leaves findings, demotions and verified unchanged — FAILS on base

### S3-024 — For a scoped code, waiver-inert carries the exact unwaive op plus one scoped waive refs plus current contentHash per finding it matches today
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-024] [S3-026] lint-code-only.stored: unwaive plus one scoped waive refs + current hash per finding, carrying the legacy reason and the provenance marker — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-024] lint-single-ref.stored and hand-refs-no-hash get unwaive plus waive [LOG-R1] sha256:fd8b2c50…; structural-cycle-code-only gets [CYC-A, CYC-B] sha256:b889a619… — FAILS on base

### S3-025 — For a never code, waiver-inert carries the unwaive op and rewrite required, and no waive op
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-025] [S3-045] a never-code waiver-inert carries the unwaive op and "rewrite required", no waive op, and names no vocab distinct or --rescope-waivers — FAILS on base

### S3-026 — A replacement scoped waive op carries the legacy reason verbatim followed by one exported fixed provenance marker
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-024] [S3-026] lint-code-only.stored: unwaive plus one scoped waive refs + current hash per finding, carrying the legacy reason and the provenance marker — FAILS on base

### S3-027 — Every replacement op decodes and folds under MUTATE_OPTIONS on the checked document, and every named command parses under this build's CLI
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-027] every op on every waiver-inert and ignoredWaivers entry decodes and folds under MUTATE_OPTIONS on the checked document, and every command named parses under this build — FAILS on base

### S3-028 — A stale-hash waiver brings its finding back and is listed once in data.ignoredWaivers with code, ids, stored and current hash under any output filter
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-028] lint-stale-hash.stored: GTWR_R5 on LOG-R1 is back and data.ignoredWaivers lists the waiver once with its code, ids, stored and current hash, and no waiver-inert — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-028] the stale-hash entry is listed under any output filter — FAILS on base

### S3-029 — A data.ignoredWaivers (stale hash) entry carries its unwaive op and a note that the requirement's text changed since review and must be re-reviewed, and no waive op at the new hash
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-029] the stale-hash entry carries its unwaive op and a note that the text changed and must be re-reviewed, and no waive at the new hash — FAILS on base

### S3-030 — No stored waiver the S3 fold would refuse as an op reaches the engine
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-016] [S3-030] a stored never-class waiver never reaches the engine, in any stored scope shape, hash or not — FAILS on base
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-017] [S3-030] a stored code-only waiver of every code, an unknown code included, never reaches the engine — FAILS on base
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-018] [S3-019] [S3-030] a stored single requirementId with no hash, or requirementIds with no hash, never reaches the engine, for every scoped code — FAILS on base
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-009] [S3-010] [S3-030] a stored waiver of an unclassified code, or a case or whitespace variant of a never code, never reaches the engine, even scoped and hash-bound — FAILS on base
- `src/domain/compat.test.ts` — S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op [S3-030] the check-time twin: every stored waiver compat forwards is one the S3 fold accepts as the same op on the same document — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-010] [S3-030] case and whitespace variants of FND_CONTRADICTION written raw suppress nothing, are inert and disclosed — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-030] a stored never-class waiver over the exact ids and current hash suppresses nothing at check: blocking-lint-both plus a raw FND_CONTRADICTION waiver still reports the contradiction — FAILS on base

### S3-031 — The engine-tier diff is prose only, and the engine still declines a stored code-only FND_OPPOSITION_CANDIDATE waiver
- `src/testing/engine-waivers-s3.test.ts` — S3 engine tier: unchanged waiver logic [S3-031] the engine still declines a code-only (and a one-ref) FND_OPPOSITION_CANDIDATE waiver handed to it directly: the CAB pair keeps demoting — passes on base (regression)

### S3-032 — isWaivedBlocking re-admits a requirement exactly when isWaived suppresses its blocking finding
- `src/testing/engine-waivers-s3.test.ts` — S3 engine tier: unchanged waiver logic [S3-032] isWaivedBlocking re-admits a requirement exactly when isWaived suppresses its blocking finding, for every waiver shape over the ORD pair — passes on base (regression)

### S3-033 — A waived blocking lint re-admits its requirement and demotes waived-blocking-lint naming it
- `src/app/operations/check-waivers.test.ts` — S3: a waived blocking lint still demotes (waived-blocking-lint, G3) [S3-033] blocking-lint-one.stored: waived-blocking-lint [ORD-R1], uncovered-requirement [ORD-R1], excluded-from-formal [ORD-R2], open-opposition-candidate [CAB-R1, CAB-R2]; verified false — FAILS on base
- `src/app/operations/roundtrip.test.ts` — AC-A-1 + AC-A-2 — check → apply the repairs → check again [S3-033] discharges every demotion that carried OPS, trading excluded-from-formal for one waived-blocking-lint — FAILS on base
- `src/app/operations/roundtrip.test.ts` — AC-A-1 + AC-A-2 — check → apply the repairs → check again [S3-035] [S3-033] reaching the FIXED POINT re-admits the blocked requirement but does NOT verify: the waived blocking lint demotes waived-blocking-lint — FAILS on base

### S3-034 — blocking-lint-both keeps its FND_CONTRADICTION error and verified false, gives one waived-blocking-lint demotion naming ORD-R1 and ORD-R2, and exits 1, because the error sets the exit before any demotion
- `src/cli.test.ts` — S3: waive, apply and import refuse never-class and unscoped waivers through the CLI [S3-034] check --strict on blocking-lint-both.stored exits 1: the FND_CONTRADICTION error sets the exit before any demotion — passes on base (regression)
- `src/app/operations/check-waivers.test.ts` — S3: a waived blocking lint still demotes (waived-blocking-lint, G3) [S3-034] blocking-lint-both.stored --strict: FND_CONTRADICTION (error), ONE waived-blocking-lint demotion naming ORD-R1 and ORD-R2, verified false, exit 1 — FAILS on base

### S3-035 — A waived blocking lint never yields verified true, even on a consistent pair, and --strict exits 3 when it is the only failure
- `src/app/operations/check-waivers.test.ts` — S3: a waived blocking lint still demotes (waived-blocking-lint, G3) [S3-035] the gaming waived-blocking-lint control twin (consistent, verified at base) gives verified false, and --strict exits 3 on the demotion alone — FAILS on base
- `src/app/operations/roundtrip.test.ts` — AC-A-1 + AC-A-2 — check → apply the repairs → check again [S3-035] [S3-033] reaching the FIXED POINT re-admits the blocked requirement but does NOT verify: the waived blocking lint demotes waived-blocking-lint — FAILS on base

### S3-036 — The waived-blocking-lint set is the no-waiver excluded set minus the set under exactly toEngineDoc's waivers; no waivers equals base
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-023] [S3-036] deleting any inert waiver from any fixture document leaves findings, demotions and verified unchanged — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3: a waived blocking lint still demotes (waived-blocking-lint, G3) [S3-036] the waived-blocking-lint ids are the requirements excluded with no waivers minus those excluded under the waivers compat forwarded — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3: a waived blocking lint still demotes (waived-blocking-lint, G3) [S3-036] adding an inert (code-only) or a stale GTWR_R7_VAGUE waiver to blocking-lint-one leaves the demotions unchanged — FAILS on base

### S3-037 — The AC-5-6 reproducer: the opposition waive is refused, the un-waived CAB and TNK pairs demote separately, and the stored reproducer's waiver is inert
- `src/app/operations/check-waivers.test.ts` — S3: the AC-5-6 reproducer [S3-037] repro-code-only.stored: the waiver is inert, with one diagnostic; the CAB and TNK pairs demote separately and FND_OPPOSITION_CANDIDATE stands on both — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3: the AC-5-6 reproducer [S3-037] repro-scoped.stored and repro-single-ref.stored are inert too, and the CAB finding and demotion come back — FAILS on base

### S3-038 — The reproducer is red on base on a minimal CAB+TNK document with the fixture embedder: at base the code-only FND_OPPOSITION_CANDIDATE waive is accepted and check returns verified: true; with S3 the waive is refused, the stored waiver is inert and the CAB and TNK pairs demote; the write-half assertion stays and AC-5-6 is not amended
- `src/app/operations/check-waivers.test.ts` — S3: the AC-5-6 reproducer [S3-038] the minimal CAB+TNK reproducer, write half: the code-only FND_OPPOSITION_CANDIDATE waive is refused ERR_WAIVER_REFUSED and nothing is written — FAILS on base
- `src/app/operations/check-waivers.test.ts` — S3: the AC-5-6 reproducer [S3-038] the minimal CAB+TNK reproducer, check half: the stored code-only waiver is inert and disclosed, and the CAB and TNK pairs demote; verified false — FAILS on base

### S3-039 — Every repair.ops op decodes and the S3 fold accepts it, and no offered waive names a never code
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] runs every corpus document and every S3 fixture document — passes on base (regression)
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] every repair op decodes and folds under MUTATE_OPTIONS on the checked document — passes on base (regression)
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] no offered waive op names a never-class code — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-040] no finding message or suggestion for a never-class code says "waive" — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-040] no demotion action for a never-class code says "waive" — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-045] no string anywhere in a payload names vocab distinct, propose-vocabulary or --rescope-waivers — passes on base (regression)
- `src/app/operations/check.test.ts` — [S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing [S3-039] offers no waive op on either demotion — FAILS on base
- `src/app/operations/check.test.ts` — [S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing [S3-016] a pair triaged under the base tool is no longer discharged: both demotions stand and both waivers are inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing [S3-001] the fold under MUTATE_OPTIONS refuses the waive the base tool offered — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-039] offers no waive op, only the edits that decide the pair — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-040] the demotion action never instructs or offers a waiver — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] a pair triaged under the base tool is no longer discharged, and its waiver is disclosed inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (1) does not discharge a pair a third requirement forms with the negated side — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (1) does not discharge a pair a third requirement forms with the asserted side — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (2) triaging three pairs of a four-cycle leaves all four demoting — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] a one-id ref waiver (the base repair op) leaves the candidate demoting, and is disclosed waiver-inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] a document-wide waiver (the base action) leaves the candidate demoting, and is disclosed waiver-inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] an exact-set waiver with no content hash leaves the candidate demoting, and is disclosed waiver-inert — FAILS on base
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it U-ref: a ref waiver for one triaged candidate does not reach a pair added after it — passes on base (regression)
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-016] (4) does not discharge the pair once one side is edited — passes on base (regression)
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] opposite-polarity-near-duplicate: the repair offers no waive of its never-class code, so no pair is discharged — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] open-opposition-candidate: the repair offers no waive of its never-class code, so no pair is discharged — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] quantity-alias-candidate: the repair offers no waive of its never-class code, so no pair is discharged — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] relational-reasoning-not-attempted: the repair offers no waive of its never-class code, so no pair is discharged — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] numeric-bounds-uncompared: the repair offers no waive of its never-class code, so no pair is discharged — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] number-spelling-candidate: the repair offers no waive of its never-class code, so no pair is discharged — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] relational-reasoning-not-attempted: no waive op, not even one over the exact set and its content hash — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] numeric-bounds-uncompared: no waive op, not even one over the exact set and its content hash — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] number-spelling-candidate: no waive op, not even one over the exact set and its content hash — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] open-opposition-candidate: no waive op, not even one over the exact set and its content hash — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] opposite-polarity-near-duplicate: no waive op, not even one over the exact set and its content hash — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] quantity-alias-candidate: no waive op, not even one over the exact set and its content hash — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] relational-reasoning-not-attempted: no repair op reaches the pair or a cluster that grew — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] numeric-bounds-uncompared: no repair op reaches the pair or a cluster that grew — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] number-spelling-candidate: no repair op reaches the pair or a cluster that grew — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] open-opposition-candidate: no repair op reaches the pair or a cluster that grew — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] opposite-polarity-near-duplicate: no repair op reaches the pair or a cluster that grew — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] quantity-alias-candidate: no repair op reaches the pair or a cluster that grew — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] relational-reasoning-not-attempted: in a four-cycle, no repair op discharges any pair — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] numeric-bounds-uncompared: in a four-cycle, no repair op discharges any pair — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] number-spelling-candidate: in a four-cycle, no repair op discharges any pair — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] open-opposition-candidate: in a four-cycle, no repair op discharges any pair — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] opposite-polarity-near-duplicate: in a four-cycle, no repair op discharges any pair — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] quantity-alias-candidate: in a four-cycle, no repair op discharges any pair — FAILS on base
- `src/domain/advice/repair.test.ts` — a pair demotion repair is scoped to its own pair [S3-039] offers no waive that reaches its pair or a SIBLING pair sharing an id — FAILS on base

### S3-040 — No demotion action, finding message or suggestion for a never code contains waive, at every engine site
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] runs every corpus document and every S3 fixture document — passes on base (regression)
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] every repair op decodes and folds under MUTATE_OPTIONS on the checked document — passes on base (regression)
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] no offered waive op names a never-class code — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-040] no finding message or suggestion for a never-class code says "waive" — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-040] no demotion action for a never-class code says "waive" — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-045] no string anywhere in a payload names vocab distinct, propose-vocabulary or --rescope-waivers — passes on base (regression)
- `src/app/operations/check.test.ts` — [S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it [S3-040] the demotion action never instructs or offers a waiver — FAILS on base
- `src/app/operations/waive-fold.test.ts` — S3 write half: the fold refuses never-class and unscoped waivers [S3-040] no catalog row (explain, the manifest, AGENTS.md) of a never-class code advises a waiver — FAILS on base
- `src/domain/advice/repair.test.ts` — [S3-040] the engine never advises a waiver of a never-class code (static) [S3-040] the extractor reads string literals and skips comments — passes on base (regression)
- `src/domain/advice/repair.test.ts` — [S3-040] the engine never advises a waiver of a never-class code (static) [S3-040] <file> emits only never-class codes (x5) — passes on base (regression)
- `src/domain/advice/repair.test.ts` — [S3-040] the engine never advises a waiver of a never-class code (static) [S3-040] <file>: no string literal says "waive" (x5) — 4/5 fail on base
- `src/domain/advice/repair.test.ts` — [S3-040] the engine never advises a waiver of a never-class code (static) [S3-040] pipeline/check.ts: no never-code demotion action spells a waiver — FAILS on base

### S3-041 — For a requirement excluded from the formal tier by a blocking scoped-class lint, the remedy offers rephrasing first and may offer the scoped waive refs+hash second, then saying the waiver re-admits it to the solver but demotes waived-blocking-lint, so the run cannot verify
- `src/domain/advice/repair.test.ts` — [S3-041] the excluded-from-formal remedy for a blocking scoped lint [S3-041] the fixture premise: ORD-R1 is blocked by GTWR_R7_VAGUE, a scoped code — passes on base (regression)
- `src/domain/advice/repair.test.ts` — [S3-041] the excluded-from-formal remedy for a blocking scoped lint [S3-041] the action offers rephrasing first, before any waiver — passes on base (regression)
- `src/domain/advice/repair.test.ts` — [S3-041] the excluded-from-formal remedy for a blocking scoped lint [S3-041] any offered waive is refs plus the current content hash, never a single ref — FAILS on base
- `src/domain/advice/repair.test.ts` — [S3-041] the excluded-from-formal remedy for a blocking scoped lint [S3-041] an offered waiver says it demotes waived-blocking-lint, so the run cannot verify — FAILS on base
- `src/domain/advice/repair.test.ts` — [S3-041] the excluded-from-formal remedy for a blocking scoped lint [S3-041] the action spells no single-ref `symspec waive <blocking-code> --ref` syntax — FAILS on base

### S3-042 — scope.ts coverageDemotion does not say or waived, and check:agents shows no drift
- `src/app/runtime/scope.test.ts` — the scope corpus is pinned, claim by claim [S3-042] matches the frozen corpus VERBATIM, claim by claim — FAILS on base
- `src/app/runtime/scope.test.ts` — [S3-042][S3-046] the scope says what a waiver can and cannot do [S3-042] coverageDemotion no longer counts a waived opposition candidate as triaged — FAILS on base
- `src/app/runtime/scope.test.ts` — [S3-042][S3-046] the scope says what a waiver can and cannot do [S3-046] the published scope says a content hash binds the text, not the reviewer — FAILS on base

### S3-043 — The installed skill body offers no waiver for FND_OPPOSITION_CANDIDATE or any other never code
- `src/app/runtime/craft.test.ts` — [S3-043] the skill body offers no waiver for a never-class code [S3-043] installed skill body: the "always-safe reviewed waiver" advice is gone — FAILS on base
- `src/app/runtime/craft.test.ts` — [S3-043] the skill body offers no waiver for a never-class code [S3-043] craft at depth 3 (AGENTS.md): the "always-safe reviewed waiver" advice is gone — FAILS on base
- `src/app/runtime/craft.test.ts` — [S3-043] the skill body offers no waiver for a never-class code [S3-043] installed skill body: no paragraph naming FND_OPPOSITION_CANDIDATE offers a waiver — FAILS on base
- `src/app/runtime/craft.test.ts` — [S3-043] the skill body offers no waiver for a never-class code [S3-043] craft at depth 3 (AGENTS.md): no paragraph naming FND_OPPOSITION_CANDIDATE offers a waiver — FAILS on base
- `src/app/runtime/craft.test.ts` — [S3-043] the skill body offers no waiver for a never-class code [S3-043] installed skill body: no sentence pairs a never-class code with "waive" — passes on base (regression)
- `src/app/runtime/craft.test.ts` — [S3-043] the skill body offers no waiver for a never-class code [S3-043] craft at depth 3 (AGENTS.md): no sentence pairs a never-class code with "waive" — passes on base (regression)

### S3-044 — WAIVABILITY_ENFORCED is true, held to apply, import and check, and no surface says NOT enforced by this build
- `src/app/operations/waivability.test.ts` — [S3-044] waivability is enforced, and nothing publishes otherwise [S3-044] WAIVABILITY_ENFORCED is true — FAILS on base
- `src/app/operations/waivability.test.ts` — [S3-044] waivability is enforced, and nothing publishes otherwise [S3-044] the probe covers one never code of every never class a published code has — passes on base (regression)
- `src/app/operations/waivability.test.ts` — [S3-044] waivability is enforced, and nothing publishes otherwise [S3-044] no surface says "NOT enforced": the statement, the manifest, AGENTS.md and explain — FAILS on base
- `src/app/operations/waivability.test.ts` — [S3-044] waivability is enforced, and nothing publishes otherwise [S3-044] the committed AGENTS.md does not say "NOT enforced by this build" — FAILS on base
- `src/app/operations/waivability.test.ts` — [S3-044] waivability is enforced, and nothing publishes otherwise [S3-044] write time: the fold refuses a never code of each class, code-only and refs+hash, with ERR_WAIVER_REFUSED — FAILS on base
- `src/app/operations/waivability.test.ts` — [S3-044] waivability is enforced, and nothing publishes otherwise [S3-044] check time: a stored FND_CONTRADICTION waiver, code-only or refs+hash, suppresses nothing — FAILS on base

### S3-045 — No advice, replacement, message or prose names vocab distinct or propose-vocabulary --rescope-waivers
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] runs every corpus document and every S3 fixture document — passes on base (regression)
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] every repair op decodes and folds under MUTATE_OPTIONS on the checked document — passes on base (regression)
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-039] no offered waive op names a never-class code — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-040] no finding message or suggestion for a never-class code says "waive" — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-040] no demotion action for a never-class code says "waive" — FAILS on base
- `src/testing/report-corpus.test.ts` — [S3-039][S3-040][S3-045] the advice over every corpus and fixture document [S3-045] no string anywhere in a payload names vocab distinct, propose-vocabulary or --rescope-waivers — passes on base (regression)
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-025] [S3-045] a never-code waiver-inert carries the unwaive op and "rewrite required", no waive op, and names no vocab distinct or --rescope-waivers — FAILS on base
- `src/domain/advice/repair.test.ts` — [S3-045] no source string names a command this build lacks (static) [S3-045] <file> (x116) — passes on base (regression)

### S3-046 — Every waiver the engine applied is listed with code, ids and reason, and the scope says a content hash binds text, not the reviewer
- `src/app/operations/check-waivers.test.ts` — S3 check half: stored waivers that do not qualify go inert and are disclosed [S3-046] every waiver the engine applied is listed in data.appliedWaivers with its code, requirement ids and reason, and no inert one is — FAILS on base
- `src/app/runtime/scope.test.ts` — [S3-042][S3-046] the scope says what a waiver can and cannot do [S3-042] coverageDemotion no longer counts a waived opposition candidate as triaged — FAILS on base
- `src/app/runtime/scope.test.ts` — [S3-042][S3-046] the scope says what a waiver can and cannot do [S3-046] the published scope says a content hash binds the text, not the reviewer — FAILS on base

### S3-047 — A scoped, reviewed waiver of a scoped-class finding gets no KNOWN_ESCAPES row: the scoped-waive harness move runs on never-class fixtures only (refused at write, inert raw), and the derives-cycle FND_CYCLE scoped discharge is pinned by its own positive test
- `src/testing/gaming-waivers.test.ts` — the scoped discharge of a scoped-class finding [S3-047] the derives-cycle FND_CYCLE scoped discharge: a refs+contentHash waive over the cycle ids is accepted and the run is clean — passes on base (regression)
- `src/testing/gaming.test.ts` — the gaming registry [S3-047] [S3-048] [S3-050] no KNOWN_ESCAPES row names a waive move, waive-by-code stays registered, and OP_COVERAGE.waive maps to moves that emit waive — passes on base (regression)

### S3-048 — The 11 waive-by-code KNOWN_ESCAPES rows are deleted with the move still registered and exactness green on every shard
- `src/testing/gaming.shard-a.test.ts` — GAMING shard a — feature-interaction, state-invariant [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — passes on base (regression)
- `src/testing/gaming.shard-a.test.ts` — GAMING shard a — feature-interaction, state-invariant [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-b.test.ts` — GAMING shard b — one-trigger-contradiction, contrary-pair [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-b.test.ts` — GAMING shard b — one-trigger-contradiction, contrary-pair [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-c.test.ts` — GAMING shard c — numeric-conflict, temporal-conflict [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-c.test.ts` — GAMING shard c — numeric-conflict, temporal-conflict [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-d.test.ts` — GAMING shard d — glossary-bridged, term-bridged [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-d.test.ts` — GAMING shard d — glossary-bridged, term-bridged [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-e.test.ts` — GAMING shard e — registered-contrary [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-e.test.ts` — GAMING shard e — registered-contrary [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-f.test.ts` — GAMING shard f — waived-blocking-lint, dangling-target [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-f.test.ts` — GAMING shard f — waived-blocking-lint, dangling-target [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-g.test.ts` — GAMING shard g — overlapping-contrary, opposition-candidate [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-g.test.ts` — GAMING shard g — overlapping-contrary, opposition-candidate [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-h.test.ts` — GAMING shard h — derives-cycle, numeric-bystander [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-h.test.ts` — GAMING shard h — derives-cycle, numeric-bystander [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.shard-i.test.ts` — GAMING shard i — opposition-negated, opposition-split [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-i.test.ts` — GAMING shard i — opposition-negated, opposition-split [S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5) — passes on base (regression)
- `src/testing/gaming.test.ts` — the gaming registry [S3-047] [S3-048] [S3-050] no KNOWN_ESCAPES row names a waive move, waive-by-code stays registered, and OP_COVERAGE.waive maps to moves that emit waive — passes on base (regression)

### S3-049 — The harness measures a scoped never-code waive per baseline finding and the same waivers written into the stored JSON with no fold
- `src/testing/gaming.shard-a.test.ts` — GAMING shard a — feature-interaction, state-invariant [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — passes on base (regression)
- `src/testing/gaming.shard-b.test.ts` — GAMING shard b — one-trigger-contradiction, contrary-pair [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-c.test.ts` — GAMING shard c — numeric-conflict, temporal-conflict [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-d.test.ts` — GAMING shard d — glossary-bridged, term-bridged [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-e.test.ts` — GAMING shard e — registered-contrary [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-f.test.ts` — GAMING shard f — waived-blocking-lint, dangling-target [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-g.test.ts` — GAMING shard g — overlapping-contrary, opposition-candidate [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-h.test.ts` — GAMING shard h — derives-cycle, numeric-bystander [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-i.test.ts` — GAMING shard i — opposition-negated, opposition-split [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.test.ts` — the gaming registry [S3-049] waive-scoped-never and waive-raw are registered and inapplicable on derives-cycle — passes on base (regression)
- `src/testing/gaming.test.ts` — the gaming registry [S3-049] waive-scoped-never waives each never-class finding over its exact ids and current hash; waive-raw writes the same plus a code-only one per code, with no op — passes on base (regression)

### S3-050 — The clean (fixture, move) pairs after S3 are base's minus the 11 waive-by-code rows, none added
- `src/testing/gaming.shard-a.test.ts` — GAMING shard a — feature-interaction, state-invariant [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — passes on base (regression)
- `src/testing/gaming.shard-b.test.ts` — GAMING shard b — one-trigger-contradiction, contrary-pair [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-c.test.ts` — GAMING shard c — numeric-conflict, temporal-conflict [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-d.test.ts` — GAMING shard d — glossary-bridged, term-bridged [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-e.test.ts` — GAMING shard e — registered-contrary [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-f.test.ts` — GAMING shard f — waived-blocking-lint, dangling-target [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-g.test.ts` — GAMING shard g — overlapping-contrary, opposition-candidate [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-h.test.ts` — GAMING shard h — derives-cycle, numeric-bystander [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.shard-i.test.ts` — GAMING shard i — opposition-negated, opposition-split [S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair — FAILS on base
- `src/testing/gaming.test.ts` — the gaming registry [S3-047] [S3-048] [S3-050] no KNOWN_ESCAPES row names a waive move, waive-by-code stays registered, and OP_COVERAGE.waive maps to moves that emit waive — passes on base (regression)

### S3-051 — Every changed report-corpus row is a verdict delta attributable to AC-5-6
- (no vitest test; see Unpinned)

### S3-052 — The S3 build commit is feat! with a BREAKING CHANGE: footer in its own body
- (no vitest test; see Unpinned)

### S3-053 — S3 does not touch the version files; release-please bumps the four version files in the release PR
- (no vitest test; see Unpinned)
