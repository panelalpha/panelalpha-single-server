import { tokenStorageKey } from './login-storage-keys'
/**
 * The hand-over token of `/register?control-panel-upgrade&token=…`.
 *
 * The token is a credential: it links a control panel to the account the sign-up creates, so it is kept for that one flow only.
 * It lives in `sessionStorage` (a social sign-up returns in the same tab, so the round trip keeps it; closing the tab drops it),
 * never in `localStorage`, where an abandoned registration left it readable on the origin and a later sign-up re-sent it silently.
 * Legacy wrote `${origin}-token` to `localStorage`; a copy an older build left behind is dropped here and not read again.
 *
 * This module owns the storage of the key: the register screen (`views/auth`) writes it, the register request and the social
 * buttons (`views/auth`) read it, and the onboarding (`views/onboarding/after-login.ts`) and the sign-out (`clearSession`)
 * remove it.
 */
import { onSessionCleared } from './session-reset'

// `after-login` only removes, `register-quick` only writes: both take the storage they own, the helpers below need the rest.
type ReadableStorage = Pick<Storage, 'getItem' | 'removeItem'>
type WritableStorage = ReadableStorage & Pick<Storage, 'setItem'>

export interface ControlPanelUpgradeTokenOptions {
  /** Where the token lives: `window.sessionStorage` by default. */
  session?: WritableStorage | null
  /** Where an older build left it: `window.localStorage` by default. */
  legacy?: ReadableStorage | null
  /** Prefix of the key: `window.location.origin` by default. */
  origin?: string
}

/** Reads a browser storage, or `null` when there is no `window` or the browser blocks it (private mode, blocked cookies). */
function browserStorage (name: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window[name]
  } catch {
    return null
  }
}

function resolveSession (options?: ControlPanelUpgradeTokenOptions): WritableStorage | null {
  return options?.session === undefined ? browserStorage('sessionStorage') : options.session
}

function resolveLegacy (options?: ControlPanelUpgradeTokenOptions): ReadableStorage | null {
  return options?.legacy === undefined ? browserStorage('localStorage') : options.legacy
}

function resolveOrigin (options?: ControlPanelUpgradeTokenOptions): string {
  if (options?.origin !== undefined) {
    return options.origin
  }
  return typeof window === 'undefined' ? '' : window.location.origin
}

/** Drops the copy an older build wrote to `localStorage`. It is never read back: that leak is what this module closes. */
function dropLegacyToken (origin: string, options?: ControlPanelUpgradeTokenOptions): void {
  try {
    resolveLegacy(options)?.removeItem(tokenStorageKey(origin))
  } catch {
    // A storage the browser refuses to touch has nothing to clean up.
  }
}

/** Stores the token of the control-panel-upgrade hand-over for this tab. An empty token is stored empty (legacy did the same). */
export function storeControlPanelUpgradeToken (token: string, options?: ControlPanelUpgradeTokenOptions): void {
  const origin = resolveOrigin(options)
  dropLegacyToken(origin, options)
  try {
    resolveSession(options)?.setItem(tokenStorageKey(origin), token)
  } catch {
    // Without a writable storage the sign-up still works, only without the upgrade.
  }
}

/** The stored token, or `null`. A legacy `localStorage` copy is dropped, not returned. */
export function readControlPanelUpgradeToken (options?: ControlPanelUpgradeTokenOptions): string | null {
  const origin = resolveOrigin(options)
  dropLegacyToken(origin, options)
  try {
    return resolveSession(options)?.getItem(tokenStorageKey(origin)) ?? null
  } catch {
    return null
  }
}

/** Removes the token from both storages: after the registration that used it, on sign-out and on a 401 (`clearSession`). */
export function clearControlPanelUpgradeToken (options?: ControlPanelUpgradeTokenOptions): void {
  const origin = resolveOrigin(options)
  dropLegacyToken(origin, options)
  try {
    resolveSession(options)?.removeItem(tokenStorageKey(origin))
  } catch {
    // See `storeControlPanelUpgradeToken`.
  }
}

// The token is a sign-up credential of the user who is signed out: `clearSession()` drops it with the rest of the session.
onSessionCleared(() => {
  clearControlPanelUpgradeToken()
})
