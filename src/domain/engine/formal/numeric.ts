/**
 * Numeric-predicate extraction for the arithmetic conflict tier (AC-30-2).
 *
 * The SMT tier is propositional: "temperature above 40" and "temperature below
 * 30" become two opaque Boolean atoms that never conflict. This module lifts
 * numeric predicates out of EARS slot text into typed
 * `(quantity, comparator, value, unit)` tuples so the encoder (AC-30-1) can emit
 * a `cmp` node over a shared per-quantity Real variable, and Z3 can prove
 * `temp >= 40 ∧ temp < 30` UNSAT — naming the culprit requirement ids.
 *
 * ## Two things that MUST be right or numeric conflicts silently escape
 *
 *  1. **Quantity identity.** "temperature", "the temperature", "temp" must map
 *     to ONE canonical quantity key, scoped per system (mirroring AC-4-2a atom
 *     scoping — two systems' "latency" are distinct quantities). Otherwise the
 *     two predicates land on different Real variables and never meet.
 *  2. **Unit normalization.** "within 2 s" and "at most 200 ms" are about the
 *     same quantity in different units; both normalize to a canonical base
 *     (ms) before comparison, or a real conflict (2000 ms vs 200 ms) is missed.
 *
 * ## Deterministic + conservative
 *
 * Extraction is pure regex/lexicon — no model, no guessing. A slot with no
 * recognizable numeric predicate yields `[]`. This mirrors the parse ladder's
 * "return a structured nothing rather than a low-confidence guess" discipline:
 * a missed extraction is a false negative (the honest failure direction), never
 * a fabricated constraint.
 */

import { type AtomKind, normalize } from './atomize.ts'
import type { NumericComparator } from './encode.ts'

/**
 * The EARS slot a numeric predicate was read out of, in the atomizer's own
 * vocabulary ({@link AtomKind}) narrowed to the three slots this tier reads.
 *
 * A bound in a GUARD slot (`trig`/`pre`) and a bound in a RESPONSE slot are
 * different claims about the same quantity: the first is part of the antecedent
 * that decides where the requirement is live, the second is the obligation it
 * imposes there. `numeric-contradiction.ts` reports which one it compared, so an
 * author reading an unsat core can tell an obligation from a precondition without
 * re-reading the sentence.
 */
export type PredicateSlot = Extract<AtomKind, 'resp' | 'trig' | 'pre'>

/**
 * An exact rational, in the shape `z3-solver`'s `Real.val` accepts. Every value
 * this tier hands the solver is one of these, never a JavaScript `number`: a
 * unit conversion is a product, and a binary-float product is not the product.
 * `1.1 * 3_600_000` is `3960000.0000000005`, so `at least 1.1 hours` and `at most
 * 66 minutes` — one point, jointly satisfiable — became `>= 3960000.0000000005 ∧
 * <= 3960000`, and Z3 proved the conflict the float invented.
 */
export interface Rational {
  readonly numerator: bigint
  readonly denominator: bigint
}

/** A numeric predicate extracted from one slot, normalized to a base unit. */
export interface NumericPredicate {
  /** Canonical per-system quantity key, e.g. `sys__auth__qty__latency`. */
  readonly quantity: string
  /** Human quantity label (for evidence), e.g. `latency`. */
  readonly label: string
  readonly comparator: NumericComparator
  /**
   * `exact` as a JavaScript number, for the evidence block only. It is a display
   * value: the solver is handed `exact`, and nothing compares on this field.
   */
  readonly value: number
  /** The bound, normalized into `baseUnit`, exactly. This is what Z3 is given. */
  readonly exact: Rational
  /**
   * The same bound read as a DIFFERENCE on its scale — the factor applied, the offset
   * not — present only when the unit's conversion has an offset (°F, K). `at most 36 °F`
   * is `<= 20/9 °C` as an absolute temperature and `<= 20 °C` as a differential, rise,
   * or overshoot, and the sentence does not say which. `numeric-contradiction.ts` proves
   * a conflict only when BOTH readings are unsatisfiable, and discloses a pair on which
   * they disagree.
   */
  readonly difference?: Rational
  /**
   * The bound's length in CIVIL DAYS, present only for a calendar unit (`day`, `week`).
   * `exact` is then the nominal 24-hour reading, which is only right on a day with no
   * daylight-saving change: a civil day runs 23 to 25 hours. `numeric-contradiction.ts`
   * proves a conflict against a day length bounded by those two, and discloses a pair that
   * conflicts only at the nominal length.
   */
  readonly days?: Rational
  /**
   * The unit dimension the bound is on: a {@link DIMENSIONS} name (`time`,
   * `distance`, …) when the unit is recognized, {@link RAW_UNIT_DIMENSION} when a
   * unit token is present but recognized by no dimension, `''` when the number has
   * no unit at all. Two bounds are compared only when this AND `baseUnit` agree.
   */
  readonly dimension: string
  /**
   * The unit the value is expressed in: the dimension's base when the unit is
   * recognized (`ms`, `m`, `B`, …), the unit's RAW TEXT, case preserved, when it is
   * not (`months`, `times per minute`, `Mb`), and `''` when there is no unit.
   */
  readonly baseUnit: string
  /**
   * What the number measures about the quantity — see {@link BoundRole}. Part of
   * the comparison class: a deadline and a duration on one response are two
   * quantities, never one.
   */
  readonly role: BoundRole
  /** Which EARS slot the bound was read out of — guard role vs response role. */
  readonly slot: PredicateSlot
  /**
   * Present when the bound is read out of a PROHIBITION (`shall not keep the door unlocked
   * above 30 seconds`, spec 007 AC-2-6). `comparator` is then the negated comparison, and it
   * holds only IF the action happens: the requirement is `NOT (A ∧ x > 30 s)`, which is `A →
   * x <= 30 s`, not `x <= 30 s`. A bound without this flag is an obligation, and its
   * requirement asserts `A`. `numeric-contradiction.ts` encodes `A` as one occurrence literal
   * per quantity, so two prohibitions are satisfied together by never doing the action.
   */
  readonly negated?: true
  /**
   * The text that follows the bound in its slot (`when the mode is heating`, `in heating
   * mode`, `after the tank fills`, `of logs`), lowercased, whitespace-collapsed, and stripped
   * of edge punctuation; absent when only punctuation follows. It may be a condition the bound
   * holds under or the referent it counts, and this tier reads neither out of it, so it is
   * part of the comparison class: two bounds meet only under the same qualifier text, and a
   * pair split by one is disclosed rather than compared (spec 007 AC-2-6). `parse` leaves such
   * a clause inside the response, and read without it `keep the temperature above 30 °C when
   * the mode is heating` against `... below 20 °C when the mode is cooling` was a conflict
   * everywhere; `run the pump at most 2 minutes after the tank fills` is a delay from an
   * event, not a bound on how long the pump runs; `30 days of logs` and `2 hours of video`
   * bound two things. A bound that is itself inside such a clause, or after another bound in
   * the slot, carries the whole clause, itself included ({@link qualifierAt}).
   */
  readonly qualifier?: string
  /** The original slot substring the predicate came from (evidence). */
  readonly sourceText: string
}

