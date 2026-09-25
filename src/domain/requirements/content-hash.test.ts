import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { requirementsContentHash, sha256Hex } from './content-hash.ts'
import type { Requirement } from './document.ts'

const TS = '2026-01-01T00:00:00.000Z'
const ID_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ID_B = 'aaaaaaaa-0000-4000-8000-00000000000b'

const req = (
  id: string,
  systemResponse: string,
  extra: Partial<Requirement> = {},
): Requirement => ({
  id,
  patternType: 'event-driven',
  trigger: 'the smoke detector trips',
  systemName: 'fire panel',
  systemResponse,
  negated: false,
  sentence: `When the smoke detector trips, the fire panel shall ${systemResponse}.`,
  priority: 'medium',
  status: 'draft',
  derives: [],
  satisfies: [],
  verifies: [],
  refines: [],
  createdAt: TS,
  updatedAt: TS,
  ...extra,
})

const doc = (a: Requirement, b: Requirement) => ({ requirements: { [a.id]: a, [b.id]: b } })

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('agrees with node:crypto across block boundaries and non-ASCII text', () => {
    for (const text of [
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(64),
      'a'.repeat(1000),
      'régler la température à 21 °C — 温度',
    ]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    }
  })
})

describe('requirementsContentHash', () => {
  const a = req(ID_A, 'sound the siren within 2 seconds')
  const b = req(ID_B, 'sound the siren for at least 30 seconds')

  it('is independent of the order the ids are given in', () => {
    expect(requirementsContentHash(doc(a, b), [ID_A, ID_B])).toBe(
      requirementsContentHash(doc(a, b), [ID_B, ID_A]),
    )
  })

  it('changes when a named requirement is reworded', () => {
    const edited = req(ID_B, 'sound the siren after at least 10 seconds')
    expect(requirementsContentHash(doc(a, edited), [ID_A, ID_B])).not.toBe(
      requirementsContentHash(doc(a, b), [ID_A, ID_B]),
    )
  })

  it('changes when the negation flips, even with the response text unchanged', () => {
    const negated = req(ID_B, b.systemResponse, { negated: true })
    expect(requirementsContentHash(doc(a, negated), [ID_A, ID_B])).not.toBe(
      requirementsContentHash(doc(a, b), [ID_A, ID_B]),
    )
  })

  it('ignores metadata that does not change meaning', () => {
    const relabeled = req(ID_B, b.systemResponse, {
      key: 'SIREN-2',
      priority: 'high',
      status: 'approved',
      updatedAt: '2026-02-02T00:00:00.000Z',
    })
    expect(requirementsContentHash(doc(a, relabeled), [ID_A, ID_B])).toBe(
      requirementsContentHash(doc(a, b), [ID_A, ID_B]),
    )
  })

  it('is undefined when an id names no requirement', () => {
    expect(requirementsContentHash(doc(a, b), [ID_A, 'nope'])).toBeUndefined()
  })
})
