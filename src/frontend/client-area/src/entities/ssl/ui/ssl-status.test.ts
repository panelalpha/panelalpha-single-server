import { describe, expect, it } from 'vitest'
import {
  sslCompactTooltipKey,
  sslIconState,
  sslOrderStatusTextKey,
  sslTextState,
  sslTooltipAlert,
  sslTooltipKey,
  sslTooltipList,
} from './ssl-status'

const ok = { certificate_installed: true, certificate: { self_signed: false, name_match: true, issuer_name: 'Let\'s Encrypt' } }
const selfSigned = { certificate_installed: true, certificate: { self_signed: true, name_match: true, issuer_name: 'x' } }
const mismatch = { certificate_installed: true, certificate: { self_signed: false, name_match: false, issuer_name: 'CA' } }
const none = { certificate_installed: false, certificate: null }

describe('ssl-status certificate mapping', () => {
  it('maps every certificate branch to icon and colour', () => {
    expect(sslIconState(ok)).toEqual({ icon: '$lock', color: 'success' })
    expect(sslIconState(selfSigned)).toEqual({ icon: '$lock', color: 'error' })
    expect(sslIconState(mismatch)).toEqual({ icon: '$lock', color: 'error' })
    expect(sslIconState(none)).toEqual({ icon: '$unlock', color: 'error' })
    expect(sslIconState(undefined)).toEqual({ icon: '$unlock', color: 'error' })
  })

  const cases: Array<[string, string, string, 'success' | 'error']> = [
    ['trusted', 'secure', '$lock', 'success'],
    ['self_signed', 'selfSigned', '$lock', 'error'],
    ['untrusted_issuer', 'sslUntrustedIssuer', '$lock', 'error'],
    ['expired', 'sslExpired', '$lock', 'error'],
    ['not_yet_valid', 'sslNotYetValid', '$lock', 'error'],
    ['domain_mismatch', 'sslNotMatched', '$lock', 'error'],
    ['unreadable', 'sslUnreadable', '$lock', 'error'],
  ]
  it.each(cases)('verdict %s: tooltip %s, icon %s, colour %s', (status, suffix, icon, color) => {
    const ssl = { certificate_installed: true, certificate: { status, issuer_name: 'CA' } }
    expect(sslTooltipKey(ssl)).toBe(`tooltip.dnsIndicator.${suffix}`)
    expect(sslIconState(ssl)).toEqual({ icon, color })
    expect(sslTextState(ssl).color).toBe(color)
  })

  it('maps every certificate branch to the tooltip key', () => {
    expect(sslTooltipKey(selfSigned)).toBe('tooltip.dnsIndicator.selfSigned')
    expect(sslTooltipKey(ok)).toBe('tooltip.dnsIndicator.secure')
    expect(sslTooltipKey(mismatch)).toBe('tooltip.dnsIndicator.sslNotMatched')
    expect(sslTooltipKey(none)).toBe('tooltip.instance.ssl.enabled')
    expect(sslTooltipKey({ certificate_installed: true, certificate: null })).toBe('tooltip.instance.ssl.enabled')
    expect(sslTooltipKey({ certificate_installed: true, certificate: { status: 'expired' } })).toBe('tooltip.dnsIndicator.sslExpired')
  })

  it('shows a red lock with the issuer for an untrusted issuer and the self-signed label for self_signed', () => {
    const untrusted = { certificate_installed: true, certificate: { status: 'untrusted_issuer', issuer_name: 'Odd CA' } }
    expect(sslTextState(untrusted)).toEqual({ icon: '$lock', color: 'error', text: { kind: 'issuer', value: 'Odd CA' } })
    const self = { certificate_installed: true, certificate: { status: 'self_signed', self_signed: true, issuer_name: 'x' } }
    expect(sslTextState(self).text).toEqual({ kind: 'key', value: 'general.sslProvider.selfSigned' })
  })

  it('maps every certificate branch to the text mode', () => {
    expect(sslTextState(ok)).toEqual({ icon: '$lock', color: 'success', text: { kind: 'issuer', value: 'Let\'s Encrypt' } })
    expect(sslTextState(mismatch)).toEqual({ icon: '$lock', color: 'error', text: { kind: 'issuer', value: 'CA' } })
    expect(sslTextState(selfSigned)).toEqual({ icon: '$lock', color: 'error', text: { kind: 'key', value: 'general.sslProvider.selfSigned' } })
    expect(sslTextState(none)).toEqual({ icon: '$unlock', color: 'error', text: { kind: 'key', value: 'message.status.disabled' } })
  })
})

