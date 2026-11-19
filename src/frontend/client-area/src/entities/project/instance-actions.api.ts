import { api } from '@/shared/api/client'

// The single-instance calls of the instance row actions: kebab, card overlay and, later, the instance page.
// Every path starts at `/instances/`
// so the client rewrites it to `/projects` under single server. Clear cache and delete stay in
// `@/views/projects/instances.api` (one copy).

export interface WordpressUpdates {
  wp_version?: string
  available_updates?: string[]
}

export interface WordpressUpdateBody {
  version?: string | null
  create_backup?: boolean
}

/** `GET /instances/{id}/wordpress/updates` -> `{ wp_version, available_updates[] }`. */
export async function getWordpressUpdates (id: number): Promise<WordpressUpdates> {
  const { data } = await api.get<{ data: WordpressUpdates }>(`/instances/${id}/wordpress/updates`)
  return data.data ?? {}
}

/** `PUT /instances/{id}/wordpress/update`. The dialog values are the body. */
export async function updateWordpress (id: number, body: WordpressUpdateBody): Promise<void> {
  await api.put(`/instances/${id}/wordpress/update`, body)
}

/** The values of each user configurable option of a service, keyed by option name (`{ text, value }` entries). */
export type ServiceInstanceOptions = Record<string, Array<{ text: string, value: unknown }>>

export interface CopyInstanceBody {
  service_id: number | string | null
  user_configurable_options?: Record<string, unknown>
}

/** `GET /services/{id}/instance-options`. Not an `/instances` path: no rewrite. */
export async function getServiceInstanceOptions (serviceId: number | string): Promise<ServiceInstanceOptions> {
  const { data } = await api.get<{ data: { user_configurable_options?: ServiceInstanceOptions } }>(`/services/${serviceId}/instance-options`)
  return data.data?.user_configurable_options ?? {}
}

/** `POST /instances/{id}/copy`. */
export async function copyInstance (id: number, body: CopyInstanceBody): Promise<void> {
  await api.post(`/instances/${id}/copy`, body)
}

export interface PushDatabaseDiff {
  tables_structure_diff?: string[]
  tables_data_diff?: string[]
}

export interface PushToLiveBody {
  overwrite_files: boolean
  push_db: boolean
  // Absent on an app-lite custom project: its modal has no table selects (`isCustomPush`).
  structural_change_tables?: string[] | null
  datachange_tables?: string[] | null
}

/** `GET /instances/{stagingId}/push-to-live`. */
export async function getPushToLiveDiff (stagingId: number): Promise<PushDatabaseDiff> {
  const { data } = await api.get<{ data: PushDatabaseDiff }>(`/instances/${stagingId}/push-to-live`)
  return data.data ?? {}
}

/** `PUT /instances/{stagingId}/push-to-live`. */
export async function pushToLive (stagingId: number, body: PushToLiveBody): Promise<void> {
  await api.put(`/instances/${stagingId}/push-to-live`, body)
}

/** `GET /instances/{liveId}/push-to-staging`. The id is the live instance's. */
export async function getPushToStagingDiff (liveId: number): Promise<PushDatabaseDiff> {
  const { data } = await api.get<{ data: PushDatabaseDiff }>(`/instances/${liveId}/push-to-staging`)
  return data.data ?? {}
}

/** `PUT /instances/{liveId}/push-to-staging`. The body is the same as push to live's. */
export async function pushToStaging (liveId: number, body: PushToLiveBody): Promise<void> {
  await api.put(`/instances/${liveId}/push-to-staging`, body)
}

export interface WordpressSsoUser {
  [key: string]: unknown
  id: number | string
  display_name?: string
  user_email?: string
  email?: string
}

/** app-lite `AppSsoModal` users. */
export interface AppSsoUser {
  [key: string]: unknown
  id: number | string
  email?: string | null
  username?: string | null
}

export interface SsoUrlResult {
  sso_url: string
}

/** `GET /instances/{id}/wordpress/users?role=administrator&for_sso=1`. */
export async function getWordpressSsoUsers (id: number): Promise<WordpressSsoUser[]> {
  const { data } = await api.get<{ data: WordpressSsoUser[] }>(
    `/instances/${id}/wordpress/users?role=administrator&for_sso=1`,
  )
  return data.data ?? []
}

/** `POST /instances/{id}/sso-url { user }`. */
export async function createSsoUrl (id: number, user: number | string | null): Promise<SsoUrlResult> {
  const { data } = await api.post<{ data: SsoUrlResult }>(`/instances/${id}/sso-url`, { user })
  return data.data
}

/** `POST /instances/{id}/sso-preview-url { user }`. */
export async function createSsoPreviewUrl (id: number, user: number | string | null): Promise<SsoUrlResult> {
  const { data } = await api.post<{ data: SsoUrlResult }>(`/instances/${id}/sso-preview-url`, { user })
  return data.data
}

/** app-lite `GET /instances/:id/users`. */
export async function getAppSsoUsers (id: number): Promise<AppSsoUser[]> {
  const { data } = await api.get<{ data: AppSsoUser[] }>(`/instances/${id}/users`)
  return data.data ?? []
}

/** app-lite `POST /instances/:id/users/:user/sso-url`, no body. */
export async function createAppSsoUrl (id: number, user: number | string | null): Promise<SsoUrlResult> {
  const { data } = await api.post<{ data: SsoUrlResult }>(`/instances/${id}/users/${user}/sso-url`)
  return data.data
}

/** app-lite `POST /instances/:id/users/:user/sso-preview-url { user }`. */
export async function createAppSsoPreviewUrl (id: number, user: number | string | null): Promise<SsoUrlResult> {
  const { data } = await api.post<{ data: SsoUrlResult }>(`/instances/${id}/users/${user}/sso-preview-url`, { user })
  return data.data
}

export interface StagingDiskUsage {
  [key: string]: unknown
  uploads_dir_usage?: number | null
  wordpress_db_usage?: number | null
}

export interface CreateStagingBody {
  /** Optional: the Engine allocates (and registers) one for a copy of a site on panelalpha.online. */
  domain?: string
  skip_uploads_dir?: boolean
}

/** `GET /instances/{id}/staging/pre-check-disk-usage`. */
export async function getStagingDiskUsage (id: number): Promise<StagingDiskUsage> {
  const { data } = await api.get<{ data: StagingDiskUsage }>(`/instances/${id}/staging/pre-check-disk-usage`)
  return data.data ?? {}
}

/** `POST /instances/{id}/staging`. Answers the new staging instance. */
export async function createStaging (id: number, body: CreateStagingBody): Promise<Record<string, unknown>> {
  const { data } = await api.post<{ data: Record<string, unknown> }>(`/instances/${id}/staging`, body)
  return data.data
}

/** `PUT /instances/{id}/import/quick-retry`. Answers the instance. */
export async function quickRetryImport (id: number): Promise<Record<string, unknown>> {
  const { data } = await api.put<{ data: Record<string, unknown> }>(`/instances/${id}/import/quick-retry`)
  return data.data
}

/** `PUT /instances/{id}/retry-install` with the `install_details` as body. */
export async function retryInstall (id: number | string, installDetails: unknown): Promise<Record<string, unknown>> {
  const { data } = await api.put<{ data: Record<string, unknown> }>(`/instances/${id}/retry-install`, installDetails)
  return data.data
}
