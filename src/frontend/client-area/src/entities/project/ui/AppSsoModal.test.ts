import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import * as api from '@/entities/project/instance-actions.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { mountKit } from '@/test/mount-kit'
import AppSsoModal from './AppSsoModal.vue'

vi.mock('@/entities/project/instance-actions.api', async importOriginal => {
  const actual: typeof api = await importOriginal()
  return {
    ...actual,
    createSsoUrl: vi.fn(),
    createSsoPreviewUrl: vi.fn(),
    createAppSsoUrl: vi.fn(),
    createAppSsoPreviewUrl: vi.fn(),
  }
})

vi.mock('@/entities/domain/verify-domain-resolving', () => ({ verifyDomainResolving: vi.fn() }))

const USERS = [{ label: 'ann@example.com', value: 1 }, { label: 'bob', value: 2 }]

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'custom',
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
  return mountKit(AppSsoModal, { props, global: { plugins: [pinia] }, attachTo: host })
}

async function openModal (wrapper: Awaited<ReturnType<typeof mountModal>>, options = USERS) {
  const instance = toInstanceResource(raw())
  const open = (wrapper.vm as unknown as { open: (i: typeof instance, o: typeof options) => Promise<void> }).open
  await open(instance, options)
  await flushPromises()
}

describe('AppSsoModal', () => {
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

  it('is titled Log In and posts the per-user sso-url endpoint', async () => {
    const open = vi.fn().mockReturnValue({ closed: false })
    vi.stubGlobal('open', open)
    vi.mocked(api.createAppSsoUrl).mockResolvedValue({ sso_url: 'https://acme.example.com/sso' })
    const wrapper = await mountModal()
    await openModal(wrapper)

    expect(bodyQuery('[data-testid="sso-title"]')?.textContent).toContain('button.adminArea')
    bodyQuery('[data-testid="sso-generate"]')!.click()
    await flushPromises()

    expect(api.createAppSsoUrl).toHaveBeenCalledWith(7, 1)
    expect(api.createSsoUrl).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('https://acme.example.com/sso', '_blank')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('takes the title from the titleKey prop', async () => {
    const wrapper = await mountModal({ titleKey: 'button.logIn' })
    await openModal(wrapper)

    expect(bodyQuery('[data-testid="sso-title"]')?.textContent).toContain('button.logIn')
    expect(bodyQuery('[data-testid="sso-title"]')?.textContent).not.toContain('button.adminArea')
    wrapper.unmount()
  })

  it('uses the per-user preview endpoint on a mismatch under single server', async () => {
    vi.mocked(verifyDomainResolving).mockResolvedValue(false)
    vi.stubGlobal('open', vi.fn().mockReturnValue({ closed: false }))
    vi.mocked(api.createAppSsoPreviewUrl).mockResolvedValue({ sso_url: 'https://preview.example.com/sso' })
    const wrapper = await mountModal({ singleServer: true })
    await openModal(wrapper)

    bodyQuery('[data-testid="sso-preview"]')!.click()
    await flushPromises()

    expect(api.createAppSsoPreviewUrl).toHaveBeenCalledWith(7, 1)
    wrapper.unmount()
  })

  it('shows the noUsers warning without users', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper, [])

    expect(bodyQuery('[data-testid="sso-alert"]')?.textContent).toContain('notification.instance.modal.ssoLogin.noUsers')
    expect(api.createAppSsoUrl).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
