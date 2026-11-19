import type { InstanceLogRow, InstanceLogsQuery } from '@/entities/project/instance-logs.api'
import type { HomeLike, InstanceResource, RawInstance } from '@/entities/project/instance-resource'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { api, apiBaseUrl } from '@/shared/api/client'

// Calls of the reseller area, same contract as legacy. The `instances` segment is rewritten for single-server by the client.

export interface ResellerUser {
  id: number
  name: string
  email: string
  instances_count: number
}

/** `GET /reseller/users` (users table mount). */
export async function listResellerUsers (): Promise<ResellerUser[]> {
  const { data } = await api.get<{ data: ResellerUser[] }>('/reseller/users')
  return data.data
}

export interface BrandingSettings {
  brand_name: string
  domain: string
}

/** `GET /reseller/branding-settings`; legacy copies only these two fields. */
export async function getBrandingSettings (): Promise<BrandingSettings> {
  const { data } = await api.get<{ data: BrandingSettings }>('/reseller/branding-settings')
  return { brand_name: data.data.brand_name, domain: data.data.domain }
}

/** `PUT /reseller/branding-settings` with the form values. */
export async function updateBrandingSettings (settings: BrandingSettings): Promise<void> {
  await api.put('/reseller/branding-settings', settings)
}

/** `GET /reseller/users/{id}/instances`, every item through the instance mapper. */
export async function listResellerUserInstances (userId: number, home?: HomeLike | null): Promise<InstanceResource[]> {
  const { data } = await api.get<{ data: RawInstance[] }>(`/reseller/users/${userId}/instances`)
  return data.data.map(item => toInstanceResource(item, home, { apiBase: apiBaseUrl() }))
}

/** `DELETE /reseller/users/{id}`; the response carries the deleted user's id. */
export async function deleteResellerUser (userId: number): Promise<{ id: number }> {
  const { data } = await api.delete<{ data: { id: number } }>(`/reseller/users/${userId}`)
  return data.data
}

/** A row of `GET /reseller/instances-logs`: the instance log shape plus the row id. */
export type ResellerLogRow = InstanceLogRow & { id: number }

/**
 * `GET /reseller/instances-logs`. Query through `URLSearchParams` in legacy order, `search_term`
 * only for a non-empty term; the total is `data.total || data.meta.total || 0`.
 */
export async function listResellerInstancesLogs (
  { page, perPage, sortBy, sortDir, searchTerm }: InstanceLogsQuery,
): Promise<{ items: ResellerLogRow[], total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    sort_by: sortBy,
    sort_dir: sortDir,
  })
  if (searchTerm) {
    params.append('search_term', searchTerm)
  }
  const { data } = await api.get<{ data: ResellerLogRow[], total?: number, meta?: { total?: number } }>(
    `/reseller/instances-logs?${params.toString()}`,
  )
  return { items: data.data, total: data.total || data.meta?.total || 0 }
}

// Reseller API tokens, same contract as legacy.

export interface ResellerApiToken {
  id: number
  name: string
  last_used_at: string | null
  created_at: string
}

/** The create response carries the one-time token value next to the row fields. */
export interface CreatedResellerApiToken extends ResellerApiToken {
  plain_text_token: string
}

/** `GET /reseller/api-tokens` (tokens table mount). */
export async function listResellerApiTokens (): Promise<ResellerApiToken[]> {
  const { data } = await api.get<{ data: ResellerApiToken[] }>('/reseller/api-tokens')
  return data.data
}

/** `POST /reseller/api-tokens`; the name is sent as typed (legacy does not trim). */
export async function createResellerApiToken (name: string): Promise<CreatedResellerApiToken> {
  const { data } = await api.post<{ data: CreatedResellerApiToken }>('/reseller/api-tokens', { name })
  return data.data
}

/** `DELETE /reseller/api-tokens/{id}`; the response carries the deleted token's id. */
export async function deleteResellerApiToken (id: number): Promise<{ id: number }> {
  const { data } = await api.delete<{ data: { id: number } }>(`/reseller/api-tokens/${id}`)
  return data.data
}
