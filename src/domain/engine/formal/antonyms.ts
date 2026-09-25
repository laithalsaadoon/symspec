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
 *     normalization, or identical once the first place preposition, when the verb's own row governs
 *     it, is marked out ({@link GOVERNED_PREPOSITIONS}):
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
 * Which place a governed preposition introduces. Every row names one `place` — where the act is
 * done, or the place it removes its object from — except `quarantine`/`release`, which name two:
 * the `place` the object is held ("quarantine the file in the vault", "release the file from the
 * vault") and the `outside` it is cut off from and returned to ("quarantine the host from the
 * network", "release the host to the network"). A mark meets only a mark for the same place, so
 * "quarantine the file in the vault" and "release the file to the vault", which both put the file
 * there, are not contraries.
 */
export type GovernedPlace = 'place' | 'outside'

/**
 * The locative prepositions every row's verbs name a place with: "on the display", "at the site",
 * "inside the cabinet". Not `within`: it opens a deadline as readily as a place ("start the pump
 * within 5 seconds" / "stop the pump in 5 seconds" is consistent), and telling the two apart is a
 * phrase-classification guess no row states, so no verb governs it (spec 007 demote-not-prove C1).
 */
const LOCATIVE = ['at', 'in', 'inside', 'on'] as const

/** The goal prepositions a verb that puts its object somewhere names the place with. */
const GOAL = ['into', 'onto', 'to'] as const

/**
 * The verbs of a row whose contrary removes its object FROM the place, and deny/forbid, which take
 * their place as grant does ("deny access to the server"): the locatives and the goals.
 */
const PUTTERS = [
  'add',
  'allow',
  'authorize',
  'commit',
  'connect',
  'deny',
  'engage',
  'expose',
  'extend',
  'forbid',
  'grant',
  'include',
  'insert',
  'permit',
  'publish',
  'show',
] as const

/**
 * The verbs that remove their object FROM the place: the locatives and `from`. Two of them,
 * {@link RIGHT_REMOVERS}, also take `to`.
 */
const REMOVERS = [
  'conceal',
  'disconnect',
  'disengage',
  'exclude',
  'hide',
  'remove',
  'retract',
  'revoke',
  'roll_back',
  'rollback',
  'seal',
  'suspend',
  'withdraw',
] as const

/**
 * The removers that take away a RIGHT, which names its place with `to` as grant does: "revoke
 * access to the server" and "suspend access to the account" remove access where "grant access on
 * the server" and "resume access on the account" give it. The other removers' `to` is a direction
 * ("remove the item to the trash", "withdraw the funds to the account", "roll back the change to
 * the checkpoint") or not English ("hide the report to the user"), so they do not take it.
 */
const RIGHT_REMOVERS = ['revoke', 'suspend'] as const

/** The verbs of a row whose contrary takes the place with the same prepositions: the locatives. */
const SAME_PLACE = [
  'accept',
  'activate',
  'approve',
  'close',
  'de_energize',
  'deactivate',
  'decline',
  'disable',
  'drain',
  'enable',
  'energize',
  'flood',
  'lock',
  'lower',
  'open',
  'raise',
  'reject',
  'resume',
  'start',
  'stop',
  'unlock',
  'unseal',
] as const

/** `preps` as governed prepositions for one place ({@link GovernedPlace}; `place` by default). */
const places = (
  preps: readonly string[],
  place: GovernedPlace = 'place',
): ReadonlyArray<readonly [string, GovernedPlace]> => preps.map((p) => [p, place] as const)

/**
 * The prepositions a seed verb GOVERNS: the ones that introduce the place its act is done at, to
 * or from, where the verb, not the preposition, carries the direction. "show the alarm on the
 * display" and "hide the alarm from the display" name one place, so the governed preposition is
 * marked out of a further opposition KEY and the two are contraries (atomize.ts
 * `governedReadings`). Nothing is ever dropped from the atom body.
 *
 * A closed, curated table in the same category as the seed pairs. The rule: a verb lists every
 * preposition ordinary requirements English uses to introduce that place, when a contrary it has
 * a ROW with may name the same place with a different one. Applied row by row:
 *
 *   - Every verb: the {@link LOCATIVE}s ("enable the feature on the device" / "disable the feature
 *     in the device").
 *   - A verb that puts its object in, on or to the place against a contrary that removes it FROM
 *     there ({@link PUTTERS}: grant/revoke, show/hide, publish/retract, add/remove, commit/roll
 *     back, …) adds the {@link GOAL}s, and deny/forbid, which take the place as grant does ("deny
 *     access to the server" / "grant access on the server"), add them too.
 *   - A verb that removes its object from the place ({@link REMOVERS}) adds `from`; that includes
 *     suspend, whose contrary resumes the object IN the place ("suspend the user from the service"
 *     / "resume the user in the service").
 *   - The two removers of a right ({@link RIGHT_REMOVERS}: revoke, suspend) add `to`, which names
 *     the place of the right as it does after grant: "revoke access to the server" / "grant
 *     access on the server", "suspend access to the account" / "resume access on the account".
 *   - connect/engage add `with` ("connect the cable with the socket" / "disconnect it from the
 *     socket").
 *   - quarantine/release name two places ({@link GovernedPlace}): the place the object is held
 *     (quarantine: the locatives and goals; release: the locatives and `from`) and the outside
 *     (quarantine: `from`; release: the goals and `on`, "release the host on the network").
 *
 * Deliberately NOT listed, because the preposition carries direction or names something other
 * than the place the contrary acts on:
 *   - `from` after any verb that does not remove its object from the place ("connect calls FROM
 *     the number" is incoming calls, and "disconnect calls TO the number" outgoing ones; "allow
 *     calls to" / "deny calls from"; "accept the bid from the vendor" names the sender).
 *   - a goal after a remover other than revoke/suspend ("withdraw the card into the tray",
 *     "remove the item to the trash", "roll back the change to the checkpoint"), or after a
 *     same-place verb, where it names a direction, a target value, or the object's own complement
 *     ("open the door to the garden", "raise the level to 5", "enable transfers to the account").
 *   - `of` after drain, which is overwhelmingly possessive ("drain the tank of the pump").
 *   - `within` after any verb: it names a deadline as readily as a place ("start the pump within
 *     5 seconds" and "stop the pump in 5 seconds" are consistent; so are "in a moment" and "within
 *     a moment"), and which one it names is a guess about the phrase after it.
 * An unlisted preposition keeps its place in every key, so it can only miss a contrary, never
 * invent one; the opposition-candidate tier demotes `verified` over every such pair whose
 * remainders are equal once their prepositions are removed (semantic.ts `prepositionVariant`).
 *
 * The set is per VERB ({@link AntonymEntry.governs}), never the union over its class. `connect`
 * governs `to` and `disconnect` governs `from`; a class-wide union let `connect` drop `from` as
 * well, so "connect calls FROM the number" (incoming calls allowed) and "disconnect calls TO the
 * number" (outgoing calls cut) shared one key and were an error-severity FND_CONTRADICTION on a
 * consistent document. Two remainders that are identical word for word need no mark at all:
 * every response also keeps the key of its literal remainder.
 *
 * A verb only a DOCUMENT pairs governs nothing. A committed row says two verbs are contraries; it
 * says nothing about which of them puts and which removes, so any preposition it would govern is a
 * guess, and a guess may not create a proof (spec 007 demote-not-prove C1). Such a pair is a
 * contrary over identical remainders, and the opposition-candidate tier demotes on the same pair
 * written with different prepositions ("admit the student to the school" / "expel the student from
 * the school"), naming the rewording that makes it provable.
 */
export const GOVERNED_PREPOSITIONS: ReadonlyMap<
  string,
  ReadonlyMap<string, GovernedPlace>
> = (() => {
  const table = new Map<string, Array<readonly [string, GovernedPlace]>>()
  const add = (
    verbs: readonly string[],
    entries: ReadonlyArray<readonly [string, GovernedPlace]>,
  ) => {
    for (const verb of verbs) table.set(verb, [...(table.get(verb) ?? []), ...entries])
  }
  add([...PUTTERS, ...REMOVERS, ...SAME_PLACE], places(LOCATIVE))
  add(PUTTERS, places(GOAL))
  add(REMOVERS, places(['from']))
  add(RIGHT_REMOVERS, places(['to']))
  add(['connect', 'engage'], places(['with']))
  add(['quarantine'], [...places([...LOCATIVE, ...GOAL]), ...places(['from'], 'outside')])
  add(
    ['release'],
    [...places(['at', 'in', 'inside', 'from']), ...places([...GOAL, 'on'], 'outside')],
  )
  return new Map([...table].map(([verb, entries]) => [verb, new Map(entries)]))
})()

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
   * introduce a place its act is done at, to or from, which its governed opposition keys mark
   * out. Per verb, never the class's union — a preposition only its contrary governs carries
   * direction after it.
   */
  governs: readonly string[]
  /**
   * The subset of {@link governs} that introduces the OUTSIDE rather than the place the object is
   * held ({@link GovernedPlace}), sorted; empty for every verb but quarantine/release. Marked
   * apart, so it meets only another verb's outside preposition.
   */
  outside: readonly string[]
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
    const places = [...(GOVERNED_PREPOSITIONS.get(verb) ?? [])]
    const governs = places.map(([p]) => p).sort()
    const outside = places
      .filter(([, place]) => place === 'outside')
      .map(([p]) => p)
      .sort()
    index.set(verb, { canonical, negated, opposes, governs, outside })
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
