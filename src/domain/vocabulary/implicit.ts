/**
 * THE IMPLICIT VOCABULARY — what a document without one already says.
 *
 * One symbol per phrase-key class of the phrases the requirements use, in each collision
 * domain. Because a phrase key IS the engine's atom key, this vocabulary names exactly the
 * partition the engine already computes: it resolves every requirement, binds two slots to one
 * symbol exactly when the engine gives them one atom, and projects to the identity. That is why a
 * legacy document can be read through the same resolver as a declared one, and why declaring it
 * (`propose-vocabulary`'s bootstrap, {@link renderVocabularyOps}) changes no binding (plan F9).
 *
 * Every choice is a function of the requirement SET, never of its order:
 *
 * - the canonical is the most frequent spelling, ties broken by code-unit order;
 * - a guard is a `state` when any use of it is a precondition, and an `event` otherwise;
 * - a quantity's dimension and unit are its most frequent reading, the same way;
 * - ids are minted from the key set ({@link mintSymbolIds}).
 */

import {
  NUMBER_TYPES,
  type NumberType,
  QUANTITY_DIMENSIONS,
  type QuantityDimension,
  type RequirementsDocument,
  SYMBOL_KINDS,
  type SymbolId,
  type SymbolKind,
  type VocabSymbol,
  type Vocabulary,
} from '../requirements/document.ts'
import { mintSymbolIds } from './ids.ts'
import {
  type BoundReading,
  type CollisionDomain,
  type PhraseTables,
  phraseKey,
  slotUses,
  tablesOf,
} from './keys.ts'

/** One phrase-key class, as the requirements use it. */
interface Class {
  readonly domain: CollisionDomain
  readonly key: string
  readonly spellings: Map<string, number>
  /** The kinds each use accepts; the class takes the first kind every use accepts. */
  readonly uses: (readonly SymbolKind[])[]
  readonly bounds: BoundReading[]
}

/** The most frequent of `counts`, ties broken by code-unit order. */
const mostFrequent = (counts: ReadonlyMap<string, number>): string => {
  let best: string | undefined
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== undefined && value < best)) {
      best = value
      bestCount = count
    }
  }
  return best ?? ''
}

const tally = <T>(values: readonly T[], keyOf: (v: T) => string): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(keyOf(v), (counts.get(keyOf(v)) ?? 0) + 1)
  return counts
}

/** The kind a class takes: the first kind, in schema order, that every use of it accepts. */
const kindOf = (c: Class): SymbolKind =>
  SYMBOL_KINDS.find((k) => c.uses.every((kinds) => kinds.includes(k))) ?? c.uses[0]?.[0] ?? 'action'

/** The numeric tier's dimension of a bound, as a quantity symbol records it. */
const dimensionOf = (b: BoundReading): QuantityDimension => {
  if (b.dimension === '') return 'none'
  return (QUANTITY_DIMENSIONS as readonly string[]).includes(b.dimension)
    ? (b.dimension as QuantityDimension)
    : 'unrecognized'
}

/** A quantity's number type: `int` when every bound on it is an integer. */
const numberTypeOf = (bounds: readonly BoundReading[]): NumberType =>
  bounds.every((b) => b.value.endsWith('/1')) ? NUMBER_TYPES[0] : NUMBER_TYPES[1]

/** The symbol one class declares. */
const symbolOf = (c: Class, id: SymbolId, kind: SymbolKind): VocabSymbol => {
  const canonical = mostFrequent(c.spellings)
  const aliases = [...c.spellings.keys()].filter((s) => s !== canonical).sort()
  const base = { id, canonical, aliases }
  switch (kind) {
    case 'quantity': {
      const reading = mostFrequent(tally(c.bounds, (b) => JSON.stringify([dimensionOf(b), b.unit])))
      const [dimension, unit] = JSON.parse(reading) as [QuantityDimension, string]
      return {
        ...base,
        kind,
        dimension,
        unit: dimension === 'none' ? '' : unit,
        numberType: numberTypeOf(c.bounds),
      }
    }
    case 'system':
    case 'feature':
    case 'event':
    case 'state':
    case 'action':
      return { ...base, kind }
  }
}

/**
 * The implicit vocabulary of a document: one symbol per phrase-key class of every phrase its
 * requirements use, sorted by id. Merges and distinct records are empty; a document states none
 * until an author commits one.
 */
export const implicitVocabulary = (
  doc: RequirementsDocument,
  tables: PhraseTables = tablesOf(doc),
): Vocabulary => {
  const classes = new Map<string, Class>()
  for (const r of Object.values(doc.requirements)) {
    for (const use of slotUses(r, tables)) {
      const key = phraseKey(use.domain, use.text, tables)
      const at = `${use.domain}\u0000${key}`
      const c = classes.get(at) ?? {
        domain: use.domain,
        key,
        spellings: new Map<string, number>(),
        uses: [],
        bounds: [],
      }
      c.spellings.set(use.text, (c.spellings.get(use.text) ?? 0) + 1)
      c.uses.push(use.kinds)
      if (use.bound !== undefined) c.bounds.push(use.bound)
      classes.set(at, c)
    }
  }
  const byKind = new Map<SymbolKind, Class[]>()
  for (const c of classes.values()) {
    const kind = kindOf(c)
    byKind.set(kind, [...(byKind.get(kind) ?? []), c])
  }
  const symbols: VocabSymbol[] = []
  for (const [kind, members] of byKind) {
    const ids = mintSymbolIds(
      kind,
      members.map((c) => c.key),
    )
    for (const c of members) symbols.push(symbolOf(c, ids.get(c.key) ?? '', kind))
  }
  symbols.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { symbols, merges: [], distinct: [] }
}

/**
 * The `vocab` op that declares one symbol. The payload of the verb slice S7 appends to the op
 * vocabulary; stated here so the bootstrap stream has a type before that verb exists.
 */
export type VocabDeclaration = { readonly op: 'vocab' } & WithoutAliases<VocabSymbol> & {
    readonly aliases?: readonly string[]
  }

/** `Omit<T, 'aliases'>` over each member of a union, so the kind discriminant survives. */
type WithoutAliases<T> = T extends unknown ? Omit<T, 'aliases'> : never

/**
 * The op stream that declares a vocabulary's symbols: one `vocab` op per symbol, in id order,
 * with an empty `aliases` omitted. Declaring it into the document it came from yields an index
 * equal to that document's implicit one (`resolve.test.ts`, property 2).
 */
export const renderVocabularyOps = (vocabulary: Vocabulary): readonly VocabDeclaration[] =>
  [...vocabulary.symbols]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s) => {
      const { aliases, ...rest } = s
      return (
        aliases.length === 0 ? { op: 'vocab', ...rest } : { op: 'vocab', ...rest, aliases }
      ) as VocabDeclaration
    })
