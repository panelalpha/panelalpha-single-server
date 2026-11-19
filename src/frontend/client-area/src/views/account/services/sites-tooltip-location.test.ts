import { describe, expect, it } from 'vitest'
import { tooltipPosition } from './sites-tooltip-location'

const viewport = { width: 375, height: 812 }

describe('tooltipPosition', () => {
  it('centres the tooltip 10px under the activator when it fits', () => {
    expect(tooltipPosition({ left: 150, width: 60, bottom: 200 }, { width: 200, height: 100 }, viewport)).toEqual({ top: 210, left: 80 })
  })

  it('moves up to end 12px above the viewport bottom instead of flipping above the activator', () => {
    expect(tooltipPosition({ left: 150, width: 60, bottom: 640 }, { width: 200, height: 170 }, viewport).top).toBe(630)
  })

  it('keeps 12px to the side edges', () => {
    expect(tooltipPosition({ left: 0, width: 20, bottom: 100 }, { width: 200, height: 50 }, viewport).left).toBe(12)
    expect(tooltipPosition({ left: 340, width: 30, bottom: 100 }, { width: 200, height: 50 }, viewport).left).toBe(163)
  })
})
