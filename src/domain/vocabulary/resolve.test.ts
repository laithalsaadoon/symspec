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

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { MUTATE_OPTIONS } from '../../app/operations/mutate-options.ts'
import { SolverService } from '../../ports/solver.ts'
import { asRequirementsDocument } from '../../testing/eval-rounds.ts'
import { generateCases } from '../../testing/generate.ts'
import { reportSources } from '../../testing/report-corpus.ts'
import { toEngineDoc } from '../compat.ts'
import { normalizeScope } from '../engine/formal/atomize.ts'
import { quantityKey, requirementBounds } from '../engine/formal/numeric.ts'
import { encodeIncluded, runCheck } from '../engine/pipeline/check.ts'
import {
  DOC_VERSION_VOCAB,
  emptyDocument,
  type Requirement,
  type RequirementsDocument,
  SYMBOL_ID_PATTERN,
  type SymbolKind,
  type VocabSymbol,
  vocabularyOf,
} from '../requirements/document.ts'
import { renderSentence } from '../requirements/render.ts'
import { buildProjection, buildVocabularyIndex } from './build.ts'
import { KIND_PREFIX, mintSymbolIds } from './ids.ts'
import { implicitVocabulary, renderVocabularyOps, type VocabDeclaration } from './implicit.ts'
import { frozenTablesDigest } from './invariants.ts'
import { phraseKey, tablesOf } from './keys.ts'
import { projectedDocument, projectVocabulary } from './projection.ts'
import {
  bindingOf,
  indexVocabulary,
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
 * outcome check in `invariants.ts` (the projection must read the JOIN of today's atoms and the
 * declared classes), pinned there, not a merged namespace here.
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
        expect(phraseKey('quantity', s.id, tablesOf(emptyDocument())), label).toBe(s.id)
        expect(s.id.startsWith(`${KIND_PREFIX[s.kind]}_`), label).toBe(true)
      }
    }
    expect(minted).toBeGreaterThan(docs.length)
  })

  it('keys a quantity label exactly as the numeric tier keys its bound', () => {
    // The quantity phrase key IS the tier's `quantityKey` less its scope prefix; this pins that
    // the prefix is the only difference, on every bound in the corpus, glossary applied.
    let bounds = 0
    for (const { label, doc } of docs) {
      const tables = tablesOf(doc)
      for (const r of Object.values(doc.requirements)) {
        for (const { predicate: p } of requirementBounds(r, tables.glossary)) {
          bounds += 1
          const prefix = quantityKey(r.systemName, '')
          expect(`${prefix}${phraseKey('quantity', p.label, tables)}`, label).toBe(p.quantity)
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

// ---------------------------------------------------------------------------
// The projection preserves what the engine reads, over every spelling a class resolves
// ---------------------------------------------------------------------------

/** The document the projection hands the engine: `projectedDocument`, the one S8 threads. */
const projected = (doc: RequirementsDocument): RequirementsDocument => {
  const p = buildProjection(doc)
  return p === undefined ? doc : projectedDocument(doc, p)
}

const codesOf = (doc: RequirementsDocument): Promise<ReadonlySet<string>> =>
  Effect.runPromise(
    Effect.flatMap(SolverService, (solver) =>
      Effect.flatMap(solver.boot, () =>
        Effect.promise(() => runCheck(toEngineDoc(doc), { strict: true })),
      ),
    ).pipe(Effect.provide(solverServiceLayer)),
  ).then((report) => new Set(report.findings.map((f) => f.code)))

const boundsOf = (doc: RequirementsDocument) =>
  Object.values(doc.requirements).map((r) =>
    requirementBounds(
      {
        id: r.id,
        patternType: r.patternType,
        systemName: r.systemName,
        systemResponse: r.systemResponse,
        negated: r.negated,
        sentence: r.sentence,
        priority: r.priority,
        status: r.status,
      },
      new Map(),
    ).map(({ predicate }) => [predicate.label, predicate.comparator, predicate.value]),
  )

const brief = (doc: RequirementsDocument) =>
  (buildVocabularyIndex(doc).invalid ?? []).map((v) => [
    v.invariant,
    v.dropped,
    v.phrase ?? v.symbols.join('+'),
  ])

describe('V-NUM over every spelling a class resolves, not only the declared ones', () => {
  // `at-most` and `at most` are one action key, but only the second is a bound: phrase-key
  // equality does not imply equal bounds. A merge of `keep the level at-most 5 m`
  // into `maintain the reservoir` would rewrite R1 and delete the bound its conflict with R2 rests on.
  const level: readonly VocabSymbol[] = [
    { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
    { id: 'act_a', kind: 'action', canonical: 'maintain the reservoir', aliases: [] },
    { id: 'act_b', kind: 'action', canonical: 'keep the level at-most 5 m', aliases: [] },
    { id: 'act_c', kind: 'action', canonical: 'keep the level at least 10 m', aliases: [] },
    {
      id: 'qty_keep_the_level',
      kind: 'quantity',
      canonical: 'keep the level',
      aliases: [],
      dimension: 'distance',
      unit: 'm',
      numberType: 'int',
    },
  ]
  const r1 = req({ systemName: 'pump', systemResponse: 'keep the level at most 5 m' })
  const r2 = req({ systemName: 'pump', systemResponse: 'keep the level at least 10 m' })
  const merge = { a: 'act_a', b: 'act_b' }

  it('refuses a merge that would rewrite a document spelling onto other bounds', async () => {
    const doc = withVocabulary(docOf([r1, r2]), level, [merge])
    expect(brief(doc)).toEqual([['V-NUM', 'merge', 'act_a+act_b']])
    const p = buildProjection(doc)
    expect(p?.unresolved.size).toBe(0)
    expect(p?.rewrites.has(r1.id)).toBe(false)
    expect(boundsOf(projected(doc))).toEqual(boundsOf(doc))
    expect(await codesOf(doc)).toContain('FND_NUMERIC_CONTRADICTION')
    expect(await codesOf(projected(doc))).toContain('FND_NUMERIC_CONTRADICTION')
  })

  it('refuses it too when the same-key spelling is a declared alias, with no requirement using it', () => {
    const aliased = level.map((s) =>
      s.id === 'act_b' ? { ...s, aliases: ['keep the level at most 5 m'] } : s,
    )
    expect(brief(withVocabulary(docOf([]), aliased, [merge]))).toEqual([
      ['V-NUM', 'merge', 'act_a+act_b'],
    ])
  })

  it('drops an alias through which a document spelling with other bounds would be rewritten', () => {
    // The alias itself carries no bound, like its canonical; the spelling R1 resolves through it does.
    const symbols: readonly VocabSymbol[] = [
      { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
      {
        id: 'act_a',
        kind: 'action',
        canonical: 'maintain the reservoir',
        aliases: ['keep the level at-most 5 m'],
      },
    ]
    const withLevel = [...symbols, ...level.filter((s) => s.kind === 'quantity')]
    const doc = withVocabulary(docOf([r1]), withLevel)
    expect(brief(doc)).toEqual([['V-NUM', 'alias', 'keep the level at-most 5 m']])
    expect(buildProjection(doc)?.rewrites.has(r1.id)).toBe(false)
    // With no quantity declared, R1 resolves nothing it bounds, so it is not rewritten at all,
    // and with no requirement nothing reads a bound: the alias is admitted either way.
    expect(brief(withVocabulary(docOf([r1]), symbols))).toEqual([])
    expect(buildProjection(withVocabulary(docOf([r1]), symbols))?.unresolved.has(r1.id)).toBe(true)
    expect(brief(withVocabulary(docOf([]), symbols))).toEqual([])
  })

  it('admits the merge when every spelling it rewrites keeps its bounds (the control)', () => {
    // No bound and no declared quantity is on `keep the level` here. With one (R2, or
    // qty_keep_the_level), the bare response's occurrence of that quantity is read too,
    // and the merge is refused: `V-NUM reads the action occurrences…` below.
    const steady = level.map((s) =>
      s.id === 'act_b' ? { ...s, canonical: 'keep the level steady' } : s,
    )
    const unbounded = req({ systemName: 'pump', systemResponse: 'keeps the level steady' })
    const actions = steady.filter((s) => s.kind !== 'quantity' && s.id !== 'act_c')
    const doc = withVocabulary(docOf([unbounded]), actions, [merge])
    expect(brief(doc)).toEqual([])
    expect(brief(withVocabulary(docOf([unbounded, r2]), steady, [merge]))).toEqual([
      ['V-NUM', 'merge', 'act_a+act_b'],
    ])
    expect(buildProjection(doc)?.rewrites.get(unbounded.id)).toEqual({
      systemResponse: 'maintain the reservoir',
    })
  })

  it('refuses it when the spelling it rewrites states a quantity no bound reads (V-READ)', () => {
    // `at-most` is no comparator, so `5 m` is read by no bound and disclosed as
    // FND_NUMERIC_UNCOMPARED; rewriting the response to `maintain the reservoir` deletes the
    // disclosure, which nothing the vocabulary says implies.
    const unbounded = req({ systemName: 'pump', systemResponse: 'keep the level at-most 5 m' })
    const actions = level.filter((s) => s.kind !== 'quantity' && s.id !== 'act_c')
    const doc = withVocabulary(docOf([unbounded]), actions, [merge])
    expect(brief(doc)).toEqual([['V-READ', 'merge', 'act_a+act_b']])
    expect(buildProjection(doc)?.rewrites.has(unbounded.id)).toBe(false)
  })
})

describe('V1 — a rewritten quantity alias names no guard or action slot', () => {
  const trig = (trigger: string, negated = false) => {
    const r = req({
      patternType: 'event-driven',
      systemName: 'pump controller',
      trigger,
      systemResponse: 'open the valve',
      negated,
    })
    return { ...r, sentence: renderSentence(r) }
  }
  const base: readonly VocabSymbol[] = [
    { id: 'sys_pump', kind: 'system', canonical: 'pump controller', aliases: [] },
    { id: 'act_open', kind: 'action', canonical: 'open the valve', aliases: [] },
  ]
  const qty = (canonical: string, aliases: readonly string[]): VocabSymbol => ({
    id: 'qty_psi',
    kind: 'quantity',
    canonical,
    aliases: [...aliases],
    dimension: 'none',
    unit: '',
    numberType: 'int',
  })

  it('refuses the alias a document trigger normalizes to, and keeps the contradiction it carried', async () => {
    const r1 = trig('pressure high')
    const r2 = trig('the pressure is high', true)
    const symbols = [
      ...base,
      { id: 'st_pressure_high', kind: 'state', canonical: 'the pressure is high', aliases: [] },
      qty('psi', ['pressure high']),
    ] as const satisfies readonly VocabSymbol[]
    const doc = withVocabulary(docOf([r1, r2]), symbols)
    expect(brief(doc)).toEqual([['V1', 'alias', 'pressure high']])
    expect(buildProjection(doc)?.quantityAliases).toEqual([])
    expect(await codesOf(doc)).toContain('FND_CONTRADICTION')
    expect(await codesOf(projected(doc))).toContain('FND_CONTRADICTION')
  })

  it('admits a quantity key equal to a guard key while no slot reads it: the key alone is not a hazard', () => {
    const symbols = [
      ...base,
      { id: 'st_pressure_high', kind: 'state', canonical: 'the pressure is high', aliases: [] },
      qty('psi', ['pressure high']),
    ] as const satisfies readonly VocabSymbol[]
    expect(brief(withVocabulary(docOf([]), symbols))).toEqual([])
  })

  it('refuses a glossary key a document slot has, when no declared phrase and no guard key has it', () => {
    // `pressure was high` resolves to the state by its guard key (the copula is stripped), but
    // its quantity key keeps `was`, and no declared phrase normalizes to it. The kind-blind row
    // re-keys that trigger alone, off the atom `pressure high` still holds.
    const symbols = [
      ...base,
      { id: 'st_pressure_high', kind: 'state', canonical: 'pressure high', aliases: [] },
      qty('supply pressure', ['pressure was high']),
    ] as const satisfies readonly VocabSymbol[]
    const doc = withVocabulary(
      docOf([trig('pressure was high'), trig('pressure high', true)]),
      symbols,
    )
    expect(brief(doc)).toEqual([['V1', 'alias', 'pressure was high']])
    // Control: with no slot spelled that way, the alias is admitted.
    expect(brief(withVocabulary(docOf([trig('pressure high')]), symbols))).toEqual([])
    expect(brief(withVocabulary(docOf([]), symbols))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The quantity rows, the action occurrences and the polarity the projection hands the engine
// ---------------------------------------------------------------------------

const quantity = (
  id: string,
  canonical: string,
  aliases: readonly string[] = [],
  dimension: 'distance' | 'time' = 'distance',
  unit = 'm',
): VocabSymbol => ({
  id,
  kind: 'quantity',
  canonical,
  aliases: [...aliases],
  dimension,
  unit,
  numberType: 'int',
})
const action = (id: string, canonical: string, aliases: readonly string[] = []): VocabSymbol => ({
  id,
  kind: 'action',
  canonical,
  aliases: [...aliases],
})

/** Each requirement's bound quantity keys, as the numeric tier keys them under the doc's glossary. */
const quantityKeysOf = (doc: RequirementsDocument) =>
  Object.values(doc.requirements).map((r) =>
    requirementBounds(r, tablesOf(doc).glossary).map(({ predicate }) => predicate.quantity),
  )

describe('a quantity class rewrites every label the engine keys into it, and no other', () => {
  // `keep the level` and `keep the level%` are one quantity key (the tier folds `%` away), but
  // the glossary a row is synthesized into is looked up on `normalize`, which keeps `%`.
  const r1 = req({ systemName: 'pump', systemResponse: 'keep the level at most 5 m' })
  const r2 = req({ systemName: 'pump', systemResponse: 'keep the level% at least 10 m' })
  const base: readonly VocabSymbol[] = [
    { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
    action('act_b', 'keep the level at most 5 m'),
    action('act_c', 'keep the level% at least 10 m'),
  ]

  it('synthesizes a row for a document label a merge resolves into the class, so the class is not split', async () => {
    const doc = withVocabulary(
      docOf([r1, r2]),
      [...base, quantity('qty_a', 'hold the depth'), quantity('qty_b', 'keep the level')],
      [{ a: 'qty_a', b: 'qty_b' }],
    )
    expect(brief(doc)).toEqual([])
    expect(buildProjection(doc)?.quantityAliases).toEqual([
      { canonical: 'hold the depth', aliases: ['keep the level', 'keep the level%'] },
    ])
    expect(quantityKeysOf(projected(doc))).toEqual([
      ['sys__pump__qty__hold_the_depth'],
      ['sys__pump__qty__hold_the_depth'],
    ])
    expect(await codesOf(doc)).toContain('FND_NUMERIC_CONTRADICTION')
    expect(await codesOf(projected(doc))).toContain('FND_NUMERIC_CONTRADICTION')
  })

  it('does the same for a document label that resolves through a declared alias', async () => {
    const doc = withVocabulary(docOf([r1, r2]), [
      ...base,
      quantity('qty_a', 'hold the depth', ['keep the level']),
    ])
    expect(brief(doc)).toEqual([])
    expect(quantityKeysOf(projected(doc))).toEqual([
      ['sys__pump__qty__hold_the_depth'],
      ['sys__pump__qty__hold_the_depth'],
    ])
    expect(await codesOf(projected(doc))).toContain('FND_NUMERIC_CONTRADICTION')
  })

  it('drops an alias whose row would capture the labels of another quantity symbol', async () => {
    // `a keep the level` keeps its article as a quantity key, so V1 alone sees two quantities;
    // `normalize` strips it, so its row is looked up on `keep_the_level`, qty_y's labels.
    const depth = req({ systemName: 'pump', systemResponse: 'keep the depth at least 10 m' })
    const doc = withVocabulary(docOf([r1, depth]), [
      { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
      action('act_b', 'keep the level at most 5 m'),
      action('act_c', 'keep the depth at least 10 m'),
      quantity('qty_x', 'keep the depth', ['a keep the level']),
      quantity('qty_y', 'keep the level'),
    ])
    expect(brief(doc)).toEqual([['V-NUM', 'alias', 'a keep the level']])
    expect(buildProjection(doc)?.quantityAliases).toEqual([])
    expect(await codesOf(doc)).not.toContain('FND_NUMERIC_CONTRADICTION')
    expect(await codesOf(projected(doc))).not.toContain('FND_NUMERIC_CONTRADICTION')
    // With qty_y only declared, no response's occurrences move either: the row captures the
    // declared label alone, and that is enough, so the refusal is stable as requirements are added.
    expect(
      brief(
        withVocabulary(docOf([depth]), [
          { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
          action('act_c', 'keep the depth at least 10 m'),
          quantity('qty_x', 'keep the depth', ['a keep the level']),
          quantity('qty_y', 'keep the level'),
        ]),
      ),
    ).toEqual([['V-NUM', 'alias', 'a keep the level']])
    // Control: with no other quantity spelled `keep the level`, the alias is admitted.
    expect(
      brief(
        withVocabulary(docOf([depth]), [
          { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
          action('act_c', 'keep the depth at least 10 m'),
          quantity('qty_x', 'keep the depth', ['a keep the level']),
        ]),
      ),
    ).toEqual([])
  })

  it('refuses a merge whose rows would capture another quantity`s labels', () => {
    const depth = req({ systemName: 'pump', systemResponse: 'keep the depth at least 10 m' })
    const doc = withVocabulary(
      docOf([r1, depth]),
      [
        { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
        action('act_b', 'keep the level at most 5 m'),
        action('act_c', 'keep the depth at least 10 m'),
        quantity('qty_w', 'keep the depth'),
        quantity('qty_x', 'a keep the level'),
        quantity('qty_y', 'keep the level'),
      ],
      [{ a: 'qty_w', b: 'qty_x' }],
    )
    expect(brief(doc)).toEqual([['V-NUM', 'merge', 'qty_w+qty_x']])
    expect(buildProjection(doc)?.quantityAliases).toEqual([])
    // The same with no requirement at all: the declared label is what the row captures.
    const declared = withVocabulary(
      docOf([]),
      [
        quantity('qty_w', 'keep the depth'),
        quantity('qty_x', 'a keep the level'),
        quantity('qty_y', 'keep the level'),
      ],
      [{ a: 'qty_w', b: 'qty_x' }],
    )
    expect(brief(declared)).toEqual([['V-NUM', 'merge', 'qty_w+qty_x']])
  })

  it('drops an alias whose row lands its labels on a key other than the canonical`s', async () => {
    // The engine lands a row's labels on `normalize` of its canonical, and `normalize` strips
    // the article `a level` keeps as a quantity key: the row would move `the depth` onto
    // `level`, another quantity's key, and fabricate a conflict nobody declared.
    const deep = req({ systemName: 'pump', systemResponse: 'the depth at most 5 m' })
    const level = req({ systemName: 'pump', systemResponse: 'level at least 10 m' })
    const doc = withVocabulary(docOf([deep, level]), [
      { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
      action('act_b', 'the depth at most 5 m'),
      action('act_c', 'level at least 10 m'),
      quantity('qty_a', 'a level', ['the depth']),
      quantity('qty_b', 'level'),
    ])
    expect(brief(doc)).toEqual([['V-NUM', 'alias', 'the depth']])
    expect(await codesOf(doc)).not.toContain('FND_NUMERIC_CONTRADICTION')
    expect(await codesOf(projected(doc))).not.toContain('FND_NUMERIC_CONTRADICTION')
    // With no requirement, no occurrence or other label moves; the landing key alone refuses it.
    expect(
      brief(
        withVocabulary(docOf([]), [
          quantity('qty_a', 'a level', ['the depth']),
          quantity('qty_b', 'level'),
        ]),
      ),
    ).toEqual([['V-NUM', 'alias', 'the depth']])
  })

  it('refuses a row a bound-free response`s occurrence would be split from', async () => {
    // The bounds are read on `keep the door unlocked`, which the row covers. The bare response
    // `keep the door unlocked%` does the same action on the same quantity key (the tier folds
    // `%` away), but it is looked up on `normalize`, which keeps `%`, so no row covers it.
    // Rewriting the bounds alone would part them from the occurrence the prohibitions conflict on.
    const p1 = req({
      systemName: 'door controller',
      systemResponse: 'keep the door unlocked above 30 seconds',
      negated: true,
    })
    const p2 = req({
      systemName: 'door controller',
      systemResponse: 'keep the door unlocked below 40 seconds',
      negated: true,
    })
    const bare = req({ systemName: 'door controller', systemResponse: 'keep the door unlocked%' })
    const doc = withVocabulary(docOf([p1, p2, bare]), [
      { id: 'sys_dc', kind: 'system', canonical: 'door controller', aliases: [] },
      action('act_a', 'keep the door unlocked%'),
      action('act_b', 'keep the door unlocked above 30 seconds'),
      action('act_c', 'keep the door unlocked below 40 seconds'),
      quantity('qty_k', 'hold time', ['keep the door unlocked'], 'time', 's'),
    ])
    expect(await codesOf(doc)).toContain('FND_NUMERIC_CONTRADICTION')
    expect(brief(doc)).toEqual([['V-NUM', 'alias', 'keep the door unlocked']])
    expect(await codesOf(projected(doc))).toContain('FND_NUMERIC_CONTRADICTION')
  })
})

describe('V-NUM reads the action occurrences a bound-free response hands the numeric tier', () => {
  const p1 = req({
    systemName: 'door controller',
    systemResponse: 'keep the door unlocked above 30 seconds',
    negated: true,
  })
  const p2 = req({
    systemName: 'door controller',
    systemResponse: 'keep the door unlocked below 40 seconds',
    negated: true,
  })
  const bare = req({ systemName: 'door controller', systemResponse: 'keep the door unlocked' })
  const base: readonly VocabSymbol[] = [
    { id: 'sys_dc', kind: 'system', canonical: 'door controller', aliases: [] },
    action('act_b', 'keep the door unlocked above 30 seconds'),
    action('act_c', 'keep the door unlocked below 40 seconds'),
    quantity('qty_k', 'keep the door unlocked', [], 'time', 'ms'),
  ]

  it('drops an alias that would rewrite the response off the occurrence two prohibitions share', async () => {
    const doc = withVocabulary(docOf([p1, p2, bare]), [
      ...base,
      action('act_a', 'hold the door open', ['keep the door unlocked']),
    ])
    expect(await codesOf(doc)).toContain('FND_NUMERIC_CONTRADICTION')
    expect(brief(doc)).toEqual([['V-NUM', 'alias', 'keep the door unlocked']])
    expect(buildProjection(doc)?.rewrites.has(bare.id)).toBe(false)
    expect(await codesOf(projected(doc))).toContain('FND_NUMERIC_CONTRADICTION')
  })

  it('refuses the merge form', () => {
    const doc = withVocabulary(
      docOf([p1, p2, bare]),
      [...base, action('act_a', 'hold the door open'), action('act_d', 'keep the door unlocked')],
      [{ a: 'act_a', b: 'act_d' }],
    )
    expect(brief(doc)).toEqual([['V-NUM', 'merge', 'act_a+act_d']])
  })

  it('admits the alias when no bound or quantity names an occurrence it moves (the control)', () => {
    const doc = withVocabulary(docOf([bare]), [
      { id: 'sys_dc', kind: 'system', canonical: 'door controller', aliases: [] },
      action('act_a', 'hold the door open', ['keep the door unlocked']),
    ])
    expect(brief(doc)).toEqual([])
    expect(buildProjection(doc)?.rewrites.get(bare.id)).toEqual({
      systemResponse: 'hold the door open',
    })
  })
})

describe('V-OPP refuses an action phrase the encoder reads as negated', () => {
  const ev = (negated: boolean) => {
    const r = req({
      patternType: 'event-driven',
      systemName: 'controller',
      trigger: 'the door opens',
      systemResponse: 'log the event',
      negated,
    })
    return { ...r, sentence: renderSentence(r) }
  }
  const r1 = ev(false)
  const r2 = ev(true)
  const base: readonly VocabSymbol[] = [
    { id: 'sys_ctl', kind: 'system', canonical: 'controller', aliases: [] },
    { id: 'ev_0', kind: 'event', canonical: 'the door opens', aliases: [] },
  ]

  it('drops an alias rewritten onto a canonical with a leading negator, so no rewrite flips a polarity', async () => {
    const doc = withVocabulary(docOf([r1, r2]), [
      ...base,
      action('act_log', 'never log the event', ['log the event']),
    ])
    expect(brief(doc)).toEqual([['V-OPP', 'alias', 'log the event']])
    expect(buildProjection(doc)?.rewrites.size).toBe(0)
    expect(await codesOf(doc)).toContain('FND_CONTRADICTION')
    expect(await codesOf(projected(doc))).toContain('FND_CONTRADICTION')
  })

  it('refuses the merge form', () => {
    const doc = withVocabulary(
      docOf([r1, r2]),
      [...base, action('act_a', 'never log the event'), action('act_b', 'log the event')],
      [{ a: 'act_a', b: 'act_b' }],
    )
    expect(brief(doc)).toEqual([['V-OPP', 'merge', 'act_a+act_b']])
    expect(buildProjection(doc)?.rewrites.size).toBe(0)
  })

  it('keeps a negator canonical nothing is rewritten to: it only names its own spelling', () => {
    const doc = withVocabulary(docOf([r1]), [
      ...base,
      action('act_log', 'log the event'),
      action('act_never', 'never log the event'),
    ])
    expect(brief(doc)).toEqual([])
  })

  it('admits an alias with a leading negator: a slot reads it as its polarity, and never rewrites it', () => {
    // `does not log the event` in a response is `log the event` negated (the encoder strips the
    // negator into the polarity), which keys as the canonical and is left verbatim. Nothing is
    // rewritten through the alias, so no polarity can flip.
    const doc = withVocabulary(docOf([r1]), [
      ...base,
      action('act_log', 'log the event', ['does not log the event']),
    ])
    expect(brief(doc)).toEqual([])
    expect(buildProjection(doc)?.rewrites.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// An action or guard rewrite hands the numeric tier a label of its own
// ---------------------------------------------------------------------------

describe('a rewrite that changes how a bound label is spelled keeps the quantity partition', () => {
  // Each fixture rewrites R1's response while R2, of the same system, is a similarity pair the
  // model's cosine gates: the validator refuses the rewrite for that (`readers.ts`, the cosine is
  // not the text's to change), whatever the quantity rows do. So the rows are measured here on the
  // projection the declaration WOULD give, unvalidated, which is what the validator measures a
  // candidate on: the refusal is the cosine's, and the rows are right.
  const pump = { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] } as const
  const unvalidated = (doc: RequirementsDocument) => {
    const projection = projectVocabulary(
      doc,
      indexVocabulary(vocabularyOf(doc), tablesOf(doc), 'explicit'),
    )
    return { projection, document: projectedDocument(doc, projection) }
  }
  const keysAfter = (doc: RequirementsDocument) => [
    ...new Set(quantityKeysOf(unvalidated(doc).document).flat()),
  ]
  const cosineRefusal = (doc: RequirementsDocument) =>
    buildVocabularyIndex(doc).invalid.filter((v) => /rests on the embedding/.test(v.detail))

  it('keeps one quantity when an action alias respells its label (`level%` -> `level`)', async () => {
    const r1 = req({ systemName: 'pump', systemResponse: 'keep the level% at most 5 m' })
    const r2 = req({ systemName: 'pump', systemResponse: 'keep the level% at least 10 m' })
    const doc = withVocabulary(docOf([r1, r2]), [
      pump,
      action('act_b', 'keep the level at most 5 m', ['keep the level% at most 5 m']),
      action('act_c', 'keep the level% at least 10 m'),
      quantity('qty_a', 'hold the depth', ['keep the level%']),
    ])
    expect(await codesOf(doc)).toContain('FND_NUMERIC_CONTRADICTION')
    // The row splits R1 from R2 in the similarity tier's reading, which then reads R1's rewritten
    // words: it is the entry refused.
    expect(brief(doc)).toEqual([['V-READ', 'alias', 'keep the level%']])
    expect(cosineRefusal(doc)).toHaveLength(1)
    // The row covers the label the rewrite hands the tier.
    const { projection, document } = unvalidated(doc)
    expect(projection.rewrites.get(r1.id)).toEqual({ systemResponse: 'keep the level at most 5 m' })
    expect(projection.quantityAliases).toEqual([
      { canonical: 'hold the depth', aliases: ['keep the level', 'keep the level%'] },
    ])
    expect(keysAfter(doc)).toHaveLength(1)
    expect(await codesOf(document)).toContain('FND_NUMERIC_CONTRADICTION')
  })

  it('keeps it in the merge form', async () => {
    const r1 = req({ systemName: 'pump', systemResponse: 'keep the level% at most 5 m' })
    const r2 = req({ systemName: 'pump', systemResponse: 'keep the level% at least 10 m' })
    const doc = withVocabulary(
      docOf([r1, r2]),
      [
        pump,
        action('act_a', 'keep the level at most 5 m'),
        action('act_b', 'keep the level% at most 5 m'),
        action('act_c', 'keep the level% at least 10 m'),
        quantity('qty_a', 'hold the depth'),
        quantity('qty_b', 'keep the level%'),
      ],
      [
        { a: 'act_a', b: 'act_b' },
        { a: 'qty_a', b: 'qty_b' },
      ],
    )
    expect(brief(doc)).toEqual([['V-READ', 'merge', 'act_a+act_b']])
    expect(cosineRefusal(doc)).toHaveLength(1)
    expect(keysAfter(doc)).toHaveLength(1)
    expect(await codesOf(unvalidated(doc).document)).toContain('FND_NUMERIC_CONTRADICTION')
  })

  it('keeps one quantity when the canonical carries the `%` (`level` -> `level%`), on either bound', async () => {
    for (const [rewritten, other] of [
      ['at most 5 m', 'at least 10 m'],
      ['at least 10 m', 'at most 5 m'],
    ] as const) {
      const r1 = req({ systemName: 'pump', systemResponse: `keep the level ${rewritten}` })
      const r2 = req({ systemName: 'pump', systemResponse: `keep the level ${other}` })
      const alias = withVocabulary(docOf([r1, r2]), [
        pump,
        action('act_b', `keep the level% ${rewritten}`, [`keep the level ${rewritten}`]),
        action('act_c', `keep the level ${other}`),
        quantity('qty_a', 'hold the depth', ['keep the level']),
      ])
      const merge = withVocabulary(
        docOf([r1, r2]),
        [
          pump,
          action('act_a', `keep the level% ${rewritten}`),
          action('act_b', `keep the level ${rewritten}`),
          action('act_c', `keep the level ${other}`),
          quantity('qty_a', 'hold the depth'),
          quantity('qty_b', 'keep the level'),
        ],
        [
          { a: 'act_a', b: 'act_b' },
          { a: 'qty_a', b: 'qty_b' },
        ],
      )
      for (const doc of [alias, merge]) {
        expect(await codesOf(doc)).toContain('FND_NUMERIC_CONTRADICTION')
        expect(cosineRefusal(doc), rewritten).toHaveLength(1)
        expect(unvalidated(doc).projection.rewrites.has(r1.id), rewritten).toBe(true)
        expect(keysAfter(doc), rewritten).toHaveLength(1)
        expect(await codesOf(unvalidated(doc).document), rewritten).toContain(
          'FND_NUMERIC_CONTRADICTION',
        )
      }
    }
  })

  it('never lets a row capture the label an action rewrite hands the tier', async () => {
    // The rewrite gives R1 the label `keep the level`, which `a keep the level`, qty_x's alias,
    // is looked up on: the row would join R1's bound to R2's, two quantities no author merged.
    // The probe of act_b's canonical hands the tier the same label, so the row is refused even
    // with the rewrite itself refused for the cosine.
    const r1 = req({ systemName: 'pump', systemResponse: 'keep the level% at most 5 m' })
    const r2 = req({ systemName: 'pump', systemResponse: 'keep the depth at least 10 m' })
    const doc = withVocabulary(docOf([r1, r2]), [
      pump,
      action('act_b', 'keep the level at most 5 m', ['keep the level% at most 5 m']),
      action('act_c', 'keep the depth at least 10 m'),
      quantity('qty_x', 'keep the depth', ['a keep the level']),
      quantity('qty_y', 'keep the level%'),
    ])
    expect(await codesOf(doc)).not.toContain('FND_NUMERIC_CONTRADICTION')
    expect(brief(doc)).toEqual([
      ['V-READ', 'alias', 'keep the level% at most 5 m'],
      ['V-NUM', 'alias', 'a keep the level'],
    ])
    // The refusal names the labels it would have joined: the probe's, R1 being left as written.
    expect(
      buildVocabularyIndex(doc)
        .invalid.filter((v) => v.invariant === 'V-NUM')
        .map((v) => v.colliding),
    ).toEqual([['keep the level', 'keep the depth']])
    // Unvalidated, the row joins the two quantities; admitted, they stay two.
    expect(keysAfter(doc)).toHaveLength(1)
    expect([...new Set(quantityKeysOf(projected(doc)).flat())]).toHaveLength(2)
    expect(await codesOf(projected(doc))).not.toContain('FND_NUMERIC_CONTRADICTION')
  })
})

describe('a rewrite keeps the guard implications a response establishes', () => {
  const state = (preCondition: string, systemResponse: string) => {
    const r = req({
      patternType: 'state-driven',
      systemName: 'reactor',
      preCondition,
      systemResponse,
    })
    return { ...r, sentence: renderSentence(r) }
  }
  // R1 establishes `the reactor online` (a `keep` bridge), which R2 guards on.
  const r1 = state('the coolant is flowing', 'keep the reactor online')
  const r2 = state('the reactor is online', 'open the vent')
  const symbols: readonly VocabSymbol[] = [
    { id: 'sys_reactor', kind: 'system', canonical: 'reactor', aliases: [] },
    { id: 'st_flowing', kind: 'state', canonical: 'the coolant is flowing', aliases: [] },
    { id: 'st_online', kind: 'state', canonical: 'the reactor is online', aliases: [] },
    action('act_vent', 'open the vent'),
    action('act_run', 'run the reactor', ['keep the reactor online']),
  ]

  it('drops an alias that rewrites a bridge away, though no atom or bound moves', () => {
    expect(brief(withVocabulary(docOf([r1, r2]), symbols))).toEqual([
      ['V-OPP', 'alias', 'keep the reactor online'],
    ])
    // Control: with no requirement guarded on the state, the bridge is inert either way.
    const alone = withVocabulary(
      docOf([r1]),
      symbols.filter((s) => s.id !== 'st_online'),
    )
    expect(brief(alone)).toEqual([])
    expect(buildProjection(alone)?.rewrites.get(r1.id)).toEqual({
      systemResponse: 'run the reactor',
    })
  })
})
