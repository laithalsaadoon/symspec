/**
 * EVERY `symspec …` COMMAND THE SOURCE RENDERS, FOUND STATICALLY AND JUDGED FOR SHELL SAFETY (R63).
 *
 * Example tests reach only the sites a document happens to exercise; review R8 and R9 were four
 * sites no example reached. So this module reads the SOURCE: it walks every string-valued
 * expression of a TypeScript program with the compiler API and its type checker, finds each
 * place that renders a `symspec` command, and judges every value interpolated into it.
 *
 * ## What counts as a rendered command (the forms it covers)
 *
 * A string-valued expression is flattened into literal text and holes first:
 * - a string literal and a template literal (`form: 'string' | 'template'`);
 * - a `+` chain that holds a string or template literal (`form: 'concat'`), flattened across
 *   parentheses and nested templates, so a command split over `'…`symspec ' + x + '`'` is one;
 * - an array literal joined with a string literal (`[…, 'symspec', 'check', p].join(' ')`,
 *   `form: 'join'`), every element a hole unless it is a literal;
 * - a hole whose value is a compile-time string (a `const` bound to a literal, a single string
 *   literal type, a parameter defaulted to `'symspec'` as a program name such as the skill
 *   body's `binName`) is inlined as literal text, so the literal checks below judge it.
 *
 * In the flattened text, a `symspec` command starts at `symspec ` (after any `NAME=value`
 * environment prefix) and is either a backticked span (to the next backtick), the whole string
 * when the string is a command (no backtick anywhere, its verb an operation), or one line of a
 * multi-line string that starts with the command (a fenced block, its verb an operation). Any
 * other `symspec ` is prose and is counted, not judged.
 *
 * ## The judgement (R63)
 *
 * Inside a command's extent, every hole must be one of:
 * - a call of `shellWord` or `shellQuoted` from `src/domain/engine/core/shell-word.ts`, or of a
 *   `const` alias of one, or a `const` bound to such a call, or a conditional / `??` / `||`
 *   whose every branch is one of these;
 * - a value whose static type is a branded type declared in that module;
 * - a value whose static type cannot carry shell syntax: a number, bigint or boolean, or a union
 *   of string literal types each of which is a bare shell word or a `<…>` placeholder.
 * Inside a quoted region of the literal text only the last kind is accepted (a raw value inside
 * `"…"` is the R8 defect, and a quoted one would be quoted twice). The literal text itself
 * must be shell-inert outside quotes: no `|`, `;`, `&`, `(`, `)`, `>`, `$`, glob or brace
 * character, no `<` that does not open a `<…>` placeholder (R9: a choice list is one placeholder,
 * `<bool|int|enum>`), no `#` or `~` starting a word, no newline, and no quote left open.
 *
 * Pure apart from reading the files the program names; `typescript` is a devDependency.
 */

import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/** The one shell-word helper module (R60). */
export const SHELL_WORD_MODULE = fileURLToPath(
  new URL('../domain/engine/core/shell-word.ts', import.meta.url),
)

/** The repository root, for repo-relative `file:line` names. */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** The helper functions of {@link SHELL_WORD_MODULE} a value may pass through. */
const HELPERS: ReadonlySet<string> = new Set(['shellWord', 'shellQuoted'])

/** A bare shell word: nothing a POSIX shell quotes, globs, expands or splits (as `shellWord`). */
const BARE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/

/** A placeholder token: `<id>`, `<bool|int|enum>`, `<1..8>`. */
const PLACEHOLDER = /^<[^<>\s"'`]+>$/

/** The syntactic form a command site was found in. */
export type SiteForm = 'string' | 'template' | 'concat' | 'join'

/** How a command was delimited inside its string. */
export type SiteExtent = 'span' | 'whole' | 'line'

/** One rendered `symspec` command and what is wrong with it. */
export interface ShellSite {
  /** Repo-relative path. */
  readonly file: string
  /** 1-based line of the `symspec` word. */
  readonly line: number
  readonly form: SiteForm
  readonly extent: SiteExtent
  /** The command as the source renders it, each hole written `${…}`. */
  readonly command: string
  /** Holes inside the command, and why each was accepted. */
  readonly holes: readonly string[]
  /** Empty when the command is shell-safe by construction. */
  readonly problems: readonly string[]
}

/** What one scan looked at. */
export interface ShellScan {
  /** Source files read. */
  readonly files: number
  /** Every command site, flagged or not. */
  readonly sites: readonly ShellSite[]
  /** `symspec ` occurrences in string expressions that are prose, not a command. */
  readonly prose: readonly ProseMention[]
}

/** A `symspec ` in a string that is not a command: a sentence about the tool. */
export interface ProseMention {
  readonly file: string
  readonly line: number
  /** The text from `symspec ` to the end of its line, holes written `${…}`. */
  readonly text: string
}

/** Every `.ts` file under `dir` that is not a test, sorted. */
export const nonTestSources = (dir: string): readonly string[] => {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(path)
    }
  }
  walk(dir)
  return out.sort()
}

