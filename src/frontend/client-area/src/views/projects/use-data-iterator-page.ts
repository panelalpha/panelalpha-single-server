import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useAppEvent } from '@/shared/events/app-events'
import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
import { defaultSortDesc, newestHeader } from './instance-sort'
import { useInstancesStore } from './instances.store'

// The page handlers of the instance list as a composable.
// The page owns no state: it reads and writes `useInstancesStore` and reloads the list on the same triggers as legacy.

export const INSTANCES_LIST_STYLE_KEY = 'instancesListStyle'
export const PAGINATION_SET_KEY = 'paginationSet'

/** `parseInt(localStorage.getItem('instancesListStyle')) ? 1 : 0` (NaN and 0 are grid). */
export function readListStyle (): 0 | 1 {
  try {
    return Number.parseInt(localStorage.getItem(INSTANCES_LIST_STYLE_KEY) as string, 10) ? 1 : 0
  } catch {
    return 0
  }
}

export function writeListStyle (value: number): void {
  try {
    localStorage.setItem(INSTANCES_LIST_STYLE_KEY, String(value))
  } catch {
    // quota / private mode
  }
}

/** `'all'` is 99, anything else is read as a number. Returns `undefined` when unset. */
export function readPaginationSet (): number | undefined {
  try {
    const stored = sessionStorage.getItem(PAGINATION_SET_KEY)
    if (stored) {
      return stored === 'all' ? 99 : Number(stored)
    }
  } catch {
    // ignore
  }
  return undefined
}

export function writePaginationSet (value: number | string): void {
  try {
    sessionStorage.setItem(PAGINATION_SET_KEY, String(value))
  } catch {
    // ignore
  }
}

/** `$route.params.filter` is a label (`{ title, color }`) in legacy; a bare title is accepted too. */
function routeFilterLabel (value: unknown): LabelChipItem | undefined {
  if (!value) {
    return undefined
  }
  if (typeof value === 'string') {
    return { title: value }
  }
  return value as LabelChipItem
}

export interface DataIteratorPageDeps {
  /** Reactive route: `params.filter` and `query.reload` are read. */
  route: { params: Record<string, unknown>, query: Record<string, unknown> }
  router: { push: (to: string) => unknown }
  /** Search debounce of the view (300 ms, as legacy). */
  searchDebounceMs?: number
}

