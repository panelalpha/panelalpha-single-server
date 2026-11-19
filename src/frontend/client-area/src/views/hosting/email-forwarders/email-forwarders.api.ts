import { api } from '@/shared/api/client'

// Calls of the Email Forwarders page, same contract as legacy. The domains come from `getEmailDomains` (`hosting.api.ts`, the frame's
// cached call, shared with the records dot).

/** One item of `GET /services/{id}/email/domains/{domainId}/forwarders`. */
export interface EmailForwarder {
  email: string
  forward_to: string
  updated_at: string | null
}

/**
 * `GET /services/{id}/email/domains/{domainId}/forwarders`. Legacy calls it through `Api.get` (no cache), so every
 * domain change and every reload is a fresh request.
 */
export async function listEmailForwarders (serviceId: number, domainId: number | string): Promise<EmailForwarder[]> {
  const { data } = await api.get<{ data: EmailForwarder[] }>(`/services/${serviceId}/email/domains/${domainId}/forwarders`)
  return data.data
}

/** `POST /services/{id}/email/domains/{domainId}/forwarders`. The body is the Add form (`email` without the `@` part, `domain`, `destination`). */
export async function createEmailForwarder (serviceId: number, domainId: number | string, body: Record<string, unknown>): Promise<void> {
  await api.post(`/services/${serviceId}/email/domains/${domainId}/forwarders`, body)
}

/**
 * `DELETE …/forwarders/{email}?forward_to={destination}`. As in legacy, the address goes
 * into the path unencoded (with its `@`) and the destination is encoded in the query. Do not make the two the same.
 */
export async function deleteEmailForwarder (serviceId: number, domainId: number | string, email: string, forwardTo: string): Promise<void> {
  await api.delete(`/services/${serviceId}/email/domains/${domainId}/forwarders/${email}?forward_to=${encodeURIComponent(forwardTo)}`)
}
