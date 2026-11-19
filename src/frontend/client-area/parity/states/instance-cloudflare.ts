import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { alertProbes, settled, tr, trPattern } from './auth'
import { INSTANCE_PAGE_IP } from './instance'
import { ADVANCED_PRIVILEGES, ADVANCED_PROJECT_ID, advancedActiveItemProbe, advancedFrameHandlers, advancedInstance } from './instance-advanced-frame'
import { NOW } from './shell'

// S-91 ui-instance-cloudflare: the Cloudflare page of a project (`/projects/:id/advanced/cloudflare`), measured on app-lite (`target: 'lite'`,
// M-2 default). Not a spec file (testMatch is `*.parity.ts`). States and their registration: `instance-cloudflare.parity.ts`.
// Plan: context/changes/ui-instance-cloudflare/plan.md ("Critical Implementation Details"). The page sits in the Advanced frame, whose
// handlers it reuses (`advancedFrameHandlers`); its API calls are `/projects/41/wordpress/cloudflare/*` on lite (the API layer maps
// `/instances/` to `/projects/` on single-server).

/** The page path of the states (the project of the Advanced frame states). */
export const CLOUDFLARE_PATH = `/projects/${ADVANCED_PROJECT_ID}/advanced/cloudflare`

export const CLOUDFLARE_API = `/projects/${ADVANCED_PROJECT_ID}/wordpress/cloudflare`

/** The nameservers of a domain on Cloudflare (the instance's `dns_nameservers`, the list the Wrong DNS menu shows). */
export const CLOUDFLARE_NAMESERVERS = ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com']

/**
 * `dns.google` answer for the page: the A record of the host (the frame's domain check reads it) and the two Cloudflare NS records (the
 * status badge reads them). One answer serves both queries, because the harness keys external hosts, not query types (lessons: a state
 * with only the A record shows "Wrong DNS" on the badge, since the NS query gets no NS record).
 */
export const CLOUDFLARE_DNS = {
  json: {
    Status: 0,
    Answer: [
      { name: 'studio.example.com.', type: 1, TTL: 300, data: INSTANCE_PAGE_IP },
      { name: 'studio.example.com.', type: 2, TTL: 300, data: 'ada.ns.cloudflare.com.' },
      { name: 'studio.example.com.', type: 2, TTL: 300, data: 'bob.ns.cloudflare.com.' },
    ],
  },
}

/**
 * `dns.google` answer of the Wrong DNS state: the A record of the host only, no nameservers on Cloudflare. The frame's domain check
 * passes, and the NS query gets no answer, so the status badge reads "Wrong DNS" (`CloudflareView.vue`, `fetchStatus`).
 */
export const WRONG_DNS = {
  json: {
    Status: 0,
    Answer: [{ name: 'studio.example.com.', type: 1, TTL: 300, data: INSTANCE_PAGE_IP }],
  },
}

/** The `GET /projects/41` body of the Cloudflare page: the Advanced frame project with the Cloudflare privilege and DNS zone. */
export function cloudflareInstance (overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return advancedInstance([...ADVANCED_PRIVILEGES, 'wordpress.manage_cloudflare'], {
    service_has_dns_cloudflare: true,
    domain_has_dns_zone: true,
    dns_nameservers: CLOUDFLARE_NAMESERVERS,
    ...overrides,
  })
}

/**
 * Handlers of the page: the Advanced frame plus the three settings GETs (`{ value }`, as `cloudflare.api.ts` reads them). Default
 * position: development mode `off`, browser check `on`, security level `medium`. `overrides` replace any key.
 */
export function cloudflareHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: cloudflareInstance() } },
    [`GET ${CLOUDFLARE_API}/development-mode`]: { json: { value: 'off' } },
    [`GET ${CLOUDFLARE_API}/browser-check`]: { json: { value: 'on' } },
    [`GET ${CLOUDFLARE_API}/security`]: { json: { value: 'medium' } },
    ...overrides,
  })
}

