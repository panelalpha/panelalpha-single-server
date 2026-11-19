import { api, apiBaseUrl } from '@/shared/api/client'

// The theme calls of an instance.
// Shaped like `instance-plugins.api.ts`. Paths start at `/instances/` so the client rewrites them to `/projects` under single server.
// The screenshots are loaded by the browser, so they keep `/instances`.

/** One installed theme. */
export interface InstalledTheme {
  [key: string]: unknown
  name: string
  title: string
  status: 'active' | 'inactive'
  version: string
  update?: 'available' | 'none'
  update_version?: string | null
  description?: string | null
  async_status?: {
    install?: string | null
    update?: string | null
  }
}

/** One theme of the WordPress.org catalogue. `featured` is set by the screen, not by the API. */
export interface RepositoryTheme {
  [key: string]: unknown
  id: number | string
  slug: string
  name: string
  description?: string | null
  rating?: number | null
  version: string
  screenshot_url?: string | null
  preview_url?: string | null
  type?: string | null
  last_updated?: string | null
  featured?: boolean
  /** Not in the API: set from `theme-item-changed` after an install. */
  async_status?: InstalledTheme['async_status']
}

/** `GET /instances/{id}/wordpress/themes`. */
export async function fetchThemes (id: number): Promise<InstalledTheme[]> {
  const { data } = await api.get<{ data: InstalledTheme[] }>(`/instances/${id}/wordpress/themes`)
  return data.data ?? []
}

/**
 * `GET /instances/{id}/wordpress/themes/new/featured`. Every entry of this list gets `featured = true`
 * for the ribbon; the flag is set here so the screen does not have to.
 */
export async function fetchFeaturedThemes (id: number): Promise<RepositoryTheme[]> {
  const { data } = await api.get<{ data: RepositoryTheme[] }>(`/instances/${id}/wordpress/themes/new/featured`)
  return (data.data ?? []).map(theme => ({ ...theme, featured: true }))
}

/**
 * `GET /instances/{id}/wordpress/themes/new/search/{term}`. An empty term resolves to `[]` without a request
 * The term is one encoded path segment, so `?`, `#`, `%` or `/` stay part of the term.
 */
export async function searchThemes (id: number, term: string): Promise<RepositoryTheme[]> {
  if (!term) {
    return []
  }
  const { data } = await api.get<{ data: RepositoryTheme[] }>(`/instances/${id}/wordpress/themes/new/search/${encodeURIComponent(term)}`)
  return data.data ?? []
}

// The theme name and slug are path segments: they are encoded, so a `#` or `?` in a directory name cannot cut the path.

/** `POST /instances/{id}/wordpress/themes/new/{slug}/install`. The response is ignored by the screen. */
export async function installTheme (id: number, slug: string): Promise<void> {
  await api.post(`/instances/${id}/wordpress/themes/new/${encodeURIComponent(slug)}/install`)
}

/** `PUT /instances/{id}/wordpress/themes/{name}/activate`. */
export async function activateTheme (id: number, name: string): Promise<void> {
  await api.put(`/instances/${id}/wordpress/themes/${encodeURIComponent(name)}/activate`)
}

/** `PUT /instances/{id}/wordpress/themes/{name}/update`. */
export async function updateTheme (id: number, name: string): Promise<void> {
  await api.put(`/instances/${id}/wordpress/themes/${encodeURIComponent(name)}/update`)
}

/** `DELETE /instances/{id}/wordpress/themes/{name}`. Unlike plugins, the list is not read from the answer: the screen reloads it. */
export async function deleteTheme (id: number, name: string): Promise<void> {
  await api.delete(`/instances/${id}/wordpress/themes/${encodeURIComponent(name)}`)
}

/** `<img>` source of an installed theme's screenshot. The browser loads it, so it keeps `/instances`. */
export function themeScreenshotSrc (id: number, name: string): string {
  return `${apiBaseUrl()}/instances/${id}/wordpress/themes/${encodeURIComponent(name)}/screenshot`
}

/**
 * `<img>` source of a catalogue theme: a `custom` theme is screenshotted by the API, the others carry
 * `screenshot_url`. The custom URL is the one of `themeScreenshotUrl` in `views/onboarding/onboarding.api.ts`; it is written out here
 * because `shared` does not import from `features`.
 */
export function newThemeScreenshotSrc (item: Pick<RepositoryTheme, 'id' | 'type' | 'screenshot_url'>): string | null | undefined {
  if (item.type === 'custom') {
    return `${apiBaseUrl()}/instances/onboarding/theme/${item.id}/screenshot`
  }
  return item.screenshot_url
}