/**
 * The role a bound's number plays (spec 007 AC-2-6), read off the word that
 * introduces it:
 *
 *   - `deadline` — `within 2 s`, `in at most 2 s`: WHEN the response happens,
 *     measured from the trigger.
 *   - `duration` — `for at least 30 s`: how LONG the response lasts.
 *   - `period` — `at least once every 5 s`: the INTERVAL between repetitions.
 *   - `''` — no role marker: a magnitude of the quantity itself (`at most 2 km`,
 *     `above 30 seconds`).
 *
 * "Sound the siren within 2 seconds" and "sound the siren for at least 30 seconds"
 * are one quantity key and two roles; read as one variable they were `<= 2 s ∧ >=
 * 30 s`, an error on a consistent document. Two DIFFERENT markers are never compared
 * with each other ({@link rolesCompatible}); an unmarked bound names no role of its
 * own and is compared with every role on its key, so `respond over 30 ms` still meets
 * `respond within 30 ms`. A pair the role keeps apart is not silently dropped: when
 * the two would conflict read as one quantity, `numeric-contradiction.ts` discloses it
 * (`FND_NUMERIC_UNCOMPARED`), because "complete the infusion within 30 minutes" and
 * "... for at least 60 minutes" is that shape too, and it is a real conflict.
 *
 * An unmarked bound followed by other text is not known to be a magnitude of the whole
 * response: `run the pump at most 2 minutes after the tank fills` is a delay from an event.
 * Its {@link NumericPredicate.qualifier} keeps it apart from every bound without that same
 * clause, so it never meets `run the pump for at least 10 minutes` on one variable, and the
 * pair is disclosed.
 *
 * A role is a TIME role: `keep the positioning error within 5 mm` is a tolerance on a
 * distance, not a deadline, and carries no role. A unit this tier does not recognize
 * (`months`) or no unit at all may still be a time, so those keep their marker.
 *
 * `within` BEFORE another comparator (`complete the infusion within at most 30
 * minutes`) stays in the quantity label, so the key already names the deadline
 * (`complete the infusion within`) and the bound carries no role on top of it. Only a
 * committed glossary alias can bring another phrasing onto that key, and an alias to
 * a label that names its own role is the author's statement that the two are one
 * quantity.
 */
export type BoundRole = 'deadline' | 'duration' | 'period' | ''

/** The {@link NumericPredicate.dimension} of a unit token no dimension recognizes. */
export const RAW_UNIT_DIMENSION = 'unrecognized'

/**
 * How one spelling converts INTO its dimension's base: `base = value × factor +
 * offset`. Both are exact rational literals (`"3600000"`, `"1/1000"`,
 * `"-160/9"`). Only temperature has an offset; its factor is positive, so an
 * affine conversion preserves every comparator's direction.
 */
export interface UnitScale {
  readonly factor: string
  readonly offset?: string
  /**
   * The unit's length in civil days, for a calendar unit whose `factor` is only its
   * nominal length (`day`: `"1"`, `week`: `"7"`). See {@link NumericPredicate.days}.
   */
  readonly days?: string
}

/**
 * A unit dimension: a base unit and every spelling that converts into it.
 *
 * `symbols` is matched CASE-SENSITIVELY, because case is the identity of a unit
 * symbol: `MB` is a megabyte and `Mb` a megabit, `mL` a millilitre and `ML` a
 * megalitre. `words` is matched case-insensitively, because `Seconds` and
 * `seconds` are one word. A spelling that is ambiguous between two readings
 * (`kb`, `mb`: kilobit or kilobyte in the wild; `g`: gram or g-force) is in
 * NEITHER table, so it keys on its raw text and meets only its own spelling.
 */
export interface Dimension {
  readonly name: string
  readonly base: string
  readonly symbols: Readonly<Record<string, UnitScale>>
  readonly words: Readonly<Record<string, UnitScale>>
}

const k = (factor: string, offset?: string): UnitScale =>
  offset === undefined ? { factor } : { factor, offset }

/** A calendar unit: `days` civil days, nominally 24 hours each. */
const civil = (days: string): UnitScale => ({
  factor: String(BigInt(days) * 86_400_000n),
  days,
})

/**
 * Known unit dimensions. Extend conservatively: a spelling that is not listed is
 * not dropped, it keys on its raw text, which only ever SPLITS a comparison.
 *
 * Deliberately absent:
 *   - `month`, `year`. A calendar month and year have no fixed length, so neither
 *     converts into milliseconds. Each keys on its own raw text, and a bound in one is
 *     disclosed against a bound in any other unit rather than compared.
 *   - `day` and `week` as FIXED lengths. A civil day is 23 or 25 hours across a DST
 *     change, so each is listed as a time with its length in civil days
 *     ({@link UnitScale.days}), and the decide tier reads it against a bounded day length
 *     rather than as 86 400 000 ms.
 *   - `m` as MINUTES. `m` is the metre, as in the R6 lint unit list
 *     (`lint/gtwr.ts` `R6_RECOGNIZED_UNITS`), so `lower the hook at least 10 m`
 *     is a distance, and never meets `within 30 seconds`.
 *   - `%`/`percent` against a bare ratio. `50%` and `0.9` are on one scale only if the
 *     author says so, so a percent is its own dimension and never converts into a bare
 *     number. `numeric-contradiction.ts` discloses such a pair rather than comparing it.
 *
 * Exported so the manifest can surface the numeric tier's recognized units (an
 * agent authoring bounds sees exactly which unit spellings normalize to a shared
 * base before comparison).
 */
