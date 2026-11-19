import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { mountKit } from '@/test/mount-kit'
import TransferDomainModal from './TransferDomainModal.vue'

const verifyDomain = vi.hoisted(() => vi.fn())

vi.mock('@/views/hosting/hosting.api', async importOriginal => ({ ...(await importOriginal<object>()), verifyDomain }))

const record = { type: 'TXT', name: '_pa.example.org', content: 'verify-me' }

async function mountModal (planSettings?: Record<string, unknown>) {
  setActivePinia(createPinia())
  const service = makeService({ plan_settings: planSettings ?? { domain_transfer_enabled: true } })
  const wrapper = await mountKit(TransferDomainModal, {
    props: { isOpen: true, service, domain: { domain: 'example.org' }, dnsRecord: record },
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const body = () => document.body

describe('TransferDomainModal', () => {
  beforeEach(() => {
    verifyDomain.mockReset()
  })

  it('shows the steps and the record value when transfer is possible', async () => {
    const wrapper = await mountModal()
    expect(body().querySelector('[data-testid="transfer-modal"]')).not.toBeNull()
    expect(body().querySelector('ol')).not.toBeNull()
    expect(body().querySelector('.value')?.textContent?.trim()).toBe('verify-me')
    expect(body().querySelector('[data-testid="transfer-now"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('says transfer is impossible and offers only Back', async () => {
    const wrapper = await mountModal({ domain_transfer_enabled: false })
    expect(body().querySelector('ol')).toBeNull()
    expect(body().textContent).toContain('heading.onboarding.transferDomain.message.impossible')
    expect(body().querySelector('[data-testid="transfer-now"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows the subtitle, four steps and no error (kit-transfer-domain-steps)', async () => {
    const wrapper = await mountModal()
    expect(body().querySelector('h6')?.textContent).toContain('heading.onboarding.transferDomain.subtitle')
    expect(body().querySelectorAll('ol > li')).toHaveLength(4)
    expect(body().querySelector('[data-testid="transfer-error"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows the subtitle and no record box when transfer is impossible (kit-transfer-domain-steps)', async () => {
    const wrapper = await mountModal({ domain_transfer_enabled: false })
    expect(body().querySelector('h6')?.textContent).toContain('heading.onboarding.transferDomain.subtitle')
    expect(body().querySelector('[data-testid="long-value-box"]')).toBeNull()
    expect(body().querySelector('[data-testid="transfer-error"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows the new record and an error when verification is still required', async () => {
    verifyDomain.mockResolvedValue({ verification_required: true, verification_record: { ...record, content: 'again' } })
    const wrapper = await mountModal()
    body().querySelector<HTMLElement>('[data-testid="transfer-now"]')!.click()
    await flushPromises()
    expect(verifyDomain).toHaveBeenCalledWith(expect.any(Number), 'example.org')
    expect(body().querySelector('[data-testid="transfer-error"]')?.textContent).toContain('verificationRequired')
    expect(body().querySelector('.value')?.textContent?.trim()).toBe('again')
    expect(wrapper.emitted('transfer-domain')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits transfer-domain when verification passes', async () => {
    verifyDomain.mockResolvedValue({ verification_required: false })
    const wrapper = await mountModal()
    body().querySelector<HTMLElement>('[data-testid="transfer-now"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('transfer-domain')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the error of a failed check', async () => {
    verifyDomain.mockRejectedValue(new Error('x'))
    const wrapper = await mountModal()
    body().querySelector<HTMLElement>('[data-testid="transfer-now"]')!.click()
    await flushPromises()
    expect(body().querySelector('[data-testid="transfer-error"]')).not.toBeNull()
    wrapper.unmount()
  })
  it('opens after the legacy overlay, with the legacy transition, and asks to close on an overlay click (kit-dialog-hosting)', async () => {
    const wrapper = await mountModal()

    const overlay = expectOverlayBeforeCard('[data-testid="transfer-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(wrapper.emitted('remove-modal')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not ask to close on an overlay click while the check runs (kit-dialog-hosting)', async () => {
    verifyDomain.mockReturnValue(new Promise(() => {}))
    const wrapper = await mountModal()
    body().querySelector<HTMLElement>('[data-testid="transfer-now"]')!.click()
    await flushPromises()

    await clickOverlay(expectOverlayBeforeCard('[data-testid="transfer-modal"]'))

    expect(wrapper.emitted('remove-modal')).toBeUndefined()
    wrapper.unmount()
  })
})
