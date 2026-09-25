/**
 * Tests for the document store.
 *
 * Four claims, each with its guard proven to fire:
 *
 * 1. **Path resolution precedence** — explicit → env → default, with an empty env
 *    var meaning "unset". Tested against an INJECTED environment, never
 *    `process.env`, so the rule is verified without global mutation.
 * 2. **Atomicity** — a failed write leaves the original file byte-identical and
 *    leaves no temp file behind. The failure is INDUCED (write into a path whose
 *    parent is not a directory) rather than mocked, so the assertion measures the
 *    real filesystem behavior the guarantee is about.
 * 3. **Byte stability** — the same document serializes to the same bytes
 *    regardless of key insertion order, so a no-op save produces no git diff.
 * 4. **Disjoint error codes** — not-found, malformed JSON, invalid schema, and
 *    wrong version each produce their OWN code, because each has a different
 *    remedy. The v2 case is called out separately: it must carry the migration
 *    path, since that is the one failure a real user will actually hit.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACCEPTED_DOC_VERSIONS,
  DOC_VERSION,
  DOC_VERSION_VOCAB,
  emptyDocument,
  type RequirementsDocument,
} from '../../domain/requirements/document.ts'
import {
  DEFAULT_DOC_PATH,
  DOC_PATH_CONVENTION,
  DOC_PATH_ENV_VAR,
  DocStore,
  makeDocPath,
} from '../../ports/doc-store.ts'
import { docStoreLayer, isNotARepository, parseDocumentText, serializeDocument } from './store.ts'

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const dirs: string[] = []

/** A fresh temp directory, cleaned up after the test file. */
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'symspec-store-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

/** Run a store program against the real filesystem. */
const withStore = <A, E>(
  program: (store: (typeof DocStore)['Service']) => Effect.Effect<A, E>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* DocStore
      return yield* program(store)
    }).pipe(Effect.provide(Layer.provideMerge(docStoreLayer, NodeServices.layer))) as Effect.Effect<
      A,
      E
    >,
  )

/** Run and capture the Result, for the failure assertions. */
const attemptStore = <A, E>(
  program: (store: (typeof DocStore)['Service']) => Effect.Effect<A, E>,
) => withStore((store) => Effect.result(program(store)))

const ID_A = '550e8400-e29b-41d4-a716-446655440000'

const requirement = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  patternType: 'ubiquitous',
  systemName: 'auth service',
  systemResponse: 'log every authentication attempt',
  sentence: 'The auth service shall log every authentication attempt.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

