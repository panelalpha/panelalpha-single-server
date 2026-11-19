import { api } from '@/shared/api/client'

// `GET /instances/{id}/collaboration-link`, the link is the top-level `url`
// of the body (`result.data.url` on the axios response). Shared by the list and the top bar.

/** Returns the Atarim collaboration link, or `''` when the server sends none (legacy then opens nothing). Errors reject. */
export async function getCollaborationLink (id: number): Promise<string> {
  const { data } = await api.get<{ url?: string | null }>(`/instances/${id}/collaboration-link`)
  return data.url ?? ''
}
