import { cachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'

// Calls of the Email Addresses page, same contract as legacy. The domains come from `getEmailDomains` (`hosting.api.ts`, the frame's cached
// call, shared with the records dot).

/** One item of `GET /services/{id}/email/domains/{domainId}/accounts`. Sizes are MB; `disk_quota` is `"unlimited"` for no limit. */
export interface EmailAccount {
  email: string
  disk_usage: number
  disk_quota: number | 'unlimited'
  created_at: string | null
  updated_at: string | null
}

/**
 * `GET /services/{id}/email/domains/{domainId}/accounts`. Legacy calls it through `Api.get` (no cache), so every
 * domain change and every reload is a fresh request.
 */
export async function listEmailAccounts (serviceId: number, domainId: number | string): Promise<EmailAccount[]> {
  const { data } = await api.get<{ data: EmailAccount[] }>(`/services/${serviceId}/email/domains/${domainId}/accounts`)
  return data.data
}

/**
 * `POST /services/{id}/email/domains/{domainId}/accounts`. The body is the Add form (`email` without the `@` part, `domain`,
 * `password`, `unlimited_quota`, `quota`), as legacy sends it.
 */
export async function createEmailAccount (serviceId: number, domainId: number | string, body: Record<string, unknown>): Promise<void> {
  await api.post(`/services/${serviceId}/email/domains/${domainId}/accounts`, body)
}

/**
 * `PUT /services/{id}/email/domains/{domainId}/accounts/{email}`. The address goes into the path unencoded (with its `@`), as legacy does.
 */
export async function updateEmailAccount (serviceId: number, domainId: number | string, email: string, body: Record<string, unknown>): Promise<void> {
  await api.put(`/services/${serviceId}/email/domains/${domainId}/accounts/${email}`, body)
}

/** One `GET …/accounts/{email}` answer (`data`): the settings of the mail client. */
export interface EmailAccountDetails {
  smtp_username: string
  inbox_host: string
  imap_port: number
  imap_insecure_port: number
  pop3_port: number
  pop3_insecure_port: number
  smtp_host: string
  smtp_port: number
  smtp_insecure_port: number
}

/**
 * `GET …/accounts/{email}` for the Details modal. Legacy goes through
 * `Api.cached()` with the default TTL, so a second click on the same account does not request again (`cachedGet`).
 */
export async function getEmailAccountDetails (serviceId: number, domainId: number | string, email: string): Promise<EmailAccountDetails> {
  const { data } = await cachedGet<{ data: EmailAccountDetails }>(`/services/${serviceId}/email/domains/${domainId}/accounts/${email}`)
  return data.data
}

/**
 * `DELETE …/accounts/{email}`. The address goes into the path unencoded (with its `@`), as legacy does.
 */
export async function deleteEmailAccount (serviceId: number, domainId: number | string, email: string): Promise<void> {
  await api.delete(`/services/${serviceId}/email/domains/${domainId}/accounts/${email}`)
}

/**
 * `GET …/accounts/{email}/webmail-sso-url`: a one-time login link to the webmail. Not cached: every click
 * fetches a fresh token. Legacy cached it with `Api.cached()`; that is a deliberate departure.
 */
export async function getWebmailSsoUrl (serviceId: number, domainId: number | string, email: string): Promise<string> {
  const { data } = await api.get<{ data: { url: string } }>(`/services/${serviceId}/email/domains/${domainId}/accounts/${email}/webmail-sso-url`)
  return data.data.url
}
