import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listProxyRules } from '@/views/hosting/containers/containers.api'
import { listDomains, setPrimaryDomain } from '@/views/hosting/hosting.api'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { getDetectedCertificate, getInstalledCertificate, resetCertificateCache } from '@/entities/ssl/ssl-certificates.api'
import { emit } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import DomainsView from './DomainsView.vue'

vi.mock('@/views/hosting/hosting.api', () => ({ listDomains: vi.fn(), addDomain: vi.fn(), updateDomain: vi.fn(), deleteDomain: vi.fn(), setPrimaryDomain: vi.fn(), verifyDomain: vi.fn() }))
vi.mock('@/views/hosting/containers/containers.api', () => ({ listProxyRules: vi.fn() }))
vi.mock('@/entities/ssl/ssl-certificates.api', () => ({
  getDetectedCertificate: vi.fn().mockResolvedValue(null),
  getInstalledCertificate: vi.fn().mockResolvedValue(null),
  resetCertificateCache: vi.fn(),
}))

function service (overrides = {}) {
  return makeService({
    privileges: ['hosting.manage_domains', 'hosting.manage_ssl'],
    dns_settings: { verification_methods: [] },
    server_accounts: [{ id: 11, domain: 'example.com' }],
    ...overrides,
  })
}

function domain (name: string) {
  return { domain: name, type: 'addon', capabilities: {}, updated_at: null }
}

