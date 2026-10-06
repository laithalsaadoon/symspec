/**
 * THE PINNED RUN CONFIGURATION — `symspec.config.json`, and the table that says when a run is
 * below it (spec 007 AC-5-10).
 *
 * A `check` run is made of knobs: the semantic tier on or off, which embedder, the paraphrase
 * threshold, the per-solver and per-query timeouts, the whole-run budget, the temporal bound
 * and the strict gate. Every one of them can make a run find less. A committed config PINS the
 * settings the gate uses, and a run below any pin is `run-weakening`: `check` discloses it in
 * `data.run` and demotes `verified` with reason `run-weakened`, one demotion per knob.
 *
 * ## One location, no walk
 *
 * The config is `--config` or `SYMSPEC_CONFIG` when either names one. Otherwise it is
 * `<toplevel>/symspec.config.json`, where the toplevel is what `git rev-parse --show-toplevel`
 * prints in the document's real directory, or the document's own directory when git names no
 * repository there. Nothing is searched: an agent that drops a weaker config next to the
 * document does not shadow the owner's (spec 007 F11). The pinned config is authoritative in a
 * CI job on a fresh clone, where no `.git` content and no flag arrive with a push; a local run
 * that reads a config any other way says so in `data.run.config` (`path` and `source`). The
 * lookup itself is the store's (`adapters/fs/store.ts`); this module owns the file's name.
 *
 * ## The comparators read EFFECTIVE values
 *
 * Each knob has sentinels, and comparing the raw number gets them backwards (spec 007 F10):
 *
 * - `reachabilityTimeoutMs: 0` INHERITS `timeoutMs`, so 0 is not the smallest bound.
 * - `solverBudgetMs: 0` is UNBOUNDED, so 0 is the strongest budget, not the weakest.
 * - `temporalBound: 0` is OFF, so 0 is the weakest bound.
 * - `timeoutMs` cannot be 0 at all; its minimum legal value is 1.
 *
 * So every row of {@link RUN_KNOBS} maps the run settings to the value the tier actually ran
 * at, and compares those.
 *
 * ## Strongest-of
 *
 * A pin is a floor. When two configs pin one knob (the baseline's and the working tree's, once
 * `check --baseline` exists), the effective pin is the STRONGER of the two, merged on effective
 * values, so an edit to the working-tree config can raise a pin and never lower one.
 *
 * ## What is pinned and what is not
 *
 * The flags stay authoritative: a pin does not change what a run does, it only says whether the
 * run was below it. A config that pins every knob at its flag default (what `init --split`
 * writes) is therefore met by a plain `symspec check`, and raising a pin is what makes a plain
 * run weakened until its flags are raised to match.
 */

import { type Effect, Schema } from 'effect'
import { asShellArg, type ShellArg, shellWord } from '../engine/core/shell-word.ts'
import { DEFAULT_SEMANTIC_THRESHOLD } from '../engine/formal/semantic.ts'

/** Multi-line description builder. */
const lines = (...xs: readonly string[]): string => xs.join('\n')

/** The config's file name, at the one location the store reads it from. */
export const CONFIG_FILE_NAME = 'symspec.config.json'

/** The `configVersion` this build reads and writes. */
export const CONFIG_VERSION = 1 as const

/**
 * The maximum legal `--temporal-bound`. See `app/operations/check.ts` for the measurements this
 * number comes from; the short version is that k=300 hits Node's heap limit and aborts with no
 * envelope, and no knob can interrupt the encode phase that gets there.
 */
export const MAX_TEMPORAL_BOUND = 200

/**
 * Resolve the reachability tier's per-query bound.
 *
 * 0 is the INHERIT sentinel, not an "unbounded" one, and inheriting `--timeout-ms` is what
 * makes the flag a pure addition: every existing fixture passes `--reachability-timeout-ms`
 * absent, so each one keeps the output it was pinned against instead of needing a re-pin.
 *
 * Zero-is-inherit rather than a nullable field for the reason `check --fail-on-unmatched`
 * documents at length: a negative sentinel is UNREACHABLE from a shell (the CLI reads a
 * leading `-` as the next flag), and unlike that gate, 0 carries no useful meaning here —
 * a 0ms per-query timeout would time out every query before Z3 parsed the model, so
 * spending it as the sentinel costs nothing. The validator rejects negatives outright.
 */
