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
import { areContrary, atomize, makeAtomize } from './atomize.ts'
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
    // One verb spelled two ways is one verb — an orthographic rule, not a synonymy.
    expect(name('rollback the batch')).toBe('sys__vault__resp__roll_back_the_batch')
  })

  // Splitting one side into its own verbs must not also split ONE verb spelled two ways: the
  // opposition-candidate tier cannot see `roll back X` / `rollback X` (their remainders differ by
  // the head's own second token), so split, each pair below certified `verified: true` over a
  // real conflict.
  for (const [name, a, b] of [
    ['roll back / not rollback', 'roll back the deployment', 'not rollback the deployment'],
    ['rollback / not roll back', 'rollback the deployment', 'not roll back the deployment'],
  ] as const) {
    it(`${name} under one context is FND_CONTRADICTION naming both`, async () => {
      const report = await runCheck(await docOf([`${CONVEYOR} ${a}.`, `${CONVEYOR} ${b}.`]))
      const found = report.findings.filter((f) => f.code === 'FND_CONTRADICTION')
      expect(found.map((f) => f.requirementIds)).toEqual([[idOf(1), idOf(2)]])
    })
  }

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

  it('a preposition the verb does not govern keeps its direction inside a governed class', async () => {
    // The drop is per VERB: `connect` governs `to` and `disconnect` governs `from`, so each drops
    // only the preposition that introduces its OWN complement. A class-wide union dropped `from`
    // after `connect` and `to` after `disconnect`, so "connect calls FROM the number" (incoming
    // calls allowed) and "disconnect calls TO the number" (outgoing calls cut) shared the key
    // `calls_the_number` and were an error-severity FND_CONTRADICTION on a consistent document.
    for (const [x, y] of [
      ['connect calls from the number', 'disconnect calls to the number'],
      ['add traffic from the subnet', 'remove traffic to the subnet'],
      ['include messages from the admin', 'exclude messages to the admin'],
      ['insert the card from the tray', 'withdraw the card into the tray'],
    ] as const) {
      expect(await errorsOf([`${BLOCK} ${x}.`, `${BLOCK} ${y}.`]), `${x} / ${y}`).toEqual([])
    }
  })

  it('a pair the old drop related and the solver no longer does DEMOTES instead', async () => {
    // "connect calls from the number" / "disconnect calls to the number" are two keys, because
    // neither verb governs the preposition it is written with, so it carries direction. They
    // may still be one object, so the opposition-candidate tier proposes the pair regardless of
    // cosine and `verified` cannot come back true over it. The same holds for one side of a
    // class a preposition apart (grant / not allow), which the old side rename made one atom.
    // ("grant access to the user" / "revoke access from the user" is no longer here: each verb
    // governs its own preposition, so the solver proves it — antonym-rows.test.ts.)
    const orthogonal: Embedder = async (texts) =>
      texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1]))
    for (const [x, y] of [
      ['grant access to the user', 'not allow access from the user'],
      ['connect calls from the number', 'disconnect calls to the number'],
      ['add traffic from the subnet', 'remove traffic to the subnet'],
    ] as const) {
      const report = await runCheck(await docOf([`${BLOCK} ${x}.`, `${BLOCK} ${y}.`]), {
        semantic: { embedder: orthogonal },
      })
      expect(
        report.findings.filter((f) => f.severity === 'error'),
        `${x} / ${y}`,
      ).toEqual([])
      expect(
        report.findings.map((f) => f.code),
        `${x} / ${y}`,
      ).toContain('FND_OPPOSITION_CANDIDATE')
      expect(report.verified, `${x} / ${y}`).toBe(false)
      // The pair is already in the table, so the message must not tell the author to commit it.
      const message = report.findings.find((f) => f.code === 'FND_OPPOSITION_CANDIDATE')?.message
      expect(message).toContain('differ only by prepositions')
      expect(message).not.toContain('symspec antonym add')
    }
  })

  it('a two-token head the table lists is read whole, so its pair demotes too: roll back', async () => {
    // The atomizer probes "roll back" before "roll" (antonymReading); the candidate tier read only
    // the first token, so `roll` met no class, the rests ("back the batch in …" / "the batch
    // within …") never lined up, and nothing demoted: `verified: true` over a pair the table
    // relates. Neither pair here is decided: a `within` that opens a deadline names no place, and
    // `from` / `to` are the directions commit and roll back do not govern.
    // The one-token spelling "rollback" was caught all along; only the two-token path missed.
    const orthogonal: Embedder = async (texts) =>
      texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1]))
    for (const [x, y] of [
      ['commit the batch within the hour', 'roll back the batch in the hour'],
      ['commits the batch from the ledger', 'rolls back the batch to the ledger'],
      ['roll back the batch to the ledger', 'commit the batch from the ledger'],
    ] as const) {
      const report = await runCheck(await docOf([`${BLOCK} ${x}.`, `${BLOCK} ${y}.`]), {
        semantic: { embedder: orthogonal },
      })
      expect(
        report.findings.filter((f) => f.severity === 'error'),
        `${x} / ${y}`,
      ).toEqual([])
      const candidate = report.findings.find((f) => f.code === 'FND_OPPOSITION_CANDIDATE')
      expect(candidate?.message, `${x} / ${y}`).toContain('"roll_back"')
      expect(report.verified, `${x} / ${y}`).toBe(false)
    }
  })

  it('a pair the solver DOES relate is not proposed: include IN / exclude FROM', async () => {
    const orthogonal: Embedder = async (texts) =>
      texts.map((_, i) => Float32Array.from(i % 2 === 0 ? [1, 0] : [0, 1]))
    const report = await runCheck(
      await docOf([
        `${BLOCK} include the tile in the view.`,
        `${BLOCK} exclude the tile from the view.`,
      ]),
      { semantic: { embedder: orthogonal } },
    )
    expect(report.findings.map((f) => f.code)).not.toContain('FND_OPPOSITION_CANDIDATE')
  })

  it('marks the governed preposition, so a governed key never meets a literal one', () => {
    // "include the tile in the view" reads `the_tile__the_view` with the `in` it governs marked
    // out. Dropping the word instead made that key equal to the LITERAL key of "exclude the tile
    // the view" — a remainder that never had a preposition there, related by a word it lacks.
    const resp = (text: string) => atomize({ kind: 'resp', text, systemName: 'viewer' })
    expect(
      areContrary(resp('include the tile in the view'), resp('exclude the tile the view')),
    ).toBe(false)
    expect(
      areContrary(resp('include the tile in the view'), resp('exclude the tile from the view')),
    ).toBe(true)
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

describe('AC-2-1 with I-1 — a glossary alias carries its phrase’s contraries', () => {
  // A glossary entry says two phrases name ONE action, which is strengthening (spec 007 I-1): it
  // may only add findings. It used to move the aliased phrase onto the canonical's opposition key
  // and forget its own, so aliasing ONE side of a proven contrary pair split the pair, and
  // "open the door" plus "close the door" while the train moves went from FND_CONTRADICTION to
  // a clean `verified: true`. The alias IS "open the door", so ¬(open the door ∧ close the door)
  // still holds of the atom it now names.
  const MOVING = 'While the train is moving, the door controller shall'
  const contradictionsOf = async (
    sentences: readonly string[],
    glossary: readonly { canonical: string; aliases: string[] }[],
  ) => {
    const doc = (await docOf(sentences)) as unknown as { glossary: unknown[] }
    doc.glossary = [...glossary]
    const report = await runCheck(doc as never)
    return report.findings
      .filter((f) => f.code === 'FND_CONTRADICTION')
      .map((f) => f.requirementIds)
  }
  const HATCH = [{ canonical: 'open the hatch', aliases: ['open the door'] }]

  it('aliasing one side of a seeded pair keeps the pair a contradiction', async () => {
    expect(
      await contradictionsOf([`${MOVING} open the door.`, `${MOVING} close the door.`], HATCH),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('so does a requirement that uses the CANONICAL wording', async () => {
    // "open the hatch" IS "open the door" by the entry, so "close the door" is its contrary too.
    expect(
      await contradictionsOf([`${MOVING} open the hatch.`, `${MOVING} close the door.`], HATCH),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('and a canonical outside every antonym class still inherits its alias’s contrary', async () => {
    const UNLATCH = [{ canonical: 'unlatch the hatch', aliases: ['open the door'] }]
    expect(
      await contradictionsOf([`${MOVING} open the door.`, `${MOVING} close the door.`], UNLATCH),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('"do neither" stays consistent through an alias', async () => {
    expect(
      await contradictionsOf(
        [`${MOVING} not open the door.`, `${MOVING} not close the door.`],
        HATCH,
      ),
    ).toEqual([])
  })

  it('an alias that MERGES the two sides of a pair keeps them contraries', async () => {
    // With ¬(open the door ∧ close the door), an entry saying the two are ONE action makes both
    // impossible. Merging them onto one atom instead read the conflict as a redundancy, and
    // `verified: true` came back over it. The atomizer keeps each contrary phrase on its own
    // atom, so the contrary axiom still relates them.
    const STOPS = 'When the train stops, the door controller shall'
    for (const glossary of [
      [{ canonical: 'open the door', aliases: ['close the door'] }],
      [{ canonical: 'close the door', aliases: ['open the door'] }],
      [{ canonical: 'operate the door', aliases: ['open the door', 'close the door'] }],
    ]) {
      for (const lead of [MOVING, STOPS]) {
        expect(
          await contradictionsOf([`${lead} open the door.`, `${lead} close the door.`], glossary),
          JSON.stringify(glossary),
        ).toEqual([[idOf(1), idOf(2)]])
      }
    }
    expect(
      await contradictionsOf(
        [`${STOPS} grant access.`, `${STOPS} revoke access.`],
        [{ canonical: 'grant access', aliases: ['revoke access'] }],
      ),
    ).toEqual([[idOf(1), idOf(2)]])
  })

  it('a contrary alias keeps its own atom, links to the entry, and lends the entry its reading', () => {
    // Each contrary phrase keeps its own atom, so the contrary axiom still relates them, and names
    // the ENTRY atom its requirement links to, so the entry's "one action" is not lost. Every
    // phrase of the entry is that one action, so "operate the door" (outside every class) reads
    // both sides of open/close: a contrary of either phrase is a contrary of it.
    const glossary = new Map([
      ['open_the_door', 'operate_the_door'],
      ['close_the_door', 'operate_the_door'],
    ])
    const resp = (text: string) => atomize({ kind: 'resp', text, systemName: 'door', glossary })
    expect(resp('open the door').name).toBe('sys__door__resp__open_the_door')
    expect(resp('close the door').name).toBe('sys__door__resp__close_the_door')
    for (const text of ['open the door', 'close the door', 'operate the door']) {
      expect(resp(text).entry, text).toBe('sys__door__entry__operate_the_door')
    }
    const operate = resp('operate the door').opposition
    expect([operate, ...(operate?.via ?? [])].map((r) => r?.head).sort()).toEqual(['close', 'open'])
    // An entry that names no contraries merges as it always has, and links nothing.
    const benign = new Map([['open_the_hatch', 'open_the_door']])
    const plain = atomize({
      kind: 'resp',
      text: 'open the hatch',
      systemName: 'door',
      glossary: benign,
    })
    expect(plain.name).toBe('sys__door__resp__open_the_door')
    expect(plain.entry).toBeUndefined()
    // A guard is not a response: the antonym table never reads it, so the entry still merges it.
    expect(
      atomize({ kind: 'trig', text: 'close the door', systemName: 'door', glossary }).name,
    ).toBe(atomize({ kind: 'trig', text: 'operate the door', systemName: 'door', glossary }).name)
    expect(
      atomize({ kind: 'trig', text: 'close the door', systemName: 'door', glossary }).entry,
    ).toBeUndefined()
  })

  it('a contrary alias demotes `verified`, and a benign alias beside it still merges', async () => {
    const STOPS = 'When the train stops, the door controller shall'
    const doc = (await docOf([
      `${STOPS} open the door.`,
      `${STOPS} open the hatch.`,
    ])) as unknown as { glossary: unknown[] }
    doc.glossary = [{ canonical: 'open the door', aliases: ['close the door', 'open the hatch'] }]
    const report = await runCheck(doc as never)
    const demotions = report.coverage.demotions.filter(
      (d) => d.reason === 'contrary-glossary-alias',
    )
    // Neither requirement uses "close the door", yet the entry makes "open the door" impossible:
    // no requirement is checked against that, so the run must not certify.
    expect(demotions.map((d) => d.requirementIds)).toEqual([[idOf(1), idOf(2)]])
    expect(demotions[0]?.action).toContain(
      'symspec glossary "open the door" "close the door" --remove',
    )
    expect(demotions[0]?.action).not.toContain('"open the hatch" --remove')
    expect(report.verified).toBe(false)
    // "open the hatch" is not a contrary of anything in the entry, so it still names the atom.
    expect(report.findings.map((f) => f.code)).toContain('FND_REDUNDANCY')
  })

  it('an alias relates nothing it does not name: open the hatch / close the gate', async () => {
    expect(
      await contradictionsOf([`${MOVING} open the hatch.`, `${MOVING} close the gate.`], HATCH),
    ).toEqual([])
  })
})
