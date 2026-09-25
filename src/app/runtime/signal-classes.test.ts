/**
 * The signal classes — what every finding code and demotion reason MEANS, as data.
 *
 * Three claims, each with its own assertion:
 *
 * 1. **Exhaustive.** Every finding code the catalog publishes has a class, and nothing else
 *    does. The `satisfies` bounds make a missing row a `tsc` error; this is the runtime half,
 *    against the catalog an agent actually reads.
 * 2. **Membership is pinned.** A loop over the table catches a row that misbehaves and never
 *    one that moved, so each class's members are written out here, and a re-classification is
 *    a visible edit to this file rather than a one-word change in a table.
 * 3. **Waivability is derived, not stated.** `wording` and `structural` are `scoped`; every
 *    other class is `never` (decision D1 settles disclosures as `never`). The waiver-scope test
 *    reads each GTWR code through the same lookup the fold will use.
 */

import { describe, expect, it } from 'vitest'
import { GTWR_CODES } from '../../domain/engine/lint/codes.ts'
import { allCodes } from './catalog.ts'
import {
  DEMOTION_CLASS,
  DEMOTION_CLASSES,
  dCovers,
  FINDING_CLASS,
  FINDING_CLASSES,
  findingClassOf,
  VERDICT_BEARING,
  verdictBearingOf,
  WAIVABILITY,
  waivabilityOf,
} from './signal-classes.ts'

const fndCodes = (): readonly string[] =>
  allCodes()
    .filter((c) => c.family === 'FND')
    .map((c) => c.code)

/** Every key of FINDING_CLASS in one class, sorted. */
const membersOf = (cls: string): readonly string[] =>
  Object.entries(FINDING_CLASS)
    .filter(([, row]) => row.class === cls)
    .map(([code]) => code)
    .sort()

describe('FINDING_CLASS', () => {
  it('classes every FND code the catalog publishes, plus the GTWR family, and nothing else', () => {
    expect(Object.keys(FINDING_CLASS).sort()).toEqual([...fndCodes(), 'GTWR'].sort())
  })

  it('gives every row a published class and a reason written by meaning', () => {
    for (const [code, row] of Object.entries(FINDING_CLASS)) {
      expect(FINDING_CLASSES, code).toContain(row.class)
      expect(
        row.why.length,
        `${code}: a class with no reason is a tier in disguise`,
      ).toBeGreaterThan(30)
    }
  })

  it('pins each class`s membership, one code at a time', () => {
    expect(membersOf('verdict')).toEqual([
      'FND_CERTIFICATE_DISAGREES',
      'FND_CONTRADICTION',
      'FND_NUMERIC_CONTRADICTION',
      'FND_RANGE_VIOLATION',
      'FND_REACHABILITY_VACUOUS_INITIAL',
      'FND_REACHABILITY_VIOLATED',
      'FND_REDUNDANCY',
      'FND_SUBSUMPTION',
      'FND_TEMPORAL_CONTRADICTION',
      'FND_VACUITY',
    ])
    expect(membersOf('disclosure')).toEqual([
      'FND_CERTIFIED',
      'FND_CERTIFY_FAILED',
      'FND_INCOMPLETE',
      'FND_NEEDS_REVIEW',
      'FND_NO_PAIRS_CHECKED',
      'FND_NUMERIC_UNCOMPARED',
      'FND_REACHABILITY_NOT_CHECKED',
      'FND_REACHABILITY_PROVED',
      'FND_REACHABILITY_UNDER_HYPOTHESES',
      'FND_REACHABILITY_UNKNOWN',
      'FND_RELATIONAL_UNCHECKED',
    ])
    expect(membersOf('triage')).toEqual([
      'FND_DUPLICATE_CLUSTER',
      'FND_NUMBER_SPELLING_CANDIDATE',
      'FND_OPPOSITION_CANDIDATE',
      'FND_QUANTITY_ALIAS_CANDIDATE',
      'FND_SIMILAR_SEMANTIC',
      'FND_SIMILAR_UNUNIFIED',
    ])
    expect(membersOf('hygiene')).toEqual([
      'FND_EXCLUDED_FROM_FORMAL',
      'FND_MISSING_PRECONDITION',
      'FND_MISSING_TRIGGER',
    ])
    expect(membersOf('wording')).toEqual([
      'FND_ACRONYM_UNDEFINED',
      'FND_AMBIGUITY_NEEDS_JUDGMENT',
      'FND_AMBIGUOUS_QUANTIFIER',
      'FND_AMBIGUOUS_REFERENCE',
      'FND_AMBIGUOUS_VAGUE',
      'FND_EXACT_DUPLICATE',
      'FND_TERM_INCONSISTENT',
      'GTWR',
    ])
    expect(membersOf('structural')).toEqual([
      'FND_CYCLE',
      'FND_DANGLING_REFERENCE',
      'FND_LEAF_UNVERIFIABLE',
      'FND_MISSING_TRACE_LINK',
      'FND_ORPHAN',
    ])
    // No code is filed under the anchor class yet: its members (FND_INTENT_CHANGED,
    // FND_SEMANTIC_DRIFT, …) are appended by the slices that ship them.
    expect(membersOf('anchor')).toEqual([])
    // And the pins above are the whole table, so a new class cannot hide a code.
    const pinned = FINDING_CLASSES.flatMap((c) => membersOf(c))
    expect(pinned.length).toBe(Object.keys(FINDING_CLASS).length)
  })
})

