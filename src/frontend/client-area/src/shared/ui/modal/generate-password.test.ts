import { describe, expect, it, vi } from 'vitest'
import { cryptoRandom, generatePassword, type RandomSource } from './generate-password'

function sequence (...values: number[]): RandomSource {
  let index = 0
  return () => values[index++ % values.length]!
}

describe('generatePassword', () => {
  it('defaults to 10 characters', () => {
    expect(generatePassword()).toHaveLength(10)
  })

  it('always holds a lowercase letter, uppercase letter, digit and symbol', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword()
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/\d/)
      expect(password).toMatch(/[!@#$%^&*()]/)
      expect(password).toMatch(/^[a-z\d!@#$%^&*()]+$/i)
    }
  })

  it('honours the length and never goes below the four required sets', () => {
    expect(generatePassword(24)).toHaveLength(24)
    expect(generatePassword(4)).toHaveLength(4)
    expect(generatePassword(1)).toHaveLength(4)
  })

  it('is deterministic for an injected random source', () => {
    expect(generatePassword(10, sequence(0.1, 0.5, 0.9, 0.3))).toBe(generatePassword(10, sequence(0.1, 0.5, 0.9, 0.3)))
  })

  it('shuffles: the required characters do not stay at the front', () => {
    // random 0 picks the first char of every set ("aA0!") and always swaps index i with 0
    const password = generatePassword(4, () => 0)
    expect([...password].toSorted()).toEqual([...'aA0!'].toSorted())
    expect(password).not.toBe('aA0!')
  })

  it('uses the injected source for the picks', () => {
    const picked = generatePassword(4, () => 0.999999)
    expect([...picked].toSorted()).toEqual([...'zZ9)'].toSorted())
  })
})

describe('cryptoRandom', () => {
  it('draws from crypto.getRandomValues into [0, 1)', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues')
    for (let i = 0; i < 200; i++) {
      const value = cryptoRandom()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
