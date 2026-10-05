/**
 * THE COMPAT BOUNDARY, tested field by field — because no differential can cover it.
 *
 * ## The coverage gap this file exists to close
 *
 * A differential comparison feeds ONE input to two implementations and diffs the
 * outputs. It is structurally blind to a bug in that shared input: both sides consume
 * the same projection, so both are wrong in the same way and agree perfectly. This
 * projection IS that shared input, which is why it needs direct assertions rather than
 * a comparison.
 *
 * Measured, not assumed: hardcoding `negated: false` here — dropping the single most
 * load-bearing field the boundary carries — left all 22 assertions of a
 * two-implementation comparison green, while a merely reworded finding message failed
 * it immediately. The reason the fixtures could not see it:
 *
 * - the 12 adversarial eval-round documents contain ZERO requirements with
 *   `negated: true` (they express opposition through antonym verb pairs like
 *   grant/revoke, which is a different mechanism);
 * - the two hex-bonk documents DO carry them (2 of 25 and 5 of 42), but flattening
 *   every flag to `false` produces a byte-identical 220-finding report on those
 *   particular documents — the negated requirements happen not to pair with a
 *   positive twin on the same atom.
 *
 * `negated` is exactly the field where that matters. It is what puts `shall X` and
 * `shall not X` on ONE atom at OPPOSITE polarity. Measured on a minimal pair:
 *
 *   negated=true  → FND_CONTRADICTION (+ GTWR_R16_NEGATION)
 *   negated=false → FND_EXACT_DUPLICATE, and FND_NO_PAIRS_CHECKED
 *
 * A proven conflict silently becoming a duplicate report is not a cosmetic drift —
 * it is the tool's core claim inverted.
 *
 * ## So this file tests the boundary DIRECTLY, on purpose-built inputs
 *
 * Every field the projection carries gets a case whose input makes that field
 * OBSERVABLE in the output. Where a field has no consumer in the G2a path
 * (`stateModel`, `responseKind`) the test asserts the honest thing instead: that its
 * presence or absence changes nothing, which is the checkable form of "no tier reads
 * it".
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../adapters/z3/solver-service.ts'
import * as s3Options from '../app/operations/mutate-options.ts'
import * as s3Catalog from '../app/runtime/catalog.ts'
import * as s3Classes from '../app/runtime/signal-classes.ts'
import { SolverService } from '../ports/solver.ts'
import * as s3 from '../testing/waiver-fixture.ts'
import { toEngineDoc, toEngineRequirement } from './compat.ts'
// The pipeline the projection FEEDS, so the observable consequences are the tier's own,
// not a re-derivation of what they ought to be.
import { runCheck } from './engine/pipeline/check.ts'
import { requirementsContentHash } from './requirements/content-hash.ts'
import type { Requirement, RequirementsDocument } from './requirements/document.ts'
import { emptyDocument } from './requirements/document.ts'
import { foldOps } from './requirements/mutate.ts'
import type { DocumentOp } from './requirements/ops.ts'
import { renderSentence } from './requirements/render.ts'

const TS = '2026-01-01T00:00:00.000Z'

/** A v3 requirement with its sentence RENDERED from its own slots, so `negated`
 * shows up in the text the lint tier reads as well as in the flag. */
const req = (partial: Partial<Requirement> & Pick<Requirement, 'id'>): Requirement => {
  const base: Requirement = {
    patternType: 'event-driven',
    trigger: 'the user signs in',
    systemName: 'auth service',
    systemResponse: 'issue a session token',
    negated: false,
    sentence: '',
    priority: 'medium',
    status: 'draft',
    derives: [],
    satisfies: [],
    verifies: [],
    refines: [],
    createdAt: TS,
    updatedAt: TS,
    ...partial,
  }
  return { ...base, sentence: renderSentence(base) }
}

const docOf = (...requirements: readonly Requirement[]): RequirementsDocument => ({
  ...emptyDocument(),
  requirements: Object.fromEntries(requirements.map((r) => [r.id, r])),
})

const A = 'aaaaaaaa-1111-4111-8111-111111111111'
const B = 'bbbbbbbb-2222-4222-8222-222222222222'

/**
 * Run the TRANSPLANTED pipeline over a v3 document through the projection.
 *
 * Deliberately calls v4 `runCheck` directly rather than the `check` operation:
 * this file is about the PROJECTION, and going through the op would add the option
 * translation and the envelope to every assertion for no gain.
 */
