import type { InstallingInfo } from './installed-plugins'
import type { EntityPayload } from '@/shared/events/app-events'
import type { Ref } from 'vue'
import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { computed, reactive, ref, watch } from 'vue'
import { fetchFeaturedPlugins, fetchPlugins, searchPlugins } from '@/entities/project/instance-plugins.api'
import { pageCatalogue, patchCatalogueStatus, replaceByName, visibleCatalogue } from '@/entities/project/wordpress-items'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { useAppEvent } from '@/shared/events/app-events'
import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
import { fillInstallingInfo, pagePlugins, pluginDefaultSort } from './installed-plugins'
import { newPluginDefaultSort } from './new-plugins'

// The installed list, the paging and sort handlers. The page is computed from the full list, so no handler reloads anything (legacy did the same, no GET).
// The Add New half (`newPlugins`, `reloadNewPlugins`, `loadNewPlugins`) lives here too: the tab switch is `addPlugins`.

export const PLUGINS_PER_PAGE_OPTIONS: Array<Array<number | string>> = [[8, 16, 24]]

// Echo body of `plugin-item-changed`: without a `name` there is nothing to replace, so the event is ignored (legacy matched by name too).
function echoPlugin (payload: EntityPayload): InstalledPlugin | null {
  return typeof payload?.name === 'string' && payload.name !== '' ? payload as InstalledPlugin : null
}

