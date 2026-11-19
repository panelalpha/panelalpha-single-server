import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { trPattern } from './auth'
import { waitFor } from './hosting'
import { labelHandlers, OWNER_PRIVILEGES, pushDiff, rawInstance } from './instances'
import { inDays, shellHandlers } from './shell'

// Shared building blocks of the instance page (S-10 instance-general): the frame (top bar, tabs, title) and the General screen.
// Not a spec file (testMatch is `*.parity.ts`). Plan: context/changes/instance-general/plan.md, "Harness ramy".
//
// Legacy locators prefer the legacy classes (`.top-bar-title__button`, `.instance-domain-link`, `.top-bar__item`, `.subinstance-bar__*`).
// Next uses the `instance-*` / `top-bar-*` data-testid vocabulary (`instance-title`, `instance-url`, `instance-change-domain`,
// `instance-tab-<key>`, `top-bar-<action>`) and the same legacy classes where next keeps them.

/** The privileges of a full owner plus the ones the frame, top bar and General read (`OWNER_PRIVILEGES` lacks them). */
export const INSTANCE_PAGE_PRIVILEGES = [
  ...OWNER_PRIVILEGES,
  'general.view_reports',
  'general.change_domain',
  'general.push_to_staging',
  'general.view_logs',
  'general.update_site_name',
  'hosting.control_panel_sso',
  'hosting.manage_ssl',
  'wordpress.manage_backups',
  'wordpress.manage_auto_backup',
  'wordpress.manage_plugins',
  // Read by the Security screen (S-94 ui-instance-security): without it the indexing card is absent.
  'wordpress.manage_search_engine_indexing',
  'wordpress.manage_maintenance_mode',
  'wordpress.manage_debug_mode',
  'wordpress.update_site_name',
]

/** Matches the DNS answer below, so the legacy check stays silent and the "Change domain" button shows, not "DNS propagation". */
export const INSTANCE_PAGE_IP = '203.0.113.10'

/**
 * A `GET /instances/{id}` body for the frame and the General screen: the list fields of `rawInstance` plus the fields the frame and
 * General read. `overrides` replace fields one level deep.
 */
export function instancePageRaw (id = 1, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return rawInstance(id, {
    name: 'Studio Blog',
    url: 'https://studio.example.com',
    domain: 'studio.example.com',
    privileges: INSTANCE_PAGE_PRIVILEGES,
    // Lite shows the top bar's Admin Area only for a project whose engine reports it.
    supports_admin_sso: true,
    host_ip_address: INSTANCE_PAGE_IP,
    host_ipv4_addresses: [INSTANCE_PAGE_IP],
    // Legacy reads `instance.info` for the content of the top bar; without it the bar renders nothing.
    info: { plugins: { errors: 0 } },
    health_checks: { report_provider: { status: 'ok', message: null } },
    automatic_backups_editable: true,
    performance_score: { score: 78, desktop: 0.82, mobile: 0.74, desktop_score: 82, mobile_score: 74, updated_at: inDays(-1) },
    server_settings: { uses_own_backup_system: false },
    dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any', display_options: [], valid_cname_addresses: [] },
    plan_settings: { copy_instance_allowed: true, dns_management_enabled: false, domain_for_staging: { type: 'any_domain' } },
    ...overrides,
  })
}

/** The DNS answer the legacy and next SetYourDomain check read: the A record of the host matches the IP. */
export const INSTANCE_PAGE_DNS = {
  json: { Status: 0, Answer: [{ name: 'studio.example.com.', type: 1, TTL: 300, data: INSTANCE_PAGE_IP }] },
}

/** The staging copy 41 of instance 1, as the live page lists it in `staging_apps`. `overrides` replace fields one level deep. */
export function stagingCopy (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return rawInstance(41, {
    name: 'Studio staging',
    url: 'https://staging.studio.example.com',
    domain: 'staging.studio.example.com',
    staging: true,
    ...overrides,
  })
}

/** An `async_status` with the installation in `installation` and every other action idle. */
export function installationStatus (installation: string | null): Record<string, string | null> {
  return { installation, update: null, push_to_live: null, pull_from_staging: null, push_to_staging: null }
}

/** Handlers of the instance page the frame and General request. `extra` overrides any key. */
export function instancePageHandlers (extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...shellHandlers([], 'instances'),
    ...labelHandlers,
    'GET /instances/1': { json: { data: instancePageRaw() } },
    'GET /projects/1/source': { json: { data: null } },
    'GET /instances/1/wordpress/maintenance-mode': { json: { status: false } },
    'GET /instances/1/wordpress/debug-mode': { json: { status: false } },
    'GET /instances/1/wordpress/automatic-backup': { json: { data: { enabled: true } } },
    'GET /instances/1/push-to-live': pushDiff,
    // General's analytics (Phase 11 fills real data); empty payloads keep the frame state free of unmatched requests.
    'GET /instances/1/reporting/visitors/last-week': {
      json: { data: { visits: { records: [], total: 0, previous_total: 0 }, visits_length: { records: [], total: 0, previous_total: 0 } } },
    },
    'GET /instances/1/reporting/bandwidth/last-week': { json: { data: { records: [], total: 0 } } },
    'GET /server-accounts/1/ssl/certificate/detected': {
      json: { data: { not_before: inDays(-30), self_signed: false, name_match: true, issuer_name: 'Example CA' } },
    },
    ...extra,
  }
}

