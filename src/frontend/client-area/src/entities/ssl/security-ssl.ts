import type { SslCertificate } from '@/entities/ssl/ssl-certificates.api'
import type { SslInfo, SslOrderStatus } from '@/entities/ssl/ui/ssl-status'
import { shouldShowSslOrderStatus } from '@/entities/ssl/ssl-order-status'

// Pure logic of the SSL block of the instance security card and of the Security screen. Both hosts
// use it: General's `SecurityInfoCard` and the advanced Security view. No Vue, no HTTP; the callers do the requests.

/**
 * `fetchSslInfo`: a certificate the server answers with counts as installed when it has an issuer, and only then is it shown.
 * `null` (no answer) returns `null`, so the caller keeps the status it has.
 */
export function sslInfoFromCertificate (certificate: SslCertificate | null | undefined): SslInfo | null {
  if (!certificate) {
    return null
  }
  return {
    certificate_installed: !!certificate.issuer_name,
    certificate: certificate.issuer_name ? certificate : null,
  }
}

export type SslBlockState = 'loading' | 'pending' | 'indicator'

/** Which of the three SSL states the block shows: the loader, the pending or failed order, or the certificate indicator. */
export function sslBlockState (state: { fetching: boolean, orderStatus: SslOrderStatus, sslInfo: SslInfo }): SslBlockState {
  if (state.fetching) {
    return 'loading'
  }
  if (shouldShowSslOrderStatus(state.orderStatus, { loading: false, sslInfo: state.sslInfo })) {
    return 'pending'
  }
  return 'indicator'
}

/** The event carries the application; only the page's own instance refreshes the block. */
export function isSslInstalledEventFor (payload: Record<string, unknown> | undefined, instanceId: number): boolean {
  return payload !== undefined && payload.id === instanceId
}

/** The order status after the SSL modal reports a result: an installed certificate has no order, an ordered one is pending. */
export function orderStatusAfterSslEvent (event: 'installed' | 'ordered'): 'none' | 'pending' {
  return event === 'installed' ? 'none' : 'pending'
}
