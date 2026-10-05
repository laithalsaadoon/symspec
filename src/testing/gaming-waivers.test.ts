/**
 * THE SCOPED DISCHARGE the gaming gate does not list as an escape (ruling R45, S3-047).
 *
 * A scoped, reviewed waiver of a SCOPED-class finding — its code over the exact requirement ids it
 * was raised on and the hash of their current text — is the designed way to accept it, not a
 * gaming move. So `waive-scoped-never` and `waive-raw` run only on never-class fixtures, and the
 * one fixture whose seeded finding is scoped-class (`derives-cycle`, FND_CYCLE) is pinned here,
 * positively: the discharge is accepted at write and the run is clean.
 *
 * Wired like a shard: `testing/` may not name `app/` or `adapters/` (`../package-boundary.test.ts`).
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { embedderServiceLayer } from '../adapters/embedding/embedder.ts'
import { solverServiceLayer } from '../adapters/z3/solver-service.ts'
import { checkOp } from '../app/operations/check.ts'
import { MUTATE_OPTIONS } from '../app/operations/mutate-options.ts'
import { exitCodeForEnvelope } from '../app/runtime/exit.ts'
import { runOperation } from '../app/runtime/operation.ts'
import {
  dCovers,
  dDisplaced,
  equivalencesOf,
  verdictBearingOf,
  waivabilityOf,
} from '../app/runtime/signal-classes.ts'
import { requirementsContentHash } from '../domain/requirements/content-hash.ts'
import { buildDoc, FIXTURES, type GamingWiring, isClean, type Move, runMatrix } from './gaming.ts'

const wiring: GamingWiring = {
  check: (input) =>
    runOperation(checkOp, input).pipe(
      Effect.map((envelope) => ({ exit: exitCodeForEnvelope(envelope), data: envelope.data })),
    ),
  solver: solverServiceLayer,
  envEmbedder: embedderServiceLayer,
  mutateOptions: MUTATE_OPTIONS,
  verdictBearing: {
    of: verdictBearingOf,
    equivalences: equivalencesOf,
    covers: dCovers,
    displaced: dDisplaced,
  },
  waivability: waivabilityOf,
}

const REASON = 'reviewed: the derives loop is the intended mutual refinement'

/** Every FND_CYCLE the baseline reports, waived over its exact ids and their current hash. */
const scopedCycleWaive: Move = {
  id: 'scoped-cycle-waive',
  clause: 'S3-047: the designed scoped discharge of a scoped-class finding',
  edit: ({ doc, baselineFindings }) => {
    const ops = baselineFindings
      .filter((f) => f.code === 'FND_CYCLE' && f.requirementIds.length > 0)
      .map((f) => {
        const refs = [...f.requirementIds].sort()
        return {
          op: 'waive' as const,
          code: f.code,
          refs,
          contentHash: requirementsContentHash(doc, refs) ?? '',
          reason: REASON,
        }
      })
    return ops.length === 0
      ? { kind: 'inapplicable', reason: 'the baseline reports no FND_CYCLE' }
      : { kind: 'ops', ops }
  },
}

describe('the scoped discharge of a scoped-class finding', () => {
  it('[S3-047] the derives-cycle FND_CYCLE scoped discharge: a refs+contentHash waive over the cycle ids is accepted and the run is clean', async () => {
    const fixture = FIXTURES.find((f) => f.id === 'derives-cycle')
    expect(fixture).toBeDefined()
    if (fixture === undefined) return
    expect(waivabilityOf('FND_CYCLE')).toBe('scoped')

    const matrix = await runMatrix(wiring, [fixture], [scopedCycleWaive])
    const baseline = matrix.baselines.get('derives-cycle')
    expect(baseline?.kind).toBe('ran')
    if (baseline?.kind !== 'ran') return
    expect(isClean(baseline), 'the baseline must be dirty for the discharge to mean anything').toBe(
      false,
    )
    const cycles = baseline.findings.filter((f) => f.code === 'FND_CYCLE')
    expect(cycles.length).toBeGreaterThan(0)
    // The seeded cycle, by its ids: the waive below names exactly these.
    const doc = buildDoc(fixture.ops, MUTATE_OPTIONS)
    const seeded = fixture.signal.names
      .map((k) => Object.values(doc.requirements).find((r) => r.key === k)?.id)
      .sort()
    expect(
      cycles.some((f) => seeded.every((id) => id !== undefined && f.requirementIds.includes(id))),
    ).toBe(true)

    const [cell] = matrix.cells
    expect(cell?.move).toBe('scoped-cycle-waive')
    const outcome = cell?.outcome
    expect(outcome?.kind, `the scoped waive was not accepted: ${JSON.stringify(outcome)}`).toBe(
      'ran',
    )
    if (outcome?.kind !== 'ran') return
    expect(outcome.codes).not.toContain('FND_CYCLE')
    expect(isClean(outcome), `the discharged run is not clean: ${JSON.stringify(outcome)}`).toBe(
      true,
    )
  }, 120_000)
})
