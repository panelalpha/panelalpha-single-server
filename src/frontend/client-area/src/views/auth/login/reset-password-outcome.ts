import type { AlertPayload } from '@/shared/alerts/alerts.store'
import type { ResetPasswordResponse } from '@/shared/session/session.api'
import { firstFieldError } from '@/views/auth/login/forgot-password-outcome'

/** Settled `resetPassword()` request: the response body, or whatever the request rejected with. */
export type ResetPasswordResult
  = | { ok: true, data: ResetPasswordResponse }
    | { ok: false, error: unknown }

/**
 * `.then` adds the success alert with the response message, `.catch` adds the error
 * alert with `errors.email[0]`. Deviation: without `errors.email`, `errors.password[0]` (weak or
 * mismatched password) is shown too, where legacy showed nothing. Any other failure (429, 419, 500, network) crashed legacy
 * with a `TypeError`; by the legacy-bug policy it shows nothing here. Never throws.
 */
export function resolveResetPasswordAlert (result: ResetPasswordResult): AlertPayload | null {
  if (result.ok) {
    return { success: true, successMessage: result.data.message }
  }
  const errorMessage = firstFieldError(result.error, 'email') ?? firstFieldError(result.error, 'password')
  return errorMessage === undefined ? null : { success: false, errorMessage }
}
