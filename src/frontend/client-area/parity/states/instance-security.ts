import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { alertProbes, trPattern } from './auth'
import { waitFor } from './hosting'
import { liteSslOffers } from './hosting-domains'
import { INSTANCE_PAGE_PRIVILEGES, instancePageHandlers, instancePageRaw } from './instance'
import { liteShellHome } from './instances'
import { NOW, shellHandlers } from './shell'

// S-94 ui-instance-security: the Security page of a project on app-lite (`/projects/:id/advanced/security`, `target: 'lite'`). Not a spec file
// (testMatch is `*.parity.ts`). States: `instance-security.parity.ts`. Plan: context/changes/ui-instance-security/plan.md.
// `toProjectRoutes` is a local copy (as in `instance-plugins.ts`): nothing is exported from that file.

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Plugins states do). */
const { admin: _styleManagerAdmin, ...liteHomeWithoutAdmin } = liteShellHome()
export const SECURITY_HOME: Record<string, unknown> = liteHomeWithoutAdmin

/** The domain of the project (`instancePageRaw`): the SSL settings are keyed by it. */
export const SECURITY_DOMAIN = 'studio.example.com'

/** The `/projects` form of the handler keys: single server rewrites the `/instances` segment (`utils/resourcePaths.js`), as `onLite` does. */
function toProjectRoutes (handlers: Record<string, Handler>): Record<string, Handler> {
  const routed: Record<string, Handler> = {}
  for (const [key, handler] of Object.entries(handlers)) {
    routed[key.replace(/^(\S+) \/instances(?=[/?]|$)/, '$1 /projects')] = handler
  }
  return routed
}

/** The app-health answer of a project that runs fine (`GET /projects/{id}/app-health`, as the frame states answer it). */
const APP_HEALTH_OK: Handler = {
  json: { data: { available: true, healthy: true, serving: 'ok', ports: [{ port: 8000, status: 'ok', http_code: 200, detail: 'HTTP 200' }], checks: [] } },
}

/** The detected certificate of the default state: a trusted one issued by Example CA (`status: 'trusted'` is the Engine's verdict). */
export const TRUSTED_CERTIFICATE = {
  status: 'trusted',
  not_before: '2026-09-25T00:00:00Z',
  self_signed: false,
  name_match: true,
  issuer_name: 'Example CA',
}

type Patch = Record<string, unknown>

/** The `ssl/settings` body: HTTPS redirect allowed and on, a certificate installed, no other project on the domain. `patch` replaces fields. */
export function sslSettings (patch: Patch = {}): Record<string, unknown> {
  return {
    can_https_redirect: true,
    force_https_redirect: true,
    domain_shared_instances: [],
    certificate_installed: true,
    certificate: TRUSTED_CERTIFICATE,
    ...patch,
  }
}

/** The `GET …/ssl/certificate/detected` body for a certificate patch (null = no certificate). */
export function detectedCertificate (patch: Patch | null = {}): Record<string, unknown> {
  return { json: { data: patch === null ? null : { ...TRUSTED_CERTIFICATE, ...patch } } }
}

export interface SecurityFixtures {
  /** Fields of the `GET /projects/1` body (merged over the defaults; `privileges` defaults to the page set). */
  instance?: Patch
  /** Fields of `ssl/settings` (merged, not replaced). */
  settings?: Patch
  /** The detected certificate: a patch of the trusted one, or null for none. */
  certificate?: Patch | null
  /** The `disabled` flag of the indexing answer (true = indexing off, switch ON). */
  indexingDisabled?: boolean
}

/**
 * Every request the frame, the shell and the Security screen make on project 1 (the frame's `/instances/1` calls rewritten to `/projects`).
 * `fixtures` merge over the defaults (not replace, so a partial `settings` keeps the other fields); `overrides` replace any key, so a state
 * changes one call without losing the rest.
 */
