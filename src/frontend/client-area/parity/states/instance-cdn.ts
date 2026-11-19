import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { alertProbes, settled, tr, trPattern } from './auth'
import { ADVANCED_PRIVILEGES, ADVANCED_PROJECT_ID, advancedActiveItemProbe, advancedFrameHandlers, advancedInstance } from './instance-advanced-frame'
import { liteShellHome } from './instances'
import { NOW } from './shell'

// S-93 ui-instance-cdn: the CDN page of a project (`/projects/:id/advanced/cdn`), measured on app-lite (`target: 'lite'`, M-2 default).
// Not a spec file (testMatch is `*.parity.ts`). States and their registration: `instance-cdn.parity.ts`. Plan: context/changes/
// ui-instance-cdn/plan.md ("Phase 5"). The page sits in the Advanced frame, whose handlers it reuses (`advancedFrameHandlers`); its API
// calls are `/projects/41/cdn/*` on lite (the API layer maps `/instances/` to `/projects/` on single-server).

/** The page path of the states (the project of the Advanced frame states). */
export const CDN_PATH = `/projects/${ADVANCED_PROJECT_ID}/advanced/cdn`

/** The CDN API prefix of the handlers (the view calls `/instances/41/cdn/*`, mapped to `/projects/41/cdn/*` on single-server). */
export const CDN_API = `/projects/${ADVANCED_PROJECT_ID}/cdn`

/** Privilege that shows the CDN sidebar item and lets the page load (`advanced-sidebar-items.ts:83`). */
const CDN_PRIVILEGE = 'general.manage_cdn'

/**
 * The `GET /projects/41` body of the CDN page: the Advanced frame project with the CDN privilege and a plan that has a CDN
 * (`plan_settings.cdn.provider_slug`). The rest of `plan_settings` is kept as the Details fixture has it.
 */
export function cdnInstance (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  // `plan_settings` is merged, not replaced: a state changes `cdn` and keeps the rest of the plan fixture.
  const { plan_settings: planOverride, ...rest } = overrides
  return advancedInstance([...ADVANCED_PRIVILEGES, CDN_PRIVILEGE], {
    cdn_enabled: true,
    plan_settings: {
      copy_instance_allowed: true,
      dns_management_enabled: false,
      domain_for_staging: { type: 'any_domain' },
      cdn: { provider_slug: 'cloudflare' },
      ...(planOverride as Record<string, unknown> | undefined),
    },
    ...rest,
  })
}

/**
 * `GET /projects/41/cdn/status` body (`cdn.api.ts`, the response is read as is): Under Attack off and three features, two with a title
 * and one without (the label then falls back to its name, `cdnFeatureLabel`).
 */
export const CDN_STATUS = {
  under_attack_mode: false,
  features: [
    { name: 'waf', title: 'Web Application Firewall' },
    { name: 'force_https' },
    { name: 'ddos_protection', title: 'DDoS Protection' },
  ],
}

/**
 * `GET /projects/41/cdn/status` with Under Attack on (Phase 11): the same features as `CDN_STATUS`, the switch of the Under Attack card is ON.
 */
export const CDN_STATUS_UNDER_ATTACK = {
  under_attack_mode: true,
  features: CDN_STATUS.features,
}

/** `GET /projects/41/cdn/status` without features (Phase 9): the features card keeps its title and an empty list. */
export const CDN_STATUS_EMPTY = {
  under_attack_mode: false,
  features: [],
}

/**
 * Handlers of the CDN page: the Advanced frame plus the project GET (CDN plan) and the status GET. `overrides` replace any key, so a state
 * changes one call without losing the rest.
 */
export function cdnHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: cdnInstance() } },
    [`GET ${CDN_API}/status`]: { json: CDN_STATUS },
    ...overrides,
  })
}

/**
 * Handlers of the plan without a CDN (Phase 7): the frame and the project GET with `provider_slug: 'none'`. No status handler is
 * registered, because the view sends no status request without a CDN; an unanswered request would show in `unmatched API requests`.
 */
export function cdnDisabledHandlers (): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: cdnInstance({ plan_settings: { cdn: { provider_slug: 'none' } } }) } },
  })
}

