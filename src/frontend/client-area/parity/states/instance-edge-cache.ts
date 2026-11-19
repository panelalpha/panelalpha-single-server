import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { alertProbes, settled, tr, trPattern } from './auth'
import { ADVANCED_PRIVILEGES, ADVANCED_PROJECT_ID, advancedActiveItemProbe, advancedFrameHandlers, advancedInstance } from './instance-advanced-frame'
import { NOW } from './shell'

// S-92 ui-instance-edge-cache: the Edge Cache page of a project (`/projects/:id/advanced/edge-cache`), measured on app-lite (`target: 'lite'`,
// M-2 default). Not a spec file (testMatch is `*.parity.ts`). States and their registration: `instance-edge-cache.parity.ts`.
// Plan: context/changes/ui-instance-edge-cache/plan.md ("Critical Implementation Details"). The page sits in the Advanced frame, whose
// handlers it reuses (`advancedFrameHandlers`); its API calls are `/projects/41/wordpress/edge-cache/*` on lite (the API layer maps
// `/instances/` to `/projects/` on single-server).

/** The page path of the states (the project of the Advanced frame states). */
export const EDGE_CACHE_PATH = `/projects/${ADVANCED_PROJECT_ID}/advanced/edge-cache`

/** The edge cache API of the states (`edge-cache.api.ts`, rewritten to `/projects` on single-server). */
export const EDGE_CACHE_API = `/projects/${ADVANCED_PROJECT_ID}/wordpress/edge-cache`

/** The `GET /projects/41` body of the Edge Cache page: the Advanced frame project with the edge cache privilege on a WP Cloud server. */
export function edgeCacheInstance (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return advancedInstance([...ADVANCED_PRIVILEGES, 'wordpress.manage_edge_cache'], {
    hosting_server_type: 'wp-cloud',
    ...overrides,
  })
}

/**
 * Handlers of the page: the Advanced frame plus the edge cache GET (`{ isActive, isDefensiveMode }`, as `edge-cache.api.ts` reads it).
 * Default position: both switches off. `overrides` replace any key.
 */
export function edgeCacheHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: edgeCacheInstance() } },
    [`GET ${EDGE_CACHE_API}`]: { json: { isActive: false, isDefensiveMode: false } },
    ...overrides,
  })
}

// ---------------------------------------------------------------------------------------------
// Locators. The cards are found by their title (`h6`), the copy is the lite fixture's (`heading.instance.advanced.edge-cache.*`).
// ---------------------------------------------------------------------------------------------

export const MANAGE_TITLE = 'heading.instance.advanced.edge-cache.manage.title'
export const PURGE_TITLE = 'heading.instance.advanced.edge-cache.purge.title'
export const DEFENSIVE_TITLE = 'heading.instance.advanced.edge-cache.defensive-mode.title'

/** The card whose `h6` carries the copy key's title (the three cards of the page). */
function cardByTitle (page: Page, key: string): Locator {
  return page.locator('.v-card', { has: page.locator('h6', { hasText: trPattern(key, 'lite') }) }).first()
}

/** The switch of a card: the V2 input wrapper on legacy, the V4 control wrapper on next (the mapping of `ui-instance-cloudflare`). */
function cardSwitch (page: Page, key: string, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? cardByTitle(page, key).locator('.v-input--selection-controls__input').first()
    : cardByTitle(page, key).locator('.v-selection-control__wrapper').first()
}

// ---------------------------------------------------------------------------------------------
// Probes. The title is the readiness anchor; the cards follow, then the buttons, the alert, the two switches and the select.
// ---------------------------------------------------------------------------------------------

export const edgeCacheTitleProbe: Probe = {
  key: 'edge-cache-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export const edgeCacheManageCardProbe: Probe = {
  key: 'edge-cache-card-manage',
  legacy: page => cardByTitle(page, MANAGE_TITLE),
  next: page => cardByTitle(page, MANAGE_TITLE),
}

