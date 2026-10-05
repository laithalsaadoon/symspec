/**
 * THE GAMING REGISTRY — the half of the gaming gate that needs no solver.
 *
 * `./gaming.shard-*.test.ts` run the matrix and hold the escape table exact. This file holds
 * the REGISTRY honest: that AC-8-2's list is realized clause by clause, that every op verb has
 * a move or a written reason (AC-8-2's last sentence), that the escape table points at things
 * that exist and at ACs the spec actually has, and that the shards cover every fixture. None of
 * that needs a `check` run, so none of it waits for one.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MUTATE_OPTIONS } from '../app/operations/mutate-options.ts'
import { waivabilityOf } from '../app/runtime/signal-classes.ts'
import {
  DEFAULT_OPPOSITION_COSINE_FLOOR,
  DEFAULT_SEMANTIC_THRESHOLD,
} from '../domain/engine/formal/semantic.ts'
import { requirementsContentHash } from '../domain/requirements/content-hash.ts'
import { OP_VERBS, type OpVerb } from '../domain/requirements/ops.ts'
import {
  AC_8_2,
  buildDoc,
  editVerbs,
  FIXTURES,
  KNOWN_ESCAPES,
  KNOWN_NONMONOTONE,
  MOVES,
  moveDirection,
  moveStatuses,
  NEAR_COSINE,
  NOT_APPLICABLE_YET,
  OP_COVERAGE,
  orthogonalEmbedder,
  SHARDS,
} from './gaming.ts'

const SPEC = readFileSync(
  fileURLToPath(new URL('../../.erpaval/specs/007-controlled-vocabulary/spec.md', import.meta.url)),
  'utf8',
)

/** The AC-8-2 clause list, parsed out of the spec's own sentence. */
const specClauses = (): readonly string[] => {
  const flat = SPEC.replace(/\s+/g, ' ')
  const start = flat.indexOf('The registered moves shall include at least: ')
  const end = flat.indexOf('. A new op shall not merge', start)
  expect(start, 'AC-8-2 wording moved; update the parser').toBeGreaterThan(0)
  const list = flat.slice(start + 'The registered moves shall include at least: '.length, end)
  const clauses = list.split('; ')
  // The last clause is the run-weakening series: "run with A, B, C, and D".
  const last = clauses.pop() ?? ''
  return [...clauses, ...last.split(/, (?:and )?/)]
}

/** `closedBy`: an AC id, optionally led by its plan slice and followed by what closes it. */
const CLOSED_BY = /^(?:S\d+ \/ )?(AC-\d+-\d+)(?: \([^()]+\))?$/

const REGISTERED = new Set(MOVES.map((m) => m.id))
const PENDING = new Set(NOT_APPLICABLE_YET.map((p) => p.id))

