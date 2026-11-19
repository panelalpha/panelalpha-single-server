import { describe, expect, it } from 'vitest'
import { type PaginationItem, paginationItems, paginationMaxButtons } from './pagination-items'

function list (value: number, length: number, maxButtons = 0, totalVisible = 9): string {
  return paginationItems({ length, value, totalVisible, maxButtons }).join(' ')
}

describe('paginationItems (Vuetify 2 VPagination page list)', () => {
  // The expected lists were read from the built legacy app-lite (Tasks, 48 pages, total-visible 9, desktop width).
  it('matches the legacy list for 48 pages and nine items', () => {
    const expected: Record<number, string> = {
      1: '1 2 3 4 ... 45 46 47 48',
      2: '1 2 3 4 ... 45 46 47 48',
      3: '1 2 3 4 ... 45 46 47 48',
      4: '1 2 3 4 5 6 7 ... 48',
      5: '1 2 3 4 5 6 7 ... 48',
      6: '1 ... 4 5 6 7 8 ... 48',
      7: '1 ... 5 6 7 8 9 ... 48',
      24: '1 ... 22 23 24 25 26 ... 48',
      44: '1 ... 42 43 44 45 46 47 48',
      45: '1 ... 42 43 44 45 46 47 48',
      46: '1 2 3 4 ... 45 46 47 48',
      47: '1 2 3 4 ... 45 46 47 48',
      48: '1 2 3 4 ... 45 46 47 48',
    }
    for (const [page, text] of Object.entries(expected)) {
      expect({ page, text: list(Number(page), 48) }).toEqual({ page, text })
    }
  })

  it('matches the legacy list at mobile width (six items fit)', () => {
    // Legacy at 375px: `maxButtons` 6, so an even window of six.
    const expected: Record<number, string> = {
      1: '1 2 3 ... 47 48',
      3: '1 2 3 4 ... 48',
      4: '1 2 3 4 ... 48',
      45: '1 ... 44 45 ... 48',
      47: '1 ... 45 46 47 48',
      48: '1 2 3 ... 47 48',
    }
    for (const [page, text] of Object.entries(expected)) {
      expect({ page, text: list(Number(page), 48, 6) }).toEqual({ page, text })
    }
  })

  it('shows every page when they fit', () => {
    expect(list(1, 1)).toBe('1')
    expect(list(2, 3)).toBe('1 2 3')
    expect(list(5, 9)).toBe('1 2 3 4 5 6 7 8 9')
  })

  it('joins the window to the ends when only one page is between', () => {
    // Length 10: at page 5 the second item is 2 (nothing hidden after 1), at page 6 the one before the last is 9.
    expect(list(1, 10)).toBe('1 2 3 4 ... 7 8 9 10')
    expect(list(4, 10)).toBe('1 2 3 4 5 6 7 ... 10')
    expect(list(5, 10)).toBe('1 2 3 4 5 6 7 ... 10')
    expect(list(6, 10)).toBe('1 ... 4 5 6 7 8 9 10')
    expect(list(7, 10)).toBe('1 ... 4 5 6 7 8 9 10')
  })

  it('never shows more items than the limit and always keeps the first and last page', () => {
    for (const length of [10, 11, 20, 48, 143]) {
      for (const maxButtons of [0, 5, 6, 7, 9, 11]) {
        for (let value = 1; value <= length; value++) {
          const items: PaginationItem[] = paginationItems({ length, value, totalVisible: 9, maxButtons })
          const limit = Math.min(9, maxButtons || length)
          expect(items.length).toBeLessThanOrEqual(limit)
          expect(items[0]).toBe(1)
          expect(items.at(-1)).toBe(length)
          const numbers = items.filter((item): item is number => item !== '...')
          expect([...numbers].toSorted((a, b) => a - b)).toEqual(numbers)
          expect(numbers).toContain(value)
        }
      }
    }
  })

  it('returns an empty list for total-visible 0 and for an invalid length', () => {
    expect(paginationItems({ length: 5, value: 1, totalVisible: 0 })).toEqual([])
    expect(paginationItems({ length: Number.NaN, value: 1 })).toEqual([])
    expect(paginationItems({ length: 0, value: 1 })).toEqual([])
  })

  it('treats a missing total-visible and an unmeasured width as no limit', () => {
    expect(paginationItems({ length: 20, value: 1 })).toHaveLength(20)
  })
})

describe('paginationMaxButtons', () => {
  it('counts 42px per item after the 96px of the arrows', () => {
    expect(paginationMaxButtons(1344)).toBe(29)
    expect(paginationMaxButtons(348)).toBe(6)
    expect(paginationMaxButtons(0)).toBe(-3)
  })
})
