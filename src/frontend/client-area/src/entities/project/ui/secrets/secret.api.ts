import { api } from '@/shared/api/client'

/** `POST /instances/{id}/secrets/reveal` → `data`: the one value asked for, after the password confirmation. */
export interface RevealedSecret {
  secret: string
  value: string | null
}

/**
 * The value of one secret the panel masks in its normal answers (the database password of a WordPress
 * project and its wp-config keys and salts). The backend logs every request; a session that has not
 * confirmed the password recently is answered 423 and {@link confirmPassword} has to run first.
 */
export async function revealProjectSecret (instanceId: number | string, secret: string): Promise<RevealedSecret> {
  const { data } = await api.post<{ data: RevealedSecret }>(`/instances/${encodeURIComponent(String(instanceId))}/secrets/reveal`, { secret })
  return data.data
}

/** `POST /user/confirm-password` (Fortify): marks the session's password confirmed for the panel's window. */
export async function confirmPassword (password: string): Promise<void> {
  await api.post('/user/confirm-password', { password })
}

/** The HTTP status of a failed API call, for the 423 of the password confirmation. */
export function apiErrorStatus (error: unknown): number | undefined {
  const response = (error as { response?: { status?: unknown } } | null | undefined)?.response
  return typeof response?.status === 'number' ? response.status : undefined
}