export const edgeCachePurgeCardProbe: Probe = {
  key: 'edge-cache-card-purge',
  legacy: page => cardByTitle(page, PURGE_TITLE),
  next: page => cardByTitle(page, PURGE_TITLE),
}

export const edgeCacheDefensiveCardProbe: Probe = {
  key: 'edge-cache-card-defensive',
  legacy: page => cardByTitle(page, DEFENSIVE_TITLE),
  next: page => cardByTitle(page, DEFENSIVE_TITLE),
}

/** The card titles (`h6`) of the three cards: the copy and the text colour of the card (D1). */
export const edgeCacheManageHeadingProbe: Probe = {
  key: 'edge-cache-heading-manage',
  legacy: page => cardByTitle(page, MANAGE_TITLE).locator('h6').first(),
  next: page => cardByTitle(page, MANAGE_TITLE).locator('h6').first(),
}

export const edgeCachePurgeHeadingProbe: Probe = {
  key: 'edge-cache-heading-purge',
  legacy: page => cardByTitle(page, PURGE_TITLE).locator('h6').first(),
  next: page => cardByTitle(page, PURGE_TITLE).locator('h6').first(),
}

export const edgeCacheDefensiveHeadingProbe: Probe = {
  key: 'edge-cache-heading-defensive',
  legacy: page => cardByTitle(page, DEFENSIVE_TITLE).locator('h6').first(),
  next: page => cardByTitle(page, DEFENSIVE_TITLE).locator('h6').first(),
}

/** The subtitle paragraph of the Manage card. */
export const edgeCacheManageTextProbe: Probe = {
  key: 'edge-cache-text-manage',
  legacy: page => cardByTitle(page, MANAGE_TITLE).locator('p').first(),
  next: page => cardByTitle(page, MANAGE_TITLE).locator('p').first(),
}

/** The Purge button of the Purge card (`button.purge`, the icon `$restore` and its label). */
export const edgeCachePurgeProbe: Probe = {
  key: 'edge-cache-purge',
  legacy: page => cardByTitle(page, PURGE_TITLE).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
  next: page => cardByTitle(page, PURGE_TITLE).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
}

/** The alert of the Purge card (`AlertSm`, the first one of the page). */
export const edgeCacheAlertProbe: Probe = {
  key: 'edge-cache-alert',
  legacy: page => cardByTitle(page, PURGE_TITLE).locator('.alert-sm').first(),
  next: page => cardByTitle(page, PURGE_TITLE).locator('.alert-sm').first(),
}

export const edgeCacheManageSwitchProbe: Probe = {
  key: 'edge-cache-manage-switch',
  legacy: page => cardSwitch(page, MANAGE_TITLE, 'legacy'),
  next: page => cardSwitch(page, MANAGE_TITLE, 'next'),
}

export const edgeCacheDefensiveSwitchProbe: Probe = {
  key: 'edge-cache-defensive-switch',
  legacy: page => cardSwitch(page, DEFENSIVE_TITLE, 'legacy'),
  next: page => cardSwitch(page, DEFENSIVE_TITLE, 'next'),
}

/** The divider between the defensive mode switch and its TTL select (shown while the mode is off). */
export const edgeCacheDividerProbe: Probe = {
  key: 'edge-cache-divider',
  legacy: page => cardByTitle(page, DEFENSIVE_TITLE).locator('.v-divider').first(),
  next: page => cardByTitle(page, DEFENSIVE_TITLE).locator('.v-divider').first(),
}

/** The TTL select of the defensive mode card (`v-select`, value 30 minutes). */
export const edgeCacheTtlSelectProbe: Probe = {
  key: 'edge-cache-ttl-select',
  legacy: page => cardByTitle(page, DEFENSIVE_TITLE).locator('.v-select').first(),
  next: page => cardByTitle(page, DEFENSIVE_TITLE).locator('.v-select').first(),
}

