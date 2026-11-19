import type { EmailForwarder } from './email-forwarders.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

/** A list row: the API item plus the relative time the page computes while mapping the response. */
export interface EmailForwarderRow extends EmailForwarder {
  updated_at_text: string
}

/** Legacy `possibleItemsPerPage: [[8, 16, 24]]` and `itemsPerPage: 8`. */
export const ITEMS_PER_PAGE_OPTIONS = [8, 16, 24]

/**
 * Legacy headers. `text` is the `table.header.*` key (TableCustomSort translates it); `value` is the row field, which the search
 * filters on, so the row must carry the raw `updated_at`.
 */
export const emailForwarderHeaders: LegacySortHeader[] = [
  { text: 'email', value: 'email', sortable: true },
  { text: 'forwardTo', value: 'forward_to', sortable: true },
  { text: 'created', value: 'updated_at', sortable: true },
  { text: 'actions', value: 'actions' },
]

/** The map: `updated_at_text` as relative time or `-`. */
export function toEmailForwarderRow (item: EmailForwarder, fromNow: (date: string) => string): EmailForwarderRow {
  return {
    ...item,
    updated_at_text: item.updated_at ? fromNow(item.updated_at) : '-',
  }
}

/** The forwarder added last is highlighted when both its address and its destination match. */
export function emailForwarderRowClass (
  item: { email: string, forward_to: string },
  highlight?: { email: string, forward_to: string },
): 'highlight' | undefined {
  return highlight && item.email === highlight.email && item.forward_to === highlight.forward_to ? 'highlight' : undefined
}
