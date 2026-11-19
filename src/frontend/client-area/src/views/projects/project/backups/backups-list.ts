import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { BackupItemFile, BackupParts, BackupRow } from '@/entities/project/instance-backups.api'
import { formatBytes } from '@/shared/format/format-bytes'

// Pure helpers of the backups list: no request, no reactivity.

export type BackupAsyncStatus = NonNullable<BackupRow['async_status']>

/** A backup row as the screen keeps it: the server row with the display values the table and the usage count read. */
export interface BackupItem {
  id: number
  name: string | null
  /** Unix seconds with three zeros appended (milliseconds), as legacy stores it. Sorts as a string. */
  date: string
  /** The size formatted for the table (`1.5 GB`). */
  size: string
  /** The size in bytes, kept for the usage total (`recountUsage`). `null` when the server sent none. */
  size_in_bytes: number | null
  /** `Manual` or `Automatic`. */
  type: string
  mode: string | null
  convert_from_id: number | null
  version: string | null
  note: string | null
  directory: boolean | number | null
  database: boolean | number | null
  /** Never `null`: legacy fell back to `{}`, and the async status writes need an object. */
  async_status: BackupAsyncStatus
  items: BackupItemFile[]
  parts?: BackupParts | null
}

/** The row as the table shows it. */
export function decorateBackup (row: BackupRow): BackupItem {
  // Echo payloads are not validated beyond the id, so a missing type or size must not throw.
  const type = row.type ?? ''
  const size = row.size ?? null
  return {
    id: row.id,
    name: row.name,
    date: `${row.date}000`,
    size: formatBytes(size),
    size_in_bytes: size,
    type: type.charAt(0).toUpperCase() + type.slice(1),
    mode: row.mode,
    convert_from_id: row.convert_from_id,
    version: row.version,
    note: row.note,
    directory: row.directory,
    database: row.database,
    async_status: row.async_status ?? {},
    items: row.items ?? [],
    parts: row.parts,
  }
}

/** The screen has no backup to show: the list is empty and no search is applied. */
export function isEmpty (items: readonly BackupItem[], searchTerm: string): boolean {
  return items.length === 0 && !searchTerm
}

/** A search matches nothing: the list is empty and a search term is set. */
export function isNoResults (items: readonly BackupItem[], searchTerm: string): boolean {
  return items.length === 0 && Boolean(searchTerm)
}

/** The version column shows when any backup has a version. */
export function hasVersionColumn (items: readonly BackupItem[]): boolean {
  return items.some(item => item.version !== null && item.version !== undefined && item.version !== '')
}

/** One column of the table: the legacy header object (`text` is the translation key suffix, `value` the row key). */
// A type alias, not an interface: the kit's sort header takes it as `LegacySortHeader`, whose index signature needs an implicit one.
export type BackupColumn = {
  /** Translation key suffix: `table.header.<text>`. Empty for the checkbox and the actions column. */
  text: string
  value: string
  sortable: boolean
  searchable?: boolean
  align?: 'end'
}

export type BackupHeader = BackupColumn & {
  /** The translated title (`''` for the checkbox and the actions column). */
  title: string
  /** Ready text for the kit sort header; set only for the columns without a backend key (Code, Data). */
  label?: string
}

/** The columns. The version column sits before `note` when the list has one. */
export function backupsHeaders (showVersion: boolean, custom = false): BackupColumn[] {
  const headers: BackupColumn[] = [
    { text: '', value: 'select', sortable: false },
    { text: 'date', value: 'date', sortable: true, searchable: true },
    { text: custom ? 'data' : 'database', value: 'database', sortable: false },
    { text: custom ? 'code' : 'directory', value: 'directory', sortable: false },
    { text: 'size', value: 'size', sortable: true },
    { text: 'type', value: 'type', sortable: true, searchable: true },
    { text: 'note', value: 'note', sortable: true, searchable: true },
    { text: '', value: 'actions', sortable: false, align: 'end' },
  ]
  if (showVersion) {
    headers.splice(6, 0, { text: 'version', value: 'version', sortable: true })
  }
  return headers
}

