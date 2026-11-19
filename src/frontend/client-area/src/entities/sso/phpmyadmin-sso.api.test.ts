import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { getPhpMyAdminPreviewSsoUrl, getPhpMyAdminSsoUrl, listPhpMyAdminDatabases } from './phpmyadmin-sso.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

describe('phpmyadmin-sso.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listPhpMyAdminDatabases maps each database to its Plesk id and name', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: 5, database: 'example_shop' }, { id: 6, database: 'example_blog' }] },
    })
    await expect(listPhpMyAdminDatabases(11)).resolves.toEqual([
      { value: 5, label: 'example_shop' },
      { value: 6, label: 'example_blog' },
    ])
    expect(api.get).toHaveBeenCalledWith('/server-accounts/11/mysql/databases')
  })

  it('listPhpMyAdminDatabases answers an empty list when the body has no data', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} })
    await expect(listPhpMyAdminDatabases(11)).resolves.toEqual([])
  })

  it('getPhpMyAdminSsoUrl posts without a body for a non-Plesk server', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { url: 'https://pma.example.com/sso' } } })
    await expect(getPhpMyAdminSsoUrl(11)).resolves.toBe('https://pma.example.com/sso')
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/mysql/phpmyadmin-sso-url')
  })

  it('getPhpMyAdminSsoUrl posts the database id as database_id', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { url: 'https://pma.example.com/sso' } } })
    await getPhpMyAdminSsoUrl(11, 5)
    expect(api.post).toHaveBeenCalledWith('/server-accounts/11/mysql/phpmyadmin-sso-url', { database_id: 5 })
  })

  it('getPhpMyAdminPreviewSsoUrl posts to the preview endpoint, with the database id when given', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { url: 'https://pma.example.com/preview' } } })
    await expect(getPhpMyAdminPreviewSsoUrl(11)).resolves.toBe('https://pma.example.com/preview')
    expect(api.post).toHaveBeenLastCalledWith('/server-accounts/11/mysql/phpmyadmin-preview-sso-url')

    await getPhpMyAdminPreviewSsoUrl(11, 6)
    expect(api.post).toHaveBeenLastCalledWith('/server-accounts/11/mysql/phpmyadmin-preview-sso-url', { database_id: 6 })
  })
})
