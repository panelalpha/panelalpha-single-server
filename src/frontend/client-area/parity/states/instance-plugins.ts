import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled } from './auth'
import { waitFor } from './hosting'
import { INSTANCE_PAGE_PRIVILEGES, instancePageHandlers, instancePageRaw } from './instance'
import { liteShellHome } from './instances'
import { isDesktop, isMobile, shellHandlers } from './shell'

// S-88 ui-instance-plugins: the Plugins screen of a project on app-lite (`/projects/:id/plugins`, `target: 'lite'`). Not a spec file (testMatch is
// `*.parity.ts`). States: `instance-plugins.parity.ts`. Plan: context/changes/ui-instance-plugins/plan.md.
// `toProjectRoutes` is a local copy (as in `instance-backups.parity.ts`): nothing is exported from that file.

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Backups states do). */
const { admin: _styleManagerAdmin, ...liteHomeWithoutAdmin } = liteShellHome()
export const PLUGINS_HOME: Record<string, unknown> = liteHomeWithoutAdmin

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

/** A plugin of the project (`GET …/wordpress/plugins`, `InstalledPlugin` in `instance-plugins.api.ts`). Fields not given take the defaults. */
type PluginRow = Record<string, unknown>

function plugin (patch: PluginRow): PluginRow {
  return {
    name: 'plugin',
    title: 'Plugin',
    description: 'A short description of the plugin.',
    version: '1.0.0',
    status: 'inactive',
    update: null,
    update_version: null,
    async_status: { install: null, update: null },
    activation_disabled: false,
    ...patch,
  }
}

/**
 * The ten installed plugins of the page (2 pages of 8): an active one, an active one with an update, an inactive one, one whose activation is
 * disabled, one with a pending update (`async_status.update`), and one with a description over 100 characters (the "Read more" link).
 */
export const installedRows: PluginRow[] = [
  plugin({ name: 'akismet', title: 'Akismet Anti-Spam', version: '5.3.1', status: 'active' }),
  plugin({ name: 'classic-editor', title: 'Classic Editor', version: '1.6.3', status: 'active', update: 'available', update_version: '1.6.4' }),
  plugin({ name: 'hello-dolly', title: 'Hello Dolly', version: '1.7.2', status: 'inactive' }),
  plugin({ name: 'contact-form', title: 'Contact Form Builder', version: '2.4.0', status: 'inactive', activation_disabled: true }),
  plugin({ name: 'seo-toolkit', title: 'SEO Toolkit', version: '3.1.0', status: 'active', async_status: { install: null, update: 'pending' } }),
  plugin({
    name: 'long-description',
    title: 'Backup Assistant',
    version: '4.0.2',
    status: 'inactive',
    description: 'Creates scheduled backups of the database and the uploads folder, keeps a rolling history of the snapshots and lets you restore a single file without touching the rest of the site.',
  }),
  plugin({ name: 'cache-boost', title: 'Cache Boost', version: '0.9.4', status: 'inactive' }),
  plugin({ name: 'image-optimizer', title: 'Image Optimizer', version: '2.0.0', status: 'active' }),
  plugin({ name: 'gallery-pro', title: 'Gallery Pro', version: '1.2.0', status: 'inactive' }),
  plugin({ name: 'form-mailer', title: 'Form Mailer', version: '6.1.0', status: 'active' }),
]

/** One plugin of the WordPress.org catalogue (`RepositoryPlugin`). Featured entries carry no `description`. */
function repositoryPlugin (index: number, patch: PluginRow = {}): PluginRow {
  return {
    id: index,
    type: 'plugin',
    name: `Featured Plugin ${index}`,
    slug: `featured-plugin-${index}`,
    version: `1.${index}.0`,
    short_description: `Short description of featured plugin ${index}.`,
    icons: null,
    status: 'publish',
    tested: '6.6',
    rating: 100 - index * 9,
    active_installs: 10_000 * index,
    last_updated: '2026-09-01',
    ...patch,
  }
}

/** The nine featured catalogue entries of the Add New page (rating 0-100, as the API sends it; the stars show `rating / 100`). */
export const featuredRows: PluginRow[] = Array.from({ length: 9 }, (_, index) => repositoryPlugin(index + 1))

/** Search results for the term `seo` (phase 17): the results carry `description` and `icons`, so the table and the Read more link have text. */
export const searchRows: PluginRow[] = [
  repositoryPlugin(1, { name: 'SEO Helper', slug: 'seo-helper', description: 'Adds meta tags, sitemaps and a readability check to every post.', icons: null }),
  repositoryPlugin(2, { name: 'Search Boost', slug: 'search-boost', description: 'Improves the site search with fuzzy matching and synonyms.', icons: null }),
]

/** The `GET …/plugins` list handler: `{ data: rows }`. */
export const pluginsList = (rows: PluginRow[] = installedRows): Handler => ({ json: { data: rows } })

/**
 * Every request the frame, the shell and the Plugins screen make on project 1 (the frame's `/instances/1` calls rewritten to `/projects`).
 * `overrides` replace any key, so a state changes one call without losing the rest.
 */
export function pluginsHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...shellHandlers([], 'projects'),
    ...toProjectRoutes(instancePageHandlers({ 'GET /instances/1': { json: { data: instancePageRaw(1, { privileges: INSTANCE_PAGE_PRIVILEGES }) } } })),
    'GET /projects/1/app-health': APP_HEALTH_OK,
    // The deployed lite build asks for the deploy source of the project; next never does, so only legacy hits it.
    'GET /projects/1/source': { json: { data: null } },
    'GET /projects/1/wordpress/plugins': pluginsList(),
    'GET /projects/1/wordpress/plugins/new/featured': { json: { data: featuredRows } },
    'GET /projects/1/wordpress/plugins/new/search/seo': { json: { data: searchRows } },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Probes (plan "Overview"): the title is the readiness anchor, then the "Add New" button, the active card (green band), the card with an update
