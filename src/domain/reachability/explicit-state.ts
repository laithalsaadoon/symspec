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
 * ## When it does not run, and what that means for the proof
 *
 * It returns `not-applicable`, with the reason, in two cases that mean opposite things:
 *
 * - `beyondCap: true`: the search has SHOWN that the model has more than
 *   {@link REACHABILITY_BFS_STATE_CAP} reachable states. It found that many distinct states,
 *   or one step from a reachable state has that many distinct successors, or a variable
 *   takes infinitely many values. Spec 007 AC-1-5 requires a cross-check only up to the
 *   cap, so the proof stands on the Horn tier and its certificate.
 * - `beyondCap: false`: the search stopped WITHOUT showing that. It used up a safety valve
 *   ({@link REACHABILITY_BFS_WORK_CAP} for the initial search,
 *   {@link REACHABILITY_BFS_SUCCESSOR_CAP} for the steps), or it met an initial predicate it
 *   cannot enumerate. The model may be small, so the tier WITHHOLDS the proof. Otherwise a
 *   proof the second checker never examined would be reported as if it had been.
 *
 * The caps measure what the search VISITS, never what the declarations multiply out to:
 *
 * - A bounded int's range is a pair of bounds, sized before any value is produced.
 * - The initial states are found by backtracking, and a branch is pruned as soon as its
 *   assigned prefix refutes an initial predicate. A variable that a top-level `x = e`
 *   defines is COMPUTED as soon as `e`'s variables are assigned, never branched on, and kept
 *   only if it lies in the declared range, a lone `min` or `max` included. So N bools
 *   initialised `fi = g` are one initial state in whatever order they are declared.
 *   An int's candidates are narrowed to the interval its top-level literal comparisons leave.
 * - A step's successor set depends only on the post-state's values for the variables the
 *   step does not leave free. The search expands each distinct such projection ONCE, so
 *   the successors it generates under one free set are distinct states, and a volatile
 *   sensor free on every step costs its range once per projection, not once per reachable
 *   state. A successor is built as a state only when its key is new.
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
 * THE INITIAL-SEARCH SAFETY VALVE: the most candidate initial assignments the backtracking
 * search examines before it gives up.
 *
 * It is a count, not a clock, so the same document always gets the same answer. It exists
 * for initial predicates that no prefix refutes (a sum, say), which can take exponentially
 * many candidates to find a handful of states. When it trips, the search has NOT shown the
 * model is beyond {@link REACHABILITY_BFS_STATE_CAP}, so the verdict carries
 * `beyondCap: false` and the proof is withheld.
 */
export const REACHABILITY_BFS_WORK_CAP = 200_000

/**
 * THE STEP-PHASE SAFETY VALVE: the most successors the breadth-first expansion generates,
 * duplicates included, before it gives up.
 *
 * The step phase's work is bounded by the model without it. Each (free set, fixed
 * projection) is expanded once, so the successors generated under ONE free set are
 * pairwise distinct reachable states, and no more than {@link REACHABILITY_BFS_STATE_CAP}
 * plus one of them can be generated before the state cap trips. The work is therefore at
 * most the number of distinct free sets among the effects times that, and the only waste is
 * a state that several free sets reach. So this valve can trip only on a document with more
 * than `REACHABILITY_BFS_SUCCESSOR_CAP / REACHABILITY_BFS_STATE_CAP` distinct free sets.
 * Such a model may still be small, so tripping it carries `beyondCap: false` and the proof
 * is withheld. Sized from the measured cost: a model that spends it gives up in under a
 * second.
 */
export const REACHABILITY_BFS_SUCCESSOR_CAP = 2_000_000

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
  /**
   * The enumeration could not be completed, and nothing is claimed about the constraint.
   * `beyondCap` says whether the search SHOWED that the model has more than
   * {@link REACHABILITY_BFS_STATE_CAP} reachable states (see the module doc).
   */
  | { readonly status: 'not-applicable'; readonly reason: string; readonly beyondCap: boolean }

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
  readonly has: (value: Value) => boolean
}

const listed = (values: readonly Value[]): Domain => ({
  size: BigInt(values.length),
  values: () => values,
  has: (value) => values.includes(value),
})

