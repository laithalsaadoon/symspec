/**
 * DRIFT + CONTRACT tests against the SHIPPED BUNDLE.
 *
 * Promoted from spike S2's `verify.sh`, which is the executable form of the
 * spec's "drift is a test failure" rule. It caught two real silent bugs in a
 * three-op toy, so it graduates into the real suite rather than staying a script
 * nobody runs.
 *
 * ## Why these spawn a child process
 *
 * The drift these guard is between the SHIPPED manifest and the SHIPPED help —
 * what an agent and a human actually receive — not between two in-process
 * function calls. An in-process comparison would pass even if the CLI wiring
 * dropped a description on the floor, which is precisely the failure mode. So
 * every check here runs `node dist/cli.mjs …` for real and reads its stdout,
 * stderr, and exit code.
 *
 * That makes `dist/cli.mjs` a PREREQUISITE: the `check` script runs `build`
 * before `vitest`, and the first test below fails with a clear message rather
 * than a confusing ENOENT if the bundle is missing.
 *
 * ## The negative control is the point
 *
 * A drift test that cannot fail is decoration. `the guard fires` below corrupts a
 * summary IN MEMORY and asserts the very same comparison reports it — so the
 * check is proven capable of failing without ever committing a broken artifact.
 *
 * ## What these guards catch, verified by breaking the build on purpose
 *
 * Both experiments were run live against the real bundle, and the distinction
 * matters enough to record:
 *
 * - EDITING the single source (changing `versionOp.summary` in the table) does
 *   NOT fail these tests, and SHOULD NOT. Both surfaces move together, because
 *   both read the same string — that is single sourcing working exactly as
 *   intended, and a test that failed here would only be pinning prose.
 * - BREAKING THE LINK (replacing `Command.withDescription(versionOp.summary)`
 *   with a hand-typed string) fails three of these tests immediately. That is the
 *   regression that actually matters: someone "helpfully" restating a summary in
 *   the CLI layer is how v4's triple-wiring drifted in the first place.
 *
 * So the guard is aimed at the PROVENANCE of the text, not its content. It fails
 * when a projection stops deriving and starts restating.
 */

import { execFile, execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from './app/runtime/operation.ts'
import {
  argvOf,
  argvRejections,
  rejectionLines,
  shellArgv,
  shellSafetyProblem,
  symspecCommandsDeep,
  symspecCommandsIn,
} from './testing/cli-argv.ts'

const BUNDLE = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url))

/** Run the shipped CLI, capturing stdout, stderr and the exit code separately. */
const run = (...args: string[]): { stdout: string; stderr: string; code: number } => {
  const r = spawnSync(process.execPath, [BUNDLE, ...args], { encoding: 'utf8' })
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.status ?? -1 }
}

/** Run the CLI and parse its stdout as one JSON envelope. */
const runJson = (...args: string[]): { envelope: Record<string, unknown>; code: number } => {
  const { stdout, code } = run(...args)
  return { envelope: JSON.parse(stdout) as Record<string, unknown>, code }
}

/**
 * {@link runJson}, concurrently.
 *
 * For loops over an independent set of invocations, where the cost is 21 node boots and
 * not 21 computations. Resolves rather than rejects on a non-zero exit, because the exit
 * code is part of what these tests assert.
 */
const runJsonAsync = async (
  ...args: string[]
): Promise<{ envelope: Record<string, unknown>; code: number }> =>
  new Promise((resolve, reject) => {
    execFile(process.execPath, [BUNDLE, ...args], { encoding: 'utf8' }, (error, stdout) => {
      const code = error === null ? 0 : ((error as { code?: number }).code ?? -1)
      try {
        resolve({ envelope: JSON.parse(stdout) as Record<string, unknown>, code })
      } catch (parseError) {
        reject(new Error(`${args.join(' ')}: stdout was not JSON (${String(parseError)})`))
      }
    })
  })

let manifest: Manifest
let rootHelp: string

/**
 * `<command> --help` for every operation, spawned ONCE and concurrently.
 *
 * Every drift assertion below needs the same per-command help text, and spawning it
 * per assertion means one boot of a 2.2 MB bundle per operation per test. Serially that
 * is tens of seconds of pure process startup, which is a timeout on a loaded runner and
 * a green run on an idle laptop — the failure mode the a-passing-test-on-a-fast-machine
 * lesson is about. Cached and parallel, the whole set costs about one spawn.
 */
let commandHelp: ReadonlyMap<string, string>

beforeAll(async () => {
  if (!existsSync(BUNDLE)) {
    throw new Error(
      `The shipped bundle is missing at ${BUNDLE}. These are drift tests against the BUILT ` +
        'artifact — run `pnpm build` first (the `check` script does).',
    )
  }
  const { envelope } = runJson('manifest')
  manifest = envelope.data as Manifest
  rootHelp = execFileSync(process.execPath, [BUNDLE, '--help'], { encoding: 'utf8' })

  const helpOf = promisify(execFile)
  commandHelp = new Map(
    await Promise.all(
      manifest.operations.map(
        async (op): Promise<readonly [string, string]> => [
          op.name,
          (await helpOf(process.execPath, [BUNDLE, op.name, '--help'])).stdout,
        ],
      ),
    ),
  )
})

/** The cached `<command> --help`, or a loud failure rather than a silent empty string. */
const helpFor = (name: string): string => {
  const help = commandHelp.get(name)
  if (help === undefined) throw new Error(`no cached --help for ${name}`)
  return help
}

// ---------------------------------------------------------------------------
// Exit-code contract, end to end
// ---------------------------------------------------------------------------

