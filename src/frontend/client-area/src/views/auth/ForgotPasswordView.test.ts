import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ForgotPasswordView from '@/views/auth/ForgotPasswordView.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { forgotPassword } from '@/shared/session/session.api'
import AlertManager from '@/shared/ui/alerts/AlertManager.vue'
import { fieldShape } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'

vi.mock('@/shared/session/session.api', () => ({ forgotPassword: vi.fn() }))
vi.mock('@/shared/session/session.store', () => ({
  useSessionStore: () => ({
    home: null,
    ensureHome: () => Promise.resolve(),
    remoteAuthCheck: () => Promise.resolve(false),
  }),
}))

async function mountView (options: { withAlerts?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/forgot-password', component: ForgotPasswordView },
      { path: '/login', component: { template: '<div />' } },
    ],
  })
  await router.push('/forgot-password')
  await router.isReady()
  // The real alert host: the page's refusals and its success answer are corner alerts.
  const root = options.withAlerts
    ? defineComponent({ render: () => h('div', [h(ForgotPasswordView), h(AlertManager)]) })
    : ForgotPasswordView
  const wrapper = await mountKit(root, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

describe('ForgotPasswordView', () => {
  beforeEach(() => {
    vi.mocked(forgotPassword).mockReset()
  })

  it('clears the field at once and adds the success alert only after the response', async () => {
    let resolve!: (value: { message: string }) => void
    vi.mocked(forgotPassword).mockReturnValue(new Promise(r => {
      resolve = r
    }))
    const wrapper = await mountView()
    const alerts = useAlertsStore()

    const input = wrapper.get('input[name=email]')
    await input.setValue('jane@example.com')
    await wrapper.get('[data-testid=auth-submit]').trigger('click')
    await flushPromises()

    expect(forgotPassword).toHaveBeenCalledWith('jane@example.com')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(alerts.activeAlerts).toHaveLength(0)

    // The panel answers every well-formed address with this one message.
    resolve({ message: 'If an account exists for that e-mail address, we have sent it a link to reset the password.' })
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({
      success: true,
      successMessage: 'If an account exists for that e-mail address, we have sent it a link to reset the password.',
    })
  })

  it('adds one error alert with the first errors.email message of a malformed address', async () => {
    // An unknown address is a 200 now; the only `errors.email` left is the validation error.
    vi.mocked(forgotPassword).mockRejectedValue({
      response: { status: 422, data: { message: 'The email field must be a valid email address.', errors: { email: ['The email field must be a valid email address.'] } } },
    })
    const wrapper = await mountView()
    const alerts = useAlertsStore()

    await wrapper.get('input[name=email]').setValue('jane@example.com')
    await wrapper.get('[data-testid=auth-submit]').trigger('click')
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({
      success: false,
      errorMessage: 'The email field must be a valid email address.',
    })
  })

  it('shows the route\'s throttle refusal on the page instead of staying silent', async () => {
    vi.mocked(forgotPassword).mockRejectedValue({ response: { status: 429, data: { message: 'Too Many Attempts.' } } })
    const wrapper = await mountView({ withAlerts: true })

    await wrapper.get('input[name=email]').setValue('jane@example.com')
    await wrapper.get('[data-testid=auth-submit]').trigger('click')
    await flushPromises()

    const alert = wrapper.get('[data-testid=shell-alert-manager] [role=alert]')
    expect(alert.text()).toContain('Too Many Attempts.')
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'Too Many Attempts.' }])
  })

  it('swallows a failure without a response: no alert and no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      vi.mocked(forgotPassword).mockRejectedValue(new Error('Network Error'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      const input = wrapper.get('input[name=email]')
      await input.setValue('jane@example.com')
      await wrapper.get('[data-testid=auth-submit]').trigger('click')
      await flushPromises()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect((input.element as HTMLInputElement).value).toBe('')
      expect(alerts.activeAlerts).toHaveLength(0)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})

describe('ForgotPasswordView fields (kit-form-fields)', () => {
  it('renders the email field named for autofill', async () => {
    const wrapper = await mountView()

    expect(fieldShape(wrapper.get('[data-testid="auth-field-email"]'))).toMatchObject({
      name: 'email', autocomplete: 'email', type: 'text', label: 'form.label.emailAddress',
    })
    wrapper.unmount()
  })

  it('sends the link on Enter in the email field', async () => {
    vi.mocked(forgotPassword).mockResolvedValue({ message: 'ok' } as never)
    const wrapper = await mountView()
    const input = wrapper.get('input[name=email]')

    await input.setValue('jane@example.com')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(forgotPassword).toHaveBeenCalledExactlyOnceWith('jane@example.com')
    wrapper.unmount()
  })
})

describe('ForgotPasswordView card (kit-auth-card)', () => {
  it('has one h1 title and a sign-in link that goes to /login', async () => {
    const wrapper = await mountView()

    const title = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H1')
    expect(title.text()).toBe('heading.forgotPasswordPage.title')
    expect(wrapper.get('[data-testid="auth-bottom-text"]').text()).toContain('message.falseAlert')
    const link = wrapper.get('[data-testid="auth-bottom-link"]')
    expect(link.attributes('href')).toBe('/login')
    expect(link.text()).toBe('button.signIn')
    await link.trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/login')
    wrapper.unmount()
  })
})
