import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { backupDownloadUrl, deleteBackup, getBackups, restoreBackup } from './instance-backups.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiBaseUrl: () => '/api',
}))

describe('instance-backups.api backupDownloadUrl', () => {
  it('builds the item download URL on the client base, with the instances segment', () => {
    expect(backupDownloadUrl(9, 7, 3)).toBe('/api/instances/9/wordpress/backups/7/item/3/download')
  })
})

describe('instance-backups.api getBackups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the list from the instance path and returns the rows and the usage', async () => {
    const row = {
      id: 3,
      name: 'Backup',
      date: 1_700_000_000,
      size: 2048,
      type: 'manual',
      mode: 'full',
      convert_from_id: null,
      version: '6.4',
      note: 'before update',
      directory: true,
      database: true,
      async_status: null,
      items: [],
    }
    const usage = {
      manual_backups_number: { total: 1, max: 5 },
      backups_size: { total: '0.00', max: null },
    }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [row], meta: { usage } } })

    const result = await getBackups(9)

    expect(api.get).toHaveBeenCalledWith('/instances/9/wordpress/backups')
    expect(result).toEqual({ data: [row], usage })
  })

  it('returns an empty usage when the response has no meta', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [] } })

    expect(await getBackups(9)).toEqual({ data: [], usage: {} })
  })

  it('lets a failed request reject, so the caller can handle it', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'))

    await expect(getBackups(9)).rejects.toThrow('boom')
  })

  it('sends the restore flags as JSON booleans to the restore path', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })

    await restoreBackup(9, 3, { restoreDatabase: true, restoreDirectory: false, deleteExistingFiles: true })

    expect(api.put).toHaveBeenCalledWith('/instances/9/wordpress/backups/3/restore', {
      restoreDatabase: true,
      restoreDirectory: false,
      deleteExistingFiles: true,
    })
  })

  it('encodes the ids in the restore path', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })

    await restoreBackup(9, '1/2' as unknown as number, { restoreDatabase: true, restoreDirectory: false, deleteExistingFiles: false })

    expect(api.put).toHaveBeenCalledWith('/instances/9/wordpress/backups/1%2F2/restore', expect.anything())
  })

  it('lets a failed restore reject', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('restore failed'))

    await expect(restoreBackup(9, 3, { restoreDatabase: true, restoreDirectory: true, deleteExistingFiles: true })).rejects.toThrow('restore failed')
  })

  it('deletes the backup at its path', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ data: {} })

    await deleteBackup(9, 3)

    expect(api.delete).toHaveBeenCalledWith('/instances/9/wordpress/backups/3')
  })

  it('lets a failed delete reject', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new Error('delete failed'))

    await expect(deleteBackup(9, 3)).rejects.toThrow('delete failed')
  })
})
