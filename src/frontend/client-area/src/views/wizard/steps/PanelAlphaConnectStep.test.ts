import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { assignLocation } from '@/views/wizard/browser-location'
import { useWizardStore } from '@/views/wizard/wizard.store'
import { completeHub, getHubStatus, startHub } from '@/entities/hub/hub.api'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { fetchCsrfCookie } from '@/shared/session/session.api'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import PanelAlphaConnectStep from './PanelAlphaConnectStep.vue'

vi.mock('@/shared/session/session.api', () => ({ fetchCsrfCookie: vi.fn() }))
vi.mock('@/entities/hub/hub.api', () => ({ getHubStatus: vi.fn(), startHub: vi.fn(), completeHub: vi.fn() }))
vi.mock('@/views/wizard/browser-location', () => ({ assignLocation: vi.fn() }))
vi.mock('@/shared/api/cached-get', () => ({ clearAllCachedGet: vi.fn() }))
vi.mock('@/shared/session/session.store', () => ({ useSessionStore: vi.fn() }))

const session = {
  ensureHome: vi.fn(),
  remoteAuthCheck: vi.fn(),
  user: null as Record<string, unknown> | null,
  home: { app: { name: 'Acme server' } } as Record<string, unknown> | null,
}

async function mountStep (path = '/wizard/panelalpha-connect', prepare?: (wizard: ReturnType<typeof useWizardStore>) => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  prepare?.(useWizardStore())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/wizard/general-config', component: { template: '<div />' } },
      { path: '/wizard/panelalpha-connect', component: PanelAlphaConnectStep },
      { path: '/wizard/summary', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const replace = vi.spyOn(router, 'replace')
  const wrapper = await mountKit(PanelAlphaConnectStep, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, replace, wizard: useWizardStore() }
}

const idle = () => vi.mocked(getHubStatus).mockResolvedValue({ paired: false, account_name: null })

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(fetchCsrfCookie).mockReset().mockResolvedValue()
  vi.mocked(getHubStatus).mockReset()
  idle()
  vi.mocked(startHub).mockReset().mockResolvedValue({ link: 'https://hub.example.test/connect' })
  vi.mocked(completeHub).mockReset().mockResolvedValue({ status: 'connected', account_name: 'Ann Ann' })
  vi.mocked(assignLocation).mockReset()
  vi.mocked(clearAllCachedGet).mockReset()
  session.ensureHome.mockReset().mockResolvedValue({})
  session.remoteAuthCheck.mockReset().mockResolvedValue(true)
  session.user = null
  vi.mocked(useSessionStore).mockReturnValue(session as unknown as ReturnType<typeof useSessionStore>)
})

