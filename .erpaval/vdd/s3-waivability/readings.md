# Readings of the story: S3 Waivability (AC-5-6)

## Intake

Written by the intake role (VDD run 2, job 817) at base 0fca0433eb82 (feat/controlled-vocabulary),
on branch vdd/s3-waivability. This section holds no expected outcome, no scenario and no ruling.
Every consequence class, ceiling and trust tag below is PROPOSED and approved by nobody yet. The
same components are data in `components.json`; the fixture's files are in `fixture/`.

### Story as received

"Ship the next symspec: spec 007 Phase 3 slice S3, Waivability (AC-5-6). A formal-tier (never-class) finding is not waivable; a wording (lint) finding is waivable only for the requirement ids and content hash it was raised on; a waived finding that excludes a requirement from the formal tier still demotes (waived-blocking-lint). Stored waivers that do not qualify go inert and are disclosed (waiver-inert, with replacement ops); stale-hash waivers are disclosed in data.ignoredWaivers; the fold and import refuse never-class and unscoped waivers (ERR_WAIVER_REFUSED); repair advice and the engine's discharge prose stop offering waive for never codes. Closes the 11 waive-by-code KNOWN_ESCAPES rows. Breaking (feat!), shipped as the next major after v1.2.1 together with the dev line feat/controlled-vocabulary."

Where the intent lives: `.erpaval/specs/007-controlled-vocabulary/spec.md` AC-5-6 (~:472-479) and
Decisions D1 and D4 (~:709-770); `phase3-plan.md` 2.3 (~:291-348), 5.3 (~:641-668), 6 item 1
(~:842-852), S3 (~:1055-1078), 10 (~:1420-1428), R4 and R7 (~:1449-1460), G2, G3, G4, G24
(~:1487-1509).

### Components the story touches

Line numbers are at base 0fca043 and approximate.

| id | layer | paths | what the story asks of it |
|---|---|---|---|
| waive-fold | domain (write path) | `src/domain/requirements/mutate.ts` (`applyWaive` ~:992, `MutateOptions`), `src/domain/requirements/ops.ts` (`WaiveOp` ~:241), `src/app/operations/mutate-options.ts` (`MUTATE_OPTIONS`), `src/app/operations/mutation.ts` (`waiveOp`, the `symspec waive` command), `src/app/runtime/errors.ts`, `src/cli.ts` (`waiveCommand` ~:662) | refuse never-class and unscoped waivers with ERR_WAIVER_REFUSED, through a classifier injected the way the other write fences are |
| import-waivers | application | `src/app/operations/import.ts` (`WaiveOp` record ~:186, `parseSideTableCommand` ~:349, `applyWaive` ~:581), `import.test.ts`, `roundtrip.test.ts` | refuse the same waivers the fold refuses |
| check-compat | domain (check-time boundary) | `src/domain/compat.ts` (`bindsCurrentText` ~:117, `toEngineDoc`), `src/domain/requirements/document.ts` (`Waiver` ~:1063, `DIAGNOSTIC_KINDS` ~:1480), `content-hash.ts` | make a non-qualifying stored waiver inert and disclose it (waiver-inert, with replacement ops); disclose stale-hash waivers in data.ignoredWaivers |
| engine-waiver-scope | engine (owned; reach only, no logic edit) | `src/domain/engine/pipeline/check.ts` (`isWaived` ~:683, `PAIR_BOUND_CODES` ~:711, `unappliedNote`), `gate.ts` (`isWaivedBlocking` ~:93) | nothing; it applies whatever waivers compat lets through, and S3 must leave its logic as is |
| check-demotions | application | `src/app/operations/check.ts` (the demotion cast at ~:1103, which the plan places at :1006), `src/app/runtime/signal-classes.ts` (`DEMOTION_CLASS`) | add the waived-blocking-lint demotion; replace the cast with `AppDemotionReason` |
| published-waivability | application (published surface) | `src/app/runtime/signal-classes.ts` (`WAIVABILITY`, `WAIVABILITY_ENFORCED` ~:297, `waivabilityStatement`), `src/app/operations/waivability.test.ts`, `src/app/runtime/agents-doc.ts`, `AGENTS.md` | the published column becomes enforced, and every surface says so |
| repair-advice | domain | `src/domain/advice/repair.ts` (`scopedWaive` ~:476 and the per-reason cases ~:186-320) | stop emitting waive ops for never codes |
| scope-prose | application (published surface) | `src/app/runtime/scope.ts` (`coverageDemotion` ~:66), `scope.test.ts` | drop "or waived" |
| engine-prose | engine (prose-only edit) | `src/domain/engine/pipeline/check.ts` demotion actions (~:2127-2132, ~:2160, ~:2176-2181, ~:2196, ~:2223, ~:2279), `src/domain/engine/formal/semantic.ts` (~:538-569, ~:954), `numeric-contradiction.ts`, `number-spelling.ts`, `quantity-alias.ts` | stop offering waive for never codes |
| gaming-harness | testing (trusted base) | `src/testing/gaming.ts` (move `waive-by-code` ~:1139, its KNOWN_ESCAPES rows ~:1786-1805), `gaming.test.ts`, `gaming.shard-*.test.ts`, `__snapshots__/gaming-*.txt` | the 11 waive-by-code rows close and are deleted |
| report-corpus | testing (trusted base) | `src/testing/report-corpus.ts`, `report-corpus.test.ts`, `__snapshots__/report-corpus.txt` | records the verdict deltas AC-5-6 makes on legacy documents |
| release | build | `package.json`, `RELEASING.md`, `src/publish.test.ts`, `src/app/runtime/version.ts` | breaking, the next major after 1.2.1 |

Code facts at base that bear on the story (read, not run, except where stated):

- `applyWaive` accepts any non-empty code. `ref` stores `requirementId` with no hash. `refs` stores
  `requirementIds` plus a hash the fold computes. It refuses a supplied `contentHash` that differs
  from the hash it computes (ERR_USAGE). The `symspec waive` command has `--ref` and no `--refs`.
- `bindsCurrentText` passes every waiver with no `contentHash`. It drops a waiver whose hash no longer
  matches, silently. The engine trusts compat's `textBound: true` and does not rehash.
- The engine already declines a code-only or one-ref waiver of FND_OPPOSITION_CANDIDATE
  (`PAIR_BOUND_CODES`), keeps it in the document, and names it in the demotion's action.
- `isWaivedBlocking` re-admits a requirement whose blocking GTWR finding is waived (W1c).
- import's waive record schema has `code`, `reason` and an optional `ref` only. A JSONL record with
  `refs` and `contentHash` is rejected as unexpected keys. Run at base on
  `fixture/import/scoped-record.txt`: `problems[]` names line 4, `imported.waivers` is 0. v4 command
  lines carry only `--ref`. An unresolvable `--ref` is imported document-wide and disclosed in
  `unresolved[]`.
- `FINDING_CLASS` puts these classes at `never`: verdict, disclosure, triage, hygiene and anchor.
  It puts wording (GTWR_*, FND_AMBIGUOUS_*, FND_EXACT_DUPLICATE, ...) and structural (FND_CYCLE,
  FND_ORPHAN, FND_MISSING_TRACE_LINK, FND_LEAF_UNVERIFIABLE) at `scoped`. `WAIVABILITY_ENFORCED`
  is `false`.
- The op vocabulary (`ops.ts`) has no `vocab` verb, so `vocab distinct`, which the plan names as the
  replacement remedy, does not exist in this build.
- The report corpus deliberately leaves messages, suggestions and evidence out of its rows.

### Oracles per component

| component | oracle (what tells right from wrong) | type | strength |
|---|---|---|---|
| waive-fold | vitest on `foldOps`/`applyOp` under `MUTATE_OPTIONS`: the op's error code (ERR_WAIVER_REFUSED, ERR_USAGE, ok) and the stored `Waiver` for each `fixture/cases/*.ops.jsonl` | exact | strong |
| waive-fold | the CLI suite on `dist/cli.mjs apply` and `waive`: exit code, `data.results[].ok/.code`, `written` | exact | strong |
| waive-fold | for every published code and every scope shape (none, ref, refs, refs+hash), refusal happens exactly when the code is `never` or the shape is not refs+hash, and a refused atomic stream leaves the file byte-identical | metamorphic | strong |
| waive-fold | `waivability.test.ts` write-time half: the flag equals what the fold does | contract | strong |
| import-waivers | import envelope on `fixture/import/*.txt`: `imported.waivers`, `problems[]`, `unresolved[]`, exit code, the written `waivers[]` | exact | strong |
| import-waivers | import's waiver fold equals apply's under `MUTATE_OPTIONS` | contract | strong |
| import-waivers | `roundtrip.test.ts`: reproduce, then import back | replay | partial (the v4 emitter is not in the repo) |
| check-compat | `toEngineDoc(doc).waivers` for every stored fixture document | exact | strong |
| check-compat | check envelope: `data.diagnostics[]` of kind waiver-inert with replacement ops, and `data.ignoredWaivers[]`; every replacement op decodes as a `DocumentOp` and the fold accepts it | exact | strong |
| check-compat | removing an inert waiver from the stored document leaves `data.findings`, `data.coverage.demotions` and `data.verified` unchanged | metamorphic | strong |
| check-compat | a stored waiver qualifies at check time exactly when the S3 fold would accept the same waiver as an op (the check-time twin, risk R4) | differential | strong |
| engine-waiver-scope | `waiver-scope.test.ts`, `verified.test.ts`, `package-boundary.test.ts` unchanged and green | exact, contract | strong |
| check-demotions | check envelope on the blocking-lint streams: `data.coverage.demotions[]` (reason, requirementIds), `data.verified`, exit under `--strict` | exact | strong |
| check-demotions | the waived-blocking-lint ids are the requirements excluded with no waivers minus those excluded with the stored waivers; with no waivers nothing changes from base | metamorphic | strong |
| check-demotions | `tsc --noEmit`: `DEMOTION_CLASS satisfies Record<AppDemotionReason, ...>` and no cast | exact (type) | strong |
| published-waivability | `waivability.test.ts` both halves with the flag true; `check:agents` drift; a negative guard that the "NOT enforced" sentence is absent | exact | strong |
| repair-advice | `repair.test.ts` on `repair.ops`; every offered op decodes and the fold accepts it; no offered `waive` names a `never` code over every corpus and fixture document | exact, contract, metamorphic | strong |
| scope-prose | `scope.test.ts` negative guard: "or waived" absent; `check:agents` drift | exact | strong |
| engine-prose | a negative guard over the report corpus: no demotion action or finding suggestion for a never code contains `waive`; red-team rounds and the package boundary unchanged | exact | strong |
| engine-prose | whether each replacement remedy is the right one | human | partial |
| gaming-harness | KNOWN_ESCAPES exactness (every row still escapes; no unlisted clean verdict) over all shards; shard and moves snapshot diffs | exact | strong |
| report-corpus | snapshot diff, each changed row reviewed as a verdict delta attributable to AC-5-6 | exact | strong |
| release | `publish.test.ts` version agreement; the commit declares `!` or `BREAKING CHANGE` | exact | strong |

The whole gate, `pnpm check`, runs every one of these suites. Any check over this fixture that reads
`data.verified` must run with the gaming harness's orthogonal fixture embedder over
`fixture/embedder.json`'s near pairs. `SYMSPEC_EMBED_STUB=1` demotes every run `run-weakened`
(AC-3-5), which hides whether a waiver moved `verified`.

### Trust boundaries, data stores, external endpoints

