/**
 * Normalization deletes only punctuation that carries no identity (spec 007 AC-2-4).
 *
 * ## The merges these reproducers pin
 *
 * `normalize` used to lowercase and then delete everything outside `[a-z0-9\s]`. That is a
 * MERGE rule for any text outside ASCII: `العربية` and `日本語` both became the empty body, `α`
 * and `β` vanished from "valve α" and "valve β", the Unicode minus in `−5 °C` was dropped so it
 * read as `5 °C`, and lowercasing made `100 Mbps` (megabits) and `100 MBps` (megabytes) one
 * token. A merged GUARD puts two requirements into one context group, so two mutually exclusive
 * conditions can prove a conflict the document does not contain.
 *
 * The same rule sat in `normalizeScope`, where it merged `α valve controller` with
 * `β valve controller` into one system namespace.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import { atomize, normalize, normalizeScope } from './atomize.ts'

const TS = '2026-01-01T00:00:00.000Z'

const docOf = async (sentences: readonly string[]) => {
  const requirements: Record<string, unknown> = {}
  for (const [i, sentence] of sentences.entries()) {
    const parsed = await parseLine(sentence)
    if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
    const id = `0b0b0b0b-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
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

const guard = (text: string) => atomize({ kind: 'pre', text, systemName: 'plant' }).name
const resp = (text: string) => atomize({ kind: 'resp', text, systemName: 'plant' }).name

describe('AC-2-4 — each reproducer pair lands on two distinct atoms', () => {
  it('two non-Latin scripts', () => {
    expect(resp('log العربية')).not.toBe(resp('log 日本語'))
    expect(normalize('العربية')).not.toBe('')
    expect(normalize('日本語')).not.toBe('')
  })

  it('two Greek letters', () => {
    expect(guard('valve α is open')).not.toBe(guard('valve β is open'))
  })

  it('the Unicode minus sign', () => {
    expect(guard('the temperature is below −5 °C')).not.toBe(guard('the temperature is below 5 °C'))
    // It is the SAME sign as the ASCII hyphen-minus before a digit, which already spelled `minus`.
    expect(normalize('−5 °C')).toBe(normalize('-5 °C'))
  })

  it('unit-token case', () => {
    expect(guard('the link carries 100 Mbps')).not.toBe(guard('the link carries 100 MBps'))
    expect(guard('the link carries 100Mbps')).not.toBe(guard('the link carries 100MBps'))
  })

  it('the system scope keeps every script too', () => {
    expect(normalizeScope('α valve controller')).not.toBe(normalizeScope('β valve controller'))
    expect(normalizeScope('ゲートウェイ')).not.toBe(normalizeScope('认证服务'))
  })
})

describe('AC-2-4 — what normalization still does', () => {
  it('still drops identity-free punctuation and folds ordinary case', () => {
    expect(normalize('The Response-Cache, (warm)!')).toBe('response_cache_warm')
    expect(normalize('Grant ACCESS')).toBe(normalize('grant access'))
  })

  it('is idempotent over its own output, case-kept unit tokens included', () => {
    for (const text of ['100 MBps', '−5 °C', 'valve α', 'العربية', '100Mbps link']) {
      expect(normalize(normalize(text))).toBe(normalize(text))
    }
  })
})

describe('AC-2-4 — a merged guard no longer fabricates a contradiction', () => {
  it('"valve α" and "valve β" are two contexts', async () => {
    const report = await runCheck(
      await docOf([
        'While valve α is open, the plant controller shall start the pump.',
        'While valve β is open, the plant controller shall not start the pump.',
      ]),
    )
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.code)).toEqual([])
  })

  it('one guard in a non-Latin script still reaches the solver and proves a real conflict', async () => {
    // The positive control: the atom names now carry non-ASCII letters, and they must survive
    // the round trip through Z3 as ONE symbol, or the decide tier goes blind to these guards.
    const report = await runCheck(
      await docOf([
        'While valve α is open, the plant controller shall start the pump.',
        'While valve α is open, the plant controller shall not start the pump.',
      ]),
    )
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
  })
})
