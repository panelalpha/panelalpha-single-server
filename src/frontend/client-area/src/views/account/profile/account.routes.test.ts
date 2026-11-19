import { describe, expect, it } from 'vitest'
import { resolveAuthGuardRedirect } from '@/app/router/auth-guard'
import { accountRoutes } from './account.routes'

const myAccount = accountRoutes.find(route => route.path === '/my-account')

describe('my-account route entry', () => {
  it('registers /my-account as an authenticated route with navbar', () => {
    expect(myAccount).toBeDefined()
    expect(myAccount?.meta).toMatchObject({ requiresAuth: true, displayNavbar: true })
  })

  it('redirects a signed-out visitor to login with the my-account redirect', () => {
    expect(resolveAuthGuardRedirect(
      {
        fullPath: '/my-account',
        matched: [{ meta: myAccount?.meta ?? {} }],
      },
      false,
    )).toEqual({
      path: '/login',
      query: { redirect: '/my-account' },
    })
  })
})
