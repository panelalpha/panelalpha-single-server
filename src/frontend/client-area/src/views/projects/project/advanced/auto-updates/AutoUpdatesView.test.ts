import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VSelect } from 'vuetify/components'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
import AppMessage from '@/shared/ui/message/AppMessage.vue'
import SettingCardSkeleton from '@/shared/ui/setting-card/SettingCardSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import * as autoUpdatesApi from './auto-updates.api'
import AutoUpdatesView from './AutoUpdatesView.vue'

vi.mock('./auto-updates.api', () => ({
  getAutoUpdates: vi.fn(),
  updateAutoUpdates: vi.fn(),
}))

function makeInstance (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 9,
    auto_updates: { wordpress: true },
    ...overrides,
  } as unknown as InstanceResource
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

async function mountView (instance: InstanceResource = makeInstance()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(AutoUpdatesView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

// Switches in template order: WordPress (only when shown), plugins, themes.
function switches (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findAllComponents(ButtonSwitch)
}

describe('AutoUpdatesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 0, auto_update_plugins: 0, auto_update_themes: 0 })
  })

  it('renders the page title', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('h4.page-title__title').text()).toBe('heading.instance.advanced.autoUpdates.title')
  })

  it('renders the three setting cards with an h6 title and their subtitle', async () => {
    const wrapper = await mountView()

    expect(wrapper.findAll('h6').map(heading => heading.text())).toEqual([
      'heading.instance.advanced.autoUpdates.upgrade.title',
      'heading.instance.advanced.autoUpdates.upgrade.plugin.title',
      'heading.instance.advanced.autoUpdates.upgrade.theme.title',
    ])
    expect(wrapper.text()).toContain('heading.instance.advanced.autoUpdates.upgrade.plugin.subtitle')
    wrapper.unmount()
  })

  it('loads the settings of the instance on mount', async () => {
    await mountView()

    expect(autoUpdatesApi.getAutoUpdates).toHaveBeenCalledWith(9)
  })

  it('shows three skeletons while loading when the WordPress card is shown', async () => {
    const pending = deferred<autoUpdatesApi.AutoUpdatesSettings>()
    vi.mocked(autoUpdatesApi.getAutoUpdates).mockReturnValue(pending.promise)

    const wrapper = await mountKit(AutoUpdatesView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })

    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(3)
    expect(wrapper.findAllComponents(ButtonSwitch)).toHaveLength(0)

    pending.resolve({})
    await flushPromises()

    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
  })

  it('shows two skeletons while loading when the WordPress card is hidden', async () => {
    const pending = deferred<autoUpdatesApi.AutoUpdatesSettings>()
    vi.mocked(autoUpdatesApi.getAutoUpdates).mockReturnValue(pending.promise)

    const wrapper = await mountKit(AutoUpdatesView, {
      props: { instance: makeInstance({ auto_updates: { wordpress: false } }) },
      global: { plugins: [createPinia()] },
    })

    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(2)
  })

  it('hides the WordPress card when auto_updates is missing', async () => {
    const wrapper = await mountView(makeInstance({ auto_updates: undefined }))

    expect(wrapper.text()).not.toContain('heading.instance.advanced.autoUpdates.upgrade.title')
    expect(wrapper.text()).toContain('heading.instance.advanced.autoUpdates.upgrade.plugin.title')
    expect(switches(wrapper)).toHaveLength(2)
  })

  it('hides the WordPress card when wordpress is false', async () => {
    const wrapper = await mountView(makeInstance({ auto_updates: { wordpress: false } }))

    expect(wrapper.text()).not.toContain('heading.instance.advanced.autoUpdates.upgrade.title')
    expect(switches(wrapper)).toHaveLength(2)
  })

  it('reflects 0 and 1 of the plugins and themes switches', async () => {
    vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 0, auto_update_plugins: 1, auto_update_themes: 0 })

    const wrapper = await mountView()

    expect(switches(wrapper)[0]!.props('modelValue')).toBe(false)
    expect(switches(wrapper)[1]!.props('modelValue')).toBe(true)
    expect(switches(wrapper)[2]!.props('modelValue')).toBe(false)
  })

  it('reflects 1 of the WordPress switch and the themes switch', async () => {
    vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 1, auto_update_plugins: 0, auto_update_themes: 1 })

    const wrapper = await mountView()

    expect(switches(wrapper)[0]!.props('modelValue')).toBe(true)
    expect(switches(wrapper)[1]!.props('modelValue')).toBe(false)
    expect(switches(wrapper)[2]!.props('modelValue')).toBe(true)
  })

  it('shows the version select for auto_update 1 and 2', async () => {
    for (const value of [1, 2]) {
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: value, auto_update_plugins: 0, auto_update_themes: 0 })

      const wrapper = await mountView()

      expect(wrapper.findComponent(VSelect).exists()).toBe(true)
      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe(value)
      wrapper.unmount()
    }
  })

  it('hides the version select for auto_update 0', async () => {
    const wrapper = await mountView()

    expect(wrapper.findComponent(VSelect).exists()).toBe(false)
  })

  it('offers the latest and minor options with translated titles', async () => {
    vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 1 })

    const wrapper = await mountView()

    expect(wrapper.findComponent(VSelect).props('items')).toEqual([
      { title: 'heading.instance.advanced.autoUpdates.upgrade.option.latest', value: 1 },
      { title: 'heading.instance.advanced.autoUpdates.upgrade.option.minor', value: 2 },
    ])
  })

  it('alerts with the error message and leaves every switch off when the GET fails', async () => {
    vi.mocked(autoUpdatesApi.getAutoUpdates).mockRejectedValue(new Error('boom'))

    const wrapper = await mountView()
    const alerts = useAlertsStore()

    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    expect(switches(wrapper).every(sw => sw.props('modelValue') === false)).toBe(true)
    expect(wrapper.findComponent(VSelect).exists()).toBe(false)
    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
  })

  describe('saving', () => {
    // Settings with all three fields on different values, so each PUT body shows whether the other two fields are kept.
    const SAVED = { auto_update: 1, auto_update_plugins: 0, auto_update_themes: 1 }

    beforeEach(() => {
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ ...SAVED })
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockResolvedValue(undefined)
    })

    it('sends the full body with the WordPress switch reversed', async () => {
      const wrapper = await mountView()

      await switches(wrapper)[0]!.trigger('click')
      await flushPromises()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledWith(9, { auto_update: 0, auto_update_plugins: 0, auto_update_themes: 1 })
    })

    it('sends the full body with the plugins and themes switches reversed', async () => {
      const wrapper = await mountView()

      await switches(wrapper)[1]!.trigger('click')
      await flushPromises()
      await switches(wrapper)[2]!.trigger('click')
      await flushPromises()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenNthCalledWith(1, 9, { auto_update: 1, auto_update_plugins: 1, auto_update_themes: 1 })
      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenNthCalledWith(2, 9, { auto_update: 1, auto_update_plugins: 0, auto_update_themes: 0 })
    })

    it('sends the full body with the selected version', async () => {
      const wrapper = await mountView()

      wrapper.findComponent(VSelect).vm.$emit('update:modelValue', 2)
      await flushPromises()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledWith(9, { auto_update: 2, auto_update_plugins: 0, auto_update_themes: 1 })
    })

    it('alerts success and shows the value of the second GET', async () => {
      const wrapper = await mountView()
      const alerts = useAlertsStore()
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValueOnce({ auto_update: 1, auto_update_plugins: 1, auto_update_themes: 1 })

      await switches(wrapper)[1]!.trigger('click')
      await flushPromises()

      expect(autoUpdatesApi.getAutoUpdates).toHaveBeenCalledTimes(2)
      expect(switches(wrapper)[1]!.props('modelValue')).toBe(true)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.settings.update' })
    })

    it('keeps the saved value and shows no error when the second GET fails', async () => {
      const wrapper = await mountView()
      const alerts = useAlertsStore()
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockRejectedValueOnce(new Error('boom'))

      await switches(wrapper)[1]!.trigger('click')
      await flushPromises()

      expect(switches(wrapper)[1]!.props('modelValue')).toBe(true)
      expect(alerts.activeAlerts.some(alert => alert.success === false)).toBe(false)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true })
    })

    it('shows the clicked position before the PUT resolves', async () => {
      const save = deferred<void>()
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockReturnValue(save.promise)
      const wrapper = await mountView()
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValueOnce({ ...SAVED, auto_update_plugins: 1 })

      await switches(wrapper)[1]!.trigger('click')
      await nextTick()

      // The switch the tester clicked (and the checkbox the browser paints) is already on, while the Engine is still working.
      expect(switches(wrapper)[1]!.props('modelValue')).toBe(true)
      expect((wrapper.findAll('input[type=checkbox]')[1]!.element as HTMLInputElement).checked).toBe(true)

      save.resolve(undefined)
      await flushPromises()

      expect((wrapper.findAll('input[type=checkbox]')[1]!.element as HTMLInputElement).checked).toBe(true)
    })

    it('puts the saved position back when the PUT fails', async () => {
      const save = deferred<void>()
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await switches(wrapper)[1]!.trigger('click')
      await nextTick()
      expect(switches(wrapper)[1]!.props('modelValue')).toBe(true)

      save.reject(new Error('boom'))
      await flushPromises()

      expect(switches(wrapper)[1]!.props('modelValue')).toBe(false)
      expect((wrapper.findAll('input[type=checkbox]')[1]!.element as HTMLInputElement).checked).toBe(false)
    })

    it('alerts the error and skips the second GET when the PUT fails', async () => {
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      await switches(wrapper)[0]!.trigger('click')
      await flushPromises()

      expect(autoUpdatesApi.getAutoUpdates).toHaveBeenCalledTimes(1)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
      expect(alerts.activeAlerts.some(alert => alert.success === true)).toBe(false)
      expect(switches(wrapper)[0]!.props('modelValue')).toBe(true)
      expect(switches(wrapper)[0]!.props('loading')).toBe(false)
    })

    it('shows the loader only on the switch being saved', async () => {
      const save = deferred<void>()
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await switches(wrapper)[1]!.trigger('click')
      await nextTick()

      expect(switches(wrapper).map(sw => sw.props('loading'))).toEqual([false, true, false])

      save.resolve(undefined)
      await flushPromises()

      expect(switches(wrapper).map(sw => sw.props('loading'))).toEqual([false, false, false])
    })

    it('ignores a second click on the same card while a save is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await switches(wrapper)[1]!.trigger('click')
      await nextTick()
      await switches(wrapper)[1]!.trigger('click')
      await nextTick()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledTimes(1)

      save.resolve(undefined)
      await flushPromises()
    })

    it('ignores a click on another card while a save is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await switches(wrapper)[1]!.trigger('click')
      await nextTick()
      await switches(wrapper)[2]!.trigger('click')
      await nextTick()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledTimes(1)

      save.resolve(undefined)
      await flushPromises()
    })

    it('keeps the lock and the loader until the GET after a save resolves', async () => {
      const wrapper = await mountView()
      const refresh = deferred<autoUpdatesApi.AutoUpdatesSettings>()
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockReturnValueOnce(refresh.promise)

      await switches(wrapper)[1]!.trigger('click')
      await flushPromises()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledTimes(1)
      expect(autoUpdatesApi.getAutoUpdates).toHaveBeenCalledTimes(2)
      expect(switches(wrapper).map(sw => sw.props('loading'))).toEqual([false, true, false])

      await switches(wrapper)[2]!.trigger('click')
      await nextTick()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledTimes(1)

      refresh.resolve({ ...SAVED, auto_update_plugins: 1 })
      await flushPromises()

      expect(switches(wrapper).map(sw => sw.props('loading'))).toEqual([false, false, false])
    })

    it('ignores a select change while a save is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await switches(wrapper)[2]!.trigger('click')
      await nextTick()
      wrapper.findComponent(VSelect).vm.$emit('update:modelValue', 2)
      await nextTick()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledTimes(1)

      save.resolve(undefined)
      await flushPromises()
    })

    it('shows the saved version after a failed select save', async () => {
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()

      wrapper.findComponent(VSelect).vm.$emit('update:modelValue', 2)
      await flushPromises()

      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe(1)
      expect(wrapper.findComponent(VSelect).text()).toBe('heading.instance.advanced.autoUpdates.upgrade.option.latest')
    })

    it('shows the picked version before the PUT resolves', async () => {
      const save = deferred<void>()
      vi.mocked(autoUpdatesApi.updateAutoUpdates).mockReturnValue(save.promise)
      const wrapper = await mountView()

      wrapper.findComponent(VSelect).vm.$emit('update:modelValue', 2)
      await nextTick()

      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe(2)

      save.reject(new Error('boom'))
      await flushPromises()

      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe(1)
    })

    it('shows the version from the second GET after a successful select save', async () => {
      const wrapper = await mountView()
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValueOnce({ ...SAVED, auto_update: 2 })

      wrapper.findComponent(VSelect).vm.$emit('update:modelValue', 2)
      await flushPromises()

      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe(2)
      expect(wrapper.findComponent(VSelect).text()).toBe('heading.instance.advanced.autoUpdates.upgrade.option.minor')
    })

    it('opens the version select with latest after the WordPress switch is turned on', async () => {
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValueOnce({ auto_update: 0, auto_update_plugins: 0, auto_update_themes: 0 })
      const wrapper = await mountView()

      expect(wrapper.findComponent(VSelect).exists()).toBe(false)

      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValueOnce({ auto_update: 1, auto_update_plugins: 0, auto_update_themes: 0 })
      await switches(wrapper)[0]!.trigger('click')
      await flushPromises()

      expect(autoUpdatesApi.updateAutoUpdates).toHaveBeenCalledWith(9, { auto_update: 1, auto_update_plugins: 0, auto_update_themes: 0 })
      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe(1)
    })
  })

  describe('blocked-by alert and partial plugins (app only)', () => {
    const BLOCKED_KEY = 'heading.instance.advanced.autoUpdates.blockedBy'
    const PARTIAL_KEY = 'heading.instance.advanced.autoUpdates.upgrade.plugin.partial'

    // The test i18n returns the key for a missing translation, so the list is checked through a real resource for that key only.
    beforeEach(() => {
      i18next.addResource('en', 'translation', BLOCKED_KEY, 'Blocked by: {{constants}}')
    })

    function alertOf (wrapper: Awaited<ReturnType<typeof mountView>>) {
      return wrapper.findComponent(AppMessage)
    }

    it('shows the blocking constants joined with a comma and space after the GET', async () => {
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({
        auto_update: 0,
        auto_update_plugins: 0,
        auto_update_themes: 0,
        updater_blocked_by: ['DISALLOW_FILE_MODS', 'AUTOMATIC_UPDATER_DISABLED'],
      })

      const wrapper = await mountView()

      expect(alertOf(wrapper).exists()).toBe(true)
      expect(alertOf(wrapper).props('variant')).toBe('warning')
      expect(alertOf(wrapper).text()).toBe('Blocked by: DISALLOW_FILE_MODS, AUTOMATIC_UPDATER_DISABLED')
    })

    it('shows no alert while the GET is in flight', async () => {
      const pending = deferred<autoUpdatesApi.AutoUpdatesSettings>()
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockReturnValue(pending.promise)

      const wrapper = await mountKit(AutoUpdatesView, { props: { instance: makeInstance() }, global: { plugins: [createPinia()] } })

      expect(alertOf(wrapper).exists()).toBe(false)

      pending.resolve({ updater_blocked_by: ['DISALLOW_FILE_MODS'] })
      await flushPromises()

      expect(alertOf(wrapper).exists()).toBe(true)
    })

    it('shows no alert for an empty blocking list', async () => {
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 0, auto_update_plugins: 0, auto_update_themes: 0, updater_blocked_by: [] })

      const wrapper = await mountView()

      expect(alertOf(wrapper).exists()).toBe(false)
    })

    it('shows no alert for the lite response with only the three fields', async () => {
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 1, auto_update_plugins: 0, auto_update_themes: 0 })

      const wrapper = await mountView()

      expect(alertOf(wrapper).exists()).toBe(false)
    })

    it('removes the alert after a re-GET returns an empty list', async () => {
      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 0, auto_update_plugins: 0, auto_update_themes: 0, updater_blocked_by: ['DISALLOW_FILE_MODS'] })
      const wrapper = await mountView()
      expect(alertOf(wrapper).exists()).toBe(true)

      vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValueOnce({ auto_update: 0, auto_update_plugins: 1, auto_update_themes: 0, updater_blocked_by: [] })
      await switches(wrapper)[1]!.trigger('click')
      await flushPromises()

      expect(alertOf(wrapper).exists()).toBe(false)
    })

    it('shows the partial paragraph only for plugins partial', async () => {
      for (const [plugins, visible] of [['partial', true], ['all', false], ['none', false], [undefined, false]] as const) {
        vi.mocked(autoUpdatesApi.getAutoUpdates).mockResolvedValue({ auto_update: 0, auto_update_plugins: 1, auto_update_themes: 0, plugins })

        const wrapper = await mountView()

        expect(wrapper.text().includes(PARTIAL_KEY)).toBe(visible)
        wrapper.unmount()
      }
    })
  })
})
