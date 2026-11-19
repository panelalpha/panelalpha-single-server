import { api } from '@/shared/api/client'

// The bodies are flat: legacy reads `response.data`.

export interface FreeSettings {
  name: string
  url: string
  default_language: string
  default_date_format: string
  languages: string[]
  date_formats: string[]
}

export interface FreeSettingsUpdate {
  name: string
  default_language: string
  default_date_format: string
}

/** `GET /community/settings` (no cache). */
export async function getFreeSettings (): Promise<FreeSettings> {
  const { data } = await api.get<FreeSettings>('/community/settings')
  return data
}

/** `PUT /community/settings`. */
export async function updateFreeSettings (settings: FreeSettingsUpdate): Promise<FreeSettings> {
  const { data } = await api.put<FreeSettings>('/community/settings', {
    name: settings.name,
    default_language: settings.default_language,
    default_date_format: settings.default_date_format,
  })
  return data
}

/** `PUT /community/settings/url`: the saved origin, and whether the panel moved there, so the old address no longer answers. */
export interface FreeUrlChange {
  url: string
  moved?: boolean
}

/** `PUT /community/settings/url`. */
export async function updateFreeUrl (url: string): Promise<FreeUrlChange> {
  const { data } = await api.put<FreeUrlChange>('/community/settings/url', { url })
  return data
}
