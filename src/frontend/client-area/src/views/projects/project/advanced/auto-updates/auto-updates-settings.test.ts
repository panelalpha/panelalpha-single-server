import type { AutoUpdatesSettings } from './auto-updates.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import {
  AUTO_UPDATE_OPTIONS,
  hasWordpressAutoUpdates,
  isPluginsPartial,
  selectBody,
  toggleBody,
  updaterBlockedBy,
} from './auto-updates-settings'

const FULL: AutoUpdatesSettings = { auto_update: 2, auto_update_plugins: 1, auto_update_themes: 0 }

describe('AUTO_UPDATE_OPTIONS', () => {
  it('lists latest (1) then minor (2) with legacy label keys', () => {
    expect(AUTO_UPDATE_OPTIONS).toEqual([
      { value: 1, labelKey: 'heading.instance.advanced.autoUpdates.upgrade.option.latest' },
      { value: 2, labelKey: 'heading.instance.advanced.autoUpdates.upgrade.option.minor' },
    ])
  })
})

describe('hasWordpressAutoUpdates', () => {
  it('is true only when can_auto_updates.wordpress is truthy', () => {
    expect(hasWordpressAutoUpdates({ wordpress: true })).toBe(true)
    expect(hasWordpressAutoUpdates({ wordpress: false })).toBe(false)
  })

  it('is false when the field is missing, null or undefined', () => {
    expect(hasWordpressAutoUpdates({})).toBe(false)
    expect(hasWordpressAutoUpdates(null)).toBe(false)
    expect(hasWordpressAutoUpdates(undefined)).toBe(false)
  })

  it('accepts the InstanceResource field type', () => {
    const resource = { auto_updates: { wordpress: true } } as Pick<InstanceResource, 'auto_updates'>

    expect(hasWordpressAutoUpdates(resource.auto_updates)).toBe(true)
  })
})

describe('toggleBody', () => {
  it('reverses auto_update and keeps the other fields', () => {
    expect(toggleBody(FULL, 'auto_update')).toEqual({ auto_update: 0, auto_update_plugins: 1, auto_update_themes: 0 })
    expect(toggleBody({ ...FULL, auto_update: 0 }, 'auto_update')).toEqual({ auto_update: 1, auto_update_plugins: 1, auto_update_themes: 0 })
  })

  it('reverses auto_update_plugins from 0, 1 and undefined', () => {
    expect(toggleBody({ ...FULL, auto_update_plugins: 0 }, 'auto_update_plugins')).toEqual({ auto_update: 2, auto_update_plugins: 1, auto_update_themes: 0 })
    expect(toggleBody({ ...FULL, auto_update_plugins: 1 }, 'auto_update_plugins')).toEqual({ auto_update: 2, auto_update_plugins: 0, auto_update_themes: 0 })
    expect(toggleBody({ ...FULL, auto_update_plugins: undefined }, 'auto_update_plugins')).toEqual({ auto_update: 2, auto_update_plugins: 1, auto_update_themes: 0 })
  })

  it('reverses auto_update_themes from 0, 1 and undefined', () => {
    expect(toggleBody({ ...FULL, auto_update_themes: 0 }, 'auto_update_themes')).toEqual({ auto_update: 2, auto_update_plugins: 1, auto_update_themes: 1 })
    expect(toggleBody({ ...FULL, auto_update_themes: 1 }, 'auto_update_themes')).toEqual({ auto_update: 2, auto_update_plugins: 1, auto_update_themes: 0 })
    expect(toggleBody({ ...FULL, auto_update_themes: undefined }, 'auto_update_themes')).toEqual({ auto_update: 2, auto_update_plugins: 1, auto_update_themes: 1 })
  })

  it('builds the body from an empty state with undefined fields, as legacy does after a failed GET', () => {
    expect(toggleBody({}, 'auto_update')).toEqual({ auto_update: 1, auto_update_plugins: undefined, auto_update_themes: undefined })
    expect(toggleBody({}, 'auto_update_plugins')).toEqual({ auto_update: undefined, auto_update_plugins: 1, auto_update_themes: undefined })
    expect(toggleBody({}, 'auto_update_themes')).toEqual({ auto_update: undefined, auto_update_plugins: undefined, auto_update_themes: 1 })
  })

  it('does not mutate the settings', () => {
    const settings = { ...FULL }

    toggleBody(settings, 'auto_update')

    expect(settings).toEqual(FULL)
  })
})

describe('selectBody', () => {
  it('sets auto_update to the selected value and keeps the other fields', () => {
    expect(selectBody(FULL, 1)).toEqual({ auto_update: 1, auto_update_plugins: 1, auto_update_themes: 0 })
    expect(selectBody(FULL, 2)).toEqual({ auto_update: 2, auto_update_plugins: 1, auto_update_themes: 0 })
  })

  it('keeps undefined fields as undefined from an empty state', () => {
    expect(selectBody({}, 2)).toEqual({ auto_update: 2, auto_update_plugins: undefined, auto_update_themes: undefined })
  })
})

describe('updaterBlockedBy', () => {
  it('returns the list when updater_blocked_by is an array', () => {
    expect(updaterBlockedBy({ updater_blocked_by: ['WP_AUTO_UPDATE_CORE_MINOR'] })).toEqual(['WP_AUTO_UPDATE_CORE_MINOR'])
  })

  it('returns an empty list when the field is undefined', () => {
    expect(updaterBlockedBy({})).toEqual([])
  })

  it('returns an empty list when the field is a string', () => {
    expect(updaterBlockedBy({ updater_blocked_by: 'WP_AUTO_UPDATE_CORE_MINOR' })).toEqual([])
  })
})

describe('isPluginsPartial', () => {
  it('is true only for plugins === "partial"', () => {
    expect(isPluginsPartial({ plugins: 'partial' })).toBe(true)
    expect(isPluginsPartial({ plugins: 'all' })).toBe(false)
    expect(isPluginsPartial({})).toBe(false)
  })
})
