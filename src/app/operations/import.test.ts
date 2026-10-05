/**
 * Tests for `import` — and specifically for the ROUND TRIP against the two
 * hex-bonk production documents.
 *
 * ## Why the round trip is the test that matters
 *
 * The v2 → v3 migration has exactly two live subjects: hex-bonk's
 * `agent-run-triggers` and `schedule-management`. If `import` loses a requirement,
 * an edge, or a waiver from either, the migration story is broken for every real
 * user there is. So the round-trip assertions do not check "roughly the right
 * number" — they compare EVERY requirement field for field against the v2 source,
 * and every edge as a resolved (from, relation, to) triple.
 *
 * ## Why the op streams are DONOR-GENERATED
 *
 * `__fixtures__/*.ops.jsonl` is produced by `scripts/generate-import-fixtures.sh`,
 * which runs the DONOR CLI and harvests its `ERR_SCHEMA_VERSION` envelope. Had this
 * test synthesized the streams itself, it would only prove `import` agrees with
 * this file's idea of an op stream. The fixture is checked in so the suite is
 * hermetic, and a test below asserts it still LOOKS like v4 output, so a silent
 * hand edit to a fixture is caught.
 *
 * ## The gaps[] pass-through is checked, not assumed
 *
 * v4 discloses that timestamps do not reproduce. That disclosure must reach
 * the caller VERBATIM — softening it in v5's words would risk making a precise
 * statement vague, and dropping it would make the import claim more fidelity than
 * it has.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { RELATIONS, type Relation, type Requirement } from '../../domain/requirements/document.ts'
import { foldOps } from '../../domain/requirements/mutate.ts'
import type { DocumentOp } from '../../domain/requirements/ops.ts'
import { renderSentence } from '../../domain/requirements/render.ts'
import { resolveRef } from '../../domain/requirements/resolve.ts'
import {
  EDGE_OP_RELATION,
  EDGE_OPS,
  foldImportStream,
  parseSideTableCommand,
  tokenizeCommand,
} from './import.ts'
import { MUTATE_OPTIONS } from './mutate-options.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8')

/** The v2 source document, as the shape v4 read. */
interface V2Doc {
  readonly schemaVersion: number
  readonly requirements: Record<string, V2Requirement>
  readonly glossary?: readonly { canonical: string; aliases: string[] }[]
  readonly antonyms?: readonly { a: string; b: string }[]
  readonly waivers?: readonly { code: string; requirementId?: string; reason: string }[]
}

interface V2Requirement {
  readonly id: string
  readonly key?: string
  readonly patternType: string
  readonly preCondition?: string
  readonly trigger?: string
  readonly systemName: string
  readonly systemResponse: string
  readonly negated: boolean
  readonly sentence: string
  readonly priority: string
  readonly status: string
  readonly verificationMethod?: string
  readonly verificationNote?: string
  readonly derives: readonly string[]
  readonly satisfies: readonly string[]
  readonly verifies: readonly string[]
  readonly refines: readonly string[]
}

const TIMESTAMP = '2026-08-03T00:00:00.000Z'

const fold = (text: string) => Effect.runSync(foldImportStream(text, TIMESTAMP))

/** The two production documents under test, each with its v4-generated stream. */
const CASES = [
  { name: 'agent-run-triggers', slug: 'hex-bonk-agent-run-triggers' },
  { name: 'schedule-management', slug: 'hex-bonk-schedule-management' },
] as const

/** Every (from, relation, to) triple in a v2 document, as sorted comparable strings. */
const v2Edges = (doc: V2Doc): readonly string[] => {
  const out: string[] = []
  for (const r of Object.values(doc.requirements)) {
    for (const relation of RELATIONS) {
      for (const to of r[relation as keyof V2Requirement] as readonly string[]) {
        out.push(`${r.id} -${relation}-> ${to}`)
      }
    }
  }
  return out.sort()
}

/** Every (from, relation, to) triple in an imported v3 document. */
const v3Edges = (requirements: Readonly<Record<string, Requirement>>): readonly string[] => {
  const out: string[] = []
  for (const r of Object.values(requirements)) {
    for (const relation of RELATIONS) {
      for (const to of r[relation]) out.push(`${r.id} -${relation}-> ${to}`)
    }
  }
  return out.sort()
}

// ---------------------------------------------------------------------------
// THE ROUND TRIP
// ---------------------------------------------------------------------------

