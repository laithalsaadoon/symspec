/**
 * S6, THE RESOLVER CHOKEPOINT — the run contract's examples X1-X21 (contract 971c904835f2),
 * pinned behavior by behavior. Each test name starts with the behavior ids it is evidence for.
 *
 * Rulings this file follows: RQ5(a) the D1 and D2 overlays are EXACTLY the listed symbols;
 * RQ6(a) a same-key spelling resolves to the canonical, a different-key one needs an alias;
 * RQ7(a) property (1) reads the PURE encoder over every requirement, the sentence pinned to
 * `The <system> shall <response>.`, with the gate-included count beside it; RQ8(a) no feature
 * row; RQ9(b) the SAB-1 variant is the fixture plus one event-driven `open the valve` row.
 *
 * Every assertion is computed here from the engine's own readers (`encode`, `requirementBounds`,
 * `areContrary`), never from a second derivation, and every set it quantifies over is counted
 * first, so no test passes on nothing. No solver: nothing here boots z3 or calls `runCheck`.
 *
 * S6-005..S6-008 are sabotage targets: the tests tagged with them are the ones a sabotage of
 * keys.ts (action keys, system keys) or outcome.ts (V-OPP, V-NUM) must turn red.
 */

import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import { MUTATE_OPTIONS } from '../../app/operations/mutate-options.ts'
import { asRequirementsDocument } from '../../testing/eval-rounds.ts'
import { generateCases } from '../../testing/generate.ts'
import { reportSources } from '../../testing/report-corpus.ts'
import { toEngineDoc } from '../compat.ts'
import { areContrary, normalizeScope } from '../engine/formal/atomize.ts'
import { encode, toEncodable } from '../engine/formal/encode.ts'
import { quantityKey, requirementBounds } from '../engine/formal/numeric.ts'
import { encodeIncluded } from '../engine/pipeline/check.ts'
import {
  DOC_VERSION_VOCAB,
  emptyDocument,
  type Requirement,
  type RequirementsDocument,
  SYMBOL_ID_PATTERN,
  type SymbolKind,
  type VocabSymbol,
} from '../requirements/document.ts'
import { buildProjection, buildVocabularyIndex } from './build.ts'
import { KIND_PREFIX, mintSymbolIds } from './ids.ts'
import { implicitVocabulary, renderVocabularyOps, type VocabDeclaration } from './implicit.ts'
import { frozenTablesDigest, type VocabularyViolation } from './invariants.ts'
import { phraseKey, tablesOf, viewOf } from './keys.ts'
import { bindingOf, resolvePhrase, resolveRequirement, type VocabularyIndex } from './resolve.ts'

// ---------------------------------------------------------------------------
// The shared fixture (intake, 14 rows) and the RQ9(b) variant
// ---------------------------------------------------------------------------

/** Requirement `Rn` has the id ending in `n` (hex), so a failure names the row. */
const rid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

interface Row {
  readonly n: number
  readonly sys: string
  readonly resp: string
  readonly pattern?: Requirement['patternType']
  readonly trig?: string
  readonly pre?: string
}

const req = (row: Row): Requirement => ({
  id: rid(row.n),
  patternType: row.pattern ?? 'ubiquitous',
  systemName: row.sys,
  systemResponse: row.resp,
  negated: false,
  // RQ7(a): the sentence is pinned, so the gate's included set is a stated count.
  sentence: `The ${row.sys} shall ${row.resp}.`,
  priority: 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...(row.trig !== undefined ? { trigger: row.trig } : {}),
  ...(row.pre !== undefined ? { preCondition: row.pre } : {}),
})

const ROWS: readonly Row[] = [
  { n: 1, sys: 'Door Controller', resp: 'lock the door' },
  { n: 2, sys: 'door controller', resp: 'unlock the door' },
  { n: 3, sys: 'door controller', resp: 'log the event' },
  { n: 4, sys: 'A Gateway', resp: 'grant access' },
  { n: 5, sys: 'Gateway', resp: 'revoke access' },
  {
    n: 6,
    pattern: 'state-driven',
    pre: 'the train is moving',
    sys: 'door controller',
    resp: 'keep the doors closed',
  },
  {
    n: 7,
    pattern: 'event-driven',
    trig: 'train moving',
    sys: 'door controller',
    resp: 'sound the alarm',
  },
  { n: 8, sys: 'pump controller', resp: 'opens the valve' },
  {
    n: 9,
    pattern: 'event-driven',
    trig: 'the tank is full',
    sys: 'pump controller',
    resp: 'shut the valve',
  },
  {
    n: 10,
    pattern: 'event-driven',
    trig: 'the leak alarm sounds',
    sys: 'pump controller',
    resp: 'seal the valve',
  },
  { n: 11, sys: 'inverter', resp: 'limit the output to at most 5 MW' },
  { n: 12, sys: 'inverter', resp: 'limit the output to at most 5 mw' },
  { n: 13, sys: 'hvac', resp: 'keep the cabin temperature at most 20 C' },
  {
    n: 14,
    pattern: 'event-driven',
    trig: 'the door opens',
    sys: 'hvac',
    resp: 'keep the cabin temperature at most 25 C',
  },
]