export const DIMENSIONS: readonly Dimension[] = [
  {
    name: 'time',
    base: 'ms',
    symbols: {
      ns: k('1/1000000'),
      µs: k('1/1000'),
      us: k('1/1000'),
      ms: k('1'),
      s: k('1000'),
      min: k('60000'),
      h: k('3600000'),
    },
    words: {
      nanosecond: k('1/1000000'),
      nanoseconds: k('1/1000000'),
      microsecond: k('1/1000'),
      microseconds: k('1/1000'),
      millisecond: k('1'),
      milliseconds: k('1'),
      sec: k('1000'),
      secs: k('1000'),
      second: k('1000'),
      seconds: k('1000'),
      mins: k('60000'),
      minute: k('60000'),
      minutes: k('60000'),
      hr: k('3600000'),
      hrs: k('3600000'),
      hour: k('3600000'),
      hours: k('3600000'),
      day: civil('1'),
      days: civil('1'),
      week: civil('7'),
      weeks: civil('7'),
    },
  },
  {
    name: 'distance',
    base: 'm',
    symbols: { mm: k('1/1000'), cm: k('1/100'), m: k('1'), km: k('1000'), ft: k('3048/10000') },
    words: {
      millimeter: k('1/1000'),
      millimeters: k('1/1000'),
      millimetre: k('1/1000'),
      millimetres: k('1/1000'),
      centimeter: k('1/100'),
      centimeters: k('1/100'),
      centimetre: k('1/100'),
      centimetres: k('1/100'),
      meter: k('1'),
      meters: k('1'),
      metre: k('1'),
      metres: k('1'),
      kilometer: k('1000'),
      kilometers: k('1000'),
      kilometre: k('1000'),
      kilometres: k('1000'),
      inch: k('254/10000'),
      inches: k('254/10000'),
      foot: k('3048/10000'),
      feet: k('3048/10000'),
      mile: k('1609344/1000'),
      miles: k('1609344/1000'),
    },
  },
  {
    name: 'information',
    base: 'B',
    symbols: {
      B: k('1'),
      kB: k('1000'),
      KB: k('1000'),
      MB: k('1000000'),
      GB: k('1000000000'),
      TB: k('1000000000000'),
      KiB: k('1024'),
      MiB: k('1048576'),
      GiB: k('1073741824'),
      TiB: k('1099511627776'),
      kbit: k('1000/8'),
      Mbit: k('1000000/8'),
      Gbit: k('1000000000/8'),
    },
    words: {
      bit: k('1/8'),
      bits: k('1/8'),
      byte: k('1'),
      bytes: k('1'),
      kilobit: k('1000/8'),
      kilobits: k('1000/8'),
      kilobyte: k('1000'),
      kilobytes: k('1000'),
      megabit: k('1000000/8'),
      megabits: k('1000000/8'),
      megabyte: k('1000000'),
      megabytes: k('1000000'),
      gigabit: k('1000000000/8'),
      gigabits: k('1000000000/8'),
      gigabyte: k('1000000000'),
      gigabytes: k('1000000000'),
      terabyte: k('1000000000000'),
      terabytes: k('1000000000000'),
    },
  },
  {
    name: 'data-rate',
    base: 'bps',
    symbols: {
      bps: k('1'),
      kbps: k('1000'),
      Kbps: k('1000'),
      Mbps: k('1000000'),
      Gbps: k('1000000000'),
      Tbps: k('1000000000000'),
      'bit/s': k('1'),
      'kbit/s': k('1000'),
      'Mbit/s': k('1000000'),
      'Gbit/s': k('1000000000'),
      'B/s': k('8'),
      'kB/s': k('8000'),
      'KB/s': k('8000'),
      'MB/s': k('8000000'),
      'GB/s': k('8000000000'),
      kBps: k('8000'),
      KBps: k('8000'),
      MBps: k('8000000'),
      GBps: k('8000000000'),
    },
    words: {},
  },
  {
    name: 'frequency',
    base: 'Hz',
    symbols: { Hz: k('1'), kHz: k('1000'), MHz: k('1000000'), GHz: k('1000000000') },
    words: {
      hertz: k('1'),
      kilohertz: k('1000'),
      megahertz: k('1000000'),
      gigahertz: k('1000000000'),
    },
  },
  {
    name: 'temperature',
    base: '°C',
    symbols: {
      '°C': k('1'),
      '℃': k('1'),
      degC: k('1'),
      '°F': k('5/9', '-160/9'),
      '℉': k('5/9', '-160/9'),
      degF: k('5/9', '-160/9'),
    },
    words: {
      celsius: k('1'),
      centigrade: k('1'),
      'degree celsius': k('1'),
      'degrees celsius': k('1'),
      'degrees centigrade': k('1'),
      'degree c': k('1'),
      'degrees c': k('1'),
      fahrenheit: k('5/9', '-160/9'),
      'degree fahrenheit': k('5/9', '-160/9'),
      'degrees fahrenheit': k('5/9', '-160/9'),
      'degree f': k('5/9', '-160/9'),
      'degrees f': k('5/9', '-160/9'),
      kelvin: k('1', '-27315/100'),
      kelvins: k('1', '-27315/100'),
    },
  },
  {
    name: 'mass',
    base: 'g',
    symbols: { mg: k('1/1000'), kg: k('1000') },
    words: {
      milligram: k('1/1000'),
      milligrams: k('1/1000'),
      gram: k('1'),
      grams: k('1'),
      kilogram: k('1000'),
      kilograms: k('1000'),
    },
  },
  {
    name: 'percent',
    base: '%',
    symbols: { '%': k('1') },
    words: { percent: k('1'), 'per cent': k('1') },
  },
  {
    name: 'volume',
    base: 'mL',
    symbols: { mL: k('1'), ml: k('1'), L: k('1000') },
    words: {
      milliliter: k('1'),
      milliliters: k('1'),
      millilitre: k('1'),
      millilitres: k('1'),
      liter: k('1000'),
      liters: k('1000'),
      litre: k('1000'),
      litres: k('1000'),
    },
  },
]

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) [x, y] = [y, x % y]
  return x
}

/** Build a rational in lowest terms with a positive denominator. */
function rational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) throw new RangeError('numeric: zero denominator')
  const sign = denominator < 0n ? -1n : 1n
  const g = gcd(numerator, denominator) || 1n
  return { numerator: (sign * numerator) / g, denominator: (sign * denominator) / g }
}

/**
 * Parse an exact rational literal: a decimal (`"12345.67"`, `"-5"`, `"1.5e-3"`) or a
 * fraction of two integers (`"1609344/1000"`, `"-160/9"`). Throws on anything
 * else, because every caller passes a literal this module owns or a number the
 * NUMBER pattern already matched.
 */
