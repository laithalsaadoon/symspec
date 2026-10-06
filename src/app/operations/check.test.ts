/**
 * Tests for the `check` operation: the option surface, the v5 additions, and the
 * exit-code contract.
 *
 * ## These run the REAL handler over the REAL solver
 *
 * The document store is in-memory (so a test asserts against a document it built,
 * with no filesystem), but the SolverService Layer is the shipped one and Z3 really
 * boots. Stubbing the solver would make these tests assert the shape of a mock, and the
 * whole point of `check` is what the solver concludes. Here the concern is the SHELL: does
 * an option reach the tier, does a repair get attached, does the exit contract hold.
 *
 * ## The exit-code gap this file exists to keep closed
 *
 * `exitCodeForEnvelope` was fully implemented and fully tested in G1 — and never
 * CALLED on the success path, because no G1 operation produced findings, so every
 * reachable success genuinely was exit 0. `check` made it reachable: `--strict`
 * produced `strictGate:'fail'` in the envelope and exit 0 at the shell, which is
 * the worst possible shape for a CI gate. Fixed in `../cli.ts`, and the assertions
 * at the bottom of this file are what keep it fixed — they go through the real
 * bundle, because the bug was in the CLI shell and an in-process test of the
 * handler could never have caught it.
 */

import { Effect, Layer, type Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { stubEmbedder } from '../../adapters/embedding/embedder.ts'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import type { Embedder } from '../../domain/engine/formal/embed.ts'
import { requirementsContentHash } from '../../domain/requirements/content-hash.ts'
import {
  DOC_VERSION,
  emptyDocument,
  type LoadedDocument,
  type Requirement,
  type RequirementsDocument,
} from '../../domain/requirements/document.ts'
import { foldOps } from '../../domain/requirements/mutate.ts'
import type { DocumentOp } from '../../domain/requirements/ops.ts'
import {
  DocPath,
  DocStore,
  documentOnlyStore,
  makeDocPath,
  type SaveInput,
} from '../../ports/doc-store.ts'
import { embedderLayerOf } from '../../ports/embedder.ts'
import { ErrDocNotFound, type OperationalError } from '../../ports/errors.ts'
import { EXIT_CLEAN, EXIT_FINDINGS_FAILURE, EXIT_INCONCLUSIVE } from '../../ports/exit.ts'
import { SolverService } from '../../ports/solver.ts'
import { buildDoc, orthogonalEmbedder } from '../../testing/gaming.ts'
import { exitCodeForEnvelope } from '../runtime/exit.ts'
import { runOperation } from '../runtime/operation.ts'
import {
  type CheckPayload,
  checkOp,
  MAX_TEMPORAL_BOUND,
  REACHABILITY_TIMEOUT_IS_CANCELLABILITY,
  resolveReachabilityTimeoutMs,
} from './check.ts'
import { MUTATE_OPTIONS } from './mutate-options.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TS = '2026-01-01T00:00:00.000Z'

/** A v3 requirement with defaults filled, so a test names only what it varies. */
const req = (
  partial: Partial<Requirement> & Pick<Requirement, 'id' | 'sentence'>,
): Requirement => ({
  patternType: 'ubiquitous',
  systemName: 'system',
  systemResponse: 'operate',
  negated: false,
  priority: 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: TS,
  updatedAt: TS,
  ...partial,
})

const docOf = (...requirements: readonly Requirement[]): RequirementsDocument => ({
  ...emptyDocument(),
  requirements: Object.fromEntries(requirements.map((r) => [r.id, r])),
})

/**
 * The canonical PROVABLE contradiction: one trigger, `grant` vs `revoke`, which the
 * seed antonym table already unifies to one atom at opposite polarity. Chosen
 * because it produces an error-severity `FND_CONTRADICTION` with no glossary or
 * antonym setup, so a test asserting the exit-1 path does not also depend on the
 * document's side tables.
 */
const contradictoryDoc = (): RequirementsDocument =>
  docOf(
    req({
      id: '11111111-1111-4111-8111-111111111111',
      patternType: 'event-driven',
      trigger: 'the user submits valid credentials',
      systemName: 'auth service',
      systemResponse: 'grant access',
      sentence: 'When the user submits valid credentials, the auth service shall grant access.',
    }),
    req({
      id: '22222222-2222-4222-8222-222222222222',
      patternType: 'event-driven',
      trigger: 'the user submits valid credentials',
      systemName: 'auth service',
      systemResponse: 'revoke access',
      sentence: 'When the user submits valid credentials, the auth service shall revoke access.',
    }),
  )

/**
 * Two requirements with DISJOINT vocabulary, so nothing can be cross-compared. The
 * shape that produces `uncovered-requirement` demotions and therefore a
 * `verified: false` with no error finding — the exit-3 path.
 */
const disjointDoc = (): RequirementsDocument =>
  docOf(
    req({
      id: '33333333-3333-4333-8333-333333333333',
      patternType: 'event-driven',
      trigger: 'a payment settles',
      systemName: 'ledger',
      systemResponse: 'post the journal entry',
      sentence: 'When a payment settles, the ledger shall post the journal entry.',
    }),
    req({
      id: '44444444-4444-4444-8444-444444444444',
      patternType: 'event-driven',
      trigger: 'a shipment departs',
      systemName: 'warehouse',
      systemResponse: 'decrement the stock count',
      sentence: 'When a shipment departs, the warehouse shall decrement the stock count.',
    }),
  )

/**
 * `n` requirements that SHARE one system and one trigger, so every pair is a
 * candidate pair — the shape whose solver cost a `--solver-budget-ms` actually
 * bounds, and therefore the only shape that can exercise the AC-A-8 hint.
 *
 * ## Two constraints on the generated text, both learned the hard way
 *
 * The response objects are word-spelled and drawn from a fixed pool because a BARE
 * NUMBER fires `GTWR_R6_MISSING_UNITS` at error severity, the AC-3-7 gate then
 * excludes every requirement from the formal tier, and the document silently becomes
 * a lint fixture with `pairsChecked: 0`. The first version of `scripts/budget-curve.ts`
 * did exactly that and measured a flat 110ms at every N while reporting a plausible
 * number — nothing failed.
 *
 * And they must be DISTINCT, or the exact-duplicate detector collapses the pairs.
 */
const sharedTriggerDoc = (n: number): RequirementsDocument => {
  const objects = [
    'the primary queue',
    'the standby queue',
    'the audit log',
    'the retry ledger',
    'the dispatch table',
    'the operator console',
  ] as const
  const suffixes = ['', ' alpha', ' beta', ' gamma', ' delta'] as const
  const requirements: Requirement[] = []
  for (let i = 0; i < n; i++) {
    const response = `update ${objects[i % objects.length]}${suffixes[Math.floor(i / objects.length) % suffixes.length]}`
    requirements.push(
      req({
        id: `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
        patternType: 'event-driven',
        trigger: 'the operator confirms the plan',
        systemName: 'scheduler',
        systemResponse: response,
        sentence: `When the operator confirms the plan, the scheduler shall ${response}.`,
      }),
    )
  }
  return docOf(...requirements)
}

// ---------------------------------------------------------------------------
// The in-memory store, plus the REAL solver Layer
// ---------------------------------------------------------------------------

interface MemoryFs {
  readonly files: Map<string, RequirementsDocument>
  readonly saves: SaveInput[]
}

const memoryStore = (fs: MemoryFs) =>
  Layer.succeed(DocStore)(
    documentOnlyStore({
      load: (path) => {
        const doc = fs.files.get(path)
        if (doc === undefined) {
          return Effect.fail(
            new ErrDocNotFound({
              error: `Could not read a requirements document at ${path}.`,
              suggestions: [`Run \`symspec init ${path}\`.`],
            }),
          )
        }
        return Effect.succeed({
          document: doc,
          unknownKeys: {},
          diagnostics: [],
        } satisfies LoadedDocument)
      },
      save: (path, input) =>
        Effect.sync(() => {
          fs.files.set(path, input.document)
          fs.saves.push(input)
        }),
      exists: (path) => Effect.succeed(fs.files.has(path)),
    }),
  )

/**
 * Run `check` over one document, returning the Result.
 *
 * The solver Layer is NOT `Layer.fresh`ed: these tests want the process-wide memo,
 * so the WASM module boots once for the whole file instead of once per test. That
 * turns a ~15s file into a ~3s one, and it is safe precisely because no test here
 * abandons a query (the wedge tests live in `../formal/solver-service.test.ts` and
 * use their own sacrificial `Layer.fresh` build for exactly this reason).
 */
const runCheckOp = (
  document: RequirementsDocument,
  input: Record<string, unknown> = {},
  embedder: Embedder = stubEmbedder(),
): Promise<
  | { readonly _tag: 'Success'; readonly success: { readonly data: CheckPayload } }
  | { readonly _tag: 'Failure'; readonly failure: OperationalError | Schema.SchemaError }
> => {
  const fs: MemoryFs = { files: new Map([['doc.json', document]]), saves: [] }
  return Effect.runPromise(
    Effect.result(runOperation(checkOp, { file: 'doc.json', ...input })).pipe(
      Effect.provide(
        Layer.mergeAll(
          memoryStore(fs),
          Layer.succeed(DocPath)(makeDocPath({})),
          solverServiceLayer,
          // The DETERMINISTIC stub by default, so these tests exercise the always-on
          // semantic tier without the ~110 MB model. Not a fallback — a caller with no stub
          // and no cached model still fails closed with ERR_EMBED_MODEL_MISSING.
          //
          // Overridable, because the stub's cosines are deliberately meaningless: a test
          // about a THRESHOLD has to supply hand-authored vectors or it is asserting a hash.
          embedderLayerOf(embedder),
        ),
      ),
    ),
  ) as never
}

/** Unwrap a success, failing the test with the real error if it was a failure. */
const expectOk = async (
  document: RequirementsDocument,
  input: Record<string, unknown> = {},
  embedder?: Embedder,
): Promise<CheckPayload> => {
  const result = await runCheckOp(document, input, embedder)
  if (result._tag === 'Failure') {
    throw new Error(`expected success, got ${JSON.stringify(result.failure)}`)
  }
  return result.success.data
}

// ---------------------------------------------------------------------------
// The formal path works
// ---------------------------------------------------------------------------

