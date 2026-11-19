import { describe, expect, it } from 'vitest'
import {
  disabledSettings,
  formatLocalTime,
  hourOptions,
  initialSchedule,
  isAutomaticBackupEnabled,
  isBackupStoreMissing,
  localScheduleToUtcCron,
  MONTH_DAYS,
  ordinalDay,
  parseTimeLabel,
  scheduleMessage,
  utcCronScheduleToLocal,
} from './automatic-backup'

// Translation stub: the key and its params, so the copy can be asserted without the i18n catalogue.
const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key)
const keyOnly = (key: string) => key

describe('isAutomaticBackupEnabled', () => {
  it('is on for daily, weekly and monthly frequencies', () => {
    expect(isAutomaticBackupEnabled({ frequency: 'daily' })).toBe(true)
    expect(isAutomaticBackupEnabled({ frequency: 'weekly' })).toBe(true)
    expect(isAutomaticBackupEnabled({ frequency: 'monthly' })).toBe(true)
  })

  it('is off for never and when the settings carry no frequency (a failed GET)', () => {
    expect(isAutomaticBackupEnabled({ frequency: 'never' })).toBe(false)
    expect(isAutomaticBackupEnabled({})).toBe(false)
  })
})

describe('initialSchedule and disabledSettings', () => {
  it('starts a disabled schedule from daily and keeps the other fields', () => {
    expect(initialSchedule({ frequency: 'never', cron_hour: 3 })).toEqual({ frequency: 'daily', cron_hour: 3 })
  })

  it('does not change the settings it copies', () => {
    const settings = { frequency: 'weekly' }
    initialSchedule(settings)
    expect(settings.frequency).toBe('weekly')
  })

  it('disables the schedule with the frequency never', () => {
    expect(disabledSettings({ frequency: 'monthly', cron_day_of_month: 5 })).toEqual({ frequency: 'never', cron_day_of_month: 5 })
  })
})

describe('ordinalDay', () => {
  it('uses the legacy English ordinals', () => {
    expect(ordinalDay(1)).toBe('1st')
    expect(ordinalDay(2)).toBe('2nd')
    expect(ordinalDay(3)).toBe('3rd')
    expect(ordinalDay(4)).toBe('4th')
    expect(ordinalDay(11)).toBe('11th')
    expect(ordinalDay(21)).toBe('21st')
    expect(ordinalDay(22)).toBe('22nd')
    expect(ordinalDay(23)).toBe('23rd')
    expect(ordinalDay(31)).toBe('31st')
  })
})

describe('parseTimeLabel', () => {
  it('reads the PM marker and the 12-hour edges', () => {
    expect(parseTimeLabel('12:30 PM', 'PM')).toEqual({ hour: 12, minute: 30 })
    expect(parseTimeLabel('12:00 AM', 'PM')).toEqual({ hour: 0, minute: 0 })
    expect(parseTimeLabel('1:15 PM', 'PM')).toEqual({ hour: 13, minute: 15 })
    expect(parseTimeLabel('11:45 AM', 'PM')).toEqual({ hour: 11, minute: 45 })
  })

  it('reads the localised PM word when the marker is not in English', () => {
    expect(parseTimeLabel('2:00 po poludniu', 'po poludniu')).toEqual({ hour: 14, minute: 0 })
  })

  it('answers null for a value that is not a time', () => {
    expect(parseTimeLabel('', 'PM')).toBeNull()
    expect(parseTimeLabel(':', 'PM')).toBeNull()
    expect(parseTimeLabel('no time', 'PM')).toBeNull()
    expect(parseTimeLabel('x:00 AM', 'PM')).toBeNull()
  })
})

describe('hourOptions', () => {
  it('lists the quarter-hour labels of both periods, from 12:00 AM to 11:45 PM', () => {
    const options = hourOptions('AM', 'PM')
    expect(options).toHaveLength(96)
    expect(options[0]).toBe('12:00 AM')
    expect(options[1]).toBe('12:15 AM')
    expect(options[4]).toBe('1:00 AM')
    expect(options[47]).toBe('11:45 AM')
    expect(options[48]).toBe('12:00 PM')
    expect(options[95]).toBe('11:45 PM')
  })

  it('adds a schedule minute that is not on the quarter-hour grid, in its place', () => {
    const options = hourOptions('AM', 'PM', [42])
    // the minute of every hour of both periods, next to that hour's quarter-hour labels
    expect(options).toHaveLength(120)
    const index = options.indexOf('4:42 AM')
    expect(index).toBeGreaterThan(-1)
    expect(options[index - 1]).toBe('4:30 AM')
    expect(options[index + 1]).toBe('4:45 AM')
  })

  it('does not repeat a minute the grid already has', () => {
    expect(hourOptions('AM', 'PM', [15]).filter(option => option === '12:15 AM')).toHaveLength(1)
  })
})

