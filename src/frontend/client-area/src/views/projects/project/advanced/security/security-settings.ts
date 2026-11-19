import type { SslSettings } from './security.api'
import type { SslCertificate } from '@/entities/ssl/ssl-certificates.api'
import type { SslInfo } from '@/entities/ssl/ui/ssl-status'
import { escapeHtml } from '@/shared/format/escape-html'

// Pure logic of the advanced Security screen. No Vue, no HTTP: the view does the requests and keeps the state.

/**
 * Any certificate the server answers with counts as installed, `null` as none. The General block uses
 * `sslInfoFromCertificate` from `@/entities/ssl/security-ssl`, which needs an issuer, so this screen keeps its own mapping.
 */
export function clientSslInfoFromCertificate (certificate: SslCertificate | null): SslInfo {
  return {
    certificate: certificate ?? null,
    certificate_installed: !!certificate,
  }
}

/** The other instances on the same domain, `name (url)`, without the page's own instance. */
export function otherSharedInstances (settings: SslSettings, instanceId: number): string[] {
  return (settings.domain_shared_instances ?? [])
    // Legacy compares loosely (`i.id != this.instance.id`), so an id sent as a string still matches.
    .filter(item => Number(item.id) !== instanceId)
    .map(item => `${item.name} (${item.url})`)
}

/**
 * The text of the shared-domain modal: the translated `info` (the caller passes the escaped domain) and a `<ul>` of the other instances.
 * The names and URLs come from the API, so each one is escaped before it reaches `v-html`.
 */
export function sharedDomainMessage (info: string, instances: string[]): string {
  const items = instances.map(item => `<li>${escapeHtml(item)}</li>`).join('')
  return `${info}<ul>${items}</ul>`
}
