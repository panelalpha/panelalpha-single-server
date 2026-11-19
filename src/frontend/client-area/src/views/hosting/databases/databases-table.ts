import type { MysqlDatabase, MysqlDatabasesResponse, MysqlUser, MysqlUsersResponse } from '@/views/hosting/hosting.types'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import { formatBytes } from '@/shared/format/format-bytes'
import { fromNow } from '@/shared/time/from-now'

// Port of the database headers, the user headers and the row mapping of both lists.
// Legacy mutates the response rows; here each row is a copy with the same fields.

/** Databases table headers; `text` is a `table.header.*` key. */
export const DATABASE_HEADERS: LegacySortHeader[] = [
  { text: 'database', value: 'database', sortable: true },
  { text: 'size', value: 'disk_usage', sortable: true },
  { text: 'updated', value: 'updated_at', sortable: true },
  { text: 'actions', value: 'actions' },
]

export interface DatabaseRow extends Omit<MysqlDatabase, 'disk_usage'> {
  /** `disk_usage` replaced in place by `formatBytes`, so sort and search work on the text as in legacy. */
  disk_usage: string
  /** `fromNow` of `updated_at`, or `-` without a date. The table renders it through its `updated_at` slot. */
  updated_at_text: string
  /** Edit is offered when the backend says the rename is supported (`meta.actions.rename`). */
  can_rename: boolean
}

/** Maps `GET …/mysql/databases` to table rows. `updated_at` stays the raw ISO string (sort and search read it). */
export function toDatabaseRows (response: MysqlDatabasesResponse, now: Date = new Date()): DatabaseRow[] {
  const canRename = response.meta?.actions?.rename || false
  return response.data.map(item => ({
    ...item,
    disk_usage: formatBytes(item.disk_usage),
    updated_at_text: item.updated_at ? fromNow(item.updated_at, now) : '-',
    can_rename: canRename,
  }))
}

/** The row whose database is the highlighted one gets `highlight`, every other row no class. */
export function databaseRowClass (item: { database?: unknown }, highlighted: string | undefined): string {
  return highlighted && item.database === highlighted ? 'highlight' : ''
}

/** Users table headers: `assignedDatabases` is the list of database buttons, not sortable. */
export const USER_HEADERS: LegacySortHeader[] = [
  { text: 'user', value: 'user', sortable: true },
  { text: 'assignedDatabases', value: 'databases' },
  { text: 'updated', value: 'updated_at', sortable: true },
  { text: 'actions', value: 'actions' },
]

/** A database a user has privileges on, as the Users row lists it. */
export interface UserDatabase {
  name: string
  /** The user's privileges on the database; `null` until they are fetched. */
  privileges: string[] | null
  /** `none`, `read`, `read_write`, `all` or `custom`, set with the privileges. */
  privileges_preset?: string
  /** Set while the database tooltip is open. */
  showTooltip: boolean
}

export interface UserRow extends Omit<MysqlUser, 'databases'> {
  databases: UserDatabase[]
  /** `fromNow` of `updated_at`, or `-` without a date. */
  updated_at_text: string
}

/** Maps `GET …/mysql/users` to table rows. */
export function toUserRows (response: MysqlUsersResponse, now: Date = new Date()): UserRow[] {
  return response.data.map(item => ({
    ...item,
    databases: item.databases.map(name => ({ name, privileges: null, showTooltip: false })),
    updated_at_text: item.updated_at ? fromNow(item.updated_at, now) : '-',
  }))
}

/** The row whose user is the highlighted one gets `highlight`, every other row no class. */
export function userRowClass (item: { user?: unknown }, highlighted: string | undefined): string {
  return highlighted && item.user === highlighted ? 'highlight' : ''
}
