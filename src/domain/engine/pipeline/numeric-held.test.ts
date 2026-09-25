/**
 * Spec 007's demote-not-prove contract for the numeric tier, through `runCheck`: a response's
 * bound is PROVED only in a shape where it is what the response holds its quantity to, and
 * every other bound is DISCLOSED against the bounds it opposes.
 *
 * The subject key (every word before the comparator) is exact, but that the subject NAMES ONE
 * QUANTITY WITH A BOUND is a reading of the sentence. `sound the alarm for readings above 90
 * degrees celsius` and `... below 5 degrees celsius` share the key `sound the alarm for
 * readings`, and they hold together: the bound picks out which readings the alarm is for. Each
 * case below is a consistent document the tier proved contradictory at error severity (669c0e9,
 * 2aaa8e8, and 8c6f0be alike); each positive control is a conflicting document it still proves.
 *
 * Its own file, like `numeric-qualifier.test.ts`: every `runCheck` in a vitest worker shares
 * one z3 WASM heap, fixed at 2 GiB.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idAt = (i: number) => `aaaaaaaa-2222-4222-8222-${String(i).padStart(12, '0')}`

interface ReqSpec {
  readonly systemResponse: string
  readonly trigger?: string
  readonly preCondition?: string
}

const reqOf = (id: string, systemName: string, s: ReqSpec) => ({
  id,
  patternType:
    s.trigger !== undefined
      ? ('event-driven' as const)
      : s.preCondition !== undefined
        ? ('state-driven' as const)
        : ('ubiquitous' as const),
  systemName,
  ...(s.trigger !== undefined ? { trigger: s.trigger } : {}),
  ...(s.preCondition !== undefined ? { preCondition: s.preCondition } : {}),
  systemResponse: s.systemResponse,
  negated: false,
  sentence:
    `${s.preCondition !== undefined ? `While ${s.preCondition}, ` : ''}` +
    `${s.trigger !== undefined ? `When ${s.trigger}, ` : ''}the ${systemName} shall ` +
    `${s.systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

/** Run `specs` as one document of `system`; the report plus the id each spec got. */
const check = async (system: string, specs: ReadonlyArray<ReqSpec | string>) => {
  const reqs = specs.map((s, i) =>
    reqOf(idAt(i), system, typeof s === 'string' ? { systemResponse: s } : s),
  )
  const report = await runCheck(
    {
      requirements: Object.fromEntries(reqs.map((r) => [r.id, r])),
      glossary: [],
      antonyms: [],
      waivers: [],
      terms: [],
      stateModel: { variables: [] },
    } as never,
    {},
  )
  const uncompared = report.findings.filter((f) => f.code === 'FND_NUMERIC_UNCOMPARED')
  return {
    ids: reqs.map((r) => r.id),
    // The decide tiers' errors: a lint rule (`every` is an absolute) is not a verdict on the pair.
    errors: report.findings
      .filter((f) => f.severity === 'error' && f.code.startsWith('FND_'))
      .map((f) => f.code),
    proved: report.findings
      .filter((f) => f.code === 'FND_NUMERIC_CONTRADICTION')
      .map((f) => [...f.requirementIds].sort()),
    uncompared: uncompared.map((f) => [...f.requirementIds].sort()),
    messages: uncompared.map((f) => f.message),
    demoted: report.coverage.demotions
      .filter((d) => d.reason === 'numeric-bounds-uncompared')
      .map((d) => [...d.requirementIds].sort()),
    verified: report.verified,
  }
}

