/**
 * The numeric tier through `runCheck`, spec 007 AC-2-6: a bound is read through the
 * requirement's negation, its role word, and its whole subject. The consistent documents each
 * case pins were reproduced by the formal-methods review of 1.2.1 as an error-severity
 * `FND_NUMERIC_CONTRADICTION`: `shall not … above 30 seconds` was asserted as `> 30 s`; a
 * deadline (`within`) and a duration (`for at least`) were one quantity; and the quantity label
 * kept only Latin letters, so `zone 1 temperature` and `zone 2 temperature` were one.
 *
 * Split out of `numeric-tier.test.ts` (the AC-2-5 half) and kept in the same shape: every
 * "no conflict" case has a POSITIVE control, and the requirements are built by hand in the slot
 * shape `parse` produces. Its own file, like `numeric-key.test.ts`: every `runCheck` in a vitest
 * worker shares one z3 WASM heap, fixed at 2 GiB, and the two halves together outgrew it.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ID_B = 'aaaaaaaa-0000-4000-8000-00000000000b'

interface ReqSpec {
  readonly systemName: string
  readonly systemResponse: string
  readonly negated?: boolean
  readonly trigger?: string
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

const pairDoc = (a: ReqSpec, b: ReqSpec) => ({
  requirements: { [ID_A]: reqOf(ID_A, a), [ID_B]: reqOf(ID_B, b) },
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
  stateModel: { variables: [] },
})

/**
 * A document of any number of requirements, ids in argument order. The verifier's shape for a
 * deleted disclosure is a PAIR duplicated under a second trigger: two requirements per guard
 * silence `FND_RELATIONAL_UNCHECKED` (every atom is shared), so whatever still demotes is
 * the numeric tier's own doing.
 */
const idAt = (i: number) => `aaaaaaaa-1111-4111-8111-${String(i).padStart(12, '0')}`
const manyDoc = (...specs: ReqSpec[]) => ({
  ...pairDoc(specs[0]!, specs[1]!),
  requirements: Object.fromEntries(specs.map((s, i) => [idAt(i), reqOf(idAt(i), s)])),
})

/** The pair `a`/`b` under trigger `t1`, and again under trigger `t2`. */
const twoTriggers = (
  base: Pick<ReqSpec, 'systemName'>,
  a: string,
  b: string,
  t1: string,
  t2: string,
): ReqSpec[] => [
  { ...base, systemResponse: a, trigger: t1 },
  { ...base, systemResponse: b, trigger: t1 },
  { ...base, systemResponse: a, trigger: t2 },
  { ...base, systemResponse: b, trigger: t2 },
]

/** The numeric-contradiction findings `check` reports for the two requirements. */
const numericFindings = async (a: ReqSpec, b: ReqSpec) => {
  const report = await runCheck(pairDoc(a, b) as never, {})
  return report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
}

/** Error-severity findings of any code the numeric tier could own. */
const errorCodes = async (a: ReqSpec, b: ReqSpec) => {
  const report = await runCheck(pairDoc(a, b) as never, {})
  return report.findings.filter((f) => f.severity === 'error').map((f) => f.code)
}

const door = (systemResponse: string, negated = false): ReqSpec => ({
  systemName: 'door controller',
  systemResponse,
  negated,
})
const siren = (systemResponse: string): ReqSpec => ({
  systemName: 'alarm unit',
  trigger: 'an intrusion is detected',
  systemResponse,
})
const fridge = (systemResponse: string): ReqSpec => ({
  systemName: 'refrigeration controller',
  systemResponse,
})

