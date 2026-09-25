/**
 * The index reader against indexes REAL git writes: every version it reads, both object
 * formats, and the split index it refuses. A hand-built index would only test the reader
 * against the reader's own idea of the format.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { indexUnder } from './git-index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  }).trim()

/**
 * A repository tracking `docs/requirements.json`, a long-named sibling (so version 4's prefix
 * compression has a shared prefix to strip), an intent-to-add file (the extended flag, which
 * forces version 3), and a gitlink at `vendor/sub`.
 */
const repo = (objectFormat: 'sha1' | 'sha256' = 'sha1'): string => {
  const root = mkdtempSync(join(tmpdir(), 'symspec-index-'))
  dirs.push(root)
  git(root, 'init', '-q', `--object-format=${objectFormat}`)
  mkdirSync(join(root, 'docs', 'deeper'), { recursive: true })
  writeFileSync(join(root, 'docs', 'requirements.json'), '{}\n')
  writeFileSync(join(root, 'docs', 'deeper', 'a-rather-long-file-name.json'), '{}\n')
  writeFileSync(join(root, 'docsite.md'), 'x\n')
  writeFileSync(join(root, 'later.md'), 'x\n')
  git(root, 'add', 'docs', 'docsite.md')
  git(root, 'add', '-N', 'later.md')
  const zero = '0'.repeat(objectFormat === 'sha1' ? 40 : 64)
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${zero.replace(/0$/, '1')},vendor/sub`)
  return root
}

const read = (root: string, dir: string, hashBytes = 20) =>
  indexUnder(readFileSync(join(root, '.git', 'index')), dir, hashBytes)

describe('indexUnder', () => {
  for (const version of ['2', '3', '4']) {
    it(`reads index version ${version}: files under a directory, a gitlink, and a lookalike sibling`, () => {
      const root = repo()
      if (version === '2') git(root, 'rm', '-q', '--cached', 'later.md')
      git(root, 'update-index', '--index-version', version)
      expect(readFileSync(join(root, '.git', 'index')).readUInt32BE(4)).toBe(Number(version))
      expect(read(root, 'docs')).toEqual({
        readable: true,
        gitlink: false,
        tracked: 'docs/deeper/a-rather-long-file-name.json',
      })
      expect(read(root, 'docs/deeper')).toMatchObject({
        tracked: 'docs/deeper/a-rather-long-file-name.json',
      })
      expect(read(root, 'vendor/sub')).toEqual({
        readable: true,
        gitlink: true,
        tracked: undefined,
      })
      // `docsite.md` starts with `docsite` but is not inside `docsite/`.
      expect(read(root, 'docsite')).toEqual({ readable: true, gitlink: false, tracked: undefined })
      expect(read(root, 'elsewhere')).toEqual({
        readable: true,
        gitlink: false,
        tracked: undefined,
      })
    })
  }

  it('reads a SHA-256 repository at its 32-byte object names', () => {
    const root = repo('sha256')
    expect(read(root, 'docs', 32)).toMatchObject({
      readable: true,
      tracked: 'docs/deeper/a-rather-long-file-name.json',
    })
    expect(read(root, 'vendor/sub', 32)).toMatchObject({ gitlink: true })
  })

  it('refuses a split index, and bytes that are not an index', () => {
    const root = repo()
    git(root, 'update-index', '--split-index')
    expect(read(root, 'docs')).toMatchObject({ readable: false })
    expect(indexUnder(new TextEncoder().encode('not an index'), 'docs', 20)).toMatchObject({
      readable: false,
    })
    const truncated = readFileSync(join(repo(), '.git', 'index')).subarray(0, 60)
    expect(indexUnder(truncated, 'docs', 20)).toMatchObject({ readable: false })
  })
})
