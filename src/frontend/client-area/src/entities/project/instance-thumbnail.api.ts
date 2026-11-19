import { api } from '@/shared/api/client'

// "Refresh thumbnail": `POST /instances/{id}/refresh-thumbnail`
// with no body. The caller refreshes the screenshot on success.

/** Asks the backend to take a new screenshot. Errors reject (the caller shows them). */
export async function refreshInstanceThumbnail (id: number): Promise<void> {
  await api.post(`/instances/${id}/refresh-thumbnail`)
}
