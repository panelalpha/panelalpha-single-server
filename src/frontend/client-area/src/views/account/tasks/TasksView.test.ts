import type { FreeTask } from './tasks.api'
import type { VSelect } from 'vuetify/components'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { listProjectOptions } from '@/entities/project/project-options.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
import { mountKit } from '@/test/mount-kit'
import * as freeApi from './tasks.api'
import TasksView from './TasksView.vue'

vi.mock('./tasks.api', () => ({
  listFreeTasks: vi.fn(),
}))

vi.mock('@/entities/project/project-options.api', () => ({
  listProjectOptions: vi.fn().mockResolvedValue([]),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function task (overrides: Partial<FreeTask> = {}): FreeTask {
  return {
    id: 1,
    action: 'backup',
    job_type: null,
    status: 'completed',
    error: null,
    username: 'alice',
    project: { id: 7, name: 'Shop', domain: 'shop.test' },
    queued_at: '2026-10-24T10:00:00Z',
    started_at: '2026-10-24T10:00:10Z',
    finished_at: '2026-10-24T10:02:15Z',
    ...overrides,
  }
}

// A status tab change: the page frame emits the index into the tab list (0 All, 1 Active, 2 Failed, 3 Completed, 4 Cancelled).
function pickTab (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], index: number): void {
  wrapper.getComponent(PageFrame).vm.$emit('update:tab', index)
}

const EMPTY = { items: [] as FreeTask[], total: 0, lastPage: 1 }

function setWidth (width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

async function mountView () {
  vi.mocked(listProjectOptions).mockResolvedValue([])
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { single_server: { active: true } }, user: {} } as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('div') } }] })
  await router.push('/')
  const wrapper = await mountKit(TasksView, { global: { plugins: [pinia, router] } })
  return { wrapper, alerts: useAlertsStore() }
}

