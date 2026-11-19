import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled } from './auth'
import { waitFor, whenVisible } from './hosting'
import { mysqlHandlers } from './hosting-databases'
import { ADVANCED_PRIVILEGES, ADVANCED_PROJECT_ID, advancedFrameHandlers, advancedInstance } from './instance-advanced-frame'
import { isDesktop } from './shell'

// S-35 hosting-databases / S-107 ui-databases: the probes and actions of the Databases screen, shared by the `/hosting/databases` states
// (`hosting-databases.parity.ts`) and the Advanced tab of a project (`instance-advanced-databases.parity.ts`). Not a spec file (testMatch
// is `*.parity.ts`). The list, tabs and modals have the same classes in both frames; only the header of the project differs (below).

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/Databases.vue; the kit classes are the same in both apps)
// ---------------------------------------------------------------------------------------------

export const databasesTabsProbe: Probe = {
  key: 'databases-tabs',
  legacy: page => page.locator('.v-main .page-title__tabs'),
  next: page => page.locator('.v-main .page-title__tabs'),
}

/** The right column of the header: hidden (`v-show`) while the list is empty. */
export const databasesFilterProbe: Probe = {
  key: 'databases-filter',
  legacy: page => page.locator('.v-main .page-title__filter-controls'),
  next: page => page.locator('.v-main .page-title__filter-controls'),
}

export const databasesSearchProbe: Probe = {
  key: 'databases-search',
  legacy: page => page.locator('.v-main .my-hostings-search'),
  next: page => page.locator('.v-main .my-hostings-search'),
}

export const databasesAddProbe: Probe = {
  key: 'databases-add',
  legacy: page => page.locator('.v-main .page-title__add-button'),
  next: page => page.locator('.v-main .page-title__add-button'),
}

/** The table card of the Databases list (the loading skeleton keeps the same card). */
export const databasesTableProbe: Probe = {
  key: 'databases-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.locator('.v-main .data-table'),
}

export const databasesSortRowProbe: Probe = {
  key: 'databases-sort-row',
  legacy: page => page.locator('.v-main tr.custom-sort'),
  next: page => page.locator('.v-main tr.custom-sort'),
}

export const databasesRowProbe: Probe = {
  key: 'databases-row',
  legacy: page => page.locator('.v-main .data-table tbody tr').first(),
  next: page => page.locator('.v-main .data-table tbody tr').first(),
}

export const databasesEmptyProbe: Probe = {
  key: 'databases-empty',
  legacy: page => page.locator('.v-main .no-data'),
  next: page => page.locator('.v-main .no-data'),
}

export const databasesNoResultsProbe: Probe = {
  key: 'databases-no-results',
  legacy: page => page.locator('.v-main .no-results-container'),
  next: page => page.locator('.v-main .no-results-container'),
}

export const databasesSelectorProbe: Probe = {
  key: 'databases-account-selector',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.locator('.v-main .acc-select-group'),
}

/** The n-th tab of the header (1-based): Databases, Users or PHPMyAdmin. */
export function databasesTabProbe (number: number): Probe {
  return {
    key: `databases-tab-${number}`,
    legacy: page => page.locator('.v-main .page-title__tabs .v-tab').nth(number - 1),
    next: page => page.locator('.v-main .page-title__tabs .v-tab').nth(number - 1),
  }
}

/** The dialog box of the open modal: legacy and next both give the card `.basic-modal`. */
export const modalProbe: Probe = {
  key: 'database-modal',
  legacy: page => page.locator('.basic-modal'),
  next: page => page.locator('.basic-modal'),
}

// The Users probes read the open window item only: the Databases table stays mounted once its tab was visited.
export const usersTableProbe: Probe = {
  key: 'users-table',
  legacy: page => page.locator('.v-main .v-window-item--active .data-table'),
  next: page => page.locator('.v-main .v-window-item--active .data-table'),
}

export const usersRowProbe: Probe = {
  key: 'users-row',
  legacy: page => page.locator('.v-main .v-window-item--active .data-table tbody tr').first(),
  next: page => page.locator('.v-main .v-window-item--active .data-table tbody tr').first(),
}

export const usersEmptyProbe: Probe = {
  key: 'users-empty',
  legacy: page => page.locator('.v-main .v-window-item--active .no-data'),
  next: page => page.locator('.v-main .v-window-item--active .no-data'),
}

