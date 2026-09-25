/**
 * `check` against a pinned `symspec.config.json` (spec 007 AC-5-10), in process, over the REAL
 * filesystem store — so the fixed config location, the bundle load and the pin comparison are
 * the shipped code end to end, and only the solver and embedder are the suite's.
 *
 * Every fixture document reaches `verified: true` with ZERO demotions when no pin is violated.
 * That is what makes each "a pin demotes" assertion discriminating: one pushed demotion turns
 * a `true` into a `false`, and the demotion arrays are compared whole, so a demotion under a
 * borrowed reason name is as visible as one under the right name.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeServices } from '@effect/platform-node'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { stubEmbedder } from '../../adapters/embedding/embedder.ts'
import { docStoreLayer } from '../../adapters/fs/store.ts'
import { solverServiceLayer } from '../../adapters/z3/solver-service.ts'
import { CONFIG_FILE_NAME, KNOBS, RUN_KNOBS, skeletonConfig } from '../../domain/config/config.ts'
import { DOC_VERSION } from '../../domain/requirements/document.ts'
import { DocPath, makeDocPath } from '../../ports/doc-store.ts'
import { embedderLayerOf } from '../../ports/embedder.ts'
import { EXIT_INCONCLUSIVE } from '../../ports/exit.ts'
import { exitCodeForEnvelope } from '../runtime/exit.ts'
import { runOperation } from '../runtime/operation.ts'
import { type CheckPayload, checkOp } from './check.ts'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'symspec-pins-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

const TS = '2026-01-01T00:00:00.000Z'

/** Two requirements under one trigger that contradict: verified with nothing to demote. */
const contradictoryDoc = () => {
  const req = (id: string, response: string) => ({
    id,
    patternType: 'event-driven',
    trigger: 'the operator revokes the badge',
    systemName: 'door controller',
    systemResponse: response,
    negated: false,
    sentence: `When the operator revokes the badge, the door controller shall ${response}.`,
    priority: 'medium',
    status: 'draft',
    derives: [],
    satisfies: [],
    verifies: [],
    refines: [],
    createdAt: TS,
    updatedAt: TS,
  })
  const a = req('11111111-1111-4111-8111-111111111111', 'grant access')
  const b = { ...req('22222222-2222-4222-8222-222222222222', 'grant access'), negated: true }
  b.sentence = 'When the operator revokes the badge, the door controller shall not grant access.'
  return {
    docVersion: DOC_VERSION,
    requirements: { [a.id]: a, [b.id]: b },
    stateModel: { variables: [] },
    glossary: [],
    antonyms: [],
    waivers: [],
  }
}

/** The same trigger, two responses that do not conflict: verified, no error finding. */
const consistentDoc = () => {
  const doc = contradictoryDoc()
  const [a, b] = Object.values(doc.requirements)
  const other = {
    ...(b as NonNullable<typeof b>),
    negated: false,
    systemResponse: 'log the revocation',
    sentence: 'When the operator revokes the badge, the door controller shall log the revocation.',
  }
  return { ...doc, requirements: { [(a as NonNullable<typeof a>).id]: a, [other.id]: other } }
}

const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

/** A directory holding the document, and optionally a config beside it. */
const docIn = (dir: string, gate?: Record<string, unknown>): string => {
  const doc = join(dir, 'requirements.json')
  writeJson(doc, contradictoryDoc())
  if (gate !== undefined) writeJson(join(dir, CONFIG_FILE_NAME), { configVersion: 1, gate })
  return doc
}

/** Run `check` in process over the real filesystem store. */
const check = async (
  file: string,
  input: Record<string, unknown> = {},
): Promise<
  { readonly ok: true; readonly data: CheckPayload } | { readonly ok: false; readonly code: string }
> => {
  const result = await Effect.runPromise(
    Effect.result(runOperation(checkOp, { file, ...input })).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.provideMerge(docStoreLayer, NodeServices.layer),
          Layer.succeed(DocPath)(makeDocPath({})),
          solverServiceLayer,
          embedderLayerOf(stubEmbedder()),
        ),
      ),
    ) as Effect.Effect<
      | { readonly _tag: 'Success'; readonly success: { readonly data: CheckPayload } }
      | { readonly _tag: 'Failure'; readonly failure: { readonly _tag: string } }
    >,
  )
  return result._tag === 'Success'
    ? { ok: true, data: result.success.data }
    : { ok: false, code: result.failure._tag }
}

