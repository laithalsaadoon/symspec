# Spec 007, Phase 3: implementation plan

Scope: Story 4 (AC-4-1..AC-4-7) and the solver-free half of Story 5 (AC-5-1, 5-2, 5-6, 5-7,
5-8, 5-9, 5-10, 5-13). Grounded at `f30be09` on `feat/controlled-vocabulary`, repo root
`/mnt/uv-cache/workplace/symspec`. Spec: `.erpaval/specs/007-controlled-vocabulary/spec.md`.

Status: PLAN. No code has been edited. The spec gaps in section 11 each carry a proposed
resolution, and section 12 lists the decisions the lead has to make before the affected slices
start.

---

## 1. Context

### 1.1 What Phase 3 must deliver, and what it must not build

The deliverables are:

- A committed vocabulary that every slot resolves against.
- Atoms scoped by symbol and not by string.
- Write-time refusal of unresolved phrases and of merges that destroy meaning.
- Op directions as data.
- Intent and policy artifacts, with coverage and change detection.
- Scoped waivers.
- A pinned config.
- `check --baseline` with a semantic delta and drift detection.
- A counterfactual check on `vocab distinct`.
- `init --split` and a CODEOWNERS stanza.

Phase 3 does NOT build the certificate kernel (AC-5-3..5-5, 5-11, 5-12, 5-14), the typed IR
(Phase 4), or Stories 6 and 7. It leaves four seams for them:

- `RequirementBinding`, a record of symbol ids. The typed IR binds its slot literals from it.
- `DecideRunner`, one port for every counterfactual run. The kernel's UNSAT checks reuse it.
- `semanticDelta.removed[].certificate`, which is always `null` in Phase 3.
- The `anchor.ts` leaf module, which holds the intent and policy schemas and imports only
  `effect/Schema`, so the AC-5-12 kernel boundary can import it.

Until Phase 6 lands there is no admission path for a weakening move. Its obligation therefore
stays open, which is the spec's stated safe default.

### 1.2 The spine and the grafts

**Spine: adversary-first.** Its three layers are:

- the vocabulary layer (decide-side meaning);
- the anchor layer (intent, policy, pinned config and baseline — what the agent cannot change
  from inside the loop);
- the delta layer (check(baseline) against check(current)).

Kept from it:

- Class representative = the minimum SymbolId.
- Gate pins read as the strongest of the baseline config and the working-tree config, with the
  `files` locations taken from the baseline.
- `FND_INTENT_UNCOVERED` demotes as well as errs.
- A deterministic lexical alias-candidate signal next to the cosine signal.
- A recursive, intent-grounded partOf basis.
- Stable signal identity keyed on `key ?? id`.
- The `DecideRunner` seam.
- Waivability as an explicit table.

**Grafted from minimal-kernel:**

- There is ONE trusted component that can move a verdict toward clean: the vocabulary
  projection at `compat.toEngineDoc`. Every other addition is a greenfield splice at
  `app/operations/check.ts` that can only add findings or demotions.
- `verified` stays single-writer. It is recomputed from the merged demotions at
  `check.ts:1076`.
- A SymbolId regex on which `normalizeScope` is the identity, pinned by a property test.
- The vocabulary is re-validated after every `antonym` op.
- The binding includes `stateEffect` and `stateConstraint`.
- `anchor.ts` is a leaf module.

**Grafted from migration-first:**

- P3-01 comes first: the harness must measure the real write path.
- A report-corpus snapshot is taken before any vocabulary code exists.
- G-D measures each op's direction instead of asserting it.
- The document version is bumped to 4, so an older build refuses a vocabulary document loudly.
- The bootstrap is the identity. Proposed merges go out separately in `data.aliasOps`.
- The legacy glossary and term tables are FROZEN in vocabulary mode. They are not emptied.
- A `BaselineSource` port, with a git adapter and an in-memory adapter.
- A `waiver-inert` diagnostic that carries the exact replacement ops.
- A `raw` edit channel in the harness.
- A text-rewrite projection that writes the canonical TEXT, never the id. This is why the
  engine tier is not edited for projection in Phase 3.

**Replaced.** The adversary-first engine hook E1/E2/E3 (a `v<k>_<repId>` atom body and
`Atom.contraries`) is replaced by the migration-first text-rewrite projection, plus two new
write-time invariants (V-OPP and V-NUM, section 4.3). Those invariants close the fatal flaws
that both text-rewrite designs had. The effect is that Phase 3 makes no logic edit to
`src/domain/engine/**`. The one engine edit is prose-only (S3, section 10), gated by a negative
guard.

### 1.3 Fatal flaws the judges found, and how this plan closes each

| # | Flaw (source design) | Fix in this plan | Slice / gate |
|---|---|---|---|
| F1 | Drift fabricated on the designed repairs: binding intentRef, declaring a missing symbol, fixing a table, or a lint rewrite that clears `excluded-from-formal` (adversary-first, migration-first, minimal-kernel) | Drift is keyed on the AC-5-9 predicate, the requirement BINDING, and not on op direction. `intentRef` and `derived` are outside `bindingOf`. Only VERDICT findings, and conflict-signal demotions flagged `drift: true` in `DEMOTION_CLASS`, can drift. Hygiene, wording, coverage and disclosure signals never drift. A conflict-signal demotion resolved in the strengthening direction (the pair is now one class, or now registered contraries) is `resolved-by-unification`, not drift. | S2 (tables), S16 (rule), S16 designed-discharge round-trip gate |
| F2 | The tool's own reachability repairs (`state` / `classify`) and ordinary lint rewording turn into `FND_SEMANTIC_DRIFT` (minimal-kernel, migration-first) | Reachability disclosures (UNKNOWN, NOT_CHECKED, UNDER_HYPOTHESES) are class `disclosure`, so they never drift. A removed `FND_REACHABILITY_VIOLATED` attributed only to a state-model change unit gives the demotion `state-model-weakened`, not an error. A `classify` that rebinds a requirement's effect is a binding change and drifts, which is correct. | S16, with a round-trip test over every `repair.ops` fixture in `reachability-report.test.ts` |
| F3 | E1 mixed atom space: some sites carry the class-id atom and others the legacy atom (adversary-first) | E1 is not built. The projection is ONE text rewrite at compat, and every engine reader reads the same rewritten text. An unresolved slot in vocabulary mode is `FND_UNRESOLVED_SYMBOL`, which excludes the requirement and demotes. It never falls back silently. | S8, gates G-B and G-C |
| F4 | Cross-symbol contraries lost: an alias of A and a phrase of B were contraries, and the canonical rewrite hides them (minimal-kernel, migration-first) | Invariant **V-OPP**: every phrase in a symbol class has the same engine `opposition` as the class canonical (both absent, or equal `key` and `negative`). If phrase p in A is contrary to q in B, then canon(A) is contrary to canon(B). This is re-checked after `antonym`, at `vocab-alias`, and at check time. | S6 (invariant), S4/S7 (fold), S8 (twin), move `alias-cross-symbol-contrary` |
| F5 | An alias between phrases with different numerals rewrites the numeric text and deletes a numeric conflict (migration-first) | Invariant **V-NUM**: every phrase in a class has the same `extractNumericPredicates` signature (comparator, value, unit, dimension) as the canonical. | S6, S4/S7, move `alias-numeric-mismatch` |
| F6 | `compatible` / `distinct` admitted for free by a merge counterfactual that true contraries pass (adversary-first, minimal-kernel) | There is no `compatible` verb. For ACTION pairs, `vocab distinct` runs BOTH counterfactuals: merge them, and assert them contrary. Admission for free needs both to add no conflict signal; otherwise an intent basis is needed. A contrary counterfactual that cannot be expressed gives `counterfactual-unchecked`, which demotes. | S17, reproducers fill/drain and heat/cool |
| F7 | `OP_DIRECTION` mislabelled against its own definition: `add` over all demotions, `vocab-unalias` / `undistinct` called strengthening (adversary-first, migration-first) | Direction is an UPPER BOUND over the published set D (section 3.1), which excludes coverage demotions and hygiene findings. `vocab-unalias` and `vocab-undistinct` are labelled `weakening`. G-D MEASURES the labels, with an exact `KNOWN_NONMONOTONE` table. | S2, S7 |
| F8 | Waivability contradicts itself: TERMINOLOGY_TIER is `'formal'`, and "refuse all FND_* waivers" kills the lint-tier FND codes (adversary-first, minimal-kernel) | `WAIVABILITY` is derived from a per-code `FINDING_CLASS` table that is written out by MEANING (not by catalog tier or payload tier) and exhaustive via `satisfies`. The wording class (GTWR_*, FND_AMBIGUOUS_*, FND_AMBIGUITY_NEEDS_JUDGMENT, FND_EXACT_DUPLICATE, FND_TERM_INCONSISTENT, FND_ACRONYM_UNDEFINED) is waivable, scoped. Verified: `catalog.ts:265-297, 334-337`. | S2, S3 |
| F9 | Switching legacy to vocabulary mode and adopting intent under `--baseline` both read as drift or as intent-changed (adversary-first) | `bindingOf` is computed by ONE function on both sides. A legacy baseline resolves through `implicitVocabulary`, whose ids are minted deterministically, and the bootstrap mints the SAME ids. So the opt-in PR has equal bindings and an empty `removed[]`, which gate G-F asserts. Absent-to-present intent is handled by decision D2 (repin). | S6, S14, S16, gate G-F |
| F10 | Run-knob orders wrong: `timeoutMs: 0` is illegal, and `reachabilityTimeoutMs: 0` means inherit (minimal-kernel) | `RUN_KNOBS` compares EFFECTIVE values: `resolveReachabilityTimeoutMs(r, t)` (`check.ts:164-167`), `timeoutMs >= 1` (`check.ts:560`), `solverBudgetMs: 0` = unbounded, `temporalBound: 0` = off. | S11, knob-table property test |
| F11 | The pinned config can be shadowed: nearest-ancestor discovery lets an agent drop a weaker config next to the document (migration-first) | Lead decisions S11-D1..D3: an explicit `--config`, then `SYMSPEC_CONFIG`, wins; otherwise the config is `<toplevel>/symspec.config.json`, toplevel = `git -c safe.bareRepository=explicit rev-parse --show-toplevel` in the document's realpath'd directory (a committed bare-repository layout is refused, ERR_CONFIG_INVALID), or the document's directory with no repository. No walk. `data.run.config` is `{path, source}` so a CI job on a fresh clone asserts the committed toplevel config governed; local `.git/` edits are out of scope. The effective pins are the strongest of the baseline and the working tree. | S11, move `shadow-config` |
| F12 | `update intentRef` "refused unless derived" contradicts derived and intentRef being mutually exclusive (minimal-kernel) | `intentRef` and `derived` are mutually exclusive attributes. Setting one clears the other in the same op. The fold refuses a requirement that carries both. | S12 |
| F13 | "One engine edit" and the synthesized-waiver channel left undisclosed (minimal-kernel) | An admitted `distinct` pair crosses compat as a synthesized waiver with provenance `vocab-distinct`. It is listed in `data.vocabulary.admittedDistinct`, and a test asserts that no synthesized waiver exists for a pair that was not admitted. | S17 |

### 1.4 Facts verified at f30be09 that the plan depends on

- `src/testing/gaming.ts:1170` folds with `foldOps(doc, ops, TS)` and NO `MutateOptions`.
  `apply` injects `normalizeHead`, `validateAntonyms` and `validateTerms`
  (`app/operations/mutation.ts:162-225`). The swallowed-alias refusal at
  `domain/requirements/mutate.ts:831-842` splits its needle on `'_'`, so it never fires under
  the trim-only default normalizer. The KNOWN_ESCAPES row `alias-contraries-term@reverse`
  says, in its own text, that `apply` refuses the op.
- `import.ts:533` (`applyWaive`) and `:585` (`foldImportStream`) are a private fold that
  bypasses the write-time validators.
- `OP_VERBS` (`ops.ts:451-477`) has 20 verbs and is append-only, and `refine` is already an
  EDGE verb in it.