// ---------------------------------------------------------------------------------------------
// Locators. The cards are found by their title (`h5`), the copy is the lite fixture's (`heading.instance.advanced.cloudflare.*`).
// ---------------------------------------------------------------------------------------------

export const MANAGE_TITLE = 'heading.instance.advanced.cloudflare.manage.title'
export const CACHE_TITLE = 'heading.instance.advanced.cloudflare.cache.title'
export const DEVELOPMENT_TITLE = 'heading.instance.advanced.cloudflare.development.title'
export const BROWSER_TITLE = 'heading.instance.advanced.cloudflare.browser.title'
export const SECURITY_TITLE = 'heading.instance.advanced.cloudflare.security.title'

/** The card whose `h5` carries the copy key's title (the five cards of the page). */
function cardByTitle (page: Page, key: string): Locator {
  return page.locator('.v-card', { has: page.locator('h5', { hasText: trPattern(key, 'lite') }) }).first()
}

/** The two badge states of the Manage card: Active (success colour) and Wrong DNS (error colour). */
export type CloudflareBadge = 'active' | 'wrong-dns'

/**
 * The status badge sits in the Manage card. Its span and its `b` carry the colour in each app's own classes: legacy
 * `span.success` / `b.success--text` (`app-lite Cloudflare.vue:26-29`) and `span.error` / `b.error--text` (`:40-46`), next `b.text-success`
 * (`CloudflareView.vue:41-47`) and `b.text-error` (`:60-65`).
 */
export function statusBadge (page: Page, app: 'legacy' | 'next', badge: CloudflareBadge = 'active'): Locator {
  const colour = badge === 'active'
    ? (app === 'legacy' ? 'b.success--text' : 'b.text-success')
    : (app === 'legacy' ? 'b.error--text' : 'b.text-error')
  return cardByTitle(page, MANAGE_TITLE).locator(`span:has(> ${colour})`).first()
}

/** The switch of a card: the V2 input wrapper on legacy, the V4 control wrapper on next (the mapping of `ui-instance-wordpress-mcp`). */
function cardSwitch (page: Page, key: string, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? cardByTitle(page, key).locator('.v-input--selection-controls__input').first()
    : cardByTitle(page, key).locator('.v-selection-control__wrapper').first()
}

// ---------------------------------------------------------------------------------------------
// Probes. The title is the readiness anchor; the five cards follow, then the badge, the buttons, the alert, the two switches and the select.
// ---------------------------------------------------------------------------------------------

export const cloudflareTitleProbe: Probe = {
  key: 'cloudflare-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export const cloudflareManageCardProbe: Probe = {
  key: 'cloudflare-card-manage',
  legacy: page => cardByTitle(page, MANAGE_TITLE),
  next: page => cardByTitle(page, MANAGE_TITLE),
}

export const cloudflareCacheCardProbe: Probe = {
  key: 'cloudflare-card-cache',
  legacy: page => cardByTitle(page, CACHE_TITLE),
  next: page => cardByTitle(page, CACHE_TITLE),
}

export const cloudflareDevelopmentCardProbe: Probe = {
  key: 'cloudflare-card-development',
  legacy: page => cardByTitle(page, DEVELOPMENT_TITLE),
  next: page => cardByTitle(page, DEVELOPMENT_TITLE),
}

export const cloudflareBrowserCardProbe: Probe = {
  key: 'cloudflare-card-browser',
  legacy: page => cardByTitle(page, BROWSER_TITLE),
  next: page => cardByTitle(page, BROWSER_TITLE),
}

export const cloudflareSecurityCardProbe: Probe = {
  key: 'cloudflare-card-security',
  legacy: page => cardByTitle(page, SECURITY_TITLE),
  next: page => cardByTitle(page, SECURITY_TITLE),
}

/** The status badge: its background, colour, radius and padding (`--v-success-lighten5` on Active). */
export const cloudflareBadgeProbe: Probe = {
  key: 'cloudflare-badge',
  legacy: page => statusBadge(page, 'legacy', 'active'),
  next: page => statusBadge(page, 'next', 'active'),
}

