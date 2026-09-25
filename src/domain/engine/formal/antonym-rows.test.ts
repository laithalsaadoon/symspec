/**
 * Every row of the antonym tables is reachable: each seed pair relates its own two verbs, and
 * each cross-side contrary the class chaining used to imply is a row that proves end to end.
 *
 * A table entry nothing exercises is dead code with a green suite (see
 * `.erpaval/solutions/conventions/lexicon-entries-need-per-entry-reachability-tests.md`). The
 * whole-table sweep reads the rows off the table itself, so a row that stops resolving fails by
 * name; the named lists below pin the rows a lead decision added, so deleting one fails too.
 *
 * Kept apart from `opposition.test.ts` on purpose: every `runCheck` grows the one z3 heap a test
 * file shares, and the sweep is atom-level (`areContrary`, the relation the contrary axioms are
 * built from) so it costs no solver call.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import { GOVERNED_PREPOSITIONS, SEED_ANTONYM_PAIRS } from './antonyms.ts'
import { areContrary, atomize } from './atomize.ts'

const TS = '2026-01-01T00:00:00.000Z'
const idOf = (n: number) => `0d0d0d0d-0000-4000-8000-${String(n).padStart(12, '0')}`
const BUTTON = 'When the operator presses the button, the controller shall'

/** Parse each sentence through the real ladder and build an engine document from the slots. */
const docOf = async (sentences: readonly string[]) => {
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
    antonyms: [],
    waivers: [],
    terms: [],
    stateModel: { variables: [] },
  } as never
}

const contradictionsOf = async (sentences: readonly string[]) =>
  (await runCheck(await docOf(sentences))).findings
    .filter((f) => f.code === 'FND_CONTRADICTION')
    .map((f) => f.requirementIds)

const errorsOf = async (sentences: readonly string[]) =>
  (await runCheck(await docOf(sentences))).findings
    .filter((f) => f.severity === 'error')
    .map((f) => f.code)

const resp = (text: string) => atomize({ kind: 'resp', text, systemName: 'controller' })

describe('every seed row relates its own two verbs', () => {
  for (const [a, b] of SEED_ANTONYM_PAIRS) {
    const [x, y] = [a.replace('_', ' '), b.replace('_', ' ')]
    it(`${x} / ${y}`, () => {
      expect(areContrary(resp(`${x} the box`), resp(`${y} the box`))).toBe(true)
      expect(areContrary(resp(`${y} the box`), resp(`${x} the box`))).toBe(true)
    })
  }
})

describe('every cross-side contrary the class chaining meant is a row of its own (AC-2-1)', () => {
  // Before the table related only its rows, every positive member of a class opposed every
  // negative one. Relating only rows is right (chaining is how publish ≡ extend arose), but it
  // also dropped the cross-side pairs the chaining used to reach: each document below is a real
  // conflict base 669c0e9 proved as FND_CONTRADICTION, and without its own row it fell to the
  // opposition-candidate tier, exit 0 without `--strict`.
  const CROSS_SIDE_ROWS = [
    ['approve', 'decline', 'the invoice'],
    ['grant', 'forbid', 'access to the user'],
    ['allow', 'forbid', 'the transfer'],
    ['allow', 'revoke', 'access to the user'],
    ['authorize', 'forbid', 'the payment'],
    ['authorize', 'revoke', 'the payment'],
    ['permit', 'revoke', 'the transfer'],
  ] as const

  it('each is a seed row', () => {
    const rows = new Set(SEED_ANTONYM_PAIRS.map(([a, b]) => [a, b].sort().join('|')))
    for (const [x, y] of CROSS_SIDE_ROWS) {
      expect(rows.has([x, y].sort().join('|')), `${x} / ${y}`).toBe(true)
    }
  })

  for (const [x, y, object] of CROSS_SIDE_ROWS) {
    it(`${x} / ${y} ${object} is FND_CONTRADICTION, in either order`, async () => {
      for (const [p, q] of [
        [x, y],
        [y, x],
      ] as const) {
        expect(
          await contradictionsOf([`${BUTTON} ${p} ${object}.`, `${BUTTON} ${q} ${object}.`]),
          `${p} / ${q}`,
        ).toEqual([[idOf(1), idOf(2)]])
      }
    })

    it(`not ${x} / not ${y} ${object} ("do neither") is no error`, async () => {
      expect(
        await errorsOf([`${BUTTON} not ${x} ${object}.`, `${BUTTON} not ${y} ${object}.`]),
      ).toEqual([])
    })
  }

  it('conceal / unseal, the one cross-side pair that is no contrary, stays unrelated', () => {
    // Unsealing an envelope and keeping it out of sight are compatible; only seal and expose
    // connect the two, and that chain is exactly what the table no longer reads.
    expect(areContrary(resp('conceal the box'), resp('unseal the box'))).toBe(false)
  })
})

