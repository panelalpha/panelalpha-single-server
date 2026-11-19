import type { PagesSidebarGroup } from './pages-sidebar'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mountKit } from '@/test/mount-kit'
import PagesSidebar from './PagesSidebar.vue'

const groups: PagesSidebarGroup[] = [
  { key: 'one', title: 'One', items: [{ key: 'a', title: 'Item A' }, { key: 'b', title: 'Item B', active: true, dot: 'b' }] },
  { key: 'empty', title: 'Empty', items: [] },
  { key: 'two', title: 'Two', items: [{ key: 'c', title: 'Item C' }] },
]

const originalWidth = window.innerWidth

afterEach(() => {
  window.innerWidth = originalWidth
})

async function mountAt (width: number, props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  window.innerWidth = width
  return mountKit(PagesSidebar, {
    props: { groups, testidPrefix: 'demo', listTestid: 'demo-list', tabsTestid: 'demo-tabs', ...props },
    slots,
  })
}

describe('PagesSidebar', () => {
  it('lista od 1200 px: subheadery niepustych grup, testidy i kropka', async () => {
    const wrapper = await mountAt(1500)

    const subheaders = wrapper.findAll('.v-list-subheader').map(el => el.text())
    expect(subheaders).toEqual(['One', 'Two'])
    const testids = wrapper.findAll('.v-list-item').map(el => el.attributes('data-testid'))
    expect(testids).toEqual(['demo-sidebar-a', 'demo-sidebar-b', 'demo-sidebar-c'])
    expect(wrapper.find('[data-testid="demo-sidebar-b-dot"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="demo-list"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-tab')).toHaveLength(0)
  })

  it('aktywna pozycja i select po kliku', async () => {
    const wrapper = await mountAt(1500)

    expect(wrapper.find('[data-testid="demo-sidebar-b"]').classes()).toContain('v-list-item--active')
    expect(wrapper.find('[data-testid="demo-sidebar-a"]').classes()).not.toContain('v-list-item--active')
    await wrapper.find('[data-testid="demo-sidebar-c"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['c']])
  })

  it('odstęp pierwszego subheadera', async () => {
    const plain = await mountAt(1500)
    expect(plain.find('.v-list-subheader').classes()).toContain('mt-0')

    const withSlot = await mountAt(1500, {}, {
      'list-before': () => h('div', { 'data-testid': 'before' }, 'x'),
    })
    expect(withSlot.find('[data-testid="before"]').exists()).toBe(true)
    expect(withSlot.find('.v-list-subheader').classes()).toContain('mt-6')
  })

  it('wąska lista poniżej 1400 px', async () => {
    const narrow = await mountAt(1300)
    expect(narrow.find('[data-testid="demo-list"]').classes()).toContain('sticky-sidebar__item--narrow')

    const wide = await mountAt(1500)
    expect(wide.find('[data-testid="demo-list"]').classes()).not.toContain('sticky-sidebar__item--narrow')
  })

  it('zakładki poniżej 1200 px: kolejność grup, zaznaczenie, kropka, select i slot', async () => {
    const wrapper = await mountAt(500, {}, {
      'tabs-before': () => h('div', { 'data-testid': 'tabs-before' }),
    })

    const tabs = wrapper.find('[data-testid="demo-tabs"]')
    expect(tabs.exists()).toBe(true)
    expect(tabs.classes()).toContain('mt-4')
    const testids = wrapper.findAll('.v-tab').map(el => el.attributes('data-testid'))
    expect(testids).toEqual(['demo-tab-a', 'demo-tab-b', 'demo-tab-c'])
    expect(wrapper.find('[data-testid="demo-tab-b"]').classes()).toContain('v-tab--selected')
    expect(wrapper.find('[data-testid="demo-tab-b-dot"]').exists()).toBe(true)
    await wrapper.find('[data-testid="demo-tab-c"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['c']])
    expect(wrapper.find('[data-testid="tabs-before"]').exists()).toBe(true)
  })

  it('aktywna zakładka to biała pigułka z elevation-2, nieaktywne bez (issue #35)', async () => {
    const wrapper = await mountAt(500)

    const active = wrapper.find('[data-testid="demo-tab-b"]').classes()
    expect(active).toContain('v-tab--selected')
    expect(active).toContain('elevation-2')
    const inactive = wrapper.find('[data-testid="demo-tab-a"]').classes()
    expect(inactive).not.toContain('v-tab--selected')
    expect(inactive).not.toContain('elevation-2')
  })

  it('bez aktywnej pozycji zaznaczona pierwsza zakładka', async () => {
    const wrapper = await mountAt(500, {
      groups: [{ key: 'g', items: [{ key: 'x', title: 'X' }, { key: 'y', title: 'Y' }] }],
    })

    expect(wrapper.find('[data-testid="demo-tab-x"]').classes()).toContain('v-tab--selected')
  })

  it('mt-4 tylko na mobile', async () => {
    const wrapper = await mountAt(1100)

    const tabs = wrapper.find('[data-testid="demo-tabs"]')
    expect(tabs.exists()).toBe(true)
    expect(tabs.classes()).not.toContain('mt-4')
  })
})
