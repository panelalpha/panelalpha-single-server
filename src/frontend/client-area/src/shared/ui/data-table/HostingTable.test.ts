import { afterEach, describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import HostingTable from './HostingTable.vue'

const headers = [
  { text: 'Name', value: 'name', sortable: true },
  { text: 'Databases', value: 'databases', sortable: false },
  { text: 'Updated', value: 'updated_at', sortable: true },
  { text: 'Actions', value: 'actions', sortable: false },
]
const items = [
  { id: 1, name: 'Bravo', databases: 'db-b', updated_at: '2024-01-02' },
  { id: 2, name: 'Alpha', databases: 'db-a', updated_at: '2024-01-01' },
]
const base = { headers, items, itemsTotal: 2, itemsPerPage: 8, page: 1, sortBy: headers[0], sortDesc: false }

const slots = {
  'databases': `<template #databases="{ id }"><b class="host-db">db{{ id }}</b></template>`,
  'updated_at': `<template #updated_at="{ updated_at }"><i class="host-date">{{ updated_at }}</i></template>`,
  'actions': `<template #actions="{ id }"><button class="host-action">act{{ id }}</button></template>`,
  'mobile': `<template #mobile="{ item, headers: cols }"><p class="host-mobile">{{ item.name }}|{{ cols.length }}</p></template>`,
  'no-data': '<p class="host-empty">empty</p>',
}

describe('HostingTable', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  it('renders the desktop class contract with the custom sort header', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: base, slots })
    expectLegacyClasses(wrapper.element, ['v-card', 'data-table'])
    expect(wrapper.classes()).not.toContain('data-table--loading')
    expect(wrapper.classes()).not.toContain('data-table--selectable')
    const table = wrapper.get('.v-data-table')
    expectLegacyClasses(table.element, ['elevation-0', 'custom-data-table'])
    const sortRow = wrapper.get('tr.custom-sort')
    expect(wrapper.findAll('tr.custom-sort td')).toHaveLength(4)
    // Legacy V2 `header` slot: the row sits directly in <table> (no <thead>), so the
    // `thead > tr > td` rules of `_tables.scss` and V4 VTable do not reach its cells
    expect(sortRow.element.parentElement?.tagName).toBe('TABLE')
    expect(wrapper.find('table thead').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders rows sorted by sortBy with the column slots', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: base, slots })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Alpha')
    expect(rows[1]!.text()).toContain('Bravo')
    expect(rows[0]!.get('.host-db').text()).toBe('db2')
    expect(rows[0]!.get('.host-date').text()).toBe('2024-01-01')
    expectLegacyClasses(rows[0]!.get('.host-action').element.parentElement!, ['d-flex', 'actions-row'])
    expect(rows[0]!.get('.host-db').element.parentElement!.classList.contains('d-flex')).toBe(true)
    wrapper.unmount()
  })

  it('sorts descending with sortDesc', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, sortDesc: true }, slots })
    expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('Bravo')
    wrapper.unmount()
  })

  it('re-emits the header sort clicks and marks the sorted arrow', async () => {
    // Legacy passed the listeners to the sort row with `v-on="$listeners"`.
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: base, slots })
    expect(wrapper.get('tr.custom-sort .item--name .custom-sort__arrow-up').attributes('up')).toBeDefined()
    await wrapper.get('tr.custom-sort .item--updated .custom-sort__item').trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[headers[2]]])
    await wrapper.get('tr.custom-sort .item--name .custom-sort__item').trigger('click')
    expect(wrapper.emitted('update:sort-desc')).toEqual([[true]])
    wrapper.unmount()
  })

  it('applies itemClass to the rows', async () => {
    // The row class comes from `:item-class`.
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, {
      props: { ...base, itemClass: (item: { id: number }) => `row-${item.id}` },
      slots,
    })
    expect(wrapper.findAll('tbody tr')[0]!.classes()).toContain('row-2')
    expect(wrapper.findAll('tbody tr')[1]!.classes()).toContain('row-1')
    wrapper.unmount()
  })

  it('renders the footer for items and re-emits page and per-page changes', async () => {
    // The footer events go through `$listeners`.
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, itemsPerPage: 1, itemsTotal: 2 }, slots })
    expectLegacyClasses(wrapper.get('.data-iterator-footer').element, ['data-iterator-footer'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(2)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
    await wrapper.findAll('.data-iterator-page-number button')[0]!.trigger('click')
    expect(wrapper.emitted('update:items-per-page')?.[0]).toEqual([4])
    wrapper.unmount()
  })

  it('renders the mobile item rows, the mobile slot and the actions header', async () => {
    // The mobile card follows `$vuetify.breakpoint.mobile`.
    window.innerWidth = 500
    const wrapper = await mountKit(HostingTable, { props: base, slots })
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expectLegacyClasses(rows[0]!.get('td').element, ['w-100'])
    expectLegacyClasses(rows[0]!.get('.mobile-table-item').element, ['mobile-table-item'])
    expectLegacyClasses(rows[0]!.get('.mobile-table-item > div').element, ['mobile-table-item__values'])
    expect(rows[0]!.get('.host-mobile').text()).toBe('Alpha|4')
    expectLegacyClasses(rows[0]!.get('.mobile-table-item__row').element, ['mobile-table-item__row'])
    expect(rows[0]!.get('.mobile-table-item__header').text()).toBe('table.header.actions')
    expectLegacyClasses(rows[0]!.get('.mobile-table-item__value').element, ['mobile-table-item__value'])
    wrapper.unmount()
  })

  it('renders the mobile card with the legacy markup', async () => {
    // Characterization: the card DOM stays as it was written by hand.
    window.innerWidth = 500
    const wrapper = await mountKit(HostingTable, { props: base, slots })
    expect(normalizeHtml(wrapper.findAll('tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><p class="host-mobile">Alpha|4</p><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button class="host-action">act2</button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  it('passes the row to the actions slot on mobile, as on desktop', async () => {
    // Legacy passed no row to the mobile actions slot; the row goes in as on desktop.
    window.innerWidth = 500
    const wrapper = await mountKit(HostingTable, { props: base, slots })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.get('.mobile-table-item__value .host-action').text()).toBe('act2')
    expect(rows[1]!.get('.mobile-table-item__value .host-action').text()).toBe('act1')
    wrapper.unmount()
  })

  it('emits update:sort-by with the second header on a mobile actions-header click', async () => {
    // The sort uses `headers[1]`.
    window.innerWidth = 500
    const wrapper = await mountKit(HostingTable, { props: base, slots })
    await wrapper.get('.mobile-table-item__header').trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[headers[1]]])
    wrapper.unmount()
  })

  it('renders the desktop skeleton while loading, without the sort header', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, itemsLoading: true }, slots })
    expectLegacyClasses(wrapper.element, ['data-table', 'data-table--loading'])
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('thead.item.sort').exists()).toBe(true)
    expect(wrapper.find('tbody.item').exists()).toBe(true)
    expect(wrapper.findAll('tbody.item tr')).toHaveLength(5)
    expect(wrapper.find('.host-db').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders five mobile skeleton items while loading below the lg breakpoint', async () => {
    // The breakpoint is `$vuetify.breakpoint.lgAndDown`.
    window.innerWidth = 500
    const wrapper = await mountKit(HostingTable, { props: { ...base, itemsLoading: true }, slots })
    expect(wrapper.findAll('.mobile-item')).toHaveLength(5)
    expect(wrapper.find('thead.item.sort').exists()).toBe(false)
    expect(wrapper.find('.host-mobile').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the host no-data slot for an empty list, with neither header nor footer', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, items: [], itemsTotal: 0 }, slots })
    expect(wrapper.find('.host-empty').exists()).toBe(true)
    expect(wrapper.find('.no-results-container').exists()).toBe(false)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the no-results container when a search matches nothing and emits clear-filters', async () => {
    // The `no-results` slot shows when `searchTerm` is set.
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, searchTerm: 'zzz' }, slots })
    expect(wrapper.find('.host-empty').exists()).toBe(false)
    expect(wrapper.find('.host-db').exists()).toBe(false)
    await wrapper.get('.no-results-container button').trigger('click')
    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('forwards the itemSlots columns to item.<key> slots', async () => {
    // Containers: columns outside databases / updated_at / actions are rendered by the caller
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, {
      props: { ...base, itemSlots: ['name'] },
      slots: { ...slots, 'item.name': `<template #item.name="{ item }"><s class="host-name">{{ item.name }}!</s></template>` },
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.get('.host-name').text()).toBe('Alpha!')
    expect(rows[1]!.get('.host-name').text()).toBe('Bravo!')
    wrapper.unmount()
  })

  it('hides the footer with hideFooter', async () => {
    // Containers: the legacy table had no pagination
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, itemsPerPage: 1, itemsTotal: 2, hideFooter: true }, slots })
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('always raises the card to elevation 4 (one look for every table)', async () => {
    // Legacy used `elevation="4"`; the `elevation` prop is gone, so no table has a flat card.
    window.innerWidth = 1600
    const raised = await mountKit(HostingTable, { props: base, slots })
    expect(raised.classes()).toContain('elevation-4')
    raised.unmount()
  })

  it('keeps the footer when a search matches nothing, as the V2 zero page count did', async () => {
    // Legacy showed the footer with `v-if="items.length"` and hid it only for one page.
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, searchTerm: 'zzz' }, slots })
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(true)
    wrapper.unmount()
  })
})

