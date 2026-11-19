import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { emit } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import App from './App.vue'

vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connect: vi.fn(async () => undefined), disconnect: vi.fn() } }))
vi.mock('./shell/notifications/notifications.api', () => ({
  fetchNotifications: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0 } })),
  fetchNotificationsPage: vi.fn(),
  markNotificationsAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
}))

const expired = { id: 1, status: 'active', is_trial: true, trial_expiry_at: '2000-01-01T00:00:00Z', plan_upgrade_link: 'https://example.com/up' }
const home = (services: unknown[]) => ({ app: {}, user: { email: 'a@b.c', services } }) as never

async function setup (meta?: Record<string, unknown>) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' }, meta: meta ?? { displayNavbar: true } }],
  })
  await router.push('/')
  const session = useSessionStore()
  const wrapper = await mountKit(App, {
    global: {
      plugins: [router],
      stubs: {
        AppNavbar: true,
        NewInstanceFloatingButton: true,
        // The footer relays the language switch; a stub keeps the test off `PUT /user/language`.
        AppFooter: { emits: ['language-changed'], template: '<footer data-testid="footer" @click="$emit(\'language-changed\')" />' },
      },
    },
  })
  return { session, wrapper }
}

const modalOpen = () => document.body.querySelector('[data-testid="shell-trial-modal"]') !== null

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('App trial modal', () => {
  it('opens on the first /home hydration with an expired trial', async () => {
    const { session } = await setup()
    expect(modalOpen()).toBe(false)
    session.hydrateHome(home([expired]))
    await nextTick()
    await nextTick()
    expect(modalOpen()).toBe(true)
  })

  it('does not open for a second hydration (sign-in after a cold start without session)', async () => {
    const { session } = await setup()
    session.hydrateHome({ app: {} } as never)
    await nextTick()
    session.hydrateHome(home([expired]))
    await nextTick()
    await nextTick()
    expect(modalOpen()).toBe(false)
  })

  it('does not reopen after the language remount', async () => {
    const { session, wrapper } = await setup()
    session.hydrateHome(home([expired]))
    await nextTick()
    await nextTick()
    expect(modalOpen()).toBe(true)

    // Close through the v-model, then remount `v-app` as the footer's language change does.
    const cancel = [...document.body.querySelectorAll('[data-testid="shell-trial-modal"] button')].find(b => b.textContent?.includes('button.cancel'))
    ;(cancel as HTMLElement).click()
    await new Promise(resolve => setTimeout(resolve, 50))
    await nextTick()
    await wrapper.find('[data-testid="footer"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(modalOpen()).toBe(false)
  })

  it('puts disable-shadow on v-app from style.disableShadows of the theme store', async () => {
    const { session, wrapper } = await setup()
    expect(wrapper.find('.v-application').classes()).not.toContain('disable-shadow')
    session.hydrateHome({ app: { theme: { style: { disableShadows: true, darkMode: false } } } } as never)
    await nextTick()
    expect(wrapper.find('.v-application').classes()).toContain('disable-shadow')
  })

  it('renders the trial bar only on a navbar route and the alert manager always', async () => {
    const { session, wrapper } = await setup()
    session.hydrateHome(home([{ ...expired, trial_expiry_at: '2999-01-01T00:00:00Z' }]))
    await nextTick()
    expect(wrapper.find('[data-testid="shell-trial-info"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="shell-alert-manager"]').exists()).toBe(true)
  })

  it('shows the shell footer to a signed-in user, but not on a route with hideShellFooter (the wizard)', async () => {
    const shown = await setup()
    shown.session.hydrateHome(home([]))
    await nextTick()
    expect(shown.wrapper.find('[data-testid="footer"]').exists()).toBe(true)
    expect(shown.wrapper.find('.v-application').classes()).toContain('has-shell-footer')

    const hidden = await setup({ displayNavbar: false, hideShellFooter: true })
    hidden.session.hydrateHome(home([]))
    await nextTick()
    expect(hidden.wrapper.find('[data-testid="footer"]').exists()).toBe(false)
    expect(hidden.wrapper.find('.v-application').classes()).not.toContain('has-shell-footer')
  })
})

describe('App document title', () => {
  it('recomputes document.title on the document-title-update event', async () => {
    const { session } = await setup()
    session.hydrateHome({ app: { name: 'Before' } } as never)
    await nextTick()
    expect(document.title).toBe('Before')
    session.home!.app.name = 'After'
    emit('document-title-update')
    expect(document.title).toBe('After')
  })
})
