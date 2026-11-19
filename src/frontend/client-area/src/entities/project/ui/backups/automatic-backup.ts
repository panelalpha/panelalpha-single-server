import type { AutomaticBackupSettings } from '@/entities/project/instance-backups.api'

// Pure schedule logic of the automatic backup switch and modal (display text, time labels, the time setter, initial values). No Vue, no store, no HTTP.

export type Translate = (key: string, params?: Record<string, unknown>) => string

const REF_YEAR = 2000
const REF_MONTH = 0 // January: no DST change in mid-month reference dates for most zones
const REF_SUNDAY_UTC = 2 // 2000-01-02 is a Sunday

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function parseIntSafe (value: unknown, fallback = 0): number {
  const n = Number.parseInt(String(value), 10)
  return Number.isNaN(n) ? fallback : n
}

export interface LocalSchedule {
  hour: number
  minute: number
  dayOfWeek?: number
  dayOfMonth?: number
}

export interface UtcCronSchedule {
  cron_hour: number
  cron_minute: number
  cron_day_of_week?: number
  cron_day_of_month?: number
}

export interface CronFields {
  hour: unknown
  minute: unknown
  dayOfWeek?: unknown
  dayOfMonth?: unknown
}

function utcCronToLocal (cronHour: unknown, cronMinute: unknown): { hour: number, minute: number } {
  const date = new Date(Date.UTC(REF_YEAR, REF_MONTH, 1, parseIntSafe(cronHour), parseIntSafe(cronMinute), 0, 0))
  return { hour: date.getHours(), minute: date.getMinutes() }
}

function localToUtcCron (hour: unknown, minute: unknown): { cron_hour: number, cron_minute: number } {
  const date = new Date(REF_YEAR, REF_MONTH, 1, parseIntSafe(hour), parseIntSafe(minute), 0, 0)
  return { cron_hour: date.getUTCHours(), cron_minute: date.getUTCMinutes() }
}

function utcWeekdayDate (dayOfWeek: unknown, hour: unknown, minute: unknown): Date {
  const date = new Date(Date.UTC(REF_YEAR, REF_MONTH, REF_SUNDAY_UTC, 0, 0, 0, 0))
  const diff = (parseIntSafe(dayOfWeek) - date.getUTCDay() + 7) % 7
  date.setUTCDate(date.getUTCDate() + diff)
  date.setUTCHours(parseIntSafe(hour), parseIntSafe(minute), 0, 0)
  return date
}

function localWeekdayDate (dayOfWeek: unknown, hour: unknown, minute: unknown): Date {
  const date = new Date(REF_YEAR, REF_MONTH, REF_SUNDAY_UTC, 0, 0, 0, 0)
  const diff = (parseIntSafe(dayOfWeek) - date.getDay() + 7) % 7
  date.setDate(date.getDate() + diff)
  date.setHours(parseIntSafe(hour), parseIntSafe(minute), 0, 0)
  return date
}

function isSet (value: unknown): boolean {
  return value !== undefined && value !== null && value !== '*'
}

/** The UTC cron fields as local time (and local weekday or month day when the schedule has one). */
export function utcCronScheduleToLocal (fields: CronFields): LocalSchedule {
  if (isSet(fields.dayOfWeek)) {
    const date = utcWeekdayDate(fields.dayOfWeek, fields.hour, fields.minute)
    return { hour: date.getHours(), minute: date.getMinutes(), dayOfWeek: date.getDay() }
  }
  if (isSet(fields.dayOfMonth)) {
    const date = new Date(Date.UTC(REF_YEAR, REF_MONTH, parseIntSafe(fields.dayOfMonth, 1), parseIntSafe(fields.hour), parseIntSafe(fields.minute), 0, 0))
    return { hour: date.getHours(), minute: date.getMinutes(), dayOfMonth: date.getDate() }
  }
  return utcCronToLocal(fields.hour, fields.minute)
}

/** The inverse of `utcCronScheduleToLocal`. */
export function localScheduleToUtcCron (schedule: { hour: unknown, minute: unknown, dayOfWeek?: unknown, dayOfMonth?: unknown }): UtcCronSchedule {
  if (isSet(schedule.dayOfWeek)) {
    const date = localWeekdayDate(schedule.dayOfWeek, schedule.hour, schedule.minute)
    return { cron_hour: date.getUTCHours(), cron_minute: date.getUTCMinutes(), cron_day_of_week: date.getUTCDay() }
  }
  if (isSet(schedule.dayOfMonth)) {
    const date = new Date(REF_YEAR, REF_MONTH, parseIntSafe(schedule.dayOfMonth, 1), parseIntSafe(schedule.hour), parseIntSafe(schedule.minute), 0, 0)
    return { cron_hour: date.getUTCHours(), cron_minute: date.getUTCMinutes(), cron_day_of_month: date.getUTCDate() }
  }
  return localToUtcCron(schedule.hour, schedule.minute)
}

/** `h:mm AM|PM` with the localised period. */
export function formatLocalTime (hour: number, minute: number, t: Translate): string {
  const h = parseIntSafe(hour)
  const m = parseIntSafe(minute)
  let displayHour: number
  let period: string
  if (h === 0) {
    displayHour = 12
    period = t('general.am')
  } else if (h === 12) {
    displayHour = 12
    period = t('general.pm')
  } else if (h > 12) {
    displayHour = h - 12
    period = t('general.pm')
  } else {
    displayHour = h
    period = t('general.am')
  }
  return `${displayHour}:${String(m).padStart(2, '0')} ${period}`
}

