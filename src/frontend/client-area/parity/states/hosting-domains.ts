import type { Handler, LegacyTarget, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { hostingService, hostingState, type HostingStateOptions, serverAccount } from './hosting'
import { isoFromNow, NOW, singleServerHome } from './shell'

// Shared building blocks of the S-32 Domains states (hosting-domains). Not a spec file (testMatch is `*.parity.ts`).
//
// A Domains state is a hosting state on `/hosting/domains`: one active service `Pro` with one server account (11), the 13 `hosting.*`
// privileges, no DNS verification methods (so the per-row `verifyDomainResolving` answers `true` at once and neither app asks
// dns.google), `domain_transfer_allowed` off and a frozen clock. A state sets only what differs. Legacy locators use the legacy class
// names next copied; next uses the `domains-*` vocabulary: `domains-title`, `domains-controls`, `domains-add`, `domains-account-selector`,
// `domains-table`, `domains-row`, `domains-row-link`, `domains-row-redirect`, `domains-row-ssl`, `domains-row-actions`,
// `domains-row-action-{set-primary,ssl-edit,edit,delete}`, `domains-empty`, `domains-empty-add`.
// Plan: context/changes/hosting-domains/plan.md ("Stany parity").

export const ACCOUNT_ID = 11
const UPDATED_AT = isoFromNow(-3 * 3_600_000)

export function certificate (overrides: Record<string, unknown> = {}) {
  return {
    issuer_name: 'Let\'s Encrypt',
    self_signed: false,
    name_match: true,
    not_before: '2026-09-01T00:00:00.000Z',
    not_after: '2026-12-01T00:00:00.000Z',
    ...overrides,
  }
}

export const selfSignedCertificate = certificate({ issuer_name: 'example.org', self_signed: true })
export const mismatchedCertificate = certificate({ issuer_name: 'Other CA', name_match: false })

const fullCapabilities = {
  can_update_document_root: true,
  can_redirect: true,
  can_set_as_primary: true,
  can_manage_ssl: true,
}

/** One element of `GET /server-accounts/{id}/domains` (backend `DomainResource`). */
export function domainItem (overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    domain: 'example.org',
    type: 'addon',
    document_root: '/home/example/public_html/example.org',
    redirect_enabled: false,
    redirect_url: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: UPDATED_AT,
    ssl_order_status: 'none',
    server_account_id: ACCOUNT_ID,
    domain_zone: null,
    has_dns_zone: false,
    aliases: [],
    cdn_dns_records: [],
    capabilities: fullCapabilities,
    ...overrides,
  }
}

export function domainsBody (items: unknown[], types: string[] = ['addon', 'sub']) {
  return { data: items, meta: { domain_types: types } }
}

/** What the certificate endpoints answer for a domain; `null` is "no certificate". */
export interface DomainCertificates {
  installed?: unknown
  detected?: unknown
}

/** The mixed list of the base state: a main domain with a valid certificate, a redirected addon, a self-signed addon, a sub, an addon without a certificate. */
export const baseDomains = [
  domainItem({
    id: 1,
    domain: 'example.com',
    type: 'main',
    document_root: '/home/example/public_html',
    capabilities: { ...fullCapabilities, can_redirect: false, can_update_document_root: false },
  }),
  domainItem({
    id: 2,
    domain: 'shop.example.net',
    redirect_enabled: true,
    redirect_url: 'https://www.example.net/shop',
    document_root: '/home/example/public_html/shop.example.net',
  }),
  domainItem({
    id: 3,
    domain: 'selfsigned.example.org',
    document_root: '/home/example/public_html/selfsigned.example.org',
  }),
  domainItem({
    id: 4,
    domain: 'blog.example.com',
    type: 'sub',
    document_root: '/home/example/public_html/blog',
    capabilities: { ...fullCapabilities, can_set_as_primary: false },
  }),
  domainItem({
    id: 5,
    domain: 'nocert.example.io',
    document_root: '/home/example/public_html/nocert.example.io',
  }),
]

export const baseCertificates: Record<string, DomainCertificates> = {
  'example.com': { installed: certificate(), detected: certificate() },
  'shop.example.net': { installed: certificate(), detected: certificate() },
  'selfsigned.example.org': { installed: selfSignedCertificate, detected: selfSignedCertificate },
  'blog.example.com': { installed: mismatchedCertificate, detected: mismatchedCertificate },
  'nocert.example.io': { installed: null, detected: null },
}