/** Every pair here holds together: the bound picks out what the response acts on. */
const RESTRICTING: ReadonlyArray<readonly [string, string, string]> = [
  // A prepositional phrase on the object, or a quantified object.
  [
    'alarm',
    'sound the alarm for readings above 90 degrees celsius',
    'sound the alarm for readings below 5 degrees celsius',
  ],
  [
    'server',
    'log every request above 200 milliseconds',
    'log every request below 100 milliseconds',
  ],
  [
    'heater',
    'log every reading above 90 degrees celsius',
    'log every reading below 5 degrees celsius',
  ],
  [
    'filler',
    'fill every tank with fish below 3 meters',
    'fill every tank with fish above 5 meters',
  ],
  [
    'pump controller',
    'drain every tank with a level above 5 meters',
    'drain every tank with a level below 3 meters',
  ],
  [
    'bank system',
    'flag accounts with a balance below 0 dollars',
    'flag accounts with a balance above 10000 dollars',
  ],
  [
    'server',
    'reject requests with a payload above 10 megabytes',
    'reject requests with a payload below 1 kilobytes',
  ],
  // A participle or bare postmodifier on the object.
  ['payment service', 'reject payments exceeding 1000 dollars', 'reject payments under 5 dollars'],
  ['valve controller', 'close the valves set above 5 bar', 'close the valves set below 3 bar'],
  [
    'alarm',
    'flag the sensors reading above 90 degrees celsius',
    'flag the sensors reading below 5 degrees celsius',
  ],
  [
    'plant controller',
    'shut down each pump running above 3000 rpm',
    'shut down each pump running below 500 rpm',
  ],
  // A singular object and a participle: only the verb says the bound is not held.
  [
    'plant controller',
    'stop the pump running above 3000 rpm',
    'stop the pump running below 500 rpm',
  ],
  [
    'payment service',
    'reject the payment exceeding 1000 dollars',
    'reject the payment under 5 dollars',
  ],
  // A relative clause with a lexical verb, overt or with no pronoun at all.
  [
    'drone controller',
    'record the height of every drone that flew above 100 meters',
    'record the height of every drone that flew below 10 meters',
  ],
  [
    'drone controller',
    'keep the height of the drone that flew above 100 meters',
    'keep the height of the drone that flew below 10 meters',
  ],
  [
    'drone controller',
    'keep the height of the drone which flew above 100 meters',
    'keep the height of the drone which flew below 10 meters',
  ],
  [
    'pump controller',
    'drain the tank whose level stays above 5 meters',
    'drain the tank whose level stays below 3 meters',
  ],
  [
    'pump controller',
    'ensure that every tank whose level rises above 5 meters gets drained',
    'ensure that every tank whose level rises below 3 meters gets drained',
  ],
  [
    'pump controller',
    'open the drain of every tank whose gauge reads above 5 meters',
    'open the drain of every tank whose gauge reads below 3 meters',
  ],
  [
    'pump controller',
    'drain the tank which rises above 5 meters',
    'drain the tank which rises below 3 meters',
  ],
  [
    'boiler',
    'vent the boiler that reaches above 8 bar',
    'vent the boiler that reaches below 2 bar',
  ],
  [
    'valve controller',
    'close each valve whose owner set it above 5 bar',
    'close each valve whose owner set it below 3 bar',
  ],
  [
    'filler',
    'fill the tank the fish swim below 3 meters',
    'fill the tank the fish swim above 5 meters',
  ],
  [
    'pump controller',
    'stop the pump the float slid below 3 meters',
    'stop the pump the float slid above 5 meters',
  ],
  [
    'valve controller',
    'close the valve the operator set above 5 bar',
    'close the valve the operator set below 3 bar',
  ],
  [
    'fan',
    'run the fan the heater drove above 60 degrees celsius',
    'run the fan the heater drove below 40 degrees celsius',
  ],
  // A kept object that is a set of things, not a quantity: `keep` also means retain.
  [
    'recorder',
    'keep the readings above 90 degrees celsius',
    'keep the readings below 5 degrees celsius',
  ],
  [
    'monitor',
    'flag the sessions idle for at least 30 minutes',
    'flag the sessions idle for at most 1 minute',
  ],
]

describe('spec 007 C1/C2: a bound is proved only as what its response holds to it', () => {
  it('DISCLOSES, and never proves, a bound that may pick out what the response acts on', async () => {
    for (const [system, a, b] of RESTRICTING) {
      const out = await check(system, [a, b])
      const pair = [...out.ids].sort()
      expect(out.errors, a).toEqual([])
      expect(out.uncompared, a).toContainEqual(pair)
      expect(out.demoted, a).toContainEqual(pair)
      expect(out.verified, a).toBe(false)
    }
  })

  it('names why each bound was not read as the obligation, and the shape that is proved', async () => {
    const out = await check('payment service', [
      'reject payments exceeding 1000 dollars',
      'reject payments under 5 dollars',
    ])
    const [message] = out.messages
    expect(message).toContain(out.ids[0]!)
    expect(message).toContain(out.ids[1]!)
    expect(message).toContain('the plural "payments"')
    expect(message).toContain('keep <quantity> below <N>')
    const verb = await check('server', [
      'log the request above 200 milliseconds',
      'log the request below 100 milliseconds',
    ])
    expect(verb.messages.join(' ')).toContain('the verb "log"')
    const word = await check('alarm', [
      'sound the alarm for readings above 90 degrees celsius',
      'sound the alarm for readings below 5 degrees celsius',
    ])
    expect(word.messages.join(' ')).toContain('the word "for"')
  })

  it('PROVES the shapes whose bound is the obligation, each read off closed-class words', async () => {
    for (const [system, a, b] of [
      // A state verb and a quantity named by content words alone.
      [
        'server',
        'keep the response time below 200 milliseconds',
        'keep the response time above 500 milliseconds',
      ],
      [
        'server',
        'maintain the latency at most 200 milliseconds',
        'maintain the latency at least 500 milliseconds',
      ],
      [
        'heater',
        'hold the water temperature under 20 degrees celsius',
        'hold the water temperature over 30 degrees celsius',
      ],
      ['pump controller', 'have the level below 3 meters', 'have the level above 5 meters'],
      [
        'server',
        'limit the latency to at most 200 milliseconds',
        'limit the latency to at least 500 milliseconds',
      ],
      [
        'door controller',
        'keep the door unlocked for at most 30 seconds',
        'keep the door unlocked for at least 60 seconds',
      ],
      // The response's verb alone: no object for a bound to restrict.
      ['server', 'respond within 200 milliseconds', 'respond in at least 500 milliseconds'],
      ['recorder', 'store at least 30 days of logs', 'store at most 2 hours of logs'],
      // A time bound its own role word introduces, right after the action.
      [
        'pump controller',
        'run the pump for at least 10 minutes',
        'run the pump for at most 5 minutes',
      ],
      ['alarm', 'sound the siren within 2 seconds', 'sound the siren in at least 5 seconds'],
      ['archiver', 'retain the logs for at least 90 days', 'retain the logs for at most 30 days'],
      [
        'auth service',
        'expire the idle session after at most 30 minutes',
        'expire the idle session after at least 60 minutes',
      ],
    ] as const) {
      const out = await check(system, [a, b])
      expect(out.proved, a).toContainEqual([...out.ids].sort())
    }
  })
})

