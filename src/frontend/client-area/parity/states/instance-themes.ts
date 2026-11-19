import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { alertProbes, settled, tr } from './auth'
import { waitFor } from './hosting'
import { ADVANCED_PROJECT_ID, advancedFrameHandlers, advancedFrameInstance } from './instance-advanced-frame'
import { actionDialog } from './instance-plugins'
import { hoverCard, liteShellHome } from './instances'
import { isDesktop, NOW } from './shell'

// S-90 ui-instance-themes: the Themes screen of a project inside the Advanced frame, measured on app-lite (`target: 'lite'`, M-2 default).
// Not a spec file (testMatch is `*.parity.ts`). States: `instance-themes.parity.ts`. Plan: context/changes/ui-instance-themes/plan.md.
// The frame (sidebar, title bar, `GET /projects/41`) comes from `instance-advanced-frame.ts` (S-89), imported and not copied.

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Plugins states do). */
const { admin: _styleManagerAdmin, ...liteHomeWithoutAdmin } = liteShellHome()
export const THEMES_HOME: Record<string, unknown> = liteHomeWithoutAdmin

/** The screenshot of every installed theme: a PNG from the fixture, answered for `<img>` requests (`themeScreenshotSrc`, baseURL `/instances`). */
const SCREENSHOT = readFileSync(new URL('../fixtures/screenshot.png', import.meta.url))

/** The project of the frame with the theme privilege added: the sidebar shows the Themes item only with `wordpress.manage_themes`. */
export const themesInstance: Record<string, unknown> = {
  ...advancedFrameInstance,
  privileges: [...(advancedFrameInstance.privileges as string[]), 'wordpress.manage_themes'],
}

/** One installed theme (`GET …/wordpress/themes`, `InstalledTheme` in `instance-themes.api.ts`). Fields not given take the defaults. */
type ThemeRow = Record<string, unknown>

function theme (patch: ThemeRow): ThemeRow {
  return {
    name: 'theme',
    title: 'Theme',
    description: 'A short description of the theme.',
    version: '1.0.0',
    status: 'inactive',
    update: 'none',
    update_version: null,
    async_status: { install: null, update: null },
    ...patch,
  }
}

/**
 * The eight installed themes (2 pages of 6): the active one, one with an update, an inactive one, one with a description over 100 characters
 * (the "Read more" link), one with a pending update (`async_status.update`), and two more on the second page.
 */
export const installedThemes: ThemeRow[] = [
  theme({ name: 'twentytwentyfive', title: 'Twenty Twenty-Five', version: '1.2', status: 'active', description: 'The default theme for the block editor.' }),
  theme({ name: 'astra', title: 'Astra', version: '4.6.0', update: 'available', update_version: '4.7.1', description: 'A fast, lightweight theme for every kind of site.' }),
  theme({ name: 'generatepress', title: 'GeneratePress', version: '3.4.0', description: 'A lightweight theme with a focus on speed and flexibility.' }),
  theme({
    name: 'kadence',
    title: 'Kadence',
    version: '1.1.37',
    description: 'Kadence is a free theme with blocks, templates and a large library of starter sites that you can import in a few clicks, for any kind of business.',
  }),
  theme({ name: 'oceanwp', title: 'OceanWP', version: '3.9.2', description: 'A versatile theme with a lot of options.' }),
  theme({ name: 'neve', title: 'Neve', version: '3.2.1', async_status: { install: null, update: 'pending' }, description: 'A fast theme for blogs and shops.' }),
  theme({ name: 'hello-elementor', title: 'Hello Elementor', version: '3.1.0', description: 'A minimal base theme for Elementor.' }),
  theme({ name: 'blocksy', title: 'Blocksy', version: '2.0.9', description: 'A modern theme with a companion plugin for extra features.' }),
]

/** The featured themes of the Add New page (`GET …/new/featured`, `RepositoryTheme`). Featured entries carry no `async_status`. */
export const featuredThemes: ThemeRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  slug: `featured-theme-${index + 1}`,
  name: `Featured Theme ${index + 1}`,
  description: `Short description of featured theme ${index + 1}.`,
  rating: 100 - index * 9,
  version: `1.${index + 1}.0`,
  type: 'theme',
  screenshot_url: null,
  preview_url: null,
  last_updated: '2026-09-01',
}))

/** The search results for the term `blog` (`GET …/new/search/blog`). */
export const searchThemes: ThemeRow[] = [
  { id: 101, slug: 'blog-theme', name: 'Blog Theme', description: 'A theme for blogs with a clean reading layout.', rating: 80, version: '2.0.0', type: 'theme', screenshot_url: null, preview_url: null, last_updated: '2026-09-01' },
]

/** The theme list handler: `{ data: rows }`. */
export const themesList = (rows: ThemeRow[] = installedThemes): Handler => ({ json: { data: rows } })

/** The screenshot handlers of the installed themes: `<img>` requests on `/instances/41/…/screenshot` (lite keeps `/instances` for images). */
export function themeScreenshotHandlers (rows: ThemeRow[] = installedThemes): Record<string, Handler> {
  const handlers: Record<string, Handler> = {}
  for (const row of rows) {
    handlers[`GET /instances/${ADVANCED_PROJECT_ID}/wordpress/themes/${row.name as string}/screenshot`] = {
      headers: { 'content-type': 'image/png' },
      body: SCREENSHOT,
    }
  }
  return handlers
}

/**
 * Every request the frame and the Themes screen make on project 41: the frame handlers (S-89) with the project GET that carries the theme
 * privilege, the theme list, the featured and search catalogue, and the screenshots. `overrides` replace any key, so a state changes one call.
 */
