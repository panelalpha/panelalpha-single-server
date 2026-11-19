import { api } from '@/shared/api/client'

// The SSL settings of the instance domain
// (`/server-accounts/{hostingId}/ssl/settings/{domain}`) and the search engine indexing of the WordPress instance
// (`/instances/{id}/wordpress/search-engine-indexing`). Requests go through the shared client; the `instances` / `projects` segment is
// rewritten there, so these paths stay as legacy writes them.

/** The `ssl/settings` answer; every field is optional, as the legacy code reads them without checks. */
export interface SslSettings {
  can_https_redirect?: boolean
  force_https_redirect?: boolean
  domain_shared_instances?: { id: number, name: string, url: string }[]
  certificate?: unknown
  certificate_installed?: boolean
}

/** `GET /server-accounts/{hostingId}/ssl/settings/{domain}`: the payload is `data.data`. */
export async function getSslSettings (hostingId: number | string, domain: string): Promise<SslSettings> {
  const { data } = await api.get<{ data: SslSettings }>(`/server-accounts/${hostingId}/ssl/settings/${domain}`)
  return data.data
}

/** `PUT /server-accounts/{hostingId}/ssl/settings/{domain}` with `{ force_https_redirect }`; the answer is the new `data.data`. */
export async function updateSslSettings (hostingId: number | string, domain: string, forceHttpsRedirect: boolean): Promise<SslSettings> {
  const { data } = await api.put<{ data: SslSettings }>(`/server-accounts/${hostingId}/ssl/settings/${domain}`, {
    force_https_redirect: forceHttpsRedirect,
  })
  return data.data
}

/** `GET /instances/{id}/wordpress/search-engine-indexing`: the body's `disabled` flag is what the switch shows (true = indexing off). */
export async function getSearchEngineIndexing (instanceId: number | string): Promise<boolean> {
  const { data } = await api.get<{ disabled: boolean }>(`/instances/${instanceId}/wordpress/search-engine-indexing`)
  return data.disabled
}

/** `PUT /instances/{id}/wordpress/search-engine-indexing` with `{ status }`. */
export async function updateSearchEngineIndexing (instanceId: number | string, status: boolean): Promise<void> {
  await api.put(`/instances/${instanceId}/wordpress/search-engine-indexing`, { status })
}
