import { describe, expect, it } from 'vitest'
import { billingRoutes } from './billing.routes'

const billing = billingRoutes.find(route => route.path === '/billing')

describe('billing route entry', () => {
  it('registers /billing as an authenticated route with navbar and title', () => {
    expect(billing).toBeDefined()
    expect(billing?.meta).toMatchObject({
      requiresAuth: true,
      displayNavbar: true,
      title: 'billing',
    })
  })
})