describe('check — the formal path reaches Z3 through the Layer', () => {
  it('proves a grant/revoke contradiction at error severity', async () => {
    const data = await expectOk(contradictoryDoc())
    const contradictions = data.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    expect(contradictions.length).toBeGreaterThan(0)
    // Names BOTH culprits: a finding that named one would be a localization
    // regression, which is the failure v4's unsat-core minimization guards.
    const named = new Set(contradictions.flatMap((f) => f.requirementIds))
    expect(named.has('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(named.has('22222222-2222-4222-8222-222222222222')).toBe(true)
    expect(data.counts.error).toBeGreaterThan(0)

    // `verified` is TRUE here, and that is not a contradiction in terms — it is the
    // distinction the field exists to make, which G2a could not observe.
    //
    // `verified` answers "was consistency CHECKED", not "is the document clean". A
    // proven contradiction is the strongest possible evidence that the decide tier ran
    // and reached a verdict, so coverage is complete. What says the document is bad is
    // `counts.error` and the exit code (1), not this flag.
    //
    // Through G2a this assertion read `false`, and it PASSED — but for the wrong
    // reason: no embedder was supplied, so every run carried a `semantic-tier-skipped`
    // demotion and `verified` was false on every document regardless of its content.
    // Now that the tier runs, the demotion is discharged and the flag reports what it
    // was designed to report. A test that had asserted the G2a value would have
    // encoded a configuration artifact as a contract.
    expect(data.verified).toBe(true)
    expect(data.coverage.demotions, 'nothing left to demote — the tier ran').toEqual([])
    // The GRADIENT still says there is work: `verified` and `openFindings` are
    // independent axes, which is exactly why `progress` reports both.
    expect(data.progress.openFindings).toBeGreaterThan(0)
  })

  it('DEMOTES `verified` when the semantic tier is skipped, on the SAME document', async () => {
    // The other half of the pair above, and the reason `--semantic=false` is not a
    // quiet opt-out: skipping the tier is DISCLOSED as a demotion, so the identical
    // document that verifies with the tier on cannot verify with it off.
    //
    // Demotion-only doctrine, observable in one comparison: turning a detector off
    // can only move `verified` toward abstention.
    const data = await expectOk(contradictoryDoc(), { semantic: false })
    expect(data.verified).toBe(false)
    expect(data.coverage.demotions.map((d) => d.reason)).toContain('semantic-tier-skipped')
    // The conflict is still proven — skipping the PROPOSE tier does not blind the
    // DECIDE tier, which is the whole point of the split.
    expect(data.counts.error).toBeGreaterThan(0)
  })

  it('an empty document is vacuously verified and clean', async () => {
    const data = await expectOk(emptyDocument())
    // v4's rule: fewer than two requirements is vacuously verified, because
    // there is nothing to cross-compare. Asserted so a future "be stricter about
    // empty documents" change is a visible decision.
    expect(data.verified).toBe(true)
    expect(data.counts.error).toBe(0)
    expect(data.coverage.demotions).toEqual([])
    expect(data.progress).toEqual({ demotions: 0, openFindings: 0, atomsUncompared: 0 })
  })

  it('surfaces the resolved path and the load diagnostics on every run', async () => {
    const data = await expectOk(emptyDocument())
    expect(data.path).toBe('doc.json')
    // The V27 disclosure channel reaches `check` too, not just the reads.
    expect(data.diagnostics).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The v5 additions
// ---------------------------------------------------------------------------

describe('check — the v5 report additions (AC-A-1, AC-A-2)', () => {
  it('EVERY demotion carries a runnable repair with no placeholders', async () => {
    const data = await expectOk(disjointDoc())
    expect(data.coverage.demotions.length).toBeGreaterThan(0)
    for (const demotion of data.coverage.demotions) {
      expect(demotion.repair, `${demotion.reason} has no repair`).toBeDefined()
      const commands = demotion.repair?.commands ?? []
      expect(commands.length, `${demotion.reason} has an empty repair`).toBeGreaterThan(0)
      for (const command of commands) {
        // RUNNABLE means no placeholders. `<blocking-code>` in v4's action
        // prose is exactly the defect the repair join closes, so an angle-bracket
        // slot surviving into a COMMAND is a regression.
        expect(command, `placeholder in: ${command}`).not.toMatch(/<[a-z-]+>/)
        expect(command.startsWith('symspec ')).toBe(true)
      }
      // v4's prose is PRESERVED alongside, never replaced: it carries the
      // reasoning (why a waiver cannot discharge a coverage fact) that a command
      // cannot express.
      expect(typeof demotion.action).toBe('string')
    }
  })

  it('the repair for a rewrite-only demotion suggests READS, never an invented edit', async () => {
    const data = await expectOk(disjointDoc())
    const uncovered = data.coverage.demotions.filter((d) => d.reason === 'uncovered-requirement')
    expect(uncovered.length).toBeGreaterThan(0)
    for (const demotion of uncovered) {
      const commands = demotion.repair?.commands ?? []
      // `show` then `list` — the two reads that give an agent the input a rewrite
      // needs. Crucially NOT a `symspec update --system-response "…"`, which would
      // mean the tool authoring requirement text it has no basis for.
      expect(commands.some((c) => c.startsWith('symspec show '))).toBe(true)
      expect(commands.some((c) => c.startsWith('symspec list '))).toBe(true)
      expect(commands.some((c) => c.includes('update'))).toBe(false)
    }
  })

  it('progress reaches zero on all three axes exactly when the run is clean', async () => {
    const clean = await expectOk(emptyDocument())
    expect(clean.progress.demotions).toBe(0)
    expect(clean.progress.openFindings).toBe(0)
    expect(clean.progress.atomsUncompared).toBe(0)
    // `demotions === 0` and `verified === true` are the same statement; asserting
    // the identity keeps the gradient honest rather than merely correlated.
    expect(clean.verified).toBe(clean.progress.demotions === 0)

    const conflicted = await expectOk(contradictoryDoc())
    expect(conflicted.progress.openFindings).toBe(conflicted.counts.error)
    expect(conflicted.progress.demotions).toBe(conflicted.coverage.demotions.length)
    expect(conflicted.progress.atomsUncompared).toBe(conflicted.residualRisk.unmatchedAtoms)
  })

  it('openFindings counts ERROR severity only, so warn/info do not move the gradient', async () => {
    const data = await expectOk(disjointDoc())
    // This document produces info findings and no errors, so the gradient's finding
    // axis must be 0 even though `findings[]` is non-empty. Counting warn/info would
    // make the gradient move on changes that cannot affect the outcome.
    expect(data.counts.info).toBeGreaterThan(0)
    expect(data.counts.error).toBe(0)
    expect(data.progress.openFindings).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// AC-A-8 — the budget hint, end to end
// ---------------------------------------------------------------------------

/**
 * The AC-A-8 claim, stated as the brief states it: a document big enough to demote
 * for solver-budget reasons carries a hint that, WHEN APPLIED, un-demotes.
 *
 * These are the tests that make the hint a capability rather than a computed field.
 * `../formal/budget-hint.test.ts` covers the arithmetic against a synthetic report;
 * what only a real run can show is that the recommended number is actually SUFFICIENT
 * — the extrapolation could be internally consistent and still land below the true
 * cost, and no unit test over a fabricated report would notice.
 */
describe('check — data.budgetHint (AC-A-8)', () => {
  it('a 1ms budget truncates, and the hint it emits UN-DEMOTES when applied', async () => {
    const document = sharedTriggerDoc(10)

    // A 1ms budget is below the first tier's first unit of work by construction, so
    // the truncation is deterministic rather than load-dependent — which matters
    // because this assertion has to hold on a contended CI machine too.
    const truncated = await expectOk(document, { solverBudgetMs: 1 })
    const truncationDemotions = truncated.coverage.demotions.filter(
      (d) => d.reason === 'solver-budget-exhausted',
    )
    expect(truncationDemotions.length).toBeGreaterThan(0)
    expect(truncated.verified, 'a truncated run can never certify').toBe(false)

    const hint = truncated.budgetHint
    expect(hint, 'a truncated run must carry a budget hint').toBeDefined()
    if (hint === undefined) return
    expect(hint.reason).toBe('truncated')
    expect(hint.basis.budgetMs).toBe(1)
    expect(hint.basis.unrunUnits).toBeGreaterThan(0)
    expect(hint.recommendedBudgetMs).toBeGreaterThan(1)

    // THE CLAIM: apply the hint's own number, and the truncation demotions are gone.
    const applied = await expectOk(document, { solverBudgetMs: hint.recommendedBudgetMs })
    expect(
      applied.coverage.demotions.filter((d) => d.reason === 'solver-budget-exhausted'),
      'applying the recommended budget must clear every truncation demotion',
    ).toEqual([])
    // And on this document nothing else demotes either, so the run reaches the fixed
    // point the gradient exists to converge on.
    expect(applied.verified).toBe(true)
    expect(applied.progress.demotions).toBe(0)
  })

  it('the un-demoted run emits NO hint — the absence is the all-clear', async () => {
    // The complement of the test above, and the reason the field is optional: once the
    // budget is right there is nothing to recommend, so a hint on every run would be
    // noise an agent learns to skip past.
    const document = sharedTriggerDoc(10)
    const truncated = await expectOk(document, { solverBudgetMs: 1 })
    const recommended = truncated.budgetHint?.recommendedBudgetMs ?? 0
    expect(recommended).toBeGreaterThan(0)

    const applied = await expectOk(document, { solverBudgetMs: recommended })
    expect(applied.budgetHint).toBeUndefined()
    expect('budgetHint' in applied, 'the key is ABSENT, not undefined').toBe(false)
  })

  it('an UNBOUNDED run emits no hint, however long it takes', async () => {
    // The default. There is no budget to correct, and suggesting one would push a
    // bound onto a caller who deliberately ran without.
    const data = await expectOk(sharedTriggerDoc(10))
    expect(data.budgetHint).toBeUndefined()
  })

  it('the truncation REPAIR command names the SAME number the hint publishes', async () => {
    // Two renderings of one answer. A `repair.commands` line that disagreed with
    // `budgetHint.recommendedBudgetMs` would be the envelope contradicting itself in
    // two adjacent fields — and G2a's blind doubling did exactly that until the hint
    // became its source.
    const data = await expectOk(sharedTriggerDoc(10), { solverBudgetMs: 1 })
    const recommended = data.budgetHint?.recommendedBudgetMs
    expect(recommended).toBeDefined()
    const demotion = data.coverage.demotions.find((d) => d.reason === 'solver-budget-exhausted')
    expect(demotion?.repair?.commands).toEqual([
      `symspec check doc.json --solver-budget-ms ${recommended}`,
    ])
  })

  it('the basis reports the run`s OWN measurements, not a table lookup', async () => {
    const data = await expectOk(sharedTriggerDoc(10), { solverBudgetMs: 1 })
    const basis = data.budgetHint?.basis
    expect(basis).toBeDefined()
    if (basis === undefined) return
    // Each number is read off the report published next to it, so an agent can check
    // the arithmetic rather than trusting it.
    expect(basis.requirements).toBe(data.coverage.encoded)
    expect(basis.pairs).toBe(data.pairsChecked)
    // The anchor: wall clock this run spent, on this machine, under this load. A
    // committed millisecond table was ruled out by measurement — see the module
    // header in `../formal/budget-hint.ts`.
    expect(basis.measuredMsAtBudget).toBeGreaterThan(0)
  })

  it('is ADDITIVE — a --min-severity filter cannot strip it', async () => {
    // The same rule the demotion repairs follow: an output filter is a presentation
    // choice, and letting it change what budget is recommended would remove the hint
    // from exactly the info-tier truncation demotions that raise it.
    const data = await expectOk(sharedTriggerDoc(10), {
      solverBudgetMs: 1,
      minSeverity: 'error',
    })
    expect(data.budgetHint?.reason).toBe('truncated')
  })
})

// ---------------------------------------------------------------------------
// Options reach the tier
// ---------------------------------------------------------------------------

describe('check — the option surface', () => {
  it('--strict sets strictGate on an unverified run and leaves it undefined otherwise', async () => {
    const gated = await expectOk(disjointDoc(), { strict: true })
    expect(gated.verified).toBe(false)
    expect(gated.strictGate).toBe('fail')

    const ungated = await expectOk(disjointDoc())
    // Left UNDEFINED, not `'pass'`, when no gate was requested: the field's presence
    // is what says a gate ran, so a default run's contract stays unchanged.
    expect(ungated.strictGate).toBeUndefined()
  })

  it('--strict PASSES on a vacuously verified document', async () => {
    const data = await expectOk(emptyDocument(), { strict: true })
    expect(data.strictGate).toBe('pass')
  })

  it('--fail-on-unmatched trips independently of --strict, and -1 disables it', async () => {
    const tripped = await expectOk(disjointDoc(), { failOnUnmatched: 0 })
    expect(tripped.residualRisk.unmatchedAtoms).toBeGreaterThan(0)
    expect(tripped.strictGate).toBe('fail')

    // `null` — an ABSENT flag — is the disabled state, and 0 is a meaningful
    // threshold (fail on any). If the option translation guarded on `> 0` instead of
    // on nullness, `--fail-on-unmatched 0` would silently disable the strictest
    // legal setting; both ends are pinned here.
    const disabled = await expectOk(disjointDoc(), { failOnUnmatched: null })
    expect(disabled.strictGate).toBeUndefined()
  })

  it('rejects a NEGATIVE --fail-on-unmatched rather than treating it as disabled', async () => {
    // A negative threshold is meaningless (an unmatched-atom count is never < 0), and
    // silently reading it as "disabled" would let a typo turn a gate off. It is
    // unreachable from the CLI anyway — `-1` parses as the next flag — but the
    // schema-level path (a library caller, or a future non-CLI surface) must still
    // reject it loudly.
    const result = await runCheckOp(emptyDocument(), { failOnUnmatched: -1 })
    expect(result._tag).toBe('Failure')
    if (result._tag === 'Failure') {
      expect((result.failure as { _tag: string })._tag).toBe('ERR_USAGE')
    }
  })

  it('--min-severity filters output without changing counts or the verdict', async () => {
    const full = await expectOk(disjointDoc())
    const filtered = await expectOk(disjointDoc(), { minSeverity: 'error' })
    expect(full.counts.info).toBeGreaterThan(0)
    // The filter drops info findings from the ARRAY...
    expect(filtered.findings.length).toBeLessThan(full.findings.length)
    // ...but `counts` still reports the full post-waiver set, so a filtered view
    // truthfully says how much it hid, and the exit code is unchanged.
    expect(filtered.counts).toEqual(full.counts)
    expect(filtered.verified).toBe(full.verified)
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data: filtered })).toBe(
      exitCodeForEnvelope({ apiVersion: 1, type: 'check', data: full }),
    )
  })

  it('--min-severity error does NOT strip the repairs off info-tier demotions', async () => {
    // The ordering trap: repairs are computed from the UNFILTERED findings, because a
    // demotion's repair depends on the finding that RAISED it. Computing them after
    // the filter would leave every info-tier demotion repair-less under
    // `--min-severity error` — the demotions an agent most needs a command for.
    const filtered = await expectOk(disjointDoc(), { minSeverity: 'error' })
    expect(filtered.coverage.demotions.length).toBeGreaterThan(0)
    for (const demotion of filtered.coverage.demotions) {
      expect(demotion.repair, `${demotion.reason} lost its repair under a filter`).toBeDefined()
    }
  })

  it('--findings-only drops the excluded table and nothing else', async () => {
    const data = await expectOk(disjointDoc(), { findingsOnly: true })
    expect(data.excluded).toEqual([])
    // The findings themselves, and therefore the gate, are untouched.
    expect(data.counts.info).toBeGreaterThan(0)
  })

  it('--temporal-bound 0 means the tier is OFF; a positive bound enables it', async () => {
    // The v5 simplification: one flag instead of v4's `--temporal` +
    // `--temporal-bound` pair, so a bound cannot be supplied to a tier that is off.
    const off = await expectOk(contradictoryDoc(), { temporalBound: 0 })
    expect(off.findings.some((f) => f.code === 'FND_TEMPORAL_CONTRADICTION')).toBe(false)

    const on = await expectOk(contradictoryDoc(), { temporalBound: 4 })
    // The tier RAN — asserted via the report rather than by requiring a temporal
    // finding on this particular fixture, since whether a temporal contradiction
    // exists is the tier's business, not this test's.
    expect(on.findings.length).toBeGreaterThanOrEqual(off.findings.length)
  })
})

// ---------------------------------------------------------------------------
// Usage errors
// ---------------------------------------------------------------------------

describe('check — usage errors are ERR_USAGE with a runnable correction', () => {
  const expectUsage = async (input: Record<string, unknown>, matcher: RegExp) => {
    const result = await runCheckOp(emptyDocument(), input)
    expect(result._tag).toBe('Failure')
    if (result._tag !== 'Failure') return
    // `readonly string[]`, matching the `Repair` type: a mutable `string[]` here is
    // TS2352, because `readonly T[]` is not assignable to `T[]` in an assertion.
    const failure = result.failure as {
      _tag: string
      error: string
      repair?: { commands: readonly string[] }
    }
    expect(failure._tag).toBe('ERR_USAGE')
    expect(failure.error).toMatch(matcher)
    // Every usage error carries the CORRECTED invocation as a runnable command —
    // AC-A-9 applied to usage, so a typo is self-correcting.
    expect(failure.repair?.commands.length).toBeGreaterThan(0)
    expect(failure.repair?.commands[0]).toMatch(/^symspec check /)
  }

  it('rejects a non-positive --timeout-ms', () => expectUsage({ timeoutMs: 0 }, /--timeout-ms/))

  it('rejects a negative --solver-budget-ms', () =>
    expectUsage({ solverBudgetMs: -1 }, /--solver-budget-ms/))

  it('rejects a negative --fail-on-unmatched', () =>
    expectUsage({ failOnUnmatched: -2 }, /--fail-on-unmatched/))

  it('rejects a --temporal-bound over the cap, and EXPLAINS the cap', async () => {
    const result = await runCheckOp(emptyDocument(), { temporalBound: MAX_TEMPORAL_BOUND + 1 })
    expect(result._tag).toBe('Failure')
    if (result._tag !== 'Failure') return
    const failure = result.failure as { _tag: string; error: string }
    expect(failure._tag).toBe('ERR_USAGE')
    // The message must carry the JUSTIFICATION, not just the number. A bare "max is
    // 200" invites a reader to assume the cap is arbitrary and route around it; the
    // reason it exists is that the encode phase is not interruptible by any knob.
    expect(failure.error).toMatch(/not interruptible/)
    expect(failure.error).toMatch(/heap limit/)
    expect(failure.error).toMatch(String(MAX_TEMPORAL_BOUND))
  })

  it('validates BEFORE loading the document, so a usage error needs no valid doc', async () => {
    // A bad option on a document that does not exist must still be ERR_USAGE, not
    // ERR_DOC_NOT_FOUND: the invocation is wrong regardless of what it points at,
    // and reporting the document first would send an agent to fix the wrong thing.
    const fs: MemoryFs = { files: new Map(), saves: [] }
    const result = await Effect.runPromise(
      Effect.result(runOperation(checkOp, { file: 'missing.json', timeoutMs: -5 })).pipe(
        Effect.provide(
          Layer.mergeAll(
            memoryStore(fs),
            Layer.succeed(DocPath)(makeDocPath({})),
            solverServiceLayer,
            embedderLayerOf(stubEmbedder()),
          ),
        ),
      ),
    )
    expect(result._tag).toBe('Failure')
    if (result._tag === 'Failure') {
      expect((result.failure as { _tag: string })._tag).toBe('ERR_USAGE')
    }
  })
})

// ---------------------------------------------------------------------------
// The exit contract, computed from the envelope
// ---------------------------------------------------------------------------

describe('check — the exit contract', () => {
  it('maps a proven contradiction to EXIT_FINDINGS_FAILURE (1)', async () => {
    const data = await expectOk(contradictoryDoc())
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data })).toBe(EXIT_FINDINGS_FAILURE)
  })

  it('maps a tripped strict gate with NO error finding to EXIT_INCONCLUSIVE (3)', async () => {
    const data = await expectOk(disjointDoc(), { strict: true })
    expect(data.counts.error).toBe(0)
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data })).toBe(EXIT_INCONCLUSIVE)
  })

  it('a proven defect OUTRANKS the strict gate', async () => {
    // Both conditions hold at once here: an error finding AND (potentially) a
    // tripped gate. The stronger news wins — "your spec is broken" beats "I could
    // not fully check it" — so the code must be 1, not 3.
    const data = await expectOk(contradictoryDoc(), { strict: true })
    expect(data.counts.error).toBeGreaterThan(0)
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data })).toBe(EXIT_FINDINGS_FAILURE)
  })

  it('maps a verified clean run to EXIT_CLEAN (0)', async () => {
    const data = await expectOk(emptyDocument(), { strict: true })
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data })).toBe(EXIT_CLEAN)
  })

  it('info-only findings still exit clean', async () => {
    const data = await expectOk(disjointDoc())
    expect(data.counts.info).toBeGreaterThan(0)
    expect(data.counts.error).toBe(0)
    // warn/info are deliberately outside the pass/fail gate, so a document that
    // merely tripped an advisory rule is not a build failure.
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data })).toBe(EXIT_CLEAN)
  })
})

