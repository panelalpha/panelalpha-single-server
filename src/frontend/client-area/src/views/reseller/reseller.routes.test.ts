import type { HomeResponse } from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw, RouterView } from 'vue-router'
import { router, routes } from '@/app/router'
import { resolveAuthGuardRedirect } from '@/app/router/auth-guard'
import { resolvePaidAreaRedirect } from '@/app/router/paid-area-guard'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import { resellerRoutes } from './reseller.routes'

describe('reseller routes', () => {
  it('has the frame at /reseller-area/ redirecting to users with auth, navbar and paid-area meta', () => {
    const frame = resellerRoutes.find(route => route.name === 'reseller-area')!

    expect(frame.path).toBe('/reseller-area/')
    expect(frame.redirect).toBe('/reseller-area/users')
    expect(frame.meta).toEqual({ requiresAuth: true, displayNavbar: true, paidArea: 'reseller-area' })
  })

  it('has all five pages as children in legacy order, with absolute paths, no title and lazy views', () => {
    const frame = resellerRoutes.find(route => route.name === 'reseller-area')!

    expect(frame.children!.map(child => [child.path, child.name])).toEqual([
      ['/reseller-area/users', 'reseller-area-users'],
      ['/reseller-area/branding', 'reseller-area-branding'],
      ['/reseller-area/email-settings', 'reseller-area-email-settings'],
      ['/reseller-area/logs', 'reseller-area-logs'],
      ['/reseller-area/api', 'reseller-area-api'],
    ])
    for (const child of frame.children!) {
      expect(child.meta?.title).toBeUndefined()
      expect(typeof child.component).toBe('function')
    }
    expect(typeof frame.component).toBe('function')
  })
})

// A panel that does not offer the area (`/home` `user.reseller_settings` null) used to mount the page on a direct address and its first
// GET answered 404 under an "Error" banner. The gate sits on the frame record, so all five addresses inherit it.
const RESELLER_PATHS = [
  '/reseller-area/',
  '/reseller-area/users',
  '/reseller-area/branding',
  '/reseller-area/email-settings',
  '/reseller-area/logs',
  '/reseller-area/api',
]

const RESELLER_META = { paidArea: 'reseller-area' }

function home (resellerSettings: unknown = null): HomeResponse {
  return { app: {}, user: { reseller_settings: resellerSettings } } as HomeResponse
}

/** A paid panel's `/home`: the reseller settings are there, so the area is offered. */
const PAID_HOME = home({ brand_name: 'Rita Hosting' })
/** The Community panel's `/home`: the key is there and null, the area is not offered. */
const FREE_HOME = home(null)
/** A signed-out visitor's `/home`: the panel names its edition, there is no `user` at all. */
const PAID_GUEST_HOME: HomeResponse = { app: { community_panel: false }, user: null }
const FREE_GUEST_HOME: HomeResponse = { app: { community_panel: true }, user: null }

function visited (path: string, meta: Record<string, unknown> = RESELLER_META, query = {}, hash = '') {
  return { path, query, hash, matched: [{ meta: { requiresAuth: true } }, { meta }] }
}

describe('resolvePaidAreaRedirect', () => {
  it.each(RESELLER_PATHS)('sends %s of a panel without the area to the not-found page under the same address', path => {
    expect(resolvePaidAreaRedirect(visited(path), FREE_HOME)).toEqual({
      name: 'error',
      params: { pathMatch: path.split('/').filter(segment => segment !== '') },
      query: {},
      hash: '',
      replace: true,
    })
  })

  it('keeps the query and the hash of the address', () => {
    expect(resolvePaidAreaRedirect(visited('/reseller-area/users', RESELLER_META, { page: '2' }, '#list'), FREE_HOME))
      .toMatchObject({ query: { page: '2' }, hash: '#list' })
  })

  it.each(RESELLER_PATHS)('keeps %s on a panel that offers the area', path => {
    expect(resolvePaidAreaRedirect(visited(path), PAID_HOME)).toBeUndefined()
  })

  it.each(RESELLER_PATHS)('leaves %s to the auth guard for a guest of a paid panel', path => {
    expect(resolvePaidAreaRedirect(visited(path), PAID_GUEST_HOME)).toBeUndefined()
  })

  it.each(RESELLER_PATHS)('sends %s of a guest of a Free panel to the not-found page', path => {
    expect(resolvePaidAreaRedirect(visited(path), FREE_GUEST_HOME)).toMatchObject({ name: 'error', replace: true })
  })

  it('keeps every other route', () => {
    expect(resolvePaidAreaRedirect(visited('/projects', {}), FREE_HOME)).toBeUndefined()
    expect(resolvePaidAreaRedirect(visited('/my-account', {}), FREE_HOME)).toBeUndefined()
  })

  it('keeps the navigation while /home is unknown (an offline boot)', () => {
    expect(resolvePaidAreaRedirect(visited('/reseller-area/users'), null)).toBeUndefined()
    expect(resolvePaidAreaRedirect(visited('/reseller-area/users'), undefined)).toBeUndefined()
    expect(resolvePaidAreaRedirect(visited('/reseller-area/users'), {} as HomeResponse)).toBeUndefined()
  })

  it('gives every one of the five addresses of the built route table the paid-area meta', () => {
    const built = createRouter({ history: createMemoryHistory(), routes })

    for (const path of RESELLER_PATHS) {
      const resolved = built.resolve(path)
      expect(resolved.name).not.toBe('error')
      expect(resolved.matched.some(record => record.meta.paidArea === 'reseller-area')).toBe(true)
    }
  })
})