// The Code and Data titles of a custom project have no backend key yet.
function headerDefault (text: string): { defaultValue: string } | undefined {
  if (text === 'code') {
    return { defaultValue: 'Code' }
  }
  return text === 'data' ? { defaultValue: 'Data' } : undefined
}

/**
 * The columns with their titles. The version column is decided by the whole list (`items` is the full list, not one page), as in legacy.
 */
export function buildHeaders (items: readonly BackupItem[], t: (key: string, options?: { defaultValue: string }) => string, custom = false): BackupHeader[] {
  return backupsHeaders(hasVersionColumn(items), custom).map(column => ({
    ...column,
    title: column.text ? t(`table.header.${column.text}`, headerDefault(column.text)) : '',
    // The kit sort header shows `label` and otherwise translates `table.header.<text>` again, without the default (the key showed for Code and Data).
    ...(headerDefault(column.text) === undefined ? {} : { label: t(`table.header.${column.text}`, headerDefault(column.text)) }),
  }))
}

/**
 * Search: a row matches when its `note`, its `type` (`Manual` / `Automatic`) or its date as the table shows it contains the term,
 * case-insensitively. Legacy searched only `note` (the `searchable` column) and threw on `note: null`; a missing note matches nothing
 * here. `dateText` gives the visible date (the configured format and the time); without it the date is not searched, because the stored
 * value is a raw timestamp the user never sees.
 */
export function filterBackups (
  items: readonly BackupItem[],
  searchTerm: string,
  dateText: (item: BackupItem) => string = () => '',
): BackupItem[] {
  if (!searchTerm) {
    return [...items]
  }
  const term = searchTerm.toLowerCase()
  return items.filter(item => [item.note ?? '', item.type, dateText(item)].some(text => text.toLowerCase().includes(term)))
}

/**
 * Sort: `localeCompare` on the `toString()` of the column, so `size` sorts by its formatted text. No sort column
 * (`false`) keeps the order. Returns a new array.
 */
export function sortBackups (items: readonly BackupItem[], sortBy: LegacySortHeader | false, sortDesc: boolean): BackupItem[] {
  if (!sortBy) {
    return [...items]
  }
  const key = sortBy.value as keyof BackupItem
  const direction = sortDesc ? -1 : 1
  // eslint-disable-next-line unicorn/no-array-sort -- `toSorted` is not in the app tsconfig lib (es2022); the spread is already a copy
  return [...items].sort((first, second) => String(first[key] ?? '').localeCompare(String(second[key] ?? '')) * direction)
}

/** Paging: the rows of page `page` (from 1), `itemsPerPage` to a page. */
export function paginate<T> (items: readonly T[], page: number, itemsPerPage: number | string): T[] {
  const size = Number(itemsPerPage)
  const start = (page - 1) * size
  return items.slice(start, start + size)
}

export type BackupAction = 'create' | 'restore' | 'delete'

/** The server's `async_status` values a row can carry while an action runs or after it failed. */
export type BackupAsyncValue = 'pending' | 'in_progress' | 'failed'

/** The action that blocks a row (in progress or failed), with its status. */
export interface BackupAsyncState {
  action: BackupAction
  status: BackupAsyncValue
}

// The order of the checks: create, then restore, then delete (the legacy order).
const ASYNC_ACTIONS: readonly BackupAction[] = ['create', 'restore', 'delete']

/**
 * An action in progress wins over a failed one, and each group is checked in the legacy order. `null` when no action blocks the row, including a `null`
 * `async_status`.
 */
export function asyncState (item: { async_status: BackupRow['async_status'] }): BackupAsyncState | null {
  const status = item.async_status
  if (!status) {
    return null
  }
  for (const action of ASYNC_ACTIONS) {
    const value = status[action]
    if (value === 'pending' || value === 'in_progress') {
      return { action, status: value }
    }
  }
  for (const action of ASYNC_ACTIONS) {
    if (status[action] === 'failed') {
      return { action, status: 'failed' }
    }
  }
  return null
}

/** The message key of a blocking state: `pending` and `in_progress` share the pending text, as legacy does. */
export function asyncMessageKey (state: BackupAsyncState): string {
  const phase = state.status === 'failed' ? 'failed' : 'pending'
  return `message.status.backup.${state.action}.${phase}`
}
