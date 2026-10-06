/**
 * EVERY `symspec ...` COMMAND THE TOOL NAMES, PARSED BY THE BUILT BINARY (spec 007 AC-5-6, R56).
 *
 * A command an output tells an agent to run is a promise that the CLI accepts it. Checking the
 * subcommand name alone (`currentManifest().operations`) passes `symspec explain FND_X` against a
 * build whose `explain` requires `--code`, and `symspec antonym add a b` against a flat `antonym
 * <a> <b>`: both exit 1 with a usage error the agent then has to read help to recover from. So
 * this module hands the FULL argv to `dist/cli.mjs` and reads the parser's own verdict.
 *
 * ## The oracle
 *
 * The parser and its required-flag validation run before any handler. A rejection prints the
 * command's help on stdout and an `ERROR` block on stderr (`Missing required flag: --code`,
 * `Unexpected positional argument: "cool"`), and nothing else does: a parsed command runs its
 * handler and writes one envelope. So a command is rejected exactly when stderr carries that
 * block or stdout starts with the help text.
 *
 * Each command runs in a FRESH empty directory with HOME, the install targets, the model cache and
 * the network all pointed at nothing, so a named `symspec init` writes into scratch, `symspec
 * install` into a scratch home, and `symspec download-model` fails at once on a refused proxy
 * rather than fetching 110 MB. A missing document is an envelope (`ERR_DOC_NOT_FOUND`), which is
 * the parser saying yes.
 *
 * ## Placeholders
 *
 * Advice names commands with slots: `<verbA>`, `<id>`, `"…"`. Each slot becomes the word `x`, so
 * the parser judges the SHAPE (which flags, how many positionals) and not a value only the agent
 * can supply.
 *
 * Pure node: `testing/` may not name `app/` or `adapters/` (`package-boundary.test.ts`).
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The bundle `pnpm build` writes; the gate builds before `vitest`. */
export const BUNDLE = fileURLToPath(new URL('../../dist/cli.mjs', import.meta.url))

/** An env-var prefix a command may legitimately carry (`SYMSPEC_EMBED_ALLOW_REMOTE=1 symspec …`). */
const ENV_PREFIX = /^(?:[A-Z_][A-Z0-9_]*=\S*\s+)*/

/**
 * Every `symspec …` command one string names: each backticked span that starts with `symspec`
 * (after any env prefix), and the whole string when it IS a command (a `repair.commands` entry).
 */
export const symspecCommandsIn = (text: string): readonly string[] => {
  const out: string[] = []
  for (const m of text.matchAll(/`([^`]*)`/g)) {
    const span = (m[1] ?? '').replace(ENV_PREFIX, '').trim()
    if (/^symspec(?:\s|$)/.test(span)) out.push(span)
  }
  const whole = text.replace(ENV_PREFIX, '').trim()
  if (!text.includes('`') && /^symspec(?:\s|$)/.test(whole)) out.push(whole)
  return out
}

/** Every `symspec …` command named by any string anywhere in `value` (a payload, a row). */
export const symspecCommandsDeep = (value: unknown): readonly string[] => {
  if (typeof value === 'string') return symspecCommandsIn(value)
  if (Array.isArray(value)) return value.flatMap((v) => symspecCommandsDeep(v))
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap((v) => symspecCommandsDeep(v))
}

/**
 * The argv after `symspec`, shell-split (double and single quotes group, a backslash escapes),
 * with every placeholder slot replaced by `x`.
 */
export const argvOf = (command: string): readonly string[] => {
  const text = command
    .replace(ENV_PREFIX, '')
    .replace(/^symspec\b/, '')
    .replace(/<[^<>]*>/g, 'x')
    .replace(/…|\.\.\./g, 'x')
  const words: string[] = []
  let word: string | undefined
  let quote: '"' | "'" | undefined
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quote !== undefined) {
      if (c === quote) quote = undefined
      else if (c === '\\' && quote === '"' && i + 1 < text.length)
        word = `${word ?? ''}${text[++i]}`
      else word = `${word ?? ''}${c}`
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      word ??= ''
    } else if (/\s/.test(c)) {
      if (word !== undefined) words.push(word)
      word = undefined
    } else if (c === '\\' && i + 1 < text.length) {
      word = (word ?? '') + text[++i]
    } else {
      word = (word ?? '') + c
    }
  }
  if (word !== undefined) words.push(word)
  return words.map((w) => (w.length === 0 ? 'x' : w))
}

/** One command the built parser refused, with the line it printed. */
export interface ArgvRejection {
  readonly command: string
  readonly argv: readonly string[]
  readonly error: string
}

const parseOnce = (command: string): Promise<ArgvRejection | undefined> => {
  const argv = argvOf(command)
  const dir = mkdtempSync(join(tmpdir(), 'symspec-argv-'))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: dir,
    USERPROFILE: dir,
    SYMSPEC_TEST_HOME: dir,
    SYMSPEC_TEST_CWD: dir,
    SYMSPEC_MODEL_DIR: join(dir, 'model'),
    XDG_CACHE_HOME: join(dir, 'cache'),
    NODE_USE_ENV_PROXY: '1',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9',
    NO_COLOR: '1',
  }
  delete env.SYMSPEC_DOC
  return new Promise((resolve) => {
    // stdin is closed, so a command that reads a stream (`import`, `apply` with no file) sees
    // EOF at once instead of waiting on the test runner's stdin.
    const child = spawn(process.execPath, [BUNDLE, ...argv], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (c: string) => {
      stdout += c
    })
    child.stderr.setEncoding('utf8').on('data', (c: string) => {
      stderr += c
    })
    child.on('close', () => {
      rmSync(dir, { recursive: true, force: true })
      const out = stdout.trimStart()
      const block = /^\s*ERROR\s*\n\s*(.+)$/m.exec(stderr)
      if (block !== null || out.startsWith('DESCRIPTION') || out.startsWith('USAGE')) {
        resolve({ command, argv, error: (block?.[1] ?? out.split('\n')[0] ?? '').trim() })
      } else resolve(undefined)
    })
  })
}

/**
 * The commands the built parser rejects, each judged once, at most `parallel` at a time. The
 * caller asserts the list empty, so a red run names every offender with the parser's own line.
 */
export const argvRejections = async (
  commands: Iterable<string>,
  parallel = 8,
): Promise<readonly ArgvRejection[]> => {
  const queue = [...new Set(commands)].sort()
  const rejected: ArgvRejection[] = []
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const r = await parseOnce(next)
      if (r !== undefined) rejected.push(r)
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker))
  return rejected.sort((a, b) => a.command.localeCompare(b.command))
}

/** `command -> parser line`, for a failure message that names every offender. */
export const rejectionLines = (rejected: readonly ArgvRejection[]): readonly string[] =>
  rejected.map((r) => `${r.command}  =>  ${r.error}`)

/**
 * The never-code negative guard's word set (R56): every inflection of "waive" an action, message
 * or suggestion could use to offer or mention one. `waivable` is not in it: "never waivable" is
 * the class statement, not advice.
 */
export const WAIVE_INFLECTION = /\bwaiv(?:e|es|ed|ing|er|ers)\b/i
