/**
 * Opposition is a CONTRARY axiom over two atoms, never a rename (spec 007 AC-2-1).
 *
 * ## The fabrication these reproducers pin
 *
 * The seed antonym table used to rewrite `reject` to `accept` and flip the polarity, so
 * "shall not reject the purchase order" became `accept_the_purchase_order` asserted POSITIVE.
 * Paired with "shall not accept the purchase order" under one trigger, the solver saw
 * `A ∧ ¬A` and reported `FND_CONTRADICTION` at error severity — on a document that only says
 * "do neither", which is perfectly consistent. The rename `reject ≡ ¬accept` asserts that one
 * of the two ALWAYS happens; the table only ever meant that both cannot happen at once.
 *
 * The encoding that means what the table means is `¬(accept ∧ reject)` over two DISTINCT
 * atoms. It keeps "shall accept" + "shall reject" unsatisfiable, and it is strictly weaker than
 * the rename, so every conflict it proves the rename proved too — it can only remove findings.
 *
 * Every reproducer runs the sentence through the real parser and the real pipeline, so the
 * slots under test are the ones an author's sentence actually produces.
 */

import { describe, expect, it } from 'vitest'
import { parseLine } from '../parse/result.ts'
import { runCheck } from '../pipeline/check.ts'
import { atomize, makeAtomize } from './atomize.ts'
import type { Embedder } from './embed.ts'
import type { EncodableRequirement } from './encode.ts'
import { findNeedsReview } from './needs-review.ts'
import { findSimilarSemantic } from './semantic.ts'
import { findSimilarUnunified } from './similar.ts'

const TS = '2026-01-01T00:00:00.000Z'

