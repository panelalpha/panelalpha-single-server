import type { McpToken } from '@/entities/mcp/mcp.api'
import { describe, expect, it } from 'vitest'
import { numberOfPages, showTokensFooter, sortTokens, TOKEN_HEADERS } from './mcp-tokens-table'

function token (id: number, overrides: Partial<McpToken> = {}): McpToken {
  return { id, name: `Token ${id}`, last_used_at: null, revoked_at: null, created_at: '2026-10-01T10:00:00Z', ...overrides }
}

describe('mcp-tokens-table', () => {
  it('has the six legacy columns, three of them sortable', () => {
    expect(TOKEN_HEADERS.map(header => header.value)).toEqual(['name', 'token_value', 'last_used_at', 'created_at', 'status', 'actions'])
    expect(TOKEN_HEADERS.filter(header => header.sortable).map(header => header.value)).toEqual(['name', 'last_used_at', 'created_at'])
  })

  it('sorts by name (general V2 sort rules are covered by the kit test)', () => {
    const tokens = [token(1, { name: 'beta' }), token(2, { name: 'Alpha' }), token(3, { name: 'gamma' })]
    expect(sortTokens(tokens, 'name', false).map(item => item.id)).toEqual([2, 1, 3])
    expect(sortTokens(tokens, 'name', true).map(item => item.id)).toEqual([3, 1, 2])
  })

  it('a never-used token (null last_used_at) sorts first ascending, last descending', () => {
    const tokens = [
      token(1, { last_used_at: '2026-10-04T10:00:00Z' }),
      token(2, { last_used_at: null }),
      token(3, { last_used_at: '2026-10-05T10:00:00Z' }),
    ]
    expect(sortTokens(tokens, 'last_used_at', false).map(item => item.id)).toEqual([2, 1, 3])
    expect(sortTokens(tokens, 'last_used_at', true).map(item => item.id)).toEqual([3, 1, 2])
  })

  it('sorts by creation date', () => {
    const tokens = [
      token(1, { created_at: '2026-10-03T10:00:00Z' }),
      token(2, { created_at: '2026-10-01T10:00:00Z' }),
      token(3, { created_at: '2026-10-02T10:00:00Z' }),
    ]
    expect(sortTokens(tokens, 'created_at', false).map(item => item.id)).toEqual([2, 3, 1])
  })

  it('counts pages', () => {
    expect(numberOfPages(0, 10)).toBe(0)
    expect(numberOfPages(10, 10)).toBe(1)
    expect(numberOfPages(11, 10)).toBe(2)
  })

  it('hides the footer for one page of the smallest size only', () => {
    expect(showTokensFooter(1, 10)).toBe(false)
    expect(showTokensFooter(2, 10)).toBe(true)
    expect(showTokensFooter(1, 25)).toBe(true)
  })
})
