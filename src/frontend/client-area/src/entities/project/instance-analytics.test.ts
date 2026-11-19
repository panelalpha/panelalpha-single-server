import { describe, expect, it } from 'vitest'
import { areaChartOptions, deltaPercent, nextPeriod, normalizeSeries } from './instance-analytics'

describe('normalizeSeries', () => {
  it('replaces missing or empty data with one pair of zeros and blank labels', () => {
    const empty = { labels: [' ', ' '], datasets: [[0, 0]] }
    expect(normalizeSeries({ labels: [], datasets: [] })).toEqual(empty)
    expect(normalizeSeries({ labels: [], datasets: [[]] })).toEqual(empty)
    expect(normalizeSeries({ labels: ['Jan 01'], datasets: [] })).toEqual(empty)
  })

  it('reads null points as zero and keeps the labels', () => {
    expect(normalizeSeries({ labels: ['Jan 01', 'Jan 02'], datasets: [[null, 4]] })).toEqual({
      labels: ['Jan 01', 'Jan 02'],
      datasets: [[0, 4]],
    })
  })
})

describe('deltaPercent', () => {
  it('shows the change against the previous total with two decimals', () => {
    expect(deltaPercent(150, 100)).toBe('50.00%')
    expect(deltaPercent(75, 100)).toBe('-25.00%')
  })

  it('reads a zero or missing previous total as 100%', () => {
    expect(deltaPercent(10, 0)).toBe('100%')
    expect(deltaPercent(10, null)).toBe('100%')
  })

  it('has no trend when the total and the previous total are both zero or missing', () => {
    expect(deltaPercent(0, 0)).toBeNull()
    expect(deltaPercent(0, null)).toBeNull()
    expect(deltaPercent(0, undefined)).toBeNull()
  })
})

describe('areaChartOptions integer axis', () => {
  const base = { color: '#000', categories: ['a'] }

  it('keeps five ticks without integerMax', () => {
    expect(areaChartOptions(base).yaxis).toMatchObject({ tickAmount: 5 })
  })

  it('gives all zeros an axis of 0 and 1 without fractions', () => {
    expect(areaChartOptions({ ...base, integerMax: 0 }).yaxis).toMatchObject({ min: 0, max: 1, tickAmount: 1, decimalsInFloat: 0 })
  })

  it('has one tick per whole number for a small maximum', () => {
    expect(areaChartOptions({ ...base, integerMax: 3 }).yaxis).toMatchObject({ min: 0, max: 3, tickAmount: 3 })
  })

  it('lets Apex pick a nice integer scale for a larger maximum', () => {
    expect(areaChartOptions({ ...base, integerMax: 12 }).yaxis).toMatchObject({ min: 0, tickAmount: 5, forceNiceScale: true, decimalsInFloat: 0 })
  })
})

describe('areaChartOptions integer labels', () => {
  it('rounds the labels of a custom formatter on an integer axis (maximum 7)', () => {
    const yaxis = areaChartOptions({ color: '#000', categories: ['a'], integerMax: 7, yFormatter: String }).yaxis as { labels: { formatter: (v: number) => string } }
    expect(yaxis.labels.formatter(1.75)).toBe('2')
    expect(yaxis.labels.formatter(3.5)).toBe('4')
  })

  it('leaves the formatter alone without integerMax', () => {
    const yaxis = areaChartOptions({ color: '#000', categories: ['a'], yFormatter: v => `${v}!` }).yaxis as { labels: { formatter: (v: number) => string } }
    expect(yaxis.labels.formatter(1.5)).toBe('1.5!')
  })
})

describe('areaChartOptions', () => {
  it('uses the colour and categories of the card', () => {
    const options = areaChartOptions({ color: '#07C07E', categories: ['Oct 01', 'Oct 02'] })

    expect(options.colors).toEqual(['#07C07E'])
    expect(options.stroke?.colors).toEqual(['#07C07E'])
    expect(options.xaxis?.categories).toEqual(['Oct 01', 'Oct 02'])
  })

  it('leaves the y formatter and minimum width unset when the card has none (Monitoring)', () => {
    const options = areaChartOptions({ color: '#07C07E', categories: [] })
    const yaxis = Array.isArray(options.yaxis) ? options.yaxis[0] : options.yaxis

    expect(yaxis?.labels?.formatter).toBeUndefined()
    expect(yaxis?.labels?.minWidth).toBeUndefined()
  })

  it('passes the y formatter and minimum width through (General)', () => {
    const yFormatter = (value: number) => `${value} s`
    const options = areaChartOptions({ color: '#83CC80', categories: [], yFormatter, yMinWidth: 40 })
    const yaxis = Array.isArray(options.yaxis) ? options.yaxis[0] : options.yaxis

    expect(yaxis?.labels?.formatter).toBe(yFormatter)
    expect(yaxis?.labels?.minWidth).toBe(40)
  })
})

describe('nextPeriod', () => {
  it('ignores the update to the current period (legacy double emit)', () => {
    expect(nextPeriod('last-week', 'last-week')).toBeNull()
  })

  it('returns a different period', () => {
    expect(nextPeriod('last-week', 'last-month')).toBe('last-month')
  })

  it('ignores a value that is not a period', () => {
    expect(nextPeriod('last-week', 'last-decade')).toBeNull()
    expect(nextPeriod('last-week', null)).toBeNull()
  })
})
