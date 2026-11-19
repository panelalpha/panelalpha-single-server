import type { GitLog, GitStatus } from './git-status'
import { api } from '@/shared/api/client'

// Paths start at `/instances/` so the client rewrites them to `/projects` under single server (`client.ts`). Mutations return nothing, because
// the page refetches the status after them; only the calls whose legacy handler reads `data` return it.

/** Body of `POST git/connect`: the reuse of the pair's repository, or a manual URL with an optional PAT. */
export type GitConnectPayload
  = | { git_repository_id: number }
    | { repo_url: string, auth_type: 'pat' | null, token: string | null }
    | { repo_url: string, branch: string }

/** Answer of `connect` for an SSH address: `branch_missing` tells the page to ask for another branch. */
export interface GitConnectResult {
  branchMissing: boolean
}

/** Deploy key of the instance's repository (`GET|POST /instances/{id}/git/deploy-key`). */
export interface GitDeployKey {
  public_key: string
  fingerprint?: string | null
}

/** `GET git/logs` paging; the sort is fixed to the newest first, as legacy. */
export interface GitLogsQuery {
  page: number
  perPage: number
}

export interface GitLogsPage {
  data: GitLog[]
  meta: { total: number, last_page: number }
}

/** `GET /instances/{id}/git`. */
export async function getGitStatus (id: number | string): Promise<GitStatus> {
  const { data } = await api.get<{ data: GitStatus }>(`/instances/${id}/git`)
  return data.data
}

/** `GET /instances/{id}/git/logs?page&per_page&sort_by=date&sort_dir=desc`. */
export async function getGitLogs (id: number | string, { page, perPage }: GitLogsQuery): Promise<GitLogsPage> {
  const { data } = await api.get<{ data: GitLog[], meta?: { total?: number, last_page?: number } }>(`/instances/${id}/git/logs`, {
    params: { page, per_page: perPage, sort_by: 'date', sort_dir: 'desc' },
  })
  return {
    data: data.data || [],
    meta: { total: data.meta?.total || 0, last_page: data.meta?.last_page || 1 },
  }
}

/** `GET /instances/{id}/git/branches`, the list of branch names. */
export async function getGitBranches (id: number | string): Promise<string[]> {
  const { data } = await api.get<{ data: string[] }>(`/instances/${id}/git/branches`)
  return data.data
}

/** `POST /instances/{id}/git/connect`; an SSH connect reads `branch_missing` from `data`. */
export async function connectGit (id: number | string, payload: GitConnectPayload): Promise<GitConnectResult> {
  const { data } = await api.post<{ data?: { branch_missing?: boolean } | null } | null>(`/instances/${id}/git/connect`, payload)
  return { branchMissing: data?.data?.branch_missing === true }
}

/** `GET /instances/{id}/git/deploy-key`; `null` when the repository has no key yet. */
export async function getGitDeployKey (id: number | string): Promise<GitDeployKey | null> {
  const { data } = await api.get<{ data: GitDeployKey | null }>(`/instances/${id}/git/deploy-key`)
  return data.data || null
}

/** `POST /instances/{id}/git/deploy-key {repo_url}`; `repoUrl` is `null` to keep the stored address. */
export async function createGitDeployKey (id: number | string, repoUrl: string | null): Promise<GitDeployKey> {
  const { data } = await api.post<{ data: GitDeployKey }>(`/instances/${id}/git/deploy-key`, { repo_url: repoUrl })
  return data.data
}

/** `DELETE /instances/{id}/git/deploy-key`. */
export async function deleteGitDeployKey (id: number | string): Promise<void> {
  await api.delete(`/instances/${id}/git/deploy-key`)
}

/** `POST /instances/{id}/git/disconnect`. */
export async function disconnectGit (id: number | string): Promise<void> {
  await api.post(`/instances/${id}/git/disconnect`)
}

/** `POST /instances/{id}/git/revert`. */
export async function revertGit (id: number | string): Promise<void> {
  await api.post(`/instances/${id}/git/revert`)
}

/** `POST /instances/{id}/git/drift/ignore`. */
export async function ignoreGitDrift (id: number | string): Promise<void> {
  await api.post(`/instances/${id}/git/drift/ignore`)
}

/** `POST /instances/{id}/git/repair`. */
export async function repairGit (id: number | string): Promise<void> {
  await api.post(`/instances/${id}/git/repair`)
}

/** `POST /instances/{id}/git/pull`, with `{}` unless a strategy is given (`force` or `push_first`). */
export async function pullGit (id: number | string, strategy?: 'force' | 'push_first'): Promise<void> {
  await api.post(`/instances/${id}/git/pull`, strategy ? { strategy } : {})
}

/** `POST /instances/{id}/git/push`. Resolves `true` when the server reports there was nothing to push. */
export async function pushGit (id: number | string): Promise<boolean> {
  const { data } = await api.post<{ nothing_to_push?: boolean } | null>(`/instances/${id}/git/push`)
  return data?.nothing_to_push === true
}

/** `PUT /instances/{id}/git/credentials`; the response `data` is the new status. */
export async function updateGitCredentials (id: number | string, token: string): Promise<GitStatus> {
  const { data } = await api.put<{ data: GitStatus }>(`/instances/${id}/git/credentials`, { token, auth_type: 'pat' })
  return data.data
}

/** `PUT /instances/{id}/auto-deploy`; the response `data` is the new status. */
export async function setAutoDeploy (id: number | string, enabled: boolean): Promise<GitStatus> {
  const { data } = await api.put<{ data: GitStatus }>(`/instances/${id}/auto-deploy`, { auto_deploy_enabled: enabled })
  return data.data
}

/** `PUT /instances/{id}/change-branch {branch}`. */
export async function changeBranch (id: number | string, branch: string): Promise<void> {
  await api.put(`/instances/${id}/change-branch`, { branch })
}
