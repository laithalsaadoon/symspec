/**
 * Spec 007 AC-2-3: `negated` is set only by a negation that governs the modal.
 *
 * A `not` inside the response ("requests that are not cached") scopes over a relative clause,
 * not over the obligation, so reading it as polarity stores a prohibition the author never wrote.
 * The controls pin every form that DOES govern the modal at its base behaviour, including the
 * contracted modals and the negating subjects ("No request shall …"), whose slot text is kept
 * exactly as the parser produced it before this fix.
 */

import { describe, expect, it } from 'vitest'
import { type ParseOkResult, parseLine } from './result.ts'

const ok = async (line: string): Promise<ParseOkResult> => {
  const r = await parseLine(line)
  if (r.outcome !== 'ok') throw new Error(`expected ok for ${line}, got ${JSON.stringify(r)}`)
  return r
}

describe('AC-2-3: a negation elsewhere in the response does not set `negated`', () => {
  it('the reproducer: a relative-clause `not` leaves the obligation positive, text unchanged', async () => {
    const r = await ok('The gateway shall forward requests that are not cached.')
    expect(r.negated).toBe(false)
    expect(r.slots.systemResponse).toBe('forward requests that are not cached')
  })

  it('the same on the Tier-2 path (a passive main clause escalates)', async () => {
    const r = await ok('The gateway shall be notified of requests that are not cached.')
    expect(r.tier).toBe(2)
    expect(r.negated).toBe(false)
    expect(r.slots.systemName).toBe('gateway')
    expect(r.slots.systemResponse).toBe('be notified of requests that are not cached')
  })

  it('a weak-subject Tier-2 line keeps its subject and loses only the stray polarity', async () => {
    const r = await ok('Users shall be able to reset passwords that are not expired.')
    expect(r.tier).toBe(2)
    expect(r.negated).toBe(false)
    expect(r.slots.systemName).toBe('Users')
    expect(r.slots.systemResponse).toBe('be able to reset passwords that are not expired')
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
    expect(t2.slots.systemName).toBe('Users')
    expect(t2.slots.systemResponse).toBe('not only reset passwords but also unlock accounts')
  })
})

describe('AC-2-3 controls: a negation that governs the modal still sets it, slots as before', () => {
  it.each([
    ['The gateway shall not forward requests.', 1, 'gateway', 'forward requests'],
    ['The gateway shall never forward requests.', 1, 'gateway', 'forward requests'],
    [
      'The gateway shall not be notified of cached requests.',
      2,
      'gateway',
      'be notified of cached requests',
    ],
    ['The gateway shall never be notified.', 2, 'gateway', 'be notified'],
    ['The gateway shall not be able to forward requests.', 2, 'gateway', 'forward requests'],
    ["The gateway shan't forward requests.", 2, 'gateway', "n't forward requests"],
    ["The gateway mustn't forward requests.", 2, 'gateway', "n't forward requests"],
    ["The gateway won't forward requests.", 2, 'gateway', "n't forward requests"],
    ['No request shall be dropped.', 2, 'request', 'be dropped'],
    ['None of the requests shall be dropped.', 2, 'requests', 'be dropped'],
    ['Neither replica shall be promoted.', 2, 'replica', 'be promoted'],
  ] as const)('%s', async (line, tier, systemName, systemResponse) => {
    const r = await ok(line)
    expect(r.negated).toBe(true)
    expect(r.tier).toBe(tier)
    expect(r.slots.systemName).toBe(systemName)
    expect(r.slots.systemResponse).toBe(systemResponse)
  })

  it.each([
    ['While offline, no request shall be dropped.', 'request'],
    // Base's subject for the comma-less form, kept as base parsed it.
    ['While offline no request shall be dropped.', 'offline no request'],
    ['When a request arrives no response shall be cached.', 'response'],
  ] as const)('a negating determiner that opens the main clause still sets it — %s', async (line, systemName) => {
    const r = await ok(line)
    expect(r.negated).toBe(true)
    expect(r.slots.systemName).toBe(systemName)
  })

  it('a negation in the trigger clause never set it, and still does not', async () => {
    const r = await ok('When a request is not authorized, the gateway shall be notified.')
    expect(r.negated).toBe(false)
    expect(r.slots.trigger).toBe('a request is not authorized')
  })
})