export function themesHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...advancedFrameHandlers({ [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: themesInstance } } }),
    ...themeScreenshotHandlers(),
    [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/themes`]: themesList(),
    [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/themes/new/featured`]: { json: { data: featuredThemes } },
    [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/themes/new/search/blog`]: { json: { data: searchThemes } },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Probes. The page title is the readiness anchor, then "Add New", the active card (green band), the card with an update (the warning
// icon: `error--text` on V2, `text-error` on V4), an inactive card and the footer of the pagination. Legacy and next keep the same card
// classes (`data-iterator-card--green`), so the icon colour is the only per-app part.
// ---------------------------------------------------------------------------------------------

/** The readiness anchor: the first installed card is on the page (the list comes from `GET …/wordpress/themes`). */
export const themesCardsAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.data-iterator-card').first())],
  next: [waitFor(page => page.locator('.data-iterator-card').first())],
}

/** The title is a bare `h4` in the title box on both apps (no `page-title__title` class, unlike Plugins). */
export const themesTitleProbe: Probe = {
  key: 'themes-title',
  legacy: page => page.locator('.page-title__title-box:visible > h4').first(),
  next: page => page.locator('.page-title__title-box:visible > h4').first(),
}

export const themesAddNewProbe: Probe = {
  key: 'add-new',
  legacy: page => page.locator('.add-new-button').first(),
  next: page => page.locator('.add-new-button').first(),
}

export const themesActiveCardProbe: Probe = {
  key: 'card-active',
  legacy: page => page.locator('.data-iterator-card--green').first(),
  next: page => page.locator('.data-iterator-card--green').first(),
}

/** The card whose warning icon is in the error colour (an update is available). */
export const themesUpdateCardProbe: Probe = {
  key: 'card-update',
  legacy: page => page.locator('.data-iterator-card').filter({ has: page.locator('.error--text') }).first(),
  next: page => page.locator('.data-iterator-card').filter({ has: page.locator('.text-error') }).first(),
}

/** An inactive card with no update: the second card that is not the active one (`astra` is the one with an update). */
export const themesInactiveCardProbe: Probe = {
  key: 'card-inactive',
  legacy: page => page.locator('.data-iterator-card:not(.data-iterator-card--green)').nth(1),
  next: page => page.locator('.data-iterator-card:not(.data-iterator-card--green)').nth(1),
}

export const themesFooterProbe: Probe = {
  key: 'pagination-footer',
  legacy: page => page.locator('.data-iterator-footer').first(),
  next: page => page.locator('.data-iterator-footer').first(),
}

export const themesProbes: Probe[] = [
  themesTitleProbe,
  themesAddNewProbe,
  themesActiveCardProbe,
  themesUpdateCardProbe,
  themesInactiveCardProbe,
  themesFooterProbe,
]

// Phase 7: the table view. `ListGridSwitch` is shown on desktop only (`showListSwitch`, 1400 px and up), so the switch and the table are measured
// on desktop; the mobile skip sits in `instance-themes.parity.ts`. The table has the same markup as the Plugins table in both apps.

/** Switches the list to the table view: the second button of the switch is `$list` (the first is `$grid`, `ListGridSwitch.vue`). */
export const switchToTable: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.page-title__title-box button').nth(1).click()
    await settled(page.locator('.v-card.data-table').first())
  },
  next: async page => {
    await page.locator('.page-title__title-box button').nth(1).click()
    await settled(page.locator('.v-card.data-table').first())
  },
}

/** The table is ready when its first row is on screen (the rows come from the same list as the cards). */
export const tableRowAnchor: { legacy: StateAction, next: StateAction } = {
  legacy: waitFor(page => page.locator('.v-card.data-table tbody tr').first()),
  next: waitFor(page => page.locator('.v-card.data-table tbody tr').first()),
}

export const themesTableProbe: Probe = {
  key: 'table',
  legacy: page => page.locator('.v-card.data-table').first(),
  next: page => page.locator('.v-card.data-table').first(),
}

export const themesTableSortProbe: Probe = {
  key: 'table-sort',
  legacy: page => page.locator('.custom-sort').first(),
  next: page => page.locator('.custom-sort').first(),
}

/** The row bar of the active theme (green): the bar is the `::after` of `.item-bordered--green`, so the pseudo-element is measured. */
export const themesTableGreenRowProbe: Probe = {
  key: 'row-green',
  legacy: page => page.locator('.item-bordered--green').first(),
  next: page => page.locator('.item-bordered--green').first(),
  pseudo: { legacy: '::after', next: '::after' },
}

/** The row bar of the theme with an update (red): the `::after` of `.item-bordered--red`, as the green bar. */
export const themesTableRedRowProbe: Probe = {
  key: 'row-red',
  legacy: page => page.locator('.item-bordered--red').first(),
  next: page => page.locator('.item-bordered--red').first(),
  pseudo: { legacy: '::after', next: '::after' },
}

/** The status chip of the table (`StatusLabel`, `small`: class `chipTable` in both apps). */
export const themesTableChipProbe: Probe = {
  key: 'status-chip',
  legacy: page => page.locator('.chipTable').first(),
  next: page => page.locator('.chipTable').first(),
}

/** The first action button of the row with an update (the red row): its colour and state are measured, not its label. */
export const themesTableUpdateProbe: Probe = {
  key: 'table-update',
  legacy: page => page.locator('tr', { has: page.locator('.item-bordered--red') }).locator('.actions-row button').first(),
  next: page => page.locator('tr', { has: page.locator('.item-bordered--red') }).locator('.actions-row button').first(),
}

export const themesTableProbes: Probe[] = [
  themesTableProbe,
  themesTableSortProbe,
  themesTableGreenRowProbe,
  themesTableRedRowProbe,
  themesTableChipProbe,
  themesTableUpdateProbe,
  themesFooterProbe,
]

// Phase 8: the hover states. The card hover reveals `.instance-actions` (opacity 0 to 1 on `.data-iterator-card:hover`, the same in both apps);
// both hover states are desktop only (no hover on mobile, and the "Add New" button is icon-only there, so its name lookup fails).

/** The pointer rests on the second card (`astra`: inactive, with an update), away from its buttons; `hoverCard` waits for the overlay to show. */
export const themesCardHover: { legacy: StateAction, next: StateAction } = hoverCard(1)

/** The pointer is still on the hovered card after the capture (the scroll reset can drop `:hover`), so the card under it is checked. */
export const themesCardStillHovered: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    expect(await page.locator('.data-iterator-card').nth(1).evaluate(element => element.matches(':hover')), 'pointer on the card').toBe(true)
  },
  next: async page => {
    expect(await page.locator('.data-iterator-card').nth(1).evaluate(element => element.matches(':hover')), 'pointer on the card').toBe(true)
  },
}

/** The hover overlay of the hovered card: `.instance-actions` (the same class in both apps). */
export const themesCardOverlayProbe: Probe = {
  key: 'card-overlay',
  legacy: page => page.locator('.data-iterator-card').nth(1).locator('.instance-actions'),
  next: page => page.locator('.data-iterator-card').nth(1).locator('.instance-actions'),
}

/** "Use theme" in the overlay: the first button, present on an inactive card only. */
export const themesCardUseProbe: Probe = {
  key: 'card-overlay-use',
  legacy: page => page.locator('.data-iterator-card').nth(1).locator('.instance-actions__content .v-btn').first(),
  next: page => page.locator('.data-iterator-card').nth(1).locator('.instance-actions__content .v-btn').first(),
}

/** "Preview" in the overlay: the last button of the overlay, a link to the theme's preview. */
export const themesCardPreviewProbe: Probe = {
  key: 'card-overlay-preview',
  legacy: page => page.locator('.data-iterator-card').nth(1).locator('.instance-actions__content .v-btn').last(),
  next: page => page.locator('.data-iterator-card').nth(1).locator('.instance-actions__content .v-btn').last(),
}

export const themesCardHoverProbes: Probe[] = [themesCardOverlayProbe, themesCardUseProbe, themesCardPreviewProbe]

// Phase 9: keyboard focus on "Add New" (`focusAddNew` of `instance-plugins.ts`: a real `Tab` walk to the visible `.add-new-button`; the title bar
// of the shell has an "Add New" button with the same name, so the button is located by class and visibility, not by name). Desktop only.

// Phase 10: the disabled buttons. The active card (green) has Activate (first button of its action row) and Delete (last button) disabled
// (`ThemeCard.vue:178,244`, LITE `ThemeCard.vue:163,233`); Preview is a link. The table has a row without an update (its Update button is
// the second action, disabled: `ThemeTable.vue:152`, LITE `ThemeTable.vue:157`) and the active row (Delete is the second action, disabled:
// `ThemeTable.vue:177`, LITE `ThemeTable.vue:185`). The tooltip "cannot delete" shows on hover and is not measured.

/** The action row of the active card: the first button is Activate, the last one is Delete (the card has no update, so no third button). */
function activeCardAction (page: Page, which: 'first' | 'last'): Locator {
  const buttons = page.locator('.data-iterator-card--green :is(.v-card-actions, .v-card__actions) button')
  return which === 'first' ? buttons.first() : buttons.last()
}

export const themesCardActivateProbe: Probe = {
  key: 'card-activate-disabled',
  legacy: page => activeCardAction(page, 'first'),
  next: page => activeCardAction(page, 'first'),
}

export const themesCardDeleteProbe: Probe = {
  key: 'card-delete-disabled',
  legacy: page => activeCardAction(page, 'last'),
  next: page => activeCardAction(page, 'last'),
}

/** The disabled check after the capture: a failure means the fixture did not produce the disabled state (a harness error, `state.ts:91`). */
const themesCardDisabledCheck: StateAction = async page => {
  await expect(activeCardAction(page, 'first'), 'activate disabled').toBeDisabled()
  await expect(activeCardAction(page, 'last'), 'delete disabled').toBeDisabled()
}

export const themesCardDisabled: { legacy: StateAction, next: StateAction } = {
  legacy: themesCardDisabledCheck,
  next: themesCardDisabledCheck,
}

/** The row of "GeneratePress" (inactive, no update; the table marks only the active row, LITE `ThemeTable.vue:70`): Activate, Update (disabled), Delete. */
function plainRowUpdate (page: Page): Locator {
  return page.locator('.v-card.data-table tbody tr', { hasText: 'GeneratePress' })
    .first()
    .locator('.actions-row button')
    .nth(1)
}

/** The active row (green): its actions are Update (disabled, no update) and Delete (disabled). */
function activeRowDelete (page: Page): Locator {
  return page.locator('.v-card.data-table tbody tr')
    .filter({ has: page.locator('.item-bordered--green') })
    .first()
    .locator('.actions-row button')
    .nth(1)
}

export const themesTablePlainUpdateProbe: Probe = {
  key: 'table-update-disabled',
  legacy: page => plainRowUpdate(page),
  next: page => plainRowUpdate(page),
}

export const themesTableActiveDeleteProbe: Probe = {
  key: 'table-delete-disabled',
  legacy: page => activeRowDelete(page),
  next: page => activeRowDelete(page),
}

const themesTableDisabledCheck: StateAction = async page => {
  await expect(plainRowUpdate(page), 'update disabled on a row without update').toBeDisabled()
  await expect(activeRowDelete(page), 'delete disabled on the active row').toBeDisabled()
}

export const themesTableDisabled: { legacy: StateAction, next: StateAction } = {
  legacy: themesTableDisabledCheck,
  next: themesTableDisabledCheck,
}

// Phase 11: the activation dialog of "GeneratePress" (an inactive card with no update: its first action button is Activate, `ThemeCard.vue`)
// and the refused activation: the PUT answers 422, the dialog closes and the error alert shows the message (`activateRefusedHandler`, S-88).
// Builders follow `instance-plugins.ts` (Phase 12). The dialog title is the lite copy `heading.instance.advanced.theme.modal.activate.title_one`
// (`translation.en.json:1095`, "Use Theme").

/** The inactive card of "GeneratePress" (no update): the card text is the only anchor, its first action button is Activate. */
function activateCard (page: Page): Locator {
  return page.locator('.data-iterator-card', { hasText: 'GeneratePress' })
}

/** The Activate button of that card: the first button of its action row (the card has no update, so there is no update button first). */
function activateCardButton (page: Page): Locator {
  return activateCard(page).locator(':is(.v-card-actions, .v-card__actions) button').first()
}

const ACTIVATE_TITLE = 'Use Theme'

/** The activation dialog: the legacy `.basic-modal` in the open dialog (titled), next the host's `instances-modal`. */
export function themeActivateModal (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.v-dialog--active .basic-modal').filter({ hasText: ACTIVATE_TITLE })
    : page.getByTestId('instances-modal')
}

/** Opens the activation dialog with a click on the card's Activate button (`evaluate`, so the page does not scroll under the dialog). */
export const openThemeActivate: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await activateCardButton(page).evaluate((el: HTMLElement) => el.click())
    await expect(themeActivateModal(page, 'legacy')).toBeVisible()
  },
  next: async page => {
    await activateCardButton(page).evaluate((el: HTMLElement) => el.click())
    await expect(themeActivateModal(page, 'next')).toBeVisible()
  },
}

/** Submits the dialog with its "Activate" button (`button.activate`, "Activate" in the lite copy). */
export function submitThemeActivate (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await themeActivateModal(page, app).getByRole('button', { name: 'Activate', exact: true }).click()
  }
}

/** The dialog probes: the modal, its title, the grey target box with the theme, the message, and the submit and cancel buttons. */
export const themeActivateModalProbes: Probe[] = [
  {
    key: 'activate-modal',
    legacy: page => themeActivateModal(page, 'legacy'),
    next: page => themeActivateModal(page, 'next'),
  },
  {
    key: 'activate-modal-title',
    legacy: page => themeActivateModal(page, 'legacy').locator('.v-card__title').first(),
    next: page => themeActivateModal(page, 'next').locator('.v-card-title').first(),
  },
  {
    key: 'activate-modal-target',
    legacy: page => themeActivateModal(page, 'legacy').locator('.target-item-box').first(),
    next: page => themeActivateModal(page, 'next').locator('.target-item-box').first(),
  },
  {
    key: 'activate-modal-message',
    legacy: page => themeActivateModal(page, 'legacy').locator('.v-card__text p').first(),
    next: page => themeActivateModal(page, 'next').locator('.v-card-text p').first(),
    internal: true,
  },
  {
    key: 'activate-modal-submit',
    legacy: page => themeActivateModal(page, 'legacy').getByRole('button', { name: 'Activate', exact: true }),
    next: page => themeActivateModal(page, 'next').getByRole('button', { name: 'Activate', exact: true }),
  },
  {
    key: 'activate-modal-cancel',
    legacy: page => themeActivateModal(page, 'legacy').getByRole('button', { name: 'Cancel', exact: true }),
    next: page => themeActivateModal(page, 'next').getByRole('button', { name: 'Cancel', exact: true }),
    internal: true,
  },
]

/** The alert of the refused activation: the error alert of the alert manager (`.alert-manager .alert--error` in both apps). */
export const themesErrorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/** The message of the refused activation: the 422 body the alert shows (`ThemesActionsMixin.js`, `use-theme-actions.ts` `fail`). */
export const themesActivateRefusedMessage = 'The theme could not be activated.'

/** The activation request of "GeneratePress" answers 422 with `{ message }`: the alert shows the message, the dialog is closed. */
export const themesActivateRefusedHandler: Record<string, Handler> = {
  [`PUT /projects/${ADVANCED_PROJECT_ID}/wordpress/themes/generatepress/activate`]: { status: 422, json: { message: themesActivateRefusedMessage } },
}

/** The alert is open and settled before the pointer rests on it (the alert stack animates in); the 5 s auto-close needs the pointer on the text. */
function themesRefusedAlert (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(themesErrorAlert(page).filter({ hasText: themesActivateRefusedMessage }), `${app}: refused activation alert`).toBeVisible()
    await settled(themesErrorAlert(page))
    await themesErrorAlert(page).locator('.alert__text-box').hover()
  }
}

/** The error alert probes (the shared alert probes of `auth.ts`, on the themes alert). */
export const themesErrorProbes: Probe[] = alertProbes(themesErrorAlert)

/** Base of the activation dialog state: the Activate card button opens the dialog, nothing is submitted. */
export const themesActivateModalActions: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [openThemeActivate.legacy],
  next: [openThemeActivate.next],
}

/** The refused path: open the dialog, submit it, then check the alert (the PUT answers 422 through `themesActivateRefusedHandler`). */
export const themesRefusedActions: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [openThemeActivate.legacy, submitThemeActivate('legacy'), themesRefusedAlert('legacy')],
  next: [openThemeActivate.next, submitThemeActivate('next'), themesRefusedAlert('next')],
}

/** The alert stays visible after the capture (a closed alert would mean a harness timing error, not a state difference). */
export const themesAlertStillOpen: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(themesErrorAlert(page), 'Harness error: legacy error alert closed during capture').toBeVisible()
  },
  next: async page => {
    await expect(themesErrorAlert(page), 'Harness error: next error alert closed during capture').toBeVisible()
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 12: the empty states. `instance-themes-empty`: `GET …/wordpress/themes` answers `[]`, so the page shows the empty block
// (`TableFullScreenMessage` with `ThemesIllustration`, `ThemesView.vue` empty branch) and no title or cards (legacy `Themes.vue:10-40`).
// `instance-themes-search-empty`: a term with no hit on the installed list (filtered on the client, `use-themes-page.ts`).
// ---------------------------------------------------------------------------------------------

/** The installed list is empty (`GET …/wordpress/themes` -> `[]`). The featured and search catalogue keep their defaults. */
export const themesEmptyHandler: Handler = themesList([])

/** The readiness anchor of the empty state: the `.no-data` block of `TableFullScreenMessage` (there is no page title and no card). */
export const themesEmptyAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.no-data').first())],
  next: [waitFor(page => page.locator('.no-data').first())],
}

/** The empty block: the card around it, its title and text, the illustration and the Add New button (icon-only on mobile, same class in both apps). */
export const themesEmptyProbes: Probe[] = [
  { key: 'empty-card', legacy: page => page.locator('.v-main .v-card', { has: page.locator('.no-data') }).first(), next: page => page.locator('.v-main .v-card', { has: page.locator('.no-data') }).first() },
  { key: 'empty-title', legacy: page => page.locator('.no-data__title'), next: page => page.locator('.no-data__title') },
  { key: 'empty-desc', legacy: page => page.locator('.no-data__desc'), next: page => page.locator('.no-data__desc') },
  { key: 'empty-illustration', legacy: page => page.locator('.no-data__img'), next: page => page.locator('.no-data__img') },
  { key: 'empty-add', legacy: page => page.locator('.add-new-button').first(), next: page => page.locator('.add-new-button').first() },
]

/**
 * Types `term` into the visible search of the installed list. Legacy keeps the Add New tab (with its own search) in the DOM, so the
 * placeholder lookup of `listSearch` matches two fields: the visible one is used. Below `md` the search is an icon that opens the field.
 */
export function themesListSearch (term: string): StateAction {
  return async page => {
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await page.locator('.data-iterator-filter-controls__item:visible').last().locator('.v-input').click()
    }
    await page.getByPlaceholder(tr('form.placeholder.search')).filter({ visible: true }).first().fill(term)
    const base = Date.parse(NOW)
    for (let step = 1; step <= 20; step++) {
      await page.clock.setFixedTime(new Date(base + step * 1000))
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)))
      if (await page.locator('.no-results-container:visible').count() > 0) {
        return
      }
    }
  }
}

/** The term typed into the search of the installed list; it matches none of `installedThemes`. */
export const themesNoHitTerm = 'no-such-theme'

/** The search with no hit: the title, Add New, the filter controls and `DataIteratorNoResultsContainer` (`.no-results-container`). */
export const themesSearchEmptyProbes: Probe[] = [
  themesTitleProbe,
  themesAddNewProbe,
  { key: 'filter-controls', legacy: page => page.locator('.page-title__filter-controls:visible').first(), next: page => page.locator('.page-title__filter-controls:visible').first() },
  { key: 'no-results', legacy: page => page.locator('.no-results-container:visible').first(), next: page => page.locator('.no-results-container:visible').first() },
]

// ---------------------------------------------------------------------------------------------
// Phase 13: the loading states. `GET …/wordpress/themes` never answers (`'hold'`): `instance-themes-loading` shows the six `ThemeCardSkeleton`s
// of the `#loading` slot (`ThemesView.vue`); `instance-themes-table-loading` switches to the table before the answer, so it shows the sort
// skeleton and the skeleton rows (`ThemeTable.vue`, `loading`). The featured catalogue answers as usual. The shimmer is frozen by the harness
// (`FREEZE_CSS`), not masked.
// ---------------------------------------------------------------------------------------------

/** The installed list stays pending (`GET …/wordpress/themes`); the featured and search catalogue keep their defaults. */
export const themesLoadingHandler: Handler = 'hold'

/** The readiness anchor of the loading state: the first skeleton is on the page (no card and no table row is rendered yet). */
export const themesSkeletonAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.v-skeleton-loader').first())],
  next: [waitFor(page => page.locator('.v-skeleton-loader').first())],
}

