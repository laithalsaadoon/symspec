/**
 * Committed vocabulary is a STRENGTHENING move (spec 007 I-1): a term, a glossary alias or an
 * antonym may add findings and demotions, never remove one the same words earn without it.
 *
 * The route pinned here was measured on the built CLI: the opposition-candidate tier read the
 * RAW response text, so a term or alias that lines two objects up hid a same-class pair from it,
 * and `verified: true` came back over a pair the same words without the term demote on. Every
 * case runs the sentence through the real parser and the real pipeline.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import type { Embedder } from './embed.ts'

const TS = '2026-01-01T00:00:00.000Z'

/** Parse each sentence through the real ladder and build an engine document from the slots. */
const docOf = async (sentences: readonly string[]) => {
  const requirements: Record<string, unknown> = {}
  for (const [i, sentence] of sentences.entries()) {
    const parsed = await parseLine(sentence)
    if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
    const id = `0a0a0a0a-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
    requirements[id] = {
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
    }
  }
  return {
    requirements,
    glossary: [],
    antonyms: [],
    waivers: [],
    terms: [],
    stateModel: { variables: [] },
  } as never
}

describe('I-1 — committed vocabulary never lifts what the raw wording already earns', () => {
  // A committed term or glossary alias is a strengthening move: it may only add findings and
  // demotions. The candidate tier is what keeps a same-class, undecided pair from certifying, and
  // it used to read the RAW response text: once a term ("access" ≡ "entry") or an alias is what
  // lines the two objects up, the raw remainders differ by more than a preposition, the pair was
  // never proposed, and `verified: true` came back over a conflict the same words without the
  // term demote on.
  const BUTTON = 'When the operator presses the button, the controller shall'
  const orthogonal: Embedder = async (texts) =>
    texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1]))
  type Entries = readonly { readonly canonical: string; readonly aliases: readonly string[] }[]
  type Vocabulary = { readonly glossary?: Entries; readonly terms?: Entries }
  const checkOf = async (sentences: readonly string[], vocabulary: Vocabulary) => {
    const doc = (await docOf(sentences)) as unknown as Record<string, unknown>
    Object.assign(doc, vocabulary)
    return runCheck(doc as never, { semantic: { embedder: orthogonal } })
  }
  const ACCESS = { terms: [{ canonical: 'access', aliases: ['entry'] }] }
  for (const [x, y, vocabulary] of [
    ['grant access to the user', 'revoke entry from the user', ACCESS],
    ['grant access to the portal', 'forbid entry to the portal', ACCESS],
    ['grant access', 'not allow entry', ACCESS],
    ['permit entry to the portal', 'revoke access to the portal', ACCESS],
    [
      'show the report to the user',
      'hide the summary from the user',
      { terms: [{ canonical: 'report', aliases: ['summary'] }] },
    ],
    [
      'approve the bill',
      'decline the invoice',
      { terms: [{ canonical: 'invoice', aliases: ['bill'] }] },
    ],
    [
      'give access to the user',
      'revoke access from the user',
      {
        glossary: [{ canonical: 'grant access to the user', aliases: ['give access to the user'] }],
      },
    ],
  ] as const) {
    it(`${x} / ${y} through ${JSON.stringify(vocabulary)} still demotes`, async () => {
      const report = await checkOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`], vocabulary)
      expect(report.findings.map((f) => f.code)).toContain('FND_OPPOSITION_CANDIDATE')
      expect(report.verified).toBe(false)
    })
  }

  it('a term that makes two responses ONE atom is compared by the solver, not proposed', async () => {
    const report = await checkOf([`${BUTTON} grant access.`, `${BUTTON} not grant entry.`], ACCESS)
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
    expect(report.findings.map((f) => f.code)).not.toContain('FND_OPPOSITION_CANDIDATE')
  })
})
