/**
 * SPEC 007 STORY 1 — the state-model tier never proves a false claim.
 *
 * Every case here is a reproducer from `.erpaval/specs/007-controlled-vocabulary/spec.md`
 * (AC-1-1 … AC-1-6) that a formal-methods review found LIVE on the built CLI: a proof,
 * a certificate, or a trace that was wrong while every existing gate stayed green. Each
 * case asserts the NAMED verdict the model's semantics require, computed by hand from a
 * model small enough to enumerate on paper, so the expected answer never comes from the
 * solver under test.
 */

import { Effect, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import {
  DOC_VERSION,
  emptyDocument,
  FRAME_VERDICT_TABLE,
  type Requirement,
  RequirementsDocument,
  STATE_VAR_NAME_PATTERN,
  type StateVariable,
} from '../requirements/document.ts'
import { foldOps } from '../requirements/mutate.ts'
import { type DocumentOp, decodeOp } from '../requirements/ops.ts'
import {
  isExprError,
  parseExpression,
  validateEffect,
  validateExpression,
} from '../requirements/state-expr.ts'
import { decideFrameVerdict, type ReachabilityReport, runReachability } from './reachability.ts'
import { projectReachability } from './reachability-report.ts'

const TS = '2026-01-01T00:00:00.000Z'

/** A requirement with a state classification. `id` is passed explicitly so a test can
 * choose which requirement sorts first. */
const req = (
  id: string,
  key: string,
  fields: Partial<Requirement> & Pick<Requirement, 'responseKind'>,
): Requirement => ({
  id,
  key,
  patternType: 'ubiquitous',
  systemName: 'controller',
  systemResponse: 'behave',
  negated: false,
  sentence: 'The controller shall behave.',
  priority: 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: TS,
  updatedAt: TS,
  ...fields,
})

/** A fixed UUID whose sort position is its `n`. */
const uuid = (n: number): string => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`

const effect = (n: number, key: string, stateEffect: string): Requirement =>
  req(uuid(n), key, { responseKind: 'effect', stateEffect })
const constraint = (n: number, key: string, stateConstraint: string): Requirement =>
  req(uuid(n), key, { responseKind: 'constraint', stateConstraint })

const enumVar = (name: string, domain: readonly string[], initial?: string): StateVariable => ({
  name,
  type: 'enum',
  frame: 'volatile',
  domain: [...domain],
  ...(initial !== undefined ? { initial } : {}),
})

const docOf = (
  variables: readonly StateVariable[],
  requirements: readonly Requirement[],
): RequirementsDocument => ({
  docVersion: DOC_VERSION,
  requirements: Object.fromEntries(requirements.map((r) => [r.id, r])),
  stateModel: { variables: [...variables] },
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
})

const run = (document: RequirementsDocument): Promise<ReachabilityReport> =>
  Effect.runPromise(runReachability(document).pipe(Effect.provide(Layer.fresh(solverServiceLayer))))

const resultFor = (report: ReachabilityReport, label: string) => {
  const found = report.results.find((r) => r.label === label)
  if (found === undefined) throw new Error(`no result for ${label}`)
  return found
}

const traceOf = (report: ReachabilityReport, label: string): readonly string[] =>
  (resultFor(report, label).trace?.steps ?? []).map((s) => s.rule)

// ---------------------------------------------------------------------------
// AC-1-1 — an enum member resolves against the sort the type checker assigned
// ---------------------------------------------------------------------------

describe('AC-1-1 — an enum member is encoded in ITS OWN enum, never the first that declares it', () => {
  /**
   * `open` is a member of BOTH enums: index 0 of `door`, index 2 of `valve`. First-match
   * lookup encoded `valve = open` as `valve = 0`, which is `valve = shut` — so the initial
   * state satisfied the constraint it violates, and the tier certified a PROVED.
   *
   * By hand: `valve` starts at `open`, so `valve = shut` is false in the initial state.
   * The only correct verdict is VIOLATED, witnessed by the initial state alone.
   */
  const SHARED_MEMBER = (): RequirementsDocument =>
    docOf(
      [
        enumVar('door', ['open', 'closed']),
        enumVar('valve', ['shut', 'ajar', 'open'], 'valve = open'),
      ],
      [effect(1, 'E1', 'when valve = open: valve := open'), constraint(2, 'C1', 'valve = shut')],
    )

  it('reports the constraint VIOLATED in the initial state, with the trace init -> C1', async () => {
    const report = await run(SHARED_MEMBER())
    expect(resultFor(report, 'C1').verdict).toBe('VIOLATED')
    expect(traceOf(report, 'C1')).toEqual(['init', 'C1'])
  })
})

describe('AC-1-1 — the validator hands the encoder members already bound to their enum', () => {
  const model = {
    variables: [enumVar('door', ['open', 'closed']), enumVar('valve', ['shut', 'ajar', 'open'])],
  }

  it.each([
    ['valve = open', 'right'],
    ['open = valve', 'left'],
  ] as const)('%s resolves `open` to valve`s domain, not door`s', (source, side) => {
    const expr = validateExpression(source, model, 'constraint')
    if (isExprError(expr) || expr.kind !== 'compare') throw new Error('expected a comparison')
    expect(expr[side]).toEqual({ kind: 'member', enumOf: 'valve', name: 'open' })
  })

  it('an effect`s guard and assigned value are resolved the same way', () => {
    const parsed = validateEffect('when door = open: valve := open', model)
    if (isExprError(parsed)) throw new Error(parsed.error)
    expect(parsed.guard).toEqual({
      kind: 'compare',
      op: '=',
      left: { kind: 'ref', name: 'door' },
      right: { kind: 'member', enumOf: 'door', name: 'open' },
    })
    expect(parsed.assignments[0]?.value).toEqual({ kind: 'member', enumOf: 'valve', name: 'open' })
  })
})

