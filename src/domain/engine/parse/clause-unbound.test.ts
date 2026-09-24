/**
 * Spec 007 AC-2-2: a leading clause no EARS slot binds is refused, never dropped.
 *
 * Tier 2 takes the noun chunk left of the modal as the subject and hands the text before it to
 * `classifyLeadingClause`. When that text is an `Unless` / `Provided that` / `In case` / `Except`
 * / `Before` / `Until` / `Only if` / `Even if` clause, nothing binds it, and the requirement was
 * stored from the main clause alone: stronger than the one written. The check is a
 * POST-CONDITION on that parse, so it fires exactly when the clause's content is missing from
 * every stored slot, and the controls pin every neighbouring shape at its base parse:
 *
 * - no modal: still `skipped`, because there is no requirement to store;
 * - the clause folded into a slot (Tier 1's bare main clause keeps the whole lead in
 *   `systemName`): stored as before;
 * - the marker word used as an ordinary word ("The provided token", "Until dates"): no clause.
 */

import { describe, expect, it } from 'vitest'
import { type ParseErrorResult, type ParseOkResult, parseLine } from './result.ts'

const refused = async (line: string): Promise<ParseErrorResult> => {
  const r = await parseLine(line)
  if (r.outcome !== 'error')
    throw new Error(`expected an error for ${line}, got ${JSON.stringify(r)}`)
  return r
}

const stored = async (line: string): Promise<ParseOkResult> => {
  const r = await parseLine(line)
  if (r.outcome !== 'ok') throw new Error(`expected ok for ${line}, got ${JSON.stringify(r)}`)
  return r
}

describe('AC-2-2: an unbound leading clause is refused with ERR_CLAUSE_UNBOUND', () => {
  it('the reproducer: refused, the clause named, nothing salvaged to store', async () => {
    const line = 'Unless the guard door is closed, the press controller shall not start the press.'
    const r = await refused(line)
    expect(r.code).toBe('ERR_CLAUSE_UNBOUND')
    expect(r.error).toContain('"Unless the guard door is closed"')
    expect(r.error).toContain(line)
    // A partial or a proposed op is a requirement without its condition by another route.
    expect(r.partial).toBeUndefined()
    expect(r.proposedOps).toBeUndefined()
    expect(r.suggestions.length).toBeGreaterThan(0)
  })

  it.each([
    [
      'Provided that the guard door is closed, the press controller shall start the press.',
      'Provided that the guard door is closed',
    ],
    ['In case of fire, the sprinkler controller shall open the valves.', 'In case of fire'],
    [
      'In case the guard door opens, the press controller shall stop the press.',
      'In case the guard door opens',
    ],
    ['Except during maintenance, the gateway shall log requests.', 'Except during maintenance'],
    ['Before startup, the gateway shall load its config.', 'Before startup'],
    [
      'Until the operator acknowledges the alarm, the siren shall sound.',
      'Until the operator acknowledges the alarm',
    ],
    ['Only if armed, the alarm shall sound.', 'Only if armed'],
    [
      'Even if the network is down, the logger shall persist events.',
      'Even if the network is down',
    ],
    [
      'unless the guard door is closed, the press controller shall start the press.',
      'unless the guard door is closed',
    ],
  ])('each marker, with a comma: %s', async (line, clause) => {
    const r = await refused(line)
    expect(r.code).toBe('ERR_CLAUSE_UNBOUND')
    expect(r.error).toContain(`"${clause}"`)
  })

  it.each([
    [
      'Unless the guard door is closed the press controller shall start the press.',
      'Unless the guard door is closed',
    ],
    [
      'Before the press starts the press controller shall lock the guard door.',
      'Before the press starts',
    ],
    [
      'In case the guard door opens the press controller shall stop the press.',
      'In case the guard door opens',
    ],
  ])('comma-less, where Tier 2 cut the clause off the subject: %s', async (line, clause) => {
    const r = await refused(line)
    expect(r.code).toBe('ERR_CLAUSE_UNBOUND')
    expect(r.error).toContain(`"${clause}"`)
  })

  it.each([
    [
      '[Unless the guard door is closed] the press controller shall start the press.',
      'Unless the guard door is closed',
    ],
    [
      '(Unless the guard door is closed) the press controller shall start the press.',
      'Unless the guard door is closed',
    ],
    [
      '[Unless the guard door is closed], the press controller shall start the press.',
      'Unless the guard door is closed',
    ],
    [
      '[Provided that the guard door is closed] the press controller shall start the press.',
      'Provided that the guard door is closed',
    ],
    ['(Only if armed) the press controller shall be able to start the press.', 'Only if armed'],
    [
      '(Even if the network is down) the logger shall persist events.',
      'Even if the network is down',
    ],
    // The clause ends at its own closing bracket, not at whatever else Tier 2 dropped.
    [
      '[Unless the guard door is closed] [P1] the press controller shall start the press.',
      'Unless the guard door is closed',
    ],
  ])('as the content of a leading bracket group, named without the brackets: %s', async (line, clause) => {
    const r = await refused(line)
    expect(r.code).toBe('ERR_CLAUSE_UNBOUND')
    expect(r.error).toContain(`"${clause}"`)
    expect(r.error).not.toMatch(/Leading clause "[[(]|[\])]"/)
  })

  it('refused even when a word of the clause recurs in a slot by coincidence', async () => {
    // "armed" is in the response, but the condition "unless armed" is in no slot.
    const r = await refused('Unless armed, the alarm shall stay armed.')
    expect(r.code).toBe('ERR_CLAUSE_UNBOUND')
    expect(r.error).toContain('"Unless armed"')
  })
})

