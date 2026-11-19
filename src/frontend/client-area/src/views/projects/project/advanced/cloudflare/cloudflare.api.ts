import { api } from '@/shared/api/client'

// The Cloudflare settings of a WordPress instance under `/instances/{id}/wordpress/cloudflare`. The status check
// lives in `@/entities/domain/verify-domain-resolving`. Requests go through the shared client; the `instances` / `projects`
// segment is rewritten there, so these paths stay as legacy writes them.

function cloudflarePath (id: number | string): string {
  return `/instances/${id}/wordpress/cloudflare`
}

/** `GET .../cloudflare/security`: the current security level (`off`, `essentially_off`, `low`, `medium`, `high`, `under_attack`). */
export async function getSecurityLevel (id: number | string): Promise<string> {
  const { data } = await api.get<{ value: string }>(`${cloudflarePath(id)}/security`)
  return data.value
}

/** `PATCH .../cloudflare/security` with `{ value }`. */
export async function updateSecurityLevel (id: number | string, value: string): Promise<void> {
  await api.patch(`${cloudflarePath(id)}/security`, { value })
}

/** `GET .../cloudflare/browser-check`: the raw value (`'on'` or another string); the mapping to a boolean is `isCloudflareOn`. */
export async function getBrowserCheck (id: number | string): Promise<string> {
  const { data } = await api.get<{ value: string }>(`${cloudflarePath(id)}/browser-check`)
  return data.value
}

/** `PATCH .../cloudflare/browser-check` with `{ value }` as a boolean. */
export async function updateBrowserCheck (id: number | string, value: boolean): Promise<void> {
  await api.patch(`${cloudflarePath(id)}/browser-check`, { value })
}

/** `GET .../cloudflare/development-mode`: the raw value (`'on'` or another string); the mapping to a boolean is `isCloudflareOn`. */
export async function getDevelopmentMode (id: number | string): Promise<string> {
  const { data } = await api.get<{ value: string }>(`${cloudflarePath(id)}/development-mode`)
  return data.value
}

/** `PATCH .../cloudflare/development-mode` with `{ value }` as a boolean. */
export async function updateDevelopmentMode (id: number | string, value: boolean): Promise<void> {
  await api.patch(`${cloudflarePath(id)}/development-mode`, { value })
}

/** `POST .../cloudflare/purge-cache` without a body. */
export async function purgeCache (id: number | string): Promise<void> {
  await api.post(`${cloudflarePath(id)}/purge-cache`)
}
