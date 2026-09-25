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
 *   the document was dirty.
 * - {@link MOVES}: every gaming move expressible on today's document format, each a function
 *   from a fixture to an op stream, a re-parse, or a run-setting change — the same three
 *   channels an agent has. Each carries its I-1 direction as DATA.
 * - {@link NOT_APPLICABLE_YET}: the AC-8-2 moves whose target does not exist yet (intent,
 *   policy, `narrow` certificates, environment assumptions, `derived`). Enumerated in code so
 *   AC-8-2's list is complete here and a later story has a row to promote.
 * - {@link KNOWN_ESCAPES}: every (fixture, move) pair that reaches a clean verdict today, with
 *   the AC that closes it. The gate is that this table is EXACT, in both directions.
 * - {@link OP_COVERAGE}: every op verb in `ops.ts`, mapped to the moves that exercise it or to
 *   a written reason it has none (AC-8-2's last sentence).
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
import {
  emptyDocument,
  type Requirement,
  type RequirementsDocument,
} from '../domain/requirements/document.ts'
import { foldOps, type MutateOptions } from '../domain/requirements/mutate.ts'
import type { AddOp, DocumentOp, OpVerb } from '../domain/requirements/ops.ts'
import { resolveRef } from '../domain/requirements/resolve.ts'
import { DocPath, DocStore, makeDocPath } from '../ports/doc-store.ts'
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
const ARMED: Knobs = { temporalBound: 10, semantic: true, solverBudgetMs: 0, timeoutMs: 20_000 }

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
}

