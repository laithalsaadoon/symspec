/**
 * THE BOUNDARY — one function that projects a v3 document onto the v2-shaped view
 * the transplanted formal tier reads.
 *
 * ## Why the translation lives here and nowhere else
 *
 * The transplanted tier consumes `engine/core/schema.ts`'s `RequirementsDoc`: a
 * `schemaVersion` tag, a UUID-keyed requirement map, and the three side tables.
 * The v5 document is `../core/document.ts`'s `RequirementsDocument`: `docVersion`,
 * a `stateModel`, and per-requirement `responseKind`.
 *
 * Two places the conversion could go, and only one is defensible:
 *
 * - INSIDE the tier — translate at each of the ~40 files' call sites. That scatters
 *   the format bridge across 40 engine files, and every future question about the
 *   tier then starts with "is this the tier's behavior or the bridge's?".
 * - AT THE BOUNDARY — one function, here. The tier stays untouched, and there is
 *   exactly one place where a v3 document becomes the v2 view it reads.
 *
 * So: here.
 *
 * ## What is dropped, and why each drop is sound for G2a
 *
 * The projection is LOSSY in exactly two ways, both deliberate:
 *
 * 1. **`stateModel` is dropped.** Nothing in the G2a check path reads it — the
 *    reachability tier that will is G4, and G4's design is to encode the state
 *    model NATIVELY rather than through this v2 view. Dropping it here cannot
 *    silently degrade a verdict because no tier consults it; the moment one does,
 *    it will be a G4 tier that takes the v3 document directly.
 * 2. **`responseKind` is dropped.** Same argument: it is the effect-or-constraint
 *    classification the Horn encoder needs, and the propositional/numeric/temporal
 *    tiers do not read it. The v3 field exists so the classification is DATA rather
 *    than a retrofit (v4 V27); it does not yet have a consumer.
 *
 * Neither drop is a `verified` hazard, and that is checkable rather than asserted:
 * `compat.test.ts` proves the tier's output is identical whether or not a document
 * carries a state model, which is the same statement as "no tier reads it".
 *
 * ## What must NOT be lost, and is not
 *
 * `negated` and the rendered `sentence` are the two fields the atomizer and the
 * GtWR/AC-3-7 gate actually key on, and both survive verbatim. `negated` in
 * particular is load-bearing: it is what makes `shall X` and `shall not X` share
 * one atom at opposite polarity so a contradiction is provable rather than looking
 * like two unrelated strings. The v3 schema defaults it to `false` on decode, so
 * it is always present here.
 *
 * ## The `schemaVersion: 2` tag is a lie the tier never reads
 *
 * It is set because v4 type requires the field. Nothing in the check path
 * branches on it (measured: no reference outside the type declaration), so it is a
 * structural placeholder, not a claim that this is a v2 document. Stating that
 * here rather than leaving a bare `2` in the code is the difference between an
 * honest placeholder and a bug someone later "fixes" by writing 3.
 */

import type { Doc } from './engine/core/doc.ts'
import type { Requirement as EngineRequirement } from './engine/core/schema.ts'
import {
  requirementsContentHash,
  type UnboundCause,
  waiverBinding,
} from './requirements/content-hash.ts'
import type {
  DocumentDiagnostic,
  Requirement as DocumentRequirement,
  RequirementsDocument,
  Waiver,
} from './requirements/document.ts'
import { type FindingClass, findingClassOf, WAIVABILITY } from './waivability.ts'

/**
 * Project one v3 requirement onto v4's requirement shape.
 *
 * Optional fields are spread CONDITIONALLY rather than assigned `undefined`. The
 * v3 type is exact-optional (`exactOptionalPropertyTypes`), so an absent key is
 * genuinely absent, and preserving that distinction across the boundary matters:
 * the tier tests `trigger !== undefined`, and `{trigger: undefined}` vs `{}`
 * behaves the same for that test but differently under `JSON.stringify`. Keeping
 * absence as absence means a projected document serializes to the same bytes a
 * hand-written v2 document would, so anything that canonicalizes JSON — a fixture,
 * a snapshot, an envelope diff — sees no spurious change.
 */