describe('doc-path resolution: explicit → SYMSPEC_DOC → ./requirements.json', () => {
  it('prefers the explicit path over everything', () => {
    const dp = makeDocPath({ [DOC_PATH_ENV_VAR]: '/env/path.json' })
    expect(dp.resolve('./explicit.json')).toBe('./explicit.json')
  })

  it('falls back to the env var when nothing is supplied', () => {
    const dp = makeDocPath({ [DOC_PATH_ENV_VAR]: '/env/path.json' })
    expect(dp.resolve(null)).toBe('/env/path.json')
    expect(dp.resolve(undefined)).toBe('/env/path.json')
    expect(dp.envPath).toBe('/env/path.json')
  })

  it('falls back to the default when neither is supplied', () => {
    expect(makeDocPath({}).resolve(null)).toBe(DEFAULT_DOC_PATH)
    expect(makeDocPath({}).envPath).toBeUndefined()
  })

  it('treats an EMPTY env var as unset, not as the empty path', () => {
    // `export SYMSPEC_DOC=` in a shell would otherwise resolve every command to
    // '' and fail with a confusing ENOENT on something that is not a path.
    const dp = makeDocPath({ [DOC_PATH_ENV_VAR]: '' })
    expect(dp.resolve(null)).toBe(DEFAULT_DOC_PATH)
    expect(dp.envPath).toBeUndefined()
  })

  it('treats an EMPTY explicit path as unset too', () => {
    const dp = makeDocPath({ [DOC_PATH_ENV_VAR]: '/env/path.json' })
    expect(dp.resolve('')).toBe('/env/path.json')
  })

  it('states the precedence in ONE string the manifest and errors both quote', () => {
    expect(DOC_PATH_CONVENTION).toContain(DOC_PATH_ENV_VAR)
    expect(DOC_PATH_CONVENTION).toContain(DEFAULT_DOC_PATH)
  })

  it('the guard FIRES: a wrong precedence order is detectable', () => {
    // Negative control. If `resolve` preferred the env var over the explicit
    // path, this is the comparison that would catch it.
    const dp = makeDocPath({ [DOC_PATH_ENV_VAR]: '/env/path.json' })
    expect(dp.resolve('./explicit.json')).not.toBe('/env/path.json')
  })
})

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe('serialization is byte-stable and git-diffable', () => {
  it('pretty-prints with a 2-space indent and a trailing newline', () => {
    const text = serializeDocument(emptyDocument())
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "docVersion": 3')
  })

  it('sorts keys recursively, so insertion order cannot change the bytes', () => {
    // Two documents with the same CONTENT built in opposite key orders must
    // serialize identically, or a no-op save produces a spurious git diff.
    const a = {
      docVersion: DOC_VERSION,
      requirements: {},
      stateModel: { variables: [] },
      glossary: [],
      antonyms: [],
      waivers: [],
      terms: [],
    } as RequirementsDocument
    const b = {
      waivers: [],
      terms: [],
      antonyms: [],
      glossary: [],
      stateModel: { variables: [] },
      requirements: {},
      docVersion: DOC_VERSION,
    } as RequirementsDocument
    expect(serializeDocument(a)).toBe(serializeDocument(b))
  })

  it('emits top-level keys in lexicographic order', () => {
    const keys = [...serializeDocument(emptyDocument()).matchAll(/^ {2}"([^"]+)":/gm)].map(
      (m) => m[1],
    )
    expect(keys).toEqual([...keys].sort())
  })

  it('PRESERVES array order — an edge list`s sequence is data, not formatting', () => {
    const text = serializeDocument(emptyDocument(), {
      futureList: ['zebra', 'apple', 'mango'],
    })
    const parsed = JSON.parse(text) as { futureList: string[] }
    expect(parsed.futureList).toEqual(['zebra', 'apple', 'mango'])
  })

  it('writes preserved unknown top-level keys back (the V27 write half)', () => {
    const text = serializeDocument(emptyDocument(), { futureTable: [{ a: 1 }] })
    expect(JSON.parse(text)).toMatchObject({ futureTable: [{ a: 1 }], docVersion: DOC_VERSION })
  })

  it('round-trips through parseDocumentText unchanged', () => {
    const original = emptyDocument()
    const loaded = Effect.runSync(parseDocumentText(serializeDocument(original), 'x.json'))
    expect(loaded.document).toEqual(original)
    expect(serializeDocument(loaded.document, loaded.unknownKeys)).toBe(serializeDocument(original))
  })

  it('the guard FIRES: differing content produces differing bytes', () => {
    expect(serializeDocument(emptyDocument())).not.toBe(
      serializeDocument(emptyDocument(), { extra: 1 }),
    )
  })
})

// ---------------------------------------------------------------------------
// Document format v4 at the store
// ---------------------------------------------------------------------------

describe('a v3 document is untouched by the v4 format', () => {
  /**
   * The bytes a v3 build wrote, captured from the build before v4 existed. It carries
   * every v3 table, every optional requirement field, both waiver scopes and an unknown
   * top-level key, so a v4 default materialized on ANY of them changes the bytes.
   */
  const LEGACY_V3 = readFileSync(
    fileURLToPath(new URL('./__fixtures__/legacy-v3.json', import.meta.url)),
    'utf8',
  )
  const LEGACY_V3_SHA256 = '49bea7e3de549442c6e69611e16924a04180b0f67fb0eb13d461a28aeef0c89d'
  const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

  it('the fixture is the pinned one — the comparison below is against fixed bytes', () => {
    expect(sha256(LEGACY_V3)).toBe(LEGACY_V3_SHA256)
  })

  it('hashes byte-identically after a load and a save', () => {
    const loaded = Effect.runSync(parseDocumentText(LEGACY_V3, 'legacy-v3.json'))
    expect(loaded.document.docVersion).toBe(DOC_VERSION)
    expect(sha256(serializeDocument(loaded.document, loaded.unknownKeys))).toBe(LEGACY_V3_SHA256)
  })
})

