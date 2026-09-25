/**
 * THE REPORT CORPUS SNAPSHOT — gate G-C's BEFORE, taken while no vocabulary code exists.
 *
 * The corpus, the row and the run are defined in `./report-corpus.ts`; this file WIRES the real
 * `check` operation and the real solver in (a test may compose every ring) and pins the result.
 *
 * ## What a diff here means
 *
 * - a row's `findings` or `demotions` CHANGING is a verdict change on that document — argue it in
 *   the commit, or it is a regression;
 * - `verified=false` becoming `verified=true` is the direction that ends an agent's loop early,
 *   and is never a side effect;
 * - a row DISAPPEARING is a document the corpus stopped checking, which is why the row count is
 *   asserted below against the sources rather than read off the snapshot.
 *
 * The file is compared, never re-created by the gate: `vitest run` under `CI` refuses to write a
 * missing or changed file snapshot, and an intended change is re-pinned only with `vitest -u`,
 * which makes it a reviewed diff.
 */

import { Effect } from 'effect'
import { beforeAll, describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../adapters/z3/solver-service.ts'
import { checkOp } from '../app/operations/check.ts'
import { MUTATE_OPTIONS } from '../app/operations/mutate-options.ts'
import { exitCodeForEnvelope } from '../app/runtime/exit.ts'
import { runOperation } from '../app/runtime/operation.ts'
import { evalRoundCases } from './eval-rounds.ts'
import { fabricationCases } from './fabrication.ts'
import { FIXTURES } from './gaming.ts'
import { REPORT_CORPORA, renderReportCorpus, reportSources } from './report-corpus.ts'

describe('the report corpus', () => {
  let text = ''
  beforeAll(async () => {
    text = await renderReportCorpus({
      check: (input) =>
        runOperation(checkOp, input).pipe(
          Effect.map((envelope) => ({ exit: exitCodeForEnvelope(envelope), data: envelope.data })),
        ),
      solver: solverServiceLayer,
      mutateOptions: MUTATE_OPTIONS,
    })
  }, 300_000)

  it('renders every document the corpus runs, byte-stable', async () => {
    await expect(text).toMatchFileSnapshot('./__snapshots__/report-corpus.txt')
  })

  it('has exactly one row per document, and every corpus contributes', () => {
    const rows = text.trimEnd().split('\n')
    const labels = rows.map((r) => r.split('\t')[0] ?? '')
    // DERIVED, not typed: the sources own the number. A dropped or merged row is a document the
    // gate stopped checking, and a literal here would be a second count to keep in step.
    expect(rows.length).toBe(reportSources(MUTATE_OPTIONS).length)
    expect(new Set(labels).size, 'two documents share a label').toBe(labels.length)
    const count = (corpus: string) => labels.filter((l) => l.startsWith(`${corpus}/`)).length
    expect(count('eval-rounds')).toBe(evalRoundCases().length)
    expect(count('fabrication')).toBe(fabricationCases().length)
    expect(count('gaming')).toBe(FIXTURES.length)
    expect(count('gaming-control')).toBe(FIXTURES.filter((f) => 'ops' in f.control).length)
    for (const corpus of REPORT_CORPORA) expect(count(corpus), corpus).toBeGreaterThan(0)
  })

  it('is non-vacuous — the corpus holds both clean and unclean verdicts', () => {
    // A corpus of only dirty documents cannot show a lost `verified`, and one of only clean
    // documents cannot show a lost finding. Parity is only a claim if both kinds are present.
    const rows = text.trimEnd().split('\n')
    expect(rows.some((r) => r.includes('\texit=0\tverified=true\t'))).toBe(true)
    expect(rows.some((r) => r.includes('\tverified=false\t'))).toBe(true)
    expect(
      rows.some((r) => /\/error\[/.test(r)),
      'no error-severity finding anywhere',
    ).toBe(true)
    // The stub embedder is disclosed as `run-weakened` on every run, so a row carrying it means
    // the corpus stopped running on the orthogonal table and every verdict is a weakened one.
    expect(text, 'the run fell back to the embedding stub').not.toContain('run-weakened')
  })
})
