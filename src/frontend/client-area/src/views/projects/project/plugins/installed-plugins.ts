import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'
import { itemAsyncState } from '@/entities/project/wordpress-items'

// The sort headers, filter, sort and paging of the installed list. Pure functions so
// the page composable and the tests share one copy. The async status and the replace-by-name helpers are shared with themes
// (`@/entities/project/wordpress-items`).

/** Default sort of the installed list: name ascending. */
export const pluginDefaultSort: LegacySortHeader = {
  text: 'name',
  align: 'start',
  value: 'title',
  sortable: true,
  searchable: true,
}

/** Sort keys of the installed list (the non-sortable columns are left out, the sort select drops them anyway). */
export const pluginSortKeys: LegacySortHeader[] = [
  pluginDefaultSort,
  { text: 'status', value: 'status', sortable: true },
]

export interface PluginPageOptions {
  searchTerm: string
  sortBy: LegacySortHeader | false
  sortDesc: boolean
  page: number
  itemsPerPage: number
}

export interface PluginPage {
  items: InstalledPlugin[]
  /** Length after the search filter and before paging. */
  itemsTotal: number
}

// Legacy sort: numbers compare numerically, anything else through `localeCompare` on the string form.
function compareValues (a: unknown, b: unknown): number {
  if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
    return Number(a) - Number(b)
  }
  return String(a ?? '').localeCompare(String(b ?? ''))
}

/**
 * The search matches the title only (the one `searchable` header), the sort
 * runs on the filtered list, then the page is cut. `itemsTotal` is the filtered length, taken before the sort and the cut.
 */
export function pagePlugins (all: readonly InstalledPlugin[], options: PluginPageOptions): PluginPage {
  let items = [...all]

  if (options.searchTerm) {
    const needle = options.searchTerm.toLowerCase()
    items = items.filter(item => String(item.title ?? '').toLowerCase().includes(needle))
  }

  const itemsTotal = items.length

  if (options.sortBy) {
    const key = options.sortBy.value
    const direction = options.sortDesc ? -1 : 1
    items.sort((first, second) => compareValues(first[key], second[key]) * direction)
  }

  items = items.slice((options.page - 1) * options.itemsPerPage, options.page * options.itemsPerPage)

  return { items, itemsTotal }
}

/**
 * The table shows on desktop only. Below the
 * breakpoint the grid is forced, so the table never shows there whatever the saved list style is.
 */
export function showTable (listStyle: number, mdAndDown: boolean): boolean {
  return listStyle === 1 && !mdAndDown
}

/** What the catalogue entry knew about a plugin at the Install click (the API row of a plugin in install has neither title nor description). */
export interface InstallingInfo {
  title: string
  description: string
}

/**
 * A plugin that is being installed comes back from the API as a stub without `title` and `description`, so its card was an empty frame
 * with a spinner. The title and the description the catalogue showed at the Install click are put in the blank fields of the plugins in
 * install (matched by `name`, which is the catalogue slug); only the action keeps the loader. Plugins out of install and filled fields are
 * returned as they are.
 */
export function fillInstallingInfo (all: readonly InstalledPlugin[], info: Readonly<Record<string, InstallingInfo>>): InstalledPlugin[] {
  return all.map(item => {
    const known = info[item.name]
    if (!known || itemAsyncState(item) !== 'installing') {
      return item
    }
    return {
      ...item,
      title: item.title || known.title,
      description: item.description || known.description,
    }
  })
}
