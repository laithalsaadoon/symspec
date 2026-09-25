/**
 * A number written with two digit separators is one pair to DEMOTE, never silence (spec 007
 * AC-2-4, the demote-not-prove contract C2/C3).
 *
 * `normalize` keeps a `,` or `.` between two digits inside its number, because the separator
 * decides WHICH number it is: `1,500` is 1500 in one convention and 1.5 in the other. Before
 * that split, the separator was deleted, so `1.5`/`1,5`, `1_500`/`1.500` and `30_000`/`30.000`
 * each collapsed onto one atom and a pair at opposite polarity was PROVED. The split is right
 * (the collapse also proved `1,500 ms` / `not 1.500 ms`, which is consistent), but a split that
 * leaves the pair on two covered atoms says nothing at all: exit 0, `verified: true`. These pin
 * the pairs 669c0e9 proved, as the CLI stores them (`apply` renders each sentence from its
 * slots), and require each one to be demoted by name.
 */

import { describe, expect, it } from 'vitest'
import { renderSentence } from '../core/render.ts'
import type { Requirement } from '../core/schema.ts'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import {
  digitSeparatorFold,
  makeAtomize,
  makeDigitSeparatorFoldAtomize,
  termIndex,
} from './atomize.ts'
import { encode } from './encode.ts'
import { findNumberSpellingCandidates } from './number-spelling.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idOf = (i: number) => `0b0b0b0b-0000-4000-8000-${String(i + 1).padStart(12, '0')}`

interface Waive {
  readonly code: string
  readonly line: number
}

interface Tables {
  readonly glossary?: readonly { readonly canonical: string; readonly aliases: readonly string[] }[]
  readonly terms?: readonly { readonly canonical: string; readonly aliases: readonly string[] }[]
}

const checkRendered = async (
  sentences: readonly string[],
  waive: readonly Waive[] = [],
  tables: Tables = {},
) => {
  const requirements: Record<string, Requirement> = {}
  for (const [i, sentence] of sentences.entries()) {
    const parsed = await parseLine(sentence)
    if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
    const id = idOf(i)
    const r = {
      id,
      patternType: parsed.slots.patternType,
      systemName: parsed.slots.systemName,
      systemResponse: parsed.slots.systemResponse,
      ...(parsed.slots.trigger !== undefined ? { trigger: parsed.slots.trigger } : {}),
      ...(parsed.slots.preCondition !== undefined
        ? { preCondition: parsed.slots.preCondition }
        : {}),
      negated: parsed.negated,
      sentence,
      priority: 'medium',
      status: 'draft',
      createdAt: TS,
      updatedAt: TS,
      derives: [],
      satisfies: [],
      verifies: [],
      refines: [],
    } as unknown as Requirement
    r.sentence = renderSentence(r)
    requirements[id] = r
  }
  return runCheck({
    requirements,
    glossary: tables.glossary ?? [],
    antonyms: [],
    waivers: waive.map((w) => ({ code: w.code, requirementId: idOf(w.line), reason: 'reviewed' })),
    terms: tables.terms ?? [],
    stateModel: { variables: [] },
  } as never)
}

type Report = Awaited<ReturnType<typeof checkRendered>>

const PROOFS = new Set(['FND_CONTRADICTION', 'FND_NUMERIC_CONTRADICTION'])
const pairOf = (a: number, b: number) => [idOf(a), idOf(b)].sort()

/** The pair is neither proved nor silent: a named `number-spelling-candidate` demotion. */
const expectDemotedPair = (report: Report, a: number, b: number) => {
  const ids = pairOf(a, b)
  const trace = JSON.stringify({ findings: report.findings, coverage: report.coverage })
  expect(report.verified, trace).toBe(false)
  const demotion = report.coverage.demotions.find(
    (d) =>
      d.reason === 'number-spelling-candidate' &&
      [...d.requirementIds].sort().join() === ids.join(),
  )
  expect(demotion, trace).toBeDefined()
  expect(demotion?.action, trace).toMatch(/symspec update/)
  const finding = report.findings.find(
    (f) =>
      f.code === 'FND_NUMBER_SPELLING_CANDIDATE' &&
      [...f.requirementIds].sort().join() === ids.join(),
  )
  expect(finding?.severity, trace).toBe('info')
}

const R6 = 'GTWR_R6_MISSING_UNITS'

