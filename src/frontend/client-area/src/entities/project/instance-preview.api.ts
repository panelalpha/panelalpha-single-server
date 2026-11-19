import type { RawInstance } from '@/entities/project/instance-resource'
import { api } from '@/shared/api/client'

// `POST /instances/{id}/preview` without a body, then
// `response.data.data` is the instance with its new `preview_site { url, valid_until }`; legacy emits that whole instance
// (`preview-site-generated`), which the top bar turns into an instance resource. Shared by the list and the top bar.

export interface PreviewSite {
  url: string
  valid_until: string
}

/** The instance `POST /instances/{id}/preview` answers with. */
export interface PreviewSiteInstance extends RawInstance {
  preview_site: PreviewSite
}

/** Creates a temporary preview URL and returns the instance that carries it. Errors reject (the caller shows them). */
export async function createPreviewSite (id: number): Promise<PreviewSiteInstance> {
  const { data } = await api.post<{ data: PreviewSiteInstance }>(`/instances/${id}/preview`)
  return data.data
}
