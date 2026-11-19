import type { DomainsListResponse } from './domains/domains.types'
import type { EmailDomain } from './email-domain-records'
import type { HostingService, MetricsPeriod, ServerMetricsBucket, ServerMetricsCurrent } from './hosting.types'
import type { HomeLike, InstanceResource, RawInstance } from '@/entities/project/instance-resource'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { cachedGet } from '@/shared/api/cached-get'
import { api, apiBaseUrl } from '@/shared/api/client'

// Calls of the hosting frame and Summary, same contract as legacy.

/** `GET /services` (frame mount). */
export async function listServices (): Promise<HostingService[]> {
  const { data } = await api.get<{ data: HostingService[] }>('/services')
  return data.data
}

export interface EmailDomainsResponse {
  data: EmailDomain[]
  meta: { is_email_dns_records_showed: boolean }
}

/** `GET /services/{id}/email/domains` (the email records dot). */
export async function getEmailDomains (serviceId: number): Promise<EmailDomainsResponse> {
  const { data } = await cachedGet<EmailDomainsResponse>(`/services/${serviceId}/email/domains`, 0)
  return data
}

export interface ServerAccountUsage {
  data: Record<string, { usage: number, maximum: number | null } | undefined>
  supported_metrics: Record<string, boolean | undefined>
}

/** `GET /server-accounts/{id}/usage`: a new request on every later second. */
export async function getServerAccountUsage (accountId: number): Promise<ServerAccountUsage> {
  const { data } = await cachedGet<ServerAccountUsage>(`/server-accounts/${accountId}/usage`, 0)
  return data
}

export interface HostingInstancesPage {
  data: unknown[]
  meta: { total: number }
}

/**
 * `GET /instances?page=1&per_page=N&sort_by=created_at&sort_dir=desc&server_account_id=ID`.
 * Raw items: `toHostingInstance` shapes them for the row components.
 */
export async function listHostingInstances (accountId: number, perPage: 5 | 99): Promise<HostingInstancesPage> {
  const { data } = await api.get<HostingInstancesPage>(`/instances?page=1&per_page=${perPage}&sort_by=created_at&sort_dir=desc&server_account_id=${accountId}`)
  return data
}

/** `GET /server/metrics/current` (Usage rings; single-server only, the backend answers 404 elsewhere). */
export async function getServerMetricsCurrent (): Promise<ServerMetricsCurrent> {
  const { data } = await api.get<{ data: ServerMetricsCurrent }>('/server/metrics/current')
  return data.data
}

/** `GET /server/metrics/{period}`: about 60 buckets for the graphs. */
export async function getServerMetricsByPeriod (period: MetricsPeriod): Promise<ServerMetricsBucket[]> {
  const { data } = await api.get<{ data: ServerMetricsBucket[] }>(`/server/metrics/${period}`)
  return data.data
}

/** A raw `/instances` item as the instance kit reads it (same mapping as the instance list, `instances.api.ts`). */
export function toHostingInstance (item: unknown, home: HomeLike | null | undefined): InstanceResource {
  return toInstanceResource(item as RawInstance, home, { apiBase: apiBaseUrl() })
}

/**
 * `GET /server-accounts/{id}/domains[?sort_by=updated_at]` (every call is a fresh request). The list comes
 * main first, then by domain; `sortByNewest` (after an add or an edit) puts the latest changed domain first.
 */
export async function listDomains (accountId: number, sortByNewest = false): Promise<DomainsListResponse> {
  const query = sortByNewest ? '?sort_by=updated_at' : ''
  const { data } = await api.get<DomainsListResponse>(`/server-accounts/${accountId}/domains${query}`)
  return data
}

/** `POST /server-accounts/{id}/domains`: the whole Add form, as legacy sends it. */
export async function addDomain (accountId: number, body: Record<string, unknown>): Promise<void> {
  await api.post(`/server-accounts/${accountId}/domains`, body)
}

// `verifyDomain` and `DomainVerification` live in `shared` (the onboarding domain step uses them too); re-exported here so the
// hosting imports stay as they are.
export { type DomainVerification, verifyDomain } from '@/entities/domain/domain-verification.api'

/** `PUT /server-accounts/{id}/domains/{domain}`: the whole element with the edited fields. */
export async function updateDomain (accountId: number, domain: string, body: Record<string, unknown>): Promise<void> {
  await api.put(`/server-accounts/${accountId}/domains/${encodeURIComponent(domain)}`, body)
}

/** `DELETE /server-accounts/{id}/domains/{domain}`. */
export async function deleteDomain (accountId: number, domain: string): Promise<void> {
  await api.delete(`/server-accounts/${accountId}/domains/${encodeURIComponent(domain)}`)
}

/** `PUT /server-accounts/{id}/domains/{domain}/set-as-primary`. */
export async function setPrimaryDomain (accountId: number, domain: string): Promise<void> {
  await api.put(`/server-accounts/${accountId}/domains/${encodeURIComponent(domain)}/set-as-primary`)
}
