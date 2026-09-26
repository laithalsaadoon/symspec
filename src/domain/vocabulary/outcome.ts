/**
 * THE OUTCOME OF A PROJECTION — what the engine reads, before and after, by its own readers.
 *
 * The validator does not predict what a rewrite might break. It builds the projected document,
 * reads it AND the original with the engine's own extractors — `encode` for atoms, polarity and
 * oppositions, `requirementBounds` for bounds and their quantity keys, `responseOccurrences` for
 * what a response performs, `extractGuardImplications` for the bridges, `quantityKey` for a
 * declared quantity phrase — and compares the two readings. There is no second key function
 * here to drift from the engine's: every key compared is one the engine computed.
 *
 * ## What "the same verdicts, less what the author merged" means
 *
 * A use is one place the engine reads a key: a slot's atom, a requirement's system scope (which
 * every per-system tier pairs on, so a system split that shares no atom still shows), a bound's
 * quantity. Three partitions of the uses are compared:
 *
 * - O, by the key the engine reads on the ORIGINAL document;
 * - D, by the class the vocabulary DECLARES the use's phrase to be in (its system's class and its
 *   symbol's class, slot by slot); a use whose phrase resolves to nothing is classed by its O key,
 *   in a namespace no declared class shares, since the vocabulary says nothing about it and the
 *   projection leaves it as written;
 * - P, by the key the engine reads on the PROJECTED document.
 *
 * The projection is admitted only when P EQUALS D (decision D10): every two uses the author
 * declared one read one key, and no two uses the author kept apart do. Never "P equals the join
 * of O and D": the engine already reads some uses as one that the vocabulary keeps apart by
 * design (an optional-feature precondition and a state precondition of one spelling are one
 * `guard` atom and two symbols), and a join lets a declared alias carry a third use across that
 * edge onto a requirement nobody merged it with.
 *
 * So O must agree with D before any projection is measured: two uses on one O key in two D
 * classes are a HYGIENE refusal of the document as written (V-KIND), naming the phrase, both
 * requirements and both symbols. No rewrite could repair it without splitting an atom the engine
 * reads today, and the implicit bootstrap, whose projection is the identity, reports the same
 * refusal. Where the resolver guarantees D is coarser than or equal to O, which it does for every
 * same-domain pair, the hygiene check never fires.
 *
 * With P equal to D, every key of P names one class, and the rest of the reading is compared per
 * class:
 *
 * - each slot keeps its polarity, and each bound every field but its key (comparator, value,
 *   unit, role, negation, qualifier, clause);
 * - the contrary pairs of P are exactly the contrary pairs of O, mapped onto classes: none lost,
 *   none added, and no class holds two contraries;
 * - the occurrences a response hands the numeric tier on a key some bound is on are the same
 *   records on the same classes;
 * - the guard implications are the same implications, their atoms mapped onto classes;
 * - every tier that reads a slot's WORDS beyond its atom (lint, the propose and disclosure tiers,
 *   the texts the embedder reads) reads the same thing, less what the declaration implies, and
 *   the check honours the same waivers (`readers.ts`, invariant V-READ).
 *
 * Any difference is a refusal that names the phrases involved.
 */

import {
  type Atomize,
  areContrary,
  glossaryIndex,
  makeAtomize,
  normalizeScope,
  type Opposition,
  termIndex,
} from '../engine/formal/atomize.ts'
import { encode, toEncodable } from '../engine/formal/encode.ts'
import { extractGuardImplications } from '../engine/formal/guard-implication.ts'
import {
  type NumericPredicate,
  quantityKey,
  requirementBounds,
  responseOccurrences,
} from '../engine/formal/numeric.ts'
import type { Requirement } from '../requirements/document.ts'
import { viewOf } from './keys.ts'
import { compareText, readText, type TextReading, type TextTables } from './readers.ts'

/** The slot a probe reads: the one its phrase sits in, as the encoder names it. */
export type ProbeSlot = 'resp' | 'trig' | 'pre'

/**
 * One reading unit: a document requirement, read whole, or a PROBE (a declared phrase set in a
 * synthetic requirement), read only in its own slot.
 */
