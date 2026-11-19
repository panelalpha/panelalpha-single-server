import type { FreeBackupDefaults } from './free-backups.api'
import { afterEach, describe, expect, it } from 'vitest'
import {
  hasField,
  hourOptions,
  isDefaultsChanged,
  isValidKeepLast,
  monthDayOptions,
  toLocalForm,
  toUtcPayload,
  weekdayOptions,
} from './backup-defaults'

const ORIGINAL_TZ = process.env.TZ
const ZONES = ['Asia/Tokyo', 'Europe/Warsaw', 'America/New_York'] as const

function inZone (zone: string) {
  process.env.TZ = zone
}

const STORED: FreeBackupDefaults = {
  auto_enable: true,
  frequency: 'weekly',
  hour: 3,
  day_of_week: 2,
  day_of_month: 15,
  keep_last: 7,
}

describe('backup-defaults', () => {
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = ORIGINAL_TZ
    }
  })

  it.each(ZONES)('round-trips the stored defaults through the local form in %s', zone => {
    inZone(zone)
    for (const frequency of ['daily', 'weekly', 'monthly']) {
      const stored = { ...STORED, frequency }
      const payload = toUtcPayload(toLocalForm(stored), stored)

      expect(payload).toEqual({
        autoEnable: true,
        frequency,
        hour: 3,
        dayOfWeek: 2,
        dayOfMonth: 15,
        keepLast: 7,
      })
      expect(isDefaultsChanged(payload, stored)).toBe(false)
    }
  })

  it('shows the stored UTC hour in the zone of the owner', () => {
    inZone('Asia/Tokyo')
    expect(toLocalForm(STORED).hour).toBe(12)
    inZone('America/New_York')
    // January reference date: UTC-5.
    expect(toLocalForm(STORED).hour).toBe(22)
    inZone('Europe/Warsaw')
    expect(toLocalForm(STORED).hour).toBe(4)
  })

  it('moves the weekday with the hour across midnight', () => {
    inZone('Asia/Tokyo')
    // Tuesday 20:00 UTC is Wednesday 05:00 in Tokyo.
    const form = toLocalForm({ ...STORED, hour: 20 })
    expect(form.hour).toBe(5)
    expect(form.dayOfWeek).toBe(3)
  })

  it('converts only the day of the chosen frequency and keeps the other in UTC', () => {
    inZone('Asia/Tokyo')
    const form = { ...toLocalForm(STORED), frequency: 'daily' }
    const payload = toUtcPayload({ ...form, dayOfWeek: 5, dayOfMonth: 20 }, STORED)

    expect(payload.dayOfWeek).toBe(2)
    expect(payload.dayOfMonth).toBe(15)

    const weekly = toUtcPayload({ ...form, frequency: 'weekly', dayOfWeek: 5 }, STORED)
    // Friday 12:00 in Tokyo is still Friday 03:00 UTC.
    expect(weekly.dayOfWeek).toBe(5)
    expect(weekly.dayOfMonth).toBe(15)

    const early = toUtcPayload({ ...form, frequency: 'weekly', hour: 5, dayOfWeek: 5 }, STORED)
    // Friday 05:00 in Tokyo is Thursday 20:00 UTC.
    expect(early.hour).toBe(20)
    expect(early.dayOfWeek).toBe(4)
  })

  it('converts the monthly day and leaves dayOfMonth null for a stored day outside 1-28 locally', () => {
    inZone('Asia/Tokyo')
    // The 1st at 20:00 UTC is the 2nd 05:00 in Tokyo.
    expect(toLocalForm({ ...STORED, hour: 20, day_of_month: 1 }).dayOfMonth).toBe(2)
    // The 28th at 20:00 UTC is the 29th in Tokyo: no local choice.
    expect(toLocalForm({ ...STORED, hour: 20, day_of_month: 28 }).dayOfMonth).toBeNull()

    const form = { ...toLocalForm({ ...STORED, hour: 20, day_of_month: 1 }), frequency: 'monthly' }
    expect(toUtcPayload(form, { ...STORED, hour: 20, day_of_month: 1 })).toMatchObject({ hour: 20, dayOfMonth: 1 })
  })

  it('offers the local days whose UTC day stays within 1-28, by zone and hour', () => {
    inZone('Asia/Tokyo')
    // 02:00 in Tokyo is the previous UTC day: local day 1 falls on UTC day 0 of the month.
    expect(monthDayOptions(2).map(item => item.value)).toEqual(Array.from({ length: 27 }, (_, index) => index + 2))
    // 12:00 in Tokyo is the same UTC day.
    expect(monthDayOptions(12)).toHaveLength(28)
    expect(monthDayOptions(12)[0]).toEqual({ title: '1', value: 1 })

    inZone('America/New_York')
    // 22:00 in New York is the next UTC day: local day 28 falls on UTC day 29.
    expect(monthDayOptions(22).map(item => item.value)).toEqual(Array.from({ length: 27 }, (_, index) => index + 1))
    expect(monthDayOptions(10)).toHaveLength(28)
  })

  it('lists the hours as HH:00 from 0 to 23', () => {
    const hours = hourOptions()

    expect(hours).toHaveLength(24)
    expect(hours[0]).toEqual({ title: '00:00', value: 0 })
    expect(hours[23]).toEqual({ title: '23:00', value: 23 })
  })

  it('names the weekdays from Sunday in the given language', () => {
    expect(weekdayOptions('en').map(item => item.title)).toEqual([
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ])
    expect(weekdayOptions('en').map(item => item.value)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(weekdayOptions('pl')[0]?.title).toBe('niedziela')
  })

  it.each(ZONES)('keeps the weekday names stable in %s', zone => {
    inZone(zone)
    expect(weekdayOptions('en')[0]?.title).toBe('Sunday')
    expect(weekdayOptions('en')[6]?.title).toBe('Saturday')
  })

  it('detects a change in any of the six fields, strictly', () => {
    const same = { autoEnable: true, frequency: 'weekly', hour: 3, dayOfWeek: 2, dayOfMonth: 15, keepLast: 7 }

    expect(isDefaultsChanged(same, STORED)).toBe(false)
    for (const patch of [
      { autoEnable: false },
      { frequency: 'daily' },
      { hour: 4 },
      { dayOfWeek: 3 },
      { dayOfMonth: 16 },
      { keepLast: 8 },
      { keepLast: null },
    ]) {
      expect(isDefaultsChanged({ ...same, ...patch }, STORED)).toBe(true)
    }
  })

  it('has the day fields only for their frequency', () => {
    expect(hasField('day_of_week', 'weekly')).toBe(true)
    expect(hasField('day_of_week', 'daily')).toBe(false)
    expect(hasField('day_of_month', 'monthly')).toBe(true)
    expect(hasField('day_of_month', 'weekly')).toBe(false)
    expect(hasField('keep_last', 'daily')).toBe(true)
    expect(hasField('hour', 'monthly')).toBe(true)
  })

  it('accepts only integers from 1 to 365 as keep last', () => {
    expect([1, 7, 365].every(isValidKeepLast)).toBe(true)
    for (const value of ['', null, 0, 366, 1.5, -1, Number.NaN, '7']) {
      expect(isValidKeepLast(value)).toBe(false)
    }
  })
})
