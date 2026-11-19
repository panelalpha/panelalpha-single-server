import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { createFtpAccount, deleteFtpAccount, getFtpServerInfo, listAccountDomains, listFtpAccounts, updateFtpAccount } from './ftp.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('ftp.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  it('listFtpAccounts GETs the list every time, without the cache', async () => {
    const body = { data: [], meta: { usage: true } }
    vi.mocked(api.get).mockResolvedValue({ data: body })

    await expect(listFtpAccounts(11)).resolves.toEqual(body)
    await listFtpAccounts(11)

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/ftp-accounts')
  })

  it('listAccountDomains returns data.data and reuses it until the cache is cleared', async () => {
    const domains = [{ domain: 'example.com' }, { domain: 'shop.example.com' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: domains } })

    await expect(listAccountDomains(11)).resolves.toEqual(domains)
    await expect(listAccountDomains(11)).resolves.toEqual(domains)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/domains', undefined)

    clearAllCachedGet()
    await listAccountDomains(11)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('getFtpServerInfo returns data.data and reuses it until the cache is cleared', async () => {
    const info = { host: 'ftp.example.com', port: 21 }
    vi.mocked(api.get).mockResolvedValue({ data: { data: info } })

    await expect(getFtpServerInfo(11)).resolves.toEqual(info)
    await expect(getFtpServerInfo(11)).resolves.toEqual(info)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/ftp-accounts/server-info', undefined)

    clearAllCachedGet()
    await getFtpServerInfo(11)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('createFtpAccount POSTs the payload to the account and resolves without a body', async () => {
    const payload = { domain: 'example.com', user: 'shop', password: 'secret123', directory: '/shop', unlimited_quota: true, quota: 0 }
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    await expect(createFtpAccount(11, payload)).resolves.toBeUndefined()
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/ftp-accounts', payload)
  })

  it('updateFtpAccount PUTs the new password with the user in the path, unencoded', async () => {
    const payload = { password: 'New-Password1!' }
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })

    await expect(updateFtpAccount(11, 'shop@example.com', payload)).resolves.toBeUndefined()
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/ftp-accounts/shop@example.com', payload)
  })

  it('deleteFtpAccount DELETEs the account with the user in the path, unencoded', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: {} })

    await expect(deleteFtpAccount(11, 'shop@example.com')).resolves.toBeUndefined()
    expect(api.delete).toHaveBeenCalledWith('/server-accounts/11/ftp-accounts/shop@example.com')
  })

  it('lets a failed mutation reach the caller', async () => {
    vi.mocked(api.delete).mockRejectedValue(new Error('boom'))

    await expect(deleteFtpAccount(11, 'shop@example.com')).rejects.toThrow('boom')
  })
})
