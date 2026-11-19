import type { WordpressUrlTest } from './onboarding.api'

// The modal keeps the state in its own component; this
// module holds the rules that do not need the DOM or the timers.

/** The check runs once the typing pauses for this long. */
export const IMPORT_URL_DEBOUNCE_MS = 500

/**
 * The state of the url check. `empty` is the field with no text (no request), `loading` the debounce or the request, `success` a
 * WordPress site was detected, `not-detected` the site answered without WordPress (warning), `error_message` the check failed.
 */
export type UrlVerificationState = 'empty' | 'loading' | 'success' | 'not-detected' | 'error_message'

export interface UrlVerification {
  state: UrlVerificationState
  /** The API error text (`error_message` state), shown in the error box. */
  message: string | null
}

/** What the url step hands on: the url, and the ip only when the advanced field holds a valid one. */
export interface ImportUrlSelection {
  url: string
  ip?: string
}

/**
 * A url with no `http://` or `https://` scheme gets `https://` in front. The empty field stays
 * empty, so no request goes out for it (legacy would send a bare `https://`).
 */
export function normalizeImportUrl (value: string): string {
  if (value === '' || /^https?:\/\//.test(value)) {
    return value
  }
  return `https://${value}`
}

/**
 * Continue is allowed on a detected WordPress site and on the
 * warning (continue anyway). The empty field, a running check and an error keep it disabled.
 */
export function isContinueAllowed (state: UrlVerificationState): boolean {
  return state === 'success' || state === 'not-detected'
}

/** An empty ip is fine, a filled one must be a valid IPv4. */
export function isIpAddressValid (value: string): boolean {
  const trimmed = value.trim()
  return trimmed === '' || isValidIpv4(trimmed)
}

/** Four dot-separated numbers from 0 to 255. */
export function isValidIpv4 (value: string): boolean {
  const match = value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) {
    return false
  }
  return match.slice(1).every(part => {
    const n = Number(part)
    return Number.isInteger(n) && n >= 0 && n <= 255
  })
}

/** The trimmed ip the requests carry, or `undefined` when it is empty or invalid. */
export function optionalIpAddress (value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed !== '' && isValidIpv4(trimmed) ? trimmed : undefined
}

/**
 * A detected WordPress passes; an `error_message` is the error; anything else is the
 * "not detected" warning, which the user can continue past.
 */
export function verificationFromTest (result: WordpressUrlTest): UrlVerification {
  if (result.wordpress_detected) {
    return { state: 'success', message: null }
  }
  if (result.error_message) {
    return { state: 'error_message', message: result.error_message }
  }
  return { state: 'not-detected', message: null }
}

/** A failed request is the error state with the API message. */
export function verificationFromError (message: string): UrlVerification {
  return { state: 'error_message', message }
}

/**
 * Sequence guard of the url check: a response counts only when no newer check
 * started after it. Each check takes the next number; the answer is applied only while its number is still the latest.
 */
export function isCurrentResponse (responseSequence: number, latestSequence: number): boolean {
  return responseSequence === latestSequence
}
