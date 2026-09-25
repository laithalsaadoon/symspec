/**
 * The numeric tier's DISCLOSURES of bounds it never asserted together (spec 007 AC-2-6, and
 * the numeric twin of AC-3-2), through `runCheck`.
 *
 * The prover partitions bounds by context group and by the condition clause trailing a
 * bound, and each split is its safe direction: it never asserts two bounds no requirement
 * placed together. A split is also a deletion, and a run is not entitled to certify over
 * one, so each case here pairs a disclosure with the control that shows it is the split,
 * and not the arithmetic, that kept the pair apart.
 *
 * Its own file rather than a block of `numeric-tier.test.ts`: every `runCheck` in a worker
 * shares one z3 WASM heap, fixed at 2 GiB, and that file sits close to it.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ID_B = 'aaaaaaaa-0000-4000-8000-00000000000b'

interface ReqSpec {
  readonly systemName: string
  readonly systemResponse: string
  readonly trigger?: string
  readonly negated?: boolean
}

const reqOf = (id: string, s: ReqSpec) => ({
  id,
  patternType: s.trigger !== undefined ? ('event-driven' as const) : ('ubiquitous' as const),
  systemName: s.systemName,
  ...(s.trigger !== undefined ? { trigger: s.trigger } : {}),
  systemResponse: s.systemResponse,
  negated: s.negated ?? false,
  sentence:
    `${s.trigger !== undefined ? `When ${s.trigger}, the` : 'The'} ${s.systemName} shall ` +
    `${s.negated === true ? 'not ' : ''}${s.systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

const docOf = (requirements: Record<string, ReturnType<typeof reqOf>>) => ({
  requirements,
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
  stateModel: { variables: [] },
})

const pairDoc = (a: ReqSpec, b: ReqSpec) =>
  docOf({ [ID_A]: reqOf(ID_A, a), [ID_B]: reqOf(ID_B, b) })

const idAt = (i: number) => `aaaaaaaa-1111-4111-8111-${String(i).padStart(12, '0')}`
const manyDoc = (...specs: ReqSpec[]) =>
  docOf(Object.fromEntries(specs.map((s, i) => [idAt(i), reqOf(idAt(i), s)])))

const numericFindings = async (a: ReqSpec, b: ReqSpec) => {
  const report = await runCheck(pairDoc(a, b) as never, {})
  return report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
}

const errorCodes = async (a: ReqSpec, b: ReqSpec) => {
  const report = await runCheck(pairDoc(a, b) as never, {})
  return report.findings.filter((f) => f.severity === 'error').map((f) => f.code)
}

describe('AC-2-6 / AC-3-2: bounds the tier never asserted together are disclosed, not certified', () => {
  const server = (trigger: string, systemResponse: string): ReqSpec => ({
    systemName: 'server',
    trigger,
    systemResponse,
  })
  const uncompared = (report: Awaited<ReturnType<typeof runCheck>>) =>
    report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED').map((f) => f.requirementIds)

  it('DISCLOSES opposed bounds under two guards no context group makes both live', async () => {
    // A request can arrive while the cache misses, and then `<= 30 ms` and `>= 50 ms`
    // conflict. Each trigger is its own context group, so the two bounds were never asserted
    // in one solver call, and with a second requirement per trigger sharing every atom the
    // document certified. The propositional twin of this shape demotes with
    // `conditional-conflict-unchecked` (AC-3-2).
    const doc = manyDoc(
      server('the request arrives', 'respond within 30 ms'),
      server('the request arrives', 'record the timestamp'),
      server('the cache misses', 'respond in at least 50 ms'),
      server('the cache misses', 'record the timestamp'),
    )
    const report = await runCheck(doc as never, {})
    expect(report.counts.error).toBe(0)
    expect(uncompared(report)).toEqual([[idAt(0), idAt(2)]])
    expect(report.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
    expect(report.verified).toBe(false)
  })

  it('does not disclose two guarded bounds that hold together, or two guards themselves', async () => {
    // The controls. `<= 30 ms` and `>= 10 ms` co-hold, so their contexts overlapping changes
    // nothing. And a guard bound is a condition, not an obligation: `above 5` and `below 3`
    // in two triggers are where each requirement applies, never a pair to reconcile.
    const consistent = manyDoc(
      server('the request arrives', 'respond within 30 ms'),
      server('the cache misses', 'respond in at least 10 ms'),
    )
    expect(uncompared(await runCheck(consistent as never, {}))).toEqual([])
    const vent = (trigger: string, systemResponse: string): ReqSpec => ({
      systemName: 'vent controller',
      trigger,
      systemResponse,
    })
    const guards = manyDoc(
      vent('the temperature is above 5 degrees celsius', 'open the vent'),
      vent('the temperature is below 3 degrees celsius', 'close the damper'),
    )
    expect(uncompared(await runCheck(guards as never, {}))).toEqual([])
  })

  it('does not assert a bound its trailing `when …` makes conditional, and DISCLOSES the pair', async () => {
    // `parse` leaves `when the mode is heating` inside the response. Read without it, the two
    // bounds were `> 30 °C ∧ < 20 °C` everywhere, an error on a heater that heats and cools
    // in different modes.
    const heater = (systemResponse: string): ReqSpec => ({ systemName: 'heater', systemResponse })
    const modes = [
      heater('keep the temperature above 30 degrees celsius when the mode is heating'),
      heater('keep the temperature below 20 degrees celsius when the mode is cooling'),
    ] as const
    expect(await errorCodes(...modes)).toEqual([])
    const report = await runCheck(pairDoc(...modes) as never, {})
    expect(uncompared(report)).toEqual([[ID_A, ID_B]])
    expect(report.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
    // The control: under the SAME qualifier the two bounds meet and conflict.
    const found = await numericFindings(
      heater('keep the temperature above 30 degrees celsius when the mode is heating'),
      heater('keep the temperature below 20 degrees celsius when the mode is heating'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('never reads a delay after an event as the magnitude of a duration or a deadline', async () => {
    // `at most 2 minutes after the tank fills` is a delay from an event, and `for at least 10
    // minutes` how long the pump runs: `dur >= 10 ∧ delay <= 2` is satisfiable. The unmarked
    // bound was compared with the duration on one variable, an error at every one of these.
    const pump = (systemResponse: string): ReqSpec => ({ systemName: 'pump', systemResponse })
    for (const [a, b] of [
      [
        'run the pump for at least 10 minutes',
        'run the pump at most 2 minutes after the tank fills',
      ],
      [
        'sound the siren at least 5 seconds after the door opens',
        'sound the siren for at most 3 seconds',
      ],
      [
        'sound the siren within 2 seconds',
        'sound the siren at least 30 seconds after the alarm clears',
      ],
    ] as const) {
      expect(await errorCodes(pump(a), pump(b)), a).toEqual([])
      const report = await runCheck(pairDoc(pump(a), pump(b)) as never, {})
      expect(uncompared(report), a).toEqual([[ID_A, ID_B]])
    }
    // The control: two delays after the SAME event are one quantity, and conflict.
    const found = await numericFindings(
      pump('run the pump at least 10 minutes after the tank fills'),
      pump('run the pump at most 2 minutes after the tank fills'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  describe('a prohibition bounds an action only where it happens, so pairs are not enough', () => {
    const door = (trigger: string, systemResponse: string, negated = false): ReqSpec => ({
      systemName: 'door controller',
      trigger,
      systemResponse,
      negated,
    })
    const log = (trigger: string) => door(trigger, 'log the entry')

    it('DISCLOSES two prohibitions and the obligation that forces the action', async () => {
      // If the fire alarm sounds while a badge is accepted and the door is forced, the door
      // stays unlocked at least 1 s, at most 30 s, and at least 40 s. Each PAIR is consistent
      // (two prohibitions are met by never doing the action; one prohibition and the
      // obligation meet), so a pairwise discloser certified the document.
      const doc = manyDoc(
        door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
        log('the badge is accepted'),
        door('the door is forced', 'keep the door unlocked below 40 seconds', true),
        log('the door is forced'),
        door('the fire alarm sounds', 'keep the door unlocked for at least 1 second'),
        log('the fire alarm sounds'),
      )
      const report = await runCheck(doc as never, {})
      expect(report.counts.error).toBe(0)
      expect(uncompared(report)).toEqual([[idAt(0), idAt(2), idAt(4)]])
      expect(report.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
      expect(report.verified).toBe(false)
    })

    it('DISCLOSES them when the obligation is split off by its trailing text instead', async () => {
      const doc = manyDoc(
        door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
        log('the badge is accepted'),
        door('the door is forced', 'keep the door unlocked below 40 seconds', true),
        log('the door is forced'),
        {
          systemName: 'door controller',
          systemResponse: 'keep the door unlocked for at least 1 second during a fire drill',
        },
      )
      const report = await runCheck(doc as never, {})
      expect(report.counts.error).toBe(0)
      expect(uncompared(report)).toEqual([[idAt(0), idAt(2), idAt(4)]])
    })

    it('DISCLOSES a prohibited point between two obligations that meet only there', async () => {
      // `>= 30 s`, `<= 30 s`, and `not exactly 30 s`: every pair holds, and all three do not.
      const doc = manyDoc(
        door('the badge is accepted', 'keep the door unlocked for at least 30 seconds'),
        log('the badge is accepted'),
        door('the door is forced', 'keep the door unlocked for at most 30 seconds'),
        log('the door is forced'),
        door('the fire alarm sounds', 'keep the door unlocked for exactly 30 seconds', true),
        log('the fire alarm sounds'),
      )
      const report = await runCheck(doc as never, {})
      expect(report.counts.error).toBe(0)
      expect(uncompared(report)).toEqual([[idAt(0), idAt(2), idAt(4)]])
    })

    it('does not disclose prohibitions an obligation can meet, or with no obligation at all', async () => {
      // The controls: `<= 30 s` and `>= 10 s` leave room for the obligation, and two opposed
      // prohibitions alone are met by never keeping the door unlocked.
      const room = manyDoc(
        door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
        log('the badge is accepted'),
        door('the door is forced', 'keep the door unlocked below 10 seconds', true),
        log('the door is forced'),
        door('the fire alarm sounds', 'keep the door unlocked for at least 1 second'),
        log('the fire alarm sounds'),
      )
      expect(uncompared(await runCheck(room as never, {}))).toEqual([])
      const never = manyDoc(
        door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
        log('the badge is accepted'),
        door('the door is forced', 'keep the door unlocked below 40 seconds', true),
        log('the door is forced'),
      )
      expect(uncompared(await runCheck(never as never, {}))).toEqual([])
      // A set is disclosed only when it is the smallest conflict: here the obligation already
      // conflicts with the first prohibition alone, and that PAIR is the one disclosure.
      const pair = manyDoc(
        door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
        log('the badge is accepted'),
        door('the door is forced', 'keep the door unlocked below 10 seconds', true),
        log('the door is forced'),
        door('the fire alarm sounds', 'keep the door unlocked for at least 40 seconds'),
        log('the fire alarm sounds'),
      )
      expect(uncompared(await runCheck(pair as never, {}))).toEqual([[idAt(0), idAt(4)]])
    })

    describe('an obligation with no bound does the action too', () => {
      const contradictions = (report: Awaited<ReturnType<typeof runCheck>>) =>
        report.findings
          .filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
          .map((f) => f.requirementIds)

      it('PROVES two opposed prohibitions against `keep the door unlocked` under one trigger', async () => {
        // `keep the door unlocked` does the action; then it lasts some `d`, and `d <= 30 s`
        // and `d >= 40 s` cannot both hold. Only an obligation WITH a bound asserted the
        // action, so this certified once a relational waiver cleared the other demotion.
        const doc = manyDoc(
          door('the badge is accepted', 'keep the door unlocked'),
          door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
          door('the badge is accepted', 'keep the door unlocked below 40 seconds', true),
        )
        const report = await runCheck(doc as never, {})
        expect(contradictions(report)).toEqual([[idAt(0), idAt(1), idAt(2)]])
        // The evidence lists bounds, and the performer has none, so the message names it.
        const [finding] = report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
        expect(finding?.message).toContain(`Requirement ${idAt(0)} does "keep the door unlocked"`)
      })

      it('PROVES ubiquitous prohibitions against a triggered bare obligation', async () => {
        const doc = manyDoc(
          {
            systemName: 'door controller',
            systemResponse: 'keep the door unlocked above 30 seconds',
            negated: true,
          },
          door('the door is forced', 'keep the door unlocked above 30 seconds', true),
          {
            systemName: 'door controller',
            systemResponse: 'keep the door unlocked below 40 seconds',
            negated: true,
          },
          door('the badge is accepted', 'keep the door unlocked below 40 seconds', true),
          door('the fire alarm sounds', 'keep the door unlocked'),
          log('the fire alarm sounds'),
        )
        const report = await runCheck(doc as never, {})
        expect(contradictions(report)).toContainEqual([idAt(0), idAt(2), idAt(4)])
        expect(report.verified).toBe(false)
      })

      it('DISCLOSES them under three triggers no context group makes all live', async () => {
        const doc = manyDoc(
          door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
          log('the badge is accepted'),
          door('the door is forced', 'keep the door unlocked below 40 seconds', true),
          log('the door is forced'),
          door('the fire alarm sounds', 'keep the door unlocked'),
          log('the fire alarm sounds'),
        )
        const report = await runCheck(doc as never, {})
        expect(report.counts.error).toBe(0)
        expect(uncompared(report)).toEqual([[idAt(0), idAt(2), idAt(4)]])
        expect(report.coverage.demotions.map((d) => d.reason)).toContain(
          'numeric-bounds-uncompared',
        )
        expect(report.verified).toBe(false)
      })

      it('DISCLOSES them against a bare obligation followed by text, whatever the words', async () => {
        // `keep the door unlocked until the guard arrives` does the action. It was keyed on the
        // WHOLE response, a quantity no prohibition bounds, so no cell or set saw a performer and
        // the document certified once a relational waiver cleared the other demotion. Keyed as a
        // bound's subject is, the trailing text is the performer's qualifier, which this tier
        // does not read, so the set is disclosed and never proved.
        for (const tail of [
          'until the guard arrives',
          'for the evacuees',
          'while the alarm sounds',
          'for 45 seconds',
          'when the fire alarm sounds',
        ]) {
          const doc = manyDoc(
            door('the badge is accepted', `keep the door unlocked ${tail}`),
            door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
            door('the badge is accepted', 'keep the door unlocked below 40 seconds', true),
          )
          const report = await runCheck(doc as never, {})
          expect(report.counts.error, tail).toBe(0)
          expect(uncompared(report), tail).toEqual([[idAt(0), idAt(1), idAt(2)]])
          expect(report.verified, tail).toBe(false)
        }
      })

      it('DISCLOSES ubiquitous prohibitions against a triggered bare obligation with trailing text', async () => {
        const doc = manyDoc(
          {
            systemName: 'door controller',
            systemResponse: 'keep the door unlocked above 30 seconds',
            negated: true,
          },
          door('the door is forced', 'keep the door unlocked above 30 seconds', true),
          {
            systemName: 'door controller',
            systemResponse: 'keep the door unlocked below 40 seconds',
            negated: true,
          },
          door('the badge is accepted', 'keep the door unlocked below 40 seconds', true),
          door('the fire alarm sounds', 'keep the door unlocked until the alarm is reset'),
          log('the fire alarm sounds'),
        )
        const report = await runCheck(doc as never, {})
        expect(report.counts.error).toBe(0)
        expect(uncompared(report)).toContainEqual([idAt(0), idAt(2), idAt(4)])
        expect(report.verified).toBe(false)
      })

      it('DISCLOSES them against an obligation whose bound lies after the action', async () => {
        // A response WITH a bound performed only each bound's own quantity. When the bound
        // sits in a condition clause, behind a time preposition, or on a later conjunct, that
        // quantity is not the action (`keep the door unlocked when the level`, `... unlocked
        // after`, `... then sound the buzzer`), so nothing performed `keep the door unlocked`
        // and the document certified where the bare `when the level is high` was disclosed.
        for (const response of [
          'keep the door unlocked when the level is above 5 meters',
          'keep the door unlocked until the level is above 5 meters',
          'keep the door unlocked, then sound the buzzer for at most 5 seconds',
          'keep the door unlocked after at most 5 seconds',
        ]) {
          const doc = manyDoc(
            {
              systemName: 'door controller',
              systemResponse: 'keep the door unlocked above 30 seconds',
              negated: true,
            },
            door('the door is forced', 'keep the door unlocked above 30 seconds', true),
            {
              systemName: 'door controller',
              systemResponse: 'keep the door unlocked below 40 seconds',
              negated: true,
            },
            door('the badge is accepted', 'keep the door unlocked below 40 seconds', true),
            door('the fire alarm sounds', response),
            log('the fire alarm sounds'),
          )
          const report = await runCheck(doc as never, {})
          expect(report.counts.error, response).toBe(0)
          expect(uncompared(report), response).toContainEqual([idAt(0), idAt(2), idAt(4)])
          expect(
            report.coverage.demotions.map((d) => d.reason),
            response,
          ).toContain('numeric-bounds-uncompared')
          expect(report.verified, response).toBe(false)
          // Keyed as a bound's subject, not only admitted by its words.
          const messages = report.findings
            .filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
            .map((f) => f.message)
            .join(' ')
          expect(messages, response).not.toContain('was not read as doing')
        }
      })

      it('DISCLOSES them against a response that holds the action behind other words', async () => {
        // `immediately keep the door unlocked` does the action, and no prefix of it is the
        // prohibitions' key; neither is `keep door unlocked`. Two opposed prohibitions that
        // together forbid an action are disclosed against a response of the same system that
        // holds the action's words in order, never proved, since the tier did not key it.
        for (const response of [
          'immediately keep the door unlocked',
          'also keep the door unlocked',
          'continue to keep the door unlocked',
          'keep door unlocked',
        ]) {
          const doc = manyDoc(
            {
              systemName: 'door controller',
              systemResponse: 'keep the door unlocked above 30 seconds',
              negated: true,
            },
            door('the door is forced', 'keep the door unlocked above 30 seconds', true),
            {
              systemName: 'door controller',
              systemResponse: 'keep the door unlocked below 40 seconds',
              negated: true,
            },
            door('the badge is accepted', 'keep the door unlocked below 40 seconds', true),
            door('the fire alarm sounds', response),
            log('the fire alarm sounds'),
            door('the door is forced', response),
          )
          const report = await runCheck(doc as never, {})
          expect(report.counts.error, response).toBe(0)
          expect(uncompared(report), response).toContainEqual([idAt(0), idAt(2), idAt(4)])
          expect(
            report.coverage.demotions.map((d) => d.reason),
            response,
          ).toContain('numeric-bounds-uncompared')
          expect(report.verified, response).toBe(false)
          const [finding] = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
          expect(finding?.message, response).toContain('was not read as doing')
        }
      })

      it('does not read another action behind other words, or another system, as doing it', async () => {
        // The controls: `keep the door locked` is another action whatever precedes it, and the
        // gate controller's response is not the door controller's.
        for (const [systemName, response] of [
          ['door controller', 'immediately keep the door locked'],
          ['door controller', 'log the entry'],
          ['gate controller', 'immediately keep the door unlocked'],
        ] as const) {
          const doc = manyDoc(
            door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
            door('the badge is accepted', 'keep the door unlocked below 40 seconds', true),
            { systemName, trigger: 'the badge is accepted', systemResponse: response },
          )
          const report = await runCheck(doc as never, {})
          expect(contradictions(report), response).toEqual([])
          expect(uncompared(report), `${systemName}: ${response}`).toEqual([])
        }
      })

      it('does not read another action followed by text, or a room to meet, as a conflict', async () => {
        for (const [response, low] of [
          ['keep the door locked until the guard arrives', '40'],
          ['keep the door unlocked until the guard arrives', '10'],
        ] as const) {
          const doc = manyDoc(
            door('the badge is accepted', response),
            door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
            door('the badge is accepted', `keep the door unlocked below ${low} seconds`, true),
          )
          const report = await runCheck(doc as never, {})
          expect(contradictions(report), response).toEqual([])
          expect(uncompared(report), response).toEqual([])
        }
      })
    })

    describe('an obligation bounded in another dimension does the action too', () => {
      const pump = (systemResponse: string, trigger?: string, negated = false): ReqSpec => ({
        systemName: 'pump controller',
        ...(trigger !== undefined ? { trigger } : {}),
        systemResponse,
        negated,
      })
      const contradictions = (report: Awaited<ReturnType<typeof runCheck>>) =>
        report.findings
          .filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
          .map((f) => f.requirementIds)

      it('PROVES time prohibitions against an obligation bounded in percent', async () => {
        // `run the pump at least 80%` runs the pump, so `not above 30 minutes` and `not below 40
        // minutes` cannot both hold. Only a bare obligation forced the action across unit
        // classes, and 669c0e9's error on this document was gone.
        const doc = manyDoc(
          pump('run the pump above 30 minutes', undefined, true),
          pump('run the pump below 40 minutes', undefined, true),
          pump('run the pump at least 80%', 'the tank is low'),
          pump('log the level', 'the tank is low'),
        )
        const report = await runCheck(doc as never, {})
        expect(contradictions(report)).toEqual([[idAt(0), idAt(1), idAt(2)]])
        const [finding] = report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
        expect(finding?.message).toContain(
          `Requirement ${idAt(2)} does "run the pump at least 80%"`,
        )
        expect(report.verified).toBe(false)
      })

      it('names a performer only when it has no bound in the proof’s own unit', async () => {
        // An obligation bounded in minutes is in the cell through its bound, and the evidence
        // lists it; it is not also a bare performer.
        const doc = manyDoc(
          pump('run the pump above 30 minutes', 'the tank is low', true),
          pump('run the pump for at least 40 minutes', 'the tank is low'),
        )
        const report = await runCheck(doc as never, {})
        expect(contradictions(report)).toEqual([[idAt(0), idAt(1)]])
        const [finding] = report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
        expect(finding?.message).not.toContain(' does "')
      })

      it('DISCLOSES them under three triggers, or behind the obligation’s trailing text', async () => {
        for (const performer of [
          'run the pump at least 80%',
          'run the pump at least 80% after the tank fills',
        ]) {
          const doc = manyDoc(
            pump('run the pump above 30 minutes', 'the tank is full', true),
            pump('log the level', 'the tank is full'),
            pump('run the pump below 40 minutes', 'the tank is empty', true),
            pump('log the level', 'the tank is empty'),
            pump(performer, 'the tank is low'),
            pump('log the level', 'the tank is low'),
          )
          const report = await runCheck(doc as never, {})
          expect(report.counts.error, performer).toBe(0)
          expect(uncompared(report), performer).toEqual([[idAt(0), idAt(2), idAt(4)]])
          expect(report.verified, performer).toBe(false)
        }
      })

      it('DISCLOSES them against a performer in another dimension behind other words', async () => {
        const doc = manyDoc(
          pump('run the pump above 30 minutes', undefined, true),
          pump('run the pump above 30 minutes', 'the tank is full', true),
          pump('run the pump below 40 minutes', undefined, true),
          pump('run the pump below 40 minutes', 'the tank is empty', true),
          pump('immediately run the pump at least 80%', 'the tank is low'),
          pump('log the level', 'the tank is low'),
        )
        const report = await runCheck(doc as never, {})
        expect(report.counts.error).toBe(0)
        expect(uncompared(report)).toContainEqual([idAt(0), idAt(2), idAt(4)])
        expect(report.verified).toBe(false)
      })

      it('does not read another action, or a room to meet, as a conflict', async () => {
        for (const [performer, low] of [
          ['run the fan at least 80%', '40'],
          ['run the pump at least 80%', '10'],
        ] as const) {
          const doc = manyDoc(
            pump('run the pump above 30 minutes', undefined, true),
            pump(`run the pump below ${low} minutes`, undefined, true),
            pump(performer, 'the tank is low'),
            pump('log the level', 'the tank is low'),
          )
          const report = await runCheck(doc as never, {})
          expect(contradictions(report), performer).toEqual([])
          expect(uncompared(report), performer).toEqual([])
        }
      })
    })

    describe('an obligation with no bound does the action too (controls)', () => {
      const contradictions = (report: Awaited<ReturnType<typeof runCheck>>) =>
        report.findings
          .filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
          .map((f) => f.requirementIds)

      it('does not read another action, a room to meet, or a prohibition as doing it', async () => {
        // The controls: `keep the door locked` is another action; `<= 30 s` and `>= 10 s`
        // leave room; and `shall not keep the door unlocked` does not do the action at all.
        for (const [response, negated, low] of [
          ['keep the door locked', false, '40'],
          ['keep the door unlocked', false, '10'],
          ['keep the door unlocked', true, '40'],
        ] as const) {
          const doc = manyDoc(
            door('the badge is accepted', response, negated),
            door('the badge is accepted', 'keep the door unlocked above 30 seconds', true),
            door('the badge is accepted', `keep the door unlocked below ${low} seconds`, true),
          )
          const report = await runCheck(doc as never, {})
          expect(contradictions(report), response).toEqual([])
          expect(uncompared(report), response).toEqual([])
        }
      })
    })
  })
})
