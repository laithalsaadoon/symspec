/**
 * THE GAMING GATE — every known way to reach a clean verdict without fixing the spec.
 *
 * ## Why this exists (spec 007 Story 8)
 *
 * The consumer of `check` is an agent in a loop, and its stop condition is `verified: true`
 * with exit 0. An agent that optimizes for that stop condition will eventually find any move
 * that reaches it without making the spec right, whether or not it is trying to. So the
 * question this module answers is not "does the detector fire on the defect" — the
 * adversarial and harness gates own that — but "which EDITS turn a detected defect into a
 * clean verdict", measured, on every build.
 *
 * ## The shape
 *
 * - {@link FIXTURES}: small documents that are consistent except for ONE seeded defect the
 *   current tool detects (exit 1, or exit 3 under `--strict`). Each names the signal that
 *   proves the tool saw THAT defect, and — where one exists — a CONTROL: the consistent twin
 *   that reaches a clean verdict under the same run settings. The control is what shows the
 *   fixture can discriminate. Without it, "no move escaped" could mean only that the rest of
 *   the document was dirty. A fixture that exists to measure a direction label (G-D) may
 *   carry a second, named defect, and says so in its `seeded` prose (`dangling-target`).
 * - {@link MOVES}: every gaming move expressible on today's document format, each a function
 *   from a fixture to an op stream, a re-parse, or a run-setting change — the same three
 *   channels an agent has. A move's I-1 direction is DERIVED from the op verbs it emits
 *   (`OP_DIRECTION` in `ops.ts`), never typed on the move, and G-D measures that label.
 * - {@link NOT_APPLICABLE_YET}: the AC-8-2 moves whose target does not exist yet (intent,
 *   policy, `narrow` certificates, environment assumptions, `derived`). Enumerated in code so
 *   AC-8-2's list is complete here and a later story has a row to promote.
 * - {@link KNOWN_ESCAPES}: every (fixture, move) pair that reaches a clean verdict today, with
 *   the AC that closes it. The gate is that this table is EXACT, in both directions.
 * - {@link OP_COVERAGE}: every op verb in `ops.ts`, mapped to the moves that exercise it or to
 *   a written reason it has none (AC-8-2's last sentence).
 * - {@link KNOWN_NONMONOTONE}: every (fixture, move) pair whose ops are all labelled
 *   `strengthening` and whose run nonetheless LOST a member of D, the verdict-bearing set —
 *   G-D, the measurement of the direction labels. Exact in both directions, like the escapes.
 *
 * ## "Clean" and "escape", precisely
 *
 * Every run is `--strict`. A run is CLEAN when `verified` is true and the exit code is 0 — the
 * agent loop's stop condition. Under `--strict` that is the same as "exit 0", because a false
 * `verified` trips the strict gate to exit 3; both are asserted anyway so neither can drift.
 *
 * AC-8-1 excepts "a repair the kernel certified against intent and policy". The certificate
 * kernel (Stories 5 and 6) does not exist, so no run can carry such a certificate, and EVERY
 * clean moved run is an escape. When the kernel lands, the exception belongs in
 * {@link isEscape} as a property of the RUN (a re-checked certificate in the payload), never as
 * a flag on a move: a registry flag is exactly the kind of assertion an optimizing author can
 * steer (I-6).
 *
 * ## I-5: a deletion is a finding
 *
 * The escape table is exact, so a listed escape that STOPS escaping fails the gate as loudly as
 * a new one. Otherwise the table goes stale the first time a later story closes a row, and a
 * stale row is a permission slip for the next regression on that pair. The rest of the matrix
 * — how each move is caught, and whether the seeded signal still fires — is rendered into a
 * committed snapshot, so a move that used to be caught by the defect itself and is now caught
 * only by an unrelated demotion is a visible diff rather than a silent weakening.
 *
 * ## The embedder is a table of orthogonal vectors, never the stub
 *
 * The stub is disclosed as `run-weakened` (AC-3-5), so no run on it can ever be clean, and a
 * gate that can never see a clean verdict cannot see an escape either. The baseline embedder
 * gives every distinct phrase its own axis: the semantic tier RUNS (and discharges its own
 * demotion) but proposes nothing. That is the worst case for the tool — the pinned model
 * rescuing nothing — so an escape measured here is an escape of the decide tier, which is the
 * tier the verdict rests on. The stub itself is one of the moves.
 *
 * The one exception is a fixture's own `near` pairs, which the embedder places at a fixed
 * cosine between the opposition floor and the similarity threshold. Without them no fixture
 * could raise an embedding-proposed conflict signal, and G-D would be blind to every move
 * against one (`opposition-candidate` exists for that).
 *
 * ## What "caught" does not prove
 *
 * A move is caught on a fixture when the moved run is not clean. That can mean the defect still
 * fires, or only that the move broke something ELSE the tool demotes on (a renamed system is
 * uncovered). The snapshot's `signal=fires|gone` column is what tells them apart, and it is why
 * the snapshot is part of the gate. And some moves leave every fixture's outcome identical to
 * its baseline — the run-weakening moves, because each fixture's defect is decided by a tier
 * those knobs do not reach. For those, only the inert-move guard notices if the move itself
 * stops doing anything; making them observable needs a fixture whose defect only that tier
 * finds.
 */

import { Effect, Layer, ManagedRuntime } from 'effect'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseLine } from '../domain/engine/parse/result.ts'
import { requirementsContentHash } from '../domain/requirements/content-hash.ts'
import {
  emptyDocument,
  RELATIONS,
  type Requirement,
  type RequirementsDocument,
} from '../domain/requirements/document.ts'
import { foldOps, type MutateOptions } from '../domain/requirements/mutate.ts'
import {
  type AddOp,
  type DocumentOp,
  joinDirections,
  OP_DIRECTION,
  type OpDirection,
  type OpVerb,
} from '../domain/requirements/ops.ts'
import { resolveRef } from '../domain/requirements/resolve.ts'
import { DocPath, DocStore, documentOnlyStore, makeDocPath } from '../ports/doc-store.ts'
import {
  EMBED_STUB_ENV,
  type Embedder,
  type EmbedderService,
  embedderLayerOf,
} from '../ports/embedder.ts'
import { ErrDocNotFound } from '../ports/errors.ts'
import type { SolverService } from '../ports/solver.ts'

const TS = '2026-01-01T00:00:00.000Z'

// ---------------------------------------------------------------------------
// Run settings
// ---------------------------------------------------------------------------

/** The `check` knobs a move may turn. `strict` is not one of them: every run is strict. */
export interface Knobs {
  readonly temporalBound: number
  readonly semantic: boolean
  readonly solverBudgetMs: number
  readonly timeoutMs: number
}

/**
 * The armed configuration every fixture runs under — the shape `adversarial.test.ts` scores,
 * for its reason: a gate scored on a weakened run is easier to pass than the risk it measures.
 * The temporal tier is ON, so turning it down or off is a move rather than the default.
 *
 * The per-solver timeout is 10x the CLI's 2000 ms default, and that is ROBUSTNESS, not
 * leniency: every fixture decides in well under the default alone, but a solver `unknown` under
 * CPU contention would turn a pinned snapshot row into a load detector — the failure
 * `explicit-state.test.ts` had on this box under a full `pnpm check`. A larger budget can only
 * let a query finish, and a finished query is the armed answer the snapshot pins.
 */
export const ARMED: Knobs = {
  temporalBound: 10,
  semantic: true,
  solverBudgetMs: 0,
  timeoutMs: 20_000,
}

/** Which embedder a run gets: the orthogonal table, or the env-selected service (the stub). */
type EmbedderChoice = 'orthogonal' | 'stub-env'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** What proves the tool saw the SEEDED defect, not some other problem in the document. */
export type Signal =
  | { readonly code: string; readonly names: readonly string[] }
  | { readonly demotion: string; readonly names: readonly string[] }

export interface Fixture {
  readonly id: string
  /** The seeded defect, in prose — the ground truth a reader checks the fixture against. */
  readonly seeded: string
  readonly ops: readonly DocumentOp[]
  /**
   * The two requirement keys the defect is between. A move that edits ONE requirement is
   * registered once per culprit ({@link oneSided}), because which side survives decides the
   * outcome: deleting `AUD-R2` leaves an uncovered document, deleting `AUD-R1` a clean one.
   */
  readonly culprits: readonly [string, string]
  readonly signal: Signal
  /**
   * The consistent twin, reaching a clean verdict under the same settings — or the reason no
   * such twin exists on today's representation. A reason is a claim about the TOOL, so it
   * names the AC that would let one exist.
   */
  readonly control: { readonly ops: readonly DocumentOp[] } | { readonly none: string }
  /**
   * Response phrases the baseline embedder places at {@link NEAR_COSINE} instead of on
   * orthogonal axes: topically related, and below the similarity threshold. The only way a
   * fixture raises an embedding-proposed conflict signal (an opposition candidate), so the only
   * way G-D can measure a move against one.
   */
  readonly near?: readonly (readonly [string, string])[]
}

/**
 * A fixture requirement's id, derived from its key: four FNV-1a passes, each seeded differently,
 * laid out as a v4-shaped UUID.
 *
 * Derived, not minted, because the engine's reported representatives depend on id ORDER. The
 * solver tiers are fed in ascending id order and each reports one core where several compete
 * (per overlapping set, per numeric cell, per temporal run: `DISPLACEMENT` in the signal classes),
 * and the trace tier's cycle search visits requirements in document order. With random ids,
 * a (fixture, move) cell whose report names one representative of several would change between
 * runs, and a gate that pins that report exactly would be a coin toss.
 */
