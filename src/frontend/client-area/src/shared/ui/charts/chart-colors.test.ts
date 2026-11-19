import { afterEach, describe, expect, it } from 'vitest'
import { chartColor } from './chart-colors'

describe('chartColor', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--v-chart-bandwidth')
    document.documentElement.style.removeProperty('--v-chart-visitors')
    document.documentElement.style.removeProperty('--v-chart-pie-1')
    document.documentElement.style.removeProperty('--v-chart-axis-label')
    document.documentElement.style.removeProperty('--v-chart-grid')
  })

  it('reads the Usage graph axis and grid tokens from the document root', () => {
    document.documentElement.style.setProperty('--v-chart-axis-label', '#797997')
    document.documentElement.style.setProperty('--v-chart-grid', '#DEDEF1')
    expect(chartColor('axis-label')).toBe('#797997')
    expect(chartColor('grid')).toBe('#DEDEF1')
  })

  it('reads the series colour token from the document root', () => {
    document.documentElement.style.setProperty('--v-chart-bandwidth', ' #112233 ')
    document.documentElement.style.setProperty('--v-chart-visitors', '#445566')
    expect(chartColor('bandwidth')).toBe('#112233')
    expect(chartColor('visitors')).toBe('#445566')
  })

  it('reads a pie slice token from the document root', () => {
    document.documentElement.style.setProperty('--v-chart-pie-1', '#778899')
    expect(chartColor('pie-1')).toBe('#778899')
  })

  it('returns an empty string when the token is missing', () => {
    expect(chartColor('visitors')).toBe('')
  })
})
