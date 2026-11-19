import type { Ref } from 'vue'
import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { activatePlugin, deactivatePlugin, deletePlugin, installPlugin, updatePlugin } from '@/entities/project/instance-plugins.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { on, resetAppEvents } from '@/shared/events/app-events'
import { usePluginActions } from './use-plugin-actions'

vi.mock('@/entities/project/instance-plugins.api', () => ({
  activatePlugin: vi.fn(),
  deactivatePlugin: vi.fn(),
  deletePlugin: vi.fn(),
  installPlugin: vi.fn(),
  updatePlugin: vi.fn(),
}))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => `t:${key}` }) }))

function plugin (overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return { name: 'akismet', title: 'Akismet', description: '', version: '1.0.0', status: 'inactive', ...overrides }
}

function setup () {
  const setPluginsData = vi.fn()
  const instance = ref({ id: 7, setPluginsData }) as unknown as Ref<InstanceResource>
  const setItems = vi.fn()
  const loadData = vi.fn(async () => undefined)
  const rememberInstalling = vi.fn()
  const clear = vi.fn()
  const actions = effectScope().run(() => usePluginActions({ instance, page: { setItems, loadData, rememberInstalling }, selection: { clear } }))!
  return { actions, instance, setPluginsData, setItems, loadData, rememberInstalling, clear }
}

