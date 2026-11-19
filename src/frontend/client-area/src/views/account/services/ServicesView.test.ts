import type * as ServicesApi from './services.api'
import type { Service } from './services.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as servicesApi from './services.api'
import ServicesView from './ServicesView.vue'

vi.mock('./services.api', async importOriginal => {
  const actual: typeof ServicesApi = await importOriginal()
  return { ...actual, listServices: vi.fn(), cancelService: vi.fn() }
})

function service (id: number, status = 'active'): Service {
  return {
    id,
    plan_name: `Plan ${id}`,
    status,
    plan_settings: { instance_limit: 5 },
    instances: [],
  }
}

async function mountView (app?: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { integrations: {}, ...(app ?? { billing_enabled: true }) }, user: { name: 'Jane' } } as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  await router.push('/services')
  const push = vi.spyOn(router, 'push')
  const wrapper = await mountKit(ServicesView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, push, pinia }
}

describe('ServicesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the plans once and lists the Active ones by default', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue([service(1), service(2, 'suspended'), service(3, 'cancelled')])
    const { wrapper } = await mountView()

    expect(servicesApi.listServices).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="services-title"]').text()).toBe('general.myPlans')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    wrapper.unmount()
  })

  it('paid build without billing shows the list (ID-56)', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue([service(1)])
    const { wrapper, push } = await mountView({ community_panel: false, billing_enabled: false })

    expect(servicesApi.listServices).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="services-table"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Free without billing redirects (ID-56)', async () => {
    const { wrapper, push } = await mountView({ community_panel: true, billing_enabled: false })

    expect(servicesApi.listServices).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ path: '/instances' })
    expect(wrapper.find('[data-testid="services-table"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('redirects to /projects in single-server mode', async () => {
    const { wrapper, push } = await mountView({ community_panel: true, billing_enabled: false, single_server: { active: true } })

    expect(push).toHaveBeenCalledWith({ path: '/projects' })
    wrapper.unmount()
  })

  it('adds an error alert and leaves the empty-table message when the load fails', async () => {
    vi.mocked(servicesApi.listServices).mockRejectedValue(new Error('500'))
    const { wrapper, pinia } = await mountView()

    expect(useAlertsStore(pinia).activeAlerts).toHaveLength(1)
    expect(useAlertsStore(pinia).activeAlerts[0]).toMatchObject({ success: false })
    expect(wrapper.find('[data-testid="services-empty"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('changes the status filter locally, without a new request', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue([service(1), service(2, 'cancelled')])
    const { wrapper } = await mountView()
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)

    wrapper.findComponent({ name: 'SelectDropdown' }).vm.$emit('update:modelValue', { text: 'All', value: 'all' })
    await flushPromises()

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(servicesApi.listServices).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('reloads the list after a plan was cancelled', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue([service(1)])
    const { wrapper } = await mountView()

    wrapper.findComponent({ name: 'ServicesTable' }).vm.$emit('service-cancelled', 1)
    await flushPromises()

    expect(servicesApi.listServices).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('refetches the list on a search term change', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue([service(1)])
    const { wrapper } = await mountView()

    wrapper.findComponent({ name: 'DataIteratorFilterControls' }).vm.$emit('update:searchTerm', 'plan')
    await flushPromises()

    expect(servicesApi.listServices).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
