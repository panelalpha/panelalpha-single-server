import type { DOMWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/app/router'
import { useSessionStore } from '@/shared/session/session.store'
import { fieldShape } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import RegisterView from './RegisterView.vue'

vi.mock('./login/recaptcha', () => ({
  executeRecaptcha: vi.fn().mockResolvedValue(null),
  hideRecaptchaBadge: vi.fn(),
  loadRecaptchaScript: vi.fn().mockResolvedValue(undefined),
}))

async function mountRegister (url = '/register', app: Record<string, unknown> = {}, pending = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.home = { app: { registration_enabled: true, ...app } } as never
  vi.spyOn(session, 'ensureHome').mockResolvedValue(undefined as never)
  const register = vi.spyOn(session, 'register')
  if (pending) {
    register.mockReturnValue(new Promise(() => {}) as never)
  } else {
    register.mockResolvedValue({ set_password: true } as never)
  }

  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(url)
  await router.isReady()
  const wrapper = await mountKit(RegisterView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, register, router }
}

/** Vuetify validates `validate-on="blur"` only when focus leaves a field that had focus. */
async function focusThenBlur (field: DOMWrapper<Element>) {
  const input = field.get('input')
  await input.trigger('focus')
  await input.trigger('blur')
  await flushPromises()
}

describe('RegisterView fields (kit-form-fields)', () => {
  it('email step: the email field shape', async () => {
    const { wrapper } = await mountRegister()

    expect(fieldShape(wrapper.get('[data-testid="auth-field-email"]'))).toEqual({
      name: 'email', autocomplete: 'email', type: 'email', label: 'form.label.emailAddress', icon: true,
    })
    wrapper.unmount()
  })

  it('set-password step after a valid email: the password and confirmation shapes', async () => {
    const { wrapper, register } = await mountRegister()
    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0]![0]).toEqual({ email: 'jane@example.com', password: null })
    expect(fieldShape(wrapper.get('[data-testid="auth-field-password"]'))).toEqual({
      name: 'new-password', autocomplete: 'new-password', type: 'password', label: 'form.label.password', icon: true,
    })
    expect(fieldShape(wrapper.get('[data-testid="auth-field-password-confirm"]'))).toEqual({
      name: 'confirm-password', autocomplete: 'new-password', type: 'password', label: 'form.label.passwordConfirm', icon: true,
    })
    wrapper.unmount()
  })

  it('shows one message under an empty password on blur', async () => {
    const { wrapper } = await mountRegister()
    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    await focusThenBlur(wrapper.get('[data-testid="auth-field-password"]'))
    expect(wrapper.get('[data-testid="auth-field-password"]').findAll('.v-messages__message')).toHaveLength(1)
    expect(wrapper.get('[data-testid="auth-field-password-confirm"]').findAll('.v-messages__message')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('RegisterView card (kit-auth-card)', () => {
  it('form card: one h2 title and a bottom box with the sign-in and reset links', async () => {
    const { wrapper } = await mountRegister()

    const title = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H2')
    expect(title.text()).toBe('heading.registerPage.registerAccount')
    const box = wrapper.get('[data-testid="auth-card"] [data-testid="auth-bottom-box"]')
    expect(box.text()).toContain('heading.registerPage.alreadyRegistered')
    expect(box.findAll('[data-testid="auth-bottom-link"]').map(link => link.attributes('href'))).toEqual(['/login', '/forgot-password'])
    wrapper.unmount()
  })

  it('a register error with support_link shows the support sentence with the link', async () => {
    const { wrapper, register } = await mountRegister('/register', { support_link: 'https://support.example.test' })
    register.mockRejectedValueOnce(new Error('Network Error'))

    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const error = wrapper.get('[data-testid="auth-error"]')
    expect(error.attributes('role')).toBe('alert')
    const link = error.get('p a.text-info')
    expect(link.attributes('href')).toBe('https://support.example.test')
    expect(error.get('p').text()).toContain('message.support.before')
    wrapper.unmount()
  })

  it('quick register: the waiting card with an h2 title and the loader', async () => {
    const { wrapper } = await mountRegister('/register?email=jane%40example.com', {}, true)

    const card = wrapper.get('[data-testid="auth-quick-card"]')
    const title = card.get('[data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H2')
    expect(title.text()).toBe('heading.registerPage.creatingAccount.title')
    expect(card.find('[data-testid="auth-quick-loader-icon"]').exists()).toBe(true)
    expect(card.text()).toContain('heading.registerPage.creatingAccount.text')
    expect(wrapper.find('[data-testid="auth-card"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('RegisterView control-panel-upgrade query', () => {
  it('keeps the token for the tab in sessionStorage and not in localStorage', async () => {
    const key = `${window.location.origin}-token`
    localStorage.clear()
    sessionStorage.clear()

    const { wrapper } = await mountRegister('/register?control-panel-upgrade&token=cp-tok')

    expect(sessionStorage.getItem(key)).toBe('cp-tok')
    expect(localStorage.getItem(key)).toBeNull()
    wrapper.unmount()
    sessionStorage.clear()
  })
})

describe('RegisterView after_register_redirect_url', () => {
  async function submitEmail (wrapper: Awaited<ReturnType<typeof mountRegister>>['wrapper']) {
    await wrapper.get('[data-testid="auth-field-email"] input').setValue('jane@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
  }

  it('follows an internal path through the router', async () => {
    const { wrapper, register, router } = await mountRegister()
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    register.mockResolvedValueOnce({ after_register_redirect_url: '/instances?page=2' } as never)

    await submitEmail(wrapper)

    expect(push).toHaveBeenCalledWith({ path: '/instances', query: { page: '2' } })
    wrapper.unmount()
  })

  it('turns a same-origin absolute URL into its internal route', async () => {
    const { wrapper, register, router } = await mountRegister()
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    const href = window.location.href
    register.mockResolvedValueOnce({ after_register_redirect_url: `${window.location.origin}/instances` } as never)

    await submitEmail(wrapper)

    expect(push).toHaveBeenCalledWith({ path: '/instances', query: undefined })
    expect(window.location.href).toBe(href)
    wrapper.unmount()
  })

  it.each([
    ['another origin', 'https://evil.example/instances'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a protocol-relative URL', '//evil.example/instances'],
    ['a backslash host', String.raw`\\evil.example\instances`],
  ])('ignores %s and keeps the normal after-register navigation', async (_case, url) => {
    const { wrapper, register, router } = await mountRegister()
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    const href = window.location.href
    register.mockResolvedValueOnce({ after_register_redirect_url: url } as never)

    await submitEmail(wrapper)

    expect(push).toHaveBeenCalledWith({ path: '/', query: undefined })
    expect(window.location.href).toBe(href)
    wrapper.unmount()
  })
})
