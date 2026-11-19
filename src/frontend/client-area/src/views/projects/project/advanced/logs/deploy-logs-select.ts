import type { DeployLogEntry } from '@/entities/project/instance-deploy-logs.api'
import type { LogTranslate } from '@/entities/project/ui/logs/instance-log'
import { formatSelectDate } from '@/entities/project/ui/deploy/deploy-log-ui'

// Labels of the deploy run select. The duration comes from
// `formatDuration(started_at, finished_at)` in the template.

/** Start date (falls back to `created_at`) · status. */
export function deploySelectLabel (log: DeployLogEntry, t: LogTranslate): string {
  const date = formatSelectDate(log.started_at || log.created_at)
  return `${date} · ${t('deployLogs.status.' + log.status)}`
}

/** The source of the run, shown on the right of each menu item. */
export function deploySourceLabel (log: DeployLogEntry, t: LogTranslate): string {
  return t('deployLogs.source.' + log.source_type)
}
