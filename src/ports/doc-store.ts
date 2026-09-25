/**
 * `DocPath` and `DocStore` — where the document lives and how it is read, as a
 * contract.
 *
 * The path-resolution rule (one prose string, one pure `makeDocPath`) and the
 * two service SHAPES live here; the layers that sample `process.env` and touch
 * the real filesystem live in `adapters/fs/store.ts`.
 */

import { Context, Effect } from 'effect'
import type { Intent, Policy } from '../domain/anchor/anchor.ts'
import { CONFIG_FILE_NAME, type SymspecConfig } from '../domain/config/config.ts'
import type { LoadedDocument, RequirementsDocument } from '../domain/requirements/document.ts'
import {
  type ErrConfigInvalid,
  type ErrDocExists,
  type ErrDocNotFound,
  type ErrDocParse,
  ErrIo,
  type ErrSchemaVersion,
} from './errors.ts'

/** The default document path when nothing else resolves. v4 convention. */
export const DEFAULT_DOC_PATH = './requirements.json'

/** The environment variable that overrides the default. v4 convention. */
export const DOC_PATH_ENV_VAR = 'SYMSPEC_DOC'

/**
 * The document-path resolution rule, as prose — single-sourced here so the
 * manifest, every flag description, and every error message quote ONE string
 * rather than four paraphrases that drift.
 */
export const DOC_PATH_CONVENTION = `Resolution precedence, in order: the supplied path, then the ${DOC_PATH_ENV_VAR} environment variable, then the ${DEFAULT_DOC_PATH} default.`

/**
 * The path-resolution service.
 *
 * A SERVICE rather than a bare function because the environment is a dependency:
 * reading `process.env` at each call site would make the rule untestable without
 * mutating global state, and would re-read a variable that should be sampled once
 * per process. {@link docPathLayer} samples `SYMSPEC_DOC` at layer construction —
 * the "Config snapshots env at init" discipline — so every operation in one
 * invocation resolves against the same environment.
 */
export class DocPath extends Context.Service<
  DocPath,
  {
    /**
     * Resolve the document path from an explicit value (a positional argument or
     * `--file`), falling back through the env var to the default. `null` and
     * `undefined` both mean "not supplied", so a CLI flag whose absent value
     * decodes to `null` needs no special-casing at the call site.
     */
    readonly resolve: (explicit: string | null | undefined) => string
    /** The sampled `SYMSPEC_DOC` value, or `undefined` when unset. Exposed for
     * diagnostics and for tests that assert the precedence. */
    readonly envPath: string | undefined
  }
>()('symspec/DocPath') {}

/**
 * Build a {@link DocPath} from an explicit environment map.
 *
 * Takes the environment as an ARGUMENT so the resolution rule is testable
 * without touching `process.env`. {@link docPathLayer} is the production wiring
 * that passes the real one.
 */
export const makeDocPath = (env: Readonly<Record<string, string | undefined>>) => {
  const raw = env[DOC_PATH_ENV_VAR]
  // An empty-string env var means "unset", not "the empty path". A shell that
  // exports SYMSPEC_DOC= would otherwise resolve every command to '' and fail
  // with a confusing ENOENT on a path that is not a path.
  const envPath = raw !== undefined && raw.length > 0 ? raw : undefined
  return DocPath.of({
    envPath,
    resolve: (explicit) => {
      if (explicit !== null && explicit !== undefined && explicit.length > 0) return explicit
      return envPath ?? DEFAULT_DOC_PATH
    },
  })
}

/** What {@link DocStore.save} persists: a document plus the unknown top-level
 * keys to write back alongside it. */
export interface SaveInput {
  readonly document: RequirementsDocument
  readonly unknownKeys?: Readonly<Record<string, unknown>>
}

/** Where an anchor came from: the document's own top-level key, or a split file. */
export type AnchorSource =
  | { readonly from: 'document' }
  | { readonly from: 'file'; readonly path: string }

/** An intent or a policy, with where it was read from. */
export interface LoadedAnchor<A> {
  readonly value: A
  readonly source: AnchorSource
}

/** The pinned config, as read from its one location. */
export interface LoadedConfig {
  /** The path it was read from: the fixed location, never a searched one. */
  readonly path: string
  readonly config: SymspecConfig
  /**
   * Whether this config governs the checked document: it names no `files.document`, or names
   * this one. The pins apply either way; the split anchors attach only when this is true.
   */
  readonly governsDocument: boolean
}

/**
 * What `check` reads: the document, plus the pinned config at its one location and the intent
 * and policy wherever they live (inline in the document, or in the split files the config
 * names). An absent key means the artifact does not exist, never that it failed to load: a
 * load failure is an `ERR_*`.
 */