// ---------------------------------------------------------------------------
// AC-1-2 — a write outside a declared range is a finding, never a disabled step
// ---------------------------------------------------------------------------

describe('AC-1-2 — an effect that writes outside its target`s declared range is reported', () => {
  const intVar = (name: string, max: number, initial: string): StateVariable => ({
    name,
    type: 'int',
    frame: 'volatile',
    domain: { min: 0, max },
    initial,
  })
  /**
   * `queue_len` is declared 0..2, and ENQ_FULL fires exactly at 2 and writes 3. Conjoining
   * the range into the transition relation made that step UNSATISFIABLE — so ENQ_FULL never
   * fired, `dropped` never became true, and `not dropped` came back proved under hypotheses
   * with exit 0. By hand: ENQ, ENQ reaches queue_len = 2; ENQ_FULL then writes 3.
   */
  const QUEUE = (max: number): RequirementsDocument =>
    docOf(
      [
        intVar('queue_len', max, 'queue_len = 0'),
        { name: 'dropped', type: 'bool', frame: 'volatile', initial: 'dropped = false' },
      ],
      [
        effect(1, 'ENQ', 'when queue_len < 2: queue_len := queue_len + 1'),
        effect(2, 'ENQ_FULL', 'when queue_len = 2: queue_len := queue_len + 1, dropped := true'),
        effect(3, 'DEQ', 'when queue_len > 0: queue_len := queue_len - 1'),
        constraint(4, 'NO_DROP', 'not dropped'),
      ],
    )

  it('reports FND_RANGE_VIOLATION (error) naming ENQ_FULL and its reachable pre-state', async () => {
    const projection = projectReachability(await run(QUEUE(2)), 'doc.json')
    const found = projection.findings.filter((f) => f.code === 'FND_RANGE_VIOLATION')
    expect(found).toHaveLength(1)
    const [finding] = found
    expect(finding?.severity).toBe('error')
    expect(finding?.requirementIds).toEqual([uuid(2)])
    expect(finding?.message).toContain('ENQ_FULL')
    expect(finding?.evidence?.variable).toBe('queue_len')
    expect(finding?.evidence?.preState).toEqual({ queue_len: '2', dropped: 'false' })
    expect(finding?.evidence?.value).toBe('3')
    expect(finding?.evidence?.trace).toEqual(['init', 'ENQ', 'ENQ', 'ENQ_FULL'])
  })

  it('does not disable the step: the constraint it breaks is reported VIOLATED', async () => {
    const report = await run(QUEUE(2))
    expect(resultFor(report, 'NO_DROP').verdict).toBe('VIOLATED')
  })

  it('the in-range control (max 3) reports no range violation', async () => {
    const projection = projectReachability(await run(QUEUE(3)), 'doc.json')
    expect(projection.findings.filter((f) => f.code === 'FND_RANGE_VIOLATION')).toEqual([])
  })
})

