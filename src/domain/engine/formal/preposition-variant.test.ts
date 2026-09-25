/**
 * The preposition-variant rule (spec 007, the demote-not-prove contract C1/C2): two responses of
 * one system whose remainders are EQUAL once every preposition token is removed, under the SAME
 * antonym-table verb at opposite polarity, or under two verbs of one antonym class, are PROPOSED
 * (FND_OPPOSITION_CANDIDATE) and demote `verified` with the exact edit that makes them provable.
 * The rule never proves: a proof rests only on exact keys (identical remainders, or the
 * governed-preposition table's own rows).
 *
 * Base 669c0e9 dropped the first place preposition after an antonym head from the atom BODY, so
 * each document below was one atom at opposite polarity, or one key on opposite sides, and proved
 * FND_CONTRADICTION. The branch keeps every preposition in the body, so each is now two atoms, and
 * before this rule the candidate tier skipped a same-verb pair outright and a preposition that
 * moved one slot, so `verified` came back true over an X-and-not-X document.
 *
 * Its own file: every `runCheck` grows the one z3 heap a test file shares.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import { ANTONYM_INDEX, buildAntonymIndexWithDoc } from './antonyms.ts'
import { areContrary, atomize, normalize } from './atomize.ts'
import type { Embedder } from './embed.ts'
import { findOppositionCandidates } from './semantic.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idOf = (n: number) => `0f0f0f0f-0000-4000-8000-${String(n).padStart(12, '0')}`
const BUTTON = 'When the operator presses the button, the controller shall'

/** Parse each sentence through the real ladder and build an engine document from the slots. */
const docOf = async (
  sentences: readonly string[],
  antonyms: ReadonlyArray<readonly [string, string]> = [],
) => {
  const requirements: Record<string, unknown> = {}
  for (const [i, sentence] of sentences.entries()) {
    const parsed = await parseLine(sentence)
    if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
    const id = idOf(i + 1)
    requirements[id] = {
      id,
      patternType: parsed.slots.patternType,
      systemName: parsed.slots.systemName,
      systemResponse: parsed.slots.systemResponse,
      ...(parsed.slots.trigger !== undefined ? { trigger: parsed.slots.trigger } : {}),
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
    antonyms: antonyms.map(([a, b]) => ({ a, b })),
    waivers: [],
    terms: [],
    stateModel: { variables: [] },
  } as never
}

/** An embedder that relates nothing, so only the deterministic shape can propose. */
const orthogonal: Embedder = async (texts) =>
  texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1]))

/**
 * The report over `x` and `y` under one trigger, beside a compared control pair ("open the gate"
 * / "not close the gate") so the no-decide-tier-comparison demotion never masks the result.
 */
const reportOf = async (
  x: string,
  y: string,
  antonyms: ReadonlyArray<readonly [string, string]> = [],
  embedder: Embedder = orthogonal,
) =>
  runCheck(
    await docOf(
      [
        `${BUTTON} ${x}.`,
        `${BUTTON} ${y}.`,
        `${BUTTON} open the gate.`,
        `${BUTTON} not close the gate.`,
      ],
      antonyms,
    ),
    { semantic: { embedder } },
  )

/** An embedder that relates everything, so the cosine floor never filters a shape out. */
const parallel: Embedder = async (texts) => texts.map(() => Float32Array.from([1, 0]))

type Report = Awaited<ReturnType<typeof reportOf>>

/** The pair is DEMOTED: no error, a candidate naming both, `verified: false`, a named demotion. */
const expectDemoted = (report: Report, label: string) => {
  expect(
    report.findings.filter((f) => f.severity === 'error').map((f) => f.code),
    label,
  ).toEqual([])
  const candidates = report.findings.filter((f) => f.code === 'FND_OPPOSITION_CANDIDATE')
  expect(
    candidates.map((f) => f.requirementIds),
    label,
  ).toEqual([[idOf(1), idOf(2)]])
  expect(report.verified, label).toBe(false)
  expect(
    report.coverage.demotions
      .filter((d) => d.reason === 'open-opposition-candidate')
      .map((d) => d.requirementIds),
    label,
  ).toEqual([[idOf(1), idOf(2)]])
  return candidates[0]?.message ?? ''
}

