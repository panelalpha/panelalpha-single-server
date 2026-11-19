import type * as InstancesApi from './instances.api'
import type * as LabelsApi from '@/entities/label/labels.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as labelsApi from '@/entities/label/labels.api'
import * as actionsApi from '@/entities/project/instance-actions.api'
import { type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { on, resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as instancesApi from './instances.api'
import { useInstancesStore } from './instances.store'
import InstancesView from './InstancesView.vue'

// The row kebab of the table: single clear cache and single delete through the view's dialog host.

vi.mock('@/entities/project/instance-actions.api', () => ({
  getWordpressUpdates: vi.fn(),
  updateWordpress: vi.fn(),
  getServiceInstanceOptions: vi.fn(),
  copyInstance: vi.fn(),
  getPushToLiveDiff: vi.fn(),
  pushToLive: vi.fn(),
}))

vi.mock('./instances.api', async importOriginal => {
  const actual: typeof InstancesApi = await importOriginal()
  return {
    ...actual,
    listInstances: vi.fn(),
    clearInstanceCache: vi.fn(),
    deleteInstance: vi.fn(),
  }
})
vi.mock('@/entities/label/labels.api', async importOriginal => {
  const actual: typeof LabelsApi = await importOriginal()
  return {
    ...actual,
    getLabels: vi.fn(),
  }
})

function raw (id: number, overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id,
    type: 'wordpress',
    name: `Site ${id}`,
    url: `https://site-${id}.example.com`,
    domain: `site-${id}.example.com`,
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    service_created_at: '2026-01-01T00:00:00.000Z',
    version: '6.5.0',
    has_automatic_backup: true,
    backup_details: [{ id: 1, type: 'automatic' }],
    async_status: { installation: 'finished' },
    labels: [],
    privileges: ['wordpress.clear_cache', 'general.delete_instance', 'wordpress.update', 'general.copy_instance'],
    plan_settings: { copy_instance_allowed: true },
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const bodyQueryAll = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)]

const services = [
  { id: 10, plan_name: 'Starter', instance_count: 1, instance_limit: 5, hosting_accounts: [], onboarding: { user_configurable_options: [] } },
  { id: 11, plan_name: 'Pro', instance_count: 2, instance_limit: 9, hosting_accounts: [], onboarding: { user_configurable_options: [{ name: 'region', type: 'select' }] } },
]

async function mountTable (items: RawInstance[]) {
  vi.mocked(instancesApi.listInstances).mockResolvedValue({ data: items.map(item => toInstanceResource(item)), meta: { total: items.length } })
  localStorage.setItem('instancesListStyle', '1')
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.hydrateHome({ app: { integrations: {}, single_server: { active: false } }, user: { name: 'Jane', services } })
  const ensureHome = vi.spyOn(session, 'ensureHome').mockResolvedValue(session.home!)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(InstancesView, { global: { plugins: [pinia, router] }, attachTo: host })
  await flushPromises()
  return { wrapper, ensureHome }
}

async function pickMenuItem (instanceId: number, testId: string) {
  document.querySelector<HTMLElement>(`#instance-item-${instanceId}`)!.click()
  await flushPromises()
  bodyQuery(`[data-testid="${testId}"]`)!.click()
  await flushPromises()
}

const submit = () => bodyQueryAll('[data-testid="instances-modal"] .v-card-actions .v-btn')[0]!

describe('InstancesView row kebab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(labelsApi.getLabels).mockResolvedValue([])
    vi.mocked(instancesApi.clearInstanceCache).mockResolvedValue(undefined)
    vi.mocked(instancesApi.deleteInstance).mockResolvedValue(undefined)
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('clears the cache of the one row from its kebab and closes the dialog', async () => {
    const { wrapper } = await mountTable([raw(1), raw(2)])

    await pickMenuItem(2, 'instance-menu-clear-cache')

    const modal = bodyQuery('[data-testid="instances-modal"]')!
    expect(modal.textContent).toContain('heading.instance.clearCache.title')
    expect(modal.textContent).toContain('heading.instance.clearCache.message')
    // No title icon (the mass dialog has one): the close button's icon is the only one.
    expect(modal.querySelectorAll('.v-card-title .v-icon')).toHaveLength(1)

    submit().click()
    await flushPromises()

    expect(vi.mocked(instancesApi.clearInstanceCache).mock.calls).toEqual([[2]])
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.modal.clearCache.success'])
    expect(bodyQuery('[data-testid="instances-modal"]')?.closest('.v-overlay--active')).toBeFalsy()
    wrapper.unmount()
  })

  it('closes the clear cache dialog on an error too, with the error alert', async () => {
    vi.mocked(instancesApi.clearInstanceCache).mockRejectedValue(Object.assign(new Error('nope'), { response: { status: 500, data: { message: 'Broken.' } } }))
    const { wrapper } = await mountTable([raw(1)])

    await pickMenuItem(1, 'instance-menu-clear-cache')
    submit().click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.map(alert => alert.errorMessage)).toEqual(['Broken.'])
    expect(bodyQuery('[data-testid="instances-modal"]')?.closest('.v-overlay--active')).toBeFalsy()
    wrapper.unmount()
  })

  it('deletes the one row with the dialog values, refreshes /home and reports the instance', async () => {
    const { wrapper, ensureHome } = await mountTable([raw(1), raw(2)])
    const deleted: unknown[] = []
    on('instance-deleted', payload => deleted.push(payload))

    await pickMenuItem(2, 'instance-menu-delete')

    const modal = bodyQuery('[data-testid="instances-modal"]')!
    expect(modal.textContent).toContain('heading.instance.delete.title')
    expect(submit().hasAttribute('disabled')).toBe(true)
    const checkboxes = bodyQueryAll('[data-testid="instances-modal"] .v-card-text .checkbox input')
    expect(checkboxes).toHaveLength(3)

    checkboxes[2]!.click()
    await flushPromises()
    expect(submit().hasAttribute('disabled')).toBe(true)

    checkboxes[0]!.click()
    checkboxes[1]!.click()
    await flushPromises()
    expect(submit().hasAttribute('disabled')).toBe(false)
    submit().click()
    await flushPromises()

    expect(vi.mocked(instancesApi.deleteInstance).mock.calls).toEqual([[2, { remove_data: true, remove_database: true, confirm: true }]])
    expect(ensureHome).toHaveBeenCalledWith(true)
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.modal.delete.success'])
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toMatchObject({ id: 2 })
    wrapper.unmount()
  })

  it('does not delete the selected rows when a row is deleted from its kebab', async () => {
    const { wrapper } = await mountTable([raw(1), raw(2)])

    await pickMenuItem(1, 'instance-menu-delete')
    for (const checkbox of bodyQueryAll('[data-testid="instances-modal"] .v-card-text .checkbox input')) {
      checkbox.click()
    }
    await flushPromises()
    submit().click()
    await flushPromises()

    expect(vi.mocked(instancesApi.deleteInstance).mock.calls.map(call => call[0])).toEqual([1])
    wrapper.unmount()
  })
  it('loads the updates, shows the version dialog and sends the chosen version', async () => {
    vi.mocked(actionsApi.getWordpressUpdates).mockResolvedValue({ wp_version: '6.4.0', available_updates: ['6.4.2', '6.5.0'] })
    vi.mocked(actionsApi.updateWordpress).mockResolvedValue(undefined)
    const { wrapper } = await mountTable([raw(1), raw(2)])

    await pickMenuItem(2, 'instance-menu-update')

    expect(vi.mocked(actionsApi.getWordpressUpdates).mock.calls).toEqual([[2]])
    const modal = bodyQuery('[data-testid="instances-modal"]')!
    expect(modal.textContent).toContain('heading.instance.update.title')
    expect(modal.textContent).toContain('form.label.version')
    submit().click()
    await flushPromises()

    expect(vi.mocked(actionsApi.updateWordpress).mock.calls).toEqual([[2, { version: '6.4.2', create_backup: false }]])
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.modal.update.success'])
    expect(bodyQuery('[data-testid="instances-modal"]')?.closest('.v-overlay--active')).toBeFalsy()
    wrapper.unmount()
  })

  it('shows only the no-updates alert when nothing is available', async () => {
    vi.mocked(actionsApi.getWordpressUpdates).mockResolvedValue({ wp_version: '6.5.0', available_updates: [] })
    const { wrapper } = await mountTable([raw(1)])

    await pickMenuItem(1, 'instance-menu-update')

    expect(bodyQuery('[data-testid="instances-modal"]')?.closest('.v-overlay--active')).toBeFalsy()
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['message.noUpdates'])
    wrapper.unmount()
  })

  it('copies to a plain service in one step', async () => {
    vi.mocked(actionsApi.copyInstance).mockResolvedValue(undefined)
    const { wrapper } = await mountTable([raw(1), raw(2)])

    await pickMenuItem(2, 'instance-menu-copy')

    expect(bodyQuery('[data-testid="instances-modal"]')!.textContent).toContain('heading.instance.advanced.copyInstance.copy.title')
    submit().click()
    await flushPromises()

    expect(vi.mocked(actionsApi.copyInstance).mock.calls).toEqual([[2, { service_id: 10 }]])
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.copyInstance.completed'])
    wrapper.unmount()
  })
})

