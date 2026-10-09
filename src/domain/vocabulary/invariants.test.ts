/**
 * THE VOCABULARY INVARIANTS (plan 4.3), one validator, pinned invariant by invariant.
 *
 * Every refusal here has a CONTROL beside it: the same shape with the offending piece removed,
 * validated clean. Without the control, a validator that refused everything would pass every
 * test in this file.
 *
 * Property (4) is the soundness claim the projection rests on: rewriting every phrase to its
 * class canonical keeps every contrary pair the author's own phrases had. It is checked on the
 * VALIDATED index, so dropping an invariant from the validator makes it go red on the fixture
 * that invariant exists for.
 */

import { describe, expect, it } from 'vitest'
import { MUTATE_OPTIONS } from '../../app/operations/mutate-options.ts'
import { reportSources } from '../../testing/report-corpus.ts'
import { areContrary } from '../engine/formal/atomize.ts'
import {
  DOC_VERSION_VOCAB,
  emptyDocument,
  type RequirementsDocument,
  type VocabSymbol,
  type Vocabulary,
} from '../requirements/document.ts'
import { buildVocabularyIndex } from './build.ts'
import { frozenTablesDigest, type VocabularyViolation, validateVocabulary } from './invariants.ts'
import { tablesOf } from './keys.ts'
import type { VocabularyIndex } from './resolve.ts'

const docWith = (
  vocabulary: Partial<Vocabulary>,
  tables: Partial<Pick<RequirementsDocument, 'glossary' | 'antonyms' | 'terms'>> = {},
): RequirementsDocument => {
  const base: RequirementsDocument = { ...emptyDocument(), ...tables }
  return {
    ...base,
    docVersion: DOC_VERSION_VOCAB,
    vocabulary: {
      symbols: [],
      merges: [],
      distinct: [],
      frozenTables: { sha256: frozenTablesDigest(base) },
      ...vocabulary,
    },
  }
}

const act = (id: string, canonical: string, aliases: readonly string[] = []): VocabSymbol => ({
  id,
  kind: 'action',
  canonical,
  aliases: [...aliases],
})

const brief = (vs: readonly VocabularyViolation[]) =>
  vs.map((v) => [v.invariant, v.dropped, v.phrase ?? v.symbols.join('+')])

/**
 * Property (4): for every two phrases of two action classes that the engine reads as contraries,
 * the two class canonicals are contraries too; and no class holds two contraries. Returns the
 * phrase pairs that break it.
 */
const atomOf = (doc: RequirementsDocument) => {
  const tables = tablesOf(doc)
  return (text: string) => {
    const a = tables.atomize('resp', text, 'x', false)
    return { name: a.atom, ...(a.opposition !== undefined ? { opposition: a.opposition } : {}) }
  }
}

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

describe('property (4) over the corpus', () => {
  it('keeps every contrary pair of every implicit vocabulary, and the vocabulary has some', () => {
    let pairs = 0
    for (const { label, doc } of reportSources(MUTATE_OPTIONS)) {
      const { index } = buildVocabularyIndex(doc)
      expect(contraryLosses(doc, index), label).toEqual([])
      const atom = atomOf(doc)
      const actions = index.symbols.filter((s) => s.kind === 'action').map((s) => atom(s.canonical))
      for (const a of actions) for (const b of actions) if (areContrary(a, b)) pairs += 1
    }
    // A corpus with no contrary pair would make the assertion above vacuous.
    expect(pairs).toBeGreaterThan(0)
  })
})

