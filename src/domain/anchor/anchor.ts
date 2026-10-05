/**
 * THE ANCHORS — the intent and policy schemas, as a leaf module.
 *
 * `intent` says what a specification is FOR: the obligations, assumptions and goals its
 * requirements exist to serve. `policy` ranks those items into criticality levels. Both are
 * owned by a person, not by the agent writing requirements, so `check` treats them as fixed
 * points to compare against rather than as data an op may edit: no op in `ops.ts` writes
 * either one, and `save` never writes a split intent or policy file.
 *
 * ## Why this file imports `Schema` and nothing else
 *
 * A later certificate kernel reads these schemas to know what a requirement is for, and that
 * kernel's boundary admits only the typed IR and the solver port. A module that imports
 * nothing from this repository is the only shape it can import without taking the
 * requirements model with it. `src/package-boundary.test.ts` pins the single import. So the
 * patterns below are this file's own: {@link INTENT_ID_PATTERN} is asserted equal to the
 * requirement `KEY_PATTERN` by a test, not imported from it.
 *
 * ## Why no field has a decoding default
 *
 * `withDecodingDefaultKey` takes its default as an `Effect`, which this file does not import.
 * The rule that falls out is worth having for its own sake: the decoded anchor is exactly the
 * authored anchor, with nothing materialized, so a hash taken over the decoded value and a
 * hash taken over the file's content cannot disagree about a default. An absent `kind` reads
 * as {@link DEFAULT_INTENT_KIND} through {@link intentKindOf}, and an absent
 * `admissibleAssumptionKinds` reads as the empty list.
 *
 * ## Strict, and unique where a reference points
 *
 * Every struct is decoded with excess properties refused (the document decoder's setting), so
 * a typo'd field inside an anchor is a hard failure. An intent id is what a requirement's
 * `intentRef` names and a level id is what `assign` names, so a duplicate of either would
 * make a reference ambiguous; the decode refuses both, naming the duplicate. Whether an
 * `assign` key names an item that exists in `intent` is a question across two artifacts,
 * which may live in two files, so it is not asked here.
 */

import { Schema } from 'effect'

/** Multi-line description builder. */
const lines = (...xs: readonly string[]): string => xs.join('\n')

/**
 * What THIS release does with document format v4's vocabulary, intent and policy, and with a
 * requirement's `intentRef` and `derived`: it decodes them and writes them back, and no check
 * tier reads them. ONE constant, interpolated into every surface that describes them (the
 * schema descriptions the manifest and AGENTS.md derive from, `init --split`'s help and result,
 * the README), so no copy can drift into an enforcement claim (ruling RH-R3). Defined in this
 * leaf module because the intent and policy descriptions below carry it and this file imports
 * nothing from the repository; `document.ts` re-exports it.
 */
export const V4_EXPERIMENTAL_STATEMENT =
  'Experimental in this release: decoded and preserved on save, read by no check tier yet; its shape may change in a minor release.'

/** A non-empty string. */
const NonEmpty = Schema.String.pipe(Schema.check(Schema.isMinLength(1)))

/**
 * The intent-id format: the requirement key format (1-64 chars of `[A-Za-z0-9._-]`, at least
 * one non-digit, a leading alphanumeric), so one grammar names a requirement and the intent
 * item it serves. Flagless, because it lowers into the published JSON Schema as a `pattern`.
 */
export const INTENT_ID_PATTERN = /^(?=.*[A-Za-z._-])[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** An intent item's id. */
export const IntentId = Schema.String.pipe(Schema.check(Schema.isPattern(INTENT_ID_PATTERN)))
export type IntentId = typeof IntentId.Type

/** A policy level's id, on the same format as an intent id. */
const LevelId = Schema.String.pipe(Schema.check(Schema.isPattern(INTENT_ID_PATTERN)))

/** A bare sha256 digest: 64 lowercase hex digits, with no `sha256:` prefix. */
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

/** A bare sha256 digest. */
export const Sha256Hex = Schema.String.pipe(Schema.check(Schema.isPattern(SHA256_HEX_PATTERN)))

/**
 * What an intent item states.
 *
 * - `obligation`: something the system must do or ensure. Requirements bind to these.
 * - `assumption`: a fact about the environment the specification relies on.
 * - `goal`: a desired outcome, weaker than an obligation.
 */
export const INTENT_KINDS = ['obligation', 'assumption', 'goal'] as const
export type IntentKind = (typeof INTENT_KINDS)[number]

/** What an intent item with no `kind` states. */
export const DEFAULT_INTENT_KIND: IntentKind = 'obligation'

/** The `intentVersion` this build reads and writes. */
export const INTENT_VERSION = 1 as const

/** The `policyVersion` this build reads and writes. */
export const POLICY_VERSION = 1 as const

/** One intent item. */
export const IntentItem = Schema.Struct({
  id: IntentId.annotate({
    description: lines(
      'The stable id a requirement`s `intentRef` names. Same format as a requirement key.',
      'Unique within the intent. Examples: "I1"; "SAFETY-DOORS".',
    ),
  }),
  text: NonEmpty.annotate({
    description: lines(
      'The item, in the owner`s words. A later release will hold the specification to this text,',
      'so an edit to it changes what the specification is for.',
      "Example: 'The doors stay closed while the train is moving.'",
      V4_EXPERIMENTAL_STATEMENT,
    ),
  }),
  kind: Schema.optionalKey(
    Schema.Literals(INTENT_KINDS).annotate({
      description: lines(
        'What the item states: `obligation` (the system must do or ensure it), `assumption` (a fact',
        'about the environment the specification relies on) or `goal` (a desired outcome, weaker',
        'than an obligation). An absent kind reads as `obligation`; the decoder does not write it in.',
      ),
    }),
  ),
  source: Schema.optionalKey(
    NonEmpty.annotate({
      description:
        "Where the item came from, for a reader tracing it back. Free text. Example: 'ops memo 4, section 2'.",
    }),
  ),
}).annotate({ description: 'One item of intent: an obligation, assumption or goal, with its id.' })
export type IntentItem = typeof IntentItem.Type

/** The kind an intent item states, reading an absent kind as {@link DEFAULT_INTENT_KIND}. */
export const intentKindOf = (item: IntentItem): IntentKind => item.kind ?? DEFAULT_INTENT_KIND

/** The ids in `ids` that occur more than once, sorted. */
const duplicates = (ids: readonly string[]): readonly string[] => {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const id of ids) (seen.has(id) ? repeated : seen).add(id)
  return [...repeated].sort()
}

