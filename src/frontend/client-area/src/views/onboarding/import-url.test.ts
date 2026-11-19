import { describe, expect, it } from 'vitest'
import {
  isContinueAllowed,
  isCurrentResponse,
  isIpAddressValid,
  isValidIpv4,
  normalizeImportUrl,
  optionalIpAddress,
  verificationFromError,
  verificationFromTest,
} from './import-url'

describe('normalizeImportUrl', () => {
  it('prefixes https:// to a url with no scheme', () => {
    expect(normalizeImportUrl('example.com')).toBe('https://example.com')
    expect(normalizeImportUrl('example.com/blog')).toBe('https://example.com/blog')
  })

  it('keeps a url that already has a scheme', () => {
    expect(normalizeImportUrl('https://example.com')).toBe('https://example.com')
    // eslint-disable-next-line unicorn/prefer-https -- the http scheme must be kept as typed, not rewritten
    expect(normalizeImportUrl('http://example.com')).toBe('http://example.com')
  })

  it('leaves the empty field empty, so no request goes out for it', () => {
    expect(normalizeImportUrl('')).toBe('')
  })
})

describe('isContinueAllowed', () => {
  it('allows continue on a detected WordPress site', () => {
    expect(isContinueAllowed('success')).toBe(true)
  })

  it('allows continue anyway on the not-detected warning', () => {
    expect(isContinueAllowed('not-detected')).toBe(true)
  })

  it('keeps continue disabled on an error', () => {
    expect(isContinueAllowed('error_message')).toBe(false)
  })

  it('keeps continue disabled on the empty field', () => {
    expect(isContinueAllowed('empty')).toBe(false)
  })

  it('keeps continue disabled while the check runs', () => {
    expect(isContinueAllowed('loading')).toBe(false)
  })
})

describe('ip address rules', () => {
  it('accepts a valid IPv4 and rejects out-of-range or malformed values', () => {
    expect(isValidIpv4('203.0.113.10')).toBe(true)
    expect(isValidIpv4('256.0.0.1')).toBe(false)
    expect(isValidIpv4('203.0.113')).toBe(false)
  })

  it('treats an empty ip as valid and a filled invalid one as invalid', () => {
    expect(isIpAddressValid('')).toBe(true)
    expect(isIpAddressValid(' '.repeat(3))).toBe(true)
    expect(isIpAddressValid('abc')).toBe(false)
  })

  it('sends the trimmed ip only when it is valid', () => {
    expect(optionalIpAddress(' 203.0.113.10 ')).toBe('203.0.113.10')
    expect(optionalIpAddress('')).toBeUndefined()
    expect(optionalIpAddress('999.0.0.1')).toBeUndefined()
  })
})

describe('verificationFromTest and verificationFromError', () => {
  it('maps a detected WordPress to success', () => {
    expect(verificationFromTest({ wordpress_detected: true })).toEqual({ state: 'success', message: null })
  })

  it('maps an error_message to the error state with its text', () => {
    expect(verificationFromTest({ wordpress_detected: false, error_message: 'Host unreachable' }))
      .toEqual({ state: 'error_message', message: 'Host unreachable' })
  })

  it('maps a plain answer without WordPress to the not-detected warning', () => {
    expect(verificationFromTest({ wordpress_detected: false })).toEqual({ state: 'not-detected', message: null })
  })

  it('maps a failed request to the error state', () => {
    expect(verificationFromError('Network error')).toEqual({ state: 'error_message', message: 'Network error' })
  })
})

describe('isCurrentResponse', () => {
  it('accepts the response of the latest check', () => {
    expect(isCurrentResponse(3, 3)).toBe(true)
  })

  it('drops a stale response once a newer check started', () => {
    expect(isCurrentResponse(2, 3)).toBe(false)
  })
})
