import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getWizardSettings } from '@/views/wizard/wizard.api'
import { useWizardStore } from '@/views/wizard/wizard.store'
import { getHubStatus } from '@/entities/hub/hub.api'
import { listTokens } from '@/entities/mcp/mcp.api'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { emit } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import SummaryStep from './SummaryStep.vue'

vi.mock('@/entities/hub/hub.api', () => ({ getHubStatus: vi.fn() }))
vi.mock('@/entities/mcp/mcp.api', () => ({ listTokens: vi.fn() }))
vi.mock('@/views/wizard/wizard.api', () => ({ getWizardSettings: vi.fn() }))
vi.mock('@/shared/api/cached-get', () => ({ clearAllCachedGet: vi.fn() }))
vi.mock('@/shared/events/app-events', () => ({ emit: vi.fn() }))
vi.mock('@/shared/session/session.store', () => ({ useSessionStore: vi.fn() }))
vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn(() => ({ destroy: vi.fn() })) } }))

const session = {
  ensureHome: vi.fn(),
  refreshServices: vi.fn(),
  home: { app: { single_server: { active: true }, name: 'Home name', community_panel: true } } as Record<string, unknown> | null,
  user: { email: 'jane@example.com' } as { email: string } | null,
}

async function mountStep (options: { connected?: boolean, ai?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wizard = useWizardStore()
  if (options.connected) {
    wizard.setHubConnected(true)
  }
  if (options.ai) {
    wizard.setAiConnected(true)
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/wizard/summary', component: SummaryStep },
      { path: '/settings', component: { template: '<div />' } },
      { path: '/projects', component: { template: '<div />' } },
      { path: '/instances', component: { template: '<div />' } },
    ],
  })
  await router.push('/wizard/summary')
  await router.isReady()
  const wrapper = await mountKit(SummaryStep, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, wizard }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(getHubStatus).mockReset().mockResolvedValue({ paired: false, account_name: null })
  vi.mocked(listTokens).mockReset().mockResolvedValue([])
  vi.mocked(clearAllCachedGet).mockReset()
  vi.mocked(emit).mockReset()
  session.refreshServices.mockReset().mockResolvedValue(undefined)
  session.ensureHome.mockReset().mockResolvedValue({})
  session.home = { app: { single_server: { active: true }, name: 'Home name', community_panel: true } }
  session.user = { email: 'jane@example.com' }
  vi.mocked(getWizardSettings).mockReset().mockResolvedValue({ name: 'Saved name', default_language: 'en', default_date_format: 'DD/MM/YYYY' })
  vi.mocked(useSessionStore).mockReturnValue(session as unknown as ReturnType<typeof useSessionStore>)
})