describe('TasksView (frame and list)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setWidth(1400)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // The compact mobile card: no labels, one element per slot, the failed bar on the `tr`.
  it('renders the compact mobile card of a task, slot by slot', async () => {
    setWidth(500)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T10:05:00') })
    try {
      vi.mocked(freeApi.listFreeTasks).mockResolvedValue({
        items: [task({ queued_at: '2026-10-24T10:00:00', started_at: '2026-10-24T10:00:10', finished_at: '2026-10-24T10:02:15' })],
        total: 1,
        lastPage: 1,
      })
      const { wrapper } = await mountView()
      await flushPromises()

      const card = wrapper.get('[data-testid="tasks-row"]')
      expect(card.find('.mobile-table-item__header').exists()).toBe(false)
      expect(card.find('[data-testid="tasks-cell-open"]').exists()).toBe(false)
      expect(card.find('.tasks-cell-open').exists()).toBe(false)
      expect(card.get('.mobile-table-item__title [data-testid="tasks-cell-task"]').text()).toBe('tasks.actions.backup')
      expect(card.get('.mobile-table-item__status [data-testid="tasks-status"]').text()).toBe('tasks.status.completed')
      const full = card.get('.mobile-table-item__full .tasks-project--inline')
      expect(full.get('a').attributes('href')).toBe('/projects/7/general')
      expect(full.text()).toContain('shop.test')
      expect(card.get('.mobile-table-item__meta').text()).toMatch(/^\d{2}:\d{2} · .*ago$/)
      expect(card.get('.mobile-table-item__meta-end [data-testid="tasks-cell-duration"]').text()).toBe('2m 5s')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows "Waiting" and the added time in the meta line of a queued mobile card', async () => {
    setWidth(500)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T10:05:00') })
    try {
      vi.mocked(freeApi.listFreeTasks).mockResolvedValue({
        items: [task({ status: 'queued', queued_at: '2026-10-24T10:00:00', started_at: null, finished_at: null })],
        total: 1,
        lastPage: 1,
      })
      const { wrapper } = await mountView()
      await flushPromises()

      const card = wrapper.get('[data-testid="tasks-row"]')
      expect(card.get('.mobile-table-item__meta').text()).toBe('tasks.waiting · added 5 minutes ago')
      expect(card.get('.mobile-table-item__meta-end').text()).toBe('—')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('puts the failed bar on the tr of the card and the error line in the title slot, and opens the card on a click and on Enter', async () => {
    setWidth(500)
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({
      items: [task({ id: 1, status: 'failed', error: 'Command failed\nexit code 1' }), task({ id: 2 })],
      total: 2,
      lastPage: 1,
    })
    const { wrapper } = await mountView()
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="tasks-row"]')
    expect(rows[0].element.tagName).toBe('TR')
    expect(rows[0].classes()).toContain('item-bordered--red')
    expect(rows[1].classes()).not.toContain('item-bordered--red')
    expect(rows[0].get('.mobile-table-item__title [data-testid="tasks-error-line"]').text()).toBe('Command failed')
    expect(rows[0].attributes('tabindex')).toBe('0')
    expect(rows[0].attributes('aria-expanded')).toBe('false')

    await rows[0].trigger('click')
    const open = wrapper.findAll('[data-testid="tasks-row"]')[0]
    expect(open.attributes('aria-expanded')).toBe('true')
    expect(open.find('[data-testid="tasks-error-line"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="tasks-details"]')).toHaveLength(1)

    await wrapper.findAll('[data-testid="tasks-row"]')[1].trigger('keydown', { key: 'Enter' })
    expect(wrapper.findAll('[data-testid="tasks-row"]')[1].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-testid="tasks-row"]')[0].attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('[data-testid="tasks-details"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not open a mobile card on a click on the project link', async () => {
    setWidth(500)
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    const card = wrapper.get('[data-testid="tasks-row"]')
    await card.get('a.tasks-project__link').trigger('click')
    expect(card.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="tasks-details"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('loads page 1 with 50 per page on mount and renders the rows', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    expect(freeApi.listFreeTasks).toHaveBeenCalledTimes(1)
    expect(freeApi.listFreeTasks).toHaveBeenCalledWith({ page: 1, perPage: 50 })
    expect(wrapper.get('[data-testid="tasks-title"]').text()).toBe('tasks.title')
    expect(wrapper.findAll('[data-testid="tasks-row"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('tasks.actions.backup')
  })

  it('shows the skeleton during the first load only', async () => {
    const pending = deferred<typeof EMPTY>()
    vi.mocked(freeApi.listFreeTasks).mockReturnValue(pending.promise)
    const { wrapper } = await mountView()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tasks-skeleton"]').exists()).toBe(true)
    // The skeleton has no day groups and no rows.
    expect(wrapper.find('tr.data-table__group').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tasks-row"]').exists()).toBe(false)

    pending.resolve({ items: [task()], total: 1, lastPage: 1 })
    await flushPromises()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
  })

  it('shows the empty state with the tasks.empty keys and no header row', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue(EMPTY)
    const { wrapper } = await mountView()
    await flushPromises()

    const empty = wrapper.get('[data-testid="tasks-empty"]')
    expect(empty.text()).toContain('tasks.empty.title')
    expect(empty.text()).toContain('tasks.empty.description')
    expect(wrapper.find('tr.custom-sort').exists()).toBe(false)
  })

  it('shows the empty state under a Project filter too, with the footer kept', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValueOnce({ items: [task()], total: 1, lastPage: 1 }).mockResolvedValue(EMPTY)
    const { wrapper } = await mountView()
    await flushPromises()

    wrapper.getComponent(`[data-testid="project-filter"]`).vm.$emit('update:modelValue', 7)
    await flushPromises()

    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 1, perPage: 50, project: 7 })
    expect(wrapper.get('[data-testid="tasks-empty"]').text()).toContain('tasks.empty.title')
    expect(wrapper.find('[data-testid="tasks-row"]').exists()).toBe(false)
    expect(wrapper.find('tr.data-table__group').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tasks-footer"]').exists()).toBe(true)
  })

  it('alerts on a failed GET and keeps the previous rows', async () => {
    vi.mocked(freeApi.listFreeTasks)
      .mockResolvedValueOnce({ items: [task()], total: 100, lastPage: 2 })
      .mockRejectedValueOnce(new Error('boom'))
    const { wrapper, alerts } = await mountView()
    await flushPromises()

    wrapper.getComponent({ name: 'DataIteratorFooter' }).vm.$emit('update:page', 2)
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({ success: false })
    expect(wrapper.text()).toContain('tasks.actions.backup')
  })

  it('goes back to page 1 when the page size changes', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 100, lastPage: 2 })
    const { wrapper } = await mountView()
    await flushPromises()

    const footer = wrapper.getComponent({ name: 'DataIteratorFooter' })
    footer.vm.$emit('update:page', 2)
    await flushPromises()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 2, perPage: 50 })

    footer.vm.$emit('update:itemsPerPage', 15)
    await flushPromises()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 1, perPage: 15 })
  })

  it('renders the columns in order with the status to the right', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    const headerCells = wrapper.findAll('tr.custom-sort td')
    expect(headerCells.map(cell => cell.text())).toEqual([
      'tasks.columns.task',
      'tasks.columns.project',
      'tasks.columns.started',
      'tasks.columns.duration',
      'tasks.columns.status',
      '',
    ])
    expect(headerCells[4].classes()).toContain('text-right')

    const cells = wrapper.get('[data-testid="tasks-row"]').findAll('td')
    expect(cells).toHaveLength(6)
    expect(cells[1].text()).toContain('Shop')
    expect(cells[3].text()).toBe('2m 5s')
    expect(cells[4].text()).toBe('tasks.status.completed')
    expect(cells[5].find('[aria-hidden="true"]').exists()).toBe(true)
    // The status cell keeps its right alignment from the DataTable column (`align: 'end'`).
    expect(cells[4].classes()).toContain('v-data-table-column--align-end')
  })

  it('links the project only when the task has one', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({
      items: [task(), task({ id: 2, project: null, username: 'ghost' })],
      total: 2,
      lastPage: 1,
    })
    const { wrapper } = await mountView()
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="tasks-row"]')
    expect(rows[0].get('a.tasks-project__link').attributes('href')).toBe('/projects/7/general')
    expect(rows[1].find('a.tasks-project__link').exists()).toBe(false)
    // Decision 2026-11-09: an unlinked task shows a dash, not the username (it read as a project name).
    expect(rows[1].findAll('td')[1].text()).toBe('—')
  })

  it('renders the status chip inside the actions row', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task({ status: 'running' })], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    const row = wrapper.get('[data-testid="tasks-row"]').findAll('td')[4].get('.actions-row')
    expect(row.classes()).toContain('justify-end')
    expect(row.get('.v-chip').classes()).toContain('task-status-label--blue')
  })

  it('shows a queued task as waiting with a dash for the duration', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T10:05:00Z') })
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({
      items: [task({ status: 'queued', started_at: null, finished_at: null })],
      total: 1,
      lastPage: 1,
    })
    const { wrapper } = await mountView()
    await flushPromises()

    const cells = wrapper.get('[data-testid="tasks-row"]').findAll('td')
    expect(cells[2].text()).toBe('tasks.waitingadded 5 minutes ago')
    expect(cells[3].text()).toBe('—')
    vi.useRealTimers()
  })

  it('shows a finished task with a relative start and its duration', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    const cells = wrapper.get('[data-testid="tasks-row"]').findAll('td')
    // The start time and, under it, how long ago.
    expect(cells[2].text()).toMatch(/^\d{2}:\d{2}.*ago$/)
    expect(cells[3].text()).toBe('2m 5s')
  })
})

