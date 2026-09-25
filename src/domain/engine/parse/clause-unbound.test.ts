/**
 * Spec 007 AC-2-2: a line whose parse drops an unbound clause marker is refused, never stored.
 *
 * The rule is an OUTCOME post-condition on the parse the ladder already produced, not a matcher
 * over sentence shapes. After a Tier-1 or Tier-2 parse succeeds, the source words before the
 * modal that appear in no stored slot are the DROPPED SPAN. If that span holds an unbound marker
 * as whole words — Unless, Provided (that), In case, Except, Before, Until, Only if, Even if — the
 * stored requirement would hold in states the author excluded, so the line is `ERR_CLAUSE_UNBOUND`
 * naming the span.
 *
 * Because the rule reads only what was dropped, every form of the clause is covered alike:
 * bracketed, parenthesised, behind a tag or label, with a number spelled in words, or with
 * punctuation inside the subject that moves where Tier 2's subject chunk starts. And a marker
 * word that survives INTO a stored slot is never a refusal, whatever shape carried it there.
 */

import { describe, expect, it } from 'vitest'
import { type ParseErrorResult, type ParseOkResult, parseLine } from './result.ts'

const refused = async (line: string): Promise<ParseErrorResult> => {
  const r = await parseLine(line)
  if (r.outcome !== 'error' || r.code !== 'ERR_CLAUSE_UNBOUND') {
    throw new Error(`expected ERR_CLAUSE_UNBOUND for ${line}, got ${JSON.stringify(r)}`)
  }
  return r
}

const stored = async (line: string): Promise<ParseOkResult> => {
  const r = await parseLine(line)
  if (r.outcome !== 'ok') throw new Error(`expected ok for ${line}, got ${JSON.stringify(r)}`)
  return r
}

/** The span the refusal names: the first quoted string of its message. */
const namedSpan = (r: ParseErrorResult): string => /"([^"]*)"/.exec(r.error)?.[1] ?? ''

/** True when every bracket in `s` is closed by its partner, in order. */
const balanced = (s: string): boolean => {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const stack: string[] = []
  for (const ch of s) {
    if ('([{'.includes(ch)) stack.push(ch)
    else if (ch in pairs && stack.pop() !== pairs[ch]) return false
  }
  return stack.length === 0
}

