/**
 * THE VALIDATED ENTRY POINTS — the index every caller resolves against, and the projection the
 * engine is handed.
 *
 * Both run the validator first (`invariants.ts`) and read only what it admitted. The pieces they
 * are built from (`indexVocabulary`, `projectVocabulary`) take any vocabulary, validated or not,
 * because the validator measures each candidate it considers through those same pieces; nothing
 * outside `domain/vocabulary/` calls them directly.
 */

import { type RequirementsDocument, vocabularyOf } from '../requirements/document.ts'
import { implicitVocabulary } from './implicit.ts'
import { type VocabularyViolation, validateVocabulary } from './invariants.ts'
import { tablesOf } from './keys.ts'
import { type Projection, projectVocabulary } from './projection.ts'
import { indexVocabulary, type VocabularyIndex } from './resolve.ts'

/**
 * Build the index a document resolves against, and the violations its vocabulary carries.
 *
 * A document with declared symbols is validated, and every invalid entry is dropped and reported
 * in `invalid`. A document with none gets its implicit vocabulary. Throw-free, so the check path
 * can disclose rather than fail.
 */
export const buildVocabularyIndex = (
  doc: RequirementsDocument,
): { readonly index: VocabularyIndex; readonly invalid: readonly VocabularyViolation[] } => {
  const tables = tablesOf(doc)
  const declared = vocabularyOf(doc)
  const mode = declared.symbols.length > 0 ? 'explicit' : 'implicit'
  const { admitted, violations } =
    mode === 'explicit'
      ? validateVocabulary(doc, declared, 'explicit', tables)
      : validateVocabulary(doc, implicitVocabulary(doc, tables), 'implicit', tables)
  return { index: indexVocabulary(admitted, tables, mode), invalid: violations }
}

/** The projection of a document with a declared vocabulary; `undefined` for a legacy document. */
export const buildProjection = (doc: RequirementsDocument): Projection | undefined => {
  if (vocabularyOf(doc).symbols.length === 0) return undefined
  const { index, invalid } = buildVocabularyIndex(doc)
  return projectVocabulary(doc, index, invalid)
}
