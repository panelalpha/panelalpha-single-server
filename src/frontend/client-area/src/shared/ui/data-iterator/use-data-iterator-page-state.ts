import type { LegacySortHeader } from './sort-model'
import { ref } from 'vue'

/**
 * The page / per-page / sort / search handlers (`isServerProvided`) of the legacy page mixin plus the page
 * half of `CustomTablePageMixin` (items per page, possible per-page options), without the store that
 * `views/projects/use-data-iterator-page.ts` is bound to.
 *
 * With `serverProvided` (legacy default `true`) every change calls `load()`, even when the table sorts and pages
 * the loaded items itself (the devices table refetches `GET /user/devices` on each of them).
 */
export interface DataIteratorPageStateOptions {
  load: () => void | Promise<void>
  serverProvided?: boolean
  itemsPerPage?: number | string
  possibleItemsPerPage?: Array<Array<number | string>>
  sortBy?: LegacySortHeader | false
  sortDesc?: boolean
}

export function useDataIteratorPageState (options: DataIteratorPageStateOptions) {
  const serverProvided = options.serverProvided ?? true

  const page = ref(1)
  const itemsPerPage = ref<number | string>(options.itemsPerPage ?? 10)
  const possibleItemsPerPage = options.possibleItemsPerPage ?? [[10, 20, 30]]
  const sortBy = ref<LegacySortHeader | false>(options.sortBy ?? false)
  const sortDesc = ref(options.sortDesc ?? true)
  const searchTerm = ref('')

  function reload (): void {
    if (serverProvided) {
      void options.load()
    }
  }

  function changePage (value: number): void {
    page.value = value
    reload()
  }

  function changePerPage (value: number | string): void {
    page.value = 1
    itemsPerPage.value = value
    reload()
  }

  function changeSortBy (value: LegacySortHeader): void {
    page.value = 1
    sortBy.value = value
    reload()
  }

  function changeSortDesc (value: boolean): void {
    page.value = 1
    sortDesc.value = value
    reload()
  }

  function handleSearchTermChange (value: string): void {
    page.value = 1
    searchTerm.value = value
    reload()
  }

  function clearFilters (): void {
    handleSearchTermChange('')
  }

  return {
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
    clearFilters,
  }
}
