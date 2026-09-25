/**
 * THE OUTCOME CHECK, measured against the engine's verdicts (S6-D3).
 *
 * `outcome.ts` admits a vocabulary only when the projection's reading is the original's with
 * exactly the declared classes joined. The claim that makes that the right test is that such a
 * projection changes no verdict the declaration does not imply. This sweeps the claim over the
 * report corpus: every document's implicit vocabulary, declared, with ONE extra equality at a
 * time (a merge of two symbols of one kind, or the second folded into the first as aliases). For
 * every candidate the validator admits, the engine is run on the original and on the projected
 * document, and a merge may only ADD: no error-severity code the original raises is missing
 * after, and a document the engine did not call verified is not verified after.
 *
 * Unsat cores are not unique, so an error finding is compared by code, not by the requirement
 * set it names: a merge that makes a smaller core provable reports that core instead.
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { MUTATE_OPTIONS } from '../../app/operations/mutate-options.ts'
import { SolverService } from '../../ports/solver.ts'
import { reportSources } from '../../testing/report-corpus.ts'
import { toEngineDoc } from '../compat.ts'
import { runCheck } from '../engine/pipeline/check.ts'
import {
  DOC_VERSION_VOCAB,
  type RequirementsDocument,
  type VocabSymbol,
  type Vocabulary,
} from '../requirements/document.ts'
import { buildProjection } from './build.ts'
import { implicitVocabulary } from './implicit.ts'
import { frozenTablesDigest, validateVocabulary } from './invariants.ts'
import { projectedDocument } from './projection.ts'

/** The verdict of one run: its error codes, and `VERIFIED` when the run is verified. */
const verdictOf = (doc: RequirementsDocument): Promise<ReadonlySet<string>> =>
  Effect.runPromise(
    Effect.flatMap(SolverService, (solver) =>
      Effect.flatMap(solver.boot, () =>
        Effect.promise(() => runCheck(toEngineDoc(doc), { strict: true })),
      ),
    ).pipe(Effect.provide(solverServiceLayer)),
  ).then(
    (r) =>
      new Set([
        ...r.findings.filter((f) => f.severity === 'error').map((f) => f.code),
        ...(r.verified ? ['VERIFIED'] : []),
      ]),
  )

/** How many symbols of each kind a document contributes pairs from. */
const PER_KIND = 3

/** Every candidate: the implicit vocabulary plus one merge, or plus one alias fold. */
const candidates = (doc: RequirementsDocument): { what: string; vocabulary: Vocabulary }[] => {
  const implicit = implicitVocabulary(doc)
  const out: { what: string; vocabulary: Vocabulary }[] = []
  for (const kind of ['action', 'state', 'quantity'] as const) {
    const of = implicit.symbols.filter((s) => s.kind === kind).slice(0, PER_KIND)
    for (const [i, a] of of.entries()) {
      for (const b of of.slice(i + 1)) {
        out.push({
          what: `merge ${a.id} ${b.id}`,
          vocabulary: { ...implicit, merges: [{ a: a.id, b: b.id }] },
        })
        const folded = implicit.symbols.flatMap((s): VocabSymbol[] =>
          s.id === b.id
            ? []
            : s.id === a.id
              ? [{ ...s, aliases: [...s.aliases, b.canonical, ...b.aliases] }]
              : [s],
        )
        out.push({ what: `alias ${a.id} <- ${b.id}`, vocabulary: { ...implicit, symbols: folded } })
      }
    }
  }
  return out
}

describe('the projection of every admitted equality changes no verdict it does not imply', () => {
  it('loses no error code and gains no `verified`, over the report corpus', async () => {
    const problems: string[] = []
    let admitted = 0
    let refused = 0
    for (const { label, doc } of reportSources(MUTATE_OPTIONS)) {
      const before = await verdictOf(doc)
      for (const { what, vocabulary } of candidates(doc)) {
        const declared: RequirementsDocument = {
          ...doc,
          docVersion: DOC_VERSION_VOCAB,
          vocabulary: { ...vocabulary, frozenTables: { sha256: frozenTablesDigest(doc) } },
        }
        if (validateVocabulary(declared).violations.length > 0) {
          refused += 1
          continue
        }
        admitted += 1
        const projection = buildProjection(declared)
        if (projection === undefined) continue
        const after = await verdictOf(projectedDocument(declared, projection))
        for (const code of before) {
          if (code !== 'VERIFIED' && !after.has(code))
            problems.push(`${label} ${what}: lost ${code}`)
        }
        if (after.has('VERIFIED') && !before.has('VERIFIED')) {
          problems.push(`${label} ${what}: verified only after the projection`)
        }
      }
    }
    expect(problems).toEqual([])
    // Non-vacuous both ways: some candidates are admitted and measured, and some are refused.
    expect(admitted).toBeGreaterThan(0)
    expect(refused).toBeGreaterThan(0)
  }, 600_000)
})
