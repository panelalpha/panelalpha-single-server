import type * as SessionApi from '@/shared/session/session.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/app/router'
import { fetchHubLoginStartUrl, fetchTwoFactorRecoveryCodes, regenerateTwoFactorRecoveryCodes } from '@/shared/session/session.api'
import { useSessionStore } from '@/shared/session/session.store'
import { fieldShape } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import LoginView from './LoginView.vue'

vi.mock('./login/recaptcha', () => ({
  executeRecaptcha: vi.fn().mockResolvedValue(null),
  hideRecaptchaBadge: vi.fn(),
  loadRecaptchaScript: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/shared/session/session.api', async importOriginal => ({
  ...await importOriginal<typeof SessionApi>(),
  fetchHubLoginStartUrl: vi.fn(),
  fetchTwoFactorRecoveryCodes: vi.fn(),
  regenerateTwoFactorRecoveryCodes: vi.fn(),
}))

async function mountLogin (app: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.home = { app } as never
  vi.spyOn(session, 'ensureHome').mockResolvedValue(undefined as never)
  vi.spyOn(session, 'remoteAuthCheck').mockResolvedValue(false)
  const login = vi.spyOn(session, 'login').mockRejectedValue(new Error('stop'))

  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/login')
  await router.isReady()
  const wrapper = await mountKit(LoginView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, login }
}