describe('AC-1-2 — an out-of-range value PERSISTS through a step that does not write it', () => {
  /**
   * `x` and `y` are both 0..2 and start at 2. A writes `x := 3`, D writes `y := 3`, and C
   * says they are never both 3. The unpinned (`none`) run used to REDRAW an unwritten
   * variable inside its declared range, so after `init -> A` the 3 in `x` could not survive
   * D's step: C came back PROVED "with nothing assumed beyond what the document states"
   * beside the tool's own two FND_RANGE_VIOLATION errors reaching x = 3 and y = 3.
   *
   * By hand: init (2, 2) -> A (3, 2) -> D (3, 3), and D writes only y, so x stays 3 under
   * every frame. The only correct verdict is VIOLATED, two steps deep, in either order.
   */
  const OVERFLOWS = (frame: StateVariable['frame']): RequirementsDocument =>
    docOf(
      [
        { name: 'x', type: 'int', frame, domain: { min: 0, max: 2 }, initial: 'x = 2' },
        { name: 'y', type: 'int', frame, domain: { min: 0, max: 2 }, initial: 'y = 2' },
      ],
      [
        effect(1, 'A', 'when x = 2: x := x + 1'),
        effect(2, 'D', 'when y = 2: y := y + 1'),
        constraint(3, 'C', 'not (x = 3 and y = 3)'),
      ],
    )

  for (const frame of ['stable', 'volatile'] as const) {
    it(`${frame}: C is VIOLATED two steps deep, ending at x = 3, y = 3`, async () => {
      const report = await run(OVERFLOWS(frame))
      const result = resultFor(report, 'C')
      expect(result.verdict).toBe('VIOLATED')
      expect([
        ['init', 'A', 'D', 'C'],
        ['init', 'D', 'A', 'C'],
      ]).toContainEqual(traceOf(report, 'C'))
      expect(result.trace?.states.at(-1)).toEqual({ x: '3', y: '3' })
    })

    it(`${frame}: no proof is reported beside the range violations that reach it`, async () => {
      const projection = projectReachability(await run(OVERFLOWS(frame)), 'doc.json')
      const codes = projection.findings.map((f) => f.code)
      expect(codes).not.toContain('FND_REACHABILITY_PROVED')
      expect(codes).not.toContain('FND_REACHABILITY_UNDER_HYPOTHESES')
      expect(codes).toContain('FND_REACHABILITY_VIOLATED')
      expect(codes.filter((c) => c === 'FND_RANGE_VIOLATION')).toHaveLength(2)
    })
  }

  /**
   * The MIXED-frame shape: the `declared` run pins the stable `y` but leaves the volatile
   * `x` free, so it is the one run where a FREE variable must keep an out-of-range value
   * while a PINNED one changes. All-stable docs pin everything under `declared`, and
   * all-volatile docs skip the `declared` run, so neither case above exercises it.
   *
   * `x` (volatile) is 0..2 and starts at 2; `y` (stable) starts at 0. A writes `x := 3`
   * while y = 0; D writes `y := 1` once x = 3. By hand: init (2, 0) -> A (3, 0) -> D (3, 1),
   * and D writes only y, so x stays 3 under every frame. The only correct verdict is
   * VIOLATED via init -> A -> D. The unbounded volatile `z` exists only to push the
   * explicit-state cross-check past its cap, so the Horn tier's answer stands alone: a
   * `declared` step that redraws x back into 0..2 comes back PROVED_UNDER_HYPOTHESES.
   */
  const MIXED = (withUnbounded: boolean): RequirementsDocument =>
    docOf(
      [
        { name: 'x', type: 'int', frame: 'volatile', domain: { min: 0, max: 2 }, initial: 'x = 2' },
        { name: 'y', type: 'int', frame: 'stable', domain: { min: 0, max: 2 }, initial: 'y = 0' },
        ...(withUnbounded
          ? [{ name: 'z', type: 'int', frame: 'volatile', initial: 'z = 0' } as const]
          : []),
      ],
      [
        effect(1, 'A', 'when y = 0: x := x + 1'),
        effect(2, 'D', 'when x = 3: y := 1'),
        constraint(3, 'C', 'not (x = 3 and y = 1)'),
      ],
    )

  for (const withUnbounded of [true, false]) {
    const label = withUnbounded ? 'mixed frames, search capped' : 'mixed frames'
    it(`${label}: C is VIOLATED via init -> A -> D, ending at x = 3, y = 1`, async () => {
      const report = await run(MIXED(withUnbounded))
      const result = resultFor(report, 'C')
      expect(result.verdict).toBe('VIOLATED')
      expect(traceOf(report, 'C')).toEqual(['init', 'A', 'D', 'C'])
      expect(result.trace?.states.at(-1)).toMatchObject({ x: '3', y: '1' })
    })

    it(`${label}: no proof and no certificate disagreement is reported`, async () => {
      const projection = projectReachability(await run(MIXED(withUnbounded)), 'doc.json')
      const codes = projection.findings.map((f) => f.code)
      expect(codes).not.toContain('FND_REACHABILITY_PROVED')
      expect(codes).not.toContain('FND_REACHABILITY_UNDER_HYPOTHESES')
      expect(codes).not.toContain('FND_CERTIFICATE_DISAGREES')
      expect(codes).toContain('FND_REACHABILITY_VIOLATED')
    })
  }
})

