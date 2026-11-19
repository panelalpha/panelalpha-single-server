import type { FreeTask } from './tasks.api'
import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
import { parseDate } from '@/shared/time/format-date'

// Pure logic of the Free tasks screen.

/** Engine `details.action` values the screen has a label for (legacy order, then `copy`, then the
 * Engine's own housekeeping). */
export const TASK_ACTIONS = [
  'deploy',
  'rebuild',
  'deploy_archive',
  'attach_source',
  'git_pull',
  'change_branch',
  'revert',
  'backup',
  'restore',
  'delete',
  'delete_container',
  'staging',
  'push',
  'env_apply',
  'api_access_apply',
  'mysql_database_rename',
  'copy',
  'operator_image_publish',
  'operator_image_refresh',
  'operator_image_remove',
  'build_cache_build',
] as const

export interface TaskFilterItem {
  title: string
  value: string
}

type Translate = (key: string) => string

export function taskActionFilterItems (t: Translate): TaskFilterItem[] {
  return [
    { title: t('tasks.filters.all'), value: '' },
    ...TASK_ACTIONS.map(value => ({ title: t(`tasks.actions.${value}`), value })),
  ]
}

export const TASK_JOB_TYPES = ['RunHookDelivery']

export const TASKS_PER_PAGE = 50
export const TASKS_POSSIBLE_PER_PAGE = [[15, 50, 100]]
export const FAST_POLL_MS = 5000
export const SLOW_POLL_MS = 30_000

const EMPTY = '—'

/** The delay before the next poll: fast while a task is queued or running, slow otherwise or after a failed request. */
export function nextPollDelay (tasks: Pick<FreeTask, 'status'>[], failed: boolean): number {
  const active = !failed && tasks.some(task => task.status === 'queued' || task.status === 'running')
  return active ? FAST_POLL_MS : SLOW_POLL_MS
}

export interface TaskStatusStyle {
  /** Colour modifier of `.task-status-label--<modifier>`. */
  modifier: 'orange' | 'blue' | 'green' | 'error' | 'gray'
  icon: string | null
}

/** Chip colour and icon per status. */
export const TASK_STATUS_STYLES: Record<string, TaskStatusStyle> = {
  queued: { modifier: 'orange', icon: '$clock' },
  running: { modifier: 'blue', icon: '$loader' },
  completed: { modifier: 'green', icon: '$check' },
  failed: { modifier: 'error', icon: '$close' },
  cancelled: { modifier: 'error', icon: '$close' },
}

const UNKNOWN_STATUS_STYLE: TaskStatusStyle = { modifier: 'gray', icon: null }

export function isKnownTaskStatus (status: string | null | undefined): boolean {
  return Boolean(status) && Object.hasOwn(TASK_STATUS_STYLES, status as string)
}

/** The style of a status; an unknown one is gray without an icon. */
export function taskStatusStyle (status: string | null | undefined): TaskStatusStyle {
  return isKnownTaskStatus(status) ? TASK_STATUS_STYLES[status as string]! : UNKNOWN_STATUS_STYLE
}

/** Kit status of a task chip: the legacy material colours map to the kit status colours. */
export const TASK_MODIFIER_STATUS: Readonly<Record<TaskStatusStyle['modifier'], StatusLabelStatus>> = {
  orange: 'warning',
  blue: 'info',
  green: 'success',
  error: 'error',
  gray: 'gray',
}

/** The label of a task: a known action, a known job type, the raw job segment, the action, a dash. */
export function taskLabelKey (task: Pick<FreeTask, 'action' | 'job_type'>): { key: string } | { text: string } {
  if (task.action && (TASK_ACTIONS as readonly string[]).includes(task.action)) {
    return { key: `tasks.actions.${task.action}` }
  }
  const base = String(task.job_type || '').split('\\').pop() as string
  if (TASK_JOB_TYPES.includes(base)) {
    return { key: `tasks.jobTypes.${base}` }
  }
  return { text: base || task.action || EMPTY }
}

export function taskStartedAt (task: Pick<FreeTask, 'started_at' | 'queued_at'>): string | null {
  return task.started_at || task.queued_at
}