/** The probes of the default state, the readiness anchor first. The sidebar's active item is the Edge Cache entry (`advancedActiveItemProbe`). */
export const edgeCacheDefaultProbes: Probe[] = [
  edgeCacheTitleProbe,
  edgeCacheManageCardProbe,
  edgeCacheManageHeadingProbe,
  edgeCacheManageTextProbe,
  edgeCachePurgeCardProbe,
  edgeCachePurgeHeadingProbe,
  edgeCacheAlertProbe,
  edgeCachePurgeProbe,
  edgeCacheDefensiveCardProbe,
  edgeCacheDefensiveHeadingProbe,
  edgeCacheManageSwitchProbe,
  edgeCacheDefensiveSwitchProbe,
  edgeCacheDividerProbe,
  edgeCacheTtlSelectProbe,
  advancedActiveItemProbe,
]

/**
 * Readiness: the three cards are on the page (the skeletons are gone, so the GET of the switch positions has answered). The title alone
 * is not enough: the cards render after the GET.
 */
async function edgeCacheReady (page: Page): Promise<void> {
  await cardByTitle(page, MANAGE_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
  await cardByTitle(page, DEFENSIVE_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
}

export const edgeCacheCardsReady = {
  legacy: [edgeCacheReady],
  next: [edgeCacheReady],
}

// ---------------------------------------------------------------------------------------------
// Loading: the GET of the switch positions is held (Phase 9). The Manage and Defensive mode cards show `AutoUpdatesCardSkeleton`
// (`fetchingEdgeCache`, legacy `EdgeCache.vue:18,86`); the Purge card (`:55`) is shown without a skeleton.
// ---------------------------------------------------------------------------------------------

/** The cards container: `.page-title + .container` on legacy, `.page-title + .v-container` on next (as `cloudflareCardsContainerProbe`). */
export const edgeCacheCardsContainerProbe: Probe = {
  key: 'edge-cache-cards',
  legacy: page => page.locator('.page-title + .container'),
  next: page => page.locator('.page-title + .v-container'),
}

/** The skeleton cards of the loading state: the first (Manage) and the third (Defensive mode) card; the second (Purge) is not one. */
export const edgeCacheSkeletonProbes: Probe[] = [0, 2].map(index => ({
  key: `edge-cache-skeleton-card-${index}`,
  legacy: page => page.locator('.page-title + .container .v-card').nth(index),
  next: page => page.locator('.page-title + .v-container .v-card').nth(index),
}))

/** The loading state: the title (readiness anchor), the cards container, the two skeleton cards, then the Purge card (no skeleton). */
export const edgeCacheLoadingProbes: Probe[] = [edgeCacheTitleProbe, edgeCacheCardsContainerProbe, ...edgeCacheSkeletonProbes, edgeCachePurgeCardProbe]

// ---------------------------------------------------------------------------------------------
// Busy: the cache switch while its PUT is held (Phase 7). The matrix marks `disabled` N/A: the switch has `:loading` and no `:disabled`.
// ---------------------------------------------------------------------------------------------

/** The `.switch-container` of the Manage card: the element that carries the click handler on both apps (`ButtonSwitch` root). */
export const edgeCacheManageContainerProbe: Probe = {
  key: 'edge-cache-manage-container',
  legacy: page => cardByTitle(page, MANAGE_TITLE).locator('.switch-container').first(),
  next: page => cardByTitle(page, MANAGE_TITLE).locator('.switch-container').first(),
}

/** The busy state: the title, the Manage card, its switch container and its switch (loader, track colour, opacity). */
export const edgeCacheSwitchBusyProbes: Probe[] = [
  edgeCacheTitleProbe,
  edgeCacheManageCardProbe,
  edgeCacheManageContainerProbe,
  edgeCacheManageSwitchProbe,
]

/** The switch of the Manage card: the V2 switch on legacy, the V4 switch on next (the whole control). */
function manageSwitch (page: Page, app: 'legacy' | 'next'): Locator {
  return cardByTitle(page, MANAGE_TITLE).locator(app === 'legacy' ? '.v-input--switch' : '.v-switch').first()
}

/**
 * Clicks the cache switch (`evaluate`, so the click reaches the container's handler; the input has no pointer events on either app).
 * The clock moves on first (lessons: a Vue 3 wrapper `@click` needs a later event time).
 */
export function clickEdgeCacheSwitch (): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    await cardByTitle(page, MANAGE_TITLE).locator('.switch-container').first().evaluate((element: HTMLElement) => element.click())
  }
}

