import { describe, expect, it } from 'vitest'
import { resolveAuthGuardRedirect } from '@/app/router/auth-guard'
import { connectAiRoutes } from './connect-ai.routes'

describe('connect-ai route', () => {
  const route = connectAiRoutes.find(item => item.path === '/connect-ai')

  it('registers /connect-ai for the signed-in shell with navbar', () => {
    expect(route).toMatchObject({
      path: '/connect-ai',
      name: 'connect-ai',
      meta: { requiresAuth: true, displayNavbar: true, title: 'connect-ai' },
    })
  })

  it('has no single-server guard of its own (the gate is the navbar tab)', () => {
    expect(route).not.toHaveProperty('beforeEnter')
  })

  it('sends a guest to login with the route as redirect', () => {
    const result = resolveAuthGuardRedirect(
      { fullPath: '/connect-ai', matched: [{ meta: route?.meta ?? {} }] },
      false,
    )
    expect(result).toEqual({ path: '/login', query: { redirect: '/connect-ai' } })
  })

  it('lets a signed-in user through', () => {
    const result = resolveAuthGuardRedirect(
      { fullPath: '/connect-ai', matched: [{ meta: route?.meta ?? {} }] },
      true,
    )
    expect(result).toBe(true)
  })
})