export function securityHandlers (fixtures: SecurityFixtures = {}, overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...shellHandlers([], 'projects'),
    ...toProjectRoutes(instancePageHandlers({
      'GET /instances/1': { json: { data: instancePageRaw(1, { privileges: INSTANCE_PAGE_PRIVILEGES, ...fixtures.instance }) } },
    })),
    'GET /projects/1/app-health': APP_HEALTH_OK,
    // The deployed lite build asks for the deploy source of the project; next never does, so only legacy hits it.
    'GET /projects/1/source': { json: { data: null } },
    // The query (`?domain=`) is not part of the handler key.
    [`GET /server-accounts/1/ssl/settings/${SECURITY_DOMAIN}`]: { json: { data: sslSettings(fixtures.settings) } },
    'GET /server-accounts/1/ssl/certificate/detected': detectedCertificate(fixtures.certificate),
    'GET /projects/1/wordpress/search-engine-indexing': { json: { disabled: fixtures.indexingDisabled ?? false } },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Probes (plan "Critical Implementation Details"): the title is the readiness anchor with the three cards; the cards are measured on their
// heading (`h6`) and subtitle (`p`), the certificate label and `SslIndicator`, the Manage button and the switch containers.
// ---------------------------------------------------------------------------------------------

export const securityTitleProbe: Probe = {
  key: 'security-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

/** A card of the page by its title key (the `.v-card` that holds the `h6`). Legacy and next keep the same markup. */
export function securityCardProbe (key: string, titleKey: string): Probe {
  return {
    key,
    legacy: page => page.locator('.v-card', { has: page.locator('h6', { hasText: trPattern(titleKey, 'lite') }) }).first(),
    next: page => page.locator('.v-card', { has: page.locator('h6', { hasText: trPattern(titleKey, 'lite') }) }).first(),
  }
}

export const sslCardProbe = securityCardProbe('card-ssl', 'heading.instance.advanced.security.certificate.title')
export const httpsCardProbe = securityCardProbe('card-https', 'heading.instance.advanced.security.forceRedirect.title')
export const indexingCardProbe = securityCardProbe('card-indexing', 'heading.instance.advanced.security.disableSearchEngineIndexing.title')

/** The heading and the subtitle of the SSL card. */
export const sslHeadingProbe: Probe = {
  key: 'ssl-heading',
  legacy: page => sslCardProbe.legacy(page).locator('h6'),
  next: page => sslCardProbe.next(page).locator('h6'),
}

export const sslSubtitleProbe: Probe = {
  key: 'ssl-subtitle',
  legacy: page => sslCardProbe.legacy(page).locator('h6 + p'),
  next: page => sslCardProbe.next(page).locator('h6 + p'),
}

/** The certificate label and the SSL indicator next to it (`span.p-3` in both apps: the text and the lock). */
export const sslLabelProbe: Probe = {
  key: 'ssl-label',
  legacy: page => sslCardProbe.legacy(page).locator('span.p-3').first(),
  next: page => sslCardProbe.next(page).locator('span.p-3').first(),
}

export const sslIndicatorProbe: Probe = {
  key: 'ssl-indicator',
  legacy: page => sslCardProbe.legacy(page).locator('span.p-3 .v-icon').first(),
  next: page => sslCardProbe.next(page).locator('span.p-3 .v-icon').first(),
}

/** The Manage button of the SSL card: legacy by its label, next by its testid. */
export const sslManageProbe: Probe = {
  key: 'ssl-manage',
  legacy: page => sslCardProbe.legacy(page).locator('.v-btn', { hasText: trPattern('button.manage', 'lite') }).first(),
  next: page => page.getByTestId('security-ssl-manage'),
}

/** The switch container of a card (`ButtonSwitch`: no name and no role in either app, so it is found by card and class). */
export function switchProbe (key: string, card: Probe): Probe {
  return {
    key,
    legacy: page => card.legacy(page).locator('.switch-container').first(),
    next: page => card.next(page).locator('.switch-container').first(),
  }
}

export const httpsSwitchProbe = switchProbe('switch-https', httpsCardProbe)
export const indexingSwitchProbe = switchProbe('switch-indexing', indexingCardProbe)

/** Phase 8 (disabled): the wrapper of the HTTPS switch that carries `cursor-not-allowed` when the redirect is not allowed (ForceHttpsCard.vue:23). */
export const httpsDisabledWrapperProbe: Probe = {
  key: 'https-disabled-wrapper',
  legacy: page => httpsCardProbe.legacy(page).locator('.cursor-not-allowed').first(),
  next: page => httpsCardProbe.next(page).locator('.cursor-not-allowed').first(),
}

/** Phase 8 (disabled): the `v-switch` of the HTTPS card (`.v-switch` in Vuetify 4, `.v-input--switch` in Vuetify 2 legacy). */
export const httpsVSwitchProbe: Probe = {
  key: 'switch-https-v-switch',
  legacy: page => httpsCardProbe.legacy(page).locator('.v-switch, .v-input--switch').first(),
  next: page => httpsCardProbe.next(page).locator('.v-switch, .v-input--switch').first(),
}

/**
 * Phase 13 (no-privileges): the cards container under the title (`.page-title + .v-container`; Vuetify 2 legacy renders it as `.container`). The page has
 * no card without the privileges, so the container is measured empty.
 */
export const securityCardsContainerProbe: Probe = {
  key: 'cards-container',
  legacy: page => page.locator('.page-title + .container, .page-title + .v-container').first(),
  next: page => page.locator('.page-title + .v-container').first(),
}

export const securityProbes: Probe[] = [
  securityTitleProbe,
  sslCardProbe,
  httpsCardProbe,
  indexingCardProbe,
  sslHeadingProbe,
  sslSubtitleProbe,
  sslLabelProbe,
  sslIndicatorProbe,
  sslManageProbe,
  httpsSwitchProbe,
  indexingSwitchProbe,
]

// Masks: none in the default state (no timestamps, no avatars on the page). A masking need is decided at the first measurement.

/** The readiness anchor: the title and all three cards (the SSL and HTTPS cards leave their skeletons when both SSL requests are done). */
export const waitForCards: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [
    waitFor(page => page.locator('.page-title__title')),
    waitFor(page => page.locator('.v-card', { has: page.locator('h6') }).nth(2)),
  ],
  next: [
    waitFor(page => page.locator('.page-title__title')),
    waitFor(page => page.locator('.v-card', { has: page.locator('h6') }).nth(2)),
  ],
}

// ---------------------------------------------------------------------------------------------
// Phase 10 (error): the PUT of the HTTPS redirect answers 500 `{ message }`; the switch goes back to its saved position and the error alert shows.
// ---------------------------------------------------------------------------------------------

/** The refused save: the 500 body the error alert shows (`getErrorMessage` reads `message`). */
export const SECURITY_SAVE_REFUSED_MESSAGE = 'The SSL settings could not be saved.'

/** The PUT of the HTTPS redirect (`updateSslSettings`), refused by the server. */
export const securitySaveFailureHandler: Record<string, Handler> = {
  [`PUT /server-accounts/1/ssl/settings/${SECURITY_DOMAIN}`]: { status: 500, json: { message: SECURITY_SAVE_REFUSED_MESSAGE } },
}

/** The error alert of the alert stack (`.alert--error`): the same locator in both apps, as the Plugins states use it. */
export const securityErrorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/**
 * Clicks the HTTPS switch (the `ButtonSwitch` wrapper, found by card and class like the probe). The clock moves on first: a Vue 3 wrapper
 * `@click` ignores an event whose time is not later than the attach time, and the state clock is fixed (lessons, `instance-advanced-frame`).
 */
export function clickHttpsSwitch (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const probe = app === 'legacy' ? httpsSwitchProbe.legacy : httpsSwitchProbe.next
    await probe(page).click()
  }
}

