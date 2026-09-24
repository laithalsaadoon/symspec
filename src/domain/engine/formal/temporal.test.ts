/**
 * The bounded temporal tier: what an EARS sentence MEANS to it (AC-2-7), and how much a
 * bounded `unsat` is allowed to claim (AC-2-8).
 *
 * ## AC-2-7 — one reading of unwanted-behavior
 *
 * `If T, then the S shall R` is an OBLIGATION: when T happens, R happens. The propositional
 * tier has always encoded it that way (`encode.ts`, `T ⇒ R`). The temporal tier used to read
 * the same sentence as a PROHIBITION, `G(T → ¬R)`, so a document that says "record the event"
 * twice — once unconditionally, once on a disk error — was reported as an error-severity
 * `FND_TEMPORAL_CONTRADICTION`. The parity test below pins the invariant that makes this class
 * impossible rather than the one sentence that exposed it: for every pattern and every slot
 * combination, the temporal antecedent is the propositional context and the temporal
 * consequent is the propositional response.
 *
 * ## AC-2-8 — a bounded premise is not a standing assumption
 *
 * The tier asserts every guarded antecedent reachable WITHIN `k` steps, or every `G(a → …)`
 * would be vacuously satisfiable. For one antecedent that premise costs nothing: every
 * obligation is a `G(…)`, and `G` is suffix-closed, so a trace in which `a` first happens at
 * step 1000 can be shifted to one in which it happens at step 0. For two or more mutually
 * exclusive antecedents it is a pigeonhole: three modes cannot each occur within two steps.
 * An `unsat` of that second kind is a statement about `k`, so it is `warn`, and it says so.
 */

import { describe, expect, it } from 'vitest'
import type { Requirement } from '../core/schema.ts'
import { runCheck } from '../pipeline/check.ts'
import type { ReqView } from '../solvers/types.ts'
import { makeAtomize } from './atomize.ts'
import { encode, type Formula } from './encode.ts'
import {
  earsToTemporal,
  F,
  G,
  type TemporalFormula,
  tAnd,
  tAtom,
  tImplies,
} from './temporal-patterns.ts'

const TS = '2026-01-01T00:00:00.000Z'

