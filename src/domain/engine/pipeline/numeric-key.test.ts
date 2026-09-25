/**
 * Spec 007 C1 for the numeric tier's quantity key, through `runCheck`: the key is exact, and a
 * `,` or `.` between two digits is part of the number it spells (`atomize.ts` `DIGIT_SEPARATOR`),
 * so `zone 1,500` and `zone 1.500` never share a Real.
 *
 * Its own file, like `numeric-held.test.ts`: every `runCheck` in a vitest worker shares one z3
 * WASM heap, fixed at 2 GiB, and `numeric-tier.test.ts` sits close to it.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-4444-4444-8444-00000000000a'
const ID_B = 'aaaaaaaa-4444-4444-8444-00000000000b'

interface ReqSpec {
  readonly systemName: string
  readonly systemResponse: string
}

const reqOf = (id: string, s: ReqSpec) => ({
  id,
  patternType: 'ubiquitous' as const,
  systemName: s.systemName,
  systemResponse: s.systemResponse,
  negated: false,
  sentence: `The ${s.systemName} shall ${s.systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

const reportOf = (a: ReqSpec, b: ReqSpec) =>
  runCheck(
    {
      requirements: { [ID_A]: reqOf(ID_A, a), [ID_B]: reqOf(ID_B, b) },
      glossary: [],
      antonyms: [],
      waivers: [],
      terms: [],
      stateModel: { variables: [] },
    } as never,
    {},
  )

const numericFindings = async (a: ReqSpec, b: ReqSpec) =>
  (await reportOf(a, b)).findings.filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')

/** The decide tiers' errors: R6 flags the zone numeral as a number with no unit, a lint verdict. */
const errorCodes = async (a: ReqSpec, b: ReqSpec) =>
  (await reportOf(a, b)).findings
    .filter((f) => f.severity === 'error' && f.code.startsWith('FND_'))
    .map((f) => f.code)

describe('spec 007 C1: the quantity key keeps a digit separator inside its number', () => {
  it('keeps a digit separator in the quantity subject: `zone 1,500` and `zone 1.500` are two', async () => {
    // Read as numbers, 1,500 is 1500 and 1.500 is 1.5, under either decimal convention two
    // different zones. The key deleted the separator, so the two zones' door bounds were one
    // Real and a consistent document was an error-severity contradiction.
    const plant = (systemResponse: string): ReqSpec => ({ systemName: 'plant', systemResponse })
    const pair = [
      plant('keep the zone 1,500 door unlocked for at most 30 seconds'),
      plant('keep the zone 1.500 door unlocked for at least 60 seconds'),
    ] as const
    expect(await numericFindings(...pair)).toEqual([])
    expect(await errorCodes(...pair)).toEqual([])
    // The control: one spelling on both sides is one zone, and its conflict is proved.
    const found = await numericFindings(
      plant('keep the zone 1,500 door unlocked for at most 30 seconds'),
      plant('keep the zone 1,500 door unlocked for at least 60 seconds'),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([[ID_A, ID_B]])
  })

  // Retired from `testing/recorded-gaps.test.ts` (the lint group's "proved on one quantity key"
  // gap, 302315b): 8f3a8b1 keeps the separator inside its number in `quantityKey`, so each pair
  // lands on two keys. The right outcome it recorded: no proof, `verified` false, and a
  // propose-only demotion naming both requirements (here FND_QUANTITY_ALIAS_CANDIDATE, since
  // the two keys share their nouns).
  it.each([
    [
      'zone `1,500` / `1.500` temperature',
      { systemName: 'heater', systemResponse: 'hold zone 1,500 temperature below 20 °C' },
      { systemName: 'heater', systemResponse: 'hold zone 1.500 temperature above 30 °C' },
    ],
    [
      'the `1_500` / `1.500` m pipe temperature',
      { systemName: 'heater', systemResponse: 'hold the 1_500 m pipe temperature below 20 °C' },
      { systemName: 'heater', systemResponse: 'hold the 1.500 m pipe temperature above 30 °C' },
    ],
    [
      'line `1,500` / `1.500` pressure',
      { systemName: 'plant', systemResponse: 'hold line 1,500 pressure below 5 bar' },
      { systemName: 'plant', systemResponse: 'hold line 1.500 pressure above 6 bar' },
    ],
    // The same separators in the shape the tier PROVES in (a holding verb's time bound), so
    // this guard fails on the key alone, whatever `unheldBy` reads of `hold`.
    [
      'link `1,500` / `1.500` latency',
      { systemName: 'router', systemResponse: 'keep link 1,500 latency below 20 milliseconds' },
      { systemName: 'router', systemResponse: 'keep link 1.500 latency above 30 milliseconds' },
    ],
    [
      'link `1_500` / `1.500` latency',
      { systemName: 'router', systemResponse: 'keep link 1_500 latency below 20 milliseconds' },
      { systemName: 'router', systemResponse: 'keep link 1.500 latency above 30 milliseconds' },
    ],
  ] as const)('%s: two keys, no proof, and a demotion naming both', async (_, a, b) => {
    const report = await reportOf(a, b)
    const codes = report.findings.map((f) => f.code)
    expect(codes, JSON.stringify(report.findings)).not.toContain('FND_NUMERIC_CONTRADICTION')
    expect(report.verified).toBe(false)
    const demotion = report.findings.find((f) => f.code === 'FND_QUANTITY_ALIAS_CANDIDATE')
    expect([...(demotion?.requirementIds ?? [])].sort()).toEqual([ID_A, ID_B])
  })
})
