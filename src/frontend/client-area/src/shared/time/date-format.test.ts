import { describe, expect, it } from 'vitest'
import { DEFAULT_DATE_FORMAT, formatDate, formatTime } from './date-format'

// Local-time constructors keep the expectations independent of the machine's zone.
const OCT_5_MORNING = new Date(2026, 9, 5, 9, 7, 3)

describe('formatDate', () => {
  it('formats the four lite formats', () => {
    expect(formatDate(OCT_5_MORNING, { format: 'YYYY-MM-DD' })).toBe('2026-10-05')
    expect(formatDate(OCT_5_MORNING, { format: 'DD.MM.YYYY' })).toBe('05.10.2026')
    expect(formatDate(OCT_5_MORNING, { format: 'DD/MM/YYYY' })).toBe('05/10/2026')
    expect(formatDate(OCT_5_MORNING, { format: 'MM/DD/YYYY' })).toBe('10/05/2026')
  })

  it('falls back to YYYY-MM-DD for an unknown or missing format', () => {
    expect(DEFAULT_DATE_FORMAT).toBe('YYYY-MM-DD')
    expect(formatDate(OCT_5_MORNING)).toBe('2026-10-05')
    expect(formatDate(OCT_5_MORNING, { format: 'D MMM' })).toBe('2026-10-05')
  })

  it('appends HH:mm with the time option', () => {
    expect(formatDate(OCT_5_MORNING, { format: 'DD.MM.YYYY', time: true })).toBe('05.10.2026 09:07')
  })

  it('answers the dash for an empty or unparsable value', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('not a date', { time: true })).toBe('—')
  })

  it('reads the digit string of epoch milliseconds as a timestamp', () => {
    expect(formatDate(String(OCT_5_MORNING.getTime()), { format: 'YYYY-MM-DD' })).toBe('2026-10-05')
  })

  it('reads a zone-less date string as local time', () => {
    expect(formatDate('2026-10-05 09:07:03', { format: 'DD/MM/YYYY' })).toBe('05/10/2026')
  })
})

describe('formatTime', () => {
  it('gives HH:mm in local time', () => {
    expect(formatTime(OCT_5_MORNING)).toBe('09:07')
    expect(formatTime(String(new Date(2026, 0, 1, 23, 59).getTime()))).toBe('23:59')
  })

  it('answers the dash for an empty or unparsable value', () => {
    expect(formatTime(null)).toBe('—')
    expect(formatTime('nope')).toBe('—')
  })
})
