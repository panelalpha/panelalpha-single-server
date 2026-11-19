import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { readParityClipboard, settled, tr } from './auth'
import { waitFor } from './hosting'
import { RESELLER_HOME, resellerDividerProbe, resellerSidebarActiveProbe, resellerTitleProbe } from './reseller-users'
import { focusButton, noFocusRing } from './sftp'
import { liteTabs, NOW, shellHandlers, shellState } from './shell'

// S-123 ui-reseller-branding, measured on app-lite (`target: 'lite'`, M-2 default): the Reseller Area frame and the Branding page.
// Not a spec file (testMatch is `*.parity.ts`). States: `reseller-branding.parity.ts`. Plan: context/changes/ui-reseller-branding/plan.md.
// `Branding.vue` is byte-identical in app-lite and app, so the states need no `target: 'app'`.

/** The page path of the states. */
export const RESELLER_BRANDING_PATH = '/reseller-area/branding'

/** The saved brand name and domain of the states (the readiness anchor is the brand name input value). */
export const BRAND_NAME = 'Acme Hosting'
export const BRAND_DOMAIN = 'panel.acme-hosting.com'

/** `GET /reseller/branding-settings`: `{ data: { brand_name, domain } }`. An empty `domain` hides the DNS Record card. */
export function brandingSettings (patch: Partial<{ brand_name: string, domain: string }> = {}): Handler {
  return {
    json: { data: { brand_name: BRAND_NAME, domain: '', ...patch } },
  }
}

// ---------------------------------------------------------------------------------------------
// Probes. The Branding card (title, card, label, field box and input, the Manage Styles and Save buttons), then the DNS Record card
// (second title, info alert, the gray well, the first CNAME row). Legacy and next keep the same classes; the field box is a Vuetify part.
// ---------------------------------------------------------------------------------------------

export const brandingTitleProbe: Probe = {
  key: 'reseller-branding-title',
  legacy: page => page.locator('.title-row h4').first(),
  next: page => page.locator('.title-row h4').first(),
}

export const brandingCardProbe: Probe = {
  key: 'reseller-branding-card',
  legacy: page => page.locator('.v-card').first(),
  next: page => page.locator('.v-card').first(),
}

/** The visible label above the Brand Name field (the form has no `for` attribute, so no role lookup). */
export const brandingLabelProbe: Probe = {
  key: 'reseller-branding-label',
  legacy: page => page.locator('.v-card').first().locator('label.base--text').first(),
  next: page => page.locator('.v-card').first().locator('label.base--text').first(),
}

/** The Brand Name field box: V2 `.v-input__slot`, V4 `.v-field` (Vuetify parts, no test id). */
export const brandingFieldProbe: Probe = {
  key: 'reseller-branding-field',
  part: 'box',
  internal: true,
  legacy: page => page.locator('.v-card').first().locator('.v-text-field .v-input__slot').first(),
  next: page => page.locator('.v-card').first().locator('.v-text-field .v-field').first(),
}

/** The Brand Name input. */
export const brandingInputProbe: Probe = {
  key: 'reseller-branding-input',
  part: 'input',
  legacy: page => page.locator('.v-card').first().locator('input').first(),
  next: page => page.locator('.v-card').first().locator('input').first(),
}

/** The Manage Styles button. The lite fixture has no copy for `button.branding.manage`; both apps show the English label. */
export const brandingManageProbe: Probe = {
  key: 'reseller-branding-manage',
  legacy: page => page.locator('.v-main').getByRole('button', { name: 'Manage Styles', exact: true }),
  next: page => page.getByTestId('branding-manage-styles'),
}

/** The Save button, below both cards. */
export const brandingSaveProbe: Probe = {
  key: 'reseller-branding-save',
  // The legacy Style Manager drawer (mounted by `App.vue`) has its own "Save Changes" button first in the DOM: scope to the routed page.
  legacy: page => page.locator('.v-main').getByRole('button', { name: 'Save Changes', exact: true }),
  next: page => page.getByTestId('branding-save'),
}

/** The second title (DNS Record), shown only with a domain. */
export const brandingDnsTitleProbe: Probe = {
  key: 'reseller-branding-dns-title',
  legacy: page => page.locator('.title-row h4').nth(1),
  next: page => page.locator('.title-row h4').nth(1),
}

/** The info alert of the DNS card (`alert--info-bg`, the token of phase 2). */
export const brandingAlertProbe: Probe = {
  key: 'reseller-branding-alert',
  legacy: page => page.locator('.alert--info-bg').first(),
  next: page => page.locator('.alert--info-bg').first(),
}

/** The gray well with the three record rows. */
export const brandingWellProbe: Probe = {
  key: 'reseller-branding-well',
  legacy: page => page.locator('.well--gray').first(),
  next: page => page.locator('.well--gray').first(),
}

