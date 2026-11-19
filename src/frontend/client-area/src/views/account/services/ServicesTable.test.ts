import type { ProjectState } from './service-limits'
import type { ServiceRow } from './services.types'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ServicesTable from './ServicesTable.vue'

function setWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

function row (id: number, overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id,
    plan_name: `Plan ${id}`,
    status: 'active',
    plan_settings: { instance_limit: 5 },
    instances: [],
    instances_count: 0,
    ...overrides,
  }
}

async function mountTable (props: Record<string, unknown>) {
  const wrapper = await mountKit(ServicesTable, { props, global: { plugins: [createPinia()] } })
  await flushPromises()
  return wrapper
}

describe('ServicesTable', () => {
  it('shows the empty-table message for an empty list without a search', async () => {
    const wrapper = await mountTable({ services: [] })

    expect(wrapper.find('[data-testid="services-empty"]').text()).toContain('message.emptyTable.services.title')
    expect(wrapper.find('[data-testid="services-no-results"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the no-results container with Clear filter for an empty list with a search', async () => {
    const wrapper = await mountTable({ services: [], searchTerm: 'zzz' })

    expect(wrapper.find('[data-testid="services-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="services-no-results"]').exists()).toBe(true)
    await wrapper.get('[data-testid="services-no-results"] button').trigger('click')
    expect(wrapper.emitted('update:search-term')).toEqual([['']])
    wrapper.unmount()
  })

  it('shows the Vuetify no-results text when a search hides a non-empty list', async () => {
    const wrapper = await mountTable({ services: [row(1), row(2)], searchTerm: 'zzz' })

    expect(wrapper.find('[data-testid="services-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="services-no-results"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="services-no-matches"]').text()).toBe('No matching records found')
    wrapper.unmount()
  })

  it('searches the plan name and the instance count, not the instances array (D3)', async () => {
    const wrapper = await mountTable({
      services: [
        row(1, { plan_name: 'Alpha', instances_count: 1, instances: [{ id: 1, domain: 'a.test' }] }),
        row(2, { plan_name: 'Beta' }),
      ],
      searchTerm: 'alp',
    })
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    await wrapper.setProps({ searchTerm: 'object' })
    expect(wrapper.find('[data-testid="services-no-matches"]').exists()).toBe(true)
    wrapper.unmount()
  })

  describe('limits (paid editions)', () => {
    const withProject = row(1, { instances: [{ id: 7, domain: 'a.test' }], instances_count: 1 })
    const project = {
      id: 7,
      domain: 'a.test',
      staging: false,
      resources: {
        usage: null,
        disk: null,
        limits: { memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: 200_000, device_read_bps: -1, device_write_bps: -1 },
        ceilings: { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null },
      },
      hasManageLimitsPrivilege: () => true,
    } as unknown as InstanceResource
    const ready = (): ProjectState => ({ status: 'ready', instance: project })

    it('adds the Limits column with the chips of the project limits and Manage limits in Actions, also with billing off', async () => {
      const wrapper = await mountTable({ services: [withProject], billingEnabled: false, limitsEnabled: true, limitsStateOf: ready })

      expect(wrapper.text()).toContain('Limits')
      const summary = wrapper.get('[data-testid="services-limits-summary"]')
      expect(summary.findAll('.status-label--gray').map(chip => chip.text())).toEqual(['2 GB RAM', '1 core CPU', '10 GB disk'])
      expect(summary.text()).toContain('+1 more')
      expect(wrapper.get('[data-testid="services-limits"]').text()).toBe('Manage limits')
      expect(wrapper.find('[data-testid="services-cancel-open"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows a skeleton while the project loads, and no action yet', async () => {
      const wrapper = await mountTable({ services: [withProject], limitsEnabled: true, limitsStateOf: () => ({ status: 'loading' }) })

      expect(wrapper.find('[data-testid="services-limits-loading"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="services-limits"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows a dash and no action when the project could not be read', async () => {
      const wrapper = await mountTable({ services: [withProject], limitsEnabled: true, limitsStateOf: () => ({ status: 'failed' }) })

      expect(wrapper.get('[data-testid="services-limits-none"]').text()).toBe('-')
      expect(wrapper.find('[data-testid="services-limits"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('has no Limits column and no Actions column in the Community panel without billing', async () => {
      const wrapper = await mountTable({ services: [withProject], billingEnabled: false, limitsEnabled: false, limitsStateOf: ready })

      expect(wrapper.find('[data-testid="services-limits-summary"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="services-limits"]').exists()).toBe(false)
      expect(wrapper.find('.actions-row').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  it('renders the sort header row only after loading', async () => {
    const wrapper = await mountTable({ services: [row(1)] })
    expect(wrapper.find('tr.custom-sort').exists()).toBe(true)
    wrapper.unmount()
  })

  describe('loading', () => {
    const width = window.innerWidth

    afterEach(() => {
      setWidth(width)
    })

    it('shows the sort and item skeletons on desktop and no header row', async () => {
      setWidth(1400)
      const wrapper = await mountTable({ services: [row(1)], loading: true })

      expect(wrapper.find('thead.item.sort').exists()).toBe(true)
      expect(wrapper.findAll('thead.item.sort th')).toHaveLength(4)
      // The skeleton is the DataTable `logs` pattern, five rows.
      expect(wrapper.findAll('tbody.item tr')).toHaveLength(5)
      expect(wrapper.find('.mobile-item').exists()).toBe(false)
      expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
      wrapper.unmount()
    })

    it('shows five mobile skeletons at lgAndDown', async () => {
      setWidth(900)
      const wrapper = await mountTable({ services: [row(1)], loading: true })

      expect(wrapper.findAll('.mobile-item')).toHaveLength(5)
      expect(wrapper.find('thead.item.sort').exists()).toBe(false)
      expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
      wrapper.unmount()
    })

    it('keeps the empty-table message away while loading', async () => {
      setWidth(1400)
      const wrapper = await mountTable({ services: [], loading: true })

      expect(wrapper.find('[data-testid="services-empty"]').exists()).toBe(false)
      wrapper.unmount()
    })
  })
})

// Characterization before the data table move: behavior only.
describe('ServicesTable paging (kit-data-table-account-reseller)', () => {
  const rows25 = Array.from({ length: 25 }, (_, i) => row(i + 1))

  beforeEach(() => {
    setWidth(1400)
  })

  it('emits update:page once for a footer click', async () => {
    const wrapper = await mountTable({ services: rows25, itemsPerPage: 10, page: 1 })

    wrapper.findComponent({ name: 'DataIteratorFooter' }).vm.$emit('update:page', 2)
    await flushPromises()

    expect(wrapper.emitted('update:page')).toEqual([[2]])
    wrapper.unmount()
  })

  it('does not emit update:page when a search clamps the page', async () => {
    const wrapper = await mountTable({ services: rows25, itemsPerPage: 10, page: 3 })

    await wrapper.setProps({ searchTerm: 'Plan 1' })
    await flushPromises()

    expect(wrapper.emitted('update:page')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits update:search-term with empty text from Clear filters of the no-results container', async () => {
    const wrapper = await mountTable({ services: [], searchTerm: 'x' })

    await wrapper.get('[data-testid="services-no-results"] button').trigger('click')

    expect(wrapper.emitted('update:search-term')).toEqual([['']])
    wrapper.unmount()
  })
})