// ---------------------------------------------------------------------------
// AC-1-3 — a trace is read off the solver's STATE sequence, and names real steps
// ---------------------------------------------------------------------------

describe('AC-1-3 — a counterexample trace names steps that actually happen', () => {
  /**
   * `st` runs IDLE -> RUNNING -> DONE. By hand: `NOT_STARTED` (`st = IDLE`) is violated
   * after ONE step, START; `BROKEN` (`st = IDLE and st = RUNNING`) is unsatisfiable, so it
   * is violated by the initial state itself. Z3's rule-name trace blamed FINISH — a
   * requirement whose guard (`st = RUNNING`) is false in the initial state — whenever
   * FINISH's id sorted first.
   */
  const LIFECYCLE = (finishFirst: boolean, withFlag: boolean): RequirementsDocument =>
    docOf(
      [
        enumVar('st', ['IDLE', 'RUNNING', 'DONE'], 'st = IDLE'),
        ...(withFlag
          ? [{ name: 'flag', type: 'bool', frame: 'volatile', initial: 'flag = false' } as const]
          : []),
      ],
      [
        effect(
          finishFirst ? 1 : 2,
          'FINISH',
          withFlag
            ? 'when st = RUNNING: st := DONE, flag := true'
            : 'when st = RUNNING: st := DONE',
        ),
        effect(finishFirst ? 2 : 1, 'START', 'when st = IDLE: st := RUNNING'),
        constraint(3, 'NOT_STARTED', 'st = IDLE'),
        constraint(4, 'BROKEN', 'st = IDLE and st = RUNNING'),
      ],
    )

  it.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ])('finishFirst=%s flag=%s: each trace is the real path', async (finishFirst, withFlag) => {
    const report = await run(LIFECYCLE(finishFirst, withFlag))
    expect(resultFor(report, 'NOT_STARTED').verdict).toBe('VIOLATED')
    expect(traceOf(report, 'NOT_STARTED')).toEqual(['init', 'START', 'NOT_STARTED'])
    expect(resultFor(report, 'BROKEN').verdict).toBe('VIOLATED')
    expect(traceOf(report, 'BROKEN')).toEqual(['init', 'BROKEN'])
  })

  it('carries the state sequence, so each named step can be checked against it', async () => {
    const report = await run(LIFECYCLE(true, true))
    const trace = resultFor(report, 'NOT_STARTED').trace
    expect(trace?.states).toEqual([
      { st: 'IDLE', flag: 'false' },
      { st: 'RUNNING', flag: 'false' },
    ])
  })

  /**
   * THE PERMUTATION GATE. A trace that depends on which requirement's id sorts first is
   * a trace of the encoding, not of the model.
   */
  it('is identical under every permutation of requirement ids', async () => {
    const keys = ['FINISH', 'START', 'RESET'] as const
    const bodies: Record<(typeof keys)[number], string> = {
      FINISH: 'when st = RUNNING: st := DONE',
      START: 'when st = IDLE: st := RUNNING',
      RESET: 'when st = DONE: st := IDLE',
    }
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ] as const
    const traces = new Set<string>()
    for (const order of permutations) {
      const report = await run(
        docOf(
          [enumVar('st', ['IDLE', 'RUNNING', 'DONE'], 'st = IDLE')],
          [
            ...order.map((k, position) => effect(position + 1, keys[k], bodies[keys[k]])),
            constraint(9, 'NEVER_DONE', 'st != DONE'),
          ],
        ),
      )
      traces.add(traceOf(report, 'NEVER_DONE').join(' -> '))
    }
    expect([...traces]).toEqual(['init -> START -> FINISH -> NEVER_DONE'])
  })
})