/**
 * The held save keeps the switch busy: its loader (`v-progress-circular` in the thumb, `EdgeCacheView.vue` `submittingEdgeCache`) is
 * visible on both apps. The input is not asserted: the legacy V2 input stays enabled while the PUT is held (as the cloudflare busy state).
 */
export function expectEdgeCacheSwitchBusy (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(manageSwitch(page, app).locator('.v-progress-circular').first(), `${app}: busy edge cache switch loader`).toBeVisible()
  }
}

// ---------------------------------------------------------------------------------------------
// Error: the cache switch's PUT answers 500 (Phase 8). The switch flips only after the server accepts the PUT, so it stays OFF with no
// loader; the error alert (`AlertManager`, the shared `.alert--error`) shows the body's `message` (`getErrorMessage` reads it).
// ---------------------------------------------------------------------------------------------

/** The refused cache save: the 500 body the error alert shows (`getErrorMessage` reads `message`). */
export const EDGE_CACHE_REFUSED_MESSAGE = 'Server Error'

/** The PUT of the cache switch answers 500; the GET of the switch positions is the default one (`edgeCacheHandlers`). */
export const edgeCacheFailureHandler: Record<string, Handler> = {
  [`PUT ${EDGE_CACHE_API}`]: { status: 500, json: { message: EDGE_CACHE_REFUSED_MESSAGE } },
}

/** The error alert of the alert stack (`.alert--error`): the same locator in both apps, as the cloudflare error states use it. */
export const edgeCacheErrorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/**
 * Holds the error alert on screen: it closes itself after 5 s unless the pointer is over it (`AlertMixin` `mouseover` stops the timer).
 * The action waits for the alert and hovers its text box; the state keeps the pointer there (`pointer: 'keep'`).
 */
export const hoverEdgeCacheErrorAlert: StateAction = async page => {
  await expect(edgeCacheErrorAlert(page), 'Harness error: edge cache error alert').toBeVisible()
  await edgeCacheErrorAlert(page).locator('.alert__text-box').hover()
}

/** The error state probes: the title, the Manage card, its switch container and switch (OFF, no loader), and the error alert. */
export const edgeCacheErrorProbes: Probe[] = [
  edgeCacheTitleProbe,
  edgeCacheManageCardProbe,
  edgeCacheManageContainerProbe,
  edgeCacheManageSwitchProbe,
  ...alertProbes(edgeCacheErrorAlert),
]

// ---------------------------------------------------------------------------------------------
// Cloudflare conflict (Phase 10): the cache is on (GET `isActive: true`) and the instance has DNS on Cloudflare, so the Manage card shows
// the `.warning-box` note under the switch (`EdgeCacheView.vue`, `cloudflareNoteShown`; legacy `EdgeCache.vue:40-47`). The `.warning-box`
// has no global rule on either app (`change.md` Notes, plan Faza 16 decides on a local one).
// ---------------------------------------------------------------------------------------------

/** The warning note under the cache switch of the Manage card. */
export const edgeCacheCloudflareNoteProbe: Probe = {
  key: 'edge-cache-cloudflare-note',
  legacy: page => cardByTitle(page, MANAGE_TITLE).locator('.warning-box').first(),
  next: page => cardByTitle(page, MANAGE_TITLE).locator('.warning-box').first(),
}

/** The alert icon of the note (`$alertcircle`, colour `warning`, 20 px). */
export const edgeCacheCloudflareNoteIconProbe: Probe = {
  key: 'edge-cache-cloudflare-note-icon',
  legacy: page => cardByTitle(page, MANAGE_TITLE).locator('.warning-box .v-icon').first(),
  next: page => cardByTitle(page, MANAGE_TITLE).locator('.warning-box .v-icon').first(),
}