describe('TasksView (groups and details)', () => {
  const NOW = new Date('2026-10-24T12:00:00Z')
  const FAILED_ERROR = 'Command failed\nexit code 1\nat step 3'

  // Server order: two tasks of today, one of yesterday, one older; the failed one is the first.
  const items = () => [
    task({ id: 1, status: 'failed', error: FAILED_ERROR, finished_at: '2026-10-24T10:00:40Z' }),
    task({ id: 2, status: 'running', finished_at: null, started_at: '2026-10-24T11:00:00Z', queued_at: '2026-10-24T10:59:00Z' }),
    task({ id: 3, started_at: '2026-10-23T09:00:00Z', queued_at: '2026-10-23T08:59:00Z', finished_at: '2026-10-23T09:01:00Z' }),
    task({ id: 4, project: null, started_at: '2026-10-20T09:00:00Z', queued_at: '2026-10-20T08:59:00Z', finished_at: '2026-10-20T09:01:00Z' }),
  ]

  async function mountList (rows = items()) {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: rows, total: rows.length, lastPage: 1 })
    const result = await mountView()
    await flushPromises()
    return result.wrapper
  }

  const rowsOf = (wrapper: Awaited<ReturnType<typeof mountList>>) => wrapper.findAll('[data-testid="tasks-row"]')

  beforeEach(() => {
    vi.resetAllMocks()
    setWidth(1400)
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('puts a group header before the first task of each day, in the order of the server', async () => {
    const wrapper = await mountList()

    expect(wrapper.findAll('tr.data-table__group').map(group => group.text())).toEqual(['Today', 'Yesterday', '20 Oct 2026'])
    // Header, row, row, header, row, header, row: no header between two tasks of one day.
    const sequence = wrapper.findAll('tbody tr').map(row => (row.classes().includes('data-table__group') ? 'group' : 'row'))
    expect(sequence).toEqual(['group', 'row', 'row', 'group', 'row', 'group', 'row'])
    wrapper.unmount()
  })

  it('marks only the failed row with the red bar and shows its error line', async () => {
    const wrapper = await mountList()

    const rows = rowsOf(wrapper)
    expect(rows[0].classes()).toContain('item-bordered--red')
    expect(rows[1].classes()).not.toContain('item-bordered--red')
    expect(rows[0].get('[data-testid="tasks-error-line"]').text()).toBe('Command failed')
    expect(rows[1].find('[data-testid="tasks-error-line"]').exists()).toBe(false)
    expect(rows[2].find('[data-testid="tasks-error-line"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('has no error line for a cancelled task that carries an error', async () => {
    const wrapper = await mountList([task({ id: 9, status: 'cancelled', error: 'Stopped by user' })])

    expect(wrapper.find('[data-testid="tasks-error-line"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens a row on a click, keeps one open at a time and closes it on a second click', async () => {
    const wrapper = await mountList()

    expect(wrapper.find('[data-testid="tasks-details"]').exists()).toBe(false)
    expect(rowsOf(wrapper)[1].attributes('aria-expanded')).toBe('false')
    expect(rowsOf(wrapper)[1].attributes('tabindex')).toBe('0')

    await rowsOf(wrapper)[1].trigger('click')
    expect(rowsOf(wrapper)[1].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-testid="tasks-details"]')).toHaveLength(1)

    await rowsOf(wrapper)[2].trigger('click')
    expect(rowsOf(wrapper)[1].attributes('aria-expanded')).toBe('false')
    expect(rowsOf(wrapper)[2].attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-testid="tasks-details"]')).toHaveLength(1)

    await rowsOf(wrapper)[2].trigger('click')
    expect(wrapper.find('[data-testid="tasks-details"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens a row on Enter and on Space', async () => {
    const wrapper = await mountList()

    await rowsOf(wrapper)[0].trigger('keydown', { key: 'Enter' })
    expect(rowsOf(wrapper)[0].attributes('aria-expanded')).toBe('true')
    await rowsOf(wrapper)[0].trigger('keydown', { key: ' ' })
    expect(rowsOf(wrapper)[0].attributes('aria-expanded')).toBe('false')
    await rowsOf(wrapper)[0].trigger('keydown', { key: ' ' })
    expect(wrapper.find('[data-testid="tasks-details"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not open a row on a click on the project link', async () => {
    const wrapper = await mountList()

    await rowsOf(wrapper)[0].get('a.tasks-project__link').trigger('click')
    expect(rowsOf(wrapper)[0].attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="tasks-details"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the error line and turns the chevron while the row is open, and shows the details', async () => {
    const wrapper = await mountList()

    await rowsOf(wrapper)[0].trigger('click')

    const row = rowsOf(wrapper)[0]
    expect(row.find('[data-testid="tasks-error-line"]').exists()).toBe(false)
    expect(row.get('.tasks-cell-open__icon').classes()).toContain('tasks-cell-open__icon--open')
    const details = wrapper.get('[data-testid="tasks-details"]')
    expect(details.get('[data-testid="tasks-details-id"]').text()).toContain('#1')
    expect(details.get('[data-testid="tasks-details-error"]').text()).toContain('exit code 1')
    wrapper.unmount()
  })

  it('shows Waiting and Still running in the details of a queued and a running task', async () => {
    const wrapper = await mountList([
      task({ id: 5, status: 'queued', started_at: null, finished_at: null }),
      task({ id: 6, status: 'running', finished_at: null }),
    ])

    await rowsOf(wrapper)[0].trigger('click')
    expect(wrapper.get('[data-testid="tasks-details-started"]').text()).toContain('Waiting')
    await rowsOf(wrapper)[1].trigger('click')
    expect(wrapper.get('[data-testid="tasks-details-finished"]').text()).toContain('Still running')
    wrapper.unmount()
  })

  it('keeps the open row through a poll that returns it and closes it when the filter changes', async () => {
    vi.useRealTimers()
    const wrapper = await mountList([task({ id: 1 }), task({ id: 2 })])

    await rowsOf(wrapper)[1].trigger('click')
    expect(rowsOf(wrapper)[1].attributes('aria-expanded')).toBe('true')

    pickTab(wrapper, 2)
    await flushPromises()
    expect(wrapper.find('[data-testid="tasks-details"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('TasksView (a11y and a deleted project)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setWidth(1400)
  })

  it('names the status tab strip from tasks.filters.status', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue(EMPTY)
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="tasks-tabs"]').attributes('aria-label')).toBe('tasks.filters.status')
  })

  it('has aria-expanded on every row and aria-controls to the details row only on the open one', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task({ id: 1 }), task({ id: 2 })], total: 2, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    let rows = wrapper.findAll('[data-testid="tasks-row"]')
    expect(rows.map(row => row.attributes('aria-expanded'))).toEqual(['false', 'false'])
    expect(rows.map(row => row.attributes('aria-controls'))).toEqual([undefined, undefined])
    // The accessible name of a row is the task name of its first cell.
    expect(rows[0].findAll('td')[0].text()).toContain('tasks.actions.backup')

    await rows[1].trigger('click')
    rows = wrapper.findAll('[data-testid="tasks-row"]')
    expect(rows.map(row => row.attributes('aria-expanded'))).toEqual(['false', 'true'])
    expect(rows[0].attributes('aria-controls')).toBeUndefined()
    const controls = rows[1].attributes('aria-controls')
    expect(controls).toMatch(/^data-table-.+-expanded-2$/)
    expect(wrapper.get(`#${controls}`).find('[data-testid="tasks-details"]').exists()).toBe(true)
  })

  it('labels both selects and hides the chevron from assistive technology', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="project-filter"] label').text()).toBe('Project')
    expect(wrapper.get('[data-testid="action-filter"] label').text()).toBe('tasks.filters.action')
    expect(wrapper.get('[data-testid="tasks-row"] td:last-child [aria-hidden="true"]').exists()).toBe(true)
  })

  it('drops a deleted project from the filter: back to All, one GET without project, rows of the new list', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValueOnce({ items: [task({ id: 1 })], total: 1, lastPage: 1 })
    const { wrapper, alerts } = await mountView()
    await flushPromises()

    vi.mocked(freeApi.listFreeTasks)
      .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { isAxiosError: true, response: { status: 404, data: {} } }))
      .mockResolvedValueOnce({ items: [task({ id: 5, action: 'deploy' })], total: 1, lastPage: 1 })
    wrapper.getComponent(`[data-testid="project-filter"]`).vm.$emit('update:modelValue', 7)
    await flushPromises()

    expect(vi.mocked(freeApi.listFreeTasks).mock.calls.map(call => call[0].project)).toEqual([undefined, 7, undefined])
    expect(vi.mocked(listProjectOptions)).toHaveBeenCalledTimes(2)
    expect(alerts.activeAlerts).toHaveLength(0)
    expect(wrapper.getComponent(`[data-testid="project-filter"]`).props('modelValue')).toBe('')
    expect(wrapper.text()).toContain('tasks.actions.deploy')
    expect(wrapper.text()).not.toContain('tasks.actions.backup')
  })
})

describe('TasksView (filters)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setWidth(1400)
  })

  function select (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], testid: string) {
    return wrapper.getComponent(`[data-testid="${testid}"]`) as unknown as ReturnType<typeof wrapper.getComponent<typeof VSelect>>
  }

  it('renders the Project and Task type selects with their labels and the All choice selected', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue(EMPTY)
    const { wrapper } = await mountView()
    await flushPromises()

    const project = select(wrapper, 'project-filter')
    const action = select(wrapper, 'action-filter')
    expect(project.props('label')).toBe('Project')
    expect(action.props('label')).toBe('tasks.filters.action')
    expect(project.props('modelValue')).toBe('')
    expect(action.props('modelValue')).toBe('')
    // V4 shows the item whose value is '' as the selection.
    expect(project.text()).toContain('tasks.filters.all')
    expect(action.text()).toContain('tasks.filters.all')
    expect(wrapper.find('[data-testid="status-filter"]').exists()).toBe(false)
  })

  it('renders the status tabs in order with All selected', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue(EMPTY)
    const { wrapper } = await mountView()
    await flushPromises()

    const tabs = wrapper.get('[data-testid="tasks-tabs"]').findAll('[role="tab"]')
    expect(tabs.map(tab => tab.text())).toEqual(['tasks.filters.all', 'tasks.filters.active', 'tasks.status.failed', 'tasks.status.completed', 'tasks.status.cancelled'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')
  })

  it('sends page=1 and the status when the tab changes on a later page', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 100, lastPage: 3 })
    const { wrapper } = await mountView()
    await flushPromises()

    wrapper.getComponent({ name: 'DataIteratorFooter' }).vm.$emit('update:page', 3)
    await flushPromises()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 3, perPage: 50 })

    pickTab(wrapper, 2)
    await flushPromises()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 1, perPage: 50, status: 'failed' })
    expect(wrapper.get('[data-testid="tasks-tabs"]').findAll('[role="tab"]')[2].attributes('aria-selected')).toBe('true')
  })

  it('sends the project filter by its id, and the action and tab combined with it', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    select(wrapper, 'project-filter').vm.$emit('update:modelValue', 7)
    await flushPromises()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 1, perPage: 50, project: 7 })

    select(wrapper, 'action-filter').vm.$emit('update:modelValue', 'backup')
    await flushPromises()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 1, perPage: 50, action: 'backup', project: 7 })

    pickTab(wrapper, 1)
    await flushPromises()
    expect(freeApi.listFreeTasks).toHaveBeenLastCalledWith({ page: 1, perPage: 50, status: 'active', action: 'backup', project: 7 })
  })

  it('drops the parameter when the All choice or the All tab is picked again', async () => {
    vi.mocked(freeApi.listFreeTasks).mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    pickTab(wrapper, 2)
    await flushPromises()
    pickTab(wrapper, 0)
    await flushPromises()
    select(wrapper, 'project-filter').vm.$emit('update:modelValue', 7)
    await flushPromises()
    select(wrapper, 'project-filter').vm.$emit('update:modelValue', '')
    await flushPromises()

    const lastCall = vi.mocked(freeApi.listFreeTasks).mock.calls.at(-1)![0]
    expect(lastCall.status).toBeUndefined()
    expect(lastCall.project).toBeUndefined()
    expect(select(wrapper, 'project-filter').text()).toContain('tasks.filters.all')
  })
})