export interface DocumentBundle {
  readonly loaded: LoadedDocument
  readonly config?: LoadedConfig
  readonly intent?: LoadedAnchor<Intent>
  readonly policy?: LoadedAnchor<Policy>
}

/**
 * The bundle of a document with no config: the document and the anchors it carries inline.
 * What a store that holds only documents honestly returns.
 */
export const documentBundle = (loaded: LoadedDocument): DocumentBundle => ({
  loaded,
  ...(loaded.document.intent !== undefined
    ? { intent: { value: loaded.document.intent, source: { from: 'document' as const } } }
    : {}),
  ...(loaded.document.policy !== undefined
    ? { policy: { value: loaded.document.policy, source: { from: 'document' as const } } }
    : {}),
})

/**
 * The document store service: read a v3 document, write one atomically, and
 * answer whether one exists.
 *
 * Every method's error channel is the catalog's `ERR_*` classes, never a raw
 * `PlatformError` — mapping happens at this boundary so no operation above it has
 * to know what a `PlatformError` is, and so every failure an agent sees carries a
 * stable code with actionable suggestions.
 */
export interface DocStoreShape {
  /**
   * Load and validate the document at `path`.
   *
   * `ERR_DOC_NOT_FOUND` when the path does not resolve (distinct from a parse
   * failure: the remedy is `init`, not an edit), `ERR_SCHEMA_VERSION` on a
   * version mismatch, `ERR_DOC_PARSE` on malformed or invalid content.
   */
  readonly load: (
    path: string,
  ) => Effect.Effect<LoadedDocument, ErrDocNotFound | ErrDocParse | ErrSchemaVersion>
  /**
   * Serialize and write `input` to `path` ATOMICALLY (temp file + rename).
   * Fails with `ERR_IO`, leaving any existing file at `path` intact.
   */
  readonly save: (path: string, input: SaveInput) => Effect.Effect<void, ErrIo>
  /** Whether a file exists at `path`. Never fails: an unreadable path is
   * reported as "does not exist", because that is what the caller — `init`
   * deciding whether to refuse — actually needs to know. */
  readonly exists: (path: string) => Effect.Effect<boolean>
  /**
   * Load the document at `path` as a {@link DocumentBundle}: the document, the config at its
   * one location ({@link DocStore.configPath}), and the intent and policy.
   *
   * `ERR_CONFIG_INVALID` when the config or a split file it names cannot be read and decoded,
   * or when the document carries an inline intent (or policy) and the config names a split
   * one too. It fails CLOSED: a config that cannot be read is never read as no config.
   */
  readonly loadBundle: (
    path: string,
  ) => Effect.Effect<
    DocumentBundle,
    ErrDocNotFound | ErrDocParse | ErrSchemaVersion | ErrConfigInvalid
  >
  /**
   * The ONE location of the config for the document at `path`: `symspec.config.json` at the
   * document's repository toplevel, or in the document's own directory outside a work tree.
   * Never a search for the nearest config. `ERR_CONFIG_INVALID` when a `.git` entry on the way
   * up is not a repository: it would move the toplevel, so it is refused rather than trusted.
   */
  readonly configPath: (path: string) => Effect.Effect<string, ErrConfigInvalid>
  /**
   * Write `contents` to a file that must not exist yet. `ERR_DOC_EXISTS` when it does, and
   * then nothing is written: the exclusive create is the write-safety primitive for the
   * files an owner authors (`init --split`'s intent, policy and config).
   */
  readonly create: (path: string, contents: string) => Effect.Effect<void, ErrDocExists | ErrIo>
}

/** The document store service. See {@link DocStoreShape}. */
export class DocStore extends Context.Service<DocStore, DocStoreShape>()('symspec/DocStore') {}

/** The parent directory of a path, without the platform `Path` service. */
const parentOf = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')
  return cut < 0 ? '.' : cut === 0 ? '/' : trimmed.slice(0, cut)
}

/**
 * A {@link DocStore} over a store that holds only DOCUMENTS — the in-memory stores the suites
 * and harnesses build. Its world has no repository and no config, so
 * {@link DocStore.loadBundle} is the document with its inline anchors,
 * {@link DocStore.configPath} is the outside-a-work-tree rule, and {@link DocStore.create}
 * refuses: there is no file but a document to create.
 */
export const documentOnlyStore = (
  store: Pick<DocStoreShape, 'load' | 'save' | 'exists'>,
): DocStoreShape =>
  DocStore.of({
    ...store,
    loadBundle: (path) => Effect.map(store.load(path), documentBundle),
    configPath: (path) => Effect.succeed(`${parentOf(path)}/${CONFIG_FILE_NAME}`),
    create: (path) =>
      Effect.fail(
        new ErrIo({
          error: `This store holds only documents, so it cannot create ${path}.`,
          suggestions: ['Run the command against the real filesystem.'],
        }),
      ),
  })
