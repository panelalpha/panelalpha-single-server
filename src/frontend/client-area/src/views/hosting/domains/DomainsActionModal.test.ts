import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { clickOverlay, expectLegacyTransition, expectOverlayBeforeCard } from '@/views/hosting/dialog-shell.fixtures'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { mountKit } from '@/test/mount-kit'
import DomainsActionModal from './DomainsActionModal.vue'
import { useDomainActions } from './use-domain-actions'

function build (overrides: Record<string, unknown> = {}, serviceOverrides: Record<string, unknown> = {}) {
  const service = makeService({ server_accounts: [{ id: 11, domain: 'example.com' }], ...serviceOverrides })
  const actions = useDomainActions({
    service: () => service,
    account: () => service.server_accounts[0]!,
    rows: () => [{ domain: 'example.com', type: 'main' }],
    supportedDomainTypes: () => ['addon', 'sub'],
    reload: vi.fn().mockResolvedValue(undefined),
    highlight: vi.fn(),
    addDomain: vi.fn().mockResolvedValue(undefined),
    updateDomain: vi.fn().mockResolvedValue(undefined),
    deleteDomain: vi.fn().mockResolvedValue(undefined),
    setPrimaryDomain: vi.fn().mockResolvedValue(undefined),
    verifyDomain: vi.fn().mockResolvedValue({}),
    resetCertificateCache: vi.fn(),
    addSuccessAlert: vi.fn(),
    addErrorAlert: vi.fn(),
    getErrorMessage: () => 'x',
    t: key => key,
    ...overrides,
  })
  return { service, actions }
}

describe('DomainsActionModal', () => {
  it('keeps what is typed in the addon domain input', async () => {
    setActivePinia(createPinia())
    const { service, actions } = build()
    const wrapper = await mountKit(DomainsActionModal, {
      props: { actions, service, serverAccount: service.server_accounts[0]! },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    actions.openAdd()
    await flushPromises()

    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="domain.name"]')!
    input.focus()
    input.value = 'www.example.org'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    input.blur()
    await flushPromises()

    expect(actions.values.domain).toBe('www.example.org')
    expect(document.body.querySelector<HTMLInputElement>('input[placeholder="domain.name"]')!.value).toBe('www.example.org')
    wrapper.unmount()
  })
  it('opens after the legacy overlay, with the legacy transition, and closes it on an overlay click (kit-dialog-hosting)', async () => {
    setActivePinia(createPinia())
    const { service, actions } = build()
    const wrapper = await mountKit(DomainsActionModal, {
      props: { actions, service, serverAccount: service.server_accounts[0]! },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    actions.openAdd()
    await flushPromises()

    const overlay = expectOverlayBeforeCard('[data-testid="domains-modal"]')
    expectLegacyTransition(wrapper)
    await clickOverlay(overlay)

    expect(actions.open.value).toBe(false)
    wrapper.unmount()
  })

  it('shows a refused switch inside the dialog, where it stays', async () => {
    setActivePinia(createPinia())
    const { service, actions } = build({
      setPrimaryDomain: vi.fn().mockRejectedValue(new Error('refused')),
      getErrorMessage: () => 'Cannot delete domain with existing subdomains',
    })
    const wrapper = await mountKit(DomainsActionModal, {
      props: { actions, service, serverAccount: service.server_accounts[0]! },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    actions.openSetPrimary({ domain: 'shop.example.com', type: 'addon', serverAccountId: 11, type_text: 'Addon' } as never)
    await flushPromises()
    await actions.onButton('submit', async () => ({ valid: true }))
    await flushPromises()

    expect(document.body.querySelector('[data-testid="domains-modal"]')?.textContent).toContain('Cannot delete domain with existing subdomains')
    expect(actions.open.value).toBe(true)
    wrapper.unmount()
  })

  it('shows the A record in the Set Your Domain step after an addon add', async () => {
    setActivePinia(createPinia())
    const { service, actions } = build({}, {
      dns_settings: { display_options: ['a_records'] },
      server_accounts: [{ id: 11, domain: 'example.com', ipv4_addresses: ['192.0.2.10'] }],
    })
    const wrapper = await mountKit(DomainsActionModal, {
      props: { actions, service, serverAccount: service.server_accounts[0]! },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    actions.openAdd()
    actions.values.type = 'addon'
    actions.values.domain = 'new.org'
    await actions.onButton('submit', async () => ({ valid: true }))
    await flushPromises()

    expect(actions.modal.value?.mode).toBe('dns-instructions')
    const options = document.body.querySelector('[data-testid="domains-modal-dns-options"]')
    expect(options).not.toBeNull()
    expect(options?.textContent).toContain('192.0.2.10')
    wrapper.unmount()
  })
})