export function parseRational(text: string): Rational {
  const frac = /^(-?\d+)\/(\d+)$/.exec(text)
  if (frac !== null) return rational(BigInt(frac[1]!), BigInt(frac[2]!))
  const dec = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (dec === null) throw new RangeError(`numeric: not a rational literal: ${text}`)
  const fraction = dec[3] ?? ''
  const digits = BigInt(`${dec[2]!}${fraction}`)
  // `m × 10^e` with `f` fraction digits is `m_digits × 10^(e − f)`, exactly.
  const shift = BigInt(dec[4] ?? '0') - BigInt(fraction.length)
  const signed = dec[1] === '-' ? -digits : digits
  return shift >= 0n ? rational(signed * 10n ** shift, 1n) : rational(signed, 10n ** -shift)
}

const mulR = (a: Rational, b: Rational): Rational =>
  rational(a.numerator * b.numerator, a.denominator * b.denominator)
const addR = (a: Rational, b: Rational): Rational =>
  rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator)

/** `r` as a JavaScript number — for the evidence block's display value only. */
function toDisplayNumber(r: Rational): number {
  return Number(r.numerator) / Number(r.denominator)
}

/** A unit spelling resolved to its dimension, or `null` when no dimension lists it. */
function resolveUnit(unit: string): { dimension: string; base: string; scale: UnitScale } | null {
  for (const dim of DIMENSIONS) {
    const scale = dim.symbols[unit]
    if (scale !== undefined) return { dimension: dim.name, base: dim.base, scale }
  }
  const lower = unit.toLowerCase()
  for (const dim of DIMENSIONS) {
    const scale = dim.words[lower]
    if (scale !== undefined) return { dimension: dim.name, base: dim.base, scale }
  }
  return null
}

/**
 * Comparator lexicon. Each phrasing maps to the comparator it asserts on the
 * quantity. "within/under/at most/no more than/below" are upper bounds; "at
 * least/over/above/no less than" are lower bounds; "exactly" is equality.
 * Longer phrases are matched first (see COMPARATOR_PATTERNS ordering).
 */
const COMPARATOR_LEXICON: ReadonlyArray<{ phrase: string; comparator: NumericComparator }> = [
  { phrase: 'no more than', comparator: '<=' },
  { phrase: 'no less than', comparator: '>=' },
  { phrase: 'at most', comparator: '<=' },
  { phrase: 'at least', comparator: '>=' },
  { phrase: 'less than or equal to', comparator: '<=' },
  { phrase: 'greater than or equal to', comparator: '>=' },
  { phrase: 'less than', comparator: '<' },
  { phrase: 'greater than', comparator: '>' },
  { phrase: 'not exceeding', comparator: '<=' },
  { phrase: 'not exceed', comparator: '<=' },
  { phrase: 'exceeding', comparator: '>' },
  { phrase: 'exceed', comparator: '>' },
  { phrase: 'within', comparator: '<=' },
  { phrase: 'under', comparator: '<' },
  { phrase: 'below', comparator: '<' },
  { phrase: 'over', comparator: '>' },
  { phrase: 'above', comparator: '>' },
  { phrase: 'exactly', comparator: '=' },
  { phrase: 'equal to', comparator: '=' },
]

/**
 * Number token. A thousands separator is read only in exact three-digit groups
 * (`1,500`, `12,345.67`), and the lookahead refuses a number that runs on into a
 * digit, a comma-digit, or a dot-digit, so `1,5` (a decimal comma), `1,50,000`, and
 * `1.2.3` match NOTHING rather than a prefix of themselves. Stripping every comma
 * read `at least 1,5 seconds` as fifteen seconds. Declining is a miss; any reading
 * of `1,5` is a guess about the author's locale.
 *
 * Scientific notation is read with its exponent (`1e3 ms` is 1000 ms, `1.5E-3 s` is 1.5
 * ms). Without it, `1e3 ms` was the number `1` in the unit `e`, and `at most 1e3 ms`
 * against `at least 5e2 ms` was `<= 1 ∧ >= 5`. An exponent of more than three digits is
 * refused whole by the same lookahead, never read as a prefix of itself.
 */
const NUMBER = String.raw`((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d{1,3})?)(?!\d|[.,]\d|[eE][+-]?\d)`

/**
 * The normalized {@link NumericPredicate.qualifier} of the text after a bound: ALL of it,
 * whatever its words, when it carries a letter or a digit.
 *
 * Not a list of condition words. Any list leaves a phrasing out, and every phrasing it left
 * out was read as unconditional: `in heating mode`, `as long as the mode is heating`,
 * `provided that`, `in case of frost`, `following the door opening`, `from the moment the
 * tank fills`, `since the alarm cleared`, and the referent of `30 days of logs` against `2
 * hours of video`. Text this tier does not read only SPLITS the bound's comparison class, the
 * prover's safe direction, and the split is disclosed (`numeric-contradiction.ts`
 * `uncomparedPairs`). `negateResponse` reads trailing text the same way, and declines.
 */
function qualifierOf(after: string): string | undefined {
  if (!/[\p{L}\p{N}]/u.test(after)) return undefined
  const clause = after
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?(]+|[\s.,;:!?)]+$/gu, '')
    .trim()
  return clause === '' ? undefined : clause
}

/**
 * A condition word in the text BEFORE a bound (`open the valve when the pressure is above 5
 * bar`): the bound is inside the response's condition, not the obligation it imposes.
 *
 * A list, unlike {@link qualifierOf}, because the text before a bound is its subject, and no
 * rule reads a condition out of a subject without one. The list only ever SPLITS: a bound it
 * matches carries its whole clause as {@link NumericPredicate.qualifier}, and a phrasing it
 * misses keeps the reading every bound had before it.
 */
