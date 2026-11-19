import type { Ref } from 'vue'
import type { InstanceResource } from '@/entities/project/instance-resource'
import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { activateTheme, deleteTheme, installTheme, updateTheme } from '@/entities/project/instance-themes.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { on, resetAppEvents } from '@/shared/events/app-events'
import { isDemoMode } from '@/shared/session/demo-mode'
import { useThemeActions } from './use-theme-actions'

vi.mock('@/entities/project/instance-themes.api', () => ({
  activateTheme: vi.fn(),
  deleteTheme: vi.fn(),
  installTheme: vi.fn(),
  updateTheme: vi.fn(),
}))
vi.mock('@/shared/session/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => `t:${key}` }) }))

function theme (overrides: Partial<InstalledTheme> = {}): InstalledTheme {
  return { name: 'twentytwentyfour', title: 'Twenty Twenty-Four', description: '', version: '1.0', status: 'inactive', ...overrides }
}

// `allItems` is the full installed list the page holds; the mass delete looks the active theme up in it, not in the selection.
function setup (allItems: InstalledTheme[] = []) {
  const instance = ref({ id: 7 }) as unknown as Ref<InstanceResource>
  const loadData = vi.fn(async () => undefined)
  const clear = vi.fn()
  const page = { allItems: ref<InstalledTheme[]>(allItems), loadData }
  const actions = effectScope().run(() => useThemeActions({ instance, page, selection: { clear } }))!
  return { actions, loadData, clear }
}

describe('useThemeActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetAppEvents()
  })

  it('activates the theme by name, alerts success, closes and reloads the list', async () => {
    vi.mocked(activateTheme).mockResolvedValueOnce(undefined)
    const { actions, loadData } = setup()

    actions.openActivate(theme())
    await actions.onButton('submit')

    expect(activateTheme).toHaveBeenCalledWith(7, 'twentytwentyfour')
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.theme.activate.success' })
    expect(actions.modalOpen.value).toBe(false)
    expect(loadData).toHaveBeenCalledOnce()
  })

  it('updates the theme and emits theme-item-changed with the pending update status before the reload', async () => {
    vi.mocked(updateTheme).mockResolvedValueOnce(undefined)
    const received: unknown[] = []
    const off = on('theme-item-changed', payload => received.push(payload))
    const { actions, loadData } = setup()

    actions.openUpdate(theme({ status: 'active', update: 'available', update_version: '2.0' }))
    await actions.onButton('submit')
    off()

    expect(updateTheme).toHaveBeenCalledWith(7, 'twentytwentyfour')
    expect(received).toEqual([expect.objectContaining({ name: 'twentytwentyfour', async_status: { update: 'pending' } })])
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.theme.update.success' })
    expect(loadData).toHaveBeenCalledOnce()
    expect(actions.modalOpen.value).toBe(false)
  })

  it('deletes the theme by name, ignores the answer and reloads the list', async () => {
    vi.mocked(deleteTheme).mockResolvedValueOnce(undefined)
    const { actions, loadData } = setup()

    actions.openDelete(theme())
    await actions.onButton('submit')

    expect(deleteTheme).toHaveBeenCalledWith(7, 'twentytwentyfour')
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.theme.delete.success' })
    expect(loadData).toHaveBeenCalledOnce()
    expect(actions.modalOpen.value).toBe(false)
  })

  it('alerts the API message on failure, closes the dialog and does not reload', async () => {
    vi.mocked(activateTheme).mockRejectedValueOnce({ response: { status: 500, data: { message: 'Theme is broken' } } })
    const { actions, loadData } = setup()

    actions.openActivate(theme())
    await actions.onButton('submit')

    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Theme is broken' })
    expect(actions.modalOpen.value).toBe(false)
    expect(loadData).not.toHaveBeenCalled()
  })

  it('alerts a failed delete and keeps the list as it is', async () => {
    vi.mocked(deleteTheme).mockRejectedValueOnce(new Error('network'))
    const { actions, loadData } = setup()

    actions.openDelete(theme())
    await actions.onButton('submit')

    expect(useAlertsStore().activeAlerts[0]?.success).toBe(false)
    expect(actions.modalOpen.value).toBe(false)
    expect(loadData).not.toHaveBeenCalled()
  })
})

