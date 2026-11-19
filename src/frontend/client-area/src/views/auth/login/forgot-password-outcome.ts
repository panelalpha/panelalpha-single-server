import type { AlertPayload } from '@/shared/alerts/alerts.store'
import type { ForgotPasswordResponse } from '@/shared/session/session.api'

/** Settled `forgotPassword()` request: the response body, or whatever the request rejected with. */
export type ForgotPasswordResult
  = | { ok: true, data: ForgotPasswordResponse }
    | { ok: false, error: unknown }

/** `error.response.data.errors[field][0]` when it is a string, else `undefined`. Never throws. */
export function firstFieldError (error: unknown, field: string): string | undefined {
  try {
    const messages = (error as { response?: { data?: { errors?: Record<string, unknown> } } } | null | undefined)
      ?.response
      ?.data
      ?.errors
      ?.[field]
    const first: unknown = Array.isArray(messages) ? messages[0] : undefined
    return typeof first === 'string' ? first : undefined
  } catch {
    return undefined
  }
}

/** The message of a 429 (the route's throttle names no field); `undefined` otherwise. Never throws. */
function throttleMessage (error: unknown): string | undefined {
  try {
    const response = (error as { response?: { status?: number, data?: { message?: unknown } | null } } | null | undefined)
      ?.response
    if (response?.status !== 429) {
      return undefined
    }
    const message = response.data?.message
    return typeof message === 'string' && message.trim() !== '' ? message : undefined
  } catch {
    return undefined
  }
}

/**
 * `.then` adds the success alert with the response message,
 * `.catch` adds the error alert with `errors.email[0]`, or a 429's message as the sign-in screen does; any other failure
 * without `errors.email` (419, 500, network) shows nothing. Never throws.
 */
export function resolveForgotPasswordAlert (result: ForgotPasswordResult): AlertPayload | null {
  if (result.ok) {
    return { success: true, successMessage: result.data.message }
  }
  const errorMessage = firstFieldError(result.error, 'email') ?? throttleMessage(result.error)
  return errorMessage === undefined ? null : { success: false, errorMessage }
}
