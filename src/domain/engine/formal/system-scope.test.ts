/**
 * The propose tiers scope a pair by the SAME system key the atoms carry (`normalizeScope`).
 *
 * An atom's scope folds case and punctuation: "Access Controller", "access controller" and
 * "access-controller" all name `sys__access_controller__…`, so the solver reads their responses
 * as one system's. A propose tier that compared the RAW name skipped exactly those pairs, and a
 * pair the decide tier does not relate (two verbs no seed row joins, or two objects a preposition
 * apart) then had no safety net at all: `verified: true` came back over a real conflict, exit 0
 * even under `--strict`, the moment one requirement spelled its system with a capital letter.
 *
 * Every fixture below holds its two requirements in ONE atom scope under two spellings, and
 * asserts the tier still sees the pair. The controls hold two genuinely different systems.
 */

import { describe, expect, it } from 'vitest'
import { runCheck } from '../pipeline/check.ts'
import { emitCandidatePairs } from '../solvers/free/pairwise-filter.ts'
import { atomize } from './atomize.ts'
import type { Embedder } from './embed.ts'
import { findOppositionCandidates, findSimilarSemantic } from './semantic.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idOf = (n: number) => `0b0b0b0b-0000-4000-8000-${String(n).padStart(12, '0')}`
const PRESS = 'the operator presses the button'

interface Row {
  readonly systemName: string
  readonly systemResponse: string
  readonly negated?: boolean
}

const reqOf = (n: number, r: Row) => ({
  id: idOf(n),
  patternType: 'event-driven' as const,
  systemName: r.systemName,
  trigger: PRESS,
  systemResponse: r.systemResponse,
  negated: r.negated ?? false,
  sentence: `When ${PRESS}, the ${r.systemName} shall ${r.negated === true ? 'not ' : ''}${r.systemResponse}.`,
  priority: 'medium' as const,
  status: 'draft' as const,
  createdAt: TS,
  updatedAt: TS,
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
})

const docOf = (rows: readonly Row[]) => ({
  requirements: Object.fromEntries(rows.map((r, i) => [idOf(i + 1), reqOf(i + 1, r)])),
  glossary: [],
  antonyms: [],
  waivers: [],
  terms: [],
  stateModel: { variables: [] },
})

const orthogonal: Embedder = async (texts) =>
  texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1]))
const parallel: Embedder = async (texts) => texts.map(() => Float32Array.from([1, 0]))

/** The spellings of one system that share an atom scope, and a genuinely different one. */
const SPELLINGS = [
  ['Access Controller', 'access controller'],
  ['access controller', 'access-controller'],
  ['ACCESS CONTROLLER', 'Access  Controller'],
] as const

describe('the spellings under test really are one atom scope', () => {
  for (const [a, b] of SPELLINGS) {
    it(`${a} / ${b}`, () => {
      const scope = (systemName: string) =>
        atomize({ kind: 'resp', text: 'open the gate', systemName }).name
      expect(scope(a)).toBe(scope(b))
    })
  }
})

