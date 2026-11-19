import type { HomeLike, InstanceResource, ProjectLimitValues, RawInstance, RawProjectResources } from './instance-resource'
import { api, apiBaseUrl } from '@/shared/api/client'
import { toInstanceResource } from './instance-resource'

// The project calls the Limits modal needs, in the entity layer: Project details and My plans (paid editions) both use
// them. `views/projects/project/instance.api.ts` re-exports them for the project frame.

/** `GET /instances/{id}` mapped to the resource. */
export async function getInstance (id: number | string, home?: HomeLike | null): Promise<InstanceResource> {
  const { data } = await api.get<{ data: RawInstance }>(`/instances/${id}`)
  return toInstanceResource(data.data, home, { apiBase: apiBaseUrl() })
}

/** Body of `PUT /instances/{id}/limits`: all six keys, `-1` is no limit (never null). */
export type ProjectLimitsBody = { [Key in keyof ProjectLimitValues]: number }

/** `PUT /instances/{id}/limits`: the answer is the new `resources` block, in `data.data`. */
export async function updateLimits (id: number | string, body: ProjectLimitsBody): Promise<RawProjectResources> {
  const { data } = await api.put<{ data: RawProjectResources }>(`/instances/${id}/limits`, body)
  return data.data
}
