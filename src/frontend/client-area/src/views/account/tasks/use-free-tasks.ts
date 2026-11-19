import type { FreeTask } from './tasks.api'
import type { ProjectOption } from '@/entities/project/project-options.api'
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { listProjectOptions } from '@/entities/project/project-options.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage, isApiError } from '@/shared/api/error-message'
import { nextPollDelay, TASK_STATUS_TABS, TASKS_PER_PAGE } from './tasks-table'
import { listFreeTasks } from './tasks.api'

/**
  * State, loading and polling of the Free tasks list. Every request takes a sequence id and only the
 * latest one writes state and schedules the next poll; a new request clears the timer first, so timers never stack. A failed background poll
 * stays quiet and retries at the slow pace; polling pauses while the tab is hidden and refetches when it is visible again.
 */
export function useFreeTasks () {
  const alerts = useAlertsStore()

  const tasks = ref<FreeTask[]>([])
  const total = ref(0)
  const lastPage = ref(1)
  const page = ref(1)
  const itemsPerPage = ref(TASKS_PER_PAGE)
  const loading = ref(false)
  const initialLoading = ref(true)
  const now = ref(Date.now())
  // `''` is the "All" item of each select, not an unset value; `listFreeTasks` sends a filter only when it is set.
  const status = ref('')
  const action = ref('')
  // The project select (`null` is "All"), the options (loaded once on mount) and the status tab as an index into `TASK_STATUS_TABS`
  // (it reads and writes `status`; a status outside the tabs reads as the "All" tab).
  const project = ref<number | null>(null)
  const projectOptions = ref<ProjectOption[]>([])
  const statusTab = computed<number>({
    get: () => Math.max(0, TASK_STATUS_TABS.indexOf(status.value as typeof TASK_STATUS_TABS[number])),
    set: value => {
      status.value = TASK_STATUS_TABS[value] ?? ''
    },
  })
  // The key of the expanded row; a filter, page or page size change collapses it, a poll does not.
  const expandedKey = ref<string | number | null>(null)

  let seq = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer (): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule ({ failed = false } = {}): void {
    clearTimer()
    if (disposed || document.hidden) {
      return
    }
    timer = setTimeout(() => {
      void load({ poll: true })
    }, nextPollDelay(tasks.value, failed))
  }

  async function load ({ poll = false } = {}): Promise<void> {
    clearTimer()
    const current = ++seq
    if (!poll) {
      loading.value = true
    }
    let failed = false
    try {
      const response = await listFreeTasks({ page: page.value, perPage: itemsPerPage.value, status: status.value || undefined, action: action.value || undefined, project: project.value ?? undefined })
      if (disposed || current !== seq) {
        return
      }
      tasks.value = response.items
      total.value = response.total
      lastPage.value = response.lastPage
      now.value = Date.now()
    } catch (error) {
      if (disposed || current !== seq) {
        return
      }
      // A project deleted after the options were loaded answers 404 (`findForUser`): back to "All", the options again, one GET without
      // `project`. Otherwise the rows of the previous filter would stay under the alert and every poll would hit the 404.
      if (project.value !== null && isApiError(error) && error.response?.status === 404) {
        project.value = null
        expandedKey.value = null
        page.value = 1
        void loadProjectOptions()
        void load({ poll })
        return
      }
      failed = true
      if (!poll) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    }
    if (disposed || current !== seq) {
      return
    }
    loading.value = false
    initialLoading.value = false
    schedule({ failed })
  }

  // The options load on mount and again after a 404; only the latest load writes them, so an older list (with the deleted project) that
  // answers late does not come back.
  let optionsSeq = 0

  async function loadProjectOptions (): Promise<void> {
    const current = ++optionsSeq
    const options = await listProjectOptions()
    if (!disposed && current === optionsSeq) {
      projectOptions.value = options
    }
  }

  function onVisibilityChange (): void {
    if (disposed) {
      return
    }
    if (document.hidden) {
      clearTimer()
    } else {
      void load({ poll: true })
    }
  }

  // A filter change always goes back to page 1.
  function changeFilter (): void {
    expandedKey.value = null
    page.value = 1
    void load()
  }

  function changePage (value: number): void {
    expandedKey.value = null
    page.value = value
    void load()
  }

  function changePerPage (value: number | string): void {
    itemsPerPage.value = Number(value)
    expandedKey.value = null
    page.value = 1
    void load()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    void load()
    void loadProjectOptions()
  })

  onScopeDispose(() => {
    disposed = true
    clearTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { tasks, total, lastPage, page, itemsPerPage, status, action, project, projectOptions, statusTab, expandedKey, loading, initialLoading, now, changePage, changePerPage, changeFilter }
}
