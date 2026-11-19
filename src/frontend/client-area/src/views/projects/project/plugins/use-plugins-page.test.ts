import type { Ref } from 'vue'
import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { fetchFeaturedPlugins, fetchPlugins, searchPlugins } from '@/entities/project/instance-plugins.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { usePluginsPage } from './use-plugins-page'

vi.mock('@/entities/project/instance-plugins.api', () => ({
  fetchPlugins: vi.fn(),
  fetchFeaturedPlugins: vi.fn(),
  searchPlugins: vi.fn(),
}))

function repo (slug: string): RepositoryPlugin {
  return {
    id: slug,
    type: 'plugin',
    name: slug,
    slug,
    version: '1.0.0',
    short_description: '',
    status: 'publish',
    tested: '6.5',
    rating: 0,
    active_installs: 0,
    last_updated: '2026-01-01',
  }
}

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

const flush = () => new Promise(done => setTimeout(done, 0))

function plugin (index: number, overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  const name = `plugin-${String(index).padStart(2, '0')}`
  return { name, title: name, description: '', version: '1.0.0', status: 'inactive', ...overrides }
}

function makeInstance () {
  const setPluginsData = vi.fn()
  const setPluginItem = vi.fn()
  const instance = ref({ id: 7, setPluginsData, setPluginItem }) as unknown as Ref<InstanceResource>
  return { instance, setPluginsData, setPluginItem }
}

// The page subscribes to Echo for the life of its effect scope (in the view, the component), so tests run it inside one.
function mountPage (instance: Ref<InstanceResource>) {
  return effectScope().run(() => usePluginsPage(instance))!
}

