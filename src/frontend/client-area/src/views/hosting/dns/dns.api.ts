import { api } from '@/shared/api/client'

// Calls of the DNS screen, same contract as legacy (`/services/{id}/dns/…`).

/** One zone of `GET /services/{id}/dns/zones`. */
export interface DnsZone {
  id: number | string
  name: string
}

/**
 * One record of `GET …/records`. The PUT body is the whole row (legacy sends it back as it came), so the fields the screen
 * does not read are kept through the index signature.
 */
export interface DnsRecord {
  [key: string]: unknown
  line?: number | string
  Line?: number | string
  name: string
  ttl: number | string
  type: string
  content: string
  txtdata?: string
  proxiable?: boolean
  proxied?: boolean
}

/** `GET …/records`: the records of the zone and whether the provider allows the Cloudflare proxy (`meta.allow_proxy`). */
export interface DnsRecordsResponse {
  data: DnsRecord[]
  meta: { allow_proxy: boolean }
}

/** Body of `POST` and `PUT` of a record (the modal's form values, as legacy sends them). */
export type DnsRecordPayload = Record<string, unknown>

/** `GET /services/{id}/dns/zones`. */
export async function listZones (serviceId: number): Promise<DnsZone[]> {
  const { data } = await api.get<{ data: DnsZone[] }>(`/services/${serviceId}/dns/zones`)
  return data.data
}

/** `GET /services/{id}/dns/zones/{zoneId}/records`. */
export async function listRecords (serviceId: number, zoneId: number | string): Promise<DnsRecordsResponse> {
  const { data } = await api.get<DnsRecordsResponse>(`/services/${serviceId}/dns/zones/${zoneId}/records`)
  return data
}

/** `GET /services/{id}/dns/record-types`: the types the provider accepts; none means the records cannot be managed via API. */
export async function listRecordTypes (serviceId: number): Promise<string[]> {
  const { data } = await api.get<{ data: string[] }>(`/services/${serviceId}/dns/record-types`)
  return data.data
}

/** `POST /services/{id}/dns/zones/{zoneId}/records`. */
export async function createRecord (serviceId: number, zoneId: number | string, body: DnsRecordPayload): Promise<void> {
  await api.post(`/services/${serviceId}/dns/zones/${zoneId}/records`, body)
}

/** `PUT /services/{id}/dns/zones/{zoneId}/records/{recordId}`. */
export async function updateRecord (serviceId: number, zoneId: number | string, recordId: number | string, body: DnsRecordPayload): Promise<void> {
  await api.put(`/services/${serviceId}/dns/zones/${zoneId}/records/${recordId}`, body)
}

/**
 * `DELETE …/records/{recordPath}`. The path goes in as it is, without encoding: legacy sends `name?type=TXT` for the
 * records that have no line, and the backend reads the query from the path.
 */
export async function deleteRecord (serviceId: number, zoneId: number | string, recordPath: string): Promise<void> {
  await api.delete(`/services/${serviceId}/dns/zones/${zoneId}/records/${recordPath}`)
}

/** `PATCH …/records/{line}/toggle-proxy`: returns the proxy state after the toggle (`data.data.proxied`). */
export async function toggleProxy (serviceId: number, zoneId: number | string, line: number | string): Promise<boolean> {
  const { data } = await api.patch<{ data: { proxied: boolean } }>(`/services/${serviceId}/dns/zones/${zoneId}/records/${line}/toggle-proxy`)
  return data.data.proxied
}
