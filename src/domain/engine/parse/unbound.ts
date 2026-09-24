/**
 * The unbound-leading-clause post-condition (spec 007 AC-2-2).
 *
 * Tier 2 pivots on the modal, takes the noun chunk to its left as the subject, and binds the
 * text before that chunk only when `classifyLeadingClause` recognises its keyword (While, When,
 * If, Where and their synonyms). Anything else it drops, and the requirement is stored from the
 * main clause alone. For most dropped text that is harmless decoration (`(1)`, `•`, `[P1]`). For
 * a clause that CONDITIONS the requirement — "Unless the guard door is closed, the press
 * controller shall not start the press" — it is not: the stored requirement holds always, is
 * stronger than the one written, and fabricates conflicts downstream.
 *
 * This module is a check on a parse that already happened, not a second parser. It reads the
 * tokens Tier 2 recorded as dropped ({@link Tier2Ok.droppedLead}) — text that by construction
 * sits in no stored slot — and reports the clause only when all of these hold:
 *
 * - an unbound marker opens the dropped text, behind nothing but decoration: list numbers and
 *   letters (`(1)`, `a)`), one-word tags (`[P1]`, `(SAFETY)`), labels (`Note:`), bullets, and
 *   opening brackets or quotes;
 * - the marker is a whole word, followed by a word or by `,` / `:` / `;` — so "Until-dates" is a
 *   compound, and a bare "Until" before "dates shall …" is a noun modifier, not a clause;
 * - `In case` is the conjunction: followed by `of` or by a determiner or pronoun opening a clause
 *   ("In case the power fails"), not by a noun it compounds with ("In case studies");
 * - the clause has content, and it ENDS inside the dropped text: at a comma/colon/semicolon, at
 *   the bracket or quote that opened it, or — with no punctuation at all — exactly where a fresh
 *   subject noun phrase begins ({@link DroppedLead.subjectOpensCleanly}). Otherwise the clause
 *   runs on into the subject: either part of it is already in `systemName` (base's "fire the
 *   sprinkler controller"), which base's parse keeps, or the marker word was modifying a noun the
 *   chunk completes ("Until dates in the form").
 *
 * There is deliberately no "does the content appear in a slot anyway" test: dropped text is in
 * no slot, and a substring match ("Unless armed, the alarm shall stay armed") would only find a
 * coincidence and store the requirement without its condition.
 *
 * Tier 1 never drops text (its bare main clause keeps a lead inside `systemName`), so a line Tier
 * 1 stored keeps its base parse, as does any line with no modal: it was never going to be stored.
 */

import type { DroppedLead, Tier2Ok, WinkToken } from './tier2.ts'
import { joinTokens } from './tier2.ts'

/** The markers that open a clause no EARS slot binds, as token sequences. `Provided` needs its
 * `that`: bare "Provided tokens" is a participle. */
const MARKERS: readonly (readonly string[])[] = [
  ['unless'],
  ['provided', 'that'],
  ['in', 'case'],
  ['except'],
  ['before'],
  ['until'],
  ['only', 'if'],
  ['even', 'if'],
]

/**
 * A run of decoration, as {@link joinTokens} renders it: one-word bracket tags (`( 1)`, `[ P1 ]`),
 * list labels (`a)`, `ii.`), `Word:` labels, and single bullets, openers or quotes.
 */
const DECORATION =
  /^(?:\s*(?:[[({]\s*[\p{L}\p{N}_-]+\s*[\])}]|[\p{L}\p{N}]{1,4}\s*[.)]|\p{L}+\s*:|[[({"'•>*·–—-]))*\s*$/u

const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])
const CLAUSE_PUNCT = new Set([',', ':', ';'])

const isWord = (t: WinkToken): boolean => /[\p{L}\p{N}]/u.test(t.value)

/** The marker starting at token `i`, or `undefined`. */
const markerAt = (tokens: readonly WinkToken[], i: number): readonly string[] | undefined =>
  MARKERS.find((m) => m.every((w, k) => tokens[i + k]?.value.toLowerCase() === w))

/**
 * The leading clause a Tier-2 parse dropped without binding, as the author wrote it (brackets,
 * quotes and trailing punctuation removed), or `undefined` when the parse lost no condition.
 */
export function unboundLeadingClause(ok: Tier2Ok): string | undefined {
  const dropped: DroppedLead | undefined = ok.droppedLead
  if (dropped === undefined) return undefined
  const tokens = dropped.tokens

  const at = tokens.findIndex((_, i) => markerAt(tokens, i) !== undefined)
  if (at < 0) return undefined
  const marker = markerAt(tokens, at)!
  const prefix = joinTokens(tokens.slice(0, at))
  if (!DECORATION.test(prefix)) return undefined

  const next = tokens[at + marker.length]
  if (next === undefined || !(isWord(next) || CLAUSE_PUNCT.has(next.value))) return undefined
  if (
    marker[0] === 'in' &&
    next.value.toLowerCase() !== 'of' &&
    next.pos !== 'DET' &&
    next.pos !== 'PRON'
  ) {
    return undefined
  }

  // The clause ends at the first bracket (or, behind an opening quote, the quote) that closes
  // something the clause itself did not open.
  const quoted = prefix.includes('"')
  let depth = 0
  let end = tokens.length
  let closed = false
  for (let i = at + marker.length; i < tokens.length; i++) {
    const v = tokens[i]!.value
    if (OPENERS.has(v)) depth++
    else if (CLOSERS.has(v) && depth > 0) depth--
    else if (CLOSERS.has(v) || (v === '"' && quoted && depth === 0)) {
      end = i
      closed = true
      break
    }
  }
  let clause = tokens.slice(at, end)
  while (clause.length > 0 && CLAUSE_PUNCT.has(clause.at(-1)!.value)) {
    clause = clause.slice(0, -1)
    closed = true
  }

  if (!clause.slice(marker.length).some(isWord)) return undefined
  if (!closed && !dropped.subjectOpensCleanly) return undefined
  return joinTokens(clause)
}
