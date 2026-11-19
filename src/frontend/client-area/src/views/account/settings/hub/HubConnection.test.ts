import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { FREE_HUB_RETURN_KEY } from '@/entities/hub/hub-return'
import * as hubApi from '@/entities/hub/hub.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as cachedGet from '@/shared/api/cached-get'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import HubConnection from './HubConnection.vue'

// The real texts of the panel (the lite fixture of parity), so the copy is checked, not the keys the default mock returns.
const translations = JSON.parse(readFileSync(resolve(process.cwd(), 'parity/fixtures/lite/translation.en.json'), 'utf8')) as Record<string, unknown>

vi.mock('@/entities/hub/hub.api', () => ({
  getHubStatus: vi.fn(),
  startHub: vi.fn(),
  completeHub: vi.fn(),
  disconnectHub: vi.fn(),
}))
vi.mock('@/shared/api/cached-get', () => ({ clearAllCachedGet: vi.fn() }))

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const status = (paired: boolean, account: string | null = null) => ({ paired, account_name: account })
const failure = (code: number, message: string) => ({ response: { status: code, data: { message } } })

async function mountSection (path = '/settings', homeFails = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const ensureHome = vi.spyOn(useSessionStore(pinia), 'ensureHome')
  if (homeFails) {
    ensureHome.mockRejectedValue(new Error('offline'))
  } else {
    ensureHome.mockResolvedValue({} as never)
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: HubConnection }, { path: '/projects', component: { render: () => null } }],
  })
  await router.push(path)
  await router.isReady()
  const replace = vi.spyOn(router, 'replace')
  const wrapper = await mountKit(HubConnection, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, replace, ensureHome, alerts: useAlertsStore(pinia) }
}

