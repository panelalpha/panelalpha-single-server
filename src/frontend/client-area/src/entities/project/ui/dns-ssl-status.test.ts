import { describe, expect, it } from 'vitest'
import {
  dnsSslIcon,
  dnsSslMenu,
  dnsSslView,
  instanceAgeHours,
  needsDetectedCertificate,
  sslInfo,
} from './dns-ssl-status'

const NOW = Date.parse('2026-10-05T12:00:00.000Z')
const unix = (ms: number) => Math.floor(ms / 1000)
const goodCert = { not_before: '2026-01-01', self_signed: false, name_match: true }
const installed = sslInfo({ detected_ssl_cert: goodCert })

describe('sslInfo', () => {
  it('needs a certificate with not_before to count as installed', () => {
    expect(sslInfo(null)).toEqual({ certificate_installed: false, certificate: null })
    expect(sslInfo({ detected_ssl_cert: null }).certificate_installed).toBe(false)
    expect(sslInfo({ detected_ssl_cert: { name_match: true } }).certificate_installed).toBe(false)
    expect(sslInfo({ detected_ssl_cert: goodCert })).toEqual({ certificate_installed: true, certificate: goodCert })
  })
})

describe('dnsSslIcon', () => {
  const base = { resolvedCorrectly: true, dnsAlertsEnabled: true, ssl: installed }

  it('is the grey ok circle when DNS does not resolve and alerts are off', () => {
    expect(dnsSslIcon({ ...base, resolvedCorrectly: false, dnsAlertsEnabled: false })).toEqual({ type: 'okcircle', color: 'gray' })
  })

  it('is the warning alert circle when DNS does not resolve and alerts are on', () => {
    expect(dnsSslIcon({ ...base, resolvedCorrectly: false })).toEqual({ type: 'alertcircle', color: 'warning' })
  })

  it('is an error unlock without a certificate', () => {
    expect(dnsSslIcon({ ...base, ssl: sslInfo(null) })).toEqual({ type: 'unlock', color: 'error' })
  })

  it('is an error lock for a self-signed certificate', () => {
    const ssl = sslInfo({ detected_ssl_cert: { ...goodCert, self_signed: true } })
    expect(dnsSslIcon({ ...base, ssl })).toEqual({ type: 'lock', color: 'error' })
  })

  it('is an error unlock when the name does not match', () => {
    const ssl = sslInfo({ detected_ssl_cert: { ...goodCert, name_match: false } })
    expect(dnsSslIcon({ ...base, ssl })).toEqual({ type: 'unlock', color: 'error' })
  })

  it.each([null, undefined])('is an error lock for an installed flag with certificate %s', certificate => {
    // No certificate to validate, so not valid; no domain_mismatch verdict, so a lock
    const ssl = { certificate_installed: true, certificate: certificate as null }
    expect(dnsSslIcon({ ...base, ssl })).toEqual({ type: 'lock', color: 'error' })
    expect(dnsSslMenu({ loading: false, resolvedCorrectly: true, dnsAlertsEnabled: true, ssl, sslOrderStatus: 'none' }))
      .toEqual({ kind: 'ssl', textKey: 'tooltip.dnsIndicator.sslNotMatched' })
  })

  it('is a success lock for a valid certificate', () => {
    expect(dnsSslIcon(base)).toEqual({ type: 'lock', color: 'success' })
  })

  it.each([
    ['trusted', 'lock', 'success'],
    ['self_signed', 'lock', 'error'],
    ['untrusted_issuer', 'lock', 'error'],
    ['expired', 'lock', 'error'],
    ['not_yet_valid', 'lock', 'error'],
    ['unreadable', 'lock', 'error'],
    ['something_new', 'lock', 'error'],
    ['domain_mismatch', 'unlock', 'error'],
  ])('follows the verdict %s: %s, %s', (status, type, color) => {
    const ssl = sslInfo({ detected_ssl_cert: { ...goodCert, status } })
    expect(dnsSslIcon({ ...base, ssl })).toEqual({ type, color })
  })

  it('lets the verdict win over the old flags', () => {
    const ssl = sslInfo({ detected_ssl_cert: { ...goodCert, status: 'trusted', self_signed: true, name_match: false } })
    expect(dnsSslIcon({ ...base, ssl })).toEqual({ type: 'lock', color: 'success' })
  })
})

