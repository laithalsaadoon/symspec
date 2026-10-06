/**
 * THE REPORT CORPUS SNAPSHOT — gate G-C's BEFORE, taken while no vocabulary code exists.
 *
 * The corpus, the row and the run are defined in `./report-corpus.ts`; this file WIRES the real
 * `check` operation and the real solver in (a test may compose every ring) and pins the result.
 *
 * ## What a diff here means
 *
 * - a row's `findings` or `demotions` CHANGING is a verdict change on that document — argue it in
 *   the commit, or it is a regression;
 * - `verified=false` becoming `verified=true` is the direction that ends an agent's loop early,
 *   and is never a side effect;
 * - a row DISAPPEARING is a document the corpus stopped checking, which is why the row count is
 *   asserted below against the sources rather than read off the snapshot.
 *
 * The file is compared, never re-created by the gate: `vitest run` under `CI` refuses to write a
 * missing or changed file snapshot, and an intended change is re-pinned only with `vitest -u`,
 * which makes it a reviewed diff.
 */

import { readdirSync } from 'node:fs'
import { Effect } from 'effect'
import { beforeAll, describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../adapters/z3/solver-service.ts'
import { checkOp } from '../app/operations/check.ts'
import { MUTATE_OPTIONS } from '../app/operations/mutate-options.ts'
import { exitCodeForEnvelope } from '../app/runtime/exit.ts'
import { runOperation } from '../app/runtime/operation.ts'
import { waivabilityOf } from '../app/runtime/signal-classes.ts'
import type { RequirementsDocument } from '../domain/requirements/document.ts'
import { foldOps } from '../domain/requirements/mutate.ts'
import { decodeOp } from '../domain/requirements/ops.ts'
import {
  argvRejections,
  rejectionLines,
  symspecCommandsDeep,
  WAIVE_INFLECTION,
} from './cli-argv.ts'
import { evalRoundCases } from './eval-rounds.ts'
import { fabricationCases } from './fabrication.ts'
import { ARMED, FIXTURES } from './gaming.ts'
import { REPORT_CORPORA, renderReportCorpus, reportSources } from './report-corpus.ts'
import {
  type CheckData,
  type CheckWiring,
  checkDocument,
  fixtureDoc,
  fixturePath,
} from './waiver-fixture.ts'

describe('the report corpus', () => {
  let text = ''
  beforeAll(async () => {
    text = await renderReportCorpus({
      check: (input) =>
        runOperation(checkOp, input).pipe(
          Effect.map((envelope) => ({ exit: exitCodeForEnvelope(envelope), data: envelope.data })),
        ),
      solver: solverServiceLayer,
      mutateOptions: MUTATE_OPTIONS,
    })
  }, 300_000)

  it('renders every document the corpus runs, byte-stable', async () => {
    await expect(text).toMatchFileSnapshot('./__snapshots__/report-corpus.txt')
  })

  it('has exactly one row per document, and every corpus contributes', () => {
    const rows = text.trimEnd().split('\n')
    const labels = rows.map((r) => r.split('\t')[0] ?? '')
    // DERIVED, not typed: the sources own the number. A dropped or merged row is a document the
    // gate stopped checking, and a literal here would be a second count to keep in step.
    expect(rows.length).toBe(reportSources(MUTATE_OPTIONS).length)
    expect(new Set(labels).size, 'two documents share a label').toBe(labels.length)
    const count = (corpus: string) => labels.filter((l) => l.startsWith(`${corpus}/`)).length
    expect(count('eval-rounds')).toBe(evalRoundCases().length)
    expect(count('fabrication')).toBe(fabricationCases().length)
    expect(count('gaming')).toBe(FIXTURES.length)
    // Plus the waived-blocking-lint twin, kept as a corpus row after G3 (ruling R26) took it
    // out of the gaming controls.
    expect(count('gaming-control')).toBe(
      FIXTURES.filter((f) => 'ops' in f.control || f.id === 'waived-blocking-lint').length,
    )
    for (const corpus of REPORT_CORPORA) expect(count(corpus), corpus).toBeGreaterThan(0)
  })

  it('is non-vacuous — the corpus holds both clean and unclean verdicts', () => {
    // A corpus of only dirty documents cannot show a lost `verified`, and one of only clean
    // documents cannot show a lost finding. Parity is only a claim if both kinds are present.
    const rows = text.trimEnd().split('\n')
    expect(rows.some((r) => r.includes('\texit=0\tverified=true\t'))).toBe(true)
    expect(rows.some((r) => r.includes('\tverified=false\t'))).toBe(true)
    expect(
      rows.some((r) => /\/error\[/.test(r)),
      'no error-severity finding anywhere',
    ).toBe(true)
    // The stub embedder is disclosed as `run-weakened` on every run, so a row carrying it means
    // the corpus stopped running on the orthogonal table and every verdict is a weakened one.
    expect(text, 'the run fell back to the embedding stub').not.toContain('run-weakened')
  })
})

// ---------------------------------------------------------------------------
// S3 (spec 007 AC-5-6): the advice the row leaves out, over every corpus and fixture document
// ---------------------------------------------------------------------------

/** One document's full `check` payload, kept so the prose the row omits can be read. */
interface AdviceRun {
  readonly label: string
  readonly doc: RequirementsDocument
  readonly data: CheckData
}

/** The S3 fixture documents: base, legacy-mixed, every stored case and every hand-edited one. */
const fixtureDocNames = (): readonly string[] => [
  'base.json',
  'legacy-mixed.json',
  ...readdirSync(fixturePath('cases'))
    .filter((f) => f.endsWith('.stored.json') || (f.startsWith('hand-') && f.endsWith('.json')))
    .sort()
    .map((f) => `cases/${f}`),
]

/**
 * The never-class code each demotion reason is raised by: its action is advice about that code,
 * so it may not say "waive" (R29). `excluded-from-formal` is absent on purpose: its blocking code
 * is a GtWR lint, which is scoped, and S3-041 governs its waive.
 */
const DEMOTION_CODE: Readonly<Record<string, string>> = {
  'open-opposition-candidate': 'FND_OPPOSITION_CANDIDATE',
  'opposite-polarity-near-duplicate': 'FND_SIMILAR_SEMANTIC',
  'quantity-alias-candidate': 'FND_QUANTITY_ALIAS_CANDIDATE',
  'relational-reasoning-not-attempted': 'FND_RELATIONAL_UNCHECKED',
  'numeric-bounds-uncompared': 'FND_NUMERIC_UNCOMPARED',
  'number-spelling-candidate': 'FND_NUMBER_SPELLING_CANDIDATE',
  'inconclusive-group': 'FND_NEEDS_REVIEW',
}

/** The commands and flags this build does not have (R24, R36). */
const UNBUILT = ['vocab distinct', 'propose-vocabulary', '--rescope-waivers'] as const

/** Every `repair` object anywhere in a payload, with its JSON path. */
const repairsIn = (
  value: unknown,
  path = 'data',
): readonly { readonly path: string; readonly ops: readonly unknown[] }[] => {
  if (Array.isArray(value)) return value.flatMap((v, i) => repairsIn(v, `${path}[${i}]`))
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, v]) => {
    const here =
      key === 'repair' &&
      v !== null &&
      typeof v === 'object' &&
      Array.isArray((v as { ops?: unknown }).ops)
        ? [{ path: `${path}.repair`, ops: (v as { ops: readonly unknown[] }).ops }]
        : []
    return [...here, ...repairsIn(v, `${path}.${key}`)]
  })
}

