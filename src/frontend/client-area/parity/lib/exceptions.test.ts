// @vitest-environment node
import type { ParityException } from './exceptions'
import { describe, expect, it } from 'vitest'
import { findException, parseExceptions } from './exceptions'

const base = { reason: 'Vuetify 4 primitive limit', approvedBy: 'sebastian', date: '2026-10-01' }

describe('findException', () => {
  it('matches state and variant exactly', () => {
    const exceptions: ParityException[] = [{ ...base, state: 'login-email', variant: 'light-desktop', probe: 'title', property: 'font-size' }]
    expect(findException(exceptions, 'login-email', 'light-desktop', { probe: 'title', property: 'font-size' })).toBe(exceptions[0])
    expect(findException(exceptions, 'login-email', 'dark-desktop', { probe: 'title', property: 'font-size' })).toBeUndefined()
    expect(findException(exceptions, 'login-error', 'light-desktop', { probe: 'title', property: 'font-size' })).toBeUndefined()
  })

  it('accepts * for state and variant, and an omitted variant', () => {
    const star: ParityException[] = [{ ...base, state: '*', variant: '*', probe: 'title' }]
    expect(findException(star, 'anything', 'dark-mobile', { probe: 'title', property: 'color' })).toBeDefined()
    const noVariant: ParityException[] = [{ ...base, state: 'login-email', probe: 'title' }]
    expect(findException(noVariant, 'login-email', 'dark-mobile', { probe: 'title', property: 'color' })).toBeDefined()
  })

  it('matches pixel and missing properties', () => {
    const exceptions: ParityException[] = [
      { ...base, state: '*', property: 'pixel' },
      { ...base, state: '*', probe: 'field-code', property: 'missing' },
    ]
    expect(findException(exceptions, 'login-email', 'light-desktop', { property: 'pixel' })).toBe(exceptions[0])
    expect(findException(exceptions, 'login-email', 'light-desktop', { probe: 'field-code', property: 'missing' })).toBe(exceptions[1])
    expect(findException(exceptions, 'login-email', 'light-desktop', { probe: 'title', property: 'missing' })).toBeUndefined()
  })

  it('caps a pixel exception at maxRatio', () => {
    const exceptions: ParityException[] = [{ ...base, state: 'login-email-pending', property: 'pixel', maxRatio: 0.013 }]
    expect(findException(exceptions, 'login-email-pending', 'light-desktop', { property: 'pixel', ratio: 0.0118 })).toBe(exceptions[0])
    expect(findException(exceptions, 'login-email-pending', 'light-desktop', { property: 'pixel', ratio: 0.013 })).toBe(exceptions[0])
    expect(findException(exceptions, 'login-email-pending', 'light-desktop', { property: 'pixel', ratio: 0.0131 })).toBeUndefined()
    expect(findException(exceptions, 'login-email-pending', 'light-desktop', { property: 'pixel' })).toBeUndefined()
  })

  it('keeps a non-matching probe failing', () => {
    const exceptions: ParityException[] = [{ ...base, state: '*', probe: 'card' }]
    expect(findException(exceptions, 'login-email', 'light-desktop', { probe: 'title', property: 'font-size' })).toBeUndefined()
    expect(findException(exceptions, 'login-email', 'light-desktop', { property: 'pixel' })).toBeUndefined()
  })

  it('treats an omitted property as any property', () => {
    const exceptions: ParityException[] = [{ ...base, state: '*', probe: 'title' }]
    expect(findException(exceptions, 'login-email', 'light-desktop', { probe: 'title', property: 'color' })).toBeDefined()
  })
})

describe('parseExceptions', () => {
  it('rejects non-arrays and entries without a reason', () => {
    expect(() => parseExceptions({})).toThrow()
    expect(() => parseExceptions([{ state: '*', approvedBy: 'a', date: 'd' }])).toThrow(/reason/)
  })

  it('rejects a maxRatio that is not a number', () => {
    expect(() => parseExceptions([{ ...base, state: '*', property: 'pixel', maxRatio: '1.3%' }])).toThrow(/maxRatio/)
  })

  it('accepts a valid list', () => {
    expect(parseExceptions([{ ...base, state: '*' }])).toHaveLength(1)
  })
})
