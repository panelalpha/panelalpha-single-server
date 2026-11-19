import type { FtpAccount } from './ftp.api'
import { describe, expect, it, vi } from 'vitest'
import { ftpHeaders, ftpRowClass, toFtpRow } from './ftp-accounts'

// The translator echoes the key and its values, so the expected strings show exactly which key and value were used.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}(${Object.values(options).join(',')})` : key)

function account (overrides: Partial<FtpAccount> = {}): FtpAccount {
  return {
    user: 'shop@example.com',
    directory: '/home/example/shop',
    diskused: 120,
    diskquota: 1024,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('toFtpRow', () => {
  it('builds usage_quota from the used and quota sizes in MB', () => {
    const row = toFtpRow(account(), t, () => 'x')

    expect(row.usage_quota).toBe('form.value.sizeMB(120) / form.value.sizeMB(1024)')
  })

  it('shows the unlimited label when the quota is unlimited', () => {
    const row = toFtpRow(account({ diskquota: 'unlimited' }), t, () => 'x')

    expect(row.usage_quota).toBe('form.value.sizeMB(120) / form.value.unlimited')
  })

  it('takes updated_at_text from fromNow, and keeps the raw updated_at for search and sort', () => {
    const fromNow = vi.fn(() => '2 days ago')
    const row = toFtpRow(account(), t, fromNow)

    expect(fromNow).toHaveBeenCalledWith('2026-09-20T10:00:00.000Z')
    expect(row.updated_at_text).toBe('2 days ago')
    expect(row.updated_at).toBe('2026-09-20T10:00:00.000Z')
  })

  it('shows a dash and skips fromNow when updated_at is null', () => {
    const fromNow = vi.fn(() => 'never')
    const row = toFtpRow(account({ updated_at: null }), t, fromNow)

    expect(row.updated_at_text).toBe('-')
    expect(fromNow).not.toHaveBeenCalled()
  })

  it('adds infoButtonLoading false and keeps the API fields', () => {
    const row = toFtpRow(account(), t, () => 'x')

    expect(row.infoButtonLoading).toBe(false)
    expect(row).toMatchObject({ user: 'shop@example.com', directory: '/home/example/shop', diskused: 120, diskquota: 1024 })
  })
})

describe('ftpHeaders', () => {
  it('has the five legacy columns, keyed by the row fields the search reads', () => {
    expect(ftpHeaders.map(header => header.text)).toEqual(['user', 'directory', 'usageQuota', 'updated', 'actions'])
    expect(ftpHeaders.map(header => header.value)).toEqual(['user', 'directory', 'usage_quota', 'updated_at', 'actions'])
  })

  it('makes only the first four columns sortable', () => {
    expect(ftpHeaders.map(header => header.sortable ?? false)).toEqual([true, true, true, true, false])
  })
})

describe('ftpRowClass', () => {
  it('highlights the row whose user matches', () => {
    expect(ftpRowClass({ user: 'shop@example.com' }, 'shop@example.com')).toBe('highlight')
  })

  it('does not highlight other rows, or any row when nothing is highlighted', () => {
    expect(ftpRowClass({ user: 'blog@example.com' }, 'shop@example.com')).toBeUndefined()
    expect(ftpRowClass({ user: 'shop@example.com' }, undefined)).toBeUndefined()
    expect(ftpRowClass({ user: 'shop@example.com' }, '')).toBeUndefined()
  })
})
