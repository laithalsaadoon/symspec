/**
 * THE OUTCOME CHECK, measured against the engine's verdicts (S6-D3).
 *
 * `outcome.ts` and `readers.ts` admit a vocabulary only when what every engine reader reads on
 * the projection is what it reads on the original, with exactly the declared classes joined. The
 * claim that makes that the right test is that such a projection changes no verdict the
 * declaration does not imply. This sweeps the claim over the report corpus, running the engine
 * on the original and on the projected document for every candidate the validator admits:
 *
 * - A LONE RENAME (a symbol's canonical respelled, the old spelling kept as its alias) joins
 *   nothing, so it implies no change at all: the two runs must report the same `verified`, the
 *   same demotions and the same findings, each with its requirement ids.
 * - A MERGE, or a second symbol folded into a first as aliases, joins two classes, so it may
 *   change what is said about a requirement it joins: a finding or demotion naming only
 *   requirements none of whose slots it joined must be the same, and no error-severity code the
 *   original raises may be lost at all.
 *
 * Every run has the semantic tier on, at two extremes of the embedder: the orthogonal one (no
 * two different texts related) and the constant one (every two related), so a demotion that
 * rests on the propose tier is in the verdict, and `verified` can be true. Without an embedder
 * every run demotes on `semantic-tier-skipped`, and "gains no `verified`" can never fire. At both
 * extremes the propose tier's answer does not depend on the words, so each run is also made with
 * the lexical embedder, whose cosine is the words two texts share: a rewrite that moves a pair
 * across a threshold, as the model's cosine would, changes that run.
 *
 * Unsat cores are not unique, so an error finding is compared by code, not by the requirement
 * set it names: a merge that makes a smaller core provable reports that core instead.
 */

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { MUTATE_OPTIONS } from '../../app/operations/mutate-options.ts'
import { SolverService } from '../../ports/solver.ts'
import { lexicalEmbedder, orthogonalEmbedder } from '../../testing/gaming.ts'
import { reportSources } from '../../testing/report-corpus.ts'
import { toEngineDoc } from '../compat.ts'
import { normalizeScope } from '../engine/formal/atomize.ts'
import type { Embedder } from '../engine/formal/embed.ts'
import { encode, toEncodable } from '../engine/formal/encode.ts'
import { requirementBounds } from '../engine/formal/numeric.ts'
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
import { tablesOf, viewOf } from './keys.ts'
import { projectedDocument } from './projection.ts'

/** Every two texts related: the extreme the orthogonal embedder is the other end of. */
const constantEmbedder = (): Embedder => async (texts) =>
  texts.map(() => {
    const v = new Float32Array(4)
    v[0] = 1
    return v
  })

const EMBEDDERS = {
  orthogonal: orthogonalEmbedder,
  constant: constantEmbedder,
  lexical: lexicalEmbedder,
} as const

/** One run's verdict: `verified`, and every demotion and finding with its severity and ids. */
interface Verdict {
  readonly verified: boolean
  /** `<finding|demotion> <code|reason> <ids>` for every demotion and non-error finding. */
  readonly said: ReadonlySet<string>
  readonly errorCodes: ReadonlySet<string>
}

const SEP = '\u0000'

/** Run `body` with the solver booted once, so every check inside it shares one context. */
const withSolver = <A>(body: () => Promise<A>): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(SolverService, (solver) =>
      Effect.flatMap(solver.boot, () => Effect.promise(body)),
    ).pipe(Effect.provide(solverServiceLayer)),
  )

const verdictOf = (doc: RequirementsDocument, embedder: Embedder): Promise<Verdict> =>
  runCheck(toEngineDoc(doc), { strict: true, semantic: { embedder } }).then((r) => ({
    verified: r.verified,
    said: new Set([
      ...r.findings
        .filter((f) => f.severity !== 'error')
        .map((f) => `finding${SEP}${f.code}${SEP}${f.requirementIds.join(',')}`),
      ...r.coverage.demotions.map(
        (d) => `demotion${SEP}${d.reason}${SEP}${d.requirementIds.join(',')}`,
      ),
    ]),
    errorCodes: new Set(r.findings.filter((f) => f.severity === 'error').map((f) => f.code)),
  }))

/** The requirements two of whose slots, or bounds, the projection put on one key they were not on. */
const joinedRequirements = (
  doc: RequirementsDocument,
  projected: RequirementsDocument,
): ReadonlySet<string> => {
  const keysOf = (d: RequirementsDocument) => {
    const tables = tablesOf(d)
    return new Map(
      Object.values(d.requirements).map((r) => {
        const view = viewOf(r)
        const keys = new Map<string, string>([['sys', normalizeScope(r.systemName)]])
        for (const row of encode(toEncodable(view), tables.atomize).atoms)
          keys.set(row.kind, row.atom)
        for (const [i, b] of requirementBounds(view, tables.glossary).entries())
          keys.set(`bound${i}`, b.predicate.quantity)
        return [r.id, keys] as const
      }),
    )
  }
  const before = keysOf(doc)
  const after = keysOf(projected)
  const joined = new Set<string>()
  const ids = [...before.keys()]
  for (const [i, a] of ids.entries()) {
    for (const b of ids.slice(i + 1)) {
      const was = (x: string) => [...(before.get(x) ?? new Map<string, string>()).entries()]
      const is = (x: string) => after.get(x) ?? new Map<string, string>()
      const meets = was(a).some(([ka, va]) =>
        was(b).some(([kb, vb]) => va !== vb && is(a).get(ka) === is(b).get(kb)),
      )
      if (meets) {
        joined.add(a)
        joined.add(b)
      }
    }
  }
  return joined
}

