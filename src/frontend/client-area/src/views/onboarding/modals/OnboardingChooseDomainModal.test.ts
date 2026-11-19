// The domain list opens from focus and click and closes on every typed change, also
// when V4 `VCombobox` asks for the menu again after typing (`update:menu` true), so it never covers "Create Site".
import type { OnboardingService } from '@/views/onboarding/onboarding-service'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VCombobox, VExpansionPanels } from 'vuetify/components'
import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
import { mountKit } from '@/test/mount-kit'
import OnboardingChooseDomainModal from './OnboardingChooseDomainModal.vue'

const getServiceDomains = vi.hoisted(() => vi.fn())
const validateServiceDomain = vi.hoisted(() => vi.fn())

vi.mock('@/views/onboarding/onboarding.api', async importOriginal => ({ ...(await importOriginal<object>()), getServiceDomains, validateServiceDomain }))

let host: HTMLDivElement | undefined

async function mountModal () {
  getServiceDomains.mockResolvedValue(
    Array.from({ length: 8 }, (_, index) => ({ id: index + 1, domain: `site${index}.example.com` })),
  )
  host = document.createElement('div')
  document.body.append(host)
  const service = { id: 7, onboarding: {} } as unknown as OnboardingService
  const wrapper = await mountKit(OnboardingChooseDomainModal, {
    props: { modelValue: false, service, services: [service] },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

describe('OnboardingChooseDomainModal domain list (#38)', () => {
  afterEach(() => {
    host?.remove()
    host = undefined
  })

  it('opens on click and focus, closes after typing and ignores a reopen asked by the typing', async () => {
    const wrapper = await mountModal()
    const combobox = wrapper.getComponent(VCombobox)
    const input = wrapper.getComponent(VCombobox).find('input')

    expect(combobox.props('menu')).toBe(false)

    await input.trigger('focus')
    await combobox.vm.$emit('update:menu', true)
    expect(combobox.props('menu')).toBe(true)

    await combobox.vm.$emit('update:search', 'my')
    await flushPromises()
    expect(combobox.props('menu')).toBe(false)

    await combobox.vm.$emit('update:menu', true)
    await flushPromises()
    expect(combobox.props('menu')).toBe(false)

    await input.trigger('click')
    await combobox.vm.$emit('update:menu', true)
    expect(combobox.props('menu')).toBe(true)

    await combobox.vm.$emit('update:menu', false)
    expect(combobox.props('menu')).toBe(false)
    wrapper.unmount()
  })

  it('ignores a reopen asked after the field was cleared or lost focus', async () => {
    const wrapper = await mountModal()
    const combobox = wrapper.getComponent(VCombobox)
    const input = combobox.find('input')

    await input.trigger('focus')
    expect(combobox.props('menu')).toBe(true)

    await combobox.vm.$emit('update:model-value', null)
    await combobox.vm.$emit('update:menu', true)
    await flushPromises()
    expect(combobox.props('menu')).toBe(false)

    await input.trigger('focus')
    expect(combobox.props('menu')).toBe(true)
    await input.trigger('blur')
    await combobox.vm.$emit('update:menu', true)
    await flushPromises()
    expect(combobox.props('menu')).toBe(false)
    wrapper.unmount()
  })
})

// The list holds one row per project of the account, so a name it matches is another project's domain. The wizard
// must refuse it (the panel's "Domain is already in use."), never take it as a domain the create already owns.
describe('OnboardingChooseDomainModal taken domain', () => {
  afterEach(() => {
    host?.remove()
    host = undefined
    vi.useRealTimers()
  })

  it('checks a name the project list holds and refuses it with the panel message', async () => {
    vi.useFakeTimers()
    getServiceDomains.mockResolvedValue([{ id: 3, domain: 'site3.example.com' }])
    validateServiceDomain.mockRejectedValue({
      response: { data: { message: 'The domain is already in use.', errors: { domain: ['Domain is already in use.'] } } },
    })
    host = document.createElement('div')
    document.body.append(host)
    const service = { id: 7, onboarding: {} } as unknown as OnboardingService
    const wrapper = await mountKit(OnboardingChooseDomainModal, {
      props: { modelValue: false, service, services: [service] },
      attachTo: host,
      global: { plugins: [createPinia()] },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    const combobox = wrapper.getComponent(VCombobox)
    await combobox.vm.$emit('update:search', 'site3.example.com')
    await flushPromises()
    expect(validateServiceDomain).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    await flushPromises()

    expect(validateServiceDomain).toHaveBeenCalledWith(7, 'site3.example.com')
    expect(combobox.props('errorMessages')).toEqual(['Domain is already in use.'])
    const button = document.querySelector<HTMLButtonElement>('[data-testid="onboarding-domain-continue"]')
    expect(button?.disabled).toBe(true)

    button?.click()
    await flushPromises()
    expect(wrapper.emitted('domain-selected')).toBeUndefined()
    wrapper.unmount()
  })
})

// The two rows are a choice, not an accordion. Clicking the row that is already open collapsed it, which dropped the
// domain field and left Create Project disabled with no way back except switching rows; Vuetify's panels toggle by default.
describe('OnboardingChooseDomainModal domain mode', () => {
  afterEach(() => {
    host?.remove()
    host = undefined
  })

  async function mountWithSubdomain () {
    getServiceDomains.mockResolvedValue([])
    host = document.createElement('div')
    document.body.append(host)
    const service = { id: 7, onboarding: { subdomain_bases: ['panelalpha.online'] } } as unknown as OnboardingService
    const wrapper = await mountKit(OnboardingChooseDomainModal, {
      props: { modelValue: false, service, services: [service] },
      attachTo: host,
      global: { plugins: [createPinia()] },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    return wrapper
  }

  const titles = () => [...document.querySelectorAll<HTMLElement>('[data-testid="onboarding-domain-modal"] .v-expansion-panel-title')]
  const mapTitle = () => titles().find(el => el.textContent?.includes('modal.setDomain.set.domain.title'))
  const subdomainTitle = () => titles().find(el => el.textContent?.includes('modal.setDomain.set.subdomain.title'))
  const domainField = () => document.querySelector('[data-testid="onboarding-domain-modal"] .v-combobox input')
  const subdomainField = () => document.querySelector('[data-testid="onboarding-domain-modal"] .free-domain-name input')

  it('opens on the own-domain mode and keeps its field when that mode is clicked', async () => {
    const wrapper = await mountWithSubdomain()
    expect(mapTitle()?.closest('.v-expansion-panel')?.className).toContain('--active')
    expect(domainField()).not.toBeNull()

    mapTitle()?.click()
    await flushPromises()

    expect(mapTitle()?.closest('.v-expansion-panel')?.className).toContain('--active')
    expect(domainField()).not.toBeNull()
    expect(subdomainField()).toBeNull()
    wrapper.unmount()
  })

  it('switches to the free subdomain and back without losing the field', async () => {
    const wrapper = await mountWithSubdomain()

    subdomainTitle()?.click()
    await flushPromises()
    expect(subdomainField()).not.toBeNull()
    expect(domainField()).toBeNull()

    subdomainTitle()?.click()
    await flushPromises()
    expect(subdomainField()).not.toBeNull()

    mapTitle()?.click()
    await flushPromises()
    expect(domainField()).not.toBeNull()
    expect(subdomainField()).toBeNull()
    wrapper.unmount()
  })
})

// The own-domain field keeps its name while the subdomain panel is open, and the check that passed for it still stands when
// its panel comes back: switching rows must not leave the action dead until the next keystroke.
describe('OnboardingChooseDomainModal own domain after the subdomain panel', () => {
  afterEach(() => {
    host?.remove()
    host = undefined
    vi.useRealTimers()
  })

  beforeEach(() => {
    validateServiceDomain.mockReset()
    validateServiceDomain.mockResolvedValue(undefined)
  })

  async function mountWithSubdomain (fakeClock = true) {
    if (fakeClock) {
      vi.useFakeTimers()
    }
    getServiceDomains.mockResolvedValue([])
    host = document.createElement('div')
    document.body.append(host)
    const service = { id: 7, onboarding: { subdomain_bases: ['panelalpha.online'] } } as unknown as OnboardingService
    const wrapper = await mountKit(OnboardingChooseDomainModal, {
      props: { modelValue: false, service, services: [service] },
      attachTo: host,
      global: { plugins: [createPinia()] },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    return wrapper
  }

  const button = () => document.querySelector<HTMLButtonElement>('[data-testid="onboarding-domain-continue"]')
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  it('keeps the action enabled for the name the field kept, without a second check', async () => {
    const wrapper = await mountWithSubdomain()
    const panels = wrapper.getComponent(VExpansionPanels)
    const combobox = wrapper.getComponent(VCombobox)

    await combobox.vm.$emit('update:search', 'fx27r126.panelalpha.online')
    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(validateServiceDomain).toHaveBeenCalledWith(7, 'fx27r126.panelalpha.online')
    expect(button()?.disabled).toBe(false)

    await panels.vm.$emit('update:model-value', 1)
    await flushPromises()
    expect(wrapper.findComponent(VCombobox).exists()).toBe(false)

    await panels.vm.$emit('update:model-value', 0)
    await flushPromises()
    expect(wrapper.getComponent(VCombobox).find('input').element.value).toBe('fx27r126.panelalpha.online')
    expect(button()?.disabled).toBe(false)
    // No keystroke and no second request: the name did not change while the subdomain panel was open.
    expect(validateServiceDomain).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // Vuetify mounts the panel's text with a transition, which the fake clock does not run: this one waits in real time.
  it('keeps the action enabled for a free subdomain name when its row returns', async () => {
    const wrapper = await mountWithSubdomain(false)

    document.querySelectorAll<HTMLElement>('[data-testid="onboarding-domain-modal"] .v-expansion-panel-title')[1]?.click()
    await wait(500)
    const free = wrapper.findAllComponents(ValidatedTextField).at(-1)
    expect(free?.exists()).toBe(true)

    await free?.vm.$emit('update:model-value', 'fx27free')
    await wait(900)
    await flushPromises()
    expect(validateServiceDomain).toHaveBeenCalledWith(7, 'fx27free.panelalpha.online')
    expect(button()?.disabled).toBe(false)

    document.querySelector<HTMLElement>('[data-testid="onboarding-domain-modal"] .v-expansion-panel-title')?.click()
    await flushPromises()
    document.querySelectorAll<HTMLElement>('[data-testid="onboarding-domain-modal"] .v-expansion-panel-title')[1]?.click()
    await flushPromises()
    expect(button()?.disabled).toBe(false)
    expect(validateServiceDomain).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('checks a name it has no answer for when the own domain panel comes back', async () => {
    const wrapper = await mountWithSubdomain()
    const panels = wrapper.getComponent(VExpansionPanels)
    const combobox = wrapper.getComponent(VCombobox)

    // Typed, then the subdomain row before the debounced check ran: nothing passed for this name yet.
    await combobox.vm.$emit('update:search', 'fx27r126.panelalpha.online')
    await panels.vm.$emit('update:model-value', 1)
    await panels.vm.$emit('update:model-value', 0)
    await flushPromises()
    expect(button()?.disabled).toBe(true)

    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(validateServiceDomain).toHaveBeenCalledWith(7, 'fx27r126.panelalpha.online')
    expect(button()?.disabled).toBe(false)
    wrapper.unmount()
  })
})

// A value that is not a domain kept Create Project off and said nothing until the field lost focus (the
// rules ran on blur only). The field now says what the rule that blocks the check refuses, while the user types.
describe('OnboardingChooseDomainModal domain format message', () => {
  afterEach(() => {
    host?.remove()
    host = undefined
    vi.useRealTimers()
  })

  beforeEach(() => {
    validateServiceDomain.mockReset()
    validateServiceDomain.mockResolvedValue(undefined)
  })

  /** `t(key)` is the key in the kit (mount-kit), so a message reads as the key of the rule that refused. */
  async function mountModal (onboarding: Record<string, unknown> = {}) {
    vi.useFakeTimers()
    getServiceDomains.mockResolvedValue([])
    host = document.createElement('div')
    document.body.append(host)
    const service = { id: 7, onboarding } as unknown as OnboardingService
    const wrapper = await mountKit(OnboardingChooseDomainModal, {
      props: { modelValue: false, service, services: [service] },
      attachTo: host,
      global: { plugins: [createPinia()] },
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    return wrapper
  }

  const button = () => document.querySelector<HTMLButtonElement>('[data-testid="onboarding-domain-continue"]')

  it('says why a name that is not a domain cannot be used, without waiting for the field to lose focus', async () => {
    const wrapper = await mountModal()
    const combobox = wrapper.getComponent(VCombobox)

    await combobox.vm.$emit('update:search', 'foo')
    await flushPromises()
    expect(combobox.props('errorMessages')).toEqual(['form.validation.minLength'])
    expect(button()?.disabled).toBe(true)

    await combobox.vm.$emit('update:search', 'not a domain')
    await flushPromises()
    expect(combobox.props('errorMessages')).toEqual(['form.validation.valid'])
    expect(button()?.disabled).toBe(true)

    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(validateServiceDomain).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('says nothing for an empty field and clears the message once the name is one the service can check', async () => {
    const wrapper = await mountModal()
    const combobox = wrapper.getComponent(VCombobox)

    expect(combobox.props('errorMessages')).toEqual([])

    await combobox.vm.$emit('update:search', 'foo')
    await flushPromises()
    expect(combobox.props('errorMessages')).toEqual(['form.validation.minLength'])

    await combobox.vm.$emit('update:search', 'example.com')
    await flushPromises()
    expect(combobox.props('errorMessages')).toEqual([])
    expect(button()?.disabled).toBe(true)

    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(validateServiceDomain).toHaveBeenCalledWith(7, 'example.com')
    expect(button()?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('shows the service refusal under the subdomain field of the free-domain row', async () => {
    validateServiceDomain.mockRejectedValue({
      response: { data: { errors: { domain: ['Domain is already in use.'] } } },
    })
    const wrapper = await mountModal({ subdomain_bases: ['panelalpha.online'] })
    document.querySelectorAll<HTMLElement>('[data-testid="onboarding-domain-modal"] .v-expansion-panel-title')[1]?.click()
    await flushPromises()

    const free = wrapper.findAllComponents(ValidatedTextField).at(-1)
    await free?.vm.$emit('update:model-value', 'site3')
    vi.advanceTimersByTime(500)
    await flushPromises()

    expect(validateServiceDomain).toHaveBeenCalledWith(7, 'site3.panelalpha.online')
    const message = document.querySelector<HTMLElement>('[data-testid="onboarding-domain-modal"] .free-domain-name .v-messages__message')
    expect(message?.textContent).toBe('Domain is already in use.')
    expect(button()?.disabled).toBe(true)
    wrapper.unmount()
  })
})
