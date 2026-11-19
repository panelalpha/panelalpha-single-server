import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// The sort options of the Add New state. The filter, the cut and the total of the catalogue are
// shared with themes (`@/entities/project/wordpress-items`).

/** Popular and downloadable both sort by `active_installs`, as legacy did. */
/** The initial sort: no sort. */
export const newPluginDefaultSort: LegacySortHeader = { text: 'sort.noSort', value: '', sortable: true }

export const newPluginSortKeys: LegacySortHeader[] = [
  newPluginDefaultSort,
  { text: 'sort.popular', value: 'active_installs', sortable: true },
  { text: 'sort.downloadable', value: 'active_installs', sortable: true },
  { text: 'sort.rated', value: 'rating', sortable: true },
  { text: 'sort.recent', value: 'last_updated', sortable: true },
]