export interface Unit {
  readonly id: string
  readonly requirement: Requirement
  readonly slot?: ProbeSlot
}

/** A declared quantity phrase, read as the key a bound on it would carry. */
export interface LabelUnit {
  readonly id: string
  readonly system: string
  readonly label: string
}

interface AtomUse {
  readonly atom: string
  readonly negated: boolean
  readonly opposition?: Opposition
  readonly text: string
}

interface BoundUse {
  readonly key: string
  /** Every field of the bound but its key, as one comparable string; `''` for a label probe. */
  readonly claim: string
  readonly label: string
  readonly text: string
}

/** What the engine reads in a set of units. */
export interface Reading {
  /**
   * Keyed `<unit>\0<kind>`: `resp`, `trig`, `pre`, `entry` (a glossary entry's link atom), or
   * `sys`, the system's atom scope, which every per-system tier pairs on.
   */
  readonly atoms: ReadonlyMap<string, AtomUse>
  /** Keyed `<unit>\0<index>` for a bound, `<unit>` for a label probe. */
  readonly bounds: ReadonlyMap<string, BoundUse>
  /** Per unit, the number of bounds it reads. */
  readonly boundCount: ReadonlyMap<string, number>
  /** Per unit, every occurrence as `[quantity key, qualifier]`. */
  readonly occurrences: ReadonlyMap<string, readonly (readonly [string, string])[]>
  readonly bridges: readonly { readonly id: string; readonly formula: unknown }[]
  /** What the text readers read on the document's requirements (`readers.ts`). */
  readonly text: TextReading
}

const SEP = '\u0000'

/**
 * Every field of a bound but the ones a rewrite may change without changing the claim: its key
 * (`quantity`, compared as a partition), its subject's words (`label`), its audit text
 * (`sourceText`) and the display copy of its value (`value`, which `exact` carries exactly). Read
 * off the predicate generically, so a field the numeric tier adds is compared without an edit.
 */
const claimOf = (p: NumericPredicate): string => {
  const { quantity: _key, label: _words, sourceText: _audit, value: _display, ...claim } = p
  const fields = Object.entries(claim).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(fields, (_, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v))
}

/** Read a set of units the way `check` reads a document, under one set of tables. */
export const readOutcome = (
  units: readonly Unit[],
  labels: readonly LabelUnit[],
  tables: TextTables,
): Reading => {
  const glossary = glossaryIndex(tables.glossary)
  const atomize: Atomize = makeAtomize(glossary, tables.antonyms, termIndex(tables.terms))
  const atoms = new Map<string, AtomUse>()
  const bounds = new Map<string, BoundUse>()
  const boundCount = new Map<string, number>()
  const occurrences = new Map<string, (readonly [string, string])[]>()
  const whole: ReturnType<typeof toEncodable>[] = []
  for (const unit of units) {
    const view = viewOf(unit.requirement)
    const encodable = toEncodable(view)
    if (unit.slot === undefined) whole.push(encodable)
    atoms.set(`${unit.id}${SEP}sys`, {
      atom: `${SEP}scope ${normalizeScope(view.systemName)}`,
      negated: false,
      text: view.systemName,
    })
    for (const row of encode(encodable, atomize).atoms) {
      if (unit.slot !== undefined && row.kind !== unit.slot) continue
      atoms.set(`${unit.id}${SEP}${row.kind}`, {
        atom: row.atom,
        negated: row.negated,
        ...(row.opposition !== undefined ? { opposition: row.opposition } : {}),
        text: row.slotText,
      })
    }
    if (unit.slot === undefined || unit.slot === 'resp') {
      const entry = atomize(
        'resp',
        encodable.systemResponse,
        encodable.systemName,
        encodable.negated ?? false,
      ).entry
      if (entry !== undefined) {
        atoms.set(`${unit.id}${SEP}entry`, {
          atom: entry,
          negated: false,
          text: encodable.systemResponse,
        })
      }
    }
    const predicates = requirementBounds(view, glossary)
      .map((b) => b.predicate)
      .filter((p) => unit.slot === undefined || p.slot === unit.slot)
    boundCount.set(unit.id, predicates.length)
    for (const [i, p] of predicates.entries()) {
      bounds.set(`${unit.id}${SEP}${i}`, {
        key: p.quantity,
        claim: claimOf(p),
        label: p.label,
        text: p.sourceText,
      })
    }
    if (unit.slot === undefined || unit.slot === 'resp') {
      const response = predicates.filter((p) => p.slot === 'resp')
      occurrences.set(
        unit.id,
        responseOccurrences(view, response, glossary).map((o) => [o.quantity, o.qualifier ?? '']),
      )
    }
  }
  for (const l of labels) {
    bounds.set(l.id, {
      key: quantityKey(l.system, l.label, glossary),
      claim: '',
      label: l.label,
      text: l.label,
    })
  }
  const bridges = extractGuardImplications(whole, atomize).map((b) => ({
    id: b.bridgeId,
    formula: b.formula,
  }))
  const text = readText(
    units.filter((u) => u.slot === undefined).map((u) => u.requirement),
    tables,
  )
  return { atoms, bounds, boundCount, occurrences, bridges, text }
}

