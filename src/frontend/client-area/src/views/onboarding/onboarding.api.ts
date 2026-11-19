import { cachedGet } from '@/shared/api/cached-get'
import { api, apiBaseUrl } from '@/shared/api/client'

// The theme chooser's calls of the onboarding. Every path starts at `/instances/`, so the client rewrites it to `/projects` under single server. The screenshot
// is loaded by the browser, not by the client, so it keeps `/instances`.

/** A theme category from `/instances/onboarding/theme-categories`. Dividers are added by the view. */
export interface OnboardingThemeCategory {
  [key: string]: unknown
  id?: number | string
  name?: string
  order?: number
  type?: string
}

/** A template card. `type: 'custom'` cards are screenshotted by the API, the others carry `screenshot_url`. */
export interface OnboardingTheme {
  [key: string]: unknown
  id?: number | string
  name?: string
  slug?: string
  type?: string
  screenshot_url?: string
  preview_url?: string
}

/** One page of themes: `data` and the total the infinite scroll compares against (`meta.total`). */
export interface OnboardingThemePage {
  data: OnboardingTheme[]
  meta?: { total: number }
}

/** The page size of the chooser. */
export const THEMES_PER_PAGE = 12

export interface ThemesQuery {
  page: number
  perPage?: number
  /** The sort key of the default categories (`popular`, `new`,...). */
  browse: string
  /** Sent only when not empty. */
  searchTerm?: string
  /** Sent when a service is selected. */
  serviceId?: number | string | null
}

/** Query of `/instances/onboarding/themes`: `page, per_page, browse, search_term?, service_id?`, in legacy order. */
export function themesQuery (query: ThemesQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    per_page: String(query.perPage ?? THEMES_PER_PAGE),
    browse: query.browse,
  })
  if (query.searchTerm) {
    params.set('search_term', query.searchTerm)
  }
  if (query.serviceId !== undefined && query.serviceId !== null) {
    params.set('service_id', String(query.serviceId))
  }
  return params.toString()
}

/**
 * Query of the category and recommended lists: `page, per_page, sort_by=id, sort_dir=asc`. Legacy never sends `search_term`
 * here (its `this.search` read is never set), so the search does not filter these lists.
 */
export function themeListQuery (page: number, perPage: number = THEMES_PER_PAGE): string {
  return new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    sort_by: 'id',
    sort_dir: 'asc',
  }).toString()
}

/** Cached for the default lifetime, one request per url. */
export async function getThemeCategories (): Promise<OnboardingThemeCategory[]> {
  const { data } = await cachedGet<{ data: OnboardingThemeCategory[] }>('/instances/onboarding/theme-categories')
  return data.data
}

export async function getThemes (query: ThemesQuery): Promise<OnboardingThemePage> {
  const { data } = await api.get<OnboardingThemePage>(`/instances/onboarding/themes?${themesQuery(query)}`)
  return data
}

export async function getThemesFromCategory (categoryId: number | string, page: number, perPage: number = THEMES_PER_PAGE): Promise<OnboardingThemePage> {
  const { data } = await api.get<OnboardingThemePage>(`/instances/onboarding/${categoryId}/themes-from-category?${themeListQuery(page, perPage)}`)
  return data
}

export async function getRecommendedThemes (page: number, perPage: number = THEMES_PER_PAGE): Promise<OnboardingThemePage> {
  const { data } = await api.get<OnboardingThemePage>(`/instances/onboarding/recommended-themes?${themeListQuery(page, perPage)}`)
  return data
}

/** `<img>` source of a custom theme's screenshot: the API base plus the screenshot path, never rewritten to `/projects`. */
export function themeScreenshotUrl (id: number | string): string {
  return `${apiBaseUrl()}/instances/onboarding/theme/${id}/screenshot`
}

// The domain step's calls. The domain paths are service-scoped: `/services/{id}/domains/...`.

/** A domain of a service from `/services/{id}/domains`. `domain` is the name, the rest is read by the domain step. */
export interface ServiceDomain {
  [key: string]: unknown
  id?: number | string
  domain: string
  domain_zone?: string
}

/** `per_page=100`, and `search_term` only when the trimmed term is not empty. */
export function serviceDomainsQuery (searchTerm = ''): string {
  const params = new URLSearchParams({ per_page: '100' })
  const term = searchTerm.trim()
  if (term) {
    params.set('search_term', term)
  }
  return params.toString()
}

/** `GET /services/{id}/domains`: the domains of the service matching the term (empty term: the first page). */
export async function getServiceDomains (serviceId: number | string, searchTerm = ''): Promise<ServiceDomain[]> {
  const { data } = await api.get<{ data?: ServiceDomain[] }>(`/services/${serviceId}/domains?${serviceDomainsQuery(searchTerm)}`)
  return data.data ?? []
}

