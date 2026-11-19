import type { EntityPayload } from '@/shared/events/app-events'
import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
import type { Ref } from 'vue'
import type { InstanceResource } from '@/entities/project/instance-resource'
import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
import { computed, reactive, ref, watch } from 'vue'
import { fetchFeaturedThemes, fetchThemes, searchThemes } from '@/entities/project/instance-themes.api'
import { patchCatalogueStatus, replaceByName, visibleCatalogue } from '@/entities/project/wordpress-items'
import { useAppEvent } from '@/shared/events/app-events'
import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
import { pageThemes, themeDefaultSort } from './installed-themes'
import { newThemeDefaultSort, pageNewThemes } from './new-themes'

// The page state of the installed list (`items`, `allItems`, `page`, `itemsPerPage: 6`,
// `itemsLoading`, `searchTerm`) and the paging, sort and search handlers. The page is computed from the full list, so no handler
// reloads anything. The Echo subscription is `theme-item-changed`.
// The Add New half (`newThemes`) lives here too: the tab switch is `addThemes`.

export const THEMES_PER_PAGE_OPTIONS: Array<Array<number | string>> = [[6, 12, 24]]

// Echo body of `theme-item-changed`: without a `name` there is nothing to replace, so the event is ignored (legacy matched by name too).
// The user channel carries the events of every instance, and the API body (`ThemeResource`) has `application_id`, so a theme of another
// instance is ignored (legacy patched it too). The page's own events (`use-theme-actions.ts`) have no `application_id` and go through.
function echoTheme (payload: EntityPayload, instanceId: number): InstalledTheme | null {
  if (typeof payload?.name !== 'string' || payload.name === '') {
    return null
  }
  const applicationId = payload.application_id
  if (applicationId != null && Number(applicationId) !== Number(instanceId)) {
    return null
  }
  return payload as InstalledTheme
}

