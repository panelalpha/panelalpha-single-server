/**
 * `localStorage` keys that carry a register / quick-register request over the login.
 * They are prefixed with `window.location.origin`. The register screen (`views/auth`) writes them and the onboarding
 * (`views/onboarding/after-login.ts`) reads them, so they live in the session core and not in either view group.
 *
 * `tokenStorageKey` is the exception: the control-panel-upgrade token lives in `sessionStorage` and
 * `control-panel-upgrade-token.ts` owns its reads, writes and removals.
 */

export function redirectStorageKey (origin: string): string {
  return `${origin}-redirect`
}

/** The control-panel-upgrade hand-over token: `sessionStorage`, see `control-panel-upgrade-token.ts`. */
export function tokenStorageKey (origin: string): string {
  return `${origin}-token`
}

export function newSiteDescriptionStorageKey (origin: string): string {
  return `${origin}-new-site-description`
}
