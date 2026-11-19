import type { MysqlDatabase, MysqlDatabasesResponse, MysqlPrivilegesResponse, MysqlServerInfoResponse, MysqlUsersResponse } from '@/views/hosting/hosting.types'
import { cachedGet, clearCachedGet, clearCachedGetByPrefix } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { privilegesRequest } from './mysql-privileges'

// Calls of the Databases screen, same contract as legacy. The lists of the screen read with `Api.get`, so
// every call is a fresh request (no `cachedGet`). The add-user select, the Access details and the privileges read through `cachedGet`,
// as legacy `Api.cached()` does.

/** `GET /server-accounts/{id}/mysql/databases`. */
export async function listDatabases (accountId: number): Promise<MysqlDatabasesResponse> {
  const { data } = await api.get<MysqlDatabasesResponse>(`/server-accounts/${accountId}/mysql/databases`)
  return data
}

/** `GET /server-accounts/{id}/mysql/users`. */
export async function listUsers (accountId: number): Promise<MysqlUsersResponse> {
  const { data } = await api.get<MysqlUsersResponse>(`/server-accounts/${accountId}/mysql/users`)
  return data
}

/** Drops the cached database list and every cached privileges read of the account (they go stale after a database mutation). */
function clearDatabaseCaches (accountId: number): void {
  clearCachedGet(`/server-accounts/${accountId}/mysql/databases`)
  clearCachedGetByPrefix(`/server-accounts/${accountId}/mysql/privileges/`)
}

/** Drops the cached privileges reads of one user (they go stale after the user is renamed, deleted or created again). */
function clearUserPrivilegesCache (accountId: number, user: string): void {
  clearCachedGetByPrefix(`/server-accounts/${accountId}/mysql/privileges/${user}/`)
}

/** The database list of the add-user dialog, from the cache. */
export async function listDatabasesCached (accountId: number): Promise<MysqlDatabase[]> {
  const { data } = await cachedGet<MysqlDatabasesResponse>(`/server-accounts/${accountId}/mysql/databases`)
  return data.data
}

/** `GET /server-accounts/{id}/mysql/server-info` from the cache, the host and port of the Access details modal. */
export async function getServerInfo (accountId: number): Promise<MysqlServerInfoResponse['data']> {
  const { data } = await cachedGet<MysqlServerInfoResponse>(`/server-accounts/${accountId}/mysql/server-info`)
  return data.data
}

/** `POST /server-accounts/{id}/mysql/databases` with the name as typed (legacy posts the form value, no prefix). */
export async function createDatabase (accountId: number, name: string): Promise<void> {
  await api.post(`/server-accounts/${accountId}/mysql/databases`, { name })
  clearDatabaseCaches(accountId)
}

/** `PUT /server-accounts/{id}/mysql/databases/{name}/name`: `name` is the full database name, `newName` the typed value. */
export async function renameDatabase (accountId: number, name: string, newName: string): Promise<void> {
  await api.put(`/server-accounts/${accountId}/mysql/databases/${encodeURIComponent(name)}/name`, { name: newName })
  clearDatabaseCaches(accountId)
}

/** `DELETE /server-accounts/{id}/mysql/databases/{name}`, `name` is the full database name; the dialog's confirmation box is required. */
export async function deleteDatabase (accountId: number, name: string): Promise<void> {
  await api.delete(`/server-accounts/${accountId}/mysql/databases/${encodeURIComponent(name)}`, { data: { confirm: true } })
  clearDatabaseCaches(accountId)
}

/**
 * `POST /server-accounts/{id}/mysql/users`. `form` is the modal's values as legacy posts them: `name` as typed, `password`
 * and, when the backend requires it, `database`.
 */
export async function createUser (accountId: number, form: Record<string, unknown>): Promise<void> {
  await api.post(`/server-accounts/${accountId}/mysql/users`, form)
  if (typeof form.name === 'string') {
    clearUserPrivilegesCache(accountId, form.name)
  }
}

/**
 * `PUT /server-accounts/{id}/mysql/users/{user}` with the modal's values (`name`, `hiddenPassword`, `password`). The user name is not
 * encoded, as in legacy.
 */
export async function updateUser (accountId: number, user: string, form: Record<string, unknown>): Promise<void> {
  await api.put(`/server-accounts/${accountId}/mysql/users/${user}`, form)
  clearUserPrivilegesCache(accountId, user)
}

/** `DELETE /server-accounts/{id}/mysql/users/{user}`, not encoded as in legacy. */
export async function deleteUser (accountId: number, user: string): Promise<void> {
  await api.delete(`/server-accounts/${accountId}/mysql/users/${user}`)
  clearUserPrivilegesCache(accountId, user)
}

/** `…/mysql/privileges/{user}/{db}`: the user as is, the database encoded. */
function privilegesUrl (accountId: number, user: string, database: string): string {
  return `/server-accounts/${accountId}/mysql/privileges/${user}/${encodeURIComponent(database)}`
}

/** The privileges of a user on a database, from the cache. */
export async function getPrivileges (accountId: number, user: string, database: string): Promise<string[]> {
  const { data } = await cachedGet<MysqlPrivilegesResponse>(privilegesUrl(accountId, user, database))
  return privilegeList(data.data)
}

/** The Engine-backed panel sends the list as one comma-separated string; legacy's backend sent an array. */
function privilegeList (value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value
  }
  return typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : []
}

/**
 * Stores the privileges with a PUT, or a DELETE for an empty list, then drops the cached read of them.
 */
export async function updatePrivileges (accountId: number, user: string, database: string, privileges: string[]): Promise<void> {
  const url = privilegesUrl(accountId, user, database)
  const request = privilegesRequest(privileges)
  await (request.method === 'PUT' ? api.put(url, request.body) : api.delete(url))
  clearCachedGet(url)
}
