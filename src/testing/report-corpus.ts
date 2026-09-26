/**
 * THE REPORT CORPUS — what `check` concludes about every corpus document, pinned.
 *
 * ## Why this exists (spec 007 Phase 3, gate G-C)
 *
 * `./atom-corpus.test.ts` pins the atom names, which is the decide KEY. It cannot pin what the
 * pipeline DOES with those keys: which findings fire, which demotions are raised, and whether
 * the run is `verified`. The vocabulary work changes the path every slot takes to the solver
 * (a resolution chokepoint, then a projection at `compat.toEngineDoc`), and its parity claim —
 * "bootstrapping a document into a vocabulary changes no verdict" — is a claim about exactly
 * these three things. A parity claim needs a BEFORE, and the before has to be taken while no
 * vocabulary code exists, or the snapshot records the change it is meant to judge.
 *
 * ## The row
 *
 * One row per document: `<corpus>/<id>`, the exit code, `verified`, the findings (code,
 * severity, requirements) and the coverage demotions (reason, requirements), each list sorted.
 * Requirements print as `key ?? id`: the eval-round and fabrication documents carry their own
 * ids, and a gaming fixture's id is derived from its key or fixed by the fixture, so the key is the
 * one name every corpus shares.
 *
 * Messages, suggestions and evidence are left out on purpose. They are wording, and a wording
 * change is not a verdict change; pinning them would make every prose edit a diff here and bury
 * the one line that matters.
 *
 * ## The run
 *
 * The real `check` operation (injected, as in `./gaming.ts` — `testing/` may not name `app/` or
 * `adapters/`), `--strict`, under the gaming harness's {@link ARMED} knobs and its
 * {@link fixtureEmbedder}. The orthogonal table lets the semantic tier RUN and discharge its
 * own demotion while proposing nothing, so every row is a verdict of the decide tier; the stub
 * would demote every row `run-weakened` and pin nothing else. A gaming fixture's `near` pairs are
 * the one exception, and they are the fixture's own: its row shows the opposition candidate the
 * fixture exists to raise.
 */

import { Effect, Layer, ManagedRuntime } from 'effect'
import type { RequirementsDocument } from '../domain/requirements/document.ts'
import type { MutateOptions } from '../domain/requirements/mutate.ts'
import { DocPath, DocStore, documentOnlyStore, makeDocPath } from '../ports/doc-store.ts'
import { embedderLayerOf } from '../ports/embedder.ts'
import { ErrDocNotFound } from '../ports/errors.ts'
import { asRequirementsDocument, evalRoundCases } from './eval-rounds.ts'
import { fabricationCases } from './fabrication.ts'
import {
  ARMED,
  buildDoc,
  FIXTURES,
  type Fixture,
  fixtureEmbedder,
  type GamingWiring,
} from './gaming.ts'

/** One document of the corpus, labelled `<corpus>/<id>` so a diff line names where to look. */
export interface ReportSource {
  readonly label: string
  readonly doc: RequirementsDocument
  /** The `near` pairs the baseline embedder relates, for a gaming document; none otherwise. */
  readonly near?: Fixture['near']
}

/** The corpora, by label prefix. Each must contribute at least one row. */
export const REPORT_CORPORA = ['eval-rounds', 'fabrication', 'gaming', 'gaming-control'] as const

/**
 * Every document the corpus runs.
 *
 * - `eval-rounds`: the pinned red-team rounds, projected onto the greenfield shape.
 * - `fabrication`: the deliberately-close-but-distinct phrasings, whose verdict must stay clean.
 * - `gaming`: each gaming fixture's BASELINE — the document before any move.
 * - `gaming-control`: each fixture's consistent twin, where one exists, so the corpus holds
 *   documents that reach a clean verdict under the armed run and a lost `verified` shows up.
 *
 * Built fresh on every call. The gaming documents fold under `apply`'s own options,
 * handed in as the harness hands them in, so a corpus document is one `apply` could write.
 */
