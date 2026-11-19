import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import {
  createEmailAccount,
  deleteEmailAccount,
  getEmailAccountDetails,
  getWebmailSsoUrl,
  listEmailAccounts,
  updateEmailAccount,
} from './email-addresses.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  apiBaseUrl: () => '/api',
}))

describe('email-addresses.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  it('listEmailAccounts reads the accounts of one email domain and returns the data array', async () => {
    const accounts = [{ email: 'info@example.com', disk_usage: 12, disk_quota: 'unlimited', created_at: null, updated_at: null }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: accounts } })

    await expect(listEmailAccounts(7, 3)).resolves.toEqual(accounts)
    expect(api.get).toHaveBeenCalledWith('/services/7/email/domains/3/accounts')
  })

  it('listEmailAccounts is not cached: every call is a new request, as legacy Api.get', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } })

    await listEmailAccounts(7, 3)
    await listEmailAccounts(7, 3)

    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('createEmailAccount posts the add form to the accounts of the domain', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    const body = { email: 'info', domain: 'example.com', password: 'secret123', unlimited_quota: true, quota: 0 }

    await createEmailAccount(7, 3, body)

    expect(api.post).toHaveBeenCalledWith('/services/7/email/domains/3/accounts', body)
  })

  it('updateEmailAccount puts the edit form to the account, with the address unencoded in the path as legacy', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })
    const body = { hiddenPassword: null, password: null, unlimited_quota: false, quota: 512 }

    await updateEmailAccount(7, 3, 'info@example.com', body)

    expect(api.put).toHaveBeenCalledWith('/services/7/email/domains/3/accounts/info@example.com', body)
  })

  it('deleteEmailAccount deletes the account with the address unencoded in the path, as legacy', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await deleteEmailAccount(7, 3, 'info@example.com')

    expect(api.delete).toHaveBeenCalledWith('/services/7/email/domains/3/accounts/info@example.com')
  })

  it('getEmailAccountDetails is cached: a second call makes no request (legacy Api.cached)', async () => {
    const details = { smtp_username: 'info@example.com', inbox_host: 'mail.example.com', imap_port: 993 }
    vi.mocked(api.get).mockResolvedValue({ data: { data: details } })

    await expect(getEmailAccountDetails(7, 3, 'info@example.com')).resolves.toEqual(details)
    await expect(getEmailAccountDetails(7, 3, 'info@example.com')).resolves.toEqual(details)

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.get).mock.calls[0]?.[0]).toBe('/services/7/email/domains/3/accounts/info@example.com')
  })

  it('getWebmailSsoUrl returns the one-time URL and is not cached: every click is a new request', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { url: 'https://webmail.example.com/sso/1' } } })

    await expect(getWebmailSsoUrl(7, 3, 'info@example.com')).resolves.toBe('https://webmail.example.com/sso/1')
    await getWebmailSsoUrl(7, 3, 'info@example.com')

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith('/services/7/email/domains/3/accounts/info@example.com/webmail-sso-url')
  })
})
