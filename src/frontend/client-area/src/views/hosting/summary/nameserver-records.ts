import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
import type { DnsRecordInput } from '@/entities/domain/ui/dns-options'
import type { DnsServerRecord } from '@/entities/domain/verify-domain-resolving'

// What the verification takes from the instance that sits on the service's main domain (app variant, with the CDN branch).

export interface CdnDnsRecord {
  type: string
  value?: string | null
}

export interface DomainInstance {
  domain?: string
  onboarding_subdomain?: string | null
  domain_zone_details?: { configuration_records?: DnsServerRecord[] } | null
  cdn_dns_records?: CdnDnsRecord[] | null
}

/** The first instance whose domain is the service's domain (`instance.domain == service.domain`). */
export function findMainDomainInstance (instances: DomainInstance[], service: Pick<HostingService, 'domain'>): DomainInstance | undefined {
  return instances.find(instance => instance.domain === service.domain)
}

export function onboardingSubdomain (instances: DomainInstance[], service: Pick<HostingService, 'domain'>): string | null {
  return findMainDomainInstance(instances, service)?.onboarding_subdomain ?? null
}

export function dnsServerRecords (instances: DomainInstance[], service: Pick<HostingService, 'domain'>): DnsServerRecord[] {
  return findMainDomainInstance(instances, service)?.domain_zone_details?.configuration_records ?? []
}

export function cdnDnsRecords (instances: DomainInstance[], service: Pick<HostingService, 'domain'>): CdnDnsRecord[] {
  return findMainDomainInstance(instances, service)?.cdn_dns_records ?? []
}

/** Behind a CDN the domain must resolve to the edge, not to the origin: the A records of the CDN win over the account addresses. */
export function verificationIpv4Addresses (instances: DomainInstance[], service: HostingService): string[] {
  const fromCdn = cdnDnsRecords(instances, service)
    .filter(record => record.type === 'A' && record.value)
    .map(record => record.value as string)
  if (fromCdn.length > 0) {
    return fromCdn
  }
  return service.server_accounts[0]?.ipv4_addresses ?? []
}

/**
 * The props of the `DnsOptions` the nameserver card shows on a failed check. The records are
 * the ones of the selected account; the CDN and the DNS server records come from the instance on the main domain.
 */
export function nameserverDnsOptions (
  instances: DomainInstance[],
  service: HostingService,
  account: HostingServerAccount,
) {
  return {
    domain: service.domain,
    onboardingSubdomain: onboardingSubdomain(instances, service),
    dnsSettings: service.dns_settings,
    hasDnsServer: service.dns_server_enabled,
    ipv4Addresses: account.ipv4_addresses ?? [],
    nameservers: account.nameservers ?? [],
    hostCNames: account.host_c_names ?? [],
    cdnDnsRecords: cdnDnsRecords(instances, service) as DnsRecordInput[],
    dnsServerRecords: dnsServerRecords(instances, service) as DnsRecordInput[],
  }
}