describe('a valid vocabulary', () => {
  it('validates clean and keeps every symbol, alias and merge', () => {
    const doc = docWith({
      symbols: [
        {
          id: 'sys_door',
          kind: 'system',
          canonical: 'door controller',
          aliases: ['portal controller'],
        },
        { id: 'sys_car', kind: 'system', canonical: 'car', aliases: [] },
        {
          id: 'sys_car_door',
          kind: 'system',
          canonical: 'car door',
          aliases: [],
          parent: 'sys_car',
        },
        act('act_log', 'log the event', ['logs the event']),
        act('act_record', 'record the event'),
        act('act_open', 'open the valve', ['opens the valve']),
        act('act_close', 'close the valve'),
        {
          id: 'st_moving',
          kind: 'state',
          canonical: 'the train is moving',
          aliases: [],
          variable: 'motion',
          value: 'MOVING',
        },
        {
          id: 'st_rolling',
          kind: 'state',
          canonical: 'the train is rolling',
          aliases: [],
          variable: 'motion',
          value: 'MOVING',
        },
        {
          id: 'qty_dwell',
          kind: 'quantity',
          canonical: 'dwell time',
          aliases: [],
          dimension: 'time',
          unit: 'ms',
          numberType: 'int',
        },
      ],
      merges: [
        { a: 'act_log', b: 'act_record' },
        { a: 'st_moving', b: 'st_rolling' },
      ],
      distinct: [{ a: 'act_open', b: 'act_close', reason: 'opposites' }],
    })
    const { admitted, violations } = validateVocabulary(doc)
    expect(violations).toEqual([])
    expect(admitted).toEqual(doc.vocabulary)
    const { index } = buildVocabularyIndex(doc)
    expect(contraryLosses(doc, index)).toEqual([])
  })
})

describe('V1 — one owner per phrase key per collision domain', () => {
  it('drops the later of two symbols whose canonicals are one atom', () => {
    const { violations, admitted } = validateVocabulary(
      docWith({ symbols: [act('act_a', 'open the valve'), act('act_b', 'opens the valve')] }),
    )
    expect(brief(violations)).toEqual([['V1', 'symbol', 'opens the valve']])
    expect(admitted.symbols.map((s) => s.id)).toEqual(['act_a'])
  })

  it('drops an alias another symbol`s alias already owns', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          act('act_a', 'log it', ['log the entry']),
          act('act_b', 'store it', ['logs the entry']),
        ],
      }),
    )
    expect(brief(violations)).toEqual([['V1', 'alias', 'logs the entry']])
  })

  it('lets a system and an action share a spelling: different domains', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          act('act_a', 'pump'),
          { id: 'sys_a', kind: 'system', canonical: 'pump', aliases: [] },
        ],
      }),
    )
    expect(violations).toEqual([])
  })

  it('refuses a quantity alias the kind-blind glossary would apply to an action beside another', () => {
    // The row `dwell time` <- `keep the door unlocked` is looked up on every slot, so it re-keys
    // the ACTION `keep the door unlocked` onto `dwell time`, the atom `act_dwell` holds: two
    // actions nobody merged would become one.
    const symbols: VocabSymbol[] = [
      {
        id: 'qty_dwell',
        kind: 'quantity',
        canonical: 'dwell time',
        aliases: ['keep the door unlocked'],
        dimension: 'time',
        unit: 'ms',
        numberType: 'int',
      },
      act('act_keep', 'keep the door unlocked'),
      act('act_dwell', 'dwell time'),
    ]
    expect(brief(validateVocabulary(docWith({ symbols })).violations)).toEqual([
      ['V1', 'alias', 'keep the door unlocked'],
    ])
    // Control: re-keying the one action alone renames its atom and merges nothing, and the
    // quantity its occurrence performs moves with it, so no reading changes.
    expect(validateVocabulary(docWith({ symbols: symbols.slice(0, 2) })).violations).toEqual([])
    expect(validateVocabulary(docWith({ symbols: symbols.slice(0, 1) })).violations).toEqual([])
  })
})

describe('V2 — aliases are one hop', () => {
  it('drops an alias that is another symbol`s canonical', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          act('act_a', 'log the event'),
          act('act_b', 'record the event', ['log the event']),
        ],
      }),
    )
    expect(brief(violations)).toEqual([['V2', 'alias', 'log the event']])
  })
})