export const reportSources = (options: MutateOptions): readonly ReportSource[] => {
  const out: ReportSource[] = []
  for (const c of evalRoundCases()) {
    out.push({ label: `eval-rounds/${c.id}`, doc: asRequirementsDocument(c.doc) })
  }
  for (const c of fabricationCases()) out.push({ label: `fabrication/${c.id}`, doc: c.doc })
  for (const f of FIXTURES) {
    const near = f.near === undefined ? {} : { near: f.near }
    out.push({ label: `gaming/${f.id}`, doc: buildDoc(f.ops, options), ...near })
    if ('ops' in f.control) {
      out.push({ label: `gaming-control/${f.id}`, doc: buildDoc(f.control.ops, options), ...near })
    }
  }
  return out
}

/** The composition the test supplies: the real `check` operation, solver layer and mutate options. */
export type ReportCorpusWiring = Pick<GamingWiring, 'check' | 'solver' | 'mutateOptions'>

const list = (items: readonly string[]): string => (items.length === 0 ? '-' : items.join(' '))

/** `code/severity[refs]` or `reason[refs]`, with refs as `key ?? id`, sorted. */
const entry = (head: string, ids: readonly string[], doc: RequirementsDocument): string =>
  `${head}[${ids
    .map((id) => doc.requirements[id]?.key ?? id)
    .sort()
    .join(',')}]`

/**
 * One document's row.
 *
 * An operational failure THROWS rather than rendering a row: a corpus document the tool cannot
 * check is a broken instrument, and a snapshot that pinned it would keep it broken.
 */
const reportRow = async (
  wiring: ReportCorpusWiring,
  { label, doc, near }: ReportSource,
): Promise<string> => {
  const store = Layer.succeed(DocStore)(
    documentOnlyStore({
      load: (path) =>
        path === 'doc.json'
          ? Effect.succeed({ document: doc, unknownKeys: {}, diagnostics: [] })
          : Effect.fail(new ErrDocNotFound({ error: `no document at ${path}`, suggestions: [] })),
      save: () => Effect.void,
      exists: () => Effect.succeed(true),
    }),
  )
  // One solver runtime per document: the z3 WASM heap never shrinks, so a runtime shared by the
  // whole corpus grows until it aborts (the reason `./gaming.ts` scopes one per fixture).
  const runtime = ManagedRuntime.make(wiring.solver)
  try {
    const result = await runtime.runPromise(
      Effect.result(wiring.check({ file: 'doc.json', strict: true, ...ARMED })).pipe(
        Effect.provide(
          Layer.mergeAll(
            store,
            Layer.succeed(DocPath)(makeDocPath({})),
            embedderLayerOf(fixtureEmbedder(near === undefined ? {} : { near })),
          ),
        ),
      ),
    )
    if (result._tag === 'Failure') {
      const failure = result.failure as { readonly _tag?: unknown } | null
      throw new Error(`${label}: check failed operationally (${String(failure?._tag)})`)
    }
    const { exit, data } = result.success
    const findings = data.findings
      .map((f) => entry(`${f.code}/${f.severity}`, f.requirementIds, doc))
      .sort()
    const demotions = data.coverage.demotions
      .map((d) => entry(d.reason, d.requirementIds, doc))
      .sort()
    return [
      label,
      `exit=${exit}`,
      `verified=${data.verified}`,
      `findings=${list(findings)}`,
      `demotions=${list(demotions)}`,
    ].join('\t')
  } finally {
    await runtime.dispose()
  }
}

/** Every row, sorted by label, newline-terminated — the committed snapshot's exact text. */
export const renderReportCorpus = async (
  wiring: ReportCorpusWiring,
  sources: readonly ReportSource[] = reportSources(wiring.mutateOptions),
): Promise<string> => {
  const rows: string[] = []
  // SERIAL: the z3 module is process-global (`primeZ3`/`resetZ3`), so two runs in flight in one
  // worker would share, and one could reset, the other's instance.
  for (const source of sources) rows.push(await reportRow(wiring, source))
  return `${rows.sort().join('\n')}\n`
}
