import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as dns from '@/entities/domain/verify-domain-resolving'
import { toInstanceResource } from '@/entities/project/instance-resource'
import * as api from '@/entities/project/instance-ssl.api'
import { mountKit } from '@/test/mount-kit'
import DnsSslIndicator from './DnsSslIndicator.vue'
import PreviewSiteModal from './PreviewSiteModal.vue'

vi.mock('@/entities/domain/verify-domain-resolving', async importOriginal => {
  const actual: typeof dns = await importOriginal()
  return { ...actual, verifyDomainResolving: vi.fn() }
})
vi.mock('@/entities/project/instance-ssl.api', async importOriginal => {
  const actual: typeof api = await importOriginal()
  return { ...actual, getDetectedCertificate: vi.fn() }
})

const NOW = new Date('2026-10-05T12:00:00.000Z')
const unix = (ms: number) => Math.floor(ms / 1000)
const goodCert = { not_before: '2026-01-01', self_signed: false, name_match: true }

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    status: 'active',
    created_at: '2026-08-01T00:00:00.000Z',
    server_account_id: 3,
    host_ip_address: '203.0.113.10',
    host_ipv4_addresses: ['203.0.113.10'],
    dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any' },
    details: { dns_alerts_enabled: true },
    domain_ssl_details: { detected_ssl_cert: null, detected_ssl_cert_checked_time: unix(NOW.getTime() - 60_000), installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 },
    ...overrides,
  }
}

async function mountIndicator (overrides: Partial<RawInstance> = {}, props: { singleServer?: boolean } = {}) {
  const instance = toInstanceResource(raw(overrides))
  // The indicator reads the alerts store (the menu reports a failed alert toggle), so it needs a Pinia.
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(DnsSslIndicator, { props: { instance, ...props }, global: { plugins: [pinia] } })
  await flushPromises()
  return { wrapper, instance }
}

const iconClasses = (wrapper: Awaited<ReturnType<typeof mountIndicator>>['wrapper']) => wrapper.get('.dns-ssl-icon').classes()

describe('DnsSslIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('without host_ip_address makes no request and shows the "not resolved" icon', async () => {
    const { wrapper } = await mountIndicator({ host_ip_address: null })
    expect(api.getDetectedCertificate).not.toHaveBeenCalled()
    expect(dns.verifyDomainResolving).not.toHaveBeenCalled()
    expect(iconClasses(wrapper)).toContain('dns-ssl-icon--warning')
    wrapper.unmount()
  })

  it('without host_ip_address and with DNS alerts off shows the grey ok circle', async () => {
    const { wrapper } = await mountIndicator({ host_ip_address: null, details: { dns_alerts_enabled: false } })
    expect(iconClasses(wrapper)).toContain('dns-ssl-icon--gray')
    wrapper.unmount()
  })

  it('with a fresh valid certificate makes no request and shows the green lock', async () => {
    const { wrapper } = await mountIndicator({
      domain_ssl_details: { detected_ssl_cert: goodCert, detected_ssl_cert_checked_time: unix(NOW.getTime() - 60_000), installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 },
    })
    expect(api.getDetectedCertificate).not.toHaveBeenCalled()
    expect(dns.verifyDomainResolving).not.toHaveBeenCalled()
    expect(iconClasses(wrapper)).toContain('dns-ssl-icon--success')
    wrapper.unmount()
  })

  it('shows the red lock for an expired certificate', async () => {
    const { wrapper } = await mountIndicator({
      domain_ssl_details: { detected_ssl_cert: { ...goodCert, status: 'expired' }, detected_ssl_cert_checked_time: unix(NOW.getTime() - 60_000), installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 },
    })
    expect(iconClasses(wrapper)).toContain('dns-ssl-icon--error')
    expect(iconClasses(wrapper)).not.toContain('dns-ssl-icon--success')
    wrapper.unmount()
  })

  it('refetches a stale certificate for the server account and domain', async () => {
    vi.mocked(api.getDetectedCertificate).mockResolvedValueOnce(goodCert)
    const { wrapper, instance } = await mountIndicator({
      domain_ssl_details: { detected_ssl_cert: null, detected_ssl_cert_checked_time: unix(NOW.getTime() - 3 * 86_400_000), installed_ssl_cert: null, installed_ssl_cert_checked_time: 0 },
    })
    expect(api.getDetectedCertificate).toHaveBeenCalledWith(3, 'acme.example.com')
    expect(instance.domain_ssl_details?.detected_ssl_cert).toEqual(goodCert)
    expect(dns.verifyDomainResolving).not.toHaveBeenCalled()
    expect(iconClasses(wrapper)).toContain('dns-ssl-icon--success')
    wrapper.unmount()
  })

  it('checks DNS when there is no certificate and emits when it does not resolve', async () => {
    vi.mocked(dns.verifyDomainResolving).mockResolvedValueOnce(false)
    const { wrapper, instance } = await mountIndicator()
    expect(dns.verifyDomainResolving).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'acme.example.com',
      ipv4Addresses: ['203.0.113.10'],
      skipARecordVerification: false,
    }))
    expect(instance.getDnsResolveStatus()).toBe(false)
    expect(wrapper.emitted('dns-propagation-in-progress')).toHaveLength(1)
    expect(iconClasses(wrapper)).toContain('dns-ssl-icon--warning')
    wrapper.unmount()
  })

  it('skips the DNS lookup for a *.panelalpha.online site (lite WithoutDNS)', async () => {
    const { wrapper, instance } = await mountIndicator({ url: 'https://site.panelalpha.online', domain: 'site.panelalpha.online' })
    expect(dns.verifyDomainResolving).not.toHaveBeenCalled()
    expect(instance.getDnsResolveStatus()).toBe(true)
    expect(wrapper.emitted('dns-propagation-in-progress')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the red unlock when DNS resolves but there is no certificate', async () => {
    vi.mocked(dns.verifyDomainResolving).mockResolvedValueOnce(true)
    const { wrapper } = await mountIndicator()
    expect(wrapper.emitted('dns-propagation-in-progress')).toBeUndefined()
    expect(iconClasses(wrapper)).toContain('dns-ssl-icon--error')
    wrapper.unmount()
  })

  it('keeps the loader for an instance that is not active (legacy)', async () => {
    const { wrapper } = await mountIndicator({ status: 'suspended' })
    expect(wrapper.find('.dns-ssl-icon').exists()).toBe(false)
    expect(wrapper.find('.loader').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the lite SSL order spinner while an order is pending and DNS resolves', async () => {
    vi.mocked(dns.verifyDomainResolving).mockResolvedValueOnce(true)
    const { wrapper } = await mountIndicator({ ssl_order_status: 'pending' })
    expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
    expect(wrapper.find('.dns-ssl-icon').exists()).toBe(false)
    wrapper.unmount()
  })

  // "Generate URL" closes the Fix DNS dialog. A V4 lazy dialog unmounts its content after it closes, so a preview modal
  // nested in it would disappear with it. The modal lives outside the dialog, mounted while the dialog is closed.
  it('keeps the single-server preview modal outside the lazy Fix DNS dialog', async () => {
    const { wrapper } = await mountIndicator({ host_ip_address: null }, { singleServer: true })
    expect(wrapper.findComponent(PreviewSiteModal).exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not mount the preview modal without single server', async () => {
    const { wrapper } = await mountIndicator({ host_ip_address: null })
    expect(wrapper.findComponent(PreviewSiteModal).exists()).toBe(false)
    wrapper.unmount()
  })
})