// ---------------------------------------------------------------------------
// The Layer boots lazily, and once
// ---------------------------------------------------------------------------

describe('check — the solver Layer', () => {
  it('does not boot WASM for an operation that never yields boot', async () => {
    // The laziness that makes merging the solver Layer into the composition root
    // free. A provided Layer is BUILT eagerly on beta.102 (probed), so this asserts
    // the property that actually matters: reaching the service costs no init.
    const reached = await Effect.runPromise(
      Effect.map(SolverService, (s) => typeof s.solve).pipe(Effect.provide(solverServiceLayer)),
    )
    expect(reached).toBe('function')
  })

  it('reports the document version it validated against', async () => {
    // A guard on the compat boundary: `check` reads a v3 document, and the tier sees
    // a v2-shaped view. If the projection ever pointed at the wrong version the
    // store's load would fail first, so this pins that the document under test is
    // genuinely v3.
    const data = await expectOk(emptyDocument())
    expect(data.path).toBe('doc.json')
    expect(DOC_VERSION).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// The reachability tier (G4) — wired in, and opt-in
// ---------------------------------------------------------------------------

/**
 * `check`'s reachability integration.
 *
 * Two claims, and the second matters as much as the first:
 *
 * 1. When a state model IS committed, the tier runs and its verdicts reach `findings[]`,
 *    `coverage.demotions[]`, `counts`, `verified`, and the exit code.
 * 2. When one is NOT committed, the tier's absence is DISCLOSED and nothing else changes —
 *    no key, no demotion, one info `FND_REACHABILITY_NOT_CHECKED`, which is what the
 *    published scope promises. Asserted DIRECTLY rather than left implicit in the other
 *    fixtures: those could all grow a state model one day without anyone noticing.
 */
describe('the reachability tier runs ONLY when a state model is committed (G4)', () => {
  /** A UUID-shaped id, so the document schema accepts it. */
  const rid = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`

  /** A lock model whose one constraint is PROVABLE with nothing assumed. */
  const provableDoc = (): RequirementsDocument => ({
    ...docOf(
      req({
        id: rid(1),
        key: 'TX-A1',
        sentence: 'The lock manager shall grant the lock.',
        systemResponse: 'grant the lock',
        responseKind: 'effect',
        stateEffect: 'when granted = 0: granted := granted + 1',
      }),
      req({
        id: rid(2),
        key: 'TX-A2',
        sentence: 'The lock manager shall release the lock.',
        systemResponse: 'release the lock',
        responseKind: 'effect',
        stateEffect: 'when granted = 1: granted := granted - 1',
      }),
      req({
        id: rid(3),
        key: 'TX-C1',
        sentence: 'The lock manager shall hold at most one lock.',
        systemResponse: 'hold at most one lock',
        responseKind: 'constraint',
        stateConstraint: 'granted <= 1',
      }),
    ),
    stateModel: {
      variables: [
        {
          name: 'granted',
          type: 'int',
          frame: 'volatile',
          initial: 'granted = 0',
          domain: { min: 0, max: 4 },
        },
      ],
    },
  })

  /** The SAME requirements with a genuine defect: an effect that violates the constraint. */
  const violatedDoc = (): RequirementsDocument => {
    const base = provableDoc()
    return {
      ...base,
      requirements: {
        ...base.requirements,
        [rid(4)]: req({
          id: rid(4),
          key: 'TX-A3',
          sentence: 'The lock manager shall force a second grant.',
          systemResponse: 'force a second grant',
          responseKind: 'effect',
          // Unguarded, and it can push `granted` to 2 — a real violation of TX-C1 reached
          // through a change this requirement itself makes.
          stateEffect: 'granted := granted + 2',
        }),
      },
    }
  }

  // -------------------------------------------------------------------------
  // The tier is OFF without a state model
  // -------------------------------------------------------------------------

  it('without a state model: no `reachability` key, one NOT_CHECKED disclosure, no demotion', async () => {
    // Two requirements co-live under one trigger, so the rest of the run certifies and the
    // assertion below can see that the disclosure does not demote.
    const payload = await expectOk(
      docOf(
        req({
          id: rid(1),
          patternType: 'event-driven',
          trigger: 'the operator presses start',
          systemResponse: 'start the pump',
          sentence: 'When the operator presses start, the system shall start the pump.',
        }),
        req({
          id: rid(2),
          patternType: 'event-driven',
          trigger: 'the operator presses start',
          systemResponse: 'sound the chime',
          sentence: 'When the operator presses start, the system shall sound the chime.',
        }),
      ),
    )
    // ABSENT, not empty — the tier did not run, so it has no numbers to report.
    expect('reachability' in payload).toBe(false)
    // The published scope promises the tier's absence is DISCLOSED, not silent.
    const reach = payload.findings.filter((f) => f.code.startsWith('FND_REACHABILITY'))
    expect(reach.map((f) => [f.code, f.severity])).toEqual([
      ['FND_REACHABILITY_NOT_CHECKED', 'info'],
    ])
    expect(reach[0]?.message).toMatch(/no state model is committed/)
    expect(payload.counts.info).toBeGreaterThanOrEqual(1)
    // The tier is opt-in, like the temporal tier: its absence is disclosed but does not demote.
    expect(
      payload.coverage.demotions.some((d) => String(d.reason).startsWith('reachability')),
    ).toBe(false)
    expect(payload.verified).toBe(true)
  })

  it('the no-state-model disclosure honours --min-severity like every other info finding', async () => {
    const payload = await expectOk(
      docOf(req({ id: rid(1), sentence: 'The system shall operate.' })),
      { minSeverity: 'warn' },
    )
    expect(payload.findings.some((f) => f.code === 'FND_REACHABILITY_NOT_CHECKED')).toBe(false)
  })

  it('is off for an EMPTY state model too, not merely for a missing one', async () => {
    // `emptyDocument()` carries `stateModel: {variables: []}`, so "no state model" and
    // "an empty state model" are the same document on disk. The gate is the variable
    // COUNT, and this pins that rather than a key check.
    const payload = await expectOk({
      ...docOf(req({ id: rid(1), sentence: 'The system shall operate.' })),
      stateModel: { variables: [] },
    })
    expect('reachability' in payload).toBe(false)
  })

  // -------------------------------------------------------------------------
  // The tier is ON with one, and reaches every published surface
  // -------------------------------------------------------------------------

  it('PROVES a provable constraint, with the re-verified invariant as evidence', async () => {
    const payload = await expectOk(provableDoc())
    expect(payload.reachability).toBeDefined()
    expect(payload.reachability?.variables).toBe(1)
    expect(payload.reachability?.effects).toBe(2)
    expect(payload.reachability?.proved).toBe(1)
    expect(payload.reachability?.violated).toBe(0)

    const proved = payload.findings.find((f) => f.code === 'FND_REACHABILITY_PROVED')
    expect(proved?.severity).toBe('info')
    expect(proved?.requirementIds).toEqual([rid(3)])
    // The certificate check ran and passed — that is what makes the proof reportable.
    expect(
      (proved?.evidence as unknown as { certificateVerified?: boolean } | undefined)
        ?.certificateVerified,
    ).toBe(true)
    // A PROVED verdict adds NO demotion, which is the mechanism by which `verified` may
    // stay true.
    expect(
      payload.coverage.demotions.filter((d) => String(d.reason).startsWith('reachability')),
    ).toEqual([])
  })

  it('reports a genuine violation at ERROR severity, with a trace naming requirements', async () => {
    const payload = await expectOk(violatedDoc())
    expect(payload.reachability?.violated).toBeGreaterThan(0)

    const violated = payload.findings.find((f) => f.code === 'FND_REACHABILITY_VIOLATED')
    expect(violated?.severity).toBe('error')
    // The trace cites the requirement's own KEY, not an internal rule name (v4 V29).
    expect(violated?.message).toContain('TX-A3')

    // And it flows into the tallies the exit contract reads, so exit 1 needs no new wiring.
    expect(payload.counts.error).toBeGreaterThan(0)
  })

  it('the reachability finding count is INCLUDED in `counts`, not reported beside it', async () => {
    // The counts must describe the same array the payload publishes, or the exit code and
    // the findings disagree.
    const payload = await expectOk(provableDoc())
    const tallied = payload.counts.error + payload.counts.warn + payload.counts.info
    expect(payload.findings).toHaveLength(tallied)
  })

  it('DEMOTES `verified` when a state model is declared but nothing is classified', async () => {
    // The "silence made visible" case: declaring variables is the easy half, and a
    // document stuck there must not look like one that passed.
    const payload = await expectOk({
      ...docOf(req({ id: rid(1), sentence: 'The system shall operate.' })),
      stateModel: { variables: [{ name: 'granted', type: 'int', frame: 'volatile' }] },
    })
    const disclosure = payload.findings.find((f) => f.code === 'FND_REACHABILITY_NOT_CHECKED')
    expect(disclosure).toBeDefined()
    expect(payload.verified).toBe(false)
    const demotion = payload.coverage.demotions.find(
      (d) => String(d.reason) === 'reachability-not-checked',
    )
    // The demotion carries a RUNNABLE repair, not prose to parse.
    expect(demotion?.repair?.commands?.join(' ')).toContain('symspec classify')
  })

  it('honors `--min-severity error`, dropping the info-tier reachability findings', async () => {
    const payload = await expectOk(provableDoc(), { minSeverity: 'error' })
    expect(payload.findings.some((f) => f.code === 'FND_REACHABILITY_PROVED')).toBe(false)
    // But the SUMMARY still reports what happened — a presentation filter must not erase
    // the fact that the tier ran.
    expect(payload.reachability?.proved).toBe(1)
  })

  it('keeps an error-severity reachability finding under `--min-severity error`', async () => {
    // The property that makes the filter safe for a gate: `error` is the top of the
    // order, so it can never remove the finding the exit code keys on.
    const payload = await expectOk(violatedDoc(), { minSeverity: 'error' })
    expect(payload.findings.some((f) => f.code === 'FND_REACHABILITY_VIOLATED')).toBe(true)
  })

  it('is DETERMINISTIC: two runs over one document agree on every verdict', async () => {
    // SEQUENTIAL — `Promise.all` over two runs wedges Asyncify's single capability slot.
    const first = await expectOk(provableDoc())
    const second = await expectOk(provableDoc())

    // `elapsedMs` is EXCLUDED, and deliberately: it is a wall-clock measurement, so two
    // runs legitimately differ (measured 30ms then 8ms — the second is faster because the
    // WASM module is warm). Asserting on it would make the determinism guard a flaky
    // benchmark, which is worse than no guard: it trains people to re-run rather than read.
    //
    // The claim that matters is that the VERDICTS are reproducible given (document +
    // committed tables + pinned model), which is the determinism the whole tool rests on.
    const { elapsedMs: _firstMs, ...firstVerdicts } = first.reachability ?? {}
    const { elapsedMs: _secondMs, ...secondVerdicts } = second.reachability ?? {}
    expect(secondVerdicts).toEqual(firstVerdicts)
    expect(
      second.findings.filter((f) => f.code.startsWith('FND_REACHABILITY')).map((f) => f.code),
    ).toEqual(
      first.findings.filter((f) => f.code.startsWith('FND_REACHABILITY')).map((f) => f.code),
    )
  })
})

// ---------------------------------------------------------------------------
// `--reachability-timeout-ms` (G5) — the tier's OWN bound, split from the shared one
// ---------------------------------------------------------------------------

/**
 * The dedicated reachability bound.
 *
 * Three claims, and the ORDER they are asserted in is the order they would break in:
 *
 * 1. **Absent reproduces the shared behavior byte for byte.** This is what keeps the flag
 *    a pure addition: every existing fixture was pinned against `--timeout-ms` governing
 *    both, and none of them passes the new flag. A resolver that defaulted to a constant
 *    instead of inheriting would move fixture output on documents nobody edited.
 * 2. **Present overrides ONLY this tier.** The reason the split exists: raising a
 *    reachability bound 20x to decide an UNKNOWN must not hand seven per-pair
 *    propositional solvers 20x the rope.
 * 3. **0 is INHERIT, never unbounded** — the cancellability property. A negative is a
 *    usage error, so there is no spelling of "no bound" at all.
 */
describe('--reachability-timeout-ms bounds the reachability tier alone (G5)', () => {
  const rid = (n: number) => `cccccccc-0000-4000-8000-00000000000${n}`

  /** The same single-variable lock model the G4 tests use, which PROVES frame-closed. */
  const provable = (): RequirementsDocument => ({
    ...docOf(
      req({
        id: rid(1),
        key: 'TX-A1',
        sentence: 'The lock manager shall grant the lock.',
        systemResponse: 'grant the lock',
        responseKind: 'effect',
        stateEffect: 'when granted = 0: granted := granted + 1',
      }),
      req({
        id: rid(2),
        key: 'TX-C1',
        sentence: 'The lock manager shall hold at most one lock.',
        systemResponse: 'hold at most one lock',
        responseKind: 'constraint',
        stateConstraint: 'granted <= 1',
      }),
    ),
    stateModel: {
      variables: [
        {
          name: 'granted',
          type: 'int',
          frame: 'volatile',
          initial: 'granted = 0',
          domain: { min: 0, max: 4 },
        },
      ],
    },
  })

  // --- The resolver, in isolation -------------------------------------------

  it('0 INHERITS --timeout-ms — the sentinel is inherit, not unbounded', () => {
    expect(resolveReachabilityTimeoutMs(0, 2000)).toBe(2000)
    expect(resolveReachabilityTimeoutMs(0, 45)).toBe(45)
  })

  it('a positive value OVERRIDES --timeout-ms in both directions', () => {
    // Both directions, because a resolver written as `Math.max` would pass an
    // only-raises test and silently refuse to LOWER the reachability bound — which is the
    // useful direction when a hung model needs to fail fast.
    expect(resolveReachabilityTimeoutMs(8000, 2000)).toBe(8000)
    expect(resolveReachabilityTimeoutMs(250, 2000)).toBe(250)
  })

  it('records that the bound is a CANCELLABILITY mechanism, not merely a budget', () => {
    // Measured: a raw `Z3.interrupt` landed in 3ms while interrupting through the tier
    // took 10232ms against a 10000ms bound, because `Z3_interrupt` is cooperative. So an
    // unbounded query is an uncancellable one, and `0` must never come to mean unbounded.
    expect(REACHABILITY_TIMEOUT_IS_CANCELLABILITY).toBe(true)
  })

  // --- Through the real operation -------------------------------------------

  it('ABSENT reproduces --timeout-ms exactly — the pure-addition property', async () => {
    // SEQUENTIAL: `Promise.all` over two solver runs wedges Asyncify's capability slot.
    const shared = await expectOk(provable(), { timeoutMs: 3500 })
    const explicit = await expectOk(provable(), { timeoutMs: 3500, reachabilityTimeoutMs: 0 })
    // The tier PUBLISHES the bound it used, so this is checkable rather than inferred.
    expect(shared.reachability?.timeoutMs).toBe(3500)
    expect(explicit.reachability?.timeoutMs).toBe(3500)
  })

  it('a supplied value reaches the tier and is published', async () => {
    const payload = await expectOk(provable(), { timeoutMs: 2000, reachabilityTimeoutMs: 7000 })
    expect(payload.reachability?.timeoutMs).toBe(7000)
    // And the verdict is unchanged — the flag moves the BOUND, not the answer.
    expect(payload.reachability?.proved).toBe(1)
  })

  it('overrides DOWNWARD too, without changing a verdict this model reaches easily', async () => {
    // The 48ms measured cost of this model leaves plenty of room under 500ms, so a lower
    // bound is observable in `timeoutMs` without making the test a race.
    const payload = await expectOk(provable(), { timeoutMs: 9000, reachabilityTimeoutMs: 500 })
    expect(payload.reachability?.timeoutMs).toBe(500)
    expect(payload.reachability?.proved).toBe(1)
  })

  it('does NOT change what the SHARED --timeout-ms means for the other tiers', async () => {
    // The whole point of the split. The propositional tiers' bound must be untouched by
    // the reachability flag, and the observable proxy is that the reachability summary
    // reports the reachability bound while everything else behaves as it did — asserted
    // here as "the two numbers are different and both are honored".
    const payload = await expectOk(provable(), { timeoutMs: 1200, reachabilityTimeoutMs: 6000 })
    expect(payload.reachability?.timeoutMs).toBe(6000)
    expect(payload.reachability?.timeoutMs).not.toBe(1200)
    // A run that still completed, so the lower shared bound did not break the other tiers.
    expect(payload.verified === true || payload.coverage.demotions.length > 0).toBe(true)
  })

  it('rejects a NEGATIVE value with a runnable correction', async () => {
    const result = await runCheckOp(provable(), { reachabilityTimeoutMs: -1 })
    expect(result._tag).toBe('Failure')
    if (result._tag !== 'Failure') return
    const failure = result.failure as {
      _tag: string
      error: string
      repair?: { commands: readonly string[] }
    }
    expect(failure._tag).toBe('ERR_USAGE')
    expect(failure.error).toMatch(/--reachability-timeout-ms/)
    // The message must say what 0 MEANS, or a reader will try it as "unbounded".
    expect(failure.error).toMatch(/inherits --timeout-ms/)
    expect(failure.repair?.commands[0]).toMatch(/--reachability-timeout-ms/)
  })
})

// ---------------------------------------------------------------------------
// Every command the ENVELOPE prints is one the CLI accepts
// ---------------------------------------------------------------------------

/**
 * The whole-envelope sweep, over a real run.
 *
 * `formal/repair.test.ts` proves the normalizer works and that no source file spells a
 * command the CLI rejects. What it cannot prove is that `check` actually CALLS it on
 * every field it publishes — the wiring, not the function. So this asserts the property
 * an agent depends on, stated over the serialized payload: nothing anywhere in it names
 * a nested subcommand.
 *
 * The document is the quantity-alias shape because its finding message is the one that
 * carries a discharge command in FOUR places at once — the message, the demotion's
 * action, the coverage row's suggestion, and `repair.commands` — so a field left
 * unnormalized shows up here rather than in whichever surface someone reads next.
 */
describe('no command in a check envelope spells a nested subcommand', () => {
  const aliasDoc = (): RequirementsDocument =>
    docOf(
      req({
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        patternType: 'event-driven',
        trigger: 'the clinician starts an infusion',
        systemName: 'infusion pump',
        systemResponse: 'complete the infusion within 30 minutes',
        sentence:
          'When the clinician starts an infusion, the infusion pump shall complete the infusion within 30 minutes.',
      }),
      req({
        id: 'bbbbbbbb-2222-4222-8222-222222222222',
        patternType: 'event-driven',
        trigger: 'the clinician starts an infusion',
        systemName: 'infusion pump',
        systemResponse: 'run the infusion for at least 60 minutes',
        sentence:
          'When the clinician starts an infusion, the infusion pump shall run the infusion for at least 60 minutes.',
      }),
    )

  it('raises the alias candidate, so the sweep is over a real payload', async () => {
    const result = await runCheckOp(aliasDoc(), { strict: true })
    expect(result._tag).toBe('Success')
    if (result._tag !== 'Success') return
    // Guards the fixture: if the detector stops firing, the sweep below would pass
    // vacuously and this whole describe would silently stop testing anything.
    expect(result.success.data.findings.map((f) => f.code)).toContain(
      'FND_QUANTITY_ALIAS_CANDIDATE',
    )
  })

  it('names no `<operation> add` anywhere in the serialized payload', async () => {
    const result = await runCheckOp(aliasDoc(), { strict: true })
    expect(result._tag).toBe('Success')
    if (result._tag !== 'Success') return
    const wire = JSON.stringify(result.success.data)
    for (const operation of ['glossary', 'antonym', 'waive']) {
      expect(wire, `${operation} still carries import's side-table verb`).not.toContain(
        `symspec ${operation} add`,
      )
    }
  })

  it('publishes the discharge in the form that RUNS', async () => {
    const result = await runCheckOp(aliasDoc(), { strict: true })
    expect(result._tag).toBe('Success')
    if (result._tag !== 'Success') return
    const alias = result.success.data.coverage.demotions.find(
      (d) => d.reason === 'quantity-alias-candidate',
    )
    expect(alias?.repair?.commands[0]).toBe(
      'symspec glossary "complete the infusion" "run the infusion"',
    )
    // And the prose a human copies out of `--pretty` agrees with it.
    const finding = result.success.data.findings.find(
      (f) => f.code === 'FND_QUANTITY_ALIAS_CANDIDATE',
    )
    expect(finding?.message).toContain(
      '`symspec glossary "complete the infusion" "run the infusion"`',
    )
  })
})

