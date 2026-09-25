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

describe('AC-2-1 — the table relates PAIRS, never the members of one side', () => {
  // Two contrary axioms `¬(A ∧ C)` and `¬(B ∧ C)` do not entail `A ≡ B`. The table used to name
  // every member of one side of a class after the side's smallest member, which is exactly that
  // rename: each consistent document below was an error-severity FND_CONTRADICTION, and the
  // committed-pair ones grew out of a table edit no requirement mentioned.
  const AUDIT = 'When the audit completes, the auth service shall'
  const INVOICE = 'When an invoice arrives, the payables service shall'
  const FAIL = 'When a payment fails, the order service shall'
  const cases: ReadonlyArray<
    readonly [string, string, string, ReadonlyArray<{ a: string; b: string }>]
  > = [
    [
      'publish / not extend',
      `${AUDIT} publish the article.`,
      `${AUDIT} not extend the article.`,
      [],
    ],
    [
      'accept / not approve',
      `${INVOICE} accept the invoice.`,
      `${INVOICE} not approve the invoice.`,
      [],
    ],
    ['seal / not conceal', `${AUDIT} seal the box.`, `${AUDIT} not conceal the box.`, []],
    ['revoke / not deny', `${AUDIT} revoke the session.`, `${AUDIT} not deny the session.`, []],
    [
      'hold / not quarantine, after hold↔release is committed',
      `${FAIL} hold the order.`,
      `${FAIL} not quarantine the order.`,
      [{ a: 'hold', b: 'release' }],
    ],
    [
      'finish / not stop, after start↔finish is committed',
      `${AUDIT} finish the job.`,
      `${AUDIT} not stop the job.`,
      [{ a: 'start', b: 'finish' }],
    ],
  ]
  for (const [name, a, b, antonyms] of cases) {
    it(`${name} is no error: two atoms, and no axiom between them`, async () => {
      const doc = (await docOf([a, b])) as unknown as { antonyms: unknown[] }
      doc.antonyms = [...antonyms]
      const report = await runCheck(doc as never)
      expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.code)).toEqual([])
    })
  }

  it('an opposite-side pair two edges apart is unrelated too: conceal / unseal', async () => {
    // seal↔unseal, seal↔expose, expose↔conceal: `conceal` and `unseal` sit on opposite sides of
    // one class and no pair joins them, so both asserted is no contradiction.
    const report = await runCheck(
      await docOf([`${AUDIT} conceal the box.`, `${AUDIT} unseal the box.`]),
    )
    expect(report.findings.filter((f) => f.severity === 'error').map((f) => f.code)).toEqual([])
  })

  it('every pair that IS in the table still proves its contradiction', async () => {
    for (const [x, y] of [
      ['publish', 'retract'],
      ['extend', 'retract'],
      ['approve', 'reject'],
      ['seal', 'expose'],
      ['conceal', 'expose'],
      ['revoke', 'grant'],
    ] as const) {
      const report = await runCheck(
        await docOf([`${AUDIT} ${x} the box.`, `${AUDIT} ${y} the box.`]),
      )
      const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
      expect(
        found.map((f) => f.requirementIds),
        `${x} / ${y}`,
      ).toEqual([[idOf(1), idOf(2)]])
    }
  })

  it('a doc-committed pair relates its own two verbs, and not a seed verb beside one', async () => {
    const doc = (await docOf([
      `${CONVEYOR} open the valve.`,
      `${CONVEYOR} shut the valve.`,
      `${CONVEYOR} close the hatch.`,
      `${CONVEYOR} not shut the hatch.`,
    ])) as unknown as { antonyms: unknown[] }
    doc.antonyms = [{ a: 'open', b: 'shut' }]
    const report = await runCheck(doc as never)
    const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
    // open/shut the valve clash; `close` and `shut` are two actions `open` opposes, not one.
    expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
  })

  it("names every atom after the author's own verb", () => {
    const name = (text: string) => atomize({ kind: 'resp', text, systemName: 'vault' }).name
    expect(name('grant access')).toBe('sys__vault__resp__grant_access')
    expect(name('allow access')).toBe('sys__vault__resp__allow_access')
    expect(name('publish the article')).toBe('sys__vault__resp__publish_the_article')
    expect(name('rolls back the batch')).toBe('sys__vault__resp__roll_back_the_batch')
    expect(name('rollback the batch')).toBe('sys__vault__resp__rollback_the_batch')
  })

  it('a same-class pair the table cannot decide DEMOTES instead: grant / not allow', async () => {
    // Split, "shall grant X" plus "shall not allow X" is two unrelated atoms, and the table's
    // own class membership is the evidence that the two verbs are related. The opposition-
    // candidate tier proposes it regardless of cosine, so it cannot certify silently.
    const parallel: Embedder = async (texts) => texts.map(() => Float32Array.from([1, 0]))
    const orthogonal: Embedder = async (texts) =>
      texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1]))
    for (const embedder of [parallel, orthogonal]) {
      const report = await runCheck(
        await docOf([
          `${AUDIT} grant access to the vault.`,
          `${AUDIT} not allow access to the vault.`,
        ]),
        { semantic: { embedder } },
      )
      expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
      expect(report.findings.map((f) => f.code)).toContain('FND_OPPOSITION_CANDIDATE')
      expect(report.verified).toBe(false)
    }
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

