import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import defaultLogoDarkUrl from '@/shared/ui/assets/logo-white.svg'
import defaultLogoLightUrl from '@/shared/ui/assets/logo.svg'
import {
  activeTabKey,
  hasResellerAreaAccess,
  isInstanceDetails,
  navbarHeight,
  navTabs,
  resolveNavbarLogo,
  showAddNewButton,
  showFloatingButton,
  tabsPlacement,
} from './navbar-rules'

function home (user: Record<string, unknown> = {}, app: Record<string, unknown> = {}): HomeResponse {
  return { app, user: { email: 'a@b.c', ...user } } as HomeResponse
}

const keys = (h: HomeResponse | null) => navTabs(h).map(tab => tab.key)

describe('navTabs', () => {
  it('shows only My instances for a plain user', () => {
    expect(navTabs(home())).toEqual([
      { key: 'my-instances', labelKey: 'heading.navbar.tab.myInstances', route: '/instances/', exact: true },
    ])
  })

  it('adds hosting only for has_hosting_access === true', () => {
    expect(keys(home({ has_hosting_access: true }))).toEqual(['my-instances', 'my-hosting'])
    expect(keys(home({ has_hosting_access: 1 }))).toEqual(['my-instances'])
  })

  it('adds the reseller area when reseller_settings is present and not null (an empty object counts)', () => {
    expect(keys(home({ reseller_settings: {} }))).toEqual(['my-instances', 'reseller-area'])
    expect(keys(home({ reseller_settings: null }))).toEqual(['my-instances'])
    expect(hasResellerAreaAccess(home({ reseller_settings: undefined }))).toBe(true)
    expect(hasResellerAreaAccess({ app: {} } as HomeResponse)).toBe(false)
  })

  it('orders the three tabs as legacy', () => {
    expect(keys(home({ has_hosting_access: true, reseller_settings: {} }))).toEqual(['my-instances', 'my-hosting', 'reseller-area'])
  })

  it('uses the app-lite branches under single_server.active, with no hosting tab (My Server is a user menu item)', () => {
    const tabs = navTabs(home({ has_hosting_access: true }, { single_server: { active: true } }))
    expect(tabs.map(tab => [tab.key, tab.labelKey, tab.route])).toEqual([
      ['my-instances', 'heading.navbar.tab.myProjects', '/projects/'],
      ['connect-ai', 'heading.navbar.tab.connectAi', '/connect-ai'],
    ])
    expect(tabs.at(-1)?.gradient).toBe(true)
  })

  it('has no tabs rules without a home (defensive)', () => {
    expect(keys(null)).toEqual(['my-instances'])
  })
})

describe('activeTabKey', () => {
  const tabs = navTabs(home({ has_hosting_access: true, reseller_settings: {} }))

  it('marks the exact My instances tab only on its own path', () => {
    expect(activeTabKey('/instances', tabs)).toBe('my-instances')
    expect(activeTabKey('/instances/', tabs)).toBe('my-instances')
    expect(activeTabKey('/instances/12', tabs)).toBeNull()
  })

  it('marks My hosting and Reseller area on their subpages', () => {
    expect(activeTabKey('/hosting/', tabs)).toBe('my-hosting')
    expect(activeTabKey('/hosting/summary', tabs)).toBe('my-hosting')
    expect(activeTabKey('/reseller-area/clients', tabs)).toBe('reseller-area')
  })

  it('does not match a path that only starts with the tab path', () => {
    expect(activeTabKey('/hostingx', tabs)).toBeNull()
    expect(activeTabKey('/account', tabs)).toBeNull()
  })
})

describe('isInstanceDetails', () => {
  it('is true below an instance page and false on the list', () => {
    expect(isInstanceDetails('/instances/12/backups', 'instance-backups', false)).toBe(true)
    expect(isInstanceDetails('/instances', 'instances', false)).toBe(false)
    expect(isInstanceDetails('/hosting', 'hosting', false)).toBe(false)
  })

  it('covers /projects only on single-server', () => {
    expect(isInstanceDetails('/projects/3', 'project', true)).toBe(true)
    expect(isInstanceDetails('/projects', 'projects', true)).toBe(false)
    expect(isInstanceDetails('/projects/3', 'project', false)).toBe(false)
  })
})

describe('navbarHeight', () => {
  it('is 100 at smAndDown, 64 on the rest of mobile and 88 on desktop', () => {
    expect(navbarHeight({ smAndDown: true, mobile: true })).toBe(100)
    expect(navbarHeight({ smAndDown: false, mobile: true })).toBe(64)
    expect(navbarHeight({ smAndDown: false, mobile: false })).toBe(88)
  })
})

describe('Add new, FAB and tab placement', () => {
  it('shows Add new on desktop and the FAB on mobile (only with the navbar)', () => {
    expect(showAddNewButton(false)).toBe(true)
    expect(showAddNewButton(true)).toBe(false)
    expect(showFloatingButton(true, true)).toBe(true)
    expect(showFloatingButton(true, false)).toBe(false)
    expect(showFloatingButton(false, true)).toBe(false)
  })

  it('moves the tabs to a second row at smAndDown', () => {
    expect(tabsPlacement(true)).toBe('second-row')
    expect(tabsPlacement(false)).toBe('inline')
  })
})

describe('resolveNavbarLogo', () => {
  const custom = { logo: 'data:image/png;base64,AAA', darkLogo: 'data:image/png;base64,BBB' }

  it('uses the bundled default when no custom logo is set', () => {
    expect(resolveNavbarLogo({}, false)).toBe(defaultLogoLightUrl)
    expect(resolveNavbarLogo({ logo: false }, false)).toBe(defaultLogoLightUrl)
    expect(resolveNavbarLogo({}, true)).toBe(defaultLogoDarkUrl)
  })

  it('picks darkLogo in dark and logo in light; dark without darkLogo falls back to the default', () => {
    expect(resolveNavbarLogo(custom, false)).toBe(custom.logo)
    expect(resolveNavbarLogo(custom, true)).toBe(custom.darkLogo)
    expect(resolveNavbarLogo({ logo: custom.logo }, true)).toBe(defaultLogoDarkUrl)
  })

  it('renders raw SVG markup as a data URL for the img (D4)', () => {
    expect(resolveNavbarLogo({ logo: '<svg></svg>' }, false)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg></svg>')}`)
  })
})