// (red band), the inactive card and the footer of the pagination. Legacy and next keep the same classes (`data-iterator-card--green|red`).
// ---------------------------------------------------------------------------------------------

export const pluginsTitleProbe: Probe = {
  key: 'plugins-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export const pluginsAddNewProbe: Probe = {
  key: 'add-new',
  legacy: page => page.locator('.add-new-button').first(),
  next: page => page.locator('.add-new-button').first(),
}

export const pluginsActiveCardProbe: Probe = {
  key: 'card-active',
  legacy: page => page.locator('.data-iterator-card--green').first(),
  next: page => page.locator('.data-iterator-card--green').first(),
}

export const pluginsUpdateCardProbe: Probe = {
  key: 'card-update',
  legacy: page => page.locator('.data-iterator-card--red').first(),
  next: page => page.locator('.data-iterator-card--red').first(),
}

export const pluginsInactiveCardProbe: Probe = {
  key: 'card-inactive',
  legacy: page => page.locator('.data-iterator-card:not(.data-iterator-card--green):not(.data-iterator-card--red)').first(),
  next: page => page.locator('.data-iterator-card:not(.data-iterator-card--green):not(.data-iterator-card--red)').first(),
}

export const pluginsFooterProbe: Probe = {
  key: 'pagination-footer',
  legacy: page => page.locator('.data-iterator-footer').first(),
  next: page => page.locator('.data-iterator-footer').first(),
}

export const pluginsProbes: Probe[] = [
  pluginsTitleProbe,
  pluginsAddNewProbe,
  pluginsActiveCardProbe,
  pluginsUpdateCardProbe,
  pluginsInactiveCardProbe,
  pluginsFooterProbe,
]

// Masks: none in the default state. The plugin icons are not sent (`icons: null`), so the fallback icon is the same in both apps; the skeleton
// animation is decided at the first measurement (`parity:quick`), not in advance.

// Phase 8: the table view and the second page. Both apps keep `.page-title__title-box` around the list/grid switch (`ListGridSwitch`, desktop
// only: on mobile the switch is hidden), and the footer's next arrow is `.v-pagination__next` (V2 `li` with a button, V4 the button).

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

/** Moves the footer to the second page (plugins 9 and 10 of 10: two cards), then waits until the grid shows exactly those two cards. */
export const goToSecondPage: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.data-iterator-footer').getByRole('button', { name: 'Next page' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.data-iterator-card').length === 2)
  },
  next: async page => {
    await page.locator('.data-iterator-footer').getByRole('button', { name: 'Next page' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.data-iterator-card').length === 2)
  },
}

export const pluginsTableProbe: Probe = {
  key: 'table',
  legacy: page => page.locator('.v-card.data-table').first(),
  next: page => page.locator('.v-card.data-table').first(),
}

export const pluginsTableSortProbe: Probe = {
  key: 'table-sort',
  legacy: page => page.locator('.custom-sort').first(),
  next: page => page.locator('.custom-sort').first(),
}

/** The row bar of an active plugin (green) and of a plugin with an update (red): the `::after` of `.item-bordered--*` is the bar. */
export const pluginsTableGreenRowProbe: Probe = {
  key: 'row-green',
  legacy: page => page.locator('.item-bordered--green').first(),
  next: page => page.locator('.item-bordered--green').first(),
}

export const pluginsTableRedRowProbe: Probe = {
  key: 'row-red',
  legacy: page => page.locator('.item-bordered--red').first(),
  next: page => page.locator('.item-bordered--red').first(),
}

/** The status chip of the table (`StatusLabel`, `small`: class `chipTable` in both apps). */
export const pluginsTableChipProbe: Probe = {
  key: 'status-chip',
  legacy: page => page.locator('.chipTable').first(),
  next: page => page.locator('.chipTable').first(),
}

/** The first action button of the row with an update (the red row): its colour and state are measured, not its label. */
export const pluginsTableUpdateProbe: Probe = {
  key: 'table-update',
  legacy: page => page.locator('tr', { has: page.locator('.item-bordered--red') }).locator('.actions-row button').first(),
  next: page => page.locator('tr', { has: page.locator('.item-bordered--red') }).locator('.actions-row button').first(),
}

export const pluginsTableProbes: Probe[] = [
  pluginsTableProbe,
  pluginsTableSortProbe,
  pluginsTableGreenRowProbe,
  pluginsTableRedRowProbe,
  pluginsTableChipProbe,
  pluginsTableUpdateProbe,
  pluginsFooterProbe,
]

/** The second page (plugins 9 and 10): the anchor is the second card, the active "Form Mailer" (`installedRows[9]`). */
export const pluginsPageTwoCardProbe: Probe = {
  key: 'page-2-card',
  legacy: page => page.locator('.data-iterator-card').nth(1),
  next: page => page.locator('.data-iterator-card').nth(1),
}

export const pluginsPageTwoProbes: Probe[] = [pluginsPageTwoCardProbe, pluginsFooterProbe]

// Phase 9: the row hover. The table view is already on in the base state; the pointer rests on the first row and the row background is measured
// (`tbody tr`: V2 paints the row hover itself, V4 has none on this table).

/** The first row of the table: its background is the row hover, measured with the pointer resting on it. */
export const pluginsTableRowProbe: Probe = {
  key: 'table-row',
  legacy: page => page.locator('.v-card.data-table tbody tr').first(),
  next: page => page.locator('.v-card.data-table tbody tr').first(),
}

/**
 * The visible "Add New" button. The name lookup matches two buttons (the empty-state message keeps one in the DOM), so the button is located
 * by its class and visibility in both apps (`.add-new-button` is the same class in legacy and next, as the `add-new` probe uses).
 */
export function addNewButton (page: Page): Locator {
  return page.locator('.add-new-button:visible').first()
}

/** The hover overlay of "Add New": V2 paints it as the button's `::before`, V4 as `.v-btn__overlay` (as `buttonOverlayProbe` in `auth.ts`). */
export const addNewOverlayProbe: Probe = {
  key: 'add-new-overlay',
  legacy: page => addNewButton(page),
  next: page => addNewButton(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** Moves the pointer onto the visible "Add New" button. */
export const hoverAddNew: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await addNewButton(page).hover()
  },
  next: async page => {
    await addNewButton(page).hover()
  },
}

/** The pointer is still on "Add New" after the capture (the full-page resize can drop `:hover`), so the element under it is checked. */
export const addNewStillHovered: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expectHoveredOn(addNewButton(page), 'pointer on "Add New"')
  },
  next: async page => {
    await expectHoveredOn(addNewButton(page), 'pointer on "Add New"')
  },
}

