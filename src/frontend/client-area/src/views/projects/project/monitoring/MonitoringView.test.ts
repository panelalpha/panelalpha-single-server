import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getVisitorsReport, getVisitsBreakdown, type VisitorsReport } from '@/entities/project/instance-reporting.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'
import ChartCardSkeleton from '@/shared/ui/skeletons/ChartCardSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import DoughnutChartCard from './cards/DoughnutChartCard.vue'
import MonitoringVisitorsCard from './cards/MonitoringVisitorsCard.vue'
import PieChartCard from './cards/PieChartCard.vue'
import PieChartSkeleton from './cards/PieChartSkeleton.vue'
import SharesCard from './cards/SharesCard.vue'
import SharesCardSkeleton from './cards/SharesCardSkeleton.vue'
import MonitoringView from './MonitoringView.vue'

vi.mock('@/entities/project/instance-reporting.api', () => ({
  getVisitorsReport: vi.fn(),
  getVisitsBreakdown: vi.fn(),
}))

// jsdom has no SVG layout, so ApexCharts cannot render here; the chart options are tested in `monitoring.test.ts`.
vi.mock('@/shared/ui/charts/ApexChart.vue', () => ({ default: { render: () => null } }))

const INSTANCE_ID = 7

// Legacy card order: visitors, shares (country, page, continent, region, referrer), doughnut (device), pies (brand, os, browser).
const CARD_TITLES = [
  'heading.instance.monitoring.chart.visitors',
  'heading.instance.monitoring.chart.visits.country',
  'heading.instance.monitoring.chart.visits.page',
  'heading.instance.monitoring.chart.visits.continent',
  'heading.instance.monitoring.chart.visits.region',
  'heading.instance.monitoring.chart.visits.referrer',
  'heading.instance.monitoring.chart.visits.device',
  'heading.instance.monitoring.chart.visits.deviceBrand',
  'heading.instance.monitoring.chart.visits.os',
  'heading.instance.monitoring.chart.visits.browser',
]

const BREAKDOWN_DATA: Record<string, unknown> = {
  'country': [{ label: 'Poland', visits: 5, code: 'PL' }],
  'page': [{ label: '/', visits: 5 }],
  'continent': [{ label: 'Europe', visits: 5 }],
  'region': [{ label: 'Mazowieckie', visits: 5, country_code: 'PL' }],
  'referrer': [{ label: 'google', visits: 5 }],
  'device': [{ label: 'Desktop', visits: 5 }],
  'device-brand': [{ label: 'Apple', visits: 5 }],
  'device-os': [{ label: 'iOS', visits: 5 }],
  'device-browser': [{ label: 'Safari', visits: 5 }],
}

