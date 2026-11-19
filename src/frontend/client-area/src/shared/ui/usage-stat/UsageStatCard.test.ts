import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import UsageStatCard from './UsageStatCard.vue'

const base = { title: 'RAM', percent: 25, ringText: '25%', testid: 'stat' }

describe('UsageStatCard', () => {
  it('renders the title, the ring text and a label list with default test ids', async () => {
    const wrapper = await mountKit(UsageStatCard, {
      props: { ...base, rows: [{ key: 'used', label: 'Used', value: '1 GB' }, { key: 'free', label: 'Available', value: '3 GB' }] },
    })

    expect(wrapper.get('[data-testid="stat"]').text()).toContain('RAM')
    expect(wrapper.get('[data-testid="stat-ring"]').text()).toBe('25%')
    expect(wrapper.get('[data-testid="stat-row-used"]').text()).toBe('1 GB')
    expect(wrapper.get('[data-testid="stat-row-free"]').text()).toBe('3 GB')
    expect(wrapper.findAll('dt').map(dt => dt.text())).toEqual(['Used', 'Available'])
    expect(wrapper.find('[data-testid="stat-note"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses the test id overrides for the ring and the rows', async () => {
    const wrapper = await mountKit(UsageStatCard, {
      props: { ...base, ringTestid: 'my-ring', rows: [{ key: 'used', label: 'Used', value: '1 GB', testid: 'my-used' }] },
    })

    expect(wrapper.find('[data-testid="stat-ring"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="my-ring"]').text()).toBe('25%')
    expect(wrapper.get('[data-testid="my-used"]').text()).toBe('1 GB')
    wrapper.unmount()
  })

  it('shows the note instead of the list', async () => {
    const wrapper = await mountKit(UsageStatCard, {
      props: { ...base, note: 'Current load', rows: [{ key: 'used', label: 'Used', value: '1 GB' }] },
    })

    expect(wrapper.get('[data-testid="stat-note"]').text()).toBe('Current load')
    expect(wrapper.find('dl').exists()).toBe(false)
    wrapper.unmount()
  })

  it('draws an empty ring for a null percent and marks small ring text', async () => {
    const wrapper = await mountKit(UsageStatCard, { props: { ...base, percent: null, ringText: '1.2 GB', ringTextSmall: true } })

    expect(wrapper.get('[data-testid="stat-ring"]').text()).toBe('1.2 GB')
    expect(wrapper.get('[data-testid="stat-ring"]').classes()).toContain('usage-stat__ring--small')
    expect(wrapper.get('[data-testid="stat-ring"]').attributes('aria-valuenow')).toBe('0')
    // The ring text is what the value means when there is no percent.
    expect(wrapper.get('[data-testid="stat-ring"]').attributes('aria-valuetext')).toBe('1.2 GB')
    wrapper.unmount()
  })

  it('names the ring by the card title, with no value text when there is a percent (review F7)', async () => {
    const wrapper = await mountKit(UsageStatCard, { props: base })

    expect(wrapper.get('[data-testid="stat-ring"]').attributes('role')).toBe('progressbar')
    expect(wrapper.get('[data-testid="stat-ring"]').attributes('aria-label')).toBe('RAM')
    expect(wrapper.get('[data-testid="stat-ring"]').attributes('aria-valuetext')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows only the skeleton while loading', async () => {
    const wrapper = await mountKit(UsageStatCard, { props: { ...base, loading: true, skeletonRows: 3, rows: [{ key: 'used', label: 'Used', value: '1 GB' }] } })

    expect(wrapper.find('[data-testid="stat-skeleton"]').exists()).toBe(true)
    expect(wrapper.findAll('.usage-stat__bone-row')).toHaveLength(3)
    expect(wrapper.find('[data-testid="stat-ring"]').exists()).toBe(false)
    expect(wrapper.find('dl').exists()).toBe(false)
    wrapper.unmount()
  })
})
