import { describe, expect, it } from 'vitest'
import { usageCardValues } from './server-metrics'

const metrics = {
  cpu_usage_percent: 22.1,
  ram_total: 8 * 1024 * 1024,
  ram_free: 4.4 * 1024 * 1024,
  ram_used: 3.6 * 1024 * 1024,
  ram_usage_percent: 45.01,
  disk_total: 100 * 1024 ** 3,
  disk_free: 38.445 * 1024 ** 3,
  disk_used: 61.555 * 1024 ** 3,
  disk_usage_percent: 61.555,
}

describe('usageCardValues', () => {
  it('is the number 0 for every value before the data arrives', () => {
    expect(usageCardValues(null)).toEqual({
      ramPercent: 0, cpuPercent: 0, diskPercent: 0, ramUsedGb: 0, ramFreeGb: 0, diskUsedGb: 0, diskFreeGb: 0,
    })
  })

  it('rounds percents up', () => {
    const values = usageCardValues(metrics)
    expect(values.cpuPercent).toBe(23)
    expect(values.ramPercent).toBe(46)
    expect(values.diskPercent).toBe(62)
  })

  it('converts RAM from KB and disk from bytes to GB with two decimals', () => {
    const values = usageCardValues(metrics)
    expect(values.ramFreeGb).toBe('4.40')
    expect(values.ramUsedGb).toBe('3.60')
    expect(values.diskFreeGb).toBe('38.45')
    expect(values.diskUsedGb).toBe('61.56')
  })

  it('uses the engine free values and falls back to total minus used', () => {
    expect(usageCardValues(metrics).ramFreeGb).toBe('4.40')
    const { ram_free: _r, disk_free: _d, ...old } = metrics
    const fallback = usageCardValues(old)
    expect(fallback.ramFreeGb).toBe('4.40')
    expect(fallback.diskFreeGb).toBe('38.45')
    expect(usageCardValues({ ...metrics, disk_free: null }).diskFreeGb).toBe('38.45')
    expect(usageCardValues({ ...metrics, ram_used: 9 * 1024 * 1024, ram_free: undefined }).ramFreeGb).toBe('0.00')
  })
})
