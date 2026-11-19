import type { AlertPayload } from '@/shared/alerts/alerts.store'
import type { ResetPasswordResponse } from '@/shared/session/session.api'
import { type ResetPasswordResult, resolveResetPasswordAlert } from '@/views/auth/login/reset-password-outcome'

/**
 * One request, the alert, and on success only the redirect to `/login`
 * (after the alert is added). Never rejects; a rejected navigation is swallowed.
 */
export async function submitResetPassword (deps: {
  reset: () => Promise<ResetPasswordResponse>
  addAlert: (payload: AlertPayload) => void
  navigate: (to: { path: string }) => Promise<unknown>
}): Promise<void> {
  const result: ResetPasswordResult = await deps.reset().then(
    (data): ResetPasswordResult => ({ ok: true, data }),
    (error: unknown): ResetPasswordResult => ({ ok: false, error }),
  )

  const payload = resolveResetPasswordAlert(result)
  if (payload) {
    deps.addAlert(payload)
  }

  if (result.ok) {
    try {
      await deps.navigate({ path: '/login' })
    } catch {
      // A rejected navigation (e.g. aborted by a guard) keeps legacy's behavior: nothing more to do.
    }
  }
}
