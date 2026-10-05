# Release hardening: rulings

VDD run 3, entry bug, base 0fca0433eb82 (feat/controlled-vocabulary). Findings from job 818's
release audit (evidence in /home/lalsaado/bonk-fs/projects/mods-webapp-poc/run/work/job-818).
Rulings by the coordinator (job 815) under the owner's delegated authority, copied word for word.
They are pinned; the contract does not reopen them.

## Findings as received

- B1: GitHub account theagenticguy was renamed to laithalsaadoon after v1.2.1 published;
  repos/theagenticguy/symspec redirects to laithalsaadoon/symspec (same repo id). The next
  publish's OIDC repository claim is laithalsaadoon/symspec, and npm provenance compares
  package.json repository.url exactly (E422).
- B3: with NO symspec.config.json anywhere, check exits 2 ERR_CONFIG_INVALID when git refuses the
  document's directory for a reason other than 'not a git repository' (repro: a git shim on PATH
  printing 'fatal: detected dubious ownership in repository at ...' and exiting 128). v1.2.1
  exits 0, verified true.
- B4: on the dev build a docVersion 4 document with intent items and vocabulary.frozenTables
  loads, add accepts a requirement with neither intentRef nor derived, glossary writes into the
  'frozen' tables, check says verified true and reads none of it. Yet the schema descriptions say
  'Every requirement names one intent item, or is marked derived' and 'With a vocabulary those two
  tables are frozen', and README/AGENTS tell users to put intent and policy under code-owner
  review while init --split's help never says nothing reads them.

## Rulings

1. RH-001 · Repository URLs after the account rename. RH-R1 (B1): package.json repository.url =
   git+https://github.com/laithalsaadoon/symspec.git, homepage =
   https://github.com/laithalsaadoon/symspec#readme, bugs.url =
   https://github.com/laithalsaadoon/symspec/issues. Every live reference in package.json,
   README.md, RELEASING.md, AGENTS.md (generated) and non-test src/ names laithalsaadoon/symspec.
   CHANGELOG.md is history owned by release-please: untouched. Negative guard: the string
   'theagenticguy' is ABSENT from package.json, README.md, RELEASING.md and AGENTS.md (a
   historical note in RELEASING.md, if any is kept, must not be a command). Behaviors: RH-001,
   RH-002.
   Ruled: (RH-R1).

2. RH-003 · A git refusal with no config named. RH-R2 (B3): when no config is named (--config or
   SYMSPEC_CONFIG) and git refuses the document's directory for any reason other than 'not a git
   repository' and other than the bare-repository refusal: (a) if no symspec.config.json exists in
   the document's directory or any ancestor directory, the run proceeds exactly as with no
   repository (the document's directory is the config root, no config file applies; findings,
   demotions and verified identical to the no-git case) and data.run.config discloses git's
   refusal (its first line) alongside {path, source}; (b) if a symspec.config.json exists in the
   document's directory or any ancestor, the run fails closed with ERR_CONFIG_INVALID naming git's
   refusal (an ancestor config is never loaded by this path: no walk-up loading, F11). The
   bare-repository refusal stays ERR_CONFIG_INVALID. --config and SYMSPEC_CONFIG behave as today.
   Behaviors: RH-003, RH-004, RH-005, RH-006.
   Ruled: (RH-R2).

