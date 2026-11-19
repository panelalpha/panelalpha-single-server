import type { LogKind, LogRow } from './log-lines'
import type { DataTableHeader } from '@/shared/ui/data-table/data-table'
import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
import { formatBytes } from '@/shared/format/format-bytes'

// Columns, status colours and search of the log lines table (`LogLinesTable.vue`).

type LogHeader = DataTableHeader & { text: string }

/** One page size for every log table, the first size of the footer (the same as Tasks): the default everywhere in this screen. */
export const LOG_DEFAULT_PER_PAGE = 15

/** Sizes the footer offers in every log table (the browser cuts the pages, also of the windows loaded from a file). */
export const LOG_POSSIBLE_PER_PAGE: number[][] = [[15, 50, 100]]

/** Pages of `rows` rows at `perPage` a page; at least 1. */
export function logPageCount (rows: number, perPage: number): number {
  return Math.max(1, Math.ceil(rows / Math.max(1, perPage)))
}

/**
 * Column keys per kind (the `table.header.<text>` key of each is the same text). Only the deploy Time column sorts (by `sortKey`).
 * The widths are in `LogLinesTable.vue` (`td.item--<text>` of the header row), the same in every kind, so the tabs line up.
 */
export function logHeaders (kind: LogKind): LogHeader[] {
  switch (kind) {
    case 'access': {
      return [
        { text: 'time', value: 'time', sortable: false },
        { text: 'ip', value: 'ip', sortable: false },
        { text: 'request', value: 'request', sortable: false, align: 'start' },
        { text: 'status', value: 'status', sortable: false },
        { text: 'size', value: 'size', sortable: false, align: 'end', headerAlign: 'end' },
      ]
    }
    case 'deploy': {
      return [
        { text: 'time', value: 'time', sortable: true },
        { text: 'stage', value: 'stage', sortable: false },
        { text: 'level', value: 'level', sortable: false },
        { text: 'message', value: 'message', sortable: false, align: 'start' },
      ]
    }
    default: {
      return [
        { text: 'time', value: 'time', sortable: false },
        { text: 'level', value: 'level', sortable: false },
        { text: 'message', value: 'message', sortable: false, align: 'start' },
      ]
    }
  }
}

/** Default English text of a header (key `table.header.<text>`), used until the backend translations have the key. */
export const LOG_HEADER_DEFAULTS: Record<string, string> = {
  time: 'Time',
  ip: 'IP',
  request: 'Request',
  status: 'Status',
  size: 'Size',
  level: 'Level',
  message: 'Message',
  stage: 'Stage',
}

/** HTTP status chip: 2xx success, 3xx info, 4xx warning, 5xx error, anything else gray. */
export function httpStatusColor (status: string | undefined): StatusLabelStatus {
  const first = (status ?? '').charAt(0)
  if (first === '2') {
    return 'success'
  }
  if (first === '3') {
    return 'info'
  }
  if (first === '4') {
    return 'warning'
  }
  if (first === '5') {
    return 'error'
  }
  return 'gray'
}

/** Level chip: fatal and error → error, warning and deprecated → warning, ok → success, info → info, notice, debug and unknown → gray. */
export function levelColor (level: string | undefined): StatusLabelStatus {
  switch (level) {
    case 'fatal':
    case 'error': {
      return 'error'
    }
    case 'warning':
    case 'deprecated': {
      return 'warning'
    }
    case 'ok': {
      return 'success'
    }
    case 'info': {
      return 'info'
    }
    default: {
      return 'gray'
    }
  }
}

export function levelLabel (level: string | undefined): string {
  return level ? level.charAt(0).toUpperCase() + level.slice(1) : ''
}

/** Search in the browser: a case-insensitive match of the term in any text of the row. An empty term keeps every row. */
export function filterLogRows (rows: readonly LogRow[], term: string): LogRow[] {
  const needle = term.trim().toLowerCase()
  if (!needle) {
    return [...rows]
  }
  return rows.filter(row => [row.time, row.ip, row.request, row.detail, row.status, row.size, row.level, row.stage, row.message]
    .some(value => value != null && value.toLowerCase().includes(needle)))
}

/** Rows by `sortKey` (file order = time order): `null` keeps the order given, otherwise ascending or descending. */
export function sortLogRows (rows: readonly LogRow[], direction: 'asc' | 'desc' | null): LogRow[] {
  if (!direction) {
    return [...rows]
  }
  const sign = direction === 'asc' ? 1 : -1
  // eslint-disable-next-line unicorn/no-array-sort -- `toSorted` is not in the TS lib of this project; the copy is the new array
  return [...rows].sort((a, b) => sign * (a.sortKey - b.sortKey))
}

/** Size of an access log line in readable units (`512 B`, `1.5 KB`, `2 MB`); `-` and other text stay as written. */
export function formatLogSize (size: string | undefined): string {
  if (size == null || size === '') {
    return ''
  }
  if (!/^\d+$/.test(size)) {
    return size
  }
  return formatBytes(Number(size)).replace(/ Bytes$/, ' B')
}
