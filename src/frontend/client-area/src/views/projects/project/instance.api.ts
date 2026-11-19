import type { InstallationDetails } from './advanced/details/installation-details'
import type { CdnDnsRecord, RawInstance } from '@/entities/project/instance-resource'
import type { DeployStepKey } from '@/entities/project/project-source.api'
import { cachedGet, clearCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'

// The project fetch and the limits save live in the entity layer (My plans uses them too); the frame keeps importing them from here.
export { getInstance, type ProjectLimitsBody, updateLimits } from '@/entities/project/project-limits.api'

/** `PUT /instances/{id}/wordpress/site-name {name}`. */
export async function updateSiteName (id: number | string, name: string): Promise<void> {
  await api.put(`/instances/${id}/wordpress/site-name`, { name })
}

/** `GET /instances/{id}/installation-details`, the payload is `data.data`. */
export async function getInstallationDetails (id: number | string): Promise<InstallationDetails> {
  const { data } = await api.get<{ data: InstallationDetails }>(`/instances/${id}/installation-details`)
  return data.data
}

/** Body of `GET /instances/{id}/git/commits`; missing keys fall back as in lite. */
export interface GitCommitsPage {
  commits: unknown[]
  from: number | null | undefined
  to: number | null | undefined
  total: number
  /** False when the site's checkout has not fetched the branch yet (`branch_fetched`); a redeploy fetches it. */
  branchFetched?: boolean
}

/** Body of `GET /instances/{id}/git` as the source cards and `GitRedeployModal` read it. */
export interface GitSourceStatus {
  commits_behind?: number | null
  drift_status?: string | null
}

/** `GET /instances/{id}/git`, the payload is `data.data || {}`. */
export async function getGitSourceStatus (id: number | string): Promise<GitSourceStatus> {
  const { data } = await api.get<{ data?: GitSourceStatus | null }>(`/instances/${id}/git`)
  return data.data || {}
}

/** `GET /instances/{id}/git/commits?branch=`. */
export async function getGitCommits (id: number | string, branch: string): Promise<GitCommitsPage> {
  const { data } = await api.get<{ data?: { commits?: unknown[], from?: number | null, to?: number | null, total?: number, branch_fetched?: boolean } | null }>(
    `/instances/${id}/git/commits`,
    { params: { branch } },
  )
  const page = data.data || {}
  return { commits: page.commits || [], from: page.from, to: page.to, total: page.total || 0, branchFetched: page.branch_fetched !== false }
}

/** Body of `POST /instances/{id}/redeploy`. */
export interface RedeployPayload {
  branch: string
  strategy?: 'force' | 'push_first'
  deploy_staging: boolean
  /** Unchecked skippable deploy categories (`skipPayload`); the key is absent when none is skipped. */
  skip?: DeployStepKey[]
}

/** Response of `POST /instances/{id}/redeploy`: the deployed instance and its log (lite reads `redeploy.data.*`, the body itself). */
export interface RedeployResult {
  target_id: number
  deploy_log_id: number
}

/** `POST /instances/{id}/redeploy`. */
export async function redeployInstance (id: number | string, payload: RedeployPayload): Promise<RedeployResult> {
  const { data } = await api.post<RedeployResult>(`/instances/${id}/redeploy`, payload)
  return { target_id: data.target_id, deploy_log_id: data.deploy_log_id }
}

/** `POST /instances/{id}/deploy/upload`, the archive as an octet stream, answers `remote_filepath`. */
export async function uploadVersionArchive (
  id: number | string,
  file: File,
  options: { deployStaging: boolean, onProgress?: (event: { loaded: number, total?: number }) => void },
): Promise<string> {
  const { data } = await api.post<{ remote_filepath: string }>(`/instances/${id}/deploy/upload`, file, {
    headers: { 'Content-Type': 'application/octet-stream' },
    params: { filename: file.name, deploy_staging: options.deployStaging ? 1 : 0 },
    onUploadProgress: options.onProgress,
  })
  return data.remote_filepath
}

/** Body of `POST /instances/{id}/redeploy` of an uploaded archive. */
export interface RedeployArchivePayload {
  remote_filepath: string
  deploy_staging: boolean
  /** Unchecked skippable deploy categories (`skipPayload`); the key is absent when none is skipped. */
  skip?: DeployStepKey[]
}

/** `POST /instances/{id}/redeploy`, the body names the deployed instance and its log. */
export async function redeployUploadedArchive (id: number | string, payload: RedeployArchivePayload): Promise<RedeployResult> {
  const { data } = await api.post<RedeployResult>(`/instances/${id}/redeploy`, payload)
  return { target_id: data.target_id, deploy_log_id: data.deploy_log_id }
}

/** How long the change-domain options are cached, in seconds. */
const CHANGE_DOMAIN_OPTIONS_TTL = 300

/** Body of `GET /instances/{id}/change-domain/options`. */
export interface ChangeDomainOptions {
  subdomains: string[]
  ip_address: string | null
  ipv4_addresses: string[]
  cdn_dns_records: CdnDnsRecord[]
  nameservers: string[]
}

function changeDomainOptionsUrl (id: number | string): string {
  return `/instances/${id}/change-domain/options`
}

/** `GET change-domain/options`, cached 300 s, the payload is `data.data`. */
export async function getChangeDomainOptions (id: number | string): Promise<ChangeDomainOptions> {
  const { data } = await cachedGet<{ data: ChangeDomainOptions }>(changeDomainOptionsUrl(id), CHANGE_DOMAIN_OPTIONS_TTL)
  return data.data
}

/** Drops the cached options of one instance. */
export function clearChangeDomainOptions (id: number | string): void {
  clearCachedGet(changeDomainOptionsUrl(id))
}

/** `PUT change-domain/domain`; returns the raw instance (`data.data`) for `instanceResource`. */
export async function putChangeDomain (id: number | string, domain: string): Promise<RawInstance> {
  const { data } = await api.put<{ data: RawInstance }>(`/instances/${id}/change-domain/domain`, { domain })
  return data.data
}

/** `PUT change-domain/subdomain`; returns the raw instance (`data.data`). */
export async function putChangeSubdomain (
  id: number | string,
  payload: { subdomain: string, domain: string },
): Promise<RawInstance> {
  const { data } = await api.put<{ data: RawInstance }>(`/instances/${id}/change-domain/subdomain`, payload)
  return data.data
}
