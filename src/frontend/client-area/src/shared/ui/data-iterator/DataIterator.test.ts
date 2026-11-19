import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DataIterator from './DataIterator.vue'

const items = [
  { id: 1, name: 'Bravo' },
  { id: 2, name: 'Alpha' },
  { id: 3, name: 'Charlie' },
]
const nameKey = { text: 'Name', value: 'name', sortable: true }

const slots = {
  'grid': `<template #grid="{ items: rows, filteredKeys }"><div v-for="row in rows" :key="row.id" class="grid-item">{{ row.name }}</div><i class="keys">{{ JSON.stringify(filteredKeys) }}</i></template>`,
  'list': `<template #list="{ items: rows }"><div v-for="row in rows" :key="row.id" class="list-item">{{ row.name }}</div></template>`,
  'no-data': '<p class="host-empty">empty</p>',
  'loading': '<p class="host-loading">loading</p>',
}

const base = {
  items,
  sortBy: nameKey,
  sortDesc: false,
  itemsPerPage: 8,
  itemsTotal: 3,
  page: 1,
  keys: [nameKey],
}

function names (wrapper: Awaited<ReturnType<typeof mountKit>>, selector: string): string[] {
  return wrapper.findAll(selector).map(node => node.text())
}

describe('DataIterator', () => {
  it('renders the container structure and the grid slot with raw items, sorted', async () => {
    // `listStyle` 0 renders the grid slot.
    const wrapper = await mountKit(DataIterator, { props: base, slots })
    expectLegacyClasses(wrapper.element, ['v-container', 'px-0'])
    expectLegacyClasses(wrapper.get('.v-row').element, ['mx-0'])
    expect(wrapper.find('.v-data-iterator').exists()).toBe(true)
    expectLegacyClasses(wrapper.get('.v-data-iterator .v-container').element, ['px-0'])
    expectLegacyClasses(wrapper.get('.v-data-iterator .v-row').element, ['responsive-row'])
    expect(names(wrapper, '.grid-item')).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(wrapper.find('.list-item').exists()).toBe(false)
    expect(wrapper.get('.keys').text()).toBe(JSON.stringify([nameKey]))
    wrapper.unmount()
  })

  it('sorts descending when sortDesc is set and keeps the list order with sortDisabled', async () => {
    const desc = await mountKit(DataIterator, { props: { ...base, sortDesc: true }, slots })
    expect(names(desc, '.grid-item')).toEqual(['Charlie', 'Bravo', 'Alpha'])
    desc.unmount()
    const disabled = await mountKit(DataIterator, { props: { ...base, sortDisabled: true }, slots })
    expect(names(disabled, '.grid-item')).toEqual(['Bravo', 'Alpha', 'Charlie'])
    disabled.unmount()
  })

  it('renders the list slot for listStyle 1', async () => {
    const wrapper = await mountKit(DataIterator, { props: { ...base, listStyle: 1 }, slots })
    expect(names(wrapper, '.list-item')).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(wrapper.find('.grid-item').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the host no-data slot for an empty list', async () => {
    // No search term and no filterLabels.
    const wrapper = await mountKit(DataIterator, { props: { ...base, items: [], itemsTotal: 0 }, slots })
    expect(wrapper.find('.host-empty').exists()).toBe(true)
    expect(wrapper.find('.no-results-container').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the no-results container for a search term or filterLabels and forwards clearAllFilters', async () => {
    const searched = await mountKit(DataIterator, { props: { ...base, searchTerm: 'zzz' }, slots })
    expect(searched.find('.grid-item').exists()).toBe(false)
    expect(searched.find('.host-empty').exists()).toBe(false)
    await searched.get('.no-results-container button').trigger('click')
    expect(searched.emitted('clear-all-filters')).toHaveLength(1)
    searched.unmount()
    const labelled = await mountKit(DataIterator, { props: { ...base, items: [], itemsTotal: 0, filterLabels: [{ title: 'a' }] }, slots })
    expect(labelled.find('.no-results-container .text-center').exists()).toBe(true)
    await labelled.get('.no-results-container button').trigger('click')
    expect(labelled.emitted('clear-all-filters')).toHaveLength(1)
    labelled.unmount()
  })

  it('shows the host no-data slot for an empty filterLabels array', async () => {
    // Legacy `searchTerm || filterLabels` took [] as a filter and showed an empty dashed frame.
    const wrapper = await mountKit(DataIterator, { props: { ...base, items: [], itemsTotal: 0, filterLabels: [] }, slots })
    expect(wrapper.find('.no-results-container').exists()).toBe(false)
    expect(wrapper.find('.host-empty').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the host loading slot and no items while loading', async () => {
    const wrapper = await mountKit(DataIterator, { props: { ...base, loading: true }, slots })
    expect(wrapper.find('.host-loading').exists()).toBe(true)
    expect(wrapper.find('.grid-item').exists()).toBe(false)
    expect(wrapper.find('.host-empty').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the host page as given when itemsTotal is set (hosts page the items themselves)', async () => {
    // Hosts pass one page, either from the API or as a slice of the list.
    const wrapper = await mountKit(DataIterator, { props: { ...base, itemsPerPage: 3, itemsTotal: 9, page: 3 }, slots })
    expect(names(wrapper, '.grid-item')).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(wrapper.emitted('update:page')).toBeUndefined()
    wrapper.unmount()
  })

  it('paginates the items itself without itemsTotal', async () => {
    const wrapper = await mountKit(DataIterator, { props: { ...base, itemsPerPage: 2, itemsTotal: undefined, page: 2 }, slots })
    expect(names(wrapper, '.grid-item')).toEqual(['Charlie'])
    wrapper.unmount()
  })

  it('renders the footer and re-emits update:page and update:itemsPerPage', async () => {
    // Footer events go through `$listeners`.
    const wrapper = await mountKit(DataIterator, { props: { ...base, itemsPerPage: 4, itemsTotal: 9 }, slots })
    expectLegacyClasses(wrapper.get('.data-iterator-footer').element, ['data-iterator-footer'])
    expect(wrapper.findAll('.v-pagination__item')).toHaveLength(3)
    await wrapper.findAll('.v-pagination__item button')[1]!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
    await wrapper.findAll('.data-iterator-page-number button')[2]!.trigger('click')
    expect(wrapper.emitted('update:items-per-page')?.[0]).toEqual([16])
    wrapper.unmount()
  })

  it('omits the footer with showFooter false', async () => {
    const wrapper = await mountKit(DataIterator, { props: { ...base, itemsTotal: 9, showFooter: false }, slots })
    expect(wrapper.find('.data-iterator-footer').exists()).toBe(false)
    wrapper.unmount()
  })
})
