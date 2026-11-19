import { describe, expect, it } from 'vitest'
import { emailAccountHeaders, emailAccountRowClass, ITEMS_PER_PAGE_OPTIONS, toEmailAccountRow } from './email-accounts'

// `t` echoes the key and its value, so the texts are readable: `form.value.sizeMB` becomes `<value> MB`.
const t = (key: string, options?: Record<string, unknown>) => (key === 'form.value.sizeMB' ? `${options?.value} MB` : key)
const fromNow = (date: string) => `ago ${date}`

const account = {
  email: 'info@example.com',
  disk_usage: 12,
  disk_quota: 512,
  created_at: null,
  updated_at: '2026-09-20T10:00:00.000Z',
}

describe('email-accounts', () => {
  it('shows the usage and the quota in MB, and the unlimited text for an unlimited quota', () => {
    expect(toEmailAccountRow(account, t, fromNow).usage_quota).toBe('12 MB / 512 MB')
    expect(toEmailAccountRow({ ...account, disk_quota: 'unlimited' }, t, fromNow).usage_quota).toBe('12 MB / form.value.unlimited')
  })

  it('keeps the raw updated_at for sort and search, and a relative text for the cell', () => {
    const row = toEmailAccountRow(account, t, fromNow)

    expect(row.updated_at).toBe('2026-09-20T10:00:00.000Z')
    expect(row.updated_at_text).toBe('ago 2026-09-20T10:00:00.000Z')
  })

  it('shows a dash for an account that was never updated', () => {
    expect(toEmailAccountRow({ ...account, updated_at: null }, t, fromNow).updated_at_text).toBe('-')
  })

  it('starts the row actions in the idle state', () => {
    const row = toEmailAccountRow(account, t, fromNow)

    expect(row.detailsButtonLoading).toBe(false)
    expect(row.webmailButtonLoading).toBe(false)
  })

  it('uses the legacy header keys, without a sort on the first load', () => {
    expect(emailAccountHeaders.map(header => header.text)).toEqual(['email', 'usageQuota', 'updated', 'actions'])
    expect(emailAccountHeaders.map(header => header.value)).toEqual(['email', 'usage_quota', 'updated_at', 'actions'])
    expect(ITEMS_PER_PAGE_OPTIONS).toEqual([8, 16, 24])
  })

  it('highlights only the row whose address is the highlighted one', () => {
    expect(emailAccountRowClass({ email: 'a@example.com' }, 'a@example.com')).toBe('highlight')
    expect(emailAccountRowClass({ email: 'b@example.com' }, 'a@example.com')).toBeUndefined()
    expect(emailAccountRowClass({ email: 'a@example.com' })).toBeUndefined()
  })
})
