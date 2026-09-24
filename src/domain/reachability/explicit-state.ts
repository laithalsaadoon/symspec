/**
 * THE EXPLICIT-STATE CROSS-CHECK — a second, independent checker for every proof the
 * Horn tier reports (spec 007 AC-1-5).
 *
 * ## Why a second checker, when the certificate is already re-verified
 *
 * The V28 certificate check re-discharges Spacer's invariant against THE SAME ENCODING the
 * rules were built from. That catches a solver that lies about an encoding; it cannot catch
 * an ENCODING that lies about the model. The enum first-match defect (AC-1-1) was exactly
 * that: `valve = open` compiled to `valve = shut`, Spacer proved the compiled question
 * correctly, and the certificate re-verified the compiled question correctly. Two checks,
 * one wrong question.
 *
 * So this module answers the same question by a route that shares NOTHING with the SMT
 * encoder beyond the parsed, type-resolved expression AST: no Z3, no integer encoding of
 * enums (a member is its NAME here), no shared transition builder. It enumerates the
 * reachable states breadth-first and evaluates the constraint on each. Where it can finish,
 * its answer is a decision procedure, and a disagreement with the Horn tier means one of
 * the two is wrong — which is reported, never resolved by picking one.
 *
 * ## The semantics it implements, stated independently
 *
 * - A state assigns every declared variable a value: a bool, an arbitrary-precision
 *   integer, or an enum member name.
 * - The initial states are every assignment within the declared ranges satisfying every
 *   `initial` predicate.
 * - An effect fires from a state where its guard holds. Its assignments are evaluated
 *   SIMULTANEOUSLY on the pre-state. A variable it writes takes the computed value (which
 *   may lie outside a declared range — that is `FND_RANGE_VIOLATION`'s business, not a
 *   disabled step). A variable it does not write is PINNED to its pre-state value when the
 *   frame pins it (`full`: every variable; `declared`: the `stable` ones; `none`: none),
 *   and otherwise FREE: it takes every value in its declared domain.
 *
 * ## When it does not run
 *
 * Only when the answer is finite and small: every variable a step leaves free, and every
 * variable the initial predicates leave unpinned, must have a finite domain, and the
 * enumeration must stay within {@link REACHABILITY_BFS_STATE_CAP} states and
 * {@link REACHABILITY_BFS_WORK_CAP} generated successors. Otherwise it returns
 * `not-applicable` with the reason, and the proof stands on the Horn tier and its
 * certificate alone — which is what it stood on before this module existed.
 */

import type { StateVariable } from '../requirements/document.ts'
import type { Expr, StateEffect } from '../requirements/state-expr.ts'

/**
 * The most REACHABLE STATES the cross-check will enumerate before giving up.
 *
 * Chosen from what it buys against what it costs. What it buys: every spec 007 reproducer
 * and every worked fixture in this repository has a reachable set in the single or double
 * digits, so a realistic hand-written state model — a handful of bools, a mode enum, a
 * small bounded counter — is cross-checked with orders of magnitude to spare. What it
 * costs, measured on this build: a 10,000-state model (a 0..2499 counter and two bools)
 * enumerates in ~80ms, and a model that exhausts {@link REACHABILITY_BFS_WORK_CAP} instead
 * gives up in ~300ms — both well inside the 2,000ms default budget the Horn tier spends on
 * ONE query. A model beyond the cap is exactly the model Spacer exists for, and it keeps
 * its certificate.
 */
export const REACHABILITY_BFS_STATE_CAP = 10_000

/**
 * The most SUCCESSORS (including duplicates) the cross-check will generate before giving up.
 *
 * The state cap alone does not bound the work: under the `none` frame every unwritten
 * variable is free, so ONE step from ONE state fans out over the product of their domains
 * (2^11 for eleven free bools). Twenty successors per reachable state at the state cap.
 */
export const REACHABILITY_BFS_WORK_CAP = 200_000

/** A variable's value: bool, arbitrary-precision int, or enum member name. */
type Value = boolean | bigint | string

type State = ReadonlyMap<string, Value>

/** How much of the pre-state a step keeps for the variables it does not write. */
export type ExplicitFrame = 'none' | 'declared' | 'full'

/** The model, as this module reads it. Structural, so the caller passes its own record. */
export interface ExplicitModel {
  readonly variables: readonly StateVariable[]
  readonly initial: readonly Expr[]
  readonly effects: readonly { readonly label: string; readonly effect: StateEffect }[]
  readonly stableVars: readonly string[]
}