/** A difference between two readings: the invariant it breaks, in words, and the phrases involved. */
export interface Mismatch {
  readonly invariant: 'V1' | 'V-KIND' | 'V-OPP' | 'V-NUM' | 'V-READ'
  readonly detail: string
  readonly phrases: readonly string[]
  /** For a hygiene refusal, the ids of the document requirements that use the phrase two ways. */
  readonly requirements?: readonly string[]
  /** For a hygiene refusal, the symbols the two uses are declared as. */
  readonly symbols?: readonly string[]
  /**
   * The ORIGINAL document breaks it, whatever the projection (decision D10): one phrase the
   * engine reads as one key and the vocabulary declares two ways.
   */
  readonly hygiene?: true
}

/** The class a use is DECLARED in, or `undefined` for a use whose phrase resolves to nothing. */
export interface Declared {
  readonly atom: (use: string) => string | undefined
  readonly bound: (use: string) => string | undefined
  /** Who a refusal names for a use: its requirement (or declared phrase), and the symbol it is declared as. */
  readonly who: (use: string) => Who
}

/** The words and ids a refusal names a use by. */
export interface Who {
  /** The requirement the use sits in, as the author names it (its key, else its id), or the probe. */
  readonly unit: string
  /** The requirement's id, for a use in a document requirement. */
  readonly requirement?: string
  /** The symbol the use is declared as, and its kind. */
  readonly symbol?: string
  readonly kind?: string
}

/** The namespace of an undeclared use's class: kept apart from every declared class. */
const UNDECLARED = '\u0000undeclared\u0000'

/** How a refusal names one use: `a state (st_x) in R1`. */
const described = (w: Who): string =>
  `${w.kind === undefined ? 'undeclared' : `a ${w.kind} (${w.symbol ?? ''})`} in ${w.requirement === undefined ? '' : 'requirement '}${w.unit}`

/**
 * The target partition over `uses` and whether the engine reads it, today and projected.
 *
 * The target is the DECLARED partition exactly (decision D10): a declared use is in its
 * declared class, and a use whose phrase resolves to nothing is classed by the key the engine
 * reads on it today, in a namespace of its own, since the vocabulary says nothing about it and
 * the projection does not rewrite it. It is never the join of the engine's reading and the
 * declaration: a join lets two uses the author kept apart meet through a third the engine reads
 * as one with each, which is how a feature-only alias once reached a state requirement nobody
 * merged it with.
 *
 * Two comparisons, in order:
 *
 * - HYGIENE, the original against the target: two uses the engine reads as one key today are in
 *   one target class. A document that breaks it (one system using one phrase as a feature and as
 *   a state, which the encoder reads as one `guard` atom) cannot be projected to the declared
 *   partition by any rewrite that does not also split an atom the engine reads today, so it is
 *   refused as written, every such key reported.
 * - EXACTNESS, the projection against the target: every two uses of one class read one key, and
 *   no key is read by two classes.
 */