export const resolveReachabilityTimeoutMs = (
  reachabilityTimeoutMs: number,
  timeoutMs: number,
): number => (reachabilityTimeoutMs > 0 ? reachabilityTimeoutMs : timeoutMs)

/** Which embedder the semantic tier ran on: the pinned model, the TEST stub, or none. */
export type EmbedderKind = 'model' | 'stub' | 'off'

/**
 * The value of every knob, by name. The run settings are this shape as the run was invoked,
 * and a knob's EFFECTIVE value is this shape's value type for that knob.
 */
export interface KnobValues {
  readonly semantic: boolean
  readonly embedder: EmbedderKind
  readonly semanticThreshold: number
  readonly timeoutMs: number
  readonly reachabilityTimeoutMs: number
  readonly solverBudgetMs: number
  readonly temporalBound: number
  readonly strict: boolean
}

/** A knob's name. */
export type Knob = keyof KnobValues

/** One run's settings, as invoked (the reachability bound is the RAW flag, 0 = inherit). */
export type RunSettings = KnobValues

/**
 * Every knob at its default: the value a run takes when its flag is absent (the embedder
 * defaults to the pinned model). `check`'s flag schema reads its defaults from here, so the
 * defaults a config skeleton pins cannot drift from the defaults a run uses.
 */
export const KNOB_DEFAULTS: RunSettings = {
  semantic: true,
  embedder: 'model',
  semanticThreshold: DEFAULT_SEMANTIC_THRESHOLD,
  timeoutMs: 2000,
  reachabilityTimeoutMs: 0,
  solverBudgetMs: 0,
  temporalBound: 0,
  strict: false,
}

/** The knobs, in the order `data.run.belowPinned` and the manifest list them. */
export const KNOBS: readonly Knob[] = [
  'semantic',
  'embedder',
  'semanticThreshold',
  'timeoutMs',
  'reachabilityTimeoutMs',
  'solverBudgetMs',
  'temporalBound',
  'strict',
]

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

/** A non-negative integer. */
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** A non-empty string. */
const NonEmpty = Schema.String.pipe(Schema.check(Schema.isMinLength(1)))

/** The `gate` block: one optional pin per knob. */
export const GatePins = Schema.Struct({
  semantic: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: 'Pin the semantic tier on. A run with --semantic=false is below a pin of true.',
    }),
  ),
  embedder: Schema.optionalKey(
    Schema.Literal('model').annotate({
      description: lines(
        'Pin the pinned embedding model. A run on the TEST stub (SYMSPEC_EMBED_STUB=1), or with the',
        'semantic tier off, is below it.',
      ),
    }),
  ),
  semanticThreshold: Schema.optionalKey(
    Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })).annotate({
      description: lines(
        'Pin the paraphrase cosine threshold, 0 to 1. HIGHER is weaker: a run above the pin proposes',
        'less.',
      ),
    }),
  ),
  timeoutMs: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: 'Pin the per-solver timeout in ms, at least 1. A lower run is weaker.',
    }),
  ),
  reachabilityTimeoutMs: Schema.optionalKey(
    NonNegativeInt.annotate({
      description: lines(
        'Pin the reachability per-query timeout in ms. 0 INHERITS the pinned timeoutMs (or its',
        'default), exactly as the flag does, and the comparison is on the resolved bound.',
      ),
    }),
  ),
  solverBudgetMs: Schema.optionalKey(
    NonNegativeInt.annotate({
      description: lines(
        'Pin the whole-run solver budget in ms. 0 is UNBOUNDED, the strongest value; otherwise a',
        'lower budget is weaker.',
      ),
    }),
  ),
  temporalBound: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_TEMPORAL_BOUND })).annotate({
      description: `Pin the temporal trace bound, 0 to ${MAX_TEMPORAL_BOUND}. 0 is OFF, the weakest value; a lower bound is weaker.`,
    }),
  ),
  strict: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: 'Pin the strict gate on. A run without --strict is below a pin of true.',
    }),
  ),
}).annotate({ description: 'The run settings the gate uses. A run below any pin is weakened.' })
export type GatePins = typeof GatePins.Type

