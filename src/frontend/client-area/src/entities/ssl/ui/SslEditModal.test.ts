import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import SslEditModal from './SslEditModal.vue'

const api = vi.hoisted(() => ({
  getInstalledCertificate: vi.fn(),
  getDetectedCertificate: vi.fn(),
  installCertificate: vi.fn(),
  listSslOffers: vi.fn(),
  orderCertificate: vi.fn(),
  removeCertificate: vi.fn(),
  resetCertificateCache: vi.fn(),
  retryCertificate: vi.fn(),
}))

vi.mock('@/entities/ssl/ssl-certificates.api', () => api)

interface Opened {
  open: (payload: Record<string, unknown>) => Promise<void>
}

const row = { domain: 'a.test' }
const certificate = { self_signed: false, name_match: true, issuer_name: 'CA' }
const basePayload = { domain: 'a.test', serverAccountId: 11, sourceItem: row, sslInstalledCert: certificate, sslDetectedCert: certificate }

const body = () => document.body
const button = (index: number) => body().querySelectorAll<HTMLButtonElement>('[data-testid="ssl-edit-modal"] .v-card-actions .v-btn')[index]!

async function mountModal () {
  setActivePinia(createPinia())
  const wrapper = await mountKit(SslEditModal, { global: { plugins: [createPinia()] }, attachTo: document.body })
  return { wrapper, modal: wrapper.vm as unknown as Opened }
}