- `WaiveOp` (`ops.ts:241-248`) already carries `refs` and `contentHash`.
- Catalog tiers:
  - `FND_TIER` (`catalog.ts:265-297`) marks `FND_OPPOSITION_CANDIDATE`, `FND_SIMILAR_SEMANTIC`,
    `FND_NUMERIC_UNCOMPARED`, `FND_RELATIONAL_UNCHECKED` and `FND_QUANTITY_ALIAS_CANDIDATE` as
    `formal`, and `FND_AMBIGUOUS_*` and `FND_EXACT_DUPLICATE` as `lint`.
  - `TERMINOLOGY_TIER` (`:334-337`) is `formal`.
  - The catalog tier therefore cannot be the waivability rule.
- The engine's only discharge for "neither" on an opposition candidate is a waiver
  (`engine/pipeline/check.ts:2093-2104`, prose "or waive it").
- The SCOPE claim `coverageDemotion` (`app/runtime/scope.ts:63`) says opposition candidates are
  "committed via … or waived". It also says a proven FND_CONTRADICTION reports
  `verified: true` and exits 1. That is why `FND_INTENT_UNCOVERED` must DEMOTE for AC-5-2's
  sabotage to be able to fire.
- `app/operations/check.ts`:
  - `verified: allDemotions.length === 0` is at `:1076`.
  - The reachability demotion uses a cast, `d.reason as CoverageDemotion['reason']`, at
    `:1006`.
  - `timeoutMs < 1` is rejected at `:560`.
  - `resolveReachabilityTimeoutMs` (`:164-167`) makes 0 mean inherit.
- `run-weakened` already exists as an engine demotion reason
  (`engine/pipeline/check.ts:413, 2139, 2156`).
- `compat.ts`:
  - `bindsCurrentText` (`:117`) silently drops stale-hash waivers.
  - `toEngineDoc` (`:135`) is the one boundary crossing, and it has no field for distinct
    pairs.
- The numeric tier reads RAW slot text: `engine/pipeline/check.ts:1461-1478` calls
  `extractNumericPredicates(r.trigger | r.preCondition | systemResponse, r.systemName, …)`.
- Engine atoms carry `opposition?: {key, negative}`, and `areContrary` means same key with
  opposite `negative` (`engine/formal/atomize.ts:228, 347-356`). V-OPP is built on this.
- `DOC_VERSION = 3` (`document.ts:104`). `store.ts:192-196` `checkDocVersion` refuses any
  other version.
- GTWR lint reads `sentence`. `detectAmbiguity` reads slot views
  (`engine/pipeline/check.ts:1202`). A slot rewrite is therefore visible to ambiguity lint
  (risk R9).
- Reachability repairs emit `state` and `classify` ops
  (`domain/reachability/reachability-report.ts:132-185, 776`). `classify` sets one
  requirement's response kind and expression, so it is a BINDING change.
- The `gaming.test.ts:148` guard requires `closedBy` to match `/^AC-[4-7]-\d+$/`.
- KNOWN_ESCAPES has 35 rows: delete@first 7, delete@second 6, waive-by-code 6,
  flip-negated 4+4, alias-contraries-glossary 1+1, alias-contraries-term (contrary-pair) 1+1,
  alias-contraries-term@reverse (term-bridged) 1, unglossary 1, unterm 1, rebind-effect 1.

---

## 2. Data model

### 2.1 Document format v4 (`src/domain/requirements/document.ts`)

**Versioning**

- `DOC_VERSION` stays `3` as the legacy write version. Add `DOC_VERSION_VOCAB = 4` and
  `ACCEPTED_DOC_VERSIONS = [3, 4]`, and have `store.ts` `checkDocVersion` accept both.
- A v4-only key under `docVersion: 3` is a decode error that names the upgrade.
- The first `vocab*` op, or the first op that writes `intentRef`/`derived`, bumps the document
  to 4, and the bump is reported in `FoldEntry.upgraded`.
- An older build refuses v4 through its existing `ERR_SCHEMA_VERSION` path, so a downgrade
  fails loudly. That is the V27 posture. Without the bump, a nested requirement key would fail
  as `ERR_DOC_PARSE`, and a top-level `vocabulary` would be silently preserved and IGNORED.

**`vocabulary`** (v4 only; defaults to `{symbols: [], merges: [], distinct: []}`)

```
Vocabulary = {
  symbols:  VocabSymbol[]            // sorted by id on write
  merges:   {a: SymbolId, b: SymbolId}[]   // unordered symbol-symbol alias edges (union-find)
  distinct: {a: SymbolId, b: SymbolId, reason: NonEmpty}[]  // conditional triage records; NO stored basis
  frozenTables: {sha256: string}     // hash of glossary+terms at opt-in (frozen-table guard, S7)
}
SymbolId = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, <= 64 chars
SymbolKind = 'system' | 'feature' | 'event' | 'state' | 'action' | 'quantity'   // Record<SymbolKind,…> tables
VocabSymbol (discriminated on kind) = {
  id, kind, canonical: NonEmpty (IMMUTABLE after declare), aliases: NonEmpty[] (default []), note?,
  system:   parent?: SymbolId                       // part-of; must be a system; acyclic
  feature:  —
  event:    variable?: StateVarName                  // bool input, validated vs stateModel when present
  state:    variable?: StateVarName, value?: string  // ONE condition class; symbols sharing `variable` form its domain
  action:   effects?: string                         // reserved; validated vs stateModel; no Phase-3 reader
  quantity: dimension: Dimension, unit: string, numberType: 'int' | 'real'
}
```

**Minted ids.** An implicit or bootstrapped id is `<kindPrefix>_<slug(phraseKey)>`. The kind
prefixes are `sys`, `feat`, `evt`, `st`, `act` and `qty`. `slug` lowercases, maps each run of
`[^a-z0-9]` to `_` and trims. When the slug is empty (a non-Latin key) or longer than 64
characters, the id falls back to `<prefix>_h<first 10 hex of sha256(phraseKey)>`. A collision
gets `_2`, `_3`, and so on, in phraseKey order. Minting is deterministic, and that determinism
is what makes the opt-in PR drift-free (F9).

**Action contraries are DERIVED, not stored.** The source of truth is the committed antonym
table plus the seed, read through `atomize().opposition`. `data.vocabulary` reports the derived
contraries for each action. (Spec gap G15.)

**State symbols.** A state symbol is one condition class (for example "the train is moving"),
optionally linked to a stateModel variable/value. The domain of a variable is the set of its
linked symbols plus the stateModel declaration. Phase 4 re-models each state symbol as
(variable symbol, value literal), a mechanical 1:1 mapping. (Spec gap G15.)

**Requirement additions** (v4, `exactOptionalPropertyTypes`, so the key is omitted rather than
set to `undefined`)

- `intentRef?: IntentId` or `derived?: true`. The two are mutually exclusive, and the fold
  refuses a requirement that has both.
- The binding is NOT stored. It is DERIVED by `resolveRequirement` on every read (section 4).
  - There is nothing a hand edit can launder.
  - The fold invariants make resolution stable: V1 means a phrase has exactly one owner, and
    `vocab-unalias` / `unvocab` are refused while a requirement uses the phrase or symbol.
  - Hand edits to the vocabulary are caught by the check-time twins.

**Intent and policy.** They live either inline (top-level `intent?` / `policy?` keys) or split
into the files the config names. Having both is `ERR_CONFIG_INVALID`. The schemas are in
`src/domain/anchor/anchor.ts`, which imports ONLY `effect/Schema`.

```
Intent = { intentVersion: 1, items: {id: IntentId (Key pattern), text: NonEmpty,
           kind: 'obligation' | 'assumption' | 'goal' (default 'obligation'), source?: string}[],
           source?: {importedFrom: string, sha256: string} }
Policy = { policyVersion: 1, levels: {id, description?}[] (array order = yield order, highest first),
           assign: Record<IntentId, LevelId>, admissibleAssumptionKinds: string[] (default []) }
```

Phase 3 reads only three things from these artifacts: their hash, their structural validity,
and intent coverage. Ranking and assumptions are Phase 6 seams. No op writes `intent` or
`policy`: the op union cannot reach them, and `save` never writes the split files.

**New `DocumentDiagnostic` kinds** (appended to `DIAGNOSTIC_KINDS`)

- `waiver-inert` carries the replacement `unwaive` + scoped `waive` ops for each finding the
  waiver matches today.
- `legacy-table-entry-ignored`
- `doc-upgraded`

### 2.2 `symspec.config.json` (`src/domain/config/config.ts`)

```
{ configVersion: 1,
  files?: {document?, intent?, policy?},                 // read from the BASELINE's copy when a baseline is given
  anchors?: {intentSha256?, policySha256?},              // decision D2 (repin); see 5.6
  gate: { strict?, semantic?, semanticThreshold?, embedder?: 'model',
          timeoutMs?, reachabilityTimeoutMs?, solverBudgetMs?, temporalBound?,
          baseline?: {required: boolean, ref?: string},
          requireIntent?: boolean, requireVocabulary?: boolean } }
```

**Location.** Exactly `<git toplevel>/symspec.config.json`. When there is no git, it is the
document's directory. There is no flag, no env override and no ancestor walk (F11).

**`RUN_KNOBS`.** One data table of `{knob, flag, effective(input), weaker(actual, pinned)}`
rows. It compares EFFECTIVE values (F10):

- semantic: `false` is weaker than `true`.
- embedder: the stub is weaker than the model.
- semanticThreshold: higher is weaker.
- timeoutMs: higher is stronger, and the minimum legal value is 1.
- reachabilityTimeoutMs: compared as `resolveReachabilityTimeoutMs(r, t)`.
- solverBudgetMs: 0 (unbounded) is strongest; otherwise higher is stronger.
- temporalBound: 0 (off) is weakest; otherwise higher is stronger.
- strict: `false` is weaker than `true`.
- baseline: absent is weaker than present.

The manifest publishes the table as `runWeakening`.

**Effective pins** = for each knob, the stronger of the baseline config's pin and the
working-tree config's pin. Editing or deleting the working-tree config therefore cannot lower
a pin.

### 2.3 Catalog classes (`src/app/runtime/catalog.ts` plus new `src/app/runtime/signal-classes.ts`)

**`FINDING_CLASS`** is `satisfies Record<every FND code | 'GTWR', Class>` and is written out by
meaning. It is not derived from the tier. The classes are:

- `verdict`: the document is inconsistent or violated. Covers FND_CONTRADICTION,
  FND_NUMERIC_CONTRADICTION, FND_TEMPORAL_CONTRADICTION, FND_SUBSUMPTION, FND_REDUNDANCY,
  FND_VACUITY, FND_REACHABILITY_VIOLATED, FND_RANGE_VIOLATION,
  FND_REACHABILITY_VACUOUS_INITIAL, FND_CERTIFICATE_DISAGREES, and so on.
- `disclosure`: "I don't know". Covers FND_NUMERIC_UNCOMPARED, FND_RELATIONAL_UNCHECKED,
  FND_NO_PAIRS_CHECKED, FND_REACHABILITY_UNKNOWN / NOT_CHECKED / UNDER_HYPOTHESES /
  PROVED(info), FND_INCOMPLETE, FND_NEEDS_REVIEW, and so on.
- `triage`: a propose-side candidate whose discharge is a vocabulary or table op. Covers
  FND_OPPOSITION_CANDIDATE, FND_SIMILAR_SEMANTIC, FND_SIMILAR_UNUNIFIED,
  FND_QUANTITY_ALIAS_CANDIDATE, FND_SYMBOL_ALIAS_CANDIDATE, FND_DUPLICATE_CLUSTER.
- `hygiene`: an obligation whose designed discharge is a strengthening or declaring op. Covers
  FND_UNRESOLVED_SYMBOL, FND_VOCABULARY_INVALID, FND_INTENT_UNBOUND, FND_INTENT_UNCOVERED,
  FND_EXCLUDED_FROM_FORMAL.
- `wording`: GTWR_*, FND_AMBIGUOUS_*, FND_AMBIGUITY_NEEDS_JUDGMENT, FND_EXACT_DUPLICATE,
  FND_TERM_INCONSISTENT, FND_ACRONYM_UNDEFINED.
- `structural`: FND_ORPHAN, FND_CYCLE, FND_MISSING_TRACE_LINK.
- `anchor`: FND_INTENT_CHANGED, FND_SEMANTIC_DRIFT, FND_DERIVED_WEAKENS,
  FND_DISTINCTION_UNSUPPORTED.

The exact membership of each row is decided in S2, one code at a time, with a `why` string on
every row.

