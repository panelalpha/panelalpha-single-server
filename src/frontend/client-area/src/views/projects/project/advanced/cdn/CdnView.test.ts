import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { VDialog } from 'vuetify/components'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { api } from '@/shared/api/client'
import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import SettingCardSkeleton from '@/shared/ui/setting-card/SettingCardSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import CdnView from './CdnView.vue'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

beforeEach(() => {
  setActivePinia(createPinia())
})

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function makeInstance (cdnSlug: string | null | undefined = undefined): InstanceResource {
  const planSettings = cdnSlug === undefined ? {} : { cdn: { provider_slug: cdnSlug } }
  return { id: 9, plan_settings: planSettings } as unknown as InstanceResource
}

async function mountView (instance: InstanceResource) {
  const wrapper = await mountKit(CdnView, { props: { instance } })
  await flushPromises()
  return wrapper
}

function purgeButton (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findAll('button').find(button => button.text() === 'button.purge')
}

describe('CdnView (CDN disabled in the plan)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', async () => {
    const wrapper = await mountView(makeInstance('none'))

    expect(wrapper.find('h4.page-title__title').text()).toBe('heading.instance.advanced.cdn.title')
  })

  it('renders the purge and under-attack card headings and subtitles', async () => {
    const wrapper = await mountView(makeInstance('none'))

    const headings = wrapper.findAll('h6').map(heading => heading.text())
    expect(headings).toEqual([
      'heading.instance.advanced.cdn.purge.title',
      'heading.instance.advanced.cdn.under-attack.title',
    ])
    expect(wrapper.text()).toContain('heading.instance.advanced.cdn.purge.subtitle')
    expect(wrapper.text()).toContain('heading.instance.advanced.cdn.under-attack.subtitle')
    expect(wrapper.text()).toContain('heading.instance.advanced.cdn.purge.alert')
  })

  it('disables the purge button and the under-attack switch when the plan has no CDN', async () => {
    const wrapper = await mountView(makeInstance('none'))

    expect(purgeButton(wrapper)!.attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent(ButtonSwitch).props('disabled')).toBe(true)
  })

  it('treats a plan without cdn settings as disabled', async () => {
    const wrapper = await mountView(makeInstance(undefined))

    expect(purgeButton(wrapper)!.attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent(ButtonSwitch).props('disabled')).toBe(true)
  })

  it('sends no request while the CDN is disabled', async () => {
    await mountView(makeInstance('none'))

    expect(api.get).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('enables the purge button and the switch when the plan has a CDN', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)

    const wrapper = await mountView(makeInstance('bunny'))

    expect(purgeButton(wrapper)!.attributes('disabled')).toBeUndefined()
    expect(wrapper.findComponent(ButtonSwitch).props('disabled')).toBe(false)
  })
})

