// Without `moment`: local-time formatting with `Date` (`@/shared/time/format-date`).
import { formatLocal, parseDate } from '@/shared/time/format-date'

export const TERMINAL_STATUSES = [
  'finished',
  'success',
  'partial',
  'failed',
  'cancelled',
]

export interface DeployLogLike {
  id: number | string
}

export function isFailedStatus (status: string | null | undefined): boolean {
  return status === 'failed' || status === 'cancelled'
}

/** The newest run (the API lists newest first), unless one is already picked. */
export function pickDefaultDeployLog<T extends DeployLogLike> (
  logs: T[] | null | undefined,
  preserveId?: number | string | null,
): T | null {
  const list = Array.isArray(logs) ? logs : []
  if (list.length === 0) {
    return null
  }
  if (preserveId != null && list.some(log => log.id === preserveId)) {
    return list.find(log => log.id === preserveId) ?? null
  }
  return list[0] ?? null
}

export function formatSelectDate (value: string | number | Date | null | undefined): string {
  if (!value) {
    return '—'
  }
  return formatLocal(parseDate(value), false)
}

export function formatLineTimestamp (ts: number | string | null | undefined): string {
  const n = Number(ts)
  if (!n) {
    return '—'
  }
  return formatLocal(new Date(n * 1000), true)
}

export function formatDuration (
  startedAt: string | number | Date | null | undefined,
  finishedAt: string | number | Date | null | undefined,
): string | null {
  if (!startedAt || !finishedAt) {
    return null
  }
  // moment().diff(…, 'seconds') truncates toward zero.
  const diff = Math.trunc((parseDate(finishedAt).getTime() - parseDate(startedAt).getTime()) / 1000)
  return `${Math.max(1, diff)}s`
}
