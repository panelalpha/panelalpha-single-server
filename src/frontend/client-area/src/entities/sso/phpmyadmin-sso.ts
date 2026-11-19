import { resolveARecord } from '@/entities/domain/dns-google'

// Decision helpers of the phpMyAdmin SSO flow. The DNS question is asked as in legacy: only
// whether an A record exists, not which address it has.

/**
 * `hasARecord` (legacy `getDomainDnsMismatchDetected`, inverted): the host has an A record, or, for a `www.` host, the host without
 * `www.` has one. An empty host and a failed lookup have none.
 */
export async function hasARecord (host: string): Promise<boolean> {
  if (!host) {
    return false
  }
  try {
    if (await resolveARecord(host)) {
      return true
    }
    if (host.startsWith('www.')) {
      return Boolean(await resolveARecord(host.slice(4)))
    }
    return false
  } catch {
    return false
  }
}

export interface SsoModalDecision {
  hasARecord: boolean
  isSingleServer: boolean
  previewSiteProviderEnabled: boolean
}

/**
 * The DNS does not point at a record and the app is single server or has the
 * preview site provider. Only then the SSO modal is offered; otherwise the login goes straight through.
 */
export function shouldOpenSsoModal (input: SsoModalDecision): boolean {
  return !input.hasARecord && (input.isSingleServer || input.previewSiteProviderEnabled)
}
