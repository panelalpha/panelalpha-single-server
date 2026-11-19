import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as instanceActionsApi from '@/entities/project/instance-actions.api'
import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import AlertSm from '@/shared/ui/alerts/AlertSm.vue'
import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
import SettingCardSkeleton from '@/shared/ui/setting-card/SettingCardSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import * as wordpressMcpApi from './wordpress-mcp.api'
import WordpressMcpView from './WordpressMcpView.vue'

vi.mock('./wordpress-mcp.api', () => ({
  getWordpressMcp: vi.fn(),
  enableWordpressMcp: vi.fn(),
  disableWordpressMcp: vi.fn(),
}))

vi.mock('@/entities/project/instance-actions.api', () => ({
  createSsoUrl: vi.fn(),
}))

function makeInstance (overrides: Record<string, unknown> = {}): InstanceResource {
  return { id: 9, ...overrides } as unknown as InstanceResource
}

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function mountView (instance: InstanceResource = makeInstance(), documentationLink?: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (documentationLink !== undefined) {
    useSessionStore().home = { app: { documentation_link: documentationLink } } as never
  }
  const wrapper = await mountKit(WordpressMcpView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

function mcpSwitch (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findComponent(ButtonSwitch)
}

const activeStatus = { state: 'active', endpoint: 'https://x/mcp', config_json: '{"a":1}' } as const

describe('WordpressMcpView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue({ state: 'disabled', endpoint: null, config_json: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the page title', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('h4.page-title__title').text()).toBe('heading.instance.advanced.wordpressMcp.title')
  })

  it('loads the status of the instance on mount', async () => {
    await mountView()

    expect(wordpressMcpApi.getWordpressMcp).toHaveBeenCalledWith(9)
  })

  it('shows the skeleton until the GET settles', async () => {
    const pending = deferred<wordpressMcpApi.WordpressMcpStatus>()
    vi.mocked(wordpressMcpApi.getWordpressMcp).mockReturnValue(pending.promise)

    const wrapper = await mountKit(WordpressMcpView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })

    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(1)
    expect(wrapper.findComponent(ButtonSwitch).exists()).toBe(false)

    pending.resolve({ state: 'disabled', endpoint: null, config_json: null })
    await flushPromises()

    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
    expect(wrapper.findComponent(ButtonSwitch).exists()).toBe(true)
  })

  it('shows the switch off and the plugin hint when disabled', async () => {
    const wrapper = await mountView()

    expect(mcpSwitch(wrapper).props('modelValue')).toBe(false)
    expect(wrapper.findComponent(AlertSm).exists()).toBe(true)
    expect(wrapper.findComponent(AlertSm).props('text')).toBe('heading.instance.advanced.wordpressMcp.pluginRequiredHint')
  })

  it('names the switch input with the page title', async () => {
    const wrapper = await mountView()

    expect(mcpSwitch(wrapper).find('input').attributes('aria-label')).toBe('heading.instance.advanced.wordpressMcp.title')
  })

  it('shows the switch on and no hint when active', async () => {
    vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue({ state: 'active', endpoint: 'https://x/mcp', config_json: '{}' })

    const wrapper = await mountView()

    expect(mcpSwitch(wrapper).props('modelValue')).toBe(true)
    expect(wrapper.findComponent(AlertSm).exists()).toBe(false)
  })

  it('shows an error alert and the disabled card when the GET fails', async () => {
    vi.mocked(wordpressMcpApi.getWordpressMcp).mockRejectedValue(new Error('network'))

    const pinia = createPinia()
    setActivePinia(pinia)
    const alerts = useAlertsStore()
    const addAlert = vi.spyOn(alerts, 'addAlert')

    const wrapper = await mountKit(WordpressMcpView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
    await flushPromises()

    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
    expect(mcpSwitch(wrapper).props('modelValue')).toBe(false)
    expect(wrapper.findComponent(AlertSm).exists()).toBe(true)
  })

  describe('how to connect card', () => {
    it('is not shown when the MCP is disabled', async () => {
      const wrapper = await mountView()

      expect(wrapper.findAll('.step')).toHaveLength(0)
    })

    it('shows the three steps, the endpoint and the config when active, with no warning', async () => {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)

      const wrapper = await mountView()

      expect(wrapper.findAll('.step')).toHaveLength(3)
      expect(wrapper.find('code.mcp-code').text()).toBe('https://x/mcp')
      expect(wrapper.find('pre.mcp-code').text()).toBe('{"a":1}')
      expect(wrapper.find('.warning-icon').exists()).toBe(false)
    })

    it('shows the endpoint-unavailable warning for endpoint_unavailable', async () => {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue({ ...activeStatus, state: 'endpoint_unavailable' })

      const wrapper = await mountView()

      expect(wrapper.findAll('.step')).toHaveLength(3)
      expect(wrapper.find('.warning-icon').exists()).toBe(true)
      expect(wrapper.find('.text-warning').text()).toContain('heading.instance.advanced.wordpressMcp.endpointUnavailable')
    })

    it('shows the documentation link and the h6 with mb-2 when the link is set', async () => {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)

      const wrapper = await mountView(makeInstance(), 'https://docs.example/mcp')

      const link = wrapper.find('a.text-info')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('https://docs.example/mcp')
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener')
      expect(wrapper.find('h6.mb-2').exists()).toBe(true)
    })

    it('hides the documentation link and uses h6 with mb-4 when the link is empty', async () => {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)

      const wrapper = await mountView(makeInstance(), '')

      expect(wrapper.find('a.text-info').exists()).toBe(false)
      expect(wrapper.find('h6.mb-4').exists()).toBe(true)
    })

    it('opens WP-Admin as user 1 in a new tab', async () => {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)
      vi.mocked(instanceActionsApi.createSsoUrl).mockResolvedValue({ sso_url: 'https://wp/sso' })
      const open = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as unknown as Window)

      const wrapper = await mountView()
      await wrapper.find('.step__action button').trigger('click')
      await flushPromises()

      expect(instanceActionsApi.createSsoUrl).toHaveBeenCalledWith(9, 1)
      expect(open).toHaveBeenCalledWith('https://wp/sso', '_blank')
      open.mockRestore()
    })

    it('navigates the current tab when the popup is blocked', async () => {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)
      vi.mocked(instanceActionsApi.createSsoUrl).mockResolvedValue({ sso_url: 'https://wp/sso' })
      const location = { href: '' }
      vi.stubGlobal('location', location)
      const open = vi.spyOn(window, 'open').mockReturnValue(null)

      const wrapper = await mountView()
      await wrapper.find('.step__action button').trigger('click')
      await flushPromises()

      expect(open).toHaveBeenCalledWith('https://wp/sso', '_blank')
      expect(location.href).toBe('https://wp/sso')
      open.mockRestore()
    })

    it('alerts and releases the loader when the SSO request fails', async () => {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)
      vi.mocked(instanceActionsApi.createSsoUrl).mockRejectedValue(new Error('sso'))

      const pinia = createPinia()
      setActivePinia(pinia)
      const alerts = useAlertsStore()
      const addAlert = vi.spyOn(alerts, 'addAlert')
      const wrapper = await mountKit(WordpressMcpView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
      await flushPromises()

      await wrapper.find('.step__action button').trigger('click')
      await flushPromises()

      expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
      expect(wrapper.find('.step__action button').attributes('disabled')).toBeUndefined()
    })
  })

  describe('enable and disable', () => {
    const disabledStatus = { state: 'disabled', endpoint: null, config_json: null } as const
    const installingStatus = { state: 'installing', endpoint: null, config_json: null } as const
    const failedStatus = { state: 'failed', endpoint: null, config_json: null } as const
    const keyPrefix = 'heading.instance.advanced.wordpressMcp'

    /** Mounts with fake `setInterval` only, so `flushPromises` still runs. Returns the wrapper and the alerts spy. */
    async function mountFlow (status: wordpressMcpApi.WordpressMcpStatus = disabledStatus) {
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(status)
      const pinia = createPinia()
      setActivePinia(pinia)
      const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')
      const wrapper = await mountKit(WordpressMcpView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
      await flushPromises()
      return { wrapper, addAlert }
    }

    function hostOf (wrapper: Awaited<ReturnType<typeof mountFlow>>['wrapper']) {
      return wrapper.findComponent(ActionModalHost)
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      resetAppEvents()
      vi.mocked(wordpressMcpApi.enableWordpressMcp).mockResolvedValue(undefined)
      vi.mocked(wordpressMcpApi.disableWordpressMcp).mockResolvedValue(undefined)
    })

    afterEach(() => {
      vi.useRealTimers()
      resetAppEvents()
    })

    it('enable: the click sends POST and the switch goes to loading at once', async () => {
      const { wrapper } = await mountFlow()

      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(wordpressMcpApi.enableWordpressMcp).toHaveBeenCalledWith(9)
      expect(mcpSwitch(wrapper).props('loading')).toBe(true)
      expect(mcpSwitch(wrapper).props('disabled')).toBe(true)
    })

    it('enable: a tick with active shows the success alert and the connection card, then polling stops', async () => {
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)
      vi.advanceTimersByTime(3000)
      await flushPromises()

      expect(addAlert).toHaveBeenLastCalledWith({ success: true, successMessage: `${keyPrefix}.enableSuccess` })
      expect(wrapper.findAll('.step')).toHaveLength(3)
      expect(mcpSwitch(wrapper).props('loading')).toBe(false)

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.advanceTimersByTime(9000)
      await flushPromises()
      expect(wordpressMcpApi.getWordpressMcp).not.toHaveBeenCalled()
    })

    it('websocket with the pending enable: one GET, the result alert, polling stopped', async () => {
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)
      emit('wordpress-mcp-status-changed', { id: 9 })
      await flushPromises()

      expect(wordpressMcpApi.getWordpressMcp).toHaveBeenCalledTimes(1)
      expect(addAlert).toHaveBeenLastCalledWith({ success: true, successMessage: `${keyPrefix}.enableSuccess` })

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.advanceTimersByTime(9000)
      await flushPromises()
      expect(wordpressMcpApi.getWordpressMcp).not.toHaveBeenCalled()
    })

    it('websocket for another instance does nothing', async () => {
      const { wrapper } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      emit('wordpress-mcp-status-changed', { id: 5 })
      await flushPromises()

      expect(wordpressMcpApi.getWordpressMcp).not.toHaveBeenCalled()
    })

    it('websocket without a pending action fetches the status without the skeleton', async () => {
      const { wrapper } = await mountFlow(activeStatus)

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue({ ...activeStatus, state: 'endpoint_unavailable' })
      emit('wordpress-mcp-status-changed', { id: 9 })
      await flushPromises()

      expect(wordpressMcpApi.getWordpressMcp).toHaveBeenCalledTimes(1)
      expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
      expect(wrapper.find('.warning-icon').exists()).toBe(true)
    })

    it('D1: websocket ends the pending enable with disabled, the result is failed and the switch is off without loading', async () => {
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(disabledStatus)
      emit('wordpress-mcp-status-changed', { id: 9 })
      await flushPromises()

      expect(addAlert).toHaveBeenLastCalledWith({ success: false, errorMessage: `${keyPrefix}.failed` })
      expect(mcpSwitch(wrapper).props('modelValue')).toBe(false)
      expect(mcpSwitch(wrapper).props('loading')).toBe(false)
    })

    it('polling without websocket: a tick with disabled keeps the loader, shows no alert, and the next tick polls again', async () => {
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()
      addAlert.mockClear()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(disabledStatus)
      vi.advanceTimersByTime(3000)
      await flushPromises()

      expect(addAlert).not.toHaveBeenCalled()
      expect(mcpSwitch(wrapper).props('loading')).toBe(true)

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.advanceTimersByTime(3000)
      await flushPromises()
      expect(wordpressMcpApi.getWordpressMcp).toHaveBeenCalledTimes(1)
    })

    it('a failed POST shows the error alert, starts no polling and leaves the switch without loading', async () => {
      vi.mocked(wordpressMcpApi.enableWordpressMcp).mockRejectedValue(new Error('post'))
      const { wrapper, addAlert } = await mountFlow()

      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(addAlert).toHaveBeenLastCalledWith(expect.objectContaining({ success: false }))
      expect(mcpSwitch(wrapper).props('loading')).toBe(false)

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.advanceTimersByTime(9000)
      await flushPromises()
      expect(wordpressMcpApi.getWordpressMcp).not.toHaveBeenCalled()
    })

    it('websocket during the POST: after the POST the screen does not go to installing', async () => {
      const post = deferred<void>()
      vi.mocked(wordpressMcpApi.enableWordpressMcp).mockReturnValue(post.promise)
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(activeStatus)
      emit('wordpress-mcp-status-changed', { id: 9 })
      await flushPromises()
      expect(addAlert).toHaveBeenLastCalledWith({ success: true, successMessage: `${keyPrefix}.enableSuccess` })

      post.resolve()
      await flushPromises()

      expect(mcpSwitch(wrapper).props('loading')).toBe(false)
      expect(wrapper.findAll('.step')).toHaveLength(3)
    })

    it('disable: the click opens the confirmation, confirm closes it, sends DELETE and the tick with disabled shows the success alert', async () => {
      const { wrapper, addAlert } = await mountFlow(activeStatus)

      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()
      expect(hostOf(wrapper).props('modal')?.type).toBe('wordpress-mcp-disable')
      expect(hostOf(wrapper).props('open')).toBe(true)

      hostOf(wrapper).vm.$emit('button', 'submit')
      await flushPromises()

      expect(hostOf(wrapper).props('open')).toBe(false)
      expect(wordpressMcpApi.disableWordpressMcp).toHaveBeenCalledWith(9)
      expect(mcpSwitch(wrapper).props('loading')).toBe(true)

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(disabledStatus)
      vi.advanceTimersByTime(3000)
      await flushPromises()

      expect(addAlert).toHaveBeenLastCalledWith({ success: true, successMessage: `${keyPrefix}.disableSuccess` })
      expect(wrapper.findAll('.step')).toHaveLength(0)
    })

    it('disable: cancel closes the confirmation and sends nothing', async () => {
      const { wrapper } = await mountFlow(activeStatus)
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      hostOf(wrapper).vm.$emit('button', 'cancel')
      await flushPromises()

      expect(hostOf(wrapper).props('open')).toBe(false)
      expect(wordpressMcpApi.disableWordpressMcp).not.toHaveBeenCalled()
    })

    it('a click while busy sends no request and opens no dialog', async () => {
      const { wrapper } = await mountFlow(installingStatus)

      expect(mcpSwitch(wrapper).props('loading')).toBe(true)
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(wordpressMcpApi.enableWordpressMcp).not.toHaveBeenCalled()
      expect(wordpressMcpApi.disableWordpressMcp).not.toHaveBeenCalled()
      expect(hostOf(wrapper).props('open')).toBe(false)
    })

    it('unmount during polling stops the next GETs', async () => {
      const { wrapper } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      wrapper.unmount()
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.advanceTimersByTime(9000)
      await flushPromises()

      expect(wordpressMcpApi.getWordpressMcp).not.toHaveBeenCalled()
    })

    it('failed from a tick with a pending action shows the error block without the hint', async () => {
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue(failedStatus)
      vi.advanceTimersByTime(3000)
      await flushPromises()

      expect(addAlert).toHaveBeenLastCalledWith({ success: false, errorMessage: `${keyPrefix}.failed` })
      expect(wrapper.find('span.text-error').text()).toBe(`${keyPrefix}.failed`)
      expect(wrapper.findComponent(AlertSm).exists()).toBe(false)
    })

    it('F1: a tick in flight when the websocket ends the action does not overwrite the state when it resolves late', async () => {
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      const lateTick = deferred<wordpressMcpApi.WordpressMcpStatus>()
      vi.mocked(wordpressMcpApi.getWordpressMcp).mockReturnValueOnce(lateTick.promise)
      vi.advanceTimersByTime(3000)
      await flushPromises()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValueOnce(activeStatus)
      emit('wordpress-mcp-status-changed', { id: 9 })
      await flushPromises()
      expect(addAlert).toHaveBeenLastCalledWith({ success: true, successMessage: `${keyPrefix}.enableSuccess` })

      lateTick.resolve(disabledStatus)
      await flushPromises()

      expect(addAlert).toHaveBeenCalledTimes(1)
      expect(wrapper.findAll('.step')).toHaveLength(3)
      expect(mcpSwitch(wrapper).props('modelValue')).toBe(true)
      expect(mcpSwitch(wrapper).props('loading')).toBe(false)
    })

    it('F3: a failed tick with a pending enable shows the error alert and stops the polling', async () => {
      const { wrapper, addAlert } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockRejectedValue(new Error('tick'))
      vi.advanceTimersByTime(3000)
      await flushPromises()

      expect(addAlert).toHaveBeenLastCalledWith(expect.objectContaining({ success: false }))
      expect(vi.getTimerCount()).toBe(0)

      vi.mocked(wordpressMcpApi.getWordpressMcp).mockClear()
      vi.advanceTimersByTime(9000)
      await flushPromises()
      expect(wordpressMcpApi.getWordpressMcp).not.toHaveBeenCalled()
    })

    it('F2: a POST that resolves after the unmount starts no polling timer', async () => {
      const post = deferred<void>()
      vi.mocked(wordpressMcpApi.enableWordpressMcp).mockReturnValue(post.promise)
      const { wrapper } = await mountFlow()
      await mcpSwitch(wrapper).trigger('click')
      await flushPromises()

      wrapper.unmount()
      post.resolve()
      await flushPromises()

      expect(vi.getTimerCount()).toBe(0)
    })
  })
})

// Characterization of the busy switch box: written on the code that carried the local `mcp-switch` rule, kept after
// the rule moved to `ButtonSwitch`; only the container classes may differ (`mcp-switch` -> `switch-container--gutter-wide switch-container--disabled-solid`).
describe('WordpressMcpView switch DOM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the DOM of the busy switch', async () => {
    vi.mocked(wordpressMcpApi.getWordpressMcp).mockResolvedValue({ state: 'installing', endpoint: null, config_json: null })
    const wrapper = await mountView()

    expect(normalizeHtml(wrapper.find('.switch-container').html()).replace(/ id="switch-v-\d+"/g, '')).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2 mt-0"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-input--disabled v-switch v-switch--flat v-switch--size-default v-switch--loading mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--disabled v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input checked="" disabled="" aria-disabled="true" aria-label="heading.instance.advanced.wordpressMcp.title" type="checkbox" value="true"><div class="v-switch__thumb v-switch__thumb--filled" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"><div class="v-switch__loader"><div class="v-progress-circular v-progress-circular--indeterminate v-theme--light text-primary" style="width: 16px; height: 16px; --v-progress-reveal-duration: 900ms;" role="progressbar" aria-valuemin="0" aria-valuemax="100" active="true"><svg></svg></div></div></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })
})
