import type { SslSettings } from './security.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import type { SslCertificate } from '@/entities/ssl/ssl-certificates.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as sslCertificatesApi from '@/entities/ssl/ssl-certificates.api'
import PendingSslIndicator from '@/entities/ssl/ui/PendingSslIndicator.vue'
import { emit } from '@/shared/events/app-events'
import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import { clickOverlay, expectOverlayBeforeCard, openDialogs } from '@/shared/ui/modal/dialog-shell.fixtures'
import SettingCardSkeleton from '@/shared/ui/setting-card/SettingCardSkeleton.vue'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import ForceHttpsCard from './ForceHttpsCard.vue'
import SearchEngineIndexingCard from './SearchEngineIndexingCard.vue'
import * as securityApi from './security.api'
import SecurityView from './SecurityView.vue'
import SslCertificateCard from './SslCertificateCard.vue'

vi.mock('./security.api', () => ({
  getSslSettings: vi.fn(),
  updateSslSettings: vi.fn(),
  getSearchEngineIndexing: vi.fn(),
  updateSearchEngineIndexing: vi.fn(),
}))

vi.mock('@/entities/ssl/ssl-certificates.api', async importOriginal => ({
  ...await importOriginal<typeof sslCertificatesApi>(),
  getDetectedCertificate: vi.fn(),
  resetCertificateCache: vi.fn(),
}))

const HOSTING_ID = 77
const DOMAIN = 'example.com'
const INSTANCE_ID = 9

const VALID_CERTIFICATE: SslCertificate = { name_match: true, self_signed: false, issuer_name: 'R3' }
const EXPIRED_CERTIFICATE: SslCertificate = { status: 'expired', name_match: true, self_signed: false, issuer_name: 'R3' }
const INVALID_CERTIFICATE: SslCertificate = { name_match: false, self_signed: false, issuer_name: 'R3' }

interface InstanceOptions {
  ssl?: boolean
  indexing?: boolean
  orderStatus?: string | null
}

function makeInstance ({ ssl = true, indexing = true, orderStatus = null }: InstanceOptions = {}): InstanceResource {
  return {
    id: INSTANCE_ID,
    hostingId: HOSTING_ID,
    domain: DOMAIN,
    hostingServerType: 'custom',
    ssl_order_status: orderStatus,
    hasManageSslPrivilege: vi.fn(() => ssl),
    hasManageSearchEngineIndexingPrivilege: vi.fn(() => indexing),
  } as unknown as InstanceResource
}

function settings (overrides: SslSettings = {}): SslSettings {
  return {
    can_https_redirect: true,
    force_https_redirect: false,
    domain_shared_instances: [{ id: INSTANCE_ID, name: 'Own', url: 'https://own.example' }],
    ...overrides,
  }
}