/** RQ9(b): the row that makes an inflected head and its lemma meet in one document. */
const R15: Row = {
  n: 15,
  pattern: 'event-driven',
  trig: 'the tank is empty',
  sys: 'pump controller',
  resp: 'open the valve',
}

const docOf = (
  rows: readonly Row[],
  tables: Partial<Pick<RequirementsDocument, 'glossary' | 'antonyms' | 'terms'>> = {},
): RequirementsDocument => ({
  ...emptyDocument(),
  ...tables,
  requirements: Object.fromEntries(rows.map((row) => [rid(row.n), req(row)])),
})

const FIXTURE = docOf(ROWS, { antonyms: [{ a: 'open', b: 'shut' }] })
const VARIANT = docOf([...ROWS, R15], { antonyms: [{ a: 'open', b: 'shut' }] })

const R = (doc: RequirementsDocument, n: number): Requirement => {
  const r = doc.requirements[rid(n)]
  if (r === undefined) throw new Error(`no row R${n}`)
  return r
}

const act = (id: string, canonical: string, aliases: readonly string[] = []): VocabSymbol => ({
  id,
  kind: 'action',
  canonical,
  aliases: [...aliases],
})

/** A document with a hand-written vocabulary and its tables frozen as they stand. */
const withVocabulary = (
  doc: RequirementsDocument,
  symbols: readonly VocabSymbol[],
  merges: readonly { a: string; b: string }[] = [],
): RequirementsDocument => ({
  ...doc,
  docVersion: DOC_VERSION_VOCAB,
  vocabulary: {
    symbols: [...symbols],
    merges: [...merges],
    distinct: [],
    frozenTables: { sha256: frozenTablesDigest(doc) },
  },
})

/** The stand-in for the `vocab` fold (S7, assumption A3): it validates nothing. */
const declare = (
  doc: RequirementsDocument,
  ops: readonly VocabDeclaration[],
): RequirementsDocument =>
  withVocabulary(
    doc,
    ops.map((op): VocabSymbol => {
      const { op: _verb, ...symbol } = op
      return { aliases: [], ...symbol } as VocabSymbol
    }),
  )

const brief = (vs: readonly VocabularyViolation[]) =>
  vs.map((v) => ({
    invariant: v.invariant,
    dropped: v.dropped,
    symbols: v.symbols,
    phrase: v.phrase,
  }))

// ---------------------------------------------------------------------------
// The corpus: the report corpus plus ladder tiers 1-4, loaded as resolve.test.ts loads it
// ---------------------------------------------------------------------------

const LADDER_TIERS = [1, 2, 3, 4] as const

const corpus = (): readonly { label: string; doc: RequirementsDocument }[] => [
  ...reportSources(MUTATE_OPTIONS),
  ...LADDER_TIERS.flatMap((tier) =>
    generateCases(tier, 0).map((c) => ({
      label: `generated-t${tier}/${c.id}`,
      doc: asRequirementsDocument(c.doc),
    })),
  ),
]

const DOCS = corpus()

// ---------------------------------------------------------------------------
// Property (1), read through the pure encoder over every requirement (RQ7 a)
// ---------------------------------------------------------------------------

interface Partition {
  /** Each engine key (atom per collision domain, or quantity key) bound to more than one symbol. */
  readonly violations: readonly string[]
  /** Atom occurrences per requirement id, as the encoder returns them. */
  readonly atomsPer: ReadonlyMap<string, number>
  /** Distinct engine keys: atoms per domain plus quantity keys. */
  readonly groups: number
  readonly quantityKeys: number
}

const partition = (doc: RequirementsDocument): Partition => {
  const tables = tablesOf(doc)
  const { index } = buildVocabularyIndex(doc)
  const bound = new Map<string, Set<string>>()
  const note = (key: string, symbols: string) => {
    const set = bound.get(key) ?? new Set<string>()
    set.add(symbols)
    bound.set(key, set)
  }
  const violations: string[] = []
  const atomsPer = new Map<string, number>()
  let quantityKeys = 0
  for (const r of Object.values(doc.requirements)) {
    const b = bindingOf(index, r)
    if (b === undefined) {
      violations.push(`${r.id} did not resolve`)
      continue
    }
    const enc = encode(toEncodable(viewOf(r)), tables.atomize)
    atomsPer.set(r.id, enc.atoms.length)
    for (const a of enc.atoms) {
      const domain =
        a.kind === 'resp'
          ? 'action'
          : a.kind === 'pre' && r.patternType === 'optional-feature'
            ? 'feature'
            : 'guard'
      const slot =
        a.kind === 'resp'
          ? b.response
          : a.kind === 'trig'
            ? b.trigger
            : (b.preCondition ?? b.feature)
      note(`${domain}\t${a.atom}`, `${b.system}/${slot ?? '<none>'}`)
    }
    const labels = b.quantities.map((q) => q.label)
    const keys = requirementBounds(r, tables.glossary)
      .map((x) => x.predicate)
      .filter((p) => p.label.trim() !== '')
      .map((p) => p.quantity)
    if (labels.length !== keys.length) {
      violations.push(`${r.id}: ${labels.length} of ${keys.length} bounds bound`)
      continue
    }
    for (const [i, k] of keys.entries()) {
      quantityKeys += 1
      note(`quantity\t${k}`, `${b.system}/${labels[i] ?? '<none>'}`)
    }
  }
  for (const [key, symbols] of bound) {
    if (symbols.size > 1) violations.push(`${key}\t${[...symbols].sort().join(' | ')}`)
  }
  return { violations, atomsPer, groups: bound.size, quantityKeys }
}

