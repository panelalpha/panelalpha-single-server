import { afterEach, describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DataIteratorFooter from './DataIteratorFooter.vue'

const base = {
  page: 1,
  numberOfPages: 3,
  possibleItemsPerPage: [[4, 8, 16]],
  itemsPerPage: 8,
  listStyle: 0,
}

describe('DataIteratorFooter', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  it('renders the class contract, pagination and per-page buttons', async () => {
    const wrapper = await mountKit(DataIteratorFooter, { props: base })
    expectLegacyClasses(wrapper.element, ['data-iterator-footer', 'my-3', 'mx-4', 'v-row'])
    expect(wrapper.find('.v-pagination').exists()).toBe(true)
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(3)
    const number = wrapper.get('.data-iterator-page-number')
    expect(number.get('span').text()).toBe('table.footer.record')
    const buttons = number.findAll('button')
    expect(buttons.map(b => b.text())).toEqual(['4', '8', '16'])
    expect(buttons[1]!.classes()).toContain('active')
    expect(buttons[0]!.classes()).not.toContain('active')
    wrapper.unmount()
  })

  it('shows the Vuetify 2 page list (issue #13)', async () => {
    // Legacy v-pagination `items`: `1 2 3 4 … 45 46 47 48` (V4 would show `1 … 8 … 48`).
    const wrapper = await mountKit(DataIteratorFooter, { props: { ...base, numberOfPages: 48, page: 6 } })
    expect(wrapper.findAll('.v-pagination__list > li').map(li => li.text()).filter(Boolean).join(' ')).toBe('1 ... 4 5 6 7 8 ... 48')
    wrapper.unmount()
  })

  it('uses perPageLabel instead of the default copy', async () => {
    const wrapper = await mountKit(DataIteratorFooter, { props: { ...base, perPageLabel: 'Rows' } })
    expect(wrapper.get('.data-iterator-page-number span').text()).toBe('Rows')
    wrapper.unmount()
  })

  it('emits update:itemsPerPage and maps "all" to 99', async () => {
    const wrapper = await mountKit(DataIteratorFooter, {
      props: { ...base, possibleItemsPerPage: [[4, 'all']], itemsPerPage: 99 },
    })
    const buttons = wrapper.findAll('.data-iterator-page-number button')
    expect(buttons[1]!.classes()).toContain('active')
    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('update:items-per-page')).toEqual([[4], [99]])
    wrapper.unmount()
  })

  it('passes a translated "All" option through unchanged', async () => {
    // Legacy passes a translated label (`$t('general.all')`); only the literal "all" maps to 99.
    const wrapper = await mountKit(DataIteratorFooter, {
      props: { ...base, possibleItemsPerPage: [[8, 'Wszystkie']], itemsPerPage: 8 },
    })
    const buttons = wrapper.findAll('.data-iterator-page-number button')
    expect(buttons[1]!.text()).toBe('Wszystkie')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('update:items-per-page')).toEqual([['Wszystkie']])
    wrapper.unmount()
  })

  it('emits update:page from the pagination', async () => {
    const wrapper = await mountKit(DataIteratorFooter, { props: base })
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
    wrapper.unmount()
  })

  it('is hidden with one page at the first per-page option', async () => {
    const hidden = await mountKit(DataIteratorFooter, { props: { ...base, numberOfPages: 1, itemsPerPage: 4 } })
    expect(hidden.find('.data-iterator-footer').exists()).toBe(false)
    hidden.unmount()
    const shown = await mountKit(DataIteratorFooter, { props: { ...base, numberOfPages: 1, itemsPerPage: 8 } })
    expect(shown.find('.data-iterator-footer').exists()).toBe(true)
    shown.unmount()
  })

  it('is visible with more than one page, also at the default size', async () => {
    // One rule for every table
    const wrapper = await mountKit(DataIteratorFooter, { props: { ...base, numberOfPages: 2, itemsPerPage: 4 } })
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(true)
    wrapper.unmount()
  })

  it('takes the default size from defaultItemsPerPage instead of the first option', async () => {
    // Project Logs: 10 per page by default, options [2, 5, 10, ...]: one page of 10 has no footer, a changed size has it (a way back).
    const props = { ...base, possibleItemsPerPage: [[2, 5, 10]], numberOfPages: 1, defaultItemsPerPage: 10 }
    const hidden = await mountKit(DataIteratorFooter, { props: { ...props, itemsPerPage: 10 } })
    expect(hidden.find('.data-iterator-footer').exists()).toBe(false)
    hidden.unmount()
    const shown = await mountKit(DataIteratorFooter, { props: { ...props, itemsPerPage: 2 } })
    expect(shown.find('.data-iterator-footer').exists()).toBe(true)
    shown.unmount()
  })

  it('hides the per-page buttons on mobile', async () => {
    // The mobile layout follows `$vuetify.breakpoint.mobile`.
    window.innerWidth = 500
    const wrapper = await mountKit(DataIteratorFooter, { props: base })
    expect(wrapper.find('.v-pagination').exists()).toBe(true)
    expect(wrapper.find('.data-iterator-page-number').exists()).toBe(false)
    wrapper.unmount()
  })
})
