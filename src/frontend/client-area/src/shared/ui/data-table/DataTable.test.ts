import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
import Checkbox from '@/shared/ui/form/Checkbox.vue'
import TableSkeletonRow from '@/shared/ui/skeletons/TableSkeletonRow.vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import DataTable from './DataTable.vue'
import TableCustomSort from './TableCustomSort.vue'

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
const base = {
  headers,
  items,
  itemSlots: ['databases', 'updated_at'],
  itemsTotal: 2,
  itemsPerPage: 8,
  page: 1,
  sortBy: headers[0],
  sortDesc: false,
}

const slots = {
  'item.databases': `<template #item.databases="{ item }"><b class="host-db">db{{ item.id }}</b></template>`,
  'item.updated_at': `<template #item.updated_at="{ item }"><i class="host-date">{{ item.updated_at }}</i></template>`,
  'actions': `<template #actions="{ id }"><button class="host-action">act{{ id }}</button></template>`,
  'mobile': `<template #mobile="{ item, headers: cols }"><p class="host-mobile">{{ item.name }}|{{ cols.length }}</p></template>`,
  'no-data': '<p class="host-empty">empty</p>',
}

describe('DataTable', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  it('renders one card with the table class contract and the custom sort header', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: base, slots })
    expectLegacyClasses(wrapper.element, ['v-card', 'data-table', 'elevation-4'])
    expect(wrapper.classes()).not.toContain('data-table--loading')
    expect(wrapper.classes()).not.toContain('data-table--selectable')
    expectLegacyClasses(wrapper.get('.v-data-table').element, ['elevation-0', 'custom-data-table'])
    const sortRow = wrapper.get('tr.custom-sort')
    expect(wrapper.findAll('tr.custom-sort td')).toHaveLength(4)
    // Legacy V2 `header` slot: the row sits directly in <table> (no <thead>)
    expect(sortRow.element.parentElement?.tagName).toBe('TABLE')
    expect(wrapper.find('table thead').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders rows sorted by sortBy, the cells of the itemSlots and the actions in div.actions-row', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: base, slots })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Alpha')
    expect(rows[1]!.text()).toContain('Bravo')
    expect(rows[0]!.get('.host-db').text()).toBe('db2')
    expect(rows[0]!.get('.host-date').text()).toBe('2024-01-01')
    expectLegacyClasses(rows[0]!.get('.host-action').element.parentElement!, ['d-flex', 'actions-row'])
    wrapper.unmount()
  })

  it('sorts descending with sortDesc', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, sortDesc: true }, slots })
    expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('Bravo')
    wrapper.unmount()
  })

  it('re-emits the header sort clicks, the picked column and the flipped direction', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: base, slots })
    expect(wrapper.get('tr.custom-sort .item--name .custom-sort__arrow-up').attributes('up')).toBeDefined()
    await wrapper.get('tr.custom-sort .item--updated .custom-sort__item').trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[headers[2]]])
    await wrapper.get('tr.custom-sort .item--name .custom-sort__item').trigger('click')
    expect(wrapper.emitted('update:sort-desc')).toEqual([[true]])
    wrapper.unmount()
  })

  it('applies itemClass to the rows and leaves no empty class attribute for a row without one', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, {
      props: { ...base, itemClass: (item: Record<string, unknown>) => (item.id === 2 ? 'row-2' : '') },
      slots,
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.classes()).toContain('row-2')
    expect(rows[1]!.attributes('class')).toBe('v-data-table__tr')
    wrapper.unmount()
  })

  it('renders the footer for items and re-emits page and per-page changes', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, itemsPerPage: 1, itemsTotal: 2 }, slots })
    expectLegacyClasses(wrapper.get('.data-iterator-footer').element, ['data-iterator-footer'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(2)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
    await wrapper.findAll('.data-iterator-page-number button')[0]!.trigger('click')
    expect(wrapper.emitted('update:items-per-page')?.[0]).toEqual([4])
    wrapper.unmount()
  })

  it('pages ten rows by default and takes itemsPerPage as a number or as text', async () => {
    window.innerWidth = 1600
    const many = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, name: `n${index + 1}`, databases: 'd', updated_at: 'u' }))
    const byDefault = await mountKit(DataTable, { props: { headers, items: many, page: 1, sortBy: false }, slots })
    expect(byDefault.findAll('tbody tr')).toHaveLength(10)
    byDefault.unmount()

    const asText = await mountKit(DataTable, { props: { headers, items: many, itemsPerPage: '4', page: 1, sortBy: false }, slots })
    expect(asText.findAll('tbody tr')).toHaveLength(4)
    asText.unmount()
  })

  it('renders the mobile card with the mobile slot, the actions field and the actions in it', async () => {
    window.innerWidth = 500
    const wrapper = await mountKit(DataTable, { props: base, slots })
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expectLegacyClasses(rows[0]!.get('td').element, ['w-100'])
    expect(rows[0]!.get('.host-mobile').text()).toBe('Alpha|4')
    expect(rows[0]!.get('.mobile-table-item__header').text()).toBe('table.header.actions')
    expect(rows[0]!.get('.mobile-table-item__value .host-action').text()).toBe('act2')
    expect(rows[1]!.get('.mobile-table-item__value .host-action').text()).toBe('act1')
    wrapper.unmount()
  })

  it('renders the mobile card with the legacy markup', async () => {
    window.innerWidth = 500
    const wrapper = await mountKit(DataTable, { props: base, slots })
    expect(normalizeHtml(wrapper.findAll('tbody tr')[0]!.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><p class="host-mobile">Alpha|4</p><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button class="host-action">act2</button></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  it('labels the actions field of a mobile card with the ready label of the actions header, as the desktop header does', async () => {
    // Containers headers carry `label`; the card said `table.header.actions` instead of that text.
    window.innerWidth = 500
    const labelled = headers.map(header => header.value === 'actions' ? { ...header, label: 'Container actions' } : header)
    const wrapper = await mountKit(DataTable, { props: { ...base, headers: labelled }, slots })
    expect(wrapper.findAll('tbody tr')[0]!.get('.mobile-table-item__header').text()).toBe('Container actions')
    wrapper.unmount()
  })

  it('keeps the actions in div.actions-row when itemSlots names the actions column', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, itemSlots: [...base.itemSlots, 'actions'] }, slots })
    expect(wrapper.findAll('tbody tr')[0]!.get('div.actions-row .host-action').text()).toBe('act2')
    wrapper.unmount()
  })

  it('emits update:sort-by with the second header on a mobile actions-label click', async () => {
    window.innerWidth = 500
    const wrapper = await mountKit(DataTable, { props: base, slots })
    await wrapper.get('.mobile-table-item__header').trigger('click')
    expect(wrapper.emitted('update:sort-by')).toEqual([[headers[1]]])
    wrapper.unmount()
  })

  it('renders the desktop skeleton while loading, without the sort header, the rows and the footer', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, itemsLoading: true }, slots })
    expectLegacyClasses(wrapper.element, ['data-table', 'data-table--loading'])
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('thead.item.sort').exists()).toBe(true)
    expect(wrapper.findAll('tbody.item tr')).toHaveLength(5)
    expect(wrapper.find('.host-db').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders five mobile skeleton items while loading below the lg breakpoint', async () => {
    window.innerWidth = 500
    const wrapper = await mountKit(DataTable, { props: { ...base, itemsLoading: true }, slots })
    expect(wrapper.findAll('.mobile-item')).toHaveLength(5)
    expect(wrapper.find('thead.item.sort').exists()).toBe(false)
    expect(wrapper.find('.host-mobile').exists()).toBe(false)
    wrapper.unmount()
  })

  it('puts skeletonTestid on every skeleton row, desktop and mobile, and no data-testid without it', async () => {
    window.innerWidth = 1600
    const desktop = await mountKit(DataTable, { props: { ...base, itemsLoading: true, skeletonTestid: 'rows-skeleton' }, slots })
    expect(desktop.findAll('[data-testid="rows-skeleton"]')).toHaveLength(1)
    expect(desktop.get('[data-testid="rows-skeleton"]').element.tagName).toBe('TBODY')
    desktop.unmount()

    window.innerWidth = 500
    const mobile = await mountKit(DataTable, { props: { ...base, itemsLoading: true, skeletonTestid: 'rows-skeleton' }, slots })
    expect(mobile.findAll('.mobile-item[data-testid="rows-skeleton"]')).toHaveLength(5)
    mobile.unmount()

    const plain = await mountKit(DataTable, { props: { ...base, itemsLoading: true }, slots })
    expect(plain.find('.mobile-item').attributes('data-testid')).toBeUndefined()
    plain.unmount()
  })

  it('shows the no-data slot for an empty list, with neither header nor footer', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, items: [], itemsTotal: 0 }, slots })
    expect(wrapper.find('.host-empty').exists()).toBe(true)
    expect(wrapper.find('.no-results-container').exists()).toBe(false)
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the no-results container when a search matches nothing and emits clear-filters', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, searchTerm: 'zzz' }, slots })
    expect(wrapper.find('.host-empty').exists()).toBe(false)
    expect(wrapper.find('.host-db').exists()).toBe(false)
    await wrapper.get('.no-results-container button').trigger('click')
    expect(wrapper.emitted('clear-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('filters the rows by the value of every column key', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, searchTerm: 'db-a' }, slots })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Alpha')
    wrapper.unmount()
  })

  it('renders the cells of other columns through itemSlots, and an unlisted column by its value', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, {
      props: { ...base, itemSlots: ['name'] },
      slots: { ...slots, 'item.name': `<template #item.name="{ item }"><s class="host-name">{{ item.name }}!</s></template>` },
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.get('.host-name').text()).toBe('Alpha!')
    expect(rows[1]!.get('.host-name').text()).toBe('Bravo!')
    expect(rows[0]!.text()).toContain('db-a')
    wrapper.unmount()
  })

  it('hides the footer with hideFooter', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, itemsPerPage: 1, itemsTotal: 2, hideFooter: true }, slots })
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the footer when a search matches nothing, with either page count mode', async () => {
    window.innerWidth = 1600
    for (const footerPages of ['filtered', 'page'] as const) {
      const wrapper = await mountKit(DataTable, { props: { ...base, searchTerm: 'zzz', footerPages }, slots })
      expect(wrapper.find('.data-iterator-footer').exists()).toBe(true)
      wrapper.unmount()
    }
  })

  it('has no keys on the table for a table without selection', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: base, slots })
    expect(wrapper.find('.custom-sort__checkbox').exists()).toBe(false)
    wrapper.unmount()
  })

  it('matches the search term with customFilter instead of the text of the cell', async () => {
    window.innerWidth = 1600
    const byName = (value: unknown, query: string): boolean => value === 'Alpha' && query === 'x-alpha'
    const wrapper = await mountKit(DataTable, { props: { ...base, searchTerm: 'x-alpha', customFilter: byName }, slots })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('Alpha')
    wrapper.unmount()
  })

  describe('mobileVariant', () => {
    const compactSlots = {
      ...slots,
      'mobile-title': `<template #mobile-title="{ item }"><b class="c-title">{{ item.name }}</b></template>`,
      'mobile-meta-end': `<template #mobile-meta-end="{ item }"><span class="c-end">{{ item.id }}</span></template>`,
    }

    it('keeps the default card without the row class, with rowMarker', async () => {
      window.innerWidth = 500
      const wrapper = await mountKit(DataTable, { props: { ...base, rowMarker: () => 'green', itemClass: () => 'highlight' }, slots })
      const row = wrapper.findAll('tbody tr')[0]!
      expect(row.classes()).not.toContain('item-bordered')
      expect(row.classes()).not.toContain('item-bordered--green')
      expect(row.classes()).not.toContain('highlight')
      expect(row.find('.mobile-table-item--compact').exists()).toBe(false)
      wrapper.unmount()
    })

    it('renders the compact card with the named slots, no fields and the row class on the tr', async () => {
      window.innerWidth = 500
      const wrapper = await mountKit(DataTable, { props: { ...base, mobileVariant: 'compact', rowMarker: () => 'green' }, slots: compactSlots })
      const rows = wrapper.findAll('tbody tr')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.classes()).toContain('item-bordered--green')
      expect(rows[0]!.get('.mobile-table-item--compact .mobile-table-item__title .c-title').text()).toBe('Alpha')
      expect(rows[0]!.get('.mobile-table-item__meta-end .c-end').text()).toBe('2')
      expect(rows[0]!.find('.mobile-table-item__status').exists()).toBe(false)
      expect(rows[0]!.find('.mobile-table-item__header').exists()).toBe(false)
      expect(rows[0]!.find('.host-mobile').exists()).toBe(false)
      expect(normalizeHtml(rows[0]!.html())).toMatchInlineSnapshot(`"<tr class="item-bordered item-bordered--green"><td class="w-100"><div class="mobile-table-item mobile-table-item--compact"><div class="mobile-table-item__title"><b class="c-title">Alpha</b></div><div class="mobile-table-item__meta-end"><span class="c-end">2</span></div></div></td></tr>"`)
      wrapper.unmount()
    })
  })

  it('puts the rowAttrs on the desktop rows and on the mobile cards', async () => {
    const rowAttrs = (item: Record<string, unknown>): Record<string, string> => ({ 'data-testid': `row-${item.id}` })
    window.innerWidth = 1600
    const desktop = await mountKit(DataTable, { props: { ...base, itemClass: () => 'highlight', rowAttrs }, slots })
    expect(desktop.findAll('tbody tr').map(row => row.attributes('data-testid'))).toEqual(['row-2', 'row-1'])
    expect(desktop.get('[data-testid="row-2"]').classes()).toContain('highlight')
    desktop.unmount()

    window.innerWidth = 500
    const mobile = await mountKit(DataTable, { props: { ...base, itemClass: () => 'highlight', rowAttrs }, slots })
    expect(mobile.findAll('tbody tr').map(row => row.attributes('data-testid'))).toEqual(['row-2', 'row-1'])
    // The mobile card never took the item class.
    expect(mobile.get('[data-testid="row-2"]').classes()).not.toContain('highlight')
    mobile.unmount()
  })

  it('puts noResultsTestid on the no-results container', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, searchTerm: 'zzz', noResultsTestid: 'none' }, slots })
    expect(wrapper.find('.no-results-container').attributes('data-testid')).toBe('none')
    wrapper.unmount()
  })

  it('puts actionsTestid on the desktop actions row and on the actions field of the mobile card', async () => {
    window.innerWidth = 1600
    const desktop = await mountKit(DataTable, { props: { ...base, actionsTestid: 'acts' }, slots })
    expect(desktop.get('[data-testid="acts"]').classes()).toContain('actions-row')
    expect(desktop.findAll('[data-testid="acts"]')).toHaveLength(2)
    desktop.unmount()

    window.innerWidth = 500
    const mobile = await mountKit(DataTable, { props: { ...base, actionsTestid: 'acts' }, slots })
    expect(mobile.get('[data-testid="acts"]').classes()).toContain('mobile-table-item__value')
    mobile.unmount()
  })

  it('does not sort on the mobile actions label with actionsSort off', async () => {
    window.innerWidth = 500
    const wrapper = await mountKit(DataTable, { props: { ...base, actionsSort: false }, slots })
    await wrapper.get('.mobile-table-item__header').trigger('click')
    expect(wrapper.emitted('update:sort-by')).toBeUndefined()
    wrapper.unmount()
  })

  it('puts tableTestid on the table and leaves the data-testid of the host on the card', async () => {
    window.innerWidth = 1600
    const wrapper = await mountKit(DataTable, { props: { ...base, tableTestid: 'the-table' }, attrs: { 'data-testid': 'the-card' }, slots })
    expect(wrapper.attributes('data-testid')).toBe('the-card')
    expect(wrapper.get('[data-testid="the-table"]').classes()).toContain('v-data-table')
    wrapper.unmount()
  })

  describe('DataTable K-07', () => {
    it('renders the server mode rows as given and counts the footer pages from itemsTotal', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...base, server: true, itemsPerPage: 1, itemsTotal: 5 }, slots })
      expect(wrapper.findAll('tbody tr')).toHaveLength(2)
      expect(wrapper.findComponent(DataIteratorFooter).props('numberOfPages')).toBe(5)
      wrapper.unmount()
    })

    it('shows the mobile card below cardBelow and the table from it', async () => {
      window.innerWidth = 1300
      const narrow = await mountKit(DataTable, { props: { ...base, cardBelow: 1400 }, slots })
      expect(narrow.findAll('.mobile-table-item').length).toBeGreaterThan(0)
      narrow.unmount()

      window.innerWidth = 1500
      const wide = await mountKit(DataTable, { props: { ...base, cardBelow: 1400 }, slots })
      expect(wide.find('.mobile-table-item').exists()).toBe(false)
      wide.unmount()
    })

    it('shows the skeleton variant of the skeleton prop while loading', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...base, itemsLoading: true, skeleton: 'config' }, slots })
      expect(wrapper.findComponent(TableSkeletonRow).props('variant')).toBe('config')
      wrapper.unmount()
    })

    it('shows no-results over an empty list only with noResultsFirst', async () => {
      window.innerWidth = 1600
      const withFlag = await mountKit(DataTable, { props: { ...base, items: [], searchTerm: 'x', noResultsFirst: true }, slots })
      expect(withFlag.find('.no-results-container').exists()).toBe(true)
      withFlag.unmount()

      const without = await mountKit(DataTable, { props: { ...base, items: [], searchTerm: 'x' }, slots })
      expect(without.find('.no-results-container').exists()).toBe(false)
      expect(without.find('.host-empty').exists()).toBe(true)
      without.unmount()
    })

    it('passes perPageLabel to the footer', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...base, perPageLabel: 'X' }, slots })
      expect(wrapper.findComponent(DataIteratorFooter).props('perPageLabel')).toBe('X')
      wrapper.unmount()
    })

    it('shows a checkbox column with selectable, emits the row and the select-all, and checks rows by selectKey', async () => {
      window.innerWidth = 1600
      const selectHeaders = [{ text: '', value: 'select', sortable: false }, ...headers]
      const wrapper = await mountKit(DataTable, { props: { ...base, headers: selectHeaders, selectable: true, checkedItems: [1] }, slots })
      const rows = wrapper.findAll('tbody tr')
      // Rows are sorted by name: Alpha (id 2) first, Bravo (id 1, checked) second.
      expect(rows[1]!.findComponent(Checkbox).props('modelValue')).toBe(true)
      expect(rows[0]!.findComponent(Checkbox).props('modelValue')).toBe(false)

      rows[0]!.findComponent(Checkbox).vm.$emit('update:modelValue', true)
      expect(wrapper.emitted('update:checked-items')).toEqual([[items[1]]])

      wrapper.get('.custom-sort__checkbox').findComponent(Checkbox).vm.$emit('update:modelValue', true)
      expect(wrapper.emitted('update:check-all')).toEqual([[true]])
      wrapper.unmount()
    })

    it('puts the status bar class on the rows with rowMarker', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...base, rowMarker: () => 'green' }, slots })
      const row = wrapper.findAll('tbody tr')[0]!
      expect(row.classes()).toContain('item-bordered')
      expect(row.classes()).toContain('item-bordered--green')
      wrapper.unmount()
    })

    it('passes the row to the actions slot as row, on desktop and on the mobile card', async () => {
      const actionSlots = { ...slots, actions: '<template #actions="{ row }"><span class="row-name">{{ row.name }}</span></template>' }
      window.innerWidth = 1600
      const desktop = await mountKit(DataTable, { props: base, slots: actionSlots })
      expect(desktop.get('.row-name').text()).toBe('Alpha')
      desktop.unmount()

      window.innerWidth = 500
      const mobile = await mountKit(DataTable, { props: base, slots: actionSlots })
      expect(mobile.get('.row-name').text()).toBe('Alpha')
      mobile.unmount()
    })

    it('shows the mobile-actions slot on the card instead of the actions slot', async () => {
      window.innerWidth = 500
      const mobileSlots = { ...slots, 'mobile-actions': '<template #mobile-actions="{ id }"><button class="m-act">m{{ id }}</button></template>' }
      const wrapper = await mountKit(DataTable, { props: base, slots: mobileSlots })
      expect(wrapper.find('.m-act').exists()).toBe(true)
      expect(wrapper.find('.host-action').exists()).toBe(false)
      wrapper.unmount()
    })

    it('has no actions field on the mobile card without an actions slot', async () => {
      window.innerWidth = 500
      const wrapper = await mountKit(DataTable, { props: base, slots: { mobile: slots.mobile } })
      expect(wrapper.find('.mobile-table-item__actions').exists()).toBe(false)
      expect(wrapper.find('.host-mobile').exists()).toBe(true)
      wrapper.unmount()
    })

    it('renders the top slot above the table', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: base, slots: { ...slots, top: '<h2 class="host-top">Title</h2>' } })
      expect(wrapper.find('.host-top').exists()).toBe(true)
      wrapper.unmount()
    })

    it('puts cardTestid on every mobile card', async () => {
      window.innerWidth = 500
      const wrapper = await mountKit(DataTable, { props: { ...base, cardTestid: 'card' }, slots })
      expect(wrapper.findAll('[data-testid="card"]')).toHaveLength(2)
      wrapper.unmount()
    })
  })

  describe('DataTable K-08', () => {
    const pagedItems = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: i === 0 ? 'Alpha' : `Row ${i}`, databases: 'x', updated_at: '2024-01-01' }))

    it('keeps the host order when sortInView is set and sorts by sortBy otherwise', async () => {
      window.innerWidth = 1600
      const hostOrder = await mountKit(DataTable, { props: { ...base, sortInView: true }, slots })
      expect(hostOrder.get('tbody tr').text()).toContain('Bravo')
      hostOrder.unmount()
      const sorted = await mountKit(DataTable, { props: base, slots })
      expect(sorted.get('tbody tr').text()).toContain('Alpha')
      sorted.unmount()
    })

    it('leaves page changes of a search to the table when tablePagingEvents is false', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...base, items: pagedItems, itemsPerPage: 10, page: 2, tablePagingEvents: false }, slots })
      await wrapper.setProps({ searchTerm: 'Alpha' })
      await flushPromises()
      expect(wrapper.emitted('update:page')).toBeUndefined()
      wrapper.getComponent(DataIteratorFooter).vm.$emit('update:page', 1)
      expect(wrapper.emitted('update:page')).toEqual([[1]])
      wrapper.unmount()
    })

    it('reports the page changes of a search when tablePagingEvents is left on', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...base, items: pagedItems, itemsPerPage: 10, page: 2 }, slots })
      await wrapper.setProps({ searchTerm: 'Alpha' })
      await flushPromises()
      expect(wrapper.emitted('update:page')).toBeDefined()
      wrapper.unmount()
    })

    it('keeps the page of a search that still reaches it with keepPageOnSearch, and clamps it when the rows no longer do', async () => {
      window.innerWidth = 1600
      const many = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, name: `Row ${String(i + 1).padStart(2, '0')}`, databases: 'x', updated_at: '2024-01-01' }))
      const kept = await mountKit(DataTable, { props: { ...base, items: many, itemsPerPage: 10, keepPageOnSearch: true, page: 2 }, slots })
      await kept.setProps({ searchTerm: 'row' })
      await flushPromises()
      expect(kept.emitted('update:page')).toBeUndefined()
      kept.unmount()
      const clamped = await mountKit(DataTable, { props: { ...base, items: many, itemsPerPage: 10, keepPageOnSearch: true, page: 2 }, slots })
      await clamped.setProps({ searchTerm: 'Row 01' })
      await flushPromises()
      expect(clamped.emitted('update:page')?.at(-1)).toEqual([1])
      clamped.unmount()
    })

    it('takes the footer page count from numberOfPages and counts it without the prop', async () => {
      window.innerWidth = 1600
      const fixed = await mountKit(DataTable, { props: { ...base, numberOfPages: 7 }, slots })
      expect(fixed.findComponent(DataIteratorFooter).props('numberOfPages')).toBe(7)
      fixed.unmount()
      const counted = await mountKit(DataTable, { props: { ...base, itemsPerPage: 1 }, slots })
      expect(counted.findComponent(DataIteratorFooter).props('numberOfPages')).toBe(2)
      counted.unmount()
    })

    it('shows the footer under an empty list only with footerWhenEmpty', async () => {
      window.innerWidth = 1600
      const withFooter = await mountKit(DataTable, { props: { ...base, items: [], footerWhenEmpty: true }, slots })
      expect(withFooter.findComponent(DataIteratorFooter).exists()).toBe(true)
      withFooter.unmount()
      const without = await mountKit(DataTable, { props: { ...base, items: [] }, slots })
      expect(without.findComponent(DataIteratorFooter).exists()).toBe(false)
      without.unmount()
    })

    it('keeps the header row under an empty list with a search term only with headerWhenSearching', async () => {
      window.innerWidth = 1600
      const empty = { ...base, items: [], searchTerm: 'x', noResultsFirst: true }
      const withFlag = await mountKit(DataTable, { props: { ...empty, headerWhenSearching: true }, slots })
      expect(withFlag.findComponent(TableCustomSort).exists()).toBe(true)
      expect(withFlag.find('.no-results-container').exists()).toBe(true)
      withFlag.unmount()

      const without = await mountKit(DataTable, { props: empty, slots })
      expect(without.findComponent(TableCustomSort).exists()).toBe(false)
      without.unmount()

      const noSearch = await mountKit(DataTable, { props: { ...base, items: [], headerWhenSearching: true }, slots })
      expect(noSearch.findComponent(TableCustomSort).exists()).toBe(false)
      noSearch.unmount()
    })

    it('passes defaultItemsPerPage to the footer', async () => {
      window.innerWidth = 1600
      const given = await mountKit(DataTable, { props: { ...base, defaultItemsPerPage: 10 }, slots })
      expect(given.findComponent(DataIteratorFooter).props('defaultItemsPerPage')).toBe(10)
      given.unmount()
      const plain = await mountKit(DataTable, { props: base, slots })
      expect(plain.findComponent(DataIteratorFooter).props('defaultItemsPerPage')).toBeUndefined()
      plain.unmount()
    })

    it('puts footerTestid on the footer wrapper and headerTestid on the header row', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...base, footerTestid: 'f', headerTestid: 'h' }, slots })
      expect(wrapper.get('[data-testid="f"]').findComponent(DataIteratorFooter).exists()).toBe(true)
      expect(wrapper.find('tr.custom-sort[data-testid="h"]').exists()).toBe(true)
      wrapper.unmount()
      const plain = await mountKit(DataTable, { props: base, slots })
      expect(plain.get('tr.custom-sort').attributes('data-testid')).toBeUndefined()
      plain.unmount()
    })

    it('shows the no-results slot for a search that matches nothing, and no-data for an empty list without noResultsFirst', async () => {
      window.innerWidth = 1600
      const noResultsSlots = { ...slots, 'no-results': '<p class="host-nores">none</p>' }
      const matched = await mountKit(DataTable, { props: { ...base, searchTerm: 'zzz' }, slots: noResultsSlots })
      expect(matched.find('.host-nores').exists()).toBe(true)
      expect(matched.findComponent({ name: 'DataIteratorNoResultsContainer' }).exists()).toBe(false)
      matched.unmount()
      const empty = await mountKit(DataTable, { props: { ...base, items: [], searchTerm: 'zzz' }, slots: noResultsSlots })
      expect(empty.find('.host-empty').exists()).toBe(true)
      expect(empty.find('.host-nores').exists()).toBe(false)
      empty.unmount()
    })

    it('shows the card actions label from the header label when it is not blank', async () => {
      window.innerWidth = 900
      const headersWithBlank = [...headers.slice(0, 3), { text: 'Actions', value: 'actions', sortable: false, label: ' ' }]
      const wrapper = await mountKit(DataTable, { props: { ...base, headers: headersWithBlank }, slots })
      expect(wrapper.text()).toContain('table.header.actions')
      wrapper.unmount()
    })

    it('passes loading to the table', async () => {
      window.innerWidth = 1600
      const loading = await mountKit(DataTable, { props: { ...base, loading: true }, slots })
      expect(loading.getComponent({ name: 'VDataTable' }).props('loading')).toBe(true)
      loading.unmount()
      const plain = await mountKit(DataTable, { props: base, slots })
      expect(plain.getComponent({ name: 'VDataTable' }).props('loading')).toBe(false)
      plain.unmount()
    })

    it('gives the header cells the columnheader role and aria-sort only with announceSort', async () => {
      window.innerWidth = 1600
      const announced = await mountKit(DataTable, { props: { ...base, announceSort: true }, slots })
      const nameCell = announced.get('tr.custom-sort td.item--name')
      expect(nameCell.attributes('role')).toBe('columnheader')
      expect(nameCell.attributes('aria-sort')).toBe('ascending')
      announced.unmount()
      const plain = await mountKit(DataTable, { props: base, slots })
      expect(plain.get('tr.custom-sort td.item--name').attributes('role')).toBeUndefined()
      plain.unmount()
    })

    it('checks the rows by selectValue when it is given and by selectKey without it', async () => {
      window.innerWidth = 1600
      const selectHeaders = [{ text: '', value: 'select', sortable: false }, ...headers]
      // Rows are sorted by name: Alpha first, Bravo second.
      const byValue = await mountKit(DataTable, {
        props: { ...base, headers: selectHeaders, selectable: true, checkedItems: ['Alpha'], selectValue: (item: Record<string, unknown>) => item.name },
        slots,
      })
      const [alphaRow, bravoRow] = byValue.findAll('tbody tr')
      expect(alphaRow!.findComponent(Checkbox).props('modelValue')).toBe(true)
      expect(bravoRow!.findComponent(Checkbox).props('modelValue')).toBe(false)
      byValue.unmount()
      const byKey = await mountKit(DataTable, { props: { ...base, headers: selectHeaders, selectable: true, checkedItems: ['Alpha'] }, slots })
      const [alphaByKey, bravoByKey] = byKey.findAll('tbody tr')
      expect(alphaByKey!.findComponent(Checkbox).props('modelValue')).toBe(false)
      expect(bravoByKey!.findComponent(Checkbox).props('modelValue')).toBe(false)
      byKey.unmount()
    })
  })

  describe('DataTable without the task-ui props', () => {
    // Characterisation: the DOM of a table that sets none of `groupLabel`, `expandable`, `expandedKey`, `rowSize` is the one it had before they existed.
    it('renders the desktop table as it did', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: base, slots })
      expect(normalizeHtml(wrapper.html())).toMatchInlineSnapshot(`
        "<div class="v-card v-theme--light v-card--density-default elevation-4 v-card--variant-elevated data-table"><div class="v-card__loader"><div class="v-progress-linear v-theme--light v-locale--is-ltr" style="top: 0px; height: 0px; --v-progress-linear-height: 2px; --v-progress-reveal-duration: 900ms; --v-progress-chunk-gap: 4px;" role="progressbar" aria-hidden="true" aria-valuemin="0" aria-valuemax="100"><div class="v-progress-linear__background"></div><div class="v-progress-linear__buffer" style="width: 0%;"></div><transition-stub name="fade-transition" appear="false" persisted="false" css="true"><div class="v-progress-linear__indeterminate"><div class="v-progress-linear__indeterminate long"></div><div class="v-progress-linear__indeterminate short"></div></div></transition-stub></div></div><div class="v-table v-table--gridlines-horizontal v-table--has-top v-table--has-bottom v-theme--light v-table--density-default v-data-table elevation-0 custom-data-table"><div class="v-table__wrapper"><table><tr class="custom-sort"><td class="sort-item item--name"><div class="custom-sort__item custom-sort__item--sortable" role="button" tabindex="0">table.header.Name <div class="custom-sort__arrows"><i class="v-icon notranslate v-theme--light custom-sort__arrow-up" style="font-size: 12px; height: 12px; width: 12px;" aria-hidden="true" up=""><div><svg></svg></div></i></div></div></td><td class="sort-item item--databases"><div class="custom-sort__item">table.header.Databases
                      
                    </div></td><td class="sort-item item--updated"><div class="custom-sort__item custom-sort__item--sortable" role="button" tabindex="0">table.header.Updated <div class="custom-sort__arrows"><i class="v-icon notranslate v-theme--light custom-sort__arrow-up" style="font-size: 12px; height: 12px; width: 12px;" aria-hidden="true"><div><svg></svg></div></i></div></div></td><td class="sort-item item--actions"><div class="custom-sort__item">table.header.Actions
                      
                    </div></td></tr><tbody><tr class="v-data-table__tr"><td class="v-data-table__td v-data-table-column--align-start">Alpha</td><td class="v-data-table__td v-data-table-column--align-start"><b class="host-db">db2</b></td><td class="v-data-table__td v-data-table-column--align-start"><i class="host-date">2024-01-01</i></td><td class="v-data-table__td v-data-table-column--align-start"><div class="d-flex actions-row"><button class="host-action">act2</button></div></td></tr><tr class="v-data-table__tr"><td class="v-data-table__td v-data-table-column--align-start">Bravo</td><td class="v-data-table__td v-data-table-column--align-start"><b class="host-db">db1</b></td><td class="v-data-table__td v-data-table-column--align-start"><i class="host-date">2024-01-02</i></td><td class="v-data-table__td v-data-table-column--align-start"><div class="d-flex actions-row"><button class="host-action">act1</button></div></td></tr></tbody></table></div><div><div class="v-row align--center justify--center v-row--density-default align-center justify-center data-iterator-footer my-3 mx-4"><nav aria-label="Pagination Navigation" class="v-pagination" data-testid="v-pagination-root" role="navigation"><ul class="v-pagination__list"><li class="v-pagination__prev" data-testid="v-pagination-prev"><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text" disabled="" aria-label="Previous page"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></li><li class="v-pagination__item v-pagination__item--is-active" data-testid="v-pagination-item"><button type="button" class="v-btn v-theme--light bg-primary v-btn--density-default v-btn--size-default v-btn--variant-flat" aria-label="Page 1, Current page" aria-current="true" data-page="1"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator="">1</span></button></li><li class="v-pagination__next" data-testid="v-pagination-next"><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text" disabled="" aria-label="Next page"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></li></ul></nav><div class="v-spacer"></div><div class="data-iterator-page-number"><span>table.footer.record</span><button type="button" class="v-btn v-btn--elevated v-theme--light v-btn--density-default elevation-0 v-btn--size-default v-btn--variant-elevated"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator="">  4 </span></button><button type="button" class="v-btn v-btn--elevated v-theme--light v-btn--density-default elevation-0 v-btn--size-default v-btn--variant-elevated active"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator="">  8 </span></button><button type="button" class="v-btn v-btn--elevated v-theme--light v-btn--density-default elevation-0 v-btn--size-default v-btn--variant-elevated"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator="">  16 </span></button></div></div></div></div><span class="v-card__underlay"></span></div>"
      `)
      wrapper.unmount()
    })

    it('renders the mobile cards as they were', async () => {
      window.innerWidth = 500
      const wrapper = await mountKit(DataTable, { props: base, slots })
      expect(normalizeHtml(wrapper.html())).toMatchInlineSnapshot(`"<div class="v-card v-theme--light v-card--density-default elevation-4 v-card--variant-elevated data-table"><div class="v-card__loader"><div class="v-progress-linear v-theme--light v-locale--is-ltr" style="top: 0px; height: 0px; --v-progress-linear-height: 2px; --v-progress-reveal-duration: 900ms; --v-progress-chunk-gap: 4px;" role="progressbar" aria-hidden="true" aria-valuemin="0" aria-valuemax="100"><div class="v-progress-linear__background"></div><div class="v-progress-linear__buffer" style="width: 0%;"></div><transition-stub name="fade-transition" appear="false" persisted="false" css="true"><div class="v-progress-linear__indeterminate"><div class="v-progress-linear__indeterminate long"></div><div class="v-progress-linear__indeterminate short"></div></div></transition-stub></div></div><div class="v-table v-table--gridlines-horizontal v-table--has-top v-table--has-bottom v-theme--light v-table--density-default v-data-table elevation-0 custom-data-table"><div class="v-table__wrapper"><table><tbody><tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><p class="host-mobile">Alpha|4</p><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button class="host-action">act2</button></div></div></div></div></td></tr><tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><p class="host-mobile">Bravo|4</p><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><button class="host-action">act1</button></div></div></div></div></td></tr></tbody></table></div><div><div class="v-row align--center justify--center v-row--density-default align-center justify-center data-iterator-footer my-3 mx-4"><nav aria-label="Pagination Navigation" class="v-pagination" data-testid="v-pagination-root" role="navigation"><ul class="v-pagination__list"><li class="v-pagination__prev" data-testid="v-pagination-prev"><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text" disabled="" aria-label="Previous page"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></li><li class="v-pagination__item v-pagination__item--is-active" data-testid="v-pagination-item"><button type="button" class="v-btn v-theme--light bg-primary v-btn--density-default v-btn--size-default v-btn--variant-flat" aria-label="Page 1, Current page" aria-current="true" data-page="1"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator="">1</span></button></li><li class="v-pagination__next" data-testid="v-pagination-next"><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text" disabled="" aria-label="Next page"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></li></ul></nav></div></div></div><span class="v-card__underlay"></span></div>"`)
      wrapper.unmount()
    })
  })

  describe('DataTable groups, details row and row size (task-ui)', () => {
    const rows = [
      { id: 1, name: 'One', databases: 'x', updated_at: 'day-a' },
      { id: 2, name: 'Two', databases: 'x', updated_at: 'day-a' },
      { id: 3, name: 'Three', databases: 'x', updated_at: 'day-b' },
    ]
    const taskProps = {
      ...base,
      items: rows,
      itemsTotal: 3,
      itemsPerPage: 10,
      sortInView: true,
      groupLabel: (item: Record<string, unknown>) => item.updated_at as string,
      expandable: true,
    }
    const taskSlots = {
      ...slots,
      expanded: '<template #expanded="{ item }"><p class="host-details">details {{ item.name }}</p></template>',
    }
    const rowOf = (wrapper: Awaited<ReturnType<typeof mountKit>>, id: number) => wrapper
      .findAll('tbody tr')
      .find(row => row.text().includes(rows[id - 1]!.name) && !row.classes().includes('data-table__expanded'))!

    it('puts a group header before the first row of every group, not before the rest', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: taskProps, slots: taskSlots })
      const trs = wrapper.findAll('tbody tr')
      expect(trs.map(row => row.classes().includes('data-table__group'))).toEqual([true, false, false, true, false])
      expect(trs[0]!.text()).toBe('day-a')
      expect(trs[3]!.text()).toBe('day-b')
      expect(trs[0]!.get('td').attributes('colspan')).toBe('4')
      wrapper.unmount()
    })

    it('has no header for rows without a label and renders the group-header slot when given', async () => {
      window.innerWidth = 1600
      const none = await mountKit(DataTable, { props: { ...taskProps, groupLabel: () => undefined }, slots: taskSlots })
      expect(none.find('.data-table__group').exists()).toBe(false)
      none.unmount()

      const custom = await mountKit(DataTable, {
        props: taskProps,
        slots: { ...taskSlots, 'group-header': '<template #group-header="{ label, item }"><b class="host-group">{{ label }}/{{ item.id }}</b></template>' },
      })
      expect(custom.findAll('.host-group').map(node => node.text())).toEqual(['day-a/1', 'day-b/3'])
      custom.unmount()
    })

    it('keeps the cells, the actions and the row attributes of the rows it renders itself', async () => {
      window.innerWidth = 1600
      const rowAttrs = (item: Record<string, unknown>): Record<string, string> => ({ 'data-testid': `row-${item.id}` })
      const wrapper = await mountKit(DataTable, { props: { ...taskProps, rowAttrs }, slots: taskSlots })
      const row = wrapper.get('[data-testid="row-1"]')
      expect(row.get('.host-db').text()).toBe('db1')
      expect(row.get('div.actions-row .host-action').text()).toBe('act1')
      wrapper.unmount()
    })

    it('opens one row at a time, with aria-expanded, tabindex and aria-controls only on the open row', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: taskProps, slots: taskSlots })
      expect(wrapper.findAll('.host-details')).toHaveLength(0)
      expect(rowOf(wrapper, 1).attributes('aria-expanded')).toBe('false')
      expect(rowOf(wrapper, 1).attributes('tabindex')).toBe('0')
      expect(rowOf(wrapper, 1).attributes('aria-controls')).toBeUndefined()

      await rowOf(wrapper, 1).trigger('click')
      expect(wrapper.findAll('.host-details').map(node => node.text())).toEqual(['details One'])
      expect(rowOf(wrapper, 1).attributes('aria-expanded')).toBe('true')
      const controls = rowOf(wrapper, 1).attributes('aria-controls')
      expect(controls).toMatch(/^data-table-.+-expanded-1$/)
      expect(wrapper.get(`#${controls}`).classes()).toContain('data-table__expanded')
      expect(wrapper.emitted('update:expanded-key')).toEqual([[1]])

      await rowOf(wrapper, 2).trigger('click')
      expect(wrapper.findAll('.host-details').map(node => node.text())).toEqual(['details Two'])
      expect(rowOf(wrapper, 1).attributes('aria-expanded')).toBe('false')
      expect(rowOf(wrapper, 1).attributes('aria-controls')).toBeUndefined()

      await rowOf(wrapper, 2).trigger('click')
      expect(wrapper.findAll('.host-details')).toHaveLength(0)
      expect(wrapper.emitted('update:expanded-key')?.at(-1)).toEqual([null])
      wrapper.unmount()
    })

    it('does not open the row on a click on a link or a button inside it, and opens it on Enter and Space', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, {
        props: taskProps,
        slots: { ...taskSlots, 'item.databases': '<template #item.databases="{ item }"><a class="host-link" href="#">l{{ item.id }}</a></template>' },
      })
      await rowOf(wrapper, 1).get('.host-link').trigger('click')
      await rowOf(wrapper, 1).get('.host-action').trigger('click')
      expect(wrapper.findAll('.host-details')).toHaveLength(0)

      await rowOf(wrapper, 1).trigger('keydown', { key: 'Enter' })
      expect(wrapper.findAll('.host-details')).toHaveLength(1)
      await rowOf(wrapper, 1).trigger('keydown', { key: ' ' })
      expect(wrapper.findAll('.host-details')).toHaveLength(0)
      await rowOf(wrapper, 1).get('.host-link').trigger('keydown', { key: 'Enter' })
      expect(wrapper.findAll('.host-details')).toHaveLength(0)
      wrapper.unmount()
    })

    it('follows expandedKey of the host, so it can close the row', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...taskProps, expandedKey: 3 }, slots: taskSlots })
      expect(wrapper.findAll('.host-details').map(node => node.text())).toEqual(['details Three'])
      await wrapper.setProps({ expandedKey: null })
      expect(wrapper.findAll('.host-details')).toHaveLength(0)
      wrapper.unmount()
    })

    it('closes the row when it leaves the items and keeps it open while a refetch still has it', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: taskProps, slots: taskSlots })
      await rowOf(wrapper, 2).trigger('click')
      await wrapper.setProps({ items: rows.map(row => ({ ...row })) })
      expect(wrapper.findAll('.host-details')).toHaveLength(1)
      expect(wrapper.emitted('update:expanded-key')).toEqual([[2]])

      await wrapper.setProps({ items: [rows[0]!, rows[2]!] })
      expect(wrapper.findAll('.host-details')).toHaveLength(0)
      expect(wrapper.emitted('update:expanded-key')?.at(-1)).toEqual([null])
      wrapper.unmount()
    })

    it('uses itemValue as the key of the row', async () => {
      window.innerWidth = 1600
      const wrapper = await mountKit(DataTable, { props: { ...taskProps, itemValue: 'name' }, slots: taskSlots })
      await rowOf(wrapper, 1).trigger('click')
      expect(wrapper.emitted('update:expanded-key')).toEqual([['One']])
      expect(rowOf(wrapper, 1).attributes('aria-controls')).toMatch(/^data-table-.+-expanded-One$/)
      wrapper.unmount()
    })

    it('sets the 64px row class only with rowSize lg', async () => {
      window.innerWidth = 1600
      const large = await mountKit(DataTable, { props: { ...base, rowSize: 'lg' }, slots })
      expect(large.classes()).toContain('data-table--row-lg')
      large.unmount()
      const plain = await mountKit(DataTable, { props: base, slots })
      expect(plain.classes()).not.toContain('data-table--row-lg')
      plain.unmount()
    })

    it('renders the group header, the card and the details under the card on mobile', async () => {
      window.innerWidth = 500
      const wrapper = await mountKit(DataTable, { props: taskProps, slots: taskSlots })
      const trs = wrapper.findAll('tbody tr')
      expect(trs.map(row => row.classes().includes('data-table__group'))).toEqual([true, false, false, true, false])
      const card = trs[1]!
      expect(card.find('.mobile-table-item').exists()).toBe(true)
      expect(card.attributes('aria-expanded')).toBe('false')
      expect(card.attributes('tabindex')).toBe('0')

      await card.trigger('click')
      expect(wrapper.findAll('tbody tr')[2]!.classes()).toContain('data-table__expanded')
      expect(wrapper.get('.host-details').text()).toBe('details One')
      expect(wrapper.findAll('tbody tr')[1]!.attributes('aria-controls')).toMatch(/^data-table-.+-expanded-1$/)

      await wrapper.findAll('tbody tr')[1]!.trigger('keydown', { key: 'Enter' })
      expect(wrapper.findAll('.host-details')).toHaveLength(0)
      wrapper.unmount()
    })
  })
})
