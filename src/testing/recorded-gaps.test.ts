/**
 * RECORDED GAPS: residuals a verification round found and a bounded close-out round did not fix.
 * Each test builds the residual's document, runs `check`, and asserts the CURRENT WRONG outcome,
 * with a comment that names why it is wrong, who owns the fix, and what the right outcome is.
 *
 * These are not endorsements of the wrong outcome. They exist so the gap cannot close SILENTLY
 * (spec 007 invariant I-5, "a deletion is a finding"): the fix turns its test red, and whoever
 * lands it retires the test on purpose, replacing it with a guard for the right outcome. The
 * pattern is `fabrication.test.ts`'s "the recorded gap is still open".
 *
 * One `describe('recorded gaps: <group>')` block per group, each with its own helpers, so two
 * groups appending here do not edit the same lines.
 */

import { describe, expect, it } from 'vitest'
import { renderSentence } from '../domain/engine/core/render.ts'
import type { Requirement } from '../domain/engine/core/schema.ts'
import { parseLine } from '../domain/engine/parse/result.ts'
import { runCheck } from '../domain/engine/pipeline/check.ts'

describe('recorded gaps: lint', () => {
  const TS = '2026-01-01T00:00:00.000Z'
  const idOf = (i: number) => `0c0c0c0c-0000-4000-8000-${String(i + 1).padStart(12, '0')}`

  /** Check sentences as the CLI stores them (`apply` renders each from its parsed slots). */
  const checkRendered = async (sentences: readonly string[]) => {
    const requirements: Record<string, Requirement> = {}
    for (const [i, sentence] of sentences.entries()) {
      const parsed = await parseLine(sentence)
      if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
      const id = idOf(i)
      const r = {
        id,
        patternType: parsed.slots.patternType,
        systemName: parsed.slots.systemName,
        systemResponse: parsed.slots.systemResponse,
        ...(parsed.slots.trigger !== undefined ? { trigger: parsed.slots.trigger } : {}),
        ...(parsed.slots.preCondition !== undefined
          ? { preCondition: parsed.slots.preCondition }
          : {}),
        negated: parsed.negated,
        sentence,
        priority: 'medium',
        status: 'draft',
        createdAt: TS,
        updatedAt: TS,
        derives: [],
        satisfies: [],
        verifies: [],
        refines: [],
      } as unknown as Requirement
      r.sentence = renderSentence(r)
      requirements[id] = r
    }
    return runCheck({
      requirements,
      glossary: [],
      antonyms: [],
      waivers: [],
      terms: [],
      stateModel: { variables: [] },
    } as never)
  }

  /**
   * The numeric tier's quantity key deletes a digit separator INSIDE the quantity subject.
   *
   * `quantityKey` (formal/numeric.ts) maps the subject through `[^\p{L}\p{N}]+ -> _`, so
   * `zone 1,500 temperature` and `zone 1.500 temperature` (and `1_500` / `1.500`) share one
   * quantity key. The atom key keeps a `,`/`.` between digits inside its number since 5f4de78,
   * because under either decimal convention `1,500` and `1.500` are two numbers, so these name two
   * zones (two lines, two pipes). The LRA tier nevertheless compares their bounds and proves an
   * error-severity FND_NUMERIC_CONTRADICTION on a consistent document. The numeric tier reads every
   * requirement, including gate-excluded ones, so the R6 errors on these lines do not stop the proof.
   *
   * Not an English ambiguity: a separator is identity in one key and not in the other. OWNER: the
   * num group's quantityKey separator fix in this Phase 1 close-out (quantityKey is theirs, and
   * this group was told not to edit it); the durable home is spec 007 Story 4, AC-4-1's typed
   * `quantity` symbol and AC-4-2's atoms scoped by vocabulary id, where one quantity is one
   * declared id and not a string fold. RIGHT OUTCOME: no FND_NUMERIC_CONTRADICTION; the pair,
   * whose keys differ only in a digit separator, gets a propose-only demotion naming both (the
   * ce5fe2e FND_NUMBER_SPELLING_CANDIDATE pattern), so `verified` is false and nothing is proved.
   * When that fix lands, these go red: retire them and pin the demotion instead.
   */
  it.each([
    [
      'zone `1,500` / `1.500` temperature',
      'The heater shall hold zone 1,500 temperature below 20 °C.',
      'The heater shall hold zone 1.500 temperature above 30 °C.',
    ],
    [
      'the `1_500` / `1.500` m pipe temperature',
      'The heater shall hold the 1_500 m pipe temperature below 20 °C.',
      'The heater shall hold the 1.500 m pipe temperature above 30 °C.',
    ],
    [
      'line `1,500` / `1.500` pressure',
      'The plant shall hold line 1,500 pressure below 5 bar.',
      'The plant shall hold line 1.500 pressure above 6 bar.',
    ],
  ])('the recorded gap is still open: %s is proved on one quantity key', async (_, a, b) => {
    const report = await checkRendered([a, b])
    const proof = report.findings.find(
      (f) =>
        f.code === 'FND_NUMERIC_CONTRADICTION' &&
        [...f.requirementIds].sort().join() === [idOf(0), idOf(1)].sort().join(),
    )
    expect(proof?.severity, 'the recorded gap is still open').toBe('error')
  })
})