/** One card skeleton: the `v-card` that holds the image skeleton (`ThemeCardSkeleton.vue`, identical in both apps). */
export const themesCardSkeletonProbe: Probe = {
  key: 'card-skeleton',
  legacy: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader.image') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader.image') }).first(),
}

/** The first skeleton row of the table (`ThemeTableSkeletonItem.vue`: the `tbody` rows of the `#tbody` slot, the sort skeleton is in `thead`). */
export const themesTableSkeletonRowProbe: Probe = {
  key: 'table-row-skeleton',
  legacy: page => page.locator('.v-card.data-table tbody tr').first(),
  next: page => page.locator('.v-card.data-table tbody tr').first(),
}

/** The loading probes both states share: the title and Add New stay on the page, the list and its sort row are not rendered yet. */
export const themesLoadingProbes: Probe[] = [themesTitleProbe, themesAddNewProbe]

// Phase 14: the selection. Two cards checked by a click on their checkboxes (`checkCards`, the grid checkbox selector is the same in both apps);
// the bar (`.snackbar`, kit `SelectSnackbar`) shows the count and the mass actions. Astra (update available) and GeneratePress (no update)
// are the cards 1 and 2 of page 1. The row counts (update, select all, deselect) are checked before the capture (`snackbarRowActions`).