/** Moves the pointer onto the first table row. */
export const hoverFirstTableRow: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-card.data-table tbody tr').first().hover()
  },
  next: async page => {
    await page.locator('.v-card.data-table tbody tr').first().hover()
  },
}

/** The pointer is still on the first row after the capture (the full-page resize can drop `:hover`), so the element under it is checked. */
export const firstTableRowStillHovered: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expectHoveredOn(page.locator('.v-card.data-table tbody tr').first(), 'pointer on the first table row')
  },
  next: async page => {
    await expectHoveredOn(page.locator('.v-card.data-table tbody tr').first(), 'pointer on the first table row')
  },
}

/** The element under the centre of `locator` is the element or one of its descendants (the pointer position is what the hover states guard). */
async function expectHoveredOn (locator: Locator, message: string): Promise<void> {
  const onTarget = await locator.evaluate(node => {
    const box = node.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return top !== null && node.contains(top)
  })
  expect(onTarget, message).toBe(true)
}

/**
 * Keyboard focus on the visible "Add New" (phase 10, matrix state `focus-visible`). A real `Tab` reaches the button, so the focus is keyboard
 * focus (`:focus-visible`), as a user gets it. The pointer is moved off the page first; the loop is capped (the top bar and the nav come first).
 */
export const focusAddNew: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.mouse.move(0, 0)
    await tabUntilFocused(page, addNewButton(page))
  },
  next: async page => {
    await page.mouse.move(0, 0)
    await tabUntilFocused(page, addNewButton(page))
  },
}

/** The focus is still on "Add New" after the capture, and V4's `.v-btn::after` focus ring is hidden (`_buttons.scss`; legacy paints none). */
export const addNewStillFocused: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(addNewButton(page), 'keyboard focus on "Add New"').toBeFocused()
  },
  next: async page => {
    await expect(addNewButton(page), 'keyboard focus on "Add New"').toBeFocused()
    const ring = await addNewButton(page).evaluate(node => getComputedStyle(node, '::after').opacity)
    expect(ring, 'V4 focus ring hidden').toBe('0')
  },
}

/** Presses `Tab` until `locator` has the focus; fails after 60 presses (the page has fewer focusable elements before the button). */
async function tabUntilFocused (page: Page, locator: Locator): Promise<void> {
  for (let press = 0; press < 60; press += 1) {
    await page.keyboard.press('Tab')
    if (await locator.evaluate(node => node.matches(':focus'))) {
      return
    }
  }
  throw new Error('Tab did not reach "Add New"')
}

/** The overlay of the focused "Add New" (V2 `::before`, V4 `.v-btn__overlay`); the same probe as the hover state, under its own key. */
export const addNewFocusOverlayProbe: Probe = {
  key: 'add-new-focus-overlay',
  legacy: page => addNewButton(page),
  next: page => addNewButton(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

// Phase 11: the disabled buttons. Disabled buttons follow the app, read from tokens (AGENTS.md rule 3):
// the disabled colour vs lite is an accepted exception (`view-review.md`), not a fix towards lite.

/** The card whose activation is not allowed (`activation_disabled`, in the default page: 4th of the 8 on page 1). */
function contactFormCard (page: Page): Locator {
  return page.locator('.data-iterator-card', { hasText: 'Contact Form Builder' })
}

/** The activate button of that card: the first button of its actions (`PluginCard.vue:114`, legacy `PluginCard.vue:97`). */
function contactFormActivate (page: Page): Locator {
  return contactFormCard(page).locator('button').first()
}

export const cardActivateProbe: Probe = {
  key: 'card-activate-disabled',
  legacy: page => contactFormActivate(page),
  next: page => contactFormActivate(page),
}

/** The disabled check after the capture, in both apps (a failure is a harness error, `state.ts:91`). */
export const cardActivateDisabled: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(contactFormActivate(page), 'activate disabled').toBeDisabled()
  },
  next: async page => {
    await expect(contactFormActivate(page), 'activate disabled').toBeDisabled()
  },
}

