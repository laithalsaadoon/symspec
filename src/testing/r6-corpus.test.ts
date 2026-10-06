/**
 * THE R6 CORPUS SNAPSHOT — the blast radius of any change to GTWR_R6_MISSING_UNITS.
 *
 * ## Why this file exists
 *
 * An R6 ERROR excludes its requirement from the formal tier (`FND_EXCLUDED_FROM_FORMAL`). So
 * R6 errs in two costly directions: an error on a numeral that is not an amount turns a
 * consistent document into exit 1, and a MISSING error on a unitless amount admits a
 * requirement whose setpoint no tier compares, which is how two conflicting setpoints reach
 * `verified: true`. A fix aimed at the first direction has repeatedly opened the second on a
 * sentence nobody thought to assert.
 *
 * So this file renders R6's findings over a large, fixed corpus and pins them byte for byte.
 * Output is IDENTICAL on every input except the class a fix targets, and the diff of this
 * snapshot is the evidence a reviewer reads row by row.
 *
 * ## The corpus
 *
 * Only strings carrying a digit: R6 matches a digit run, so a row without one can never carry
 * an R6 finding, and pinning it would pin nothing.
 *
 * - `__fixtures__/r6-corpus.txt`: requirement sentences mined from the repo's tests and README,
 *   every reproducer recorded against earlier R6 changes, and probes around the identifier and
 *   unit classes;
 * - the digit-bearing lines of `__fixtures__/parse-corpus.txt`;
 * - every requirement of the eval-round, generated-ladder and fabrication document corpora.
 *
 * A fixture line is linted the way `check` lints a stored requirement: parsed into slots (or, for
 * a line that is a JSON slot record, taken as those slots), then rendered, so a rule that reads the requirement's slots sees what `check` would hand it. A line
 * that does not parse is linted as raw text against a requirement whose slots do not render to
 * it, and the row says so (`"unparsed":true`).
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderSentence } from '../domain/engine/core/render.ts'
import type { Requirement } from '../domain/engine/core/schema.ts'
import { checkGtWRules } from '../domain/engine/lint/gtwr.ts'
import { parseLine } from '../domain/engine/parse/result.ts'
import { evalRoundCases } from './eval-rounds.ts'
import { fabricationCases } from './fabrication.ts'
import { generateCases } from './generate.ts'

const LADDER_TIERS = [1, 2, 3, 4] as const
const LADDER_SEED = 0
const TS = '2026-01-01T00:00:00.000Z'
const ID = '11111111-1111-4111-8111-111111111111'

const hasDigit = (s: string): boolean => /\d/.test(s)

const fixtureLines = (name: string): string[] =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '' && hasDigit(l))

const requirementOf = (slots: Partial<Requirement>, negated: boolean): Requirement => ({
  id: ID,
  patternType: 'ubiquitous',
  systemName: 'controller',
  systemResponse: '',
  ...slots,
  negated,
  sentence: '',
  priority: 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: TS,
  updatedAt: TS,
})

const r6Of = (requirement: Requirement, sentence: string): unknown[] =>
  checkGtWRules(requirement, sentence)
    .filter((f) => f.code === 'GTWR_R6_MISSING_UNITS')
    .map((f) => [f.severity, f.span, f.message])

const lineRow = async (line: string): Promise<string> => {
  if (line.startsWith('{')) {
    // A slot record, stored as `apply` would store it: the shape a compound response or an
    // ops-authored slot takes, which no prose line parses into.
    const { negated = false, ...slots } = JSON.parse(line) as Partial<Requirement>
    const requirement = requirementOf(slots, negated)
    const sentence = renderSentence(requirement)
    return `${line}\t${JSON.stringify({ sentence, r6: r6Of(requirement, sentence) })}`
  }
  const parsed = await parseLine(line)
  if (parsed.outcome !== 'ok') {
    const raw = requirementOf({ systemResponse: line }, false)
    return `${JSON.stringify(line)}\t${JSON.stringify({ unparsed: true, r6: r6Of(raw, line) })}`
  }
  const requirement = requirementOf(parsed.slots, parsed.negated)
  const sentence = renderSentence(requirement)
  const row =
    sentence === line
      ? { r6: r6Of(requirement, sentence) }
      : { sentence, r6: r6Of(requirement, sentence) }
  return `${JSON.stringify(line)}\t${JSON.stringify(row)}`
}

const docRequirements = (): Requirement[] => {
  const out: Requirement[] = []
  const take = (requirements: Readonly<Record<string, unknown>>) => {
    for (const r of Object.values(requirements)) out.push(r as Requirement)
  }
  for (const c of evalRoundCases()) take(c.doc.requirements)
  for (const tier of LADDER_TIERS) {
    for (const c of generateCases(tier, LADDER_SEED)) take(c.doc.requirements)
  }
  for (const c of fabricationCases()) take(c.doc.requirements as Readonly<Record<string, unknown>>)
  return out
}

const render = async (): Promise<string> => {
  const rows = new Set<string>()
  const lines = [
    ...new Set([...fixtureLines('r6-corpus.txt'), ...fixtureLines('parse-corpus.txt')]),
  ]
  for (const line of lines) rows.add(await lineRow(line))
  for (const r of docRequirements()) {
    const sentence = r.sentence || renderSentence(r)
    if (!hasDigit(sentence)) continue
    rows.add(`doc:${JSON.stringify(sentence)}\t${JSON.stringify({ r6: r6Of(r, sentence) })}`)
  }
  return `${[...rows].sort().join('\n')}\n`
}

describe('the R6 corpus', () => {
  it('renders R6 over every digit-bearing corpus sentence, byte-stable', async () => {
    await expect(await render()).toMatchFileSnapshot('./__snapshots__/r6-corpus.txt')
  })

  it('is non-vacuous — errors, clean rows, parsed and unparsed lines all appear', async () => {
    // A snapshot of nothing passes forever; one with no clean row pins nothing about the
    // numerals R6 lets through, and one with no error pins nothing about the ones it keeps.
    const text = await render()
    expect(text).toContain('["error",')
    expect(text).toContain('{"r6":[]}')
    expect(text).toContain('"unparsed":true')
    expect(text).toContain('doc:"')
    expect(text.trimEnd().split('\n').length).toBeGreaterThan(300)
  })
})
