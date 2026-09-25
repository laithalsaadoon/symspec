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
 * The same rule deleted every symbol: `$` and `€`, the `#` and `+` of `C#` and `C++`, `%`, and
 * every emoji, so "the invoice currency is $" and "… €" were one guard. It sat in
 * `normalizeScope` too, where it merged `α valve controller` with `β valve controller`, and
 * `C# compiler` with `C++ compiler`, into one system namespace.
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

  it('every dash that leads a number is the same minus sign', () => {
    // A word processor substitutes an en dash for a typed leading minus, and CJK input methods
    // produce the fullwidth hyphen-minus. Deleted as punctuation, `–20 °C` read as `20 °C`, so two
    // exclusive guards shared one atom.
    for (const dash of [
      '‐', // hyphen
      '‑', // non-breaking hyphen
      '‒', // figure dash
      '–', // en dash
      '—', // em dash
      '―', // horizontal bar
      '﹣', // small hyphen-minus
      '－', // fullwidth hyphen-minus
    ]) {
      const code = `U+${dash.codePointAt(0)?.toString(16).toUpperCase()}`
      expect(normalize(`${dash}20 °C`), code).toBe(normalize('-20 °C'))
      expect(guard(`the temperature reaches ${dash}20 °C`), code).not.toBe(
        guard('the temperature reaches 20 °C'),
      )
      // Still a SIGN only: between two numbers or inside a word it stays a separator.
      expect(normalize(`10${dash}20`), code).toBe('10_20')
      expect(normalize(`de${dash}energize`), code).toBe('de_energize')
    }
  })

  it('unit-token case', () => {
    expect(guard('the link carries 100 Mbps')).not.toBe(guard('the link carries 100 MBps'))
    expect(guard('the link carries 100Mbps')).not.toBe(guard('the link carries 100MBps'))
  })

  it('case is kept for UNIT tokens only, never for an ordinary word after a number', () => {
    // A unit is where case is identity (`mW` milliwatt, `MW` megawatt); a word is not. Keeping
    // the case of EVERY token after a numeral split `3 Times` from `3 times`, so "retry 3 Times"
    // plus "shall not retry 3 times" stopped being a contradiction.
    expect(resp('retry 3 Times')).toBe(resp('retry 3 times'))
    expect(resp('close the valve within 5 Seconds')).toBe(resp('close the valve within 5 seconds'))
    expect(resp('run 2 Drains')).toBe(resp('run 2 drains'))
    expect(resp('retry 3TIMES')).toBe(resp('retry 3times'))
    expect(guard('the output is 5 mW')).not.toBe(guard('the output is 5 MW'))
    expect(guard('the probe reads 3 ms')).not.toBe(guard('the probe reads 3 Ms'))
    expect(guard('the store holds 8 GiB')).not.toBe(guard('the store holds 8 Gib'))
  })

  it('identity-bearing symbols: currency, C# / C++, emoji, percent', () => {
    expect(guard('the invoice currency is $')).not.toBe(guard('the invoice currency is €'))
    expect(guard('the project language is C#')).not.toBe(guard('the project language is C++'))
    expect(guard('the project language is C#')).not.toBe(guard('the project language is C'))
    expect(guard('the status light shows 🔴')).not.toBe(guard('the status light shows 🟢'))
    expect(guard('the load exceeds 50%')).not.toBe(guard('the load exceeds 50'))
    expect(guard('the load exceeds 50%')).not.toBe(guard('the load exceeds 50‰'))
    expect(guard('the fee is 5 $')).not.toBe(guard('the fee is 5 £'))
  })

  it('the system scope keeps identity-bearing symbols too', () => {
    expect(normalizeScope('C# compiler')).not.toBe(normalizeScope('C++ compiler'))
    expect(normalizeScope('🚀')).not.toBe(normalizeScope('🛰'))
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

  it('drops quotes, brackets, dashes, sentence marks and separators in any script', () => {
    expect(normalize('"quoted" and “curly” and «guillemets»')).toBe(
      'quoted_and_curly_and_guillemets',
    )
    expect(normalize("the operator's console")).toBe('operator_s_console')
    expect(normalize('**bold** `code` input/output a|b a\\b')).toBe(
      'bold_code_input_output_a_b_a_b',
    )
    expect(normalize('日本語。')).toBe(normalize('日本語'))
    expect(normalize('ready… ¿listo? ¡sí!')).toBe('ready_listo_sí')
  })

  it('a kept symbol is its own token, so spacing around it does not split a phrase', () => {
    expect(normalize('$5')).toBe(normalize('$ 5'))
    expect(normalize('50%')).toBe(normalize('50 %'))
    expect(normalize('C#')).toBe('c_#')
    expect(normalize('5°C')).toBe(normalize('5 °C'))
    expect(normalize('5 °C')).not.toBe(normalize('5 °c'))
  })

  it('is idempotent over its own output, case-kept unit tokens included', () => {
    for (const text of [
      '100 MBps',
      '−5 °C',
      'valve α',
      'العربية',
      '100Mbps link',
      'C++ and C#',
      '$5 or €5',
      '🔴 light ❤️',
    ]) {
      expect(normalize(normalize(text))).toBe(normalize(text))
    }
  })
})

