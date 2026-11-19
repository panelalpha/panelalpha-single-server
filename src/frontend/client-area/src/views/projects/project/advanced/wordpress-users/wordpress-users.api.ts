import { api } from '@/shared/api/client'

// Calls of the instance WordPress users page, same contract as legacy. The page is identical in app and app-lite. Requests go
// through the shared client; the `instances` / `projects` segment is rewritten there.

/** One WordPress user of `GET /instances/{id}/wordpress/users`. */
export interface WordpressUser {
  id: number | string
  username: string
  display_name: string
  email: string
  role: string
  user_registered: string | null
}

/** `GET /instances/{id}/wordpress/users`: the payload is `data.data`, an empty list when it is missing. */
export async function listWordpressUsers (instanceId: number | string): Promise<WordpressUser[]> {
  const { data: body } = await api.get<{ data?: WordpressUser[] }>(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/users`)
  return body.data ?? []
}

/** `POST /instances/{id}/wordpress/users` with the values of the Create modal. */
export async function createWordpressUser (
  instanceId: number | string,
  body: { username: string, email: string, display_name: string, password: string, role: string, send_email: boolean },
): Promise<void> {
  await api.post(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/users`, body)
}

/** `PUT /instances/{id}/wordpress/users/{userId}` with the edited values. */
export async function updateWordpressUser (
  instanceId: number | string,
  userId: number | string,
  body: Record<string, unknown>,
): Promise<void> {
  await api.put(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/users/${encodeURIComponent(String(userId))}`, body)
}

/**
 * `PUT /instances/{id}/wordpress/users/{user.id}/reset-password` with the whole user row, as legacy sends it. Returns the generated
 * `new_password` from the response, or `undefined` when the response has none.
 */
export async function resetWordpressUserPassword (
  instanceId: number | string,
  user: Record<string, unknown>,
): Promise<string | undefined> {
  const { data: body } = await api.put<{ new_password?: string }>(
    `/instances/${encodeURIComponent(String(instanceId))}/wordpress/users/${encodeURIComponent(String(user.id))}/reset-password`,
    user,
  )
  return body.new_password
}

/** `DELETE /instances/{id}/wordpress/users/{email}`. The email is encoded in the path. */
export async function deleteWordpressUser (instanceId: number | string, email: string): Promise<void> {
  await api.delete(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/users/${encodeURIComponent(email)}`)
}
