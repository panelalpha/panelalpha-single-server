import { api } from '@/shared/api/client'

// Calls of the phpMyAdmin SSO flow, same contract as legacy. Shared by the Databases screen and the developer settings of an instance.

/** One database of the phpMyAdmin SSO choice: `value` is the Plesk database id, sent as `database_id`. */
export interface PhpMyAdminDatabase {
  value: number | undefined
  label: string
}

/** `GET /server-accounts/{id}/mysql/databases`, mapped to the SSO options. Plesk only in the callers. */
export async function listPhpMyAdminDatabases (accountId: number): Promise<PhpMyAdminDatabase[]> {
  const { data } = await api.get<{ data?: Array<{ id?: number, database: string }> }>(`/server-accounts/${accountId}/mysql/databases`)
  return (data.data ?? []).map(db => ({ value: db.id, label: db.database }))
}

async function postSsoUrl (accountId: number, endpoint: string, databaseId?: number): Promise<string> {
  const url = `/server-accounts/${accountId}/mysql/${endpoint}`
  // Legacy sends no body for a non-Plesk server and `{ database_id }` for a Plesk one.
  const { data } = databaseId === undefined
    ? await api.post<{ data: { url: string } }>(url)
    : await api.post<{ data: { url: string } }>(url, { database_id: databaseId })
  return data.data.url
}

/** `POST /server-accounts/{id}/mysql/phpmyadmin-sso-url`: the direct login URL (`Log in directly`). */
export function getPhpMyAdminSsoUrl (accountId: number, databaseId?: number): Promise<string> {
  return postSsoUrl(accountId, 'phpmyadmin-sso-url', databaseId)
}

/** `POST /server-accounts/{id}/mysql/phpmyadmin-preview-sso-url`: the temporary URL (`Log in with Temporary URL`). */
export function getPhpMyAdminPreviewSsoUrl (accountId: number, databaseId?: number): Promise<string> {
  return postSsoUrl(accountId, 'phpmyadmin-preview-sso-url', databaseId)
}