3. RH-007 · The v4 statement. RH-R3 (B4): one exported constant holds the statement, e.g.
   'Experimental in this release: decoded and preserved on save, read by no check tier yet; its
   shape may change in a minor release.' It is interpolated (never retyped) into: the .describe()
   text of document v4's vocabulary, intent and policy keys and of the requirement intentRef and
   derived fields (so the manifest and AGENTS.md derive it); init --split's help and its result
   text; the AGENTS.md sections (via src/app/runtime/agents-doc.ts) and README sections that
   describe v4, intent.json, policy.json or code-owner review of them. The unqualified enforcement
   claims ('Every requirement names one intent item, or is marked derived'; 'With a vocabulary
   those two tables are frozen'; any README/AGENTS text implying a tier reads intent or policy) are
   ABSENT or rephrased as what a later release will do. symspec.config.json's pins are enforced
   today (run-weakened) and are NOT labelled experimental. Behaviors: RH-007, RH-008, RH-009.
   Ruled: (RH-R3).

4. RH-010 · A config whose existence cannot be determined, or a dangling config link, under a
   git refusal. RH-R4 (review findings R1, R2, R3, review ledger fc203db; ruled by the coordinator,
   job 815, under the owner's delegated authority): under a git refusal with no config named, a
   symspec.config.json at the document's directory or an ancestor whose existence cannot be
   determined (self-symlink, ELOOP) fails closed with ERR_CONFIG_INVALID. A dangling
   symspec.config.json symlink counts as PRESENT under a refusal (fail closed), because under a
   refusal the run cannot tell which config governs and an agent could plant a dangling link to
   steer discovery; this differs on purpose from the non-refusal path. (R2) The bare-repository
   refusal is recognised from git's own message form (its 'fatal: cannot use bare repository'
   line, the path quoted after it excluded), so a quoted path containing that phrase does not
   change the classification; the ordinary refusal then falls back exactly as RH-003 says. (R3)
   Over EVERY description in the projected JSON schema of the document (all nesting levels), the
   unqualified enforcement claims are absent, and every projected description of vocabulary,
   intent, policy, intentRef and derived carries V4_EXPERIMENTAL_STATEMENT. Behaviors: RH-010,
   RH-011, RH-012.
   Ruled: (RH-R4).

## Contract readings (how the tests pin the rulings; the build follows these)

- C1 (RH-R3) The constant is `V4_EXPERIMENTAL_STATEMENT`, a string exported from
  `src/domain/requirements/document.ts` (the innermost module every surface can import). Tests
  read it through the module namespace (`Reflect.get`), so they load on base and fail there on an
  assertion. Its text must match /experimental/i, /no check tier/i and /preserved on save/i; the
  rest of the wording is the builder's. Every comparison collapses whitespace, so a wrapped
  description still matches.
- C2 (RH-R2 a) The disclosure: `data.run.config` is `{path: <document dir>/symspec.config.json,
  source: 'directory', ...}` plus at least one more key, named by the builder, whose string
  value(s) contain git's first stderr line verbatim and not its second line. Findings, demotions
  and verified are compared whole with the run where PATH holds no git; the exit code too.
- C3 (RH-R2) "--config and SYMSPEC_CONFIG behave as today": on base the default location is
  resolved even when a config is named (it decides which document a named config governs), so
  under a git refusal a named config ALSO fails closed as ERR_CONFIG_INVALID. RH-006 pins exactly
  that (it passes on base). With no git at all, a named config is read and disclosed as
  `{path, source: 'flag'}`.
- C4 (RH-R2) The store-level test `configPath ... fails closed when git fails for any reason but
  "not a repository"` (src/adapters/fs/store.test.ts, an unreadable `.git` file) is untouched:
  RH-R2 pins the check run, not `DocStore.configPath`. A build that changes `configPath`'s own
  contract needs a ruling before that test changes. `init --split` (which also asks configPath)
  is not covered by RH-R2.
- C5 (RH-R3) The honest-scope claim `pinnedConfig` describes code-owner review of the intent and
  policy files, so it is in RH-R3's reach. Its pinned wording becomes "... a CI job that checks a
  fresh clone, with `symspec.config.json` under code-owner review. ..." (the rest unchanged): the
  config stays, unlabelled; the anchors no tier reads leave the claim. `FROZEN.pinnedConfig` in
  src/app/runtime/scope.test.ts carries the new text; the verbatim loop skips that one key and the
  `[RH-009]` test compares it byte for byte instead, so no comparison is lost. The README
  blockquote follows through the existing "quotes EVERY scope claim verbatim" test.
- C6 (RH-R1) src/publish.test.ts "points at a repository, a homepage, and an issue tracker"
  asserted `homepage` contains `github.com/theagenticguy/symspec`; that line now asserts
  `github.com/`, because `[RH-001]` pins all three URLs exactly (a stronger check).
- C7 (RH-R3) init --split's result: the statement appears somewhere in `data` but not inside
  `data.split`, which the existing test "init --split writes the anchors and the config" compares
  whole as `{config, intent, policy}`.
- C8 Surfaces RH-R3 or RH-R2 may reach that no test pins, for the reviewer: the `anchor` signal
  class rows in AGENTS.md ("A change to something the loop may not change from inside: intent,
  policy, the pinned configuration, or the baseline binding."; "The document moved against its
  baseline, intent, or pinned configuration."); the `files.intent` and `files.policy`
  descriptions of `SymspecConfig`; and the ERR_CONFIG_INVALID catalog text, which says any git
  failure but "not a git repository" is ERR_CONFIG_INVALID and is stale once RH-R2 (a) lands.

- C9 (RH-R4, R1) RH-010 is pinned on the shipped bundle under the same refusing `git` shim as
  RH-003. "Existence cannot be determined" is produced without mocks by a `symspec.config.json`
  symlinked to itself (stat fails ELOOP), beside the document and in an ancestor; those two tests
  are a guard of code already right at ca83661 (`existing` half: they pass there, and they go red
  on the reviewer's mutant `fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))`). A
  dangling link is a `symspec.config.json` symlink to a path that does not exist, beside the
  document and in an ancestor; both must fail closed as ERR_CONFIG_INVALID naming the refusal,
  with no `data`. What a dangling link does OFF the refusal path is not pinned (RH-R4 lets it
  differ). An unreadable ancestor directory (EACCES) is not pinned: a document under it cannot be
  read either.
- C10 (RH-R4, R2) RH-011's fixture directories, each with no config at or above it: the
  reviewer's `cannot use bare repository`; `fatal: cannot use bare repository` (git's prefix
  inside the quoted path); and `x<newline>fatal: cannot use bare repository '` (the phrase at the
  start of a LINE of the quoted path). The refusal is the ordinary ownership one quoting the
  directory, so each run must equal the no-git run in exit code, verdict, findings and demotions,
  carry no error code, and disclose `{path: <dir>/symspec.config.json, source: 'directory'}`. So
  the bare refusal is git's stderr whose FIRST line begins `fatal: cannot use bare repository`;
  a substring or any-line (multiline) match fails RH-011. RH-005 (a real bare refusal from real
  git) is unchanged and still fails closed.
- C11 (RH-R4, R3) RH-012 walks `Schema.toJsonSchemaDocument(RequirementsDocument)` whole
  (`schema` and `definitions`, every nesting level, union and refinement branches included). The
  claims are matched as claims, not as exact wording: RH-R3's two sentences, and
  /tables are frozen/, /every requirement names/, /(is|are) checked against/, /when the document
  is checked/ (case-insensitive, whitespace collapsed); a description carrying the statement is
  NOT thereby excused, so a claim must be rephrased as what a later release will do. "Every
  projected description of" a key means every description on that property's own node, at every
  place a property of that name occurs: the node, its allOf/anyOf/oneOf branches at any depth and
  a `$ref` target, not its nested properties or items (those are held to the claim list). Each of
  the five keys must occur and carry at least one description. At ca83661 the walk reports the
  nine projected claims from four source sites (the symbol id, the distinct record, intent item
  text, intent items) and no key description lacking the statement; dropping the statement from
  `derived` makes it report `...properties.derived: lacks the statement`.

## Boundaries

CHANGELOG.md (release-please history). Enforcing intentRef/derived, frozen tables, or any tier
reading intent or policy: RH-R3 labels them, it does not implement them. Walk-up config loading
(F11 forbids it). init --split's behavior under a git refusal.
