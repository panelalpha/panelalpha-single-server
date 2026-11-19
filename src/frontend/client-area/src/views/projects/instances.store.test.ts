import type * as InstancesApi from './instances.api'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type InstanceResource, type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { useSessionStore } from '@/shared/session/session.store'
import * as instancesApi from './instances.api'
import { useInstancesStore } from './instances.store'

vi.mock('./instances.api', async importOriginal => {
  const actual: typeof InstancesApi = await importOriginal()
  return {
    ...actual,
    listInstances: vi.fn(),
  }
})

function resource (id: number, overrides: Partial<RawInstance> = {}): InstanceResource {
  return toInstanceResource({ id, name: `Site ${id}`, url: `https://site-${id}.example.com`, status: 'active', ...overrides })
}

describe('useInstancesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('starts like the legacy screen: loading, page 1, 8 per page, newest first', () => {
    const store = useInstancesStore()
    expect(store.itemsLoading).toBe(true)
    expect(store.loadingFailure).toBe(false)
    expect(store.page).toBe(1)
    expect(store.itemsPerPage).toBe(8)
    expect(store.sortBy.value).toBe('created_at')
    expect(store.sortDesc).toBe(true)
  })

  it('loadInstances requests the current query with /home and stores the page', async () => {
    const home = { app: { single_server: { active: false } } }
    useSessionStore().hydrateHome(home as never)
    vi.mocked(instancesApi.listInstances).mockResolvedValueOnce({
      data: [resource(1), resource(2)],
      meta: { total: 12 },
    })

    const store = useInstancesStore()
    await store.loadInstances()

    expect(instancesApi.listInstances).toHaveBeenCalledWith({
      page: 1,
      perPage: 8,
      sortBy: 'created_at',
      sortDir: 'desc',
      searchTerm: '',
      labels: [],
      home,
    })
    expect(store.items.map(item => item.id)).toEqual([1, 2])
    expect(store.itemsTotal).toBe(12)
    expect(store.itemsLoading).toBe(false)
  })

  it('drops the answer of an older query (audit D4)', async () => {
    let resolveOld!: (value: { data: InstanceResource[], meta: { total: number } }) => void
    vi.mocked(instancesApi.listInstances)
      .mockReturnValueOnce(new Promise(resolve => {
        resolveOld = resolve
      }) as never)
      .mockResolvedValueOnce({ data: [resource(3)], meta: { total: 1 } })

    const store = useInstancesStore()
    const older = store.loadInstances()
    await store.loadInstances()
    expect(store.items.map(item => item.id)).toEqual([3])

    resolveOld({ data: [resource(1), resource(2)], meta: { total: 2 } })
    await older
    expect(store.items.map(item => item.id)).toEqual([3])
    expect(store.itemsTotal).toBe(1)
    expect(store.itemsLoading).toBe(false)
  })

  it('sends the sort direction, search and label titles', async () => {
    vi.mocked(instancesApi.listInstances).mockResolvedValue({ data: [], meta: { total: 0 } })
    const store = useInstancesStore()
    store.sortBy = { text: 'name', value: 'name', sortable: true }
    store.sortDesc = false
    store.searchTerm = 'acme'
    store.filterLabels = [{ title: 'Prod' }, { title: 'VIP' }]
    store.page = 3

    await store.loadInstances()

    expect(instancesApi.listInstances).toHaveBeenCalledWith(expect.objectContaining({
      page: 3,
      sortBy: 'name',
      sortDir: 'asc',
      searchTerm: 'acme',
      labels: ['Prod', 'VIP'],
    }))
  })

  it('a failed load sets loadingFailure, stops loading and keeps the items', async () => {
    const store = useInstancesStore()
    store.setInstances([resource(1)])
    vi.mocked(instancesApi.listInstances).mockRejectedValueOnce(new Error('boom'))

    await store.loadInstances()

    expect(store.loadingFailure).toBe(true)
    expect(store.itemsLoading).toBe(false)
    expect(store.items).toHaveLength(1)
  })

  it('a failed load keeps the API message', async () => {
    const store = useInstancesStore()
    vi.mocked(instancesApi.listInstances).mockRejectedValueOnce({ response: { status: 500, data: { message: 'Engine #1 is unreachable' } } })

    await store.loadInstances()

    expect(store.loadingError).toBe('Engine #1 is unreachable')
  })

  it('a later successful load clears loadingFailure and the message (legacy kept the flag)', async () => {
    const store = useInstancesStore()
    vi.mocked(instancesApi.listInstances).mockRejectedValueOnce(new Error('boom'))
    await store.loadInstances()
    vi.mocked(instancesApi.listInstances).mockResolvedValueOnce({ data: [], meta: { total: 0 } })
    await store.loadInstances()

    expect(store.loadingFailure).toBe(false)
    expect(store.loadingError).toBe('')
    expect(store.unfilteredEmpty).toBe(true)
  })

  describe('unfilteredEmpty', () => {
    it('is true for an empty, loaded, unfiltered list without a failure', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValueOnce({ data: [], meta: { total: 0 } })
      const store = useInstancesStore()
      expect(store.unfilteredEmpty).toBe(false)
      await store.loadInstances()
      expect(store.unfilteredEmpty).toBe(true)
    })

    it('is false while filtering or after a failure', async () => {
      const store = useInstancesStore()
      store.itemsLoading = false
      store.searchTerm = 'x'
      expect(store.unfilteredEmpty).toBe(false)
      store.searchTerm = ''
      store.filterLabels = [{ title: 'a' }]
      expect(store.unfilteredEmpty).toBe(false)
      store.filterLabels = []
      store.loadingFailure = true
      expect(store.unfilteredEmpty).toBe(false)
    })
  })

  describe('selection (CustomTablePageMixin)', () => {
    it('handleItemCheck toggles an item by id', () => {
      const store = useInstancesStore()
      store.handleItemCheck({ id: 1 })
      store.handleItemCheck({ id: 2 })
      expect(store.checkedItems).toEqual([1, 2])
      store.handleItemCheck({ id: 1 })
      expect(store.checkedItems).toEqual([2])
    })

    it('handleSelectAll checks and unchecks every item of the page', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1), resource(2), resource(3)])
      store.handleItemCheck({ id: 2 })

      store.handleSelectAll(true)
      expect(store.checkedItems.toSorted()).toEqual([1, 2, 3])
      store.handleSelectAll(false)
      expect(store.checkedItems).toEqual([])
    })

    it('keeps the selection when the list reloads', async () => {
      vi.mocked(instancesApi.listInstances).mockResolvedValue({ data: [resource(1)], meta: { total: 1 } })
      const store = useInstancesStore()
      store.handleItemCheck({ id: 1 })

      await store.loadInstances()

      expect(store.checkedItems).toEqual([1])
      expect(store.selectedInstances.map(item => item.id)).toEqual([1])
    })
  })

  describe('in-place updates (Echo)', () => {
    it('replaceItemFromApi rebuilds the item without reloading', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1), resource(2)])

      const replaced = store.replaceItemFromApi({ id: 2, name: 'Renamed', url: 'https://r.example.com', status: 'active' })

      expect(replaced).toBe(true)
      expect(store.items.map(item => item.title)).toEqual(['Site 1', 'Renamed'])
      expect(instancesApi.listInstances).not.toHaveBeenCalled()
    })

    it('ignores an item that is not on the page', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1)])
      expect(store.replaceItemFromApi({ id: 9, name: 'x', url: 'https://x.example.com' })).toBe(false)
    })

    it('patchSsl copies the certificate details to the item', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1)])
      const details = { detected_ssl_cert: null, detected_ssl_cert_checked_time: 5, installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 }

      store.patchSsl(1, details)

      expect(store.items[0]!.domain_ssl_details).toEqual(details)
    })

    it('patchSsl keeps the certificate the row shows when the payload carries no details', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1)])
      const details = { detected_ssl_cert: null, detected_ssl_cert_checked_time: 5, installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 }
      store.patchSsl(1, details)
      store.items[0]!.ssl_order_status = 'pending'

      // The slim `SslCertificateInstalled` payload has no certificate details.
      store.patchSsl(1, undefined)

      expect(store.items[0]!.domain_ssl_details).toEqual(details)
      expect(store.items[0]!.ssl_order_status).toBe('none')
    })

    it('patchAsyncStatus sets one key on a main row or a staging sub-row', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1, { staging_apps: [{ id: 41, url: 'https://s.example.com', staging: true } as RawInstance] })])

      expect(store.patchAsyncStatus(41, 'push_to_live', 'in_progress')).toBe(true)
      expect(store.patchAsyncStatus(1, 'pull_from_staging', 'in_progress')).toBe(true)
      expect(store.patchAsyncStatus(9, 'push_to_live', 'in_progress')).toBe(false)

      expect(store.items[0]!.subInstances[0]!.async_status.push_to_live).toBe('in_progress')
      expect(store.items[0]!.async_status.pull_from_staging).toBe('in_progress')
      expect(store.items[0]!.async_status.push_to_live).toBeNull()
    })

    it('setPushToLiveStatus moves the staging push and the live pull together', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1, { staging_apps: [{ id: 41, url: 'https://s.example.com', staging: true } as RawInstance] }), resource(2)])

      store.setPushToLiveStatus(41, 'in_progress')

      expect(store.items[0]!.subInstances[0]!.async_status.push_to_live).toBe('in_progress')
      expect(store.items[0]!.async_status.pull_from_staging).toBe('in_progress')
      expect(store.items[0]!.hasActionInProgress()).toBe(true)
      expect(store.items[1]!.async_status.pull_from_staging).toBeNull()
    })

    it('patchSsl ends a pending SSL order (app-lite `ssl_order_status = "none"`)', () => {
      const store = useInstancesStore()
      store.setInstances([resource(1)])
      store.items[0]!.ssl_order_status = 'pending'

      store.patchSsl(1, { detected_ssl_cert: null, detected_ssl_cert_checked_time: 5, installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 })

      expect(store.items[0]!.ssl_order_status).toBe('none')
    })
  })

  it('reset restores the legacy component state', () => {
    const store = useInstancesStore()
    store.setInstances([resource(1)])
    store.page = 4
    store.itemsPerPage = 32
    store.searchTerm = 'x'
    store.loadingFailure = true
    store.loadingError = 'boom'
    store.itemsLoading = false
    store.checkedItems = [1]

    store.reset()

    expect(store.items).toEqual([])
    expect(store.page).toBe(1)
    expect(store.itemsPerPage).toBe(8)
    expect(store.searchTerm).toBe('')
    expect(store.loadingFailure).toBe(false)
    expect(store.loadingError).toBe('')
    expect(store.itemsLoading).toBe(true)
    expect(store.checkedItems).toEqual([])
  })
})