/** Every string anywhere in a payload, with its JSON path. */
const stringsIn = (value: unknown, path = 'data'): readonly (readonly [string, string])[] => {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((v, i) => stringsIn(v, `${path}[${i}]`))
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, v]) => stringsIn(v, `${path}.${key}`))
}

const TS = '2026-01-01T00:00:00.000Z'

/** A failure message listing at most ten offenders, so a red run names where to look. */
const listed = (offenders: readonly string[]): string =>
  `${offenders.length} offender(s):\n${offenders.slice(0, 10).join('\n')}`

describe('[S3-039][S3-040][S3-045] the advice over every corpus and fixture document', () => {
  const runs: AdviceRun[] = []
  const wiring: CheckWiring = {
    check: (input) =>
      runOperation(checkOp, input).pipe(
        Effect.map((envelope) => ({
          exit: exitCodeForEnvelope(envelope),
          data: envelope.data as unknown,
        })),
      ),
    solver: solverServiceLayer,
  }

  beforeAll(async () => {
    // The corpus run exactly as the row renders it (`--strict` under ARMED, the fixture's own
    // near pairs), then the S3 fixture documents under their own embedder.
    for (const { label, doc, near } of reportSources(MUTATE_OPTIONS)) {
      const run = await checkDocument(wiring, doc, { strict: true, ...ARMED }, near ?? [])
      runs.push({ label, doc, data: run.data })
    }
    for (const name of fixtureDocNames()) {
      const doc = fixtureDoc(name)
      const run = await checkDocument(wiring, doc)
      runs.push({ label: `s3-fixture/${name}`, doc, data: run.data })
    }
  }, 300_000)

  it('[S3-039] runs every corpus document and every S3 fixture document', () => {
    expect(runs.length).toBe(reportSources(MUTATE_OPTIONS).length + fixtureDocNames().length)
    expect(fixtureDocNames()).toEqual(expect.arrayContaining(['base.json', 'legacy-mixed.json']))
    expect(fixtureDocNames().some((n) => n.startsWith('cases/hand-'))).toBe(true)
    // Non-vacuous: the sweep below reads real repairs, not an empty payload.
    expect(runs.some((r) => repairsIn(r.data).length > 0)).toBe(true)
  })

  it('[S3-039] every repair op decodes and folds under MUTATE_OPTIONS on the checked document', () => {
    const offenders: string[] = []
    for (const { label, doc, data } of runs) {
      for (const { path, ops } of repairsIn(data)) {
        for (const [i, op] of ops.entries()) {
          const where = `${label} ${path}.ops[${i}] ${JSON.stringify(op)}`
          const decoded = Effect.runSync(Effect.result(decodeOp(op)))
          if (decoded._tag === 'Failure') {
            offenders.push(`${where}: does not decode`)
            continue
          }
          const folded = foldOps(doc, [decoded.success], TS, MUTATE_OPTIONS)
          if (folded.abortedAt !== undefined) {
            const entry = folded.results[folded.abortedAt]
            offenders.push(`${where}: refused ${entry?.code}: ${entry?.error}`)
          }
        }
      }
    }
    expect(offenders.length, listed(offenders)).toBe(0)
  })

  it('[S3-039] no offered waive op names a never-class code', () => {
    const offenders: string[] = []
    for (const { label, data } of runs) {
      for (const { path, ops } of repairsIn(data)) {
        for (const op of ops as readonly Readonly<Record<string, unknown>>[]) {
          if (op.op !== 'waive') continue
          const code = String(op.code)
          if (waivabilityOf(code) !== 'scoped') {
            offenders.push(`${label} ${path}: waive ${code} (${waivabilityOf(code) ?? 'unknown'})`)
          }
        }
      }
    }
    expect(offenders.length, listed(offenders)).toBe(0)
  })

  it('[S3-040] no finding message or suggestion for a never-class code says "waive"', () => {
    const offenders: string[] = []
    for (const { label, data } of runs) {
      for (const f of data.findings) {
        if (waivabilityOf(f.code) !== 'never') continue
        for (const [field, text] of [
          ['message', f.message],
          ['suggestion', f.suggestion],
        ] as const) {
          if (text !== undefined && /waive/i.test(text)) {
            offenders.push(`${label} ${f.code}.${field}: ${text}`)
          }
        }
      }
    }
    expect(offenders.length, listed(offenders)).toBe(0)
  })

  it('[S3-040] no demotion action for a never-class code says "waive"', () => {
    for (const code of Object.values(DEMOTION_CODE)) {
      expect(waivabilityOf(code), code).toBe('never')
    }
    const offenders: string[] = []
    for (const { label, data } of runs) {
      for (const d of data.coverage.demotions) {
        const code = DEMOTION_CODE[d.reason]
        if (code === undefined) continue
        if (d.action !== undefined && /waive/i.test(d.action)) {
          offenders.push(`${label} ${d.reason} (${code}): ${d.action}`)
        }
      }
    }
    expect(offenders.length, listed(offenders)).toBe(0)
  })

  it('[S3-045] no string anywhere in a payload names vocab distinct, propose-vocabulary or --rescope-waivers', () => {
    const offenders: string[] = []
    for (const { label, data } of runs) {
      for (const [path, text] of stringsIn(data)) {
        if (UNBUILT.some((u) => text.includes(u))) offenders.push(`${label} ${path}: ${text}`)
      }
    }
    expect(offenders.length, listed(offenders)).toBe(0)
  })

  it('[S3-040] no finding message or suggestion for a never-class code uses any inflection of "waive" (waive, waives, waived, waiving, waiver, waivers) (R56)', () => {
    const offenders: string[] = []
    let read = 0
    for (const { label, data } of runs) {
      for (const f of data.findings) {
        if (waivabilityOf(f.code) !== 'never') continue
        for (const [field, text] of [
          ['message', f.message],
          ['suggestion', f.suggestion],
        ] as const) {
          if (text === undefined) continue
          read += 1
          if (WAIVE_INFLECTION.test(text)) offenders.push(`${label} ${f.code}.${field}: ${text}`)
        }
      }
    }
    expect(read, 'no never-class prose to read').toBeGreaterThan(20)
    expect(offenders.length, listed(offenders)).toBe(0)
  })

  it('[S3-040] no demotion action for a never-class code uses any inflection of "waive" (R56)', () => {
    const offenders: string[] = []
    let read = 0
    for (const { label, data } of runs) {
      for (const d of data.coverage.demotions) {
        const code = DEMOTION_CODE[d.reason]
        if (code === undefined || d.action === undefined) continue
        read += 1
        if (WAIVE_INFLECTION.test(d.action))
          offenders.push(`${label} ${d.reason} (${code}): ${d.action}`)
      }
    }
    expect(read, 'no never-class demotion action to read').toBeGreaterThan(5)
    expect(offenders.length, listed(offenders)).toBe(0)
  })

  it('[S3-027] [S3-045] every `symspec` command named anywhere in any check payload parses with the built binary, full argv (R56)', async () => {
    const commands = new Set<string>()
    for (const { data } of runs) for (const c of symspecCommandsDeep(data)) commands.add(c)
    expect(commands.size, 'the payloads name no command at all').toBeGreaterThan(10)
    expect(rejectionLines(await argvRejections(commands))).toEqual([])
  }, 300_000)
})
