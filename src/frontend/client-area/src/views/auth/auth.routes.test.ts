import type { RouteLocationNormalized } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { preloadSocialIcons } from '@/shared/ui/icons/socials/lazy-socials'
import { authRoutes } from './auth.routes'

vi.mock('@/shared/ui/icons/socials/lazy-socials', () => ({
  preloadSocialIcons: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/views/auth/LoginView.vue', () => ({ default: { name: 'LoginViewStub', render: () => null } }))
vi.mock('@/views/auth/RegisterView.vue', () => ({ default: { name: 'RegisterViewStub', render: () => null } }))

describe('lazy auth views', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(preloadSocialIcons).mockClear()
  })

  it.each(['login', 'register'])('%s waits for the logos of the enabled providers before the view resolves', async name => {
    useSessionStore().home = { app: { integrations: { auth: ['github', 'google'] } } } as never
    let release: () => void = () => {}
    vi.mocked(preloadSocialIcons).mockReturnValueOnce(new Promise<void>(resolve => {
      release = resolve
    }))
    const loader = authRoutes.find(r => r.name === name)!.component as () => Promise<{ default: unknown }>

    let settled = false
    const loaded = loader().then(view => {
      settled = true
      return view
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    expect(preloadSocialIcons).toHaveBeenCalledWith(['github', 'google'])

    release()
    expect((await loaded).default).toMatchObject({ name: expect.stringContaining('ViewStub') })
  })

  it('keeps every other auth view lazy and free of the logo preload', () => {
    const others = authRoutes.filter(r => r.name !== 'login' && r.name !== 'register')
    expect(others.length).toBeGreaterThan(0)
    expect(others.map(r => typeof r.component)).toEqual(others.map(() => 'function'))
    expect(preloadSocialIcons).not.toHaveBeenCalled()
  })
})

function loginGuard () {
  const route = authRoutes.find(r => r.name === 'login')!
  return route.beforeEnter as (to: RouteLocationNormalized) => Promise<unknown>
}

function location (query: Record<string, string> = {}): RouteLocationNormalized {
  return { query } as unknown as RouteLocationNormalized
}

function registerGuard () {
  const route = authRoutes.find(r => r.name === 'register')!
  return route.beforeEnter as (to: RouteLocationNormalized) => Promise<unknown>
}

describe('register route entry guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is attached to the register route', () => {
    expect(registerGuard()).toBeTypeOf('function')
  })

  it('redirects a logged-in visitor before the form renders', async () => {
    const session = useSessionStore()
    session.home = { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } } as never
    vi.spyOn(session, 'remoteAuthCheck').mockResolvedValue(true)

    await expect(registerGuard()(location({ redirect: '/instances' }))).resolves.toEqual({
      path: '/instances',
      query: undefined,
    })
  })

  it('lets an anonymous visitor reach the form', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'remoteAuthCheck').mockResolvedValue(false)

    await expect(registerGuard()(location())).resolves.toBeUndefined()
  })
})

function forgotPasswordGuard () {
  const route = authRoutes.find(r => r.name === 'forgot-password')!
  return route.beforeEnter as (to: RouteLocationNormalized) => Promise<unknown>
}

describe('forgot-password route entry guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is attached to the forgot-password route', () => {
    expect(forgotPasswordGuard()).toBeTypeOf('function')
  })

  it('redirects a logged-in visitor before the form renders', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'remoteAuthCheck').mockResolvedValue(true)

    await expect(forgotPasswordGuard()(location({ redirect: '/instances' }))).resolves.toBe('/instances')
  })

  it('lets an anonymous visitor reach the form', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'remoteAuthCheck').mockResolvedValue(false)

    await expect(forgotPasswordGuard()(location())).resolves.toBeUndefined()
  })
})

describe('login route entry guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('redirects a logged-in visitor before the form renders', async () => {
    const session = useSessionStore()
    session.home = { app: { name: 'PanelAlpha' }, user: { email: 'a@b.c' } } as never
    vi.spyOn(session, 'remoteAuthCheck').mockResolvedValue(true)

    await expect(loginGuard()(location({ redirect: '/instances' }))).resolves.toEqual({
      path: '/instances',
      query: undefined,
    })
  })

  it('lets an anonymous visitor reach the form', async () => {
    const session = useSessionStore()
    vi.spyOn(session, 'remoteAuthCheck').mockResolvedValue(false)

    await expect(loginGuard()(location())).resolves.toBeUndefined()
  })
})
