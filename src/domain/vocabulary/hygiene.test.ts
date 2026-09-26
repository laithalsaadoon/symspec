/**
 * ONE PHRASE, TWO GUARD KINDS (decision D10) — the admission is an exact partition equality.
 *
 * The propositional encoder reads an optional-feature precondition in the `guard` namespace, so
 * a feature and a state spelled alike in one system are ONE atom to every propositional tier,
 * while the vocabulary keeps them two symbols of two kinds. A validator that admits the
 * projection when it reads "the join of today's atoms and the declared classes" lets a
 * feature-only alias ride that edge: rewriting another requirement's feature onto the shared
 * spelling joins it to the STATE requirement, which nobody declared, and the check fabricates an
 * error-severity contradiction.
 *
 * So the document itself is refused: a phrase one system uses as two guard kinds is a hygiene
 * violation (V-KIND) naming the phrase and both requirements, reported the same way by the
 * implicit bootstrap, and no alias is admitted over it. The controls are the same documents with
 * the collision removed.
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { MUTATE_OPTIONS } from '../../app/operations/mutate-options.ts'
import { SolverService } from '../../ports/solver.ts'
import { buildDoc, lexicalEmbedder, orthogonalEmbedder } from '../../testing/gaming.ts'
import { toEngineDoc } from '../compat.ts'
import type { Embedder } from '../engine/formal/embed.ts'
import { runCheck } from '../engine/pipeline/check.ts'
import {
  DOC_VERSION_VOCAB,
  type RequirementsDocument,
  type Vocabulary,
} from '../requirements/document.ts'
import type { AddOp } from '../requirements/ops.ts'
import { buildProjection } from './build.ts'
import { implicitVocabulary } from './implicit.ts'
import { frozenTablesDigest, type VocabularyViolation, validateVocabulary } from './invariants.ts'
import { projectedDocument } from './projection.ts'

const add = (key: string, slots: Omit<AddOp, 'op' | 'key' | 'systemName'>): AddOp => ({
  op: 'add',
  key,
  systemName: 'logger',
  ...slots,
})

/** R1: the STATE "logging is enabled". Never rewritten, and in no declared merge. */
const R1 = add('R1', {
  patternType: 'state-driven',
  preCondition: 'logging is enabled',
  systemResponse: 'write the audit file',
})
/** R2: a FEATURE spelled apart, with the response R1 has, negated. */
const R2 = add('R2', {
  patternType: 'optional-feature',
  preCondition: 'verbose mode is enabled',
  systemResponse: 'write the audit file',
  negated: true,
})
/** R3: the FEATURE "logging is enabled", spelled exactly as R1's state. */
const R3 = add('R3', {
  patternType: 'optional-feature',
  preCondition: 'logging is enabled',
  systemResponse: 'flush the buffer',
})
/** R3 with its feature spelled apart from every state: the control. */
const R3_APART = add('R3', {
  patternType: 'optional-feature',
  preCondition: 'the logging feature is installed',
  systemResponse: 'flush the buffer',
})

const docOf = (...ops: readonly AddOp[]) => buildDoc(ops, MUTATE_OPTIONS)

const idOf = (doc: RequirementsDocument, key: string): string =>
  Object.values(doc.requirements).find((r) => r.key === key)?.id ?? key

/** The implicit vocabulary with its feature symbols replaced by one: the shared spelling, aliased. */
const featureAlias = (doc: RequirementsDocument): RequirementsDocument => {
  const implicit = implicitVocabulary(doc)
  const vocabulary: Vocabulary = {
    ...implicit,
    symbols: [
      ...implicit.symbols.filter((s) => s.kind !== 'feature'),
      {
        id: 'feat_logging_enabled',
        kind: 'feature',
        canonical: 'logging is enabled',
        aliases: ['verbose mode is enabled'],
      },
    ],
    frozenTables: { sha256: frozenTablesDigest(doc) },
  }
  return { ...doc, docVersion: DOC_VERSION_VOCAB, vocabulary }
}

const hygiene = (vs: readonly VocabularyViolation[]) =>
  vs.filter((v) => v.invariant === 'V-KIND' && v.requirements !== undefined)