/** `GET /services/{id}/domains/validate?domain=`: resolves when the domain can be set, rejects with the API error otherwise. */
export async function validateServiceDomain (serviceId: number | string, domain: string): Promise<void> {
  await api.get(`/services/${serviceId}/domains/validate?domain=${encodeURIComponent(domain)}`)
}

/** The body of `POST /services/{id}/domains`. */
export interface CreateServiceDomainBody {
  domain: string | null
  name: string | null
  delegated_user_email: string | null
  user_configurable_options: Record<string, unknown>
}

/** `POST /services/{id}/domains`: the created domain, which the install request then names by its id. */
export async function createServiceDomain (serviceId: number | string, body: CreateServiceDomainBody): Promise<ServiceDomain> {
  const { data } = await api.post<{ data: ServiceDomain }>(`/services/${serviceId}/domains`, body)
  return data.data
}

/**
 * The body of `POST /instances/install`. The standard
 * form's fields are spread after the base ones, so they win on a shared key (legacy spread order).
 */
export interface InstallInstanceBody {
  [key: string]: unknown
  service_id?: number | string
  domain_id?: number | string
  install_method?: string
  name: string | null
  theme?: string
  shared_access: string[]
  site_description?: string
}

/** `POST /instances/install`: the instance the install created (its progress is followed by the Echo events). */
export async function installServiceInstance (body: InstallInstanceBody): Promise<Record<string, unknown>> {
  const { data } = await api.post<{ data: Record<string, unknown> }>('/instances/install', body)
  return data.data
}

// The standard form's loaders. They go through
// `Api.cached` in legacy, so they go through `cachedGet` here (one request per url for the default lifetime).

/** One option of the version select: the first version carries the ` - latest` suffix. */
export interface WordpressVersionOption {
  text: string
  value: string
}

/** The versions as select options; an empty list means the install has no versions. */
export function wordpressVersionOptions (versions: readonly string[]): WordpressVersionOption[] {
  return versions.map((version, index) => ({
    text: index === 0 ? `${version} - latest` : version,
    value: version,
  }))
}

/** `GET /instances/wordpress-versions` as select options. */
export async function getWordpressVersions (): Promise<WordpressVersionOption[]> {
  const { data } = await cachedGet<{ data?: string[] }>('/instances/wordpress-versions')
  return wordpressVersionOptions(data.data ?? [])
}

/** A WordPress template of `/instances/wordpress-templates`. */
export interface WordpressTemplate {
  [key: string]: unknown
  id: number | string
  name: string
}

/** Query of the template list: the first 100, by id ascending. */
export const WORDPRESS_TEMPLATES_QUERY = 'page=1&per_page=100&sort_by=id&sort_dir=asc'

/** `GET /instances/wordpress-templates`. */
export async function getWordpressTemplates (): Promise<WordpressTemplate[]> {
  const { data } = await cachedGet<{ data?: WordpressTemplate[] }>(`/instances/wordpress-templates?${WORDPRESS_TEMPLATES_QUERY}`)
  return data.data ?? []
}

/** An instance the clone tab can copy (`id` and `name` only, as in legacy). */
export interface CloneInstance {
  id: number | string
  name: string
}

/** `GET /instances` for the clone tab: the first 100 by name ascending. */
export async function getCloneInstances (): Promise<CloneInstance[]> {
  const { data } = await cachedGet<{ data?: Array<{ id: number | string, name: string }> }>('/instances?page=1&per_page=100&sort_by=name&sort_dir=asc')
  return (data.data ?? []).map(instance => ({ id: instance.id, name: instance.name }))
}

// The super-quick polling. Both
// answers are read as flags: a failed request is handled by the caller as "not yet".

/** `GET /instances/onboarding/ssl-certificate?domain=`: the SSL certificate of the installed domain is detected. */
export async function getSslCertificateDetected (domain: string): Promise<boolean> {
  const { data } = await api.get<{ data: { is_ssl_certificate_detected?: boolean } }>(`/instances/onboarding/ssl-certificate?domain=${encodeURIComponent(domain)}`)
  return Boolean(data.data.is_ssl_certificate_detected)
}

/** `GET /services/{id}/domains/resolve?domain=`: the domain resolves to the service's server. */
export async function getDomainResolved (serviceId: number | string, domain: string): Promise<boolean> {
  const { data } = await api.get<{ data: { is_resolved?: boolean } }>(`/services/${serviceId}/domains/resolve?domain=${encodeURIComponent(domain)}`)
  return Boolean(data.data.is_resolved)
}

// The import path's calls. The request
// fields keep their legacy names. `ip_address` is sent only where legacy sends it (the URL test and the plugin test).

/** `GET /instances/import/test-wordpress-url`: whether a WordPress site answers at the url. */
export interface WordpressUrlTest {
  wordpress_detected?: boolean
  error_message?: string | null
}