/** The repo's compiler options (tsconfig.json), so types resolve as `tsc` resolves them. */
const repoOptions = (): ts.CompilerOptions => {
  const path = join(REPO_ROOT, 'tsconfig.json')
  const read = ts.readConfigFile(path, (p) => ts.sys.readFile(p))
  return ts.parseJsonConfigFileContent(read.config, ts.sys, REPO_ROOT).options
}

/**
 * A program over `files`, with the repo's options. `virtual` maps an absolute path to source
 * text served in place of (or beside) the disk, for planted-site tests.
 */
export const programOver = (
  files: readonly string[],
  virtual: ReadonlyMap<string, string> = new Map(),
): ts.Program => {
  const options = repoOptions()
  const host = ts.createCompilerHost(options, true)
  const getSourceFile = host.getSourceFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  host.getSourceFile = (name, lang, onError, create) => {
    const text = virtual.get(name)
    return text === undefined
      ? getSourceFile(name, lang, onError, create)
      : ts.createSourceFile(name, text, lang, true)
  }
  host.fileExists = (name) => virtual.has(name) || fileExists(name)
  host.readFile = (name) => virtual.get(name) ?? readFile(name)
  return ts.createProgram({ rootNames: [...files, ...virtual.keys()], options, host })
}

type Piece =
  | { readonly kind: 'text'; readonly text: string; readonly node: ts.Node }
  | { readonly kind: 'hole'; readonly expr: ts.Expression; readonly spread: boolean }

const unwrap = (e: ts.Expression): ts.Expression => {
  let x = e
  while (
    ts.isParenthesizedExpression(x) ||
    ts.isAsExpression(x) ||
    ts.isNonNullExpression(x) ||
    ts.isSatisfiesExpression(x) ||
    ts.isTypeAssertionExpression(x)
  )
    x = x.expression
  return x
}

const isStringy = (e: ts.Expression): boolean => {
  const x = unwrap(e)
  return (
    ts.isStringLiteral(x) ||
    ts.isNoSubstitutionTemplateLiteral(x) ||
    ts.isTemplateExpression(x) ||
    ts.isTaggedTemplateExpression(x) ||
    (isPlus(x) && (isStringy(x.left) || isStringy(x.right)))
  )
}

const isPlus = (e: ts.Node): e is ts.BinaryExpression =>
  ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken

/** `[…].join('<sep>')`: the array and the separator, else undefined. */
const joinOf = (
  e: ts.Node,
): { readonly array: ts.ArrayLiteralExpression; readonly sep: ts.Expression } | undefined => {
  if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return undefined
  if (e.expression.name.text !== 'join') return undefined
  const array = unwrap(e.expression.expression)
  const sep = e.arguments[0]
  if (!ts.isArrayLiteralExpression(array) || sep === undefined) return undefined
  const s = unwrap(sep)
  if (!ts.isStringLiteral(s) && !ts.isNoSubstitutionTemplateLiteral(s)) return undefined
  return { array, sep: s }
}

/** The const string a hole stands for, when it is one at compile time. */
const constantText = (
  checker: ts.TypeChecker,
  expr: ts.Expression,
  depth = 0,
): string | undefined => {
  const x = unwrap(expr)
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return x.text
  if (depth > 4) return undefined
  if (ts.isIdentifier(x)) {
    const decl = declarationOf(checker, x)
    if (decl === undefined) return undefined
    if (ts.isParameter(decl) && decl.initializer !== undefined) {
      // A program name threaded as a parameter (`binName = 'symspec'`): the command's verb word.
      const init = unwrap(decl.initializer)
      return ts.isStringLiteral(init) && init.text === 'symspec' ? 'symspec' : undefined
    }
    if (isConstDeclaration(decl) && decl.initializer !== undefined)
      return constantText(checker, decl.initializer, depth + 1)
  }
  const t = checker.getTypeAtLocation(x)
  return t.isStringLiteral() ? t.value : undefined
}

