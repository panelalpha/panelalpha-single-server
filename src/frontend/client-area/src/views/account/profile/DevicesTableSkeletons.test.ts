import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { skeletonLoader, skeletonShape } from '@/test/skeleton-shape'
import DevicesTableSkeletonItem from './DevicesTableSkeletonItem.vue'
import DevicesTableSkeletonMobileItem from './DevicesTableSkeletonMobileItem.vue'
import DevicesTableSortSkeleton from './DevicesTableSortSkeleton.vue'

// Characterisation: the DOM of the three skeletons before and after they moved onto the table skeleton pattern.
describe('DevicesTableSortSkeleton', () => {
  it('renders thead.item.sort with an empty cell on each side of six skeleton cells', async () => {
    const wrapper = await mountKit(DevicesTableSortSkeleton)
    expect(skeletonShape(wrapper)).toEqual([
      'thead.item.sort',
      '  tr',
      '    th',
      ...Array.from({ length: 6 }, () => ['    th', ...skeletonLoader(3)]).flat(),
      '    th',
    ])
    wrapper.unmount()
  })
})

describe('DevicesTableSkeletonItem', () => {
  it('renders tbody.item with 5 rows: an empty cell and six bg-text cells', async () => {
    const wrapper = await mountKit(DevicesTableSkeletonItem)
    const row = [
      '  tr',
      '    td',
      ...Array.from({ length: 6 }, () => ['    td', ...skeletonLoader(3, { classes: '.bg-text' })]).flat(),
    ]
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...Array.from({ length: 5 }, () => row).flat()])
    wrapper.unmount()
  })
})

describe('DevicesTableSkeletonMobileItem', () => {
  it('renders div.mobile-item with four groups and the actions avatars', async () => {
    const wrapper = await mountKit(DevicesTableSkeletonMobileItem)
    const group = (valueWidth: string) => [
      '  div.pb-3',
      ...skeletonLoader(2, { width: '25%' }),
      ...skeletonLoader(2, { width: valueWidth }),
    ]
    expect(skeletonShape(wrapper)).toEqual([
      'div.mobile-item',
      ...group('50%'),
      ...group('30%'),
      ...group('10%'),
      ...group('15%'),
      '  div.actions-container.align-center.d-flex.justify-start',
      ...skeletonLoader(2, { classes: '.actions', kind: 'avatar', bones: 2 }),
    ])
    wrapper.unmount()
  })

  it('passes class and data-testid to its single root', async () => {
    const wrapper = await mountKit(DevicesTableSkeletonMobileItem, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})
