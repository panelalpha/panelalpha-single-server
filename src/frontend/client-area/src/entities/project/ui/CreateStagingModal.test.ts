import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/entities/project/instance-actions.api'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { mountKit } from '@/test/mount-kit'
import CreateStagingModal from './CreateStagingModal.vue'

const translationCalls: Array<{ key: string, options?: Record<string, unknown> }> = []

/** The kit's `t` returns the key, so a `{{domain}}` in the copy is proven by the call and its parameter. */
function recordTranslations (): void {
  const fixedT = i18next.getFixedT.bind(i18next)
  vi.spyOn(i18next, 'getFixedT').mockImplementation(((...args: unknown[]) => {
    const translate = fixedT(...(args as [never])) as unknown as (key: string, options?: Record<string, unknown>) => string
    return (key: string, options?: Record<string, unknown>) => {
      translationCalls.push({ key, options })
      return translate(key, options)
    }
  }) as never)
}

/** The parameters of the last call for a key (the rendered text of the kit is the key itself). */
function lastTranslationOptions (key: string): Record<string, unknown> | undefined {
  return translationCalls.findLast(call => call.key === key)?.options
}

/** The subdomain text input inside the dialog's domain field. */
function subdomainInput (): HTMLInputElement {
  return bodyQuery('[data-testid="staging-domain"] input') as HTMLInputElement
}

async function typeSubdomain (value: string): Promise<void> {
  const input = subdomainInput()
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

vi.mock('@/entities/project/instance-actions.api', async importOriginal => {
  const actual: typeof api = await importOriginal()
  return { ...actual, getStagingDiskUsage: vi.fn(), createStaging: vi.fn() }
})

const MB = 1024 ** 2

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
    plan_settings: { domain_for_staging: { type: 'same_domain' } },
    ...overrides,
  }
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  return mountKit(CreateStagingModal, { global: { plugins: [pinia] }, attachTo: host })
}

type Wrapper = Awaited<ReturnType<typeof mountModal>>

async function openModal (wrapper: Wrapper, overrides: Partial<RawInstance> = {}) {
  const instance = toInstanceResource(raw(overrides))
  ;(wrapper.vm as unknown as { open: (i: typeof instance) => void }).open(instance)
  await flushPromises()
  return instance
}

const ROOMY = { account_usage: 0, account_limit: 10_240 * MB, wordpress_dir_usage: 500 * MB, uploads_dir_usage: 300 * MB, wordpress_db_usage: 50 * MB }

