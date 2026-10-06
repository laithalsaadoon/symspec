/**
 * S3 Waivability (spec 007 AC-5-6), the CHECK half: what `check` does with a stored waiver.
 *
 * The documents are the VDD run's legacy channel: `<case>.stored.json` is what base 0fca043's
 * `apply` wrote, and `hand-*.json` is a hand edit no fence ever saw. Each is checked IN PROCESS
 * with the gaming harness's orthogonal embedder over the fixture's two near pairs, never the
 * stub, so `verified` means what it says (the stub demotes every run `run-weakened`). The
 * expected outcomes are the readings' settled examples 16-33 and rulings R15-R28, R38-R43.
 *
 * Fields S3 adds to the payload (`data.ignoredWaivers`, `data.appliedWaivers`, the
 * `waiver-inert` diagnostic's `waiver` and `ops`) are read loosely through
 * `testing/waiver-fixture.ts`, so on base they read as absent and the assertion, not the
 * compiler, says so.
 */

import { Effect } from 'effect'
import { beforeAll, describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import * as compat from '../../domain/compat.ts'
import type { RequirementsDocument } from '../../domain/requirements/document.ts'
import { foldOps } from '../../domain/requirements/mutate.ts'
import { type DocumentOp, decodeOp } from '../../domain/requirements/ops.ts'
import { argvRejections, rejectionLines, symspecCommandsDeep } from '../../testing/cli-argv.ts'
import { buildDoc, FIXTURES, WAIVED_LINT_CONTROL_TWIN } from '../../testing/gaming.ts'
import {
  type CheckRun,
  type CheckWiring,
  checkDocument,
  type DiagnosticView,
  demotionRows,
  findingRows,
  fixtureDoc,
  HASH,
  ID,
  ids,
  inertDiagnostics,
  withoutWaiver,
  withRawWaivers,
} from '../../testing/waiver-fixture.ts'
import { exitCodeForEnvelope } from '../runtime/exit.ts'
import { runOperation } from '../runtime/operation.ts'
import { checkOp } from './check.ts'
import { currentManifest } from './index.ts'
import { MUTATE_OPTIONS } from './mutate-options.ts'

const wiring: CheckWiring = {
  check: (input) =>
    runOperation(checkOp, input).pipe(
      Effect.map((e) => ({ exit: exitCodeForEnvelope(e), data: e.data as unknown })),
    ),
  solver: solverServiceLayer,
}

const TS = '2026-10-05T00:00:00.000Z'
const FORBIDDEN_REMEDIES = /vocab\s+distinct|propose-vocabulary|--rescope-waivers/i

/** Every fixture document `check` reads in this file. */
const DOCS = [
  'base.json',
  'legacy-mixed.json',
  'cases/blocking-lint-both.stored.json',
  'cases/blocking-lint-one.stored.json',
  'cases/hand-never-code-only.json',
  'cases/hand-ref-with-hash.json',
  'cases/hand-refs-no-hash.json',
  'cases/hand-unknown-code.json',
  'cases/lint-code-only.stored.json',
  'cases/lint-refs-no-hash.stored.json',
  'cases/lint-scoped.stored.json',
  'cases/lint-single-ref.stored.json',
  'cases/lint-stale-hash.stored.json',
  'cases/lint-wrong-set.stored.json',
  'cases/never-hygiene.stored.json',
  'cases/never-verdict.stored.json',
  'cases/repro-code-only.stored.json',
  'cases/repro-scoped.stored.json',
  'cases/repro-single-ref.stored.json',
  'cases/structural-cycle-code-only.stored.json',
  'cases/structural-cycle-scoped.stored.json',
] as const
type DocName = (typeof DOCS)[number]

const docs = new Map<DocName, RequirementsDocument>()
const runs = new Map<DocName, CheckRun>()
const doc = (name: DocName): RequirementsDocument => docs.get(name) as RequirementsDocument
const run = (name: DocName): CheckRun => runs.get(name) as CheckRun

beforeAll(async () => {
  for (const name of DOCS) {
    const d = fixtureDoc(name)
    docs.set(name, d)
    runs.set(name, await checkDocument(wiring, d, { strict: true }))
  }
}, 180_000)

/** The comparison a deleted inert waiver must not move: findings, demotions, verified. */
const verdict = (d: RequirementsDocument, r: CheckRun) => ({
  findings: findingRows(d, r),
  demotions: demotionRows(d, r),
  verified: r.data.verified,
})

/** The inert diagnostics naming the stored waiver at `index` of `name`. */
const inertFor = (name: DocName, index: number): readonly DiagnosticView[] => {
  const stored = doc(name).waivers[index]
  return inertDiagnostics(run(name)).filter(
    (d) => JSON.stringify(d.waiver) === JSON.stringify(stored),
  )
}

const unwaiveOf = (w: RequirementsDocument['waivers'][number]) => ({
  op: 'unwaive',
  code: w.code,
  ...(w.requirementId !== undefined ? { ref: w.requirementId } : {}),
  ...(w.requirementIds !== undefined ? { refs: [...w.requirementIds] } : {}),
})

const MARKER = (compat as Record<string, unknown>).RESCOPED_REASON_MARKER

const rescoped = (
  w: RequirementsDocument['waivers'][number],
  refs: readonly string[],
  contentHash: string,
) => ({
  op: 'waive',
  code: w.code,
  refs: [...refs],
  contentHash,
  reason: `${w.reason}${String(MARKER)}`,
})

/** A diagnostic's ops: the unwaive first, then the waives in a stable order. */
const opsOf = (d: DiagnosticView | undefined) => {
  const ops = d?.ops ?? []
  return {
    first: ops[0],
    waives: ops
      .slice(1)
      .map((o) => JSON.stringify(o))
      .sort(),
  }
}

describe('S3 check half: stored waivers that do not qualify go inert and are disclosed', () => {
  // ---- never-class waivers (R15) -----------------------------------------

  /** (document, index of the never-class waiver in it). */
  const NEVER_WAIVERS: readonly (readonly [DocName, number])[] = [
    ['cases/hand-never-code-only.json', 0],
    ['cases/never-verdict.stored.json', 2],
    ['cases/never-hygiene.stored.json', 0],
    ['cases/never-hygiene.stored.json', 1],
    ['legacy-mixed.json', 2],
    ['legacy-mixed.json', 4],
    ['cases/repro-code-only.stored.json', 0],
    ['cases/repro-scoped.stored.json', 0],
    ['cases/repro-single-ref.stored.json', 0],
  ]

  it('[S3-016] each stored never-class waiver has exactly one waiver-inert diagnostic, and the run equals the document with that waiver deleted', async () => {
    const wrong: string[] = []
    for (const [name, index] of NEVER_WAIVERS) {
      const label = `${name}#${index} ${doc(name).waivers[index]?.code}`
      if (inertFor(name, index).length !== 1)
        wrong.push(`${label}: ${inertFor(name, index).length} diagnostics`)
      const without = withoutWaiver(doc(name), index)
      const r = await checkDocument(wiring, without, { strict: true })
      if (JSON.stringify(verdict(doc(name), run(name))) !== JSON.stringify(verdict(without, r))) {
        wrong.push(`${label}: the run differs from the document without it`)
      }
    }
    expect(wrong).toEqual([])
  }, 120_000)

  it('[S3-016] never-verdict.stored reports FND_CONTRADICTION (error) on ORD-R1, ORD-R2 again', () => {
    const r = run('cases/never-verdict.stored.json')
    const contradiction = r.data.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    expect(contradiction.map((f) => [f.severity, [...f.requirementIds].sort()])).toEqual([
      ['error', ids('ORD-R1', 'ORD-R2')],
    ])
  })

  it('[S3-016] a stale-hash waiver of a never code is disclosed once, as waiver-inert, and not in ignoredWaivers', async () => {
    const d = withRawWaivers(doc('cases/blocking-lint-both.stored.json'), [
      {
        code: 'FND_CONTRADICTION',
        requirementIds: ids('ORD-R1', 'ORD-R2'),
        contentHash: HASH['LOG-R1'],
        reason: 'hand-written, hash of other text',
      },
    ])
    const r = await checkDocument(wiring, d, { strict: true })
    expect(inertDiagnostics(r).filter((x) => x.waiver?.code === 'FND_CONTRADICTION')).toHaveLength(
      1,
    )
    expect(r.data.ignoredWaivers ?? 'absent').toEqual([])
    expect(r.data.findings.some((f) => f.code === 'FND_CONTRADICTION')).toBe(true)
  })

  // ---- code-only, single-ref and no-hash shapes (R16) --------------------

  it('[S3-017] lint-code-only.stored, structural-cycle-code-only.stored, hand-unknown-code and legacy-mixed W1 are inert, and all four GTWR_R5 findings (or FND_CYCLE [CYC-A, CYC-B]) come back', () => {
    for (const [name, index] of [
      ['cases/lint-code-only.stored.json', 0],
      ['cases/structural-cycle-code-only.stored.json', 0],
      ['cases/hand-unknown-code.json', 0],
      ['legacy-mixed.json', 0],
    ] as const) {
      expect(inertFor(name, index), `${name}#${index}`).toHaveLength(1)
    }
    expect(
      findingRows(
        doc('cases/lint-code-only.stored.json'),
        run('cases/lint-code-only.stored.json'),
      ).filter((f) => f.startsWith('GTWR_R5_')),
    ).toEqual([
      'GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]',
      'GTWR_R5_INDEFINITE_ARTICLE [LOG-R2]',
      'GTWR_R5_INDEFINITE_ARTICLE [ORD-R1]',
      'GTWR_R5_INDEFINITE_ARTICLE [ORD-R2]',
    ])
    expect(
      findingRows(
        doc('cases/structural-cycle-code-only.stored.json'),
        run('cases/structural-cycle-code-only.stored.json'),
      ),
    ).toContain('FND_CYCLE [CYC-A, CYC-B]')
  })

  it('[S3-009] [S3-017] a stored waiver of a code with no own FINDING_CLASS row (constructor) is inert and disclosed', async () => {
    const r = await checkDocument(
      wiring,
      withRawWaivers(doc('base.json'), [
        {
          code: 'constructor',
          requirementIds: ids('LOG-R1'),
          contentHash: HASH['LOG-R1'],
          reason: 'r',
        },
      ]),
    )
    expect(inertDiagnostics(r).map((d) => d.waiver?.code)).toEqual(['constructor'])
  })

  it('[S3-018] lint-single-ref.stored and legacy-mixed W2 are inert though each names the finding’s one requirement, and the finding comes back', () => {
    expect(inertFor('cases/lint-single-ref.stored.json', 0)).toHaveLength(1)
    expect(
      findingRows(
        doc('cases/lint-single-ref.stored.json'),
        run('cases/lint-single-ref.stored.json'),
      ),
    ).toContain('GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]')
    expect(inertFor('legacy-mixed.json', 1)).toHaveLength(1)
    expect(findingRows(doc('legacy-mixed.json'), run('legacy-mixed.json'))).toContain(
      'GTWR_R5_INDEFINITE_ARTICLE [LOG-R2]',
    )
  })

  it('[S3-019] hand-refs-no-hash (requirementIds [LOG-R1], no hash) is inert, and GTWR_R5 on LOG-R1 comes back', () => {
    expect(inertFor('cases/hand-refs-no-hash.json', 0)).toHaveLength(1)
    expect(
      findingRows(doc('cases/hand-refs-no-hash.json'), run('cases/hand-refs-no-hash.json')),
    ).toContain('GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]')
  })

  it('[S3-020] hand-ref-with-hash (one requirementId plus the matching hash) qualifies: GTWR_R5 on LOG-R1 stays suppressed, with no diagnostic', () => {
    const name = 'cases/hand-ref-with-hash.json'
    expect(findingRows(doc(name), run(name))).not.toContain('GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]')
    expect(inertDiagnostics(run(name))).toEqual([])
  })

  it('[S3-021] lint-scoped, lint-refs-no-hash, structural-cycle-scoped and legacy-mixed W4 qualify: each suppresses exactly its finding, with no diagnostic about it', () => {
    const cases: readonly (readonly [DocName, number, string])[] = [
      ['cases/lint-scoped.stored.json', 0, 'GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]'],
      ['cases/lint-refs-no-hash.stored.json', 0, 'GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]'],
      ['cases/structural-cycle-scoped.stored.json', 0, 'FND_CYCLE [CYC-A, CYC-B]'],
      ['legacy-mixed.json', 3, 'GTWR_R7_VAGUE [ORD-R1]'],
    ]
    for (const [name, index, finding] of cases) {
      const rows = findingRows(doc(name), run(name))
      expect(rows, name).not.toContain(finding)
      expect(inertFor(name, index), name).toEqual([])
    }
    // Exactly its finding: the other GTWR_R5 findings stay.
    expect(
      findingRows(doc('cases/lint-scoped.stored.json'), run('cases/lint-scoped.stored.json')),
    ).toContain('GTWR_R5_INDEFINITE_ARTICLE [LOG-R2]')
  })

  it('[S3-007] [S3-022] lint-wrong-set suppresses neither GTWR_R5 finding and is disclosed as waiver-inert (matches no finding) with its unwaive op only', () => {
    const name = 'cases/lint-wrong-set.stored.json'
    const rows = findingRows(doc(name), run(name))
    expect(rows).toContain('GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]')
    expect(rows).toContain('GTWR_R5_INDEFINITE_ARTICLE [LOG-R2]')
    const [d] = inertFor(name, 0)
    expect(d?.detail ?? '').toMatch(/matches no finding/)
    // It suppressed nothing at base either (R38), so it offers unwaive alone.
    expect(d?.ops).toEqual([
      unwaiveOf(doc(name).waivers[0] as RequirementsDocument['waivers'][number]),
    ])
  })

  it('[S3-023] waiver-inert is an info data.diagnostics entry that demotes nothing', () => {
    let seen = 0
    for (const name of DOCS) {
      for (const d of inertDiagnostics(run(name))) {
        seen += 1
        expect(d.severity, name).toBe('info')
      }
      for (const dem of run(name).data.coverage.demotions) {
        expect(dem.reason, name).not.toMatch(/inert/)
      }
    }
    expect(seen, 'no waiver-inert diagnostic on any legacy document').toBeGreaterThanOrEqual(14)
  })

  it('[S3-023] [S3-036] deleting any inert waiver from any fixture document leaves findings, demotions and verified unchanged', async () => {
    const moved: string[] = []
    let deleted = 0
    for (const name of DOCS) {
      const d = doc(name)
      for (const [index, w] of d.waivers.entries()) {
        if (
          !inertDiagnostics(run(name)).some((x) => JSON.stringify(x.waiver) === JSON.stringify(w))
        )
          continue
        deleted += 1
        const without = withoutWaiver(d, index)
        const r = await checkDocument(wiring, without, { strict: true })
        if (JSON.stringify(verdict(d, run(name))) !== JSON.stringify(verdict(without, r))) {
          moved.push(`${name}#${index} ${w.code}`)
        }
      }
    }
    expect(moved).toEqual([])
    expect(deleted, 'nothing was inert, so nothing was deleted').toBeGreaterThanOrEqual(14)
  }, 180_000)

  // ---- replacement ops (R18-R20, R41) ------------------------------------

  it('[S3-024] [S3-026] lint-code-only.stored: unwaive plus one scoped waive refs + current hash per finding, carrying the legacy reason and the provenance marker', () => {
    expect(typeof MARKER, 'compat exports RESCOPED_REASON_MARKER').toBe('string')
    const name = 'cases/lint-code-only.stored.json'
    const w = doc(name).waivers[0] as RequirementsDocument['waivers'][number]
    const got = opsOf(inertFor(name, 0)[0])
    expect(got.first).toEqual(unwaiveOf(w))
    expect(got.waives).toEqual(
      [
        rescoped(w, ids('LOG-R1'), HASH['LOG-R1']),
        rescoped(w, ids('LOG-R2'), HASH['LOG-R2']),
        rescoped(w, ids('ORD-R1'), HASH['ORD-R1']),
        rescoped(w, ids('ORD-R2'), HASH['ORD-R2']),
      ]
        .map((o) => JSON.stringify(o))
        .sort(),
    )
  })

  it('[S3-024] lint-single-ref.stored and hand-refs-no-hash get unwaive plus waive [LOG-R1] sha256:fd8b2c50…; structural-cycle-code-only gets [CYC-A, CYC-B] sha256:b889a619…', () => {
    for (const [name, refs, hash] of [
      ['cases/lint-single-ref.stored.json', ids('LOG-R1'), HASH['LOG-R1']],
      ['cases/hand-refs-no-hash.json', ids('LOG-R1'), HASH['LOG-R1']],
      ['cases/structural-cycle-code-only.stored.json', ids('CYC-A', 'CYC-B'), HASH['CYC-A,CYC-B']],
    ] as const) {
      const w = doc(name).waivers[0] as RequirementsDocument['waivers'][number]
      const got = opsOf(inertFor(name, 0)[0])
      expect(got.first, name).toEqual(unwaiveOf(w))
      expect(got.waives, name).toEqual([JSON.stringify(rescoped(w, refs, hash))])
    }
  })

  it('[S3-025] [S3-045] a never-code waiver-inert carries the unwaive op and "rewrite required", no waive op, and names no vocab distinct or --rescope-waivers', () => {
    for (const [name, index] of NEVER_WAIVERS) {
      const [d] = inertFor(name, index)
      const w = doc(name).waivers[index] as RequirementsDocument['waivers'][number]
      expect(d?.ops, `${name}#${index}`).toEqual([unwaiveOf(w)])
      expect(d?.detail ?? '', `${name}#${index}`).toMatch(/rewrite required/i)
      expect(JSON.stringify(d), `${name}#${index}`).not.toMatch(FORBIDDEN_REMEDIES)
    }
  })

  it('[S3-027] every op on every waiver-inert and ignoredWaivers entry decodes and folds under MUTATE_OPTIONS on the checked document, and every command named parses under this build', () => {
    const commands = new Set(currentManifest().operations.map((o) => o.name))
    let entries = 0
    const bad: string[] = []
    for (const name of DOCS) {
      const entriesOf = [...inertDiagnostics(run(name)), ...(run(name).data.ignoredWaivers ?? [])]
      for (const entry of entriesOf) {
        entries += 1
        const ops: DocumentOp[] = []
        for (const raw of entry.ops ?? []) {
          const decoded = Effect.runSync(Effect.result(decodeOp(raw)))
          if (decoded._tag === 'Failure') bad.push(`${name}: undecodable ${JSON.stringify(raw)}`)
          else ops.push(decoded.success)
        }
        const folded = foldOps(doc(name), ops, TS, MUTATE_OPTIONS)
        const failed = folded.results.find((r) => !r.ok)
        if (failed !== undefined)
          bad.push(`${name}: ${failed.op} refused ${failed.code} ${failed.error}`)
        const text = JSON.stringify(entry)
        for (const m of text.matchAll(/symspec\s+([a-z][a-z-]*)/g)) {
          if (!commands.has(m[1] ?? '')) bad.push(`${name}: names \`symspec ${m[1]}\``)
        }
        if (FORBIDDEN_REMEDIES.test(text)) bad.push(`${name}: names a remedy this build lacks`)
      }
    }
    expect(bad).toEqual([])
    expect(entries, 'no entry to check').toBeGreaterThanOrEqual(15)
  })

  // ---- stale hash (R21, R42) ----------------------------------------------

  it('[S3-028] lint-stale-hash.stored: GTWR_R5 on LOG-R1 is back and data.ignoredWaivers lists the waiver once with its code, ids, stored and current hash, and no waiver-inert', () => {
    const name = 'cases/lint-stale-hash.stored.json'
    expect(findingRows(doc(name), run(name))).toContain('GTWR_R5_INDEFINITE_ARTICLE [LOG-R1]')
    expect(
      (run(name).data.ignoredWaivers ?? []).map(
        ({ code, requirementIds, storedHash, currentHash }) => ({
          code,
          requirementIds,
          storedHash,
          currentHash,
        }),
      ),
    ).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: ids('LOG-R1'),
        storedHash: HASH['LOG-R1'],
        currentHash: HASH['LOG-R1 edited'],
      },
    ])
    expect(inertDiagnostics(run(name))).toEqual([])
    // With no stale waiver the list is present and empty.
    expect(run('base.json').data.ignoredWaivers).toEqual([])
    expect(run('cases/lint-scoped.stored.json').data.ignoredWaivers).toEqual([])
  })

  it('[S3-028] the stale-hash entry is listed under any output filter', async () => {
    const name = 'cases/lint-stale-hash.stored.json'
    for (const input of [
      { minSeverity: 'error' },
      { minSeverity: 'warn' },
      { findingsOnly: true },
    ]) {
      const r = await checkDocument(wiring, doc(name), input)
      expect(
        (r.data.ignoredWaivers ?? []).map((w) => w.code),
        JSON.stringify(input),
      ).toEqual(['GTWR_R5_INDEFINITE_ARTICLE'])
    }
  })

  it('[S3-029] the stale-hash entry carries its unwaive op and a note that the text changed and must be re-reviewed, and no waive at the new hash', () => {
    const name = 'cases/lint-stale-hash.stored.json'
    const [entry] = run(name).data.ignoredWaivers ?? []
    const w = doc(name).waivers[0] as RequirementsDocument['waivers'][number]
    expect(entry?.ops).toEqual([unwaiveOf(w)])
    expect(entry?.note ?? '').toMatch(/changed/i)
    expect(entry?.note ?? '').toMatch(/re-review/i)
    expect(JSON.stringify(entry)).not.toContain('"op":"waive"')
  })

  // ---- the check-time twin over the raw channel (R11, R22) ----------------

  it('[S3-010] [S3-030] case and whitespace variants of FND_CONTRADICTION written raw suppress nothing, are inert and disclosed', async () => {
    const variants = [
      ' FND_CONTRADICTION',
      'FND_CONTRADICTION ',
      'fnd_contradiction',
      'Fnd_Contradiction',
    ]
    const d = withRawWaivers(
      doc('cases/blocking-lint-both.stored.json'),
      variants.map((code) => ({
        code,
        requirementIds: ids('ORD-R1', 'ORD-R2'),
        contentHash: HASH['ORD-R1,ORD-R2'],
        reason: 'hand-edited',
      })),
    )
    const r = await checkDocument(wiring, d, { strict: true })
    expect(r.data.findings.some((f) => f.code === 'FND_CONTRADICTION')).toBe(true)
    expect(
      inertDiagnostics(r)
        .map((x) => x.waiver?.code)
        .sort(),
    ).toEqual([...variants].sort())
  })

  it('[S3-030] a stored never-class waiver over the exact ids and current hash suppresses nothing at check: blocking-lint-both plus a raw FND_CONTRADICTION waiver still reports the contradiction', async () => {
    const d = withRawWaivers(doc('cases/blocking-lint-both.stored.json'), [
      {
        code: 'FND_CONTRADICTION',
        requirementIds: ids('ORD-R1', 'ORD-R2'),
        contentHash: HASH['ORD-R1,ORD-R2'],
        reason: 'hand-edited',
      },
    ])
    const r = await checkDocument(wiring, d, { strict: true })
    expect(findingRows(d, r)).toContain('FND_CONTRADICTION [ORD-R1, ORD-R2]')
    expect(r.data.waived).toBe(2)
  })

  // ---- applied waivers are listed (R33) -----------------------------------

  it('[S3-046] every waiver the engine applied is listed in data.appliedWaivers with its code, requirement ids and reason, and no inert one is', () => {
    const scoped = doc('cases/lint-scoped.stored.json').waivers[0]
    expect(run('cases/lint-scoped.stored.json').data.appliedWaivers).toEqual([
      { code: scoped?.code, requirementIds: ids('LOG-R1'), reason: scoped?.reason },
    ])
    const w4 = doc('legacy-mixed.json').waivers[3]
    expect(
      (run('legacy-mixed.json').data.appliedWaivers ?? []).map(
        ({ code, requirementIds, reason }) => ({
          code,
          requirementIds,
          reason,
        }),
      ),
    ).toEqual([{ code: w4?.code, requirementIds: ids('ORD-R1'), reason: w4?.reason }])
    expect(run('cases/lint-code-only.stored.json').data.appliedWaivers).toEqual([])
  })
})

