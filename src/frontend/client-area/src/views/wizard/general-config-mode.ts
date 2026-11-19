import type { HomeResponse } from '@/shared/session/session.api'

// Step 2 (General Config) has three modes: `local` is the account form of a guest; `hub` follows a Hub connection (only the name of the
// server is editable, the account comes from Hub); `readonly` shows a local account locked and Continue
// only moves on (no API call).

export type GeneralConfigMode = 'local' | 'hub' | 'readonly'

export interface GeneralConfigReadonlyValues {
  serverName: string
  name: string
  email: string
}

/**
 * `local` for a guest; for a signed-in user `hub` while the password is still the generated one of the Hub setup, else `readonly`.
 * A stale `/home` (user and `setup_required` together) is `readonly`, never the form that creates an account for a signed-in user.
 */
export function resolveGeneralConfigMode (input: {
  hasUser: boolean
  setupRequired: boolean | undefined
  passwordGenerated?: boolean | undefined
}): GeneralConfigMode {
  if (!input.hasUser) {
    return 'local'
  }
  if (input.setupRequired) {
    return 'readonly'
  }
  return input.passwordGenerated === true ? 'hub' : 'readonly'
}

/** Values the locked fields show, from `/home`. */
export function readonlyValues (home: Pick<HomeResponse, 'app' | 'user'> | null | undefined): GeneralConfigReadonlyValues {
  return {
    serverName: home?.app?.name ?? '',
    name: home?.user?.name ?? '',
    email: home?.user?.email ?? '',
  }
}
