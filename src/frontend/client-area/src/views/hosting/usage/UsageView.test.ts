import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as hostingApi from '@/views/hosting/hosting.api'
import { hostingRoutes } from '@/views/hosting/hosting.routes'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import UsageView from './UsageView.vue'

vi.mock('@/views/hosting/hosting.api', () => ({
  getServerMetricsCurrent: vi.fn(),
  getServerMetricsByPeriod: vi.fn(),
}))

// jsdom has no SVG layout, so ApexCharts cannot render here; the wrapper has its own test.
vi.mock('@/shared/ui/charts/ApexChart.vue', () => ({ default: { render: () => null } }))

const current = {
  cpu_usage_percent: 22.1,
  ram_total: 8 * 1024 * 1024,
  ram_used: 3.6 * 1024 * 1024,
  ram_usage_percent: 45.01,
  disk_total: 100 * 1024 ** 3,
  disk_free: 38.5 * 1024 ** 3,
  disk_used: 61.5 * 1024 ** 3,
  disk_usage_percent: 61.5,
}

async function mountUsage (home: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome(home as never)
  const wrapper = await mountKit(UsageView, { global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, alerts: useAlertsStore() }
}

const singleServer = { active: true }

describe('UsageView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(hostingApi.getServerMetricsCurrent).mockResolvedValue(current)
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockResolvedValue([])
  })

  it('renders no title and no admin button of its own (they live in the hosting frame head)', async () => {
    const { wrapper } = await mountUsage({
      app: { single_server: singleServer },
      user: { is_ss_default: true },
      admin: { app_url: 'https://admin.example.com' },
    })

    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-admin-button"]').exists()).toBe(false)
  })

  it('renders the Usage rings from /server/metrics/current, fetched once', async () => {
    const { wrapper } = await mountUsage({ app: { single_server: singleServer }, user: {} })

    expect(hostingApi.getServerMetricsCurrent).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="usage-ring-ram"]').text()).toBe('46%')
    expect(wrapper.get('[data-testid="usage-ring-cpu"]').text()).toBe('23%')
    expect(wrapper.get('[data-testid="usage-ring-disk"]').text()).toBe('62%')
    expect(wrapper.get('[data-testid="usage-stat-used-ram"]').text()).toBe('3.60 general.size.gb')
    expect(wrapper.get('[data-testid="usage-stat-available-disk"]').text()).toBe('38.50 general.size.gb')
    expect(wrapper.get('[data-testid="usage-stat-card-cpu-note"]').text()).toBe('Current load')
    expect(wrapper.find('[data-testid="usage-stat-used-cpu"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="usage-stat-available-cpu"]').exists()).toBe(false)
  })

  it('shows the skeletons of the rings and of the chart before the data arrives (decision of the user 2026-11-03)', async () => {
    vi.mocked(hostingApi.getServerMetricsCurrent).mockReturnValue(new Promise(() => {}))
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountUsage({ app: { single_server: singleServer }, user: {} })

    expect(wrapper.find('[data-testid="graphs-title"]').exists()).toBe(false)
    for (const key of ['ram', 'cpu', 'disk']) {
      expect(wrapper.find(`[data-testid="usage-stat-card-${key}-skeleton"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="usage-ring-ram"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="graphs-chart-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="graphs-card-cpu-percent"]').exists()).toBe(true)
  })

  it('shows 0% and 0 GB after the current metrics fail, as legacy', async () => {
    vi.mocked(hostingApi.getServerMetricsCurrent).mockRejectedValue({ response: { status: 500, data: { message: 'Server Error' } } })
    const { wrapper } = await mountUsage({ app: { single_server: singleServer }, user: {} })

    expect(wrapper.find('[data-testid="usage-stat-card-ram-skeleton"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="usage-ring-ram"]').text()).toBe('0%')
    expect(wrapper.get('[data-testid="usage-stat-used-ram"]').text()).toBe('0 general.size.gb')
  })

  it('raises an alert when the current metrics fail (legacy shows none)', async () => {
    vi.mocked(hostingApi.getServerMetricsCurrent).mockRejectedValue({ response: { status: 500, data: { message: 'Server Error' } } })
    const { alerts } = await mountUsage({ app: { single_server: singleServer }, user: {} })

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
    expect(alerts.activeAlerts[0]!.errorMessage).toBeTruthy()
  })

  it('raises an alert when the period metrics fail', async () => {
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockRejectedValue({ response: { status: 500, data: { message: 'Server Error' } } })
    const { alerts } = await mountUsage({ app: { single_server: singleServer }, user: {} })

    expect(hostingApi.getServerMetricsByPeriod).toHaveBeenCalledWith('last-5-minutes')
    expect(alerts.activeAlerts).toHaveLength(1)
  })
})

describe('hosting routes', () => {
  it('has /hosting/usage as a child of the frame with the usage title', () => {
    const frame = hostingRoutes.find(route => route.name === 'hosting')!
    const usage = frame.children!.find(route => route.path === '/hosting/usage')!

    expect(usage.name).toBe('hosting-usage')
    expect(usage.meta).toEqual({ title: 'usage' })
  })
})
