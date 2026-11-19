import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { navTabs } from './navbar-rules'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(here, name), 'utf8')

// Moved from instances-i18n-keys.test.ts with the placeholder navbar: the frame uses legacy keys, never its own.
describe('shell navbar legacy i18n keys', () => {
  it('uses the legacy tab keys through the tab rules', () => {
    const keys = navTabs({
      app: {},
      user: { has_hosting_access: true, reseller_settings: {} },
    }).map(tab => tab.labelKey)
    expect(keys).toEqual([
      'heading.navbar.tab.myInstances',
      'heading.navbar.tab.myHosting',
      'heading.navbar.tab.resellerArea',
    ])
    expect(read('NavbarTopNavigation.vue')).toContain('t(tab.labelKey)')
  })

  it('uses the legacy user-menu keys', () => {
    const userMenu = read('UserInfoDropdown.vue')
    expect(userMenu).toContain(`t('button.account.details')`)
    expect(userMenu).toContain(`t('general.tasks')`)
    expect(userMenu).toContain(`t('general.myPlans')`)
    expect(userMenu).toContain(`t('general.myBilling')`)
    expect(userMenu).toContain(`t('general.support')`)
    expect(userMenu).toContain(`t('button.logout')`)
  })

  it('uses the legacy Add new key and none of the placeholder ones', () => {
    expect(read('AddNewInstanceButton.vue')).toContain(`t('button.addNew')`)
    for (const file of ['AppNavbar.vue', 'NavbarTopNavigation.vue', 'UserInfoDropdown.vue']) {
      expect(read(file)).not.toMatch(/navbar\.soon|navbar\.user\.fallback/)
    }
  })

  it('shows the logo, not home.app.name, as the brand', () => {
    const navbar = read('AppNavbar.vue')
    expect(navbar).toContain('logo-link')
    expect(navbar).not.toContain('app?.name')
  })

  it('uses the lite-only keys by name (single-server branches)', () => {
    const keys = navTabs({ app: { single_server: { active: true } }, user: { has_hosting_access: true } }).map(tab => tab.labelKey)
    expect(keys).toEqual([
      'heading.navbar.tab.myProjects',
      'heading.navbar.tab.connectAi',
    ])
    expect(read('NavbarTopNavigation.vue')).toContain('connect-ai-label')
    const admin = read('AdminAreaDropdown.vue')
    expect(admin).toContain(`t('appSingleServer.adminAreaDropdown.goTo')`)
    expect(admin).toContain(`t('appSingleServer.adminAreaDropdown.shortcuts')`)
    expect(read('admin-menu-rules.ts')).toMatch(/appSingleServer\.adminAreaDropdown/)
    expect(read('UserInfoDropdown.vue')).toContain(`t('general.joinOurCommunity')`)
    expect(read('UserInfoDropdown.vue')).toContain(`t('heading.navbar.tab.myServer')`)
  })
})
