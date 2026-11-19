import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { canShowPreviewSite, checkDnsMismatch } from './dns-propagation'

vi.mock('@/entities/domain/verify-domain-resolving', () => ({ verifyDomainResolving: vi.fn() }))

function instance (overrides: Record<string, unknown> = {}) {
  return {
    domain: 'example.com',
    onboarding_subdomain: null,
    dns_settings: {},
    service_has_dns: false,
    dns_nameservers: [],
    host_c_names: [],
    domain_zone_details: undefined,
    hasIpAddressInUrl: () => false,
    getDnsAlertsEnabled: () => true,
    getDnsIpv4Addresses: () => ['192.0.2.1'],
    setDnsResolveStatus: vi.fn(),
    plan_settings: {},
    cdn_dns_records: [],
    ...overrides,
  } as never
}

describe('checkDnsMismatch', () => {
  beforeEach(() => vi.mocked(verifyDomainResolving).mockReset())

  it('reports a mismatch and stores the status when the domain does not resolve', async () => {
    vi.mocked(verifyDomainResolving).mockResolvedValue(false)
    const item = instance()
    expect(await checkDnsMismatch(item)).toBe(true)
    expect((item as { setDnsResolveStatus: ReturnType<typeof vi.fn> }).setDnsResolveStatus).toHaveBeenCalledWith(false)
  })

  it('reports no mismatch when it resolves', async () => {
    vi.mocked(verifyDomainResolving).mockResolvedValue(true)
    expect(await checkDnsMismatch(instance())).toBe(false)
  })

  it('treats a panelalpha.online host as resolved without a DNS lookup (app-lite, no false chip)', async () => {
    const item = instance({ domain: 'shop.panelalpha.online' })
    expect(await checkDnsMismatch(item)).toBe(false)
    expect((item as { setDnsResolveStatus: ReturnType<typeof vi.fn> }).setDnsResolveStatus).toHaveBeenCalledWith(true)
    expect(verifyDomainResolving).not.toHaveBeenCalled()
  })

  it('checks the URL before the domain for the panelalpha.online host', async () => {
    const item = instance({ url: 'https://blog.panelalpha.online/', domain: 'example.com' })
    expect(await checkDnsMismatch(item)).toBe(false)
    expect(verifyDomainResolving).not.toHaveBeenCalled()
  })

  it('skips the check for an IP in the URL or with DNS alerts off', async () => {
    expect(await checkDnsMismatch(instance({ hasIpAddressInUrl: () => true }))).toBe(false)
    expect(await checkDnsMismatch(instance({ getDnsAlertsEnabled: () => false }))).toBe(false)
    expect(verifyDomainResolving).not.toHaveBeenCalled()
  })

  it('still checks after a save with DNS alerts off (legacy changeDomain has no guard)', async () => {
    vi.mocked(verifyDomainResolving).mockResolvedValue(false)
    expect(await checkDnsMismatch(instance({ getDnsAlertsEnabled: () => false }), { afterSave: true })).toBe(true)
    expect(verifyDomainResolving).toHaveBeenCalledTimes(1)
  })
})

describe('canShowPreviewSite', () => {
  const base = { singleServer: false, hasPrivilege: true, providerEnabled: true, dnsPropagationInProgress: true }

  it('is always on for single server', () => {
    expect(canShowPreviewSite({ ...base, singleServer: true, hasPrivilege: false, dnsPropagationInProgress: false })).toBe(true)
  })

  it('is hidden for a panelalpha.online site', () => {
    expect(canShowPreviewSite({ ...base, singleServer: true, panelAlphaOnline: true })).toBe(false)
  })

  it('needs privilege, provider and DNS propagation on app', () => {
    expect(canShowPreviewSite(base)).toBe(true)
    expect(canShowPreviewSite({ ...base, hasPrivilege: false })).toBe(false)
    expect(canShowPreviewSite({ ...base, providerEnabled: false })).toBe(false)
    expect(canShowPreviewSite({ ...base, dnsPropagationInProgress: false })).toBe(false)
  })
})