/** The `files` block: where the governed document and its split anchors live. */
const ConfigFiles = Schema.Struct({
  document: Schema.optionalKey(
    NonEmpty.annotate({
      description: lines(
        'The requirements document this config governs, relative to the config`s directory. The',
        'split intent and policy belong to it; checking another document reads the pins only.',
      ),
    }),
  ),
  intent: Schema.optionalKey(
    NonEmpty.annotate({
      description: 'The split intent file, relative to the config`s directory.',
    }),
  ),
  policy: Schema.optionalKey(
    NonEmpty.annotate({
      description: 'The split policy file, relative to the config`s directory.',
    }),
  ),
})
export type ConfigFiles = typeof ConfigFiles.Type

/** `symspec.config.json`. */
export const SymspecConfig = Schema.Struct({
  configVersion: Schema.Literal(CONFIG_VERSION).annotate({
    description: 'The config-format version. Exactly 1 for this format.',
  }),
  files: Schema.optionalKey(ConfigFiles),
  gate: GatePins,
}).annotate({
  description: lines(
    'The pinned run configuration. Read from exactly one place: the git toplevel of the',
    'document, or the document`s directory outside git.',
  ),
})
export type SymspecConfig = typeof SymspecConfig.Type

/**
 * Decode a raw parsed config, refusing any key the schema does not declare. A misspelled pin
 * (`temporalBund`) would otherwise decode as a config that pins nothing, and a pin that binds
 * nothing is the silent failure this file exists to prevent.
 */
export const decodeConfig = (raw: unknown): Effect.Effect<SymspecConfig, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(SymspecConfig, { onExcessProperty: 'error' })(raw)

// ---------------------------------------------------------------------------
// The knob table
// ---------------------------------------------------------------------------

/** One knob's row. */
export interface KnobRow<K extends Knob> {
  /** The flag (or, for the embedder, the environment variable) that sets the knob. */
  readonly flag: string
  /** Which way is stronger, as published prose. */
  readonly order: string
  /** The `gate` keys whose presence pins this knob. */
  readonly pinnedBy: readonly (keyof GatePins)[]
  /** The value the tier actually ran at, from the run settings. */
  readonly effective: (settings: RunSettings) => KnobValues[K]
  /** Whether `actual` is strictly weaker than `pinned`. */
  readonly weaker: (actual: KnobValues[K], pinned: KnobValues[K]) => boolean
  /**
   * The command fragments that run at `pinned`: `ENV=value` entries and flags. Setting the
   * knob to `pinned` in a command's settings is what they do, so the effective value is the pin.
   */
  readonly raise: (pinned: KnobValues[K]) => Raise
  /** The value, for a message. */
  readonly render: (value: KnobValues[K]) => string
}

/** The embedder order: none, then the TEST stub, then the pinned model. */
const EMBEDDER_RANK: Readonly<Record<EmbedderKind, number>> = { off: 0, stub: 1, model: 2 }

/** A whole-run budget's strength: 0 is unbounded, so it outranks every bound. */
const budgetStrength = (ms: number): number => (ms === 0 ? Number.POSITIVE_INFINITY : ms)

/** One flag of a command, with its value when it takes one. */
interface Flag {
  readonly name: string
  readonly value?: string
}

/** What a knob contributes to the command that runs at its pin. */
export interface Raise {
  readonly env: readonly string[]
  readonly flags: readonly Flag[]
}

/** A raise that sets one flag. */
const flagArgs = (name: string, value?: string): Raise => ({
  env: [],
  flags: [value === undefined ? { name } : { name, value }],
})

/**
 * THE TABLE. One row per knob, exhaustive by type, each comparing the EFFECTIVE value the tier
 * ran at. Published by the manifest as `runWeakening` ({@link RUN_WEAKENING}).
 */