/** Parse each sentence through the real ladder and build an engine document from the slots. */
const docOf = async (sentences: readonly string[]) => {
  const requirements: Record<string, unknown> = {}
  for (const [i, sentence] of sentences.entries()) {
    const parsed = await parseLine(sentence)
    if (parsed.outcome !== 'ok') throw new Error(`fixture did not parse: ${sentence}`)
    const id = `0a0a0a0a-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
    requirements[id] = {
      id,
      patternType: parsed.slots.patternType,
      systemName: parsed.slots.systemName,
      systemResponse: parsed.slots.systemResponse,
      ...(parsed.slots.trigger !== undefined ? { trigger: parsed.slots.trigger } : {}),
      ...(parsed.slots.preCondition !== undefined
        ? { preCondition: parsed.slots.preCondition }
        : {}),
      negated: parsed.negated,
      sentence,
      priority: 'medium',
      status: 'draft',
      createdAt: TS,
      updatedAt: TS,
      derives: [],
      satisfies: [],
      verifies: [],
      refines: [],
    }
  }
  return {
    requirements,
    glossary: [],
    antonyms: [],
    waivers: [],
    terms: [],
    stateModel: { variables: [] },
  } as never
}

const idOf = (n: number) => `0a0a0a0a-0000-4000-8000-${String(n).padStart(12, '0')}`

const PO = 'When a flagged purchase order is received, the procurement system shall'
const CONVEYOR = 'While the maintenance mode is active, the conveyor controller shall'

describe('AC-2-1 — "shall not A" plus "shall not B" is consistent', () => {
  it('the purchase-order reproducer produces no error finding', async () => {
    const report = await runCheck(
      await docOf([`${PO} not accept the purchase order.`, `${PO} not reject the purchase order.`]),
      { temporal: {} },
    )
    const errors = report.findings.filter((f) => f.severity === 'error')
    expect(errors.map((f) => f.code)).toEqual([])
  })

  it('the conveyor reproducer produces no error finding', async () => {
    const report = await runCheck(
      await docOf([`${CONVEYOR} not start the conveyor.`, `${CONVEYOR} not stop the conveyor.`]),
      { temporal: {} },
    )
    const errors = report.findings.filter((f) => f.severity === 'error')
    expect(errors.map((f) => f.code)).toEqual([])
  })

  it('opposite verbs land on two DISTINCT atoms, and a flip never comes from the table', () => {
    const accept = atomize({ kind: 'resp', text: 'accept the order', systemName: 'po' })
    const reject = atomize({ kind: 'resp', text: 'reject the order', systemName: 'po' })
    expect(accept.name).not.toBe(reject.name)
    // Polarity is the parse's `negated`, and nothing else: a positive sentence is a positive atom.
    expect(accept.negated).toBe(false)
    expect(reject.negated).toBe(false)
  })
})

describe('AC-2-1 — "shall A" plus "shall B" is still a contradiction', () => {
  it('accept + reject under one trigger is FND_CONTRADICTION naming both', async () => {
    const report = await runCheck(
      await docOf([`${PO} accept the purchase order.`, `${PO} reject the purchase order.`]),
    )
    const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })

  it('start + stop under one precondition is FND_CONTRADICTION naming both', async () => {
    const report = await runCheck(
      await docOf([`${CONVEYOR} start the conveyor.`, `${CONVEYOR} stop the conveyor.`]),
    )
    const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })

  it('a doc-committed pair is a contrary axiom too', async () => {
    const doc = (await docOf([
      `${CONVEYOR} open the valve.`,
      `${CONVEYOR} shut the valve.`,
      `${CONVEYOR} not open the hatch.`,
      `${CONVEYOR} not shut the hatch.`,
    ])) as unknown as { antonyms: unknown[] }
    doc.antonyms = [{ a: 'open', b: 'shut' }]
    const report = await runCheck(doc as never)
    const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    // open/shut the valve clash; "neither open nor shut the hatch" does not.
    expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })
})

describe('AC-2-1 — members on ONE side of a class stay one atom', () => {
  // The contrary replaced the rename `A ≡ ¬B` ACROSS a class. It must not also split the
  // members on one side of it: the table merges grant/allow/permit/authorize on purpose, and
  // `roll back`/`rollback` are one verb spelled two ways. Split, each pair below was two
  // unrelated atoms with no axiom between them — verified: true over a real conflict, with no
  // finding at all (the lexical tier only sees near-duplicate-sentence candidates, and a pair
  // sharing a trigger is a different rule's candidate).
  const AUDIT = 'When the audit completes, the auth service shall'
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    [
      'grant / not allow',
      `${AUDIT} grant access to the vault.`,
      `${AUDIT} not allow access to the vault.`,
    ],
    [
      'permit / not authorize',
      `${AUDIT} permit access to the vault.`,
      `${AUDIT} not authorize access to the vault.`,
    ],
    ['revoke / not deny', `${AUDIT} revoke access.`, `${AUDIT} not deny access.`],
    ['accept / not approve', `${PO} accept the order.`, `${PO} not approve the order.`],
    [
      'roll back / not rollback',
      `${CONVEYOR} roll back the deployment.`,
      `${CONVEYOR} not rollback the deployment.`,
    ],
    [
      'rollback / not roll back',
      `${CONVEYOR} rollback the deployment.`,
      `${CONVEYOR} not roll back the deployment.`,
    ],
  ]
  for (const [name, a, b] of cases) {
    it(`${name} under one context is FND_CONTRADICTION naming both`, async () => {
      const report = await runCheck(await docOf([a, b]))
      const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
      expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
    })
  }

  it('a doc-committed pair joins a seed side: close / not shut is FND_CONTRADICTION', async () => {
    const doc = (await docOf([
      `${CONVEYOR} close the valve.`,
      `${CONVEYOR} not shut the valve.`,
    ])) as unknown as {
      antonyms: unknown[]
    }
    doc.antonyms = [{ a: 'open', b: 'shut' }]
    const report = await runCheck(doc as never)
    const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })

  it('names each side after its smallest member, and the two sides stay distinct', () => {
    const name = (text: string) => atomize({ kind: 'resp', text, systemName: 'vault' }).name
    expect(name('grant access')).toBe(name('allow access'))
    expect(name('authorize access')).toBe(name('permit access'))
    expect(name('grant access')).toBe('sys__vault__resp__allow_access')
    expect(name('revoke access')).toBe('sys__vault__resp__deny_access')
    expect(name('rolls back the batch')).toBe(name('rollback the batch'))
    expect(name('grant access')).not.toBe(name('deny access'))
  })
})

describe('AC-2-1 — the axioms reach every solver-driving tier', () => {
  it('temporal: an unconditional accept against a triggered reject is still inconsistent', async () => {
    const report = await runCheck(
      await docOf([
        'The procurement system shall accept the purchase order.',
        `${PO} reject the purchase order.`,
      ]),
      { temporal: {} },
    )
    const found = report.findings.filter((f) => f.code === 'FND_TEMPORAL_CONTRADICTION')
    expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })

  it('temporal: an unconditional "not accept" against a triggered "not reject" is consistent', async () => {
    const report = await runCheck(
      await docOf([
        'The procurement system shall not accept the purchase order.',
        `${PO} not reject the purchase order.`,
      ]),
      { temporal: {} },
    )
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.code)).toEqual([])
  })

  it('vacuity: a guard under which two rules demand contrary actions is unreachable', async () => {
    const report = await runCheck(
      await docOf([
        `${PO} accept the purchase order.`,
        `${PO} reject the purchase order.`,
        `${PO} log the purchase order.`,
      ]),
    )
    const vacuous = report.findings.filter((f) => f.code === 'FND_VACUITY')
    expect(vacuous.flatMap((f) => f.requirementIds)).toContain(idOf(3))
  })

  it('subsumption: "accept" entails "not reject", and not the other way round', async () => {
    const report = await runCheck(
      await docOf([`${PO} accept the purchase order.`, `${PO} not reject the purchase order.`]),
    )
    const sub = report.findings.filter(
      (f) => f.code === 'FND_SUBSUMPTION' || f.code === 'FND_REDUNDANCY',
    )
    // Under the rename these were one atom at one polarity, i.e. FND_REDUNDANCY — an
    // equivalence the table never asserted. The contrary axiom gives the one-way entailment.
    expect(sub.map((f) => f.code)).toEqual(['FND_SUBSUMPTION'])
  })

  it('subsumption: a pair related ONLY by a contrary axiom is not pruned as atom-disjoint', async () => {
    // Unconditional, so the two bodies are `accept_x` and `¬reject_x` and share no atom NAME —
    // the pairwise prune's lemma assumes distinct names are independent, which the axiom denies.
    // The long shared tail is what makes this a near-duplicate-sentence candidate pair at all.
    const tail = 'each flagged purchase order from the approved supplier list'
    const report = await runCheck(
      await docOf([
        `The procurement system shall accept ${tail}.`,
        `The procurement system shall not reject ${tail}.`,
      ]),
    )
    const sub = report.findings.filter((f) => f.code === 'FND_SUBSUMPTION')
    expect(sub.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })
})

describe('AC-2-1 — the propose tiers never offer two contraries as synonyms', () => {
  // Under the rename these pairs shared ONE atom name, and both propose tiers skip a pair whose
  // names match. Now the names differ, so without an explicit contrary check each tier would
  // tell the author to merge `grant access` into `revoke access`.
  const reqOf = (id: string, systemResponse: string) => ({
    id,
    systemName: 'vault',
    systemResponse,
    patternType: 'ubiquitous' as const,
    negated: false,
    // Ubiquitous on purpose: a shared trigger makes the pair a Rule 1 candidate, and only a
    // Rule 3 (near-duplicate-sentence) candidate reaches the lexical tier.
    sentence: `The vault shall ${systemResponse}.`,
  })
  const reqs = [reqOf('a', 'grant access to the ledger'), reqOf('b', 'revoke access to the ledger')]

  it('FND_SIMILAR_UNUNIFIED skips a seed-antonym pair', () => {
    expect(findSimilarUnunified(reqs as never, { similarityThreshold: 0.5 })).toEqual([])
  })

  it('FND_SIMILAR_UNUNIFIED has nothing to propose for a same-side pair: it is already one atom', () => {
    const sameSide = [reqOf('a', 'accept the ledger entry'), reqOf('b', 'approve the ledger entry')]
    expect(findSimilarUnunified(sameSide as never, { similarityThreshold: 0.5 })).toEqual([])
  })

  it('FND_SIMILAR_SEMANTIC skips a seed-antonym pair even at cosine 1', async () => {
    const identical: Embedder = async (texts) => texts.map(() => Float32Array.from([1, 0]))
    expect(await findSimilarSemantic(reqs, identical, { threshold: 0.5 })).toEqual([])
  })
})

describe('AC-2-1 — the needs-review tier checks the same problem the contradiction tier does', () => {
  it('hands its group checker the contrary axioms, so accept + reject is unsat there too', async () => {
    const reqOf = (id: string, systemResponse: string): EncodableRequirement => ({
      id,
      patternType: 'event-driven',
      trigger: 'a flagged purchase order is received',
      systemName: 'procurement system',
      systemResponse,
      negated: false,
      sentence: '',
      priority: 'medium',
      status: 'draft',
    })
    const statuses = new Map<string, string>()
    // A recording checker that runs exactly the default check: every whole-spec assertion it is
    // handed, the group's context, then the guards. Without the axioms in `formulaAsts` the
    // guarded group is `sat`, and a timeout there would be a question nobody asked.
    await findNeedsReview([reqOf('r1', 'accept the order'), reqOf('r2', 'reject the order')], {
      atomize: makeAtomize(),
      checkGroup: async (group, { ctx, formulaAsts, guardAsts }) => {
        const solver = new ctx.Solver()
        for (const f of formulaAsts) solver.add(f)
        for (const name of group.contextAtoms) solver.add(ctx.Bool.const(name))
        const status = await solver.check(...guardAsts)
        statuses.set(group.key, status)
        return status
      },
    })
    const guarded = [...statuses].filter(([key]) => key !== '')
    expect(guarded.map(([, status]) => status)).toEqual(['unsat'])
  })
})
