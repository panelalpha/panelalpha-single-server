// Kit pattern of the page title: the three variants, the slots and the filter column.
import { afterEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import PageTitle from './PageTitle.vue'

const width = window.innerWidth

async function mountTitle (innerWidth: number, options: Record<string, unknown>) {
  window.innerWidth = innerWidth
  return mountKit(PageTitle, options)
}

describe('PageTitle', () => {
  afterEach(() => {
    window.innerWidth = width
  })

  it('renders the Advanced title row with the legacy classes and no filter column without the slot', async () => {
    const wrapper = await mountTitle(1500, { props: { title: 'Users', titleTestid: 'users-title', variant: 'advanced' } })

    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['v-container', 'page-title', 'page-title--advanced', 'py-3']))
    const row = wrapper.get(':scope > .v-row')
    expect(row.classes()).toEqual(expect.arrayContaining(['page-title__row', 'mb-0']))
    expect(row.classes()).not.toContain('title-row')
    const heading = wrapper.get('.page-title__title-box.py-0 > h4.page-title__title')
    expect(heading.text()).toBe('Users')
    expect(heading.attributes('data-testid')).toBe('users-title')
    expect(wrapper.find('.page-title__filter-controls').exists()).toBe(false)
    wrapper.unmount()
  })

  it('puts the filters in the right column of the Advanced row, hidden with filtersVisible false', async () => {
    const slots = { filters: '<button data-testid="add">Add</button>' }
    const shown = await mountTitle(1500, { props: { title: 'T', variant: 'advanced', filtersTestid: 'controls' }, slots })
    const filters = shown.get('.page-title__filter-controls')
    expect(filters.classes()).toEqual(expect.arrayContaining(['pt-4', 'pt-lg-0', 'pb-0']))
    expect(filters.classes()).not.toContain('justify-end')
    expect(filters.attributes('data-testid')).toBe('controls')
    expect(filters.find('[data-testid="add"]').exists()).toBe(true)
    expect(filters.attributes('style') ?? '').not.toContain('display: none')
    shown.unmount()

    const hidden = await mountTitle(1500, { props: { title: 'T', variant: 'advanced', filtersVisible: false }, slots })
    expect(hidden.get('.page-title__filter-controls').attributes('style')).toContain('display: none')
    hidden.unmount()
  })

  it('drops only the advanced modifier for a project page', async () => {
    const wrapper = await mountTitle(1500, { props: { title: 'Backups', variant: 'project' } })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['page-title', 'py-3']))
    expect(wrapper.classes()).not.toContain('page-title--advanced')
    expect(wrapper.get('h4').classes()).toContain('page-title__title')
    wrapper.unmount()
  })

  it('renders a section title on the kit title row, stacked below lg', async () => {
    const slots = { filters: '<span data-testid="search" />' }
    const wide = await mountTitle(1500, { props: { title: 'Users', titleTestid: 'reseller-users-title' }, slots })
    expect(wide.classes()).toEqual(expect.arrayContaining(['container', 'px-0', 'py-3']))
    expect(wide.classes()).not.toContain('page-title')
    const row = wide.get(':scope > .v-row.title-row')
    expect(row.classes()).not.toContain('flex-column')
    expect(wide.get('.v-col.d-flex.align-center > h4.font-weight-light').attributes('data-testid')).toBe('reseller-users-title')
    const filters = wide.get('.page-title__filter-controls')
    expect(filters.classes()).toEqual(expect.arrayContaining(['d-flex', 'justify-end', 'align-end']))
    expect(filters.classes()).not.toContain('pb-3')
    wide.unmount()

    const narrow = await mountTitle(800, { props: { title: 'Users' }, slots })
    expect(narrow.get('.title-row').classes()).toEqual(expect.arrayContaining(['flex-column', 'flex-nowrap']))
    expect(narrow.get('.page-title__filter-controls').classes()).toContain('pb-3')
    narrow.unmount()
  })

  it('stacks a section where the screen says so', async () => {
    const stacked = await mountTitle(1500, { props: { title: 'DNS', stacked: true } })
    expect(stacked.get('.title-row').classes()).toContain('flex-column')
    stacked.unmount()

    const inline = await mountTitle(800, { props: { title: 'DNS', stacked: false } })
    expect(inline.get('.title-row').classes()).not.toContain('flex-column')
    inline.unmount()
  })

  it('renders the title slots around the heading and the bottom slot under the row, in the same container', async () => {
    const wrapper = await mountTitle(1500, {
      props: { title: 'Themes', variant: 'advanced' },
      slots: {
        'title-prepend': '<button data-testid="back">b</button>',
        'title-append': '<span data-testid="switch">s</span>',
        'bottom': '<div data-testid="bottom">x</div>',
      },
    })

    const box = wrapper.get('.page-title__title-box')
    expect((box.element.firstElementChild!).dataset.testid).toBe('back')
    expect(box.element.children.item(1)!.tagName).toBe('H4')
    expect((box.element.children.item(2)!).dataset.testid).toBe('switch')
    expect((wrapper.element.lastElementChild!).dataset.testid).toBe('bottom')
    wrapper.unmount()
  })

  it('replaces the heading with the title slot and renders no heading without a title', async () => {
    const tabs = await mountTitle(1500, { props: { variant: 'advanced' }, slots: { title: '<div data-testid="tabs">t</div>' } })
    expect(tabs.find('h4').exists()).toBe(false)
    expect(tabs.find('.page-title__title-box [data-testid="tabs"]').exists()).toBe(true)
    tabs.unmount()

    const empty = await mountTitle(1500, { props: {} })
    expect(empty.find('h4').exists()).toBe(false)
    expect(empty.find('.title-row > .v-col.d-flex.align-center').exists()).toBe(true)
    empty.unmount()
  })

  it('puts titleColClass on the title column of every variant and nothing without it', async () => {
    const section = await mountTitle(1500, { props: { title: 'Addresses', titleColClass: 'screen-title-col' } })
    expect(section.get('h4').element.closest('.v-col')!.classList.contains('screen-title-col')).toBe(true)
    section.unmount()

    const advanced = await mountTitle(1500, { props: { title: 'Users', variant: 'advanced', titleColClass: 'screen-title-col' } })
    expect(advanced.get('.page-title__title-box').classes()).toContain('screen-title-col')
    advanced.unmount()

    const plain = await mountTitle(1500, { props: { title: 'Plain' } })
    expect(plain.get('h4').element.closest('.v-col')!.className).not.toContain('undefined')
    plain.unmount()
  })
})