const declarationOf = (checker: ts.TypeChecker, id: ts.Node): ts.Declaration | undefined => {
  let symbol = checker.getSymbolAtLocation(id)
  if (symbol === undefined) return undefined
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  return symbol.valueDeclaration ?? symbol.declarations?.[0]
}

const isConstDeclaration = (d: ts.Declaration): d is ts.VariableDeclaration =>
  ts.isVariableDeclaration(d) &&
  ts.isVariableDeclarationList(d.parent) &&
  (d.parent.flags & ts.NodeFlags.Const) !== 0

/** Whether the callee is `shellWord` / `shellQuoted` of the helper module, or a const alias. */
const isHelperCallee = (checker: ts.TypeChecker, callee: ts.Expression, depth = 0): boolean => {
  const x = unwrap(callee)
  if (!ts.isIdentifier(x) || depth > 4) return false
  const decl = declarationOf(checker, x)
  if (decl === undefined) return false
  if (decl.getSourceFile().fileName === SHELL_WORD_MODULE)
    return (
      ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && HELPERS.has(decl.name.text)
    )
  return (
    isConstDeclaration(decl) &&
    decl.initializer !== undefined &&
    isHelperCallee(checker, decl.initializer, depth + 1)
  )
}

const declaredInHelperModule = (symbol: ts.Symbol | undefined): boolean =>
  (symbol?.declarations ?? []).some((d) => d.getSourceFile().fileName === SHELL_WORD_MODULE)

/** Why a type cannot carry shell syntax, or undefined when it can. */
const inertType = (t: ts.Type): string | undefined => {
  const parts = t.isUnion() ? t.types : [t]
  const kinds = new Set<string>()
  for (const p of parts) {
    if (p.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike)) kinds.add('number')
    else if (p.flags & ts.TypeFlags.BooleanLike) kinds.add('boolean')
    else if (p.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) kinds.add('nullish')
    else if (p.isStringLiteral() && (BARE_WORD.test(p.value) || PLACEHOLDER.test(p.value)))
      kinds.add('literal word')
    else return undefined
  }
  return [...kinds].sort().join('|')
}

const brandedType = (t: ts.Type): boolean => {
  if (declaredInHelperModule(t.aliasSymbol)) return true
  const parts = t.isIntersection() ? t.types : [t]
  return parts.some(
    (p) => declaredInHelperModule(p.aliasSymbol) || declaredInHelperModule(p.getSymbol()),
  )
}

/** Why a hole is shell-safe, or undefined when it is not shown to be. */
const holeVerdict = (
  checker: ts.TypeChecker,
  expr: ts.Expression,
  spread: boolean,
  quoted: boolean,
  depth = 0,
): string | undefined => {
  const x = unwrap(expr)
  let t = checker.getTypeAtLocation(x)
  if (spread) {
    const element = checker.getIndexTypeOfType(t, ts.IndexKind.Number)
    const arg = (t as ts.TypeReference).typeArguments?.[0]
    t = element ?? arg ?? t
  }
  const inert = inertType(t)
  if (inert !== undefined) return `type ${inert}`
  if (quoted || depth > 4) return undefined
  if (brandedType(t)) return 'branded shell word'
  if (spread) return undefined
  if (ts.isCallExpression(x) && isHelperCallee(checker, x.expression)) return 'shell-word helper'
  if (ts.isConditionalExpression(x)) {
    const a = holeVerdict(checker, x.whenTrue, false, quoted, depth + 1)
    const b = holeVerdict(checker, x.whenFalse, false, quoted, depth + 1)
    return a !== undefined && b !== undefined ? `conditional (${a}; ${b})` : undefined
  }
  if (
    ts.isBinaryExpression(x) &&
    (x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      x.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    const a = holeVerdict(checker, x.left, false, quoted, depth + 1)
    const b = holeVerdict(checker, x.right, false, quoted, depth + 1)
    return a !== undefined && b !== undefined ? `fallback (${a}; ${b})` : undefined
  }
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x))
    return BARE_WORD.test(x.text) || PLACEHOLDER.test(x.text) ? 'literal word' : undefined
  if (ts.isIdentifier(x)) {
    const decl = declarationOf(checker, x)
    if (decl !== undefined && isConstDeclaration(decl) && decl.initializer !== undefined) {
      const v = holeVerdict(checker, decl.initializer, false, quoted, depth + 1)
      return v === undefined ? undefined : `const ${x.text} = ${v}`
    }
  }
  return undefined
}