describe('AC-2-6: a bound is read through negation, role, and the whole subject', () => {
  it('reads `shall not … above 30 seconds` as at most 30 seconds', async () => {
    // NOT(x > 30 s) is x <= 30 s, which the `below 10 seconds` bound sits inside.
    expect(
      await numericFindings(
        door('keep the door unlocked above 30 seconds', true),
        door('keep the door unlocked below 10 seconds'),
      ),
    ).toEqual([])
    expect(
      await errorCodes(
        door('keep the door unlocked above 30 seconds', true),
        door('keep the door unlocked below 10 seconds'),
      ),
    ).toEqual([])
  })

  it('proves a conflict the negation creates: `shall not … below 30 s` against below 10 s', async () => {
    // The control: NOT(x < 30 s) is x >= 30 s, which contradicts x < 10 s. A tier that
    // dropped negated responses instead of reading them would miss this.
    const found = await numericFindings(
      door('keep the door unlocked below 30 seconds', true),
      door('keep the door unlocked below 10 seconds'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
    const bounds = found[0]?.evidence?.numeric?.predicates.map((p) => [p.comparator, p.value])
    expect(bounds).toContainEqual(['>=', 30_000])
  })

  it('reads a negation that governs the bound itself: `not below 30` is at least 30', async () => {
    expect(
      await numericFindings(
        door('keep the door unlocked not below 30 seconds'),
        door('keep the door unlocked not above 40 seconds'),
      ),
    ).toEqual([])
  })

  it('proves nothing from two negated bounds: never doing the action satisfies both', async () => {
    // `shall not keep the door unlocked above 30 s` is NOT (unlocked ∧ d > 30), weaker than
    // `d <= 30`: it constrains the duration only IF the door is kept unlocked. Read as two
    // obligations on the magnitude, the pair was `d <= 30 ∧ d >= 40`, an error on a
    // document a controller that never unlocks satisfies.
    const neither = [
      door('keep the door unlocked above 30 seconds', true),
      door('keep the door unlocked below 40 seconds', true),
    ] as const
    expect(await numericFindings(...neither)).toEqual([])
    expect(await errorCodes(...neither)).toEqual([])
    // The same shape under a shared trigger.
    const pump = (systemResponse: string): ReqSpec => ({
      systemName: 'dosing pump',
      trigger: 'the patient is a child',
      systemResponse,
      negated: true,
    })
    expect(
      await errorCodes(pump('deliver the dose above 3 mL'), pump('deliver the dose below 5 mL')),
    ).toEqual([])
  })

  it('still proves a negated bound against a positive one, which asserts the action happens', async () => {
    // The control: `shall keep the door unlocked for at least 40 s` does the action, so the
    // prohibition applies to it and `d >= 40 ∧ d <= 30` is a real conflict.
    const found = await numericFindings(
      door('keep the door unlocked above 30 seconds', true),
      door('keep the door unlocked for at least 40 seconds'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('declines a negated response with two bounds, because NOT(A and B) is not NOT A and NOT B', async () => {
    expect(
      await numericFindings(
        door('keep the door unlocked above 30 seconds and below 60 seconds', true),
        door('keep the door unlocked below 10 seconds'),
      ),
    ).toEqual([])
  })

  it('declines a negated bound with a trailing qualifier: NOT (x < 30 s during a drill)', async () => {
    // Read as `x >= 30 s`, it contradicts `below 10 seconds`; the requirement only forbids
    // the short unlock DURING a drill, which the second requirement does not mention.
    expect(
      await numericFindings(
        door('keep the door unlocked below 30 seconds during a fire drill', true),
        door('keep the door unlocked below 10 seconds'),
      ),
    ).toEqual([])
  })

  it('declines a negated bound beside a comparator it could not read', async () => {
    // Both forbid a conjunction whose first half (`above the alarm threshold`) has no
    // number. Read as `x >= 30 s` and `x <= 20 s` they are UNSAT; the document is satisfied
    // by never unlocking above the threshold at all.
    expect(
      await numericFindings(
        door('keep the door unlocked above the alarm threshold and below 30 seconds', true),
        door('keep the door unlocked above the alarm threshold and above 20 seconds', true),
      ),
    ).toEqual([])
  })

  it('keeps a deadline (`within`) and a duration (`for at least`) as two quantities', async () => {
    // Sounding the siren within 2 s of the intrusion and keeping it sounding for 30 s are
    // both satisfiable at once. One variable reads `<= 2 s ∧ >= 30 s`.
    expect(
      await numericFindings(
        siren('sound the siren within 2 seconds'),
        siren('sound the siren for at least 30 seconds'),
      ),
    ).toEqual([])
    // The control: two deadlines on the same response do conflict.
    const found = await numericFindings(
      siren('sound the siren within 2 seconds'),
      siren('sound the siren in at least 30 seconds'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('keeps the two roles apart under a committed glossary alias too', async () => {
    // The alias says `start the siren` and `sound the siren` name one response; it says
    // nothing about a deadline being a duration. Keyed on the alias alone, the two bounds
    // met on one variable and the author's synonym became an error.
    const doc = {
      ...pairDoc(
        siren('start the siren within 2 seconds'),
        siren('sound the siren for at least 30 seconds'),
      ),
      glossary: [{ canonical: 'sound the siren', aliases: ['start the siren'] }],
    }
    const report = await runCheck(doc as never, {})
    expect(report.findings.map((f) => f.code)).not.toContain('FND_NUMERIC_CONTRADICTION')
    // Kept apart is not silently dropped: the aliased pair is disclosed.
    expect(report.findings.map((f) => f.code)).toContain('FND_NUMERIC_UNCOMPARED')
    // And before the alias, the pair is still PROPOSED — the candidate is a discloser and
    // pairs on the coarse unit class — but its message does not promise a proof the
    // decide tier will not make: it names the disclosure the alias leads to.
    const bare = await runCheck(
      pairDoc(
        siren('start the siren within 2 seconds'),
        siren('sound the siren for at least 30 seconds'),
      ) as never,
      {},
    )
    const candidate = bare.findings.find((f) => f.code === 'FND_QUANTITY_ALIAS_CANDIDATE')
    expect(candidate?.message).toContain('FND_NUMERIC_UNCOMPARED')
    expect(candidate?.message).not.toContain('can prove any conflict')
    // The control: two DEADLINES under two verbs are proposed, and once aliased, proved.
    const sameRole = pairDoc(
      siren('start the siren within 2 seconds'),
      siren('sound the siren in at least 30 seconds'),
    )
    const proposed = await runCheck(sameRole as never, {})
    expect(proposed.findings.map((f) => f.code)).toContain('FND_QUANTITY_ALIAS_CANDIDATE')
    const aliased = await runCheck({ ...sameRole, glossary: doc.glossary } as never, {})
    expect(
      aliased.findings
        .filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
        .map((f) => f.requirementIds),
    ).toEqual([[ID_A, ID_B]])
  })

  it('reads a period (`at least once every`) as a bound on the interval, not the count', async () => {
    // At least one poll in every 5 s window and no more than one per second: the interval
    // is between 1 s and 5 s. Read as a bound on the number, `>= 5 s ∧ <= 1 s` is UNSAT.
    const monitor = (systemResponse: string): ReqSpec => ({
      systemName: 'monitor',
      trigger: 'the sensor is enabled',
      systemResponse,
    })
    expect(
      await numericFindings(
        monitor('poll the sensor at least once every 5 seconds'),
        monitor('poll the sensor at most once every 1 second'),
      ),
    ).toEqual([])
    // The control: at least once a second but at most once every five is a real conflict.
    const found = await numericFindings(
      monitor('poll the sensor at least once every 1 second'),
      monitor('poll the sensor at most once every 5 seconds'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('reads `within 5 mm` as a tolerance on a distance, not a deadline', async () => {
    // A deadline is a TIME role. `keep the error within 5 mm` bounds the error
    // itself, so it meets `at least 10 mm` on one variable and the conflict is proved.
    const doc = manyDoc(
      ...twoTriggers(
        { systemName: 'positioner' },
        'keep the error within 5 mm',
        'keep the error at least 10 mm',
        'the arm is homed',
        'the arm is parked',
      ),
    )
    const report = await runCheck(doc as never, {})
    const proven = report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
    expect(proven.map((f) => f.requirementIds)).toEqual([
      [idAt(0), idAt(1)],
      [idAt(2), idAt(3)],
    ])
    // Nor is `for` a duration on a distance: `keep the travel for at least 10 mm` and `keep the
    // travel within 5 mm` are two magnitudes of one travel, and they conflict.
    const travel = await numericFindings(
      { systemName: 'positioner', systemResponse: 'keep the travel within 5 mm' },
      { systemName: 'positioner', systemResponse: 'keep the travel for at least 10 mm' },
    )
    expect(travel.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('asserts an unmarked bound on EVERY role beside it, so the verdict stays monotone', async () => {
    // With a deadline and a duration on one key, `below 1 second` carries no role of its own.
    // Read against the duration it conflicts with `for at least 30 seconds`; asserting it on
    // one role only would let adding the deadline requirement DELETE that proof. The verb
    // alone, so every bound is its obligation (`sound the siren below 1 second` is not read so:
    // `numeric-held.test.ts`).
    const doc = manyDoc(
      siren('sound within 2 seconds'),
      siren('sound for at least 30 seconds'),
      siren('sound below 1 second'),
    )
    const report = await runCheck(doc as never, {})
    const proven = report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
    expect(proven.map((f) => f.requirementIds)).toEqual([[idAt(1), idAt(2)]])
  })

  it('compares an unmarked bound with a deadline: `respond over 30 ms` meets `respond within 30 ms`', async () => {
    // An unmarked bound carries no role of its own, so it is read against whichever role the
    // other bound names. Only two DIFFERENT markers (a deadline and a duration) are kept apart.
    for (const over of ['respond over 30 ms', 'respond above 50 ms', 'respond over 3000 ms']) {
      const within = over.endsWith('3000 ms') ? 'respond within 2 seconds' : 'respond within 30 ms'
      const doc = manyDoc(
        ...twoTriggers(
          { systemName: 'api gateway' },
          within,
          over,
          'a request arrives',
          'a retry arrives',
        ),
      )
      const report = await runCheck(doc as never, {})
      const proven = report.findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
      expect(
        proven.map((f) => f.requirementIds),
        over,
      ).toEqual([
        [idAt(0), idAt(1)],
        [idAt(2), idAt(3)],
      ])
    }
  })

  it('DISCLOSES a deadline and a duration it did not compare, so the pair cannot certify', async () => {
    // `sound the siren within 2 seconds` + `... for at least 30 seconds` is consistent (onset,
    // then how long), and `complete the infusion within 30 minutes` + `... for at least 60`
    // is not (a run of 60 minutes cannot complete in 30) — one role pair, two verdicts. The
    // tier proves neither, and says so.
    const siren2 = manyDoc(
      ...twoTriggers(
        { systemName: 'alarm unit' },
        'sound the siren within 2 seconds',
        'sound the siren for at least 30 seconds',
        'an intrusion is detected',
        'a tamper is detected',
      ),
    )
    const report = await runCheck(siren2 as never, {})
    expect(report.counts.error).toBe(0)
    expect(report.findings.map((f) => f.code)).toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
    expect(report.verified).toBe(false)
  })

  it('still PROPOSES an alias across roles, so issue #2 (a) cannot certify', async () => {
    // A completion deadline and a run duration under two verbs are two quantity keys. The
    // candidate is a DISCLOSER, so it pairs on the coarse unit class, never on the role the
    // prover splits on; a finer key there deleted the only demotion the document had.
    for (const [a, b] of [
      ['complete the infusion within 30 minutes', 'run the infusion for at least 60 minutes'],
      ['finish the backup within 30 minutes', 'run the backup for at least 60 minutes'],
    ] as const) {
      const doc = manyDoc(
        ...twoTriggers(
          { systemName: 'infusion pump' },
          a,
          b,
          'the dose is started',
          'the dose is resumed',
        ),
      )
      const report = await runCheck(doc as never, {})
      expect(
        report.findings.map((f) => f.code),
        a,
      ).toContain('FND_QUANTITY_ALIAS_CANDIDATE')
      expect(report.verified, a).toBe(false)
      // And once the author commits the alias the candidate printed, the pair meets on one
      // key with two roles: still not proved, still disclosed.
      const aliased = await runCheck(
        {
          ...doc,
          glossary: [{ canonical: a.split(' within')[0]!, aliases: [b.split(' for')[0]!] }],
        } as never,
        {},
      )
      expect(aliased.counts.error, a).toBe(0)
      expect(
        aliased.findings.map((f) => f.code),
        a,
      ).toContain('FND_NUMERIC_UNCOMPARED')
      expect(aliased.verified, a).toBe(false)
    }
  })

  it('DISCLOSES units it did not compare: 400 days against 1 year', async () => {
    // Keyed on its raw text, `year` never meets a `days` bound (AC-2-5), which is right for
    // `90 days` and a miss for `400 days`. The pair is disclosed rather than silently
    // certified.
    const doc = manyDoc(
      ...twoTriggers(
        { systemName: 'archive service' },
        'retain the logs for at least 400 days',
        'retain the logs for at most 1 year',
        'a log is written',
        'a log is rotated',
      ),
    )
    const report = await runCheck(doc as never, {})
    expect(report.counts.error).toBe(0)
    expect(report.findings.map((f) => f.code)).toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.verified).toBe(false)
  })

  it('keeps digits in the quantity subject: sensor1 and sensor2 are two quantities', async () => {
    expect(
      await numericFindings(
        fridge('keep sensor1 above 20 degrees celsius'),
        fridge('keep sensor2 below 5 degrees celsius'),
      ),
    ).toEqual([])
    // The control: the same zone, the same bounds.
    const found = await numericFindings(
      fridge('keep sensor1 above 20 degrees celsius'),
      fridge('keep sensor1 below 5 degrees celsius'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('keeps non-Latin words in the quantity subject', async () => {
    const hvac = (systemResponse: string): ReqSpec => ({
      systemName: 'HVAC controller',
      systemResponse,
    })
    expect(
      await numericFindings(
        hvac('keep the 温度 below 30 percent'),
        hvac('keep the 湿度 above 60 percent'),
      ),
    ).toEqual([])
    const found = await numericFindings(
      hvac('keep the 温度 below 30 percent'),
      hvac('keep the 温度 above 60 percent'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })
})
