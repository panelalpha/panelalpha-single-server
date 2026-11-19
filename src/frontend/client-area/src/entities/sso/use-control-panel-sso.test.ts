import type * as I18nextVue from 'i18next-vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as controlPanelApi from './control-panel-sso.api'
import { useControlPanelSso } from './use-control-panel-sso'

// The composable reads `useTranslation` (it runs in a component's setup), so the test answers the keys as they are.
vi.mock('i18next-vue', async importOriginal => ({
  ...(await importOriginal<typeof I18nextVue>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('./control-panel-sso.api', () => ({ getControlPanelSsoUrl: vi.fn() }))

describe('useControlPanelSso', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.stubGlobal('open', vi.fn())
  })

  it('opens the returned URL in a new tab', async () => {
    vi.mocked(controlPanelApi.getControlPanelSsoUrl).mockResolvedValue('https://cp.example.com/login?t=1')
    const { open, loading } = useControlPanelSso()

    const pending = open(11)
    expect(loading.value).toBe(true)
    await pending

    expect(controlPanelApi.getControlPanelSsoUrl).toHaveBeenCalledWith(11)
    expect(window.open).toHaveBeenCalledWith('https://cp.example.com/login?t=1')
    expect(loading.value).toBe(false)
  })

  it('raises no alert when the browser opened the tab', async () => {
    vi.mocked(controlPanelApi.getControlPanelSsoUrl).mockResolvedValue('https://cp.example.com/login?t=1')
    vi.mocked(window.open).mockReturnValue({ closed: false } as Window)
    const { open } = useControlPanelSso()

    await open(11)

    expect(useAlertsStore().activeAlerts).toHaveLength(0)
  })

  it('raises an alert when the browser blocked the popup', async () => {
    vi.mocked(controlPanelApi.getControlPanelSsoUrl).mockResolvedValue('https://cp.example.com/login?t=1')
    vi.mocked(window.open).mockReturnValue(null)
    const { open, loading } = useControlPanelSso()

    await open(11)

    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'message.status.action.error' }])
    expect(loading.value).toBe(false)
  })

  it('ignores a click while a request is running', async () => {
    let resolve: (url: string) => void = () => undefined
    vi.mocked(controlPanelApi.getControlPanelSsoUrl).mockReturnValue(new Promise(done => {
      resolve = done
    }))
    const { open } = useControlPanelSso()

    const first = open(11)
    await open(11)
    expect(controlPanelApi.getControlPanelSsoUrl).toHaveBeenCalledTimes(1)

    resolve('https://cp.example.com')
    await first
  })

  it('shows an error alert (backend 422 message) and releases the button', async () => {
    vi.mocked(controlPanelApi.getControlPanelSsoUrl).mockRejectedValue({ response: { data: { message: 'Control panel SSO is disabled.' } } })
    const { open, loading } = useControlPanelSso()
    await open(11)

    expect(window.open).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'Control panel SSO is disabled.' }])
    expect(loading.value).toBe(false)
  })
})
