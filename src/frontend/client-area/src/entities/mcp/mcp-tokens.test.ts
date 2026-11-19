import type { McpToken } from '@/entities/mcp/mcp.api'
import { describe, expect, it } from 'vitest'
import { hasActiveToken } from '@/entities/mcp/mcp-tokens'

const token = (revoked_at: string | null): McpToken => ({ id: 1, name: 'n', last_used_at: null, revoked_at, created_at: '2026-01-01' })

describe('hasActiveToken', () => {
  it('is false for an empty list', () => {
    expect(hasActiveToken([])).toBe(false)
  })
  it('is false when every token is revoked', () => {
    expect(hasActiveToken([token('2026-01-01'), token('2026-01-02')])).toBe(false)
  })
  it('is true when one token is not revoked', () => {
    expect(hasActiveToken([token('2026-01-01'), token(null)])).toBe(true)
  })
})