const CONDITION_WORD =
  /(?:^|[\s,;(])(?:when|whenever|while|whilst|if|unless|until|after|before|once|during|upon|provided|following|since)(?![\p{L}\p{N}])/iu

/**
 * The {@link NumericPredicate.qualifier} of a bound at `[start, end)` in `text`, where
 * `firstEnd` is the end of the slot's first claimed bound, if it is another one.
 *
 *   - After another bound, the qualifier is the whole text after THAT bound, this one
 *     included. `run for at least 10 seconds when the level is above 5 meters` holds `above 5
 *     meters` inside the first bound's clause, and read on its own it was an obligation on
 *     `run for at least 10 seconds when the level`: two requirements with one obligation under
 *     two level conditions were `> 5 ∧ < 3`, an error. Whatever joins the two bounds, the tier
 *     cannot tell a condition from a second conjunct (`and keep the level below 3 meters`), so
 *     it neither asserts the later bound unconditionally nor drops it: two such bounds meet
 *     only under identical clauses, and a pair whose clauses differ is disclosed.
 *   - After a {@link CONDITION_WORD} in its subject, it is that clause from the word on, this
 *     bound included, for the same reason.
 *   - Otherwise, the text after the bound's unit ({@link qualifierOf}).
 */
function qualifierAt(
  text: string,
  start: number,
  end: number,
  firstEnd: number | undefined,
): string | undefined {
  if (firstEnd !== undefined && firstEnd <= start) return qualifierOf(text.slice(firstEnd))
  const condition = CONDITION_WORD.exec(text.slice(0, start))
  if (condition !== null) return qualifierOf(text.slice(condition.index))
  return qualifierOf(text.slice(end))
}

/** A tolerance after the number (`200 ± 5`): the bound is a range, not the point. */
const TOLERANCE = /^\s*(?:±|\+\/-|\+-)/

/**
 * Words that can follow a number without being its unit (`at most 3 and …`, `at
 * least 2 of the replicas`). One of these after the number means "no unit", the
 * same reading every unknown word had before units keyed on their raw text.
 */
const NOT_A_UNIT: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'before',
  'but',
  'by',
  'during',
  'for',
  'from',
  'if',
  'in',
  'into',
  'of',
  'on',
  'or',
  'so',
  'than',
  'the',
  'to',
  'unless',
  'until',
  'when',
  'while',
  'with',
])

/**
 * The unit phrase right after a number: a spelled-out temperature scale
 * (`degrees celsius`), a degree symbol (`°C`, `℃`), a percent sign, or one unit token with an
 * optional `/denominator` (`km/h`, `MB/s`) or `per <word>` suffix. The suffix is
 * part of the RAW text on purpose: `100 times per minute` and `5 times per second`
 * are two rates, and dropping the suffix made them one count.
 */
const UNIT_PHRASE =
  /^\s*(degrees?\s+(?:celsius|centigrade|fahrenheit|c|f)(?!\p{L})|°\s?[CF](?!\p{L})|[℃℉]|%|[\p{L}µ]+(?:\/\p{L}+)?)(\s+per\s+\p{L}+)?/iu

/**
 * Read the unit after a number. Returns the raw spelling (whitespace collapsed,
 * case preserved) and how many characters it spans; `raw: ''` when there is no
 * unit.
 */
function readUnit(rest: string): { raw: string; length: number } {
  const m = UNIT_PHRASE.exec(rest)
  if (m === null) return { raw: '', length: 0 }
  const token = m[1]!.replace(/\s+/g, m[1]!.startsWith('°') ? '' : ' ')
  const lowered = token.toLowerCase()
  if (lowered === 'per') {
    // `at most 100 per second`: the rate's denominator IS the unit text.
    const next = /^\s*per\s+(\p{L}+)/iu.exec(rest)
    return next === null
      ? { raw: '', length: 0 }
      : { raw: `per ${next[1]!}`, length: next[0].length }
  }
  if (NOT_A_UNIT.has(lowered)) return { raw: '', length: 0 }
  const suffix = m[2] === undefined ? '' : ` per ${m[2].trim().split(/\s+/)[1]!}`
  return { raw: `${token}${suffix}`, length: m[0].length }
}

/**
 * Normalize a number and its raw unit into the bound's dimension, base unit, and
 * exact value. An unrecognized unit is not dropped: it keys on its own raw text, so
 * `9 months` meets `3 months` and never `1 year`. Keyed on `''`, every unknown unit
 * was the unitless bound, and `at least 90 days` against `at most 1 year` was
 * `>= 90 ∧ <= 1`.
 */
function normalizeBound(
  numberText: string,
  rawUnit: string,
): {
  exact: Rational
  difference?: Rational
  days?: Rational
  dimension: string
  baseUnit: string
} {
  const magnitude = parseRational(numberText.replace(/,/g, ''))
  if (rawUnit === '') return { exact: magnitude, dimension: '', baseUnit: '' }
  const resolved = resolveUnit(rawUnit)
  if (resolved === null) {
    return { exact: magnitude, dimension: RAW_UNIT_DIMENSION, baseUnit: rawUnit }
  }
  const scaled = mulR(magnitude, parseRational(resolved.scale.factor))
  if (resolved.scale.days !== undefined) {
    return {
      exact: scaled,
      days: mulR(magnitude, parseRational(resolved.scale.days)),
      dimension: resolved.dimension,
      baseUnit: resolved.base,
    }
  }
  if (resolved.scale.offset === undefined) {
    return { exact: scaled, dimension: resolved.dimension, baseUnit: resolved.base }
  }
  return {
    exact: addR(scaled, parseRational(resolved.scale.offset)),
    difference: scaled,
    dimension: resolved.dimension,
    baseUnit: resolved.base,
  }
}

/**
 * The unit class of a bound: two bounds on one quantity are arithmetic about the same
 * scale only when they share a dimension and a unit (AC-2-5). The ROLE is not part of
 * it: roles are settled inside a cell ({@link rolesCompatible}), so the decide tier
 * can compare an unmarked bound with a marked one and DISCLOSE two marked bounds it
 * kept apart. Exported so the decide tier (`numeric-contradiction.ts`) and the propose
 * tier (`quantity-alias.ts`) partition on one definition.
 */
export function unitClassOf(pred: NumericPredicate): string {
  return JSON.stringify([pred.dimension, pred.baseUnit])
}

/**
 * Whether two bounds' roles let the decide tier assert them on ONE variable: the same
 * role, or either one unmarked. A deadline and a duration are two quantities (AC-2-6).
 */
export function rolesCompatible(a: BoundRole, b: BoundRole): boolean {
  return a === b || a === '' || b === ''
}

/**
 * Two comparators are directionally OPPOSED — the only shape that can be jointly
 * unsatisfiable once the two bounds share a variable. An equality opposes anything but
 * the same equality, and an upper bound opposes a lower one. Two same-direction bounds
 * only tighten. Shared by the disclosers (`quantity-alias.ts`, and the uncompared-unit
 * pairs in `numeric-contradiction.ts`), which pair without a solver.
 */
export function opposedComparators(a: NumericComparator, b: NumericComparator): boolean {
  const upper = (c: NumericComparator) => c === '<' || c === '<='
  const lower = (c: NumericComparator) => c === '>' || c === '>='
  if (a === '=' || b === '=') return a !== b
  return (upper(a) && lower(b)) || (lower(a) && upper(b))
}

