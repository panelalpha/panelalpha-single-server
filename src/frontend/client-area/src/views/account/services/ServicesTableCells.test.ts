import type { ServiceRow } from './services.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
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

describe('ServicesTable cells', () => {
  const width = window.innerWidth

  afterEach(() => {
    setWidth(width)
  })

  it('shows the plan name with the status chip, the limit and "-" for no sites', async () => {
    setWidth(1400)
    const wrapper = await mountTable({
      services: [
        row(1, { plan_name: 'Starter', status: 'suspended', instances_count: 0, plan_settings: { instance_limit: 5 } }),
        row(2, { plan_name: 'Trial', is_trial: true, trial_expiry_at: '2000-01-01T00:00:00Z' }),
        row(3, { plan_name: 'Pro' }),
      ],
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.text()).toContain('Starter')
    expect(rows[0]!.text()).toContain('general.suspended')
    expect(rows[0]!.text()).toContain('0/5')
    expect(rows[0]!.findAll('td')[2]!.text()).toBe('-')
    expect(rows[1]!.text()).toMatch(/Expires .*ago/)
    // The limit chip only: no status chip for an active paid plan.
    expect(rows[2]!.findAll('.custom-label')).toHaveLength(1)
    expect(rows[2]!.find('.custom-label').classes()).toContain('custom-label--purple')
    wrapper.unmount()
  })

  it('shows the first domain and a "+ N more" tooltip with a chip per known domain type', async () => {
    setWidth(1400)
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(ServicesTable, {
      attachTo: host,
      global: { plugins: [createPinia()] },
      props: {
        services: [row(1, {
          instances_count: 2,
          instances: [
            { id: 1, domain: 'one.test', domain_type: 'main' },
            { id: 2, domain: 'two.test', domain_type: 'sub', parent_id: 1 },
            { id: 3, domain: 'three.test', domain_type: 'weird' },
          ],
        })],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('one.test')
    const more = wrapper.get('[data-testid="services-more-sites"]')
    expect(more.text()).toBe('+ 2 more')
    await more.trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    const tooltip = document.body.querySelector('[data-testid="services-sites-tooltip"]')!
    expect(tooltip.textContent).toContain('general.sites (3)')
    expect(tooltip.querySelectorAll('li')).toHaveLength(3)
    expect(tooltip.querySelectorAll('li .custom-label')).toHaveLength(2)
    wrapper.unmount()
    host.remove()
  })

  it('has no tooltip for a single site', async () => {
    setWidth(1400)
    const wrapper = await mountTable({
      services: [row(1, { instances_count: 1, instances: [{ id: 1, domain: 'one.test' }] })],
    })

    expect(wrapper.find('[data-testid="services-more-sites"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders Upgrade as an external link, orange with white text for a trial', async () => {
    setWidth(1400)
    const wrapper = await mountTable({
      services: [
        row(1, { plan_upgrade_link: 'https://shop.test/up', is_trial: true }),
        row(2, { plan_upgrade_link: 'https://shop.test/up2' }),
        row(3),
      ],
    })

    const buttons = wrapper.findAll('[data-testid="services-upgrade"]')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.attributes('href')).toBe('https://shop.test/up')
    expect(buttons[0]!.attributes('target')).toBe('_blank')
    expect(buttons[0]!.classes()).toContain('bg-orange')
    expect(buttons[0]!.find('span.text-white').exists()).toBe(true)
    expect(buttons[1]!.classes()).toContain('bg-primary')
    expect(buttons[1]!.find('span.text-white').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the card with sortable labels under 600px (K-08 D3: card below the lg breakpoint, sort on the labels)', async () => {
    setWidth(500)
    const wrapper = await mountTable({ services: [row(1, { plan_name: 'Starter' })] })

    expect(wrapper.find('.mobile-table-item').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.findAll('.mobile-table-item__header[role="button"]')).toHaveLength(3)
    expect(wrapper.find('.v-data-table__td-title').exists()).toBe(false)
    wrapper.unmount()
  })

  it('offers Cancel for every plan except a cancelled one, and passes service-cancelled on', async () => {
    setWidth(1400)
    const wrapper = await mountTable({
      services: [row(1, { status: 'cancelled' }), row(2, { status: 'active' }), row(3, { status: 'suspended' })],
    })

    expect(wrapper.findAll('[data-testid="services-cancel-open"]')).toHaveLength(2)
    wrapper.findComponent({ name: 'CancelServiceButton' }).vm.$emit('service-cancelled', 2)
    expect(wrapper.emitted('service-cancelled')).toEqual([[2]])
    wrapper.unmount()
  })

  it('billing off hides Cancel, Upgrade, the trial chip and the Actions header, and keeps the Suspended chip (ID-56)', async () => {
    setWidth(1400)
    const wrapper = await mountTable({
      billingEnabled: false,
      services: [
        row(1, { plan_name: 'Trial', is_trial: true, trial_expiry_at: '2000-01-01T00:00:00Z', plan_upgrade_link: 'https://shop.test/up' }),
        row(2, { plan_name: 'Held', status: 'suspended' }),
      ],
    })

    expect(wrapper.find('[data-testid="services-cancel-open"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="services-upgrade"]').exists()).toBe(false)
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.text()).not.toMatch(/Expires/)
    expect(rows[1]!.text()).toContain('general.suspended')
    expect(wrapper.text()).not.toContain('actions')
    expect(rows[0]!.findAll('td')).toHaveLength(3)
    wrapper.unmount()
  })

  it('billing off leaves the Actions field out of the card (ID-56)', async () => {
    setWidth(900)
    const wrapper = await mountTable({
      billingEnabled: false,
      services: [row(1, { plan_upgrade_link: 'https://shop.test/up' })],
    })

    expect(wrapper.find('.mobile-table-item').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('table.header.actions')
    expect(wrapper.find('.mobile-table-item__actions').exists()).toBe(false)
    wrapper.unmount()
  })

  it('billing on keeps the Actions field in the card', async () => {
    setWidth(900)
    const wrapper = await mountTable({ services: [row(1)] })

    expect(wrapper.text()).toContain('table.header.actions')
    expect(wrapper.find('[data-testid="services-cancel-open"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows "3 / Unlimited" for an unlimited limit and "0/5" for a limited one (ID-56)', async () => {
    setWidth(1400)
    const wrapper = await mountTable({
      services: [
        row(1, { instances_count: 3, instances: [{ id: 1, domain: 'a.test' }], plan_settings: { instance_limit: '9223372036854775807' } }),
        row(2),
      ],
    })

    const chips = wrapper.findAll('[data-testid="services-count-chip"]').map(chip => chip.text())
    expect(chips).toEqual(['3 / form.value.unlimited', '0/5'])
    wrapper.unmount()
  })

  it('shows the card between 600px and the lg breakpoint (K-08 D3)', async () => {
    setWidth(900)
    const wrapper = await mountTable({ services: [row(1)] })

    expect(wrapper.find('.mobile-table-item').exists()).toBe(true)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    wrapper.unmount()
  })
})
