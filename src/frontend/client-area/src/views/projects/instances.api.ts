import {
  buildScreenshotUrl,
  type HomeLike,
  type InstanceResource,
  type RawInstance,
  toInstanceResource,
} from '@/entities/project/instance-resource'
import { api, apiBaseUrl } from '@/shared/api/client'

/** Legacy list page size (the API default is 10). */
export const DEFAULT_INSTANCES_PER_PAGE = 8

export interface InstancesListMeta {
  current_page?: number
  from?: number | null
  last_page?: number
  path?: string
  per_page?: number
  to?: number | null
  total?: number
  sort_by?: string
  sort_dir?: string
}

export interface InstancesListResult {
  data: InstanceResource[]
  meta: InstancesListMeta
}

export interface ListInstancesParams {
  page?: number
  perPage?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  searchTerm?: string
  labels?: string[]
  /** `/home`, for the app-lite single-server screenshot path. */
  home?: HomeLike | null
}

export interface DeleteInstanceBody {
  remove_data?: boolean
  remove_database?: boolean
  confirm?: boolean
}

/**
 * The list query: `page`, `per_page`, `sort_by`, `sort_dir`, then
 * `search_term` and `labels` (comma-joined) only when set. No `server_account_id`: the list screen never passes one.
 */
export function buildListQuery (input: Omit<ListInstancesParams, 'home'>): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: input.page ?? 1,
    per_page: input.perPage ?? DEFAULT_INSTANCES_PER_PAGE,
    sort_by: input.sortBy ?? 'created_at',
    sort_dir: input.sortDir ?? 'desc',
  }
  if (input.searchTerm) {
    query.search_term = input.searchTerm
  }
  if (input.labels && input.labels.length > 0) {
    query.labels = input.labels.join(',')
  }
  return query
}

export async function listInstances (
  params: ListInstancesParams = {},
): Promise<InstancesListResult> {
  const { data } = await api.get<{ data: RawInstance[], meta: InstancesListMeta }>(
    '/instances',
    { params: buildListQuery(params) },
  )

  const base = apiBaseUrl()
  return {
    data: (data.data ?? []).map(item => toInstanceResource(item, params.home, { apiBase: base })),
    meta: data.meta ?? {},
  }
}

/** `GET /instances/{id}/screenshot.jpg?time=` (the path reads `projects` under app-lite single server). */
export function screenshotUrl (id: number, time: number, singleServer = false): string {
  return buildScreenshotUrl(apiBaseUrl(), id, time, singleServer)
}

export async function clearInstanceCache (id: number): Promise<void> {
  await api.put(`/instances/${id}/clear-cache`)
}

export async function deleteInstance (
  id: number,
  body: DeleteInstanceBody,
): Promise<void> {
  await api.delete(`/instances/${id}`, { data: body })
}
