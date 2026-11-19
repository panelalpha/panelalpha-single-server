import { describe, expect, it } from 'vitest'
import { formatDateTime, formatLocal, parseDate, parseWordPressDate } from './format-date'

describe('format-date', () => {
  it('formats a zone-less string as written (local time)', () => {
    expect(formatDateTime('2026-10-05 09:07:33')).toBe('2026-10-05 09:07')
    expect(formatDateTime('2026-10-05T23:59')).toBe('2026-10-05 23:59')
  })

  it('reads the date-only form as local midnight, not UTC', () => {
    expect(formatDateTime('2026-10-05')).toBe('2026-10-05 00:00')
  })

  it('formats an ISO string with a zone in local time', () => {
    const iso = '2026-10-05T12:00:00.000Z'
    const local = new Date(iso)
    const pad = (value: number) => String(value).padStart(2, '0')
    expect(formatDateTime(iso)).toBe(
      `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}`,
    )
  })

  it('answers "Invalid date" for an unparsable value, as moment does', () => {
    expect(formatDateTime('not a date')).toBe('Invalid date')
  })

  it('formatLocal can add the seconds', () => {
    expect(formatLocal(new Date(2026, 9, 5, 9, 7, 3), true)).toBe('2026-10-05 09:07:03')
  })

  it('parseDate passes a Date through', () => {
    const date = new Date(2026, 9, 5)
    expect(parseDate(date).getTime()).toBe(date.getTime())
  })

  it('parseWordPressDate reads the zone-less WordPress timestamp as UTC', () => {
    expect(parseWordPressDate('2026-11-14 20:40:32').toISOString()).toBe('2026-11-14T20:40:32.000Z')
    expect(parseWordPressDate('2026-11-14T20:40').toISOString()).toBe('2026-11-14T20:40:00.000Z')
  })

  it('parseWordPressDate leaves a timestamp that carries a zone to Date', () => {
    expect(parseWordPressDate('2026-11-14T20:40:32Z').toISOString()).toBe('2026-11-14T20:40:32.000Z')
    expect(parseWordPressDate('2026-11-14T21:40:32+01:00').toISOString()).toBe('2026-11-14T20:40:32.000Z')
  })
})
