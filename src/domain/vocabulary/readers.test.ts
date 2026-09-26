/**
 * THE TEXT READERS — every tier that reads a slot's words, not only its atom, is measured too.
 *
 * `outcome.ts` compares what the decide tier reads (atoms, polarity, contraries, bounds,
 * occurrences, bridges). The propose and disclosure tiers read more than that: the opposition
 * tier reads a response's verb and object, the relational tier its comparison words and the
 * normalized guard it groups on, the lint tier the sentence the slots render, and so on. A slot
 * rewrite that keeps every atom can still change what those tiers read, and so change the
 * verdict: a lost disclosure is a lost demotion, and `verified` goes to true over a document the
 * declared partition says nothing about (S6-D3).
 *
 * Each fixture here is measured on the engine itself, with the semantic tier run (the
 * orthogonal embedder, so a cosine never proposes on its own): the original document, and the
 * document the projection of the declared vocabulary hands the engine, must reach the same
 * verdict. Where the declaration would change it, the validator refuses the entry that does,
 * and the projection keeps the original's words.
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { SolverService } from '../../ports/solver.ts'
import { orthogonalEmbedder } from '../../testing/gaming.ts'
import { toEngineDoc } from '../compat.ts'
import type { Embedder } from '../engine/formal/embed.ts'
import { runCheck } from '../engine/pipeline/check.ts'
import {
  DOC_VERSION_VOCAB,
  emptyDocument,
  type Requirement,
  type RequirementsDocument,
  type VocabSymbol,
} from '../requirements/document.ts'
import { renderSentence } from '../requirements/render.ts'
import { buildProjection } from './build.ts'
import { implicitVocabulary } from './implicit.ts'
import { frozenTablesDigest, validateVocabulary } from './invariants.ts'
import { projectedDocument } from './projection.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let serial = 0
const uuid = (): string => `00000000-0000-4000-8000-${(++serial).toString(16).padStart(12, '0')}`

type Slots = Pick<Requirement, 'systemName' | 'systemResponse'> &
  Partial<Pick<Requirement, 'patternType' | 'trigger' | 'preCondition' | 'negated'>>

/** A requirement whose stored sentence is its own rendering, as every write path stores it. */
const req = (slots: Slots): Requirement => {
  const r: Requirement = {
    id: uuid(),
    patternType: slots.patternType ?? 'ubiquitous',
    systemName: slots.systemName,
    systemResponse: slots.systemResponse,
    negated: slots.negated ?? false,
    sentence: '',
    priority: 'medium',
    status: 'draft',
    derives: [],
    satisfies: [],
    verifies: [],
    refines: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(slots.trigger !== undefined ? { trigger: slots.trigger } : {}),
    ...(slots.preCondition !== undefined ? { preCondition: slots.preCondition } : {}),
  }
  return { ...r, sentence: renderSentence(r) }
}

const docOf = (requirements: readonly Requirement[]): RequirementsDocument => ({
  ...emptyDocument(),
  requirements: Object.fromEntries(requirements.map((r) => [r.id, r])),
})

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

const system = (canonical: string): VocabSymbol => ({
  id: `sys_${canonical.replace(/\W+/g, '_')}`,
  kind: 'system',
  canonical,
  aliases: [],
})
const event = (id: string, canonical: string): VocabSymbol => ({
  id,
  kind: 'event',
  canonical,
  aliases: [],
})
const state = (id: string, canonical: string): VocabSymbol => ({
  id,
  kind: 'state',
  canonical,
  aliases: [],
})
const action = (id: string, canonical: string, aliases: readonly string[] = []): VocabSymbol => ({
  id,
  kind: 'action',
  canonical,
  aliases: [...aliases],
})

/** Every two texts related: the other extreme from the orthogonal embedder. */
const constantEmbedder = (): Embedder => async (texts) =>
  texts.map(() => {
    const v = new Float32Array(4)
    v[0] = 1
    return v
  })

