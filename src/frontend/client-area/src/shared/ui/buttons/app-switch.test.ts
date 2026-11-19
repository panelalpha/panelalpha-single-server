import { describe, expect, it } from 'vitest'
import { appSwitchDefaults } from './app-switch'

describe('appSwitchDefaults', () => {
  it('toggle sets the settings switch attributes', () => {
    expect(appSwitchDefaults('toggle', [])).toEqual({ color: 'primary', flat: true, hideDetails: true, thumbColor: 'var(--v-white-base)' })
  })

  it('inset sets the form field switch attributes', () => {
    expect(appSwitchDefaults('inset', [])).toEqual({ color: 'primary', inset: true, hideDetails: true, thumbColor: 'var(--v-white-base)' })
  })

  it('no kind sets nothing', () => {
    expect(appSwitchDefaults(undefined, ['class'])).toEqual({})
  })

  it.each([
    ['kebab', ['hide-details']],
    ['camel', ['hideDetails']],
  ])('skips a key the consumer passes in the %s spelling', (_spelling, present) => {
    expect(appSwitchDefaults('inset', present)).toEqual({ color: 'primary', inset: true, thumbColor: 'var(--v-white-base)' })
  })

  it('skips color, flat and thumbColor when the consumer sets them, even to false', () => {
    expect(appSwitchDefaults('toggle', ['color', 'flat', 'thumb-color'])).toEqual({ hideDetails: true })
  })

  it('ignores attributes that are not defaults', () => {
    expect(appSwitchDefaults('toggle', ['class', 'data-testid', 'aria-label'])).toEqual({ color: 'primary', flat: true, hideDetails: true, thumbColor: 'var(--v-white-base)' })
  })

  it('never returns an undefined value', () => {
    for (const kind of ['toggle', 'inset', undefined] as const) {
      for (const present of [[], ['hide-details'], ['color', 'flat', 'inset', 'hideDetails', 'thumbColor']]) {
        expect(Object.values(appSwitchDefaults(kind, present)).includes(undefined)).toBe(false)
      }
    }
  })
})
