import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { skeletonLoader, skeletonShape } from '@/test/skeleton-shape'
import ServicesTableItemSkeletonMobile from './ServicesTableItemSkeletonMobile.vue'
import ServicesTableSkeletonItem from './ServicesTableSkeletonItem.vue'
import ServicesTableSkeletonSort from './ServicesTableSkeletonSort.vue'

// Characterisation: the DOM of the three skeletons before and after they moved onto the table skeleton pattern.
describe('ServicesTableSkeletonSort', () => {
  it('renders thead.item.sort with four bg-text cells', async () => {
    const wrapper = await mountKit(ServicesTableSkeletonSort)
    expect(skeletonShape(wrapper)).toEqual([
      'thead.item.sort',
      '  tr',
      ...Array.from({ length: 4 }, () => ['    th', ...skeletonLoader(3, { classes: '.bg-text' })]).flat(),
    ])
    wrapper.unmount()
  })
})

describe('ServicesTableSkeletonItem', () => {
  it('renders tbody.item with 3 rows of three bg-text cells and a button cell', async () => {
    const wrapper = await mountKit(ServicesTableSkeletonItem)
    const row = [
      '  tr',
      ...Array.from({ length: 3 }, () => ['    td', ...skeletonLoader(3, { classes: '.bg-text' })]).flat(),
      '    td',
      ...skeletonLoader(3, { kind: 'button' }),
    ]
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...Array.from({ length: 3 }, () => row).flat()])
    wrapper.unmount()
  })
})

describe('ServicesTableItemSkeletonMobile', () => {
  it('renders div.mobile-item with six bg-text groups and the actions avatars', async () => {
    const wrapper = await mountKit(ServicesTableItemSkeletonMobile)
    const group = (valueWidth: string) => [
      '  div.pb-3',
      ...skeletonLoader(2, { classes: '.bg-text', width: '25%' }),
      ...skeletonLoader(2, { classes: '.bg-text', width: valueWidth }),
    ]
    expect(skeletonShape(wrapper)).toEqual([
      'div.mobile-item',
      ...group('30%'),
      ...Array.from({ length: 5 }, () => group('60%')).flat(),
      '  div.actions-container.align-center.d-flex.justify-start',
      ...skeletonLoader(2, { classes: '.actions.bg-text', kind: 'avatar', bones: 2 }),
    ])
    wrapper.unmount()
  })

  it('passes class and data-testid to its single root', async () => {
    const wrapper = await mountKit(ServicesTableItemSkeletonMobile, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})
