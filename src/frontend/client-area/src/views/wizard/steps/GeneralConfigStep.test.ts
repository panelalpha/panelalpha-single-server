import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createFreeSetup, getWizardSettings, saveWizardServerName } from '@/views/wizard/wizard.api'
import { useWizardStore } from '@/views/wizard/wizard.store'
import { getHubStatus } from '@/entities/hub/hub.api'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { fetchCsrfCookie } from '@/shared/session/session.api'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import GeneralConfigStep from './GeneralConfigStep.vue'

vi.mock('@/shared/session/session.api', () => ({ fetchCsrfCookie: vi.fn() }))
vi.mock('@/entities/hub/hub.api', () => ({ getHubStatus: vi.fn() }))
vi.mock('@/views/wizard/wizard.api', () => ({
  createFreeSetup: vi.fn(),
  getWizardSettings: vi.fn(),
  saveWizardServerName: vi.fn(),
}))
vi.mock('@/shared/api/cached-get', () => ({ clearAllCachedGet: vi.fn() }))
vi.mock('@/shared/session/session.store', () => ({ useSessionStore: vi.fn() }))

const session = {
  remoteAuthCheck: vi.fn(),
  ensureHome: vi.fn(),
  user: null as Record<string, unknown> | null,
  home: null as Record<string, unknown> | null,
}

async function mountStep (prepare?: (pinia: ReturnType<typeof createPinia>) => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  prepare?.(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/wizard', component: { template: '<div />' } },
      { path: '/wizard/panelalpha-connect', component: { template: '<div />' } },
      { path: '/wizard/general-config', component: GeneralConfigStep },
      { path: '/wizard/connect-ai', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
    ],
  })
  await router.push('/wizard/general-config')
  await router.isReady()
  const wrapper = await mountKit(GeneralConfigStep, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountStep>>['wrapper']

async function fill (wrapper: Wrapper, overrides: Record<string, string> = {}) {
  const values = {
    'server-name': 'My server',
    'name': 'Ada',
    'email': 'ada@example.com',
    'new-password': 'Secret1!',
    'confirm-password': 'Secret1!',
    ...overrides,
  }
  // Two fields share `autocomplete=new-password`, so the `name` attribute tells them apart.
  for (const [name, value] of Object.entries(values)) {
    await wrapper.get(`input[name=${name}]`).setValue(value)
  }
}

// The router moves on after the form has validated and the request is done, so the path is awaited, not read at once.
async function expectPath (router: Awaited<ReturnType<typeof mountStep>>['router'], path: string) {
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path))
}

async function submit (wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(fetchCsrfCookie).mockReset().mockResolvedValue()
  vi.mocked(createFreeSetup).mockReset().mockResolvedValue()
  vi.mocked(clearAllCachedGet).mockReset()
  session.remoteAuthCheck.mockReset().mockResolvedValue(true)
  session.ensureHome.mockReset().mockResolvedValue({})
  session.user = null
  session.home = { app: { name: 'My server', setup_required: true } }
  vi.mocked(useSessionStore).mockReturnValue(session as unknown as ReturnType<typeof useSessionStore>)
})

