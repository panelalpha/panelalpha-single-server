import type { FreeTask } from './tasks.api'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FAST_POLL_MS, formatTaskDuration, nextPollDelay, SLOW_POLL_MS, TASK_ACTIONS, TASK_STATUS_TABS, TASK_TABLE_COLUMNS, taskActionFilterItems, taskDayLabel, taskDetails, taskDuration, taskErrorLine, taskLabelKey, taskStartedAt, taskStatusTabItems } from './tasks-table'

// Every action needs its English name in the bundle the panel serves (`tasks.actions.<action>`), or the list shows a raw key.
const here = dirname(fileURLToPath(import.meta.url))
const liteBundle = JSON.parse(readFileSync(join(here, '../../../../parity/fixtures/lite/translation.en.json'), 'utf8')) as { tasks: { actions: Record<string, string> } }

function task (overrides: Partial<FreeTask> = {}): FreeTask {
  return {
    id: 1,
    action: null,
    job_type: null,
    status: 'completed',
    error: null,
    username: null,
    project: null,
    queued_at: '2026-10-24T10:00:00Z',
    started_at: '2026-10-24T10:00:10Z',
    finished_at: '2026-10-24T10:00:40Z',
    ...overrides,
  }
}

describe('tasks-table constants', () => {
  it('keeps the 16 legacy actions, adds copy, then the Engine housekeeping actions', () => {
    expect(TASK_ACTIONS).toHaveLength(21)
    expect(TASK_ACTIONS[0]).toBe('deploy')
    expect(TASK_ACTIONS[15]).toBe('mysql_database_rename')
    expect(TASK_ACTIONS[16]).toBe('copy')
    expect(TASK_ACTIONS.slice(17)).toEqual(['operator_image_publish', 'operator_image_refresh', 'operator_image_remove', 'build_cache_build'])
  })

  it('has an English name in the legacy bundle for every legacy action', () => {
    // The four Engine housekeeping actions postdate app-lite; their names are pinned against the served bundle.
    const legacy = TASK_ACTIONS.slice(0, 17)
    const missing = legacy.filter(action => !liteBundle.tasks.actions[action])
    expect(missing).toEqual([])
  })
})

describe('taskLabelKey', () => {
  it('uses the action label for a known action', () => {
    expect(taskLabelKey(task({ action: 'backup', job_type: String.raw`App\Jobs\Whatever` }))).toEqual({ key: 'tasks.actions.backup' })
  })

  it('names a copy task after the copy action, not the job class', () => {
    expect(taskLabelKey(task({ action: 'copy', job_type: String.raw`App\Jobs\CopyProject` }))).toEqual({ key: 'tasks.actions.copy' })
  })

  it('names an Engine housekeeping row after its action, not the job class', () => {
    expect(taskLabelKey(task({ action: 'build_cache_build', job_type: String.raw`App\Jobs\BuildRepositoryCache` }))).toEqual({ key: 'tasks.actions.build_cache_build' })
    expect(taskLabelKey(task({ action: 'operator_image_publish', job_type: String.raw`App\Jobs\ApplyOperatorImage` }))).toEqual({ key: 'tasks.actions.operator_image_publish' })
    expect(taskLabelKey(task({ action: 'operator_image_refresh', job_type: String.raw`App\Jobs\ApplyOperatorImage` }))).toEqual({ key: 'tasks.actions.operator_image_refresh' })
    expect(taskLabelKey(task({ action: 'operator_image_remove', job_type: String.raw`App\Jobs\ApplyOperatorImage` }))).toEqual({ key: 'tasks.actions.operator_image_remove' })
  })

  it('uses the job type label for a known job type segment', () => {
    expect(taskLabelKey(task({ action: 'unknown', job_type: String.raw`App\Jobs\RunHookDelivery` }))).toEqual({ key: 'tasks.jobTypes.RunHookDelivery' })
  })

  it('shows the raw segment of an unknown job type', () => {
    expect(taskLabelKey(task({ job_type: String.raw`App\Jobs\SomethingElse` }))).toEqual({ text: 'SomethingElse' })
  })

  it('falls back to the raw action, then to a dash', () => {
    expect(taskLabelKey(task({ action: 'custom', job_type: null }))).toEqual({ text: 'custom' })
    expect(taskLabelKey(task({ action: null, job_type: null }))).toEqual({ text: '—' })
  })
})

describe('taskStartedAt', () => {
  it('prefers started_at over queued_at', () => {
    expect(taskStartedAt(task())).toBe('2026-10-24T10:00:10Z')
    expect(taskStartedAt(task({ started_at: null }))).toBe('2026-10-24T10:00:00Z')
  })
})