// ---------------------------------------------------------------------------------------------
// Locators. The cards are found by their title (`h6`), the copy is the lite fixture's (`heading.instance.advanced.cdn.*`).
// ---------------------------------------------------------------------------------------------

export const PURGE_TITLE = 'heading.instance.advanced.cdn.purge.title'
export const UNDER_ATTACK_TITLE = 'heading.instance.advanced.cdn.under-attack.title'
export const FEATURES_TITLE = 'heading.instance.advanced.cdn.features.title'

/** The card whose `h6` carries the copy key's title (the Purge, Under Attack and Always-On cards). */
function cardByTitle (page: Page, key: string): Locator {
  return page.locator('.v-card', { has: page.locator('h6', { hasText: trPattern(key, 'lite') }) }).first()
}

/** The switch of the Under Attack card: the V2 input wrapper on legacy, the V4 control wrapper on next (as `instance-cloudflare.ts`). */
function underAttackSwitch (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? cardByTitle(page, UNDER_ATTACK_TITLE).locator('.v-input--selection-controls__input').first()
    : cardByTitle(page, UNDER_ATTACK_TITLE).locator('.v-selection-control__wrapper').first()
}

// ---------------------------------------------------------------------------------------------
// Probes. The title is the readiness anchor; the three cards follow, then the Purge button and its alert, the switch, the feature list.
// ---------------------------------------------------------------------------------------------

export const cdnTitleProbe: Probe = {
  key: 'cdn-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export const cdnPurgeCardProbe: Probe = {
  key: 'cdn-card-purge',
  legacy: page => cardByTitle(page, PURGE_TITLE),
  next: page => cardByTitle(page, PURGE_TITLE),
}

export const cdnUnderAttackCardProbe: Probe = {
  key: 'cdn-card-under-attack',
  legacy: page => cardByTitle(page, UNDER_ATTACK_TITLE),
  next: page => cardByTitle(page, UNDER_ATTACK_TITLE),
}

export const cdnFeaturesCardProbe: Probe = {
  key: 'cdn-card-features',
  legacy: page => cardByTitle(page, FEATURES_TITLE),
  next: page => cardByTitle(page, FEATURES_TITLE),
}

/** The Purge button of the Purge card (icon and label; its colour is the button's own). */
export const cdnPurgeButtonProbe: Probe = {
  key: 'cdn-purge-button',
  legacy: page => cardByTitle(page, PURGE_TITLE).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
  next: page => cardByTitle(page, PURGE_TITLE).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
}

/** The Purge card's alert (`AlertSm`). */
export const cdnPurgeAlertProbe: Probe = {
  key: 'cdn-purge-alert',
  legacy: page => cardByTitle(page, PURGE_TITLE).locator('.alert-sm').first(),
  next: page => cardByTitle(page, PURGE_TITLE).locator('.alert-sm').first(),
}

/** The Under Attack switch (its control, off on the default state). */
export const cdnUnderAttackSwitchProbe: Probe = {
  key: 'cdn-under-attack-switch',
  legacy: page => underAttackSwitch(page, 'legacy'),
  next: page => underAttackSwitch(page, 'next'),
}

/** The `.switch-container` of the Under Attack card (the click target of the switch, Phase 11: the ON track and thumb are measured in it). */
export const cdnUnderAttackSwitchContainerProbe: Probe = {
  key: 'cdn-under-attack-switch-container',
  legacy: page => cardByTitle(page, UNDER_ATTACK_TITLE).locator('.switch-container').first(),
  next: page => cardByTitle(page, UNDER_ATTACK_TITLE).locator('.switch-container').first(),
}

/** The feature list: the first row (check icon and title). */
export const cdnFeatureItemProbe: Probe = {
  key: 'cdn-feature-item',
  legacy: page => cardByTitle(page, FEATURES_TITLE).locator('.v-list-item').first(),
  next: page => cardByTitle(page, FEATURES_TITLE).locator('.v-list-item').first(),
}

/** The feature list itself (Phase 9): its box, which stays on an empty status answer. */
export const cdnFeatureListProbe: Probe = {
  key: 'cdn-feature-list',
  legacy: page => cardByTitle(page, FEATURES_TITLE).locator('.v-list').first(),
  next: page => cardByTitle(page, FEATURES_TITLE).locator('.v-list').first(),
}