describe('S3: a waived blocking lint still demotes (waived-blocking-lint, G3)', () => {
  it('[S3-033] blocking-lint-one.stored: waived-blocking-lint [ORD-R1], uncovered-requirement [ORD-R1], excluded-from-formal [ORD-R2], open-opposition-candidate [CAB-R1, CAB-R2]; verified false', () => {
    const name = 'cases/blocking-lint-one.stored.json'
    expect(demotionRows(doc(name), run(name))).toEqual([
      'excluded-from-formal [ORD-R2]',
      'open-opposition-candidate [CAB-R1, CAB-R2]',
      'uncovered-requirement [ORD-R1]',
      'waived-blocking-lint [ORD-R1]',
    ])
    expect(run(name).data.verified).toBe(false)
  })

  it('[S3-034] blocking-lint-both.stored --strict: FND_CONTRADICTION (error), ONE waived-blocking-lint demotion naming ORD-R1 and ORD-R2, verified false, exit 1', () => {
    const name = 'cases/blocking-lint-both.stored.json'
    const r = run(name)
    expect(findingRows(doc(name), r)).toContain('FND_CONTRADICTION [ORD-R1, ORD-R2]')
    expect(r.data.findings.find((f) => f.code === 'FND_CONTRADICTION')?.severity).toBe('error')
    expect(demotionRows(doc(name), r).filter((d) => d.startsWith('waived-blocking-lint'))).toEqual([
      'waived-blocking-lint [ORD-R1, ORD-R2]',
    ])
    expect(r.data.verified).toBe(false)
    expect(r.exit).toBe(1)
  })

  it('[S3-035] the gaming waived-blocking-lint control twin (consistent, verified at base) gives verified false, and --strict exits 3 on the demotion alone', async () => {
    const fixture = FIXTURES.find((f) => f.id === 'waived-blocking-lint')
    if (fixture === undefined) throw new Error('fixture moved')
    const control = buildDoc(WAIVED_LINT_CONTROL_TWIN, MUTATE_OPTIONS)
    const r = await checkDocument(wiring, control, { strict: true }, fixture.near ?? [])
    expect(r.data.findings.filter((f) => f.severity === 'error')).toEqual([])
    expect(r.data.coverage.demotions.map((d) => d.reason)).toEqual(['waived-blocking-lint'])
    expect(r.data.verified).toBe(false)
    expect(r.exit).toBe(3)
  })

  it('[S3-036] the waived-blocking-lint ids are the requirements excluded with no waivers minus those excluded under the waivers compat forwarded', async () => {
    const excluded = (d: RequirementsDocument, r: CheckRun) =>
      r.data.coverage.demotions
        .filter((x) => x.reason === 'excluded-from-formal')
        .flatMap((x) => x.requirementIds.map((id) => d.requirements[id]?.key ?? id))
        .sort()
    const wbl = (d: RequirementsDocument, r: CheckRun) =>
      r.data.coverage.demotions
        .filter((x) => x.reason === 'waived-blocking-lint')
        .flatMap((x) => x.requirementIds.map((id) => d.requirements[id]?.key ?? id))
        .sort()
    let measured = 0
    for (const name of DOCS) {
      const d = doc(name)
      const bare = await checkDocument(wiring, { ...d, waivers: [] }, { strict: true })
      const before = excluded(d, bare)
      const after = excluded(d, run(name))
      expect(wbl(d, run(name)), name).toEqual(before.filter((k) => !after.includes(k)))
      expect(wbl(d, bare), `${name} with no waivers`).toEqual([])
      if (wbl(d, run(name)).length > 0) measured += 1
    }
    // blocking-lint-one, blocking-lint-both, never-verdict's two R7 waivers, legacy-mixed W4.
    expect(measured).toBeGreaterThanOrEqual(4)
  }, 180_000)

  it('[S3-036] adding an inert (code-only) or a stale GTWR_R7_VAGUE waiver to blocking-lint-one leaves the demotions unchanged', async () => {
    const name = 'cases/blocking-lint-one.stored.json'
    for (const extra of [
      { code: 'GTWR_R7_VAGUE', reason: 'code-only, hand-written' },
      {
        code: 'GTWR_R7_VAGUE',
        requirementIds: ids('ORD-R2'),
        contentHash: HASH['LOG-R1'],
        reason: 'stale',
      },
      { code: 'GTWR_R7_VAGUE', requirementId: ID['ORD-R2'], reason: 'single ref, no hash' },
    ]) {
      const d = withRawWaivers(doc(name), [extra])
      const r = await checkDocument(wiring, d, { strict: true })
      expect(demotionRows(d, r), JSON.stringify(extra)).toEqual(demotionRows(doc(name), run(name)))
      expect(demotionRows(d, r)).toContain('waived-blocking-lint [ORD-R1]')
    }
  }, 60_000)
})

