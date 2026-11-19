import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { cancelService, listServices } from './services.api'

vi.mock('@/shared/api/client', () => ({ api: { get: vi.fn(), put: vi.fn() } }))

describe('services.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /services returns the data array', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: 1 }] } })
    await expect(listServices()).resolves.toEqual([{ id: 1 }])
    expect(api.get).toHaveBeenCalledWith('/services')
  })

  it('PUT /services/{id}/cancel sends the reason and returns data.data', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { data: { cancel_url: 'https://x.test/c' } } })
    await expect(cancelService(7, 'too expensive indeed')).resolves.toEqual({ cancel_url: 'https://x.test/c' })
    expect(api.put).toHaveBeenCalledWith('/services/7/cancel', { reason: 'too expensive indeed' })
  })

  it('PUT without a body gives undefined', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: undefined })
    await expect(cancelService(7, 'reason long enough')).resolves.toBeUndefined()
  })
})