describe('CreateStagingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    translationCalls.length = 0
    vi.mocked(api.getStagingDiskUsage).mockResolvedValue(ROOMY)
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the disk usage and shows the three rows', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper)

    expect(api.getStagingDiskUsage).toHaveBeenCalledWith(7)
    expect(bodyQuery('[data-testid="staging-disk"]')!.querySelectorAll('li')).toHaveLength(3)
    wrapper.unmount()
  })

  it('asks for the name only and shows the address the name builds', async () => {
    recordTranslations()
    const wrapper = await mountModal()
    await openModal(wrapper)

    const text = bodyQuery('[data-testid="staging-modal"]')!.textContent
    expect(text).toContain('form.label.subdomain')
    expect(text).not.toContain('form.label.domain')
    expect(text).toContain('heading.instance.modal.createStaging.addressHint')
    expect(lastTranslationOptions('heading.instance.modal.createStaging.addressHint')).toEqual({ domain: 'staging.acme.example.com' })

    await typeSubdomain('demo')
    expect(lastTranslationOptions('heading.instance.modal.createStaging.addressHint')).toEqual({ domain: 'demo.acme.example.com' })
    wrapper.unmount()
  })

  it('refuses a dotted name, which would double the project\'s domain, and sends nothing', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper)

    await typeSubdomain('staging.example.com')
    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()

    expect(api.createStaging).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="staging-domain-error"]')!.textContent).toContain('form.validation.singleName')
    expect(bodyQuery('[data-testid="staging-address"]')).toBeNull()
    expect(wrapper.emitted('created')).toBeUndefined()

    await typeSubdomain('staging')
    expect(bodyQuery('[data-testid="staging-domain-error"]')).toBeNull()
    expect(bodyQuery('[data-testid="staging-address"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('refuses an empty name and sends nothing', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper)

    await typeSubdomain('')
    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()

    expect(api.createStaging).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="staging-domain-error"]')!.textContent).toContain('form.validation.required')
    wrapper.unmount()
  })

  it('still takes a whole domain on an any-domain plan, without the subdomain hint', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper, { plan_settings: { domain_for_staging: { type: 'any_domain' } } })

    const text = bodyQuery('[data-testid="staging-modal"]')!.textContent
    expect(text).toContain('form.label.domain')
    expect(text).not.toContain('form.label.subdomain')
    expect(bodyQuery('[data-testid="staging-address"]')).toBeNull()
    expect(subdomainInput().value).toBe('staging.acme.example.com')
    wrapper.unmount()
  })

  it('skips the disk block (and its request) on a separate hosting account', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper, { server_settings: { force_separate_accounts: true } })

    expect(api.getStagingDiskUsage).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="staging-disk"]')).toBeNull()
    wrapper.unmount()
  })

  it('skips the disk block for an app-lite custom project', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper, { type: 'custom' })

    expect(api.getStagingDiskUsage).not.toHaveBeenCalled()
    expect(bodyQuery('[data-testid="staging-disk"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows the billing alert only for a billable staging', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper)
    expect(bodyQuery('[data-testid="staging-billable"]')).toBeNull()

    await openModal(wrapper, { server_settings: { is_staging_billable: true } })
    expect(bodyQuery('[data-testid="staging-billable"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('colors the Cancel label with the grey utility, not the dead V2 class (#42)', async () => {
    const wrapper = await mountModal()
    await openModal(wrapper)

    const label = bodyQuery('[data-testid="staging-cancel"] span.p-2')!
    expect(label.classList.contains('text-gray-darken-1')).toBe(true)
    expect(label.classList.contains('gray--text')).toBe(false)
    wrapper.unmount()
  })

  it('posts the default domain, then alerts, closes and emits created', async () => {
    vi.mocked(api.createStaging).mockResolvedValue({ id: 70 })
    const wrapper = await mountModal()
    await openModal(wrapper)
    const add = vi.spyOn(useAlertsStore(), 'addAlert')

    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()

    expect(api.createStaging).toHaveBeenCalledWith(7, { domain: 'staging.acme.example.com', skip_uploads_dir: false })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    expect(wrapper.emitted('created')).toEqual([[{ id: 70 }]])
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('sends no domain for a site on panelalpha.online and says the panel assigns one', async () => {
    vi.mocked(api.createStaging).mockResolvedValue({ id: 73 })
    const wrapper = await mountModal()
    await openModal(wrapper, { domain: 'acme.panelalpha.online', url: 'https://acme.panelalpha.online' })

    expect(bodyQuery('[data-testid="staging-domain"]')).toBeNull()
    expect(bodyQuery('[data-testid="staging-assigned-domain"]')).not.toBeNull()

    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()

    expect(api.createStaging).toHaveBeenCalledWith(7, { skip_uploads_dir: false })
    wrapper.unmount()
  })

  it('loads the suffix list before opening when the plan converts nested subdomains (audit B2)', async () => {
    vi.mocked(api.createStaging).mockResolvedValue({ id: 71 })
    const wrapper = await mountModal()
    await openModal(wrapper, {
      plan_settings: { domain_for_staging: { type: 'same_domain' }, convert_nested_subdomains_for_staging: true },
    })
    await vi.waitFor(() => expect(bodyQuery('[data-testid="staging-submit"]')).not.toBeNull())

    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()

    expect(api.createStaging).toHaveBeenCalledWith(7, { domain: 'staging-acme.example.com', skip_uploads_dir: false })
    wrapper.unmount()
  })

  it('keeps the newer project when an older open still waits for the suffix list', async () => {
    vi.mocked(api.createStaging).mockResolvedValue({ id: 72 })
    const wrapper = await mountModal()
    const open = (wrapper.vm as unknown as { open: (i: ReturnType<typeof toInstanceResource>) => Promise<void> }).open
    const nested = toInstanceResource(raw({ id: 8, plan_settings: { domain_for_staging: { type: 'same_domain' }, convert_nested_subdomains_for_staging: true } }))
    const plain = toInstanceResource(raw({ id: 9 }))

    const first = open(nested)
    const second = open(plain)
    await Promise.all([first, second])
    await flushPromises()

    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()
    expect(api.createStaging).toHaveBeenCalledWith(9, expect.objectContaining({ domain: 'staging.acme.example.com' }))
    wrapper.unmount()
  })

  it('forces skip_uploads_dir when the files do not fit the free space', async () => {
    vi.mocked(api.getStagingDiskUsage).mockResolvedValue({ ...ROOMY, account_limit: 1024 * MB, account_usage: 800 * MB })
    vi.mocked(api.createStaging).mockResolvedValue({})
    const wrapper = await mountModal()
    await openModal(wrapper)

    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()

    expect(api.createStaging).toHaveBeenCalledWith(7, expect.objectContaining({ skip_uploads_dir: true }))
    wrapper.unmount()
  })

  it('shows the error and keeps the dialog open when the request fails', async () => {
    vi.mocked(api.createStaging).mockRejectedValue(new Error('boom'))
    const wrapper = await mountModal()
    await openModal(wrapper)
    const add = vi.spyOn(useAlertsStore(), 'addAlert')

    bodyQuery('[data-testid="staging-submit"]')!.click()
    await flushPromises()

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(wrapper.emitted('created')).toBeUndefined()
    expect(bodyQuery('[data-testid="staging-modal"]')).not.toBeNull()
    wrapper.unmount()
  })
})
