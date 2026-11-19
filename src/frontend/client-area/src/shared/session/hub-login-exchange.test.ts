import { describe, expect, it } from 'vitest'
import { hubLoginDestination, hubLoginRedirect, readHubTicket } from './hub-login-exchange'

describe('readHubTicket', () => {
  it('reads the ticket from the hash', () => {
    expect(readHubTicket('#ticket=abc.def')).toBe('abc.def')
  })

  it('returns null when the ticket is missing', () => {
    expect(readHubTicket('')).toBeNull()
    expect(readHubTicket('#')).toBeNull()
    expect(readHubTicket('#other=1')).toBeNull()
  })

  it('returns an empty string for an empty ticket', () => {
    expect(readHubTicket('#ticket=')).toBe('')
  })

  it('ignores other parameters', () => {
    expect(readHubTicket('#a=1&ticket=xyz&b=2')).toBe('xyz')
  })
})

describe('hubLoginRedirect', () => {
  const to = { name: 'hub-login', path: '/hub-login', query: { x: '1' } }

  it('redirects the first pass without the hash', () => {
    expect(hubLoginRedirect(to, false)).toEqual({ path: '/hub-login', query: { x: '1' }, replace: true })
  })

  it('lets later passes through', () => {
    expect(hubLoginRedirect(to, true)).toBeUndefined()
  })

  it('ignores other routes', () => {
    expect(hubLoginRedirect({ name: 'login', path: '/login', query: {} }, false)).toBeUndefined()
    expect(hubLoginRedirect({ path: '/hub-login', query: {} }, false)).toBeUndefined()
  })
})

describe('hubLoginDestination', () => {
  it('keeps the project page a ticket for one app names', () => {
    expect(hubLoginDestination('/projects/12')).toBe('/projects/12')
  })

  it('drops anything else: the dashboard', () => {
    for (const redirect of [undefined, null, 12, '', '/projects', '/projects/0', '/projects/012', '/projects/12/../settings', '//evil.example/projects/1', 'https://evil.example/projects/1', '/settings']) {
      expect(hubLoginDestination(redirect)).toBeNull()
    }
  })
})
