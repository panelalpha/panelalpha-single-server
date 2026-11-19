import { describe, expect, it } from 'vitest'
import {
  addDividersToThemeCategories,
  DEFAULT_THEME_CATEGORIES,
  sameCategory,
  sortKeyFor,
  themeSource,
} from './template-model'

describe('addDividersToThemeCategories', () => {
  it('sorts by order and puts a divider where an order is missing below the largest one', () => {
    const result = addDividersToThemeCategories([
      { id: 2, name: 'Shop', order: 3 },
      { id: 1, name: 'Blog', order: 1 },
    ])

    expect(result).toEqual([
      { id: 1, name: 'Blog', order: 1 },
      { type: 'divider', order: 2 },
      { id: 2, name: 'Shop', order: 3 },
    ])
  })

  it('returns no entries for no categories', () => {
    expect(addDividersToThemeCategories([])).toEqual([])
  })

  it('ignores a category without an order when it finds the largest one (legacy `item.order > maxOrder`)', () => {
    const result = addDividersToThemeCategories([
      { id: 1, name: 'Blog', order: 2 },
      { id: 2, name: 'No order' },
    ])
    expect(result).toEqual([
      { type: 'divider', order: 1 },
      { id: 1, name: 'Blog', order: 2 },
    ])
  })

  it('does not reorder the input array', () => {
    const input = [{ id: 2, order: 2 }, { id: 1, order: 1 }]
    addDividersToThemeCategories(input)
    expect(input[0].id).toBe(2)
  })
})

describe('themeSource', () => {
  it('reads the default and recommended lists by their type, every other entry is a category', () => {
    expect(themeSource(DEFAULT_THEME_CATEGORIES[0])).toBe('default')
    expect(themeSource({ type: 'recommended', value: 'recommended' })).toBe('recommended')
    expect(themeSource({ id: 4, name: 'Blog' })).toBe('category')
  })
})

describe('sameCategory', () => {
  it('matches the same list and not a different one', () => {
    expect(sameCategory(DEFAULT_THEME_CATEGORIES[0], { text: 'popular', value: 'popular', type: 'default' })).toBe(true)
    expect(sameCategory(DEFAULT_THEME_CATEGORIES[0], DEFAULT_THEME_CATEGORIES[1])).toBe(false)
    expect(sameCategory({ id: 1 }, { id: 2 })).toBe(false)
  })
})

describe('sortKeyFor', () => {
  it('finds the sort option of a default list by its value', () => {
    expect(sortKeyFor(DEFAULT_THEME_CATEGORIES[1])?.text).toBe('sort.latest')
  })
})