export function useDataIteratorPage ({ route, router, searchDebounceMs = 300 }: DataIteratorPageDeps) {
  const store = useInstancesStore()
  const { spaPath } = useSpaResourcePath()
  // Legacy kept this state in component data: every visit starts from the defaults. (`availableLabels` stays: it is the Vuex copy.)
  store.reset()
  const { filterLabels, searchTerm, items, itemsLoading, loadingFailure, page, itemsPerPage, sortBy, sortDesc } = storeToRefs(store)

  const initialFilter = routeFilterLabel(route.params.filter)
  if (initialFilter) {
    filterLabels.value = [...filterLabels.value, initialFilter]
  }
  const storedPerPage = readPaginationSet()
  if (storedPerPage !== undefined) {
    itemsPerPage.value = storedPerPage
  }

  // Legacy keeps the style in localStorage and re-reads it after each write (`refreshSwitch`).
  const listStyleVersion = ref(0)
  const instancesListStyle = computed({
    get: () => {
      void listStyleVersion.value
      return readListStyle()
    },
    set: (value: number) => {
      writeListStyle(value)
      listStyleVersion.value++
    },
  })

  function loadInstances (): Promise<void> {
    return store.loadInstances()
  }

  function changePage (next: number): Promise<void> {
    page.value = next
    return loadInstances()
  }

  function changePerPage (perPage: number | string): Promise<void> {
    page.value = 1
    itemsPerPage.value = perPage
    const loaded = loadInstances()
    writePaginationSet(perPage)
    return loaded
  }

  function changeSortBy (data: LegacySortHeader): Promise<void> {
    page.value = 1
    if (data.value !== sortBy.value.value) {
      sortDesc.value = defaultSortDesc(data)
    }
    sortBy.value = data
    return loadInstances()
  }

  function changeSortDesc (data: boolean): Promise<void> {
    page.value = 1
    sortDesc.value = data
    return loadInstances()
  }

  /** Only the direction is stored; no reload. */
  function handleSortDescChange (data: boolean): void {
    sortDesc.value = data
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  function handleSearchTermChange (value: string): void {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      page.value = 1
      searchTerm.value = value
      void loadInstances()
    }, searchDebounceMs)
  }
  onScopeDispose(() => clearTimeout(searchTimer))

  function handleFilterLabels (labels: LabelChipItem[]): Promise<void> {
    page.value = 1
    filterLabels.value = labels
    return loadInstances()
  }

  function toggleFilterLabel (item: LabelChipItem): Promise<void> {
    const present = filterLabels.value.some(label => label.title === item.title)
    return handleFilterLabels(present
      ? filterLabels.value.filter(label => label.title !== item.title)
      : filterLabels.value.concat(item))
  }

  /** Empties search and labels and reloads (the page number is left as it is). */
  function clearFilters (): Promise<void> {
    searchTerm.value = ''
    filterLabels.value = []
    return loadInstances()
  }

  // `$route.query.reload` back to page 1.
  watch(() => route.query.reload, value => {
    if (!value) {
      return
    }
    page.value = 1
    void loadInstances()
  })

  // A deleted instance goes back to page 1 and reloads the list.
  function onInstanceDeleted (): void {
    page.value = 1
    void loadInstances()
  }
  useAppEvent('instance-deleted', onInstanceDeleted)
  useAppEvent('manage-first-instance', () => {
    // for demo purposes
    if (items.value.length > 0) {
      void router.push(spaPath(`${items.value[0]!.id}/general`))
    }
  })
  useAppEvent('instance-created', () => {
    sortDesc.value = true
    void changeSortBy(newestHeader())
  })
  useAppEvent('instances-list-reload', () => {
    void loadInstances()
  })
  // The list reloads when a staging install ends, so the staging leaves "in progress".
  // `staging-install-retry` is skipped: dead on the legacy list.
  useAppEvent('staging-install-finished', () => {
    void loadInstances()
  })
  useAppEvent('staging-install-failed', () => {
    void loadInstances()
  })
  useAppEvent('instance-item-changed', instance => {
    if (instance) {
      store.replaceItemFromApi(instance as unknown as RawInstance)
    }
  })
  useAppEvent('import-status-changed', instance => {
    if (instance) {
      store.replaceItemFromApi(instance as unknown as RawInstance)
    }
  })
  useAppEvent('instance-updated', instance => {
    if (instance) {
      store.replaceItem(instance.id as number, instance as unknown as InstanceResource)
    }
  })
  // Push to live: the instance page's `push-to-live-finished|failed` handlers on the list rows.
  // The payload is the staging instance; the live row is the one it hangs off.
  function setPushStatus (instance: Record<string, unknown> | undefined, value: 'finished' | 'failed'): void {
    if (!instance) {
      return
    }
    store.setPushToLiveStatus(instance.id as number, value, typeof instance.staging === 'number' ? instance.staging : undefined)
  }
  useAppEvent('push-to-live-finished', instance => setPushStatus(instance, 'finished'))
  useAppEvent('push-to-live-failed', instance => setPushStatus(instance, 'failed'))
  useAppEvent('ssl-certificate-installed', instance => {
    if (instance) {
      store.patchSsl(instance.id as number, instance.domain_ssl_details as InstanceResource['domain_ssl_details'])
      // The payload carries no certificate: the row's padlock asks the panel for it again.
      void store.refreshSslCertificate(instance.id as number)
    }
  })

  return {
    instancesListStyle,
    items,
    itemsLoading,
    loadingFailure,
    loadInstances,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSortDescChange,
    handleSearchTermChange,
    handleFilterLabels,
    toggleFilterLabel,
    clearFilters,
    onInstanceDeleted,
  }
}
