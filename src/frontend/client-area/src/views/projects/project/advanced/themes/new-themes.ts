import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { RepositoryTheme } from '@/entities/project/instance-themes.api'
import type { CataloguePage, CataloguePageOptions } from '@/entities/project/wordpress-items'
import { pageCatalogue } from '@/entities/project/wordpress-items'

// The sort keys and the default sort of the Add New state. The filter, the sort and the cut of the catalogue are shared with plugins
// (`@/entities/project/wordpress-items`).

export const newThemeSortKeys: LegacySortHeader[] = [
  { text: 'sort.rated', value: 'rating', sortable: true },
  { text: 'sort.recent', value: 'last_updated', sortable: true },
]

/** The initial sort: rating, the grid's order, offered by the list above. */
export const newThemeDefaultSort: LegacySortHeader = newThemeSortKeys[0]!

/**
 * As the host runs it: drop the installed themes, sort, cut the page. The total is the whole
 * catalogue before that filter. The legacy comparator sorted numbers only, so the text sort of `last_updated` is new here (the same
 * compare as plugins and the installed list).
 */
export function pageNewThemes (
  all: readonly RepositoryTheme[],
  installed: readonly { name: string }[],
  options: CataloguePageOptions,
): CataloguePage<RepositoryTheme> {
  return pageCatalogue(all, installed, options)
}