describe('a digit-separator split is demoted by name (C2/C3)', () => {
  it('(1) `1.5 ms` / `not 1,5 ms`, with a reviewed R6 waiver on the decimal comma', async () => {
    const report = await checkRendered(
      [
        'When the cache warms, the api gateway shall respond within 1.5 ms.',
        'When the cache warms, the api gateway shall not respond within 1,5 ms.',
      ],
      [{ code: R6, line: 1 }],
    )
    expectDemotedPair(report, 0, 1)
  })

  const FOUR = (x: string, y: string) => [
    `The api gateway shall respond within ${x} ms.`,
    `The api gateway shall not respond within ${y} ms.`,
    `When the cache warms, the api gateway shall respond within ${x} ms.`,
    `When the cache is cold, the api gateway shall not respond within ${y} ms.`,
  ]
  // Lines 0/2 spell one number and lines 1/3 the other, so every cross pair is split.
  const CROSS: readonly [number, number][] = [
    [0, 1],
    [0, 3],
    [2, 1],
    [2, 3],
  ]

  it.each([
    ['(2)', '1_500', '1.500', [0, 2]],
    ['(3)', '30_000', '30.000', [0, 2]],
    ['(4)', '1.5', '1,5', [1, 3]],
  ] as const)('%s `%s ms` / `not %s ms`, reviewed R6 waivers admitting both', async (_, x, y, waived) => {
    const report = await checkRendered(
      FOUR(x, y),
      waived.map((line) => ({ code: R6, line })),
    )
    for (const [a, b] of CROSS) expectDemotedPair(report, a, b)
    // The same spelling is one atom, so it is not a candidate.
    expect(
      report.findings.filter(
        (f) =>
          f.code === 'FND_NUMBER_SPELLING_CANDIDATE' &&
          [...f.requirementIds].sort().join() === pairOf(0, 2).join(),
      ),
    ).toEqual([])
  })

  // With no waiver, R6 keeps the `_` and decimal-comma spellings out of the formal tier. The
  // exclusion names only its own requirement, so the pair demotion still has to name the
  // partner that WAS admitted.
  it.each([
    ['(2)', '1_500', '1.500'],
    ['(3)', '30_000', '30.000'],
    ['(4)', '1.5', '1,5'],
  ])('%s `%s ms` / `not %s ms` with no waiver: every cross pair demoted by name', async (_, x, y) => {
    const report = await checkRendered(FOUR(x, y))
    const trace = JSON.stringify({ findings: report.findings, coverage: report.coverage })
    for (const [a, b] of CROSS) expectDemotedPair(report, a, b)
    // No pair here is proved on an exact key: these numbers are not the same by any closed rule.
    for (const f of report.findings) {
      if (!PROOFS.has(f.code)) continue
      expect(f.severity === 'error' ? f.requirementIds : [], trace).toEqual([])
    }
  })

  it('(1) with no waiver: the excluded decimal comma is still named with its partner', async () => {
    const report = await checkRendered([
      'When the cache warms, the api gateway shall respond within 1.5 ms.',
      'When the cache warms, the api gateway shall not respond within 1,5 ms.',
    ])
    expect(report.coverage.demotions.map((d) => d.reason)).toContain('excluded-from-formal')
    expectDemotedPair(report, 0, 1)
  })

  it('one spelling on both sides is one atom and still proved, never a candidate', async () => {
    const report = await checkRendered([
      'When the cache warms, the api gateway shall respond within 1.500 ms.',
      'When the cache warms, the api gateway shall not respond within 1.500 ms.',
    ])
    const codes = report.findings.map((f) => f.code)
    expect(codes).toContain('FND_CONTRADICTION')
    expect(codes).not.toContain('FND_NUMBER_SPELLING_CANDIDATE')
  })

  it('a waiver of the candidate discharges its demotion', async () => {
    const report = await checkRendered(
      [
        'When the cache warms, the api gateway shall respond within 1.5 ms.',
        'When the cache warms, the api gateway shall not respond within 1,5 ms.',
      ],
      [
        { code: R6, line: 1 },
        { code: 'FND_NUMBER_SPELLING_CANDIDATE', line: 0 },
      ],
    )
    expect(report.coverage.demotions.map((d) => d.reason)).not.toContain(
      'number-spelling-candidate',
    )
  })
})