// ---------------------------------------------------------------------------
// Property (4): contraries kept, at one probe scope, on the VALIDATED index
// ---------------------------------------------------------------------------

const atomOf = (doc: RequirementsDocument) => {
  const tables = tablesOf(doc)
  return (text: string) => {
    const a = tables.atomize('resp', text, 'x', false)
    return { name: a.atom, ...(a.opposition !== undefined ? { opposition: a.opposition } : {}) }
  }
}

/** The contrary action-phrase pairs of an index, each `p / q` with p < q. */
const contraryPairs = (doc: RequirementsDocument, index: VocabularyIndex): string[] => {
  const atom = atomOf(doc)
  const texts = index.symbols
    .filter((s) => s.kind === 'action')
    .flatMap((s) => [s.canonical, ...s.aliases])
  const out: string[] = []
  for (const p of texts) {
    for (const q of texts) if (p < q && areContrary(atom(p), atom(q))) out.push(`${p} / ${q}`)
  }
  return out.sort()
}

/** Property (4)'s finite check: every contrary phrase pair whose classes' canonicals are not. */
const contraryLosses = (doc: RequirementsDocument, index: VocabularyIndex): string[] => {
  const atom = atomOf(doc)
  const phrases: { text: string; rep: string }[] = []
  for (const s of index.symbols) {
    if (s.kind !== 'action') continue
    const rep = index.representative.get(s.id) ?? s.id
    for (const text of [s.canonical, ...s.aliases]) phrases.push({ text, rep })
  }
  const canonical = (rep: string) => index.byId.get(rep)?.canonical ?? rep
  const losses: string[] = []
  for (const p of phrases) {
    for (const q of phrases) {
      if (p.text >= q.text || !areContrary(atom(p.text), atom(q.text))) continue
      if (p.rep === q.rep) losses.push(`one class holds contraries: ${p.text} / ${q.text}`)
      else if (!areContrary(atom(canonical(p.rep)), atom(canonical(q.rep)))) {
        losses.push(
          `${p.text} / ${q.text} are contraries; ${canonical(p.rep)} / ${canonical(q.rep)} are not`,
        )
      }
    }
  }
  return losses
}

const kindCounts = (symbols: readonly VocabSymbol[]): Record<SymbolKind, number> => {
  const out: Record<SymbolKind, number> = {
    system: 0,
    feature: 0,
    event: 0,
    state: 0,
    action: 0,
    quantity: 0,
  }
  for (const s of symbols) out[s.kind] += 1
  return out
}

const symbolById = (symbols: readonly VocabSymbol[], id: string) => symbols.find((s) => s.id === id)

// ---------------------------------------------------------------------------
// The counts every quantifier below rests on
// ---------------------------------------------------------------------------

describe('the S6 fixtures and corpus are non-vacuous', () => {
  it('[S6-001] [S6-002] [S6-003] [S6-004] [S6-009] the fixture has 14 rows and 26 implicit symbols, the corpus 73 documents, 204 requirements and 375 symbols', () => {
    expect(Object.keys(FIXTURE.requirements)).toHaveLength(14)
    expect(implicitVocabulary(FIXTURE).symbols).toHaveLength(26)
    expect(Object.keys(VARIANT.requirements)).toHaveLength(15)
    expect(DOCS).toHaveLength(73)
    expect(DOCS.reduce((n, d) => n + Object.keys(d.doc.requirements).length, 0)).toBe(204)
    expect(DOCS.reduce((n, d) => n + buildVocabularyIndex(d.doc).index.symbols.length, 0)).toBe(375)
  })
})

// ---------------------------------------------------------------------------
// S6-009: AC-4-1 (S6 part), X1-X8
// ---------------------------------------------------------------------------

