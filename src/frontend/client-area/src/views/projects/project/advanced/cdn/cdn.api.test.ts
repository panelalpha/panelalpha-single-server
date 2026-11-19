import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getCdnStatus, purgeCdnCache, setUnderAttackMode } from './cdn.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

describe('cdn.api', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('reads the status from /instances/{id}/cdn/status and returns the under-attack flag and features', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { under_attack_mode: true, features: [{ name: 'waf', title: 'WAF' }] },
    })

    await expect(getCdnStatus(7)).resolves.toEqual({
      under_attack_mode: true,
      features: [{ name: 'waf', title: 'WAF' }],
    })
    expect(api.get).toHaveBeenCalledWith('/instances/7/cdn/status')
  })

  it('falls back to an empty feature list when the status has no features', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false } })

    await expect(getCdnStatus(7)).resolves.toEqual({ under_attack_mode: false, features: [] })
  })

  it('posts the purge without a body', async () => {
    vi.mocked(api.post).mockResolvedValue({})

    await purgeCdnCache(7)

    expect(api.post).toHaveBeenCalledWith('/instances/7/cdn/purge')
    expect(vi.mocked(api.post).mock.calls[0]).toHaveLength(1)
  })

  it('posts the under-attack mode with { enabled }', async () => {
    vi.mocked(api.post).mockResolvedValue({})

    await setUnderAttackMode(7, true)

    expect(api.post).toHaveBeenCalledWith('/instances/7/cdn/under-attack', { enabled: true })
  })
})