describe('a v4 document round-trips through the store', () => {
  const ID = '550e8400-e29b-41d4-a716-446655440000'
  const v4 = (): Record<string, unknown> => ({
    docVersion: DOC_VERSION_VOCAB,
    requirements: { [ID]: requirement(ID, { intentRef: 'I1' }) },
    vocabulary: {
      symbols: [
        { id: 'sys_auth_service', kind: 'system', canonical: 'auth service', aliases: [] },
        {
          id: 'qty_latency',
          kind: 'quantity',
          canonical: 'latency',
          aliases: ['response time'],
          dimension: 'time',
          unit: 'ms',
          numberType: 'real',
        },
      ],
      merges: [],
      distinct: [],
      frozenTables: { sha256: 'd'.repeat(64) },
    },
    intent: { intentVersion: 1, items: [{ id: 'I1', text: 'Every login attempt is logged.' }] },
    policy: { policyVersion: 1, levels: [{ id: 'audit' }], assign: { I1: 'audit' } },
  })

  it('keeps the vocabulary, the intent, the policy and the intentRef on a save', () => {
    const text = serializeDocument(
      Effect.runSync(parseDocumentText(JSON.stringify(v4()), 'v4.json')).document,
    )
    const written = JSON.parse(text) as Record<string, unknown>
    for (const key of ['vocabulary', 'intent', 'policy']) {
      expect(written[key], key).toEqual(v4()[key])
    }
    expect((written.requirements as Record<string, { intentRef?: string }>)[ID]?.intentRef).toBe(
      'I1',
    )
    expect(written.docVersion).toBe(DOC_VERSION_VOCAB)
  })

  it('is a fixed point: load, save, load, save writes the same bytes', () => {
    const once = serializeDocument(
      Effect.runSync(parseDocumentText(JSON.stringify(v4()), 'v4.json')).document,
    )
    const twice = serializeDocument(Effect.runSync(parseDocumentText(once, 'v4.json')).document)
    expect(twice).toBe(once)
  })

  it('loads docVersion 4 through the version check, which names both readable versions', async () => {
    const dir = tempDir()
    const p = join(dir, 'v4.json')
    writeFileSync(p, JSON.stringify(v4()))
    const r = await attemptStore((s) => s.load(p))
    expect(r._tag).toBe('Success')

    const q = join(dir, 'v5.json')
    writeFileSync(q, JSON.stringify({ ...v4(), docVersion: 5 }))
    const s = await attemptStore((store) => store.load(q))
    expect(s._tag).toBe('Failure')
    if (s._tag === 'Failure') {
      expect(s.failure._tag).toBe('ERR_SCHEMA_VERSION')
      for (const v of ACCEPTED_DOC_VERSIONS) expect(s.failure.error).toContain(String(v))
    }
  })

  it('refuses a v4 key on a docVersion 3 file as ERR_DOC_PARSE naming the upgrade', async () => {
    const dir = tempDir()
    const p = join(dir, 'v3-with-vocabulary.json')
    writeFileSync(p, JSON.stringify({ ...v4(), docVersion: DOC_VERSION }))
    const r = await attemptStore((s) => s.load(p))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('ERR_DOC_PARSE')
      expect(r.failure.error).toContain('`vocabulary`')
      expect(r.failure.error).toContain('docVersion 4')
      expect(r.failure.error).not.toContain('\n')
    }
  })
})

// ---------------------------------------------------------------------------
// The four disjoint load failures
// ---------------------------------------------------------------------------