const exactCompare = (
  uses: readonly string[],
  before: (use: string) => string,
  after: (use: string) => string,
  declared: (use: string) => string | undefined,
  textOf: (use: string) => string,
  who: (use: string) => Who,
  what: readonly [one: string, many: string],
): {
  readonly classOf: (use: string) => string
  readonly hygiene: readonly Mismatch[]
  readonly mismatch?: string[]
} => {
  const classOf = (u: string) => declared(u) ?? `${UNDECLARED}${before(u)}`
  const hygiene: Mismatch[] = []
  const today = new Map<string, Map<string, string>>()
  for (const u of uses) {
    const classes = today.get(before(u)) ?? new Map<string, string>()
    if (!classes.has(classOf(u))) classes.set(classOf(u), u)
    today.set(before(u), classes)
  }
  for (const classes of today.values()) {
    const [first, ...others] = [...classes.values()]
    if (first === undefined) continue
    for (const u of others) {
      const pair = [who(first), who(u)]
      const phrase = textOf(first)
      const spelled = textOf(u) === phrase ? `"${phrase}"` : `"${phrase}" / "${textOf(u)}"`
      hygiene.push({
        invariant: 'V-KIND',
        detail: `${spelled} is ${described(who(first))} and ${described(who(u))}, and the engine reads both as one ${what[0]}; one phrase is one kind in one system, so give both uses one kind or reword one of them`,
        phrases: [...new Set([phrase, textOf(u)])],
        requirements: pair
          .flatMap((w) => (w.requirement === undefined ? [] : [w.requirement]))
          .sort(),
        symbols: pair.flatMap((w) => (w.symbol === undefined ? [] : [w.symbol])).sort(),
        hygiene: true,
      })
    }
  }
  if (hygiene.length > 0) return { classOf, hygiene }

  const keyOfClass = new Map<string, { key: string; use: string }>()
  const classOfKey = new Map<string, { cls: string; use: string }>()
  for (const u of uses) {
    const c = classOf(u)
    const k = after(u)
    const seen = keyOfClass.get(c)
    if (seen === undefined) keyOfClass.set(c, { key: k, use: u })
    else if (seen.key !== k) {
      return {
        classOf,
        hygiene,
        mismatch: [
          `"${textOf(seen.use)}" and "${textOf(u)}" are one ${what[0]} by declaration, and the projection would read them as two (${seen.key}, ${k})`,
          textOf(seen.use),
          textOf(u),
        ],
      }
    }
    const held = classOfKey.get(k)
    if (held === undefined) classOfKey.set(k, { cls: c, use: u })
    else if (held.cls !== c) {
      return {
        classOf,
        hygiene,
        mismatch: [
          `"${textOf(held.use)}" and "${textOf(u)}" are two ${what[1]} by declaration, and the projection would read them as one (${k})`,
          textOf(held.use),
          textOf(u),
        ],
      }
    }
  }
  return { classOf, hygiene }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}${SEP}${b}` : `${b}${SEP}${a}`)

/** Every contrary pair of atoms in a reading, as the pair of classes their uses join. */
const contraryClasses = (
  atoms: ReadonlyMap<string, AtomUse>,
  classOf: (use: string) => string,
): Map<string, readonly [string, string]> => {
  const distinct = new Map<string, { atom: AtomUse; use: string }>()
  for (const [use, a] of atoms) {
    if (a.opposition !== undefined && !distinct.has(a.atom)) distinct.set(a.atom, { atom: a, use })
  }
  const rows = [...distinct.values()]
  const out = new Map<string, readonly [string, string]>()
  for (const [i, p] of rows.entries()) {
    for (const q of rows.slice(i + 1)) {
      if (!areContrary({ name: p.atom.atom, ...p.atom }, { name: q.atom.atom, ...q.atom })) continue
      out.set(pairKey(classOf(p.use), classOf(q.use)), [p.atom.text, q.atom.text])
    }
  }
  return out
}

/** Every atom name in a formula renamed by `rename`, as one comparable string. */
const renamed = (formula: unknown, rename: (name: string) => string): string =>
  JSON.stringify(formula, (key, value: unknown) =>
    key === 'name' && typeof value === 'string' ? rename(value) : value,
  )

/**
 * Compare the reading of the original with the reading of the projection. Empty when the
 * projection changes nothing but what the declaration merges. Every hygiene refusal when the
 * original itself reads a declared distinction as one key, since no projection repairs that;
 * otherwise the first difference found.
 */
export const compareOutcome = (
  before: Reading,
  after: Reading,
  declared: Declared,
): readonly Mismatch[] => {
  const atomUses = [...before.atoms.keys()].sort()
  const atomText = (use: string) => before.atoms.get(use)?.text ?? ''
  const atomJoin = exactCompare(
    atomUses,
    (u) => before.atoms.get(u)?.atom ?? '',
    (u) => after.atoms.get(u)?.atom ?? '',
    declared.atom,
    atomText,
    declared.who,
    ['atom', 'atoms'],
  )
  const boundUses = [...before.bounds.keys()].sort()
  const boundJoin = exactCompare(
    boundUses,
    (u) => before.bounds.get(u)?.key ?? '',
    (u) => after.bounds.get(u)?.key ?? '',
    declared.bound,
    (u) => before.bounds.get(u)?.label ?? '',
    declared.who,
    ['quantity', 'quantities'],
  )
  const hygiene = [...atomJoin.hygiene, ...boundJoin.hygiene]
  if (hygiene.length > 0) return hygiene
  const first = compareProjection(before, after, atomJoin, boundJoin)
  return first === undefined ? [] : [first]
}

type Compared = ReturnType<typeof exactCompare>

const compareProjection = (
  before: Reading,
  after: Reading,
  atomJoin: Compared,
  boundJoin: Compared,
): Mismatch | undefined => {
  // Atoms: the same slots, each at its polarity, partitioned as declared.
  for (const use of new Set([...before.atoms.keys(), ...after.atoms.keys()])) {
    const o = before.atoms.get(use)
    const p = after.atoms.get(use)
    if (o === undefined || p === undefined) {
      const text = (o ?? p)?.text ?? ''
      return {
        invariant: 'V1',
        detail: `the projection would ${o === undefined ? 'add' : 'drop'} an atom on "${text}"`,
        phrases: [text],
      }
    }
    if (o.negated !== p.negated) {
      return {
        invariant: 'V-OPP',
        detail: `the projection would flip the polarity of "${o.text}"`,
        phrases: [o.text],
      }
    }
  }
  if (atomJoin.mismatch !== undefined) {
    const [detail = '', ...phrases] = atomJoin.mismatch
    return { invariant: 'V1', detail, phrases }
  }

  // Contraries: exactly the original pairs, on classes; none of them inside one class.
  const was = contraryClasses(before.atoms, atomJoin.classOf)
  const is = contraryClasses(after.atoms, atomJoin.classOf)
  for (const [k, [p, q]] of was) {
    const [a, b] = k.split(SEP)
    if (a === b) {
      return {
        invariant: 'V-OPP',
        detail: `"${p}" and "${q}" are contraries, and one class would name both`,
        phrases: [p, q],
      }
    }
    if (!is.has(k)) {
      return {
        invariant: 'V-OPP',
        detail: `"${p}" and "${q}" are contraries, and the projection would lose the contrary`,
        phrases: [p, q],
      }
    }
  }
  for (const [k, [p, q]] of is) {
    if (!was.has(k)) {
      return {
        invariant: 'V-OPP',
        detail: `the projection would make "${p}" and "${q}" contraries, which neither the document nor the vocabulary says`,
        phrases: [p, q],
      }
    }
  }

  // Bounds: the same bounds per unit, each with its claim, keyed as declared.
  for (const [unit, n] of before.boundCount) {
    if (after.boundCount.get(unit) !== n) {
      const text =
        before.bounds.get(`${unit}${SEP}0`)?.text ?? after.bounds.get(`${unit}${SEP}0`)?.text ?? ''
      return {
        invariant: 'V-NUM',
        detail: `the projection would change how many bounds the numeric tier reads on "${text}" (${n} to ${after.boundCount.get(unit) ?? 0})`,
        phrases: [text],
      }
    }
  }
  for (const use of [...before.bounds.keys()].sort()) {
    const o = before.bounds.get(use)
    const p = after.bounds.get(use)
    if (o === undefined || p === undefined || o.claim !== p.claim) {
      const text = o?.text ?? ''
      return {
        invariant: 'V-NUM',
        detail: `the projection would change the bound the numeric tier reads on "${text}"${p === undefined ? '' : ` to "${p.text}"`}`,
        phrases: [text],
      }
    }
  }
  if (boundJoin.mismatch !== undefined) {
    const [detail = '', ...phrases] = boundJoin.mismatch
    return { invariant: 'V-NUM', detail, phrases }
  }

  // Occurrences on a key some bound is on: the same records, on the same classes.
  const classOfKey = (reading: Reading) => {
    const out = new Map<string, string>()
    for (const [use, b] of reading.bounds) out.set(b.key, boundJoin.classOf(use))
    return out
  }
  const records = (reading: Reading) => {
    const classes = classOfKey(reading)
    const out = new Map<string, string>()
    for (const [unit, list] of reading.occurrences) {
      for (const [key, qualifier] of list) {
        const c = classes.get(key)
        if (c !== undefined) out.set(JSON.stringify([unit, qualifier, c]), unit)
      }
    }
    return out
  }
  const unitText = (unit: string) =>
    before.atoms.get(`${unit}${SEP}resp`)?.text ?? after.atoms.get(`${unit}${SEP}resp`)?.text ?? ''
  const occurredBefore = records(before)
  const occurredAfter = records(after)
  for (const [record, unit] of occurredBefore) {
    if (!occurredAfter.has(record)) {
      return {
        invariant: 'V-NUM',
        detail: `the projection would move "${unitText(unit)}" off the quantity a bound is on, which the numeric tier reads it as performing`,
        phrases: [unitText(unit)],
      }
    }
  }
  for (const [record, unit] of occurredAfter) {
    if (!occurredBefore.has(record)) {
      return {
        invariant: 'V-NUM',
        detail: `the projection would make "${unitText(unit)}" perform a bounded quantity it does not perform today`,
        phrases: [unitText(unit)],
      }
    }
  }

  // Guard implications: the same bridges, their atoms mapped onto the projected atoms.
  const toAfter = new Map<string, string>()
  for (const [use, o] of before.atoms) {
    const p = after.atoms.get(use)
    if (p !== undefined) toAfter.set(o.atom, p.atom)
  }
  const bridgesBefore = new Map(
    before.bridges.map((b) => [b.id, renamed(b.formula, (n) => toAfter.get(n) ?? n)]),
  )
  const bridgesAfter = new Map(after.bridges.map((b) => [b.id, renamed(b.formula, (n) => n)]))
  for (const id of new Set([...bridgesBefore.keys(), ...bridgesAfter.keys()])) {
    if (bridgesBefore.get(id) !== bridgesAfter.get(id)) {
      const text = unitText(id)
      return {
        invariant: 'V-OPP',
        detail: `the projection would change the state "${text}" establishes for the requirements guarded on it`,
        phrases: [text],
      }
    }
  }

  // The text readers: every tier that reads a slot's words, beyond its atom.
  const sideOf = (side: 'before' | 'after') => (side === 'before' ? before : after)
  const text = compareText(before.text, after.text, {
    atom: (side, unit, kind) => sideOf(side).atoms.get(`${unit}${SEP}${kind}`)?.atom,
    boundKeys: (side, unit) => {
      const reading = sideOf(side)
      const n = reading.boundCount.get(unit) ?? 0
      return Array.from({ length: n }, (_, i) => reading.bounds.get(`${unit}${SEP}${i}`)?.key ?? '')
    },
    textOf: (unit) => before.atoms.get(`${unit}${SEP}resp`)?.text ?? unit,
  })
  if (text !== undefined) return { invariant: 'V-READ', ...text }
  return undefined
}
