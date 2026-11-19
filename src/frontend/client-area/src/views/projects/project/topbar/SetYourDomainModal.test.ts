import type { InstanceResource, RawInstance } from '@/entities/project/instance-resource'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getChangeDomainOptions, putChangeDomain, putChangeSubdomain } from '@/views/projects/project/instance.api'
import { verifyDomain } from '@/entities/domain/domain-verification.api'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { createPreviewSite } from '@/entities/project/instance-preview.api'
import { unixNow } from '@/entities/project/ui/preview-site'
import PreviewSiteModal from '@/entities/project/ui/PreviewSiteModal.vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import { checkDnsMismatch } from './dns-propagation'
import SetYourDomainModal from './SetYourDomainModal.vue'

vi.mock('@/views/projects/project/instance.api', () => ({
  getChangeDomainOptions: vi.fn(),
  clearChangeDomainOptions: vi.fn(),
  putChangeDomain: vi.fn(),
  putChangeSubdomain: vi.fn(),
}))

vi.mock('@/entities/domain/verify-domain-resolving', () => ({
  verifyDomainResolving: vi.fn(),
}))

vi.mock('@/entities/domain/domain-verification.api', () => ({
  verifyDomain: vi.fn(),
}))

vi.mock('@/entities/project/instance-preview.api', () => ({
  createPreviewSite: vi.fn(),
}))

/** The raw instance the save answers with (`data.data` of the PUT, emitted as `instance-published`). */
const RAW = { id: 1, domain: 'shop.example.com' } as unknown as RawInstance

vi.mock('./dns-propagation', () => ({
  checkDnsMismatch: vi.fn(),
}))

const OPTIONS = {
  subdomains: ['panelalpha.online'],
  ip_address: '203.0.113.10',
  ipv4_addresses: ['203.0.113.10'],
  cdn_dns_records: [],
  nameservers: [],
}

const TRIGGER = '[data-testid="instance-change-domain"]'

function instance (overrides: Record<string, unknown> = {}): InstanceResource {
  return {
    id: 1,
    url: 'https://studio.example.com',
    domain: 'studio.example.com',
    cdn_dns_records: [],
    plan_settings: {},
    hasIpAddressInUrl: () => false,
    getDnsAlertsEnabled: () => true,
    hasChangeDomainPrivilege: () => true,
    setDnsResolveStatus: vi.fn(),
    getDnsIpv4Addresses: () => [],
    dns_nameservers: [],
    host_c_names: [],
    domain_zone_details: null,
    dns_settings: null,
    onboarding_subdomain: null,
    service_has_dns: false,
    ...overrides,
  } as unknown as InstanceResource
}

let host: HTMLDivElement | undefined

async function mountModal (inst: InstanceResource) {
  host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(SetYourDomainModal, { props: { instance: inst }, attachTo: host })
  await flushPromises()
  return wrapper
}

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function modalCard (): Element | null {
  return document.querySelector('[data-testid="set-domain-modal"]')
}

function domainRow (): Element | null {
  return document.querySelector('[data-testid="set-domain-domain-row"]')
}

