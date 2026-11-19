import { acceptInvitation } from '@/shared/session/session.api'

/**
 * Read a string invite_token from a route query value (ignore arrays / absent).
 */
export function inviteTokenFromQuery (value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return null
}

/**
 * POST /accept-invitation when a string invite_token is present.
 * Swallows failures so navigation can continue (legacy parity).
 * Returns true when an accept was attempted (token present), false when no-op.
 */
export async function acceptInviteIfPresent (
  inviteToken: unknown,
  accept: (token: string) => Promise<unknown> = acceptInvitation,
): Promise<boolean> {
  const token = inviteTokenFromQuery(inviteToken)
  if (!token) {
    return false
  }
  try {
    await accept(token)
  } catch {
    // Legacy resolves true on catch: do not block navigation.
  }
  return true
}