/** The same badge probe on the Wrong DNS state (`--v-error-lighten5` background, error colour). */
export const cloudflareWrongDnsBadgeProbe: Probe = {
  key: 'cloudflare-badge',
  legacy: page => statusBadge(page, 'legacy', 'wrong-dns'),
  next: page => statusBadge(page, 'next', 'wrong-dns'),
}

export const cloudflareManageProbe: Probe = {
  key: 'cloudflare-manage',
  legacy: page => cardByTitle(page, MANAGE_TITLE).getByRole('button', { name: tr('button.cloudflare.manage', 'lite'), exact: true }),
  next: page => cardByTitle(page, MANAGE_TITLE).getByRole('button', { name: tr('button.cloudflare.manage', 'lite'), exact: true }),
}

export const cloudflarePurgeProbe: Probe = {
  key: 'cloudflare-purge',
  legacy: page => cardByTitle(page, CACHE_TITLE).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
  next: page => cardByTitle(page, CACHE_TITLE).getByRole('button', { name: tr('button.purge', 'lite'), exact: true }),
}

/** The cache card's alert (`AlertSm`, the first one of the page). */
export const cloudflareAlertProbe: Probe = {
  key: 'cloudflare-alert',
  legacy: page => cardByTitle(page, CACHE_TITLE).locator('.alert-sm').first(),
  next: page => cardByTitle(page, CACHE_TITLE).locator('.alert-sm').first(),
}

export const cloudflareDevelopmentSwitchProbe: Probe = {
  key: 'cloudflare-development-switch',
  legacy: page => cardSwitch(page, DEVELOPMENT_TITLE, 'legacy'),
  next: page => cardSwitch(page, DEVELOPMENT_TITLE, 'next'),
}

export const cloudflareBrowserSwitchProbe: Probe = {
  key: 'cloudflare-browser-switch',
  legacy: page => cardSwitch(page, BROWSER_TITLE, 'legacy'),
  next: page => cardSwitch(page, BROWSER_TITLE, 'next'),
}

/** The security level select of its card. */
export const cloudflareSecuritySelectProbe: Probe = {
  key: 'cloudflare-security-select',
  legacy: page => cardByTitle(page, SECURITY_TITLE).locator('.v-select').first(),
  next: page => cardByTitle(page, SECURITY_TITLE).locator('.v-select').first(),
}

/** The probes of the default state, the readiness anchor first. The sidebar's active item is the Cloudflare entry (`advancedActiveItemProbe`). */
export const cloudflareDefaultProbes: Probe[] = [
  cloudflareTitleProbe,
  cloudflareManageCardProbe,
  cloudflareCacheCardProbe,
  cloudflareDevelopmentCardProbe,
  cloudflareBrowserCardProbe,
  cloudflareSecurityCardProbe,
  cloudflareBadgeProbe,
  cloudflareManageProbe,
  cloudflarePurgeProbe,
  cloudflareAlertProbe,
  cloudflareDevelopmentSwitchProbe,
  cloudflareBrowserSwitchProbe,
  cloudflareSecuritySelectProbe,
  advancedActiveItemProbe,
]

/**
 * The Wrong DNS state: the default probes with the badge probe on the error colour. The other probes are shared with the default state
 * (the Manage button and the card layout do not depend on the badge).
 */
export const cloudflareWrongDnsProbes: Probe[] = cloudflareDefaultProbes.map(probe =>
  probe === cloudflareBadgeProbe ? cloudflareWrongDnsBadgeProbe : probe,
)

/**
 * The nameserver menu of the Wrong DNS badge (`v-menu` with `open-on-hover`, teleported): legacy `.menuable__content__active` and next
 * `.v-overlay__content`, the panel that holds the `ul` of the nameservers.
 */
function nameserverMenu (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.menuable__content__active', { has: page.locator('ul') }).first()
    : page.locator('.v-overlay--active .v-overlay__content', { has: page.locator('ul') }).first()
}

/** The menu panel: its width (`min-width` 300) and its offset from the badge (4 px). */
export const cloudflareNameserverMenuProbe: Probe = {
  key: 'cloudflare-nameserver-menu',
  legacy: page => nameserverMenu(page, 'legacy'),
  next: page => nameserverMenu(page, 'next'),
}

