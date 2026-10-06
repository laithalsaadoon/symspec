/**
 * EVERY RENDERED `symspec …` COMMAND IS SHELL-SAFE BY CONSTRUCTION — the static guard (R63).
 *
 * Example tests find only the sites a document reaches: review R8 named three refusal and
 * usage-error commands (`mutate.ts`, `mutation.ts`) that splice raw user text into a printed
 * command, and R9 a `--type bool|int|enum` choice token that a shell reads as a pipeline, after
 * the R60 sweeps had passed. So this file reads the SOURCE: `testing/shell-sites.ts` walks every
 * non-test `.ts` file under `src/` with the compiler API and judges every value interpolated
 * into a rendered command (the one shell-word helper, a value typed so it cannot carry shell
 * syntax, or a `<…>` placeholder), and the literal text around it.
 *
 * Anti-vacuity: the scan counts the sites it inspected and fails under a recorded floor; an
 * independent line reader confirms every backticked `symspec` line in the tree is a site the
 * scan saw; and each syntactic form the scan claims is planted below and must be flagged at its
 * line (with a safe twin that must not be).
 *
 * The second half pins R8 and R9 through the built CLI: each command those sites print passes
 * `bash -n` and the parser, and a value with `"`, `$`, `$( )`, a backtick or `|` survives as
 * one argument.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allOperations } from './app/operations/index.ts'
import {
  argvOf,
  argvRejections,
  BUNDLE,
  rejectionLines,
  shellSafetyProblem,
  symspecCommandsDeep,
} from './testing/cli-argv.ts'
import {
  flaggedLines,
  nonTestSources,
  programOver,
  REPO_ROOT,
  SHELL_WORD_MODULE,
  type ShellScan,
  scanCommandSites,
} from './testing/shell-sites.ts'

/**
 * The command sites the scan inspected at 6f7e957 (R63's recorded floor). A refactor that merges
 * two commands lowers it by a ruling; a scan that silently stops seeing a form lowers it by
 * accident, which is what this catches.
 */
const SITE_FLOOR = 302

const SRC = join(REPO_ROOT, 'src')
const VERBS: ReadonlySet<string> = new Set(allOperations().map((o) => o.name))

/** What the guard itself refuses before judging anything: a scan that looked at too little. */
const vacuity = (scan: ShellScan, expectedFiles: number, floor: number): readonly string[] => {
  const out: string[] = []
  if (scan.files === 0 || scan.files < expectedFiles)
    out.push(`read ${scan.files} of ${expectedFiles} source files`)
  if (scan.sites.length === 0) out.push('0 command sites inspected')
  else if (scan.sites.length < floor)
    out.push(`${scan.sites.length} command sites inspected, under the recorded floor ${floor}`)
  return out
}

/** Every non-test `.ts` file under `src/`, by node's own recursive listing (not the harness walker). */
const ownWalk = (): readonly string[] =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(SRC, f))
    .sort()

/** Comments blanked (newlines kept), so a doc comment that names a command is not a site. */
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '))