/** The error alert probes (the alert, its icon, title and text), as in the Plugins error states. */
export const securityErrorProbes: Probe[] = alertProbes(securityErrorAlert)

// ---------------------------------------------------------------------------------------------
// Phase 11 (indexing-error): the PUT of the search-engine indexing answers 500 `{ message }`; the switch keeps its saved position (no local flip
// on failure, SearchEngineIndexingCard) and the error alert shows.
// ---------------------------------------------------------------------------------------------

/** The refused indexing save: the 500 body the error alert shows (`getErrorMessage` reads `message`). */
export const SECURITY_INDEXING_REFUSED_MESSAGE = 'The search engine indexing setting could not be saved.'

/** The PUT of the search-engine indexing (`security.api.ts:34-39`), refused by the server. */
export const securityIndexingFailureHandler: Record<string, Handler> = {
  'PUT /projects/1/wordpress/search-engine-indexing': { status: 500, json: { message: SECURITY_INDEXING_REFUSED_MESSAGE } },
}

/**
 * Clicks the indexing switch (the `ButtonSwitch` wrapper of the indexing card). The clock moves on first, as in `clickHttpsSwitch`: a Vue 3
 * wrapper `@click` ignores an event whose time is not later than the attach time (lessons, `instance-advanced-frame`).
 */
export function clickIndexingSwitch (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const probe = app === 'legacy' ? indexingSwitchProbe.legacy : indexingSwitchProbe.next
    await probe(page).click()
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 15 (shared-modal): the domain is shared with two other instances. Clicking the HTTPS switch opens the warning modal instead of
// saving (SecurityView `onHttpsToggle`, LITE Security.vue:372-378). The other instances are the ones whose id is not this project (1).
// ---------------------------------------------------------------------------------------------

/** The other instances on the domain (`domain_shared_instances`): two items, neither is project 1, so both show in the modal list. */
export const SECURITY_SHARED_INSTANCES = [
  { id: 2, name: 'Studio Shop', url: 'https://shop.example.com' },
  { id: 3, name: 'Studio Blog', url: 'https://blog.example.com' },
]

/**
 * Opens the shared-domain modal by the HTTPS switch. `evaluate` clicks the wrapper where it stands, so the page does not scroll
 * (lessons, `ui-settings-general`); the clock moves on first, as in `clickHttpsSwitch` (Vue 3 wrapper `@click`).
 */
export function openSharedDomainModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const probe = app === 'legacy' ? httpsSwitchProbe.legacy : httpsSwitchProbe.next
    await probe(page).evaluate((el: HTMLElement) => el.click())
  }
}