describe('V-OPP — every phrase of a class opposes what its canonical opposes', () => {
  it('drops `shut the valve` as an alias of `seal the valve` (the seal/shut fixture)', () => {
    // `shut` is committed opposite `open`; `seal` is in another class altogether. Rewriting
    // `shut the valve` to `seal the valve` would lose its contrary with `open the valve`.
    const doc = docWith(
      {
        symbols: [
          act('act_seal', 'seal the valve', ['shut the valve']),
          act('act_open', 'open the valve'),
        ],
      },
      { antonyms: [{ a: 'open', b: 'shut' }] },
    )
    // Property (4) first: it is the claim, and the violation list below is how it is kept.
    expect(contraryLosses(doc, buildVocabularyIndex(doc).index)).toEqual([])
    expect(brief(validateVocabulary(doc).violations)).toEqual([
      ['V-OPP', 'alias', 'shut the valve'],
    ])
  })

  it('admits the alias while no phrase is its contrary: a refusal is for what the rewrite does', () => {
    // `shut` has open's class and `seal` none, but with no `open` phrase declared or used, the
    // rewrite loses no contrary pair. The fixture above is the same alias beside `open the valve`.
    const doc = docWith(
      { symbols: [act('act_seal', 'seal the valve', ['shut the valve'])] },
      { antonyms: [{ a: 'open', b: 'shut' }] },
    )
    expect(validateVocabulary(doc).violations).toEqual([])
  })

  it('drops an alias whose own contrary the canonical does not share (close/shut/unbar)', () => {
    // `close` and `shut` sit on one side of one class, so their key and polarity agree. Only
    // `shut` is paired with `unbar`, so rewriting `shut the gate` to `close the gate` would lose
    // its contrary with `unbar the gate`. A key-and-polarity comparison alone admits this.
    const doc = docWith(
      {
        symbols: [
          act('act_close', 'close the gate', ['shut the gate']),
          act('act_unbar', 'unbar the gate'),
        ],
      },
      {
        antonyms: [
          { a: 'open', b: 'shut' },
          { a: 'unbar', b: 'shut' },
        ],
      },
    )
    expect(contraryLosses(doc, buildVocabularyIndex(doc).index)).toEqual([])
    expect(brief(validateVocabulary(doc).violations)).toEqual([['V-OPP', 'alias', 'shut the gate']])
  })

  it('refuses to merge `heat the cabin` and `cool the cabin`, registered contraries (AC-4-6)', () => {
    const doc = docWith(
      {
        symbols: [act('act_heat', 'heat the cabin'), act('act_cool', 'cool the cabin')],
        merges: [{ a: 'act_heat', b: 'act_cool' }],
      },
      { antonyms: [{ a: 'heat', b: 'cool' }] },
    )
    expect(contraryLosses(doc, buildVocabularyIndex(doc).index)).toEqual([])
    const { violations, admitted } = validateVocabulary(doc)
    expect(brief(violations)).toEqual([['V-OPP', 'merge', 'act_cool+act_heat']])
    expect(admitted.merges).toEqual([])
  })

  it('refuses the same merge made transitively, through a symbol on heat`s side', () => {
    const doc = docWith(
      {
        symbols: [
          act('act_a_heat', 'heat the cabin'),
          act('act_b_warm', 'warm the cabin'),
          act('act_c_cool', 'cool the cabin'),
        ],
        merges: [
          { a: 'act_a_heat', b: 'act_b_warm' },
          { a: 'act_b_warm', b: 'act_c_cool' },
        ],
      },
      {
        antonyms: [
          { a: 'heat', b: 'cool' },
          { a: 'warm', b: 'cool' },
        ],
      },
    )
    expect(contraryLosses(doc, buildVocabularyIndex(doc).index)).toEqual([])
    const { violations, admitted } = validateVocabulary(doc)
    expect(brief(violations)).toEqual([['V-OPP', 'merge', 'act_b_warm+act_c_cool']])
    expect(admitted.merges).toEqual([{ a: 'act_a_heat', b: 'act_b_warm' }])
  })
})

