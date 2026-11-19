// The content and the "Transfer now" flow of the onboarding transfer step, the same before and after
// the move of the content to `TransferDomainSteps`.
import type { OnboardingService } from '@/views/onboarding/onboarding-service'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import OnboardingDomainTransferModal from './OnboardingDomainTransferModal.vue'

const verifyDomain = vi.hoisted(() => vi.fn())

vi.mock('@/entities/domain/domain-verification.api', async importOriginal => ({ ...(await importOriginal<object>()), verifyDomain }))

const record = { type: 'TXT', name: '_pa.example.org', content: 'verify-me' }
const ENABLED = { domain_transfer_enabled: true, server_allow_domain_transfer: true }

let host: HTMLDivElement | undefined

async function mountModal (onboarding: Record<string, unknown> = ENABLED) {
  host = document.createElement('div')
  document.body.append(host)
  const service = { id: 7, onboarding } as unknown as OnboardingService
  const wrapper = await mountKit(OnboardingDomainTransferModal, {
    props: { modelValue: true, service, services: [service], domain: 'example.org', domainVerificationRecord: record },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  return wrapper
}

const body = () => document.body
const transferNow = () => body().querySelector<HTMLElement>('[data-testid="transfer-now"]')

describe('OnboardingDomainTransferModal (kit-transfer-domain-steps)', () => {
  beforeEach(() => {
    verifyDomain.mockReset()
  })

  afterEach(() => {
    host?.remove()
    host = undefined
  })

  it('shows the steps and the record value when transfer is possible', async () => {
    const wrapper = await mountModal()
    expect(body().querySelectorAll('ol > li')).toHaveLength(4)
    expect(body().querySelector('.value')?.textContent?.trim()).toBe('verify-me')
    expect(body().textContent).toContain('heading.onboarding.transferDomain.message.possible.stepsTitle')
    expect(body().querySelector('[data-testid="transfer-error"]')).toBeNull()
    expect(transferNow()).not.toBeNull()
    wrapper.unmount()
  })

  it('says transfer is impossible and offers no Transfer now', async () => {
    const wrapper = await mountModal({ domain_transfer_enabled: false })
    expect(body().querySelector('ol')).toBeNull()
    expect(body().querySelector('h6')?.textContent).toContain('heading.onboarding.transferDomain.subtitle')
    expect(body().textContent).toContain('heading.onboarding.transferDomain.message.impossible')
    expect(transferNow()).toBeNull()
    wrapper.unmount()
  })

  it('shows the new record and an error when verification is still required', async () => {
    const again = { ...record, content: 'again' }
    verifyDomain.mockResolvedValue({ verification_required: true, verification_record: again })
    const wrapper = await mountModal()
    transferNow()!.click()
    await flushPromises()
    expect(verifyDomain).toHaveBeenCalledWith(7, 'example.org')
    expect(body().querySelector('[data-testid="transfer-error"]')?.textContent).toContain('verificationRequired')
    expect(body().querySelector('.value')?.textContent?.trim()).toBe('again')
    expect(wrapper.emitted('verification-record-updated')).toEqual([[again]])
    expect(wrapper.emitted('transfer-domain')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits transfer-domain when verification passes', async () => {
    verifyDomain.mockResolvedValue({ verification_required: false })
    const wrapper = await mountModal()
    transferNow()!.click()
    await flushPromises()
    expect(wrapper.emitted('transfer-domain')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits transfer-domain without a check when the server does not allow transfers', async () => {
    const wrapper = await mountModal({ domain_transfer_enabled: true })
    transferNow()!.click()
    await flushPromises()
    expect(verifyDomain).not.toHaveBeenCalled()
    expect(wrapper.emitted('transfer-domain')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the error of a failed check', async () => {
    verifyDomain.mockRejectedValue(new Error('x'))
    const wrapper = await mountModal()
    transferNow()!.click()
    await flushPromises()
    expect(body().querySelector('[data-testid="transfer-error"]')).not.toBeNull()
    expect(wrapper.emitted('transfer-domain')).toBeUndefined()
    wrapper.unmount()
  })
})