let mounted: string[] = []

function probe (name: string) {
  return defineComponent({
    mounted () {
      mounted.push(name)
    },
    render: () => h('div', { 'data-testid': name }),
  })
}

// The route table the SPA builds, with stub components only: the real frame, the real redirect and the real catch-all record.
function stubbedRoutes (): RouteRecordRaw[] {
  const frame = resellerRoutes[0]!
  return [
    {
      ...frame,
      component: defineComponent({ render: () => h(RouterView) }),
      children: frame.children!.map(child => ({ ...child, component: probe(String(child.name)) }) as RouteRecordRaw),
    } as RouteRecordRaw,
    { path: '/login', name: 'login', component: probe('login') },
    { ...routes.find(record => record.name === 'error')!, component: probe('error') } as RouteRecordRaw,
  ]
}

async function mountAt (path: string, panelHome: HomeResponse | null, signedIn = true) {
  mounted = []
  const testRouter = createRouter({ history: createMemoryHistory(), routes: stubbedRoutes() })
  // The order of `app/router/index.ts`: the area gate decides before the auth gate asks for a user.
  testRouter.beforeEach(to => resolvePaidAreaRedirect(to, panelHome) ?? resolveAuthGuardRedirect(to, signedIn))
  await mountKit({ render: () => h(RouterView) }, { global: { plugins: [testRouter] } })
  await testRouter.push(path)
  await flushPromises()
  return testRouter
}

describe('a Reseller Area address of a panel without the area', () => {
  it.each(RESELLER_PATHS)('lands on the not-found page at %s and mounts no Reseller Area page', async path => {
    const testRouter = await mountAt(path, FREE_HOME)

    // `/reseller-area/` redirects to its first page before the guard runs, as the frame asks.
    const expected = path === '/reseller-area/' ? '/reseller-area/users' : path
    expect(testRouter.currentRoute.value.name).toBe('error')
    expect(testRouter.currentRoute.value.path).toBe(expected)
    expect(testRouter.currentRoute.value.meta).toMatchObject({ requiresAuth: false, displayNavbar: false, title: 'page-not-found' })
    expect(mounted).toEqual(['error'])
  })

  it('does not ask a guest to sign in for a page the panel never serves, as an unknown address does not', async () => {
    const testRouter = await mountAt('/reseller-area/users', FREE_GUEST_HOME, false)

    expect(testRouter.currentRoute.value.name).toBe('error')
    expect(mounted).toEqual(['error'])
  })
})

describe('a Reseller Area address of a panel that offers the area', () => {
  it.each(RESELLER_PATHS.slice(1))('mounts the page at %s', async path => {
    const testRouter = await mountAt(path, PAID_HOME)

    const expected = path.replace('/reseller-area/', 'reseller-area-')
    expect(testRouter.currentRoute.value.name).toBe(expected)
    expect(testRouter.currentRoute.value.path).toBe(path)
    expect(mounted).toEqual([expected])
  })

  it('keeps the guest on the login form with the address to come back to', async () => {
    const testRouter = await mountAt('/reseller-area/users', PAID_GUEST_HOME, false)

    expect(testRouter.currentRoute.value.path).toBe('/login')
    expect(testRouter.currentRoute.value.query.redirect).toBe('/reseller-area/users')
    expect(mounted).not.toContain('reseller-area-users')
  })
})

// The wiring of `app/router/index.ts`: the built router (real records, real guards) decides too.
describe('the built router', () => {
  it('lands a Reseller Area address of a Free panel on the not-found page', async () => {
    setActivePinia(createPinia())
    useSessionStore().hydrateHome(FREE_HOME)

    await router.push('/reseller-area/users')

    expect(router.currentRoute.value.name).toBe('error')
    expect(router.currentRoute.value.path).toBe('/reseller-area/users')
    expect(router.currentRoute.value.meta.title).toBe('page-not-found')
  })

  it('opens the page on a panel that offers the area', async () => {
    setActivePinia(createPinia())
    useSessionStore().hydrateHome(PAID_HOME)

    await router.push('/reseller-area/logs')

    expect(router.currentRoute.value.name).toBe('reseller-area-logs')
  })
})