export interface DomainsStateOptions {
  /** `app` (default) or `lite`: the legacy origin and the fixtures both apps are served. */
  target?: LegacyTarget
  /** The service of `GET /services` (default: one account 11). */
  service?: Record<string, unknown>
  /** Answer of `GET /server-accounts/{id}/domains` for every account. */
  domains?: Handler
  /** Certificates per domain; a domain without an entry has none. Both endpoints answer per `?domain=`. */
  certs?: Record<string, DomainCertificates>
  /** Answer of `GET /ssl-offer`. */
  offers?: Handler
  /** Answer of `GET /services/{id}/domains/verify` (transfer states). */
  verify?: Handler
  external?: ParityState['external']
  handlers?: Record<string, Handler>
  /** The `/home` payload (default: the multi-server shell). */
  home?: HostingStateOptions['home']
  /** Element both apps must show before capture. Default: the first row. */
  ready?: Pick<Probe, 'legacy' | 'next'>
  /** Wait for the SSL spinners of the rows to go (default `true`; a state whose rows keep a pending spinner sets `false`). */
  settleSsl?: boolean
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
  masks?: ParityState['masks']
  pointer?: ParityState['pointer']
}

// ---------------------------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------------------------

const legacyRows = (page: Page) => page.locator('.v-main .data-table tbody tr')

export const domainsTitleProbe: Probe = {
  key: 'domains-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('domains-title'),
}

export const domainsControlsProbe: Probe = {
  key: 'domains-controls',
  legacy: page => page.locator('.v-main .page-title__filter-controls'),
  next: page => page.getByTestId('domains-controls'),
}

export const domainsSearchProbe: Probe = {
  key: 'domains-search',
  legacy: page => page.locator('.v-main .page-title__filter-controls .my-hostings-search'),
  next: page => page.getByTestId('domains-controls').locator('.my-hostings-search'),
  internal: true,
}

export const domainsAddProbe: Probe = {
  key: 'domains-add',
  legacy: page => page.locator('.v-main .page-title__filter-controls .add-new-button'),
  next: page => page.getByTestId('domains-add'),
}

/** The icon and the label box of the Add button (V4 renders both inside `.v-btn__content`). */
export const domainsAddIconProbe: Probe = {
  key: 'domains-add-icon',
  legacy: page => page.locator('.v-main .page-title__filter-controls .add-new-button .v-icon'),
  next: page => page.getByTestId('domains-add').locator('.v-icon'),
  internal: true,
}

export const domainsAddContentProbe: Probe = {
  key: 'domains-add-content',
  legacy: page => page.locator('.v-main .page-title__filter-controls .add-new-button .v-btn__content'),
  next: page => page.getByTestId('domains-add').locator('.v-btn__content'),
  internal: true,
}

export const domainsSelectorProbe: Probe = {
  key: 'domains-account-selector',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.getByTestId('domains-account-selector'),
}

/** The label and the select of the account selector (inner boxes, to tell which part differs). */
export const domainsSelectorLabelProbe: Probe = {
  key: 'domains-account-label',
  legacy: page => page.locator('.v-main .acc-select-group .acc-select-label'),
  next: page => page.getByTestId('domains-account-selector').locator('.acc-select-label'),
  internal: true,
}

export const domainsSelectorSelectProbe: Probe = {
  key: 'domains-account-select',
  legacy: page => page.locator('.v-main .acc-select-group .v-select'),
  next: page => page.getByTestId('domains-account-selector').locator('.v-select'),
  internal: true,
}

export const domainsTitleColProbe: Probe = {
  key: 'domains-title-col',
  legacy: page => page.locator('.v-main .title-row > .col').first(),
  next: page => page.locator('.v-main .title-row > .v-col').first(),
  internal: true,
}

export const domainsFilterControlsProbe: Probe = {
  key: 'domains-filter-controls',
  legacy: page => page.locator('.v-main .page-title__filter-controls .data-iterator-filter-controls'),
  next: page => page.getByTestId('domains-controls').locator('.data-iterator-filter-controls'),
  internal: true,
}

export const domainsTableProbe: Probe = {
  key: 'domains-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('domains-table'),
}

export const domainsRowProbe: Probe = {
  key: 'domains-row',
  legacy: page => legacyRows(page).first(),
  next: page => page.getByTestId('domains-row').first(),
}

/** The domain link of the first row (desktop cell or mobile value). */
export const domainsRowLinkProbe: Probe = {
  key: 'domains-row-link',
  legacy: page => legacyRows(page).first().locator('a.font-weight-bold').first(),
  next: page => page.getByTestId('domains-row-link').first(),
}

/** "redirected to ..." under the second row's domain. */
export const domainsRowRedirectProbe: Probe = {
  key: 'domains-row-redirect',
  legacy: page => legacyRows(page).nth(1).locator('span.p-4'),
  next: page => page.getByTestId('domains-row-redirect').first(),
}