describe('the SAME verb at opposite polarity, prepositions apart, demotes', () => {
  // Each: base 669c0e9 exit 1 FND_CONTRADICTION; e13a56a exit 0 verified:true, nothing demoted.
  const SAME_VERB = [
    ['stop the pump on Monday', 'stop the pump Monday'],
    ['show the alarm on the display', 'show the alarm in the display'],
    ['enable the alarm within the zone', 'enable the alarm in the zone'],
    ['grant access on the server', 'grant access to the server'],
    ['lock the door at the entrance', 'lock the door on the entrance'],
    ['revoke access to the server', 'revoke access on the server'],
    ['start the pump on Monday', 'start the pump Monday'],
    ['stop the pump at the station', 'stop the pump in the station'],
    ['roll back the change to production', 'roll back the change production'],
  ] as const
  for (const [x, y] of SAME_VERB) {
    it(`${x} / not ${y}`, async () => {
      const message = expectDemoted(await reportOf(x, `not ${y}`), `${x} / not ${y}`)
      // The exact edit that makes the pair provable: the second response in the first's words
      // (one atom at opposite polarity), or the glossary entry that says so.
      expect(message).toContain(`\`symspec update --ref ${idOf(2)} systemResponse "${x}"\``)
      expect(message).toContain(`\`symspec glossary add "${x}" "${y}"\``)
      expect(message).not.toContain('symspec antonym add')
    })
  }

  it('the same verb at the SAME polarity is no candidate: nothing can conflict', async () => {
    const report = await reportOf('stop the pump on Monday', 'stop the pump Monday')
    expect(report.findings.map((f) => f.code)).not.toContain('FND_OPPOSITION_CANDIDATE')
  })

  it('a verb outside every antonym class is not read by this rule, even at cosine 1', async () => {
    // Base never dropped a preposition after such a verb, so no base proof rests on one.
    const report = await reportOf(
      'send the report on Monday',
      'not send the report Monday',
      [],
      parallel,
    )
    expect(report.findings.map((f) => f.code)).not.toContain('FND_OPPOSITION_CANDIDATE')
  })
})

describe('two verbs one contrary row relates, prepositions apart or moved, demote', () => {
  const CONTRARY = [
    // Every same-place row, `access on X` against `access to X`: base proved each.
    ['enable access on the API', 'disable access to the API'],
    ['open access on the portal', 'close access to the portal'],
    ['activate access on the account', 'deactivate access to the account'],
    ['unlock access on the vault', 'lock access to the vault'],
    ['start access on the server', 'stop access to the server'],
    ['accept access on the portal', 'reject access to the portal'],
    ['raise the flag on the mast', 'lower the flag from the mast'],
    // A preposition that moved one slot (adverb placement): base dropped it wherever it sat.
    ['grant access to only admins', 'revoke access only from admins'],
    ['show the report to just the manager', 'hide the report just from the manager'],
  ] as const
  for (const [x, y] of CONTRARY) {
    it(`${x} / ${y}`, async () => {
      const message = expectDemoted(await reportOf(x, y), `${x} / ${y}`)
      // The second response with the first one's object: identical remainders under a contrary
      // row are one key on opposite sides, which the solver decides.
      const head = normalize(y).split('_')[0] as string
      const aligned = `${head} ${normalize(x).split('_').slice(1).join(' ')}`
      expect(message).toContain(`\`symspec update --ref ${idOf(2)} systemResponse "${aligned}"\``)
      expect(message).toContain(`\`symspec glossary add "${aligned}" "${y}"\``)
    })
  }

  it('"do neither" and "do one, not the other" are never candidates: no reading conflicts', async () => {
    // A contrary is ¬(A ∧ B): with either side negated, aligning the preposition still leaves a
    // consistent document, so there is no edit that could make the pair provable.
    for (const [x, y] of [
      ['not enable access on the API', 'not disable access to the API'],
      ['not grant access to only admins', 'not revoke access only from admins'],
      ['enable access on the API', 'not disable access to the API'],
      ['not grant access to only admins', 'revoke access only from admins'],
    ] as const) {
      const report = await reportOf(x, y)
      expect(
        report.findings.map((f) => f.code),
        `${x} / ${y}`,
      ).not.toContain('FND_OPPOSITION_CANDIDATE')
    }
  })
})

