import type { AppHealth } from '@/entities/project/ui/status-issues/collect-instance-issues'
import { api } from '@/shared/api/client'

// The Engine's probe of a container project's running application,
// `{available, healthy, serving, ports, checks}`; `response.data.data`, no cache. Errors reject (the status alert swallows them).

export async function fetchAppHealth (id: number | string): Promise<AppHealth> {
  const { data } = await api.get<{ data: AppHealth }>(`/instances/${id}/app-health`)
  return data.data
}