/** The bar wrapper of both apps (V2 `.v-snack__wrapper`, V4 `.v-snackbar__wrapper`), under the `.snackbar` class both render. */
const themesSnackbarWrapper: { legacy: string, next: string } = {
  legacy: '.snackbar .v-snack__wrapper',
  next: '.snackbar .v-snackbar__wrapper',
}

/**
 * Legacy `Themes.vue` renders one `theme-select-snackbar` per tab (`:173`, `:492`) and keeps both in the DOM, so every bar selector is
 * restricted to the visible one. Checks Astra and GeneratePress (cards 1 and 2 of the page): the bar has "Update" and "Remove" for the two.
 */
function checkThemeCards (app: 'legacy' | 'next'): StateAction {
  return async page => {
    for (const index of [1, 2]) {
      await page.locator('.data-iterator-card input[type="checkbox"]').nth(index).evaluate((el: HTMLElement) => el.click())
    }
    await settled(page.locator(themesSnackbarWrapper[app]).filter({ visible: true }).first())
  }
}

export const selectThemes: { legacy: StateAction, next: StateAction } = { legacy: checkThemeCards('legacy'), next: checkThemeCards('next') }

/** The bar and the selected card. The mass-action probes are desktop only (the row is shown above the breakpoint, the compact bar has no row). */
export const themesSelectionProbes: Probe[] = [
  {
    key: 'snackbar',
    legacy: page => page.locator(themesSnackbarWrapper.legacy).filter({ visible: true }).first(),
    next: page => page.locator(themesSnackbarWrapper.next).filter({ visible: true }).first(),
    internal: true,
  },
  {
    key: 'snackbar-count',
    legacy: page => page.locator('.snackbar__item-number:visible').first(),
    next: page => page.getByTestId('select-snackbar-count'),
    when: isDesktop,
  },
  {
    key: 'snackbar-update',
    legacy: page => page.locator('.snackbar__row:visible .btn-icon-horizontal').nth(0),
    next: page => page.locator('.snackbar__row:visible .btn-icon-horizontal').nth(0),
    when: isDesktop,
  },
  {
    key: 'snackbar-remove',
    legacy: page => page.locator('.snackbar__row:visible .v-btn').first(),
    next: page => page.locator('.snackbar__row:visible .v-btn').first(),
    when: isDesktop,
  },
  {
    key: 'selected-card',
    legacy: page => page.locator('.data-iterator-card--selected').nth(0),
    next: page => page.locator('.data-iterator-card--selected').nth(0),
  },
  {
    key: 'selected-card-checkbox',
    legacy: page => page.locator('.data-iterator-card--selected .data-iterator-card__checkbox-container').nth(0),
    next: page => page.locator('.data-iterator-card--selected .data-iterator-card__checkbox-container').nth(0),
  },
]

