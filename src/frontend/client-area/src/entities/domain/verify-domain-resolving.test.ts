import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveARecord, resolveCnameRecord, resolveNsRecords, resolveNsRecordsByRdap, resolveTxt } from './dns-google'
import { generateIpsFromCidr, getIpv4Addresses, normalizeNs, verifyDomainResolving, type VerifyDomainResolvingInput } from './verify-domain-resolving'

vi.mock('./dns-google', () => ({
  resolveARecord: vi.fn(),
  resolveCnameRecord: vi.fn(),
  resolveNsRecords: vi.fn(),
  resolveNsRecordsByRdap: vi.fn(),
  resolveTxt: vi.fn(),
}))

function input (overrides: Partial<VerifyDomainResolvingInput> = {}, dnsSettings: VerifyDomainResolvingInput['dnsSettings'] = {}): VerifyDomainResolvingInput {
  return {
    domain: 'example.com',
    onboardingSubdomain: null,
    dnsSettings: { verification_methods: ['resolve_a_record'], ...dnsSettings },
    hasDnsServer: false,
    ipv4Addresses: ['192.0.2.10'],
    nameservers: ['ns1.host.test', 'ns2.host.test'],
    hostCNames: [],
    recordsFromDnsServer: [],
    ...overrides,
  }
}