export const RUN_KNOBS: { readonly [K in Knob]: KnobRow<K> } = {
  semantic: {
    flag: '--semantic',
    order: 'false is weaker than true (the semantic tier did not run).',
    pinnedBy: ['semantic'],
    effective: (s) => s.semantic,
    weaker: (actual, pinned) => pinned && !actual,
    raise: () => flagArgs('--semantic'),
    render: (v) => String(v),
  },
  embedder: {
    flag: 'SYMSPEC_EMBED_STUB',
    order: 'no embedder is weaker than the TEST stub, which is weaker than the pinned model.',
    pinnedBy: ['embedder'],
    effective: (s) => s.embedder,
    weaker: (actual, pinned) => EMBEDDER_RANK[actual] < EMBEDDER_RANK[pinned],
    // The stub is selected only by exactly `SYMSPEC_EMBED_STUB=1`, so `=0` loads the model for
    // that one command. The command never turns the semantic tier off, so it needs no flag.
    raise: () => ({ env: ['SYMSPEC_EMBED_STUB=0'], flags: [] }),
    render: (v) => v,
  },
  semanticThreshold: {
    flag: '--semantic-threshold',
    order: 'higher is weaker (the paraphrase pass proposes less).',
    pinnedBy: ['semanticThreshold'],
    effective: (s) => s.semanticThreshold,
    weaker: (actual, pinned) => actual > pinned,
    raise: (pinned) => flagArgs('--semantic-threshold', String(pinned)),
    render: (v) => String(v),
  },
  timeoutMs: {
    flag: '--timeout-ms',
    order: 'lower is weaker; the minimum legal value is 1.',
    pinnedBy: ['timeoutMs'],
    effective: (s) => s.timeoutMs,
    weaker: (actual, pinned) => actual < pinned,
    raise: (pinned) => flagArgs('--timeout-ms', String(pinned)),
    render: (v) => `${v}ms`,
  },
  reachabilityTimeoutMs: {
    flag: '--reachability-timeout-ms',
    order: 'lower is weaker, compared on the resolved bound (0 inherits --timeout-ms).',
    // Pinning timeoutMs pins the bound a default (inheriting) reachability run resolves to.
    pinnedBy: ['reachabilityTimeoutMs', 'timeoutMs'],
    effective: (s) => resolveReachabilityTimeoutMs(s.reachabilityTimeoutMs, s.timeoutMs),
    weaker: (actual, pinned) => actual < pinned,
    // The resolved pin, never the 0 sentinel: a raise must not depend on the run's other flags.
    raise: (pinned) => flagArgs('--reachability-timeout-ms', String(pinned)),
    render: (v) => `${v}ms`,
  },
  solverBudgetMs: {
    flag: '--solver-budget-ms',
    order: '0 (unbounded) is strongest; otherwise lower is weaker.',
    pinnedBy: ['solverBudgetMs'],
    effective: (s) => s.solverBudgetMs,
    weaker: (actual, pinned) => budgetStrength(actual) < budgetStrength(pinned),
    raise: (pinned) => flagArgs('--solver-budget-ms', String(pinned)),
    render: (v) => (v === 0 ? '0 (unbounded)' : `${v}ms`),
  },
  temporalBound: {
    flag: '--temporal-bound',
    order: '0 (off) is weakest; otherwise lower is weaker.',
    pinnedBy: ['temporalBound'],
    effective: (s) => s.temporalBound,
    weaker: (actual, pinned) => actual < pinned,
    raise: (pinned) => flagArgs('--temporal-bound', String(pinned)),
    render: (v) => (v === 0 ? '0 (off)' : String(v)),
  },
  strict: {
    flag: '--strict',
    order: 'false is weaker than true (the strict gate did not run).',
    pinnedBy: ['strict'],
    effective: (s) => s.strict,
    weaker: (actual, pinned) => pinned && !actual,
    raise: () => flagArgs('--strict'),
    render: (v) => String(v),
  },
}

/** The knob table as the manifest publishes it: `runWeakening`. */
export const RUN_WEAKENING: readonly {
  readonly knob: Knob
  readonly flag: string
  readonly order: string
}[] = KNOBS.map((knob) => ({ knob, flag: RUN_KNOBS[knob].flag, order: RUN_KNOBS[knob].order }))

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

