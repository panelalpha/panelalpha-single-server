import type { ProxyRule } from '@/views/hosting/containers/containers.api'
import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
import type { HostingDomain, RawDomain } from './domains.types'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import { fromNow } from '@/shared/time/from-now'

// The model of the Domains list, as pure functions: the mapping of every element and the headers. App-lite differs in the CDN addresses of
// `domainIpv4Addresses` (app wins) and in the proxy rules behind the "Points to" column.

type Translate = (key: string) => string

export function isWpCloud (service: Pick<HostingService, 'hosting_server_type'> | null | undefined): boolean {
  return service?.hosting_server_type === 'wp-cloud'
}

/** The translated type; a main domain of a wp-cloud service reads `primary`. An unknown type stays as it is. */
export function domainTypeText (type: string, service: Pick<HostingService, 'hosting_server_type'>, t: Translate): string {
  switch (type) {
    case 'main': {
      return t(isWpCloud(service) ? 'heading.hosting.domains.domain.primary' : 'heading.hosting.domains.domain.main')
    }
    case 'addon': {
      return t('heading.hosting.domains.domain.addon')
    }
    case 'sub': {
      return t('heading.hosting.domains.domain.sub')
    }
    case 'alias': {
      return t('heading.hosting.domains.domain.alias')
    }
    default: {
      return type
    }
  }
}

export interface DomainRowContext {
  service: Pick<HostingService, 'hosting_server_type'>
  account: Pick<HostingServerAccount, 'id'>
  t: Translate
  now?: Date
  /** Proxy rules of the service (app-lite); `undefined` when they were not asked for. */
  proxyRules?: readonly ProxyRule[]
}

/**
 * One element of the response as a table row. The certificates start empty with `sslStatusLoading` on (legacy sets both before it
 * asks), the DNS verdict starts `'ok'` and the row buttons are not loading.
 */
export function toDomainRow (raw: RawDomain, context: DomainRowContext): HostingDomain {
  return {
    ...raw,
    nsStatus: 'ok',
    sslStatusLoading: true,
    sslDetectedCert: null,
    sslInstalledCert: null,
    editSslButtonLoading: false,
    serverAccountId: context.account.id,
    points_to: resolveProxyPointsTo(raw.domain, context.proxyRules ?? []),
    updated_at_text: raw.updated_at ? fromNow(raw.updated_at, context.now) : '-',
    type_text: domainTypeText(raw.type, context.service, context.t),
  }
}

/** Legacy verifies the DNS of every domain except a `sub`, and only when it has a DNS zone. */
export function needsNsVerification (row: Pick<RawDomain, 'type' | 'has_dns_zone'>): boolean {
  return row.type !== 'sub' && Boolean(row.has_dns_zone)
}

/**
 * A domain behind the CDN resolves to the CDN edge, so its A records are compared instead of the
 * origin addresses of the account.
 */
export function verificationIpv4 (row: Pick<RawDomain, 'cdn_dns_records'>, account: Pick<HostingServerAccount, 'ipv4_addresses'>): string[] {
  const fromCdn = (row.cdn_dns_records ?? [])
    .filter(record => record.type === 'A' && record.value)
    .map(record => record.value as string)
  if (fromCdn.length > 0) {
    return fromCdn
  }
  return account.ipv4_addresses ?? []
}

/** The configuration records of the domain's DNS zone, the last argument of `verifyDomainResolving`. */
export function zoneConfigurationRecords (row: Pick<RawDomain, 'domain_zone'>) {
  return row.domain_zone?.details?.configuration_records ?? []
}

/** Proxy rules are asked for, and "Points to" shown, for a panelalpha service or single-server (app-lite). */
export function usesProxyPointsTo (service: Pick<HostingService, 'hosting_server_type'>, singleServer: boolean): boolean {
  return service.hosting_server_type === 'panelalpha' || singleServer
}

/**
 * `host:port` of the upstream of an enabled http rule of this hostname (app-lite). Prefers listen port 80,
 * then 443, then the first one; `null` without a match.
 */
export function resolveProxyPointsTo (domain: string, rules: readonly ProxyRule[]): string | null {
  if (!domain || !Array.isArray(rules) || rules.length === 0) {
    return null
  }
  const matches = rules.filter(rule => rule
    && rule.transport === 'http'
    && rule.enabled !== false
    && rule.server_name === domain
    && rule.upstream_host
    && rule.upstream_port)
  if (matches.length === 0) {
    return null
  }
  const preferred = matches.find(rule => Number(rule.listen_port) === 80)
    ?? matches.find(rule => Number(rule.listen_port) === 443)
    ?? matches[0]!
  return `${preferred.upstream_host}:${preferred.upstream_port}`
}

/** The headers of the table: `document_root` is not a column of a wp-cloud service; with `pointsTo` it reads "Points to". */
export function domainHeaders (service: Pick<HostingService, 'hosting_server_type'>, pointsTo = false): LegacySortHeader[] {
  const headers: LegacySortHeader[] = [
    { text: 'domain', value: 'domain', sortable: true },
    { text: 'ssl', value: 'ssl_status', sortable: true },
    { text: 'type', value: 'type', sortable: true },
    { text: pointsTo ? 'pointsTo' : 'documentRoot', value: 'document_root', sortable: true },
    { text: 'actions', value: 'actions' },
  ]
  return isWpCloud(service) ? headers.filter(header => header.value !== 'document_root') : headers
}

/** A link target that came from the data is followed only when it is http(s): `javascript:` and the like stay plain text. */
export function safeHttpUrl (value: string | null | undefined): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined
}
