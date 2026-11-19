import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { InstalledTheme } from '@/entities/project/instance-themes.api'
import { compareValues } from '@/entities/project/wordpress-items'

// The sort headers, and the filter, the sort and the paging of the installed list. Pure functions so the page composable and the tests share one copy.
// The compare is the V2 one of `wordpress-items.ts`, shared with the catalogue.

/** The default sort of the installed list: name ascending. */
export const themeDefaultSort: LegacySortHeader = {
  text: 'name',
  align: 'start',
  value: 'title',
  sortable: true,
  searchable: true,
}

/** The sort keys of the installed list (the non-sortable columns are left out, the sort select drops them anyway). */
export const themeSortKeys: LegacySortHeader[] = [
  themeDefaultSort,
  { text: 'status', value: 'status', sortable: true },
]

export interface ThemePageOptions {
  searchTerm: string
  sortBy: LegacySortHeader | false
  sortDesc: boolean
  page: number
  itemsPerPage: number
}

export interface ThemePage {
  items: InstalledTheme[]
  /** Length after the search filter and before the sort and the cut. */
  itemsTotal: number
}

function isActive (item: InstalledTheme): boolean {
  return item.status === 'active'
}

/**
 * The search matches the title only (the one `searchable` header), case-insensitive; the sort
 * runs on the filtered list; the active theme then goes first; the page is cut last. The legacy "active first" was a one-argument
 * comparator whose result depended on the engine. Here the active themes move to the front and the rest keep the sort order, so the
 * active theme is on the first page for every sort and direction. A missing title reads as empty text and does not throw.
 */
export function pageThemes (all: readonly InstalledTheme[], options: ThemePageOptions): ThemePage {
  let items = [...all]

  if (options.searchTerm) {
    const needle = options.searchTerm.toLowerCase()
    items = items.filter(item => String(item.title ?? '').toLowerCase().includes(needle))
  }

  const itemsTotal = items.length

  if (options.sortBy) {
    const key = options.sortBy.value
    items.sort((first, second) => compareValues(first[key], second[key], options.sortDesc))
  }

  items = [...items.filter(item => isActive(item)), ...items.filter(item => !isActive(item))]

  const start = (options.page - 1) * options.itemsPerPage
  return { items: items.slice(start, start + options.itemsPerPage), itemsTotal }
}

/** The table cuts a description at 120 characters (the card cuts at 100). */
export const TABLE_DESCRIPTION_LIMIT = 120

/**
 * A description of up to 120 characters is shown whole. A longer one is cut at
 * the last space before the 120th character, and the space is kept. Without such a space the cell is empty (legacy returned `undefined`).
 */
export function tableDescription (text: string): string | undefined {
  if (text.length <= TABLE_DESCRIPTION_LIMIT) {
    return text
  }
  const lastSpace = text.lastIndexOf(' ', TABLE_DESCRIPTION_LIMIT - 1)
  if (lastSpace === -1) {
    return undefined
  }
  return `${text.slice(0, lastSpace)} `
}

/**
 * The list switch shows only above 1400 px. Below it the grid stays on screen
 * with no switch, which differs from legacy at exactly 1400 px (legacy showed the table there).
 */
export function showListSwitch (width: number): boolean {
  return width > 1400
}

/** The table replaces the grid only when the switch shows. */
export function showThemeTable (listStyle: number, width: number): boolean {
  return listStyle === 1 && showListSwitch(width)
}

export interface MassDeletePlan {
  /** The selected themes that are deleted, in the selection order. */
  toDelete: InstalledTheme[]
  /** The selected active theme, left out of the delete (outside the demo mode), or `null`. */
  skippedActive: InstalledTheme | null
}

/**
 * The active theme is looked up in the full list, not on the page the selection
 * came from: legacy searched the page, so a selection with no active theme on that page threw a TypeError before
 * any request. A selected active theme is skipped, unless the demo mode is on.
 */
export function planMassDelete (selected: readonly InstalledTheme[], all: readonly InstalledTheme[], demoMode: boolean): MassDeletePlan {
  const active = all.find(item => isActive(item))
  if (demoMode || !active) {
    return { toDelete: [...selected], skippedActive: null }
  }
  return {
    toDelete: selected.filter(item => item.name !== active.name),
    skippedActive: selected.find(item => item.name === active.name) ?? null,
  }
}
