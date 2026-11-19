import type { LoginResponse } from '@/shared/session/session.api'

export type LoginStep
  = | 'email'
    | 'password'
    | 'set_password'
    | 'verify_email'
    | 'two_factor'

/**
 * Map intermediate POST /login flags to the next UI step.
 * Returns null when the payload is a final home-shaped success (or empty).
 */
export function nextLoginStepFromResponse (data: LoginResponse): LoginStep | null {
  if (data.redirect_to) {
    return null
  }
  if (data.set_password === true) {
    return 'set_password'
  }
  if (data.use_password === true) {
    return 'password'
  }
  if (data.verify_email === true) {
    return 'verify_email'
  }
  if (data.two_factor === true) {
    return 'two_factor'
  }
  return null
}