describe('[S6-009] each slot resolves to its kind, every requirement resolves, only used kinds are minted', () => {
  const { index, invalid } = buildVocabularyIndex(FIXTURE)
  const b = (n: number) => bindingOf(index, R(FIXTURE, n))

  it('[S6-009] X1 the implicit vocabulary: 26 symbols, 6 system, 1 state, 3 event, 14 action, 2 quantity, no feature', () => {
    expect(index.mode).toBe('implicit')
    expect(invalid).toEqual([])
    const unresolved = Object.values(FIXTURE.requirements).filter(
      (r) => 'unresolved' in resolveRequirement(index, r),
    )
    expect(unresolved).toEqual([])
    expect(index.symbols).toHaveLength(26)
    expect(kindCounts(index.symbols)).toEqual({
      system: 6,
      feature: 0,
      event: 3,
      state: 1,
      action: 14,
      quantity: 2,
    })
    expect(index.merges).toEqual([])
    expect(index.distinct).toEqual([])
    expect(buildProjection(FIXTURE)).toBeUndefined()
  })

  it('[S6-009] X2 one system, two spellings: sys_door_controller binds R1, R2, R3, R6, R7', () => {
    expect(symbolById(index.symbols, 'sys_door_controller')).toEqual({
      id: 'sys_door_controller',
      kind: 'system',
      canonical: 'door controller',
      aliases: ['Door Controller'],
    })
    for (const n of [1, 2, 3, 6, 7]) expect(b(n)?.system, `R${n}`).toBe('sys_door_controller')
  })

  it('[S6-009] X3 one state through article and copula: st_train_moving binds R6 precondition and R7 trigger', () => {
    expect(symbolById(index.symbols, 'st_train_moving')).toMatchObject({
      kind: 'state',
      canonical: 'the train is moving',
      aliases: ['train moving'],
    })
    expect(b(6)?.preCondition).toBe('st_train_moving')
    expect(b(7)?.trigger).toBe('st_train_moving')
  })

  it('[S6-006] [S6-009] X4 the article keeps two systems: sys_a_gateway (R4) and sys_gateway (R5)', () => {
    const systems = index.symbols.filter((s) => s.kind === 'system' && /gateway/i.test(s.canonical))
    expect(systems).toEqual([
      { id: 'sys_a_gateway', kind: 'system', canonical: 'A Gateway', aliases: [] },
      { id: 'sys_gateway', kind: 'system', canonical: 'Gateway', aliases: [] },
    ])
    expect(b(4)?.system).toBe('sys_a_gateway')
    expect(b(5)?.system).toBe('sys_gateway')
  })

  it('[S6-009] X5 the valve actions: R8 act_open_the_valve (canonical `opens the valve`), R9 shut, R10 seal', () => {
    expect(symbolById(index.symbols, 'act_open_the_valve')).toEqual(
      act('act_open_the_valve', 'opens the valve'),
    )
    expect(b(8)?.response).toBe('act_open_the_valve')
    expect(b(9)?.response).toBe('act_shut_the_valve')
    expect(b(10)?.response).toBe('act_seal_the_valve')
  })

  it('[S6-009] X6 unit case MW/mw: two actions, one quantity qty_limit_the_output', () => {
    expect(b(11)?.response).toBe('act_limit_the_output_to_at_most_5_mw')
    expect(b(12)?.response).toBe('act_limit_the_output_to_at_most_5_mw_2')
    expect(symbolById(index.symbols, 'act_limit_the_output_to_at_most_5_mw')?.canonical).toBe(
      'limit the output to at most 5 MW',
    )
    expect(symbolById(index.symbols, 'act_limit_the_output_to_at_most_5_mw_2')?.canonical).toBe(
      'limit the output to at most 5 mw',
    )
    expect(symbolById(index.symbols, 'qty_limit_the_output')).toMatchObject({
      kind: 'quantity',
      dimension: 'unrecognized',
      unit: 'MW',
      numberType: 'int',
    })
    const q = (unit: string) => ({
      label: 'qty_limit_the_output',
      comparator: '<=',
      value: '5/1',
      unit,
      dimension: 'unrecognized',
      slot: 'resp',
    })
    expect(b(11)?.quantities).toEqual([q('MW')])
    expect(b(12)?.quantities).toEqual([q('mw')])
    for (const n of [11, 12]) {
      expect(
        requirementBounds(R(FIXTURE, n), index.tables.glossary).map((x) => x.predicate.quantity),
      ).toEqual(['sys__inverter__qty__limit_the_output'])
    }
  })

  it('[S6-009] X7 two bounds, one quantity: qty_keep_the_cabin_temperature at 20/1 C and 25/1 C', () => {
    expect(symbolById(index.symbols, 'qty_keep_the_cabin_temperature')).toMatchObject({
      kind: 'quantity',
      dimension: 'unrecognized',
      unit: 'C',
      numberType: 'int',
    })
    const q = (value: string) => ({
      label: 'qty_keep_the_cabin_temperature',
      comparator: '<=',
      value,
      unit: 'C',
      dimension: 'unrecognized',
      slot: 'resp',
    })
    expect(b(13)?.quantities).toEqual([q('20/1')])
    expect(b(14)?.quantities).toEqual([q('25/1')])
    expect(b(13)?.response).not.toBe(b(14)?.response)
    for (const n of [13, 14]) {
      expect(
        requirementBounds(R(FIXTURE, n), index.tables.glossary).map((x) => x.predicate.quantity),
      ).toEqual(['sys__hvac__qty__keep_the_cabin_temperature'])
    }
  })

  it('[S6-009] X8 events: evt_tank_full (R9), evt_leak_alarm_sounds (R10), evt_door_opens (R14)', () => {
    expect(index.symbols.filter((s) => s.kind === 'event').map((s) => s.id)).toEqual([
      'evt_door_opens',
      'evt_leak_alarm_sounds',
      'evt_tank_full',
    ])
    expect(b(9)?.trigger).toBe('evt_tank_full')
    expect(b(10)?.trigger).toBe('evt_leak_alarm_sounds')
    expect(b(14)?.trigger).toBe('evt_door_opens')
  })
})