describe('WAIVABILITY — the waiver scope', () => {
  it('is derived from the class: wording and structural are scoped, every other class never', () => {
    expect(WAIVABILITY).toEqual({
      verdict: 'never',
      disclosure: 'never',
      triage: 'never',
      hygiene: 'never',
      wording: 'scoped',
      structural: 'scoped',
      anchor: 'never',
    })
  })

  it('lets every GTWR lint rule be waived, scoped, through the code lookup', () => {
    expect(GTWR_CODES.length).toBeGreaterThan(0)
    for (const code of GTWR_CODES) {
      expect(findingClassOf(code), code).toBe('wording')
      expect(waivabilityOf(code), code).toBe('scoped')
    }
  })

  it('refuses a waiver for every verdict, disclosure (D1), triage and hygiene code', () => {
    for (const code of [
      'FND_CONTRADICTION',
      'FND_REACHABILITY_VIOLATED',
      'FND_NUMERIC_UNCOMPARED',
      'FND_RELATIONAL_UNCHECKED',
      'FND_OPPOSITION_CANDIDATE',
      'FND_EXCLUDED_FROM_FORMAL',
    ]) {
      expect(waivabilityOf(code), code).toBe('never')
    }
  })

  it('has no class for a code nobody publishes', () => {
    expect(findingClassOf('FND_NOT_A_CODE')).toBeUndefined()
    expect(waivabilityOf('FND_NOT_A_CODE')).toBeUndefined()
  })

  it('is what the catalog publishes on every finding row, and absent on ERR rows', () => {
    for (const row of allCodes()) {
      if (row.family === 'ERR') {
        expect(row.class, row.code).toBeNull()
        expect(row.waivable, row.code).toBeNull()
        continue
      }
      expect(row.class, row.code).toBe(findingClassOf(row.code))
      expect(row.waivable, row.code).toBe(waivabilityOf(row.code))
    }
  })
})

describe('DEMOTION_CLASS', () => {
  it('pins every demotion reason with its class', () => {
    expect(
      Object.fromEntries(
        Object.entries(DEMOTION_CLASS).map(([reason, row]) => [reason, row.class]),
      ),
    ).toEqual({
      'uncovered-requirement': 'coverage',
      'open-opposition-candidate': 'conflict-signal',
      'no-decide-tier-comparison': 'coverage',
      'semantic-tier-skipped': 'disclosure',
      'excluded-from-formal': 'coverage',
      'quantity-alias-candidate': 'conflict-signal',
      'relational-reasoning-not-attempted': 'disclosure',
      'numeric-bounds-uncompared': 'disclosure',
      'solver-budget-exhausted': 'disclosure',
      'inconclusive-group': 'coverage',
      'solver-unknown': 'disclosure',
      'conditional-conflict-unchecked': 'conflict-signal',
      'run-weakened': 'run',
      'opposite-polarity-near-duplicate': 'conflict-signal',
      'number-spelling-candidate': 'triage',
      'contrary-glossary-alias': 'hygiene',
      'reachability-not-checked': 'disclosure',
      'reachability-frame-relied-upon': 'disclosure',
      'reachability-budget-exhausted': 'disclosure',
      'reachability-undecidable': 'disclosure',
      'reachability-vacuous-initial-state': 'disclosure',
      'reachability-certificate-disagrees': 'disclosure',
      'reachability-frame-undeclared': 'disclosure',
      'reachability-cross-check-incomplete': 'disclosure',
    })
  })

  it('marks drift on exactly the conflict-signal reasons, and gives every row a reason', () => {
    const drifting = Object.entries(DEMOTION_CLASS)
      .filter(([, row]) => row.drift)
      .map(([reason]) => reason)
      .sort()
    const conflictSignals = Object.entries(DEMOTION_CLASS)
      .filter(([, row]) => row.class === 'conflict-signal')
      .map(([reason]) => reason)
      .sort()
    expect(drifting).toEqual(conflictSignals)
    expect(drifting).toEqual([
      'conditional-conflict-unchecked',
      'open-opposition-candidate',
      'opposite-polarity-near-duplicate',
      'quantity-alias-candidate',
    ])
    for (const [reason, row] of Object.entries(DEMOTION_CLASS)) {
      expect(DEMOTION_CLASSES, reason).toContain(row.class)
      expect(row.why.length, reason).toBeGreaterThan(30)
    }
  })
})

