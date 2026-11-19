import type { SslCertificate } from '@/entities/ssl/ui/ssl-status'

// `GET /server-accounts/{id}/domains` (backend `DomainResource`) plus the fields legacy adds to every element.

export type DomainType = 'main' | 'addon' | 'sub' | 'alias'

export interface DomainCapabilities {
  can_update_document_root?: boolean
  can_redirect?: boolean
  can_set_as_primary?: boolean
  can_manage_ssl?: boolean
}

export interface CdnDnsRecord {
  [key: string]: unknown
  type?: string
  name?: string
  value?: string
}

export interface DomainZoneRecord {
  [key: string]: unknown
  type: string
  name: string
  value: string
}

export interface RawDomain {
  [key: string]: unknown
  id?: number
  domain: string
  type: DomainType | string
  document_root?: string | null
  /** `host:port` of the proxy rule of the domain (app-lite); `null` without one. */
  points_to?: string | null
  redirect_enabled?: boolean
  redirect_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  ssl_order_status?: string | null
  server_account_id?: number
  domain_zone?: { details?: { configuration_records?: DomainZoneRecord[] } } | null
  has_dns_zone?: boolean
  aliases?: unknown[]
  cdn_dns_records?: CdnDnsRecord[] | null
  capabilities: DomainCapabilities
}

export interface HostingDomain extends RawDomain {
  /** `'ok'`, or `false` once `verifyDomainResolving` says the domain does not resolve to the hosting. */
  nsStatus: 'ok' | false
  sslStatusLoading: boolean
  sslInstalledCert: SslCertificate | null
  sslDetectedCert: SslCertificate | null
  type_text: string
  updated_at_text: string
  editSslButtonLoading: boolean
  serverAccountId: number
}

export interface DomainsListResponse {
  data: RawDomain[]
  meta: { domain_types: string[] }
}
