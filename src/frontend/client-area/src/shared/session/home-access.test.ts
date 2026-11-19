import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import { isUserSingleServerAdmin, servicesPageVisible } from './home-access'

function home (user: Record<string, unknown> = {}, app: Record<string, unknown> = {}): HomeResponse {
  return { app, user: { email: 'a@b.c', ...user } } as HomeResponse
}

describe('isUserSingleServerAdmin', () => {
  it('needs single_server.active and user.is_ss_default', () => {
    expect(isUserSingleServerAdmin(home({ is_ss_default: true }, { single_server: { active: true } }))).toBe(true)
    expect(isUserSingleServerAdmin(home({ is_ss_default: false }, { single_server: { active: true } }))).toBe(false)
    expect(isUserSingleServerAdmin(home({ is_ss_default: true }))).toBe(false)
  })

  it('is false on the Community panel and true for community_panel false or absent', () => {
    const ss = { active: true }
    expect(isUserSingleServerAdmin(home({ is_ss_default: true }, { single_server: ss, community_panel: true }))).toBe(false)
    expect(isUserSingleServerAdmin(home({ is_ss_default: true }, { single_server: ss, community_panel: false }))).toBe(true)
    expect(isUserSingleServerAdmin(home({ is_ss_default: true }, { single_server: ss }))).toBe(true)
  })
})

describe('servicesPageVisible', () => {
  it('is true with billing on (ID-56)', () => {
    expect(servicesPageVisible(home({}, { billing_enabled: true, community_panel: true }))).toBe(true)
  })

  it('is true in a paid build with billing off (ID-56)', () => {
    expect(servicesPageVisible(home({}, { billing_enabled: false, community_panel: false }))).toBe(true)
  })

  it('is false on the Community panel with billing off (ID-56)', () => {
    expect(servicesPageVisible(home({}, { billing_enabled: false, community_panel: true }))).toBe(false)
  })

  it('is false while there is no /home (ID-56)', () => {
    expect(servicesPageVisible(null)).toBe(false)
    expect(servicesPageVisible(undefined)).toBe(false)
  })

  it('is false when community_panel is absent and billing is off (ID-56)', () => {
    expect(servicesPageVisible(home({}, { billing_enabled: false }))).toBe(false)
  })
})
