import { describe, expect, it } from 'vitest'
import { api } from '@/shared/api/client'
import { mcpServerUrl, mcpUrl } from './mcp-url'

const host = { hostname: 'app.example.com', port: '', protocol: 'https:' }

describe('mcpUrl', () => {
  it('strips the final /api of an absolute base and appends /mcp', () => {
    expect(mcpUrl('https://api.example.com/api', host)).toBe('https://api.example.com/mcp')
  })

  it('strips trailing slashes first', () => {
    expect(mcpUrl('https://api.example.com/api///', host)).toBe('https://api.example.com/mcp')
  })

  it('keeps a base that does not end in /api', () => {
    expect(mcpUrl('https://api.example.com/v2', host)).toBe('https://api.example.com/v2/mcp')
  })

  it('gives a relative /api base the page origin legacy derives (no port) and the page protocol', () => {
    expect(mcpUrl('/api', host)).toBe('https://app.example.com/mcp')
  })

  it('adds the port to a relative base', () => {
    expect(mcpUrl('/api', { hostname: '157.180.19.206', port: '8444', protocol: 'https:' })).toBe('https://157.180.19.206:8444/mcp')
  })

  it('follows the page protocol (http)', () => {
    expect(mcpUrl('/api', { hostname: 'localhost', port: '5173', protocol: 'http:' })).toBe('http://localhost:5173/mcp')
  })

  it('gives a protocol-relative base the page protocol', () => {
    expect(mcpUrl('//157.180.19.206:8444/api', host)).toBe('https://157.180.19.206:8444/mcp')
  })

  it('falls back to /mcp for an empty base', () => {
    expect(mcpUrl(undefined, host)).toBe('/mcp')
  })
})

describe('mcpServerUrl', () => {
  it('builds the URL from the HTTP client base and the page location', () => {
    const previous = api.defaults.baseURL
    api.defaults.baseURL = 'https://api.example.com/api'
    try {
      expect(mcpServerUrl()).toBe('https://api.example.com/mcp')
    } finally {
      api.defaults.baseURL = previous
    }
  })
})
