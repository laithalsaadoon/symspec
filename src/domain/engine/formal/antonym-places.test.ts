/**
 * Which preposition is a verb's own place, end to end (AC-2-1, the governed-preposition rule).
 *
 * The antonym-remainder rule once dropped the first place preposition after any antonym head
 * (669c0e9). The governed key reads that same one position, and marks it only when the head
 * governs it (`GOVERNED_PREPOSITIONS`); a verb only a document pairs governs
 * {@link COMMITTED_GOVERNS}. Each document below is one base proved as FND_CONTRADICTION between
 * genuine contraries, or one a later rule fabricated an error on.
 *
 * Kept apart from `antonym-rows.test.ts` on purpose: every `runCheck` grows the one z3 heap a
 * test file shares, and one file holding all of them runs that heap out of memory.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import { buildAntonymIndexWithDoc, COMMITTED_GOVERNS } from './antonyms.ts'
import { areContrary, atomize } from './atomize.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idOf = (n: number) => `0e0e0e0e-0000-4000-8000-${String(n).padStart(12, '0')}`
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

const contradictionsOf = async (
  sentences: readonly string[],
  antonyms: ReadonlyArray<readonly [string, string]> = [],
) =>
  (await runCheck(await docOf(sentences, antonyms))).findings
    .filter((f) => f.code === 'FND_CONTRADICTION')
    .map((f) => f.requirementIds)

const errorsOf = async (sentences: readonly string[]) =>
  (await runCheck(await docOf(sentences))).findings
    .filter((f) => f.severity === 'error')
    .map((f) => f.code)

/** The report over two responses under one trigger, with an embedder that relates nothing. */
const reportOf = async (x: string, y: string) =>
  runCheck(await docOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`]), {
    semantic: {
      embedder: async (texts) =>
        texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1])),
    },
  })

const resp = (text: string) => atomize({ kind: 'resp', text, systemName: 'controller' })

describe("the first place preposition is the verb's own place, when the verb governs it", () => {
  const PROVED = [
    // revoke and suspend take a right away where grant and resume give it: "access to X".
    ['grant access on the server', 'revoke access to the server'],
    ['grant permissions on the folder', 'revoke permissions to the folder'],
    ['authorize access in the building', 'revoke access to the building'],
    ['permit entry in the zone', 'revoke entry to the zone'],
    ['revoke access to the database', 'grant access into the database'],
    ['authorize permission on the repository', 'revoke permission to the repository'],
    ['allow access into the vault', 'revoke access to the vault'],
    ['suspend access to the account', 'resume access on the account'],
    // A spatial `within` names the place as `in` does.
    ['enable the alarm within the zone', 'disable the alarm in the zone'],
    ['include the file within the set', 'exclude the file from the set'],
    // A locative before a bare time noun may be left out.
    ['start the pump Monday', 'stop the pump on Monday'],
    ['enable the alarm weekends', 'disable the alarm on weekends'],
    ['open the gate Monday', 'close the gate on Monday'],
  ] as const
  for (const [x, y] of PROVED) {
    it(`${x} / ${y} is FND_CONTRADICTION`, async () => {
      expect(await contradictionsOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`])).toEqual([
        [idOf(1), idOf(2)],
      ])
    })
  }

  it("only the FIRST place preposition is the verb's own place", async () => {
    // "on messages" is where the filter goes; "to/from the admin" modifies the MESSAGES, so the
    // outbound and the inbound messages are two objects and the documents are consistent. Marking
    // every governed position read the second as the verb's place and made them one key. Each
    // pair is still one preposition apart, so it demotes, never certifies.
    for (const [x, y] of [
      ['add the filter on messages to the admin', 'remove the filter on messages from the admin'],
      ['show the banner on emails to the customer', 'hide the banner on emails from the customer'],
      ['revoke retries on calls from the service', 'allow retries on calls to the service'],
      ['insert the tag in packets to the gateway', 'withdraw the tag in packets from the gateway'],
      [
        'publish the footer on emails to the partner',
        'retract the footer on emails from the partner',
      ],
      ['add a header in requests to the backend', 'remove a header in requests from the backend'],
      [
        'include the header in messages to the vendor',
        'exclude the header in messages from the vendor',
      ],
      ['grant access on the server to the user', 'revoke access on the server from the user'],
    ] as const) {
      const report = await reportOf(x, y)
      expect(
        report.findings.filter((f) => f.severity === 'error').map((f) => f.code),
        `${x} / ${y}`,
      ).toEqual([])
      expect(
        report.findings.map((f) => f.code),
        `${x} / ${y}`,
      ).toContain('FND_OPPOSITION_CANDIDATE')
      expect(report.verified, `${x} / ${y}`).toBe(false)
    }
  })

  it('a deadline `within` is no place: start within 5 seconds / stop in 5 seconds is no error', async () => {
    for (const [x, y] of [
      ['start the pump within 5 seconds', 'stop the pump in 5 seconds'],
      ['enable the alarm within the hour', 'disable the alarm in the hour'],
      ['open the gate within one minute', 'close the gate at one minute'],
    ] as const) {
      expect(await errorsOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`]), `${x} / ${y}`).toEqual([])
    }
  })

  it('a locative is left out only before a bare noun, never before a determiner', async () => {
    // "show the user the dashboard" shows the dashboard TO the user; "hide the user on the
    // dashboard" hides the user's entry there. Leaving out `on` before `the` made them one key.
    // The pair is one preposition added, so it demotes, never certifies.
    for (const [x, y] of [
      ['show the user the dashboard', 'hide the user on the dashboard'],
      ['grant the operator the override', 'revoke the operator on the override'],
    ] as const) {
      const report = await reportOf(x, y)
      expect(
        report.findings.filter((f) => f.severity === 'error').map((f) => f.code),
        `${x} / ${y}`,
      ).toEqual([])
      expect(report.verified, `${x} / ${y}`).toBe(false)
    }
    expect(
      areContrary(
        resp('stop the pump on Monday in the yard'),
        resp('start the pump Monday in the yard'),
      ),
      'a left-out locative meets only a remainder that names no place',
    ).toBe(false)
  })

  it('a verb only a document pairs takes the place as the old rule read it (COMMITTED_GOVERNS)', async () => {
    // A committed row says nothing about which verb puts and which removes, so its verbs govern
    // every preposition the old antonym-remainder rule read as the place; still only the first.
    for (const [pair, x, y] of [
      [['admit', 'expel'], 'admit the student to the school', 'expel the student from the school'],
      [['admit', 'expel'], 'admit the student in the school', 'expel the student from the school'],
      [['hold', 'release'], 'hold the order in the queue', 'release the order from the queue'],
      [['admit', 'expel'], 'admit the user to the club', 'expel the user from the club'],
    ] as const) {
      expect(
        await contradictionsOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`], [pair]),
        `${x} / ${y}`,
      ).toEqual([[idOf(1), idOf(2)]])
    }
    for (const p of COMMITTED_GOVERNS.keys()) {
      expect(
        areContrary(
          atomize({
            kind: 'resp',
            text: `admit the item ${p} the place`,
            systemName: 'controller',
            antonyms: buildAntonymIndexWithDoc([['admit', 'expel']]),
          }),
          atomize({
            kind: 'resp',
            text: 'expel the item at the place',
            systemName: 'controller',
            antonyms: buildAntonymIndexWithDoc([['admit', 'expel']]),
          }),
        ),
        `admit ${p} / expel at`,
      ).toBe(true)
    }
  })
})