describe('S3: the AC-5-6 reproducer', () => {
  it('[S3-037] repro-code-only.stored: the waiver is inert, with one diagnostic; the CAB and TNK pairs demote separately and FND_OPPOSITION_CANDIDATE stands on both', () => {
    const name = 'cases/repro-code-only.stored.json'
    expect(inertDiagnostics(run(name))).toHaveLength(1)
    expect(demotionRows(doc(name), run(name))).toEqual([
      'excluded-from-formal [ORD-R1]',
      'excluded-from-formal [ORD-R2]',
      'open-opposition-candidate [CAB-R1, CAB-R2]',
      'open-opposition-candidate [TNK-R1, TNK-R2]',
    ])
    expect(
      findingRows(doc(name), run(name)).filter((f) => f.startsWith('FND_OPPOSITION_CANDIDATE')),
    ).toEqual([
      'FND_OPPOSITION_CANDIDATE [CAB-R1, CAB-R2]',
      'FND_OPPOSITION_CANDIDATE [TNK-R1, TNK-R2]',
    ])
  })

  it('[S3-037] repro-scoped.stored and repro-single-ref.stored are inert too, and the CAB finding and demotion come back', () => {
    for (const name of [
      'cases/repro-scoped.stored.json',
      'cases/repro-single-ref.stored.json',
    ] as const) {
      expect(inertDiagnostics(run(name)), name).toHaveLength(1)
      expect(findingRows(doc(name), run(name)), name).toContain(
        'FND_OPPOSITION_CANDIDATE [CAB-R1, CAB-R2]',
      )
      expect(demotionRows(doc(name), run(name)), name).toContain(
        'open-opposition-candidate [CAB-R1, CAB-R2]',
      )
    }
  })

  /** The minimal reproducer document of ruling R43: the CAB pair and the TNK pair alone. */
  const cabTnk = (): RequirementsDocument => {
    const add = (
      key: 'CAB-R1' | 'CAB-R2' | 'TNK-R1' | 'TNK-R2',
      trigger: string,
      systemName: string,
      systemResponse: string,
    ): DocumentOp => ({
      op: 'add',
      id: ID[key],
      key,
      patternType: 'event-driven',
      trigger,
      systemName,
      systemResponse,
    })
    const folded = foldOps(
      { ...fixtureDoc('base.json'), requirements: {} },
      [
        add(
          'CAB-R1',
          'the driver selects automatic climate',
          'climate controller',
          'heat the cabin',
        ),
        add(
          'CAB-R2',
          'the driver selects automatic climate',
          'climate controller',
          'cool the cabin',
        ),
        add('TNK-R1', 'the level sensor reports low', 'pump controller', 'fill the tank'),
        add('TNK-R2', 'the level sensor reports low', 'pump controller', 'drain the tank'),
      ],
      TS,
      MUTATE_OPTIONS,
    )
    if (folded.abortedAt !== undefined) throw new Error('reproducer fixture refused')
    return folded.document
  }

  it('[S3-038] the minimal CAB+TNK reproducer, write half: the code-only FND_OPPOSITION_CANDIDATE waive is refused ERR_WAIVER_REFUSED and nothing is written', () => {
    const d = cabTnk()
    const folded = foldOps(
      d,
      [
        {
          op: 'waive',
          code: 'FND_OPPOSITION_CANDIDATE',
          reason: 'heating and cooling are separate climate modes',
        },
      ],
      TS,
      MUTATE_OPTIONS,
    )
    expect(folded.results[0]?.code).toBe('ERR_WAIVER_REFUSED')
    expect(folded.write).toBe(false)
  })

  it('[S3-038] the minimal CAB+TNK reproducer, check half: the stored code-only waiver is inert and disclosed, and the CAB and TNK pairs demote; verified false', async () => {
    const d = withRawWaivers(cabTnk(), [
      {
        code: 'FND_OPPOSITION_CANDIDATE',
        reason: 'heating and cooling are separate climate modes',
      },
    ])
    const r = await checkDocument(wiring, d, { strict: true })
    expect(inertDiagnostics(r)).toHaveLength(1)
    expect(demotionRows(d, r)).toEqual([
      'open-opposition-candidate [CAB-R1, CAB-R2]',
      'open-opposition-candidate [TNK-R1, TNK-R2]',
    ])
    expect(r.data.verified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// S3 closure round (R54, R55, R56, attack D06)
// ---------------------------------------------------------------------------

/** Fold every op of one diagnostic or ignoredWaivers entry on `d`, decoded as an agent would. */
const followOps = (d: RequirementsDocument, entry: { readonly ops?: readonly unknown[] }) => {
  const ops = (entry.ops ?? []).map((raw) => Effect.runSync(decodeOp(raw)))
  return { ops, folded: foldOps(d, ops, TS, MUTATE_OPTIONS) }
}

/**
 * What R55 says the stored list is after following `entry`: the original minus the one stored
 * waiver it names, plus what each replacement waive stores (unless already stored).
 */
const expectedAfter = (
  d: RequirementsDocument,
  named: unknown,
  ops: readonly DocumentOp[],
): readonly string[] => {
  const all = d.waivers.map((w) => JSON.stringify(w))
  const at = all.indexOf(JSON.stringify(named))
  const out = at < 0 ? all : [...all.slice(0, at), ...all.slice(at + 1)]
  for (const op of ops) {
    if (op.op !== 'waive' || op.refs === undefined) continue
    const ids = op.refs.map(
      (ref) => Object.values(d.requirements).find((r) => r.key === ref || r.id === ref)?.id ?? ref,
    )
    const stored = JSON.stringify({
      code: op.code.trim(),
      requirementIds: [...new Set(ids)].sort(),
      contentHash: op.contentHash,
      reason: op.reason.trim(),
    })
    if (!out.includes(stored)) out.push(stored)
  }
  return out.sort()
}

describe('S3 closure: the check-time twin is exact, and every migration op removes only its own waiver', () => {
  it('[S3-030] derives-cycle: a FND_CYCLE waiver carrying both requirementId and requirementIds, or a blank reason, suppresses nothing and the strict exit stays 1 (R54)', async () => {
    const fixture = FIXTURES.find((f) => f.id === 'derives-cycle')
    if (fixture === undefined) throw new Error('no derives-cycle fixture')
    const cycle = buildDoc(fixture.ops, MUTATE_OPTIONS)
    const baseline = await checkDocument(wiring, cycle, { strict: true }, [])
    const cycles = baseline.data.findings.filter((f) => f.code === 'FND_CYCLE')
    expect(baseline.exit).toBe(1)
    expect(cycles.length).toBeGreaterThan(0)
    const bystander = Object.values(cycle.requirements).find(
      (r) => !cycles.some((f) => f.requirementIds.includes(r.id)),
    )?.id
    expect(bystander, 'a requirement outside the cycle').toBeDefined()
    const hashOver = (ids: readonly string[]) =>
      foldOps(
        cycle,
        [{ op: 'waive', code: 'FND_CYCLE', refs: [...ids], reason: 'r' }],
        TS,
        MUTATE_OPTIONS,
      ).document.waivers[0]?.contentHash
    for (const [label, extra] of [
      [
        'both id fields',
        { requirementId: bystander, reason: 'reviewed: intended mutual refinement' },
      ],
      ['blank reason', { reason: '   ' }],
    ] as const) {
      const waivers = cycles.map((f) => ({
        code: 'FND_CYCLE',
        requirementIds: [...f.requirementIds].sort(),
        contentHash: hashOver(f.requirementIds),
        ...extra,
      }))
      const d = withRawWaivers(cycle, waivers)
      const r = await checkDocument(wiring, d, { strict: true }, [])
      expect(r.exit, label).toBe(1)
      expect(r.data.findings.filter((f) => f.code === 'FND_CYCLE').length, label).toBe(
        cycles.length,
      )
      expect(r.data.appliedWaivers ?? [], label).toEqual([])
      expect(inertDiagnostics(r).length, label).toBe(waivers.length)
    }
    // The control: the same waiver in the shape the fold stores does discharge the cycle (R45).
    const legit = withRawWaivers(
      cycle,
      cycles.map((f) => ({
        code: 'FND_CYCLE',
        requirementIds: [...f.requirementIds].sort(),
        contentHash: hashOver(f.requirementIds),
        reason: 'reviewed: intended mutual refinement',
      })),
    )
    const ok = await checkDocument(wiring, legit, { strict: true }, [])
    expect(ok.data.findings.some((f) => f.code === 'FND_CYCLE')).toBe(false)
  }, 120_000)

  it('[S3-024] [S3-027] following every op of every waiver-inert and ignoredWaivers entry of every fixture document removes exactly the stored waiver it names, plus its replacement waives (R55)', () => {
    const wrong: string[] = []
    let entries = 0
    for (const name of DOCS) {
      const d = doc(name)
      for (const entry of [
        ...inertDiagnostics(run(name)),
        ...(run(name).data.ignoredWaivers ?? []),
      ]) {
        entries += 1
        const named =
          'waiver' in entry && entry.waiver !== undefined
            ? entry.waiver
            : d.waivers.find(
                (w) =>
                  w.code === entry.code &&
                  JSON.stringify(w.requirementIds) === JSON.stringify(entry.requirementIds) &&
                  w.contentHash === (entry as { storedHash?: string }).storedHash,
              )
        const { ops, folded } = followOps(d, entry)
        const left = folded.document.waivers.map((w) => JSON.stringify(w)).sort()
        if (JSON.stringify(left) !== JSON.stringify(expectedAfter(d, named, ops)))
          wrong.push(`${name}: following ${JSON.stringify(entry.ops)} left ${left.length} waivers`)
      }
    }
    expect(wrong).toEqual([])
    expect(entries).toBeGreaterThanOrEqual(15)
  })

  it('[S3-024] a padded code, a lone requirementId naming a deleted requirement and a dual-scope waiver are each removed by their own ops, and the code-only waiver at the trimmed key and the active reviewed waiver beside them survive (R55)', async () => {
    const GONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const d = withRawWaivers(doc('base.json'), [
      { code: ' FND_CONTRADICTION ', reason: 'target: padded code' },
      { code: 'FND_CONTRADICTION', reason: 'collateral: code-only at the trimmed key' },
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementId: GONE,
        contentHash: HASH['LOG-R1'],
        reason: 'target: deleted requirement',
      },
      { code: 'GTWR_R5_INDEFINITE_ARTICLE', reason: 'collateral: code-only of the same code' },
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementId: GONE,
        requirementIds: ids('LOG-R1'),
        reason: 'target: dual scope, no hash',
      },
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: ids('LOG-R1'),
        contentHash: HASH['LOG-R1'],
        reason: 'active reviewed decision',
      },
    ])
    const r = await checkDocument(wiring, d, { strict: true })
    const wrong: string[] = []
    let followed = 0
    for (const entry of inertDiagnostics(r)) {
      followed += 1
      const { ops, folded } = followOps(d, entry)
      const left = folded.document.waivers.map((w) => JSON.stringify(w)).sort()
      const want = expectedAfter(d, entry.waiver, ops)
      if (JSON.stringify(left) !== JSON.stringify(want)) {
        const gone = want.filter((w) => !left.includes(w)).map((w) => JSON.parse(w).reason)
        const kept = left.filter((w) => !want.includes(w)).map((w) => JSON.parse(w).reason)
        wrong.push(
          `${String(entry.waiver?.reason)}: also removed ${JSON.stringify(gone)}, left ${JSON.stringify(kept)}`,
        )
      }
    }
    // Every target and both code-only collaterals are inert; the active one applies.
    expect(followed).toBe(5)
    expect(wrong).toEqual([])
  }, 60_000)

  it('[S3-024] the waiver-inert entry of a waiver naming a deleted UUID that is another requirement’s key removes only that waiver, in both id forms, and the live requirement’s reviewed waiver survives (R59)', async () => {
    const GONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const LIVE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const built = foldOps(
      doc('base.json'),
      [
        {
          op: 'add',
          id: LIVE,
          key: GONE,
          patternType: 'ubiquitous',
          systemName: 'audit logger',
          systemResponse: 'retain 5 audit records',
        } as DocumentOp,
      ],
      TS,
      MUTATE_OPTIONS,
    )
    expect(built.abortedAt).toBeUndefined()
    const liveHash = foldOps(
      built.document,
      [{ op: 'waive', code: 'GTWR_R5_INDEFINITE_ARTICLE', refs: [LIVE], reason: 'r' }],
      TS,
      MUTATE_OPTIONS,
    ).document.waivers[0]?.contentHash
    expect(liveHash).toMatch(/^sha256:/)
    const wrong: string[] = []
    for (const form of ['requirementId', 'requirementIds'] as const) {
      const scope = (id: string) =>
        form === 'requirementId' ? { requirementId: id } : { requirementIds: [id] }
      const target = {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        ...scope(GONE),
        contentHash: HASH['LOG-R1'],
        reason: 'target: review of the deleted requirement',
      }
      const live = {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        ...scope(LIVE),
        contentHash: liveHash,
        reason: 'review of the live requirement',
      }
      const d = withRawWaivers(built.document, [live, target])
      const r = await checkDocument(wiring, d, { strict: true })
      const entry = inertDiagnostics(r).find(
        (x) => JSON.stringify(x.waiver) === JSON.stringify(target),
      )
      if (entry === undefined) {
        wrong.push(`${form}: no waiver-inert entry for the target`)
        continue
      }
      const { folded } = followOps(d, entry)
      const left = folded.document.waivers.map((w) => w.reason)
      if (JSON.stringify(left) !== JSON.stringify([live.reason]))
        wrong.push(`${form}: following ${JSON.stringify(entry.ops)} left ${JSON.stringify(left)}`)
    }
    expect(wrong).toEqual([])
  }, 60_000)

  it('[S3-027] every command named by every waiver-inert and ignoredWaivers entry parses with the built binary, full argv (R56)', async () => {
    const commands = new Set<string>()
    for (const name of DOCS) {
      for (const entry of [
        ...inertDiagnostics(run(name)),
        ...(run(name).data.ignoredWaivers ?? []),
      ])
        for (const c of symspecCommandsDeep(entry)) commands.add(c)
    }
    expect(rejectionLines(await argvRejections(commands))).toEqual([])
  }, 120_000)

  it('[S3-026] the replacement waive carries the legacy reason verbatim, then the provenance suffix " (rescoped from a legacy waiver)" written here, not read from the export (D06)', () => {
    const PROVENANCE = ' (rescoped from a legacy waiver)'
    expect(PROVENANCE.trim().length).toBeGreaterThan(0)
    expect(MARKER).toBe(PROVENANCE)
    const name = 'cases/lint-code-only.stored.json'
    const w = doc(name).waivers[0] as RequirementsDocument['waivers'][number]
    const waives = (inertFor(name, 0)[0]?.ops ?? []).filter((o) => o.op === 'waive')
    expect(waives.length).toBe(4)
    for (const op of waives) expect(op.reason).toBe(`${w.reason}${PROVENANCE}`)
  })
})