/** The note text (`p-sm`, colour `warning`). */
export const edgeCacheCloudflareNoteTextProbe: Probe = {
  key: 'edge-cache-cloudflare-note-text',
  legacy: page => cardByTitle(page, MANAGE_TITLE).locator('.warning-box > span:last-child'),
  next: page => cardByTitle(page, MANAGE_TITLE).locator('.warning-box > span:last-child'),
}

/** The conflict state probes: the title, the Manage card with its heading and text, the switch (on), the note, its icon and text, the sidebar. */
export const edgeCacheCloudflareConflictProbes: Probe[] = [
  edgeCacheTitleProbe,
  edgeCacheManageCardProbe,
  edgeCacheManageHeadingProbe,
  edgeCacheManageTextProbe,
  edgeCacheManageSwitchProbe,
  edgeCacheCloudflareNoteProbe,
  edgeCacheCloudflareNoteIconProbe,
  edgeCacheCloudflareNoteTextProbe,
  advancedActiveItemProbe,
]

// ---------------------------------------------------------------------------------------------
// Defensive mode on (Phase 11): GET `{ isActive: false, isDefensiveMode: true }`. The divider and the TTL select are gone (`EdgeCacheView.vue`,
// `v-if="!defensiveModeStatus"`), and the card's first `v-card-text` carries `pb-6` (`:class`), so the card ends after the subtitle.
// ---------------------------------------------------------------------------------------------

/** The body of the Defensive mode card: its first `v-card-text` (the subtitle and the switch; `pb-6` while the mode is on). */
export const edgeCacheDefensiveBodyProbe: Probe = {
  key: 'edge-cache-defensive-body',
  legacy: page => cardByTitle(page, DEFENSIVE_TITLE).locator('.v-card__text, .v-card-text').first(),
  next: page => cardByTitle(page, DEFENSIVE_TITLE).locator('.v-card__text, .v-card-text').first(),
}

/** The subtitle paragraph of the Defensive mode card (`p.mb-6`, the last element of the card while the mode is on). */
export const edgeCacheDefensiveTextProbe: Probe = {
  key: 'edge-cache-defensive-text',
  legacy: page => cardByTitle(page, DEFENSIVE_TITLE).locator('p').first(),
  next: page => cardByTitle(page, DEFENSIVE_TITLE).locator('p').first(),
}

/** The defensive mode on state probes: the title, the Manage card and its switch (off), the Defensive mode card with its heading, text, body and switch (on), the sidebar. */
export const edgeCacheDefensiveOnProbes: Probe[] = [
  edgeCacheTitleProbe,
  edgeCacheManageCardProbe,
  edgeCacheManageSwitchProbe,
  edgeCacheDefensiveCardProbe,
  edgeCacheDefensiveHeadingProbe,
  edgeCacheDefensiveTextProbe,
  edgeCacheDefensiveBodyProbe,
  edgeCacheDefensiveSwitchProbe,
  advancedActiveItemProbe,
]

// ---------------------------------------------------------------------------------------------
// Purge modal (Phase 12). The Purge button of the Purge card opens the confirmation (`EC:279-293`): a `BasicModal` with the `$restore` icon,
// the title, the info text, Purge and Cancel, and no alert. Measured open; Purge is not clicked (no PUT).
// ---------------------------------------------------------------------------------------------

/** The purge modal box: a `BasicModal` (`.basic-modal`) found by its info text (the title alone is generic). Same box on both apps. */
export function edgeCachePurgeModalBox (page: Page): Locator {
  return page.locator('.basic-modal').filter({ hasText: trPattern('heading.instance.advanced.edge-cache.modal.purge.info', 'lite') })
}