export const tableProbes: Probe[] = [
  databasesTabsProbe,
  databasesFilterProbe,
  databasesSearchProbe,
  databasesAddProbe,
  databasesTableProbe,
  databasesSortRowProbe,
  databasesRowProbe,
]

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** Clicks the `size` header (legacy `item--size`, the kit's sort row). Mobile has no sort row, so the click is skipped there. */
export const clickSizeHeader: StateAction = async page => {
  const header = page.locator('.v-main tr.custom-sort td.item--size .custom-sort__item')
  await whenVisible(header, async () => {
    await header.click()
  })
}

/** Types a phrase no database matches; the search waits 300 ms, so the no-results container is awaited. */
export const searchForNothing: StateAction = async page => {
  const input = page.locator('.v-main .my-hostings-search input')
  await whenVisible(input, async () => {
    await input.fill('zzz-no-such-database')
  })
  await waitFor(current => current.locator('.v-main .no-results-container'))(page)
}

/** Clicks the header Add button (legacy and next share the `page-title__add-button` class) and waits for the dialog to settle. */
export const openAddModal: StateAction = async page => {
  await page.locator('.v-main .page-title__add-button').click()
  await settled(page.locator('.basic-modal'))
}

/**
 * Clicks tab 2 (Users) and waits for its list: the first row, or the empty state when `empty`. The Databases table stays mounted, so
 * the wait reads the open window item.
 */
export function openUsersTab (empty = false): StateAction {
  return async page => {
    await page.locator('.v-main .page-title__tabs .v-tab').nth(1).click()
    await waitFor(current => current.locator(empty
      ? '.v-main .v-window-item--active .no-data'
      : '.v-main .v-window-item--active .data-table tbody tr'))(page)
  }
}

/**
 * Clicks one button of the actions cell of the first user row: 0 Manage Privileges, 1 Edit, 2 Access details, 3 Delete (legacy and next
 * order). The cell is the last one, so the database buttons of the row before it do not count.
 */
export function openUserRowModal (index: number): StateAction {
  return async page => {
    const row = page.locator('.v-main .v-window-item--active .data-table tbody tr').first()
    // Mobile: the card has the user and the actions row only (`.mobile-table-item__row:last-child`), the table cells do not exist.
    const mobileActions = row.locator('.mobile-table-item__row:last-child .v-btn')
    const mobile = await mobileActions.count() > 0
    // Legacy passes `{}` instead of the row to the mobile actions (`HostingTable.vue:95`): Manage privileges (0) and Edit (1) throw on it and
    // open no modal, Access details (2) opens with `undefined` as the user. Next fixes it, so only the last two
    // are comparable on a phone; the first two are skipped there.
    if (mobile && index < 2) {
      return
    }
    const actions = mobile ? mobileActions : row.locator('td').last().locator('.v-btn')
    await actions.nth(index).click()
    await settled(page.locator('.basic-modal'))
  }
}

/** Clicks the Edit (`first`) or Delete (`last`) button of the first row, the two action buttons of the row in both apps. */
export function openRowModal (which: 'first' | 'last'): StateAction {
  return async page => {
    const buttons = page.locator('.v-main .data-table tbody tr').first().locator('.v-btn')
    await (which === 'first' ? buttons.first() : buttons.last()).click()
    await settled(page.locator('.basic-modal'))
  }
}

/** The first database button of the first user row (the Users tab): the tooltip opens on hover, the database modal on click. */
export const userDatabaseButton = (page: Page) => page.locator('.v-main .v-window-item--active .data-table tbody tr').first().locator('li .v-btn').first()

/** The database tooltip, once its privileges text is in (legacy `.menuable__content__active`, next `.v-overlay__content`). */
export const databaseTooltip = {
  legacy: (page: Page) => page.locator('.menuable__content__active').filter({ hasText: 'Full' }),
  next: (page: Page) => page.locator('.v-overlay--active .v-overlay__content').filter({ hasText: 'Full' }),
}

/** The database tooltip once its privileges are in (the custom list of `['SELECT', 'INSERT']`, not the loader). */
export const databasePrivilegesTooltip = {
  legacy: (page: Page) => page.locator('.menuable__content__active').filter({ hasText: 'SELECT' }),
  next: (page: Page) => page.locator('.v-overlay--active .v-overlay__content').filter({ hasText: 'SELECT' }),
}

/**
 * Hovers the database button of the first user row, waits for its tooltip to hold the privileges, then clicks it. The hover is the visit
 * a user makes first: legacy `loadDbPrivilegesModal` (`Databases.vue:1413-1418`) drops the answer of `getDbPrivileges` and only the
 * tooltip watcher (`:642-656`) fills `db.privileges`, so a click without a hover throws in legacy (`:1435`, `includes` of null) and the
 * modal never opens. Next assigns the answer itself (`fetchDatabasePrivileges`), so the hover changes nothing there.
 */
export function openUserDatabaseModal (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await openUsersTab()(page)
    // The mobile card lists no databases of the user (only the user and the actions), so there is nothing to open there.
    if (await userDatabaseButton(page).count() === 0) {
      return
    }
    await hoverUntilTooltip(page, databasePrivilegesTooltip[app])
    await userDatabaseButton(page).click()
    await settled(page.locator('.basic-modal'))
  }
}

