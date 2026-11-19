import { describe, expect, it } from 'vitest'
import { isPanelAlphaOnlineHost, openProjectHref, resolveOpenProject } from './open-project'

describe('resolveOpenProject', () => {
  it('opens a panelalpha.online site in a new tab', () => {
    expect(resolveOpenProject({ url: 'site.panelalpha.online' })).toEqual({ kind: 'open', href: 'https://site.panelalpha.online' })
  })

  it('does nothing for a panelalpha.online domain without a url', () => {
    expect(resolveOpenProject({ url: null, domain: 'site.panelalpha.online' })).toEqual({ kind: 'none' })
  })

  it('asks for the preview for any other site', () => {
    expect(resolveOpenProject({ url: 'https://example.com', domain: 'example.com' })).toEqual({ kind: 'preview' })
  })
})

describe('isPanelAlphaOnlineHost', () => {
  it('matches panelalpha.online and its subdomains', () => {
    expect(isPanelAlphaOnlineHost('https://panelalpha.online')).toBe(true)
    expect(isPanelAlphaOnlineHost('https://site-1.panelalpha.online/path')).toBe(true)
    expect(isPanelAlphaOnlineHost('SITE.PanelAlpha.Online.')).toBe(true)
  })

  it('rejects other hosts and look-alikes', () => {
    expect(isPanelAlphaOnlineHost('https://example.com')).toBe(false)
    expect(isPanelAlphaOnlineHost('https://notpanelalpha.online')).toBe(false)
    expect(isPanelAlphaOnlineHost('panelalpha.online.evil.com')).toBe(false)
  })

  it('rejects empty and missing values', () => {
    expect(isPanelAlphaOnlineHost('')).toBe(false)
    expect(isPanelAlphaOnlineHost(null)).toBe(false)
    expect(isPanelAlphaOnlineHost(undefined)).toBe(false)
  })
})

describe('openProjectHref', () => {
  it('keeps an absolute URL', () => {
    expect(openProjectHref('https://a.test')).toBe('https://a.test')
    expect(openProjectHref('https://a.test')).toBe('https://a.test')
  })

  it('adds https to a bare host', () => {
    expect(openProjectHref('a.test')).toBe('https://a.test')
  })
})