describe('SslEditModal', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) {
      fn.mockReset()
    }
    api.listSslOffers.mockResolvedValue([{ id: 4, name: 'Lets' }])
    api.getInstalledCertificate.mockResolvedValue(null)
    api.getDetectedCertificate.mockResolvedValue(null)
    api.orderCertificate.mockResolvedValue(undefined)
    api.installCertificate.mockResolvedValue(undefined)
    api.retryCertificate.mockResolvedValue(undefined)
    api.removeCertificate.mockResolvedValue({ self_signed: true, name_match: true, issuer_name: 'PanelAlpha' })
    api.resetCertificateCache.mockReset()
  })

  it('waits for the offers, selects the first one and orders it', async () => {
    const { wrapper, modal } = await mountModal()
    await modal.open(basePayload)
    await flushPromises()

    expect(body().querySelector('[data-testid="ssl-edit-modal"]')).not.toBeNull()
    expect(button(0).textContent).toContain('button.generate')
    button(0).click()
    await flushPromises()

    expect(api.orderCertificate).toHaveBeenCalledWith(11, 'a.test', 4)
    expect(wrapper.emitted('ssl-certificate-ordered')).toEqual([[row]])
    wrapper.unmount()
  })

  it('does not fetch a certificate the screen passed, and fetches a missing one', async () => {
    const { wrapper, modal } = await mountModal()
    await modal.open({ ...basePayload, sslDetectedCert: undefined })
    expect(api.getInstalledCertificate).not.toHaveBeenCalled()
    expect(api.getDetectedCertificate).toHaveBeenCalledWith(11, 'a.test')
    wrapper.unmount()
  })

  it('installs a custom certificate only when its fields are filled', async () => {
    api.listSslOffers.mockResolvedValue([])
    const { wrapper, modal } = await mountModal()
    await modal.open(basePayload)
    await flushPromises()

    expect(button(0).textContent).toContain('button.install')
    button(0).click()
    await flushPromises()
    expect(api.installCertificate).not.toHaveBeenCalled()
    expect(wrapper.emitted('ssl-certificate-installed')).toBeUndefined()
    wrapper.unmount()
  })

  it('retries the certificate of a wp-cloud account without a form', async () => {
    const { wrapper, modal } = await mountModal()
    await modal.open({ ...basePayload, isWpCloud: true, sslOrderStatus: 'failed' })
    await flushPromises()

    expect(api.listSslOffers).not.toHaveBeenCalled()
    expect(body().querySelector('[data-testid="ssl-edit-modal"] .v-select')).toBeNull()
    button(0).click()
    await flushPromises()

    expect(api.retryCertificate).toHaveBeenCalledWith(11, 'a.test')
    expect(wrapper.emitted('ssl-certificate-ordered')).toEqual([[row]])
    wrapper.unmount()
  })

  it('asks before removing the certificate, then shows the one the domain carries now', async () => {
    const { wrapper, modal } = await mountModal()
    await modal.open(basePayload)
    await flushPromises()

    body().querySelector<HTMLButtonElement>('[data-testid="ssl-edit-remove"]')!.click()
    await flushPromises()

    expect(body().querySelector('[data-testid="ssl-remove-confirm-text"]')).not.toBeNull()
    expect(api.removeCertificate).not.toHaveBeenCalled()

    body().querySelector<HTMLButtonElement>('[data-testid="ssl-remove-confirm"]')!.click()
    await flushPromises()

    expect(api.removeCertificate).toHaveBeenCalledWith(11, 'a.test')
    expect(api.resetCertificateCache).toHaveBeenCalledWith(11)
    expect(wrapper.emitted('ssl-certificate-installed')).toEqual([[row]])
    // The dialog stays open and replaces the certificate with the DELETE's answer.
    expect(body().querySelector('[data-testid="ssl-edit-modal"]')).not.toBeNull()
    expect(body().querySelector('[data-testid="ssl-remove-confirm-text"]')).toBeNull()
    expect(body().textContent).toContain('general.sslProvider.selfSigned')
    wrapper.unmount()
  })

  it('does not remove the certificate when the confirmation is cancelled', async () => {
    const { wrapper, modal } = await mountModal()
    await modal.open(basePayload)
    await flushPromises()

    body().querySelector<HTMLButtonElement>('[data-testid="ssl-edit-remove"]')!.click()
    await flushPromises()
    body().querySelectorAll<HTMLButtonElement>('[data-testid="ssl-edit-modal"] .v-card-actions .v-btn')[1]!.click()
    await flushPromises()

    expect(api.removeCertificate).not.toHaveBeenCalled()
    expect(body().querySelector('[data-testid="ssl-edit-submit"]')).not.toBeNull()
    expect(body().querySelector('[data-testid="ssl-remove-confirm-text"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows a refusal of the removal in the dialog and keeps it open', async () => {
    api.removeCertificate.mockRejectedValue({
      response: { data: { message: 'This server\'s Engine cannot remove a certificate yet.', errors: { domain: ['This server\'s Engine cannot remove a certificate yet.'] } } },
    })
    const { wrapper, modal } = await mountModal()
    await modal.open(basePayload)
    await flushPromises()

    body().querySelector<HTMLButtonElement>('[data-testid="ssl-edit-remove"]')!.click()
    await flushPromises()
    body().querySelector<HTMLButtonElement>('[data-testid="ssl-remove-confirm"]')!.click()
    await flushPromises()

    expect(body().querySelector('[data-testid="ssl-remove-error"]')?.textContent).toContain('This server\'s Engine cannot remove a certificate yet.')
    expect(wrapper.emitted('ssl-certificate-installed')).toBeUndefined()
    expect(body().querySelector('[data-testid="ssl-remove-confirm-text"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('keeps the installed row on its issuer and shows Wrong DNS for the detected row', async () => {
    const { wrapper, modal } = await mountModal()
    await modal.open({
      ...basePayload,
      sslInstalledCert: { self_signed: false, name_match: true, issuer_name: 'Engine CA', points_here: false },
      sslDetectedCert: { self_signed: false, name_match: true, issuer_name: 'Old Host CA', points_here: false },
    })
    await flushPromises()

    const text = body().querySelector('[data-testid="ssl-edit-modal"]')?.textContent ?? ''
    expect(text).toContain('Engine CA')
    expect(text).not.toContain('Old Host CA')
    expect(text.split('message.status.wrongDns')).toHaveLength(2)
    wrapper.unmount()
  })

  it('disables the primary button while an order is in flight', async () => {
    const { wrapper, modal } = await mountModal()
    await modal.open({ ...basePayload, isWpCloud: true, sslOrderStatus: 'pending' })
    await flushPromises()

    expect(button(0).disabled).toBe(true)
    button(0).click()
    expect(api.retryCertificate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
