import { describe, expect, it } from 'vitest'
import {
  isFourDigitCodeComplete,
  joinFourDigitCode,
  sanitizeDigitInput,
} from './four-digit-code'

describe('sanitizeDigitInput', () => {
  it('keeps a single digit and strips non-digits', () => {
    expect(sanitizeDigitInput('7')).toBe('7')
    expect(sanitizeDigitInput('a3b')).toBe('3')
    expect(sanitizeDigitInput('12')).toBe('1')
    expect(sanitizeDigitInput('')).toBe('')
    expect(sanitizeDigitInput(null)).toBe('')
  })
})

describe('joinFourDigitCode', () => {
  it('joins four digit cells into the verify payload string', () => {
    expect(joinFourDigitCode(['1', '2', '3', '4'])).toBe('1234')
  })

  it('sanitizes each cell before joining', () => {
    expect(joinFourDigitCode(['1x', '2', '', '4a'])).toBe('124')
    expect(joinFourDigitCode(['a', 'b', 'c', 'd'])).toBe('')
  })

  it('handles short arrays without inventing digits', () => {
    expect(joinFourDigitCode(['1', '2'])).toBe('12')
  })
})

describe('isFourDigitCodeComplete', () => {
  it('requires exactly four single digits', () => {
    expect(isFourDigitCodeComplete(['1', '2', '3', '4'])).toBe(true)
    expect(isFourDigitCodeComplete(['1', '2', '3', ''])).toBe(false)
    expect(isFourDigitCodeComplete(['1', '2', '3'])).toBe(false)
    expect(isFourDigitCodeComplete(['12', '3', '4', '5'])).toBe(false)
  })
})
