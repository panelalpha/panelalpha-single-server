import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetNameserverCache, resolveARecord, resolveCnameRecord, resolveNsRecords, resolveNsRecordsByRdap, resolveTxt } from './dns-google'

function answer (json: unknown) {
  return vi.fn().mockResolvedValue({ json: () => Promise.resolve(json) })
}

describe('resolveTxt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks dns.google for the TXT record without referrer or cache', async () => {
    const fetchMock = answer({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 -all"' }] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveTxt('example.com')).resolves.toBe('"v=spf1 -all"')
    expect(fetchMock).toHaveBeenCalledWith('https://dns.google/resolve?name=example.com&type=TXT', { referrerPolicy: 'no-referrer', cache: 'no-cache' })
  })

  it('returns the first TXT answer and skips other record types', async () => {
    vi.stubGlobal('fetch', answer({ Answer: [{ type: 5, data: 'cname.example.com.' }, { type: 16, data: 'first' }, { type: 16, data: 'second' }] }))
    await expect(resolveTxt('example.com')).resolves.toBe('first')
  })

  it('returns null without an answer', async () => {
    vi.stubGlobal('fetch', answer({ Status: 3 }))
    await expect(resolveTxt('example.com')).resolves.toBeNull()
  })

  it('returns null when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(resolveTxt('example.com')).resolves.toBeNull()
  })
})

describe('resolveARecord / resolveCnameRecord', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the A record (type 1) and returns the first A answer', async () => {
    const fetchMock = answer({ Answer: [{ type: 5, data: 'x.' }, { type: 1, data: '192.0.2.1' }, { type: 1, data: '192.0.2.2' }] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveARecord('example.com')).resolves.toBe('192.0.2.1')
    expect(fetchMock).toHaveBeenCalledWith('https://dns.google/resolve?name=example.com&type=1', { referrerPolicy: 'no-referrer', cache: 'no-cache' })
  })

  it('asks for the CNAME record (type 5)', async () => {
    const fetchMock = answer({ Answer: [{ type: 5, data: 'target.example.net.' }] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveCnameRecord('www.example.com')).resolves.toBe('target.example.net.')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://dns.google/resolve?name=www.example.com&type=5')
  })

  it('returns null without an answer or on a failed request', async () => {
    vi.stubGlobal('fetch', answer({ Status: 3 }))
    await expect(resolveARecord('example.com')).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(resolveCnameRecord('example.com')).resolves.toBeNull()
  })
})

describe('resolveNsRecords', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetNameserverCache()
  })

  it('collects the NS answers', async () => {
    vi.stubGlobal('fetch', answer({ Answer: [{ type: 2, data: 'ns1.host.test.' }, { type: 2, data: 'ns2.host.test.' }, { type: 1, data: '192.0.2.1' }] }))
    await expect(resolveNsRecords('example.com')).resolves.toEqual(['ns1.host.test.', 'ns2.host.test.'])
  })

  it('falls back to the NS records of the authority section', async () => {
    vi.stubGlobal('fetch', answer({ Authority: [{ type: 2, data: 'ns.zone.test.' }] }))
    await expect(resolveNsRecords('example.com')).resolves.toEqual(['ns.zone.test.'])
  })

  it('follows the SOA zone name when there are no NS records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Authority: [{ type: 6, name: 'zone.test', data: 'soa' }] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Answer: [{ type: 2, data: 'ns.zone.test.' }] }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveNsRecords('shop.zone.test')).resolves.toEqual(['ns.zone.test.'])
    expect(fetchMock.mock.calls[1]![0]).toBe('https://dns.google/resolve?name=zone.test&type=2')
  })

  it('caches the answer per domain', async () => {
    const fetchMock = answer({ Answer: [{ type: 2, data: 'ns1.host.test.' }] })
    vi.stubGlobal('fetch', fetchMock)

    await resolveNsRecords('example.com')
    await resolveNsRecords('example.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is empty when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(resolveNsRecords('example.com')).resolves.toEqual([])
  })
})

describe('resolveNsRecordsByRdap', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks rdap.org for the domain', async () => {
    const fetchMock = answer({})
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveNsRecordsByRdap('example.com')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith('https://rdap.org/domain/example.com', { referrerPolicy: 'no-referrer', cache: 'no-cache' })
  })

  it('returns [] for a response with nameserver objects (legacy calls endsWith on them and swallows the error)', async () => {
    vi.stubGlobal('fetch', answer({ nameservers: [{ ldhName: 'ns1.host.test' }] }))
    await expect(resolveNsRecordsByRdap('example.com')).resolves.toEqual([])
  })
})
