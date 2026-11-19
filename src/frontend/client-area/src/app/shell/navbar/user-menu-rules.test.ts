import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import {
  allowToChangeMode,
  DISCORD_URL,
  hasTrialOrSuspendedService,
  hubNotConnected,
  isFreePanel,
  showMyServerItem,
  showTasksItem,
  supportHref,
  tasksDot,
  userBadge,
  userBadgeWarning,
  userMenuItems,
} from './user-menu-rules'

function home (over: Record<string, unknown> = {}, user: Record<string, unknown> = {}): HomeResponse {
  return { app: { name: 'x', ...over }, user: { email: 'a@b.c', ...user } } as unknown as HomeResponse
}

describe('user-menu-rules', () => {
  it('hasTrialOrSuspendedService: suspended or active trial', () => {
    expect(hasTrialOrSuspendedService(undefined)).toBe(false)
    expect(hasTrialOrSuspendedService([{ status: 'active', is_trial: false }] as never)).toBe(false)
    expect(hasTrialOrSuspendedService([{ status: 'active', is_trial: true }] as never)).toBe(true)
    expect(hasTrialOrSuspendedService([{ status: 'suspended' }] as never)).toBe(true)
    expect(hasTrialOrSuspendedService([{ status: 'terminated', is_trial: true }] as never)).toBe(false)
  })

  it('badge: warning only with billing_enabled and a trial or suspended service', () => {
    const services = [{ status: 'active', is_trial: true }]
    expect(userBadge(home({ billing_enabled: true }, { services }))).toBe('warning')
    expect(userBadge(home({ billing_enabled: false }, { services }))).toBe('')
    expect(userBadge(home({ billing_enabled: true }, { services: [] }))).toBe('')
    expect(userBadge(null)).toBe('')
  })

  it('hubNotConnected: only on a Free panel with hub_paired explicitly false', () => {
    expect(isFreePanel(home({ community_panel: true }))).toBe(true)
    expect(isFreePanel(home())).toBe(false)
    expect(hubNotConnected(home({ community_panel: true, hub_paired: false }))).toBe(true)
    expect(hubNotConnected(home({ community_panel: true, hub_paired: true }))).toBe(false)
    expect(hubNotConnected(home({ community_panel: true }))).toBe(false)
    expect(hubNotConnected(home({ hub_paired: false }))).toBe(false)
    expect(hubNotConnected(null)).toBe(false)
  })

  it('badge: hubNotConnected gives warning, the My Plans dot (userBadgeWarning) stays independent of the Hub', () => {
    const hubOnly = home({ community_panel: true, hub_paired: false })
    expect(userBadge(hubOnly)).toBe('warning')
    expect(userBadgeWarning(hubOnly)).toBe(false)
    const services = [{ status: 'suspended' }]
    const billing = home({ community_panel: true, hub_paired: true, billing_enabled: true }, { services })
    expect(userBadge(billing)).toBe('warning')
    expect(userBadgeWarning(billing)).toBe(true)
    expect(userBadge(home({ community_panel: true, hub_paired: true }))).toBe('')
  })

  it('allowToChangeMode: always on single server, otherwise flag and no admin', () => {
    expect(allowToChangeMode(home({ single_server: { active: true } }), undefined)).toBe(true)
    expect(allowToChangeMode(home({ single_server: { active: true } }) as never, {})).toBe(true)
    expect(allowToChangeMode(home(), { allowToChangeMode: true })).toBe(true)
    expect(allowToChangeMode(home(), { allowToChangeMode: false })).toBe(false)
    expect(allowToChangeMode(home(), undefined)).toBe(false)
    const impersonated = { ...home(), admin: { app_url: 'x' } } as HomeResponse
    expect(allowToChangeMode(impersonated, { allowToChangeMode: true })).toBe(false)
    const impersonatedSs = { ...home({ single_server: { active: true } }), admin: {} } as HomeResponse
    expect(allowToChangeMode(impersonatedSs, undefined)).toBe(true)
  })

  it('menu items keep the legacy order', () => {
    expect(userMenuItems(home(), undefined)).toEqual(['account', 'support', 'logout'])
    expect(userMenuItems(home({ billing_enabled: true }), { allowToChangeMode: true }))
      .toEqual(['dark-mode', 'account', 'plans', 'billing', 'support', 'logout'])
  })

  it('plans on the services page rule, billing on billing_enabled only (ID-56)', () => {
    expect(userMenuItems(home({ community_panel: false, billing_enabled: false }), undefined))
      .toEqual(['account', 'plans', 'support', 'logout'])
    expect(userMenuItems(home({ community_panel: true, billing_enabled: false }), undefined))
      .toEqual(['account', 'tasks', 'settings', 'support', 'logout'])
    expect(userBadgeWarning(home({ community_panel: false, billing_enabled: false }, { services: [{ status: 'suspended' }] }))).toBe(false)
  })

  it('my-server item: single-server with hosting access, second after account', () => {
    const single = { single_server: { active: true } }
    expect(showMyServerItem(home(single, { has_hosting_access: true }))).toBe(true)
    expect(showMyServerItem(home(single, { has_hosting_access: false }))).toBe(false)
    expect(showMyServerItem(home({}, { has_hosting_access: true }))).toBe(false)
    expect(showMyServerItem(null)).toBe(false)
    expect(userMenuItems(home({ ...single, billing_enabled: false }, { has_hosting_access: true }), undefined))
      .toEqual(['dark-mode', 'account', 'my-server', 'support', 'logout'])
    expect(userMenuItems(home({ ...single, community_panel: true }, { has_hosting_access: true }), undefined))
      .toEqual(['dark-mode', 'account', 'my-server', 'tasks', 'settings', 'support', 'logout'])
    expect(userMenuItems(home(single, { has_hosting_access: false }), undefined)).not.toContain('my-server')
    expect(userMenuItems(home({ billing_enabled: true }, { has_hosting_access: true }), undefined)).not.toContain('my-server')
  })

  it('tasks item: only on the Community panel, after account and before plans', () => {
    expect(showTasksItem(home({ community_panel: true }))).toBe(true)
    expect(showTasksItem(home({ community_panel: false }))).toBe(false)
    expect(showTasksItem(home())).toBe(false)
    expect(showTasksItem(null)).toBe(false)
    expect(userMenuItems(home({ community_panel: true, billing_enabled: true }), undefined))
      .toEqual(['account', 'tasks', 'settings', 'plans', 'billing', 'support', 'logout'])
    expect(userMenuItems(home({ billing_enabled: true }), undefined)).not.toContain('tasks')
  })

  it('tasks dot: running tasks only', () => {
    expect(tasksDot(home({ single_server: { has_running_tasks: true } }))).toBe(true)
    expect(tasksDot(home({ single_server: { has_running_tasks: false } }))).toBe(false)
    expect(tasksDot(home())).toBe(false)
    expect(tasksDot(undefined)).toBe(false)
  })

  it('Settings item only on a Free panel, after Tasks (LITE `UserInfoDropdown.vue:99-122`)', () => {
    expect(userMenuItems(home({ community_panel: true, billing_enabled: true }), undefined))
      .toEqual(['account', 'tasks', 'settings', 'plans', 'billing', 'support', 'logout'])
    expect(userMenuItems(home({ community_panel: false }), undefined)).not.toContain('settings')
  })

  it('support href: Discord on single server, otherwise support_link', () => {
    expect(supportHref(home({ single_server: { active: true }, support_link: 'https://s' }))).toBe(DISCORD_URL)
    expect(supportHref(home({ support_link: 'https://s' }))).toBe('https://s')
  })
})