/**
 * A committed table row is a spelling too. `normalize` keeps `1,5` and `1.5` apart in an alias
 * exactly as it does in a body, so an alias written with the other separator than the body it
 * was meant for no longer matches it: the substitution rewrites one side only, the pair lands on
 * two atoms that no separator fold of the ATOMS relates (`open_the_north_pipe` vs
 * `open_the_1.5_m_pipe`), and 669c0e9's proof became exit 0, `verified: true`, no demotion. The
 * finder also reads every requirement as the tables WOULD rewrite it if a digit separator were a
 * token boundary in bodies and table keys alike, so the pair is demoted by name.
 */
describe('a committed alias spelled with the other digit separator is demoted by name (C3)', () => {
  const PIPE = [
    'When the pump starts, the controller shall open the 1,5 m pipe.',
    'When the pump starts, the controller shall not open the 1.5 m pipe.',
  ]
  // `1,5 m` is a decimal comma the numeric tier refuses, so R6 needs a reviewed waiver on it.
  const PIPE_WAIVERS = [
    { code: R6, line: 0 },
    { code: R6, line: 1 },
  ]

  it.each([
    [
      '(a) term alias `1,5 m pipe`',
      { terms: [{ canonical: 'north pipe', aliases: ['1,5 m pipe'] }] },
    ],
    [
      '(b) term alias `1.5 m pipe`',
      { terms: [{ canonical: 'north pipe', aliases: ['1.5 m pipe'] }] },
    ],
    [
      '(c) glossary alias `open the 1,5 m pipe`',
      { glossary: [{ canonical: 'open the north pipe', aliases: ['open the 1,5 m pipe'] }] },
    ],
  ] as const)('%s: a body spelled both ways', async (_, tables) => {
    expectDemotedPair(await checkRendered(PIPE, PIPE_WAIVERS, tables), 0, 1)
  })

  const CHIME = (response: string) => [
    `When the door opens, the controller shall ${response}.`,
    'When the door opens, the controller shall not start the alarm sequence.',
  ]

  it('a glossary alias `1,5 s` for a body that spells `1.5 s`', async () => {
    const report = await checkRendered(CHIME('sound the chime within 1.5 s'), [], {
      glossary: [
        { canonical: 'start the alarm sequence', aliases: ['sound the chime within 1,5 s'] },
      ],
    })
    expectDemotedPair(report, 0, 1)
  })

  it.each([
    ['1.5 s chime', '1,5 s chime'],
    ['1.5 kHz buzzer', '1,5 kHz buzzer'],
  ])('a term alias for `%s` spelled `%s`', async (body, alias) => {
    const report = await checkRendered(
      [
        `When the door opens, the controller shall sound the ${body}.`,
        'When the door opens, the controller shall not sound the alarm horn.',
      ],
      [],
      { terms: [{ canonical: 'alarm horn', aliases: [alias] }] },
    )
    expectDemotedPair(report, 0, 1)
  })

  it('two aliases that differ only in a digit separator, routed to two canonicals', async () => {
    // Each body matches its own alias exactly, so the two land on `east` and `west`. In fold
    // space the two aliases are one key, so the pair is named.
    const report = await checkRendered(PIPE, PIPE_WAIVERS, {
      glossary: [
        { canonical: 'open the east pipe', aliases: ['open the 1,5 m pipe'] },
        { canonical: 'open the west pipe', aliases: ['open the 1.5 m pipe'] },
      ],
    })
    expectDemotedPair(report, 0, 1)
    const finding = report.findings.find((f) => f.code === 'FND_NUMBER_SPELLING_CANDIDATE')
    expect(finding?.message).toMatch(/committed glossary or term alias/)
  })

  it('an alias spelled like its body still merges them, and the pair is proved', async () => {
    const glossary = await checkRendered(CHIME('sound the chime within 1.5 s'), [], {
      glossary: [
        { canonical: 'start the alarm sequence', aliases: ['sound the chime within 1.5 s'] },
      ],
    })
    const terms = await checkRendered(
      [
        'When the door opens, the controller shall sound the 1.5 s chime.',
        'When the door opens, the controller shall not sound the alarm horn.',
      ],
      [],
      { terms: [{ canonical: 'alarm horn', aliases: ['1.5 s chime'] }] },
    )
    for (const report of [glossary, terms]) {
      const codes = report.findings.map((f) => f.code)
      expect(codes).toContain('FND_CONTRADICTION')
      expect(codes).not.toContain('FND_NUMBER_SPELLING_CANDIDATE')
    }
  })
})