describe('verifyDomainResolving', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resolveARecord).mockResolvedValue(null)
    vi.mocked(resolveCnameRecord).mockResolvedValue(null)
    vi.mocked(resolveNsRecords).mockResolvedValue([])
    vi.mocked(resolveNsRecordsByRdap).mockResolvedValue([])
    vi.mocked(resolveTxt).mockResolvedValue(null)
  })

  it('is true at once without verification methods', async () => {
    expect(await verifyDomainResolving(input({}, { verification_methods: [] }))).toBe(true)
    expect(await verifyDomainResolving(input({}, { verification_methods: undefined }))).toBe(true)
    expect(resolveARecord).not.toHaveBeenCalled()
  })

  it('is true for the onboarding subdomain itself', async () => {
    expect(await verifyDomainResolving(input({ domain: 'x.onboard.test', onboardingSubdomain: 'x.onboard.test' }))).toBe(true)
    expect(resolveARecord).not.toHaveBeenCalled()
  })

  describe('A record', () => {
    it('matches when the first A answer is one of the addresses', async () => {
      vi.mocked(resolveARecord).mockResolvedValue('192.0.2.10')
      expect(await verifyDomainResolving(input())).toBe(true)
    })

    it('fails in any mode when nothing matches, and retries without www.', async () => {
      vi.mocked(resolveARecord).mockResolvedValue('203.0.113.9')
      expect(await verifyDomainResolving(input({ domain: 'www.example.com' }))).toBe(false)
      expect(resolveARecord).toHaveBeenCalledWith('www.example.com')
      expect(resolveARecord).toHaveBeenCalledWith('example.com')
    })

    it('expands CIDR blocks of the account addresses', async () => {
      vi.mocked(resolveARecord).mockResolvedValue('192.0.2.2')
      expect(await verifyDomainResolving(input({ ipv4Addresses: ['192.0.2.0/30'] }))).toBe(true)
    })

    it('skips the check when the CDN records are not ready: true in any mode, no query', async () => {
      expect(await verifyDomainResolving(input({ skipARecordVerification: true }))).toBe(true)
      expect(resolveARecord).not.toHaveBeenCalled()
    })
  })

  describe('NS records', () => {
    const nsInput = (overrides: Partial<VerifyDomainResolvingInput> = {}) => input({ hasDnsServer: true, ...overrides }, { verification_methods: ['resolve_ns_records'] })

    it('is only checked with a DNS server; without it nothing is verified and any mode fails', async () => {
      expect(await verifyDomainResolving(nsInput({ hasDnsServer: false }))).toBe(false)
      expect(resolveNsRecords).not.toHaveBeenCalled()
    })

    it('matches when every nameserver of the domain is expected (case and trailing dot ignored)', async () => {
      vi.mocked(resolveNsRecords).mockResolvedValue(['NS1.host.test.', 'ns2.host.test'])
      expect(await verifyDomainResolving(nsInput())).toBe(true)
    })

    it('does not match when one nameserver is foreign', async () => {
      vi.mocked(resolveNsRecords).mockResolvedValue(['ns1.host.test', 'ns.other.test'])
      expect(await verifyDomainResolving(nsInput())).toBe(false)
    })

    it('asks RDAP only with eager verification', async () => {
      await verifyDomainResolving(nsInput())
      expect(resolveNsRecordsByRdap).not.toHaveBeenCalled()

      vi.mocked(resolveNsRecordsByRdap).mockResolvedValue(['ns1.host.test'])
      expect(await verifyDomainResolving(nsInput({ eagerDnsVerification: true }))).toBe(true)
    })
  })

  describe('CNAME records', () => {
    it('custom: the target ends with a valid address', async () => {
      vi.mocked(resolveCnameRecord).mockResolvedValue('shop.edge.test.')
      const settings = { verification_methods: ['resolve_cname_record_custom'], valid_cname_addresses: ['edge.test'] }
      expect(await verifyDomainResolving(input({}, settings))).toBe(true)
      vi.mocked(resolveCnameRecord).mockResolvedValue('edge.test.')
      expect(await verifyDomainResolving(input({}, settings))).toBe(false)
    })

    it('custom: without valid addresses the method is skipped', async () => {
      expect(await verifyDomainResolving(input({}, { verification_methods: ['resolve_cname_record_custom'], valid_cname_addresses: [] }))).toBe(false)
      expect(resolveCnameRecord).not.toHaveBeenCalled()
    })

    it('onboarding: the target is the onboarding subdomain', async () => {
      vi.mocked(resolveCnameRecord).mockResolvedValue('x.onboard.test.')
      expect(await verifyDomainResolving(input({ onboardingSubdomain: 'x.onboard.test' }, { verification_methods: ['resolve_cname_record_onboarding'] }))).toBe(true)
    })

    it('onboarding: needs an onboarding subdomain', async () => {
      expect(await verifyDomainResolving(input({}, { verification_methods: ['resolve_cname_record_onboarding'] }))).toBe(false)
      expect(resolveCnameRecord).not.toHaveBeenCalled()
    })
  })

  describe('records from DNS servers', () => {
    const recordsInput = (overrides: Partial<VerifyDomainResolvingInput> = {}) => input(overrides, { verification_methods: ['resolve_records_from_dns_servers'] })

    it('matches with no host CNAMEs and no records', async () => {
      expect(await verifyDomainResolving(recordsInput())).toBe(true)
    })

    it('needs the host CNAME to match', async () => {
      expect(await verifyDomainResolving(recordsInput({ hostCNames: ['host.test'] }))).toBe(false)
      vi.mocked(resolveCnameRecord).mockResolvedValue('host.test.')
      expect(await verifyDomainResolving(recordsInput({ hostCNames: ['host.test'] }))).toBe(true)
    })

    it('checks every record by its type and stops at the first miss', async () => {
      vi.mocked(resolveARecord).mockResolvedValue('192.0.2.1')
      vi.mocked(resolveTxt).mockResolvedValue('v=spf1 -all')
      const records = [
        { type: 'A', name: 'example.com', value: '192.0.2.1' },
        { type: 'TXT', name: 'example.com', value: 'v=spf1 -all' },
      ]
      expect(await verifyDomainResolving(recordsInput({ recordsFromDnsServer: records }))).toBe(true)

      vi.mocked(resolveTxt).mockResolvedValue('other')
      expect(await verifyDomainResolving(recordsInput({ recordsFromDnsServer: records }))).toBe(false)
    })
  })

  describe('modes', () => {
    const both = { verification_methods: ['resolve_a_record', 'resolve_cname_record_custom'], valid_cname_addresses: ['edge.test'] }

    it('any: one matching method is enough', async () => {
      vi.mocked(resolveCnameRecord).mockResolvedValue('shop.edge.test')
      expect(await verifyDomainResolving(input({}, both))).toBe(true)
    })

    it('all: every method has to match, the first miss is false', async () => {
      vi.mocked(resolveCnameRecord).mockResolvedValue('shop.edge.test')
      expect(await verifyDomainResolving(input({}, { ...both, verification_mode: 'all' }))).toBe(false)
      vi.mocked(resolveARecord).mockResolvedValue('192.0.2.10')
      expect(await verifyDomainResolving(input({}, { ...both, verification_mode: 'all' }))).toBe(true)
    })

    it('all: methods that cannot run count as satisfied', async () => {
      expect(await verifyDomainResolving(input({}, { verification_methods: ['resolve_ns_records'], verification_mode: 'all' }))).toBe(true)
    })

    it('any other mode value is any', async () => {
      expect(await verifyDomainResolving(input({}, { verification_mode: 'whatever' }))).toBe(false)
    })
  })
})

describe('helpers', () => {
  it('normalizeNs trims, lower-cases and drops the trailing dot', () => {
    expect(normalizeNs('  NS1.Host.Test. ')).toBe('ns1.host.test')
    expect(normalizeNs(null)).toBe('')
  })

  it('generateIpsFromCidr lists every address of the block', () => {
    expect(generateIpsFromCidr('192.0.2.0/30')).toEqual(['192.0.2.0', '192.0.2.1', '192.0.2.2', '192.0.2.3'])
  })

  it('getIpv4Addresses expands blocks and keeps plain addresses', () => {
    expect(getIpv4Addresses(['198.51.100.7', '192.0.2.4/31'])).toEqual(['198.51.100.7', '192.0.2.4', '192.0.2.5'])
  })
})
