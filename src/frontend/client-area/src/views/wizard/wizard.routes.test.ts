import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { wizardRoutes } from './wizard.routes'

function makeRouter (extra: Array<{ path: string, component: object }> = []) {
  return createRouter({ history: createMemoryHistory(), routes: [...wizardRoutes, ...extra] })
}

describe('wizardRoutes', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the start page and both first steps to a guest', () => {
    const router = makeRouter()
    expect(router.resolve('/wizard').meta).toEqual({ requiresAuth: false, displayNavbar: false, hideShellFooter: true, forceLightTheme: true, title: 'setup' })
    // The steps are open to a guest (Hub first, then the account or the server name) but, once the setup is done, only on a Free panel (the guard reads `freePanel`).
    const guestStep = { requiresAuth: false, displayNavbar: false, freePanel: true, hideShellFooter: true, forceLightTheme: true, title: 'setup' }
    expect(router.resolve('/wizard/general-config').meta).toEqual(guestStep)
    expect(router.resolve('/wizard/panelalpha-connect').meta).toEqual(guestStep)
  })

  it('asks for the signed-in admin on a Free panel at Summary', () => {
    const router = makeRouter()
    const meta = { requiresAuth: true, displayNavbar: false, freePanel: true, hideShellFooter: true, forceLightTheme: true, title: 'setup' }
    expect(router.resolve('/wizard/summary').meta).toEqual(meta)
  })

  it('asks for the signed-in admin on a Free panel at Connect AI', () => {
    const router = makeRouter()
    const meta = { requiresAuth: true, displayNavbar: false, freePanel: true, hideShellFooter: true, forceLightTheme: true, title: 'setup' }
    expect(router.resolve('/wizard/connect-ai').meta).toEqual(meta)
  })

  it('redirects the old setup addresses to /wizard', async () => {
    const router = makeRouter()
    await router.push('/setup')
    expect(router.currentRoute.value.path).toBe('/wizard')
    await router.push('/setup/summary')
    expect(router.currentRoute.value.path).toBe('/wizard')
  })

  it('leaves /hub-connected open to guests', () => {
    expect(makeRouter().getRoutes().find(route => route.name === 'hub-connected')?.meta).toEqual({ requiresAuth: false })
  })

  it('redirects /hub-connected to step 2 with state and result', async () => {
    const router = makeRouter()
    await router.push('/hub-connected?state=s&result=r')
    expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect')
    expect(router.currentRoute.value.query).toEqual({ state: 's', result: 'r' })
  })

  it('redirects /hub-connected to step 2 without state and result', async () => {
    const router = makeRouter()
    await router.push('/hub-connected')
    expect(router.currentRoute.value.fullPath).toBe('/wizard/panelalpha-connect')
  })

  it('redirects to /settings and removes the key when the pairing started from Settings', async () => {
    window.sessionStorage.setItem('free-hub-return', 'settings')
    const router = makeRouter([{ path: '/settings', component: { template: '<div />' } }])
    await router.push('/hub-connected?state=abc&result=ok')
    expect(router.currentRoute.value.path).toBe('/settings')
    expect(router.currentRoute.value.query).toEqual({ state: 'abc', result: 'ok' })
    expect(window.sessionStorage.getItem('free-hub-return')).toBeNull()
  })

  it('redirects to step 2 when reading sessionStorage throws', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    const router = makeRouter()
    await router.push('/hub-connected?state=abc')
    expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect')
    expect(router.currentRoute.value.query).toEqual({ state: 'abc' })
  })
})
