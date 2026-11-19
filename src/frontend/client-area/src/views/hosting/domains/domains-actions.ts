import type { HostingService } from '@/views/hosting/hosting.types'
import type { HostingDomain } from './domains.types'
import type { SslInfo } from '@/entities/ssl/ui/ssl-status'
import { hasPrivilege, HOSTING_PRIVILEGES } from '@/views/hosting/hosting-privileges'
import { isSslOrderBlocking, shouldShowSslOrderStatus, type SslCertTextClass, sslCertTextClass, sslPointsElsewhere } from '@/entities/ssl/ssl-order-status'

// What the action cell and the SSL cell of a row show.

type RowActionsRow = Pick<HostingDomain, 'type' | 'capabilities' | 'ssl_order_status'>

export interface DomainActionsView {
  /** Set as primary: a main domain shows the full star and the button is disabled. */
  star: { visible: boolean, disabled: boolean, icon: '$starFullPremiumIcon' | '$starEmptyIcon' }
  /** Edit SSL: disabled (with the pending tooltip) while an order is in flight. */
  ssl: { visible: boolean, disabled: boolean }
  edit: { visible: boolean }
  delete: { visible: boolean }
}

/**
 * Desktop needs `can_manage_ssl` and the privilege for the SSL button; the mobile list checks only the privilege (legacy quirk).
 */
export function visibleActions (row: RowActionsRow, service: Pick<HostingService, 'privileges'>, options: { mobile: boolean }): DomainActionsView {
  const capabilities = row.capabilities
  const manageSsl = hasPrivilege(service, HOSTING_PRIVILEGES.MANAGE_SSL)
  const isMain = row.type === 'main'
  return {
    star: {
      visible: Boolean(capabilities.can_set_as_primary),
      disabled: isMain,
      icon: isMain ? '$starFullPremiumIcon' : '$starEmptyIcon',
    },
    ssl: {
      visible: options.mobile ? manageSsl : Boolean(capabilities.can_manage_ssl) && manageSsl,
      disabled: isSslOrderBlocking(row.ssl_order_status),
    },
    edit: { visible: Boolean(capabilities.can_redirect || capabilities.can_update_document_root) },
    delete: { visible: row.type !== 'main' },
  }
}

export type SslCellKind = 'loading' | 'pending' | 'indicator'

export interface SslCellView {
  kind: SslCellKind
  /** The `ssl` prop of `SslIndicator` (the detected certificate). */
  ssl: SslInfo
  /** `message.status.wrongDns` (the domain points elsewhere), `general.sslProvider.selfSigned`, `general.sslProvider.none` or the issuer name. */
  text: { kind: 'key', key: string } | { kind: 'issuer', value: string | undefined }
  textClass: SslCertTextClass
}

type SslCellRow = Pick<HostingDomain, 'ssl_order_status' | 'sslStatusLoading' | 'sslDetectedCert'>

/**
 * The SSL cell: a spinner while the certificates load, the pending/failed indicator (not behind a valid detected certificate), or
 * the indicator of the detected certificate. `textClass` is the verdict of the certificate (`sslCertTextClass`): green only for `trusted`,
 * warning when the domain points to another server, red otherwise and without a certificate.
 */
export function sslCell (row: SslCellRow): SslCellView {
  const certificate = row.sslDetectedCert
  const kind: SslCellKind = row.sslStatusLoading
    ? 'loading'
    : (shouldShowSslOrderStatus(row.ssl_order_status, { loading: false, certificate }) ? 'pending' : 'indicator')
  if (!certificate) {
    return {
      kind,
      ssl: { certificate_installed: false, certificate: {} },
      text: { kind: 'key', key: 'general.sslProvider.none' },
      textClass: sslCertTextClass(certificate),
    }
  }
  // The DNS verdict explains the whole row, so it comes before the self-signed label and the issuer.
  let text: SslCellView['text'] = { kind: 'issuer', value: certificate.issuer_name }
  if (sslPointsElsewhere(certificate)) {
    text = { kind: 'key', key: 'message.status.wrongDns' }
  } else if (certificate.self_signed) {
    text = { kind: 'key', key: 'general.sslProvider.selfSigned' }
  }
  return {
    kind,
    ssl: { certificate_installed: true, certificate },
    text,
    textClass: sslCertTextClass(certificate),
  }
}

/** The click on the SSL cell: nothing during an order, and only with `can_manage_ssl`. */
export function canOpenSslFromCell (row: Pick<HostingDomain, 'ssl_order_status' | 'capabilities'>): boolean {
  return !isSslOrderBlocking(row.ssl_order_status) && Boolean(row.capabilities.can_manage_ssl)
}

/** The tooltip of the SSL button: the pending alert (with the domain) while an order blocks it, `button.ssl.edit` otherwise. */
export function sslEditTooltip (row: Pick<HostingDomain, 'ssl_order_status' | 'domain'>, t: (key: string) => string): string {
  if (!isSslOrderBlocking(row.ssl_order_status)) {
    return t('button.ssl.edit')
  }
  // The legacy key carries a single-brace `{domain}` placeholder (not i18next's `{{domain}}`), so the replace is a port, not a shortcut.
  return t('tooltip.hosting.dns.status.pending.alert').replace('{domain}', row.domain)
}