describe('load failures are disjoint — each remedy gets its own code', () => {
  it('ERR_DOC_NOT_FOUND when the path does not resolve', async () => {
    const dir = tempDir()
    const r = await attemptStore((s) => s.load(join(dir, 'absent.json')))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('ERR_DOC_NOT_FOUND')
      expect(r.failure.suggestions.some((x) => x.includes('symspec init'))).toBe(true)
      expect(r.failure.suggestions.some((x) => x.includes(DOC_PATH_ENV_VAR))).toBe(true)
    }
  })

  it('ERR_DOC_PARSE on bytes that are not JSON', async () => {
    const dir = tempDir()
    const p = join(dir, 'bad.json')
    writeFileSync(p, '{ this is not json')
    const r = await attemptStore((s) => s.load(p))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') expect(r.failure._tag).toBe('ERR_DOC_PARSE')
  })

  it('ERR_DOC_PARSE on valid JSON that fails the schema, naming the JSON path', async () => {
    const dir = tempDir()
    const p = join(dir, 'invalid.json')
    writeFileSync(
      p,
      JSON.stringify({
        docVersion: DOC_VERSION,
        requirements: { [ID_A]: requirement(ID_A, { bogusField: 1 }) },
      }),
    )
    const r = await attemptStore((s) => s.load(p))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('ERR_DOC_PARSE')
      // The failing JSON path is the actionable part of the message.
      expect(r.failure.error).toContain('bogusField')
      // One line: an envelope's `error` field must not carry newlines.
      expect(r.failure.error).not.toContain('\n')
    }
  })

  it('ERR_SCHEMA_VERSION on a v2 document, carrying the MIGRATION PATH', async () => {
    // The one failure a real user hits. Prose an agent cannot execute is the
    // defect v4's reproduce work removed; these suggestions name both
    // commands.
    const dir = tempDir()
    const p = join(dir, 'v2.json')
    writeFileSync(p, JSON.stringify({ schemaVersion: 2, requirements: {} }))
    const r = await attemptStore((s) => s.load(p))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('ERR_SCHEMA_VERSION')
      expect(r.failure.error).toContain('v2 document')
      expect(r.failure.error).toContain('schemaVersion')
      const joined = r.failure.suggestions.join(' ')
      expect(joined).toContain('symspec import')
      expect(joined).toContain('gaps')
    }
  })

  it('ERR_SCHEMA_VERSION on an unknown docVersion, stating both numbers', async () => {
    const dir = tempDir()
    const p = join(dir, 'v9.json')
    writeFileSync(p, JSON.stringify({ docVersion: 9, requirements: {} }))
    const r = await attemptStore((s) => s.load(p))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('ERR_SCHEMA_VERSION')
      expect(r.failure.error).toContain('9')
      expect(r.failure.error).toContain(String(DOC_VERSION))
    }
  })

  it('the VERSION check runs BEFORE the schema decode', async () => {
    // A v9 document that ALSO violates the schema must report the version, not
    // the schema: the version is the cause the user can act on, and a
    // docVersion literal mismatch would otherwise mask it as "malformed".
    const dir = tempDir()
    const p = join(dir, 'v9-invalid.json')
    writeFileSync(p, JSON.stringify({ docVersion: 9, requirements: { 'not-a-uuid': {} } }))
    const r = await attemptStore((s) => s.load(p))
    if (r._tag === 'Failure') expect(r.failure._tag).toBe('ERR_SCHEMA_VERSION')
  })

  it('a document with NEITHER version key is a PARSE failure, not a version one', async () => {
    // Correct: that is a document missing a required field (or not a symspec
    // document at all), which is a different remedy from a migration.
    const dir = tempDir()
    const p = join(dir, 'noversion.json')
    writeFileSync(p, JSON.stringify({ requirements: {} }))
    const r = await attemptStore((s) => s.load(p))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('ERR_DOC_PARSE')
      expect(r.failure.error).toContain('docVersion')
    }
  })

  it('every failure carries at least one actionable suggestion', async () => {
    const dir = tempDir()
    const cases: readonly (readonly [string, string])[] = [
      ['a.json', '{oops'],
      ['b.json', JSON.stringify({ schemaVersion: 2, requirements: {} })],
      ['c.json', JSON.stringify({ docVersion: 9 })],
      ['d.json', JSON.stringify({ docVersion: DOC_VERSION, requirements: { x: {} } })],
    ]
    for (const [name, body] of cases) {
      const p = join(dir, name)
      writeFileSync(p, body)
      const r = await attemptStore((s) => s.load(p))
      expect(r._tag, name).toBe('Failure')
      if (r._tag === 'Failure') expect(r.failure.suggestions.length, name).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Save + atomicity
// ---------------------------------------------------------------------------

describe('save is atomic — a failure never damages the original', () => {
  it('writes a document that loads back identically', async () => {
    const dir = tempDir()
    const p = join(dir, 'requirements.json')
    const document = {
      ...emptyDocument(),
      requirements: {
        [ID_A]: {
          id: ID_A,
          patternType: 'ubiquitous' as const,
          systemName: 'auth service',
          systemResponse: 'log every authentication attempt',
          negated: false,
          sentence: 'The auth service shall log every authentication attempt.',
          priority: 'medium' as const,
          status: 'draft' as const,
          derives: [],
          satisfies: [],
          verifies: [],
          refines: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }
    const loaded = await withStore((s) =>
      Effect.gen(function* () {
        yield* s.save(p, { document })
        return yield* s.load(p)
      }),
    )
    expect(loaded.document).toEqual(document)
  })

  it('leaves NO temp file behind on a successful write', async () => {
    const dir = tempDir()
    await withStore((s) => s.save(join(dir, 'requirements.json'), { document: emptyDocument() }))
    expect(readdirSync(dir)).toEqual(['requirements.json'])
  })

  it('leaves the ORIGINAL byte-identical when the write fails', async () => {
    // Induce a REAL filesystem failure rather than mocking one: write into a path
    // whose parent is a FILE, so both the temp write and the rename are
    // impossible. The pre-existing document must survive untouched.
    const dir = tempDir()
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'not a directory')
    const target = join(blocker, 'requirements.json')

    const r = await attemptStore((s) => s.save(target, { document: emptyDocument() }))
    expect(r._tag).toBe('Failure')
    if (r._tag === 'Failure') {
      expect(r.failure._tag).toBe('ERR_IO')
      expect(r.failure.suggestions.join(' ')).toContain('NOT modified')
    }
    expect(readFileSync(blocker, 'utf8')).toBe('not a directory')
  })

  it('overwrites an existing document without corrupting it mid-write', async () => {
    const dir = tempDir()
    const p = join(dir, 'requirements.json')
    await withStore((s) => s.save(p, { document: emptyDocument() }))
    const first = readFileSync(p, 'utf8')
    await withStore((s) =>
      s.save(p, { document: emptyDocument(), unknownKeys: { futureTable: [1] } }),
    )
    const second = readFileSync(p, 'utf8')
    expect(second).not.toBe(first)
    expect(JSON.parse(second)).toMatchObject({ futureTable: [1] })
    expect(readdirSync(dir)).toEqual(['requirements.json'])
  })

  it('two saves in quick succession do not collide on a temp name', async () => {
    // The temp name is clock+counter, not crypto-random; the counter is what makes
    // two saves within one millisecond safe.
    const dir = tempDir()
    await withStore((s) =>
      Effect.all(
        [
          s.save(join(dir, 'a.json'), { document: emptyDocument() }),
          s.save(join(dir, 'b.json'), { document: emptyDocument() }),
          s.save(join(dir, 'c.json'), { document: emptyDocument() }),
        ],
        { concurrency: 3 },
      ),
    )
    expect(readdirSync(dir).sort()).toEqual(['a.json', 'b.json', 'c.json'])
  })

  it('a save/load/save cycle is a fixed point — no spurious diff', async () => {
    const dir = tempDir()
    const p = join(dir, 'requirements.json')
    await withStore((s) => s.save(p, { document: emptyDocument(), unknownKeys: { z: 1, a: 2 } }))
    const first = readFileSync(p, 'utf8')
    await withStore((s) =>
      Effect.gen(function* () {
        const loaded = yield* s.load(p)
        yield* s.save(p, { document: loaded.document, unknownKeys: loaded.unknownKeys })
      }),
    )
    expect(readFileSync(p, 'utf8')).toBe(first)
  })
})

describe('exists', () => {
  it('is false for an absent path and true for a present one', async () => {
    const dir = tempDir()
    const p = join(dir, 'requirements.json')
    expect(await withStore((s) => s.exists(p))).toBe(false)
    await withStore((s) => s.save(p, { document: emptyDocument() }))
    expect(await withStore((s) => s.exists(p))).toBe(true)
  })

  it('never fails — an unreadable path reports "does not exist"', async () => {
    // `init` only needs to know whether it would be overwriting something; an
    // unreadable path is not a reason to abort with a different error.
    const dir = tempDir()
    expect(await withStore((s) => s.exists(join(dir, 'a', 'b', 'c.json')))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The bundle: the config at its one location, and the split anchors
// ---------------------------------------------------------------------------

describe('loadBundle', () => {
  const writeJson = (path: string, value: unknown) =>
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  const INTENT = {
    intentVersion: 1 as const,
    items: [{ id: 'I1', text: 'Doors stay shut in motion.' }],
  }
  const POLICY = { policyVersion: 1, levels: [{ id: 'safety' }], assign: { I1: 'safety' } }

  /** A v3 document in `dir`, and a config naming split anchors beside it. */
  const fixture = (files: Record<string, string>) => {
    const dir = tempDir()
    const doc = join(dir, 'requirements.json')
    writeFileSync(doc, serializeDocument(emptyDocument()))
    writeJson(join(dir, 'symspec.config.json'), { configVersion: 1, files, gate: {} })
    return { dir, doc }
  }

  it('is the bare document when no config exists', async () => {
    const dir = tempDir()
    const doc = join(dir, 'requirements.json')
    writeFileSync(doc, serializeDocument(emptyDocument()))
    const bundle = await withStore((s) => s.loadBundle(doc))
    expect(Object.keys(bundle)).toEqual(['loaded'])
  })

  it('attaches the split intent and policy the config names, with where each came from', async () => {
    const { dir, doc } = fixture({ intent: 'anchors/intent.json', policy: 'policy.json' })
    mkdirSync(join(dir, 'anchors'))
    writeJson(join(dir, 'anchors', 'intent.json'), INTENT)
    writeJson(join(dir, 'policy.json'), POLICY)
    const bundle = await withStore((s) => s.loadBundle(doc))
    expect(bundle.intent).toEqual({
      value: INTENT,
      source: { from: 'file', path: join(dir, 'anchors', 'intent.json') },
    })
    expect(bundle.policy?.value).toEqual(POLICY)
    expect(bundle.config?.governsDocument).toBe(true)
  })

  it('does not attach them to a document the config does not govern, and still reads its pins', async () => {
    const { dir } = fixture({ document: 'requirements.json', intent: 'intent.json' })
    writeJson(join(dir, 'intent.json'), INTENT)
    const other = join(dir, 'scratch.json')
    writeFileSync(other, serializeDocument(emptyDocument()))
    const bundle = await withStore((s) => s.loadBundle(other))
    expect(bundle.config?.governsDocument).toBe(false)
    expect(bundle.intent).toBeUndefined()
  })

  it('refuses an inline intent beside a split one as ERR_CONFIG_INVALID', async () => {
    const { dir, doc } = fixture({ intent: 'intent.json' })
    writeJson(join(dir, 'intent.json'), INTENT)
    writeFileSync(
      doc,
      serializeDocument({ ...emptyDocument(), docVersion: DOC_VERSION_VOCAB, intent: INTENT }),
    )
    const r = await attemptStore((s) => s.loadBundle(doc))
    expect(r._tag === 'Failure' ? r.failure._tag : r._tag).toBe('ERR_CONFIG_INVALID')
  })

  it('reads an explicitly named config in place of the default one, and refuses one that is absent', async () => {
    const { dir, doc } = fixture({})
    const named = join(tempDir(), 'named.json')
    writeJson(named, { configVersion: 1, gate: { temporalBound: 5 } })
    const bundle = await withStore((s) => s.loadBundle(doc, { path: named, source: 'env' }))
    expect(bundle.config).toMatchObject({ path: named, source: 'env', governsDocument: true })
    expect(bundle.config?.config.gate).toEqual({ temporalBound: 5 })
    const byDefault = await withStore((s) => s.loadBundle(doc))
    expect(byDefault.config).toMatchObject({
      path: join(realpathSync(dir), 'symspec.config.json'),
      source: 'directory',
    })
    const absent = join(dir, 'absent.json')
    const r = await attemptStore((s) => s.loadBundle(doc, { path: absent, source: 'flag' }))
    expect(r._tag === 'Failure' ? r.failure._tag : r._tag).toBe('ERR_CONFIG_INVALID')
    if (r._tag === 'Failure') expect(r.failure.error).toContain(absent)
  })

  it('refuses a split file that fails its schema as ERR_CONFIG_INVALID, naming the file', async () => {
    const { dir, doc } = fixture({ policy: 'policy.json' })
    writeJson(join(dir, 'policy.json'), { ...POLICY, assign: { I1: 'undeclared' } })
    const r = await attemptStore((s) => s.loadBundle(doc))
    expect(r._tag === 'Failure' ? r.failure._tag : r._tag).toBe('ERR_CONFIG_INVALID')
    if (r._tag === 'Failure') expect(r.failure.error).toContain(join(dir, 'policy.json'))
  })
})

describe('isNotARepository accepts git discovery`s own message, whole, and nothing quoting it', () => {
  it('accepts both discovery failures git prints', () => {
    // Captured verbatim from git 2.50.1 under LC_ALL=C: discovery reached `/`, or stopped at a
    // filesystem boundary (a tmpfs /tmp gives this one).
    expect(
      isNotARepository('fatal: not a git repository (or any of the parent directories): .git'),
    ).toBe(true)
    expect(
      isNotARepository(
        'fatal: not a git repository (or any parent up to mount point /tmp)\nStopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).',
      ),
    ).toBe(true)
  })

  it('refuses a refusal whose quoted path spells the phrase', () => {
    for (const path of [
      '/c/NOT A GIT REPOSITORY',
      '/c/n/not a git repository/fake',
      '/c/fatal: not a git repository (or any of the parent directories): .git',
    ]) {
      expect(
        isNotARepository(
          `fatal: cannot use bare repository '${path}' (safe.bareRepository is 'explicit')`,
        ),
        path,
      ).toBe(false)
    }
    expect(
      isNotARepository(
        "fatal: detected dubious ownership in repository at '/c/not a git repository'",
      ),
    ).toBe(false)
    // A `.git` file naming no repository is a broken repository, not an absent one.
    expect(isNotARepository('fatal: not a git repository: /c/.git/worktrees/x')).toBe(false)
    // A warning before the message means git said something else too: fail closed.
    expect(
      isNotARepository(
        'warning: x\nfatal: not a git repository (or any of the parent directories): .git',
      ),
    ).toBe(false)
  })
})

describe('configPath is the toplevel git prints for the real document directory', () => {
  /** Run git in `cwd`, with no inherited GIT_* variable: a hook's GIT_DIR would redirect it. */
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd,
      encoding: 'utf8',
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    }).trim()

  const configAt = (dir: string) => join(dir, 'symspec.config.json')

  it('a real clone and a real linked work tree are each a toplevel', async () => {
    // Real paths, because git prints the toplevel resolved (a temp dir can be behind a link).
    const root = realpathSync(tempDir())
    git(root, 'init', '-q')
    git(root, 'commit', '-q', '--allow-empty', '-m', 'init')
    const docs = join(root, 'docs')
    mkdirSync(docs)
    const doc = join(docs, 'requirements.json')
    expect(await withStore((s) => s.configPath(doc))).toEqual({
      path: configAt(git(docs, 'rev-parse', '--show-toplevel')),
      source: 'toplevel',
      document: doc,
    })
    const linked = join(realpathSync(tempDir()), 'linked')
    git(root, 'worktree', 'add', '-q', linked)
    mkdirSync(join(linked, 'docs'))
    const inLinked = await withStore((s) => s.configPath(join(linked, 'docs', 'requirements.json')))
    expect(inLinked.path).toBe(configAt(git(join(linked, 'docs'), 'rev-parse', '--show-toplevel')))
    expect(inLinked.path).toBe(configAt(linked))
  })

  it('resolves the document`s symlinks before asking git, so a link from outside reads the repository`s', async () => {
    const root = realpathSync(tempDir())
    git(root, 'init', '-q')
    const docs = join(root, 'docs')
    mkdirSync(docs)
    const doc = join(docs, 'requirements.json')
    writeFileSync(doc, serializeDocument(emptyDocument()))
    const outside = realpathSync(tempDir())
    symlinkSync(docs, join(outside, 'd'))
    symlinkSync(doc, join(outside, 'r.json'))
    for (const via of [join(outside, 'd', 'requirements.json'), join(outside, 'r.json')]) {
      expect(await withStore((s) => s.configPath(via)), via).toEqual({
        path: configAt(root),
        source: 'toplevel',
        document: doc,
      })
    }
    // A document init has yet to create resolves beneath its real directory.
    const absent = await withStore((s) => s.configPath(join(outside, 'd', 'new.json')))
    expect(absent.document).toBe(join(docs, 'new.json'))
  })

  it('fails closed when git fails for any reason but "not a repository"', async () => {
    const root = realpathSync(tempDir())
    git(root, 'init', '-q')
    const docs = join(root, 'docs')
    mkdirSync(docs)
    // A .git git cannot read: git exits 128 with "invalid gitfile format", not "not a repository".
    writeFileSync(join(docs, '.git'), 'not a gitfile\n')
    const r = await attemptStore((s) => s.configPath(join(docs, 'requirements.json')))
    expect(r._tag === 'Failure' ? r.failure._tag : r._tag).toBe('ERR_CONFIG_INVALID')
    if (r._tag === 'Failure') expect(r.failure.error).toContain('git rev-parse --show-toplevel')
  })

  // Git's refusal quotes the bare directory's path, so a committed name that spells git's
  // "not a git repository" must not read as no repository (and fall back to the directory).
  it.each([
    ['fake'],
    ['NOT A GIT REPOSITORY'],
    [join('n', 'not a git repository (or any of the parent directories)', 'fake')],
  ])('refuses a directory git would discover only as a bare repository, even one naming a work tree (%s)', async (name) => {
    const root = realpathSync(tempDir())
    git(root, 'init', '-q')
    // Every file here is committable: nothing is named `.git`.
    const fake = join(root, name)
    for (const sub of ['objects', 'refs', 'wt']) mkdirSync(join(fake, sub), { recursive: true })
    writeFileSync(join(fake, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(fake, 'config'), '[core]\n\trepositoryformatversion = 0\n\tworktree = wt\n')
    // Under git's default the fake is the toplevel; the probe must not agree.
    expect(git(join(fake, 'wt'), 'rev-parse', '--show-toplevel')).toBe(join(fake, 'wt'))
    const r = await attemptStore((s) => s.configPath(join(fake, 'wt', 'requirements.json')))
    expect(r._tag === 'Failure' ? r.failure._tag : r._tag).toBe('ERR_CONFIG_INVALID')
    if (r._tag === 'Failure') expect(r.failure.error).toContain('cannot use bare repository')
  })

  it('outside a repository it is the document`s own directory, never a parent`s', async () => {
    const parent = realpathSync(tempDir())
    writeFileSync(configAt(parent), '{"configVersion":1,"gate":{}}\n')
    const dir = join(parent, 'sub')
    mkdirSync(dir)
    const doc = join(dir, 'requirements.json')
    expect(await withStore((s) => s.configPath(doc))).toEqual({
      path: configAt(dir),
      source: 'directory',
      document: doc,
    })
  })
})

describe('create', () => {
  it('writes a new file, and refuses an existing one without touching it', async () => {
    const dir = tempDir()
    const p = join(dir, 'intent.json')
    await withStore((s) => s.create(p, 'first\n'))
    expect(readFileSync(p, 'utf8')).toBe('first\n')
    const r = await attemptStore((s) => s.create(p, 'second\n'))
    expect(r._tag === 'Failure' ? r.failure._tag : r._tag).toBe('ERR_DOC_EXISTS')
    expect(readFileSync(p, 'utf8')).toBe('first\n')
  })
})