describe('CdnView (CDN enabled in the plan)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests the status on mount and shows the skeleton instead of both cards while it loads', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as never)

    const wrapper = await mountKit(CdnView, { props: { instance: makeInstance('bunny') } })

    expect(api.get).toHaveBeenCalledWith('/instances/9/cdn/status')
    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(2)
    expect(wrapper.findAll('h6').map(heading => heading.text())).toEqual(['heading.instance.advanced.cdn.features.title'])
  })

  it('shows both cards once the status loads, with the switch on when under attack mode is active', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: true, features: [] } } as never)

    const wrapper = await mountView(makeInstance('bunny'))

    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
    expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(true)
    expect(wrapper.findComponent(ButtonSwitch).props('disabled')).toBe(false)
  })

  it('lists the features with their title, falling back to the name', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        under_attack_mode: false,
        features: [{ name: 'waf', title: 'Web Application Firewall' }, { name: 'ddos', title: null }],
      },
    } as never)

    const wrapper = await mountView(makeInstance('bunny'))

    expect(wrapper.text()).toContain('heading.instance.advanced.cdn.features.title')
    const titles = wrapper.findAll('.v-list-item-title').map(item => item.text())
    expect(titles).toEqual(['Web Application Firewall', 'ddos'])
  })

  it('turns the switch off and shows an empty list without an alert when the status request fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'))

    const wrapper = await mountView(makeInstance('bunny'))

    expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(false)
    expect(wrapper.findAll('.v-list-item')).toHaveLength(0)
    expect(wrapper.findAll('.v-alert')).toHaveLength(0)
    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
  })

  it('fetches the status when the plan gains a CDN and clears the state when it loses it', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { under_attack_mode: true, features: [{ name: 'waf', title: 'WAF' }] },
    } as never)

    const wrapper = await mountView(makeInstance('none'))
    expect(api.get).not.toHaveBeenCalled()

    await wrapper.setProps({ instance: makeInstance('bunny') })
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/instances/9/cdn/status')
    expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(true)
    expect(wrapper.findAll('.v-list-item-title').map(item => item.text())).toEqual(['WAF'])

    await wrapper.setProps({ instance: makeInstance('none') })
    await flushPromises()
    expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(false)
    expect(wrapper.findAll('.v-list-item')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('heading.instance.advanced.cdn.features.title')
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('drops a status response that arrives after the plan lost its CDN', async () => {
    const status = deferred<unknown>()
    vi.mocked(api.get).mockReturnValue(status.promise as never)
    const wrapper = await mountView(makeInstance('bunny'))

    await wrapper.setProps({ instance: makeInstance('none') })
    status.resolve({ data: { under_attack_mode: true, features: [{ name: 'waf', title: 'WAF' }] } })
    await flushPromises()

    expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(false)
    expect(wrapper.findAll('.v-list-item')).toHaveLength(0)
    expect(wrapper.findAllComponents(SettingCardSkeleton)).toHaveLength(0)
  })

  describe('under-attack switch', () => {
    it('names the switch with the under-attack card title', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)
      const wrapper = await mountView(makeInstance('bunny'))

      expect(wrapper.findComponent(ButtonSwitch).find('input').attributes('aria-label')).toBe('heading.instance.advanced.cdn.under-attack.title')
    })

    it('keeps the switch off while the save is pending and turns it on once the server accepts it', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)
      const save = deferred<unknown>()
      vi.mocked(api.post).mockReturnValue(save.promise as never)
      const wrapper = await mountView(makeInstance('bunny'))

      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await flushPromises()
      expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(false)

      save.resolve({})
      await flushPromises()
      expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(true)
    })

    it('does not turn the switch on when the plan lost its CDN while the save was in flight', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)
      const save = deferred<unknown>()
      vi.mocked(api.post).mockReturnValue(save.promise as never)
      const wrapper = await mountView(makeInstance('bunny'))

      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await wrapper.setProps({ instance: makeInstance('none') })
      save.resolve({})
      await flushPromises()

      expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(false)
    })

    it('sends the reversed value, flips the switch and shows the enable alert after the server accepts it', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)
      vi.mocked(api.post).mockResolvedValue({} as never)
      const wrapper = await mountView(makeInstance('bunny'))
      const alerts = useAlertsStore()

      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/instances/9/cdn/under-attack', { enabled: true })
      expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(true)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.cdn.under-attack.enable.success' })
    })

    it('sends the reversed value and shows the disable alert when turning the mode off', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: true, features: [] } } as never)
      vi.mocked(api.post).mockResolvedValue({} as never)
      const wrapper = await mountView(makeInstance('bunny'))
      const alerts = useAlertsStore()

      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledWith('/instances/9/cdn/under-attack', { enabled: false })
      expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(false)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.cdn.under-attack.disable.success' })
    })

    it('keeps the switch and shows an error alert when the save fails', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)
      vi.mocked(api.post).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView(makeInstance('bunny'))
      const alerts = useAlertsStore()

      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(ButtonSwitch).props('modelValue')).toBe(false)
      expect(wrapper.findComponent(ButtonSwitch).props('loading')).toBe(false)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
    })

    it('ignores a second click while the save is in flight', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)
      vi.mocked(api.post).mockReturnValue(new Promise(() => {}) as never)
      const wrapper = await mountView(makeInstance('bunny'))

      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(wrapper.findComponent(ButtonSwitch).props('loading')).toBe(true)
    })

    it('sends no request on click while the CDN is disabled in the plan', async () => {
      const wrapper = await mountView(makeInstance('none'))

      await wrapper.findComponent(ButtonSwitch).trigger('click')
      await flushPromises()

      expect(api.post).not.toHaveBeenCalled()
    })
  })

  describe('purge modal', () => {
    function modalButton (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
      return wrapper.findComponent(BasicModal).findAll('button').find(button => button.text() === label)
    }

    async function openPurgeModal (wrapper: Awaited<ReturnType<typeof mountView>>) {
      await purgeButton(wrapper)!.trigger('click')
      await flushPromises()
    }

    beforeEach(() => {
      vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: false, features: [] } } as never)
    })

    it('opens the confirmation modal with the title, the info and Purge first and Cancel second', async () => {
      const wrapper = await mountView(makeInstance('bunny'))

      await openPurgeModal(wrapper)

      const modal = wrapper.findComponent(BasicModal)
      expect(modal.exists()).toBe(true)
      expect(modal.props('title')).toBe('heading.instance.advanced.cdn.modal.purge.title')
      expect(modal.props('message')).toBe('heading.instance.advanced.cdn.modal.purge.info')
      expect((modal.props('buttons') as Array<{ label: string }>).map(button => button.label)).toEqual([
        'button.purge',
        'button.cancel',
      ])
      expect(api.post).not.toHaveBeenCalled()
    })

    it('posts the purge without a body, shows a success alert and closes the modal', async () => {
      vi.mocked(api.post).mockResolvedValue({} as never)
      const wrapper = await mountView(makeInstance('bunny'))
      const alerts = useAlertsStore()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/instances/9/cdn/purge')
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 'notification.instance.cdn.purge.success' })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('shows an error alert and still closes the modal when the purge fails', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('boom'))
      const wrapper = await mountView(makeInstance('bunny'))
      const alerts = useAlertsStore()
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await flushPromises()

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false })
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('closes on Cancel without a POST', async () => {
      const wrapper = await mountView(makeInstance('bunny'))
      await openPurgeModal(wrapper)

      await modalButton(wrapper, 'button.cancel')!.trigger('click')
      await flushPromises()

      expect(api.post).not.toHaveBeenCalled()
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('closes on a click on the overlay without a POST', async () => {
      const wrapper = await mountView(makeInstance('bunny'))
      await openPurgeModal(wrapper)

      const overlay = document.querySelector('.card-overlay') as HTMLElement | null
      expect(overlay).not.toBeNull()
      overlay!.click()
      await flushPromises()

      expect(api.post).not.toHaveBeenCalled()
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
    })

    it('keeps the modal persistent and both loadings on while the purge is in flight', async () => {
      const save = deferred<unknown>()
      vi.mocked(api.post).mockReturnValue(save.promise as never)
      const wrapper = await mountView(makeInstance('bunny'))
      await openPurgeModal(wrapper)
      await modalButton(wrapper, 'button.purge')!.trigger('click')
      await nextTick()

      expect(wrapper.findComponent(BasicModal).props('submitting')).toBe(true)
      expect(wrapper.findComponent(VDialog).props('persistent')).toBe(true)
      expect(purgeButton(wrapper)!.classes()).toContain('v-btn--loading')

      document.querySelector<HTMLElement>('.card-overlay')?.click()
      await nextTick()
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)

      save.resolve({})
      await flushPromises()

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)
      expect(purgeButton(wrapper)!.classes()).not.toContain('v-btn--loading')
    })
  })
})

// Characterization of the Under Attack switch box: written on the code that carried the local `cdn-switch` rule, kept
// after the rule moved to `ButtonSwitch`; only the container classes may differ (`cdn-switch` -> `switch-container--gutter-narrow`).
describe('CdnView under-attack switch DOM', () => {
  const switchDom = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
    normalizeHtml(wrapper.find('.switch-container').html()).replace(/ id="switch-v-\d+"/g, '')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the DOM with the mode on', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { under_attack_mode: true, features: [] } } as never)
    const wrapper = await mountView(makeInstance('bunny'))

    expect(switchDom(wrapper)).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2 mt-0"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input checked="" aria-disabled="false" aria-label="heading.instance.advanced.cdn.under-attack.title" type="checkbox" value="true"><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })

  it('keeps the DOM when the plan has no CDN (disabled)', async () => {
    const wrapper = await mountView(makeInstance('none'))

    expect(switchDom(wrapper)).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2 mt-0"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-input--disabled v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--disabled v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input disabled="" aria-disabled="true" aria-label="heading.instance.advanced.cdn.under-attack.title" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })
})
