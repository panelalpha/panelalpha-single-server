import type { RepositoryTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import { newThemeDefaultSort, newThemeSortKeys, pageNewThemes } from './new-themes'

function catalogue (slug: string, overrides: Partial<RepositoryTheme> = {}): RepositoryTheme {
  return { id: slug, slug, name: slug, version: '1.0.0', rating: 0, last_updated: '2026-01-01', ...overrides }
}

function options (overrides: Partial<Parameters<typeof pageNewThemes>[2]> = {}) {
  return {
    sortBy: newThemeDefaultSort,
    sortDesc: true,
    page: 1,
    itemsPerPage: 6,
    ...overrides,
  }
}

describe('new-themes', () => {
  it('sorts by rating by default, and offers the rated and recent keys', () => {
    expect(newThemeDefaultSort).toMatchObject({ value: 'rating' })
    expect(newThemeSortKeys.map(key => [key.text, key.value])).toEqual([
      ['sort.rated', 'rating'],
      ['sort.recent', 'last_updated'],
    ])
  })

  it('leaves the installed themes out of the catalogue', () => {
    const all = [catalogue('astra'), catalogue('hello-elementor'), catalogue('storefront')]
    const page = pageNewThemes(all, [{ name: 'astra' }], options())

    expect(page.items.map(item => item.slug)).toEqual(['hello-elementor', 'storefront'])
  })

  it('takes the total before the installed filter, from the whole catalogue', () => {
    const all = [catalogue('astra'), catalogue('storefront'), catalogue('hello-elementor')]
    const page = pageNewThemes(all, [{ name: 'astra' }], options({ itemsPerPage: 1 }))

    expect(page.itemsTotal).toBe(3)
    expect(page.items).toHaveLength(1)
  })

  it('sorts by rating in the given direction, numbers compared as numbers', () => {
    const all = [catalogue('low', { rating: 40 }), catalogue('high', { rating: 90 }), catalogue('mid', { rating: 9 })]

    expect(pageNewThemes(all, [], options({ sortDesc: true })).items.map(item => item.slug)).toEqual(['high', 'low', 'mid'])
    expect(pageNewThemes(all, [], options({ sortDesc: false })).items.map(item => item.slug)).toEqual(['mid', 'low', 'high'])
  })

  it('sorts by the recent key on the date text', () => {
    const all = [
      catalogue('older', { last_updated: '2024-02-01' }),
      catalogue('newest', { last_updated: '2026-03-10' }),
      catalogue('middle', { last_updated: '2025-07-04' }),
    ]

    const page = pageNewThemes(all, [], options({ sortBy: newThemeSortKeys[1]!, sortDesc: true }))

    expect(page.items.map(item => item.slug)).toEqual(['newest', 'middle', 'older'])
  })

  it('cuts the page after the sort', () => {
    const all = Array.from({ length: 8 }, (_, index) => catalogue(`theme-${index}`, { rating: index }))

    const page = pageNewThemes(all, [], options({ page: 2 }))

    expect(page.items.map(item => item.slug)).toEqual(['theme-1', 'theme-0'])
    expect(page.itemsTotal).toBe(8)
  })

  it('keeps the list order when no sort is given', () => {
    const all = [catalogue('b'), catalogue('a')]

    expect(pageNewThemes(all, [], options({ sortBy: false })).items.map(item => item.slug)).toEqual(['b', 'a'])
  })
})