const expectData = async (file: string, input: Record<string, unknown> = {}) => {
  const result = await check(file, input)
  if (!result.ok) throw new Error(`expected a report, got ${result.code}`)
  return result.data
}

describe('check with no config is the unpinned check, byte for byte', () => {
  it('verifies the fixture, and data.run carries no pin key', async () => {
    const data = await expectData(docIn(tempDir()))
    expect(data.verified).toBe(true)
    expect(data.coverage.demotions).toEqual([])
    expect(Object.keys(data.run).sort()).toEqual(['embedder', 'semanticThreshold'])
  })
})

describe('a run below a pin is run-weakened, per knob (AC-5-10)', () => {
  it('--temporal-bound 1 under a pin of 10 demotes once, naming the knob and the pin', async () => {
    const dir = tempDir()
    const data = await expectData(docIn(dir, { temporalBound: 10 }), { temporalBound: 1 })
    expect(data.verified).toBe(false)
    expect(data.coverage.demotions.map((d) => d.reason)).toEqual(['run-weakened'])
    expect(data.run.belowPinned).toEqual(['temporalBound'])
    expect(data.run.pinned).toEqual({ temporalBound: 10 })
    expect(data.run.config).toBe(join(dir, CONFIG_FILE_NAME))
    const [demotion] = data.coverage.demotions
    expect(demotion?.action).toContain('temporalBound')
    expect(demotion?.action).toContain(join(dir, CONFIG_FILE_NAME))
    expect(demotion?.repair?.commands).toEqual([
      `symspec check ${join(dir, 'requirements.json')} --temporal-bound 10`,
    ])
  })

  it('the same run AT the pin verifies: the pin alone moved the verdict', async () => {
    const data = await expectData(docIn(tempDir(), { temporalBound: 10 }), { temporalBound: 10 })
    expect(data.coverage.demotions).toEqual([])
    expect(data.verified).toBe(true)
    expect(data.run.belowPinned).toEqual([])
  })

  it('--reachability-timeout-ms 1 under a pin of 0 (inherit) is weakened (F10)', async () => {
    const data = await expectData(docIn(tempDir(), { reachabilityTimeoutMs: 0 }), {
      reachabilityTimeoutMs: 1,
    })
    expect(data.run.belowPinned).toEqual(['reachabilityTimeoutMs'])
    expect(data.run.pinned).toEqual({ reachabilityTimeoutMs: 2000 })
    expect(data.verified).toBe(false)
  })

  it('two knobs below their pins: two demotions sharing ONE repair that raises both', async () => {
    const doc = docIn(tempDir(), {
      temporalBound: 10,
      timeoutMs: 3000,
      reachabilityTimeoutMs: 3000,
    })
    const data = await expectData(doc, { temporalBound: 1, timeoutMs: 2999 })
    expect(data.run.belowPinned).toEqual(['timeoutMs', 'reachabilityTimeoutMs', 'temporalBound'])
    const commands = data.coverage.demotions.map((d) => d.repair?.commands)
    expect(new Set(commands.map((c) => JSON.stringify(c))).size).toBe(1)
    expect(commands[0]).toEqual([
      `symspec check ${doc} --timeout-ms 3000 --reachability-timeout-ms 3000 --temporal-bound 10`,
    ])
  })

  it('a --strict run below another pin exits 3 on the pin demotion alone', async () => {
    // A CONSISTENT fixture, so no error finding exits 1 first: the exit is the gate's.
    const dir = tempDir()
    const doc = join(dir, 'requirements.json')
    writeJson(doc, consistentDoc())
    writeJson(join(dir, CONFIG_FILE_NAME), {
      configVersion: 1,
      gate: { strict: true, temporalBound: 5 },
    })
    const at = await expectData(doc, { strict: true, temporalBound: 5 })
    expect(at.counts.error).toBe(0)
    expect(at.strictGate).toBe('pass')
    const below = await expectData(doc, { strict: true })
    expect(below.run.belowPinned).toEqual(['temporalBound'])
    expect(below.strictGate).toBe('fail')
    expect(exitCodeForEnvelope({ apiVersion: 1, type: 'check', data: below })).toBe(
      EXIT_INCONCLUSIVE,
    )
  })

  it('the skeleton init --split writes is met by a plain run', async () => {
    const dir = tempDir()
    const doc = docIn(dir)
    writeJson(join(dir, CONFIG_FILE_NAME), skeletonConfig({}))
    const data = await expectData(doc)
    expect(data.run.belowPinned).toEqual([])
    expect(Object.keys(data.run.pinned ?? {}).sort()).toEqual([...KNOBS].sort())
    // The suite's embedder layer is not the stub (isStub false), so the model pin holds.
    expect(data.verified).toBe(true)
  })
})