/** The green row (active, no update): its "Update" button is disabled (`PluginTable.vue:179`). The row actions are deactivate, update, delete. */
function noUpdateRow (page: Page): Locator {
  return page.locator('tr', { has: page.locator('.item-bordered--green') })
}

function noUpdateRowUpdate (page: Page): Locator {
  return noUpdateRow(page).locator('.actions-row button').nth(1)
}

export const tableUpdateDisabledProbe: Probe = {
  key: 'table-update-disabled',
  legacy: page => noUpdateRowUpdate(page),
  next: page => noUpdateRowUpdate(page),
}

export const tableUpdateDisabled: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(noUpdateRowUpdate(page), 'update disabled').toBeDisabled()
  },
  next: async page => {
    await expect(noUpdateRowUpdate(page), 'update disabled').toBeDisabled()
  },
}

// Phase 12: the activation modal and the refused activation. "Hello Dolly" is inactive with activation allowed (3rd card of page 1).
// Legacy and next close the dialog in `finally` after a failed activation (`PluginsActionsMixin.js:166-180`, `use-plugin-actions.ts:96`),
// so the error state keeps the alert only, not the dialog.

/** The card of "Hello Dolly" (inactive, activation allowed). */
function helloDollyCard (page: Page): Locator {
  return page.locator('.data-iterator-card', { hasText: 'Hello Dolly' })
}

/** Its activate button: the first button of the card's actions (`PluginCard.vue:116`, legacy `PluginCard.vue:97`). */
function helloDollyActivate (page: Page): Locator {
  return helloDollyCard(page).locator('button').first()
}

/** The activation dialog: the legacy `.basic-modal` in the open dialog (titled), next the host's `instances-modal`. The title is the lite copy `heading.instance.plugin.activate.title_one` (`translation.en.json:840`; the key is nested under a dotted name, so `tr` cannot read it). */
const ACTIVATE_TITLE = 'Activate Plugin'

export function activateModal (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.v-dialog--active .basic-modal').filter({ hasText: ACTIVATE_TITLE })
    : page.getByTestId('instances-modal')
}

/** Opens the activation dialog with a click on the card's button (`evaluate`, so the page does not scroll under the dialog). */
export const openActivate: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await helloDollyActivate(page).evaluate((el: HTMLElement) => el.click())
    await expect(activateModal(page, 'legacy')).toBeVisible()
  },
  next: async page => {
    await helloDollyActivate(page).evaluate((el: HTMLElement) => el.click())
    await expect(activateModal(page, 'next')).toBeVisible()
  },
}

/** Submits the dialog with its "Activate" button (the first button of the dialog's actions; the copy is `button.activate`). */
export function submitActivate (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await activateModal(page, app).getByRole('button', { name: 'Activate', exact: true }).click()
  }
}

/** The dialog probes: the card, the message, and the submit and cancel buttons (the `modalProbes` shape of the Backups states). */
export const activateModalProbes: Probe[] = [
  {
    key: 'activate-modal',
    legacy: page => activateModal(page, 'legacy'),
    next: page => activateModal(page, 'next'),
  },
  {
    key: 'activate-modal-message',
    legacy: page => activateModal(page, 'legacy').locator('.v-card__text p').first(),
    next: page => activateModal(page, 'next').locator('.v-card-text p').first(),
    internal: true,
  },
  {
    key: 'activate-modal-submit',
    legacy: page => activateModal(page, 'legacy').getByRole('button', { name: 'Activate', exact: true }),
    next: page => activateModal(page, 'next').getByRole('button', { name: 'Activate', exact: true }),
  },
  {
    key: 'activate-modal-cancel',
    legacy: page => activateModal(page, 'legacy').getByRole('button', { name: 'Cancel', exact: true }),
    next: page => activateModal(page, 'next').getByRole('button', { name: 'Cancel', exact: true }),
    internal: true,
  },
]

/** The alert of the refused activation: the error alert of the alert manager (`.alert-manager .alert--error` in both apps, as the auth states). */
export const errorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/** The message of the refused activation: the 422 body the alert shows (`PluginsActionsMixin.js:166-180`, `use-plugin-actions.ts:79-80`). */
export const activateRefusedMessage = 'The plugin could not be activated.'

/** The activation request of "Hello Dolly" answers 422 with `{ message }`: the alert shows the message, the dialog is closed. */
export const activateRefusedHandler: Record<string, Handler> = {
  'PUT /projects/1/wordpress/plugins/hello-dolly/activate': { status: 422, json: { message: activateRefusedMessage } },
}

/** The alert stays open while the screenshot is taken: the pointer rests on its text box (the 5 s auto-close, as the auth alert states). */
export const errorAlertStillHovered: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await errorAlert(page).locator('.alert__text-box').hover()
  },
  next: async page => {
    await errorAlert(page).locator('.alert__text-box').hover()
  },
}

// Phase 15: the selection. A click on a card's checkbox (`evaluate`, so the pointer does not move) checks the card; the bar (`.snackbar`, the kit
// `SelectSnackbar`, always dark) shows the count and the mass actions. The desktop row is the one above 966 px (legacy
// `PluginsSelectSnackbar.vue:6`, next `SelectSnackbar.vue`); below it the compact bar has the close button, the label and the "more" menu.

/** The card checkboxes of both apps: one `input` per card of the grid (`PluginCard.vue`, the checkbox container). */
const cardCheckbox = '.data-iterator-card input[type="checkbox"]'

/** The bar wrapper of both apps (V2 `.v-snack__wrapper`, V4 `.v-snackbar__wrapper`), under the `.snackbar` class both render. */
const selectedSnackbarWrapper: { legacy: string, next: string } = {
  legacy: '.snackbar .v-snack__wrapper',
  next: '.snackbar .v-snackbar__wrapper',
}

