import type { HomeResponse } from '@/shared/session/session.api'
import { api } from '@/shared/api/client'

// Local setup and settings of the Community panel; the Hub calls (`/community/hub*`) are `@/entities/hub/hub.api`.

export interface FreeSetupPayload {
  serverName: string
  name: string
  email: string
  password: string
  passwordConfirmation: string
}

export interface WizardSettings {
  name: string
  default_language: string
  default_date_format: string
}

/** Name of the server sent to Hub with the start: the panel name, or a fallback when it is empty. */
export function defaultServerName (home: Pick<HomeResponse, 'app'> | null | undefined): string {
  const name = home?.app?.name?.trim()
  return name === undefined || name === '' ? 'My server' : name
}

export async function createFreeSetup (payload: FreeSetupPayload): Promise<void> {
  await api.post('/community/setup', {
    server_name: payload.serverName,
    name: payload.name,
    email: payload.email,
    password: payload.password,
    password_confirmation: payload.passwordConfirmation,
  })
}

/** `GET /community/settings`: the name of the server and the two defaults that `PUT` must send back unchanged. */
export async function getWizardSettings (): Promise<WizardSettings> {
  const { data } = await api.get<WizardSettings>('/community/settings')
  return data
}

/** `PUT /community/settings` with a new server name and the current defaults. */
export async function saveWizardServerName (name: string, current: WizardSettings): Promise<void> {
  await api.put('/community/settings', {
    name,
    default_language: current.default_language,
    default_date_format: current.default_date_format,
  })
}
