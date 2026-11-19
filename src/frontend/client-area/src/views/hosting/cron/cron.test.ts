import { describe, expect, it } from 'vitest'
import {
  ADD_DEFAULTS,
  COMMON_SETTINGS_VALUES,
  cronExpression,
  cronForHumans,
  cronServiceOptions,
  isSameCronJob,
  matchCommonSetting,
  STANDARD_OPTIONS,
  toCronPayload,
  toCronRow,
  WP_CLOUD_OPTIONS,
} from './cron'

const INVALID = 'notification.hosting.cron.invalidExpression'

const job = {
  line: '1',
  command: 'php /home/example/cron.php',
  minute: '0',
  hour: '2',
  day_of_month: '*',
  month: '*',
  day_of_week: '*',
}

describe('cronExpression', () => {
  it('joins the five fields with single spaces', () => {
    expect(cronExpression(job)).toBe('0 2 * * *')
  })
})

describe('cronForHumans', () => {
  it('describes a valid expression in English (cronstrue)', () => {
    expect(cronForHumans('*/5 * * * *', INVALID)).toBe('Every 5 minutes')
    expect(cronForHumans('0 2 * * *', INVALID)).toBe('At 02:00 AM')
  })

  it('returns the invalid label when the expression does not parse', () => {
    expect(cronForHumans('60 * * * *', INVALID)).toBe(INVALID)
    expect(cronForHumans('* * 32 * *', INVALID)).toBe(INVALID)
    expect(cronForHumans('', INVALID)).toBe(INVALID)
    expect(cronForHumans('not a cron', INVALID)).toBe(INVALID)
  })

  // Texts measured against the legacy lock (cronstrue 2.48.0, cron-parser 4.9.0) on 2026-10-08: identical for every preset.
  it.each([
    ['every_minute', 'Every minute'],
    ['every_5_minutes', 'Every 5 minutes'],
    ['twice_an_hour', 'At 0 and 30 minutes past the hour'],
    ['once_an_hour', 'Every hour'],
    ['twice_a_day', 'At 12:00 AM and 12:00 PM'],
    ['once_a_day', 'At 12:00 AM'],
    ['once_a_week', 'At 12:00 AM, only on Sunday'],
    ['1st_and_15th', 'At 12:00 AM, on day 1 and 15 of the month'],
    ['once_a_month', 'At 12:00 AM, on day 1 of the month'],
    ['once_a_year', 'At 12:00 AM, on day 1 of the month, only in January'],
  ])('describes the %s preset as legacy did', (preset, text) => {
    expect(cronForHumans(cronExpression(COMMON_SETTINGS_VALUES[preset]!), INVALID)).toBe(text)
  })
})

describe('toCronRow', () => {
  it('keeps the job and adds the expression and its description', () => {
    expect(toCronRow(job, INVALID)).toEqual({
      ...job,
      cron_expression: '0 2 * * *',
      description: 'At 02:00 AM',
    })
  })

  it('marks an invalid job with the invalid label, the row is still built', () => {
    const row = toCronRow({ ...job, minute: '60' }, INVALID)

    expect(row.cron_expression).toBe('60 2 * * *')
    expect(row.description).toBe(INVALID)
  })
})

