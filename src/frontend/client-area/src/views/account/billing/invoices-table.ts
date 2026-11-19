import type { Invoice } from './billing.api'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// The columns and the overdue date. Shared by the table and the page state.

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** Columns in legacy order. `text` is the legacy header name, `label` the translated title that `TableCustomSort` shows. */
export function invoicesHeaders (t: Translate): LegacySortHeader[] {
  return [
    { text: 'number', label: t('table.header.number'), value: 'id', sortable: true },
    { text: 'invoice_date', label: t('table.header.invoice_date'), value: 'date', sortable: true },
    { text: 'due_date', label: t('table.header.due_date'), value: 'duedate', sortable: true },
    { text: 'total', label: t('table.header.total'), value: 'total', sortable: true },
    { text: 'status', label: t('table.header.status'), value: 'status', sortable: true },
    { text: ' ', label: ' ', value: 'actions', sortable: false },
  ]
}

/**
 * The columns the search reads (legacy `searchable: true`): the raw `total`, not `total_formatted`, and not `number`, which the
 * legacy table never had as a column. The `actions` column has no value.
 */
export const INVOICES_SEARCH_KEYS = ['id', 'date', 'duedate', 'total', 'status']

/**
 * Legacy `moment(value)` reads `YYYY-MM-DD` as local midnight, while `new Date('YYYY-MM-DD')` is UTC midnight; any other format
 * goes through `new Date(value)`.
 */
function parseDueDate (value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  return new Date(value)
}

/** An unpaid invoice is overdue when its due date is before now. */
export function isInvoiceOverdue (invoice: Pick<Invoice, 'status' | 'duedate'>, now: Date = new Date()): boolean {
  return invoice.status === 'Unpaid' && parseDueDate(invoice.duedate).getTime() < now.getTime()
}
