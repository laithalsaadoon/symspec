/**
 * THE CONTENT HASH a pair-scoped waiver is bound to.
 *
 * A reviewed waiver of a pair finding (`FND_NUMERIC_UNCOMPARED`, `FND_RELATIONAL_UNCHECKED`)
 * records "I read THESE requirements, as they are written NOW, and they are consistent".
 * Scoping it by requirement id alone does not say that: the id survives an edit, so a review of
 * "sound the siren within 2 seconds" / "for at least 30 seconds" kept certifying the pair after
 * both were rewritten to "complete the infusion within 30 minutes" / "for at least 60 minutes" —
 * a conflict nobody reviewed. So the waiver also carries {@link requirementsContentHash} of the
 * requirements it names, and `check` ignores it once the hash no longer matches
 * (`../compat.ts`).
 *
 * ## What is hashed
 *
 * Every field the formal tier reads to decide what a requirement MEANS: the EARS pattern and
 * slots, the negation flag, the effect/constraint classification and its state expression, and
 * the rendered sentence. Metadata that does not change meaning (key, priority, status,
 * verification method, edges, timestamps) is left out, so relabeling a reviewed requirement does
 * not silently resurrect a finding someone triaged.
 *
 * ## Why SHA-256, implemented here
 *
 * The hash guards a certification: a collision is a way to keep a waiver alive over text nobody
 * reviewed, so a non-cryptographic hash (FNV, djb2) that an agent could steer by appending words
 * is not good enough. The domain layer imports nothing from `node:` (it runs wherever the engine
 * does), so the digest is the FIPS 180-4 algorithm in plain TypeScript, pinned against the
 * published test vectors and against `node:crypto` in `content-hash.test.ts`.
 */

import type { Requirement, RequirementsDocument } from './document.ts'

/** SHA-256 round constants: the first 32 bits of the fractional cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))

/** The lowercase hex SHA-256 digest of `text`'s UTF-8 bytes. */
export const sha256Hex = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  // Message + 0x80 + zero padding + 64-bit big-endian bit length, to a multiple of 64 bytes.
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = bytes.length * 8
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x1_0000_0000))
  view.setUint32(padded.length - 4, bitLength >>> 0)

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(offset + t * 4)
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15]!
      const b = w[t - 2]!
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!]
    for (let t = 0; t < 64; t++) {
      const t1 =
        (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t]! + w[t]!) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0]! + a) >>> 0
    h[1] = (h[1]! + b) >>> 0
    h[2] = (h[2]! + c) >>> 0
    h[3] = (h[3]! + d) >>> 0
    h[4] = (h[4]! + e) >>> 0
    h[5] = (h[5]! + f) >>> 0
    h[6] = (h[6]! + g) >>> 0
    h[7] = (h[7]! + hh) >>> 0
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('')
}

/** The meaning-bearing fields of one requirement, in a fixed order, absent as `null`. */
const meaningOf = (r: Requirement): readonly unknown[] => [
  r.id,
  r.patternType,
  r.preCondition ?? null,
  r.trigger ?? null,
  r.systemName,
  r.systemResponse,
  r.negated,
  r.responseKind ?? null,
  r.stateEffect ?? null,
  r.stateConstraint ?? null,
  r.sentence,
]

/**
 * The content hash of the requirements `ids` names, as `sha256:<hex>`, independent of the order
 * the ids are given in. `undefined` when an id names no requirement: there is no content to bind
 * to, and a waiver over a deleted requirement must not match anything.
 */
export const requirementsContentHash = (
  document: Pick<RequirementsDocument, 'requirements'>,
  ids: readonly string[],
): string | undefined => {
  const rows: (readonly unknown[])[] = []
  for (const id of [...new Set(ids)].sort()) {
    const requirement = document.requirements[id]
    if (requirement === undefined) return undefined
    rows.push(meaningOf(requirement))
  }
  return `sha256:${sha256Hex(JSON.stringify(rows))}`
}
