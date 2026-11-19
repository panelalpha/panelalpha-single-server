import type { SharedAccessEntry } from './instance-resource'
import { api } from '@/shared/api/client'

// The requests of `ShareInstanceModal` (the shared-access calls and `/invitation-suggestions`).
// Every write answers the new shared access list of the instance.

export interface SharedAccessInviteRequest {
  emails: string[]
  role: string
  custom_privileges?: string[]
  apply_to_stagings?: boolean
  wordpress_user_id?: number | null
}

export interface SharedAccessUpdateUser {
  email: string
  role: string
  custom_privileges?: string[]
  apply_to_stagings?: boolean
  wordpress_user_id?: number | null
}

export interface SharedAccessUpdateRequest {
  users: SharedAccessUpdateUser[]
}

export interface SharedAccessDeleteRequest {
  users: Array<{ email: string, apply_to_stagings?: boolean }>
}

export interface SharedAccessResendRequest {
  email: string
  apply_to_stagings?: boolean
}

export interface InvitationSuggestion {
  email: string
  name?: string
}

export interface WordpressUser {
  id: number
  display_name?: string
  user_email?: string
  email?: string
}

export async function inviteSharedAccess (
  id: number,
  payload: SharedAccessInviteRequest,
): Promise<SharedAccessEntry[]> {
  const { data } = await api.post<{ data: SharedAccessEntry[] }>(
    `/instances/${id}/shared-access`,
    payload,
  )
  return data.data ?? []
}

export async function updateSharedAccess (
  id: number,
  payload: SharedAccessUpdateRequest,
): Promise<SharedAccessEntry[]> {
  const { data } = await api.put<{ data: SharedAccessEntry[] }>(
    `/instances/${id}/shared-access`,
    payload,
  )
  return data.data ?? []
}

export async function deleteSharedAccess (
  id: number,
  payload: SharedAccessDeleteRequest,
): Promise<SharedAccessEntry[]> {
  const { data } = await api.delete<{ data: SharedAccessEntry[] }>(
    `/instances/${id}/shared-access`,
    { data: payload },
  )
  return data.data ?? []
}

export async function resendSharedAccessInvite (
  id: number,
  payload: SharedAccessResendRequest,
): Promise<SharedAccessEntry[]> {
  const { data } = await api.post<{ data: SharedAccessEntry[] }>(
    `/instances/${id}/shared-access/resend-invite`,
    payload,
  )
  return data.data ?? []
}

export async function fetchInvitationSuggestions (): Promise<InvitationSuggestion[]> {
  const { data } = await api.get<{ data: InvitationSuggestion[] }>('/invitation-suggestions')
  return data.data ?? []
}

export async function fetchWordpressUsers (id: number): Promise<WordpressUser[]> {
  const { data } = await api.get<{ data: WordpressUser[] }>(
    `/instances/${id}/wordpress/users`,
  )
  return data.data ?? []
}
