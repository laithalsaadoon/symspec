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

import { spawn, spawnSync } from 'node:child_process'
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

/** Each placeholder slot (`<id>`, `"…"`, `...`) becomes the word `x`, for the parser and `bash -n` alike. */
const slotted = (command: string): string =>
  command.replace(/<[^<>]*>/g, 'x').replace(/…|\.\.\./g, 'x')

/** The offset of the `'` that closes a `$'...'` body starting at `from`, or -1. */
const dollarQuoteEnd = (text: string, from: number): number => {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === "'") return i
  }
  return -1
}

/** The characters a `$'...'` body stands for: the escapes bash and POSIX.1-2024 share. */
const dollarQuoted = (body: string): string =>
  body.replace(/\\(x[0-9A-Fa-f]{1,2}|[0-7]{1,3}|[\\'"?abefnrtv]|E)/g, (_, e: string) => {
    if (e.startsWith('x')) return String.fromCharCode(Number.parseInt(e.slice(1), 16))
    if (/^[0-7]/.test(e)) return String.fromCharCode(Number.parseInt(e, 8))
    const named: Record<string, string> = {
      a: '\x07',
      b: '\b',
      e: '\x1b',
      E: '\x1b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
    }
    return named[e] ?? e
  })

/**
 * The argv after `symspec`, split the way a POSIX shell splits words (R60), with every
 * placeholder slot replaced by `x`. It TRACKS quote state: single quotes are literal to the
 * next single quote; inside double quotes a backslash escapes only `$`, a backtick, `"`, `\`
 * and a newline (which it removes) and is kept before anything else; outside quotes a backslash
 * escapes the next character (a backslash-newline is a continuation, removed). A quote still
 * open at the end of the command THROWS: the shell cannot parse it (review R6: an oracle that
 * dropped the open quote passed `symspec glossary "issue a token" "mint a "token"`). Expansion
 * (`$x`, a backtick) is not performed: the words are what the text literally shows, which is
 * what {@link shellArgv} compares the real shell against.
 */
const literalWords = (command: string): readonly string[] => {
  const text = slotted(command.replace(ENV_PREFIX, '')).replace(/^symspec\b/, '')
  const words: string[] = []
  let word: string | undefined
  let quote: '"' | "'" | undefined
  let openedAt = -1
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quote === "'") {
      if (c === "'") quote = undefined
      else word = `${word ?? ''}${c}`
      continue
    }
    if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === '\\' && i + 1 < text.length && '$`"\\\n'.includes(text[i + 1] as string)) {
        const next = text[++i] as string
        if (next !== '\n') word = `${word ?? ''}${next}`
      } else word = `${word ?? ''}${c}`
      continue
    }
    if (c === '$' && text[i + 1] === "'") {
      // Dollar-single-quotes (POSIX.1-2024, bash): the one quoting that can spell a backtick or
      // a newline without writing one, so a command inside a backticked prose span can carry it.
      const close = dollarQuoteEnd(text, i + 2)
      if (close < 0)
        throw new Error(
          `unterminated dollar-single quote opened at offset ${i}: ${JSON.stringify(text.slice(i))}`,
        )
      word = (word ?? '') + dollarQuoted(text.slice(i + 2, close))
      i = close
    } else if (c === '"' || c === "'") {
      quote = c
      openedAt = i
      word ??= ''
    } else if (/\s/.test(c)) {
      if (word !== undefined) words.push(word)
      word = undefined
    } else if (c === '\\' && i + 1 < text.length) {
      const next = text[++i] as string
      if (next !== '\n') word = (word ?? '') + next
    } else {
      word = (word ?? '') + c
    }
  }
  if (quote !== undefined)
    throw new Error(
      `unterminated ${quote === '"' ? 'double' : 'single'} quote opened at offset ${openedAt}: ${JSON.stringify(text.slice(openedAt))}`,
    )
  if (word !== undefined) words.push(word)
  return words
}

/** {@link literalWords} with an empty quoted word read as the slot `x`: the argv the parser judges. */
export const argvOf = (command: string): readonly string[] =>
  literalWords(command).map((w) => (w.length === 0 ? 'x' : w))