// ---------------------------------------------------------------------------
// Two unconditional bounds are ONE context
// ---------------------------------------------------------------------------

/**
 * The most co-active pair a document can hold is the one the propose tier must not skip.
 *
 * A ubiquitous requirement carries neither guard slot, so a pair of them is unconditional: both
 * bounds hold at every instant. If the quantity-alias tier reads "no guard" as "no shared
 * context" it declines exactly the pair whose bounds are most certainly simultaneous, and the
 * run publishes neither the finding nor the demotion — silence about an unexamined possible
 * conflict, which is the one direction a propose-only tier can be wrong in.
 *
 * The two subjects here are genuinely distinct (`primary` vs `analytics` shard), so the
 * correct answer is a suggestion at `info` plus a demotion, and never a proof: the error count
 * is asserted at zero in the same test, which is what stops this fixture being satisfied by a
 * tier that answers by fabricating instead.
 */
describe('the alias candidate examines a pair with no guard at all', () => {
  const shardBound = (id: string, shard: string, bound: string): Requirement =>
    req({
      id,
      patternType: 'ubiquitous',
      systemName: 'database',
      systemResponse: `keep the ${shard} shard replication lag ${bound}`,
      sentence: `The database shall keep the ${shard} shard replication lag ${bound}.`,
    })

  const unconditionalDoc = (): RequirementsDocument =>
    docOf(
      shardBound('cccccccc-1111-4111-8111-111111111111', 'primary', 'at most 10 ms'),
      shardBound('dddddddd-2222-4222-8222-222222222222', 'analytics', 'at least 500 ms'),
    )

  it('raises the candidate and the demotion, without proving anything', async () => {
    const data = await expectOk(unconditionalDoc(), { strict: true })
    expect(data.findings.map((f) => f.code)).toContain('FND_QUANTITY_ALIAS_CANDIDATE')
    expect(data.coverage.demotions.map((d) => d.reason)).toContain('quantity-alias-candidate')
    // Distinct shards stay distinct: the suggestion is the whole answer, and an error here
    // would be the fabrication the widened quantity key exists to prevent.
    expect(data.counts.error).toBe(0)
  })

  it('describes the context it FOUND, so the message is checkable against the document', async () => {
    // There is no guard of either kind in this document, so a message claiming the two bounds
    // share one would be a false statement about the document in the finding that reports it.
    const data = await expectOk(unconditionalDoc(), { strict: true })
    const message =
      data.findings.find((f) => f.code === 'FND_QUANTITY_ALIAS_CANDIDATE')?.message ?? ''
    expect(message).toContain('with no precondition or trigger')
    expect(message).not.toContain('under the same system and the same precondition and trigger')
  })
})

