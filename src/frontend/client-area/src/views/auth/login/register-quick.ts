/**
 * Pure helpers for legacy Register quick-register query → storage side effects.
 * Key names use `window.location.origin` as prefix. The `-redirect` and `-new-site-description` keys
 * stay in `localStorage` (`storage`); the control-panel-upgrade token goes to `sessionStorage` (`tokenStorage`, see
 * `shared/session/control-panel-upgrade-token.ts`).
 */
import { storeControlPanelUpgradeToken } from '@/shared/session/control-panel-upgrade-token'
import { newSiteDescriptionStorageKey, redirectStorageKey } from '@/shared/session/login-storage-keys'

export function queryHasKey (
  query: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(query, key)
}

/** First string value from a Vue Router query entry (string | string[] | null). */
export function firstQueryString (value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0]
    return first == null ? undefined : String(first)
  }
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return undefined
  }
  return String(value)
}

/**
 * Resolve email for autofill: prop predefinedEmail wins, else query.email.
 */
export function resolveAutoCompleteEmail (
  predefinedEmail?: string | null,
  queryEmail?: unknown,
): string {
  if (predefinedEmail) {
    return predefinedEmail
  }
  return firstQueryString(queryEmail) ?? ''
}

export interface PersistQuickRegisterResult {
  /** Skip post-register dashboard navigation (CP upgrade / new-site). */
  skipDashboard: boolean
  /** True when control-panel-upgrade query was present (caller skips registration_enabled gate). */
  controlPanelUpgrade: boolean
}

interface PersistQuickRegisterOptions {
  storage?: Storage
  /** Where the one-shot control-panel-upgrade token goes: `sessionStorage` by default. */
  tokenStorage?: Storage
  origin?: string
}

function resolveStorage (options?: PersistQuickRegisterOptions): Storage | undefined {
  return options?.storage
    ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
}

function resolveOrigin (options?: PersistQuickRegisterOptions): string {
  return options?.origin
    ?? (typeof window === 'undefined' ? '' : window.location.origin)
}

/**
 * Persist the control-panel-upgrade keys from the route query.
 * Runs BEFORE the registration_enabled gate, so CP upgrade can store token/redirect
 * even when public registration is disabled.
 * Does not mutate the query.
 */
export function persistControlPanelUpgradeQuery (
  query: Record<string, unknown>,
  options?: PersistQuickRegisterOptions,
): PersistQuickRegisterResult {
  const storage = resolveStorage(options)
  const origin = resolveOrigin(options)

  if (!storage || !queryHasKey(query, 'control-panel-upgrade')) {
    return { skipDashboard: false, controlPanelUpgrade: false }
  }

  storage.setItem(redirectStorageKey(origin), 'control-panel-upgrade')
  // Legacy sets token even when absent (coerces undefined → string). The token is a one-shot credential: the tab keeps it,
  // the origin's `localStorage` does not (see `control-panel-upgrade-token.ts`).
  const token = firstQueryString(query.token)
  storeControlPanelUpgradeToken(token ?? '', { session: options?.tokenStorage, origin })
  return { skipDashboard: true, controlPanelUpgrade: true }
}

/**
 * Persist the new-site / new-import keys from the route query.
 * Runs AFTER the registration_enabled gate: with registration disabled the view
 * redirects to /login first and leaves no `-redirect` behind.
 * Does not mutate the query.
 */
export function persistNewSiteQuery (
  query: Record<string, unknown>,
  options?: PersistQuickRegisterOptions,
): PersistQuickRegisterResult {
  const storage = resolveStorage(options)
  const origin = resolveOrigin(options)

  if (!storage) {
    return { skipDashboard: false, controlPanelUpgrade: false }
  }

  if (queryHasKey(query, 'new-site')) {
    storage.setItem(redirectStorageKey(origin), 'new-site')

    const descriptionRaw = query.description
    const description = Array.isArray(descriptionRaw)
      ? descriptionRaw[0]
      : descriptionRaw
    if (typeof description === 'string' && description.trim().length > 0) {
      storage.setItem(
        newSiteDescriptionStorageKey(origin),
        description.trim(),
      )
    } else {
      storage.removeItem(newSiteDescriptionStorageKey(origin))
    }
    return { skipDashboard: true, controlPanelUpgrade: false }
  }

  if (queryHasKey(query, 'new-import')) {
    storage.setItem(redirectStorageKey(origin), 'new-import')
  }

  return { skipDashboard: false, controlPanelUpgrade: false }
}
