import { describe, expect, it } from 'vitest'
import { darkColors, lightColors, variations } from './theme-colors'

describe('theme colors', () => {
  it('uses the CIELAB shades for dark gray', () => {
    expect(darkColors['gray']).toBe('#333342')
    expect(darkColors['gray-darken-1']).toBe('#1E1E2C')
    expect(darkColors['gray-darken-2']).toBe('#060518')
    expect(darkColors['gray-lighten-1']).toBe('#4A4A59')
    expect(darkColors['gray-lighten-2']).toBe('#626172')
  })

  it('keeps light body and secondary', () => {
    expect(lightColors['body']).toBe('#FFFFFF')
    expect(lightColors['secondary']).toBe('#CBCBDC')
  })

  it('generates variations for gray', () => {
    expect(variations.colors).toContain('gray')
  })
})