async function mountDomains (hostingService = service(), singleServer = false, extraProps: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (singleServer) {
    useSessionStore().hydrateHome({ app: { single_server: { active: true } }, user: {} } as never)
  }
  const wrapper = await mountKit(DomainsView, { props: { service: hostingService, ...extraProps }, global: { plugins: [pinia] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

/** The Confirm button of the action dialog (it teleports to the body). */
function confirmButton (): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === 'button.confirm')
  if (!button) {
    throw new Error('the action dialog has no Confirm button')
  }
  return button
}

describe('DomainsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(listDomains).mockResolvedValue({ data: [domain('a.test')], meta: { domain_types: ['addon', 'sub'] } })
    vi.mocked(getDetectedCertificate).mockResolvedValue(null)
    vi.mocked(getInstalledCertificate).mockResolvedValue(null)
  })

  it('shows Points to for single-server: host:port with a rule, document_root without', async () => {
    vi.mocked(listProxyRules).mockResolvedValue([
      { id: 1, transport: 'http', upstream_host: 'app', upstream_port: 8080, upstream_protocol: 'http', listen_port: 80, server_name: 'a.test' },
    ])
    vi.mocked(listDomains).mockResolvedValue({
      data: [{ ...domain('a.test'), document_root: '/var/a' }, { ...domain('b.test'), document_root: '/var/b' }],
      meta: { domain_types: ['addon'] },
    })
    const wrapper = await mountDomains(service(), true)

    expect(listProxyRules).toHaveBeenCalledWith(1)
    const text = wrapper.find('[data-testid="domains-table"]').text()
    expect(text).toContain('pointsTo')
    expect(text).not.toContain('documentRoot')
    expect(text).toContain('app:8080')
    expect(text).not.toContain('/var/a')
    expect(text).toContain('/var/b')
    wrapper.unmount()
  })

  it('shows Points to on mobile: host:port with a rule, document_root without', async () => {
    const desktopWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 900 })
    try {
      vi.mocked(listProxyRules).mockResolvedValue([
        { id: 1, transport: 'http', upstream_host: 'app', upstream_port: 8080, upstream_protocol: 'http', listen_port: 80, server_name: 'a.test' },
      ])
      vi.mocked(listDomains).mockResolvedValue({
        data: [{ ...domain('a.test'), document_root: '/var/a' }, { ...domain('b.test'), document_root: '/var/b' }],
        meta: { domain_types: ['addon'] },
      })
      const wrapper = await mountDomains(service(), true)

      const items = wrapper.findAll('.mobile-table-item')
      expect(items.length).toBeGreaterThan(0)
      const pointsTo = wrapper.findAll('.mobile-table-item__row')
        .filter(row => row.find('.mobile-table-item__header').text() === 'table.header.pointsTo')
        .map(row => row.find('.mobile-table-item__value').text())
      expect(pointsTo).toEqual(['app:8080', '/var/b'])
      expect(wrapper.text()).not.toContain('table.header.documentRoot')
      wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: desktopWidth })
    }
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile card of a domain with the legacy markup', async () => {
    const desktopWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 900 })
    try {
      vi.mocked(listDomains).mockResolvedValue({
        data: [{ ...domain('a.test'), document_root: '/var/a', redirect_enabled: true, redirect_url: 'https://b.test' }],
        meta: { domain_types: ['addon'] },
      })
      const wrapper = await mountDomains()

      expect(normalizeHtml(wrapper.get('[data-testid="domains-row"]').html())).toMatchInlineSnapshot(`"<tr data-testid="domains-row"><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.domain</div><div class="mobile-table-item__value"><div><div class="d-flex align-center"><a class="font-weight-bold" data-testid="domains-row-link" href="https://a.test" rel="noopener noreferrer" target="_blank">a.test</a></div><span class="p-4 text-gray-darken-1" data-testid="domains-row-redirect">heading.hosting.domains.redirectedTo</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.ssl</div><div class="mobile-table-item__value"><div class="ssl-indicator d-flex align-start ssl-button d-flex align-center" data-testid="domains-row-ssl"><i class="v-icon notranslate v-theme--light text-error" style="font-size: 16px; height: 16px; width: 16px;" aria-hidden="true"><div><svg></svg></div></i><span class="text-error">general.sslProvider.none</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.type</div><div class="mobile-table-item__value"><span>heading.hosting.domains.domain.addon</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.documentRoot</div><div class="mobile-table-item__value"><span class="text-gray-darken-1">/var/a</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value" data-testid="domains-row-actions"><span class="d-inline-block"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.ssl.edit" data-testid="domains-row-action-ssl-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button></span><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.domain.delete" data-testid="domains-row-action-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
      wrapper.unmount()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: desktopWidth })
    }
  })

  it('loads the domains of the first account once on mount', async () => {
    const wrapper = await mountDomains()

    expect(listDomains).toHaveBeenCalledTimes(1)
    expect(listDomains).toHaveBeenCalledWith(11, false)
    expect(wrapper.find('[data-testid="domains-title"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('goes back to the first account of another service and reloads', async () => {
    const wrapper = await mountDomains()

    await wrapper.setProps({ service: service({ id: 2, server_accounts: [{ id: 21, domain: 'other.com' }, { id: 22, domain: 'third.com' }] }) })
    await flushPromises()

    expect(listDomains).toHaveBeenCalledTimes(2)
    expect(listDomains).toHaveBeenLastCalledWith(21, false)
    wrapper.unmount()
  })

  it('shows the account selector only with more than one account', async () => {
    const single = await mountDomains()
    expect(single.find('[data-testid="domains-account-selector"]').exists()).toBe(false)
    single.unmount()

    const several = await mountDomains(service({ server_accounts: [{ id: 11, domain: 'a.com' }, { id: 12, domain: 'b.com' }] }))
    expect(several.find('[data-testid="domains-account-selector"]').exists()).toBe(true)
    several.unmount()
  })

  it('shows an account in diagnostic mode without the controls and the table, and does not fetch', async () => {
    const wrapper = await mountDomains(service({ server_accounts: [{ id: 11, domain: 'a.com', diagnostic_mode: true }] }))

    expect(listDomains).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="domains-controls"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the empty message with an Add button for an account without domains', async () => {
    vi.mocked(listDomains).mockResolvedValue({ data: [], meta: { domain_types: ['addon', 'sub'] } })
    const wrapper = await mountDomains()

    expect(wrapper.find('[data-testid="domains-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="domains-empty-add"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the search and the header Add button while there are no domains (the Add button of the empty state stays)', async () => {
    vi.mocked(listDomains).mockResolvedValue({ data: [], meta: { domain_types: ['addon', 'sub'] } })
    const wrapper = await mountDomains()

    expect(wrapper.find('[data-testid="domains-controls"]').attributes('style')).toContain('display: none')
    expect(wrapper.find('[data-testid="domains-empty-add"]').isVisible()).toBe(true)
    wrapper.unmount()
  })

  it('says the list could not be loaded instead of the empty state, and loads it again from Retry', async () => {
    vi.mocked(listDomains).mockRejectedValueOnce({ response: { data: { message: 'The server did not answer in time. Please try again in a moment.' } } })
    const wrapper = await mountDomains()

    expect(wrapper.get('[data-testid="domains-load-error"]').text()).toContain('The server did not answer in time.')
    expect(wrapper.find('[data-testid="domains-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="domains-empty-add"]').exists()).toBe(false)

    vi.mocked(listDomains).mockResolvedValue({ data: [domain('a.test')], meta: { domain_types: ['addon', 'sub'] } })
    await wrapper.get('[data-testid="domains-load-error"] [data-testid="error-card-retry"]').trigger('click')
    await flushPromises()

    expect(listDomains).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="domains-load-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="domains-row"]').exists()).toBe(true)
    wrapper.unmount()
  })

  describe('project variant', () => {
    const twoAccounts = () => service({ server_accounts: [{ id: 11, domain: 'a.com' }, { id: 12, domain: 'b.com' }] })

    it('has the frame of the project Advanced tab', async () => {
      const wrapper = await mountDomains(service(), false, { variant: 'project', instanceId: 3 })

      expect(wrapper.classes()).toContain('advanced-hosting-page')
      const title = wrapper.find('[data-testid="domains-title"]')
      expect(title.classes()).toContain('page-title__title')
      expect(title.element.parentElement?.classList.contains('page-title__title-box')).toBe(true)
      expect(wrapper.find('.page-title.page-title--advanced').exists()).toBe(true)
      expect(wrapper.find('.title-row').exists()).toBe(false)
      const controls = wrapper.find('[data-testid="domains-controls"]')
      expect(controls.classes()).toContain('page-title__filter-controls')
      expect(controls.classes()).not.toContain('justify-end')
      expect(controls.classes()).not.toContain('align-end')
      wrapper.unmount()
    })

    it('keeps the hosting frame by default', async () => {
      const wrapper = await mountDomains()

      expect(wrapper.classes()).not.toContain('advanced-hosting-page')
      expect(wrapper.find('.title-row').exists()).toBe(true)
      expect(wrapper.find('[data-testid="domains-controls"]').classes()).toContain('justify-end')
      wrapper.unmount()
    })

    it('has no account selector with two accounts', async () => {
      const wrapper = await mountDomains(twoAccounts(), false, { variant: 'project', instanceId: 3 })

      expect(wrapper.find('[data-testid="domains-account-selector"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('does not fetch without an account id', async () => {
      const wrapper = await mountDomains(service({ server_accounts: [{ domain: 'a.com' }] }), false, { variant: 'project', instanceId: 3 })

      expect(listDomains).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('follows a new service reference without a second request for the same id', async () => {
      const wrapper = await mountDomains(service(), false, { variant: 'project', instanceId: 3 })
      expect(listDomains).toHaveBeenCalledTimes(1)

      await wrapper.setProps({ service: service() })
      await flushPromises()

      expect(listDomains).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('shows an account in diagnostic mode without the controls and the table', async () => {
      const wrapper = await mountDomains(service({ server_accounts: [{ id: 11, domain: 'a.com', diagnostic_mode: true }] }), false, { variant: 'project', instanceId: 3 })

      expect(wrapper.find('[data-testid="domains-controls"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="domains-table"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('reacts to the SSL event only of its own instance', async () => {
      const wrapper = await mountDomains(service(), false, { variant: 'project', instanceId: 9 })
      expect(getInstalledCertificate).toHaveBeenCalledTimes(1)
      vi.mocked(getInstalledCertificate).mockClear()
      vi.mocked(resetCertificateCache).mockClear()

      emit('ssl-certificate-installed', { id: 5, domain: 'a.test' })
      await flushPromises()
      expect(resetCertificateCache).not.toHaveBeenCalled()
      expect(getInstalledCertificate).not.toHaveBeenCalled()

      emit('ssl-certificate-installed', { id: 9, domain: 'a.test' })
      await flushPromises()
      expect(resetCertificateCache).toHaveBeenCalledWith(11)
      expect(getInstalledCertificate).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('says a new main domain is set, so the project frame follows it', async () => {
      vi.mocked(listDomains).mockResolvedValue({
        data: [
          { ...domain('b.test'), capabilities: { can_set_as_primary: true } },
          { ...domain('a.test'), type: 'main' },
        ],
        meta: { domain_types: ['addon'] },
      })
      vi.mocked(setPrimaryDomain).mockResolvedValue(undefined)
      const wrapper = await mountDomains(service(), false, { variant: 'project', instanceId: 3 })

      await wrapper.get('[data-testid="domains-row-action-set-primary"]').trigger('click')
      await flushPromises()
      confirmButton().click()
      await flushPromises()

      expect(setPrimaryDomain).toHaveBeenCalledWith(11, 'b.test')
      expect(wrapper.emitted('primary-domain-set')).toHaveLength(1)
      wrapper.unmount()
    })

    it('an installed certificate replaces the one an open row shows', async () => {
      vi.mocked(getDetectedCertificate).mockResolvedValue({ self_signed: true, issuer_name: 'PanelAlpha', name_match: true } as never)
      const wrapper = await mountDomains(service(), false, { variant: 'project', instanceId: 9 })
      await flushPromises()
      const cell = () => wrapper.find('[data-testid="domains-row-ssl"]').text()
      expect(cell()).toContain('general.sslProvider.selfSigned')

      // The push of the install: the same domain now serves a certificate of another issuer.
      vi.mocked(getDetectedCertificate).mockResolvedValue({ self_signed: false, issuer_name: 'FX44 107 CA 3', name_match: true } as never)
      emit('ssl-certificate-installed', { id: 9, domain: 'a.test' })
      await flushPromises()

      expect(getDetectedCertificate).toHaveBeenLastCalledWith(11, 'a.test')
      expect(cell()).toContain('FX44 107 CA 3')
      wrapper.unmount()
    })
  })

  it('shows Wrong DNS in the SSL cell for a trusted certificate that another server serves', async () => {
    vi.mocked(getDetectedCertificate).mockResolvedValue({ self_signed: false, issuer_name: 'FX44 107 CA 3', name_match: true, points_here: false } as never)
    const wrapper = await mountDomains()
    await flushPromises()

    const cell = wrapper.get('[data-testid="domains-row-ssl"]')
    expect(cell.text()).toContain('message.status.wrongDns')
    expect(cell.text()).not.toContain('FX44 107 CA 3')
    expect(cell.get('span.text-warning').text()).toBe('message.status.wrongDns')
    expect(cell.find('.text-success').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says nothing of a main domain on the hosting screen, which has no project page', async () => {
    vi.mocked(listDomains).mockResolvedValue({
      data: [{ ...domain('b.test'), capabilities: { can_set_as_primary: true } }, { ...domain('a.test'), type: 'main' }],
      meta: { domain_types: ['addon'] },
    })
    vi.mocked(setPrimaryDomain).mockResolvedValue(undefined)
    const wrapper = await mountDomains()

    await wrapper.get('[data-testid="domains-row-action-set-primary"]').trigger('click')
    await flushPromises()
    confirmButton().click()
    await flushPromises()

    expect(setPrimaryDomain).toHaveBeenCalledWith(11, 'b.test')
    expect(wrapper.emitted('primary-domain-set')).toBeUndefined()
    wrapper.unmount()
  })
})