/** The marker character standing for hole `i` in the flattened text. */
const MARK = (i: number): string => String.fromCharCode(0xe000 + i)
const isMark = (c: string | undefined): boolean =>
  c !== undefined && c.charCodeAt(0) >= 0xe000 && c.charCodeAt(0) < 0xf8ff

/** Literal text, holes and the node each text piece came from. */
const flatten = (checker: ts.TypeChecker, e: ts.Expression, out: Piece[]): void => {
  const x = unwrap(e)
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
    out.push({ kind: 'text', text: x.text, node: x })
  } else if (ts.isTemplateExpression(x)) {
    out.push({ kind: 'text', text: x.head.text, node: x.head })
    for (const span of x.templateSpans) {
      hole(checker, span.expression, false, out)
      out.push({ kind: 'text', text: span.literal.text, node: span.literal })
    }
  } else if (ts.isTaggedTemplateExpression(x)) {
    flatten(checker, x.template, out)
  } else if (isPlus(x) && isStringy(x)) {
    flatten(checker, x.left, out)
    flatten(checker, x.right, out)
  } else {
    hole(checker, x, false, out)
  }
}

const hole = (checker: ts.TypeChecker, e: ts.Expression, spread: boolean, out: Piece[]): void => {
  const text = spread ? undefined : constantText(checker, e)
  if (text !== undefined) out.push({ kind: 'text', text, node: e })
  else out.push({ kind: 'hole', expr: e, spread })
}

const flattenJoin = (
  checker: ts.TypeChecker,
  array: ts.ArrayLiteralExpression,
  sep: string,
  out: Piece[],
): void => {
  array.elements.forEach((el, i) => {
    if (i > 0) out.push({ kind: 'text', text: sep, node: el })
    if (ts.isSpreadElement(el)) hole(checker, el.expression, true, out)
    else flatten(checker, el, out)
  })
}

/** The `NAME=value ` (or lone-hole) words that may precede `symspec` in a command. */
const ENV_PREFIX = /(?:(?:[A-Z_][A-Z0-9_]*=[^\s`]*|[\ue000-\uf8fe](?:=[^\s`]*)?)[ \t]+)*$/u

