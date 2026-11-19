import type { CronJob, CronJobPayload } from './cron.api'
import { CronExpressionParser } from 'cron-parser'
import cronstrue from 'cronstrue'

// Pure logic of the Cron Jobs screen, ported from the legacy Cron view.
// The labels are translated by the view; this module keeps the i18n keys only.

/** The five crontab fields as the modal and the table read them. */
export interface CronExpressionFields {
  minute: string
  hour: string
  day_of_month: string
  month: string
  day_of_week: string
}

/** A job as the modal reads it: the five fields and the command. */
export interface CronJobFields extends CronExpressionFields {
  command: string
}

/**
 * Values of the Add / Edit modal: the frequency select, the multi-text expression, the command and, on a container
 * project, the service the command runs in (`null` on PHP hosting).
 */
export interface CronFormValues {
  common_settings: string
  expression: CronExpressionFields
  command: string
  service: string | null
}

/** A table row: the job plus its expression and its human description. */
export interface CronRow extends CronJob {
  cron_expression: string
  description: string
}

export interface CronOption {
  value: string
  /** i18n key of the label (`form.option.*`). */
  labelKey: string
}

/** `${minute} ${hour} ${day_of_month} ${month} ${day_of_week}` */
export function cronExpression (job: CronExpressionFields): string {
  return `${job.minute} ${job.hour} ${job.day_of_month} ${job.month} ${job.day_of_week}`
}

/**
 * The expression must parse (`cron-parser` 5) before `cronstrue` describes it. Any error gives the
 * invalid label. The description is always English (no locale), as in legacy.
 */
export function cronForHumans (expression: string, invalidLabel: string): string {
  try {
    CronExpressionParser.parse(expression)
    return cronstrue.toString(expression)
  } catch {
    return invalidLabel
  }
}

/** A job as a table row: `cron_expression` and `description` are computed once per fetch. */
export function toCronRow (job: CronJob, invalidLabel: string): CronRow {
  const expression = cronExpression(job)
  return { ...job, cron_expression: expression, description: cronForHumans(expression, invalidLabel) }
}

/**
 * The frequency presets of the modal, with the five fields each one writes.
 * `custom` is not here: it writes nothing and leaves the fields as they are.
 */
