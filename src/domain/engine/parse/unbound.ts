/**
 * The unbound-clause post-condition (spec 007 AC-2-2).
 *
 * EARS binds a leading clause to a slot only through its keyword (While, When, If, Where and
 * their synonyms). A clause opened by anything else — "Unless the guard door is closed, the press
 * controller shall not start the press" — binds to nothing, and the ladder stored the main clause
 * alone: a requirement that holds always, stronger than the one written, which fabricates
 * conflicts downstream.
 *
 * This is a check on the OUTCOME of a parse that already succeeded, not a second parser. It
 * compares the source words before the modal with the words of the stored slots
 * (`systemName`, `trigger`, `preCondition`, `systemResponse`), case-insensitively, and calls the
 * words no slot holds the DROPPED SPAN. When that span holds an unbound marker as whole words —
 * {@link MARKERS} — the parse lost a condition, and the line is refused naming the span.
 *
 * Because it reads only what was dropped, the rule is indifferent to the shape that carried the
 * marker there: brackets, list markers, tags and labels, a measure phrase spelled in words, or
 * punctuation inside the subject that moves where Tier 2's subject chunk starts. And a marker
 * word that survives INTO a stored slot is never a refusal (Tier 1's bare main clause keeps a lead
 * in `systemName`; a bound trigger keeps its own "before").
 *
 * The cost is known and accepted: a dropped marker used as an ordinary word ("In case studies,
 * …", "The provided token …" where Tier 2 keeps only "token") is refused too. That refusal is loud
 * and recoverable — the author restates the line — where storing it risks a silent one.
 *
 * Inert text base already strips ({@link preprocess}'s REQ-/list-number prefixes) is not source
 * text here, and the determiner base strips before a slot ("the press controller" →
 * `press controller`) counts as part of that slot.
 */

import { preprocess } from './preprocess.ts'
import type { Tier1Slots } from './tier1.ts'

/** The markers that open a clause no EARS slot binds, as word sequences, longest first. */
const MARKERS: readonly (readonly string[])[] = [
  ['provided', 'that'],
  ['in', 'case'],
  ['only', 'if'],
  ['even', 'if'],
  ['unless'],
  ['provided'],
  ['except'],
  ['before'],
  ['until'],
]

/** Determiners the ladder strips from the front of a slot (`the gateway` → `gateway`). */
const DETERMINERS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'its',
  'their',
  'his',
  'her',
  'our',
  'your',
  'my',
  'this',
  'that',
  'these',
  'those',
])

/** The first modal, contracted forms included (both tiers pivot on it). */
const MODAL = /\b(?:shall|must|will|should)\b|\b(?:shan|won|mustn|shouldn)'t\b/i

/** What ends a label or tag left of the clause: a bracket, or a colon or semicolon after it. */
const LABEL_END = /[()[\]{}:;]/
/** A character that joins two words into one (`Until-dates`, `until_x`, `unless's`). */
const JOINER = /[-‑_']/u
const ALNUM = /[\p{L}\p{N}]/u

interface Word {
  readonly lower: string
  readonly start: number
  readonly end: number
}

const wordsOf = (text: string): Word[] =>
  [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    lower: m[0].toLowerCase(),
    start: m.index,
    end: m.index + m[0].length,
  }))

/** The unbound clause a parse dropped: the span as written, and the marker it holds. */
export interface DroppedClause {
  readonly span: string
  readonly marker: string
}

/**
 * The dropped span holding an unbound marker, or `undefined` when every marker word before the
 * modal — if any — survived into a stored slot.
 *
 * @param input  The line as given to the ladder.
 * @param slots  The slots the successful parse would store.
 */
export function droppedUnboundClause(input: string, slots: Tier1Slots): DroppedClause | undefined {
  const text = preprocess(input)
  const modal = MODAL.exec(text)
  if (modal === null) return undefined
  const words = wordsOf(text.slice(0, modal.index))
  const covered = words.map(() => false)

  // Each slot claims the occurrence its tier took it from: the subject sits just before the
  // modal, a bound clause right after its keyword. `systemResponse` lies after the modal, so it
  // covers a pre-modal word only by an exact occurrence, never by the word-set fallback.
  cover(words, covered, slots.systemName, 'last', true)
  cover(words, covered, slots.preCondition, 'first', true)
  cover(words, covered, slots.trigger, 'first', true)
  cover(words, covered, slots.systemResponse, 'last', false)

  for (let i = 0; i < words.length; i++) {
    const marker = MARKERS.find((m) => markerAt(text, words, covered, i, m))
    if (marker === undefined) continue
    return {
      span: spanAround(text, words, covered, i, i + marker.length - 1),
      marker: marker.join(' '),
    }
  }
  return undefined
}

