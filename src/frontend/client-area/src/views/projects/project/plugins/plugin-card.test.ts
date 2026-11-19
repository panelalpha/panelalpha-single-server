import { describe, expect, it } from 'vitest'
import { pluginCardVariant } from './plugin-card'

describe('pluginCardVariant', () => {
  it('paints an active plugin green', () => {
    expect(pluginCardVariant({ status: 'active', update: null })).toEqual({ green: true, red: false, updateAvailable: false })
  })

  it('paints an active plugin with an update red as well', () => {
    expect(pluginCardVariant({ status: 'active', update: 'available' })).toEqual({ green: true, red: true, updateAvailable: true })
  })

  it('keeps an inactive plugin grey even when an update is waiting', () => {
    expect(pluginCardVariant({ status: 'inactive', update: 'available' })).toEqual({ green: false, red: false, updateAvailable: true })
  })
})