describe('the static shell-safety guard over every rendered command (R63)', () => {
  let files: readonly string[]
  let scan: ShellScan

  beforeAll(() => {
    files = nonTestSources(SRC)
    scan = scanCommandSites(programOver(files), files, VERBS)
  }, 120_000)

  it('[S3-045] the guard reads every non-test .ts file under src/ and inspects at least the recorded floor of command sites (R63 anti-vacuity)', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files).toContain(SHELL_WORD_MODULE)
    // The file list is checked against a second walk, so a walker that skips a directory is caught.
    expect(files).toEqual(ownWalk())
    expect(vacuity(scan, files.length, SITE_FLOOR)).toEqual([])
    // The judgement is live on the real tree: helper calls are recognised as such, not only flagged.
    const helperHoles = scan.sites
      .flatMap((s) => s.holes)
      .filter((h) => /shell-word helper/.test(h))
    expect(helperHoles.length).toBeGreaterThan(10)
  })

  it('[S3-045] an independent line reader finds no backticked `symspec` command line the scan did not inspect (R63 anti-vacuity)', () => {
    const seen = new Set([...scan.sites, ...scan.prose].map((s) => `${s.file}:${String(s.line)}`))
    const missed: string[] = []
    let lines = 0
    for (const file of ownWalk()) {
      const code = withoutComments(readFileSync(file, 'utf8')).split('\n')
      code.forEach((text, i) => {
        if (!/`symspec [a-z<$]/.test(text)) return
        lines++
        const at = `${relative(REPO_ROOT, file)}:${String(i + 1)}`
        if (!seen.has(at)) missed.push(`${at}  ${text.trim()}`)
      })
    }
    expect(lines).toBeGreaterThan(100)
    expect(missed).toEqual([])
  })

  it('[S3-027] [S3-045] every `symspec` command rendered anywhere in src/ interpolates only shell words, inert typed values or `<…>` placeholders, and its literal text is shell-inert (R63, review R8, R9)', () => {
    expect(scan.sites.length).toBeGreaterThanOrEqual(SITE_FLOOR)
    expect(flaggedLines(scan)).toEqual([])
  })

  it('[S3-045] the floor check itself fails on an empty scan and on a scan under the floor (planted)', () => {
    expect(vacuity({ files: 0, sites: [], prose: [] }, 0, SITE_FLOOR)).toEqual([
      'read 0 of 0 source files',
      '0 command sites inspected',
    ])
    const short = { ...scan, sites: scan.sites.slice(0, SITE_FLOOR - 1) }
    expect(vacuity(short, files.length, SITE_FLOOR)).toEqual([
      `${SITE_FLOOR - 1} command sites inspected, under the recorded floor ${SITE_FLOOR}`,
    ])
    expect(vacuity(scan, files.length + 1, SITE_FLOOR)).toEqual([
      `read ${files.length} of ${files.length + 1} source files`,
    ])
  })
})

/**
 * One planted file per syntactic form the guard claims to cover. Each `bad` line holds exactly
 * one unsafe site, on the line the comment `// <- site` marks; each `good` twin holds one site
 * the guard must accept.
 */
const HELPER_IMPORT = "import { shellQuoted, shellWord } from '../domain/engine/core/shell-word.ts'"

interface Plant {
  readonly name: string
  readonly form: string
  readonly source: string
  /** The problem the site must carry. */
  readonly expect: RegExp
}

const BAD: readonly Plant[] = [
  {
    name: 'template-span',
    form: 'template',
    source: 'export const a = (id: string) =>\n  `Run \\`symspec show %{id}\\` now.` // <- site',
    expect: /\$\{id\} does not pass through shellWord\/shellQuoted/,
  },
  {
    name: 'template-whole',
    form: 'template',
    source: 'export const b = (p: string) => [\n  `symspec check %{p}`, // <- site\n]',
    expect: /\$\{p\} does not pass/,
  },
  {
    name: 'string-concat',
    form: 'concat',
    source: "export const c = (id: string) =>\n  'Run `symspec show ' + id + '` now.' // <- site",
    expect: /\$\{id\} does not pass/,
  },
  {
    name: 'template-concat-over-lines',
    form: 'concat',
    source:
      'export const d = (id: string) =>\n  `Rewrite it: ` +\n  `\\`symspec update --ref ` + // <- site\n  `%{id} systemResponse "x"\\`.`',
    expect: /\$\{id\} does not pass/,
  },
  {
    name: 'array-join',
    form: 'join',
    source: "export const e = (p: string) =>\n  ['symspec', 'check', p].join(' ') // <- site",
    expect: /\$\{p\} does not pass/,
  },
  {
    name: 'program-name-parameter',
    form: 'template',
    source: "export const f = (id: string, bin = 'symspec') =>\n  `%{bin} show %{id}` // <- site",
    expect: /\$\{id\} does not pass/,
  },
  {
    name: 'fenced-line',
    form: 'template',
    source:
      'export const g = (id: string) => `\n\\`\\`\\`bash\nsymspec show %{id} // <- site\n\\`\\`\\`\n`',
    expect: /\$\{id\} does not pass/,
  },
  {
    name: 'pipeline-producer',
    form: 'template',
    source:
      'export const h = (x: string) =>\n  `Pipe it: \\`echo %{x} | symspec apply\\`.` // <- site',
    expect: /\$\{x\} does not pass/,
  },
  {
    name: 'raw-value-in-double-quotes',
    form: 'template',
    source: 'export const i = (t: string) =>\n  `\\`symspec glossary "%{t}" "b"\\`` // <- site',
    expect: /\$\{t\} is interpolated inside a quoted region/,
  },
  {
    name: 'helper-value-in-double-quotes',
    form: 'template',
    source: `${HELPER_IMPORT}\nexport const j = (t: string) =>\n  \`\\\`symspec glossary "\${shellQuoted(t)}" "b"\\\`\` // <- site\nexport const unused = shellWord`,
    expect: /\$\{shellQuoted\(t\)\} is interpolated inside a quoted region/,
  },
  {
    name: 'const-bound-to-a-raw-value',
    form: 'template',
    source:
      'export const k = (id: string) => {\n  const w = id.trim()\n  return `symspec show %{w}` // <- site\n}',
    expect: /\$\{w\} does not pass/,
  },
  {
    name: 'environment-prefix-value',
    form: 'template',
    source: 'export const l = (v: string) =>\n  `%{v}=1 symspec check` // <- site',
    expect: /\$\{v\} does not pass/,
  },
  {
    name: 'choice-token',
    form: 'string',
    source:
      "export const m =\n  'Declare it: `symspec state <name> --type bool|int|enum`.' // <- site",
    expect: /`\|` outside quotes/,
  },
  {
    name: 'literal-dollar',
    form: 'string',
    source: "export const n =\n  'symspec show $1' // <- site",
    expect: /`\$` outside quotes/,
  },
]

const GOOD: readonly Plant[] = [
  {
    name: 'helper-direct',
    form: 'template',
    source: `${HELPER_IMPORT}\nexport const a = (id: string) =>\n  \`Run \\\`symspec show \${shellWord(id)}\\\`.\` // <- site\nexport const unused = shellQuoted`,
    expect: /shell-word helper/,
  },
  {
    name: 'helper-const-alias',
    form: 'template',
    source: `${HELPER_IMPORT}\nconst q = shellQuoted\nexport const b = (a: string, c: string) =>\n  \`symspec glossary \${q(a)} \${q(c)}\` // <- site\nexport const unused = shellWord`,
    expect: /shell-word helper/,
  },
  {
    name: 'const-bound-to-helper',
    form: 'template',
    source: `${HELPER_IMPORT}\nexport const c = (p: string) => {\n  const w = shellWord(p)\n  return \`symspec check \${w}\` // <- site\n}\nexport const unused = shellQuoted`,
    expect: /const w = shell-word helper/,
  },
  {
    name: 'number',
    form: 'template',
    source:
      'export const d = (n: number) =>\n  `symspec check ./r.json --timeout-ms %{n * 4}` // <- site',
    expect: /type number/,
  },
  {
    name: 'literal-union',
    form: 'template',
    source:
      "export const e = (k: 'effect' | 'constraint') =>\n  `\\`symspec classify <ref> --kind %{k}\\`` // <- site",
    expect: /type literal word/,
  },
  {
    name: 'placeholder-fallback',
    form: 'template',
    source: `${HELPER_IMPORT}\nexport const f = (id: string | undefined) =>\n  \`symspec show \${id === undefined ? '<id>' : shellWord(id)}\` // <- site\nexport const unused = shellQuoted`,
    expect: /conditional/,
  },
  {
    name: 'choice-placeholder',
    form: 'string',
    source:
      "export const g =\n  'Declare it: `symspec state <name> --type <bool|int|enum>`.' // <- site",
    expect: /^$/,
  },
  {
    name: 'literal-pipeline-and-comment',
    form: 'template',
    source:
      "export const h = `\n\\`\\`\\`bash\necho '{}' | symspec apply --ops /dev/stdin   # one op // <- site\n\\`\\`\\`\n`",
    expect: /^$/,
  },
]

/** Plant sources spell a template hole `%{…}` so this file holds no `${…}` in a plain string. */
const planted = (source: string): string => source.replaceAll('%{', '\x24{')

const PLANT_DIR = join(SRC, '__planted__')
const plantPath = (p: Plant, side: string): string => join(PLANT_DIR, `${side}-${p.name}.ts`)
const siteLine = (p: Plant): number =>
  planted(p.source)
    .split('\n')
    .findIndex((l) => l.includes('// <- site')) + 1

describe('the guard is red on a planted site in each syntactic form it covers (R63)', () => {
  let scan: ShellScan
  beforeAll(() => {
    const virtual = new Map<string, string>([
      ...BAD.map((p) => [plantPath(p, 'bad'), planted(p.source)] as const),
      ...GOOD.map((p) => [plantPath(p, 'good'), planted(p.source)] as const),
    ])
    scan = scanCommandSites(programOver([], virtual), [...virtual.keys()], VERBS)
  }, 120_000)

  it.each(BAD)('[S3-045] flags $name ($form) at its file:line', (p) => {
    const file = relative(REPO_ROOT, plantPath(p, 'bad'))
    const sites = scan.sites.filter((s) => s.file === file)
    expect(sites.map((s) => s.line)).toEqual([siteLine(p)])
    expect(sites[0]?.form).toBe(p.form)
    expect(sites[0]?.problems.join('; ')).toMatch(p.expect)
    expect(flaggedLines({ ...scan, sites }).join('\n')).toContain(`${file}:${siteLine(p)}  `)
  })

  it.each(GOOD)('[S3-045] accepts the safe twin $name ($form)', (p) => {
    const file = relative(REPO_ROOT, plantPath(p, 'good'))
    const sites = scan.sites.filter((s) => s.file === file)
    expect(sites.map((s) => s.line)).toEqual([siteLine(p)])
    expect(sites[0]?.form).toBe(p.form)
    expect(sites[0]?.problems).toEqual([])
    expect((sites[0]?.holes ?? []).join('; ')).toMatch(p.expect)
  })

  it('[S3-045] accepts a value typed with a brand the shell-word module declares, and only that module', () => {
    const shim = `${readFileSync(SHELL_WORD_MODULE, 'utf8')}\nexport type ShellWord = string & { readonly __shellWord: true }\n`
    const user = join(PLANT_DIR, 'branded.ts')
    const foreign = join(PLANT_DIR, 'foreign-brand.ts')
    const virtual = new Map<string, string>([
      [SHELL_WORD_MODULE, shim],
      [
        user,
        planted(
          "import type { ShellWord } from '../domain/engine/core/shell-word.ts'\nexport const a = (p: ShellWord) => `symspec check %{p}`",
        ),
      ],
      [
        foreign,
        planted(
          'type ShellWord = string & { readonly __shellWord: true }\nexport const b = (p: ShellWord) => `symspec check %{p}`',
        ),
      ],
    ])
    const branded = scanCommandSites(programOver([], virtual), [user, foreign], VERBS)
    expect(branded.sites.map((s) => [s.file.split('/').at(-1), s.problems.length])).toEqual([
      ['branded.ts', 0],
      ['foreign-brand.ts', 1],
    ])
  }, 120_000)
})

// ---------------------------------------------------------------------------
// R8 and R9 through the built CLI
// ---------------------------------------------------------------------------

/** The hazards R63 names: a double quote, `$`, `$( )`, a backtick and `|`, alone and together. */
const HAZARDS: readonly (readonly [string, string])[] = [
  ['a double quote', 'a"b'],
  ['a dollar', 'a$HOME'],
  ['a command substitution', 'a$(printf P)'],
  ['a backtick', 'a`printf P`b'],
  ['a pipe', 'a|b'],
  ['all five at once', 'a"$HOME$(printf P)`printf Q`|b'],
]

const runCli = (cwd: string, ...args: string[]): Record<string, unknown> => {
  const r = spawnSync(process.execPath, [BUNDLE, ...args], { cwd, encoding: 'utf8' })
  return JSON.parse(r.stdout) as Record<string, unknown>
}

/** The `symspec <verb>` commands an envelope's suggestions name. */
const suggested = (envelope: Record<string, unknown>, verb: string): readonly string[] =>
  symspecCommandsDeep(envelope.suggestions).filter((c) => c.startsWith(`symspec ${verb} `))

/** Each command's shell-safety problem with `value` as one whole argument, plus parser rejections. */
const problemsOf = async (named: readonly string[], value?: string): Promise<readonly string[]> => {
  const commands = [...new Set(named)]
  return [
    ...commands.flatMap((c) => {
      const p = shellSafetyProblem(c, value === undefined ? [] : [value])
      return p === undefined ? [] : [`${c}  =>  ${p}`]
    }),
    ...rejectionLines(await argvRejections(commands)),
  ]
}

describe('review R8: refusal and usage-error commands carry the user value as one argument (R63)', () => {
  let dir: string
  let doc: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'symspec-r63-'))
    doc = join(dir, 'r.json')
    runCli(dir, 'init', doc)
  })

  it.each(HAZARDS)(
    '[S3-027] [S3-045] waive of an unknown code holding %s: the `symspec explain --code` it suggests parses and hands the code over whole (R8, mutate.ts waiverClassRefusal)',
    async (_, hazard) => {
      const code = `FND_${hazard}`
      const envelope = runCli(dir, 'waive', code, '--ref', 'R1', '--reason', 'r', '--file', doc)
      expect(envelope.code).toBe('ERR_WAIVER_REFUSED')
      const commands = suggested(envelope, 'explain')
      expect(commands.length).toBe(1)
      expect(await problemsOf(commands, code)).toEqual([])
    },
    60_000,
  )

  it.each(HAZARDS)(
    '[S3-027] [S3-045] state without --type, the name holding %s: the example command parses and hands the name over whole (R8, mutation.ts state)',
    async (_, hazard) => {
      const name = `n${hazard}`
      const envelope = runCli(dir, 'state', name, '--file', doc)
      expect(envelope.code).toBe('ERR_USAGE')
      const commands = suggested(envelope, 'state')
      expect(commands.length).toBe(1)
      expect(await problemsOf(commands, name)).toEqual([])
    },
    60_000,
  )

  it.each(HAZARDS)(
    '[S3-027] [S3-045] classify without --kind, the ref holding %s: the example command parses and hands the ref over whole (R8, mutation.ts classify)',
    async (_, hazard) => {
      const ref = `R${hazard}`
      const envelope = runCli(dir, 'classify', ref, '--file', doc)
      expect(envelope.code).toBe('ERR_USAGE')
      const commands = suggested(envelope, 'classify')
      expect(commands.length).toBe(1)
      expect(await problemsOf(commands, ref)).toEqual([])
    },
    60_000,
  )
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
})

/** The word after `--type`, as the parser would see it with slots filled. */
const typeWord = (command: string): string | undefined => {
  const argv = argvOf(command)
  const at = argv.indexOf('--type')
  return at < 0 ? undefined : argv[at + 1]
}

describe('review R9: a choice list is one placeholder, never shell words (R63)', () => {
  it('[S3-027] [S3-045] an undeclared state variable: every `symspec state` command the refusal names is one invocation, parses, and gives --type one word (R9, state-expr.ts undeclared)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-r63-'))
    try {
      const doc = join(dir, 'r.json')
      runCli(dir, 'init', doc)
      const envelope = runCli(dir, 'state-initial', 'undeclared_flag', '--file', doc)
      expect(envelope.code).toBe('ERR_USAGE')
      const commands = suggested(envelope, 'state')
      expect(commands.length).toBeGreaterThanOrEqual(2)
      expect(await problemsOf(commands)).toEqual([])
      for (const c of commands)
        expect([c, typeWord(c)]).toEqual([c, expect.stringMatching(/^(x|bool|int|enum)$/)])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('[S3-027] [S3-045] explain FND_REACHABILITY_NOT_CHECKED: the state command its description names is one invocation, parses, and gives --type one word (R9 sibling, reachability-codes.ts)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-r63-'))
    try {
      const envelope = runCli(dir, 'explain', '--code', 'FND_REACHABILITY_NOT_CHECKED')
      const commands = symspecCommandsDeep(envelope).filter((c) => c.startsWith('symspec state '))
      expect(commands.length).toBeGreaterThan(0)
      expect(await problemsOf(commands)).toEqual([])
      for (const c of commands)
        expect([c, typeWord(c)]).toEqual([c, expect.stringMatching(/^(x|bool|int|enum)$/)])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('found while pinning R9: `state` takes its name as a positional, so no printed command may pass --name (R56, R63)', () => {
  it('[S3-045] a missing enum member: the `symspec state` command the refusal names parses with the built parser (state-expr.ts enum member)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'symspec-r63-'))
    try {
      const doc = join(dir, 'r.json')
      runCli(dir, 'init', doc)
      runCli(dir, 'state', 'run_state', '--type', 'enum', '--domain', 'A,B', '--file', doc)
      const envelope = runCli(dir, 'state-initial', 'run_state = C', '--file', doc)
      expect(envelope.code).toBe('ERR_USAGE')
      const commands = suggested(envelope, 'state')
      expect(commands.length).toBe(1)
      expect(await problemsOf(commands, 'A,B,C')).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
