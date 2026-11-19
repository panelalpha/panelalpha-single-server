import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as resellerApi from '@/views/reseller/reseller.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { on, resetAppEvents } from '@/shared/events/app-events'
import { controlAfterLabel, formLabels } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import BrandingView from './BrandingView.vue'

vi.mock('@/views/reseller/reseller.api', () => ({
  getBrandingSettings: vi.fn(),
  updateBrandingSettings: vi.fn(),
}))

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const SETTINGS = { brand_name: 'Acme', domain: 'panel.acme.io' }

async function mountView () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(BrandingView, { global: { plugins: [pinia] } })
  return { wrapper, alerts: useAlertsStore() }
}

describe('BrandingView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    resetAppEvents()
  })

  it('shows skeletons instead of the fields while the settings load, with labels and Save visible', async () => {
    const pending = deferred<typeof SETTINGS>()
    vi.mocked(resellerApi.getBrandingSettings).mockReturnValue(pending.promise)
    const { wrapper } = await mountView()

    expect(wrapper.findAll('.v-skeleton-loader')).toHaveLength(2)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.findAll('label').map(label => label.text())).toEqual(['reseller.brandName', 'reseller.domain'])
    expect(wrapper.find('[data-testid="branding-save"]').exists()).toBe(true)

    pending.resolve(SETTINGS)
    await flushPromises()

    expect(wrapper.find('.v-skeleton-loader').exists()).toBe(false)
  })

  it('keeps Save enabled while the settings load (legacy 1:1, zarzut 5 deferred)', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockReturnValue(deferred<typeof SETTINGS>().promise)
    const { wrapper } = await mountView()

    const save = wrapper.get('[data-testid="branding-save"]')
    expect(save.attributes('disabled')).toBeUndefined()
    expect(save.classes()).not.toContain('v-btn--disabled')
  })

  it('fills the fields with the fetched values and has no DNS heading without a domain', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue({ brand_name: 'Acme', domain: '' })
    const { wrapper } = await mountView()
    await flushPromises()

    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(2)
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('Acme')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).not.toContain('heading.reseller.page.dnsrecord')
  })

  it('shows the DNS Record card with the domain, CNAME and panel hostname when a domain is set', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue(SETTINGS)
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('heading.reseller.page.dnsrecord')
    const alert = wrapper.get('.app-message--info')
    expect(alert.get('strong').text()).toBe('reseller.domain.dnsSetupInfo1')
    expect(alert.text()).toContain('reseller.domain.dnsSetupInfo2')

    const rows = wrapper.findAll('.well .record-box-list-item')
    expect(rows.map(row => row.text())).toEqual([
      expect.stringContaining('general.name'),
      expect.stringContaining('general.type'),
      expect.stringContaining('general.address'),
    ])
    expect(rows[0]!.text()).toContain('panel.acme.io')
    expect(rows[1]!.text()).toContain('CNAME')
    expect(rows[2]!.text()).toContain(window.location.hostname)

    const card = wrapper.get('.well').element.closest('.v-card')!
    const save = wrapper.get('[data-testid="branding-save"]').element
    expect(card.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the DNS Record block after typing a domain and hides it after clearing', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue({ brand_name: 'Acme', domain: '' })
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('.well').exists()).toBe(false)

    const domainInput = wrapper.findAll('input')[1]!
    await domainInput.setValue('new.example.com')

    expect(wrapper.text()).toContain('heading.reseller.page.dnsrecord')
    expect(wrapper.get('.well').text()).toContain('new.example.com')

    await domainInput.setValue('')

    expect(wrapper.text()).not.toContain('heading.reseller.page.dnsrecord')
    expect(wrapper.find('.well').exists()).toBe(false)
    expect(wrapper.find('[data-testid="branding-save"]').exists()).toBe(true)
  })

  it('shows an error alert and empty fields when the GET fails', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountView()
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]!.success).toBe(false)
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(2)
    expect(inputs.every(input => (input.element as HTMLInputElement).value === '')).toBe(true)
  })

  it('saves the current values, shows loading meanwhile and a success alert after', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue(SETTINGS)
    const pending = deferred<void>()
    vi.mocked(resellerApi.updateBrandingSettings).mockReturnValue(pending.promise)
    const { wrapper, alerts } = await mountView()
    await flushPromises()

    await wrapper.findAll('input')[0]!.setValue('Acme 2')
    await wrapper.get('[data-testid="branding-save"]').trigger('click')

    expect(resellerApi.updateBrandingSettings).toHaveBeenCalledWith({ brand_name: 'Acme 2', domain: 'panel.acme.io' })
    expect(wrapper.get('[data-testid="branding-save"]').classes()).toContain('v-btn--loading')

    pending.resolve()
    await flushPromises()

    expect(wrapper.get('[data-testid="branding-save"]').classes()).not.toContain('v-btn--loading')
    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]!.success).toBe(true)
    expect(alerts.activeAlerts[0]!.successMessage).toBe('message.alertManager.success')
  })

  it('shows an error alert when the PUT fails', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue(SETTINGS)
    vi.mocked(resellerApi.updateBrandingSettings).mockRejectedValue(new Error('nope'))
    const { wrapper, alerts } = await mountView()
    await flushPromises()

    await wrapper.get('[data-testid="branding-save"]').trigger('click')
    await flushPromises()

    expect(alerts.activeAlerts).toHaveLength(1)
    expect(alerts.activeAlerts[0]!.success).toBe(false)
  })

  it('emits style-manager-open on "Manage Styles"', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue(SETTINGS)
    const handler = vi.fn()
    on('style-manager-open', handler)
    const { wrapper } = await mountView()
    await flushPromises()

    await wrapper.get('[data-testid="branding-manage-styles"]').trigger('click')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('gives each field an accessible name from its label', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue({ brand_name: 'Acme', domain: '' })
    const { wrapper } = await mountView()
    await flushPromises()

    // Vuetify 4 puts the attribute on the input element, so the lookup goes through the input.
    const named = wrapper.findAll('input[aria-label]')
    expect(named.map(input => input.attributes('aria-label'))).toEqual(['reseller.brandName', 'reseller.domain'])
  })
})

describe('BrandingView labels (kit-form-fields)', () => {
  it('puts each label right above the field it names (kit-form-fields)', async () => {
    vi.mocked(resellerApi.getBrandingSettings).mockResolvedValue({ brand_name: 'Acme', domain: '' } as never)
    const { wrapper } = await mountView()
    await flushPromises()
    const root = wrapper.element.parentElement ?? wrapper.element

    const labels = formLabels(root)
    expect(labels.map(label => (label.textContent ?? '').trim())).toEqual(['reseller.brandName', 'reseller.domain'])
    for (const label of labels) {
      const text = (label.textContent ?? '').trim()
      const control = controlAfterLabel(root, label, '.v-input')
      expect(control).not.toBeNull()
      expect(control!.querySelector('input')?.getAttribute('aria-label')).toBe(text)
    }
  })
})
