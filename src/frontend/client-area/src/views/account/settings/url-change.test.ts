import { describe, expect, it } from 'vitest'
import { callbackUrls, isOrigin, isUsablePort, isValidHostname, sitesBaseDomainRules, urlRules } from './url-change'

const t = (key: string) => key

describe('url-change', () => {
  it('accepts a domain name of letters, digits, dots and dashes (trimmed)', () => {
    expect(isValidHostname(' apps.example.com ')).toBe(true)
    expect(isValidHostname('not a domain')).toBe(false)
    expect(isValidHostname('')).toBe(false)
  })

  it('accepts an http(s) origin only, as the backend stores it', () => {
    expect(isOrigin('https://panel.example.com')).toBe(true)
    expect(isOrigin('https://panel.example.com:8443/')).toBe(true)
    expect(isOrigin(' http://10.0.0.1 ')).toBe(true)
    for (const value of ['panel.example.com', 'ftp://panel.example.com', 'https://panel.example.com/admin', 'https://panel.example.com/?a=1', 'https://u:p@panel.example.com', '']) {
      expect(isOrigin(value)).toBe(false)
    }
  })

  it('requires the Application URL, then an origin, then https', () => {
    const [required, port, origin, https] = urlRules(t)

    expect(required!('  ')).toBe('settings.validation.required')
    expect(port!('https://panel.example.com')).toBe(true)
    expect(origin!('panel.example.com')).toBe('settings.validation.url')
    expect(required!('https://panel.example.com')).toBe(true)
    expect(origin!('https://panel.example.com')).toBe(true)
    // The Engine serves the panel over HTTPS only; a value that is no origin is the origin rule's.
    // eslint-disable-next-line unicorn/prefer-https -- the refused http scheme is the point of this assertion
    expect(https!('http://panel.example.com:8080')).toBe('settings.validation.urlHttps')
    expect(https!('https://panel.example.com:8443')).toBe(true)
    expect(https!('panel.example.com')).toBe(true)
  })

  it('names a port no server can listen on instead of a path problem', () => {
    const [, port] = urlRules(t)

    // `new URL()` and the backend's `parse_url()` both refuse these, and would otherwise read as a bad path.
    for (const value of ['https://panel.example.com:99999', 'https://panel.example.com:0', 'http://panel.example.com:65536', 'https://[::1]:99999']) {
      expect(port!(value)).toBe('settings.validation.port')
    }
    for (const value of ['https://panel.example.com:1', 'https://panel.example.com:65535', 'https://panel.example.com:8443', 'https://panel.example.com:99999/path']) {
      expect(port!(value)).toBe(true)
    }
    expect(isUsablePort('https://panel.example.com')).toBe(true)
  })

  it('lets the default domain be empty, else a domain name', () => {
    const [rule] = sitesBaseDomainRules(t)

    expect(rule!('')).toBe(true)
    expect(rule!('apps.example.com')).toBe(true)
    expect(rule!('not a domain')).toBe('settings.validation.domain')
  })

  it('builds one callback per provider', () => {
    expect(callbackUrls('https://panel.example.com', ['google', 'github'])).toEqual([
      'https://panel.example.com/auth/google/callback',
      'https://panel.example.com/auth/github/callback',
    ])
  })
})