describe('the config has ONE location (F11)', () => {
  it('under a repository, the toplevel config governs and a weaker shadow beside the document is not read', async () => {
    const root = tempDir()
    mkdirSync(join(root, '.git'))
    writeJson(join(root, CONFIG_FILE_NAME), { configVersion: 1, gate: { temporalBound: 10 } })
    const sub = join(root, 'specs', 'door')
    mkdirSync(sub, { recursive: true })
    // The shadow: a config next to the document that pins nothing.
    const doc = docIn(sub, {})
    const data = await expectData(doc, { temporalBound: 1 })
    expect(data.run.config).toBe(join(root, CONFIG_FILE_NAME))
    expect(data.run.belowPinned).toEqual(['temporalBound'])
    expect(data.verified).toBe(false)
  })

  it('a linked work tree marks its toplevel with a .git FILE, and that counts too', async () => {
    const root = tempDir()
    writeFileSync(join(root, '.git'), 'gitdir: /elsewhere\n')
    writeJson(join(root, CONFIG_FILE_NAME), { configVersion: 1, gate: { strict: true } })
    const sub = join(root, 'docs')
    mkdirSync(sub)
    const data = await expectData(docIn(sub))
    expect(data.run.belowPinned).toEqual(['strict'])
  })

  it('outside a repository, a config in a PARENT directory is not read', async () => {
    const parent = tempDir()
    writeJson(join(parent, CONFIG_FILE_NAME), { configVersion: 1, gate: { temporalBound: 10 } })
    const sub = join(parent, 'child')
    mkdirSync(sub)
    const data = await expectData(docIn(sub), { temporalBound: 1 })
    expect(data.run.config).toBeUndefined()
    expect(data.verified).toBe(true)
  })
})

describe('a config that cannot be read fails CLOSED', () => {
  it('ERR_CONFIG_INVALID on bytes that are not JSON', async () => {
    const dir = tempDir()
    const doc = docIn(dir)
    writeFileSync(join(dir, CONFIG_FILE_NAME), '{ not json')
    expect(await check(doc)).toEqual({ ok: false, code: 'ERR_CONFIG_INVALID' })
  })

  it('ERR_CONFIG_INVALID on a misspelled pin', async () => {
    expect(await check(docIn(tempDir(), { temporalBund: 10 }))).toEqual({
      ok: false,
      code: 'ERR_CONFIG_INVALID',
    })
  })

  it('ERR_CONFIG_INVALID when a split file the config names is missing', async () => {
    const dir = tempDir()
    const doc = docIn(dir)
    writeJson(join(dir, CONFIG_FILE_NAME), {
      configVersion: 1,
      files: { intent: 'intent.json' },
      gate: {},
    })
    expect(await check(doc)).toEqual({ ok: false, code: 'ERR_CONFIG_INVALID' })
  })
})

describe('the knob table names real check flags', () => {
  it('every -- flag in RUN_KNOBS is a check input field', () => {
    const fields = new Set(
      Object.keys(checkOp.input.fields).map(
        (f) => `--${f.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
      ),
    )
    const flags = KNOBS.map((k) => RUN_KNOBS[k].flag).filter((f) => f.startsWith('--'))
    expect(flags.length).toBeGreaterThan(0)
    expect(flags.filter((f) => !fields.has(f))).toEqual([])
  })
})
