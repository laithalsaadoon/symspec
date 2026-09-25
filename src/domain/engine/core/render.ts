/**
 * Pure EARS sentence renderer (AC-1-3).
 *
 * The EARS domain model is 5 pattern types (`ubiquitous`, `event-driven`,
 * `state-driven`, `optional-feature`, `unwanted-behavior`) built from the 5
 * slots `patternType, preCondition, trigger, systemName, systemResponse`. The
 * canonical `sentence` field is ALWAYS rendered from those slots by
 * {@link renderSentence} — it is never authored directly. Callers (the
 * Change-record mutation path in `changes.ts`) re-run this renderer whenever an
 * EARS slot changes and skip it for metadata-only edits (AC-1-6's five-way
 * re-render gate). The combined "While P, when T, …" case renders when an
 * event-driven requirement also carries a precondition.
 *
 * Pure: no I/O, no randomness, no mutation of its argument. Depends only on
 * the `Requirement`/EARS types in `schema.ts`, never the other direction —
 * this keeps the renderer safely importable from anywhere (CLI, parse tier,
 * tests) without pulling in Zod, storage, or the Change API.
 */

import type { Requirement } from './schema.ts'

/**
 * Render an EARS sentence from its structured slots. Follows Mavin's
 * templates; pre-condition + trigger combine via "While <pre>, when
 * <trigger>, ...".
 *
 * Response polarity: when `negated` is true (AC-2-4, the parse-time / create
 * `--negated` flag), the modal renders `shall not <systemResponse>`. The
 * `systemResponse` slot itself stays POSITIVE — negation is never baked into
 * the stored text — so `shall X` and `shall not X` differ only by this flag.
 * A plain `ReqView`/partial slot object without `negated` renders positively.
 */
export function renderSentence(
  r: Pick<
    Requirement,
    'patternType' | 'preCondition' | 'trigger' | 'systemName' | 'systemResponse'
  > & { negated?: boolean },
): string {
  return renderSentenceSlots(r).sentence
}

/** Where each slot's text starts inside a {@link renderSentenceSlots} sentence. */
export interface SlotOffsets {
  readonly systemResponse: number
  readonly trigger?: number
  readonly preCondition?: number
}

/**
 * {@link renderSentence}, plus the offset at which each rendered slot's text begins in the
 * sentence. A slot the pattern does not render has no offset. The one template both come
 * from is what lets a reader of the sentence (the R6 lint) map a position back into the
 * slot a tier read.
 */
export function renderSentenceSlots(
  r: Pick<
    Requirement,
    'patternType' | 'preCondition' | 'trigger' | 'systemName' | 'systemResponse'
  > & { negated?: boolean },
): { readonly sentence: string; readonly offsets: SlotOffsets } {
  const shall = r.negated === true ? 'shall not' : 'shall'
  let sentence = ''
  const offsets: { systemResponse: number; trigger?: number; preCondition?: number } = {
    systemResponse: 0,
  }
  const text = (s: string) => {
    sentence += s
  }
  const slot = (key: 'trigger' | 'preCondition', value: string | undefined) => {
    offsets[key] = sentence.length
    sentence += value ?? ''
  }
  const response = (lead: string) => {
    text(`${lead} ${r.systemName} ${shall} `)
    offsets.systemResponse = sentence.length
    text(`${r.systemResponse}.`)
  }
  switch (r.patternType) {
    case 'ubiquitous':
      response('The')
      break
    case 'event-driven':
      if (r.preCondition) {
        text('While ')
        slot('preCondition', r.preCondition)
        text(', when ')
      } else {
        text('When ')
      }
      slot('trigger', r.trigger)
      response(', the')
      break
    case 'state-driven':
      text('While ')
      slot('preCondition', r.preCondition)
      response(', the')
      break
    case 'optional-feature':
      text('Where ')
      slot('preCondition', r.preCondition)
      response(', the')
      break
    case 'unwanted-behavior':
      text('If ')
      slot('trigger', r.trigger)
      response(', then the')
      break
  }
  return { sentence, offsets }
}