/** The row counts of the bar: three `.btn-icon-horizontal` on desktop (Update, Select all, Deselect); the check skips the compact bar. */
export const themesSnackbarRowActions: StateAction = async page => {
  if ((page.viewportSize()?.width ?? 0) < 976) {
    return
  }
  await expect(page.locator('.snackbar__row:visible .btn-icon-horizontal'), 'snackbar mass actions: 3').toHaveCount(3)
}

// Phase 15: Add New, the featured list. Opening Add New is a click on the visible "Add New" button (`.add-new-button`, the title row; icon-only
// on mobile). `openAddNew` in `use-themes-page.ts` clears the term and loads `GET …/new/featured`. The title row, the search field and the
// back button are the same in every Add New state.

/** Opens the Add New tab with a click on the visible "Add New" button (`.add-new-button:visible`, the title row of both apps). */
export const openAddNew: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.add-new-button:visible').first().click()
  },
  next: async page => {
    await page.locator('.add-new-button:visible').first().click()
  },
}

/** The featured grid is up: its first card is "Featured Theme 1" (the first entry of `featuredThemes`). */
export const addFeaturedAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Featured Theme 1' }))],
  next: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Featured Theme 1' }))],
}

/** The back button of the Add New title row: the first button of the title box (icon-only in both apps). Located by its place, not by its
 * name: `button.back` is the accessible name in next only (`ThemesView.vue`, the `aria-label` exception), so `getByRole` would differ. */