/** The first record row (Name = the domain). */
export const brandingRecordProbe: Probe = {
  key: 'reseller-branding-record',
  legacy: page => page.locator('.record-box-list-item').first(),
  next: page => page.locator('.record-box-list-item').first(),
}

/**
 * The Address row (third row): its value is the host of the app, which differs between the apps, so it is masked and has no probe. The whole
 * row is masked: on mobile the value wraps, and the mask box of the inline value span moved by a fraction of a pixel between two captures
 * ("screenshot not stable").
 */
export function addressMask (page: Page): Locator {
  return page.locator('.record-box-list-item').nth(2)
}

/** The probes of the Branding page, after the frame probes. */
export const brandingProbes: Probe[] = [
  brandingTitleProbe,
  brandingCardProbe,
  brandingLabelProbe,
  brandingFieldProbe,
  brandingInputProbe,
  brandingManageProbe,
  brandingSaveProbe,
]

/** The DNS Record card probes (only with a domain). */
export const brandingDnsProbes: Probe[] = [
  brandingDnsTitleProbe,
  brandingAlertProbe,
  brandingWellProbe,
  brandingRecordProbe,
]

// ---------------------------------------------------------------------------------------------
// Phase 7: hover and copied of the Name row (the first record row, value = the domain). The copy icon shows on the row hover; its tooltip
// reads "Copy" on hover and "Copied" after a click (legacy `reseller-area/Branding.vue:93-123,264-275`, next `CopyRecordItem`).
// Only the Name row: the position of its icon depends on the length of its text. The tooltip waits open on desktop only.
// ---------------------------------------------------------------------------------------------

/** The copy icon of the Name row (opacity and visibility follow the row hover). */
export const brandingCopyIconProbe: Probe = {
  key: 'reseller-branding-copy-icon',
  part: 'self',
  internal: true,
  legacy: page => page.locator('.v-main .record-box-list-item').first().locator('.copy-icon'),
  next: page => page.locator('.v-main .record-box-list-item').first().locator('.copy-icon'),
}

/** The open tooltip with "Copy" (legacy `.menuable__content__active`, next `.v-overlay__content`). */
export const brandingTooltipProbe: Probe = {
  key: 'reseller-branding-tooltip',
  internal: true,
  legacy: page => page.locator('.menuable__content__active', { hasText: tr('tooltip.copy', 'lite') }),
  next: page => page.locator('.v-overlay--active .v-overlay__content', { hasText: tr('tooltip.copy', 'lite') }),
}

/** The open tooltip with "Copied" (the label after a successful copy). */
export const brandingTooltipCopiedProbe: Probe = {
  key: 'reseller-branding-tooltip-copied',
  internal: true,
  legacy: page => page.locator('.menuable__content__active', { hasText: tr('tooltip.copied', 'lite') }),
  next: page => page.locator('.v-overlay--active .v-overlay__content', { hasText: tr('tooltip.copied', 'lite') }),
}

/** Phone viewports: no tooltip wait (the hover is plain, as in the other states of the project). */
function isPhoneViewport (page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 976
}

/** The Name row, the first `.record-box-list-item` of the Branding card. */
function nameRow (page: Page): Locator {
  return page.locator('.v-main .record-box-list-item').first()
}

/**
 * Hovers the Name row. Desktop waits for the "Copy" tooltip (`open-delay` 150 ms): the row can reflow once the pointer lands and close it,
 * so the pointer leaves and comes back until it shows (as `hoverForTooltip` in `billing.ts`). Phone: plain hover.
 */
export function hoverNameRow (next: boolean): StateAction {
  return async page => {
    if (isPhoneViewport(page)) {
      await nameRow(page).hover()
      return
    }
    const tooltip = next ? brandingTooltipProbe.next : brandingTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await nameRow(page).hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
    await settled(tooltip(page))
  }
}

/** After the capture: the pointer still rests on the Name row, so the hover (and the open tooltip) was the state under test. */
export const nameRowStillHovered: StateAction = async page => {
  expect(await nameRow(page).evaluate(element => element.matches(':hover')), 'pointer on the Name row after the capture').toBe(true)
}

/**
 * Clicks the Name row and checks the clipboard stub got the domain (both apps). The "Copied" tooltip waits open on desktop; the pointer
 * stays on the row, so the tooltip holds for the capture. Next moves its clock by one second before the click (the copy reset timer).
 */
