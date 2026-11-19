import { describe, expect, it } from 'vitest'
import {
  isSslOrderBlocking,
  isSslOrderFailed,
  isSslOrderPendingVisible,
  isValidDetectedSslCert,
  isValidSslInfo,
  shouldShowSslOrderStatus,
  SSL_POINTS_ELSEWHERE_KEY,
  sslCertStatus,
  sslCertTextClass,
  sslCertTooltipKey,
  sslKeyOptions,
  sslPointsElsewhere,
} from './ssl-order-status'

const goodCert = { self_signed: false, name_match: true }
const installed = { certificate_installed: true, certificate: goodCert }
const noCert = { certificate_installed: false, certificate: null }

// One truth table for the two copies that lived in `instances/dns-ssl-status.ts` (the kit) and `ssl/ssl-status.ts` (the Domains row).
describe('ssl-order-status', () => {
  it('blocks the SSL button while an order is in flight, not when it failed', () => {
    for (const status of ['pending', 'in_progress', 'awaiting_dns_propagation']) {
      expect(isSslOrderBlocking(status)).toBe(true)
    }
    for (const status of ['failed', 'none', null, undefined]) {
      expect(isSslOrderBlocking(status)).toBe(false)
    }
  })

  it('treats only failed as failed', () => {
    expect(isSslOrderFailed('failed')).toBe(true)
    expect(isSslOrderFailed('pending')).toBe(false)
    expect(isSslOrderFailed(null)).toBe(false)
  })

  it('makes pending and failed visible, and nothing else', () => {
    for (const status of ['pending', 'in_progress', 'awaiting_dns_propagation', 'failed']) {
      expect(isSslOrderPendingVisible(status)).toBe(true)
    }
    for (const status of ['none', null, undefined]) {
      expect(isSslOrderPendingVisible(status)).toBe(false)
    }
  })

  it('accepts only a certificate that is not self-signed and matches the name', () => {
    expect(isValidDetectedSslCert(goodCert)).toBe(true)
    expect(isValidDetectedSslCert({ self_signed: true, name_match: true })).toBe(false)
    expect(isValidDetectedSslCert({ self_signed: false, name_match: false })).toBe(false)
    expect(isValidDetectedSslCert(null)).toBe(false)
    expect(isValidDetectedSslCert(undefined)).toBe(false)
  })

  it('needs an installed certificate for a valid SSL info', () => {
    expect(isValidSslInfo(installed)).toBe(true)
    expect(isValidSslInfo(noCert)).toBe(false)
    expect(isValidSslInfo({ certificate_installed: true, certificate: null })).toBe(false)
    expect(isValidSslInfo(null)).toBe(false)
  })

  describe('shouldShowSslOrderStatus (kit: sslInfo and dnsResolved)', () => {
    const options = { loading: false, dnsResolved: true, sslInfo: noCert }

    it('shows a pending or failed order only once loading is done, DNS resolves and there is no valid certificate', () => {
      expect(shouldShowSslOrderStatus('pending', options)).toBe(true)
      expect(shouldShowSslOrderStatus('awaiting_dns_propagation', options)).toBe(true)
      expect(shouldShowSslOrderStatus('failed', options)).toBe(true)
      expect(shouldShowSslOrderStatus('none', options)).toBe(false)
      expect(shouldShowSslOrderStatus('pending', { ...options, loading: true })).toBe(false)
      expect(shouldShowSslOrderStatus('pending', { ...options, dnsResolved: false })).toBe(false)
      expect(shouldShowSslOrderStatus('pending', { ...options, sslInfo: installed })).toBe(false)
    })
  })

  describe('shouldShowSslOrderStatus (Domains row: certificate)', () => {
    it('shows pending and failed, but not while loading or behind a valid certificate', () => {
      expect(shouldShowSslOrderStatus('pending', { loading: false, certificate: null })).toBe(true)
      expect(shouldShowSslOrderStatus('failed', { loading: false, certificate: { self_signed: true, name_match: true } })).toBe(true)
      expect(shouldShowSslOrderStatus('pending', { loading: true, certificate: null })).toBe(false)
      expect(shouldShowSslOrderStatus('pending', { loading: false, certificate: goodCert })).toBe(false)
      expect(shouldShowSslOrderStatus('none', { loading: false, certificate: null })).toBe(false)
      expect(shouldShowSslOrderStatus(null, { loading: false })).toBe(false)
    })

    it('skips the certificate check when no certificate is passed', () => {
      expect(shouldShowSslOrderStatus('pending', { loading: false, dnsResolved: true })).toBe(true)
    })
  })

  describe('certificate verdict', () => {
    const rows: Array<[string, Parameters<typeof sslCertStatus>[0], string | null, string]> = [
      ['trusted', { status: 'trusted' }, 'trusted', 'secure'],
      ['self_signed', { status: 'self_signed' }, 'self_signed', 'selfSigned'],
      ['untrusted_issuer', { status: 'untrusted_issuer' }, 'untrusted_issuer', 'sslUntrustedIssuer'],
      ['expired', { status: 'expired' }, 'expired', 'sslExpired'],
      ['not_yet_valid', { status: 'not_yet_valid' }, 'not_yet_valid', 'sslNotYetValid'],
      ['domain_mismatch', { status: 'domain_mismatch' }, 'domain_mismatch', 'sslNotMatched'],
      ['unreadable', { status: 'unreadable' }, 'unreadable', 'sslUnreadable'],
      ['unknown string', { status: 'revoked' }, 'revoked', 'sslNotMatched'],
      ['non-string status, self-signed fallback', { status: 5 as unknown as string, self_signed: true, name_match: true }, 'self_signed', 'selfSigned'],
      ['no status, name mismatch fallback', { self_signed: false, name_match: false }, 'domain_mismatch', 'sslNotMatched'],
      ['no status, ok fallback', goodCert, 'trusted', 'secure'],
      ['no certificate', null, null, 'sslNotMatched'],
    ]

    it.each(rows)('%s', (_name, cert, verdict, tooltipKey) => {
      expect(sslCertStatus(cert)).toBe(verdict)
      expect(isValidDetectedSslCert(cert)).toBe(verdict === 'trusted')
      expect(sslCertTextClass(cert)).toBe(verdict === 'trusted' ? 'text-success' : 'text-error')
      expect(sslCertTooltipKey(cert)).toBe(tooltipKey)
    })

    it('lets status win over the flags', () => {
      expect(isValidDetectedSslCert({ status: 'expired', self_signed: false, name_match: true })).toBe(false)
      expect(isValidDetectedSslCert({ status: 'trusted', name_match: false })).toBe(true)
    })

    it('does not hide the pending order behind an expired certificate', () => {
      const expiredCert = { status: 'expired', self_signed: false, name_match: true }
      expect(shouldShowSslOrderStatus('pending', { certificate: expiredCert })).toBe(true)
      expect(isValidSslInfo({ certificate_installed: true, certificate: expiredCert })).toBe(false)
    })
  })
})