// ---------------------------------------------------------------------------
// A precondition is a guard, and two of them can exclude each other
// ---------------------------------------------------------------------------

/**
 * The co-liveness key spans BOTH EARS guard slots, so a `state-driven` pair is never read as
 * unconditional.
 *
 * A `state-driven` requirement carries its guard in `preCondition` and leaves `trigger` unset.
 * A context key built from `trigger` alone therefore maps EVERY such requirement to the same
 * empty string, and the quantity-alias tier treats an empty key as the always-on context. Two
 * requirements whose preconditions are mutually exclusive then get co-asserted, and the finding
 * that reports them says "with no precondition or trigger, so both bounds always hold" about a
 * document that has two preconditions and no instant where both hold.
 *
 * The cost is not confined to a misleading sentence. The message carries a ready-to-run
 * `symspec glossary` command, and `numeric-contradiction.ts` groups on (quantity, baseUnit)
 * with no context partition of its own — so an author who follows the repair the tool printed
 * on a false premise gets an error-severity `FND_NUMERIC_CONTRADICTION` and exit 1 on a correct
 * document. That is one author command away from the cardinal sin, which is why the guard key,
 * not the message, is where this is fixed.
 *
 * The pair is otherwise a perfect candidate — opposed comparators, one comparable unit, a
 * shared object suffix ("drain") under differing verb prefixes — so nothing but the guard
 * partition can be what declines it.
 */
describe('mutually exclusive preconditions are NOT one context', () => {
  const drainBound = (id: string, state: string, response: string): Requirement =>
    req({
      id,
      patternType: 'state-driven',
      preCondition: `the tank is ${state}`,
      systemName: 'pump',
      systemResponse: response,
      sentence: `While the tank is ${state}, the pump shall ${response}.`,
    })

  /** Opposed bounds, comparable unit, shared object, differing verbs — under disjoint states. */
  const exclusiveStatesDoc = (): RequirementsDocument =>
    docOf(
      drainBound(
        'aaaaaaaa-7777-4777-8777-777777777771',
        'full',
        'complete the drain within at most 30 minutes',
      ),
      drainBound(
        'bbbbbbbb-7777-4777-8777-777777777772',
        'empty',
        'run the drain for at least 60 minutes',
      ),
    )

  it('raises no candidate and no demotion for a pair that cannot co-occur', async () => {
    const data = await expectOk(exclusiveStatesDoc(), { strict: true })
    expect(data.findings.map((f) => f.code)).not.toContain('FND_QUANTITY_ALIAS_CANDIDATE')
    expect(data.coverage.demotions.map((d) => d.reason)).not.toContain('quantity-alias-candidate')
    // And it certainly does not prove anything: the document is consistent.
    expect(data.counts.error).toBe(0)
  })

  it('never claims a guarded document has no guard', async () => {
    // The negative guard is the load-bearing one. Asserting only the absence of the code above
    // would also pass for a tier that emits the candidate with a corrected message, and the
    // false CO-ASSERTION — not the sentence — is what feeds the repair command.
    const data = await expectOk(exclusiveStatesDoc(), { strict: true })
    for (const f of data.findings) {
      expect(f.message).not.toContain('with no precondition or trigger')
      expect(f.message).not.toContain('both bounds always hold')
    }
  })

  it('still groups a pair that shares one precondition, so the fix is not a blanket skip', async () => {
    // The discriminating half: same state, so the guards DO co-occur and the candidate must
    // fire. Without this, dropping every precondition-guarded requirement on the floor would
    // satisfy the two tests above.
    const sharedStateDoc = docOf(
      drainBound(
        'aaaaaaaa-7777-4777-8777-777777777773',
        'full',
        'complete the drain within at most 30 minutes',
      ),
      drainBound(
        'bbbbbbbb-7777-4777-8777-777777777774',
        'full',
        'run the drain for at least 60 minutes',
      ),
    )
    const data = await expectOk(sharedStateDoc, { strict: true })
    expect(data.findings.map((f) => f.code)).toContain('FND_QUANTITY_ALIAS_CANDIDATE')
    const message =
      data.findings.find((f) => f.code === 'FND_QUANTITY_ALIAS_CANDIDATE')?.message ?? ''
    expect(message).toContain('under the same system and the same precondition and trigger')
    expect(message).not.toContain('with no precondition or trigger')
  })
})

// ---------------------------------------------------------------------------
// The committed glossary is keyed on the quantity LABEL, so label width matters
// ---------------------------------------------------------------------------

/**
 * `quantityKey` resolves a committed glossary alias on `normalize(label)`, so the label's width
 * is also the alias table's lookup width. Two consequences, both pinned here, because the
 * split-only argument that governs the bare key does NOT survive the alias hop and a future
 * width change must not be waved through on it.
 *
 * Neither direction is a fabrication: a committed glossary entry is the author asserting that
 * the listed phrasings name one thing, and `FND_QUANTITY_ALIAS_CANDIDATE` exists to solicit
 * exactly that assertion. What the entry does NOT come with is a diagnostic when it matches
 * nothing, so an alias written against a narrower label is inert and silent — the author's
 * discharged finding returns and their committed decide-tier artifact does no work.
 *
 * Measured on this build: the label is the whole phrase before the comparator, so an alias must
 * name that whole phrase to hit.
 */
