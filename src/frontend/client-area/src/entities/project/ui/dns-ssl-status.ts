// The decisions of the DNS and SSL indicator (icon state, certificate refresh, SSL order status) as pure functions,
// so the component only wires requests to them. The icon and the menu text follow the certificate verdict as in app-lite.

import type { SslCertStatusValue, SslPointsHere } from '@/entities/ssl/ssl-order-status'
import { isSslOrderFailed, isValidDetectedSslCert, shouldShowSslOrderStatus, SSL_POINTS_ELSEWHERE_KEY, sslCertStatus, sslCertTooltipKey, sslPointsElsewhere } from '@/entities/ssl/ssl-order-status'

export interface DetectedCertificate {
  [key: string]: unknown
  not_before?: string | number
  status?: SslCertStatusValue
  self_signed?: boolean
  name_match?: boolean
  points_here?: SslPointsHere
}

export interface SslDetailsLike {
  detected_ssl_cert?: DetectedCertificate | null
  detected_ssl_cert_checked_time?: number | null
}

export interface SslInfo {
  certificate_installed: boolean
  certificate: DetectedCertificate | null
}

export type DnsSslIconType = 'okcircle' | 'alertcircle' | 'unlock' | 'lock'
export type DnsSslIconColor = 'gray' | 'warning' | 'error' | 'success'

export interface DnsSslIcon {
  type: DnsSslIconType
  color: DnsSslIconColor
}

/** `ssl` computed: a certificate counts as installed only when it has a `not_before`. */
export function sslInfo (details: SslDetailsLike | null | undefined): SslInfo {
  if (!details || !details.detected_ssl_cert || !details.detected_ssl_cert.not_before) {
    return { certificate_installed: false, certificate: null }
  }
  return { certificate_installed: true, certificate: details.detected_ssl_cert }
}

/** `icon` computed. */
export function dnsSslIcon (state: {
  resolvedCorrectly: boolean
  dnsAlertsEnabled: unknown
  ssl: SslInfo
}): DnsSslIcon {
  const { resolvedCorrectly, dnsAlertsEnabled, ssl } = state
  if (!resolvedCorrectly) {
    if (!dnsAlertsEnabled) {
      return { type: 'okcircle', color: 'gray' }
    }
    return { type: 'alertcircle', color: 'warning' }
  }
  if (!ssl.certificate_installed) {
    return { type: 'unlock', color: 'error' }
  }
  if (sslPointsElsewhere(ssl.certificate)) {
    return { type: 'unlock', color: 'warning' }
  }
  if (!isValidDetectedSslCert(ssl.certificate)) {
    return { type: sslCertStatus(ssl.certificate) === 'domain_mismatch' ? 'unlock' : 'lock', color: 'error' }
  }
  return { type: 'lock', color: 'success' }
}

/** `instanceAge`: `moment().diff(moment(created_at)) / 1000 / 3600`, in hours. */
export function instanceAgeHours (createdAt: string | undefined, now: number = Date.now()): number {
  return (now - new Date(createdAt as string).getTime()) / 1000 / 3600
}

/**
 * `refreshSsl`: whether the detected certificate has to be fetched again. Nothing is fetched without `domain_ssl_details`;
 * an instance younger than an hour always refreshes; otherwise the cached certificate lives 5 minutes (instance younger
 * than 24 hours) or 2880 minutes.
 */
export function needsDetectedCertificate (
  details: SslDetailsLike | null | undefined,
  createdAt: string | undefined,
  now: number = Date.now(),
): boolean {
  if (details === null) {
    return false
  }
  const age = instanceAgeHours(createdAt, now)
  if (age < 1) {
    return true
  }
  const certMaxCacheMinutes = age < 24 ? 5 : 2880
  // `moment.unix(checked ?? null)`: a missing checked time is the epoch, so it always expires.
  const detected = (details?.detected_ssl_cert_checked_time ?? 0) * 1000
  return (now - detected) / 1000 / 60 > certMaxCacheMinutes
}

export interface DnsSslState {
  loading: boolean
  resolvedCorrectly: boolean
  dnsAlertsEnabled: unknown
  ssl: SslInfo
  sslOrderStatus: string | null | undefined
}

/** The SSL order is shown before the DNS and SSL states, as in lite; the order check reads the instance's `ssl_order_status`. */
function showsSslOrder (state: DnsSslState): boolean {
  return shouldShowSslOrderStatus(state.sslOrderStatus, {
    loading: state.loading,
    dnsResolved: state.resolvedCorrectly,
    sslInfo: state.ssl,
  })
}

export type DnsSslIndicatorView
  = | { kind: 'ssl-order-progress' }
    | { kind: 'ssl-order-failed' }
    | { kind: 'loader' }
    | { kind: 'icon', icon: DnsSslIcon }

/** The activator the indicator draws: lite shows the SSL order first (a spinner, or a red warning when failed), then the loader, then the icon. */
export function dnsSslView (state: DnsSslState): DnsSslIndicatorView {
  if (showsSslOrder(state)) {
    return isSslOrderFailed(state.sslOrderStatus) ? { kind: 'ssl-order-failed' } : { kind: 'ssl-order-progress' }
  }
  if (state.loading) {
    return { kind: 'loader' }
  }
  return { kind: 'icon', icon: dnsSslIcon(state) }
}

export type DnsSslMenuView
  = | { kind: 'ssl-order', textKey: string, color: 'error' | 'warning' }
    | { kind: 'dns-alert' }
    | { kind: 'dns-ignored' }
    | { kind: 'ssl', textKey: string }

/**
 * The hover menu of the indicator: the SSL order first, then the DNS branch (alert with its
 * buttons, or alerts ignored) while DNS does not resolve, then the SSL text. The SSL order text keeps its `{domain}` placeholder for the
 * component to fill.
 */
export function dnsSslMenu (state: DnsSslState): DnsSslMenuView {
  if (showsSslOrder(state)) {
    const failed = isSslOrderFailed(state.sslOrderStatus)
    return {
      kind: 'ssl-order',
      textKey: failed ? 'tooltip.hosting.dns.status.failed' : 'tooltip.hosting.dns.status.pending.alert',
      color: failed ? 'error' : 'warning',
    }
  }
  if (!state.resolvedCorrectly) {
    return state.dnsAlertsEnabled ? { kind: 'dns-alert' } : { kind: 'dns-ignored' }
  }
  return { kind: 'ssl', textKey: sslTextKey(state) }
}

function sslTextKey (state: DnsSslState): string {
  if (state.loading) {
    return 'tooltip.dnsIndicator.fetching'
  }
  const { ssl } = state
  if (!ssl.certificate_installed) {
    return 'tooltip.dnsIndicator.notSsl'
  }
  if (sslPointsElsewhere(ssl.certificate)) {
    return SSL_POINTS_ELSEWHERE_KEY
  }
  return `tooltip.dnsIndicator.${sslCertTooltipKey(ssl.certificate)}`
}