describe('SummaryStep', () => {
  it('shows the title, the description and the name saved by step 2', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid="wizard-step-title"]').text()).toBe('You\'re all set.')
    expect(wrapper.text()).toContain('PanelAlpha is ready on this server.')
    expect(wrapper.get('[data-testid="wizard-summary-server"]').text()).toBe('Server nameSaved name')
  })

  it('keeps the name of /home when the settings do not answer', async () => {
    vi.mocked(getWizardSettings).mockRejectedValue(new Error('offline'))
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid="wizard-summary-server"]').text()).toBe('Server nameHome name')
  })

  it('local account: the admin email, Hub not connected and the hint, no Hub list', async () => {
    const { wrapper, wizard } = await mountStep()
    expect(getHubStatus).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="wizard-summary-account"]').text()).toBe('Admin emailjane@example.com')
    expect(wrapper.find('[data-testid="wizard-summary-admin"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="wizard-summary-hub-status"]').text()).toBe('PanelAlpha HubNot connected')
    expect(wrapper.get('[data-testid="wizard-summary-ai-status"]').text()).toBe('AI assistantNot connected')
    const later = wrapper.get('[data-testid="wizard-summary-hub-later"]')
    expect(later.text()).toBe('You can connect PanelAlpha Hub later in Settings.')
    expect(later.get('a').attributes('href')).toBe('/settings')
    expect(wrapper.find('[data-testid="wizard-summary-connect-head"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="wizard-summary-connect-line"]')).toHaveLength(0)
    expect(wizard.hubConnected).toBe(false)
  })

  it('connected by step 2: the Hub account, the four lines and no call to the panel', async () => {
    const { wrapper } = await mountStep({ connected: true })
    expect(getHubStatus).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="wizard-summary-account"]').text()).toBe('Hub accountjane@example.com')
    expect(wrapper.find('[data-testid="wizard-summary-admin"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-summary-hub-later"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="wizard-summary-connect-head"]').text()).toBe('Included with PanelAlpha Hub')
    expect(wrapper.findAll('[data-testid="wizard-summary-connect-line"]').map(line => line.text())).toEqual([
      'One login for all your servers',
      'One-click admin login',
      'App monitoring across your servers',
      'Verified apps from the PanelAlpha GO! catalog',
    ])
    // The flag is the heading of the card.
    expect(wrapper.get('[data-testid="wizard-summary-connect-head"]').element.tagName).toBe('H3')
  })

  it('after the Hub and a token: six facts, Hub and AI connected', async () => {
    vi.mocked(listTokens).mockResolvedValue([{ id: 1, revoked_at: null }] as never)
    const { wrapper } = await mountStep({ connected: true, ai: true })
    expect(listTokens).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.summary-facts__row')).toHaveLength(6)
    expect(wrapper.get('[data-testid="wizard-summary-address"]').text()).toContain(window.location.origin)
    expect(wrapper.get('[data-testid="wizard-summary-version"]').text()).toBe('VersionCommunity')
    expect(wrapper.get('[data-testid="wizard-summary-hub-status"]').text()).toBe('PanelAlpha HubConnected')
    expect(wrapper.get('[data-testid="wizard-summary-ai-status"]').text()).toBe('AI assistantConnected')
  })

  it('a direct visit asks the tokens and takes an active one for connected', async () => {
    vi.mocked(listTokens).mockResolvedValue([{ id: 1, revoked_at: null }] as never)
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid="wizard-summary-ai-status"]').text()).toBe('AI assistantConnected')
  })

  it('a token revoked since step 3 reads Not connected (impl-review F1)', async () => {
    vi.mocked(listTokens).mockResolvedValue([{ id: 1, revoked_at: '2026-01-01' }] as never)
    const { wrapper } = await mountStep({ connected: true, ai: true })
    expect(wrapper.get('[data-testid="wizard-summary-ai-status"]').text()).toBe('AI assistantNot connected')
  })

  it('leaves the AI row out when the tokens do not answer', async () => {
    vi.mocked(listTokens).mockRejectedValue(new Error('offline'))
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid="wizard-summary-ai-status"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-summary-hub-status"]').exists()).toBe(true)
  })

  it('leaves the version row out on a panel that is not the Community one', async () => {
    session.home = { app: { name: 'Home name' } }
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid="wizard-summary-version"]').exists()).toBe(false)
  })

  it('links the documentation in a new tab', async () => {
    const { wrapper } = await mountStep()
    const link = wrapper.get('[data-testid="wizard-summary-docs"]')
    expect(link.attributes('href')).toBe('https://www.panelalpha.com/documentation/single-server')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('a direct visit asks the panel and takes a paired answer for connected', async () => {
    vi.mocked(getHubStatus).mockResolvedValue({ paired: true, account_name: 'Ann' })
    const { wrapper, wizard } = await mountStep()
    expect(wrapper.get('[data-testid="wizard-summary-connect-head"]').text()).toBe('Included with PanelAlpha Hub')
    expect(wizard.hubConnected).toBe(true)
  })

  it('leaves the Hub list and the created row out when the panel does not answer', async () => {
    vi.mocked(getHubStatus).mockRejectedValue(new Error('offline'))
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid="wizard-summary-connect-head"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-summary-admin"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-summary-hub-status"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wizard-summary-hub-later"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="wizard-summary-account"]').text()).toBe('Admin emailjane@example.com')
  })

  it('has only the finish button: the setup is saved, so there is no way back', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid="wizard-previous"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="wizard-next"]').text()).toBe('Create your first project')
    expect(wrapper.text()).not.toContain('Open PanelAlpha')
  })

  it('Create your first project finishes: cache, /home, /projects, services, then the onboarding', async () => {
    const { wrapper, router } = await mountStep()
    expect(wrapper.get('[data-testid="wizard-next"]').text()).toBe('Create your first project')

    await wrapper.get('[data-testid="wizard-next"]').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/projects'))
    expect(clearAllCachedGet).toHaveBeenCalledTimes(1)
    expect(session.ensureHome).toHaveBeenCalledWith(true)
    expect(session.refreshServices).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('start-installation-process')
    expect(emit).not.toHaveBeenCalledWith('after-login')
    expect(clearAllCachedGet.mock.invocationCallOrder[0]!).toBeLessThan(session.ensureHome.mock.invocationCallOrder[0]!)
    expect(session.ensureHome.mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(emit).mock.invocationCallOrder[0]!)
  })

  it('opens /instances on a panel that is not single-server', async () => {
    session.home = { app: {} }
    const { wrapper, router } = await mountStep()
    await wrapper.get('[data-testid="wizard-next"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/instances'))
  })

  it('a second click while the finish runs does nothing', async () => {
    let release: (value: unknown) => void = () => {}
    session.ensureHome.mockReturnValue(new Promise(resolve => {
      release = resolve
    }))
    const { wrapper } = await mountStep()
    const button = wrapper.get('[data-testid="wizard-next"]')

    await button.trigger('click')
    await button.trigger('click')
    await flushPromises()

    expect(session.ensureHome).toHaveBeenCalledTimes(1)
    release({})
    await flushPromises()
  })

  it('shows the error of a failed finish in an alert and lets the user try again', async () => {
    session.ensureHome.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Server exploded' } } })
    const { wrapper, router } = await mountStep()

    await wrapper.get('[data-testid="wizard-next"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="wizard-summary-error"]').text()).toBe('Server exploded'))
    expect(wrapper.get('[data-testid="wizard-summary-error"]').attributes('role')).toBe('alert')
    expect(emit).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/wizard/summary')

    await wrapper.get('[data-testid="wizard-next"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/projects'))
    expect(wrapper.find('[data-testid="wizard-summary-error"]').exists()).toBe(false)
  })

  it('loads the confetti on demand and destroys it with the step', async () => {
    const lottie = (await import('lottie-web')).default
    vi.mocked(lottie.loadAnimation).mockClear()
    const { wrapper } = await mountStep()
    await vi.waitFor(() => expect(lottie.loadAnimation).toHaveBeenCalledTimes(1))
    const options = vi.mocked(lottie.loadAnimation).mock.calls[0]![0]
    expect(options).toMatchObject({ renderer: 'svg', loop: 2, autoplay: true })
    const animation = vi.mocked(lottie.loadAnimation).mock.results[0]!.value as { destroy: ReturnType<typeof vi.fn> }
    wrapper.unmount()
    expect(animation.destroy).toHaveBeenCalled()
  })
})
