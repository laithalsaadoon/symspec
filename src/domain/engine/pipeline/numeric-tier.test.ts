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
    // `day` and `year` are not in any dimension (a year is not a fixed number of days), so
    // each contributes its raw text to the key and the two bounds are never asserted on one
    // variable. Keyed on `''`, `>= 90` and `<= 1` are UNSAT.
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
      archive('retain audit logs for at least 90 days'),
      archive('retain audit logs for at most 30 days'),
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
