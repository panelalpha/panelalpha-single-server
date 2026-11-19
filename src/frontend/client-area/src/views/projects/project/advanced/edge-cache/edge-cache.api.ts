import { api } from '@/shared/api/client'

// The edge cache of a WordPress
// instance under `/instances/{id}/wordpress/edge-cache`. Requests go through the shared client; the `instances` / `projects` segment is
// rewritten there, so these paths stay as legacy writes them.

function edgeCachePath (id: number | string): string {
  return `/instances/${id}/wordpress/edge-cache`
}

/** `GET .../edge-cache`: the cache switch (`isActive`) and the defensive mode switch (`isDefensiveMode`). A missing or `null` flag is off. */
export async function getEdgeCache (id: number | string): Promise<{ isActive: boolean, isDefensiveMode: boolean }> {
  const { data } = await api.get<{ isActive?: boolean | null, isDefensiveMode?: boolean | null }>(edgeCachePath(id))
  return { isActive: data.isActive === true, isDefensiveMode: data.isDefensiveMode === true }
}

/** `PUT .../edge-cache` with `{ status }`. */
export async function updateEdgeCache (id: number | string, status: boolean): Promise<void> {
  await api.put(edgeCachePath(id), { status })
}

/** `PUT .../edge-cache/purge` without a body. */
export async function purgeEdgeCache (id: number | string): Promise<void> {
  await api.put(`${edgeCachePath(id)}/purge`)
}

/** `PUT .../edge-cache/defensive-mode` with `{ status, ttl }`, where `ttl` is in seconds. */
export async function updateDefensiveMode (id: number | string, status: boolean, ttl: number): Promise<void> {
  await api.put(`${edgeCachePath(id)}/defensive-mode`, { status, ttl })
}
