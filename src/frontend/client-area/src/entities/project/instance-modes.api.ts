import { cachedGet, clearCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'

// The maintenance mode and debug mode reads of the instance frame. The answer is cached for the default TTL, like legacy.
// Second consumer: the developer settings screen of an instance (a plain GET, the PUT and the cache clear).

export type InstanceMode = 'debug-mode' | 'maintenance-mode'

interface InstanceModeResponse {
  status: boolean
}

function modeUrl (id: number, mode: InstanceMode): string {
  return `/instances/${id}/wordpress/${mode}`
}

export async function getMaintenanceMode (id: number): Promise<boolean> {
  const { data } = await cachedGet<InstanceModeResponse>(modeUrl(id, 'maintenance-mode'))
  return data.status
}

export async function getDebugMode (id: number): Promise<boolean> {
  const { data } = await cachedGet<InstanceModeResponse>(modeUrl(id, 'debug-mode'))
  return data.status
}

/** `GET` of a mode without the cache, as the developer settings screen of legacy reads it. */
export async function getInstanceMode (id: number, mode: InstanceMode): Promise<boolean> {
  const { data } = await api.get<InstanceModeResponse>(modeUrl(id, mode))
  return data.status
}

/** `PUT` of a mode: the body is the new status. */
export async function updateInstanceMode (id: number, mode: InstanceMode, status: boolean): Promise<void> {
  await api.put(modeUrl(id, mode), { status })
}

/** Drops the cached answer of a mode, so the frame reads the saved value again. */
export function clearInstanceModeCache (id: number, mode: InstanceMode): void {
  clearCachedGet(modeUrl(id, mode))
}
