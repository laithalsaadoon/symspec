/**
 * THE PARSE CORPUS SNAPSHOT — the blast radius of any change to the parse ladder.
 *
 * ## Why this file exists
 *
 * `parse` turns a sentence into the slots every later tier keys on: `systemName` decides which
 * requirements pair at all, `negated` decides their polarity, and a dropped clause makes a
 * requirement stronger than the one written. A parse fix that repairs one sentence and quietly
 * re-parses an ordinary one differently can lose a real conflict or manufacture a false one, and
 * no per-case assertion sees it, because nobody writes an assertion for the sentence they did not
 * think of.
 *
 * So this file renders the parse of a large, fixed corpus and pins it byte for byte. The rule it
 * enforces is the one parse fixes are held to: output is IDENTICAL on every input except the
 * class the fix targets, and the diff of this snapshot is the evidence. A reviewer reads the
 * changed rows and checks that each one belongs to the targeted class.
 *
 * ## The corpus
 *
 * - `__fixtures__/parse-corpus.txt`: requirement-shaped strings mined from the repo's tests,
 *   fixtures, README and specs, the adversarial inputs recorded against earlier parse fixes, and
 *   hand-written probes around each targeted class (the marker words used as clauses AND as
 *   ordinary words, negation governing the modal AND sitting elsewhere in the response);
 * - the rendered `sentence` of every requirement in the three document corpora that
 *   `./atom-corpus.test.ts` also reads.
 *
 * ## What a row carries
 *
 * Everything `parseLine` decides except the per-code suggestion boilerplate and `proposedOp`,
 * which is a pure projection of `slots` + `negated`: outcome, tier, pattern, every slot,
 * `negated`, confidence, notes, and for an error its code, message, partial and proposed ops.
 *
 * The real wink analyzer runs (no fake), because a fake would pin the fake's tagging instead of
 * the parse the tool ships.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type ParseResult, parseLine } from '../domain/engine/parse/result.ts'
import { evalRoundCases } from './eval-rounds.ts'
import { fabricationCases } from './fabrication.ts'
import { generateCases } from './generate.ts'

/** The generated ladder's four tiers at the pinned seed — the same slice the atom corpus reads. */
const LADDER_TIERS = [1, 2, 3, 4] as const
const LADDER_SEED = 0

const sentencesOf = (requirements: Readonly<Record<string, unknown>>): string[] =>
  Object.values(requirements).flatMap((r) => {
    const s = (r as { readonly sentence?: unknown }).sentence
    return typeof s === 'string' && s.trim() !== '' ? [s] : []
  })

const corpus = (): readonly string[] => {
  const lines = readFileSync(new URL('./__fixtures__/parse-corpus.txt', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
  const docs: string[] = []
  for (const c of evalRoundCases()) docs.push(...sentencesOf(c.doc.requirements))
  for (const tier of LADDER_TIERS) {
    for (const c of generateCases(tier, LADDER_SEED)) docs.push(...sentencesOf(c.doc.requirements))
  }
  for (const c of fabricationCases()) {
    docs.push(...sentencesOf(c.doc.requirements as Readonly<Record<string, unknown>>))
  }
  return [...new Set([...lines, ...docs])].sort()
}

/** One parse, minus the fields that are pure functions of the fields kept. */
const rowOf = (r: ParseResult): unknown => {
  if (r.outcome === 'ok') {
    const { proposedOp: _derived, ...kept } = r
    return kept
  }
  if (r.outcome === 'error') {
    const { suggestions: _boilerplate, ...kept } = r
    return kept
  }
  return r
}

const render = async (): Promise<string> => {
  const rows: string[] = []
  for (const line of corpus()) {
    rows.push(`${JSON.stringify(line)}\t${JSON.stringify(rowOf(await parseLine(line)))}`)
  }
  return `${rows.join('\n')}\n`
}

describe('the parse corpus', () => {
  it('renders the parse of every corpus sentence, byte-stable', async () => {
    await expect(await render()).toMatchFileSnapshot('./__snapshots__/parse-corpus.txt')
  })

  it('is non-vacuous — every outcome and both tiers appear', async () => {
    // A snapshot of nothing passes forever, and a corpus that only ever reaches Tier 1 pins
    // nothing about the rung most parse fixes touch.
    const text = await render()
    for (const needle of ['"outcome":"ok"', '"outcome":"skipped"', '"outcome":"error"']) {
      expect(text, `no row with ${needle}`).toContain(needle)
    }
    for (const needle of ['"tier":1', '"tier":2', '"negated":true']) {
      expect(text, `no row with ${needle}`).toContain(needle)
    }
    expect(text.trimEnd().split('\n').length).toBe(corpus().length)
  })
})