/** What a run concludes: `verified`, every demotion and every finding, each with its ids. */
const verdictOf = (doc: RequirementsDocument, embedder: () => Embedder = orthogonalEmbedder) =>
  Effect.runPromise(
    Effect.flatMap(SolverService, (solver) =>
      Effect.flatMap(solver.boot, () =>
        Effect.promise(() =>
          runCheck(toEngineDoc(doc), { strict: true, semantic: { embedder: embedder() } }),
        ),
      ),
    ).pipe(Effect.provide(solverServiceLayer)),
  ).then((r) => ({
    verified: r.verified,
    demotions: r.coverage.demotions.map((d) => `${d.reason} ${d.requirementIds.join(',')}`).sort(),
    findings: r.findings.map((f) => `${f.code} ${f.requirementIds.join(',')}`).sort(),
  }))

/** The verdict of the document as written, and of what its projection hands the engine. */
const beforeAndAfter = async (
  doc: RequirementsDocument,
  embedder: () => Embedder = orthogonalEmbedder,
) => {
  const projection = buildProjection(doc)
  if (projection === undefined) throw new Error('the fixture declares no vocabulary')
  return {
    before: await verdictOf(doc, embedder),
    after: await verdictOf(projectedDocument(doc, projection), embedder),
    rewrites: [...projection.rewrites.values()],
  }
}

/** The document with some slots rewritten by hand: what a refused entry would have handed the engine. */
const rewritten = (
  doc: RequirementsDocument,
  slots: ReadonlyMap<string, Partial<Requirement>>,
): RequirementsDocument => ({
  ...doc,
  requirements: Object.fromEntries(
    Object.values(doc.requirements).map((r) => [r.id, { ...r, ...(slots.get(r.id) ?? {}) }]),
  ),
})

/** The implicit vocabulary of `doc`, declared, with one symbol's canonical respelled. */
const renamed = (
  doc: RequirementsDocument,
  pick: (s: VocabSymbol) => boolean,
  canonical: string,
): RequirementsDocument => {
  const implicit = implicitVocabulary(doc)
  const symbols = implicit.symbols.map(
    (s): VocabSymbol => (pick(s) ? { ...s, canonical, aliases: [s.canonical, ...s.aliases] } : s),
  )
  return {
    ...doc,
    docVersion: DOC_VERSION_VOCAB,
    vocabulary: { ...implicit, symbols, frozenTables: { sha256: frozenTablesDigest(doc) } },
  }
}

/** Each violation as [invariant, dropped, phrase or symbols]. */
const brief = (doc: RequirementsDocument) =>
  validateVocabulary(doc).violations.map((v) => [
    v.invariant,
    v.dropped,
    v.phrase ?? v.symbols.join('+'),
  ])

// ---------------------------------------------------------------------------
// The opposition tier reads the response's verb and object
// ---------------------------------------------------------------------------