const add = (
  key: string,
  slots: Omit<AddOp, 'op' | 'key' | 'patternType'> & Partial<Pick<AddOp, 'patternType'>>,
): AddOp => ({
  op: 'add',
  key,
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
]

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/**
 * The I-1 direction of a move, as data.
 *
 * `weakening` covers every move that can remove a finding by changing what a requirement
 * means or which requirements exist — the class Story 5 admits only with a certificate.
 * `strengthening` moves can only add findings IN THE LOGIC; an escape by one is therefore a
 * defect in the encoding rather than a gap in the gate, and is labelled that way below.
 */
export type Direction = 'strengthening' | 'weakening' | 'run-weakening'

/** What a move hands the runner, before the runner folds or checks anything. */
type Edit =
  | { readonly kind: 'ops'; readonly ops: readonly DocumentOp[] }
  | { readonly kind: 'reparse'; readonly ref: string; readonly sentence: string }
  | { readonly kind: 'run'; readonly knobs: Partial<Knobs>; readonly embedder?: EmbedderChoice }
  | { readonly kind: 'inapplicable'; readonly reason: string }

/** Everything a move may read. The baseline codes are what an agent sees in the report. */
export interface MoveContext {
  readonly fixture: Fixture
  readonly doc: RequirementsDocument
  readonly baselineCodes: readonly string[]
}

export interface Move {
  readonly id: string
  /** The AC-8-2 clause this move realizes, or the op verb it exists to cover. */
  readonly clause: string
  readonly direction: Direction
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

const DECOYS: readonly (readonly [string, string])[] = [
  ['DECOY-1', 'emit the report'],
  ['DECOY-2', 'sign the report'],
  ['DECOY-3', 'archive the report'],
]

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
  direction: Direction,
  edit: (target: Requirement, key: string, ctx: MoveContext) => Edit,
): readonly Move[] =>
  SIDES.map(([side, i]) => ({
    id: `${id}@${side}`,
    clause,
    direction,
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
    direction: 'strengthening',
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

export const MOVES: readonly Move[] = [
  ...oneSided('rename-system', 'rename a system', 'weakening', (r, key) => ({
    kind: 'ops',
    ops: [{ op: 'update', ref: key, attr: 'systemName', value: `${r.systemName} unit` }],
  })),
  {
    id: 'split-system',
    clause: 'split a system into two parents (two names; part-of parents need AC-4-1)',
    direction: 'weakening',
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
  {
    id: 'waive-by-code',
    clause: 'waive by code',
    direction: 'weakening',
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
              reason: 'accepted for this release',
            })),
          },
  },
  ...oneSided('delete-requirement', 'delete a requirement', 'weakening', (_r, key) => ({
    kind: 'ops',
    ops: [{ op: 'delete', ref: key }],
  })),
  ...oneSided('flip-negated', 'flip `negated`', 'weakening', (r) => ({
    kind: 'ops',
    ops: readd(r, { negated: !r.negated }),
  })),
  ...oneSided(
    'condition-into-response',
    'move a condition into the response text',
    'weakening',
    (r) => {
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
    },
  ),
  {
    id: 'add-decoys',
    clause: 'add decoy requirements',
    direction: 'strengthening',
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
    'weakening',
    (r, key) => ({
      kind: 'reparse',
      ref: key,
      sentence: r.sentence.replace(/\bshall\b/, 'should'),
    }),
  ),
  {
    id: 'link-culprits',
    clause: 'op coverage: trace edges between the two culprits',
    direction: 'strengthening',
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
    id: 'unglossary',
    clause: 'op coverage: drop the committed glossary alias the conflict rests on',
    direction: 'weakening',
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
    direction: 'weakening',
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
    direction: 'weakening',
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
    direction: 'weakening',
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
    direction: 'weakening',
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
    direction: 'weakening',
    edit: ({ doc }) =>
      doc.stateModel.variables.length === 0
        ? { kind: 'inapplicable', reason: 'the fixture declares no state model' }
        : { kind: 'ops', ops: [{ op: 'state-initial', predicate: 'false' }] },
  },
  {
    id: 'release-frame',
    clause: 'op coverage: re-declare a state variable with its frame released',
    direction: 'weakening',
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
    direction: 'weakening',
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
    direction: 'run-weakening',
    edit: () => ({ kind: 'run', knobs: {}, embedder: 'stub-env' }),
  },
  {
    id: 'semantic-off',
    clause: 'run with `--semantic=false`',
    direction: 'run-weakening',
    edit: () => ({ kind: 'run', knobs: { semantic: false } }),
  },
  {
    id: 'solver-budget-1ms',
    clause: 'run with a one-millisecond budget (`--solver-budget-ms 1`)',
    direction: 'run-weakening',
    edit: () => ({ kind: 'run', knobs: { solverBudgetMs: 1 } }),
  },
  {
    id: 'solver-timeout-1ms',
    clause: 'run with a one-millisecond budget (`--timeout-ms 1`)',
    direction: 'run-weakening',
    edit: () => ({ kind: 'run', knobs: { timeoutMs: 1 } }),
  },
  {
    id: 'temporal-bound-1',
    clause: 'run with `--temporal-bound 1`',
    direction: 'run-weakening',
    edit: () => ({ kind: 'run', knobs: { temporalBound: 1 } }),
  },
  {
    id: 'temporal-off',
    clause: 'run with the temporal tier off (`--temporal-bound 0`, the default)',
    direction: 'run-weakening',
    edit: () => ({ kind: 'run', knobs: { temporalBound: 0 } }),
  },
]

/**
 * Moves whose outcome depends on wall-clock time. A 1 ms bound may or may not cut a given
 * query off, so their DETAIL is not snapshotted — only the gate claim, which holds either way
 * (a query that finishes finds the defect; one that does not demotes).
 */
const TIMING_SENSITIVE: ReadonlySet<string> = new Set(['solver-budget-1ms', 'solver-timeout-1ms'])

/** An AC-8-2 move whose target does not exist on today's document format. */
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
 * Every move's standing, derived from the tables — never stated. A registered move is caught
 * unless {@link KNOWN_ESCAPES} lists it, and the shards hold that table exact, so this report
 * is as true as the last green run.
 */
export const moveStatuses = (): readonly {
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
      direction: m.direction,
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
  /** The AC whose landing turns this row red — at which point the row is deleted. */
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
    ],
    'The same deletion from the other side. On temporal-conflict it is caught only because deleting `AUD-R2` leaves `AUD-R1` uncovered — a coverage accident, not a defence, which is why the `@first` row exists.',
  ),
  ...escapes(
    'waive-by-code',
    'AC-5-6',
    [
      'one-trigger-contradiction',
      'contrary-pair',
      'registered-contrary',
      'numeric-conflict',
      'temporal-conflict',
      'glossary-bridged',
      'term-bridged',
    ],
    'A code-only waiver suppresses an error-severity FORMAL finding, and a waived finding still counts as a comparison, so the run verifies. AC-5-6 makes formal findings unwaivable.',
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
      'flip-negated@second',
      'condition-into-response@second',
      'shall-to-should@second',
    ],
  },
  update: { moves: ['rename-system@second', 'split-system', 'rebind-effect'] },
  delete: { moves: ['delete-requirement@second', 'flip-negated@second', 'shall-to-should@second'] },
  derive: { moves: ['link-culprits'] },
  satisfy: { moves: ['link-culprits'] },
  verify: { moves: ['link-culprits'] },
  refine: { moves: ['link-culprits'] },
  'remove-edge': {
    reason:
      'Removes a trace edge. No seeded fixture carries an edge, and trace findings ' +
      '(FND_ORPHAN, FND_MISSING_TRACE_LINK) are not a consistency verdict; the move is ' +
      '`link-culprits` inverted, and is registered when a traced fixture exists.',
  },
  glossary: { moves: ['alias-contraries-glossary@forward', 'alias-contraries-glossary@reverse'] },
  antonym: {
    reason:
      'Commits a contrary axiom: strengthening under I-1 in the logic the decide tier uses, ' +
      'so it can only add findings. `unantonym` is its weakening inverse, and is registered.',
  },
  waive: { moves: ['waive-by-code'] },
  unwaive: {
    reason:
      'Removes a waiver, which can only reinstate a finding the waiver hid (strengthening). ' +
      '`waive` is the weakening direction, and is registered.',
  },
  unglossary: { moves: ['unglossary'] },
  unantonym: { moves: ['unantonym'] },
  state: { moves: ['release-frame'] },
  unstate: { moves: ['unstate'] },
  'state-initial': { moves: ['vacuous-initial'] },
  classify: { moves: ['declassify-constraint', 'flip-negated@second'] },
  term: { moves: ['alias-contraries-term@forward', 'alias-contraries-term@reverse'] },
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
}

