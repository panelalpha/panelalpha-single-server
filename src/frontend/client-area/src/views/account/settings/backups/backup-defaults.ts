import type { FreeBackupDefaults } from './free-backups.api'
// The pure half of the default backup schedule form.
// The panel stores the Engine's UTC hour and days; the owner sees local time.
import { localScheduleToUtcCron, utcCronScheduleToLocal } from '@/entities/project/ui/backups/automatic-backup'

/** The request keys of `PUT /community/backups`. */
export const BACKUP_FIELDS = ['auto_enable', 'frequency', 'hour', 'day_of_week', 'day_of_month', 'keep_last']

export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const

// The backend takes days 1-28 (UTC) so a monthly backup runs in every month.
export const MAX_DAY_OF_MONTH = 28

export type Translate = (key: string, options?: Record<string, unknown>) => string

export interface BackupDefaultsForm {
  autoEnable: boolean
  frequency: string
  hour: number
  dayOfWeek: number | null
  // Null when the stored day has no local choice in 1-28: the owner picks one.
  dayOfMonth: number | null
  // Null while the field is empty (invalid).
  keepLast: number | null
}

/** The body of `PUT /community/backups` (camelCase), in UTC. */
export interface BackupDefaultsPayload {
  autoEnable: boolean
  frequency: string
  hour: number
  dayOfWeek: number | null
  dayOfMonth: number | null
  keepLast: number | null
}

export interface SelectItem<V> {
  title: string
  value: V
}

function isValidDay (day: unknown): day is number {
  return Number.isInteger(day) && (day as number) >= 1 && (day as number) <= MAX_DAY_OF_MONTH
}

/** The stored (UTC) defaults as local time. */
export function toLocalForm (defaults: FreeBackupDefaults): BackupDefaultsForm {
  const daily = utcCronScheduleToLocal({ hour: defaults.hour, minute: 0 })
  const week = utcCronScheduleToLocal({ hour: defaults.hour, minute: 0, dayOfWeek: defaults.day_of_week })
  const month = utcCronScheduleToLocal({ hour: defaults.hour, minute: 0, dayOfMonth: defaults.day_of_month })
  return {
    autoEnable: defaults.auto_enable,
    frequency: defaults.frequency,
    hour: daily.hour,
    dayOfWeek: week.dayOfWeek ?? null,
    // A stored day that lands outside 1-28 locally (the 29th, or the last day of the previous month) has no local choice.
    dayOfMonth: isValidDay(month.dayOfMonth) ? month.dayOfMonth : null,
    keepLast: defaults.keep_last,
  }
}

/**
  * Only the selected frequency's day is converted; the other day keeps its stored UTC
 * value, so a daily save never rewrites the monthly default.
 */
export function toUtcPayload (form: BackupDefaultsForm, stored: FreeBackupDefaults): BackupDefaultsPayload {
  const { frequency, hour, dayOfWeek, dayOfMonth } = form
  let utcDayOfWeek: number | null | undefined = stored.day_of_week
  let utcDayOfMonth: number | null | undefined = stored.day_of_month
  if (frequency === 'weekly') {
    utcDayOfWeek = localScheduleToUtcCron({ hour, minute: 0, dayOfWeek }).cron_day_of_week
  }
  if (frequency === 'monthly') {
    utcDayOfMonth = localScheduleToUtcCron({ hour, minute: 0, dayOfMonth }).cron_day_of_month
  }
  return {
    autoEnable: form.autoEnable,
    frequency,
    hour: localScheduleToUtcCron({ hour, minute: 0 }).cron_hour,
    dayOfWeek: utcDayOfWeek ?? null,
    dayOfMonth: utcDayOfMonth ?? null,
    keepLast: form.keepLast,
  }
}

/** Strict comparison of the six fields with the stored (UTC) defaults. */
export function isDefaultsChanged (payload: BackupDefaultsPayload, stored: FreeBackupDefaults): boolean {
  return (
    payload.autoEnable !== stored.auto_enable
    || payload.frequency !== stored.frequency
    || payload.hour !== stored.hour
    || payload.dayOfWeek !== stored.day_of_week
    || payload.dayOfMonth !== stored.day_of_month
    || payload.keepLast !== stored.keep_last
  )
}

/**
 * The local days whose UTC day, at the chosen local hour, is still 1-28:
 * near midnight a local day can fall on the previous or next UTC day.
 */
export function monthDayOptions (hour: number): Array<SelectItem<number>> {
  const items: Array<SelectItem<number>> = []
  for (let day = 1; day <= MAX_DAY_OF_MONTH; day += 1) {
    const utc = localScheduleToUtcCron({ hour, minute: 0, dayOfMonth: day })
    if (isValidDay(utc.cron_day_of_month)) {
      items.push({ title: String(day), value: day })
    }
  }
  return items
}

/** `HH:00`, 0-23. */
export function hourOptions (): Array<SelectItem<number>> {
  return Array.from({ length: 24 }, (_, hour) => ({ title: `${String(hour).padStart(2, '0')}:00`, value: hour }))
}

/** 0-6 from Sunday, named in the language of the app, unlike legacy `moment().day(n).format('dddd')`. */
export function weekdayOptions (language?: string): Array<SelectItem<number>> {
  const formatter = new Intl.DateTimeFormat(language || undefined, { weekday: 'long', timeZone: 'UTC' })
  // 2000-01-02 is a Sunday.
  return [0, 1, 2, 3, 4, 5, 6].map(value => ({ title: formatter.format(new Date(Date.UTC(2000, 0, 2 + value))), value }))
}

export function frequencyOptions (t: Translate): Array<SelectItem<string>> {
  return FREQUENCIES.map(value => ({ title: t(`settings.backups.frequencies.${value}`), value }))
}

export function autoEnableOptions (t: Translate): Array<SelectItem<boolean>> {
  return [
    { title: t('settings.backups.autoEnableStates.enabled'), value: true },
    { title: t('settings.backups.autoEnableStates.disabled'), value: false },
  ]
}

/** Whether the field of a request key is on screen: the day fields exist only for their frequency, though both days are always sent. */
export function hasField (key: string, frequency: string): boolean {
  const own = ({ day_of_week: 'weekly', day_of_month: 'monthly' } as Record<string, string>)[key]
  return !own || frequency === own
}

/** An integer 1-365. */
export function isValidKeepLast (value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365
}
