/**
 * S3 Waivability (spec 007 AC-5-6) at the ENGINE tier (kept outside `domain/engine/` so the
 * engine stays self-contained, `package-boundary.test.ts`): what S3 must leave exactly as it is.
 *
 * S3 changes engine prose only (plan section 10, ruling R23). The waiver rules move to the
 * compat boundary, which invites deleting the engine's own pair-bound test as "now redundant";
 * these pin that the engine still declines a code-only opposition waiver even when it is handed
 * one directly (S3-031), and that the gate's hand-mirrored `isWaivedBlocking` re-admits a
 * requirement exactly when `isWaived` suppresses its blocking finding (S3-032). Both are
 * regressions: they pass on base, and must keep passing.
 *
 * The engine is driven with waivers written straight into its `Doc`, bypassing compat, so the
 * engine's own behaviour is what is measured.
 */

import { describe, expect, it } from 'vitest'
import { toEngineDoc } from '../domain/compat.ts'
import { runCheck } from '../domain/engine/pipeline/check.ts'
import type { RequirementsDocument } from '../domain/requirements/document.ts'
import { orthogonalEmbedder } from './gaming.ts'
import { fixtureDoc, ID, ids, NEAR } from './waiver-fixture.ts'

type EngineWaiver = {
  readonly code: string
  readonly reason: string
  readonly requirementId?: string
  readonly requirementIds?: readonly string[]
  readonly textBound?: boolean
}

const engineDoc = (document: RequirementsDocument, waivers: readonly EngineWaiver[]) => ({
  ...toEngineDoc({ ...document, waivers: [] }),
  waivers: waivers.map((w) => ({
    ...w,
    ...(w.requirementIds ? { requirementIds: [...w.requirementIds] } : {}),
  })),
})

describe('S3 engine tier: unchanged waiver logic', () => {
  it('[S3-031] the engine still declines a code-only (and a one-ref) FND_OPPOSITION_CANDIDATE waiver handed to it directly: the CAB pair keeps demoting', async () => {
    const base = fixtureDoc('base.json')
    for (const w of [
      { code: 'FND_OPPOSITION_CANDIDATE', reason: 'hand-edited' },
      { code: 'FND_OPPOSITION_CANDIDATE', reason: 'hand-edited', requirementId: ID['CAB-R1'] },
      {
        code: 'FND_OPPOSITION_CANDIDATE',
        reason: 'hand-edited',
        requirementIds: ids('CAB-R1', 'CAB-R2'),
      },
    ] satisfies EngineWaiver[]) {
      const report = await runCheck(engineDoc(base, [w]) as never, {
        semantic: { embedder: orthogonalEmbedder(NEAR) },
      })
      const demotions = report.coverage.demotions
        .filter((d) => d.reason === 'open-opposition-candidate')
        .map((d) => [...d.requirementIds].sort())
      expect(demotions, JSON.stringify(w)).toEqual([ids('CAB-R1', 'CAB-R2')])
      expect(report.verified).toBe(false)
    }
  })

  it('[S3-032] isWaivedBlocking re-admits a requirement exactly when isWaived suppresses its blocking finding, for every waiver shape over the ORD pair', async () => {
    const base = fixtureDoc('base.json')
    const ORD = ['ORD-R1', 'ORD-R2'] as const
    const shapes: readonly EngineWaiver[] = [
      { code: 'GTWR_R7_VAGUE', reason: 'r' },
      { code: 'GTWR_R7_VAGUE', reason: 'r', requirementId: ID['ORD-R1'] },
      { code: 'GTWR_R7_VAGUE', reason: 'r', requirementId: ID['LOG-R1'] },
      { code: 'GTWR_R7_VAGUE', reason: 'r', requirementIds: ids('ORD-R1') },
      { code: 'GTWR_R7_VAGUE', reason: 'r', requirementIds: ids('ORD-R2'), textBound: true },
      { code: 'GTWR_R7_VAGUE', reason: 'r', requirementIds: ids('ORD-R1', 'ORD-R2') },
      { code: 'GTWR_R7_VAGUE', reason: 'r', requirementIds: ids('LOG-R1') },
      { code: 'GTWR_R5_INDEFINITE_ARTICLE', reason: 'r', requirementIds: ids('ORD-R1') },
    ]
    const disagreements: string[] = []
    let readmitted = 0
    for (const w of shapes) {
      const report = await runCheck(engineDoc(base, [w]) as never, {})
      const excluded = new Set(report.excluded.map((e) => e.id))
      for (const key of ORD) {
        const id = ID[key]
        const suppressed = !report.findings.some(
          (f) => f.code === 'GTWR_R7_VAGUE' && f.requirementIds.includes(id),
        )
        if (suppressed === excluded.has(id)) disagreements.push(`${JSON.stringify(w)} on ${key}`)
        if (!excluded.has(id)) readmitted += 1
      }
    }
    expect(disagreements, 're-admitted and suppressed disagree').toEqual([])
    // Not vacuous: some shapes re-admit and some do not.
    expect(readmitted).toBeGreaterThan(0)
    expect(readmitted).toBeLessThan(shapes.length * ORD.length)
  })
})
