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
 *   symbol's class); a use whose phrase resolves to nothing is its own class;
 * - P, by the key the engine reads on the PROJECTED document.
 *
 * The projection is admitted only when P is exactly the join of O and D: every two uses the
 * engine already reads as one stay one (nothing split), every two uses the author declared one
 * become one (the merge happened), and nothing else becomes one (nothing merged that neither the
 * engine nor the author merged). D alone is not the target, because the engine already joins
 * some uses the vocabulary keeps apart by design: an optional-feature precondition and a state
 * precondition of one spelling are one `guard` atom and two symbols. Where D is coarser than or
 * equal to O, which the resolver guarantees for every same-domain pair, the join IS D.
 *
 * With P the join, every key of P names one class, and the rest of the reading is compared per
 * class:
 *
 * - each slot keeps its polarity, and each bound every field but its key (comparator, value,
 *   unit, role, negation, qualifier, clause);
 * - the contrary pairs of P are exactly the contrary pairs of O, mapped onto classes: none lost,
 *   none added, and no class holds two contraries;
 * - the occurrences a response hands the numeric tier on a key some bound is on are the same
 *   records on the same classes;
 * - the guard implications are the same implications, their atoms mapped onto classes;
 * - every tier that reads a slot's WORDS beyond its atom (lint, the propose and disclosure tiers)
 *   reads the same thing, less what the declaration implies (`readers.ts`, invariant V-READ).
 *
 * Any difference is a refusal that names the phrases involved.
 */

import type { AntonymEntry } from '../engine/formal/antonyms.ts'
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
import { compareText, readText, type TextReading } from './readers.ts'

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

/** The tables a document is read under: its committed glossary, antonyms and terms. */
export interface ReadTables {
  readonly glossary: ReadonlyArray<{ canonical: string; aliases: readonly string[] }>
  readonly antonyms: ReadonlyMap<string, AntonymEntry> | undefined
  readonly terms: ReadonlyArray<{ canonical: string; aliases: readonly string[] }>
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
  tables: ReadTables,
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
  readonly invariant: 'V1' | 'V-OPP' | 'V-NUM' | 'V-READ'
  readonly detail: string
  readonly phrases: readonly string[]
}

/** The class a use is DECLARED in, or `undefined` for a use whose phrase resolves to nothing. */
export interface Declared {
  readonly atom: (use: string) => string | undefined
  readonly bound: (use: string) => string | undefined
}

/** Union-find over string nodes. */
const partition = () => {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    for (let p = parent.get(r); p !== undefined && p !== r; p = parent.get(r)) r = p
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x)
  }
  return { find, union, add }
}

/**
 * The join of O and D over `uses`, and whether P equals it: per use, the class it joins, and
 * the first split or unexpected merge found.
 */
const joinAndCompare = (
  uses: readonly string[],
  before: (use: string) => string,
  after: (use: string) => string,
  declared: (use: string) => string | undefined,
  textOf: (use: string) => string,
  what: readonly [one: string, many: string],
): { readonly classOf: (use: string) => string; readonly mismatch?: string[] } => {
  const j = partition()
  const byBefore = new Map<string, string>()
  const byDeclared = new Map<string, string>()
  for (const u of uses) {
    j.add(u)
    const b = byBefore.get(before(u))
    if (b === undefined) byBefore.set(before(u), u)
    else j.union(b, u)
    const k = declared(u)
    if (k === undefined) continue
    const d = byDeclared.get(k)
    if (d === undefined) byDeclared.set(k, u)
    else j.union(d, u)
  }
  const keyOfClass = new Map<string, string>()
  const classOfKey = new Map<string, string>()
  const firstOf = new Map<string, string>()
  for (const u of uses) {
    const c = j.find(u)
    const k = after(u)
    const seenKey = keyOfClass.get(c)
    if (seenKey === undefined) keyOfClass.set(c, k)
    else if (seenKey !== k) {
      const other = firstOf.get(c) ?? u
      return {
        classOf: j.find,
        mismatch: [
          `"${textOf(other)}" and "${textOf(u)}" are one ${what[0]} today or by declaration, and the projection would read them as two (${seenKey}, ${k})`,
          textOf(other),
          textOf(u),
        ],
      }
    }
    if (!firstOf.has(c)) firstOf.set(c, u)
    const seenClass = classOfKey.get(k)
    if (seenClass === undefined) classOfKey.set(k, c)
    else if (seenClass !== c) {
      const other = firstOf.get(seenClass) ?? u
      return {
        classOf: j.find,
        mismatch: [
          `"${textOf(other)}" and "${textOf(u)}" are two ${what[1]} today and by declaration, and the projection would read them as one (${k})`,
          textOf(other),
          textOf(u),
        ],
      }
    }
  }
  return { classOf: j.find }
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
 * Compare the reading of the original with the reading of the projection. `undefined` when the
 * projection changes nothing but what the declaration merges.
 */
export const compareOutcome = (
  before: Reading,
  after: Reading,
  declared: Declared,
): Mismatch | undefined => {
  // Atoms: the same slots, each at its polarity, partitioned as the join.
  const atomUses = [...before.atoms.keys()].sort()
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
  const atomText = (use: string) => before.atoms.get(use)?.text ?? ''
  const atomJoin = joinAndCompare(
    atomUses,
    (u) => before.atoms.get(u)?.atom ?? '',
    (u) => after.atoms.get(u)?.atom ?? '',
    declared.atom,
    atomText,
    ['atom', 'atoms'],
  )
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

  // Bounds: the same bounds per unit, each with its claim, keyed as the join.
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
  const boundUses = [...before.bounds.keys()].sort()
  for (const use of boundUses) {
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
  const boundJoin = joinAndCompare(
    boundUses,
    (u) => before.bounds.get(u)?.key ?? '',
    (u) => after.bounds.get(u)?.key ?? '',
    declared.bound,
    (u) => before.bounds.get(u)?.label ?? '',
    ['quantity', 'quantities'],
  )
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
    classOf: atomJoin.classOf,
    textOf: (unit) => before.atoms.get(`${unit}${SEP}resp`)?.text ?? unit,
  })
  if (text !== undefined) return { invariant: 'V-READ', ...text }
  return undefined
}
