import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { skeletonLoader, skeletonShape } from '@/test/skeleton-shape'
import ConfigTableItemSkeletonMobile from './ConfigTableItemSkeletonMobile.vue'
import ConfigTableSkeletonItem from './ConfigTableSkeletonItem.vue'
import ConfigTableSkeletonSort from './ConfigTableSkeletonSort.vue'
import LogsTableItemSkeletonMobile from './LogsTableItemSkeletonMobile.vue'
import LogsTableSkeletonItem from './LogsTableSkeletonItem.vue'
import LogsTableSortSkeleton from './LogsTableSortSkeleton.vue'

describe('LogsTableSortSkeleton', () => {
  it('renders thead.item.sort with four skeleton cells', async () => {
    // The V4 template adds the `tr` the browser inserted implicitly
    const wrapper = await mountKit(LogsTableSortSkeleton)
    expect(wrapper.element.tagName).toBe('THEAD')
    expectLegacyClasses(wrapper.element, ['item', 'sort'])
    expect(wrapper.findAll('thead > tr > th')).toHaveLength(4)
    expect(wrapper.findAll('th .v-skeleton-loader .v-skeleton-loader__text')).toHaveLength(4)
    wrapper.unmount()
  })
})

describe('LogsTableSkeletonItem', () => {
  it('renders tbody.item with 5 rows of 4 cells by default', async () => {
    // `rows` 5, `cols` 4
    const wrapper = await mountKit(LogsTableSkeletonItem)
    expect(wrapper.element.tagName).toBe('TBODY')
    expectLegacyClasses(wrapper.element, ['item'])
    expect(wrapper.findAll('tr')).toHaveLength(5)
    expect(wrapper.findAll('td')).toHaveLength(20)
    // `.text` palette class is `.bg-text` in V4
    expectLegacyClasses(wrapper.get('td .v-skeleton-loader').element, ['bg-text'])
    wrapper.unmount()
  })

  it('honours rows and cols', async () => {
    const wrapper = await mountKit(LogsTableSkeletonItem, { props: { rows: 2, cols: 3 } })
    expect(wrapper.findAll('tr')).toHaveLength(2)
    expect(wrapper.findAll('td')).toHaveLength(6)
    wrapper.unmount()
  })
})

describe('LogsTableItemSkeletonMobile', () => {
  it('renders .mobile-item with four label/value groups', async () => {
    const wrapper = await mountKit(LogsTableItemSkeletonMobile)
    expectLegacyClasses(wrapper.element, ['mobile-item'])
    const groups = wrapper.findAll('.mobile-item > .pb-3')
    expect(groups).toHaveLength(4)
    for (const group of groups) {
      expect(group.findAll('.v-skeleton-loader')).toHaveLength(2)
    }
    // `type="text@2"` repeats the text bone (third group, second loader)
    expect(groups[2]!.findAll('.v-skeleton-loader')[1]!.findAll('.v-skeleton-loader__text')).toHaveLength(2)
    wrapper.unmount()
  })
})

