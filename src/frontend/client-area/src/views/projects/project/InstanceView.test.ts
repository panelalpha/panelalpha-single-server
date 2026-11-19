import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useLabelsStore } from '@/entities/label/labels.store'
import * as instanceActionsApi from '@/entities/project/instance-actions.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit, on, resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import { getInstance } from './instance.api'
import { useInstanceStore } from './instance.store'
import InstanceView from './InstanceView.vue'

// The frame's two WordPress wires: the live core version the card and the Update button read (a change made outside the panel
// leaves the panel's cached answer stale), and the Installation card's Update WordPress button, which reaches the frame through
// the child route.

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, name: 'project-general' }),
  useRouter: () => ({ push }),
}))

vi.mock('./instance.api', () => ({ getInstance: vi.fn(), updateSiteName: vi.fn() }))

vi.mock('@/entities/project/instance-actions.api', () => ({
  copyInstance: vi.fn(),
  getAppSsoUsers: vi.fn(),
  getPushToLiveDiff: vi.fn(),
  getPushToStagingDiff: vi.fn(),
  getServiceInstanceOptions: vi.fn(),
  getWordpressSsoUsers: vi.fn(),
  getWordpressUpdates: vi.fn(),
  pushToLive: vi.fn(),
  pushToStaging: vi.fn(),
  updateWordpress: vi.fn(),
}))

vi.mock('@/entities/project/instance-woocommerce.api', () => ({ installWoocommerce: vi.fn(), updateWoocommerce: vi.fn() }))

// The child route is stubbed; the test drives the events the real views emit.
const RouterViewStub = defineComponent({
  name: 'RouterView',
  emits: ['action-button-update', 'action-button-retry', 'action-update-woocommerce', 'action-button-install-woocommerce', 'reload-instance'],
  setup: () => () => h('div', { class: 'router-view-stub' }),
})

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'wordpress',
    app_type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    service_status: 'active',
    staging: false,
    staging_apps: [],
    labels: [],
    created_at: '2026-08-26T12:00:00.000Z',
    version: '7.1.4',
    update_details: { available_updates: [] },
    backup_details: [],
    plugin_details: [],
    has_automatic_backup: true,
    status: 'active',
    async_status: { installation: 'finished' },
    privileges: ['general.view_installation_details', 'wordpress.update'],
    shared_access: [],
    server_settings: { uses_own_backup_system: false },
    details: { dns_alerts_enabled: true },
    plan_settings: {},
    ...overrides,
  } as RawInstance
}

async function mountFrame (overrides: Partial<RawInstance> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const session = useSessionStore()
  session.home = { app: { single_server: { active: true } }, user: { services: [] } } as never

  const labels = useLabelsStore()
  labels.loadLabels = vi.fn(async () => {})

  const resource = toInstanceResource(raw(overrides), session.home)
  const store = useInstanceStore()
  store.instance = resource
  store.pageMounted = true
  store.load = vi.fn(async () => true)
  store.fetchModes = vi.fn()

  const wrapper = await mountKit(InstanceView, {
    shallow: true,
    global: { plugins: [pinia], stubs: { RouterView: RouterViewStub } },
  })
  await flushPromises()
  return { wrapper, resource }
}

