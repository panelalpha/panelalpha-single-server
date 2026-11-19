import type { InstalledTheme } from '@/entities/project/instance-themes.api'
import { describe, expect, it } from 'vitest'
import { pageThemes, planMassDelete, showListSwitch, showThemeTable, tableDescription, themeDefaultSort, themeSortKeys } from './installed-themes'

function theme (title: string, overrides: Partial<InstalledTheme> = {}): InstalledTheme {
  return { name: title.toLowerCase().replaceAll(' ', '-'), title, status: 'inactive', version: '1.0.0', ...overrides }
}

const ALL = [
  theme('Storefront', { status: 'inactive' }),
  theme('Astra', { status: 'active' }),
  theme('Hello Elementor', { status: 'inactive' }),
  theme('Twenty Twenty-Four', { status: 'inactive' }),
  theme('Blocksy', { status: 'inactive' }),
]

const TITLE_ASC = { text: 'name', value: 'title', sortable: true }
const STATUS = { text: 'status', value: 'status', sortable: true }

function page (overrides: Partial<Parameters<typeof pageThemes>[1]> = {}) {
  return pageThemes(ALL, {
    searchTerm: '',
    sortBy: TITLE_ASC,
    sortDesc: false,
    page: 1,
    itemsPerPage: 6,
    ...overrides,
  })
}

function titles (items: InstalledTheme[]): string[] {
  return items.map(item => item.title)
}

describe('installed themes: sort headers', () => {
  it('sorts by the title ascending by default', () => {
    expect(themeDefaultSort).toMatchObject({ value: 'title', sortable: true, searchable: true })
  })

  it('offers the title and the status as sort keys', () => {
    expect(themeSortKeys.map(key => key.value)).toEqual(['title', 'status'])
  })
})

describe('pageThemes: filter', () => {
  it('matches the title case-insensitively', () => {
    const result = page({ searchTerm: 'HELLO' })
    expect(titles(result.items)).toEqual(['Hello Elementor'])
  })

  it('does not search the status or other fields', () => {
    expect(page({ searchTerm: 'active' }).items).toEqual([])
  })

  it('counts the total after the filter, not the whole list', () => {
    const result = page({ searchTerm: 'o', itemsPerPage: 1 })
    expect(result.itemsTotal).toBe(ALL.filter(item => item.title.toLowerCase().includes('o')).length)
    expect(result.items).toHaveLength(1)
  })

  it('keeps the whole list when the term is empty', () => {
    expect(page().itemsTotal).toBe(ALL.length)
  })
})

describe('pageThemes: active theme first', () => {
  it('puts the active theme first when sorting by the title ascending', () => {
    expect(titles(page({ sortBy: TITLE_ASC }).items)[0]).toBe('Astra')
  })

  it('puts the active theme first when sorting by the title descending', () => {
    expect(titles(page({ sortBy: TITLE_ASC, sortDesc: true }).items)[0]).toBe('Astra')
  })

  it('puts the active theme first when sorting by the status in both directions', () => {
    expect(titles(page({ sortBy: STATUS }).items)[0]).toBe('Astra')
    expect(titles(page({ sortBy: STATUS, sortDesc: true }).items)[0]).toBe('Astra')
  })

  it('puts the active theme first with no sort', () => {
    expect(titles(page({ sortBy: false }).items)[0]).toBe('Astra')
  })

  it('keeps the rest of the list in sort order, ascending and descending', () => {
    expect(titles(page({ sortBy: TITLE_ASC }).items)).toEqual(['Astra', 'Blocksy', 'Hello Elementor', 'Storefront', 'Twenty Twenty-Four'])
    expect(titles(page({ sortBy: TITLE_ASC, sortDesc: true }).items)).toEqual(['Astra', 'Twenty Twenty-Four', 'Storefront', 'Hello Elementor', 'Blocksy'])
  })

  it('keeps the input order of inactive themes when the sort key ties', () => {
    const tied = [
      theme('Zeta', { status: 'inactive' }),
      theme('Alpha', { status: 'inactive' }),
      theme('Mid', { status: 'active' }),
    ]
    const result = pageThemes(tied, { searchTerm: '', sortBy: STATUS, sortDesc: false, page: 1, itemsPerPage: 6 })
    expect(titles(result.items)).toEqual(['Mid', 'Zeta', 'Alpha'])
  })

  it('shows the active theme on the first page only', () => {
    const second = page({ page: 2, itemsPerPage: 2 })
    expect(titles(second.items)).toEqual(['Hello Elementor', 'Storefront'])
    expect(second.items.some(item => item.status === 'active')).toBe(false)
  })

  it('drops the active theme from the page when the search excludes it', () => {
    expect(page({ searchTerm: 'black' }).items.some(item => item.status === 'active')).toBe(false)
  })
})