describe('GeneralConfigStep', () => {
  it('shows the title, the lead with the Hub link, the five fields and the footer; the server name starts as "My server"', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid="wizard-step-title"]').text()).toBe('Name your server')
    expect(wrapper.text()).toContain('This account works on this server only.')
    expect(wrapper.get('[data-testid="wizard-general-hub-link"]').text()).toBe('Connect with Hub instead')
    for (const name of ['server-name', 'name', 'email', 'new-password', 'confirm-password']) {
      expect(wrapper.find(`input[name=${name}]`).exists()).toBe(true)
    }
    expect((wrapper.get('input[name=server-name]').element as HTMLInputElement).value).toBe('My server')
    expect(wrapper.get('[data-testid="wizard-previous"]').text()).toBe('Back')
    expect(wrapper.get('[data-testid="wizard-next"]').text()).toBe('Continue')
  })

  it('does not post while the form is invalid', async () => {
    const { wrapper, router } = await mountStep()
    await fill(wrapper, { 'email': '', 'new-password': 'short', 'confirm-password': 'other' })
    await submit(wrapper)

    expect(createFreeSetup).not.toHaveBeenCalled()
    expect(fetchCsrfCookie).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/wizard/general-config')
  })

  it('does not post without a server name', async () => {
    const { wrapper } = await mountStep()
    await fill(wrapper, { 'server-name': '  ' })
    await submit(wrapper)

    expect(createFreeSetup).not.toHaveBeenCalled()
  })

  it('creates the account, reads the session again and opens step 2', async () => {
    const { wrapper, router } = await mountStep()
    await fill(wrapper)
    await submit(wrapper)

    expect(fetchCsrfCookie).toHaveBeenCalledTimes(1)
    expect(createFreeSetup).toHaveBeenCalledWith({
      serverName: 'My server',
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Secret1!',
      passwordConfirmation: 'Secret1!',
    })
    expect(clearAllCachedGet).toHaveBeenCalled()
    expect(session.remoteAuthCheck).toHaveBeenCalledTimes(1)
    await expectPath(router, '/wizard/connect-ai')
  })

  it('"Back" goes back to step 1', async () => {
    const { wrapper, router } = await mountStep()
    await wrapper.get('[data-testid="wizard-previous"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect'))
  })

  it('the link of the lead opens step 1', async () => {
    const { wrapper, router } = await mountStep()
    await wrapper.get('[data-testid="wizard-general-hub-link"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect'))
  })

  it('the eye shows and hides the password', async () => {
    const { wrapper } = await mountStep()
    const input = wrapper.get('input[name=new-password]')
    expect(input.attributes('type')).toBe('password')

    await wrapper.get('button[aria-label="Show password"]').trigger('click')
    expect(wrapper.get('input[name=new-password]').attributes('type')).toBe('text')
    expect(wrapper.find('button[aria-label="Hide password"]').exists()).toBe(true)
  })

  describe('save errors', () => {
    it('shows the messages of a 422 in an alert without the field-name prefix (ID-48) and stays on the step', async () => {
      vi.mocked(createFreeSetup).mockRejectedValue({
        response: { status: 422, data: { errors: { email: ['The email has already been taken.'], password: ['Too weak.'] } } },
      })
      const { wrapper, router } = await mountStep()
      await fill(wrapper)
      await submit(wrapper)

      const alert = wrapper.get('[data-testid="wizard-general-error"]')
      expect(alert.text()).toContain('The email has already been taken.')
      expect(alert.text()).toContain('Too weak.')
      expect(router.currentRoute.value.path).toBe('/wizard/general-config')
      expect(session.remoteAuthCheck).not.toHaveBeenCalled()
    })

    it('shows the message of another error', async () => {
      vi.mocked(createFreeSetup).mockRejectedValue({ response: { status: 500, data: { message: 'Server exploded' } } })
      const { wrapper } = await mountStep()
      await fill(wrapper)
      await submit(wrapper)

      expect(wrapper.get('[data-testid="wizard-general-error"]').text()).toBe('Server exploded')
    })

    it('clears the error on the next try', async () => {
      vi.mocked(createFreeSetup).mockRejectedValueOnce({ response: { status: 500, data: { message: 'Server exploded' } } })
      const { wrapper } = await mountStep()
      await fill(wrapper)
      await submit(wrapper)
      expect(wrapper.find('[data-testid="wizard-general-error"]').exists()).toBe(true)

      await submit(wrapper)
      expect(wrapper.find('[data-testid="wizard-general-error"]').exists()).toBe(false)
    })

    it('a 409 reloads /home and goes to /login', async () => {
      vi.mocked(createFreeSetup).mockRejectedValue({ response: { status: 409, data: { message: 'Already set up' } } })
      const { wrapper, router } = await mountStep()
      await fill(wrapper)
      await submit(wrapper)

      expect(clearAllCachedGet).toHaveBeenCalled()
      expect(session.ensureHome).toHaveBeenCalledWith(true)
      await expectPath(router, '/login')
      expect(wrapper.find('[data-testid="wizard-general-error"]').exists()).toBe(false)
    })
  })

  describe('read-only mode (the account exists)', () => {
    beforeEach(() => {
      session.user = { name: 'Ada', email: 'ada@example.com' }
      session.home = { app: { name: 'Box', setup_required: false }, user: session.user }
    })

    it('shows the server, the name and the email locked, without password fields', async () => {
      const { wrapper } = await mountStep()

      const server = wrapper.get('input[name=server-name]')
      expect((server.element as HTMLInputElement).value).toBe('Box')
      expect((wrapper.get('input[name=name]').element as HTMLInputElement).value).toBe('Ada')
      expect((wrapper.get('input[name=email]').element as HTMLInputElement).value).toBe('ada@example.com')
      for (const name of ['server-name', 'name', 'email']) {
        expect(wrapper.get(`input[name=${name}]`).attributes('disabled')).toBeDefined()
      }
      expect(wrapper.find('input[name=new-password]').exists()).toBe(false)
      expect(wrapper.find('input[name=confirm-password]').exists()).toBe(false)
    })

    it('has no "Back" and no Hub link: the account is local and the sign-in is chosen', async () => {
      const { wrapper } = await mountStep()

      expect(wrapper.find('[data-testid="wizard-general-hub-link"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="wizard-previous"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="wizard-next"]').exists()).toBe(true)
    })

    it('Continue opens step 2 without calling the API', async () => {
      const { wrapper, router } = await mountStep()
      await submit(wrapper)

      expect(fetchCsrfCookie).not.toHaveBeenCalled()
      expect(createFreeSetup).not.toHaveBeenCalled()
      await expectPath(router, '/wizard/connect-ai')
    })
  })

  describe('hub mode (the account came from Hub)', () => {
    const settings = { name: 'Acme server', default_language: 'pl', default_date_format: 'YYYY-MM-DD' }

    beforeEach(() => {
      session.user = { name: 'Ann', email: 'ann@example.com', password_generated: true }
      session.home = { app: { name: 'Box', setup_required: false }, user: session.user }
      vi.mocked(getWizardSettings).mockReset().mockResolvedValue(settings)
      vi.mocked(getHubStatus).mockReset().mockResolvedValue({ paired: true, hub_url: 'https://hub.example.test/from-status' })
      vi.mocked(saveWizardServerName).mockReset().mockResolvedValue()
    })

    const withHubUrl = (url: string | null) => (pinia: ReturnType<typeof createPinia>) => useWizardStore(pinia).setHubUrl(url)

    it('shows the title, the account of Hub and only the server name, filled from the settings', async () => {
      const { wrapper } = await mountStep(withHubUrl('https://hub.example.test/account'))

      expect(wrapper.get('[data-testid="wizard-step-title"]').text()).toBe('Name your server')
      expect(wrapper.get('[data-testid="wizard-hub-account"]').text()).toContain('Connected to PanelAlpha Hub')
      expect(wrapper.get('[data-testid="wizard-hub-account-email"]').text()).toBe('Signed in as ann@example.com')
      expect((wrapper.get('input[name=server-name]').element as HTMLInputElement).value).toBe('Acme server')
      expect(wrapper.find('input[name=email]').exists()).toBe(false)
      expect(wrapper.find('input[name=new-password]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="wizard-previous"]').exists()).toBe(false)
    })

    it('links "Use another account" to the Hub address in a new tab, and asks for the address only when the store has none', async () => {
      const { wrapper } = await mountStep(withHubUrl('https://hub.example.test/account'))
      const link = wrapper.get('[data-testid="wizard-hub-account-link"]')
      expect(link.attributes('href')).toBe('https://hub.example.test/account')
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener')
      expect(getHubStatus).not.toHaveBeenCalled()

      const reloaded = await mountStep(withHubUrl(null))
      expect(getHubStatus).toHaveBeenCalledTimes(1)
      expect(reloaded.wrapper.get('[data-testid="wizard-hub-account-link"]').attributes('href')).toBe('https://hub.example.test/from-status')
    })

    it('has no link without an address', async () => {
      vi.mocked(getHubStatus).mockResolvedValue({ paired: true })
      const { wrapper } = await mountStep(withHubUrl(null))

      expect(wrapper.find('[data-testid="wizard-hub-account-link"]').exists()).toBe(false)
    })

    it('locks the field and Continue until the settings are read', async () => {
      let resolve: (value: typeof settings) => void = () => {}
      vi.mocked(getWizardSettings).mockReturnValue(new Promise(done => {
        resolve = done
      }))
      const { wrapper } = await mountStep(withHubUrl('https://hub.example.test/account'))

      expect(wrapper.get('input[name=server-name]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="wizard-next"]').attributes('disabled')).toBeDefined()

      resolve(settings)
      await flushPromises()
      expect(wrapper.get('input[name=server-name]').attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[data-testid="wizard-next"]').attributes('disabled')).toBeUndefined()
    })

    it('shows an alert and keeps Continue locked when the settings cannot be read', async () => {
      vi.mocked(getWizardSettings).mockRejectedValue({ response: { status: 500, data: { message: 'Settings are down' } } })
      const { wrapper } = await mountStep(withHubUrl('https://hub.example.test/account'))

      expect(wrapper.get('[data-testid="wizard-hub-load-error"]').text()).toBe('Settings are down')
      expect(wrapper.get('[data-testid="wizard-next"]').attributes('disabled')).toBeDefined()
      await submit(wrapper)
      expect(saveWizardServerName).not.toHaveBeenCalled()
    })

    it('Continue saves the typed name with the defaults of the settings and opens step 3', async () => {
      const { wrapper, router } = await mountStep(withHubUrl('https://hub.example.test/account'))
      await wrapper.get('input[name=server-name]').setValue('Renamed')
      await submit(wrapper)

      expect(saveWizardServerName).toHaveBeenCalledWith('Renamed', settings)
      expect(createFreeSetup).not.toHaveBeenCalled()
      expect(fetchCsrfCookie).not.toHaveBeenCalled()
      await expectPath(router, '/wizard/connect-ai')
      expect(useWizardStore().maxStep).toBe(2)
    })

    it('does not save an empty name', async () => {
      const { wrapper } = await mountStep(withHubUrl('https://hub.example.test/account'))
      await wrapper.get('input[name=server-name]').setValue('  ')
      await submit(wrapper)

      expect(saveWizardServerName).not.toHaveBeenCalled()
    })

    it('shows a 422 of the name under the field and stays', async () => {
      vi.mocked(saveWizardServerName).mockRejectedValue({ response: { status: 422, data: { errors: { name: ['The name is too long.'] } } } })
      const { wrapper, router } = await mountStep(withHubUrl('https://hub.example.test/account'))
      await submit(wrapper)

      expect(wrapper.text()).toContain('The name is too long.')
      expect(wrapper.find('[data-testid="wizard-general-error"]').exists()).toBe(false)
      expect(router.currentRoute.value.path).toBe('/wizard/general-config')
    })

    it('shows another error in an alert', async () => {
      vi.mocked(saveWizardServerName).mockRejectedValue({ response: { status: 500, data: { message: 'Server exploded' } } })
      const { wrapper } = await mountStep(withHubUrl('https://hub.example.test/account'))
      await submit(wrapper)

      expect(wrapper.get('[data-testid="wizard-general-error"]').text()).toBe('Server exploded')
    })
  })

  describe('password hint', () => {
    const hint = () => document.body.querySelector('[data-testid="wizard-password-checker"]')

    it('opens while the password field has the focus and closes on blur', async () => {
      const { wrapper } = await mountStep()
      expect(hint()).toBeNull()

      await wrapper.get('input[name=new-password]').trigger('focus')
      await vi.waitFor(() => expect(hint()).not.toBeNull())
      expect(hint()?.querySelectorAll('[data-testid^="wizard-checker-"]')).toHaveLength(5)

      await wrapper.get('input[name=new-password]').trigger('blur')
      await vi.waitFor(() => expect(document.body.querySelector('.v-overlay--active [data-testid="wizard-password-checker"]')).toBeNull())
    })

    it('keeps the field as the target of the hint after the field loses the focus', async () => {
      const { wrapper } = await mountStep()
      const input = wrapper.get('input[name=new-password]')
      await input.trigger('focus')
      await vi.waitFor(() => expect(hint()).not.toBeNull())

      // The open transition reads the target two frames in, so a blur must not take it away.
      const target = () => wrapper.findAllComponents({ name: 'VMenu' })[0]!.props('target')
      expect(target()).toBeInstanceOf(HTMLElement)

      await input.trigger('blur')
      await vi.waitFor(() => expect(document.body.querySelector('.v-overlay--active [data-testid="wizard-password-checker"]')).toBeNull())
      expect(target()).toBeInstanceOf(HTMLElement)
    })

    it('marks the rows the typed password satisfies', async () => {
      const { wrapper } = await mountStep()
      const input = wrapper.get('input[name=new-password]')
      await input.trigger('focus')
      await input.setValue('abc1')
      await flushPromises()

      const passed = (key: string) => hint()?.querySelector(`[data-testid="wizard-checker-${CSS.escape(key)}"]`)?.dataset.passed
      expect(passed('lowercase')).toBe('true')
      expect(passed('number')).toBe('true')
      expect(passed('uppercase')).toBe('false')
      expect(passed('symbol')).toBe('false')
      expect(passed('length')).toBe('false')
    })

    it('says in words which rows are met, not only with the check and the cross', async () => {
      const { wrapper } = await mountStep()
      const input = wrapper.get('input[name=new-password]')
      await input.trigger('focus')
      await input.setValue('abc1')
      await flushPromises()

      const status = (key: string) => hint()?.querySelector(`[data-testid="wizard-checker-${CSS.escape(key)}"] .wizard-checker__status`)?.textContent?.trim()
      expect(status('lowercase')).toBe('(met)')
      expect(status('uppercase')).toBe('(not met)')
    })

    it('the confirmation field has no hint', async () => {
      const { wrapper } = await mountStep()
      await wrapper.get('input[name=confirm-password]').trigger('focus')
      await flushPromises()

      expect(hint()).toBeNull()
    })
  })
})