describe('InstanceView WordPress wires', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAppEvents()
    vi.mocked(getInstance).mockReset()
    vi.mocked(instanceActionsApi.getWordpressUpdates).mockResolvedValue({ wp_version: '6.9', available_updates: ['7.1.4'] })
  })

  it('reads the live core version on load, so the Installation card and the Update button are not the stale cached ones', async () => {
    const { resource } = await mountFrame()

    expect(instanceActionsApi.getWordpressUpdates).toHaveBeenCalledExactlyOnceWith(7)
    expect(resource.status.wordpress).toBe('6.9')
    expect(resource.status.wordpress_available).toBe('7.1.4')
  })

  it('keeps the version the project answer carried when the live read fails', async () => {
    vi.mocked(instanceActionsApi.getWordpressUpdates).mockRejectedValue(new Error('Engine down'))
    const { resource } = await mountFrame()

    expect(resource.status.wordpress).toBe('7.1.4')
    expect(resource.status.wordpress_available).toBe('7.1.4')
  })

  it('does not read WordPress versions for a project that is not a WordPress one', async () => {
    await mountFrame({ type: 'custom', app_type: 'custom', version: null })

    expect(instanceActionsApi.getWordpressUpdates).not.toHaveBeenCalled()
  })

  it('opens the update dialog from the Installation card button', async () => {
    const { wrapper, resource } = await mountFrame()

    wrapper.findComponent(RouterViewStub).vm.$emit('action-button-update', resource)
    await flushPromises()

    // The dialog's own prefetch: the versions load first, then the version select and the backup box open.
    expect(instanceActionsApi.getWordpressUpdates).toHaveBeenCalledTimes(2)
    const host = wrapper.findComponent({ name: 'ActionModalHost' })
    expect(host.props('open')).toBe(true)
    expect(host.props('modal')).toMatchObject({ type: 'update' })
  })

  it('raises the retry of a failed installation from the Installation card', async () => {
    const { wrapper, resource } = await mountFrame({
      version: null,
      async_status: { installation: 'failed' },
      install_details: { install_method: 'simple' },
      import_details: null,
    })
    const seen = vi.fn()
    const stop = on('instance-retry-install', seen)

    wrapper.findComponent(RouterViewStub).vm.$emit('action-button-retry', resource)
    await flushPromises()
    stop()

    expect(seen).toHaveBeenCalledExactlyOnceWith({ id: 7, import_details: null, install_details: { install_method: 'simple' } })
  })

  it('reloads the project and the live versions when a WordPress update finishes', async () => {
    const { resource } = await mountFrame()
    const store = useInstanceStore()
    const fresh = toInstanceResource(raw({ version: '7.1.4', update_details: { available_updates: [] } }), null)
    vi.mocked(getInstance).mockResolvedValue(fresh)

    emit('instance-update-finished', { id: 7, version: null })
    await flushPromises()
    await flushPromises()

    expect(getInstance).toHaveBeenCalledWith(7, expect.anything())
    expect(store.instance).not.toBe(resource)
    // The page load and the finished update each read the live versions.
    expect(instanceActionsApi.getWordpressUpdates).toHaveBeenCalledTimes(2)
    expect(resource.status.wordpress).toBe('6.9')
    expect(store.instance?.status.wordpress).toBe('6.9')
  })

  it('shows the WooCommerce install as running as soon as the card\'s dialog posts it', async () => {
    const { wrapper, resource } = await mountFrame()
    const { installWoocommerce } = await import('@/entities/project/instance-woocommerce.api')
    vi.mocked(installWoocommerce).mockResolvedValue(undefined)

    wrapper.findComponent(RouterViewStub).vm.$emit('action-button-install-woocommerce', resource)
    await flushPromises()
    wrapper.findComponent({ name: 'ActionModalHost' }).vm.$emit('button', 'submit')
    await flushPromises()

    expect(installWoocommerce).toHaveBeenCalledExactlyOnceWith(7)
    expect(resource.status.woocommerce_installing).toBe(true)
    expect(useInstanceStore().instance?.status.woocommerce_installing).toBe(true)
  })

  it('reloads the project and the live versions when the WooCommerce install of the page finishes', async () => {
    const { resource } = await mountFrame()
    const store = useInstanceStore()
    resource.setWoocommerceInstalling(true)
    const fresh = toInstanceResource(raw({ plugin_details: [{ name: 'woocommerce', version: '11.3.0' }] }), null)
    vi.mocked(getInstance).mockResolvedValue(fresh)

    emit('plugin-item-changed', { name: 'woocommerce', version: '11.3.0', application_id: 7 })
    await flushPromises()
    await flushPromises()

    expect(getInstance).toHaveBeenCalledWith(7, expect.anything())
    expect(store.instance?.status.woocommerce).toBe('11.3.0')
    expect(store.instance?.status.woocommerce_installing).toBe(false)
    expect(instanceActionsApi.getWordpressUpdates).toHaveBeenCalledTimes(2)
  })

  it('names a failed WooCommerce install on the page instead of leaving it to the bell', async () => {
    await mountFrame()
    const alerts = useAlertsStore()

    emit('plugin-install-failed', { name: 'woocommerce', application_id: 7 })
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'notification.instance.plugin.install.failed' })
  })

  it('names no failure of a WooCommerce install on another project', async () => {
    await mountFrame()
    const alerts = useAlertsStore()

    emit('plugin-install-failed', { name: 'woocommerce', application_id: 41 })
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(0)
  })

  it('keeps the Installation card across a change domain answer and reads the project again', async () => {
    const { wrapper } = await mountFrame()
    const store = useInstanceStore()
    const detail = toInstanceResource(raw({ domain: 'new.example.com', version: '7.1.4' }), null)
    vi.mocked(getInstance).mockResolvedValue(detail)

    // `PUT change-domain/domain` answers the list item: no version, no update details, no plugins.
    wrapper.findComponent({ name: 'InstanceTopBar' }).vm.$emit('instance-published', raw({
      domain: 'new.example.com',
      url: 'https://new.example.com',
      version: null,
      update_details: null,
      plugin_details: [],
    }))
    await flushPromises()
    await flushPromises()

    expect(getInstance).toHaveBeenCalledWith(7, expect.anything())
    // The page load and the detail read each read the live versions; the card never read as not installed.
    expect(instanceActionsApi.getWordpressUpdates).toHaveBeenCalledTimes(2)
    expect(store.instance?.domain).toBe('new.example.com')
    expect(store.instance?.status.wordpress).toBe('6.9')
  })
})

