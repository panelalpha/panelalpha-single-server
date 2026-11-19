// Pure mapping from the SSL payloads to icon, colour and copy keys (no Vue, no store).

import { isSslOrderFailed, isValidDetectedSslCert, SSL_POINTS_ELSEWHERE_KEY, type SslCertStatusValue, sslCertTooltipKey, sslPointsElsewhere, type SslPointsHere } from '@/entities/ssl/ssl-order-status'

export interface SslCertificate {
  status?: SslCertStatusValue
  self_signed?: boolean
  name_match?: boolean
  issuer_name?: string
  points_here?: SslPointsHere
}

export interface SslInfo {
  certificate_installed: boolean
  certificate?: SslCertificate | null
}

export type SslIconName = '$lock' | '$unlock'
export type SslColor = 'success' | 'error' | 'warning'

export interface SslIconState {
  icon: SslIconName
  color: SslColor
}

export interface SslTextState extends SslIconState {
  // Issuer name (certificate installed, not self-signed) or an i18n key.
  text: { kind: 'issuer', value: string | undefined } | { kind: 'key', value: string }
}

export type SslOrderStatus = 'failed' | 'awaiting_dns_propagation' | 'pending' | 'in_progress' | (string & {}) | null | undefined
export type PendingSslAppearance = 'legacy' | 'compact'

// The `domain` prop of PendingSslIndicator and PendingSslTooltip (legacy `domain: Object`).
export interface PendingSslDomain {
  domain?: string
  ssl_order_status?: SslOrderStatus
}

// The lock is green only for a trusted certificate (the Engine's verdict, `isValidDetectedSslCert`).
// A certificate from a server the domain does not point to (`points_here === false`) shows the warning unlock instead.
export function sslIconState (ssl: SslInfo | null | undefined): SslIconState {
  if (!ssl?.certificate_installed) {
    return { icon: '$unlock', color: 'error' }
  }
  if (sslPointsElsewhere(ssl.certificate)) {
    return { icon: '$unlock', color: 'warning' }
  }
  return { icon: '$lock', color: isValidDetectedSslCert(ssl.certificate) ? 'success' : 'error' }
}

// An installed certificate reads its verdict tooltip, otherwise (also with a null certificate) `enabled`.
export function sslTooltipKey (ssl: SslInfo | null | undefined): string {
  const certificate = ssl?.certificate
  if (ssl?.certificate_installed && certificate) {
    if (sslPointsElsewhere(certificate)) {
      return SSL_POINTS_ELSEWHERE_KEY
    }
    return `tooltip.dnsIndicator.${sslCertTooltipKey(certificate)}`
  }
  return 'tooltip.instance.ssl.enabled'
}

// Text mode (issuer name, self-signed label or disabled); the issuer colour follows the verdict.
export function sslTextState (ssl: SslInfo | null | undefined): SslTextState {
  const certificate = ssl?.certificate
  if (!ssl?.certificate_installed) {
    return { icon: '$unlock', color: 'error', text: { kind: 'key', value: 'message.status.disabled' } }
  }
  // The DNS verdict explains the whole row, so it comes before the self-signed label and the trusted lock.
  if (sslPointsElsewhere(certificate)) {
    return { icon: '$unlock', color: 'warning', text: { kind: 'key', value: 'message.status.wrongDns' } }
  }
  if (certificate?.self_signed) {
    return { icon: '$lock', color: 'error', text: { kind: 'key', value: 'general.sslProvider.selfSigned' } }
  }
  return {
    icon: '$lock',
    color: isValidDetectedSslCert(certificate) ? 'success' : 'error',
    text: { kind: 'issuer', value: certificate?.issuer_name },
  }
}

export function isSslOrderPending (status: SslOrderStatus): boolean {
  return status === 'pending' || status === 'in_progress'
}

// `awaiting_dns_propagation` reads
// "awaiting DNS propagation" in the legacy appearance and "in progress" in the compact one.
export function sslOrderStatusTextKey (status: SslOrderStatus, appearance: PendingSslAppearance = 'compact'): string {
  switch (status) {
    case 'failed': {
      return 'message.status.failed'
    }
    case 'awaiting_dns_propagation': {
      return appearance === 'legacy' ? 'message.status.dns.awaitingDnsPropagation' : 'message.status.inProgress'
    }
    case 'pending':
    case 'in_progress': {
      return 'message.status.inProgress'
    }
    default: {
      return 'message.status.unknown'
    }
  }
}

// The compact tooltip is one line, failed or "pending alert" for every other status.
export function sslCompactTooltipKey (status: SslOrderStatus): string {
  return isSslOrderFailed(status)
    ? 'tooltip.hosting.dns.status.failed'
    : 'tooltip.hosting.dns.status.pending.alert'
}

export type PendingTooltipAlert = 'error' | 'warning'

// Alert block per status (none for an unknown status).
export function sslTooltipAlert (status: SslOrderStatus): { type: PendingTooltipAlert, key: string } | null {
  if (isSslOrderFailed(status)) {
    return { type: 'error', key: 'tooltip.hosting.dns.status.failed' }
  }
  if (status === 'awaiting_dns_propagation') {
    return { type: 'warning', key: 'tooltip.hosting.dns.status.awaiting' }
  }
  if (isSslOrderPending(status)) {
    return { type: 'warning', key: 'tooltip.hosting.dns.status.pending.alert' }
  }
  return null
}

export interface PendingTooltipListItem {
  key: string
  bold: boolean
}

// Both lists bold `list.second` (app leaves the pending list plain; lite wins).
export function sslTooltipList (status: SslOrderStatus): PendingTooltipListItem[] | null {
  if (status !== 'awaiting_dns_propagation' && !isSslOrderPending(status)) {
    return null
  }
  return [
    { key: 'tooltip.hosting.dns.status.pending.list.first', bold: false },
    { key: 'tooltip.hosting.dns.status.pending.list.second', bold: true },
    { key: 'tooltip.hosting.dns.status.pending.list.third', bold: false },
  ]
}