function visitsReport (total: number, previousTotal: number): VisitorsReport {
  return { visits: { records: { '2026-10-01': 3, '2026-10-02': null, '2026-10-03': 5 }, total, previous_total: previousTotal } }
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

const neverSettles = () => new Promise<never>(() => {})

function instance () {
  return { id: INSTANCE_ID } as unknown as InstanceResource
}

async function mountMonitoring () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const alerts = useAlertsStore()
  const addAlert = vi.spyOn(alerts, 'addAlert')
  const wrapper = await mountKit(MonitoringView, { props: { instance: instance() }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, addAlert }
}

function cardTitles (wrapper: Awaited<ReturnType<typeof mountMonitoring>>['wrapper']): string[] {
  return wrapper.findAll('h6').map(title => title.text())
}

function sharesCard (wrapper: Awaited<ReturnType<typeof mountMonitoring>>['wrapper'], titleKey: string) {
  const card = wrapper.findAllComponents(SharesCard).find(shares => shares.props('title') === titleKey)
  if (!card) {
    throw new Error(`${titleKey} card not rendered`)
  }
  return card
}

function countryCard (wrapper: Awaited<ReturnType<typeof mountMonitoring>>['wrapper']) {
  return sharesCard(wrapper, 'heading.instance.monitoring.chart.visits.country')
}

describe('MonitoringView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getVisitorsReport).mockResolvedValue(visitsReport(8, 4))
    vi.mocked(getVisitsBreakdown).mockImplementation(async (_id, metric) => BREAKDOWN_DATA[metric] as never)
  })

  it('shows the skeleton of the visits card and no breakdown card while loading', async () => {
    vi.mocked(getVisitorsReport).mockReturnValue(neverSettles())
    vi.mocked(getVisitsBreakdown).mockReturnValue(neverSettles())

    const { wrapper } = await mountMonitoring()

    expect(wrapper.findComponent(MonitoringVisitorsCard).props('loading')).toBe(true)
    expect(wrapper.findComponent(ChartCardSkeleton).exists()).toBe(true)
    expect(wrapper.findComponent(SharesCard).exists()).toBe(false)
    expect(wrapper.findComponent(DoughnutChartCard).exists()).toBe(false)
    expect(wrapper.findComponent(PieChartCard).exists()).toBe(false)
    wrapper.unmount()
  })

  it('without an analytics provider shows the empty card and alerts once for the page breakdown', async () => {
    vi.mocked(getVisitorsReport).mockResolvedValue([] as never)
    vi.mocked(getVisitsBreakdown).mockImplementation(async (_id, metric) => {
      if (metric === 'page') {
        throw new Error('page failed')
      }
      return BREAKDOWN_DATA[metric] as never
    })

    const { wrapper, addAlert } = await mountMonitoring()

    expect(wrapper.findComponent(EmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(SharesCard).exists()).toBe(false)
    expect(addAlert).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders the ten cards in the legacy order with full data', async () => {
    const { wrapper } = await mountMonitoring()

    expect(cardTitles(wrapper)).toEqual(CARD_TITLES)
    expect(wrapper.findComponent(EmptyState).exists()).toBe(false)
    expect(getVisitorsReport).toHaveBeenCalledTimes(1)
    expect(getVisitsBreakdown).toHaveBeenCalledTimes(9)
    wrapper.unmount()
  })

  it('shows the DB-IP link only on the country, continent and region cards', async () => {
    const { wrapper } = await mountMonitoring()

    const dbipCards = ['country', 'continent', 'region'].map(card => `heading.instance.monitoring.chart.visits.${card}`)
    for (const titleKey of dbipCards) {
      const links = sharesCard(wrapper, titleKey).findAll('a[href="https://db-ip.com"]')
      expect(links).toHaveLength(1)
      expect(links[0]?.attributes('target')).toBe('_blank')
      expect(links[0]?.attributes('rel')).toBe('noopener')
    }
    for (const titleKey of ['heading.instance.monitoring.chart.visits.page', 'heading.instance.monitoring.chart.visits.referrer']) {
      expect(sharesCard(wrapper, titleKey).find('a[href="https://db-ip.com"]').exists()).toBe(false)
    }
    expect(wrapper.findAll('a[href="https://db-ip.com"]')).toHaveLength(3)
    wrapper.unmount()
  })

  it('hides the breakdown cards when the visits answer is empty, even with data', async () => {
    vi.mocked(getVisitorsReport).mockResolvedValue([] as never)

    const { wrapper } = await mountMonitoring()

    expect(wrapper.findComponent(EmptyState).exists()).toBe(true)
    expect(wrapper.findComponent(MonitoringVisitorsCard).exists()).toBe(false)
    expect(wrapper.findComponent(SharesCard).exists()).toBe(false)
    expect(wrapper.findComponent(DoughnutChartCard).exists()).toBe(false)
    expect(wrapper.findComponent(PieChartCard).exists()).toBe(false)
    expect(getVisitsBreakdown).toHaveBeenCalledTimes(9)
    wrapper.unmount()
  })

  it('alerts when the page breakdown fails and hides that card', async () => {
    vi.mocked(getVisitsBreakdown).mockImplementation(async (_id, metric) => {
      if (metric === 'page') {
        throw new Error('page failed')
      }
      return BREAKDOWN_DATA[metric] as never
    })

    const { wrapper, addAlert } = await mountMonitoring()

    expect(addAlert).toHaveBeenCalledTimes(1)
    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(cardTitles(wrapper)).not.toContain('heading.instance.monitoring.chart.visits.page')
    expect(wrapper.findComponent(SharesCard).exists()).toBe(true)
    wrapper.unmount()
  })

  it('alerts when the page breakdown answer is not a list (legacy throws on it)', async () => {
    vi.mocked(getVisitsBreakdown).mockImplementation(async (_id, metric) => (metric === 'page' ? {} : BREAKDOWN_DATA[metric]) as never)

    const { wrapper, addAlert } = await mountMonitoring()

    expect(addAlert).toHaveBeenCalledTimes(1)
    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(cardTitles(wrapper)).not.toContain('heading.instance.monitoring.chart.visits.page')
    wrapper.unmount()
  })

  it('swallows an error of another card silently and hides only that card', async () => {
    vi.mocked(getVisitsBreakdown).mockImplementation(async (_id, metric) => {
      if (metric === 'country') {
        throw new Error('country failed')
      }
      return BREAKDOWN_DATA[metric] as never
    })

    const { wrapper, addAlert } = await mountMonitoring()

    expect(addAlert).not.toHaveBeenCalled()
    expect(cardTitles(wrapper)).not.toContain('heading.instance.monitoring.chart.visits.country')
    expect(cardTitles(wrapper)).toContain('heading.instance.monitoring.chart.visits.page')
    wrapper.unmount()
  })

  it('refetches all ten cards for the new period and shows skeletons over the old data', async () => {
    const { wrapper } = await mountMonitoring()
    vi.mocked(getVisitorsReport).mockClear()
    vi.mocked(getVisitsBreakdown).mockClear()
    vi.mocked(getVisitorsReport).mockReturnValue(neverSettles())
    vi.mocked(getVisitsBreakdown).mockReturnValue(neverSettles())

    wrapper.findComponent(SelectDropdown).vm.$emit('update:modelValue', 'last-month')
    await flushPromises()

    expect(getVisitorsReport).toHaveBeenCalledTimes(1)
    expect(getVisitorsReport).toHaveBeenCalledWith(INSTANCE_ID, 'last-month')
    expect(getVisitsBreakdown).toHaveBeenCalledTimes(9)
    for (const metric of ['country', 'page', 'continent', 'region', 'referrer', 'device', 'device-brand', 'device-os', 'device-browser']) {
      expect(getVisitsBreakdown).toHaveBeenCalledWith(INSTANCE_ID, metric, 'last-month')
    }
    // The cards keep their rows and show their own skeleton: five shares, four pies and doughnuts, and the visits card.
    expect(wrapper.findComponent(ChartCardSkeleton).exists()).toBe(true)
    expect(wrapper.findAllComponents(SharesCardSkeleton)).toHaveLength(5)
    expect(wrapper.findAllComponents(PieChartSkeleton)).toHaveLength(4)
    wrapper.unmount()
  })

  it('keeps the data of the previous period when the new visits report fails', async () => {
    const { wrapper } = await mountMonitoring()
    vi.mocked(getVisitorsReport).mockRejectedValue(new Error('visits failed'))

    wrapper.findComponent(SelectDropdown).vm.$emit('update:modelValue', 'last-year')
    await flushPromises()

    const visits = wrapper.findComponent(MonitoringVisitorsCard)
    expect(visits.props('loading')).toBe(false)
    expect(visits.props('dataIndicators')[0]?.value).toBe(8)
    wrapper.unmount()
  })

  it('ignores an answer of the old period that arrives after the new one', async () => {
    const weekAnswer = deferred<VisitorsReport>()
    const monthAnswer = deferred<VisitorsReport>()
    vi.mocked(getVisitorsReport).mockImplementation((_id, period) => (period === 'last-week' ? weekAnswer.promise : monthAnswer.promise))

    const { wrapper } = await mountMonitoring()
    wrapper.findComponent(SelectDropdown).vm.$emit('update:modelValue', 'last-month')
    await flushPromises()

    monthAnswer.resolve(visitsReport(20, 10))
    await flushPromises()
    expect(wrapper.findComponent(MonitoringVisitorsCard).props('dataIndicators')[0]?.value).toBe(20)
    expect(wrapper.findComponent(MonitoringVisitorsCard).props('loading')).toBe(false)

    weekAnswer.resolve(visitsReport(10, 5))
    await flushPromises()
    expect(wrapper.findComponent(MonitoringVisitorsCard).props('dataIndicators')[0]?.value).toBe(20)
    expect(wrapper.findComponent(MonitoringVisitorsCard).props('loading')).toBe(false)
    wrapper.unmount()
  })

  it('keeps the rows of a breakdown card from the previous period when its new answer fails', async () => {
    const { wrapper } = await mountMonitoring()
    vi.mocked(getVisitsBreakdown).mockImplementation(async (_id, metric) => {
      if (metric === 'country') {
        throw new Error('country failed')
      }
      return BREAKDOWN_DATA[metric] as never
    })

    wrapper.findComponent(SelectDropdown).vm.$emit('update:modelValue', 'last-year')
    await flushPromises()

    expect(countryCard(wrapper).props('loading')).toBe(false)
    expect(countryCard(wrapper).props('data')).toEqual([{ label: 'Poland', data: 5, img: 'img/flags/PL.png' }])
    wrapper.unmount()
  })

  it('ignores a breakdown answer of the old period that arrives after the new one', async () => {
    const weekAnswer = deferred<unknown>()
    const monthAnswer = deferred<unknown>()
    vi.mocked(getVisitsBreakdown).mockImplementation((_id, metric, period) => {
      if (metric !== 'country') {
        return Promise.resolve(BREAKDOWN_DATA[metric])
      }
      return period === 'last-week' ? weekAnswer.promise : monthAnswer.promise
    })

    const { wrapper } = await mountMonitoring()
    wrapper.findComponent(SelectDropdown).vm.$emit('update:modelValue', 'last-month')
    await flushPromises()

    monthAnswer.resolve([{ label: 'Germany', visits: 9, code: 'DE' }])
    await flushPromises()
    expect(countryCard(wrapper).props('data')).toEqual([{ label: 'Germany', data: 9, img: 'img/flags/DE.png' }])
    expect(countryCard(wrapper).props('loading')).toBe(false)

    weekAnswer.resolve([{ label: 'Poland', visits: 5, code: 'PL' }])
    await flushPromises()
    expect(countryCard(wrapper).props('data')).toEqual([{ label: 'Germany', data: 9, img: 'img/flags/DE.png' }])
    expect(countryCard(wrapper).props('loading')).toBe(false)
    wrapper.unmount()
  })
})
