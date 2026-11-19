import { afterEach, describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DataIteratorFilterControls from './DataIteratorFilterControls.vue'

const keys = [{ text: 'Name', value: 'name', sortable: true }]

describe('DataIteratorFilterControls', () => {
  const width = window.innerWidth
  afterEach(() => {
    window.innerWidth = width
  })

  it('renders only the search by default', async () => {
    // Defaults: filter off, no sortBy, showSearchTerm true.
    const wrapper = await mountKit(DataIteratorFilterControls)
    expectLegacyClasses(wrapper.element, ['d-flex', 'flex-nowrap', 'data-iterator-filter-controls', 'w-100'])
    expect(wrapper.findAll('.data-iterator-filter-controls__item')).toHaveLength(1)
    expect(wrapper.find('.custom-menu').exists()).toBe(false)
    expect(wrapper.find('.v-select').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders filter, sort and search items and takes the labels from availableLabels', async () => {
    // The Vuex read is replaced by the prop.
    const wrapper = await mountKit(DataIteratorFilterControls, {
      props: {
        filter: true,
        sortBy: keys[0],
        keys,
        availableLabels: [{ title: 'Bug' }],
        filterLabels: [{ title: 'Bug' }],
      },
    })
    expect(wrapper.findAll('.data-iterator-filter-controls__item')).toHaveLength(3)
    expectLegacyClasses(wrapper.findAll('.data-iterator-filter-controls__item')[1]!.element, [
      'data-iterator-filter-controls__item--sort-instances',
    ])
    expect(wrapper.get('.filter-number').text()).toBe('1')
    expect(wrapper.find('.v-select').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the search with showSearchTerm false', async () => {
    const wrapper = await mountKit(DataIteratorFilterControls, { props: { showSearchTerm: false, filter: true } })
    expect(wrapper.findAll('.data-iterator-filter-controls__item')).toHaveLength(1)
    expect(wrapper.find('.v-text-field').exists()).toBe(false)
    wrapper.unmount()
  })

  it('adds the disabled modifier and the width helpers per breakpoint', async () => {
    const wrapper = await mountKit(DataIteratorFilterControls, { props: { disabled: true, fullWidthLg: false } })
    expectLegacyClasses(wrapper.element, ['data-iterator-filter-controls--disabled'])
    expect(wrapper.classes()).not.toContain('w-100')
    wrapper.unmount()
    window.innerWidth = 800
    const md = await mountKit(DataIteratorFilterControls, { props: { fullWidthLg: false, fullWidthMd: true } })
    expectLegacyClasses(md.element, ['w-100'])
    md.unmount()
  })

  it('re-emits update:sortBy and update:filterLabels and updates the search term', async () => {
    const wrapper = await mountKit(DataIteratorFilterControls, {
      props: { filter: true, sortBy: keys[0], keys, searchTerm: '' },
    })
    const sortBy = wrapper.findComponent({ name: 'DataIteratorSortBy' })
    sortBy.vm.$emit('update:sort-by', keys[0])
    expect(wrapper.emitted('update:sort-by')?.[0]).toEqual([keys[0]])
    const filter = wrapper.findComponent({ name: 'DataIteratorFilter' })
    filter.vm.$emit('update:applied-labels', [{ title: 'Bug' }])
    expect(wrapper.emitted('update:filter-labels')?.[0]).toEqual([[{ title: 'Bug' }]])
    const search = wrapper.findComponent({ name: 'DataIteratorSearch' })
    search.vm.$emit('update:modelValue', 'abc')
    expect(wrapper.emitted('update:searchTerm')?.[0]).toEqual(['abc'])
    wrapper.unmount()
  })
})
