import type { HomeUser } from './session.api'

type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Legacy `'reseller_settings' in user && user.reseller_settings !== null`. */
export function isReseller (user: HomeUser): boolean {
  return 'reseller_settings' in user && user.reseller_settings !== null
}

/**
 * Mirrors legacy SsoLogin: `?branding` (legacy `!!query.branding`) switches the `<origin>-style-manager`
 * flag on or off. Any non-empty value counts, including `false`.
 */
export function syncStyleManagerFlag (
  storage: FlagStorage,
  origin: string,
  brandingQuery: unknown,
): void {
  const key = `${origin}-style-manager`
  const shouldDisplay = Boolean(brandingQuery)
  const displaying = Boolean(storage.getItem(key))

  if (shouldDisplay && !displaying) {
    storage.setItem(key, 'true')
  } else if (!shouldDisplay && displaying) {
    storage.removeItem(key)
  }
}