const check = (document: RequirementsDocument) =>
  Effect.runPromise(
    Effect.flatMap(SolverService, (solver) =>
      Effect.flatMap(solver.boot, () =>
        Effect.promise(() => runCheck(toEngineDoc(document), { strict: true })),
      ),
    ).pipe(Effect.provide(solverServiceLayer)),
  )

const codesOf = async (document: RequirementsDocument): Promise<ReadonlySet<string>> => {
  const report = await check(document)
  return new Set(report.findings.map((f) => f.code))
}

// ---------------------------------------------------------------------------
// `negated` — the field a whole-document comparison cannot see
// ---------------------------------------------------------------------------

describe('compat — the `negated` flag survives, and it is observable', () => {
  /**
   * THE GUARD. Two requirements, same trigger, same response text, opposite polarity:
   * a contradiction the tier can PROVE, and only if the flag arrives.
   *
   * If the projection drops `negated`, the two become identical and the tier reports
   * `FND_EXACT_DUPLICATE` instead — so this assertion distinguishes "the flag
   * arrived" from "the flag was silently flattened" by the CODE the tier emits, not
   * by inspecting the projection's output object (which would only prove the
   * projection agrees with itself).
   */
  it('shall X vs shall NOT X proves FND_CONTRADICTION, not FND_EXACT_DUPLICATE', async () => {
    const codes = await codesOf(docOf(req({ id: A }), req({ id: B, negated: true })))
    expect(codes.has('FND_CONTRADICTION')).toBe(true)
    // The distinguishing negative: a dropped flag makes the pair identical.
    expect(
      codes.has('FND_EXACT_DUPLICATE'),
      'the pair collapsed to a duplicate, so `negated` was lost in the projection',
    ).toBe(false)
  })

  it('two POSITIVE copies are an exact duplicate, which is the control', async () => {
    // The other half of the pair, so the test above cannot pass for the wrong reason
    // (e.g. FND_CONTRADICTION firing on any two same-trigger requirements).
    const codes = await codesOf(docOf(req({ id: A }), req({ id: B })))
    expect(codes.has('FND_EXACT_DUPLICATE')).toBe(true)
    expect(codes.has('FND_CONTRADICTION')).toBe(false)
  })

  it('carries the flag through the single-requirement projection too', () => {
    // The unit-level statement, so a failure localizes to the projection rather than
    // to a tier: the field is present and has the right value on both settings.
    expect(toEngineRequirement(req({ id: A, negated: true })).negated).toBe(true)
    expect(toEngineRequirement(req({ id: A, negated: false })).negated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The other fields the tier keys on
// ---------------------------------------------------------------------------

describe('compat — every projected field the tier reads', () => {
  it('preserves the rendered `sentence`, which the lint tier and the gate read', async () => {
    // `sentence` is what `checkGtWRules` lints and what the AC-3-7 gate partitions
    // on, so a lost sentence moves requirements between the included and excluded
    // sets. Observable via a GtWR code that can only come from the text.
    const codes = await codesOf(
      docOf(req({ id: A, systemResponse: 'issue a session token quickly' })),
    )
    // "quickly" is a vague term — a GtWR/ambiguity finding that exists only because
    // the sentence text arrived.
    expect([...codes].some((c) => c.startsWith('GTWR_') || c.startsWith('FND_AMBIGUOUS'))).toBe(
      true,
    )
  })

  it('preserves `trigger` and `preCondition`, which scope every atom', async () => {
    const projected = toEngineRequirement(
      req({
        id: A,
        patternType: 'state-driven',
        preCondition: 'maintenance mode is enabled',
        trigger: 'the user signs in',
      }),
    )
    expect(projected.preCondition).toBe('maintenance mode is enabled')
    expect(projected.trigger).toBe('the user signs in')

    // Observable: two requirements with the SAME response under DIFFERENT triggers
    // are not a conflict, because the atoms are scoped by trigger. If the trigger
    // were lost they would collapse.
    const codes = await codesOf(
      docOf(
        req({ id: A, trigger: 'the user signs in', systemResponse: 'grant access' }),
        req({ id: B, trigger: 'the user signs out', systemResponse: 'revoke access' }),
      ),
    )
    expect(codes.has('FND_CONTRADICTION')).toBe(false)
  })

  it('preserves the four side tables, so a committed antonym still decides', async () => {
    // The glossary/antonym/waiver tables are the DECIDE-tier inputs — the whole
    // propose/decide split rests on the tier consulting the COMMITTED tables. A lost
    // antonym table means an agent-confirmed opposition stops being provable.
    const withoutAntonym = docOf(
      req({ id: A, systemResponse: 'open the valve' }),
      req({ id: B, systemResponse: 'shut the valve' }),
    )
    const withAntonym: RequirementsDocument = {
      ...withoutAntonym,
      antonyms: [{ a: 'open', b: 'shut' }],
    }
    const before = await codesOf(withoutAntonym)
    const after = await codesOf(withAntonym)
    // The seed table may already know open/shut; the claim that matters is that the
    // committed table ARRIVES, which the unit assertion pins directly.
    expect(toEngineDoc(withAntonym).antonyms).toEqual([{ a: 'open', b: 'shut' }])
    // And that supplying it never LOSES a finding — the demotion-only direction.
    expect(after.has('FND_CONTRADICTION')).toBe(before.has('FND_CONTRADICTION') || true)
  })

  it('preserves the committed TERM table, whose loss would be silent', async () => {
    // The blindness this file's own header records: `toEngineDoc` hand-projects each field, so
    // forgetting one makes the feature permanently inert with NO test failure anywhere else —
    // the same shape as hardcoding `negated: false`, which left 22 differential assertions green.
    //
    // Asserted as a unit, on the projection itself, because that is the only place the drop is
    // observable. An end-to-end check would also pass with terms dropped, since the fixture
    // would simply fail to unify and report nothing.
    const doc: RequirementsDocument = {
      ...docOf(
        req({ id: A, systemResponse: 'issue a session token' }),
        req({ id: B, systemResponse: 'issue a login credential' }),
      ),
      terms: [{ canonical: 'session token', aliases: ['login credential'] }],
    }
    expect(toEngineDoc(doc).terms).toEqual([
      { canonical: 'session token', aliases: ['login credential'] },
    ])
    // The alias array is COPIED, not shared — a mutation inside the engine must not reach back
    // into the caller's document, the same reason the edge arrays are copied.
    expect(toEngineDoc(doc).terms?.[0]?.aliases).not.toBe(doc.terms[0]?.aliases)
  })

  it('[S3-021] preserves a committed scoped waiver, so a reviewed baseline stays suppressed', async () => {
    // Ruling R16 (S3-017) replaces the code-only waiver this test used: a stored code-only
    // waiver is inert, so the reviewed baseline is the exact set plus its content hash.
    const doc = docOf(req({ id: A }), req({ id: B }))
    const waived: RequirementsDocument = {
      ...doc,
      waivers: [
        {
          code: 'FND_EXACT_DUPLICATE',
          requirementIds: [A, B],
          contentHash: requirementsContentHash(doc, [A, B]) as string,
          reason: 'reviewed: intentional restatement',
        },
      ],
    }
    expect(toEngineDoc(waived).waivers).toEqual([
      {
        code: 'FND_EXACT_DUPLICATE',
        requirementIds: [A, B],
        reason: 'reviewed: intentional restatement',
        textBound: true,
      },
    ])
    const report = await check(waived)
    // The waiver bit: the finding is gone from `findings[]` AND counted, so a
    // suppressed baseline stays visible rather than looking like neglect.
    expect(report.findings.some((f) => f.code === 'FND_EXACT_DUPLICATE')).toBe(false)
    expect(report.waived).toBeGreaterThan(0)
  })

  it('[S3-018] [S3-020] keeps a one-requirement waiver only bound to its text, as the exact set [id]', () => {
    // Ruling R16 (S3-018) and R39 (S3-020) replace this test's old claim that a bare
    // `requirementId` crosses: with no hash it is inert, and with the matching hash it crosses
    // as the exact set of that one requirement, bound to the text. Never widened.
    const base = docOf(req({ id: A }))
    const scoped = (contentHash?: string): RequirementsDocument => ({
      ...base,
      waivers: [
        {
          code: 'GTWR_R5_INDEFINITE_ARTICLE',
          requirementId: A,
          ...(contentHash !== undefined ? { contentHash } : {}),
          reason: 'reviewed',
        },
      ],
    })
    expect(toEngineDoc(scoped()).waivers).toEqual([])
    expect(toEngineDoc(scoped(requirementsContentHash(base, [A]))).waivers).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: [A],
        reason: 'reviewed',
        textBound: true,
      },
    ])
  })

  it('[S3-019] carries an exact-set waiver while its reviewed text is unchanged, and drops it after', () => {
    // Ruling R3 (S3-016) and R16 (S3-019): the code here was FND_NUMERIC_UNCOMPARED, a
    // disclosure (never class) that no longer crosses at all, and an exact set with no hash is
    // inert; the binding is pinned on a scoped (wording) code instead.
    // The content hash is the half of a pair waiver's binding the tier cannot check: it never
    // sees the v3 fields. So the boundary drops a waiver whose requirements were edited, and the
    // finding it covered comes back for the new text to be reviewed.
    const doc = docOf(req({ id: A }), req({ id: B, systemResponse: 'revoke the session token' }))
    const bound = (document: RequirementsDocument, hash: string | undefined) => ({
      ...document,
      waivers: [
        {
          code: 'GTWR_R5_INDEFINITE_ARTICLE',
          requirementIds: [A, B],
          ...(hash !== undefined ? { contentHash: hash } : {}),
          reason: 'reviewed',
        },
      ],
    })
    const hash = requirementsContentHash(doc, [A, B])
    // `textBound` tells the tier the hash matched: the one binding an opposition candidate's
    // waiver needs before it discharges anything (check.ts `PAIR_BOUND_CODES`).
    expect(toEngineDoc(bound(doc, hash)).waivers).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: [A, B],
        reason: 'reviewed',
        textBound: true,
      },
    ])

    const edited = docOf(req({ id: A }), req({ id: B, systemResponse: 'extend the session token' }))
    expect(toEngineDoc(bound(edited, hash)).waivers).toEqual([])
    const deleted = docOf(req({ id: A }))
    expect(toEngineDoc(bound(deleted, hash)).waivers).toEqual([])
    // An exact-set waiver a hand-written document carries WITHOUT a hash is bound to no text, so
    // it does not cross either.
    expect(toEngineDoc(bound(edited, undefined)).waivers).toEqual([])
  })

  it('preserves edge arrays by VALUE, and does not share them with the v3 document', () => {
    const document = docOf(req({ id: A, derives: [B] }), req({ id: B }))
    const projected = toEngineDoc(document)
    expect(projected.requirements[A]?.derives).toEqual([B])
    // A SHARED array would let a future mutation inside the engine tier reach back into
    // the caller's v3 document — an aliasing bug in the most confusing possible place.
    expect(projected.requirements[A]?.derives).not.toBe(document.requirements[A]?.derives)
  })

  it('preserves ABSENCE as absence, not as an explicit undefined', () => {
    // `{trigger: undefined}` and `{}` behave the same for the tier's `!== undefined`
    // guards but serialize differently — so absence has to stay absence, or a projected
    // document differs from a hand-written one on a field neither actually set.
    const projected = toEngineRequirement(req({ id: A, patternType: 'ubiquitous' }))
    expect('preCondition' in projected).toBe(false)
    expect('key' in projected).toBe(false)
    expect('verificationMethod' in projected).toBe(false)
    expect('verificationNote' in projected).toBe(false)
  })

  it('preserves requirement ORDER, which drives the atom roster', () => {
    // Order feeds candidate-pair emission, so re-ordering changes `pairsChecked` and
    // the coverage report while leaving every finding intact — drift that reads as
    // noise in a diff.
    const document: RequirementsDocument = {
      ...emptyDocument(),
      requirements: {
        [B]: req({ id: B }),
        [A]: req({ id: A }),
      },
    }
    expect(Object.keys(toEngineDoc(document).requirements)).toEqual([B, A])
  })
})

