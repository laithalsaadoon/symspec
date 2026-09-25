/**
 * MINTED SYMBOL IDS — the one rule that names an implicit or bootstrapped symbol.
 *
 * An id is `<kind prefix>_<slug of the phrase key>`. It is a pure function of the phrase key
 * SET of one kind, so a legacy document read through its implicit vocabulary and the same
 * document after `propose-vocabulary` declares it mint the same ids. That equality is what makes
 * the opt-in PR bind every requirement exactly as before (plan F9): a minting rule that depended
 * on requirement order, or on the order phrases were first seen, would rename symbols between the
 * two sides and read as a change to every requirement.
 *
 * Every id this mints is one the engine's scope normalizer and the numeric tier's label key both
 * leave unchanged (`resolve.test.ts`, property 3): lowercase ASCII letters and digits joined by
 * single underscores, starting with a letter. So an id that ever reaches an engine key keys as
 * itself.
 */

import { sha256Hex } from '../requirements/content-hash.ts'
import { SYMBOL_ID_PATTERN, type SymbolId, type SymbolKind } from '../requirements/document.ts'

/** The id prefix of each symbol kind. */
export const KIND_PREFIX = {
  system: 'sys',
  feature: 'feat',
  event: 'evt',
  state: 'st',
  action: 'act',
  quantity: 'qty',
} as const satisfies Record<SymbolKind, string>

/** The longest id the document schema accepts. */
const ID_MAX = 64

/** How many hex digits of the phrase key's digest name a symbol whose key has no usable slug. */
const DIGEST_DIGITS = 10

/**
 * The slug of a phrase key: lowercased, each run of anything but `[a-z0-9]` made one `_`, and
 * the ends trimmed. A key in a non-Latin script slugs to the empty string, or to its Latin
 * fragments only; the digest fallback and the collision suffix below keep such keys distinct.
 */
const slugOf = (key: string): string =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** The id a key would take with no collision: the slug form, or the digest form. */
const baseIdOf = (prefix: string, key: string): string => {
  const slug = slugOf(key)
  const slugged = `${prefix}_${slug}`
  return slug !== '' && slugged.length <= ID_MAX
    ? slugged
    : `${prefix}_h${sha256Hex(key).slice(0, DIGEST_DIGITS)}`
}

/**
 * Mint an id for every phrase key of one kind.
 *
 * Keys are taken in sorted order, and a key whose base id is already taken gets the first free
 * `_2`, `_3`, … suffix. `taken` names ids that exist already (a declared vocabulary's), which
 * are never reissued. The result depends on the key SET and `taken` only.
 */
export const mintSymbolIds = (
  kind: SymbolKind,
  keys: Iterable<string>,
  taken: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, SymbolId> => {
  const prefix = KIND_PREFIX[kind]
  const used = new Set(taken)
  const minted = new Map<string, SymbolId>()
  for (const key of [...new Set(keys)].sort()) {
    const base = baseIdOf(prefix, key)
    let id = base
    for (let n = 2; used.has(id) || !fits(id); n += 1) {
      const suffixed = `${base}_${n}`
      // A suffix that would overflow the length bound falls back to the digest form, suffixed.
      id = fits(suffixed) ? suffixed : `${prefix}_h${sha256Hex(key).slice(0, DIGEST_DIGITS)}_${n}`
    }
    used.add(id)
    minted.set(key, id)
  }
  return minted
}

/** Whether a string is a well-formed SymbolId. */
const fits = (id: string): boolean => id.length <= ID_MAX && SYMBOL_ID_PATTERN.test(id)
