import type { HostingService } from '@/views/hosting/hosting.types'
import { hasPrivilege } from '@/views/hosting/hosting-privileges'
import { formatBytes } from '@/shared/format/format-bytes'

// The usage response as the rows of the plan card. Pure so the order, the conditions and the infinity handling are testable.

export interface UsageMetric {
  usage: number
  maximum: number | null
}

export type UsageData = Record<string, UsageMetric | undefined>
export type SupportedMetrics = Record<string, boolean | undefined>

export const INFINITY = '∞'

/** `null` (no limit) is the infinity sign, anything else `Helper.formatBytes`. */
export function formatBytesOrInfinity (bytes: number | null): string {
  return bytes === null ? INFINITY : formatBytes(bytes)
}

export function formatAmount (amount: number | null): string | number {
  return amount === null ? INFINITY : amount
}

export interface AvailableSpaceItem {
  title: 'disk' | 'email'
  icon: string
  available: number | null
  availableText: string
  value: number
  valueText: string
}

const NO_USAGE: UsageMetric = { usage: 0, maximum: null }

/** The disk tile, and a second tile for email storage (preferred) or the email account count. */
export function buildPlanUsageHeader (usage: UsageData, supported: SupportedMetrics): AvailableSpaceItem[] {
  const disk = usage.disk_usage ?? NO_USAGE
  const header: AvailableSpaceItem[] = [
    {
      title: 'disk',
      icon: 'diskspaceIcon',
      available: disk.maximum,
      availableText: formatBytesOrInfinity(disk.maximum),
      value: disk.usage,
      valueText: formatBytes(disk.usage),
    },
  ]

  if (supported.email_storage) {
    const storage = usage.email_storage ?? NO_USAGE
    header.push({
      title: 'email',
      icon: 'emailaccountsIcon',
      available: storage.maximum,
      availableText: formatBytesOrInfinity(storage.maximum),
      value: storage.usage,
      valueText: formatBytes(storage.usage),
    })
  } else if (supported.email_accounts) {
    const accounts = usage.email_accounts ?? NO_USAGE
    header.push({
      title: 'email',
      icon: 'emailaccountsIcon',
      available: accounts.maximum,
      availableText: String(formatAmount(accounts.maximum)),
      value: accounts.usage,
      valueText: String(formatAmount(accounts.usage)),
    })
  }
  return header
}

export interface UsageRow {
  name: string
  icon: string
  /** The usage as an integer. */
  value: number
  valueText: string | number
  /** The maximum as an integer: `NaN` for no limit. */
  maxValue: number
  maxValueText: string | number
  /** Target of the Manage link. */
  url?: string
  /** Privilege the row needs (bandwidth has none). */
  privilege?: string
}

interface RowSpec {
  metric: string
  name: string
  icon: string
  bytes?: boolean
  url?: string
  privilege?: string
}

// Legacy order. Every row needs `supported_metrics[metric]`; bandwidth is the only one without a privilege.
const ROWS: RowSpec[] = [
  { metric: 'bandwidth', name: 'bandwidth', icon: 'bandwidthIcon', bytes: true },
  { metric: 'ftp_accounts', name: 'ftp', icon: 'ftpaccountsIcon', url: '/hosting/ftp', privilege: 'hosting.manage_ftp' },
  { metric: 'sftp_accounts', name: 'sftp', icon: 'ftpaccountsIcon', url: '/hosting/sftp', privilege: 'hosting.manage_sftp' },
  { metric: 'mysql_databases', name: 'mysql', icon: 'mysqldatabasesIcon', url: '/hosting/databases', privilege: 'hosting.manage_mysql' },
  { metric: 'addon_domains', name: 'addonDomains', icon: 'addondomainsIcon', url: '/hosting/domains', privilege: 'hosting.manage_domains' },
  { metric: 'subdomains', name: 'subdomains', icon: 'subdomainsIcon', url: '/hosting/domains', privilege: 'hosting.manage_domains' },
  { metric: 'aliases', name: 'aliases', icon: 'subdomainsIcon', url: '/hosting/domains', privilege: 'hosting.manage_domains' },
  { metric: 'email_accounts', name: 'email', icon: 'emailaccountsIcon', url: '/hosting/email-addresses', privilege: 'hosting.manage_email' },
  { metric: 'email_storage', name: 'email_storage', icon: 'storage', bytes: true, url: '/hosting/email-addresses', privilege: 'hosting.manage_email' },
]

/** No usage at all gives no rows. */
export function buildPlanUsage (usage: UsageData, supported: SupportedMetrics): UsageRow[] {
  if (Object.keys(usage).length === 0) {
    return []
  }
  const rows: UsageRow[] = []
  for (const spec of ROWS) {
    if (!supported[spec.metric]) {
      continue
    }
    const metric = usage[spec.metric] ?? NO_USAGE
    rows.push({
      name: spec.name,
      icon: spec.icon,
      value: Number.parseInt(String(metric.usage)),
      valueText: spec.bytes ? formatBytes(metric.usage) : metric.usage,
      maxValue: Number.parseInt(String(metric.maximum)),
      maxValueText: spec.bytes ? formatBytesOrInfinity(metric.maximum) : formatAmount(metric.maximum),
      ...(spec.url === undefined ? {} : { url: spec.url }),
      ...(spec.privilege === undefined ? {} : { privilege: spec.privilege }),
    })
  }
  return rows
}

/** Bandwidth shows always, any other row only with its privilege on the service. */
export function isRowVisible (row: UsageRow, service: Pick<HostingService, 'privileges'>): boolean {
  return row.name === 'bandwidth' || hasPrivilege(service, row.privilege ?? '')
}

/** Grey without a limit is the chart track token (static `#E5E5F0` in both themes, `themes-variables.scss`), not a literal in the logic. */
export type SpaceColor = 'var(--v-chart-progress-track)' | 'success' | 'warning' | 'error'

/** Legacy rounds up; no limit gives `Infinity` or `NaN`, which the tile shows as an icon. */
export function usedPercent (value: number, available: number | null): number {
  return Math.ceil((value / (available as number)) * 100)
}

/** Success up to 50 %, warning up to 80 %, otherwise error; grey without a limit. */
export function spaceColor (value: number | string, available: number | null): SpaceColor {
  if (value === '?' || available === null) {
    return 'var(--v-chart-progress-track)'
  }
  const percent = usedPercent(Number(value), available)
  if (percent <= 50) {
    return 'success'
  }
  return percent <= 80 ? 'warning' : 'error'
}