describe('V-NUM — every phrase of a class carries its canonical`s numeric predicates', () => {
  it('drops `at most 25 C` as an alias of `at most 20 C`', () => {
    const doc = docWith({
      symbols: [
        act('act_keep', 'keep the cabin temperature at most 20 C', [
          'keep the cabin temperature at most 25 C',
        ]),
      ],
    })
    expect(brief(validateVocabulary(doc).violations)).toEqual([
      ['V-NUM', 'alias', 'keep the cabin temperature at most 25 C'],
    ])
  })

  it('refuses a merge across two numerals, and admits one across two spellings of one bound', () => {
    const symbols = [
      act('act_a', 'respond within 200 ms'),
      act('act_b', 'respond within 300 ms'),
      act('act_c', 'reply within 200 ms'),
      act('act_d', 'respond within 0.2 s'),
    ]
    const refused = validateVocabulary(docWith({ symbols, merges: [{ a: 'act_a', b: 'act_b' }] }))
    expect(brief(refused.violations)).toEqual([['V-NUM', 'merge', 'act_a+act_b']])
    // Same comparator and value, different label: the label is part of what is compared, because
    // the rewrite moves the bound onto the canonical's quantity.
    const relabel = validateVocabulary(docWith({ symbols, merges: [{ a: 'act_a', b: 'act_c' }] }))
    expect(brief(relabel.violations)).toEqual([['V-NUM', 'merge', 'act_a+act_c']])
    // Control: `0.2 s` is `200 ms` to the numeric tier, on the same label, so the two are one bound.
    const control = validateVocabulary(docWith({ symbols, merges: [{ a: 'act_a', b: 'act_d' }] }))
    expect(control.violations).toEqual([])
    expect(control.admitted.merges).toEqual([{ a: 'act_a', b: 'act_d' }])
  })

  it('compares the qualifier: `… 20 C now` is not `… 20 C`', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          act('act_a', 'keep the cabin temperature at most 20 C', [
            'keep the cabin temperature at most 20 C now',
          ]),
        ],
      }),
    )
    expect(brief(violations)).toEqual([
      ['V-NUM', 'alias', 'keep the cabin temperature at most 20 C now'],
    ])
  })
})

describe('V-KIND and V-STATE — a class is one kind, and one state value', () => {
  it('refuses a merge across kinds', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          act('act_pump', 'run the pump'),
          { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
        ],
        merges: [{ a: 'act_pump', b: 'sys_pump' }],
      }),
    )
    expect(brief(violations)).toEqual([['V-KIND', 'merge', 'act_pump+sys_pump']])
  })

  it('refuses a merge of two states naming different values of one variable', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          {
            id: 'st_moving',
            kind: 'state',
            canonical: 'the train is moving',
            aliases: [],
            variable: 'motion',
            value: 'MOVING',
          },
          {
            id: 'st_stopped',
            kind: 'state',
            canonical: 'the train is stopped',
            aliases: [],
            variable: 'motion',
            value: 'STOPPED',
          },
        ],
        merges: [{ a: 'st_moving', b: 'st_stopped' }],
      }),
    )
    expect(brief(violations)).toEqual([['V-STATE', 'merge', 'st_moving+st_stopped']])
  })

  it('refuses a distinct record across kinds', () => {
    const { violations, admitted } = validateVocabulary(
      docWith({
        symbols: [
          act('act_pump', 'run the pump'),
          { id: 'sys_pump', kind: 'system', canonical: 'pump', aliases: [] },
        ],
        distinct: [{ a: 'act_pump', b: 'sys_pump', reason: 'different things' }],
      }),
    )
    expect(brief(violations)).toEqual([['V-KIND', 'distinct', 'act_pump+sys_pump']])
    expect(admitted.distinct).toEqual([])
  })
})