describe('formatLocalTime', () => {
  it('formats the 24-hour time with the localised period', () => {
    expect(formatLocalTime(0, 5, keyOnly)).toBe('12:05 general.am')
    expect(formatLocalTime(12, 0, keyOnly)).toBe('12:00 general.pm')
    expect(formatLocalTime(13, 0, keyOnly)).toBe('1:00 general.pm')
    expect(formatLocalTime(9, 30, keyOnly)).toBe('9:30 general.am')
  })
})

describe('schedule conversion', () => {
  it('converts a daily UTC time to local and back to the same UTC time', () => {
    const utc = { cron_hour: 7, cron_minute: 30 }
    const local = utcCronScheduleToLocal({ hour: utc.cron_hour, minute: utc.cron_minute })
    expect(localScheduleToUtcCron({ hour: local.hour, minute: local.minute })).toEqual(utc)
  })

  it('keeps the weekday through a weekly round trip', () => {
    const local = utcCronScheduleToLocal({ hour: 22, minute: 0, dayOfWeek: 3 })
    expect(local.dayOfWeek).toBeDefined()
    const utc = localScheduleToUtcCron({ hour: local.hour, minute: local.minute, dayOfWeek: local.dayOfWeek })
    expect(utc.cron_day_of_week).toBeDefined()
    const back = utcCronScheduleToLocal({ hour: utc.cron_hour, minute: utc.cron_minute, dayOfWeek: utc.cron_day_of_week })
    expect(back.dayOfWeek).toBe(local.dayOfWeek)
    expect(back.hour).toBe(local.hour)
  })

  it('keeps the month day through a monthly round trip', () => {
    const local = utcCronScheduleToLocal({ hour: 12, minute: 0, dayOfMonth: 15 })
    expect(local.dayOfMonth).toBe(15)
    const utc = localScheduleToUtcCron({ hour: local.hour, minute: local.minute, dayOfMonth: 15 })
    expect(utc.cron_day_of_month).toBeDefined()
  })

  it('treats the wildcard as no weekday or month day', () => {
    const local = utcCronScheduleToLocal({ hour: 1, minute: 0, dayOfWeek: '*', dayOfMonth: '*' })
    expect(local.dayOfWeek).toBeUndefined()
    expect(local.dayOfMonth).toBeUndefined()
  })
})

describe('scheduleMessage', () => {
  it('uses the daily sentence with the local time', () => {
    expect(scheduleMessage({ frequency: 'daily', cron_hour: 10, cron_minute: 0 }, t)).toMatch(/^message\.backup\.everyDay\|\{"time":"\d{1,2}:\d{2} /)
  })

  it('names the weekday of a weekly schedule', () => {
    const message = scheduleMessage({ frequency: 'weekly', cron_hour: 10, cron_minute: 0, cron_day_of_week: 1 }, t)
    expect(message).toMatch(/^message\.backup\.everyWeek\|/)
    expect(message).toMatch(/"day":"general\.day\.(sunday|monday|tuesday|wednesday|thursday|friday|saturday)"/)
  })

  it('names the ordinal day of a monthly schedule', () => {
    const message = scheduleMessage({ frequency: 'monthly', cron_hour: 10, cron_minute: 0, cron_day_of_month: 2 }, t)
    expect(message).toMatch(/^message\.backup\.everyMonth\|/)
  })

  it('has no sentence when the backup is off', () => {
    expect(scheduleMessage({ frequency: 'never' }, t)).toBe(false)
    expect(scheduleMessage({}, t)).toBe(false)
  })
})

describe('MONTH_DAYS', () => {
  it('offers the days 1 to 31', () => {
    expect(MONTH_DAYS).toHaveLength(31)
    expect(MONTH_DAYS[0]).toBe(1)
    expect(MONTH_DAYS[30]).toBe(31)
  })
})

describe('isBackupStoreMissing', () => {
  it('is true only when the server says no store is configured', () => {
    expect(isBackupStoreMissing({ store_configured: false })).toBe(true)
  })

  it('treats an unknown answer as not missing', () => {
    expect(isBackupStoreMissing({})).toBe(false)
    expect(isBackupStoreMissing(null)).toBe(false)
    expect(isBackupStoreMissing(undefined)).toBe(false)
  })

  it('is false when a store exists', () => {
    expect(isBackupStoreMissing({ store_configured: true })).toBe(false)
  })

  it('is false when the server runs its own backups', () => {
    expect(isBackupStoreMissing({ store_configured: false }, true)).toBe(false)
  })
})