describe('needsDetectedCertificate', () => {
  const details = (checkedAgoMinutes: number) => ({ detected_ssl_cert_checked_time: unix(NOW - checkedAgoMinutes * 60_000) })
  const created = (ageHours: number) => new Date(NOW - ageHours * 3_600_000).toISOString()

  it('never fetches without domain_ssl_details', () => {
    expect(needsDetectedCertificate(null, created(0.5), NOW)).toBe(false)
  })

  it('always fetches for an instance younger than an hour', () => {
    expect(needsDetectedCertificate(details(0), created(0.5), NOW)).toBe(true)
  })

  it('caches for 5 minutes while the instance is younger than a day', () => {
    expect(needsDetectedCertificate(details(4), created(5), NOW)).toBe(false)
    expect(needsDetectedCertificate(details(6), created(5), NOW)).toBe(true)
  })

  it('caches for 2880 minutes for an older instance', () => {
    expect(needsDetectedCertificate(details(2000), created(48), NOW)).toBe(false)
    expect(needsDetectedCertificate(details(2881), created(48), NOW)).toBe(true)
    expect(needsDetectedCertificate(details(1), created(24), NOW)).toBe(false)
  })

  it('treats a missing checked time as expired', () => {
    expect(needsDetectedCertificate({}, created(48), NOW)).toBe(true)
    expect(needsDetectedCertificate(undefined, created(48), NOW)).toBe(true)
  })

  it('computes the instance age in hours', () => {
    expect(instanceAgeHours(created(2), NOW)).toBeCloseTo(2)
  })
})

describe('dnsSslMenu', () => {
  const state = { loading: false, resolvedCorrectly: true, dnsAlertsEnabled: true, ssl: installed, sslOrderStatus: 'none' }
  const unresolved = { ...state, resolvedCorrectly: false }

  it('shows the SSL order first, with the warning for a pending order and the error for a failed one', () => {
    const noCert = { ...state, ssl: sslInfo(null) }
    expect(dnsSslMenu({ ...noCert, sslOrderStatus: 'pending' })).toEqual({
      kind: 'ssl-order',
      textKey: 'tooltip.hosting.dns.status.pending.alert',
      color: 'warning',
    })
    expect(dnsSslMenu({ ...noCert, sslOrderStatus: 'failed' })).toEqual({
      kind: 'ssl-order',
      textKey: 'tooltip.hosting.dns.status.failed',
      color: 'error',
    })
  })

  it('offers the alert with its buttons while DNS does not resolve and alerts are on', () => {
    expect(dnsSslMenu(unresolved)).toEqual({ kind: 'dns-alert' })
  })

  it('shows alerts ignored while DNS does not resolve and alerts are off', () => {
    expect(dnsSslMenu({ ...unresolved, dnsAlertsEnabled: false })).toEqual({ kind: 'dns-ignored' })
  })

  it('shows the SSL text once DNS resolves, one key per certificate branch', () => {
    expect(dnsSslMenu({ ...state, loading: true })).toEqual({ kind: 'ssl', textKey: 'tooltip.dnsIndicator.fetching' })
    expect(dnsSslMenu({ ...state, ssl: sslInfo(null) })).toEqual({ kind: 'ssl', textKey: 'tooltip.dnsIndicator.notSsl' })
    const selfSigned = sslInfo({ detected_ssl_cert: { ...goodCert, self_signed: true } })
    expect(dnsSslMenu({ ...state, ssl: selfSigned })).toEqual({ kind: 'ssl', textKey: 'tooltip.dnsIndicator.selfSigned' })
    const mismatch = sslInfo({ detected_ssl_cert: { ...goodCert, name_match: false } })
    expect(dnsSslMenu({ ...state, ssl: mismatch })).toEqual({ kind: 'ssl', textKey: 'tooltip.dnsIndicator.sslNotMatched' })
    expect(dnsSslMenu(state)).toEqual({ kind: 'ssl', textKey: 'tooltip.dnsIndicator.secure' })
  })

  it.each([
    ['trusted', 'secure'],
    ['self_signed', 'selfSigned'],
    ['untrusted_issuer', 'sslUntrustedIssuer'],
    ['expired', 'sslExpired'],
    ['not_yet_valid', 'sslNotYetValid'],
    ['domain_mismatch', 'sslNotMatched'],
    ['unreadable', 'sslUnreadable'],
    ['something_new', 'sslNotMatched'],
  ])('shows the key of the verdict %s', (status, key) => {
    const ssl = sslInfo({ detected_ssl_cert: { ...goodCert, status } })
    expect(dnsSslMenu({ ...state, ssl })).toEqual({ kind: 'ssl', textKey: `tooltip.dnsIndicator.${key}` })
  })
})