describe('findOppositionCandidates compares systems by atom scope', () => {
  // `grant` and `allow` sit on one side of the authorization class: no row relates them, so the
  // solver reads "grant access" / "not allow access" as two unrelated atoms. The candidate tier
  // is the only thing that stops the run certifying the pair.
  for (const [a, b] of SPELLINGS) {
    it(`proposes grant / not allow across ${a} / ${b}`, async () => {
      const found = await findOppositionCandidates(
        [
          { id: 'a', systemName: a, systemResponse: 'grant access to the vault' },
          { id: 'b', systemName: b, systemResponse: 'allow access to the vault', negated: true },
        ] as never,
        orthogonal,
      )
      expect(found.map((f) => f.requirementIds)).toEqual([['a', 'b']])
    })
  }

  it('does not propose across two different systems', async () => {
    const found = await findOppositionCandidates(
      [
        { id: 'a', systemName: 'access controller', systemResponse: 'grant access to the vault' },
        {
          id: 'b',
          systemName: 'door controller',
          systemResponse: 'allow access to the vault',
          negated: true,
        },
      ] as never,
      orthogonal,
    )
    expect(found).toEqual([])
  })

  it('so a document the solver compares elsewhere never certifies the pair', async () => {
    // The verifier's shape: the gate pair is a decide-tier comparison, so nothing else demotes,
    // and the grant / not-allow pair must be what keeps `verified` false.
    const report = await runCheck(
      docOf([
        { systemName: 'Access Controller', systemResponse: 'grant access to the vault' },
        {
          systemName: 'access controller',
          systemResponse: 'allow access to the vault',
          negated: true,
        },
        { systemName: 'access controller', systemResponse: 'open the gate' },
        { systemName: 'access controller', systemResponse: 'close the gate', negated: true },
      ]) as never,
      { semantic: { embedder: orthogonal } },
    )
    const candidates = report.findings.filter((f) => f.code === 'FND_OPPOSITION_CANDIDATE')
    expect(candidates.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
    expect(report.verified).toBe(false)
  })
})

describe('findSimilarSemantic compares systems by atom scope', () => {
  for (const [a, b] of SPELLINGS) {
    it(`proposes a paraphrase across ${a} / ${b}`, async () => {
      const found = await findSimilarSemantic(
        [
          { id: 'a', systemName: a, systemResponse: 'archive the audit log' },
          { id: 'b', systemName: b, systemResponse: 'store the audit log' },
        ] as never,
        parallel,
        { threshold: 0.5 },
      )
      expect(found.map((f) => [...f.requirementIds].sort())).toEqual([['a', 'b']])
    })
  }

  it('does not propose across two different systems', async () => {
    const found = await findSimilarSemantic(
      [
        { id: 'a', systemName: 'access controller', systemResponse: 'archive the audit log' },
        { id: 'b', systemName: 'door controller', systemResponse: 'store the audit log' },
      ] as never,
      parallel,
      { threshold: 0.5 },
    )
    expect(found).toEqual([])
  })
})

describe('the quantity-alias candidate compares systems by atom scope', () => {
  const deadline = (systemName: string, systemResponse: string) => ({ systemName, systemResponse })
  for (const [a, b] of SPELLINGS) {
    it(`proposes one quantity under two verbs across ${a} / ${b}`, async () => {
      const report = await runCheck(
        docOf([
          deadline(a, 'start the siren within 2 seconds'),
          deadline(b, 'sound the siren in at least 30 seconds'),
        ]) as never,
        {},
      )
      expect(report.findings.map((f) => f.code)).toContain('FND_QUANTITY_ALIAS_CANDIDATE')
      expect(report.verified).toBe(false)
    })
  }

  it('does not propose across two different systems', async () => {
    const report = await runCheck(
      docOf([
        deadline('siren controller', 'start the siren within 2 seconds'),
        deadline('alarm panel', 'sound the siren in at least 30 seconds'),
      ]) as never,
      {},
    )
    expect(report.findings.map((f) => f.code)).not.toContain('FND_QUANTITY_ALIAS_CANDIDATE')
  })
})

describe('the pairwise candidate filter compares systems by atom scope', () => {
  const view = (id: string, systemName: string, systemResponse: string) => ({
    id,
    patternType: 'event-driven',
    systemName,
    trigger: PRESS,
    systemResponse,
    sentence: `When ${PRESS}, the ${systemName} shall ${systemResponse}.`,
  })
  for (const [a, b] of SPELLINGS) {
    it(`pairs one trigger's two responses across ${a} / ${b}`, () => {
      const pairs = emitCandidatePairs([
        view('a', a, 'open the gate'),
        view('b', b, 'open the gate and sound the bell'),
      ] as never)
      expect(pairs.map((p) => [p.a, p.b])).toEqual([['a', 'b']])
    })
  }

  it('does not pair two different systems', () => {
    const pairs = emitCandidatePairs([
      view('a', 'access controller', 'open the gate'),
      view('b', 'door controller', 'open the gate and sound the bell'),
    ] as never)
    expect(pairs).toEqual([])
  })
})
