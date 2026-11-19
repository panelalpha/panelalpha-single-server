import { cachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'

// Calls of the FTP page, same contract as legacy.

/** One item of `GET /server-accounts/{id}/ftp-accounts`. Sizes are MB; `diskquota` is `"unlimited"` for no limit. */
export interface FtpAccount {
  user: string
  directory: string
  diskused: number | string
  diskquota: number | string | 'unlimited'
  created_at: string | null
  updated_at: string | null
  actions?: string[]
}

export interface FtpAccountsResponse {
  data: FtpAccount[]
  /** `usage: false` on DirectAdmin and Plesk: the page then shows the "not supported" icon instead of the usage bar. */
  meta: { usage: boolean }
}

/** `GET /server-accounts/{id}/ftp-accounts`. Legacy calls it through `Api.get` (no cache). */
export async function listFtpAccounts (accountId: number): Promise<FtpAccountsResponse> {
  const { data } = await api.get<FtpAccountsResponse>(`/server-accounts/${accountId}/ftp-accounts`)
  return data
}

export interface FtpServerInfo {
  host: string
  port: number
}

/** `GET /server-accounts/{id}/ftp-accounts/server-info`, cached like legacy `Api.cached().get` (default TTL). */
export async function getFtpServerInfo (accountId: number): Promise<FtpServerInfo> {
  const { data } = await cachedGet<{ data: FtpServerInfo }>(`/server-accounts/${accountId}/ftp-accounts/server-info`)
  return data.data
}

export interface FtpDomain {
  domain: string
}

/** `GET /server-accounts/{id}/domains` for the Add modal, cached like legacy `Api.cached().get` (default TTL). */
export async function listAccountDomains (accountId: number): Promise<FtpDomain[]> {
  const { data } = await cachedGet<{ data: FtpDomain[] }>(`/server-accounts/${accountId}/domains`)
  return data.data
}

/** `POST /server-accounts/{id}/ftp-accounts`. Legacy sends the form values as they are (`quota` set for unlimited). */
export async function createFtpAccount (accountId: number, payload: Record<string, unknown>): Promise<void> {
  await api.post(`/server-accounts/${accountId}/ftp-accounts`, payload)
}

/** The user goes unencoded in the path, as the DELETE sends it. */
export async function updateFtpAccount (accountId: number, user: string, payload: Record<string, unknown>): Promise<void> {
  await api.put(`/server-accounts/${accountId}/ftp-accounts/${user}`, payload)
}

/** `DELETE /server-accounts/{id}/ftp-accounts/{user}`. `user` contains the `@` and is not encoded, as in legacy. */
export async function deleteFtpAccount (accountId: number, user: string): Promise<void> {
  await api.delete(`/server-accounts/${accountId}/ftp-accounts/${user}`)
}