describe('pageThemes: paging and robustness', () => {
  it('cuts the page by the items per page', () => {
    expect(titles(page({ itemsPerPage: 2 }).items)).toEqual(['Astra', 'Blocksy'])
    expect(titles(page({ itemsPerPage: 2, page: 3 }).items)).toEqual(['Twenty Twenty-Four'])
  })

  it('returns an empty page past the end', () => {
    expect(page({ page: 4, itemsPerPage: 6 }).items).toEqual([])
  })

  it('does not throw for a theme without a title, and sorts it as empty text', () => {
    const untitled = [{ name: 'x', status: 'inactive', version: '1' } as unknown as InstalledTheme, theme('Astra', { status: 'active' })]
    const options = { searchTerm: '', sortBy: TITLE_ASC, sortDesc: false, page: 1, itemsPerPage: 6 }
    expect(pageThemes(untitled, options).items.map(item => item.name)).toEqual(['astra', 'x'])
  })

  it('does not match a theme without a title against a search term', () => {
    const untitled = [{ name: 'x', status: 'inactive', version: '1' } as unknown as InstalledTheme]
    const result = pageThemes(untitled, { searchTerm: 'as', sortBy: TITLE_ASC, sortDesc: false, page: 1, itemsPerPage: 6 })
    expect(result).toEqual({ items: [], itemsTotal: 0 })
  })

  it('does not change the list it is given', () => {
    const before = titles(ALL)
    page({ sortBy: TITLE_ASC, sortDesc: true })
    expect(titles(ALL)).toEqual(before)
  })
})

describe('tableDescription', () => {
  it('shows a description of 120 characters whole', () => {
    const text = 'x'.repeat(120)
    expect(tableDescription(text)).toBe(text)
  })

  it('cuts a description of 121 characters at the last space before 120 and keeps that space', () => {
    const text = `${'a'.repeat(119)} b`
    expect(text).toHaveLength(121)
    expect(tableDescription(text)).toBe(`${'a'.repeat(119)} `)
  })

  it('does not count a space after the 120th character', () => {
    const text = `${'a'.repeat(120)} b`
    expect(tableDescription(text)).toBeUndefined()
  })

  it('renders nothing for a long description with no space in the first 120 characters', () => {
    expect(tableDescription('x'.repeat(121))).toBeUndefined()
  })

  it('cuts at the last space inside the limit when there are several', () => {
    const text = `${'a '.repeat(50)}${'b'.repeat(40)}`
    expect(tableDescription(text)).toBe(`${'a '.repeat(50).slice(0, -1)} `)
  })
})

describe('list switch and table threshold', () => {
  it('shows the list switch only above 1400 px', () => {
    expect(showListSwitch(1400)).toBe(false)
    expect(showListSwitch(1401)).toBe(true)
  })

  it('shows the table only when the table list style is set and the window is above 1400 px', () => {
    expect(showThemeTable(1, 1401)).toBe(true)
  })

  it('keeps the grid at exactly 1400 px even with the table list style', () => {
    expect(showThemeTable(1, 1400)).toBe(false)
  })

  it('keeps the grid with the grid list style above 1400 px', () => {
    expect(showThemeTable(0, 1401)).toBe(false)
  })
})

describe('planMassDelete', () => {
  const astra = ALL[1]
  const storefront = ALL[0]
  const hello = ALL[2]

  it('does not throw when the active theme is on another page, and deletes the whole selection', () => {
    const plan = planMassDelete([storefront, hello], ALL, false)
    expect(plan).toEqual({ toDelete: [storefront, hello], skippedActive: null })
  })

  it('finds the active theme in the full list, so a selection on a page without it is planned like any other', () => {
    const plan = planMassDelete([storefront], ALL, false)
    expect(plan.toDelete).toEqual([storefront])
    expect(plan.skippedActive).toBeNull()
  })

  it('skips the selected active theme and deletes the rest', () => {
    const plan = planMassDelete([astra, storefront], ALL, false)
    expect(plan.toDelete).toEqual([storefront])
    expect(plan.skippedActive).toBe(astra)
  })

  it('does not skip the active theme in the demo mode', () => {
    const plan = planMassDelete([astra, storefront], ALL, true)
    expect(plan).toEqual({ toDelete: [astra, storefront], skippedActive: null })
  })

  it('deletes the whole selection when the full list has no active theme', () => {
    const inactive = ALL.filter(item => item.status !== 'active')
    expect(planMassDelete([storefront], inactive, false)).toEqual({ toDelete: [storefront], skippedActive: null })
  })

  it('plans nothing for an empty selection', () => {
    expect(planMassDelete([], ALL, false)).toEqual({ toDelete: [], skippedActive: null })
  })
})
