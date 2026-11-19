import { describe, expect, it } from 'vitest'
import { CHECKER_GAP, checkerAnchorBottom, checkerPosition } from './checker-location'

describe('checkerPosition', () => {
  it('puts the hint 8px under the field with the left edges aligned', () => {
    expect(CHECKER_GAP).toBe(8)
    expect(checkerPosition({ left: 486, bottom: 657 })).toEqual({ top: 665, left: 486 })
  })

  it('does not depend on the room left in the window (no flip above the field)', () => {
    expect(checkerPosition({ left: 24, bottom: 790 })).toEqual({ top: 798, left: 24 })
  })
})

describe('checkerAnchorBottom', () => {
  it('is the bottom of the field when no message is shown', () => {
    expect(checkerAnchorBottom(653, [])).toBe(653)
  })

  it('is the bottom of the lowest message, so the hint does not cut it', () => {
    expect(checkerAnchorBottom(653, [668, 688])).toBe(688)
  })
})