describe('TasksView (polling)', () => {
  const running = () => task({ status: 'running', finished_at: null })

  function setHidden (hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  }

  function list () {
    return vi.mocked(freeApi.listFreeTasks)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    setWidth(1400)
    setHidden(false)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'hidden')
  })

  it('polls again after 5 s while a task is active', async () => {
    list().mockResolvedValue({ items: [running()], total: 1, lastPage: 1 })
    await mountView()
    await flushPromises()
    expect(list()).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(4999)
    expect(list()).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(list()).toHaveBeenCalledTimes(2)
  })

  it('polls again after 30 s when nothing is active', async () => {
    list().mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    await mountView()
    await flushPromises()

    vi.advanceTimersByTime(29_999)
    expect(list()).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(list()).toHaveBeenCalledTimes(2)
  })

  it('does not fetch after unmount', async () => {
    list().mockResolvedValue({ items: [task({ status: 'queued', started_at: null, finished_at: null })], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()
    wrapper.unmount()

    vi.advanceTimersByTime(60_000)
    expect(list()).toHaveBeenCalledTimes(1)
  })

  it('schedules nothing when unmounted while a request is in flight', async () => {
    const pending = deferred<{ items: FreeTask[], total: number, lastPage: number }>()
    list().mockReturnValue(pending.promise)
    const { wrapper } = await mountView()
    wrapper.unmount()
    pending.resolve({ items: [running()], total: 1, lastPage: 1 })
    await flushPromises()

    vi.advanceTimersByTime(60_000)
    expect(list()).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops a stale poll response that resolves after a filter change', async () => {
    list().mockResolvedValueOnce({ items: [task({ id: 1 })], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()

    const stale = deferred<{ items: FreeTask[], total: number, lastPage: number }>()
    list().mockReturnValueOnce(stale.promise)
    vi.advanceTimersByTime(30_000)
    expect(list()).toHaveBeenCalledTimes(2)

    list().mockResolvedValueOnce({ items: [task({ id: 2, status: 'failed' })], total: 1, lastPage: 1 })
    pickTab(wrapper, 2)
    await flushPromises()
    expect(list()).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).toContain('tasks.status.failed')

    stale.resolve({ items: [task({ id: 99, action: 'deploy' })], total: 1, lastPage: 1 })
    await flushPromises()
    expect(wrapper.text()).not.toContain('tasks.actions.deploy')
    // Only the latest request scheduled a poll.
    vi.advanceTimersByTime(30_000)
    expect(list()).toHaveBeenCalledTimes(4)
  })

  it('never stacks timers across refetches', async () => {
    list().mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()
    pickTab(wrapper, 2)
    await flushPromises()
    pickTab(wrapper, 3)
    await flushPromises()
    expect(list()).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(30_000)
    expect(list()).toHaveBeenCalledTimes(4)
  })

  it('pauses while the tab is hidden and fetches at once when it is visible again', async () => {
    list().mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    await mountView()
    await flushPromises()

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60_000)
    expect(list()).toHaveBeenCalledTimes(1)

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(list()).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(30_000)
    expect(list()).toHaveBeenCalledTimes(3)
  })

  it('schedules nothing when a response lands while the tab is hidden', async () => {
    const pending = deferred<{ items: FreeTask[], total: number, lastPage: number }>()
    list().mockReturnValue(pending.promise)
    await mountView()

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    pending.resolve({ items: [running()], total: 1, lastPage: 1 })
    await flushPromises()

    vi.advanceTimersByTime(60_000)
    expect(list()).toHaveBeenCalledTimes(1)
  })

  it('stops listening to visibility changes after unmount', async () => {
    list().mockResolvedValue({ items: [task()], total: 1, lastPage: 1 })
    const { wrapper } = await mountView()
    await flushPromises()
    wrapper.unmount()

    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(list()).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed background poll quiet and retries after 30 s', async () => {
    list().mockResolvedValueOnce({ items: [running()], total: 1, lastPage: 1 })
    const { wrapper, alerts } = await mountView()
    await flushPromises()

    list().mockRejectedValueOnce(new Error('boom'))
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(list()).toHaveBeenCalledTimes(2)
    expect(alerts.activeAlerts).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="tasks-row"]')).toHaveLength(1)

    list().mockResolvedValue({ items: [running()], total: 1, lastPage: 1 })
    vi.advanceTimersByTime(29_999)
    expect(list()).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(list()).toHaveBeenCalledTimes(3)
  })

  it('alerts on a failed user-triggered GET and retries at the slow pace', async () => {
    list().mockResolvedValueOnce({ items: [running()], total: 1, lastPage: 1 })
    const { alerts, wrapper } = await mountView()
    await flushPromises()

    list().mockRejectedValueOnce(new Error('boom'))
    pickTab(wrapper, 2)
    await flushPromises()
    expect(alerts.activeAlerts).toHaveLength(1)

    list().mockResolvedValue({ items: [running()], total: 1, lastPage: 1 })
    vi.advanceTimersByTime(29_999)
    expect(list()).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(list()).toHaveBeenCalledTimes(3)
  })
})
