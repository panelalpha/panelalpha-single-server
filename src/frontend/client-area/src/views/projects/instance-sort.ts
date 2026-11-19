import type { InstanceKey } from './instance-keys'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'

// Sort data (`keys`, `sortBy`, `sortDesc`) as pure functions. The grid dropdown offers the `sortable`
// keys (no direction toggle), the table header sorts by click, and both end in the `sort_by` / `sort_dir` of
// `GET /instances`.

export interface InstanceSortQuery {
  sort_by: string
  sort_dir: 'asc' | 'desc'
}

/** The default sort: newest first. */
export const DEFAULT_SORT_KEY = 'created_at'

/** The options of the grid sort dropdown: `DataIteratorSortBy` shows `keys.filter(item => item.sortable)`. */
export function sortOptions (keys: readonly InstanceKey[]): InstanceKey[] {
  return keys.filter(key => key.sortable)
}

/** `sort_by` is the header `value` as it is (`name`, `bandwidth`, `storage`, `created_at`); no header sorts by newest. */
export function toSortQuery (sortBy: LegacySortHeader | false | null | undefined, sortDesc: boolean): InstanceSortQuery {
  return {
    sort_by: (sortBy && sortBy.value) || DEFAULT_SORT_KEY,
    sort_dir: sortDesc ? 'desc' : 'asc',
  }
}

/** The direction a sort starts in: names read A to Z, Newest and the two measures stay biggest first. */
export function defaultSortDesc (sortBy: LegacySortHeader | false | null | undefined): boolean {
  return ((sortBy && sortBy.value) || DEFAULT_SORT_KEY) !== 'name'
}

/**
 * The "newest" header `instance-created` switches to. `text` is the copy key suffix, not the translated title: the table
 * header shows `table.header.<text>` and the sort dropdown `form.option.<text>`.
 */
export function newestHeader (): LegacySortHeader {
  return { text: 'newest', value: DEFAULT_SORT_KEY }
}
