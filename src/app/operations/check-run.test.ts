/**
 * AC-3-5 (spec 007): a run on the TEST stub embedder is a weakened run, and it says so.
 *
 * The stub is a hash function chosen for determinism. Its cosines are meaningless, so the
 * opposition detector — part of the certification surface — cannot find the candidate a real
 * model would. The review's reproducer is "heat the cabin" / "cool the cabin" under one
 * trigger: `verified: false` on the pinned model (an untriaged opposition candidate) and
 * `verified: true` on the stub. A certificate that depends on which embedder happened to be
 * loaded is not a certificate.
 *
 * The opt-out for tests that need a clean run is NOT an environment variable: it is the
 * existing `embedderLayerOf` seam, where the caller supplies the embedder and therefore owns
 * what its cosines mean. The production Layer selects the stub only through
 * `SYMSPEC_EMBED_STUB=1`, and that path now always demotes.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Effect, Layer } from 'effect'
import { afterAll, describe, expect, it } from 'vitest'
import { stubEmbedder } from '../../adapters/embedding/embedder.ts'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import type { Embedder } from '../../domain/engine/formal/embed.ts'
import { DEFAULT_SEMANTIC_THRESHOLD } from '../../domain/engine/formal/semantic.ts'
import {
  emptyDocument,
  type LoadedDocument,
  type Requirement,
  type RequirementsDocument,
} from '../../domain/requirements/document.ts'
import { DocPath, DocStore, makeDocPath } from '../../ports/doc-store.ts'
import { EmbedderService, embedderLayerOf } from '../../ports/embedder.ts'
import { runOperation } from '../runtime/operation.ts'
import { type CheckPayload, checkOp } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'

const req = (
  partial: Partial<Requirement> & Pick<Requirement, 'id' | 'sentence'>,
): Requirement => ({
  patternType: 'ubiquitous',
  systemName: 'system',
  systemResponse: 'operate',
  negated: false,
  priority: 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: TS,
  updatedAt: TS,
  ...partial,
})

/** The review's reproducer: two responses under one trigger that a real model flags. */
const heatCoolDoc = (): RequirementsDocument => ({
  ...emptyDocument(),
  requirements: Object.fromEntries(
    [
      req({
        id: '11111111-1111-4111-8111-111111111111',
        patternType: 'event-driven',
        trigger: 'the operator presses the button',
        systemName: 'station controller',
        systemResponse: 'heat the cabin',
        sentence:
          'When the operator presses the button, the station controller shall heat the cabin.',
      }),
      req({
        id: '22222222-2222-4222-8222-222222222222',
        patternType: 'event-driven',
        trigger: 'the operator presses the button',
        systemName: 'station controller',
        systemResponse: 'cool the cabin',
        sentence:
          'When the operator presses the button, the station controller shall cool the cabin.',
      }),
    ].map((r) => [r.id, r]),
  ),
})

/** Distinct texts are orthogonal, so the semantic tier runs and proposes nothing. */
const orthogonalEmbedder = (): Embedder => {
  const index = new Map<string, number>()
  return async (texts) =>
    texts.map((t) => {
      if (!index.has(t)) index.set(t, index.size)
      const v = new Float32Array(64)
      v[(index.get(t) as number) % 64] = 1
      return v
    })
}

const memoryStore = (document: RequirementsDocument) =>
  Layer.succeed(DocStore)(
    DocStore.of({
      load: () =>
        Effect.succeed({ document, unknownKeys: {}, diagnostics: [] } satisfies LoadedDocument),
      save: () => Effect.void,
      exists: () => Effect.succeed(true),
    }),
  )

const runWith = async (
  embedderLayer: Layer.Layer<EmbedderService>,
  input: Record<string, unknown> = {},
): Promise<CheckPayload> => {
  const result = await Effect.runPromise(
    Effect.result(runOperation(checkOp, { file: 'doc.json', ...input })).pipe(
      Effect.provide(
        Layer.mergeAll(
          memoryStore(heatCoolDoc()),
          Layer.succeed(DocPath)(makeDocPath({})),
          solverServiceLayer,
          embedderLayer,
        ),
      ),
    ),
  )
  if (result._tag === 'Failure') throw new Error(JSON.stringify(result.failure))
  return (result.success as { data: CheckPayload }).data
}