describe('COMMON_SETTINGS_VALUES', () => {
  it('maps the ten presets to their five fields and leaves custom out', () => {
    expect(Object.keys(COMMON_SETTINGS_VALUES)).toHaveLength(10)
    expect(COMMON_SETTINGS_VALUES).not.toHaveProperty('custom')
    expect(COMMON_SETTINGS_VALUES.every_5_minutes).toEqual({ minute: '*/5', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' })
    expect(COMMON_SETTINGS_VALUES.once_a_week).toEqual({ minute: '0', hour: '0', day_of_month: '*', month: '*', day_of_week: '0' })
    expect(COMMON_SETTINGS_VALUES['1st_and_15th']).toEqual({ minute: '0', hour: '0', day_of_month: '1,15', month: '*', day_of_week: '*' })
    expect(COMMON_SETTINGS_VALUES.once_a_year).toEqual({ minute: '0', hour: '0', day_of_month: '1', month: '1', day_of_week: '*' })
  })
})

describe('frequency options', () => {
  it('lists the eleven standard options in legacy order', () => {
    expect(STANDARD_OPTIONS.map(option => option.value)).toEqual([
      'custom', 'every_minute', 'every_5_minutes', 'twice_an_hour', 'once_an_hour', 'twice_a_day',
      'once_a_day', 'once_a_week', '1st_and_15th', 'once_a_month', 'once_a_year',
    ])
    expect(STANDARD_OPTIONS[2]!.labelKey).toBe('form.option.cron.everyFiveMinutes')
  })

  it('lists the seven WP Cloud options (app variant) without the day-of-month ones', () => {
    expect(WP_CLOUD_OPTIONS.map(option => option.value)).toEqual([
      'custom', 'every_5_minutes', 'twice_an_hour', 'once_an_hour', 'twice_a_day', 'once_a_day', 'once_a_week',
    ])
  })
})

describe('isSameCronJob', () => {
  it('matches a job with the same command and the same five fields', () => {
    expect(isSameCronJob(job, { ...job })).toBe(true)
  })

  it('does not match when the command or one field differs', () => {
    expect(isSameCronJob(job, { ...job, command: 'other' })).toBe(false)
    expect(isSameCronJob(job, { ...job, hour: '3' })).toBe(false)
  })

  it('matches nothing while there is no highlight yet', () => {
    expect(isSameCronJob(job, {})).toBe(false)
  })
})

describe('ADD_DEFAULTS', () => {
  it('starts with every 5 minutes and an empty command', () => {
    expect(ADD_DEFAULTS).toEqual({
      common_settings: 'every_5_minutes',
      expression: { minute: '*/5', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
      command: '',
      service: null,
    })
  })
})

describe('toCronPayload', () => {
  it('flattens the modal values to the seven request fields', () => {
    expect(toCronPayload({
      common_settings: 'custom',
      expression: { minute: '5', hour: '4', day_of_month: '*', month: '*', day_of_week: '1' },
      command: 'backup.sh',
      service: null,
    }, false)).toEqual({
      common_settings: 'custom',
      minute: '5',
      hour: '4',
      day_of_month: '*',
      month: '*',
      day_of_week: '1',
      command: 'backup.sh',
    })
  })

  it('adds the chosen service of a container project (ID-47)', () => {
    expect(toCronPayload({
      common_settings: 'custom',
      expression: { minute: '*', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
      command: 'php artisan schedule:run',
      service: 'app',
    }, true)).toEqual({
      common_settings: 'custom',
      minute: '*',
      hour: '*',
      day_of_month: '*',
      month: '*',
      day_of_week: '*',
      command: 'php artisan schedule:run',
      service: 'app',
    })
  })

  it('leaves the service out on PHP hosting even when the values carry one', () => {
    expect(toCronPayload({
      common_settings: 'custom',
      expression: { minute: '*', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
      command: 'backup.sh',
      service: 'app',
    }, false)).toEqual({
      common_settings: 'custom',
      minute: '*',
      hour: '*',
      day_of_month: '*',
      month: '*',
      day_of_week: '*',
      command: 'backup.sh',
    })
  })
})

describe('cronServiceOptions', () => {
  it('lists the services of the project', () => {
    expect(cronServiceOptions(['app', 'worker'], 'app')).toEqual(['app', 'worker'])
    expect(cronServiceOptions(['app', 'worker'], null)).toEqual(['app', 'worker'])
  })

  it('keeps the service of an edited job that the project does not have any more', () => {
    expect(cronServiceOptions(['app'], 'scheduler')).toEqual(['app', 'scheduler'])
  })
})

describe('matchCommonSetting', () => {
  it('returns the key of every preset for its own fields', () => {
    for (const [key, fields] of Object.entries(COMMON_SETTINGS_VALUES)) {
      expect(matchCommonSetting(fields)).toBe(key)
    }
  })

  it('returns custom for fields that match no preset, without normalising', () => {
    expect(matchCommonSetting({ minute: '0', hour: '2', day_of_month: '*', month: '*', day_of_week: '*' })).toBe('custom')
    expect(matchCommonSetting({ minute: '*/1', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' })).toBe('custom')
  })

  it('trims spaces and honours the allowed list', () => {
    const daily = { minute: ' 0 ', hour: '0 ', day_of_month: '*', month: '*', day_of_week: '*' }
    expect(matchCommonSetting(daily)).toBe('once_a_day')
    expect(matchCommonSetting(COMMON_SETTINGS_VALUES.once_a_month!, ['custom', 'once_a_day'])).toBe('custom')
  })
})
