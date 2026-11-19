import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createToken, deleteToken, listActivityLogs, listTokens, revokeToken } from '@/entities/mcp/mcp.api'
import { api } from '@/shared/api/client'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

describe('connect-ai.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listTokens GETs /mcp-tokens and unwraps data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: 1 }] } })
    await expect(listTokens()).resolves.toEqual([{ id: 1 }])
    expect(api.get).toHaveBeenCalledWith('/mcp-tokens')
  })

  it('listTokens tolerates a missing data array', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} })
    await expect(listTokens()).resolves.toEqual([])
  })

  it('createToken POSTs the trimmed name and returns the created token', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 2, plain_text_token: 'secret' } } })
    await expect(createToken('  Laptop ')).resolves.toEqual({ id: 2, plain_text_token: 'secret' })
    expect(api.post).toHaveBeenCalledWith('/mcp-tokens', { name: 'Laptop' })
  })

  it('revokeToken PUTs /mcp-tokens/{id}/revoke', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    await revokeToken(7)
    expect(api.put).toHaveBeenCalledWith('/mcp-tokens/7/revoke')
  })

  it('deleteToken DELETEs /mcp-tokens/{id}', async () => {
    vi.mocked(api.delete).mockResolvedValue({})
    await deleteToken(7)
    expect(api.delete).toHaveBeenCalledWith('/mcp-tokens/7')
  })

  it('listActivityLogs sends the page and leaves token_name out when empty', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } })
    await listActivityLogs({ page: 2, token_name: '' })
    expect(api.get).toHaveBeenCalledWith('/mcp-activity-logs', { params: { page: 2 } })
  })

  it('listActivityLogs sends token_name when set and returns the paginator', async () => {
    const body = { data: [{ id: 1 }], total: 45, last_page: 3 }
    vi.mocked(api.get).mockResolvedValue({ data: body })
    await expect(listActivityLogs({ page: 1, token_name: 'Laptop' })).resolves.toBe(body)
    expect(api.get).toHaveBeenCalledWith('/mcp-activity-logs', { params: { page: 1, token_name: 'Laptop' } })
  })
})