| boundary | who writes across it | what the other side trusts | components |
|---|---|---|---|
| TB1 op to document | an agent or person through `apply` or `symspec waive` chooses code, reason, ref/refs and contentHash | the fold computes the hash itself and decides what is stored | waive-fold |
| TB2 foreign stream to document | another build (v4 reproduce) or a hand-written stream through `import`; a scope may not resolve | import folds through the same fences as apply | import-waivers |
| TB3 document on disk to check | anyone who edits the JSON by hand, or any older build that wrote it; no fence runs (risk R4) | compat decides which stored waivers cross; the engine trusts compat's `textBound` | check-compat, engine-waiver-scope |
| TB4 check output to agent | symspec writes repair ops, demotion actions, suggestions and scope prose | an agent pipes repair ops into `apply` and follows the prose | repair-advice, engine-prose, scope-prose, published-waivability |
| TB5 the certificate | check's `verified`, exit code and `--strict` exit 3 | CI and a person read them as what was checked | check-demotions, check-compat |
| TB6 the measurement | the gaming harness and the report corpus | they are the trusted base: they measure escapes and verdict deltas through the real write path | gaming-harness, report-corpus |

Data stores: the requirements document (its `waivers[]`), written by apply, import, older builds and
hand edits, and read by check. `symspec.config.json` pins `strict` under CODEOWNERS (D5, D8).
External endpoints: none crossed by S3. The embedding model is local and stubbed in tests, and the
npm publish runs only in the release workflow.

### Proposed consequence class and evidence ceiling per component (PROPOSED)

Classes, PROPOSED:

- false certificate: `verified: true`, or exit 0 under `--strict`, while a waiver suppresses a
  finding the tool never decided, or one nobody reviewed over the current text.
- reviewed-waiver loss: a waiver someone reviewed stops applying, or is refused or dropped, with no
  disclosure naming it and no replacement op.
- instruction drift: advice or prose offers a remedy the build refuses, or offers `waive` for a
  `never` code.
- gate drift: a trusted-base measurement stops measuring what it names, or is edited to match the
  change it judges.

Ceilings use the levels 1 example, 2 property, 3 type or domain rule, 4 boundary contract,
5 checked model and 6 proof.

| component | class (PROPOSED) | ceiling (PROPOSED) | why |
|---|---|---|---|
| waive-fold | false certificate | 3 | a pure fold over a closed catalog: properties cover every code and shape, and a domain rule is reachable |
| import-waivers | reviewed-waiver loss | 4 | a contract that import's fold is apply's; the v4 producer can only be replayed |
| check-compat | false certificate | 4 | a pure projection, plus the write/check twin contract for the hand-edit channel |
| engine-waiver-scope | false certificate | 2 | regression only; S3 must not change it |
| check-demotions | false certificate | 3 | set arithmetic over the gate, plus a type rule for the reason union |
| published-waivability | instruction drift | 4 | the flag is held to both enforcement points |
| repair-advice | instruction drift | 2 | a pure function, with a negative guard over the whole corpus |
| scope-prose | instruction drift | 1 | prose: absence is exact, truth is a human reading |
| engine-prose | instruction drift | 1 | prose, the same |
| gaming-harness | gate drift | 1 | it is the oracle; its evidence is its exactness test and planted sabotage |
| report-corpus | gate drift | 1 | a snapshot a person reads row by row |
| release | reviewed-waiver loss | 1 | metadata |

### The shared fixture

One base document plus named op streams. Every reader reasons over these values and no others.
Files: `fixture/base.ops.jsonl` (the base document's ops) and `fixture/base.json` (the document
apply wrote at base). `fixture/cases/<name>.ops.jsonl` holds one stream per case, each applied to
`base.json` on its own, never chained. `fixture/cases/<name>.stored.json` is the document base 0fca043's
`apply` wrote from that stream: the legacy channel, accepted before S3. `fixture/cases/hand-*.json`
holds hand-edited documents (TB3). `fixture/legacy-mixed.json` is built from
`fixture/legacy-mixed.ops.jsonl`. `fixture/import/*.txt` holds import streams and
`fixture/embedder.json` the near pairs. `fixture/build.sh` rebuilds every stored document at base,
with timestamps pinned. Requirement timestamps are 2026-10-05T00:00:00.000Z. The content hash reads
no timestamp.

#### Base document (`fixture/base.json`), docVersion 3, no glossary, antonyms, terms or state model

| key | id | sentence |
|---|---|---|
| CAB-R1 | 5a1e0000-0000-4000-8000-0000000000c1 | When the driver selects automatic climate, the climate controller shall heat the cabin. |
| CAB-R2 | 5a1e0000-0000-4000-8000-0000000000c2 | When the driver selects automatic climate, the climate controller shall cool the cabin. |
| LOG-R1 | 5a1e0000-0000-4000-8000-0000000000a1 | When the operator closes the shift, the audit logger shall store an audit record. |
| LOG-R2 | 5a1e0000-0000-4000-8000-0000000000a2 | When the operator closes the shift, the audit logger shall store a shift summary. |
| ORD-R1 | 5a1e0000-0000-4000-8000-0000000000b1 | When the operator submits the order, the order service shall record the order in a timely manner. |
| ORD-R2 | 5a1e0000-0000-4000-8000-0000000000b2 | When the operator submits the order, the order service shall not record the order in a timely manner. |

All six are event-driven, priority and status at their defaults, with no edges. heat/cool is not a
seed antonym pair, and neither is fill/drain.

The findings base 0fca043's `check` raises on `base.json` with the real model, listed because the
streams name these codes. Demotions, `verified` and exit are left to the readings.

| code | severity at base | class (FINDING_CLASS) | requirements |
|---|---|---|---|
| FND_OPPOSITION_CANDIDATE | info | triage (never) | CAB-R1, CAB-R2 (one finding) |
| FND_SIMILAR_SEMANTIC | info | triage (never) | CAB-R1, CAB-R2 (one finding) |
| GTWR_R5_INDEFINITE_ARTICLE | warn | wording (scoped) | LOG-R1; LOG-R2; ORD-R1; ORD-R2 (one finding each) |
| GTWR_R7_VAGUE | error (blocking) | wording (scoped) | ORD-R1; ORD-R2 (one finding each) |
| GTWR_R16_NEGATION | warn | wording (scoped) | ORD-R2 |
| FND_AMBIGUOUS_VAGUE | info | wording (scoped) | ORD-R1; ORD-R2 |
| FND_EXCLUDED_FROM_FORMAL | info | hygiene (never) | ORD-R1; ORD-R2 |
| FND_REACHABILITY_NOT_CHECKED | info | disclosure (never) | none |

Content hashes over base.json's text (`requirementsContentHash`, as the fold computes them):

| scope | contentHash |
|---|---|
| [LOG-R1] | sha256:fd8b2c50a779708a19c161d83262563c7d8826c3f749072ab3eaf58b2c286ae0 |
| [LOG-R2] | sha256:c2bd1271a31955317e36a3ede3361500f1061ac287576762e1e60f4d7227e42a |
| [LOG-R1, LOG-R2] | sha256:716cbd99ed8163a6c487418cfc3b0b147668af2cb9e4a4c353689723e80cb733 |
| [CAB-R1, CAB-R2] | sha256:7092d13706b6f9b5b8c407fe8fa96a6d50603b68e6749122534d5e5fb1c08817 |
| [ORD-R1] | sha256:e376ee5c3ca6dfa2b6aab589e457c1a3c818dcbaffa9401002cc761478ba15b1 |
| [ORD-R2] | sha256:447120f0804d769c9c5e1c0b473058543e1cc9dcbf30776a0d6f16b5956067e3 |
| [ORD-R1, ORD-R2] | sha256:743432fc769be93bf7293a2c26d788d48cf18b44e5970eee0c671df5d45eb21d |
| [LOG-R1] after LOG-R1 reads "store an audit record with the shift id" | sha256:37bcc820ebf8449926122dbf1a332ef2fa447430682d0e384118a4a2589411b0 |

Requirements some streams add:

| key | id | sentence |
|---|---|---|
| TNK-R1 | 5a1e0000-0000-4000-8000-0000000000d1 | When the level sensor reports low, the pump controller shall fill the tank. |
| TNK-R2 | 5a1e0000-0000-4000-8000-0000000000d2 | When the level sensor reports low, the pump controller shall drain the tank. |
| CYC-A | 5a1e0000-0000-4000-8000-0000000000e1 | The badge reader shall log the badge scan. (ubiquitous) |
| CYC-B | 5a1e0000-0000-4000-8000-0000000000e2 | The badge reader shall archive the badge scan. (ubiquitous) |

