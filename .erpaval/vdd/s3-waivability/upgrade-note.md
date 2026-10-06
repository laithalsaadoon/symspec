# symspec 2.0.0: upgrade note

This is a major release. One change breaks existing use (waivers), and three things are worth knowing about (format v4 is experimental, how a git refusal is handled, and the repository move).

## What stops working: waivers

A waiver says "a reviewer saw this finding and accepts it". 2.0.0 keeps that only where it is honest.

- **A finding that the tool must not excuse can no longer be waived.** That covers verdict findings (for example a contradiction), triage findings (for example a possible opposition between two requirements), disclosures that mean "this was not compared", hygiene and anchor findings. Waiving any of them, by `symspec waive`, by an `apply` stream or by `import`, is refused with the new error code `ERR_WAIVER_REFUSED` and exit 1. The refusal names the code and its class. The whole stream is refused with it: nothing is written, and the file stays byte for byte as it was. The way to clear such a finding is to change what the document says (reword the requirement, or add the antonym or glossary entry where that is what is true), not to waive it.
- **A waiver must say which requirements it is for.** A waiver by code alone is refused for every code, including the wording and structure findings that can still be waived. A waiver of a wording or structure finding is accepted when it names the requirement ids and carries the content hash of their current text (`refs` plus `contentHash`). If you give ids and no hash, or a single `--ref`, the tool computes the hash from the current text. A hash that does not match the current text is refused with `ERR_USAGE`, as before. The hash binds the text that was reviewed, not the person who reviewed it: anyone who can write the file can produce a matching waiver, and the published scope says so.
- **Waivers already stored in your documents are checked again.** When `check` finds a stored waiver that no longer qualifies (a never-class code, no requirement ids, no hash, a code it does not know, or ids that match no finding), it ignores that waiver and says so: one `info` entry in `data.diagnostics` of kind `waiver-inert`. The entry carries replacement operations you can apply as they are: an `unwaive` op that removes exactly the stored waiver it names, and, for a wording or structure code, one scoped waive (ids plus the current hash) for each finding the old waiver used to cover, with the old reason kept and a fixed marker added. For a never-class code it carries the `unwaive` op and says a rewrite is required, with no waive op. An inert waiver changes nothing else: deleting it changes no finding, no demotion and not `verified`.
- **A waiver with an old hash is listed, not applied.** If the text of a requirement changed since the waiver was reviewed, the finding comes back and the waiver is listed once in `data.ignoredWaivers` with its code, ids, stored hash and current hash. It carries an `unwaive` op and a note that the text must be reviewed again; it does not offer a waive at the new hash.
- **Terminology waivers now work.** A scoped waiver of a terminology finding (`FND_TERM_INCONSISTENT`, `FND_ACRONYM_UNDEFINED`) applies to exactly its own requirements and hash, and is counted in `data.waived` and listed in `data.appliedWaivers`. Every waiver that is applied is listed there with its code, ids and reason.
- **A waived lint can hide a requirement no longer.** If a waived wording defect was what kept a requirement out of the formal checks, the waiver still lets the solver see it, but the run reports a `waived-blocking-lint` demotion and can never say `verified: true`.
- **The advice changed with it.** Repair advice, finding messages, suggestions, help text, the installed skill and the generated docs no longer offer "waive" for a finding that cannot be waived, and every command they print is one this version's CLI accepts and is quoted so a shell reads it as intended. The error catalog now holds 90 codes (24 error, 42 finding, 24 lint); the README and `package.json` say so.
- **The waive-by-code gaps in the gaming harness are closed:** 11 of the 62 known escapes are gone, leaving 51.

## Experimental: format v4 vocabulary, intent and policy

In a version 4 document, the `vocabulary`, `intent` and `policy` keys and a requirement's `intentRef` and `derived` fields are stored and preserved on save, and read by no check tier yet. Their shape may change in a minor release. The schema descriptions, `init --split` (its help, manifest entry and result), AGENTS.md and the README now say so and no longer claim that a check enforces them. The pins in `symspec.config.json` are enforced today and are not experimental. One sentence in the nested vocabulary descriptions still mentions a part-of chain without cycles that the decoder does not check yet; it is a known follow-up.

## When git refuses the document's directory

If git refuses to work in the directory (for example "dubious ownership") and no `symspec.config.json` exists in the document's directory or any directory above it, `check` now runs as if there were no repository, as 1.2.1 did, and discloses git's first refusal line in `data.run.config`. If a `symspec.config.json` does exist there, `check` fails closed with `ERR_CONFIG_INVALID` naming the refusal, and does not load a config from an ancestor directory. The bare-repository refusal stays `ERR_CONFIG_INVALID`. `--config` and `SYMSPEC_CONFIG` behave as before.

## The repository moved

The GitHub account is now `laithalsaadoon`: `package.json` (repository, homepage, bugs), the README install and clone lines and the docs name `github.com/laithalsaadoon/symspec`. The CHANGELOG's older compare links still name the old account. Publishing to npm needs the trusted publisher re-bound to the new repository first; that is a step for the maintainer, not for users.

## Known limitations shipped open

The CLI's output can be cut at the pipe size when a non-zero-exit result is large and the reader is slow (also true of 1.2.1). A few advice commands, and a few corners of the static shell-quoting guard, are listed as follow-ups for the next minor release (owner: Laith).
