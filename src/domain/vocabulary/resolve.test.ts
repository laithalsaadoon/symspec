/**
 * THE RESOLUTION CHOKEPOINT — the partition argument (AC-4-1, AC-4-2), pinned as properties.
 *
 * The projection that later slices build on (`compat.toEngineDoc`) is sound only if the symbol
 * partition is never FINER than the engine's atom partition: a slot pair that shares an atom today
 * must share a symbol, or rewriting one of them to its class canonical splits an atom and deletes a
 * finding. So every property here is checked against the atoms the engine ITSELF produces
 * (`encodeIncluded`, the encoding `check` evaluates) and the quantity keys its numeric reader
 * produces (`requirementBounds`), never against a second derivation of them in this file.
 *
 * The corpora are the report corpus (the red-team rounds, the fabrication fixtures, every gaming
 * baseline and control) plus the generated ladder. They are real documents, and real documents
 * rarely spell one phrase two ways, so a corpus-only property would pass on the same-key path for
 * a coincidence (plan R1). The constructed fixtures below supply the multi-spelling classes:
 * inflection, article and case variants, unit case, a committed glossary.
 */

import { describe, expect, it } from 'vitest'
import { MUTATE_OPTIONS } from '../../app/operations/mutate-options.ts'
import { asRequirementsDocument } from '../../testing/eval-rounds.ts'
import { generateCases } from '../../testing/generate.ts'
import { reportSources } from '../../testing/report-corpus.ts'
import { toEngineDoc } from '../compat.ts'
import { normalizeScope } from '../engine/formal/atomize.ts'
import { requirementBounds } from '../engine/formal/numeric.ts'
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
import { KIND_PREFIX, mintSymbolIds } from './ids.ts'
import { implicitVocabulary, renderVocabularyOps, type VocabDeclaration } from './implicit.ts'
import { frozenTablesDigest } from './invariants.ts'
import { phraseKey, quantityLabelKey, tablesOf } from './keys.ts'
import { buildProjection } from './projection.ts'
import {
  bindingOf,
  buildVocabularyIndex,
  type RequirementBinding,
  resolvePhrase,
  resolveRequirement,
} from './resolve.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let serial = 0
const uuid = (): string => `00000000-0000-4000-8000-${(++serial).toString(16).padStart(12, '0')}`

type Slots = Pick<Requirement, 'systemName' | 'systemResponse'> &
  Partial<Pick<Requirement, 'patternType' | 'trigger' | 'preCondition' | 'negated' | 'key'>> &
  Partial<Pick<Requirement, 'sentence' | 'intentRef' | 'derived' | 'priority'>>

const req = (slots: Slots): Requirement => ({
  id: uuid(),
  patternType: slots.patternType ?? 'ubiquitous',
  systemName: slots.systemName,
  systemResponse: slots.systemResponse,
  negated: slots.negated ?? false,
  sentence: slots.sentence ?? `The ${slots.systemName} shall ${slots.systemResponse}.`,
  priority: slots.priority ?? 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...(slots.key !== undefined ? { key: slots.key } : {}),
  ...(slots.trigger !== undefined ? { trigger: slots.trigger } : {}),
  ...(slots.preCondition !== undefined ? { preCondition: slots.preCondition } : {}),
  ...(slots.intentRef !== undefined ? { intentRef: slots.intentRef } : {}),
  ...(slots.derived !== undefined ? { derived: slots.derived } : {}),
})

const docOf = (
  requirements: readonly Requirement[],
  tables: Partial<Pick<RequirementsDocument, 'glossary' | 'antonyms' | 'terms'>> = {},
): RequirementsDocument => ({
  ...emptyDocument(),
  ...tables,
  requirements: Object.fromEntries(requirements.map((r) => [r.id, r])),
})

/**
 * The test's stand-in for the `vocab` fold (slice S7): each declaration becomes a symbol, and
 * the tables are recorded as frozen at this moment. Deliberately naive — it validates nothing,
 * so everything the round trip asserts is asserted by `buildVocabularyIndex`.
 */
