import { describe, expect, it } from 'vitest'
import { isValidPaymentUrl } from './invoice-actions'

describe('isValidPaymentUrl', () => {
  it('accepts http and https URLs', () => {
    // Built from parts: the lint rule for insecure URLs rewrites an `http:` literal to `https:`.
    expect(isValidPaymentUrl(['http', '://pay.test/1'].join(''))).toBe(true)
    expect(isValidPaymentUrl('https://pay.test/1?token=a')).toBe(true)
  })

  it('rejects other protocols, relative paths and non-strings', () => {
    expect(isValidPaymentUrl('javascript:alert(1)')).toBe(false)
    expect(isValidPaymentUrl('ftp://pay.test/1')).toBe(false)
    expect(isValidPaymentUrl('/billing/pay')).toBe(false)
    expect(isValidPaymentUrl('')).toBe(false)
    expect(isValidPaymentUrl(null)).toBe(false)
    expect(isValidPaymentUrl(undefined)).toBe(false)
  })
})