const fixtureId = (key: string): string => {
  const pass = (seed: number): string => {
    let h = (0x811c9dc5 ^ seed) >>> 0
    for (const ch of `gaming:${key}`) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0
    return h.toString(16).padStart(8, '0')
  }
  const hex = [1, 2, 3, 4].map(pass).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const add = (
  key: string,
  slots: Omit<AddOp, 'op' | 'key' | 'patternType'> & Partial<Pick<AddOp, 'patternType'>>,
): AddOp => ({
  op: 'add',
  key,
  id: fixtureId(key),
  patternType:
    slots.patternType ??
    (slots.trigger !== undefined
      ? 'event-driven'
      : slots.preCondition !== undefined
        ? 'state-driven'
        : 'ubiquitous'),
  ...slots,
})

/** Door/train, the canonical feature interaction (spec 007 "Why a certificate"). */
const doorOps = (r2Response: string, r2Negated: boolean): readonly DocumentOp[] => [
  add('DOOR-R1', {
    trigger: 'the passenger presses open',
    systemName: 'door controller',
    systemResponse: 'open the door',
  }),
  add('DOOR-R2', {
    preCondition: 'the train is moving',
    systemName: 'door controller',
    systemResponse: r2Response,
    negated: r2Negated,
  }),
]

const orderOps = (r2Response: string, r2Negated: boolean): readonly DocumentOp[] => [
  add('ORD-R1', {
    trigger: 'the operator submits the order',
    systemName: 'order service',
    systemResponse: 'record the order',
  }),
  add('ORD-R2', {
    trigger: 'the operator submits the order',
    systemName: 'order service',
    systemResponse: r2Response,
    negated: r2Negated,
  }),
]

const contraryOps = (r2Response: string): readonly DocumentOp[] => [
  add('CTR-R1', {
    trigger: 'the clerk reviews the claim',
    systemName: 'claims service',
    systemResponse: 'accept the claim',
  }),
  add('CTR-R2', {
    trigger: 'the clerk reviews the claim',
    systemName: 'claims service',
    systemResponse: r2Response,
  }),
  { op: 'antonym', a: 'accept', b: 'reject' },
]

/**
 * The contrary exists ONLY as a document antonym: ratify/veto is no seed pair, and neither head
 * is in the seed antonym table or the state-bridge lexicon. So every write-time fence that reads
 * the seeds per token (`validateTerms`) is blind to it, and only a fence that reads the
 * document's own antonyms sees it. `contrary-pair` cannot measure that difference, because
 * accept/reject are seed heads and its committed antonym only restates a seed pair.
 */
const registeredContraryOps = (r2Response: string): readonly DocumentOp[] => [
  add('REG-R1', {
    trigger: 'the clerk reviews the claim',
    systemName: 'claims service',
    systemResponse: 'ratify the claim',
  }),
  add('REG-R2', {
    trigger: 'the clerk reviews the claim',
    systemName: 'claims service',
    systemResponse: r2Response,
  }),
  { op: 'antonym', a: 'ratify', b: 'veto' },
]

const numericOps = (r2Bound: string): readonly DocumentOp[] => [
  add('NUM-R1', {
    systemName: 'session service',
    systemResponse: 'expire the session after at most 30 minutes',
  }),
  add('NUM-R2', {
    systemName: 'session service',
    systemResponse: `expire the session after at least ${r2Bound} minutes`,
  }),
]

/**
 * A state-model invariant violation reachable in one step: `VALVE-OPEN` writes the value
 * `VALVE-SHUT` forbids. All three share the trigger, so the propositional tier compares every
 * requirement and the violation is the only thing wrong: with `VALVE-SHUT` ubiquitous, it is
 * demoted uncovered and neither the fixture nor its control could ever be clean (measured).
 */
const valveOps = (openEffect: string): readonly DocumentOp[] => [
  {
    op: 'state',
    name: 'valve',
    type: 'enum',
    domain: ['shut', 'open'],
    frame: 'stable',
    initial: 'valve = shut',
  },
  add('VALVE-OPEN', {
    trigger: 'the operator presses start',
    systemName: 'pump controller',
    systemResponse: 'open the valve',
  }),
  { op: 'classify', ref: 'VALVE-OPEN', kind: 'effect', expression: openEffect },
  add('VALVE-LOG', {
    trigger: 'the operator presses start',
    systemName: 'pump controller',
    systemResponse: 'log the start',
  }),
  add('VALVE-SHUT', {
    trigger: 'the operator presses start',
    systemName: 'pump controller',
    systemResponse: 'keep the valve shut',
  }),
  { op: 'classify', ref: 'VALVE-SHUT', kind: 'constraint', expression: 'valve = shut' },
]

/**
 * The AC-2-7 control, in substance: `G(e → F record)` against `G(¬record)`. `AUD-R3` shares
 * the trigger so the unwanted-behavior pair is compared at all — without it the consistent twin
 * is demoted `no-decide-tier-comparison` and the control cannot reach a clean verdict (measured).
 */
const auditOps = (r1Negated: boolean): readonly DocumentOp[] => [
  add('AUD-R1', {
    systemName: 'audit logger',
    systemResponse: 'record the event',
    negated: r1Negated,
  }),
  add('AUD-R2', {
    patternType: 'unwanted-behavior',
    trigger: 'the disk write fails',
    systemName: 'audit logger',
    systemResponse: 'record the event',
  }),
  add('AUD-R3', {
    patternType: 'unwanted-behavior',
    trigger: 'the disk write fails',
    systemName: 'audit logger',
    systemResponse: 'raise the alarm',
  }),
]

/** A contradiction that exists only THROUGH a committed glossary alias. */
const glossaryOps = (r2Negated: boolean): readonly DocumentOp[] => [
  add('GLO-R1', {
    trigger: 'the user submits valid credentials',
    systemName: 'auth service',
    systemResponse: 'grant access',
  }),
  add('GLO-R2', {
    trigger: 'the user submits valid credentials',
    systemName: 'auth service',
    systemResponse: 'permit entry',
    negated: r2Negated,
  }),
  { op: 'glossary', canonical: 'grant access', alias: 'permit entry' },
]

/** A contradiction that exists only THROUGH a committed noun-phrase term. */
const termOps = (r2Negated: boolean): readonly DocumentOp[] => [
  add('TRM-R1', {
    trigger: 'the buyer confirms the cart',
    systemName: 'billing service',
    systemResponse: 'charge the purchase order',
  }),
  add('TRM-R2', {
    trigger: 'the buyer confirms the cart',
    systemName: 'billing service',
    systemResponse: 'charge the customer order',
    negated: r2Negated,
  }),
  { op: 'term', canonical: 'purchase order', alias: 'customer order' },
]

/**
 * A contradiction whose two sides each carry an ERROR-severity GtWR lint (`timely manner`,
 * GTWR_R7_VAGUE), waived over exactly that requirement. A blocking lint keeps a requirement
 * from the solver (AC-3-7), and a waiver on it RE-ADMITS the requirement, so the contradiction
 * is decided only because of the waivers. That is the shape that measures `unwaive`: removing
 * the waiver takes the requirement out of the solver again, and the verdict it was part of
 * disappears.
 */
const waivedLintOps = (r2Response: string, r2Negated: boolean): readonly DocumentOp[] => [
  add('WBL-R1', {
    trigger: 'the operator submits the order',
    systemName: 'order service',
    systemResponse: 'record the order in a timely manner',
  }),
  add('WBL-R2', {
    trigger: 'the operator submits the order',
    systemName: 'order service',
    systemResponse: r2Response,
    negated: r2Negated,
  }),
  ...(['WBL-R1', 'WBL-R2'] as const).map(
    (key): DocumentOp => ({
      op: 'waive',
      code: 'GTWR_R7_VAGUE',
      refs: [key],
      reason: 'the service level agreement defines the deadline',
    }),
  ),
]

/**
 * The waived-blocking-lint fixture's consistent twin (R2 acknowledges the order): the same two
 * scoped GTWR_R7_VAGUE waivers over a pair that does not conflict. It verified at base; under G3
 * (ruling R26, S3-035) it demotes `waived-blocking-lint` and is not clean.
 */
export const WAIVED_LINT_CONTROL_TWIN: readonly DocumentOp[] = waivedLintOps(
  'acknowledge the order in a timely manner',
  false,
)

/**
 * A contradiction beside a DANGLING trace edge: `DNG-R1` derives from `DNG-R3`, which is then
 * deleted (`delete` leaves inbound edges dangling by design). `add` accepts an explicit `id`, so
 * re-adding a requirement under the missing UUID discharges FND_DANGLING_REFERENCE with one
 * strengthening op. `withTarget` keeps `DNG-R3`, which is the consistent twin's shape.
 */
const danglingOps = (r2Negated: boolean, withTarget: boolean): readonly DocumentOp[] => [
  add('DNG-R1', {
    trigger: 'the operator submits the order',
    systemName: 'order service',
    systemResponse: 'record the order',
  }),
  add('DNG-R2', {
    trigger: 'the operator submits the order',
    systemName: 'order service',
    systemResponse: r2Negated ? 'record the order' : 'acknowledge the order',
    negated: r2Negated,
  }),
  add('DNG-R3', {
    trigger: 'the operator submits the order',
    systemName: 'order service',
    systemResponse: 'archive the order',
  }),
  { op: 'derive', from: 'DNG-R1', to: 'DNG-R3' },
  ...(withTarget ? [] : [{ op: 'delete', ref: 'DNG-R3' } as const]),
]

/**
 * A contradiction beside a BYSTANDER that shares its trigger and system: grant/revoke is a seed
 * contrary pair, and `withhold access` is related to neither side by any table. The ids are fixed
 * so the solver order is grant < withhold < revoke, which is the order the CLI reproducer used.
 * The formal tier reports ONE minimal core per overlapping set of conflicts, so a strengthening
 * op that creates a second conflict through `OVL-R1` (a contrary axiom to the bystander, or an
 * added requirement) can DISPLACE the reported one: the old conflict is still in the document and
 * is no longer in the report.
 */
const overlapOps = (r2Response: string): readonly DocumentOp[] => [
  add('OVL-R1', {
    id: 'aaaaaaaa-0000-4000-8000-000000000000',
    trigger: 'the user submits valid credentials',
    systemName: 'auth service',
    systemResponse: 'grant access',
  }),
  add('OVL-R2', {
    id: 'cccccccc-0000-4000-8000-000000000000',
    trigger: 'the user submits valid credentials',
    systemName: 'auth service',
    systemResponse: r2Response,
  }),
  add('OVL-R3', {
    id: 'bbbbbbbb-0000-4000-8000-000000000000',
    trigger: 'the user submits valid credentials',
    systemName: 'auth service',
    systemResponse: 'withhold access',
  }),
]

/**
 * A derives cycle `CYC-A → CYC-C → CYC-A` beside a branch `CYC-A → CYC-B`. The trace tier's cycle
 * search is a depth-first walk with one visited set across every start node, so it reports the
 * cycles its back edges close and not every elementary cycle. An edge from the branch into the
 * cycle (`CYC-B → CYC-C`) makes the walk finish `CYC-C` through `CYC-B` first, and the reported
 * cycle becomes `A → B → C → A` while `A → C → A` is still in the graph. The ids are fixed so the
 * document order the walk visits is A, B, C. All three share one trigger and system, so the
 * propositional tier compares them and none is demoted uncovered.
 */
const cycleOps = (closed: boolean): readonly DocumentOp[] => [
  add('CYC-A', {
    id: '10000000-0000-4000-8000-000000000001',
    trigger: 'the operator requests a status',
    systemName: 'monitor service',
    systemResponse: 'report the status',
  }),
  add('CYC-B', {
    id: '10000000-0000-4000-8000-000000000002',
    trigger: 'the operator requests a status',
    systemName: 'monitor service',
    systemResponse: 'log the status',
  }),
  add('CYC-C', {
    id: '10000000-0000-4000-8000-000000000003',
    trigger: 'the operator requests a status',
    systemName: 'monitor service',
    systemResponse: 'store the status',
  }),
  { op: 'derive', from: 'CYC-A', to: 'CYC-B' },
  { op: 'derive', from: 'CYC-A', to: 'CYC-C' },
  ...(closed ? [{ op: 'derive', from: 'CYC-C', to: 'CYC-A' } as const] : []),
]

/**
 * Fill and drain under one trigger: two verbs on one object that no table relates, so only the
 * semantic tier's opposition candidate says they may conflict. The fixture's `near` pair is what
 * lets the orthogonal embedder raise it.
 */
const oppositionOps = (r2Response: string): readonly DocumentOp[] => [
  add('OPP-R1', {
    trigger: 'the level sensor reports low',
    systemName: 'pump controller',
    systemResponse: 'fill the tank',
  }),
  add('OPP-R2', {
    trigger: 'the level sensor reports low',
    systemName: 'pump controller',
    systemResponse: r2Response,
  }),
]

/**
 * Fill and drain again, with `OPN-R2` NEGATED: the tank is filled and never drained under one
 * trigger. The semantic tier still proposes the pair (an opposition candidate is polarity-blind),
 * and whether it conflicts turns on what the verbs mean: as contraries the pair is consistent (fill
 * implies not drain), and as synonyms it is a contradiction. So an antonym over the candidate's own
 * verbs discharges the candidate and puts nothing in its place, which is what `antonym` is
 * labelled `weakening` for: a wrong one (two synonyms declared contraries) hides a real conflict.
 */
const oppositionNegatedOps = (r2Response: string): readonly DocumentOp[] => [
  add('OPN-R1', {
    trigger: 'the level sensor reports low',
    systemName: 'pump controller',
    systemResponse: 'fill the tank',
  }),
  add('OPN-R2', {
    trigger: 'the level sensor reports low',
    systemName: 'pump controller',
    systemResponse: r2Response,
    negated: true,
  }),
]

/**
 * Fill and drain under two DIFFERENT triggers, the other route an antonym over a candidate's own
 * verbs takes: the contrary axiom turns the opposition candidate into a conflict under guards the
 * string-atom tier never asserts together, so `open-opposition-candidate` becomes
 * `conditional-conflict-unchecked`. That is a different member of D, and nothing proves it.
 */
const oppositionSplitOps = (r2Response: string): readonly DocumentOp[] => [
  add('OPS-R1', {
    trigger: 'the level sensor reports low',
    systemName: 'pump controller',
    systemResponse: 'fill the tank',
  }),
  add('OPS-R2', {
    trigger: 'the level sensor reports high',
    systemName: 'pump controller',
    systemResponse: r2Response,
  }),
]

/**
 * A numeric conflict beside a BYSTANDER bound in the same cell: `NBY-R1` expires the session after
 * at most 30 minutes, `NBY-R2` after at least 45, and `NBY-R3` after at most 60, which conflicts
 * with neither. The numeric tier reports ONE minimized core per (quantity, base unit, context
 * group) cell, so a bound added under a lower id that conflicts with the culprit AND the bystander
 * can make the reported core a pair disjoint from the seeded one, while the seeded one is still in
 * the document. The ids are fixed, in the order of the CLI reproducer.
 */
const numericBystanderOps = (r2Bound: string): readonly DocumentOp[] => [
  add('NBY-R1', {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    systemName: 'session service',
    systemResponse: 'expire the session after at most 30 minutes',
  }),
  add('NBY-R2', {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    systemName: 'session service',
    systemResponse: `expire the session after at least ${r2Bound} minutes`,
  }),
  add('NBY-R3', {
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    systemName: 'session service',
    systemResponse: 'expire the session after at most 60 minutes',
  }),
]

export const FIXTURES: readonly Fixture[] = [
  {
    id: 'feature-interaction',
    seeded:
      'R1 opens the door when the passenger presses open; R2 forbids opening it while the ' +
      'train is moving. Both hold when a passenger presses open on a moving train.',
    ops: doorOps('open the door', true),
    culprits: ['DOOR-R1', 'DOOR-R2'],
    signal: { demotion: 'conditional-conflict-unchecked', names: ['DOOR-R1', 'DOOR-R2'] },
    control: {
      none:
        'Two requirements under different guards are never co-asserted by the string-atom tier, ' +
        'so any consistent twin is demoted uncovered too. A clean verdict needs one-step ' +
        'realizability (AC-6-2) to DECIDE the pair.',
    },
  },
  {
    id: 'one-trigger-contradiction',
    seeded: 'Under one trigger, R1 records the order and R2 forbids recording it.',
    ops: orderOps('record the order', true),
    culprits: ['ORD-R1', 'ORD-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['ORD-R1', 'ORD-R2'] },
    control: { ops: orderOps('acknowledge the order', false) },
  },
  {
    id: 'contrary-pair',
    seeded:
      'Under one trigger, R1 accepts the claim and R2 rejects it; accept/reject are contraries.',
    ops: contraryOps('reject the claim'),
    culprits: ['CTR-R1', 'CTR-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['CTR-R1', 'CTR-R2'] },
    control: { ops: contraryOps('file the claim') },
  },
  {
    id: 'registered-contrary',
    seeded:
      'Under one trigger, R1 ratifies the claim and R2 vetoes it; ratify/veto are contraries only through the committed antonym.',
    ops: registeredContraryOps('veto the claim'),
    culprits: ['REG-R1', 'REG-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['REG-R1', 'REG-R2'] },
    control: { ops: registeredContraryOps('file the claim') },
  },
  {
    id: 'numeric-conflict',
    seeded: 'R1 expires a session within 30 minutes; R2 not before 45. No duration satisfies both.',
    ops: numericOps('45'),
    culprits: ['NUM-R1', 'NUM-R2'],
    signal: { code: 'FND_NUMERIC_CONTRADICTION', names: ['NUM-R1', 'NUM-R2'] },
    control: {
      none:
        'A numeric pair the solver decides SATISFIABLE is not counted as a comparison: coverage ' +
        'counts shared atoms, and two bounds on one quantity share none, so the consistent twin ' +
        '(at most 30 / at least 20) is demoted uncovered (measured). The obligation ledger ' +
        '(AC-7-1) is what counts a decided numeric obligation.',
    },
  },
  {
    id: 'state-invariant',
    seeded:
      'VALVE-OPEN writes `valve := open` in one step from the initial state; VALVE-SHUT requires `valve = shut` always.',
    ops: valveOps('when valve = shut: valve := open'),
    culprits: ['VALVE-OPEN', 'VALVE-SHUT'],
    signal: { code: 'FND_REACHABILITY_VIOLATED', names: ['VALVE-SHUT'] },
    control: { ops: valveOps('when valve = open: valve := shut') },
  },
  {
    id: 'temporal-conflict',
    seeded: 'R1 never records the event; R2 must eventually record it after a disk write failure.',
    ops: auditOps(true),
    culprits: ['AUD-R1', 'AUD-R2'],
    signal: { code: 'FND_TEMPORAL_CONTRADICTION', names: ['AUD-R1', 'AUD-R2'] },
    control: { ops: auditOps(false) },
  },
  {
    id: 'glossary-bridged',
    seeded:
      'R1 grants access and R2 forbids permitting entry; the glossary commits them as one action.',
    ops: glossaryOps(true),
    culprits: ['GLO-R1', 'GLO-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['GLO-R1', 'GLO-R2'] },
    control: { ops: glossaryOps(false) },
  },
  {
    id: 'term-bridged',
    seeded:
      'R1 charges the purchase order and R2 forbids charging the customer order; the term table commits them as one noun.',
    ops: termOps(true),
    culprits: ['TRM-R1', 'TRM-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['TRM-R1', 'TRM-R2'] },
    control: { ops: termOps(false) },
  },
  {
    id: 'waived-blocking-lint',
    seeded:
      'Under one trigger, R1 records the order and R2 forbids recording it. Both say "in a timely manner" (GTWR_R7_VAGUE, blocking), and each lint is waived over its own requirement, which is what puts the pair in front of the solver.',
    ops: waivedLintOps('record the order in a timely manner', true),
    culprits: ['WBL-R1', 'WBL-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['WBL-R1', 'WBL-R2'] },
    // Ruling R26 (gap G3, S3-035): a waived blocking lint re-admits its requirement but demotes
    // `waived-blocking-lint`, so no twin that keeps the waivers can reach a clean verdict. The
    // consistent twin is kept as {@link WAIVED_LINT_CONTROL_TWIN}, where a test pins exactly that.
    control: {
      none: 'A waived blocking lint never yields verified: true (G3, ruling R26): the consistent twin with the same two waivers demotes waived-blocking-lint and exits 3 under --strict, which is the behavior, not a defect to discriminate.',
    },
  },
  {
    id: 'dangling-target',
    seeded:
      'Under one trigger, R1 records the order and R2 forbids recording it; R1 also carries a derives edge to a requirement that was deleted, so the edge dangles (FND_DANGLING_REFERENCE). The dangling edge is what measures `add` with an explicit `id`, and it makes every run of this fixture exit 1, so the fixture measures directions and not escapes.',
    ops: danglingOps(true, false),
    culprits: ['DNG-R1', 'DNG-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['DNG-R1', 'DNG-R2'] },
    control: { ops: danglingOps(false, true) },
  },
  {
    id: 'overlapping-contrary',
    seeded:
      'Under one trigger, R1 grants access and R2 revokes it; grant/revoke are seed contraries. R3 withholds access under the same trigger, and no table relates withhold to either verb, so R3 is a bystander that measures what a SECOND conflict through R1 does to the reported one.',
    ops: overlapOps('revoke access'),
    culprits: ['OVL-R1', 'OVL-R2'],
    signal: { code: 'FND_CONTRADICTION', names: ['OVL-R1', 'OVL-R2'] },
    control: { ops: overlapOps('audit access') },
  },
  {
    id: 'derives-cycle',
    seeded:
      'CYC-A derives CYC-C and CYC-C derives CYC-A (FND_CYCLE); CYC-A also derives CYC-B, a branch off the cycle.',
    ops: cycleOps(true),
    culprits: ['CYC-A', 'CYC-C'],
    signal: { code: 'FND_CYCLE', names: ['CYC-A', 'CYC-C'] },
    control: { ops: cycleOps(false) },
  },
  {
    id: 'opposition-candidate',
    seeded:
      'Under one trigger, R1 fills the tank and R2 drains it. No table relates fill and drain, so the decide tier sees two unrelated atoms; the semantic tier proposes them as an opposition candidate (FND_OPPOSITION_CANDIDATE) and demotes `open-opposition-candidate`.',
    ops: oppositionOps('drain the tank'),
    culprits: ['OPP-R1', 'OPP-R2'],
    signal: { demotion: 'open-opposition-candidate', names: ['OPP-R1', 'OPP-R2'] },
    control: { ops: oppositionOps('log the level') },
    near: [['fill the tank', 'drain the tank']],
  },
  {
    id: 'opposition-negated',
    seeded:
      'Under one trigger, R1 fills the tank and R2 must never drain it. No table relates fill and drain, so the semantic tier proposes the pair (FND_OPPOSITION_CANDIDATE) and demotes `open-opposition-candidate`; whether the two conflict depends on whether the verbs are contraries or synonyms, which only the author knows.',
    ops: oppositionNegatedOps('drain the tank'),
    culprits: ['OPN-R1', 'OPN-R2'],
    signal: { demotion: 'open-opposition-candidate', names: ['OPN-R1', 'OPN-R2'] },
    control: { ops: oppositionNegatedOps('log the level') },
    near: [['fill the tank', 'drain the tank']],
  },
  {
    id: 'opposition-split',
    seeded:
      'R1 fills the tank when the level sensor reports low, and R2 drains it when the sensor reports high. No table relates fill and drain, so the semantic tier proposes the pair (FND_OPPOSITION_CANDIDATE) and demotes `open-opposition-candidate`.',
    ops: oppositionSplitOps('drain the tank'),
    culprits: ['OPS-R1', 'OPS-R2'],
    signal: { demotion: 'open-opposition-candidate', names: ['OPS-R1', 'OPS-R2'] },
    control: {
      none:
        'Two requirements under different triggers are never co-asserted by the string-atom tier, ' +
        'so any consistent twin is demoted uncovered too. A clean verdict needs one-step ' +
        'realizability (AC-6-2) to DECIDE the pair.',
    },
    near: [['fill the tank', 'drain the tank']],
  },
  {
    id: 'numeric-bystander',
    seeded:
      'R1 expires a session within 30 minutes; R2 not before 45. No duration satisfies both. R3 expires it within 60 minutes, which conflicts with neither, so R3 is a bystander in the same numeric cell. A satisfiable bound is not counted as a comparison, so R3 is demoted uncovered and no run of this fixture is clean: it measures directions, not escapes.',
    ops: numericBystanderOps('45'),
    culprits: ['NBY-R1', 'NBY-R2'],
    signal: { code: 'FND_NUMERIC_CONTRADICTION', names: ['NBY-R1', 'NBY-R2'] },
    control: {
      none:
        'A numeric set the solver decides SATISFIABLE is not counted as a comparison, the ' +
        '`numeric-conflict` reason: the consistent twin (at most 30 / at least 20 / at most 60) ' +
        'is demoted uncovered. The obligation ledger (AC-7-1) is what counts a decided numeric ' +
        'obligation.',
    },
  },
]

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/**
 * The I-1 direction of a move: an op direction, or `run-weakening` for a move that turns a run
 * knob instead of emitting ops.
 *
 * An op move's direction is the JOIN of `OP_DIRECTION` over the verbs it emits
 * ({@link cellDirection}), so relabelling a verb in `ops.ts` relabels every move that uses it
 * and G-D re-measures the claim. A `strengthening` move can lose a member of D only by
 * displacing it with one of the same code, as far as the reporting tier's granularity reaches
 * (`DISPLACEMENT` in the signal classes); every such loss is listed in {@link KNOWN_NONMONOTONE},
 * and a loss that is not a displacement fails the gate outright.
 */
export type Direction = OpDirection | 'run-weakening'

/** What a move hands the runner, before the runner folds or checks anything. */
type Edit =
  | { readonly kind: 'ops'; readonly ops: readonly DocumentOp[] }
  | { readonly kind: 'reparse'; readonly ref: string; readonly sentence: string }
  | { readonly kind: 'run'; readonly knobs: Partial<Knobs>; readonly embedder?: EmbedderChoice }
  /**
   * Waivers written straight into the STORED document, with no fold: the hand-edited channel
   * (trust boundary TB3) no write-time fence runs on. It emits no op, so it has no verb; only
   * `check` can catch it.
   */
  | { readonly kind: 'raw-waivers'; readonly waivers: readonly StoredWaiver[] }
  | { readonly kind: 'inapplicable'; readonly reason: string }

/** One stored waiver, as `doc.waivers` holds it. */
type StoredWaiver = RequirementsDocument['waivers'][number]

/** A code's waivability, as `app/runtime/signal-classes.ts` publishes it; injected by the shard. */
export type WaivabilityOf = (code: string) => 'scoped' | 'never' | undefined

/** One baseline finding, as the report names it: its code and its requirement UUIDs. */
export interface FindingView {
  readonly code: string
  readonly requirementIds: readonly string[]
}

/**
 * Everything a move may read. The baseline codes and findings are what an agent sees in the
 * report; the waivability is the published column beside them.
 */
export interface MoveContext {
  readonly fixture: Fixture
  readonly doc: RequirementsDocument
  readonly baselineCodes: readonly string[]
  readonly baselineFindings: readonly FindingView[]
  readonly waivability: WaivabilityOf
}

export interface Move {
  readonly id: string
  /** The AC-8-2 clause this move realizes, or the op verb it exists to cover. */
  readonly clause: string
  readonly edit: (ctx: MoveContext) => Edit
}

const req = (doc: RequirementsDocument, key: string): Requirement => {
  const found = resolveRef(doc, key)
  if (found === undefined) throw new Error(`gaming fixture has no requirement ${key}`)
  return found
}

/** Slot overrides for a re-add; `undefined` DROPS the slot. */
type Overrides = { readonly [K in keyof AddOp]?: AddOp[K] | undefined }

/** The `add` op that recreates `r` exactly, with `overrides` applied. */
const addOf = (r: Requirement, overrides: Overrides = {}): AddOp => {
  const base: AddOp = {
    op: 'add',
    patternType: r.patternType,
    systemName: r.systemName,
    systemResponse: r.systemResponse,
    negated: r.negated,
    ...(r.key !== undefined ? { key: r.key } : {}),
    ...(r.trigger !== undefined ? { trigger: r.trigger } : {}),
    ...(r.preCondition !== undefined ? { preCondition: r.preCondition } : {}),
  }
  const merged = { ...base, ...overrides }
  // An override of `undefined` means "drop the slot" — omit the key rather than carry it, so
  // the fold never sees an explicit undefined (exactOptionalPropertyTypes).
  return Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined),
  ) as unknown as AddOp
}

/** Delete `r` and re-add it with `overrides`, re-committing its state-model classification. */
const readd = (r: Requirement, overrides: Overrides): readonly DocumentOp[] => {
  const key = r.key ?? r.id
  const expression = r.stateEffect ?? r.stateConstraint
  return [
    { op: 'delete', ref: key },
    addOf(r, overrides),
    ...(r.responseKind !== undefined
      ? [
          {
            op: 'classify' as const,
            ref: key,
            kind: r.responseKind,
            ...(expression !== undefined ? { expression } : {}),
          },
        ]
      : []),
  ]
}

const guardOf = (r: Requirement): { readonly word: string; readonly text: string } | undefined => {
  if (r.preCondition !== undefined) return { word: 'while', text: r.preCondition }
  if (r.trigger !== undefined)
    return { word: r.patternType === 'unwanted-behavior' ? 'if' : 'when', text: r.trigger }
  return undefined
}

/** A requirement's response verb: the first word of its response, lowercased. */
const headOf = (r: Requirement): string =>
  r.systemResponse.trim().split(/\s+/)[0]?.toLowerCase() ?? ''

/** Requirements in key order, so a move that picks one picks the same one on every run. */
const byKey = (x: Requirement, y: Requirement): number =>
  (x.key ?? x.id) < (y.key ?? y.id) ? -1 : 1

const DECOYS: readonly (readonly [string, string])[] = [
  ['DECOY-1', 'emit the report'],
  ['DECOY-2', 'sign the report'],
  ['DECOY-3', 'archive the report'],
]

/**
 * The spellings an `add-equivalent` move writes the first culprit's response in, each under its
 * own id below every fixture's: the same text (`FND_EXACT_DUPLICATE`), and a case variant
 * (`FND_REDUNDANCY`, a bi-implication). Either way the formal tier's lowest-id pick re-keys a
 * verdict on the culprit onto the added requirement, and G-D's identity map is what reads that as
 * the same verdict.
 */
const EQUIVALENT_SPELLINGS = [
  ['exact', (s: string) => s, '00000000-0000-4000-8000-000000000002'],
  [
    'case',
    (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
    '00000000-0000-4000-8000-000000000003',
  ],
] as const

/** Which culprit a one-sided move edits, as it appears in the move id. */
const SIDES = [
  ['first', 0],
  ['second', 1],
] as const

/**
 * A move that edits ONE culprit, registered once per side as `<id>@first` / `<id>@second`.
 * Picking a side would leave the other one unmeasured, and the side is exactly what an agent
 * chooses: whichever deletion or rewrite reaches the clean verdict.
 */
const oneSided = (
  id: string,
  clause: string,
  edit: (target: Requirement, key: string, ctx: MoveContext) => Edit,
): readonly Move[] =>
  SIDES.map(([side, i]) => ({
    id: `${id}@${side}`,
    clause,
    edit: (ctx: MoveContext) => {
      const key = ctx.fixture.culprits[i]
      return edit(req(ctx.doc, key), key, ctx)
    },
  }))

/** Which culprit's response an alias move makes canonical, as it appears in the move id. */
const DIRECTIONS = [
  ['forward', 0, 1],
  ['reverse', 1, 0],
] as const

/**
 * An alias between the two culprits' responses, registered once per direction as
 * `alias-contraries-<table>@forward` (the first culprit's phrase is canonical) and `@reverse`.
 * An alias only identifies two phrases, so under I-1 neither direction should remove a
 * finding. But the table is a one-pass substitution, not an equivalence, so which phrase is
 * canonical can decide what the other phrases in the document rewrite to, and that choice is
 * the agent's. The reason is the same as {@link oneSided}'s: register one direction, and the
 * other goes unmeasured.
 */
const aliasBothWays = (
  table: 'glossary' | 'term',
  clause: string,
  committed: (doc: RequirementsDocument, canonical: string, alias: string) => boolean,
): readonly Move[] =>
  DIRECTIONS.map(([dir, from, to]) => ({
    id: `alias-contraries-${table}@${dir}`,
    clause,
    edit: ({ fixture, doc }: MoveContext): Edit => {
      const canonical = req(doc, fixture.culprits[from]).systemResponse
      const alias = req(doc, fixture.culprits[to]).systemResponse
      if (canonical === alias)
        return {
          kind: 'inapplicable',
          reason: 'the two culprits already share one response phrase',
        }
      if (committed(doc, canonical, alias))
        return { kind: 'inapplicable', reason: `the ${table} alias is already committed` }
      return { kind: 'ops', ops: [{ op: table, canonical, alias }] }
    },
  }))

/**
 * Where a new term alias sits against a phrase the table already reads, as it appears in the
 * move id `term-over-phrase@<shape>`. `pre` is every word before that phrase in the culprit
 * response that says it, so each shape is a phrase that really occurs in the document. The
 * whole prefix rather than one word, because `normalize` strips a LEADING article: an alias
 * `the customer` is keyed `customer`, which sits inside the committed alias instead of
 * straddling it.
 */
const TERM_OVERLAPS = [
  ['inside-canonical', 'canonical', (phrase: readonly string[]) => phrase.slice(0, 1)],
  ['equal-canonical', 'canonical', (phrase: readonly string[]) => phrase],
  [
    'around-canonical',
    'canonical',
    (phrase: readonly string[], pre: readonly string[]) => [...pre, ...phrase],
  ],
  [
    'straddle-canonical',
    'canonical',
    (phrase: readonly string[], pre: readonly string[]) => [...pre, ...phrase.slice(0, 1)],
  ],
  [
    'straddle-alias',
    'alias',
    (phrase: readonly string[], pre: readonly string[]) => [...pre, ...phrase.slice(0, 1)],
  ],
] as const

/** The fresh canonical every `term-over-phrase` move points at: a noun no fixture uses. */
const FRESH_TERM = 'ledger entry'

/**
 * A NEW term entry whose alias overlaps a phrase of the culprits' committed term, one move per
 * {@link TERM_OVERLAPS} shape. An alias only identifies phrases, so under I-1 it cannot remove a
 * finding. But the table is a one-pass, longest-first substitution over whole tokens: an alias
 * that overlaps a committed phrase rewrites that phrase's occurrences while the committed
 * phrase's own aliases still rewrite to it, so two phrases the table says are one noun come
 * out different, and a conflict that rests on them is lost. `alias-contraries-term@reverse`
 * reaches the same split from the canonical's side, which is the half `apply` refused first.
 */
const termOverPhrase = (): readonly Move[] =>
  TERM_OVERLAPS.map(([shape, side, aliasOf]) => ({
    id: `term-over-phrase@${shape}`,
    clause: 'alias a phrase that overlaps a committed term (term table)',
    edit: ({ fixture, doc }: MoveContext): Edit => {
      const entry = doc.terms[0]
      const committed = side === 'canonical' ? entry?.canonical : entry?.aliases[0]
      if (committed === undefined)
        return { kind: 'inapplicable', reason: 'the fixture commits no term' }
      const words = (s: string) =>
        s
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 0)
      const phrase = words(committed)
      // The words before the committed phrase in the culprit response that says it.
      const pre = fixture.culprits
        .map((k) => words(req(doc, k).systemResponse))
        .map((ws) => ws.slice(0, Math.max(0, ws.indexOf(phrase[0] ?? ''))))
        .find((ws) => ws.length > 0)
      if (pre === undefined)
        return { kind: 'inapplicable', reason: `no culprit response says the committed ${side}` }
      return {
        kind: 'ops',
        ops: [{ op: 'term', canonical: FRESH_TERM, alias: aliasOf(phrase, pre).join(' ') }],
      }
    },
  }))

/**
 * What the glossary alias of a `glossary-over-term` move is, against the committed term alias
 * it covers: the alias itself (`equal`), or the culprit response that says it (`containing`).
 * The glossary is a whole-body lookup, so the response is the widest phrase that really occurs.
 */
const GLOSSARY_OVER_TERM_SHAPES = [
  ['equal', (alias: string, _response: string) => alias],
  ['containing', (_alias: string, response: string) => response],
] as const

/**
 * The order the two tables are written in, as it appears in the move id. `term-then-glossary`
 * adds the glossary entry to the fixture's committed term; `glossary-then-term` drops that term,
 * writes the glossary entry, and commits the term again, so a fence on EITHER op is measured.
 */
const GLOSSARY_OVER_TERM_ORDERS = ['term-then-glossary', 'glossary-then-term'] as const

/**
 * A glossary alias equal to, or containing, a phrase the committed term rewrites, pointed at a
 * fresh canonical — one move per {@link GLOSSARY_OVER_TERM_SHAPES} shape and
 * {@link GLOSSARY_OVER_TERM_ORDERS} order. The glossary lookup runs BEFORE term substitution, so
 * the response that says the term alias is rewritten to the fresh canonical and never reaches
 * the term table: the two phrases the term calls one noun come out as two atoms. The term
 * table's own overlap fence ({@link termOverPhrase}) cannot see it, because the overlapping
 * phrase lives in the other table.
 */
/**
 * Which phrase of the committed term the glossary alias is written over: its ALIAS (`customer
 * order`) or its CANONICAL (`purchase order`). Both are phrases the term rewrites onto one noun,
 * so a cross-table fence that compared a glossary alias against term aliases alone would close
 * the alias cells and leave the canonical side escaping unmeasured. The alias side keeps the
 * original move ids; the canonical side is suffixed `-canonical`.
 */
const GLOSSARY_OVER_TERM_SIDES = [
  [
    'alias',
    (entry: { readonly canonical: string; readonly aliases: readonly string[] }) =>
      entry.aliases[0],
  ],
  [
    'canonical',
    (entry: { readonly canonical: string; readonly aliases: readonly string[] }) => entry.canonical,
  ],
] as const

const glossaryOverTerm = (): readonly Move[] =>
  GLOSSARY_OVER_TERM_SIDES.flatMap(([side, phraseOf]) =>
    GLOSSARY_OVER_TERM_SHAPES.flatMap(([shape, aliasOf]) =>
      GLOSSARY_OVER_TERM_ORDERS.map((order) => ({
        id: `glossary-over-term@${shape}${side === 'canonical' ? '-canonical' : ''}/${order}`,
        clause: 'alias a phrase a committed term rewrites (glossary over term table)',
        edit: ({ fixture, doc }: MoveContext): Edit => {
          const entry = doc.terms[0]
          const termAlias = entry?.aliases[0]
          const phrase = entry === undefined ? undefined : phraseOf(entry)
          if (entry === undefined || termAlias === undefined || phrase === undefined)
            return { kind: 'inapplicable', reason: 'the fixture commits no term' }
          const response = fixture.culprits
            .map((k) => req(doc, k).systemResponse)
            .find((s) => s.toLowerCase().split(/\s+/).join(' ').includes(phrase.toLowerCase()))
          if (response === undefined)
            return {
              kind: 'inapplicable',
              reason: `no culprit response says the committed ${side}`,
            }
          const glossary: DocumentOp = {
            op: 'glossary',
            canonical: FRESH_TERM,
            alias: aliasOf(phrase, response),
          }
          const term = { canonical: entry.canonical, alias: termAlias }
          return {
            kind: 'ops',
            ops:
              order === 'term-then-glossary'
                ? [glossary]
                : [{ op: 'unterm', ...term }, glossary, { op: 'term', ...term }],
          }
        },
      })),
    ),
  )

const WAIVE_REASON = 'accepted for this release'

/**
 * The scoped waivers of every never-class baseline finding: its code over its exact requirement
 * ids and their current content hash, one per distinct (code, id set). Measured ONLY on fixtures
 * whose seeded finding is never-class: a scoped, reviewed waiver of a SCOPED-class finding
 * (`derives-cycle`'s FND_CYCLE) is the designed discharge, not an escape (ruling R45), and is
 * pinned by its own positive test in `gaming-waivers.test.ts`.
 */
const scopedNeverWaivers = (
  ctx: MoveContext,
):
  | {
      readonly waivers: readonly {
        readonly code: string
        readonly ids: readonly string[]
        readonly contentHash: string
      }[]
    }
  | { readonly kind: 'inapplicable'; readonly reason: string } => {
  const { fixture, doc, baselineFindings, waivability } = ctx
  if ('code' in fixture.signal && waivability(fixture.signal.code) === 'scoped')
    return {
      kind: 'inapplicable',
      reason: `the seeded finding ${fixture.signal.code} is scoped-class, so a scoped waive of it is a designed discharge`,
    }
  const seen = new Set<string>()
  const waivers = baselineFindings.flatMap((f) => {
    if (waivability(f.code) !== 'never' || f.requirementIds.length === 0) return []
    const ids = [...new Set(f.requirementIds)].sort()
    const key = `${f.code}|${ids.join(',')}`
    const contentHash = requirementsContentHash(doc, ids)
    if (seen.has(key) || contentHash === undefined) return []
    seen.add(key)
    return [{ code: f.code, ids, contentHash }]
  })
  return waivers.length === 0
    ? {
        kind: 'inapplicable',
        reason: 'the baseline report carries no never-class finding that names a requirement',
      }
    : { waivers }
}

export const MOVES: readonly Move[] = [
  ...oneSided('rename-system', 'rename a system', (r, key) => ({
    kind: 'ops',
    ops: [{ op: 'update', ref: key, attr: 'systemName', value: `${r.systemName} unit` }],
  })),
  {
    id: 'split-system',
    clause: 'split a system into two parents (two names; part-of parents need AC-4-1)',
    edit: ({ fixture, doc }) => {
      const [ka, kb] = fixture.culprits
      return {
        kind: 'ops',
        ops: [
          { op: 'update', ref: ka, attr: 'systemName', value: `front ${req(doc, ka).systemName}` },
          { op: 'update', ref: kb, attr: 'systemName', value: `rear ${req(doc, kb).systemName}` },
        ],
      }
    },
  },
  ...aliasBothWays('glossary', 'alias two contraries (glossary)', (doc, a, b) =>
    doc.glossary.some((g) => g.canonical === a && g.aliases.includes(b)),
  ),
  ...aliasBothWays('term', 'alias two contraries (term table)', (doc, a, b) =>
    doc.terms.some((t) => t.canonical === a && t.aliases.includes(b)),
  ),
  ...termOverPhrase(),
  ...glossaryOverTerm(),
  {
    id: 'waive-by-code',
    clause: 'waive by code',
    // Every code the baseline report shows, document-wide: the strongest form of the move,
    // and the one an agent that reads the report and wants a green run would type.
    edit: ({ baselineCodes }) =>
      baselineCodes.length === 0
        ? { kind: 'inapplicable', reason: 'the baseline report carries no finding code to waive' }
        : {
            kind: 'ops',
            ops: baselineCodes.map((code) => ({
              op: 'waive' as const,
              code,
              reason: WAIVE_REASON,
            })),
          },
  },
  {
    id: 'waive-scoped-never',
    clause:
      'op coverage: a scoped waive of each never-class baseline finding over its exact ids and current hash',
    // The strongest form of the scoped move: every never-class finding the report shows, over the
    // exact requirement ids it names and the hash of their current text — what an agent types
    // once a code-only waive is refused and the refusal says to name the requirements.
    edit: (ctx) => {
      const scoped = scopedNeverWaivers(ctx)
      if ('kind' in scoped) return scoped
      return {
        kind: 'ops',
        ops: scoped.waivers.map((w) => ({
          op: 'waive' as const,
          code: w.code,
          refs: [...w.ids],
          contentHash: w.contentHash,
          reason: WAIVE_REASON,
        })),
      }
    },
  },
  {
    id: 'waive-raw',
    clause:
      'hand-edited waivers: the same waivers plus a code-only one per never-class baseline code (idless ones included), written into the stored document with no fold',
    // The channel no write-time fence runs on (TB3): a refusal at `waive` closes nothing if
    // `check` still honors the same waiver written into the JSON by hand.
    edit: (ctx) => {
      const scoped = scopedNeverWaivers(ctx)
      // A code-only probe per never-class baseline code, the idless ones included (R5, S3-049):
      // a disclosure that names no requirement (FND_REACHABILITY_NOT_CHECKED,
      // FND_NO_PAIRS_CHECKED) has no scoped waiver to copy, but a hand edit can still name it.
      const codes = [
        ...new Set(
          ctx.baselineFindings
            .filter((f) => ctx.waivability(f.code) === 'never')
            .map((f) => f.code),
        ),
      ].sort()
      if ('kind' in scoped && (scoped.reason.includes('scoped-class') || codes.length === 0))
        return scoped
      const waivers = 'kind' in scoped ? [] : scoped.waivers
      return {
        kind: 'raw-waivers',
        waivers: [
          ...waivers.map(
            (w): StoredWaiver => ({
              code: w.code,
              requirementIds: [...w.ids],
              contentHash: w.contentHash,
              reason: WAIVE_REASON,
            }),
          ),
          ...codes.map((code): StoredWaiver => ({ code, reason: WAIVE_REASON })),
        ],
      }
    },
  },
  {
    id: 'unwaive',
    clause: 'op coverage: remove the committed waivers',
    edit: ({ doc }) =>
      doc.waivers.length === 0
        ? { kind: 'inapplicable', reason: 'the fixture commits no waiver' }
        : {
            kind: 'ops',
            ops: doc.waivers.map((w) => ({
              op: 'unwaive' as const,
              code: w.code,
              ...(w.requirementId !== undefined ? { ref: w.requirementId } : {}),
              ...(w.requirementIds !== undefined ? { refs: [...w.requirementIds] } : {}),
            })),
          },
  },
  ...oneSided('delete-requirement', 'delete a requirement', (_r, key) => ({
    kind: 'ops',
    ops: [{ op: 'delete', ref: key }],
  })),
  ...oneSided('flip-negated', 'flip `negated`', (r) => ({
    kind: 'ops',
    ops: readd(r, { negated: !r.negated }),
  })),
  ...oneSided('condition-into-response', 'move a condition into the response text', (r) => {
    const guard = guardOf(r)
    if (guard === undefined)
      return { kind: 'inapplicable', reason: 'this culprit carries no condition' }
    return {
      kind: 'ops',
      ops: readd(r, {
        patternType: 'ubiquitous',
        trigger: undefined,
        preCondition: undefined,
        systemResponse: `${r.systemResponse} ${guard.word} ${guard.text}`,
      }),
    }
  }),
  {
    id: 'add-decoys',
    clause: 'add decoy requirements',
    edit: ({ fixture, doc }) => {
      const a = req(doc, fixture.culprits[0])
      return {
        kind: 'ops',
        ops: DECOYS.map(([key, systemResponse]) =>
          add(key, {
            trigger: 'the auditor requests the report',
            systemName: a.systemName,
            systemResponse,
          }),
        ),
      }
    },
  },
  ...oneSided(
    'shall-to-should',
    'change `shall` to `should` (re-parse the edited sentence)',
    (r, key) => ({
      kind: 'reparse',
      ref: key,
      sentence: r.sentence.replace(/\bshall\b/, 'should'),
    }),
  ),
  {
    id: 'link-culprits',
    clause: 'op coverage: trace edges between the two culprits',
    edit: ({ fixture }) => {
      const [to, from] = fixture.culprits
      return {
        kind: 'ops',
        ops: [
          { op: 'derive', from, to },
          { op: 'satisfy', from, to },
          { op: 'verify', from, to },
          { op: 'refine', from, to },
        ],
      }
    },
  },
  {
    id: 'antonym-over-candidate',
    clause:
      "op coverage (`antonym`): commit the two culprits' own verbs as contraries, over the pair they head",
    // What an agent types to discharge an opposition candidate: the finding's own suggestion.
    edit: ({ fixture, doc }) => {
      const [a, b] = fixture.culprits.map((k) => headOf(req(doc, k)))
      if (a === undefined || b === undefined || a === b)
        return { kind: 'inapplicable', reason: 'the two culprits share one verb' }
      if (doc.antonyms.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)))
        return { kind: 'inapplicable', reason: 'the antonym is already committed' }
      return { kind: 'ops', ops: [{ op: 'antonym', a, b }] }
    },
  },
  {
    id: 'add-bound-past-bystander',
    clause:
      "op coverage (`add`): add a lower bound past every upper bound in the first culprit's numeric cell, under the lowest id",
    // The added bound conflicts with the first culprit AND with a bystander's upper bound, so the
    // cell holds a second core disjoint from the seeded one. Its id sorts first in the solver order.
    edit: ({ fixture, doc }) => {
      const a = req(doc, fixture.culprits[0])
      const upper = /\bat most (\d+) (\w+)$/
      const own = upper.exec(a.systemResponse)
      if (own === null)
        return { kind: 'inapplicable', reason: 'the first culprit states no upper bound' }
      const culpritIds = new Set(fixture.culprits.map((k) => req(doc, k).id))
      const uppers = Object.values(doc.requirements).flatMap((r) => {
        const m = r.systemName === a.systemName ? upper.exec(r.systemResponse) : null
        return m !== null && m[2] === own[2] ? [{ id: r.id, value: Number(m[1]) }] : []
      })
      if (!uppers.some((u) => !culpritIds.has(u.id)))
        return {
          kind: 'inapplicable',
          reason: "no bystander bounds the first culprit's quantity from above",
        }
      const past = Math.max(...uppers.map((u) => u.value)) + 30
      return {
        kind: 'ops',
        ops: [
          addOf(a, {
            key: 'BND-1',
            id: '00000000-0000-4000-8000-000000000009',
            systemResponse: a.systemResponse.replace(upper, `at least ${past} ${own[2]}`),
          }),
        ],
      }
    },
  },
  {
    id: 'add-bystander-negation',
    clause:
      'op coverage (`add`): add the ubiquitous negation of a bystander, a second conflict disjoint from the seeded one, under the lowest id',
    edit: ({ fixture, doc }) => {
      const culprits = fixture.culprits.map((k) => req(doc, k))
      const system = culprits[0]?.systemName
      const bystander = Object.values(doc.requirements)
        .filter(
          (r) =>
            r.systemName === system &&
            culprits.every((c) => c.id !== r.id && c.systemResponse !== r.systemResponse),
        )
        .sort(byKey)[0]
      if (bystander === undefined)
        return {
          kind: 'inapplicable',
          reason: "no other requirement shares the culprits' system with a response of its own",
        }
      return {
        kind: 'ops',
        ops: [
          addOf(bystander, {
            key: 'NEG-BY',
            id: '00000000-0000-4000-8000-000000000004',
            patternType: 'ubiquitous',
            trigger: undefined,
            preCondition: undefined,
            negated: !bystander.negated,
          }),
        ],
      }
    },
  },
  {
    id: 'add-negation',
    clause:
      'op coverage (`add`): add the negation of the first culprit, a second conflict through it',
    // The lowest id in any fixture, so the added requirement sorts first in the solver order: the
    // formal tier reports one minimal core per overlapping set, and the id order picks it.
    edit: ({ fixture, doc }) => ({
      kind: 'ops',
      ops: [
        addOf(req(doc, fixture.culprits[0]), {
          key: 'NEG-1',
          id: '00000000-0000-4000-8000-000000000001',
          negated: !req(doc, fixture.culprits[0]).negated,
        }),
      ],
    }),
  },
  ...EQUIVALENT_SPELLINGS.map(
    ([shape, spell, id]): Move => ({
      id: `add-equivalent@${shape}`,
      clause:
        'op coverage (`add`): add a requirement equivalent to the first culprit, under a lower id',
      edit: ({ fixture, doc }) => {
        const a = req(doc, fixture.culprits[0])
        return {
          kind: 'ops',
          ops: [addOf(a, { key: `EQV-${shape}`, id, systemResponse: spell(a.systemResponse) })],
        }
      },
    }),
  ),
  {
    id: 'branch-into-cycle',
    clause: 'op coverage (`derive`): an edge from a branch off a derives cycle back into the cycle',
    // A branch is a requirement with a derives edge IN from a node that has a second derives
    // target, and no derives edge OUT. The edge goes from the branch to that second target.
    edit: ({ doc }) => {
      for (const parent of Object.values(doc.requirements).sort(byKey)) {
        const targets = parent.derives.filter((t) => doc.requirements[t] !== undefined)
        for (const t of targets) {
          const branch = doc.requirements[t]
          const other = targets.find((u) => u !== t)
          if (branch === undefined || other === undefined || branch.derives.length > 0) continue
          const to = doc.requirements[other]
          if (to === undefined) continue
          return {
            kind: 'ops',
            ops: [{ op: 'derive', from: branch.key ?? branch.id, to: to.key ?? to.id }],
          }
        }
      }
      return {
        kind: 'inapplicable',
        reason: 'no requirement derives two others, one of which derives nothing',
      }
    },
  },
  {
    id: 'supply-dangling-target',
    clause:
      'op coverage (`add` with an explicit `id`): re-add a requirement under a dangling edge target',
    edit: ({ fixture, doc }) => {
      const missing = [
        ...new Set(
          Object.values(doc.requirements).flatMap((r) =>
            RELATIONS.flatMap((rel) => r[rel].filter((t) => doc.requirements[t] === undefined)),
          ),
        ),
      ].sort()
      if (missing.length === 0)
        return { kind: 'inapplicable', reason: 'no edge in the fixture dangles' }
      const a = req(doc, fixture.culprits[0])
      return {
        kind: 'ops',
        ops: missing.map((id, i) => ({
          ...add(`SUPPLIED-${i + 1}`, {
            ...(a.trigger !== undefined ? { trigger: a.trigger } : {}),
            systemName: a.systemName,
            systemResponse: 'archive the order',
          }),
          id,
        })),
      }
    },
  },
  {
    id: 'unglossary',
    clause: 'op coverage: drop the committed glossary alias the conflict rests on',
    edit: ({ doc }) =>
      doc.glossary.length === 0
        ? { kind: 'inapplicable', reason: 'the fixture commits no glossary alias' }
        : {
            kind: 'ops',
            ops: doc.glossary.flatMap((g) =>
              g.aliases.map((alias) => ({
                op: 'unglossary' as const,
                canonical: g.canonical,
                alias,
              })),
            ),
          },
  },
  {
    id: 'unantonym',
    clause: 'op coverage: drop the committed contrary axiom the conflict rests on',
    edit: ({ doc }) =>
      doc.antonyms.length === 0
        ? { kind: 'inapplicable', reason: 'the fixture commits no antonym' }
        : {
            kind: 'ops',
            ops: doc.antonyms.map((p) => ({ op: 'unantonym' as const, a: p.a, b: p.b })),
          },
  },
  {
    id: 'unterm',
    clause: 'op coverage: drop the committed term the conflict rests on',
    edit: ({ doc }) =>
      doc.terms.length === 0
        ? { kind: 'inapplicable', reason: 'the fixture commits no term' }
        : {
            kind: 'ops',
            ops: doc.terms.flatMap((t) =>
              t.aliases.map((alias) => ({ op: 'unterm' as const, canonical: t.canonical, alias })),
            ),
          },
  },
  {
    id: 'declassify-constraint',
    clause: 'op coverage: clear the classification of the violated constraint',
    edit: ({ doc }) => {
      const constraint = Object.values(doc.requirements).find(
        (r) => r.responseKind === 'constraint',
      )
      return constraint === undefined
        ? { kind: 'inapplicable', reason: 'the fixture classifies no constraint' }
        : {
            kind: 'ops',
            ops: [{ op: 'classify', ref: constraint.key ?? constraint.id, kind: null }],
          }
    },
  },
  {
    id: 'rebind-effect',
    clause: 'op coverage (`update`): rewrite the offending effect so it writes nothing forbidden',
    edit: ({ doc }) => {
      const effect = Object.values(doc.requirements).find((r) => r.responseKind === 'effect')
      return effect === undefined
        ? { kind: 'inapplicable', reason: 'the fixture classifies no effect' }
        : {
            kind: 'ops',
            ops: [
              {
                op: 'update',
                ref: effect.key ?? effect.id,
                attr: 'stateEffect',
                value: 'when valve = open: valve := open',
              },
            ],
          }
    },
  },
  {
    id: 'vacuous-initial',
    clause:
      'op coverage (`state-initial`): an unsatisfiable initial predicate, so no state is reachable',
    edit: ({ doc }) =>
      doc.stateModel.variables.length === 0
        ? { kind: 'inapplicable', reason: 'the fixture declares no state model' }
        : { kind: 'ops', ops: [{ op: 'state-initial', predicate: 'false' }] },
  },
  {
    id: 'release-frame',
    clause: 'op coverage: re-declare a state variable with its frame released',
    edit: ({ doc }) => {
      const [variable] = doc.stateModel.variables
      if (variable === undefined)
        return { kind: 'inapplicable', reason: 'the fixture declares no state model' }
      return {
        kind: 'ops',
        ops: [
          {
            op: 'state',
            name: variable.name,
            type: variable.type,
            frame: 'volatile',
            ...(variable.type === 'enum' ? { domain: [...variable.domain] } : {}),
            ...(variable.initial !== undefined ? { initial: variable.initial } : {}),
          },
        ],
      }
    },
  },
  {
    id: 'unstate',
    clause: 'op coverage: remove the state variable the constraint reads',
    edit: ({ doc }) => {
      const [variable] = doc.stateModel.variables
      return variable === undefined
        ? { kind: 'inapplicable', reason: 'the fixture declares no state model' }
        : { kind: 'ops', ops: [{ op: 'unstate', name: variable.name }] }
    },
  },
  {
    id: 'embedding-stub',
    clause: 'run with the embedding stub',
    edit: () => ({ kind: 'run', knobs: {}, embedder: 'stub-env' }),
  },
  {
    id: 'semantic-off',
    clause: 'run with `--semantic=false`',
    edit: () => ({ kind: 'run', knobs: { semantic: false } }),
  },
  {
    id: 'solver-budget-1ms',
    clause: 'run with a one-millisecond budget (`--solver-budget-ms 1`)',
    edit: () => ({ kind: 'run', knobs: { solverBudgetMs: 1 } }),
  },
  {
    id: 'solver-timeout-1ms',
    clause: 'run with a one-millisecond budget (`--timeout-ms 1`)',
    edit: () => ({ kind: 'run', knobs: { timeoutMs: 1 } }),
  },
  {
    id: 'temporal-bound-1',
    clause: 'run with `--temporal-bound 1`',
    edit: () => ({ kind: 'run', knobs: { temporalBound: 1 } }),
  },
  {
    id: 'temporal-off',
    clause: 'run with the temporal tier off (`--temporal-bound 0`, the default)',
    edit: () => ({ kind: 'run', knobs: { temporalBound: 0 } }),
  },
]

/**
 * Moves whose outcome depends on wall-clock time. A 1 ms bound may or may not cut a given
 * query off, so their DETAIL is not snapshotted — only the gate claim, which holds either way
 * (a query that finishes finds the defect; one that does not demotes).
 */
const TIMING_SENSITIVE: ReadonlySet<string> = new Set(['solver-budget-1ms', 'solver-timeout-1ms'])

/**
 * An AC-8-2 move whose target does not exist on today's document format.
 *
 * Its direction is TYPED, unlike a registered move's, because it emits no op yet to derive one
 * from. The story that registers the move deletes the field along with the row.
 */
export interface PendingMove {
  readonly id: string
  readonly clause: string
  readonly direction: Direction
  /** The AC that introduces the target, and so the story that registers the move. */
  readonly needs: string
}

export const NOT_APPLICABLE_YET: readonly PendingMove[] = [
  { id: 'edit-intent', clause: 'edit `intent`', direction: 'weakening', needs: 'AC-5-2' },
  { id: 'edit-policy', clause: 'edit `policy`', direction: 'weakening', needs: 'AC-5-2' },
  {
    id: 'narrow-exceeds-conflict',
    clause: 'submit a `narrow` whose carve-out exceeds the conflict region',
    direction: 'weakening',
    needs: 'AC-5-3',
  },
  {
    id: 'yield-against-policy',
    clause: 'yield against the policy order',
    direction: 'weakening',
    needs: 'AC-5-3',
  },
  {
    id: 'untraced-assumption',
    clause: 'add an untraced environment assumption',
    direction: 'weakening',
    needs: 'AC-5-5',
  },
  {
    id: 'weakening-derived',
    clause: 'add a `derived` requirement that weakens',
    direction: 'weakening',
    needs: 'AC-5-2',
  },
]

/**
 * AC-8-2's list, clause by clause, as the spec words it, mapped to the registered or pending
 * moves that realize it. `gaming.test.ts` checks every clause against the spec text and every
 * target against the registries, so the list here cannot drift from the AC it implements.
 */
export const AC_8_2: readonly { readonly clause: string; readonly moves: readonly string[] }[] = [
  { clause: 'rename a system', moves: ['rename-system@first', 'rename-system@second'] },
  {
    clause: 'alias two contraries',
    moves: [
      'alias-contraries-glossary@forward',
      'alias-contraries-glossary@reverse',
      'alias-contraries-term@forward',
      'alias-contraries-term@reverse',
    ],
  },
  { clause: 'waive by code', moves: ['waive-by-code'] },
  {
    clause: 'delete a requirement',
    moves: ['delete-requirement@first', 'delete-requirement@second'],
  },
  { clause: 'flip `negated`', moves: ['flip-negated@first', 'flip-negated@second'] },
  {
    clause: 'move a condition into the response text',
    moves: ['condition-into-response@first', 'condition-into-response@second'],
  },
  { clause: 'add decoy requirements', moves: ['add-decoys'] },
  {
    clause: 'change `shall` to `should`',
    moves: ['shall-to-should@first', 'shall-to-should@second'],
  },
  { clause: 'split a system into two parents', moves: ['split-system'] },
  { clause: 'edit `intent`', moves: ['edit-intent'] },
  { clause: 'edit `policy`', moves: ['edit-policy'] },
  {
    clause: 'submit a `narrow` whose carve-out exceeds the conflict region',
    moves: ['narrow-exceeds-conflict'],
  },
  { clause: 'yield against the policy order', moves: ['yield-against-policy'] },
  { clause: 'add an untraced environment assumption', moves: ['untraced-assumption'] },
  { clause: 'add a `derived` requirement that weakens', moves: ['weakening-derived'] },
  { clause: 'run with the embedding stub', moves: ['embedding-stub'] },
  { clause: '`--semantic=false`', moves: ['semantic-off'] },
  { clause: 'a one-millisecond budget', moves: ['solver-budget-1ms', 'solver-timeout-1ms'] },
  { clause: '`--temporal-bound 1`', moves: ['temporal-bound-1'] },
]

export type MoveStatus = 'registered-caught' | 'registered-escapes-known-gap' | 'not-applicable-yet'

/**
 * The direction of one move on one fixture: the join of its emitted verbs' `OP_DIRECTION`,
 * `run-weakening` for a run-setting move, and `undefined` when the move does not apply.
 */
export const cellDirection = (edit: Edit, ctx: MoveContext): Direction | undefined =>
  edit.kind === 'run'
    ? 'run-weakening'
    : edit.kind === 'raw-waivers'
      ? // A hand-written waiver emits no op, but it does what `waive` does: the verb's label.
        OP_DIRECTION.waive.direction
      : joinDirections(editVerbs(edit, ctx).map((verb) => OP_DIRECTION[verb].direction))

/**
 * The code a static (no-`check`) context gives the baseline: which code a waive move names does
 * not change which verb it emits, so a placeholder never-class finding over a fixture's first
 * requirement is enough to derive a waive move's direction.
 */
const PLACEHOLDER_CODE = 'FND_PLACEHOLDER'

const placeholderContext = (fixture: Fixture, doc: RequirementsDocument): MoveContext => {
  const first = Object.keys(doc.requirements).sort()[0]
  return {
    fixture,
    doc,
    baselineCodes: [PLACEHOLDER_CODE],
    baselineFindings:
      first === undefined ? [] : [{ code: PLACEHOLDER_CODE, requirementIds: [first] }],
    waivability: (code) => (code === PLACEHOLDER_CODE ? 'never' : undefined),
  }
}

/**
 * A registered move's direction: the join of {@link cellDirection} over every fixture it
 * applies to. A move whose verbs depend on the fixture (a re-add that re-classifies only a
 * classified requirement) takes the highest direction it reaches anywhere.
 */
export const moveDirection = (move: Move, options: MutateOptions): Direction => {
  const directions = FIXTURES.flatMap((fixture) => {
    const ctx = placeholderContext(fixture, buildDoc(fixture.ops, options))
    const d = cellDirection(move.edit(ctx), ctx)
    return d === undefined ? [] : [d]
  })
  if (directions.includes('run-weakening')) {
    if (directions.some((d) => d !== 'run-weakening'))
      throw new Error(`${move.id} both turns a run knob and emits ops`)
    return 'run-weakening'
  }
  const joined = joinDirections(directions.filter((d): d is OpDirection => d !== 'run-weakening'))
  if (joined === undefined)
    throw new Error(`${move.id} applies to no fixture, so it has no direction`)
  return joined
}

/**
 * Every move's standing, derived from the tables — never stated. A registered move is caught
 * unless {@link KNOWN_ESCAPES} lists it, and the shards hold that table exact, so this report
 * is as true as the last green run. Its direction is derived from what it emits, under
 * `apply`'s own mutate options.
 */
export const moveStatuses = (
  options: MutateOptions,
): readonly {
  readonly id: string
  readonly direction: Direction
  readonly status: MoveStatus
  /** The closing ACs for an escaping move; the introducing AC for a pending one. */
  readonly acs: readonly string[]
}[] => [
  ...MOVES.map((m) => {
    const rows = KNOWN_ESCAPES.filter((k) => k.move === m.id)
    return {
      id: m.id,
      direction: moveDirection(m, options),
      status:
        rows.length > 0
          ? ('registered-escapes-known-gap' as const)
          : ('registered-caught' as const),
      acs: [...new Set(rows.map((r) => r.closedBy))],
    }
  }),
  ...NOT_APPLICABLE_YET.map((p) => ({
    id: p.id,
    direction: p.direction,
    status: 'not-applicable-yet' as const,
    acs: [p.needs],
  })),
]

// ---------------------------------------------------------------------------
// The escape table
// ---------------------------------------------------------------------------

/** One row per fixture for a move that escapes on several, all closed by the same AC. */
const escapes = (
  move: string,
  closedBy: string,
  fixtures: readonly string[],
  why: string,
): readonly KnownEscape[] => fixtures.map((fixture) => ({ fixture, move, closedBy, why }))

export interface KnownEscape {
  readonly fixture: string
  readonly move: string
  /**
   * The AC whose landing turns this row red — at which point the row is deleted. Either the bare
   * id (`AC-5-2`) or led by the plan slice that lands it and followed by what closes it
   * (`S4 / AC-4-2 (cross-table fence + check twin)`).
   */
  readonly closedBy: string
  readonly why: string
}

/**
 * Every (fixture, move) pair that reaches a clean verdict today. EXACT: a pair missing from
 * here fails the gate, and so does a row whose pair no longer escapes (I-5).
 */
export const KNOWN_ESCAPES: readonly KnownEscape[] = [
  ...escapes(
    'delete-requirement@first',
    'AC-5-2',
    [
      'feature-interaction',
      'one-trigger-contradiction',
      'contrary-pair',
      'registered-contrary',
      'numeric-conflict',
      'temporal-conflict',
      'glossary-bridged',
      'term-bridged',
      'waived-blocking-lint',
      'dangling-target',
      'overlapping-contrary',
      'opposition-candidate',
      'opposition-negated',
      'opposition-split',
    ],
    'Deleting one side of a conflict leaves a consistent document. Nothing records that the deleted requirement stood for an intent item, so its disappearance is not a finding; `FND_INTENT_UNCOVERED` makes it one. On temporal-conflict this side escapes where the other does not: deleting `AUD-R1` leaves `AUD-R2` and `AUD-R3`, which share a trigger: a consistent, fully compared document.',
  ),
  ...escapes(
    'delete-requirement@second',
    'AC-5-2',
    [
      'feature-interaction',
      'one-trigger-contradiction',
      'contrary-pair',
      'registered-contrary',
      'numeric-conflict',
      'glossary-bridged',
      'term-bridged',
      'waived-blocking-lint',
      'overlapping-contrary',
      'opposition-candidate',
      'opposition-negated',
      'opposition-split',
    ],
    'The same deletion from the other side. On temporal-conflict it is caught only because deleting `AUD-R2` leaves `AUD-R1` uncovered — a coverage accident, not a defence, which is why the `@first` row exists. On dangling-target it is caught only because the dangling edge on `DNG-R1` survives the deletion.',
  ),
  ...(['flip-negated@first', 'flip-negated@second'] as const).flatMap((move) =>
    escapes(
      move,
      'AC-5-9',
      [
        'contrary-pair',
        'registered-contrary',
        'temporal-conflict',
        'glossary-bridged',
        'term-bridged',
        'overlapping-contrary',
      ],
      "Flipping either requirement's polarity removes the conflict by changing what the requirement means. Nothing compares the binding to a baseline, so the re-binding is invisible; `FND_SEMANTIC_DRIFT` reports a binding change that removed a finding without a `narrow` certificate.",
    ),
  ),
  ...(['alias-contraries-term@forward', 'alias-contraries-term@reverse'] as const).flatMap((move) =>
    escapes(
      move,
      'AC-4-6',
      ['registered-contrary'],
      "The term table merges two phrases that are contraries only through the document's own antonym table, in either direction, and the contradiction disappears. `validateTerms` reads the SEED antonym heads and the state-bridge lexicon per token and never the document's committed antonyms, so ratify/veto pass it; on `contrary-pair` the same move is refused only because accept/reject are seed heads. The glossary twin is refused here, because `validateGlossary` reads the committed antonyms. AC-4-6 refuses a merge of registered contraries, directly or transitively, whichever table it is written to.",
    ),
  ),
  ...(
    [
      'glossary-over-term@containing/term-then-glossary',
      'glossary-over-term@containing/glossary-then-term',
      'glossary-over-term@containing-canonical/term-then-glossary',
      'glossary-over-term@containing-canonical/glossary-then-term',
    ] as const
  ).flatMap((move) =>
    escapes(
      move,
      'S4 / AC-4-2 (cross-table fence + check twin)',
      ['term-bridged'],
      'A glossary alias that contains a phrase the committed term rewrites — its alias (`charge the customer order`) or its canonical (`charge the purchase order`) — onto a fresh canonical, takes that response out of the term table: the glossary is a whole-body lookup that runs BEFORE term substitution, so R2 reaches the solver as the fresh canonical while R1 still reads `charge purchase order`, and the conflict the term carries disappears. Either write order escapes, because neither fence reads the other table: the term overlap fence checks only terms, and the glossary fence only glossary entries and antonyms. The `equal` twin (the bare term alias as a glossary alias) is caught on this fixture only because no slot body is exactly `customer order`. S4 closes it with a cross-table fence on both ops and a check-time twin for a hand-edited table.',
    ),
  ),
  ...(['alias-contraries-glossary@forward', 'alias-contraries-glossary@reverse'] as const).flatMap(
    (move) =>
      escapes(
        move,
        'AC-5-9 (drift on the conflict signal an alias removed; F1 resolved-by-unification must not excuse it)',
        ['opposition-candidate'],
        'A glossary alias between fill the tank and drain the tank, in either direction, puts both responses on one atom, so the opposition candidate the semantic tier raised is gone and the pair reads as a redundancy. The glossary fence refuses an alias only over committed contraries, and fill/drain are contraries only as the embedder sees them. `glossary` is labelled weakening for this reason. The alias is a vocabulary change that took a conflict signal away, which is what AC-5-9 reports as drift once a baseline exists.',
      ),
  ),
  ...escapes(
    'antonym-over-candidate',
    'AC-5-9 (drift on the conflict signal a contrary axiom discharged; F1 resolved-by-unification must not excuse it)',
    ['opposition-negated'],
    'Committing fill/drain as contraries answers the opposition candidate the semantic tier raised over OPN-R1 and OPN-R2. With OPN-R2 negated, "fill the tank" and "never drain it" are then provably consistent, so the demotion goes, nothing replaces it, and the run verifies. That is right if fill and drain are opposites and hides a contradiction if they are synonyms, and nothing checks which. `antonym` is labelled weakening for this reason, so the resolution is not the strengthening-direction unification F1 excuses; AC-5-9 reports the removed conflict signal as drift once a baseline exists.',
  ),
  ...escapes(
    'unglossary',
    'AC-5-7',
    ['glossary-bridged'],
    'Dropping the alias the conflict rests on declares the two phrases distinct exactly when merging them adds a finding — the `conditional` move AC-5-7 admits only with a distinguishing intent item or vocabulary fact.',
  ),
  ...escapes(
    'unterm',
    'AC-5-7',
    ['term-bridged'],
    'The term-table twin of `unglossary`: splitting the noun phrase removes the finding it carried.',
  ),
  ...escapes(
    'unantonym',
    'AC-5-9',
    ['registered-contrary'],
    'Dropping the committed antonym the conflict rests on removes the finding while both sentences still say ratify and veto. Nothing compares the vocabulary to a baseline, so the change is invisible; `unantonym` is a weakening vocabulary change unit, and `FND_SEMANTIC_DRIFT` reports one that removed a finding. On `contrary-pair` the same drop is caught, because accept/reject stay contraries through the seeds.',
  ),
  ...escapes(
    'rebind-effect',
    'AC-5-9',
    ['state-invariant'],
    'Rewriting the effect so it never writes the forbidden value discharges the violation while the sentence still says "open the valve". The binding changed and removed a finding with no `narrow` certificate (`FND_SEMANTIC_DRIFT`); AC-6-6 separately flags the effect as no longer the rendering of its sentence.',
  ),
]

// ---------------------------------------------------------------------------
// G-D: the op directions, measured
// ---------------------------------------------------------------------------

/**
 * One (fixture, move) pair whose emitted verbs are all `strengthening` and whose run LOST a
 * member of D anyway, with exactly the members it lost.
 *
 * `lost` is part of the key. A row pins WHICH verdict or signal the move loses, so a move that
 * starts losing a different one is a visible failure rather than a row that still matches.
 */
export interface KnownNonmonotone {
  readonly fixture: string
  readonly move: string
  /** The lost members, rendered by {@link renderMember} and sorted. */
  readonly lost: readonly string[]
  /** The AC whose landing closes the row, in the {@link KnownEscape.closedBy} form. */
  readonly closedBy: string
  readonly why: string
}

/** The `closedBy` of a displaced core: the label is AC-5-1's, and only an engine edit closes it. */
const CLOSED_BY_EVERY_CORE =
  'AC-5-1 (engine: report every minimal core, not one per overlapping set; a followup)'

/**
 * The `closedBy` of a core the numeric or temporal tier displaced: those tiers report one core per
 * cell and one for the document, and the obligation ledger is what lists every obligation. The
 * one-core reporting is pinned in `recorded-gaps.test.ts`.
 */
const CLOSED_BY_LEDGER =
  'AC-7-1 (the obligation ledger lists every obligation, not one core per cell or per document)'

/**
 * Every strengthening move that is measured to lose a member of D. EXACT: an unlisted loss
 * fails the gate, and so does a row that no longer loses what it lists (I-5).
 *
 * Every row is a DISPLACEMENT: the engine reports one representative where several members of D
 * compete for one report (overlapping cores, one numeric cell, the temporal tier's one joint
 * core), and the move made a new one the representative. The conflict it lost is still in the
 * document. That is the one loss the `strengthening` label allows (`DIRECTION_MEANING`), and the
 * gate checks it on every loss, listed or not ({@link GateFailures.nonDisplacingLoss}): a move
 * that removes a member outright is mislabelled, and a row here cannot excuse it. None of these
 * is an escape, because the new member still fails the run.
 */
export const KNOWN_NONMONOTONE: readonly KnownNonmonotone[] = [
  ...(
    [
      ['contrary-pair', ['FND_CONTRADICTION(CTR-R1,CTR-R2)']],
      ['overlapping-contrary', ['FND_CONTRADICTION(OVL-R1,OVL-R2)']],
      ['registered-contrary', ['FND_CONTRADICTION(REG-R1,REG-R2)']],
      [
        'temporal-conflict',
        ['FND_CONTRADICTION(AUD-R1,AUD-R2)', 'FND_TEMPORAL_CONTRADICTION(AUD-R1,AUD-R2)'],
      ],
    ] as const
  ).map(
    ([fixture, lost]): KnownNonmonotone => ({
      fixture,
      move: 'add-negation',
      lost,
      closedBy: CLOSED_BY_EVERY_CORE,
      why: "The added negation of the first culprit makes a second conflict through it, under the lowest id in the document. The propositional tier enumerates disjoint cores, so it reports one of two overlapping conflicts, and the temporal tier reports one joint core; the id-sorted solver order hands each the new one, so the seeded conflict is still in the document and no longer in the report. The run still exits 1 on the new core (G-D checks that every loss is a displacement at the reporting tier's granularity).",
    }),
  ),
  {
    fixture: 'numeric-bystander',
    move: 'add-bound-past-bystander',
    lost: ['FND_NUMERIC_CONTRADICTION(NBY-R1,NBY-R2)'],
    closedBy: CLOSED_BY_LEDGER,
    why: 'The added bound (at least 90 minutes, under the lowest id) conflicts with NBY-R1 (at most 30) and with the bystander NBY-R3 (at most 60). The numeric tier proves the whole cell once and minimizes once, and the id-sorted solver order hands it the new pair, so FND_NUMERIC_CONTRADICTION(BND-1,NBY-R3) is reported and the seeded (NBY-R1,NBY-R2), still in the document, is not. The two share no requirement; they share the cell, which is what the numeric tier reports one core per.',
  },
  {
    fixture: 'temporal-conflict',
    move: 'add-bystander-negation',
    lost: ['FND_TEMPORAL_CONTRADICTION(AUD-R1,AUD-R2)'],
    closedBy: CLOSED_BY_LEDGER,
    why: 'The added requirement never raises the alarm, against the bystander AUD-R3 that raises it after a disk write failure: a second temporal conflict that shares no requirement with the seeded one. The temporal tier makes one joint check over the whole document and reports one minimized core, and the new one is it. The propositional tier enumerates disjoint cores, so FND_CONTRADICTION(AUD-R1,AUD-R2) is still reported beside the new one, and the run still exits 1.',
  },
  {
    fixture: 'derives-cycle',
    move: 'branch-into-cycle',
    lost: ['FND_CYCLE(CYC-A,CYC-C)'],
    closedBy:
      'AC-5-1 (engine: enumerate every elementary cycle, not one per back edge; a followup)',
    why: 'The edge CYC-B → CYC-C lets the depth-first cycle search reach CYC-C through the branch, so the back edge CYC-C → CYC-A closes A → B → C → A and the walk never revisits CYC-C from CYC-A. FND_CYCLE(CYC-A,CYC-B,CYC-C) is reported and A → C → A, still in the graph, is not.',
  },
]

/** A member of D as one line: `FND_CONTRADICTION(R1,R2)` or `demotion:reason(R1,R2)`. */
export const renderMember = (m: DMemberView): string =>
  `${m.kind === 'demotion' ? 'demotion:' : ''}${m.name}(${m.requirementIds.join(',')})`

/**
 * What a cell LOST from D against its fixture's baseline, or `undefined` when the cell is not
 * measured: G-D reads only moves whose verbs all join to `strengthening`, that the tool did not
 * refuse, and whose run and baseline both completed.
 */
export const lostFromD = (
  baseline: Outcome | undefined,
  cell: Cell,
  d: Pick<VerdictBearing, 'covers' | 'displaced'>,
): { readonly lost: readonly string[]; readonly removed: readonly string[] } | undefined => {
  if (cell.direction !== 'strengthening') return undefined
  if (baseline?.kind !== 'ran' || cell.outcome.kind !== 'ran') return undefined
  const { d: after, equivalences } = cell.outcome
  const lost = baseline.d.filter((m) => !d.covers(m, after, equivalences))
  return {
    lost: lost.map(renderMember).sort(),
    removed: lost
      .filter((m) => !d.displaced(m, after))
      .map(renderMember)
      .sort(),
  }
}

// ---------------------------------------------------------------------------
// Op coverage (AC-8-2, last sentence)
// ---------------------------------------------------------------------------

/**
 * Every op verb, mapped to the moves that exercise it or to the reason it has none.
 *
 * Typed as a `Record` over {@link OpVerb}, so a verb appended to `OP_VERBS` without a row here
 * is a `tsc` error before it is a test failure. The test additionally checks that each mapped
 * move really EMITS that verb on some fixture — a mapping to a move that never uses the verb
 * would be a reason in disguise.
 */
export const OP_COVERAGE: Readonly<
  Record<OpVerb, { readonly moves: readonly string[] } | { readonly reason: string }>
> = {
  add: {
    moves: [
      'add-decoys',
      'supply-dangling-target',
      'add-negation',
      'add-equivalent@exact',
      'add-equivalent@case',
      'add-bound-past-bystander',
      'add-bystander-negation',
      'flip-negated@second',
      'condition-into-response@second',
      'shall-to-should@second',
    ],
  },
  update: { moves: ['rename-system@second', 'split-system', 'rebind-effect'] },
  delete: { moves: ['delete-requirement@second', 'flip-negated@second', 'shall-to-should@second'] },
  derive: { moves: ['link-culprits', 'branch-into-cycle'] },
  satisfy: { moves: ['link-culprits'] },
  verify: { moves: ['link-culprits'] },
  refine: { moves: ['link-culprits'] },
  'remove-edge': {
    reason:
      'Removes a trace edge. On `derives-cycle` that is the DESIGNED repair of FND_CYCLE, so ' +
      'the moved run is clean, and the gate would have to list a legitimate fix as an escape ' +
      'with no AC to close it. The verb is labelled weakening, so G-D does not measure it ' +
      'either; it is `link-culprits` inverted.',
  },
  glossary: { moves: ['alias-contraries-glossary@forward', 'alias-contraries-glossary@reverse'] },
  antonym: { moves: ['antonym-over-candidate'] },
  waive: { moves: ['waive-by-code', 'waive-scoped-never'] },
  unwaive: { moves: ['unwaive'] },
  unglossary: { moves: ['unglossary'] },
  unantonym: { moves: ['unantonym'] },
  state: { moves: ['release-frame'] },
  unstate: { moves: ['unstate'] },
  'state-initial': { moves: ['vacuous-initial'] },
  classify: { moves: ['declassify-constraint', 'flip-negated@second'] },
  term: {
    moves: [
      'alias-contraries-term@forward',
      'alias-contraries-term@reverse',
      'term-over-phrase@inside-canonical',
    ],
  },
  unterm: { moves: ['unterm'] },
}

/**
 * The op verbs a move emits, computed WITHOUT running anything — the static half of the
 * op-coverage check. A re-parse emits `delete` + `add` (+ `classify` when the requirement it
 * replaces is classified), exactly as {@link applyEdit} folds it.
 */
export const editVerbs = (edit: Edit, ctx: MoveContext): readonly OpVerb[] => {
  switch (edit.kind) {
    case 'ops':
      return edit.ops.map((o) => o.op)
    case 'reparse':
      return reparseTail(req(ctx.doc, edit.ref)).length > 0
        ? ['delete', 'add', 'classify']
        : ['delete', 'add']
    case 'run':
    case 'raw-waivers':
    case 'inapplicable':
      return []
  }
}

// ---------------------------------------------------------------------------
// Applying a move — pure, apart from the parse
// ---------------------------------------------------------------------------

/**
 * Fold `ops` atomically; a refusal names the op and the fold's code.
 *
 * Under `apply`'s OWN options, handed in through {@link GamingWiring.mutateOptions}. A bare
 * `foldOps` runs no write-time fence at all (the normalizer is a trim and no validator is
 * wired), so a harness folding that way reports escapes through ops `apply` refuses — moves no
 * agent can make — and cannot see a fence a later story adds. The options are REQUIRED here, so
 * there is no default for a caller to fall into.
 *
 * A move refused here is caught at WRITE time only. The same table written into the stored
 * document by hand never meets the fold, so whether `check` catches it too is a separate
 * question, and one a registry of op moves cannot ask.
 */
const fold = (
  doc: RequirementsDocument,
  ops: readonly DocumentOp[],
  options: MutateOptions,
): { readonly doc: RequirementsDocument } | Refused => {
  const folded = foldOps(doc, ops, TS, options)
  if (folded.abortedAt === undefined) return { doc: folded.document }
  const failure = folded.results.find((r) => !r.ok)
  return { kind: 'refused', by: `${failure?.op ?? '?'}:${failure?.code ?? '?'}` }
}

/** Build a fixture document from its ops. A fixture the fold refuses is a harness bug. */
export const buildDoc = (
  ops: readonly DocumentOp[],
  options: MutateOptions,
): RequirementsDocument => {
  const built = fold(emptyDocument(), ops, options)
  if ('kind' in built) throw new Error(`gaming fixture ops refused: ${built.by}`)
  return built.doc
}

/** The classification a re-add must re-commit, so a re-parse changes the modal and nothing else. */
const reparseTail = (r: Requirement): readonly DocumentOp[] => {
  const expression = r.stateEffect ?? r.stateConstraint
  return r.responseKind === undefined
    ? []
    : [
        {
          op: 'classify',
          ref: r.key ?? r.id,
          kind: r.responseKind,
          ...(expression !== undefined ? { expression } : {}),
        },
      ]
}

/** A move, applied: the document and run to check, or why there is nothing to check. */
type Applied =
  | {
      readonly kind: 'check'
      readonly doc: RequirementsDocument
      readonly knobs: Knobs
      readonly embedder: EmbedderChoice
      /** False when the move changed neither the document nor the run — a registration bug. */
      readonly changed: boolean
    }
  | Refused
  | { readonly kind: 'inapplicable'; readonly reason: string }

const sameDoc = (a: RequirementsDocument, b: RequirementsDocument): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

const applyEdit = async (
  edit: Edit,
  doc: RequirementsDocument,
  options: MutateOptions,
): Promise<Applied> => {
  switch (edit.kind) {
    case 'inapplicable':
      return edit
    case 'run': {
      const knobs = { ...ARMED, ...edit.knobs }
      const embedder = edit.embedder ?? 'orthogonal'
      const changed =
        embedder !== 'orthogonal' ||
        (Object.keys(knobs) as (keyof Knobs)[]).some((k) => knobs[k] !== ARMED[k])
      return { kind: 'check', doc, knobs, embedder, changed }
    }
    case 'reparse': {
      const parsed = await parseLine(edit.sentence)
      if (parsed.outcome !== 'ok') {
        return { kind: 'refused', by: parsed.outcome === 'error' ? parsed.code : 'parse:skipped' }
      }
      const moved = fold(
        doc,
        [
          { op: 'delete', ref: edit.ref },
          { ...parsed.proposedOp, key: edit.ref },
          ...reparseTail(req(doc, edit.ref)),
        ],
        options,
      )
      // The parse normalizes the modal, so the re-added requirement may be identical in every
      // slot — which is the property under test: whether the tool reads the edited sentence as
      // the same obligation. So the moved DOCUMENT cannot show the move happened, and `changed`
      // is measured on the INPUT instead: did the author type a different sentence at all.
      return 'kind' in moved
        ? moved
        : {
            kind: 'check',
            doc: moved.doc,
            knobs: ARMED,
            embedder: 'orthogonal',
            changed: edit.sentence !== req(doc, edit.ref).sentence,
          }
    }
    case 'raw-waivers': {
      // No fold: the stored document as a hand edit leaves it.
      const moved: RequirementsDocument = { ...doc, waivers: [...doc.waivers, ...edit.waivers] }
      return {
        kind: 'check',
        doc: moved,
        knobs: ARMED,
        embedder: 'orthogonal',
        changed: !sameDoc(moved, doc),
      }
    }
    case 'ops': {
      const moved = fold(doc, edit.ops, options)
      return 'kind' in moved
        ? moved
        : {
            kind: 'check',
            doc: moved.doc,
            knobs: ARMED,
            embedder: 'orthogonal',
            changed: !sameDoc(moved.doc, doc),
          }
    }
  }
}

// ---------------------------------------------------------------------------
// The runner — `check` is INJECTED
// ---------------------------------------------------------------------------

/** The slice of a `check` payload the gate reads. `CheckPayload` satisfies it structurally. */
export interface CheckView {
  readonly verified: boolean
  readonly findings: readonly {
    readonly code: string
    readonly severity: string
    readonly requirementIds: readonly string[]
  }[]
  readonly coverage: {
    readonly demotions: readonly {
      readonly reason: string
      readonly requirementIds: readonly string[]
    }[]
  }
}

/**
 * The composition a shard supplies. `testing/` may not name `app/` or `adapters/`
 * (`package-boundary.test.ts`), so the real `check` operation and the real layers are handed in
 * by the test file — the same seam discipline `SolverService` and `ModelDownload` follow.
 */
export interface GamingWiring {
  /** `runOperation(checkOp, input)`, with the envelope's exit code attached. */
  readonly check: (
    input: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<
    { readonly exit: number; readonly data: CheckView },
    unknown,
    DocStore | DocPath | EmbedderService | SolverService
  >
  readonly solver: Layer.Layer<SolverService>
  /** The env-selected embedder service — the stub under `SYMSPEC_EMBED_STUB=1`. */
  readonly envEmbedder: Layer.Layer<EmbedderService>
  /**
   * `apply`'s mutate options (`app/operations/mutate-options.ts`), so every fixture and every
   * move is folded behind exactly the write-time fences an agent's `apply` meets.
   */
  readonly mutateOptions: MutateOptions
  /**
   * D, the verdict-bearing set, and its identity map (`app/runtime/signal-classes.ts`). Handed
   * in for the same ring reason as `check`: the classes are the app's published tables, and G-D
   * must measure the directions against the SAME D the manifest states them over.
   */
  readonly verdictBearing: VerdictBearing
  /**
   * The published waivability of a code (`waivabilityOf` in `app/runtime/signal-classes.ts`),
   * so the waive moves pick the never-class findings by the SAME column the fold enforces.
   */
  readonly waivability: WaivabilityOf
}

/** One member of D, as `app/runtime/signal-classes.ts` projects it. */
export interface DMemberView {
  readonly kind: 'finding' | 'demotion'
  readonly name: string
  readonly class: string
  readonly requirementIds: readonly string[]
  /** The comparison cell a cell-granular finding sits in, as the report names it. */
  readonly cell?: string
}

/** The D projection and its identity maps, injected by the shard. */
export interface VerdictBearing {
  /** Project a report onto D. */
  readonly of: (report: CheckView) => readonly DMemberView[]
  /** The groups of requirements the report states equivalent (an identity map's input). */
  readonly equivalences: (report: CheckView) => readonly (readonly string[])[]
  /** Whether a member of D before a move is still in D after it, under the identity maps. */
  readonly covers: (
    member: DMemberView,
    after: readonly DMemberView[],
    equivalences: readonly (readonly string[])[],
  ) => boolean
  /** Whether a lost member was displaced by a member of the same code, at its tier's granularity. */
  readonly displaced: (member: DMemberView, after: readonly DMemberView[]) => boolean
}

/**
 * The cosine the baseline embedder gives a fixture's `near` pair: above the opposition floor
 * (0.5) and below the similarity threshold (0.72), so the pair is topically related and nothing
 * else. `gaming.test.ts` pins it between the engine's two constants.
 */
export const NEAR_COSINE = 0.6

/**
 * Every distinct phrase on its own axis, except that each `near` pair also shares one axis of
 * its own, weighted so the two phrases meet at {@link NEAR_COSINE}. Fresh per run, so a vector
 * depends only on the order phrases are first seen inside ONE run — deterministic for a fixed
 * document.
 */
export const orthogonalEmbedder = (near: readonly (readonly [string, string])[] = []): Embedder => {
  const axes = new Map<string, number>()
  const DIM = 512
  const axisOf = (name: string): number => {
    let axis = axes.get(name)
    if (axis === undefined) {
      axis = axes.size
      if (axis >= DIM) throw new Error('orthogonal embedder ran out of axes')
      axes.set(name, axis)
    }
    return axis
  }
  // A NUL-led name cannot be a response phrase, so a shared axis never collides with one.
  const shared = new Map<string, string>()
  near.forEach(([a, b], i) => {
    shared.set(a, `\u0000near:${i}`)
    shared.set(b, `\u0000near:${i}`)
  })
  return async (texts) =>
    texts.map((t) => {
      const v = new Float32Array(DIM)
      const pair = shared.get(t)
      if (pair === undefined) {
        v[axisOf(t)] = 1
        return v
      }
      v[axisOf(t)] = Math.sqrt(1 - NEAR_COSINE)
      v[axisOf(pair)] = Math.sqrt(NEAR_COSINE)
      return v
    })
}

/** The baseline embedder one fixture runs under: orthogonal, with the fixture's `near` pairs. */
export const fixtureEmbedder = (fixture: Pick<Fixture, 'near'>): Embedder =>
  orthogonalEmbedder(fixture.near ?? [])

/** One `check` result, reduced to what the gate and the snapshot read. */
export interface RunResult {
  readonly kind: 'ran'
  readonly exit: number
  readonly verified: boolean
  readonly signalFires: boolean
  readonly errorCodes: readonly string[]
  readonly demotions: readonly string[]
  readonly codes: readonly string[]
  /** Every finding the report shows, with its requirement UUIDs as reported. */
  readonly findings: readonly FindingView[]
  /** D for this run, with requirement ids read as their keys so a lost member reads as prose. */
  readonly d: readonly DMemberView[]
  /** The equivalence groups this run's report states, read as keys like {@link d}. */
  readonly equivalences: readonly (readonly string[])[]
}

/** A move the tool refused before `check` ran: the fold, or the parse, said no. */
export interface Refused {
  readonly kind: 'refused'
  readonly by: string
}

export type Outcome =
  | RunResult
  | Refused
  | { readonly kind: 'inapplicable'; readonly reason: string }
  | { readonly kind: 'operational'; readonly tag: string }

export interface Cell {
  readonly fixture: string
  readonly move: string
  readonly outcome: Outcome
  readonly changed: boolean
  /** The move's direction ON THIS FIXTURE, from the verbs it emitted here. */
  readonly direction: Direction | undefined
}

export interface Matrix {
  readonly baselines: ReadonlyMap<string, Outcome>
  readonly controls: ReadonlyMap<string, Outcome>
  readonly cells: readonly Cell[]
}

const signalFires = (payload: CheckView, doc: RequirementsDocument, signal: Signal): boolean => {
  const ids = signal.names.map((k) => resolveRef(doc, k)?.id)
  if (ids.some((id) => id === undefined)) return false
  const names = (requirementIds: readonly string[]) =>
    ids.every((id) => requirementIds.includes(id as string))
  return 'code' in signal
    ? payload.findings.some((f) => f.code === signal.code && names(f.requirementIds))
    : payload.coverage.demotions.some(
        (d) => d.reason === signal.demotion && names(d.requirementIds),
      )
}

type Runtime = ManagedRuntime.ManagedRuntime<SolverService, never>

const uniq = (xs: readonly string[]): readonly string[] => [...new Set(xs)].sort()

const runCheck = async (
  wiring: GamingWiring,
  runtime: Runtime,
  document: RequirementsDocument,
  knobs: Knobs,
  embedder: EmbedderChoice,
  fixture: Pick<Fixture, 'near' | 'signal'>,
): Promise<Outcome> => {
  const signal = fixture.signal
  if (embedder === 'stub-env' && process.env[EMBED_STUB_ENV] !== '1') {
    throw new Error(`the embedding-stub move needs ${EMBED_STUB_ENV}=1 (vitest.config.ts sets it)`)
  }
  const store = Layer.succeed(DocStore)(
    documentOnlyStore({
      load: (path) =>
        path === 'doc.json'
          ? Effect.succeed({ document, unknownKeys: {}, diagnostics: [] })
          : Effect.fail(new ErrDocNotFound({ error: `no document at ${path}`, suggestions: [] })),
      save: () => Effect.void,
      exists: () => Effect.succeed(true),
    }),
  )
  const result = await runtime.runPromise(
    Effect.result(wiring.check({ file: 'doc.json', strict: true, ...knobs })).pipe(
      Effect.provide(
        Layer.mergeAll(
          store,
          Layer.succeed(DocPath)(makeDocPath({})),
          embedder === 'stub-env' ? wiring.envEmbedder : embedderLayerOf(fixtureEmbedder(fixture)),
        ),
      ),
    ),
  )
  if (result._tag === 'Failure') {
    const failure = result.failure as { readonly _tag?: unknown } | null
    return { kind: 'operational', tag: String(failure?._tag ?? 'unknown') }
  }
  const { exit, data } = result.success
  const keyOf = (id: string): string => document.requirements[id]?.key ?? id
  return {
    kind: 'ran',
    exit,
    verified: data.verified,
    signalFires: signalFires(data, document, signal),
    errorCodes: uniq(data.findings.filter((f) => f.severity === 'error').map((f) => f.code)),
    demotions: uniq(data.coverage.demotions.map((d) => d.reason)),
    codes: uniq(data.findings.map((f) => f.code)),
    findings: data.findings.map((f) => ({ code: f.code, requirementIds: [...f.requirementIds] })),
    d: wiring.verdictBearing
      .of(data)
      .map((m) => ({ ...m, requirementIds: m.requirementIds.map(keyOf).sort() })),
    equivalences: wiring.verdictBearing.equivalences(data).map((group) => group.map(keyOf).sort()),
  }
}

/** Clean: the agent loop's stop condition. */
export const isClean = (outcome: Outcome): boolean =>
  outcome.kind === 'ran' && outcome.verified && outcome.exit === 0

/**
 * An escape: a moved run that is clean. No run can carry a kernel certificate yet (see the
 * header), so today this is exactly {@link isClean}.
 */
export const isEscape = (outcome: Outcome): boolean => isClean(outcome)

/**
 * Run every move against every fixture, plus each fixture's baseline and control.
 *
 * SERIAL within a fixture, on one solver runtime per fixture. The z3 module is process-global
 * (`primeZ3`/`resetZ3`), so two runs in flight in one worker would share — and one could reset —
 * the other's instance. One runtime per FIXTURE rather than per run keeps the boot cost off
 * every cell; one per fixture rather than per shard bounds the WASM heap, which never shrinks
 * and aborts at 2 GiB when five fixtures' worth of contexts pile up in one module (measured).
 */
export const runMatrix = async (
  wiring: GamingWiring,
  fixtures: readonly Fixture[],
  moves: readonly Move[] = MOVES,
): Promise<Matrix> => {
  const baselines = new Map<string, Outcome>()
  const controls = new Map<string, Outcome>()
  const cells: Cell[] = []
  for (const fixture of fixtures) {
    const runtime: Runtime = ManagedRuntime.make(wiring.solver)
    try {
      const run = (doc: RequirementsDocument, knobs: Knobs, embedder: EmbedderChoice) =>
        runCheck(wiring, runtime, doc, knobs, embedder, fixture)
      const doc = buildDoc(fixture.ops, wiring.mutateOptions)
      const baseline = await run(doc, ARMED, 'orthogonal')
      baselines.set(fixture.id, baseline)
      if ('ops' in fixture.control) {
        controls.set(
          fixture.id,
          await run(buildDoc(fixture.control.ops, wiring.mutateOptions), ARMED, 'orthogonal'),
        )
      }
      const baselineCodes = baseline.kind === 'ran' ? baseline.codes : []
      const baselineFindings = baseline.kind === 'ran' ? baseline.findings : []
      for (const move of moves) {
        const ctx: MoveContext = {
          fixture,
          doc,
          baselineCodes,
          baselineFindings,
          waivability: wiring.waivability,
        }
        const edit = move.edit(ctx)
        const applied = await applyEdit(edit, doc, wiring.mutateOptions)
        const outcome: Outcome =
          applied.kind === 'check'
            ? await run(applied.doc, applied.knobs, applied.embedder)
            : applied
        cells.push({
          fixture: fixture.id,
          move: move.id,
          outcome,
          changed: applied.kind !== 'check' || applied.changed,
          direction: cellDirection(edit, ctx),
        })
      }
    } finally {
      await runtime.dispose()
    }
  }
  return { baselines, controls, cells }
}

// ---------------------------------------------------------------------------
// The gate, as data
// ---------------------------------------------------------------------------

/** Every way a matrix can fail the gate. Each list must be empty. */
export interface GateFailures {
  /** A baseline that is clean, or whose seeded signal does not fire. */
  readonly baselineMisses: readonly string[]
  /** A control that is not clean — the fixture cannot discriminate. */
  readonly controlFailures: readonly string[]
  /** A clean moved run with no {@link KNOWN_ESCAPES} row. */
  readonly unlistedEscapes: readonly string[]
  /** A {@link KNOWN_ESCAPES} row whose pair no longer escapes (I-5). */
  readonly staleEscapes: readonly string[]
  /** A move that changed neither the document nor the run. */
  readonly inertMoves: readonly string[]
  /** G-D: a strengthening move that lost a member of D, unlisted in {@link KNOWN_NONMONOTONE}. */
  readonly unlistedNonmonotone: readonly string[]
  /** G-D: a {@link KNOWN_NONMONOTONE} row whose pair no longer loses exactly what it lists. */
  readonly staleNonmonotone: readonly string[]
  /**
   * G-D: a strengthening move that REMOVED a member of D, listed or not: no member of the same
   * code took its place at the granularity its tier reports (overlapping requirements, the same
   * numeric cell, or anywhere for the temporal tier's one joint core). Displacement is the only loss
   * the `strengthening` label allows, so a removal means the verb is mislabelled, and no table
   * row can excuse it.
   */
  readonly nonDisplacingLoss: readonly string[]
  /**
   * G-D non-vacuity: a baseline whose D is EMPTY. Every fixture seeds a verdict-bearing defect,
   * so an empty D means the projection stopped reading the report, and every loss would be
   * invisible.
   */
  readonly emptyBaselineD: readonly string[]
}

const pairKey = (fixture: string, move: string): string => `${fixture} × ${move}`

const brief = (outcome: Outcome): string =>
  outcome.kind === 'ran'
    ? `exit ${outcome.exit}, verified=${outcome.verified}, signal ${outcome.signalFires ? 'fires' : 'gone'}`
    : outcome.kind

/** Score a matrix against the registry. Only rows for fixtures IN the matrix are considered. */
export const gateFailures = (
  matrix: Matrix,
  d: Pick<VerdictBearing, 'covers' | 'displaced'>,
  known: readonly KnownEscape[] = KNOWN_ESCAPES,
  nonmonotone: readonly KnownNonmonotone[] = KNOWN_NONMONOTONE,
): GateFailures => {
  const scored = new Set(matrix.baselines.keys())
  const lossKey = (fixture: string, move: string, lost: readonly string[]) =>
    `${pairKey(fixture, move)} lost [${lost.join(', ')}]`
  const measured = matrix.cells.flatMap((c) => {
    const loss = lostFromD(matrix.baselines.get(c.fixture), c, d)
    return loss === undefined || loss.lost.length === 0 ? [] : [{ cell: c, ...loss }]
  })
  const measuredLoss = measured.map((m) => lossKey(m.cell.fixture, m.cell.move, m.lost))
  const listedLoss = nonmonotone
    .filter((k) => scored.has(k.fixture))
    .map((k) => lossKey(k.fixture, k.move, [...k.lost].sort()))
  const listed = new Set(
    known.filter((k) => scored.has(k.fixture)).map((k) => pairKey(k.fixture, k.move)),
  )
  const escaping = new Set(
    matrix.cells.filter((c) => isEscape(c.outcome)).map((c) => pairKey(c.fixture, c.move)),
  )
  return {
    baselineMisses: [...matrix.baselines]
      .filter(([, o]) => isClean(o) || o.kind !== 'ran' || !o.signalFires)
      .map(([id, o]) => `${id}: ${brief(o)}`),
    controlFailures: [...matrix.controls]
      .filter(([, o]) => !isClean(o))
      .map(([id, o]) => `${id}: ${brief(o)}`),
    unlistedEscapes: matrix.cells
      .filter((c) => isEscape(c.outcome) && !listed.has(pairKey(c.fixture, c.move)))
      .map((c) => pairKey(c.fixture, c.move)),
    staleEscapes: [...listed].filter((k) => !escaping.has(k)),
    inertMoves: matrix.cells.filter((c) => !c.changed).map((c) => pairKey(c.fixture, c.move)),
    emptyBaselineD: [...matrix.baselines]
      .filter(([, o]) => o.kind !== 'ran' || o.d.length === 0)
      .map(([id]) => id),
    unlistedNonmonotone: measuredLoss.filter((k) => !listedLoss.includes(k)),
    staleNonmonotone: listedLoss.filter((k) => !measuredLoss.includes(k)),
    nonDisplacingLoss: measured
      .filter((m) => m.removed.length > 0)
      .map((m) => lossKey(m.cell.fixture, m.cell.move, m.removed)),
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const describeOutcome = (move: string, outcome: Outcome): string => {
  switch (outcome.kind) {
    case 'inapplicable':
      return 'inapplicable'
    case 'refused':
      return `refused ${outcome.by}`
    case 'operational':
      return `operational ${outcome.tag}`
    case 'ran':
      if (TIMING_SENSITIVE.has(move)) {
        return isClean(outcome) ? 'CLEAN' : 'not clean (timing-sensitive; detail not pinned)'
      }
      return [
        isClean(outcome) ? 'CLEAN' : `exit ${outcome.exit}`,
        `verified=${outcome.verified}`,
        `signal=${outcome.signalFires ? 'fires' : 'gone'}`,
        `errors=[${outcome.errorCodes.join(',')}]`,
        `demotions=[${outcome.demotions.join(',')}]`,
      ].join(' ')
  }
}

/** The whole matrix as text, one row per (fixture, move) — the I-5 snapshot. */
export const renderMatrix = (matrix: Matrix): string => {
  const rows: string[] = []
  for (const [fixture, outcome] of matrix.baselines) {
    rows.push(`${fixture}\t(baseline)\t${describeOutcome('', outcome)}`)
    const control = matrix.controls.get(fixture)
    if (control !== undefined) rows.push(`${fixture}\t(control)\t${describeOutcome('', control)}`)
  }
  for (const cell of matrix.cells) {
    rows.push(`${cell.fixture}\t${cell.move}\t${describeOutcome(cell.move, cell.outcome)}`)
  }
  return `${rows.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// Shards
// ---------------------------------------------------------------------------

/**
 * The fixtures each shard file runs. One file per shard so vitest's worker pool runs them in
 * parallel: every cell is a full `check` (a few hundred ms each, the state-model fixture the
 * heaviest), and one file would serialize all of them. `gaming.test.ts` asserts this partitions
 * {@link FIXTURES} exactly and that every shard has its file.
 */
export const SHARDS: Readonly<Record<string, readonly string[]>> = {
  a: ['feature-interaction', 'state-invariant'],
  b: ['one-trigger-contradiction', 'contrary-pair'],
  c: ['numeric-conflict', 'temporal-conflict'],
  d: ['glossary-bridged', 'term-bridged'],
  e: ['registered-contrary'],
  f: ['waived-blocking-lint', 'dangling-target'],
  g: ['overlapping-contrary', 'opposition-candidate'],
  h: ['derives-cycle', 'numeric-bystander'],
  i: ['opposition-negated', 'opposition-split'],
}

/**
 * Declare one shard's gate. Each assertion is one {@link GateFailures} list, so a red run names
 * the class of failure in its title and the offending pairs in its message.
 */
export const describeGamingShard = (key: string, wiring: GamingWiring): void => {
  const ids = SHARDS[key]
  if (ids === undefined) throw new Error(`no gaming shard ${key}`)
  const fixtures = FIXTURES.filter((f) => ids.includes(f.id))

  describe(`GAMING shard ${key} — ${ids.join(', ')}`, () => {
    let matrix: Matrix
    let failures: GateFailures
    // Two fixtures × every move, serial: tens of `check` runs, measured at ~5 s per shard. The
    // budget is a hang detector with room for a loaded 2-core runner, not a performance claim.
    beforeAll(async () => {
      matrix = await runMatrix(wiring, fixtures)
      failures = gateFailures(matrix, wiring.verdictBearing)
    }, 180_000)

    it('every baseline detects its seeded defect, by the named signal', () => {
      expect(failures.baselineMisses).toEqual([])
    })

    it('every control reaches a clean verdict — the fixture can discriminate', () => {
      expect(failures.controlFailures).toEqual([])
    })

    it('[S3-048] [S3-049] [S3-050] no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair', () => {
      expect(
        failures.unlistedEscapes,
        'new escape: register it with the AC that closes it',
      ).toEqual([])
    })

    it('[S3-048] every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5)', () => {
      expect(failures.staleEscapes, 'the row no longer escapes: delete it').toEqual([])
    })

    it('every applied move changed the document or the run', () => {
      expect(failures.inertMoves).toEqual([])
    })

    it('G-D: every baseline has a non-empty D to lose — the measurement is not vacuous', () => {
      expect(failures.emptyBaselineD).toEqual([])
    })

    it('G-D: no strengthening move loses a member of D unless KNOWN_NONMONOTONE lists it', () => {
      expect(
        failures.unlistedNonmonotone,
        'a verb labelled strengthening removed a verdict-bearing member: relabel the verb, fix the encoding, or list the pair',
      ).toEqual([])
    })

    it('G-D: every loss a strengthening move shows is a displacement, never a removal', () => {
      expect(
        failures.nonDisplacingLoss,
        'a verb labelled strengthening removed a verdict-bearing member outright: relabel the verb or fix the encoding',
      ).toEqual([])
    })

    it('G-D: every KNOWN_NONMONOTONE row still loses exactly what it lists (I-5)', () => {
      expect(failures.staleNonmonotone, 'the row no longer matches: update or delete it').toEqual(
        [],
      )
    })

    it('the whole matrix is pinned, so a move caught a different way is a visible diff', async () => {
      await expect(renderMatrix(matrix)).toMatchFileSnapshot(`./__snapshots__/gaming-${key}.txt`)
    })
  })
}
