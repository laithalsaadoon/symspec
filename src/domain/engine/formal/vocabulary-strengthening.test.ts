/**
 * Committed vocabulary is a STRENGTHENING move (spec 007 I-1): a term, a glossary alias or an
 * antonym may add findings and demotions, never remove one the same words earn without it.
 *
 * Two routes did remove one, each measured on the built CLI, and each pinned here through the
 * real parser and the real pipeline:
 *
 * - the opposition-candidate tier read the RAW response text, so a term or alias that lines two
 *   objects up hid a same-class pair from it, and `verified: true` came back over a pair the
 *   same words without the term demote on;
 * - an entry naming two contraries as one action kept the contrary alias on its own atom and
 *   dropped the equivalence, so "open the door" + "not shut the door" under "open ≡ shut" lost
 *   the FND_CONTRADICTION the merged atom proved.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import type { Embedder } from './embed.ts'

const TS = '2026-01-01T00:00:00.000Z'

const idOf = (n: number) => `0a0a0a0a-0000-4000-8000-${String(n).padStart(12, '0')}`

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
  // `proves`: the committed vocabulary lines the two objects up and a seed row relates the two
  // verbs, so the solver decides the pair. `demotes`: no row relates the verbs (one side of a
  // class) or the key keeps the objects apart, so the candidate tier must keep `verified` false.
  // Either is at least what the raw wording earns; certifying is what I-1 forbids.
  for (const [x, y, vocabulary, earns] of [
    ['grant access to the user', 'revoke entry from the user', ACCESS, 'demotes'],
    ['grant access to the portal', 'forbid entry to the portal', ACCESS, 'proves'],
    ['grant access', 'not allow entry', ACCESS, 'demotes'],
    ['permit entry to the portal', 'revoke access to the portal', ACCESS, 'proves'],
    [
      'show the report to the user',
      'hide the summary from the user',
      { terms: [{ canonical: 'report', aliases: ['summary'] }] },
      'demotes',
    ],
    [
      'approve the bill',
      'decline the invoice',
      { terms: [{ canonical: 'invoice', aliases: ['bill'] }] },
      'proves',
    ],
    [
      'give access to the user',
      'revoke access from the user',
      {
        glossary: [{ canonical: 'grant access to the user', aliases: ['give access to the user'] }],
      },
      'demotes',
    ],
  ] as const) {
    it(`${x} / ${y} through ${JSON.stringify(vocabulary)} still ${earns}`, async () => {
      const report = await checkOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`], vocabulary)
      const codes = report.findings.map((f) => f.code)
      if (earns === 'proves') {
        expect(
          report.findings
            .filter((f) => f.code === 'FND_CONTRADICTION')
            .map((f) => f.requirementIds),
        ).toEqual([[idOf(1), idOf(2)]])
      } else {
        expect(codes).toContain('FND_OPPOSITION_CANDIDATE')
        expect(report.verified).toBe(false)
      }
    })
  }

  it('a term that makes two responses ONE atom is compared by the solver, not proposed', async () => {
    const report = await checkOf([`${BUTTON} grant access.`, `${BUTTON} not grant entry.`], ACCESS)
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
    expect(report.findings.map((f) => f.code)).not.toContain('FND_OPPOSITION_CANDIDATE')
  })
})

describe('I-1 — a glossary entry naming contraries keeps every conflict it entails', () => {
  // Under the author's entry "open the door" ≡ "shut the door", "open the door" and "not shut the
  // door" demand one action and its negation. Keeping the contrary alias on its own atom (so the
  // contrary axiom relates it) must not also DISCARD the equivalence: open ∧ ¬shut ∧ ¬(open ∧ shut)
  // is satisfiable, and the proven FND_CONTRADICTION became a demotion.
  const STOPS = 'When the train stops, the door controller shall'
  const BUTTON = 'When the operator presses the button, the c shall'
  const contradictionsOf = async (
    sentences: readonly string[],
    vocabulary: Record<string, unknown>,
  ) => {
    const doc = (await docOf(sentences)) as unknown as Record<string, unknown>
    Object.assign(doc, vocabulary)
    const report = await runCheck(doc as never)
    return report.findings
      .filter((f) => f.code === 'FND_CONTRADICTION')
      .map((f) => f.requirementIds)
  }
  const OPEN_SHUT = { a: 'open', b: 'shut' }

  it('the alias at opposite polarity: open + not shut, entry open <- shut', async () => {
    expect(
      await contradictionsOf([`${STOPS} open the door.`, `${STOPS} not shut the door.`], {
        glossary: [{ canonical: 'open the door', aliases: ['shut the door'] }],
        antonyms: [OPEN_SHUT],
      }),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('a seed pair, entry open <- close: open + not close', async () => {
    expect(
      await contradictionsOf([`${STOPS} open the door.`, `${STOPS} not close the door.`], {
        glossary: [{ canonical: 'open the door', aliases: ['close the door'] }],
      }),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('a canonical outside every class: operate + not shut, entry operate <- open, shut', async () => {
    const vocabulary = {
      glossary: [{ canonical: 'operate the door', aliases: ['open the door', 'shut the door'] }],
      antonyms: [OPEN_SHUT],
    }
    expect(
      await contradictionsOf(
        [`${STOPS} operate the door.`, `${STOPS} not shut the door.`],
        vocabulary,
      ),
    ).toEqual([[idOf(1), idOf(2)]])
    // "operate the door" IS "open the door" by the entry, so a contrary of open is its contrary.
    expect(
      await contradictionsOf(
        [`${STOPS} operate the door.`, `${STOPS} close the door.`],
        vocabulary,
      ),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('an entry a term turns contrary: open the door + not close the hatch', async () => {
    expect(
      await contradictionsOf([`${BUTTON} open the door.`, `${BUTTON} not close the hatch.`], {
        glossary: [{ canonical: 'open the door', aliases: ['close the hatch'] }],
        terms: [{ canonical: 'door', aliases: ['hatch'] }],
      }),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('never a conflict the entry does not entail: do neither, or one side twice', async () => {
    const vocabulary = { glossary: [{ canonical: 'open the door', aliases: ['close the door'] }] }
    expect(
      await contradictionsOf(
        [`${STOPS} not open the door.`, `${STOPS} not close the door.`],
        vocabulary,
      ),
    ).toEqual([])
    // Each alone is impossible under the entry, which is the demotion's business: no PAIR of the
    // two is a joint conflict the solver may report as one.
    expect(
      await contradictionsOf([`${STOPS} open the door.`, `${STOPS} open the door.`], vocabulary),
    ).toEqual([])
    // Across two contexts the link reads exactly as one shared atom would: the finding (or its
    // absence) is the one the same requirements get when both spell the canonical.
    const DEPARTS = 'When the train departs, the door controller shall'
    expect(
      await contradictionsOf(
        [`${STOPS} open the door.`, `${DEPARTS} not close the door.`],
        vocabulary,
      ),
    ).toEqual(
      await contradictionsOf([`${STOPS} open the door.`, `${DEPARTS} not open the door.`], {}),
    )
  })
})
