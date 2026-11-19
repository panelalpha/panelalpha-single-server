import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VDialog, VSelect } from 'vuetify/components'
import * as instanceActionsApi from '@/entities/project/instance-actions.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard, openDialogs } from '@/shared/ui/modal/dialog-shell.fixtures'
import { mountKit } from '@/test/mount-kit'
import CopyInstanceView from './CopyInstanceView.vue'

vi.mock('@/entities/project/instance-actions.api', () => ({
  copyInstance: vi.fn(),
  getServiceInstanceOptions: vi.fn(),
}))

const INSTANCE_ID = 9

// A service with room left (its first hosting account gives the domain of the label).
const SERVICE_FREE = { id: 1, plan_name: 'Basic', instance_count: 1, instance_limit: 3, hosting_accounts: [{ domain: 'a.example' }], onboarding: {} }
// A service at its instance limit.
const SERVICE_FULL = { id: 2, plan_name: 'Pro', instance_count: 3, instance_limit: 3, hosting_accounts: [], onboarding: {} }
// A service with one user configurable option: copying it opens step 2 (`GET .../instance-options` first).
const SERVICE_GEO = {
  id: 3,
  plan_name: 'Geo',
  instance_count: 0,
  instance_limit: 3,
  hosting_accounts: [{ domain: 'b.example' }],
  onboarding: { user_configurable_options: [{ name: 'geo_affinity', type: 'select' }] },
}
const GEO_OPTIONS = { geo_affinity: [{ text: 'PL', value: 'pl' }, { text: 'DE', value: 'de' }] }

function makeInstance (): InstanceResource {
  return { id: INSTANCE_ID, hostingId: 77, domain: 'example.com' } as unknown as InstanceResource
}

async function mountView (services: unknown[] | null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.home = services === null ? null : ({ user: { services } } as never)
  const wrapper = await mountKit(CopyInstanceView, { props: { instance: makeInstance() }, global: { plugins: [pinia] } })
  return { wrapper, session, alerts: useAlertsStore() }
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
  await wrapper.find('.v-btn').trigger('click')
  await flushPromises()
}

function copyButton (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
  const modal = wrapper.findComponent(BasicModal)
  return modal.findAll('button').find(button => button.text() === 'button.copyInstance')
}

