import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import * as api from '@/entities/project/instance-actions.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import WpAdminSsoModal from './WpAdminSsoModal.vue'

vi.mock('@/entities/project/instance-actions.api', async importOriginal => {
  const actual: typeof api = await importOriginal()
  return { ...actual, createSsoUrl: vi.fn(), createSsoPreviewUrl: vi.fn() }
})

vi.mock('@/entities/domain/verify-domain-resolving', () => ({ verifyDomainResolving: vi.fn() }))

const USERS = [{ label: 'Ann - ann@example.com', value: 1 }, { label: 'Bob - bob@example.com', value: 2 }]

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    async_status: { installation: 'finished' },
    labels: [],
    privileges: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    plan_settings: {},
    host_ipv4_addresses: ['203.0.113.10'],
    ...overrides,
  }
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountModal (props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  return mountKit(WpAdminSsoModal, { props, global: { plugins: [pinia] }, attachTo: host })
}

type Wrapper = Awaited<ReturnType<typeof mountModal>>

async function openModal (wrapper: Wrapper, options = USERS, overrides: Partial<RawInstance> = {}) {
  const instance = toInstanceResource(raw(overrides))
  const open = (wrapper.vm as unknown as { open: (i: typeof instance, o: typeof options) => Promise<void> }).open
  await open(instance, options)
  await flushPromises()
  return instance
}

describe('WpAdminSsoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifyDomainResolving).mockResolvedValue(true)
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the users in a select and offers Generate for several users', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper)

    expect(bodyQuery('[data-testid="sso-user-form"]')).not.toBeNull()
    expect(bodyQuery('[data-testid="sso-generate"]')).not.toBeNull()
    expect(bodyQuery('[data-testid="sso-alert"]')).toBeNull()
    expect(api.createSsoUrl).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('posts the first user and opens the URL, then closes', async () => {
    const open = vi.fn().mockReturnValue({ closed: false })
    vi.stubGlobal('open', open)
    vi.mocked(api.createSsoUrl).mockResolvedValue({ sso_url: 'https://acme.example.com/sso' })
    const wrapper = await mountModal()
    await openModal(wrapper)

    bodyQuery('[data-testid="sso-generate"]')!.click()
    await flushPromises()

    expect(api.createSsoUrl).toHaveBeenCalledWith(7, 1)
    expect(open).toHaveBeenCalledWith('https://acme.example.com/sso', '_blank')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('auto-submits for exactly one user', async () => {
    vi.stubGlobal('open', vi.fn().mockReturnValue({ closed: false }))
    vi.mocked(api.createSsoUrl).mockResolvedValue({ sso_url: 'https://acme.example.com/sso' })
    const wrapper = await mountModal()
    await openModal(wrapper, [USERS[0]!])

    expect(api.createSsoUrl).toHaveBeenCalledWith(7, 1)
    wrapper.unmount()
  })

  it('checks DNS when the status is unknown, and warns on a mismatch instead of auto-submitting', async () => {
    vi.mocked(verifyDomainResolving).mockResolvedValue(false)
    const wrapper = await mountModal()
    const instance = await openModal(wrapper, [USERS[0]!])

    expect(verifyDomainResolving).toHaveBeenCalledOnce()
    expect(vi.mocked(verifyDomainResolving).mock.calls[0]![0]).toMatchObject({
      domain: 'acme.example.com',
      ipv4Addresses: ['203.0.113.10'],
      skipARecordVerification: false,
    })
    expect(instance.getDnsResolveStatus()).toBe(false)
    expect(bodyQuery('[data-testid="sso-alert"]')?.textContent).toContain('notification.instance.modal.ssoLogin.dnsMismatchDetected')
    expect(api.createSsoUrl).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="sso-generate"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('treats a failed DNS lookup as a mismatch', async () => {
    vi.mocked(verifyDomainResolving).mockRejectedValue(new Error('offline'))
    const wrapper = await mountModal()
    const instance = await openModal(wrapper)

    expect(instance.getDnsResolveStatus()).toBe(false)
    wrapper.unmount()
  })

  it('skips the DNS check for an IP url', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper, USERS, { url: 'http://203.0.113.10' })

    expect(verifyDomainResolving).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('offers the temporary URL and the direct login with the preview provider on a mismatch', async () => {
    vi.mocked(verifyDomainResolving).mockResolvedValue(false)
    vi.stubGlobal('open', vi.fn().mockReturnValue({ closed: false }))
    vi.mocked(api.createSsoPreviewUrl).mockResolvedValue({ sso_url: 'https://preview.example.com/sso' })
    const wrapper = await mountModal({ previewProviderEnabled: true })
    await openModal(wrapper)

    expect(bodyQuery('[data-testid="sso-generate"]')).toBeNull()
    expect(bodyQuery('[data-testid="sso-direct"]')).not.toBeNull()
    bodyQuery('[data-testid="sso-preview"]')!.click()
    await flushPromises()

    expect(api.createSsoPreviewUrl).toHaveBeenCalledWith(7, 1)
    expect(api.createSsoUrl).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows the lite noUsers warning without users', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper, [])

    expect(bodyQuery('[data-testid="sso-alert"]')?.textContent).toContain('notification.instance.modal.ssoLogin.noUsers')
    expect(bodyQuery('[data-testid="sso-generate"]')).toBeNull()
    expect(api.createSsoUrl).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('falls back to a Login button when the popup is blocked', async () => {
    const open = vi.fn().mockReturnValue(null)
    vi.stubGlobal('open', open)
    vi.mocked(api.createSsoUrl).mockResolvedValue({ sso_url: 'https://acme.example.com/sso' })
    const wrapper = await mountModal()
    await openModal(wrapper)

    bodyQuery('[data-testid="sso-generate"]')!.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(bodyQuery('[data-testid="sso-message"]')?.textContent).toContain('notification.instance.modal.ssoLogin.success')
    expect(bodyQuery('[data-testid="sso-generate"]')).toBeNull()

    open.mockReturnValue({ closed: false })
    bodyQuery('[data-testid="sso-login"]')!.click()
    await flushPromises()

    expect(open).toHaveBeenLastCalledWith('https://acme.example.com/sso', '_blank')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the error of a failed request as an alert and keeps the dialog open', async () => {
    vi.mocked(api.createSsoUrl).mockRejectedValue({ response: { data: { message: 'No SSO.' } } })
    const wrapper = await mountModal()
    await openModal(wrapper)

    bodyQuery('[data-testid="sso-generate"]')!.click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'No SSO.' })
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(bodyQuery('[data-testid="sso-generate"]')).not.toBeNull()
    wrapper.unmount()
  })
})