/**
 * Every distinct phrase on its own axis. Fresh per run, so a vector depends only on the order
 * phrases are first seen inside ONE run — deterministic for a fixed document.
 */
const orthogonalEmbedder = (): Embedder => {
  const axes = new Map<string, number>()
  const DIM = 512
  return async (texts) =>
    texts.map((t) => {
      let axis = axes.get(t)
      if (axis === undefined) {
        axis = axes.size
        if (axis >= DIM) throw new Error('orthogonal embedder ran out of axes')
        axes.set(t, axis)
      }
      const v = new Float32Array(DIM)
      v[axis] = 1
      return v
    })
}

/** One `check` result, reduced to what the gate and the snapshot read. */
export interface RunResult {
  readonly kind: 'ran'
  readonly exit: number
  readonly verified: boolean
  readonly signalFires: boolean
  readonly errorCodes: readonly string[]
  readonly demotions: readonly string[]
  readonly codes: readonly string[]
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
  signal: Signal,
): Promise<Outcome> => {
  if (embedder === 'stub-env' && process.env[EMBED_STUB_ENV] !== '1') {
    throw new Error(`the embedding-stub move needs ${EMBED_STUB_ENV}=1 (vitest.config.ts sets it)`)
  }
  const store = Layer.succeed(DocStore)(
    DocStore.of({
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
          embedder === 'stub-env' ? wiring.envEmbedder : embedderLayerOf(orthogonalEmbedder()),
        ),
      ),
    ),
  )
  if (result._tag === 'Failure') {
    const failure = result.failure as { readonly _tag?: unknown } | null
    return { kind: 'operational', tag: String(failure?._tag ?? 'unknown') }
  }
  const { exit, data } = result.success
  return {
    kind: 'ran',
    exit,
    verified: data.verified,
    signalFires: signalFires(data, document, signal),
    errorCodes: uniq(data.findings.filter((f) => f.severity === 'error').map((f) => f.code)),
    demotions: uniq(data.coverage.demotions.map((d) => d.reason)),
    codes: uniq(data.findings.map((f) => f.code)),
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
        runCheck(wiring, runtime, doc, knobs, embedder, fixture.signal)
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
      for (const move of moves) {
        const applied = await applyEdit(
          move.edit({ fixture, doc, baselineCodes }),
          doc,
          wiring.mutateOptions,
        )
        const outcome: Outcome =
          applied.kind === 'check'
            ? await run(applied.doc, applied.knobs, applied.embedder)
            : applied
        cells.push({
          fixture: fixture.id,
          move: move.id,
          outcome,
          changed: applied.kind !== 'check' || applied.changed,
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
}

const pairKey = (fixture: string, move: string): string => `${fixture} × ${move}`

const brief = (outcome: Outcome): string =>
  outcome.kind === 'ran'
    ? `exit ${outcome.exit}, verified=${outcome.verified}, signal ${outcome.signalFires ? 'fires' : 'gone'}`
    : outcome.kind

/** Score a matrix against the registry. Only rows for fixtures IN the matrix are considered. */
export const gateFailures = (
  matrix: Matrix,
  known: readonly KnownEscape[] = KNOWN_ESCAPES,
): GateFailures => {
  const scored = new Set(matrix.baselines.keys())
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
 * heaviest), and one file would serialize all of them. Measured on a 16-core devbox: ~14 s of
 * test time across the four shards, ~6 s wall. `gaming.test.ts` asserts this partitions
 * {@link FIXTURES} exactly and that every shard has its file.
 */
export const SHARDS: Readonly<Record<string, readonly string[]>> = {
  a: ['feature-interaction', 'state-invariant'],
  b: ['one-trigger-contradiction', 'contrary-pair'],
  c: ['numeric-conflict', 'temporal-conflict'],
  d: ['glossary-bridged', 'term-bridged'],
  e: ['registered-contrary'],
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
      failures = gateFailures(matrix)
    }, 180_000)

    it('every baseline detects its seeded defect, by the named signal', () => {
      expect(failures.baselineMisses).toEqual([])
    })

    it('every control reaches a clean verdict — the fixture can discriminate', () => {
      expect(failures.controlFailures).toEqual([])
    })

    it('no move reaches a clean verdict unless KNOWN_ESCAPES lists the pair', () => {
      expect(
        failures.unlistedEscapes,
        'new escape: register it with the AC that closes it',
      ).toEqual([])
    })

    it('every KNOWN_ESCAPES row still escapes — a closed gap deletes its row (I-5)', () => {
      expect(failures.staleEscapes, 'the row no longer escapes: delete it').toEqual([])
    })

    it('every applied move changed the document or the run', () => {
      expect(failures.inertMoves).toEqual([])
    })

    it('the whole matrix is pinned, so a move caught a different way is a visible diff', async () => {
      await expect(renderMatrix(matrix)).toMatchFileSnapshot(`./__snapshots__/gaming-${key}.txt`)
    })
  })
}
