import { cachedGet, clearCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'

export type LabelResource = {
  id?: number
  title: string
  color?: string
  in_use?: boolean
}

export type NewLabelInput = Pick<LabelResource, 'title' | 'color'>

/** `GET /labels`, cached with the default TTL (`shared/api/cached-get.ts`). */
export async function getLabels (): Promise<LabelResource[]> {
  const { data } = await cachedGet<{ data: LabelResource[] }>('/labels')
  return data.data ?? []
}

/** The next `getLabels` asks the server again (after a label is created or deleted). */
export function clearLabelsCache (): void {
  clearCachedGet('/labels')
}

/** `POST /labels` with the new label as the body. Errors reject. */
export async function createLabel (label: NewLabelInput): Promise<LabelResource> {
  const { data } = await api.post<LabelResource>('/labels', label)
  return data
}

/** `POST /instances/{id}/labels`, the label is the body. */
export async function assignLabel (instanceId: number, label: LabelResource): Promise<LabelResource> {
  const { data } = await api.post<LabelResource>(`/instances/${instanceId}/labels`, label)
  return data
}

/**
 * `DELETE /instances/{id}/labels` with `{ data: label }`.
 * The body carries `in_use`, which the caller writes back to the account list.
 */
export async function unassignLabel (instanceId: number, label: LabelResource): Promise<LabelResource> {
  const { data } = await api.delete<LabelResource>(`/instances/${instanceId}/labels`, { data: label })
  return data
}

/** `DELETE /labels` with `{ data: label }`. */
export async function deleteLabel (label: LabelResource): Promise<void> {
  await api.delete('/labels', { data: label })
}