describe('D, the verdict-bearing set', () => {
  it('is error findings of class verdict or structural, and conflict-signal or triage demotions', () => {
    expect(VERDICT_BEARING).toEqual({
      findingSeverity: 'error',
      findingClasses: ['verdict', 'structural'],
      demotionClasses: ['conflict-signal', 'triage'],
    })
  })

  it('projects a report onto exactly its D members', () => {
    const d = verdictBearingOf({
      findings: [
        { code: 'FND_CONTRADICTION', severity: 'error', requirementIds: ['b', 'a'] },
        // A verdict code below error severity is not a verdict the exit code rests on.
        { code: 'FND_SUBSUMPTION', severity: 'warn', requirementIds: ['a', 'b'] },
        { code: 'FND_CYCLE', severity: 'error', requirementIds: ['c'] },
        // Error severity, but wording: not verdict-bearing.
        { code: 'FND_EXACT_DUPLICATE', severity: 'error', requirementIds: ['a', 'b'] },
        { code: 'GTWR_R7_VAGUE', severity: 'error', requirementIds: ['a'] },
        { code: 'FND_OPPOSITION_CANDIDATE', severity: 'info', requirementIds: ['a', 'b'] },
      ],
      coverage: {
        demotions: [
          { reason: 'open-opposition-candidate', requirementIds: ['a', 'b'] },
          { reason: 'number-spelling-candidate', requirementIds: ['a', 'c'] },
          { reason: 'uncovered-requirement', requirementIds: ['d'] },
          { reason: 'run-weakened', requirementIds: [] },
        ],
      },
    })
    expect(d).toEqual([
      { kind: 'finding', name: 'FND_CONTRADICTION', class: 'verdict', requirementIds: ['a', 'b'] },
      { kind: 'finding', name: 'FND_CYCLE', class: 'structural', requirementIds: ['c'] },
      {
        kind: 'demotion',
        name: 'open-opposition-candidate',
        class: 'conflict-signal',
        requirementIds: ['a', 'b'],
      },
      {
        kind: 'demotion',
        name: 'number-spelling-candidate',
        class: 'triage',
        requirementIds: ['a', 'c'],
      },
    ])
  })

  it('counts a conflict signal upgraded to a verdict over the same requirements as kept', () => {
    const signal = {
      kind: 'demotion',
      name: 'open-opposition-candidate',
      class: 'conflict-signal',
      requirementIds: ['a', 'b'],
    } as const
    const verdict = (ids: readonly string[]) =>
      ({
        kind: 'finding',
        name: 'FND_CONTRADICTION',
        class: 'verdict',
        requirementIds: ids,
      }) as const
    expect(dCovers(signal, [signal])).toBe(true)
    expect(dCovers(signal, [verdict(['a', 'b'])])).toBe(true)
    // A core that also names a bridge requirement still covers the pair.
    expect(dCovers(signal, [verdict(['a', 'b', 'c'])])).toBe(true)
    // A verdict over a different pair does not.
    expect(dCovers(signal, [verdict(['a', 'c'])])).toBe(false)
    expect(dCovers(signal, [])).toBe(false)
    // Only a conflict signal upgrades: a triage demotion is kept only by itself.
    const triage = { ...signal, name: 'number-spelling-candidate', class: 'triage' } as const
    expect(dCovers(triage, [verdict(['a', 'b'])])).toBe(false)
    // And a verdict is kept only by the same verdict over the same requirements.
    expect(dCovers(verdict(['a', 'b']), [verdict(['a', 'b'])])).toBe(true)
    expect(dCovers(verdict(['a', 'b']), [verdict(['a', 'b', 'c'])])).toBe(false)
  })
})
