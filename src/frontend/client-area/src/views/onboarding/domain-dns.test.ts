import type { OnboardingService } from './onboarding-service'
import { describe, expect, it } from 'vitest'
import { configurationRecordsOf, instantVerificationInput, propagationInput } from './domain-dns'

const service = {
  id: 10,
  dns_server: { enabled: true, nameservers: ['ns1.host.pl', 'ns2.host.pl'] },
  hosting_server: { ip_v4_addresses: ['192.0.2.1'] },
  hosting_accounts: [{ ipv4_addresses: ['198.51.100.7'], host_c_names: ['a.host.pl'] }, { host_c_names: ['b.host.pl'] }],
  onboarding: {
    dns_settings: { verification_methods: ['resolve_a_record'] },
    eager_domain_dns_verification_enabled: true,
  },
} as unknown as OnboardingService

describe('propagationInput', () => {
  it('reads the hosting server addresses and no zone records, as the legacy eager check does', () => {
    expect(propagationInput(service, 'shop.pl')).toEqual({
      domain: 'shop.pl',
      onboardingSubdomain: null,
      dnsSettings: { verification_methods: ['resolve_a_record'] },
      hasDnsServer: true,
      ipv4Addresses: ['192.0.2.1'],
      nameservers: ['ns1.host.pl', 'ns2.host.pl'],
      hostCNames: ['a.host.pl', 'b.host.pl'],
      recordsFromDnsServer: [],
      eagerDnsVerification: true,
    })
  })

  it('falls back to empty values when the service has no DNS data', () => {
    const input = propagationInput({ id: 1 } as unknown as OnboardingService, 'shop.pl')
    expect(input.dnsSettings).toEqual({})
    expect(input.hasDnsServer).toBe(false)
    expect(input.ipv4Addresses).toEqual([])
    expect(input.nameservers).toEqual([])
    expect(input.hostCNames).toEqual([])
    expect(input.eagerDnsVerification).toBe(false)
  })
})

describe('instantVerificationInput', () => {
  it('reads the first hosting account addresses and the zone records of the new domain', () => {
    const newDomain = { id: 4, domain: 'shop.pl', domain_zone: { details: { configuration_records: [{ type: 'A', name: 'shop.pl', value: '198.51.100.7' }] } } }

    const input = instantVerificationInput(service, 'shop.pl', newDomain as never)

    expect(input.ipv4Addresses).toEqual(['198.51.100.7'])
    expect(input.recordsFromDnsServer).toEqual([{ type: 'A', name: 'shop.pl', value: '198.51.100.7' }])
  })

  it('has no zone records before the domain is created', () => {
    expect(instantVerificationInput(service, 'shop.pl', null).recordsFromDnsServer).toEqual([])
    expect(configurationRecordsOf(null)).toEqual([])
  })
})
