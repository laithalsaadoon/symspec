# Receipt: symspec 2.0.0 (S3 waivability, AC-5-6, with release hardening)

Written by the clerk (job 1260, board item clerk-3, swarm vdd-2-s3-waivability) from the records in this branch, for the coordinator (job 815). The clerk judges nothing: every verdict below is a record's, with the record named; the few numbers the clerk measured itself are marked "clerk run" and carry the command. No approval was written and no approve command was run.

| | |
|---|---|
| Branch | `vdd/s3-waivability`, run 2 (S3) with run 3 (release hardening) merged |
| Head read | `7324137530555ee88a7943ee3e8bee642975b1b3` (`docs(erpaval): S3 threat model v2`); this receipt is the commit on top of it |
| Product tree | `ae268e342693500ddb309d7e82e35299043d056d` (`fix(cli): every flagged command site carries only shell words (R63, R64)`); every later commit touches only `.erpaval/` |
| Base of both runs | `0fca0433eb82431936c8edd81f7ccf3464d6f52e` (`feat/controlled-vocabulary`) |
| Last release tag | `v1.2.1` = `532eea7a28b18d10cbd05c7746f754ba2ae9ff19` |
| Version files | still 1.2.1 everywhere; release-please bumps them in its PR (S3-053) |
| Computed bump | 2.0.0 (one `feat!` commit with a `BREAKING CHANGE:` footer), section 1.5 |
| Intent hash | `8e350eefe2b8`, section 1.3 |
| Approval state | Never approved by a person. No intent approval and no threat-model approval exists for this work. |

## 0. How this release got to the person, and what is being asked

The run's limit of three closure loops was reached (run 2 notes: "Closure loop 3 of 3"). After review-final-4 (ledger `abccc2c`) still showed four reproduced findings (review R10, R13, R11, R12), the coordinator asked the person (Laith) at about 07:4x UTC on 2026-10-06 to choose between: ship now with 4 open follow-ups, one more loop, push the PR only, or hold. The person did not answer within 30 minutes. The coordinator then chose to ship now under the authority the owner delegated in job 815's goal ("full authority to ship"), with these limits (run 2 notes, vdd_runs id 2): the merge to main is conditional on a clean audit and green GitHub CI, and there is no npm publish without Laith (the trust re-registration and the release-PR merge are his).

Everything the coordinator ruled under that authority is marked "coordinator, delegated authority" below so the person can redirect any of it. The person's options on this receipt are to approve (merge the PR), reject (do not ship this tree), or redirect (change a ruling, which moves the intent hash and sends the change back to the contract role).

## 1. For the person: is this the right thing?

### 1.1 The story as received

> "Ship the next symspec: spec 007 Phase 3 slice S3, Waivability (AC-5-6). A formal-tier (never-class) finding is not waivable; a wording (lint) finding is waivable only for the requirement ids and content hash it was raised on; a waived finding that excludes a requirement from the formal tier still demotes (waived-blocking-lint). Stored waivers that do not qualify go inert and are disclosed (waiver-inert, with replacement ops); stale-hash waivers are disclosed in data.ignoredWaivers; the fold and import refuse never-class and unscoped waivers (ERR_WAIVER_REFUSED); repair advice and the engine's discharge prose stop offering waive for never codes. Closes the 11 waive-by-code KNOWN_ESCAPES rows. Breaking (feat!), shipped as the next major after v1.2.1 together with the dev line feat/controlled-vocabulary."

Run 3's findings as received (release-hardening/rulings.md): B1 the GitHub account rename broke npm provenance's exact repository match; B3 a git refusal with no config anywhere made `check` exit 2 where v1.2.1 exited 0; B4 schema descriptions and docs claim enforcement of v4 intent/vocabulary/policy that no check tier performs. B2 (revoke and re-register the npm trusted publisher) is Laith's alone.

Out of scope (readings.md `## Boundaries`): no engine logic change (prose only); no `vocab` verb, `vocab distinct`, `propose-vocabulary` or `--rescope-waivers` (S7, S9, S17); no document format change (format v4 is S5); `update`, `unwaive` and the exit order unchanged except as ruling R40 says; CI invocation, CODEOWNERS and `symspec.config.json` untouched; only the 11 waive-by-code KNOWN_ESCAPES rows close; no gated harness variant (S13); a content hash does not bind a reviewer (T24); the embedding model and the npm publish. Run 3 boundaries: CHANGELOG.md is release-please history; enforcing intentRef/derived, frozen tables, or any tier reading intent or policy (RH-R3 labels, it does not implement); walk-up config loading (F11 forbids it); `init --split`'s behavior under a git refusal.

### 1.2 Rulings in force

Who made each ruling, by the record's own `source` field: "readings agreement / decision / threat model" were settled by the three readers' agreement or by the spec's decisions (D1, D4) and the threat model, with no reading contradicting; "coordinator input to the run" were inputs (a) to (d) the coordinator gave the intake; "coordinator, delegated authority" were ruled by job 815 under the owner's delegated authority and are marked redirectable at this receipt (R37 to R46 answer the ten questions Q1 to Q10; R47 to R63 are loop-back rulings after a builder, reviewer or attacker finding).

Rulings in `rulings.json` (R52, R53, R58, R64 and R43a are not there; see the next table):

