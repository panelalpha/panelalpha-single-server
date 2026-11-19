import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VDialog, VSelect } from 'vuetify/components'
import { cloudflareNsDetected } from '@/entities/domain/verify-domain-resolving'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import SettingCardSkeleton from '@/shared/ui/setting-card/SettingCardSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import * as cloudflareApi from './cloudflare.api'
import CloudflareView from './CloudflareView.vue'
import NameserverListItem from './NameserverListItem.vue'

const push = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/entities/domain/verify-domain-resolving', () => ({ cloudflareNsDetected: vi.fn() }))

vi.mock('./cloudflare.api', () => ({
  getSecurityLevel: vi.fn(),
  updateSecurityLevel: vi.fn(),
  getBrowserCheck: vi.fn(),
  updateBrowserCheck: vi.fn(),
  getDevelopmentMode: vi.fn(),
  updateDevelopmentMode: vi.fn(),
  purgeCache: vi.fn(),
}))

const NAMESERVERS = ['ns1.example.test', 'ns2.example.test']

function makeInstance (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 9,
    service_id: 'svc-7',
    domain: 'example.test',
    dns_nameservers: NAMESERVERS,
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
  const wrapper = await mountKit(CloudflareView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

function manageButton (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findAll('button').find(button => button.text() === 'button.cloudflare.manage')
}

// Cards in template order: development mode first, browser check second (the status card has no switch).
function developmentSwitch (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findAllComponents(ButtonSwitch)[0]
}

function browserSwitch (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findAllComponents(ButtonSwitch)[1]
}

function securitySelect (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findComponent(VSelect)
}

describe('CloudflareView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cloudflareNsDetected).mockResolvedValue(true)
    vi.mocked(cloudflareApi.getBrowserCheck).mockResolvedValue('off')
    vi.mocked(cloudflareApi.updateBrowserCheck).mockResolvedValue(undefined)
    vi.mocked(cloudflareApi.getDevelopmentMode).mockResolvedValue('off')
    vi.mocked(cloudflareApi.updateDevelopmentMode).mockResolvedValue(undefined)
    vi.mocked(cloudflareApi.getSecurityLevel).mockResolvedValue('off')
    vi.mocked(cloudflareApi.updateSecurityLevel).mockResolvedValue(undefined)
    vi.mocked(cloudflareApi.purgeCache).mockResolvedValue(undefined)
  })

  it('renders the page title', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('h4.page-title__title').text()).toBe('heading.instance.advanced.cloudflare.title')
  })

  it('renders the five setting cards with an h5 title, their subtitle and the cache hint', async () => {
    const wrapper = await mountView()

    expect(wrapper.findAll('h5').map(heading => heading.text())).toEqual([
      'heading.instance.advanced.cloudflare.manage.title',
      'heading.instance.advanced.cloudflare.cache.title',
      'heading.instance.advanced.cloudflare.development.title',
      'heading.instance.advanced.cloudflare.browser.title',
      'heading.instance.advanced.cloudflare.security.title',
    ])
    for (const key of ['manage', 'cache', 'development', 'browser', 'security']) {
      expect(wrapper.text()).toContain(`heading.instance.advanced.cloudflare.${key}.subtitle`)
    }
    expect(wrapper.text()).toContain('heading.instance.advanced.cloudflare.cache.alert')
  })

  it('checks the status of the instance domain on mount', async () => {
    await mountView()

    expect(cloudflareNsDetected).toHaveBeenCalledWith('example.test')
  })

  it('skips the DNS lookup and shows Wrong DNS when the instance has no domain', async () => {
    const wrapper = await mountView(makeInstance({ domain: undefined }))

    expect(cloudflareNsDetected).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('message.status.wrongDns')
  })

  it('shows the Active badge when the nameservers point to Cloudflare', async () => {
    vi.mocked(cloudflareNsDetected).mockResolvedValue(true)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('message.status.active')
    expect(wrapper.text()).not.toContain('message.status.wrongDns')
  })

  it('shows the Wrong DNS badge when the nameservers do not point to Cloudflare', async () => {
    vi.mocked(cloudflareNsDetected).mockResolvedValue(false)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('message.status.wrongDns')
    expect(wrapper.text()).not.toContain('message.status.active')
  })

  it('lists the instance nameservers in the Wrong DNS menu on hover', async () => {
    vi.mocked(cloudflareNsDetected).mockResolvedValue(false)

    const wrapper = await mountView()
    const badge = wrapper.findAll('span').find(span => span.text() === 'message.status.wrongDns')
    expect(badge).toBeDefined()
    await badge!.trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 200))
    await flushPromises()

    const items = wrapper.findAllComponents(NameserverListItem)
    expect(items).toHaveLength(NAMESERVERS.length)
    expect(items.map(item => item.props('item'))).toEqual(NAMESERVERS)
  })

  it('pushes the DNS route with only the service id in the history state on Manage Records', async () => {
    const wrapper = await mountView()

    await manageButton(wrapper)!.trigger('click')

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({
      path: '/hosting/dns',
      state: { instance: { service_id: 'svc-7' } },
    })
  })

  it('reads the browser check and the development mode of the instance on mount', async () => {
    await mountView()

    expect(cloudflareApi.getBrowserCheck).toHaveBeenCalledWith(9)
    expect(cloudflareApi.getDevelopmentMode).toHaveBeenCalledWith(9)
  })

  it('names the two switches and the security select after their card titles', async () => {
    const wrapper = await mountView()

    expect(developmentSwitch(wrapper).find('input').attributes('aria-label')).toBe('heading.instance.advanced.cloudflare.development.title')
    expect(browserSwitch(wrapper).find('input').attributes('aria-label')).toBe('heading.instance.advanced.cloudflare.browser.title')
    expect(securitySelect(wrapper).find('input[role="combobox"]').attributes('aria-label')).toBe('heading.instance.advanced.cloudflare.security.title')
  })

  describe('development mode switch', () => {
    it('shows the switch on when the server answers "on"', async () => {
      vi.mocked(cloudflareApi.getDevelopmentMode).mockResolvedValue('on')

      const wrapper = await mountView()

      expect(developmentSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('shows the switch off for any other value', async () => {
      vi.mocked(cloudflareApi.getDevelopmentMode).mockResolvedValue('off')

      const wrapper = await mountView()

      expect(developmentSwitch(wrapper).props('modelValue')).toBe(false)
    })

    it('sends the reversed value and flips the switch after the server accepts it', async () => {
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      await developmentSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(cloudflareApi.updateDevelopmentMode).toHaveBeenCalledTimes(1)
      expect(cloudflareApi.updateDevelopmentMode).toHaveBeenCalledWith(9, true)
      expect(developmentSwitch(wrapper).props('modelValue')).toBe(true)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.cloudflare.development.success' })
    })

    it('keeps the switch and shows an error alert when the save fails', async () => {
      vi.mocked(cloudflareApi.updateDevelopmentMode).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      await developmentSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(developmentSwitch(wrapper).props('modelValue')).toBe(false)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    })

    it('ignores a second click while a save is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(cloudflareApi.updateDevelopmentMode).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await developmentSwitch(wrapper).trigger('click')
      await nextTick()
      await developmentSwitch(wrapper).trigger('click')
      await nextTick()

      expect(cloudflareApi.updateDevelopmentMode).toHaveBeenCalledTimes(1)

      save.resolve(undefined)
      await flushPromises()

      expect(developmentSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('shows the development mode alert and no alert on the browser check card', async () => {
      const wrapper = await mountView()

      expect(wrapper.text()).toContain('heading.instance.advanced.cloudflare.development.alert')
      expect(wrapper.text()).not.toContain('heading.instance.advanced.cloudflare.browser.alert')
    })
  })

  describe('browser check switch', () => {
    it('shows the switch on when the server answers "on"', async () => {
      vi.mocked(cloudflareApi.getBrowserCheck).mockResolvedValue('on')

      const wrapper = await mountView()

      expect(browserSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('sends the reversed value and flips the switch after the server accepts it', async () => {
      const wrapper = await mountView()

      await browserSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(cloudflareApi.updateBrowserCheck).toHaveBeenCalledTimes(1)
      expect(cloudflareApi.updateBrowserCheck).toHaveBeenCalledWith(9, true)
      expect(browserSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('keeps the switch and shows an error alert when the save fails', async () => {
      vi.mocked(cloudflareApi.updateBrowserCheck).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      await browserSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(browserSwitch(wrapper).props('modelValue')).toBe(false)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    })

    it('ignores a second click while a save is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(cloudflareApi.updateBrowserCheck).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await browserSwitch(wrapper).trigger('click')
      await nextTick()
      await browserSwitch(wrapper).trigger('click')
      await nextTick()

      expect(cloudflareApi.updateBrowserCheck).toHaveBeenCalledTimes(1)

      save.resolve(undefined)
      await flushPromises()

      expect(browserSwitch(wrapper).props('modelValue')).toBe(true)
    })
  })

  describe('security level select', () => {
    it('shows the security level read from the server', async () => {
      vi.mocked(cloudflareApi.getSecurityLevel).mockResolvedValue('high')

      const wrapper = await mountView()

      expect(cloudflareApi.getSecurityLevel).toHaveBeenCalledWith(9)
      expect(securitySelect(wrapper).props('modelValue')).toBe('high')
    })

    it('offers the six legacy security levels in legacy order', async () => {
      const wrapper = await mountView()

      expect(securitySelect(wrapper).props('items')).toEqual([
        { title: 'form.option.cloudflareSecurity.off', value: 'off' },
        { title: 'form.option.cloudflareSecurity.essentiallyOff', value: 'essentially_off' },
        { title: 'form.option.cloudflareSecurity.low', value: 'low' },
        { title: 'form.option.cloudflareSecurity.medium', value: 'medium' },
        { title: 'form.option.cloudflareSecurity.high', value: 'high' },
        { title: 'form.option.cloudflareSecurity.underAttack', value: 'under_attack' },
      ])
    })

    it('sends the PATCH with the new value when the user changes the select', async () => {
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      securitySelect(wrapper).vm.$emit('update:modelValue', 'under_attack')
      await flushPromises()

      expect(cloudflareApi.updateSecurityLevel).toHaveBeenCalledTimes(1)
      expect(cloudflareApi.updateSecurityLevel).toHaveBeenCalledWith(9, 'under_attack')
      expect(securitySelect(wrapper).props('modelValue')).toBe('under_attack')
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.cloudflare.securityLevel.success' })
    })

    it('keeps the new value on the select and shows an error alert when the save fails', async () => {
      vi.mocked(cloudflareApi.updateSecurityLevel).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()

      securitySelect(wrapper).vm.$emit('update:modelValue', 'high')
      await flushPromises()

      expect(securitySelect(wrapper).props('modelValue')).toBe('high')
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    })

    it('shows an error alert and no value when the read fails', async () => {
      vi.mocked(cloudflareApi.getSecurityLevel).mockRejectedValue(new Error('boom'))

      const wrapper = await mountView()
      const alerts = useAlertsStore()

      expect(securitySelect(wrapper).props('modelValue')).toBe('')
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    })
  })

  describe('purge cache', () => {
    function purgeButton (wrapper: Awaited<ReturnType<typeof mountView>>) {
      return wrapper.findAll('button').find(button => button.text() === 'button.purge')
    }

    function modalButton (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
      return wrapper.findComponent(BasicModal).findAll('button').find(button => button.text() === label)
    }

    async function openPurgeModal (wrapper: Awaited<ReturnType<typeof mountView>>) {
      await purgeButton(wrapper)!.trigger('click')
      await flushPromises()
    }

    it('opens the confirmation modal with Purge Everything first and Cancel second', async () => {
      const wrapper = await mountView()

      await openPurgeModal(wrapper)

      const modal = wrapper.findComponent(BasicModal)
      expect(modal.exists()).toBe(true)
      expect(modal.props('title')).toBe('heading.instance.advanced.cloudflare.modal.purge.title')
      expect(modal.props('message')).toBe('heading.instance.advanced.cloudflare.modal.purge.info')
      expect((modal.props('buttons') as Array<{ label: string }>).map(button => button.label)).toEqual([
        'button.purgeEverything',
        'button.cancel',
      ])
      expect(cloudflareApi.purgeCache).not.toHaveBeenCalled()
    })

    it('posts the purge, shows a success alert and closes the modal', async () => {
      const wrapper = await mountView()
      const alerts = useAlertsStore()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.purgeEverything')!.trigger('click')
      await flushPromises()

      expect(cloudflareApi.purgeCache).toHaveBeenCalledTimes(1)
      expect(cloudflareApi.purgeCache).toHaveBeenCalledWith(9)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.cloudflare.cache.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('shows an error alert and still closes the modal when the purge fails', async () => {
      vi.mocked(cloudflareApi.purgeCache).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView()
      const alerts = useAlertsStore()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.purgeEverything')!.trigger('click')
      await flushPromises()

      expect(cloudflareApi.purgeCache).toHaveBeenCalledTimes(1)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('closes on Cancel without a POST', async () => {
      const wrapper = await mountView()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.cancel')!.trigger('click')
      await flushPromises()

      expect(cloudflareApi.purgeCache).not.toHaveBeenCalled()
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('closes on a click on the overlay without a POST', async () => {
      const wrapper = await mountView()
      await openPurgeModal(wrapper)

      const overlay = document.querySelector('.card-overlay') as HTMLElement | null
      expect(overlay).not.toBeNull()
      overlay!.click()
      await flushPromises()

      expect(cloudflareApi.purgeCache).not.toHaveBeenCalled()
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('ignores an overlay click while the purge is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(cloudflareApi.purgeCache).mockReturnValue(save.promise)
      const wrapper = await mountView()
      await openPurgeModal(wrapper)
      await modalButton(wrapper, 'button.purgeEverything')!.trigger('click')
      await nextTick()

      const overlay = document.querySelector('.card-overlay') as HTMLElement | null
      overlay?.click()
      await nextTick()

      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)

      save.resolve(undefined)
      await flushPromises()

      expect(cloudflareApi.purgeCache).toHaveBeenCalledTimes(1)
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })
  })

  // Entry from a bare link: the route has no guard, so the view mounts and reads the settings even
  // without `wordpress.manage_cloudflare` or a DNS zone, and a forbidden read only alerts. Keeps the behaviour pinned for the parity check.
  describe('entry without the Cloudflare privilege or DNS zone', () => {
    const NO_ACCESS_INSTANCE = {
      service_has_dns_cloudflare: false,
      domain_has_dns_zone: false,
    }

    it('mounts and reads the three settings without redirecting', async () => {
      const wrapper = await mountView(makeInstance(NO_ACCESS_INSTANCE))

      expect(wrapper.find('h4.page-title__title').text()).toBe('heading.instance.advanced.cloudflare.title')
      expect(cloudflareApi.getBrowserCheck).toHaveBeenCalledWith(9)
      expect(cloudflareApi.getDevelopmentMode).toHaveBeenCalledWith(9)
      expect(cloudflareApi.getSecurityLevel).toHaveBeenCalledWith(9)
      expect(push).not.toHaveBeenCalled()
    })

    it('shows an error alert and no redirect when the server forbids the read', async () => {
      const forbidden = Object.assign(new Error('forbidden'), { response: { status: 403 } })
      vi.mocked(cloudflareApi.getSecurityLevel).mockRejectedValue(forbidden)
      vi.mocked(cloudflareApi.getDevelopmentMode).mockRejectedValue(forbidden)
      vi.mocked(cloudflareApi.getBrowserCheck).mockRejectedValue(forbidden)
      const wrapper = await mountView(makeInstance(NO_ACCESS_INSTANCE))
      const alerts = useAlertsStore()

      expect(wrapper.find('h4.page-title__title').exists()).toBe(true)
      expect(alerts.activeAlerts.some(alert => alert.success === false)).toBe(true)
      expect(push).not.toHaveBeenCalled()
    })
  })

  describe('loading skeleton', () => {
    it('stays until the first of the three reads finishes, then disappears', async () => {
      const security = deferred<string>()
      const browser = deferred<string>()
      const development = deferred<string>()
      vi.mocked(cloudflareApi.getSecurityLevel).mockReturnValue(security.promise)
      vi.mocked(cloudflareApi.getBrowserCheck).mockReturnValue(browser.promise)
      vi.mocked(cloudflareApi.getDevelopmentMode).mockReturnValue(development.promise)
      const pinia = createPinia()
      setActivePinia(pinia)
      const wrapper = await mountKit(CloudflareView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
      await nextTick()

      expect(wrapper.findComponent(SettingCardSkeleton).exists()).toBe(true)

      security.resolve('off')
      await flushPromises()

      expect(wrapper.findComponent(SettingCardSkeleton).exists()).toBe(false)
      expect(securitySelect(wrapper).exists()).toBe(true)

      browser.resolve('off')
      development.resolve('off')
      await flushPromises()
    })
  })
})