// ---------------------------------------------------------------------------
// S6-001: property (1), X9 and X21
// ---------------------------------------------------------------------------

describe('[S6-001] implicit symbols are never finer than the engine`s atom and quantity-key partition', () => {
  it('[S6-001] X9 on the fixture: 0 violations, 19 atoms on every row, 20 engine keys, the gate including R1-R10', () => {
    const p = partition(FIXTURE)
    expect(p.violations).toEqual([])
    expect(p.atomsPer.size).toBe(14)
    for (const [id, n] of p.atomsPer) expect(n, id).toBeGreaterThan(0)
    expect([...p.atomsPer.values()].reduce((a, n) => a + n, 0)).toBe(19)
    expect(p.groups).toBe(20)
    expect(p.quantityKeys).toBe(4)
    // RQ7(a): the gate path, reported beside the pure path it does not replace.
    const included = new Set(encodeIncluded(toEngineDoc(FIXTURE)).map((e) => e.id))
    expect(ROWS.filter((row) => included.has(rid(row.n))).map((row) => row.n)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
  })

  it('[S6-001] X21 over the 73 corpus documents: 0 violations, every requirement encodes an atom', () => {
    let atoms = 0
    let requirements = 0
    const violations: string[] = []
    for (const { label, doc } of DOCS) {
      const p = partition(doc)
      for (const v of p.violations) violations.push(`${label}\t${v}`)
      for (const [id, n] of p.atomsPer) {
        requirements += 1
        atoms += n
        if (n === 0) violations.push(`${label}\t${id} encodes no atom`)
      }
    }
    expect(violations).toEqual([])
    expect(requirements).toBe(204)
    expect(atoms).toBeGreaterThan(204)
  })
})

// ---------------------------------------------------------------------------
// S6-005: SAB-1's target, the RQ9(b) variant
// ---------------------------------------------------------------------------

describe('[S6-005] actions are keyed by the atomize resp body, so `opens the valve` and `open the valve` are one symbol', () => {
  it('[S6-005] P1 on the RQ9(b) variant: one action act_open_the_valve for R8 and R15, 0 violations', () => {
    // Property (1) first: it is the claim; the symbol shape below is the example it rests on.
    const p = partition(VARIANT)
    expect(p.atomsPer.size).toBe(15)
    expect(p.violations).toEqual([])
    const { index, invalid } = buildVocabularyIndex(VARIANT)
    expect(invalid).toEqual([])
    expect(index.symbols).toHaveLength(27)
    expect(symbolById(index.symbols, 'act_open_the_valve')).toEqual(
      act('act_open_the_valve', 'open the valve', ['opens the valve']),
    )
    expect(bindingOf(index, R(VARIANT, 8))?.response).toBe('act_open_the_valve')
    expect(bindingOf(index, R(VARIANT, 15))?.response).toBe('act_open_the_valve')
  })
})

// ---------------------------------------------------------------------------
// S6-002: property (2), X10 and X21
// ---------------------------------------------------------------------------

const roundTrip = (label: string, doc: RequirementsDocument) => {
  const implicit = buildVocabularyIndex(doc)
  const minted = implicitVocabulary(doc)
  const ops = renderVocabularyOps(minted)
  const declared = declare(doc, ops)
  const explicit = buildVocabularyIndex(declared)
  expect(implicit.index.mode, label).toBe('implicit')
  expect(explicit.index.mode, label).toBe('explicit')
  expect(explicit.invalid, label).toEqual([])
  for (const field of [
    'symbols',
    'byId',
    'representative',
    'owners',
    'merges',
    'distinct',
  ] as const) {
    expect(
      isDeepStrictEqual(explicit.index[field], implicit.index[field]),
      `${label} ${field}`,
    ).toBe(true)
  }
  expect(isDeepStrictEqual(explicit.index.symbols, minted.symbols), `${label} minted`).toBe(true)
  let bindings = 0
  for (const r of Object.values(doc.requirements)) {
    expect(bindingOf(explicit.index, r), `${label} ${r.id}`).toEqual(bindingOf(implicit.index, r))
    if (bindingOf(explicit.index, r) !== undefined) bindings += 1
  }
  const projection = buildProjection(declared)
  expect(projection?.rewrites.size, label).toBe(0)
  expect(projection?.unresolved.size, label).toBe(0)
  expect(projection?.quantityAliases, label).toEqual([])
  return { ops: ops.length, bindings }
}

describe('[S6-002] declaring the rendered implicit vocabulary rebuilds the same index and bindings', () => {
  it('[S6-002] X10 on the fixture: 26 ops, no violation, same index fields, 14 equal bindings, identity projection', () => {
    expect(roundTrip('fixture', FIXTURE)).toEqual({ ops: 26, bindings: 14 })
  })

  it('[S6-002] X21 over the 73 corpus documents: 375 ops and 204 equal bindings', () => {
    let ops = 0
    let bindings = 0
    for (const { label, doc } of DOCS) {
      const n = roundTrip(label, doc)
      ops += n.ops
      bindings += n.bindings
    }
    expect(ops).toBe(375)
    expect(bindings).toBe(204)
  })
})

// ---------------------------------------------------------------------------
// S6-003: property (3), X11, X17, the digest and suffix forms
// ---------------------------------------------------------------------------

/** Property (3) on one id: the pattern, the length, the scope and quantity-label fixed points. */
const fixedPointProblems = (id: string, doc: RequirementsDocument): string[] => {
  const tables = tablesOf(doc)
  const problems: string[] = []
  if (!SYMBOL_ID_PATTERN.test(id)) problems.push(`${id}: pattern`)
  if (id.length > 64) problems.push(`${id}: length ${id.length}`)
  if (normalizeScope(id) !== id) problems.push(`${id}: scope ${normalizeScope(id)}`)
  if (phraseKey('quantity', id, tables) !== id) problems.push(`${id}: label key`)
  const prefix = quantityKey('x', '')
  if (quantityKey('x', id).slice(prefix.length) !== id) problems.push(`${id}: quantityKey label`)
  return problems
}

describe('[S6-003] every minted id is a scope and quantity-label fixed point, deterministic under reordering', () => {
  it('[S6-003] X11 on the fixture: all 26 ids, the `_2` id included; the full quantity key is scoped by design', () => {
    const ids = implicitVocabulary(FIXTURE).symbols.map((s) => s.id)
    expect(ids).toHaveLength(26)
    expect(ids).toContain('act_limit_the_output_to_at_most_5_mw_2')
    expect(ids.flatMap((id) => fixedPointProblems(id, FIXTURE))).toEqual([])
    for (const s of implicitVocabulary(FIXTURE).symbols) {
      expect(s.id.startsWith(`${KIND_PREFIX[s.kind]}_`), s.id).toBe(true)
    }
    expect(quantityKey('x', 'act_open_the_valve')).toBe('sys__x__qty__act_open_the_valve')
    expect(quantityKey('x', 'act_open_the_valve')).not.toBe('act_open_the_valve')
  })

  it('[S6-003] the digest and suffix forms are fixed points too', () => {
    const minted = [
      ...mintSymbolIds('system', ['العربية']).values(),
      ...mintSymbolIds('quantity', ['a'.repeat(70)]).values(),
      ...mintSymbolIds('action', ['valve', 'valve_2', 'valve_α', 'valve_β']).values(),
    ]
    expect(minted).toHaveLength(6)
    expect(minted.filter((id) => /_h[0-9a-f]{10}$/.test(id))).toHaveLength(2)
    expect(minted.filter((id) => /^act_valve_[0-9]$/.test(id)).sort()).toEqual([
      'act_valve_2',
      'act_valve_3',
      'act_valve_4',
    ])
    expect(minted.flatMap((id) => fixedPointProblems(id, FIXTURE))).toEqual([])
  })

  it('[S6-003] X17 the fixture`s vocabulary is a function of the requirement set: reversed order deep-equals', () => {
    const reversed = {
      ...FIXTURE,
      requirements: Object.fromEntries(Object.entries(FIXTURE.requirements).reverse()),
    }
    expect(Object.keys(reversed.requirements)[0]).toBe(rid(14))
    expect(isDeepStrictEqual(implicitVocabulary(reversed), implicitVocabulary(FIXTURE))).toBe(true)
    expect(
      symbolById(implicitVocabulary(reversed).symbols, 'act_limit_the_output_to_at_most_5_mw_2')
        ?.canonical,
    ).toBe('limit the output to at most 5 mw')
  })

  it('[S6-003] X21 over the 73 corpus documents: 375 minted ids, every one a fixed point', () => {
    let minted = 0
    const problems: string[] = []
    for (const { label, doc } of DOCS) {
      for (const s of implicitVocabulary(doc).symbols) {
        minted += 1
        for (const p of fixedPointProblems(s.id, doc)) problems.push(`${label}\t${p}`)
      }
    }
    expect(problems).toEqual([])
    expect(minted).toBe(375)
  })
})

// ---------------------------------------------------------------------------
// S6-004 / S6-007: property (4), X12, X13 (RQ5 a), X21
// ---------------------------------------------------------------------------

const D1 = withVocabulary(FIXTURE, [
  act('act_seal', 'seal the valve', ['shut the valve']),
  act('act_open', 'open the valve'),
])
const D1_CONTROL = withVocabulary(FIXTURE, [
  act('act_seal', 'seal the valve'),
  act('act_open', 'open the valve'),
])

describe('[S6-004] the canonical rewrite keeps every contrary action pair, and drops a contrary-losing alias', () => {
  it('[S6-004] X12 on the fixture: 3 contrary pairs at one probe scope, 0 losses, `seal the valve` contrary to neither', () => {
    const { index } = buildVocabularyIndex(FIXTURE)
    expect(contraryPairs(FIXTURE, index)).toEqual([
      'grant access / revoke access',
      'lock the door / unlock the door',
      'opens the valve / shut the valve',
    ])
    expect(contraryLosses(FIXTURE, index)).toEqual([])
    const atom = atomOf(FIXTURE)
    for (const other of ['opens the valve', 'open the valve', 'shut the valve']) {
      expect(areContrary(atom('seal the valve'), atom(other)), other).toBe(false)
    }
  })

  it('[S6-004] [S6-007] X13 D1 (listed form): property (4) holds on the validated index, and V-OPP drops `shut the valve`', () => {
    // Property (4) first: it is the claim, and the violation list below is how it is kept.
    const { index, invalid } = buildVocabularyIndex(D1)
    expect(contraryLosses(D1, index)).toEqual([])
    expect(brief(invalid)).toEqual([
      { invariant: 'V-OPP', dropped: 'alias', symbols: ['act_seal'], phrase: 'shut the valve' },
    ])
    expect(index.symbols).toEqual([
      act('act_open', 'open the valve'),
      act('act_seal', 'seal the valve'),
    ])
    // What the refusal prevents: the unchecked rewrite of `shut` to `seal` loses the contrary.
    const atom = atomOf(FIXTURE)
    expect(areContrary(atom('open the valve'), atom('shut the valve'))).toBe(true)
    expect(areContrary(atom('open the valve'), atom('seal the valve'))).toBe(false)
  })

  it('[S6-004] X13 control: D1 without the alias validates clean', () => {
    const { index, invalid } = buildVocabularyIndex(D1_CONTROL)
    expect(invalid).toEqual([])
    expect(index.symbols.map((s) => s.id)).toEqual(['act_open', 'act_seal'])
    expect(contraryLosses(D1_CONTROL, index)).toEqual([])
  })

  it('[S6-004] X21 over the 73 corpus documents: 0 losses, and the action phrases hold contrary pairs', () => {
    let pairs = 0
    const losses: string[] = []
    for (const { label, doc } of DOCS) {
      const { index } = buildVocabularyIndex(doc)
      for (const l of contraryLosses(doc, index)) losses.push(`${label}\t${l}`)
      pairs += contraryPairs(doc, index).length
    }
    expect(losses).toEqual([])
    expect(pairs).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// S6-008: V-NUM, X14 (RQ5 a)
// ---------------------------------------------------------------------------

const KEEP_20 = 'keep the cabin temperature at most 20 C'
const KEEP_25 = 'keep the cabin temperature at most 25 C'

describe('[S6-008] V-NUM refuses D2`s alias `at most 25 C` of `at most 20 C`', () => {
  it('[S6-008] X14 D2 (listed form): exactly one V-NUM violation, the alias dropped', () => {
    const d2 = withVocabulary(FIXTURE, [act('act_keep', KEEP_20, [KEEP_25])])
    const { index, invalid } = buildVocabularyIndex(d2)
    expect(brief(invalid)).toEqual([
      { invariant: 'V-NUM', dropped: 'alias', symbols: ['act_keep'], phrase: KEEP_25 },
    ])
    expect(index.symbols).toEqual([act('act_keep', KEEP_20)])
    // What the refusal prevents: the unchecked rewrite reads <= 25/1 C as <= 20/1 C.
    const value = (text: string) =>
      requirementBounds(req({ n: 99, sys: 'hvac', resp: text }), index.tables.glossary).map(
        (x) =>
          `${x.predicate.comparator} ${x.predicate.exact.numerator}/${x.predicate.exact.denominator}`,
      )
    expect(value(KEEP_25)).toEqual(['<= 25/1'])
    expect(value(KEEP_20)).toEqual(['<= 20/1'])
  })

  it('[S6-008] X14 control: D2 without the alias validates clean', () => {
    const { invalid } = buildVocabularyIndex(withVocabulary(FIXTURE, [act('act_keep', KEEP_20)]))
    expect(invalid).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// S6-010: AC-4-2 (S6 part), X16 and RQ6(a)
// ---------------------------------------------------------------------------

describe('[S6-010] the projection uses the min-id representative and rewrites only different-key slots', () => {
  const two = docOf([
    { n: 1, sys: 'The Door Controller', resp: 'log the event' },
    { n: 2, sys: 'door-controller', resp: 'sound the alarm' },
  ])
  const nonSystems = implicitVocabulary(two).symbols.filter((s) => s.kind !== 'system')

  it('[S6-010] X16 alias `The Door Controller` of `door-controller`: admitted, only that requirement rewritten', () => {
    const doc = withVocabulary(two, [
      ...nonSystems,
      {
        id: 'sys_door',
        kind: 'system',
        canonical: 'door-controller',
        aliases: ['The Door Controller'],
      },
    ])
    const { invalid } = buildVocabularyIndex(doc)
    expect(invalid).toEqual([])
    const projection = buildProjection(doc)
    expect(projection?.unresolved.size).toBe(0)
    expect([...(projection?.rewrites ?? new Map())]).toEqual([
      [rid(1), { systemName: 'door-controller' }],
    ])
  })

  it('[S6-010] X16 the class representative is the minimum id, in either merge direction', () => {
    const systems = implicitVocabulary(two).symbols
    const sysIds = systems.filter((s) => s.kind === 'system').map((s) => s.id)
    expect(sysIds).toHaveLength(2)
    const [lo = '', hi = ''] = [...sysIds].sort()
    for (const merge of [
      { a: lo, b: hi },
      { a: hi, b: lo },
    ]) {
      const { index, invalid } = buildVocabularyIndex(withVocabulary(two, systems, [merge]))
      expect(invalid).toEqual([])
      expect(index.merges).toEqual([merge])
      expect(index.representative.get(hi)).toBe(lo)
      expect(index.representative.get(lo)).toBe(lo)
    }
  })

  it('[S6-010] RQ6(a) same-key spellings resolve to the declared canonical; `The Door Controller` needs an alias', () => {
    const doc = withVocabulary(two, [
      ...nonSystems,
      { id: 'sys_door', kind: 'system', canonical: 'door controller', aliases: [] },
    ])
    const { index } = buildVocabularyIndex(doc)
    expect(index.mode).toBe('explicit')
    for (const text of ['door controller', 'Door Controller', 'door-controller']) {
      expect(resolvePhrase(index, ['system'], text), text).toMatchObject({ id: 'sys_door' })
    }
    expect(resolvePhrase(index, ['system'], 'The Door Controller')).toMatchObject({
      unresolved: true,
    })
  })
})

// ---------------------------------------------------------------------------
// S6-011: AC-4-6 (S6 part), X15
// ---------------------------------------------------------------------------

describe('[S6-011] the validator refuses direct and transitive contrary action merges', () => {
  it('[S6-011] X15 heat/cool: the direct merge is refused V-OPP and no merge is admitted', () => {
    const doc = withVocabulary(
      { ...emptyDocument(), antonyms: [{ a: 'heat', b: 'cool' }] },
      [act('act_heat', 'heat the cabin'), act('act_cool', 'cool the cabin')],
      [{ a: 'act_heat', b: 'act_cool' }],
    )
    const { index, invalid } = buildVocabularyIndex(doc)
    expect(brief(invalid)).toEqual([
      {
        invariant: 'V-OPP',
        dropped: 'merge',
        symbols: ['act_cool', 'act_heat'],
        phrase: undefined,
      },
    ])
    expect(index.merges).toEqual([])
  })

  it('[S6-011] X15 heat~warm admitted, warm~cool refused V-OPP, class representative act_a_heat', () => {
    const doc = withVocabulary(
      {
        ...emptyDocument(),
        antonyms: [
          { a: 'heat', b: 'cool' },
          { a: 'warm', b: 'cool' },
        ],
      },
      [
        act('act_a_heat', 'heat the cabin'),
        act('act_b_warm', 'warm the cabin'),
        act('act_c_cool', 'cool the cabin'),
      ],
      [
        { a: 'act_a_heat', b: 'act_b_warm' },
        { a: 'act_b_warm', b: 'act_c_cool' },
      ],
    )
    const { index, invalid } = buildVocabularyIndex(doc)
    expect(brief(invalid)).toEqual([
      {
        invariant: 'V-OPP',
        dropped: 'merge',
        symbols: ['act_b_warm', 'act_c_cool'],
        phrase: undefined,
      },
    ])
    expect(index.merges).toEqual([{ a: 'act_a_heat', b: 'act_b_warm' }])
    expect(index.representative.get('act_b_warm')).toBe('act_a_heat')
    expect(index.representative.get('act_c_cool')).toBe('act_c_cool')
  })

  it('[S6-011] X15 on the fixture: open+shut and lock+unlock merges are refused V-OPP', () => {
    const minted = implicitVocabulary(FIXTURE).symbols
    for (const [a, b] of [
      ['act_open_the_valve', 'act_shut_the_valve'],
      ['act_lock_the_door', 'act_unlock_the_door'],
    ] as const) {
      const { index, invalid } = buildVocabularyIndex(withVocabulary(FIXTURE, minted, [{ a, b }]))
      expect(
        invalid.map((v) => [v.invariant, v.dropped, v.symbols.join('+')]),
        `${a}+${b}`,
      ).toEqual([['V-OPP', 'merge', [a, b].sort().join('+')]])
      expect(index.merges).toEqual([])
    }
  })
})
