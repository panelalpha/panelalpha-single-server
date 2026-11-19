import type { Handler, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { settled } from './auth'
import { baseCertificates, baseDomains, type DomainCertificates, domainItem, domainsBody, liteSslOffers } from './hosting-domains'
import { ADVANCED_PROJECT_ID, advancedFrameHandlers, advancedFrameInstance } from './instance-advanced-frame'
import { liteShellHome } from './instances'

// S-109 ui-domains: the probes, helpers and handlers of the Domains list in the Advanced tab of a project (`/projects/:id/advanced/domains`,
// `LITE/views/instance/advanced/Domains.vue`), measured on app-lite. The list, the rows and the modals are the ones of `/hosting/domains`
// (`hosting-domains.ts`); only the header differs (`.advanced-hosting-page .page-title--advanced`, no title row, no account selector).
// Next keeps the `domains-*` test ids of `DomainsView.vue`, so only the legacy selectors of the header differ. The project's server account
// is 1 and its service 1 (`instancePageRaw`). Plan: context/changes/ui-domains/plan.md.

const projectHeader = '.advanced-hosting-page .page-title--advanced'

/** The project's account id (`instance.hostingId`, `server_accounts[0].id` of the built service). */
export const PROJECT_ACCOUNT_ID = 1

export const domainsProjectTitleProbe: Probe = {
  key: 'domains-title',
  legacy: page => page.locator(`${projectHeader} h4`),
  next: page => page.getByTestId('domains-title'),
}

export const domainsProjectControlsProbe: Probe = {
  key: 'domains-controls',
  legacy: page => page.locator(`${projectHeader} .page-title__filter-controls`),
  next: page => page.getByTestId('domains-controls'),
}

export const domainsProjectSearchProbe: Probe = {
  key: 'domains-search',
  legacy: page => page.locator(`${projectHeader} .my-hostings-search`),
  next: page => page.getByTestId('domains-controls').locator('.my-hostings-search'),
}

export const domainsProjectAddProbe: Probe = {
  key: 'domains-add',
  legacy: page => page.locator(`${projectHeader} .add-new-button`),
  next: page => page.getByTestId('domains-add'),
}

export const domainsProjectAddIconProbe: Probe = {
  key: 'domains-add-icon',
  legacy: page => page.locator(`${projectHeader} .add-new-button .v-icon`).first(),
  next: page => page.getByTestId('domains-add').locator('.v-icon').first(),
  internal: true,
}

/** The hover / focus overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const domainsProjectAddOverlayProbe: Probe = {
  key: 'domains-add-overlay',
  legacy: domainsProjectAddProbe.legacy,
  next: page => domainsProjectAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

const legacyRows = (page: Page) => page.locator('.v-main .data-table tbody tr')

/** The "Points to" value of the first row with a proxy rule (`domainsWithProxy`, row 1): the 4th desktop cell, the 4th mobile value. */
export const domainsPointsToProbe: Probe = {
  key: 'domains-points-to',
  legacy: page => legacyRows(page).nth(1).locator('td:nth-child(4) span, .mobile-table-item__row:nth-child(4) .mobile-table-item__value span').first(),
  next: page => page.getByTestId('domains-row').nth(1).locator('td:nth-child(4) span, .mobile-table-item__row:nth-child(4) .mobile-table-item__value span').first(),
}

/**
 * A button of the actions of a row (desktop `.actions-row`, the last mobile value), by index in DOM order. Row 0 is the main domain (a disabled
 * star, SSL), row 1 an addon with every capability (star, SSL, Edit, Delete).
 */
export function domainsRowButtonProbe (row: number, index: number, key: string): Probe {
  const selector = '.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn'
  return {
    key,
    legacy: page => legacyRows(page).nth(row).locator(selector).nth(index),
    next: page => page.getByTestId('domains-row').nth(row).locator(selector).nth(index),
  }
}

/** The project's domains: the base list of `/hosting/domains` on the project's account. */
export const projectDomains = baseDomains.map(item => ({ ...item, server_account_id: PROJECT_ACCOUNT_ID }))

/** One enabled http proxy rule of the second domain (`shop.example.net`): "Points to" reads `127.0.0.1:8080` instead of its document root. */
export const projectProxyRules = [
  { transport: 'http', enabled: true, server_name: 'shop.example.net', upstream_host: '127.0.0.1', upstream_port: 8080, listen_port: 80 },
]

function certificateHandler (kind: 'installed' | 'detected', certs: Record<string, DomainCertificates>): Handler {
  return ({ query }) => {
    const found = certs[query.get('domain') ?? '']?.[kind]
    return { json: { data: found ?? null } }
  }
}

export interface DomainsProjectHandlerOptions {
  /** Answer of `GET /server-accounts/1/domains` (default: the base list). */
  domains?: Handler
  certs?: Record<string, DomainCertificates>
  /** Answer of `GET /services/1/proxy-rules` (default: one rule). */
  proxyRules?: Handler
  /** Fields of the project (`GET /projects/41`) that the built hosting service reads: `dns_settings`, `server_settings`, `plan_settings`, `diagnostic_mode`. */
  instance?: Record<string, unknown>
  overrides?: Record<string, Handler>
}

/** Handlers of the project's Domains page: the Advanced frame plus the list, the certificates, the proxy rules and the SSL offers. */
export function domainsProjectHandlers (options: DomainsProjectHandlerOptions = {}): Record<string, Handler> {
  const certs = options.certs ?? baseCertificates
  return advancedFrameHandlers({
    [`GET /server-accounts/${PROJECT_ACCOUNT_ID}/domains`]: options.domains ?? { json: domainsBody(projectDomains) },
    [`GET /server-accounts/${PROJECT_ACCOUNT_ID}/ssl/certificate/installed`]: certificateHandler('installed', certs),
    [`GET /server-accounts/${PROJECT_ACCOUNT_ID}/ssl/certificate/detected`]: certificateHandler('detected', certs),
    'GET /services/1/proxy-rules': options.proxyRules ?? { json: { data: projectProxyRules } },
    'GET /ssl-offer': { json: { data: liteSslOffers } },
    ...(options.instance === undefined ? {} : { [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: { ...advancedFrameInstance, ...options.instance } } } }),
    ...options.overrides,
  })
}

/** The single-server `/home` without the `admin` key (the style manager drawer would widen the full-page shot), with the custom SSL link. */
const { admin: _projectAdmin, ...liteHomeWithoutAdmin } = liteShellHome() as Record<string, unknown> & { app: Record<string, unknown> }

export const DOMAINS_PROJECT_HOME = {
  ...liteHomeWithoutAdmin,
  app: { ...liteHomeWithoutAdmin.app, order_custom_ssl_certificate_link: 'https://example.com/custom-ssl' },
}

/** Opens the Add modal from the project header's Add button. */
export function clickProjectAdd (next: boolean): StateAction {
  return async page => {
    await (next ? domainsProjectAddProbe.next(page) : domainsProjectAddProbe.legacy(page)).click()
    await settled(page.locator('.basic-modal'))
  }
}

/** Twelve domains after the main one, so the footer shows two pages of eight. */
export const projectManyDomains = Array.from({ length: 12 }, (_, index) => domainItem({
  id: 100 + index,
  domain: `site${String(index + 1).padStart(2, '0')}.example.org`,
  document_root: `/home/example/public_html/site${String(index + 1).padStart(2, '0')}`,
  server_account_id: PROJECT_ACCOUNT_ID,
}))