export const COMMON_SETTINGS_VALUES: Readonly<Record<string, CronExpressionFields>> = {
  'every_minute': { minute: '*', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
  'every_5_minutes': { minute: '*/5', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
  'twice_an_hour': { minute: '0,30', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
  'once_an_hour': { minute: '0', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
  'twice_a_day': { minute: '0', hour: '0,12', day_of_month: '*', month: '*', day_of_week: '*' },
  'once_a_day': { minute: '0', hour: '0', day_of_month: '*', month: '*', day_of_week: '*' },
  'once_a_week': { minute: '0', hour: '0', day_of_month: '*', month: '*', day_of_week: '0' },
  '1st_and_15th': { minute: '0', hour: '0', day_of_month: '1,15', month: '*', day_of_week: '*' },
  'once_a_month': { minute: '0', hour: '0', day_of_month: '1', month: '*', day_of_week: '*' },
  'once_a_year': { minute: '0', hour: '0', day_of_month: '1', month: '1', day_of_week: '*' },
}

/**
 * The preset whose five fields equal the given ones (compared as trimmed text, no semantic normalising, so a step of 1 is not a star), else `custom`.
 * `allowed` limits the answer to the presets the select offers (WP Cloud has fewer than a standard host).
 */
export function matchCommonSetting (fields: CronExpressionFields, allowed?: readonly string[]): string {
  const keys: Array<keyof CronExpressionFields> = ['minute', 'hour', 'day_of_month', 'month', 'day_of_week']
  for (const [name, preset] of Object.entries(COMMON_SETTINGS_VALUES)) {
    if (allowed && !allowed.includes(name)) {
      continue
    }
    if (keys.every(key => String(fields[key] ?? '').trim() === preset[key])) {
      return name
    }
  }
  return 'custom'
}

/** Frequency options of a standard host, in legacy order. */
export const STANDARD_OPTIONS: readonly CronOption[] = [
  { value: 'custom', labelKey: 'form.option.custom' },
  { value: 'every_minute', labelKey: 'form.option.cron.everyMinute' },
  { value: 'every_5_minutes', labelKey: 'form.option.cron.everyFiveMinutes' },
  { value: 'twice_an_hour', labelKey: 'form.option.cron.twiceAnHour' },
  { value: 'once_an_hour', labelKey: 'form.option.cron.onceAnHour' },
  { value: 'twice_a_day', labelKey: 'form.option.cron.twiceADay' },
  { value: 'once_a_day', labelKey: 'form.option.cron.onceADay' },
  { value: 'once_a_week', labelKey: 'form.option.cron.oneAWeek' },
  { value: '1st_and_15th', labelKey: 'form.option.cron.twiceAMonth' },
  { value: 'once_a_month', labelKey: 'form.option.cron.onceAMonth' },
  { value: 'once_a_year', labelKey: 'form.option.cron.onceAYear' },
]

/**
 * Frequency options of a WP Cloud host.
 * WP Cloud repeats schedules hourly, daily or weekly, so the day-of-month options are not offered; `custom` needs the WP Cloud advanced cron feature.
 */
export const WP_CLOUD_OPTIONS: readonly CronOption[] = [
  { value: 'custom', labelKey: 'form.option.custom' },
  { value: 'every_5_minutes', labelKey: 'form.option.cron.everyFiveMinutes' },
  { value: 'twice_an_hour', labelKey: 'form.option.cron.twiceAnHour' },
  { value: 'once_an_hour', labelKey: 'form.option.cron.onceAnHour' },
  { value: 'twice_a_day', labelKey: 'form.option.cron.twiceADay' },
  { value: 'once_a_day', labelKey: 'form.option.cron.onceADay' },
  { value: 'once_a_week', labelKey: 'form.option.cron.oneAWeek' },
]

/**
 * Same command and same five fields: the row that a save just wrote gets the highlight. An empty
 * `highlight` (no save yet) matches nothing, as in legacy.
 */
export function isSameCronJob (job: CronJobFields, highlight: Partial<CronJobFields>): boolean {
  if (!highlight.command) {
    return false
  }
  return job.command === highlight.command
    && job.minute === highlight.minute
    && job.hour === highlight.hour
    && job.day_of_month === highlight.day_of_month
    && job.month === highlight.month
    && job.day_of_week === highlight.day_of_week
}

/** Values of a new job: every 5 minutes, no command yet. */
export const ADD_DEFAULTS: CronFormValues = {
  common_settings: 'every_5_minutes',
  expression: { minute: '*/5', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
  command: '',
  service: null,
}

/**
 * Flattens the modal values to the request body (`common_settings` is sent, the backend ignores it, as in legacy). `service` is sent only for
 * a container project and only when one is chosen: PHP hosting refuses the field (`meta.services` is null there), and a value left over
 * from another account's list must never reach the Engine.
 */
export function toCronPayload (values: CronFormValues, isContainerProject: boolean): CronJobPayload {
  return {
    common_settings: values.common_settings,
    minute: values.expression.minute,
    hour: values.expression.hour,
    day_of_month: values.expression.day_of_month,
    month: values.expression.month,
    day_of_week: values.expression.day_of_week,
    command: values.command,
    ...(isContainerProject && values.service ? { service: values.service } : {}),
  }
}

/**
 * The options of the Service select: the project's services, plus the edited job's own when it is not among them any more
 * (a service removed from the Compose file), so the dialog still shows what the job runs in.
 */
export function cronServiceOptions (services: readonly string[], current: string | null): string[] {
  return current && !services.includes(current) ? [...services, current] : [...services]
}