/**
 * The shared-domain modal box: a `BasicModal` (`.basic-modal`) found by its `info` text. The title alone is a generic word ("Warning"),
 * and the info text names the domain. Legacy and next keep the same text and the same `BasicModal` box.
 */
export function securitySharedModal (page: Page): Locator {
  return page.locator('.basic-modal').filter({ hasText: trPattern('heading.instance.advanced.security.modal.forceRedirect.info', 'lite') })
}

/**
 * Probes of the shared-domain modal: the box, the title, the info text, the list of the other instances and its first item (the bullet
 * is `::before` in both apps, so its colour is read from the pseudo-element), and the Cancel and Confirm buttons.
 */
export const securitySharedModalProbes: Probe[] = [
  {
    key: 'shared-modal-box',
    legacy: page => securitySharedModal(page),
    next: page => securitySharedModal(page),
  },
  {
    key: 'shared-modal-title',
    legacy: page => securitySharedModal(page).locator('.v-card__title, .v-card-title').first(),
    next: page => securitySharedModal(page).locator('.v-card__title, .v-card-title').first(),
    internal: true,
  },
  {
    key: 'shared-modal-list',
    legacy: page => securitySharedModal(page).locator('ul').first(),
    next: page => securitySharedModal(page).locator('ul').first(),
  },
  {
    key: 'shared-modal-item',
    legacy: page => securitySharedModal(page).locator('li').first(),
    next: page => securitySharedModal(page).locator('li').first(),
    pseudo: { legacy: '::before', next: '::before' },
  },
  {
    key: 'shared-modal-cancel',
    legacy: page => securitySharedModal(page).getByRole('button', { name: trPattern('button.cancel', 'lite') }),
    next: page => securitySharedModal(page).getByRole('button', { name: trPattern('button.cancel', 'lite') }),
  },
  {
    key: 'shared-modal-confirm',
    legacy: page => securitySharedModal(page).getByRole('button', { name: trPattern('button.confirm', 'lite') }),
    next: page => securitySharedModal(page).getByRole('button', { name: trPattern('button.confirm', 'lite') }),
  },
]

// ---------------------------------------------------------------------------------------------
// Phase 16 (ssl-modal): Manage opens `SslEditModal` (lite). The modal asks for the SSL offers and, since the card passes no certificate,
// for the installed and the detected certificate of the domain (`ssl-edit-modal.ts`, `SslEditModal.vue` `loadData`). The `error` of the
// modal belongs to the SSL kit, so this state is the default page with the modal open.
// ---------------------------------------------------------------------------------------------

/** The modal answers of the SSL card: the offers (`GET /ssl-offer`) and the installed certificate of the domain (the detected one is in the defaults). */
export const securitySslModalHandlers: Record<string, Handler> = {
  'GET /ssl-offer': { json: { data: liteSslOffers } },
  'GET /server-accounts/1/ssl/certificate/installed': { json: { data: TRUSTED_CERTIFICATE } },
}

/**
 * Clicks Manage of the SSL card (`evaluate`, the button may sit below the fold). The clock moves on first, as in the switch helpers.
 */
export function openSslManage (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const probe = app === 'legacy' ? sslManageProbe.legacy : sslManageProbe.next
    await probe(page).evaluate((el: HTMLElement) => el.click())
  }
}

/** The SSL modal box: the `.basic-modal` of the open dialog in legacy, the `SslEditModal` card (testid) in next. */
export const securitySslLegacyDialog = (page: Page): Locator => page.locator('.v-dialog--active .basic-modal')
export const securitySslNextDialog = (page: Page): Locator => page.getByTestId('ssl-edit-modal')

/** Probes of the SSL modal: the dialog, its title, its text, its actions and the primary button (the first action). */
export const securitySslModalProbes: Probe[] = [
  { key: 'ssl-modal', legacy: securitySslLegacyDialog, next: securitySslNextDialog },
  { key: 'ssl-modal-title', legacy: page => securitySslLegacyDialog(page).locator('.v-card__title'), next: page => securitySslNextDialog(page).locator('.v-card-title'), internal: true },
  { key: 'ssl-modal-text', legacy: page => securitySslLegacyDialog(page).locator('.v-card__text'), next: page => securitySslNextDialog(page).locator('.v-card-text'), internal: true },
  { key: 'ssl-modal-actions', legacy: page => securitySslLegacyDialog(page).locator('.v-card__actions'), next: page => securitySslNextDialog(page).locator('.v-card-actions'), internal: true },
  { key: 'ssl-modal-submit', legacy: page => securitySslLegacyDialog(page).locator('.v-card__actions .v-btn').first(), next: page => securitySslNextDialog(page).locator('.v-card-actions .v-btn').first(), internal: true },
]