export const toEngineRequirement = (r: DocumentRequirement): EngineRequirement => ({
  id: r.id,
  patternType: r.patternType,
  systemName: r.systemName,
  systemResponse: r.systemResponse,
  // Present on every decoded v3 requirement (the schema defaults it), and
  // load-bearing: this flag is what puts `shall X` and `shall not X` on one atom
  // at opposite polarity.
  negated: r.negated,
  sentence: r.sentence,
  priority: r.priority,
  status: r.status,
  // Edge arrays are `readonly` in v3 and mutable in the tier's type. Copied rather than
  // cast: the tier does not mutate them today, but sharing the array would make a future
  // mutation inside the engine reach back into the caller's document — an aliasing bug
  // in the most confusing possible place.
  derives: [...r.derives],
  satisfies: [...r.satisfies],
  verifies: [...r.verifies],
  refines: [...r.refines],
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  ...(r.key !== undefined ? { key: r.key } : {}),
  ...(r.preCondition !== undefined ? { preCondition: r.preCondition } : {}),
  ...(r.trigger !== undefined ? { trigger: r.trigger } : {}),
  ...(r.verificationMethod !== undefined ? { verificationMethod: r.verificationMethod } : {}),
  ...(r.verificationNote !== undefined ? { verificationNote: r.verificationNote } : {}),
})

// ---------------------------------------------------------------------------
// Waivability at the boundary (spec 007 AC-5-6)
// ---------------------------------------------------------------------------

/**
 * Appended to the legacy reason of every replacement `waive` a `waiver-inert` diagnostic offers,
 * so the narrower waiver keeps its reviewer's words and says where it came from (ruling R41).
 */
export const RESCOPED_REASON_MARKER = ' (rescoped from a legacy waiver)'

/**
 * Why a stored waiver does not reach the engine, when it does not: its code's class, or a shape
 * that binds no reviewed text ({@link UnboundCause}, decided by `waiverBinding`).
 */
export type InertCause =
  /** No catalog publishes the code (an exact match: no trimming, no case folding). */
  | 'unclassified'
  /** The code's class is `never`: a verdict, disclosure, triage, hygiene or anchor finding. */
  | 'never'
  | UnboundCause

/**
 * What the waivability policy makes of ONE stored waiver at check time.
 *
 * - `qualifies`: a `scoped`-class code over named requirements whose current text matches the
 *   stored hash. Exactly these cross to the engine, as the exact set `ids`.
 * - `stale`: the same, but the text changed since the review. The finding comes back and the
 *   waiver is listed in `data.ignoredWaivers` for the new text to be re-reviewed.
 * - `inert`: anything the S3 fold would refuse as an op. Kept in the document, disclosed as a
 *   `waiver-inert` diagnostic, and never handed to the engine.
 */
export type WaiverStanding =
  | { readonly kind: 'qualifies'; readonly ids: readonly string[] }
  | {
      readonly kind: 'stale'
      readonly ids: readonly string[]
      readonly storedHash: string
      readonly currentHash: string
    }
  | { readonly kind: 'inert'; readonly cause: InertCause; readonly class?: FindingClass }

/** The requirement scope a stored waiver carries: its exact set, or its one requirement. */
const scopeOf = (w: Waiver): readonly string[] | undefined =>
  w.requirementIds ?? (w.requirementId !== undefined ? [w.requirementId] : undefined)

/**
 * Classify one stored waiver under the waivability policy — the check-time twin of the fold's
 * refusal (`MUTATE_OPTIONS.waiverPolicy`): a stored waiver reaches the engine exactly when the
 * fold would accept it as an op on this document and store it unchanged.
 *
 * The code is read EXACTLY as stored. The fold trims an op's code before classifying it, but a
 * stored ` FND_CONTRADICTION` never passed a fold, and folding case or whitespace here would
 * hand a hand-written variant of a `never` code the engine's exact-match `isWaived`.
 */
export const waiverStanding = (document: RequirementsDocument, w: Waiver): WaiverStanding => {
  const cls = findingClassOf(w.code)
  if (cls === undefined) return { kind: 'inert', cause: 'unclassified' }
  if (WAIVABILITY[cls] === 'never') return { kind: 'inert', cause: 'never', class: cls }
  // Only the shape the fold stores crosses (ruling R54): one scope field, a reason, an anchored
  // hash. The text half is the one binding function the vocabulary's projection rebinds by.
  const binding = waiverBinding(document, w)
  switch (binding.kind) {
    case 'binds':
      return { kind: 'qualifies', ids: binding.ids }
    case 'stale':
      return {
        kind: 'stale',
        ids: binding.ids,
        storedHash: binding.storedHash,
        currentHash: binding.currentHash,
      }
    case 'unbound':
      return { kind: 'inert', cause: binding.cause, class: cls }
  }
}

/** A finding as the boundary reads it: its code and the requirements it names. */
export interface FindingScope {
  readonly code: string
  readonly requirementIds: readonly string[]
}

/**
 * Whether a stored waiver reached `f` under the PRE-S3 matching (the code, then every scope it
 * carries: one requirement named, or exactly the set). The migration offers a scoped waive for
 * every finding a legacy waiver reaches this way today (ruling R18), so a reviewer re-scopes
 * what the waiver covered and nothing more.
 */