/** Checks the cards at `indices` (positions on the page) the way a user does, then waits for the bar to settle after the last click. */
export function checkCards (indices: number[]): { legacy: StateAction, next: StateAction } {
  const run = (app: 'legacy' | 'next'): StateAction => async page => {
    for (const index of indices) {
      await page.locator(cardCheckbox).nth(index).evaluate((el: HTMLElement) => el.click())
    }
    await settled(page.locator(selectedSnackbarWrapper[app]))
  }
  return { legacy: run('legacy'), next: run('next') }
}

/** The mass-action row of the bar (desktop): activate, deactivate, update (only with an update in the selection), select all, deselect. */
export function snackbarRowActions (expected: number): StateAction {
  return async page => {
    if ((page.viewportSize()?.width ?? 0) < 976) {
      return
    }
    await expect(page.locator('.snackbar__row .btn-icon-horizontal'), `snackbar mass actions: ${expected}`).toHaveCount(expected)
  }
}

/**
 * The grid of page 1 is sorted by title (Akismet, Backup Assistant, Cache Boost, Classic Editor, Contact Form, Form Mailer, Gallery Pro,
 * Hello Dolly; the legacy snapshot shows that order). Selection of Akismet (active, no update) and Classic Editor (update available): the bar
 * offers "Update" too.
 */
export const selectWithUpdate = checkCards([0, 3])

/** Selection of Akismet and Cache Boost (no update): the bar has no "Update". */
export const selectNoUpdate = checkCards([0, 2])

export const selectionProbes: Probe[] = [
  {
    key: 'snackbar',
    legacy: page => page.locator(selectedSnackbarWrapper.legacy),
    next: page => page.locator(selectedSnackbarWrapper.next),
    internal: true,
  },
  {
    key: 'snackbar-count',
    legacy: page => page.locator('.snackbar__item-number'),
    next: page => page.getByTestId('select-snackbar-count'),
    when: isDesktop,
  },
  {
    key: 'snackbar-activate',
    legacy: page => page.locator('.snackbar__row .btn-icon-horizontal').nth(0),
    next: page => page.locator('.snackbar__row .btn-icon-horizontal').nth(0),
    when: isDesktop,
  },
  {
    key: 'snackbar-deactivate',
    legacy: page => page.locator('.snackbar__row .btn-icon-horizontal').nth(1),
    next: page => page.locator('.snackbar__row .btn-icon-horizontal').nth(1),
    when: isDesktop,
  },
  {
    key: 'snackbar-remove',
    legacy: page => page.locator('.snackbar__row .v-btn').first(),
    next: page => page.locator('.snackbar__row .v-btn').first(),
    when: isDesktop,
  },
  {
    key: 'snackbar-close',
    legacy: page => page.locator('.snackbar .snackbar-button'),
    next: page => page.locator('.snackbar .snackbar-button'),
    internal: true,
    when: isMobile,
  },
  {
    key: 'snackbar-more',
    legacy: page => page.locator('.snackbar .v-btn.ml-auto'),
    next: page => page.getByTestId('select-snackbar-more'),
    when: isMobile,
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

// Phase 16: Add New (legacy `Plugins.vue:643-652`: opening it clears the term and loads the featured list). The click is on the visible button.
/** Opens the Add New tab with a click on the visible "Add New" button (desktop: the one in the title row). */
export const openAddNew: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await addNewButton(page).click()
  },
  next: async page => {
    await addNewButton(page).click()
  },
}

/** The featured grid is up: its first card is "Featured Plugin 1" (the catalogue entry with the highest rating). */
export const addFeaturedAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Featured Plugin 1' }))],
  next: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'Featured Plugin 1' }))],
}

/** The Add New title row: the title is "New Plugins" (`heading.instance.plugin.add.title`); the back button is icon-only (no name in either app). */
// Legacy keeps the installed tab in the DOM (`v-tab-item`), so the visible title row is the one of the Add New tab.
export const addTitleProbe: Probe = {
  key: 'add-title',
  legacy: page => page.locator('.page-title__title:visible'),
  next: page => page.locator('.page-title__title:visible'),
}

export const addBackProbe: Probe = {
  key: 'add-back',
  legacy: page => page.locator('.page-title__title-box:visible .v-btn').first(),
  next: page => page.locator('.page-title__title-box:visible .v-btn').first(),
}

/** The search field of the Add New tab (the first visible textbox: legacy keeps the hidden installed tab in the DOM). */
export const addSearchProbe: Probe = {
  key: 'add-search',
  legacy: page => page.getByRole('textbox').filter({ visible: true }).first(),
  next: page => page.getByRole('textbox').filter({ visible: true }).first(),
}

/** The first featured card: the ribbon, the special icon (`StarIcon` in next, the legacy star icon) and the card itself. */
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

/** The rating star of the featured card (legacy `v-icon.mr-1` with `:percent`, next `StarIcon.mr-1`), first in the actions row. */
// V2 (legacy) names the actions row `.v-card__actions`, V4 `.v-card-actions`: both are matched.
const featuredActions = '.data-iterator-card--featured :is(.v-card-actions, .v-card__actions)'

export const featuredStarProbe: Probe = {
  key: 'featured-star',
  legacy: page => page.locator(`${featuredActions} .mr-1`).first(),
  next: page => page.locator(`${featuredActions} .mr-1`).first(),
}