/** Stable, sortable ids so an unsat core reads the same on every run. */
const id = (n: number): string => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`

type Slots = Pick<Requirement, 'patternType' | 'systemName' | 'systemResponse'> &
  Partial<Pick<Requirement, 'trigger' | 'preCondition' | 'negated'>>

const view = (n: number, slots: Slots): ReqView => ({
  id: id(n),
  negated: false,
  sentence: '',
  priority: 'medium',
  status: 'draft',
  ...slots,
})

/** An engine-shaped document, the same shape `pipeline/check.test.ts` feeds `runCheck`. */
const docOf = (reqs: readonly ReqView[]) => ({
  requirements: Object.fromEntries(
    reqs.map((r) => [
      r.id,
      {
        ...r,
        createdAt: TS,
        updatedAt: TS,
        derives: [],
        satisfies: [],
        verifies: [],
        refines: [],
      },
    ]),
  ),
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
  stateModel: { variables: [] },
})

const temporalFindings = async (reqs: readonly ReqView[], bound: number) => {
  const report = await runCheck(docOf(reqs) as never, { temporal: { bound } })
  return report.findings.filter((f) => f.code === 'FND_TEMPORAL_CONTRADICTION')
}

// ---------------------------------------------------------------------------
// AC-2-7
// ---------------------------------------------------------------------------

/**
 * The AC-2-7 reproducer, verbatim from the spec: "The audit logger shall record the event."
 * plus "If a disk write error occurs, then the audit logger shall record the event." — the
 * parse the CLI produces for those two lines.
 */
const AUDIT_LOGGER: readonly ReqView[] = [
  view(1, {
    patternType: 'ubiquitous',
    systemName: 'audit logger',
    systemResponse: 'record the event',
  }),
  view(2, {
    patternType: 'unwanted-behavior',
    systemName: 'audit logger',
    systemResponse: 'record the event',
    trigger: 'a disk write error occurs',
  }),
]

/** Split a formula into (antecedent literals, consequent), for either tier's shape. */
const antecedentAtoms = (f: Formula | TemporalFormula | null): string[] => {
  if (f === null) return []
  if (f.op === 'atom') return [f.name]
  if (f.op === 'and') return f.args.flatMap((a) => antecedentAtoms(a))
  throw new Error(`unexpected antecedent shape ${JSON.stringify(f)}`)
}

/** `G(ante → F? resp)` / `G(F? resp)` → `{ante, resp}`, with the `F` peeled. */
const temporalParts = (f: TemporalFormula) => {
  if (f.op !== 'G') throw new Error('every EARS pattern is a G obligation')
  const body = f.arg
  const peel = (x: TemporalFormula) => (x.op === 'F' ? x.arg : x)
  return body.op === 'implies'
    ? { ante: antecedentAtoms(body.lhs), resp: peel(body.rhs) }
    : { ante: [], resp: peel(body) }
}

const propositionalParts = (f: Formula) =>
  f.op === 'implies' ? { ante: antecedentAtoms(f.lhs), resp: f.rhs } : { ante: [], resp: f }

describe('AC-2-7 — the temporal tier reads every EARS pattern as the propositional tier does', () => {
  const atomize = makeAtomize()
  const trig = 'a disk write error occurs'
  const pre = 'the logger is in maintenance mode'

  const combos: readonly Slots[] = (
    ['ubiquitous', 'event-driven', 'unwanted-behavior', 'state-driven', 'optional-feature'] as const
  ).flatMap((patternType) =>
    [false, true].flatMap((negated) =>
      [{}, { trigger: trig }, { preCondition: pre }, { trigger: trig, preCondition: pre }].map(
        (slots) => ({
          patternType,
          systemName: 'audit logger',
          systemResponse: 'record the event',
          negated,
          ...slots,
        }),
      ),
    ),
  )

  // `optional-feature` mints its guard under the `feat` kind while `encode` uses `pre`
  // (temporal-patterns.ts, AC-2-7 note (a)) — a naming difference, not a reading one. And
  // ubiquitous / state-driven / optional-feature ignore the slot their template does not
  // have, which is the parser's contract; the parity claim is about the slots each
  // template reads.
  const readsTrigger = (p: Slots['patternType']) =>
    p === 'event-driven' || p === 'unwanted-behavior'
  const readsPre = (p: Slots['patternType']) => p !== 'ubiquitous'

  for (const slots of combos) {
    const label = `${slots.patternType}${slots.negated === true ? ' (negated)' : ''} ${
      [slots.preCondition && 'P', slots.trigger && 'T'].filter(Boolean).join('+') || 'no guard'
    }`
    it(`${label}: antecedent = context, consequent = response`, () => {
      const r = view(9, slots)
      const read: ReqView = {
        ...r,
        ...(readsTrigger(r.patternType) ? {} : { trigger: undefined }),
        ...(readsPre(r.patternType) ? {} : { preCondition: undefined }),
      }
      const temporal = temporalParts(earsToTemporal(read, atomize))
      const propositional = propositionalParts(encode(read, atomize).body)
      const unfeat = (atoms: string[]) => atoms.map((a) => a.replace('__feat__', '__pre__'))
      expect(unfeat(temporal.ante).sort()).toEqual(propositional.ante.slice().sort())
      expect(temporal.resp).toEqual(propositional.resp)
    })
  }

  it('unwanted-behavior is the response obligation G((P ∧ T) → F R), never G(T → ¬R)', () => {
    const r = view(3, {
      patternType: 'unwanted-behavior',
      systemName: 'audit logger',
      systemResponse: 'record the event',
      trigger: trig,
      preCondition: pre,
    })
    const P = tAtom(atomize('pre', pre, 'audit logger', false).atom)
    const T = tAtom(atomize('trig', trig, 'audit logger', false).atom)
    const R = tAtom(atomize('resp', 'record the event', 'audit logger', false).atom)
    expect(earsToTemporal(r, atomize)).toEqual(G(tImplies(tAnd([P, T]), F(R))))
  })

  it('reproducer: "shall record" + "If a disk write error occurs, then … shall record" is NOT a conflict', async () => {
    expect(await temporalFindings(AUDIT_LOGGER, 10)).toEqual([])
  })

  it('control: the same unwanted-behavior obligation against "shall not record" IS still a conflict', async () => {
    // Without this, "the tier no longer fires on unwanted-behavior at all" would pass the
    // reproducer above.
    const [ubiquitous, unwanted] = AUDIT_LOGGER as [ReqView, ReqView]
    const findings = await temporalFindings([{ ...ubiquitous, negated: true }, unwanted], 10)
    expect(findings.map((f) => [f.severity, f.requirementIds])).toEqual([['error', [id(1), id(2)]]])
  })
})
