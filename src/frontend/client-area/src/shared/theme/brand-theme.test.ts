import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_COLORS, readStoredTheme } from './brand-theme'

function storage (value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: key => (key === 'theme' ? value : null) }
}

describe('DEFAULT_BRAND_COLORS', () => {
  it('matches the legacy ThemeModule palette', () => {
    expect(DEFAULT_BRAND_COLORS).toEqual({
      base: '#07C07E',
      lighten1: '#1FD895',
      lighten2: '#CDF2E5',
      lighten4: '#E6F9F2',
      darken1: '#0AAA71',
    })
  })
})

describe('readStoredTheme', () => {
  it('returns null without an entry', () => {
    expect(readStoredTheme(storage(null))).toBeNull()
    expect(readStoredTheme(storage(''))).toBeNull()
  })

  it('returns null for invalid JSON and for values that are not objects', () => {
    expect(readStoredTheme(storage('{nope'))).toBeNull()
    expect(readStoredTheme(storage('null'))).toBeNull()
    expect(readStoredTheme(storage('12'))).toBeNull()
    expect(readStoredTheme(storage('[1]'))).toBeNull()
  })

  it('returns null when reading storage throws', () => {
    expect(readStoredTheme({ getItem: () => {
      throw new Error('blocked')
    } })).toBeNull()
  })

  it('parses the stored payload', () => {
    const payload = { colors: { base: '#111111' }, style: { disableShadows: true }, logo: 'data:image/png;base64,AAA' }
    expect(readStoredTheme(storage(JSON.stringify(payload)))).toEqual(payload)
  })
})
