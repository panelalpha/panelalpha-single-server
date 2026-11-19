import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/app/router'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import HubLoginView from './HubLoginView.vue'

async function mountView (setup: (session: ReturnType<typeof useSessionStore>) => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  setup(useSessionStore())
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/hub-login')
  await router.isReady()
  const replace = vi.spyOn(router, 'replace').mockResolvedValue(undefined)
  const wrapper = await mountKit(HubLoginView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, replace }
}

const user = { id: 1 } as never

describe('HubLoginView', () => {
  it('replaces with /instances after a successful exchange and shows the loader', async () => {
    const { wrapper, replace } = await mountView(session => {
      session.home = { user, app: {} } as never
    })

    expect(replace).toHaveBeenCalledExactlyOnceWith({ path: '/instances' })
    expect(wrapper.get('[data-testid="auth-title"]').text()).toBe('button.signInWithPanelAlpha')
    expect(wrapper.find('[data-testid="auth-submit"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('replaces with /projects under single server', async () => {
    const { wrapper, replace } = await mountView(session => {
      session.home = { user, app: { single_server: { active: true } } } as never
    })

    expect(replace).toHaveBeenCalledExactlyOnceWith({ path: '/projects' })
    wrapper.unmount()
  })

  it('replaces with the project page a ticket for one app landed on', async () => {
    const { wrapper, replace } = await mountView(session => {
      session.home = { user, app: { single_server: { active: true } } } as never
      session.hubLoginDestination = '/projects/12'
    })

    expect(replace).toHaveBeenCalledExactlyOnceWith({ path: '/projects/12' })
    wrapper.unmount()
  })

  it('shows the error card when the exchange failed', async () => {
    const { wrapper, replace } = await mountView(session => {
      session.home = { user, app: {} } as never
      session.hubLoginFailed = true
    })

    expect(replace).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="auth-title"]').text()).toBe('button.logIn')
    expect(wrapper.get('[data-testid="hub-login-invalid"]').text()).toBe('heading.hubLoginPage.invalid')
    expect(wrapper.get('[data-testid="auth-submit"]').attributes('href')).toBe('/login')
    wrapper.unmount()
  })

  it('shows the error card without a user', async () => {
    const { wrapper, replace } = await mountView(session => {
      session.home = { app: {} } as never
    })

    expect(replace).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="auth-submit"]').text()).toBe('button.logIn')
    wrapper.unmount()
  })
})

describe('HubLoginView card (kit-auth-card)', () => {
  it('uses an h5 title while signing in and after a failed exchange', async () => {
    const signingIn = await mountView(session => {
      session.home = { user, app: {} } as never
    })
    expect(signingIn.wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]').element.tagName).toBe('H5')
    signingIn.wrapper.unmount()

    const failed = await mountView(session => {
      session.home = { app: {} } as never
    })
    const card = failed.wrapper.get('[data-testid="auth-card"]')
    expect(card.get('[data-testid="auth-title"]').element.tagName).toBe('H5')
    expect(card.find('[data-testid="hub-login-invalid"]').exists()).toBe(true)
    failed.wrapper.unmount()
  })
})
