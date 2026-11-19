import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { skeletonLoader, skeletonShape } from '@/test/skeleton-shape'
import InvoiceTableItemSkeletonMobile from './InvoiceTableItemSkeletonMobile.vue'
import InvoiceTableSkeletonItem from './InvoiceTableSkeletonItem.vue'
import InvoiceTableSkeletonSort from './InvoiceTableSkeletonSort.vue'

// Characterisation: the DOM of the three skeletons before and after they moved onto the table skeleton pattern.
describe('InvoiceTableSkeletonSort', () => {
  it('renders thead.item.sort with five skeleton cells and an empty one', async () => {
    const wrapper = await mountKit(InvoiceTableSkeletonSort)
    expect(skeletonShape(wrapper)).toEqual([
      'thead.item.sort',
      '  tr',
      ...Array.from({ length: 5 }, () => ['    th', ...skeletonLoader(3)]).flat(),
      '    th',
    ])
    wrapper.unmount()
  })
})

describe('InvoiceTableSkeletonItem', () => {
  it('renders tbody.item with 5 rows of five bg-text cells and a button cell', async () => {
    const wrapper = await mountKit(InvoiceTableSkeletonItem)
    const row = [
      '  tr',
      ...Array.from({ length: 5 }, () => ['    td', ...skeletonLoader(3, { classes: '.bg-text' })]).flat(),
      '    td',
      ...skeletonLoader(3, { kind: 'button' }),
    ]
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...Array.from({ length: 5 }, () => row).flat()])
    wrapper.unmount()
  })
})

describe('InvoiceTableItemSkeletonMobile', () => {
  it('renders div.mobile-item with six groups and the actions avatars', async () => {
    const wrapper = await mountKit(InvoiceTableItemSkeletonMobile)
    const group = (valueWidth: string) => [
      '  div.pb-3',
      ...skeletonLoader(2, { width: '25%' }),
      ...skeletonLoader(2, { width: valueWidth }),
    ]
    expect(skeletonShape(wrapper)).toEqual([
      'div.mobile-item',
      ...group('30%'),
      ...Array.from({ length: 5 }, () => group('60%')).flat(),
      '  div.actions-container.align-center.d-flex.justify-start',
      ...skeletonLoader(2, { classes: '.actions', kind: 'avatar', bones: 2 }),
    ])
    wrapper.unmount()
  })

  it('passes class and data-testid to its single root', async () => {
    const wrapper = await mountKit(InvoiceTableItemSkeletonMobile, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})
