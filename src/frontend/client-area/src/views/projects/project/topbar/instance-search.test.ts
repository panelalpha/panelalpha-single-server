import type { HomeLike, InstanceResource } from '@/entities/project/instance-resource'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listInstances } from '@/views/projects/instances.api'
import { fetchInstanceSearch, SEARCH_DEBOUNCE_MS } from './instance-search'

vi.mock('@/views/projects/instances.api', () => ({ listInstances: vi.fn() }))

const home = { app: { name: 'PanelAlpha' } } as unknown as HomeLike

describe('fetchInstanceSearch', () => {
  beforeEach(() => {
    vi.mocked(listInstances).mockReset()
  })

  it('uses the legacy list query: first page of 10, by name ascending, with the term', async () => {
    vi.mocked(listInstances).mockResolvedValueOnce({ data: [], meta: {} })

    await fetchInstanceSearch('blog', home)

    expect(listInstances).toHaveBeenCalledWith({
      page: 1,
      perPage: 10,
      sortBy: 'name',
      sortDir: 'asc',
      searchTerm: 'blog',
      home,
    })
  })

  it('returns the items when the list is not empty', async () => {
    const items = [{ id: 1 }, { id: 2 }] as unknown as InstanceResource[]
    vi.mocked(listInstances).mockResolvedValueOnce({ data: items, meta: {} })

    await expect(fetchInstanceSearch('', home)).resolves.toEqual({ error: false, items })
  })

  it('reports "not found" for an empty list, as legacy does', async () => {
    vi.mocked(listInstances).mockResolvedValueOnce({ data: [], meta: {} })

    await expect(fetchInstanceSearch('zzz', home)).resolves.toEqual({ error: true, items: [] })
  })

  it('reports "not found" when the request fails', async () => {
    vi.mocked(listInstances).mockRejectedValueOnce(new Error('boom'))

    await expect(fetchInstanceSearch('blog', home)).resolves.toEqual({ error: true, items: [] })
  })

  it('keeps the legacy debounce of 300 ms', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300)
  })
})
