// The one copy of the SSL order rules and of the certificate verdict. The instance kit (`DnsSslIndicator`), the Domains row and the
// SSL edit modal read them from here, so the three cannot drift apart. The types are structural, so the module imports nothing.

export type SslCertStatus = 'trusted' | 'self_signed' | 'untrusted_issuer' | 'expired' | 'not_yet_valid' | 'domain_mismatch' | 'unreadable'

// An unknown string passes through as in legacy.
export type SslCertStatusValue = SslCertStatus | (string & {})

// The backend checks the domain's A record. `false`: the domain points to another server, so the certificate read from it is not ours.
export type SslPointsHere = boolean | null

export interface SslCertificateLike {
  // The Engine's verdict.
  status?: SslCertStatusValue
  self_signed?: boolean
  name_match?: boolean
  points_here?: SslPointsHere
}

export interface SslInfoLike {
  certificate_installed: boolean
  certificate?: SslCertificateLike | null
}

const SSL_ORDER_BLOCKING_STATUSES = new Set(['pending', 'in_progress', 'awaiting_dns_propagation'])
const SSL_ORDER_VISIBLE_PENDING_STATUSES = new Set([...SSL_ORDER_BLOCKING_STATUSES, 'failed'])

/** `isSslOrderBlocking`: an order in flight, so the certificate cannot be edited (the SSL button is disabled). */
export function isSslOrderBlocking (status: string | null | undefined): boolean {
  return status != null && SSL_ORDER_BLOCKING_STATUSES.has(status)
}

export function isSslOrderFailed (status: string | null | undefined): boolean {
  return status === 'failed'
}

export function isSslOrderPendingVisible (status: string | null | undefined): boolean {
  return status != null && SSL_ORDER_VISIBLE_PENDING_STATUSES.has(status)
}

/**
 * `sslCertStatus`: the Engine's verdict on a certificate (`status`). An answer without it falls back to the old self-signed / name-match
 * check.
 */
export function sslCertStatus (cert: SslCertificateLike | null | undefined): string | null {
  if (!cert || typeof cert !== 'object') {
    return null
  }
  if (typeof cert.status === 'string') {
    return cert.status
  }
  if (cert.self_signed) {
    return 'self_signed'
  }
  return cert.name_match === true ? 'trusted' : 'domain_mismatch'
}

export function isValidDetectedSslCert (cert: SslCertificateLike | null | undefined): boolean {
  return sslCertStatus(cert) === 'trusted'
}

/**
 * The detected certificate comes from a server the domain does not point to (`points_here === false`). Null, true or a missing field
 * do not count: they keep the verdict of the certificate.
 */
export function sslPointsElsewhere (cert: SslCertificateLike | null | undefined): boolean {
  return cert?.points_here === false
}

// Not in the backend translations yet, so the text comes from `defaultValue` until it is added there.
export const SSL_POINTS_ELSEWHERE_KEY = 'tooltip.dnsIndicator.sslPointsElsewhere'
export const SSL_POINTS_ELSEWHERE_DEFAULT = 'This certificate comes from a server the domain does not point to. Check the A record of the domain. A domain behind a proxy such as Cloudflare can show this too.'

/** The `defaultValue` option for `t(key)`: only the key above has one. */
export function sslKeyOptions (key: string): { defaultValue?: string } {
  return key === SSL_POINTS_ELSEWHERE_KEY ? { defaultValue: SSL_POINTS_ELSEWHERE_DEFAULT } : {}
}

export type SslCertTextClass = 'text-success' | 'text-error' | 'text-warning'

// `success--text` / `error--text` are `text-success` / `text-error` in V4
export function sslCertTextClass (cert: SslCertificateLike | null | undefined): SslCertTextClass {
  if (!cert) {
    return 'text-error'
  }
  if (sslPointsElsewhere(cert)) {
    return 'text-warning'
  }
  return isValidDetectedSslCert(cert) ? 'text-success' : 'text-error'
}

// `domain_mismatch`, an unknown string and no certificate fall to `sslNotMatched`
const SSL_CERT_TOOLTIP_KEYS = new Map<string, string>([
  ['trusted', 'secure'],
  ['self_signed', 'selfSigned'],
  ['expired', 'sslExpired'],
  ['not_yet_valid', 'sslNotYetValid'],
  ['untrusted_issuer', 'sslUntrustedIssuer'],
  ['unreadable', 'sslUnreadable'],
])

/** The suffix under `tooltip.dnsIndicator.` for a certificate's verdict. */
export function sslCertTooltipKey (cert: SslCertificateLike | null | undefined): string {
  return SSL_CERT_TOOLTIP_KEYS.get(sslCertStatus(cert) ?? '') ?? 'sslNotMatched'
}

export function isValidSslInfo (ssl: SslInfoLike | null | undefined): boolean {
  if (!ssl || !ssl.certificate_installed) {
    return false
  }
  return isValidDetectedSslCert(ssl.certificate)
}

/**
 * `shouldShowSslOrderStatus(status, options)`: the pending or failed indicator replaces the SSL text, but not while the state loads, not
 * when DNS does not resolve and not behind a valid certificate. The instance kit passes `sslInfo` and `dnsResolved`, the Domains row and
 * the SSL modal pass `certificate`; an option that is not passed (`undefined`) skips its check.
 */
export function shouldShowSslOrderStatus (
  status: string | null | undefined,
  options: {
    loading?: boolean
    dnsResolved?: boolean
    sslInfo?: SslInfoLike
    certificate?: SslCertificateLike | null
  },
): boolean {
  if (options.loading) {
    return false
  }
  if (options.dnsResolved === false) {
    return false
  }
  if (options.sslInfo !== undefined && isValidSslInfo(options.sslInfo)) {
    return false
  }
  if (options.certificate !== undefined && isValidDetectedSslCert(options.certificate)) {
    return false
  }
  return isSslOrderPendingVisible(status)
}
