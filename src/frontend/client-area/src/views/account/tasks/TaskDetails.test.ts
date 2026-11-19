import type { FreeTask } from './tasks.api'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import TaskDetails from './TaskDetails.vue'

function task (overrides: Partial<FreeTask> = {}): FreeTask {
  return {
    id: 42,
    action: 'backup',
    job_type: null,
    status: 'completed',
    error: null,
    username: null,
    project: null,
    queued_at: '2026-10-24T10:00:00',
    started_at: '2026-10-24T10:00:10',
    finished_at: '2026-10-24T10:02:15',
    ...overrides,
  }
}

function mountDetails (item: FreeTask) {
  setActivePinia(createPinia())
  return mountKit(TaskDetails, { props: { task: item, now: Date.parse('2026-10-24T10:05:00') } })
}

const value = (wrapper: Awaited<ReturnType<typeof mountDetails>>, key: string) => wrapper.get(`[data-testid="tasks-details-${key}"] dd`).text()

describe('TaskDetails', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('lists Queued, Started, Finished and the task id with the full dates', async () => {
    const wrapper = await mountDetails(task())

    expect(wrapper.findAll('dt').map(label => label.text())).toEqual(['Queued', 'Started', 'Finished', 'Task ID'])
    expect(value(wrapper, 'queued')).toBe('2026-10-24 10:00')
    expect(value(wrapper, 'started')).toBe('2026-10-24 10:00')
    expect(value(wrapper, 'finished')).toBe('2026-10-24 10:02')
    expect(value(wrapper, 'id')).toBe('#42')
    wrapper.unmount()
  })

  it('shows Waiting for a task that has not started and a dash for an unfinished one', async () => {
    const wrapper = await mountDetails(task({ status: 'queued', started_at: null, finished_at: null }))

    expect(value(wrapper, 'started')).toBe('Waiting')
    expect(value(wrapper, 'finished')).toBe('—')
    wrapper.unmount()
  })

  it('shows Still running for a running task', async () => {
    const wrapper = await mountDetails(task({ status: 'running', finished_at: null }))

    expect(value(wrapper, 'finished')).toBe('Still running')
    wrapper.unmount()
  })

  it('has no Error field without an error', async () => {
    const wrapper = await mountDetails(task())

    expect(wrapper.find('[data-testid="tasks-details-error"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the whole error with line breaks and copies it', async () => {
    const error = 'Command failed\nexit code 1'
    const wrapper = await mountDetails(task({ status: 'failed', error }))

    const field = wrapper.get('[data-testid="tasks-details-error"]')
    expect(field.get('.task-details__error-text').element.textContent).toBe(error)
    const copy = field.get('[data-testid="tasks-details-copy"]')
    expect(copy.attributes('aria-label')).toBe('tooltip.copy')

    await copy.trigger('click')
    expect(writeText).toHaveBeenCalledWith(error)
    wrapper.unmount()
  })
})