/** Hovers the database button of the first user row and waits for the preset of its tooltip (the loader comes first). */
export function hoverUserDatabase (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await openUsersTab()(page)
    if (await userDatabaseButton(page).count() === 0) {
      return
    }
    await hoverUntilTooltip(page, databaseTooltip[app])
  }
}

/**
 * Hovers the database button and waits for its tooltip. The row can reflow once the privileges land and move the button from under the
 * pointer, which closes the tooltip (the project frame does it in legacy), so the pointer leaves and comes back until the tooltip shows.
 */
async function hoverUntilTooltip (page: Page, tooltip: (page: Page) => Locator) {
  await expect(async () => {
    await page.mouse.move(0, 0)
    await userDatabaseButton(page).hover()
    await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
  }).toPass({ timeout: 15_000 })
}

/** The PHPMyAdmin card (legacy and next both give the card body the `v-card--mobile` class). */
export const phpmyadminCardProbe: Probe = {
  key: 'phpmyadmin-card',
  legacy: page => page.locator('.v-main .v-window-item--active .v-card--mobile'),
  next: page => page.locator('.v-main .v-window-item--active .v-card--mobile'),
}

/** The DNS warning of the SSO modal (`.warning-box` in both apps). */
export const ssoDnsWarningProbe: Probe = {
  key: 'sso-dns-warning',
  legacy: page => page.locator('.basic-modal .warning-box'),
  next: page => page.locator('.basic-modal .warning-box'),
}

/** Clicks tab 3 (PHPMyAdmin) and waits for its card. */
export const openPhpmyadminTab: StateAction = async page => {
  await page.locator('.v-main .page-title__tabs .v-tab').nth(2).click()
  await waitFor(current => current.locator('.v-main .v-window-item--active .v-card--mobile'))(page)
}

/**
 * Opens the PHPMyAdmin tab and clicks "Log In to PHPMyAdmin". The DNS lookup of the host answers first (no record), then the SSO modal
 * opens, because the preview site provider is on. Server type cPanel, so no database list is loaded.
 */
export const openSsoModal: StateAction = async page => {
  await openPhpmyadminTab(page)
  await page.locator('.v-main .v-window-item--active .outlined-button').click()
  await settled(page.locator('.basic-modal'))
}

// ---------------------------------------------------------------------------------------------
// Project frame (S-107, `LITE/views/instance/advanced/Databases.vue`): the Advanced tab of a project. The header is `.page-title--advanced`
// (h4 + filters in the first row, the tabs in the second; no account selector). Next keeps the test ids of the list header
// (`DatabasesView.vue`), so only the legacy selectors differ from the My server frame.
// ---------------------------------------------------------------------------------------------

const projectHeader = '.advanced-hosting-page .page-title--advanced'

export const databasesProjectTitleProbe: Probe = {
  key: 'databases-title',
  legacy: page => page.locator(`${projectHeader} h4`),
  next: page => page.getByTestId('databases-title'),
}

export const databasesProjectAddProbe: Probe = {
  key: 'databases-add',
  legacy: page => page.locator(`${projectHeader} .add-new-button`),
  next: page => page.getByTestId('databases-add'),
}

export const databasesProjectAddIconProbe: Probe = {
  key: 'databases-add-icon',
  legacy: page => page.locator(`${projectHeader} .add-new-button .v-icon`).first(),
  next: page => page.getByTestId('databases-add').locator('.v-icon').first(),
}

export const databasesProjectSearchProbe: Probe = {
  key: 'databases-search',
  legacy: page => page.locator(`${projectHeader} .my-hostings-search`),
  next: page => page.getByTestId('databases-filter-controls'),
}

export const databasesProjectFilterProbe: Probe = {
  key: 'databases-filter',
  legacy: page => page.locator(`${projectHeader} .page-title__filter-controls`),
  next: page => page.locator('.advanced-hosting-page .page-title__filter-controls'),
}