/** `Ns` / `Nm Ns` / `Nh Nm` / `Nd Nh`; negative values count as 0. */
export function formatTaskDuration (ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`
  }
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

function validTime (value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const time = parseDate(value).getTime()
  return Number.isNaN(time) ? null : time
}

/** The duration cell: a dash for a queued task, an invalid date or a missing end. */
export function taskDuration (task: FreeTask, now: number): string {
  if (task.status === 'queued') {
    return EMPTY
  }
  const start = validTime(taskStartedAt(task))
  if (start === null) {
    return EMPTY
  }
  const end = task.finished_at ? validTime(task.finished_at) : (task.status === 'running' ? now : null)
  if (end === null) {
    return EMPTY
  }
  return formatTaskDuration(end - start)
}

/** Status of each tab of the page frame, in tab order; `''` is "All" (no `status` query). */
export const TASK_STATUS_TABS = ['', 'active', 'failed', 'completed', 'cancelled'] as const

/** The tab titles (`tasks.filters.*`, `tasks.status.*` exist in the lite translation). */
export function taskStatusTabItems (t: Translate): TaskFilterItem[] {
  return TASK_STATUS_TABS.map(value => ({
    title: value === '' ? t('tasks.filters.all') : (value === 'active' ? t('tasks.filters.active') : t(`tasks.status.${value}`)),
    value,
  }))
}

export interface TaskTableColumn {
  value: 'task' | 'project' | 'started' | 'duration' | 'status' | 'open'
  /** An i18n key; `null` for the chevron column (`open`). */
  text: string | null
  width: string
  align?: 'end'
}

/** Column widths of the table (Task 34 %, Project 22 %, Started 16 %, Duration 11 %, Status 13 % to the right, chevron 56 px). */
export const TASK_TABLE_COLUMNS: readonly TaskTableColumn[] = [
  { value: 'task', text: 'tasks.columns.task', width: '34%' },
  { value: 'project', text: 'tasks.columns.project', width: '22%' },
  { value: 'started', text: 'tasks.columns.started', width: '16%' },
  { value: 'duration', text: 'tasks.columns.duration', width: '11%' },
  { value: 'status', text: 'tasks.columns.status', width: '13%', align: 'end' },
  { value: 'open', text: null, width: '56px' },
]

export type TaskDayLabel = { kind: 'today' | 'yesterday' } | { kind: 'date', label: string }

/** The local calendar day as a number of days (DST safe: built from the local fields, not from milliseconds). */
function localDayNumber (date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

/** The short month name in the app language (`Intl`, as the weekday names of `backup-defaults.ts`); English without a language. */
function shortMonth (date: Date, language: string | undefined): string {
  try {
    return new Intl.DateTimeFormat(language || 'en', { month: 'short' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'short' }).format(date)
  }
}

/**
 * The day group of a task: today / yesterday by the local calendar, any other day `D Mon YYYY` (the order of the mock, the month name in
 * the app language). The day comes from `queued_at ?? started_at`: the server lists the tasks by id, which is the queue order, so the
 * groups follow the rows and a task that waited in the queue over midnight does not open a second "Today". A task without a valid date
 * gets a dash label.
 */
export function taskDayLabel (task: Pick<FreeTask, 'started_at' | 'queued_at'>, now: number, language?: string): TaskDayLabel {
  const time = validTime(task.queued_at || task.started_at)
  if (time === null) {
    return { kind: 'date', label: EMPTY }
  }
  const date = new Date(time)
  const diff = localDayNumber(new Date(now)) - localDayNumber(date)
  if (diff <= 0) {
    return { kind: 'today' }
  }
  if (diff === 1) {
    return { kind: 'yesterday' }
  }
  return { kind: 'date', label: `${date.getDate()} ${shortMonth(date, language)} ${date.getFullYear()}` }
}

/** The first non-empty line of the error of a `failed` task (the row shows only it); `null` for other statuses or an empty error. */
export function taskErrorLine (task: Pick<FreeTask, 'status' | 'error'>): string | null {
  if (task.status !== 'failed' || !task.error) {
    return null
  }
  return task.error.split(/\r?\n/).map(part => part.trim()).find(part => part !== '') ?? null
}

export interface TaskDetailField {
  key: 'queued' | 'started' | 'finished' | 'id'
  /** The keys under `tasks.details.*` are not in the translation yet: the view passes `defaultLabel` as `defaultValue`. */
  labelKey: string
  defaultLabel: string
  /** An ISO date to format in the view, or `null` when the field shows a text. */
  date: string | null
  /** A ready text (`#id`, a dash) when there is no date, or a key (`textKey`) with its `defaultText`. */
  text?: string
  textKey?: string
  defaultText?: string
}

/** The detail fields of an expanded row: Queued, Started (Waiting), Finished (Still running / dash) and Task ID. */
export function taskDetails (task: FreeTask, _now?: number): TaskDetailField[] {
  const queued = validTime(task.queued_at) === null ? null : task.queued_at
  const started = validTime(task.started_at) === null ? null : task.started_at
  const finished = validTime(task.finished_at) === null ? null : task.finished_at
  const finishedText = task.status === 'running'
    ? { textKey: 'tasks.details.stillRunning', defaultText: 'Still running' }
    : { text: EMPTY }
  return [
    { key: 'queued', labelKey: 'tasks.details.queued', defaultLabel: 'Queued', date: queued, ...(queued ? {} : { text: EMPTY }) },
    { key: 'started', labelKey: 'tasks.details.started', defaultLabel: 'Started', date: started, ...(started ? {} : { textKey: 'tasks.waiting', defaultText: 'Waiting' }) },
    { key: 'finished', labelKey: 'tasks.details.finished', defaultLabel: 'Finished', date: finished, ...(finished ? {} : finishedText) },
    { key: 'id', labelKey: 'tasks.details.taskId', defaultLabel: 'Task ID', date: null, text: `#${task.id}` },
  ]
}
