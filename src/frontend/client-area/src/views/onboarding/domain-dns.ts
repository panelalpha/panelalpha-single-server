import type { OnboardingService } from './onboarding-service'
import type { DnsServerRecord, VerifyDomainResolvingInput } from '@/entities/domain/verify-domain-resolving'

// The inputs of the DNS checks of the domain step. The eager check after the domain
// and the verify modal's check read the same service fields with two different sources for the A records and the zone records, so they are two builders.

export function hostCNamesOf (service: OnboardingService): string[] {
  return (service.hosting_accounts ?? []).flatMap(account => account.host_c_names ?? [])
}

export function nameserversOf (service: OnboardingService): string[] {
  return service.dns_server?.nameservers ?? []
}

export function hasDnsServerOf (service: OnboardingService): boolean {
  return service.dns_server?.enabled ?? false
}

/** The first hosting account's addresses, else the hosting server's. */
export function ipv4AddressesOf (service: OnboardingService): string[] {
  return service.hosting_accounts?.[0]?.ipv4_addresses ?? service.hosting_server?.ip_v4_addresses ?? []
}

/**
 * The zone records of a created domain. The domain record types
 * `domain_zone` as a string, but the API sends the zone object here, so the read goes through `unknown`.
 */
export function configurationRecordsOf (domain: Record<string, unknown> | null): DnsServerRecord[] {
  const zone = domain?.domain_zone as unknown as { details?: { configuration_records?: DnsServerRecord[] } } | undefined
  return zone?.details?.configuration_records ?? []
}

/** The eager check after the domain is set: the hosting server's addresses, no zone records. */
export function propagationInput (service: OnboardingService, domain: string): VerifyDomainResolvingInput {
  return {
    domain,
    onboardingSubdomain: null,
    dnsSettings: service.onboarding?.dns_settings ?? {},
    hasDnsServer: hasDnsServerOf(service),
    ipv4Addresses: service.hosting_server?.ip_v4_addresses ?? [],
    nameservers: nameserversOf(service),
    hostCNames: hostCNamesOf(service),
    recordsFromDnsServer: [],
    eagerDnsVerification: service.onboarding?.eager_domain_dns_verification_enabled === true,
  }
}

/** The verify modal's check: the zone records of the new domain. */
export function instantVerificationInput (service: OnboardingService, domain: string, newDomain: Record<string, unknown> | null): VerifyDomainResolvingInput {
  return {
    ...propagationInput(service, domain),
    ipv4Addresses: ipv4AddressesOf(service),
    recordsFromDnsServer: configurationRecordsOf(newDomain),
  }
}