describe('findNumberSpellingCandidates', () => {
  const enc = (id: string, response: string, trigger?: string) =>
    encode(
      {
        id,
        patternType: trigger === undefined ? 'ubiquitous' : 'event-driven',
        systemName: 'api gateway',
        systemResponse: response,
        ...(trigger === undefined ? {} : { trigger }),
      } as never,
      makeAtomize(),
    )

  it('pairs two requirements whose atoms differ only in a digit separator', () => {
    const found = findNumberSpellingCandidates([
      enc('b', 'respond within 1,500 ms'),
      enc('a', 'respond within 1.500 ms'),
    ])
    expect(found.map((f) => f.requirementIds)).toEqual([['a', 'b']])
    expect(found[0]?.message).toContain('1,500')
    expect(found[0]?.message).toContain('1.500')
  })

  it('reads guards too, and ignores one spelling or two different phrases', () => {
    expect(
      findNumberSpellingCandidates([
        enc('a', 'log the load', 'the load exceeds 1,500 requests'),
        enc('b', 'shed the load', 'the load exceeds 1.500 requests'),
      ]).map((f) => f.requirementIds),
    ).toEqual([['a', 'b']])
    expect(
      findNumberSpellingCandidates([
        enc('a', 'respond within 1,500 ms'),
        enc('b', 'respond within 1,500 ms'),
        enc('c', 'respond within 1500 ms'),
        enc('d', 'log within 1.500 ms'),
      ]),
    ).toEqual([])
  })

  it('pairs two contraries whose antonym keys differ only in a digit separator', () => {
    // `open` / `close` are one seed antonym class, so the two atoms differ in their head verb
    // and only the class-and-remainder key shows the separator split.
    const found = findNumberSpellingCandidates([
      enc('a', 'open the valve 1,5'),
      enc('b', 'close the valve 1.5'),
    ])
    expect(found.map((f) => f.requirementIds)).toEqual([['a', 'b']])
  })

  it('reads a committed table in fold space when handed the folded encoding', () => {
    const terms = termIndex([{ canonical: 'north pipe', aliases: ['1,5 m pipe'] }])
    const real = makeAtomize(undefined, undefined, terms)
    const folded = makeDigitSeparatorFoldAtomize(new Map(), undefined, terms)
    const req = (id: string, response: string) =>
      ({ id, patternType: 'ubiquitous', systemName: 'pump', systemResponse: response }) as never
    const reqs = [req('a', 'open the 1,5 m pipe'), req('b', 'open the 1.5 m pipe')]
    const encoded = reqs.map((r) => encode(r, real))
    // The alias rewrote `a` only, so the atoms' own folds differ and nothing is found ...
    expect(encoded.map((e) => e.atoms[0]?.atom)).toEqual([
      'sys__pump__resp__open_the_north_pipe',
      'sys__pump__resp__open_the_1.5_m_pipe',
    ])
    expect(findNumberSpellingCandidates(encoded)).toEqual([])
    // ... until the fold-space encoding, where the alias rewrites both.
    const found = findNumberSpellingCandidates(
      encoded,
      reqs.map((r) => encode(r, folded)),
    )
    expect(found.map((f) => f.requirementIds)).toEqual([['a', 'b']])
    // With no table, fold space is the fold of the atoms and changes nothing.
    const plain = [enc('a', 'respond within 1,500 ms'), enc('b', 'respond within 1.500 ms')]
    const plainFolded = makeDigitSeparatorFoldAtomize(new Map(), undefined, new Map())
    expect(plain.map((e) => e.atoms.map((row) => digitSeparatorFold(row.atom)))).toEqual(
      ['respond within 1,500 ms', 'respond within 1.500 ms'].map((systemResponse, i) =>
        encode(
          {
            id: String(i),
            patternType: 'ubiquitous',
            systemName: 'api gateway',
            systemResponse,
          } as never,
          plainFolded,
        ).atoms.map((row) => row.atom),
      ),
    )
  })

  it('the fold reads a digit separator as a token boundary, and nothing else', () => {
    expect(digitSeparatorFold('respond_within_1,500_ms')).toBe('respond_within_1_500_ms')
    expect(digitSeparatorFold('respond_within_12,345.5_ms')).toBe('respond_within_12_345_5_ms')
    expect(digitSeparatorFold('respond_within_1_500_ms')).toBe('respond_within_1_500_ms')
  })
})