describe('V-PARENT — parents exist, are systems, and form no cycle', () => {
  const sys = (id: string, parent?: string): VocabSymbol => ({
    id,
    kind: 'system',
    canonical: id.replace(/^sys_/, '').replace(/_/g, ' '),
    aliases: [],
    ...(parent !== undefined ? { parent } : {}),
  })

  it('drops a parent that is missing, or not a system', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          sys('sys_door', 'sys_missing'),
          sys('sys_gate', 'act_run'),
          act('act_run', 'run'),
        ],
      }),
    )
    expect(brief(violations)).toEqual([
      ['V-PARENT', 'parent', 'sys_door'],
      ['V-PARENT', 'parent', 'sys_gate'],
    ])
  })

  it('breaks a part-of cycle at its first symbol', () => {
    const { violations, admitted } = validateVocabulary(
      docWith({ symbols: [sys('sys_a', 'sys_b'), sys('sys_b', 'sys_a'), sys('sys_c', 'sys_a')] }),
    )
    expect(brief(violations)).toEqual([['V-PARENT', 'parent', 'sys_a']])
    expect(admitted.symbols.map((s) => [s.id, 'parent' in s ? s.parent : undefined])).toEqual([
      ['sys_a', undefined],
      ['sys_b', 'sys_a'],
      ['sys_c', 'sys_a'],
    ])
  })

  it('refuses to merge two systems with different parents', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [
          sys('sys_front'),
          sys('sys_rear'),
          sys('sys_front_door', 'sys_front'),
          sys('sys_rear_door', 'sys_rear'),
        ],
        merges: [{ a: 'sys_front_door', b: 'sys_rear_door' }],
      }),
    )
    expect(brief(violations)).toEqual([['V-PARENT', 'merge', 'sys_front_door+sys_rear_door']])
  })
})

describe('V-REF and V-DISTINCT — merges name declared symbols, and never a distinct pair', () => {
  it('drops a merge or a distinct record naming an undeclared symbol', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [act('act_a', 'log it')],
        merges: [{ a: 'act_a', b: 'act_gone' }],
        distinct: [{ a: 'act_a', b: 'act_other', reason: 'x' }],
      }),
    )
    expect(brief(violations)).toEqual([
      ['V-REF', 'merge', 'act_a+act_gone'],
      ['V-REF', 'distinct', 'act_a+act_other'],
    ])
  })

  it('refuses a merge that would unite a pair stated distinct, even transitively', () => {
    const { violations } = validateVocabulary(
      docWith({
        symbols: [act('act_a', 'log it'), act('act_b', 'record it'), act('act_c', 'store it')],
        merges: [
          { a: 'act_a', b: 'act_b' },
          { a: 'act_b', b: 'act_c' },
        ],
        distinct: [{ a: 'act_a', b: 'act_c', reason: 'different stores' }],
      }),
    )
    expect(brief(violations)).toEqual([['V-DISTINCT', 'merge', 'act_b+act_c']])
  })
})

describe('V-FROZEN — the glossary and terms stay as they were when the vocabulary was adopted', () => {
  it('reports a glossary edited after the digest was taken', () => {
    const doc = docWith({ symbols: [act('act_a', 'log it')] })
    const edited = { ...doc, glossary: [{ canonical: 'log it', aliases: ['record it'] }] }
    expect(brief(validateVocabulary(edited).violations)).toEqual([['V-FROZEN', 'nothing', '']])
    expect(validateVocabulary(doc).violations).toEqual([])
  })

  it('reads an absent digest as the digest of empty tables', () => {
    const doc = docWith({ symbols: [act('act_a', 'log it')] })
    const { frozenTables: _drop, ...vocabulary } = doc.vocabulary as Vocabulary
    const bare = { ...doc, vocabulary }
    expect(validateVocabulary(bare).violations).toEqual([])
    expect(
      brief(
        validateVocabulary({ ...bare, terms: [{ canonical: 'entry', aliases: ['record'] }] })
          .violations,
      ),
    ).toEqual([['V-FROZEN', 'nothing', '']])
  })

  it('is a digest of the tables` content, independent of key order', () => {
    const a = { ...emptyDocument(), glossary: [{ canonical: 'x', aliases: ['y'] }] }
    const b = { ...emptyDocument(), glossary: [{ aliases: ['y'], canonical: 'x' }] }
    expect(frozenTablesDigest(a)).toBe(frozenTablesDigest(b))
    expect(frozenTablesDigest(a)).not.toBe(frozenTablesDigest(emptyDocument()))
    expect(frozenTablesDigest(a)).toMatch(/^[0-9a-f]{64}$/)
  })
})