/** The SSL cell of the row with the given index (the indicator, the pending indicator or the spinner). */
export function domainsRowSslProbe (index = 0, key = `domains-row-ssl-${index}`): Probe {
  return {
    key,
    legacy: page => legacyRows(page).nth(index).locator('.ssl-button, td > .v-progress-circular, .mobile-table-item__value > .v-progress-circular').first(),
    next: page => page.getByTestId('domains-row-ssl').nth(index),
  }
}

/** The action buttons of the first row (desktop `.actions-row`, mobile last value). */
export const domainsRowActionsProbe: Probe = {
  key: 'domains-row-actions',
  legacy: page => legacyRows(page).first().locator('.actions-row, .mobile-table-item__row:last-child .mobile-table-item__value').first(),
  next: page => page.getByTestId('domains-row-actions').first(),
}

export const domainsEmptyProbe: Probe = {
  key: 'domains-empty',
  legacy: page => page.locator('.v-main .data-table .no-data'),
  next: page => page.getByTestId('domains-empty'),
}

export const domainsEmptyAddProbe: Probe = {
  key: 'domains-empty-add',
  legacy: page => page.locator('.v-main .data-table .no-data .v-btn'),
  next: page => page.getByTestId('domains-empty-add'),
}

/** The alert stack (fixed, top right). */
export const domainsAlertsProbe: Probe = {
  key: 'alerts',
  legacy: page => page.locator('.alert-manager'),
  next: page => page.getByTestId('shell-alert-manager'),
}

export const domainsNoResultsProbe: Probe = {
  key: 'domains-no-results',
  legacy: page => page.locator('.v-main .data-table .no-results-container'),
  next: page => page.getByTestId('domains-no-results'),
}

export const domainsFooterProbe: Probe = {
  key: 'domains-footer',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer'),
  next: page => page.getByTestId('domains-table').locator('.data-iterator-footer'),
}

/** The sort row above the rows (desktop only; mobile sorts through the value labels). */
export const domainsSortHeaderProbe: Probe = {
  key: 'domains-sort-header',
  legacy: page => page.locator('.v-main .data-table tr.custom-sort'),
  next: page => page.getByTestId('domains-table').locator('tr.custom-sort'),
}

/** Title, controls, table, first row, its link, its SSL cell and its actions: what every list state shows. */
export const domainsListProbes: Probe[] = [
  domainsTitleProbe,
  domainsControlsProbe,
  domainsSearchProbe,
  domainsAddProbe,
  domainsAddIconProbe,
  domainsAddContentProbe,
  domainsTableProbe,
  domainsRowProbe,
  domainsRowLinkProbe,
  domainsRowSslProbe(0),
  domainsRowActionsProbe,
]

export const domainsListReady: Pick<Probe, 'legacy' | 'next'> = { legacy: domainsRowProbe.legacy, next: domainsRowProbe.next }
export const domainsTitleReady: Pick<Probe, 'legacy' | 'next'> = { legacy: domainsTitleProbe.legacy, next: domainsTitleProbe.next }

// ---------------------------------------------------------------------------------------------
// Waits
// ---------------------------------------------------------------------------------------------

/** The spinner that stands in a row's SSL cell while its certificates load (the pending indicator's spinner is nested deeper). */
const legacySslSpinners = (page: Page) => page.locator('.v-main .data-table tbody td > .v-progress-circular, .v-main .data-table tbody .mobile-table-item__value > .v-progress-circular')
const nextSslSpinners = (page: Page) => page.getByTestId('domains-row-ssl').and(page.locator('.v-progress-circular'))

/** Every row has its certificates: the two apps ask them per row and the first answer removes the spinner. */
export function waitForSslSettled (spinners: (page: Page) => Locator): StateAction {
  return async page => {
    try {
      await expect(spinners(page)).toHaveCount(0, { timeout: 20_000 })
    } catch {
      // the state's probes and pixel diff report what is still spinning
    }
  }
}

/**
 * Types `term` into the search and waits until `shown` appears. Both apps debounce with lodash, which reads `Date.now()`: under the
 * frozen `clock` it never sees 300 ms pass, so the frozen time moves on by a second between short in-page sleeps (as `searchAction`).
 */
