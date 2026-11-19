import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import TableSkeletonMobile from './TableSkeletonMobile.vue'
import TableSkeletonRow from './TableSkeletonRow.vue'
import TableSkeletonSort from './TableSkeletonSort.vue'

// The pattern is the single root `thead`, `tbody` or `div` of the preset that wraps it (class and data-testid fall through to it).
describe('TableSkeletonSort', () => {
  it('renders thead.item.sort with the variant class and four header cells', async () => {
    const wrapper = await mountKit(TableSkeletonSort)
    expect(wrapper.element.tagName).toBe('THEAD')
    expect([...wrapper.element.classList]).toEqual(['item', 'sort', 'table-skeleton-sort--logs'])
    expect(wrapper.findAll('thead > tr > th')).toHaveLength(4)
    expect(wrapper.findAll('th .v-skeleton-loader .v-skeleton-loader__text')).toHaveLength(4)
    wrapper.unmount()
  })

  it('passes class and data-testid to the root and adds no a11y attributes of its own', async () => {
    const wrapper = await mountKit(TableSkeletonSort, { attrs: { 'class': 'extra', 'data-testid': 'sort' } })
    expect(wrapper.element.classList.contains('extra')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('sort')
    expect(wrapper.element.hasAttribute('role')).toBe(false)
    expect(wrapper.element.hasAttribute('aria-label')).toBe(false)
    wrapper.unmount()
  })
})

describe('TableSkeletonRow', () => {
  it('renders tbody.item with the variant class and the counts of the variant', async () => {
    const wrapper = await mountKit(TableSkeletonRow)
    expect(wrapper.element.tagName).toBe('TBODY')
    expect([...wrapper.element.classList]).toEqual(['item', 'table-skeleton-row--logs'])
    expect(wrapper.findAll('tr')).toHaveLength(5)
    expect(wrapper.findAll('td')).toHaveLength(20)
    expect(wrapper.findAll('td .v-skeleton-loader.bg-text')).toHaveLength(20)
    wrapper.unmount()
  })

  it('takes rows and cols from props over the variant', async () => {
    const wrapper = await mountKit(TableSkeletonRow, { props: { rows: 2, cols: 6 } })
    expect(wrapper.findAll('tr')).toHaveLength(2)
    expect(wrapper.findAll('td')).toHaveLength(12)
    wrapper.unmount()
  })

  it('passes class and data-testid to the root', async () => {
    const wrapper = await mountKit(TableSkeletonRow, { attrs: { 'class': 'extra', 'data-testid': 'rows' } })
    expect(wrapper.element.classList.contains('extra')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('rows')
    expect(wrapper.element.hasAttribute('role')).toBe(false)
    wrapper.unmount()
  })
})

describe('TableSkeletonMobile', () => {
  it('renders div.mobile-item with the variant class and one group per value', async () => {
    const wrapper = await mountKit(TableSkeletonMobile)
    expect(wrapper.element.tagName).toBe('DIV')
    expect([...wrapper.element.classList]).toEqual(['mobile-item', 'table-skeleton-mobile--logs'])
    const groups = wrapper.findAll('.mobile-item > .pb-3')
    expect(groups).toHaveLength(4)
    expect(groups.map(group => (group.findAll('.v-skeleton-loader')[1]!.element as HTMLElement).style.width))
      .toEqual(['30%', '40%', '80%', '15%'])
    // every label is 25 wide; the third value repeats the text bone (`text@2`)
    for (const group of groups) {
      expect((group.findAll('.v-skeleton-loader')[0]!.element as HTMLElement).style.width).toBe('25%')
    }
    expect(groups[2]!.findAll('.v-skeleton-loader')[1]!.findAll('.v-skeleton-loader__text')).toHaveLength(2)
    wrapper.unmount()
  })

  it('passes class and data-testid to the root', async () => {
    const wrapper = await mountKit(TableSkeletonMobile, { attrs: { 'class': 'extra', 'data-testid': 'card' } })
    expect(wrapper.element.classList.contains('extra')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('card')
    expect(wrapper.element.hasAttribute('role')).toBe(false)
    wrapper.unmount()
  })
})
