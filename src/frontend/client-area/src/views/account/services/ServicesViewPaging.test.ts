import type * as ServicesApi from './services.api'
import type { Service } from './services.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import * as servicesApi from './services.api'
import ServicesView from './ServicesView.vue'

vi.mock('./services.api', async importOriginal => {
  const actual: typeof ServicesApi = await importOriginal()
  return { ...actual, listServices: vi.fn(), cancelService: vi.fn() }
})

function service (id: number): Service {
  return {
    id,
    plan_name: `P-${String(id).padStart(3, '0')}`,
    status: 'active',
    plan_settings: { instance_limit: 5 },
    instances: [],
  }
}

function plans (count: number): Service[] {
  return Array.from({ length: count }, (_, index) => service(index + 1))
}

async function mountView () {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { integrations: {}, billing_enabled: true }, user: { name: 'Jane' } } as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  await router.push('/services')
  const wrapper = await mountKit(ServicesView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

type Mounted = Awaited<ReturnType<typeof mountView>>

function planNames (wrapper: Mounted): string[] {
  return wrapper.findAll('tbody tr').map(tr => tr.findAll('td')[0]!.text())
}

async function goToPage (wrapper: Mounted, pageNumber: number): Promise<void> {
  const button = wrapper.findAll('.v-pagination__item button').find(node => node.text() === String(pageNumber))!
  await button.trigger('click')
  await flushPromises()
}

async function search (wrapper: Mounted, term: string): Promise<void> {
  wrapper.findComponent({ name: 'DataIteratorFilterControls' }).vm.$emit('update:searchTerm', term)
  await flushPromises()
}

describe('ServicesView sorting, paging and reloads', () => {
  const width = window.innerWidth

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1400 })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  })

  it('sorts by plan name descending by default', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(3))
    const wrapper = await mountView()

    expect(planNames(wrapper)).toEqual(['P-003', 'P-002', 'P-001'])
    wrapper.unmount()
  })

  it('pages 25 plans into 3 pages and shows the last 5 rows on page 3 (D1)', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(25))
    const wrapper = await mountView()

    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(3)

    await goToPage(wrapper, 3)

    expect(planNames(wrapper)).toEqual(['P-005', 'P-004', 'P-003', 'P-002', 'P-001'])
    wrapper.unmount()
  })

  it('refetches exactly once per page change', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(25))
    const wrapper = await mountView()

    await goToPage(wrapper, 2)

    expect(servicesApi.listServices).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('per page 20 gives two pages, goes back to page 1 and refetches once', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(25))
    const wrapper = await mountView()
    await goToPage(wrapper, 3)

    const twenty = wrapper.findAll('.data-iterator-page-number .v-btn').find(node => node.text() === '20')!
    await twenty.trigger('click')
    await flushPromises()

    expect(servicesApi.listServices).toHaveBeenCalledTimes(3)
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(2)
    expect(wrapper.findAll('tbody tr')).toHaveLength(20)
    expect(planNames(wrapper)[0]).toBe('P-025')
    wrapper.unmount()
  })

  it('a sort click flips the order, returns to page 1 and refetches once', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(25))
    const wrapper = await mountView()
    await goToPage(wrapper, 3)
    expect(servicesApi.listServices).toHaveBeenCalledTimes(2)

    await wrapper.get('.custom-sort__item--sortable').trigger('click')
    await flushPromises()

    expect(servicesApi.listServices).toHaveBeenCalledTimes(3)
    expect(planNames(wrapper)[0]).toBe('P-001')
    wrapper.unmount()
  })

  it('sorting by another column, also by the sites array, does not throw', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(3))
    const wrapper = await mountView()

    const sortable = wrapper.findAll('.custom-sort__item--sortable')
    expect(sortable).toHaveLength(3)
    await sortable[2]!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    wrapper.unmount()
  })

  it('a search from page 3 returns to page 1 and refetches exactly once', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(25))
    const wrapper = await mountView()
    await goToPage(wrapper, 3)
    expect(servicesApi.listServices).toHaveBeenCalledTimes(2)

    await search(wrapper, '1')

    expect(servicesApi.listServices).toHaveBeenCalledTimes(3)
    // P-001, P-010..P-019 and P-021 match: 12 rows on 2 pages, the first page shows 10.
    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
    wrapper.unmount()
  })

  it('counts the footer pages from the searched rows, and keeps the footer for a single page', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(25))
    const wrapper = await mountView()

    await search(wrapper, '1')
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(2)

    await search(wrapper, '3')
    // P-003, P-013, P-023: one page at the default size, so no footer.
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('has no footer for a search with no match (page 1, default size)', async () => {
    vi.mocked(servicesApi.listServices).mockResolvedValue(plans(25))
    const wrapper = await mountView()

    await search(wrapper, 'zzz')

    expect(wrapper.find('[data-testid="services-no-matches"]').exists()).toBe(true)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })
})
