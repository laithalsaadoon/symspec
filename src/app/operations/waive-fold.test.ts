/**
 * S3 Waivability (spec 007 AC-5-6), the WRITE half: what `apply`'s fold does with a `waive` op.
 *
 * Every waive here is folded under `MUTATE_OPTIONS`, the options `apply`, `symspec waive` and
 * `import` all fold under, so a refusal the fold makes is one every write channel makes. The
 * document is the VDD run's shared fixture (`testing/__fixtures__/s3-waivability/base.json`);
 * the expected outcomes are the readings' settled examples and rulings R1-R12, R37
 * (`.erpaval/vdd/s3-waivability/readings.md`).
 *
 * The properties are exhaustive loops, not samples: every code the catalog publishes, times
 * every scope shape a `waive` op can carry. A class that is `never` refuses in every shape; a
 * `scoped` class refuses only without `refs` (or `ref`), and a missing hash is computed (R37).
 */

import { describe, expect, it } from 'vitest'
import type { RequirementsDocument } from '../../domain/requirements/document.ts'
import { type FoldResult, foldOps } from '../../domain/requirements/mutate.ts'
import type { DocumentOp } from '../../domain/requirements/ops.ts'
import { fixtureDoc, fixtureOps, HASH, hashOf, ID, ids } from '../../testing/waiver-fixture.ts'
import { allCodes, lookupCode } from '../runtime/catalog.ts'
import { FINDING_CLASS, findingClassOf, waivabilityOf } from '../runtime/signal-classes.ts'
import { currentManifest } from './index.ts'
import { MUTATE_OPTIONS } from './mutate-options.ts'

const TS = '2026-10-05T00:00:00.000Z'
const REFUSED = 'ERR_WAIVER_REFUSED'

const base = (): RequirementsDocument => fixtureDoc('base.json')

const fold = (doc: RequirementsDocument, ops: readonly DocumentOp[]): FoldResult =>
  foldOps(doc, ops, TS, MUTATE_OPTIONS)

/** The finding codes the catalog publishes (FND_* and GTWR_*); ERR_* are not finding codes. */
const FINDING_CODES = allCodes()
  .filter((c) => c.family !== 'ERR')
  .map((c) => c.code)

const NEVER_CODES = FINDING_CODES.filter((c) => waivabilityOf(c) === 'never')
const SCOPED_CODES = FINDING_CODES.filter((c) => waivabilityOf(c) === 'scoped')

const reason = 'reviewed for this release'

/** Every scope shape a `waive` op can carry, over base.json's requirements. */
const SHAPES: readonly { readonly name: string; readonly scope: Partial<DocumentOp> }[] = [
  { name: 'no scope', scope: {} },
  { name: 'ref', scope: { ref: 'LOG-R1' } },
  { name: 'ref by UUID', scope: { ref: ID['LOG-R1'] } },
  { name: 'refs', scope: { refs: ['LOG-R1'] } },
  { name: 'refs + matching hash', scope: { refs: ['LOG-R1'], contentHash: HASH['LOG-R1'] } },
  {
    name: 'pair refs + matching hash',
    scope: { refs: ['CAB-R1', 'CAB-R2'], contentHash: HASH['CAB-R1,CAB-R2'] },
  },
]

const waive = (code: string, scope: Partial<DocumentOp> = {}): DocumentOp =>
  ({ op: 'waive', code, reason, ...scope }) as DocumentOp

/** The one failed entry of an atomic fold, or undefined when it committed. */
const failure = (folded: FoldResult) => folded.results.find((r) => !r.ok)

/** Every `symspec <command>` a text names. */
const commandsNamed = (text: string): readonly string[] =>
  [...text.matchAll(/symspec\s+([a-z][a-z-]*)/g)].map((m) => m[1] ?? '')

const FORBIDDEN_REMEDIES = [/vocab\s+distinct/i, /propose-vocabulary/i, /--rescope-waivers/i]

