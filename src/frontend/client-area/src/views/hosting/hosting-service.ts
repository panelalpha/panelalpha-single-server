import type { HostingService } from './hosting.types'
import { hasAnyHostingPrivilege, hasPrivilege, HOSTING_PRIVILEGES as P } from './hosting-privileges'
import { sidebarItems } from './hosting-sidebar-items'

// Pure part of the hosting frame.

/** The server account fields the screens read, derived from `details` and `main_domain_nameservers`. */
export function mapServerAccounts (service: HostingService): HostingService {
  return {
    ...service,
    server_accounts: service.server_accounts.map(account => {
      const mapped = { ...account }
      if (account.details?.homedir) {
        mapped.homedir = `${account.details.homedir}/`
      }
      if (account.details?.mysql_db_prefix) {
        mapped.mysql_db_prefix = account.details.mysql_db_prefix
      }
      if (account.main_domain_nameservers) {
        mapped.nameservers = account.main_domain_nameservers || []
      }
      if (account.details?.ip_address) {
        mapped.ip_address = account.details.ip_address || null
      }
      return mapped
    }),
  }
}

export interface SortedServices {
  /** Every mapped service, unfiltered (the lookup of a requested id searches this list). */
  all: HostingService[]
  /** Services the frame offers: active, with server accounts and a `hosting.*` privilege. */
  services: HostingService[]
  /** The last suspended or cancelled service. */
  suspended: HostingService | null
}

export function sortServices (raw: HostingService[]): SortedServices {
  const all = raw.map(service => ({ ...mapServerAccounts(service), name: `${service.plan_name} - ${service.domain}` }))
  const services: HostingService[] = []
  let suspended: HostingService | null = null

  for (const service of all) {
    if (service.status === 'suspended' || service.status === 'cancelled') {
      suspended = service
      continue
    }
    if (service.server_accounts.length === 0) {
      continue
    }
    if (service.status !== 'active') {
      continue
    }
    if (!hasAnyHostingPrivilege(service)) {
      continue
    }
    services.push(service)
  }

  return { all, services, suspended }
}

/**
 * No requested id or an unknown one selects the first service; a known id selects the service found
 * in the **unfiltered** list (so it can be a service the frame would not offer). Ids compare loosely (`==`): a query
 * string `"5"` finds service 5.
 */
export function selectService (sorted: SortedServices, requestedId: string | number | null | undefined): HostingService | null {
  const first = sorted.services[0]
  if (first === undefined) {
    return null
  }
  if (!requestedId) {
    return first
  }
  return sorted.all.find(service => String(service.id) === String(requestedId)) ?? first
}

export interface RequestedServiceSources {
  /** `$route.params.instance.service_id`. */
  fromParams?: string | number | null
  /** `sessionStorage.selectedPlanId` (JSON). */
  fromSession?: string | number | null
  /** `$route.query.id`. */
  fromQuery?: string | null
}

/**
 * Params, then session, then `?id=`. `consumeQuery` is true only when the query id decided the
 * choice: legacy removes `id` from the query just then (a session id wins and leaves the query alone).
 */
export function resolveRequestedService ({ fromParams, fromSession, fromQuery }: RequestedServiceSources): { id: string | number | null, consumeQuery: boolean } {
  const known = fromParams || fromSession
  if (known) {
    return { id: known, consumeQuery: false }
  }
  if (fromQuery) {
    return { id: fromQuery, consumeQuery: true }
  }
  return { id: null, consumeQuery: false }
}

/** On single-server a plan change lands on Usage, unless the path is already Usage or Summary (`includes`, so subpaths stay too). */
export function needsUsageRedirect (path: string): boolean {
  return !path.includes('/hosting/usage') && !path.includes('/hosting/summary')
}

/** The page segment of a My Server route (`/hosting/<page>`), or `null` (a trailing slash is allowed, deeper paths are not). */
export function hostingPageSegment (path: string): string | null {
  const match = /^\/hosting\/([^/]+)\/?$/.exec(path)
  return match ? match[1]! : null
}

/** Pages this rule leaves alone: Summary has its own entry rule (`summaryEntry`), and the app-lite Containers page stays reachable by direct URL. */
const PAGES_WITH_OWN_ENTRY_RULE: ReadonlySet<string> = new Set(['summary', 'containers'])

/**
 * The redirect for a My Server page the sidebar does not offer, or `null` when it does. Single-server's sidebar is the list of
 * pages the server has: Usage and the server pages the service offers (DNS, e-mail); the other sections live in the project's
 * Advanced tab, so a direct URL to one of them must not mount the page on Free. Multi-server keeps its privilege rule
 * (`needsSummaryRedirect`).
 */
export function hiddenHostingPageRedirect (path: string, service: HostingService, singleServer: boolean): string | null {
  const segment = hostingPageSegment(path)
  if (segment === null || PAGES_WITH_OWN_ENTRY_RULE.has(segment)) {
    return null
  }
  if (!singleServer) {
    return needsSummaryRedirect(path, service) ? '/hosting/summary' : null
  }
  const offered = sidebarItems(service, { singleServer, emailRecordsDot: false }).some(item => item.to === `/hosting/${segment}`)
  return offered ? null : '/hosting/usage'
}

/** The service server pages (DNS, e-mail) that single-server keeps besides Usage. */
export function isServiceServerPage (path: string): boolean {
  return path.includes('/hosting/dns') || path.includes('/hosting/email-addresses') || path.includes('/hosting/email-forwarders')
}

/** The subpage the new service has no access to sends the user to Summary. */
export function needsSummaryRedirect (path: string, service: HostingService): boolean {
  if (path.includes('/hosting/domains')) {
    return !hasPrivilege(service, P.MANAGE_DOMAINS)
  }
  if (path.includes('/hosting/ftp')) {
    return !hasPrivilege(service, P.MANAGE_FTP)
  }
  if (path.includes('/hosting/sftp')) {
    return !hasPrivilege(service, P.MANAGE_SFTP)
  }
  if (path.includes('/hosting/databases')) {
    return !hasPrivilege(service, P.MANAGE_MYSQL) && !hasPrivilege(service, P.PHPMYADMIN_SSO)
  }
  if (path.includes('/hosting/cron')) {
    return !hasPrivilege(service, P.MANAGE_CRON)
  }
  if (path.includes('/hosting/file-manager')) {
    return !hasPrivilege(service, P.MANAGE_FILE_MANAGER)
  }
  if (path.includes('/hosting/dns')) {
    return !service.dns_server_enabled || !hasPrivilege(service, P.MANAGE_DNS) || !service.plan_settings.dns_management_enabled
  }
  if (path.includes('/hosting/email-addresses') || path.includes('/hosting/email-forwarders')) {
    return !hasPrivilege(service, P.MANAGE_EMAIL) || !service.email_server_enabled
  }
  return false
}

/**
 * Entry to `/hosting/summary`: single-server has no Summary (legacy pushes to Usage in `created`), so the route
 * goes straight to Usage before the Summary skeleton renders. Runs after the global guard, so `/home` is known.
 */
export function summaryEntry (singleServer: boolean): true | string {
  return singleServer ? '/hosting/usage' : true
}