const reachedBefore = (w: Waiver, f: FindingScope): boolean => {
  if (f.code !== w.code) return false
  if (w.requirementIds !== undefined) {
    const want = new Set(w.requirementIds)
    const got = new Set(f.requirementIds)
    if (got.size !== want.size || ![...got].every((id) => want.has(id))) return false
  }
  return w.requirementId === undefined || f.requirementIds.includes(w.requirementId)
}

/** True when some finding names exactly `ids` under `code` — what an exact-set waiver bites. */
export const matchesFinding = (
  code: string,
  ids: readonly string[],
  findings: readonly FindingScope[],
): boolean =>
  findings.some((f) => reachedBefore({ code, requirementIds: ids, reason: 'probe' } as Waiver, f))

/** The exact `unwaive` of a stored waiver: its code and the scope it is stored under. */
const unwaiveOf = (w: Waiver): Readonly<Record<string, unknown>> => ({
  op: 'unwaive',
  code: w.code,
  ...(w.requirementId !== undefined ? { ref: w.requirementId } : {}),
  ...(w.requirementIds !== undefined ? { refs: [...w.requirementIds] } : {}),
})

/** A stored waiver as stored, for a diagnostic to name the row. */
const asStored = (w: Waiver): Readonly<Record<string, unknown>> => ({ ...w })

const quoted = (ids: readonly string[]): string => ids.join(', ')

/**
 * The `waiver-inert` diagnostic for a stored waiver the policy does not forward (`standing` is
 * its {@link waiverStanding}), or for a forwarded one that matches no finding (`standing`
 * `qualifies`, which only {@link unmatchedWaiverDiagnostic} passes).
 *
 * `findings` are the run's findings (every tier, unfiltered). For a `scoped` code the ops carry,
 * after the unwaive, one `waive` per finding the legacy waiver reaches today, over exactly that
 * finding's requirements and the hash of their current text, with the legacy reason and
 * {@link RESCOPED_REASON_MARKER} (rulings R18, R41). A `never` code gets the unwaive alone: the
 * finding is discharged only by rewriting what it names (R19).
 */
export const inertWaiverDiagnostic = (
  document: RequirementsDocument,
  w: Waiver,
  standing: Extract<WaiverStanding, { kind: 'inert' }>,
  findings: readonly FindingScope[],
): DocumentDiagnostic => {
  const scope = scopeOf(w)
  const rescoped =
    standing.cause === 'code-only' || standing.cause === 'no-hash'
      ? replacementWaives(document, w, findings)
      : []
  const detail = inertDetail(w, standing, rescoped.length)
  return {
    kind: 'waiver-inert',
    severity: 'info',
    detail,
    ...(scope !== undefined && scope.length > 0 ? { requirementIds: [...scope] } : {}),
    waiver: asStored(w),
    ops: [unwaiveOf(w), ...rescoped],
  }
}

/** One scoped `waive` per finding a legacy waiver reaches today, deduplicated by set. */
const replacementWaives = (
  document: RequirementsDocument,
  w: Waiver,
  findings: readonly FindingScope[],
): readonly Readonly<Record<string, unknown>>[] => {
  const seen = new Set<string>()
  const ops: Readonly<Record<string, unknown>>[] = []
  for (const f of findings) {
    if (!reachedBefore(w, f) || f.requirementIds.length === 0) continue
    const refs = [...new Set(f.requirementIds)].sort()
    const key = refs.join(',')
    if (seen.has(key)) continue
    const contentHash = requirementsContentHash(document, refs)
    if (contentHash === undefined) continue
    seen.add(key)
    ops.push({
      op: 'waive',
      code: w.code,
      refs,
      contentHash,
      reason: `${w.reason}${RESCOPED_REASON_MARKER}`,
    })
  }
  return ops
}

const inertDetail = (
  w: Waiver,
  standing: Extract<WaiverStanding, { kind: 'inert' }>,
  rescoped: number,
): string => {
  const head = `The stored waiver of ${w.code}`
  const remove = 'The op below removes it.'
  const rescope =
    rescoped > 0
      ? ` The ops below remove it and re-scope it to the ${rescoped === 1 ? 'finding' : `${rescoped} findings`} it reaches today, each over exactly that finding's requirements and the hash of their current text: review each before applying it.`
      : ` It reaches no finding today, so it offers no re-scoped waiver. ${remove}`
  switch (standing.cause) {
    case 'unclassified':
      return `${head} is inert: no catalog publishes that code, so it has no waivability class and \`check\` never applies it. ${remove}`
    case 'never':
      return `${head} is inert: ${w.code} is a ${standing.class}-class finding, which is never waivable, so \`check\` ignores the waiver and the finding stands. Rewrite required: change the requirement the finding names, or commit the antonym or glossary entry it proposes where the phrasings really are contraries or one action. ${remove}`
    case 'code-only':
      return `${head} names no requirement, so it is inert: a waiver by code alone would reach every finding of the code, including ones nobody reviewed.${rescope}`
    case 'no-hash':
      return `${head} over ${quoted(scopeOf(w) ?? [])} carries no content hash, so it is bound to no reviewed text and is inert.${rescope}`
    case 'missing-requirement':
      return `${head} names a requirement the document no longer has, so its content hash binds no text and it is inert. ${remove}`
    case 'both-scopes':
      return `${head} carries both "requirementId" and "requirementIds", a shape no fold writes, so which scope was reviewed cannot be known and it is inert. ${remove}`
    case 'blank-reason':
      return `${head} has a blank reason, so it records no review and is inert. ${remove}`
    case 'malformed-hash':
      return `${head} carries a content hash that is not \`sha256:\` and 64 hex digits, so it binds no text and is inert. ${remove}`
  }
}