export const addBackProbe: Probe = {
  key: 'add-back',
  legacy: page => page.locator('.page-title__title-box:visible .v-btn').first(),
  next: page => page.locator('.page-title__title-box:visible .v-btn').first(),
}

/** The search field of the Add New tab (the first visible textbox; `NewItemSearchCard`). */
export const addSearchProbe: Probe = {
  key: 'add-search',
  legacy: page => page.getByRole('textbox').filter({ visible: true }).first(),
  next: page => page.getByRole('textbox').filter({ visible: true }).first(),
}

/** The first featured card: the ribbon (`.featured-label`) and the card itself (`data-iterator-card--featured`, the first of the list). */
export const featuredCardProbe: Probe = {
  key: 'featured-card',
  legacy: page => page.locator('.data-iterator-card--featured').first(),
  next: page => page.locator('.data-iterator-card--featured').first(),
}

export const featuredLabelProbe: Probe = {
  key: 'featured-label',
  legacy: page => page.locator('.data-iterator-card--featured .featured-label').first(),
  next: page => page.locator('.data-iterator-card--featured .featured-label').first(),
}

/** The rating star of the featured card: the first `.mr-1` in its actions row (`StarIcon` in next, `v-icon.mr-1` in legacy). V2 names the row `.v-card__actions`, V4 `.v-card-actions`. */
const featuredThemeActions = '.data-iterator-card--featured :is(.v-card-actions, .v-card__actions)'

export const featuredStarProbe: Probe = {
  key: 'featured-star',
  legacy: page => page.locator(`${featuredThemeActions} .mr-1`).first(),
  next: page => page.locator(`${featuredThemeActions} .mr-1`).first(),
}

/** The screenshot of the first featured card (`v-img`, the `data-iterator-card__image` class both apps render). */
export const featuredImageProbe: Probe = {
  key: 'featured-image',
  legacy: page => page.locator('.data-iterator-card--featured .data-iterator-card__image').first(),
  next: page => page.locator('.data-iterator-card--featured .data-iterator-card__image').first(),
}

/** Waits for the empty card (the `.no-data` block of `TableFullScreenMessage`, legacy `Themes.vue:222-245` and next `ThemesView.vue`). */
export const addEmptyAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.no-data__title'))],
  next: [waitFor(page => page.locator('.no-data__title'))],
}

/** Empty catalogue (`GET …/new/featured` -> `[]`): the empty card with its title, text, illustration and the "Back" button. The card is the
 * anchor of the Back button: the title-row back button has the same name in next, so a `getByRole` name lookup would match two buttons. */
export const themesAddEmptyProbes: Probe[] = [
  { key: 'add-empty-card', legacy: page => page.locator('.v-card', { has: page.locator('.no-data') }).first(), next: page => page.locator('.v-card', { has: page.locator('.no-data') }).first() },
  { key: 'add-empty-title', legacy: page => page.locator('.no-data__title'), next: page => page.locator('.no-data__title') },
  { key: 'add-empty-desc', legacy: page => page.locator('.no-data__desc'), next: page => page.locator('.no-data__desc') },
  { key: 'add-empty-illustration', legacy: page => page.locator('.no-data__img'), next: page => page.locator('.no-data__img') },
  { key: 'add-empty-back', legacy: page => page.locator('.v-card', { has: page.locator('.no-data') }).first().locator('.v-btn').first(), next: page => page.locator('.v-card', { has: page.locator('.no-data') }).first().locator('.v-btn').first() },
  themesTitleProbe,
  addBackProbe,
  addSearchProbe,
]

/** The featured list stays pending (`GET …/new/featured` -> `'hold'`). Legacy `Themes.vue:222` (`!filteredNewItems.length`) and next `newEmpty`
 * show the empty card while the catalogue is empty, so the loading state shows the empty card and no skeletons: the anchor waits for either. */
export const addLoadingAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.v-skeleton-loader, .no-data__title').first())],
  next: [waitFor(page => page.locator('.v-skeleton-loader, .no-data__title').first())],
}