/** The install button of the featured card (`v-btn`, min/max-width 38 px): the first button of the actions row in both apps. */
export const featuredInstallProbe: Probe = {
  key: 'featured-install',
  legacy: page => page.locator(`${featuredActions} .v-btn`).first(),
  next: page => page.locator(`${featuredActions} .v-btn`).first(),
}

/** The empty Add New state (`TableFullScreenMessage`, legacy `Plugins.vue:202-232`): the card, its title, text, illustration and the Back button. */
export const addEmptyProbes: Probe[] = [
  { key: 'add-empty-card', legacy: page => page.locator('.v-main .v-card', { has: page.locator('.no-data') }).first(), next: page => page.locator('.v-main .v-card', { has: page.locator('.no-data') }).first() },
  { key: 'add-empty-title', legacy: page => page.locator('.no-data__title'), next: page => page.locator('.no-data__title') },
  { key: 'add-empty-desc', legacy: page => page.locator('.no-data__desc'), next: page => page.locator('.no-data__desc') },
  { key: 'add-empty-illustration', legacy: page => page.locator('.no-data__img'), next: page => page.locator('.no-data__img') },
  // The named "Back" button of the empty card (the title-row back button is icon-only in both apps).
  { key: 'add-empty-back', legacy: page => page.getByRole('button', { name: 'Back', exact: true }), next: page => page.getByRole('button', { name: 'Back', exact: true }) },
  // Legacy keeps the title row and the search above the empty card (`Plugins.vue:165-200`); next does not yet (phase 16, triage).
  addTitleProbe,
  addSearchProbe,
]

/** Empty catalogue (`GET …/new/featured` -> `[]`): the empty card with "Start Searching For New Plugins". */
export const addEmptyHandler: Handler = { json: { data: [] } }

/** Waits for the empty card (the `.no-data` block of `TableFullScreenMessage`). */
export const addEmptyAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.no-data__title'))],
  next: [waitFor(page => page.locator('.no-data__title'))],
}

/** The featured list stays pending (`'hold'`): the readiness anchor is whatever the Add New tab shows first, the skeletons or the empty card. */
export const addLoadingAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.v-skeleton-loader, .no-data__title'))],
  next: [waitFor(page => page.locator('.v-skeleton-loader, .no-data__title'))],
}

export const addLoadingSkeletonProbe: Probe = {
  key: 'add-card-skeleton',
  legacy: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader.title') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader.title') }).first(),
}

// Phase 17: Add New search (`instance-plugins-add-results`, `-add-table`). The term is typed into the visible field of the Add New tab (legacy
// `NewItemSearchCard`, 300 ms debounce). Legacy's `_.debounce` reads `Date.now()`, so these states run without a fixed clock.
// The anchor is the result card of "SEO Helper" (`searchRows[0]`), which waits out the debounce; no clock and no fixed sleep.
const addSearchField = (page: Page): Locator => page.getByRole('textbox').filter({ visible: true }).first()

/** Types the term `seo` into the Add New search field (`GET …/plugins/new/search/seo` answers with `searchRows`). */
export const typeAddSearch: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await addSearchField(page).fill('seo')
  },
  next: async page => {
    await addSearchField(page).fill('seo')
  },
}

/** The search results are up: the grid card of "SEO Helper" (no ribbon: `item.featured` is set only for the featured list). */
export const addResultsAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'SEO Helper' }))],
  next: [waitFor(page => page.locator('.data-iterator-card', { hasText: 'SEO Helper' }))],
}

/** The first and the second result card of the grid (`:visible`: legacy keeps the hidden installed tab, with its own cards, in the DOM). */
export const addResultsCardProbe: Probe = {
  key: 'results-card',
  legacy: page => page.locator('.data-iterator-card:visible').first(),
  next: page => page.locator('.data-iterator-card:visible').first(),
}

export const addResultsSecondCardProbe: Probe = {
  key: 'results-card-2',
  legacy: page => page.locator('.data-iterator-card:visible').nth(1),
  next: page => page.locator('.data-iterator-card:visible').nth(1),
}

/** The pagination footer of the visible Add New grid (legacy keeps the installed tab's footer in the DOM). */
export const addFooterProbe: Probe = {
  key: 'add-footer',
  legacy: page => page.locator('.data-iterator-footer:visible').first(),
  next: page => page.locator('.data-iterator-footer:visible').first(),
}

/**
 * Switches the Add New tab to the table (desktop). The title row of the visible tab is `[back, grid, list]`: the list button is the third one
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

/** The table of the search results: the `.v-card.data-table` that holds "SEO Helper" (the installed table is hidden in the legacy DOM). */
const addTableCard = (page: Page): Locator => page.locator('.v-card.data-table', { hasText: 'SEO Helper' })

/** Waits for the results table: its row is "SEO Helper". */
export const addTableAnchor: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitFor(page => addTableCard(page).locator('tbody tr', { hasText: 'SEO Helper' }))],
  next: [waitFor(page => addTableCard(page).locator('tbody tr', { hasText: 'SEO Helper' }))],
}

export const addTableProbe: Probe = {
  key: 'add-table',
  legacy: page => addTableCard(page).first(),
  next: page => addTableCard(page).first(),
}

/** The first result row of the table (the row bar is drawn for featured entries only; the row itself is measured). */
export const addTableRowProbe: Probe = {
  key: 'add-table-row',
  legacy: page => addTableCard(page).locator('tbody tr').first(),
  next: page => addTableCard(page).locator('tbody tr').first(),
}