export function searchDomains (term: string, shown: (page: Page) => Locator): StateAction {
  return async page => {
    // Below `md` the search is an icon that opens the field on click (`DataIteratorSearch`, `smAndDown`).
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await page.locator('.v-main .data-iterator-filter-controls__item').last().locator('.v-input').click()
    }
    await page.getByPlaceholder(tr('form.placeholder.search')).fill(term)
    const base = Date.parse(NOW)
    for (let step = 1; step <= 20; step++) {
      await page.clock.setFixedTime(new Date(base + step * 1000))
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)))
      if (await shown(page).count() > 0) {
        return
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------

function certificateHandler (kind: 'installed' | 'detected', certs: Record<string, DomainCertificates>): Handler {
  return ({ query }) => {
    const found = certs[query.get('domain') ?? '']?.[kind]
    return { json: { data: found ?? null } }
  }
}

export function domainsState (options: DomainsStateOptions = {}): Omit<ParityState, 'id'> {
  const service = options.service ?? hostingService()
  const accountIds = ((service as { server_accounts?: Array<{ id: number }> }).server_accounts ?? []).map(account => account.id)
  const certs = options.certs ?? baseCertificates
  const settle = options.settleSsl ?? true
  const handlers: Record<string, Handler> = {}
  for (const id of accountIds) {
    handlers[`GET /server-accounts/${id}/domains`] = options.domains ?? { json: domainsBody(baseDomains) }
    handlers[`GET /server-accounts/${id}/ssl/certificate/installed`] = certificateHandler('installed', certs)
    handlers[`GET /server-accounts/${id}/ssl/certificate/detected`] = certificateHandler('detected', certs)
  }
  if (options.offers !== undefined) {
    handlers['GET /ssl-offer'] = options.offers
  }
  if (options.verify !== undefined) {
    handlers[`GET /services/${(service as { id: number }).id}/domains/verify`] = options.verify
  }
  const state = hostingState({
    services: [service],
    path: '/hosting/domains',
    clock: NOW,
    ...(options.external === undefined ? {} : { external: options.external }),
    ...(options.home === undefined ? {} : { home: options.home }),
    ready: options.ready ?? domainsListReady,
    handlers: { ...handlers, ...options.handlers },
    legacy: [...(settle ? [waitForSslSettled(legacySslSpinners)] : []), ...(options.legacy ?? [])],
    next: [...(settle ? [waitForSslSettled(nextSslSpinners)] : []), ...(options.next ?? [])],
    probes: options.probes ?? domainsListProbes,
    ...(options.masks === undefined ? {} : { masks: options.masks }),
    ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
  })
  return { ...state, ...(options.target === undefined ? {} : { target: options.target }) }
}

/** The SSL providers app-lite offers next to "custom" (`GET /ssl-offer`). */
export const liteSslOffers = [
  { id: 1, name: 'Let\'s Encrypt', slug: 'letsencrypt' },
  { id: 2, name: 'Sectigo', slug: 'sectigo' },
]

/**
 * A Domains state measured against app-lite (`target: 'lite'`): the single-server `/home` (with the link to buy a custom certificate),
 * the project list answered next to the instance one, the SSL offers. The hosting frame is not probed here (the multi-server frame is
 * what `hosting-summary` measures; lite relabels its tab), so a lite state carries only its own probes.
 */
export function liteDomainsState (options: DomainsStateOptions = {}): Omit<ParityState, 'id'> {
  const base = singleServerHome()
  const state = domainsState({
    ...options,
    target: 'lite',
    home: { ...base, app: { ...base.app, order_custom_ssl_certificate_link: 'https://example.com/custom-ssl' } },
    offers: options.offers ?? { json: { data: liteSslOffers } },
    handlers: {
      'GET /projects': { json: { data: [], meta: { total: 0 } } },
      // The deployed lite is newer than the fixtures: the domains list also asks the service's proxy rules.
      'GET /services/1/proxy-rules': { json: { data: [] } },
      ...options.handlers,
    },
  })
  return { ...state, probes: options.probes ?? [] }
}

/** A wp-cloud service: only the `alias` type is creatable and the account is a wp-cloud one. */
export function wpCloudService (overrides: Record<string, unknown> = {}) {
  return hostingService({
    hosting_server_type: 'wp-cloud',
    server_accounts: [serverAccount({ server_type: 'wp-cloud' })],
    ...overrides,
  })
}

const wpCloudCapabilities = { can_update_document_root: false, can_redirect: false, can_set_as_primary: true, can_manage_ssl: true }

export const wpCloudDomains = [
  domainItem({ id: 1, domain: 'example.com', type: 'main', document_root: '', capabilities: { ...wpCloudCapabilities, can_manage_ssl: true } }),
  domainItem({ id: 2, domain: 'alias.example.org', type: 'alias', document_root: '', capabilities: wpCloudCapabilities }),
  domainItem({ id: 3, domain: 'second.example.net', type: 'alias', document_root: '', capabilities: wpCloudCapabilities }),
]

/** `hostingService` with a second server account (12), so the selector shows. */
export function twoAccountsService (overrides: Record<string, unknown> = {}) {
  return hostingService({
    server_accounts: [serverAccount(), serverAccount({ id: 12, domain: 'second.example.com', username: 'second' })],
    ...overrides,
  })
}

export { waitFor } from './hosting'
