import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { setDnsAlerts } from './instance-dns.api'

vi.mock('@/shared/api/client', () => ({
  api: { put: vi.fn() },
}))

describe('instance-dns.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enables the alerts on the enable path and returns the stored flag', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: { data: true } })

    expect(await setDnsAlerts(9, true)).toBe(true)
    expect(api.put).toHaveBeenCalledWith('/instances/9/dns/alerts/enable')
  })

  it('disables the alerts on the disable path and returns the stored flag', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: { data: false } })

    expect(await setDnsAlerts(9, false)).toBe(false)
    expect(api.put).toHaveBeenCalledWith('/instances/9/dns/alerts/disable')
  })

  it('lets a failed request reject, so the caller can show the error', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('boom'))

    await expect(setDnsAlerts(9, true)).rejects.toThrow('boom')
  })
})