describe.each(CASES)('round trip: hex-bonk $name', ({ slug }) => {
  const source = JSON.parse(fixture(`${slug}.v2.json`)) as V2Doc
  const result = fold(fixture(`${slug}.ops.jsonl`))
  const imported = result.document.requirements

  it('imports EVERY requirement, by UUID', () => {
    expect(Object.keys(imported).sort()).toEqual(Object.keys(source.requirements).sort())
    expect(result.counts.requirements).toBe(Object.keys(source.requirements).length)
  })

  it('imports EVERY edge, as the same (from, relation, to) triples', () => {
    expect(v3Edges(imported)).toEqual(v2Edges(source))
    expect(result.counts.edges).toBe(v2Edges(source).length)
  })

  it('preserves every requirement FIELD FOR FIELD', () => {
    // The assertion that would catch a quietly dropped optional slot, which is the
    // failure mode a count-only check misses entirely.
    for (const [id, want] of Object.entries(source.requirements)) {
      const got = imported[id]
      expect(got, `requirement ${id} missing`).toBeDefined()
      if (got === undefined) continue
      expect(got.id).toBe(want.id)
      expect(got.key).toBe(want.key)
      expect(got.patternType).toBe(want.patternType)
      expect(got.preCondition).toBe(want.preCondition)
      expect(got.trigger).toBe(want.trigger)
      expect(got.systemName).toBe(want.systemName)
      expect(got.systemResponse).toBe(want.systemResponse)
      expect(got.negated).toBe(want.negated)
      expect(got.priority).toBe(want.priority)
      expect(got.status).toBe(want.status)
      expect(got.verificationMethod).toBe(want.verificationMethod)
      expect(got.verificationNote).toBe(want.verificationNote)
    }
  })

  it('preserves every stable KEY, so a doc driven by keys still resolves', () => {
    const sourceKeys = Object.values(source.requirements)
      .map((r) => r.key)
      .filter((k): k is string => k !== undefined)
      .sort()
    const importedKeys = Object.values(imported)
      .map((r) => r.key)
      .filter((k): k is string => k !== undefined)
      .sort()
    expect(importedKeys).toEqual(sourceKeys)
    // And each one resolves through the chokepoint.
    for (const key of sourceKeys) {
      expect(resolveRef(result.document, key)?.key, key).toBe(key)
    }
  })

  it('RE-RENDERS the sentence from the slots, matching the v2 stored text', () => {
    // v4 deliberately does not emit `sentence` — it is a denormalized view.
    // This asserts the round trip reproduces it anyway, which is only true if the
    // renderer is faithful AND every slot survived. Any drift here means one or the
    // other broke.
    for (const [id, want] of Object.entries(source.requirements)) {
      const got = imported[id]
      if (got === undefined) continue
      expect(got.sentence, `sentence for ${want.key ?? id}`).toBe(want.sentence)
      expect(renderSentence(got)).toBe(want.sentence)
    }
  })

  it('imports every glossary and antonym row the source carried', () => {
    expect(result.counts.antonyms).toBe(source.antonyms?.length ?? 0)
    // The glossary count compares CANONICAL ENTRIES, not commands: v4 emits
    // one command per ALIAS, so N aliases under one canonical must merge back into
    // one entry rather than becoming N single-alias entries.
    expect(result.counts.glossary).toBe(source.glossary?.length ?? 0)
  })

  it('passes the v4 gaps[] through VERBATIM', () => {
    expect(result.gaps.length).toBeGreaterThan(0)
    // The timestamp gap always applies to a document with requirements.
    expect(result.gaps.join(' ')).toContain('createdAt/updatedAt')
  })

  it('reports NO unresolved refs, NO duplicates, and NO unreadable lines', () => {
    expect(result.unresolved).toEqual([])
    expect(result.duplicates).toEqual([])
    // Ruling R13 (S3-012): the only problems are the waiver records the write fence refused.
    expect(result.problems.map((p) => p.line)).toEqual(result.refused.map((r) => r.line))
  })

  it('[S3-012] [S3-003] refuses every unscoped v4 waiver the source carried with ERR_WAIVER_REFUSED, on its line, and imports no waiver', () => {
    // Every v2 waiver here is code-only (`waive add <code>` with no `--ref`), and ruling R13
    // folds import's waivers through apply's classifier, which refuses a code-only waive (R5).
    const waivers = source.waivers ?? []
    expect(waivers.every((w) => w.requirementId === undefined)).toBe(true)
    expect(result.counts.waivers).toBe(0)
    expect(result.refused.length).toBe(waivers.length)
    for (const r of result.refused) {
      expect(r.op).toBe('waive')
      expect(r.code).toBe('ERR_WAIVER_REFUSED')
    }
  })

  it('stamps fresh timestamps — the one thing the stream provably cannot carry', () => {
    for (const r of Object.values(imported)) {
      expect(r.createdAt).toBe(TIMESTAMP)
      expect(r.updatedAt).toBe(TIMESTAMP)
    }
  })

  it('produces a v3 document with an empty state model and no responseKind', () => {
    // v2 could express neither, so an import must not invent either. A defaulted
    // responseKind would be a classification nobody made.
    expect(result.document.docVersion).toBe(3)
    expect(result.document.stateModel).toEqual({ variables: [] })
    for (const r of Object.values(imported)) {
      expect(Object.hasOwn(r, 'responseKind')).toBe(false)
    }
  })

  it('is DETERMINISTIC — the same stream folds to the same document', () => {
    expect(fold(fixture(`${slug}.ops.jsonl`)).document).toEqual(result.document)
  })
})