/** The list of nameservers (`ul.pa-2`). */
export const cloudflareNameserverListProbe: Probe = {
  key: 'cloudflare-nameserver-list',
  legacy: page => nameserverMenu(page, 'legacy').locator('ul').first(),
  next: page => nameserverMenu(page, 'next').locator('ul').first(),
}

/** The first nameserver item: its text and the bullet (`::before`, the info colour). */
export const cloudflareNameserverItemProbe: Probe = {
  key: 'cloudflare-nameserver-item',
  legacy: page => nameserverMenu(page, 'legacy').locator('ul li').first(),
  next: page => nameserverMenu(page, 'next').locator('ul li').first(),
  pseudo: { legacy: '::before', next: '::before' },
}

/** The copy button of the first nameserver item (`CopyTextButton`). */
export const cloudflareNameserverCopyProbe: Probe = {
  key: 'cloudflare-nameserver-copy',
  legacy: page => nameserverMenu(page, 'legacy').locator('ul li button').first(),
  next: page => nameserverMenu(page, 'next').locator('ul li button').first(),
}

/** The Wrong DNS state with the nameserver menu open: the badge probes of the base state plus the menu probes. */
export const cloudflareWrongDnsHoverProbes: Probe[] = [
  ...cloudflareWrongDnsProbes,
  cloudflareNameserverMenuProbe,
  cloudflareNameserverListProbe,
  cloudflareNameserverItemProbe,
  cloudflareNameserverCopyProbe,
]

// ---------------------------------------------------------------------------------------------
// Busy: the development switch while its PATCH is held (Phase 10). The matrix marks `disabled` N/A (the switch has `:loading`, no `:disabled`).
// ---------------------------------------------------------------------------------------------

/** The `.switch-container` of the development card: the element that carries the click handler on both apps (`ButtonSwitch` root). */
export const cloudflareDevelopmentContainerProbe: Probe = {
  key: 'cloudflare-development-container',
  legacy: page => cardByTitle(page, DEVELOPMENT_TITLE).locator('.switch-container').first(),
  next: page => cardByTitle(page, DEVELOPMENT_TITLE).locator('.switch-container').first(),
}

/** The busy state: the title, the development card, its switch container and its switch (loader, track colour, opacity). */
export const cloudflareSwitchBusyProbes: Probe[] = [
  cloudflareTitleProbe,
  cloudflareDevelopmentCardProbe,
  cloudflareDevelopmentContainerProbe,
  cloudflareDevelopmentSwitchProbe,
]

/** The switch of the development card: the V2 switch on legacy, the V4 switch on next (the whole control, for its disabled input). */
function developmentSwitch (page: Page, app: 'legacy' | 'next'): Locator {
  return cardByTitle(page, DEVELOPMENT_TITLE).locator(app === 'legacy' ? '.v-input--switch' : '.v-switch').first()
}

/**
 * Clicks the development switch (`evaluate`, so the click reaches the container's handler; the input has no pointer events on either app).
 * The clock moves on first (lessons: a Vue 3 wrapper `@click` needs a later event time).
 */
export function clickDevelopmentSwitch (): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    await cardByTitle(page, DEVELOPMENT_TITLE).locator('.switch-container').first().evaluate((element: HTMLElement) => element.click())
  }
}

/**
 * The held save keeps the switch busy: its loader (`v-progress-circular` in the thumb, `CloudflareView.vue` `submittingDevelopmentMode`) is
 * visible on both apps. The input is not asserted: the legacy V2 input stays enabled while the PATCH is held (measured on the diagnostic run).
 */
export function expectDevelopmentSwitchBusy (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(developmentSwitch(page, app).locator('.v-progress-circular').first(), `${app}: busy development switch loader`).toBeVisible()
  }
}

// ---------------------------------------------------------------------------------------------
// Error: the development-mode PATCH answers 500 (Phase 11). The switch stays OFF with no loader (no local flip on failure), the error alert shows.
// ---------------------------------------------------------------------------------------------

