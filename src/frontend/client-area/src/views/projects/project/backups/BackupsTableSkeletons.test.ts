import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { skeletonLoader, skeletonShape } from '@/test/skeleton-shape'
import BackupsTableItemSkeleton from './BackupsTableItemSkeleton.vue'
import BackupsTableItemSkeletonMobile from './BackupsTableItemSkeletonMobile.vue'
import BackupsTableSortSkeleton from './BackupsTableSortSkeleton.vue'

// Characterisation: the DOM of the three skeletons before and after they moved onto the table skeleton pattern.
describe('BackupsTableSortSkeleton', () => {
  it('renders thead.item.sort with an empty cell on each side of six bg-text cells', async () => {
    const wrapper = await mountKit(BackupsTableSortSkeleton)
    expect(skeletonShape(wrapper)).toEqual([
      'thead.item.sort',
      '  tr',
      '    th',
      ...Array.from({ length: 6 }, () => ['    th', ...skeletonLoader(3, { classes: '.bg-text' })]).flat(),
      '    th',
    ])
    wrapper.unmount()
  })
})

describe('BackupsTableItemSkeleton', () => {
  it('renders tbody.item with 5 rows: an empty cell, six bg-text cells and an avatar cell', async () => {
    const wrapper = await mountKit(BackupsTableItemSkeleton)
    const row = [
      '  tr',
      '    td',
      ...Array.from({ length: 6 }, () => ['    td', ...skeletonLoader(3, { classes: '.bg-text' })]).flat(),
      '    td',
      ...skeletonLoader(3, { classes: '.avatar.bg-text', kind: 'avatar' }),
    ]
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...Array.from({ length: 5 }, () => row).flat()])
    wrapper.unmount()
  })
})

describe('BackupsTableItemSkeletonMobile', () => {
  it('renders div.mobile-item with four bg-text groups and the actions avatars', async () => {
    const wrapper = await mountKit(BackupsTableItemSkeletonMobile)
    const group = (valueWidth: string) => [
      '  div.pb-3',
      ...skeletonLoader(2, { classes: '.bg-text', width: '25%' }),
      ...skeletonLoader(2, { classes: '.bg-text', width: valueWidth }),
    ]
    expect(skeletonShape(wrapper)).toEqual([
      'div.mobile-item',
      ...group('50%'),
      ...group('30%'),
      ...group('10%'),
      ...group('15%'),
      '  div.actions-container.align-center.d-flex.justify-start',
      ...skeletonLoader(2, { classes: '.actions.bg-text', kind: 'avatar', bones: 2 }),
    ])
    wrapper.unmount()
  })

  it('passes class and data-testid to its single root', async () => {
    const wrapper = await mountKit(BackupsTableItemSkeletonMobile, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})
