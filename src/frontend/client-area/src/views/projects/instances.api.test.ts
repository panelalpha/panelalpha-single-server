import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { api } from '@/shared/api/client'
import { buildListQuery, listInstances, screenshotUrl } from './instances.api'

vi.mock('@/shared/api/client', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    defaults: { baseURL: '/api' },
  },
  apiBaseUrl: () => '/api',
}))

describe('instances.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCachedGet()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('buildListQuery', () => {
    it('defaults to page 1, per_page 8, created_at desc and no server_account_id', () => {
      expect(buildListQuery({})).toEqual({
        page: 1,
        per_page: 8,
        sort_by: 'created_at',
        sort_dir: 'desc',
      })
    })

    it('adds search_term and comma-joined labels only when set', () => {
      expect(buildListQuery({
        page: 2,
        perPage: 16,
        sortBy: 'name',
        sortDir: 'asc',
        searchTerm: 'blog',
        labels: ['prod', 'vip'],
      })).toEqual({
        page: 2,
        per_page: 16,
        sort_by: 'name',
        sort_dir: 'asc',
        search_term: 'blog',
        labels: 'prod,vip',
      })
      expect(buildListQuery({ searchTerm: '', labels: [] })).not.toHaveProperty('search_term')
      expect(buildListQuery({ searchTerm: '', labels: [] })).not.toHaveProperty('labels')
    })
  })

  describe('listInstances', () => {
    it('lists instances with default per_page=8 and maps them to resources', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 1,
              name: 'Demo',
              url: 'https://demo.example',
              status: 'active',
              screenshot_time: 5,
              labels: [],
              shared_access: [],
              owned: true,
              privileges: [],
              staging_apps: [],
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          meta: { total: 1, per_page: 8, current_page: 1 },
        },
      })

      const result = await listInstances()

      expect(api.get).toHaveBeenCalledWith('/instances', {
        params: { page: 1, per_page: 8, sort_by: 'created_at', sort_dir: 'desc' },
      })
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.title).toBe('Demo')
      expect(result.data[0]!.hasInstallStatus()).toBe(false)
      expect(result.data[0]!.screenshot_url).toBe('/api/instances/1/screenshot.jpg?time=5')
      expect(result.meta.total).toBe(1)
    })

    it('forwards search and labels in the query', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [], meta: { total: 0 } } })

      await listInstances({
        page: 3,
        perPage: 16,
        sortBy: 'name',
        sortDir: 'asc',
        searchTerm: 'acme',
        labels: ['prod'],
      })

      expect(api.get).toHaveBeenCalledWith('/instances', {
        params: { page: 3, per_page: 16, sort_by: 'name', sort_dir: 'asc', search_term: 'acme', labels: 'prod' },
      })
    })

    it('uses the single-server path for screenshots when /home says so', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { data: [{ id: 2, name: 'P', url: 'https://p.example', screenshot_time: 9 }], meta: { total: 1 } },
      })

      const result = await listInstances({ home: { app: { single_server: { active: true } } } })

      expect(result.data[0]!.screenshot_url).toBe('/api/projects/2/screenshot.jpg?time=9')
    })
  })

  describe('screenshotUrl', () => {
    it('builds the legacy screenshot url', () => {
      expect(screenshotUrl(4, 12)).toBe('/api/instances/4/screenshot.jpg?time=12')
      expect(screenshotUrl(4, 12, true)).toBe('/api/projects/4/screenshot.jpg?time=12')
    })
  })
})
