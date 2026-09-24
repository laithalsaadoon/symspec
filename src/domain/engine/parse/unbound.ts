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
 * text Tier 2 recorded as dropped ({@link Tier2Ok.droppedLead}) — text that by construction sits
 * in no stored slot — and reports the clause only when both of these hold:
 *
 * - the dropped text opens with an unbound marker, as plain text or as the first thing inside a
 *   leading `[…]` / `(…)` group, and the marker is a whole word followed by a space — so
 *   "Until-dates" and "Unless-clauses" are compounds, not clauses;
 * - something follows the marker. "Until dates shall be required" drops only the word "Until",
 *   which modifies the subject, and "Only if armed the alarm shall sound" drops "Only if" while
 *   "armed" stays in the subject: in neither is a condition's content missing.
 *
 * There is deliberately no "does the content appear in a slot anyway" test: dropped text is in
 * no slot, and a substring match ("Unless armed, the alarm shall stay armed") would only find a
 * coincidence and store the requirement without its condition.
 *
 * Tier 1 never drops text (its bare main clause keeps a lead inside `systemName`), so a line Tier
 * 1 stored keeps its base parse, as does any line with no modal: it was never going to be stored.
 */

import type { Tier2Ok } from './tier2.ts'

/** The markers that open a clause no EARS slot binds. `Provided` needs its `that`: bare
 * "Provided tokens" is a participle. */
const UNBOUND_MARKER =
  /^(?<open>[[(]\s*)?(?<marker>unless|provided\s+that|in\s+case|except|before|until|only\s+if|even\s+if)\s/i

/** The bracket that closes each opener. */
const CLOSER: Readonly<Record<string, string>> = { '[': ']', '(': ')' }

/**
 * The leading clause a Tier-2 parse dropped without binding, as the author wrote it (brackets and
 * trailing punctuation removed), or `undefined` when the parse lost no condition.
 */
export function unboundLeadingClause(ok: Tier2Ok): string | undefined {
  const lead = ok.droppedLead
  if (lead === undefined) return undefined
  const m = UNBOUND_MARKER.exec(lead)
  if (!m?.groups?.marker) return undefined

  // A bracketed clause ends at its closing bracket; a plain one runs to the subject.
  const open = m.groups.open?.trim()
  const afterOpen = lead.slice(m.groups.open?.length ?? 0)
  const close = open !== undefined ? afterOpen.indexOf(CLOSER[open]!) : -1
  const clause = (close >= 0 ? afterOpen.slice(0, close) : afterOpen)
    .replace(/[\s,;:)\]]+$/, '')
    .trim()

  const content = clause.slice(m.groups.marker.length)
  return /[\p{L}\p{N}]/u.test(content) ? clause : undefined
}