describe('AC-2-2 controls: every neighbouring shape keeps its base parse', () => {
  it.each([
    ['Unless , the gateway shall be notified.', 'gateway'],
    ['[Unless ] the press controller shall be notified.', 'press controller'],
  ])('a bare marker with nothing after it drops no condition, so it is stored as before — %s', async (line, systemName) => {
    expect((await stored(line)).slots.systemName).toBe(systemName)
  })

  it.each([
    'Before deploying, read the runbook.',
    'Unless the guard door is closed, stop the press.',
    'Unless the guard door is closed, the press controller is required to stop.',
    'Until further notice, keep the siren on.',
  ])('no modal: still skipped, never an error — %s', async (line) => {
    const r = await parseLine(line)
    expect(r.outcome).toBe('skipped')
  })

  it.each([
    ['Unless armed the alarm shall sound.', 'Unless armed the alarm'],
    ['Before startup the gateway shall load its config.', 'Before startup the gateway'],
    ['[Before startup] the gateway shall load its config.', '[Before startup] the gateway'],
    [
      '[Except during maintenance] the gateway shall log requests.',
      '[Except during maintenance] the gateway',
    ],
    ['Only if armed the alarm shall sound.', 'armed the alarm'],
  ])('the clause folded into a slot: stored as base stored it — %s', async (line, systemName) => {
    expect((await stored(line)).slots.systemName).toBe(systemName)
  })

  it.each([
    ['The provided token shall be validated.', 'token'],
    ['Provided tokens shall be validated.', 'tokens'],
    ['Provided credentials shall match the stored hash.', 'Provided credentials'],
    ['Until dates shall be required.', 'dates'],
    ['Until-dates shall be validated.', 'dates'],
    ['Except entries shall be skipped.', 'entries'],
    ['Except handlers shall log errors.', 'Except handlers'],
    ['Except-list entries shall be skipped.', 'list entries'],
    ['Unless-clauses shall be flagged.', 'clauses'],
    ['Before hooks shall run in order.', 'Before hooks'],
    ['Till drawers shall lock after each sale.', 'Till drawers'],
  ])('a marker word used as an ordinary word is no clause — %s', async (line, systemName) => {
    expect((await stored(line)).slots.systemName).toBe(systemName)
  })

  it('a trailing clause stays in the response, as before', async () => {
    const r = await stored(
      'The press controller shall start the press unless the guard door is closed.',
    )
    expect(r.slots.systemResponse).toBe('start the press unless the guard door is closed')
  })

  it('a compound line keeps its compound error', async () => {
    const r = await refused(
      'Unless the guard door is closed, the press controller shall start the press and log the start.',
    )
    expect(r.code).toBe('ERR_PARSE_COMPOUND')
  })
})
