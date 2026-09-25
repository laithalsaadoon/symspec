/**
 * Curated seed antonym table for the formal atomizer (AC-4-2a).
 *
 * The single load-bearing purpose: relate polar-opposite response verbs by a
 * CONTRARY axiom, `¬(grant_x ∧ revoke_x)` over two distinct atoms (spec 007
 * AC-2-1), so the SMT tier can actually detect the common "grant vs revoke" style
 * contradiction. Without this table that whole class of conflict is a false
 * negative and the minimal-unsat-core finding (AC-4-4) is nearly vacuous
 * (research-smt.md §4.2 rule 2; spec AC-4-2a).
 *
 * A contrary, never the rename `revoke ≡ ¬grant`: the rename asserted that one of
 * the two always happens, so "shall not grant" plus "shall not revoke" — a
 * document that says "do neither" — was an error-severity contradiction.
 *
 * Scope and conservatism (research-smt.md §4.2, §4.3):
 *   - This is a small, HIGH-PRECISION, curated resource — NOT a thesaurus and
 *     NOT runtime fuzzy expansion. It ships the 15 seed pairs the spec pinned
 *     plus the adversarial-eval expansion (each pair below is an eval-confirmed
 *     real-world blind spot), and grows only by an explicit edit to this seed
 *     set (AC-4-12) or the doc-committed `antonym add` path. A bulk dictionary
 *     import was evaluated (2026-07) and rejected: WordNet's 477 verb-antonym
 *     pairs covered only 13 of the 32 pairs the table held then, contain odd
 *     polarity cycles that break the signed union-find, and merge classes this
 *     table deliberately keeps apart — curation IS the architecture here.
 *   - A contrary requires the (de-inflected) leading verbs to be one seeded or
 *     committed pair AND the object remainder to be identical after
 *     normalization, or identical once each verb's own governed preposition is marked out
 *     ({@link GOVERNED_PREPOSITIONS}):
 *     "grant access" is a contrary of "revoke access" but not of "revoke permission".
 *
 * Shared-member semantics (why a signed union-find, and why it is not a synonym table):
 *   Some seed pairs share a member — `accept↔reject`, `approve↔reject`, and
 *   `accept↔decline` all touch `accept`/`reject`. We treat each pair as an
 *   edge between opposite polarity SIDES and 2-colour the connected components:
 *   `accept`, `approve` (positive) and `reject`, `decline` (negative) form one
 *   class named after its lexicographically smallest member (`accept`). The class
 *   is BOOKKEEPING — it names the opposition key two contraries share, and its
 *   2-colouring is the write-time consistency check — never a relation by itself.
 *
 * Only a seeded or committed PAIR relates two verbs (spec 007 AC-2-1). Two contrary
 * axioms `¬(A ∧ C)` and `¬(B ∧ C)` do not entail `A ≡ B`, so members on one side of a
 * class stay DISTINCT atoms (`publish` and `extend` are two actions that each retract
 * opposes), and two members on opposite sides are contraries only when a pair joins them
 * directly ({@link AntonymEntry.opposes}): `conceal` and `unseal` meet only through
 * `seal`/`expose`, so nothing relates them. Reading synonymy off the table was a
 * fabrication that grew with every committed pair — committing `hold↔release` beside
 * the seed `quarantine↔release` made "hold the order" and "shall not quarantine the
 * order" an error-severity FND_CONTRADICTION.
 */