describe('AC-2-1 — a preposition that carries direction is never dropped', () => {
  // The antonym-remainder rule used to drop the first preposition after an antonym head from the
  // atom BODY and the key alike, so "calls to the number" and "calls from the number" were one
  // atom and "to"/"from" a spelling detail. Direction is carried by the head only for the verbs
  // whose complement the verb itself governs (include IN / exclude FROM); elsewhere the
  // preposition belongs to the object.
  const BLOCK = 'When the user blocks a number, the call filter shall'
  const FROZEN = 'While the account is frozen, the bank shall'
  const errorsOf = async (sentences: readonly string[]) =>
    (await runCheck(await docOf(sentences))).findings
      .filter((f) => f.severity === 'error')
      .map((f) => f.code)

  it('allow calls TO / not allow calls FROM the number is no error', async () => {
    expect(
      await errorsOf([
        `${BLOCK} allow calls to the number.`,
        `${BLOCK} not allow calls from the number.`,
      ]),
    ).toEqual([])
  })

  it('enable transfers TO / not enable transfers FROM the account is no error', async () => {
    expect(
      await errorsOf([
        `${FROZEN} enable transfers to the account.`,
        `${FROZEN} not enable transfers from the account.`,
      ]),
    ).toEqual([])
  })

  it('allow calls TO / deny calls FROM the number is no error — the KEY keeps it too', async () => {
    expect(
      await errorsOf([
        `${BLOCK} allow calls to the number.`,
        `${BLOCK} deny calls from the number.`,
      ]),
    ).toEqual([])
  })

  it('a verb-governed complement still opposes: include IN / exclude FROM, add TO / remove FROM', async () => {
    for (const [x, y] of [
      ['include the tile in the view', 'exclude the tile from the view'],
      ['include the file in the box', 'exclude the file in the box'],
      ['add the user to the group', 'remove the user from the group'],
      ['insert the card into the reader', 'withdraw the card from the reader'],
      ['connect the pump to the tank', 'disconnect the pump from the tank'],
    ] as const) {
      const report = await runCheck(await docOf([`${BLOCK} ${x}.`, `${BLOCK} ${y}.`]))
      const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
      expect(
        found.map((f) => f.requirementIds),
        `${x} / ${y}`,
      ).toEqual([[idOf(1), idOf(2)]])
    }
  })

  it('keeps every preposition in the atom body', () => {
    const name = (text: string) => atomize({ kind: 'resp', text, systemName: 'filter' }).name
    expect(name('allow calls to the number')).toBe('sys__filter__resp__allow_calls_to_the_number')
    expect(name('allow calls to the number')).not.toBe(name('allow calls from the number'))
    expect(name('exclude the tile from the view')).toBe(
      'sys__filter__resp__exclude_the_tile_from_the_view',
    )
  })
})