/** The lexer's verdict on one command's flattened text. */
const lex = (text: string): readonly string[] => {
  const problems: string[] = []
  let state: 'bare' | 'dq' | 'sq' = 'bare'
  let wordStart = true
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? ''
    if (isMark(c)) {
      wordStart = false
      continue
    }
    if (state === 'sq') {
      if (c === "'") state = 'bare'
      continue
    }
    if (state === 'dq') {
      if (c === '\\') i++
      else if (c === '"') state = 'bare'
      else if (c === '$' && /[A-Za-z_{(0-9@*#?$!-]/.test(text[i + 1] ?? ''))
        problems.push(`\`$${text[i + 1] ?? ''}\` expands inside double quotes`)
      else if (c === '\n' || c === '\r') problems.push('a newline inside the command')
      continue
    }
    if (c === ' ' || c === '\t') {
      wordStart = true
      continue
    }
    const atStart = wordStart
    wordStart = false
    if (atStart && c === '#') break
    if (atStart && c === '|' && /^[ \t]/.test(text[i + 1] ?? '')) {
      // ` | ` between words: a pipeline the text spells on purpose; each side is judged.
      wordStart = true
      continue
    }
    if (c === '"') state = 'dq'
    else if (c === "'") state = 'sq'
    else if (c === '$' && text[i + 1] === "'") {
      const end = dollarQuoteEnd(text, i + 2)
      if (end < 0) problems.push("an unterminated `$'…'`")
      i = end < 0 ? text.length : end
    } else if (c === '\\') i++
    else if (c === '<') {
      const m = /^<[^<>\s"'`]+>/u.exec(text.slice(i))
      if (m === null) problems.push('`<` outside quotes that opens no `<…>` placeholder')
      else i += m[0].length - 1
    } else if (c === '\n' || c === '\r') problems.push('a newline inside the command')
    else if ('|;&()>$*?[]{}`'.includes(c)) problems.push(`\`${c}\` outside quotes`)
    else if (atStart && c === '~') problems.push('`~` starts a word')
  }
  if (state !== 'bare') problems.push(`an unterminated ${state === 'dq' ? '"' : "'"} quote`)
  return problems
}

const dollarQuoteEnd = (text: string, from: number): number => {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === "'") return i
  }
  return -1
}

/** Which marks of `text` sit inside a quoted region, by the same quote tracking as {@link lex}. */
const quotedMarks = (text: string): ReadonlySet<string> => {
  const inside = new Set<string>()
  let state: 'bare' | 'dq' | 'sq' = 'bare'
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? ''
    if (isMark(c)) {
      if (state !== 'bare') inside.add(c)
      continue
    }
    if (state === 'sq') {
      if (c === "'") state = 'bare'
    } else if (state === 'dq') {
      if (c === '\\') i++
      else if (c === '"') state = 'bare'
    } else if (c === '"') state = 'dq'
    else if (c === "'") state = 'sq'
    else if (c === '\\') i++
    else if (c === '$' && text[i + 1] === "'") {
      const end = dollarQuoteEnd(text, i + 2)
      i = end < 0 ? text.length : end
    }
  }
  return inside
}

/** A pipeline's left side ends here: `… | symspec …`. */
const PIPED = /\|[ \t]*$/

/**
 * Where the command whose `symspec` word is at `k` (its environment prefix from `p`) starts and
 * ends in the flattened `text`, or undefined when that `symspec` is prose. Fences (two or more
 * backticks) are not span delimiters; their lines are commands by the line rule.
 */
const extentOf = (
  text: string,
  p: number,
  k: number,
  verbOk: boolean,
): { readonly extent: SiteExtent; readonly start: number; readonly end: number } | undefined => {
  const before = text.slice(0, p)
  const singles = [...before.matchAll(/(?<!`)`(?!`)/g)]
  const opener = singles.at(-1)?.index
  if (singles.length % 2 === 1 && opener !== undefined) {
    const lead = text.slice(opener + 1, p)
    if (!/^\s*$/.test(lead) && !PIPED.test(lead)) return undefined
    const close = text.indexOf('`', k)
    return { extent: 'span', start: opener + 1, end: close < 0 ? text.length : close }
  }
  if (!verbOk) return undefined
  if (/^\s*$/.test(before) && !text.includes('`'))
    return { extent: 'whole', start: p, end: text.trimEnd().length }
  const lineStart = text.lastIndexOf('\n', p - 1) + 1
  const lead = text.slice(lineStart, p)
  if (!/^[ \t]*(?:\$ )?$/.test(lead) && !PIPED.test(lead)) return undefined
  const nl = text.indexOf('\n', k)
  return {
    extent: 'line',
    start: PIPED.test(lead) ? lineStart : p,
    end: nl < 0 ? text.length : nl,
  }
}

/** One root string expression's command sites, and how many prose mentions it holds. */
const sitesOf = (
  checker: ts.TypeChecker,
  pieces: readonly Piece[],
  form: SiteForm,
  verbs: ReadonlySet<string>,
  file: ts.SourceFile,
): { readonly sites: ShellSite[]; readonly prose: ProseMention[] } => {
  const holes: Extract<Piece, { kind: 'hole' }>[] = []
  let text = ''
  const origin: { readonly start: number; readonly piece: Piece }[] = []
  for (const p of pieces) {
    origin.push({ start: text.length, piece: p })
    if (p.kind === 'text') text += p.text
    else {
      text += MARK(holes.length)
      holes.push(p)
    }
  }
  const render = (s: string): string =>
    [...s]
      .map((c) => {
        if (!isMark(c)) return c
        const h = holes[c.charCodeAt(0) - 0xe000]
        return h === undefined ? c : `\${${h.spread ? '...' : ''}${h.expr.getText(file)}}`
      })
      .join('')
  const sites: ShellSite[] = []
  const prose: ProseMention[] = []
  const starts = new Set<number>()
  for (const m of text.matchAll(/(?<![\w@/.-])symspec /gu)) {
    const k = m.index
    const before = text.slice(0, k)
    const prefix = ENV_PREFIX.exec(before)?.[0] ?? ''
    const p = k - prefix.length
    const verb = /^symspec ([a-z][a-z-]*|[\ue000-\uf8fe])/u.exec(text.slice(k))?.[1]
    const verbOk = verb !== undefined && (isMark(verb) || verbs.has(verb))
    const found = extentOf(text, p, k, verbOk)
    if (found !== undefined && starts.has(found.start)) continue // a later stage of one pipeline
    if (found === undefined) {
      const nl = text.indexOf('\n', k)
      prose.push({
        file: relative(REPO_ROOT, file.fileName),
        line: lineOf(file, origin, k),
        text: render(text.slice(k, nl < 0 ? text.length : nl)),
      })
      continue
    }
    starts.add(found.start)
    const { extent, start, end } = found
    const command = text.slice(start, end)
    const inQuotes = quotedMarks(command)
    const holeNotes: string[] = []
    const problems: string[] = [...lex(command)]
    for (const c of command) {
      if (!isMark(c)) continue
      const h = holes[c.charCodeAt(0) - 0xe000]
      if (h === undefined) continue
      const shown = `\${${h.spread ? '...' : ''}${h.expr.getText(file)}}`
      const quoted = inQuotes.has(c)
      const why = holeVerdict(checker, h.expr, h.spread, quoted)
      if (why === undefined)
        problems.push(
          quoted
            ? `${shown} is interpolated inside a quoted region`
            : `${shown} does not pass through shellWord/shellQuoted`,
        )
      else holeNotes.push(`${shown}: ${why}`)
    }
    sites.push({
      file: relative(REPO_ROOT, file.fileName),
      line: lineOf(file, origin, k),
      form,
      extent,
      command: render(command),
      holes: holeNotes,
      problems,
    })
  }
  return { sites, prose }
}

/** The 1-based source line of flattened offset `k`. */
const lineOf = (
  file: ts.SourceFile,
  origin: readonly { readonly start: number; readonly piece: Piece }[],
  k: number,
): number => {
  let at = origin[0]
  for (const o of origin) if (o.start <= k) at = o
  if (at === undefined) return 0
  const node = at.piece.kind === 'text' ? at.piece.node : at.piece.expr
  const startLine = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
  if (at.piece.kind !== 'text') return startLine
  // Newlines before the offset inside this piece's raw source text.
  const cookedBefore = at.piece.text.slice(0, k - at.start)
  const nth = cookedBefore.split('symspec ').length - 1
  const raw = node.getText(file)
  let idx = -1
  for (let i = 0; i <= nth; i++) idx = raw.indexOf('symspec ', idx + 1)
  const rawBefore = idx < 0 ? '' : raw.slice(0, idx)
  return startLine + (rawBefore.match(/\n/g)?.length ?? 0)
}

/** Every command site in `files` of `program` (absolute paths). */
export const scanCommandSites = (
  program: ts.Program,
  files: readonly string[],
  verbs: ReadonlySet<string>,
): ShellScan => {
  const checker = program.getTypeChecker()
  const sites: ShellSite[] = []
  const prose: ProseMention[] = []
  let read = 0
  for (const name of files) {
    const file = program.getSourceFile(name)
    if (file === undefined) continue
    read++
    const visit = (node: ts.Node): void => {
      const parent = node.parent
      const operand = parent !== undefined && isPlus(parent) && isStringy(parent)
      const inJoin =
        parent !== undefined &&
        ts.isArrayLiteralExpression(parent) &&
        parent.parent !== undefined &&
        ts.isPropertyAccessExpression(parent.parent) &&
        parent.parent.parent !== undefined &&
        joinOf(parent.parent.parent) !== undefined
      const inTagged = parent !== undefined && ts.isTaggedTemplateExpression(parent)
      const pieces: Piece[] = []
      let form: SiteForm | undefined
      const join = joinOf(node)
      if (join !== undefined) {
        form = 'join'
        flattenJoin(checker, join.array, (join.sep as ts.StringLiteral).text, pieces)
      } else if (!operand && !inJoin && !inTagged && ts.isExpression(node) && isStringy(node)) {
        const x = unwrap(node)
        if (x === node) {
          form = isPlus(x) ? 'concat' : ts.isStringLiteral(x) ? 'string' : 'template'
          flatten(checker, x, pieces)
        }
      }
      if (form !== undefined && pieces.length > 0) {
        const found = sitesOf(checker, pieces, form, verbs, file)
        sites.push(...found.sites)
        prose.push(...found.prose)
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  return { files: read, sites, prose }
}

/** `file:line  command  =>  problem; problem`, one per flagged site. */
export const flaggedLines = (scan: ShellScan): readonly string[] =>
  scan.sites
    .filter((s) => s.problems.length > 0)
    .map((s) => `${s.file}:${s.line}  ${s.command}  =>  ${s.problems.join('; ')}`)
