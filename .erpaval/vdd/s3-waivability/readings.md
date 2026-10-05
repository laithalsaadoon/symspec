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
