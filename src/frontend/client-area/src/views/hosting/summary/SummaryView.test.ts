import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import * as hostingApi from '@/views/hosting/hosting.api'
import { makeService } from '@/views/hosting/hosting.fixtures'
import * as controlPanelApi from '@/entities/sso/control-panel-sso.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import SummaryView from './SummaryView.vue'

vi.mock('@/entities/sso/control-panel-sso.api', () => ({ getControlPanelSsoUrl: vi.fn() }))

vi.mock('@/views/hosting/hosting.api', () => ({
  getServerAccountUsage: vi.fn(),
  listHostingInstances: vi.fn(),
  toHostingInstance: vi.fn(),
  listServices: vi.fn(),
  getEmailDomains: vi.fn(),
}))

const GB = 1024 ** 3
const usageResponse = {
  data: {
    disk_usage: { usage: GB, maximum: 5 * GB },
    bandwidth: { usage: 2 * GB, maximum: 100 * GB },
    ftp_accounts: { usage: 1, maximum: 10 },
  },
  supported_metrics: { bandwidth: true, ftp_accounts: true },
}

function service (overrides = {}) {
  return makeService({
    privileges: ['hosting.control_panel_sso', 'hosting.manage_ftp'],
    owned: true,
    instances_count: 3,
    plan_settings: { instance_limit: 10 },
    dns_settings: { verification_methods: [] },
    server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: false }],
    ...overrides,
  })
}

async function mountSummary (hostingService = service(), singleServer = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { single_server: { active: singleServer } }, user: {} } as never)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('div') } },
      { path: '/hosting/usage', component: { render: () => h('div') } },
      { path: '/hosting/ftp', component: { render: () => h('div') } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = await mountKit(SummaryView, { props: { service: hostingService }, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, alerts: useAlertsStore() }
}

describe('SummaryView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(hostingApi.getServerAccountUsage).mockResolvedValue(usageResponse)
    vi.mocked(hostingApi.listHostingInstances).mockResolvedValue({ data: [], meta: { total: 0 } })
  })

  it('fetches usage twice on mount, as legacy (created + the account watcher)', async () => {
    const { wrapper } = await mountSummary()

    expect(hostingApi.getServerAccountUsage).toHaveBeenCalledTimes(2)
    expect(hostingApi.getServerAccountUsage).toHaveBeenNthCalledWith(1, 11)
    expect(hostingApi.getServerAccountUsage).toHaveBeenNthCalledWith(2, 11)
    wrapper.unmount()
  })

  it('loads the instances of every server account once', async () => {
    const { wrapper } = await mountSummary(service({ server_accounts: [{ id: 11, domain: 'a.test' }, { id: 12, domain: 'b.test' }] }))

    expect(hostingApi.listHostingInstances).toHaveBeenCalledTimes(2)
    expect(hostingApi.listHostingInstances).toHaveBeenCalledWith(11, 5)
    expect(hostingApi.listHostingInstances).toHaveBeenCalledWith(12, 5)
    wrapper.unmount()
  })

  it('renders the plan card, the SSO button and the instances empty state once loaded', async () => {
    const { wrapper } = await mountSummary()

    expect(wrapper.find('[data-testid="summary-plan-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-plan-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="summary-sso"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-usage-row-bandwidth"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-usage-row-ftp"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-instances-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-instances-chip"]').text()).toBe('heading.hosting.summary.instancesCard.usage.usedOfLimit')
    wrapper.unmount()
  })

  it('hides the SSO button without the privilege and the FTP row without its privilege', async () => {
    const { wrapper } = await mountSummary(service({ privileges: [] }))

    expect(wrapper.find('[data-testid="summary-sso"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="summary-usage-row-ftp"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="summary-usage-row-bandwidth"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps loading after a failed first load: one alert per request, the skeleton stays, no SSO', async () => {
    vi.mocked(hostingApi.getServerAccountUsage).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const { wrapper, alerts } = await mountSummary()

    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Server Error', 'Server Error'])
    expect(wrapper.find('[data-testid="summary-plan-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="summary-plan-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="summary-sso"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="summary-ns-spinner"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the diagnostic alert, loads no usage and hides the right column for a diagnostic account', async () => {
    const { wrapper, alerts } = await mountSummary(service({ server_accounts: [{ id: 11, domain: 'example.com', diagnostic_mode: true }] }))

    expect(hostingApi.getServerAccountUsage).not.toHaveBeenCalled()
    expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toContain('message.hostingAccountInDiagnosticMode')
    expect(wrapper.find('[data-testid="summary-right-column"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="summary-sso"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('redirects to Usage on a single-server install and loads nothing', async () => {
    const { wrapper, router } = await mountSummary(service(), true)

    // The redirect is a navigation pushed from `setup`; wait for it to settle instead of relying on one flush.
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/hosting/usage'))
    expect(hostingApi.getServerAccountUsage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('opens the control panel through the SSO endpoint of the selected account', async () => {
    vi.mocked(controlPanelApi.getControlPanelSsoUrl).mockResolvedValue('https://cp.example.com/x')
    vi.stubGlobal('open', vi.fn())
    const { wrapper } = await mountSummary()

    await wrapper.get('[data-testid="summary-sso"]').trigger('click')
    await flushPromises()

    expect(controlPanelApi.getControlPanelSsoUrl).toHaveBeenCalledWith(11)
    expect(window.open).toHaveBeenCalledWith('https://cp.example.com/x')
    vi.unstubAllGlobals()
    wrapper.unmount()
  })
})
