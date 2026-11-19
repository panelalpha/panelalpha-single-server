import type { FreeSetupPayload, WizardSettings } from './wizard.api'
import { getErrorMessages } from '@/shared/api/error-message'

// Continue of step 1: the account is created in one call to the Community panel, `POST /community/setup`
// (instead of `first-admin-account` + `configurator/app`). The pure part of the step: what it sends and what the answer means.

export interface GeneralConfigValues {
  serverName: string
  name: string
  email: string
  password: string
  passwordConfirm: string
}

export type GeneralConfigOutcome
  = | { kind: 'created' }
  // Someone else finished the setup first (409): the panel reloads `/home` and the user signs in.
    | { kind: 'conflict' }
    | { kind: 'failed', messages: string[] }

export interface GeneralConfigDeps {
  fetchCsrfCookie: () => Promise<unknown>
  createFreeSetup: (payload: FreeSetupPayload) => Promise<void>
  /** Cache of GET answers and `GET /home` are read again, because the backend logged the new admin in. */
  afterCreated: () => Promise<unknown>
}

export function toSetupPayload (values: GeneralConfigValues): FreeSetupPayload {
  return {
    // The rule of the field trims, so a name with spaces around it passes; the panel gets it trimmed, as in `submitServerName`.
    serverName: values.serverName.trim(),
    name: values.name,
    email: values.email,
    password: values.password,
    passwordConfirmation: values.passwordConfirm,
  }
}

function statusOf (error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status
}

/** Creates the account. Never throws: every failure is an outcome the step shows or follows. */
export async function submitGeneralConfig (values: GeneralConfigValues, deps: GeneralConfigDeps): Promise<GeneralConfigOutcome> {
  try {
    await deps.fetchCsrfCookie()
    await deps.createFreeSetup(toSetupPayload(values))
    await deps.afterCreated()
    return { kind: 'created' }
  } catch (error) {
    if (statusOf(error) === 409) {
      return { kind: 'conflict' }
    }
    return { kind: 'failed', messages: getErrorMessages(error) }
  }
}

// Continue of step 2 in the `hub` mode: the account came from Hub, so the step only renames the server (`PUT /community/settings`).

export type ServerNameOutcome
  = | { kind: 'saved' }
  // `fieldMessages` are the messages of the `name` field of a 422 (shown under the field); `messages` are all of them (shown in an alert when none is of the field).
    | { kind: 'failed', messages: string[], fieldMessages: string[] }

export interface ServerNameDeps {
  saveWizardServerName: (name: string, current: WizardSettings) => Promise<void>
}

function nameFieldMessages (error: unknown): string[] {
  const errors = (error as { response?: { data?: { errors?: Record<string, unknown> } | null } } | null)?.response?.data?.errors
  const list = errors && typeof errors === 'object' ? errors.name : undefined
  if (list === undefined) {
    return []
  }
  return (Array.isArray(list) ? list : [list]).map(String)
}

/** Saves the name with the defaults the panel returned, unchanged. Never throws. */
export async function submitServerName (name: string, current: WizardSettings, deps: ServerNameDeps): Promise<ServerNameOutcome> {
  try {
    await deps.saveWizardServerName(name.trim(), current)
    return { kind: 'saved' }
  } catch (error) {
    return { kind: 'failed', messages: getErrorMessages(error), fieldMessages: nameFieldMessages(error) }
  }
}