describe('points_here (the domain points to another server)', () => {
  const trusted = { status: 'trusted', self_signed: false, name_match: true, issuer_name: 'CA' }

  it('is true only for an explicit false', () => {
    expect(sslPointsElsewhere({ ...trusted, points_here: false })).toBe(true)
    expect(sslPointsElsewhere({ ...trusted, points_here: true })).toBe(false)
    expect(sslPointsElsewhere({ ...trusted, points_here: null })).toBe(false)
    expect(sslPointsElsewhere(trusted)).toBe(false)
    expect(sslPointsElsewhere(null)).toBe(false)
    expect(sslPointsElsewhere(undefined)).toBe(false)
  })

  it('gives the warning class for a trusted certificate that points elsewhere', () => {
    expect(sslCertTextClass({ ...trusted, points_here: false })).toBe('text-warning')
  })

  it('keeps the class for true, null and a missing field', () => {
    expect(sslCertTextClass({ ...trusted, points_here: true })).toBe('text-success')
    expect(sslCertTextClass({ ...trusted, points_here: null })).toBe('text-success')
    expect(sslCertTextClass(trusted)).toBe('text-success')
    expect(sslCertTextClass({ status: 'expired', points_here: true })).toBe('text-error')
    expect(sslCertTextClass(null)).toBe('text-error')
  })

  it('keeps the pending-order rule: a trusted certificate still hides the order when it points elsewhere', () => {
    expect(isValidDetectedSslCert({ ...trusted, points_here: false })).toBe(true)
    expect(shouldShowSslOrderStatus('pending', { certificate: { ...trusted, points_here: false } })).toBe(false)
  })
})

describe('sslKeyOptions', () => {
  it('gives a default text only for the points-elsewhere key', () => {
    expect(sslKeyOptions(SSL_POINTS_ELSEWHERE_KEY).defaultValue).toContain('does not point to')
    expect(sslKeyOptions('tooltip.dnsIndicator.secure')).toEqual({})
  })
})