describe('useThemeActions: install', () => {
  function catalogue (overrides: Partial<RepositoryTheme> = {}): RepositoryTheme {
    return { id: 1, slug: 'astra', name: 'Astra', version: '4.0', rating: 90, ...overrides }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetAppEvents()
  })

  it('installs the catalogue theme by its slug, emits the pending install status, alerts success and reloads the list', async () => {
    vi.mocked(installTheme).mockResolvedValueOnce(undefined)
    const received: unknown[] = []
    const off = on('theme-item-changed', payload => received.push(payload))
    const { actions, loadData } = setup()

    actions.openInstall(catalogue())
    await actions.onButton('submit')
    off()

    expect(installTheme).toHaveBeenCalledWith(7, 'astra')
    expect(received).toEqual([expect.objectContaining({ slug: 'astra', async_status: { install: 'pending' } })])
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.theme.install.success' })
    expect(loadData).toHaveBeenCalledOnce()
    expect(actions.modalOpen.value).toBe(false)
  })

  it('alerts a failed install, closes the dialog and does not emit or reload', async () => {
    vi.mocked(installTheme).mockRejectedValueOnce(new Error('network'))
    const received: unknown[] = []
    const off = on('theme-item-changed', payload => received.push(payload))
    const { actions, loadData } = setup()

    actions.openInstall(catalogue())
    await actions.onButton('submit')
    off()

    expect(useAlertsStore().activeAlerts[0]?.success).toBe(false)
    expect(actions.modalOpen.value).toBe(false)
    expect(received).toEqual([])
    expect(loadData).not.toHaveBeenCalled()
  })
})

describe('useThemeActions: mass actions', () => {
  const astra = theme({ name: 'astra', title: 'Astra', status: 'active', update: 'available', update_version: '4.1' })
  const storefront = theme({ name: 'storefront', title: 'Storefront' })
  const hello = theme({ name: 'hello-elementor', title: 'Hello Elementor' })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetAppEvents()
    vi.mocked(isDemoMode).mockReturnValue(false)
  })

  it('updates every selected theme, alerts success, clears the selection and reloads the list', async () => {
    vi.mocked(updateTheme).mockResolvedValue(undefined)
    const { actions, loadData, clear } = setup([astra, storefront, hello])

    actions.openMassUpdate([storefront, hello])
    await actions.onButton('submit')

    expect(updateTheme).toHaveBeenCalledTimes(2)
    expect(updateTheme).toHaveBeenCalledWith(7, 'storefront')
    expect(updateTheme).toHaveBeenCalledWith(7, 'hello-elementor')
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.theme.update.success' })
    expect(clear).toHaveBeenCalledOnce()
    expect(loadData).toHaveBeenCalledOnce()
    expect(actions.modalOpen.value).toBe(false)
  })

  it('reloads and keeps the selection when a mass update fails', async () => {
    vi.mocked(updateTheme).mockRejectedValueOnce(new Error('network'))
    const { actions, loadData, clear } = setup([storefront])

    actions.openMassUpdate([storefront])
    await actions.onButton('submit')

    expect(useAlertsStore().activeAlerts[0]?.success).toBe(false)
    expect(clear).not.toHaveBeenCalled()
    expect(loadData).toHaveBeenCalledOnce()
    expect(actions.modalOpen.value).toBe(false)
  })

  it('deletes the selection without the active theme and alerts the skipped active theme', async () => {
    vi.mocked(deleteTheme).mockResolvedValue(undefined)
    const { actions, loadData, clear } = setup([astra, storefront, hello])

    actions.openMassDelete([astra, storefront])
    await actions.onButton('submit')

    expect(deleteTheme).toHaveBeenCalledExactlyOnceWith(7, 'storefront')
    expect(useAlertsStore().activeAlerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ success: false, errorMessage: 't:notification.instance.theme.delete.error' }),
      expect.objectContaining({ success: true, successMessage: 't:notification.instance.theme.delete.success' }),
    ]))
    expect(clear).toHaveBeenCalledOnce()
    expect(loadData).toHaveBeenCalledOnce()
  })

  it('does not throw when the active theme is not on the page of the selection', async () => {
    vi.mocked(deleteTheme).mockResolvedValue(undefined)
    const { actions } = setup([astra, storefront, hello])

    actions.openMassDelete([hello])
    await actions.onButton('submit')

    expect(deleteTheme).toHaveBeenCalledWith(7, 'hello-elementor')
    expect(useAlertsStore().activeAlerts.some(alert => alert.success === false)).toBe(false)
  })

  it('deletes the selected active theme in the demo mode', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)
    vi.mocked(deleteTheme).mockResolvedValue(undefined)
    const { actions } = setup([astra])

    actions.openMassDelete([astra])
    await actions.onButton('submit')

    expect(deleteTheme).toHaveBeenCalledWith(7, 'astra')
    expect(useAlertsStore().activeAlerts.some(alert => alert.success === false)).toBe(false)
  })

  it('sends nothing, closes and does not reload when only the active theme is selected', async () => {
    const { actions, loadData, clear } = setup([astra, storefront])

    actions.openMassDelete([astra])
    await actions.onButton('submit')

    expect(deleteTheme).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: false, errorMessage: 't:notification.instance.theme.delete.error' })
    expect(actions.modalOpen.value).toBe(false)
    expect(loadData).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('reloads and keeps the selection when a mass delete partly fails', async () => {
    vi.mocked(deleteTheme).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'))
    const { actions, loadData, clear } = setup([storefront, hello])

    actions.openMassDelete([storefront, hello])
    await actions.onButton('submit')

    expect(loadData).toHaveBeenCalledOnce()
    expect(clear).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts.every(alert => alert.success === false)).toBe(true)
  })
})