describe('S3 write half: the fold refuses never-class and unscoped waivers', () => {
  it('[S3-001] measures every never class the catalog publishes: verdict, disclosure, triage, hygiene (and anchor once a code has it)', () => {
    // Anti-vacuity for the properties below: a classifier that called nothing `never`
    // would make every refusal loop pass on an empty list. No published code is `anchor`
    // on this build; the loops reach one the moment the catalog has it.
    const classes = new Set(NEVER_CODES.map((c) => findingClassOf(c)))
    const anchored = Object.values(FINDING_CLASS).some((row) => (row.class as string) === 'anchor')
    expect([...classes].sort()).toEqual(
      [...(anchored ? ['anchor'] : []), 'disclosure', 'hygiene', 'triage', 'verdict'].sort(),
    )
    expect(NEVER_CODES).toContain('FND_NUMERIC_UNCOMPARED')
    expect(NEVER_CODES).toContain('FND_RELATIONAL_UNCHECKED')
    expect(SCOPED_CODES.length).toBeGreaterThan(0)
  })

  it('[S3-001] every never-class code is refused ERR_WAIVER_REFUSED in every scope shape, and nothing is written', () => {
    const doc = base()
    const accepted: string[] = []
    for (const code of NEVER_CODES) {
      for (const { name, scope } of SHAPES) {
        const folded = fold(doc, [waive(code, scope)])
        const f = failure(folded)
        if (f?.code !== REFUSED || folded.write || folded.document !== doc) {
          accepted.push(`${code} (${name}): ${f?.code ?? 'accepted'}`)
        }
      }
    }
    expect(accepted, 'never-class waives the fold did not refuse').toEqual([])
  })

  it('[S3-001] the readings’ never streams are refused on their waive op: repro-scoped, repro-single-ref, never-verdict, never-hygiene', () => {
    const doc = base()
    const expected: Record<string, number> = {
      'repro-scoped': 0,
      'repro-single-ref': 0,
      'never-verdict': 2,
      'never-hygiene': 0,
    }
    for (const [name, index] of Object.entries(expected)) {
      const folded = fold(doc, fixtureOps(`cases/${name}.ops.jsonl`))
      expect({ name, abortedAt: folded.abortedAt, code: failure(folded)?.code }).toEqual({
        name,
        abortedAt: index,
        code: REFUSED,
      })
    }
  })

  it('[S3-002] a refused waive aborts the whole atomic stream: write false, the document returned is the input, untouched', () => {
    for (const name of [
      'repro-code-only',
      'never-verdict',
      'lint-code-only',
      'structural-cycle-code-only',
    ]) {
      const doc = base()
      const before = JSON.stringify(doc)
      const folded = fold(doc, fixtureOps(`cases/${name}.ops.jsonl`))
      expect(failure(folded)?.code, name).toBe(REFUSED)
      expect(folded.write, name).toBe(false)
      expect(folded.document, name).toBe(doc)
      expect(JSON.stringify(folded.document), name).toBe(before)
      // never-verdict's two GTWR_R7 waivers come BEFORE the refused op: none of them lands.
      expect(folded.document.waivers, name).toEqual([])
    }
  })

  it('[S3-003] a code-only waive is refused for every published code, scoped classes included', () => {
    const doc = base()
    const accepted = FINDING_CODES.filter(
      (code) => failure(fold(doc, [waive(code)]))?.code !== REFUSED,
    )
    expect(accepted, 'code-only waives the fold did not refuse').toEqual([])
    expect(FINDING_CODES.length).toBeGreaterThan(SCOPED_CODES.length)
  })

  it('[S3-004] a refs + matching contentHash waive of every scoped-class code is accepted and stored as requirementIds plus that hash', () => {
    const doc = base()
    for (const code of SCOPED_CODES) {
      const folded = fold(doc, [waive(code, { refs: ['LOG-R1'], contentHash: HASH['LOG-R1'] })])
      expect(failure(folded), code).toBeUndefined()
      expect(folded.document.waivers, code).toEqual([
        { code, requirementIds: ids('LOG-R1'), contentHash: HASH['LOG-R1'], reason },
      ])
    }
    // The fixture stream, as the readings state it (settled example 7).
    const scoped = fold(doc, fixtureOps('cases/lint-scoped.ops.jsonl'))
    expect(scoped.document.waivers.map(({ reason: _r, ...w }) => w)).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: ids('LOG-R1'),
        contentHash: HASH['LOG-R1'],
      },
    ])
    for (const name of ['blocking-lint-both', 'blocking-lint-one']) {
      expect(failure(fold(doc, fixtureOps(`cases/${name}.ops.jsonl`))), name).toBeUndefined()
    }
  })

  it('[S3-005] refs with no contentHash, or a single ref, is accepted for every scoped code: ref becomes refs [ref] and the fold computes the hash', () => {
    const doc = base()
    const wrong: string[] = []
    for (const code of SCOPED_CODES) {
      for (const scope of [{ refs: ['LOG-R1'] }, { ref: 'LOG-R1' }, { ref: ID['LOG-R1'] }]) {
        const folded = fold(doc, [waive(code, scope)])
        const stored = folded.document.waivers
        const want = [
          { code, requirementIds: ids('LOG-R1'), contentHash: hashOf(doc, 'LOG-R1'), reason },
        ]
        if (failure(folded) !== undefined || JSON.stringify(stored) !== JSON.stringify(want)) {
          wrong.push(`${code} ${JSON.stringify(scope)} stored ${JSON.stringify(stored)}`)
        }
      }
    }
    expect(wrong, 'waives not stored as refs [LOG-R1] + the computed hash').toEqual([])
  })

  it('[S3-005] the readings’ streams: lint-single-ref stores refs [LOG-R1] + sha256:fd8b2c50…, structural-cycle-scoped stores the computed cycle hash', () => {
    const single = fold(base(), fixtureOps('cases/lint-single-ref.ops.jsonl'))
    expect(failure(single)).toBeUndefined()
    expect(single.document.waivers.map(({ reason: _r, ...w }) => w)).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: ids('LOG-R1'),
        contentHash: HASH['LOG-R1'],
      },
    ])
    const cycle = fold(base(), fixtureOps('cases/structural-cycle-scoped.ops.jsonl'))
    expect(failure(cycle)).toBeUndefined()
    expect(cycle.document.waivers.map(({ reason: _r, ...w }) => w)).toEqual([
      {
        code: 'FND_CYCLE',
        requirementIds: ids('CYC-A', 'CYC-B'),
        contentHash: HASH['CYC-A,CYC-B'],
      },
    ])
  })

  it('[S3-006] no accepted waive ever stores requirementId, and every stored waiver carries a contentHash', () => {
    const doc = base()
    const bad: string[] = []
    for (const code of FINDING_CODES) {
      for (const { name, scope } of SHAPES) {
        for (const w of fold(doc, [waive(code, scope)]).document.waivers) {
          if (
            'requirementId' in w ||
            w.contentHash === undefined ||
            w.requirementIds === undefined
          ) {
            bad.push(`${code} (${name}): ${JSON.stringify(w)}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('[S3-007] lint-wrong-set (refs [LOG-R1, LOG-R2] + sha256:716cbd99…) is accepted at write and stored as written', () => {
    const folded = fold(base(), fixtureOps('cases/lint-wrong-set.ops.jsonl'))
    expect(failure(folded)).toBeUndefined()
    expect(folded.document.waivers.map(({ reason: _r, ...w }) => w)).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: ids('LOG-R1', 'LOG-R2'),
        contentHash: HASH['LOG-R1,LOG-R2'],
      },
    ])
  })

  it('[S3-008] lint-hash-mismatch: the waive whose contentHash differs from the current text is refused ERR_USAGE, not ERR_WAIVER_REFUSED, and nothing is written', () => {
    const doc = base()
    const folded = fold(doc, fixtureOps('cases/lint-hash-mismatch.ops.jsonl'))
    expect(folded.abortedAt).toBe(1)
    expect(failure(folded)?.code).toBe('ERR_USAGE')
    expect(failure(folded)?.error).toContain('changed since the finding was raised')
    expect(folded.write).toBe(false)
    expect(folded.document).toBe(doc)
  })

  it('[S3-009] a code with no own FINDING_CLASS row is refused ERR_WAIVER_REFUSED, even fully scoped', () => {
    const doc = base()
    const unknown = [
      'FND_NOT_A_CODE',
      'constructor',
      'toString',
      'hasOwnProperty',
      '__proto__',
      'GTWR_R99_NOT_A_RULE',
    ]
    const accepted = unknown.filter(
      (code) =>
        failure(fold(doc, [waive(code, { refs: ['LOG-R1'], contentHash: HASH['LOG-R1'] })]))
          ?.code !== REFUSED,
    )
    expect(accepted, 'unclassified codes the fold accepted').toEqual([])
  })

  it('[S3-009] every finding code the catalog publishes has its own FINDING_CLASS row (GTWR_* through the GTWR row)', () => {
    const missing = FINDING_CODES.filter((code) =>
      code.startsWith('GTWR_')
        ? !Object.hasOwn(FINDING_CLASS, 'GTWR')
        : !Object.hasOwn(FINDING_CLASS, code),
    )
    expect(missing).toEqual([])
    for (const name of ['constructor', 'toString', '__proto__']) {
      expect(waivabilityOf(name), name).toBeUndefined()
    }
  })

  it('[S3-010] every case or whitespace variant of every never code is refused at write', () => {
    const doc = base()
    const accepted: string[] = []
    for (const code of NEVER_CODES) {
      const variants = [
        ` ${code}`,
        `${code} `,
        `\t${code}\n`,
        code.toLowerCase(),
        code.charAt(0) + code.slice(1).toLowerCase(),
      ]
      for (const variant of variants) {
        const folded = fold(doc, [
          waive(variant, { refs: ['LOG-R1'], contentHash: HASH['LOG-R1'] }),
        ])
        if (failure(folded)?.code !== REFUSED) accepted.push(JSON.stringify(variant))
      }
    }
    expect(accepted, 'variants the fold accepted').toEqual([])
  })

  it('[S3-011] a never-code refusal names the code, its class and that it is never waivable', () => {
    const doc = base()
    for (const code of [
      'FND_CONTRADICTION',
      'FND_OPPOSITION_CANDIDATE',
      'FND_EXCLUDED_FROM_FORMAL',
    ]) {
      const f = failure(fold(doc, [waive(code, { refs: ['LOG-R1'] })]))
      expect(f?.code, code).toBe(REFUSED)
      expect(f?.error, code).toContain(code)
      expect(f?.error, code).toContain(String(findingClassOf(code)))
      expect(f?.error, code).toMatch(/never/)
    }
  })

  it('[S3-011] a code-only refusal says the waive must name the requirement ids (refs)', () => {
    const f = failure(fold(base(), [waive('GTWR_R5_INDEFINITE_ARTICLE')]))
    expect(f?.code).toBe(REFUSED)
    expect(`${f?.error} ${(f?.suggestions ?? []).join(' ')}`).toMatch(/refs/)
  })

  it('[S3-011] a refusal names only commands this build has, never vocab distinct or propose-vocabulary --rescope-waivers', () => {
    const doc = base()
    const commands = new Set(currentManifest().operations.map((o) => o.name))
    const texts: string[] = []
    for (const code of [...NEVER_CODES, 'GTWR_R5_INDEFINITE_ARTICLE', 'FND_NOT_A_CODE']) {
      for (const { scope } of SHAPES) {
        const f = failure(fold(doc, [waive(code, scope)]))
        if (f?.code === REFUSED) texts.push([f.error ?? '', ...(f.suggestions ?? [])].join('\n'))
      }
    }
    expect(texts.length, 'no refusal to read').toBeGreaterThan(NEVER_CODES.length)
    const all = texts.join('\n')
    for (const forbidden of FORBIDDEN_REMEDIES) expect(all).not.toMatch(forbidden)
    expect(commandsNamed(all).filter((c) => !commands.has(c))).toEqual([])
    // And the code itself is one `explain` can explain.
    expect(lookupCode(REFUSED)?.code).toBe(REFUSED)
  })

  it('[S3-040] no catalog row (explain, the manifest, AGENTS.md) of a never-class code advises a waiver', () => {
    const advising = allCodes()
      .filter((row) => waivabilityOf(row.code) === 'never')
      .filter((row) =>
        /waive/i.test([row.description, ...row.suggestions, ...row.commands].join('\n')),
      )
      .map((row) => row.code)
    expect(advising).toEqual([])
  })
})
