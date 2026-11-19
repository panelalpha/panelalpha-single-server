import { api, apiBaseUrl } from '@/shared/api/client'

// Paths start at `/instances/` so the client rewrites them to `/projects` under single server. The download URL is opened by the browser,
// outside axios, so it keeps `/instances/` (app-lite's API serves both segments).

/** What a backup holds (WP Cloud and `custom` projects). `volumes` and `databases` are names. */
export interface BackupParts {
  files: boolean
  volumes: string[]
  databases: string[]
}

/** One row of `GET /instances/{id}/wordpress/backups`. `date` is unix seconds, `size` bytes. */
export interface BackupRow {
  [key: string]: unknown
  id: number
  name: string | null
  date: number
  size: number | null
  type: string
  mode: string | null
  convert_from_id: number | null
  version: string | null
  note: string | null
  directory: boolean | number | null
  database: boolean | number | null
  async_status: { create?: string | null, restore?: string | null, delete?: string | null } | null
  items: BackupItemFile[]
  parts?: BackupParts | null
}

/** One file of a backup's `items` (a backup of a WP Cloud or a multi-part backup). */
export interface BackupItemFile {
  [key: string]: unknown
  id: number
  directory: boolean | number | null
  database: boolean | number | null
  type?: string | null
  name?: string | null
}

/** One `meta.usage` entry. `max` is `null` when the plan does not limit the value. */
export interface BackupsUsageEntry {
  total: number | string
  max: number | null
}

/**
 * `meta.usage` of the list. Keys are the usage keys of the server; WP Cloud sends its own (`database_manual_backups_number`, ...).
 */
export type BackupsUsage = Record<string, BackupsUsageEntry | null | undefined>

/**
 * `GET /instances/{id}/wordpress/backups`. Returns the rows and the usage. Errors reject; the screen catches them and shows the empty
 * state, as legacy does.
 */
export async function getBackups (instanceId: number): Promise<{ data: BackupRow[], usage: BackupsUsage }> {
  const { data } = await api.get<{ data: BackupRow[], meta?: { usage?: BackupsUsage } }>(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/backups`)
  return { data: data.data ?? [], usage: data.meta?.usage ?? {} }
}

export type AutomaticBackupFrequency = 'never' | 'daily' | 'weekly' | 'monthly' | (string & {})

/** `GET /instances/{id}/wordpress/automatic-backup` (`data`). The cron fields are UTC, as the API stores them. */
export interface AutomaticBackupSettings {
  [key: string]: unknown
  frequency?: AutomaticBackupFrequency
  cron_hour?: string | number
  cron_minute?: string | number
  cron_day_of_week?: string | number
  cron_day_of_month?: string | number
  /** Engine 2.2: `false` when no backup store is set up; absent on older Engines. */
  store_configured?: boolean
}

/**
 * A failed GET is swallowed without an alert, so the switch shows the disabled state. The caller reads
 * an empty object as "no frequency".
 */
export async function getAutomaticBackupSettings (instanceId: number): Promise<AutomaticBackupSettings> {
  try {
    const { data } = await api.get<{ data: AutomaticBackupSettings }>(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/automatic-backup`)
    return data.data ?? {}
  } catch {
    return {}
  }
}

/** `PUT /instances/{id}/wordpress/automatic-backup`. A `*` weekday or month day is sent as `0` or `1`, as legacy did. Errors reject. */
export async function saveAutomaticBackupSettings (instanceId: number, settings: AutomaticBackupSettings): Promise<void> {
  await api.put(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/automatic-backup`, {
    ...settings,
    cron_day_of_week: settings.cron_day_of_week === '*' ? '0' : settings.cron_day_of_week,
    cron_day_of_month: settings.cron_day_of_month === '*' ? '1' : settings.cron_day_of_month,
  })
}

/** The body of `POST /instances/{id}/wordpress/backups`: the form values, with the directory and database flags. */
export interface CreateBackupBody {
  [key: string]: unknown
  backupDirectory?: boolean
  backupDatabase?: boolean
  backupNote?: string
  /** A retry of a failed create. */
  retry_id?: number
  /** A convert of an incremental backup into a full one. */
  convert_from_id?: number
}

/** `POST /instances/{id}/wordpress/backups` (manual backup). Errors reject. */
export async function createBackup (instanceId: number, body: CreateBackupBody): Promise<void> {
  await api.post(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/backups`, body)
}

/** The body of `PUT …/wordpress/backups/{id}/restore`: the three flags only, as JSON booleans. */
export interface RestoreBackupBody {
  restoreDatabase: boolean
  restoreDirectory: boolean
  deleteExistingFiles: boolean
}

/** `PUT /instances/{id}/wordpress/backups/{backupId}/restore`. Errors reject. */
export async function restoreBackup (instanceId: number, backupId: number, body: RestoreBackupBody): Promise<void> {
  await api.put(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/backups/${encodeURIComponent(String(backupId))}/restore`, body)
}

/** `DELETE /instances/{id}/wordpress/backups/{backupId}`. Errors reject. */
export async function deleteBackup (instanceId: number, backupId: number): Promise<void> {
  await api.delete(`/instances/${encodeURIComponent(String(instanceId))}/wordpress/backups/${encodeURIComponent(String(backupId))}`)
}

/**
 * The URL of one file of a backup. Built on the client's base (`VITE_API_URL` or `/api`) and opened with
 * `window.open`, as legacy did; the file never goes through axios.
 */
export function backupDownloadUrl (instanceId: number, backupId: number, itemId: number): string {
  const instance = encodeURIComponent(String(instanceId))
  const backup = encodeURIComponent(String(backupId))
  const item = encodeURIComponent(String(itemId))
  return `${apiBaseUrl()}/instances/${instance}/wordpress/backups/${backup}/item/${item}/download`
}
