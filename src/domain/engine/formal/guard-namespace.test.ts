/**
 * Trigger and precondition share ONE guard namespace (spec 007 AC-3-3).
 *
 * The atom name used to carry the SLOT kind — `sys__<scope>__trig__<body>` for a "When" clause and
 * `sys__<scope>__pre__<body>` for a "While" clause — so "When the train is moving" and "While the
 * train is moving" were two unrelated Booleans. The contradiction tier groups requirements on
 * their exact guard-atom set, so the two requirements below never met: the solver reported
 * nothing, and the document counted as verified over a real conflict. In the single-snapshot
 * semantics every propositional tier uses, both clauses say the same thing — the condition holds
 * now — so they must name one atom.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import { atomize, makeAtomize } from './atomize.ts'
import { contextAtomsOf, liveIn, planContextGroups } from './contradiction.ts'
import { type EncodableRequirement, encode } from './encode.ts'
import { planNeedsReviewGroups } from './needs-review.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idOf = (n: number) => `0c0c0c0c-0000-4000-8000-${String(n).padStart(12, '0')}`

const docOf = async (sentences: readonly string[]) => {
  const requirements: Record<string, unknown> = {}
  for (const [i, sentence] of sentences.entries()) {
    const parsed = await parseLine(sentence)
    if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
    const id = idOf(i + 1)
    requirements[id] = {
      id,
      patternType: parsed.slots.patternType,
      systemName: parsed.slots.systemName,
      systemResponse: parsed.slots.systemResponse,
      ...(parsed.slots.trigger !== undefined ? { trigger: parsed.slots.trigger } : {}),
      ...(parsed.slots.preCondition !== undefined
        ? { preCondition: parsed.slots.preCondition }
        : {}),
      negated: parsed.negated,
      sentence,
      priority: 'medium',
      status: 'draft',
      createdAt: TS,
      updatedAt: TS,
      derives: [],
      satisfies: [],
      verifies: [],
      refines: [],
    }
  }
  return {
    requirements,
    glossary: [],
    antonyms: [],
    waivers: [],
    terms: [],
    stateModel: { variables: [] },
  } as never
}

const WHEN = 'When the train is moving, the door controller shall open the door.'
const WHILE = 'While the train is moving, the door controller shall not open the door.'

describe('AC-3-3 — "When X" and "While X" name one guard', () => {
  it('a trigger slot and a precondition slot with one text are one atom', () => {
    const t = atomize({ kind: 'trig', text: 'the train is moving', systemName: 'door controller' })
    const p = atomize({ kind: 'pre', text: 'the train is moving', systemName: 'door controller' })
    expect(t.name).toBe(p.name)
    expect(t.name).toBe('sys__door_controller__guard__train_moving')
  })

  it('a guard is still never a response', () => {
    const g = atomize({ kind: 'pre', text: 'open the door', systemName: 'door controller' })
    const r = atomize({ kind: 'resp', text: 'open the door', systemName: 'door controller' })
    expect(g.name).not.toBe(r.name)
  })

  it('the reproducer is a contradiction naming both requirements', async () => {
    const report = await runCheck(await docOf([WHEN, WHILE]))
    const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })
})

describe('AC-3-3 — every grouping reader agrees on the one namespace', () => {
  const reqOf = (id: string, slot: 'trigger' | 'preCondition'): EncodableRequirement => ({
    id,
    patternType: slot === 'trigger' ? 'event-driven' : 'state-driven',
    [slot]: 'the train is moving',
    systemName: 'door controller',
    systemResponse: 'open the door',
    negated: slot === 'preCondition',
    sentence: '',
    priority: 'medium',
    status: 'draft',
  })
  const encoded = [reqOf('when', 'trigger'), reqOf('while', 'preCondition')].map((r) =>
    encode(r, makeAtomize()),
  )

  it('planContextGroups builds ONE guarded group, and both requirements are live in it', () => {
    const guarded = planContextGroups(encoded).filter((g) => g.contextAtoms.length > 0)
    expect(guarded).toHaveLength(1)
    const [group] = guarded
    for (const e of encoded) expect(liveIn(group as never, contextAtomsOf(e))).toBe(true)
  })

  it('the needs-review tier names both requirements as members of that group', () => {
    const guarded = planNeedsReviewGroups(encoded).filter((g) => g.contextAtoms.length > 0)
    expect(guarded.map((g) => g.memberIds)).toEqual([['when', 'while']])
  })

  it('the atom table still records WHICH slot each guard came from', () => {
    // The namespace is shared; the slot is not forgotten. `incomplete` reads trigger-vs-
    // precondition off the row kind, never off the name.
    expect(encoded.map((e) => e.atoms.filter((a) => a.kind !== 'resp').map((a) => a.kind))).toEqual(
      [['trig'], ['pre']],
    )
  })
})