describe('AC-2-4 — a dash-signed guard is not the unsigned guard', () => {
  it('"reaches –20 degrees celsius" and "reaches 20 degrees celsius" are two conditions', async () => {
    for (const dash of ['–', '－']) {
      const report = await runCheck(
        await docOf([
          `When the ambient temperature reaches ${dash}20 degrees celsius, the heater controller shall start the heater.`,
          'When the ambient temperature reaches 20 degrees celsius, the heater controller shall not start the heater.',
        ]),
      )
      const errors = report.findings.filter((f) => f.severity === 'error').map((f) => f.code)
      expect(errors, `U+${dash.codePointAt(0)?.toString(16)}`).toEqual([])
    }
  })
})

describe('AC-2-4 — a word after a number still folds, so its conflict is still proved', () => {
  const MAILER = 'When the batch closes, the mailer shall'
  it('"retry 3 Times" plus "shall not retry 3 times" is FND_CONTRADICTION', async () => {
    const report = await runCheck(
      await docOf([`${MAILER} retry 3 Times.`, `${MAILER} not retry 3 times.`]),
    )
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
  })

  it('"within 5 Seconds" plus "shall not ... within 5 seconds" is FND_CONTRADICTION', async () => {
    const report = await runCheck(
      await docOf([
        `${MAILER} close the valve within 5 Seconds.`,
        `${MAILER} not close the valve within 5 seconds.`,
      ]),
    )
    expect(report.findings.map((f) => f.code)).toContain('FND_CONTRADICTION')
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

  for (const [name, a, b] of [
    ['$ and €', 'the invoice currency is $', 'the invoice currency is €'],
    ['C# and C++', 'the project language is C#', 'the project language is C++'],
    ['🔴 and 🟢', 'the status light shows 🔴', 'the status light shows 🟢'],
  ] as const) {
    it(`"${name}" are two contexts`, async () => {
      const report = await runCheck(
        await docOf([
          `While ${a}, the billing service shall apply the surcharge.`,
          `While ${b}, the billing service shall not apply the surcharge.`,
        ]),
        { temporal: {} },
      )
      expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.code)).toEqual([])
    })
  }

  it('a symbol-bearing guard still reaches every solver tier and proves a real conflict', async () => {
    const report = await runCheck(
      await docOf([
        'While the invoice currency is €, the billing service shall apply the surcharge.',
        'While the invoice currency is €, the billing service shall not apply the surcharge.',
      ]),
      { temporal: {} },
    )
    const codes = report.findings.map((f) => f.code)
    expect(codes).toContain('FND_CONTRADICTION')
    expect(codes).toContain('FND_TEMPORAL_CONTRADICTION')
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