describe('the edit the candidate names makes the pair provable', () => {
  // A demotion must say what discharges it into a verdict (C2). Each case applies the message's
  // own `update` (the second response rewritten) or `glossary` edit, and the solver then proves
  // the conflict it could not see.
  const CASES = [
    ['stop the pump on Monday', 'not stop the pump Monday', 'stop the pump Monday'],
    [
      'grant access to only admins',
      'revoke access only from admins',
      'revoke access only from admins',
    ],
    ['raise the flag on the mast', 'lower the flag from the mast', 'lower the flag from the mast'],
  ] as const
  const quoted = (message: string, command: string) =>
    [
      ...message.matchAll(
        new RegExp(`\`symspec ${command} [^\`]*?"([^"]+)"(?: "([^"]+)")?\``, 'g'),
      ),
    ][0]
  for (const [x, y, yResponse] of CASES) {
    it(`${x} / ${y}`, async () => {
      const message = expectDemoted(await reportOf(x, y), `${x} / ${y}`)
      const update = quoted(message, 'update')
      const rewritten = y.replace(yResponse, update?.[1] as string)
      const updated = await reportOf(x, rewritten)
      expect(
        updated.findings.filter((f) => f.code === 'FND_CONTRADICTION').map((f) => f.requirementIds),
        `update: ${rewritten}`,
      ).toEqual([[idOf(1), idOf(2)]])

      const glossary = quoted(message, 'glossary add')
      const doc = (await docOf([
        `${BUTTON} ${x}.`,
        `${BUTTON} ${y}.`,
        `${BUTTON} open the gate.`,
        `${BUTTON} not close the gate.`,
      ])) as { glossary: unknown[] }
      doc.glossary.push({ canonical: glossary?.[1], aliases: [glossary?.[2]] })
      const merged = await runCheck(doc as never, { semantic: { embedder: orthogonal } })
      expect(
        merged.findings.filter((f) => f.code === 'FND_CONTRADICTION').map((f) => f.requirementIds),
        `glossary: ${glossary?.[1]} / ${glossary?.[2]}`,
      ).toEqual([[idOf(1), idOf(2)]])
    })
  }
})

