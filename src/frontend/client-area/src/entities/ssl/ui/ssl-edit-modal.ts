// Pure logic of the `SslEditModal` (no Vue, no store).

import type { SslCertificate, SslInfo, SslOrderStatus } from './ssl-status'
import type { ModalSelectOption } from '@/shared/ui/modal/basic-modal.types'
import type { SslOffer } from '@/entities/ssl/ssl-certificates.api'
import { isSslOrderBlocking } from '@/entities/ssl/ssl-order-status'

/** The provider value of the "custom certificate" option (the offers use their `id`). */
export const CUSTOM_PROVIDER = 'custom'

export type SslProvider = number | string

/** The select items: one per offer (`offer.name` → `offer.id`) and the custom option last. */
export function providerOptions (offers: SslOffer[], customLabel: string): ModalSelectOption[] {
  return [
    ...offers.map(offer => ({ label: String(offer.name ?? ''), value: offer.id })),
    { label: customLabel, value: CUSTOM_PROVIDER },
  ]
}

/** The first offer is selected, the custom option when there is none. */
export function defaultProvider (offers: SslOffer[]): SslProvider {
  return offers.length > 0 ? offers[0]!.id : CUSTOM_PROVIDER
}

/** Wp-cloud retries, a custom certificate is installed, an offer is generated. */
export function primaryLabelKey (state: { isWpCloud: boolean, isCustom: boolean }): string {
  if (state.isWpCloud) {
    return 'button.retry.ssl'
  }
  return state.isCustom ? 'button.install' : 'button.generate'
}

export type SslSubmitAction = 'blocked' | 'retry' | 'install' | 'order'

/** Nothing during an order in flight, then wp-cloud, a custom certificate or an offer. */
export function sslSubmitAction (state: { status: SslOrderStatus, isWpCloud: boolean, isCustom: boolean }): SslSubmitAction {
  if (isSslOrderBlocking(state.status)) {
    return 'blocked'
  }
  if (state.isWpCloud) {
    return 'retry'
  }
  return state.isCustom ? 'install' : 'order'
}

/** The certificate is shown as installed, whatever it is. */
export function indicatorSsl (certificate: SslCertificate | null): SslInfo {
  return { certificate_installed: true, certificate }
}

/**
 * The installed (engine) certificate in the modal. Its `points_here` describes our own host, not the domain's A record, so it is
 * dropped here and the row never shows "Wrong DNS". The input is not changed.
 */
export function installedIndicatorSsl (certificate: SslCertificate | null): SslInfo {
  if (!certificate) {
    return indicatorSsl(certificate)
  }
  const { points_here: _pointsHere, ...withoutDns } = certificate
  return indicatorSsl(withoutDns)
}

/** What a screen passes to `SslEditModal.open()`; a certificate that is not passed is fetched. */
export interface SslEditPayload<T = unknown> {
  domain: string
  serverAccountId: number
  sslOrderStatus?: SslOrderStatus
  isWpCloud?: boolean
  sslInstalledCert?: SslCertificate | null
  sslDetectedCert?: SslCertificate | null
  /** Handed back by `ssl-certificate-installed` / `ssl-certificate-ordered`. */
  sourceItem: T
}
