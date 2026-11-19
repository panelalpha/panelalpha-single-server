import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// Pure model of the theme chooser.

/** An entry of the tags sidebar: a default list, the recommended list, a server category, or a divider (`type: 'divider'`). */
export interface TemplateCategory {
  [key: string]: unknown
  id?: number | string
  name?: string
  text?: string
  value?: string
  type?: string
  order?: number
}

/** The popular and the latest lists, both served by `/instances/onboarding/themes`. */
export const DEFAULT_THEME_CATEGORIES: TemplateCategory[] = [
  { text: 'popular', value: 'popular', type: 'default' },
  { text: 'latest', value: 'new', type: 'default' },
]

/** The sort options of the filter controls; `value` is also the `browse` of the default lists. */
export const THEME_SORT_KEYS: LegacySortHeader[] = [
  { text: 'sort.popular', value: 'popular', sortable: true },
  { text: 'sort.featured', value: 'featured', sortable: true },
  { text: 'sort.recentlyUpdated', value: 'updated', sortable: true },
  { text: 'sort.latest', value: 'new', sortable: true },
]

/** Which endpoint feeds the list of a selected sidebar entry. */
export type ThemeSource = 'default' | 'recommended' | 'category'

export function themeSource (category: TemplateCategory): ThemeSource {
  if (category.type === 'default') {
    return 'default'
  }
  if (category.type === 'recommended') {
    return 'recommended'
  }
  return 'category'
}

/** Two sidebar entries are the same selection. */
export function sameCategory (a: TemplateCategory, b: TemplateCategory): boolean {
  return a.type === b.type && a.value === b.value && a.id === b.id
}

/**
 * Sorts by `order`, then fills every missing order below the largest one with a
 * divider, so the sidebar shows a separator where the server sent no category. Works on a copy of the input.
 */
export function addDividersToThemeCategories (categories: TemplateCategory[]): TemplateCategory[] {
  // The lib target predates ES2023 `toSorted`; the copy keeps the input array untouched.
  // eslint-disable-next-line unicorn/no-array-sort
  const sorted = [...categories].sort((a, b) => Number(a.order) - Number(b.order))
  // A category without an order never raises the maximum.
  const maxOrder = sorted.reduce((max, item) => (typeof item.order === 'number' && item.order > max ? item.order : max), 0)

  const result: TemplateCategory[] = []
  for (let order = 1; order <= maxOrder; order++) {
    const category = sorted.find(item => item.order === order)
    result.push(category ?? { type: 'divider', order })
  }
  return result
}

/** The sort option that matches a default list. */
export function sortKeyFor (category: TemplateCategory): LegacySortHeader | undefined {
  return THEME_SORT_KEYS.find(item => item.value === category.value)
}