describe('AC-2-3: a negation inside the subject or a comma-less lead does not set `negated`', () => {
  // wink's negation scope runs from the negator to the next punctuation, so a `not`/`no` left
  // of the modal flags the modal and the response when no comma intervenes. Only a negator that
  // OPENS the main clause ("No request shall …", "None of …", "…, no request shall …") governs
  // the modal; one inside a relative clause, a prepositional phrase or a leading clause does not.
  it.each([
    ['Users who are not admins shall be able to view logs.', 'admins'],
    ['A request with no body shall be rejected.', 'body'],
    ['Records with no owner shall be archived.', 'owner'],
    ['While the user is not signed in the session store shall be cleared.', 'session store'],
    ['When no user is signed in the session store shall be cleared.', 'session store'],
    ['If no user is signed in then the session store shall be cleared.', 'session store'],
    ['If the token is not valid then the gateway shall be notified.', 'gateway'],
    ['When a request is not authorized the gateway shall be notified.', 'gateway'],
  ] as const)('%s', async (line, systemName) => {
    const r = await ok(line)
    expect(r.tier).toBe(2)
    expect(r.negated).toBe(false)
    expect(r.slots.systemName).toBe(systemName)
  })

  it('the comma and comma-less forms of one requirement agree on polarity', async () => {
    const bare = await ok('While the user is not signed in the session store shall be cleared.')
    const comma = await ok('While the user is not signed in, the session store shall be cleared.')
    expect(bare.negated).toBe(comma.negated)
    expect(bare.slots).toEqual(comma.slots)
  })

  it.each([
    'Packets not matching a rule shall, by default, be dropped.',
    'Accounts without MFA shall, on login, be challenged.',
    'Records with no owner shall, nightly, be archived.',
    'Requests not cached by the edge shall, on arrival, be forwarded to the origin.',
    'The gateway rather than not the proxy shall, always, forward requests.',
  ])('never sets it where base left it clear (a comma after the modal) — %s', async (line) => {
    expect((await ok(line)).negated).toBe(false)
  })
})

describe('AC-2-3 round 2: every negation base read as governing the modal keeps `negated`', () => {
  // The round-1 narrowing cleared these, each a real prohibition base stored as one, so a real
  // FND_CONTRADICTION disappeared and consistent pairs gained a fabricated one. Every row is
  // pinned at base's parse: same slots, `negated: true`.
  it.each([
    // `None of` opens the main clause behind a comma-lead Tier 2 binds: `none of` sits in the
    // lead slot text, outside the subject chunk, yet it is the subject's quantifier.
    ['While offline, none of the requests shall be dropped.', 'requests'],
    ['In normal operation, none of the valves shall open.', 'valves'],
    ['Where encryption is enabled, none of the keys shall be logged.', 'keys'],
    // `Not <quantifier>` opens the subject the way No/None/Neither do and scopes over the modal.
    ['Not all requests shall be logged.', 'requests'],
    ['Not every request shall be logged.', 'request'],
    ['Not a single packet shall be lost.', 'single packet'],
    ['Not one request shall be dropped.', 'one request'],
    ['Not any request shall be dropped.', 'request'],
    ['Not all of the requests shall be logged.', 'requests'],
    ['While offline, not all requests shall be logged.', 'requests'],
    // A comma-less lead ending on a verb particle ("signs in") that wink tags ADP: the negator
    // after it opens the main clause, exactly as it does after the comma.
    ['When the user signs in no token shall be reissued.', 'token'],
    ['When the user signs in, no token shall be reissued.', 'token'],
    ['When the user logs in no session shall be reused.', 'session'],
    ['When the user logs in, no session shall be reused.', 'session'],
    ['While the operator is logged in no session shall expire.', 'session'],
    ['When the user logs out no session shall persist.', 'session'],
    ['When the pump starts up no valve shall be opened.', 'valve'],
    ['When a device plugs in no driver shall be reloaded.', 'driver'],
    ['When the user logs in neither replica shall be promoted.', 'replica'],
    ['When the user logs in none of the sessions shall be reused.', 'sessions'],
    ['When the user logs in, none of the sessions shall be reused.', 'sessions'],
    ['When the button is pressed no request shall be sent.', 'request'],
    // A negator inside the verb group, or a negating adverbial, before the main verb.
    ['The gateway shall be never notified.', 'gateway'],
    ['The gateway shall be no longer notified.', 'gateway'],
    ['The gateway shall be not able to drop requests.', 'gateway'],
    ['The gateway shall be neither notified nor logged.', 'gateway'],
    ['The gateway shall, under no circumstances, drop requests.', 'gateway'],
    ['The gateway shall, at no time, drop requests.', 'gateway'],
    ['Requests shall, under no circumstances, be dropped.', 'Requests'],
    ['The gateway shall be notified of no requests.', 'gateway'],
    // A parenthetical closed before the negator is not part of the response's phrase.
    ['The gateway shall, under load, not drop requests.', 'gateway'],
  ] as const)('%s', async (line, systemName) => {
    const r = await ok(line)
    expect(r.negated).toBe(true)
    expect(r.slots.systemName).toBe(systemName)
  })

  it('a comma alone never flips polarity after a verb particle', async () => {
    for (const [bare, comma] of [
      [
        'When the user signs in no token shall be reissued.',
        'When the user signs in, no token shall be reissued.',
      ],
      [
        'When the user logs in no session shall be reused.',
        'When the user logs in, no session shall be reused.',
      ],
    ] as const) {
      expect((await ok(bare)).negated).toBe((await ok(comma)).negated)
    }
  })

  it.each([
    // The object of a preposition still names a thing, not a prohibition.
    'A request with no body shall be rejected.',
    // A copula before `not a`: the lead's predicate, not the subject's quantifier.
    'Users who are not admins shall be able to view logs.',
    'While the user is not a guest the session shall be kept.',
    // A `not` after a noun in the response modifies that noun's phrase.
    'Atoms shall be scoped by vocabulary id, not by a normalized string.',
    'The gateway shall log requests, not responses.',
  ])('a negator that does not open the subject or the verb group still leaves it clear — %s', async (line) => {
    expect((await ok(line)).negated).toBe(false)
  })
})