/** The cross-check's answer for one constraint. */
export type ExplicitVerdict =
  /** Every reachable state satisfies the constraint. `states` is how many there are. */
  | { readonly status: 'holds'; readonly states: number }
  /** A reachable state violates it: the path, and the states along it. */
  | {
      readonly status: 'violated'
      readonly states: number
      readonly trace: readonly string[]
      readonly path: readonly Readonly<Record<string, string>>[]
    }
  /** The enumeration could not be completed; nothing is claimed. */
  | { readonly status: 'not-applicable'; readonly reason: string }

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Evaluate a type-resolved expression on a state. The AST is validated, so a sort
 * mismatch here is a validator defect and throws. */
const evaluate = (expr: Expr, state: State): Value => {
  switch (expr.kind) {
    case 'bool':
      return expr.value
    case 'int':
      return expr.value
    case 'member':
      return expr.name
    case 'ref': {
      const value = state.get(expr.name)
      if (value === undefined) throw new Error(`explicit-state: unbound variable ${expr.name}`)
      return value
    }
    case 'not':
      return !truth(expr.operand, state)
    case 'and':
      return expr.operands.every((o) => truth(o, state))
    case 'or':
      return expr.operands.some((o) => truth(o, state))
    case 'arith': {
      const left = integer(expr.left, state)
      const right = integer(expr.right, state)
      return expr.op === '+' ? left + right : left - right
    }
    case 'compare': {
      const left = evaluate(expr.left, state)
      const right = evaluate(expr.right, state)
      switch (expr.op) {
        case '=':
          return left === right
        case '!=':
          return left !== right
        case '<':
          return (left as bigint) < (right as bigint)
        case '<=':
          return (left as bigint) <= (right as bigint)
        case '>':
          return (left as bigint) > (right as bigint)
        case '>=':
          return (left as bigint) >= (right as bigint)
      }
    }
  }
}

const truth = (expr: Expr, state: State): boolean => {
  const value = evaluate(expr, state)
  if (typeof value !== 'boolean') throw new Error('explicit-state: expected a boolean')
  return value
}