export function useThemesPage (instance: Ref<InstanceResource>) {
  const allItems = ref<InstalledTheme[]>([])
  // Starts true: the first load shows the skeletons. Later loads (after an action) keep the list on screen.
  const itemsLoading = ref(true)
  const listStyle = ref(0)

  const state = useDataIteratorPageState({
    // Nothing is fetched on a page, sort or search change: the page is cut from `allItems`.
    load: () => undefined,
    serverProvided: false,
    itemsPerPage: 6,
    possibleItemsPerPage: THEMES_PER_PAGE_OPTIONS,
    sortBy: themeDefaultSort,
    sortDesc: false,
  })

  const paged = computed(() => pageThemes(allItems.value, {
    searchTerm: state.searchTerm.value,
    sortBy: state.sortBy.value,
    sortDesc: state.sortDesc.value,
    page: state.page.value,
    itemsPerPage: Number(state.itemsPerPage.value),
  }))

  const items = computed(() => paged.value.items)
  const itemsTotal = computed(() => paged.value.itemsTotal)

  const pageCount = computed(() => Math.max(1, Math.ceil(itemsTotal.value / Number(state.itemsPerPage.value))))

  // The list can shrink (a removal, a narrower search) under the current page, so the page is clamped to the last one.
  watch(pageCount, count => {
    if (state.page.value > count) {
      state.page.value = count
    }
  })

  // Request-id guard: the list is reloaded after every write, so a slow answer to an older GET never overwrites a newer list.
  let listRequestId = 0

  /**
   * A failed GET is swallowed without UI, as legacy does: the list stays as it was and the
   * loading state ends (the empty state then shows, as in legacy).
   */
  async function loadData (): Promise<void> {
    const requestId = ++listRequestId
    try {
      const list = await fetchThemes(instance.value.id)
      if (requestId !== listRequestId) {
        return
      }
      allItems.value = list
    } catch {
      // Returns on `response.error` with no message, as in legacy.
    } finally {
      if (requestId === listRequestId) {
        itemsLoading.value = false
      }
    }
  }

  /** The Add New tab is shown instead of the installed list. */
  const addThemes = ref(false)
  const newAll = ref<RepositoryTheme[]>([])
  const newLoading = ref(false)
  /** Set on every entry of the featured list (the ribbon), for the featured list only. */
  const newFeatured = ref(false)
  const newSearchTerm = ref('')

  const newState = useDataIteratorPageState({
    load: () => undefined,
    serverProvided: false,
    itemsPerPage: 6,
    possibleItemsPerPage: THEMES_PER_PAGE_OPTIONS,
    sortBy: newThemeDefaultSort,
    sortDesc: true,
  })

  // The grid always sorts descending. The total is the whole catalogue before the installed
  // themes are filtered out.
  const newGridPage = computed(() => pageNewThemes(newAll.value, allItems.value, {
    sortBy: newState.sortBy.value,
    sortDesc: true,
    page: newState.page.value,
    itemsPerPage: Number(newState.itemsPerPage.value),
  }))

  // The table takes the direction of the header. Both cut the same list.
  const newTablePage = computed(() => pageNewThemes(newAll.value, allItems.value, {
    sortBy: newState.sortBy.value,
    sortDesc: newState.sortDesc.value,
    page: newState.page.value,
    itemsPerPage: Number(newState.itemsPerPage.value),
  }))

  const newItems = computed(() => newGridPage.value.items)
  const newTableItems = computed(() => newTablePage.value.items)
  const newItemsTotal = computed(() => newGridPage.value.itemsTotal)
  // Nothing to show: the empty state with Back.
  const newEmpty = computed(() => visibleCatalogue(newAll.value, allItems.value).length === 0)

  const newPageCount = computed(() => Math.max(1, Math.ceil(newItemsTotal.value / Number(newState.itemsPerPage.value))))
  watch(newPageCount, count => {
    if (newState.page.value > count) {
      newState.page.value = count
    }
  })

  // The catalogue entry with the slug is patched too (the install spinner). Both lists are
  // patched in full here, so the status survives a sort or a page change.
  useAppEvent('theme-item-changed', payload => {
    const theme = echoTheme(payload, instance.value.id)
    if (!theme) {
      return
    }
    allItems.value = replaceByName(allItems.value, theme)
    newAll.value = [...patchCatalogueStatus(newAll.value, theme)]
  })

  // Request-id guard: a slow answer to an older term or to the featured list never overwrites a newer one.
  let newRequestId = 0

  /**
   * The search for a term, the featured list for an empty one. A failed GET keeps the
   * list that is shown and ends the loading state, as legacy did.
   */
  async function loadNewThemes (): Promise<void> {
    const requestId = ++newRequestId
    const term = newSearchTerm.value
    newLoading.value = true
    try {
      const list = term
        ? await searchThemes(instance.value.id, term)
        : await fetchFeaturedThemes(instance.value.id)
      if (requestId !== newRequestId) {
        return
      }
      newAll.value = list
      newFeatured.value = !term
    } catch {
      // A response with an error returns with no message, as in legacy.
    } finally {
      if (requestId === newRequestId) {
        newLoading.value = false
      }
    }
  }

  /** The term changes and the list reloads; the page is kept. */
  function searchNew (term: string): void {
    newSearchTerm.value = term
    void loadNewThemes()
  }

  /** Opening Add New clears the term and loads the featured list. */
  function openAddNew (): void {
    addThemes.value = true
    newSearchTerm.value = ''
    void loadNewThemes()
  }

  function closeAddNew (): void {
    addThemes.value = false
  }

  /** The header sort of the Add New filter controls, without a page reset. */
  function setNewSortBy (value: LegacySortHeader): void {
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
    addThemes,
    openAddNew,
    closeAddNew,
    searchNew,
    loadNewThemes,
    // `reactive` so the template reads the refs unwrapped (`newThemes.empty`, not `newThemes.empty.value`).
    newThemes: reactive({
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
      changeSortBy: newState.changeSortBy,
      changeSortDesc: newState.changeSortDesc,
      setSortBy: setNewSortBy,
    }),
  }
}