/** Daily points of a report, keyed by date from 1 September 2026 (the `records` of the reporting API). Shared by the frame and Monitoring. */
export function dailyRecords (values: number[]): Record<string, number> {
  return Object.fromEntries(values.map((value, index) => [`2026-09-${String(index + 1).padStart(2, '0')}`, value]))
}

/** Frame GET answers from the instance state: holds the request (loading), fulfils it (default). */
export const holdInstance: Handler = 'hold'

/** The top bar's readiness anchor: the title of the instance (legacy `h1.top-bar-title__button`, next `instance-title`). */
export const instanceTitleProbe: Probe = {
  key: 'instance-title',
  legacy: page => page.locator('h1.top-bar-title__button'),
  next: page => page.getByTestId('instance-title'),
}

export const instanceUrlProbe: Probe = {
  key: 'instance-url',
  legacy: page => page.locator('.instance-domain-link'),
  next: page => page.getByTestId('instance-url'),
}

export const instanceChangeDomainProbe: Probe = {
  key: 'instance-change-domain',
  legacy: page => page.locator('.v-btn', { hasText: trPattern('button.setDomain.changeDomain', 'lite') }).first(),
  next: page => page.getByTestId('instance-change-domain'),
}

/**
 * One vertical action button of the top bar (layout B). Legacy `BaseIconButton` renders `.v-btn--vertical` on every button; the
 * `.top-bar__btn` class is only passed by some call sites (not Cache), so it cannot select them all. Matched by the legacy copy key;
 * next has a testid.
 */
/**
 * A vertical action button of the top bar, measured on its label. The button root carries Vuetify's own text colour, which the
 * visible icon and label override (V2 `--text` classes, V4 `text-*`), so the root colour is not what the user sees.
 */
export function topBarActionProbe (key: string, copyKey: string, testId: string, when?: Probe['when']): Probe {
  return {
    key: `top-bar-${key}`,
    legacy: page => page.locator('.v-btn--vertical', { hasText: trPattern(copyKey, 'lite') }).first().locator('.v-btn__text'),
    next: page => page.getByTestId(testId).locator('.v-btn__text'),
    ...(when === undefined ? {} : { when }),
  }
}

/** One tab of the instance page, by its legacy label key. Legacy `.top-bar__item`, next `instance-tab-<key>`. */
export function instanceTabProbe (key: 'general' | 'backups' | 'plugins' | 'advanced', labelKey: string): Probe {
  return {
    key: `instance-tab-${key}`,
    legacy: page => page.locator('.top-bar__item', { hasText: trPattern(labelKey, 'lite') }).first(),
    next: page => page.getByTestId(`instance-tab-${key}`),
  }
}

/** The live tab of the subinstance bar. Both apps keep the `.subinstance-bar__item` class. */
export const liveSubinstanceProbe: Probe = {
  key: 'subinstance-live',
  legacy: page => page.locator('.subinstance-bar__item').first(),
  next: page => page.locator('.subinstance-bar__item').first(),
}

/** The `+` of the subinstance bar (no staging yet). */
export const subinstanceAddProbe: Probe = {
  key: 'subinstance-add',
  legacy: page => page.locator('.subinstance-bar__add').first(),
  next: page => page.locator('.subinstance-bar__add').first(),
}

/**
 * Loading: the top bar's skeleton. Legacy `TopBarSkeleton` has no Vuetify skeleton loader, so the anchor is the container both apps
 * render inside `.top-bar`.
 */
export const topBarSkeletonProbe: Probe = {
  key: 'topbar-skeleton',
  legacy: page => page.locator('.top-bar .top-bar__container').first(),
  next: page => page.locator('.top-bar .top-bar__container').first(),
}

/** Masks the page under the frame: the router-view area (the General screen) is not measured here, only the frame around it. */
export const framePageMasks: NonNullable<ParityState['masks']> = {
  legacy: [(page: Page) => page.locator('.v-divider + .px-6 > *')],
  next: [(page: Page) => page.getByTestId('instance-page-content').locator(':scope > *')],
}

/** Waits for the instance title on both apps before the probes run. */
export const waitForInstanceTitle: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('h1.top-bar-title__button'))],
  next: [waitFor(page => page.getByTestId('instance-title'))],
}
