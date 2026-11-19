import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { disableWordpressMcp, enableWordpressMcp, getWordpressMcp } from './wordpress-mcp.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

describe('wordpress-mcp.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.delete).mockReset()
  })

  it('reads the status from /wordpress/mcp and returns data.data', async () => {
    const status = { state: 'active', endpoint: 'https://x/mcp', config_json: '{}' }
    vi.mocked(api.get).mockResolvedValue({ data: { data: status, health_check: {} } })

    await expect(getWordpressMcp(7)).resolves.toEqual(status)
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/mcp')
  })

  it('posts to the same path without a body', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })

    await expect(enableWordpressMcp('9')).resolves.toBeUndefined()
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/instances/9/wordpress/mcp')
  })

  it('deletes the same path without a body', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await expect(disableWordpressMcp(9)).resolves.toBeUndefined()
    expect(api.delete).toHaveBeenCalledTimes(1)
    expect(api.delete).toHaveBeenCalledWith('/instances/9/wordpress/mcp')
  })
})