describe('CopyInstanceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(instanceActionsApi.copyInstance).mockResolvedValue(undefined)
  })

  it('renders the page title, the copy card and its button with the i18n keys', async () => {
    const { wrapper } = await mountView([])

    expect(wrapper.find('.page-title__title').text()).toBe('heading.instance.advanced.copyInstance.title')
    expect(wrapper.find('.v-card h6').text()).toBe('heading.instance.advanced.copyInstance.copy.title')
    expect(wrapper.find('.v-card p').text()).toBe('heading.instance.advanced.copyInstance.copy.subtitle')
    expect(wrapper.find('.v-btn').text()).toBe('button.copyInstance')

    wrapper.unmount()
  })

  it('preselects the first service and shows the select message when the modal opens', async () => {
    const { wrapper } = await mountView([SERVICE_FREE, SERVICE_FULL])

    await openModal(wrapper)

    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(wrapper.findComponent(VSelect).props('modelValue')).toMatchObject({ id: SERVICE_FREE.id })
    expect(wrapper.findComponent(BasicModal).text()).toContain('heading.instance.advanced.copyInstance.modal.selectService.message')

    wrapper.unmount()
  })

  it('shows the full-service warning for a service at its limit and keeps Copy active', async () => {
    const { wrapper } = await mountView([SERVICE_FULL, SERVICE_FREE])

    await openModal(wrapper)

    const warning = wrapper.findComponent(BasicModal).find('.app-message--warning')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('heading.onboarding.chooseProduct.product.fullServiceAlert')
    expect(copyButton(wrapper)!.attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it('copies a service without configurable options at once, then closes the modal with a success alert', async () => {
    const { wrapper, alerts } = await mountView([SERVICE_FREE])

    await openModal(wrapper)
    await copyButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(instanceActionsApi.copyInstance).toHaveBeenCalledTimes(1)
    expect(instanceActionsApi.copyInstance).toHaveBeenCalledWith(INSTANCE_ID, { service_id: SERVICE_FREE.id })
    expect(alerts.activeAlerts).toContainEqual(expect.objectContaining({
      success: true,
      successMessage: 'notification.instance.copyInstance.completed',
    }))
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)

    wrapper.unmount()
  })

  it('keeps the modal open with an error alert when the copy request fails', async () => {
    vi.mocked(instanceActionsApi.copyInstance).mockRejectedValue(new Error('boom'))
    const { wrapper, alerts } = await mountView([SERVICE_FREE])

    await openModal(wrapper)
    await copyButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(alerts.activeAlerts).toContainEqual(expect.objectContaining({ success: false }))
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)

    wrapper.unmount()
  })

  it('opens without throwing and sends no copy request when there are no services', async () => {
    const { wrapper } = await mountView(null)

    await openModal(wrapper)
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(true)
    expect(wrapper.findComponent(BasicModal).find('.app-message--warning').exists()).toBe(false)

    await copyButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(instanceActionsApi.copyInstance).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('moves a service with user configurable options to step 2 and copies with the chosen values', async () => {
    vi.mocked(instanceActionsApi.getServiceInstanceOptions).mockResolvedValue(GEO_OPTIONS)
    const { wrapper } = await mountView([SERVICE_GEO])

    await openModal(wrapper)
    await copyButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(instanceActionsApi.getServiceInstanceOptions).toHaveBeenCalledWith(SERVICE_GEO.id)
    expect(instanceActionsApi.copyInstance).not.toHaveBeenCalled()
    expect(wrapper.findComponent(BasicModal).text()).toContain('form.label.geo_affinity')
    expect(wrapper.findComponent(BasicModal).text()).not.toContain('heading.instance.advanced.copyInstance.modal.selectService.message')

    await copyButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(instanceActionsApi.copyInstance).toHaveBeenCalledTimes(1)
    expect(instanceActionsApi.copyInstance).toHaveBeenCalledWith(INSTANCE_ID, {
      service_id: SERVICE_GEO.id,
      user_configurable_options: { geo_affinity: 'pl' },
    })
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)

    wrapper.unmount()
  })

  it('returns to step 1 with the first service when the modal is closed from step 2 and reopened', async () => {
    vi.mocked(instanceActionsApi.getServiceInstanceOptions).mockResolvedValue(GEO_OPTIONS)
    const { wrapper } = await mountView([SERVICE_GEO, SERVICE_FREE])

    await openModal(wrapper)
    await copyButton(wrapper)!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(BasicModal).text()).toContain('form.label.geo_affinity')

    const cancel = wrapper.findComponent(BasicModal).findAll('button').find(button => button.text() === 'button.cancel')
    await cancel!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(VDialog).props('modelValue')).toBe(false)

    await openModal(wrapper)

    expect(wrapper.findComponent(VSelect).props('modelValue')).toMatchObject({ id: SERVICE_GEO.id })
    expect(wrapper.findComponent(BasicModal).text()).toContain('heading.instance.advanced.copyInstance.modal.selectService.message')
    expect(wrapper.findComponent(BasicModal).text()).not.toContain('form.label.geo_affinity')
    expect(instanceActionsApi.copyInstance).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  // The dialog shell (the legacy overlay before the card, the legacy transition, a click on the overlay).
  it('opens the copy modal after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-advanced)', async () => {
    const { wrapper } = await mountView([SERVICE_FREE])
    await openModal(wrapper)

    const overlay = expectOverlayBeforeCard('[data-testid="copy-instance-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(openDialogs(wrapper)).toBe(0)
    wrapper.unmount()
  })

  it('ignores an overlay click while the copy request runs (kit-dialog-advanced)', async () => {
    vi.mocked(instanceActionsApi.copyInstance).mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountView([SERVICE_FREE])
    await openModal(wrapper)
    await copyButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(true)
    await clickOverlay(expectOverlayBeforeCard('[data-testid="copy-instance-modal"]'))

    expect(openDialogs(wrapper)).toBe(1)
    wrapper.unmount()
  })
})
