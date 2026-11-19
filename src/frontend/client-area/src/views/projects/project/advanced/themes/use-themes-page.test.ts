import type { Ref } from 'vue'
import type { InstanceResource } from '@/entities/project/instance-resource'
import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { fetchFeaturedThemes, fetchThemes, searchThemes } from '@/entities/project/instance-themes.api'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { useThemesPage } from './use-themes-page'

vi.mock('@/entities/project/instance-themes.api', () => ({
  fetchThemes: vi.fn(),
  fetchFeaturedThemes: vi.fn(),
  searchThemes: vi.fn(),
}))

function theme (index: number, overrides: Partial<InstalledTheme> = {}): InstalledTheme {
  const name = `theme-${String(index).padStart(2, '0')}`
  return { name, title: name, status: 'inactive', version: '1.0.0', ...overrides }
}

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise(done => setTimeout(done, 0))

function makeInstance () {
  return ref({ id: 7 }) as unknown as Ref<InstanceResource>
}

// The page subscribes to events for the life of its effect scope (in the view, the component), so tests run it inside one.
function mountPage (instance: Ref<InstanceResource>) {
  return effectScope().run(() => useThemesPage(instance))!
}

describe('useThemesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAppEvents()
  })

  it('shows the skeleton on the first load, then loads the list and stops loading', async () => {
    const list = [theme(1), theme(2)]
    vi.mocked(fetchThemes).mockResolvedValueOnce(list)
    const page = mountPage(makeInstance())

    expect(page.itemsLoading.value).toBe(true)
    await page.loadData()

    expect(fetchThemes).toHaveBeenCalledWith(7)
    expect(page.allItems.value).toEqual(list)
    expect(page.itemsLoading.value).toBe(false)
  })

  it('does not show the skeleton again on a reload after an action', async () => {
    vi.mocked(fetchThemes).mockResolvedValueOnce([theme(1)])
    const page = mountPage(makeInstance())
    await page.loadData()

    const reload = deferred<InstalledTheme[]>()
    vi.mocked(fetchThemes).mockReturnValueOnce(reload.promise)
    const pending = page.loadData()

    expect(page.itemsLoading.value).toBe(false)
    reload.resolve([theme(1), theme(2)])
    await pending
    expect(page.allItems.value).toHaveLength(2)
    expect(page.itemsLoading.value).toBe(false)
  })

  it('swallows a failed GET without UI, keeps the list and ends the loading state', async () => {
    vi.mocked(fetchThemes).mockRejectedValueOnce(new Error('network'))
    const page = mountPage(makeInstance())

    await expect(page.loadData()).resolves.toBeUndefined()
    expect(page.allItems.value).toEqual([])
    expect(page.itemsLoading.value).toBe(false)
  })

  it('keeps the list from before a failed reload', async () => {
    const list = [theme(1)]
    vi.mocked(fetchThemes).mockResolvedValueOnce(list)
    const page = mountPage(makeInstance())
    await page.loadData()

    vi.mocked(fetchThemes).mockRejectedValueOnce(new Error('network'))
    await page.loadData()
    expect(page.allItems.value).toEqual(list)
  })

  it('lets a newer load win over an older one that answers later', async () => {
    const older = deferred<InstalledTheme[]>()
    const newer = deferred<InstalledTheme[]>()
    vi.mocked(fetchThemes).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const page = mountPage(makeInstance())

    const first = page.loadData()
    const second = page.loadData()
    newer.resolve([theme(2)])
    await second
    older.resolve([theme(1)])
    await first

    expect(page.allItems.value).toEqual([theme(2)])
  })

  it('cuts six themes per page and reports the whole length', async () => {
    vi.mocked(fetchThemes).mockResolvedValueOnce(Array.from({ length: 8 }, (_, index) => theme(index + 1)))
    const page = mountPage(makeInstance())
    await page.loadData()

    expect(page.items.value).toHaveLength(6)
    expect(page.itemsTotal.value).toBe(8)
    expect(page.itemsPerPage.value).toBe(6)
    expect(page.possibleItemsPerPage).toEqual([[6, 12, 24]])
  })

  it('pages, sorts and searches the list without fetching again', async () => {
    vi.mocked(fetchThemes).mockResolvedValueOnce(Array.from({ length: 8 }, (_, index) => theme(index + 1)))
    const page = mountPage(makeInstance())
    await page.loadData()

    page.changePage(2)
    expect(page.items.value.map(item => item.name)).toEqual(['theme-07', 'theme-08'])

    page.changeSortDesc(true)
    expect(page.page.value).toBe(1)
    expect(page.items.value[0]?.name).toBe('theme-08')

    page.handleSearchTermChange('theme-03')
    expect(page.itemsTotal.value).toBe(1)
    expect(page.page.value).toBe(1)

    await flush()
    expect(fetchThemes).toHaveBeenCalledTimes(1)
  })

  it('clamps the page when a search leaves fewer pages', async () => {
    vi.mocked(fetchThemes).mockResolvedValueOnce(Array.from({ length: 8 }, (_, index) => theme(index + 1)))
    const page = mountPage(makeInstance())
    await page.loadData()

    page.changePage(2)
    page.searchTerm.value = 'theme-0'
    await flush()
    expect(page.page.value).toBe(2)

    page.searchTerm.value = 'theme-01'
    await flush()
    expect(page.page.value).toBe(1)
  })

  describe('theme-item-changed (Echo)', () => {
    it('replaces the theme in the full list and keeps the others', async () => {
      const list = [theme(1), theme(2), theme(3)]
      vi.mocked(fetchThemes).mockResolvedValueOnce(list)
      const page = mountPage(makeInstance())
      await page.loadData()

      emit('theme-item-changed', { ...theme(2), status: 'active', async_status: { update: 'finished' } })

      expect(page.allItems.value[1]).toMatchObject({ name: 'theme-02', status: 'active' })
      expect(page.allItems.value[0]).toEqual(list[0])
      expect(page.allItems.value[2]).toEqual(list[2])
    })

    it('keeps the new status after a sort change and a page change', async () => {
      vi.mocked(fetchThemes).mockResolvedValueOnce(Array.from({ length: 8 }, (_, index) => theme(index + 1)))
      const page = mountPage(makeInstance())
      await page.loadData()

      emit('theme-item-changed', { ...theme(7), status: 'active' })
      page.changeSortDesc(true)
      expect(page.items.value[0]).toMatchObject({ name: 'theme-07', status: 'active' })

      page.changePage(2)
      page.changePage(1)
      expect(page.items.value[0]).toMatchObject({ name: 'theme-07', status: 'active' })
      expect(page.allItems.value.find(item => item.name === 'theme-07')?.status).toBe('active')
    })

    it('ignores a payload without a name', async () => {
      vi.mocked(fetchThemes).mockResolvedValueOnce([theme(1), theme(2)])
      const page = mountPage(makeInstance())
      await page.loadData()
      const before = page.allItems.value

      emit('theme-item-changed', { status: 'active' })
      emit('theme-item-changed', { name: '', status: 'active' })

      expect(page.allItems.value).toBe(before)
    })

    it('ignores a theme of another instance and applies one of this instance', async () => {
      vi.mocked(fetchThemes).mockResolvedValueOnce([theme(1), theme(2)])
      const page = mountPage(makeInstance())
      await page.loadData()
      const before = page.allItems.value

      emit('theme-item-changed', { ...theme(1), status: 'active', application_id: 8 })
      expect(page.allItems.value).toBe(before)

      emit('theme-item-changed', { ...theme(1), status: 'active', application_id: 7 })
      expect(page.allItems.value[0]).toMatchObject({ name: 'theme-01', status: 'active' })
    })

    it('ignores a catalogue patch of another instance', async () => {
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce([repo('astra')])
      const page = mountPage(makeInstance())
      page.openAddNew()
      await flush()

      emit('theme-item-changed', { name: 'astra', slug: 'astra', application_id: 8, async_status: { install: 'pending' } })

      expect(page.newThemes.allItems[0]?.async_status).toBeUndefined()
    })

    it('stops listening when the page scope is disposed', async () => {
      vi.mocked(fetchThemes).mockResolvedValueOnce([theme(1)])
      const scope = effectScope()
      const page = scope.run(() => useThemesPage(makeInstance()))!
      await page.loadData()

      scope.stop()
      emit('theme-item-changed', { ...theme(1), status: 'active' })

      expect(page.allItems.value[0]?.status).toBe('inactive')
    })

    it('patches the install status on the catalogue entry with that slug (the install spinner)', async () => {
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce([repo('astra'), repo('hello-elementor')])
      const page = mountPage(makeInstance())
      page.openAddNew()
      await flush()

      emit('theme-item-changed', { name: 'hello-elementor', slug: 'hello-elementor', async_status: { install: 'pending' } })

      expect(page.newThemes.allItems[1]?.async_status).toEqual({ install: 'pending' })
      expect(page.newThemes.allItems[0]?.async_status).toBeUndefined()
    })
  })

  describe('Add New', () => {
    it('loads the featured list when Add New opens, with an empty term and the ribbon on', async () => {
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce([repo('featured-a')])
      const page = mountPage(makeInstance())

      page.openAddNew()
      await flush()

      expect(fetchFeaturedThemes).toHaveBeenCalledWith(7)
      expect(page.addThemes.value).toBe(true)
      expect(page.newThemes.searchTerm).toBe('')
      expect(page.newThemes.featured).toBe(true)
      expect(page.newThemes.items.map(item => item.slug)).toEqual(['featured-a'])
    })

    it('resets a term left from the last visit when Add New opens again', async () => {
      vi.mocked(searchThemes).mockResolvedValueOnce([repo('seo-theme')])
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce([repo('featured-b')])
      const page = mountPage(makeInstance())
      page.searchNew('seo')
      await flush()

      page.closeAddNew()
      page.openAddNew()
      await flush()

      expect(page.newThemes.searchTerm).toBe('')
      expect(page.newThemes.featured).toBe(true)
      expect(page.newThemes.items.map(item => item.slug)).toEqual(['featured-b'])
    })

    it('searches for a term and shows the result as a non-featured list', async () => {
      vi.mocked(searchThemes).mockResolvedValueOnce([repo('seo-theme')])
      const page = mountPage(makeInstance())

      page.searchNew('seo')
      await flush()

      expect(searchThemes).toHaveBeenCalledWith(7, 'seo')
      expect(page.newThemes.featured).toBe(false)
      expect(page.newThemes.allItems.map(item => item.slug)).toEqual(['seo-theme'])
    })

    it('ignores a slow answer to an older term when a newer term has answered', async () => {
      const older = deferred<RepositoryTheme[]>()
      const newer = deferred<RepositoryTheme[]>()
      vi.mocked(searchThemes)
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise)
      const page = mountPage(makeInstance())

      page.searchNew('a')
      page.searchNew('ab')
      newer.resolve([repo('ab-theme')])
      await flush()
      older.resolve([repo('a-theme')])
      await flush()

      expect(page.newThemes.allItems.map(item => item.slug)).toEqual(['ab-theme'])
    })

    it('loads the featured list after an empty term, and a late search answer does not replace it', async () => {
      const search = deferred<RepositoryTheme[]>()
      vi.mocked(searchThemes).mockReturnValueOnce(search.promise)
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce([repo('featured-c')])
      const page = mountPage(makeInstance())

      page.searchNew('x')
      page.searchNew('')
      await flush()
      search.resolve([repo('x-theme')])
      await flush()

      expect(fetchFeaturedThemes).toHaveBeenCalledWith(7)
      expect(page.newThemes.featured).toBe(true)
      expect(page.newThemes.allItems.map(item => item.slug)).toEqual(['featured-c'])
      expect(page.newThemes.loading).toBe(false)
    })

    it('hides the installed themes from the catalogue and reports the total before that filter', async () => {
      vi.mocked(fetchThemes).mockResolvedValueOnce([theme(1)])
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce([repo('theme-01'), repo('other')])
      const page = mountPage(makeInstance())
      await page.loadData()

      page.openAddNew()
      await flush()

      expect(page.newThemes.items.map(item => item.slug)).toEqual(['other'])
      expect(page.newThemes.itemsTotal).toBe(2)
      expect(page.newThemes.empty).toBe(false)
    })

    it('reports the empty state when every catalogue theme is installed already', async () => {
      vi.mocked(fetchThemes).mockResolvedValueOnce([theme(1)])
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce([repo('theme-01')])
      const page = mountPage(makeInstance())
      await page.loadData()

      page.openAddNew()
      await flush()

      expect(page.newThemes.empty).toBe(true)
    })

    it('keeps the add-new page to six themes, sorted by rating', async () => {
      vi.mocked(fetchFeaturedThemes).mockResolvedValueOnce(Array.from({ length: 8 }, (_, index) => repo(`theme-${index}`, { rating: index * 10 })))
      const page = mountPage(makeInstance())

      page.openAddNew()
      await flush()

      expect(page.newThemes.items).toHaveLength(6)
      expect(page.newThemes.items[0]?.slug).toBe('theme-7')
      expect(page.newThemes.itemsTotal).toBe(8)
      expect(page.newThemes.itemsPerPage).toBe(6)
    })
  })
})

function repo (slug: string, overrides: Partial<RepositoryTheme> = {}): RepositoryTheme {
  return { id: slug, slug, name: slug, version: '1.0.0', rating: 0, ...overrides }
}