/** The tab strip of the second header row. */
export const databasesProjectTabsProbe: Probe = {
  key: 'databases-tabs',
  legacy: page => page.locator(`${projectHeader} .page-title__tabs`),
  next: page => page.locator('.advanced-hosting-page .page-title__tabs'),
}

/** The hover overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const databasesProjectAddOverlayProbe: Probe = {
  key: 'databases-add-overlay',
  legacy: databasesProjectAddProbe.legacy,
  next: page => databasesProjectAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** Opens the Add modal from the project header's Add button (the Databases or the Users tab, whichever is open). */
export function openProjectAddModal (next: boolean): StateAction {
  return async page => {
    await (next ? databasesProjectAddProbe.next(page) : databasesProjectAddProbe.legacy(page)).click()
    await settled(page.locator('.basic-modal'))
  }
}

/** The Delete icon of the first database row (the last button of the actions cell; the Edit icon is first and absent on mobile). */
export const rowDeleteButton = (page: Page) => page.locator('.v-main .data-table tbody tr').first().locator('.v-btn').last()

/** The Delete icon of the desktop actions cell (`.actions-row`); the mobile card has none, so a hover on it is skipped there. */
export const rowDeleteHoverTarget = (page: Page) => page.locator('.v-main .data-table tbody tr').first().locator('.actions-row .v-btn').last()

/** The hover overlay of the row's Delete icon: V2 paints it as `::before`, V4 as `.v-btn__overlay`. Desktop only (the mobile card has no hover). */
export const databasesRowDeleteOverlayProbe: Probe = {
  key: 'databases-row-delete-overlay',
  legacy: rowDeleteHoverTarget,
  next: page => rowDeleteHoverTarget(page).locator('.v-btn__overlay'),
  when: isDesktop,
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The Delete modal of the first database, opened by a DOM click (the same modal as `hosting-databases-modal-delete-db`). */
export const openRowDeleteModal: StateAction = async page => {
  await rowDeleteButton(page).evaluate(node => (node as HTMLElement).click())
  await settled(page.locator('.basic-modal'))
}

/** Ticks the `confirm` checkbox of the Delete modal (lifts `confirm-required`). */
export const tickDeleteConfirm: StateAction = async page => {
  await page.locator('.basic-modal .checkbox').first().click()
}

/** The submit button of the open modal (`.basic-modal` footer, the last button). */
export const modalSubmitProbe: Probe = {
  key: 'databases-modal-submit',
  legacy: page => page.locator('.basic-modal .v-card__actions .v-btn').first(),
  next: page => page.locator('.basic-modal .v-card-actions .v-btn').first(),
}

/** The title of the open modal (`h6` in both apps, as `ftpModalTitleProbe`). */
export const modalTitleProbe: Probe = {
  key: 'databases-modal-title',
  legacy: page => page.locator('.basic-modal h6'),
  next: page => page.locator('.basic-modal h6'),
}

/** Fills the first input of the open modal and presses the submit button (Add database: the name; the server then answers). */
export function fillFirstInputAndSubmit (next: boolean): StateAction {
  return async page => {
    await page.locator('.basic-modal input').first().fill('parity_db')
    await modalSubmitProbe[next ? 'next' : 'legacy'](page).click()
  }
}

/** The `/home` of the project states: the lite one without `admin` (the style manager drawer would widen the full-page shot), as the FTP states. */

/** The account of the project: id 1 (`server_account_id`), cPanel, with the MySQL prefix and the phpMyAdmin SSO host the screen reads. */
const DATABASES_ACCOUNT_DETAILS = { homedir: '/home/example', mysql_db_prefix: 'example_', mysql_php_my_admin_sso_host: 'example.com' }

/** `GET /projects/41` for a privilege list: the Advanced project with the hosting account of `DATABASES_ACCOUNT_DETAILS`. */
export function databasesProjectInstance (privileges: string[] = ADVANCED_PRIVILEGES): Handler {
  return { json: { data: advancedInstance(privileges, { server_account_details: DATABASES_ACCOUNT_DETAILS }) } }
}

/** Handlers of the project's Databases page: the Advanced frame, the project with its hosting account, and the MySQL calls of account 1. */
export function databasesProjectHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: databasesProjectInstance(),
    ...mysqlHandlers(1),
    ...overrides,
  })
}

export { FTP_PROJECT_HOME as DATABASES_PROJECT_HOME } from './ftp'