/** Mark the words of `slot`'s occurrence (and the determiner the ladder stripped before it). */
function cover(
  words: readonly Word[],
  covered: boolean[],
  slot: string | undefined,
  which: 'first' | 'last',
  fallback: boolean,
): void {
  const target = wordsOf(slot ?? '').map((w) => w.lower)
  if (target.length === 0) return
  const at = (p: number): boolean => target.every((w, k) => words[p + k]?.lower === w)
  const starts = [...Array(Math.max(0, words.length - target.length + 1)).keys()].filter(at)
  const p = which === 'first' ? starts[0] : starts.at(-1)
  if (p === undefined) {
    // The slot is not a contiguous run of source words (a tier normalized it — Tier 2 splits
    // contractions, so "isn't" is stored as "is n't" and "cannot" as "can not"): fall back to
    // word membership, which can only cover more — never refuse a line base's slots account
    // for. Without it, "While the door isn't open unless overridden, …" would be refused with
    // its "unless" inside the stored preCondition, which D1 forbids.
    if (!fallback) return
    const set = new Set(target)
    words.forEach((w, i) => {
      if (set.has(w.lower)) covered[i] = true
    })
    return
  }
  for (let k = 0; k < target.length; k++) covered[p + k] = true
  if (p > 0 && DETERMINERS.has(words[p - 1]!.lower)) covered[p - 1] = true
}

/** True when `marker` starts at word `i` as dropped, whole, adjacent words. */
function markerAt(
  text: string,
  words: readonly Word[],
  covered: readonly boolean[],
  i: number,
  marker: readonly string[],
): boolean {
  return marker.every((m, k) => {
    const w = words[i + k]
    if (w === undefined || w.lower !== m || covered[i + k]) return false
    if (k > 0 && text.slice(words[i + k - 1]!.end, w.start).trim() !== '') return false
    return isWhole(text, w)
  })
}

/** A word not joined to a neighbour by a hyphen, underscore or apostrophe (`Until-dates`). */
const isWhole = (text: string, w: Word): boolean =>
  !(JOINER.test(text[w.start - 1] ?? '') && ALNUM.test(text[w.start - 2] ?? '')) &&
  !(JOINER.test(text[w.end] ?? '') && ALNUM.test(text[w.end + 1] ?? ''))

/**
 * The run of dropped words around the marker, as the author wrote it. It extends leftwards over
 * dropped words until a covered word, a bracket or a label's colon or semicolon (`[P1] Unless …`,
 * `(1) Unless …`, `Note: Unless …`), and rightwards over dropped words until a covered word or a
 * bracket that closes one opened outside the run (`[Unless …] [P1]`), so a parenthetical inside
 * the clause stays in it (`Unless the door (north) is closed`). A bare section number directly
 * before the marker (`§3 Unless …`) and a trailing determiner are dropped from the name. A closer
 * right after the last word joins the name when it pairs an opener inside it (`is 'closed'`), and
 * then every bracket or quote still without a partner is removed — see {@link withoutUnpaired}.
 */
function spanAround(
  text: string,
  words: readonly Word[],
  covered: readonly boolean[],
  first: number,
  last: number,
): string {
  const gap = (a: number): string => text.slice(words[a]!.end, words[a + 1]!.start)
  let l = first
  let r = last
  while (l > 0 && !covered[l - 1] && !LABEL_END.test(gap(l - 1))) l--
  let depth = 0
  while (r + 1 < words.length && !covered[r + 1]) {
    const next = depthAfter(gap(r), depth)
    if (next === undefined) break
    depth = next
    r++
  }
  if (words.slice(l, first).every((w) => /^\p{N}+$/u.test(w.lower))) l = first
  while (r > last && DETERMINERS.has(words[r]!.lower)) r--
  const start = words[l]!.start
  let end = words[r]!.end
  while (end < text.length && CLOSER.test(text[end]!)) {
    const longer = text.slice(start, end + 1)
    if (unpaired(longer).size >= unpaired(text.slice(start, end)).size) break
    end++
  }
  return withoutUnpaired(text.slice(start, end))
}

const CLOSER = /[)\]}']/
const PARTNER: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' }

/** The bracket depth after crossing `gap` at `depth`, or `undefined` when `gap` closes a bracket the run did not open. */
function depthAfter(gap: string, depth: number): number | undefined {
  let d = depth
  for (const ch of gap) {
    if ('([{'.includes(ch)) d++
    else if (ch in PARTNER) {
      if (d === 0) return undefined
      d--
    }
  }
  return d
}

/**
 * The indices of `s` that pair with nothing: a bracket without its partner, a single quote
 * without its partner, and every double quote or backtick. Double quotes always go because the
 * refusal message delimits the span with them. A single quote between two letters or digits is
 * an apostrophe (`isn't`, `operator's`), not a quote, and is never counted. Indices are UTF-16
 * code units, as `s[i]` reads them.
 */
function unpaired(s: string): Set<number> {
  const drop = new Set<number>()
  const brackets: number[] = []
  const quotes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if ('([{'.includes(ch)) brackets.push(i)
    else if (ch in PARTNER) {
      if (brackets.length > 0 && s[brackets.at(-1)!] === PARTNER[ch]) brackets.pop()
      else drop.add(i)
    } else if (ch === '"' || ch === '`') drop.add(i)
    else if (ch === "'") {
      const before = ALNUM.test(s[i - 1] ?? '')
      const after = ALNUM.test(s[i + 1] ?? '')
      if (before && after) continue
      if (before && quotes.length > 0) quotes.pop()
      else if (before) drop.add(i)
      else quotes.push(i)
    }
  }
  for (const i of [...brackets, ...quotes]) drop.add(i)
  return drop
}

/** `s` without the characters {@link unpaired} finds, whitespace collapsed. */
function withoutUnpaired(s: string): string {
  const drop = unpaired(s)
  return s
    .split('')
    .filter((_, i) => !drop.has(i))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
