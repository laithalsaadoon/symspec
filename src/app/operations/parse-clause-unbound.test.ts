/**
 * Spec 007 AC-2-2 at the operation boundary: an unbound leading clause reaches the `parse`
 * payload as an error-severity FINDING and contributes NO op, so `parse --field data.opsJsonl |
 * apply` cannot store the requirement with its condition removed. A no-modal line that opens
 * with the same marker stays `skipped`, so a batch over a real `requirements.md` is not flooded
 * with errors for its prose. The ladder-level cases live in
 * `domain/engine/parse/clause-unbound.test.ts`.
 */

import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { StreamSource } from '../../ports/stream.ts'
import { runOperation } from '../runtime/operation.ts'
import { type ParsePayload, parseOp } from './parse.ts'

const run = async (input: Record<string, unknown>, streamed = ''): Promise<ParsePayload> => {
  const { data } = await Effect.runPromise(
    runOperation(parseOp, input).pipe(
      Effect.provide(
        Layer.succeed(StreamSource)(StreamSource.of({ read: () => Effect.succeed(streamed) })),
      ),
    ),
  )
  return data as ParsePayload
}

describe('AC-2-2 — `parse` never proposes an op for an unbound clause', () => {
  it('reports ERR_CLAUSE_UNBOUND as an error finding and proposes no op', async () => {
    const payload = await run({
      text: 'Unless the guard door is closed, the press controller shall not start the press.',
    })
    expect(payload.ops).toEqual([])
    expect(payload.opsJsonl).toBe('')
    expect(payload.findings.map((f) => f.code)).toEqual(['ERR_CLAUSE_UNBOUND'])
    expect(payload.findings[0]?.severity).toBe('error')
    expect(payload.findings[0]?.message).toContain('"Unless the guard door is closed"')
  })

  it('a batch keeps no-modal marker prose skipped and stores the plain requirement', async () => {
    const payload = await run(
      { file: 'notes.md' },
      [
        '# Requirements',
        '- Before deploying, read the runbook.',
        '- Until further notice this list is a draft.',
        '- The gateway shall log requests.',
        '- Before startup, the gateway shall load its config.',
      ].join('\n'),
    )
    expect(payload.summary).toEqual({ ok: 1, skipped: 2, error: 1 })
    expect(payload.ops).toHaveLength(1)
    expect(payload.findings.map((f) => f.code)).toEqual(['ERR_CLAUSE_UNBOUND'])
  })
})
