/**
 * Legacy <-> Vuetify 4 sort translation. Kit components speak the legacy shape
 * (`sortBy` header object `{ text, value, sortable }` or `false`, `sortDesc` boolean); the V4
 * `[{ key, order }]` shape exists only here.
 */

export type LegacySortHeader = {
  [key: string]: unknown
  text?: string
  value: string
  sortable?: boolean
}

/** Legacy `sortBy`: a header object, a bare key string (DataIteratorMixin allowed it) or `false`. */
export type LegacySortBy = LegacySortHeader | string | false | null | undefined

export type V4SortItem = { key: string, order: 'asc' | 'desc' }

export type LegacySort = { sortBy: LegacySortHeader | false, sortDesc: boolean }

/** Legacy `sort-by` / `sort-desc` props to the V4 `sortBy` array; no usable key gives `[]`. */
export function toV4SortBy (sortBy: LegacySortBy, sortDesc: boolean | undefined): V4SortItem[] {
  const key = typeof sortBy === 'string' ? sortBy : (sortBy ? sortBy.value : undefined)
  if (!key) {
    return []
  }
  return [{ key, order: sortDesc ? 'desc' : 'asc' }]
}

/** V4 `sortBy` array back to the legacy header (looked up in `keys`) and `sortDesc`. */
export function fromV4SortBy (
  v4: readonly V4SortItem[] | undefined,
  keys: readonly LegacySortHeader[] | false | undefined,
): LegacySort {
  const first = v4?.[0]
  if (!first) {
    return { sortBy: false, sortDesc: false }
  }
  const header = Array.isArray(keys) ? keys.find(item => item.value === first.key) : undefined
  return { sortBy: header ?? false, sortDesc: first.order === 'desc' }
}
