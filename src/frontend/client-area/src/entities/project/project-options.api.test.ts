import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { listProjectOptions } from './project-options.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn() },
}))

describe('project-options.api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('maps id and name, flattens staging apps and sorts by name', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        data: [
          { id: 2, name: 'Zeta', staging_apps: [{ id: 5, name: 'Beta staging' }] },
          { id: 1, name: 'Alpha', staging_apps: null, domain: 'ignored' },
        ],
        meta: { total: 2 },
      },
    })

    await expect(listProjectOptions()).resolves.toEqual([
      { id: 1, name: 'Alpha' },
      { id: 5, name: 'Beta staging' },
      { id: 2, name: 'Zeta' },
    ])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/instances', { params: { page: 1, per_page: 100 } })
  })

  it('reads the next pages until meta.total is reached', async () => {
    const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: from + i, name: `P${from + i}` }))
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: rows(1, 100), meta: { total: 130 } } })
      .mockResolvedValueOnce({ data: { data: rows(101, 30), meta: { total: 130 } } })

    const options = await listProjectOptions()

    expect(options).toHaveLength(130)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenLastCalledWith('/instances', { params: { page: 2, per_page: 100 } })
  })

  it('stops on an empty page even when meta.total says more', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: [{ id: 1, name: 'A' }], meta: { total: 5 } } })
      .mockResolvedValueOnce({ data: { data: [], meta: { total: 5 } } })

    await expect(listProjectOptions()).resolves.toEqual([{ id: 1, name: 'A' }])
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('returns an empty list when the request fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'))

    await expect(listProjectOptions()).resolves.toEqual([])
  })

  it('keeps the projects of the pages read before a failed later page', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: [{ id: 2, name: 'B' }, { id: 1, name: 'A' }], meta: { total: 150 } } })
      .mockRejectedValueOnce(new Error('boom'))

    await expect(listProjectOptions()).resolves.toEqual([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
