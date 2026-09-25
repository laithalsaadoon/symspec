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
import { OP_VERBS, type OpVerb } from '../domain/requirements/ops.ts'
import {
  AC_8_2,
  buildDoc,
  editVerbs,
  FIXTURES,
  KNOWN_ESCAPES,
  MOVES,
  moveStatuses,
  NOT_APPLICABLE_YET,
  OP_COVERAGE,
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
    const emitted = new Map<string, Set<OpVerb>>()
    for (const fixture of FIXTURES) {
      const ctx = {
        fixture,
        doc: buildDoc(fixture.ops, MUTATE_OPTIONS),
        baselineCodes: ['FND_PLACEHOLDER'],
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
      const ctx = { fixture, doc, baselineCodes: [] }
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
      expect(k.closedBy, label).toMatch(/^AC-[4-7]-\d+$/)
      expect(SPEC, `${label} cites ${k.closedBy}, which the spec does not define`).toMatch(
        new RegExp(`^${k.closedBy}\\b`, 'm'),
      )
      expect(k.why.length, label).toBeGreaterThan(40)
    }
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

  it('reports every move with its status, derived from the tables', async () => {
    const report = moveStatuses()
      .map((s) => `${s.status}\t${s.direction}\t${s.id}\t${s.acs.join(',')}`)
      .join('\n')
    await expect(`${report}\n`).toMatchFileSnapshot('./__snapshots__/gaming-moves.txt')
    // Every registered and pending move is reported — the report is the complete AC-8-2 list.
    expect(moveStatuses().length).toBe(REGISTERED.size + PENDING.size)
  })
})
