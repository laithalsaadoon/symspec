/**
 * The numeric tier through `runCheck`, on consistent documents it used to call
 * contradictory (spec 007, AC-2-5 and AC-2-6).
 *
 * Each case is a pair of requirements the formal-methods review of 1.2.1 reproduced as an
 * error-severity `FND_NUMERIC_CONTRADICTION` on the built CLI. Every one of them is
 * consistent, and the tier fabricated the conflict by reading something the sentence does
 * not say:
 *
 *   - AC-2-5, units. An unrecognized unit contributed NOTHING to the comparison key, so `90
 *     days` and `1 year` were two unitless bounds on one variable; a JS float product made
 *     `1.1 hours` a hair larger than `66 minutes`; and `km` and `meters` were both unknown.
 *   - AC-2-6, reading. `shall not … above 30 seconds` was asserted as `> 30 s`; a deadline
 *     (`within`) and a duration (`for at least`) were one quantity; and the quantity label
 *     kept only Latin letters, so `zone 1 temperature` and `zone 2 temperature` were one.
 *
 * Every "no conflict" case is paired with a POSITIVE control that differs only in the
 * property the fix reads, so a case cannot pass because the tier stopped running or the
 * arithmetic happened to be satisfiable. The requirements are built by hand, in the slot
 * shape `parse` produces for the reproducer sentence, so the parse tier's own changes cannot
 * move these assertions.
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

const archive = (systemResponse: string): ReqSpec => ({
  systemName: 'archive service',
  systemResponse,
})
const session = (systemResponse: string): ReqSpec => ({
  systemName: 'session manager',
  systemResponse,
})
const drone = (systemResponse: string): ReqSpec => ({
  systemName: 'drone controller',
  systemResponse,
})

describe('AC-2-5: a bound is keyed on (quantity, dimension, unit), converted exactly', () => {
  it('does not compare 90 days against 1 year: an unrecognized unit keys on its own text', async () => {
    // `year` is in no dimension (a year is not a fixed number of days), so it contributes its
    // raw text to the key and never meets the `days` bound on one variable. Keyed on `''`,
    // `>= 90` and `<= 1` are UNSAT.
    expect(
      await numericFindings(
        archive('retain audit logs for at least 90 days'),
        archive('retain audit logs for at most 1 year'),
      ),
    ).toEqual([])
    expect(
      await errorCodes(
        archive('retain audit logs for at least 90 days'),
        archive('retain audit logs for at most 1 year'),
      ),
    ).toEqual([])
  })

  it('still proves a conflict between two bounds in the SAME unrecognized unit', async () => {
    // The control: raw-text keying partitions, it does not switch the tier off.
    const found = await numericFindings(
      archive('retain audit logs for at least 9 months'),
      archive('retain audit logs for at most 3 months'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('proves a day bound against an hour bound under every civil day length', async () => {
    // A civil day is at least 23 hours, so `at least 2 days` is at least 46 hours under any
    // daylight-saving policy, and `at most 24 hours` conflicts with it. Keyed on the raw text
    // `days`, the pair was neither compared nor disclosed, and the document certified.
    const found = await numericFindings(
      archive('retain logs for at least 2 days'),
      archive('retain logs for at most 24 hours'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
    // Two bounds in days share one day length, so `over 2 days` meets `at most 2 days`
    // exactly as it did in the day unit, and a week is seven of them.
    for (const [a, b] of [
      ['retain logs for over 2 days', 'retain logs for at most 2 days'],
      ['retain logs for at least 1 week', 'retain logs for at most 6 days'],
    ] as const) {
      const pair = await numericFindings(archive(a), archive(b))
      expect(
        pair.map((f) => f.requirementIds),
        a,
      ).toEqual([[ID_A, ID_B]])
    }
  })

  it('does not prove a conflict that holds only for a 24-hour day, and DISCLOSES it', async () => {
    // `at least 1 day` against `at most 1439 minutes` conflicts for a 24-hour day and not for
    // the 23-hour day of a spring-forward change. Proving it would fabricate; certifying it
    // would hide it.
    const pair = [
      archive('retain logs for at least 1 day'),
      archive('retain logs for at most 1439 minutes'),
    ] as const
    expect(await errorCodes(...pair)).toEqual([])
    const report = await runCheck(pairDoc(...pair) as never, {})
    const disclosed = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
    expect(disclosed.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
    expect(disclosed[0]?.message).toContain('23 to 25 hours')
    expect(report.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
  })

  it('reads a day as up to 25 hours: proves past it, and DISCLOSES short of it', async () => {
    // The mirror of the 23-hour case: `at most 1 day` against `at least 1470 minutes` (24.5
    // hours) conflicts for a 24-hour day and not for the 25-hour day of a fall-back change.
    const pair = [
      archive('retain logs for at most 1 day'),
      archive('retain logs for at least 1470 minutes'),
    ] as const
    expect(await errorCodes(...pair)).toEqual([])
    const report = await runCheck(pairDoc(...pair) as never, {})
    const disclosed = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
    expect(disclosed.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
    // The control: a minute past 25 hours is longer than any civil day, so it is proved.
    const found = await numericFindings(
      archive('retain logs for at most 1 day'),
      archive('retain logs for at least 1501 minutes'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('never compares a percent with a bare ratio, and DISCLOSES the pair instead', async () => {
    // 50% is 0.5, inside a 0.9 ceiling, but no rule in the sentence says the bare number is a
    // ratio: the two are on different scales unless the author restates one. Read as one
    // unitless variable, `>= 50 ∧ <= 0.9` was an error on a consistent document.
    const valve = (systemResponse: string): ReqSpec => ({ systemName: 'pump', systemResponse })
    const pair = [
      valve('keep the valve opening at least 50%'),
      valve('keep the valve opening at most 0.9'),
    ] as const
    expect(await errorCodes(...pair)).toEqual([])
    const report = await runCheck(pairDoc(...pair) as never, {})
    expect(report.findings.map((f) => f.code)).toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
    // The control: `%` and `percent` are one dimension, so 50% above a 40 percent ceiling is
    // proved.
    const found = await numericFindings(
      valve('keep the valve opening at least 50%'),
      valve('keep the valve opening at most 40 percent'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('reads scientific notation with its exponent: 5e2 ms and 1e3 ms do not conflict', async () => {
    const server = (systemResponse: string): ReqSpec => ({ systemName: 'server', systemResponse })
    expect(
      await errorCodes(server('respond in at most 1e3 ms'), server('respond in at least 5e2 ms')),
    ).toEqual([])
    // The control: the exponent is read, so 2e3 ms is above the 1e3 ms ceiling.
    const found = await numericFindings(
      server('respond in at most 1e3 ms'),
      server('respond in at least 2e3 ms'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('converts 1.1 hours to exactly 66 minutes, so the two bounds meet at one point', async () => {
    // In binary floating point `1.1 * 3_600_000` is 3960000.0000000005, a hair above
    // `66 * 60_000`, and `>= 3960000.0000000005 ∧ <= 3960000` is UNSAT.
    expect(
      await numericFindings(
        session('keep the session open at least 1.1 hours'),
        session('keep the session open at most 66 minutes'),
      ),
    ).toEqual([])
  })

  it('still proves 1.1 hours against 65 minutes, across the two time units', async () => {
    const found = await numericFindings(
      session('keep the session open at least 1.1 hours'),
      session('keep the session open at most 65 minutes'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('reads 2 km and 500 meters as one distance dimension, and they do not conflict', async () => {
    expect(
      await numericFindings(
        drone('keep the flight radius at most 2 km'),
        drone('keep the flight radius at least 500 meters'),
      ),
    ).toEqual([])
    // The control, converted across the two spellings: 2 km < 2500 m.
    const found = await numericFindings(
      drone('keep the flight radius at most 2 km'),
      drone('keep the flight radius at least 2500 meters'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('reads `m` as metres, the R6 lint unit, and never compares it with a time bound', async () => {
    // `m` used to be MINUTES in this tier while R6 accepted it as metres, so `10 m` was
    // 600000 ms and conflicted with `at most 30 seconds`.
    expect(
      await numericFindings(
        drone('keep the flight altitude at least 10 m'),
        drone('keep the flight altitude at most 30 seconds'),
      ),
    ).toEqual([])
    const found = await numericFindings(
      drone('keep the flight altitude at least 10 m'),
      drone('keep the flight altitude at most 900 cm'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('declines a decimal-comma number rather than reading `1,5` as fifteen', async () => {
    const gateway = (systemResponse: string): ReqSpec => ({
      systemName: 'API gateway',
      systemResponse,
    })
    expect(
      await numericFindings(
        gateway('respond in at most 2 seconds'),
        gateway('respond in at least 1,5 seconds'),
      ),
    ).toEqual([])
    // Nor as its integer prefix: `at most 1,5` read as `<= 1` contradicts `>= 1.2`, and
    // the author's `<= 1.5` does not.
    const mixer = (systemResponse: string): ReqSpec => ({ systemName: 'mixer', systemResponse })
    expect(
      await numericFindings(
        mixer('keep the mixing ratio at most 1,5'),
        mixer('keep the mixing ratio at least 1.2'),
      ),
    ).toEqual([])
    // A thousands separator in three-digit groups is still read: 1,500 ms > 1 s.
    const found = await numericFindings(
      gateway('respond in at most 1 second'),
      gateway('respond in at least 1,500 ms'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('declines a toleranced value rather than reading `2 ± 0.5` as the point 2', async () => {
    const pump = (systemResponse: string): ReqSpec => ({ systemName: 'pump', systemResponse })
    expect(
      await numericFindings(
        pump('keep the pressure ratio equal to 2 ± 0.5'),
        pump('keep the pressure ratio at least 2.2'),
      ),
    ).toEqual([])
    expect(
      await numericFindings(
        pump('keep the outlet temperature equal to 200 °C ± 5 °C'),
        pump('keep the outlet temperature at least 203 °C'),
      ),
    ).toEqual([])
    // The control: an untoleranced point is still a point.
    const found = await numericFindings(
      pump('keep the pressure ratio equal to 2'),
      pump('keep the pressure ratio at least 2.2'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('hands Z3 the exact rational, not the display number', async () => {
    // 51 °F is 95/9 °C = 10.555…, strictly above the decimal 10.555555555555555, which is
    // what `95 / 9` prints as a JavaScript number. Only the exact value sees the conflict.
    const oven = (systemResponse: string): ReqSpec => ({ systemName: 'oven', systemResponse })
    const found = await numericFindings(
      oven('hold the cavity temperature at least 51 degrees fahrenheit'),
      oven('hold the cavity temperature at most 10.555555555555555 degrees celsius'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('keeps megabytes and megabits apart by the case of the unit', async () => {
    const boot = (systemResponse: string): ReqSpec => ({ systemName: 'bootloader', systemResponse })
    // `MB` is a megabyte; `Mb` is conventionally a megabit, so 64 Mb is 8 MB, inside the
    // 16 MB ceiling. Case-folded, both were `mb` and `<= 16e6 ∧ >= 64e6` was UNSAT. `Mb` is
    // recognized by no dimension, so it keys on its own raw text and meets only `Mb`.
    expect(
      await numericFindings(
        boot('keep the firmware image at most 16 MB'),
        boot('keep the firmware image at least 64 Mb'),
      ),
    ).toEqual([])
    const found = await numericFindings(
      boot('keep the firmware image at most 16 MB'),
      boot('keep the firmware image at least 20 MB'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('converts 2 Gbps and 100 Mbps onto one data-rate scale, and they do not conflict', async () => {
    const uplink = (systemResponse: string): ReqSpec => ({
      systemName: 'uplink controller',
      systemResponse,
    })
    expect(
      await numericFindings(
        uplink('keep the link throughput at most 2 Gbps'),
        uplink('keep the link throughput at least 100 Mbps'),
      ),
    ).toEqual([])
    const found = await numericFindings(
      uplink('keep the link throughput at most 2 Gbps'),
      uplink('keep the link throughput at least 2500 Mbps'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  it('converts temperature scales affinely: 50 °F is 10 °C, inside a 25 °C ceiling', async () => {
    const climate = (systemResponse: string): ReqSpec => ({
      systemName: 'climate controller',
      systemResponse,
    })
    expect(
      await numericFindings(
        climate('hold the cabin temperature at least 50 degrees fahrenheit'),
        climate('hold the cabin temperature at most 25 degrees celsius'),
      ),
    ).toEqual([])
    // The control: 80 °F is 26.6 °C, above the ceiling.
    const found = await numericFindings(
      climate('hold the cabin temperature at least 80 degrees fahrenheit'),
      climate('hold the cabin temperature at most 25 degrees celsius'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })
})

describe('AC-2-5: a temperature on an offset scale is read as an absolute AND as a difference', () => {
  const chiller = (systemResponse: string): ReqSpec => ({ systemName: 'chiller', systemResponse })

  it('proves no conflict from a DIFFERENCE read as an absolute: 36 °F of differential is 20 °C', async () => {
    // Read as an absolute temperature, `at most 36 °F` is `<= 20/9 °C` and meets `>= 15 °C`
    // as a conflict. A differential, a rise, or an overshoot is a DIFFERENCE, and 36 °F of
    // difference is 20 °C of difference, above the 15 °C floor. The sentence does not say
    // which, so neither reading may be asserted alone.
    const pairs: Array<[string, string]> = [
      [
        'hold the supply return temperature differential at most 36 degrees fahrenheit',
        'hold the supply return temperature differential at least 15 degrees celsius',
      ],
      [
        'limit the temperature rise to at most 40 degF',
        'limit the temperature rise to at least 10 degC',
      ],
      [
        'limit the temperature overshoot to at most 5 kelvin',
        'limit the temperature overshoot to at least 2 degrees celsius',
      ],
    ]
    for (const [a, b] of pairs) {
      expect(await numericFindings(chiller(a), chiller(b)), `${a} / ${b}`).toEqual([])
    }
  })

  it('DISCLOSES the pair it could not decide, so a two-reading conflict cannot certify', async () => {
    // The absolute reading conflicts and the difference reading does not. Declining the proof
    // is a miss unless something says so: the pair duplicated under a second trigger silences
    // every other demotion, and the run must still not be verified.
    const doc = manyDoc(
      ...twoTriggers(
        { systemName: 'chiller' },
        'hold the supply return temperature differential at most 36 degrees fahrenheit',
        'hold the supply return temperature differential at least 15 degrees celsius',
        'the compressor starts',
        'the compressor restarts',
      ),
    )
    const report = await runCheck(doc as never, {})
    expect(report.counts.error).toBe(0)
    expect(report.findings.map((f) => f.code)).toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
    expect(report.verified).toBe(false)
  })

  it('still proves a conflict both readings agree on: 80 °F is above 25 °C either way', async () => {
    const found = await numericFindings(
      chiller('hold the supply temperature at least 80 degrees fahrenheit'),
      chiller('hold the supply temperature at most 25 degrees celsius'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })
})

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
    // A deadline is a TIME role. `keep the positioning error within 5 mm` bounds the error
    // itself, so it meets `at least 10 mm` on one variable and the conflict is proved.
    const doc = manyDoc(
      ...twoTriggers(
        { systemName: 'positioner' },
        'keep the positioning error within 5 mm',
        'keep the positioning error at least 10 mm',
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
    // Nor is `for` a duration on a distance: `travel for at least 10 mm` and `travel within
    // 5 mm` are two magnitudes of one travel, and they conflict.
    const travel = await numericFindings(
      { systemName: 'positioner', systemResponse: 'travel within 5 mm' },
      { systemName: 'positioner', systemResponse: 'travel for at least 10 mm' },
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
        'retain audit logs for at least 400 days',
        'retain audit logs for at most 1 year',
        'a log is written',
        'a log is rotated',
      ),
    )
    const report = await runCheck(doc as never, {})
    expect(report.counts.error).toBe(0)
    expect(report.findings.map((f) => f.code)).toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.verified).toBe(false)
  })

  it('keeps digits in the quantity subject: zone 1 and zone 2 are two temperatures', async () => {
    expect(
      await numericFindings(
        fridge('hold zone 1 temperature above 20 degrees celsius'),
        fridge('hold zone 2 temperature below 5 degrees celsius'),
      ),
    ).toEqual([])
    // The control: the same zone, the same bounds.
    const found = await numericFindings(
      fridge('hold zone 1 temperature above 20 degrees celsius'),
      fridge('hold zone 1 temperature below 5 degrees celsius'),
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
        hvac('keep the 温度 reading below 30 percent'),
        hvac('keep the 湿度 reading above 60 percent'),
      ),
    ).toEqual([])
    const found = await numericFindings(
      hvac('keep the 温度 reading below 30 percent'),
      hvac('keep the 温度 reading above 60 percent'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })
})