// ---------------------------------------------------------------------------
// The fixtures are still v4-shaped
// ---------------------------------------------------------------------------

describe('the checked-in op streams still look like DONOR output', () => {
  it.each(CASES)('$name uses the v4 three line kinds and nothing else', ({ slug }) => {
    // Guards against a hand edit that would quietly make the round trip test a test
    // of this file's imagination instead of v4's actual emitter.
    for (const line of fixture(`${slug}.ops.jsonl`).split('\n')) {
      const text = line.trim()
      if (text.length === 0) continue
      const known = text.startsWith('{') || text.startsWith('symspec ') || text.startsWith('#gap ')
      expect(known, `unexpected line kind: ${text.slice(0, 60)}`).toBe(true)
    }
  })

  it.each(CASES)('$name carries only op verbs import knows', ({ slug }) => {
    const known = new Set<string>(['add', ...EDGE_OPS, 'glossary', 'antonym', 'waive'])
    for (const line of fixture(`${slug}.ops.jsonl`).split('\n')) {
      if (!line.trim().startsWith('{')) continue
      const op = (JSON.parse(line) as { op: string }).op
      expect(known.has(op), `unknown op verb ${op}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// The edge-op table
// ---------------------------------------------------------------------------

describe('EDGE_OP_RELATION is the exact inverse of the v4 table', () => {
  it('maps every relation exactly once', () => {
    expect(Object.values(EDGE_OP_RELATION).sort()).toEqual([...RELATIONS].sort())
  })

  it('is the v4 RELATION_REPRODUCE_OP inverted', () => {
    // Restated verbatim from v4's `src/core/reproduce.ts`. If either side
    // gains a relation without the other, this fails — the same construction the
    // v4 kept its own two tables from drifting.
    const v4Table: Record<Relation, string> = {
      derives: 'derive',
      satisfies: 'satisfy',
      verifies: 'verify',
      refines: 'refine',
    }
    for (const [relation, verb] of Object.entries(v4Table)) {
      expect(EDGE_OP_RELATION[verb as keyof typeof EDGE_OP_RELATION]).toBe(relation)
    }
  })

  it('derives EDGE_OPS from the table, so the two cannot disagree', () => {
    expect([...EDGE_OPS].sort()).toEqual(Object.keys(EDGE_OP_RELATION).sort())
  })
})

// ---------------------------------------------------------------------------
// Command-line parsing
// ---------------------------------------------------------------------------

describe('side-table command parsing', () => {
  it('tokenizes bare and single-quoted arguments', () => {
    expect(tokenizeCommand('symspec glossary add open shut')).toEqual([
      'symspec',
      'glossary',
      'add',
      'open',
      'shut',
    ])
    expect(tokenizeCommand("symspec glossary add 'issue a token' 'grant a token'")).toEqual([
      'symspec',
      'glossary',
      'add',
      'issue a token',
      'grant a token',
    ])
  })

  it('unescapes the v4 embedded-quote spelling', () => {
    // v4 writes an embedded apostrophe as '\'' — a real waiver reason in the
    // agent-run-triggers fixture uses it ("document's vocabulary"), so getting this
    // wrong silently corrupts a reviewed audit trail.
    const tokens = tokenizeCommand(`symspec waive add X --reason 'the doc'\\''s vocabulary'`)
    expect(tokens[tokens.length - 1]).toBe("the doc's vocabulary")
  })

  it('parses `glossary add`', () => {
    expect(parseSideTableCommand("symspec glossary add 'issue a token' 'grant a token'")).toEqual({
      op: 'glossary',
      canonical: 'issue a token',
      alias: 'grant a token',
    })
  })

  it('parses `antonym add`', () => {
    expect(parseSideTableCommand('symspec antonym add open shut')).toEqual({
      op: 'antonym',
      a: 'open',
      b: 'shut',
    })
  })

  it('parses `waive add` with and without a scope', () => {
    expect(parseSideTableCommand("symspec waive add GTWR_R6 --reason 'a standard id'")).toEqual({
      op: 'waive',
      code: 'GTWR_R6',
      reason: 'a standard id',
    })
    expect(
      parseSideTableCommand(
        "symspec waive add GTWR_R6 --reason 'a standard id' --ref 550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toEqual({
      op: 'waive',
      code: 'GTWR_R6',
      reason: 'a standard id',
      ref: '550e8400-e29b-41d4-a716-446655440000',
    })
  })

  it('returns undefined for anything it does not recognize', () => {
    // A CLOSED parser: saying "I don't know this" beats half-executing something.
    for (const line of [
      'symspec check',
      'symspec glossary remove a b',
      'rm -rf /',
      'symspec waive add CODE',
      'symspec unknown add a b',
    ]) {
      expect(parseSideTableCommand(line), line).toBeUndefined()
    }
  })

  it('reports an unrecognized `symspec` command as a problem, not a crash', () => {
    const result = fold('symspec check --strict\n')
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.detail).toContain('Unrecognized')
    expect(result.problems[0]?.line).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Fold semantics
// ---------------------------------------------------------------------------

const ID_A = '550e8400-e29b-41d4-a716-446655440000'
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const addLine = (extra: Record<string, unknown>) =>
  JSON.stringify({
    op: 'add',
    patternType: 'ubiquitous',
    systemName: 'auth service',
    systemResponse: 'log every attempt',
    ...extra,
  })

describe('fold semantics', () => {
  it('resolves a FORWARD key reference — order in the file does not matter', () => {
    // v4 emits dependency-ordered streams, but a hand-written one must not
    // silently lose edges for putting an edge before its target. Two passes.
    const stream = [
      '{"op":"derive","from":"G1","to":"S1"}',
      addLine({ id: ID_A, key: 'G1' }),
      addLine({ id: ID_B, key: 'S1' }),
    ].join('\n')
    const result = fold(stream)
    expect(result.counts.edges).toBe(1)
    expect(result.document.requirements[ID_A]?.derives).toEqual([ID_B])
    expect(result.unresolved).toEqual([])
  })

  it('DROPS an edge with an unresolvable endpoint and DISCLOSES it', () => {
    // Writing it would put a non-UUID in an edge array (schema rejects) or a
    // dangling reference in the file (which would make the import a lie).
    const result = fold(
      [addLine({ id: ID_A, key: 'G1' }), '{"op":"derive","from":"G1","to":"NOPE"}'].join('\n'),
    )
    expect(result.counts.edges).toBe(0)
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0]?.ref).toBe('NOPE')
    expect(result.unresolved[0]?.detail).toContain('NOT created')
  })

  it('is idempotent on a repeated edge', () => {
    const result = fold(
      [
        addLine({ id: ID_A, key: 'G1' }),
        addLine({ id: ID_B, key: 'S1' }),
        '{"op":"derive","from":"G1","to":"S1"}',
        '{"op":"derive","from":"G1","to":"S1"}',
      ].join('\n'),
    )
    expect(result.document.requirements[ID_A]?.derives).toEqual([ID_B])
  })

  it('reports a duplicate id rather than overwriting', () => {
    const result = fold([addLine({ id: ID_A }), addLine({ id: ID_A })].join('\n'))
    expect(result.counts.requirements).toBe(1)
    expect(result.duplicates).toEqual([`id ${ID_A}`])
  })

  it('reports a duplicate KEY rather than overwriting', () => {
    const result = fold(
      [addLine({ id: ID_A, key: 'G1' }), addLine({ id: ID_B, key: 'G1' })].join('\n'),
    )
    expect(result.counts.requirements).toBe(1)
    expect(result.duplicates).toEqual(['key G1'])
  })

  it('DERIVES a deterministic id when an add carries none', () => {
    // Never random: a random id makes the same input produce a different document
    // every run, which breaks determinism and makes an import undiffable.
    const stream = addLine({ key: 'G1' })
    const a = fold(stream)
    const b = fold(stream)
    const idA = Object.keys(a.document.requirements)[0]
    expect(idA).toBeDefined()
    expect(Object.keys(b.document.requirements)).toEqual([idA])
    // And it is UUID-shaped, so it satisfies the document schema.
    expect(idA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('derives DIFFERENT ids for different keys and same for the same key', () => {
    const two = fold([addLine({ key: 'G1' }), addLine({ key: 'G2' })].join('\n'))
    expect(Object.keys(two.document.requirements)).toHaveLength(2)
  })

  it('rejects one bad op record as a PROBLEM without aborting the rest', () => {
    // An import over 82 records must report the one bad line, not abort and leave
    // the caller guessing which.
    const result = fold(
      [addLine({ id: ID_A }), '{"op":"add","bogusField":1}', addLine({ id: ID_B })].join('\n'),
    )
    expect(result.counts.requirements).toBe(2)
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.line).toBe(2)
  })

  it('reports a line that starts with { but is not JSON', () => {
    const result = fold('{not json\n')
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.detail).toContain('not valid JSON')
  })

  it('SKIPS prose without complaining — a real stream has step headers in it', () => {
    const result = fold(
      ['Step 2 — write the following op records:', addLine({ id: ID_A }), '', 'Done.'].join('\n'),
    )
    expect(result.counts.requirements).toBe(1)
    expect(result.problems).toEqual([])
    expect(result.linesSkipped).toBeGreaterThan(0)
  })

  it('carries #gap lines through', () => {
    const result = fold(['#gap timestamps do not reproduce', addLine({ id: ID_A })].join('\n'))
    expect(result.gaps).toEqual(['timestamps do not reproduce'])
  })

  it('MERGES glossary aliases under one canonical entry', () => {
    // v4 emits one command per alias; N appends would produce N entries
    // where the source had one.
    const result = fold(
      [
        "symspec glossary add 'issue a token' 'grant a token'",
        "symspec glossary add 'issue a token' 'mint a token'",
      ].join('\n'),
    )
    expect(result.document.glossary).toEqual([
      { canonical: 'issue a token', aliases: ['grant a token', 'mint a token'] },
    ])
  })

  it('treats an antonym pair as UNORDERED', () => {
    const result = fold(
      ['symspec antonym add open shut', 'symspec antonym add shut open'].join('\n'),
    )
    expect(result.document.antonyms).toHaveLength(1)
  })

  it('[S3-005] resolves a waiver scope written as a KEY into the stored UUID, as refs [id] plus the hash of its text', () => {
    // Ruling R37: `ref` is normalized to `refs: [ref]` and the fold computes the hash, so the
    // stored waiver is the exact-set form, never a bare `requirementId`.
    const result = fold(
      [
        addLine({ id: ID_A, key: 'G1' }),
        "symspec waive add GTWR_R6_MISSING_UNITS --reason 'ok' --ref G1",
      ].join('\n'),
    )
    expect(result.document.waivers).toHaveLength(1)
    expect(result.document.waivers[0]?.requirementIds).toEqual([ID_A])
    expect(result.document.waivers[0]?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(result.document.waivers[0]?.requirementId).toBeUndefined()
  })

  it('[S3-013] REFUSES an unresolvable waiver scope and never widens it to a document-wide waiver', () => {
    // Ruling R13 replaces the widening this test used to pin: a document-wide waiver is the
    // unscoped waiver the fold refuses (R5), so widening would smuggle it past the fence.
    const result = fold("symspec waive add GTWR_R6_MISSING_UNITS --reason 'ok' --ref NOPE\n")
    expect(result.document.waivers).toEqual([])
    expect(result.refused.map((r) => r.line)).toEqual([1])
    expect(result.problems.map((p) => p.line)).toEqual([1])
    expect(JSON.stringify(result)).not.toContain('UNSCOPED')
  })

  it('accepts responseKind on an add — the v3 field a v5-generated stream can carry', () => {
    const result = fold(addLine({ id: ID_A, responseKind: 'constraint' }))
    expect(result.document.requirements[ID_A]?.responseKind).toBe('constraint')
  })

  it('applies create-time defaults for omitted metadata', () => {
    const r = fold(addLine({ id: ID_A })).document.requirements[ID_A]
    expect(r).toMatchObject({ negated: false, priority: 'medium', status: 'draft' })
  })

  it('folds an EMPTY stream into an empty document without failing', () => {
    const result = fold('')
    expect(result.counts.requirements).toBe(0)
    expect(result.document.docVersion).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// The write-time fences — the SAME ones `apply` runs
// ---------------------------------------------------------------------------

describe('side-table records pass the fences `apply` runs', () => {
  it('REFUSES the antonym record that closes an odd polarity cycle, and keeps the rest', () => {
    // A triangle of invented verbs is odd whatever the seed table holds: the third pair demands
    // zork ≡ ¬frob while the first two already make zork ≡ frob. An antonym is the one record
    // whose wrong value MANUFACTURES a contradiction, so an import that committed it would write
    // a document `apply` could never have produced.
    const result = fold(
      [
        'symspec antonym add zork blip',
        'symspec antonym add blip frob',
        'symspec antonym add frob zork',
      ].join('\n'),
    )
    expect(result.document.antonyms).toEqual([
      { a: 'zork', b: 'blip' },
      { a: 'blip', b: 'frob' },
    ])
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.line).toBe(3)
    expect(result.problems[0]?.detail).toContain('inconsistent')
    // The refusal is ALSO a fence refusal the operation turns into an error-severity finding
    // (exit 1, the contract `apply` has since AC-1-6), with the same line.
    expect(result.refused).toEqual([
      expect.objectContaining({ line: 3, op: 'antonym', code: 'ERR_USAGE' }),
    ])
  })

  it('REFUSES a glossary alias that is a contrary of its canonical', () => {
    // The seed pair open/close says the two cannot both happen; an entry naming both says they
    // are one action. `apply` refuses it (validateGlossary), so `import` must too.
    const result = fold('{"op":"glossary","canonical":"open the door","alias":"close the door"}\n')
    expect(result.document.glossary).toEqual([])
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.line).toBe(1)
    expect(result.problems[0]?.detail).toContain('contrary')
  })

  it('folds records in STREAM order, whichever spelling each line uses', () => {
    // Command lines and JSON records are two spellings of one stream. Folding every record
    // before every command would apply this glossary alias before the antonym that makes it a
    // contrary, so `apply` over the same lines refuses what `import` would commit.
    const result = fold(
      [
        'symspec antonym add heat cool',
        '{"op":"glossary","canonical":"heat the cabin","alias":"cool the cabin"}',
      ].join('\n'),
    )
    expect(result.document.antonyms).toEqual([{ a: 'heat', b: 'cool' }])
    expect(result.document.glossary).toEqual([])
    expect(result.problems.map((p) => p.line)).toEqual([2])
  })

  it('counts only FENCE refusals as refused: an unreadable line is a problem, not a refusal', () => {
    // Exit 1 means "a record you wrote was refused by a check `apply` runs". A line the reader
    // could not parse is disclosed in problems[] too, but it never met a fence, so it is not one.
    const result = fold(
      [
        '{"op":"glossary","canonical":"open the door","alias":"close the door"}',
        '{not json',
        'symspec frobnicate add x y',
      ].join('\n'),
    )
    expect(result.problems.map((p) => p.line)).toEqual([1, 2, 3])
    expect(result.refused.map((r) => r.line)).toEqual([1])
    expect(fold('{not json\n').refused).toEqual([])
  })

  it('writes the side tables EXACTLY as `apply` folds the same records', () => {
    // Parity, not a list of refusals: any fence `apply` gains, and any normalization it
    // applies, reaches `import` because both fold through one `applyOp` under one options set.
    const records: readonly DocumentOp[] = [
      { op: 'glossary', canonical: 'Issue a Token', alias: 'grant a token' },
      { op: 'glossary', canonical: 'issue a token', alias: 'mint a token' },
      { op: 'antonym', a: 'Lock', b: 'Unlatch' },
      { op: 'antonym', a: 'unlatch', b: 'lock' },
      { op: 'waive', code: 'GTWR_R6', reason: 'reviewed', ref: 'G1' },
      { op: 'waive', code: 'GTWR_R6', reason: 'reviewed again', ref: 'G1' },
    ]
    const imported = fold(
      [addLine({ id: ID_A, key: 'G1' }), ...records.map((r) => JSON.stringify(r))].join('\n'),
    )
    const base = fold(addLine({ id: ID_A, key: 'G1' })).document
    const applied = foldOps(base, records, TIMESTAMP, MUTATE_OPTIONS)
    expect(applied.abortedAt).toBeUndefined()
    expect(imported.problems).toEqual([])
    expect({
      glossary: imported.document.glossary,
      antonyms: imported.document.antonyms,
      waivers: imported.document.waivers,
    }).toEqual({
      glossary: applied.document.glossary,
      antonyms: applied.document.antonyms,
      waivers: applied.document.waivers,
    })
  })
})

// ---------------------------------------------------------------------------
// S3 Waivability (AC-5-6): import folds every waiver through apply's classifier
// ---------------------------------------------------------------------------

describe('S3: import refuses the waivers apply refuses (readings settled examples 14 and 15)', () => {
  const s3Text = (name: string): string =>
    readFileSync(
      fileURLToPath(
        new URL(`../../testing/__fixtures__/s3-waivability/import/${name}`, import.meta.url),
      ),
      'utf8',
    )
  const v4 = s3Text('v4-waivers.txt')
  const v4Lines = v4.split('\n')
  /** The 1-based line of the one record that contains every fragment. */
  const lineOf = (...fragments: readonly string[]): number => {
    const hits = v4Lines.flatMap((l, i) =>
      !l.startsWith('#') && fragments.every((f) => l.includes(f)) ? [i + 1] : [],
    )
    if (hits.length !== 1)
      throw new Error(`fixture: ${fragments.join(' ')} on ${hits.length} lines`)
    return hits[0] as number
  }
  const LINE = {
    I1: lineOf("GTWR_R5_INDEFINITE_ARTICLE --reason 'indefinite articles are house style'"),
    I2: lineOf('GTWR_R5_INDEFINITE_ARTICLE', '--ref 5a1e0000-0000-4000-8000-0000000000a2'),
    I3: lineOf('FND_OPPOSITION_CANDIDATE', '--ref 5a1e0000-0000-4000-8000-0000000000c1'),
    I4: lineOf('GTWR_R7_VAGUE', '--ref 5a1e0000-0000-4000-8000-0000000000ff'),
    I5: lineOf('"code":"FND_CONTRADICTION"'),
    I6: lineOf('"code":"GTWR_R7_VAGUE"', '"ref":"ORD-R2"'),
  }
  const LOG_R2 = '5a1e0000-0000-4000-8000-0000000000a2'
  const ORD_R2 = '5a1e0000-0000-4000-8000-0000000000b2'

  it('[S3-012] v4-waivers.txt: I1 (code-only), I3 and I5 (never class) are refused ERR_WAIVER_REFUSED into problems[], and the six requirements are written', () => {
    const result = fold(v4)
    expect(result.counts.requirements).toBe(6)
    const refused = new Map(result.refused.map((r) => [r.line, r]))
    for (const line of [LINE.I1, LINE.I3, LINE.I5]) {
      expect(refused.get(line)?.code, `line ${line}`).toBe('ERR_WAIVER_REFUSED')
    }
    const problemLines = result.problems.map((p) => p.line)
    for (const line of [LINE.I1, LINE.I3, LINE.I4, LINE.I5]) expect(problemLines).toContain(line)
    // No never-class waiver and no code-only waiver reaches the document.
    for (const w of result.document.waivers) {
      expect(['FND_OPPOSITION_CANDIDATE', 'FND_CONTRADICTION']).not.toContain(w.code)
      expect(w.requirementIds, JSON.stringify(w)).toBeDefined()
      expect(w.contentHash, JSON.stringify(w)).toBeDefined()
    }
  })

  it('[S3-012] [S3-005] v4-waivers.txt: I2 and I6 are accepted as refs [id] plus the computed hash (imported.waivers 2)', () => {
    const result = fold(v4)
    expect(result.counts.waivers).toBe(2)
    const stored = result.document.waivers.map((w) => [w.code, w.requirementIds, w.requirementId])
    expect(stored).toEqual([
      ['GTWR_R5_INDEFINITE_ARTICLE', [LOG_R2], undefined],
      ['GTWR_R7_VAGUE', [ORD_R2], undefined],
    ])
    expect(result.document.waivers.map((w) => w.contentHash)).toEqual([
      'sha256:c2bd1271a31955317e36a3ede3361500f1061ac287576762e1e60f4d7227e42a',
      'sha256:447120f0804d769c9c5e1c0b473058543e1cc9dcbf30776a0d6f16b5956067e3',
    ])
  })

  it('[S3-013] v4-waivers.txt: I4, whose --ref matches no requirement, is refused and never widened to a document-wide GTWR_R7_VAGUE waiver', () => {
    const result = fold(v4)
    expect(result.refused.map((r) => r.line)).toContain(LINE.I4)
    const r7 = result.document.waivers.filter((w) => w.code === 'GTWR_R7_VAGUE')
    expect(r7.map((w) => w.requirementIds)).toEqual([[ORD_R2]])
    expect(result.unresolved.some((u) => /UNSCOPED|document-wide/i.test(u.detail))).toBe(false)
  })

  it('[S3-014] scoped-record.txt: a JSONL waive record with refs and contentHash is accepted (no unexpected-keys problem) and stored as requirementIds [LOG-R1] plus that hash', () => {
    const result = fold(s3Text('scoped-record.txt'))
    expect(result.problems).toEqual([])
    expect(result.counts.waivers).toBe(1)
    expect(result.document.waivers.map(({ reason: _r, ...w }) => w)).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: ['5a1e0000-0000-4000-8000-0000000000a1'],
        contentHash: 'sha256:fd8b2c50a779708a19c161d83262563c7d8826c3f749072ab3eaf58b2c286ae0',
      },
    ])
  })

  it('[S3-015] each refused waiver is named with its line, its finding code, its scope as written and a replacement, and no remedy this build lacks', () => {
    const result = fold(v4)
    const scopes: Record<number, readonly string[]> = {
      [LINE.I1]: ['GTWR_R5_INDEFINITE_ARTICLE'],
      [LINE.I3]: ['FND_OPPOSITION_CANDIDATE', '5a1e0000-0000-4000-8000-0000000000c1'],
      [LINE.I4]: ['GTWR_R7_VAGUE', '5a1e0000-0000-4000-8000-0000000000ff'],
      [LINE.I5]: ['FND_CONTRADICTION', 'ORD-R1'],
    }
    for (const [line, names] of Object.entries(scopes)) {
      const r = result.refused.find((x) => x.line === Number(line))
      expect(r, `line ${line} refused`).toBeDefined()
      for (const name of names) expect(r?.detail, `line ${line}`).toContain(name)
      expect(r?.suggestions.length ?? 0, `line ${line}: a replacement`).toBeGreaterThan(0)
      const text = [r?.detail ?? '', ...(r?.suggestions ?? [])].join('\n')
      expect(text).not.toMatch(/vocab\s+distinct|propose-vocabulary|--rescope-waivers/i)
    }
  })

  it('[S3-012] import folds waivers exactly as apply does: each record refused or stored the same way under MUTATE_OPTIONS', () => {
    // The contract that makes R13 one fence rather than two: for each v4 record, apply's own
    // fold over the imported requirements gives the same verdict as import.
    const imported = fold(v4)
    const requirementsOnly = fold(
      v4Lines
        .filter((l) => !l.includes('"op":"waive"') && !l.startsWith('symspec waive'))
        .join('\n'),
    ).document
    const probes: readonly { readonly line: number; readonly op: DocumentOp }[] = [
      { line: LINE.I1, op: { op: 'waive', code: 'GTWR_R5_INDEFINITE_ARTICLE', reason: 'r' } },
      {
        line: LINE.I3,
        op: { op: 'waive', code: 'FND_OPPOSITION_CANDIDATE', reason: 'r', ref: 'CAB-R1' },
      },
      { line: LINE.I5, op: { op: 'waive', code: 'FND_CONTRADICTION', reason: 'r', ref: 'ORD-R1' } },
      { line: LINE.I6, op: { op: 'waive', code: 'GTWR_R7_VAGUE', reason: 'r', ref: 'ORD-R2' } },
    ]
    const viaApply = probes.map(({ op }) => {
      const r = foldOps(requirementsOnly, [op], TIMESTAMP, MUTATE_OPTIONS).results[0]
      return r?.ok === true ? 'stored' : (r?.code ?? '?')
    })
    const viaImport = probes.map(
      ({ line }) => imported.refused.find((r) => r.line === line)?.code ?? 'stored',
    )
    expect(viaImport).toEqual(viaApply)
    expect(viaApply).toEqual([
      'ERR_WAIVER_REFUSED',
      'ERR_WAIVER_REFUSED',
      'ERR_WAIVER_REFUSED',
      'stored',
    ])
  })
})