/** How many symbols of each kind a document contributes candidates from. */
const PER_KIND = 2

interface Candidate {
  readonly what: string
  readonly rename: boolean
  readonly vocabulary: Vocabulary
}

/**
 * Every candidate: the implicit vocabulary plus one merge, one alias fold, or one lone rename.
 * A rename respells the canonical twice over, with a word before it and a word after it, since
 * the propose tier reads a response's head verb and its object and each rename moves one.
 */
const candidates = (doc: RequirementsDocument): Candidate[] => {
  const implicit = implicitVocabulary(doc)
  const out: Candidate[] = []
  const replaced = (id: string, symbol: VocabSymbol): Vocabulary => ({
    ...implicit,
    symbols: implicit.symbols.map((s) => (s.id === id ? symbol : s)),
  })
  for (const kind of ['action', 'state', 'event', 'quantity', 'system'] as const) {
    const of = implicit.symbols.filter((s) => s.kind === kind).slice(0, PER_KIND)
    for (const s of of) {
      for (const canonical of [`${s.canonical} now`, `then ${s.canonical}`]) {
        out.push({
          what: `rename ${s.id} "${canonical}"`,
          rename: true,
          vocabulary: replaced(s.id, { ...s, canonical, aliases: [s.canonical, ...s.aliases] }),
        })
      }
    }
    if (kind === 'event' || kind === 'system') continue
    for (const [i, a] of of.entries()) {
      for (const b of of.slice(i + 1)) {
        out.push({
          what: `merge ${a.id} ${b.id}`,
          rename: false,
          vocabulary: { ...implicit, merges: [{ a: a.id, b: b.id }] },
        })
        const folded = implicit.symbols.flatMap((s): VocabSymbol[] =>
          s.id === b.id
            ? []
            : s.id === a.id
              ? [{ ...s, aliases: [...s.aliases, b.canonical, ...b.aliases] }]
              : [s],
        )
        out.push({
          what: `alias ${a.id} <- ${b.id}`,
          rename: false,
          vocabulary: { ...implicit, symbols: folded },
        })
      }
    }
  }
  return out
}

describe('the projection of every admitted vocabulary changes no verdict it does not imply', () => {
  it(
    'a rename changes nothing, and a merge changes only what it joins, over the report corpus',
    sweep,
    900_000,
  )
})

const sweep = async () => {
  const problems: string[] = []
  const tally = { renames: 0, merges: 0, refused: 0, rewritten: 0, verified: 0 }
  // One solver per document: a context shared across the corpus grows past the WASM heap.
  for (const { label, doc } of reportSources(MUTATE_OPTIONS))
    await withSolver(async () => {
      const before = new Map<string, Verdict>()
      for (const [name, embedder] of Object.entries(EMBEDDERS)) {
        const v = await verdictOf(doc, embedder())
        before.set(name, v)
        if (v.verified) tally.verified += 1
      }
      for (const { what, rename, vocabulary } of candidates(doc)) {
        const declared: RequirementsDocument = {
          ...doc,
          docVersion: DOC_VERSION_VOCAB,
          vocabulary: { ...vocabulary, frozenTables: { sha256: frozenTablesDigest(doc) } },
        }
        if (validateVocabulary(declared).violations.length > 0) {
          tally.refused += 1
          continue
        }
        tally[rename ? 'renames' : 'merges'] += 1
        const projection = buildProjection(declared)
        if (projection === undefined) continue
        // Nothing rewritten and no row synthesized: the engine is handed the document as written.
        if (projection.rewrites.size === 0 && projection.quantityAliases.length === 0) continue
        tally.rewritten += 1
        const projected = projectedDocument(declared, projection)
        const joined = rename ? new Set<string>() : joinedRequirements(doc, projected)
        for (const [name, embedder] of Object.entries(EMBEDDERS)) {
          const was = before.get(name)
          if (was === undefined) continue
          const is = await verdictOf(projected, embedder())
          const at = `${label} ${what} (${name})`
          for (const code of was.errorCodes) {
            if (!is.errorCodes.has(code)) problems.push(`${at}: lost ${code}`)
          }
          for (const code of is.errorCodes) {
            if (rename && !was.errorCodes.has(code)) problems.push(`${at}: gained ${code}`)
          }
          const touches = (said: string) =>
            (said.split(SEP)[2] ?? '').split(',').some((id) => joined.has(id))
          for (const [from, to, change] of [
            [was.said, is.said, 'lost'],
            [is.said, was.said, 'gained'],
          ] as const) {
            for (const said of from) {
              if (!to.has(said) && !touches(said)) {
                problems.push(`${at}: ${change} ${said.split(SEP).join(' ')}`)
              }
            }
          }
          if (rename && is.verified !== was.verified) {
            problems.push(`${at}: verified ${was.verified} -> ${is.verified}`)
          }
        }
      }
    })
  expect(problems).toEqual([])
  // Non-vacuous every way: renames and merges are admitted and measured, some of them rewrite
  // what the engine reads, some candidates are refused, and some runs are verified.
  expect(tally.renames).toBeGreaterThan(0)
  expect(tally.merges).toBeGreaterThan(0)
  expect(tally.rewritten).toBeGreaterThan(0)
  expect(tally.refused).toBeGreaterThan(0)
  expect(tally.verified).toBeGreaterThan(0)
}
