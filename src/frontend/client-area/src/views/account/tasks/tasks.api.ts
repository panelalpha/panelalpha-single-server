import { api } from '@/shared/api/client'

// Calls of the Community panel, same contract as legacy (app-lite only).

export interface FreeTaskProject {
  id: number
  name: string
  domain?: string | null
}

/** A row of `GET /community/tasks`. `status` stays a string: an unknown one is rendered raw. */
export interface FreeTask {
  id: number
  action: string | null
  job_type: string | null
  status: string
  error: string | null
  username: string | null
  project: FreeTaskProject | null
  queued_at: string | null
  started_at: string | null
  finished_at: string | null
}

export interface ListFreeTasksQuery {
  page: number
  perPage: number
  status?: string
  action?: string
  /** Project id (`project` query of `GET /community/tasks`). */
  project?: number
}

interface FreeTasksResponse {
  data?: FreeTask[]
  meta?: { total?: number, last_page?: number }
}

/** `GET /community/tasks`; `status` and `action` are sent only when set. */
export async function listFreeTasks (
  { page, perPage, status, action, project }: ListFreeTasksQuery,
): Promise<{ items: FreeTask[], total: number, lastPage: number }> {
  const params: Record<string, string | number> = { page, per_page: perPage }
  if (status) {
    params.status = status
  }
  if (action) {
    params.action = action
  }
  if (project) {
    params.project = project
  }
  const { data } = await api.get<FreeTasksResponse>('/community/tasks', { params })
  return {
    items: data.data || [],
    total: data.meta?.total || 0,
    lastPage: data.meta?.last_page || 1,
  }
}