function deferred<T> () {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function mountView (instance: InstanceResource = makeInstance()) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(SecurityView, { props: { instance }, global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

function sslCard (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findComponent(SslCertificateCard)
}

function httpsSwitch (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findComponent(ForceHttpsCard).findComponent(ButtonSwitch)
}

function indexingSwitch (wrapper: Awaited<ReturnType<typeof mountView>>) {
  return wrapper.findComponent(SearchEngineIndexingCard).findComponent(ButtonSwitch)
}

describe('SecurityView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(securityApi.getSslSettings).mockResolvedValue(settings())
    vi.mocked(securityApi.updateSslSettings).mockResolvedValue(settings({ force_https_redirect: true }))
    vi.mocked(securityApi.getSearchEngineIndexing).mockResolvedValue(false)
    vi.mocked(securityApi.updateSearchEngineIndexing).mockResolvedValue(undefined)
    vi.mocked(sslCertificatesApi.getDetectedCertificate).mockResolvedValue(VALID_CERTIFICATE)
  })

  it('renders the three setting cards with an h6 title and their subtitle', async () => {
    const wrapper = await mountView()

    expect(wrapper.findAll('h6').map(heading => heading.text())).toEqual(expect.arrayContaining([
      'heading.instance.advanced.security.certificate.title',
      'heading.instance.advanced.security.forceRedirect.title',
      'heading.instance.advanced.security.disableSearchEngineIndexing.title',
    ]))
    for (const key of ['certificate', 'forceRedirect', 'disableSearchEngineIndexing']) {
      expect(wrapper.text()).toContain(`heading.instance.advanced.security.${key}.subtitle`)
    }
    wrapper.unmount()
  })

  describe('privileges', () => {
    it('renders no SSL or HTTPS card and asks for no SSL data without manage_ssl', async () => {
      const wrapper = await mountView(makeInstance({ ssl: false }))

      expect(wrapper.findComponent(SslCertificateCard).exists()).toBe(false)
      expect(wrapper.findComponent(ForceHttpsCard).exists()).toBe(false)
      expect(securityApi.getSslSettings).not.toHaveBeenCalled()
      expect(sslCertificatesApi.getDetectedCertificate).not.toHaveBeenCalled()
    })

    it('renders no indexing card and asks for no indexing status without the privilege', async () => {
      const wrapper = await mountView(makeInstance({ indexing: false }))

      expect(wrapper.findComponent(SearchEngineIndexingCard).exists()).toBe(false)
      expect(securityApi.getSearchEngineIndexing).not.toHaveBeenCalled()
    })

    it('keeps only the page title and asks for no data without any Security privilege', async () => {
      // No guard and no redirect; lite shows an empty page with the title, as the view does here.
      const wrapper = await mountView(makeInstance({ ssl: false, indexing: false }))

      expect(wrapper.find('.page-title__title').text()).toContain('heading.instance.advanced.security.title')
      expect(wrapper.findComponent(SslCertificateCard).exists()).toBe(false)
      expect(wrapper.findComponent(ForceHttpsCard).exists()).toBe(false)
      expect(wrapper.findComponent(SearchEngineIndexingCard).exists()).toBe(false)
      expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
      expect(securityApi.getSslSettings).not.toHaveBeenCalled()
      expect(securityApi.getSearchEngineIndexing).not.toHaveBeenCalled()
      expect(sslCertificatesApi.getDetectedCertificate).not.toHaveBeenCalled()
    })

    it('shows the indexing card and loads its status without manage_ssl (D2: SSL data only with manage_ssl)', async () => {
      const wrapper = await mountView(makeInstance({ ssl: false, indexing: true }))

      expect(wrapper.findComponent(SslCertificateCard).exists()).toBe(false)
      expect(wrapper.findComponent(ForceHttpsCard).exists()).toBe(false)
      expect(wrapper.findComponent(SearchEngineIndexingCard).exists()).toBe(true)
      expect(securityApi.getSearchEngineIndexing).toHaveBeenCalledWith(INSTANCE_ID)
      expect(securityApi.getSslSettings).not.toHaveBeenCalled()
      expect(sslCertificatesApi.getDetectedCertificate).not.toHaveBeenCalled()
    })
  })

  describe('SSL certificate card', () => {
    it('shows the skeleton until the certificate request settles', async () => {
      const certificate = deferred<SslCertificate | null>()
      vi.mocked(sslCertificatesApi.getDetectedCertificate).mockReturnValue(certificate.promise)

      const wrapper = await mountView()

      expect(sslCard(wrapper).findComponent(SettingCardSkeleton).exists()).toBe(true)

      certificate.resolve(VALID_CERTIFICATE)
      await flushPromises()

      expect(sslCard(wrapper).findComponent(SettingCardSkeleton).exists()).toBe(false)
      expect(sslCard(wrapper).find('[data-testid="security-ssl-manage"]').exists()).toBe(true)
    })

    it('marks an invalid certificate with the error text class', async () => {
      vi.mocked(sslCertificatesApi.getDetectedCertificate).mockResolvedValue(INVALID_CERTIFICATE)

      const wrapper = await mountView()

      const label = sslCard(wrapper).find('.text-error')
      expect(label.exists()).toBe(true)
      expect(label.text()).toContain('heading.instance.advanced.security.certificate.label')
    })

    it('marks an expired certificate with the error text class even when the name matches', async () => {
      // The Engine verdict (`status`) wins over the flags
      vi.mocked(sslCertificatesApi.getDetectedCertificate).mockResolvedValue(EXPIRED_CERTIFICATE)

      const wrapper = await mountView()

      const label = sslCard(wrapper).find('.text-error')
      expect(label.exists()).toBe(true)
      expect(label.text()).toContain('heading.instance.advanced.security.certificate.label')
    })

    it('does not mark a valid certificate with the error text class', async () => {
      const wrapper = await mountView()

      expect(sslCard(wrapper).find('.text-error').exists()).toBe(false)
    })

    it('shows the Wrong DNS text and no red label for a trusted certificate that points elsewhere', async () => {
      vi.mocked(sslCertificatesApi.getDetectedCertificate).mockResolvedValue({ ...VALID_CERTIFICATE, points_here: false })

      const wrapper = await mountView()

      expect(sslCard(wrapper).find('.text-error').exists()).toBe(false)
      expect(sslCard(wrapper).text()).toContain('message.status.wrongDns')
    })

    it('shows the pending indicator and disables Manage while the order is pending', async () => {
      vi.mocked(sslCertificatesApi.getDetectedCertificate).mockResolvedValue(null)

      const wrapper = await mountView(makeInstance({ orderStatus: 'pending' }))

      expect(sslCard(wrapper).findComponent(PendingSslIndicator).exists()).toBe(true)
      expect(sslCard(wrapper).find('[data-testid="security-ssl-manage"]').attributes('disabled')).toBeDefined()
    })

    it('asks for the SSL data again when the page\'s own instance reports an installed certificate', async () => {
      const wrapper = await mountView()
      vi.clearAllMocks()

      emit('ssl-certificate-installed', { id: 12 })
      await flushPromises()
      expect(securityApi.getSslSettings).not.toHaveBeenCalled()

      emit('ssl-certificate-installed', { id: INSTANCE_ID })
      await flushPromises()
      expect(sslCertificatesApi.resetCertificateCache).toHaveBeenCalledWith(HOSTING_ID)
      expect(securityApi.getSslSettings).toHaveBeenCalledTimes(1)
      expect(sslCertificatesApi.getDetectedCertificate).toHaveBeenCalledTimes(1)

      wrapper.unmount()
    })

    it('ignores an installed certificate event without manage_ssl', async () => {
      const wrapper = await mountView(makeInstance({ ssl: false }))

      emit('ssl-certificate-installed', { id: INSTANCE_ID })
      await flushPromises()

      expect(sslCertificatesApi.resetCertificateCache).not.toHaveBeenCalled()
      expect(securityApi.getSslSettings).not.toHaveBeenCalled()

      wrapper.unmount()
    })
  })

  describe('force HTTPS card', () => {
    it('saves the reversed value and keeps it when the server accepts it', async () => {
      const wrapper = await mountView()

      await httpsSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(securityApi.updateSslSettings).toHaveBeenCalledTimes(1)
      expect(securityApi.updateSslSettings).toHaveBeenCalledWith(HOSTING_ID, DOMAIN, true)
      expect(httpsSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('ignores a second click while a save is in flight', async () => {
      const save = deferred<SslSettings>()
      vi.mocked(securityApi.updateSslSettings).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await httpsSwitch(wrapper).trigger('click')
      await nextTick()
      await httpsSwitch(wrapper).trigger('click')
      await nextTick()

      expect(securityApi.updateSslSettings).toHaveBeenCalledTimes(1)

      save.resolve(settings({ force_https_redirect: true }))
      await flushPromises()

      expect(httpsSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('rolls back to the last saved state when a save fails', async () => {
      const wrapper = await mountView()

      // First save succeeds: the server confirms force_https_redirect = true.
      await httpsSwitch(wrapper).trigger('click')
      await flushPromises()
      expect(httpsSwitch(wrapper).props('modelValue')).toBe(true)

      // Second save fails: the switch goes back to the last saved state (true), not to the default.
      vi.mocked(securityApi.updateSslSettings).mockRejectedValueOnce(new Error('boom'))
      await httpsSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(securityApi.updateSslSettings).toHaveBeenCalledTimes(2)
      expect(securityApi.updateSslSettings).toHaveBeenLastCalledWith(HOSTING_ID, DOMAIN, false)
      expect(httpsSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('opens the shared-domain modal with the escaped list of other instances and saves on Confirm', async () => {
      vi.mocked(securityApi.getSslSettings).mockResolvedValue(settings({
        domain_shared_instances: [
          { id: INSTANCE_ID, name: 'Own', url: 'https://own.example' },
          { id: 12, name: '<b>Other</b>', url: 'https://other.example' },
        ],
      }))
      const wrapper = await mountView()

      await httpsSwitch(wrapper).trigger('click')
      await flushPromises()

      const modal = wrapper.findComponent(BasicModal)
      expect(modal.exists()).toBe(true)
      const message = String(modal.props('message'))
      expect(message).toContain('<li>&lt;b&gt;Other&lt;/b&gt; (https://other.example)</li>')
      expect(message).not.toContain('<b>Other</b>')
      expect(message).not.toContain('Own (https://own.example)')
      expect(securityApi.updateSslSettings).not.toHaveBeenCalled()

      const confirm = modal.findAll('button').find(button => button.text() === 'button.confirm')
      expect(confirm).toBeDefined()
      await confirm!.trigger('click')
      await flushPromises()

      expect(securityApi.updateSslSettings).toHaveBeenCalledTimes(1)
      expect(securityApi.updateSslSettings).toHaveBeenCalledWith(HOSTING_ID, DOMAIN, true)
    })

    it('closes the shared-domain modal on Cancel without saving', async () => {
      vi.mocked(securityApi.getSslSettings).mockResolvedValue(settings({
        domain_shared_instances: [
          { id: INSTANCE_ID, name: 'Own', url: 'https://own.example' },
          { id: 12, name: 'Other', url: 'https://other.example' },
        ],
      }))
      const wrapper = await mountView()

      await httpsSwitch(wrapper).trigger('click')
      await flushPromises()

      const modal = wrapper.findComponent(BasicModal)
      const cancel = modal.findAll('button').find(button => button.text() === 'button.cancel')
      expect(cancel).toBeDefined()
      await cancel!.trigger('click')
      await flushPromises()

      expect(securityApi.updateSslSettings).not.toHaveBeenCalled()
    })

    it('does nothing on click while the domain cannot redirect', async () => {
      vi.mocked(securityApi.getSslSettings).mockResolvedValue(settings({ can_https_redirect: false }))
      const wrapper = await mountView()

      await httpsSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(securityApi.updateSslSettings).not.toHaveBeenCalled()
      expect(wrapper.findComponent(BasicModal).exists()).toBe(false)
    })
  })

  describe('search engine indexing card', () => {
    it('sends the current flag and flips the switch after the server accepts it', async () => {
      const wrapper = await mountView()
      expect(indexingSwitch(wrapper).props('modelValue')).toBe(false)

      await indexingSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(securityApi.updateSearchEngineIndexing).toHaveBeenCalledTimes(1)
      expect(securityApi.updateSearchEngineIndexing).toHaveBeenCalledWith(INSTANCE_ID, false)
      expect(indexingSwitch(wrapper).props('modelValue')).toBe(true)
    })

    it('ignores a second click while a save is in flight', async () => {
      const save = deferred<void>()
      vi.mocked(securityApi.updateSearchEngineIndexing).mockReturnValue(save.promise)
      const wrapper = await mountView()

      await indexingSwitch(wrapper).trigger('click')
      await nextTick()
      await indexingSwitch(wrapper).trigger('click')
      await nextTick()

      expect(securityApi.updateSearchEngineIndexing).toHaveBeenCalledTimes(1)

      save.resolve()
      await flushPromises()

      expect(indexingSwitch(wrapper).props('modelValue')).toBe(true)
    })
  })
})

// Characterization of the Force HTTPS switch box: written on the code with the local disabled rule, kept after the
// rule moved to `ButtonSwitch`; only the container classes may differ (`switch-container--disabled` + `switch-container--disabled-brand`).
describe('ForceHttpsCard switch DOM', () => {
  const httpsDom = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
    normalizeHtml(wrapper.findComponent(ForceHttpsCard).find('.switch-container').html()).replace(/ id="switch-v-\d+"/g, '')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(securityApi.getSearchEngineIndexing).mockResolvedValue(false)
    vi.mocked(sslCertificatesApi.getDetectedCertificate).mockResolvedValue(VALID_CERTIFICATE)
  })

  it('keeps the DOM when the domain cannot redirect (disabled)', async () => {
    vi.mocked(securityApi.getSslSettings).mockResolvedValue(settings({ can_https_redirect: false }))
    const wrapper = await mountView()

    expect(httpsDom(wrapper)).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2 mt-0 switch-container--disabled"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-input--disabled v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--disabled v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input disabled="" aria-disabled="true" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })

  it('keeps the DOM when the domain can redirect and the redirect is on', async () => {
    vi.mocked(securityApi.getSslSettings).mockResolvedValue(settings({ force_https_redirect: true }))
    const wrapper = await mountView()

    expect(httpsDom(wrapper)).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2 mt-0"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input checked="" aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })
})

// The force-redirect dialog is always persistent; the legacy overlay sits before the card and a click on it does nothing.
describe('SecurityView force-redirect dialog shell (kit-dialog-advanced)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(securityApi.getSslSettings).mockResolvedValue(settings({
      domain_shared_instances: [
        { id: INSTANCE_ID, name: 'Own', url: 'https://own.example' },
        { id: 12, name: 'Other', url: 'https://other.example' },
      ],
    }))
    vi.mocked(securityApi.updateSslSettings).mockResolvedValue(settings({ force_https_redirect: true }))
    vi.mocked(securityApi.getSearchEngineIndexing).mockResolvedValue(false)
    vi.mocked(securityApi.updateSearchEngineIndexing).mockResolvedValue(undefined)
    vi.mocked(sslCertificatesApi.getDetectedCertificate).mockResolvedValue(VALID_CERTIFICATE)
  })

  it('opens the shared-domain modal after the legacy overlay, with the legacy transition, and keeps it open on an overlay click', async () => {
    const wrapper = await mountView()
    await httpsSwitch(wrapper).trigger('click')
    await flushPromises()

    const open = wrapper.findAllComponents({ name: 'VDialog' }).filter(dialog => dialog.props('modelValue') === true)
    expect(open).toHaveLength(1)
    expect(open[0]!.props('persistent')).toBe(true)
    expect(open[0]!.props('transition')).toBe('custom-dialog-transition')

    await clickOverlay(expectOverlayBeforeCard('.basic-modal'))

    expect(openDialogs(wrapper)).toBe(1)
    expect(securityApi.updateSslSettings).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
