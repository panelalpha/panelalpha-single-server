import { describe, expect, it } from 'vitest'
import {
  resolveSocialCallbackDestination,
  resolveSocialCallbackFailure,
} from './social-callback-redirect'

describe('resolveSocialCallbackDestination', () => {
  it('routes password_change_required to my-account when admin is undefined', () => {
    expect(resolveSocialCallbackDestination({
      user: { email: 'a@b.c', password_change_required: true },
    })).toEqual({
      path: '/my-account',
      query: { change_password_required: 'true' },
    })
  })

  it('routes two_factor_auth_required to my-account when admin is undefined', () => {
    expect(resolveSocialCallbackDestination({
      user: { email: 'a@b.c', two_factor_auth_required: true },
    })).toEqual({
      path: '/my-account',
      query: { two_factor_auth_required: 'true' },
    })
  })

  it('defaults to /instances without redirect_to or query honor', () => {
    expect(resolveSocialCallbackDestination({
      app: { name: 'PanelAlpha' },
      user: { email: 'a@b.c' },
    } as never)).toEqual({ path: '/instances' })

    expect(resolveSocialCallbackDestination({
      user: { email: 'a@b.c' },
    })).toEqual({ path: '/instances' })
  })

  it('routes to /projects when single_server is active (app-lite)', () => {
    expect(resolveSocialCallbackDestination({
      app: { name: 'PanelAlpha', single_server: { active: true } },
      user: { email: 'a@b.c' },
    })).toEqual({ path: '/projects' })
  })

  it('routes to /instances when single_server is inactive or missing', () => {
    expect(resolveSocialCallbackDestination({
      app: { name: 'PanelAlpha', single_server: { active: false } },
      user: { email: 'a@b.c' },
    })).toEqual({ path: '/instances' })

    expect(resolveSocialCallbackDestination({
      app: { name: 'PanelAlpha' },
      user: { email: 'a@b.c' },
    })).toEqual({ path: '/instances' })
  })

  it('keeps forced my-account redirect ahead of /projects', () => {
    expect(resolveSocialCallbackDestination({
      app: { name: 'PanelAlpha', single_server: { active: true } },
      user: { email: 'a@b.c', password_change_required: true },
    })).toEqual({
      path: '/my-account',
      query: { change_password_required: 'true' },
    })
  })

  it('skips forced flags when admin payload is present (parity with login-redirect)', () => {
    expect(resolveSocialCallbackDestination({
      admin: { id: 1 },
      user: { email: 'a@b.c', password_change_required: true },
    })).toEqual({ path: '/instances' })

    expect(resolveSocialCallbackDestination({
      admin: { id: 1 },
      user: { email: 'a@b.c', two_factor_auth_required: true },
    })).toEqual({ path: '/instances' })
  })
})

describe('resolveSocialCallbackFailure', () => {
  it('maps account_already_exists to login query', () => {
    expect(resolveSocialCallbackFailure({
      response: { data: { error_type: 'account_already_exists' } },
    })).toEqual({
      path: '/login',
      query: { account_already_exists: 'true' },
    })
  })

  it('maps generic response errors to plain /login', () => {
    expect(resolveSocialCallbackFailure({
      response: { data: { error_type: 'other' }, status: 500 },
    })).toEqual({ path: '/login' })

    expect(resolveSocialCallbackFailure({
      response: { data: {}, status: 422 },
    })).toEqual({ path: '/login' })
  })

  it('is null-safe when response is missing', () => {
    expect(resolveSocialCallbackFailure(new Error('network'))).toEqual({ path: '/login' })
    expect(resolveSocialCallbackFailure({ response: null })).toEqual({ path: '/login' })
    expect(resolveSocialCallbackFailure({ response: undefined })).toEqual({ path: '/login' })
    expect(resolveSocialCallbackFailure(null)).toEqual({ path: '/login' })
    expect(resolveSocialCallbackFailure(undefined)).toEqual({ path: '/login' })
  })
})