/**
 * Opens the purge modal from the Purge card's button (`evaluate`, so the click reaches the Vue handler without scrolling). The clock moves
 * on first (lessons: a Vue 3 wrapper `@click` needs a later event time), as in `openPurgeModal` of the Cloudflare state.
 */
export function openEdgeCachePurgeModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const probe = app === 'legacy' ? edgeCachePurgeProbe.legacy : edgeCachePurgeProbe.next
    await probe(page).evaluate((element: HTMLElement) => element.click())
  }
}

/** Waits until the modal box is visible and its position has settled (the dialog transition has ended). */
export const waitForEdgeCachePurgeModal: StateAction = async page => {
  await settled(edgeCachePurgeModalBox(page))
}

/**
 * The probes of the open purge modal: the page behind the dialog (the default probes, which carry the title and the Purge card), then the
 * box (560 px width, the `card-width-560` class), its icon, title, text, and the two actions. The dialog is read on its own locators.
 */
export const edgeCachePurgeModalProbes: Probe[] = [
  ...edgeCacheDefaultProbes,
  { key: 'edge-cache-purge-modal', legacy: edgeCachePurgeModalBox, next: edgeCachePurgeModalBox },
  {
    key: 'edge-cache-purge-modal-icon',
    legacy: page => edgeCachePurgeModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
    next: page => edgeCachePurgeModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
  },
  {
    key: 'edge-cache-purge-modal-title',
    legacy: page => edgeCachePurgeModalBox(page).locator('h6').first(),
    next: page => edgeCachePurgeModalBox(page).locator('h6').first(),
  },
  {
    key: 'edge-cache-purge-modal-text',
    legacy: page => edgeCachePurgeModalBox(page).locator('.v-card__text, .v-card-text').first(),
    next: page => edgeCachePurgeModalBox(page).locator('.v-card__text, .v-card-text').first(),
  },
  {
    key: 'edge-cache-purge-modal-submit',
    legacy: page => edgeCachePurgeModalBox(page).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
    next: page => edgeCachePurgeModalBox(page).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
  },
  {
    key: 'edge-cache-purge-modal-cancel',
    legacy: page => edgeCachePurgeModalBox(page).getByRole('button', { name: tr('button.cancel', 'lite'), exact: true }),
    next: page => edgeCachePurgeModalBox(page).getByRole('button', { name: tr('button.cancel', 'lite'), exact: true }),
  },
]

// ---------------------------------------------------------------------------------------------
// Purge error (Phase 13). The PUT of the purge answers 500: the modal closes anyway (`EdgeCacheView` `submitPurge` `finally`, legacy
// `EC:314-318`), and the error alert shows the body's `message`. The alert closes itself after 5 s, so it is held with the pointer.
// ---------------------------------------------------------------------------------------------

/** The PUT of the purge answers 500 (`PUT .../edge-cache/purge`); the other requests keep the default handlers (`edgeCacheHandlers`). */
export const edgeCachePurgeFailureHandler: Record<string, Handler> = {
  [`PUT ${EDGE_CACHE_API}/purge`]: { status: 500, json: { message: EDGE_CACHE_REFUSED_MESSAGE } },
}

/**
 * Clicks Purge in the open purge modal (`evaluate`, so the click reaches the Vue handler without scrolling; the clock moves on first, as
 * the other Vue 3 wrapper clicks do).
 */
export const confirmEdgeCachePurge: StateAction = async page => {
  await page.clock.setFixedTime(new Date(Date.parse(NOW) + 120_000))
  await edgeCachePurgeModalBox(page).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }).evaluate((element: HTMLElement) => element.click())
}

/** Waits until the purge modal is hidden again (the close transition has ended, or the box is gone). */
export const waitForEdgeCachePurgeModalClosed: StateAction = async page => {
  await edgeCachePurgeModalBox(page).first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined)
}

/**
 * The purge error state probes: the title, the Purge card, the error alert (`alertProbes`), and no visible dialog on either side. The
 * dialog is read on its visible box only (the legacy V2 dialog stays in the DOM hidden after it closes).
 */
