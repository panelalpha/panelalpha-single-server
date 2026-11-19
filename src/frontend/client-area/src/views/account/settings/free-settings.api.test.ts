import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getFreeSettings, updateFreeSettings, updateFreeUrl } from './free-settings.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}))

describe('free-settings.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('getFreeSettings reads GET /community/settings and returns the flat body', async () => {
    const body = { name: 'Box', url: 'https://a.test', default_language: 'en', default_date_format: 'DD.MM.YYYY', languages: ['en'], date_formats: ['YYYY-MM-DD'] }
    vi.mocked(api.get).mockResolvedValue({ data: body })

    await expect(getFreeSettings()).resolves.toEqual(body)
    expect(api.get).toHaveBeenCalledWith('/community/settings')
  })

  it('updateFreeSettings sends the snake_case payload with PUT /community/settings', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await updateFreeSettings({ name: 'Box', default_language: 'pl', default_date_format: 'YYYY-MM-DD' })
    expect(api.put).toHaveBeenCalledWith('/community/settings', { name: 'Box', default_language: 'pl', default_date_format: 'YYYY-MM-DD' })
  })

  it('updateFreeUrl sends { url } with PUT /community/settings/url and returns the body', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { url: 'https://new.test' } })

    await expect(updateFreeUrl('https://new.test')).resolves.toEqual({ url: 'https://new.test' })
    expect(api.put).toHaveBeenCalledWith('/community/settings/url', { url: 'https://new.test' })
  })
})