/** The install button of the row: the `.actions-row` of the row (same class in both apps), its first button. */
export const addTableInstallProbe: Probe = {
  key: 'add-table-install',
  legacy: page => addTableCard(page).locator('.actions-row .v-btn').first(),
  next: page => addTableCard(page).locator('.actions-row .v-btn').first(),
}

// Phase 18: install from the catalogue (`PluginsActionsMixin.js:15-48`). The install button of "Featured Plugin 1" opens the dialog titled
// "Install Plugin" (`heading.instance.plugin.install.title`); its submit is "Install" (`button.install`).

/** The first featured card (the catalogue entry with the highest rating, `featuredRows[0]`). */
function featuredOneCard (page: Page): Locator {
  return page.locator('.data-iterator-card', { hasText: 'Featured Plugin 1' }).first()
}

/** Opens the install dialog with a click on the card's install button (`evaluate`, so the page does not scroll under the dialog). */
export const openInstall: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await featuredOneCard(page).locator('.v-btn').first().evaluate((el: HTMLElement) => el.click())
    await expect(installModal(page, 'legacy')).toBeVisible()
  },
  next: async page => {
    await featuredOneCard(page).locator('.v-btn').first().evaluate((el: HTMLElement) => el.click())
    await expect(installModal(page, 'next')).toBeVisible()
  },
}

const INSTALL_TITLE = 'Install Plugin'

/** The install dialog: the legacy `.basic-modal` in the open dialog (titled), next the host's `instances-modal` (as the activation dialog). */
export function installModal (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy'
    ? page.locator('.v-dialog--active .basic-modal').filter({ hasText: INSTALL_TITLE })
    : page.getByTestId('instances-modal')
}

/** Submits the install dialog with its "Install" button (exact name, so the card's "Install Plugin" button is not matched). */
export function submitInstall (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await installModal(page, app).getByRole('button', { name: 'Install', exact: true }).click()
  }
}

/** The install dialog probes: the dialog, the message (short description and the name box), the submit and the cancel button. */
export const installModalProbes: Probe[] = [
  {
    key: 'install-modal',
    legacy: page => installModal(page, 'legacy'),
    next: page => installModal(page, 'next'),
  },
  {
    key: 'install-modal-message',
    legacy: page => installModal(page, 'legacy').locator('.v-card__text p').first(),
    next: page => installModal(page, 'next').locator('.v-card-text p').first(),
    internal: true,
  },
  {
    key: 'install-modal-submit',
    legacy: page => installModal(page, 'legacy').getByRole('button', { name: 'Install', exact: true }),
    next: page => installModal(page, 'next').getByRole('button', { name: 'Install', exact: true }),
  },
  {
    key: 'install-modal-cancel',
    legacy: page => installModal(page, 'legacy').getByRole('button', { name: 'Cancel', exact: true }),
    next: page => installModal(page, 'next').getByRole('button', { name: 'Cancel', exact: true }),
    internal: true,
  },
]

/** The message of the refused install (the 422 body; the alert shows it, the dialog is closed in both apps). */
export const installRefusedMessage = 'The plugin could not be installed.'

/** The install request of "Featured Plugin 1" answers 422 with `{ message }` (`POST …/plugins/new/<slug>/install`, slug `featured-plugin-1`). */
export const installRefusedHandler: Record<string, Handler> = {
  'POST /projects/1/wordpress/plugins/new/featured-plugin-1/install': { status: 422, json: { message: installRefusedMessage } },
}

/** The installed list while "Cache Boost" is being installed: `async_status.install = 'pending'` (the harness has no Echo, so the fixture carries it). */
export const installingRows: PluginRow[] = installedRows.map(row => (row.name === 'cache-boost'
  ? { ...row, async_status: { install: 'pending', update: null } }
  : row))

/** The installing card: the title row of the card, and its actions row, which shows the loader and "Installing" instead of the buttons. */
export const installingCardProbe: Probe = {
  key: 'installing-card',
  legacy: page => page.locator('.data-iterator-card', { hasText: 'Cache Boost' }).first(),
  next: page => page.locator('.data-iterator-card', { hasText: 'Cache Boost' }).first(),
}

export const installingActionsProbe: Probe = {
  key: 'installing-actions',
  legacy: page => page.locator('.data-iterator-card', { hasText: 'Cache Boost' }).first().locator(':is(.v-card-actions, .v-card__actions)'),
  next: page => page.locator('.data-iterator-card', { hasText: 'Cache Boost' }).first().locator(':is(.v-card-actions, .v-card__actions)'),
}

// ---------------------------------------------------------------------------------------------
// Phase 19: the action dialogs (`PluginsActionsMixin.js:108-509`). The lite copy of `heading.instance.plugin.delete.title_one` is "Deactivate Plugin",
// so the deactivate and the delete dialogs share a title: they are told apart by their message. The mass update message is the raw key in both apps.
// ---------------------------------------------------------------------------------------------

export const DEACTIVATE_MESSAGE = 'Are you sure that you want to deactivate this plugin?'
export const DELETE_MESSAGE = 'Are you sure that you want to delete this plugin?'
export const UPDATE_MESSAGE = 'Are you sure that you want to update this plugin to version'
export const MASS_UPDATE_MESSAGE = 'heading.instance.plugin.update.message.title'

/** The action dialog holding `text`: the legacy `.basic-modal` in the open dialog, next the host's `instances-modal` (as the activation dialog). */
export function actionDialog (page: Page, app: 'legacy' | 'next', text: string): Locator {
  return app === 'legacy'
    ? page.locator('.v-dialog--active .basic-modal').filter({ hasText: text })
    : page.getByTestId('instances-modal').filter({ hasText: text })
}

