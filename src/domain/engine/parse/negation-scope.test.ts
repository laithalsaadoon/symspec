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

  it('a negation in the trigger clause never set it, and still does not', async () => {
    const r = await ok('When a request is not authorized, the gateway shall be notified.')
    expect(r.negated).toBe(false)
    expect(r.slots.trigger).toBe('a request is not authorized')
  })
})