/**
 * The seed antonym pairs (AC-4-2a; original 15 from the spec plus the
 * adversarial-eval expansion). Each `[a, b]` asserts that `a` and `b` are polar
 * opposites — a response led by `a` and one led by `b` (with the same object
 * remainder) are contraries: they cannot both hold. Multiword heads
 * are underscore-joined in normalized form (`roll_back`); the atomizer probes
 * two-token heads before one.
 *
 * Append-only in spirit: the seed set is a documented contract surface. Grow it
 * by editing this array, do not silently reorder or drop pairs. The resolved
 * class → canonical map is snapshot-tested so any edit that silently merges or
 * re-canonicalizes classes fails loudly.
 *
 * Shared classes (adversarial-eval driven, each a judgment call). A class relates
 * exactly its listed pairs, so each cross-side contrary the table means is a row here:
 *   - grant/allow/permit/authorize against revoke/deny/forbid: every one of the twelve
 *     cross-side pairs is a row. The eval's grant-vs-deny blind spot (grant/revoke and
 *     allow/deny were disjoint classes) is closed by the grant↔deny, permit↔deny and
 *     authorize↔deny rows; the rest are the cross-side block. The four positive verbs are
 *     NOT synonyms to the table — "shall grant X" plus "shall not allow X" is two atoms, and
 *     the opposition-candidate tier demotes `verified` on it until the author commits the
 *     glossary merge (or an antonym, or a waiver). Neither are the three negative ones:
 *     "revoke X" plus "not deny X" is two atoms too.
 *   - accept/approve against reject/decline: all four cross-side pairs are rows.
 *   - seal/conceal against unseal/expose: three of the four. `conceal`↔`unseal` is NOT a row:
 *     unsealing an envelope and keeping it out of sight are compatible, so the class's two
 *     edges apart (via seal and expose) is not a contrary, and nothing relates them.
 *   - publish/extend share a class via retract (publish↔retract, extend↔retract): both
 *     are on the positive side, so they are never related to EACH OTHER — only each to
 *     `retract`. Kept because both pairs are eval-confirmed real-world conflicts.
 *   - The accept/approve/reject/decline class is deliberately NOT merged into
 *     the authorization class (proposal-acceptance ≠ access-authorization).
 */
export const SEED_ANTONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['accept', 'reject'],
  ['enable', 'disable'],
  ['grant', 'revoke'],
  ['allow', 'deny'],
  ['permit', 'forbid'],
  ['approve', 'reject'],
  ['lock', 'unlock'],
  ['open', 'close'],
  ['activate', 'deactivate'],
  ['connect', 'disconnect'],
  ['include', 'exclude'],
  ['add', 'remove'],
  ['start', 'stop'],
  ['show', 'hide'],
  ['accept', 'decline'],
  // --- adversarial-eval expansion (Run 1–3 confirmed blind spots) ---
  ['grant', 'deny'],
  ['permit', 'deny'],
  ['authorize', 'deny'],
  ['commit', 'roll_back'],
  ['commit', 'rollback'],
  ['seal', 'unseal'],
  ['seal', 'expose'],
  ['expose', 'conceal'],
  ['quarantine', 'release'],
  ['publish', 'retract'],
  ['suspend', 'resume'],
  ['engage', 'disengage'],
  ['raise', 'lower'],
  ['insert', 'withdraw'],
  ['flood', 'drain'],
  ['energize', 'de_energize'],
  ['extend', 'retract'],
  // --- cross-side contraries the class structure used to imply (spec 007 AC-2-1) ---
  // Until the table related only its own rows, every positive member of a class opposed every
  // negative one. That chaining is gone; these are the pairs it related that ARE contraries in
  // requirements English, each written out so it is a relation the table states, not infers.
  // (`conceal`/`unseal` is the one it related that is not: see the class notes above.)
  ['approve', 'decline'],
  ['grant', 'forbid'],
  ['allow', 'forbid'],
  ['allow', 'revoke'],
  ['authorize', 'forbid'],
  ['authorize', 'revoke'],
  ['permit', 'revoke'],
]

