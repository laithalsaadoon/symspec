/**
 * Spec 007 AC-2-3: `negated` never double-counts a negation the response text still carries.
 *
 * The rule is an OUTCOME post-condition over the flag the parse already computed. Tier 2 sets
 * `negated` from the modal-adjacent negator it strips (`shall not`, `shall never`) and from
 * wink's negation scope reaching the response. The defect is the second source when its
 * negator sits INSIDE the response: "requests that are not cached" keeps its `not` in
 * `systemResponse` AND flips the flag, so the line is stored as the prohibition of a phrase that
 * is itself negative.
 *
 * So the flag is cleared only when the negating token it was keyed on is present verbatim in the
 * stored `systemResponse`. Every other flag is kept exactly as the parse set it, whatever the
 * subject looks like — a negator left of the modal is not in the response text, and clearing it
 * would store the positive obligation the author denied. Two forms are fixed by rule: `shall
 * not only X but also Y` obliges both halves (not a prohibition), and a contracted modal
 * (`shan't`, `mustn't`, `won't`) is one.
 */

import { describe, expect, it } from 'vitest'
import { type ParseOkResult, parseLine } from './result.ts'

const ok = async (line: string): Promise<ParseOkResult> => {
  const r = await parseLine(line)
  if (r.outcome !== 'ok') throw new Error(`expected ok for ${line}, got ${JSON.stringify(r)}`)
  return r
}

describe('AC-2-3: a negation the stored response still carries does not set `negated`', () => {
  it('the reproducer: a relative-clause `not` leaves the obligation positive, text unchanged', async () => {
    const r = await ok('The gateway shall forward requests that are not cached.')
    expect(r.negated).toBe(false)
    expect(r.slots.systemResponse).toBe('forward requests that are not cached')
  })

  it.each([
    [
      'The gateway shall be notified of requests that are not cached.',
      'be notified of requests that are not cached',
    ],
    [
      'Users shall be able to reset passwords that are not expired.',
      'be able to reset passwords that are not expired',
    ],
    ['The gateway shall be never notified.', 'be never notified'],
    [
      'Requests shall, under no circumstances, be forwarded.',
      ', under no circumstances, be forwarded',
    ],
    ['The gateway shall, under load, not drop requests.', ', under load, not drop requests'],
  ])('on the Tier-2 path, the negator stays in the text and the flag clears — %s', async (line, response) => {
    const r = await ok(line)
    expect(r.tier).toBe(2)
    expect(r.slots.systemResponse).toBe(response)
    expect(r.negated).toBe(false)
  })

  it('`shall not only X but also Y` is not a prohibition, on either tier', async () => {
    const t1 = await ok('The gateway shall not only log requests but also forward them.')
    expect(t1.tier).toBe(1)
    expect(t1.negated).toBe(false)
    expect(t1.slots.systemResponse).toBe('not only log requests but also forward them')

    // A person-word subject escalates, so this one reaches the Tier-2 repair.
    const t2 = await ok('Users shall not only reset passwords but also unlock accounts.')
    expect(t2.tier).toBe(2)
    expect(t2.negated).toBe(false)
    expect(t2.slots.systemResponse).toBe('not only reset passwords but also unlock accounts')
  })

  it.each([
    ["The gateway shan't forward requests.", "n't forward requests"],
    ["The gateway mustn't forward requests.", "n't forward requests"],
    ["The gateway won't forward requests.", "n't forward requests"],
    // wink's scope stops at the comma, so the flag was unset here; the modal is still negated.
    ["The gateway shan't, under load, drop requests.", "n't, under load, drop requests"],
    // The same contraction with its apostrophe dropped: wink still splits off the modal and a
    // `nt` token right after it, and that token is the modal's own negation.
    ['The press wont start.', 'nt start'],
    ['The press shant start.', 'nt start'],
    ['The press mustnt start.', 'nt start'],
    ['When the door opens, the press wont start.', 'nt start'],
  ])('a contracted modal negation sets it — %s', async (line, response) => {
    const r = await ok(line)
    expect(r.negated).toBe(true)
    expect(r.slots.systemResponse).toBe(response)
  })
})

describe('AC-2-3 controls: every other flag is kept exactly as the parse set it', () => {
  it.each([
    ['The gateway shall not forward requests.', 'gateway', 'forward requests'],
    ['The gateway shall never forward requests.', 'gateway', 'forward requests'],
    [
      'The gateway shall not be notified of cached requests.',
      'gateway',
      'be notified of cached requests',
    ],
    ['The gateway shall never be notified.', 'gateway', 'be notified'],
    ['The gateway shall not be able to forward requests.', 'gateway', 'forward requests'],
    [
      'The gateway shall not forward requests that are not cached.',
      'gateway',
      'forward requests that are not cached',
    ],
  ] as const)('a stripped modal negator — %s', async (line, systemName, systemResponse) => {
    const r = await ok(line)
    expect(r.negated).toBe(true)
    expect(r.slots.systemName).toBe(systemName)
    expect(r.slots.systemResponse).toBe(systemResponse)
  })

  it.each([
    'No request shall be dropped.',
    'None of the requests shall be dropped.',
    'Neither replica shall be promoted.',
    'While offline, no request shall be dropped.',
    'Not all requests shall be logged.',
    'Not one request shall be dropped.',
    // Negative quantifiers the shape-matching rounds missed: kept, because the negator is not in
    // the response text.
    'Not even one request shall be dropped.',
    'Not even a single request shall be dropped.',
    'Not a single one of the requests shall be dropped.',
    'Not even one of the requests shall be dropped.',
    'Never a request shall be dropped.',
    'While offline, not even one request shall be dropped.',
    'Requests from none of the hosts shall be accepted.',
    'The requests of no user shall be logged.',
    // A negator in a subject modifier: kept too. Base stored these negated, and the negation is
    // in no slot, so clearing the flag would store a positive obligation nobody wrote.
    'The user that is not an admin shall be denied access.',
    'Users who are not admins shall be able to view logs.',
    'A request with no body shall be rejected.',
    'While the user is not signed in the session store shall be cleared.',
    // The response carries a `not` of its own, but the subject's `not` keyed the flag too: kept.
    'The user that is not an admin shall be denied access, not logged.',
  ])('a negator left of the modal keeps the flag it set — %s', async (line) => {
    expect((await ok(line)).negated).toBe(true)
  })

  it.each([
    // wink's scope stops at the comma after the modal: the parse left these clear, and they stay.
    'Packets not matching a rule shall, by default, be dropped.',
    'Accounts without MFA shall, on login, be challenged.',
    'Records with no owner shall, nightly, be archived.',
    'When a request is not authorized, the gateway shall be notified.',
  ])('a flag the parse left clear stays clear — %s', async (line) => {
    expect((await ok(line)).negated).toBe(false)
  })
})
