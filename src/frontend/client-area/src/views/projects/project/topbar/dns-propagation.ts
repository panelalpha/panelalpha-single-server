import type { DnsServerRecord, DnsSettings } from '@/entities/domain/verify-domain-resolving'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { cdnDnsPending } from '@/entities/project/instance-resource'
import { isPanelAlphaOnlineHost } from '@/entities/project/open-project'

/**
 * An IP in the URL or DNS alerts turned off
 * skip the check; otherwise the domain is resolved and a miss is the "DNS propagation is in progress" state. The result is also stored on
 * the instance (`setDnsResolveStatus`), as legacy does. `afterSave` runs the check without the alerts guard.
 */
export async function checkDnsMismatch (instance: InstanceResource, options: { afterSave?: boolean } = {}): Promise<boolean> {
  if (!options.afterSave && (instance.hasIpAddressInUrl() || !instance.getDnsAlertsEnabled())) {
    return false
  }
  // A WithoutDNS host resolves to the proxy, not the origin, so no mismatch.
  if (isPanelAlphaOnlineHost(instance.url || instance.domain)) {
    instance.setDnsResolveStatus(true)
    return false
  }
  const resolved = await verifyDomainResolving({
    domain: instance.domain as string,
    onboardingSubdomain: instance.onboarding_subdomain,
    dnsSettings: instance.dns_settings as DnsSettings,
    hasDnsServer: Boolean(instance.service_has_dns),
    ipv4Addresses: instance.getDnsIpv4Addresses() as string[],
    nameservers: instance.dns_nameservers as string[],
    hostCNames: instance.host_c_names ?? [],
    recordsFromDnsServer: ((instance.domain_zone_details as { configuration_records?: DnsServerRecord[] } | undefined)?.configuration_records ?? []),
    eagerDnsVerification: false,
    skipARecordVerification: cdnDnsPending(instance),
  })
  instance.setDnsResolveStatus(resolved)
  return !resolved
}

/** Always on single server; on app the privilege, the provider and the DNS state. */
export function canShowPreviewSite (input: {
  singleServer: boolean
  hasPrivilege: boolean
  providerEnabled: boolean
  dnsPropagationInProgress: boolean
  /** app-lite: an eager panelalpha.online URL needs no Preview. */
  panelAlphaOnline?: boolean
}): boolean {
  if (input.panelAlphaOnline) {
    return false
  }
  if (input.singleServer) {
    return true
  }
  return input.hasPrivilege && input.providerEnabled && input.dnsPropagationInProgress
}
