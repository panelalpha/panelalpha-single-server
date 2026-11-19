import { describe, expect, it } from 'vitest'
import { routes } from '@/app/router'

describe('services route', () => {
  it('registers /services for the signed-in shell before the catch-all', () => {
    const index = routes.findIndex(route => route.path === '/services')
    expect(index).toBeGreaterThan(-1)
    expect(routes[index]).toMatchObject({
      name: 'services',
      meta: { requiresAuth: true, displayNavbar: true, title: 'services' },
    })
    expect(routes.findIndex(route => route.path.includes('(.*)'))).toBeGreaterThan(index)
  })
})