const interval = (lo: bigint, hi: bigint): Domain => ({
  size: hi < lo ? 0n : hi - lo + 1n,
  *values() {
    for (let n = lo; n <= hi; n += 1n) yield n
  },
  has: (value) => typeof value === 'bigint' && lo <= value && value <= hi,
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

/**
 * Whether `value` lies in the variable's declared type and range. An int bounded on ONE side
 * is checked against that side: the Horn tier applies a lone bound (`rangeConstraints`
 * emits `x >= min` without a max), so an initial state lies within it too.
 */
const admits = (variable: StateVariable, value: Value): boolean => {
  if (variable.type === 'bool') return typeof value === 'boolean'
  if (variable.type === 'enum') return typeof value === 'string' && variable.domain.includes(value)
  if (typeof value !== 'bigint') return false
  const min = variable.domain?.min
  const max = variable.domain?.max
  return (min === undefined || BigInt(min) <= value) && (max === undefined || value <= BigInt(max))
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

/** Every variable an expression reads. */
const readsOf = (expr: Expr, into: Set<string> = new Set()): Set<string> => {
  switch (expr.kind) {
    case 'ref':
      into.add(expr.name)
      break
    case 'not':
      readsOf(expr.operand, into)
      break
    case 'and':
    case 'or':
      for (const operand of expr.operands) readsOf(operand, into)
      break
    case 'arith':
    case 'compare':
      readsOf(expr.left, into)
      readsOf(expr.right, into)
      break
    default:
      break
  }
  return into
}

/** A top-level `x = e`: in EVERY initial state, `x` is `e`'s value on the other variables. */
interface Definition {
  readonly expr: Expr
  readonly reads: ReadonlySet<string>
}

/**
 * The definitions the top-level conjuncts state, per variable. `x = y` defines each side
 * by the other. A side that reads its own variable (`x = x + 0`) defines nothing.
 */
const definitionsOf = (facts: readonly Expr[]): ReadonlyMap<string, readonly Definition[]> => {
  const found = new Map<string, Definition[]>()
  const add = (target: Expr, expr: Expr): void => {
    if (target.kind !== 'ref') return
    const reads = readsOf(expr)
    if (reads.has(target.name)) return
    found.set(target.name, [...(found.get(target.name) ?? []), { expr, reads }])
  }
  for (const fact of facts) {
    if (fact.kind !== 'compare' || fact.op !== '=') continue
    add(fact.left, fact.right)
    add(fact.right, fact.left)
  }
  return found
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

type NotApplicable = Extract<ExplicitVerdict, { status: 'not-applicable' }>

/** The search SHOWED the model has more reachable states than the cap: out of scope. */
const beyondCap = (reason: string): NotApplicable => ({
  status: 'not-applicable',
  reason,
  beyondCap: true,
})

/** The search stopped WITHOUT showing that: the model may be small, so the proof is withheld. */
const undetermined = (reason: string): NotApplicable => ({
  status: 'not-applicable',
  reason,
  beyondCap: false,
})

/** One step of the initial-state search: compute a defined variable, or branch over one. */
type InitialStep =
  | { readonly name: string; readonly define: Expr }
  | { readonly name: string; readonly choose: Domain }

/**
 * The ORDER the initial-state search assigns variables in, fixed before it starts.
 *
 * A variable whose definition reads only variables already placed is COMPUTED. That is
 * always tried first, so a pinned variable declared last is still placed before anything
 * that depends on it, and a chain of equalities costs one branch, not one per link. When
 * no definition is ready, the search branches on the unplaced variable with the fewest
 * candidates, and among those, the one the initial predicates mention most, which is the
 * one whose value unlocks or refutes the most. Declaration order breaks the remaining ties
 * only, so it never decides whether a definition is used.
 *
 * `NotApplicable` when an unbounded int is left with neither a definition nor a literal
 * bound. `beyondCap` is true when no predicate but its own literal bounds mentions it, so
 * it takes infinitely many initial values. It is false otherwise (`x + y = 3`), because the
 * search cannot tell how many values the predicate leaves.
 */
const initialPlan = (model: ExplicitModel): readonly InitialStep[] | NotApplicable => {
  const facts = conjuncts(model.initial)
  const definitions = definitionsOf(facts)
  const mentions = new Map<string, number>()
  for (const fact of facts) {
    for (const name of readsOf(fact)) mentions.set(name, (mentions.get(name) ?? 0) + 1)
  }
  const plan: InitialStep[] = []
  const placed = new Set<string>()
  while (placed.size < model.variables.length) {
    const unplaced = model.variables.filter((v) => !placed.has(v.name))
    let step: InitialStep | undefined
    for (const variable of unplaced) {
      const ready = definitions
        .get(variable.name)
        ?.find((d) => [...d.reads].every((name) => placed.has(name)))
      if (ready !== undefined) {
        step = { name: variable.name, define: ready.expr }
        break
      }
    }
    if (step === undefined) {
      let best: { name: string; domain: Domain; mentions: number } | undefined
      for (const variable of unplaced) {
        const domain = initialCandidates(variable, facts)
        if (domain === undefined) continue
        const count = mentions.get(variable.name) ?? 0
        if (
          best === undefined ||
          domain.size < best.domain.size ||
          (domain.size === best.domain.size && count > best.mentions)
        ) {
          best = { name: variable.name, domain, mentions: count }
        }
      }
      if (best === undefined) {
        const name = (unplaced[0] as StateVariable).name
        const independent = facts.every(
          (fact) => !readsOf(fact).has(name) || boundOn(name, fact) !== undefined,
        )
        return independent
          ? beyondCap(
              `the initial value of the unbounded int ${name} is not bounded by a literal, so there are infinitely many initial states`,
            )
          : undetermined(
              `the initial value of the unbounded int ${name} is constrained by a predicate the search cannot enumerate`,
            )
      }
      step = { name: best.name, choose: best.domain }
    }
    plan.push(step)
    placed.add(step.name)
  }
  return plan
}

/**
 * The initial states, found by BACKTRACKING along {@link initialPlan} and pruning a branch
 * as soon as its assigned prefix refutes an initial predicate. The caps apply to what the
 * search actually visits (the initial states found, and the candidate assignments examined),
 * never to the product of the declared domains, which N pinned bools inflate to 2^N without
 * adding a single initial state.
 */
const initialStates = (
  model: ExplicitModel,
): { readonly states: readonly State[] } | NotApplicable => {
  const plan = initialPlan(model)
  if ('status' in plan) return plan
  const byName = new Map(model.variables.map((v) => [v.name, v]))
  const found: State[] = []
  let examined = 0
  const extend = (index: number, state: Map<string, Value>): NotApplicable | undefined => {
    const step = plan[index]
    if (step === undefined) {
      found.push(new Map(state))
      return found.length > REACHABILITY_BFS_STATE_CAP
        ? beyondCap(`more than ${REACHABILITY_BFS_STATE_CAP} initial states`)
        : undefined
    }
    const values = 'define' in step ? [evaluate(step.define, state)] : step.choose.values()
    for (const value of values) {
      examined += 1
      if (examined > REACHABILITY_BFS_WORK_CAP) {
        return undetermined(
          `more than ${REACHABILITY_BFS_WORK_CAP} candidate initial assignments examined`,
        )
      }
      // A computed value must still lie in the declared range, a lone bound included. A
      // branched one does, because its candidates were drawn from within it.
      if ('define' in step && !admits(byName.get(step.name) as StateVariable, value)) continue
      state.set(step.name, value)
      if (model.initial.every((p) => partial(p, state) !== false)) {
        const stop = extend(index + 1, state)
        if (stop !== undefined) return stop
      }
    }
    state.delete(step.name)
    return undefined
  }
  return extend(0, new Map()) ?? { states: found }
}

/** What one effect does to the variables, fixed for the whole search. */
interface StepPlan {
  readonly label: string
  readonly effect: StateEffect
  /** Each assignment's target, as a position in the state row. */
  readonly writes: readonly { readonly at: number; readonly value: Expr }[]
  /** The positions it leaves free: neither written nor pinned by the frame. */
  readonly free: readonly number[]
  /** The rest, whose post-state values decide the whole successor set. */
  readonly fixed: readonly number[]
  /** The fixed projections already expanded, shared by every effect with the same free
   * set. Their successors are already in `seen`, so expanding one again would only
   * regenerate duplicates. */
  readonly expanded: Set<Key>
}

/**
 * A state's identity. A NUMBER when every value lies in its declared domain and the
 * domains' product fits a double exactly: the mixed-radix index of the state, which a step
 * updates by one addition per successor. A STRING, the rendered values, otherwise (an
 * unbounded int, or a write that left its range). A state has exactly one key either way,
 * and a number never equals a string.
 */
type Key = number | string

/** A visited state: its values by declaration position, and how it was first reached. */
interface Node {
  readonly state: State
  readonly row: readonly Value[]
  readonly parent?: Key
  readonly via?: string
}

/** How states are keyed in one search. See {@link Key}. */
interface Keying {
  /** The place value of each position, or `undefined` when keys are strings. */
  readonly weight: readonly number[] | undefined
  /** A value's index in its position's declared domain, or `undefined` outside it. */
  readonly digit: (at: number, value: Value) => number | undefined
  readonly keyOf: (row: readonly Value[]) => Key
}

const keying = (
  variables: readonly StateVariable[],
  domains: ReadonlyMap<string, Domain>,
): Keying => {
  const digits = variables.map((variable): ((value: Value) => number | undefined) => {
    if (variable.type === 'bool')
      return (value) => (value === true ? 1 : value === false ? 0 : undefined)
    if (variable.type === 'enum') {
      const index = new Map<Value, number>(variable.domain.map((member, i) => [member, i]))
      return (value) => index.get(value)
    }
    const domain = domains.get(variable.name)
    const lo = variable.domain?.min
    if (domain === undefined || lo === undefined) return () => undefined
    const min = BigInt(lo)
    return (value) => (domain.has(value) ? Number((value as bigint) - min) : undefined)
  })
  let product = 1n
  for (const variable of variables) product *= domains.get(variable.name)?.size ?? 0n
  const exact =
    variables.every((v) => domains.has(v.name)) && product <= BigInt(Number.MAX_SAFE_INTEGER)
  let place = 1
  const weight = exact
    ? variables.map((v) => {
        const here = place
        place *= Number((domains.get(v.name) as Domain).size)
        return here
      })
    : undefined
  const digit = (at: number, value: Value): number | undefined =>
    (digits[at] as (value: Value) => number | undefined)(value)
  const rendered = (row: readonly Value[]): string => row.map(String).join('\u0000')
  const keyOf = (row: readonly Value[]): Key => {
    if (weight === undefined) return rendered(row)
    let code = 0
    for (let at = 0; at < row.length; at += 1) {
      const d = digit(at, row[at] as Value)
      if (d === undefined) return rendered(row)
      code += d * (weight[at] as number)
    }
    return code
  }
  return { weight, digit, keyOf }
}

const render = (
  variables: readonly StateVariable[],
  state: State,
): Readonly<Record<string, string>> =>
  Object.fromEntries(variables.map((v) => [v.name, String(state.get(v.name))]))

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
  const names = variables.map((v) => v.name)
  const position = new Map(names.map((name, i) => [name, i]))
  const domains = new Map<string, Domain>()
  for (const variable of variables) {
    const domain = declaredDomain(variable)
    if (domain !== undefined) domains.set(variable.name, domain)
  }
  const { weight, digit, keyOf } = keying(variables, domains)
  const stateOf = (row: readonly Value[]): State =>
    new Map(names.map((n, i) => [n, row[i] as Value]))

  // --- The initial states ---------------------------------------------------
  const initial = initialStates(model)
  if ('status' in initial) return initial
  const seen = new Map<Key, Node>()
  let frontier: Key[] = []
  for (const state of initial.states) {
    // Every predicate is decided on a complete assignment; `partial` only pruned.
    if (!model.initial.every((p) => truth(p, state))) continue
    const row = names.map((n) => state.get(n) as Value)
    const key = keyOf(row)
    if (seen.has(key)) continue
    seen.set(key, { state, row })
    frontier.push(key)
  }

  const pinnedByFrame = new Set(frame === 'none' ? [] : frame === 'full' ? names : model.stableVars)
  const expansions = new Map<string, Set<Key>>()
  const steps: readonly StepPlan[] = model.effects.map(({ label, effect }) => {
    const written = new Set(effect.assignments.map((a) => a.target))
    const isFree = (name: string): boolean => !written.has(name) && !pinnedByFrame.has(name)
    const free = names.flatMap((name, i) => (isFree(name) ? [i] : []))
    const freeKey = free.join(',')
    const expanded = expansions.get(freeKey) ?? new Set<Key>()
    expansions.set(freeKey, expanded)
    return {
      label,
      effect,
      writes: effect.assignments.map((a) => ({
        at: position.get(a.target) as number,
        value: a.value,
      })),
      free,
      fixed: names.flatMap((name, i) => (isFree(name) ? [] : [i])),
      expanded,
    }
  })
  /** A free position's values in domain order, so a value's index is its digit. */
  const choices = new Map<number, readonly Value[]>()
  const choicesAt = (at: number): readonly Value[] => {
    let found = choices.get(at)
    if (found === undefined) {
      found = [...(domains.get(names[at] as string) as Domain).values()]
      choices.set(at, found)
    }
    return found
  }
  let work = 0

  const violation = (key: Key): ExplicitVerdict => {
    const trace: string[] = []
    const path: Readonly<Record<string, string>>[] = []
    let cursor: Key | undefined = key
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
    const next: Key[] = []
    for (const key of frontier) {
      const pre = seen.get(key) as Node
      for (const { label, effect, writes, free, fixed, expanded } of steps) {
        if (effect.guard !== undefined && !truth(effect.guard, pre.state)) continue
        const post = [...pre.row]
        for (const { at, value } of writes) post[at] = evaluate(value, pre.state)
        // The fixed part of the post-state, as a number when every fixed value lies in its
        // domain (the successors' keys are then this plus the free digits), else rendered.
        let base: number | undefined = weight === undefined ? undefined : 0
        for (const at of fixed) {
          if (base === undefined) break
          const d = digit(at, post[at] as Value)
          base = d === undefined ? undefined : base + d * ((weight as number[])[at] as number)
        }
        const projection: Key = base ?? fixed.map((at) => String(post[at])).join('\u0000')
        if (expanded.has(projection)) continue
        expanded.add(projection)
        // Sized BEFORE generating. The successors of one projection are pairwise distinct
        // (they differ on a free variable) and all reachable, because this step fires from
        // a reachable state. So a fan-out past the state cap SHOWS the model is past it.
        let fanOut = 1n
        for (const at of free) {
          const domain = domains.get(names[at] as string)
          if (domain === undefined) {
            return beyondCap(
              `the unbounded int ${names[at]} is free in a step, so a step has infinitely many successors`,
            )
          }
          fanOut *= domain.size
        }
        if (fanOut > BigInt(REACHABILITY_BFS_STATE_CAP)) {
          return beyondCap(
            `a step from a reachable state has more than ${REACHABILITY_BFS_STATE_CAP} distinct successors`,
          )
        }
        if (fanOut === 0n) continue
        // The valve bounds time, not the model: the successors of ONE free set are distinct
        // states, so the step phase generates at most (distinct free sets) x (state cap + 1)
        // of them before the state cap trips. A document with more free sets than the valve
        // affords may still be small, so tripping it withholds the proof.
        if (BigInt(work) + fanOut > BigInt(REACHABILITY_BFS_SUCCESSOR_CAP)) {
          return undetermined(`more than ${REACHABILITY_BFS_SUCCESSOR_CAP} successors to generate`)
        }
        // An odometer over the free positions, the LAST fastest, so successors come in the
        // same order as nested loops over the declarations. A successor is built as a state
        // only when its key is new: a duplicate costs one key, and a numeric key costs one
        // addition per step of the odometer.
        const odometer = free.map(choicesAt)
        const digits = free.map(() => 0)
        const row = [...post]
        free.forEach((at, k) => {
          row[at] = (odometer[k] as readonly Value[])[0] as Value
        })
        let code = base
        for (;;) {
          work += 1
          const successorKey: Key = code ?? keyOf(row)
          if (!seen.has(successorKey)) {
            const successor = stateOf(row)
            seen.set(successorKey, { state: successor, row: [...row], parent: key, via: label })
            if (seen.size > REACHABILITY_BFS_STATE_CAP) {
              return beyondCap(`more than ${REACHABILITY_BFS_STATE_CAP} reachable states`)
            }
            if (!truth(constraint, successor)) return violation(successorKey)
            next.push(successorKey)
          }
          let k = free.length - 1
          for (; k >= 0; k -= 1) {
            const at = free[k] as number
            const values = odometer[k] as readonly Value[]
            const place = weight?.[at] ?? 0
            const d = (digits[k] as number) + 1
            if (d < values.length) {
              digits[k] = d
              row[at] = values[d] as Value
              if (code !== undefined) code += place
              break
            }
            if (code !== undefined) code -= (d - 1) * place
            digits[k] = 0
            row[at] = values[0] as Value
          }
          if (k < 0) break
        }
      }
    }
    frontier = next
  }
  return { status: 'holds', states: seen.size }
}