describe('every pair base 669c0e9 related is proved or proposed (atom-level sweep)', () => {
  // The oracle is base's own rule, restated: after an antonym head, the first of these after the
  // remainder's first token was dropped from the body, and the head was renamed to the smallest
  // member of its class SIDE. Two responses it put on one atom at opposite polarity, or on one
  // key on opposite sides both asserted, were FND_CONTRADICTION.
  const BASE_DROPPED = new Set(['in', 'into', 'from', 'within', 'inside', 'to', 'onto', 'at', 'on'])
  const baseRest = (rest: string): string => {
    const tokens = rest.split('_')
    const i = tokens.findIndex((t, at) => at > 0 && BASE_DROPPED.has(t))
    return (i === -1 ? tokens : [...tokens.slice(0, i), ...tokens.slice(i + 1)]).join('_')
  }
  const PREPS = ['in', 'on', 'at', 'within', 'to', 'from', 'into', '']
  const LAYOUTS: ReadonlyArray<(p: string) => string> = [
    (p) => `the pump ${p} the station`,
    (p) => `the pump ${p} monday`,
    (p) => `access ${p} only admins`,
    (p) => `access only ${p} admins`,
  ]
  const phrase = (verb: string, rest: string) =>
    `${verb.replace(/_/g, ' ')} ${rest}`.replace(/ {2,}/g, ' ')

  it('no base-related pair is left both unproved and unproposed', async () => {
    const verbs = [...ANTONYM_INDEX.keys()]
    const pairs: Array<readonly [string, string, boolean, boolean]> = []
    for (const a of verbs) {
      const ea = ANTONYM_INDEX.get(a) as NonNullable<ReturnType<typeof ANTONYM_INDEX.get>>
      for (const b of verbs) {
        const eb = ANTONYM_INDEX.get(b) as NonNullable<ReturnType<typeof ANTONYM_INDEX.get>>
        if (ea.canonical !== eb.canonical || a > b) continue
        // Same side: one atom in base, a conflict when the polarities differ. Opposite sides:
        // one key in base, a conflict when both are asserted.
        const sameSide = ea.negated === eb.negated
        pairs.push([a, b, false, sameSide])
      }
    }
    const misses: string[] = []
    let related = 0
    for (const [a, b, negA, negB] of pairs) {
      for (const layoutX of LAYOUTS) {
        for (const layoutY of LAYOUTS) {
          for (const p of PREPS) {
            for (const q of PREPS) {
              const [rx, ry] = [normalize(layoutX(p)), normalize(layoutY(q))]
              if (baseRest(rx) !== baseRest(ry)) continue
              const [x, y] = [phrase(a, layoutX(p)), phrase(b, layoutY(q))]
              const ax = atomize({ kind: 'resp', text: x, systemName: 'c', negated: negA })
              const ay = atomize({ kind: 'resp', text: y, systemName: 'c', negated: negB })
              if (ax.name === ay.name && negA === negB) continue
              related += 1
              const proved =
                (ax.name === ay.name && negA !== negB) || (!negA && !negB && areContrary(ax, ay))
              if (proved) continue
              const found = await findOppositionCandidates(
                [
                  { id: 'a', systemName: 'c', systemResponse: x, negated: negA },
                  { id: 'b', systemName: 'c', systemResponse: y, negated: negB },
                ],
                orthogonal,
              )
              if (found.length === 0)
                misses.push(`${x}${negA ? ' (not)' : ''} / ${y}${negB ? ' (not)' : ''}`)
            }
          }
        }
      }
    }
    expect(related).toBeGreaterThan(1000)
    expect(misses.slice(0, 20)).toEqual([])
  })

  it('a committed row is swept too', async () => {
    const index = buildAntonymIndexWithDoc([['admit', 'expel']])
    const misses: string[] = []
    for (const p of PREPS) {
      for (const q of PREPS) {
        const [rx, ry] = [
          normalize(`the student ${p} the school`),
          normalize(`the student ${q} the school`),
        ]
        if (baseRest(rx) !== baseRest(ry)) continue
        const [x, y] = [
          phrase('admit', rx.replace(/_/g, ' ')),
          phrase('expel', ry.replace(/_/g, ' ')),
        ]
        const [ax, ay] = [x, y].map((text) =>
          atomize({ kind: 'resp', text, systemName: 'c', antonyms: index }),
        ) as [ReturnType<typeof atomize>, ReturnType<typeof atomize>]
        if (areContrary(ax, ay)) continue
        const found = await findOppositionCandidates(
          [
            { id: 'a', systemName: 'c', systemResponse: x },
            { id: 'b', systemName: 'c', systemResponse: y },
          ],
          orthogonal,
          { antonyms: index },
        )
        if (found.length === 0) misses.push(`${x} / ${y}`)
      }
    }
    expect(misses).toEqual([])
  })
})
