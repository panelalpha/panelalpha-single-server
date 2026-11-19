import { describe, expect, it } from 'vitest'
import { isHeadStacked } from './page-frame'

describe('page-frame', () => {
  it('stacks the title row on xs, and with filters below 976px', () => {
    expect(isHeadStacked({ xs: true, mdAndDown: true }, false)).toBe(true)
    expect(isHeadStacked({ xs: false, mdAndDown: true }, true)).toBe(true)
    expect(isHeadStacked({ xs: false, mdAndDown: true }, false)).toBe(false)
    expect(isHeadStacked({ xs: false, mdAndDown: false }, true)).toBe(false)
  })
})
