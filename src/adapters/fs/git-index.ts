/**
 * A git INDEX (`<git dir>/index`), read far enough to answer one question the config fence
 * asks: what does a repository's index hold at and under one directory of its work tree?
 *
 * The fence needs this because a nested `.git` entry is only a toplevel of its own when the
 * enclosing repository agrees: it registers the directory as a gitlink (a submodule), or it
 * tracks nothing inside it. An index that tracks a file under the directory is the tell of a
 * marker planted after the files were committed — git would have committed a gitlink instead.
 *
 * Pure: bytes in, an answer out. Index versions 2, 3 and 4 are read (4's path prefix
 * compression included), for SHA-1 and SHA-256 repositories. A split index (the `link`
 * extension) holds only part of the entries, so it is reported unreadable rather than
 * half-read: the caller fails closed on it.
 */

/** What an index holds at and under one directory. */
export type IndexUnder =
  | {
      readonly readable: true
      /** The directory itself is a gitlink entry: a registered submodule. */
      readonly gitlink: boolean
      /** The first path the index tracks inside the directory, if any. */
      readonly tracked: string | undefined
    }
  | { readonly readable: false; readonly why: string }

const SIGNATURE = 'DIRC'
/** The fixed stat fields before an entry's object name: ctime, mtime, dev, ino, mode, uid, gid, size. */
const STAT_BYTES = 40
const MODE_OFFSET = 24
const TYPE_MASK = 0o170000
const GITLINK = 0o160000
const EXTENDED_FLAG = 0x4000
const SPLIT_INDEX_EXTENSION = 'link'

const ascii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + length))

const utf8 = new TextDecoder()

/**
 * What the index `bytes` holds at and under `dir`, a `/`-separated path relative to the work
 * tree's toplevel. `hashBytes` is the repository's object-name length: 20 (SHA-1) or 32 (SHA-256).
 */
export const indexUnder = (bytes: Uint8Array, dir: string, hashBytes: number): IndexUnder => {
  const unreadable = (why: string): IndexUnder => ({ readable: false, why })
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== SIGNATURE) return unreadable('no DIRC header')
  const version = view.getUint32(4)
  if (version < 2 || version > 4) return unreadable(`index version ${version}`)
  const count = view.getUint32(8)
  const end = bytes.length - hashBytes
  const prefix = `${dir}/`
  let gitlink = false
  let tracked: string | undefined
  let previous: Uint8Array = new Uint8Array(0)
  let at = 12
  for (let i = 0; i < count; i++) {
    const start = at
    let cursor = start + STAT_BYTES + hashBytes + 2
    if (cursor > end) return unreadable(`entry ${i} runs past the end`)
    const mode = view.getUint32(start + MODE_OFFSET)
    const flags = view.getUint16(start + STAT_BYTES + hashBytes)
    if (version >= 3 && (flags & EXTENDED_FLAG) !== 0) cursor += 2
    let strip = 0
    if (version === 4) {
      // git's offset varint: 7 bits a byte, high bit continues, each continuation adds one.
      let byte = bytes[cursor++] ?? 0
      strip = byte & 0x7f
      while ((byte & 0x80) !== 0) {
        if (cursor >= end) return unreadable(`entry ${i} runs past the end`)
        byte = bytes[cursor++] ?? 0
        strip = ((strip + 1) << 7) | (byte & 0x7f)
      }
      if (strip > previous.length) return unreadable(`entry ${i} strips past its prefix`)
    }
    const nul = bytes.indexOf(0, cursor)
    if (nul < 0 || nul >= end) return unreadable(`entry ${i} has no terminated path`)
    const suffix = bytes.subarray(cursor, nul)
    const name =
      version === 4
        ? Uint8Array.from([...previous.subarray(0, previous.length - strip), ...suffix])
        : suffix
    previous = name
    const path = utf8.decode(name)
    if (path === dir && (mode & TYPE_MASK) === GITLINK) gitlink = true
    else if (tracked === undefined && (path === dir || path.startsWith(prefix))) tracked = path
    // Versions 2 and 3 pad each entry with 1 to 8 NULs to a multiple of 8 bytes.
    at = version === 4 ? nul + 1 : start + ((nul - start + 8) & ~7)
  }
  while (at + 8 <= end) {
    if (ascii(bytes, at, 4) === SPLIT_INDEX_EXTENSION) {
      return unreadable(
        'it is a split index (core.splitIndex), whose shared entries live elsewhere',
      )
    }
    at += 8 + view.getUint32(at + 4)
  }
  return { readable: true, gitlink, tracked }
}
