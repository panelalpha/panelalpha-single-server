import type { PagesSidebarGroup } from './pages-sidebar'
import { describe, expect, it } from 'vitest'
import { activeTabKey, flatItems, subheaderClass, visibleGroups } from './pages-sidebar'

const groups: PagesSidebarGroup[] = [
  { key: 'one', title: 'One', items: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] },
  { key: 'empty', title: 'Empty', items: [] },
  { key: 'two', title: 'Two', items: [{ key: 'c', title: 'C' }] },
]

describe('visibleGroups', () => {
  it('usuwa grupę bez pozycji i zachowuje kolejność', () => {
    expect(visibleGroups(groups).map(group => group.key)).toEqual(['one', 'two'])
  })
})

describe('flatItems', () => {
  it('skleja pozycje grup po kolei i pomija pustą grupę', () => {
    expect(flatItems(groups).map(item => item.key)).toEqual(['a', 'b', 'c'])
  })
})

describe('subheaderClass', () => {
  it('pierwszy subheader bez treści nad grupami nie ma górnego odstępu', () => {
    expect(subheaderClass(0, false)).toBe('pl-0 p-4 mt-0 pb-3')
  })

  it('pozostałe subheadery mają górny odstęp', () => {
    expect(subheaderClass(0, true)).toBe('pl-0 p-4 mt-6 pb-3')
    expect(subheaderClass(1, false)).toBe('pl-0 p-4 mt-6 pb-3')
  })
})

describe('activeTabKey', () => {
  it('pusta lista nie ma zaznaczenia', () => {
    expect(activeTabKey([])).toBeUndefined()
  })

  it('lista z trasami zaznacza router, nie komponent', () => {
    expect(activeTabKey([{ key: 'x', title: 'X', to: '/x' }])).toBeUndefined()
  })

  it('bez aktywnej pozycji zaznaczona pierwsza', () => {
    expect(activeTabKey([{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }])).toBe('a')
  })

  it('zaznaczona aktywna pozycja', () => {
    expect(activeTabKey([{ key: 'a', title: 'A' }, { key: 'b', title: 'B', active: true }])).toBe('b')
  })
})