/** The switch is on for a frequency other than `never`; no frequency (failed GET) is off. */
export function isAutomaticBackupEnabled (settings: AutomaticBackupSettings): boolean {
  return settings.frequency ? settings.frequency !== 'never' : false
}

/**
 * No backup store is set up (Engine 2.2 `store_configured: false`). `undefined` (older Engine, no answer yet or a failed GET) is "unknown"
 * and blocks nothing; a server that runs its own backups (`uses_own_backup_system`) needs no store. Creating a backup or turning on the
 * schedule is then refused by the server, so the UI blocks it first (legacy only hid the schedule switch).
 */
export function isBackupStoreMissing (
  settings: Pick<AutomaticBackupSettings, 'store_configured'> | null | undefined,
  usesOwnBackupSystem?: boolean,
): boolean {
  return settings?.store_configured === false && !usesOwnBackupSystem
}

/** The schedule a modal starts from: the settings, with `never` shown as `daily`. */
export function initialSchedule (settings: AutomaticBackupSettings): AutomaticBackupSettings {
  const data = { ...settings }
  if (data.frequency === 'never') {
    data.frequency = 'daily'
  }
  return data
}

/** The settings the confirmation sends to disable the backup. */
export function disabledSettings (settings: AutomaticBackupSettings): AutomaticBackupSettings {
  return { ...settings, frequency: 'never' }
}

/** The English ordinal the legacy copy uses (`1st`, `2nd`, `3rd`, `4th`, ...). */
export function ordinalDay (day: number): string {
  if ([1, 21, 31].includes(day)) {
    return `${day}st`
  }
  if ([2, 22].includes(day)) {
    return `${day}nd`
  }
  if ([3, 23].includes(day)) {
    return `${day}rd`
  }
  return `${day}th`
}

/** The schedule's UTC time as local `h:mm AM|PM`. */
export function displayTime (settings: AutomaticBackupSettings, t: Translate): string {
  const local = utcCronScheduleToLocal({
    hour: settings.cron_hour,
    minute: settings.cron_minute,
    dayOfWeek: settings.frequency === 'weekly' ? settings.cron_day_of_week : undefined,
    dayOfMonth: settings.frequency === 'monthly' ? settings.cron_day_of_month : undefined,
  })
  return formatLocalTime(local.hour, local.minute, t)
}

/**
 * The sentence under the switch (`every day at …`, `every <weekday> at …`, `every <n>th at …`), or `false`
 * when the schedule has no frequency that the sentence covers.
 */
export function scheduleMessage (settings: AutomaticBackupSettings, t: Translate): string | false {
  const time = displayTime(settings, t)
  if (settings.frequency === 'daily') {
    return t('message.backup.everyDay', { time })
  }
  if (settings.frequency === 'weekly') {
    const local = utcCronScheduleToLocal({ hour: settings.cron_hour, minute: settings.cron_minute, dayOfWeek: settings.cron_day_of_week })
    return t('message.backup.everyWeek', { day: t(`general.day.${WEEKDAY_KEYS[local.dayOfWeek ?? 0]}`), time })
  }
  if (settings.frequency === 'monthly') {
    const local = utcCronScheduleToLocal({ hour: settings.cron_hour, minute: settings.cron_minute, dayOfMonth: settings.cron_day_of_month })
    return t('message.backup.everyMonth', { day: ordinalDay(local.dayOfMonth ?? 1), time })
  }
  return false
}

/** 48 half-hour labels, `12:00 AM` first, in the 15-minute steps of the legacy menu. `extraMinutes` are the
 * minutes the schedule already starts at: a project keeps its own minute, which is not always on that step. */
export function hourOptions (am: string, pm: string, extraMinutes: number[] = []): string[] {
  const minutes = [...new Set([0, 15, 30, 45, ...extraMinutes.filter(minute => minute >= 0 && minute <= 59)])]
  minutes.sort((a, b) => a - b)
  const options: string[] = []
  for (let half = 0; half < 2; half++) {
    for (let hour = 0; hour < 12; hour++) {
      for (const minute of minutes) {
        const displayHour = hour === 0 ? 12 : hour
        options.push(`${displayHour}:${String(minute).padStart(2, '0')} ${half ? pm : am}`)
      }
    }
  }
  return options
}

/**
 * The time setter: a picked label (`h:mm AM|PM`) as the 24-hour local time, or `null` when the label is not a time. The period is read
 * from the `PM` marker or from the localised `pm` word.
 */
export function parseTimeLabel (value: string, pmLabel: string): { hour: number, minute: number } | null {
  if (!value || value === ':' || !value.includes(':')) {
    return null
  }
  const [hourPart = '', minutePart = ''] = value.split(':')
  const isPm = minutePart.toUpperCase().includes('PM') || minutePart.includes(pmLabel)
  let hour = Number.parseInt(hourPart, 10)
  if (Number.isNaN(hour)) {
    return null
  }
  const minute = Number.parseInt(minutePart, 10) || 0
  if (isPm && hour !== 12) {
    hour += 12
  } else if (!isPm && hour === 12) {
    hour = 0
  }
  return { hour, minute }
}

/** The month days the monthly picker offers. */
export const MONTH_DAYS: readonly number[] = Array.from({ length: 31 }, (_, index) => index + 1)
