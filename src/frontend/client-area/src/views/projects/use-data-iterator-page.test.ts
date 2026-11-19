import type * as InstancesApi from './instances.api'
import type * as LabelsApi from '@/entities/label/labels.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { type InstanceResource, type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { getDetectedCertificate } from '@/entities/project/instance-ssl.api'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import * as instancesApi from './instances.api'
import { useInstancesStore } from './instances.store'
import {
  INSTANCES_LIST_STYLE_KEY,
  PAGINATION_SET_KEY,
  readListStyle,
  readPaginationSet,
  useDataIteratorPage,
} from './use-data-iterator-page'

vi.mock('./instances.api', async importOriginal => {
  const actual: typeof InstancesApi = await importOriginal()
  return { ...actual, listInstances: vi.fn() }
})
vi.mock('@/entities/label/labels.api', async importOriginal => {
  const actual: typeof LabelsApi = await importOriginal()
  return {
    ...actual,
    getLabels: vi.fn(),
  }
})
vi.mock('@/entities/project/instance-ssl.api', () => ({ getDetectedCertificate: vi.fn() }))

function resource (id: number, overrides: Partial<RawInstance> = {}): InstanceResource {
  return toInstanceResource({ id, name: `Site ${id}`, url: `https://site-${id}.example.com`, status: 'active', ...overrides })
}

type TestRoute = { params: Record<string, unknown>, query: Record<string, unknown> }

function setup (route?: TestRoute) {
  const reactiveRoute = reactive<TestRoute>(route ?? { params: {}, query: {} })
  const router = { push: vi.fn() }
  const scope = effectScope()
  const page = scope.run(() => useDataIteratorPage({ route: reactiveRoute, router }))!
  return { page, store: useInstancesStore(), route: reactiveRoute, router, scope }
}

const lastCall = () => vi.mocked(instancesApi.listInstances).mock.calls.at(-1)![0]!

