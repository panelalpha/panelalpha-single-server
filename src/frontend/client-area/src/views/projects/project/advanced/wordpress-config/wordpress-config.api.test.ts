import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  createConfig,
  deleteConfig,
  listConfigs,
  updateConfig,
} from './wordpress-config.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('wordpress-config.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.put).mockReset()
    vi.mocked(api.delete).mockReset()
  })

  it('reads the configs from data.data', async () => {
    const configs = [{ name: 'WP_DEBUG', value: 'true', type: 'constant' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: configs } })

    await expect(listConfigs(7)).resolves.toEqual(configs)
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/config')
  })

  it('returns an empty list when the body has no data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} })

    await expect(listConfigs(7)).resolves.toEqual([])
  })

  it('posts the new config to the instance', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    const body = { name: 'WP_DEBUG', value: 'true', type: 'constant' }

    await createConfig(7, body)
    expect(api.post).toHaveBeenCalledWith('/instances/7/wordpress/config', body)
  })

  it('puts the body to the config path with the name encoded', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    const row = { name: 'A B/C', value: 'x', type: 'variable' }

    await updateConfig(7, 'A B/C', row)
    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/config/A%20B%2FC', row)
  })

  it('deletes the config with its type as the body and the name encoded', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await deleteConfig(7, 'A B/C', 'constant')
    expect(api.delete).toHaveBeenCalledWith('/instances/7/wordpress/config/A%20B%2FC', { data: { type: 'constant' } })
  })
})
