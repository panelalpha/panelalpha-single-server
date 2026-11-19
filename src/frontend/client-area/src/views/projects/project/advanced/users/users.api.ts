import { api } from '@/shared/api/client'

// Calls of the instance Users page, same contract as legacy. Only app-lite has this page. Separate from the SSO kit
// (`getAppSsoUsers`), which keeps its own type. Requests go through the shared client; the `instances` / `projects` segment is
// rewritten there.

/** One application user of `GET /instances/{id}/users`. The engine allows `null` in `username`, `email` and `role`. */
export interface InstanceAppUser {
  id: string
  username: string | null
  email: string | null
  role: string | null
}

/** `GET /instances/{id}/users`: the payload is `data.data`, an empty list when it is missing. */
export async function listUsers (instanceId: number | string): Promise<InstanceAppUser[]> {
  const { data: body } = await api.get<{ data?: InstanceAppUser[] }>(`/instances/${encodeURIComponent(String(instanceId))}/users`)
  return body.data ?? []
}

/** `GET /instances/{id}/users-roles`: the role names offered by the Create modal. */
export async function listUserRoles (instanceId: number | string): Promise<string[]> {
  const { data: body } = await api.get<{ data: string[] }>(`/instances/${encodeURIComponent(String(instanceId))}/users-roles`)
  return body.data
}

/** `POST /instances/{id}/users` with the values of the Create modal. */
export async function createUser (
  instanceId: number | string,
  body: { username: string, email: string, password: string, role: string },
): Promise<void> {
  await api.post(`/instances/${encodeURIComponent(String(instanceId))}/users`, body)
}

/** `PUT /instances/{id}/users/{userId}/reset-password`. The body is the whole row with `password`, as legacy sends it. */
export async function resetUserPassword (
  instanceId: number | string,
  userId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await api.put(`/instances/${encodeURIComponent(String(instanceId))}/users/${encodeURIComponent(userId)}/reset-password`, body)
}

/** `DELETE /instances/{id}/users/{userId}`. */
export async function deleteUser (instanceId: number | string, userId: string): Promise<void> {
  await api.delete(`/instances/${encodeURIComponent(String(instanceId))}/users/${encodeURIComponent(userId)}`)
}
