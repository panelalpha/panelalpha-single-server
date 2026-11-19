import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { fetchAppHealth } from './instance-app-health.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn() },
}))

describe('instance-app-health.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gets the app-health endpoint of the instance and returns data.data', async () => {
    const health = { available: true, healthy: true, serving: 'ok', ports: [], checks: [] }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: health } })

    expect(await fetchAppHealth(7)).toEqual(health)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/instances/7/app-health')
  })

  it('rejects when the request fails', async () => {
    const failure = new Error('network')
    vi.mocked(api.get).mockRejectedValueOnce(failure)

    await expect(fetchAppHealth(7)).rejects.toBe(failure)
  })
})