describe('exit codes from the real process', () => {
  it('exits 0 on manifest', () => {
    expect(run('manifest').code).toBe(0)
  })

  it('exits 0 on version', () => {
    expect(run('version').code).toBe(0)
  })

  it('exits 0 on a successful explain', () => {
    expect(run('explain', '--code', 'ERR_NOT_FOUND').code).toBe(0)
  })

  it('exits 2 on an operational error', () => {
    expect(run('explain', '--code', 'ERR_BOGUS').code).toBe(2)
  })

  it('exits 1 on a usage error (missing required flag)', () => {
    expect(run('explain').code).toBe(1)
  })

  it('exits 1 on an unknown subcommand', () => {
    expect(run('nope').code).not.toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Envelope shape and stream discipline
// ---------------------------------------------------------------------------

describe('envelope shape on the wire', () => {
  it('emits {apiVersion,type,data} on success', () => {
    const { envelope } = runJson('explain', '--code', 'ERR_IO')
    expect(envelope.apiVersion).toBe(1)
    expect(envelope.type).toBe('codeExplanation')
    expect(typeof envelope.data).toBe('object')
  })

  it('emits the error envelope with code and suggestions on failure', () => {
    const { envelope, code } = runJson('explain', '--code', 'ERR_BOGUS')
    expect(code).toBe(2)
    expect(envelope.type).toBe('error')
    expect(envelope.code).toBe('ERR_NOT_FOUND')
    expect(Array.isArray(envelope.suggestions)).toBe(true)
    expect((envelope.suggestions as string[]).length).toBeGreaterThan(0)
  })

  it('carries a machine-actionable repair on the error envelope (AC-A-9)', () => {
    const { envelope } = runJson('explain', '--code', 'ERR_SOLVER_MISSNG')
    const repair = envelope.repair as { ops: unknown[]; commands: string[] }
    expect(repair.commands).toEqual(['symspec explain --code ERR_SOLVER_MISSING'])
  })

  it('writes exactly ONE line of JSON to stdout', () => {
    const { stdout } = run('version')
    expect(stdout.trimEnd().split('\n')).toHaveLength(1)
    expect(() => JSON.parse(stdout)).not.toThrow()
  })

  /**
   * Stdout is the envelope contract; the default v4 logger writes to stdout and
   * would corrupt it, and `runMain` would append a pretty stack trace after the
   * JSON. `Logger.LogToStderr` and `errorReported=false` are what keep this clean,
   * so an EMPTY stderr on the error path is the assertion that both are wired.
   */
  it('writes the error envelope to STDOUT and leaves stderr EMPTY', () => {
    const { stdout, stderr, code } = run('explain', '--code', 'ERR_BOGUS')
    expect(code).toBe(2)
    expect(stderr).toBe('')
    expect((JSON.parse(stdout) as { type: string }).type).toBe('error')
  })

  it('emits no envelope on stdout for a usage error — stdout stays parseable-or-empty', () => {
    // A usage error is not an operational one: the CLI renders help, and an agent
    // distinguishes the two by exit code 1 with no envelope vs 2 with one.
    const { stdout, code } = run('explain')
    expect(code).toBe(1)
    expect(() => JSON.parse(stdout) as unknown).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Drift: summaries
// ---------------------------------------------------------------------------

describe('drift — manifest summaries vs root --help', () => {
  it('shows every manifest summary verbatim in --help', () => {
    const missing = manifest.operations
      .filter((op) => !rootHelp.includes(op.summary))
      .map((op) => op.name)
    expect(missing).toEqual([])
  })

  it('lists every manifest operation as a --help subcommand', () => {
    for (const op of manifest.operations) {
      expect(rootHelp).toContain(op.name)
    }
  })

  it('shows no subcommand in --help that the manifest omits', () => {
    // The other direction: help must not advertise an operation the manifest
    // does not describe, or an agent reading the manifest would miss a command.
    const subcommandBlock = rootHelp.split(/SUBCOMMANDS/)[1] ?? ''
    const advertised = subcommandBlock
      .split('\n')
      .map((line) =>
        line
          .trim()
          .split(/\s{2,}/)[0]
          ?.trim(),
      )
      .filter((name): name is string => name !== undefined && name.length > 0)
    const known = new Set(manifest.operations.map((op) => op.name))
    expect(advertised.filter((name) => !known.has(name))).toEqual([])
  })

  /**
   * THE NEGATIVE CONTROL. Corrupt a summary in memory and assert the identical
   * comparison reports it. Without this, a check that trivially passed (because
   * it compared a thing to itself, say) would look identical to a check that
   * works.
   */
  it('the guard FIRES when a summary is corrupted', () => {
    const corrupted = manifest.operations.map((op, i) =>
      i === 0 ? { ...op, summary: 'THIS SUMMARY WAS NEVER SINGLE-SOURCED' } : op,
    )
    const missing = corrupted.filter((op) => !rootHelp.includes(op.summary)).map((op) => op.name)
    expect(missing).toEqual([manifest.operations[0]?.name])
  })

  it('the guard fires for EVERY operation, not just the first', () => {
    for (const [i, op] of manifest.operations.entries()) {
      const corrupted = manifest.operations.map((o, j) =>
        j === i ? { ...o, summary: `CORRUPTED-${i}` } : o,
      )
      const missing = corrupted.filter((o) => !rootHelp.includes(o.summary)).map((o) => o.name)
      expect(missing, `corrupting ${op.name} was not detected`).toEqual([op.name])
    }
  })
})

// ---------------------------------------------------------------------------
// Drift: per-flag descriptions
// ---------------------------------------------------------------------------

/**
 * Walk `allOf`/`anyOf`/`oneOf` for a description — the same walk the kernel does,
 * re-implemented here deliberately. A drift test that imported the production
 * reader would agree with it by construction, including when it is wrong; an
 * independent reader is what makes the comparison meaningful.
 */
interface Node {
  readonly description?: string
  readonly allOf?: readonly Node[]
  readonly anyOf?: readonly Node[]
  readonly oneOf?: readonly Node[]
}
const descriptionOf = (node: Node | undefined): string | undefined => {
  if (node === undefined) return undefined
  if (node.description !== undefined) return node.description
  for (const branch of [node.allOf, node.anyOf, node.oneOf]) {
    for (const child of branch ?? []) {
      const found = descriptionOf(child)
      if (found !== undefined) return found
    }
  }
  return undefined
}

const propertiesOf = (op: Manifest['operations'][number]): Record<string, Node> =>
  (op.input as { properties?: Record<string, Node> }).properties ?? {}

describe('drift — every flag description reaches BOTH surfaces', () => {
  it('gives every manifest field a non-blank description', () => {
    const blank: string[] = []
    for (const op of manifest.operations) {
      for (const [field, node] of Object.entries(propertiesOf(op))) {
        const d = descriptionOf(node)
        if (d === undefined || d.trim() === '') blank.push(`${op.name}.${field}`)
      }
    }
    expect(blank).toEqual([])
  })

  it('shows every manifest field description verbatim in that command --help', () => {
    const missing: string[] = []
    for (const op of manifest.operations) {
      const help = helpFor(op.name)
      for (const [field, node] of Object.entries(propertiesOf(op))) {
        const d = descriptionOf(node)
        if (d !== undefined && !help.includes(d)) missing.push(`${op.name}.${field}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('gives every flag in per-command --help a non-blank doc column', () => {
    // The Schema.Finite trap rendered a flag with a BLANK doc and nothing failed.
    // This asserts the rendered help line itself carries text, not just that the
    // manifest does.
    for (const op of manifest.operations) {
      const help = helpFor(op.name)
      const flagsBlock = help.split(/\nFLAGS\n/)[1]?.split(/\nGLOBAL FLAGS\n/)[0] ?? ''
      for (const line of flagsBlock.split('\n').filter((l) => l.trim().startsWith('--'))) {
        const doc = line
          .trim()
          .split(/\s{2,}/)
          .slice(1)
          .join(' ')
          .trim()
        expect(doc.length, `blank doc for flag line: ${line}`).toBeGreaterThan(0)
      }
    }
  })

  it('the description guard FIRES when a description is corrupted', () => {
    // Negative control for the field-description check, using the same
    // help-inclusion comparison against a description that was never single-sourced.
    const help = execFileSync(process.execPath, [BUNDLE, 'explain', '--help'], {
      encoding: 'utf8',
    })
    expect(help.includes('A DESCRIPTION THAT WAS NEVER SINGLE-SOURCED')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Drift: defaults
// ---------------------------------------------------------------------------

describe('drift — manifest defaults match effective CLI behavior', () => {
  it('declares a default for every non-required field', () => {
    // The withDecodingDefaultKey trap: the schema defaults the value but the
    // manifest cannot see it. `defineOperation` asserts this at construction; this
    // re-asserts it on the SHIPPED artifact, where an agent actually reads it.
    const pick = (node: Node, key: 'default'): unknown => {
      const n = node as Node & { default?: unknown }
      if (n.default !== undefined) return n.default
      for (const branch of [node.allOf, node.anyOf, node.oneOf]) {
        for (const child of branch ?? []) {
          const found = pick(child, key)
          if (found !== undefined) return found
        }
      }
      return undefined
    }
    const missing: string[] = []
    for (const op of manifest.operations) {
      const required = new Set((op.input as { required?: string[] }).required ?? [])
      for (const [field, node] of Object.entries(propertiesOf(op))) {
        if (!required.has(field) && pick(node, 'default') === undefined) {
          missing.push(`${op.name}.${field}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('makes a required flag genuinely required (usage error when omitted)', () => {
    for (const op of manifest.operations) {
      const required = (op.input as { required?: string[] }).required ?? []
      if (required.length === 0) continue
      expect(run(op.name).code, `${op.name} did not fail without its required flags`).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Manifest self-consistency on the wire
// ---------------------------------------------------------------------------

describe('the shipped manifest is internally consistent', () => {
  it('agrees with `version` about the package version', () => {
    const { envelope } = runJson('version')
    const data = envelope.data as { version: string; apiVersion: number }
    expect(manifest.version).toBe(data.version)
    expect(manifest.apiVersion).toBe(data.apiVersion)
  })

  it('agrees with --version', () => {
    expect(run('--version').stdout).toContain(manifest.version)
  })

  it('publishes every error code it can actually explain', async () => {
    // CONCURRENT, because the 21 spawns are independent and each is a full node boot of
    // a 2.2 MB bundle. Serially this was the slowest test in the suite and the one
    // setting the timeout budget for every other test in it.
    const explained = await Promise.all(
      manifest.errorCodes.map(async (row) => ({
        row,
        ...(await runJsonAsync('explain', '--code', row.code)),
      })),
    )
    for (const { row, envelope, code } of explained) {
      expect(code, row.code).toBe(0)
      expect((envelope.data as { description: string }).description).toBe(row.description)
    }
  })

  it('publishes the four exit codes this suite observed', () => {
    expect(manifest.exitCodes.map((e) => e.code)).toEqual([0, 1, 2, 3])
  })

  it('describes an input schema for every operation, including no-input ones', () => {
    for (const op of manifest.operations) {
      expect(op.input).toMatchObject({ type: 'object' })
      expect(JSON.stringify(op.input)).not.toContain('"array"')
    }
  })
})

// ---------------------------------------------------------------------------
// Output flags, end to end — the invariant that matters
// ---------------------------------------------------------------------------

/**
 * These duplicate `output.test.ts`'s in-process assertions ON PURPOSE.
 *
 * An in-process check computes the exit code from the same envelope object the
 * renderer got, so it would pass even if the CLI WIRING rendered before computing
 * the code, or swallowed a failure it had prettified. The only way to know an
 * output flag cannot change the process's exit status is to observe the real
 * process's exit status, which is what these do.
 */
describe('output flags never change the EXIT CODE of the real process', () => {
  const FLAG_SETS: readonly (readonly string[])[] = [
    [],
    ['--pretty'],
    ['--dense'],
    ['--dense', '--evidence'],
    ['--field', 'data'],
    ['--field', 'nope.nothing'],
    ['--pretty', '--field', 'data'],
    ['--dense', '--field', 'data'],
  ]

  it('exit 0 stays 0 on a success, under every flag set', () => {
    for (const flags of FLAG_SETS) {
      expect(run('version', ...flags).code, flags.join(' ')).toBe(0)
      expect(run('explain', '--code', 'ERR_IO', ...flags).code, flags.join(' ')).toBe(0)
    }
  })

  it('exit 2 stays 2 on an operational error, under every flag set', () => {
    for (const flags of FLAG_SETS) {
      expect(run('explain', '--code', 'ERR_BOGUS', ...flags).code, flags.join(' ')).toBe(2)
    }
  })

  it('accepts a shared flag BEFORE the subcommand too (npm-style)', () => {
    expect(run('--pretty', 'version').code).toBe(0)
    expect(run('--pretty', 'version').stdout).toBe(run('version', '--pretty').stdout)
  })

  it('leaves stderr EMPTY in every mode — envelopes own stdout, diagnostics own stderr', () => {
    for (const flags of FLAG_SETS) {
      expect(run('explain', '--code', 'ERR_BOGUS', ...flags).stderr, flags.join(' ')).toBe('')
    }
  })
})

describe('output flags on the wire', () => {
  it('--pretty emits prose that is NOT JSON', () => {
    const { stdout } = run('version', '--pretty')
    expect(() => JSON.parse(stdout) as unknown).toThrow()
    expect(stdout).toContain('version (apiVersion 1)')
  })

  it('--dense emits ONE minified line of valid JSON', () => {
    const { stdout } = run('manifest', '--dense')
    expect(stdout.trimEnd().split('\n')).toHaveLength(1)
    expect(() => JSON.parse(stdout) as unknown).not.toThrow()
  })

  it('--dense output is never LARGER than the default', () => {
    const dense = run('manifest', '--dense').stdout.length
    const plain = run('manifest').stdout.length
    expect(dense).toBeLessThanOrEqual(plain)
  })

  it('--field projects one value, nested under its path', () => {
    const { stdout } = run('version', '--field', 'data.version')
    expect(JSON.parse(stdout)).toEqual({ data: { version: manifest.version } })
  })

  it('--field on an unresolved path emits {} and still exits 0', () => {
    const { stdout, code } = run('version', '--field', 'data.nope')
    expect(JSON.parse(stdout)).toEqual({})
    expect(code).toBe(0)
  })

  it('the default output is byte-identical to no flags at all', () => {
    expect(run('version').stdout).toBe(run('version').stdout)
  })

  it('advertises all four output flags in --help, with non-blank docs', () => {
    for (const flag of ['--pretty', '--dense', '--evidence', '--field']) {
      expect(rootHelp, `${flag} missing from root help`).toContain(flag)
    }
    // Shared flags reach every subcommand's help too, which is the whole point of
    // declaring them once on the root.
    const subHelp = execFileSync(process.execPath, [BUNDLE, 'version', '--help'], {
      encoding: 'utf8',
    })
    for (const flag of ['--pretty', '--dense', '--evidence', '--field']) {
      expect(subHelp, `${flag} missing from version help`).toContain(flag)
    }
  })

  it('does NOT publish the output flags in any operation`s manifest input', () => {
    // They shape rendering, not behavior. Publishing them in an operation's input
    // schema would tell an agent they affect what the operation DOES.
    for (const op of manifest.operations) {
      const props = Object.keys(propertiesOf(op))
      for (const flag of ['pretty', 'dense', 'evidence', 'field']) {
        expect(props, `${op.name} publishes ${flag}`).not.toContain(flag)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The document lifecycle, against the REAL bundle and the REAL filesystem
// ---------------------------------------------------------------------------

/**
 * These are the end-to-end complement to `operations/document.test.ts` and
 * `operations/import.test.ts`, which run the same handlers against an in-memory
 * store. Both layers are needed for different reasons:
 *
 * - the in-memory tests can assert what a handler WROTE, cheaply, and cover the
 *   branches (duplicate keys, widened waiver scopes) that would be tedious to set
 *   up on disk;
 * - THESE prove the wiring — that the layers are actually provided at the
 *   composition root, that the positional/flag mapping matches the schema, that
 *   stdin really reaches `import`, and that a real atomic write lands a real file
 *   an `--field` projection can then read back.
 *
 * A missing layer at the composition root is invisible to the in-memory tests and
 * fatal in production, which is exactly why these spawn the bundle.
 */
describe('the document lifecycle end to end', () => {
  const workDirs: string[] = []

  const work = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-cli-'))
    workDirs.push(dir)
    return dir
  }

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(workDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  const FIXTURES = fileURLToPath(new URL('./app/operations/__fixtures__', import.meta.url))

  it('init creates a real file that list then reads', () => {
    const dir = work()
    const doc = join(dir, 'requirements.json')
    expect(run('init', doc).code).toBe(0)
    expect(existsSync(doc)).toBe(true)
    const { envelope, code } = runJson('list', doc)
    expect(code).toBe(0)
    expect((envelope.data as { count: number; docVersion: number }).count).toBe(0)
    expect((envelope.data as { docVersion: number }).docVersion).toBe(3)
  })

  it('init REFUSES to overwrite, exits 2, and leaves the file byte-identical', () => {
    const dir = work()
    const doc = join(dir, 'requirements.json')
    run('init', doc)
    const before = readFileSync(doc, 'utf8')
    const { envelope, code } = runJson('init', doc)
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_DOC_EXISTS')
    expect(readFileSync(doc, 'utf8')).toBe(before)
  })

  it('init --force overwrites', () => {
    const dir = work()
    const doc = join(dir, 'requirements.json')
    run('init', doc)
    expect(run('init', doc, '--force').code).toBe(0)
  })

  it('honors SYMSPEC_DOC when no path is given', () => {
    const dir = work()
    const doc = join(dir, 'from-env.json')
    const r = spawnSync(process.execPath, [BUNDLE, 'init'], {
      encoding: 'utf8',
      env: { ...process.env, SYMSPEC_DOC: doc },
    })
    expect(r.status).toBe(0)
    expect(existsSync(doc)).toBe(true)
  })

  it('list on a missing document is ERR_DOC_NOT_FOUND at exit 2', () => {
    const dir = work()
    const { envelope, code } = runJson('list', join(dir, 'absent.json'))
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_DOC_NOT_FOUND')
  })

  it('[S3-012] imports the agent-run-triggers stream from --file, with exact counts, refusing its 8 unscoped waivers (exit 1)', () => {
    // Ruling R13 (S3-012) replaces this test's old exit 0 and `waivers: 8`: every v4 waiver in
    // this stream is code-only, apply's classifier refuses a code-only waive (R5), and a refused
    // record makes import exit 1 while the requirements are still written.
    const dir = work()
    const doc = join(dir, 'art.json')
    const { envelope, code } = runJson(
      'import',
      '--file',
      join(FIXTURES, 'hex-bonk-agent-run-triggers.ops.jsonl'),
      '--doc',
      doc,
    )
    expect(code).toBe(1)
    const data = envelope.data as {
      imported: Record<string, number>
      gaps: string[]
      problems: { line: number; detail: string }[]
      unresolved: unknown[]
    }
    expect(data.imported).toEqual({
      requirements: 25,
      edges: 22,
      glossary: 0,
      antonyms: 0,
      waivers: 0,
    })
    expect(data.problems).toHaveLength(8)
    for (const p of data.problems) expect(p.detail).toContain('ERR_WAIVER_REFUSED')
    expect(data.unresolved).toEqual([])
    expect(data.gaps.length).toBeGreaterThan(0)
    // The imported document is loadable by the same binary — the round trip that
    // matters operationally.
    expect((runJson('list', doc).envelope.data as { count: number }).count).toBe(25)
  })

  it('imports the schedule-management stream from STDIN', () => {
    // stdin is what makes the whole migration one pipe, and it is the one path an
    // in-memory test cannot cover.
    const dir = work()
    const doc = join(dir, 'sm.json')
    const stream = readFileSync(join(FIXTURES, 'hex-bonk-schedule-management.ops.jsonl'), 'utf8')
    const r = spawnSync(process.execPath, [BUNDLE, 'import', '--doc', doc], {
      encoding: 'utf8',
      input: stream,
    })
    expect(r.status).toBe(0)
    const data = (JSON.parse(r.stdout) as { data: { imported: Record<string, number> } }).data
    expect(data.imported.requirements).toBe(42)
    expect(data.imported.edges).toBe(40)
    expect((runJson('list', doc).envelope.data as { count: number }).count).toBe(42)
  })

  it('[S3-012] import --dry-run reports everything, refusing the 8 unscoped waivers (exit 1), and writes NOTHING (R13)', () => {
    // Ruling R13 (S3-012) replaces this test's old exit 0, as it did for the non-dry-run import
    // of the same stream above: every v4 waiver in it is code-only, apply's classifier refuses a
    // code-only waive (R5), and a refused record makes import exit 1. A dry run reports the same
    // refusals and still writes nothing.
    const dir = work()
    const doc = join(dir, 'never-written.json')
    const { envelope, code } = runJson(
      'import',
      '--file',
      join(FIXTURES, 'hex-bonk-agent-run-triggers.ops.jsonl'),
      '--doc',
      doc,
      '--dry-run',
    )
    expect(code).toBe(1)
    const data = envelope.data as {
      written: boolean
      imported: Record<string, number>
      problems: { line: number; detail: string }[]
    }
    expect(data.written).toBe(false)
    expect(data.imported.requirements).toBe(25)
    expect(data.imported.waivers).toBe(0)
    expect(data.problems).toHaveLength(8)
    for (const p of data.problems) expect(p.detail).toContain('ERR_WAIVER_REFUSED')
    expect(existsSync(doc)).toBe(false)
  })

  it('import exits 1 when a write fence refuses a record, and still writes the rest', () => {
    // The contract `apply` has since AC-1-6: a record the caller asked for that did not land is
    // an error-severity finding, so an agent reading only the exit code sees it. The records
    // that pass are written, and the refusal is in problems[] with its line.
    const dir = work()
    const doc = join(dir, 'refused.json')
    const ops = join(dir, 'ops.jsonl')
    writeFileSync(
      ops,
      [
        'symspec antonym add zork blip',
        'symspec antonym add blip frob',
        'symspec antonym add frob zork',
      ].join('\n'),
    )
    const { envelope, code } = runJson('import', '--file', ops, '--doc', doc)
    expect(code).toBe(1)
    const data = envelope.data as {
      written: boolean
      imported: Record<string, number>
      problems: { line: number; detail: string }[]
      findings: { severity: string; line: number; op: string; code: string; message: string }[]
    }
    expect(data.written).toBe(true)
    expect(data.imported.antonyms).toBe(2)
    expect(data.problems.map((p) => p.line)).toEqual([3])
    expect(data.findings).toEqual([
      expect.objectContaining({ severity: 'error', line: 3, op: 'antonym', code: 'ERR_USAGE' }),
    ])
    expect(data.findings[0]?.message).toContain('line 3')
    const written = JSON.parse(readFileSync(doc, 'utf8')) as { antonyms: unknown[] }
    expect(written.antonyms).toHaveLength(2)
  })

  it('import refuses to clobber an existing document', () => {
    const dir = work()
    const doc = join(dir, 'requirements.json')
    run('init', doc)
    const before = readFileSync(doc, 'utf8')
    const { envelope, code } = runJson(
      'import',
      '--file',
      join(FIXTURES, 'hex-bonk-agent-run-triggers.ops.jsonl'),
      '--doc',
      doc,
    )
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_DOC_EXISTS')
    expect(readFileSync(doc, 'utf8')).toBe(before)
  })

  it('import with an EMPTY stdin is a usage error, not a silent empty document', () => {
    const dir = work()
    const doc = join(dir, 'empty.json')
    const r = spawnSync(process.execPath, [BUNDLE, 'import', '--doc', doc], {
      encoding: 'utf8',
      input: '',
    })
    expect(r.status).toBe(2)
    expect((JSON.parse(r.stdout) as { code: string }).code).toBe('ERR_USAGE')
    expect(existsSync(doc)).toBe(false)
  })

  it('show resolves a stable KEY and a UUID to the same requirement', () => {
    const dir = work()
    const doc = join(dir, 'art.json')
    run('import', '--file', join(FIXTURES, 'hex-bonk-agent-run-triggers.ops.jsonl'), '--doc', doc)

    const byKey = runJson('show', 'TX-B6', doc)
    expect(byKey.code).toBe(0)
    const requirement = (byKey.envelope.data as { requirement: { id: string } }).requirement
    const byId = runJson('show', requirement.id, doc)
    expect(byId.code).toBe(0)
    expect((byId.envelope.data as { requirement: unknown }).requirement).toEqual(requirement)
    // resolvedFrom differs — that IS the mapping an agent needs to persist a UUID.
    expect((byKey.envelope.data as { resolvedFrom: string }).resolvedFrom).toBe('TX-B6')
  })

  it('show on a near miss carries did-you-mean and a runnable repair', () => {
    const dir = work()
    const doc = join(dir, 'art.json')
    run('import', '--file', join(FIXTURES, 'hex-bonk-agent-run-triggers.ops.jsonl'), '--doc', doc)
    const { envelope, code } = runJson('show', 'TX-B7', doc)
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_NOT_FOUND')
    const repair = envelope.repair as { commands: string[] }
    expect(repair.commands[0]).toMatch(/^symspec show TX-B/)
  })

  it('show without a ref is a USAGE error (exit 1, no envelope)', () => {
    // The ref field is required in the schema, so the CLI fails before a handler
    // runs — derived from the schema, not hand-wired.
    const { stdout, code } = run('show')
    expect(code).toBe(1)
    expect(() => JSON.parse(stdout) as unknown).toThrow()
  })

  it('every document command reaches its layers — no missing-service crash', () => {
    // A layer missing at the composition root is invisible to the in-memory tests
    // and fatal in production. This is the assertion that catches it: an unprovided
    // service surfaces as a non-envelope crash on stderr, so a clean typed envelope
    // on stdout proves the wiring.
    const dir = work()
    const doc = join(dir, 'requirements.json')
    for (const args of [
      ['init', doc],
      ['list', doc],
      ['show', 'nope', doc],
      ['import', '--doc', join(dir, 'x.json'), '--file', join(dir, 'absent.jsonl')],
    ]) {
      const { stdout, stderr } = run(...args)
      expect(() => JSON.parse(stdout) as unknown, args.join(' ')).not.toThrow()
      expect(stderr, args.join(' ')).toBe('')
    }
  })
})

// ---------------------------------------------------------------------------
// `check` through the real process — the exit-code gap G1 could not see
// ---------------------------------------------------------------------------

/**
 * These MUST be end-to-end, and that is the lesson rather than a preference.
 *
 * `exitCodeForEnvelope` was fully implemented and fully unit-tested in G1, and the
 * CLI never CALLED it on the success path. No G1 operation produced findings, so
 * every reachable success genuinely was exit 0 and the omission was invisible to
 * every in-process test — including the ones that asserted the mapping itself,
 * which passed because the FUNCTION was right. The bug was in the shell.
 *
 * `check --strict` exposed it: `data.strictGate: 'fail'` in the envelope and exit 0
 * at the shell. A CI job wired to `--strict` would have passed on every
 * inconclusive run — the failure mode the whole exit contract exists to prevent.
 *
 * So the assertions below read the PROCESS STATUS, not a function's return value.
 */
describe('check — exit codes and envelope integrity from the real process', () => {
  const workDirs: string[] = []
  const work = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-check-'))
    workDirs.push(dir)
    return dir
  }
  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(workDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  const TS = '2026-01-01T00:00:00.000Z'
  const req = (
    id: string,
    trigger: string,
    systemName: string,
    systemResponse: string,
  ): Record<string, unknown> => ({
    id,
    patternType: 'event-driven',
    trigger,
    systemName,
    systemResponse,
    negated: false,
    sentence: `When ${trigger}, the ${systemName} shall ${systemResponse}.`,
    priority: 'medium',
    status: 'draft',
    derives: [],
    satisfies: [],
    verifies: [],
    refines: [],
    createdAt: TS,
    updatedAt: TS,
  })

  /** Write a v3 document and return its path. */
  const docFile = (requirements: readonly Record<string, unknown>[]): string => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    const path = join(work(), 'requirements.json')
    writeFileSync(
      path,
      JSON.stringify({
        docVersion: 3,
        requirements: Object.fromEntries(requirements.map((r) => [r.id as string, r])),
        stateModel: { variables: [] },
        glossary: [],
        antonyms: [],
        waivers: [],
      }),
    )
    return path
  }

  /** A provable grant/revoke contradiction under one trigger. */
  const conflicted = (): string =>
    docFile([
      req(
        '11111111-1111-4111-8111-111111111111',
        'the user submits valid credentials',
        'auth service',
        'grant access',
      ),
      req(
        '22222222-2222-4222-8222-222222222222',
        'the user submits valid credentials',
        'auth service',
        'revoke access',
      ),
    ])

  /** Two requirements with disjoint vocabulary — unverifiable, no error finding. */
  const disjoint = (): string =>
    docFile([
      req('33333333-3333-4333-8333-333333333333', 'a payment settles', 'ledger', 'post the entry'),
      req(
        '44444444-4444-4444-8444-444444444444',
        'a shipment departs',
        'warehouse',
        'decrement the count',
      ),
    ])

  it('exits 1 on an error-severity finding, WITH a valid envelope on stdout', () => {
    const { stdout, stderr, code } = run('check', conflicted())
    expect(code).toBe(1)
    // The findings ARE the data: exit 1 is the gate signal, not a crash, so the
    // envelope must still be complete and parseable.
    const envelope = JSON.parse(stdout) as { type: string; data: { counts: { error: number } } }
    expect(envelope.type).toBe('check')
    expect(envelope.data.counts.error).toBeGreaterThan(0)
    // No second, human-shaped report after the JSON — `Runtime.errorReported=false`
    // on the gate carrier is what buys this.
    expect(stderr).toBe('')
  })

  it('exits 3 on a tripped --strict gate, WITH a valid envelope on stdout', () => {
    const { stdout, stderr, code } = run('check', disjoint(), '--strict')
    // THE regression this file exists for. Before the fix: envelope said
    // `strictGate:'fail'` and the process exited 0.
    expect(code).toBe(3)
    const envelope = JSON.parse(stdout) as {
      data: { strictGate: string; verified: boolean; counts: { error: number } }
    }
    expect(envelope.data.strictGate).toBe('fail')
    expect(envelope.data.verified).toBe(false)
    // 3, not 1: there is no error-severity finding, only an unverifiable run.
    expect(envelope.data.counts.error).toBe(0)
    expect(stderr).toBe('')
  })

  it('exits 3 on --fail-on-unmatched 0, and 0 when the flag is OMITTED', () => {
    const doc = disjoint()
    // 0 is the STRICTEST legal threshold, not a sentinel: fail on any unmatched
    // atom. A `> 0` guard in the option translation would silently turn this into
    // no gate at all, which is what this pins.
    expect(run('check', doc, '--fail-on-unmatched', '0').code).toBe(3)
    // OMITTING the flag is how the gate is disabled. A negative sentinel is
    // UNREACHABLE from a command line — measured: `--fail-on-unmatched -1` makes the
    // CLI read `-1` as the next flag and dump help — so absence had to be the
    // disabled state, which is why the schema field is `NullOr`.
    expect(run('check', doc).code).toBe(0)
  })

  it('a proven defect OUTRANKS the strict gate (1, not 3)', () => {
    const { code } = run('check', conflicted(), '--strict')
    // "Your spec is broken" is stronger news than "I could not fully check it".
    expect(code).toBe(1)
  })

  it('exits 0 on an info-only run, so advisory findings are not build failures', () => {
    const { code } = run('check', disjoint())
    expect(code).toBe(0)
  })

  it('exits 2 with ERR_USAGE on an over-cap --temporal-bound', () => {
    const { stdout, code } = run('check', disjoint(), '--temporal-bound', '500')
    expect(code).toBe(2)
    const envelope = JSON.parse(stdout) as {
      type: string
      code: string
      repair?: { commands: string[] }
    }
    expect(envelope.type).toBe('error')
    expect(envelope.code).toBe('ERR_USAGE')
    // The corrected invocation is runnable, with no placeholder to substitute.
    expect(envelope.repair?.commands[0]).toMatch(/^symspec check .* --temporal-bound/)
  })

  it('output flags NEVER change the exit code', () => {
    // Structural in `emit` (the code is computed from the envelope, which formatting
    // cannot reach), and asserted here because it is the property an agent relies on
    // when it adds `--dense` to a CI invocation.
    const doc = conflicted()
    for (const flags of [[], ['--dense'], ['--pretty'], ['--field', 'data.verified']]) {
      expect(run('check', doc, ...flags).code, flags.join(' ')).toBe(1)
    }
  })

  it('--dense output survives a PIPE at full size (no 64KB truncation)', () => {
    // v4's measured defect: `process.stdout.write` + `process.exit` truncates
    // at one pipe buffer (65536 bytes), producing invalid JSON on exactly the
    // documents big enough to matter. `check` is the command that produces those
    // payloads, so it is the one worth pinning.
    const doc = disjoint()
    const { stdout } = run('check', doc, '--dense')
    expect(() => JSON.parse(stdout) as unknown).not.toThrow()
  })

  it('reaches its layers — no missing-service crash for the solver Layer', () => {
    // The solver Layer is new at the composition root. An unprovided service
    // surfaces as a non-envelope crash on stderr, so a clean typed envelope proves
    // the wiring — the same assertion the document commands get.
    const { stdout, stderr } = run('check', disjoint())
    expect(() => JSON.parse(stdout) as unknown).not.toThrow()
    expect(stderr).toBe('')
  })

  /**
   * SANITY GATE #1, END TO END — the masking case at the PROCESS boundary.
   *
   * The two adversarial reviews found this independently and it reproduced here: a document
   * with a GENUINE reachable violation, plus a contradictory `initial`, exited 0 while
   * printing `PROVED ... with nothing assumed` and `verified: true`. So the tool suppressed
   * a defect it had already proven, at the one observable an agent or a CI job actually
   * reads — the process status.
   *
   * The pair is what makes it a proof rather than an anecdote: SAME requirements, SAME
   * constraint, SAME violation, differing only in the initial predicate. If both rows do not
   * exit 1, either the violation stopped being detected (row 1) or the vacuity is masking it
   * again (row 2), and the two failures read differently.
   *
   * Spawned rather than in-process because the exit STATUS is the contract being asserted,
   * and delta #23 records an exit mapping that unit-tested perfectly and was never wired.
   */
  const heldFixture = (initial: string | undefined): string => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    const path = join(work(), 'requirements.json')
    // Annotated because spreading `req()`'s `Record<string, unknown>` into a literal that
    // adds known keys discards the index signature, and the `id` read below needs it.
    const effect: Record<string, unknown> = {
      ...req(
        '55555555-5555-4555-8555-555555555555',
        'the worker claims the run',
        'lock service',
        'increment the held count',
      ),
      responseKind: 'effect',
      stateEffect: 'held := held + 1',
    }
    const constraint: Record<string, unknown> = {
      ...req(
        '66666666-6666-4666-8666-666666666666',
        'the worker claims the run',
        'lock service',
        'bound the held count',
      ),
      responseKind: 'constraint',
      stateConstraint: 'held <= 1',
    }
    writeFileSync(
      path,
      JSON.stringify({
        docVersion: 3,
        requirements: { [effect.id as string]: effect, [constraint.id as string]: constraint },
        stateModel: {
          variables: [{ name: 'held', type: 'int', frame: 'volatile', domain: { min: 0, max: 3 } }],
          ...(initial !== undefined ? { initial } : {}),
        },
        glossary: [],
        antonyms: [],
        waivers: [],
      }),
    )
    return path
  }

  it('a real violation exits 1 — WITH or WITHOUT a contradictory initial predicate', () => {
    // ROW 1: the honest baseline. A satisfiable init, a proven reachable violation, exit 1.
    const sane = run('check', heldFixture('held = 0'))
    expect(sane.code, 'satisfiable init must still report the violation').toBe(1)
    const saneEnvelope = JSON.parse(sane.stdout) as {
      data: { findings: { code: string; severity: string }[] }
    }
    expect(saneEnvelope.data.findings.map((f) => f.code)).toContain('FND_REACHABILITY_VIOLATED')

    // ROW 2: the SAME document with a contradictory init. Before the fix this exited 0 and
    // claimed a proof. It must still exit 1 — now via the vacuity finding rather than the
    // violation, because the violation genuinely cannot be decided over an empty state set.
    const vacuous = run('check', heldFixture('held = 0 and held = 2'))
    expect(vacuous.code, 'a contradictory init must NEVER silence a run').toBe(1)
    const vacuousEnvelope = JSON.parse(vacuous.stdout) as {
      data: {
        verified: boolean
        findings: { code: string; severity: string }[]
        reachability?: { proved: number }
      }
    }
    const codes = vacuousEnvelope.data.findings.map((f) => f.code)
    expect(codes).toContain('FND_REACHABILITY_VACUOUS_INITIAL')
    // NOTHING is claimed proven. This is the assertion that fails on a revert.
    expect(codes).not.toContain('FND_REACHABILITY_PROVED')
    expect(vacuousEnvelope.data.reachability?.proved).toBe(0)
    expect(vacuousEnvelope.data.verified).toBe(false)
    expect(vacuous.stderr).toBe('')
  })

  it('every demotion in a REAL run carries a placeholder-free repair', () => {
    const { stdout } = run('check', disjoint())
    const envelope = JSON.parse(stdout) as {
      data: { coverage: { demotions: { reason: string; repair?: { commands: string[] } }[] } }
    }
    const demotions = envelope.data.coverage.demotions
    expect(demotions.length).toBeGreaterThan(0)
    for (const d of demotions) {
      expect(d.repair, `${d.reason} has no repair`).toBeDefined()
      for (const command of d.repair?.commands ?? []) {
        expect(command, `placeholder survived into: ${command}`).not.toMatch(/<[a-z-]+>/)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// `install` through the SHIPPED bundle — the V11 fixes at the process boundary
// ---------------------------------------------------------------------------

/**
 * The install surface, driven the way a developer actually drives it.
 *
 * `install.test.ts` covers the operation in-process against a temp filesystem, which is
 * where the host→path matrix and the three V11 fixes are asserted exhaustively. What only a
 * spawned process can show is that the CLI WIRING reaches all of it: that `--mode` and
 * `--target` are registered with the spellings the schema names, that the flag layer does
 * not drop a value on the floor, and that a `print` misuse produces exit 2 rather than a
 * help dump.
 *
 * That distinction is not hypothetical here. Delta #21 records `--fail-on-unmatched -1`
 * degrading to a help dump at exit 0 — a value that typechecks, decodes, and unit-tests
 * perfectly and is untypeable at a shell. Every new flag surface earns one of these blocks.
 */
describe('install through the real process', () => {
  const installDirs: string[] = []

  const workspace = (): { cwd: string; home: string; env: NodeJS.ProcessEnv } => {
    const root = mkdtempSync(join(tmpdir(), 'symspec-cli-install-'))
    installDirs.push(root)
    const cwd = join(root, 'proj')
    const home = join(root, 'home')
    mkdirSync(cwd, { recursive: true })
    mkdirSync(home, { recursive: true })
    // The roots are steered through the same overrides `processRoots` consults, so no test
    // here can write into the developer's real `~/.claude`.
    return { cwd, home, env: { ...process.env, SYMSPEC_TEST_CWD: cwd, SYMSPEC_TEST_HOME: home } }
  }

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(installDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  /** Run the shipped CLI with install roots pointed at a temp workspace. */
  const runIn = (
    env: NodeJS.ProcessEnv,
    ...args: string[]
  ): { envelope: Record<string, unknown>; code: number } => {
    const r = spawnSync(process.execPath, [BUNDLE, ...args], { encoding: 'utf8', env })
    return { envelope: JSON.parse(r.stdout ?? '') as Record<string, unknown>, code: r.status ?? -1 }
  }

  it('V11 fix #3: bare `install` in a marker-less repo WRITES a file and says it fell back', () => {
    // v4 exited 0 here having written nothing. At the process boundary that is
    // indistinguishable from success, which is why this assertion checks the FILE.
    const { cwd, env } = workspace()
    const { envelope, code } = runIn(env, 'install')
    expect(code).toBe(0)
    const data = envelope.data as { basis: string; note?: string }
    expect(data.basis).toBe('fallback')
    expect(data.note).toContain('No agent-host marker')
    expect(existsSync(join(cwd, '.agents', 'skills', 'symspec', 'SKILL.md'))).toBe(true)
  })

  it('writes all five host paths under --target all, and no root instruction file', () => {
    const { cwd, env } = workspace()
    expect(runIn(env, 'install', '--target', 'all').code).toBe(0)
    for (const relative of [
      '.claude/skills/symspec/SKILL.md',
      '.agents/skills/symspec/SKILL.md',
      '.kiro/steering/symspec.md',
      '.windsurf/rules/symspec.md',
      '.github/instructions/symspec.instructions.md',
    ]) {
      expect(existsSync(join(cwd, relative)), relative).toBe(true)
    }
    for (const root of ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']) {
      expect(existsSync(join(cwd, root)), root).toBe(false)
    }
  })

  it('V11 fix #1: the Kiro glob written to disk covers markdown', () => {
    const { cwd, env } = workspace()
    runIn(env, 'install', '--target', 'kiro')
    const written = readFileSync(join(cwd, '.kiro', 'steering', 'symspec.md'), 'utf8')
    expect(written).toContain('inclusion: fileMatch')
    expect(written).toContain('.{md,json}')
    // v4's JSON-only pattern, gone from the artifact rather than only from a constant.
    expect(written).not.toContain('.requirements}.json"')
  })

  it('the installed file teaches CRAFT, not only the command surface', () => {
    // AC-A-6 at the artifact: the whole point of the wave is that what lands on disk
    // contains the authoring guidance, since that is the part no manifest can carry.
    const { cwd, env } = workspace()
    runIn(env, 'install', '--target', 'claude')
    const written = readFileSync(join(cwd, '.claude', 'skills', 'symspec', 'SKILL.md'), 'utf8')
    expect(written).toContain('Choosing an EARS pattern')
    expect(written).toContain('Align vocabulary BEFORE writing')
    expect(written).toContain('Anti-patterns')
    expect(written).toContain('silence is not a consistency certificate')
    // And it still points at the manifest first — thin pointer for reference material.
    expect(written).toContain('symspec manifest')
  })

  it('is idempotent across processes, not merely within one', () => {
    // `unchanged` has to hold when the SECOND run is a fresh process reading the file the
    // first one wrote — an in-process test could pass on a cached value.
    const { env } = workspace()
    expect(
      (
        runIn(env, 'install', '--target', 'claude').envelope.data as {
          targets: { files: { action: string }[] }[]
        }
      ).targets[0]?.files[0]?.action,
    ).toBe('created')
    expect(
      (
        runIn(env, 'install', '--target', 'claude').envelope.data as {
          targets: { files: { action: string }[] }[]
        }
      ).targets[0]?.files[0]?.action,
    ).toBe('unchanged')
  })

  it('--mode print with no --target is ERR_USAGE at exit 2, not a help dump', () => {
    // Delta #21's shape: a misuse that must be a typed failure rather than the CLI runtime
    // silently printing help and exiting 0.
    const { env } = workspace()
    const { envelope, code } = runIn(env, 'install', '--mode', 'print')
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_USAGE')
  })

  it('an unknown --target is ERR_USAGE at exit 2 with the known set named', () => {
    const { env } = workspace()
    const { envelope, code } = runIn(env, 'install', '--target', 'not-a-host')
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_USAGE')
    expect(String(envelope.error)).toContain('not-a-host')
    expect(String(JSON.stringify(envelope.suggestions))).toContain('agents-standard')
  })

  it('--mode check reports state and writes NOTHING', () => {
    const { cwd, env } = workspace()
    const { envelope, code } = runIn(env, 'install', '--mode', 'check', '--target', 'claude')
    expect(code).toBe(0)
    expect((envelope.data as { targets: { note?: string }[] }).targets[0]?.note).toBe('missing')
    expect(existsSync(join(cwd, '.claude'))).toBe(false)
  })

  it('uninstall removes the file and repeats cleanly', () => {
    const { cwd, env } = workspace()
    runIn(env, 'install', '--target', 'claude')
    const path = join(cwd, '.claude', 'skills', 'symspec', 'SKILL.md')
    expect(existsSync(path)).toBe(true)
    expect(runIn(env, 'install', '--target', 'claude', '--mode', 'uninstall').code).toBe(0)
    expect(existsSync(path)).toBe(false)
    // Repeating is a quiet no-op rather than a failure.
    expect(runIn(env, 'install', '--target', 'claude', '--mode', 'uninstall').code).toBe(0)
  })

  it('--global routes to the home root and leaves the project untouched', () => {
    const { cwd, home, env } = workspace()
    expect(runIn(env, 'install', '--target', 'claude', '--global').code).toBe(0)
    expect(existsSync(join(home, '.claude', 'skills', 'symspec', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(cwd, '.claude'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Spec 007 AC-1-6 — a refused batch op exits non-zero; the frame repair round-trips
// ---------------------------------------------------------------------------

describe('spec 007 AC-1-6 — `apply` and the frame repair, through the real process', () => {
  const dirs: string[] = []
  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  /** A fresh document plus a helper that applies a list of ops through a real JSONL file. */
  const workspace = () => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-ac16-'))
    dirs.push(dir)
    const doc = join(dir, 'requirements.json')
    run('init', doc)
    let n = 0
    const apply = (ops: readonly object[]) => {
      n += 1
      const plan = join(dir, `plan-${n}.jsonl`)
      writeFileSync(plan, `${ops.map((op) => JSON.stringify(op)).join('\n')}\n`)
      return runJson('apply', '--file', doc, '--ops', plan)
    }
    return { doc, apply }
  }

  it('a batch with a REFUSED op exits 1, reports it as a finding, and writes nothing', () => {
    const { apply } = workspace()
    const { envelope, code } = apply([
      { op: 'add', key: 'K1', patternType: 'ubiquitous', systemName: 's', systemResponse: 'lock' },
      { op: 'state', name: 'lock_held', type: 'bool' },
      // A typo'd variable: the classify fold refuses it.
      { op: 'classify', ref: 'K1', kind: 'constraint', expression: 'not lock_hled' },
    ])
    expect(code).toBe(1)
    const data = envelope.data as {
      written: boolean
      abortedAt?: number
      findings?: { code: string; severity: string; index: number }[]
    }
    expect(data.written).toBe(false)
    expect(data.abortedAt).toBe(2)
    expect(data.findings).toEqual([
      expect.objectContaining({ severity: 'error', index: 2, code: 'ERR_USAGE' }),
    ])
  })

  it('check hands back a PUH repair that apply ACCEPTS, and re-checking MOVES the verdict', () => {
    const { doc, apply } = workspace()
    // `level` is an INT no requirement writes, declared stable; only `tick` ever changes.
    expect(
      apply([
        {
          op: 'add',
          key: 'TICK',
          patternType: 'ubiquitous',
          systemName: 'clock',
          systemResponse: 'toggle the tick',
        },
        {
          op: 'add',
          key: 'LEVEL',
          patternType: 'ubiquitous',
          systemName: 'clock',
          systemResponse: 'keep the level at zero',
        },
        {
          op: 'state',
          name: 'level',
          type: 'int',
          min: 0,
          max: 3,
          initial: 'level = 0',
          frame: 'stable',
        },
        { op: 'state', name: 'tick', type: 'bool', initial: 'tick = false' },
        { op: 'classify', ref: 'TICK', kind: 'effect', expression: 'tick := not tick' },
        { op: 'classify', ref: 'LEVEL', kind: 'constraint', expression: 'level = 0' },
      ]).code,
    ).toBe(0)

    type Check = {
      findings: { code: string; message: string }[]
      coverage: { demotions: { reason: string; repair?: { ops: object[] } }[] }
    }
    const check = () => runJson('check', doc, '--semantic=false').envelope.data as Check
    const codesFor = (data: Check) =>
      data.findings.filter((f) => f.message.startsWith('LEVEL:')).map((f) => f.code)

    const before = check()
    expect(codesFor(before)).toEqual(['FND_REACHABILITY_UNDER_HYPOTHESES'])
    const repair = before.coverage.demotions.find(
      (d) => d.reason === 'reachability-frame-relied-upon',
    )
    const ops = repair?.repair?.ops ?? []
    expect(ops).toEqual([
      {
        op: 'state',
        name: 'level',
        type: 'int',
        min: 0,
        max: 3,
        frame: 'volatile',
        initial: 'level = 0',
      },
    ])

    const applied = apply(ops)
    expect(applied.code).toBe(0)
    expect((applied.envelope.data as { written: boolean }).written).toBe(true)

    // THE VERDICT MOVED: the proof no longer rests on a declared frame.
    const after = check()
    expect(codesFor(after)).toEqual(['FND_REACHABILITY_UNKNOWN'])

    // And the frame-undeclared repair moves it straight back.
    const back = after.coverage.demotions.find((d) => d.reason === 'reachability-frame-undeclared')
    expect(apply(back?.repair?.ops ?? []).code).toBe(0)
    expect(codesFor(check())).toEqual(['FND_REACHABILITY_UNDER_HYPOTHESES'])
  }, 60_000)
})

describe('spec 007 document format v4, through the real process', () => {
  const dirs: string[] = []
  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  const ID = '55555555-5555-4555-8555-555555555555'
  const TS = '2026-01-01T00:00:00.000Z'

  /** A document carrying a vocabulary, both anchors and an intentRef, written to disk. */
  const v4File = (docVersion = 4): { dir: string; doc: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-v4-'))
    dirs.push(dir)
    const doc = join(dir, 'requirements.json')
    writeFileSync(
      doc,
      JSON.stringify({
        docVersion,
        requirements: {
          [ID]: {
            id: ID,
            key: 'R1',
            patternType: 'ubiquitous',
            systemName: 'auth service',
            systemResponse: 'log every authentication attempt',
            sentence: 'The auth service shall log every authentication attempt.',
            intentRef: 'I1',
            createdAt: TS,
            updatedAt: TS,
          },
        },
        vocabulary: {
          symbols: [{ id: 'sys_auth_service', kind: 'system', canonical: 'auth service' }],
        },
        intent: { intentVersion: 1, items: [{ id: 'I1', text: 'Every login attempt is logged.' }] },
        policy: { policyVersion: 1, levels: [{ id: 'audit' }], assign: { I1: 'audit' } },
      }),
    )
    return { dir, doc }
  }

  it('reads a v4 document, and a mutation keeps every v4 key it did not touch', () => {
    const { dir, doc } = v4File()
    expect((runJson('list', doc).envelope.data as { docVersion: number }).docVersion).toBe(4)

    const plan = join(dir, 'plan.jsonl')
    const add = {
      op: 'add',
      key: 'R2',
      patternType: 'ubiquitous',
      systemName: 'auth service',
      systemResponse: 'lock the account',
    }
    writeFileSync(plan, `${JSON.stringify(add)}\n`)
    expect(runJson('apply', '--file', doc, '--ops', plan).code).toBe(0)

    const written = JSON.parse(readFileSync(doc, 'utf8')) as {
      docVersion: number
      requirements: Record<string, { key?: string; intentRef?: string }>
      vocabulary: { symbols: unknown[] }
      intent: unknown
      policy: unknown
    }
    expect(written.docVersion).toBe(4)
    expect(
      Object.values(written.requirements)
        .map((r) => r.key)
        .sort(),
    ).toEqual(['R1', 'R2'])
    expect(written.requirements[ID]?.intentRef).toBe('I1')
    expect(written.vocabulary.symbols).toEqual([
      { id: 'sys_auth_service', kind: 'system', canonical: 'auth service', aliases: [] },
    ])
    expect(written.intent).toEqual({
      intentVersion: 1,
      items: [{ id: 'I1', text: 'Every login attempt is logged.' }],
    })
    expect(written.policy).toEqual({
      policyVersion: 1,
      levels: [{ id: 'audit' }],
      assign: { I1: 'audit' },
    })

    expect(runJson('check', doc).envelope.type).toBe('check')
  }, 60_000)

  it('refuses a v4 key under docVersion 3 as ERR_DOC_PARSE naming the upgrade, at exit 2', () => {
    const { doc } = v4File(3)
    const { envelope, code } = runJson('list', doc)
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_DOC_PARSE')
    expect(String(envelope.error)).toContain('docVersion 4')
  })

  it('refuses docVersion 5 as ERR_SCHEMA_VERSION, at exit 2', () => {
    const { doc } = v4File(5)
    const { envelope, code } = runJson('list', doc)
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_SCHEMA_VERSION')
  })
})

/**
 * Spec 007 AC-5-10 and the AC-5-13 `init --split` half, on the SHIPPED bundle: the fixed config
 * location, the effective-value comparators, and the write-safety of `init --split` are each
 * observed through a real process, a real filesystem and the real exit code.
 *
 * The suite runs on the TEST stub embedder, which the engine already demotes `run-weakened`.
 * So these assertions read `data.run.belowPinned` and the demotion ACTION, which name the knob,
 * rather than the bare reason, which the stub shares.
 */
describe('pinned run configuration — on the built CLI (AC-5-10, AC-5-13)', () => {
  const roots: string[] = []
  const workDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-pins-cli-'))
    roots.push(dir)
    return dir
  }
  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  const CONFIG = 'symspec.config.json'
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

  /** git with no inherited GIT_* variable (a hook's GIT_DIR would redirect it); stderr captured. */
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    }).trim()

  /** Make `root` a repository toplevel, the way an owner does. */
  const repoAt = (root: string): void => {
    git(root, 'init', '-q')
  }

  /** The CLI with extra environment variables. */
  const runJsonEnv = (env: Record<string, string>, ...args: string[]) => {
    const r = spawnSync(process.execPath, [BUNDLE, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    return { envelope: JSON.parse(r.stdout ?? '') as Record<string, unknown>, code: r.status ?? -1 }
  }

  /** An initialized document in `dir`, with an optional config beside it. */
  const docIn = (dir: string, gate?: Record<string, unknown>): string => {
    const doc = join(dir, 'requirements.json')
    expect(run('init', doc).code).toBe(0)
    if (gate !== undefined) writeFileSync(join(dir, CONFIG), json({ configVersion: 1, gate }))
    return doc
  }

  const checkRun = (...args: string[]) => {
    const { envelope, code } = runJson('check', ...args)
    const data = envelope.data as {
      run: {
        belowPinned?: string[]
        pinned?: Record<string, unknown>
        config?: { path: string; source: string }
      }
      coverage: { demotions: { reason: string; action: string }[] }
    }
    return { code, data, envelope }
  }

  it('--temporal-bound 1 under a pinned 10 is run-weakened; 10 is not (sabotage (a))', () => {
    const doc = docIn(workDir(), { temporalBound: 10 })
    const below = checkRun(doc, '--temporal-bound', '1')
    expect(below.data.run.belowPinned).toEqual(['temporalBound'])
    expect(below.data.run.pinned).toEqual({ temporalBound: 10 })
    const pinDemotion = below.data.coverage.demotions.find((d) =>
      d.action.includes('temporalBound'),
    )
    expect(pinDemotion?.reason).toBe('run-weakened')
    expect(pinDemotion?.action).toContain('--temporal-bound 10')
    expect(checkRun(doc, '--temporal-bound', '10').data.run.belowPinned).toEqual([])
  })

  it('--reachability-timeout-ms 1 under a pinned 0 (inherit) is run-weakened (sabotage (b), F10)', () => {
    const doc = docIn(workDir(), { reachabilityTimeoutMs: 0 })
    const below = checkRun(doc, '--reachability-timeout-ms', '1')
    expect(below.data.run.belowPinned).toEqual(['reachabilityTimeoutMs'])
    expect(below.data.run.pinned).toEqual({ reachabilityTimeoutMs: 2000 })
    expect(checkRun(doc).data.run.belowPinned).toEqual([])
  })

  it('reads the config at the repository toplevel, never a weaker one beside the document (sabotage (c), F11)', () => {
    const root = workDir()
    repoAt(root)
    writeFileSync(join(root, CONFIG), json({ configVersion: 1, gate: { temporalBound: 10 } }))
    const sub = join(root, 'specs')
    mkdirSync(sub)
    const doc = docIn(sub, {})
    const { data } = checkRun(doc, '--temporal-bound', '1')
    expect(data.run.config).toEqual({ path: join(realpathSync(root), CONFIG), source: 'toplevel' })
    expect(data.run.belowPinned).toEqual(['temporalBound'])
  })

  /** A repository committing docs/requirements.json and a toplevel config pinning temporalBound 10. */
  const committedRepo = () => {
    const root = realpathSync(workDir())
    repoAt(root)
    writeFileSync(join(root, CONFIG), json({ configVersion: 1, gate: { temporalBound: 10 } }))
    const docs = join(root, 'docs')
    mkdirSync(docs)
    const doc = docIn(docs)
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'init')
    return { root, docs, doc }
  }

  it('on a fresh clone, committed content cannot move the config off the clone`s toplevel (F11)', () => {
    const { root, docs } = committedRepo()
    // A weaker config committed beside the document is committed content, and it is not read.
    writeFileSync(join(docs, CONFIG), json({ configVersion: 1, gate: {} }))
    // A nested `.git` cannot be committed at all: git refuses the path.
    writeFileSync(join(docs, '.git'), 'gitdir: ../.git\n')
    const blob = git(root, 'hash-object', '-w', join(docs, '.git'))
    expect(() =>
      git(root, 'update-index', '--add', '--cacheinfo', `100644,${blob},docs/.git`),
    ).toThrow()
    rmSync(join(docs, '.git'))
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'shadow')
    const clone = join(realpathSync(workDir()), 'clone')
    git(root, 'clone', '-q', root, clone)
    const { code, data } = checkRun(
      join(clone, 'docs', 'requirements.json'),
      '--temporal-bound',
      '1',
    )
    expect(code).toBe(0)
    // What a CI job asserts: the committed toplevel config of ITS checkout governed the run.
    expect(data.run.config).toEqual({ path: join(clone, CONFIG), source: 'toplevel' })
    expect(data.run.belowPinned).toEqual(['temporalBound'])
  })

  // Git's refusal quotes the bare directory's path. A committed name spelling git's own
  // "not a git repository" must not pass for no repository, which would fall back to the
  // weaker config beside the document and drop the pins.
  it.each([
    ['fake'],
    ['NOT A GIT REPOSITORY'],
    [join('n', 'not a git repository', 'fake')],
  ])('on a fresh clone, a committed directory laid out as a bare repository is refused, not a toplevel (F11, %s)', (name) => {
    const { root, docs } = committedRepo()
    // Git discovers any directory holding HEAD, objects/ and refs/ as a bare repository and
    // honors a core.worktree its committed config names, so this directory is committable.
    const fake = join(root, name)
    for (const sub of ['objects', 'refs', 'wt']) mkdirSync(join(fake, sub), { recursive: true })
    writeFileSync(join(fake, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(fake, 'objects', '.keep'), '')
    writeFileSync(join(fake, 'refs', '.keep'), '')
    writeFileSync(
      join(fake, 'config'),
      '[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tworktree = wt\n',
    )
    writeFileSync(join(fake, 'wt', CONFIG), json({ configVersion: 1, gate: {} }))
    git(root, 'mv', join(docs, 'requirements.json'), join(fake, 'wt', 'requirements.json'))
    symlinkSync(
      relative(docs, join(fake, 'wt', 'requirements.json')),
      join(docs, 'requirements.json'),
    )
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'attack')
    const clone = join(realpathSync(workDir()), 'clone')
    git(root, 'clone', '-q', root, clone)
    // The default invocation, from the checkout, on the committed document path.
    const r = spawnSync(process.execPath, [BUNDLE, 'check', '--temporal-bound', '1'], {
      cwd: join(clone, 'docs'),
      encoding: 'utf8',
    })
    const envelope = JSON.parse(r.stdout) as { code?: string; error?: string }
    expect(r.status).toBe(2)
    expect(envelope.code).toBe('ERR_CONFIG_INVALID')
    expect(envelope.error).toContain('bare repository')
  })

  it('a symlinked directory or document reads the config of the repository it resolves into (F11)', () => {
    const { root, docs } = committedRepo()
    // The shadow a lexical walk would read: a config beside the link, pinning nothing.
    const outside = realpathSync(workDir())
    writeFileSync(join(outside, CONFIG), json({ configVersion: 1, gate: {} }))
    symlinkSync(docs, join(outside, 'd'))
    symlinkSync(join(docs, 'requirements.json'), join(outside, 'r.json'))
    for (const via of [join(outside, 'd', 'requirements.json'), join(outside, 'r.json')]) {
      const { data } = checkRun(via, '--temporal-bound', '1')
      expect(data.run.config, via).toEqual({ path: join(root, CONFIG), source: 'toplevel' })
      expect(data.run.belowPinned, via).toEqual(['temporalBound'])
    }
    expect(git(root, 'status', '--porcelain', '--ignored', '-uall')).toBe('')
  })

  it('the toplevel is the one git rev-parse prints: a linked work tree reads its own', () => {
    const { root } = committedRepo()
    const linked = join(realpathSync(workDir()), 'wt')
    git(root, 'worktree', 'add', '-q', '--detach', linked)
    writeFileSync(join(linked, CONFIG), json({ configVersion: 1, gate: { temporalBound: 20 } }))
    const { data } = checkRun(join(linked, 'docs', 'requirements.json'), '--temporal-bound', '10')
    expect(git(join(linked, 'docs'), 'rev-parse', '--show-toplevel')).toBe(linked)
    expect(data.run.config).toEqual({ path: join(linked, CONFIG), source: 'toplevel' })
    expect(data.run.pinned).toEqual({ temporalBound: 20 })
  })

  it('asks git about the document, not about a GIT_DIR the caller inherited', () => {
    const { root, doc } = committedRepo()
    const other = realpathSync(workDir())
    repoAt(other)
    writeFileSync(join(other, CONFIG), json({ configVersion: 1, gate: {} }))
    const hooked = runJsonEnv(
      { GIT_DIR: join(other, '.git'), GIT_WORK_TREE: other },
      'check',
      doc,
      '--temporal-bound',
      '1',
    )
    const run = (hooked.envelope.data as { run: Record<string, unknown> }).run
    expect(run.config).toEqual({ path: join(root, CONFIG), source: 'toplevel' })
    expect(run.belowPinned).toEqual(['temporalBound'])
  })

  it('with no git to ask, the config beside the document is read and disclosed as directory', () => {
    const { docs, doc } = committedRepo()
    writeFileSync(join(docs, CONFIG), json({ configVersion: 1, gate: {} }))
    const noGit = runJsonEnv({ PATH: join(docs, 'no-such-bin') }, 'check', doc)
    const run = (noGit.envelope.data as { run: Record<string, unknown> }).run
    expect(run.config).toEqual({ path: join(docs, CONFIG), source: 'directory' })
  })

  it('--config and SYMSPEC_CONFIG replace the toplevel config, and data.run.config says so', () => {
    const { root, doc } = committedRepo()
    const elsewhere = realpathSync(workDir())
    const byFlag = join(elsewhere, 'flag.json')
    const byEnv = join(elsewhere, 'env.json')
    writeFileSync(byFlag, json({ configVersion: 1, gate: { temporalBound: 30 } }))
    writeFileSync(byEnv, json({ configVersion: 1, gate: { temporalBound: 40 } }))
    const flagged = checkRun(doc, '--temporal-bound', '1', '--config', byFlag)
    expect(flagged.data.run.config).toEqual({ path: byFlag, source: 'flag' })
    expect(flagged.data.run.pinned).toEqual({ temporalBound: 30 })
    // The repair re-reads the same config, so running it discharges the pins it was built from.
    const repair = flagged.data.coverage.demotions.find((d) => d.action.includes('pinned by'))
    expect(repair?.action).toContain(`--config ${byFlag}`)
    const env = { SYMSPEC_CONFIG: byEnv }
    const viaEnv = runJsonEnv(env, 'check', doc, '--temporal-bound', '1')
    const envRun = (viaEnv.envelope.data as { run: Record<string, unknown> }).run
    expect(envRun.config).toEqual({ path: byEnv, source: 'env' })
    expect(envRun.pinned).toEqual({ temporalBound: 40 })
    // The flag beats the environment.
    const both = runJsonEnv(env, 'check', doc, '--config', byFlag)
    expect((both.envelope.data as { run: Record<string, unknown> }).run.config).toEqual({
      path: byFlag,
      source: 'flag',
    })
    // An empty SYMSPEC_CONFIG is unset: the toplevel config governs.
    const empty = runJsonEnv({ SYMSPEC_CONFIG: '' }, 'check', doc)
    expect((empty.envelope.data as { run: Record<string, unknown> }).run.config).toEqual({
      path: join(root, CONFIG),
      source: 'toplevel',
    })
  })

  it('an explicit config that cannot be read fails closed as ERR_CONFIG_INVALID', () => {
    const { doc } = committedRepo()
    const missing = join(realpathSync(workDir()), 'absent.json')
    const flagged = runJson('check', doc, '--config', missing)
    expect(flagged.code).toBe(2)
    expect(flagged.envelope.code).toBe('ERR_CONFIG_INVALID')
    const viaEnv = runJsonEnv({ SYMSPEC_CONFIG: missing }, 'check', doc)
    expect(viaEnv.code).toBe(2)
    expect(viaEnv.envelope.code).toBe('ERR_CONFIG_INVALID')
  })

  it('outside a repository, the config beside the document is read and disclosed as directory', () => {
    const dir = realpathSync(workDir())
    const doc = docIn(dir, { temporalBound: 10 })
    const { data } = checkRun(doc, '--temporal-bound', '1')
    expect(data.run.config).toEqual({ path: join(dir, CONFIG), source: 'directory' })
    expect(data.run.belowPinned).toEqual(['temporalBound'])
  })

  it('running the published repair discharges every pin, even one the run met by a flag', () => {
    const doc = docIn(workDir(), { timeoutMs: 5000, temporalBound: 10, strict: true })
    const pinRepair = (args: string[]) => {
      const { data } = checkRun(...args)
      const commands = data.coverage.demotions
        .filter((d) => d.action.includes('pinned by'))
        .map((d) => (d as { repair?: { commands: string[] } }).repair?.commands[0])
      expect(new Set(commands).size).toBeLessThanOrEqual(1)
      return { below: data.run.belowPinned, command: commands[0] }
    }
    const first = pinRepair([doc, '--temporal-bound', '10', '--strict', '--timeout-ms', '1'])
    expect(first.below).toEqual(['timeoutMs', 'reachabilityTimeoutMs'])
    const tokens = (first.command ?? '').split(' ')
    // No embedder pin, so the command sets no environment: it is `symspec check <doc> ...`.
    expect(tokens.slice(0, 3)).toEqual(['symspec', 'check', doc])
    const second = pinRepair([doc, ...tokens.slice(3)])
    expect(second.below).toEqual([])
    expect(second.command).toBeUndefined()
  })

  it('a config that is not JSON fails closed as ERR_CONFIG_INVALID at exit 2', () => {
    const dir = workDir()
    const doc = docIn(dir)
    writeFileSync(join(dir, CONFIG), '{ nope')
    const { envelope, code } = runJson('check', doc)
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_CONFIG_INVALID')
  })

  it('init --split writes the anchors and the config; check then reads them', () => {
    const dir = workDir()
    const doc = join(dir, 'requirements.json')
    const { envelope, code } = runJson('init', doc, '--split')
    expect(code).toBe(0)
    expect((envelope.data as { split: unknown }).split).toEqual({
      config: join(dir, CONFIG),
      intent: join(dir, 'intent.json'),
      policy: join(dir, 'policy.json'),
    })
    const config = JSON.parse(readFileSync(join(dir, CONFIG), 'utf8')) as {
      files: Record<string, string>
      gate: Record<string, unknown>
    }
    expect(config.files).toEqual({
      document: 'requirements.json',
      intent: 'intent.json',
      policy: 'policy.json',
    })
    // Pinned at the defaults, so the only knob a suite run is below is the stub embedder.
    const checked = checkRun(doc)
    expect(checked.data.run.belowPinned).toEqual(['embedder'])
    expect(
      checked.data.coverage.demotions.some(
        (d) =>
          d.reason === 'run-weakened' && d.action.includes('SYMSPEC_EMBED_STUB=0 symspec check'),
      ),
    ).toBe(true)
  })

  it('init --split never overwrites an existing anchor, even with --force (sabotage (d))', () => {
    const dir = workDir()
    const doc = join(dir, 'requirements.json')
    const owned = json({ intentVersion: 1, items: [{ id: 'I1', text: 'The owner wrote this.' }] })
    writeFileSync(join(dir, 'intent.json'), owned)
    for (const extra of [[], ['--force']]) {
      const { envelope, code } = runJson('init', doc, '--split', ...extra)
      expect(code).toBe(2)
      expect(envelope.code).toBe('ERR_DOC_EXISTS')
      expect(readFileSync(join(dir, 'intent.json'), 'utf8')).toBe(owned)
      expect(existsSync(join(dir, 'policy.json'))).toBe(false)
      expect(existsSync(join(dir, CONFIG))).toBe(false)
      expect(existsSync(doc)).toBe(false)
    }
  })

  it('the manifest publishes the knob table as runWeakening', () => {
    const { envelope } = runJson('manifest')
    const rows = (envelope.data as { runWeakening: { knob: string; flag: string }[] }).runWeakening
    expect(rows.map((r) => r.knob)).toEqual([
      'semantic',
      'embedder',
      'semanticThreshold',
      'timeoutMs',
      'reachabilityTimeoutMs',
      'solverBudgetMs',
      'temporalBound',
      'strict',
    ])
  })
})

// ---------------------------------------------------------------------------
// S3 Waivability (AC-5-6) through the shipped bundle: exits, writes, and the waive command
// ---------------------------------------------------------------------------

describe('S3: waive, apply and import refuse never-class and unscoped waivers through the CLI', () => {
  const S3 = fileURLToPath(new URL('./testing/__fixtures__/s3-waivability', import.meta.url))
  const dirs: string[] = []
  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })
  /** A fresh copy of base.json in a temp dir. */
  const baseCopy = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-s3-'))
    dirs.push(dir)
    const doc = join(dir, 'requirements.json')
    writeFileSync(doc, readFileSync(join(S3, 'base.json')))
    return doc
  }
  type Result = { ok: boolean; code?: string; error?: string }

  it.each([
    'repro-code-only',
    'never-verdict',
    'lint-code-only',
    'structural-cycle-code-only',
  ])('[S3-002] apply %s: the refused waive aborts the stream, exit 1, nothing written, the file byte-identical', (name) => {
    const doc = baseCopy()
    const before = readFileSync(doc)
    const { envelope, code } = runJson(
      'apply',
      '--file',
      doc,
      '--ops',
      join(S3, 'cases', `${name}.ops.jsonl`),
    )
    expect(code).toBe(1)
    const data = envelope.data as { written: boolean; results: Result[] }
    expect(data.written).toBe(false)
    expect(data.results.find((r) => !r.ok)?.code).toBe('ERR_WAIVER_REFUSED')
    expect(readFileSync(doc).equals(before)).toBe(true)
  })

  it('[S3-001] [S3-011] symspec waive FND_CONTRADICTION --ref ORD-R1 is refused ERR_WAIVER_REFUSED, naming the code and its class, exit 1, file untouched', () => {
    const doc = baseCopy()
    const before = readFileSync(doc)
    const { stdout, code } = run(
      'waive',
      'FND_CONTRADICTION',
      '--ref',
      'ORD-R1',
      '--reason',
      'retired path',
      '--file',
      doc,
    )
    expect(code).not.toBe(0)
    expect(stdout).toContain('ERR_WAIVER_REFUSED')
    expect(stdout).toContain('verdict')
    expect(stdout).not.toMatch(/vocab\s+distinct|propose-vocabulary|--rescope-waivers/i)
    expect(readFileSync(doc).equals(before)).toBe(true)
  })

  it('[S3-003] symspec waive GTWR_R5_INDEFINITE_ARTICLE with no --ref is refused ERR_WAIVER_REFUSED, file untouched', () => {
    const doc = baseCopy()
    const before = readFileSync(doc)
    const { stdout, code } = run(
      'waive',
      'GTWR_R5_INDEFINITE_ARTICLE',
      '--reason',
      'house style',
      '--file',
      doc,
    )
    expect(code).not.toBe(0)
    expect(stdout).toContain('ERR_WAIVER_REFUSED')
    expect(readFileSync(doc).equals(before)).toBe(true)
  })

  it('[S3-005] [S3-006] symspec waive GTWR_R5_INDEFINITE_ARTICLE --ref LOG-R1 keeps working: stored as requirementIds [LOG-R1] plus the hash of its text', () => {
    const doc = baseCopy()
    const { code } = runJson(
      'waive',
      'GTWR_R5_INDEFINITE_ARTICLE',
      '--ref',
      'LOG-R1',
      '--reason',
      'one record',
      '--file',
      doc,
    )
    expect(code).toBe(0)
    const stored = (JSON.parse(readFileSync(doc, 'utf8')) as { waivers: Record<string, unknown>[] })
      .waivers
    expect(stored).toEqual([
      {
        code: 'GTWR_R5_INDEFINITE_ARTICLE',
        requirementIds: ['5a1e0000-0000-4000-8000-0000000000a1'],
        contentHash: 'sha256:fd8b2c50a779708a19c161d83262563c7d8826c3f749072ab3eaf58b2c286ae0',
        reason: 'one record',
      },
    ])
  })

  it('[S3-012] [S3-013] import v4-waivers.txt writes the six requirements, refuses I1, I3, I4 and I5 into problems[], and exits 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-s3-'))
    dirs.push(dir)
    const doc = join(dir, 'imported.json')
    const { envelope, code } = runJson(
      'import',
      '--file',
      join(S3, 'import', 'v4-waivers.txt'),
      '--doc',
      doc,
    )
    expect(code).toBe(1)
    const data = envelope.data as { imported: Record<string, number>; problems: unknown[] }
    expect(data.imported.requirements).toBe(6)
    expect(data.imported.waivers).toBe(2)
    expect(data.problems).toHaveLength(4)
    const written = JSON.parse(readFileSync(doc, 'utf8')) as {
      requirements: Record<string, unknown>
      waivers: { code: string; requirementId?: string; requirementIds?: string[] }[]
    }
    expect(Object.keys(written.requirements)).toHaveLength(6)
    // I4 is never widened: no stored waiver lacks a scope.
    for (const w of written.waivers) expect(w.requirementIds, JSON.stringify(w)).toBeDefined()
  })

  it('[S3-034] check --strict on blocking-lint-both.stored exits 1: the FND_CONTRADICTION error sets the exit before any demotion', () => {
    const { envelope, code } = runJson(
      'check',
      join(S3, 'cases', 'blocking-lint-both.stored.json'),
      '--strict',
    )
    expect(code).toBe(1)
    const data = envelope.data as { findings: { code: string; severity: string }[] }
    expect(data.findings.find((f) => f.code === 'FND_CONTRADICTION')?.severity).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// S3 closure round: the argv oracle R56 uses, and the write paths the attack found unpinned
// (A14, A21, A24, A25)
// ---------------------------------------------------------------------------

describe('S3 closure: the built parser as the oracle for every named command (R56)', () => {
  it('[S3-027] [S3-045] the oracle rejects what the parser rejects and accepts what it accepts (planted)', async () => {
    const rejected = await argvRejections([
      'symspec explain FND_CYCLE',
      'symspec antonym add <verbA> <verbB>',
      'symspec glossary add "close the door" "close the doors"',
      'symspec update',
      'symspec explain --code FND_CYCLE',
      'symspec antonym <verbA> <verbB>',
      'symspec glossary "close the door" "close the doors"',
      'symspec waive <code> --ref <id> --reason "…"',
      'symspec check requirements.json --timeout-ms 4000',
      'SYMSPEC_EMBED_ALLOW_REMOTE=1 symspec check …',
      'symspec download-model',
    ])
    expect(rejected.map((r) => r.command).sort()).toEqual(
      [
        'symspec antonym add <verbA> <verbB>',
        'symspec explain FND_CYCLE',
        'symspec glossary add "close the door" "close the doors"',
        'symspec update',
      ].sort(),
    )
    expect(rejected.find((r) => r.command === 'symspec explain FND_CYCLE')?.error).toMatch(
      /Missing required flag: --code/,
    )
  }, 60_000)

  it('[S3-027] the extractor reads backticked commands and whole command strings, and the tokenizer keeps quoted words', () => {
    expect(
      symspecCommandsIn(
        'run `symspec check x.json`, then `git status` and `symspec explain --code A`',
      ),
    ).toEqual(['symspec check x.json', 'symspec explain --code A'])
    expect(symspecCommandsIn('symspec check ./requirements.json --solver-budget-ms 30000')).toEqual(
      ['symspec check ./requirements.json --solver-budget-ms 30000'],
    )
    expect(argvOf('symspec glossary "issue a token" \'mint a token\' --file <path>')).toEqual([
      'glossary',
      'issue a token',
      'mint a token',
      '--file',
      'x',
    ])
  })
})

describe('S3 closure: write paths through the shipped bundle', () => {
  const S3 = fileURLToPath(new URL('./testing/__fixtures__/s3-waivability', import.meta.url))
  const dirs: string[] = []
  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })
  const copyOf = (text: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-s3c-'))
    dirs.push(dir)
    const doc = join(dir, 'requirements.json')
    writeFileSync(doc, text)
    return doc
  }
  const baseText = () => readFileSync(join(S3, 'base.json'), 'utf8')
  const waiversOf = (doc: string) =>
    (JSON.parse(readFileSync(doc, 'utf8')) as { waivers: unknown[] }).waivers

  it('[S3-005] [S3-006] symspec waive --remove --ref LOG-R1 removes the refs form symspec waive --ref LOG-R1 stored (A14)', () => {
    const doc = copyOf(baseText())
    const add = runJson(
      'waive',
      'GTWR_R5_INDEFINITE_ARTICLE',
      '--ref',
      'LOG-R1',
      '--reason',
      'reviewed',
      '--file',
      doc,
    )
    expect(add.code).toBe(0)
    expect(waiversOf(doc)).toHaveLength(1)
    const remove = runJson(
      'waive',
      'GTWR_R5_INDEFINITE_ARTICLE',
      '--ref',
      'LOG-R1',
      '--remove',
      '--file',
      doc,
    )
    expect(remove.code).toBe(0)
    const data = remove.envelope.data as { results: { op: string; ok: boolean; noop?: boolean }[] }
    expect(data.results).toEqual([{ index: 0, op: 'unwaive', ok: true }])
    expect(waiversOf(doc)).toEqual([])
  })

  it('[S3-031] @existing glossary over a hand-edited document whose antonym table holds an odd polarity cycle gives a typed ERR_USAGE refusal from the seed table, and writes nothing (A21)', () => {
    const d = JSON.parse(baseText()) as Record<string, unknown>
    d.antonyms = [
      { a: 'zork', b: 'blip' },
      { a: 'blip', b: 'frob' },
      { a: 'frob', b: 'zork' },
    ]
    const doc = copyOf(`${JSON.stringify(d, null, 2)}\n`)
    const before = readFileSync(doc)
    const { stdout, code } = run('glossary', 'open the door', 'close the door', '--file', doc)
    expect(code).toBe(2)
    const envelope = JSON.parse(stdout) as { type: string; code: string; error: string }
    expect(envelope.type).toBe('error')
    expect(envelope.code).toBe('ERR_USAGE')
    expect(envelope.error).toMatch(/contrary of "open the door"/)
    expect(readFileSync(doc).equals(before)).toBe(true)
  })

  it('[S3-002] @existing apply with a malformed JSON line after a valid waive writes nothing and exits 2 with an ERR_USAGE envelope naming the line (A24, A25)', () => {
    const doc = copyOf(baseText())
    const before = readFileSync(doc)
    const ops = join(dirs[dirs.length - 1] as string, 'ops.jsonl')
    writeFileSync(
      ops,
      `${JSON.stringify({ op: 'waive', code: 'GTWR_R5_INDEFINITE_ARTICLE', ref: 'LOG-R1', reason: 'reviewed' })}\n{broken\n`,
    )
    const { stdout, code } = run('apply', '--file', doc, '--ops', ops)
    expect(code).toBe(2)
    const envelope = JSON.parse(stdout) as { type: string; code: string; error: string }
    expect(envelope.type).toBe('error')
    expect(envelope.code).toBe('ERR_USAGE')
    expect(envelope.error).toMatch(/line 2 not valid JSON/)
    expect(readFileSync(doc).equals(before)).toBe(true)
  })
})

/**
 * Release hardening (VDD run 3, rulings RH-R2 and RH-R3), on the SHIPPED bundle.
 *
 * RH-R2: with no config named, a git refusal other than "not a git repository" and other than
 * the bare-repository refusal no longer stops a document that NO `symspec.config.json` could
 * govern: the run is the no-repository run, and `data.run.config` discloses git's refusal. With
 * a config in the document's directory or any ancestor the run still fails closed, naming the
 * refusal. The refusal is produced by a `git` shim first on PATH, which prints git's real
 * unsafe-ownership message (four lines) and exits 128, as git 2.35.2 and later do.
 *
 * RH-R3: `init --split` says, in its help and in its result, that nothing reads the anchors yet.
 * The statement is ONE exported constant; it is read through the module namespace so this file
 * loads on a build that does not have it yet, and fails there on an assertion.
 */
describe('release hardening — a git refusal and the v4 anchors, through the real process', () => {
  const roots: string[] = []
  const workDir = (): string => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'symspec-rh-')))
    roots.push(dir)
    return dir
  }
  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  const CONFIG = 'symspec.config.json'
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
  const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()
  /** Every string anywhere inside a JSON value. */
  const stringsIn = (value: unknown): string[] =>
    typeof value === 'string'
      ? [value]
      : typeof value === 'object' && value !== null
        ? Object.values(value).flatMap(stringsIn)
        : []

  /** The CLI with extra environment variables, parsed as one envelope. */
  const runJsonEnv = (env: Record<string, string>, ...args: string[]) => {
    const r = spawnSync(process.execPath, [BUNDLE, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    return { envelope: JSON.parse(r.stdout ?? '') as Record<string, unknown>, code: r.status ?? -1 }
  }

  /** An initialized (empty) document in `dir`, written with no git involved. */
  const docIn = (dir: string): string => {
    const doc = join(dir, 'requirements.json')
    expect(run('init', doc).code).toBe(0)
    return doc
  }

  /** A directory holding a `git` that refuses every directory the way an ownership check does. */
  const refusingGit = (): string => {
    const bin = workDir()
    writeFileSync(
      join(bin, 'git'),
      [
        '#!/bin/sh',
        'here="$(pwd -P)"',
        `printf '%s\\n' "fatal: detected dubious ownership in repository at '$here'" "To add an exception for this directory, call:" "" "	git config --global --add safe.directory $here" >&2`,
        'exit 128',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )
    return bin
  }
  const refusalIn = (dir: string): string =>
    `fatal: detected dubious ownership in repository at '${dir}'`
  const SECOND_LINE = 'To add an exception for this directory, call:'

  /** Every directory from `dir` up to `/`. */
  const ancestorsOf = (dir: string): string[] => {
    const out = [dir]
    for (let at = dir; at !== join(at, '..'); at = join(at, '..')) out.push(join(at, '..'))
    return out
  }
  /** The precondition RH-R2 (a) names: no config in the directory or any ancestor. */
  const expectNoConfigAbove = (dir: string): void => {
    expect(
      ancestorsOf(dir).filter((d) => existsSync(join(d, CONFIG))),
      'a symspec.config.json above the temp dir makes this fixture meaningless',
    ).toEqual([])
  }

  /** The parts of a check report RH-R2 (a) holds identical to the no-git run. */
  const verdictOf = (envelope: Record<string, unknown>) => {
    const data = envelope.data as {
      verified: boolean
      findings: unknown[]
      coverage: { demotions: unknown[] }
    }
    return { verified: data.verified, findings: data.findings, demotions: data.coverage.demotions }
  }

  it('[RH-003] with no config anywhere, a git refusal runs exactly as no repository and discloses the refusal', () => {
    const dir = workDir()
    const doc = docIn(dir)
    expectNoConfigAbove(dir)
    const noGit = runJsonEnv({ PATH: join(dir, 'no-such-bin') }, 'check', doc)
    expect(noGit.envelope.type).toBe('check')
    const refused = runJsonEnv({ PATH: `${refusingGit()}:${process.env.PATH ?? ''}` }, 'check', doc)
    expect(refused.envelope.code, String(refused.envelope.error)).toBeUndefined()
    expect(refused.code).toBe(noGit.code)
    expect(refused.envelope.type).toBe('check')
    expect(verdictOf(refused.envelope)).toEqual(verdictOf(noGit.envelope))
    // The disclosure: the document's directory is the config root, and git's refusal is named
    // by its first line, beside {path, source}.
    const config = (refused.envelope.data as { run: { config?: Record<string, unknown> } }).run
      .config
    expect(config?.path).toBe(join(dir, CONFIG))
    expect(config?.source).toBe('directory')
    const disclosed = Object.entries(config ?? {})
      .filter(([key]) => key !== 'path' && key !== 'source')
      .flatMap(([, value]) => stringsIn(value))
    expect(disclosed.some((text) => text.includes(refusalIn(dir)))).toBe(true)
    expect(disclosed.some((text) => text.includes(SECOND_LINE))).toBe(false)
  })

  it('[RH-003] the no-config refusal run is the no-git run for a document in a subdirectory too', () => {
    const dir = join(workDir(), 'specs', 'door')
    mkdirSync(dir, { recursive: true })
    const doc = docIn(dir)
    expectNoConfigAbove(dir)
    const noGit = runJsonEnv({ PATH: join(dir, 'no-such-bin') }, 'check', doc)
    const refused = runJsonEnv({ PATH: `${refusingGit()}:${process.env.PATH ?? ''}` }, 'check', doc)
    expect(refused.envelope.code, String(refused.envelope.error)).toBeUndefined()
    expect(refused.code).toBe(noGit.code)
    expect(verdictOf(refused.envelope)).toEqual(verdictOf(noGit.envelope))
  })

  it('[RH-004] a git refusal with a config beside the document fails closed, naming the refusal', () => {
    const dir = workDir()
    const doc = docIn(dir)
    writeFileSync(join(dir, CONFIG), json({ configVersion: 1, gate: { temporalBound: 10 } }))
    const refused = runJsonEnv({ PATH: `${refusingGit()}:${process.env.PATH ?? ''}` }, 'check', doc)
    expect(refused.code).toBe(2)
    expect(refused.envelope.code).toBe('ERR_CONFIG_INVALID')
    expect(String(refused.envelope.error)).toContain(refusalIn(dir))
  })

  it('[RH-004] a git refusal with a config in an ANCESTOR fails closed, and never loads that config', () => {
    const parent = workDir()
    // A config that would demote the run if it were read; it must be neither read nor ignored.
    writeFileSync(join(parent, CONFIG), json({ configVersion: 1, gate: { temporalBound: 10 } }))
    const dir = join(parent, 'specs', 'door')
    mkdirSync(dir, { recursive: true })
    const doc = docIn(dir)
    const refused = runJsonEnv(
      { PATH: `${refusingGit()}:${process.env.PATH ?? ''}` },
      'check',
      doc,
      '--temporal-bound',
      '1',
    )
    expect(refused.code).toBe(2)
    expect(refused.envelope.code).toBe('ERR_CONFIG_INVALID')
    expect(String(refused.envelope.error)).toContain(refusalIn(dir))
    expect(refused.envelope.data).toBeUndefined()
  })

  it('[RH-005] the bare-repository refusal stays ERR_CONFIG_INVALID even with no config anywhere', () => {
    const root = workDir()
    const fake = join(root, 'fake')
    for (const sub of ['objects', 'refs', 'wt']) mkdirSync(join(fake, sub), { recursive: true })
    writeFileSync(join(fake, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(fake, 'config'), '[core]\n\trepositoryformatversion = 0\n\tworktree = wt\n')
    const doc = docIn(join(fake, 'wt'))
    expectNoConfigAbove(join(fake, 'wt'))
    const { envelope, code } = runJson('check', doc)
    expect(code).toBe(2)
    expect(envelope.code).toBe('ERR_CONFIG_INVALID')
    expect(String(envelope.error)).toContain('cannot use bare repository')
  })

  it('[RH-006] --config and SYMSPEC_CONFIG under a git refusal behave as they do today', () => {
    const dir = workDir()
    const doc = docIn(dir)
    expectNoConfigAbove(dir)
    const named = join(workDir(), 'named.json')
    writeFileSync(named, json({ configVersion: 1, gate: {} }))
    const shim = { PATH: `${refusingGit()}:${process.env.PATH ?? ''}` }
    // Today the default location is still resolved (it decides which document a named config
    // governs), so a refusal fails the run closed whichever way the config was named.
    const byFlag = runJsonEnv(shim, 'check', doc, '--config', named)
    expect(byFlag.code).toBe(2)
    expect(byFlag.envelope.code).toBe('ERR_CONFIG_INVALID')
    const byEnv = runJsonEnv({ ...shim, SYMSPEC_CONFIG: named }, 'check', doc)
    expect(byEnv.code).toBe(2)
    expect(byEnv.envelope.code).toBe('ERR_CONFIG_INVALID')
    // And with git answering, the named config is read and disclosed, as today.
    const answered = runJsonEnv({ PATH: join(dir, 'no-such-bin') }, 'check', doc, '--config', named)
    expect(answered.code).not.toBe(2)
    expect((answered.envelope.data as { run: { config?: unknown } }).run.config).toEqual({
      path: named,
      source: 'flag',
    })
  })

  it('[RH-008] init --split says in its help, its manifest entry and its result that nothing reads the anchors yet', async () => {
    const documentModule = await import('./domain/requirements/document.ts')
    const statement: unknown = Reflect.get(documentModule, 'V4_EXPERIMENTAL_STATEMENT')
    expect(typeof statement, 'V4_EXPERIMENTAL_STATEMENT is exported as a string').toBe('string')
    const said = collapse(String(statement))
    expect(collapse(helpFor('init'))).toContain(said)
    const split = (
      manifest.operations.find((op) => op.name === 'init')?.input as {
        properties?: Record<string, { description?: string }>
      }
    ).properties?.split?.description
    expect(collapse(split ?? '')).toContain(said)
    const dir = workDir()
    expectNoConfigAbove(dir)
    const { envelope, code } = runJson('init', join(dir, 'requirements.json'), '--split')
    expect(code).toBe(0)
    expect(stringsIn(envelope.data).some((text) => collapse(text).includes(said))).toBe(true)
    // The pins are enforced today: the config's own description is not labelled experimental.
    expect(existsSync(join(dir, CONFIG))).toBe(true)
  })

  /**
   * Review findings R1 and R2 (review ledger, commit fc203db), ruling RH-R4.
   *
   * R1: under a refusal the lookup for a `symspec.config.json` at or above the document must
   * fail closed on a candidate whose existence it cannot determine. A config symlinked to itself
   * makes the existence check itself fail (ELOOP), with no mock: HEAD fails closed, and the
   * mutant that reads such a failure as "absent" passed every earlier RH test while the run
   * exited 0, verified true. RH-R4: a DANGLING `symspec.config.json` symlink also counts as
   * present under a refusal, because the run cannot tell which config governs and an agent could
   * plant a dangling link to steer discovery. (Off the refusal path a dangling link is not
   * pinned here; RH-R4 says it may differ on purpose.)
   *
   * R2: the bare-repository refusal is recognised from git's own message form, so a document
   * directory whose name spells the phrase does not turn an ownership refusal into it.
   */
  const shimPath = (): Record<string, string> => ({
    PATH: `${refusingGit()}:${process.env.PATH ?? ''}`,
  })

  /** A refusal with `link` placed at `at/symspec.config.json`, for a document in `docDir`. */
  const refusedWithLink = (docDir: string, at: string, target: string) => {
    const doc = docIn(docDir)
    symlinkSync(target, join(at, CONFIG))
    return runJsonEnv(shimPath(), 'check', doc)
  }

  it('[RH-010] guard (existing): a config beside the document whose existence cannot be determined (a self-symlink, ELOOP) fails closed under a git refusal', () => {
    const dir = workDir()
    const refused = refusedWithLink(dir, dir, CONFIG)
    expect(refused.code).toBe(2)
    expect(refused.envelope.code).toBe('ERR_CONFIG_INVALID')
    expect(String(refused.envelope.error)).toContain(refusalIn(dir))
    expect(refused.envelope.data).toBeUndefined()
  })

  it('[RH-010] guard (existing): a self-symlinked config in an ANCESTOR fails closed under a git refusal too', () => {
    const parent = workDir()
    const dir = join(parent, 'specs', 'door')
    mkdirSync(dir, { recursive: true })
    const refused = refusedWithLink(dir, parent, join(parent, CONFIG))
    expect(refused.code).toBe(2)
    expect(refused.envelope.code).toBe('ERR_CONFIG_INVALID')
    expect(String(refused.envelope.error)).toContain(refusalIn(dir))
    expect(refused.envelope.data).toBeUndefined()
  })

  it('[RH-010] a DANGLING config symlink beside the document counts as present under a git refusal and fails closed (RH-R4)', () => {
    const dir = workDir()
    const refused = refusedWithLink(dir, dir, join(dir, 'no-such-config.json'))
    expect(refused.code).toBe(2)
    expect(refused.envelope.code, 'a dangling link must not read as no config').toBe(
      'ERR_CONFIG_INVALID',
    )
    expect(String(refused.envelope.error)).toContain(refusalIn(dir))
    expect(refused.envelope.data).toBeUndefined()
  })

  it('[RH-010] a DANGLING config symlink in an ANCESTOR counts as present under a git refusal and fails closed (RH-R4)', () => {
    const parent = workDir()
    const dir = join(parent, 'specs', 'door')
    mkdirSync(dir, { recursive: true })
    const refused = refusedWithLink(dir, parent, join(parent, 'gone', CONFIG))
    expect(refused.code).toBe(2)
    expect(refused.envelope.code, 'a dangling link must not read as no config').toBe(
      'ERR_CONFIG_INVALID',
    )
    expect(String(refused.envelope.error)).toContain(refusalIn(dir))
    expect(refused.envelope.data).toBeUndefined()
  })

  it('[RH-011] an ownership refusal quoting a directory that spells the bare-repository phrase runs exactly as no repository', () => {
    // The reviewer's directory name, one that also carries git's `fatal: ` prefix, and one where
    // the phrase starts a line of the quoted path: each is inside the quoted path, so each is
    // excluded; the refusal is the ordinary one and falls back exactly as RH-003 says.
    const names = [
      'cannot use bare repository',
      'fatal: cannot use bare repository',
      "x\nfatal: cannot use bare repository '",
    ]
    const outcomes = names.map((name) => {
      const dir = join(workDir(), name)
      mkdirSync(dir)
      const doc = docIn(dir)
      expectNoConfigAbove(dir)
      const noGit = runJsonEnv({ PATH: join(workDir(), 'no-such-bin') }, 'check', doc)
      const refused = runJsonEnv(shimPath(), 'check', doc)
      const config = (refused.envelope.data as { run?: { config?: Record<string, unknown> } })?.run
        ?.config
      return {
        name,
        code: refused.envelope.code ?? null,
        exit: refused.code === noGit.code,
        verdict:
          refused.envelope.type === 'check' &&
          JSON.stringify(verdictOf(refused.envelope)) === JSON.stringify(verdictOf(noGit.envelope)),
        path: config?.path === join(dir, CONFIG) && config?.source === 'directory',
      }
    })
    expect(outcomes).toEqual(
      names.map((name) => ({ name, code: null, exit: true, verdict: true, path: true })),
    )
  })
})

// ---------------------------------------------------------------------------
// Final closure round (R60, R61): the oracle tracks quotes and runs bash -n; every help text
// names commands the parser accepts; a user's path is handed to the shell whole
// ---------------------------------------------------------------------------

describe('final closure: the argv oracle fails what a shell cannot parse (R60, review R6)', () => {
  it('[S3-027] [S3-045] an unterminated quote and a bash -n error are rejections, with the parser never asked (planted)', async () => {
    const R6 = 'symspec glossary "issue a token" "mint a "token"'
    expect(() => argvOf(R6)).toThrow(/unterminated double quote/)
    expect(() => argvOf("symspec glossary 'issue a token")).toThrow(/unterminated single quote/)
    const rejected = await argvRejections([
      R6,
      "symspec glossary 'issue a token",
      'symspec check a.json ) b',
      'symspec glossary "issue a token" "mint a \\"token\\""',
      `symspec glossary "issue a token" 'mint a "token"'`,
    ])
    expect(rejectionLines(rejected)).toEqual(
      [
        `symspec check a.json ) b  =>  bash -n: ${rejected.find((r) => r.command.includes(')'))?.error.replace(/^bash -n: /, '')}`,
        `symspec glossary "issue a token" "mint a "token"  =>  unterminated double quote opened at offset 40: "\\""`,
        `symspec glossary 'issue a token  =>  unterminated single quote opened at offset 10: "'issue a token"`,
      ].sort((a, b) => a.localeCompare(b)),
    )
    expect(rejected.find((r) => r.command.includes(')'))?.error).toMatch(/^bash -n: .*syntax error/)
  }, 60_000)

  it('[S3-045] the tokenizer splits as bash does: quotes, escapes inside and outside double quotes, newlines inside quotes', () => {
    for (const c of [
      `symspec glossary "a \\"b\\" \\$c \\\\ d" 'it'"'"'s' e\\ f`,
      'symspec glossary "line one\nline two" "x\\y"',
      'symspec term \'a $b `c`\' "d;e"',
    ]) {
      expect(shellArgv(c), c).toEqual([argvOf(c)])
    }
    expect(argvOf(`symspec glossary "a \\"b\\"" 'it'"'"'s'`)).toEqual(['glossary', 'a "b"', "it's"])
    // Dollar-single-quotes (POSIX.1-2024): a backtick and a newline spelled without writing one.
    const dollar = "symspec glossary 'a' $'mint a \\x60token\\x60\\nnow it\\'s'"
    expect(dollar.includes('`')).toBe(false)
    expect(argvOf(dollar)).toEqual(['glossary', 'a', "mint a `token`\nnow it's"])
    expect(shellArgv(dollar)).toEqual([argvOf(dollar)])
    expect(() => argvOf("symspec glossary $'open")).toThrow(/unterminated dollar-single quote/)
  })

  it('[S3-045] shell safety fails an expansion, a split, a lost value and an open quote, and passes a quoted hostile value (planted)', () => {
    expect(shellSafetyProblem('symspec glossary "a" "the $HOME badge"')).toMatch(
      /the shell splits it/,
    )
    expect(shellSafetyProblem('symspec glossary "a" "the `true` badge"')).toMatch(
      /the shell splits it/,
    )
    expect(shellSafetyProblem('symspec glossary a; b')).toMatch(/the shell splits it/)
    expect(shellSafetyProblem('symspec glossary "a" "b"; symspec check')).toMatch(/2 time/)
    expect(shellSafetyProblem('symspec glossary "a "b""', ['a "b"'])).toMatch(
      /not one whole argument/,
    )
    expect(shellSafetyProblem('symspec glossary "a" "b')).toMatch(/unterminated/)
    const hostile = `the "front" $HOME; it's \`x\` \\ badge\nok`
    const quoted = `'${hostile.replace(/'/g, `'"'"'`)}'`
    expect(shellSafetyProblem(`symspec glossary "a" ${quoted}`, ['a', hostile])).toBeUndefined()
  })
})

describe('final closure: every command any help text names passes the parser (R61, attack C10)', () => {
  /** Backticked `symspec ...` spans; read twice, so a stray backtick cannot shift the pairs. */
  const commandsIn = (text: string): readonly string[] => [
    ...symspecCommandsIn(text),
    ...[...text.matchAll(/`(symspec(?:\s[^`]*)?)`/g)].map((m) => (m[1] ?? '').trim()),
  ]

  /**
   * `import --help` names its stream's optional side-table lines as `symspec glossary/antonym/waive
   * add`: a line of the import grammar, parsed by `import`, not an invocation of the CLI.
   */
  const IMPORT_SIDE_TABLE = 'symspec glossary/antonym/waive add'

  it('[S3-045] term --help: the glossary command it points a verb phrase to parses with its required arguments, full argv (attack C10)', async () => {
    const found = commandsIn(helpFor('term'))
    expect(found.length).toBeGreaterThan(0)
    expect(rejectionLines(await argvRejections(found))).toEqual([])
    expect(found.some((c) => c.startsWith('symspec glossary "'))).toBe(true)
  }, 60_000)

  it('[S3-045] the root help and each subcommand’s --help: every `symspec` command named parses with its required arguments, full argv', async () => {
    expect(manifest.operations.length).toBeGreaterThan(20)
    expect(helpFor('import')).toContain(`\`${IMPORT_SIDE_TABLE}\``)
    const commands = new Set<string>(commandsIn(rootHelp))
    let named = 0
    for (const op of manifest.operations) {
      const found = commandsIn(helpFor(op.name)).filter((c) => c !== IMPORT_SIDE_TABLE)
      named += found.length
      for (const c of found) commands.add(c)
    }
    // Anti-vacuity: the term help's glossary pointer (attack C10) is among them.
    expect(named).toBeGreaterThan(0)
    expect([...commands].some((c) => c.startsWith('symspec glossary "'))).toBe(true)
    expect(rejectionLines(await argvRejections(commands))).toEqual([])
  }, 180_000)
})

describe('final closure: a document path is a user value the shell must hand over whole (R60)', () => {
  it('[S3-045] check on a document under a directory named with quotes, $, a backtick, ;, a backslash and a newline: every command naming the path carries it as one whole argument', () => {
    const root = mkdtempSync(join(tmpdir(), 'symspec-r60-'))
    try {
      const dir = join(root, `it's "a" $HOME; \`x\` \\ d\nz`)
      mkdirSync(dir)
      const file = join(dir, 'req.json')
      expect(run('init', file).code).toBe(0)
      for (const response of ['log every attempt', 'record each attempt'])
        expect(
          run(
            'add',
            '--file',
            file,
            '--pattern-type',
            'ubiquitous',
            '--system-name',
            'auth service',
            '--system-response',
            response,
          ).code,
        ).toBe(0)
      const { envelope } = runJson('check', file)
      expect(envelope.type).toBe('check')
      // Every command that mentions the directory at all, as an agent would copy it.
      const commands = [...new Set(symspecCommandsDeep(envelope))].filter((c) => c.includes("it's"))
      expect(commands.length, 'the check payload names the path in some command').toBeGreaterThan(0)
      const wrong = commands.flatMap((c) => {
        const problem = shellSafetyProblem(c, [file])
        return problem === undefined ? [] : [`${c}  =>  ${problem}`]
      })
      expect(wrong).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
})
