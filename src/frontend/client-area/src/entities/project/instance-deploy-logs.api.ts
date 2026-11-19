import { api } from '@/shared/api/client'

// app-lite only: custom projects (deploy logs and cancel); the issue-resolve upload is `entities/project/instance-files.api.ts`. Under single server the client rewrites
// `/instances` to `/projects`, so the paths below keep the `/instances` form.

export interface DeployLogStage {
  name: string
  started_at?: number | null
  finished_at?: number | null
}

export interface DeployLogEntry {
  id: number | string
  status?: string
  started_at?: string | null
  finished_at?: string | null
  source_type?: string | null
  created_at?: string | null
}

/** `GET /instances/:id/deploy-logs/:logId`. */
export interface DeployLogDetail {
  status: string
  stages?: DeployLogStage[] | null
  lines?: Array<Record<string, unknown>> | null
  error?: string | null
  /** What a deploy the Engine finished with warnings reported, one warning per line. */
  warning?: string | null
}

/** `GET /instances/:id/deploy-logs/live?offset=N` (read by `DeployLogsViewer.pollLive`). */
export interface DeployLogsLive {
  /** `status` is read by the onboarding git modal: `running` while the project's create task runs. */
  panel?: { id: number | string, status?: string } | null
  engine?: {
    status: string
    stage?: string | null
    stages?: DeployLogStage[] | null
    lines?: Array<Record<string, unknown>> | null
    next_offset?: number
    error?: string | null
    warning?: string | null
  } | null
}

export async function listDeployLogs (id: number | string): Promise<DeployLogEntry[]> {
  const { data } = await api.get<{ data: DeployLogEntry[] }>(`/instances/${id}/deploy-logs`)
  return data.data
}

export async function getDeployLog (id: number | string, logId: number | string): Promise<DeployLogDetail> {
  const { data } = await api.get<{ data: DeployLogDetail }>(`/instances/${id}/deploy-logs/${logId}`)
  return data.data
}

export async function getDeployLogsLive (id: number | string, offset = 0): Promise<DeployLogsLive> {
  const { data } = await api.get<{ data: DeployLogsLive }>(`/instances/${id}/deploy-logs/live?offset=${offset}`)
  return data.data
}

export async function cancelDeploy (id: number | string): Promise<void> {
  await api.post(`/instances/${id}/deploy-cancel`)
}

/** The log text of the response is saved as a `.txt` file. */
export async function downloadDeployLog (id: number | string, logId: number | string): Promise<void> {
  const { data } = await api.get<{ data: string, filename?: string }>(`/instances/${id}/deploy-logs/${logId}/download`)
  const blob = new Blob([data.data], { type: 'text/plain' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = data.filename || `deploy-log-${logId}.txt`
  link.click()
  URL.revokeObjectURL(link.href)
}
