import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { type InstanceResource, type RawInstance, toInstanceResource } from '@/entities/project/instance-resource'
import { getDetectedCertificate } from '@/entities/project/instance-ssl.api'
import { getErrorMessage } from '@/shared/api/error-message'
import { useSessionStore } from '@/shared/session/session.store'
import { toSortQuery } from './instance-sort'
import { DEFAULT_INSTANCES_PER_PAGE, listInstances } from './instances.api'

/** The "newest" header the sort dropdown starts on. */
export const DEFAULT_SORT: LegacySortHeader = {
  text: 'newest',
  value: 'created_at',
  sortable: true,
  align: 'end',
}

/** Items are selected by `item.id || item.name`. */
function checkId (item: { id?: number, name?: string }): number | string | undefined {
  return item.id || item.name
}

/**
 * State of the instance list screen. The handlers that react to user input and events live in `use-data-iterator-page.ts`.
 */
export const useInstancesStore = defineStore('instances', () => {
  const session = useSessionStore()

  const items = ref<InstanceResource[]>([])
  const itemsTotal = ref(0)
  const itemsLoading = ref(true)
  // Set by a failed load and cleared by the next successful one (legacy kept it for the life of the screen, so a list emptied
  // after a failure never showed the onboarding card). `loadingError` is the API message the list shows with Retry.
  const loadingFailure = ref(false)
  const loadingError = ref('')
  const page = ref(1)
  const itemsPerPage = ref<number | string>(DEFAULT_INSTANCES_PER_PAGE)
  const sortBy = ref<LegacySortHeader>({ ...DEFAULT_SORT })
  const sortDesc = ref(true)
  const searchTerm = ref('')
  const filterLabels = ref<LabelChipItem[]>([])
  const checkedItems = ref<Array<number | string>>([])

  const filtersActive = computed(() => filterLabels.value.length > 0 || Boolean(searchTerm.value))

  const selectedInstances = computed(() => items.value.filter(item => checkedItems.value.includes(item.id)))

  const unfilteredEmpty = computed(() =>
    items.value.length === 0 && !itemsLoading.value && !filtersActive.value && !loadingFailure.value,
  )

  /** The legacy screen kept this state in component data, so every visit started from scratch; the view calls this on setup. */
  function reset (): void {
    items.value = []
    itemsTotal.value = 0
    itemsLoading.value = true
    loadingFailure.value = false
    loadingError.value = ''
    page.value = 1
    itemsPerPage.value = DEFAULT_INSTANCES_PER_PAGE
    sortBy.value = { ...DEFAULT_SORT }
    sortDesc.value = true
    searchTerm.value = ''
    filterLabels.value = []
    checkedItems.value = []
  }

  /** One request for the current query. A failure keeps the items and flags `loadingFailure`. */
  // Each `loadInstances` takes a ticket; an answer for an older query (page, sort, filter changed meanwhile) is dropped.
  let loadSeq = 0

  async function loadInstances (): Promise<void> {
    const seq = ++loadSeq
    itemsLoading.value = true

    const { sort_by: sortKey, sort_dir: sortDir } = toSortQuery(sortBy.value, sortDesc.value)
    let result
    try {
      result = await listInstances({
        page: page.value,
        perPage: itemsPerPage.value as number,
        sortBy: sortKey,
        sortDir,
        searchTerm: searchTerm.value,
        labels: filterLabels.value.map(label => label.title),
        home: session.home,
      })
    } catch (error) {
      if (seq !== loadSeq) {
        return
      }
      console.error(error)
      itemsLoading.value = false
      loadingFailure.value = true
      loadingError.value = getErrorMessage(error)
      return
    }

    if (seq !== loadSeq) {
      return
    }
    itemsLoading.value = false
    loadingFailure.value = false
    loadingError.value = ''
    itemsTotal.value = result.meta.total as number
    setInstances(result.data)
  }

  function setInstances (data: InstanceResource[]): void {
    items.value = data
  }

  /** Echo `instance-item-changed` / `import-status-changed`: the item is rebuilt in place, the list is not reloaded. */
  function replaceItemFromApi (raw: RawInstance): boolean {
    return replaceItem(raw.id, toInstanceResource(raw, session.home))
  }

  /** `instance-updated`: the resource is already built. Returns `false` when the item is not on the page. */
  function replaceItem (id: number, resource: InstanceResource): boolean {
    const index = items.value.findIndex(item => item.id === id)
    if (index === -1) {
      return false
    }
    items.value[index] = resource
    items.value = [...items.value]
    return true
  }

  function patchSsl (id: number, details: InstanceResource['domain_ssl_details']): void {
    const target = items.value.find(item => item.id === id)
    if (target) {
      // The slim broadcast carries no certificate details: the row keeps the certificate it shows.
      if (details !== undefined) {
        target.domain_ssl_details = details
      }
      // app-lite: the certificate arrived, so the SSL order is over. App never orders (always `none`).
      target.ssl_order_status = 'none'
    }
  }

  /**
   * Echo `ssl-certificate-installed`: the row's padlock shows the certificate the panel detects itself and the slim payload
   * carries none, so ask the server again. A failed request keeps the certificate the row shows.
   */
  async function refreshSslCertificate (id: number): Promise<void> {
    const target = items.value.find(item => item.id === id)
    if (!target || target.domain === undefined || target.hostingId === undefined || target.hostingId === null) {
      return
    }
    try {
      target.setDetectedSslCert(await getDetectedCertificate(target.hostingId as number, target.domain))
    } catch {
      // the row keeps the certificate it shows
    }
  }

  /**
   * Sets one `async_status` key on the item with this id,
   * a main row or a staging sub-row. Returns `false` when the id is not on the page.
   */
  function patchAsyncStatus (id: number, key: keyof InstanceResource['async_status'], value: string | null): boolean {
    for (const item of items.value) {
      const target = item.id === id ? item : item.subInstances.find(sub => sub.id === id)
      if (target) {
        target.async_status = { ...target.async_status, [key]: value }
        return true
      }
    }
    return false
  }

  /** The live row a staging sub-row hangs off (`null` when the id is not a sub-row on the page). */
  function parentOf (stagingId: number): InstanceResource | null {
    return items.value.find(item => item.subInstances.some(sub => sub.id === stagingId)) ?? null
  }

  /**
   * The push to live of one staging instance: its `push_to_live` and the live row's `pull_from_staging` move together.
   * `liveId` is the fallback when the sub-row is not on the page.
   */
  function setPushToLiveStatus (stagingId: number, value: string, liveId?: number): void {
    patchAsyncStatus(stagingId, 'push_to_live', value)
    const live = parentOf(stagingId)?.id ?? liveId
    if (live !== undefined) {
      patchAsyncStatus(live, 'pull_from_staging', value)
    }
  }

  /** Toggles one item. */
  function handleItemCheck (item: { id?: number, name?: string }): void {
    const id = checkId(item) as number | string
    const index = checkedItems.value.indexOf(id)
    if (index === -1) {
      checkedItems.value.push(id)
    } else {
      checkedItems.value.splice(index, 1)
    }
  }

  /** Checks (or unchecks) every item of the page. */
  function handleSelectAll (checked: boolean): void {
    for (const item of items.value) {
      const included = checkedItems.value.includes(checkId(item) as number | string)
      if (checked ? !included : included) {
        handleItemCheck(item)
      }
    }
  }

  return {
    items,
    itemsTotal,
    itemsLoading,
    loadingFailure,
    loadingError,
    page,
    itemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    filterLabels,
    checkedItems,
    filtersActive,
    selectedInstances,
    unfilteredEmpty,
    reset,
    loadInstances,
    setInstances,
    replaceItem,
    replaceItemFromApi,
    patchSsl,
    refreshSslCertificate,
    patchAsyncStatus,
    setPushToLiveStatus,
    handleItemCheck,
    handleSelectAll,
  }
})