/**
 * The prepositions a seed verb GOVERNS: the one that introduces its own complement, where the
 * verb, not the preposition, carries the direction. "include X in V" and "exclude X from V" name
 * one place, so each verb's governed preposition is marked out of a second opposition KEY and the
 * two are contraries (atomize.ts `governedKeyRest`). Nothing is ever dropped from the atom body.
 *
 * A closed, curated table in the same category as the seed pairs. A verb is listed only when a
 * contrary it has a ROW with takes a DIFFERENT preposition for the same place, and it is listed
 * with exactly the preposition it takes there. Two members that take the same one ("grant access
 * to the user" / "deny access to the user") already share a key without any mark, so `deny`,
 * `forbid`, `lock`, `raise` and the rest are unlisted. Applied row by row:
 *
 *   grant, allow, permit, authorize → to   /  revoke → from      ("… access to/from the user")
 *   show → to                               /  hide → from        ("… the report to/from the user")
 *   expose → to                             /  conceal, seal → from ("… the port to/from the network")
 *   publish, extend → to                    /  retract → from     ("… the offer to/from the customer")
 *   quarantine → in                         /  release → from     ("… the message in/from the queue")
 *   engage → with                           /  disengage → from   ("… the clutch with/from the gear")
 *   include → in, into, within              /  exclude → from
 *   add → to, into                          /  remove → from
 *   insert → into, in                       /  withdraw → from
 *   connect → to                            /  disconnect → from
 *
 * Deliberately unlisted although the row has two prepositions: `drain X of Y` / `flood X with Y`,
 * because `of` after a noun is overwhelmingly possessive ("drain the tank of the pump"), and
 * `commit X to Y` / `roll back X to Y`, whose `to` names two different things (the store written
 * to, the point restored to). An unlisted preposition keeps its place in every key: "allow calls
 * to the number" and "deny calls from the number" are two different calls, because `deny` takes
 * `to` for the place and so governs nothing, and a rule that dropped `to` and `from` for every
 * antonym head made them contraries.
 *
 * The set is per VERB ({@link AntonymEntry.governs}), never the union over its class. `connect`
 * governs `to` and `disconnect` governs `from`; a class-wide union let `connect` drop `from` as
 * well, so "connect calls FROM the number" (incoming calls allowed) and "disconnect calls TO the
 * number" (outgoing calls cut) shared one key and were an error-severity FND_CONTRADICTION on a
 * consistent document. Two remainders that are identical word for word ("include the file in
 * the box" / "exclude the file in the box") need no drop at all: every response also keeps the
 * key of its literal remainder, which is how they stay contraries. A doc-committed verb governs
 * nothing, so its remainders must match word for word, which can only miss a contrary, never
 * invent one.
 */
export const GOVERNED_PREPOSITIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['include', new Set(['in', 'into', 'within'])],
  ['exclude', new Set(['from'])],
  ['add', new Set(['to', 'into'])],
  ['remove', new Set(['from'])],
  ['insert', new Set(['into', 'in'])],
  ['withdraw', new Set(['from'])],
  ['connect', new Set(['to'])],
  ['disconnect', new Set(['from'])],
  ['grant', new Set(['to'])],
  ['allow', new Set(['to'])],
  ['permit', new Set(['to'])],
  ['authorize', new Set(['to'])],
  ['revoke', new Set(['from'])],
  ['show', new Set(['to'])],
  ['hide', new Set(['from'])],
  ['expose', new Set(['to'])],
  ['conceal', new Set(['from'])],
  ['seal', new Set(['from'])],
  ['publish', new Set(['to'])],
  ['extend', new Set(['to'])],
  ['retract', new Set(['from'])],
  ['quarantine', new Set(['in'])],
  ['release', new Set(['from'])],
  ['engage', new Set(['with'])],
  ['disengage', new Set(['from'])],
])

/** A resolved antonym-class membership for one verb. */
export interface AntonymEntry {
  /**
   * The lexicographically-smallest member of the verb's signed class — the class NAME, used in
   * the atom's opposition key (`atomize.ts` `Opposition`), never as the atom's head.
   */
  canonical: string
  /** True when this verb sits on the OPPOSITE polarity side of `canonical`. */
  negated: boolean
  /**
   * The verbs a seeded or committed pair opposes to this one DIRECTLY, sorted and deduplicated.
   * The only relation the table asserts: an atom led by this verb is a contrary of an atom led
   * by one of these over the same key, and of nothing else in the class (spec 007 AC-2-1).
   */
  opposes: readonly string[]
  /**
   * The prepositions THIS verb governs ({@link GOVERNED_PREPOSITIONS}), sorted: the ones that
   * introduce its own complement, which its governed opposition key marks out. Per verb, never
   * the class's union — a preposition only its contrary governs carries direction after it.
   */
  governs: readonly string[]
}