describe('every governed preposition is reachable: its contrary names the same place differently', () => {
  // GOVERNED_PREPOSITIONS lists a verb's preposition when it introduces a place a contrary of that
  // verb may name with a DIFFERENT preposition ("show X on Y" / "hide X from Y"). So every listed
  // preposition must meet, through some row, a partner's different governed preposition for the
  // same place; one that meets none is dead, and a verb the rule covers that is missing is a
  // proof lost.
  const placesOf = (verb: string) => [...(GOVERNED_PREPOSITIONS.get(verb) ?? new Map())]
  const pairings = SEED_ANTONYM_PAIRS.flatMap(([a, b]) =>
    [
      [a, b],
      [b, a],
    ].flatMap(([x, y]) =>
      placesOf(x as string).flatMap(([p, place]) =>
        placesOf(y as string)
          .filter(([q, other]) => q !== p && other === place)
          .map(([q]) => [x as string, p as string, y as string, q as string] as const),
      ),
    ),
  )

  it('every listed (verb, preposition) meets a contrary that names the place differently', () => {
    const reached = new Set(pairings.map(([x, p]) => `${x}|${p}`))
    for (const [verb, preps] of GOVERNED_PREPOSITIONS) {
      for (const p of preps.keys()) expect(reached.has(`${verb}|${p}`), `${verb} ${p}`).toBe(true)
    }
  })

  for (const [a, b] of SEED_ANTONYM_PAIRS) {
    const [va, vb] = [a.replace('_', ' '), b.replace('_', ' ')]
    const rows = pairings.filter(([x, , y]) => (x === a && y === b) || (x === b && y === a))
    if (rows.length === 0) continue
    it(`${va} / ${vb}: every governed pairing for one place is a contrary`, () => {
      for (const [x, p, y, q] of rows) {
        const [vx, vy] = [x.replace('_', ' '), y.replace('_', ' ')]
        expect(
          areContrary(resp(`${vx} the item ${p} the place`), resp(`${vy} the item ${q} the place`)),
          `${vx} … ${p} / ${vy} … ${q}`,
        ).toBe(true)
      }
    })
  }

  it('the two places of quarantine / release never meet each other', () => {
    for (const p of ['at', 'in', 'inside', 'into', 'on']) {
      for (const q of ['to', 'into', 'onto', 'on']) {
        if (p === q) continue
        expect(
          areContrary(
            resp(`quarantine the item ${p} the place`),
            resp(`release the item ${q} the place`),
          ),
          `quarantine ${p} / release ${q}`,
        ).toBe(false)
      }
    }
    for (const q of ['at', 'in', 'inside']) {
      expect(
        areContrary(
          resp('quarantine the item from the place'),
          resp(`release the item ${q} the place`),
        ),
        `quarantine from / release ${q}`,
      ).toBe(false)
    }
  })

  it('a preposition neither verb governs keeps its direction: grant FROM / revoke TO', () => {
    // `grant` takes its place with to/into/at/in/inside/on and `revoke` with from and the
    // locatives; `grant … from` and `revoke … to` are two different places.
    expect(
      areContrary(resp('grant calls from the number'), resp('revoke calls to the number')),
    ).toBe(false)
    expect(
      areContrary(resp('show the report from the user'), resp('hide the report to the user')),
    ).toBe(false)
    expect(
      areContrary(resp('open the item from the place'), resp('close the item to the place')),
    ).toBe(false)
    expect(
      areContrary(resp('withdraw the card into the tray'), resp('insert the card from the tray')),
    ).toBe(false)
  })
})