/** The intent artifact. */
export const Intent = Schema.Struct({
  intentVersion: Schema.Literal(INTENT_VERSION).annotate({
    description: 'The intent-format version. Exactly 1 for this format.',
  }),
  items: Schema.Array(IntentItem).annotate({
    description: lines(
      'The intent items, in the owner`s order. Item ids are unique. A later release will require',
      'each requirement to name one of them through `intentRef` or be marked `derived`; this one',
      'decodes a requirement with neither.',
      V4_EXPERIMENTAL_STATEMENT,
    ),
  }),
  source: Schema.optionalKey(
    Schema.Struct({
      importedFrom: NonEmpty.annotate({
        description: "The path or URL the intent was imported from. Example: 'parent/intent.json'.",
      }),
      sha256: Sha256Hex.annotate({
        description: 'The sha256 of the imported file`s bytes, as 64 lowercase hex digits.',
      }),
    }).annotate({
      description: 'Where this intent was imported from, when it was imported rather than written.',
    }),
  ),
})
  .annotate({
    description: lines(
      'What the specification is for: the obligations, assumptions and goals its requirements serve.',
      'Inline in the document (format v4) or in its own file. Written by its owner; no op writes it.',
      V4_EXPERIMENTAL_STATEMENT,
    ),
  })
  .pipe(
    Schema.check(
      Schema.makeFilter((intent: { readonly items: readonly { readonly id: string }[] }) => {
        const repeated = duplicates(intent.items.map((item) => item.id))
        return repeated.length === 0
          ? undefined
          : {
              path: ['items'],
              issue: `intent item ids must be unique; repeated: ${repeated.join(', ')}`,
            }
      }),
    ),
  )
export type Intent = typeof Intent.Type

/** One criticality level. */
export const PolicyLevel = Schema.Struct({
  id: LevelId.annotate({
    description: 'The level id that `assign` names. Unique within the policy. Example: "safety".',
  }),
  description: Schema.optionalKey(
    NonEmpty.annotate({
      description: "What an item at this level puts at stake. Example: 'Loss of life or injury.'",
    }),
  ),
}).annotate({ description: 'One criticality level.' })
export type PolicyLevel = typeof PolicyLevel.Type

/**
 * `assign`, keyed by intent id.
 *
 * `Schema.String` plus `isPropertyNames` rather than `Schema.Record(IntentId, …)`, because a
 * record's key schema FILTERS on this Effect version: a malformed key is dropped from the
 * decoded value without an error (the trap `document.ts`'s `RequirementsMap` documents).
 */
const Assign = Schema.Record(Schema.String, LevelId)
  .pipe(Schema.check(Schema.isPropertyNames(IntentId)))
  .annotate({
    description: lines(
      'The level of each intent item: intent id -> level id. Every level named must be declared in',
      '`levels`. Example: {"I1": "safety", "I2": "comfort"}.',
    ),
  })

/** The policy artifact. */
export const Policy = Schema.Struct({
  policyVersion: Schema.Literal(POLICY_VERSION).annotate({
    description: 'The policy-format version. Exactly 1 for this format.',
  }),
  levels: Schema.Array(PolicyLevel).annotate({
    description: lines(
      'The criticality levels, highest first. Array order is the yield order between levels, and no',
      'tier reads it yet. Level ids are unique.',
    ),
  }),
  assign: Assign,
  admissibleAssumptionKinds: Schema.optionalKey(
    Schema.Array(NonEmpty).annotate({
      description: lines(
        'Reserved: the kinds of environment fact an assumption may state. Read by no tier yet. An',
        'absent list reads as empty.',
      ),
    }),
  ),
})
  .annotate({
    description: lines(
      'How much each intent item matters: ordered criticality levels and the level of each item.',
      'Inline in the document (format v4) or in its own file. Written by its owner; no op writes it.',
      V4_EXPERIMENTAL_STATEMENT,
    ),
  })
  .pipe(
    Schema.check(
      Schema.makeFilter(
        (policy: {
          readonly levels: readonly { readonly id: string }[]
          readonly assign: Readonly<Record<string, string>>
        }) => {
          const ids = policy.levels.map((level) => level.id)
          const repeated = duplicates(ids)
          if (repeated.length > 0) {
            return {
              path: ['levels'],
              issue: `policy level ids must be unique; repeated: ${repeated.join(', ')}`,
            }
          }
          const declared = new Set(ids)
          const undeclared = [...new Set(Object.values(policy.assign))]
            .filter((level) => !declared.has(level))
            .sort()
          return undeclared.length === 0
            ? undefined
            : {
                path: ['assign'],
                issue: `assign names a level that \`levels\` does not declare: ${undeclared.join(', ')}`,
              }
        },
      ),
    ),
  )
export type Policy = typeof Policy.Type
