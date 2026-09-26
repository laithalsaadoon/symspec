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

import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { stubEmbedder } from '../../adapters/embedding/embedder.ts'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { emptyDocument, type RequirementsDocument } from '../../domain/requirements/document.ts'
import { foldOps } from '../../domain/requirements/mutate.ts'
import type { DocumentOp } from '../../domain/requirements/ops.ts'
import { DocPath, DocStore, makeDocPath } from '../../ports/doc-store.ts'
import { embedderLayerOf } from '../../ports/embedder.ts'
import { ErrDocNotFound } from '../../ports/errors.ts'
import { renderAgentsDoc } from '../runtime/agents-doc.ts'
import { runOperation } from '../runtime/operation.ts'
import { WAIVABILITY_ENFORCED, waivabilityOf } from '../runtime/signal-classes.ts'
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
    DocStore.of({
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
