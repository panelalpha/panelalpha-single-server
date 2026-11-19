import { cachedGet, clearCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'

// The debug and maintenance modes live in `src/entities/project/instance-modes.api.ts`, the Control Panel SSO in `src/entities/sso/`.

export interface PhpVersion {
  label: string
  value: string
}

export interface SuggestedDirective {
  directive: string
  type?: string
  options?: string[]
}

export interface PhpSettingsResponse {
  configurable: boolean
  custom_directives: boolean
  directives: { directive: string, value: string }[]
  suggested_directives?: SuggestedDirective[]
  modifiable_directives_list?: boolean
}

/** One row of the PHP settings table: the UI fields (`type`, `options`, `editing`) travel with the body, as legacy sends them. */
export interface PhpSettingRow {
  directive: string
  value: string
  editing?: boolean
  type?: string
  options?: string[]
}

function phpVersionUrl (hostingId: number, domain: string): string {
  return `/server-accounts/${hostingId}/domains/${encodeURIComponent(domain)}/php-version`
}

/**
 * The Engine-backed panel (single-server) answers a version as a bare string (`"8.4"`, `["8.4", "8.3"]`), while the hosting-server
 * integrations of legacy answer `{ label, value }`. Both shapes are accepted: a string is its own label and value, so the card shows
 * the version and the modal select keeps `return-object` and sends `value`. Anything else is `null` (no version).
 */
function toPhpVersion (raw: unknown): PhpVersion | null {
  if (typeof raw === 'string') {
    return raw === '' ? null : { label: raw, value: raw }
  }
  if (typeof raw === 'object' && raw !== null) {
    const { label, value } = raw as { label?: unknown, value?: unknown }
    const own = typeof value === 'string' ? value : ''
    const text = typeof label === 'string' && label !== '' ? label : own
    if (text === '') {
      return null
    }
    return { label: text, value: own === '' ? text : own }
  }
  return null
}

/** `GET .../php-version` through the cache: the domain's PHP version, or `null` when there is none. */
export async function getPhpVersion (hostingId: number, domain: string): Promise<PhpVersion | null> {
  const { data } = await cachedGet<{ data: unknown }>(phpVersionUrl(hostingId, domain))
  return toPhpVersion(data.data)
}

/** Drops the cached PHP version of the domain, so the next read shows the saved one. */
export function clearPhpVersionCache (hostingId: number, domain: string): void {
  clearCachedGet(phpVersionUrl(hostingId, domain))
}

/** `GET /server-accounts/{id}/php-versions` through the cache: the versions the modal offers. */
export async function getPhpVersions (hostingId: number): Promise<PhpVersion[]> {
  const { data } = await cachedGet<{ data: unknown }>(`/server-accounts/${hostingId}/php-versions`)
  return Array.isArray(data.data)
    ? data.data.map(item => toPhpVersion(item)).filter((version): version is PhpVersion => version !== null)
    : []
}

/** `PUT .../php-version` with `{ php_version }`. */
export async function updatePhpVersion (hostingId: number, domain: string, phpVersion: string | undefined): Promise<void> {
  await api.put(phpVersionUrl(hostingId, domain), { php_version: phpVersion })
}

/** `GET .../php-settings`, not cached: the body is the settings themselves. */
export async function getPhpSettings (hostingId: number, domain: string): Promise<PhpSettingsResponse> {
  const { data } = await api.get<PhpSettingsResponse>(`/server-accounts/${hostingId}/domains/${encodeURIComponent(domain)}/php-settings`)
  return data
}

/** `PUT .../php-settings`: the body is the whole table of rows. */
export async function updatePhpSettings (hostingId: number, domain: string, rows: PhpSettingRow[]): Promise<void> {
  await api.put(`/server-accounts/${hostingId}/domains/${encodeURIComponent(domain)}/php-settings`, rows)
}
