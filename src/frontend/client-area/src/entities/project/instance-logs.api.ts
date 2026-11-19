import { api, apiBaseUrl } from '@/shared/api/client'
import { isApiError } from '@/shared/api/error-message'

// The downloads are opened with `window.open(_blank)`.
// The client rewrites `instances` to `projects` under single server, the download URLs do not go through it (app-lite does not either).

export interface InstanceLogUser {
  email: string
  first_name?: string | null
  last_name?: string | null
  role?: string | null
}

export interface InstanceLogRow {
  user: InstanceLogUser
  action: string
  request_method: string
  payload: Record<string, unknown> | unknown[] | null
  date: string | number
}

export interface InstanceLogsQuery {
  page: number
  perPage: number
  sortBy: string
  sortDir: 'asc' | 'desc'
  searchTerm?: string
}

export interface WebserverLogFile {
  name: string
  size: number | null
  plain_text: boolean
}

/**
 * `GET /instances/:id/logs`. Legacy appended the search term raw, so `#`, `&`, `+` or `%` broke the query; it is
 * URL-encoded here, which leaves an ordinary term unchanged on the wire.
 */
export async function getInstanceLogs (
  id: number | string,
  { page, perPage, sortBy, sortDir, searchTerm }: InstanceLogsQuery,
): Promise<{ items: InstanceLogRow[], total: number }> {
  let url = `/instances/${id}/logs?page=${page}&per_page=${perPage}&sort_by=${sortBy}&sort_dir=${sortDir}`
  if (searchTerm) {
    url += `&search_term=${encodeURIComponent(searchTerm)}`
  }
  const { data } = await api.get<{ data: InstanceLogRow[], meta?: { total?: number } }>(url)
  return { items: data.data, total: data.meta?.total ?? 0 }
}

/** `GET /instances/:id/webserver-logs`. */
export async function getWebserverLogs (id: number | string): Promise<WebserverLogFile[]> {
  const { data } = await api.get<{ data: WebserverLogFile[] }>(`/instances/${id}/webserver-logs`)
  return data.data
}

/** `GET /instances/:id/webserver-logs/:filename`. The file name is an encoded path segment. */
export async function getWebserverLog (id: number | string, filename: string): Promise<string> {
  const { data } = await api.get<{ data: string }>(`/instances/${id}/webserver-logs/${encodeURIComponent(filename)}`)
  return data.data
}

/** `GET /instances/:id/wordpress/logs`. */
export async function getWordPressLogs (id: number | string): Promise<string | null> {
  const { data } = await api.get<{ data: string | null }>(`/instances/${id}/wordpress/logs`)
  return data.data
}

/** `GET /instances/:id/php-logs`. */
export async function getPhpLogs (id: number | string): Promise<string | null> {
  const { data } = await api.get<{ data: string | null }>(`/instances/${id}/php-logs`)
  return data.data
}

/**
 * One page of a webserver or PHP log (`?page=N[&size=S]`, change `logs-paged-table`). `lines` are in file order (oldest first inside
 * the window); `size` is the file size the API paged by, sent back as `size` for the next pages so the numbering does not shift while
 * the file grows (`null` when the API cannot page the file, e.g. the PHP tail on dind).
 */
export interface LogPage {
  lines: string[]
  page: number
  pages: number
  size: number | null
}

export interface LogPageQuery {
  page: number
  size?: number | null
}

interface LogPagePayload {
  lines?: string[] | null
  page?: number | null
  pages?: number | null
  size?: number | null
}

function pageQuery ({ page, size }: LogPageQuery): string {
  let query = `?page=${page}`
  if (size != null) {
    query += `&size=${size}`
  }
  return query
}

/** Text without the trailing newline, split into lines; an empty text has no lines. */
function textLines (text: string): string[] {
  const trimmed = text.replace(/\r?\n$/, '')
  return trimmed === '' ? [] : trimmed.split(/\r?\n/)
}

/**
 * An API without paging (an integration other than engine) still answers `{data: string | null}`; that text is one page with all its
 * lines, so the views have a single shape to render.
 */
function toLogPage (data: LogPagePayload | string | null | undefined): LogPage {
  if (data == null || typeof data === 'string') {
    return { lines: textLines(data ?? ''), page: 1, pages: 1, size: null }
  }
  return {
    lines: data.lines ?? [],
    page: data.page ?? 1,
    pages: Math.max(1, data.pages ?? 1),
    size: data.size ?? null,
  }
}

/**
 * `GET /instances/:id/webserver-logs/:filename?page=&size=`. 409 means the file shrank since `size` was taken (rotation); it is thrown
 * as the HTTP error, recognised with `isLogPageConflict`, and the view goes back to page 1 without `size`.
 */
export async function getWebserverLogPage (id: number | string, filename: string, query: LogPageQuery): Promise<LogPage> {
  const { data } = await api.get<{ data: LogPagePayload | string | null }>(
    `/instances/${id}/webserver-logs/${encodeURIComponent(filename)}${pageQuery(query)}`,
  )
  return toLogPage(data.data)
}

/** `GET /instances/:id/php-logs?page=&size=`, same contract as `getWebserverLogPage` (dind: one page, `size: null`). */
export async function getPhpLogPage (id: number | string, query: LogPageQuery): Promise<LogPage> {
  const { data } = await api.get<{ data: LogPagePayload | string | null }>(`/instances/${id}/php-logs${pageQuery(query)}`)
  return toLogPage(data.data)
}

/** The page request failed with 409: the file shrank (rotation, `copytruncate`) after the first page fixed its size. */
export function isLogPageConflict (error: unknown): boolean {
  return isApiError(error) && error.response?.status === 409
}

/** Opened in a new window. The file name is an encoded path segment, as in `getWebserverLog`. */
export function webserverLogDownloadUrl (id: number | string, filename: string): string {
  return `${apiBaseUrl()}/instances/${id}/webserver-logs/${encodeURIComponent(filename)}/download`
}

/** Opened in a new window. */
export function wordPressLogsDownloadUrl (id: number | string): string {
  return `${apiBaseUrl()}/instances/${id}/wordpress/logs/download`
}

/** Opened in a new window. */
export function phpLogsDownloadUrl (id: number | string): string {
  return `${apiBaseUrl()}/instances/${id}/php-logs/download`
}
