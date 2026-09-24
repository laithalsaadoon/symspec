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
 * variable the initial predicates leave unbounded, must have a finite domain, and the
 * enumeration must stay within {@link REACHABILITY_BFS_STATE_CAP} states and
 * {@link REACHABILITY_BFS_WORK_CAP} generated successors. Otherwise it returns
 * `not-applicable` with the reason, and the proof stands on the Horn tier and its
 * certificate alone — which is what it stood on before this module existed.
 *
 * The caps measure what the search VISITS, never what the declarations multiply out to. A
 * bounded int's range is a pair of bounds, sized before any value is produced; the initial
 * states are found by backtracking that prunes a branch as soon as its assigned prefix
 * refutes an initial predicate, so N bools each initialised `= false` are one initial
 * state reached in 2N steps, not 2^N candidates; an int's initial candidates
 * are narrowed to the interval its top-level literal comparisons leave; and a step's free
 * fan-out is sized from the domain sizes before a single successor is built.
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
    case 'compare':
      return compare(expr.op, evaluate(expr.left, state), evaluate(expr.right, state))
  }
}

const compare = (
  op: Extract<Expr, { kind: 'compare' }>['op'],
  left: Value,
  right: Value,
): boolean => {
  switch (op) {
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

/**
 * A set of values, SIZED before any value is produced. A bounded int's range is a pair of
 * bounds, never an array: `0..86400000` is a legitimate millisecond timeout, and building
 * it as a list would cost gigabytes before a single cap was consulted.
 */
interface Domain {
  readonly size: bigint
  readonly values: () => Iterable<Value>
}

const listed = (values: readonly Value[]): Domain => ({
  size: BigInt(values.length),
  values: () => values,
})

const interval = (lo: bigint, hi: bigint): Domain => ({
  size: hi < lo ? 0n : hi - lo + 1n,
  *values() {
    for (let n = lo; n <= hi; n += 1n) yield n
  },
})

/** Every value a variable's declared type admits, or `undefined` when that is infinite. */
const declaredDomain = (variable: StateVariable): Domain | undefined => {
  if (variable.type === 'bool') return listed([false, true])
  if (variable.type === 'enum') return listed(variable.domain)
  const min = variable.domain?.min
  const max = variable.domain?.max
  if (min === undefined || max === undefined) return undefined
  return interval(BigInt(min), BigInt(max))
}

/** The top-level conjuncts of the initial predicates: what EVERY initial state satisfies. */
const conjuncts = (initial: readonly Expr[]): readonly Expr[] => {
  const found: Expr[] = []
  const walk = (expr: Expr): void => {
    if (expr.kind === 'and') for (const operand of expr.operands) walk(operand)
    else found.push(expr)
  }
  for (const predicate of initial) walk(predicate)
  return found
}

/** `x op n` for an int literal `n`, read with `x` on the left whichever side it was written. */
const boundOn = (
  name: string,
  expr: Expr,
): { readonly op: Extract<Expr, { kind: 'compare' }>['op']; readonly n: bigint } | undefined => {
  if (expr.kind !== 'compare') return undefined
  const { left, right, op } = expr
  if (left.kind === 'ref' && left.name === name && right.kind === 'int') {
    return { op, n: right.value }
  }
  if (right.kind === 'ref' && right.name === name && left.kind === 'int') {
    const mirrored = { '=': '=', '!=': '!=', '<': '>', '<=': '>=', '>': '<', '>=': '<=' } as const
    return { op: mirrored[op], n: left.value }
  }
  return undefined
}

/**
 * The values a variable can take in SOME initial state.
 *
 * A bool or enum keeps its declared domain: it is at most a handful of values, and the
 * backtracking search refutes a wrong one (`f0 = true` against `f0 = false`) the moment it
 * is assigned. An int is narrowed to the interval its declared range and the top-level
 * `=`, `<`, `<=`, `>`, `>=` conjuncts against a literal leave it — which is what makes an
 * unbounded int enumerable at all, and a billion-value range cost one value. Sound because
 * every initial state satisfies every top-level conjunct; the full predicates are still
 * evaluated on every candidate, so an over-wide interval costs work, never a verdict.
 * `undefined` when the interval is unbounded on either side.
 */
const initialCandidates = (variable: StateVariable, facts: readonly Expr[]): Domain | undefined => {
  if (variable.type !== 'int') return declaredDomain(variable)
  let lo = variable.domain?.min === undefined ? undefined : BigInt(variable.domain.min)
  let hi = variable.domain?.max === undefined ? undefined : BigInt(variable.domain.max)
  const atLeast = (n: bigint): void => {
    if (lo === undefined || n > lo) lo = n
  }
  const atMost = (n: bigint): void => {
    if (hi === undefined || n < hi) hi = n
  }
  for (const fact of facts) {
    const bound = boundOn(variable.name, fact)
    if (bound === undefined) continue
    const { op, n } = bound
    if (op === '=' || op === '>=') atLeast(n)
    if (op === '=' || op === '<=') atMost(n)
    if (op === '>') atLeast(n + 1n)
    if (op === '<') atMost(n - 1n)
  }
  return lo === undefined || hi === undefined ? undefined : interval(lo, hi)
}

/**
 * Evaluate on a PARTIAL state: `undefined` where the answer depends on an unassigned
 * variable. `and` is false as soon as one operand is, `or` true as soon as one is, so the
 * initial-state search prunes a branch the moment an assigned prefix refutes a predicate.
 */
const partial = (expr: Expr, state: State): Value | undefined => {
  switch (expr.kind) {
    case 'ref':
      return state.get(expr.name)
    case 'not': {
      const value = partial(expr.operand, state)
      return value === undefined ? undefined : !value
    }
    case 'and':
    case 'or': {
      const decisive = expr.kind === 'or'
      let open = false
      for (const operand of expr.operands) {
        const value = partial(operand, state)
        if (value === decisive) return decisive
        if (value === undefined) open = true
      }
      return open ? undefined : !decisive
    }
    case 'arith': {
      const left = partial(expr.left, state)
      const right = partial(expr.right, state)
      if (typeof left !== 'bigint' || typeof right !== 'bigint') return undefined
      return expr.op === '+' ? left + right : left - right
    }
    case 'compare': {
      const left = partial(expr.left, state)
      const right = partial(expr.right, state)
      if (left === undefined || right === undefined) return undefined
      return compare(expr.op, left, right)
    }
    default:
      return evaluate(expr, state)
  }
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

/** Every assignment to `names` drawn from `domains`, extending `base`. Lazy: a caller
 * that stops early never pays for the assignments it did not take. */
function* assignments(
  base: State,
  names: readonly string[],
  domains: ReadonlyMap<string, Domain>,
): Generator<State> {
  if (names.length === 0) {
    yield base
    return
  }
  const [first, ...rest] = names as [string, ...string[]]
  for (const value of domains.get(first)?.values() ?? []) {
    yield* assignments(new Map(base).set(first, value), rest, domains)
  }
}

type NotApplicable = Extract<ExplicitVerdict, { status: 'not-applicable' }>

/**
 * The initial states, found by BACKTRACKING over each variable's narrowed candidates and
 * pruning a branch as soon as its assigned prefix refutes an initial predicate. The caps
 * apply to what the search actually visits — the initial states found, and the partial
 * assignments examined — never to the product of the declared domains, which N pinned
 * bools inflate to 2^N without adding a single initial state.
 */
const initialStates = (model: ExplicitModel): readonly State[] | NotApplicable => {
  const facts = conjuncts(model.initial)
  const candidates = new Map<string, Domain>()
  for (const variable of model.variables) {
    const domain = initialCandidates(variable, facts)
    if (domain === undefined) {
      return {
        status: 'not-applicable',
        reason: `the initial value of the unbounded int ${variable.name} is not bounded by a literal`,
      }
    }
    candidates.set(variable.name, domain)
  }
  // Narrowest first, so pinned variables are assigned before the branching ones and a
  // refuting predicate prunes as high in the tree as it can.
  const order = [...model.variables]
    .map((v) => v.name)
    .sort((a, b) => {
      const d = (candidates.get(a) as Domain).size - (candidates.get(b) as Domain).size
      return d < 0n ? -1 : d > 0n ? 1 : 0
    })
  const found: State[] = []
  let examined = 0
  const extend = (index: number, state: Map<string, Value>): NotApplicable | undefined => {
    if (index === order.length) {
      found.push(new Map(state))
      return found.length > REACHABILITY_BFS_STATE_CAP
        ? {
            status: 'not-applicable',
            reason: `more than ${REACHABILITY_BFS_STATE_CAP} initial states`,
          }
        : undefined
    }
    const name = order[index] as string
    for (const value of (candidates.get(name) as Domain).values()) {
      examined += 1
      if (examined > REACHABILITY_BFS_WORK_CAP) {
        return {
          status: 'not-applicable',
          reason: `more than ${REACHABILITY_BFS_WORK_CAP} candidate initial assignments examined`,
        }
      }
      state.set(name, value)
      if (model.initial.every((p) => partial(p, state) !== false)) {
        const stop = extend(index + 1, state)
        if (stop !== undefined) return stop
      }
    }
    state.delete(name)
    return undefined
  }
  return extend(0, new Map()) ?? found
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
  const domains = new Map<string, Domain>()
  for (const variable of variables) {
    const domain = declaredDomain(variable)
    if (domain !== undefined) domains.set(variable.name, domain)
  }

  // --- The initial states ---------------------------------------------------
  const initial = initialStates(model)
  if ('status' in initial) return initial
  const seen = new Map<string, { state: State; parent?: string; via?: string }>()
  let frontier: string[] = []
  for (const state of initial) {
    // Every predicate is decided on a complete assignment; `partial` only pruned.
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
        let fanOut = 1n
        for (const name of free) {
          const domain = domains.get(name)
          if (domain === undefined) {
            return {
              status: 'not-applicable',
              reason: `the unbounded int ${name} is free in a step, so a step has infinitely many successors`,
            }
          }
          fanOut *= domain.size
        }
        // Sized BEFORE generating: a step that leaves a wide bounded int free is refused
        // from the product of the domain sizes, not after enumerating the range.
        if (BigInt(work) + fanOut > BigInt(REACHABILITY_BFS_WORK_CAP)) {
          return {
            status: 'not-applicable',
            reason: `more than ${REACHABILITY_BFS_WORK_CAP} successors to generate`,
          }
        }
        for (const successor of assignments(post, free, domains)) {
          work += 1
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