/** Clicks the `index`-th action button of a card (`PluginCard.vue:103-190`: deactivate or activate, update when available, delete) and waits for the dialog. */
export function openCardAction (cardText: string, index: number, text: string): { legacy: StateAction, next: StateAction } {
  const run = (app: 'legacy' | 'next'): StateAction => async page => {
    const button = page.locator('.data-iterator-card', { hasText: cardText }).first().locator(':is(.v-card-actions, .v-card__actions) button').nth(index)
    await button.evaluate((el: HTMLElement) => el.click())
    await expect(actionDialog(page, app, text), `${app}: ${cardText} action dialog`).toBeVisible()
  }
  return { legacy: run('legacy'), next: run('next') }
}

/** The mass update: the bar's "Update" (the third mass action, `PluginsSelectSnackbar.vue`) with one plugin selected. */
export const openMassUpdate: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.snackbar__row .btn-icon-horizontal').nth(2).evaluate((el: HTMLElement) => el.click())
    await expect(actionDialog(page, 'legacy', MASS_UPDATE_MESSAGE), 'legacy: mass update dialog').toBeVisible()
  },
  next: async page => {
    await page.locator('.snackbar__row .btn-icon-horizontal').nth(2).evaluate((el: HTMLElement) => el.click())
    await expect(actionDialog(page, 'next', MASS_UPDATE_MESSAGE), 'next: mass update dialog').toBeVisible()
  },
}

/** Probes of an action dialog: the dialog, the message, the submit and the cancel button (the shape of the activation dialog probes). */
export function actionDialogProbes (text: string, submit: string): Probe[] {
  return [
    { key: 'action-dialog', legacy: page => actionDialog(page, 'legacy', text), next: page => actionDialog(page, 'next', text) },
    {
      key: 'action-dialog-message',
      legacy: page => actionDialog(page, 'legacy', text).locator('.v-card__text p').first(),
      next: page => actionDialog(page, 'next', text).locator('.v-card-text p').first(),
      internal: true,
    },
    {
      key: 'action-dialog-submit',
      legacy: page => actionDialog(page, 'legacy', text).getByRole('button', { name: submit, exact: true }),
      next: page => actionDialog(page, 'next', text).getByRole('button', { name: submit, exact: true }),
    },
    {
      key: 'action-dialog-cancel',
      legacy: page => actionDialog(page, 'legacy', text).getByRole('button', { name: 'Cancel', exact: true }),
      next: page => actionDialog(page, 'next', text).getByRole('button', { name: 'Cancel', exact: true }),
      internal: true,
    },
  ]
}

// ---------------------------------------------------------------------------------------------
// Phase 20: the "Read more" dialog (`PluginReadMoreModal.vue`, lite `components/plugins/PluginReadMoreModal.vue`). The link is `<a @click>` without
// href, so it is clicked with `evaluate`. The installed states use "Classic Editor" (the plugin with an update: red band), the catalogue state
// "Featured Plugin 1" (Add New: Install instead of the chip and the actions).
// ---------------------------------------------------------------------------------------------

const READ_MORE_TEXT = 'Creates scheduled backups of the database and the uploads folder, keeps a rolling history of the snapshots and lets you restore a single file without touching the rest of the site.'

/** The installed list with a long description on "Classic Editor": the card gets the "Read more" link (the default list has it only on the inactive "Backup Assistant"). */
export const readMoreInstalledRows: PluginRow[] = installedRows.map(row => (row.name === 'classic-editor' ? { ...row, description: READ_MORE_TEXT } : row))

/** The featured list with a long short description on "Featured Plugin 1": the catalogue card gets the "Read more" link. */
export const readMoreFeaturedRows: PluginRow[] = featuredRows.map(row => (row.slug === 'featured-plugin-1' ? { ...row, short_description: READ_MORE_TEXT } : row))

/** Clicks the "Read more" link of the card holding `cardText` and waits for the dialog. */
export function openReadMore (cardText: string, app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.locator('.data-iterator-card', { hasText: cardText }).first().locator('a.truncate-text').evaluate((el: HTMLElement) => el.click())
    await expect(readMoreCard(page), `${app}: read more dialog`).toBeVisible()
  }
}

/** The read more card: the `.readme-card` of both apps (the dialog is the only one open). */
export function readMoreCard (page: Page): Locator {
  return page.locator('.readme-card').first()
}

/** The probes of the read more dialog: the card (width, border), the title, the status chip, the description, the footer row and the buttons of the state. */
export function readMoreProbes (buttons: string[]): Probe[] {
  return [
    { key: 'readme-card', legacy: readMoreCard, next: readMoreCard },
    { key: 'readme-title', legacy: page => readMoreCard(page).locator('h5'), next: page => readMoreCard(page).locator('h5') },
    { key: 'readme-chip', legacy: page => readMoreCard(page).locator('.activated-chip, .disabled-chip'), next: page => readMoreCard(page).locator('.activated-chip, .disabled-chip') },
    { key: 'readme-description', legacy: page => readMoreCard(page).locator('.description'), next: page => readMoreCard(page).locator('.description') },
    {
      key: 'readme-footer',
      legacy: page => readMoreCard(page).locator('.readme-card__content > div').last(),
      next: page => readMoreCard(page).locator('.readme-card__content > div').last(),
    },
    ...buttons.map((name): Probe => ({
      key: `readme-button-${name.toLowerCase()}`,
      legacy: page => readMoreCard(page).getByRole('button', { name, exact: true }),
      next: page => readMoreCard(page).getByRole('button', { name, exact: true }),
    })),
  ]
}