/** The pinned floor per knob, as EFFECTIVE values. An absent knob is unpinned. */
export type EffectivePins = { readonly [K in Knob]?: KnobValues[K] }

/** A mutable view, for building one. */
type MutablePins = { -readonly [K in Knob]?: KnobValues[K] }

/** Set one knob of a pin set, keeping the key-to-value typing. */
const setPin = <K extends Knob>(pins: MutablePins, knob: K, value: KnobValues[K]): void => {
  ;(pins as Record<K, KnobValues[K]>)[knob] = value
}

/**
 * The effective pins of one `gate` block.
 *
 * A pinned knob's floor is its effective value over the gate's pins, with every unpinned key
 * at its default. So `reachabilityTimeoutMs: 0` pins the inherited `timeoutMs` pin, or the
 * default timeout when `timeoutMs` is not pinned either.
 */
export const effectivePins = (gate: GatePins): EffectivePins => {
  const settings: RunSettings = { ...KNOB_DEFAULTS, ...gate }
  const pins: MutablePins = {}
  const pinOne = <K extends Knob>(knob: K): void => {
    const row: KnobRow<K> = RUN_KNOBS[knob]
    if (row.pinnedBy.some((key) => gate[key] !== undefined)) {
      setPin(pins, knob, row.effective(settings))
    }
  }
  for (const knob of KNOBS) pinOne(knob)
  return pins
}

/**
 * The stronger pin per knob, on effective values. A knob one side pins keeps that pin; a knob
 * both pin takes the stronger one; a tie keeps the left side's value.
 */
export const strongestOf = (a: EffectivePins, b: EffectivePins): EffectivePins => {
  const merged: MutablePins = {}
  const mergeOne = <K extends Knob>(knob: K): void => {
    const row: KnobRow<K> = RUN_KNOBS[knob]
    const left = a[knob] as KnobValues[K] | undefined
    const right = b[knob] as KnobValues[K] | undefined
    if (left === undefined && right === undefined) return
    if (left === undefined) setPin(merged, knob, right as KnobValues[K])
    else if (right === undefined) setPin(merged, knob, left)
    else setPin(merged, knob, row.weaker(left, right) ? right : left)
  }
  for (const knob of KNOBS) mergeOne(knob)
  return merged
}

/** Whether one knob of `run` is below its pin. */
const isBelow = <K extends Knob>(knob: K, run: RunSettings, pins: EffectivePins): boolean => {
  const row: KnobRow<K> = RUN_KNOBS[knob]
  const pinned = pins[knob] as KnobValues[K] | undefined
  return pinned !== undefined && row.weaker(row.effective(run), pinned)
}

/** The knobs `run` ran below their pin, in table order. */
export const belowPinned = (run: RunSettings, pins: EffectivePins): readonly Knob[] =>
  KNOBS.filter((knob) => isBelow(knob, run, pins))

/** The run's effective value and the pin, rendered, for one knob. */
const renderPair = <K extends Knob>(knob: K, run: RunSettings, pins: EffectivePins) => {
  const row: KnobRow<K> = RUN_KNOBS[knob]
  return {
    actual: row.render(row.effective(run)),
    pinned: row.render(pins[knob] as KnobValues[K]),
    order: row.order,
  }
}

/**
 * The settings a `symspec check` command with NO knob flag runs at: every flag at its default,
 * in the run's own environment. The embedder is the environment's, which the run reports when
 * its semantic tier ran; a run with the tier off does not say, so it counts as none.
 */
const commandDefaults = (run: RunSettings): RunSettings => ({
  ...KNOB_DEFAULTS,
  embedder: run.embedder,
})

/** One knob of a command's settings raised to its pin, and the fragments that raise it. */
const raiseOne = <K extends Knob>(
  knob: K,
  settings: RunSettings,
  pins: EffectivePins,
): { readonly settings: RunSettings; readonly raise?: Raise } => {
  const row: KnobRow<K> = RUN_KNOBS[knob]
  const pinned = pins[knob] as KnobValues[K] | undefined
  if (pinned === undefined || !row.weaker(row.effective(settings), pinned)) return { settings }
  return { settings: { ...settings, [knob]: pinned }, raise: row.raise(pinned) }
}

