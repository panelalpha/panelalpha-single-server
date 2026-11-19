import { describe, expect, it } from 'vitest'
import { passwordChecks } from './password-checks'

describe('passwordChecks', () => {
  it('returns five rows in the order of the hint', () => {
    expect(passwordChecks('').map(check => check.key)).toEqual(['uppercase', 'lowercase', 'number', 'symbol', 'length'])
  })

  it('fails every row for an empty password', () => {
    expect(passwordChecks('').every(check => !check.passed)).toBe(true)
  })

  it('passes every row for a strong password', () => {
    expect(passwordChecks('Secret1!').every(check => check.passed)).toBe(true)
  })

  it('marks only the rows that hold', () => {
    const passed = Object.fromEntries(passwordChecks('abc123').map(check => [check.key, check.passed]))
    expect(passed).toEqual({ uppercase: false, lowercase: true, number: true, symbol: false, length: false })
  })

  it('counts a symbol as anything that is not a letter or a digit', () => {
    expect(passwordChecks('a b').find(check => check.key === 'symbol')?.passed).toBe(true)
    expect(passwordChecks('ab1').find(check => check.key === 'symbol')?.passed).toBe(false)
  })

  it('keeps the ASCII patterns of the setup wizard', () => {
    const passed = (password: string) => Object.fromEntries(passwordChecks(password).map(check => [check.key, check.passed]))
    // Same as before: `é` is a symbol, Cyrillic letters are neither upper nor lower case.
    expect(passed('Passwordé1')).toEqual({ uppercase: true, lowercase: true, number: true, symbol: true, length: true })
    expect(passed('ПАРОЛЬпароль1!')).toEqual({ uppercase: false, lowercase: false, number: true, symbol: true, length: true })
  })

  it('needs 8 characters: 7 fail, 8 pass', () => {
    expect(passwordChecks('Abcde1!').find(check => check.key === 'length')?.passed).toBe(false)
    expect(passwordChecks('Abcde1!x').find(check => check.key === 'length')?.passed).toBe(true)
  })
})