export function clickNameRow (next: boolean): StateAction {
  return async page => {
    if (next) {
      await page.clock.setFixedTime(new Date(Date.parse(NOW) + 1000))
    }
    await nameRow(page).hover()
    await nameRow(page).click()
    await expect.poll(() => readParityClipboard(page), { message: 'clipboard stub did not receive the domain' }).toBe(BRAND_DOMAIN)
    if (isPhoneViewport(page)) {
      return
    }
    const tooltip = next ? brandingTooltipCopiedProbe.next : brandingTooltipCopiedProbe.legacy
    await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    await settled(tooltip(page))
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 8: hover of the page's main buttons (matrix state `hover`). Same pattern as `buttonHoverState` in auth.ts, but scoped to `.v-main`:
// the legacy DOM also holds the Style Manager drawer with its own "Save Changes" button, so a page-wide name lookup would match twice.
// Each side passes its own locator, because the buttons carry test ids in next only.

export interface BrandingButtonLocators {
  legacy: (page: Page) => Locator
  next: (page: Page) => Locator
}

/** The button's hover overlay: V2 `::before`, V4 `.v-btn__overlay` (see `buttonOverlayProbe` in auth.ts). */
function brandingButtonOverlayProbe (key: string, locators: BrandingButtonLocators): Probe {
  return {
    key,
    internal: true,
    legacy: locators.legacy,
    next: page => locators.next(page).locator('.v-btn__overlay'),
    pseudo: { legacy: '::before' },
  }
}

/** `base` with the pointer resting on the button, plus the overlay probe and the still-hovered check after the capture. */
export function brandingButtonHoverState (base: Omit<ParityState, 'id'>, id: string, locators: BrandingButtonLocators): ParityState {
  const hoverLegacy: StateAction = async page => {
    await locators.legacy(page).hover()
  }
  const hoverNext: StateAction = async page => {
    await locators.next(page).hover()
  }
  const stillHovered = (locator: (page: Page) => Locator): StateAction => async page => {
    expect(await locator(page).evaluate(element => element.matches(':hover')), 'pointer on the button').toBe(true)
  }
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: { legacy: [...base.actions.legacy, hoverLegacy], next: [...base.actions.next, hoverNext] },
    probes: [...base.probes, brandingButtonOverlayProbe('button-overlay', locators)],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered(locators.legacy)],
      next: [...(base.afterCapture?.next ?? []), stillHovered(locators.next)],
    },
  }
}

/** Manage Styles (legacy `.v-main` button by name, next `branding-manage-styles`). */
export const brandingManageButton: BrandingButtonLocators = {
  legacy: page => page.locator('.v-main').getByRole('button', { name: tr('button.branding.manage', 'lite'), exact: true }),
  next: page => page.getByTestId('branding-manage-styles'),
}

/** Save Changes (legacy `.v-main` button by name, next `branding-save`). */
export const brandingSaveButton: BrandingButtonLocators = {
  legacy: page => page.locator('.v-main').getByRole('button', { name: tr('button.saveChanges', 'lite'), exact: true }),
  next: page => page.getByTestId('branding-save'),
}

// ---------------------------------------------------------------------------------------------
// Phase 9: keyboard focus. The button state works like `buttonFocusState` in auth.ts, but the locators stay in `.v-main` (see the note on
// phase 8). `focusButton` and `noFocusRing` come from sftp.ts: Shift, then `focus()`, then `:focus-visible`; no Tab (the tab order differs).

/** `base` with keyboard focus on one of the page's main buttons. The overlay probe and the V4 ring check mirror the hover state. */
export function brandingButtonFocusState (base: Omit<ParityState, 'id'>, id: string, locators: BrandingButtonLocators): ParityState {
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, focusButton(locators.legacy)],
      next: [...base.actions.next, focusButton(locators.next)],
    },
    probes: [...base.probes, brandingButtonOverlayProbe('button-overlay', locators)],
    // V2 has no focus ring; the V4 ring is asserted hidden in next only (legacy has no `::after` to pair with).
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? [])],
      next: [...(base.afterCapture?.next ?? []), noFocusRing(locators.next)],
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 10: the error and save states. The GET and PUT errors raise the error alert (`addAlert`, legacy `Branding.vue:282-288,304-310`),
// the successful save raises the success alert (`message.alertManager.success`, legacy `Branding.vue:299-302`). Each state hovers the
// alert text box and keeps the pointer there, so the alert does not close before the capture (lesson "Toast z timerem").

const successAlerts = (page: Page): Locator => page.locator('.alert-manager .alert--success')

/** Waits for the success alert to settle, hovers its text box and waits until one alert is left (the hovered one keeps its timer). */
export const hoverResellerSuccessAlert: StateAction = async page => {
  const alert = successAlerts(page).first()
  await settled(alert)
  await alert.locator('.alert__text-box').hover()
  await expect(successAlerts(page)).toHaveCount(1, { timeout: 9000 })
}

