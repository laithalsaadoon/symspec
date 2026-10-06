/**
 * A guard-implication bridge asserts its established state only where the propositional
 * snapshot is entitled to put it (spec 007 AC-2-9).
 *
 * The contradiction tier is ONE instant: every formula in a group is asserted together. The
 * reactive semantics (spec 007 AC-6-1) puts an event-driven response at the trigger step `t`
 * and the effect of an action — a state it establishes — at `t+1`. So a bridge read off
 * "When E, the system shall set S" says `E@t ⇒ S@t+1`, and asserting `E ⇒ S` into the snapshot
 * claims S already holds at the instant E fires. That is how three requirements the document
 * never asks to hold at one instant were reported as a `FND_CONTRADICTION`.
 *
 * A state-driven bridge ("While P, the system shall be S") is `P@t ⇒ S@t` — the same instant —
 * so it stays. The positive control below is the reproducer re-phrased that way, and it must
 * still fire: without it, a bridge extractor that emitted nothing at all would pass this file.
 */

import { describe, expect, it } from 'vitest'
import { findContradictions } from './contradiction.ts'
import type { EncodableRequirement } from './encode.ts'
import { defaultBridgeAtomize, extractGuardImplications } from './guard-implication.ts'

const SYSTEM = 'pump controller'

type Slots = {
  readonly patternType: EncodableRequirement['patternType']
  readonly trigger?: string
  readonly preCondition?: string
  readonly systemResponse: string
  readonly negated?: boolean
}

const req = (id: string, s: Slots): EncodableRequirement => ({
  id,
  patternType: s.patternType,
  preCondition: s.preCondition,
  trigger: s.trigger,
  systemName: SYSTEM,
  systemResponse: s.systemResponse,
  negated: s.negated ?? false,
  sentence: '',
  priority: 'medium',
  status: 'draft',
})

/** The rule every fixture below shares: while running, a start command is refused. */
const REFUSE_WHILE_RUNNING = req('req-b', {
  patternType: 'state-driven',
  preCondition: 'the mode is running',
  systemResponse: 'accept a start command',
  negated: true,
})

/** The AC-2-9 reproducer, verbatim: the bridge is EVENT-driven. */
const EVENT_BRIDGE_DOC: readonly EncodableRequirement[] = [
  req('req-a', {
    patternType: 'event-driven',
    trigger: 'the operator presses start',
    systemResponse: 'set the mode to running',
  }),
  REFUSE_WHILE_RUNNING,
  req('req-c', {
    patternType: 'event-driven',
    trigger: 'the operator presses start',
    systemResponse: 'accept a start command',
  }),
]

/** The same three obligations with an UNWANTED-BEHAVIOR bridge ("If E, then …"). */
const UNWANTED_BRIDGE_DOC: readonly EncodableRequirement[] = [
  req('req-a', {
    patternType: 'unwanted-behavior',
    trigger: 'the operator presses start',
    systemResponse: 'set the mode to running',
  }),
  REFUSE_WHILE_RUNNING,
  req('req-c', {
    patternType: 'unwanted-behavior',
    trigger: 'the operator presses start',
    systemResponse: 'accept a start command',
  }),
]

/**
 * The positive control: the bridge and its peer are STATE-driven, so "the mode is running"
 * holds at the same instant as "the pump is primed" and all three obligations genuinely meet.
 */
const STATE_BRIDGE_DOC: readonly EncodableRequirement[] = [
  req('req-a', {
    patternType: 'state-driven',
    preCondition: 'the pump is primed',
    systemResponse: 'set the mode to running',
  }),
  REFUSE_WHILE_RUNNING,
  req('req-c', {
    patternType: 'state-driven',
    preCondition: 'the pump is primed',
    systemResponse: 'accept a start command',
  }),
]

describe('AC-2-9: an event-driven bridge establishes its state at the next step', () => {
  it('the reproducer is not a contradiction: "set the mode to running" is not asserted at the press', async () => {
    expect(await findContradictions(EVENT_BRIDGE_DOC)).toEqual([])
  })

  it('an unwanted-behavior bridge is held to the same rule', async () => {
    expect(await findContradictions(UNWANTED_BRIDGE_DOC)).toEqual([])
  })

  it('positive control: the same chain through a state-driven bridge still proves the conflict', async () => {
    const findings = await findContradictions(STATE_BRIDGE_DOC)
    expect(findings.map((f) => f.requirementIds)).toEqual([['req-a', 'req-b', 'req-c']])
  })

  it('the extractor emits the state-driven bridge and withholds the event-driven one', () => {
    // Pins WHERE the drop happens. Without it, the async cases above would also pass for a
    // change that broke the state-atom match for every bridge — the positive control catches
    // that too, but this names the layer.
    expect(
      extractGuardImplications(STATE_BRIDGE_DOC, defaultBridgeAtomize).map((b) => b.bridgeId),
    ).toEqual(['req-a'])
    expect(extractGuardImplications(EVENT_BRIDGE_DOC, defaultBridgeAtomize)).toEqual([])
    expect(extractGuardImplications(UNWANTED_BRIDGE_DOC, defaultBridgeAtomize)).toEqual([])
  })
})

/**
 * The Run 2 reactor round AS THE RED TEAM PHRASED IT, recorded as a deletion (spec 007 I-5).
 *
 * `eval-r2-reactor-keeps-online` used to prove a conflict through an event-driven bridge:
 * "When overheating is reported, mark the coolant pump engaged". That is the AC-2-9 shape —
 * the pump is engaged at the step AFTER the report, and "deny power" is owed AT the report — so
 * the snapshot proof was the same fabrication. The pinned round now phrases its overheating
 * rules as states, which the snapshot may assert; this is the original, pinned as withheld so
 * the finding it lost is on record rather than silently gone.
 */
describe('AC-2-9: the event-phrased reactor round is withheld, not proven', () => {
  const ctl = (id: string, s: Slots): EncodableRequirement => ({
    ...req(id, s),
    systemName: 'controller',
  })
  const overheating = (
    phrasing: 'event-driven' | 'state-driven',
    id: string,
    systemResponse: string,
  ): EncodableRequirement =>
    phrasing === 'state-driven'
      ? ctl(id, {
          patternType: 'state-driven',
          preCondition: 'the reactor is overheating',
          systemResponse,
        })
      : ctl(id, {
          patternType: 'event-driven',
          trigger: 'the temperature sensor reports overheating',
          systemResponse,
        })
  const reactor = (phrasing: 'event-driven' | 'state-driven'): EncodableRequirement[] => [
    overheating(phrasing, 'r1', 'mark the coolant pump engaged'),
    ctl('r2', {
      patternType: 'state-driven',
      preCondition: 'the coolant pump is engaged',
      systemResponse: 'keeps the reactor online',
    }),
    ctl('r3', {
      patternType: 'state-driven',
      preCondition: 'the reactor is online',
      systemResponse: 'grant power to the distribution grid',
    }),
    overheating(phrasing, 'r4', 'deny power to the distribution grid'),
  ]

  it('event-driven overheating rules: no snapshot conflict', async () => {
    expect(await findContradictions(reactor('event-driven'))).toEqual([])
  })

  it('positive control: state-driven overheating rules still prove it through both bridges', async () => {
    const findings = await findContradictions(reactor('state-driven'))
    expect(findings.map((f) => f.requirementIds)).toEqual([['r1', 'r2', 'r3', 'r4']])
  })
})