describe('useDataIteratorPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(instancesApi.listInstances).mockResolvedValue({ data: [], meta: { total: 0 } })
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
    vi.mocked(getDetectedCertificate).mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('list style', () => {
    it('reads instancesListStyle from localStorage (grid unless "1")', () => {
      expect(readListStyle()).toBe(0)
      localStorage.setItem(INSTANCES_LIST_STYLE_KEY, '1')
      expect(readListStyle()).toBe(1)
      localStorage.setItem(INSTANCES_LIST_STYLE_KEY, 'junk')
      expect(readListStyle()).toBe(0)
    })

    it('writes the style and re-reads it', () => {
      const { page } = setup()
      expect(page.instancesListStyle.value).toBe(0)
      page.instancesListStyle.value = 1
      expect(localStorage.getItem(INSTANCES_LIST_STYLE_KEY)).toBe('1')
      expect(page.instancesListStyle.value).toBe(1)
    })
  })

  describe('pagination', () => {
    it('reads paginationSet from sessionStorage on setup: "all" is 99, a number is kept', () => {
      sessionStorage.setItem(PAGINATION_SET_KEY, 'all')
      expect(readPaginationSet()).toBe(99)
      sessionStorage.setItem(PAGINATION_SET_KEY, '16')
      const { store } = setup()
      expect(store.itemsPerPage).toBe(16)
    })

    it('keeps 8 per page without a stored value', () => {
      expect(setup().store.itemsPerPage).toBe(8)
    })

    it('changePage reloads that page', async () => {
      const { page, store } = setup()
      await page.changePage(3)
      expect(store.page).toBe(3)
      expect(lastCall().page).toBe(3)
    })

    it('changePerPage goes back to page 1, reloads and remembers the value in the session', async () => {
      const { page, store } = setup()
      store.page = 4
      await page.changePerPage(32)
      expect(store.page).toBe(1)
      expect(store.itemsPerPage).toBe(32)
      expect(lastCall().perPage).toBe(32)
      expect(sessionStorage.getItem(PAGINATION_SET_KEY)).toBe('32')
    })
  })

  describe('sort', () => {
    it('changeSortBy resets the page and reloads with the new key', async () => {
      const { page, store } = setup()
      store.page = 2
      await page.changeSortBy({ text: 'name', value: 'name', sortable: true })
      expect(store.page).toBe(1)
      expect(lastCall().sortBy).toBe('name')
    })

    it('a newly picked sort starts in its own direction', async () => {
      const { page, store } = setup()
      expect(store.sortDesc).toBe(true)

      await page.changeSortBy({ text: 'name', value: 'name', sortable: true })
      expect(lastCall()).toMatchObject({ sortBy: 'name', sortDir: 'asc' })

      for (const value of ['bandwidth', 'storage', 'created_at']) {
        await page.changeSortBy({ text: value, value, sortable: true })
        expect(lastCall()).toMatchObject({ sortBy: value, sortDir: 'desc' })
      }
    })

    it('picking the sort it is already on keeps the direction (the table header reverses)', async () => {
      const { page } = setup()
      await page.changeSortBy({ text: 'name', value: 'name', sortable: true })
      await page.changeSortBy({ text: 'name', value: 'name', sortable: true })
      expect(lastCall()).toMatchObject({ sortBy: 'name', sortDir: 'asc' })

      await page.changeSortDesc(false)
      page.handleSortDescChange(true)
      await page.changeSortBy({ text: 'name', value: 'name', sortable: true })
      expect(lastCall()).toMatchObject({ sortBy: 'name', sortDir: 'desc' })
    })

    it('changeSortDesc reloads, handleSortDescChange only stores', async () => {
      const { page, store } = setup()
      await page.changeSortDesc(false)
      expect(lastCall().sortDir).toBe('asc')

      vi.mocked(instancesApi.listInstances).mockClear()
      page.handleSortDescChange(true)
      expect(store.sortDesc).toBe(true)
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
    })
  })

  describe('search', () => {
    it('debounces 300 ms, then resets the page and reloads once', () => {
      vi.useFakeTimers()
      const { page, store } = setup()
      store.page = 2

      page.handleSearchTermChange('a')
      page.handleSearchTermChange('ac')
      page.handleSearchTermChange('acme')
      vi.advanceTimersByTime(299)
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)

      expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
      expect(store.page).toBe(1)
      expect(lastCall().searchTerm).toBe('acme')
    })

    it('drops a pending search when the scope is disposed', () => {
      vi.useFakeTimers()
      const { page, scope } = setup()
      page.handleSearchTermChange('acme')
      scope.stop()
      vi.advanceTimersByTime(500)
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
    })
  })

  describe('label filter', () => {
    it('toggleFilterLabel adds then removes a label by title and reloads', async () => {
      const { page, store } = setup()
      await page.toggleFilterLabel({ title: 'Prod', color: '#fff' })
      expect(store.filterLabels).toEqual([{ title: 'Prod', color: '#fff' }])
      expect(lastCall().labels).toEqual(['Prod'])

      await page.toggleFilterLabel({ title: 'Prod' })
      expect(store.filterLabels).toEqual([])
      expect(lastCall().labels).toEqual([])
    })

    it('clearFilters empties search and labels and reloads without touching the page', async () => {
      const { page, store } = setup()
      store.searchTerm = 'x'
      store.filterLabels = [{ title: 'a' }]
      store.page = 3

      await page.clearFilters()

      expect(store.searchTerm).toBe('')
      expect(store.filterLabels).toEqual([])
      expect(store.page).toBe(3)
      expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    })

    it('starts with the label of params.filter', () => {
      const { store } = setup({ params: { filter: { title: 'Prod', color: '#fff' } }, query: {} })
      expect(store.filterLabels).toEqual([{ title: 'Prod', color: '#fff' }])
      expect(setup({ params: { filter: 'VIP' }, query: {} }).store.filterLabels).toEqual([{ title: 'VIP' }])
    })
  })

  describe('?reload', () => {
    it('goes back to page 1 and reloads when the query appears', async () => {
      const { store, route } = setup()
      store.page = 5

      route.query.reload = '1'
      await nextTick()

      expect(store.page).toBe(1)
      expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    })

    it('ignores an empty reload', async () => {
      const { route } = setup({ params: {}, query: { reload: '1' } })
      route.query.reload = ''
      await nextTick()
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
    })
  })

  describe('events', () => {
    it('instance-deleted goes to page 1 and reloads', () => {
      const { store } = setup()
      store.page = 3
      emit('instance-deleted', undefined)
      expect(store.page).toBe(1)
      expect(instancesApi.listInstances).toHaveBeenCalledTimes(1)
    })

    it('instances-list-reload reloads the current page', () => {
      const { store } = setup()
      store.page = 3
      emit('instances-list-reload')
      expect(store.page).toBe(3)
      expect(lastCall().page).toBe(3)
    })

    it.each(['staging-install-finished', 'staging-install-failed'] as const)('%s reloads the current page', event => {
      const { store } = setup()
      store.page = 3
      emit(event, { id: 7 })
      expect(store.page).toBe(3)
      expect(lastCall().page).toBe(3)
    })

    it('does not reload on staging events after the scope stops', () => {
      const { scope } = setup()
      scope.stop()
      emit('staging-install-finished', { id: 7 })
      emit('staging-install-failed', { id: 7 })
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
    })

    it('instance-created sorts by newest, descending', () => {
      const { store } = setup()
      store.sortDesc = false
      store.sortBy = { text: 'name', value: 'name' }
      emit('instance-created', { id: 9 })
      expect(store.sortDesc).toBe(true)
      expect(store.sortBy).toEqual({ text: 'newest', value: 'created_at' })
      expect(lastCall().sortBy).toBe('created_at')
    })

    it('manage-first-instance opens the first instance, only when there is one', () => {
      const { store, router } = setup()
      emit('manage-first-instance')
      expect(router.push).not.toHaveBeenCalled()
      store.setInstances([resource(7)])
      emit('manage-first-instance')
      expect(router.push).toHaveBeenCalledWith('/instances/7/general')
    })

    it('instance-item-changed and import-status-changed replace the item without a reload and keep the selection', () => {
      const { store } = setup()
      store.setInstances([resource(1), resource(2)])
      store.handleItemCheck({ id: 2 })

      emit('instance-item-changed', { id: 2, name: 'Changed', url: 'https://c.example.com', status: 'active' })
      expect(store.items[1]!.title).toBe('Changed')

      emit('import-status-changed', { id: 1, name: 'Imported', url: 'https://i.example.com', status: 'active' })
      expect(store.items[0]!.title).toBe('Imported')
      expect(store.checkedItems).toEqual([2])
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
    })

    it('push-to-live-finished and -failed settle the staging sub-row and its live row', () => {
      const { store } = setup()
      store.setInstances([resource(1, { staging_apps: [{ id: 41, url: 'https://s.example.com', staging: true } as RawInstance] })])
      store.setPushToLiveStatus(41, 'in_progress')

      emit('push-to-live-finished', { id: 41 })
      expect(store.items[0]!.subInstances[0]!.async_status.push_to_live).toBe('finished')
      expect(store.items[0]!.async_status.pull_from_staging).toBe('finished')

      emit('push-to-live-failed', { id: 41 })
      expect(store.items[0]!.subInstances[0]!.async_status.push_to_live).toBe('failed')
      expect(store.items[0]!.async_status.pull_from_staging).toBe('failed')
    })

    it('instance-updated puts the resource in place', () => {
      const { store } = setup()
      store.setInstances([resource(1)])
      const updated = resource(1)
      updated.title = 'Updated'
      emit('instance-updated', updated as unknown as Record<string, unknown>)
      expect(store.items[0]!.title).toBe('Updated')
    })

    it('ssl-certificate-installed copies the certificate details', () => {
      const { store } = setup()
      store.setInstances([resource(1)])
      const details = { detected_ssl_cert: null, detected_ssl_cert_checked_time: 1, installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 }
      emit('ssl-certificate-installed', { id: 1, domain_ssl_details: details })
      expect(store.items[0]!.domain_ssl_details).toEqual(details)
    })

    it('ssl-certificate-installed without certificate details keeps the row and ends its order', () => {
      const { store } = setup()
      store.setInstances([resource(1)])
      const details = { detected_ssl_cert: null, detected_ssl_cert_checked_time: 1, installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 }
      store.items[0]!.domain_ssl_details = details
      store.items[0]!.ssl_order_status = 'pending'

      // The slim project the panel broadcasts carries no certificate details.
      emit('ssl-certificate-installed', { id: 1, domain: 'site1.example.com' })

      expect(store.items[0]!.domain_ssl_details).toEqual(details)
      expect(store.items[0]!.ssl_order_status).toBe('none')
    })

    it('ssl-certificate-installed asks the certificate the row shows again', async () => {
      const { store } = setup()
      store.setInstances([resource(1, { domain: 'site1.example.com', server_account_id: 7 })])
      const certificate = { self_signed: false, issuer_name: 'FX44 CA', name_match: true }
      vi.mocked(getDetectedCertificate).mockResolvedValue(certificate as never)

      // The slim payload carries no certificate, so the padlock reads the one the panel detects itself.
      emit('ssl-certificate-installed', { id: 1, domain: 'site1.example.com' })
      await flushPromises()

      expect(getDetectedCertificate).toHaveBeenCalledWith(7, 'site1.example.com')
      expect(store.items[0]!.domain_ssl_details!.detected_ssl_cert).toEqual(certificate)
    })

    it('stops listening when the scope is disposed', () => {
      const { scope } = setup()
      scope.stop()
      emit('instances-list-reload')
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
    })
  })
})