// ---------------------------------------------------------------------------
// The two DROPS — asserted as no-ops rather than assumed
// ---------------------------------------------------------------------------

describe('compat — the two dropped v3 fields have no consumer in the G2a path', () => {
  /**
   * "Nothing reads `stateModel`" is the justification for dropping it. That is a
   * CLAIM about the tier, and the checkable form of it is: the tier's output is
   * identical with and without one. If a G4 tier ever starts reading it, this test
   * fails — which is the correct moment to notice, because that tier must take the
   * v3 document directly rather than come through this projection.
   */
  it('a populated stateModel changes NOTHING about the report', async () => {
    const base = docOf(req({ id: A }), req({ id: B, negated: true }))
    const withState: RequirementsDocument = {
      ...base,
      stateModel: {
        variables: [
          // `frame` is REQUIRED on the decoded type as of G4 (it carries a decoding
          // default, so a FILE may omit it — a hand-built value may not). Spelled
          // `volatile` here rather than `stable` because that is the schema's own
          // default and this fixture is meant to be an ordinary state model, not one
          // asserting a hypothesis.
          {
            name: 'session_authenticated',
            type: 'bool',
            frame: 'volatile',
            initial: 'session_authenticated = false',
          },
          { name: 'retry_count', type: 'int', frame: 'volatile', domain: { min: 0, max: 5 } },
          {
            name: 'run_state',
            type: 'enum',
            frame: 'volatile',
            domain: ['PENDING', 'RUNNING', 'DONE'],
          },
        ],
        initial: 'run_state = PENDING and retry_count = 0',
      },
    }
    const without = await check(base)
    const with_ = await check(withState)
    expect(JSON.stringify(with_.findings)).toBe(JSON.stringify(without.findings))
    expect(with_.verified).toBe(without.verified)
    expect(JSON.stringify(with_.coverage.demotions)).toBe(
      JSON.stringify(without.coverage.demotions),
    )
  })

  it('a populated responseKind changes NOTHING about the report', async () => {
    const base = docOf(req({ id: A }), req({ id: B, negated: true }))
    const classified = docOf(
      req({ id: A, responseKind: 'effect' }),
      req({ id: B, negated: true, responseKind: 'constraint' }),
    )
    const plain = await check(base)
    const tagged = await check(classified)
    expect(JSON.stringify(tagged.findings)).toBe(JSON.stringify(plain.findings))
    expect(tagged.verified).toBe(plain.verified)
  })

  it('the schemaVersion placeholder is 2 and is never read', () => {
    // Stated as a test so the placeholder cannot be "fixed" to 3 by someone who reads
    // it as a claim about the document. It is there because v4 TYPE requires
    // the field; no tier branches on it.
    expect(toEngineDoc(emptyDocument()).schemaVersion).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// S3 Waivability (AC-5-6): the check-time twin at the ONE boundary crossing
// ---------------------------------------------------------------------------

describe('S3: toEngineDoc forwards no stored waiver the S3 fold would refuse as an op', () => {
  // A test may wire every ring: the classifier and the fold's options are the app's.
  const base = () => s3.fixtureDoc('base.json')
  const forwarded = (doc: RequirementsDocument, w: Readonly<Record<string, unknown>>) =>
    toEngineDoc(s3.withRawWaivers(doc, [w])).waivers?.length ?? 0
  const FINDING_CODES = s3Catalog
    .allCodes()
    .filter((c) => c.family !== 'ERR')
    .map((c) => c.code)
  const NEVER = FINDING_CODES.filter((c) => s3Classes.waivabilityOf(c) === 'never')
  const SCOPED = FINDING_CODES.filter((c) => s3Classes.waivabilityOf(c) === 'scoped')
  const { ID, HASH } = s3
  /** Every stored scope shape, over base.json's text. */
  const STORED_SHAPES: readonly { readonly name: string; readonly scope: object }[] = [
    { name: 'code-only', scope: {} },
    { name: 'requirementId', scope: { requirementId: ID['ORD-R1'] } },
    { name: 'requirementIds, no hash', scope: { requirementIds: [ID['ORD-R1']] } },
    {
      name: 'requirementIds + matching hash',
      scope: { requirementIds: [ID['ORD-R1']], contentHash: HASH['ORD-R1'] },
    },
    {
      name: 'pair requirementIds + matching hash',
      scope: {
        requirementIds: [ID['CAB-R1'], ID['CAB-R2']],
        contentHash: HASH['CAB-R1,CAB-R2'],
      },
    },
    {
      name: 'requirementId + matching hash',
      scope: { requirementId: ID['ORD-R1'], contentHash: HASH['ORD-R1'] },
    },
  ]

  it('[S3-016] [S3-030] a stored never-class waiver never reaches the engine, in any stored scope shape, hash or not', () => {
    const doc = base()
    const crossed: string[] = []
    for (const code of NEVER) {
      for (const { name, scope } of STORED_SHAPES) {
        if (forwarded(doc, { code, reason: 'hand-edited', ...scope }) > 0)
          crossed.push(`${code} (${name})`)
      }
    }
    expect(NEVER.length).toBeGreaterThan(10)
    expect(crossed, 'never-class waivers compat forwarded').toEqual([])
  })

  it('[S3-017] [S3-030] a stored code-only waiver of every code, an unknown code included, never reaches the engine', () => {
    const doc = base()
    const crossed = [...FINDING_CODES, 'FND_NOT_A_CODE'].filter(
      (code) => forwarded(doc, { code, reason: 'hand-edited' }) > 0,
    )
    expect(crossed).toEqual([])
  })

  it('[S3-018] [S3-019] [S3-030] a stored single requirementId with no hash, or requirementIds with no hash, never reaches the engine, for every scoped code', () => {
    const doc = base()
    const crossed: string[] = []
    for (const code of SCOPED) {
      for (const scope of [{ requirementId: ID['LOG-R1'] }, { requirementIds: [ID['LOG-R1']] }]) {
        if (forwarded(doc, { code, reason: 'hand-edited', ...scope }) > 0)
          crossed.push(`${code} ${JSON.stringify(scope)}`)
      }
    }
    expect(crossed).toEqual([])
  })

  it('[S3-009] [S3-010] [S3-030] a stored waiver of an unclassified code, or a case or whitespace variant of a never code, never reaches the engine, even scoped and hash-bound', () => {
    const doc = base()
    const scope = { requirementIds: [ID['ORD-R1']], contentHash: HASH['ORD-R1'] }
    const codes = [
      'FND_NOT_A_CODE',
      'constructor',
      'toString',
      'GTWR_R99_NOT_A_RULE',
      ...NEVER.flatMap((c) => [` ${c}`, `${c} `, c.toLowerCase()]),
    ]
    const crossed = codes.filter(
      (code) => forwarded(doc, { code, reason: 'hand-edited', ...scope }) > 0,
    )
    expect(crossed.map((c) => JSON.stringify(c))).toEqual([])
  })

  it('[S3-020] [S3-021] a stored scoped-class waiver with refs (or one requirementId) and the matching hash reaches the engine, as an exact set bound to the text', () => {
    const doc = base()
    for (const code of SCOPED) {
      for (const scope of [
        { requirementIds: [ID['LOG-R1']], contentHash: HASH['LOG-R1'] },
        { requirementId: ID['LOG-R1'], contentHash: HASH['LOG-R1'] },
      ]) {
        const waivers = toEngineDoc(
          s3.withRawWaivers(doc, [{ code, reason: 'r', ...scope }]),
        ).waivers
        expect(waivers, `${code} ${JSON.stringify(scope)}`).toEqual([
          expect.objectContaining({ code, requirementIds: [ID['LOG-R1']], textBound: true }),
        ])
      }
    }
  })

  it('[S3-030] the check-time twin: every stored waiver compat forwards is one the S3 fold accepts as the same op on the same document', () => {
    // Stored shape -> the op an agent would have typed for it.
    const doc = base()
    const asOp = (w: Readonly<Record<string, unknown>>): DocumentOp => {
      const ids =
        (w.requirementIds as string[] | undefined) ??
        (w.requirementId !== undefined ? [w.requirementId as string] : undefined)
      return {
        op: 'waive',
        code: w.code as string,
        reason: 'r',
        ...(ids !== undefined ? { refs: ids } : {}),
        ...(w.contentHash !== undefined ? { contentHash: w.contentHash as string } : {}),
      } as DocumentOp
    }
    const disagreements: string[] = []
    let reached = 0
    for (const code of [...FINDING_CODES, 'FND_NOT_A_CODE']) {
      for (const { name, scope } of STORED_SHAPES) {
        const w = { code, reason: 'r', ...scope }
        if (forwarded(doc, w) === 0) continue
        reached += 1
        const folded = foldOps(doc, [asOp(w)], '2026-10-05T00:00:00.000Z', s3Options.MUTATE_OPTIONS)
        if (folded.abortedAt !== undefined) disagreements.push(`${code} (${name})`)
      }
    }
    expect(disagreements, 'forwarded at check, refused at write').toEqual([])
    // Not vacuous: the scoped codes' hash-bound shapes do cross.
    expect(reached).toBeGreaterThanOrEqual(SCOPED.length * 2)
    // And the shapes the fold refuses are the ones that do not.
    expect(forwarded(doc, { code: 'FND_CONTRADICTION', reason: 'r' })).toBe(0)
  })
})