/**
 * Normalize a quantity label into a canonical, per-system atom-style key.
 *
 * #3 (same-quantity-two-ways): before keying, the label is optionally routed
 * through a quantity-alias map — the committed synonym glossary, keyed by the
 * label's normalized form. This is what lets two responses that constrain the
 * SAME physical quantity through different phrasings ("token lifetime" via "keep
 * valid for" vs "expire after") land on ONE quantity key so the existing LIA/LRA
 * solver sees them together. Reuses the propose/decide discipline: the glossary
 * is the agent-confirmed, committed artifact; nothing fuzzy touches the key. A
 * no-op when no alias map is supplied or the label is not an alias, so the
 * default numeric path is byte-identical to before.
 *
 * SOUNDNESS: the key deliberately does NOT include the unit. A quantity key
 * names the *thing* bounded ("respond"), while `dimension`/`baseUnit` name the
 * scale its value was normalized onto; the two are separate facts and the key must
 * keep naming only the first. Comparability is a property of a PAIR of predicates,
 * so the unit belongs in the comparison partition, not the identity: see
 * {@link unitClassOf}, which `numeric-contradiction.ts` (`comparisonKey`) groups on
 * so a unitless bound, a `months` bound, and an `ms` bound are never compared with
 * one another — and which `quantity-alias.ts` requires to agree before it pairs.
 * Folding the unit in here would also rename the `quantity` in every emitted
 * `evidence.numeric` block and every SMT-LIB2 Real const, changing observable
 * output for genuine same-unit conflicts that were always correct.
 */
function quantityKey(
  systemName: string,
  label: string,
  quantityAliases?: ReadonlyMap<string, string>,
): string {
  const sys = systemName.trim().toLowerCase().replace(/\s+/g, '_')
  // Canonicalize the label through the alias map first (keyed on the same
  // `normalize` form the glossary index uses), then fall through to the
  // existing atom-style normalization so a non-aliased label keys exactly as
  // before.
  const canonicalLabel = quantityAliases?.get(normalize(label)) ?? label
  const q = canonicalLabel
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  return `sys__${sys}__qty__${q}`
}

/**
 * Candidate quantity label: the noun-ish phrase that owns the numeric bound —
 * EVERY word before the comparator phrase (e.g. "the primary shard replication
 * lag at most 10 ms" → "primary shard replication lag"), less trailing filler and
 * one leading stopword.
 *
 * SOUNDNESS: this label is a DECIDE key. `quantityKey` turns it into the Real
 * variable two bounds must share before Z3 is asked to refute them, so two slots
 * whose labels collide are asserted to bound ONE physical thing at `error`
 * severity. Truncating the phrase to a trailing window MERGES subjects the
 * document keeps apart — "the primary shard replication lag" and "the analytics
 * shard replication lag" both end in "shard replication lag" — and a merged
 * subject co-asserts bounds no requirement placed on one quantity, which is a
 * fabricated FND_NUMERIC_CONTRADICTION. Keeping the whole phrase can only SPLIT a
 * key, and a split can only drop a proof: the honest failure direction, and the
 * one `quantity-alias.ts` proposes an author-confirmed merge for.
 *
 * That split-only property is a claim about the BARE key, and it does not extend
 * to `quantityKey` as a whole. `quantityKey` looks the committed glossary up on
 * `normalize(label)` — this same string — so the label's width also decides WHICH
 * alias entries hit, and a hit REPLACES the label with a canonical. Widening the
 * label therefore re-partitions alias hits in BOTH directions: a committed entry
 * whose alias is a whole verb phrase starts matching (two labels collapse onto one
 * canonical — a MERGE, at `error` severity, authorized by the author who committed
 * it), and an entry whose alias is a bare noun tail stops matching (the entry goes
 * inert and its proof disappears). Neither direction is a fabrication — a
 * committed glossary entry is the author asserting the two phrases name one thing
 * — but the monotonicity argument above cannot be used to wave a label-width
 * change through while a glossary is in play. Both directions are pinned as
 * observed behavior in `app/operations/check.test.ts`.
 */
function labelBefore(text: string, comparatorStart: number): string | null {
  const before = text.slice(0, comparatorStart).trim()
  if (before === '') return null
  // A word is any run carrying a letter or a digit in ANY script (AC-2-6). Keeping
  // only Latin letters dropped `1` from `hold zone 1 temperature` and `温度` from
  // `keep the 温度 reading`, so two zones' temperatures, or temperature and
  // humidity, were one quantity key and their bounds one conflict.
  let words = before.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (words.length === 0) return null
  // Strip TRAILING prepositions/fillers so "respond in", "respond in no" and
  // "respond" all normalize to the same quantity — otherwise a unit/phrasing
  // variant splits one quantity into several and a real conflict escapes.
  const TRAILING_FILLER = new Set([
    'in',
    'of',
    'to',
    'for',
    'by',
    'at',
    'a',
    'an',
    'the',
    'no',
    'with',
    'be',
    'is',
    'are',
  ])
  // SOUNDNESS: we deliberately do NOT strip trailing comparator words (within/
  // under/over/above/below/exceeding) from the quantity KEY. There is no
  // syntactic way to tell a LEAKED compound-bound word ("complete the infusion
  // WITHIN at most 30 min") from a phrasal-verb noun tail ("the carry OVER at
  // least 100 mb", "the roll OVER", "the turn OVER") — both are
  // [word][comparator][number]. Stripping unconditionally collapsed "carry over"
  // and "carry" onto ONE key and fabricated a false FND_NUMERIC_CONTRADICTION
  // (the cardinal sin: a false positive in the decide tier). So the key stays
  // conservative; the SAME-QUANTITY-TWO-VERBS case (reproducer a) is instead
  // surfaced by the PROPOSE-ONLY quantity-alias detector (quantity-alias.ts),
  // where lenient object-matching is sound because it can only DEMOTE and
  // suggest a glossary alias — never assert a contradiction.
  while (words.length > 1 && TRAILING_FILLER.has(words[words.length - 1]!.toLowerCase())) {
    words = words.slice(0, -1)
  }
  const phrase = words.join(' ')
  // Strip leading verb-ish stopwords so "shall respond with latency" → "latency".
  return phrase.replace(/^(?:shall|be|is|are|the|a|an|with|of|to|have|has)\s+/i, '').trim() || null
}

/** The comparator of `NOT (x <c> v)`: exact, because the comparison is atomic. */
const NEGATE: Readonly<Record<NumericComparator, NumericComparator>> = {
  '<': '>=',
  '<=': '>',
  '=': '!=',
  '!=': '=',
  '>=': '<',
  '>': '<=',
}

