import type { EmailAccount } from './email-addresses.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** A list row: the API item plus the fields the page computes while mapping the response. */
export interface EmailAccountRow extends EmailAccount {
  usage_quota: string
  updated_at_text: string
  detailsButtonLoading: boolean
  webmailButtonLoading: boolean
}

/** Legacy `possibleItemsPerPage: [[8, 16, 24]]` and `itemsPerPage: 8`. */
export const ITEMS_PER_PAGE_OPTIONS = [8, 16, 24]

/**
 * Legacy headers. `text` is the `table.header.*` key (TableCustomSort translates it); `value` is the row field, which the
 * search filters on, so the row must carry `usage_quota` and the raw `updated_at`.
 */
export const emailAccountHeaders: LegacySortHeader[] = [
  { text: 'email', value: 'email', sortable: true },
  { text: 'usageQuota', value: 'usage_quota', sortable: true },
  { text: 'updated', value: 'updated_at', sortable: true },
  { text: 'actions', value: 'actions' },
]

/** The map: `usage_quota` as `"<used> MB / <quota or unlimited>"`, `updated_at_text` as relative time or `-`. */
export function toEmailAccountRow (account: EmailAccount, t: Translate, fromNow: (date: string) => string): EmailAccountRow {
  const quota = account.disk_quota === 'unlimited'
    ? t('form.value.unlimited')
    : t('form.value.sizeMB', { value: account.disk_quota })

  return {
    ...account,
    usage_quota: `${t('form.value.sizeMB', { value: account.disk_usage })} / ${quota}`,
    updated_at_text: account.updated_at ? fromNow(account.updated_at) : '-',
    detailsButtonLoading: false,
    webmailButtonLoading: false,
  }
}

/** The account added or edited last is highlighted by its address. */
export function emailAccountRowClass (item: { email: string }, highlightEmail?: string): 'highlight' | undefined {
  return highlightEmail && item.email === highlightEmail ? 'highlight' : undefined
}
