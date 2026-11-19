import type { AcceptInvitationResponse } from '@/shared/session/session.api'
import type { LocationQueryRaw } from 'vue-router'
import { getErrorMessage } from '@/shared/api/error-message'

export type AcceptInviteFlowResult = 'password' | 'error' | 'navigated'

type Navigate = (to: { path: string, query?: LocationQueryRaw }) => Promise<unknown>

async function go (navigate: Navigate, to: Parameters<Navigate>[0]): Promise<void> {
  try {
    await navigate(to)
  } catch {
    // A rejected navigation (e.g. aborted by a guard) keeps legacy's behavior: nothing more to do.
  }
}

/**
 * One POST, then the password card, the redirect to /login (with the
 * token as a query object) or to `/`. A rejection shows the "Invalid Invitation" card.
 */
export async function runAcceptInviteFlow (deps: {
  accept: () => Promise<AcceptInvitationResponse>
  navigate: Navigate
  token: LocationQueryRaw[string]
}): Promise<AcceptInviteFlowResult> {
  let response: AcceptInvitationResponse
  try {
    response = await deps.accept()
  } catch {
    return 'error'
  }

  if (response.password_required) {
    return 'password'
  }
  await go(
    deps.navigate,
    response.login_required ? { path: '/login', query: { invite_token: deps.token } } : { path: '/' },
  )
  return 'navigated'
}

/** Outcome of the invite registration: `/login` on success, the server message otherwise. */
export async function submitInvitePassword (deps: {
  submit: () => Promise<unknown>
  navigate: Navigate
}): Promise<{ error: string | null }> {
  try {
    await deps.submit()
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
  await go(deps.navigate, { path: '/login' })
  return { error: null }
}
