import type * as SessionApi from '@/shared/session/session.api'
import type { DOMWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/app/router'
import { getErrorMessage } from '@/shared/api/error-message'
import { acceptInvitation } from '@/shared/session/session.api'
import { useSessionStore } from '@/shared/session/session.store'
import { type FormRules, useFormRules } from '@/shared/ui/form/use-form-rules'
import Loader from '@/shared/ui/loader/Loader.vue'
import { fieldShape } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import AcceptInviteView from './AcceptInviteView.vue'

vi.mock('@/shared/session/session.api', async importOriginal => ({
  ...await importOriginal<typeof SessionApi>(),
  acceptInvitation: vi.fn(),
}))

async function mountAt (url: string, supportLink?: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (supportLink !== undefined) {
    useSessionStore().home = { app: { support_link: supportLink } } as never
  }
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(url)
  await router.isReady()
  const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
  const wrapper = await mountKit(AcceptInviteView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, push }
}

async function mountView (response: Record<string, unknown>) {
  vi.mocked(acceptInvitation).mockResolvedValueOnce(response)
  return mountAt('/accept-invite?token=t')
}

/** First failing message of the panel password policy rules for `value` (the view's own rule array). */
async function policyPasswordRuleMessage (value: string): Promise<string | null> {
  let rules!: FormRules
  const Host = defineComponent({
    setup () {
      rules = useFormRules()
      return () => null
    },
  })
  const host = await mountKit(Host)
  host.unmount()
  for (const rule of rules.policyPasswordRules) {
    const result = rule(value)
    if (result !== true) {
      return result
    }
  }
  return null
}

/** Vuetify validates `validate-on="blur"` only when focus leaves a field that had focus. */
async function focusThenBlur (input: DOMWrapper<HTMLInputElement>) {
  await input.trigger('focus')
  await input.trigger('blur')
  await flushPromises()
}

describe('AcceptInviteView', () => {
  beforeEach(() => {
    vi.mocked(acceptInvitation).mockReset()
  })

  it('renders nothing while the invitation is checked and posts the token once', async () => {
    vi.mocked(acceptInvitation).mockReturnValueOnce(new Promise(() => {}))
    const { wrapper } = await mountAt('/accept-invite?token=t')

    expect(wrapper.find('[data-testid="auth-card"]').exists()).toBe(false)
    expect(acceptInvitation).toHaveBeenCalledExactlyOnceWith('t')
    wrapper.unmount()
  })

  it('shows the invalid-invitation card on a rejection', async () => {
    vi.mocked(acceptInvitation).mockRejectedValueOnce(new Error('422'))
    const { wrapper } = await mountAt('/accept-invite?token=bad')

    expect(wrapper.get('[data-testid="auth-title"]').text()).toBe('heading.acceptInvitePage.error.title')
    expect(wrapper.get('[data-testid="accept-invite-info"]').text()).toBe('heading.acceptInvitePage.error.info')
    wrapper.unmount()
  })

  it('posts an undefined token without ?token and shows the card with no next step', async () => {
    vi.mocked(acceptInvitation).mockRejectedValueOnce(new Error('422'))
    const { wrapper, push } = await mountAt('/accept-invite')

    expect(acceptInvitation).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(wrapper.get('[data-testid="auth-title"]').text()).toBe('heading.acceptInvitePage.error.title')
    expect(wrapper.get('[data-testid="accept-invite-info"]').text()).toBe('heading.acceptInvitePage.error.info')
    const card = wrapper.get('[data-testid="auth-card"]')
    expect(card.find('a').exists()).toBe(false)
    expect(card.find('input').exists()).toBe(false)
    expect(card.find('[data-testid="auth-submit"]').exists()).toBe(false)
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('navigates to /login with the token as a query object on login_required', async () => {
    const { wrapper, push } = await mountView({ login_required: true })

    expect(push).toHaveBeenCalledExactlyOnceWith({ path: '/login', query: { invite_token: 't' } })
    wrapper.unmount()
  })

  it('keeps the button outside the form', async () => {
    const { wrapper } = await mountView({ password_required: true })

    expect(wrapper.get('[data-testid="auth-title"]').text()).toBe('heading.acceptInvitePage.password.title')
    expect(wrapper.find('form [data-testid="auth-submit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="auth-submit"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('gives the submit button and both password fields accessible names', async () => {
    const { wrapper } = await mountView({ password_required: true })

    const button = wrapper.get('[data-testid="auth-submit"]')
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.text()).toBe('button.register')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('tabindex')).not.toBe('-1')

    const fields: [string, string][] = [
      ['auth-field-password', 'form.label.password'],
      ['auth-field-password-confirm', 'form.label.passwordConfirm'],
    ]
    for (const [testId, label] of fields) {
      const id = wrapper.get(`[data-testid="${testId}"] input`).attributes('id')
      expect(id).toBeTruthy()
      expect(wrapper.get(`label[for="${id}"]`).text()).toBe(label)
    }
    wrapper.unmount()
  })

  it('shows one required message under the password field on blur of an empty field', async () => {
    const { wrapper } = await mountView({ password_required: true })

    await focusThenBlur(wrapper.get('[data-testid="auth-field-password"] input'))

    const expected = await policyPasswordRuleMessage('')
    expect(expected).not.toBeNull()
    const messages = wrapper.get('[data-testid="auth-field-password"]').findAll('.v-messages__message')
    expect(messages.map(m => m.text())).toEqual([expected])
    expect(wrapper.get('[data-testid="auth-field-password-confirm"]').findAll('.v-messages__message')).toHaveLength(0)
    expect(acceptInvitation).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('shows the min and max length messages for 5 and 256 characters', async () => {
    const { wrapper } = await mountView({ password_required: true })
    const field = wrapper.get('[data-testid="auth-field-password"] input')

    await field.setValue('a'.repeat(5))
    await focusThenBlur(field)
    await flushPromises()
    const minExpected = await policyPasswordRuleMessage('a'.repeat(5))
    expect(minExpected).not.toBeNull()
    expect(wrapper.get('[data-testid="auth-field-password"]').findAll('.v-messages__message').map(m => m.text())).toEqual([minExpected])

    await field.setValue('a'.repeat(256))
    await focusThenBlur(field)
    await flushPromises()
    const maxExpected = await policyPasswordRuleMessage('a'.repeat(256))
    expect(maxExpected).not.toBeNull()
    expect(maxExpected).not.toBe(minExpected)
    expect(wrapper.get('[data-testid="auth-field-password"]').findAll('.v-messages__message').map(m => m.text())).toEqual([maxExpected])
    wrapper.unmount()
  })

  it('shows no message for two different passwords of valid length (no match check)', async () => {
    const { wrapper } = await mountView({ password_required: true })

    const first = wrapper.get('[data-testid="auth-field-password"] input')
    await first.setValue('Secret12!')
    await focusThenBlur(first)
    const second = wrapper.get('[data-testid="auth-field-password-confirm"] input')
    await second.setValue('Other-pass1!')
    await focusThenBlur(second)

    expect(wrapper.findAll('.v-messages__message')).toHaveLength(0)
    wrapper.unmount()
  })

  it('sends no request when the fields are invalid', async () => {
    const { wrapper } = await mountView({ password_required: true })

    await wrapper.get('[data-testid="auth-submit"]').trigger('click')
    await flushPromises()

    expect(acceptInvitation).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.v-messages__message')).toHaveLength(2)
    wrapper.unmount()
  })

  it('sends no request on Enter in a field', async () => {
    const { wrapper } = await mountView({ password_required: true })

    const field = wrapper.get('[data-testid="auth-field-password"] input')
    await field.setValue('Secret12!')
    await field.trigger('keydown.enter')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(acceptInvitation).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('posts both passwords and goes to /login on success', async () => {
    const { wrapper, push } = await mountView({ password_required: true })
    vi.mocked(acceptInvitation).mockResolvedValueOnce({})

    await wrapper.get('[data-testid="auth-field-password"] input').setValue('Secret12!')
    await wrapper.get('[data-testid="auth-field-password-confirm"] input').setValue('Other-pass1!')
    await wrapper.get('[data-testid="auth-submit"]').trigger('click')
    await flushPromises()

    expect(acceptInvitation).toHaveBeenLastCalledWith('t', {
      password: 'Secret12!',
      password_confirmation: 'Other-pass1!',
    })
    expect(push).toHaveBeenCalledExactlyOnceWith({ path: '/login' })
    wrapper.unmount()
  })

  it('shows the server error in the error box', async () => {
    const { wrapper } = await mountView({ password_required: true })
    vi.mocked(acceptInvitation).mockRejectedValueOnce(new Error('Network Error'))

    await wrapper.get('[data-testid="auth-field-password"] input').setValue('Secret1!')
    await wrapper.get('[data-testid="auth-field-password-confirm"] input').setValue('Secret1!')
    await wrapper.get('[data-testid="auth-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="auth-error"]').text()).not.toBe('')
    wrapper.unmount()
  })

  describe('server error (phase 7)', () => {
    const SUPPORT = 'https://support.example.test/ticket'

    /** Fills both fields with valid, different passwords and submits; the next POST rejects with `error`. */
    async function submitRejected (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], error: unknown) {
      vi.mocked(acceptInvitation).mockRejectedValueOnce(error)
      await wrapper.get('[data-testid="auth-field-password"] input').setValue('Secret12!')
      await wrapper.get('[data-testid="auth-field-password-confirm"] input').setValue('Other-pass1!')
      await wrapper.get('[data-testid="auth-submit"]').trigger('click')
      await flushPromises()
    }

    it('shows the server message in a role=alert box with the support link', async () => {
      const serverError = Object.assign(new Error('Request failed'), {
        response: { data: { message: 'Invitation password rejected' } },
      })
      vi.mocked(acceptInvitation).mockResolvedValueOnce({ password_required: true })
      const { wrapper } = await mountAt('/accept-invite?token=t', SUPPORT)

      await submitRejected(wrapper, serverError)

      const alert = wrapper.get('[data-testid="auth-error"]')
      expect(alert.attributes('role')).toBe('alert')
      expect(alert.get('.app-message__title').text()).toBe(getErrorMessage(serverError))
      const link = alert.get('.app-message__text p a.text-info')
      expect(link.attributes('href')).toBe(SUPPORT)
      expect(alert.get('.app-message__text p').text()).toContain('message.support.before')
      wrapper.unmount()
    })

    it('renders no support paragraph without support_link', async () => {
      vi.mocked(acceptInvitation).mockResolvedValueOnce({ password_required: true })
      const { wrapper } = await mountAt('/accept-invite?token=t')

      await submitRejected(wrapper, new Error('Network Error'))

      const alert = wrapper.get('[data-testid="auth-error"]')
      expect(alert.get('.app-message__title').text()).toBe(getErrorMessage(new Error('Network Error')))
      expect(alert.find('.app-message__text p').exists()).toBe(false)
      expect(alert.find('a').exists()).toBe(false)
      wrapper.unmount()
    })

    it('keeps one visible error after two consecutive server errors', async () => {
      const { wrapper } = await mountView({ password_required: true })

      await submitRejected(wrapper, new Error('first'))
      await submitRejected(wrapper, new Error('second'))

      const alerts = wrapper.findAll('[data-testid="auth-error"]')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]!.get('.app-message__title').text()).toBe(getErrorMessage(new Error('second')))
      wrapper.unmount()
    })
  })

  describe('submitting (phase 8)', () => {
    it('shows the loader on the submit button while the POST is pending, without disabled', async () => {
      const { wrapper } = await mountView({ password_required: true })
      let reject!: (error: unknown) => void
      const pending = new Promise((_, rej) => {
        reject = rej
      })
      vi.mocked(acceptInvitation).mockReturnValueOnce(pending)

      await wrapper.get('[data-testid="auth-field-password"] input').setValue('Secret12!')
      await wrapper.get('[data-testid="auth-field-password-confirm"] input').setValue('Other-pass1!')
      await wrapper.get('[data-testid="auth-submit"]').trigger('click')
      await flushPromises()

      const button = wrapper.get('[data-testid="auth-submit"]')
      expect(button.classes()).toContain('v-btn--loading')
      expect(button.attributes('disabled')).toBeUndefined()
      expect(button.get('.v-btn__loader').findComponent(Loader).exists()).toBe(true)

      reject(new Error('Network Error'))
      await flushPromises()

      const after = wrapper.get('[data-testid="auth-submit"]')
      expect(after.classes()).not.toContain('v-btn--loading')
      expect(wrapper.get('[data-testid="auth-error"]').text()).not.toBe('')
      wrapper.unmount()
    })
  })
})

describe('AcceptInviteView fields (kit-form-fields)', () => {
  it('renders both password fields without name and autocomplete', async () => {
    const { wrapper } = await mountView({ password_required: true })

    expect(fieldShape(wrapper.get('[data-testid="auth-field-password"]'))).toEqual({
      name: undefined, autocomplete: undefined, type: 'password', label: 'form.label.password', icon: true,
    })
    expect(fieldShape(wrapper.get('[data-testid="auth-field-password-confirm"]'))).toEqual({
      name: undefined, autocomplete: undefined, type: 'password', label: 'form.label.passwordConfirm', icon: true,
    })
    wrapper.unmount()
  })
})

describe('AcceptInviteView card (kit-auth-card)', () => {
  beforeEach(() => {
    vi.mocked(acceptInvitation).mockReset()
  })

  it('invalid invitation: an h1 title and the info text inside the card', async () => {
    vi.mocked(acceptInvitation).mockRejectedValueOnce(new Error('422'))
    const { wrapper } = await mountAt('/accept-invite?token=bad')

    const card = wrapper.get('[data-testid="auth-card"]')
    expect(card.get('[data-testid="auth-title"]').element.tagName).toBe('H1')
    expect(card.get('[data-testid="accept-invite-info"]').text()).toBe('heading.acceptInvitePage.error.info')
    expect(wrapper.find('[data-testid="auth-bottom-box"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('password step: an h5 title', async () => {
    const { wrapper } = await mountView({ password_required: true })

    const title = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H5')
    expect(title.text()).toBe('heading.acceptInvitePage.password.title')
    wrapper.unmount()
  })
})
