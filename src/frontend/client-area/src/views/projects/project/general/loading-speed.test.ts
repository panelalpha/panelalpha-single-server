import { describe, expect, it } from 'vitest'
import { isSpeedDefined, speedColor, speedValue, toPercent } from './loading-speed'

describe('toPercent', () => {
  it('scales a fraction to a percent', () => {
    expect(toPercent(0.87)).toBeCloseTo(87)
    expect(toPercent(1)).toBe(100)
    expect(toPercent(0)).toBe(0)
  })

  it('returns null for a missing or non-numeric score', () => {
    expect(toPercent(null)).toBeNull()
    expect(toPercent(undefined)).toBeNull()
    expect(toPercent(Number.NaN)).toBeNull()
  })
})

describe('speedValue', () => {
  it('returns the number for a known score', () => {
    expect(speedValue(72)).toBe(72)
    expect(speedValue(0)).toBe(0)
  })

  it('returns the unknown mark for null and undefined', () => {
    expect(speedValue(null)).toBe('-')
    expect(speedValue(undefined)).toBe('-')
  })
})

describe('speedColor', () => {
  it('is success from 90 up', () => {
    expect(speedColor(90)).toBe('success')
    expect(speedColor(100)).toBe('success')
  })

  it('is warning from 50 up to 89', () => {
    expect(speedColor(50)).toBe('warning')
    expect(speedColor(89.9)).toBe('warning')
  })

  it('is error below 50', () => {
    expect(speedColor(49)).toBe('error')
    expect(speedColor(0)).toBe('error')
  })

  it('is error for an unknown score (null and undefined)', () => {
    expect(speedColor(null)).toBe('error')
    expect(speedColor(undefined)).toBe('error')
  })
})

describe('isSpeedDefined', () => {
  it('needs both strategies', () => {
    expect(isSpeedDefined({ desktop: 0.9, mobile: 0.5 })).toBe(true)
    expect(isSpeedDefined({ desktop: 0.9, mobile: null })).toBe(false)
    expect(isSpeedDefined({ desktop: null, mobile: 0.5 })).toBe(false)
  })

  it('is false when the score object is missing', () => {
    expect(isSpeedDefined(null)).toBe(false)
    expect(isSpeedDefined(undefined)).toBe(false)
  })
})
