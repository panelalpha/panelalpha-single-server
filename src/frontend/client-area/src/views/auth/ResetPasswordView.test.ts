import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ResetPasswordView from '@/views/auth/ResetPasswordView.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { resetPassword } from '@/shared/session/session.api'
import { fieldShape } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'

vi.mock('@/shared/session/session.api', () => ({ resetPassword: vi.fn() }))
vi.mock('@/shared/session/session.store', () => ({
  useSessionStore: () => ({
    home: null,
    ensureHome: () => Promise.resolve(),
    remoteAuthCheck: () => Promise.resolve(false),
  }),
}))

const RESET_PATH = '/password-reset/change'

async function mountView () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: RESET_PATH, component: ResetPasswordView },
      { path: '/login', component: { template: '<div />' } },
    ],
  })
  await router.push(`${RESET_PATH}?token=t&email=jane%40example.com`)
  await router.isReady()
  const wrapper = await mountKit(ResetPasswordView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

async function fillPasswords (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], password: string, confirmation: string) {
  const [first, second] = wrapper.findAll('input[type=password]')
  await first!.setValue(password)
  await second!.setValue(confirmation)
  return { first: first!, second: second! }
}

describe('ResetPasswordView', () => {
  beforeEach(() => {
    vi.mocked(resetPassword).mockReset()
  })

  it('sends the raw token and email from the link with both typed passwords on click', async () => {
    vi.mocked(resetPassword).mockResolvedValue({ message: 'Your password has been reset!' })
    const { wrapper } = await mountView()

    await fillPasswords(wrapper, 'Secret123', 'Secret123')
    await wrapper.get('[data-testid=auth-submit]').trigger('click')
    await flushPromises()

    expect(resetPassword).toHaveBeenCalledTimes(1)
    expect(resetPassword).toHaveBeenCalledWith({
      token: 't',
      email: 'jane@example.com',
      password: 'Secret123',
      password_confirmation: 'Secret123',
    })
  })

  it('sends an empty click without validating and sends nothing on Enter', async () => {
    vi.mocked(resetPassword).mockResolvedValue({ message: 'ok' })
    const { wrapper } = await mountView()

    const [first] = wrapper.findAll('input[type=password]')
    await first!.trigger('keydown', { key: 'Enter' })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(resetPassword).not.toHaveBeenCalled()

    await wrapper.get('[data-testid=auth-submit]').trigger('click')
    await flushPromises()

    expect(resetPassword).toHaveBeenCalledTimes(1)
    expect(resetPassword).toHaveBeenCalledWith(expect.objectContaining({
      password: '',
      password_confirmation: '',
    }))
  })

  it('on success adds one success alert with the response message, navigates to /login and keeps the fields', async () => {
    vi.mocked(resetPassword).mockResolvedValue({ message: 'Your password has been reset!' })
    const { wrapper, router } = await mountView()
    const alerts = useAlertsStore()

    const { first, second } = await fillPasswords(wrapper, 'Secret123', 'Secret123')
    await wrapper.get('[data-testid=auth-submit]').trigger('click')
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({
      success: true,
      successMessage: 'Your password has been reset!',
    })
    expect(router.currentRoute.value.path).toBe('/login')
    expect((first.element as HTMLInputElement).value).toBe('Secret123')
    expect((second.element as HTMLInputElement).value).toBe('Secret123')
  })

  it('on a 422 errors.email adds one error alert, does not navigate and keeps the fields', async () => {
    vi.mocked(resetPassword).mockRejectedValue({
      response: { status: 422, data: { message: 'The given data was invalid.', errors: { email: ['This password reset token is invalid.'] } } },
    })
    const { wrapper, router } = await mountView()
    const alerts = useAlertsStore()

    const { first, second } = await fillPasswords(wrapper, 'Secret123', 'Secret123')
    await wrapper.get('[data-testid=auth-submit]').trigger('click')
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]).toMatchObject({
      success: false,
      errorMessage: 'This password reset token is invalid.',
    })
    expect(router.currentRoute.value.path).toBe(RESET_PATH)
    expect((first.element as HTMLInputElement).value).toBe('Secret123')
    expect((second.element as HTMLInputElement).value).toBe('Secret123')
  })

  it('does not block a second click: two clicks make two requests', async () => {
    vi.mocked(resetPassword).mockResolvedValue({ message: 'ok' })
    const { wrapper } = await mountView()

    await fillPasswords(wrapper, 'Secret123', 'Secret123')
    const button = wrapper.get('[data-testid=auth-submit]')
    await button.trigger('click')
    await button.trigger('click')
    await flushPromises()

    expect(resetPassword).toHaveBeenCalledTimes(2)
  })
})

describe('ResetPasswordView password policy', () => {
  /** Vuetify validates `validate-on="blur"` only when focus leaves a field that had focus. */
  async function focusThenBlur (input: { trigger: (event: string) => Promise<void> }) {
    await input.trigger('focus')
    await input.trigger('blur')
    await flushPromises()
  }

  async function messagesOf (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): Promise<string[]> {
    return wrapper.get('[data-testid="auth-field-password"]').findAll('.v-messages__message').map(message => message.text())
  }

  it('states the real rule: 8 characters with both cases, a number and a symbol', async () => {
    const { wrapper } = await mountView()
    const [first] = wrapper.findAll('input[type=password]')

    await first!.setValue('Abc1!ef')
    await focusThenBlur(first!)
    expect(await messagesOf(wrapper)).toEqual(['form.validation.minLength'])

    await first!.setValue('weakpass')
    await focusThenBlur(first!)
    expect(await messagesOf(wrapper)).toEqual(['form.validation.passwordCharacters'])

    await first!.setValue('Weakpass1!')
    await focusThenBlur(first!)
    expect(await messagesOf(wrapper)).toEqual([])
  })
})

describe('ResetPasswordView fields (kit-form-fields)', () => {
  it('renders both password fields without name and autocomplete', async () => {
    const { wrapper } = await mountView()

    expect(fieldShape(wrapper.get('[data-testid="auth-field-password"]'))).toEqual({
      name: undefined, autocomplete: undefined, type: 'password', label: 'form.placeholder.passwordNew', icon: true,
    })
    expect(fieldShape(wrapper.get('[data-testid="auth-field-password-confirm"]'))).toEqual({
      name: undefined, autocomplete: undefined, type: 'password', label: 'form.label.passwordConfirm', icon: true,
    })
    wrapper.unmount()
  })
})

describe('ResetPasswordView card (kit-auth-card)', () => {
  it('has one h1 title and no bottom box', async () => {
    const { wrapper } = await mountView()

    const title = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H1')
    expect(title.text()).toBe('heading.resetPasswordPage.title')
    expect(wrapper.find('[data-testid="auth-bottom-box"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
