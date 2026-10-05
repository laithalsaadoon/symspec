/**
 * The ONE set of write-time fences every fold of a document runs under.
 *
 * `foldOps` without options is a fold with no fences: phrases are trimmed rather than
 * normalized, and no antonym, term, or glossary write is validated. That default is right for
 * a caller with no engine in its load graph and wrong for anything that writes or measures a
 * document an agent can produce. So this module is the single source for three callers:
 *
 * - `apply` and every single-op mutation (`./mutation.ts`), the write path;
 * - `import` (`./import.ts`), whose side-table records (glossary, antonym, waiver) are folded
 *   through the same `applyOp`, so a v4 stream cannot commit a record `apply` would refuse;
 * - the gaming harness (`src/testing/gaming.ts`), which receives it through its wiring, because
 *   `testing/` may not import `app/`. A harness that folds a move with fewer fences than
 *   `apply` measures escapes an agent cannot actually take.
 *
 * A new write-time validator goes here, and all three callers inherit it.
 */

import { ANTONYM_INDEX, buildAntonymIndexWithDoc } from '../../domain/engine/formal/antonyms.ts'
import {
  glossaryContraries,
  glossaryIndex,
  normalize,
  termIndex,
} from '../../domain/engine/formal/atomize.ts'
import { ESTABLISH_VERBS } from '../../domain/engine/formal/guard-implication.ts'
import { deInflectHead } from '../../domain/engine/formal/lemma.ts'
import type { MutateOptions } from '../../domain/requirements/mutate.ts'
import { findingClassOf, WAIVABILITY } from '../../domain/waivability.ts'

/**
 * The mutation-fold options: the injected normalizer and every write-time validator.
 *
 * `domain/requirements/mutate.ts` cannot import the transplanted formal tier — the dependency
 * runs the other way, and a cycle would put the atomizer in the load graph of every document
 * read. So the functions that need it are injected HERE, which is the lowest layer that
 * legitimately knows about both.
 */
export const MUTATE_OPTIONS: MutateOptions = {
  /**
   * The waivability policy (spec 007 AC-5-6), read off the published class table: a `never`
   * class (verdict, disclosure, triage, hygiene, anchor) is refused in every scope, a code no
   * catalog publishes has no class and is refused, and a `scoped` class (wording, structural)
   * is accepted only over named requirements, stored with the hash of their current text.
   * Every write channel folds under these options, so `apply`, `symspec waive` and `import`
   * refuse the same waivers, and `compat.ts` holds a stored waiver to the same table at check.
   */
  waiverPolicy: (code) => {
    const cls = findingClassOf(code)
    return cls === undefined ? undefined : { class: cls, waivable: WAIVABILITY[cls] }
  },
  // The atomizer's own normalizer, so a committed antonym head is EXACTLY the key the
  // atomizer looks up. Storing "Open" where the atomizer looks up "open" would make
  // the committed pair silently inert — a decision recorded and not applied.
  normalizeHead: normalize,
  /**
   * The false-contradiction guard, and the reason it belongs at WRITE time.
   *
   * An antonym is the one committed record whose wrong value MANUFACTURES a conflict
   * rather than merely masking one. `buildAntonymIndexWithDoc` THROWS on an odd
   * polarity cycle (asserting a↔b when a and b already resolve to the same polarity
   * through the seed classes), and catching it here turns that into a clean
   * `ERR_USAGE` — which is what keeps the CHECK path throw-free. A hand-edited bad
   * document falls back to seed-only rather than crashing a verdict.
   */
  validateAntonyms: (pairs) => {
    try {
      buildAntonymIndexWithDoc(pairs.map((p) => [normalize(p.a), normalize(p.b)] as const))
      return undefined
    } catch (cause) {
      return cause instanceof Error ? cause.message : String(cause)
    }
  },
  /**
   * The OTHER false-contradiction guard: terms are for nouns, enforced rather than documented.
   *
   * A term is substituted inside every slot body, so one containing a verb reaches the response
   * head — and that desyncs two pipelines which must agree. `guard-implication` decides whether
   * a response ESTABLISHES a state by parsing the raw text against `ESTABLISH_VERBS`; the
   * bridge's polarity comes from the full `atomize`, which sees the substitution. Rewrite a head
   * into an antonym class and the bridge is still recognised while its polarity flips, so it
   * asserts the negation of what the document says. The inert-drop downstream compares atom
   * NAMES, not polarity, so it does not catch it: the inverted implication joins the whole-spec
   * conjunction and can make a group UNSAT that the document never entailed. Error severity,
   * and the tool's own doing.
   *
   * Both lexicons are consulted per TOKEN, because the substitution is per token — a term
   * `close the vault` would reach the head just as `close` does. Refusing at write time is what
   * keeps the check path free of "this table was incoherent" branches, exactly as above.
   */
  validateTerms: (canonical, alias) => {
    // De-inflected, because `atomize` de-inflects the head before probing: a raw-token check
    // accepts `revokes` while the atomizer reads `revoke`, and that gap was a verified
    // fabrication. Defense in depth only — the SOUNDNESS guarantee is the check-time drop in
    // `guard-implication.ts`, because no write-time fence can see a doc antonym committed
    // afterwards, nor a two-token head formed by joining a canonical to the tokens beside it.
    const offending = [...canonical.split(/[\s_]+/), ...alias.split(/[\s_]+/)]
      .filter((token) => token.length > 0)
      .find((token) => {
        const head = deInflectHead(token)
        return (
          ANTONYM_INDEX.has(token) ||
          ANTONYM_INDEX.has(head) ||
          ESTABLISH_VERBS.has(token) ||
          ESTABLISH_VERBS.has(head)
        )
      })
    if (offending === undefined) return undefined
    return (
      `"${offending}" is a verb the formal tier reads — the antonym table or the ` +
      'state-bridge lexicon — and substituting one inside a body moves the polarity the solver ' +
      'computes without moving the parse that recognises the bridge'
    )
  },
  /**
   * The glossary twin of the two guards above: an entry must not name two contraries.
   *
   * "close the door" as an alias of "open the door" says the two are one action while the seed
   * pair open/close says they cannot both happen, and committed it turned FND_CONTRADICTION into
   * `verified: true`. The propose tier already withholds that merge (AC-3-6); this refuses the
   * committed op. Read through the document's OWN antonyms and terms, the tables the atomizer
   * uses. Defense in depth only — an antonym or term committed afterwards forms the same entry
   * with no glossary write to refuse, so the soundness guarantee is `atomize` keeping each
   * contrary on its own atom linked to the entry's action, and `check` demoting
   * (`contrary-glossary-alias`) over what that leaves undecided.
   */
  validateGlossary: (document, canonical, alias) => {
    let antonyms: ReturnType<typeof buildAntonymIndexWithDoc> = ANTONYM_INDEX
    try {
      antonyms = buildAntonymIndexWithDoc(
        document.antonyms.map((p) => [normalize(p.a), normalize(p.b)] as const),
      )
    } catch {
      // An inconsistent committed table is refused at ITS write; check falls back to the seeds.
    }
    const entry = glossaryContraries(
      glossaryIndex(document.glossary),
      antonyms,
      termIndex(document.terms ?? []),
    ).find((e) => e.canonical === canonical)
    const pair = entry?.contraries.find(([p, q]) => p === alias || q === alias)
    if (pair === undefined) return undefined
    const other = (pair[0] === alias ? pair[1] : pair[0]).replace(/_/g, ' ')
    return (
      `it is a contrary of "${other}" under the antonym table, so one entry naming both would ` +
      'say neither action ever happens'
    )
  },
}