export const edgeCachePurgeErrorProbes: Probe[] = [
  edgeCacheTitleProbe,
  edgeCachePurgeCardProbe,
  ...alertProbes(edgeCacheErrorAlert),
  { key: 'edge-cache-purge-dialog-absent', legacy: page => edgeCachePurgeModalBox(page).filter({ visible: true }), next: page => edgeCachePurgeModalBox(page).filter({ visible: true }) },
]

// ---------------------------------------------------------------------------------------------
// Cloudflare modal (Phase 14). The instance has DNS on Cloudflare and the cache is off, so the click on the cache switch opens the warning
// instead of the PUT (`EdgeCacheView` `shouldWarnCloudflare`, legacy `EC:233-249`, `:251-253`): a `BasicModal` with the `$alertwarning` icon
// in `warning`, the title, the info text, the warning alert box, and "Enable Anyway" in front of Cancel. Measured open; no PUT is answered.
// ---------------------------------------------------------------------------------------------

/** The Cloudflare warning box: a `BasicModal` (`.basic-modal`) found by its info text (the title alone is generic). Same box on both apps. */
export function edgeCacheCloudflareModalBox (page: Page): Locator {
  return page.locator('.basic-modal').filter({ hasText: trPattern('heading.instance.advanced.edge-cache.modal.cloudflare-warning.info', 'lite') })
}

/** Waits until the Cloudflare warning box is visible and its position has settled (the dialog transition has ended). */
export const waitForEdgeCacheCloudflareModal: StateAction = async page => {
  await settled(edgeCacheCloudflareModalBox(page))
}

/**
 * The probes of the open Cloudflare warning, narrowed to the dialog: the box (560 px width, the `card-width-560` class), its icon (colour
 * `warning`), title, text, the warning alert box with its icon and text, and the two actions (Enable Anyway, Cancel).
 */
export const edgeCacheCloudflareModalProbes: Probe[] = [
  { key: 'edge-cache-cf-modal', legacy: edgeCacheCloudflareModalBox, next: edgeCacheCloudflareModalBox },
  {
    key: 'edge-cache-cf-modal-icon',
    legacy: page => edgeCacheCloudflareModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
    next: page => edgeCacheCloudflareModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
  },
  {
    key: 'edge-cache-cf-modal-title',
    legacy: page => edgeCacheCloudflareModalBox(page).locator('h6').first(),
    next: page => edgeCacheCloudflareModalBox(page).locator('h6').first(),
  },
  {
    key: 'edge-cache-cf-modal-text',
    legacy: page => edgeCacheCloudflareModalBox(page).locator('.v-card__text, .v-card-text').first(),
    next: page => edgeCacheCloudflareModalBox(page).locator('.v-card__text, .v-card-text').first(),
  },
  {
    key: 'edge-cache-cf-modal-alert',
    legacy: page => edgeCacheCloudflareModalBox(page).locator('.warning-box').first(),
    next: page => edgeCacheCloudflareModalBox(page).locator('.warning-box').first(),
  },
  {
    key: 'edge-cache-cf-modal-alert-icon',
    legacy: page => edgeCacheCloudflareModalBox(page).locator('.warning-box .v-icon').first(),
    next: page => edgeCacheCloudflareModalBox(page).locator('.warning-box .v-icon').first(),
  },
  {
    key: 'edge-cache-cf-modal-alert-text',
    legacy: page => edgeCacheCloudflareModalBox(page).locator('.warning-box > span:last-child'),
    next: page => edgeCacheCloudflareModalBox(page).locator('.warning-box > span:last-child'),
  },
  {
    key: 'edge-cache-cf-modal-enable',
    legacy: page => edgeCacheCloudflareModalBox(page).getByRole('button', { name: tr('button.edge-cache.enable', 'lite'), exact: true }),
    next: page => edgeCacheCloudflareModalBox(page).getByRole('button', { name: tr('button.edge-cache.enable', 'lite'), exact: true }),
  },
  {
    key: 'edge-cache-cf-modal-cancel',
    legacy: page => edgeCacheCloudflareModalBox(page).getByRole('button', { name: tr('button.cancel', 'lite'), exact: true }),
    next: page => edgeCacheCloudflareModalBox(page).getByRole('button', { name: tr('button.cancel', 'lite'), exact: true }),
  },
]

