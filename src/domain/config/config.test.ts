/**
 * Tests for the pinned run configuration: the schema, the `RUN_KNOBS` comparators, and the
 * strongest-of merge.
 *
 * The comparators are asserted two ways, because each catches what the other cannot:
 *
 * - DIRECTIONAL cases name one knob, one pin and one run, and say which way the verdict
 *   goes. An inverted comparator is still a perfectly good order, so only a case that states
 *   the direction can catch one (spec 007 S11 sabotage (a)).
 * - ORDER PROPERTIES run every knob over a grid of values: `weaker` is irreflexive,
 *   asymmetric and transitive, and the strongest-of merge is never weaker than either
 *   input. They catch a comparator that is not an order at all, which a directional case
 *   passes by accident on the one pair it names.
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SEMANTIC_THRESHOLD } from '../engine/formal/semantic.ts'
import {
  belowPinned,
  CONFIG_FILE_NAME,
  decodeConfig,
  type EffectivePins,
  effectivePins,
  KNOB_DEFAULTS,
  KNOBS,
  type Knob,
  type KnobValues,
  MAX_TEMPORAL_BOUND,
  pinnedInvocation,
  RUN_KNOBS,
  RUN_WEAKENING,
  type RunSettings,
  resolveReachabilityTimeoutMs,
  skeletonConfig,
  strongestOf,
} from './config.ts'

/** A run at the flag defaults, with the given knobs changed. */
const run = (changes: Partial<RunSettings> = {}): RunSettings => ({ ...KNOB_DEFAULTS, ...changes })

/** Decode a raw config, returning the failure message or the value. */
const decode = (raw: unknown) => Effect.runSync(Effect.result(decodeConfig(raw)))

const valid = (gate: Record<string, unknown> = {}) => ({ configVersion: 1, gate })

describe('the config schema', () => {
  it('lives at one file name', () => {
    expect(CONFIG_FILE_NAME).toBe('symspec.config.json')
  })

  it('decodes a config that pins every knob', () => {
    const result = decode(
      valid({
        strict: true,
        semantic: true,
        semanticThreshold: 0.7,
        embedder: 'model',
        timeoutMs: 5000,
        reachabilityTimeoutMs: 0,
        solverBudgetMs: 30000,
        temporalBound: 10,
      }),
    )
    expect(result._tag).toBe('Success')
  })

  it('refuses an unknown key, so a misspelled pin is not silently a pin on nothing', () => {
    expect(decode(valid({ temporalBund: 10 }))._tag).toBe('Failure')
    expect(decode({ ...valid(), extra: true })._tag).toBe('Failure')
  })

  it('refuses a pin no run can legally take', () => {
    expect(decode(valid({ timeoutMs: 0 }))._tag).toBe('Failure')
    expect(decode(valid({ reachabilityTimeoutMs: -1 }))._tag).toBe('Failure')
    expect(decode(valid({ solverBudgetMs: -1 }))._tag).toBe('Failure')
    expect(decode(valid({ temporalBound: MAX_TEMPORAL_BOUND + 1 }))._tag).toBe('Failure')
    expect(decode(valid({ temporalBound: 1.5 }))._tag).toBe('Failure')
    expect(decode(valid({ embedder: 'stub' }))._tag).toBe('Failure')
  })

  it('refuses another configVersion, and a config with no gate', () => {
    expect(decode({ configVersion: 2, gate: {} })._tag).toBe('Failure')
    expect(decode({ configVersion: 1 })._tag).toBe('Failure')
  })

  it('the skeleton pins every knob at its flag default, and decodes', () => {
    const skeleton = skeletonConfig({ document: 'requirements.json' })
    expect(decode(skeleton)._tag).toBe('Success')
    expect(Object.keys(skeleton.gate).sort()).toEqual([...KNOBS].sort())
    // Pinned at the defaults, a run with no flags is below no pin.
    expect(belowPinned(run(), effectivePins(skeleton.gate))).toEqual([])
  })
})

