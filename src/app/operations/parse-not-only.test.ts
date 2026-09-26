/**
 * Spec 007 AC-2-3 (D2) end to end: "shall not only X but also Y" is a positive obligation all
 * the way to the proof, not only in the parse.
 *
 * The parse stores it `negated: false` with `not only` kept in `systemResponse`. That is only
 * half the claim, because `check` does not read `negated` alone: `toEncodable` also re-negates a
 * stored response that opens with a negator, for hand-authored docs that baked "not …" into the
 * text. If that scan reads "not only …" as a negator, the requirement is encoded as the
 * prohibition the parse just declined to store, and the pair below is reported as a
 * contradiction it is not.
 *
 * So the loop runs the way an agent runs it — `parse` → its own `opsJsonl` → `apply` → `check` —
 * with no hand-written op stream, and pins the verdict `check` reaches.
 */

import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { stubEmbedder } from '../../adapters/embedding/embedder.ts'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import {
  emptyDocument,
  type LoadedDocument,
  type RequirementsDocument,
} from '../../domain/requirements/document.ts'
import { DocPath, DocStore, documentOnlyStore, makeDocPath } from '../../ports/doc-store.ts'
import { embedderLayerOf } from '../../ports/embedder.ts'
import { StreamSource } from '../../ports/stream.ts'
import { runOperation } from '../runtime/operation.ts'
import { type CheckPayload, checkOp } from './check.ts'
import { applyOpDefinition, type MutationPayload } from './mutation.ts'
import { type ParsePayload, parseOp } from './parse.ts'

interface World {
  document: RequirementsDocument
}

const layers = (world: World, stream: string) =>
  Layer.mergeAll(
    Layer.succeed(DocStore)(
      documentOnlyStore({
        load: () =>
          Effect.succeed({
            document: world.document,
            unknownKeys: {},
            diagnostics: [],
          } satisfies LoadedDocument),
        save: (_path, input) =>
          Effect.sync(() => {
            world.document = input.document
          }),
        exists: () => Effect.succeed(true),
      }),
    ),
    Layer.succeed(DocPath)(makeDocPath({})),
    Layer.succeed(StreamSource)(StreamSource.of({ read: () => Effect.succeed(stream) })),
    solverServiceLayer,
    embedderLayerOf(stubEmbedder()),
  )

const parse = (world: World, text: string): Promise<ParsePayload> =>
  Effect.runPromise(
    runOperation(parseOp, { file: 'requirements.md' }).pipe(Effect.provide(layers(world, text))),
  ).then((e) => e.data as ParsePayload)

const apply = (world: World, jsonl: string): Promise<MutationPayload> =>
  Effect.runPromise(
    runOperation(applyOpDefinition, { file: 'doc.json' }).pipe(
      Effect.provide(layers(world, jsonl)),
    ),
  ).then((e) => e.data as MutationPayload)

const check = (world: World): Promise<CheckPayload> =>
  Effect.runPromise(
    runOperation(checkOp, { file: 'doc.json' }).pipe(Effect.provide(layers(world, ''))),
  ).then((e) => e.data)

/** parse → apply → check over `lines`, returning the stored document and the check codes. */
const loop = async (lines: readonly string[]) => {
  const world: World = { document: emptyDocument() }
  const parsed = await parse(world, `${lines.join('\n')}\n`)
  expect(parsed.summary).toEqual({ ok: lines.length, skipped: 0, error: 0 })
  await apply(world, parsed.opsJsonl)
  const report = await check(world)
  return {
    stored: Object.values(world.document.requirements),
    codes: report.findings.map((f) => f.code),
  }
}

describe('AC-2-3 end to end: "shall not only X but also Y" is checked as a positive obligation', () => {
  it('the verifier pair: no FND_CONTRADICTION after parse → apply → check', async () => {
    const { stored, codes } = await loop([
      'The gateway shall not only log requests but also forward them.',
      'The gateway shall only log requests but also forward them.',
    ])
    expect(stored.map((r) => [r.systemResponse, r.negated === true])).toEqual(
      expect.arrayContaining([
        ['not only log requests but also forward them', false],
        ['only log requests but also forward them', false],
      ]),
    )
    expect(codes).not.toContain('FND_CONTRADICTION')
  }, 60_000)

  it('control: a real "shall not" against its positive is still a contradiction', async () => {
    // The same loop over a genuine prohibition. Without this, a check that never reports
    // FND_CONTRADICTION at all would pass the case above.
    const { codes } = await loop([
      'The gateway shall not log requests.',
      'The gateway shall log requests.',
    ])
    expect(codes).toContain('FND_CONTRADICTION')
  }, 60_000)
})
