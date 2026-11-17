import { describe, expect, it } from 'vitest'
import { createNonce } from './googleIdentity'

const sha256Hex = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

describe('createNonce', () => {
  it('returns a random raw nonce and its SHA-256 hex digest', async () => {
    const a = await createNonce()
    const b = await createNonce()
    expect(a.raw).not.toBe(b.raw)
    expect(a.raw.length).toBeGreaterThanOrEqual(40)
    expect(a.hashed).toMatch(/^[0-9a-f]{64}$/)
    expect(a.hashed).toBe(await sha256Hex(a.raw))
    // Known vector, so the hex encoding itself is checked too.
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