describe('HubConnection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the skeleton only while the local status loads', async () => {
    const pending = deferred<hubApi.HubStatus>()
    vi.mocked(hubApi.getHubStatus).mockReturnValue(pending.promise)
    const { wrapper } = await mountSection()

    // ui-fix-v2: the skeleton of the same frame (`FeatureCard` with `loading`, `hub-card-loading`), bones but no title or button yet.
    const skeleton = wrapper.get('[data-testid="hub-card-loading"]')
    expect(skeleton.attributes('aria-busy')).toBe('true')
    expect(skeleton.classes()).toEqual(expect.arrayContaining(['feature-card', 'feature-card--wide', 'feature-card--busy']))
    expect(skeleton.find('.feature-card__title').exists()).toBe(false)
    expect(skeleton.find('.feature-flag--loading').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hub-connect"]').exists()).toBe(false)

    pending.resolve(status(false))
    await flushPromises()

    expect(wrapper.find('[data-testid="hub-card-loading"]').exists()).toBe(false)
    expect(wrapper.find('.hub-not-connected').exists()).toBe(true)
    expect(hubApi.getHubStatus).toHaveBeenCalledTimes(1)
  })

  it('shows the account when connected and offers no connect button', async () => {
    vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
    const { wrapper } = await mountSection()

    const card = wrapper.get('.hub-connected')
    expect(card.classes()).toContain('feature-card--ok')
    expect(card.get('.feature-flag').text()).toBe('settings.hub.connected')
    expect(card.get('h2').text()).toBe('This server is connected to PanelAlpha Hub')
    expect(card.get('.feature-card__lead').text()).toBe('Linked to the account Acme.')
    expect(card.findAll('.feature-checks li')).toHaveLength(4)
    expect(card.get('[data-testid="hub-diagram"]').classes()).toContain('hub-diagram--ok')
    expect(card.get('[data-testid="hub-diagram"] img').attributes('src')).toContain('hub-diagram-ok')
    expect(card.get('[data-testid="hub-disconnect"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hub-status"]').exists()).toBe(false)
    expect(wrapper.find('.hub-connect').exists()).toBe(false)
  })

  it('connected without an account name has no lead', async () => {
    vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true))
    const { wrapper } = await mountSection()

    expect(wrapper.find('.hub-connected').exists()).toBe(true)
    expect(wrapper.find('.feature-card__lead').exists()).toBe(false)
  })

  it('offers to connect when not connected: the flag, four points, the redirect note and the diagram (ui-fix-v2)', async () => {
    vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
    const { wrapper } = await mountSection()

    expect(wrapper.find('.hub-not-connected').exists()).toBe(true)
    expect(wrapper.find('.hub-connect').exists()).toBe(true)
    expect(wrapper.find('.hub-retry').exists()).toBe(false)
    expect(wrapper.findAll('.feature-checks li')).toHaveLength(4)
    expect(wrapper.find('[data-testid="hub-status"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="hub-note"]').text()).toBe('You sign in on PanelAlpha Hub and come straight back here.')
    expect(wrapper.get('[data-testid="hub-diagram"] img').attributes('alt')).toBe('This server joins your PanelAlpha Hub account')
    expect(wrapper.get('[data-testid="hub-diagram"]').classes()).not.toContain('hub-diagram--ok')
    expect(wrapper.get('.feature-flag').text()).toBe('Free')
    expect(wrapper.get('.feature-card').classes()).toContain('feature-card--wide')
    expect(wrapper.find('.feature-card').attributes('aria-busy')).toBeUndefined()
  })

  describe('copy with the real texts of the panel', () => {
    beforeEach(() => {
      i18next.addResourceBundle('en', 'translation', translations, true, true)
    })

    afterEach(() => {
      i18next.removeResourceBundle('en', 'translation')
      i18next.addResourceBundle('en', 'translation', {})
    })

    it('the offer says PanelAlpha Hub everywhere and never a bare PanelAlpha', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      const { wrapper } = await mountSection()

      const card = wrapper.get('[data-testid="hub-offer"]')
      expect(card.get('.feature-flag').text()).toBe('Free')
      expect(card.get('h2').text()).toBe('Connect this server to PanelAlpha Hub')
      expect(card.get('.feature-card__lead').text()).toBe('Free and optional. This server keeps working on its own either way.')
      expect(card.findAll('.feature-checks li').map(item => item.text())).toEqual([
        'App monitoring · Live status of every app on this server.',
        'Reusable integrations · Link a service once, every server uses it.',
        'One login · One PanelAlpha Hub account for all your servers.',
        'PanelAlpha GO! · Install verified apps from the GO! catalog.',
      ])
      expect(card.findAll('.feature-checks li b').map(item => item.text())).toEqual(['App monitoring', 'Reusable integrations', 'One login', 'PanelAlpha GO!'])
      expect(card.get('[data-testid="hub-connect"]').text()).toBe('Connect to PanelAlpha Hub')
      expect(card.text()).not.toMatch(/PanelAlpha(?! Hub| GO!)/)
    })

    it('the connected card, the modal and the toasts say PanelAlpha Hub everywhere', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      vi.mocked(hubApi.disconnectHub).mockResolvedValue({ paired: false, account_name: null })
      const { wrapper, alerts } = await mountSection()

      const card = wrapper.get('[data-testid="hub-connected"]')
      expect(card.get('.feature-flag').text()).toBe('Connected')
      expect(card.get('h2').text()).toBe('This server is connected to PanelAlpha Hub')
      expect(card.get('.feature-card__lead').text()).toBe('Linked to the account Acme.')
      expect(card.get('[data-testid="hub-disconnect"]').text()).toBe('Disconnect')
      expect(card.text()).not.toMatch(/PanelAlpha(?! Hub| GO!)/)

      await wrapper.get('[data-testid="hub-disconnect"]').trigger('click')
      await flushPromises()
      const modal = document.querySelector<HTMLElement>('.hub-disconnect-modal')!
      expect(modal.textContent).not.toMatch(/PanelAlpha(?! Hub| GO!)/)
      expect(modal.textContent).toContain('Disconnect from PanelAlpha Hub?')
      document.querySelector<HTMLElement>('.hub-disconnect-confirm')!.click()
      await flushPromises()
      expect(alerts.activeAlerts.map(alert => alert.successMessage)).toEqual(['Disconnected from PanelAlpha Hub.'])
      wrapper.unmount()
    })

    it('the pending card and its toast say PanelAlpha Hub everywhere', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockResolvedValue({ status: 'pending' })
      const { wrapper, alerts } = await mountSection('/settings?state=abc&result=approved')

      const card = wrapper.get('[data-testid="hub-offer"]')
      expect(card.get('[data-testid="hub-check-again"]').text()).toBe('Check again')
      expect(card.get('[data-testid="hub-note"]').text()).toBe('PanelAlpha Hub has not confirmed the connection yet. Check again in a moment.')
      expect(card.text()).not.toMatch(/PanelAlpha(?! Hub| GO!)/)
      expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['PanelAlpha Hub has not confirmed the connection yet. Check again in a moment.'])
      wrapper.unmount()
    })

    it('the 409 of Disconnect says PanelAlpha Hub', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      vi.mocked(hubApi.disconnectHub).mockRejectedValue(failure(409, 'Set a password in My account before disconnecting.'))
      const { wrapper, alerts } = await mountSection()

      await wrapper.get('[data-testid="hub-disconnect"]').trigger('click')
      await flushPromises()
      document.querySelector<HTMLElement>('.hub-disconnect-confirm')!.click()
      await flushPromises()
      const [message] = alerts.activeAlerts.map(alert => alert.errorMessage)
      expect(message).toContain('PanelAlpha Hub is the only way to sign in to this panel.')
      expect(message).not.toMatch(/PanelAlpha(?! Hub| GO!)/)
      wrapper.unmount()
    })
  })

  it('a failed status call toasts, leaves the skeleton and does not complete a Hub return', async () => {
    vi.mocked(hubApi.getHubStatus).mockRejectedValue(failure(500, 'Server Error'))
    const { wrapper, alerts, replace } = await mountSection('/settings?state=abc&result=approved')

    expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Server Error' }])
    expect(wrapper.find('[data-testid="hub-card-loading"]').exists()).toBe(false)
    expect(hubApi.completeHub).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  describe('connect', () => {
    it('does not follow a link that is not http(s) and says PanelAlpha Hub could not be reached (impl-review F8)', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.startHub).mockResolvedValue({ link: 'javascript:alert(1)' })
      const assign = vi.fn()
      vi.stubGlobal('location', { origin: 'https://panel.example.com', assign })
      const { wrapper, alerts } = await mountSection()

      await wrapper.get('[data-testid="hub-connect"]').trigger('click')
      await flushPromises()
      expect(assign).not.toHaveBeenCalled()
      expect(window.sessionStorage.getItem(FREE_HUB_RETURN_KEY)).toBeNull()
      expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['PanelAlpha Hub could not be reached. Try again in a moment.'])
      expect(wrapper.find('[data-testid="hub-connect"] .v-btn__loader').exists()).toBe(false)
      wrapper.unmount()
    })

    it('starts with the panel origin, remembers the return only after success and follows the Hub link', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.startHub).mockResolvedValue({ link: 'https://hub.example.com/c?state=s' })
      const assign = vi.fn()
      vi.stubGlobal('location', { origin: 'https://panel.example.com', assign })
      const { wrapper } = await mountSection()

      await wrapper.get('.hub-connect').trigger('click')
      await flushPromises()

      expect(hubApi.startHub).toHaveBeenCalledWith({ admin_url: 'https://panel.example.com' })
      expect(window.sessionStorage.getItem(FREE_HUB_RETURN_KEY)).toBe('settings')
      expect(assign).toHaveBeenCalledWith('https://hub.example.com/c?state=s')
    })

    it('toasts a start error, writes no key and stays unconnected', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.startHub).mockRejectedValue(failure(502, 'Unreachable'))
      const { wrapper, alerts } = await mountSection()

      await wrapper.get('.hub-connect').trigger('click')
      await flushPromises()

      expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Unreachable' }])
      expect(wrapper.find('.hub-connect').exists()).toBe(true)
      expect(wrapper.get('.hub-connect').classes()).not.toContain('v-btn--loading')
      expect(window.sessionStorage.getItem(FREE_HUB_RETURN_KEY)).toBeNull()
    })

    it('loads on the button while the Hub creates the request', async () => {
      const answer = deferred<{ link: string }>()
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.startHub).mockReturnValue(answer.promise)
      const { wrapper } = await mountSection()

      await wrapper.get('.hub-connect').trigger('click')

      expect(wrapper.get('.hub-connect').classes()).toContain('v-btn--loading')
      expect(wrapper.get('.hub-connect').text()).toContain('settings.hub.connecting')

      answer.reject(failure(502, 'Unreachable'))
      await flushPromises()
      expect(wrapper.get('.hub-connect').classes()).not.toContain('v-btn--loading')
    })

    it('does not start a second request while one is running', async () => {
      const answer = deferred<{ link: string }>()
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.startHub).mockReturnValue(answer.promise)
      const { wrapper } = await mountSection()

      await wrapper.get('.hub-connect').trigger('click')
      await wrapper.get('.hub-connect').trigger('click')

      expect(hubApi.startHub).toHaveBeenCalledTimes(1)
    })
  })

  describe('Hub return', () => {
    it('completes once with state and result, clears them from the query and refreshes /home', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockResolvedValue({ status: 'connected', account_name: 'Acme' })
      const { wrapper, replace, ensureHome } = await mountSection('/settings?state=abc&result=approved')

      expect(hubApi.completeHub).toHaveBeenCalledTimes(1)
      expect(hubApi.completeHub).toHaveBeenCalledWith({ state: 'abc', result: 'approved' })
      expect(replace).toHaveBeenCalledWith({ path: '/settings', query: {} })
      expect(wrapper.find('.hub-connected').exists()).toBe(true)
      expect(wrapper.text()).toContain('Linked to the account Acme.')
      expect(cachedGet.clearAllCachedGet).toHaveBeenCalledTimes(1)
      expect(ensureHome).toHaveBeenCalledWith(true)
    })

    it('does not pull the user back to Settings when they left during the confirmation (impl-review F8)', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      const answer = deferred<hubApi.HubCompleteResult>()
      vi.mocked(hubApi.completeHub).mockReturnValue(answer.promise)
      const { router, replace } = await mountSection('/settings?state=abc&result=approved')

      await router.push('/projects')
      replace.mockClear()
      answer.resolve({ status: 'connected', account_name: 'Acme' })
      await flushPromises()
      expect(replace).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/projects')
    })

    it('keeps the rest of the query when it clears the return', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockResolvedValue({ status: 'connected', account_name: 'Acme' })
      const { replace } = await mountSection('/settings?tab=backups&state=abc&result=approved')

      expect(replace).toHaveBeenCalledWith({ path: '/settings', query: { tab: 'backups' } })
    })

    it('does not complete without a state', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      const { replace } = await mountSection('/settings?result=approved')

      expect(hubApi.completeHub).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
    })

    it('sends an empty result when the return has none', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockResolvedValue({ status: 'denied' })
      await mountSection('/settings?state=abc')

      expect(hubApi.completeHub).toHaveBeenCalledWith({ state: 'abc', result: '' })
    })

    it.each([
      ['denied', 'Not connected. The request was denied on PanelAlpha Hub.'],
      ['expired', 'The link expired. Start again.'],
    ] as const)('toasts the %s outcome, keeps Connect and does not refresh /home', async (outcome, text) => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockResolvedValue({ status: outcome })
      const { wrapper, alerts, ensureHome } = await mountSection('/settings?state=abc&result=denied')

      expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: text }])
      expect(wrapper.find('.hub-connect').exists()).toBe(true)
      expect(ensureHome).not.toHaveBeenCalled()
    })

    it('keeps the page and loads on the button while the Hub return is confirmed', async () => {
      const answer = deferred<hubApi.HubCompleteResult>()
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockReturnValue(answer.promise)
      const { wrapper } = await mountSection('/settings?state=abc&result=approved')

      expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
      expect(wrapper.find('.hub-not-connected').exists()).toBe(true)
      expect(wrapper.get('.hub-connect').classes()).toContain('v-btn--loading')
      expect(wrapper.get('.hub-connect').text()).toContain('settings.hub.confirming')

      answer.resolve({ status: 'connected', account_name: 'Acme' })
      await flushPromises()
      expect(wrapper.find('.hub-connected').exists()).toBe(true)
      expect(wrapper.find('.hub-connect').exists()).toBe(false)
    })

    it('a failed complete toasts, still clears the query and keeps Connect', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockRejectedValue(failure(422, 'Unknown state'))
      const { wrapper, alerts, replace, ensureHome } = await mountSection('/settings?tab=backups&state=abc&result=approved')

      expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'Unknown state' }])
      expect(replace).toHaveBeenCalledWith({ path: '/settings', query: { tab: 'backups' } })
      expect(wrapper.find('.hub-connect').exists()).toBe(true)
      expect(ensureHome).not.toHaveBeenCalled()
    })

    it('swallows a failed /home refresh after a connected answer', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockResolvedValue({ status: 'connected', account_name: 'Acme' })
      const { wrapper, alerts, ensureHome } = await mountSection('/settings?state=abc&result=approved', true)

      expect(ensureHome).toHaveBeenCalledWith(true)
      expect(wrapper.find('.hub-connected').exists()).toBe(true)
      expect(alerts.activeAlerts).toHaveLength(0)
    })
  })

  describe('pending and Check again', () => {
    it('toasts, shows the warning note on the same card and offers Check again instead of Connect (ui-fix-v2)', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub).mockResolvedValue({ status: 'pending' })
      const { wrapper, alerts, ensureHome } = await mountSection('/settings?state=abc&result=approved')

      expect(alerts.activeAlerts).toMatchObject([{ success: false, errorMessage: 'PanelAlpha Hub has not confirmed the connection yet. Check again in a moment.' }])
      expect(wrapper.find('.hub-connect').exists()).toBe(false)
      expect(wrapper.find('.hub-retry').exists()).toBe(true)
      expect(wrapper.get('[data-testid="hub-check-again"]').text()).toBe('settings.hub.checkAgain')
      // The same frame as the offer (flag "Free", the points, the diagram), no chip and no dot.
      expect(wrapper.get('.feature-flag').text()).toBe('Free')
      expect(wrapper.findAll('.feature-checks li')).toHaveLength(4)
      expect(wrapper.find('[data-testid="hub-diagram"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="hub-status"]').exists()).toBe(false)
      const note = wrapper.get('[data-testid="hub-note"]')
      expect(note.classes()).toContain('hub-note--warning')
      expect(note.text()).toBe('PanelAlpha Hub has not confirmed the connection yet. Check again in a moment.')
      expect(ensureHome).not.toHaveBeenCalled()
    })

    it('Check again completes with the kept state and connects', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub)
        .mockResolvedValueOnce({ status: 'pending' })
        .mockResolvedValueOnce({ status: 'connected', account_name: 'Acme' })
      const { wrapper, ensureHome } = await mountSection('/settings?state=abc&result=approved')

      await wrapper.get('.hub-retry').trigger('click')
      await flushPromises()

      expect(hubApi.completeHub).toHaveBeenCalledTimes(2)
      expect(hubApi.completeHub).toHaveBeenLastCalledWith({ state: 'abc', result: 'approved' })
      expect(wrapper.find('.hub-connected').exists()).toBe(true)
      expect(ensureHome).toHaveBeenCalledTimes(1)
    })

    it('loads on the Check again button while the Hub is asked again', async () => {
      const answer = deferred<hubApi.HubCompleteResult>()
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub)
        .mockResolvedValueOnce({ status: 'pending' })
        .mockReturnValueOnce(answer.promise)
      const { wrapper } = await mountSection('/settings?state=abc&result=approved')

      await wrapper.get('.hub-retry').trigger('click')

      expect(wrapper.get('.hub-retry').classes()).toContain('v-btn--loading')
      expect(wrapper.get('.hub-retry').text()).toContain('settings.hub.checking')
      expect(wrapper.get('.feature-card').attributes('aria-busy')).toBe('true')

      answer.resolve({ status: 'connected', account_name: 'Acme' })
      await flushPromises()
      expect(wrapper.find('.hub-connected').exists()).toBe(true)
    })

    it('a 409 / 502 on Check again keeps it, a 422 returns to Connect', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      vi.mocked(hubApi.completeHub)
        .mockResolvedValueOnce({ status: 'pending' })
        .mockRejectedValueOnce(failure(502, 'Hub unreachable'))
        .mockRejectedValueOnce(failure(422, 'Unknown state'))
      const { wrapper, alerts } = await mountSection('/settings?state=abc&result=approved')

      await wrapper.get('.hub-retry').trigger('click')
      await flushPromises()
      expect(wrapper.find('.hub-retry').exists()).toBe(true)

      await wrapper.get('.hub-retry').trigger('click')
      await flushPromises()
      expect(wrapper.find('.hub-retry').exists()).toBe(false)
      expect(wrapper.find('.hub-connect').exists()).toBe(true)
      expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual([
        'PanelAlpha Hub has not confirmed the connection yet. Check again in a moment.',
        'Hub unreachable',
        'Unknown state',
      ])
    })
  })

  describe('disconnect', () => {
    const q = (selector: string) => document.querySelector<HTMLElement>(selector)
    const disconnected = { paired: false, account_name: null }

    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('shows the features and Disconnect only when connected', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      const { wrapper } = await mountSection()

      expect(wrapper.findAll('.feature-checks li')).toHaveLength(4)
      expect(wrapper.get('.hub-disconnect').text()).toContain('settings.hub.disconnect')
      wrapper.unmount()

      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(false))
      const other = await mountSection()
      expect(other.wrapper.find('.hub-disconnect').exists()).toBe(false)
      other.wrapper.unmount()
    })

    it('sends the disconnect only after the confirmation, then shows Connect and toasts', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      vi.mocked(hubApi.disconnectHub).mockResolvedValue(disconnected)
      const { wrapper, alerts, ensureHome } = await mountSection()

      await wrapper.get('.hub-disconnect').trigger('click')
      await flushPromises()
      expect(hubApi.disconnectHub).not.toHaveBeenCalled()
      expect(q('.hub-disconnect-modal')!.textContent).toContain('Disconnect from PanelAlpha Hub?')
      expect(q('.hub-disconnect-warning')!.textContent).toContain('Disconnecting removes this server from your PanelAlpha Hub account and turns off "Sign in with PanelAlpha Hub" until you connect again.')

      q('.hub-disconnect-confirm')!.click()
      await flushPromises()

      expect(hubApi.disconnectHub).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.hub-not-connected').exists()).toBe(true)
      expect(wrapper.find('.hub-connect').exists()).toBe(true)
      expect(ensureHome).toHaveBeenCalledWith(true)
      expect(alerts.activeAlerts).toHaveLength(1)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: true, successMessage: 'Disconnected from PanelAlpha Hub.' })
      wrapper.unmount()
    })

    it('blocks a generated-password admin without an API call and routes to My account', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      const pinia = createPinia()
      setActivePinia(pinia)
      useSessionStore(pinia).hydrateHome({ user: { password_generated: true } } as never)
      vi.spyOn(useSessionStore(pinia), 'ensureHome').mockResolvedValue({} as never)
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/settings', component: HubConnection }],
      })
      await router.push('/settings')
      await router.isReady()
      const push = vi.spyOn(router, 'push')
      const wrapper = await mountKit(HubConnection, { global: { plugins: [pinia, router] } })
      await flushPromises()

      await wrapper.get('.hub-disconnect').trigger('click')
      await flushPromises()
      expect(q('.hub-disconnect-set-password')!.textContent).toContain('PanelAlpha Hub is the only way to sign in to this panel. Set a password in My account first, then disconnect.')
      expect(q('.hub-disconnect-warning')).toBeNull()
      expect(q('.hub-disconnect-confirm')).toBeNull()

      q('.hub-disconnect-set-password-link')!.click()
      await flushPromises()

      expect(push).toHaveBeenCalledWith('/my-account')
      expect(hubApi.disconnectHub).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('explains a 409 with the same message and leaves the modal open', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      vi.mocked(hubApi.disconnectHub).mockRejectedValue(failure(409, 'Set a password in My account before disconnecting.'))
      const { wrapper, alerts, ensureHome } = await mountSection()

      await wrapper.get('.hub-disconnect').trigger('click')
      await flushPromises()
      q('.hub-disconnect-confirm')!.click()
      await flushPromises()

      expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['PanelAlpha Hub is the only way to sign in to this panel. Set a password in My account first, then disconnect.'])
      expect(q('.hub-disconnect-modal')).not.toBeNull()
      expect(wrapper.find('.hub-connected').exists()).toBe(true)
      expect(ensureHome).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('keeps the panel connected after Cancel or a failed disconnect, and refreshes /home only after success', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      vi.mocked(hubApi.disconnectHub)
        .mockRejectedValueOnce(failure(500, 'Server Error'))
        .mockResolvedValueOnce(disconnected)
      const { wrapper, alerts, ensureHome } = await mountSection()

      await wrapper.get('.hub-disconnect').trigger('click')
      await flushPromises()
      q('.hub-disconnect-cancel')!.click()
      await flushPromises()
      expect(hubApi.disconnectHub).not.toHaveBeenCalled()
      expect(wrapper.find('.hub-disconnect').exists()).toBe(true)

      await wrapper.get('.hub-disconnect').trigger('click')
      await flushPromises()
      q('.hub-disconnect-confirm')!.click()
      await flushPromises()
      expect(alerts.activeAlerts.map(alert => alert.errorMessage)).toEqual(['Server Error'])
      expect(wrapper.find('.hub-connected').exists()).toBe(true)
      expect(ensureHome).not.toHaveBeenCalled()

      q('.hub-disconnect-confirm')!.click()
      await flushPromises()
      expect(ensureHome).toHaveBeenCalledWith(true)
      expect(wrapper.find('.hub-not-connected').exists()).toBe(true)
      wrapper.unmount()
    })

    it('loads on the modal button while the Hub disconnects and sends once', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      const pending = deferred<hubApi.HubStatus>()
      vi.mocked(hubApi.disconnectHub).mockReturnValue(pending.promise)
      const { wrapper } = await mountSection()

      await wrapper.get('.hub-disconnect').trigger('click')
      await flushPromises()
      q('.hub-disconnect-confirm')!.click()
      await flushPromises()
      expect(q('.hub-disconnect-confirm')!.classList.contains('v-btn--loading')).toBe(true)
      expect(q('.hub-disconnect-confirm')!.textContent).toContain('settings.hub.disconnecting')

      q('.hub-disconnect-confirm')!.click()
      await flushPromises()
      expect(hubApi.disconnectHub).toHaveBeenCalledTimes(1)

      pending.resolve(disconnected)
      await flushPromises()
      expect(wrapper.find('.hub-not-connected').exists()).toBe(true)
      wrapper.unmount()
    })

    it('stays disconnected without an error toast when the /home refresh fails', async () => {
      vi.mocked(hubApi.getHubStatus).mockResolvedValue(status(true, 'Acme'))
      vi.mocked(hubApi.disconnectHub).mockResolvedValue(disconnected)
      const { wrapper, alerts } = await mountSection('/settings', true)

      await wrapper.get('.hub-disconnect').trigger('click')
      await flushPromises()
      q('.hub-disconnect-confirm')!.click()
      await flushPromises()

      expect(wrapper.find('.hub-not-connected').exists()).toBe(true)
      expect(alerts.activeAlerts.map(alert => alert.errorMessage ?? alert.successMessage)).toEqual(['Disconnected from PanelAlpha Hub.'])
      wrapper.unmount()
    })
  })
})