/** The refused development-mode save: the 500 body the error alert shows (`getErrorMessage` reads `message`). */
export const CLOUDFLARE_DEVELOPMENT_REFUSED_MESSAGE = 'The development mode could not be saved.'

/** The PATCH of the development mode (`cloudflare.api.ts` `updateDevelopmentMode`), refused by the server. */
export const cloudflareDevelopmentFailureHandler: Record<string, Handler> = {
  [`PATCH ${CLOUDFLARE_API}/development-mode`]: { status: 500, json: { message: CLOUDFLARE_DEVELOPMENT_REFUSED_MESSAGE } },
}

/** The error alert of the alert stack (`.alert--error`): the same locator in both apps, as the Security error states use it. */
export const cloudflareErrorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/** The error state probes: the title, the development card, its switch container and switch (OFF, no loader), and the error alert. */
export const cloudflareErrorProbes: Probe[] = [
  cloudflareTitleProbe,
  cloudflareDevelopmentCardProbe,
  cloudflareDevelopmentContainerProbe,
  cloudflareDevelopmentSwitchProbe,
  ...alertProbes(cloudflareErrorAlert),
]

// ---------------------------------------------------------------------------------------------
// Loading: the three settings GETs are held (Phase 12). The five cards are their skeletons (`AutoUpdatesCardSkeleton`) on both apps: legacy
// `isDataFetched` and next `isCloudflareLoading` are the AND of the three fetching flags. The cards sit in the container right after the
// title container. Vuetify 2 renders `v-container` as `.container` (the legacy class), so the legacy side has its own selector.
// ---------------------------------------------------------------------------------------------

/** The container of the five cards (the sibling after the title container; `.container` on legacy, `.v-container` on next). */
export const cloudflareCardsContainerProbe: Probe = {
  key: 'cloudflare-cards',
  legacy: page => page.locator('.page-title + .container'),
  next: page => page.locator('.page-title + .v-container'),
}

/** The five skeleton cards, in the page order (Manage, Cache, Development, Browser, Security). */
export const cloudflareSkeletonProbes: Probe[] = [0, 1, 2, 3, 4].map(index => ({
  key: `cloudflare-skeleton-card-${index}`,
  legacy: page => page.locator('.page-title + .container .v-card').nth(index),
  next: page => page.locator('.page-title + .v-container .v-card').nth(index),
}))

/** The loading state: the title (readiness anchor), the cards container, then the five skeleton cards. */
export const cloudflareLoadingProbes: Probe[] = [cloudflareTitleProbe, cloudflareCardsContainerProbe, ...cloudflareSkeletonProbes]

// ---------------------------------------------------------------------------------------------
// Readiness: the five cards are on the page (the skeleton is gone) and the status badge has its answer from `dns.google`.
// ---------------------------------------------------------------------------------------------

function cloudflareReady (app: 'legacy' | 'next', badge: CloudflareBadge): (page: Page) => Promise<void> {
  return async page => {
    await cardByTitle(page, SECURITY_TITLE).waitFor({ state: 'visible', timeout: 20_000 })
    await statusBadge(page, app, badge).waitFor({ state: 'visible', timeout: 20_000 })
  }
}

export const cloudflareCardsReady = {
  legacy: [cloudflareReady('legacy', 'active')],
  next: [cloudflareReady('next', 'active')],
}

export const cloudflareWrongDnsCardsReady = {
  legacy: [cloudflareReady('legacy', 'wrong-dns')],
  next: [cloudflareReady('next', 'wrong-dns')],
}

// ---------------------------------------------------------------------------------------------
// Purge modal (Phase 13). The Purge button of the Cache card opens a `BasicModal` (icon `$restore`, title, info, Purge Everything and Cancel).
// The button is clicked by `evaluate` (no scroll, lessons: modal in a parity state). The probes are narrowed to the dialog box.
// ---------------------------------------------------------------------------------------------

/** The purge modal box: a `BasicModal` (`.basic-modal`) found by its info text (the title alone is generic). Same box on both apps. */
export function purgeModalBox (page: Page): Locator {
  return page.locator('.basic-modal').filter({ hasText: trPattern('heading.instance.advanced.cloudflare.modal.purge.info', 'lite') })
}

