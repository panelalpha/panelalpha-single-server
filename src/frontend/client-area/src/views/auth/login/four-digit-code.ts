/**
 * Pure helpers for register 4-digit email verification cells
 * (same join / sanitize behavior as legacy).
 */

/** Keep a single numeric digit (or empty) from an input cell value. */
export function sanitizeDigitInput (value: unknown): string {
  return String(value ?? '').replaceAll(/\D/g, '').slice(0, 1)
}

/**
 * Join four digit cells into the verify-code payload string.
 * Non-digits are stripped per cell; each cell contributes at most one char.
 */
export function joinFourDigitCode (digits: readonly string[]): string {
  return digits.map(d => sanitizeDigitInput(d)).join('')
}

/** True when all four cells hold exactly one digit each. */
export function isFourDigitCodeComplete (digits: readonly string[]): boolean {
  return digits.length === 4 && digits.every(d => /^\d$/.test(String(d ?? '')))
}
