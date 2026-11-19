import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import {
  clearInstanceModeCache,
  getDebugMode,
  getInstanceMode,
  getMaintenanceMode,
  updateInstanceMode,
} from './instance-modes.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

describe('instance-modes.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  it('getInstanceMode reads the mode with a plain GET and answers its status', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { status: true } })

    await expect(getInstanceMode(7, 'debug-mode')).resolves.toBe(true)
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/debug-mode')
  })

  it('getInstanceMode does not read the cache the frame filled', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { status: false } })
    await getMaintenanceMode(7)
    await getInstanceMode(7, 'maintenance-mode')

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('updateInstanceMode sends a PUT with the status in the body', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await updateInstanceMode(7, 'maintenance-mode', true)
    expect(api.put).toHaveBeenCalledWith('/instances/7/wordpress/maintenance-mode', { status: true })
  })

  it('clearInstanceModeCache drops the cached frame read, so the next read goes to the network', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { status: false } })
    await getDebugMode(7)
    await getDebugMode(7)
    expect(api.get).toHaveBeenCalledTimes(1)

    clearInstanceModeCache(7, 'debug-mode')
    await getDebugMode(7)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('clearInstanceModeCache of one mode leaves the other mode cached', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { status: false } })
    await getMaintenanceMode(7)

    clearInstanceModeCache(7, 'debug-mode')
    await getMaintenanceMode(7)
    expect(api.get).toHaveBeenCalledTimes(1)
  })
})