/** `GET /instances/import/test-wordpress-url?url=[&ip_address=]`. The ip is added only when there is one. */
export async function getWordpressUrlTest (url: string, ipAddress?: string): Promise<WordpressUrlTest> {
  const params = new URLSearchParams({ url })
  if (ipAddress) {
    params.set('ip_address', ipAddress)
  }
  const { data } = await api.get<WordpressUrlTest>(`/instances/import/test-wordpress-url?${params.toString()}`)
  return data
}

/**
 * The answer of `POST /instances/import/test-wordpress-connection`, read as the whole body. The plugin
 * form reads `error_type`, the FTP forms read `severity`; both come with `message` and `success`, and `import_details` on success.
 */
export interface WordpressConnectionResult {
  [key: string]: unknown
  error_type?: string
  severity?: string
  message?: string
  success?: boolean
  import_details?: Record<string, unknown>
}

/** The connection test body: the plugin or the FTP shape, picked by `type`, with the legacy field names. */
export interface WordpressConnectionBody {
  [key: string]: unknown
  type: 'plugin' | 'ftp'
  service_id: number | string
  url: string
}

/** `POST /instances/import/test-wordpress-connection`: the plugin and the FTP forms share the endpoint and the two answer contracts. */
export async function testWordpressConnection (body: WordpressConnectionBody): Promise<WordpressConnectionResult> {
  const { data } = await api.post<WordpressConnectionResult>('/instances/import/test-wordpress-connection', body)
  return data
}

/** The import domain of `POST /instances/import/domain`. */
export interface ImportDomain {
  [key: string]: unknown
  id: number | string
}

/** `POST /instances/import/domain`: the domain the import runs on. `ip_address` is not sent here. */
export async function createImportDomain (serviceId: number | string, url: string, delegatedUserEmail: string | null, userOptions: Record<string, unknown>): Promise<ImportDomain> {
  const { data } = await api.post<{ data: ImportDomain }>('/instances/import/domain', {
    service_id: serviceId,
    url,
    delegated_user_email: delegatedUserEmail,
    user_configurable_options: userOptions,
  })
  return data.data
}

/** The answer of `POST /instances/import/import`: the instance in `data` and the nameservers in `meta`. */
export interface ImportInstanceResponse {
  data: Record<string, unknown>
  meta: { nameservers: string[] }
}

/**
 * `POST /instances/import/import`. The payload is the import data with `service_id`, `domain_id`, `type` (the chosen method) and
 * `shared_access` (the emails), built by the caller.
 */
export async function importInstance (payload: Record<string, unknown>): Promise<ImportInstanceResponse> {
  const { data } = await api.post<ImportInstanceResponse>('/instances/import/import', payload)
  return data
}

// The deploy calls. Deploy exists only in app-lite, so the calls are the LITE ones; the client rewrites `/instances` to
// `/projects` under single server.

/** `POST /instances/test-git-url` answer: `success` decides, `error_message` is shown when it fails. */
export interface GitUrlTestResult {
  success: boolean
  error_message?: string | null
}

/** `POST /instances/git-branches` answer: the branches and the default one. */
export interface GitBranchesResult {
  success: boolean
  branches: string[]
  default_branch: string | null
}

/** One variable of the example env file (`preview-env-example`). */
export interface EnvVariable {
  key: string
  value: string
}

/** `POST /instances/preview-env-example` answer: whether the repo or the uploaded files carry an example env file, and its variables. */
export interface EnvExamplePreview {
  has_example: boolean
  variables: EnvVariable[]
}

/** The git form of the preview body (the repo's example env file on a branch). */
export interface GitEnvPreviewBody {
  repo_url: string
  token: string | null
  branch: string | null
}

/** The files form of the preview body: the first uploaded file, on the service's domain. */
export interface FilesEnvPreviewBody {
  remote_filepath: string
  service_id: number | string
  domain_id: number | string
}

/** `POST /services/{id}/domains` for a files deploy: the domain is named after the source. */
export interface FilesDomainBody {
  source_type: 'files'
  name: string
}

/** The body of `POST /instances/deploy`. The git and the files fields are the two shapes. */
export interface DeployInstanceBody {
  service_id: number | string
  domain_id: number | string
  shared_access: string[]
  source_type: 'git' | 'files'
  repo_url?: string | null
  token?: string | null
  branch?: string | null
  env_vars?: Record<string, string>
  remote_filepath?: string[]
}

/** The query of `POST /instances/upload-files`: the service, the domain and the name the file is stored under. */
export interface UploadDeployFileQuery {
  service_id: number | string
  domain_id: number | string
  filename: string
}

/** Checks the repo and the token. */
export async function testGitUrl (body: { repo_url: string, token: string | null }): Promise<GitUrlTestResult> {
  const { data } = await api.post<GitUrlTestResult>('/instances/test-git-url', body)
  return data
}