// ---------------------------------------------------------------------------------------------
// TTL menu (Phase 15). The TTL select of the defensive mode card opens its menu (`EDGE_CACHE_TTL_OPTIONS`, five `general.time.*` options,
// 30 minutes selected). The opening follows `openSecurityMenu` of the Cloudflare state: `evaluate` on the activator, the clock moves on first.
// ---------------------------------------------------------------------------------------------

/** The copy of a TTL option as the select shows it: the plural form of `general.time.<unit>` with `{{count}}` filled in (`1 hour`, `30 minutes`). */
export function edgeCacheTtlLabel (count: number, unit: 'minute' | 'hour' | 'day'): string {
  return tr(`general.time.${unit}_${count === 1 ? 'one' : 'other'}`, 'lite').replace('{{count}}', String(count))
}

/** The open TTL menu: the legacy menu (`.menuable__content__active` with options) or the V4 select overlay (`.v-select__content`). */
function ttlMenu (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.menuable__content__active', { has: page.locator('.v-list-item') }).first()
    : page.locator('.v-overlay--active .v-select__content').first()
}

/**
 * Opens the TTL menu from the select of the defensive mode card (`evaluate`: mousedown, mouseup and click on the activator). Next swallows
 * `blur` / `focusout` for the capture, as the Cloudflare security menu does (V4 closes its menu on the resize of the full-page screenshot).
 */
export function openEdgeCacheTtlMenu (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const select = cardByTitle(page, DEFENSIVE_TITLE).locator('.v-select').first()
    const activator = app === 'legacy' ? select.locator('.v-input__slot').first() : select.locator('.v-field').first()
    await activator.evaluate((element: HTMLElement) => {
      for (const type of ['mousedown', 'mouseup', 'click']) {
        element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
      }
    })
    if (app === 'next') {
      await page.evaluate(() => {
        for (const type of ['blur', 'focusout']) {
          window.addEventListener(type, event => event.stopImmediatePropagation(), true)
        }
      })
    }
    await settled(ttlMenu(page, app))
  }
}

/**
 * The probes of the open TTL menu: the default probes of the page, then the menu box (width and offset from the select), its options list,
 * the first option (`30 minutes`: item height, padding, text colour), the last one (`7 days`) and the selected one (`30 minutes`).
 */
export const edgeCacheTtlMenuProbes: Probe[] = [
  ...edgeCacheDefaultProbes,
  { key: 'edge-cache-ttl-menu', legacy: page => ttlMenu(page, 'legacy'), next: page => ttlMenu(page, 'next') },
  {
    key: 'edge-cache-ttl-list',
    legacy: page => ttlMenu(page, 'legacy').locator('.v-list').first(),
    next: page => ttlMenu(page, 'next').locator('.v-list').first(),
  },
  {
    key: 'edge-cache-ttl-item',
    legacy: page => ttlMenu(page, 'legacy').locator('.v-list-item').first(),
    next: page => ttlMenu(page, 'next').locator('.v-list-item').first(),
  },
  {
    key: 'edge-cache-ttl-item-last',
    legacy: page => ttlMenu(page, 'legacy').locator('.v-list-item').last(),
    next: page => ttlMenu(page, 'next').locator('.v-list-item').last(),
  },
  {
    key: 'edge-cache-ttl-item-selected',
    legacy: page => ttlMenu(page, 'legacy').locator('.v-list-item').filter({ hasText: edgeCacheTtlLabel(30, 'minute') }).first(),
    next: page => ttlMenu(page, 'next').locator('.v-list-item').filter({ hasText: edgeCacheTtlLabel(30, 'minute') }).first(),
  },
]