describe('a glossary alias hits only when it names the whole quantity label', () => {
  const infusionDoc = (glossary: RequirementsDocument['glossary']): RequirementsDocument => ({
    ...docOf(
      req({
        id: 'eeeeeeee-8888-4888-8888-888888888881',
        patternType: 'event-driven',
        trigger: 'an infusion is started',
        systemName: 'infusion pump',
        systemResponse: 'complete the infusion within at most 30 minutes',
        sentence:
          'When an infusion is started, the infusion pump shall complete the infusion within at most 30 minutes.',
      }),
      req({
        id: 'ffffffff-8888-4888-8888-888888888882',
        patternType: 'event-driven',
        trigger: 'an infusion is started',
        systemName: 'infusion pump',
        systemResponse: 'run the infusion for at least 60 minutes',
        sentence:
          'When an infusion is started, the infusion pump shall run the infusion for at least 60 minutes.',
      }),
    ),
    glossary,
  })

  it('proves the conflict when the alias names the whole label', async () => {
    const data = await expectOk(
      infusionDoc([{ canonical: 'complete the infusion within', aliases: ['run the infusion'] }]),
    )
    expect(data.findings.map((f) => f.code)).toContain('FND_NUMERIC_CONTRADICTION')
    expect(data.counts.error).toBe(1)
  })

  it('is INERT when the alias names only a tail of the label, and says nothing about it', async () => {
    // A bare-noun-tail alias matches no label, so the committed entry does no work. The run
    // is silent about that: it re-asks for the alias the author already committed. This is the
    // recorded cost of coupling the quantity keyer to the whole-body glossary table, and the
    // reason a dedicated quantity-alias table would decouple them.
    const data = await expectOk(
      infusionDoc([{ canonical: 'run the infusion', aliases: ['infusion within'] }]),
    )
    expect(data.findings.map((f) => f.code)).not.toContain('FND_NUMERIC_CONTRADICTION')
    expect(data.counts.error).toBe(0)
    // The author's discharged finding is back, and nothing names their inert entry.
    expect(data.findings.map((f) => f.code)).toContain('FND_QUANTITY_ALIAS_CANDIDATE')
  })

  it('MERGES two response phrasings the author committed as one, at error severity', async () => {
    // The other direction of the same coupling: a whole-verb-phrase alias — the shape the
    // glossary is documented to hold ("a canonical response phrasing plus the aliases that mean
    // the same thing") — unifies two quantity keys and lets the LIA tier prove the conflict.
    // Author-authorized, and the propose→decide loop working as designed; pinned because it is
    // a MERGE and merges are the direction that can reach `error`.
    const data = await expectOk({
      ...docOf(
        req({
          id: 'cccccccc-8888-4888-8888-888888888883',
          systemName: 'auth service',
          systemResponse: 'keep the token valid for at most 30 minutes',
          sentence: 'The auth service shall keep the token valid for at most 30 minutes.',
        }),
        req({
          id: 'dddddddd-8888-4888-8888-888888888884',
          systemName: 'auth service',
          systemResponse: 'keep the user session alive for no less than 60 minutes',
          sentence:
            'The auth service shall keep the user session alive for no less than 60 minutes.',
        }),
      ),
      glossary: [
        {
          canonical: 'token lifetime',
          aliases: ['keep the token valid', 'keep the user session alive'],
        },
      ],
    })
    expect(data.findings.map((f) => f.code)).toContain('FND_NUMERIC_CONTRADICTION')
    expect(data.counts.error).toBe(1)
  })

  it('DISCLOSES, and does not merge, a duration and a deadline under one alias', async () => {
    // The merge above is two DURATIONS (`for`). `expire the user session in no less than 60
    // minutes` is a deadline, and spec 007 AC-2-6 keeps a deadline and a duration on two
    // variables even under one key: an alias equates two phrasings, and `sound the siren
    // within 2 s` + `... for at least 30 s` is consistent on one phrasing. So this pair,
    // which this test proved before roles existed, is not proved — and it is not certified
    // either: the pair the roles keep apart is disclosed.
    const data = await expectOk({
      ...docOf(
        req({
          id: 'cccccccc-8888-4888-8888-888888888883',
          systemName: 'auth service',
          systemResponse: 'keep the token valid for at most 30 minutes',
          sentence: 'The auth service shall keep the token valid for at most 30 minutes.',
        }),
        req({
          id: 'dddddddd-8888-4888-8888-888888888884',
          systemName: 'auth service',
          systemResponse: 'expire the user session in no less than 60 minutes',
          sentence: 'The auth service shall expire the user session in no less than 60 minutes.',
        }),
      ),
      glossary: [
        {
          canonical: 'token lifetime',
          aliases: ['keep the token valid', 'expire the user session'],
        },
      ],
    })
    expect(data.counts.error).toBe(0)
    expect(data.findings.map((f) => f.code)).toContain('FND_NUMERIC_UNCOMPARED')
    expect(data.coverage.demotions.map((d) => d.reason)).toContain('numeric-bounds-uncompared')
    expect(data.verified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// `--strict` honours its own flag text
// ---------------------------------------------------------------------------

/**
 * The gate's promise, checked against the gate.
 *
 * `--strict`'s own description says it will "fail with exit 3 when data.verified is false".
 * That is a claim about the MERGED verdict, but `strictGate` is computed inside the
 * vendored tier from the tier's own `verified`, before the boundary splices in the
 * reachability demotions. So a run whose only demotions come from reachability published
 * `verified: false` beside `strictGate: 'pass'` and exited 0 — the flag silently not doing
 * the one thing it exists to do.
 *
 * This is the shape that had no test: every other `--strict` case reaches a demotion the
 * vendored tier already knows about, so the boundary's omission is invisible to them.
 */
describe('--strict fails on a demotion the BOUNDARY added, not just the tier', () => {
  /** A document whose ONLY demotion is `reachability-not-checked`. */
  const reachabilityOnlyDoc = (): RequirementsDocument => ({
    ...docOf(
      req({
        id: 'dddddddd-0000-4000-8000-000000000001',
        sentence: 'The system shall operate.',
      }),
    ),
    stateModel: { variables: [{ name: 'granted', type: 'int', frame: 'volatile' }] },
  })

  it('the fixture really does demote, and ONLY from the boundary', async () => {
    // Guards the test below from passing vacuously: if the fixture stopped demoting, or
    // started demoting for a reason the tier itself raises, it would no longer exercise
    // the seam.
    const payload = await expectOk(reachabilityOnlyDoc())
    expect(payload.verified).toBe(false)
    expect(payload.coverage.demotions.map((d) => String(d.reason))).toEqual([
      'reachability-not-checked',
    ])
  })

  it('trips the gate, so the exit code is 3 rather than 0', async () => {
    const payload = await expectOk(reachabilityOnlyDoc(), { strict: true })
    // The flag's literal promise: verified false under --strict means the gate failed.
    expect(payload.verified).toBe(false)
    expect(payload.strictGate).toBe('fail')
    // And the exit mapping reads that field, so this is the process contract too.
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data: payload })).toBe(
      EXIT_INCONCLUSIVE,
    )
  })

  it('still lets a PROVEN defect outrank the gate', async () => {
    // Tightening the gate must not disturb the 1-vs-3 ordering: an error finding is a
    // different answer from "I could not verify", and exit 1 keeps precedence.
    const payload = await expectOk(contradictoryDoc(), { strict: true })
    expect(payload.counts.error).toBeGreaterThan(0)
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data: payload })).toBe(
      EXIT_FINDINGS_FAILURE,
    )
  })
})

// ---------------------------------------------------------------------------
// The terminology tier at the seam
// ---------------------------------------------------------------------------

/**
 * A document whose ONE committed term lands in two unrelated requirements.
 *
 * Disjoint vocabulary apart from the shared `token`, so the formal tier compares nothing
 * — which is exactly the condition `FND_NO_PAIRS_CHECKED` exists to disclose, and
 * therefore the document that can catch this tier suppressing it.
 */
const driftDoc = (): RequirementsDocument => ({
  ...docOf(
    req({
      id: '33333333-3333-4333-8333-333333333333',
      patternType: 'event-driven',
      trigger: 'the token expires',
      systemName: 'auth service',
      systemResponse: 'revoke the active session',
      sentence: 'When the token expires, the auth service shall revoke the active session.',
    }),
    req({
      id: '44444444-4444-4444-8444-444444444444',
      patternType: 'event-driven',
      trigger: 'the player places the token on the board',
      systemName: 'auth service',
      systemResponse: 'advance the turn',
      sentence:
        'When the player places the token on the board, the auth service shall advance the turn.',
    }),
  ),
  terms: [{ canonical: 'token', aliases: [] }],
})

/**
 * Unit vectors at fixed angles, so every cosine the run produces is exactly known.
 *
 * An unlisted text THROWS rather than defaulting, and that is load-bearing here. `check`
 * makes four embed calls over three different text populations — the response atoms (twice,
 * for the synonym and opposition detectors), the rendered sentences (the similarity graph),
 * and this tier's joined slots. A default angle silently collapses whichever population a
 * fixture forgot onto ONE vector at cosine 1.0, which fires the engine's own
 * `FND_SIMILAR_SEMANTIC` across the document — and that names two requirement ids, which
 * suppresses `FND_NO_PAIRS_CHECKED`. The disclaimer test below would then fail while
 * blaming the terminology tier for something the fixture did. Throwing turns a forgotten
 * text into a named error instead of a misattributed failure.
 */
const angleEmbedder = (table: Readonly<Record<string, number>>): Embedder => {
  const at = (deg: number): Float32Array => {
    const r = (deg * Math.PI) / 180
    return Float32Array.from([Math.cos(r), Math.sin(r)])
  }
  return async (texts: readonly string[]) =>
    texts.map((t) => {
      const deg = table[t]
      if (deg === undefined) throw new Error(`angleEmbedder: no angle for ${JSON.stringify(t)}`)
      return at(deg)
    })
}

/**
 * Every text `check` embeds over `driftDoc()`, placed deliberately.
 *
 * The two SLOT texts sit 80° apart (cosine 0.1736, well under the 0.62 coherence floor) so
 * `FND_TERM_INCONSISTENT` fires. Everything else sits 85° apart (cosine 0.0872) so it clears
 * NOTHING: not the 0.72 paraphrase threshold, not the 0.82 graph threshold, not the 0.5
 * opposition floor. So the only cross-requirement finding this document can produce is the
 * terminology one, which is what makes the disclaimer assertion attributable.
 */
const DRIFT_EMBEDDER = angleEmbedder({
  // The joined slots — this tier's framing.
  'the token expires revoke the active session': 0,
  'the player places the token on the board advance the turn': 80,
  // The response atoms — the engine's synonym and opposition detectors.
  'revoke the active session': 0,
  'advance the turn': 85,
  // The rendered sentences — the engine's similarity graph.
  'When the token expires, the auth service shall revoke the active session.': 0,
  'When the player places the token on the board, the auth service shall advance the turn.': 85,
})

/**
 * A document that is otherwise CLEAN — `verified: true`, zero demotions — and still carries
 * term drift.
 *
 * This fixture exists because of a sabotage that did NOT fire. `driftDoc()` has disjoint
 * vocabulary, so it is already demoted for `uncovered-requirement`; asserting "`verified` is
 * unchanged" over it passes whether or not this tier pushes a demotion, because the boolean
 * was false either way. Measured: two requirements sharing one trigger reach `verified: true`
 * with `demotions: []`, so here a single pushed demotion flips a `true` to `false` and the
 * assertion has something to fail on.
 *
 * The shared trigger is also what puts the committed `token` in both requirements.
 */
const verifiedDriftDoc = (): RequirementsDocument => ({
  ...docOf(
    req({
      id: '55555555-5555-4555-8555-555555555555',
      patternType: 'event-driven',
      trigger: 'the token is presented',
      systemName: 'auth service',
      systemResponse: 'revoke the active session',
      sentence: 'When the token is presented, the auth service shall revoke the active session.',
    }),
    req({
      id: '66666666-6666-4666-8666-666666666666',
      patternType: 'event-driven',
      trigger: 'the token is presented',
      systemName: 'auth service',
      systemResponse: 'advance the turn',
      sentence: 'When the token is presented, the auth service shall advance the turn.',
    }),
  ),
  terms: [{ canonical: 'token', aliases: [] }],
})