describe('a rewrite keeps the opposition candidates the propose tier reads', () => {
  const TRIGGER = 'the operator presses the button'
  const r1 = req({
    systemName: 'door controller',
    patternType: 'event-driven',
    trigger: TRIGGER,
    systemResponse: 'arm the alarm',
  })
  const r2 = req({
    systemName: 'door controller',
    patternType: 'event-driven',
    trigger: TRIGGER,
    systemResponse: 'disarm the alarm',
  })
  const base = [
    system('door controller'),
    event('evt_press', TRIGGER),
    action('act_a', 'arm the alarm'),
  ]

  it('drops a lone rename that would hide `arm` / `disarm` from the candidate tier', async () => {
    const doc = withVocabulary(docOf([r1, r2]), [
      ...base,
      action('act_b', 'silence the siren', ['disarm the alarm']),
    ])
    expect(brief(doc)).toEqual([['V-READ', 'alias', 'disarm the alarm']])
    const { before, after, rewrites } = await beforeAndAfter(doc)
    expect(before.demotions.some((d) => d.startsWith('open-opposition-candidate'))).toBe(true)
    expect(before.verified).toBe(false)
    expect(rewrites).toEqual([])
    expect(after).toEqual(before)
  })

  it('admits the same symbols with no rename, and the verdict is the same (the control)', async () => {
    const doc = withVocabulary(docOf([r1, r2]), [...base, action('act_b', 'disarm the alarm')])
    expect(brief(doc)).toEqual([])
    const { before, after } = await beforeAndAfter(doc)
    expect(after).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// The relational tier reads comparison words and the normalized guard
// ---------------------------------------------------------------------------

describe('a rewrite keeps the relational disclosures', () => {
  const TRIGGER = 'the operator presses the button'
  const channel = 'set the channel different from the backup channel'
  const rate = 'set the rate the same as the backup rate'
  const r1 = req({
    systemName: 'door controller',
    patternType: 'event-driven',
    trigger: TRIGGER,
    systemResponse: channel,
  })
  const r2 = req({
    systemName: 'door controller',
    patternType: 'event-driven',
    trigger: TRIGGER,
    systemResponse: rate,
  })
  const base = [system('door controller'), event('evt_press', TRIGGER)]

  it('drops two lone renames that would delete the comparison words, event-driven', async () => {
    const doc = withVocabulary(docOf([r1, r2]), [
      ...base,
      action('act_a', 'set channel a', [channel]),
      action('act_b', 'set rate b', [rate]),
    ])
    const refused = brief(doc)
    expect(refused.length).toBeGreaterThan(0)
    expect(
      refused.every(([invariant, dropped]) => invariant === 'V-READ' && dropped === 'alias'),
    ).toBe(true)
    const { before, after } = await beforeAndAfter(doc)
    expect(before.demotions.some((d) => d.startsWith('relational-reasoning-not-attempted'))).toBe(
      true,
    )
    expect(after).toEqual(before)
  })

  it('does the same state-driven', async () => {
    const PRE = 'the link is up'
    const keepChannel = 'keep the channel different from the backup channel'
    const keepRate = 'keep the rate the same as the backup rate'
    const s1 = req({
      systemName: 'router',
      patternType: 'state-driven',
      preCondition: PRE,
      systemResponse: keepChannel,
    })
    const s2 = req({
      systemName: 'router',
      patternType: 'state-driven',
      preCondition: PRE,
      systemResponse: keepRate,
    })
    const doc = withVocabulary(docOf([s1, s2]), [
      system('router'),
      state('st_up', PRE),
      action('act_a', 'hold channel a', [keepChannel]),
      action('act_b', 'hold rate b', [keepRate]),
    ])
    expect(brief(doc).length).toBeGreaterThan(0)
    const { before, after } = await beforeAndAfter(doc)
    expect(before.verified).toBe(false)
    expect(after).toEqual(before)
  })

  it('drops a rename of one member of each same-trigger pair, over the implicit vocabulary', async () => {
    const A = 'select the north channel different from the south channel'
    const B = 'keep the valve setting different from the pump setting'
    const RENAMED = 'hold the valve at the pump setting'
    const reqs = [
      ['the ring is configured', A],
      ['the ring is configured', B],
      ['maintenance starts', A],
      ['maintenance starts', B],
    ].map(([trigger, systemResponse]) =>
      req({
        systemName: 'ring controller',
        patternType: 'event-driven',
        trigger: trigger as string,
        systemResponse: systemResponse as string,
      }),
    )
    const plain = docOf(reqs)
    const implicit = implicitVocabulary(plain)
    const symbols = implicit.symbols.map(
      (s): VocabSymbol =>
        s.kind === 'action' && s.canonical === B
          ? { ...s, canonical: RENAMED, aliases: [B, ...s.aliases] }
          : s,
    )
    const doc: RequirementsDocument = {
      ...plain,
      docVersion: DOC_VERSION_VOCAB,
      vocabulary: { ...implicit, symbols, frozenTables: { sha256: frozenTablesDigest(plain) } },
    }
    expect(brief(doc)).toEqual([['V-READ', 'alias', B]])
    const { before, after } = await beforeAndAfter(doc)
    expect(before.findings.filter((f) => f.startsWith('FND_RELATIONAL_UNCHECKED'))).toHaveLength(2)
    expect(after).toEqual(before)
  })

  it('admits the same symbols with no rename (the control)', async () => {
    const doc = withVocabulary(docOf([r1, r2]), [
      ...base,
      action('act_a', channel),
      action('act_b', rate),
    ])
    expect(brief(doc)).toEqual([])
    const { before, after } = await beforeAndAfter(doc)
    expect(after).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// Every other reader of a slot's words
// ---------------------------------------------------------------------------

interface ReaderCase {
  /** The reader, as `readers.ts` names it, and what the fixture shows. */
  readonly name: string
  readonly plain: RequirementsDocument
  /** The declared vocabulary: `plain` with an entry the validator must refuse. */
  readonly declared: RequirementsDocument
  /** The slots the refused entry would have rewritten, rewritten by hand. */
  readonly rewrite: ReadonlyMap<string, Partial<Requirement>>
  readonly refused: readonly (readonly string[])[]
  /** The embedder a run needs for the reader to report at all. */
  readonly embedder?: () => Embedder
  /**
   * A rewrite whose change only the model's cosine would show: at the two embedder extremes
   * the hand rewrite reports what the original does, and the refusal is for the model's run.
   */
  readonly cosineOnly?: true
}

const readerCases = (): ReaderCase[] => {
  const cases: ReaderCase[] = []
  const add = (
    name: string,
    requirements: readonly Requirement[],
    pick: (s: VocabSymbol) => boolean,
    canonical: string,
    rewrite: (r: Requirement) => Partial<Requirement> | undefined,
    refused: readonly (readonly string[])[],
    options: {
      tables?: Partial<RequirementsDocument>
      embedder?: () => Embedder
      cosineOnly?: true
    } = {},
  ) => {
    const plain = { ...docOf(requirements), ...(options.tables ?? {}) }
    const slots = new Map<string, Partial<Requirement>>()
    for (const r of requirements) {
      const w = rewrite(r)
      if (w !== undefined) slots.set(r.id, w)
    }
    cases.push({
      name,
      plain,
      declared: renamed(plain, pick, canonical),
      rewrite: slots,
      refused,
      ...(options.embedder !== undefined ? { embedder: options.embedder } : {}),
      ...(options.cosineOnly !== undefined ? { cosineOnly: options.cosineOnly } : {}),
    })
  }
  const isAction = (canonical: string) => (s: VocabSymbol) =>
    s.kind === 'action' && s.canonical === canonical

  // lint: R6 exempts `zone 1` only while the stored sentence is the slots' own rendering, and a
  // renamed system renders another sentence.
  {
    const hold = 'hold zone 1 temperature above 20 degrees celsius'
    add(
      'lint: R6 reads the numeral as a label only in the sentence the slots render',
      [
        req({ systemName: 'plant', systemResponse: hold }),
        req({ systemName: 'plant', systemResponse: 'log the state' }),
      ],
      (s) => s.kind === 'system',
      'plant unit',
      () => ({ systemName: 'plant unit' }),
      [['V-READ', 'alias', 'plant']],
    )
  }
  // lint-set: with no stored sentence the slots are linted, and the set's decimal precision is
  // read across them.
  {
    const bare = (systemResponse: string) => ({
      ...req({ systemName: 'plant', systemResponse }),
      sentence: '',
    })
    add(
      'lint-set: R40 reads the decimal precision across sentences the slots render',
      [bare('hold the pressure at 1.50 bar'), bare('hold the flow at 2.5 bar')],
      isAction('hold the pressure at 1.50 bar'),
      'hold the pressure at 1.5 bar',
      (r) =>
        r.systemResponse.includes('1.50')
          ? { systemResponse: 'hold the pressure at 1.5 bar' }
          : undefined,
      [['V-READ', 'alias', 'hold the pressure at 1.50 bar']],
    )
  }
  // ambiguity: `pump` and `pump.` are one system scope and two spellings, so `it` has two
  // candidate antecedents until one canonical spells both.
  add(
    'ambiguity: a reference is ambiguous among the distinct system spellings',
    [
      req({ systemName: 'pump', systemResponse: 'start the motor' }),
      req({ systemName: 'pump.', systemResponse: 'restart it' }),
    ],
    (s) => s.kind === 'system',
    'pump unit',
    () => ({ systemName: 'pump unit' }),
    [
      ['V-READ', 'alias', 'pump'],
      ['V-READ', 'alias', 'pump.'],
    ],
  )
  // unread: `every` is no comparator, so `5 seconds` is disclosed as a quantity no bound read.
  add(
    'unread: a quantity in a converted unit that no bound reads',
    [
      req({ systemName: 'pump', systemResponse: 'poll every 5 seconds' }),
      req({ systemName: 'pump', systemResponse: 'log the state' }),
    ],
    isAction('poll every 5 seconds'),
    'poll the sensor',
    (r) =>
      r.systemResponse === 'poll every 5 seconds'
        ? { systemResponse: 'poll the sensor' }
        : undefined,
    [['V-READ', 'alias', 'poll every 5 seconds']],
  )
  // loose: `immediately keep the door unlocked` holds the prohibited bound's label, so the
  // numeric tier reads it as doing the action two prohibitions together forbid.
  {
    const loose = 'immediately keep the door unlocked'
    add(
      'loose: a response the numeric tier reads as performing a prohibited action',
      [
        req({ systemName: 'door', systemResponse: loose }),
        req({
          systemName: 'door',
          systemResponse: 'keep the door unlocked above 10 seconds',
          negated: true,
        }),
        req({
          systemName: 'door',
          systemResponse: 'keep the door unlocked below 30 seconds',
          negated: true,
        }),
      ],
      isAction(loose),
      'release the latch',
      (r) => (r.systemResponse === loose ? { systemResponse: 'release the latch' } : undefined),
      [['V-READ', 'alias', loose]],
    )
  }
  // quantity-alias: `the pump is on` and `the pump on` are one guard atom (the copula folds)
  // and two `normalize` spellings, and the candidate tier pairs bounds only under one spelling of
  // both guard slots. One shared trigger keeps the pair a pairwise candidate either way.
  {
    const guarded = (preCondition: string, systemResponse: string) =>
      req({
        systemName: 'pump',
        patternType: 'event-driven',
        preCondition,
        trigger: 'the timer fires',
        systemResponse,
      })
    add(
      'quantity-alias: opposed bounds on labels sharing an object, under one guard spelling',
      [
        guarded('the pump is on', 'complete the infusion within 30 minutes'),
        guarded('the pump on', 'run the infusion for at least 60 minutes'),
      ],
      (s) => s.kind === 'state',
      'the pump is energized',
      () => ({ preCondition: 'the pump is energized' }),
      [
        ['V-READ', 'alias', 'the pump is on'],
        ['V-READ', 'alias', 'the pump on'],
      ],
    )
  }
  // number-spelling: two numbers apart only in a digit separator, on two atoms.
  add(
    'number-spelling: numbers apart only in a digit separator',
    [
      req({ systemName: 'logger', systemResponse: 'log batch 1,500' }),
      req({ systemName: 'logger', systemResponse: 'log batch 1.500' }),
    ],
    isAction('log batch 1.500'),
    'log batch fifteen',
    (r) =>
      r.systemResponse === 'log batch 1.500' ? { systemResponse: 'log batch fifteen' } : undefined,
    [['V-READ', 'alias', 'log batch 1.500']],
  )
  // candidate-pair: `the tank is full` inside `the tank is full and draining` makes the pair a
  // candidate for the pairwise tier, which then compares it.
  {
    const guarded = (preCondition: string, systemResponse: string) =>
      req({ systemName: 'pump', patternType: 'state-driven', preCondition, systemResponse })
    add(
      'candidate-pair: one precondition inside the other makes a pairwise candidate',
      [
        guarded('the tank is full', 'stop the pump'),
        guarded('the tank is draining', 'start the pump'),
      ],
      (s) => s.kind === 'state' && s.canonical === 'the tank is draining',
      'the tank is full and draining',
      (r) =>
        r.preCondition === 'the tank is draining'
          ? { preCondition: 'the tank is full and draining' }
          : undefined,
      [['V-READ', 'alias', 'the tank is draining']],
    )
  }
  // exact-duplicate: a committed glossary already makes `flush the line` and `purge the line`
  // one atom, and one canonical spelling both makes the two requirements one text. Their
  // sentences are too far apart for a pairwise candidate, before and after.
  add(
    'exact-duplicate: one canonical makes two requirements one text',
    [
      req({ systemName: 'pump', systemResponse: 'flush the line' }),
      req({ systemName: 'pump', systemResponse: 'purge the line' }),
    ],
    (s) => s.kind === 'action',
    'rinse the line',
    () => ({ systemResponse: 'rinse the line' }),
    [
      ['V-READ', 'alias', 'flush the line'],
      ['V-READ', 'alias', 'purge the line'],
    ],
    { tables: { glossary: [{ canonical: 'flush the line', aliases: ['purge the line'] }] } },
  )
  // similar-ununified: near-identical sentences whose responses the glossary makes one atom and
  // the seed atomizer keeps two; one canonical spelling both makes them one atom there too.
  {
    const station = (trigger: string, verb: string) =>
      req({
        systemName: 'main pump controller',
        patternType: 'event-driven',
        trigger,
        systemResponse: `${verb} the valve at the north station`,
      })
    add(
      'similar-ununified: lexically similar sentences whose responses the seed reading keeps apart',
      [station('the door opens', 'flush'), station('the door closes', 'purge')],
      (s) => s.kind === 'action',
      'rinse the valve at the north station',
      () => ({ systemResponse: 'rinse the valve at the north station' }),
      [
        ['V-READ', 'alias', 'flush the valve at the north station'],
        ['V-READ', 'alias', 'purge the valve at the north station'],
      ],
      {
        tables: {
          glossary: [
            {
              canonical: 'flush the valve at the north station',
              aliases: ['purge the valve at the north station'],
            },
          ],
        },
      },
    )
  }
  // near-duplicate: `open the doors` and `shall not open the door` are one pair of words up to
  // number at opposite polarity, and the tier proposes it only above the cosine threshold.
  add(
    'near-duplicate: an opposite-polarity near-duplicate the cosine gates',
    [
      req({ systemName: 'gate', systemResponse: 'open the doors' }),
      req({ systemName: 'gate', systemResponse: 'open the door', negated: true }),
    ],
    isAction('open the doors'),
    'unbolt the doors',
    (r) =>
      r.systemResponse === 'open the doors' ? { systemResponse: 'unbolt the doors' } : undefined,
    [['V-READ', 'alias', 'open the doors']],
    { embedder: constantEmbedder },
  )
  // cosine: `log the event` / `record the event` is an opposition candidate only above the
  // cosine floor; `store the event` keeps the shape, and the model reads other words.
  add(
    'cosine: an opposition candidate the cosine floor gates, over a rewritten response',
    [
      req({ systemName: 'logger', systemResponse: 'log the event' }),
      req({ systemName: 'logger', systemResponse: 'record the event' }),
    ],
    isAction('record the event'),
    'store the event',
    (r) =>
      r.systemResponse === 'record the event' ? { systemResponse: 'store the event' } : undefined,
    [['V-READ', 'alias', 'record the event']],
    { embedder: constantEmbedder, cosineOnly: true },
  )
  return cases
}

describe('a rewrite keeps what every other reader of a slot`s words reads', () => {
  for (const c of readerCases()) {
    it(c.name, async () => {
      const before = await verdictOf(c.plain, c.embedder)
      const byHand = await verdictOf(rewritten(c.plain, c.rewrite), c.embedder)
      // The rewrite the refused entry asks for is a verdict change the declaration does not
      // imply, or, for a cosine-gated pair, one only the model's run could show.
      if (c.cosineOnly === true) expect(byHand).toEqual(before)
      else expect(byHand).not.toEqual(before)
      expect(brief(c.declared)).toEqual(c.refused)
      const { after, rewrites } = await beforeAndAfter(c.declared, c.embedder)
      expect(rewrites).toEqual([])
      expect(after).toEqual(before)
    })
  }
})

// ---------------------------------------------------------------------------
// The system scope every per-system tier pairs on
// ---------------------------------------------------------------------------

describe('a rewrite keeps the system scope the per-system tiers pair on', () => {
  // R1's bound label resolves to no declared quantity, so R1 is left as written; renaming the
  // system would rewrite R2 alone and put two requirements of one system in two scopes. The two
  // share no atom, so only the scope shows the split, and the semantic tier stops pairing them.
  const r1 = req({
    systemName: 'plant',
    systemResponse: 'hold zone 1 temperature above 20 degrees celsius',
  })
  const r2 = req({ systemName: 'plant', systemResponse: 'log the state' })
  const symbols = [
    { ...system('plant unit'), aliases: ['plant'] },
    action('act_hold', r1.systemResponse),
    action('act_log', r2.systemResponse),
  ]

  it('refuses a system rename that one unresolved requirement would keep from being made', async () => {
    const doc = withVocabulary(docOf([r1, r2]), symbols)
    const before = await verdictOf(docOf([r1, r2]), constantEmbedder)
    const byHand = await verdictOf(
      rewritten(docOf([r1, r2]), new Map([[r2.id, { systemName: 'plant unit' }]])),
      constantEmbedder,
    )
    expect(byHand).not.toEqual(before)
    expect(brief(doc)).toEqual([['V1', 'alias', 'plant']])
    const { after, rewrites } = await beforeAndAfter(doc, constantEmbedder)
    expect(rewrites).toEqual([])
    expect(after).toEqual(before)
  })
})
