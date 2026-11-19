import { api } from '@/shared/api/client'

// The plugin calls of an instance. Shared with the Plugins screen and the frame. Paths start at `/instances/` so the client rewrites them to
// `/projects` under single server.

/** One installed plugin. */
export interface InstalledPlugin {
  [key: string]: unknown
  name: string
  title: string
  description: string
  version: string
  status: 'active' | 'inactive'
  update?: 'available' | null
  update_version?: string | null
  async_status?: {
    install?: string | null
    update?: string | null
  }
  activation_disabled?: boolean
}

/** One plugin of the WordPress.org catalogue. `description` is missing from the featured list. */
export interface RepositoryPlugin {
  id: number | string
  type: string
  name: string
  slug: string
  version: string
  short_description: string
  description?: string
  icons?: {
    'svg'?: string
    '1x'?: string
  } | null
  status: string
  tested: string
  rating: number
  active_installs: number
  last_updated: string
  /** Not in the API: set from `plugin-item-changed` after an install. */
  async_status?: InstalledPlugin['async_status']
}

/** `GET /instances/{id}/wordpress/plugins`. */
export async function fetchPlugins (id: number): Promise<InstalledPlugin[]> {
  const { data } = await api.get<{ data: InstalledPlugin[] }>(`/instances/${id}/wordpress/plugins`)
  return data.data ?? []
}

/** `GET /instances/{id}/wordpress/plugins/new/featured`. */
export async function fetchFeaturedPlugins (id: number): Promise<RepositoryPlugin[]> {
  const { data } = await api.get<{ data: RepositoryPlugin[] }>(`/instances/${id}/wordpress/plugins/new/featured`)
  return data.data ?? []
}

/**
 * `GET /instances/{id}/wordpress/plugins/new/search/{term}`. Legacy put the term in the path as typed; here it is
 * one encoded segment, so `?`, `#`, `%` or `/` stay part of the term (a space goes out as `%20` either way).
 */
export async function searchPlugins (id: number, term: string): Promise<RepositoryPlugin[]> {
  const { data } = await api.get<{ data: RepositoryPlugin[] }>(`/instances/${id}/wordpress/plugins/new/search/${encodeURIComponent(term)}`)
  return data.data ?? []
}

/** `POST /instances/{id}/wordpress/plugins/new/{slug}/install`. The response is ignored by the screen. */
export async function installPlugin (id: number, slug: string): Promise<void> {
  await api.post(`/instances/${id}/wordpress/plugins/new/${slug}/install`)
}

/** `PUT /instances/{id}/wordpress/plugins/{name}/activate`. */
export async function activatePlugin (id: number, name: string): Promise<void> {
  await api.put(`/instances/${id}/wordpress/plugins/${name}/activate`)
}

/** `PUT /instances/{id}/wordpress/plugins/{name}/deactivate`. */
export async function deactivatePlugin (id: number, name: string): Promise<void> {
  await api.put(`/instances/${id}/wordpress/plugins/${name}/deactivate`)
}

/** `PUT /instances/{id}/wordpress/plugins/{name}/update`. */
export async function updatePlugin (id: number, name: string): Promise<void> {
  await api.put(`/instances/${id}/wordpress/plugins/${name}/update`)
}

/** `DELETE /instances/{id}/wordpress/plugins/{name}`. Returns the full plugin list from the response. */
export async function deletePlugin (id: number, name: string): Promise<InstalledPlugin[]> {
  const { data } = await api.delete<{ data: InstalledPlugin[] }>(`/instances/${id}/wordpress/plugins/${name}`)
  return data.data ?? []
}
