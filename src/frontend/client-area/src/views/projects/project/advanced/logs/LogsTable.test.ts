import type { InstanceLogRow } from '@/entities/project/instance-logs.api'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
import { mountKit } from '@/test/mount-kit'
import { LOG_HEADERS, LOGS_POSSIBLE_PER_PAGE } from './logs-table'
import LogsTable from './LogsTable.vue'

const items: InstanceLogRow[] = [
  { user: { email: 'jan@example.com', first_name: 'Jan', last_name: 'Kowalski', role: null }, action: 'label', request_method: 'POST', payload: null, date: 1_700_000_000_000 },
  { user: { email: 'ewa@example.com', first_name: 'Ewa', last_name: 'Nowak', role: null }, action: 'label', request_method: 'POST', payload: null, date: 1_700_000_100_000 },
]

describe('LogsTable (kit-data-table-advanced)', () => {
  const width = window.innerWidth

  beforeEach(() => {
    window.innerWidth = 1600
  })

  afterEach(() => {
    window.innerWidth = width
  })

  async function mountWith (w: number, extra: Record<string, unknown> = {}) {
    window.innerWidth = w
    setActivePinia(createPinia())
    return mountKit(LogsTable, {
      props: {
        items,
        itemsLoading: false,
        itemsPerPage: 10,
        itemsTotal: items.length,
        page: 1,
        possibleItemsPerPage: LOGS_POSSIBLE_PER_PAGE,
        searchTerm: '',
        sortBy: false,
        sortDesc: true,
        headers: LOG_HEADERS,
        ...extra,
      },
    })
  }

  it('sortuje przez nagłówek daty', async () => {
    const wrapper = await mountWith(1600)

    await wrapper.findAll('.custom-sort__item--sortable')[0]!.trigger('click')

    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'date' })
    wrapper.unmount()
  })

  it('przekazuje zmianę strony i rozmiaru ze stopki', async () => {
    const wrapper = await mountWith(1600)

    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:page', 2)
    wrapper.findComponent(DataIteratorFooter).vm.$emit('update:items-per-page', 16)

    expect(wrapper.emitted('update:page')).toEqual([[2]])
    expect(wrapper.emitted('update:items-per-page')).toEqual([[16]])
    wrapper.unmount()
  })

  it('pokazuje no-results dla frazy bez wyników i emituje clear-filters', async () => {
    const wrapper = await mountWith(1600, { items: [], itemsTotal: 0, searchTerm: 'x' })

    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(true)
    wrapper.findComponent(DataIteratorNoResultsContainer).vm.$emit('clear-all-filters')

    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('pokazuje pusty stan, gdy nie ma wpisów i nie ma frazy', async () => {
    const wrapper = await mountWith(1600, { items: [], itemsTotal: 0 })

    expect(wrapper.find('[data-testid="instance-logs-empty"]').exists()).toBe(true)
    expect(wrapper.findComponent(DataIteratorNoResultsContainer).exists()).toBe(false)
    wrapper.unmount()
  })

  it('nie pokazuje pustego stanu w czasie ładowania ani przy wierszach', async () => {
    let wrapper = await mountWith(1600, { items: [], itemsTotal: 0, itemsLoading: true })

    expect(wrapper.find('[data-testid="instance-logs-empty"]').exists()).toBe(false)
    wrapper.unmount()

    wrapper = await mountWith(1600)

    expect(wrapper.find('[data-testid="instance-logs-empty"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('karta poniżej 1400 px i tabela od 1400 px', async () => {
    let wrapper = await mountWith(1300)

    expect(wrapper.findAll('.mobile-table-item')).toHaveLength(items.length)
    wrapper.unmount()

    wrapper = await mountWith(1500)

    expect(wrapper.findAll('.mobile-table-item')).toHaveLength(0)
    wrapper.unmount()
  })

  it('pokazuje szkielet w czasie ładowania', async () => {
    const wrapper = await mountWith(1600, { itemsLoading: true })

    expect(wrapper.findAll('.v-skeleton-loader').length).toBeGreaterThan(0)
    wrapper.unmount()
  })
})