/** Same placement discipline as `DRIFT_EMBEDDER`: slots at 80°, everything else at 85°. */
const VERIFIED_DRIFT_EMBEDDER = angleEmbedder({
  'the token is presented revoke the active session': 0,
  'the token is presented advance the turn': 80,
  'revoke the active session': 0,
  'advance the turn': 85,
  'When the token is presented, the auth service shall revoke the active session.': 0,
  'When the token is presented, the auth service shall advance the turn.': 85,
})

describe('check — the terminology tier is spliced in without reaching the verdict', () => {
  it('emits FND_TERM_INCONSISTENT through the one findings array', async () => {
    const payload = await expectOk(driftDoc(), {}, DRIFT_EMBEDDER)
    const drift = payload.findings.filter((f) => f.code === 'FND_TERM_INCONSISTENT')
    expect(drift).toHaveLength(1)
    expect(drift[0]?.severity).toBe('info')
    expect(drift[0]?.tier).toBe('formal')
    expect(drift[0]?.requirementIds).toHaveLength(2)
  })

  it('reports drift on a document that still verifies, with no demotion at all', async () => {
    // The discriminating claim. This document has NOTHING else wrong with it, so a demotion
    // pushed by this tier — under any reason name, including one it borrows from another
    // tier — turns `verified` false and fails here.
    const payload = await expectOk(verifiedDriftDoc(), {}, VERIFIED_DRIFT_EMBEDDER)
    expect(payload.findings.some((f) => f.code === 'FND_TERM_INCONSISTENT')).toBe(true)
    expect(payload.coverage.demotions).toEqual([])
    expect(payload.verified).toBe(true)
    expect(payload.progress.demotions).toBe(0)
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data: payload })).toBe(EXIT_CLEAN)
  })

  it('does not make --strict fail on a document that would otherwise pass', async () => {
    const strict = await expectOk(verifiedDriftDoc(), { strict: true }, VERIFIED_DRIFT_EMBEDDER)
    expect(strict.findings.some((f) => f.code === 'FND_TERM_INCONSISTENT')).toBe(true)
    // A wording opinion must not fail a build. Exit 3 is reserved for "I could not check
    // this", and this tier checked everything it claims to.
    expect(strict.strictGate).toBe('pass')
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data: strict })).toBe(EXIT_CLEAN)
  })

  it('adds no demotion to an already-demoted document either', async () => {
    // The other direction: on a document with existing demotions, the tier must not append.
    // Compared as full arrays rather than by reason substring — the substring form passed a
    // sabotage that pushed a demotion under a borrowed reason name.
    const withTier = await expectOk(driftDoc(), {}, DRIFT_EMBEDDER)
    const withoutTier = await expectOk(driftDoc(), { semantic: false })
    const reasonsOf = (p: CheckPayload) => p.coverage.demotions.map((d) => d.reason).sort()
    // `--semantic=false` legitimately adds `semantic-tier-skipped`, so that one is excluded
    // from the comparison — it is the disclosure for the flag, not for this tier.
    expect(reasonsOf(withTier)).toEqual(
      reasonsOf(withoutTier).filter((r) => r !== 'semantic-tier-skipped'),
    )
    expect(withTier.counts.error).toBe(withoutTier.counts.error)
  })

  it('does NOT suppress FND_NO_PAIRS_CHECKED', async () => {
    // The property, asserted directly rather than as a fact about where the splice sits.
    // A terminology finding names two requirement ids, which is the exact predicate the
    // engine uses to decide a cross-requirement comparison happened — so if this tier ever
    // ran INSIDE the engine, it would quiet a disclaimer over a comparison it never made.
    const payload = await expectOk(driftDoc(), {}, DRIFT_EMBEDDER)
    expect(payload.findings.some((f) => f.code === 'FND_TERM_INCONSISTENT')).toBe(true)
    expect(payload.findings.some((f) => f.code === 'FND_NO_PAIRS_CHECKED')).toBe(true)
  })

  it('keeps counts in agreement with the merged findings array', async () => {
    const payload = await expectOk(driftDoc(), {}, DRIFT_EMBEDDER)
    const tally = { error: 0, warn: 0, info: 0 }
    for (const f of payload.findings) tally[f.severity] += 1
    expect(payload.counts).toEqual(tally)
    expect(payload.progress.openFindings).toBe(payload.counts.error)
  })

  it('is filtered by --min-severity like every other tier', async () => {
    const filtered = await expectOk(driftDoc(), { minSeverity: 'warn' }, DRIFT_EMBEDDER)
    expect(filtered.findings.some((f) => f.code === 'FND_TERM_INCONSISTENT')).toBe(false)
    // Presentation only: the counters still report what the tier examined.
    expect(filtered.terminology?.keysExamined).toBe(1)
  })

  it('publishes what it examined, and omits the field entirely when it did not run', async () => {
    const ran = await expectOk(driftDoc(), {}, DRIFT_EMBEDDER)
    expect(ran.terminology).toEqual({
      keysExamined: 1,
      pairsCompared: 1,
      acronymsExamined: 0,
    })

    const skipped = await expectOk(driftDoc(), { semantic: false })
    // ABSENT, not zeroed — "the tier did not run" and "it found nothing" are different
    // facts, and a zero-filled object states the second while meaning the first.
    expect('terminology' in skipped).toBe(false)
  })

  it('reports zero keys examined on a document with no committed vocabulary', async () => {
    const payload = await expectOk(
      docOf(...Object.values(driftDoc().requirements)),
      {},
      DRIFT_EMBEDDER,
    )
    expect(payload.terminology?.keysExamined).toBe(0)
    expect(payload.findings.some((f) => f.code === 'FND_TERM_INCONSISTENT')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// A pair waiver followed verbatim covers exactly the pair and text it was raised on
// ---------------------------------------------------------------------------

describe('[S3-039] [S3-016] the numeric/relational demotions offer no waiver, and a stored pair waiver discharges nothing', () => {
  // Ruling R2 (decision D1, S3-016, S3-039) replaces this block's old subject, the reviewed
  // pair waiver these demotions used to offer: FND_NUMERIC_UNCOMPARED and
  // FND_RELATIONAL_UNCHECKED are disclosures (never class), so no waive is offered and a stored
  // one, even over the exact pair and its current text, is inert. The discharge is rewording.
  const W = '00000000-0000-4000-8000-000000000001'
  const X = 'ffffffff-0000-4000-8000-000000000002'
  const siren = (id: string, systemResponse: string) =>
    req({
      id,
      patternType: 'event-driven',
      trigger: 'the smoke detector trips',
      systemName: 'fire panel',
      systemResponse,
      sentence: `When the smoke detector trips, the fire panel shall ${systemResponse}.`,
    })
  const PAIR_REASONS = ['relational-reasoning-not-attempted', 'numeric-bounds-uncompared'] as const
  const PAIR_CODES = ['FND_RELATIONAL_UNCHECKED', 'FND_NUMERIC_UNCOMPARED'] as const
  const REASON = 'reviewed: siren starts within 2 s and then runs 30 s; consistent'
  const reasonsOf = (payload: CheckPayload) => payload.coverage.demotions.map((d) => d.reason)
  const pair = () =>
    docOf(
      siren(W, 'sound the siren within 2 seconds'),
      siren(X, 'sound the siren for at least 30 seconds'),
    )
  /** The pair as the base tool's repair left it: both waivers over exactly [W, X] and its text. */
  const triagedUnderBase = (): RequirementsDocument => {
    const doc = pair()
    const contentHash = requirementsContentHash(doc, [W, X].sort()) as string
    return {
      ...doc,
      waivers: PAIR_CODES.map((code) => ({
        code,
        requirementIds: [W, X].sort(),
        contentHash,
        reason: REASON,
      })),
    }
  }

  it('[S3-039] offers no waive op on either demotion', async () => {
    const payload = await expectOk(pair())
    expect(reasonsOf(payload)).toEqual(expect.arrayContaining([...PAIR_REASONS]))
    const waives = payload.coverage.demotions
      .filter((d) => (PAIR_REASONS as readonly string[]).includes(d.reason))
      .flatMap((d) => (d.repair?.ops ?? []) as readonly DocumentOp[])
      .filter((op) => op.op === 'waive')
    expect(waives).toEqual([])
  })

  it('[S3-016] a pair triaged under the base tool is no longer discharged: both demotions stand and both waivers are inert', async () => {
    const payload = await expectOk(triagedUnderBase())
    expect(reasonsOf(payload)).toEqual(expect.arrayContaining([...PAIR_REASONS]))
    expect(payload.waived).toBe(0)
    expect(payload.verified).toBe(false)
    const inert = (payload.diagnostics as readonly { kind: string }[]).filter(
      (d) => (d.kind as string) === 'waiver-inert',
    )
    expect(inert).toHaveLength(2)
  })

  it('[S3-001] the fold under MUTATE_OPTIONS refuses the waive the base tool offered', () => {
    const doc = pair()
    const contentHash = requirementsContentHash(doc, [W, X].sort()) as string
    for (const code of PAIR_CODES) {
      const result = foldOps(
        doc,
        [{ op: 'waive', code, refs: [W, X], contentHash, reason: REASON }],
        TS,
        MUTATE_OPTIONS,
      )
      expect(result.results[0]?.code, code).toBe('ERR_WAIVER_REFUSED')
    }
  })
})

/**
 * The opposition-candidate repair waiver binds EXACTLY its pair and that pair's text (spec 007,
 * demote-not-prove C3). The pairs below were error-severity FND_CONTRADICTION at 669c0e9, which no
 * candidate waiver can touch; they are now only candidates, so a waiver that reaches further than
 * the triaged pair turns a base proof into `verified: true` over a pair nobody reviewed. A
 * one-requirement `ref` does exactly that: `check` suppresses it on every candidate naming the ref.
 */
describe('[S3-016] [S3-039] the opposition-candidate demotion offers no waiver, and no stored waiver discharges it', () => {
  // Ruling R15 (decision D4) and R29 (S3-016, S3-039, S3-040) replace this block's old subject,
  // the exact-pair repair waiver: FND_OPPOSITION_CANDIDATE is triage (never class), so legacy
  // documents lose the waiver discharge and rewrite or commit the antonym/glossary edit instead.
  const idOf = (n: number) => `0e0e0e0e-0000-4000-8000-${String(n).padStart(12, '0')}`
  const [A, B, C, D] = [1, 2, 3, 4].map(idOf) as [string, string, string, string]
  const TRIGGER = 'the operator presses the button'
  const grant = (id: string, place: string, negated: boolean) =>
    req({
      id,
      patternType: 'event-driven',
      trigger: TRIGGER,
      systemName: 'controller',
      systemResponse: `grant access ${place} the server`,
      negated,
      sentence: `When ${TRIGGER}, the controller shall${negated ? ' not' : ''} grant access ${place} the server.`,
    })
  /** Every text lands on one vector: the rule under test is the deterministic shape, not a cosine. */
  const parallel: Embedder = async (texts) => texts.map(() => Float32Array.from([1, 0]))
  const REASON = 'triaged: <why this candidate is not a conflict>'
  const fold = (document: RequirementsDocument, ops: readonly DocumentOp[]) => {
    const result = foldOps(document, ops, TS)
    if (result.abortedAt !== undefined) {
      throw new Error(`fold aborted: ${JSON.stringify(result.results)}`)
    }
    return result.document
  }
  const check = (document: RequirementsDocument) => expectOk(document, {}, parallel)
  const pairsOf = (payload: CheckPayload) =>
    payload.coverage.demotions
      .filter((d) => d.reason === 'open-opposition-candidate')
      .map((d) => [...d.requirementIds].sort().join('|'))
      .sort()
  const key = (...ids: string[]) => [...ids].sort().join('|')
  /** The pair triaged as the base tool's repair op wrote it: the exact pair and its text. */
  const triage = async (document: RequirementsDocument, ...ids: string[]) => {
    const payload = await check(document)
    const demotion = payload.coverage.demotions.find(
      (d) => d.reason === 'open-opposition-candidate' && key(...d.requirementIds) === key(...ids),
    )
    expect(demotion, `no candidate demotion over ${key(...ids)}`).toBeDefined()
    const refs = [...ids].sort()
    return {
      ...document,
      waivers: [
        ...document.waivers,
        {
          code: 'FND_OPPOSITION_CANDIDATE',
          requirementIds: refs,
          contentHash: requirementsContentHash(document, refs) as string,
          reason: REASON,
        },
      ],
    }
  }
  const inertCount = (payload: CheckPayload) =>
    (payload.diagnostics as readonly { kind: string }[]).filter(
      (d) => (d.kind as string) === 'waiver-inert',
    ).length

  it('[S3-039] offers no waive op, only the edits that decide the pair', async () => {
    const payload = await check(docOf(grant(A, 'on', false), grant(B, 'to', true)))
    const demotion = payload.coverage.demotions.find(
      (d) => d.reason === 'open-opposition-candidate',
    )
    expect(demotion).toBeDefined()
    expect(
      ((demotion?.repair?.ops ?? []) as readonly DocumentOp[]).filter((op) => op.op === 'waive'),
    ).toEqual([])
  })

  it('[S3-040] the demotion action never instructs or offers a waiver', async () => {
    const payload = await check(docOf(grant(A, 'on', false), grant(B, 'to', true)))
    const action = payload.coverage.demotions.find(
      (d) => d.reason === 'open-opposition-candidate',
    )?.action
    expect(action).toBeDefined()
    expect(action).not.toMatch(/symspec waive/)
    expect(action).not.toMatch(/waive/i)
    expect(action).toContain(A)
    expect(action).toContain(B)
  })

  it('[S3-016] a pair triaged under the base tool is no longer discharged, and its waiver is disclosed inert', async () => {
    const doc = docOf(grant(A, 'on', false), grant(B, 'to', true))
    expect(pairsOf(await check(doc))).toEqual([key(A, B)])
    const payload = await check(await triage(doc, A, B))
    expect(pairsOf(payload)).toEqual([key(A, B)])
    expect(payload.waived).toBe(0)
    expect(inertCount(payload)).toBe(1)
  })

  it.each([
    ['the negated side', 'at', false, B],
    ['the asserted side', 'at', true, A],
  ] as const)('[S3-016] (1) does not discharge a pair a third requirement forms with %s', async (_, place, negated, partner) => {
    const waived = await triage(docOf(grant(A, 'on', false), grant(B, 'to', true)), A, B)
    const grown = fold(waived, [
      {
        op: 'add',
        id: C,
        patternType: 'event-driven',
        trigger: TRIGGER,
        systemName: 'controller',
        systemResponse: `grant access ${place} the server`,
        negated,
      },
    ])
    const payload = await check(grown)
    // Ruling R15 (S3-016): the triaged pair is not discharged either.
    expect(pairsOf(payload)).toEqual([key(A, B), key(partner, C)].sort())
    expect(payload.verified).toBe(false)
  })

  it('[S3-016] (2) triaging three pairs of a four-cycle leaves all four demoting', async () => {
    let doc = docOf(
      grant(A, 'on', false),
      grant(B, 'to', true),
      grant(C, 'at', false),
      grant(D, 'in', true),
    )
    expect(pairsOf(await check(doc))).toEqual([key(A, B), key(A, D), key(C, B), key(C, D)].sort())
    doc = await triage(doc, A, B)
    doc = await triage(doc, C, B)
    doc = await triage(doc, C, D)
    const payload = await check(doc)
    // Ruling R15 (S3-016): none of the three triaged pairs is discharged; each waiver is inert.
    expect(pairsOf(payload)).toEqual([key(A, B), key(A, D), key(C, B), key(C, D)].sort())
    expect(inertCount(payload)).toBe(3)
    expect(payload.verified).toBe(false)
  })

  /**
   * A waiver the base tool suggested, or one written by hand, never discharges a candidate: the
   * base build PROVED these pairs, and its own repair for an opposition candidate was a one-id
   * `ref` waiver (and its action an unscoped `symspec waive`). So a document triaged by following
   * that advice carries one, and a candidate a later requirement forms with the waived one came
   * back `verified: true` over a pair nobody read (verifier U-ref, U-docwide).
   */
  const stop = (id: string, response: string, negated: boolean) =>
    req({
      id,
      patternType: 'event-driven',
      trigger: TRIGGER,
      systemName: 'controller',
      systemResponse: response,
      negated,
      sentence: `When ${TRIGGER}, the controller shall${negated ? ' not' : ''} ${response}.`,
    })
  const LEGACY = [
    ['a one-id ref waiver (the base repair op)', { requirementId: A }],
    ['a document-wide waiver (the base action)', {}],
    ['an exact-set waiver with no content hash', { requirementIds: [A, B] }],
  ] as const
  it.each(
    LEGACY,
  )('[S3-016] %s leaves the candidate demoting, and is disclosed waiver-inert', async (_, scope) => {
    const doc = {
      ...docOf(stop(A, 'stop the pump on Monday', false), stop(B, 'stop the pump Monday', true)),
      waivers: [
        { code: 'FND_OPPOSITION_CANDIDATE', reason: 'triaged under the base tool', ...scope },
      ],
    }
    const payload = await check(doc)
    expect(pairsOf(payload)).toEqual([key(A, B)])
    expect(payload.verified).toBe(false)
    expect(payload.waived).toBe(0)
    // Ruling R15 (S3-016) replaces the engine's "was not applied" note: compat no longer hands
    // the engine a never-class waiver, so the disclosure is the waiver-inert diagnostic.
    expect(inertCount(payload)).toBe(1)
  })

  it('U-ref: a ref waiver for one triaged candidate does not reach a pair added after it', async () => {
    // The base tool's own repair for the A/H candidate was `waive ref A`; B then joins A in a
    // pair base proved (stop on Monday / NOT stop Monday).
    const doc = {
      ...docOf(
        stop(A, 'stop the pump on Monday', false),
        stop(C, 'halt the pump on Monday', false),
        stop(B, 'stop the pump Monday', true),
      ),
      waivers: [{ code: 'FND_OPPOSITION_CANDIDATE', reason: 'A/H triaged', requirementId: A }],
    }
    const payload = await check(doc)
    expect(pairsOf(payload)).toContain(key(A, B))
    expect(payload.verified).toBe(false)
  })

  it('[S3-016] (4) does not discharge the pair once one side is edited', async () => {
    const waived = await triage(docOf(grant(A, 'on', false), grant(B, 'to', true)), A, B)
    const edited = fold(waived, [
      { op: 'update', ref: B, attr: 'systemResponse', value: 'grant access at the server' },
    ])
    const payload = await check(edited)
    expect(pairsOf(payload)).toEqual([key(A, B)])
    expect(payload.verified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// S3 closure round (R57): a qualifying scoped waiver of a terminology finding is applied and
// disclosed like every other scoped code (S3-021, S3-046)
// ---------------------------------------------------------------------------

describe('[S3-021] [S3-046] a scoped, hash-bound waiver of a terminology-tier finding suppresses exactly that finding and is listed in data.appliedWaivers (R57)', () => {
  const acronymDoc = (): RequirementsDocument =>
    buildDoc(
      [
        {
          op: 'add',
          id: '10000000-0000-4000-8000-000000000001',
          key: 'XYZ-R1',
          patternType: 'event-driven',
          trigger: 'the operator opens the session',
          systemName: 'gateway',
          systemResponse: 'record the XYZ status',
        },
        {
          op: 'add',
          id: '10000000-0000-4000-8000-000000000002',
          key: 'XYZ-R2',
          patternType: 'event-driven',
          trigger: 'the operator opens the session',
          systemName: 'gateway',
          systemResponse: 'store the session token',
        },
      ] as never,
      MUTATE_OPTIONS,
    )
  const row = (f: { code: string; requirementIds: readonly string[] }) =>
    `${f.code} [${[...f.requirementIds].sort().join(', ')}]`

  it.each([
    ['FND_ACRONYM_UNDEFINED', acronymDoc, orthogonalEmbedder([])],
    ['FND_TERM_INCONSISTENT', verifiedDriftDoc, VERIFIED_DRIFT_EMBEDDER],
  ] as const)('[S3-021] [S3-046] %s', async (code, makeDoc, embedder) => {
    const doc = makeDoc()
    const before = await expectOk(doc, {}, embedder)
    const finding = before.findings.find((f) => f.code === code)
    expect(finding, `the fixture raises ${code}`).toBeDefined()
    if (finding === undefined) return
    const reason = 'reviewed: the wording is intended'
    const folded = foldOps(
      doc,
      [{ op: 'waive', code, refs: [...finding.requirementIds], reason }],
      '2026-10-05T00:00:00.000Z',
      MUTATE_OPTIONS,
    )
    expect(folded.abortedAt, 'the fold accepts the scoped waive').toBeUndefined()
    const after = await expectOk(folded.document, {}, embedder)
    // Exactly its finding goes: every other finding stays.
    expect(after.findings.map(row).sort()).toEqual(
      before.findings
        .filter((f) => row(f) !== row(finding))
        .map(row)
        .sort(),
    )
    expect(after.appliedWaivers).toEqual([
      { code, requirementIds: [...finding.requirementIds].sort(), reason },
    ])
    expect(after.diagnostics.filter((d) => d.kind === 'waiver-inert')).toEqual([])
    // R62 (attack C09, the S8 open item): the suppressed terminology finding is tallied.
    expect(after.waived, 'data.waived counts the terminology waiver').toBe(before.waived + 1)
  })

  it('[S3-021] [S3-046] two FND_ACRONYM_UNDEFINED findings on disjoint requirements: a waiver of one suppresses only it, data.waived rises by one, and exactly one waiver is applied (R62, attack C06)', async () => {
    const doc = buildDoc(
      [
        {
          op: 'add',
          id: '10000000-0000-4000-8000-000000000001',
          key: 'XYZ-R1',
          patternType: 'event-driven',
          trigger: 'the operator opens the session',
          systemName: 'gateway',
          systemResponse: 'record the XYZ status',
        },
        {
          op: 'add',
          id: '10000000-0000-4000-8000-000000000002',
          key: 'ABC-R2',
          patternType: 'event-driven',
          trigger: 'the operator opens the session',
          systemName: 'gateway',
          systemResponse: 'store the ABC token',
        },
      ] as never,
      MUTATE_OPTIONS,
    )
    const embedder = orthogonalEmbedder([])
    const before = await expectOk(doc, {}, embedder)
    const acronyms = before.findings.filter((f) => f.code === 'FND_ACRONYM_UNDEFINED')
    expect(acronyms.map(row).sort()).toEqual([
      'FND_ACRONYM_UNDEFINED [10000000-0000-4000-8000-000000000001]',
      'FND_ACRONYM_UNDEFINED [10000000-0000-4000-8000-000000000002]',
    ])
    const target = acronyms.find((f) =>
      f.requirementIds.includes('10000000-0000-4000-8000-000000000002'),
    )
    if (target === undefined) throw new Error('no ABC finding')
    const reason = 'reviewed: ABC is the vendor name'
    const folded = foldOps(
      doc,
      [{ op: 'waive', code: 'FND_ACRONYM_UNDEFINED', refs: [...target.requirementIds], reason }],
      '2026-10-05T00:00:00.000Z',
      MUTATE_OPTIONS,
    )
    expect(folded.abortedAt).toBeUndefined()
    const after = await expectOk(folded.document, {}, embedder)
    expect(after.findings.filter((f) => f.code === 'FND_ACRONYM_UNDEFINED').map(row)).toEqual([
      'FND_ACRONYM_UNDEFINED [10000000-0000-4000-8000-000000000001]',
    ])
    expect(after.waived).toBe(before.waived + 1)
    expect(after.appliedWaivers).toEqual([
      {
        code: 'FND_ACRONYM_UNDEFINED',
        requirementIds: ['10000000-0000-4000-8000-000000000002'],
        reason,
      },
    ])
    // Its own ids under another content hash: the finding stands and nothing is tallied.
    const stale = {
      ...folded.document,
      waivers: folded.document.waivers.map((w) => ({
        ...w,
        contentHash: `sha256:${'0'.repeat(64)}`,
      })),
    }
    const unbound = await expectOk(stale, {}, embedder)
    expect(unbound.findings.filter((f) => f.code === 'FND_ACRONYM_UNDEFINED').length).toBe(2)
    expect(unbound.waived).toBe(before.waived)
    expect(unbound.appliedWaivers).toEqual([])
  })
})