/** The Add New loading probes: the title row and the search field stay, the card skeleton probe is absent unless the catalogue already has items. */
export const themesAddLoadingProbes: Probe[] = [themesTitleProbe, addBackProbe, addSearchProbe, themesCardSkeletonProbe]

// Phase 16: Add New search (`instance-themes-add-results`, `-add-table`). The term is typed into the visible Add New field (legacy
// `NewItemSearchCard`, 300 ms debounce). Legacy's `_.debounce` reads `Date.now()`, so these states run without a fixed clock; the anchor
// waits out the debounce, with no fixed sleep.
const addSearchField = (page: Page): Locator => page.getByRole('textbox').filter({ visible: true }).first()

/** Types the term `blog` into the Add New search field (`GET …/wordpress/themes/new/search/blog` answers with `searchThemes`). */
export const typeAddSearch: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await addSearchField(page).fill('blog')
  },
  next: async page => {
    await addSearchField(page).fill('blog')
  },
}

/** The search results are up: the card of "Blog Theme" (`searchThemes[0]`). No ribbon: only the featured list carries it. */
export const addResultsAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Blog Theme' }))],
  next: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Blog Theme' }))],
}

/** The result card of the grid (`:visible`: legacy keeps the hidden installed tab, with its own cards, in the DOM). */
export const addResultsCardProbe: Probe = {
  key: 'results-card',
  legacy: page => page.locator('.data-iterator-card:visible').first(),
  next: page => page.locator('.data-iterator-card:visible').first(),
}

/** The pagination footer of the visible Add New grid (legacy keeps the installed tab's footer in the DOM). */
export const addResultsFooterProbe: Probe = {
  key: 'add-footer',
  legacy: page => page.locator('.data-iterator-footer:visible').first(),
  next: page => page.locator('.data-iterator-footer:visible').first(),
}

/**
 * Switches the Add New tab to the table (desktop). The title row of the visible tab is [back, grid, list]: the list button is the third one
 * (the installed tab's row, which legacy keeps in the DOM hidden, is excluded by `:visible`).
 */
export const switchAddToTable: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.page-title__title-box:visible button').nth(2).click()
  },
  next: async page => {
    await page.locator('.page-title__title-box:visible button').nth(2).click()
  },
}

/** The table of the search results: the `.v-card.data-table` that holds "Blog Theme" (the installed table is hidden in the legacy DOM). */
const addTableCard = (page: Page): Locator => page.locator('.v-card.data-table', { hasText: 'Blog Theme' })

/** Waits for the results table: its row is "Blog Theme". */
export const addTableAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => addTableCard(page).locator('tbody tr', { hasText: 'Blog Theme' }))],
  next: [waitFor(page => addTableCard(page).locator('tbody tr', { hasText: 'Blog Theme' }))],
}

export const addTableProbe: Probe = {
  key: 'add-table',
  legacy: page => addTableCard(page).first(),
  next: page => addTableCard(page).first(),
}

/** The image of the row: the `v-avatar` of the name cell (`screenshot_url` is null in the fixture, so the avatar shows its empty image). */
export const addTableImageProbe: Probe = {
  key: 'add-table-image',
  legacy: page => addTableCard(page).locator('tbody tr').first().locator('.v-avatar'),
  next: page => addTableCard(page).locator('tbody tr').first().locator('.v-avatar'),
}

/** The name of the row (`.bold` in the name cell, both apps). */
export const addTableNameProbe: Probe = {
  key: 'add-table-name',
  legacy: page => addTableCard(page).locator('tbody tr').first().locator('.name-item .bold'),
  next: page => addTableCard(page).locator('tbody tr').first().locator('.name-item .bold'),
}

/** The rating label of the row (`b.p-4` after the star, both apps). */
export const addTableRatingProbe: Probe = {
  key: 'add-table-rating',
  legacy: page => addTableCard(page).locator('tbody tr').first().locator('b.p-4'),
  next: page => addTableCard(page).locator('tbody tr').first().locator('b.p-4'),
}

/** The install button of the row: the second button of `.actions-row` (Preview comes first). Its width is the 38 px class of phase 3. */
export const addTableInstallProbe: Probe = {
  key: 'add-table-install',
  legacy: page => addTableCard(page).locator('tbody tr').first().locator('.actions-row button').nth(1),
  next: page => addTableCard(page).locator('tbody tr').first().locator('.actions-row button').nth(1),
}

/** The table's own probes: the title row and search field, then the table card and the first row (image, name, rating, Install). */
export const addTableProbes: Probe[] = [themesTitleProbe, addBackProbe, addSearchProbe, addTableProbe, addTableImageProbe, addTableNameProbe, addTableRatingProbe, addTableInstallProbe]

// Phase 17: install from the catalogue (`ThemesActionsMixin.js:8-34`). The install button of "Featured Theme 1" (the first button of the card's
// hover overlay, `.instance-actions__content`, both apps) opens the dialog titled "Install Theme" (`heading.instance.advanced.theme.modal.install.title`,
// `translation.en.json:1093`); its submit is "Install" (`button.install`). The target box shows the name and the rating: legacy renders the
// rating under `v-if="item.rating"` (`Themes.vue:566`), and this card has `rating: 100`, so the box carries the star and "5".

const INSTALL_THEME_TITLE = 'Install Theme'

/** The featured card "Featured Theme 1" (`featuredThemes[0]`, the first card of the Add New grid). */
function featuredOneCard (page: Page): Locator {
  return page.locator('.data-iterator-card', { hasText: 'Featured Theme 1' }).first()
}

/** Opens the install dialog with a click on the card's install button (`evaluate`, so the page does not scroll under the dialog). */
export const openThemeInstall: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await featuredOneCard(page).locator('.instance-actions__content .v-btn').first().evaluate((el: HTMLElement) => el.click())
    await expect(themeInstallModal(page, 'legacy')).toBeVisible()
  },
  next: async page => {
    await featuredOneCard(page).locator('.instance-actions__content .v-btn').first().evaluate((el: HTMLElement) => el.click())
    await expect(themeInstallModal(page, 'next')).toBeVisible()
  },
}

