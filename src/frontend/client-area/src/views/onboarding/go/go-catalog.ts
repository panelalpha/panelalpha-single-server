import { computed, ref, watch } from 'vue'
import {
  getGoApp,
  getGoApps,
  getGoCategories,
  getGoStatus,
  GO_SEARCH_MIN_LENGTH,
  type GoApp,
  type GoAppDetails,
  type GoCategory,
  goFailure,
  type GoFailure,
  type GoSort,
} from './go-catalog.api'

// State of the PanelAlpha Go screen: the status, the categories of the sidebar, the search (debounced, from two characters), the pages of
// apps and the app opened in its details. A request that ends after a newer one started is dropped (`seq`), so a slow answer never replaces the
// list of a newer search.

/** The search box waits this long after the last key before it asks the panel. */
export const GO_SEARCH_DEBOUNCE_MS = 250

/** The search sent to the panel: shorter than two characters means the whole catalog. */
export function effectiveQuery (raw: string): string {
  const query = raw.trim()
  return query.length >= GO_SEARCH_MIN_LENGTH ? query : ''
}

export function useGoCatalog () {
  const failure = ref<GoFailure | null>(null)
  const loadingStatus = ref(false)
  const searchTerm = ref('')
  const query = ref('')
  /** The category picked in the sidebar; null is every app. */
  const category = ref<string | null>(null)
  /** The sidebar's "Latest": every app, the most recently verified first (the sort menu does not apply). */
  const latest = ref(false)
  /** The sort menu; "Most tried" first, as Go's mockup. */
  const sort = ref<GoSort>('tried')
  /** The order the list is asked in. */
  const effectiveSort = computed<GoSort>(() => (latest.value ? 'verified' : sort.value))
  const categories = ref<GoCategory[]>([])
  const loadingCategories = ref(false)
  const apps = ref<GoApp[]>([])
  const total = ref(0)
  const page = ref(1)
  const lastPage = ref(1)
  const loadingApps = ref(false)
  const loadingMore = ref(false)
  const selected = ref<GoAppDetails | null>(null)
  const loadingDetails = ref(false)
  const detailsFailed = ref(false)
  /** The app whose Install on the list reads its recipe from Go. */
  const installing = ref<string | null>(null)

  let seq = 0
  let detailsSeq = 0
  let categoriesSeq = 0
  let debounce: ReturnType<typeof setTimeout> | null = null

  const hasMore = computed(() => page.value < lastPage.value)

  async function loadApps (): Promise<void> {
    const mine = ++seq
    loadingApps.value = true
    try {
      const result = await getGoApps({ q: query.value, category: category.value, sort: effectiveSort.value, page: 1 })
      if (mine !== seq) {
        return
      }
      apps.value = result.data
      total.value = result.meta.total ?? result.data.length
      page.value = result.meta.current_page ?? 1
      lastPage.value = result.meta.last_page ?? 1
      failure.value = null
    } catch (error) {
      if (mine === seq) {
        failure.value = goFailure(error)
      }
    } finally {
      if (mine === seq) {
        loadingApps.value = false
      }
    }
  }

  async function loadMore (): Promise<void> {
    if (!hasMore.value || loadingMore.value || loadingApps.value) {
      return
    }
    const mine = seq
    loadingMore.value = true
    try {
      const result = await getGoApps({ q: query.value, category: category.value, sort: effectiveSort.value, page: page.value + 1 })
      if (mine !== seq) {
        return
      }
      const known = new Set(apps.value.map(app => app.slug))
      apps.value = [...apps.value, ...result.data.filter(app => !known.has(app.slug))]
      page.value = result.meta.current_page ?? page.value + 1
      lastPage.value = result.meta.last_page ?? page.value
    } catch (error) {
      if (mine === seq) {
        failure.value = goFailure(error)
      }
    } finally {
      loadingMore.value = false
    }
  }

  /** The first open: the status decides between the catalog and the "connect to Hub" prompt, then the first page loads. */
  async function open (): Promise<void> {
    reset()
    loadingStatus.value = true
    try {
      const status = await getGoStatus()
      if (!status.connected) {
        failure.value = 'hub_not_connected'
        return
      }
      if (!status.available) {
        failure.value = 'go_unavailable'
        return
      }
      void loadCategories()
      await loadApps()
    } catch (error) {
      failure.value = goFailure(error)
    } finally {
      loadingStatus.value = false
    }
  }

  /** The sidebar's categories. Without them the sidebar only offers every app; the list still works. */
  async function loadCategories (): Promise<void> {
    const mine = ++categoriesSeq
    loadingCategories.value = true
    try {
      const result = await getGoCategories()
      if (mine === categoriesSeq) {
        categories.value = result
      }
    } catch {
      if (mine === categoriesSeq) {
        categories.value = []
      }
    } finally {
      if (mine === categoriesSeq) {
        loadingCategories.value = false
      }
    }
  }

  /** A category of the sidebar (null: every app): the list starts again from its first page, the search stays. */
  function selectCategory (name: string | null): void {
    if (name === category.value && !latest.value) {
      return
    }
    category.value = name
    latest.value = false
    void loadApps()
  }

  /** The sidebar's "Latest": every app, the most recently verified first; the search stays. */
  function showLatest (): void {
    if (latest.value) {
      return
    }
    category.value = null
    latest.value = true
    void loadApps()
  }

  /** The sort menu. On "Latest" (which has its own order) it goes back to every app in the order picked. */
  function selectSort (value: GoSort): void {
    if (value === sort.value && !latest.value) {
      return
    }
    sort.value = value
    latest.value = false
    void loadApps()
  }

  /** The empty state's "Clear filter": every app, no search. */
  function clearFilters (): void {
    if (debounce) {
      clearTimeout(debounce)
      debounce = null
    }
    const changed = category.value !== null || latest.value || query.value !== ''
    searchTerm.value = ''
    query.value = ''
    category.value = null
    latest.value = false
    if (changed) {
      void loadApps()
    }
  }

  function reset (): void {
    seq++
    detailsSeq++
    categoriesSeq++
    if (debounce) {
      clearTimeout(debounce)
      debounce = null
    }
    failure.value = null
    searchTerm.value = ''
    query.value = ''
    category.value = null
    latest.value = false
    sort.value = 'tried'
    categories.value = []
    loadingCategories.value = false
    apps.value = []
    total.value = 0
    page.value = 1
    lastPage.value = 1
    selected.value = null
    loadingApps.value = false
    loadingMore.value = false
    loadingDetails.value = false
    detailsFailed.value = false
    installing.value = null
  }

  // Debounced: the list follows the search box once the user stops typing; a change that keeps the same query (a third space) asks nothing.
  watch(searchTerm, value => {
    if (debounce) {
      clearTimeout(debounce)
    }
    debounce = setTimeout(() => {
      debounce = null
      const next = effectiveQuery(value)
      if (next !== query.value) {
        query.value = next
        void loadApps()
      }
    }, GO_SEARCH_DEBOUNCE_MS)
  })

  /** Opens an app: the list's fields show at once, its details (and the install recipe) come from Go. */
  async function openApp (app: GoApp): Promise<void> {
    const mine = ++detailsSeq
    selected.value = { ...app }
    detailsFailed.value = false
    loadingDetails.value = true
    try {
      const details = await getGoApp(app.slug)
      if (mine === detailsSeq) {
        selected.value = details
      }
    } catch (error) {
      if (mine === detailsSeq) {
        detailsFailed.value = true
        if (goFailure(error) === 'hub_not_connected') {
          failure.value = 'hub_not_connected'
        }
      }
    } finally {
      if (mine === detailsSeq) {
        loadingDetails.value = false
      }
    }
  }

  /**
   * Install on the list: the app's recipe is read from Go now (never the list's), one app at a time. Resolves null when it could not be
   * read; the details then open with their error (or the Hub prompt shows), so the user is never left without an answer.
   */
  async function recipe (app: GoApp): Promise<GoAppDetails | null> {
    if (installing.value !== null) {
      return null
    }
    const mine = detailsSeq
    installing.value = app.slug
    try {
      return await getGoApp(app.slug)
    } catch (error) {
      if (goFailure(error) === 'hub_not_connected') {
        failure.value = 'hub_not_connected'
      } else if (mine === detailsSeq) {
        void openApp(app)
      }
      return null
    } finally {
      if (installing.value === app.slug) {
        installing.value = null
      }
    }
  }

  function closeApp (): void {
    detailsSeq++
    selected.value = null
    loadingDetails.value = false
    detailsFailed.value = false
  }

  return {
    failure,
    loadingStatus,
    searchTerm,
    query,
    category,
    latest,
    sort,
    categories,
    loadingCategories,
    apps,
    total,
    hasMore,
    loadingApps,
    loadingMore,
    selected,
    loadingDetails,
    detailsFailed,
    installing,
    open,
    reset,
    loadApps,
    loadMore,
    selectCategory,
    showLatest,
    selectSort,
    clearFilters,
    openApp,
    recipe,
    closeApp,
  }
}