describe('spec 007 C3: a guard-vs-response pair split by its text is disclosed, never silent', () => {
  it('DISCLOSES a guard bound against a response bound whose text differs', async () => {
    for (const [system, guard, response] of [
      [
        'filler',
        'the level in the can is above 5 meters',
        'have the level in the can below 3 meters',
      ],
      [
        'pump controller',
        'the level during startup is above 5 meters',
        'have the level during startup below 3 meters',
      ],
      [
        'pump controller',
        'the pressure after the pump starts is above 5 bar',
        'have the pressure after the pump starts below 3 bar',
      ],
      [
        'pump controller',
        'the level that is measured is above 5 meters',
        'have the level that is measured below 3 meters',
      ],
    ] as const) {
      for (const slot of ['trigger', 'preCondition'] as const) {
        const out = await check(system, [
          { [slot]: guard, systemResponse: 'sound the alarm' },
          response,
          { [slot]: guard, systemResponse: 'stop the pump' },
          'stop the pump',
          'sound the alarm',
        ])
        const pair = [out.ids[0]!, out.ids[1]!].sort()
        expect(out.errors, `${slot}: ${response}`).toEqual([])
        expect(out.uncompared, `${slot}: ${response}`).toContainEqual(pair)
        expect(out.demoted, `${slot}: ${response}`).toContainEqual(pair)
      }
    }
  })

  it('PROVES the same pair once both bounds name one quantity with no other text', async () => {
    const out = await check('pump controller', [
      { trigger: 'the level is above 5 meters', systemResponse: 'sound the alarm' },
      'have the level below 3 meters',
    ])
    expect(out.proved).toContainEqual([...out.ids].sort())
  })

  it('never discloses two guards: a guard is where its requirement applies, not an obligation', async () => {
    // The two are co-live in the second requirement's group, on one quantity key, and split
    // only by the first guard's clause: a guard does not oblige its quantity to be anything.
    const pre = 'the temperature after the pump starts is above 5 degrees celsius'
    const out = await check('vent controller', [
      { preCondition: pre, systemResponse: 'open the vent' },
      {
        preCondition: pre,
        trigger: 'the temperature after the pump starts is below 3 degrees celsius',
        systemResponse: 'log the fault',
      },
    ])
    expect(out.errors).toEqual([])
    expect(out.uncompared).toEqual([])
  })
})

describe('spec 007 C3: a numeric core proves a conflict only among requirements that can apply at once', () => {
  // A cross-slot bridge (`While A, when B`) puts two single-guard requirements in one context
  // group though A and B exclude each other: the bridge requirement can never fire.
  const bridge = (a: string, b: string, c: string) => [
    { preCondition: 'the temperature is above 5 degrees celsius', systemResponse: a },
    { trigger: 'the temperature is below 3 degrees celsius', systemResponse: b },
    {
      preCondition: 'the temperature is above 5 degrees celsius',
      trigger: 'the temperature is below 3 degrees celsius',
      systemResponse: c,
    },
  ]

  it('proves nothing from guards that exclude each other, on their own quantity or another', async () => {
    for (const specs of [
      bridge('open the vent', 'log the event', 'sound the alarm'),
      bridge('keep the pressure above 5 bar', 'log the event', 'keep the pressure below 3 bar'),
    ]) {
      const out = await check('vent controller', specs)
      expect(out.proved, specs[0]!.systemResponse).toEqual([])
    }
    // Obligations under the bridge are disclosed, as they are with no bridge at all: the tier
    // did not decide whether the guards meet, only that their bounds cannot.
    const out = await check(
      'vent controller',
      bridge('keep the pressure above 5 bar', 'log the event', 'keep the pressure below 3 bar'),
    )
    expect(out.uncompared).toContainEqual([out.ids[0]!, out.ids[2]!].sort())
    expect(out.verified).toBe(false)
  })

  it('PROVES the same obligations under guards that can hold at once', async () => {
    const out = await check('vent controller', [
      {
        preCondition: 'the temperature is above 5 degrees celsius',
        systemResponse: 'keep the pressure above 5 bar',
      },
      {
        preCondition: 'the temperature is above 5 degrees celsius',
        trigger: 'the temperature is below 30 degrees celsius',
        systemResponse: 'keep the pressure below 3 bar',
      },
    ])
    expect(out.proved).toContainEqual([...out.ids].sort())
  })
})
