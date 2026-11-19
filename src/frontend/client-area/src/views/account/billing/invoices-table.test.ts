import { describe, expect, it } from 'vitest'
import { INVOICES_SEARCH_KEYS, invoicesHeaders, isInvoiceOverdue } from './invoices-table'

describe('invoicesHeaders', () => {
  it('lists the columns in legacy order with the first one sortable by id', () => {
    const headers = invoicesHeaders(key => key)

    expect(headers.map(header => header.value)).toEqual(['id', 'date', 'duedate', 'total', 'status', 'actions'])
    expect(headers.map(header => header.label)).toEqual([
      'table.header.number',
      'table.header.invoice_date',
      'table.header.due_date',
      'table.header.total',
      'table.header.status',
      ' ',
    ])
    expect(headers.map(header => header.sortable)).toEqual([true, true, true, true, true, false])
  })
})

describe('INVOICES_SEARCH_KEYS', () => {
  it('searches the raw total and the status, not the number or the formatted total', () => {
    expect(INVOICES_SEARCH_KEYS).toEqual(['id', 'date', 'duedate', 'total', 'status'])
  })
})

describe('isInvoiceOverdue', () => {
  it('is overdue from local midnight of the due date (not UTC midnight)', () => {
    const invoice = { status: 'Unpaid', duedate: '2026-10-23' }

    expect(isInvoiceOverdue(invoice, new Date(2026, 9, 22, 23, 59))).toBe(false)
    expect(isInvoiceOverdue(invoice, new Date(2026, 9, 23, 0, 0, 0))).toBe(false)
    expect(isInvoiceOverdue(invoice, new Date(2026, 9, 23, 0, 0, 1))).toBe(true)
    expect(isInvoiceOverdue(invoice, new Date(2026, 9, 23, 23, 59))).toBe(true)
  })

  it('is never overdue for a Paid or other status', () => {
    const now = new Date(2027, 0, 1)

    expect(isInvoiceOverdue({ status: 'Paid', duedate: '2026-01-01' }, now)).toBe(false)
    expect(isInvoiceOverdue({ status: 'Cancelled', duedate: '2026-01-01' }, now)).toBe(false)
  })

  it('reads a due date with a time through the Date parser', () => {
    const invoice = { status: 'Unpaid', duedate: '2026-10-23T12:00:00' }

    expect(isInvoiceOverdue(invoice, new Date(2026, 9, 23, 11, 0))).toBe(false)
    expect(isInvoiceOverdue(invoice, new Date(2026, 9, 23, 13, 0))).toBe(true)
  })
})