/** The probes of the default state, the readiness anchor first. The sidebar's active item is the CDN entry (`advancedActiveItemProbe`). */
export const cdnDefaultProbes: Probe[] = [
  cdnTitleProbe,
  cdnPurgeCardProbe,
  cdnUnderAttackCardProbe,
  cdnFeaturesCardProbe,
  cdnPurgeButtonProbe,
  cdnPurgeAlertProbe,
  cdnUnderAttackSwitchProbe,
  cdnFeatureItemProbe,
  advancedActiveItemProbe,
]

/** The probes of the Under Attack ON state (Phase 11): the default probes plus the switch container, so the ON track and thumb are compared. */
export const cdnUnderAttackOnProbes: Probe[] = [
  ...cdnDefaultProbes,
  cdnUnderAttackSwitchContainerProbe,
]

/**
 * The probes of the plan without a CDN: the same cards and controls, and the features card, which the view does not render. Absent on
 * both apps is agreement (`run-state.ts`), so the features probe checks that neither app shows it.
 */
export const cdnDisabledProbes: Probe[] = [
  cdnTitleProbe,
  cdnPurgeCardProbe,
  cdnUnderAttackCardProbe,
  cdnFeaturesCardProbe,
  cdnPurgeButtonProbe,
  cdnPurgeAlertProbe,
  cdnUnderAttackSwitchProbe,
  advancedActiveItemProbe,
]

// ---------------------------------------------------------------------------------------------
// Error (Phase 8). The POST answers with an error: the purge 500, the under-attack switch 422. The error alert is the readiness anchor.
// ---------------------------------------------------------------------------------------------

/** The refused purge: `POST /projects/41/cdn/purge` answers 500 (`getErrorMessage` reads `message`). */
export const CDN_PURGE_REFUSED_MESSAGE = 'Server Error'

/** The refused under-attack switch: `POST /projects/41/cdn/under-attack` answers 422. */
export const CDN_UNDER_ATTACK_REFUSED_MESSAGE = 'The given data was invalid.'

export const cdnPurgeFailureHandler: Record<string, Handler> = {
  [`POST ${CDN_API}/purge`]: { status: 500, json: { message: CDN_PURGE_REFUSED_MESSAGE } },
}

export const cdnUnderAttackFailureHandler: Record<string, Handler> = {
  [`POST ${CDN_API}/under-attack`]: { status: 422, json: { message: CDN_UNDER_ATTACK_REFUSED_MESSAGE } },
}

/** The error alert of the alert stack (`.alert--error`): the same locator in both apps, as the Cloudflare error states use it. */
export const cdnErrorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/** The purge modal box: a `BasicModal` (`.basic-modal`) found by its info text. Same box on both apps. */
export function purgeModalBox (page: Page): Locator {
  return page.locator('.basic-modal').filter({ hasText: trPattern('heading.instance.advanced.cdn.modal.purge.info', 'lite') })
}

/**
 * Clicks the Purge button of the Purge card (`evaluate`, so the click reaches the Vue handler without scrolling; the clock moves on first,
 * as the other Vue 3 wrapper clicks do).
 */
export function openPurgeModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const probe = app === 'legacy' ? cdnPurgeButtonProbe.legacy : cdnPurgeButtonProbe.next
    await probe(page).evaluate((element: HTMLElement) => element.click())
  }
}

/** Waits until the purge modal box is visible and its position has settled (the dialog transition has ended). */
export const waitForPurgeModal: StateAction = async page => {
  await settled(purgeModalBox(page))
}

/** Clicks the submit (Purge) button in the open modal (`evaluate`, the clock moves on first). */
export function confirmPurge (): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 120_000))
    await purgeModalBox(page).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }).evaluate((element: HTMLElement) => element.click())
  }
}

/** Waits for the modal to close: legacy and next close it in the `finally` of the purge, after the refused POST. */
export const waitForPurgeModalClosed: StateAction = async page => {
  await purgeModalBox(page).first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined)
}

/**
 * Clicks the Under Attack switch (`evaluate` on its `.switch-container`, the clock moves on first). The switch is found in the card by its
 * title, as the other probes of the page.
 */
export function clickUnderAttackSwitch (): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    await cardByTitle(page, UNDER_ATTACK_TITLE).locator('.switch-container').first().evaluate((element: HTMLElement) => element.click())
  }
}