describe('usePluginsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    resetAppEvents()
  })

  it('starts loading, then loads the list, hands it to the instance and stops loading', async () => {
    const list = [plugin(1), plugin(2)]
    vi.mocked(fetchPlugins).mockResolvedValueOnce(list)
    const { instance, setPluginsData } = makeInstance()
    const page = mountPage(instance)

    expect(page.itemsLoading.value).toBe(true)
    await page.loadData()

    expect(fetchPlugins).toHaveBeenCalledWith(7)
    expect(page.allItems.value).toEqual(list)
    expect(setPluginsData).toHaveBeenCalledWith(list)
    expect(page.itemsLoading.value).toBe(false)
  })

  it('cuts eight plugins per page and reports the whole length', async () => {
    vi.mocked(fetchPlugins).mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => plugin(index)))
    const { instance } = makeInstance()
    const page = mountPage(instance)
    await page.loadData()

    expect(page.items.value).toHaveLength(8)
    expect(page.itemsTotal.value).toBe(10)

    page.changePage(2)
    expect(page.items.value.map(item => item.name)).toEqual(['plugin-08', 'plugin-09'])
  })

  it('takes itemsTotal after the search filter', async () => {
    vi.mocked(fetchPlugins).mockResolvedValueOnce([
      plugin(1, { title: 'Akismet' }),
      plugin(2, { title: 'Hello Dolly' }),
      plugin(3, { title: 'Akita' }),
    ])
    const { instance } = makeInstance()
    const page = mountPage(instance)
    await page.loadData()

    page.handleSearchTermChange('ak')

    expect(page.itemsTotal.value).toBe(2)
    expect(page.items.value).toHaveLength(2)
  })

  it('goes back to page 1 when the search changes', async () => {
    vi.mocked(fetchPlugins).mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => plugin(index)))
    const { instance } = makeInstance()
    const page = mountPage(instance)
    await page.loadData()
    page.changePage(3)

    page.handleSearchTermChange('plugin-1')

    expect(page.page.value).toBe(1)
  })

  it('clamps the page when the list shrinks under it', async () => {
    vi.mocked(fetchPlugins)
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => plugin(index)))
      .mockResolvedValueOnce([plugin(0)])
    const { instance } = makeInstance()
    const page = mountPage(instance)
    await page.loadData()
    page.changePage(3)

    await page.loadData()
    await nextTick()

    expect(page.page.value).toBe(1)
    expect(page.items.value).toHaveLength(1)
  })

  it('goes back to page 1 when the page size changes', async () => {
    vi.mocked(fetchPlugins).mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => plugin(index)))
    const { instance } = makeInstance()
    const page = mountPage(instance)
    await page.loadData()
    page.changePage(2)

    page.changePerPage(16)

    expect(page.page.value).toBe(1)
    expect(page.items.value).toHaveLength(16)
  })

  it('does not hand the instance a list when the load fails, and shows the error as an alert', async () => {
    vi.mocked(fetchPlugins).mockRejectedValueOnce(new Error('network down'))
    const { instance, setPluginsData } = makeInstance()
    const page = mountPage(instance)

    await expect(page.loadData()).resolves.toBeUndefined()

    expect(setPluginsData).not.toHaveBeenCalled()
    expect(page.allItems.value).toEqual([])
    expect(page.itemsLoading.value).toBe(false)
    expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Something went wrong. Please try again.' })])
  })

  it('drops a slow answer to an older load when a newer one has landed', async () => {
    const slow = deferred<InstalledPlugin[]>()
    vi.mocked(fetchPlugins).mockReturnValueOnce(slow.promise).mockResolvedValueOnce([plugin(2)])
    const { instance, setPluginsData } = makeInstance()
    const page = mountPage(instance)

    const first = page.loadData()
    await page.loadData()
    slow.resolve([plugin(1)])
    await first

    expect(page.allItems.value.map(item => item.name)).toEqual(['plugin-02'])
    expect(setPluginsData).toHaveBeenCalledOnce()
  })

  it('keeps the list a delete answered with when an older load lands after it', async () => {
    const slow = deferred<InstalledPlugin[]>()
    vi.mocked(fetchPlugins).mockReturnValueOnce(slow.promise)
    const { instance, setPluginsData } = makeInstance()
    const page = mountPage(instance)

    const pending = page.loadData()
    page.setItems([plugin(2)])
    slow.resolve([plugin(1), plugin(2)])
    await pending

    expect(page.allItems.value.map(item => item.name)).toEqual(['plugin-02'])
    expect(setPluginsData).toHaveBeenCalledExactlyOnceWith([plugin(2)])
    expect(page.itemsLoading.value).toBe(false)
  })

  describe('plugin-item-changed (Echo)', () => {
    it('replaces the plugin in the full list and hands it to the instance', async () => {
      const list = [plugin(1), plugin(2), plugin(3)]
      vi.mocked(fetchPlugins).mockResolvedValueOnce(list)
      const { instance, setPluginItem } = makeInstance()
      const page = mountPage(instance)
      await page.loadData()

      emit('plugin-item-changed', { ...plugin(2), status: 'active', async_status: { update: 'finished' } })

      expect(page.allItems.value[1]).toMatchObject({ name: 'plugin-02', status: 'active' })
      expect(page.allItems.value[0]).toEqual(list[0])
      expect(setPluginItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'plugin-02', status: 'active' }))
      expect(page.items.value.find(item => item.name === 'plugin-02')?.status).toBe('active')
    })

    it('keeps the new status after the sort changes', async () => {
      vi.mocked(fetchPlugins).mockResolvedValueOnce([plugin(1, { title: 'Beta' }), plugin(2, { title: 'Alpha' })])
      const { instance } = makeInstance()
      const page = mountPage(instance)
      await page.loadData()

      emit('plugin-item-changed', { ...plugin(1, { title: 'Beta' }), status: 'active' })
      page.changeSortDesc(true)

      expect(page.items.value.map(item => item.name)).toEqual(['plugin-01', 'plugin-02'])
      expect(page.items.value[0]?.status).toBe('active')
    })

    it('puts the install status on the catalogue entry with that slug (the install spinner)', async () => {
      vi.mocked(fetchFeaturedPlugins).mockResolvedValueOnce([repo('akismet'), repo('hello-dolly')])
      const { instance } = makeInstance()
      const page = mountPage(instance)
      page.openAddNew()
      await flush()

      emit('plugin-item-changed', { ...repo('hello-dolly'), async_status: { install: 'pending' } })

      expect(page.newPlugins.allItems[1]?.async_status).toEqual({ install: 'pending' })
      expect(page.newPlugins.allItems[0]?.async_status).toBeUndefined()
    })

    it('ignores a payload without a name', async () => {
      vi.mocked(fetchPlugins).mockResolvedValueOnce([plugin(1)])
      const { instance, setPluginItem } = makeInstance()
      const page = mountPage(instance)
      await page.loadData()
      const before = page.allItems.value

      emit('plugin-item-changed', { status: 'active' })

      expect(page.allItems.value).toBe(before)
      expect(setPluginItem).not.toHaveBeenCalled()
    })

    it('stops listening when the page is disposed', async () => {
      vi.mocked(fetchPlugins).mockResolvedValueOnce([plugin(1)])
      const { instance, setPluginItem } = makeInstance()
      const scope = effectScope()
      const page = scope.run(() => usePluginsPage(instance))!
      await page.loadData()

      scope.stop()
      emit('plugin-item-changed', { ...plugin(1), status: 'active' })

      expect(setPluginItem).not.toHaveBeenCalled()
      expect(page.allItems.value[0]?.status).toBe('inactive')
    })
  })

  describe('Add New', () => {
    it('loads the featured list when Add New opens, with an empty term and the ribbon on', async () => {
      vi.mocked(fetchFeaturedPlugins).mockResolvedValueOnce([repo('featured-a')])
      const { instance } = makeInstance()
      const page = mountPage(instance)

      page.openAddNew()
      await flush()

      expect(fetchFeaturedPlugins).toHaveBeenCalledWith(7)
      expect(page.addPlugins.value).toBe(true)
      expect(page.newPlugins.searchTerm).toBe('')
      expect(page.newPlugins.featured).toBe(true)
      expect(page.newPlugins.items.map(item => item.slug)).toEqual(['featured-a'])
    })

    it('searches for a term and shows the result as a non-featured list', async () => {
      vi.mocked(searchPlugins).mockResolvedValueOnce([repo('seo-tool')])
      const { instance } = makeInstance()
      const page = mountPage(instance)

      page.searchNew('seo')
      await flush()

      expect(searchPlugins).toHaveBeenCalledWith(7, 'seo')
      expect(page.newPlugins.featured).toBe(false)
      expect(page.newPlugins.allItems.map(item => item.slug)).toEqual(['seo-tool'])
    })

    it('ignores a slow answer to an older term when a newer term has answered', async () => {
      const older = deferred<RepositoryPlugin[]>()
      const newer = deferred<RepositoryPlugin[]>()
      vi.mocked(searchPlugins)
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise)
      const { instance } = makeInstance()
      const page = mountPage(instance)

      page.searchNew('a')
      page.searchNew('ab')
      newer.resolve([repo('ab-plugin')])
      await flush()
      older.resolve([repo('a-plugin')])
      await flush()

      expect(page.newPlugins.allItems.map(item => item.slug)).toEqual(['ab-plugin'])
    })

    it('loads the featured list after an empty term, and a late search answer does not replace it', async () => {
      const search = deferred<RepositoryPlugin[]>()
      vi.mocked(searchPlugins).mockReturnValueOnce(search.promise)
      vi.mocked(fetchFeaturedPlugins).mockResolvedValueOnce([repo('featured-b')])
      const { instance } = makeInstance()
      const page = mountPage(instance)

      page.searchNew('x')
      page.searchNew('')
      await flush()
      search.resolve([repo('x-plugin')])
      await flush()

      expect(fetchFeaturedPlugins).toHaveBeenCalledWith(7)
      expect(page.newPlugins.featured).toBe(true)
      expect(page.newPlugins.allItems.map(item => item.slug)).toEqual(['featured-b'])
      expect(page.newPlugins.loading).toBe(false)
    })

    it('hides the installed plugins from the catalogue and reports the total before that filter', async () => {
      vi.mocked(fetchPlugins).mockResolvedValueOnce([plugin(1)])
      vi.mocked(fetchFeaturedPlugins).mockResolvedValueOnce([repo('plugin-01'), repo('other')])
      const { instance } = makeInstance()
      const page = mountPage(instance)
      await page.loadData()

      page.openAddNew()
      await flush()

      expect(page.newPlugins.items.map(item => item.slug)).toEqual(['other'])
      expect(page.newPlugins.itemsTotal).toBe(2)
      expect(page.newPlugins.empty).toBe(false)
    })
  })

  // Legacy swallows a failed GET without UI. The installed list now shows an error
  // alert; the Add New GETs stay silent. The page shows the empty state in both.
  describe('błędy GET i pusta lista', () => {
    it('an empty list gives items=[] and itemsTotal=0, and stops loading', async () => {
      vi.mocked(fetchPlugins).mockResolvedValueOnce([])
      const { instance, setPluginsData } = makeInstance()
      const page = mountPage(instance)

      await page.loadData()

      expect(setPluginsData).toHaveBeenCalledWith([])
      expect(page.items.value).toEqual([])
      expect(page.itemsTotal.value).toBe(0)
      expect(page.itemsLoading.value).toBe(false)
    })

    it('a failed list GET (403 or 5xx) gives items=[] and itemsTotal=0, without throwing', async () => {
      vi.mocked(fetchPlugins).mockRejectedValueOnce(new Error('403 Forbidden'))
      const { instance } = makeInstance()
      const page = mountPage(instance)

      await expect(page.loadData()).resolves.toBeUndefined()

      expect(useAlertsStore().activeAlerts).toHaveLength(1)
      expect(page.items.value).toEqual([])
      expect(page.itemsTotal.value).toBe(0)
      expect(page.itemsLoading.value).toBe(false)
    })

    it('a failed featured GET on Add New ends loading and shows the empty state', async () => {
      vi.mocked(fetchFeaturedPlugins).mockRejectedValueOnce(new Error('500'))
      const { instance } = makeInstance()
      const page = mountPage(instance)

      page.openAddNew()
      await flush()

      expect(page.addPlugins.value).toBe(true)
      expect(page.newPlugins.loading).toBe(false)
      expect(page.newPlugins.items).toEqual([])
      expect(page.newPlugins.empty).toBe(true)
    })

    it('a failed search GET keeps the catalogue that was shown and ends loading', async () => {
      vi.mocked(fetchFeaturedPlugins).mockResolvedValueOnce([repo('featured-a')])
      vi.mocked(searchPlugins).mockRejectedValueOnce(new Error('500'))
      const { instance } = makeInstance()
      const page = mountPage(instance)
      page.openAddNew()
      await flush()

      page.searchNew('seo')
      await flush()

      expect(page.newPlugins.allItems.map(item => item.slug)).toEqual(['featured-a'])
      expect(page.newPlugins.loading).toBe(false)
    })
  })
})
