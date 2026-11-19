import { describe, expect, it } from 'vitest'
import { SETTINGS_TABS, tabIndex, tabQuery } from './settings-tabs'

describe('settings-tabs', () => {
  it('lists General and Backups', () => {
    expect(SETTINGS_TABS).toEqual(['general', 'backups'])
  })

  it('tabIndex opens General for a missing or unknown tab', () => {
    expect(tabIndex(undefined)).toBe(0)
    expect(tabIndex('general')).toBe(0)
    expect(tabIndex('nope')).toBe(0)
  })

  it('tabIndex opens Backups for ?tab=backups', () => {
    expect(tabIndex('backups')).toBe(1)
    expect(tabIndex(['backups'])).toBe(1)
  })

  it('tabQuery returns null when the URL already says so', () => {
    expect(tabQuery(0, {})).toBeNull()
    expect(tabQuery(0, { state: 'abc' })).toBeNull()
  })

  it('tabQuery puts Backups into the URL and keeps the rest of the query', () => {
    expect(tabQuery(1, {})).toEqual({ tab: 'backups' })
    expect(tabQuery(1, { state: 'abc' })).toEqual({ state: 'abc', tab: 'backups' })
    expect(tabQuery(1, { tab: 'backups' })).toBeNull()
  })

  it('tabQuery drops the tab for General and keeps state and result', () => {
    expect(tabQuery(0, { tab: 'backups', state: 'abc', result: 'ok' })).toEqual({ state: 'abc', result: 'ok' })
  })
})
