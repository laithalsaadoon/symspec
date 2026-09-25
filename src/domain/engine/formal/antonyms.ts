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
 *     pairs cover only 13 of the 32 pairs this table needs, contain odd
 *     polarity cycles that break the signed union-find, and merge classes this
 *     table deliberately keeps apart — curation IS the architecture here.
 *   - A contrary requires the (de-inflected) leading verbs to be one seeded or
 *     committed pair AND the object remainder to be identical after
 *     normalization + the governed-preposition drop ({@link GOVERNED_PREPOSITIONS}):
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
 * directly ({@link AntonymEntry.opposes}): `approve` and `decline` meet only through
 * `accept`/`reject`, so nothing relates them. Reading synonymy off the table was a
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
 *   - grant/allow/permit/authorize against revoke/deny/forbid: the eval's grant-vs-deny
 *     blind spot (grant/revoke and allow/deny were disjoint classes) is closed by the
 *     grant↔deny, permit↔deny and authorize↔deny rows. The four positive verbs are NOT
 *     synonyms to the table — "shall grant X" plus "shall not allow X" is two atoms, and
 *     the opposition-candidate tier demotes `verified` on it until the author commits the
 *     glossary merge (or an antonym, or a waiver).
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
]

/**
 * The prepositions a seed verb GOVERNS: the one that introduces its own complement, where the
 * verb, not the preposition, carries the direction. "include X in V" and "exclude X from V" name
 * one place, so the opposition KEY drops the governed preposition and the two are contraries
 * (atomize.ts `canonicalizeAntonymRest`). Nothing else is dropped, and never from the atom body.
 *
 * A closed, curated table in the same category as the seed pairs. A verb is listed only when its
 * contrary takes a DIFFERENT preposition for the same place — two members that take the same one
 * ("grant power to the grid" / "deny power to the grid") already share a key without any drop.
 * An unlisted class keeps every preposition in its key: "allow calls to the number" and "deny
 * calls from the number" are two different calls, and a rule that dropped `to` and `from` for
 * every antonym head made them contraries.
 *
 * The drop is per CLASS ({@link AntonymEntry.governs}, the union over its members), never per
 * verb: "include the file in the box" and "exclude the file in the box" must share a key, and a
 * per-verb drop removed `in` from the first key only. A class a doc-committed pair joins inherits
 * the union; a class of doc verbs alone gets nothing, so its remainders must match word for word,
 * which can only miss a contrary, never invent one.
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
   * The prepositions the opposition key drops for EVERY member of this verb's class: the union
   * of {@link GOVERNED_PREPOSITIONS} over the class, sorted. One set per class, so two members
   * over one remainder always compute one key.
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
    const governs = [...new Set(members.flatMap((m) => [...(GOVERNED_PREPOSITIONS.get(m) ?? [])]))]
    index.set(verb, { canonical, negated, opposes, governs: governs.sort() })
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