/**
 * Holds the error toast: a hover on its text stops the auto-dismiss timer on both apps (lessons, "Toast z timerem"). The state's
 * `pointer: 'keep'` keeps the pointer there for the capture.
 */
export const holdCdnErrorAlert: StateAction = async page => {
  await cdnErrorAlert(page).locator('.alert__text-box').first().hover()
}

/** The purge error probes: the alert (readiness anchor), the title, the Purge card and its button (no loader), and no visible dialog. */
export const cdnPurgeErrorProbes: Probe[] = [
  ...alertProbes(cdnErrorAlert),
  cdnTitleProbe,
  cdnPurgeCardProbe,
  cdnPurgeButtonProbe,
  // Visible dialog only: the legacy V2 dialog stays in the DOM hidden after it closes, and only the visible box is the modal.
  { key: 'cdn-purge-dialog-absent', legacy: page => purgeModalBox(page).filter({ visible: true }), next: page => purgeModalBox(page).filter({ visible: true }) },
]

/**
 * The probes of the open purge modal (Phase 12, default): the box (`card-width-560`, 560 px), its icon, title, text, the close button,
 * the Purge and Cancel actions. Only the dialog is read; the card behind it is not probed here.
 */
export const cdnPurgeModalProbes: Probe[] = [
  { key: 'cdn-purge-modal', legacy: purgeModalBox, next: purgeModalBox },
  {
    key: 'cdn-purge-modal-icon',
    legacy: page => purgeModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
    next: page => purgeModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
  },
  {
    key: 'cdn-purge-modal-title',
    legacy: page => purgeModalBox(page).locator('h6').first(),
    next: page => purgeModalBox(page).locator('h6').first(),
  },
  {
    key: 'cdn-purge-modal-text',
    legacy: page => purgeModalBox(page).locator('.v-card__text, .v-card-text').first(),
    next: page => purgeModalBox(page).locator('.v-card__text, .v-card-text').first(),
  },
  {
    key: 'cdn-purge-modal-close',
    legacy: page => purgeModalBox(page).locator('.v-card__title, .v-card-title').first().getByRole('button').first(),
    next: page => purgeModalBox(page).locator('.v-card__title, .v-card-title').first().getByRole('button').first(),
  },
  {
    key: 'cdn-purge-modal-submit',
    legacy: purgeModalSubmit,
    next: purgeModalSubmit,
  },
  {
    key: 'cdn-purge-modal-cancel',
    legacy: page => purgeModalBox(page).getByRole('button', { name: trPattern('button.cancel', 'lite') }),
    next: page => purgeModalBox(page).getByRole('button', { name: trPattern('button.cancel', 'lite') }),
  },
]

/** The under-attack error probes: the alert (readiness anchor), the title, the Under Attack card and its switch (OFF, no loader). */
export const cdnUnderAttackErrorProbes: Probe[] = [
  ...alertProbes(cdnErrorAlert),
  cdnTitleProbe,
  cdnUnderAttackCardProbe,
  cdnUnderAttackSwitchProbe,
]

// ---------------------------------------------------------------------------------------------
// Readiness: the status answer has arrived (the features card is rendered only after it, and the skeleton is gone).
// ---------------------------------------------------------------------------------------------