/**
 * ONE command that runs `check` at or above EVERY pin, so each `run-weakened` demotion from a
 * pin carries the same repair and running it discharges all of them.
 *
 * It is built from the pins, never from the run's flags: a command carries only what it says,
 * so a knob the run met by a flag (`--strict`) would drop below its pin if the command raised
 * only the knobs the run was below. Each pinned knob a flagless command would run below gets
 * the flag that sets it to the pin, in table order, so a raise sees the ones before it (a
 * raised `--timeout-ms` is the bound an inheriting reachability run resolves to).
 *
 * `configFlag` is the config the run named with `--config`: the command names it too, so it
 * reads the pins it was built from. A config named by the environment is read again by a
 * command run in that environment, as the embedder's is.
 *
 * `docPath` and `configFlag` arrive as shell words (`shellWord`, R60): the caller quotes a path a
 * shell would mangle, so the joined command hands each one over whole. They are marked with
 * `asShellArg` (R64), which keeps a word as it is, and every other word goes through `shellWord`.
 */
export const pinnedInvocation = (
  docPath: string,
  run: RunSettings,
  pins: EffectivePins,
  configFlag?: string,
): string => {
  const env = new Set<string>()
  // Keyed on the flag name, so no flag is repeated.
  const flags = new Map<string, Flag>()
  let settings = commandDefaults(run)
  for (const knob of KNOBS) {
    const raised = raiseOne(knob, settings, pins)
    settings = raised.settings
    for (const e of raised.raise?.env ?? []) env.add(e)
    for (const flag of raised.raise?.flags ?? [])
      if (!flags.has(flag.name)) flags.set(flag.name, flag)
  }
  const args = [...flags.values()].flatMap((f) =>
    f.value === undefined ? [f.name] : [f.name, f.value],
  )
  const word = (text: string): ShellArg => asShellArg(shellWord(text))
  const config: readonly ShellArg[] =
    configFlag !== undefined ? [word('--config'), asShellArg(configFlag)] : []
  return [
    ...[...env].map(word),
    'symspec',
    'check',
    asShellArg(docPath),
    ...config,
    ...args.map(word),
  ].join(' ')
}

/**
 * The `run-weakened` demotion action for one knob below its pin: what the run was, what the
 * pin is and where it comes from, and the command that runs at the pin.
 */
export const pinDemotionAction = (
  knob: Knob,
  run: RunSettings,
  pins: EffectivePins,
  configPath: string,
  command: string,
): string => {
  const { actual, pinned, order } = renderPair(knob, run, pins)
  return (
    `The run's ${knob} was ${actual}, below the ${pinned} pinned by ${configPath} ` +
    `(${order}) — this run cannot certify. Re-run at the pin: \`${command}\`. Waiving cannot ` +
    'discharge this: it is a statement about the run, not the document.'
  )
}

// ---------------------------------------------------------------------------
// The skeleton `init --split` writes
// ---------------------------------------------------------------------------

/**
 * The config `init --split` writes: every knob pinned at its flag default, plus the paths of
 * the governed document and its split anchors. Built from {@link KNOB_DEFAULTS}, so it cannot
 * pin a value a plain run does not meet.
 */
export const skeletonConfig = (files: ConfigFiles): SymspecConfig => ({
  configVersion: CONFIG_VERSION,
  files,
  gate: {
    semantic: KNOB_DEFAULTS.semantic,
    embedder: 'model',
    semanticThreshold: KNOB_DEFAULTS.semanticThreshold,
    timeoutMs: KNOB_DEFAULTS.timeoutMs,
    reachabilityTimeoutMs: KNOB_DEFAULTS.reachabilityTimeoutMs,
    solverBudgetMs: KNOB_DEFAULTS.solverBudgetMs,
    temporalBound: KNOB_DEFAULTS.temporalBound,
    strict: KNOB_DEFAULTS.strict,
  },
})