describe('PanelAlphaConnectStep', () => {
  it('shows the title, the choice of the sign-in, the Hub card and the local link', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid="wizard-step-title"]').text()).toBe('How do you want to sign in?')
    expect(wrapper.text()).toContain('Pick one. You\'ll set the server name on the next step.')

    const card = wrapper.get('[data-testid="wizard-hub-card"]')
    expect(card.text()).toContain('Recommended')
    expect(card.get('h3').text()).toBe('Connect with PanelAlpha Hub')
    expect(card.findAll('li').map(item => item.text())).toEqual([
      'Account stored in Hub, not on this server',
      'One login for many servers',
      'Sign in with GitHub or Google',
      'Install verified apps from the PanelAlpha GO! catalog',
    ])
    expect(wrapper.get('[data-testid="wizard-connect-button"]').text()).toBe('Connect with Hub')
    // The diagram: the animation of the Hub account over the servers, with one alt for the texts it draws.
    const diagram = wrapper.get('[data-testid="wizard-hub-diagram"] img')
    expect(diagram.attributes('alt')).toBe('This server joins your Hub account')
    expect(diagram.attributes('src')).toContain('hub-diagram')
    expect(wrapper.get('[data-testid="wizard-connect-local"]').text()).toBe('Create a local account instead')
    // The old dashboard preview and the footer buttons are gone: the step moves on by the card or the link.
    expect(wrapper.text()).not.toContain('Connect dashboard preview')
    expect(wrapper.find('[data-testid="wizard-footer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-connect-skip"]').exists()).toBe(false)
    expect(getHubStatus).toHaveBeenCalledTimes(1)
  })

  it('opens the local form from the link', async () => {
    const { wrapper, router, wizard } = await mountStep()
    await wrapper.get('[data-testid="wizard-connect-local"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))
    expect(wizard.hubConnected).toBe(false)
    expect(startHub).not.toHaveBeenCalled()
  })

  it('starts the pairing with the origin and the server name, then leaves for the Hub', async () => {
    const { wrapper } = await mountStep()
    await wrapper.get('[data-testid="wizard-connect-button"]').trigger('click')

    await vi.waitFor(() => expect(assignLocation).toHaveBeenCalledWith('https://hub.example.test/connect'))
    expect(fetchCsrfCookie).toHaveBeenCalledTimes(1)
    expect(startHub).toHaveBeenCalledWith({ admin_url: window.location.origin, server_name: 'Acme server' })
  })

  it('sends the fallback name when the panel has none', async () => {
    session.home = { app: { name: '  ' } }
    const { wrapper } = await mountStep()
    await wrapper.get('[data-testid="wizard-connect-button"]').trigger('click')

    await vi.waitFor(() => expect(startHub).toHaveBeenCalledWith({ admin_url: window.location.origin, server_name: 'My server' }))
    session.home = { app: { name: 'Acme server' } }
  })

  it('shows the error of a failed start in an alert with Try again, and the card stays', async () => {
    vi.mocked(startHub).mockRejectedValue({ response: { status: 500, data: { message: 'Hub is down' } } })
    const { wrapper } = await mountStep()
    await wrapper.get('[data-testid="wizard-connect-button"]').trigger('click')

    await vi.waitFor(() => expect(wrapper.get('[data-testid="wizard-connect-error"]').text()).toBe('Hub is down'))
    expect(wrapper.get('[data-testid="wizard-connect-retry"]').text()).toBe('Try again')
    expect(wrapper.find('[data-testid="wizard-hub-card"]').exists()).toBe(true)
    expect(assignLocation).not.toHaveBeenCalled()

    vi.mocked(startHub).mockResolvedValue({ link: 'https://hub.example.test/connect' })
    await wrapper.get('[data-testid="wizard-connect-retry"]').trigger('click')
    await vi.waitFor(() => expect(assignLocation).toHaveBeenCalledWith('https://hub.example.test/connect'))
  })

  it('shows the unreachable copy and does not leave the page when the Hub link is not an http(s) address', async () => {
    vi.mocked(startHub).mockResolvedValue({ link: 'javascript:alert(1)' })
    const { wrapper } = await mountStep()
    await wrapper.get('[data-testid="wizard-connect-button"]').trigger('click')

    await vi.waitFor(() => expect(wrapper.get('[data-testid="wizard-connect-error"]').text()).toContain('could not be reached'))
    expect(assignLocation).not.toHaveBeenCalled()
  })

  it('goes on to step 2 when a signed-in admin has the server already paired', async () => {
    vi.mocked(getHubStatus).mockResolvedValue({ paired: true, account_name: 'Ann Ann' })
    session.user = { email: 'ada@example.com' }
    const { router, wizard } = await mountStep()

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))
    expect(wizard.hubConnected).toBe(true)
  })

  it('keeps the Hub account address the store already has when the server is found paired on load', async () => {
    vi.mocked(getHubStatus).mockResolvedValue({ paired: true, account_name: 'Ann Ann' })
    session.user = { email: 'ada@example.com' }
    const { router, wizard } = await mountStep('/wizard/panelalpha-connect', store => store.setHubUrl('https://hub.example.test/account'))
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))

    expect(wizard.hubUrl).toBe('https://hub.example.test/account')
  })

  it('sends a signed-in admin with a local account on to step 2: the Hub is not offered after the setup (D9)', async () => {
    session.user = { email: 'ada@example.com' }
    const { router, wizard } = await mountStep()

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))
    expect(wizard.hubConnected).toBe(false)
    expect(startHub).not.toHaveBeenCalled()
  })

  it('keeps a guest on step 1', async () => {
    const { router, wrapper } = await mountStep()

    expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect')
    expect(wrapper.find('[data-testid="wizard-hub-card"]').exists()).toBe(true)
  })

  it('stays on step 1 when the server is paired but nobody is signed in', async () => {
    vi.mocked(getHubStatus).mockResolvedValue({ paired: true, account_name: 'Ann Ann' })
    const { router } = await mountStep()

    expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect')
  })

  it('takes state and result out of the address bar, confirms the return and opens step 2', async () => {
    vi.mocked(completeHub).mockResolvedValue({ status: 'connected', account_name: 'Ann Ann', hub_url: 'https://hub.example.test/account' })
    const { replace, router, wizard } = await mountStep('/wizard/panelalpha-connect?state=s1&result=r1')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))
    expect(replace).toHaveBeenCalledWith({ path: '/wizard/panelalpha-connect', query: {} })
    expect(completeHub).toHaveBeenCalledWith({ state: 's1', result: 'r1' })
    expect(replace.mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(completeHub).mock.invocationCallOrder[0]!)
    // The return replaces the status call: the pairing is known from the answer.
    expect(getHubStatus).not.toHaveBeenCalled()
    expect(wizard.hubConnected).toBe(true)
    expect(wizard.hubUrl).toBe('https://hub.example.test/account')
    expect(wizard.maxStep).toBe(1)
  })

  it('clears the cache, reads the session and only then opens step 2', async () => {
    let signedIn: (value: boolean) => void = () => {}
    session.remoteAuthCheck.mockReturnValue(new Promise<boolean>(resolve => {
      signedIn = resolve
    }))
    const { router } = await mountStep('/wizard/panelalpha-connect?state=s1&result=r1')

    await vi.waitFor(() => expect(session.remoteAuthCheck).toHaveBeenCalled())
    // The session is still being read: the guard must not see the old guest, so the step has not moved.
    expect(router.currentRoute.value.path).toBe('/wizard/panelalpha-connect')
    expect(session.ensureHome).not.toHaveBeenCalled()
    expect(vi.mocked(clearAllCachedGet).mock.invocationCallOrder[0]!).toBeLessThan(session.remoteAuthCheck.mock.invocationCallOrder[0]!)

    signedIn(true)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))
  })

  it('shows the pairing in progress with the card locked while the return is confirmed', async () => {
    let finish: (value: { status: string }) => void = () => {}
    vi.mocked(completeHub).mockReturnValue(new Promise(resolve => {
      finish = resolve
    }))
    const { wrapper } = await mountStep('/wizard/panelalpha-connect?state=s1&result=r1')

    await vi.waitFor(() => expect(wrapper.find('[data-testid="wizard-hub-skeleton"]').exists()).toBe(true))
    expect(wrapper.get('[data-testid="wizard-hub-status"]').text()).toContain('Connecting to PanelAlpha')
    expect(wrapper.get('[data-testid="wizard-connect-button"]').attributes('disabled')).toBeDefined()

    finish({ status: 'denied' })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="wizard-hub-skeleton"]').exists()).toBe(false))
  })

  it('shows the message of a denied return and offers to try again', async () => {
    vi.mocked(completeHub).mockResolvedValue({ status: 'denied' })
    const { wrapper, wizard } = await mountStep('/wizard/panelalpha-connect?state=s1&result=r1')

    await vi.waitFor(() => expect(wrapper.find('[data-testid="wizard-connect-error"]').exists()).toBe(true))
    expect(wrapper.get('[data-testid="wizard-connect-error"]').text()).toBe('Not connected. The request was denied on PanelAlpha.')
    expect(wrapper.get('[data-testid="wizard-connect-retry"]').text()).toBe('Try again')
    expect(wrapper.find('[data-testid="wizard-connect-use-local"]').exists()).toBe(false)
    expect(wizard.hubConnected).toBe(false)
  })

  it('offers the local account when the Hub shared no email (unsupported)', async () => {
    vi.mocked(completeHub).mockResolvedValue({ status: 'unsupported' })
    const { wrapper, router } = await mountStep('/wizard/panelalpha-connect?state=s1&result=r1')

    await vi.waitFor(() => expect(wrapper.find('[data-testid="wizard-connect-use-local"]').exists()).toBe(true))
    expect(wrapper.get('[data-testid="wizard-connect-error"]').text()).toContain('did not share an email address')
    await wrapper.get('[data-testid="wizard-connect-use-local"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/general-config'))
  })

  it('offers to check a pending return again with the same state, and a 422 clears it', async () => {
    vi.mocked(completeHub).mockResolvedValueOnce({ status: 'pending' })
    const { wrapper } = await mountStep('/wizard/panelalpha-connect?state=s1&result=r1')

    await vi.waitFor(() => expect(wrapper.get('[data-testid="wizard-connect-retry"]').text()).toBe('Check again'))

    vi.mocked(completeHub).mockRejectedValueOnce({ response: { status: 422, data: {} } })
    await wrapper.get('[data-testid="wizard-connect-retry"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="wizard-connect-retry"]').text()).toBe('Try again'))
    expect(completeHub).toHaveBeenLastCalledWith({ state: 's1', result: 'r1' })
    expect(wrapper.get('[data-testid="wizard-connect-error"]').text()).toContain('The link expired')
  })

  it('goes to the sign-in on a 409 and reads the session first', async () => {
    vi.mocked(completeHub).mockRejectedValue({ response: { status: 409, data: {} } })
    const { router } = await mountStep('/wizard/panelalpha-connect?state=s1&result=r1')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(session.remoteAuthCheck).toHaveBeenCalled()
  })
})