**`WAIVABILITY`** is derived from `FINDING_CLASS`: `wording` and `structural` are `scoped`, and
every other class is `never`. A decision point for the lead is D1: whether `disclosure` codes
become unwaivable (the literal AC-5-6) or stay scoped.

**`DEMOTION_CLASS`** is `satisfies Record<AppDemotionReason, {class, drift: boolean,
resolvedBy?: ResolvedPredicateId}>`. The classes are:

- `conflict-signal`: conditional-conflict-unchecked, opposite-polarity-near-duplicate,
  open-opposition-candidate, quantity-alias-candidate.
- `coverage`: uncovered-requirement, excluded-from-formal, no-decide-tier-comparison,
  inconclusive-group, and so on.
- `disclosure`: numeric-bounds-uncompared, relational-reasoning-not-attempted, solver-unknown,
  solver-budget-exhausted, counterfactual-unchecked, and so on.
- `triage`: symbol-alias-candidate, distinction-unsupported.
- `hygiene`: unresolved-symbol, vocabulary-invalid, intent-uncovered, waived-blocking-lint.
- `run`: run-weakened.
- `anchor`: drift-unattributed, state-model-weakened.

`drift` is true only for the four conflict-signal reasons. `AppDemotionReason` is the union of
the engine's `CoverageDemotion['reason']` and each tier file's greenfield reasons, and it
replaces the cast at `check.ts:1006`.

**New code files, one per tier, unioned by `catalog.ts`** (the reachability-codes.ts
precedent):

- `src/domain/vocabulary/vocabulary-codes.ts`
- `src/domain/intent/intent-codes.ts`
- `src/domain/delta/delta-codes.ts`

---

## 3. Ops and direction classes (AC-5-1)

### 3.1 The definition that the table is an upper bound over

**D = the verdict-bearing set** is made of:

- error findings of class `verdict` or `structural`;
- demotions of class `conflict-signal` or `triage`.

A verb's direction says what it CAN do to D:

- `strengthening`: it can only add members of D.
- `weakening`: it can remove a member of D.
- `conditional`: symspec decides the effect per instance, either with a counterfactual on every
  run or with baseline drift attribution.

D excludes coverage demotions, disclosures, wording and hygiene. That exclusion is why `add` is
strengthening even though it discharges `uncovered-requirement` and `FND_INTENT_UNCOVERED`.
The decoy-coverage problem is handled separately by FND_DERIVED_WEAKENS (section 5.8), not by
the direction label.

D and the rule above are published with the table, in the manifest (`opDirections`) and in the
generated AGENTS.md. The table is `OP_DIRECTION satisfies Record<OpVerb, {direction, why}>` in
`ops.ts`.

**G-D MEASURES the labels.** For every non-refused move whose emitted verbs all join to
`strengthening`, D after the move must contain D before it. The containment is measured under
two identity maps: a verdict finding may upgrade a conflict-signal demotion on the same
requirements, and a symbol merge may rename evidence. The exceptions are listed in an exact
`KNOWN_NONMONOTONE` table.

### 3.2 Existing verbs

| verb | direction | why |
|---|---|---|
| add | strengthening | adds constraints; the decide logic is monotone under added constraints (I-1) |
| update | weakening | a slot, `negated`, pattern, stateEffect or stateConstraint change rebinds; metadata attributes are outside the binding |
| delete | weakening | |
| derive, satisfy, verify, refine (EDGE) | strengthening | trace graph only; can add FND_CYCLE |
| remove-edge | weakening | can remove FND_CYCLE (structural) |
| glossary | strengthening | contrary- and numeral-destroying merges refused (S4); refused in v4 |
| antonym | strengthening | re-validates the vocabulary (V1, V-OPP) before committing |
| waive | weakening | |
| unwaive | strengthening | |
| unglossary | weakening | refused in v4 |
| unantonym | weakening | |
| state, unstate, state-initial | weakening | a redeclaration can release a frame or change the initial state |
| classify | weakening | rebinds one requirement's effect |
| term | strengthening | refused in v4 |
| unterm | weakening | refused in v4 |

### 3.3 New verbs (APPENDED to `OP_VERBS` and never interleaved)

| verb | payload | direction | refusals |
|---|---|---|---|
| `vocab` | `{kind, id?, canonical, aliases?, parent?, variable?, value?, effects?, dimension?, unit?, numberType?}` | strengthening | V1 collision (it cannot capture a phrase that already resolves elsewhere); V2–V6; a redeclaration that changes any field |
| `unvocab` | `{id}` | weakening | while any requirement resolves to it, or while any merge, distinct or parent names it |
| `vocab-alias` | `{id, phrase}` or `{id, into}` (merge edge) | strengthening | V1; V-OPP; V-NUM; cross-kind; state symbols with different `variable`/`value`; systems with different non-null parents (AC-4-6 is the V-OPP case, directly or transitively through the class) |
| `vocab-unalias` | `{id, phrase}` | weakening | while any requirement's slot resolves through that phrase. A merge EDGE is never removed by this verb; a split goes through `vocab-distinct` |
| `vocab-distinct` | `{a, b, reason}` | conditional | same kind, and a ≠ b. The AC-5-7 counterfactual runs on every check |
| `vocab-undistinct` | `{a, b}` | weakening | re-triages the pair, and can remove findings that only the admitted split showed |

**Intent attributes.** `add` gains optional `intentRef` and `derived`. `UPDATABLE_ATTRS` gains
`intentRef` and `derived`: setting one clears the other, and setting `derived: false` clears
it. They are OUTSIDE `bindingOf`. Retargeting is caught by the uncovered sweep, and marking a
requirement derived by the derived counterfactual.

**Refused in v4.** `glossary`, `term`, `unglossary` and `unterm` are refused with a pointer to
`vocab-alias`. The tables are FROZEN at opt-in and guarded by `vocabulary.frozenTables.sha256`.

**Run-weakening stays off the op verbs.** It is the `RUN_KNOBS` table (spec gap G26).

**`OP_COVERAGE`** in `gaming.ts` is a `Record<OpVerb,…>`, so each new verb is a `tsc` error
until it has a move or a written reason (AC-8-2).

### 3.4 CLI and error codes

**CLI surface.** Envelope types are command names plus `error`.

- `symspec vocab add|alias|unalias|distinct|undistinct|remove|list|show`
- `symspec propose-vocabulary [--rescope-waivers]`
- `symspec check --baseline <git-ref>`
- `symspec init --split`
- `symspec install --codeowners [--owner @team]`

**New ERR codes**, appended to the catalog and, where the fold emits them, to
`FOLD_ERROR_CODES`:

- `ERR_UNRESOLVED_SYMBOL` carries `candidates`, the nearest same-kind symbols ranked by token
  Jaccard, then shared prefix, then id. The ranking is deterministic, never uses embeddings, and
  never binds automatically. The candidates appear in `suggestions` and `commands`, NEVER in
  `repair.ops`.
- `ERR_VOCABULARY_CONFLICT`
- `ERR_WAIVER_REFUSED`
- `ERR_UNTRACED_REQUIREMENT`
- `ERR_BASELINE_UNAVAILABLE`: fail closed. Never fall back to "no baseline".
- `ERR_CONFIG_INVALID`

**Reserved name.** The AC-5-3 certificate verb must NOT be `refine` (spec gap G1). Phase 3
records the collision and reserves nothing.

---

## 4. The resolution chokepoint

### 4.1 One module: `src/domain/vocabulary/resolve.ts`

This is greenfield. It may import the engine's `normalize`, `normalizeScope`, `atomize` and
`extractNumericPredicates`, as `compat.ts` does, and the engine imports nothing from it.
`package-boundary.test.ts` gains the rule. An architecture test pins that no other module looks
up a vocabulary phrase (the stable-key-resolution lesson).

**`phraseKey(domain, text, tables)`.** The collision domains are:

- `system`: `normalizeScope(text)`, so articles are kept.
- `guard` = event ∪ state, one namespace per AC-3-3: `atomize('pre', text).ref.body`.
- `feature`: `atomize('feat', …).ref.body`.
- `action`: `atomize('resp', …).ref.body`, under the document's antonym index and its frozen
  glossary and terms.
- `quantity`: the numeric tier's label key.

`tables` are the committed glossary, terms and antonyms. Glossary and terms are frozen in v4;
antonyms stay open, which is why `antonym` re-validates.

**Other exports**

- `buildVocabularyIndex(doc)` returns `{index, invalid[]}`.
  - An explicit vocabulary is validated against V1–V6. An invalid entry is DROPPED at check
    time and disclosed as FND_VOCABULARY_INVALID with a demotion. The check path stays
    throw-free.
  - A document with no vocabulary gets `implicitVocabulary(doc)`: one symbol per phraseKey
    class of the phrases the requirements use. The canonical is the most frequent spelling,
    ties broken lexicographically, so it does not depend on requirement order. Ids are minted
    as in 2.1.
- `resolvePhrase(index, allowedKinds, text)` returns `{id, via: 'canonical' | 'alias' |
  'implicit'}` or `{unresolved, candidates}`.
- `resolveRequirement(index, req)` returns a `RequirementBinding` or `UnresolvedSlot[]`.

**`RequirementBinding`** is the Phase 4 seam:

- `patternType` and `negated`;
- `system: SymbolId`, plus `trigger?` and `preCondition?` (BOTH may be present, per
  `engine/pipeline/check.ts:772`), or `feature?`;
- `response: SymbolId`, the whole response slot in Phase 3;
- `quantities: {label: SymbolId, comparator, value, unit, slot}[]`;
- `responseKind`, `stateEffect` and `stateConstraint`.

`bindingOf(r)` is this record. It never includes `sentence`, `intentRef` or `derived`.

**Allowed kinds per slot**

| slot | kinds |
|---|---|
| systemName | system |
| trigger | event or state |
| preCondition, state-driven | state |
| preCondition, optional-feature | feature |
| systemResponse | action |
| each label the engine's `extractNumericPredicates` returns | quantity |

There is one extractor and no lint grammar. A slot that carries a bound resolves BOTH as a whole
phrase, numerals included, AND through its labels. There is no exemption, which closes the
minimal-kernel numeric-slot hole.

**Callers**, each through the same functions:

1. **The fold.** `resolveRequirement` is injected as `MutateOptions.resolver` by
   `app/operations/mutate-options.ts` (S0); `domain/requirements` must not import the engine.
   `applyAdd` and slot `update`s call it whenever `vocabulary.symbols` is non-empty. A v4
   document folded WITHOUT a resolver is refused (`ERR_USAGE`, "no resolver"), so a caller that
   passes no options fails closed.
2. **The projection** (4.2).
3. **`bindingOf`** for drift (S16).
4. **`propose-vocabulary`**: bootstrap = `render(implicitVocabulary(D))`.
5. **The vocabulary tier** (S10).

### 4.2 The projection (the one trusted component) in `compat.toEngineDoc`

`toEngineDoc(document, projection?)`. `buildProjection(doc)` runs once per check:

- **Classes** are the union-find over committed merges. Admitted-distinct pairs are never
  unioned, and unadmitted distinct pairs are NOT unioned either (see 5.7). The class
  representative is the minimum SymbolId, so merge direction and the choice of canonical cannot
  change an atom. That structurally closes the term@reverse swap class. The class canonical is
  the representative's canonical.
- **Slot rewrite.** For each resolved slot (systemName, trigger, preCondition, systemResponse)
  whose `phraseKey(text)` differs from `phraseKey(classCanonical)`, the slot TEXT is replaced by
  the class canonical. A spelling whose key equals the canonical's is left verbatim, which is
  what keeps G-B and G-C at identity. The `sentence` is passed verbatim, so GTWR reads the
  author's words.
- **Quantity aliases** enter the engine's existing `quantityAliases` channel as synthesized
  glossary rows: class canonical ← every phrase of the class.
- **Every engine reader reads the same rewritten text.** The raw-text bridge parse, atomize,
  numeric, relational and semantic cannot disagree (the two-readings lesson). The canonical
  TEXT is passed, never the id. Passing the id as systemName would split relational's
  article-merged groups, which uses `normalize`, and delete FND_RELATIONAL_UNCHECKED
  disclosures (the a-finer-key lesson).
- **Legacy documents** (no vocabulary) skip the projection entirely, and G-A pins that.
- **Admitted `vocab-distinct` action pairs** cross as synthesized scoped waivers for
  FND_OPPOSITION_CANDIDATE and FND_SIMILAR_SEMANTIC with provenance `vocab-distinct` (S17,
  F13). This is the ONLY synthesized waiver channel.

