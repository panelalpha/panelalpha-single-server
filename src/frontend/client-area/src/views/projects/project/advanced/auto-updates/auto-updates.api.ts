import { api } from '@/shared/api/client'

// The WordPress auto-update settings of an instance under `/instances/{id}/wordpress/auto-update`.
// The legacy view calls `Api` inline, so the calls live here. Requests go through the shared client; the `instances` / `projects` segment is rewritten there, so the path stays as
// legacy writes it.

/** Response of `GET .../wordpress/auto-update` (`data.data`). App returns the last two fields, app-lite does not. */
export interface AutoUpdatesSettings {
  /** `1` = latest versions (major and minor), `2` = minor only, `0` = off. */
  auto_update?: number
  auto_update_plugins?: number
  auto_update_themes?: number
  /** WordPress constants that block the updater (app only). */
  updater_blocked_by?: unknown
  /** `'partial'` when only some plugins have auto-updates enabled (app only). */
  plugins?: string
}

/** Body of `PUT .../wordpress/auto-update`. Values stay `undefined` when the GET failed, as in legacy. */
export interface AutoUpdatesBody {
  auto_update: number | undefined
  auto_update_plugins: number | undefined
  auto_update_themes: number | undefined
}

function autoUpdatesPath (id: number | string): string {
  return `/instances/${id}/wordpress/auto-update`
}

/** `GET .../wordpress/auto-update`: returns `data.data`. */
export async function getAutoUpdates (id: number | string): Promise<AutoUpdatesSettings> {
  const { data } = await api.get<{ data: AutoUpdatesSettings }>(autoUpdatesPath(id))
  return data.data
}

/** `PUT .../wordpress/auto-update` with the full body. The response is ignored. */
export async function updateAutoUpdates (id: number | string, body: AutoUpdatesBody): Promise<void> {
  await api.put(autoUpdatesPath(id), body)
}
