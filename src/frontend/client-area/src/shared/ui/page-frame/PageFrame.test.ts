// Kit pattern of the page frame: the title row, the tab strip, the divider and the three body forms.
import { afterEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PageFrame from './PageFrame.vue'

const width = window.innerWidth

async function mountFrame (innerWidth: number, options: Record<string, unknown>) {
  window.innerWidth = innerWidth
  return mountKit(PageFrame, options)
}

describe('PageFrame', () => {
  afterEach(() => {
    window.innerWidth = width
  })

  it('renders the title row, the divider and a plain body without a sidebar', async () => {
    const wrapper = await mountFrame(1500, {
      props: { title: 'My plans', testidPrefix: 'services' },
      slots: { default: '<div data-testid="body">x</div>' },
    })

    expect(wrapper.classes()).toContain('page-frame')
    expect(wrapper.classes()).not.toContain('page-frame--highlight-rows')
    expect(wrapper.get('.top-title [data-testid="services-title"]').text()).toBe('My plans')
    expect(wrapper.get('.page-frame__head').classes()).toEqual(expect.arrayContaining(['mt-7', 'mb-7', 'flex-row']))
    expect(wrapper.get('.v-divider').classes()).toContain('mb-10')
    expect(wrapper.get('.page-frame__body').classes()).toEqual(expect.arrayContaining(['px-0', 'py-3']))
    expect(wrapper.get('.page-frame__body').attributes('data-testid')).toBeUndefined()
    expect(wrapper.find('.page-frame__body [data-testid="body"]').exists()).toBe(true)
    expect(wrapper.find('.page-frame__body .v-row').exists()).toBe(false)
    expect(wrapper.find('.v-tabs').exists()).toBe(false)
    expect(wrapper.find('.page-frame__filters').exists()).toBe(false)
    wrapper.unmount()
  })

  it('puts the sidebar beside the content column, with pl-12 from 1200px', async () => {
    const slots = { sidebar: '<div data-testid="side">s</div>', default: '<div data-testid="body">x</div>' }
    const wide = await mountFrame(1500, { props: { title: 'T', testidPrefix: 'x' }, slots })
    const row = wide.get('.page-frame__body > .v-row')
    expect(row.classes()).toEqual(expect.arrayContaining(['mx-0', 'flex-lg-row', 'flex-column']))
    expect(row.find('[data-testid="side"]').exists()).toBe(true)
    const content = row.get('.v-col--cols-lg-10')
    expect(content.classes()).toEqual(expect.arrayContaining(['v-col--cols-12', 'pl-12']))
    expect(content.find('[data-testid="body"]').exists()).toBe(true)
    wide.unmount()

    const narrow = await mountFrame(800, { props: { title: 'T', testidPrefix: 'x' }, slots })
    expect(narrow.get('.v-col--cols-lg-10').classes()).not.toContain('pl-12')
    expect(narrow.get('.page-frame__body > .v-row').classes()).toContain('mobile-container')
    expect(narrow.get('.page-frame__head').classes()).toEqual(expect.arrayContaining(['mt-3', 'mb-3']))
    expect(narrow.get('.v-divider').classes()).toContain('mb-3')
    narrow.unmount()
  })

  it('keeps the row and column when the sidebar is empty, with a full width content column', async () => {
    const slots = { sidebar: '', default: '<div data-testid="body">x</div>' }
    const wrapper = await mountFrame(1500, { props: { title: 'T', testidPrefix: 'x', sidebarEmpty: true }, slots })

    const row = wrapper.get('.page-frame__body > .v-row')
    const content = row.get('.v-col--cols-lg-12')
    expect(content.classes()).not.toContain('pl-12')
    expect(row.find('.v-col--cols-lg-10').exists()).toBe(false)
    expect(content.find('[data-testid="body"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the empty slot instead of the body', async () => {
    const wrapper = await mountFrame(1500, {
      props: { title: 'T', testidPrefix: 'x' },
      slots: { empty: '<div data-testid="empty">e</div>', sidebar: '<div data-testid="side" />', default: '<div data-testid="body" />' },
    })

    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
    expect(wrapper.find('.page-frame__body').exists()).toBe(false)
    expect(wrapper.find('[data-testid="side"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="body"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sets the body test id and the row highlight modifier', async () => {
    const wrapper = await mountFrame(1500, {
      props: { title: 'T', testidPrefix: 'x', bodyTestid: 'billing-content', highlightRows: true },
      slots: { default: '<div />' },
    })

    expect(wrapper.classes()).toContain('page-frame--highlight-rows')
    expect(wrapper.get('.page-frame__body').attributes('data-testid')).toBe('billing-content')
    wrapper.unmount()
  })

  it('puts the filters beside the title and under it below 976px', async () => {
    const slots = { filters: '<div data-testid="filters">f</div>', default: '<div />' }
    const wide = await mountFrame(1500, { props: { title: 'T', testidPrefix: 'x' }, slots })
    expect(wide.get('.page-frame__head').classes()).toContain('flex-row')
    const filters = wide.get('.page-frame__head > .page-frame__filters')
    expect(filters.classes()).toContain('page-title__filter-controls')
    expect(filters.find('[data-testid="filters"]').exists()).toBe(true)
    wide.unmount()

    const narrow = await mountFrame(800, { props: { title: 'T', testidPrefix: 'x' }, slots })
    expect(narrow.get('.page-frame__head').classes()).toContain('flex-column')
    expect(narrow.get('.page-frame__filters').classes()).toContain('mt-3')
    narrow.unmount()

    const plain = await mountFrame(800, { props: { title: 'T', testidPrefix: 'x' }, slots: { default: '<div />' } })
    expect(plain.get('.page-frame__head').classes()).toContain('flex-row')
    plain.unmount()
  })

  it('renders the page tab strip and emits the selected tab', async () => {
    const tabs = [{ value: 0, title: 'General' }, { value: 1, title: 'Backups', testid: 'x-tab-backups' }]
    const wrapper = await mountFrame(1500, {
      props: { title: 'Settings', testidPrefix: 'settings', tabs, tab: 1 },
      slots: { default: '<div />' },
    })

    expect(wrapper.get('[data-testid="settings-tabs"]').classes()).toContain('v-tabs--page')
    expect(wrapper.findAll('.v-tab').map(item => item.text())).toEqual(['General', 'Backups'])
    expect(wrapper.get('.v-tab--selected').text()).toBe('Backups')
    expect(wrapper.find('[data-testid="x-tab-backups"]').exists()).toBe(true)
    expect(wrapper.get('.page-frame__head-container').classes()).toContain('pb-0')
    await wrapper.findAll('.v-tab')[0]!.trigger('click')
    expect(wrapper.emitted('update:tab')).toEqual([[0]])
    wrapper.unmount()
  })

  it('names the tab strip with tabsLabel and leaves it unnamed without', async () => {
    const tabs = [{ value: 0, title: 'All' }, { value: 1, title: 'Failed' }]
    const named = await mountFrame(1500, { props: { title: 'T', testidPrefix: 'x', tabs, tabsLabel: 'Status' }, slots: { default: '<div />' } })
    expect(named.get('[data-testid="x-tabs"]').attributes('aria-label')).toBe('Status')
    named.unmount()

    const plain = await mountFrame(1500, { props: { title: 'T', testidPrefix: 'x', tabs }, slots: { default: '<div />' } })
    expect(plain.get('[data-testid="x-tabs"]').attributes('aria-label')).toBeUndefined()
    plain.unmount()
  })

  it('pads the title container below when there are no tabs', async () => {
    const wrapper = await mountFrame(1500, { props: { title: 'T', testidPrefix: 'x' }, slots: { default: '<div />' } })

    expect(wrapper.get('.page-frame__head-container').classes()).toEqual(expect.arrayContaining(['px-0', 'pt-3', 'pb-3']))
    wrapper.unmount()
  })
})