describe('RUN_KNOBS compares EFFECTIVE values, in the right direction', () => {
  it('temporalBound: 1 under a pin of 10 is weakened, 10 and 20 are not (S11 sabotage (a))', () => {
    const pins = effectivePins({ temporalBound: 10 })
    expect(belowPinned(run({ temporalBound: 1 }), pins)).toEqual(['temporalBound'])
    expect(belowPinned(run({ temporalBound: 0 }), pins)).toEqual(['temporalBound'])
    expect(belowPinned(run({ temporalBound: 10 }), pins)).toEqual([])
    expect(belowPinned(run({ temporalBound: 20 }), pins)).toEqual([])
  })

  it('reachabilityTimeoutMs: a pin of 0 inherits, so a run at 1 IS flagged (S11 sabotage (b), F10)', () => {
    // Raw, 1 > 0 would read as stronger. Effective, the pin is the inherited 2000ms and the
    // run's per-query bound is 1ms.
    const pins = effectivePins({ reachabilityTimeoutMs: 0 })
    expect(pins.reachabilityTimeoutMs).toBe(KNOB_DEFAULTS.timeoutMs)
    expect(belowPinned(run({ reachabilityTimeoutMs: 1 }), pins)).toEqual(['reachabilityTimeoutMs'])
    // A run that inherits the same bound is at the pin.
    expect(belowPinned(run({ reachabilityTimeoutMs: 0 }), pins)).toEqual([])
    // A run that inherits a LOWER --timeout-ms is below it too.
    expect(belowPinned(run({ timeoutMs: 500 }), pins)).toEqual(['reachabilityTimeoutMs'])
  })

  it('reachabilityTimeoutMs: pinning timeoutMs pins the inherited reachability bound', () => {
    const pins = effectivePins({ timeoutMs: 5000 })
    expect(pins.reachabilityTimeoutMs).toBe(5000)
    expect(belowPinned(run({ timeoutMs: 5000, reachabilityTimeoutMs: 1 }), pins)).toEqual([
      'reachabilityTimeoutMs',
    ])
    expect(belowPinned(run({ timeoutMs: 5000 }), pins)).toEqual([])
  })

  it('timeoutMs: lower is weaker', () => {
    const pins = effectivePins({ timeoutMs: 3000, reachabilityTimeoutMs: 8000 })
    expect(belowPinned(run({ timeoutMs: 2999, reachabilityTimeoutMs: 8000 }), pins)).toEqual([
      'timeoutMs',
    ])
    expect(belowPinned(run({ timeoutMs: 3001, reachabilityTimeoutMs: 8000 }), pins)).toEqual([])
  })

  it('solverBudgetMs: 0 is unbounded and strongest, otherwise higher is stronger', () => {
    const unbounded = effectivePins({ solverBudgetMs: 0 })
    expect(belowPinned(run({ solverBudgetMs: 0 }), unbounded)).toEqual([])
    expect(belowPinned(run({ solverBudgetMs: 999_999 }), unbounded)).toEqual(['solverBudgetMs'])
    const bounded = effectivePins({ solverBudgetMs: 30_000 })
    expect(belowPinned(run({ solverBudgetMs: 0 }), bounded)).toEqual([])
    expect(belowPinned(run({ solverBudgetMs: 40_000 }), bounded)).toEqual([])
    expect(belowPinned(run({ solverBudgetMs: 1_000 }), bounded)).toEqual(['solverBudgetMs'])
  })

  it('semanticThreshold: higher is weaker', () => {
    const pins = effectivePins({ semanticThreshold: 0.7 })
    expect(belowPinned(run({ semanticThreshold: 0.71 }), pins)).toEqual(['semanticThreshold'])
    expect(belowPinned(run({ semanticThreshold: 0.6 }), pins)).toEqual([])
    expect(belowPinned(run({ semanticThreshold: DEFAULT_SEMANTIC_THRESHOLD }), pins)).toEqual(
      DEFAULT_SEMANTIC_THRESHOLD > 0.7 ? ['semanticThreshold'] : [],
    )
  })

  it('semantic, strict: false is weaker than true', () => {
    const pins = effectivePins({ semantic: true, strict: true })
    expect(belowPinned(run({ semantic: false, strict: true }), pins)).toEqual(['semantic'])
    expect(belowPinned(run({ semantic: true, strict: false }), pins)).toEqual(['strict'])
    expect(belowPinned(run({ semantic: true, strict: true }), pins)).toEqual([])
    // A pin of false pins nothing: no run is below the weakest value.
    expect(belowPinned(run({ strict: false }), effectivePins({ strict: false }))).toEqual([])
  })

  it('embedder: the stub and no embedder are weaker than the model', () => {
    const pins = effectivePins({ embedder: 'model' })
    expect(belowPinned(run({ embedder: 'stub' }), pins)).toEqual(['embedder'])
    expect(belowPinned(run({ embedder: 'off' }), pins)).toEqual(['embedder'])
    expect(belowPinned(run({ embedder: 'model' }), pins)).toEqual([])
  })

  it('an unpinned knob is never below its pin', () => {
    expect(effectivePins({})).toEqual({})
    expect(belowPinned(run({ temporalBound: 0, strict: false, embedder: 'stub' }), {})).toEqual([])
  })

  it('reports below-pinned knobs in table order', () => {
    const pins = effectivePins({ strict: true, temporalBound: 10, semantic: true })
    expect(belowPinned(run({ strict: false, semantic: false }), pins)).toEqual(
      KNOBS.filter((k) => k === 'strict' || k === 'temporalBound' || k === 'semantic'),
    )
  })
})

