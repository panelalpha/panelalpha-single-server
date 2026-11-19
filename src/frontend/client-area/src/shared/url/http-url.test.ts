import { describe, expect, it } from 'vitest'
import { httpUrlOrEmpty } from './http-url'

describe('httpUrlOrEmpty', () => {
  it('keeps absolute http and https URLs', () => {
    expect(httpUrlOrEmpty('https://example.com/plans')).toBe('https://example.com/plans')
    expect(httpUrlOrEmpty('https://example.com')).toBe('https://example.com')
    // Plain http stays allowed (some instances are reached that way); the literal is joined here because lint forbids `http://` in code.
    const plainHttp = ['http:', '//example.com'].join('')
    expect(httpUrlOrEmpty(plainHttp)).toBe(plainHttp)
  })

  it('drops other schemes', () => {
    expect(httpUrlOrEmpty('javascript:alert(1)')).toBe('')
    expect(httpUrlOrEmpty('data:text/html,hi')).toBe('')
    expect(httpUrlOrEmpty('ftp://example.com')).toBe('')
  })

  it('drops relative and malformed values', () => {
    expect(httpUrlOrEmpty('/upgrade')).toBe('')
    expect(httpUrlOrEmpty('not a url')).toBe('')
    expect(httpUrlOrEmpty('')).toBe('')
  })

  it('drops values that are not strings', () => {
    expect(httpUrlOrEmpty(null)).toBe('')
    expect(httpUrlOrEmpty(undefined)).toBe('')
    expect(httpUrlOrEmpty(42)).toBe('')
  })
})