describe('ssl-status order status mapping', () => {
  it('maps the status text for both appearances', () => {
    expect(sslOrderStatusTextKey('failed', 'legacy')).toBe('message.status.failed')
    expect(sslOrderStatusTextKey('failed')).toBe('message.status.failed')
    expect(sslOrderStatusTextKey('awaiting_dns_propagation', 'legacy')).toBe('message.status.dns.awaitingDnsPropagation')
    expect(sslOrderStatusTextKey('awaiting_dns_propagation', 'compact')).toBe('message.status.inProgress')
    expect(sslOrderStatusTextKey('pending', 'legacy')).toBe('message.status.inProgress')
    expect(sslOrderStatusTextKey('in_progress', 'compact')).toBe('message.status.inProgress')
    expect(sslOrderStatusTextKey('weird')).toBe('message.status.unknown')
    expect(sslOrderStatusTextKey(undefined, 'legacy')).toBe('message.status.unknown')
  })

  it('maps the compact tooltip key', () => {
    expect(sslCompactTooltipKey('failed')).toBe('tooltip.hosting.dns.status.failed')
    expect(sslCompactTooltipKey('awaiting_dns_propagation')).toBe('tooltip.hosting.dns.status.pending.alert')
    expect(sslCompactTooltipKey('pending')).toBe('tooltip.hosting.dns.status.pending.alert')
  })

  it('maps the legacy tooltip alert per status', () => {
    expect(sslTooltipAlert('failed')).toEqual({ type: 'error', key: 'tooltip.hosting.dns.status.failed' })
    expect(sslTooltipAlert('awaiting_dns_propagation')).toEqual({ type: 'warning', key: 'tooltip.hosting.dns.status.awaiting' })
    expect(sslTooltipAlert('pending')).toEqual({ type: 'warning', key: 'tooltip.hosting.dns.status.pending.alert' })
    expect(sslTooltipAlert('in_progress')?.type).toBe('warning')
    expect(sslTooltipAlert('other')).toBeNull()
  })

  it('bolds list.second in both lists (app-lite)', () => {
    expect(sslTooltipList('awaiting_dns_propagation')?.map(item => item.bold)).toEqual([false, true, false])
    expect(sslTooltipList('pending')?.map(item => item.bold)).toEqual([false, true, false])
    expect(sslTooltipList('in_progress')?.map(item => item.bold)).toEqual([false, true, false])
    expect(sslTooltipList('failed')).toBeNull()
    expect(sslTooltipList(undefined)).toBeNull()
  })
})

describe('ssl-status points_here (the domain points to another server)', () => {
  const trusted = { certificate_installed: true, certificate: { status: 'trusted', self_signed: false, name_match: true, issuer_name: 'Let\'s Encrypt' } }
  const selfSignedOff = { certificate_installed: true, certificate: { self_signed: true, name_match: true, issuer_name: 'x' } }
  const wrongDns = { kind: 'key', value: 'message.status.wrongDns' }

  it('shows the warning unlock in icon mode, for trusted and self-signed certificates', () => {
    const off = { ...trusted, certificate: { ...trusted.certificate, points_here: false } }
    expect(sslIconState(off)).toEqual({ icon: '$unlock', color: 'warning' })
    expect(sslIconState({ ...selfSignedOff, certificate: { ...selfSignedOff.certificate, points_here: false } })).toEqual({ icon: '$unlock', color: 'warning' })
  })

  it('shows Wrong DNS in text mode, and the neutral state wins over self-signed and trusted', () => {
    const off = { ...trusted, certificate: { ...trusted.certificate, points_here: false } }
    expect(sslTextState(off)).toEqual({ icon: '$unlock', color: 'warning', text: wrongDns })
    expect(sslTextState({ ...selfSignedOff, certificate: { ...selfSignedOff.certificate, points_here: false } })).toEqual({ icon: '$unlock', color: 'warning', text: wrongDns })
  })

  it('reads the DNS tooltip', () => {
    const off = { ...trusted, certificate: { ...trusted.certificate, points_here: false } }
    expect(sslTooltipKey(off)).toBe('tooltip.dnsIndicator.sslPointsElsewhere')
    expect(sslTooltipKey({ ...selfSignedOff, certificate: { ...selfSignedOff.certificate, points_here: false } })).toBe('tooltip.dnsIndicator.sslPointsElsewhere')
  })

  it('keeps the output for true, null and a missing field', () => {
    for (const points of [true, null, undefined]) {
      const ssl = { ...trusted, certificate: { ...trusted.certificate, points_here: points } }
      expect(sslIconState(ssl)).toEqual({ icon: '$lock', color: 'success' })
      expect(sslTextState(ssl)).toEqual({ icon: '$lock', color: 'success', text: { kind: 'issuer', value: 'Let\'s Encrypt' } })
      expect(sslTooltipKey(ssl)).toBe('tooltip.dnsIndicator.secure')
    }
  })

  it('keeps the disabled state when no certificate is installed', () => {
    const notInstalled = { certificate_installed: false, certificate: { status: 'trusted', points_here: false } }
    expect(sslIconState(notInstalled)).toEqual({ icon: '$unlock', color: 'error' })
    expect(sslTextState(notInstalled)).toEqual({ icon: '$unlock', color: 'error', text: { kind: 'key', value: 'message.status.disabled' } })
    expect(sslTooltipKey(notInstalled)).toBe('tooltip.instance.ssl.enabled')
  })
})