describe('the to/from contraries prove end to end (AC-2-1, the governed-preposition rule)', () => {
  // Each is a real conflict base 669c0e9 proved as FND_CONTRADICTION and the per-verb table lost:
  // the verb carries the direction, the preposition only introduces the place.
  const TO_FROM = [
    ['grant access to the user', 'revoke access from the user'],
    ['grant the badge to the visitor', 'revoke the badge from the visitor'],
    ['grant access to all users', 'revoke access from all users'],
    ['grant read access to the user', 'revoke read access from the user'],
    ['allow access to the user', 'revoke access from the user'],
    ['permit access to the user', 'revoke access from the user'],
    ['authorize access to the user', 'revoke access from the user'],
    ['show the report to the user', 'hide the report from the user'],
    ['expose the port to the network', 'conceal the port from the network'],
    ['seal the sample from the air', 'expose the sample to the air'],
    ['publish the article to the portal', 'retract the article from the portal'],
    ['extend the offer to the customer', 'retract the offer from the customer'],
    ['quarantine the message in the queue', 'release the message from the queue'],
    ['engage the clutch with the gear', 'disengage the clutch from the gear'],
  ] as const
  for (const [x, y] of TO_FROM) {
    it(`${x} / ${y} is FND_CONTRADICTION`, async () => {
      expect(await contradictionsOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`])).toEqual([
        [idOf(1), idOf(2)],
      ])
    })
  }

  // Each is a direct seed row that base 669c0e9 proved as FND_CONTRADICTION and a one-preposition-
  // per-verb table lost (verifier H1-H7, B1, B3, C1n, C2, R1-R12): ordinary requirements English
  // names one place with on, in, at, into or onto as readily as with to.
  const PLACE_WORDINGS = [
    ['show the alarm on the display', 'hide the alarm from the display'],
    ['show the banner on the home page', 'hide the banner from the home page'],
    ['show the warning in the dialog', 'hide the warning from the dialog'],
    ['publish the notice on the portal', 'retract the notice from the portal'],
    ['publish the article at the site', 'retract the article from the site'],
    ['include the item on the invoice', 'exclude the item from the invoice'],
    ['add the item on the list', 'remove the item from the list'],
    ['engage the brake on the wheel', 'disengage the brake from the wheel'],
    ['extend the probe into the chamber', 'retract the probe from the chamber'],
    ['extend the ramp onto the platform', 'retract the ramp from the platform'],
    ['expose the service on the network', 'conceal the service from the network'],
    ['grant access on the server', 'revoke access from the server'],
    ['quarantine the file into the vault', 'release the file from the vault'],
    ['quarantine the host from the network', 'release the host to the network'],
    ['connect the cable into the socket', 'disconnect the cable from the socket'],
    ['connect the cable with the socket', 'disconnect the cable from the socket'],
    ['commit the change to production', 'roll back the change from production'],
    ['commit the batch to the ledger', 'roll back the batch from the ledger'],
    ['commits the batch to the ledger', 'rolls back the batch from the ledger'],
    ['commit the change to the database', 'roll back the change in the database'],
    ['commit the batch to the ledger', 'rollback the batch from the ledger'],
    ['enable the feature on the device', 'disable the feature in the device'],
    ['grant access on the server', 'deny access to the server'],
    ['remove the user in the group', 'add the user to the group'],
    ['suspend the user from the service', 'resume the user in the service'],
    ['grant access on the server to the user', 'revoke access on the server from the user'],
  ] as const
  for (const [x, y] of PLACE_WORDINGS) {
    it(`${x} / ${y} is FND_CONTRADICTION`, async () => {
      expect(await contradictionsOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`])).toEqual([
        [idOf(1), idOf(2)],
      ])
    })
  }

  it('two places stay two: quarantine IN the vault / release TO the vault is no error', async () => {
    // `quarantine` and `release` each name two places: where the object is held (quarantine in,
    // release from) and the outside it is cut off from and returned to (quarantine from, release
    // to). Releasing a file TO the vault and quarantining it IN the vault both put it there.
    for (const [x, y] of [
      ['quarantine the file in the vault', 'release the file to the vault'],
      ['quarantine the file into the vault', 'release the file onto the vault'],
      ['quarantine the host from the lab', 'release the host in the lab'],
    ] as const) {
      expect(await errorsOf([`${BUTTON} ${x}.`, `${BUTTON} ${y}.`]), `${x} / ${y}`).toEqual([])
    }
  })

  it('a direction the verb does not carry is no error: allow calls TO / deny calls FROM', async () => {
    // `deny` takes `to` for the place, as `allow` does, so it governs nothing and its `from`
    // stays in the key: incoming calls denied, outgoing allowed, is consistent.
    expect(
      await errorsOf([
        `${BUTTON} allow calls to the number.`,
        `${BUTTON} deny calls from the number.`,
      ]),
    ).toEqual([])
  })
})
