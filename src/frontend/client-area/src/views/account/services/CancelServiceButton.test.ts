import type * as ServicesApi from './services.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { controlAfterLabel, labelByText } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import CancelServiceButton from './CancelServiceButton.vue'
import * as servicesApi from './services.api'

vi.mock('./services.api', async importOriginal => {
  const actual: typeof ServicesApi = await importOriginal()
  return { ...actual, cancelService: vi.fn(), listServices: vi.fn() }
})

const REASON = 'heading.cancelServiceModal.reason.option.expensive'

async function mountButton () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(CancelServiceButton, {
    attachTo: host,
    props: { service: { id: 42 } },
    global: { plugins: [pinia] },
  })
  return { wrapper, pinia, host }
}

function modal (): HTMLElement | null {
  return document.body.querySelector('[data-testid="services-cancel-modal"]')
}

function byTestId<T extends HTMLElement = HTMLElement> (id: string): T {
  return document.body.querySelector<T>(`[data-testid="${CSS.escape(id)}"]`)!
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountButton>>['wrapper']): Promise<void> {
  await wrapper.get('[data-testid="services-cancel-open"]').trigger('click')
  await flushPromises()
}

async function pickReason (): Promise<void> {
  const select = document.body.querySelector('[data-testid="services-cancel-reason"] .v-field')!
  select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await flushPromises()
  const item = [...document.body.querySelectorAll('.v-list-item')].find(node => node.textContent?.includes(REASON))!
  ;(item as HTMLElement).click()
  await flushPromises()
}

async function type (value: string): Promise<void> {
  const textarea = byTestId('services-cancel-describe').querySelector('textarea')!
  textarea.value = value
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

describe('CancelServiceButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('location', { href: '' })
  })

  it('opens the persistent modal from the Cancel button', async () => {
    const { wrapper, host } = await mountButton()
    expect(modal()).toBeNull()

    await openModal(wrapper)

    expect(modal()).not.toBeNull()
    expect(modal()!.textContent).toContain('heading.cancelServiceModal.title')
    wrapper.unmount()
    host.remove()
  })

  it('keeps Submit disabled until a reason is picked and the description has 10 characters', async () => {
    const { wrapper, host } = await mountButton()
    await openModal(wrapper)
    expect(byTestId<HTMLButtonElement>('services-cancel-submit').disabled).toBe(true)

    await type('1234567890')
    expect(byTestId<HTMLButtonElement>('services-cancel-submit').disabled).toBe(true)

    await pickReason()
    expect(byTestId<HTMLButtonElement>('services-cancel-submit').disabled).toBe(false)
    wrapper.unmount()
    host.remove()
  })

  it('copies the picked reason into an empty description, but not over typed text', async () => {
    const { wrapper, host } = await mountButton()
    await openModal(wrapper)

    await pickReason()
    expect(byTestId('services-cancel-describe').querySelector('textarea')!.value).toBe(REASON)
    wrapper.unmount()
    host.remove()
  })

  it('PUTs the description as the reason and, without a cancel_url, emits and closes', async () => {
    vi.mocked(servicesApi.cancelService).mockResolvedValue(undefined)
    const { wrapper, host } = await mountButton()
    await openModal(wrapper)
    await pickReason()
    await type('Too expensive for us')

    byTestId('services-cancel-submit').click()
    await flushPromises()

    expect(servicesApi.cancelService).toHaveBeenCalledWith(42, 'Too expensive for us')
    expect(wrapper.emitted('service-cancelled')).toEqual([[42]])
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(modal()?.closest('.v-overlay--active')).toBeNull()
    wrapper.unmount()
    host.remove()
  })

  it('goes to cancel_url instead of emitting when the answer has one', async () => {
    vi.mocked(servicesApi.cancelService).mockResolvedValue({ cancel_url: 'https://pay.test/cancel' })
    const { wrapper, host } = await mountButton()
    await openModal(wrapper)
    await pickReason()
    await type('Too expensive for us')

    byTestId('services-cancel-submit').click()
    await flushPromises()

    expect(window.location.href).toBe('https://pay.test/cancel')
    expect(wrapper.emitted('service-cancelled')).toBeUndefined()
    wrapper.unmount()
    host.remove()
  })

  it('shows an error alert and stays open when the PUT fails', async () => {
    vi.mocked(servicesApi.cancelService).mockRejectedValue(new Error('500'))
    const { wrapper, pinia, host } = await mountButton()
    await openModal(wrapper)
    await pickReason()
    await type('Too expensive for us')

    byTestId('services-cancel-submit').click()
    await flushPromises()

    expect(useAlertsStore(pinia).activeAlerts).toHaveLength(1)
    expect(useAlertsStore(pinia).activeAlerts[0]).toMatchObject({ success: false })
    expect(wrapper.emitted('service-cancelled')).toBeUndefined()
    expect(modal()).not.toBeNull()
    wrapper.unmount()
    host.remove()
  })

  it('keeps the reason and description after Dismiss (legacy never reset them)', async () => {
    const { wrapper, host } = await mountButton()
    await openModal(wrapper)
    await pickReason()
    await type('Too expensive for us')

    byTestId('services-cancel-dismiss').click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 400))
    await openModal(wrapper)

    expect(byTestId('services-cancel-describe').querySelector('textarea')!.value).toBe('Too expensive for us')
    expect(byTestId<HTMLButtonElement>('services-cancel-submit').disabled).toBe(false)
    wrapper.unmount()
    host.remove()
  })

  it('names the close button, the reason select and the description field, and the close button closes the modal', async () => {
    const { wrapper, host } = await mountButton()
    await openModal(wrapper)

    expect(byTestId('services-cancel-close').getAttribute('aria-label')).toBe('button.close')
    expect(byTestId('services-cancel-reason').querySelector('input[role="combobox"]')!.getAttribute('aria-label'))
      .toBe('heading.cancelServiceModal.reason.label')
    expect(byTestId('services-cancel-describe').querySelector('textarea')!.getAttribute('aria-label'))
      .toBe('heading.cancelServiceModal.describe.label')

    byTestId('services-cancel-close').click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 400))

    expect(modal()?.closest('.v-overlay--active')).toBeNull()
    wrapper.unmount()
    host.remove()
  })

  it('shows the warning message with its title and text in the open modal', async () => {
    const { wrapper, host } = await mountButton()
    await wrapper.get('[data-testid="services-cancel-open"]').trigger('click')
    await flushPromises()

    const modalNode = document.body.querySelector('[data-testid="services-cancel-modal"]')!
    expect(modalNode.textContent).toContain('heading.cancelServiceModal.alert.title')
    expect(modalNode.textContent).toContain('heading.cancelServiceModal.alert.text')
    wrapper.unmount()
    host.remove()
  })
})

describe('CancelServiceButton labels (kit-form-fields)', () => {
  it('puts each label right above its control (kit-form-fields)', async () => {
    const { wrapper, host } = await mountButton()
    await openModal(wrapper)
    const root = document.body
    const pairs: Array<[string, string]> = [
      ['heading.cancelServiceModal.reason.label', '[data-testid="services-cancel-reason"]'],
      ['heading.cancelServiceModal.describe.label', '[data-testid="services-cancel-describe"]'],
    ]
    for (const [text, selector] of pairs) {
      const label = labelByText(root, text)
      expect(label).not.toBeNull()
      expect(controlAfterLabel(root, label!, selector)).not.toBeNull()
    }
    wrapper.unmount()
    host.remove()
  })
})