describe('InstanceView push to staging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAppEvents()
    vi.mocked(getInstance).mockReset()
    vi.mocked(instanceActionsApi.getWordpressUpdates).mockResolvedValue({ wp_version: '6.9', available_updates: [] })
  })

  it('pushes the live project to its staging copy from the top bar', async () => {
    const { wrapper, resource } = await mountFrame()
    vi.mocked(instanceActionsApi.getPushToStagingDiff).mockResolvedValue({ tables_structure_diff: ['wp_a'], tables_data_diff: [] })
    vi.mocked(instanceActionsApi.pushToStaging).mockResolvedValue(undefined)

    wrapper.findComponent({ name: 'InstanceTopBar' }).vm.$emit('action-button-push-to-staging', resource)
    await flushPromises()

    expect(instanceActionsApi.getPushToStagingDiff).toHaveBeenCalledExactlyOnceWith(7)
    const host = wrapper.findComponent({ name: 'ActionModalHost' })
    expect(host.props('open')).toBe(true)
    expect(host.props('modal')).toMatchObject({ type: 'push-staging', props: { title: 'heading.instance.pushToStaging.title' } })

    host.vm.$emit('button', 'submit')
    await flushPromises()

    expect(instanceActionsApi.pushToStaging).toHaveBeenCalledExactlyOnceWith(7, {
      overwrite_files: false,
      push_db: false,
      structural_change_tables: null,
      datachange_tables: null,
    })
    expect(useAlertsStore().activeAlerts).toContainEqual(expect.objectContaining({ success: true, successMessage: 'notification.instance.modal.pushToStaging.success' }))
    expect(useInstanceStore().instance?.async_status.push_to_staging).toBe('in_progress')
  })
})

describe('InstanceTopBar push to staging button', () => {
  it('emits the push to staging event when the button is clicked', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.home = { app: { single_server: { active: true } }, user: { services: [] } } as never

    const resource = toInstanceResource(raw({
      privileges: ['general.view_installation_details', 'general.push_to_staging'],
      staging_apps: [raw({ id: 8, staging: true, subinstance_label: 'staging' } as Partial<RawInstance>)],
    }), session.home)
    const { default: InstanceTopBar } = await import('./topbar/InstanceTopBar.vue')

    // Not shallow: a shallow mount stubs the layout containers and drops the buttons in their slots. Only the top bar's own children
    // are stubbed, so the real button renders and the click reaches its handler.
    const wrapper = await mountKit(InstanceTopBar, {
      props: { instance: resource, fetching: false },
      global: {
        plugins: [pinia],
        stubs: { TopBarSubinstanceBar: true, TopBarTitle: true, InstanceTopBarTabs: true, SharesLabelBig: true },
      },
    })

    await wrapper.find('[data-testid="top-bar-push-to-staging"]').trigger('click')

    expect(wrapper.emitted('action-button-push-to-staging')).toEqual([[resource]])
  })
})