const declare = (
  doc: RequirementsDocument,
  ops: readonly VocabDeclaration[],
): RequirementsDocument => ({
  ...doc,
  docVersion: DOC_VERSION_VOCAB,
  vocabulary: {
    symbols: ops.map((op): VocabSymbol => {
      const { op: _verb, ...symbol } = op
      return { aliases: [], ...symbol } as VocabSymbol
    }),
    merges: [],
    distinct: [],
    frozenTables: { sha256: frozenTablesDigest(doc) },
  },
})

/** A document with a hand-written vocabulary and the tables frozen as they stand. */
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

// ---------------------------------------------------------------------------
// The corpus
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

/**
 * Property (1), coarser-or-equal: every two slots the engine gives ONE atom are bound to one
 * symbol, and every two bounds it gives one quantity key to one quantity symbol. Returns the
 * violations, each naming the atom and the two symbol sets, so a failure reads as a diff.
 *
 * Grouped per collision domain. An optional-feature precondition is a `feature` and a
 * state-driven one a `state`: the propositional encoder names both in the `guard` namespace, so
 * they can share an atom while being two symbols by design. What keeps THAT pair sound is the
 * cross-domain rewrite rule in `invariants.ts`, pinned there, not a merged namespace here.
 */
const partitionViolations = (doc: RequirementsDocument): string[] => {
  const { index } = buildVocabularyIndex(doc)
  const bound = new Map<string, Set<string>>()
  const note = (key: string, symbols: string) => {
    const set = bound.get(key) ?? new Set<string>()
    set.add(symbols)
    bound.set(key, set)
  }
  const bindings = new Map<string, RequirementBinding>()
  for (const r of Object.values(doc.requirements)) {
    const b = bindingOf(index, r)
    if (b !== undefined) bindings.set(r.id, b)
  }
  for (const enc of encodeIncluded(toEngineDoc(doc))) {
    const b = bindings.get(enc.id)
    const r = doc.requirements[enc.id]
    if (b === undefined || r === undefined) return [`${enc.id} did not resolve`]
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
  }
  for (const r of Object.values(doc.requirements)) {
    const b = bindings.get(r.id)
    if (b === undefined) continue
    const labels = b.quantities.map((q) => q.label)
    const keys = requirementBounds(r, tablesOf(doc).glossary)
      .map((x) => x.predicate)
      .filter((p) => p.label.trim() !== '')
      .map((p) => p.quantity)
    // One binding per bound the reader returns, in its order: the binding is what the drift
    // comparison reads, so a bound it dropped would be a bound drift cannot see.
    if (labels.length !== keys.length) return [`${r.id}: ${labels.length} of ${keys.length} bounds`]
    for (const [i, k] of keys.entries()) note(`quantity\t${k}`, `${b.system}/${labels[i]}`)
  }
  return [...bound]
    .filter(([, symbols]) => symbols.size > 1)
    .map(([key, symbols]) => `${key}\t${[...symbols].sort().join(' | ')}`)
}

