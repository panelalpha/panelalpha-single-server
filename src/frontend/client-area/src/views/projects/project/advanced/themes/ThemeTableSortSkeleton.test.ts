import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { skeletonLoader, skeletonShape } from '@/test/skeleton-shape'
import ThemeTableSortSkeleton from './ThemeTableSortSkeleton.vue'

// Characterisation: the DOM of the header skeleton before and after it moved onto `TableSkeletonSort`.
describe('ThemeTableSortSkeleton', () => {
  it('renders thead.item.sort with an empty cell on each side of three skeleton cells', async () => {
    const wrapper = await mountKit(ThemeTableSortSkeleton)
    expect(skeletonShape(wrapper)).toEqual([
      'thead.item.sort',
      '  tr',
      '    th',
      ...Array.from({ length: 3 }, () => ['    th', ...skeletonLoader(3)]).flat(),
      '    th',
    ])
    wrapper.unmount()
  })

  it('passes class and data-testid to its single root', async () => {
    const wrapper = await mountKit(ThemeTableSortSkeleton, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe('THEAD')
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})
