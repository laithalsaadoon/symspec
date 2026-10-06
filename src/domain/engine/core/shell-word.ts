/**
 * SHELL WORDS FOR THE COMMANDS THE TOOL PRINTS (R60).
 *
 * The one place an argument of a printed `symspec …` command is quoted. It lives in the
 * engine's core because the engine tier prints commands too (the semantic, quantity-alias and
 * number-spelling advice) and may import nothing outside itself (`package-boundary.test.ts`);
 * every greenfield caller imports it from here as well, so there is exactly one spelling.
 *
 * Pure: no I/O, no imports.
 */

/**
 * ONE ARGUMENT OF A COMMAND THE TOOL PRINTS, QUOTED SO A SHELL HANDS IT OVER WHOLE (R60).
 *
 * Every `symspec …` command an output names is one an agent or a person pastes into a POSIX
 * shell. An argument that carries document text or a user value (a requirement's response, a
 * glossary alias, the document path) can hold a double quote, `$`, a backtick, `;`, a backslash
 * or a newline, and spliced raw between double quotes it either fails to parse
 * (`"mint a "token"`), expands (`"the $HOME badge"`, a backticked substitution), or splits into
 * a second command. So every such argument is rendered here, and nowhere else.
 *
 * The form keeps double quotes, the spelling every published command already uses
 * (`symspec glossary "close the door" "close the doors"`), and backslash-escapes inside them
 * exactly the four characters a double-quoted word still interprets: `"`, `$`, a backtick and
 * `\`. Two characters cannot appear raw even escaped: a backtick, because a command is printed
 * inside a backticked prose span and a raw one would end the span; and a newline, because a
 * command is one line. Those are spelled as an adjacent dollar-single-quoted piece (POSIX.1-2024,
 * bash: `$'\x60'`, `$'\n'`), which the shell joins to the double-quoted pieces into one word.
 */
export const shellQuoted = (text: string): string => {
  const pieces = text.split(/([`\n\r]+)/)
  const out = pieces.map((piece, i) =>
    i % 2 === 1
      ? `$'${[...piece].map((c) => (c === '`' ? '\\x60' : c === '\n' ? '\\n' : '\\r')).join('')}'`
      : piece === ''
        ? ''
        : `"${piece.replace(/["$`\\]/g, '\\$&')}"`,
  )
  const word = out.join('')
  return word === '' ? '""' : word
}

/** The characters a shell word may hold bare: no quoting, globbing, expansion or splitting. */
const BARE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/

/**
 * {@link shellQuoted}, but bare when the value needs no quoting: the form for a document path
 * or a config path, so `symspec check ./requirements.json` reads as it always has and only a
 * path a shell would mangle (a space, a quote, `$`, `;`, a newline) gets quoted (R60).
 */
export const shellWord = (text: string): string => (BARE_WORD.test(text) ? text : shellQuoted(text))