describe('LoginView', () => {
  it('sends nothing for an empty email: the field shows the one message', async () => {
    const { wrapper, login } = await mountLogin()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="auth-error"]').exists()).toBe(false)
    const messages = wrapper.get('[data-testid="auth-field-email"]').findAll('.v-messages__message')
    expect(messages.map(message => message.text())).toHaveLength(1)
    expect(messages[0]!.text()).not.toBe('')
    wrapper.unmount()
  })

  it('sends POST /login for a filled email', async () => {
    const { wrapper, login } = await mountLogin()

    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledExactlyOnceWith({ email: 'jane@example.com', remember: false })
    wrapper.unmount()
  })

  it.each([
    ['a bare word', 'plain'],
    ['an empty local-part label', 'a..b@c'],
    ['whitespace after the domain', 'a@b trailing garbage'],
    ['a second @', 'a@b@c.com'],
  ])('posts nothing for %s: the field states the refusal', async (_shape, value) => {
    const { wrapper, login } = await mountLogin()

    await wrapper.get('[data-testid="auth-field-email"] input').setValue(value)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="auth-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="auth-field-password"]').exists()).toBe(false)
    const messages = wrapper.get('[data-testid="auth-field-email"]').findAll('.v-messages__message')
    expect(messages.map(message => message.text())).toEqual(['form.validation.valid'])
    wrapper.unmount()
  })

  it('still sends an address the kit email rule accepts, so the panel has the last word', async () => {
    const { wrapper, login } = await mountLogin()

    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane+tag@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledExactlyOnceWith({ email: 'jane+tag@example.com', remember: false })
    wrapper.unmount()
  })

  it('renders the email field as a plain text input named "email"', async () => {
    const { wrapper } = await mountLogin()

    const input = wrapper.get('[data-testid="auth-field-email"] input')
    expect(input.attributes('name')).toBe('email')
    expect(input.attributes('type')).toBe('text')
    wrapper.unmount()
  })

  it('hides the PanelAlpha sign-in button when the app has no hub_login flag', async () => {
    const { wrapper } = await mountLogin({})

    expect(wrapper.find('[data-testid="auth-hub-login"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('tells the operator when the panel has no account and the setup wizard stays closed', async () => {
    const { wrapper } = await mountLogin({ setup_blocked: true })

    const message = wrapper.get('[data-testid="auth-setup-blocked"]')
    expect(message.text()).toContain('heading.loginPage.setupBlocked.title')
    expect(message.text()).toContain('heading.loginPage.setupBlocked.text')
    wrapper.unmount()
  })

  it('shows no setup notice on the ordinary login page', async () => {
    const { wrapper } = await mountLogin({ setup_required: false, setup_blocked: false })

    expect(wrapper.find('[data-testid="auth-setup-blocked"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the PanelAlpha sign-in button when hub_login is enabled', async () => {
    const { wrapper } = await mountLogin({ hub_login: true })

    const button = wrapper.get('[data-testid="auth-hub-login"]')
    expect(button.text()).toBe('button.signInWithPanelAlpha')
    wrapper.unmount()
  })

  it('starts the hub login on click: calls GET /hub-login/start and shows loading until it answers', async () => {
    let resolveUrl: (url: string) => void = () => {}
    vi.mocked(fetchHubLoginStartUrl).mockReturnValueOnce(new Promise<string>(resolve => {
      resolveUrl = resolve
    }))
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    try {
      const { wrapper } = await mountLogin({ hub_login: true })

      await wrapper.get('[data-testid="auth-hub-login"]').trigger('click')
      await flushPromises()

      expect(fetchHubLoginStartUrl).toHaveBeenCalledOnce()
      expect(wrapper.get('[data-testid="auth-hub-login"]').classes()).toContain('v-btn--loading')

      resolveUrl('https://hub.example.com/login')
      await flushPromises()

      expect(assign).toHaveBeenCalledExactlyOnceWith('https://hub.example.com/login')
      expect(wrapper.get('[data-testid="auth-hub-login"]').classes()).toContain('v-btn--loading')
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shows the error and clears loading when GET /hub-login/start fails', async () => {
    vi.mocked(fetchHubLoginStartUrl).mockRejectedValueOnce(new Error('hub unreachable'))
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    try {
      const { wrapper } = await mountLogin({ hub_login: true })

      await wrapper.get('[data-testid="auth-hub-login"]').trigger('click')
      await flushPromises()

      expect(assign).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="auth-error"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="auth-hub-login"]').classes()).not.toContain('v-btn--loading')
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('LoginView fields (kit-form-fields)', () => {
  it('email step: the email field shape', async () => {
    const { wrapper } = await mountLogin()

    expect(fieldShape(wrapper.get('[data-testid="auth-field-email"]'))).toEqual({
      name: 'email', autocomplete: 'username', type: 'text', label: 'form.label.emailAddress', icon: true,
    })
    wrapper.unmount()
  })

  it('validates the email on blur, not on input', async () => {
    const { wrapper } = await mountLogin()
    const input = wrapper.get('[data-testid="auth-field-email"] input')

    await input.setValue('nope')
    await flushPromises()
    expect(wrapper.get('[data-testid="auth-field-email"]').findAll('.v-messages__message')).toHaveLength(0)

    await input.trigger('focus')
    await input.trigger('blur')
    await flushPromises()
    expect(wrapper.get('[data-testid="auth-field-email"]').findAll('.v-messages__message')).toHaveLength(1)
    wrapper.unmount()
  })

  it('password step: the password field shape and the password in POST /login', async () => {
    const { wrapper, login } = await mountLogin()
    login.mockResolvedValueOnce({ use_password: true } as never)
    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fieldShape(wrapper.get('[data-testid="auth-field-password"]'))).toEqual({
      name: 'password', autocomplete: 'current-password', type: 'password', label: 'form.label.password', icon: true,
    })

    await wrapper.get('[data-testid="auth-field-password"] input').setValue('secret12')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenLastCalledWith({ email: 'jane@example.com', password: 'secret12', remember: false })
    wrapper.unmount()
  })

  it('password step: shows the address it signs in with and goes back to the email step', async () => {
    const { wrapper, login } = await mountLogin()
    login.mockResolvedValueOnce({ use_password: true } as never)
    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="auth-identity"]').text())
      .toBe('heading.loginPage.passwordStep.signingInAs jane@example.com')
    expect(wrapper.get('[data-testid="auth-identity-email"]').text()).toBe('jane@example.com')
    expect(wrapper.find('[data-testid="auth-field-email"]').exists()).toBe(false)

    login.mockRejectedValueOnce({ response: { status: 422, data: { message: 'These credentials do not match our records.' } } })
    await wrapper.get('[data-testid="auth-field-password"] input').setValue('wrong12')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="auth-error"]').text()).toContain('These credentials do not match our records')

    await wrapper.get('[data-testid="auth-secondary"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="auth-field-email"] input').element.value).toBe('jane@example.com')
    expect(wrapper.find('[data-testid="auth-identity"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="auth-error"]').exists()).toBe(false)
    expect(login).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('set-password step: the new password and confirmation shapes', async () => {
    const { wrapper, login } = await mountLogin()
    login.mockResolvedValueOnce({ set_password: true } as never)
    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fieldShape(wrapper.get('[data-testid="auth-field-password"]'))).toEqual({
      name: 'new-password', autocomplete: 'new-password', type: 'password', label: 'form.label.password', icon: true,
    })
    expect(fieldShape(wrapper.get('[data-testid="auth-field-password-confirm"]'))).toEqual({
      name: 'confirm-password', autocomplete: 'new-password', type: 'password', label: 'Confirm Password', icon: true,
    })
    wrapper.unmount()
  })
})

describe('LoginView card (kit-auth-card)', () => {
  it('email step: one h1 title and no bottom box without registration', async () => {
    const { wrapper } = await mountLogin()

    const title = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H1')
    expect(title.text()).toBe('heading.loginPage.login.title')
    expect(wrapper.find('[data-testid="auth-bottom-box"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('email step with registration: the bottom box links to /register', async () => {
    const { wrapper } = await mountLogin({ registration_enabled: true })

    const box = wrapper.get('[data-testid="auth-card"] [data-testid="auth-bottom-box"]')
    expect(box.text()).toContain('heading.loginPage.noAccount')
    const link = box.get('[data-testid="auth-bottom-link"]')
    expect(link.attributes('href')).toBe('/register')
    expect(link.text()).toBe('button.signUp')
    wrapper.unmount()
  })

  it('email step: the focusable elements of the card follow the tab order email, submit, bottom link', async () => {
    const { wrapper } = await mountLogin({ registration_enabled: true })

    const card = wrapper.get('[data-testid="auth-card"]').element
    const order = [...card.querySelectorAll('input, button, a[href]')]
      .map(element => element.closest('[data-testid]')?.dataset.testid)
    expect(order).toEqual(['auth-field-email', 'auth-submit', 'auth-bottom-link'])
    wrapper.unmount()
  })

  it('a login error with support_link shows the support sentence with the link', async () => {
    const { wrapper } = await mountLogin({ support_link: 'https://support.example.test' })

    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const error = wrapper.get('[data-testid="auth-error"]')
    expect(error.attributes('role')).toBe('alert')
    const link = error.get('p a.text-info')
    expect(link.attributes('href')).toBe('https://support.example.test')
    expect(link.text()).toBe('message.support.link')
    expect(error.get('p').text()).toContain('message.support.before')
    expect(error.get('p').text()).toContain('message.support.after')
    wrapper.unmount()
  })

  it('2FA and recovery: h5 titles, Enter sends the code, recovery box with Copy, status warning and a gated Continue', async () => {
    const { wrapper, login } = await mountLogin()
    login.mockResolvedValueOnce({ two_factor: true } as never)
    vi.mocked(regenerateTwoFactorRecoveryCodes).mockResolvedValueOnce(undefined)
    vi.mocked(fetchTwoFactorRecoveryCodes).mockResolvedValueOnce(['ABCD-1234', 'EFGH-5678'])

    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const twoFactorTitle = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(twoFactorTitle.element.tagName).toBe('H5')
    expect(twoFactorTitle.text()).toBe('heading.loginPage.twoFactorAuthentication.title')

    const complete = vi.spyOn(useSessionStore(), 'completeTwoFactor').mockResolvedValue({ app: {} } as never)
    const code = wrapper.get('[data-testid="auth-field-code"] input')
    await code.setValue('RECOVERY-CODE-1')
    await code.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(complete).toHaveBeenCalledExactlyOnceWith({ recovery_code: 'RECOVERY-CODE-1' })
    const recoveryTitle = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(recoveryTitle.element.tagName).toBe('H5')
    expect(recoveryTitle.text()).toBe('heading.loginPage.recoveryCode.title')
    const box = wrapper.get('[data-testid="auth-recovery-code"]')
    expect(box.text()).toContain('ABCD-1234')
    expect(box.text()).toContain('EFGH-5678')
    expect(box.findAll('[data-testid="auth-recovery-copy"]')).toHaveLength(2)
    const warning = wrapper.get('[data-testid="auth-warning"]')
    expect(warning.attributes('role')).toBe('status')
    expect(warning.text()).toContain('heading.loginPage.recoveryCode.alert')
    expect(wrapper.findAll('[data-testid="auth-card"] h4').map(h => h.text())).toEqual(['message.confirmAction'])
    expect(wrapper.get('[data-testid="auth-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="auth-recovery-confirm"] input').setValue(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="auth-submit"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