/** The install dialog: the legacy `.basic-modal` in the open dialog (titled), next the host's `instances-modal` (as the activation dialog). */
export function themeInstallModal (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.v-dialog--active .basic-modal').filter({ hasText: INSTALL_THEME_TITLE })
    : page.getByTestId('instances-modal')
}

/** Submits the install dialog with its "Install" button (exact name, so the card's install button is not matched). */
export function submitThemeInstall (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await themeInstallModal(page, app).getByRole('button', { name: 'Install', exact: true }).click()
  }
}

/** The install dialog probes: the dialog, its title, the grey target box, the rating inside it, the message, and the submit and cancel buttons. */
export const themeInstallModalProbes: Probe[] = [
  {
    key: 'install-modal',
    legacy: page => themeInstallModal(page, 'legacy'),
    next: page => themeInstallModal(page, 'next'),
  },
  {
    key: 'install-modal-title',
    legacy: page => themeInstallModal(page, 'legacy').locator('.v-card__title').first(),
    next: page => themeInstallModal(page, 'next').locator('.v-card-title').first(),
  },
  {
    key: 'install-modal-target',
    legacy: page => themeInstallModal(page, 'legacy').locator('.target-item-box').first(),
    next: page => themeInstallModal(page, 'next').locator('.target-item-box').first(),
  },
  {
    key: 'install-modal-rating',
    legacy: page => themeInstallModal(page, 'legacy').locator('.target-item-box b').first(),
    next: page => themeInstallModal(page, 'next').locator('.target-item-box b').first(),
  },
  {
    key: 'install-modal-message',
    legacy: page => themeInstallModal(page, 'legacy').locator('.v-card__text p').first(),
    next: page => themeInstallModal(page, 'next').locator('.v-card-text p').first(),
    internal: true,
  },
  {
    key: 'install-modal-submit',
    legacy: page => themeInstallModal(page, 'legacy').getByRole('button', { name: 'Install', exact: true }),
    next: page => themeInstallModal(page, 'next').getByRole('button', { name: 'Install', exact: true }),
  },
  {
    key: 'install-modal-cancel',
    legacy: page => themeInstallModal(page, 'legacy').getByRole('button', { name: 'Cancel', exact: true }),
    next: page => themeInstallModal(page, 'next').getByRole('button', { name: 'Cancel', exact: true }),
    internal: true,
  },
]

/** The message of the refused install (the 500 body; the alert shows it, the dialog is closed in both apps). */
export const themesInstallRefusedMessage = 'The theme could not be installed.'

/** The install request of "Featured Theme 1" answers 500 with `{ message }` (`POST …/themes/new/featured-theme-1/install`). */
export const themesInstallRefusedHandler: Record<string, Handler> = {
  [`POST /projects/${ADVANCED_PROJECT_ID}/wordpress/themes/new/featured-theme-1/install`]: { status: 500, json: { message: themesInstallRefusedMessage } },
}

/** The alert of the refused install is open and settled before the pointer rests on it (the alert stack animates in, then closes after 5 s). */
function themesInstallRefusedAlert (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(themesErrorAlert(page).filter({ hasText: themesInstallRefusedMessage }), `${app}: refused install alert`).toBeVisible()
    await settled(themesErrorAlert(page))
    await themesErrorAlert(page).locator('.alert__text-box').hover()
  }
}

/** The refused path: open the install dialog, submit it, then check the alert (the POST answers 500 through `themesInstallRefusedHandler`). */
export const themesInstallErrorActions: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [openAddNew.legacy, ...addFeaturedAnchor.legacy, openThemeInstall.legacy, submitThemeInstall('legacy'), themesInstallRefusedAlert('legacy')],
  next: [openAddNew.next, ...addFeaturedAnchor.next, openThemeInstall.next, submitThemeInstall('next'), themesInstallRefusedAlert('next')],
}

// ---------------------------------------------------------------------------------------------
// Phase 18: the update and the delete dialogs of an installed theme (`ThemesActionsMixin.js:168-183` update, `:293-320` delete). Update is in
// the card only with an update (lite `ThemeCard.vue`, `v-if="item.update === 'available'"`; "Astra" in the fixtures). Remove is the delete
// button: it is disabled on the active card, so the delete state uses the inactive "GeneratePress". Both dialogs come from `instance-plugins.ts`
// (`actionDialog`, `actionDialogProbes`): the same `.basic-modal` / `instances-modal` lookup as the activation and install dialogs.
// ---------------------------------------------------------------------------------------------

export const UPDATE_THEME_MESSAGE = 'Are you sure that you want to update this theme to version'
export const DELETE_THEME_MESSAGE = 'Are you sure that you want to delete this theme?'

/** Clicks the card's button named `name` (`BaseIconButton` text, exact) and waits for the dialog holding `text`. The click is an `evaluate`, so the page does not scroll under the dialog. */
export function openThemeCardAction (cardText: string, name: string, text: string): { legacy: StateAction, next: StateAction } {
  const run = (app: 'legacy' | 'next'): StateAction => async page => {
    const button = page.locator('.data-iterator-card', { hasText: cardText }).first().getByRole('button', { name, exact: true })
    await button.evaluate((el: HTMLElement) => el.click())
    await expect(actionDialog(page, app, text), `${app}: ${cardText} ${name} dialog`).toBeVisible()
  }
  return { legacy: run('legacy'), next: run('next') }
}

/** The Delete button of the dialog stays disabled until the confirm checkbox is ticked (lite `BasicModal.vue:537-541`, next `buttonState`). */
export function themeDeleteDisabledCheck (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(actionDialog(page, app, DELETE_THEME_MESSAGE).getByRole('button', { name: 'Delete', exact: true }), `${app}: delete disabled before confirm`).toBeDisabled()
  }
}

/** The confirm checkbox of the delete dialog (`form.confirmDelete.theme_one`, "Yes, I understand and want to remove this theme."). */
export const themeDeleteConfirmProbe: Probe = {
  key: 'delete-confirm',
  legacy: page => actionDialog(page, 'legacy', DELETE_THEME_MESSAGE).getByRole('checkbox'),
  next: page => actionDialog(page, 'next', DELETE_THEME_MESSAGE).getByRole('checkbox'),
}
