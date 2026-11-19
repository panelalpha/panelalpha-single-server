import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { skeletonLoader, skeletonShape } from '@/test/skeleton-shape'
import PluginTableItemsSkeleton from './PluginTableItemsSkeleton.vue'
import PluginTableSortSkeleton from './PluginTableSortSkeleton.vue'

// Characterisation: the DOM of both skeletons before and after they moved onto the table skeleton pattern.
describe('PluginTableSortSkeleton', () => {
  it('renders thead.item.sort with an empty cell on each side of three skeleton cells', async () => {
    const wrapper = await mountKit(PluginTableSortSkeleton)
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
    const wrapper = await mountKit(PluginTableSortSkeleton, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe('THEAD')
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})

describe('PluginTableItemsSkeleton', () => {
  it('renders tbody.item with 5 rows: an empty cell, three text cells (class text) and an avatar cell', async () => {
    const wrapper = await mountKit(PluginTableItemsSkeleton)
    const row = [
      '  tr',
      '    td',
      ...Array.from({ length: 3 }, () => ['    td', ...skeletonLoader(3, { classes: '.text' })]).flat(),
      '    td',
      ...skeletonLoader(3, { classes: '.avatar', kind: 'avatar' }),
    ]
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...Array.from({ length: 5 }, () => row).flat()])
    wrapper.unmount()
  })

  it('passes class and data-testid to its single root', async () => {
    const wrapper = await mountKit(PluginTableItemsSkeleton, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe('TBODY')
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})
