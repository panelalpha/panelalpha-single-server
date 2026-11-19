import { describe, expect, it } from 'vitest'
import { activeGroupBase, normalizePickedHex, PREDEFINED_COLOR_GROUPS } from './color-groups'

describe('activeGroupBase', () => {
  it('returns the base of the group whose every key matches', () => {
    expect(activeGroupBase({ ...PREDEFINED_COLOR_GROUPS[2] })).toBe('#448ED6')
  })

  it('ignores letter case', () => {
    const lower = Object.fromEntries(Object.entries(PREDEFINED_COLOR_GROUPS[0]).map(([k, v]) => [k, v.toLowerCase()]))
    expect(activeGroupBase(lower)).toBe('#07C07E')
  })

  it('returns an empty string for a partial match (only the base equals)', () => {
    expect(activeGroupBase({ ...PREDEFINED_COLOR_GROUPS[0], darken1: '#000000' })).toBe('')
  })

  it('returns an empty string when no group matches or the colours are empty', () => {
    expect(activeGroupBase({ base: '#123456', lighten1: '#123456', lighten2: '#123456', lighten4: '#123456', darken1: '#123456' })).toBe('')
    expect(activeGroupBase({})).toBe('')
  })

  it('matches on the keys present in the selection only, as legacy', () => {
    expect(activeGroupBase({ base: '#EF9840', darken1: '#E3903C' })).toBe('#EF9840')
  })
})

describe('normalizePickedHex', () => {
  it('keeps 6 digits upper-case like V2 color.hex and drops alpha', () => {
    expect(normalizePickedHex('#1fd895')).toBe('#1FD895')
    expect(normalizePickedHex('#1fd895ff')).toBe('#1FD895')
  })

  it('passes anything else through', () => {
    expect(normalizePickedHex('rgb(1 2 3)')).toBe('rgb(1 2 3)')
  })
})