/**
 * The comparator after swapping which side is bounded: a bound on how OFTEN
 * becomes the reverse bound on the INTERVAL. `at least once every 5 s` is
 * "interval <= 5 s"; `at most once every 1 s` is "interval >= 1 s".
 */
const FLIP: Readonly<Record<NumericComparator, NumericComparator>> = {
  '<': '>',
  '<=': '>=',
  '=': '=',
  '!=': '!=',
  '>=': '<=',
  '>': '<',
}

/** Comparators that bound a COUNT, so `<phrase> once every N` is a frequency bound. */
const COUNT_PHRASES: ReadonlySet<string> = new Set([
  'no more than',
  'no less than',
  'at most',
  'at least',
  'less than or equal to',
  'greater than or equal to',
  'less than',
  'greater than',
  'exactly',
])

/**
 * Filler between the comparator and the number that changes what the number
 * means — a count (`at least once in 5 s`), a multiplier (`at most half 10 MB`),
 * a sign (`below minus 5`), a partitive (`at least one of 3`) — so the bound is
 * declined rather than read as `<comparator> <number>`.
 */
const MEANING_CHANGING_FILLER: ReadonlySet<string> = new Set([
  'once',
  'twice',
  'thrice',
  'times',
  'per',
  'each',
  'every',
  'minus',
  'negative',
  'half',
  'double',
  'triple',
  'quarter',
  'third',
  'not',
  'no',
  'than',
  'or',
  'and',
  'to',
  'of',
  'in',
])

/**
 * The role a bound plays ({@link BoundRole}), read off the word before the
 * comparator (`prev`) and the filler between the comparator and the number
 * (`mid`). `invert` means the comparator bounds a frequency and must be flipped to
 * bound the interval. `null` means the bound is declined.
 *
 * `dimension` is the bound's unit dimension: a deadline and a duration are time
 * roles, so a bound on a recognized non-time dimension (`within 5 mm`) is a magnitude.
 */
function roleOf(
  phrase: string,
  prev: string | undefined,
  mid: readonly string[],
  dimension: string,
): { role: BoundRole; invert: boolean } | null {
  if (mid.includes('every')) {
    const shape = mid.join(' ')
    if ((shape === 'every' || shape === 'once every') && COUNT_PHRASES.has(phrase)) {
      return { role: 'period', invert: true }
    }
    return null
  }
  if (mid.some((w) => MEANING_CHANGING_FILLER.has(w))) return null
  // `within` before another comparator is the last word of the LABEL, so the key
  // already names the deadline; see {@link BoundRole}.
  if (prev === 'within') return { role: '', invert: false }
  const timeLike = dimension === 'time' || dimension === RAW_UNIT_DIMENSION || dimension === ''
  if (!timeLike) return { role: '', invert: false }
  if (phrase === 'within' || prev === 'in') return { role: 'deadline', invert: false }
  if (prev === 'for') return { role: 'duration', invert: false }
  if (prev === 'every') return { role: 'period', invert: false }
  return { role: '', invert: false }
}

/** The whitespace-delimited word ending at `end`, lowercased, with where it starts. */
function precedingWord(text: string, end: number): { word: string; start: number } | null {
  const m = /(\S+)\s*$/u.exec(text.slice(0, end))
  if (m === null) return null
  return { word: m[1]!.toLowerCase(), start: m.index }
}

/**
 * Read a negated response (`shall not …`) through its negation (AC-2-6):
 * `shall not keep the door unlocked above 30 seconds` bounds the door at `<= 30 s`.
 * Ignoring the flag asserted `> 30 s`, the opposite obligation, and proved it
 * against `below 10 seconds` at error severity.
 *
 * The negated comparison holds only where the action happens, so the predicate carries
 * {@link NumericPredicate.negated}: `NOT (A ∧ x > 30 s)` is `A → x <= 30 s`, and two
 * prohibitions on one action are jointly satisfied by never doing it.
 *
 * The negation is exact only for ONE atomic comparison. `NOT (A ∧ B)` is `¬A ∨ ¬B`,
 * not `¬A ∧ ¬B`, and a response that says anything besides its bound (a second
 * bound, a declined one, a trailing qualifier) is some `NOT (A ∧ C)` whose `C` this
 * tier cannot see; asserting `¬A` alone is STRONGER than the requirement. So a
 * negated response is read only when its one bound is the whole remainder of the
 * slot, and declined — a miss, the honest direction — otherwise.
 */
function negateResponse(
  text: string,
  preds: readonly NumericPredicate[],
  declined: number,
  claimed: ReadonlyArray<readonly [number, number]>,
): NumericPredicate[] {
  const [only] = preds
  // Exactly one comparator phrase claimed a number, and it became the one predicate.
  if (claimed.length !== 1 || preds.length !== 1 || only === undefined) return []
  // No other phrase that looked like a bound (`above the alarm threshold`, a
  // toleranced value, a count) was declined: it is a conjunct this tier cannot see.
  if (declined > 0) return []
  // Nothing follows the bound: `below 30 seconds during a fire drill` is
  // `NOT (x < 30 s ∧ drill)`, and `x >= 30 s` alone forbids what the drill clause
  // permits.
  if (/[\p{L}\p{N}]/u.test(text.slice(claimed[0]![1]))) return []
  return [
    {
      ...only,
      comparator: NEGATE[only.comparator],
      negated: true,
      sourceText: `not ${only.sourceText}`,
    },
  ]
}

/**
 * Extract every numeric predicate in one slot text, scoped to `systemName` and
 * stamped with the slot it came from. Returns `[]` when no numeric predicate is
 * present. Deterministic.
 *
 * `slot` is required rather than defaulted: the caller is the only party that
 * knows which EARS slot it handed over, and a default would let a guard-sourced
 * bound arrive labelled as a response — a claim about the document that the
 * evidence block then prints.
 *
 * `quantityAliases` (#3): an optional NORMALIZED label → canonical-label map
 * (built from the committed glossary, same shape as the atom glossary index) so
 * two phrasings of one physical quantity collapse to a single quantity key and
 * the arithmetic solver compares them. Omitted ⇒ unchanged behavior.
 *
 * `negated` (spec 007 AC-2-6): the requirement's modal negation (`shall not`,
 * `shall never`), which governs the whole response. Only a response can carry it,
 * so passing it for a guard slot throws. A negated response yields the NEGATION of
 * its single bound, or nothing — see {@link negateResponse}.
 */
