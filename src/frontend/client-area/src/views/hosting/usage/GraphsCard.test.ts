import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as hostingApi from '@/views/hosting/hosting.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import GraphsCard from './GraphsCard.vue'
import MetricsGraph from './MetricsGraph.vue'

vi.mock('@/views/hosting/hosting.api', () => ({
  getServerMetricsByPeriod: vi.fn(),
}))

// jsdom has no SVG layout, so ApexCharts cannot render here; the wrapper has its own test.
vi.mock('@/shared/ui/charts/ApexChart.vue', () => ({ default: { render: () => null } }))

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Buckets = Awaited<ReturnType<typeof hostingApi.getServerMetricsByPeriod>>

async function mountGraphs () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(GraphsCard, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

describe('GraphsCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders 5 cards with their titles at once and a chart skeleton in each until the first answer (decision of the user 2026-11-17)', async () => {
    const first = deferred<Buckets>()
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockReturnValue(first.promise)
    const { wrapper } = await mountGraphs()
    await flushPromises()

    expect(wrapper.findAll('[data-testid^="graphs-card-"]')).toHaveLength(5)
    expect(wrapper.get('[data-testid="graphs-card-cpu-percent"]').text()).toContain('heading.hosting.usage.graphs.cpuUsage')
    expect(wrapper.findAll('[data-testid="graphs-chart-skeleton"]')).toHaveLength(5)
    expect(wrapper.findAllComponents(MetricsGraph)).toHaveLength(0)

    first.resolve([])
    await flushPromises()
    expect(wrapper.find('[data-testid="graphs-chart-skeleton"]').exists()).toBe(false)
    expect(wrapper.findAllComponents(MetricsGraph)).toHaveLength(5)
    wrapper.unmount()
  })

  it('shows a legend on the 2-series cards only and gives the CPU card the wide height', async () => {
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockResolvedValue([])
    const { wrapper } = await mountGraphs()
    await flushPromises()

    expect(wrapper.find('[data-testid="graphs-legend-cpu-percent"]').exists()).toBe(false)
    for (const key of ['disk-throughput', 'disk-iops', 'network-traffic', 'network-pps']) {
      expect(wrapper.find(`[data-testid="graphs-legend-${key}"]`).exists()).toBe(true)
    }
    expect(wrapper.get('[data-testid="graphs-legend-disk-iops"]').text()).toContain('heading.hosting.usage.graphs.read')
    expect(wrapper.get('[data-testid="graphs-card-cpu-percent"]').classes()).toContain('graphs-card--wide')
    expect(wrapper.get('[data-testid="graphs-card-disk-iops"]').classes()).not.toContain('graphs-card--wide')
    const heights = wrapper.findAllComponents(MetricsGraph).map(graph => graph.props('height'))
    expect(heights).toEqual([240, 200, 200, 200, 200])
    wrapper.unmount()
  })

  it('shows the empty charts after a failed first answer, as legacy', async () => {
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockRejectedValue({ response: { status: 500, data: { message: 'Server Error' } } })
    const { wrapper } = await mountGraphs()
    await flushPromises()

    expect(wrapper.find('[data-testid="graphs-chart-skeleton"]').exists()).toBe(false)
    expect(wrapper.findAllComponents(MetricsGraph)).toHaveLength(5)
    wrapper.unmount()
  })

  it('shows "Next update in N s" in Live only, with no spinner or counter ring', async () => {
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockResolvedValue([])
    const { wrapper } = await mountGraphs()
    await flushPromises()

    expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('Next update in 5 s')
    expect(wrapper.find('[data-testid="graphs-fetching"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="graphs-counter"]').exists()).toBe(false)

    const select = wrapper.getComponent({ name: 'VSelect' })
    select.vm.$emit('update:modelValue', 'last-hour')
    await flushPromises()
    expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('')

    select.vm.$emit('update:modelValue', 'last-12-hours')
    await flushPromises()
    expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('')

    select.vm.$emit('update:modelValue', 'last-5-minutes')
    await flushPromises()
    expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('Next update in 5 s')
    wrapper.unmount()
  })

  it('keeps the live note empty until the first Live answer and never shows "0 s" during a refresh (review F3)', async () => {
    vi.useFakeTimers()
    try {
      const first = deferred<Buckets>()
      const refresh = deferred<Buckets>()
      vi.mocked(hostingApi.getServerMetricsByPeriod).mockReturnValueOnce(first.promise).mockReturnValueOnce(refresh.promise)
      const { wrapper } = await mountGraphs()
      await flushPromises()
      expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('')

      first.resolve([])
      await flushPromises()
      expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('Next update in 5 s')

      // At 0 the refresh starts and the counter holds at 0 until it answers.
      await vi.advanceTimersByTimeAsync(5000)
      expect(hostingApi.getServerMetricsByPeriod).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('Next update in 1 s')

      refresh.resolve([])
      await flushPromises()
      expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('Next update in 5 s')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives the charts the period of the shown buckets, not the selected one, until the new answer (review F3)', async () => {
    const hour = deferred<Buckets>()
    const live = deferred<Buckets>()
    vi.mocked(hostingApi.getServerMetricsByPeriod)
      .mockResolvedValueOnce([{ period: '2026-10-07 10:00:00' }])
      .mockReturnValueOnce(hour.promise)
      .mockReturnValueOnce(live.promise)
    const { wrapper } = await mountGraphs()
    await flushPromises()
    const periods = () => wrapper.findAllComponents(MetricsGraph).map(graph => graph.props('period'))
    expect(periods()).toEqual(Array.from({ length: 5 }, () => 'last-5-minutes'))

    const select = wrapper.getComponent({ name: 'VSelect' })
    select.vm.$emit('update:modelValue', 'last-hour')
    await flushPromises()
    expect(periods()).toEqual(Array.from({ length: 5 }, () => 'last-5-minutes'))

    hour.resolve([{ period: '2026-10-07 10:00:00' }])
    await flushPromises()
    expect(periods()).toEqual(Array.from({ length: 5 }, () => 'last-hour'))

    // Back to Live: the old countdown is not shown while the 1 hour buckets are still on screen.
    select.vm.$emit('update:modelValue', 'last-5-minutes')
    await flushPromises()
    expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('')

    live.resolve([])
    await flushPromises()
    expect(wrapper.get('[data-testid="graphs-live-note"]').text()).toBe('Next update in 5 s')
    wrapper.unmount()
  })

  it('gives all 5 charts the new metrics on a Live refresh', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(hostingApi.getServerMetricsByPeriod)
        .mockResolvedValueOnce([{ period: '2026-10-07 10:00:00' }])
        .mockResolvedValue([{ period: '2026-10-07 10:00:05' }])
      const { wrapper } = await mountGraphs()
      await flushPromises()
      expect(wrapper.findAllComponents(MetricsGraph).map(graph => graph.props('metrics'))).toEqual(Array.from({ length: 5 }, () => [{ period: '2026-10-07 10:00:00' }]))

      await vi.advanceTimersByTimeAsync(5000)
      expect(wrapper.findAllComponents(MetricsGraph).map(graph => graph.props('metrics'))).toEqual(Array.from({ length: 5 }, () => [{ period: '2026-10-07 10:00:05' }]))
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a slow Live response that arrives after a newer period was loaded', async () => {
    const live = deferred<Buckets>()
    const hour = deferred<Buckets>()
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockReturnValueOnce(live.promise).mockReturnValueOnce(hour.promise)
    const { wrapper } = await mountGraphs()

    wrapper.getComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'last-hour')
    await flushPromises()
    expect(hostingApi.getServerMetricsByPeriod).toHaveBeenLastCalledWith('last-hour')

    hour.resolve([{ period: '2026-10-07 10:00:00' }])
    await flushPromises()
    live.resolve([{ period: '2026-10-07 10:59:55' }])
    await flushPromises()

    expect(wrapper.findAllComponents(MetricsGraph)[0]!.props('metrics')).toEqual([{ period: '2026-10-07 10:00:00' }])
  })

  it('does not raise an alert for a superseded request that failed', async () => {
    const live = deferred<Buckets>()
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockReturnValueOnce(live.promise).mockResolvedValueOnce([])
    const { wrapper, alerts } = await mountGraphs()

    wrapper.getComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'last-hour')
    await flushPromises()
    live.reject({ response: { status: 500, data: { message: 'Server Error' } } })
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(0)
  })

  it('raises one alert per run of failures, and again after a success', async () => {
    const failure = { response: { status: 500, data: { message: 'Server Error' } } }
    vi.useFakeTimers()
    try {
      vi.mocked(hostingApi.getServerMetricsByPeriod).mockRejectedValueOnce(failure).mockRejectedValueOnce(failure).mockResolvedValueOnce([]).mockRejectedValue(failure)
      const { alerts } = await mountGraphs()
      await flushPromises()
      expect(alerts.activeAlerts).toHaveLength(1)

      // Live retries: each tick of the 5 s cycle fires the next request.
      await vi.advanceTimersByTimeAsync(5000)
      expect(alerts.activeAlerts).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(5000)
      expect(hostingApi.getServerMetricsByPeriod).toHaveBeenCalledTimes(3)
      await vi.advanceTimersByTimeAsync(5000)
      expect(hostingApi.getServerMetricsByPeriod).toHaveBeenCalledTimes(4)
      expect(alerts.activeAlerts).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not write or alert when the response arrives after unmount', async () => {
    const live = deferred<Buckets>()
    vi.mocked(hostingApi.getServerMetricsByPeriod).mockReturnValueOnce(live.promise)
    const { wrapper, alerts } = await mountGraphs()

    wrapper.unmount()
    live.reject({ response: { status: 500, data: { message: 'Server Error' } } })
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(0)
  })
})