| id | made by | behaviors | ruling (cut at 260 characters; whole text in rulings.json) |
|---|---|---|---|
| R1 | readings agreement / decision / threat model | S3-001 | Every waive of a never-class code is refused with ERR_WAIVER_REFUSED, whatever its scope and hash. |
| R2 | readings agreement / decision / threat model | S3-001, S3-016, S3-039 | D1: disclosure codes that mean "not compared" (FND_NUMERIC_UNCOMPARED, FND_RELATIONAL_UNCHECKED and their siblings) are never waivable; the discharge is rewording. |
| R3 | readings agreement / decision / threat model | S3-001, S3-016 | G2: waivability is by meaning: verdict, triage, disclosure, hygiene and anchor are never; wording and structural are scoped. AC-5-6's "formal-tier finding" reads as every never class (reading B's Q4, intake ambiguity 15). |
| R4 | readings agreement / decision / threat model | S3-002 | A refused waive aborts the whole atomic stream: nothing is written, exit 1. |
| R5 | readings agreement / decision / threat model | S3-003 | A code-only waive is refused for every code, scoped classes included. |
| R6 | readings agreement / decision / threat model | S3-004 | A refs plus matching contentHash waive of a scoped-class code is accepted and stored as requirementIds plus that hash. |
| R7 | readings agreement / decision / threat model | S3-006 | No waiver is ever stored as requirementId without a contentHash. |
| R8 | readings agreement / decision / threat model | S3-007 | A waive whose refs equal no finding's set is accepted at write and suppresses nothing at check. |
| R9 | readings agreement / decision / threat model | S3-008 | A supplied contentHash that differs from the current text is refused with ERR_USAGE, as at base, and nothing is written. |
| R10 | readings agreement / decision / threat model | S3-009 | A code with no own FINDING_CLASS row is refused at write and inert at check, and every published code has its own row. |
| R11 | readings agreement / decision / threat model | S3-010 | Case and whitespace variants of a never code are refused, inert and suppress nothing. |
| R12 | readings agreement / decision / threat model | S3-011 | The refusal message names the code and its never class, or the missing refs and hash. |
| R13 | readings agreement / decision / threat model | S3-012, S3-013, S3-014 | Import folds every waiver record through apply's classifier: I1, I3 and I5 are refused into problems[], I4 is refused and never widened, the requirements are written and import exits 1; a refs plus contentHash record is accepted. |
| R14 | readings agreement / decision / threat model | S3-015 | Each waiver import refuses is named with its line, code, scope and replacement. |
| R15 | readings agreement / decision / threat model | S3-016, S3-025 | D4: "Legacy documents lose the waiver discharge for opposition candidates; they rewrite or opt into a vocabulary." A stored never-class waiver is inert whatever its scope and hash, disclosed once as waiver-inert, and the run equals the document with it … |
| R16 | readings agreement / decision / threat model | S3-017, S3-018, S3-019, S3-021 | A stored code-only waiver, a stored single requirementId with no hash and a stored requirementIds with no hash are inert; a stored refs plus matching hash waiver of a scoped code qualifies. |
| R17 | readings agreement / decision / threat model | S3-023 | waiver-inert is an info data.diagnostics entry that demotes nothing; deleting an inert waiver changes no finding, demotion or verified. |
| R18 | readings agreement / decision / threat model | S3-024 | G4: ship as breaking with a waiver-inert migration diagnostic. For a scoped code it carries the exact unwaive op plus one scoped waive refs plus current contentHash per finding the waiver matches today. |
| R19 | coordinator input to the run + readings/threat | S3-025 | For a never code, waiver-inert carries the unwaive op and "rewrite required", and no waive op. |
| R20 | coordinator input to the run + readings/threat | S3-027 | Every replacement op decodes and folds under MUTATE_OPTIONS, and every named command parses under this build's CLI. |
| R21 | readings agreement / decision / threat model | S3-028 | A stale-hash waiver brings its finding back and is listed once in data.ignoredWaivers with code, requirement ids, stored hash and current hash under any output filter, and not as waiver-inert. |
| R22 | readings agreement / decision / threat model | S3-030 | No stored waiver the S3 fold would refuse as an op reaches the engine. |
| R23 | readings agreement / decision / threat model | S3-031 | The engine-tier diff is prose only, and the engine still declines a stored code-only FND_OPPOSITION_CANDIDATE waiver. |
| R24 | coordinator input to the run | S3-011, S3-025, S3-027, S3-040, S3-045 | Coordinator input (c): `propose-vocabulary --rescope-waivers` and `vocab distinct` do not exist on this build (S7, S9, S17 are not built). Every waiver-inert replacement, repair suggestion, refusal message and engine remedy names only commands and ops this … |
| R25 | readings agreement / decision / threat model | S3-032 | isWaivedBlocking re-admits a requirement exactly when isWaived suppresses its blocking finding. |
| R26 | readings agreement / decision / threat model | S3-033, S3-035 | G3: a waived blocking lint keeps re-admitting its requirement, adds the waived-blocking-lint demotion, and never yields verified true. |
| R27 | readings agreement / decision / threat model | S3-036 | The waived-blocking-lint set is the requirements excluded with no waivers minus those excluded under exactly toEngineDoc's waiver list; with no waivers the demotions equal base's. |
| R28 | readings agreement / decision / threat model | S3-037 | The reproducer: the opposition waive is refused, and the un-waived CAB and TNK pairs demote separately; the stored reproducer's waiver is inert. |
| R29 | readings agreement / decision / threat model | S3-039, S3-040 | No repair op, demotion action, finding message or suggestion for a never code offers or says waive, at every site. Every repair op folds. |
| R30 | readings agreement / decision / threat model | S3-042 | "or waived" is absent from scope.ts. |
| R31 | coordinator input to the run + readings/threat | S3-043 | Coordinator input (b): the installed skill body (craft.ts ~:244-249) calls the reviewed pair waiver the always-safe option for FND_OPPOSITION_CANDIDATE, a never-class code; it must change so it teaches no refused move. |
| R32 | coordinator input to the run + readings/threat | S3-044 | Coordinator input (a): WAIVABILITY_ENFORCED in signal-classes.ts flips to true with S3, so every published "NOT enforced by this build" statement (AGENTS.md through agents-doc, explain's waivableEnforced) changes with it, behind the existing two-halves flag … |
| R33 | readings agreement / decision / threat model | S3-046 | Every applied waiver is listed in the check payload with code, ids and reason, and the published scope says a content hash binds the text, not the reviewer. |
| R34 | readings agreement / decision / threat model | S3-048, S3-049, S3-050, S3-051 | The 11 waive-by-code KNOWN_ESCAPES rows are deleted with the move kept and exactness green. The harness gains the scoped never-code and raw-channel measurements, adds no clean pair, and every report-corpus delta is attributable to AC-5-6. |
| R35 | coordinator input to the run | S3-052 | Coordinator input (d): the S3 build commit is feat! with a BREAKING CHANGE: footer in its own body. |
| R36 | coordinator input to the run | S3-045 | `propose-vocabulary --rescope-waivers` is neither built nor named in S3. G4's "and the --rescope-waivers stream" waits for the slice that builds the command (S9); the waiver-inert diagnostics carry the ops now (reading C's Q8, intake ambiguity 17). |
| R37 | coordinator, delegated authority | S3-005, S3-008 | R37 (Q1, S3-005): (a) Accept. A waive op with refs but no contentHash, or a single ref, is accepted: ref is normalized to refs [ref], and the fold computes the contentHash from the current text itself, as it does today (plan 5.3: 'ref is normalized to refs: … |
| R38 | coordinator, delegated authority | S3-022 | R38 (Q2, S3-022): A well-formed stored waiver whose refs match no finding's id set suppresses nothing and is disclosed as waiver-inert (reason: matches no finding) with its unwaive op. It additionally carries one scoped waive refs+current-hash op per finding … |
| R39 | coordinator, delegated authority | S3-020 | R39 (Q3, S3-020): (a) Qualifies. A stored single requirementId with a matching contentHash is the normalized form of refs [id] plus that hash: it suppresses exactly its finding, with no diagnostic. Only a single ref WITHOUT a hash goes inert (plan section 6). |
| R40 | coordinator, delegated authority | S3-034, S3-035 | R40 (Q4, S3-034): (b) One waived-blocking-lint demotion row naming both re-admitted requirements; exit 1, because the FND_CONTRADICTION error finding sets the exit before any demotion; --strict exit 3 only when demotions are the only failure (S3-035). |
| R41 | coordinator, delegated authority | S3-026, S3-027 | R41 (Q5, S3-026): (a) The replacement scoped waive op carries the legacy reason verbatim followed by a fixed provenance marker (one exported constant, e.g. ' (rescoped from a legacy waiver)'), so the rescoped, narrower waiver keeps its reviewer's reason and … |
| R42 | coordinator, delegated authority | S3-029 | R42 (Q6, S3-029): (b) An ignoredWaivers entry (stale hash) carries its unwaive op and a note that the requirement's text changed since the waiver was reviewed and must be re-reviewed; it offers NO waive op at the new hash. |
| R43 | coordinator, delegated authority | S3-038 | R43 (Q7, S3-038): (b) The reproducer is pinned on a minimal document holding only the CAB pair (heat/cool the cabin) and the TNK pair (fill/drain the tank) with the fixture embedder, where on base the code-only FND_OPPOSITION_CANDIDATE waiver is accepted and … |
| R44 | coordinator, delegated authority | S3-041 | R44 (Q8, S3-041): For a requirement excluded from the formal tier by a blocking (scoped-class) lint, the remedy offers rephrasing first; it may offer the scoped waive refs+hash second, and then must say that the waiver re-admits the requirement to the solver … |
| R45 | coordinator, delegated authority | S3-047 | R45 (Q9, S3-047): (b) No KNOWN_ESCAPES row: a scoped, reviewed waiver of a scoped-class finding is a designed discharge, not an escape. The new scoped-waive harness move runs on never-class fixtures only (where it must be refused at write and inert raw); the … |
| R46 | coordinator, delegated authority | S3-053, S3-052 | R46 (Q10, S3-053): (a) S3 does not touch the version: release-please bumps the four version files in the release PR. The S3 build commit is feat! with a BREAKING CHANGE: footer (S3-052). |
| R47 | coordinator, delegated authority | S3-001 | ERR_WAIVER_REFUSED is a real catalog code (an ERR_CLASSES append in src/ports/errors.ts and the catalog), so the catalog holds 24 ERR / 42 FND / 24 GTWR = 90 codes. Re-pin every count and list that S3's additions move: src/app/runtime/catalog.test.ts (the … |
| R48 | coordinator, delegated authority | S3-033 | the 'waived-blocking-lint' demotion reason is class 'coverage' with drift false, the class of 'excluded-from-formal', which it replaces for the same requirement (the requirement now reaches the solver only on a reviewer's waiver of a blocking wording defect, … |
| R49 | coordinator, delegated authority | S3-023 | 'waiver-inert' is appended to DIAGNOSTIC_KINDS in src/domain/requirements/document.ts (plan S3 file list: 'DIAGNOSTIC_KINDS append'); re-pin src/domain/requirements/document.test.ts 'DIAGNOSTIC_KINDS' as ['unknown-top-level-key', 'sentence-drift', … |
| R50 | coordinator, delegated authority | S3-001 | the builder may change README.md's code count and package.json's "description" code count, and nothing else in either file, to keep the published count agreeing with the catalog. |
| R51 | coordinator, delegated authority | S3-042, S3-046 | append exactly this sentence as the last sentence of FROZEN.coverageDemotion (and so of the published coverageDemotion claim): "A waiver's content hash binds the text it was reviewed on, not the reviewer: any writer can mint a waiver whose hash matches, so a … |
| R54 | coordinator, delegated authority | S3-009, S3-010, S3-023, S3-030 | (review R1, attack D05, D12, P04): one code canonicalisation for the fold, the check-time twin and the engine match: surrounding whitespace is trimmed, case is never folded; after trimming the code must be a published code with its own FINDING_CLASS row (the … |
| R55 | coordinator, delegated authority | S3-005, S3-006, S3-024, S3-027 | (review R2, attack A14): applying every op of a waiver-inert or ignoredWaivers entry to the checked document removes exactly the stored waiver that entry names and no other stored waiver (metamorphic: the stored list afterwards equals the original minus that … |
| R56 | coordinator, delegated authority | S3-011, S3-027, S3-039, S3-040, S3-045 | (review R3, evidence G2/TA3, attack P13, P15, P17): every `symspec ...` command named in any check, waive, import or explain output, any advice, suggestion or catalog description, parses AND passes the CLI's required-flag validation with the built binary's … |
| R57 | coordinator, delegated authority | S3-021, S3-046 | (review R4; this withdraws the coordinator's earlier acceptance of evidence gap G1): a qualifying scoped waiver of a terminology-tier finding (FND_TERM_INCONSISTENT, FND_ACRONYM_UNDEFINED) suppresses exactly its finding and is listed in data.appliedWaivers, … |
| contract-4/review-R5 | coordinator, delegated authority | S3-049 | Review R5: the waive-raw harness move includes a code-only probe for every never-class baseline code, idless ones included. |
| contract-4/attack-D06-D16-G3 | coordinator, delegated authority | S3-008, S3-012, S3-019, S3-026, S3-028 | Attack D06: the provenance marker test asserts an independently written non-empty literal, not the export. D14/D15/D16: pin the stored-waiver schema rejections (prefixed/suffixed hash, requirementIds [], empty reason) at load. Evidence G3: S3-012 reaches its … |
| contract-4/pre-existing | coordinator, delegated authority | S3-002, S3-031 | Pre-existing error paths in hunks S3 touched (attack P19-P24, A21, A24, A25): pin as @existing regression tests, green on 7afb20e, each shown to kill its mutant in a throwaway copy: the engine's solver-error boundary (an unexpected solver Error propagates; … |
| R59 | coordinator, delegated authority | S3-024, S3-027 | (review R2 variant): an op a waiver-inert or ignoredWaivers entry offers names its target exactly as stored, and the fold resolves a stored requirement UUID as that UUID before any key lookup, so a deleted requirement's UUID that equals another requirement's … |
| R60 | coordinator, delegated authority | S3-027, S3-045 | (review R6): every `symspec ...` command symspec emits (advice, suggestions, refusals, explain, help, catalog rows) is shell-safe: each argument that carries document text or a user value is quoted so that `bash -n` accepts the command and a POSIX shell's … |
| R61 | coordinator, delegated authority | S3-040, S3-045 | (review R7, attack C10, C13, C18): R56's sweep extends to every help text (each subcommand's --help) and to the term, number-spelling and glossary-conflict advice arms: every command they name passes the parser with its required arguments, and no never-class … |
| R62 | coordinator, delegated authority | S3-021, S3-046, RH-007, RH-012, RH-008 | (attack C06, C09, C23, RH10): a terminology waiver suppresses only the finding on its own requirement ids and content hash (never the same code on another requirement) and is counted in data.waived (C06, C09; this also closes the S8 open item); no schema … |
| contract-6/accepted | coordinator, delegated authority | S3-045 | Accepted, not to be pinned: C14 and C15 (pre-existing prose normaliser corners: user backticks, the 'add' verb), owner Laith, until the next minor release; C17 and C20 proposed equivalences, accepted with the attacker's arguments; P16 as before. |
| R63 | coordinator, delegated authority | S3-027, S3-045 | (review R8, R9): example tests cannot find every site, so the guard is static. A test walks every non-test .ts file under src/ (the TypeScript compiler API is available through the typescript devDependency; a careful scanner of template literals and string … |

The review ledgers also number their findings R1, R2 and so on, and the attack ledgers P04, C06 and so on. Where this receipt means a ledger finding it says "review R10" or "attack C14"; a bare R10 is a ruling.

Coordinator rulings that are not in `rulings.json`, quoted from the run 2 notes (vdd_runs id 2) and the ledgers that cite them:

| id | ruling as the records state it | made by |
|---|---|---|
| R43a | Amends R43 (mail 296 to contract 863): on base, check.ts isWaived with PAIR_BOUND_CODES already declines a code-only FND_OPPOSITION_CANDIDATE waiver, so AC-5-6's "Today: verified true" line is already false at 0fca043; the reproducer is red on base through its write half and the waiver-inert disclosure. The review ledger reads it as: "no base verified:true claim adopted". | coordinator, delegated authority |
| R52 | The builder may edit README for the code count, make the "Honest scope" quotes equal scope.ts verbatim, and change README examples that show a waive S3 refuses. | coordinator, delegated authority |
| R53 | waived-blocking-lint follows the fewer-than-two-requirements vacuity like excluded-from-formal; the two waived-blocking-lint x delete-requirement rows stay owned by AC-5-2. | coordinator, delegated authority |
| R58 | Two stored waivers with the same canonical code and scope are one waiver for removal (an accepted limitation). | coordinator, delegated authority |
| R64 | Accepted the wider allowances of contract-7's static shell-safety guard (run 2 notes: "R64 accepted its wider allowances"; the build-7 commit implements it as the `ShellArg` marker and `asShellArg`). | coordinator, delegated authority |

Accepted equivalences and acceptances (the technical arguments are in the attack ledgers):

| item | what was accepted | by |
|---|---|---|
| P16 (attack round 1) | mutant equivalent over current gate-produced exclusions: the sole non-test repair caller forwards gate exclusion records | coordinator, delegated authority |
| C17, C20 (attack round 2) | proposed equivalences, "accepted with the attacker's arguments" (contract-6/accepted) | coordinator, delegated authority |
| S16, S17 (build-5 sabotages) | equivalent: S16 runs only for documents with no state variables, which check never sends to reachability; S17 output is rewritten to the flat antonym form before any CLI output | coordinator, delegated authority |
| S8 | the data.waived tally after a terminology waiver, first accepted as an untested summary count (minor), then closed by R62 (review-final-4 ledger: "closed", C09 killed by three dedicated tests in each of two valid replays) | coordinator; closed by ruling |
| C14, C15 | pre-existing prose-normalizer corners (user backticks, the `add` verb); accepted, owner Laith, until the next minor release | coordinator, delegated authority |

Run 3 rulings (release-hardening/rulings.md; all by the coordinator under the owner's delegated authority, pinned, the contract does not reopen them):

| id | ruling | behaviors |
|---|---|---|
| RH-R1 (B1) | `package.json` repository.url = `git+https://github.com/laithalsaadoon/symspec.git`, homepage = `https://github.com/laithalsaadoon/symspec#readme`, bugs.url = `https://github.com/laithalsaadoon/symspec/issues`; every live reference in package.json, README.md, RELEASING.md, AGENTS.md and non-test src/ names laithalsaadoon/symspec; CHANGELOG.md untouched; `theagenticguy` absent from those four files. | RH-001, RH-002 |
| RH-R2 (B3, option (a)) | With no config named and git refusing the document's directory for any reason other than "not a git repository" and the bare-repository refusal: if no symspec.config.json exists in the document's directory or any ancestor, the run proceeds as with no repository and `data.run.config` discloses git's first refusal line; if one exists, the run fails closed as ERR_CONFIG_INVALID (an ancestor config is never loaded). The bare-repository refusal stays ERR_CONFIG_INVALID. `--config` and `SYMSPEC_CONFIG` behave as today. | RH-003, RH-004, RH-005, RH-006 |
| RH-R3 (B4, the experimental statement) | One exported constant (`V4_EXPERIMENTAL_STATEMENT`) says v4 vocabulary, intent and policy are experimental, preserved on save and read by no check tier; it is interpolated into the schema descriptions, `init --split` help and result, AGENTS.md and README; the unqualified enforcement claims are absent or rephrased. `symspec.config.json`'s pins are enforced today and are not labelled experimental. | RH-007, RH-008, RH-009 |
| RH-R4 (review findings R1 to R3 of run 3) | Under a git refusal with no config named, a config whose existence cannot be determined (self-symlink, ELOOP) fails closed, and a dangling symlink counts as present (differs on purpose from the non-refusal path); the bare-repository refusal is recognised from git's own message form (first line); every description at every nesting level of the projected JSON schema is free of unqualified enforcement claims and the five keys carry the statement. | RH-010, RH-011, RH-012 |

Gap rulings, all by the coordinator under the owner's delegated authority (run 2 notes and run 3 notes):

| id | gap | ruling |
|---|---|---|
| run 2 G1 | terminology waivers silently unapplied | first accepted (owner Laith, info only); withdrawn by R57 (applied and listed) |
| run 2 G2 (TA3), G3 (S3-012 below floor), G5 (empty rescope marker), 6 survivors | | one closure round after attack and review (contract-4, build-4); see sections 3 and 7 |
| run 2 G4 | S3-052 and S3-053 are commit-range behaviors with no executable evidence | checked by the clerk and the auditor (section 2) |
| run 2 G6 | R43's base assertion false | recorded by the clerk as R43a (this section) |
| run 2 absence | absence.json reported passes on base for 159 green S3-named tests | ruled: @existing regression guards the contract declared (S3-004, S3-008, S3-031, S3-032, S3-047 and the green halves of mixed ids), as VDD's legacy entry allows; every behavior S3 changes has a red test, 0 broken, 0 regressions |
| run 3 G1 | test for the existence-check-error branch | raise (a closure after review; it became review R1 and RH-010) |
| run 3 G2 | the v4 descriptions reach no shipped surface | accept |
| run 3 G3 | | to the reviewer (became review R3 and RH-012) |
| run 3 G4, G5, G6 | publish.test reads the same package.json npm packs; the git shim refuses every git call (a superset of a rev-parse-only refusal); v1.2.1 baseline from job 818 | accept |
| run 3 review R4 | nested vocabulary parent description says the part-of chain has no cycles; the decoder accepts a cycle | nonblocking: the enclosing vocabulary key carries the experimental statement and no tier reads it; follow-up owned by S7 (vocab ops validate the invariants) |
| run 3 residual | mode-000 directory variant; nested statement requirement | accepted |
| run 3 B3, B4 | | B3 takes the fallback-and-disclose option; B4 takes the experimental-statement option rather than refusing docVersion 4 |

Assumptions (readings.md `## Boundaries`; threat model v2 restates them): TA1 CI runs `pnpm check` on a fresh clone and symspec.config.json is CODEOWNED (owner Laith); TA2 the content hash is collision-resistant (owner Laith, proposed for acceptance as is); TA3 every advice site that can emit a waive op or inflection for a never code is exercised (owner Laith, narrowed not discharged, see section 7); TA4 npm's trusted publisher is bound to laithalsaadoon/symspec and release-please.yml (owner Laith, before the 2.0.0 publish).

Record correction: commit `d3db1d0`'s message says no test reaches the S16/S17 branches; the run 2 notes correct it: tests reach both branches but do not check the command text.

### 1.3 Intent hash

The intent hash is `8e350eefe2b8` (the first 12 hex digits, the length VDD uses), from the full SHA-256

`8e350eefe2b81c27eaeb316d0d27300ab764b275f1a24a62143a05eae5d3d3b1`

It is the SHA-256 of these bytes, in this order, read at head `7324137` (identical in `ae268e3`; neither file changes after `abccc2c`):

1. the bytes of `.erpaval/vdd/s3-waivability/readings.md` from the first byte of the line `## Rulings` (offset 66573) to the end of the file: the `## Rulings` section (R1 to R63 lines, the three unnumbered directives, the ruling text as written there) followed without a gap by the `## Boundaries` section (the scope limits and the TA1 to TA3 assumptions). 29035 bytes, SHA-256 `48647db3d1bc5a7670f5ffc4cd6a80457b249265b099ca0d2d07b383395c66f5`;
2. the bytes of `.erpaval/vdd/s3-waivability/rulings.json` (the whole file: 63-item ruling list as data, the ten questions, the three assumptions). 43361 bytes, SHA-256 `3f01bd964940ce5d389b97d784e52e3cec11f02addb73c7129790c95076cd10d`.

Reproduce: `python3 -c "import hashlib;t=open('.erpaval/vdd/s3-waivability/readings.md','rb').read();i=t.index(b'\n## Rulings\n')+1;print(hashlib.sha256(t[i:]+open('.erpaval/vdd/s3-waivability/rulings.json','rb').read()).hexdigest())"`.

What the hash does not cover (so a change there does not move it): the scenario-level examples and questions in readings.md above `## Rulings`; `behaviors.json` (titles, classes, floors); `contract.md`; any test or source file; everything in run 3 (`release-hardening/rulings.md`, SHA-256 `ad4c2b2c69878d9bd340600128eaa6d3e071a8f80c1bc448416b563fe1d89798`, and its `behaviors.json`); the coordinator rulings R43a, R52, R53, R58 and R64 (they are in no file the hash reads); the threat model. This is the hash the task defined; the person who redirects a run 3 ruling or one of those five rulings is not caught by it.

There is no `docs/intent-approvals.json` in this repository and no intent script, so the hash is recorded here for the person and the coordinator; nothing compares it with a previous approval.

### 1.4 Threat model

`.erpaval/vdd/s3-waivability/threat-model.json`, version 2, SHA-256 `75accbe50a8e84a54cb7b44718b5564294e94a9620db2e8e08be99058aa467ff` (plain VDD JSON, not Threat Composer format). 34 threats, 29 resolved, 5 open, 0 resolved below floor. T1 to T26 are the run 2 threats, all resolved in v2; T27 (dangling or looping config under a git refusal), T28 (path spelling git's bare-repository phrase) and T29 (publish provenance after the account rename) are run 3's and resolved; T30 to T34 are open (section 7). Approval: none. The model states it: "no approvals entry exists for v1 or v2; a person approves this version and accepts each open threat (owner, reason, until) or the model stays unapproved." Diff since the last approval: there is none to diff against; v2 changes v1 as its `changesSinceV1` lists (T1 to T26 moved from open to resolved with behaviors, floor, achieved level, records and bypass notes; T27 to T34 and assumption TA4 added). This repository has no threat gate.

### 1.5 The bump and the changelog

Computed bump: **2.0.0**. Range `v1.2.1..7324137`: 238 commits, 32 merge commits (subjects `merge: ...`, not conventional) and 206 others. Exactly one commit is breaking, both by subject (`type(scope)!:`) and by a `BREAKING CHANGE:` line in a message body: `7afb20e feat(waivers)!: enforce waivability: refuse never-class and unscoped waivers, inert stored ones`. Release-please (`release-type` node, no pre-major settings, manifest 1.2.1) therefore computes a major. The clerk did not run release-please (no token, no network); this is a count by its published commit rules, and evidence-final section 6 and D did the same count on two earlier trees.

Changelog preview by type (clerk run: `git log --no-merges --format=%s v1.2.1..7324137`, before this receipt's own `docs` commit, which makes docs 16):

| type | commits | release-please section |
|---|---|---|
| fix | 133 | Bug Fixes |
| feat | 4 | Features (`0d0b8a0` config, `4502693` ops, `38bb6fc` document, `1dcf401` numeric) |
| feat! | 1 | Features, flagged BREAKING CHANGES (`7afb20e`) |
| test | 53 | hidden (not a default section) |
| docs | 15 | hidden |

The busiest fix scopes: engine 57, parse 11, reachability 10, formal 9, numeric 7, config 7. CHANGELOG.md is not edited (release-please writes it). Its compare links still name `theagenticguy`, which is release-please history and left untouched by RH-R1.

## 2. Behaviors and their tests

53 S3 behaviors (S3-001 to S3-053) and 12 release-hardening behaviors (RH-001 to RH-012). "tests naming it" is a clerk run: `pnpm exec vitest list` at `7324137` (3705 tests), counting every test whose full name carries the id in square brackets or in a describe title; a test naming several ids counts once for each. S3-045 is high because some of its tests are generated once per source file (evidence-final section B explains the same mechanism).

Not pinned by a vitest test, by design (contract.md `## Not pinned by a vitest test`): S3-051 (a person reviews the report-corpus diff row by row; evidence snapshots are "fully attributed" and the review re-checked the 53-row snapshot unchanged), S3-052 and S3-053 (properties of the commit range and the version files; a vitest assertion on the version would break the release PR). Evidence record G4: inspection only, not a test. The clerk inspected both at `7324137`: the one `feat!` commit has the `BREAKING CHANGE:` footer in its own body (`git log --format=%B -1 7afb20e`), and `package.json`, `.release-please-manifest.json`, `src/app/runtime/version.ts`, README.md:933 and AGENTS.md:12 all read 1.2.1.

| id | class | floor | tests naming it | origin | behavior (cut at 130 characters) |
|---|---|---|---|---|---|
| S3-001 | false certificate | 2 | 18 | reading | The fold refuses a waive of any never-class code (verdict, disclosure, triage, hygiene, anchor), whatever its scope and hash, … |
| S3-002 | false certificate | 1 | 6 | reading | A refused waive aborts the whole atomic stream: nothing is written, the document is byte-identical, exit 1 |
| S3-003 | false certificate | 2 | 4 | reading | The fold refuses a code-only waive of every code, scoped classes included, through apply and symspec waive |
| S3-004 | reviewed-waiver loss | 1 | 1 | reading | A refs plus matching contentHash waive of a scoped-class code is accepted and stored as requirementIds plus that hash |
| S3-005 | false certificate | 2 | 6 | ruling R37 (question 1) | A waive op with refs but no contentHash, or a single ref, is accepted through apply, symspec waive and import: ref is normalized … |
| S3-006 | false certificate | 2 | 3 | reading | No waiver is ever stored as requirementId without a contentHash |
| S3-007 | false certificate | 1 | 2 | reading | A waive whose refs equal no finding's set is accepted at write and suppresses no finding at check |
| S3-008 | false certificate | 1 | 5 | reading | A supplied contentHash that differs from the current text is refused with ERR_USAGE, as at base, and nothing is written |
| S3-009 | false certificate | 2 | 6 | threat T22 | A code with no own FINDING_CLASS row is refused at write and inert at check, and every published code has its own row |
| S3-010 | false certificate | 2 | 6 | threat T23 | Every case or whitespace variant of a never code is refused at write, inert at check and suppresses nothing |
| S3-011 | instruction drift | 1 | 5 | reading | A refusal names the code and its never class, or the missing refs and hash, and names only commands this build has |
| S3-012 | false certificate | 2 | 9 | reading | Import folds every waiver record through apply's classifier: refused records go to problems[] with ERR_WAIVER_REFUSED, the … |
| S3-013 | false certificate | 1 | 3 | reading | An unresolvable import --ref is refused and never widened to a document-wide waiver |
| S3-014 | reviewed-waiver loss | 1 | 1 | reading | Import accepts a JSONL waive record in the refs plus contentHash form apply accepts |
| S3-015 | reviewed-waiver loss | 1 | 1 | threat T10 | Each waiver import refuses is named with its line, code, scope and replacement |
| S3-016 | false certificate | 4 | 18 | reading | A stored never-class waiver is inert whatever its scope and hash, disclosed once as waiver-inert, and the run equals the document … |
| S3-017 | false certificate | 2 | 3 | reading | A stored code-only waiver of any code, an unknown code included, is inert and disclosed |
| S3-018 | false certificate | 2 | 3 | reading | A stored single requirementId waiver with no hash is inert, even when it names the finding's one requirement |
| S3-019 | false certificate | 1 | 4 | reading | A stored requirementIds waiver with no contentHash is inert |
| S3-020 | false certificate | 1 | 3 | ruling R39 (question 3) | A stored single requirementId with a matching contentHash qualifies as refs [id] plus that hash: it suppresses exactly its … |
| S3-021 | reviewed-waiver loss | 1 | 7 | reading | A stored refs plus matching hash waiver of a scoped code qualifies and suppresses exactly its finding, with no diagnostic |
| S3-022 | reviewed-waiver loss | 1 | 1 | ruling R38 (question 2) | A stored waiver whose refs match no finding's id set suppresses nothing and is disclosed as waiver-inert (matches no finding) … |
| S3-023 | false certificate | 2 | 4 | reading | waiver-inert is an info data.diagnostics entry that demotes nothing; deleting an inert waiver changes no finding, demotion or … |
| S3-024 | reviewed-waiver loss | 1 | 7 | reading | For a scoped code, waiver-inert carries the exact unwaive op plus one scoped waive refs plus current contentHash per finding it … |
| S3-025 | instruction drift | 1 | 1 | reading | For a never code, waiver-inert carries the unwaive op and rewrite required, and no waive op |
| S3-026 | reviewed-waiver loss | 1 | 3 | ruling R41 (question 5) | A replacement scoped waive op carries the legacy reason verbatim followed by one exported fixed provenance marker |
| S3-027 | instruction drift | 2 | 30 | threat T18 | Every replacement op decodes and folds under MUTATE_OPTIONS on the checked document, and every named command parses under this … |
| S3-028 | reviewed-waiver loss | 1 | 6 | reading | A stale-hash waiver brings its finding back and is listed once in data.ignoredWaivers with code, ids, stored and current hash … |
| S3-029 | reviewed-waiver loss | 1 | 1 | ruling R42 (question 6) | A data.ignoredWaivers (stale hash) entry carries its unwaive op and a note that the requirement's text changed since review and … |
| S3-030 | false certificate | 4 | 13 | threat T11 | No stored waiver the S3 fold would refuse as an op reaches the engine |
| S3-031 | false certificate | 1 | 5 | threat T26 | The engine-tier diff is prose only, and the engine still declines a stored code-only FND_OPPOSITION_CANDIDATE waiver |
| S3-032 | false certificate | 2 | 1 | threat T5 | isWaivedBlocking re-admits a requirement exactly when isWaived suppresses its blocking finding |
| S3-033 | false certificate | 1 | 4 | reading | A waived blocking lint re-admits its requirement and demotes waived-blocking-lint naming it |
| S3-034 | false certificate | 1 | 2 | ruling R40 (question 4) | blocking-lint-both keeps its FND_CONTRADICTION error and verified false, gives one waived-blocking-lint demotion naming ORD-R1 … |
| S3-035 | false certificate | 1 | 2 | ruling (G3) | A waived blocking lint never yields verified true, even on a consistent pair, and --strict exits 3 when it is the only failure |
| S3-036 | false certificate | 2 | 3 | threat T13 | The waived-blocking-lint set is the no-waiver excluded set minus the set under exactly toEngineDoc's waivers; no waivers equals … |
| S3-037 | false certificate | 1 | 2 | reading | The AC-5-6 reproducer: the opposition waive is refused, the un-waived CAB and TNK pairs demote separately, and the stored … |
| S3-038 | false certificate | 1 | 2 | ruling R43 (question 7) | The reproducer is red on base on a minimal CAB+TNK document with the fixture embedder: at base the code-only … |
| S3-039 | instruction drift | 2 | 66 | reading | Every repair.ops op decodes and the S3 fold accepts it, and no offered waive names a never code |
| S3-040 | instruction drift | 1 | 33 | reading | No demotion action, finding message or suggestion for a never code contains waive, at every engine site |
| S3-041 | instruction drift | 1 | 5 | ruling R44 (question 8) | For a requirement excluded from the formal tier by a blocking scoped-class lint, the remedy offers rephrasing first and may offer … |
| S3-042 | instruction drift | 1 | 3 | reading | scope.ts coverageDemotion does not say or waived, and check:agents shows no drift |
| S3-043 | instruction drift | 1 | 6 | ruling (coordinator input b) | The installed skill body offers no waiver for FND_OPPOSITION_CANDIDATE or any other never code |
| S3-044 | instruction drift | 4 | 6 | ruling (coordinator input a) | WAIVABILITY_ENFORCED is true, held to apply, import and check, and no surface says NOT enforced by this build |
| S3-045 | instruction drift | 1 | 241 | ruling (coordinator input c) | No advice, replacement, message or prose names vocab distinct or propose-vocabulary --rescope-waivers |
| S3-046 | false certificate | 1 | 6 | threat T24 | Every waiver the engine applied is listed with code, ids and reason, and the scope says a content hash binds text, not the … |
| S3-047 | gate drift | 1 | 2 | ruling R45 (question 9) | A scoped, reviewed waiver of a scoped-class finding gets no KNOWN_ESCAPES row: the scoped-waive harness move runs on never-class … |
| S3-048 | gate drift | 1 | 19 | threat T21 | The 11 waive-by-code KNOWN_ESCAPES rows are deleted with the move still registered and exactness green on every shard |
| S3-049 | gate drift | 1 | 12 | threat T20 | The harness measures a scoped never-code waive per baseline finding and the same waivers written into the stored JSON with no fold |
| S3-050 | gate drift | 1 | 10 | threat T25 | The clean (fixture, move) pairs after S3 are base's minus the 11 waive-by-code rows, none added |
| S3-051 | gate drift | 1 | 0 | threat T21 | Every changed report-corpus row is a verdict delta attributable to AC-5-6 |
| S3-052 | reviewed-waiver loss | 1 | 0 | ruling (coordinator input d) | The S3 build commit is feat! with a BREAKING CHANGE: footer in its own body |
| S3-053 | reviewed-waiver loss | 1 | 0 | ruling R46 (question 10) | S3 does not touch the version files; release-please bumps the four version files in the release PR |
| RH-001 | release metadata (irreversible publish: npm provenance … | n/a | 1 | ruling RH-R1 | package.json repository.url, homepage and bugs.url name github.com/laithalsaadoon/symspec exactly |
| RH-002 | published documentation (negative guard) | n/a | 2 | ruling RH-R1 | No live reference (package.json, README.md, RELEASING.md, AGENTS.md, non-test src/) names theagenticguy; the README install and … |
| RH-003 | gate boundary (config resolution; legacy documents check as … | n/a | 2 | ruling RH-R2 (a) | With no config named and no symspec.config.json in the document's directory or any ancestor, a git refusal other than 'not a git … |
| RH-004 | gate boundary (fail closed) | n/a | 2 | ruling RH-R2 (b) | With a symspec.config.json in the document's directory or any ancestor, a git refusal fails closed as ERR_CONFIG_INVALID naming … |
| RH-005 | gate boundary (fail closed, F11) | n/a | 1 | ruling RH-R2 | The bare-repository refusal stays ERR_CONFIG_INVALID, even with no config anywhere |
| RH-006 | gate boundary (explicit config) | n/a | 1 | ruling RH-R2 | --config and SYMSPEC_CONFIG behave as today under a git refusal (ERR_CONFIG_INVALID) and with git answering (read and disclosed … |
| RH-007 | published schema descriptions (honest scope) | n/a | 4 | ruling RH-R3 | One exported constant (V4_EXPERIMENTAL_STATEMENT) states v4 is experimental and read by no check tier; the vocabulary, intent and … |
| RH-008 | published CLI surface (honest scope) | n/a | 4 | ruling RH-R3 | init --split carries the statement in its --help, its manifest flag description and its result data |
| RH-009 | published documentation (honest scope) | n/a | 6 | ruling RH-R3 | AGENTS.md and README paragraphs about init --split, intent.json, policy.json or format v4 carry the statement; the unqualified … |
| RH-010 | gate boundary (fail closed) | n/a | 4 | review R1; ruling RH-R4 (dangling link) | Under a git refusal with no config named, a symspec.config.json at the document's directory or any ancestor whose existence … |
| RH-011 | gate boundary (config resolution; legacy documents check as … | n/a | 1 | review R2 | The bare-repository refusal is recognised from git's own message form (its 'fatal: cannot use bare repository' line), never from … |
| RH-012 | published schema descriptions (honest scope) | n/a | 2 | review R3 (extends RH-007) | Over every description at every nesting level of the projected document JSON schema, no unqualified enforcement claim appears, … |

## 3. Machine verdicts: was it built right?

This repository's own gates are the trusted base (run 2 notes: "Toolsmith skipped: symspec's own gates (pnpm check seven legs, gaming harness, report-corpus snapshot, sabotage rule) are the trusted base"; model phase skipped: no retries, idempotency, crash windows or concurrency). It has no VDD trace, matrix, commit, semver, changelog, secrets or threat gate, so none of those rows exists; they are not shown as passing.

| gate | verdict | counts | source |
|---|---|---|---|
| `pnpm check` on the head, fresh clone of this branch at `7324137`, `pnpm install --frozen-lockfile` first | pass, exit 0 | 7 of 7 legs: biome ci 245 files, no fixes; `tsc --noEmit`; `check:agents` (AGENTS.md equals the generator); `gate:reachability` FEASIBLE (12 variables, clean PROVED_UNDER_HYPOTHESES, buggy VIOLATED, 706 ms within 5000 ms); build (`dist/cli.mjs` 2.77 MB); vitest 113 files, 3705 of 3705 tests; knip no output | clerk run (`SYMSPEC_EMBED_STUB=1 NO_COLOR=1 CI=1`, node 24, pnpm 11.21.0; the clone was discarded) |
| `pnpm check` on build-7 `ae268e3` | pass | 3705 of 3705, 113 files, no snapshot moved | build-7 commit message; same count as the clerk run |
| CI equivalent (`.github/workflows/check.yml`: checkout, pnpm/action-setup from `packageManager`, node 24, `pnpm install --frozen-lockfile`, one `pnpm check`) | pass on `2d3e5fe` and on `6f7e957` | 3587 of 3587 and 3654 of 3654 tests; 3654 vs 3651 explained as three per-source-file tests for the new `shell-word.ts`; the clerk's run follows the same two commands. GitHub Actions itself has not run on this branch. | evidence-final sections 1, A, B |
| `npm pack --dry-run` | pass | `symspec-1.2.1.tgz`, 6 files (LICENSE, README.md, bin/symspec.mjs, dist/cli.mjs, dist/model-cache-PZRCo9qP.mjs, package.json), 791.4 kB; repository, homepage and bugs name laithalsaadoon/symspec; `manifest` lists 24 error, 42 finding and 24 lint codes = 90; README has one "90 stable codes" and no "89 stable"; `theagenticguy` occurs in none of package.json, README.md, RELEASING.md, AGENTS.md | clerk run; evidence-final C |
| Burn down of `KNOWN_ESCAPES` | 62 to 51 | base 62 distinct rows; head 51 distinct rows (clerk run importing it with tsx); the 11 that left are exactly the `x waive-by-code` rows (one-trigger-contradiction, contrary-pair, registered-contrary, numeric-conflict, temporal-conflict, glossary-bridged, term-bridged, waived-blocking-lint, dangling-target, overlapping-contrary, derives-cycle); 0 added | evidence-final D (base count); clerk run (head count) |
| Absence, run 2 | clean (after the ruling above) | `absence.json` on contract `3f3c33d`: 297 S3-named tests, 159 green @existing guards, and a failing list of 148 (138 S3-named red plus 10 snapshot mismatches that carry no S3 id), its own verdict "passes on base" until the coordinator's ruling above; `absence-2.json` (re-pins): 153 S3-named red, 159 green guards, 0 broken, 15 re-pinned red; `absence-4.json` (contract-4 `5f79f9a`): 3561 tests, 45 failed on `7afb20e`, 64 new tests (15 red, 49 green, 5 green with a mutant kill); `absence-6.json` (772aee6 tests on the 2d3e5fe product): 3651 tests, 30 failed, 64 new (30 red); `absence-7.json` (contract-7 `43e0a87`): 3705 tests, 22 failed, 48 new (22 red, 26 green). Each record's verdict: clean, 0 broken suites | records as named |
| Absence, run 3 | clean | `absence.json` on contract `d6a5f3a`: 3276 tests, 15 red, 4 pinned-existing green, 0 broken; `absence-2.json` (`c1fe161`): 4 new red, 2 guards green, 3 refutations confirmed, 0 refuted | records as named |
| Evidence, run 2 | 7 of 7 legs on each measured tree | `evidence.md` (`7afb20e`, 3494 tests): 17 named sabotages all red, plus 13 extra red, 6 sabotages survive, snapshots fully attributed, gaming clean pairs = base minus the 11 rows. `evidence-final.md` first part (`2d3e5fe`, 3587): headline reproducer, B3 end to end, 62 to 51, pack contents, single breaking commit. Second part (`6f7e957`, 3654): same, plus the pipe-truncation measurement (pre-existing, section 7). | records as named |
| Evidence, run 3 | 7 of 7 legs | `evidence.md` (evidence commit `22b47f6`, tree `ca83661`, 3276 tests, 108 files): 16 sabotage replays all red, B3 end to end, npm pack reads laithalsaadoon; evidence-2 (`6445f29`, run 3 notes): 7 of 7 legs, replays red, review repros fixed | records as named |
| Attack, run 2 round 1 | 70.4% caught | `attack-ledger.json` (Codex / OpenAI, on `7afb20e`): 75 mutants, 71 valid, 50 killed, 21 survived, 4 compile errors; survivors: 12 missing S3 cases, P16 (equivalence accepted), 8 pre-existing error paths in touched hunks (pinned as @existing guards in contract-4); 15 findings | ledger; run 2 notes |
| Attack, run 2 round 2 | 74.4% caught | `round2` (job 1117, on `2d3e5fe`): 47 mutants, 43 valid, 32 killed, 11 survived, 4 compile errors; replay of round 1: 20 of 21 killed (P16 stands); survivors C06, C09, C10, C13, C18, C23, RH10 (findings), C14, C15 (pre-existing), C17, C20 (proposed equivalences). review-final-3 replayed the seven findings' mutants twice on `6f7e957`: all seven killed (ledger `survivorReplays`). No mutation campaign is recorded after `6f7e957`; the contract-7 and build-7 code (the static guard, `ShellArg`) was reviewed and sabotaged by hand, not mutation tested. | ledger; run 2 notes |
| Attack, run 3 | none | the run 3 record has sabotage replays (16 then 9), not a mutation campaign | run 3 notes |
| Review, run 2 | ledger `abccc2c`: tree does not survive review | four review rounds: `57948c2` (codex 1027, on `7afb20e`) R1 to R4 blocking and R5 minor, 6 canaries caught, 42198 lines read; `bc9a87d` (job 1121): R1, R3, R4, R5 closed, R2 variant and new R6 blocking, R7 minor, remerge-diff clean, canary caught; `ea1503a` (review-final-3): R2, R6, R7 closed, R8 and R9 blocking; `abccc2c` (review-final-4, job 1243): R8 and R9 closed by replay; R10 and R13 (static guard completeness) and R11 and R12 (pre-existing advice commands) blocking and open, independently reproduced; 19 files, 13646 of 13646 lines read, 3 canaries caught, 27 static tests and the 53-row corpus snapshot green, typecheck exit 0. The ledger's own words: "This tree does not survive review." | ledger `s3-waivability/review-ledger.json` |
| Review, run 3 | R1 to R3 closed; R4 open nonblocking | `fc203db` (job 936): R1 ELOOP branch untested, R2 bare-refusal substring match, R3 nine projected schema enforcement claims, all blocking; closed in `935ce70` with independent execution, canary C1 caught; 6376 of 6376 changed lines read; R4 (parent cycle claim) ruled nonblocking, owned by S7 | ledger `release-hardening/review-ledger.json` |
| Merge of the two branches | clean | `2d3e5fe`: four conflicts resolved keeping both sides, `pnpm check` 3587 of 3587; review-final-2's remerge-diff clean | run 2 notes; ledger |
| Threat model v2 | written, unapproved | 34 threats, 29 resolved at or above floor, 5 open; the clerk ran no gate on it (none exists here) | section 1.4 |
| Commits, semver, changelog, secrets, vulnerabilities, Scorecard, release verify | not run | none of these legs is wired in this repository; the bump is release-please's, computed by count in section 1.5 | n/a |

## 4. The burn down and what stays open by slice

`KNOWN_ESCAPES` went 62 to 51: exactly the 11 `x waive-by-code` rows closed by AC-5-6 left and none was added (S3-047 and S3-048: no row for a scoped reviewed waiver, since it is a designed discharge; the move stays registered and exactness is held by the gaming shards). The 51 that remain, grouped by the `closedBy` label each row carries (clerk run, reading `src/testing/gaming.ts`): AC-5-2: 26; AC-5-9: 14, plus 2 and 1 with their drift notes, 17 in all; "S4 / AC-4-2 (cross-table fence + check twin)": 4; AC-4-6: 2; AC-5-7: 2. The two rows `waived-blocking-lint x delete-requirement@first` and `@second` stay with AC-5-2 (R53). The other slices named in the records (S5 the v4 format, S6 V-PARENT, S7 vocab ops, S9, S17, S18, S10) are not built; the records name them only as owners of follow-ups.

## 5. Evidence detail, for audit

The five closure facts the person may want first:

- The headline reproducer (evidence-final section 3, real embedder): the code-only `waive FND_OPPOSITION_CANDIDATE` stream exits 1 with ERR_WAIVER_REFUSED, the file is byte-identical to `base.json` (sha256 `781fff94...`), the two tank requirements of the stream are not written either (atomic stream); the properly scoped variant and the single-ref variant are refused the same way; the same waiver stored by the base build is inert and disclosed (one info `waiver-inert`) and both pairs demote. The exit is 1 in every row because the fixture carries an error-severity GTWR_R7_VAGUE, so read findings and diagnostics, not `verified`.
- A scoped lint waiver (control) is accepted and suppresses: exit 0 on write, applied 1.
- Terminology waivers (old gap G1) apply and are listed (R57, R62).
- B3 end to end (evidence-final section 4): git shim refusing with no config anywhere: exit 0, verified true, `data.run.config` discloses the refusal; same shim with a config in an ancestor or beside the document: exit 2 ERR_CONFIG_INVALID naming the refusal; no git on PATH: exit 0.
- The CLI's output truncates at the pipe capacity when a non-zero-exit result is large and the reader is slow (evidence-final section E): identical cut points on `0fca043`, `v1.2.1` and `6f7e957`, so pre-existing, not a regression; threat T33.

Reproduce the headline numbers: `git clone --no-hardlinks <repo> fresh && git -C fresh checkout 7324137 && cd fresh && pnpm install --frozen-lockfile && SYMSPEC_EMBED_STUB=1 NO_COLOR=1 CI=1 pnpm check && npm pack --dry-run`. The reproducers of evidence-final sections 3 and 4 need the real embedder (unset `SYMSPEC_EMBED_STUB`).

What stays unverified: branch protection and CODEOWNERS enforcement on GitHub (TA1); the npm trusted-publisher binding (TA4); a real GitHub Actions run; the release-please action's own output; the first publish's provenance; messages of never codes that no document reaches rest on static source sweeps (TA3); the branches listed under "Carried evidence gaps" in section 7.

How to reverse: nothing is pushed yet. Until the person merges, deleting the `release/2.0.0` ref undoes it. After the merge, release-please's own PR and tag are separate steps the person controls, and a published npm version cannot be unpublished by this run.

## 6. Upgrade note

The note for the release PR body is the whole of `.erpaval/vdd/s3-waivability/upgrade-note.md` (next to this file), written in plain words from the rulings above.

## 7. Open items and owners

Owner "Laith" means the person; "end date" is the record's. All of these shipped open on the coordinator's decision in section 0. Items 1 to 5 are threat-model threats T31 to T34 and T30; the review and attack ledgers hold the reproductions.

| # | item | what the records say | owner | end date |
|---|---|---|---|---|
| 1 | review R10, R13 (threat T31) | the new static shell-safety guard can pass while missing a rendered command assembled through a local array variable (R10), and accepts a helper or branded shell word inside `$'...'` or after a literal backslash (R13); no current product site is affected; recorded as ss_bugs manual rows (run 2 notes) | Laith | next minor release |
| 2 | review R11, R12 (T32) | pre-existing advice commands this CLI rejects: the reachability initial-state repair uses a positional document path although `state-initial` requires `--file` (R11), and the missing-trace-link advice names the absent `symspec derive` (R12) | Laith | next minor release |
| 3 | pipe truncation (T33) | non-zero-exit JSON larger than the pipe capacity is truncated for a slow reader; pre-existing on `0fca043` and `v1.2.1` (evidence-final E, review O1, ss_bugs man:pipe-truncation) | Laith | next minor release |
| 4 | attack C14, C15 (T34) | prose-normalizer corners: user backticks, the `add` verb | Laith | next minor release |
| 5 | run 3's review R4 (T30) | "The part-of chain has no cycles" is in `document.ts` :1258 and a parent cycle verifies; also nested-description gap G7; owned by S7 (vocab ops validate the invariants) and spec 007 S6 (V-PARENT) to make the claim true; Laith rules the RH-012 scope of the sentence | S7 / spec 007 S6; Laith for the RH-012 ruling | next minor release |
| 6 | TA1 CI and CODEOWNERS | the workflow file was read; branch protection and CODEOWNERS are GitHub settings no record measures | Laith | next minor release |
| 7 | TA2 sha256 collision resistance | proposed for acceptance as is | Laith | none set |
| 8 | TA3 advice reach | narrowed, not discharged: R56 covers every repair arm, but the messages of never codes no document reaches rest on static sweeps of six named files | Laith | next minor release |
| 9 | TA4 npm trusted publisher, and the Laith-only publish step | B2 (run 3): revoke and re-register the npm trusted publisher, Laith's alone, before the 2.0.0 publish. RELEASING.md gives the register command `npm trust github symspec --repo laithalsaadoon/symspec --file release-please.yml --allow-publish` (step 3) and, for a token, `npm token list && npm token revoke <id>` (step 4). Then he merges the release-please PR. The records do not say which old binding to remove or whether a token is involved. | Laith | before the 2.0.0 publish |
| 10 | the untested `asShellArg` branch | `asShellArg` on an unquoted value falls back to quoting; the build-7 commit says a bare cast with no fallback leaves 0 tests red and no production caller passes it an unquoted value, so the fallback is unpinned defence in depth | no owner recorded | none set |

Carried evidence gaps (none ruled by a person): G3 S3-012 import equals apply: evidence-final still lists it as example-level, carried not re-measured; threat model v2 credits level 2 from the import/apply differential sweep at `import.test.ts:907` that contract-4 added. G4 S3-052, S3-053 (and S3-051 by design) have inspection evidence only. G5 the S3-026 provenance marker may be empty: threat model v2 says the non-empty suffix test (D06) closes it. G6 R43's base assertion: closed as record correction R43a. G7 the pipe truncation (item 3). The mode-000 directory variant and the nested statement requirement of run 3 were accepted (section 1.2).

The merge to main stays conditional, by the coordinator's decision, on a clean audit and green GitHub CI. No audit record is in this branch, and GitHub Actions has not run on it.

## 8. Commands

Laith fetches the branch into his checkout (clerk did not run this):

```
git -C ~/workplace/symspec fetch /home/lalsaado/bonk-fs/projects/mods-webapp-poc/run/work/job-815/repo vdd/s3-waivability:release/2.0.0
```

The coordinator (job 815) then pushes `release/2.0.0` to github.com/laithalsaadoon/symspec and opens a pull request to `main` titled `feat!: symspec 2.0.0 ...` whose body is the upgrade note (`.erpaval/vdd/s3-waivability/upgrade-note.md`), for example:

```
git -C ~/workplace/symspec push git@github.com:laithalsaadoon/symspec.git release/2.0.0
gh pr create --repo laithalsaadoon/symspec --base main --head release/2.0.0 \
  --title 'feat!: symspec 2.0.0 ...' --body-file .erpaval/vdd/s3-waivability/upgrade-note.md
```

Before merging the release-please PR, Laith runs the npm trust commands of item 9 in section 7. No command above was run by the clerk, and none of them is an approval.
