import { describe, expect, it } from 'vitest'
import {
  axisLabel,
  bandwidthMetric,
  formatBandwidth,
  formatSessionTick,
  secondsToHms,
  seriesFromRecords,
  visitsMetric,
} from './analytics'

const TIME_UNITS = { h: 'h', min: 'min', sec: 'sec' }
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

describe('secondsToHms', () => {
  it('writes only the non-zero parts, in legacy units', () => {
    expect(secondsToHms(3725, TIME_UNITS)).toBe('1h 2min 5sec')
    expect(secondsToHms(125, TIME_UNITS)).toBe('2min 5sec')
    expect(secondsToHms(7, TIME_UNITS)).toBe('7sec')
  })

  it('is an empty string for zero seconds, as legacy', () => {
    expect(secondsToHms(0, TIME_UNITS)).toBe('')
  })
})

describe('formatSessionTick', () => {
  it('uses the largest unit that is not zero', () => {
    expect(formatSessionTick(3725)).toBe('1h 2m 5s')
    expect(formatSessionTick(125)).toBe('2m 5s')
    expect(formatSessionTick(9)).toBe('9s')
  })
})

describe('formatBandwidth', () => {
  it('uses base 1024 with up to two decimals', () => {
    expect(formatBandwidth(0, SIZE_UNITS)).toBe('0 B')
    expect(formatBandwidth(1536, SIZE_UNITS)).toBe('1.5 KB')
    expect(formatBandwidth(1024 * 1024 * 3, SIZE_UNITS)).toBe('3 MB')
  })

  it('reads a value below one byte as bytes instead of an undefined unit', () => {
    expect(formatBandwidth(0.5, SIZE_UNITS)).toBe('0.5 B')
  })
})

describe('axisLabel', () => {
  it('formats a day as MMM DD in UTC, whatever the local zone', () => {
    expect(axisLabel('2026-10-03', 'last-week')).toBe('Oct 03')
    expect(axisLabel('2026-10-03T23:30:00Z', 'last-month')).toBe('Oct 03')
  })

  it('formats a month as MMM YYYY for the last year', () => {
    expect(axisLabel('2026-03-01', 'last-year')).toBe('Mar 2026')
  })

  it('shows an unreadable key as it is', () => {
    expect(axisLabel('not-a-date', 'last-week')).toBe('not-a-date')
  })
})

describe('seriesFromRecords', () => {
  it('keeps the key order and labels every point', () => {
    expect(seriesFromRecords({ '2026-10-01': 4, '2026-10-02': null }, 'last-week')).toEqual({
      labels: ['Oct 01', 'Oct 02'],
      datasets: [[4, null]],
    })
  })

  it('gives an empty series when there are no records', () => {
    expect(seriesFromRecords(undefined, 'last-week')).toEqual({ labels: [], datasets: [[]] })
  })
})

describe('visitsMetric', () => {
  it('reads the total, the delta and the normalized series', () => {
    const metric = visitsMetric(
      { records: { '2026-10-01': 10 }, total: 10, previous_total: 5 },
      'last-week',
    )
    expect(metric).toEqual({
      series: { labels: ['Oct 01'], datasets: [[10]] },
      current: 10,
      delta: '100.00%',
    })
  })

  it('has no delta when the total and the previous total are zero', () => {
    expect(visitsMetric({ records: {}, total: 0, previous_total: 0 }, 'last-week').delta).toBeNull()
  })

  it('formats the session total with the given formatter', () => {
    const metric = visitsMetric(
      { records: {}, total: 125, previous_total: 0 },
      'last-week',
      total => secondsToHms(total, TIME_UNITS),
    )
    expect(metric.current).toBe('2min 5sec')
    expect(metric.series).toEqual({ labels: [' ', ' '], datasets: [[0, 0]] })
  })

  it('falls back to zero with no delta when the report is missing', () => {
    expect(visitsMetric(null, 'last-week')).toEqual({
      series: { labels: [' ', ' '], datasets: [[0, 0]] },
      current: 0,
      delta: null,
    })
  })
})

describe('bandwidthMetric', () => {
  it('reads the total in units and the series', () => {
    const metric = bandwidthMetric({ records: { '2026-10-01': 2048 }, total: 2048 }, 'last-week', SIZE_UNITS)
    expect(metric.current).toBe('2 KB')
    expect(metric.series).toEqual({ labels: ['Oct 01'], datasets: [[2048]] })
  })

  it('has no current value when the report is missing', () => {
    expect(bandwidthMetric(null, 'last-week', SIZE_UNITS).current).toBeNull()
  })
})
