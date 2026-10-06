/**
 * A waiver scoped to a finding's EXACT requirement set (`Waiver.requirementIds`) suppresses that
 * finding and nothing else.
 *
 * The reviewed-waiver discharge for a pair demotion used to be scoped by ONE requirement id, and
 * `check` suppresses a ref-scoped waiver's code on every finding that names the ref. So an honest
 * triage of the siren pair "within 2 seconds" / "for at least 30 seconds" also silenced the
 * `FND_RELATIONAL_UNCHECKED` over a THIRD siren requirement added later — one finding over all
 * three ids, which includes the ref — and the document reached `verified: true` with a pair
 * nobody reviewed. An exact-set waiver matches a finding only when the finding names exactly its
 * ids, so a cluster that grows is a different finding. (The content-hash half of the binding is
 * enforced at the boundary, `../../compat.ts`.)
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from './check.ts'

const TS = '2026-01-01T00:00:00.000Z'
const W = '00000000-0000-4000-8000-000000000001'
const X = 'ffffffff-0000-4000-8000-000000000002'
const Y = '88888888-0000-4000-8000-000000000003'

const siren = (id: string, systemResponse: string) => ({
  id,
  patternType: 'event-driven' as const,
  trigger: 'the smoke detector trips',
  systemName: 'fire panel',
  systemResponse,
  negated: false,
  sentence: `When the smoke detector trips, the fire panel shall ${systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

const docOf = (reqs: ReturnType<typeof siren>[], waivers: unknown[]) => ({
  schemaVersion: 2,
  requirements: Object.fromEntries(reqs.map((r) => [r.id, r])),
  glossary: [],
  antonyms: [],
  waivers,
  terms: [],
})

const PAIR = [
  siren(W, 'sound the siren within 2 seconds'),
  siren(X, 'sound the siren for at least 30 seconds'),
]
const THIRD = siren(Y, 'sound the siren after at least 10 seconds')

const exact = (code: string, ids: string[]) => ({
  code,
  requirementIds: ids,
  reason: 'reviewed: siren starts within 2 s and then runs 30 s; consistent',
})
const PAIR_WAIVERS = [
  exact('FND_RELATIONAL_UNCHECKED', [X, W]),
  exact('FND_NUMERIC_UNCOMPARED', [W, X]),
]

const codes = (report: Awaited<ReturnType<typeof runCheck>>) => report.findings.map((f) => f.code)
const reasons = (report: Awaited<ReturnType<typeof runCheck>>) =>
  report.coverage.demotions.map((d) => d.reason)

describe('an exact-set waiver suppresses only the finding it was raised on', () => {
  it('control: the siren pair raises both findings and both demotions', async () => {
    const report = await runCheck(docOf(PAIR, []) as never, {})
    expect(codes(report)).toEqual(
      expect.arrayContaining(['FND_RELATIONAL_UNCHECKED', 'FND_NUMERIC_UNCOMPARED']),
    )
    expect(reasons(report)).toEqual(
      expect.arrayContaining(['relational-reasoning-not-attempted', 'numeric-bounds-uncompared']),
    )
  })

  it('discharges the pair it names, in any id order', async () => {
    const report = await runCheck(docOf(PAIR, PAIR_WAIVERS) as never, {})
    expect(codes(report)).not.toContain('FND_RELATIONAL_UNCHECKED')
    expect(codes(report)).not.toContain('FND_NUMERIC_UNCOMPARED')
    expect(report.waived).toBe(2)
    expect(reasons(report)).not.toContain('relational-reasoning-not-attempted')
    expect(reasons(report)).not.toContain('numeric-bounds-uncompared')
  })

  it('does NOT discharge the cluster once a third requirement joins it', async () => {
    const report = await runCheck(docOf([...PAIR, THIRD], PAIR_WAIVERS) as never, {})
    const relational = report.findings.filter((f) => f.code === 'FND_RELATIONAL_UNCHECKED')
    expect(relational).toHaveLength(1)
    expect([...relational[0]!.requirementIds].sort()).toEqual([W, X, Y].sort())
    expect(reasons(report)).toContain('relational-reasoning-not-attempted')
    expect(report.verified).toBe(false)
  })

  it('does NOT discharge a pair that merely shares one of its ids', async () => {
    // W/Y is a pair of its own: the waiver on W/X names W, and a ref-scoped waiver on W would
    // have suppressed it.
    const report = await runCheck(
      docOf([PAIR[0]!, THIRD], [exact('FND_RELATIONAL_UNCHECKED', [W, X])]) as never,
      {},
    )
    expect(codes(report)).toContain('FND_RELATIONAL_UNCHECKED')
    expect(report.waived).toBe(0)
  })
})

describe('the AC-3-7 gate reads an exact-set waiver the same way', () => {
  // "fast" is a GtWR vague term (R7), an error-severity blocking finding, on both requirements.
  const vague = (id: string) => ({
    ...siren(id, 'respond fast'),
    sentence: 'When the smoke detector trips, the fire panel shall respond fast.',
  })

  it('re-admits only the requirement the waiver names, never the whole document', async () => {
    const plain = await runCheck(docOf([vague(W), vague(X)], []) as never, {})
    expect(plain.excluded.map((e) => e.id).sort()).toEqual([W, X].sort())
    const blocking = plain.findings.find(
      (f) => f.severity === 'error' && f.requirementIds.length === 1 && f.requirementIds[0] === W,
    )
    expect(blocking).toBeDefined()
    const code = blocking!.code
    const waived = await runCheck(docOf([vague(W), vague(X)], [exact(code, [W])]) as never, {})
    const excludedIds = waived.excluded.map((e) => e.id)
    expect(excludedIds).toContain(X)
    expect(excludedIds).not.toContain(W)
    expect(waived.findings.filter((f) => f.code === code).flatMap((f) => f.requirementIds)).toEqual(
      [X],
    )
  })
})
