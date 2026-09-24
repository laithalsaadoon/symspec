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

import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import {
  DOC_VERSION,
  type Requirement,
  type RequirementsDocument,
  type StateVariable,
} from '../requirements/document.ts'
import { isExprError, validateEffect, validateExpression } from '../requirements/state-expr.ts'
import { type ReachabilityReport, runReachability } from './reachability.ts'

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
