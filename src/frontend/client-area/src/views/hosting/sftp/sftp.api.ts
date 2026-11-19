import { cachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'

// Calls of the SFTP page, same contract as legacy.

/** One item of `GET /server-accounts/{id}/sftp-accounts`. There is no directory or quota: SFTP accounts have no usage. */
export interface SftpAccount {
  user: string
  created_at: string | null
  updated_at: string | null
}

export interface SftpAccountsResponse {
  data: SftpAccount[]
  /** `actions` is the list of row actions the account supports (`edit_password`); `access_type` is the page's access method. */
  meta: { access_type: 'ssh' | 'sftp', actions: string[] }
}

/** `GET /server-accounts/{id}/sftp-accounts`. Legacy calls it through `Api.get` (no cache). */
export async function listSftpAccounts (accountId: number): Promise<SftpAccountsResponse> {
  const { data } = await api.get<SftpAccountsResponse>(`/server-accounts/${accountId}/sftp-accounts`)
  return data
}

export interface SftpServerInfo {
  host: string
  port: number
}

/** `GET /server-accounts/{id}/sftp-accounts/server-info`, cached like legacy `Api.cached().get` (default TTL). */
export async function getSftpServerInfo (accountId: number): Promise<SftpServerInfo> {
  const { data } = await cachedGet<{ data: SftpServerInfo }>(`/server-accounts/${accountId}/sftp-accounts/server-info`)
  return data.data
}

/** `POST /server-accounts/{id}/sftp-accounts`: the form values go as they are, as in legacy. */
export async function createSftpAccount (accountId: number, payload: Record<string, unknown>): Promise<void> {
  await api.post(`/server-accounts/${accountId}/sftp-accounts`, payload)
}

/** `PUT /server-accounts/{id}/sftp-accounts/{user}`. `user` goes into the path unencoded, as in legacy. */
export async function updateSftpAccount (accountId: number, user: string, payload: Record<string, unknown>): Promise<void> {
  await api.put(`/server-accounts/${accountId}/sftp-accounts/${user}`, payload)
}

/** `DELETE /server-accounts/{id}/sftp-accounts/{user}`. `user` is not encoded, as in legacy. */
export async function deleteSftpAccount (accountId: number, user: string): Promise<void> {
  await api.delete(`/server-accounts/${accountId}/sftp-accounts/${user}`)
}

/** `POST /server-accounts/{id}/sftp-accounts/disconnect-all`, no body, as legacy. The list is not reloaded. */
export async function disconnectAllSftp (accountId: number): Promise<void> {
  await api.post(`/server-accounts/${accountId}/sftp-accounts/disconnect-all`)
}

/** `POST /server-accounts/{id}/sftp-accounts/set-access-type` with `{ access_type }`, as legacy. No reload. */
export async function setSftpAccessType (accountId: number, accessType: 'ssh' | 'sftp'): Promise<void> {
  await api.post(`/server-accounts/${accountId}/sftp-accounts/set-access-type`, { access_type: accessType })
}