export function extractNumericPredicates(
  text: string,
  systemName: string,
  slot: PredicateSlot,
  quantityAliases?: ReadonlyMap<string, string>,
  negated = false,
): NumericPredicate[] {
  if (negated && slot !== 'resp') {
    throw new RangeError('numeric: only a response is negated by its modal')
  }
  // Each bound with the span it was read from, so its qualifier can be settled once every
  // bound in the slot is claimed (`qualifierAt`).
  const out: Array<{ pred: Omit<NumericPredicate, 'qualifier'>; start: number; end: number }> = []
  const lower = text.toLowerCase()
  // Comparator phrases that introduced a bound this function then declined to read.
  // A negated response is read only when it carries exactly one bound and nothing
  // else that looked like one (see `negateResponse`).
  let declined = 0
  // Character ranges already consumed by a matched comparator phrase, so a
  // SHORTER phrase ("less than") can't re-match inside a longer one already
  // claimed ("no less than"). COMPARATOR_LEXICON lists longer phrases first.
  const claimed: Array<[number, number]> = []
  const overlaps = (start: number, end: number): boolean =>
    claimed.some(([s, e]) => start < e && s < end)

  for (const { phrase, comparator } of COMPARATOR_LEXICON) {
    let searchFrom = 0
    // Find each occurrence of this comparator phrase followed by a number.
    for (;;) {
      const idx = lower.indexOf(phrase, searchFrom)
      if (idx === -1) break
      searchFrom = idx + phrase.length
      // A phrase inside a longer word is not the phrase: `over` in `handover 5 s`,
      // `under` in `understand`.
      const next = lower[idx + phrase.length]
      if (idx > 0 && /[\p{L}\p{N}]/u.test(lower[idx - 1]!)) continue
      if (next !== undefined && /[\p{L}\p{N}]/u.test(next)) continue
      if (overlaps(idx, idx + phrase.length)) continue

      // Match "<phrase> <number>" allowing filler words between; the unit is read
      // separately, after the number, so it can be more than one letter run.
      const after = text.slice(idx + phrase.length)
      const m = new RegExp(String.raw`^\s+(?:[a-zA-Z]+\s+){0,2}${NUMBER}`).exec(after)
      if (m === null) {
        declined += 1
        continue
      }
      const rest = after.slice(m[0].length)
      const unit = readUnit(rest)
      const end = idx + phrase.length + m[0].length + unit.length
      // Overlap must be checked over the FULL match range, not just the phrase:
      // in a compound bound like "within at most 30 minutes", the outer phrase
      // ("within") sits BEFORE the inner one ("at most") — its phrase span does
      // not overlap, but the filler-word allowance lets it re-claim the SAME
      // "30 minutes" the inner comparator already claimed. Without this, one
      // bound yields two predicates on two bogus quantity keys and a real
      // conflict escapes. COMPARATOR_LEXICON lists the tighter phrases first, so
      // the inner comparator claims the number and the outer preposition is
      // correctly dropped here (and stripped from the label as trailing filler).
      if (overlaps(idx, end)) continue
      claimed.push([idx, end])

      // `200 ± 5` (or `200 °C ± 5 °C`) is a range; reading it as the point `= 200`
      // asserts a bound the requirement does not place. Decline it.
      if (TOLERANCE.test(rest.slice(unit.length))) {
        declined += 1
        continue
      }

      // A `not` right before the comparator negates the one comparison it governs:
      // `keep the door unlocked not below 30 seconds` is `>= 30 s`. It is not part of
      // the subject, and the role marker, if any, is the word before it.
      let cmpr = comparator
      let labelEnd = idx
      let prev = precedingWord(text, idx)
      if (prev?.word === 'not') {
        cmpr = NEGATE[cmpr]
        labelEnd = prev.start
        prev = precedingWord(text, prev.start)
      }
      const midWords = m[0]
        .slice(0, m[0].length - m[1]!.length)
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w !== '')
      const bound = normalizeBound(m[1]!, unit.raw)
      const reading = roleOf(phrase, prev?.word, midWords, bound.dimension)
      if (reading === null) {
        declined += 1
        continue
      }
      if (reading.invert) cmpr = FLIP[cmpr]

      const label = labelBefore(text, labelEnd)
      if (label === null) {
        declined += 1
        continue
      }

      const { exact, difference, days, dimension, baseUnit } = bound

      out.push({
        pred: {
          quantity: quantityKey(systemName, label, quantityAliases),
          label,
          comparator: cmpr,
          value: toDisplayNumber(exact),
          exact,
          ...(difference !== undefined ? { difference } : {}),
          ...(days !== undefined ? { days } : {}),
          dimension,
          baseUnit,
          role: reading.role,
          slot,
          sourceText: text.slice(labelEnd, end).trim(),
        },
        start: idx,
        end,
      })
    }
  }

  // The first bound the slot claimed, declined ones included: a bound after a toleranced
  // `30 ± 5 ms` is in that bound's clause as much as one after a read bound is.
  const first = claimed.reduce<readonly [number, number] | undefined>(
    (min, span) => (min === undefined || span[0] < min[0] ? span : min),
    undefined,
  )
  const preds = dedupe(
    out.map(({ pred, start, end }) => {
      const qualifier = qualifierAt(text, start, end, first?.[0] === start ? undefined : first?.[1])
      return qualifier === undefined ? pred : { ...pred, qualifier }
    }),
  )
  if (!negated) return preds
  return negateResponse(text, preds, declined, claimed)
}

/**
 * Drop exact-duplicate predicates.
 *
 * The key names every field of the record that carries a claim — slot, quantity,
 * comparator, exact value, difference reading, civil days, dimension, base unit, role,
 * negation, qualifier — so two
 * predicates that differ anywhere both survive. `sourceText` is excluded deliberately: it
 * is the audit substring, and two spellings of one bound in one slot are one claim.
 *
 * The `slot` component cannot change the outcome for any caller
 * {@link extractNumericPredicates} has, because each call carries one slot and so
 * every predicate it produces shares it. It is in the key because the key is the
 * record's identity, and a key over a proper subset of the fields is a merge
 * waiting for the first caller that folds two slots together.
 */
function dedupe(preds: NumericPredicate[]): NumericPredicate[] {
  const seen = new Set<string>()
  const out: NumericPredicate[] = []
  for (const p of preds) {
    const key = JSON.stringify([
      p.slot,
      p.quantity,
      p.comparator,
      `${p.exact.numerator}/${p.exact.denominator}`,
      p.difference === undefined ? '' : `${p.difference.numerator}/${p.difference.denominator}`,
      p.days === undefined ? '' : `${p.days.numerator}/${p.days.denominator}`,
      p.dimension,
      p.baseUnit,
      p.role,
      p.negated === true,
      p.qualifier ?? '',
    ])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}