/** The service exactly as the production Layer builds it under `SYMSPEC_EMBED_STUB=1`. */
const stubService = Layer.succeed(EmbedderService)(
  EmbedderService.of({ load: Effect.succeed(stubEmbedder()), isStub: true }),
)

describe('AC-3-5: the stub embedder is a run-weakening move', () => {
  it('control: a caller-supplied embedder certifies the reproducer, and says which embedder ran', async () => {
    const data = await runWith(embedderLayerOf(orthogonalEmbedder()))
    expect(data.coverage.demotions).toEqual([])
    expect(data.verified).toBe(true)
    expect(data.run.embedder).toBe('model')
  })

  it('demotes with run-weakened and discloses data.run.embedder = "stub"', async () => {
    const data = await runWith(stubService)
    // Premise: the stub proposes no opposition candidate here, so without the demotion this
    // run would be `verified: true` — the review's reproducer exactly.
    expect(data.findings.map((f) => f.code)).not.toContain('FND_OPPOSITION_CANDIDATE')
    expect(data.coverage.demotions.map((d) => d.reason)).toEqual(['run-weakened'])
    expect(data.coverage.demotions[0]?.action).toContain('SYMSPEC_EMBED_STUB')
    expect(data.verified).toBe(false)
    expect(data.run.embedder).toBe('stub')
  })

  it('fails the strict gate on the stub', async () => {
    const data = await runWith(stubService, { strict: true })
    expect(data.strictGate).toBe('fail')
  })

  it('discloses "off" when the semantic tier is skipped, alongside its own demotion', async () => {
    const data = await runWith(stubService, { semantic: false })
    expect(data.run.embedder).toBe('off')
    expect(data.coverage.demotions.map((d) => d.reason)).toEqual(['semantic-tier-skipped'])
  })
})

describe('I-1: a --semantic-threshold above the default is a run-weakening move', () => {
  it('control: the default threshold is disclosed and certifies', async () => {
    const data = await runWith(embedderLayerOf(orthogonalEmbedder()))
    expect(data.run).toEqual({ embedder: 'model', semanticThreshold: DEFAULT_SEMANTIC_THRESHOLD })
    expect(data.verified).toBe(true)
  })

  it('a raised threshold demotes, is disclosed, and its repair drops the flag', async () => {
    const data = await runWith(embedderLayerOf(orthogonalEmbedder()), {
      semanticThreshold: 0.99,
      strict: true,
    })
    expect(data.run.semanticThreshold).toBe(0.99)
    expect(data.coverage.demotions.map((d) => d.reason)).toEqual(['run-weakened'])
    // The model ran, so the repair is the plain invocation — not the stub switch, and never a
    // command that carries the raised threshold again.
    expect(data.coverage.demotions[0]?.repair?.commands).toEqual(['symspec check doc.json'])
    expect(data.verified).toBe(false)
    expect(data.strictGate).toBe('fail')
  })
})

// ---------------------------------------------------------------------------
// The shipped bundle, under the suite's own SYMSPEC_EMBED_STUB=1
// ---------------------------------------------------------------------------

const BUNDLE = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'symspec-run-weakened-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('AC-3-5 through the built CLI', () => {
  it('a stub run is never verified, and --strict exits 3', () => {
    expect(existsSync(BUNDLE), 'run `pnpm build` first').toBe(true)
    // The suite runs every spawn with SYMSPEC_EMBED_STUB=1 (vitest.config.ts); assert it,
    // because this test is about exactly that switch.
    expect(process.env.SYMSPEC_EMBED_STUB).toBe('1')
    const path = join(dir, 'heatcool.json')
    writeFileSync(path, JSON.stringify(heatCoolDoc()))
    const spawn = (...args: string[]) =>
      spawnSync(process.execPath, [BUNDLE, ...args], { encoding: 'utf8' })

    const plain = spawn('check', path)
    const envelope = JSON.parse(plain.stdout) as {
      data: {
        verified: boolean
        run: { embedder: string }
        coverage: { demotions: { reason: string }[] }
      }
    }
    expect(envelope.data.run.embedder).toBe('stub')
    expect(envelope.data.coverage.demotions.map((d) => d.reason)).toEqual(['run-weakened'])
    expect(envelope.data.verified).toBe(false)

    expect(spawn('check', path, '--strict').status).toBe(3)
  })
})
