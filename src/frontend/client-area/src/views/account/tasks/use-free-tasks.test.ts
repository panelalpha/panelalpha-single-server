import type { FreeTask } from './tasks.api'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import * as projectOptions from '@/entities/project/project-options.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as freeApi from './tasks.api'
import { useFreeTasks } from './use-free-tasks'

vi.mock('./tasks.api', () => ({
  listFreeTasks: vi.fn(),
}))
vi.mock('@/entities/project/project-options.api', () => ({
  listProjectOptions: vi.fn(),
}))

function task (overrides: Partial<FreeTask> = {}): FreeTask {
  return {
    id: 1,
    action: 'backup',
    job_type: null,
    status: 'completed',
    error: null,
    username: null,
    project: null,
    queued_at: '2026-10-24T10:00:00Z',
    started_at: '2026-10-24T10:00:10Z',
    finished_at: '2026-10-24T10:02:15Z',
    ...overrides,
  }
}

function setup () {
  let state!: ReturnType<typeof useFreeTasks>
  const wrapper = mount(defineComponent({
    setup () {
      state = useFreeTasks()
      return () => h('div')
    },
  }))
  return { wrapper, state }
}

describe('useFreeTasks (project filter, status tab, expanded row)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 100, lastPage: 2 })
    vi.mocked(projectOptions.listProjectOptions).mockResolvedValue([{ id: 7, name: 'Shop' }])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('loads the project options once on mount', async () => {
    const { state } = setup()
    await flushPromises()

    expect(projectOptions.listProjectOptions).toHaveBeenCalledTimes(1)
    expect(state.projectOptions.value).toEqual([{ id: 7, name: 'Shop' }])
  })

  it('sends the project and resets the page and the expanded row on a filter change', async () => {
    const { state } = setup()
    await flushPromises()
    state.changePage(2)
    await flushPromises()
    state.expandedKey.value = 1

    state.project.value = 7
    state.changeFilter()
    await flushPromises()

    expect(state.page.value).toBe(1)
    expect(state.expandedKey.value).toBeNull()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 1, perPage: 50, status: undefined, action: undefined, project: 7 })
  })

  it('maps the status tab to the status value, with the "All" tab sending none', async () => {
    const { state } = setup()
    await flushPromises()

    state.statusTab.value = 2
    state.changeFilter()
    await flushPromises()
    expect(state.status.value).toBe('failed')
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }))

    state.statusTab.value = 0
    state.changeFilter()
    await flushPromises()
    expect(state.status.value).toBe('')
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined }))
  })

  it('reads a status outside the tabs as the "All" tab', () => {
    const { state } = setup()
    state.status.value = 'queued'

    expect(state.statusTab.value).toBe(0)
  })

  it('collapses the expanded row on a page and page size change', async () => {
    const { state } = setup()
    await flushPromises()

    state.expandedKey.value = 1
    state.changePage(2)
    expect(state.expandedKey.value).toBeNull()
    await flushPromises()

    state.expandedKey.value = 1
    state.changePerPage(15)
    expect(state.expandedKey.value).toBeNull()
    expect(state.page.value).toBe(1)
  })

  it('keeps the expanded row during a poll', async () => {
    vi.useFakeTimers()
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task({ status: 'running' })], total: 1, lastPage: 1 })
    const { state } = setup()
    await vi.advanceTimersByTimeAsync(0)
    state.expandedKey.value = 1

    await vi.advanceTimersByTimeAsync(5000)

    expect(vi.mocked(freeApi.listFreeTasks).mock.calls.length).toBeGreaterThan(1)
    expect(state.expandedKey.value).toBe(1)
  })

  describe('a project that no longer exists (404)', () => {
    const notFound = () => Object.assign(new Error('Not Found'), { isAxiosError: true, response: { status: 404, data: { message: 'No query results' } } })

    it('goes back to "All", reloads the options and sends one GET without project, with no alert', async () => {
      const { state } = setup()
      await flushPromises()
      state.project.value = 7
      state.page.value = 3
      state.expandedKey.value = 1
      vi.mocked(freeApi.listFreeTasks).mockRejectedValueOnce(notFound())
      vi.mocked(projectOptions.listProjectOptions).mockResolvedValue([{ id: 8, name: 'Blog' }])
      vi.mocked(freeApi.listFreeTasks).mockClear()
      vi.mocked(projectOptions.listProjectOptions).mockClear()

      state.changeFilter()
      await flushPromises()

      expect(vi.mocked(freeApi.listFreeTasks).mock.calls).toEqual([
        [{ page: 1, perPage: 50, status: undefined, action: undefined, project: 7 }],
        [{ page: 1, perPage: 50, status: undefined, action: undefined, project: undefined }],
      ])
      expect(state.project.value).toBeNull()
      expect(state.expandedKey.value).toBeNull()
      expect(projectOptions.listProjectOptions).toHaveBeenCalledTimes(1)
      expect(state.projectOptions.value).toEqual([{ id: 8, name: 'Blog' }])
      expect(state.tasks.value).toHaveLength(1)
      expect(state.loading.value).toBe(false)
      expect(useAlertsStore().activeAlerts).toHaveLength(0)
    })

    it('keeps the options of the latest load when the mount load answers after the one of the 404', async () => {
      let answerMountLoad!: (value: projectOptions.ProjectOption[]) => void
      vi.mocked(projectOptions.listProjectOptions).mockReturnValueOnce(new Promise(resolve => {
        answerMountLoad = resolve
      }))
      const { state } = setup()
      await flushPromises()
      state.project.value = 7
      vi.mocked(freeApi.listFreeTasks).mockRejectedValueOnce(notFound())
      vi.mocked(projectOptions.listProjectOptions).mockResolvedValueOnce([{ id: 8, name: 'Blog' }])

      state.changeFilter()
      await flushPromises()
      answerMountLoad([{ id: 7, name: 'Shop' }, { id: 8, name: 'Blog' }])
      await flushPromises()

      expect(state.projectOptions.value).toEqual([{ id: 8, name: 'Blog' }])
    })

    it('does the same when a background poll hits the 404', async () => {
      vi.useFakeTimers()
      vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task({ status: 'running' })], total: 1, lastPage: 1 })
      const { state } = setup()
      await vi.advanceTimersByTimeAsync(0)
      state.project.value = 7
      vi.mocked(freeApi.listFreeTasks).mockClear()
      vi.mocked(freeApi.listFreeTasks).mockRejectedValueOnce(notFound())

      await vi.advanceTimersByTimeAsync(5000)

      expect(state.project.value).toBeNull()
      expect(vi.mocked(freeApi.listFreeTasks).mock.calls.map(call => call[0].project)).toEqual([7, undefined])
      expect(useAlertsStore().activeAlerts).toHaveLength(0)
    })

    it('keeps the alert and the rows for a 404 without a project filter and for other errors', async () => {
      const { state } = setup()
      await flushPromises()
      vi.mocked(freeApi.listFreeTasks).mockClear()
      vi.mocked(freeApi.listFreeTasks).mockRejectedValueOnce(notFound())

      state.changeFilter()
      await flushPromises()

      expect(freeApi.listFreeTasks).toHaveBeenCalledTimes(1)
      expect(useAlertsStore().activeAlerts).toHaveLength(1)
      expect(state.tasks.value).toHaveLength(1)

      state.project.value = 7
      vi.mocked(freeApi.listFreeTasks).mockRejectedValueOnce(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 500, data: {} } }))
      state.changeFilter()
      await flushPromises()
      expect(state.project.value).toBe(7)
    })
  })
})