/** The branches of the repo and its default branch. */
export async function getGitBranches (body: { repo_url: string, token: string | null }): Promise<GitBranchesResult> {
  const { data } = await api.post<GitBranchesResult>('/instances/git-branches', body)
  return data
}

/** The example env variables of a repo branch or of the uploaded files. */
export async function previewEnvExample (body: GitEnvPreviewBody | FilesEnvPreviewBody): Promise<EnvExamplePreview> {
  const { data } = await api.post<EnvExamplePreview>('/instances/preview-env-example', body)
  return data
}

/**
 * The 50 newest domains of the service. Not the same request as
 * `getServiceDomains` (100 domains, no sort, the search term), which stays as it is.
 */
export async function listServiceDomains (serviceId: number | string): Promise<ServiceDomain[]> {
  const { data } = await api.get<{ data?: ServiceDomain[] }>(`/services/${serviceId}/domains?per_page=50&sort_by=id&sort_dir=desc`)
  return Array.isArray(data.data) ? data.data : []
}

/** The domain a files deploy installs on, named after the source. */
export async function createFilesDomain (serviceId: number | string, name: string): Promise<ServiceDomain> {
  const body: FilesDomainBody = { source_type: 'files', name }
  const { data } = await api.post<{ data: ServiceDomain }>(`/services/${serviceId}/domains`, body)
  return data.data
}

/**
 * The file goes up as the raw body with its content type, the ids and the
 * name in the query. Resolves the path the server stored the file under (`remote_filepath`).
 */
export async function uploadDeployFile (file: File, contentType: string, query: UploadDeployFileQuery, signal?: AbortSignal): Promise<string> {
  const params = new URLSearchParams({
    service_id: String(query.service_id),
    domain_id: String(query.domain_id),
    filename: query.filename,
  })
  const { data } = await api.post<{ remote_filepath: string }>(`/instances/upload-files?${params.toString()}`, file, {
    headers: { 'Content-Type': contentType },
    signal,
  })
  return data.remote_filepath
}

/** The deployed instance. */
export async function deployInstance (body: DeployInstanceBody): Promise<Record<string, unknown>> {
  const { data } = await api.post<{ data: Record<string, unknown> }>('/instances/deploy', body)
  return data.data
}

/** Body of `POST /instances/deploy-key`: the service, the domain, the shared users and the SSH address. */
export interface CreateDeployKeyBody {
  service_id: number | string
  domain_id: number | string | null
  shared_access: string[]
  repo_url: string
}

/** `POST /instances/deploy-key` answer: the project its create task runs for, and the public key the user adds to the repo. */
export interface DeployKeyResult {
  project: Record<string, unknown>
  deploy_key: { public_key: string }
}

/** Body of `POST /instances/{id}/git/deploy` for an SSH project. */
export interface DeployGitSshBody {
  branch: string | null
  env_vars: Record<string, string>
}

/** Creates the project and returns the deploy key. */
export async function createDeployKey (body: CreateDeployKeyBody): Promise<DeployKeyResult> {
  const { data } = await api.post<{ data: DeployKeyResult }>('/instances/deploy-key', body)
  return data.data
}

/** `POST /instances/{id}/git/connect`: `branch_missing` when the branch is not on the remote. */
export async function connectGitSsh (projectId: number | string, body: { repo_url: string, branch: string }): Promise<{ branch_missing: boolean }> {
  const { data } = await api.post<{ data?: { branch_missing?: boolean } }>(`/instances/${projectId}/git/connect`, body)
  return { branch_missing: data.data?.branch_missing === true }
}

/** The branch names of the connected remote. */
export async function getGitBranchesSsh (projectId: number | string): Promise<string[]> {
  const { data } = await api.get<{ data?: string[] }>(`/instances/${projectId}/git/branches`)
  return Array.isArray(data.data) ? data.data : []
}

/** The example env variables of the connected repo. */
export async function getEnvExampleSsh (projectId: number | string): Promise<EnvExamplePreview> {
  const { data } = await api.get<{ data?: EnvExamplePreview }>(`/instances/${projectId}/git/env-example`)
  return data.data ?? { has_example: false, variables: [] }
}

/** `POST /instances/{id}/git/deploy`: the deployed instance. */
export async function deployGitSsh (projectId: number | string, body: DeployGitSshBody): Promise<Record<string, unknown>> {
  const { data } = await api.post<{ data: Record<string, unknown> }>(`/instances/${projectId}/git/deploy`, body)
  return data.data
}

/** The key step's abandoned project; `defer_while_busy` lets the panel finish it while the Engine is busy. */
export async function deleteDeployKeyProject (projectId: number | string): Promise<void> {
  await api.delete(`/instances/${projectId}`, { data: { remove_data: true, remove_database: true, confirm: true, defer_while_busy: true } })
}