The semantic tier: `fixture/embedder.json` puts ("heat the cabin", "cool the cabin") and ("fill the
tank", "drain the tank") on a shared axis at the harness's NEAR_COSINE. Every other phrase has its
own axis.

#### Named op streams (each applied to `base.json` alone; reason strings abbreviated here, verbatim in the files)

| case | ops, in order | base apply wrote it? |
|---|---|---|
| repro-code-only (the AC-5-6 reproducer) | waive FND_OPPOSITION_CANDIDATE, no scope; add TNK-R1; add TNK-R2 | yes |
| repro-scoped | waive FND_OPPOSITION_CANDIDATE refs [CAB-R1, CAB-R2] contentHash sha256:7092d137...; add TNK-R1; add TNK-R2 | yes |
| repro-single-ref | waive FND_OPPOSITION_CANDIDATE ref CAB-R1; add TNK-R1; add TNK-R2 | yes |
| lint-scoped | waive GTWR_R5_INDEFINITE_ARTICLE refs [LOG-R1] contentHash sha256:fd8b2c50... | yes |
| lint-refs-no-hash | waive GTWR_R5_INDEFINITE_ARTICLE refs [LOG-R1], no contentHash in the op | yes (the fold stored sha256:fd8b2c50...) |
| lint-code-only | waive GTWR_R5_INDEFINITE_ARTICLE, no scope | yes |
| lint-single-ref | waive GTWR_R5_INDEFINITE_ARTICLE ref LOG-R1 | yes (stored as requirementId, no hash) |
| lint-wrong-set | waive GTWR_R5_INDEFINITE_ARTICLE refs [LOG-R1, LOG-R2] contentHash sha256:716cbd99... | yes |
| lint-stale-hash | waive GTWR_R5_INDEFINITE_ARTICLE refs [LOG-R1] contentHash sha256:fd8b2c50...; update LOG-R1 systemResponse "store an audit record with the shift id" | yes (stored hash sha256:fd8b2c50..., text now hashes to sha256:37bcc820...) |
| lint-hash-mismatch | update LOG-R1 systemResponse "store an audit record with the shift id"; waive GTWR_R5_INDEFINITE_ARTICLE refs [LOG-R1] contentHash sha256:fd8b2c50... | no: base refused op 2 with ERR_USAGE ("changed since the finding was raised"), nothing written |
| blocking-lint-both | waive GTWR_R7_VAGUE refs [ORD-R1] contentHash sha256:e376ee5c...; waive GTWR_R7_VAGUE refs [ORD-R2] contentHash sha256:447120f0... | yes |
| blocking-lint-one | waive GTWR_R7_VAGUE refs [ORD-R1] contentHash sha256:e376ee5c... | yes |
| never-verdict | the two blocking-lint-both waivers; waive FND_CONTRADICTION refs [ORD-R1, ORD-R2] contentHash sha256:743432fc... | yes |
| never-hygiene | waive FND_EXCLUDED_FROM_FORMAL ref ORD-R1; waive FND_EXCLUDED_FROM_FORMAL refs [ORD-R2] contentHash sha256:447120f0... | yes |
| structural-cycle-code-only | add CYC-A; add CYC-B; derive CYC-A to CYC-B; derive CYC-B to CYC-A; waive FND_CYCLE, no scope | yes |
| structural-cycle-scoped | the same four ops; waive FND_CYCLE refs [CYC-A, CYC-B], no contentHash in the op | yes (the fold stored sha256:b889a619770dd3929dc8c4d4086a52eece775a3995d5da76d61c43ffa8191524) |

Each case has two channels. As an op stream, it is applied by the build under test to `base.json`.
As a stored document, `<case>.stored.json` (base apply's output) is checked by the build under
test.

#### Stored legacy documents with no op stream (the hand-edit channel, TB3)

Each is `base.json` plus one waiver written into the JSON by hand:

| file | added waiver |
|---|---|
| cases/hand-refs-no-hash.json | GTWR_R5_INDEFINITE_ARTICLE, requirementIds [LOG-R1], no contentHash |
| cases/hand-ref-with-hash.json | GTWR_R5_INDEFINITE_ARTICLE, requirementId LOG-R1 (not requirementIds), contentHash sha256:fd8b2c50... |
| cases/hand-never-code-only.json | FND_OPPOSITION_CANDIDATE, no scope |
| cases/hand-unknown-code.json | FND_NOT_A_CODE (a code no catalog publishes), no scope |

`fixture/legacy-mixed.json` is `base.json` plus five waivers that base `apply` wrote from
`legacy-mixed.ops.jsonl`:

| waiver | code | stored scope |
|---|---|---|
| W1 | GTWR_R5_INDEFINITE_ARTICLE (wording) | none |
| W2 | GTWR_R5_INDEFINITE_ARTICLE (wording) | requirementId LOG-R2, no hash |
| W3 | FND_OPPOSITION_CANDIDATE (triage) | requirementIds [CAB-R1, CAB-R2], contentHash sha256:7092d137... (the pre-S3 designed discharge, decision D4) |
| W4 | GTWR_R7_VAGUE (wording, blocking) | requirementIds [ORD-R1], contentHash sha256:e376ee5c... |
| W5 | FND_EXCLUDED_FROM_FORMAL (hygiene) | requirementId ORD-R2, no hash |

#### Import streams (`fixture/import/`, fed to `symspec import --file`)

`v4-waivers.txt`: the six base requirements as JSONL add records with their fixed ids and keys,
then:

| line | spelling | waiver |
|---|---|---|
| I1 | v4 command | `symspec waive add GTWR_R5_INDEFINITE_ARTICLE --reason '...'` (no scope) |
| I2 | v4 command | the same code, `--ref 5a1e0000-0000-4000-8000-0000000000a2` (LOG-R2) |
| I3 | v4 command | FND_OPPOSITION_CANDIDATE, `--ref 5a1e0000-0000-4000-8000-0000000000c1` (CAB-R1) |
| I4 | v4 command | GTWR_R7_VAGUE, `--ref 5a1e0000-0000-4000-8000-0000000000ff` (matches no requirement) |
| I5 | JSONL record | FND_CONTRADICTION, ref ORD-R1 |
| I6 | JSONL record | GTWR_R7_VAGUE, ref ORD-R2 |

At base, this stream imported 6 requirements and 6 waivers. I4 was widened to document-wide and
reported in `unresolved[]`.

`scoped-record.txt`: LOG-R1 and LOG-R2 as add records, then one JSONL waive record in the form
apply accepts: GTWR_R5_INDEFINITE_ARTICLE, refs [LOG-R1], contentHash sha256:fd8b2c50.... At base,
import rejected that record (unexpected keys `refs`, `contentHash`) in `problems[]`.

### Ambiguities found at intake (unanswered)

These are for the readings and the reconciler. Intake settles none of them.

1. Write-time "only for the requirement ids it was raised on": the fold computes no findings. Must a
   `refs` set equal some finding's requirement set at write time (lint-wrong-set), or is equality
   only tested at check time?
2. "the content hash it was raised on": when an op carries no contentHash (lint-refs-no-hash,
   structural-cycle-scoped), is the hash the fold computes from the current text acceptable, or is
   such an op unscoped?
3. A `ref` op (lint-single-ref, repro-single-ref): plan 5.3 says `ref` is normalized to
   `refs: [ref]`, and plan 6 says a stored single-ref waiver with no hash goes inert. Is the op
   refused, or normalized and accepted? Is the stored form inert even when it names exactly the
   finding's one requirement?
4. A scoped refs+hash waiver of a triage code (repro-scoped, legacy-mixed W3) was the designed
   discharge of an opposition candidate before S3. FINDING_CLASS makes triage `never`, D4 removes
   the discharge for legacy documents, and `vocab distinct` does not exist in this build. What
   replacement op does waiver-inert offer for W3 here: `antonym`, `glossary`, a rewrite, or none?
5. AC-5-6 says the reproducer gives `verified: true` "today". At base the engine's
   `PAIR_BOUND_CODES` already declines code-only and one-ref FND_OPPOSITION_CANDIDATE waivers, and
   no opposition fixture is among the 11 waive-by-code rows. Intake did not check whether
   repro-code-only verifies at base. Which part of the reproducer is red on base?
6. import refusing "unscoped" waivers: import's record schema cannot carry refs or contentHash, and
   v4 lines carry only `--ref`, so every waiver import can read today is unscoped by the plan's
   definition. Should import learn the scoped form, or refuse every waiver it reads? What happens
   to the unresolvable-ref widening (I4)? Does a refused waiver make import exit 1, as other refused
   records do?
7. The excluded-from-formal remedy (engine prose ~:2127-2132, and repair's per-code waive ops)
   offers `symspec waive add <blocking-code> --ref <id>`, a single-ref waiver with no hash, of a
   scoped code. The CLI `waive` has no `--refs`. Which form replaces it, and does the CLI gain a
   flag?
8. waived-blocking-lint: does it demote when the re-admitted requirement turns out consistent
   (blocking-lint-one, and the gaming waived-blocking-lint control twin, verified at base)? Plan G3
   reads "a waived blocking lint never yields `verified: true`". What then discharges it, and does
   `--strict` exit 3 on it?
9. waiver-inert: is it a `data.diagnostics` entry (whose severity is fixed `info` and which today
   comes from document load, before compat runs), a finding, or a demotion? Does an inert waiver
   demote `verified`?
10. Stale hash (lint-stale-hash): is it disclosed only in `data.ignoredWaivers`, or also as
    waiver-inert? Which fields does an `ignoredWaivers` entry carry (stored hash, current hash, a
    replacement op)?
11. Which stored shapes "do not qualify" beyond the three plan 6 names (code-only, single-ref with
    no hash, never code)? Open cases: requirementId plus contentHash (hand-ref-with-hash, which
    `bindsCurrentText` accepts today); requirementIds with no hash (hand-refs-no-hash); an unknown
    code (hand-unknown-code, where `waivabilityOf` is undefined); refs that equal no finding's set
    (lint-wrong-set).
12. Engine prose scope: plan section 10 allows one prose-only engine edit (check.ts "2093-2104"
    plus the FND_SIMILAR_SEMANTIC suggestion). At base that range holds the conditional-conflict
    text, and "no never-code remedy contains waive" would also reach six more demotion actions in
    check.ts and suggestions in semantic.ts, numeric-contradiction.ts, number-spelling.ts and
    quantity-alias.ts. Which of these are in S3? What is the remedy for disclosure codes (D1:
    reword) versus triage codes (`vocab distinct`, not built)?
13. The report corpus omits messages and suggestions by design. Does the negative guard extend the
    corpus row, or run as a separate test over the same documents?
14. Gaming harness: is the `waive-by-code` move deleted or kept (the registry test needs a move
    that emits `waive`), and is a new move needed (a scoped waive of a never code, or a stored
    never-class waiver through the hand-edit channel)?
15. "formal-tier finding" in AC-5-6 versus FINDING_CLASS: hygiene (FND_DANGLING_REFERENCE,
    FND_MISSING_TRIGGER, FND_EXCLUDED_FROM_FORMAL) and anchor codes are `never` but are not
    formal-tier by the catalog's tier. Does the AC mean "every class except wording and
    structural"? Plan G2 and D1 read it that way.
16. Release: does this run bump the version in the four files and cut 2.0.0, or only mark the
    commits `feat!` for release-please? With D3 (format v4) in the dev line, do docVersion 3
    documents such as this fixture still load on the S3 build?
17. `propose-vocabulary --rescope-waivers` (plan 6 item 1) is not in the story. Is it in S3?

## Readings

Written by the reconciler (VDD run 2, job 849) from the three readings (board items 145, 146, 147:
jobs 824, 826, 827) and threat model v1 (`threat-model.json`, commit 7ac48ba, job 833). The
reconciler wrote no reading. The readings saw neither each other nor the threat model. Full texts
are the board results. This section is a digest.

- **Reading A** (job 824) measured base with the real `checkOp`, z3 and the fixture embedder. It
  gives 18 write-channel rows, 2 import rows, 21 check rows and 5 prose rows, each marked SETTLED
  (with the plan or spec line) or MY READING, and 13 open questions. It accepts hash-less `refs`
  and single `ref` ops (the fold computes the hash, and `ref` is normalized). A wrong-set stored
  waiver is silent at check. A stored `requirementId` with a hash qualifies. One
  `waived-blocking-lint` row per requirement.
- **Reading B** (job 826) ran the base CLI with the stub embedder. It gives about 60 examples in
  five groups (write, check, blocking lint, import, prose) and 12 open questions. It accepts
  hash-less and single-`ref` ops the way A does. A stored `requirementId` with a hash is inert. It
  leaves the wrong-set check outcome open, uses one `waived-blocking-lint` row naming both ORD ids,
  and says `--strict` exits 3 on blocking-lint-both. It did not read release or prose-site scope
  (its Q12).
- **Reading C** (job 827) ran pinned code with the fixture embedder. It gives 14 numbered examples,
  diagnostic and advice outcomes, and 10 open questions. It refuses every waive op that carries no
  `contentHash` (hash-less `refs`, single `ref`, import I2/I6), so import stores no v4 waiver. A
  wrong-set stored waiver gets `waiver-inert` with two singleton replacements. A stored
  `requirementId` with a hash is normalized and honored. A replacement waive keeps the legacy
  reason. It prefers fixing every engine prose site, and a release later with the dev line.

All three measured the same base facts. Every stored fixture document is `verified: false` at
base. repro-code-only.stored is already demoted at base, because `PAIR_BOUND_CODES` declines the
code-only opposition waiver and the ORD pair's GTWR_R7_VAGUE errors exclude ORD-R1 and ORD-R2. So
the reproducer's "Today: `verified: true`" does not hold on this fixture (question 7).

## Agreement

One row per candidate example. A cell gives that reading's concrete outcome. "—" means the reading
did not give one. The outcome is `settled` only when all three readings give the same concrete
outcome. Otherwise it is a question, or a ruling when an owner decision, an accepted gap or a
coordinator input settles it (the source is named). "B0" means open-opposition-candidate[CAB-R1,
CAB-R2] plus excluded-from-formal[ORD-R1] and excluded-from-formal[ORD-R2].

### Write channel (`apply` and `symspec waive` on base.json)

| id | candidate example | reading A | reading B | reading C | outcome |
|---|---|---|---|---|---|
| S3-037 | repro-code-only op: waive FND_OPPOSITION_CANDIDATE, no scope; add TNK-R1; add TNK-R2 | refused ERR_WAIVER_REFUSED; nothing written; exit 1 | refused; file byte-identical; TNK not added | refused; neither TNK add commits | settled |
| S3-001 | repro-scoped op: refs [CAB-R1, CAB-R2] + sha256:7092d137… | refused (never class) | refused (never class) | refused | settled |
| S3-001 | repro-single-ref op: ref CAB-R1 | refused | refused | refused | settled |
| S3-004 | lint-scoped op: GTWR_R5 refs [LOG-R1] + sha256:fd8b2c50… | accepted; stored requirementIds [LOG-R1] + fd8b2c50… | accepted; same stored form | accepted | settled |
| S3-005 | lint-refs-no-hash op: refs [LOG-R1], no contentHash | accepted; the fold computes fd8b2c50… | accepted; computed hash | refused ERR_WAIVER_REFUSED | question 1 |
| S3-005 | lint-single-ref op: ref LOG-R1 | accepted; normalized to refs [LOG-R1] + fd8b2c50… | accepted; normalized | refused (no hash) | question 1 |
| S3-005 | structural-cycle-scoped op: FND_CYCLE refs [CYC-A, CYC-B], no contentHash | accepted; b889a619… | accepted | refused | question 1 |
| S3-005 | `symspec waive GTWR_R5_INDEFINITE_ARTICLE --ref LOG-R1` | accepted, as lint-single-ref | as its lint-single-ref row | refused (no hash) | question 1 |
| S3-006 | the stored form any `ref` op leaves | requirementIds + hash, never requirementId | requirementIds + hash | nothing stored (refused) | settled: no waiver is stored as requirementId without a hash |
| S3-003 | lint-code-only op | refused (unscoped) | refused | refused | settled |
| S3-003 | structural-cycle-code-only op | final waive refused; nothing written | refused | refused; none of the stream commits | settled |
| S3-003 | `symspec waive <code>` with no `--ref` | refused, exit 1 | refused (its write channel covers `waive`) | refused (code-only) | settled |
| S3-007 | lint-wrong-set op: refs [LOG-R1, LOG-R2] + 716cbd99… | accepted at write; suppresses nothing at check | accepted at write | accepted at write; suppresses neither R5 | settled |
| S3-008 | lint-hash-mismatch: update LOG-R1, then waive with fd8b2c50… | refused ERR_USAGE "changed since the finding was raised"; nothing written | ERR_USAGE; nothing written | ERR_USAGE; neither op commits | settled |
| S3-004 | blocking-lint-both and blocking-lint-one ops | accepted | accepted | accepted | settled |
| S3-001, S3-002 | never-verdict op: two R7 waivers, then FND_CONTRADICTION refs [ORD-R1, ORD-R2] + 743432fc… | the third op refused; atomic, so the two R7 waivers are not written | refused on op 3; atomic | refused on op 3; neither R7 waiver commits | settled |
| S3-001 | never-hygiene op: FND_EXCLUDED_FROM_FORMAL ref ORD-R1, then refs [ORD-R2] + hash | first op refused | first op refused (hygiene never only by G2, its Q4) | first op refused | settled (G2 agrees, R3) |
| S3-009 | waive FND_NOT_A_CODE refs [LOG-R1] (op) | refused (no published class) | refused (its Q3 lists other options) | — (check side only: inert) | ruled by threat T22 (no reading contradicts) |
| S3-011 | the refusal message | names the code's never class and a remedy, not "add refs" | gist: never-class code cannot be waived | names the never code or the missing scope or hash | settled: the message names the code and its never class, or the missing scope; remedy wording per R24 |
| — | lint-stale-hash ops (waive, then update LOG-R1) | both accepted, as base | — | accepted, then the update | not pinned: B silent, base behavior unchanged, and the stored document is the case S3 changes |
| — | `unwaive`, any shape | never refused | — | — | not pinned on its own; S3-027 pins that every `unwaive` op check offers folds |

### Import channel

| id | candidate example | reading A | reading B | reading C | outcome |
|---|---|---|---|---|---|
| S3-012 | v4-waivers I1 (GTWR_R5, no scope) | refused into problems[] | refused into problems[] | refused | settled |
| S3-012 | I3 (FND_OPPOSITION_CANDIDATE --ref CAB-R1), I5 (FND_CONTRADICTION ref ORD-R1) | refused | refused (never) | refused | settled |
| S3-005 | I2 (GTWR_R5 --ref LOG-R2), I6 (GTWR_R7 ref ORD-R2) | accepted as refs + c2bd1271… and refs + 447120f0… | accepted, normalized | refused (no hash) | question 1 |
| S3-013 | I4 (GTWR_R7 --ref …00ff, matches nothing) | refused; not widened | refused; not widened (its Q6 lists widening) | refused; never widened; still in unresolved[] | settled |
| S3-012 | the import's exit and its requirements | 6 requirements written; exit 1 | exit 1; the rest written | 6 requirements written; exit 1 | settled |
| — | imported.waivers on v4-waivers.txt | 2 | 2 | 0 | follows question 1 |
| S3-014 | scoped-record.txt (JSONL waive, refs [LOG-R1] + fd8b2c50…) | accepted; imported.waivers 1 | imported | imported; no problems | settled |

### Check channel (stored documents, fixture embedder)

| id | candidate example | reading A | reading B | reading C | outcome |
|---|---|---|---|---|---|
| S3-037, S3-016 | repro-code-only.stored | inert; one waiver-inert; demotions open-opposition CAB and TNK, excluded-from-formal ×2 | inert; one waiver-inert; as un-waived | B0 + open-opposition TNK; one waiver-inert | settled |
| S3-016 | repro-scoped.stored | inert; CAB finding and demotion return | inert | inert; one waiver-inert | settled |
| S3-016 | repro-single-ref.stored | inert | inert | inert | settled |
| S3-025 | never-code replacement (repro-scoped, legacy-mixed W3) | unwaive + "rewrite required"; no waive | unwaive + "rewrite required"; no waive | unwaive + "rewrite required"; no waive | settled (R19, with R24) |
| S3-021 | lint-scoped.stored and lint-refs-no-hash.stored | qualify; R5[LOG-R1] suppressed; no diagnostic | qualify | qualify | settled |
| S3-017, S3-024 | lint-code-only.stored | inert; four R5 back; unwaive + four scoped waives | inert; unwaive + four waives, each its hash | inert; four back; per-finding scoped replacements | settled |
| S3-018, S3-024 | lint-single-ref.stored | inert; unwaive + waive refs [LOG-R1] fd8b2c50… | inert; same replacement | inert | settled |
| S3-022 | lint-wrong-set.stored: what check discloses | nothing | open (its Q1) | waiver-inert + singleton waives for LOG-R1 and LOG-R2 | question 2 |
| S3-028 | lint-stale-hash.stored | R5[LOG-R1] back; one ignoredWaivers entry (code, ids, stored fd8b2c50…, current 37bcc820…); no waiver-inert | same; not waiver-inert | same; one entry; no duplicate waiver-inert | settled |
| S3-029 | what that ignoredWaivers entry offers | unwaive + waive at 37bcc820… with a "re-reviewed" placeholder | — (fields only) | "review-required replacement advice" | question 6 |
| S3-019 | hand-refs-no-hash (requirementIds [LOG-R1], no hash) | inert; unwaive + waive [LOG-R1] fd8b2c50… | inert; same replacement | inert; R5 back | settled |
| S3-020 | hand-ref-with-hash (requirementId LOG-R1 + fd8b2c50…) | qualifies as [LOG-R1] | inert | normalized and honored | question 3 |
| S3-016 | hand-never-code-only | inert | inert | inert | settled |
| S3-017 | hand-unknown-code (FND_NOT_A_CODE, no scope) | inert; unwaive only | inert; "unknown code"; no waive | inert; unwaive only | settled |
| S3-023 | whether waiver-inert demotes | no: equals checking without it | no (its B13) | no: informational | settled |
| S3-026 | the reason on a replacement waive op | open (its Q12) | — | the legacy reason | question 5 |
| S3-016 | never-verdict.stored | FND_CONTRADICTION waiver inert; the error returns; waived-blocking-lint for ORD-R1, ORD-R2 | inert (its rule for never refs+hash) | inert; contradiction exposed; both-waived demotions | settled (row grouping: question 4) |
| S3-016, S3-025 | never-hygiene.stored | both inert; two diagnostics; FND_EXCLUDED_FROM_FORMAL back; remedy "rephrase ORD-Rn" | inert (its never rule) | both inert; two diagnostics; B0 | settled; remedy per R24 |
| S3-017, S3-024 | structural-cycle-code-only.stored | inert; FND_CYCLE back; unwaive + waive [CYC-A, CYC-B] b889a619… | inert (its code-only rule) | inert; FND_CYCLE back | settled |
| S3-021 | structural-cycle-scoped.stored | qualifies | qualifies (its refs+hash rule) | qualifies; FND_CYCLE suppressed | settled |
| S3-016..S3-024 | legacy-mixed | W1, W2, W3, W5 inert; W4 qualifies; 4 diagnostics; waived-blocking-lint [ORD-R1] | the same, waiver by waiver | the same | settled |
| S3-023 | removing an inert waiver from a document | findings, demotions, verified unchanged | unchanged | unchanged | settled |

### Demotions and the reproducer

| id | candidate example | reading A | reading B | reading C | outcome |
|---|---|---|---|---|---|
| S3-033 | blocking-lint-one.stored | waived-blocking-lint [ORD-R1]; uncovered-requirement [ORD-R1]; excluded-from-formal [ORD-R2]; open-opposition [CAB] | the same | the same | settled |
| S3-034 | blocking-lint-both.stored: FND_CONTRADICTION error | present | present | present | settled |
| S3-034 | blocking-lint-both.stored: rows and exit | two rows; exit 1 | one row naming both; `--strict` exit 3 | grouping unspecified; the error keeps exit 1 | question 4 |
| S3-036 | base.json, no waivers | — | no waived-blocking-lint; unchanged | B0 | ruled by threat T12 (no reading contradicts) |
| S3-035 | a waived blocking lint on a consistent pair (gaming control twin) | verified false; `--strict` exit 3 | still demotes | the demotion stays until the wording is fixed | ruled: G3 |
| S3-036 | an inert (code-only) GTWR_R7 waiver | — (inert means absent) | no re-admission; no waived-blocking-lint | — | ruled by threat T13 (no reading contradicts) |
| S3-038 | how the reproducer is red on base | write half only, a cut-down document, or amend the AC | assert demotions, a cut-down document, or both | assert refusals, diagnostics and demotion ids | question 7 |

### Advice, prose, published surfaces, harness, release

| id | candidate example | reading A | reading B | reading C | outcome |
|---|---|---|---|---|---|
| S3-039, S3-040 | a waive for a never code in repair.ops, demotion actions, suggestions | none | none | none | settled |
| S3-040 | which engine prose sites | every site | every site | every site (its Q9, option a preferred) | settled |
| S3-041 | the excluded-from-formal remedy | waive GTWR_R7 refs [ORD-R1] + e376ee5c…, and say it then demotes | only waives the fold accepts (its E3); form open (its Q7) | fix the blocking wording | question 8 |
| S3-042 | scope.ts "or waived" | absent | absent | absent | settled |
| S3-044 | WAIVABILITY_ENFORCED and the published statement | true; "enforced" sentence | true | — | ruled: coordinator input (a) |
| S3-043 | craft.ts skill body on opposition candidates | — | — | — | ruled: coordinator input (b) |
| S3-045 | engine prose naming `vocab distinct` | never in this build | — | — | ruled: coordinator input (c) |
| — | `propose-vocabulary --rescope-waivers` in S3 | — | not read | asks (its Q8) | ruled: coordinator input (c), R36 |
| S3-048 | the 11 waive-by-code KNOWN_ESCAPES rows | — | deleted; exactness green | all 11 close; keep the move; add raw and scoped-never coverage | settled by the story and threat T21 |
| S3-052 | the build commit | — | not read (its Q12) | feat! | ruled: coordinator input (d) |
| S3-053 | the version files | — | not read | later, with the dev line (its Q10, option a) | question 10 |

### Threat-born candidates (threat model v1, rule 13)

A mitigation is settled when it states a concrete outcome no reading contradicts. Otherwise it is
a question.

| threat | mitigation, as candidate | contradicted by | outcome |
|---|---|---|---|
| T1, T2 | never-class waive refused whatever its scope | none | settled with the readings: S3-001 |
| T3 | code-only waive refused for every code | none | settled: S3-003 |
| T4 | no stored requirementId without a hash | none (refuse or normalize is question 1) | settled: S3-006 |
| T5 | wrong-set waiver disclosed; isWaivedBlocking iff isWaived | A (no disclosure) on the first clause | property settled: S3-032; disclosure is question 2 |
| T6 | stale waivers in ignoredWaivers under any output filter | none | settled: S3-028 |
| T7 | mismatched hash refused; hash-less refs put to a person | none | settled: S3-008; the rest is question 1 |
| T8 | stored never-class waivers inert whatever scope and hash | none | settled: S3-016 |
| T9 | import folds through apply's classifier | none | settled: S3-012, S3-013 |
| T10 | each import refusal named with line, code, scope and replacement | none | settled: S3-015 |
| T11 | a stored waiver reaches the engine exactly when the fold would accept it as an op | A and B (an op `refs [LOG-R1]` with no hash is accepted while the same stored waiver is inert) | narrowed to the uncontradicted direction: S3-030 |
| T12 | waived blocking lint demotes; no waivers equals base | none | settled: S3-033, S3-036 |
| T13 | waived-blocking-lint ids from exactly the engine's waiver list | none | settled: S3-036 |
| T14 | every repair op decodes and folds; no waive of a never code | none | settled: S3-039 |
| T15 | no never-code action, message or suggestion contains "waive" | none | settled: S3-040 |
| T16 | skill body, scope, explain, AGENTS.md teach no never-code waive | none | settled with coordinator input (b): S3-042, S3-043 |
| T17 | ENFORCED true only when all three channels enforce | none | settled with coordinator input (a): S3-044 |
| T18 | every replacement op folds and every command parses | none | settled with coordinator input (c): S3-027, S3-045 |
| T19 | replacement waive carries a placeholder reason | C (the legacy reason) | question 5 |
| T20 | harness measures scoped never-code waives and the raw channel | none | settled: S3-049 |
| T21 | rows deleted with the move kept; corpus deltas attributable | none | settled: S3-048, S3-051 |
| T22 | an unclassified code refused at write and inert at check | none | settled: S3-009 |
| T23 | case and whitespace variants refused and inert | none | settled: S3-010 |
| T24 | applied waivers listed; scope says the hash binds text; a person decides on derives-cycle | none for the first two | settled: S3-046; derives-cycle is question 9 |
| T25 | no new clean (fixture, move) pair | none | settled: S3-050 (subject to question 9) |
| T26 | engine diff prose only; the pair-bound decline kept | none | settled: S3-031 |

### Notes (agreement kept, not overruled)

1. Plan 5.3 says a `ref` "must equal the finding's requirement ids". All three readings found
   that the fold computes no findings and accepted lint-wrong-set at write. The agreement stands
   (S3-007). Set equality is tested only at check, where the waiver suppresses nothing.
2. The readings agree that a stored hash-less `requirementIds` waiver is inert (S3-019). A and B
   also accept the same waiver as a hash-less op (question 1, option a). If the person rules (a),
   write and check are deliberately asymmetric: the op gets a hash the fold computes, and the
   stored form has none. T11's "exactly when" therefore holds only one way (S3-030).
3. Reading A measured no FND_SIMILAR_SEMANTIC on base.json with the fixture embedder, although the
   intake table lists one. The contract must not assume that finding without re-measuring it.
4. Reading B reported base never-verdict.stored as exit 0 with the stub embedder. Reading A
   reported exit 3 with the fixture embedder. The intake already requires the fixture embedder
   for any assertion on `verified` or exit.
5. Reading B says `antonym` "requires vocabulary". The `antonym` op exists in this build
   (`ops.ts` AntonymOp, `symspec antonym`). Coordinator input (c) names it as an existing remedy.
6. never-verdict's atomic refusal also drops its two valid GTWR_R7 waivers. All three readings
   accept this. The author resubmits the stream without the FND_CONTRADICTION op.
7. Base `exitCodeForEnvelope` (`src/app/runtime/exit.ts`) returns 1 for an error-severity finding
   before it returns 3 for a failed strict gate. Question 4 asks whether that order holds on
   blocking-lint-both.

## Settled examples

Each is a concrete outcome on the shared fixture, with its behavior ids. "Refused" means the op's
result is `{ok: false, code: 'ERR_WAIVER_REFUSED'}`, `written: false`, exit 1, and the document is
byte-identical, unless stated otherwise.

1. repro-code-only on base.json: op 0 (waive FND_OPPOSITION_CANDIDATE, no scope) is refused, and
   TNK-R1 and TNK-R2 are not added. base.json plus TNK-R1 and TNK-R2 with no waiver checks with
   separate open-opposition-candidate demotions for [CAB-R1, CAB-R2] and [TNK-R1, TNK-R2], and
   FND_OPPOSITION_CANDIDATE is unwaived. (S3-037, S3-001, S3-002)
2. repro-scoped (refs [CAB-R1, CAB-R2] + sha256:7092d137…) and repro-single-ref (ref CAB-R1) are
   refused on their first op, though the first is fully scoped. (S3-001)
3. never-verdict: op 3 (FND_CONTRADICTION refs [ORD-R1, ORD-R2] + sha256:743432fc…) is refused,
   and the two GTWR_R7 waivers before it are not written. (S3-001, S3-002)
4. never-hygiene: the first op (FND_EXCLUDED_FROM_FORMAL ref ORD-R1) is refused. Hygiene is never
   (G2). (S3-001)
5. Every never-class code of every never class (verdict, disclosure, triage, hygiene, anchor) is
   refused with no scope, with `ref`, with `refs`, and with `refs` plus the matching hash. Under D1
   that includes FND_NUMERIC_UNCOMPARED and FND_RELATIONAL_UNCHECKED. (S3-001)
6. lint-code-only and structural-cycle-code-only are refused, and so is `symspec waive <code>`
   with no `--ref`. Nothing of either stream is written. (S3-003, S3-002)
7. lint-scoped is accepted and stored as `{code: GTWR_R5_INDEFINITE_ARTICLE, requirementIds:
   [LOG-R1], contentHash: sha256:fd8b2c50…}`. blocking-lint-both and blocking-lint-one are
   accepted. (S3-004)
8. After any `ref` op, no stored waiver has `requirementId` without a `contentHash`. (S3-006)
9. lint-wrong-set is accepted at write and stored as requirementIds [LOG-R1, LOG-R2] +
   sha256:716cbd99…. At check it suppresses neither GTWR_R5 finding on LOG-R1 or LOG-R2.
   (S3-007)
10. lint-hash-mismatch: op 2 is refused with ERR_USAGE "changed since the finding was raised", not
    ERR_WAIVER_REFUSED. Neither the update nor the waiver is written. (S3-008)
11. waive FND_NOT_A_CODE refs [LOG-R1] is refused, and so is any code with no own FINDING_CLASS row
    (an Object.prototype name such as `constructor`). Every code the catalog publishes has its own
    row. (S3-009)
12. ` FND_CONTRADICTION`, `fnd_contradiction` and every other case or whitespace variant of a never
    code is refused at write, is inert at check, and suppresses nothing. (S3-010)
13. A refusal names the code and its never class, or says that refs and a content hash are
    missing. It names only commands and ops this build has. (S3-011)
14. import v4-waivers.txt: I1 (code-only), I3 and I5 (never) are refused into `problems[]`, each
    with its line, code, scope, reason ERR_WAIVER_REFUSED and a replacement. I4 is refused and no
    document-wide waiver is stored. The six requirements are written, and import exits 1. (S3-012,
    S3-013, S3-015)
15. import scoped-record.txt: the JSONL record with `refs` and `contentHash` is accepted (no
    unexpected-keys problem), `imported.waivers` is 1, and the stored waiver is requirementIds
    [LOG-R1] + sha256:fd8b2c50…. (S3-014)
16. repro-code-only.stored: the waiver is inert, with one waiver-inert diagnostic. The demotions are
    open-opposition-candidate [CAB-R1, CAB-R2], open-opposition-candidate [TNK-R1, TNK-R2],
    excluded-from-formal [ORD-R1] and excluded-from-formal [ORD-R2]. repro-scoped.stored and
    repro-single-ref.stored are inert too, and the CAB finding and demotion come back. (S3-016,
    S3-037)
17. hand-never-code-only, never-verdict.stored's FND_CONTRADICTION waiver, never-hygiene.stored's
    two waivers, legacy-mixed W3 and W5: each is inert with its own waiver-inert diagnostic, and the
    run equals the same document with that waiver deleted. never-verdict.stored reports
    FND_CONTRADICTION (error) on ORD-R1, ORD-R2 again. A stale-hash waiver of a never code is
    disclosed once, as waiver-inert. (S3-016)
18. lint-code-only.stored, structural-cycle-code-only.stored, hand-unknown-code and legacy-mixed W1
    are inert. All four GTWR_R5 findings, or FND_CYCLE [CYC-A, CYC-B], come back. (S3-017)
19. lint-single-ref.stored and legacy-mixed W2 are inert even though each names the finding's one
    requirement. (S3-018)
20. hand-refs-no-hash (requirementIds [LOG-R1], no hash) is inert, and GTWR_R5 on LOG-R1 comes
    back. (S3-019)
21. lint-scoped.stored, lint-refs-no-hash.stored, structural-cycle-scoped.stored and legacy-mixed W4
    qualify. Each suppresses exactly its finding, with no diagnostic. (S3-021)
22. waiver-inert is a `data.diagnostics` entry of severity info. It demotes nothing. Deleting an
    inert waiver from any fixture document leaves `data.findings`, `data.coverage.demotions` and
    `data.verified` unchanged. (S3-023)
23. For a scoped-class code, the waiver-inert diagnostic carries the exact `unwaive` op for the
    stored scope, plus one `{op: waive, code, refs: <the finding's exact ids>, contentHash: <current
    hash>}` per finding it matches today. lint-code-only.stored gets four: [LOG-R1] fd8b2c50…,
    [LOG-R2] c2bd1271…, [ORD-R1] e376ee5c…, [ORD-R2] 447120f0…. lint-single-ref.stored and
    hand-refs-no-hash get [LOG-R1] fd8b2c50…. structural-cycle-code-only.stored gets [CYC-A, CYC-B]
    b889a619…. (S3-024)
24. For a never-class code, the waiver-inert diagnostic carries the `unwaive` op and "rewrite
    required", and no waive op. For an opposition pair it may also name `symspec antonym` for a pair
    that really are contraries. It never names `vocab distinct` or `propose-vocabulary
    --rescope-waivers`. (S3-025, S3-045)
25. Every op on a waiver-inert or ignoredWaivers entry decodes as a DocumentOp and folds under
    MUTATE_OPTIONS on the checked document. Every command it names parses under this build's CLI.
    (S3-027)
26. lint-stale-hash.stored: GTWR_R5 on LOG-R1 is back. `data.ignoredWaivers` holds one entry with
    code GTWR_R5_INDEFINITE_ARTICLE, requirementIds [LOG-R1], stored hash sha256:fd8b2c50… and
    current hash sha256:37bcc820…, whatever `--min-severity` or code filter the run uses. It has no
    waiver-inert diagnostic. With no stale waiver, `ignoredWaivers` is empty. (S3-028)
27. No stored waiver reaches the engine when the S3 fold would refuse the same waiver as an op:
    never-class, code-only, an unknown code, or a contentHash that does not match the current text.
    (S3-030)
28. A stored code-only FND_OPPOSITION_CANDIDATE waiver is still declined by the engine even when
    compat forwards it. The engine diff is prose only, and waiver-scope.test.ts, verified.test.ts and
    package-boundary.test.ts pass unchanged. (S3-031)
29. For every stored waiver, `isWaivedBlocking` re-admits a requirement exactly when `isWaived`
    suppresses that requirement's blocking finding. (S3-032)
30. blocking-lint-one.stored: the demotions are waived-blocking-lint [ORD-R1], uncovered-requirement
    [ORD-R1], excluded-from-formal [ORD-R2] and open-opposition-candidate [CAB-R1, CAB-R2].
    `verified` is false. (S3-033)
31. blocking-lint-both.stored reports FND_CONTRADICTION (error) on ORD-R1, ORD-R2, waived-blocking-lint
    covers ORD-R1 and ORD-R2, and `verified` is false. (S3-034; rows and exit in question 4)
32. The gaming waived-blocking-lint control twin (consistent, verified at base) gives
    `verified: false` and `--strict` exit 3 on S3. (S3-035)
33. The waived-blocking-lint ids equal the requirements excluded with no waivers minus those excluded
    under exactly the waiver list toEngineDoc gave the engine. base.json has no waived-blocking-lint,
    and adding or removing an inert or stale waiver leaves the demotion unchanged. (S3-036)
34. Over every report-corpus and fixture document, every `repair.ops` op decodes and the S3 fold
    accepts it on the checked document, and no offered waive names a never-class code. (S3-039)
35. No demotion action, finding message or suggestion for a never-class code contains "waive", at
    every engine site. The guard reads the prose fields the corpus row omits. (S3-040)
36. `coverageDemotion` in scope.ts does not contain "or waived", and check:agents shows no drift.
    (S3-042)
37. The installed skill body (craft.ts) offers no waiver for FND_OPPOSITION_CANDIDATE or any other
    never code. "The always-safe third option is the reviewed waiver" is absent. (S3-043)
38. WAIVABILITY_ENFORCED is true. waivability.test.ts holds both halves with the flag true, for one
    never code of each never class through apply, import and a stored document. Every "NOT enforced
    by this build" sentence is absent from AGENTS.md, explain's `waivableEnforced` and the manifest.
    (S3-044)
39. Every waiver the engine applied is listed in the check payload with its code, requirement ids
    and reason. The published scope says a content hash binds the text and not the reviewer.
    (S3-046)
40. The 11 waive-by-code KNOWN_ESCAPES rows are deleted with the waive-by-code move still
    registered, and the exactness test is green on every shard. Re-adding any of them turns it red.
    OP_COVERAGE maps `waive` to a move that emits a waive op. (S3-048)
41. The harness measures a scoped waive of each baseline finding over its exact ids and current
    hash, and the same waivers plus a code-only one written into the stored JSON with no fold. On
    every fixture whose seeded finding is never-class, neither reaches a clean verdict. (S3-049)
42. The clean (fixture, move) pairs after S3 are base's minus the 11 waive-by-code rows, with none
    added. (S3-050)
43. Every changed report-corpus row is a verdict delta attributable to AC-5-6. (S3-051)
44. The S3 build commit is `feat!` with a `BREAKING CHANGE:` footer in its own body. (S3-052)

## Questions

Each is a choice between concrete scenarios on the fixture. "Redirect with an example" is always
open. A ruling is written under its question as `Ruled: (x).`, and as an R line under Rulings.

1. S3-005 · A waive op that carries no contentHash. Given base.json, when an agent applies GTWR_R5
   refs [LOG-R1] with no contentHash (lint-refs-no-hash), or ref LOG-R1 (lint-single-ref,
   `symspec waive GTWR_R5_INDEFINITE_ARTICLE --ref LOG-R1`, import I2 and I6), then
   (a) it is accepted: a `ref` becomes refs [LOG-R1], and the fold computes and stores
   sha256:fd8b2c50…; `symspec waive --ref` keeps working; import stores I2 and I6 (imported.waivers
   2) [readings A and B];
   (b) it is refused ERR_WAIVER_REFUSED, because an op must carry the hash it was raised on;
   so `symspec waive` would need new `--refs` and `--content-hash` flags to write any waiver; import stores
   no v4 waiver (imported.waivers 0) [reading C];
   (c) refs with no hash are accepted with the computed hash, and a bare `ref` is refused [reading
   A's alternative].
   Options: (a) Accept, fold computes hash · (b) Refuse without a hash · (c) Accept refs, refuse bare ref · Redirect with an example.
   Ruling: R37, below. Ruled: (a).

2. S3-022 · A stored waiver whose refs match no finding. Given lint-wrong-set.stored.json (GTWR_R5
   refs [LOG-R1, LOG-R2] + sha256:716cbd99…, while each GTWR_R5 finding names one requirement),
   when check runs, both findings stay (settled), and
   (a) nothing is disclosed: the waiver applies to nothing [reading A];
   (b) a waiver-inert diagnostic says it matches no finding and offers the unwaive op only [reading
   B's option a];
   (c) a waiver-inert diagnostic offers the unwaive op plus waives for [LOG-R1] sha256:fd8b2c50… and
   [LOG-R2] sha256:c2bd1271… [reading C].
   Options: (a) Silent · (b) Inert, unwaive only · (c) Inert, unwaive plus two scoped waives · Redirect with an example.
   Ruling: R38, below. Ruled: redirect (no lettered option; the ruling states the outcome).

3. S3-020 · A stored single requirementId that carries a contentHash. Given
   hand-ref-with-hash.json (GTWR_R5, requirementId LOG-R1, contentHash sha256:fd8b2c50…, text
   unchanged), when check runs, then
   (a) it qualifies as [LOG-R1]: GTWR_R5 on LOG-R1 stays suppressed, with no diagnostic [readings A
   and C];
   (b) it is inert: GTWR_R5 on LOG-R1 comes back, and waiver-inert offers unwaive plus waive refs
   [LOG-R1] sha256:fd8b2c50… [reading B].
   Options: (a) Qualifies · (b) Inert, with a replacement · Redirect with an example.
   Ruling: R39, below. Ruled: (a).

4. S3-034 · The demotion rows and exit for blocking-lint-both. Given blocking-lint-both.stored.json
   (GTWR_R7_VAGUE waived on ORD-R1 and on ORD-R2, each refs + hash), when `check --strict` runs,
   FND_CONTRADICTION (error) on ORD-R1, ORD-R2 is reported and `verified` is false (settled), and
   (a) there are two waived-blocking-lint demotions, [ORD-R1] and [ORD-R2], and exit 1 [reading A];
   (b) there is one waived-blocking-lint demotion naming [ORD-R1, ORD-R2], and exit 1 (base exit
   order: an error finding returns 1 before the strict gate's 3) [reading C allows either grouping];
   (c) there is one demotion naming both, and exit 3 [reading B].
   Options: (a) Two rows, exit 1 · (b) One row, exit 1 · (c) One row, exit 3 · Redirect with an example.
   Ruling: R40, below. Ruled: (b).

5. S3-026 · The reason on a replacement waive op. Given lint-code-only.stored.json (code-only
   GTWR_R5 waiver, reason "indefinite articles are house style"), when check offers waive refs
   [LOG-R1] sha256:fd8b2c50… as a replacement, its reason is
   (a) "indefinite articles are house style", the legacy reason verbatim [reading C];
   (b) a placeholder asking for a per-finding review, which the fold accepts unedited [threat T19];
   (c) a placeholder, and the fold refuses a waive whose reason still holds it [threat T19 puts this
   to a person].
   Options: (a) Legacy reason verbatim · (b) Placeholder, accepted as is · (c) Placeholder, refused until edited · Redirect with an example.
   Ruling: R41, below. Ruled: (a).

6. S3-029 · What a stale-hash entry offers. Given lint-stale-hash.stored.json (GTWR_R5 refs [LOG-R1]
   at sha256:fd8b2c50…, while LOG-R1 now hashes to sha256:37bcc820…), when check runs, GTWR_R5 on
   LOG-R1 is back and `data.ignoredWaivers` holds one entry with code, ids and both hashes
   (settled), and the entry also offers
   (a) the unwaive op plus waive refs [LOG-R1] sha256:37bcc820… with a "re-reviewed" placeholder
   reason [reading A];
   (b) the unwaive op and a note to review the new text before waiving again, with no waive op
   [closest to reading C's "review-required replacement advice"];
   (c) nothing beyond those fields [threat T6 lists only them; reading B is silent].
   Options: (a) Unwaive plus waive at the new hash · (b) Unwaive plus a re-review note · (c) Fields only · Redirect with an example.
   Ruling: R42, below. Ruled: (b).

7. S3-038 · How the AC-5-6 reproducer is red on base. All three readings measured
   repro-code-only.stored.json as `verified: false` at base: the engine's PAIR_BOUND_CODES already
   declines the code-only opposition waiver, and the ORD pair's GTWR_R7 errors also demote. So
   AC-5-6's "Today: `verified: true`" does not hold on this fixture. Then
   (a) the write half carries the absence proof: at base the waive is accepted, and on S3 it is
   refused ERR_WAIVER_REFUSED; the check half (refusal, diagnostics, exact demotion ids) is a
   regression that also passes on base [reading A's option a; reading C];
   (b) as (a), plus a document with only the CAB and TNK requirements, so the check half asserts
   `verified`, recorded as already false at base [readings A and B, option b];
   (c) as (a), plus the AC's "Today" line is amended in spec.md.
   Options: (a) Write half only · (b) Also a CAB+TNK-only document · (c) Also amend the AC's Today line · Redirect with an example.
   Ruling: R43, below. Ruled: (b).
   Reconciler note (not part of the ruling): readings A, B and C and intake ambiguity 5 measured that
   base's PAIR_BOUND_CODES (`check.ts` ~:684, :711) does not apply a code-only FND_OPPOSITION_CANDIDATE
   waiver, so at base the CAB pair still demotes open-opposition-candidate; R43's base assertion
   `verified: true` must be measured on the CAB+TNK document before the contract pins it.

8. S3-041 · The excluded-from-formal remedy for a blocking lint. Given base.json (ORD-R1 is
   excluded-from-formal because of GTWR_R7_VAGUE, error), when check prints that demotion's action
   and repair.ops, then
   (a) it still offers a waive of GTWR_R7_VAGUE refs [ORD-R1] sha256:e376ee5c…, in the form the fold
   accepts, and says ORD-R1 will then demote waived-blocking-lint [reading A; reading B's E3 leans
   here];
   (b) it offers only rephrasing ORD-R1, and no waive op [reading C].
   Options: (a) Scoped waive plus the demotion note · (b) Rephrase only · Redirect with an example.
   Ruling: R44, below. Ruled: redirect (no lettered option; the ruling states the outcome).

9. S3-047 · A scoped FND_CYCLE waiver on the derives-cycle fixture. Given the gaming fixture
   derives-cycle (FND_CYCLE, structural, so scoped), when the new scoped-waive move (S3-049) waives
   FND_CYCLE over the cycle's exact ids and current hash, the run verifies by design, and
   (a) it is listed as a designed escape in KNOWN_ESCAPES, with the reason that a scoped waiver over
   the current text is the designed discharge;
   (b) the scoped-waive move runs only on fixtures whose seeded finding is never-class, so it adds no
   clean pair and no row [threat T24 asks the person].
   Options: (a) List it as a designed escape · (b) Measure never-class fixtures only · Redirect with an example.
   Ruling: R45, below. Ruled: (b).

10. S3-053 · Whether S3 bumps the version. Given the finished S3 branch with 1.2.1 in the four
    version files, then
    (a) the commits declare `feat!` with `BREAKING CHANGE:`, the four files stay at 1.2.1, and the
    major is cut later with the dev line feat/controlled-vocabulary [reading C prefers];
    (b) S3 also sets the four version files to 2.0.0.
    Options: (a) Version stays, major cut later · (b) Bump to 2.0.0 in S3 · Redirect with an example.
    Ruling: R46, below. Ruled: (a).

## Rulings

R1: Every waive of a never-class code is refused with ERR_WAIVER_REFUSED, whatever its scope and hash. Source: agreement (A, B, C); threats T1, T2. Behaviors S3-001.
R2: D1: disclosure codes that mean "not compared" (FND_NUMERIC_UNCOMPARED, FND_RELATIONAL_UNCHECKED and their siblings) are never waivable; the discharge is rewording. Source: decision D1. Behaviors S3-001, S3-016, S3-039.
R3: G2: waivability is by meaning: verdict, triage, disclosure, hygiene and anchor are never; wording and structural are scoped. AC-5-6's "formal-tier finding" reads as every never class (reading B's Q4, intake ambiguity 15). Source: gap G2. Behaviors S3-001, S3-016.
R4: A refused waive aborts the whole atomic stream: nothing is written, exit 1. Source: agreement. Behaviors S3-002.
R5: A code-only waive is refused for every code, scoped classes included. Source: agreement; threat T3. Behaviors S3-003.
R6: A refs plus matching contentHash waive of a scoped-class code is accepted and stored as requirementIds plus that hash. Source: agreement. Behaviors S3-004.
R7: No waiver is ever stored as requirementId without a contentHash. Source: agreement; threat T4. Behaviors S3-006.
R8: A waive whose refs equal no finding's set is accepted at write and suppresses nothing at check. Source: agreement (note 1). Behaviors S3-007.
R9: A supplied contentHash that differs from the current text is refused with ERR_USAGE, as at base, and nothing is written. Source: agreement; threat T7. Behaviors S3-008.
R10: A code with no own FINDING_CLASS row is refused at write and inert at check, and every published code has its own row. Source: threat T22 (no reading contradicts). Behaviors S3-009.
R11: Case and whitespace variants of a never code are refused, inert and suppress nothing. Source: threat T23 (no reading contradicts). Behaviors S3-010.
R12: The refusal message names the code and its never class, or the missing refs and hash. Source: agreement. Behaviors S3-011.
R13: Import folds every waiver record through apply's classifier: I1, I3 and I5 are refused into problems[], I4 is refused and never widened, the requirements are written and import exits 1; a refs plus contentHash record is accepted. Source: agreement; threat T9. Behaviors S3-012, S3-013, S3-014.
R14: Each waiver import refuses is named with its line, code, scope and replacement. Source: threat T10 (no reading contradicts). Behaviors S3-015.
R15: D4: "Legacy documents lose the waiver discharge for opposition candidates; they rewrite or opt into a vocabulary." A stored never-class waiver is inert whatever its scope and hash, disclosed once as waiver-inert, and the run equals the document with it deleted. Source: decision D4; agreement; threat T8. Behaviors S3-016, S3-025.
R16: A stored code-only waiver, a stored single requirementId with no hash and a stored requirementIds with no hash are inert; a stored refs plus matching hash waiver of a scoped code qualifies. Source: agreement. Behaviors S3-017, S3-018, S3-019, S3-021.
R17: waiver-inert is an info data.diagnostics entry that demotes nothing; deleting an inert waiver changes no finding, demotion or verified. Source: agreement. Behaviors S3-023.
R18: G4: ship as breaking with a waiver-inert migration diagnostic. For a scoped code it carries the exact unwaive op plus one scoped waive refs plus current contentHash per finding the waiver matches today. Source: gap G4; agreement. Behaviors S3-024.
R19: For a never code, waiver-inert carries the unwaive op and "rewrite required", and no waive op. Source: agreement; decision D4; coordinator input (c). Behaviors S3-025.
R20: Every replacement op decodes and folds under MUTATE_OPTIONS, and every named command parses under this build's CLI. Source: threat T18; coordinator input (c). Behaviors S3-027.
R21: A stale-hash waiver brings its finding back and is listed once in data.ignoredWaivers with code, requirement ids, stored hash and current hash under any output filter, and not as waiver-inert. Source: agreement; threat T6. Behaviors S3-028.
R22: No stored waiver the S3 fold would refuse as an op reaches the engine. Source: threat T11, narrowed to the direction no reading contradicts (note 2). Behaviors S3-030.
R23: The engine-tier diff is prose only, and the engine still declines a stored code-only FND_OPPOSITION_CANDIDATE waiver. Source: threat T26 (no reading contradicts). Behaviors S3-031.
R24: Coordinator input (c): `propose-vocabulary --rescope-waivers` and `vocab distinct` do not exist on this build (S7, S9, S17 are not built). Every waiver-inert replacement, repair suggestion, refusal message and engine remedy names only commands and ops this build has: for never codes, rewrite the requirement, or the existing `antonym` op where the pair really are contraries. A test guards it. This replaces plan 5.3's and section 10's "name `vocab distinct`" (reading A's Q13). Source: coordinator input (c). Behaviors S3-011, S3-025, S3-027, S3-040, S3-045.
R25: isWaivedBlocking re-admits a requirement exactly when isWaived suppresses its blocking finding. Source: threat T5 (property clause; no reading contradicts it). Behaviors S3-032.
R26: G3: a waived blocking lint keeps re-admitting its requirement, adds the waived-blocking-lint demotion, and never yields verified true. Source: gap G3; agreement. Behaviors S3-033, S3-035.
R27: The waived-blocking-lint set is the requirements excluded with no waivers minus those excluded under exactly toEngineDoc's waiver list; with no waivers the demotions equal base's. Source: threats T12, T13 (no reading contradicts). Behaviors S3-036.
R28: The reproducer: the opposition waive is refused, and the un-waived CAB and TNK pairs demote separately; the stored reproducer's waiver is inert. Source: agreement. Behaviors S3-037.
R29: No repair op, demotion action, finding message or suggestion for a never code offers or says waive, at every site. Every repair op folds. Source: agreement; threats T14, T15. Behaviors S3-039, S3-040.
R30: "or waived" is absent from scope.ts. Source: agreement. Behaviors S3-042.
R31: Coordinator input (b): the installed skill body (craft.ts ~:244-249) calls the reviewed pair waiver the always-safe option for FND_OPPOSITION_CANDIDATE, a never-class code; it must change so it teaches no refused move. Source: coordinator input (b); threat T16. Behaviors S3-043.
R32: Coordinator input (a): WAIVABILITY_ENFORCED in signal-classes.ts flips to true with S3, so every published "NOT enforced by this build" statement (AGENTS.md through agents-doc, explain's waivableEnforced) changes with it, behind the existing two-halves flag test plus a negative guard. Source: coordinator input (a); threat T17. Behaviors S3-044.
R33: Every applied waiver is listed in the check payload with code, ids and reason, and the published scope says a content hash binds the text, not the reviewer. Source: threat T24 (first two clauses). Behaviors S3-046.
R34: The 11 waive-by-code KNOWN_ESCAPES rows are deleted with the move kept and exactness green. The harness gains the scoped never-code and raw-channel measurements, adds no clean pair, and every report-corpus delta is attributable to AC-5-6. Source: the story; threats T20, T21, T25; reading C. Behaviors S3-048, S3-049, S3-050, S3-051.
R35: Coordinator input (d): the S3 build commit is feat! with a BREAKING CHANGE: footer in its own body. Source: coordinator input (d). Behaviors S3-052.
R36: `propose-vocabulary --rescope-waivers` is neither built nor named in S3. G4's "and the --rescope-waivers stream" waits for the slice that builds the command (S9); the waiver-inert diagnostics carry the ops now (reading C's Q8, intake ambiguity 17). Source: coordinator input (c); the story. Behaviors S3-045.
R37 (Q1, S3-005): (a) Accept. A waive op with refs but no contentHash, or a single ref, is accepted: ref is normalized to refs [ref], and the fold computes the contentHash from the current text itself, as it does today (plan 5.3: 'ref is normalized to refs: [ref]' ... 'The fold computes contentHash itself, as it does today'). The stored waiver always has refs and a contentHash. A supplied hash that differs from the current text stays ERR_USAGE (S3-008). Applies to apply, symspec waive and import alike. Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-005, S3-008.
R38 (Q2, S3-022): A well-formed stored waiver whose refs match no finding's id set suppresses nothing and is disclosed as waiver-inert (reason: matches no finding) with its unwaive op. It additionally carries one scoped waive refs+current-hash op per finding it suppressed at base (the migration's 'for every finding it matches today' rule, computed with base matching); when it suppressed nothing at base, unwaive only. Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-022.
R39 (Q3, S3-020): (a) Qualifies. A stored single requirementId with a matching contentHash is the normalized form of refs [id] plus that hash: it suppresses exactly its finding, with no diagnostic. Only a single ref WITHOUT a hash goes inert (plan section 6). Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-020.
R40 (Q4, S3-034): (b) One waived-blocking-lint demotion row naming both re-admitted requirements; exit 1, because the FND_CONTRADICTION error finding sets the exit before any demotion; --strict exit 3 only when demotions are the only failure (S3-035). Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-034, S3-035.
R41 (Q5, S3-026): (a) The replacement scoped waive op carries the legacy reason verbatim followed by a fixed provenance marker (one exported constant, e.g. ' (rescoped from a legacy waiver)'), so the rescoped, narrower waiver keeps its reviewer's reason and says where it came from; it decodes and folds as is (S3-027). Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-026, S3-027.
R42 (Q6, S3-029): (b) An ignoredWaivers entry (stale hash) carries its unwaive op and a note that the requirement's text changed since the waiver was reviewed and must be re-reviewed; it offers NO waive op at the new hash. Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-029.
R43 (Q7, S3-038): (b) The reproducer is pinned on a minimal document holding only the CAB pair (heat/cool the cabin) and the TNK pair (fill/drain the tank) with the fixture embedder, where on base the code-only FND_OPPOSITION_CANDIDATE waiver is accepted and check returns verified: true (asserted on base, as AC-5-6's 'Today' says); with S3 the waive is refused and the stored waiver is inert, and the CAB and TNK pairs demote. AC-5-6's text is not amended. Keep the write-half assertion too. Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-038.
R44 (Q8, S3-041): For a requirement excluded from the formal tier by a blocking (scoped-class) lint, the remedy offers rephrasing first; it may offer the scoped waive refs+hash second, and then must say that the waiver re-admits the requirement to the solver but demotes waived-blocking-lint, so the run cannot verify. Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-041.
R45 (Q9, S3-047): (b) No KNOWN_ESCAPES row: a scoped, reviewed waiver of a scoped-class finding is a designed discharge, not an escape. The new scoped-waive harness move runs on never-class fixtures only (where it must be refused at write and inert raw); the derives-cycle FND_CYCLE scoped discharge is pinned by its own positive test. Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-047.
R46 (Q10, S3-053): (a) S3 does not touch the version: release-please bumps the four version files in the release PR. The S3 build commit is feat! with a BREAKING CHANGE: footer (S3-052). Source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-053, S3-052.
R47 (S3-001): ERR_WAIVER_REFUSED is a real catalog code (an ERR_CLASSES append in src/ports/errors.ts and the catalog), so the catalog holds 24 ERR / 42 FND / 24 GTWR = 90 codes. Re-pin every count and list that S3's additions move: src/app/runtime/catalog.test.ts (the 23/89 counts, 'resolves EVERY code' length, 'draws from all 89 code strings'), src/app/runtime/errors.test.ts (ERR_CODES length 24 and ERR_CODES_SNAPSHOT with the append), src/app/operations/index.test.ts (explain resolves every manifest code, length 90), src/app/runtime/agents-doc.test.ts (all 90 codes projected), src/publish.test.ts (README '**90 stable codes**' and package.json's description '90 stable codes'). Prefer deriving the expected number from the catalog where the test's purpose allows (CLAUDE.md: a derivable number in prose is a bug), and keep or add the NEGATIVE half: the stale literal '89 stable codes' is ABSENT from README.md and package.json, and '23' ERR is not what the catalog reports. Source: coordinator (job 815), contract loop-back contract-2 after build job 893's 'contract gap', under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-001.
R48 (S3-033): the 'waived-blocking-lint' demotion reason is class 'coverage' with drift false, the class of 'excluded-from-formal', which it replaces for the same requirement (the requirement now reaches the solver only on a reviewer's waiver of a blocking wording defect, so its comparison cannot certify). Re-pin src/app/runtime/signal-classes.test.ts 'DEMOTION_CLASS > pins every demotion reason with its class' with that row. Source: coordinator (job 815), contract loop-back contract-2 after build job 893's 'contract gap', under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-033.
R49 (S3-023): 'waiver-inert' is appended to DIAGNOSTIC_KINDS in src/domain/requirements/document.ts (plan S3 file list: 'DIAGNOSTIC_KINDS append'); re-pin src/domain/requirements/document.test.ts 'DIAGNOSTIC_KINDS' as ['unknown-top-level-key', 'sentence-drift', 'waiver-inert']. Source: coordinator (job 815), contract loop-back contract-2 after build job 893's 'contract gap', under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-023.
R50 (S3-001): the builder may change README.md's code count and package.json's "description" code count, and nothing else in either file, to keep the published count agreeing with the catalog. Source: coordinator (job 815), contract loop-back contract-2 after build job 893's 'contract gap', under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-001.
R51 (S3-042, S3-046): append exactly this sentence as the last sentence of FROZEN.coverageDemotion (and so of the published coverageDemotion claim): "A waiver's content hash binds the text it was reviewed on, not the reviewer: any writer can mint a waiver whose hash matches, so a scoped waiver of a wording or structural finding records that the current text was accepted, not who accepted it." Keep the ', or waived' negative guard. Source: coordinator (job 815), contract loop-back contract-3 after build job 935's 'contract gap' (scope.test.ts [S3-042] FROZEN VERBATIM vs [S3-046] content-hash sentence), under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-042, S3-046.
R54 (review R1, attack D05, D12, P04): one code canonicalisation for the fold, the check-time twin and the engine match: surrounding whitespace is trimmed, case is never folded; after trimming the code must be a published code with its own FINDING_CLASS row (the bare 'GTWR' grouping key is not a code). At write the fold stores the canonical code. At check a stored waiver reaches the engine only when it is exactly a shape the S3 fold would store: a canonical published scoped-class code, written exactly (a padded or case-variant stored code is inert), requirementIds non-empty or a lone requirementId but never both fields, an anchored sha256 contentHash matching the current text, and a reason that is non-blank after trimming. Every other stored shape is waiver-inert with its unwaive op. Pin with an exhaustive raw-shape loop (every published code x every malformed shape: both id fields, blank reason, padded code, case variant, bare GTWR, empty requirementIds, prefixed/suffixed hash), plus the derives-cycle FND_CYCLE repro (strict exit stays 1). Source: coordinator (job 815), closure round contract-4 after review ledger 57948c2 and attack ledger 35ac336 on build 7afb20e, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-009, S3-010, S3-023, S3-030.
R55 (review R2, attack A14): applying every op of a waiver-inert or ignoredWaivers entry to the checked document removes exactly the stored waiver that entry names and no other stored waiver (metamorphic: the stored list afterwards equals the original minus that entry, plus any replacement waives it offers), including padded codes, a lone requirementId naming a deleted requirement, and a coexisting code-only waiver at the normalised key. `symspec waive --remove --ref X` removes the refs form `symspec waive --ref X` stores. Source: coordinator (job 815), closure round contract-4 after review ledger 57948c2 and attack ledger 35ac336 on build 7afb20e, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-005, S3-006, S3-024, S3-027.
R56 (review R3, evidence G2/TA3, attack P13, P15, P17): every `symspec ...` command named in any check, waive, import or explain output, any advice, suggestion or catalog description, parses AND passes the CLI's required-flag validation with the built binary's parser (full argv, not just the subcommand); in particular `symspec explain --code <CODE>` and the flat `symspec antonym <a> <b>`. The never-code negative guards match every inflection (waive, waives, waived, waiving, waiver, waivers) in every emitted action, message and suggestion, and a static sweep over the string literals of the advice and engine prose files uses the same set. Every repair arm is exercised by a constructed demotion of each reason (exhaustive over reasons, not corpus documents) and every op it emits folds under MUTATE_OPTIONS and none waives a never code; assert the actual emitted advice on the near-duplicate opposite-polarity fixture (P13) and the forced-unknown inconclusive group (P15, FND_NEEDS_REVIEW). Source: coordinator (job 815), closure round contract-4 after review ledger 57948c2 and attack ledger 35ac336 on build 7afb20e, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-011, S3-027, S3-039, S3-040, S3-045.
R57 (review R4; this withdraws the coordinator's earlier acceptance of evidence gap G1): a qualifying scoped waiver of a terminology-tier finding (FND_TERM_INCONSISTENT, FND_ACRONYM_UNDEFINED) suppresses exactly its finding and is listed in data.appliedWaivers, as S3-021 promises for every scoped code; no accepted waiver may have no disclosed outcome. Source: coordinator (job 815), closure round contract-4 after review ledger 57948c2 and attack ledger 35ac336 on build 7afb20e, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-021, S3-046.
Directive contract-4/review-R5 (unnumbered): Review R5: the waive-raw harness move includes a code-only probe for every never-class baseline code, idless ones included. Source: coordinator (job 815), closure round contract-4 after review ledger 57948c2 and attack ledger 35ac336 on build 7afb20e, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-049.
Directive contract-4/attack-D06-D16-G3 (unnumbered): Attack D06: the provenance marker test asserts an independently written non-empty literal, not the export. D14/D15/D16: pin the stored-waiver schema rejections (prefixed/suffixed hash, requirementIds [], empty reason) at load. Evidence G3: S3-012 reaches its floor with a loop over every import record shape. Source: coordinator (job 815), closure round contract-4 after review ledger 57948c2 and attack ledger 35ac336 on build 7afb20e, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-008, S3-012, S3-019, S3-026, S3-028.
Directive contract-4/pre-existing (unnumbered): Pre-existing error paths in hunks S3 touched (attack P19-P24, A21, A24, A25): pin as @existing regression tests, green on 7afb20e, each shown to kill its mutant in a throwaway copy: the engine's solver-error boundary (an unexpected solver Error propagates; SolverBudgetExceededError returns the partial report with solver-budget-exhausted), a malformed stored antonym cycle falls back to the seed index at the runCheck boundary, glossary validation over a persisted invalid cycle gives a typed refusal, and apply with a malformed JSON line among valid records writes nothing and exits with ERR_USAGE JSON. Source: coordinator (job 815), closure round contract-4 after review ledger 57948c2 and attack ledger 35ac336 on build 7afb20e, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-002, S3-031.
R59: (review R2 variant): an op a waiver-inert or ignoredWaivers entry offers names its target exactly as stored, and the fold resolves a stored requirement UUID as that UUID before any key lookup, so a deleted requirement's UUID that equals another requirement's key never resolves to that other requirement; applying the ops removes exactly the named stored waiver (R55's metamorphic property, now including the UUID-equals-key collision in both requirementId and requirementIds forms). Source: coordinator (job 815), final closure round contract-6 after review ledger bc9a87d and attack ledger round 2 (19bd46f) on build 2d3e5fe, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-024, S3-027.
R60: (review R6): every `symspec ...` command symspec emits (advice, suggestions, refusals, explain, help, catalog rows) is shell-safe: each argument that carries document text or a user value is quoted so that `bash -n` accepts the command and a POSIX shell's word split yields exactly the intended argv, for texts containing double quotes, single quotes, $, backticks, semicolons, backslashes and newlines. The test helper src/testing/cli-argv.ts must track quote state and fail an unterminated quote (fix it in this item; it is test code), and the R56 sweep runs every emitted command through bash -n and the built parser. Source: coordinator (job 815), final closure round contract-6 after review ledger bc9a87d and attack ledger round 2 (19bd46f) on build 2d3e5fe, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-027, S3-045.
R61: (review R7, attack C10, C13, C18): R56's sweep extends to every help text (each subcommand's --help) and to the term, number-spelling and glossary-conflict advice arms: every command they name passes the parser with its required arguments, and no never-class catalog description carries a waive inflection. Source: coordinator (job 815), final closure round contract-6 after review ledger bc9a87d and attack ledger round 2 (19bd46f) on build 2d3e5fe, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-040, S3-045.
R62: (attack C06, C09, C23, RH10): a terminology waiver suppresses only the finding on its own requirement ids and content hash (never the same code on another requirement) and is counted in data.waived (C06, C09; this also closes the S8 open item); no schema description claims enforcement of intentRef/derived exclusivity or presence while the decoder accepts both or neither (C23, run 3's B4 statement); `init --split --force` reports exactly what it wrote: it never says a file was overwritten when it kept it (RH10). Source: coordinator (job 815), final closure round contract-6 after review ledger bc9a87d and attack ledger round 2 (19bd46f) on build 2d3e5fe, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-021, S3-046, RH-007, RH-012, RH-008.
Directive contract-6/accepted (unnumbered): Accepted, not to be pinned: C14 and C15 (pre-existing prose normaliser corners: user backticks, the 'add' verb), owner Laith, until the next minor release; C17 and C20 proposed equivalences, accepted with the attacker's arguments; P16 as before. Source: coordinator (job 815), final closure round contract-6 after review ledger bc9a87d and attack ledger round 2 (19bd46f) on build 2d3e5fe, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-045.
R63: (review R8, R9): example tests cannot find every site, so the guard is static. A test walks every non-test .ts file under src/ (the TypeScript compiler API is available through the typescript devDependency; a careful scanner of template literals and string concatenations is acceptable if it is shown to find a planted site in each syntactic form), finds every string or template literal that renders a `symspec ` command (including ones assembled by concatenation or a helper), and fails unless every interpolated value in it passes through the one shell-word helper (src/domain/engine/core/shell-word.ts) or is a fixed placeholder token of the form `<...>` (a choice list is one placeholder, e.g. `<bool|int|enum>`). The test must name each offending file:line, must count the sites it inspected and fail when that count is zero or drops below a recorded floor (anti-vacuity), and must be shown red on a planted unquoted interpolation in each syntactic form it claims to cover. Plus example tests for R8 and R9 through the built CLI: each command those sites print passes bash -n and the parser, and a value with ", $, $( ), backticks or | survives as one argument. Source: coordinator (job 815), closure loop 3 contract-7 after review ledger ea1503a (review R8, R9) on build 6f7e957, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt. Behaviors S3-027, S3-045.

## Boundaries

S3 does not change engine logic (`src/domain/engine/**` changes in prose only, plan section 10).
It adds no `vocab` verb, no `vocab distinct`, no `propose-vocabulary` and no `--rescope-waivers`
(S7, S9, S17). It does not change the document format: format v4 is S5 (D3), and docVersion 3
documents such as this fixture load as at base. It does not change `update`, `unwaive`, or the
exit order of `exitCodeForEnvelope` except as question 4 rules. It does not touch the CI
invocation, CODEOWNERS or `symspec.config.json` (R6, D5, D8). It closes only the 11 waive-by-code
KNOWN_ESCAPES rows; the other legacy escapes stay open (R5, G26). It adds no gated harness variant
(S13). It does not make a content hash bind a reviewer: any writer can mint a qualifying scoped
waiver of a wording or structural code, and the scope says so (T24). The embedding model and the
npm publish are out of scope.

Assumptions (from threat model v1; owners as the coordinator ruled, source: coordinator, under the owner's delegated authority (job 815 goal: full authority to ship); redirectable at the receipt):

- TA1: CI runs `pnpm check` on a fresh clone, and symspec.config.json is CODEOWNED, so the gate's
  own invocation is outside the agent's reach (D5, D8, R6). Owner: Laith; accepted until the next release after 2.0.0.
- TA2: requirementsContentHash is collision-resistant over meaningOf(requirement), so a waiver
  cannot be bound to two different texts. Owner: Laith; accepted until the next release after 2.0.0.
- TA3: The report corpus and the gaming fixtures together exercise every advice site that can emit
  a waive op or the word "waive" for a never code; a site neither reaches is unguarded (T14, T15).
  Not accepted: it is an evidence item, measured by the evidence role (list each advice and suggestion
  site and which corpus or fixture document reaches it).
