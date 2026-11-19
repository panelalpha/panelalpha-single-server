import type { HomeResponse } from '@/shared/session/session.api'
import { describe, expect, it } from 'vitest'
import { resolveSsoLoginDestination } from './sso-login-redirect'

const multi: HomeResponse = { app: {} }
const single: HomeResponse = { app: { single_server: { active: true } } }

describe('resolveSsoLoginDestination', () => {
  it('keeps a safe internal redirect with its query', () => {
    expect(resolveSsoLoginDestination(multi, '/instances/5?tab=x')).toEqual({
      path: '/instances/5',
      query: { tab: 'x' },
    })
  })

  it('falls back for unsafe redirects', () => {
    const unsafe = [
      '//evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      String.raw`/\evil.com`,
      '/\t/evil.com',
      '/..//',
    ]
    for (const bad of unsafe) {
      expect(resolveSsoLoginDestination(multi, bad)).toEqual({ path: '/instances' })
    }
  })

  it('falls back to the base path when redirect is missing or empty', () => {
    expect(resolveSsoLoginDestination(multi, undefined)).toEqual({ path: '/instances' })
    expect(resolveSsoLoginDestination(multi, null)).toEqual({ path: '/instances' })
    expect(resolveSsoLoginDestination(multi, '')).toEqual({ path: '/instances' })
  })

  it('falls back to /projects in single-server mode', () => {
    expect(resolveSsoLoginDestination(single, undefined)).toEqual({ path: '/projects' })
  })

  it('uses the first element of an array query', () => {
    expect(resolveSsoLoginDestination(multi, ['/my-account', '/other'])).toEqual({ path: '/my-account' })
  })
})