// ---------------------------------------------------------------------------
// AC-1-4 — keyword-shaped names are refused under case folding; integers stay exact
// ---------------------------------------------------------------------------

describe('AC-1-4 — a name equal to an expression keyword under case folding is refused', () => {
  /**
   * The lexer case-folds keywords (`True` lexes as the literal `true`, `NOT` as `not`), so a
   * variable named `True` could be DECLARED and never REFERENCED: `initial: "True"` read as
   * the literal, the constraint `True` held trivially, and the tier certified a PROVED over
   * a variable an effect sets to false.
   */
  const SHAPES = ['True', 'NOT', 'And', 'oR', 'FALSE', 'When'] as const

  it.each(SHAPES)('the schema pattern refuses %s', (name) => {
    expect(STATE_VAR_NAME_PATTERN.test(name)).toBe(false)
  })

  it.each(SHAPES)('a `state` op declaring %s is refused at the fold, naming the word', (name) => {
    const folded = foldOps(emptyDocument(), [{ op: 'state', name, type: 'bool' }], TS)
    expect(folded.results[0]?.ok).toBe(false)
    expect(folded.results[0]?.code).toBe('ERR_USAGE')
    expect(folded.results[0]?.error).toContain(JSON.stringify(name))
  })

  it('an enum MEMBER spelled like a keyword is refused the same way', () => {
    const folded = foldOps(
      emptyDocument(),
      [{ op: 'state', name: 'mode', type: 'enum', domain: ['idle', 'True'] }],
      TS,
    )
    expect(folded.results[0]?.ok).toBe(false)
    expect(folded.results[0]?.error).toContain('"True"')
  })

  it('names that merely CONTAIN a keyword stay legal', () => {
    for (const name of ['True_state', 'notified', 'android', 'whenever', 'or_count']) {
      expect(STATE_VAR_NAME_PATTERN.test(name), name).toBe(true)
    }
  })
})

describe('AC-1-4 — integer literals reach Z3 as their decimal source, never through a Number', () => {
  /** 2^53 + 1 is the first integer a JavaScript `Number` cannot represent. */
  const BIG = '9007199254740993'

  it('the parser carries the literal exactly', () => {
    const expr = parseExpression(`x = ${BIG}`)
    if (isExprError(expr) || expr.kind !== 'compare' || expr.right.kind !== 'int') {
      throw new Error('expected x = <int>')
    }
    expect(String(expr.right.value)).toBe(BIG)
  })

  /**
   * `x` starts at 2^53 and nothing changes it, so `x = 2^53 + 1` is false in the initial
   * state. Through a `Number` both literals round to 2^53 and the constraint "holds".
   */
  it('a constraint differing from the initial value only past 2^53 is VIOLATED', async () => {
    const report = await run(
      docOf(
        [{ name: 'x', type: 'int', frame: 'volatile', initial: 'x = 9007199254740992' }],
        [effect(1, 'E1', 'x := x'), constraint(2, 'C1', `x = ${BIG}`)],
      ),
    )
    expect(resultFor(report, 'C1').verdict).toBe('VIOLATED')
  })
})

// ---------------------------------------------------------------------------
// AC-1-6 — `frame` does what it says, and the frame repair moves the verdict
// ---------------------------------------------------------------------------

describe('AC-1-6 — the `frame` field documents exactly the lattice the tier implements', () => {
  it.each(
    FRAME_VERDICT_TABLE.map((row) => [row.verdict, row] as const),
  )('the documented %s row is what decideFrameVerdict returns', (_verdict, row) => {
    expect(decideFrameVerdict(row.none, row.declared ?? undefined, row.full ?? undefined)).toBe(
      row.verdict,
    )
    // A `reachable` declared run also stands for "not run" (nothing declared stable).
    if (row.declared === 'reachable') {
      expect(decideFrameVerdict(row.none, undefined, row.full ?? undefined)).toBe(row.verdict)
    }
  })

  it('the published field description renders every row of that table', () => {
    // Read from the JSON Schema the manifest publishes, so this is the text an agent reads.
    const description = JSON.stringify(Schema.toJsonSchemaDocument(RequirementsDocument))
    for (const row of FRAME_VERDICT_TABLE) {
      expect(description).toContain(`-> ${row.verdict}: ${row.reads}`)
    }
    // The stale sentence that described a DIFFERENT second run is gone.
    expect(description).not.toContain('once with the declared')
  })
})