describe('the gaming registry', () => {
  it('names every move and fixture once, and no pending move shadows a registered one', () => {
    expect(MOVES.length).toBe(REGISTERED.size)
    expect(NOT_APPLICABLE_YET.length).toBe(PENDING.size)
    expect(FIXTURES.length).toBe(new Set(FIXTURES.map((f) => f.id)).size)
    expect([...PENDING].filter((id) => REGISTERED.has(id))).toEqual([])
  })

  it("realizes AC-8-2's list exactly as the spec words it", () => {
    expect(new Set(AC_8_2.map((c) => c.clause))).toEqual(new Set(specClauses()))
    for (const { clause, moves } of AC_8_2) {
      expect(moves.length, clause).toBeGreaterThan(0)
      for (const id of moves) {
        expect(REGISTERED.has(id) || PENDING.has(id), `${clause} → ${id}`).toBe(true)
      }
    }
    // And every pending move is one of AC-8-2's clauses: a placeholder no clause asks for is a
    // placeholder nothing will ever promote.
    const named = new Set(AC_8_2.flatMap((c) => c.moves))
    expect([...PENDING].filter((id) => !named.has(id))).toEqual([])
  })

  it('every pending move names the AC that introduces its target, and the spec has it', () => {
    for (const p of NOT_APPLICABLE_YET) {
      expect(p.needs, p.id).toMatch(/^AC-\d+-\d+$/)
      expect(SPEC, `${p.id} needs ${p.needs}, which the spec does not define`).toMatch(
        new RegExp(`^${p.needs}\\b`, 'm'),
      )
    }
  })

  it('every op verb maps to a move that EMITS it, or to a written reason', () => {
    // OP_VERBS is the op union's verb list — `ops.test.ts` pins it 1:1 against `DocumentOp`.
    expect(new Set(Object.keys(OP_COVERAGE))).toEqual(new Set(OP_VERBS))

    // What each move emits on each fixture, statically. `waive-by-code` reads the baseline's
    // codes, so it gets a placeholder: which codes it waives does not change which verb it uses.
    // `waive-scoped-never` reads the baseline's findings, so it gets a placeholder never-class
    // finding over a real requirement of the fixture (its hash must be computable).
    const emitted = new Map<string, Set<OpVerb>>()
    for (const fixture of FIXTURES) {
      const doc = buildDoc(fixture.ops, MUTATE_OPTIONS)
      const first = Object.keys(doc.requirements).sort()[0]
      const ctx = {
        fixture,
        doc,
        baselineCodes: ['FND_PLACEHOLDER'],
        baselineFindings:
          first === undefined ? [] : [{ code: 'FND_PLACEHOLDER', requirementIds: [first] }],
        waivability: (code: string) =>
          code === 'FND_PLACEHOLDER' ? ('never' as const) : waivabilityOf(code),
      }
      for (const move of MOVES) {
        const verbs = emitted.get(move.id) ?? new Set<OpVerb>()
        for (const verb of editVerbs(move.edit(ctx), ctx)) verbs.add(verb)
        emitted.set(move.id, verbs)
      }
    }

    for (const verb of OP_VERBS) {
      const row = OP_COVERAGE[verb]
      if ('reason' in row) {
        expect(row.reason.length, `${verb}: an empty reason is not a reason`).toBeGreaterThan(40)
        continue
      }
      expect(row.moves.length, verb).toBeGreaterThan(0)
      for (const id of row.moves) {
        expect(REGISTERED.has(id), `${verb} → ${id} is not a registered move`).toBe(true)
        expect(
          emitted.get(id)?.has(verb),
          `${verb} → ${id}, but ${id} never emits \`${verb}\` on any fixture`,
        ).toBe(true)
      }
    }
  })

  it('shall-to-should re-parses each culprit with exactly its `shall` turned into `should`', () => {
    // The parse normalizes `should` back to `shall`, so the moved document is identical to the
    // baseline on every fixture and no snapshot row can see this move. What the move DOES is
    // the sentence it types, so that is what is pinned: a sentence left as-is (the no-op), or
    // a different modal, is a different move wearing this one's name.
    const moves = MOVES.filter((m) => m.id.startsWith('shall-to-should@'))
    expect(moves.map((m) => m.id)).toEqual(['shall-to-should@first', 'shall-to-should@second'])
    for (const fixture of FIXTURES) {
      const doc = buildDoc(fixture.ops, MUTATE_OPTIONS)
      const ctx = {
        fixture,
        doc,
        baselineCodes: [],
        baselineFindings: [],
        waivability: waivabilityOf,
      }
      for (const move of moves) {
        const edit = move.edit(ctx)
        const label = `${fixture.id} × ${move.id}`
        expect(edit.kind, label).toBe('reparse')
        if (edit.kind !== 'reparse') continue
        const original = Object.values(doc.requirements).find(
          (r) => (r.key ?? r.id) === edit.ref,
        )?.sentence
        expect(original, label).toMatch(/\bshall\b/)
        expect(edit.sentence, label).toMatch(/\bshould\b/)
        expect(edit.sentence.replace(/\bshould\b/, 'shall'), label).toBe(original)
      }
    }
  })

  it('glossary-over-term writes the phrase its side names: the alias side the alias, the canonical side the canonical', () => {
    // Both sides escape on term-bridged, so the matrix alone cannot tell a canonical cell that
    // really writes the canonical from one that quietly writes the alias again. What the move
    // types is the difference a cross-table fence has to close on BOTH sides.
    const fixture = FIXTURES.find((f) => f.id === 'term-bridged')
    expect(fixture).toBeDefined()
    if (fixture === undefined) return
    const doc = buildDoc(fixture.ops, MUTATE_OPTIONS)
    const entry = doc.terms[0]
    expect(entry).toBeDefined()
    if (entry === undefined) return
    const ctx = {
      fixture,
      doc,
      baselineCodes: [],
      baselineFindings: [],
      waivability: waivabilityOf,
    }
    for (const move of MOVES.filter((m) => m.id.startsWith('glossary-over-term@'))) {
      const edit = move.edit(ctx)
      expect(edit.kind, move.id).toBe('ops')
      if (edit.kind !== 'ops') continue
      const glossary = edit.ops.find((o) => o.op === 'glossary')
      const alias = glossary !== undefined && 'alias' in glossary ? String(glossary.alias) : ''
      const side = move.id.includes('-canonical') ? entry.canonical : (entry.aliases[0] ?? '')
      const other = move.id.includes('-canonical') ? (entry.aliases[0] ?? '') : entry.canonical
      expect(alias.toLowerCase(), move.id).toContain(side.toLowerCase())
      expect(alias.toLowerCase(), move.id).not.toContain(other.toLowerCase())
    }
  })

  it('every KNOWN_ESCAPES row names a real pair, once, closed by a Story 4–7 AC the spec defines', () => {
    const fixtures = new Set(FIXTURES.map((f) => f.id))
    const pairs = KNOWN_ESCAPES.map((k) => `${k.fixture} × ${k.move}`)
    expect(pairs.length).toBe(new Set(pairs).size)
    for (const k of KNOWN_ESCAPES) {
      const label = `${k.fixture} × ${k.move}`
      expect(fixtures.has(k.fixture), label).toBe(true)
      expect(REGISTERED.has(k.move), label).toBe(true)
      // Stories 4–7 are the ones that close gaming moves; Story 8 is this gate, and Stories 1–3
      // are already merged, so a row naming either is mis-attributed.
      // A row may name the plan slice that lands the AC and what the slice does, as
      // `S4 / AC-4-2 (cross-table fence + check twin)`; the AC itself is still what is guarded.
      const cited = CLOSED_BY.exec(k.closedBy)?.[1]
      expect(cited, `${label}: closedBy ${k.closedBy}`).toMatch(/^AC-[4-7]-\d+$/)
      expect(SPEC, `${label} cites ${k.closedBy}, which the spec does not define`).toMatch(
        new RegExp(`^${cited}\\b`, 'm'),
      )
      expect(k.why.length, label).toBeGreaterThan(40)
    }
  })

  it('every KNOWN_NONMONOTONE row names a real strengthening pair, once, with what it loses', () => {
    // G-D reads only moves whose verbs all join to `strengthening`, so a row on any other move
    // could never be measured and would sit in the table as a stale permission slip.
    const fixtures = new Set(FIXTURES.map((f) => f.id))
    const pairs = KNOWN_NONMONOTONE.map((k) => `${k.fixture} × ${k.move}`)
    expect(pairs.length).toBe(new Set(pairs).size)
    for (const k of KNOWN_NONMONOTONE) {
      const label = `${k.fixture} × ${k.move}`
      expect(fixtures.has(k.fixture), label).toBe(true)
      const move = MOVES.find((m) => m.id === k.move)
      expect(move, label).toBeDefined()
      if (move === undefined) continue
      expect(moveDirection(move, MUTATE_OPTIONS), label).toBe('strengthening')
      expect(k.lost.length, label).toBeGreaterThan(0)
      const cited = CLOSED_BY.exec(k.closedBy)?.[1]
      expect(cited, `${label}: closedBy ${k.closedBy}`).toMatch(/^AC-[4-7]-\d+$/)
      expect(SPEC, `${label} cites ${k.closedBy}`).toMatch(new RegExp(`^${cited}\\b`, 'm'))
      expect(k.why.length, label).toBeGreaterThan(40)
    }
  })

  it('derives every registered move`s direction from the verbs it emits', () => {
    // The labels come from OP_DIRECTION, so a move is weakening the moment any verb it emits
    // is — `link-culprits` joins four edge verbs and stays strengthening, and `flip-negated`
    // joins `delete` and `add` and is weakening. Pinned on the cases where the join is the point.
    const direction = (id: string) => {
      const move = MOVES.find((m) => m.id === id)
      if (move === undefined) throw new Error(`no move ${id}`)
      return moveDirection(move, MUTATE_OPTIONS)
    }
    expect(direction('add-decoys')).toBe('strengthening')
    expect(direction('link-culprits')).toBe('strengthening')
    expect(direction('add-negation')).toBe('strengthening')
    expect(direction('add-bound-past-bystander')).toBe('strengthening')
    expect(direction('add-bystander-negation')).toBe('strengthening')
    expect(direction('branch-into-cycle')).toBe('strengthening')
    // An alias and a contrary axiom are weakening: each can discharge an opposition candidate
    // with nothing in its place.
    expect(direction('antonym-over-candidate')).toBe('weakening')
    expect(direction('alias-contraries-glossary@forward')).toBe('weakening')
    expect(direction('alias-contraries-term@forward')).toBe('weakening')
    expect(direction('delete-requirement@first')).toBe('weakening')
    expect(direction('flip-negated@first')).toBe('weakening')
    expect(direction('shall-to-should@first')).toBe('weakening')
    expect(direction('embedding-stub')).toBe('run-weakening')
  })

  it('a `near` pair meets at NEAR_COSINE: above the opposition floor, below the similarity threshold', async () => {
    expect(NEAR_COSINE).toBeGreaterThanOrEqual(DEFAULT_OPPOSITION_COSINE_FLOOR)
    expect(NEAR_COSINE).toBeLessThan(DEFAULT_SEMANTIC_THRESHOLD)
    const embed = orthogonalEmbedder([['fill the tank', 'drain the tank']])
    const [fill, drain, other] = await embed(['fill the tank', 'drain the tank', 'log the level'])
    const dot = (a?: Float32Array, b?: Float32Array) =>
      (a ?? new Float32Array()).reduce((sum, x, i) => sum + x * (b?.[i] ?? 0), 0)
    expect(dot(fill, fill)).toBeCloseTo(1, 6)
    expect(dot(fill, drain)).toBeCloseTo(NEAR_COSINE, 6)
    expect(dot(fill, other)).toBe(0)
    // And the fixture that exists for it declares a pair its culprits really say.
    const opposition = FIXTURES.find((f) => f.id === 'opposition-candidate')
    const doc = buildDoc(opposition?.ops ?? [], MUTATE_OPTIONS)
    const responses = Object.values(doc.requirements).map((r) => r.systemResponse)
    for (const phrase of opposition?.near?.flat() ?? []) expect(responses).toContain(phrase)
  })

  it('the shards partition the fixtures, and every shard has its file', () => {
    const sharded = Object.values(SHARDS).flat()
    expect(sharded.length, 'a fixture is in two shards').toBe(new Set(sharded).size)
    expect(new Set(sharded)).toEqual(new Set(FIXTURES.map((f) => f.id)))

    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir).filter((f) => /^gaming\.shard-.+\.test\.ts$/.test(f))
    expect(new Set(files)).toEqual(
      new Set(Object.keys(SHARDS).map((k) => `gaming.shard-${k}.test.ts`)),
    )
    for (const key of Object.keys(SHARDS)) {
      const source = readFileSync(`${dir}gaming.shard-${key}.test.ts`, 'utf8')
      expect(source, `gaming.shard-${key}.test.ts runs a different shard`).toContain(
        `describeGamingShard('${key}',`,
      )
    }
  })

  it('[S3-047] [S3-048] [S3-050] no KNOWN_ESCAPES row names a waive move, waive-by-code stays registered, and OP_COVERAGE.waive maps to moves that emit waive', () => {
    // The 11 waive-by-code rows (10 never-class fixtures + derives-cycle) are deleted, the move is
    // NOT: a refused move still measured is the gate, a deleted move is a blind spot.
    const waiveRows = KNOWN_ESCAPES.filter((k) => k.move.startsWith('waive')).map(
      (k) => `${k.fixture} × ${k.move}`,
    )
    expect(waiveRows, 'a waive move escapes nowhere once AC-5-6 lands').toEqual([])
    expect(KNOWN_ESCAPES.some((k) => k.move === 'waive-by-code')).toBe(false)
    expect(
      KNOWN_ESCAPES.some((k) => k.fixture === 'derives-cycle' && k.move === 'waive-by-code'),
    ).toBe(false)
    expect(REGISTERED.has('waive-by-code')).toBe(true)
    expect(AC_8_2.find((c) => c.clause === 'waive by code')?.moves).toContain('waive-by-code')

    // OP_COVERAGE.waive still measures: it maps to registered moves, the new scoped one among
    // them, and is not a written reason.
    const row = OP_COVERAGE.waive
    expect('moves' in row, 'waive must stay measured, not excused by a reason').toBe(true)
    const moves = 'moves' in row ? row.moves : []
    expect(moves).toContain('waive-by-code')
    expect(moves).toContain('waive-scoped-never')
    expect(moves, 'waive-raw emits no op, so it cannot cover the verb').not.toContain('waive-raw')
    for (const id of moves) expect(REGISTERED.has(id), id).toBe(true)
  })

  it('[S3-049] waive-scoped-never and waive-raw are registered and inapplicable on derives-cycle', () => {
    expect(REGISTERED.has('waive-scoped-never')).toBe(true)
    expect(REGISTERED.has('waive-raw')).toBe(true)
    const move = (id: string) => {
      const m = MOVES.find((x) => x.id === id)
      if (m === undefined) throw new Error(`no move ${id}`)
      return m
    }
    const cycle = FIXTURES.find((f) => f.id === 'derives-cycle')
    expect(cycle).toBeDefined()
    if (cycle === undefined) return
    expect(waivabilityOf('FND_CYCLE')).toBe('scoped')
    const doc = buildDoc(cycle.ops, MUTATE_OPTIONS)
    const ids = ['CYC-A', 'CYC-C'].map(
      (k) => Object.values(doc.requirements).find((r) => r.key === k)?.id ?? k,
    )
    // Even with a never-class finding in the report, the seeded FND_CYCLE is scoped-class: a
    // scoped waive of it is the designed discharge (R45), so neither move runs here.
    const ctx = {
      fixture: cycle,
      doc,
      baselineCodes: ['FND_CYCLE', 'FND_CONTRADICTION'],
      baselineFindings: [
        { code: 'FND_CYCLE', requirementIds: ids },
        { code: 'FND_CONTRADICTION', requirementIds: ids },
      ],
      waivability: waivabilityOf,
    }
    for (const id of ['waive-scoped-never', 'waive-raw']) {
      const edit = move(id).edit(ctx)
      expect(edit.kind, `derives-cycle × ${id}`).toBe('inapplicable')
      expect(editVerbs(edit, ctx), id).toEqual([])
    }
  })

  it('[S3-049] waive-scoped-never waives each never-class finding over its exact ids and current hash; waive-raw writes the same plus a code-only one per code, with no op', () => {
    const move = (id: string) => {
      const m = MOVES.find((x) => x.id === id)
      if (m === undefined) throw new Error(`no move ${id}`)
      return m
    }
    const fixture = FIXTURES.find((f) => f.id === 'one-trigger-contradiction')
    expect(fixture).toBeDefined()
    if (fixture === undefined) return
    const doc = buildDoc(fixture.ops, MUTATE_OPTIONS)
    const ids = fixture.culprits
      .map((k) => Object.values(doc.requirements).find((r) => r.key === k)?.id ?? k)
      .sort()
    const hash = requirementsContentHash(doc, ids)
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(waivabilityOf('FND_CONTRADICTION')).toBe('never')
    expect(waivabilityOf('GTWR_R7_VAGUE')).toBe('scoped')
    const ctx = {
      fixture,
      doc,
      baselineCodes: ['FND_CONTRADICTION', 'GTWR_R7_VAGUE'],
      baselineFindings: [
        { code: 'FND_CONTRADICTION', requirementIds: [...ids].reverse() },
        // A scoped-class finding is not this move's target.
        { code: 'GTWR_R7_VAGUE', requirementIds: [ids[0] ?? ''] },
        // A never-class finding that names no requirement cannot be scoped.
        { code: 'FND_CONTRADICTION', requirementIds: [] },
      ],
      waivability: waivabilityOf,
    }
    const scoped = move('waive-scoped-never').edit(ctx)
    expect(scoped).toEqual({
      kind: 'ops',
      ops: [
        {
          op: 'waive',
          code: 'FND_CONTRADICTION',
          refs: ids,
          contentHash: hash,
          reason: 'accepted for this release',
        },
      ],
    })
    expect(editVerbs(scoped, ctx)).toEqual(['waive'])

    const raw = move('waive-raw').edit(ctx)
    expect(raw).toEqual({
      kind: 'raw-waivers',
      waivers: [
        {
          code: 'FND_CONTRADICTION',
          requirementIds: ids,
          contentHash: hash,
          reason: 'accepted for this release',
        },
        { code: 'FND_CONTRADICTION', reason: 'accepted for this release' },
      ],
    })
    expect(editVerbs(raw, ctx), 'a hand edit emits no op').toEqual([])
    expect(moveDirection(move('waive-raw'), MUTATE_OPTIONS)).toBe('weakening')
    expect(moveDirection(move('waive-scoped-never'), MUTATE_OPTIONS)).toBe('weakening')
  })

  it('reports every move with its status, derived from the tables', async () => {
    const report = moveStatuses(MUTATE_OPTIONS)
      .map((s) => `${s.status}\t${s.direction}\t${s.id}\t${s.acs.join(',')}`)
      .join('\n')
    await expect(`${report}\n`).toMatchFileSnapshot('./__snapshots__/gaming-moves.txt')
    // Every registered and pending move is reported — the report is the complete AC-8-2 list.
    expect(moveStatuses(MUTATE_OPTIONS).length).toBe(REGISTERED.size + PENDING.size)
  })
})