/** Sample values per knob, spanning each knob's sentinels and both sides of them. */
const SAMPLES: { readonly [K in Knob]: readonly KnobValues[K][] } = {
  semantic: [false, true],
  embedder: ['off', 'stub', 'model'],
  semanticThreshold: [0.5, 0.62, DEFAULT_SEMANTIC_THRESHOLD, 0.8, 0.95],
  timeoutMs: [1, 2, 500, 2000, 10_000],
  reachabilityTimeoutMs: [1, 2, 500, 2000, 10_000],
  solverBudgetMs: [0, 1, 500, 30_000, 1_000_000],
  temporalBound: [0, 1, 10, 50, MAX_TEMPORAL_BOUND],
  strict: [false, true],
}

/** Check the order properties for one knob over its samples. */
const orderViolations = <K extends Knob>(knob: K): readonly string[] => {
  const row = RUN_KNOBS[knob]
  const values = SAMPLES[knob]
  const out: string[] = []
  for (const a of values) {
    if (row.weaker(a, a)) out.push(`${knob}: ${String(a)} is weaker than itself`)
    for (const b of values) {
      if (row.weaker(a, b) && row.weaker(b, a)) out.push(`${knob}: ${String(a)}/${String(b)} both`)
      for (const c of values) {
        if (row.weaker(a, b) && row.weaker(b, c) && !row.weaker(a, c)) {
          out.push(`${knob}: not transitive over ${String(a)} < ${String(b)} < ${String(c)}`)
        }
      }
    }
  }
  return out
}