export function usePluginsPage (instance: Ref<InstanceResource>) {
  const alerts = useAlertsStore()
  const allItems = ref<InstalledPlugin[]>([])
  const itemsLoading = ref(true)
  const listStyle = ref(0)

  const state = useDataIteratorPageState({
    // Nothing is fetched on a page, sort or search change: the page is cut from `allItems`.
    load: () => undefined,
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: PLUGINS_PER_PAGE_OPTIONS,
    sortBy: pluginDefaultSort,
    sortDesc: false,
  })

  // Title and description of the plugins in install, taken from the catalogue entry at the Install click (see `fillInstallingInfo`).
  const installingInfo = ref<Record<string, InstallingInfo>>({})

  function rememberInstalling (catalogue: Pick<RepositoryPlugin, 'slug' | 'name' | 'short_description' | 'description'>): void {
    installingInfo.value = {
      ...installingInfo.value,
      [catalogue.slug]: {
        title: catalogue.name,
        description: catalogue.short_description || catalogue.description || '',
      },
    }
  }

  const paged = computed(() => pagePlugins(fillInstallingInfo(allItems.value, installingInfo.value), {
    searchTerm: state.searchTerm.value,
    sortBy: state.sortBy.value,
    sortDesc: state.sortDesc.value,
    page: state.page.value,
    itemsPerPage: Number(state.itemsPerPage.value),
  }))

  const items = computed(() => paged.value.items)
  const itemsTotal = computed(() => paged.value.itemsTotal)

  const pageCount = computed(() => Math.max(1, Math.ceil(itemsTotal.value / Number(state.itemsPerPage.value))))

  // The list can shrink (a removal, a narrower search) under the current page. Legacy's V2 iterator clamped its own copy and the
  // host kept the stale number; here the page is clamped so the host and the footer agree.
  watch(pageCount, count => {
    if (state.page.value > count) {
      state.page.value = count
    }
  })

  // Request-id guard: the list is reloaded after every write, so a slow answer to an older GET never overwrites a newer list,
  // nor the one a delete answered with (`setItems`).
  let listRequestId = 0

  /** The full list from a write's answer (the single delete): it supersedes any GET in flight and goes to the instance as well. */
  function setItems (list: InstalledPlugin[]): void {
    listRequestId++
    allItems.value = list
    instance.value.setPluginsData(list)
    itemsLoading.value = false
  }

  /**
   * The list is handed to the instance on success (legacy `plugins-reload`, which the
   * frame turns into the tab chip). A failed GET (403 or 5xx) shows an error alert and leaves the empty state (legacy: silent).
   */
  async function loadData (): Promise<void> {
    const requestId = ++listRequestId
    try {
      const list = await fetchPlugins(instance.value.id)
      if (requestId !== listRequestId) {
        return
      }
      allItems.value = list
      instance.value.setPluginsData(list)
    } catch (error) {
      // Legacy returns on `response.error` with no message (silent empty state); here the error is shown.
      if (requestId === listRequestId) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (requestId === listRequestId) {
        itemsLoading.value = false
      }
    }
  }

  /** The Add New tab is shown instead of the installed list. */
  const addPlugins = ref(false)
  const newAll = ref<RepositoryPlugin[]>([])
  const newLoading = ref(false)
  /** `featured = true` on every entry of the featured list (the ribbon). Set for the featured list only. */
  const newFeatured = ref(false)
  const newSearchTerm = ref('')

  const newState = useDataIteratorPageState({
    load: () => undefined,
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: PLUGINS_PER_PAGE_OPTIONS,
    sortBy: newPluginDefaultSort,
    sortDesc: false,
  })

  // The grid always sorts descending; the table takes its direction from
  // the header. Both cut the same list, so the total is shared.
  const newGridPage = computed(() => pageCatalogue(newAll.value, allItems.value, {
    sortBy: newState.sortBy.value,
    sortDesc: true,
    page: newState.page.value,
    itemsPerPage: Number(newState.itemsPerPage.value),
  }))

  const newTablePage = computed(() => pageCatalogue(newAll.value, allItems.value, {
    sortBy: newState.sortBy.value,
    sortDesc: newState.sortDesc.value,
    page: newState.page.value,
    itemsPerPage: Number(newState.itemsPerPage.value),
  }))

  const newItems = computed(() => newGridPage.value.items)
  const newTableItems = computed(() => newTablePage.value.items)
  const newItemsTotal = computed(() => newGridPage.value.itemsTotal)
  // Nothing to show: the empty state with "Start Searching" and Back.
  const newEmpty = computed(() => visibleCatalogue(newAll.value, allItems.value).length === 0)

  const newPageCount = computed(() => Math.max(1, Math.ceil(newItemsTotal.value / Number(newState.itemsPerPage.value))))
  watch(newPageCount, count => {
    if (newState.page.value > count) {
      newState.page.value = count
    }
  })

  // The instance gets the new status, the installed list gets it in
  // place and the catalogue entry with that slug takes its `async_status` (the install spinner).
  // The page is cut from `allItems`, so the status survives a sort or a page change (legacy patched only the visible page).
  // Unlike legacy, the subscription ends with the page (`useAppEvent` drops it on scope dispose).
  useAppEvent('plugin-item-changed', payload => {
    const plugin = echoPlugin(payload)
    if (!plugin) {
      return
    }
    allItems.value = replaceByName(allItems.value, plugin)
    newAll.value = [...patchCatalogueStatus(newAll.value, plugin)]
    instance.value.setPluginItem(plugin)
  })

  // Request-id guard: a slow answer to an older term or to the featured list never overwrites a newer one.
  let newRequestId = 0

  /**
   * The search for a term, the featured list for an empty one. A failed GET keeps the
   * list that is shown and ends the loading state, as legacy did.
   */
  async function loadNewPlugins (): Promise<void> {
    const requestId = ++newRequestId
    const term = newSearchTerm.value
    newLoading.value = true
    try {
      const list = term
        ? await searchPlugins(instance.value.id, term)
        : await fetchFeaturedPlugins(instance.value.id)
      if (requestId !== newRequestId) {
        return
      }
      newAll.value = list
      newFeatured.value = !term
    } catch {
      // Returns on `response.error` with no message, as legacy.
    } finally {
      if (requestId === newRequestId) {
        newLoading.value = false
      }
    }
  }

  /** The term changes and the list reloads; the page is kept. */
  function searchNew (term: string): void {
    newSearchTerm.value = term
    void loadNewPlugins()
  }

  /** Opening Add New clears the term and loads the featured list. */
  function openAddNew (): void {
    addPlugins.value = true
    newSearchTerm.value = ''
    void loadNewPlugins()
  }

  function closeAddNew (): void {
    addPlugins.value = false
  }

  /** Sets the sort without a page reset. */
  function setNewSortBy (value: typeof newPluginDefaultSort): void {
    newState.sortBy.value = value
  }

  return {
    allItems,
    items,
    itemsTotal,
    itemsLoading,
    listStyle,
    page: state.page,
    itemsPerPage: state.itemsPerPage,
    possibleItemsPerPage: state.possibleItemsPerPage,
    sortBy: state.sortBy,
    sortDesc: state.sortDesc,
    searchTerm: state.searchTerm,
    changePage: state.changePage,
    changePerPage: state.changePerPage,
    changeSortBy: state.changeSortBy,
    changeSortDesc: state.changeSortDesc,
    handleSearchTermChange: state.handleSearchTermChange,
    clearFilters: state.clearFilters,
    loadData,
    setItems,
    rememberInstalling,
    addPlugins,
    openAddNew,
    closeAddNew,
    searchNew,
    loadNewPlugins,
    // `reactive` so the template reads the refs unwrapped (`newPlugins.empty`, not `newPlugins.empty.value`).
    newPlugins: reactive({
      allItems: newAll,
      featured: newFeatured,
      loading: newLoading,
      searchTerm: newSearchTerm,
      sortBy: newState.sortBy,
      sortDesc: newState.sortDesc,
      page: newState.page,
      itemsPerPage: newState.itemsPerPage,
      possibleItemsPerPage: newState.possibleItemsPerPage,
      items: newItems,
      tableItems: newTableItems,
      itemsTotal: newItemsTotal,
      empty: newEmpty,
      changePage: newState.changePage,
      changePerPage: newState.changePerPage,
      // The table's header sort resets the page.
      changeSortBy: newState.changeSortBy,
      changeSortDesc: newState.changeSortDesc,
      setSortBy: setNewSortBy,
    }),
  }
}