describe('formatTaskDuration', () => {
  it('formats seconds, minutes, hours and days', () => {
    expect(formatTaskDuration(5000)).toBe('5s')
    expect(formatTaskDuration(125_000)).toBe('2m 5s')
    expect(formatTaskDuration((3600 + 5 * 60) * 1000)).toBe('1h 5m')
    expect(formatTaskDuration((2 * 86_400 + 3 * 3600) * 1000)).toBe('2d 3h')
  })

  it('clamps a negative value to 0s', () => {
    expect(formatTaskDuration(-9000)).toBe('0s')
  })
})

describe('taskDuration', () => {
  const now = Date.parse('2026-10-24T10:05:10Z')

  it('is a dash for a queued task', () => {
    expect(taskDuration(task({ status: 'queued', started_at: null, finished_at: null }), now)).toBe('—')
  })

  it('is a dash for a queued task even with start and finish dates', () => {
    expect(taskDuration(task({ status: 'queued' }), now)).toBe('—')
  })

  it('measures a finished task from start to finish', () => {
    expect(taskDuration(task(), now)).toBe('30s')
  })

  it('counts a running task without an end up to now', () => {
    expect(taskDuration(task({ status: 'running', finished_at: null }), now)).toBe('5m 0s')
  })

  it('is a dash for a completed task without finished_at', () => {
    expect(taskDuration(task({ finished_at: null }), now)).toBe('—')
  })

  it('is a dash for an invalid start date', () => {
    expect(taskDuration(task({ started_at: 'nope' }), now)).toBe('—')
  })
})

describe('filter items', () => {
  const t = (key: string) => key

  it('lists the 16 legacy actions, copy, then the Engine housekeeping actions, after "All" in legacy order', () => {
    const items = taskActionFilterItems(t)
    expect(items).toHaveLength(22)
    expect(items[0]).toEqual({ title: 'tasks.filters.all', value: '' })
    expect(items.slice(1).map(item => item.value)).toEqual([...TASK_ACTIONS])
    expect(items[1]).toEqual({ title: 'tasks.actions.deploy', value: 'deploy' })
    expect(items[17]).toEqual({ title: 'tasks.actions.copy', value: 'copy' })
    expect(items.slice(18)).toEqual([
      { title: 'tasks.actions.operator_image_publish', value: 'operator_image_publish' },
      { title: 'tasks.actions.operator_image_refresh', value: 'operator_image_refresh' },
      { title: 'tasks.actions.operator_image_remove', value: 'operator_image_remove' },
      { title: 'tasks.actions.build_cache_build', value: 'build_cache_build' },
    ])
  })
})

describe('nextPollDelay', () => {
  it('is fast while a task is queued or running, slow otherwise or after a failure', () => {
    expect(nextPollDelay([task({ status: 'running' })], false)).toBe(FAST_POLL_MS)
    expect(nextPollDelay([task(), task({ status: 'queued' })], false)).toBe(FAST_POLL_MS)
    expect(nextPollDelay([task()], false)).toBe(SLOW_POLL_MS)
    expect(nextPollDelay([], false)).toBe(SLOW_POLL_MS)
    expect(nextPollDelay([task({ status: 'running' })], true)).toBe(SLOW_POLL_MS)
  })
})

describe('status tabs and columns', () => {
  it('lists the five tabs in order with the status as the value', () => {
    expect([...TASK_STATUS_TABS]).toEqual(['', 'active', 'failed', 'completed', 'cancelled'])
    expect(taskStatusTabItems(key => key)).toEqual([
      { title: 'tasks.filters.all', value: '' },
      { title: 'tasks.filters.active', value: 'active' },
      { title: 'tasks.status.failed', value: 'failed' },
      { title: 'tasks.status.completed', value: 'completed' },
      { title: 'tasks.status.cancelled', value: 'cancelled' },
    ])
  })

  it('has the mock widths, the status to the right and a 56 px chevron column', () => {
    expect(TASK_TABLE_COLUMNS.map(column => [column.value, column.width])).toEqual([
      ['task', '34%'], ['project', '22%'], ['started', '16%'], ['duration', '11%'], ['status', '13%'], ['open', '56px'],
    ])
    expect(TASK_TABLE_COLUMNS[4]!.align).toBe('end')
    expect(TASK_TABLE_COLUMNS[5]!.text).toBeNull()
  })
})

