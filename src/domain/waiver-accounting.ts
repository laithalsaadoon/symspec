/**
 * WAIVER ACCOUNTING — what `check` says about every stored waiver (spec 007 AC-5-6, S3).
 *
 * `compat.ts` decides which stored waivers cross to the engine ({@link waiverStanding}); the
 * engine applies what crosses and reports only a post-waiver `waived` count. This module turns
 * the two halves into the payload's disclosures:
 *
 * - `data.diagnostics[]` gains one `waiver-inert` entry per stored waiver that did not cross, and
 *   one per crossed waiver whose exact set matches no finding (it suppressed nothing);
 * - `data.ignoredWaivers[]` lists every stale-hash waiver of a `scoped` code;
 * - `data.appliedWaivers[]` lists every waiver the engine applied, so a suppression is never
 *   silent (ruling R33);
 * - {@link waivedBlockingIds} names the requirements a waived blocking lint re-admitted to the
 *   solver, which `check` demotes `waived-blocking-lint` (G3, R26, R27).
 *
 * Whether a crossed waiver APPLIED needs the findings before the waivers were applied. A crossed
 * waiver is always an exact set bound to its text, so it applied exactly when some pre-waiver
 * finding of its code names exactly its set. The caller hands those findings in: the lint
 * findings are recomputed here ({@link lintFindingScopes}) because they do not depend on any
 * waiver, and the rest come from a run that kept only the lint waivers (the only waivers the
 * AC-3-7 gate reads), so that run's formal tier saw the same requirements.
 */

import {
  type FindingScope,
  type IgnoredWaiver,
  ignoredWaiverEntry,
  inertWaiverDiagnostic,
  matchesFinding,
  unmatchedWaiverDiagnostic,
  waiverStanding,
} from './compat.ts'
import type { Doc } from './engine/core/doc.ts'
import { listRequirements } from './engine/core/doc.ts'
import { renderSentence } from './engine/core/render.ts'
import { checkGtWRules, checkGtWRulesSet } from './engine/lint/gtwr.ts'
import { excludedIds, gateRequirements } from './engine/pipeline/gate.ts'
import type { DocumentDiagnostic, RequirementsDocument, Waiver } from './requirements/document.ts'

/** One `data.appliedWaivers` entry: a waiver the engine applied (ruling R33). */
export interface AppliedWaiver {
  readonly code: string
  readonly requirementIds: readonly string[]
  readonly reason: string
}

/** What `check` publishes about the document's stored waivers. */
export interface WaiverAccount {
  readonly diagnostics: readonly DocumentDiagnostic[]
  readonly ignoredWaivers: readonly IgnoredWaiver[]
  readonly appliedWaivers: readonly AppliedWaiver[]
}

/** True for a lint code: the only codes the AC-3-7 gate reads a waiver of. */
export const isLintCode = (code: string): boolean => code.startsWith('GTWR_')

/**
 * The GtWR findings of a projected document, scoped as the engine scopes them (per statement:
 * the one requirement; set level: its requirement, or none). Pure lint, so it is the same with
 * any waiver or none — the pre-waiver half {@link accountWaivers} needs for lint waivers.
 */
export const lintFindingScopes = (doc: Doc): readonly FindingScope[] => {
  const withSentences = listRequirements(doc).map((requirement) => ({
    requirement,
    sentence: requirement.sentence || renderSentence(requirement),
  }))
  return [
    ...withSentences.flatMap(({ requirement, sentence }) =>
      checkGtWRules(requirement, sentence).map((f) => ({
        code: f.code,
        requirementIds: [requirement.id],
      })),
    ),
    ...checkGtWRulesSet(withSentences).map((f) => ({
      code: f.code,
      requirementIds: f.requirementId !== undefined ? [f.requirementId] : [],
    })),
  ]
}

/**
 * The requirements a waived blocking lint re-admitted to the solver: those the AC-3-7 gate
 * excludes with no waiver, minus those it excludes under exactly the waivers `doc` carries
 * (`toEngineDoc`'s list), sorted. Empty with no waiver, so a document with none demotes exactly
 * as before (ruling R27).
 *
 * Empty, too, on a document of fewer than two requirements: the engine raises no coverage
 * demotion there (nothing exists to compare a requirement with), and this one is the
 * replacement of `excluded-from-formal`, which follows the same vacuity (ruling R53).
 */
export const waivedBlockingIds = (doc: Doc): readonly string[] => {
  const requirements = listRequirements(doc)
  if (requirements.length < 2 || (doc.waivers ?? []).length === 0) return []
  const bare = excludedIds(gateRequirements(requirements, []))
  const waived = excludedIds(gateRequirements(requirements, doc.waivers ?? []))
  return [...bare].filter((id) => !waived.has(id)).sort()
}

/**
 * Account for every stored waiver of `document`.
 *
 * `preWaiver` are the findings before any crossed waiver applied (see the module header): a
 * crossed waiver applied exactly when one of them names its code and exactly its set.
 * `findings` are the run's findings, every tier, unfiltered: an inert legacy waiver is offered
 * one re-scoped waive per finding it reaches among them. `others` are the findings of tiers the
 * engine's waivers never reach (reachability, terminology); a crossed waiver matching one of
 * them is not disclosed as matching nothing, because it does match a finding.
 */
export const accountWaivers = (
  document: RequirementsDocument,
  preWaiver: readonly FindingScope[],
  findings: readonly FindingScope[],
  others: readonly FindingScope[],
): WaiverAccount => {
  const diagnostics: DocumentDiagnostic[] = []
  const ignoredWaivers: IgnoredWaiver[] = []
  const appliedWaivers: AppliedWaiver[] = []
  for (const w of document.waivers as readonly Waiver[]) {
    const standing = waiverStanding(document, w)
    switch (standing.kind) {
      case 'inert':
        diagnostics.push(inertWaiverDiagnostic(document, w, standing, findings))
        break
      case 'stale':
        ignoredWaivers.push(ignoredWaiverEntry(w, standing))
        break
      case 'qualifies':
        if (matchesFinding(w.code, standing.ids, preWaiver)) {
          appliedWaivers.push({ code: w.code, requirementIds: [...standing.ids], reason: w.reason })
        } else if (!matchesFinding(w.code, standing.ids, others)) {
          diagnostics.push(unmatchedWaiverDiagnostic(w))
        }
        break
    }
  }
  return { diagnostics, ignoredWaivers, appliedWaivers }
}
