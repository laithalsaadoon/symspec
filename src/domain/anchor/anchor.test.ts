/**
 * Tests for the anchor leaf: the intent and policy schemas.
 *
 * What these pin:
 *
 * 1. **Strictness.** An anchor is what the agent cannot change from inside the loop, so a
 *    typo'd field inside one is a hard failure, never a silently ignored key.
 * 2. **Identity is unique.** An intent id is what `intentRef` names, and a level id is what
 *    `assign` names. A duplicate makes either reference ambiguous, so the decode refuses it.
 * 3. **The record-key silent drop.** `assign` is keyed by intent id, and `Schema.Record(Key,
 *    …)` drops a bad key without an error (the trap `document.ts` documents). The negative
 *    case is asserted here, because `assign` is the second record in the format.
 * 4. **No materialized default.** The decoded anchor is exactly the authored one, so a hash
 *    over the decoded value and a hash over the file agree.
 */

import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { KEY_PATTERN } from '../requirements/document.ts'
import {
  DEFAULT_INTENT_KIND,
  INTENT_ID_PATTERN,
  INTENT_KINDS,
  Intent,
  intentKindOf,
  Policy,
  SHA256_HEX_PATTERN,
} from './anchor.ts'

const decodeWith =
  <S extends Schema.Top>(schema: S) =>
  (raw: unknown) =>
    Effect.runSync(
      Effect.result(
        Schema.decodeUnknownEffect(schema as never, { onExcessProperty: 'error' })(raw),
      ),
    ) as { _tag: 'Success'; success: S['Type'] } | { _tag: 'Failure'; failure: unknown }

const decodeIntent = decodeWith(Intent)
const decodePolicy = decodeWith(Policy)

const intent = (extra: Record<string, unknown> = {}) => ({
  intentVersion: 1,
  items: [
    { id: 'I1', text: 'The door stays closed while the train moves.' },
    { id: 'I2', text: 'Passengers can leave at a platform.', kind: 'goal', source: 'ops memo 4' },
  ],
  ...extra,
})

const policy = (extra: Record<string, unknown> = {}) => ({
  policyVersion: 1,
  levels: [{ id: 'safety', description: 'Loss of life.' }, { id: 'comfort' }],
  assign: { I1: 'safety', I2: 'comfort' },
  ...extra,
})

describe('Intent', () => {
  it('accepts a well-formed intent, and leaves an absent kind absent', () => {
    const r = decodeIntent(intent())
    expect(r._tag).toBe('Success')
    if (r._tag !== 'Success') return
    // No default is materialized: the decoded value is the authored value.
    expect(r.success).toEqual(intent())
    expect(Object.hasOwn(r.success.items[0] as object, 'kind')).toBe(false)
  })

  it('reads an absent kind as an obligation', () => {
    expect(DEFAULT_INTENT_KIND).toBe('obligation')
    expect(intentKindOf({ id: 'I1', text: 'x' })).toBe('obligation')
    expect(intentKindOf({ id: 'I1', text: 'x', kind: 'assumption' })).toBe('assumption')
  })

  it('carries an optional import provenance with a sha256', () => {
    const source = { importedFrom: 'parent/intent.json', sha256: 'a'.repeat(64) }
    expect(decodeIntent(intent({ source }))._tag).toBe('Success')
    expect(decodeIntent(intent({ source: { ...source, sha256: 'nothex' } }))._tag).toBe('Failure')
  })

  it('REJECTS a duplicate item id, naming it', () => {
    const r = decodeIntent(
      intent({
        items: [
          { id: 'I1', text: 'a' },
          { id: 'I1', text: 'b' },
        ],
      }),
    )
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') expect(String(r.failure)).toContain('I1')
  })

  it('REJECTS an unknown field inside an item, an unknown kind, empty text, and a bad id', () => {
    for (const item of [
      { id: 'I1', text: 'a', weight: 3 },
      { id: 'I1', text: 'a', kind: 'wish' },
      { id: 'I1', text: '' },
      { id: '42', text: 'a' },
      { id: 'has space', text: 'a' },
    ]) {
      expect(decodeIntent(intent({ items: [item] }))._tag, JSON.stringify(item)).toBe('Failure')
    }
  })

  it('REJECTS any other intentVersion', () => {
    for (const v of [0, 2, '1']) {
      expect(decodeIntent(intent({ intentVersion: v }))._tag, String(v)).toBe('Failure')
    }
  })

  it('keys intent ids on the requirement key format, so one grammar names both', () => {
    expect(INTENT_ID_PATTERN.source).toBe(KEY_PATTERN.source)
  })

  it('INTENT_KINDS is frozen', () => {
    expect(INTENT_KINDS).toEqual(['obligation', 'assumption', 'goal'])
  })
})

describe('Policy', () => {
  it('accepts a well-formed policy', () => {
    const r = decodePolicy(policy())
    expect(r._tag).toBe('Success')
    if (r._tag === 'Success') expect(r.success).toEqual(policy())
  })

  it('accepts the reserved admissibleAssumptionKinds list', () => {
    expect(decodePolicy(policy({ admissibleAssumptionKinds: ['sensor'] }))._tag).toBe('Success')
  })

  it('REJECTS a duplicate level id', () => {
    const r = decodePolicy(policy({ levels: [{ id: 'safety' }, { id: 'safety' }] }))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') expect(String(r.failure)).toContain('safety')
  })

  it('REJECTS an assignment to an undeclared level, naming it', () => {
    const r = decodePolicy(policy({ assign: { I1: 'catastrophic' } }))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') expect(String(r.failure)).toContain('catastrophic')
  })

  it('FAILS on a malformed assign key instead of dropping the entry (the record-key trap)', () => {
    const r = decodePolicy(policy({ assign: { 'not an id': 'safety' } }))
    expect(r._tag).toBe('Failure')
  })

  it('REJECTS an unknown field and any other policyVersion', () => {
    expect(decodePolicy(policy({ ranking: [] }))._tag).toBe('Failure')
    expect(decodePolicy(policy({ policyVersion: 2 }))._tag).toBe('Failure')
  })
})

describe('the sha256 format', () => {
  it('is 64 lowercase hex digits, with no prefix', () => {
    expect(SHA256_HEX_PATTERN.test('0'.repeat(64))).toBe(true)
    expect(SHA256_HEX_PATTERN.test(`sha256:${'0'.repeat(64)}`)).toBe(false)
    expect(SHA256_HEX_PATTERN.test('A'.repeat(64))).toBe(false)
    expect(SHA256_HEX_PATTERN.test('0'.repeat(63))).toBe(false)
  })
})
