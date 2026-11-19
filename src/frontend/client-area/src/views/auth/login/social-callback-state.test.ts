import { describe, expect, it } from 'vitest'
import { resolveResellerDomainRedirect } from './social-callback-state'

const href = 'https://app.example.com:2140/auth/google/callback?code=abc&state=x'
const state = (value: unknown) => JSON.stringify(value)

describe('resolveResellerDomainRedirect', () => {
  it('swaps hostname and keeps port, path and query', () => {
    expect(resolveResellerDomainRedirect(href, state({ reseller_domain: 'reseller.test' })))
      .toBe('https://reseller.test:2140/auth/google/callback?code=abc&state=x')
  })

  it('returns null for the same host', () => {
    expect(resolveResellerDomainRedirect(href, state({ reseller_domain: 'app.example.com' }))).toBeNull()
  })

  it('returns null for the same host written in a different case', () => {
    expect(resolveResellerDomainRedirect(href, state({ reseller_domain: 'App.Example.com' }))).toBeNull()
  })

  it('returns null for unparsable state', () => {
    expect(resolveResellerDomainRedirect(href, 'xyz')).toBeNull()
  })

  it.each(['null', '123', '[]', '"str"'])('returns null for JSON %s', value => {
    expect(resolveResellerDomainRedirect(href, value)).toBeNull()
  })

  it('returns null without reseller_domain', () => {
    expect(resolveResellerDomainRedirect(href, state({ other: 1 }))).toBeNull()
  })

  it('returns null for undefined and non-string params', () => {
    expect(resolveResellerDomainRedirect(href, undefined)).toBeNull()
    expect(resolveResellerDomainRedirect(href, ['a'])).toBeNull()
    expect(resolveResellerDomainRedirect(href, null)).toBeNull()
  })
})