describe('taskDayLabel', () => {
  // The logic uses local calendar fields; the cases are built from local dates, so they hold in any zone (run with TZ=UTC anyway).
  const now = new Date(2026, 9, 24, 12, 0, 0).getTime()
  const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(y, m, d, h, min, s).toISOString()

  it('is today from midnight to the last second of the day', () => {
    expect(taskDayLabel(task({ queued_at: at(2026, 9, 24, 0, 0, 0), started_at: at(2026, 9, 24, 0, 0, 0) }), now)).toEqual({ kind: 'today' })
    expect(taskDayLabel(task({ queued_at: at(2026, 9, 24, 23, 59, 59), started_at: at(2026, 9, 24, 23, 59, 59) }), now)).toEqual({ kind: 'today' })
  })

  it('is yesterday from the start of the previous day to just before midnight', () => {
    expect(taskDayLabel(task({ queued_at: at(2026, 9, 23, 23, 59, 59), started_at: at(2026, 9, 23, 23, 59, 59) }), now)).toEqual({ kind: 'yesterday' })
    expect(taskDayLabel(task({ queued_at: at(2026, 9, 23, 0, 0, 0), started_at: at(2026, 9, 23, 0, 0, 0) }), now)).toEqual({ kind: 'yesterday' })
  })

  it('uses D Mon YYYY from the day before yesterday on', () => {
    expect(taskDayLabel(task({ queued_at: at(2026, 9, 22, 23, 59, 59), started_at: at(2026, 9, 22, 23, 59, 59) }), now)).toEqual({ kind: 'date', label: '22 Oct 2026' })
    expect(taskDayLabel(task({ queued_at: at(2025, 0, 5, 10), started_at: at(2025, 0, 5, 10) }), now)).toEqual({ kind: 'date', label: '5 Jan 2025' })
  })

  it('takes the day the task was queued (the server order), started_at only without it', () => {
    expect(taskDayLabel(task({ started_at: null, queued_at: at(2026, 9, 23, 8) }), now)).toEqual({ kind: 'yesterday' })
    // Queued yesterday before midnight, started today: it stays in the group of the rows around it (yesterday).
    expect(taskDayLabel(task({ queued_at: at(2026, 9, 23, 23, 58), started_at: at(2026, 9, 24, 0, 5) }), now)).toEqual({ kind: 'yesterday' })
    expect(taskDayLabel(task({ queued_at: null, started_at: at(2026, 9, 24, 8) }), now)).toEqual({ kind: 'today' })
  })

  it('names the month in the app language, in the order of the mock', () => {
    const day = task({ queued_at: at(2026, 9, 22, 10), started_at: at(2026, 9, 22, 10) })
    const polish = new Intl.DateTimeFormat('pl', { month: 'short' }).format(new Date(2026, 9, 22))
    expect(taskDayLabel(day, now, 'pl')).toEqual({ kind: 'date', label: `22 ${polish} 2026` })
    expect(taskDayLabel(day, now, 'en')).toEqual({ kind: 'date', label: '22 Oct 2026' })
    expect(taskDayLabel(day, now, 'not a locale!')).toEqual({ kind: 'date', label: '22 Oct 2026' })
  })

  it('gives a dash for a task without a valid date and counts a future start as today', () => {
    expect(taskDayLabel(task({ started_at: null, queued_at: null }), now)).toEqual({ kind: 'date', label: '—' })
    expect(taskDayLabel(task({ queued_at: at(2026, 9, 25, 3), started_at: at(2026, 9, 25, 3) }), now)).toEqual({ kind: 'today' })
  })
})

describe('taskErrorLine', () => {
  it('is the first non-empty line of a failed task', () => {
    expect(taskErrorLine(task({ status: 'failed', error: '\n  Boom happened  \nat line 2\nat line 3' }))).toBe('Boom happened')
    expect(taskErrorLine(task({ status: 'failed', error: 'one\r\ntwo' }))).toBe('one')
  })

  it('is null for other statuses and for an empty error', () => {
    expect(taskErrorLine(task({ status: 'cancelled', error: 'Stopped' }))).toBeNull()
    expect(taskErrorLine(task({ status: 'completed', error: 'x' }))).toBeNull()
    expect(taskErrorLine(task({ status: 'failed', error: null }))).toBeNull()
    expect(taskErrorLine(task({ status: 'failed', error: ' \n ' }))).toBeNull()
  })
})

describe('taskDetails', () => {
  it('lists Queued, Started, Finished and the task id for a finished task', () => {
    const fields = taskDetails(task({ id: 42 }))
    expect(fields.map(field => field.key)).toEqual(['queued', 'started', 'finished', 'id'])
    expect(fields[0]).toMatchObject({ date: '2026-10-24T10:00:00Z' })
    expect(fields[1]).toMatchObject({ date: '2026-10-24T10:00:10Z' })
    expect(fields[2]).toMatchObject({ date: '2026-10-24T10:00:40Z' })
    expect(fields[3]).toMatchObject({ date: null, text: '#42' })
  })

  it('shows Waiting for a task that has not started', () => {
    const started = taskDetails(task({ status: 'queued', started_at: null, finished_at: null }))[1]
    expect(started).toMatchObject({ date: null, textKey: 'tasks.waiting', defaultText: 'Waiting' })
  })

  it('shows Still running for a running task and a dash for another unfinished one', () => {
    expect(taskDetails(task({ status: 'running', finished_at: null }))[2]).toMatchObject({ date: null, textKey: 'tasks.details.stillRunning', defaultText: 'Still running' })
    expect(taskDetails(task({ status: 'failed', finished_at: null }))[2]).toMatchObject({ date: null, text: '—' })
  })
})
