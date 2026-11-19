import { describe, expect, it } from 'vitest'
import { emailForwarderHeaders, emailForwarderRowClass, ITEMS_PER_PAGE_OPTIONS, toEmailForwarderRow } from './email-forwarders'

const fromNow = (date: string) => `ago ${date}`

const forwarder = { email: 'info@example.com', forward_to: 'me@mail.com', updated_at: '2026-09-20T10:00:00.000Z' }

describe('email-forwarders', () => {
  it('has the legacy headers in order with the row fields as values', () => {
    expect(emailForwarderHeaders.map(header => [header.text, header.value, header.sortable])).toEqual([
      ['email', 'email', true],
      ['forwardTo', 'forward_to', true],
      ['created', 'updated_at', true],
      ['actions', 'actions', undefined],
    ])
    expect(ITEMS_PER_PAGE_OPTIONS).toEqual([8, 16, 24])
  })

  it('keeps the raw updated_at for sort and search, and a relative text for the cell', () => {
    const row = toEmailForwarderRow(forwarder, fromNow)

    expect(row.updated_at).toBe('2026-09-20T10:00:00.000Z')
    expect(row.updated_at_text).toBe('ago 2026-09-20T10:00:00.000Z')
  })

  it('shows a dash for a forwarder without updated_at', () => {
    expect(toEmailForwarderRow({ ...forwarder, updated_at: null }, fromNow).updated_at_text).toBe('-')
  })

  it('highlights a row only when both the address and the destination match', () => {
    const highlight = { email: 'info@example.com', forward_to: 'me@mail.com' }

    expect(emailForwarderRowClass(forwarder, highlight)).toBe('highlight')
    expect(emailForwarderRowClass({ ...forwarder, forward_to: 'other@mail.com' }, highlight)).toBeUndefined()
    expect(emailForwarderRowClass({ ...forwarder, email: 'sales@example.com' }, highlight)).toBeUndefined()
    expect(emailForwarderRowClass(forwarder)).toBeUndefined()
  })
})