describe('every knob comparator is a strict order, and strongest-of respects it', () => {
  it('the table covers exactly the knobs, and every row is an order over its samples', () => {
    expect(Object.keys(RUN_KNOBS).sort()).toEqual([...KNOBS].sort())
    expect(KNOBS.flatMap((k) => orderViolations(k))).toEqual([])
  })

  it('every sample set has at least one strictly-weaker pair, so the property is not vacuous', () => {
    for (const knob of KNOBS) {
      const row = RUN_KNOBS[knob] as unknown as {
        weaker: (a: unknown, b: unknown) => boolean
      }
      const values = SAMPLES[knob] as readonly unknown[]
      const somePair = values.some((a) => values.some((b) => row.weaker(a, b)))
      expect(somePair, knob).toBe(true)
    }
  })

  it('strongestOf is never weaker than either side, and is symmetric', () => {
    for (const knob of KNOBS) {
      const row = RUN_KNOBS[knob] as unknown as {
        weaker: (a: unknown, b: unknown) => boolean
      }
      for (const a of SAMPLES[knob] as readonly unknown[]) {
        for (const b of SAMPLES[knob] as readonly unknown[]) {
          const left = { [knob]: a } as EffectivePins
          const right = { [knob]: b } as EffectivePins
          const merged = (strongestOf(left, right) as Record<string, unknown>)[knob]
          const flipped = (strongestOf(right, left) as Record<string, unknown>)[knob]
          expect(row.weaker(merged, a), `${knob} ${String(a)} ${String(b)}`).toBe(false)
          expect(row.weaker(merged, b), `${knob} ${String(a)} ${String(b)}`).toBe(false)
          expect(row.weaker(merged, flipped) || row.weaker(flipped, merged)).toBe(false)
        }
      }
    }
  })

  it('strongestOf keeps a pin only one side has', () => {
    expect(strongestOf({ temporalBound: 10 }, {})).toEqual({ temporalBound: 10 })
    expect(strongestOf({}, { strict: true })).toEqual({ strict: true })
  })

  it('a working-tree config that LOWERS a pin cannot lower the effective one', () => {
    const baseline = effectivePins({ temporalBound: 10, reachabilityTimeoutMs: 0 })
    const lowered = effectivePins({ temporalBound: 0, reachabilityTimeoutMs: 1 })
    const effective = strongestOf(baseline, lowered)
    expect(effective.temporalBound).toBe(10)
    // The reachability pins merge on EFFECTIVE values: inherit-2000 beats 1.
    expect(effective.reachabilityTimeoutMs).toBe(2000)
    expect(belowPinned(run({ temporalBound: 1 }), effective)).toEqual(['temporalBound'])
  })
})

describe('the reachability sentinel and the published table', () => {
  it('0 inherits --timeout-ms; a positive value is its own bound', () => {
    expect(resolveReachabilityTimeoutMs(0, 2000)).toBe(2000)
    expect(resolveReachabilityTimeoutMs(0, 45)).toBe(45)
    expect(resolveReachabilityTimeoutMs(8000, 2000)).toBe(8000)
  })

  it('RUN_WEAKENING publishes one row per knob, with its control and its order', () => {
    expect(RUN_WEAKENING.map((r) => r.knob)).toEqual([...KNOBS])
    for (const row of RUN_WEAKENING) {
      expect(row.flag.length).toBeGreaterThan(0)
      expect(row.order.length).toBeGreaterThan(0)
    }
  })

  it('the pinned invocation raises every below-pinned knob to its pin in one command', () => {
    const pins = effectivePins({ temporalBound: 10, strict: true, embedder: 'model' })
    const actual = run({ embedder: 'stub' })
    const command = pinnedInvocation('doc.json', actual, pins, belowPinned(actual, pins))
    expect(command).toBe('SYMSPEC_EMBED_STUB=0 symspec check doc.json --temporal-bound 10 --strict')
  })

  it('the pinned invocation names the EFFECTIVE reachability bound, never the 0 sentinel', () => {
    const pins = effectivePins({ reachabilityTimeoutMs: 0, timeoutMs: 3000 })
    const actual = run({ timeoutMs: 3000, reachabilityTimeoutMs: 1 })
    expect(pinnedInvocation('d.json', actual, pins, belowPinned(actual, pins))).toBe(
      'symspec check d.json --reachability-timeout-ms 3000',
    )
  })
})

describe('the schema module has no hidden decoding defaults', () => {
  it('a decoded config is the authored config', () => {
    const raw = valid({ temporalBound: 10 })
    const result = decode(raw)
    expect(result._tag === 'Success' ? result.success : undefined).toEqual(raw)
  })
})