/**
 * The `waiver-inert` diagnostic for a forwarded waiver whose requirement set matches no finding:
 * the engine reads a scope as the EXACT set, so it suppressed nothing. Its unwaive alone — a
 * stored exact set matched no finding before S3 either (ruling R38).
 */
export const unmatchedWaiverDiagnostic = (w: Waiver): DocumentDiagnostic => {
  const scope = scopeOf(w) ?? []
  return {
    kind: 'waiver-inert',
    severity: 'info',
    detail: `The stored waiver of ${w.code} over ${quoted(scope)} matches no finding: no finding of the code names exactly those requirements, so it suppresses nothing. The op below removes it.`,
    requirementIds: [...scope],
    waiver: asStored(w),
    ops: [unwaiveOf(w)],
  }
}

/**
 * One `data.ignoredWaivers` entry: a stale-hash waiver of a `scoped` code (ruling R21, R42). The
 * text it was reviewed on changed, so the finding is back; the entry offers the unwaive only,
 * because a waive at the new hash would certify text nobody has read.
 */
export interface IgnoredWaiver {
  readonly code: string
  readonly requirementIds: readonly string[]
  readonly storedHash: string
  readonly currentHash: string
  readonly reason: string
  readonly note: string
  readonly ops: readonly Readonly<Record<string, unknown>>[]
}

export const ignoredWaiverEntry = (
  w: Waiver,
  standing: Extract<WaiverStanding, { kind: 'stale' }>,
): IgnoredWaiver => ({
  code: w.code,
  requirementIds: [...standing.ids],
  storedHash: standing.storedHash,
  currentHash: standing.currentHash,
  reason: w.reason,
  note: `The text of ${quoted(standing.ids)} changed since this waiver was reviewed (stored ${standing.storedHash}, now ${standing.currentHash}), so it no longer applies and its finding is back. Re-review the new text: if the finding still does not apply, accept it again from that finding's own repair; the op below removes the stale waiver.`,
  ops: [unwaiveOf(w)],
})

/**
 * Project a v3 document onto v4's document shape — the ONE boundary
 * crossing.
 *
 * Requirement ORDER is preserved by construction: `Object.entries` on the v3 map
 * feeds a fresh object in the same sequence, and `listRequirements` is a plain
 * `Object.values`. That is not incidental — the order feeds the atom roster and
 * the candidate-pair emission, so re-ordering here would change `pairsChecked`
 * and therefore the coverage report, while leaving every finding intact. Exactly
 * the kind of divergence that looks like noise in a diff.
 */
export const toEngineDoc = (document: RequirementsDocument): Doc => {
  const requirements: Record<string, EngineRequirement> = {}
  for (const [id, r] of Object.entries(document.requirements)) {
    requirements[id] = toEngineRequirement(r)
  }
  return {
    // A structural placeholder the tier never reads — see the module header.
    schemaVersion: 2,
    requirements,
    glossary: document.glossary.map((g) => ({ canonical: g.canonical, aliases: [...g.aliases] })),
    antonyms: document.antonyms.map((a) => ({ a: a.a, b: a.b })),
    // Only a waiver the waivability policy lets in crosses (spec 007 AC-5-6, R22): a `scoped`
    // code over named requirements whose text still matches the reviewed hash. It crosses as the
    // EXACT set — a stored single `requirementId` too, as `[id]` (R39) — bound to the text, so
    // the engine's own matching cannot widen it. Dropping a waiver can only put a finding back,
    // never invent one, so every other shape stays behind and is disclosed by `check`.
    waivers: document.waivers.flatMap((w) => {
      const standing = waiverStanding(document, w)
      return standing.kind === 'qualifies'
        ? [{ code: w.code, reason: w.reason, requirementIds: [...standing.ids], textBound: true }]
        : []
    }),
    terms: document.terms.map((t) => ({ canonical: t.canonical, aliases: [...t.aliases] })),
  }
}
