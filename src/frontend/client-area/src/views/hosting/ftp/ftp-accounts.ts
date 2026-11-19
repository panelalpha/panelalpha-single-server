import type { FtpAccount } from './ftp.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** A list row: the API item plus the fields the page computes while mapping the response. */
export interface FtpRow extends FtpAccount {
  usage_quota: string
  updated_at_text: string
  infoButtonLoading: boolean
}

/**
 * Legacy headers. `text` is the `table.header.*` key (TableCustomSort translates it); `value` is the row field, which the
 * search filters on, so the row must carry `usage_quota` and the raw `updated_at`.
 */
export const ftpHeaders: LegacySortHeader[] = [
  { text: 'user', value: 'user', sortable: true },
  { text: 'directory', value: 'directory', sortable: true },
  { text: 'usageQuota', value: 'usage_quota', sortable: true },
  { text: 'updated', value: 'updated_at', sortable: true },
  { text: 'actions', value: 'actions' },
]

/** The map: `usage_quota` as `"<used> MB / <quota or unlimited>"`, `updated_at_text` as relative time or `-`. */
export function toFtpRow (account: FtpAccount, t: Translate, fromNow: (date: string) => string): FtpRow {
  const quota = account.diskquota === 'unlimited'
    ? t('form.value.unlimited')
    : t('form.value.sizeMB', { value: account.diskquota })

  return {
    ...account,
    usage_quota: `${t('form.value.sizeMB', { value: account.diskused })} / ${quota}`,
    updated_at_text: account.updated_at ? fromNow(account.updated_at) : '-',
    infoButtonLoading: false,
  }
}

/** The row added after a create is highlighted (`user@domain`). */
export function ftpRowClass (item: { user: string }, highlightUser?: string): 'highlight' | undefined {
  return highlightUser && item.user === highlightUser ? 'highlight' : undefined
}