describe('SetYourDomainModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getChangeDomainOptions).mockReset()
    vi.mocked(getChangeDomainOptions).mockResolvedValue(OPTIONS)
    vi.mocked(checkDnsMismatch).mockReset()
    vi.mocked(checkDnsMismatch).mockResolvedValue(false)
    vi.mocked(putChangeDomain).mockReset()
    vi.mocked(putChangeDomain).mockResolvedValue(RAW)
    vi.mocked(putChangeSubdomain).mockReset()
    vi.mocked(putChangeSubdomain).mockResolvedValue(RAW)
    vi.mocked(verifyDomain).mockReset()
    vi.mocked(verifyDomain).mockResolvedValue({ verification_required: false })
    vi.mocked(verifyDomainResolving).mockReset()
    vi.mocked(verifyDomainResolving).mockResolvedValue(true)
    vi.mocked(createPreviewSite).mockReset()
  })

  afterEach(() => {
    host?.remove()
    host = undefined
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('loads the options on the trigger and opens the DNS step once the mount check has ended', async () => {
    const wrapper = await mountModal(instance())

    await wrapper.get(TRIGGER).trigger('click')
    await flushPromises()

    expect(getChangeDomainOptions).toHaveBeenCalledWith(1)
    expect(modalCard()).not.toBeNull()
    expect(domainRow()).not.toBeNull()
  })

  it('keeps the DNS step hidden while the mount check is still running', async () => {
    const check = deferred<boolean>()
    vi.mocked(checkDnsMismatch).mockReturnValue(check.promise)
    const wrapper = await mountModal(instance())

    await wrapper.get(TRIGGER).trigger('click')
    await flushPromises()
    expect(modalCard()).not.toBeNull()
    expect(domainRow()).toBeNull()

    check.resolve(false)
    await flushPromises()
    expect(domainRow()).not.toBeNull()
  })

  it('keeps the modal closed and raises an alert when the options fail', async () => {
    vi.mocked(getChangeDomainOptions).mockRejectedValue(new Error('options failed'))
    const wrapper = await mountModal(instance())
    const alerts = useAlertsStore()
    const addAlert = vi.spyOn(alerts, 'addAlert')

    await wrapper.get(TRIGGER).trigger('click')
    await flushPromises()

    expect(document.querySelector('.v-dialog--active')).toBeNull()
    expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
  })

  it('shows the propagation chip and tells the title when the domain does not resolve', async () => {
    vi.mocked(checkDnsMismatch).mockResolvedValue(true)

    const wrapper = await mountModal(instance())

    expect(wrapper.find('[data-testid="instance-dns-propagation"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="instance-change-domain"]').exists()).toBe(false)
    expect(wrapper.emitted('dns-propagation-in-progress')).toHaveLength(1)
  })

  it('skips the mount check when DNS alerts are off or the URL holds an IP', async () => {
    await mountModal(instance({ getDnsAlertsEnabled: () => false }))
    expect(checkDnsMismatch).not.toHaveBeenCalled()

    host?.remove()
    host = undefined
    await mountModal(instance({ hasIpAddressInUrl: () => true }))
    expect(checkDnsMismatch).not.toHaveBeenCalled()
  })

  describe('step 0 (the form, DNS alerts off)', () => {
    async function openForm (overrides: Record<string, unknown> = {}) {
      const wrapper = await mountModal(instance({ getDnsAlertsEnabled: () => false, ...overrides }))
      await wrapper.get(TRIGGER).trigger('click')
      await flushPromises()
      return wrapper
    }

    function domainInput (): HTMLInputElement | null {
      return document.querySelector<HTMLInputElement>('[data-testid="set-domain-domain-field"] input')
    }

    it('opens on the form and skips the DNS check when the DNS alerts are off', async () => {
      await openForm()

      expect(document.querySelector('[data-testid="set-domain-form"]')).not.toBeNull()
      expect(domainInput()).not.toBeNull()
      expect(domainRow()).toBeNull()
      expect(checkDnsMismatch).not.toHaveBeenCalled()
    })

    it('shows the subdomain panel only when there are free subdomains', async () => {
      await openForm()
      expect(document.querySelector('[data-testid="set-domain-subdomain-title"]')).not.toBeNull()
    })

    it('warns that a PanelAlpha Online address is gone for good once the main domain changes', async () => {
      await openForm({ domain: 'studio.panelalpha.online', url: 'https://studio.panelalpha.online' })
      expect(document.querySelector('[data-testid="set-domain-online-warning"]')).not.toBeNull()
    })

    it('shows no such warning on an ordinary domain', async () => {
      await openForm()
      expect(document.querySelector('[data-testid="set-domain-online-warning"]')).toBeNull()
    })

    it('hides the subdomain panel without free subdomains', async () => {
      vi.mocked(getChangeDomainOptions).mockResolvedValue({ ...OPTIONS, subdomains: [] })
      await openForm()
      expect(document.querySelector('[data-testid="set-domain-subdomain-title"]')).toBeNull()
    })

    it('shows the order link when the account has one', async () => {
      useSessionStore().hydrateHome({ app: {}, user: { order_domain_link: 'https://example.com/order' } } as never)
      await openForm()
      expect(document.querySelector('[data-testid="set-domain-order-link"]')?.getAttribute('href')).toBe('https://example.com/order')
    })

    it('hides the order link without one', async () => {
      useSessionStore().hydrateHome({ app: {}, user: {} } as never)
      await openForm()
      expect(document.querySelector('[data-testid="set-domain-order-link"]')).toBeNull()
    })

    it('marks the empty domain field invalid after a blur and shows the rule message under it (SSE-DOM-03)', async () => {
      await openForm()
      // Vuetify validates `validate-on="blur"` only when focus leaves a field that had focus (as `AcceptInviteView.test.ts`).
      const input = domainInput()
      const field = new DOMWrapper(input as HTMLInputElement)
      await field.trigger('focus')
      await field.trigger('blur')
      await flushPromises()

      expect(document.querySelector('[data-testid="set-domain-domain-field"] .v-field--error')).not.toBeNull()
      expect(document.querySelector('[data-testid="set-domain-form"] .v-messages__message')?.textContent).toBe('validation.required')
    })

    it('shows the "must be valid" message under a wrong domain (SSE-DOM-03)', async () => {
      await openForm()
      const input = domainInput() as HTMLInputElement
      const field = new DOMWrapper(input)
      await field.trigger('focus')
      await field.setValue('not a domain')
      await field.trigger('blur')
      await flushPromises()

      expect(document.querySelector('[data-testid="set-domain-form"] .v-messages__message')?.textContent?.trim()).toBeTruthy()
    })

    // The two rows are a choice, not an accordion. Clicking the row that was already open collapsed both, which
    // unmounted the domain field and left "Use this domain" with nothing to validate; Vuetify's panels toggle by default.
    it('keeps the open row and its field when the open row is clicked', async () => {
      await openForm()
      const domainTitle = () => document.querySelector<HTMLElement>('[data-testid="set-domain-domain-title"]')
      const domainPanel = () => domainTitle()?.closest('.v-expansion-panel')

      expect(domainPanel()?.className).toContain('--active')
      expect(domainInput()).not.toBeNull()

      domainTitle()?.click()
      await flushPromises()
      expect(domainPanel()?.className).toContain('--active')
      expect(domainInput()).not.toBeNull()

      document.querySelector<HTMLElement>('[data-testid="set-domain-subdomain-title"]')?.click()
      await flushPromises()
      expect(document.querySelector('[data-testid="set-domain-subdomain-field"]')).not.toBeNull()
      document.querySelector<HTMLElement>('[data-testid="set-domain-subdomain-title"]')?.click()
      await flushPromises()
      expect(document.querySelector('[data-testid="set-domain-subdomain-field"]')).not.toBeNull()

      domainTitle()?.click()
      await flushPromises()
      expect(domainInput()).not.toBeNull()
      expect(document.querySelector('[data-testid="set-domain-subdomain-field"]')).toBeNull()
    })

    it('shows the required message and sends nothing when the domain field is empty', async () => {
      await openForm()

      clickUse()
      await flushPromises()

      expect(document.querySelector('[data-testid="set-domain-form"] .v-messages__message')?.textContent).toBe('validation.required')
      expect(putChangeDomain).not.toHaveBeenCalled()
      expect(putChangeSubdomain).not.toHaveBeenCalled()
      expect(modalCard()).not.toBeNull()
    })

    it('saves the domain with PUT, checks DNS on the old instance, emits the raw instance and shows the DNS step', async () => {
      const wrapper = await openForm()

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      expect(putChangeDomain).toHaveBeenCalledWith(1, 'shop.example.com')
      expect(checkDnsMismatch).toHaveBeenCalledTimes(1)
      expect(wrapper.emitted('instance-published')?.[0]).toEqual([RAW])
      expect(domainRow()).not.toBeNull()
    })

    it('saves the subdomain with PUT, emits the raw instance and closes the modal', async () => {
      const wrapper = await openForm()

      document.querySelector<HTMLElement>('[data-testid="set-domain-subdomain-title"]')?.click()
      await flushPromises()
      await new DOMWrapper(document.querySelector<HTMLInputElement>('[data-testid="set-domain-subdomain-field"] input') as HTMLInputElement)
        .setValue('blog')
      await flushPromises()
      clickUse()
      await flushPromises()

      expect(putChangeSubdomain).toHaveBeenCalledWith(1, { subdomain: 'blog', domain: 'panelalpha.online' })
      expect(putChangeDomain).not.toHaveBeenCalled()
      expect(wrapper.emitted('instance-published')?.[0]).toEqual([RAW])
      expect(document.querySelector('.v-dialog--active')).toBeNull()
    })

    it('raises an alert and stays on the form when the save fails', async () => {
      vi.mocked(putChangeDomain).mockRejectedValue({ response: { data: { message: 'The domain is invalid.' } } })
      const wrapper = await openForm()
      const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: 'The domain is invalid.' })
      expect(wrapper.emitted('instance-published')).toBeUndefined()
      expect(checkDnsMismatch).not.toHaveBeenCalled()
      expect(document.querySelector('[data-testid="set-domain-form"]')).not.toBeNull()
    })

    it('shows the loading state on "Use this domain" while the save is in flight', async () => {
      const save = deferred<RawInstance>()
      vi.mocked(putChangeDomain).mockReturnValue(save.promise)
      await openForm()

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()
      expect(document.querySelector('[data-testid="set-domain-use"]')?.classList.contains('v-btn--loading')).toBe(true)

      // A saved domain moves to step 1, which has no "Use this domain" button: the loading state ends with the step change.
      save.resolve(RAW)
      await flushPromises()
      expect(document.querySelector('[data-testid="set-domain-use"]')).toBeNull()
      expect(domainRow()).not.toBeNull()
    })

    it('opens the transfer step when transfer is allowed and the registrar asks for verification', async () => {
      vi.mocked(verifyDomain).mockResolvedValue({
        verification_required: true,
        verification_record: { name: 'shop.example.com', type: 'TXT', content: 'verify=abc' },
      })
      await openForm({ service_id: 7, server_settings: { domain_transfer_allowed: true }, plan_settings: { domain_transfer_enabled: true } })

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      expect(verifyDomain).toHaveBeenCalledWith(7, 'shop.example.com')
      expect(document.querySelector('[data-testid="set-domain-transfer"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="set-domain-transfer-now"]')).not.toBeNull()
      expect(putChangeDomain).not.toHaveBeenCalled()
    })

    it('shows the impossible copy on the transfer step when the plan has no transfer', async () => {
      vi.mocked(verifyDomain).mockResolvedValue({ verification_required: true })
      await openForm({ service_id: 7, server_settings: { domain_transfer_allowed: true }, plan_settings: { domain_transfer_enabled: false } })

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      expect(document.querySelector('[data-testid="set-domain-transfer"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="set-domain-transfer-now"]')).toBeNull()
      expect(putChangeDomain).not.toHaveBeenCalled()
    })

    it('shows the steps and the record value on the transfer step (kit-transfer-domain-steps)', async () => {
      vi.mocked(verifyDomain).mockResolvedValue({
        verification_required: true,
        verification_record: { name: 'shop.example.com', type: 'TXT', content: 'verify=abc' },
      })
      await openForm({ service_id: 7, server_settings: { domain_transfer_allowed: true }, plan_settings: { domain_transfer_enabled: true } })

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      const step = document.querySelector('[data-testid="set-domain-transfer"]')
      expect(step?.querySelectorAll('ol > li')).toHaveLength(4)
      expect(step?.querySelector('.value')?.textContent?.trim()).toBe('verify=abc')
      expect(step?.textContent).toContain('heading.onboarding.transferDomain.message.possible.stepsTitle')
    })

    it('shows the subtitle and the impossible copy without steps on the transfer step (kit-transfer-domain-steps)', async () => {
      vi.mocked(verifyDomain).mockResolvedValue({ verification_required: true })
      await openForm({ service_id: 7, server_settings: { domain_transfer_allowed: true }, plan_settings: { domain_transfer_enabled: false } })

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      const step = document.querySelector('[data-testid="set-domain-transfer"]')
      expect(step?.querySelector('ol')).toBeNull()
      expect(step?.querySelector('h6')?.textContent).toContain('heading.onboarding.transferDomain.subtitle')
      expect(step?.textContent).toContain('heading.onboarding.transferDomain.message.impossible')
    })

    it('raises an alert and stays on the form when the transfer check fails', async () => {
      vi.mocked(verifyDomain).mockRejectedValue({ response: { data: { message: 'The domain is invalid.' } } })
      await openForm({ service_id: 7, server_settings: { domain_transfer_allowed: true } })
      const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      expect(addAlert).toHaveBeenCalledWith({ success: false, errorMessage: 'The domain is invalid.' })
      expect(document.querySelector('[data-testid="set-domain-form"]')).not.toBeNull()
      expect(putChangeDomain).not.toHaveBeenCalled()
    })

    it('checks DNS with the eager flag and the service nameservers, then saves when the check passes', async () => {
      await openForm({
        plan_settings: { eager_domain_dns_verification_enabled: true },
        service_nameservers: ['ns1.example.com'],
      })

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      expect(verifyDomainResolving).toHaveBeenCalledWith(expect.objectContaining({
        domain: 'shop.example.com',
        eagerDnsVerification: true,
        nameservers: ['ns1.example.com'],
      }))
      expect(putChangeDomain).toHaveBeenCalledWith(1, 'shop.example.com')
    })

    it('moves to the DNS verification step when the first check fails, without saving', async () => {
      vi.mocked(verifyDomainResolving).mockResolvedValue(false)
      await openForm({ plan_settings: { eager_domain_dns_verification_enabled: true } })

      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      const alert = document.querySelector('[data-testid="set-domain-verify-alert"]')
      expect(alert?.classList.contains('app-message--error')).toBe(true)
      expect(putChangeDomain).not.toHaveBeenCalled()
    })

    it('green path: a passing re-check shows the success alert, and "Change domain" saves (fix 1)', async () => {
      vi.mocked(verifyDomainResolving).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      await openForm({ plan_settings: { eager_domain_dns_verification_enabled: true } })
      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      // The re-check waits 2 s: the fake clock is on only for the click.
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      try {
        document.querySelector<HTMLElement>('[data-testid="set-domain-verify-button"]')?.click()
        await vi.advanceTimersByTimeAsync(2000)
      } finally {
        vi.useRealTimers()
      }
      await flushPromises()

      expect(document.querySelector('[data-testid="set-domain-verify-alert"]')?.classList.contains('app-message--success')).toBe(true)
      expect(document.querySelector('[data-testid="set-domain-verify-button"]')).toBeNull()
      expect(document.querySelector('[data-testid="set-domain-skip"]')).toBeNull()

      document.querySelector<HTMLElement>('[data-testid="set-domain-change-confirm"]')?.click()
      await flushPromises()
      expect(putChangeDomain).toHaveBeenCalledWith(1, 'shop.example.com')
    })

    it('clears the verification flags on every opening, so the next opening shows "incorrect" again (fix 3)', async () => {
      vi.mocked(verifyDomainResolving).mockResolvedValue(false)
      const wrapper = await openForm({ plan_settings: { eager_domain_dns_verification_enabled: true } })
      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      vi.useFakeTimers({ toFake: ['setTimeout'] })
      try {
        document.querySelector<HTMLElement>('[data-testid="set-domain-verify-button"]')?.click()
        await vi.advanceTimersByTimeAsync(2000)
      } finally {
        vi.useRealTimers()
      }
      await flushPromises()
      expect(document.querySelector('[data-testid="set-domain-verify-alert"]')?.textContent).toContain('tryAgain')

      document.querySelector<HTMLElement>('[data-testid="set-domain-close"]')?.click()
      await flushPromises()
      await wrapper.get(TRIGGER).trigger('click')
      await flushPromises()

      expect(document.querySelector('[data-testid="set-domain-verify-alert"]')?.textContent).toContain('incorrect')
      expect(document.querySelector('[data-testid="set-domain-verify-alert"]')?.textContent).not.toContain('tryAgain')
    })

    it('skip saves the domain without a further check', async () => {
      vi.mocked(verifyDomainResolving).mockResolvedValue(false)
      await openForm({ plan_settings: { eager_domain_dns_verification_enabled: true } })
      await fillDomain('shop.example.com')
      clickUse()
      await flushPromises()

      document.querySelector<HTMLElement>('[data-testid="set-domain-skip"]')?.click()
      await flushPromises()

      expect(putChangeDomain).toHaveBeenCalledWith(1, 'shop.example.com')
      expect(verifyDomainResolving).toHaveBeenCalledTimes(1)
    })

    function clickUse () {
      document.querySelector<HTMLElement>('[data-testid="set-domain-use"]')?.click()
    }

    async function fillDomain (value: string) {
      const input = document.querySelector<HTMLInputElement>('[data-testid="set-domain-domain-field"] input') as HTMLInputElement
      await new DOMWrapper(input).setValue(value)
      await flushPromises()
    }
  })

  // `Generate URL` closed the dialog it lived in: the preview window was nested in that lazy `v-dialog`, so it was
  // destroyed with it and no `POST preview` went out.
  describe('Generate URL (single server)', () => {
    function singleServer (overrides: Record<string, unknown> = {}): InstanceResource {
      useSessionStore().hydrateHome({ app: { single_server: { active: true } } } as never)
      return instance(overrides)
    }

    async function openAndGenerate (): Promise<void> {
      const wrapper = await mountModal(singleServer())
      await wrapper.get(TRIGGER).trigger('click')
      await flushPromises()
      document.querySelector<HTMLElement>('[data-testid="set-domain-preview-button"]')?.click()
      await flushPromises()
    }

    it('keeps the preview window outside the domain dialog', async () => {
      const wrapper = await mountModal(singleServer())

      expect(wrapper.findComponent(PreviewSiteModal).exists()).toBe(true)
    })

    it('closes the dialog, creates the preview and shows the temporary URL', async () => {
      vi.mocked(createPreviewSite).mockResolvedValue({
        id: 1,
        preview_site: { url: 'https://preview-abcd1234.panelalpha.online', valid_until: String(unixNow() + 600) },
      } as never)

      await openAndGenerate()

      expect(createPreviewSite).toHaveBeenCalledWith(1)
      const preview = document.querySelector('[data-testid="preview-site-modal"]')
      expect(preview).not.toBeNull()
      expect(preview?.textContent).toContain('https://preview-abcd1234.panelalpha.online')
      expect(modalCard()?.contains(preview as Node)).toBe(false)
    })

    it('shows the stored preview while it is still valid, without a second request', async () => {
      useSessionStore().hydrateHome({ app: { single_server: { active: true } } } as never)
      const wrapper = await mountModal(instance({
        preview_site: { url: 'https://preview-old.panelalpha.online', valid_until: String(unixNow() + 600) },
      }))
      await wrapper.get(TRIGGER).trigger('click')
      await flushPromises()
      document.querySelector<HTMLElement>('[data-testid="set-domain-preview-button"]')?.click()
      await flushPromises()

      expect(createPreviewSite).not.toHaveBeenCalled()
      expect(document.querySelector('[data-testid="preview-site-modal"]')?.textContent)
        .toContain('https://preview-old.panelalpha.online')
    })
  })
})

