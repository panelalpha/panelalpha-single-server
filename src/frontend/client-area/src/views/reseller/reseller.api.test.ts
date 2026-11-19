import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import {
  createResellerApiToken,
  deleteResellerApiToken,
  deleteResellerUser,
  getBrandingSettings,
  listResellerApiTokens,
  listResellerInstancesLogs,
  listResellerUserInstances,
  listResellerUsers,
  updateBrandingSettings,
} from './reseller.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
  apiBaseUrl: () => '/api',
}))

describe('reseller.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('listResellerUsers gets /reseller/users and returns data.data', async () => {
    const users = [{ id: 1, name: 'Ann', email: 'ann@example.com', instances_count: 2 }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: users } })

    await expect(listResellerUsers()).resolves.toEqual(users)
    expect(api.get).toHaveBeenCalledWith('/reseller/users')
  })

  it('listResellerUserInstances gets the user instances and maps every item through the instance mapper', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [{ id: 7, name: 'Shop', url: 'https://shop.example.com' }, { id: 8, name: 'Blog', url: 'https://blog.example.com' }] },
    })

    const instances = await listResellerUserInstances(5)

    expect(api.get).toHaveBeenCalledWith('/reseller/users/5/instances')
    expect(instances.map(item => [item.id, item.title, item.url])).toEqual([
      [7, 'Shop', 'https://shop.example.com'],
      [8, 'Blog', 'https://blog.example.com'],
    ])
  })

  it('deleteResellerUser deletes /reseller/users/{id} and returns data.data', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { data: { id: 5 } } })

    await expect(deleteResellerUser(5)).resolves.toEqual({ id: 5 })
    expect(api.delete).toHaveBeenCalledWith('/reseller/users/5')
  })

  describe('listResellerInstancesLogs', () => {
    const query = { page: 2, perPage: 50, sortBy: 'date', sortDir: 'desc' as const }

    it('builds the query in legacy order without a search term when it is empty', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } })

      await listResellerInstancesLogs({ ...query, searchTerm: '' })

      expect(api.get).toHaveBeenCalledWith('/reseller/instances-logs?page=2&per_page=50&sort_by=date&sort_dir=desc')
    })

    it('appends the encoded search term last', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } })

      await listResellerInstancesLogs({ ...query, searchTerm: 'a b&c#d' })

      expect(api.get).toHaveBeenCalledWith('/reseller/instances-logs?page=2&per_page=50&sort_by=date&sort_dir=desc&search_term=a+b%26c%23d')
    })

    it('reads the total from data.total, then meta.total, then falls back to 0', async () => {
      const rows = [{ id: 1 }]
      vi.mocked(api.get).mockResolvedValueOnce({ data: { data: rows, total: 7, meta: { total: 3 } } })
      await expect(listResellerInstancesLogs(query)).resolves.toEqual({ items: rows, total: 7 })

      vi.mocked(api.get).mockResolvedValueOnce({ data: { data: rows, meta: { total: 3 } } })
      await expect(listResellerInstancesLogs(query)).resolves.toEqual({ items: rows, total: 3 })

      vi.mocked(api.get).mockResolvedValueOnce({ data: { data: rows } })
      await expect(listResellerInstancesLogs(query)).resolves.toEqual({ items: rows, total: 0 })
    })
  })

  it('listResellerApiTokens gets /reseller/api-tokens and returns data.data', async () => {
    const tokens = [{ id: 1, name: 'CI', last_used_at: null, created_at: '2026-10-01T10:00:00Z' }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: tokens } })

    await expect(listResellerApiTokens()).resolves.toEqual(tokens)
    expect(api.get).toHaveBeenCalledWith('/reseller/api-tokens')
  })

  it('createResellerApiToken posts the name as typed and returns data.data', async () => {
    const created = { id: 2, name: ' CI ', last_used_at: null, created_at: '2026-10-02T10:00:00Z', plain_text_token: '2|abc' }
    vi.mocked(api.post).mockResolvedValue({ data: { data: created } })

    await expect(createResellerApiToken(' CI ')).resolves.toEqual(created)
    expect(api.post).toHaveBeenCalledWith('/reseller/api-tokens', { name: ' CI ' })
  })

  it('deleteResellerApiToken deletes /reseller/api-tokens/{id} and returns data.data', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { data: { id: 2 } } })

    await expect(deleteResellerApiToken(2)).resolves.toEqual({ id: 2 })
    expect(api.delete).toHaveBeenCalledWith('/reseller/api-tokens/2')
  })

  it('getBrandingSettings gets /reseller/branding-settings and keeps only brand_name and domain', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { brand_name: 'Acme', domain: 'acme.io', extra: 1 } } })

    await expect(getBrandingSettings()).resolves.toEqual({ brand_name: 'Acme', domain: 'acme.io' })
    expect(api.get).toHaveBeenCalledWith('/reseller/branding-settings')
  })

  it('updateBrandingSettings puts the settings to /reseller/branding-settings', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} })
    const settings = { brand_name: 'Acme', domain: 'acme.io' }

    await expect(updateBrandingSettings(settings)).resolves.toBeUndefined()
    expect(api.put).toHaveBeenCalledWith('/reseller/branding-settings', settings)
  })
})