**Why the projection is sound (the argument S6's property tests pin)**

- **(a) Coarser-or-equal.** V1 refuses two symbols of one domain whose phrases collide under
  phraseKey, and phraseKey is the engine's own atom key. So the symbol partition is never finer
  than today's atom partition, and every committed merge only coarsens it. A split exists only
  through an admitted distinct, which no other path produces.
- **(b) Merges only merge.**
  - V-OPP makes the canonical rewrite preserve every contrary pair, including cross-symbol ones
    (F4).
  - V-NUM makes it preserve every numeric predicate (F5).
  - V-KIND and V-STATE stop a merge from crossing kinds or state variables.
  - So a committed alias can add equalities and cannot delete an axiom, and by I-1 it can only
    add findings. G-D measures this over the gated matrix.

### 4.3 Invariants

Each invariant is ONE validator, `src/domain/vocabulary/invariants.ts`, called at two sites: the
fold (refuse) and check (drop, disclose, demote).

| id | invariant |
|---|---|
| V1 | Each phraseKey has at most one owning symbol per collision domain (system; guard = event ∪ state; feature; action; quantity). The quantity domain also refuses a key equal to any guard or action key, because the engine glossary is kind-blind |
| V2 | Aliases are one hop: an alias is never another symbol's canonical |
| V-OPP | Every phrase of a class has the class canonical's engine `opposition` (both absent, or equal key and negative). This subsumes AC-4-6: two contraries in one class have opposite `negative` on one key |
| V-NUM | Every phrase of a class has the class canonical's `extractNumericPredicates` signature |
| V-KIND / V-STATE | A class is single-kind, and state symbols in one class share `variable`/`value` |
| V-PARENT | Parents exist, are systems, and are acyclic; merged systems do not have different non-null parents |
| V-FROZEN | In v4, the glossary and terms hash equals `vocabulary.frozenTables.sha256` |

The `antonym` fold re-runs V1 and V-OPP under the new index, and refuses the antonym when either
fails.

---

## 5. Checks, and how `verified` changes

### 5.1 New finding codes

| code | severity | demotes | tier file | AC |
|---|---|---|---|---|
| ERR_UNRESOLVED_SYMBOL | fold error | — | errors.ts | 4-3 |
| FND_UNRESOLVED_SYMBOL | error; the requirement is excluded from formal | `unresolved-symbol` | vocabulary | 4-3 check twin |
| FND_VOCABULARY_INVALID | warn | `vocabulary-invalid` | vocabulary | 4-6 check twin, V-FROZEN |
| FND_SYMBOL_ALIAS_CANDIDATE | info | `symbol-alias-candidate` (untriaged pairs only) | vocabulary | 4-4 |
| FND_DISTINCTION_UNSUPPORTED | warn; its evidence is the merged or contrary run's conflict signals | `distinction-unsupported` | vocabulary | 5-7 |
| FND_INTENT_UNBOUND | error | — | intent | 5-2 check twin |
| FND_INTENT_UNCOVERED | error | `intent-uncovered` | intent | 5-2 |
| FND_INTENT_CHANGED | error | — | intent | 5-2 |
| FND_ANCHOR_REPINNED | info | — | intent | D2 only |
| FND_DERIVED_WEAKENS | error | — | intent | 5-2 |
| FND_SEMANTIC_DRIFT | error | — | delta | 5-9 |

**New demotion reasons**

- `waived-blocking-lint` (AC-5-6, last clause)
- `run-weakened`, extended: it names each knob below its pin, plus `baseline` when the config
  requires one
- `intent-absent` and `vocabulary-absent`, only when the config sets `requireIntent` or
  `requireVocabulary`
- `drift-unattributed`
- `state-model-weakened`
- `counterfactual-unchecked`, for a cap hit, a budget hit, or an inexpressible counterfactual.
  Degradation stays monotone.

### 5.2 `verified`

The predicate is unchanged: `verified = allDemotions.length === 0` in `app/operations/check.ts`,
which stays the single writer. Every greenfield tier pushes into `allDemotions`. A pinned
`strict: true` makes each new demotion exit 3 in the gate. No greenfield tier removes an engine
demotion. The only verdict-moving component is the projection plus the synthesized
`vocab-distinct` waiver, and both are gated.

### 5.3 Waivers (AC-5-6)

**At write time**

- The fold refuses `waive` for a `never`-class code (`ERR_WAIVER_REFUSED`).
- It also refuses any waiver without both `refs` and a `contentHash`. `ref` is normalized to
  `refs: [ref]` and must equal the finding's requirement ids.
- The fold computes `contentHash` itself, as it does today. `import.ts` `applyWaive` goes
  through the same classifier.

**At check time, in compat**

- A stored waiver that does not qualify becomes inert: it is dropped and disclosed as
  `waiver-inert`, with its replacement ops.
- Stale-hash waivers, which `bindsCurrentText` drops silently today, are disclosed the same way
  in `data.ignoredWaivers`.

**Blocking lint.** A waived blocking lint still re-admits its requirement to the solver (W1c).
It now also demotes `waived-blocking-lint`, computed at the app boundary as
`excludedIds(gateRequirements(reqs, []))` minus the post-waiver excluded set. There is no
engine edit.

**Discharge prose.** `advice/repair.ts` stops emitting waive ops for `never` codes. The engine
demotion prose at `engine/pipeline/check.ts:2093-2104` ("or waive it") and the
FND_SIMILAR_SEMANTIC suggestion are changed to the vocabulary-era remedy, `vocab distinct`. That
is the one prose-only engine edit, and it is gated by a negative guard over the report corpus:
no emitted action or suggestion for a `never` code contains `waive`. `scope.ts`
`coverageDemotion` is rewritten, with a negative guard that the phrase "or waived" is ABSENT.

### 5.4 Baseline (AC-5-8 plumbing)

- `check --baseline <ref>` loads the document, intent, policy and config at the ref through the
  `BaselineSource` port. The git adapter runs `git show <ref>:<path>`; an in-memory adapter
  serves tests and the harness.
- The document path and the `files.*` paths come from the BASELINE's config.
- The SAME pipeline function (`runCheckPipeline`, extracted in S14 with byte-identical output)
  runs on both sides, with the same build and the same EFFECTIVE knobs. A tool upgrade or a
  knob change therefore never creates a delta.
- When the pinned config requires a baseline, a missing ref is `ERR_BASELINE_UNAVAILABLE`.
- When the config pins `baseline.ref` and the CLI passes a different ref, the ref is disclosed
  and the run gets `run-weakened(baseline)`.

### 5.5 `data.semanticDelta` (AC-5-8)

```
semanticDelta = {
  baseline: {ref, commit, docSha256, intentSha256, policySha256, configSha256},
  changes:  ChangeUnit[],     // structural doc diff: requirement added/deleted/rebound(fields),
                              // vocab symbol/alias/merge/distinct, frozen-table, antonym, waiver,
                              // state-model, intent, policy, config; each tagged with OP_DIRECTION
  removed:  [{signal, attributedTo: ChangeUnit[], verdict, certificate: null}],
  added:    [{signal, attributedTo}],
  transformed: [{from, to}],
  runDelta: [...]
}
```

**Signal identity** is `kind | code-or-reason | sorted(requirement key ?? id)`, plus symbol or
intent ids for greenfield codes. A delete and re-add under the SAME key reads as an edit; under
a new key it reads as a deletion plus an addition. When several signals share an identity,
the evidence fingerprint (sorted atom names or quantity key) breaks the tie. A same-identity
signal whose fingerprint changed goes in `transformed[]` and is reported, never silent (I-5).
Signals swapped from pair A to pair B read as removed plus added, which meets AC-5-8's sabotage.

**Attribution** is by document diff. symspec keeps no op log (spec gap G12). A change unit is
relevant to a signal when it touches:

- the signal's requirements;
- the symbols those requirements bind;
- the state model, for reachability signals;
- the waivers of that code.

The verdict values are `drift`, `discharged-by-strengthening`, `resolved-by-unification`,
`admitted` (a distinct basis), `state-model-weakened`, and `unattributed`. Attribution needs no
counterfactual revert-and-rerun. The adversary-first revert engine is cut for simplicity.

### 5.6 FND_INTENT_CHANGED (AC-5-2)

- sha256 over canonical JSON of intent and policy, compared with the baseline. The finding
  names each changed, added or removed item id.
- The config's hash is compared too, as a design addition (spec gap G13).

**D2 (repin)**, if the lead accepts it:

- A change whose current hash equals the working-tree `config.anchors.*Sha256` is reported as
  FND_ANCHOR_REPINNED (info) instead of an error.
- The config is in the CODEOWNERS stanza, so a repin needs owner review, and that review is the
  only thing that tells an owner's change from an agent's (spec gap G14).
- Without D2, every legitimate intent PR is red by construction.

### 5.7 Vocabulary distinctness (AC-5-7) and the counterfactual runner

There is one app-layer port, `DecideRunner(doc, projectionOverride) -> Signals`. It runs
`runCheckPipeline` with the same effective knobs, the semantic tier on, and reachability only
when the state model is touched. It is charged to `--solver-budget-ms`, and a cap hit gives the
`counterfactual-unchecked` demotion.

`CONFLICT_SIGNALS` = error verdict findings plus conflict-signal demotions.

For each `distinct {a, b}`, sorted and capped:

1. **Merge counterfactual.** Union a and b in the projection. The signal is positive when that
   adds any CONFLICT_SIGNAL.
2. **Contrary counterfactual, ACTION pairs only.**
   - Assert a and b contrary. Apply the antonym op that the pair's own opposition-candidate
     finding proposes, or the one derived from the two canonicals' heads over a shared
     remainder.
   - The signal is positive when that adds any CONFLICT_SIGNAL.
   - When no antonym op can express the contrary, emit `counterfactual-unchecked` (it demotes)
     (F6).
3. **Admission.**
   - A pair is admitted when both applicable counterfactuals are negative (free), or when a
     BASIS holds.
   - An intent basis: some intent item's text contains a non-overlapping whole-token span of
     each symbol's CANONICAL phrase. Aliases do not count, because they are agent-appendable.
   - A partOf basis: the two systems' parents differ AND the parent pair is itself admitted
     through an intent basis, recursively. A parent pair admitted "free" does NOT count, which
     closes invent-parents.
   - The basis is re-derived on every check and never stored.
4. **Not admitted.**
   - The run reports FND_DISTINCTION_UNSUPPORTED (warn, demotes), whose evidence is the
     counterfactual's added conflict signals.
   - The main report runs on the DECLARED partition, so no FND_CONTRADICTION is fabricated
     (Story 2). This deviates from "stays merged for checking" (spec gap G9).
5. **Admitted action pairs** cross compat as synthesized scoped waivers for their opposition
   and similar findings (4.2). The final report re-runs only when an admitted pair has such a
   finding.

Batching: one merge run and one contrary run cover every pair. Leave-one-out runs only when a
batched run is positive, and only over the pairs whose symbols bind the positive signals'
requirements.

### 5.8 Intent tier (AC-5-2)

The tier runs when a bundle has non-empty intent.

- **FND_INTENT_UNCOVERED** (error, demotes) fires for an `obligation` or `goal` item that no
  requirement binds. Assumption items are exempt, as a Phase 6 seam.
- **FND_INTENT_UNBOUND** (error) fires for a requirement with neither `intentRef` nor
  `derived`, or with a dangling `intentRef`.
- **The fold** refuses an `add` that has neither (`ERR_UNTRACED_REQUIREMENT`). Bootstrap
  documents and requirements that existed before intent are the check-time twin's job.
- **FND_DERIVED_WEAKENS** (error):
  - Counterfactual: run without every `derived` requirement.
  - When that run has a CONFLICT_SIGNAL or a coverage demotion that the full run lacks,
    leave-one-out names each culprit.
  - Coverage demotions count here deliberately, because a derived decoy must not buy coverage.
  - This is AC-5-2's "refuse", as a check-time error (spec gap G6).

### 5.9 FND_SEMANTIC_DRIFT (AC-5-9)

This is the rule, and it replaces every design's version. It fires for a removed signal `s`
when ALL of the following hold:

1. `s` is an error finding of class `verdict`, or a demotion whose `DEMOTION_CLASS.drift` is
   true.
2. At least one requirement `s` names (mapped from the baseline by id, then key, then a unique
   intentRef) has `bindingOf` changed or was deleted, OR a `weakening` vocabulary change unit
   touches the symbols those requirements bind (`vocab-unalias`, `unvocab`, `vocab-undistinct`,
   `unantonym`).
3. Neither of these holds:
   - `s` is a demotion and `resolvedBy` holds in the current document: the named pair is now
     one class, or now registered contraries, or the named quantity labels are now one class.
   - `transformed` holds: the current report has an error of the same code naming a superset of
     the requirements.
4. There is no certificate. In Phase 3 there never is.

**When a removal is not drift**

- A removed `verdict` finding attributed ONLY to state-model units gives
  `state-model-weakened` (demotes).
- A removed `verdict` finding with no relevant unit gives `drift-unattributed` (demotes). It is
  never an error: detect and demote, never fabricate.
- Everything else, including coverage, hygiene, wording and disclosure, is listed in
  `removed[]` and does not drift.

**The designed-discharge gate (S16)**, the gate for F1 and F2: applying each designed discharge
under `--baseline` must produce NO FND_SEMANTIC_DRIFT. The discharges are:

- `update intentRef`
- declaring a missing symbol
- `vocab-alias` for an alias candidate
- `antonym` for an opposition candidate
- `vocab-alias` for a quantity alias candidate
- rewording a GTWR-blocked requirement
- every tool-emitted reachability `repair.ops`
- bootstrap (G-F)

---

## 6. Migration

**Legacy documents**, meaning no vocabulary, no intent, no config and no `--baseline`, check
byte-identically. Gates G-A and G-C pin that. There are two deliberate deltas, and both close
live escapes.

1. **AC-5-6.**
   - Stored waivers that are code-only, single-`ref` without a hash, or on a `never` code go
     inert.
   - Each is disclosed as `waiver-inert`. For every finding it matches today, the diagnostic
     carries the exact `unwaive` op plus a scoped `waive refs+contentHash` op, but only for
     `scoped`-class codes.
   - For `never` codes the replacement is `vocab distinct` or `antonym` (which needs the
     vocabulary, see step 1 of the opt-in path), or "rewrite required".
   - `symspec propose-vocabulary --rescope-waivers` emits that stream in one piece.
   - This is a breaking change. Ship it as `feat!`, or with a `Release-As:` trailer per
     RELEASING.md. It is also why decision D4 matters.
2. **AC-4-6 check twin.** A committed glossary or term entry that fails V-OPP or V-NUM is
   ignored, disclosed as `legacy-table-entry-ignored`, and demotes `vocabulary-invalid`.
   Ignoring it restores the contrary axiom and drops only findings that the incoherent merge
   fabricated. The demotion keeps the run from verifying.

`--baseline` on a legacy document compares implicit-vocabulary bindings. Drift therefore works
there too, and it catches flip, rebind, unglossary and unterm with no opt-in.

**The opt-in path**

1. `symspec propose-vocabulary --field data.opsJsonl | symspec apply -`
   - The stream is `render(implicitVocabulary(D))`, the IDENTITY declaration, with the
     deterministic ids. The glossary and terms are KEPT and FROZEN (V-FROZEN hash recorded);
     phraseKey is computed under them, so G-B holds.
   - Proposed merges go in `data.aliasOps`, one applicable op each and never in the identity
     stream. `data.withheld` lists the withheld pairs with a reason for each and "leave
     distinct" first.
   - New `symbol-alias-candidate` demotions after the bootstrap are expected. They are listed
     in the stream summary, with counts interpolated.
2. `symspec init --split` writes skeleton `intent.json` and `policy.json` files, plus a
   `symspec.config.json` pinning the current defaults and `baseline: {required: true, ref:
   'origin/main'}`. It never clobbers an existing file (write-safety). The owner then writes
   intent and policy.
3. Once intent is non-empty, every existing requirement reads FND_INTENT_UNBOUND until it is
   bound (`update <ref> intentRef <id>` or `derived true`). That is intended.
4. CI runs `symspec check --strict --baseline origin/main`. It needs a fetch depth that
   includes the ref.
5. `symspec install --codeowners` emits the stanza.

**Release.** The change is breaking for AC-5-6. Record the Release-As / semver decision per
RELEASING.md. Every slice runs `pnpm gen:agents`, and `codegraph sync` after structural changes.
Counts in prose stay interpolated, each with a NEGATIVE guard.

**Phase 4 seam.** Typed-atom slice 11 replaces the text rewrite with `Scope.id := class
representative id`, and binds `SlotLiteral`s from `RequirementBinding`. Its gate is G-A/G-B as a
pure rename: the same row count and the same partition.

---

## 7. Gates (instruments, built first)

| gate | what it asserts | built in |
|---|---|---|
| G-A | `atom-corpus.txt` is byte-unchanged through every Phase 3 slice (the legacy path) | existing; asserted in S8 |
| G-B | Bootstrap parity for atoms: for every corpus document D, the rows of `encodeIncluded(toEngineDoc(apply(bootstrap(D))))`, slot text included, equal D's | S8 |
| G-C | Report parity: a `report-corpus.txt` snapshot taken BEFORE any vocabulary code (engine findings, non-vocabulary demotions and `verified` per document, armed knobs, orthogonal embedder). bootstrap(D) equals D except for rows in an exact-both-ways `MIGRATION_DELTA` (expected empty). Vocabulary-tier rows are snapshotted separately | S1 (snapshot), S8 (parity) |
| G-D | The measured direction (3.1), with an exact `KNOWN_NONMONOTONE` | S2 |
| G-E | KNOWN_ESCAPES exact in both directions, per `(variant, fixture, move)` (I-5) | S13 |
| G-F | Drift-free opt-in: for every corpus document D, `check --baseline D` on bootstrap(D) has an empty `removed[]` and no FND_SEMANTIC_DRIFT | S16 |
| G-G | Designed-discharge round-trip: no drift on any designed repair (5.9) | S16 |

Every slice re-runs the spec reproducers it touches against the built `dist/cli.mjs` and records
its sabotage in the commit message.

---

## 8. Gaming: KNOWN_ESCAPES rows closed, and rows still open

### 8.1 Harness variants

The harness gains a `variant` axis:

- **`legacy`**: today's fixtures, unchanged.
- **`gated`**: each fixture bootstrapped through propose-vocabulary, with one intent item per
  requirement (bound), a policy, a config pinning armed knobs, and the pre-move bundle injected
  as the baseline through the in-memory `BaselineSource`.

KNOWN_ESCAPES rows gain `variant` and `requires: ('intent' | 'baseline' | 'vocabulary')[]`
fields. `closedBy` keeps its `/^AC-[4-7]-\d+$/` guard, and a legacy row still cites the AC that
closes it once opted in. A new `raw` edit kind does direct document surgery that bypasses the
fold, so each check-time twin is measured.

The prerequisite is S0: `gaming.ts` `fold` must use the shared mutate options, or every
write-time fence is invisible to the gate.

### 8.2 The 35 current rows

| row(s) | count | legacy | gated |
|---|---|---|---|
| waive-by-code | 6 | CLOSED by S3 (refused at write; raw copy inert at check) | CLOSED by S3 |
| alias-contraries-glossary @forward/@reverse (contrary-pair) | 2 | CLOSED by S4 (V-OPP in the glossary fold, plus the check twin) | refused: glossary frozen in v4 (S7); the vocab twin is refused by V-OPP |
| alias-contraries-term @forward/@reverse (contrary-pair) | 2 | expected CLOSED by S0 (the real `validateTerms` refuses accept/reject, which are antonym heads); S4 V-OPP is the fallback, verified in the S0 commit | refused: term frozen |
| alias-contraries-term@reverse (term-bridged) | 1 | expected CLOSED by S0 (apply's swallowed-alias refusal fires under the real normalizer); check twin S4 (legacy-table swallow check) | refused: term frozen; the class representative is the minimum id |
| delete-requirement@first | 7 | OPEN, `requires: intent` | CLOSED by S12 (FND_INTENT_UNCOVERED demotes) and S16 (drift) |
| delete-requirement@second | 6 | OPEN, `requires: intent` | CLOSED by S12 and S16 |
| flip-negated @first/@second | 8 | OPEN, `requires: baseline` (closed by legacy `--baseline` through implicit bindings; unit-tested) | CLOSED by S16 |
| unglossary (glossary-bridged) | 1 | OPEN, `requires: baseline` | refused (frozen); raw removal caught by V-FROZEN (S7) |
| unterm (term-bridged) | 1 | OPEN, `requires: baseline` | refused (frozen); raw caught by V-FROZEN |
| rebind-effect (state-invariant) | 1 | OPEN, `requires: baseline` | CLOSED by S16 (stateEffect is in `bindingOf`) |

Result: 11 of the 35 rows are closed in `legacy`, and all 35 in `gated`. The 24 legacy rows that
stay open are documented as the boundary of the unanchored mode, and the published scope says
so.

### 8.3 Promoted from NOT_APPLICABLE_YET, in `gated`

- `edit-intent` and `edit-policy`: caught by FND_INTENT_CHANGED (S14).
- `weakening-derived`: caught by FND_DERIVED_WEAKENS (S17).
- `refine-exceeds-conflict`, `yield-against-policy` and `untraced-assumption`: stay pending for
  Phase 6.

### 8.4 New moves, all in `gated` unless noted

| move | expected |
|---|---|
| rename-system-new-symbol (declare a near-duplicate, rebind) | FND_SYMBOL_ALIAS_CANDIDATE (lexical signal) plus drift |
| far-rename | drift only |
| alias-contraries-vocab @forward/@reverse | refused (V-OPP) |
| alias-via-intermediary | refused (class-level V-OPP) |
| alias-cross-symbol-contrary (open/shut, then alias seal_valve "shut the valve") | refused (V-OPP) (F4) |
| alias-numeric-mismatch ("heat to 25 C" onto "heat to 20 C") | refused (V-NUM) (F5) |
| vocab-distinct-unsupported (door controller / door control unit) | FND_DISTINCTION_UNSUPPORTED |
| distinct-opposition-free (fill/drain; heat/cool) | FND_DISTINCTION_UNSUPPORTED through the contrary counterfactual (F6) |
| invent-parents (fresh parents plus distinct) | FND_DISTINCTION_UNSUPPORTED (recursive basis) |
| unvocab-referenced, unalias-referenced | refused |
| undistinct-after-admission | drift when a verdict finding goes |
| derived-decoys (new fixture `uncovered-pair`) | FND_DERIVED_WEAKENS |
| mark-culprit-derived, retarget-intentRef | FND_INTENT_UNCOVERED |
| cover-intent-then-delete | drift |
| delete-intent-item, drop-intent | FND_INTENT_CHANGED |
| edit-config-lower, delete-config, shadow-config | inert: strongest-of pins, fixed location |
| omit-baseline | `run-weakened(baseline)` |
| baseline-head (`--baseline HEAD` against a pinned ref) | `run-weakened(baseline)` |
| state-frame-release (redeclare volatile to drop a violation) | `state-model-weakened` |
| stub, semantic-off, 1ms, temporal-bound-1 under pins | deterministic `run-weakened`, which removes TIMING_SENSITIVE nondeterminism in gated |
| raw: inject-unresolved-requirement, inject-contrary-class, inject-code-waiver, raw-unglossary-v4 | FND_UNRESOLVED_SYMBOL, FND_VOCABULARY_INVALID, waiver-inert, V-FROZEN |

### 8.5 Still open after Phase 3, stated in the scope

- **`intent-bound-decoys` (`uncovered-pair`).** Decoys bound to existing intent items buy
  per-requirement participation. It is a new KNOWN_ESCAPES row with `closedBy: AC-7-2`.
- **Every legacy row in 8.2 marked OPEN.**
- **Any weakening move a kernel would certify.** It reads as caught, which is the safe default.
- **Outside the harness** (listed in an `OUT_OF_BAND` table in the scope corpus, not in
  KNOWN_ESCAPES):
  - editing CI to drop `--baseline`;
  - pinning an old symspec, which ignores split files;
  - first adoption;
  - repinning anchors in a repo whose CODEOWNERS does not cover the config (D2).

---

## 9. Ordered slices

Conventions: each slice ends with `pnpm check` green and a sabotage observed red, recorded in the
commit body. "(repro)" marks the AC's own named sabotage.

### S0 The harness measures the real write path
- **ACs:** AC-8-1 (prerequisite), AC-4-6, AC-4-2 (re-attribution)
- **Files:**
  - `src/app/operations/mutate-options.ts` (new: exports the builder; `MUTATE_OPTIONS` moved
    out of `mutation.ts:162`)
  - `src/app/operations/mutation.ts`
  - `src/app/operations/import.ts` (`foldImportStream` and `applyWaive` use the shared
    validators)
  - `src/testing/gaming.ts` (fold at `:1170`)
  - `src/testing/__snapshots__/gaming-*.txt`
- **Change:** One builder serves apply, import and the harness. Each KNOWN_ESCAPES row that now
  reads `refused` is DELETED, with the argument for it in the commit. The rows expected to go are
  alias-contraries-term on contrary-pair (2) and alias-contraries-term@reverse on term-bridged
  (1). `apply` behaviour does not change.
- **Sabotage:**
  - (a) Revert `fold` to `foldOps(doc, ops, TS)`: both "every row still escapes" and "no
    unlisted clean verdict" go red.
  - (b) An import stream with an odd antonym cycle is refused. Bypass the validator in import
    and the test goes red.
- **Depends:** none

### S1 Report-corpus snapshot, taken before any vocabulary code
- **ACs:** I-5, AC-4-2 and AC-4-7 (parity instrument)
- **Files:** `src/testing/report-corpus.test.ts` (new), `src/testing/__snapshots__/report-corpus.txt` (new)
- **Change:** One row per document over eval-rounds, fabrication and the gaming fixture
  baselines. The run uses the real check wiring, armed knobs and the orthogonal embedder. Each
  row holds the sorted findings (code, severity, ids), the demotions (reason, ids) and
  `verified`. The row count is asserted separately.
- **Sabotage:** Delete the `conditional-conflict-unchecked` push in
  `engine/pipeline/check.ts` (~`:1991`). Feature-interaction goes red. Revert the edit, and
  record it as proof the snapshot is compared rather than re-created.
- **Depends:** none

### S2 Classes as data: OP_DIRECTION, FINDING_CLASS, DEMOTION_CLASS; measured direction
- **ACs:** AC-5-1
- **Files:**
  - `src/domain/requirements/ops.ts` (`OP_DIRECTION`), `ops.test.ts`
  - `src/app/runtime/signal-classes.ts` (new: `FINDING_CLASS`, `WAIVABILITY` derivation,
    `DEMOTION_CLASS`, `AppDemotionReason`)
  - `src/app/runtime/catalog.ts` (`class` and `waivable` columns in rows)
  - `src/app/operations/index.ts` (manifest `opDirections` and `signalClasses`)
  - `src/app/runtime/agents-doc.ts`, `AGENTS.md`
  - `src/testing/gaming.ts` and `gaming.test.ts` (Move.direction derived from emitted verbs; G-D;
    `KNOWN_NONMONOTONE`)
- **Change:** The tables from sections 2.3 and 3, with a `why` on every row. The hand-typed
  move directions are deleted, and run-weakening moves are unchanged. `KNOWN_NONMONOTONE`
  starts with the alias-contraries-glossary rows. This slice does NOT touch
  `app/operations/check.ts`; the cast is replaced in S3.
- **Sabotage:**
  - (a) Append a verb with no OP_DIRECTION row: `tsc` goes red.
  - (b) Relabel `delete` as strengthening: G-D goes red on delete-requirement.
  - (c) Drop a manifest row: the AGENTS.md drift check goes red.
  - (d) Class a GTWR code `never`: the waiver-scope test goes red.
- **Depends:** S0

### S3 Waivability (AC-5-6)
- **ACs:** AC-5-6
- **Files:**
  - `src/domain/requirements/mutate.ts` (`applyWaive` refusal through an injected classifier)
  - `src/app/operations/mutate-options.ts`, `src/app/operations/import.ts`
  - `src/domain/compat.ts` (inert waivers and stale hashes disclosed, with replacement ops)
  - `src/domain/requirements/document.ts` (DIAGNOSTIC_KINDS append)
  - `src/app/operations/check.ts` (`waived-blocking-lint`; replaces the `:1006` cast with
    `AppDemotionReason`)
  - `src/domain/advice/repair.ts`
  - `src/domain/engine/pipeline/check.ts` (PROSE ONLY, `:2093-2104` and the SIMILAR_SEMANTIC
    suggestion)
  - `src/app/runtime/scope.ts` and `scope.test.ts`
  - `src/app/operations/roundtrip.test.ts`
  - `src/testing/gaming.ts` (delete the waive-by-code rows)
- **Change:** As in 5.3.
- **Sabotage:**
  - (repro) Accept a code-only waiver. The heat/cool waiver followed by fill/drain reaches
    `verified: true`, and the test goes red.
  - Re-add a waive-by-code row: the exactness test goes red.
  - Negative guards: "or waived" is ABSENT from scope, and no `never`-code action or suggestion
    in the report corpus contains `waive`.
  - Drop `waived-blocking-lint`: the "waived GTWR error still demotes" test goes red.
- **Depends:** S0, S1, S2

### S4 Legacy tables: contrary- and numeral-preserving merges, with a check twin
- **ACs:** AC-4-6 (legacy half)
- **Files:**
  - `src/app/operations/mutate-options.ts` (new `validateGlossary`; `validateTerms` extended
    with V-OPP and V-NUM)
  - `src/domain/requirements/mutate.ts` (`applyGlossary` calls `validateGlossary`, a new
    `MutateOptions` field)
  - `src/domain/compat.ts` (ignore offending stored entries, including a term canonical that
    swallows an alias)
  - `src/app/operations/check.ts` (`vocabulary-invalid` demotion)
  - `src/testing/gaming.ts` (delete the alias-contraries-glossary rows and their
    `KNOWN_NONMONOTONE` entries)
- **Change:** One validator, `domain/vocabulary/invariants.ts` from S6, is wired into the
  legacy folds and the check twin.
- **Sabotage:**
  - Skip the validator in the glossary fold: alias-contraries-glossary escapes and G-E goes red.
  - Skip the compat twin: a raw fixture `{canonical: 'accept the claim', aliases: ['reject the
    claim']}` reaches clean and the test goes red.
- **Depends:** S3 (same files: `mutate.ts`, `compat.ts`, `check.ts`), S6

### S5 Document format v4 and the anchor leaf
- **ACs:** AC-4-1 (schema), AC-5-2 (schema), AC-5-12 seam
- **Files:**
  - `src/domain/requirements/document.ts` (vocabulary, intent, policy, requirement
    `intentRef`/`derived`, `DOC_VERSION_VOCAB`)
  - `src/adapters/fs/store.ts` (`checkDocVersion` accepts 3 and 4)
  - `src/domain/anchor/anchor.ts` (new), `document.test.ts`
  - `src/package-boundary.test.ts` (anchor imports only `effect/Schema`)
- **Change:** The schemas from 2.1, with every field `.describe()`d so the manifest derives.
  Nothing consumes the new keys yet.
- **Sabotage:**
  - (a) Admit `vocabulary` under docVersion 3: the "v3 stays v3" test goes red.
  - (b) Omit `intent` on save: the round-trip test goes red.
  - (c) A v3 fixture must still hash byte-identically after load and save.
  - (d) Import `domain/requirements` from `anchor.ts`: the boundary test goes red.
- **Depends:** none

### S6 Resolver chokepoint, implicit vocabulary, invariants (pure)
- **ACs:** AC-4-1, AC-4-2 (partition argument), AC-4-6 (validator)
- **Files:**
  - `src/domain/vocabulary/{resolve.ts, implicit.ts, invariants.ts, ids.ts, projection.ts}`
    (new)
  - `resolve.test.ts`, `invariants.test.ts`
  - `src/package-boundary.test.ts` (vocabulary may import `engine/formal` like compat; the
    engine imports nothing from vocabulary)
- **Change:** `phraseKey`, `buildVocabularyIndex` (V1–V-FROZEN), `resolvePhrase`,
  `resolveRequirement`, `bindingOf`, `implicitVocabulary`, `renderVocabularyOps`,
  `mintSymbolId` and `buildProjection` (union-find with the minimum-id representative). There
  are no callers yet. The property tests, over every corpus document plus constructed
  multi-spelling fixtures (two spellings, article variants, unit case `MW`/`mw`), are:
  - (1) Two slots with one atom name share one implicit symbol (coarser-or-equal).
  - (2) `buildVocabularyIndex(render(implicit(D)))` equals `implicit(D)`.
  - (3) `normalizeScope(id) === id` and quantityKey(id) === id for every minted id.
  - (4) V-OPP preserves `areContrary` across the canonical rewrite, for every pair of phrases
    in two classes.
- **Sabotage:**
  - Key actions with `normalize` instead of the atomize resp body: 'opens the valve' / 'open
    the valve' become two symbols sharing one atom, and (1) goes red.
  - Key systems with `normalize` (which strips the article): the 'A Gateway' / 'Gateway' test
    goes red.
  - Drop V-OPP: the seal/shut constructed fixture goes red in (4).
  - Drop V-NUM: the 20 C / 25 C fixture goes red.
- **Depends:** S5

### S7 Vocab ops in the fold, ERR_UNRESOLVED_SYMBOL, frozen legacy tables, `symspec vocab`
- **ACs:** AC-4-1, AC-4-3, AC-4-6
- **Files:**
  - `src/domain/requirements/ops.ts` (6 verbs appended, OP_DIRECTION rows)
  - `src/domain/requirements/mutate.ts` (`applyVocab*`; resolution in `applyAdd`/`applyUpdate`;
    fail-closed without a resolver; glossary, term, unglossary and unterm refused in v4;
    V-FROZEN hash at opt-in; docVersion bump; `antonym` re-validation)
  - `src/app/operations/mutate-options.ts` (resolver injection)
  - `src/ports/errors.ts`, `src/app/runtime/catalog.ts` (ERR_UNRESOLVED_SYMBOL,
    ERR_VOCABULARY_CONFLICT)
  - `src/app/operations/vocab.ts` (new CLI op), `src/app/operations/index.ts`
  - `src/testing/gaming.ts` (OP_COVERAGE rows), `AGENTS.md`
- **Change:** Once a document has a non-empty vocabulary, every `add` and every slot `update`
  must resolve.
- **Sabotage:**
  - (a) (repro) Bind the top candidate: the ERR fixture goes red.
  - (b) (repro) Skip the V-OPP check in `vocab-alias`: heat/cool the cabin merges and the test
    goes red.
  - (c) Fold a v4 document with no resolver and let the fold proceed: the fail-closed test goes
    red.
  - (d) Allow `glossary` in v4: the frozen-table test goes red.
  - (e) Skip `antonym` re-validation: an antonym that makes two action symbols collide is
    accepted, and the test goes red.
- **Depends:** S2, S4, S6

### S8 The projection at compat, with check-time twins and parity gates
- **ACs:** AC-4-2, AC-4-3 (check twin)
- **Files:**
  - `src/domain/compat.ts` (`toEngineDoc(document, projection?)`)
  - `src/domain/vocabulary/vocabulary-codes.ts` (new: FND_UNRESOLVED_SYMBOL,
    FND_VOCABULARY_INVALID)
  - `src/app/runtime/catalog.ts` (union line)
  - `src/app/operations/check.ts` (splice)
  - `src/testing/bootstrap-parity.test.ts` (new: G-B, G-C)
- **Change:** As in 4.2. Legacy documents skip the projection. `MIGRATION_DELTA` is exact both
  ways and expected to be empty.
- **Sabotage:**
  - (a) (repro) Pass the raw systemName through: the aliased 'The Door Controller' /
    'door-controller' fixture loses its FND_CONTRADICTION and goes red.
  - (b) Substitute the id as systemName: G-C goes red on a fixture where relational groups 'the
    pump' with 'pump'.
  - (c) Rewrite canonical-equal spellings: G-B goes red on the two-spelling fixture.
  - (d) Fall back to verbatim text for an unresolved slot: the raw-unresolved fixture reaches
    clean and goes red (F3).
- **Depends:** S1, S7

### S9 propose-vocabulary: identity bootstrap, alias proposals, withheld pairs
- **ACs:** AC-4-5, AC-4-7
- **Files:**
  - `src/app/operations/propose-vocabulary.ts` (new; embedder required, fails closed, no Z3)
  - `src/domain/vocabulary/plan.ts` (new; reuses glossary-plan clustering)
  - `src/domain/vocabulary/distinctness.ts` (new: single-token, numeral, parent and
    registered-contrary signals, extracted from and shared with
    `src/domain/glossary/glossary-plan.ts:960-995`)
  - `src/app/operations/index.ts`, `AGENTS.md`
- **Change:** `data.ops` / `opsJsonl` is the identity stream. `data.aliasOps` holds proposed
  merges, grouped by class. `data.withheld` holds withheld pairs with reasons, "leave distinct"
  first. `--rescope-waivers` adds the AC-5-6 migration stream. Exit is always 0, and summary
  counts are interpolated.
- **Sabotage:**
  - (repro) Drop the single-token signal: front/rear door controller is proposed and the test
    goes red.
  - Drop the numeral signal: pump 1 / pump 2 goes red.
  - Drop the parent signal: primary/backup database goes red.
  - Omit guard phrases from the stream: the AC-4-7 property (apply the stream, and every
    requirement resolves) goes red.
- **Depends:** S8

### S10 Vocabulary tier: FND_SYMBOL_ALIAS_CANDIDATE
- **ACs:** AC-4-4
- **Files:**
  - `src/domain/vocabulary/vocabulary-tier.ts` (new, an app-boundary tier like terminology)
  - `vocabulary-codes.ts`
  - `src/app/operations/check.ts` (splice)
  - `src/domain/advice/repair.ts` (plus the exhaustive reason test)
  - `src/app/runtime/scope.ts` (claim)
- **Change:**
  - Two signals over same-kind symbol pairs, explicit vocabularies only:
    - (a) cosine at or above a MEASURED floor for symbol-length phrases, with the measurement
      recorded in the commit;
    - (b) a DETERMINISTIC lexical rule: token edit distance 1, a numeral-only difference, or a
      token-subset relation.
  - Signal (b) exists because the stub and orthogonal embedders propose nothing, so without it
    AC-4-4 would be ungated in the harness.
  - Merged pairs and pairs recorded as distinct do not demote.
  - The remedies are `vocab-alias` and `vocab-distinct`, ordered by the S9 signals.
- **Sabotage:**
  - (a) Make the finding non-demoting: the "declare a near-duplicate, check verified:false"
    test goes red.
  - (b) Count distinct pairs as untriaged: the discharge test goes red.
  - (c) Run the tier on legacy documents: G-C goes red.
  - (d) Drop signal (b): the harness rename-system-new-symbol move escapes.
- **Depends:** S9

### S11 Pinned config, bundle loading, init --split
- **ACs:** AC-5-10, AC-5-13 (init)
- **Files:**
  - `src/domain/config/config.ts` (new: schema, `RUN_KNOBS` with effective comparators,
    strongest-of)
  - `src/ports/doc-store.ts`, `src/adapters/fs/store.ts` (`loadBundle`, fixed location)
  - `src/app/operations/document.ts` (`init --split`, write-safety)
  - `src/app/operations/check.ts` (compare pins; `run-weakened` per knob;
    `data.run.pinned`/`belowPinned`)
  - `AGENTS.md`
- **Change:** As in 2.2.
- **Sabotage:**
  - (a) Invert the temporalBound comparator: `--temporal-bound 1` under a pin of 10 reads as not
    weakened, and the test goes red.
  - (b) Compare the raw `reachabilityTimeoutMs`: a pin of 0 with a run at 1 is not flagged, and
    the test goes red (F10).
  - (c) Walk ancestors: the shadow-config test goes red (F11).
  - (d) Let `init --split` overwrite an existing file: the write-safety test goes red.
- **Depends:** S5

### S12 Intent tier: bindings, FND_INTENT_UNBOUND, FND_INTENT_UNCOVERED
- **ACs:** AC-5-2 (coverage half)
- **Files:**
  - `src/domain/requirements/ops.ts` (`add.intentRef`/`derived`; UPDATABLE_ATTRS)
  - `src/domain/requirements/mutate.ts` (mutual exclusion; `ERR_UNTRACED_REQUIREMENT`)
  - `src/domain/intent/{intent-tier.ts, intent-codes.ts}` (new)
  - `src/app/runtime/catalog.ts` (union)
  - `src/app/operations/check.ts` (splice and demotion)
  - `AGENTS.md`
- **Change:** As in 5.8, the coverage half.
- **Sabotage:**
  - (repro) Skip the uncovered sweep: the delete-R1 reproducer reaches `verified: true` and the
    test goes red.
  - Make UNCOVERED non-demoting: the same reproducer goes red.
  - Skip the twin: a raw unbound requirement goes clean and the test goes red.
  - Allow both `intentRef` and `derived`: the mutual-exclusion test goes red (F12).
- **Depends:** S5, S7 (same `ops.ts`/`mutate.ts`), S11 (split files)

### S13 The gated harness variant
- **ACs:** AC-8-1, AC-8-2, AC-8-3
- **Files:**
  - `src/testing/gaming.ts` (Variant; gated fixture builder through bootstrap, intent, policy,
    config and the in-memory baseline; the `raw` edit kind; new moves; `variant`/`requires`
    fields)
  - `gaming.test.ts`, `gaming.shard-*.test.ts`, `__snapshots__/gaming-*.txt`
- **Change:** Every fixture runs in both variants. Legacy rows get their `requires` field.
  Gated rows start as the legacy rows minus the ones S3, S4, S7, S12 and S14 closed. The new
  moves from 8.4 that are already buildable are registered, and the rest land with their
  slices.
- **Sabotage:**
  - Build gated fixtures without intent: delete-requirement escapes in gated and the exactness
    test goes red.
  - Drop the `raw` channel's check twin: raw-unresolved escapes.
- **Depends:** S9, S10, S12, S14

### S14 Reusable pipeline, BaselineSource, `--baseline`, FND_INTENT_CHANGED
- **ACs:** AC-5-2 (change half), AC-5-8 (plumbing)
- **Files:**
  - `src/app/operations/check.ts` (handler body extracted into `runCheckPipeline(bundle,
    input)`, byte-identical output)
  - `src/ports/baseline.ts` (new), `src/adapters/git/baseline.ts` (new)
  - `src/domain/intent/intent-tier.ts` (hash compare over intent, policy and config; D2 repin)
  - `src/app/runtime/catalog.ts` (ERR_BASELINE_UNAVAILABLE)
- **Change:** As in 5.4 and 5.6. The extraction must not change any output; `check.test.ts` and
  the CLI suite are the proof.
- **Sabotage:**
  - (repro) Compare intent item ids rather than text: the "edit R2's intent text" reproducer
    goes red.
  - Leave policy out of the comparison: edit-policy escapes.
  - With the config requiring a baseline that is unreadable, return a report: the test goes red.
  - Read `files.*` from the working tree: the move-intent-into-doc test goes red.
- **Depends:** S11, S12

### S15 `data.semanticDelta`
- **ACs:** AC-5-8
- **Files:** `src/domain/delta/{identity.ts, changes.ts, attribute.ts}` (new),
  `src/app/operations/check.ts`, `check.test.ts`
- **Change:** As in 5.5.
- **Sabotage:**
  - (repro) Diff findings by code only: swapping FND_CONTRADICTION from pair A to pair B reads
    as no delta, and the test goes red.
  - Drop the fingerprint: a same-ids, different-atom swap is not in `transformed[]`, and the
    test goes red.
  - Key on uuid only: a delete and re-add under the same key reads as removed plus added, and
    the test goes red.
- **Depends:** S14

### S16 FND_SEMANTIC_DRIFT
- **ACs:** AC-5-9
- **Files:**
  - `src/domain/delta/{drift.ts, delta-codes.ts}` (new)
  - `src/domain/vocabulary/resolve.ts` (`bindingOf` equality)
  - `src/app/operations/check.ts`, `src/app/runtime/catalog.ts`
  - `src/testing/gaming.ts` (delete the gated flip-negated and rebind-effect rows)
  - `src/testing/drift-discharge.test.ts` (new: G-F, G-G)
- **Change:** As in 5.9.
- **Sabotage:**
  - (repro) Compare the rendered sentence instead of the binding: rebind-effect goes red.
  - Count coverage demotions as drift-relevant: G-G goes red on the GTWR-reword discharge (F1).
  - Count reachability disclosures: G-G goes red on the reachability repair round-trip (F2).
  - Include `intentRef` in `bindingOf`: G-G goes red on `update intentRef`.
  - Use per-side id minting: G-F goes red (F9).
- **Depends:** S15, S13 (`gaming.ts` rows)

### S17 Counterfactual runner: `vocab distinct` and derived weakening
- **ACs:** AC-5-7, AC-5-2 (derived half)
- **Files:**
  - `src/ports/decide.ts` (new `DecideRunner`)
  - `src/app/operations/counterfactual.ts` (new)
  - `src/domain/vocabulary/support.ts` (new: intent and recursive partOf basis)
  - `src/domain/compat.ts` (synthesized `vocab-distinct` waivers)
  - `vocabulary-codes.ts` (FND_DISTINCTION_UNSUPPORTED), `intent-codes.ts`
    (FND_DERIVED_WEAKENS)
  - `src/app/operations/check.ts`
  - `src/testing/gaming.ts` (promote weakening-derived; register invent-parents and
    distinct-opposition-free)
- **Change:** As in 5.7 and 5.8.
- **Sabotage:**
  - (repro) Treat distinct as free: the door controller / door control unit reproducer reaches
    clean and the test goes red.
  - Skip the contrary counterfactual: fill/drain reaches clean and the test goes red (F6).
  - Accept a free-admitted parent pair as a basis: invent-parents escapes.
  - Skip the derived run: derived-decoys escapes.
  - Synthesize a waiver for a pair that was not admitted: the provenance test goes red (F13).
- **Depends:** S10, S12, S14, S16 (same `check.ts`/`gaming.ts` region)

### S18 CODEOWNERS stanza and the published-scope claim
- **ACs:** AC-5-13
- **Files:**
  - `src/app/operations/install.ts`, `src/app/install/targets.ts` (a `--codeowners` stanza
    between BEGIN/END markers; idempotent; `--owner`; through write-safety)
  - `src/app/runtime/scope.ts`, `scope.test.ts` (new `intentPinned` claim)
  - `AGENTS.md`, README where it states the guarantee
- **Change:** The stanza owns the split intent and policy files, plus `symspec.config.json` if
  the lead accepts D5. The claim is written in the present tense: "any change to intent or
  policy is detected against the baseline; every weakening is admitted by a re-checked
  certificate or not at all — no certificate path exists yet". The OUT_OF_BAND list is part of
  the claim.
- **Sabotage:**
  - (a) Let the stanza include the requirements document: the test goes red.
  - (b) Negative guard: the certificate clause without "not at all" is ABSENT.
  - (c) A second install run that duplicates the stanza turns the idempotence test red.
- **Depends:** S11, S14

### 9.1 Parallel waves

Two files are regenerated rather than merged:

- `AGENTS.md` is generated. It is regenerated after each merge and never hand-merged.
- A one-line append to the `catalog.ts` code-family union is a trivial, allowed conflict,
  rebased at merge.

Aside from those, the sets below touch disjoint files. Merges into the hotspot files
(`app/operations/check.ts`, `domain/requirements/mutate.ts`, `domain/compat.ts`,
`testing/gaming.ts`) are serialized in the wave order.

| wave | parallel slices | why they are disjoint |
|---|---|---|
| W1 | S0, S1, S5 | S0: mutation, mutate-options, import, gaming. S1: new test and snapshot. S5: document, store, anchor, package-boundary |
| W2 | S2, S6, S11 | S2: ops, signal-classes, catalog, index, agents-doc, gaming (no check.ts). S6: new `domain/vocabulary/*`, package-boundary (S5 already merged). S11: config, doc-store, store (S5 merged), operations/document, check.ts |
| W3 | S3 | the first `mutate.ts`/`compat.ts`/`check.ts` waiver work; nothing else can run beside it without sharing a file |
| W4 | S4 | the same files as S3 |
| W5 | S7 | `ops.ts` / `mutate.ts` |
| W6 | S8, S12 | S8: compat, vocabulary-codes, bootstrap-parity. S12: intent/*, ops, mutate (S7 merged). They share `check.ts` splice lines and the catalog union line, so land them as separate splice blocks |
| W7 | S9, S14 | S9: propose-vocabulary, plan, distinctness, glossary-plan, index. S14: the check.ts extraction, baseline port and adapter, intent-tier. Hold every other check.ts edit during S14 |
| W8 | S10, S15 | S10: vocabulary-tier, repair.ts, scope.ts. S15: new `delta/*`. Both splice check.ts after S14's extraction |
| W9 | S13, S18 | S13: gaming.* only. S18: install, targets, scope (S10 merged) |
| W10 | S16 | check.ts, gaming.ts, resolve.ts |
| W11 | S17 | check.ts, compat.ts, gaming.ts |

The critical path is S0 → S2 → S3 → S4 → S7 → S8 → S9 → S10 → S13 → S16 → S17. S6, S11, S12 and
S14 fit into the gaps.

**Phase-exit check.**

- `pnpm check` is green.
- Every AC-4-x and in-scope AC-5-x reproducer passes on `dist/cli.mjs`.
- The `gated` KNOWN_ESCAPES contains only the rows in 8.5.
- An adversarial refute pass runs over F1–F13 before merge to `main`.

---

## 10. Engine-tier edits in this phase

Exactly one, and it is PROSE ONLY. In S3, `src/domain/engine/pipeline/check.ts:2093-2104` and the
FND_SIMILAR_SEMANTIC suggestion drop "waive it" and name `vocab distinct` in its place.

- **Gate:** the report-corpus negative guard (no `never`-code remedy contains `waive`).
- **Sabotage:** restore the old string, and the guard goes red.
- **Constraint:** no engine LOGIC changes in Phase 3, and `package-boundary.test.ts` is
  unchanged for the engine.

---

## 11. Risks

- **R1. Bootstrap identity is proven over the corpus, not over all inputs.** Without
  multi-spelling classes and article or unit-case variants, G-B and G-C are vacuous for the
  same-key path. S6 and S8 add constructed fixtures, per "a sabotage that does not fire means
  the fixture tests a coincidence".
- **R2. Phrase keys move with `antonym`.** The fold re-validates V1 and V-OPP, and check has a
  twin. A long-lived document can still hit an antonym that it cannot commit without first
  splitting or re-declaring symbols. The refusal message must name the colliding symbols.
- **R3. Cost.**
  - `--baseline` doubles check time.
  - Distinct pairs add up to two batched counterfactual runs, plus leave-one-out and one re-run
    when admitted pairs carry opposition findings.
  - Derived requirements add one run, plus leave-one-out.
  - The CLI suite already raised its timeouts once. Batch first, fire only when records exist,
    and charge everything to the solver budget, so a cap hit gives `counterfactual-unchecked`
    and never an error.
- **R4. Hand-edited JSON bypasses every fence.** Each fence has a check-time twin, and the `raw`
  channel is the only thing measuring them. A missed twin is a live escape.
- **R5. Legacy documents keep 24 escapes.** A headline "the gaming gate is closed" is true only
  for gated runs, and the scope must say so.
- **R6. The gate is bounded by the CI invocation and CODEOWNERS.** Dropping `--baseline` in CI,
  pinning an old symspec, or an un-CODEOWNED config (D2/D5) defeats it from outside the tool.
- **R7. AC-5-6 is breaking.**
  - Code-only waivers stop applying.
  - Under D1-literal, NUMERIC_UNCOMPARED and RELATIONAL_UNCHECKED become undischargeable
    except by rewording.
  - Legacy documents lose the "neither" discharge for opposition candidates until they opt into
    a vocabulary (D4).
- **R8. Drift has no admission path until Phase 6.** A rewrite that resolves a real
  contradiction reports FND_SEMANTIC_DRIFT under `--baseline`, so only strengthening repairs
  pass a gated run. Agents may abandon `--baseline` unless the config requires it, which
  `init --split` does by default.
- **R9. Ambiguity lint reads slot views.** The rewrite therefore changes what
  `detectAmbiguity` sees for aliased requirements. G-C covers only bootstrapped, alias-free
  documents. S8 adds a test that the wording findings for an aliased fixture equal the
  unprojected ones, or it discloses the difference in `MIGRATION_DELTA`.
- **R10. Whole-slot symbols in Phase 3** inflate the vocabulary and make ERR_UNRESOLVED_SYMBOL
  frequent for compositional phrasing. A conjunctive guard is one state symbol, and each
  numeral variant is its own action. Phase 4 must REPLACE these, not layer on top of them.
- **R11. The FND_SYMBOL_ALIAS_CANDIDATE floor must be measured** on short phrases against the
  real model. The lexical signal will produce many candidates right after a bootstrap, and each
  needs triage.
- **R12. The intent basis for distinct is steerable at declaration time.** The agent chooses
  canonical phrases. Canonical phrases are immutable after declaration, and the intent items
  are anchored, but an agent that declares symbols to match intent wording in advance is
  residual. The scope states this.

---

## 12. Spec gaps, each with a PROPOSED resolution

| id | gap | proposed resolution |
|---|---|---|
| G1 | `refine` is already an EDGE verb (`ops.ts`), and the verb list is append-only. AC-5-3's certificate op, and I-1's "refine a requirement" = weakening, collide with it. | Name the Phase 6 verb `narrow`. Amend AC-5-3's text. Phase 3 reserves nothing. |
| G2 | AC-5-6 "formal-tier finding shall not be waivable". The catalog's `formal` tier includes triage and disclosure codes whose documented discharge is a waiver. | Waivability by MEANING (`FINDING_CLASS`): verdict, triage, disclosure, hygiene and anchor are `never`; wording and structural are `scoped`. Decision D1: whether disclosures stay `scoped` instead (less breaking, weaker). |
| G3 | AC-5-6 does not say whether a waived blocking lint still re-admits to the solver. | Keep re-admission and add `waived-blocking-lint`. Consequence: a waived blocking lint never yields `verified: true`. |
| G4 | AC-5-6 changes legacy results, while everything else is opt-in. | Ship as breaking, with a `waiver-inert` migration diagnostic and the `--rescope-waivers` stream. |
| G5 | AC-5-2 is ubiquitous, but meaningless without intent. | The tier is opt-in by the presence of intent. `gate.requireIntent` makes absence the `intent-absent` demotion. |
| G6 | AC-5-2 "check shall refuse a derived requirement": check reports, it does not refuse, and "finding set" is undefined. | FND_DERIVED_WEAKENS (error) over CONFLICT_SIGNALS plus coverage demotions. The fold cannot compute it. |
| G7 | I-1 and AC-5-1 do not define the set that direction is measured over. `add` discharges coverage, and edge verbs discharge trace findings. | Direction is an UPPER BOUND over the published D (3.1), measured by G-D. |
| G8 | AC-5-7 admits "different part-of parents", which is a free agent move (AC-8-2 "split a system into two parents"). | The partOf basis counts only when the parent pair is itself admitted on an intent basis, recursively. |
| G9 | AC-5-7 "the pair stays merged for checking" would fabricate error-severity findings on a document that may be consistent (Story 2). | Report FND_DISTINCTION_UNSUPPORTED (warn, demotes) whose EVIDENCE is the merged run's conflict signals. The main report stays on the declared partition. The run cannot verify, and nothing is fabricated. |
| G10 | AC-5-7 "intent naming both" has no matching rule. | A non-overlapping whole-token span of each symbol's CANONICAL in one intent item's text. Aliases do not count. |
| G11 | AC-5-9 "the change removed a finding", read literally, makes every lint fix and every designed discharge drift. | Only verdict findings and the four conflict-signal demotions, with the `resolvedBy`/`transformed` exceptions, and G-G as the gate. |
| G12 | AC-5-8 "attributed to the op or edit": there is no op log. | Attribute by document-diff change units, with `unattributed` as an honest outcome that demotes. |
| G13 | `symspec.config.json` pins the gate but is neither an anchor nor in the CODEOWNERS stanza ("those two files only"). | Hash the config into FND_INTENT_CHANGED, and add it to the stanza (D5). |
| G14 | FND_INTENT_CHANGED cannot tell an owner's legitimate change from an agent's. Every intent PR is red. | D2: an `anchors` repin in the CODEOWNED config turns the finding into FND_ANCHOR_REPINNED (info). Owner review of the config is the mechanism. Alternative: keep it literal and document "merge anchor PRs over a red check". |
| G15 | AC-4-1 lists action contraries and effects, and a state as a variable plus its domain, but no Phase 3 tier reads effects, and arbitrary contraries have no encoding. | Contraries are derived from the antonym table (one source of truth). `effects` is validated and has no reader. A state symbol is a condition class linked to a variable/value, with the domain derived; Phase 4 maps it 1:1. |
| G16 | AC-4-2 "scoped by id; same symbol only through a committed alias", whereas phraseKey equivalence merges case, whitespace and inflection variants implicitly. | Define "same phrase" as phraseKey equality, which is the engine's own atom key and the coarser-or-equal requirement. The id-literal scope lands in Phase 4 as a pure rename. The AC's fixture keys differ (`the_door_controller` vs `door_controller`), so the sabotage holds. |
| G17 | AC-4-3 has no check-time counterpart, and AC-8-2 has no hand-edit move. | FND_UNRESOLVED_SYMBOL and FND_VOCABULARY_INVALID as twins, plus the `raw` harness channel. |
| G18 | AC-4-3 does not define phrase granularity. | Whole slots in Phase 3, AND every numeric label resolves to a quantity symbol, with no exemption for bound slots. |
| G19 | AC-4-4: which threshold, and "when an op declares" versus a hand edit. | A floor measured for short phrases plus a deterministic lexical signal, computed statelessly over all untriaged pairs. |
| G20 | AC-4-7 "grouped by its proposed aliases": applying merges inside a bootstrap changes verdicts. | The identity stream is `data.ops`, and merges go in `data.aliasOps`, grouped. |
| G21 | KNOWN_ESCAPES attributions. `alias-contraries-term@reverse` on term-bridged is credited to AC-4-2, but its escape is a harness bypass. unglossary and unterm are credited to AC-5-7. | Rows closed by S0 are deleted, with the argument in the commit. unglossary and unterm keep AC-5-7 for legacy, and in gated they close through the frozen tables (AC-4-2) and V-FROZEN. |
| G22 | Policy "which kinds of environment fact are admissible" has no vocabulary. | `admissibleAssumptionKinds: string[]` is reserved and has no reader. Phase 6 defines it. |
| G23 | AC-5-13 "admitted by a re-checked certificate or not at all" is true in Phase 3 only as "not at all". | State that in the present tense, with a negative guard. |
| G24 | AC-5-6's reproducer needs a "neither" discharge for opposition candidates that is not a waiver. The spec names none for legacy documents. | `vocab distinct` with the dual counterfactual, in vocabulary mode only. D4: legacy documents must opt in, or rewrite. |
| G25 | I-1's `run-weakening` class is listed beside op classes, but knobs are not ops. | Keep it off OP_DIRECTION, in the `RUN_KNOBS` table and the manifest's `runWeakening`. |
| G26 | Legacy documents keep the delete, flip, unglossary and rebind escapes unless they opt in. That contradicts a reading of I-5 as "every escape is closed". | Publish a `legacy` versus `gated` scope split. The `requires` column on KNOWN_ESCAPES makes it data. |

## 13. Decisions for the lead, before the affected slices start

- **D1 (before S2 and S3):** are the `disclosure` codes (NUMERIC_UNCOMPARED, RELATIONAL_UNCHECKED,
  and so on) `never` waivable (the literal reading), or `scoped`? The plan assumes `never`.
- **D2 (before S14):** do intent and policy repin through `config.anchors`, turning the finding
  into FND_ANCHOR_REPINNED, or is FND_INTENT_CHANGED literal? The plan assumes repin.
- **D3 (before S5):** bump the document to version 4, or tolerate new keys on v3? The plan
  assumes the bump.
- **D4 (before S3):** legacy documents lose the waiver discharge for opposition candidates, and
  the only replacement is to opt into a vocabulary. Accept this as part of the breaking change?
  The plan assumes yes.
- **D5 (before S18):** does the CODEOWNERS stanza also cover `symspec.config.json`, against
  AC-5-13's "those two files only"? The plan assumes yes.
