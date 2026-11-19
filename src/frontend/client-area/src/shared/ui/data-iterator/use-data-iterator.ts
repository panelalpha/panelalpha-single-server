import type { LegacySortBy, LegacySortHeader } from './sort-model'
import { computed, type PropType } from 'vue'

/**
 * The legacy data iterator mixin as a typed props object plus
 * the two computeds. Spread it into `defineProps({ ...dataIteratorProps })`. The mixin's `listStyle`
 * watcher (calls `updateItemsPerPage`, which no user of the mixin defines) is omitted.
 */
export const dataIteratorProps = {
  loading: { type: Boolean, default: false },
  items: { type: Array as PropType<unknown[]>, default: () => [] },
  listStyle: { type: Number, default: 0 },
  searchTerm: { type: String, default: '' },
  possibleItemsPerPage: {
    type: Array as PropType<Array<Array<number | string>>>,
    default: () => [[4, 8, 16]],
  },
  // Legacy default factory was `() => { false }` (returns undefined); `false` is the intended value.
  keys: { type: [Array, Boolean] as PropType<LegacySortHeader[] | boolean>, default: false },
  sortBy: { type: [String, Object, Boolean] as PropType<LegacySortBy>, default: false },
  sortDesc: { type: Boolean, default: true },
  page: Number,
  itemsPerPage: Number,
  itemsTotal: Number,
}

type DataIteratorState = {
  sortBy?: LegacySortBy
  keys?: LegacySortHeader[] | boolean
  itemsTotal?: number
  itemsPerPage?: number
}

export function useDataIterator (props: DataIteratorState) {
  const numberOfPages = computed(() => Math.ceil((props.itemsTotal as number) / (props.itemsPerPage as number)))
  const filteredKeys = computed(() => (props.sortBy ? props.keys : false))
  return { numberOfPages, filteredKeys }
}