describe('ConfigTableSkeletonSort', () => {
  it('renders thead.item.sort with three skeleton cells and an empty one', async () => {
    const wrapper = await mountKit(ConfigTableSkeletonSort)
    expect(wrapper.element.tagName).toBe('THEAD')
    expectLegacyClasses(wrapper.element, ['item', 'sort'])
    const cells = wrapper.findAll('th')
    expect(cells).toHaveLength(4)
    expect(wrapper.findAll('th .v-skeleton-loader')).toHaveLength(3)
    expect(cells[3]!.find('.v-skeleton-loader').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('ConfigTableSkeletonItem', () => {
  it('renders tbody.item with 5 rows of three text cells and an avatar cell', async () => {
    const wrapper = await mountKit(ConfigTableSkeletonItem)
    expect(wrapper.element.tagName).toBe('TBODY')
    expectLegacyClasses(wrapper.element, ['item'])
    expect(wrapper.findAll('tr')).toHaveLength(5)
    expect(wrapper.findAll('td')).toHaveLength(20)
    expect(wrapper.findAll('.v-skeleton-loader.bg-text')).toHaveLength(15)
    expect(wrapper.findAll('.v-skeleton-loader.avatar')).toHaveLength(5)
    expect(wrapper.findAll('.v-skeleton-loader.avatar .v-skeleton-loader__avatar')).toHaveLength(5)
    wrapper.unmount()
  })
})

describe('ConfigTableItemSkeletonMobile', () => {
  it('renders .mobile-item with six groups and the actions avatars', async () => {
    const wrapper = await mountKit(ConfigTableItemSkeletonMobile)
    expectLegacyClasses(wrapper.element, ['mobile-item'])
    expect(wrapper.findAll('.mobile-item > .pb-3')).toHaveLength(6)
    const actions = wrapper.get('.actions-container')
    expectLegacyClasses(actions.element, ['d-flex', 'justify-start', 'align-center'])
    expectLegacyClasses(actions.get('.v-skeleton-loader').element, ['actions'])
    expect(actions.findAll('.v-skeleton-loader__avatar')).toHaveLength(2)
    wrapper.unmount()
  })
})

// Characterisation of the `Logs*` presets: the DOM below is the one they rendered before they moved onto
// the `TableSkeleton*` pattern, so these cases stay unchanged when the pattern changes.
const loader = skeletonLoader

function logsRows (rows: number, cols: number): string[] {
  const cells = Array.from({ length: cols }, () => ['    td', ...loader(3, { classes: '.bg-text' })]).flat()
  return Array.from({ length: rows }, () => ['  tr', ...cells]).flat()
}

describe('Logs presets keep their DOM', () => {
  it('LogsTableSortSkeleton: thead.item.sort with four header cells', async () => {
    const wrapper = await mountKit(LogsTableSortSkeleton)
    expect(skeletonShape(wrapper)).toEqual([
      'thead.item.sort',
      '  tr',
      ...Array.from({ length: 4 }, () => ['    th', ...loader(3)]).flat(),
    ])
    wrapper.unmount()
  })

  it('LogsTableSkeletonItem: tbody.item with 5 rows of 4 cells by default', async () => {
    const wrapper = await mountKit(LogsTableSkeletonItem)
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...logsRows(5, 4)])
    wrapper.unmount()
  })

  it('LogsTableSkeletonItem: honours rows and cols', async () => {
    const wrapper = await mountKit(LogsTableSkeletonItem, { props: { rows: 2, cols: 3 } })
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...logsRows(2, 3)])
    wrapper.unmount()
  })

  it('LogsTableItemSkeletonMobile: div.mobile-item with four label/value groups', async () => {
    const wrapper = await mountKit(LogsTableItemSkeletonMobile)
    const group = (valueWidth: string, bones = 1) => [
      '  div.pb-3',
      ...loader(2, { width: '25%' }),
      ...loader(2, { width: valueWidth, bones }),
    ]
    expect(skeletonShape(wrapper)).toEqual([
      'div.mobile-item',
      ...group('30%'),
      ...group('40%'),
      ...group('80%', 2),
      ...group('15%'),
    ])
    wrapper.unmount()
  })

  it.each([
    ['LogsTableSortSkeleton', LogsTableSortSkeleton, 'THEAD'],
    ['LogsTableSkeletonItem', LogsTableSkeletonItem, 'TBODY'],
    ['LogsTableItemSkeletonMobile', LogsTableItemSkeletonMobile, 'DIV'],
  ])('%s passes class and data-testid to its single root', async (_name, component, tag) => {
    // The tasks view sets both on the skeleton
    const wrapper = await mountKit(component, { attrs: { 'class': 'extra-class', 'data-testid': 'skeleton-root' } })
    expect(wrapper.element.tagName).toBe(tag)
    expect(wrapper.element.classList.contains('extra-class')).toBe(true)
    expect(wrapper.element.dataset.testid).toBe('skeleton-root')
    wrapper.unmount()
  })
})

// Characterisation of the `Config*` presets.
describe('Config presets keep their DOM', () => {
  it('ConfigTableSkeletonSort: thead.item.sort with three header cells and an empty one', async () => {
    const wrapper = await mountKit(ConfigTableSkeletonSort)
    expect(skeletonShape(wrapper)).toEqual([
      'thead.item.sort',
      '  tr',
      ...Array.from({ length: 3 }, () => ['    th', ...loader(3)]).flat(),
      '    th',
    ])
    wrapper.unmount()
  })

  it('ConfigTableSkeletonItem: tbody.item with 5 rows of three text cells and an avatar cell', async () => {
    const wrapper = await mountKit(ConfigTableSkeletonItem)
    const row = [
      '  tr',
      ...Array.from({ length: 3 }, () => ['    td', ...loader(3, { classes: '.bg-text' })]).flat(),
      '    td',
      ...loader(3, { classes: '.avatar', kind: 'avatar' }),
    ]
    expect(skeletonShape(wrapper)).toEqual(['tbody.item', ...Array.from({ length: 5 }, () => row).flat()])
    wrapper.unmount()
  })

  it('ConfigTableItemSkeletonMobile: div.mobile-item with six groups and the actions avatars', async () => {
    const wrapper = await mountKit(ConfigTableItemSkeletonMobile)
    const group = (valueWidth: string) => [
      '  div.pb-3',
      ...loader(2, { width: '25%' }),
      ...loader(2, { width: valueWidth }),
    ]
    expect(skeletonShape(wrapper)).toEqual([
      'div.mobile-item',
      ...group('30%'),
      ...Array.from({ length: 5 }, () => group('60%')).flat(),
      '  div.actions-container.align-center.d-flex.justify-start',
      ...loader(2, { classes: '.actions', kind: 'avatar', bones: 2 }),
    ])
    wrapper.unmount()
  })
})