/**
 * Opens the purge modal from the Cache card's Purge button. The clock moves on first (lessons: a Vue 3 wrapper `@click` needs a later event
 * time), as in `openSharedDomainModal`.
 */
export function openPurgeModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const probe = app === 'legacy' ? cloudflarePurgeProbe.legacy : cloudflarePurgeProbe.next
    await probe(page).evaluate((element: HTMLElement) => element.click())
  }
}

/** Waits until the modal box is visible and its position has settled (the dialog transition has ended). */
export const waitForPurgeModal: StateAction = async page => {
  await settled(purgeModalBox(page))
}

/** The probes of the open purge modal: the box (560 px width), its icon, title, text, and the two actions. Only the dialog is read. */
export const cloudflarePurgeModalProbes: Probe[] = [
  { key: 'cloudflare-purge-modal', legacy: purgeModalBox, next: purgeModalBox },
  {
    key: 'cloudflare-purge-modal-icon',
    legacy: page => purgeModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
    next: page => purgeModalBox(page).locator('.v-card__title, .v-card-title').first().locator('.v-icon').first(),
  },
  {
    key: 'cloudflare-purge-modal-title',
    legacy: page => purgeModalBox(page).locator('h6').first(),
    next: page => purgeModalBox(page).locator('h6').first(),
  },
  {
    key: 'cloudflare-purge-modal-text',
    legacy: page => purgeModalBox(page).locator('.v-card__text, .v-card-text').first(),
    next: page => purgeModalBox(page).locator('.v-card__text, .v-card-text').first(),
  },
  {
    key: 'cloudflare-purge-modal-submit',
    legacy: page => purgeModalBox(page).getByRole('button', { name: trPattern('button.purgeEverything', 'lite') }),
    next: page => purgeModalBox(page).getByRole('button', { name: trPattern('button.purgeEverything', 'lite') }),
  },
  {
    key: 'cloudflare-purge-modal-cancel',
    legacy: page => purgeModalBox(page).getByRole('button', { name: trPattern('button.cancel', 'lite') }),
    next: page => purgeModalBox(page).getByRole('button', { name: trPattern('button.cancel', 'lite') }),
  },
]

// ---------------------------------------------------------------------------------------------
// Purge error (Phase 14). The POST answers 500: the modal closes anyway (legacy `finally`, `CF:451-455`; next `purgeEverything` `finally`),
// and the error alert shows. The alert is the readiness anchor of the state.
// ---------------------------------------------------------------------------------------------

/** The refused purge: the 500 body the error alert shows (`getErrorMessage` reads `message`). */
export const CLOUDFLARE_PURGE_REFUSED_MESSAGE = 'The cache could not be purged.'

/** The POST of the purge (`cloudflare.api.ts` `purgeCache`), refused by the server. */
export const cloudflarePurgeFailureHandler: Record<string, Handler> = {
  [`POST ${CLOUDFLARE_API}/purge-cache`]: { status: 500, json: { message: CLOUDFLARE_PURGE_REFUSED_MESSAGE } },
}

/**
 * Clicks Purge Everything in the open modal (`evaluate`, so the click reaches the Vue handler without scrolling; the clock moves on first,
 * as the other Vue 3 wrapper clicks do).
 */
export function confirmPurge (): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 120_000))
    await purgeModalBox(page).getByRole('button', { name: trPattern('button.purgeEverything', 'lite') }).evaluate((element: HTMLElement) => element.click())
  }
}

/** Waits until the modal is hidden again (the close transition has ended, or the box is gone). */
export const waitForPurgeModalClosed: StateAction = async page => {
  await purgeModalBox(page).first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined)
}

