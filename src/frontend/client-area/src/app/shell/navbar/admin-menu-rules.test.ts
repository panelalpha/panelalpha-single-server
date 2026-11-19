import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import {
  adminActivatorHref,
  adminAppUrl,
  adminHasBadge,
  adminItemHref,
  adminMenuItems,
} from './admin-menu-rules'

const DEFAULT_ADMIN = { app_url: 'https://admin.example.com' }

function home (singleServer: Record<string, unknown> | undefined, user?: Record<string, unknown>, admin?: unknown, noAdmin = false, app: Record<string, unknown> = {}): HomeResponse {
  return {
    app: singleServer ? { ...app, single_server: { active: true, ...singleServer } } : { ...app },
    user: { email: 'a@b.c', ...(user ?? { is_ss_default: true }) },
    ...(noAdmin ? {} : { admin: admin ?? DEFAULT_ADMIN }),
  } as HomeResponse
}

describe('adminAppUrl', () => {
  it('is admin.app_url for the default single-server user', () => {
    expect(adminAppUrl(home({}))).toBe('https://admin.example.com')
  })

  it('is null for a non-default user, a non-single-server app or a missing admin', () => {
    expect(adminAppUrl(home({}, { is_ss_default: false }))).toBeNull()
    expect(adminAppUrl(home(undefined))).toBeNull()
    expect(adminAppUrl(home({}, { is_ss_default: true }, undefined, true))).toBeNull()
  })
})

describe('Free panel', () => {
  it('has no Admin Area: no app url, no item or activator href', () => {
    const free = home({}, undefined, undefined, false, { community_panel: true })
    expect(adminAppUrl(free)).toBeNull()
    expect(adminItemHref(free, { path: '/logs' })).toBeUndefined()
    expect(adminActivatorHref(free, false)).toBeUndefined()
  })
})

describe('adminHasBadge', () => {
  it('shows the dot for running tasks or uncompleted imports', () => {
    expect(adminHasBadge(home({}))).toBe(false)
    expect(adminHasBadge(home({ has_running_tasks: true }))).toBe(true)
    expect(adminHasBadge(home({ has_uncompleted_imports: true }))).toBe(true)
  })
})

describe('adminActivatorHref', () => {
  it('links the activator on desktop only', () => {
    expect(adminActivatorHref(home({}), false)).toBe('https://admin.example.com')
    expect(adminActivatorHref(home({}), true)).toBeUndefined()
  })
})

describe('adminMenuItems', () => {
  it('lists migrations, logs, tasks and configuration with the lite badges', () => {
    const items = adminMenuItems(home({ has_running_tasks: true, has_uncompleted_imports: false }))
    expect(items.map(item => [item.key, item.labelKey, item.badge])).toEqual([
      ['migrations', 'appSingleServer.adminAreaDropdown.migrations', false],
      ['logs', 'appSingleServer.adminAreaDropdown.logs', false],
      ['tasks', 'appSingleServer.adminAreaDropdown.tasks', true],
      ['configuration', 'appSingleServer.adminAreaDropdown.configuration', false],
    ])
    expect(adminMenuItems(home({ has_uncompleted_imports: true }))[0]?.badge).toBe(true)
  })

  it('builds hrefs from admin.app_url', () => {
    const h = home({})
    expect(adminItemHref(h, { path: '/logs' })).toBe('https://admin.example.com/logs')
    expect(adminItemHref(home({}, { is_ss_default: false }), { path: '/logs' })).toBeUndefined()
  })
})