describe('usePluginActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetAppEvents()
  })

  it('activates the plugin by name, alerts success, closes and reloads the list', async () => {
    vi.mocked(activatePlugin).mockResolvedValueOnce(undefined)
    const { actions, loadData } = setup()

    actions.openActivate(plugin())
    await actions.onButton('submit')

    expect(activatePlugin).toHaveBeenCalledWith(7, 'akismet')
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.plugin.activate.success' })
    expect(actions.modalOpen.value).toBe(false)
    expect(loadData).toHaveBeenCalledOnce()
  })

  it('deactivates the plugin by name and reloads the list', async () => {
    vi.mocked(deactivatePlugin).mockResolvedValueOnce(undefined)
    const { actions, loadData } = setup()

    actions.openDeactivate(plugin({ status: 'active' }))
    await actions.onButton('submit')

    expect(deactivatePlugin).toHaveBeenCalledWith(7, 'akismet')
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.plugin.deactivate.success' })
    expect(loadData).toHaveBeenCalledOnce()
  })

  it('deletes the plugin and takes the full list from the response without reloading', async () => {
    const remaining = [plugin({ name: 'hello-dolly' })]
    vi.mocked(deletePlugin).mockResolvedValueOnce(remaining)
    const { actions, setItems, loadData } = setup()

    actions.openDelete(plugin())
    await actions.onButton('submit')

    expect(deletePlugin).toHaveBeenCalledWith(7, 'akismet')
    expect(setItems).toHaveBeenCalledWith(remaining)
    expect(loadData).not.toHaveBeenCalled()
    expect(actions.modalOpen.value).toBe(false)
  })

  it('installs the plugin and emits plugin-item-changed with the pending install status', async () => {
    vi.mocked(installPlugin).mockResolvedValueOnce(undefined)
    const received: unknown[] = []
    const off = on('plugin-item-changed', payload => received.push(payload))
    const { actions, loadData, rememberInstalling } = setup()
    const catalogue = { name: 'Hello Dolly', slug: 'hello-dolly', short_description: '', rating: 80 } as RepositoryPlugin

    actions.openInstall(catalogue)
    await actions.onButton('submit')
    off()

    expect(installPlugin).toHaveBeenCalledWith(7, 'hello-dolly')
    expect(received).toEqual([expect.objectContaining({ slug: 'hello-dolly', async_status: { install: 'pending' } })])
    expect(rememberInstalling).toHaveBeenCalledWith(catalogue)
    expect(loadData).toHaveBeenCalledOnce()
  })

  it('updates the plugin and emits plugin-item-changed with the pending update status', async () => {
    vi.mocked(updatePlugin).mockResolvedValueOnce(undefined)
    const received: unknown[] = []
    const off = on('plugin-item-changed', payload => received.push(payload))
    const { actions, loadData } = setup()

    actions.openUpdate(plugin({ status: 'active', update: 'available', update_version: '2.0' }))
    await actions.onButton('submit')
    off()

    expect(updatePlugin).toHaveBeenCalledWith(7, 'akismet')
    expect(received).toEqual([expect.objectContaining({ name: 'akismet', async_status: { update: 'pending' } })])
    expect(loadData).toHaveBeenCalledOnce()
  })

  it('alerts the API message on failure and closes the dialog', async () => {
    vi.mocked(activatePlugin).mockRejectedValueOnce({ response: { status: 500, data: { message: 'Plugin is broken' } } })
    const { actions, loadData, setItems } = setup()

    actions.openActivate(plugin())
    await actions.onButton('submit')

    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Plugin is broken' })
    expect(actions.modalOpen.value).toBe(false)
    expect(loadData).not.toHaveBeenCalled()
    expect(setItems).not.toHaveBeenCalled()
  })

  it('keeps the list when a delete fails', async () => {
    vi.mocked(deletePlugin).mockRejectedValueOnce(new Error('network'))
    const { actions, setItems } = setup()

    actions.openDelete(plugin())
    await actions.onButton('submit')

    expect(setItems).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts[0]?.success).toBe(false)
  })

  it('activates the selected plugins one after another, alerts success once and clears the selection', async () => {
    const order: string[] = []
    vi.mocked(activatePlugin).mockImplementation(async (_id, name) => {
      order.push(`start:${name}`)
      await Promise.resolve()
      order.push(`end:${name}`)
    })
    const { actions, loadData, clear } = setup()

    actions.openMassActivate([plugin(), plugin({ name: 'hello-dolly' })])
    await actions.onButton('submit')

    expect(order).toEqual(['start:akismet', 'end:akismet', 'start:hello-dolly', 'end:hello-dolly'])
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.plugin.activate.success' })
    expect(clear).toHaveBeenCalledOnce()
    expect(actions.modalOpen.value).toBe(false)
    expect(loadData).toHaveBeenCalledOnce()
  })

  it('keeps going after a failed activation, alerts each distinct error once and keeps the selection', async () => {
    vi.mocked(deactivatePlugin)
      .mockRejectedValueOnce({ response: { status: 500, data: { message: 'Broken' } } })
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ response: { status: 500, data: { message: 'Broken' } } })
    const { actions, loadData, clear } = setup()

    actions.openMassDeactivate([plugin({ status: 'active' }), plugin({ name: 'b', status: 'active' }), plugin({ name: 'c', status: 'active' })])
    await actions.onButton('submit')

    expect(deactivatePlugin).toHaveBeenCalledTimes(3)
    const alerts = useAlertsStore().activeAlerts
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ success: false, errorMessage: 'Broken' })
    expect(clear).not.toHaveBeenCalled()
    expect(loadData).toHaveBeenCalledOnce()
    expect(actions.modalOpen.value).toBe(false)
  })

  it('sends the mass update only to the plugins that have an update and clears the selection after success', async () => {
    vi.mocked(updatePlugin).mockResolvedValue(undefined)
    const { actions, clear } = setup()

    actions.openMassUpdate([
      plugin({ name: 'akismet', update: 'available', update_version: '2.0' }),
      plugin({ name: 'hello-dolly' }),
    ])
    await actions.onButton('submit')

    expect(updatePlugin).toHaveBeenCalledTimes(1)
    expect(updatePlugin).toHaveBeenCalledWith(7, 'akismet')
    expect(useAlertsStore().activeAlerts[0]).toMatchObject({ success: true, successMessage: 't:notification.instance.plugin.update.success_other' })
    expect(clear).toHaveBeenCalledOnce()
  })

  it('deletes every selected plugin, clears the selection and reloads the list without touching the instance', async () => {
    vi.mocked(deletePlugin).mockResolvedValue([])
    const { actions, clear, loadData, setPluginsData, setItems } = setup()

    actions.openMassDelete([plugin(), plugin({ name: 'hello-dolly' })])
    await actions.onButton('submit')

    expect(deletePlugin).toHaveBeenCalledWith(7, 'akismet')
    expect(deletePlugin).toHaveBeenCalledWith(7, 'hello-dolly')
    expect(clear).toHaveBeenCalledOnce()
    expect(loadData).toHaveBeenCalledOnce()
    expect(setPluginsData).not.toHaveBeenCalled()
    expect(setItems).not.toHaveBeenCalled()
  })

  it('reloads the list after a mass delete or update that partly fails, keeping the selection', async () => {
    vi.mocked(deletePlugin).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network'))
    vi.mocked(updatePlugin).mockRejectedValueOnce(new Error('network'))
    const { actions, clear, loadData } = setup()

    actions.openMassDelete([plugin(), plugin({ name: 'hello-dolly' })])
    await actions.onButton('submit')
    actions.openMassUpdate([plugin({ update: 'available', update_version: '2.0' })])
    await actions.onButton('submit')

    expect(loadData).toHaveBeenCalledTimes(2)
    expect(clear).not.toHaveBeenCalled()
    expect(useAlertsStore().activeAlerts.every(alert => alert.success === false)).toBe(true)
  })
})
