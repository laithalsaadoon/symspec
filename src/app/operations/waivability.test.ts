/**
 * The published waivability is only as true as what `waive` and `check` DO with it.
 *
 * `explain`, the manifest and AGENTS.md publish a `waivable` column derived from the signal
 * classes (`never` for a verdict, `scoped` for wording). A consumer reads that column and
 * concludes what `verified: true` rules out. So the build also publishes whether the column is
 * ENFORCED, and this file holds that flag to the behaviour, at both places a waiver can enter:
 *
 * - write time: `apply`'s own fold, under `MUTATE_OPTIONS`, on a `never`-class code;
 * - check time: a `never`-class waiver already stored in the document (the hand-edit channel).
 *
 * While the flag is false, both halves must still ACCEPT the waiver, and the published surface
 * must say so. The slice that enforces the column (S3, AC-5-6) flips the flag, and this file
 * then requires the refusal. Neither half can drift from the published claim without a red test.
 */

import { readFileSync } from 'node:fs'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { stubEmbedder } from '../../adapters/embedding/embedder.ts'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { requirementsContentHash } from '../../domain/requirements/content-hash.ts'
import { emptyDocument, type RequirementsDocument } from '../../domain/requirements/document.ts'
import { foldOps } from '../../domain/requirements/mutate.ts'
import type { DocumentOp } from '../../domain/requirements/ops.ts'
import { DocPath, DocStore, documentOnlyStore, makeDocPath } from '../../ports/doc-store.ts'
import { embedderLayerOf } from '../../ports/embedder.ts'
import { ErrDocNotFound } from '../../ports/errors.ts'
import { renderAgentsDoc } from '../runtime/agents-doc.ts'
import { runOperation } from '../runtime/operation.ts'
import {
  FINDING_CLASS,
  WAIVABILITY,
  WAIVABILITY_ENFORCED,
  waivabilityOf,
  waivabilityStatement,
} from '../runtime/signal-classes.ts'
import { checkOp } from './check.ts'
import { currentManifest, explainOp } from './index.ts'
import { MUTATE_OPTIONS } from './mutate-options.ts'

const TS = '2026-01-01T00:00:00.000Z'

/** One trigger, `grant` vs `revoke`: a seed-antonym contradiction with no side tables. */
const CONTRADICTION: readonly DocumentOp[] = [
  {
    op: 'add',
    key: 'W-R1',
    patternType: 'event-driven',
    trigger: 'the user submits valid credentials',
    systemName: 'auth service',
    systemResponse: 'grant access',
  },
  {
    op: 'add',
    key: 'W-R2',
    patternType: 'event-driven',
    trigger: 'the user submits valid credentials',
    systemName: 'auth service',
    systemResponse: 'revoke access',
  },
]

const fold = (doc: RequirementsDocument, ops: readonly DocumentOp[]) =>
  foldOps(doc, ops, TS, MUTATE_OPTIONS)

const built = (): RequirementsDocument => {
  const folded = fold(emptyDocument(), CONTRADICTION)
  if (folded.abortedAt !== undefined) throw new Error('fixture refused')
  return folded.document
}

/** `never`-class codes, one per class that the column calls unwaivable. */
const NEVER_CODES = [
  'FND_CONTRADICTION',
  'FND_NUMERIC_UNCOMPARED',
  'FND_OPPOSITION_CANDIDATE',
  'FND_DANGLING_REFERENCE',
] as const

const checkCodes = async (document: RequirementsDocument): Promise<readonly string[]> => {
  const store = Layer.succeed(DocStore)(
    documentOnlyStore({
      load: (path) =>
        path === 'doc.json'
          ? Effect.succeed({ document, unknownKeys: {}, diagnostics: [] })
          : Effect.fail(new ErrDocNotFound({ error: `no document at ${path}`, suggestions: [] })),
      save: () => Effect.void,
      exists: () => Effect.succeed(true),
    }),
  )
  const envelope = await Effect.runPromise(
    runOperation(checkOp, { file: 'doc.json' }).pipe(
      Effect.provide(
        Layer.mergeAll(
          store,
          Layer.succeed(DocPath)(makeDocPath({})),
          solverServiceLayer,
          embedderLayerOf(stubEmbedder()),
        ),
      ),
    ),
  )
  return envelope.data.findings.map((f) => f.code)
}

describe('waivability enforcement — the published flag is what the build does', () => {
  it('names only never-class codes in its probe', () => {
    for (const code of NEVER_CODES) expect(waivabilityOf(code), code).toBe('never')
  })

  it('write time: `apply`s fold accepts a never-class waiver exactly when the flag says it is not enforced', () => {
    const doc = built()
    for (const code of NEVER_CODES) {
      const folded = fold(doc, [{ op: 'waive', code, reason: 'accepted for this release' }])
      expect(folded.abortedAt === undefined, `${code}: accepted`).toBe(!WAIVABILITY_ENFORCED)
    }
  })

  it('check time: a stored never-class waiver suppresses its finding exactly when the flag says it is not enforced', async () => {
    const doc = built()
    expect(await checkCodes(doc)).toContain('FND_CONTRADICTION')
    const waived: RequirementsDocument = {
      ...doc,
      waivers: [{ code: 'FND_CONTRADICTION', reason: 'hand-edited' }],
    }
    const suppressed = !(await checkCodes(waived)).includes('FND_CONTRADICTION')
    expect(suppressed).toBe(!WAIVABILITY_ENFORCED)
  })

  it('publishes the flag with the column, on the manifest, explain, and AGENTS.md', async () => {
    const { waivability } = currentManifest().signalClasses
    expect(waivability.enforced).toBe(WAIVABILITY_ENFORCED)
    const env = await Effect.runPromise(runOperation(explainOp, { code: 'FND_CONTRADICTION' }))
    expect(env.data.waivable).toBe('never')
    expect(env.data.waivableEnforced).toBe(WAIVABILITY_ENFORCED)
    const agents = renderAgentsDoc(currentManifest())
    expect(agents).toContain(waivability.statement)
    if (!WAIVABILITY_ENFORCED) {
      // The negative guard: while nothing enforces the column, no surface may state it in the
      // present tense. A bare `Waivable` header over a `never` row is exactly that claim.
      expect(waivability.statement).toMatch(/NOT enforced/)
      expect(agents).not.toContain('| Code | Severity | Tier | Class | Waivable | Meaning |')
      expect(agents).not.toContain('| Finding class | Waivable | In D | Meaning |')
    }
  })
})

