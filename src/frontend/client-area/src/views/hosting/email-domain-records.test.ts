import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkAllDomains, checkDomainRecords, domainKey, isDomainConfigured, isValidSpfSyntax, normalizeTxt, resetEmailRecordsCache } from './email-domain-records'

vi.mock('@/entities/domain/dns-google', () => ({ resolveTxt: vi.fn() }))

const { resolveTxt } = await import('@/entities/domain/dns-google')
const records = (map: Record<string, string | null>) => vi.mocked(resolveTxt).mockImplementation(name => Promise.resolve(map[name] ?? null))

const domain = {
  id: 1,
  domain: 'example.com',
  dkim_records: [{ name: 'default._domainkey.example.com', value: 'v=DKIM1; p=KEY' }],
  spf_records: [{ name: 'example.com', value: 'v=spf1 include:mail.example.net -all' }],
}

describe('normalizeTxt', () => {
  it('strips quotes, joins split strings and collapses whitespace', () => {
    expect(normalizeTxt('"v=DKIM1; " "p=KEY"')).toBe('v=DKIM1; p=KEY')
    expect(normalizeTxt('  "a   b"  ')).toBe('a b')
    expect(normalizeTxt(null)).toBe('')
  })
})

describe('isValidSpfSyntax', () => {
  it('accepts mechanisms and modifiers after v=spf1', () => {
    expect(isValidSpfSyntax('"v=spf1 ip4:192.0.2.1 a mx include:x.example ~all"')).toBe(true)
    expect(isValidSpfSyntax('v=spf1 redirect=_spf.example.com')).toBe(true)
  })

  it('rejects other TXT values, a bare v=spf1 and unknown tokens', () => {
    expect(isValidSpfSyntax('google-site-verification=abc')).toBe(false)
    expect(isValidSpfSyntax('v=spf1')).toBe(false)
    expect(isValidSpfSyntax('v=spf1 nonsense')).toBe(false)
  })
})

describe('checkAllDomains', () => {
  beforeEach(() => {
    resetEmailRecordsCache()
    vi.mocked(resolveTxt).mockReset()
  })

  it('counts no domains as configured', async () => {
    await expect(checkAllDomains([])).resolves.toBe(true)
    expect(resolveTxt).not.toHaveBeenCalled()
  })

  it('is true when every DKIM value matches and every SPF record is valid', async () => {
    records({
      'default._domainkey.example.com': '"v=DKIM1; p=KEY"',
      'example.com': '"v=spf1 include:mail.example.net -all"',
    })
    await expect(checkAllDomains([domain])).resolves.toBe(true)
  })

  it('is false when a DKIM record is missing or differs', async () => {
    records({ 'example.com': 'v=spf1 -all' })
    await expect(checkAllDomains([domain])).resolves.toBe(false)

    resetEmailRecordsCache()
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=OTHER', 'example.com': 'v=spf1 -all' })
    await expect(checkAllDomains([domain])).resolves.toBe(false)
  })

  it('is false when the SPF record is not an SPF record', async () => {
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'hello' })
    await expect(checkAllDomains([domain])).resolves.toBe(false)
  })

  it('needs every domain to pass', async () => {
    const other = { ...domain, id: 2, domain: 'other.com', spf_records: [{ name: 'other.com', value: 'v=spf1 -all' }] }
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'v=spf1 -all' })
    await expect(checkAllDomains([domain, other])).resolves.toBe(false)
  })

  it('caches the verdict per domain, so a second check does not query DNS again', async () => {
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'v=spf1 -all' })
    await checkAllDomains([domain])
    expect(resolveTxt).toHaveBeenCalledTimes(2)

    await expect(checkAllDomains([domain])).resolves.toBe(true)
    expect(resolveTxt).toHaveBeenCalledTimes(2)
  })
})

describe('checkDomainRecords', () => {
  beforeEach(() => {
    resetEmailRecordsCache()
    vi.mocked(resolveTxt).mockReset()
  })

  it('reports the SPF and the DKIM verdict separately', async () => {
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'v=spf1 -all' })
    await expect(checkDomainRecords(domain)).resolves.toEqual({ spf: true, dkim: true })

    resetEmailRecordsCache()
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=OTHER', 'example.com': 'v=spf1 -all' })
    await expect(checkDomainRecords(domain)).resolves.toEqual({ spf: true, dkim: false })

    resetEmailRecordsCache()
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'hello' })
    await expect(checkDomainRecords(domain)).resolves.toEqual({ spf: false, dkim: true })
  })

  it('counts an empty record list as configured', async () => {
    await expect(checkDomainRecords({ id: 3, domain: 'empty.example.com', dkim_records: [], spf_records: [] }))
      .resolves
      .toEqual({ spf: true, dkim: true })
    expect(resolveTxt).not.toHaveBeenCalled()
  })

  it('answers a cached verdict without a DNS lookup', async () => {
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'v=spf1 -all' })
    await checkDomainRecords(domain)
    expect(resolveTxt).toHaveBeenCalledTimes(2)

    await expect(checkDomainRecords(domain)).resolves.toEqual({ spf: true, dkim: true })
    expect(resolveTxt).toHaveBeenCalledTimes(2)
  })

  it('does not change the domain it checks', async () => {
    records({ 'default._domainkey.example.com': 'v=DKIM1; p=KEY', 'example.com': 'v=spf1 -all' })
    const before = structuredClone(domain)
    await checkDomainRecords(domain)
    expect(domain).toEqual(before)
  })

  it('keys the cache by the API id', () => {
    expect(domainKey(domain)).toBe('1')
    expect(domainKey({ id: 'abc', domain: 'x.example.com' })).toBe('abc')
  })
})

describe('isDomainConfigured', () => {
  it('needs both the DKIM and the SPF verdict', () => {
    expect(isDomainConfigured({ spf: true, dkim: true })).toBe(true)
    expect(isDomainConfigured({ spf: true, dkim: false })).toBe(false)
    expect(isDomainConfigured({ spf: false, dkim: true })).toBe(false)
  })
})
