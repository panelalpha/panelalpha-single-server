import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { createSftpAccount, deleteSftpAccount, disconnectAllSftp, getSftpServerInfo, setSftpAccessType, updateSftpAccount } from './sftp.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('sftp.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  it('getSftpServerInfo returns data.data and reuses it until the cache is cleared', async () => {
    const info = { host: 'sftp.example.com', port: 2222 }
    vi.mocked(api.get).mockResolvedValue({ data: { data: info } })

    await expect(getSftpServerInfo(11)).resolves.toEqual(info)
    await expect(getSftpServerInfo(11)).resolves.toEqual(info)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/sftp-accounts/server-info', undefined)

    clearAllCachedGet()
    await getSftpServerInfo(11)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('createSftpAccount POSTs the payload to the account and resolves without a body', async () => {
    const payload = { username: 'example_deploy', type: 'password', password: 'secret123', public_key: null }
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    await expect(createSftpAccount(11, payload)).resolves.toBeUndefined()
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/sftp-accounts', payload)
  })

  it('updateSftpAccount PUTs the payload with the user in the path, unencoded', async () => {
    const payload = { type: 'public_key', password: null, public_key: 'ssh-ed25519 AAAA' }
    vi.mocked(api.put).mockResolvedValue({ data: {} })

    await expect(updateSftpAccount(11, 'example_deploy', payload)).resolves.toBeUndefined()
    expect(api.put).toHaveBeenCalledWith('/server-accounts/11/sftp-accounts/example_deploy', payload)
  })

  it('deleteSftpAccount DELETEs the account with the user in the path, unencoded', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: {} })

    await expect(deleteSftpAccount(11, 'example_deploy')).resolves.toBeUndefined()
    expect(api.delete).toHaveBeenCalledWith('/server-accounts/11/sftp-accounts/example_deploy')
  })

  it('disconnectAllSftp POSTs to disconnect-all without a body and resolves without a body', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    await expect(disconnectAllSftp(11)).resolves.toBeUndefined()
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/sftp-accounts/disconnect-all')
  })

  it('setSftpAccessType POSTs the access type as access_type to set-access-type', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    await expect(setSftpAccessType(11, 'ssh')).resolves.toBeUndefined()
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/sftp-accounts/set-access-type', { access_type: 'ssh' })
  })

  it('lets a failed mutation reach the caller', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('boom'))

    await expect(updateSftpAccount(11, 'example_deploy', {})).rejects.toThrow('boom')
  })
})