// ---------------------------------------------------------------------------
// S3 (spec 007 AC-5-6): the flag is TRUE, and both halves hold unconditionally
// ---------------------------------------------------------------------------

/**
 * One published never-class code per never class, read off `FINDING_CLASS` so the probe cannot
 * name a class no code has. `anchor` is a never class too, but no published code carries it on
 * this build (`FINDING_CLASS` has no anchor row), so the loop covers the classes that exist and
 * picks up an anchor code the day one is published.
 */
const NEVER_BY_CLASS: readonly (readonly [string, string])[] = Object.entries(WAIVABILITY)
  .filter(([, waivable]) => waivable === 'never')
  .flatMap(([cls]) => {
    const code = Object.entries(FINDING_CLASS).find(([, row]) => row.class === cls)?.[0]
    return code === undefined ? [] : [[cls, code] as const]
  })

/** The fold entry an aborted fold stopped at. */
const refusal = (doc: RequirementsDocument, ops: readonly DocumentOp[]) => {
  const folded = fold(doc, ops)
  return folded.abortedAt === undefined ? undefined : folded.results[folded.abortedAt]
}

describe('[S3-044] waivability is enforced, and nothing publishes otherwise', () => {
  it('[S3-044] WAIVABILITY_ENFORCED is true', () => {
    expect(WAIVABILITY_ENFORCED).toBe(true)
  })

  it('[S3-044] the probe covers one never code of every never class a published code has', () => {
    expect(NEVER_BY_CLASS.map(([cls]) => cls)).toEqual(
      expect.arrayContaining(['verdict', 'disclosure', 'triage', 'hygiene']),
    )
    for (const [, code] of NEVER_BY_CLASS) expect(waivabilityOf(code), code).toBe('never')
  })

  it('[S3-044] no surface says "NOT enforced": the statement, the manifest, AGENTS.md and explain', async () => {
    expect(waivabilityStatement()).not.toMatch(/NOT enforced/)
    expect(currentManifest().signalClasses.waivability.statement).not.toMatch(/NOT enforced/)
    // A boolean, not `not.toContain`: a failure would otherwise print all of AGENTS.md.
    expect(renderAgentsDoc(currentManifest()).includes('NOT enforced'), 'rendered AGENTS.md').toBe(
      false,
    )
    for (const [, code] of NEVER_BY_CLASS) {
      const env = await Effect.runPromise(runOperation(explainOp, { code }))
      expect(JSON.stringify(env.data), code).not.toContain('NOT enforced')
      expect(env.data.waivableEnforced, code).toBe(true)
    }
  })

  it('[S3-044] the committed AGENTS.md does not say "NOT enforced by this build"', () => {
    const committed = readFileSync(new URL('../../../AGENTS.md', import.meta.url), 'utf8')
    expect(committed.includes('NOT enforced by this build'), 'AGENTS.md').toBe(false)
  })

  it('[S3-044] write time: the fold refuses a never code of each class, code-only and refs+hash, with ERR_WAIVER_REFUSED', () => {
    const doc = built()
    const refs = Object.keys(doc.requirements).sort()
    const contentHash = requirementsContentHash(doc, refs)
    expect(contentHash).toBeDefined()
    for (const [cls, code] of NEVER_BY_CLASS) {
      const codeOnly = refusal(doc, [{ op: 'waive', code, reason: 'accepted for this release' }])
      expect(codeOnly?.code, `${cls} ${code}: code-only`).toBe('ERR_WAIVER_REFUSED')
      const scoped = refusal(doc, [
        {
          op: 'waive',
          code,
          refs,
          ...(contentHash !== undefined ? { contentHash } : {}),
          reason: 'reviewed: these two were read',
        },
      ])
      expect(scoped?.code, `${cls} ${code}: refs+hash`).toBe('ERR_WAIVER_REFUSED')
    }
  })

  it('[S3-044] check time: a stored FND_CONTRADICTION waiver, code-only or refs+hash, suppresses nothing', async () => {
    const doc = built()
    const refs = Object.keys(doc.requirements).sort()
    const contentHash = requirementsContentHash(doc, refs)
    for (const waiver of [
      { code: 'FND_CONTRADICTION', reason: 'hand-edited' },
      { code: 'FND_CONTRADICTION', requirementIds: refs, contentHash, reason: 'hand-edited' },
    ]) {
      const waived = { ...doc, waivers: [waiver] } as unknown as RequirementsDocument
      expect(await checkCodes(waived), JSON.stringify(waiver)).toContain('FND_CONTRADICTION')
    }
  })
})