describe('AC-2-2: a dropped unbound marker is refused with ERR_CLAUSE_UNBOUND', () => {
  it('the reproducer: refused, the dropped span named, nothing salvaged to store', async () => {
    const line = 'Unless the guard door is closed, the press controller shall not start the press.'
    const r = await refused(line)
    expect(namedSpan(r)).toBe('Unless the guard door is closed')
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
    [
      'Provided the guard door is closed, the press controller shall start the press.',
      'Provided the guard door is closed',
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
    [
      'Unless the guard door is closed the press controller shall start the press.',
      'Unless the guard door is closed',
    ],
  ])('each marker: %s', async (line, span) => {
    expect(namedSpan(await refused(line))).toBe(span)
  })

  it.each([
    // A bare noun or a number after "In case": the most natural form of the clause.
    'In case power fails, the UPS shall start the generator.',
    'In case sensors fail, the controller shall stop the pump.',
    'In case connectivity is lost, the app shall cache writes.',
    'In case two sensors disagree, the controller shall stop the pump.',
    // A measure phrase before the marker, spelled in words or in digits alike.
    'Five seconds before the press starts, the press controller shall sound the horn.',
    '5 seconds before the press starts, the press controller shall sound the horn.',
    'Two seconds before shutdown, the gateway shall flush its logs.',
    'Only minutes before shutdown, the gateway shall flush its logs.',
    'At all times except during maintenance, the gateway shall log requests.',
  ])('whatever words stand around the marker — %s', async (line) => {
    await refused(line)
  })

  it.each([
    // Punctuation inside the subject moves where Tier 2's subject chunk starts; the dropped
    // span then runs into the subject, and it still holds the marker.
    "Unless the door is shut, the operator's console shall stop.",
    'Unless the door is shut, PLC_1 shall stop.',
    'Unless the door is shut, the press_controller shall stop.',
    'Unless the door is shut, the press #3 shall stop.',
    'Unless the door is shut, the press controller v2.1 shall stop.',
    'Unless the door is shut, the I/O module shall stop.',
    'Unless the door is shut, the press/brake unit shall stop.',
    'Unless the door is shut, the "press" unit shall stop.',
    "Before startup, the operator's console shall load its config.",
  ])('punctuation inside the subject never hides the marker — %s', async (line) => {
    const r = await refused(line)
    expect(namedSpan(r)).toMatch(/^(Unless the door is shut|Before startup)/)
  })

  it.each([
    ['(1) Unless the guard door is closed, the press controller shall start the press.'],
    ['(a) Unless the guard door is closed, the press controller shall start the press.'],
    ['a) Unless the guard door is closed, the press controller shall start the press.'],
    ['• Unless the guard door is closed, the press controller shall start the press.'],
    ['> Unless the guard door is closed, the press controller shall start the press.'],
    ['[P1] Unless the guard door is closed, the press controller shall start the press.'],
    ['[SAFETY] Unless the guard door is closed, the press controller shall start the press.'],
    ['(P1) Unless the guard door is closed the press controller shall start the press.'],
    ['[P1] [Unless the guard door is closed] the press controller shall start the press.'],
    ['[Unless the guard door is closed] [P1] the press controller shall start the press.'],
    ['{Unless the guard door is closed} the press controller shall start the press.'],
    ['[[Unless the guard door is closed]] the press controller shall start the press.'],
    ['([Unless the guard door is closed]) the press controller shall start the press.'],
    ['"Unless the guard door is closed", the press controller shall start the press.'],
  ])('brackets, tags and list markers around the clause: named clean — %s', async (line) => {
    const span = namedSpan(await refused(line))
    expect(span).toContain('Unless the guard door is closed')
    expect(balanced(span), span).toBe(true)
  })

  it.each([
    'Note: Unless the guard door is closed, the press controller shall start the press.',
    'Safety: Unless the guard door is closed, the press controller shall start the press.',
    'Safety requirement Unless the guard door is closed, the press controller shall not start the press.',
    'SAFETY REQUIREMENT Unless the guard door is closed, the press controller shall start the press.',
    'Unless: the guard door is closed, the press controller shall start the press.',
    'Unless, of course, the guard door is closed, the press controller shall start the press.',
    '[P1] Before startup, the gateway shall load its config.',
    '(ii) Before startup, the gateway shall load its config.',
  ])('labels and punctuation after the marker never hide it — %s', async (line) => {
    await refused(line)
  })

  it.each([
    [
      'Unless the door (north) is closed, the press controller shall stop the press.',
      'Unless the door (north) is closed',
    ],
    [
      'Unless the door [north] is closed, the press controller shall stop the press.',
      'Unless the door [north] is closed',
    ],
    [
      'Unless the door {north} is closed, the press controller shall stop the press.',
      'Unless the door {north} is closed',
    ],
    [
      '(Unless the door (north) is closed) the press controller shall stop the press.',
      'Unless the door (north) is closed',
    ],
    [
      "Unless the door is 'closed', the press controller shall stop the press.",
      "Unless the door is 'closed'",
    ],
    [
      'Unless the door is "closed", the press controller shall stop the press.',
      'Unless the door is closed',
    ],
    [
      'Unless the "north" door is closed, the press controller shall stop the press.',
      'Unless the north door is closed',
    ],
    [
      "Unless the 'north door is closed, the press controller shall stop the press.",
      'Unless the north door is closed',
    ],
    [
      "Unless the operator's door isn't closed, the press controller shall stop the press.",
      "Unless the operator's door isn't closed",
    ],
  ] as const)('the whole dropped clause is named, with no unpaired bracket or quote — %s', async (line, span) => {
    // The message wraps the span in double quotes, so the name carries none of its own. A
    // bracket or single quote is kept when its partner is in the name too (a closer right
    // after the clause's last word joins it), and dropped when it has none. An apostrophe
    // inside a word is not a quote.
    const r = await refused(line)
    expect(r.error.startsWith(`"${span}" `), r.error).toBe(true)
    expect(balanced(span)).toBe(true)
  })

  it('a word of the clause recurring in a slot does not cover the marker', async () => {
    const r = await refused(
      'Unless the press is closed, the press controller shall stop the press.',
    )
    expect(namedSpan(r)).toBe('Unless the press is closed')
  })

  it('the same marker surviving in the response does not cover the dropped one', async () => {
    const r = await refused(
      'Unless the guard door is closed, the press controller shall stop the press unless overridden.',
    )
    expect(namedSpan(r)).toBe('Unless the guard door is closed')
  })

  it('a base fold that keeps clause content but drops the marker is refused', async () => {
    // Base stored {systemName: "fire the sprinkler controller"}: "fire" survived, "In case of"
    // did not, so the stored requirement holds whether or not there is a fire.
    expect(
      namedSpan(await refused('In case of fire the sprinkler controller shall open the valves.')),
    ).toBe('In case of')
  })

  it.each([
    'In case studies, the analyst shall cite sources.',
    'Until dates of expired contracts shall be archived.',
    // Tier 2 drops the participle "provided" from the subject chunk, so it is in no slot.
    'The provided token shall be validated.',
    'Provided tokens shall be validated.',
  ])('by decision, a dropped marker used as an ordinary word is refused too — %s', async (line) => {
    // Loud and recoverable beats silent: the author restates the line, and nothing is stored
    // stronger than written.
    await refused(line)
  })
})

describe('AC-2-2 controls: a line that drops no marker keeps its base parse', () => {
  it.each([
    'Unless the door is closed.',
    'Before deploying, read the runbook.',
    'Until startup completes the gateway is unavailable.',
  ])('no modal: still skipped — %s', async (line) => {
    expect((await parseLine(line)).outcome).toBe('skipped')
  })

  it.each([
    ['Unless overridden the press shall stop.', 'Unless overridden the press'],
    ['(Before startup) the gateway shall load its config.', '(Before startup) the gateway'],
  ] as const)('the marker word survives into systemName — %s', async (line, systemName) => {
    expect((await stored(line)).slots.systemName).toBe(systemName)
  })

  it.each([
    ['Until-dates shall be required.', 'dates'],
    ['The until-date field shall be required.', 'date field'],
    ['Unless-clauses shall be flagged.', 'clauses'],
    ['Except-list entries shall be skipped.', 'list entries'],
  ] as const)('a hyphenated compound is not the marker word — %s', async (line, systemName) => {
    expect((await stored(line)).slots.systemName).toBe(systemName)
  })

  it.each([
    [
      "While the door isn't open unless overridden, the guard shall be locked.",
      'preCondition',
      "the door is n't open unless overridden",
    ],
    [
      "When the door can't open unless overridden, the guard shall be locked.",
      'trigger',
      "the door ca n't open unless overridden",
    ],
    [
      'While the door cannot open unless overridden, the guard shall be locked.',
      'preCondition',
      'the door can not open unless overridden',
    ],
    [
      "While the door isn't open unless overridden, users shall be able to lock the guard.",
      'preCondition',
      "the door is n't open unless overridden",
    ],
    [
      "When the operator's badge isn't revoked unless expired, the door shall be opened.",
      'trigger',
      "the operator 's badge is n't revoked unless expired",
    ],
  ] as const)('a bound clause Tier 2 re-tokenised keeps its marker, stored — %s', async (line, slot, text) => {
    // Tier 2 splits contractions ("isn't" → "is n't", "cannot" → "can not"), so the stored
    // slot is no longer a contiguous run of source words. The marker word is still IN that
    // slot, so D1 forbids a refusal: only the word-membership fallback in `cover` sees it.
    const r = await stored(line)
    expect(r.slots[slot]).toBe(text)
  })

  it('a marker inside a bound clause survives into that slot', async () => {
    const r = await stored('When the door opens before the press stops, the press shall halt.')
    expect(r.slots.trigger).toBe('the door opens before the press stops')
  })

  it('a trailing clause stays in the response, as before', async () => {
    const r = await stored('The press controller shall stop the press unless overridden.')
    expect(r.slots.systemResponse).toBe('stop the press unless overridden')
  })

  it('a dropped lead with no marker is inert decoration, as before', async () => {
    const r = await stored('(1) The password store shall be encrypted at rest.')
    expect(r.slots.systemName).toBe('password store')
  })

  it('a compound line keeps its compound error', async () => {
    const r = await parseLine(
      'Unless the guard door is closed, the press controller shall stop the press and sound the horn.',
    )
    expect(r.outcome).toBe('error')
    if (r.outcome === 'error') expect(r.code).toBe('ERR_PARSE_COMPOUND')
  })
})
