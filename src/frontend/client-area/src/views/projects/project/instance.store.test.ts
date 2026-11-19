import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDebugMode, getMaintenanceMode } from '@/entities/project/instance-modes.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getInstance, updateSiteName } from './instance.api'
import { useInstanceStore } from './instance.store'

vi.mock('./instance.api', () => ({ getInstance: vi.fn(), updateSiteName: vi.fn() }))
vi.mock('@/entities/project/instance-modes.api', () => ({
  getMaintenanceMode: vi.fn(),
  getDebugMode: vi.fn(),
}))

function fakeResource (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 1,
    title: 'Blog',
    staging: false,
    hasManageMaintenanceModePrivilege: () => false,
    hasManageDebugModePrivilege: () => false,
    setMaintenanceMode: vi.fn(),
    setDebugMode: vi.fn(),
    ...overrides,
  } as unknown as InstanceResource
}

/** A project answer as the panel sends it, mapped as the app maps it. */
function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 1,
    type: 'wordpress',
    app_type: 'wordpress',
    name: 'Blog',
    url: 'https://blog.example.com',
    domain: 'blog.example.com',
    status: 'active',
    staging: false,
    staging_apps: [],
    labels: [],
    backup_details: [],
    plugin_details: [],
    shared_access: [],
    privileges: [],
    details: {},
    async_status: { installation: 'finished' },
    ...overrides,
  } as RawInstance
}

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useInstanceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getInstance).mockReset()
    vi.mocked(getMaintenanceMode).mockReset()
    vi.mocked(getDebugMode).mockReset()
  })

  it('load fetches the resource and clears fetching afterwards', async () => {
    const store = useInstanceStore()
    const resource = fakeResource()
    vi.mocked(getInstance).mockResolvedValue(resource)

    await store.load(1)

    expect(getInstance).toHaveBeenCalledWith(1, null)
    expect(store.instance?.title).toBe('Blog')
    expect(store.fetching).toBe(false)
  })

  it('load resets the page state on start', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({ title: 'Old' })
    store.pageMounted = true
    const pending = deferred<InstanceResource>()
    vi.mocked(getInstance).mockReturnValue(pending.promise)

    const loading = store.load(2)

    expect(store.instance).toBeNull()
    expect(store.pageMounted).toBe(false)
    expect(store.fetching).toBe(true)
    pending.resolve(fakeResource({ id: 2 }))
    await loading
    expect(store.fetching).toBe(false)
  })

  it('load rejects on a failed GET and leaves fetching off', async () => {
    const store = useInstanceStore()
    vi.mocked(getInstance).mockRejectedValue(new Error('404'))

    await expect(store.load(1)).rejects.toThrow('404')
    expect(store.fetching).toBe(false)
    expect(store.instance).toBeNull()
  })

  it('reload keeps the old resource and pageMounted until the answer arrives', async () => {
    const store = useInstanceStore()
    const old = fakeResource({ title: 'Old' })
    store.instance = old
    store.pageMounted = true
    const pending = deferred<InstanceResource>()
    vi.mocked(getInstance).mockReturnValue(pending.promise)

    const reloading = store.reload(3)

    expect(store.fetching).toBe(true)
    expect(store.instance?.title).toBe('Old')
    expect(store.pageMounted).toBe(true)

    pending.resolve(fakeResource({ id: 3, title: 'New' }))
    await reloading
    expect(store.instance?.title).toBe('New')
    expect(store.fetching).toBe(false)
    expect(store.pageMounted).toBe(true)
  })

  it('drops the answer of an older id after a quick switch (audit D4)', async () => {
    const store = useInstanceStore()
    const live = deferred<InstanceResource>()
    const staging = deferred<InstanceResource>()
    vi.mocked(getInstance).mockReturnValueOnce(live.promise).mockReturnValueOnce(staging.promise)

    const first = store.load(1)
    const second = store.reload(2)
    staging.resolve(fakeResource({ id: 2, title: 'Staging' }))
    await expect(second).resolves.toBe(true)
    expect(store.fetching).toBe(false)

    live.resolve(fakeResource({ id: 1, title: 'Live' }))
    await expect(first).resolves.toBe(false)
    expect(store.instance?.title).toBe('Staging')
  })

  it('an outdated failure does not reject', async () => {
    const store = useInstanceStore()
    const old = deferred<InstanceResource>()
    vi.mocked(getInstance).mockReturnValueOnce(old.promise).mockResolvedValueOnce(fakeResource({ id: 2 }))

    const first = store.load(1)
    await store.reload(2)
    old.reject(new Error('404'))
    await expect(first).resolves.toBe(false)
    expect(store.instance?.id).toBe(2)
  })

  it('clear drops the resource and the page state', () => {
    const store = useInstanceStore()
    store.instance = fakeResource()
    store.pageMounted = true
    store.fetching = true

    store.clear()

    expect(store.instance).toBeNull()
    expect(store.pageMounted).toBe(false)
    expect(store.fetching).toBe(false)
  })

  it('replace swaps the resource without a request', () => {
    const store = useInstanceStore()
    store.replace(fakeResource({ title: 'Swapped' }))
    expect(store.instance?.title).toBe('Swapped')
    expect(getInstance).not.toHaveBeenCalled()
  })

  it('refresh swaps in the resource the server has now, without the frame skeleton', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({ domain: 'old.test', url: 'https://old.test' })
    const pending = deferred<InstanceResource>()
    vi.mocked(getInstance).mockReturnValue(pending.promise)

    const refreshing = store.refresh(1)

    expect(store.fetching).toBe(false)
    pending.resolve(fakeResource({ domain: 'new.test', url: 'https://new.test' }))
    await expect(refreshing).resolves.toBe(true)
    expect(getInstance).toHaveBeenCalledWith(1, null)
    expect(store.instance?.domain).toBe('new.test')
    expect(store.fetching).toBe(false)
  })

  it('refresh keeps the page resource when it now shows another id', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({ id: 2, domain: 'two.test' })
    vi.mocked(getInstance).mockResolvedValue(fakeResource({ id: 1, domain: 'one.test' }))

    await expect(store.refresh(1)).resolves.toBe(false)
    expect(store.instance?.id).toBe(2)
    expect(store.instance?.domain).toBe('two.test')
  })

  it('fetchModes reads both modes when the privileges allow it and the copy is not staging', async () => {
    const store = useInstanceStore()
    const resource = fakeResource({
      hasManageMaintenanceModePrivilege: () => true,
      hasManageDebugModePrivilege: () => true,
    })
    store.instance = resource
    vi.mocked(getMaintenanceMode).mockResolvedValue(true)
    vi.mocked(getDebugMode).mockResolvedValue(false)

    store.fetchModes()
    await vi.waitFor(() => {
      expect(resource.setMaintenanceMode).toHaveBeenCalledWith(true)
      expect(resource.setDebugMode).toHaveBeenCalledWith(false)
    })
    expect(getMaintenanceMode).toHaveBeenCalledWith(1)
    expect(getDebugMode).toHaveBeenCalledWith(1)
  })

  it('updateSiteName puts the name, sets the title, shows the success alert and clears the flag', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({ id: 7, title: 'Blog' })
    let flagDuringSave = false
    vi.mocked(updateSiteName).mockImplementation(async () => {
      flagDuringSave = store.savingName
    })

    await expect(store.updateSiteName('Shop')).resolves.toBe(true)

    expect(updateSiteName).toHaveBeenCalledWith(7, 'Shop')
    expect(flagDuringSave).toBe(true)
    expect(store.savingName).toBe(false)
    expect(store.instance?.title).toBe('Shop')
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: true, successMessage: 'Instance name changed successfully' }),
    ])
  })

  it('updateSiteName on a failed PUT shows the error alert, keeps the title and clears the flag', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({ title: 'Blog' })
    vi.mocked(updateSiteName).mockRejectedValue({ response: { data: { message: 'Name is taken' } } })

    await expect(store.updateSiteName('Shop')).resolves.toBe(false)

    expect(store.savingName).toBe(false)
    expect(store.instance?.title).toBe('Blog')
    expect(useAlertsStore().activeAlerts).toEqual([
      expect.objectContaining({ success: false, errorMessage: 'Name is taken' }),
    ])
  })

  it('updateSiteName ignores a second call while a save runs', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({ id: 1 })
    const pending = deferred<void>()
    vi.mocked(updateSiteName).mockReturnValue(pending.promise)

    const first = store.updateSiteName('First')
    await expect(store.updateSiteName('Second')).resolves.toBe(false)
    expect(updateSiteName).toHaveBeenCalledTimes(1)

    pending.resolve()
    await expect(first).resolves.toBe(true)
    expect(store.instance?.title).toBe('First')
  })

  it('fetchModes asks for nothing without the privilege or on a staging copy', () => {
    const store = useInstanceStore()
    store.instance = fakeResource({
      hasManageMaintenanceModePrivilege: () => true,
      hasManageDebugModePrivilege: () => true,
      staging: true,
    })
    store.fetchModes()
    expect(getMaintenanceMode).not.toHaveBeenCalled()
    expect(getDebugMode).not.toHaveBeenCalled()
  })

  it('keeps the last WordPress version when a project answer read during an update leaves it out', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({
      status: { wordpress: '7.1.3', wordpress_available: '7.1.4' },
      async_status: { update: 'in_progress' },
      hasUpdateInProgress: () => true,
    })
    vi.mocked(getInstance).mockResolvedValue(fakeResource({
      status: { wordpress: null, wordpress_available: null },
      async_status: { update: 'finished' },
      hasUpdateInProgress: () => false,
    }))

    await store.reload(1)

    expect(store.instance?.status.wordpress).toBe('7.1.3')
    expect(store.instance?.status.wordpress_available).toBe('7.1.4')
  })

  it('keeps a project answer without a version when no update is running', async () => {
    const store = useInstanceStore()
    store.instance = fakeResource({
      status: { wordpress: '7.1.3', wordpress_available: '7.1.4' },
      async_status: { update: null },
      hasUpdateInProgress: () => false,
    })
    vi.mocked(getInstance).mockResolvedValue(fakeResource({
      status: { wordpress: null, wordpress_available: null },
      async_status: { update: null },
      hasUpdateInProgress: () => false,
    }))

    await store.reload(1)

    expect(store.instance?.status.wordpress).toBeNull()
  })

  it('keeps the WordPress facts when an action answer replaces the project', () => {
    const store = useInstanceStore()
    const plugins = [{ name: 'woocommerce', version: '9.4.2', update: 'none' }]
    store.instance = toInstanceResource(raw({
      version: '7.1.4',
      update_details: { available_updates: [] },
      plugin_details: plugins,
    }), null)

    // `PUT change-domain/domain` answers the list item: no version, no update details, no plugins.
    store.replace(toInstanceResource(raw({ domain: 'new.example.com', version: null, update_details: null, plugin_details: [] }), null))

    expect(store.instance?.domain).toBe('new.example.com')
    expect(store.instance?.status.wordpress).toBe('7.1.4')
    expect(store.instance?.status.wordpress_available).toBe('7.1.4')
    expect(store.instance?.plugin_details).toHaveLength(1)
    expect(store.instance?.status.woocommerce).toBe('9.4.2')
  })

  it('takes the WordPress facts of an answer that carries them, and never of another project', () => {
    const store = useInstanceStore()
    store.instance = toInstanceResource(raw({ version: '7.1.3' }), null)

    store.replace(toInstanceResource(raw({ version: '7.1.4' }), null))
    expect(store.instance?.status.wordpress).toBe('7.1.4')

    store.replace(toInstanceResource(raw({ id: 2, version: null }), null))
    expect(store.instance?.id).toBe(2)
    expect(store.instance?.status.wordpress).toBeNull()
  })
})
