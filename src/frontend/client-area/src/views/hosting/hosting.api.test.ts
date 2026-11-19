import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { getEmailDomains, getServerAccountUsage } from './hosting.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
  },
  apiBaseUrl: () => '/api',
}))

describe('hosting.api (legacy Api.cached(0))', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('getServerAccountUsage fetches again on the next second, not within the same one', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: {}, supported_metrics: {} } })

    await getServerAccountUsage(11)
    await getServerAccountUsage(11)
    expect(api.get).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-10-08T12:00:01Z'))
    await getServerAccountUsage(11)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/usage', undefined)
  })

  it('getEmailDomains uses the same 0 TTL and returns the body', async () => {
    const body = { data: [{ id: 1 }], meta: { is_email_dns_records_showed: true } }
    vi.mocked(api.get).mockResolvedValue({ data: body })

    await expect(getEmailDomains(7)).resolves.toEqual(body)

    vi.setSystemTime(new Date('2026-10-08T12:00:01Z'))
    await getEmailDomains(7)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith('/services/7/email/domains', undefined)
  })
})
