import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { prefetchBootHome, prefetchRouteComponents } from './boot-prefetch'

const Plain = { render: () => null }

function makeRouter (routes: RouteRecordRaw[]) {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('prefetchBootHome', () => {
  const router = makeRouter([
    { path: '/projects', component: Plain },
    { path: '/hub-login', name: 'hub-login', component: Plain },
    { path: '/sso-login', component: Plain, meta: { standalone: true, paidArea: 'admin-area' } },
    { path: '/standalone', component: Plain, meta: { standalone: true } },
    { path: '/:pathMatch(.*)*', component: Plain },
  ])

  it('starts GET /home for an ordinary first URL', () => {
    const fetchHome = vi.fn(() => Promise.resolve())
    expect(prefetchBootHome(router, '/projects?page=2#x', fetchHome)).toBe(true)
    expect(fetchHome).toHaveBeenCalledTimes(1)
  })

  it('skips /hub-login (the ticket POST goes first) and a plain standalone route', () => {
    const fetchHome = vi.fn(() => Promise.resolve())
    expect(prefetchBootHome(router, '/hub-login#ticket=abc', fetchHome)).toBe(false)
    expect(prefetchBootHome(router, '/standalone', fetchHome)).toBe(false)
    expect(fetchHome).not.toHaveBeenCalled()
  })

  it('starts GET /home for a standalone route whose edition decides it', () => {
    const fetchHome = vi.fn(() => Promise.resolve())
    expect(prefetchBootHome(router, '/sso-login?token=t', fetchHome)).toBe(true)
    expect(fetchHome).toHaveBeenCalledTimes(1)
  })

  it('swallows a failed request (the guard asks again)', async () => {
    const fetchHome = vi.fn(() => Promise.reject(new Error('offline')))
    expect(prefetchBootHome(router, '/projects', fetchHome)).toBe(true)
    await Promise.resolve()
    expect(fetchHome).toHaveBeenCalledTimes(1)
  })
})

describe('prefetchRouteComponents', () => {
  it('calls the lazy loaders of every matched record and leaves components alone', async () => {
    const parentLoader = vi.fn(() => Promise.resolve({ default: Plain }))
    const childLoader = vi.fn(() => Promise.resolve({ default: Plain }))
    const functional = Object.assign(() => null, { props: ['x'] })
    const router = makeRouter([
      {
        path: '/p/:id',
        component: parentLoader,
        children: [
          { path: 'general', components: { default: childLoader, side: functional } },
          { path: 'plain', component: Plain },
        ],
      },
    ])

    expect(prefetchRouteComponents(router.resolve('/p/1/general'))).toBe(2)
    await Promise.resolve()
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)

    expect(prefetchRouteComponents(router.resolve('/p/1/plain'))).toBe(1)
  })

  it('does not leak a rejected or throwing loader', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    const throwing = vi.fn(() => {
      throw new Error('sync')
    })
    const router = makeRouter([
      { path: '/a', component: failing },
      { path: '/b', component: throwing as never },
    ])
    expect(prefetchRouteComponents(router.resolve('/a'))).toBe(1)
    expect(prefetchRouteComponents(router.resolve('/b'))).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(failing).toHaveBeenCalledTimes(1)
    expect(throwing).toHaveBeenCalledTimes(1)
  })
})