/** The absolute path of the `bash` on PATH, so a script can run with an empty PATH. */
const BASH = spawnSync('bash', ['-c', 'printf %s "$BASH"'], { encoding: 'utf8' }).stdout || 'bash'

/**
 * What `bash -n` says about the command, slots replaced (an unquoted `<id>` would read as a
 * redirection): `undefined` when it parses, else its first error line (R60).
 */
export const shellSyntaxError = (command: string): string | undefined => {
  const r = spawnSync(BASH, ['--noprofile', '--norc', '-n'], {
    input: `${slotted(command)}\n`,
    encoding: 'utf8',
    env: { PATH: '/nonexistent', LC_ALL: 'C' },
    timeout: 10_000,
  })
  if (r.status === 0) return undefined
  return (r.stderr || `bash -n exited ${String(r.status)}`).trim().split('\n')[0]
}

/**
 * The argv a real POSIX shell hands `symspec` for this command, slots replaced, one array per
 * invocation (R60). `symspec` is a shell function that prints its arguments, and the script runs
 * with no PATH and no inherited environment in an empty scratch directory, so nothing outside
 * the shell runs: a broken quote, an expansion (`$HOME`, a backtick) or a split (`;`, a newline)
 * shows up as a different argv or a second command, never as an effect.
 */
export const shellArgv = (command: string): readonly (readonly string[])[] => {
  const dir = mkdtempSync(join(tmpdir(), 'symspec-sh-'))
  try {
    const script = `symspec() { printf '%s\\0' "$@"; printf '\\001\\0'; }\n${slotted(command)}\n`
    const r = spawnSync(BASH, ['--noprofile', '--norc', '-c', script], {
      cwd: dir,
      encoding: 'utf8',
      env: { PATH: '/nonexistent', HOME: dir, LC_ALL: 'C.UTF-8' },
      timeout: 10_000,
    })
    const calls: string[][] = []
    let current: string[] = []
    for (const part of r.stdout.split('\0').slice(0, -1)) {
      if (part === '\u0001') {
        calls.push(current)
        current = []
      } else current.push(part)
    }
    return calls
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Why a command that carries document text or a user value is not shell-safe (R60), or
 * `undefined`: an unterminated quote, a `bash -n` error, a shell that does not call `symspec`
 * exactly once, or one whose argv differs from the words the text literally shows (an
 * expansion or a split happened), or a `value` the command names that is not one whole word.
 */
export const shellSafetyProblem = (
  command: string,
  values: readonly string[] = [],
): string | undefined => {
  let literal: readonly string[]
  try {
    literal = literalWords(command)
  } catch (e) {
    return (e as Error).message
  }
  const syntax = shellSyntaxError(command)
  if (syntax !== undefined) return `bash -n: ${syntax}`
  const calls = shellArgv(command)
  if (calls.length !== 1) return `the shell runs symspec ${calls.length} time(s)`
  const words = calls[0] ?? []
  if (JSON.stringify(words) !== JSON.stringify(literal))
    return `the shell splits it into ${JSON.stringify(words)}, the text shows ${JSON.stringify(literal)}`
  const lost = values.filter((v) => !words.includes(v))
  if (lost.length > 0)
    return `not one whole argument: ${JSON.stringify(lost)} in ${JSON.stringify(words)}`
  return undefined
}

/** One command the built parser refused, with the line it printed. */
export interface ArgvRejection {
  readonly command: string
  readonly argv: readonly string[]
  readonly error: string
}

const parseOnce = (command: string): Promise<ArgvRejection | undefined> => {
  // R60: an unterminated quote and a `bash -n` error are rejections before the parser runs.
  let argv: readonly string[]
  try {
    argv = argvOf(command)
  } catch (e) {
    return Promise.resolve({ command, argv: [], error: (e as Error).message })
  }
  const syntax = shellSyntaxError(command)
  if (syntax !== undefined) return Promise.resolve({ command, argv, error: `bash -n: ${syntax}` })
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
