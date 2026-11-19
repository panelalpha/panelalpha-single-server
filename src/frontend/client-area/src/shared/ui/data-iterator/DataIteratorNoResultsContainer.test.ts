import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DataIteratorNoResultsContainer from './DataIteratorNoResultsContainer.vue'

describe('DataIteratorNoResultsContainer', () => {
  it('renders only the empty container without a search term or labels', async () => {
    const wrapper = await mountKit(DataIteratorNoResultsContainer)
    expectLegacyClasses(wrapper.element, ['no-results-container'])
    expect(wrapper.find('.text-center').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the illustration, title and clear button, and emits clear-all-filters', async () => {
    const wrapper = await mountKit(DataIteratorNoResultsContainer, { props: { searchTerm: 'abc' } })
    expectLegacyClasses(wrapper.get('.text-center').element, ['text-center'])
    expectLegacyClasses(wrapper.get('.text-center > div').element, [
      'd-flex', 'flex-column', 'align-center', 'justify-center', 'mx-auto', 'pa-6',
    ])
    expect(wrapper.get('.text-center > div').classes()).toContain('no-results-container__content')
    expect(wrapper.find('svg').exists()).toBe(true)
    expectLegacyClasses(wrapper.get('span.text--gray-darken1').element, ['mb-6', 'mt-7'])
    expect(wrapper.get('span.text--gray-darken1').text()).toBe('message.emptyTable.instances.filter.title')
    const button = wrapper.get('button')
    expectLegacyClasses(button.element, ['px-3', 'v-btn--variant-text', 'text-primary'])
    expect(button.text()).toBe('button.clearFilter')
    await button.trigger('click')
    expect(wrapper.emitted('clear-all-filters')).toHaveLength(1)
    wrapper.unmount()
  })

  it('also renders for filter labels alone', async () => {
    // The container shows for `searchTerm || filterLabels.length`.
    const wrapper = await mountKit(DataIteratorNoResultsContainer, { props: { filterLabels: [{ title: 'a' }] } })
    expect(wrapper.find('.text-center').exists()).toBe(true)
    wrapper.unmount()
  })
})