// jsdom does not evaluate scoped SCSS, so the radio and panel style is pinned in the source.
describe('SetYourDomainModal panel style', () => {
  const style = readFileSync(join(import.meta.dirname, 'SetYourDomainModal.vue'), 'utf8').split('<style', 2)[1]

  it('draws the radio dot without the V4 focus ring border and fills it with the checkbox theme colour', () => {
    const afterRule = style.match(/\/\/ V4 gives the title's `::after`[\s\S]*?&::after \{([^}]*)\}/)?.[1] ?? ''
    expect(afterRule).toMatch(/border:\s*0;/)
    expect(style).toContain('background: rgb(var(--v-theme-checkbox));')
  })

  it('hides the V4 panel shadow node', () => {
    expect(style).toMatch(/:deep\(\.v-expansion-panel__shadow\)\s*\{\s*display:\s*none;/)
  })

  it('does not draw a border around the whole input (field and message)', () => {
    expect(style).not.toMatch(/\.v-input\.v-input--error/)
  })

  it('keeps the subdomain message on one line and the row top aligned', () => {
    const field = style.match(/\.set-domain-subdomain-field \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(field).toMatch(/white-space:\s*nowrap;/)
    expect(field).toMatch(/overflow:\s*visible;/)
    expect(readFileSync(join(import.meta.dirname, 'SetYourDomainModal.vue'), 'utf8')).toMatch(/class="d-flex align-start"\s+data-testid="set-domain-subdomain-row"/)
  })
})