describe('a phrase one system uses as a feature and as a state (D10)', () => {
  it('is a hygiene violation of the implicit bootstrap, naming the phrase and both requirements', () => {
    const doc = docOf(R1, R2, R3)
    const { violations } = validateVocabulary(doc, implicitVocabulary(doc), 'implicit')
    expect(
      hygiene(violations).map((v) => [v.dropped, v.phrase, v.requirements, v.symbols]),
    ).toEqual([
      [
        'nothing',
        'logging is enabled',
        [idOf(doc, 'R1'), idOf(doc, 'R3')].sort(),
        ['feat_logging_enabled', 'st_logging_enabled'],
      ],
    ])
    expect(hygiene(violations)[0]?.detail).toContain('R1')
    expect(hygiene(violations)[0]?.detail).toContain('R3')
    // Control: the feature spelled apart from the state is one atom per phrase, and clean.
    const apart = docOf(R1, R2, R3_APART)
    expect(validateVocabulary(apart, implicitVocabulary(apart), 'implicit').violations).toEqual([])
  })

  it('refuses the feature alias that rides the shared atom onto another requirement', () => {
    const declared = featureAlias(docOf(R1, R2, R3))
    const { admitted, violations } = validateVocabulary(declared)
    expect(hygiene(violations).map((v) => v.phrase)).toEqual(['logging is enabled'])
    expect(violations.filter((v) => v.dropped === 'alias').map((v) => v.phrase)).toEqual([
      'verbose mode is enabled',
    ])
    expect(admitted.symbols.find((s) => s.id === 'feat_logging_enabled')?.aliases).toEqual([])
    expect(buildProjection(declared)?.rewrites.size).toBe(0)
  })

  it('refuses the same alias without the third requirement, as an undeclared merge', () => {
    // No phrase is used two ways here, so nothing is hygiene; the alias itself joins R2's
    // feature to R1's state, which the declaration keeps apart.
    const declared = featureAlias(docOf(R1, R2))
    const { violations } = validateVocabulary(declared)
    expect(hygiene(violations)).toEqual([])
    expect(violations.map((v) => [v.invariant, v.dropped, v.phrase])).toEqual([
      ['V1', 'alias', 'verbose mode is enabled'],
    ])
  })

  it('admits a feature alias that joins only features, and rewrites with it', () => {
    // Control for the refusals above: with R3's feature spelled apart from R1's state, an alias
    // of R2's feature onto R3's is a declared join of two features and nothing else.
    const doc = docOf(R1, R2, R3_APART)
    const implicit = implicitVocabulary(doc)
    const declared: RequirementsDocument = {
      ...doc,
      docVersion: DOC_VERSION_VOCAB,
      vocabulary: {
        ...implicit,
        symbols: [
          ...implicit.symbols.filter((s) => s.kind !== 'feature'),
          {
            id: 'feat_logging_installed',
            kind: 'feature',
            canonical: 'the logging feature is installed',
            aliases: ['verbose mode is enabled'],
          },
        ],
        frozenTables: { sha256: frozenTablesDigest(doc) },
      },
    }
    expect(validateVocabulary(declared).violations).toEqual([])
    expect(buildProjection(declared)?.rewrites.size).toBe(1)
  })
})

describe('a feature alias spelled as a state (D10)', () => {
  const heater = (...ops: readonly AddOp[]): RequirementsDocument => {
    const doc = buildDoc(
      ops.map((o) => ({ ...o, systemName: 'hvac' })),
      MUTATE_OPTIONS,
    )
    const implicit = implicitVocabulary(doc)
    return {
      ...doc,
      docVersion: DOC_VERSION_VOCAB,
      vocabulary: {
        ...implicit,
        symbols: [
          ...implicit.symbols.filter((s) => s.kind !== 'feature' && s.kind !== 'state'),
          {
            id: 'feat_heater',
            kind: 'feature',
            canonical: 'the heater is installed',
            aliases: ['the heater is fitted'],
          },
          { id: 'st_fitted', kind: 'state', canonical: 'the heater is fitted', aliases: [] },
        ],
        frozenTables: { sha256: frozenTablesDigest(doc) },
      },
    }
  }
  const feature = add('F', {
    patternType: 'optional-feature',
    preCondition: 'the heater is fitted',
    systemResponse: 'heat the cabin',
  })
  const state = add('S', {
    patternType: 'state-driven',
    preCondition: 'the heater is fitted',
    systemResponse: 'log the mode',
  })

  it('is refused where one system uses the phrase as both, and the alias with it', () => {
    // Rewriting F's feature to its canonical would split it from S's state guard, the one atom
    // the encoder reads both as today, and a conflict between them would disappear.
    const doc = heater(feature, state)
    const { violations } = validateVocabulary(doc)
    expect(violations.map((v) => [v.invariant, v.dropped, v.phrase])).toEqual([
      ['V-KIND', 'nothing', 'the heater is fitted'],
      ['V-KIND', 'alias', 'the heater is fitted'],
    ])
    expect(violations[0]?.requirements).toEqual([idOf(doc, 'F'), idOf(doc, 'S')].sort())
    expect(buildProjection(doc)?.rewrites.size).toBe(0)
  })

  it('is admitted where no system uses it as both: the engine reads nothing as one atom', () => {
    // Controls: the vocabulary alone, and the feature alone, which the alias rewrites.
    expect(validateVocabulary(heater()).violations).toEqual([])
    const alone = heater(feature)
    expect(validateVocabulary(alone).violations).toEqual([])
    expect(buildProjection(alone)?.rewrites.size).toBe(1)
  })
})

/** Every two texts related: the other extreme from the orthogonal embedder. */
const constantEmbedder = (): Embedder => async (texts) =>
  texts.map(() => {
    const v = new Float32Array(4)
    v[0] = 1
    return v
  })

const verdictOf = async (doc: RequirementsDocument, embedder: Embedder) => {
  const r = await runCheck(toEngineDoc(doc), {
    strict: true,
    semantic: { embedder },
    temporal: { bound: 10 },
  })
  return {
    verified: r.verified,
    findings: r.findings.map((f) => `${f.severity} ${f.code} ${f.requirementIds.join(',')}`).sort(),
    demotions: r.coverage.demotions.map((d) => `${d.reason} ${d.requirementIds.join(',')}`).sort(),
  }
}

describe('the check a declared feature alias hands the engine (D10)', () => {
  it(
    'reports what the original reports: no fabricated contradiction through the shared atom',
    () =>
      Effect.runPromise(
        Effect.flatMap(SolverService, (solver) =>
          Effect.flatMap(solver.boot, () =>
            Effect.promise(async () => {
              const declared = featureAlias(docOf(R1, R2, R3))
              const projection = buildProjection(declared)
              if (projection === undefined) throw new Error('the vocabulary projected nothing')
              const projected = projectedDocument(declared, projection)
              for (const embedder of [orthogonalEmbedder, constantEmbedder, lexicalEmbedder]) {
                expect(await verdictOf(projected, embedder())).toEqual(
                  await verdictOf(declared, embedder()),
                )
              }
            }),
          ),
        ).pipe(Effect.provide(solverServiceLayer)),
      ),
    120_000,
  )
})