/** The purge error state: the error alert (readiness anchor), the title, the Cache card, and no visible dialog on either side. */
export const cloudflarePurgeErrorProbes: Probe[] = [
  ...alertProbes(cloudflareErrorAlert),
  cloudflareTitleProbe,
  cloudflareCacheCardProbe,
  // Visible dialog only: the legacy V2 dialog stays in the DOM hidden after it closes, and only the visible box is the modal.
  { key: 'cloudflare-purge-dialog-absent', legacy: page => purgeModalBox(page).filter({ visible: true }), next: page => purgeModalBox(page).filter({ visible: true }) },
]

// ---------------------------------------------------------------------------------------------
// Security level select, menu open (Phase 15). The outlined select of the Security card opens its six options; `medium` is the selected one.
// Clicked by synthetic mouse events on the activator (no scroll; the card sits below the fold). Legacy V2 opens on `.v-input__slot`, next V4
// on `.v-field`. The menu is teleported: legacy `.menuable__content__active` (the one with the options), next `.v-select__content` in an
// active overlay.
// ---------------------------------------------------------------------------------------------

/** The open security select menu: the teleported options list of its select. */
function securityMenu (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.menuable__content__active', { has: page.locator('.v-list-item') }).first()
    : page.locator('.v-overlay--active .v-select__content').first()
}

/**
 * Opens the security select (`evaluate`: mousedown, mouseup and click on the activator, the clock moves on first), then waits for the menu to
 * settle. Next swallows `blur` / `focusout` for the capture: the full-page screenshot resizes the window, and V4's select closes its menu on
 * the list's blur while legacy's menu does not (as the Wrong DNS and plan menus do).
 */
export function openSecurityMenu (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    const activator = app === 'legacy'
      ? cardByTitle(page, SECURITY_TITLE).locator('.v-input__slot').first()
      : cardByTitle(page, SECURITY_TITLE).locator('.v-field').first()
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
    await settled(securityMenu(page, app))
  }
}

/** The open menu box (its width and its offset from the select). */
export const cloudflareSecurityMenuProbe: Probe = {
  key: 'cloudflare-security-menu',
  legacy: page => securityMenu(page, 'legacy'),
  next: page => securityMenu(page, 'next'),
}

/** The options list of the menu (its vertical padding). */
export const cloudflareSecurityListProbe: Probe = {
  key: 'cloudflare-security-list',
  legacy: page => securityMenu(page, 'legacy').locator('.v-list').first(),
  next: page => securityMenu(page, 'next').locator('.v-list').first(),
}

/** The first option (`Off`): item height (40 px on V2, 48 px on V4 without the density fix), padding and text colour. */
export const cloudflareSecurityItemProbe: Probe = {
  key: 'cloudflare-security-item',
  legacy: page => securityMenu(page, 'legacy').locator('.v-list-item').first(),
  next: page => securityMenu(page, 'next').locator('.v-list-item').first(),
}

/** The last option (`Under attack`): the list's bottom edge and the spacing between options. */
export const cloudflareSecurityLastItemProbe: Probe = {
  key: 'cloudflare-security-item-last',
  legacy: page => securityMenu(page, 'legacy').locator('.v-list-item').last(),
  next: page => securityMenu(page, 'next').locator('.v-list-item').last(),
}

/** The selected option (`Medium`): the active colour and background of the current level. */
export const cloudflareSecuritySelectedItemProbe: Probe = {
  key: 'cloudflare-security-item-selected',
  legacy: page => securityMenu(page, 'legacy').locator('.v-list-item').filter({ hasText: trPattern('form.option.cloudflareSecurity.medium', 'lite') }).first(),
  next: page => securityMenu(page, 'next').locator('.v-list-item').filter({ hasText: trPattern('form.option.cloudflareSecurity.medium', 'lite') }).first(),
}

/** The open security state: the title, the Security card, its select (the active outline), then the menu probes. */
export const cloudflareSecurityMenuProbes: Probe[] = [
  cloudflareTitleProbe,
  cloudflareSecurityCardProbe,
  cloudflareSecuritySelectProbe,
  cloudflareSecurityMenuProbe,
  cloudflareSecurityListProbe,
  cloudflareSecurityItemProbe,
  cloudflareSecurityLastItemProbe,
  cloudflareSecuritySelectedItemProbe,
]
