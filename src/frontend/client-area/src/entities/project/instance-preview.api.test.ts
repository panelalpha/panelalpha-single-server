import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { createPreviewSite } from './instance-preview.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

describe('instance-preview.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts to the preview endpoint without a body and returns the instance (data.data) with its preview_site', async () => {
    const instance = { id: 5, url: 'https://acme.example.test', preview_site: { url: 'https://tmp.example.test', valid_until: '1900000000' } }
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: instance } })

    expect(await createPreviewSite(5)).toEqual(instance)
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/instances/5/preview')
  })

  it('rejects when the request fails, so the caller can show the error', async () => {
    const failure = new Error('network')
    vi.mocked(api.post).mockRejectedValueOnce(failure)

    await expect(createPreviewSite(5)).rejects.toBe(failure)
  })
})
