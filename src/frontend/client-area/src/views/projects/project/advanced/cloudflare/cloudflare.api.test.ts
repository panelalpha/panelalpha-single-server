import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  getBrowserCheck,
  getDevelopmentMode,
  getSecurityLevel,
  purgeCache,
  updateBrowserCheck,
  updateDevelopmentMode,
  updateSecurityLevel,
} from './cloudflare.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

describe('cloudflare.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.patch).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('reads the security level from /security and returns data.value', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { value: 'medium' } })

    await expect(getSecurityLevel(7)).resolves.toBe('medium')
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/cloudflare/security')
  })

  it('patches the security level with { value }', async () => {
    vi.mocked(api.patch).mockResolvedValue({})

    await updateSecurityLevel(7, 'under_attack')

    expect(api.patch).toHaveBeenCalledWith('/instances/7/wordpress/cloudflare/security', { value: 'under_attack' })
  })

  it('reads the browser check and returns the raw data.value', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { value: 'on' } })

    await expect(getBrowserCheck(7)).resolves.toBe('on')
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/cloudflare/browser-check')
  })

  it('patches the browser check with a boolean value', async () => {
    vi.mocked(api.patch).mockResolvedValue({})

    await updateBrowserCheck(7, true)

    expect(api.patch).toHaveBeenCalledWith('/instances/7/wordpress/cloudflare/browser-check', { value: true })
  })

  it('reads the development mode and returns the raw data.value', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { value: 'off' } })

    await expect(getDevelopmentMode(7)).resolves.toBe('off')
    expect(api.get).toHaveBeenCalledWith('/instances/7/wordpress/cloudflare/development-mode')
  })

  it('patches the development mode with a boolean value', async () => {
    vi.mocked(api.patch).mockResolvedValue({})

    await updateDevelopmentMode(7, false)

    expect(api.patch).toHaveBeenCalledWith('/instances/7/wordpress/cloudflare/development-mode', { value: false })
  })

  it('posts purge-cache without a body', async () => {
    vi.mocked(api.post).mockResolvedValue({})

    await purgeCache(7)

    expect(api.post).toHaveBeenCalledWith('/instances/7/wordpress/cloudflare/purge-cache')
    expect(vi.mocked(api.post).mock.calls[0]).toHaveLength(1)
  })
})
