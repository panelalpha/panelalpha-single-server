import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VDialog, VDivider, VSelect } from 'vuetify/components'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import SettingCardSkeleton from '@/shared/ui/setting-card/SettingCardSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import * as edgeCacheApi from './edge-cache.api'
import EdgeCacheView from './EdgeCacheView.vue'

vi.mock('./edge-cache.api', () => ({
  getEdgeCache: vi.fn(),
  updateEdgeCache: vi.fn(),
  purgeEdgeCache: vi.fn(),
  updateDefensiveMode: vi.fn(),
}))

function makeInstance (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 9,
    service_has_dns_cloudflare: false,
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

// Dialogs teleport to document.body, so every mounted wrapper is unmounted after each test. Otherwise a `.card-overlay` from an earlier test can match.
const mounted: { unmount: () => void }[] = []

async function mountView (instance: InstanceResource = makeInstance()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(EdgeCacheView, { props: { instance }, global: { plugins: [pinia] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function edgeCacheSwitch (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findComponent(ButtonSwitch)
}

describe('EdgeCacheView', () => {
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
      wrapper.unmount()
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: false, isDefensiveMode: false })
    vi.mocked(edgeCacheApi.updateEdgeCache).mockResolvedValue(undefined)
    vi.mocked(edgeCacheApi.purgeEdgeCache).mockResolvedValue(undefined)
    vi.mocked(edgeCacheApi.updateDefensiveMode).mockResolvedValue(undefined)
  })

  it('renders the page title', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('h4.page-title__title').text()).toBe('heading.instance.advanced.edge-cache.title')
  })

  it('renders the three setting cards with an h6 title, their subtitle and the purge hint', async () => {
    const wrapper = await mountView()

    expect(wrapper.findAll('h6').map(heading => heading.text())).toEqual([
      'heading.instance.advanced.edge-cache.manage.title',
      'heading.instance.advanced.edge-cache.purge.title',
      'heading.instance.advanced.edge-cache.defensive-mode.title',
    ])
    expect(wrapper.text()).toContain('heading.instance.advanced.edge-cache.manage.subtitle')
    expect(wrapper.text()).toContain('heading.instance.advanced.edge-cache.purge.alert')
  })

  it('gives both switches and the TTL select an accessible name from their card titles (ui-instance-edge-cache)', async () => {
    const wrapper = await mountView()

    expect(wrapper.findAllComponents(ButtonSwitch).map(item => item.props('ariaLabel'))).toEqual([
      'heading.instance.advanced.edge-cache.manage.title',
      'heading.instance.advanced.edge-cache.defensive-mode.title',
    ])
    expect(wrapper.findAll('.switch-container input').map(input => input.attributes('aria-label'))).toEqual([
      'heading.instance.advanced.edge-cache.manage.title',
      'heading.instance.advanced.edge-cache.defensive-mode.title',
    ])
    expect(wrapper.findComponent(VSelect).find('input[role="combobox"]').attributes('aria-label')).toBe('form.label.ttl')
  })

  it('shows the skeleton while the status is loading and the card after it', async () => {
    const request = deferred<{ isActive: boolean, isDefensiveMode: boolean }>()
    vi.mocked(edgeCacheApi.getEdgeCache).mockReturnValue(request.promise)

    const pending = await mountView()

    expect(pending.findComponent(SettingCardSkeleton).exists()).toBe(true)
    expect(edgeCacheSwitch(pending).exists()).toBe(false)

    request.resolve({ isActive: false, isDefensiveMode: false })
    await flushPromises()

    expect(pending.findComponent(SettingCardSkeleton).exists()).toBe(false)
    expect(edgeCacheSwitch(pending).exists()).toBe(true)
  })

  it('reads the status once on mount for the instance id', async () => {
    await mountView()

    expect(edgeCacheApi.getEdgeCache).toHaveBeenCalledTimes(1)
    expect(edgeCacheApi.getEdgeCache).toHaveBeenCalledWith(9)
  })

  it('shows the switch on when the server answers isActive true', async () => {
    vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: true, isDefensiveMode: false })

    const wrapper = await mountView()

    expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(true)
  })

  it('alerts and keeps the switch off when the status request fails', async () => {
    vi.mocked(edgeCacheApi.getEdgeCache).mockRejectedValue(new Error('boom'))

    const wrapper = await mountView()
    const alerts = useAlertsStore()

    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(false)
    expect(wrapper.findComponent(SettingCardSkeleton).exists()).toBe(false)
  })

  it('sends the reversed status and flips the switch on after the server accepts it', async () => {
    const wrapper = await mountView()
    const alerts = useAlertsStore()

    await edgeCacheSwitch(wrapper).trigger('click')
    await flushPromises()

    expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledTimes(1)
    expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledWith(9, true)
    expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(true)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.edge-cache.manage.enable.success' })
  })

  it('sends the reversed status and shows the disable alert when switching off', async () => {
    vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: true, isDefensiveMode: false })
    const wrapper = await mountView()
    const alerts = useAlertsStore()

    await edgeCacheSwitch(wrapper).trigger('click')
    await flushPromises()

    expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledWith(9, false)
    expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(false)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.edge-cache.manage.disable.success' })
  })

  it('does not flip the switch while the PUT is still in flight', async () => {
    const request = deferred<void>()
    vi.mocked(edgeCacheApi.updateEdgeCache).mockReturnValue(request.promise)
    const wrapper = await mountView()

    await edgeCacheSwitch(wrapper).trigger('click')
    await flushPromises()

    expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(false)
    expect(edgeCacheSwitch(wrapper).props('loading')).toBe(true)

    request.resolve()
    await flushPromises()
  })

  it('ignores a second click while the PUT is in flight (D2)', async () => {
    const request = deferred<void>()
    vi.mocked(edgeCacheApi.updateEdgeCache).mockReturnValue(request.promise)
    const wrapper = await mountView()

    await edgeCacheSwitch(wrapper).trigger('click')
    await edgeCacheSwitch(wrapper).trigger('click')
    await flushPromises()

    expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledTimes(1)

    request.resolve()
    await flushPromises()

    expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(true)
  })

  it('keeps the switch and shows an error alert when the PUT fails', async () => {
    vi.mocked(edgeCacheApi.updateEdgeCache).mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()
    const alerts = useAlertsStore()

    await edgeCacheSwitch(wrapper).trigger('click')
    await flushPromises()

    expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(false)
    expect(edgeCacheSwitch(wrapper).props('loading')).toBe(false)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
  })

  // Direct link (lite and app have no guard on this route): the page mounts, sends one GET and
  // shows the error alert. Both switches stay off and the TTL select stays visible. The guard is deferred.
  describe('entry from a direct link without permission or outside WP Cloud', () => {
    it('mounts the page, sends one GET and keeps both switches off when the server answers 403', async () => {
      vi.mocked(edgeCacheApi.getEdgeCache).mockRejectedValue({ response: { status: 403, data: { message: 'Forbidden.' } } })

      const wrapper = await mountView()
      const alerts = useAlertsStore()

      expect(wrapper.find('h4.page-title__title').exists()).toBe(true)
      expect(edgeCacheApi.getEdgeCache).toHaveBeenCalledTimes(1)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
      expect(wrapper.findAllComponents(ButtonSwitch).map(item => item.props('modelValue'))).toEqual([false, false])
      expect(wrapper.findComponent(VSelect).exists()).toBe(true)
      expect(edgeCacheApi.updateEdgeCache).not.toHaveBeenCalled()
    })

    it('mounts the page, sends one GET and keeps both switches off when the server answers 422 (not WP Cloud)', async () => {
      vi.mocked(edgeCacheApi.getEdgeCache).mockRejectedValue({ response: { status: 422, data: { message: 'Not available.' } } })

      const wrapper = await mountView()
      const alerts = useAlertsStore()

      expect(wrapper.find('h4.page-title__title').exists()).toBe(true)
      expect(edgeCacheApi.getEdgeCache).toHaveBeenCalledTimes(1)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
      expect(wrapper.findAllComponents(ButtonSwitch).map(item => item.props('modelValue'))).toEqual([false, false])
      expect(wrapper.findComponent(VSelect).exists()).toBe(true)
      expect(wrapper.findComponent(SettingCardSkeleton).exists()).toBe(false)
    })
  })

  describe('Cloudflare conflict note', () => {
    it('is shown when the cache is on and the DNS is served by Cloudflare', async () => {
      vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: true, isDefensiveMode: false })

      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))

      expect(wrapper.text()).toContain('heading.instance.advanced.edge-cache.cloudflare-conflict.note')
      expect(wrapper.find('.app-message--warning').exists()).toBe(true)
    })

    it('is hidden when the cache is off even with Cloudflare DNS', async () => {
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))

      expect(wrapper.text()).not.toContain('heading.instance.advanced.edge-cache.cloudflare-conflict.note')
    })

    it('is hidden when the cache is on without Cloudflare DNS', async () => {
      vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: true, isDefensiveMode: false })

      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: false }))

      expect(wrapper.text()).not.toContain('heading.instance.advanced.edge-cache.cloudflare-conflict.note')
    })
  })

  describe('Cloudflare confirmation modal', () => {
    function modalButton (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
      return wrapper.findComponent(BasicModal).findAll('button').find(button => button.text() === label)
    }

    function dialogOpen (wrapper: Awaited<ReturnType<typeof mountView>>) {
      return wrapper.findComponent(VDialog).props('modelValue')
    }

    it('opens the warning instead of sending the PUT when turning on with Cloudflare DNS (click is not a confirmation)', async () => {
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))

      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateEdgeCache).not.toHaveBeenCalled()
      expect(dialogOpen(wrapper)).toBe(true)
      const modal = wrapper.findComponent(BasicModal)
      expect(modal.props('icon')).toBe('$alertwarning')
      expect(modal.props('color')).toBe('warning')
      expect(modal.props('title')).toBe('heading.instance.advanced.edge-cache.modal.cloudflare-warning.title')
      expect(modal.props('message')).toBe('heading.instance.advanced.edge-cache.modal.cloudflare-warning.info')
      expect(modal.props('alert')).toBe('heading.instance.advanced.edge-cache.modal.cloudflare-warning.alert')
      expect((modal.props('buttons') as Array<{ label: string }>).map(button => button.label)).toEqual([
        'button.edge-cache.enable',
        'button.cancel',
      ])
    })

    it('Enable Anyway closes the modal and sends the PUT as true', async () => {
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))
      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      await modalButton(wrapper, 'button.edge-cache.enable')!.trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledTimes(1)
      expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledWith(9, true)
      expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(true)
      expect(dialogOpen(wrapper)).toBe(false)
    })

    it('Cancel closes the modal without a request', async () => {
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))
      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      await modalButton(wrapper, 'button.cancel')!.trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateEdgeCache).not.toHaveBeenCalled()
      expect(dialogOpen(wrapper)).toBe(false)
      expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(false)
    })

    it('closes without a request when the modal close button emits modal-close', async () => {
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))
      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      wrapper.findComponent(BasicModal).vm.$emit('modal-close')
      await flushPromises()

      expect(edgeCacheApi.updateEdgeCache).not.toHaveBeenCalled()
      expect(dialogOpen(wrapper)).toBe(false)
    })

    it('closes before the PUT and ignores a switch click while the confirmed PUT is in flight (D2 before the modal)', async () => {
      const request = deferred<void>()
      vi.mocked(edgeCacheApi.updateEdgeCache).mockReturnValue(request.promise)
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))
      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      await modalButton(wrapper, 'button.edge-cache.enable')!.trigger('click')
      await nextTick()

      expect(dialogOpen(wrapper)).toBe(false)
      expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledTimes(1)

      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(dialogOpen(wrapper)).toBe(false)
      expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledTimes(1)

      request.resolve()
      await flushPromises()

      expect(edgeCacheSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('closes without a request when the overlay is clicked', async () => {
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))
      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      const overlay = document.querySelector('.card-overlay') as HTMLElement | null
      overlay?.click()
      await flushPromises()

      expect(edgeCacheApi.updateEdgeCache).not.toHaveBeenCalled()
      expect(dialogOpen(wrapper)).toBe(false)
    })

    it('turning off with Cloudflare DNS sends the PUT without the modal', async () => {
      vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: true, isDefensiveMode: false })
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: true }))

      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledWith(9, false)
      expect(dialogOpen(wrapper)).toBe(false)
    })

    it('turning on without Cloudflare DNS sends the PUT without the modal', async () => {
      const wrapper = await mountView(makeInstance({ service_has_dns_cloudflare: false }))

      await edgeCacheSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateEdgeCache).toHaveBeenCalledWith(9, true)
      expect(dialogOpen(wrapper)).toBe(false)
    })
  })

  describe('purge card and modal', () => {
    function purgeButton (wrapper: Awaited<ReturnType<typeof mountView>>) {
      return wrapper.findAll('button').find(button => button.text() === 'button.purge')
    }

    function modalButton (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
      return wrapper.findComponent(BasicModal).findAll('button').find(button => button.text() === label)
    }

    function dialog (wrapper: Awaited<ReturnType<typeof mountView>>) {
      return wrapper.findComponent(VDialog)
    }

    async function openPurgeModal (wrapper: Awaited<ReturnType<typeof mountView>>) {
      await purgeButton(wrapper)!.trigger('click')
      await flushPromises()
    }

    it('shows the purge card with its text and alert, without a skeleton', async () => {
      const wrapper = await mountView()

      expect(wrapper.text()).toContain('heading.instance.advanced.edge-cache.purge.title')
      expect(wrapper.text()).toContain('heading.instance.advanced.edge-cache.purge.subtitle')
      expect(wrapper.text()).toContain('heading.instance.advanced.edge-cache.purge.alert')
      expect(purgeButton(wrapper)).toBeDefined()
    })

    it('opens the purge confirmation with Purge first and Cancel second, without a request', async () => {
      const wrapper = await mountView()

      await openPurgeModal(wrapper)

      expect(dialog(wrapper).props('modelValue')).toBe(true)
      const modal = wrapper.findComponent(BasicModal)
      expect(modal.props('icon')).toBe('$restore')
      expect(modal.props('title')).toBe('heading.instance.advanced.edge-cache.modal.purge.title')
      expect(modal.props('message')).toBe('heading.instance.advanced.edge-cache.modal.purge.info')
      expect(modal.props('alert')).toBeUndefined()
      expect((modal.props('buttons') as Array<{ label: string }>).map(button => button.label)).toEqual([
        'button.purge',
        'button.cancel',
      ])
      expect(edgeCacheApi.purgeEdgeCache).not.toHaveBeenCalled()
    })

    it('posts the purge, shows a success alert and closes the modal', async () => {
      const wrapper = await mountView()
      const alerts = useAlertsStore()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await flushPromises()

      expect(edgeCacheApi.purgeEdgeCache).toHaveBeenCalledTimes(1)
      expect(edgeCacheApi.purgeEdgeCache).toHaveBeenCalledWith(9)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.edge-cache.purge.success' })
      expect(dialog(wrapper).props('modelValue')).toBe(false)
    })

    it('shows an error alert and still closes the modal when the purge fails', async () => {
      vi.mocked(edgeCacheApi.purgeEdgeCache).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await flushPromises()

      expect(edgeCacheApi.purgeEdgeCache).toHaveBeenCalledTimes(1)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
      expect(dialog(wrapper).props('modelValue')).toBe(false)
    })

    it('keeps the dialog persistent and ignores the overlay while the purge is in flight', async () => {
      const request = deferred<void>()
      vi.mocked(edgeCacheApi.purgeEdgeCache).mockReturnValue(request.promise)
      const wrapper = await mountView()
      await openPurgeModal(wrapper)

      expect(dialog(wrapper).props('persistent')).toBe(false)

      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await nextTick()

      expect(dialog(wrapper).props('persistent')).toBe(true)
      expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(true)

      const overlay = document.querySelector('.card-overlay') as HTMLElement | null
      overlay?.click()
      await nextTick()

      expect(dialog(wrapper).props('modelValue')).toBe(true)

      request.resolve()
      await flushPromises()

      expect(dialog(wrapper).props('modelValue')).toBe(false)
      expect(dialog(wrapper).props('persistent')).toBe(false)
    })

    it('ignores a second Purge click while the purge is in flight (D2)', async () => {
      const request = deferred<void>()
      vi.mocked(edgeCacheApi.purgeEdgeCache).mockReturnValue(request.promise)
      const wrapper = await mountView()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await flushPromises()

      expect(edgeCacheApi.purgeEdgeCache).toHaveBeenCalledTimes(1)

      request.resolve()
      await flushPromises()
    })

    it('closes on Cancel without a request', async () => {
      const wrapper = await mountView()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.cancel')!.trigger('click')
      await flushPromises()

      expect(edgeCacheApi.purgeEdgeCache).not.toHaveBeenCalled()
      expect(dialog(wrapper).props('modelValue')).toBe(false)
    })
  })

  describe('defensive mode card and TTL select', () => {
    function defensiveSwitch (wrapper: Awaited<ReturnType<typeof mountView>>) {
      return wrapper.findAllComponents(ButtonSwitch)[1]
    }

    function ttlSelect (wrapper: Awaited<ReturnType<typeof mountView>>) {
      return wrapper.findComponent(VSelect)
    }

    it('shows the skeleton for the defensive card while the status is loading', async () => {
      const request = deferred<{ isActive: boolean, isDefensiveMode: boolean }>()
      vi.mocked(edgeCacheApi.getEdgeCache).mockReturnValue(request.promise)

      const wrapper = await mountView()

      expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(2)
      expect(wrapper.text()).not.toContain('heading.instance.advanced.edge-cache.defensive-mode.title')

      request.resolve({ isActive: false, isDefensiveMode: false })
      await flushPromises()

      expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
      expect(wrapper.text()).toContain('heading.instance.advanced.edge-cache.defensive-mode.title')
    })

    it('shows the TTL select while defensive mode is off', async () => {
      const wrapper = await mountView()

      expect(wrapper.findComponent(VDivider).exists()).toBe(true)
      expect(ttlSelect(wrapper).exists()).toBe(true)
    })

    it('hides the divider and the TTL select once defensive mode is on', async () => {
      vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: false, isDefensiveMode: true })

      const wrapper = await mountView()

      expect(defensiveSwitch(wrapper).props('modelValue')).toBe(true)
      expect(ttlSelect(wrapper).exists()).toBe(false)
      expect(wrapper.findComponent(VDivider).exists()).toBe(false)
    })

    it('lists the TTL options with their general.time labels in legacy order, with the default selected', async () => {
      const wrapper = await mountView()
      const items = ttlSelect(wrapper).props('items') as Array<{ title: string, value: number }>

      expect(items.map(item => item.title)).toEqual([
        'general.time.minute',
        'general.time.hour',
        'general.time.hour',
        'general.time.hour',
        'general.time.day',
      ])
      expect(items.map(item => item.value)).toEqual([1800, 3600, 28_800, 86_400, 604_800])
      expect(ttlSelect(wrapper).props('modelValue')).toBe(1800)
    })

    it('translates the TTL labels with the count of each option', async () => {
      const wrapper = await mountView()
      i18next.addResourceBundle('en', 'translation', {
        general: {
          time: {
            minute_one: '{{count}} minute',
            minute_other: '{{count}} minutes',
            hour_one: '{{count}} hour',
            hour_other: '{{count}} hours',
            day_one: '{{count}} day',
            day_other: '{{count}} days',
          },
        },
      }, true, true)
      try {
        await i18next.changeLanguage('en')
        await flushPromises()

        const items = ttlSelect(wrapper).props('items') as Array<{ title: string }>
        expect(items.map(item => item.title)).toEqual(['30 minutes', '1 hour', '8 hours', '24 hours', '7 days'])
      } finally {
        i18next.removeResourceBundle('en', 'translation')
        i18next.addResourceBundle('en', 'translation', {})
      }
    })

    it('changing the select sends nothing', async () => {
      const wrapper = await mountView()

      await ttlSelect(wrapper).vm.$emit('update:modelValue', 28_800)
      await flushPromises()

      expect(edgeCacheApi.updateDefensiveMode).not.toHaveBeenCalled()
    })

    it('enabling with the default TTL sends status true and ttl 1800, then hides the select', async () => {
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      await defensiveSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateDefensiveMode).toHaveBeenCalledTimes(1)
      expect(edgeCacheApi.updateDefensiveMode).toHaveBeenCalledWith(9, true, 1800)
      expect(defensiveSwitch(wrapper).props('modelValue')).toBe(true)
      expect(ttlSelect(wrapper).exists()).toBe(false)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.edge-cache.defensive-mode.enable.success' })
    })

    it('sends the selected TTL in seconds when the select was changed to 8 hours', async () => {
      const wrapper = await mountView()

      await ttlSelect(wrapper).vm.$emit('update:modelValue', 28_800)
      await defensiveSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateDefensiveMode).toHaveBeenCalledWith(9, true, 28_800)
    })

    it('sends ttl when turning defensive mode off too, and shows the disable alert', async () => {
      vi.mocked(edgeCacheApi.getEdgeCache).mockResolvedValue({ isActive: false, isDefensiveMode: true })
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      await defensiveSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateDefensiveMode).toHaveBeenCalledWith(9, false, 1800)
      expect(defensiveSwitch(wrapper).props('modelValue')).toBe(false)
      expect(ttlSelect(wrapper).exists()).toBe(true)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.edge-cache.defensive-mode.disable.success' })
    })

    it('ignores a second click while the defensive mode PUT is in flight (D2)', async () => {
      const request = deferred<void>()
      vi.mocked(edgeCacheApi.updateDefensiveMode).mockReturnValue(request.promise)
      const wrapper = await mountView()

      await defensiveSwitch(wrapper).trigger('click')
      await defensiveSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(edgeCacheApi.updateDefensiveMode).toHaveBeenCalledTimes(1)
      expect(defensiveSwitch(wrapper).props('loading')).toBe(true)

      request.resolve()
      await flushPromises()

      expect(defensiveSwitch(wrapper).props('modelValue')).toBe(true)
      expect(defensiveSwitch(wrapper).props('loading')).toBe(false)
    })

    it('keeps the state and shows an error alert when the defensive mode PUT fails', async () => {
      vi.mocked(edgeCacheApi.updateDefensiveMode).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      await defensiveSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(defensiveSwitch(wrapper).props('modelValue')).toBe(false)
      expect(defensiveSwitch(wrapper).props('loading')).toBe(false)
      expect(ttlSelect(wrapper).exists()).toBe(true)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    })
  })
})