/**
 * Clicks Save Changes in the routed page (`.v-main`). Next moves its frozen clock by one second first: under a frozen clock Vue 3 skips
 * the click listener (the event stamp is not later than the attach time), as in `clickCopyUrl` in `instances.ts`.
 */
export function clickSave (next: boolean): StateAction {
  return async page => {
    if (next) {
      await page.clock.setFixedTime(new Date(Date.parse(NOW) + 1000))
    }
    await (next ? brandingSaveButton.next : brandingSaveButton.legacy)(page).click()
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 11: the loading states. Legacy `Branding.vue:30-38` shows one skeleton per field while `fetching` (set before the GET), and
// `:loading="submitting"` on Save (`:198-209`). A held GET keeps the skeletons; a held PUT keeps the Save spinner. Both are masked: the
// bones and the spinner move on their own, the page under them is the content under test.

/** The first skeleton of the form card while `GET /reseller/branding-settings` is pending (the Brand Name field's bone). */
export const brandingSkeletonProbe: Probe = {
  key: 'reseller-branding-skeleton',
  legacy: page => page.locator('.v-card').first().locator('.v-skeleton-loader').first(),
  next: page => page.locator('.v-card').first().locator('.v-skeleton-loader').first(),
}

/** Every skeleton of the form card (both fields). */
const brandingSkeletons = (page: Page): Locator => page.locator('.v-card').first().locator('.v-skeleton-loader')

/** The spinner inside Save Changes while `PUT` is pending (V2 `.v-progress-circular` in the button, V4 the same class). */
export function brandingSaveSpinner (next: boolean): (page: Page) => Locator {
  return page => (next ? brandingSaveButton.next : brandingSaveButton.legacy)(page).locator('.v-progress-circular')
}

export const brandingSkeletonMasks = {
  legacy: [brandingSkeletons],
  next: [brandingSkeletons],
}

export const brandingSaveSpinnerMasks = {
  legacy: [brandingSaveSpinner(false)],
  next: [brandingSaveSpinner(true)],
}

/** Waits for the Save spinner (the PUT is pending, so it stays on screen). */
export function waitForBrandingSaveSpinner (next: boolean): StateAction {
  return async page => {
    await settled(brandingSaveSpinner(next)(page))
  }
}

// State skeleton
// ---------------------------------------------------------------------------------------------

export interface ResellerBrandingStateOptions {
  /** Overrides keyed by `METHOD /path`, applied after the defaults. */
  handlers?: Record<string, Handler>
  /** The readiness wait (first action). Default: the Brand Name input, which renders once the GET has answered. */
  ready?: (page: Page) => Locator
  /** Steps after the anchor is visible, before the state's probes. */
  legacy?: StateAction[]
  next?: StateAction[]
  /** Probes after the frame and the Branding probes. */
  probes?: Probe[]
  /** Branding probes left out (a probe on an element the state does not render is a `missing` failure). */
  skipProbes?: Probe[]
  /** Masks (the Address value when the DNS card shows). The page itself is not masked. */
  masks?: Array<(page: Page) => Locator>
}

/**
 * Everything a reseller branding state shares: signed in, single server with the reseller tab, `/reseller-area/branding`, a fixed clock.
 * `GET /reseller/branding-settings` answers the saved brand name; the domain decides whether the DNS Record card shows.
 */
export function resellerBrandingState (options: ResellerBrandingStateOptions = {}): Omit<ParityState, 'id'> {
  const ready = options.ready ?? (page => page.locator('.v-card').first().locator('input').first())
  const base = shellState({
    target: 'lite',
    path: RESELLER_BRANDING_PATH,
    home: RESELLER_HOME,
    tabs: [liteTabs[0], { key: 'reseller-area' }],
    activeTab: 'reseller-area',
    clock: NOW,
    probes: [
      resellerTitleProbe,
      resellerDividerProbe,
      resellerSidebarActiveProbe,
      ...brandingProbes.filter(probe => !(options.skipProbes ?? []).includes(probe)),
      ...(options.probes ?? []),
    ],
  })
  const extraMasks = options.masks ?? []
  return {
    ...base,
    handlers: {
      ...shellHandlers([], 'projects'),
      'GET /reseller/branding-settings': brandingSettings(),
      'PUT /reseller/branding-settings': { json: { data: {} } },
      ...options.handlers,
    },
    // No `.v-main` mask (the lite shell default): the Branding page is the content under test, so the pixel diff must see it.
    masks: {
      legacy: extraMasks,
      next: extraMasks,
    },
    actions: {
      legacy: [waitFor(ready), ...(options.legacy ?? [])],
      next: [waitFor(ready), ...(options.next ?? [])],
    },
  }
}