describe('dnsSslView', () => {
  const state = { loading: false, resolvedCorrectly: true, dnsAlertsEnabled: true, ssl: installed, sslOrderStatus: 'none' }

  it('is the loader while loading', () => {
    expect(dnsSslView({ ...state, loading: true })).toEqual({ kind: 'loader' })
  })

  it('is the icon once loaded', () => {
    expect(dnsSslView(state)).toEqual({ kind: 'icon', icon: { type: 'lock', color: 'success' } })
  })

  it('shows the lite SSL order before the icon', () => {
    const noCert = { ...state, ssl: sslInfo(null) }
    expect(dnsSslView({ ...noCert, sslOrderStatus: 'in_progress' })).toEqual({ kind: 'ssl-order-progress' })
    expect(dnsSslView({ ...noCert, sslOrderStatus: 'failed' })).toEqual({ kind: 'ssl-order-failed' })
  })

  it('shows the pending order over an expired certificate, but not behind a trusted one', () => {
    const expired = sslInfo({ detected_ssl_cert: { ...goodCert, status: 'expired' } })
    const trusted = sslInfo({ detected_ssl_cert: { ...goodCert, status: 'trusted' } })
    expect(dnsSslView({ ...state, ssl: expired, sslOrderStatus: 'pending' })).toEqual({ kind: 'ssl-order-progress' })
    expect(dnsSslView({ ...state, ssl: trusted, sslOrderStatus: 'pending' })).toEqual({
      kind: 'icon',
      icon: { type: 'lock', color: 'success' },
    })
  })
})

describe('points_here (the domain points to another server)', () => {
  const elsewhere = sslInfo({ detected_ssl_cert: { ...goodCert, points_here: false } })
  const state = { loading: false, resolvedCorrectly: true, dnsAlertsEnabled: true, ssl: elsewhere, sslOrderStatus: 'none' }

  it('is the warning unlock for a trusted certificate that points elsewhere', () => {
    expect(dnsSslIcon({ resolvedCorrectly: true, dnsAlertsEnabled: true, ssl: elsewhere })).toEqual({ type: 'unlock', color: 'warning' })
  })

  it('keeps the green lock when points_here is null', () => {
    const ssl = sslInfo({ detected_ssl_cert: { ...goodCert, points_here: null } })
    expect(dnsSslIcon({ resolvedCorrectly: true, dnsAlertsEnabled: true, ssl })).toEqual({ type: 'lock', color: 'success' })
  })

  it('lets the unresolved DNS warning win over points_here', () => {
    expect(dnsSslIcon({ resolvedCorrectly: false, dnsAlertsEnabled: true, ssl: elsewhere })).toEqual({ type: 'alertcircle', color: 'warning' })
  })

  it('keeps the missing certificate as an error unlock, not the DNS warning', () => {
    expect(dnsSslIcon({ resolvedCorrectly: true, dnsAlertsEnabled: true, ssl: sslInfo(null) })).toEqual({ type: 'unlock', color: 'error' })
  })

  it('shows the DNS description in the menu', () => {
    expect(dnsSslMenu(state)).toEqual({ kind: 'ssl', textKey: 'tooltip.dnsIndicator.sslPointsElsewhere' })
  })

  it('hides a pending order behind a trusted certificate that points elsewhere, as before', () => {
    expect(dnsSslView({ ...state, sslOrderStatus: 'pending' })).toEqual({
      kind: 'icon',
      icon: { type: 'unlock', color: 'warning' },
    })
  })

  it('shows a pending order over an expired certificate that points elsewhere', () => {
    const expired = sslInfo({ detected_ssl_cert: { ...goodCert, status: 'expired', points_here: false } })
    expect(dnsSslView({ ...state, ssl: expired, sslOrderStatus: 'pending' })).toEqual({ kind: 'ssl-order-progress' })
  })
})
