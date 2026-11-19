import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
import type { DomainInstance } from './nameserver-records'
import { describe, expect, it } from 'vitest'
import { cdnDnsRecords, nameserverDnsOptions, verificationIpv4Addresses } from './nameserver-records'

const service = {
  domain: 'acme.example.com',
  dns_settings: { display_options: {} },
  dns_server_enabled: true,
  server_accounts: [
    { id: 1, domain: 'acme-1.example.test', ipv4_addresses: ['198.51.100.1'], nameservers: ['ns1.example.test'], host_c_names: ['c1'] },
    { id: 2, domain: 'acme-2.example.test', ipv4_addresses: ['198.51.100.2'], nameservers: ['ns2.example.test'], host_c_names: [] },
  ],
} as unknown as HostingService

const mainInstance: DomainInstance = {
  domain: 'acme.example.com',
  onboarding_subdomain: 'onb',
  domain_zone_details: { configuration_records: [{ name: 'acme.example.com', type: 'A', value: '198.51.100.9' }] as never[] },
  cdn_dns_records: [{ type: 'A', value: '203.0.113.7' }],
}

describe('nameserverDnsOptions', () => {
  it('takes the records of the selected account and the CDN and server records of the main domain', () => {
    const account = service.server_accounts[1] as HostingServerAccount

    expect(nameserverDnsOptions([mainInstance], service, account)).toEqual({
      domain: 'acme.example.com',
      onboardingSubdomain: 'onb',
      dnsSettings: service.dns_settings,
      hasDnsServer: true,
      ipv4Addresses: ['198.51.100.2'],
      nameservers: ['ns2.example.test'],
      hostCNames: [],
      cdnDnsRecords: [{ type: 'A', value: '203.0.113.7' }],
      dnsServerRecords: [{ name: 'acme.example.com', type: 'A', value: '198.51.100.9' }],
    })
  })

  it('falls back to empty lists when no instance sits on the main domain', () => {
    const account = service.server_accounts[0] as HostingServerAccount
    const options = nameserverDnsOptions([], service, account)

    expect(options.onboardingSubdomain).toBeNull()
    expect(options.cdnDnsRecords).toEqual([])
    expect(options.dnsServerRecords).toEqual([])
    expect(options.ipv4Addresses).toEqual(['198.51.100.1'])
  })

  it('defaults the account lists to empty when the account has none', () => {
    const account = { id: 3, domain: 'x', ipv4_addresses: undefined, nameservers: undefined, host_c_names: undefined } as unknown as HostingServerAccount
    const options = nameserverDnsOptions([], service, account)

    expect(options.ipv4Addresses).toEqual([])
    expect(options.nameservers).toEqual([])
    expect(options.hostCNames).toEqual([])
  })
})

describe('cdnDnsRecords and verificationIpv4Addresses', () => {
  it('uses the CDN A records for the verification when there are any', () => {
    expect(cdnDnsRecords([mainInstance], service)).toEqual([{ type: 'A', value: '203.0.113.7' }])
    expect(verificationIpv4Addresses([mainInstance], service)).toEqual(['203.0.113.7'])
  })

  it('falls back to the first account addresses without CDN records', () => {
    expect(verificationIpv4Addresses([], service)).toEqual(['198.51.100.1'])
  })
})
