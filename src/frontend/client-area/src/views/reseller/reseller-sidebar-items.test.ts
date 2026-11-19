import { describe, expect, it } from 'vitest'
import { RESELLER_SIDEBAR_ITEMS } from './reseller-sidebar-items'

describe('RESELLER_SIDEBAR_ITEMS', () => {
  it('keeps the legacy order', () => {
    expect(RESELLER_SIDEBAR_ITEMS.map(item => item.key)).toEqual(['users', 'branding', 'email-settings', 'logs', 'api'])
  })

  it('links every item to /reseller-area/<key>', () => {
    expect(RESELLER_SIDEBAR_ITEMS.map(item => item.to)).toEqual([
      '/reseller-area/users',
      '/reseller-area/branding',
      '/reseller-area/email-settings',
      '/reseller-area/logs',
      '/reseller-area/api',
    ])
  })

  it('uses the legacy heading.reseller.page keys', () => {
    expect(RESELLER_SIDEBAR_ITEMS.map(item => item.titleKey)).toEqual([
      'heading.reseller.page.users',
      'heading.reseller.page.branding',
      'heading.reseller.page.emailSettings',
      'heading.reseller.page.logs',
      'heading.reseller.page.api',
    ])
  })
})