async function cdnReady (page: Page): Promise<void> {
  await cardByTitle(page, FEATURES_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
  await cardByTitle(page, PURGE_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
}

export const cdnCardsReady: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [cdnReady],
  next: [cdnReady],
}

/**
 * The plan without a CDN (Phase 7): no status request and no features card, so the readiness is the two cards that stay (no skeleton
 * is shown either: the view fetches nothing when the plan has no CDN, `CDN:142-147`).
 */
async function cdnDisabledReady (page: Page): Promise<void> {
  await cardByTitle(page, UNDER_ATTACK_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
  await cardByTitle(page, PURGE_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
}

export const cdnDisabledCardsReady: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [cdnDisabledReady],
  next: [cdnDisabledReady],
}

/**
 * The empty status (Phase 9): the default probes without the first feature row, plus the list box. The features card keeps its title.
 */
export const cdnEmptyProbes: Probe[] = [
  cdnTitleProbe,
  cdnPurgeCardProbe,
  cdnUnderAttackCardProbe,
  cdnFeaturesCardProbe,
  cdnFeatureListProbe,
  cdnPurgeButtonProbe,
  cdnPurgeAlertProbe,
  cdnUnderAttackSwitchProbe,
  advancedActiveItemProbe,
]

/**
 * Readiness of the empty status: the features card is shown and the status request has finished (no skeleton left on the page). With no
 * skeleton the wait resolves at once, so the state waits only while the request is pending.
 */
async function cdnEmptyReady (page: Page): Promise<void> {
  await cardByTitle(page, FEATURES_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
  await cardByTitle(page, PURGE_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('.v-skeleton-loader').first().waitFor({ state: 'detached', timeout: 20_000 })
}

export const cdnEmptyCardsReady: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [cdnEmptyReady],
  next: [cdnEmptyReady],
}

// ---------------------------------------------------------------------------------------------
// Loading (Phase 10). The status GET is held: the Purge and Under Attack cards are skeletons (`CDN:13,43`), the features card stays with
// its empty list (`CDN:65`, shown by the plan alone). The purge POST is held: the dialog is persistent and both Purge buttons show a loader.
// ---------------------------------------------------------------------------------------------

/** The cards container below the title: the V2 `.container` on legacy, the V4 `.v-container` on next (as `instance-cloudflare.ts`). */
export const cdnCardsContainerProbe: Probe = {
  key: 'cdn-cards',
  legacy: page => page.locator('.page-title + .container'),
  next: page => page.locator('.page-title + .v-container'),
}

/** A card of the cards container by its index (0 Purge, 1 Under Attack, 2 features): the skeleton of the first two while loading. */
function cdnCardProbe (index: number): Probe {
  return {
    key: `cdn-card-${index}`,
    legacy: page => page.locator('.page-title + .container .v-card').nth(index),
    next: page => page.locator('.page-title + .v-container .v-card').nth(index),
  }
}

/** The loading probes: the title (readiness anchor), the cards container, the two skeleton cards, the features card and its list, the sidebar. */
export const cdnLoadingProbes: Probe[] = [
  cdnTitleProbe,
  cdnCardsContainerProbe,
  cdnCardProbe(0),
  cdnCardProbe(1),
  cdnFeaturesCardProbe,
  cdnFeatureListProbe,
  advancedActiveItemProbe,
]

/** Readiness of the held status: the title and a skeleton are on the page, and the features card is shown with its empty list. */
async function cdnLoadingReady (page: Page): Promise<void> {
  await page.locator('.page-title__title').waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('.v-skeleton-loader').first().waitFor({ state: 'visible', timeout: 20_000 })
  await cardByTitle(page, FEATURES_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
}

export const cdnLoadingCardsReady: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [cdnLoadingReady],
  next: [cdnLoadingReady],
}

/** The Purge button of the open dialog (its submit): the same name as the card's button, found inside the dialog box. */
function purgeModalSubmit (page: Page): Locator {
  return purgeModalBox(page).getByRole('button', { name: tr('button.purge', 'lite'), exact: true })
}

/** The purge loading probes: the title, the Purge card and its button (loader), the open dialog and its submit button (loader). */
export const cdnPurgeLoadingProbes: Probe[] = [
  cdnTitleProbe,
  cdnPurgeCardProbe,
  cdnPurgeButtonProbe,
  // Visible dialog only, as the purge error probes: the legacy V2 dialog stays in the DOM hidden after it closes.
  { key: 'cdn-purge-dialog', legacy: page => purgeModalBox(page).filter({ visible: true }), next: page => purgeModalBox(page).filter({ visible: true }) },
  { key: 'cdn-purge-dialog-submit', legacy: purgeModalSubmit, next: purgeModalSubmit },
  advancedActiveItemProbe,
]

/** Waits until the held purge shows its loader on the card's Purge button (the POST is in flight, the dialog is still open). */
export const cdnPurgePending: StateAction = async page => {
  await cardByTitle(page, PURGE_TITLE).locator('.v-btn--loading').first().waitFor({ state: 'visible', timeout: 20_000 })
}

/** The default state's base: the CDN plan, the status answer, the Under Attack switch off. Each state spreads it. */
export const CDN_DEFAULT_BASE = {
  path: CDN_PATH,
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
}
