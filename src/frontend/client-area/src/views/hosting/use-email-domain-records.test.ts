import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEmailRecordsCache } from './email-domain-records'
import { useEmailDomainRecords } from './use-email-domain-records'

vi.mock('@/entities/domain/dns-google', () => ({ resolveTxt: vi.fn() }))

const { resolveTxt } = await import('@/entities/domain/dns-google')

const domain = {
  id: 1,
  domain: 'example.com',
  dkim_records: [{ name: 'default._domainkey.example.com', value: 'v=DKIM1; p=KEY' }],
  spf_records: [{ name: 'example.com', value: 'v=spf1 -all' }],
}

function answer (map: Record<string, string | null>) {
  vi.mocked(resolveTxt).mockImplementation(name => Promise.resolve(map[name] ?? null))
}

describe('useEmailDomainRecords', () => {
  beforeEach(() => {
    resetEmailRecordsCache()
    vi.mocked(resolveTxt).mockReset()
  })

  it('is loading until the verdicts arrive, then configured', async () => {
    answer({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'v=spf1 -all' })
    const { records, check } = useEmailDomainRecords()

    const pending = check([domain])
    expect(records.value['1']).toEqual({
      spf: { configured: false, loading: true },
      dkim: { configured: false, loading: true },
    })

    await pending
    await flushPromises()
    expect(records.value['1']).toEqual({
      spf: { configured: true, loading: false },
      dkim: { configured: true, loading: false },
    })
  })

  it('ends failed per record type when a record is missing from DNS', async () => {
    answer({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY' })
    const { records, check } = useEmailDomainRecords()

    await check([domain])

    expect(records.value['1']).toEqual({
      spf: { configured: false, loading: false },
      dkim: { configured: true, loading: false },
    })
  })

  it('answers a second check of a resolved domain without a DNS lookup', async () => {
    answer({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'v=spf1 -all' })
    const { records, check } = useEmailDomainRecords()
    await check([domain])
    expect(resolveTxt).toHaveBeenCalledTimes(2)

    await check([domain])

    expect(resolveTxt).toHaveBeenCalledTimes(2)
    expect(records.value['1']?.spf.configured).toBe(true)
    expect(records.value['1']?.spf.loading).toBe(false)
  })
})