describe('the implicit vocabulary over the corpus', () => {
  const docs = corpus()

  it('is non-vacuous: every corpus contributes documents with requirements', () => {
    // DERIVED floors, not typed ones: the sources own the numbers.
    expect(docs.length).toBe(
      reportSources(MUTATE_OPTIONS).length +
        LADDER_TIERS.reduce((n, t) => n + generateCases(t, 0).length, 0),
    )
    for (const prefix of ['eval-rounds/', 'fabrication/', 'gaming/', 'generated-t4/']) {
      expect(
        docs.some((d) => d.label.startsWith(prefix)),
        prefix,
      ).toBe(true)
    }
    expect(docs.every((d) => Object.keys(d.doc.requirements).length > 0)).toBe(true)
  })

  it('is valid and resolves every requirement of every document', () => {
    const problems: string[] = []
    for (const { label, doc } of docs) {
      const { index, invalid } = buildVocabularyIndex(doc)
      expect(index.mode, label).toBe('implicit')
      for (const v of invalid) problems.push(`${label}: ${v.invariant} ${v.detail}`)
      for (const r of Object.values(doc.requirements)) {
        const res = resolveRequirement(index, r)
        if ('unresolved' in res) {
          problems.push(`${label}: ${res.unresolved.map((u) => `${u.slot}=${u.text}`).join(', ')}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('(1) never binds two slots the engine gives one atom to two symbols', () => {
    const violations = docs.flatMap(({ label, doc }) =>
      partitionViolations(doc).map((v) => `${label}\t${v}`),
    )
    expect(violations).toEqual([])
  })

  it('(2) declaring its rendered op stream yields the same index', () => {
    for (const { label, doc } of docs) {
      const implicit = buildVocabularyIndex(doc)
      const declared = declare(doc, renderVocabularyOps(implicitVocabulary(doc)))
      const explicit = buildVocabularyIndex(declared)
      expect(explicit.index.mode, label).toBe('explicit')
      expect(explicit.invalid, label).toEqual([])
      expect(explicit.index.symbols, label).toEqual(implicit.index.symbols)
      for (const r of Object.values(doc.requirements)) {
        // Equal bindings on both sides are what make the opt-in PR drift-free (F9).
        expect(bindingOf(explicit.index, r), `${label} ${r.key ?? r.id}`).toEqual(
          bindingOf(implicit.index, r),
        )
      }
    }
  })

  it('(3) mints only ids every scope and quantity normalizer leaves unchanged', () => {
    let minted = 0
    for (const { label, doc } of docs) {
      for (const s of implicitVocabulary(doc).symbols) {
        minted += 1
        expect(s.id, label).toMatch(SYMBOL_ID_PATTERN)
        expect(s.id.length, label).toBeLessThanOrEqual(64)
        expect(normalizeScope(s.id), label).toBe(s.id)
        expect(quantityLabelKey(s.id, new Map()), label).toBe(s.id)
        expect(s.id.startsWith(`${KIND_PREFIX[s.kind]}_`), label).toBe(true)
      }
    }
    expect(minted).toBeGreaterThan(docs.length)
  })

  it('keys a quantity label exactly as the numeric tier keys its bound', () => {
    // `quantityLabelKey` restates the numeric tier's private label transform. This pins the
    // restatement against the tier's own output on every bound in the corpus, glossary applied.
    let bounds = 0
    for (const { label, doc } of docs) {
      const glossary = tablesOf(doc).glossary
      for (const r of Object.values(doc.requirements)) {
        for (const { predicate: p } of requirementBounds(r, glossary)) {
          bounds += 1
          const prefix = `sys__${normalizeScope(r.systemName)}__qty__`
          expect(`${prefix}${quantityLabelKey(p.label, glossary)}`, label).toBe(p.quantity)
        }
      }
    }
    expect(bounds).toBeGreaterThan(0)
  })

  it('is a function of the requirement SET, not of its order', () => {
    for (const { label, doc } of docs) {
      const reversed = {
        ...doc,
        requirements: Object.fromEntries(Object.entries(doc.requirements).reverse()),
      }
      expect(implicitVocabulary(reversed), label).toEqual(implicitVocabulary(doc))
    }
  })
})

// ---------------------------------------------------------------------------
// Constructed multi-spelling fixtures (plan R1)
// ---------------------------------------------------------------------------

const symbolsOfKind = (doc: RequirementsDocument, kind: SymbolKind) =>
  implicitVocabulary(doc).symbols.filter((s) => s.kind === kind)

describe('the implicit vocabulary on multi-spelling fixtures', () => {
  it('gives an inflected head and its lemma ONE action symbol, because they are one atom', () => {
    const doc = docOf([
      req({ systemName: 'pump controller', systemResponse: 'opens the valve' }),
      req({ systemName: 'pump controller', systemResponse: 'open the valve', negated: true }),
    ])
    expect(symbolsOfKind(doc, 'action')).toEqual([
      {
        id: 'act_open_the_valve',
        kind: 'action',
        canonical: 'open the valve',
        aliases: ['opens the valve'],
      },
    ])
    expect(partitionViolations(doc)).toEqual([])
  })

  it('keeps `A Gateway` and `Gateway` two systems, because the scope keeps the article', () => {
    const doc = docOf([
      req({ systemName: 'A Gateway', systemResponse: 'grant access' }),
      req({ systemName: 'Gateway', systemResponse: 'revoke access' }),
    ])
    expect(symbolsOfKind(doc, 'system').map((s) => [s.id, s.canonical])).toEqual([
      ['sys_a_gateway', 'A Gateway'],
      ['sys_gateway', 'Gateway'],
    ])
    expect(partitionViolations(doc)).toEqual([])
  })

  it('gives two spellings of one system one symbol, the more frequent one canonical', () => {
    const doc = docOf([
      req({ systemName: 'Door Controller', systemResponse: 'lock the door' }),
      req({ systemName: 'door controller', systemResponse: 'unlock the door' }),
      req({ systemName: 'door controller', systemResponse: 'log the event' }),
    ])
    expect(symbolsOfKind(doc, 'system')).toEqual([
      {
        id: 'sys_door_controller',
        kind: 'system',
        canonical: 'door controller',
        aliases: ['Door Controller'],
      },
    ])
    expect(partitionViolations(doc)).toEqual([])
  })

  it('folds an article variant of a guard into one symbol, and the copula with it', () => {
    const doc = docOf([
      req({
        patternType: 'state-driven',
        preCondition: 'the train is moving',
        systemName: 'door controller',
        systemResponse: 'keep the doors closed',
      }),
      req({
        patternType: 'event-driven',
        trigger: 'train moving',
        systemName: 'door controller',
        systemResponse: 'sound the alarm',
      }),
    ])
    // One guard atom, one symbol; a state, because a precondition use needs one.
    expect(symbolsOfKind(doc, 'state').map((s) => [s.canonical, s.aliases])).toEqual([
      ['the train is moving', ['train moving']],
    ])
    expect(symbolsOfKind(doc, 'event')).toEqual([])
    expect(partitionViolations(doc)).toEqual([])
  })

  it('keeps `MW` and `mW` apart: after a number the unit case is the identity', () => {
    const doc = docOf([
      req({ systemName: 'inverter', systemResponse: 'limit the output to at most 5 MW' }),
      req({ systemName: 'inverter', systemResponse: 'limit the output to at most 5 mW' }),
      req({ systemName: 'inverter', systemResponse: 'limit the output to at most 5 MW' }),
    ])
    const actions = symbolsOfKind(doc, 'action')
    expect(actions.map((s) => s.canonical).sort()).toEqual([
      'limit the output to at most 5 MW',
      'limit the output to at most 5 mW',
    ])
    expect(new Set(actions.map((s) => s.id)).size).toBe(2)
    expect(partitionViolations(doc)).toEqual([])
  })

  it('follows a committed glossary: two phrases it names one atom are one symbol', () => {
    const doc = docOf(
      [
        req({ systemName: 'auth service', systemResponse: 'issue a session token' }),
        req({
          systemName: 'auth service',
          systemResponse: 'issue a login credential',
          negated: true,
        }),
      ],
      { glossary: [{ canonical: 'issue a session token', aliases: ['issue a login credential'] }] },
    )
    expect(symbolsOfKind(doc, 'action').map((s) => [s.canonical, s.aliases])).toEqual([
      ['issue a login credential', ['issue a session token']],
    ])
    expect(partitionViolations(doc)).toEqual([])
  })

  it('binds a response through its stored negator, as the encoder reads it', () => {
    const plain = req({ systemName: 'pump', systemResponse: 'open the valve' })
    const handAuthored = req({ systemName: 'pump', systemResponse: 'not open the valve' })
    const doc = docOf([plain, handAuthored])
    const { index } = buildVocabularyIndex(doc)
    expect(bindingOf(index, handAuthored)).toEqual({ ...bindingOf(index, plain), negated: true })
    expect(partitionViolations(doc)).toEqual([])
  })

  it('binds a slot carrying a bound both as a whole phrase and through its label', () => {
    const r = req({
      systemName: 'door controller',
      systemResponse: 'keep the door unlocked for at most 30 seconds',
    })
    const doc = docOf([
      r,
      req({ systemName: 'door controller', systemResponse: 'keep the door unlocked' }),
    ])
    const { index } = buildVocabularyIndex(doc)
    const b = bindingOf(index, r)
    expect(b?.response).toBe('act_keep_the_door_unlocked_for_at_most_30_seconds')
    expect(b?.quantities).toEqual([
      {
        label: 'qty_keep_the_door_unlocked',
        comparator: '<=',
        value: '30000/1',
        unit: 'ms',
        dimension: 'time',
        slot: 'resp',
      },
    ])
    expect(symbolsOfKind(doc, 'quantity')).toEqual([
      {
        id: 'qty_keep_the_door_unlocked',
        kind: 'quantity',
        canonical: 'keep the door unlocked',
        aliases: [],
        dimension: 'time',
        unit: 'ms',
        numberType: 'int',
      },
    ])
    expect(partitionViolations(doc)).toEqual([])
  })

  it('reads an optional-feature precondition as a feature, a state-driven one as a state', () => {
    const doc = docOf([
      req({
        patternType: 'optional-feature',
        preCondition: 'the heater is installed',
        systemName: 'hvac',
        systemResponse: 'heat the cabin',
      }),
      req({
        patternType: 'state-driven',
        preCondition: 'the heater is installed',
        systemName: 'hvac',
        systemResponse: 'log the mode',
      }),
    ])
    expect(symbolsOfKind(doc, 'feature').map((s) => s.id)).toEqual(['feat_heater_installed'])
    expect(symbolsOfKind(doc, 'state').map((s) => s.id)).toEqual(['st_heater_installed'])
  })
})

// ---------------------------------------------------------------------------
// Minting (plan 2.1)
// ---------------------------------------------------------------------------

describe('mintSymbolIds', () => {
  it('slugs the phrase key under the kind prefix', () => {
    expect([...mintSymbolIds('action', ['open_the_valve'])]).toEqual([
      ['open_the_valve', 'act_open_the_valve'],
    ])
    expect([...mintSymbolIds('system', ['c#_compiler'])]).toEqual([
      ['c#_compiler', 'sys_c_compiler'],
    ])
  })

  it('suffixes collisions `_2`, `_3` in phrase-key order, whatever order the keys arrive in', () => {
    const keys = ['valve_β', 'valve', 'valve_α']
    const expected = [
      ['valve', 'act_valve'],
      ['valve_α', 'act_valve_2'],
      ['valve_β', 'act_valve_3'],
    ]
    expect([...mintSymbolIds('action', keys)].sort()).toEqual(expected)
    expect([...mintSymbolIds('action', [...keys].reverse())].sort()).toEqual(expected)
  })

  it('skips a suffix a real key already mints', () => {
    const minted = new Map(mintSymbolIds('action', ['valve', 'valve_2', 'valve_α']))
    expect(minted.get('valve_2')).toBe('act_valve_2')
    expect(minted.get('valve_α')).toBe('act_valve_3')
  })

  it('falls back to a digest for a key with no Latin slug, or one too long for an id', () => {
    const [[, arabic]] = [...mintSymbolIds('system', ['العربية'])] as [[string, string]]
    expect(arabic).toMatch(/^sys_h[0-9a-f]{10}$/)
    const long = 'a'.repeat(70)
    const [[, id]] = [...mintSymbolIds('quantity', [long])] as [[string, string]]
    expect(id).toMatch(/^qty_h[0-9a-f]{10}$/)
    for (const minted of [arabic, id]) {
      expect(minted).toMatch(SYMBOL_ID_PATTERN)
      expect(normalizeScope(minted)).toBe(minted)
    }
  })
})

// ---------------------------------------------------------------------------
// Resolution against a declared vocabulary
// ---------------------------------------------------------------------------

const DOOR: readonly VocabSymbol[] = [
  {
    id: 'sys_door_controller',
    kind: 'system',
    canonical: 'door controller',
    aliases: ['the door controller unit'],
  },
  { id: 'act_open_the_door', kind: 'action', canonical: 'open the door', aliases: [] },
  {
    id: 'act_log_the_event',
    kind: 'action',
    canonical: 'log the event',
    aliases: ['record the event'],
  },
  { id: 'act_close_the_door', kind: 'action', canonical: 'close the door', aliases: [] },
  { id: 'act_close_the_hatch', kind: 'action', canonical: 'close the hatch', aliases: [] },
  { id: 'evt_button_pressed', kind: 'event', canonical: 'the button is pressed', aliases: [] },
]

describe('resolvePhrase', () => {
  const { index, invalid } = buildVocabularyIndex(withVocabulary(docOf([]), DOOR))

  it('declares a valid vocabulary with no violation (the control for every refusal)', () => {
    expect(invalid).toEqual([])
    expect(index.mode).toBe('explicit')
  })

  it('resolves a canonical, an alias, and a spelling that shares a key with one', () => {
    expect(resolvePhrase(index, ['action'], 'open the door')).toEqual({
      id: 'act_open_the_door',
      via: 'canonical',
    })
    expect(resolvePhrase(index, ['action'], 'record the event')).toEqual({
      id: 'act_log_the_event',
      via: 'alias',
    })
    expect(resolvePhrase(index, ['action'], 'opens the door')).toEqual({
      id: 'act_open_the_door',
      via: 'canonical',
    })
    expect(resolvePhrase(index, ['system'], 'Door Controller')).toEqual({
      id: 'sys_door_controller',
      via: 'canonical',
    })
  })

  it('never binds a phrase to a symbol of a kind the slot does not take', () => {
    const r = resolvePhrase(index, ['state'], 'the button is pressed')
    expect('unresolved' in r).toBe(true)
  })

  it('refuses an undeclared phrase and ranks the nearest symbols, without binding one', () => {
    const r = resolvePhrase(index, ['action'], 'close the doors')
    expect(r).toEqual({
      unresolved: true,
      candidates: [
        { id: 'act_close_the_door', canonical: 'close the door' },
        { id: 'act_close_the_hatch', canonical: 'close the hatch' },
      ],
    })
    expect('id' in r).toBe(false)
  })

  it('reports every unresolved slot of a requirement, and binds none of them', () => {
    const r = req({
      patternType: 'event-driven',
      trigger: 'the lever is pulled',
      systemName: 'door controller',
      systemResponse: 'close the doors',
    })
    const res = resolveRequirement(index, r)
    expect('unresolved' in res && res.unresolved.map((u) => [u.slot, u.kinds])).toEqual([
      ['trigger', ['event', 'state']],
      ['systemResponse', ['action']],
    ])
    expect(bindingOf(index, r)).toBeUndefined()
  })
})

describe('bindingOf', () => {
  it('reads no sentence, intentRef, derived, key or priority', () => {
    const doc = withVocabulary(docOf([]), DOOR)
    const { index } = buildVocabularyIndex(doc)
    const a = req({ systemName: 'door controller', systemResponse: 'open the door' })
    const b = req({
      systemName: 'door controller',
      systemResponse: 'open the door',
      sentence: 'Something else entirely.',
      intentRef: 'INT-1',
      key: 'REQ-7',
      priority: 'high',
    })
    const c = req({ systemName: 'door controller', systemResponse: 'open the door', derived: true })
    expect(bindingOf(index, b)).toEqual(bindingOf(index, a))
    expect(bindingOf(index, c)).toEqual(bindingOf(index, a))
    expect(bindingOf(index, a)).toEqual({
      patternType: 'ubiquitous',
      negated: false,
      system: 'sys_door_controller',
      response: 'act_open_the_door',
      quantities: [],
    })
  })
})

// ---------------------------------------------------------------------------
// The projection (the classes and the rewrite later slices read)
// ---------------------------------------------------------------------------

describe('buildProjection', () => {
  it('skips a legacy document entirely', () => {
    expect(
      buildProjection(docOf([req({ systemName: 'pump', systemResponse: 'run' })])),
    ).toBeUndefined()
  })

  const symbols: readonly VocabSymbol[] = [
    {
      id: 'sys_door_controller',
      kind: 'system',
      canonical: 'door controller',
      aliases: ['portal controller'],
    },
    { id: 'act_b_log', kind: 'action', canonical: 'log the event', aliases: ['logs the event'] },
    { id: 'act_a_record', kind: 'action', canonical: 'record the event', aliases: [] },
  ]
  const r1 = req({ systemName: 'door controller', systemResponse: 'logs the event' })
  const r2 = req({ systemName: 'portal controller', systemResponse: 'not log the event' })
  const r3 = req({ systemName: 'door controller', systemResponse: 'record the event' })

  it('represents a class by its minimum id, whichever way the merge was written', () => {
    for (const merge of [
      { a: 'act_b_log', b: 'act_a_record' },
      { a: 'act_a_record', b: 'act_b_log' },
    ]) {
      const p = buildProjection(withVocabulary(docOf([r1, r2, r3]), symbols, [merge]))
      expect(p?.invalid).toEqual([])
      expect(p?.representative.get('act_b_log')).toBe('act_a_record')
      expect(p?.canonicalOf('act_b_log')).toBe('record the event')
    }
  })

  it('rewrites only a slot whose key differs from its class canonical, and keeps a stored negator', () => {
    const p = buildProjection(
      withVocabulary(docOf([r1, r2, r3]), symbols, [{ a: 'act_b_log', b: 'act_a_record' }]),
    )
    expect(p?.rewrites.get(r1.id)).toEqual({ systemResponse: 'record the event' })
    expect(p?.rewrites.get(r2.id)).toEqual({
      systemName: 'door controller',
      systemResponse: 'not record the event',
    })
    expect(p?.rewrites.has(r3.id)).toBe(false)
    expect(p?.unresolved.size).toBe(0)
  })

  it('leaves a spelling that shares its canonical`s key verbatim — the identity for a bootstrap', () => {
    const p = buildProjection(withVocabulary(docOf([r1, r3]), symbols))
    expect(p?.rewrites.size).toBe(0)
  })

  it('reports an unresolved slot and rewrites nothing for it', () => {
    const stray = req({ systemName: 'door controller', systemResponse: 'close the door' })
    const p = buildProjection(withVocabulary(docOf([stray]), symbols))
    expect(p?.unresolved.get(stray.id)?.map((u) => u.slot)).toEqual(['systemResponse'])
    expect(p?.rewrites.has(stray.id)).toBe(false)
  })

  it('synthesizes a quantity alias row for every phrase of a quantity class the rewrite would change', () => {
    const q: readonly VocabSymbol[] = [
      {
        id: 'qty_a_dwell',
        kind: 'quantity',
        canonical: 'dwell time',
        aliases: ['the dwell time'],
        dimension: 'time',
        unit: 'ms',
        numberType: 'int',
      },
      {
        id: 'qty_b_stop',
        kind: 'quantity',
        canonical: 'stop duration',
        aliases: [],
        dimension: 'time',
        unit: 'ms',
        numberType: 'int',
      },
    ]
    const p = buildProjection(withVocabulary(docOf([]), q, [{ a: 'qty_b_stop', b: 'qty_a_dwell' }]))
    expect(p?.quantityAliases).toEqual([{ canonical: 'dwell time', aliases: ['stop duration'] }])
  })
})

describe('phraseKey', () => {
  it('is the atomizer`s body for guards and actions, and the scope for systems', () => {
    const t = tablesOf(emptyDocument())
    expect(phraseKey('action', 'Opens the Valve', t)).toBe('open_the_valve')
    expect(phraseKey('guard', 'the train is moving', t)).toBe('train_moving')
    expect(phraseKey('system', 'The Door Controller', t)).toBe('the_door_controller')
    expect(phraseKey('system', 'door-controller', t)).toBe('door_controller')
  })
})
