import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getEdgeCache, purgeEdgeCache, updateDefensiveMode, updateEdgeCache } from './edge-cache.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}))

describe('edge-cache.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.put).mockReset()
  })

  it('reads both switches from GET /wordpress/edge-cache', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { isActive: true, isDefensiveMode: false } })

    await expect(getEdgeCache(7)).resolves.toEqual({ isActive: true, isDefensiveMode: false })
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/edge-cache')
  })

  it('reads a missing or null flag as off', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { isActive: null } })

    await expect(getEdgeCache(7)).resolves.toEqual({ isActive: false, isDefensiveMode: false })
  })

  it('puts the cache status as { status }', async () => {
    vi.mocked(api.put).mockResolvedValue({})

    await updateEdgeCache(7, true)

    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/edge-cache', { status: true })
  })

  it('puts the purge without a body', async () => {
    vi.mocked(api.put).mockResolvedValue({})

    await purgeEdgeCache(7)

    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/edge-cache/purge')
    expect(vi.mocked(api.put).mock.calls[0]).toHaveLength(1)
  })

  it('puts the defensive mode as { status, ttl }', async () => {
    vi.mocked(api.put).mockResolvedValue({})

    await updateDefensiveMode(7, false, 3600)

    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/edge-cache/defensive-mode', { status: false, ttl: 3600 })
  })
})