describe('InstancesView push to live', () => {
  const staging = (id: number) => raw(id, { staging: true, name: `Staging ${id}`, url: `https://staging-${id}.example.com`, privileges: ['general.push_to_live'] })
  const withStaging = () => raw(1, { staging_apps: [staging(41)], privileges: ['general.push_to_live', 'general.create_staging'] })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(labelsApi.getLabels).mockResolvedValue([])
    localStorage.clear()
    sessionStorage.clear()
    resetAppEvents()
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('opens the loading dialog, then the diff dialog of the staging instance, and pushes to the staging id', async () => {
    let resolveDiff: (value: actionsApi.PushDatabaseDiff) => void = () => undefined
    vi.mocked(actionsApi.getPushToLiveDiff).mockReturnValue(new Promise(resolve => {
      resolveDiff = resolve
    }))
    vi.mocked(actionsApi.pushToLive).mockResolvedValue(undefined)
    const { wrapper } = await mountTable([withStaging()])
    const store = useInstancesStore()

    await pickMenuItem(41, 'instance-menu-push-to-live')

    // The staging sub-row's kebab passes the live item as the row item: the id must come from the sub-row.
    expect(vi.mocked(actionsApi.getPushToLiveDiff).mock.calls).toEqual([[41]])
    expect(bodyQuery('[data-testid="instances-modal"]')!.textContent).toContain('heading.instance.pushToLoadingState.messageTitle')

    resolveDiff({ tables_structure_diff: ['wp_a'], tables_data_diff: ['wp_posts'] })
    await flushPromises()

    expect(bodyQuery('[data-testid="instances-modal"]')!.textContent).toContain('form.label.overwriteFiles')
    submit().click()
    await flushPromises()

    expect(vi.mocked(actionsApi.pushToLive).mock.calls).toEqual([[41, { overwrite_files: false, push_db: false, structural_change_tables: null, datachange_tables: null }]])
    expect(useAlertsStore().activeAlerts.map(alert => alert.successMessage)).toEqual(['notification.instance.modal.pushToLive.success'])
    expect(store.items[0]!.subInstances[0]!.async_status.push_to_live).toBe('in_progress')
    expect(store.items[0]!.async_status.pull_from_staging).toBe('in_progress')
    wrapper.unmount()
  })

  it('reopens the dialog with the diff when the answer comes after the loading dialog was closed', async () => {
    let resolveDiff: (value: actionsApi.PushDatabaseDiff) => void = () => undefined
    vi.mocked(actionsApi.getPushToLiveDiff).mockReturnValue(new Promise(resolve => {
      resolveDiff = resolve
    }))
    const { wrapper } = await mountTable([withStaging()])

    await pickMenuItem(41, 'instance-menu-push-to-live')
    submit().click()
    await flushPromises()
    expect(bodyQuery('[data-testid="instances-modal"]')?.closest('.v-overlay--active')).toBeFalsy()

    resolveDiff({ tables_structure_diff: [], tables_data_diff: [] })
    await flushPromises()

    expect(bodyQuery('[data-testid="instances-modal"]')!.textContent).toContain('form.label.overwriteFiles')
    wrapper.unmount()
  })

  it('ignores a stale answer when another push to live was requested since', async () => {
    const resolvers: Array<(value: actionsApi.PushDatabaseDiff) => void> = []
    vi.mocked(actionsApi.getPushToLiveDiff).mockImplementation(() => new Promise(resolve => {
      resolvers.push(resolve)
    }))
    const { wrapper } = await mountTable([withStaging(), raw(2, { staging_apps: [staging(42)], privileges: ['general.push_to_live'] })])

    await pickMenuItem(41, 'instance-menu-push-to-live')
    submit().click()
    await flushPromises()
    await pickMenuItem(42, 'instance-menu-push-to-live')

    resolvers[0]!({ tables_structure_diff: ['stale'], tables_data_diff: [] })
    await flushPromises()
    expect(bodyQuery('[data-testid="instances-modal"]')!.textContent).toContain('heading.instance.pushToLoadingState.messageTitle')

    resolvers[1]!({ tables_structure_diff: ['fresh'], tables_data_diff: [] })
    await flushPromises()
    expect(bodyQuery('[data-testid="instances-modal"]')!.textContent).toContain('form.label.overwriteFiles')
    wrapper.unmount()
  })

  it('keeps the dialog open and the status untouched when the push fails', async () => {
    vi.mocked(actionsApi.getPushToLiveDiff).mockResolvedValue({ tables_structure_diff: [], tables_data_diff: [] })
    vi.mocked(actionsApi.pushToLive).mockRejectedValue(Object.assign(new Error('no'), { response: { status: 500, data: { message: 'Broken.' } } }))
    const { wrapper } = await mountTable([withStaging()])

    await pickMenuItem(41, 'instance-menu-push-to-live')
    submit().click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.map(alert => alert.errorMessage)).toEqual(['Broken.'])
    expect(bodyQuery('[data-testid="instances-modal"]')!.closest('.v-overlay--active')).toBeTruthy()
    expect(useInstancesStore().items[0]!.subInstances[0]!.async_status.push_to_live).toBeNull()
    wrapper.unmount()
  })
})
