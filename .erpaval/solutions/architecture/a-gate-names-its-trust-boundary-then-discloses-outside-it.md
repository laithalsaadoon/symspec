---
title: A gate names its trust boundary, then discloses outside it — parsing .git internals to defend against local edits is an unbounded race
track: design
category: architecture
module: src/adapters/fs/store.ts, src/app/runtime/scope.ts
component: symspec
severity: high
tags: [trust-boundary, pinned-config, ci, fresh-clone, disclosure, git, F11]
applies_when:
  - a gate reads a file whose location an attacker might move (config discovery, baselines)
  - a verifier keeps finding a new local bypass after each hardening round
  - code starts parsing git internals (index formats, worktree registrations, config lines)
pattern: |
  S11's config lookup went through three hardening rounds against local `.git` plants: a fake
  `.git` entry, then a gitfile or symlink naming the enclosing `.git`, then a `git init` over
  committed files. Each round added git-internals parsing: HEAD/objects/refs checks, worktree
  `gitdir` back-pointers, an index reader (v2/v3/v4, SHA-1/SHA-256). Each round was bypassed
  again, by a forged worktree registration, by an `objectformat` line in an unrelated config
  section, and by `git worktree repair`. Every one of those lives under `.git/`, which never
  travels in a push.

  The lead fixed the boundary rather than the parser. The gate is the CI job on a FRESH CLONE,
  plus CODEOWNERS on the config, intent and policy files. Discovery is explicit (`--config`,
  then `SYMSPEC_CONFIG`, then `<git rev-parse --show-toplevel>/symspec.config.json` for the
  realpath'd document directory, then the document's directory with no repository). Every run
  reports `data.run.config: {path, source}`, so the CI job can assert that its own checkout's
  toplevel config governed the run. A local agent can still change what a local run reads, and
  that run discloses it. The scope claim `pinnedConfig` says exactly that.
rule: |
  Before hardening a gate against an attacker, write down where the gate is enforced and what
  content crosses into it. Defend only against what crosses (here, committed content on a fresh
  clone). Everything else gets a DISCLOSURE the enforcement point can assert, not a parser. A
  blocking finding must name a bypass that is reachable through content that crosses the
  boundary.

  Then audit what crosses for the thing you assumed could not. "A `.git` cannot be committed"
  is true, but git discovers a repository WITHOUT a `.git`: any directory holding `HEAD`,
  `objects/` and `refs/` is a bare repository under the default `safe.bareRepository=all`, and
  its committed `config` may name a `core.worktree`. So committed content can hold a repository
  layout after all, and the probe must refuse it: `git -c safe.bareRepository=explicit rev-parse
  --show-toplevel`. That is a git setting, not git-internals parsing.
evidence: |
  `git update-index --add --cacheinfo 100644,<blob>,docs/.git` fails with "Invalid path": a
  nested `.git` cannot be committed. The CLI test "on a fresh clone, committed content cannot
  move the config off the clone's toplevel" pins this.
  The CLI test "on a fresh clone, a committed directory laid out as a bare repository is refused,
  not a toplevel" commits `fake/{HEAD,objects,refs,config(core.worktree=wt)}` with the document
  symlinked into `fake/wt`; without `safe.bareRepository=explicit` a fresh clone read
  `fake/wt/symspec.config.json`, labelled `source: toplevel`, and reported `verified: true`.