const integer = (expr: Expr, state: State): bigint => {
  const value = evaluate(expr, state)
  if (typeof value !== 'bigint') throw new Error('explicit-state: expected an integer')
  return value
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

/** Every value a variable's declared type admits, or `undefined` when that is infinite. */
const finiteDomain = (variable: StateVariable): readonly Value[] | undefined => {
  if (variable.type === 'bool') return [false, true]
  if (variable.type === 'enum') return variable.domain
  const min = variable.domain?.min
  const max = variable.domain?.max
  if (min === undefined || max === undefined) return undefined
  const values: bigint[] = []
  for (let n = BigInt(min); n <= BigInt(max); n += 1n) values.push(n)
  return values
}

/** Whether a value lies within a variable's declared range. */
const inRange = (variable: StateVariable, value: Value): boolean => {
  if (variable.type !== 'int' || typeof value !== 'bigint') return true
  const min = variable.domain?.min
  const max = variable.domain?.max
  return (min === undefined || value >= BigInt(min)) && (max === undefined || value <= BigInt(max))
}

/** The integer literals an unbounded int is pinned to by a TOP-LEVEL `x = n` conjunct of
 * some initial predicate — the only way this module enumerates an unbounded initial. */
const pinnedLiterals = (name: string, initial: readonly Expr[]): readonly bigint[] => {
  const found: bigint[] = []
  const walk = (expr: Expr): void => {
    if (expr.kind === 'and') {
      for (const operand of expr.operands) walk(operand)
      return
    }
    if (expr.kind !== 'compare' || expr.op !== '=') return
    const { left, right } = expr
    if (left.kind === 'ref' && left.name === name && right.kind === 'int') found.push(right.value)
    if (right.kind === 'ref' && right.name === name && left.kind === 'int') found.push(left.value)
  }
  for (const predicate of initial) walk(predicate)
  return found.slice(0, 1)
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

const keyOf = (variables: readonly StateVariable[], state: State): string =>
  variables.map((v) => String(state.get(v.name))).join('\u0000')

const render = (
  variables: readonly StateVariable[],
  state: State,
): Readonly<Record<string, string>> =>
  Object.fromEntries(variables.map((v) => [v.name, String(state.get(v.name))]))

/** Every assignment to `names` drawn from `domains`, extending `base`. */
function* assignments(
  base: State,
  names: readonly string[],
  domains: ReadonlyMap<string, readonly Value[]>,
): Generator<State> {
  if (names.length === 0) {
    yield base
    return
  }
  const [first, ...rest] = names as [string, ...string[]]
  for (const value of domains.get(first) ?? []) {
    yield* assignments(new Map(base).set(first, value), rest, domains)
  }
}

/**
 * Decide, by explicit breadth-first enumeration, whether any reachable state of `model`
 * under `frame` violates `constraint`.
 *
 * Breadth-first, so a returned violation is at minimum depth; the trace names each step's
 * effect by label, and `path` carries the states it walks.
 */
export const explicitCheck = (
  model: ExplicitModel,
  constraint: Expr,
  frame: ExplicitFrame,
): ExplicitVerdict => {
  const variables = model.variables
  const domains = new Map<string, readonly Value[]>()
  for (const variable of variables) {
    const domain = finiteDomain(variable)
    if (domain !== undefined) domains.set(variable.name, domain)
  }

  // --- The initial states ---------------------------------------------------
  const initialCandidates = new Map<string, readonly Value[]>()
  let product = 1
  for (const variable of variables) {
    const pinned = variable.type === 'int' ? pinnedLiterals(variable.name, model.initial) : []
    const candidates =
      pinned.length > 0 ? pinned.filter((n) => inRange(variable, n)) : domains.get(variable.name)
    if (candidates === undefined) {
      return {
        status: 'not-applicable',
        reason: `the initial value of the unbounded int ${variable.name} is not pinned to a literal`,
      }
    }
    initialCandidates.set(variable.name, candidates)
    product *= candidates.length
    if (product > REACHABILITY_BFS_STATE_CAP) {
      return {
        status: 'not-applicable',
        reason: `more than ${REACHABILITY_BFS_STATE_CAP} candidate initial states`,
      }
    }
  }

  const seen = new Map<string, { state: State; parent?: string; via?: string }>()
  let frontier: string[] = []
  for (const state of assignments(
    new Map(),
    variables.map((v) => v.name),
    initialCandidates,
  )) {
    if (!model.initial.every((p) => truth(p, state))) continue
    const key = keyOf(variables, state)
    if (seen.has(key)) continue
    seen.set(key, { state })
    frontier.push(key)
  }

  const pinnedByFrame = new Set(
    frame === 'none' ? [] : frame === 'full' ? variables.map((v) => v.name) : model.stableVars,
  )
  let work = 0

  const violation = (key: string): ExplicitVerdict => {
    const trace: string[] = []
    const path: Readonly<Record<string, string>>[] = []
    let cursor: string | undefined = key
    while (cursor !== undefined) {
      const node = seen.get(cursor)
      if (node === undefined) break
      path.unshift(render(variables, node.state))
      if (node.via !== undefined) trace.unshift(node.via)
      cursor = node.parent
    }
    return { status: 'violated', states: seen.size, trace, path }
  }

  for (const key of frontier) {
    const node = seen.get(key)
    if (node !== undefined && !truth(constraint, node.state)) return violation(key)
  }

  // --- Breadth-first expansion ------------------------------------------------
  while (frontier.length > 0) {
    const next: string[] = []
    for (const key of frontier) {
      const pre = (seen.get(key) as { state: State }).state
      for (const { label, effect } of model.effects) {
        if (effect.guard !== undefined && !truth(effect.guard, pre)) continue
        const post = new Map(pre)
        const written = new Set<string>()
        for (const assignment of effect.assignments) {
          post.set(assignment.target, evaluate(assignment.value, pre))
          written.add(assignment.target)
        }
        const free = variables
          .map((v) => v.name)
          .filter((name) => !written.has(name) && !pinnedByFrame.has(name))
        for (const name of free) {
          if (!domains.has(name)) {
            return {
              status: 'not-applicable',
              reason: `the unbounded int ${name} is free in a step, so a step has infinitely many successors`,
            }
          }
        }
        for (const successor of assignments(post, free, domains)) {
          work += 1
          if (work > REACHABILITY_BFS_WORK_CAP) {
            return {
              status: 'not-applicable',
              reason: `more than ${REACHABILITY_BFS_WORK_CAP} successors generated`,
            }
          }
          const successorKey = keyOf(variables, successor)
          if (seen.has(successorKey)) continue
          seen.set(successorKey, { state: successor, parent: key, via: label })
          if (seen.size > REACHABILITY_BFS_STATE_CAP) {
            return {
              status: 'not-applicable',
              reason: `more than ${REACHABILITY_BFS_STATE_CAP} reachable states`,
            }
          }
          if (!truth(constraint, successor)) return violation(successorKey)
          next.push(successorKey)
        }
      }
    }
    frontier = next
  }
  return { status: 'holds', states: seen.size }
}