describe('AC-1-6 — the frame repair is an op `apply` accepts, and it moves the verdict', () => {
  /**
   * `level` is an INT that no requirement writes; `tick` is the only thing that changes.
   * With `level` free, `level = 0` is violable by a change no requirement makes; with it
   * held, it holds. So the verdict is decided by the frame declaration alone:
   * `stable` -> PROVED_UNDER_HYPOTHESES (the document states the hypothesis), `volatile`
   * -> UNKNOWN (the proof needs a hypothesis the document does not state).
   */
  const LEVEL = (frame: 'stable' | 'volatile'): RequirementsDocument =>
    docOf(
      [
        {
          name: 'level',
          type: 'int',
          frame,
          domain: { min: 0, max: 3 },
          initial: 'level = 0',
        },
        { name: 'tick', type: 'bool', frame: 'volatile', initial: 'tick = false' },
      ],
      [effect(1, 'TICK', 'tick := not tick'), constraint(2, 'LEVEL_ZERO', 'level = 0')],
    )

  const decodeAll = (ops: readonly object[]): Promise<readonly DocumentOp[]> =>
    Effect.runPromise(Effect.forEach(ops, (op) => decodeOp(op)))

  /** The single demotion for LEVEL_ZERO, and its repair ops. */
  const repairOf = async (document: RequirementsDocument) => {
    const report = await run(document)
    const projection = projectReachability(report, 'doc.json')
    const demotion = projection.demotions.find((d) => d.requirementIds.includes(uuid(2)))
    return { verdict: resultFor(report, 'LEVEL_ZERO').verdict, projection, demotion }
  }

  it('stable -> PROVED_UNDER_HYPOTHESES naming the DECLARED variable', async () => {
    const report = await run(LEVEL('stable'))
    const result = resultFor(report, 'LEVEL_ZERO')
    expect(result.verdict).toBe('PROVED_UNDER_HYPOTHESES')
    expect(result.hypotheses?.map((h) => h.variable)).toEqual(['level'])
  })

  it('volatile -> UNKNOWN, because the proof needs a frame the document does not declare', async () => {
    const report = await run(LEVEL('volatile'))
    const result = resultFor(report, 'LEVEL_ZERO')
    expect(result.verdict).toBe('UNKNOWN')
    expect(result.unknownReason).toBe('frame-undeclared')
  })

  it('ROUND TRIP: apply the PUH repair, re-check, and the verdict moves', async () => {
    const before = LEVEL('stable')
    const { verdict, demotion } = await repairOf(before)
    expect(verdict).toBe('PROVED_UNDER_HYPOTHESES')
    const ops = demotion?.repair?.ops ?? []
    expect(ops.length).toBeGreaterThan(0)
    // The op REDECLARES the variable with its OWN declared type and range.
    expect(ops[0]).toMatchObject({ op: 'state', name: 'level', type: 'int', min: 0, max: 3 })

    // Decoded through the SAME schema `apply` uses (excess properties refused), so an op
    // `apply` would reject cannot pass here.
    const folded = foldOps(before, await decodeAll(ops), TS)
    expect(folded.results.map((r) => r.ok)).toEqual(ops.map(() => true))
    const after = await repairOf(folded.document)
    expect(after.verdict).not.toBe('PROVED_UNDER_HYPOTHESES')
  })

  it('ROUND TRIP the other way: apply the frame-undeclared repair, and the verdict moves', async () => {
    const before = LEVEL('volatile')
    const { verdict, demotion } = await repairOf(before)
    expect(verdict).toBe('UNKNOWN')
    const ops = demotion?.repair?.ops ?? []
    expect(ops).toContainEqual(expect.objectContaining({ op: 'state', name: 'level', type: 'int' }))

    // Decoded through the SAME schema `apply` uses (excess properties refused), so an op
    // `apply` would reject cannot pass here.
    const folded = foldOps(before, await decodeAll(ops), TS)
    expect(folded.results.map((r) => r.ok)).toEqual(ops.map(() => true))
    const after = await repairOf(folded.document)
    expect(after.verdict).toBe('PROVED_UNDER_HYPOTHESES')
  })
})
