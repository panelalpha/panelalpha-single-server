import type { HomeResponse } from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/app/router'
import { SSO_PENDING_TEXT } from '@/views/auth/sso/sso-login-flow'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import SsoLoginView from './SsoLoginView.vue'

const token = 'tok-123'

beforeEach(() => {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.append(app)
  window.history.replaceState({}, '', `/sso-login?token=${token}`)
})

afterEach(() => {
  document.querySelector('#app')?.remove()
  window.history.replaceState({}, '', '/')
})

async function mountView (ssoLogin: () => Promise<HomeResponse>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  const spy = vi.spyOn(session, 'ssoLogin').mockImplementation(ssoLogin)
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/sso-login')
  await router.isReady()
  const push = vi.spyOn(router, 'push')
  const wrapper = await mountKit(SsoLoginView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, spy, push }
}

describe('SsoLoginView default state', () => {
  it('shows the pending text without a v-application wrapper while the exchange is pending', async () => {
    const { wrapper } = await mountView(() => new Promise<HomeResponse>(() => {}))

    expect(wrapper.text()).toContain(SSO_PENDING_TEXT)
    expect(wrapper.find('.v-application').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sets data-pre-mount on #app after mount and removes it on unmount', async () => {
    const { wrapper } = await mountView(() => new Promise<HomeResponse>(() => {}))

    const appRoot = document.querySelector('#app')
    expect(appRoot?.hasAttribute('data-pre-mount')).toBe(true)
    wrapper.unmount()
    expect(appRoot?.hasAttribute('data-pre-mount')).toBe(false)
  })

  it('calls ssoLogin exactly once with the token from the query string', async () => {
    const { wrapper, spy } = await mountView(() => new Promise<HomeResponse>(() => {}))

    expect(spy).toHaveBeenCalledExactlyOnceWith(token)
    wrapper.unmount()
  })

  it('keeps the pending text when the flow resolves without a user', async () => {
    const { wrapper } = await mountView(() => Promise.resolve({ app: {} } as never))

    expect(wrapper.text()).toContain(SSO_PENDING_TEXT)
    expect(wrapper.find('.v-application').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('SsoLoginView error state', () => {
  it('renders ErrorPage inside v-application when the exchange is rejected, without navigating', async () => {
    const { wrapper, push } = await mountView(() => Promise.reject(new Error('Request failed with status code 422')))

    expect(wrapper.find('.v-application').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('heading.errorPage.title')
    expect(wrapper.get('h1 + span').text()).toBe('heading.errorPage.subtitle')
    expect(wrapper.text()).not.toContain(SSO_PENDING_TEXT)
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('removes data-pre-mount from #app once the error page is shown', async () => {
    const { wrapper } = await mountView(() => Promise.reject(new Error('Network Error')))

    expect(document.querySelector('#app')?.hasAttribute('data-pre-mount')).toBe(false)
    wrapper.unmount()
  })
})