// Behaviour of the table frame: no asserts on classes or looks, only on what the user can do.
describe('tabela (kit-data-table)', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  it('flips the direction when the sorted header is clicked and picks the column otherwise', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: base, slots })

    await wrapper.get('tr.custom-sort .item--name .custom-sort__item').trigger('click')
    await wrapper.get('tr.custom-sort .item--updated .custom-sort__item').trigger('click')
    expect(wrapper.emitted('update:sort-desc')).toEqual([[true]])
    expect(wrapper.emitted('update:sort-by')).toEqual([[headers[2]]])
    wrapper.unmount()
  })

  it('does not make the actions column sortable', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: base, slots })

    expect(wrapper.get('tr.custom-sort .item--actions .custom-sort__item').classes()).not.toContain('custom-sort__item--sortable')
    wrapper.unmount()
  })

  it('pages ten rows by default when itemsPerPage is not given', async () => {
    window.innerWidth = 1600
    const many = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, name: `n${index + 1}`, databases: 'd', updated_at: 'u' }))
    const wrapper = await mountKit(HostingTable, { props: { headers, items: many, itemsTotal: 11, page: 1, sortBy: false }, slots })

    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
    wrapper.unmount()
  })

  it('filters the rows by the search term over every column key', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, searchTerm: 'db-a' }, slots })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Alpha')
    wrapper.unmount()
  })

  it('shows neither the header nor the footer nor the rows while loading', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(HostingTable, { props: { ...base, itemsLoading: true }, slots })

    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.host-action').exists()).toBe(false)
    wrapper.unmount()
  })
})
