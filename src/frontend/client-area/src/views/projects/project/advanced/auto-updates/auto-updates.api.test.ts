import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getAutoUpdates, updateAutoUpdates } from './auto-updates.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}))

describe('auto-updates.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.put).mockReset()
  })

  it('reads the settings from /wordpress/auto-update and returns data.data', async () => {
    const settings = { auto_update: 2, auto_update_plugins: 1, auto_update_themes: 0 }
    vi.mocked(api.get).mockResolvedValue({ data: { data: settings } })

    await expect(getAutoUpdates(7)).resolves.toEqual(settings)
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/auto-update')
  })

  it('puts the full body to the same path and ignores the response', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { anything: true } })
    const body = { auto_update: 1, auto_update_plugins: 0, auto_update_themes: 1 }

    await expect(updateAutoUpdates(7, body)).resolves.toBeUndefined()
    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/auto-update', body)
  })

  it('sends undefined fields as they are, as legacy does after a failed GET', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const body = { auto_update: undefined, auto_update_plugins: undefined, auto_update_themes: 1 }

    await updateAutoUpdates('9', body)

    expect(api.put).toHaveBeenCalledWith('/instances/9/wordpress/auto-update', body)
  })
})
