import { api } from '@/shared/api/client'

// Calls of the instance WordPress config page, same contract as legacy. The page is identical in app and app-lite. Requests go
// through the shared client; the `instances` / `projects` segment is rewritten there.

/**
 * One constant or variable of `GET /instances/{id}/wordpress/config`. The engine allows `null` in `name` and `value`.
 * A secret (the database password, the keys and salts) carries a mask in `value` and `secret: true`; the real value
 * comes from the reveal endpoint only.
 */
export interface WordpressConfigItem {
  name: string | null
  value: string | number | boolean | null
  type: string
  secret?: boolean
}

/** `GET /instances/{id}/wordpress/config`: the payload is `data.data`, an empty list when it is missing. */
export async function listConfigs (instanceId: number | string): Promise<WordpressConfigItem[]> {
  const { data: body } = await api.get<{ data?: WordpressConfigItem[] }>(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/config`)
  return body.data ?? []
}

/** `POST /instances/{id}/wordpress/config` with the values of the Create modal. */
export async function createConfig (
  instanceId: number | string,
  body: { name: string, value: string, type: string },
): Promise<void> {
  await api.post(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/config`, body)
}

/**
 * `PUT /instances/{id}/wordpress/config/{name}`. The name in the URL is the original one of the row, encoded here;
 * the body is the whole row with the edits, as legacy sends it.
 */
export async function updateConfig (
  instanceId: number | string,
  name: string,
  body: Record<string, unknown>,
): Promise<void> {
  await api.put(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/config/${encodeURIComponent(name)}`, body)
}

/** `DELETE /instances/{id}/wordpress/config/{name}` with `{ type }` as the request body. */
export async function deleteConfig (instanceId: number | string, name: string, type: string): Promise<void> {
  await api.delete(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/config/${encodeURIComponent(name)}`, { data: { type } })
}
