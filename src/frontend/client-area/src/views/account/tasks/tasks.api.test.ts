import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { listFreeTasks } from './tasks.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn() },
}))

describe('free.api listFreeTasks', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sends page and per_page only when no filter is set', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], meta: {} } })

    await listFreeTasks({ page: 1, perPage: 50, status: '', action: '' })

    expect(api.get).toHaveBeenCalledWith('/community/tasks', { params: { page: 1, per_page: 50 } })
  })

  it('adds status and action when they are set', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], meta: {} } })

    await listFreeTasks({ page: 2, perPage: 15, status: 'failed', action: 'backup' })

    expect(api.get).toHaveBeenCalledWith('/community/tasks', {
      params: { page: 2, per_page: 15, status: 'failed', action: 'backup' },
    })
  })

  it('adds project only when it is set', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], meta: {} } })

    await listFreeTasks({ page: 1, perPage: 50, project: 7 })
    expect(api.get).toHaveBeenLastCalledWith('/community/tasks', { params: { page: 1, per_page: 50, project: 7 } })

    await listFreeTasks({ page: 1, perPage: 50, project: undefined })
    expect(api.get).toHaveBeenLastCalledWith('/community/tasks', { params: { page: 1, per_page: 50 } })
  })

  it('maps the rows and the meta', async () => {
    const items = [{ id: 1 }]
    vi.mocked(api.get).mockResolvedValue({ data: { data: items, meta: { total: 7, last_page: 3 } } })

    await expect(listFreeTasks({ page: 1, perPage: 50 })).resolves.toEqual({ items, total: 7, lastPage: 3 })
  })

  it('falls back to an empty list, total 0 and last page 1', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { meta: { total: 0, last_page: 0 } } })

    await expect(listFreeTasks({ page: 1, perPage: 50 })).resolves.toEqual({ items: [], total: 0, lastPage: 1 })
  })
})
