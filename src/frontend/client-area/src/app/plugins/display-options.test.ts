import { describe, expect, it } from 'vitest'
import { createVuetify } from 'vuetify'
import { displayOptions } from './display-options'

/** Display flags of a production-configured Vuetify at one viewport width. */
function displayAt (width: number) {
  const vuetify = createVuetify({ display: displayOptions, ssr: { clientWidth: width, clientHeight: 900 } })
  const { display } = vuetify
  return {
    name: display.name.value,
    mobile: display.mobile.value,
    smAndDown: display.smAndDown.value,
    mdAndDown: display.mdAndDown.value,
  }
}

describe('displayOptions', () => {
  it('uses lg as the mobile breakpoint (V2 md 992 minus scrollBarWidth 16 = 976)', () => {
    expect(displayOptions.mobileBreakpoint).toBe('lg')
  })

  it('carries the measured V2 first widths of each breakpoint', () => {
    expect(displayOptions.thresholds).toEqual({ xs: 0, sm: 576, md: 768, lg: 976, xl: 1200 })
  })

  it('leaves xxl unset so the Vuetify default stays', () => {
    expect(displayOptions.thresholds).not.toHaveProperty('xxl')
  })

  // Measured on the legacy deploy: the first width of each state.
  it.each([
    [575, { name: 'xs', mobile: true, smAndDown: true, mdAndDown: true }],
    [576, { name: 'sm', mobile: true, smAndDown: true, mdAndDown: true }],
    [767, { name: 'sm', mobile: true, smAndDown: true, mdAndDown: true }],
    [768, { name: 'md', mobile: true, smAndDown: false, mdAndDown: true }],
    [975, { name: 'md', mobile: true, smAndDown: false, mdAndDown: true }],
    [976, { name: 'lg', mobile: false, smAndDown: false, mdAndDown: false }],
    [1199, { name: 'lg', mobile: false, smAndDown: false, mdAndDown: false }],
    [1200, { name: 'xl', mobile: false, smAndDown: false, mdAndDown: false }],
    [1416, { name: 'xl', mobile: false, smAndDown: false, mdAndDown: false }],
  ])('flags at %ipx match V2', (width, expected) => {
    expect(displayAt(width)).toEqual(expected)
  })
})