/**
 * Build the signed equivalence-class index from a list of antonym pairs.
 *
 * Pure and deterministic. Treats the pairs as an undirected graph whose edges
 * flip polarity, 2-colours each connected component by BFS, then re-bases each
 * component so its lexicographically-smallest member is the positive canonical.
 * Each entry keeps its own edges ({@link AntonymEntry.opposes}): the component names
 * the key, and only an edge relates two verbs.
 *
 * Throws if the pairs contain an odd (inconsistent) polarity cycle — impossible
 * for the fixed seeds, but a guard against a future edit that would make
 * atomization non-deterministic.
 */
export function buildAntonymIndex(
  pairs: ReadonlyArray<readonly [string, string]>,
): ReadonlyMap<string, AntonymEntry> {
  // Adjacency: each verb -> the verbs asserted opposite to it.
  const adj = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    const list = adj.get(a)
    if (list) list.push(b)
    else adj.set(a, [b])
  }
  for (const pair of pairs) {
    const a = pair[0]
    const b = pair[1]
    link(a, b)
    link(b, a)
  }

  // BFS 2-colouring: sign[v] = false (positive) | true (negative) within a run.
  const sign = new Map<string, boolean>()
  const componentOf = new Map<string, string[]>()

  for (const start of adj.keys()) {
    if (sign.has(start)) continue
    const members: string[] = []
    sign.set(start, false)
    const queue: string[] = [start]
    while (queue.length > 0) {
      const v = queue.shift() as string
      members.push(v)
      const vSign = sign.get(v) as boolean
      for (const w of adj.get(v) ?? []) {
        const wSign = sign.get(w)
        if (wSign === undefined) {
          sign.set(w, !vSign)
          queue.push(w)
        } else if (wSign === vSign) {
          throw new Error(
            `Inconsistent antonym pairs: "${v}" and "${w}" resolve to the same polarity`,
          )
        }
      }
    }
    for (const m of members) componentOf.set(m, members)
  }

  const index = new Map<string, AntonymEntry>()
  for (const [verb, members] of componentOf) {
    const canonical = [...members].sort()[0] as string
    // Re-base sign relative to the canonical (which we pin to positive).
    const negated = (sign.get(verb) as boolean) !== (sign.get(canonical) as boolean)
    const opposes = [...new Set(adj.get(verb) ?? [])].sort()
    const governs = [...(GOVERNED_PREPOSITIONS.get(verb) ?? [])].sort()
    index.set(verb, { canonical, negated, opposes, governs })
  }
  return index
}

/**
 * The resolved index over the shipped seed pairs. This is the concrete table
 * the atomizer consults; it is computed once at module load and never mutated.
 */
export const ANTONYM_INDEX: ReadonlyMap<string, AntonymEntry> =
  buildAntonymIndex(SEED_ANTONYM_PAIRS)

/**
 * Build the resolved antonym index the atomizer consults from the code-committed
 * seed pairs PLUS a document's agent-confirmed pairs (#1). The two sources are
 * concatenated and handed to {@link buildAntonymIndex}, so a doc pair that
 * bridges two seed classes (or that shares a member with one) is resolved into
 * the same signed union-find as the seeds — the correct, deterministic
 * semantics, not a naive overlay.
 *
 * Returns {@link ANTONYM_INDEX} unchanged when there are no doc pairs, so the
 * default path pays nothing. Throws (via `buildAntonymIndex`) if a doc pair
 * introduces an inconsistent polarity cycle; callers that cannot tolerate a
 * throw at check time should validate the pair set at write time (the CLI does)
 * and fall back to the seed-only index.
 */
export function buildAntonymIndexWithDoc(
  docPairs: ReadonlyArray<readonly [string, string]>,
): ReadonlyMap<string, AntonymEntry> {
  if (docPairs.length === 0) return ANTONYM_INDEX
  return buildAntonymIndex([...SEED_ANTONYM_PAIRS, ...docPairs])
}
