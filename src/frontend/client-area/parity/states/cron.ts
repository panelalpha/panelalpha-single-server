import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { settled } from './auth'
import { NOW } from './hosting'
import { advancedFrameHandlers } from './instance-advanced-frame'
import { liteShellHome } from './instances'
import { isDesktop } from './shell'

// Cron page (S-36 hosting-cron, S-64 instance-advanced-cron, S-108 ui-cron): probes, fixtures and actions shared by the two mounts of
// `CronView`, My server (`hosting-cron.parity.ts`, `/hosting/cron`) and the Advanced tab of a project (`instance-advanced-cron.parity.ts`,
// `/projects/41/advanced/cron`). Not a spec: a spec importing another spec would register its tests twice. Measured on app-lite
// (`target: 'lite'`, M-2); the cron screen is the same in app and app-lite, the WP Cloud branch included (ui-cron research §2).

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/Cron.vue, shared HostingTable / TableFullScreenMessage / DataIteratorFilterControls)
// ---------------------------------------------------------------------------------------------

export const cronTitleProbe: Probe = {
  key: 'cron-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('cron-title'),
}

export const cronAddProbe: Probe = {
  key: 'cron-add',
  legacy: page => page.locator('.v-main .title-row .page-title__add-button'),
  next: page => page.getByTestId('cron-add'),
}

export const cronSearchProbe: Probe = {
  key: 'cron-search',
  legacy: page => page.locator('.v-main .my-hostings-search'),
  next: page => page.locator('.v-main .my-hostings-search'),
}

export const cronTableProbe: Probe = {
  key: 'cron-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('cron-table'),
}

export const cronRowProbe: Probe = {
  key: 'cron-row',
  legacy: page => page.locator('.v-main .data-table tbody tr').first(),
  next: page => page.getByTestId('cron-table').locator('tbody tr').first(),
}

export const cronRowEditProbe: Probe = {
  key: 'cron-row-edit',
  legacy: page => page.locator('.v-main .data-table tbody tr').first().locator('.v-btn').first(),
  next: page => page.getByTestId('cron-row-edit').first(),
  internal: true,
}

export const cronRowDeleteProbe: Probe = {
  key: 'cron-row-delete',
  legacy: page => page.locator('.v-main .data-table tbody tr').first().locator('.v-btn').nth(1),
  next: page => page.getByTestId('cron-row-delete').first(),
  internal: true,
}

export const cronLoadingProbe: Probe = {
  key: 'cron-loading',
  legacy: page => page.locator('.v-main .data-table--loading'),
  next: page => page.locator('.v-main .data-table--loading'),
}

export const cronEmptyProbe: Probe = {
  key: 'cron-empty',
  legacy: page => page.locator('.v-main .no-data'),
  next: page => page.locator('.v-main .no-data'),
}

export const cronEmptyAddProbe: Probe = {
  key: 'cron-empty-add',
  legacy: page => page.locator('.v-main .no-data .v-btn'),
  next: page => page.getByTestId('cron-empty-add'),
}

export const cronSelectorProbe: Probe = {
  key: 'cron-account-selector',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.getByTestId('cron-account-selector'),
}

export const rowsReady = { legacy: cronRowProbe.legacy, next: cronRowProbe.next }

// ---------------------------------------------------------------------------------------------
// Fixtures: three jobs, the third one with a minute the parser rejects ("Invalid Expression")
// ---------------------------------------------------------------------------------------------

/** The jobs of the My server account (`serverAccount()` id 11 in `hosting.ts`). */
export const CRON_JOBS_KEY = 'GET /server-accounts/11/cron-jobs'

export const cronJobs = [
  { line: '1', command: '/usr/bin/php /home/example/backup.php', minute: '0', hour: '2', day_of_month: '*', month: '*', day_of_week: '*' },
  { line: '2', command: 'wget -q -O /dev/null https://example.com/cron.php', minute: '*/5', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
  { line: '3', command: 'rm -rf /home/example/tmp/*', minute: '60', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
]

/**
 * Types a phrase no job matches in the search, then waits until the rows are gone (the search is debounced). The state clock is
 * fixed (`setFixedTime`), and legacy lodash `_.debounce` (`DataIteratorSearch.vue:74`) measures its 300ms with `Date.now()`, so it
 * re-arms forever and never emits; moving the fixed time past the wait lets it fire. Next's plain `setTimeout` is unaffected.
 */
export const searchNothing: StateAction = async page => {
  await page.locator('.v-main .my-hostings-search input').fill('zzz-no-such-job')
  await page.clock.setFixedTime(new Date(Date.parse(NOW) + 1000))
  await page.locator('.v-main').getByText(cronJobs[0]!.command).first().waitFor({ state: 'detached', timeout: 5000 })
}

/** Sorts the list by its command column (the header is the same in both apps). */
export const sortByCommand: StateAction = async page => {
  await page.locator('.v-main .custom-sort .item--command .custom-sort__item').first().click()
}

// ---------------------------------------------------------------------------------------------
// Add and Edit modal (phase 2). Legacy `.v-dialog__content--active .basic-modal`; next `cron-modal` (BasicModal root).
// ---------------------------------------------------------------------------------------------

export const LEGACY_DIALOG = '.v-dialog__content--active'

export const cronModalProbe: Probe = {
  key: 'cron-modal',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal`),
  next: page => page.getByTestId('cron-modal'),
}

export const cronModalTitleProbe: Probe = {
  key: 'cron-modal-title',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal .v-card__title h6`),
  next: page => page.getByTestId('cron-modal').locator('.v-card-title h6'),
  internal: true,
}

export const cronModalSelectProbe: Probe = {
  key: 'cron-modal-common-settings',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-input__slot`).nth(0),
  next: page => page.getByTestId('cron-common-settings').locator('.v-field'),
  part: 'box',
  internal: true,
}

export const cronModalMinuteProbe: Probe = {
  key: 'cron-modal-minute',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-input__slot`).nth(1),
  next: page => page.getByTestId('cron-expression').locator('.v-field').nth(0),
  part: 'box',
  internal: true,
}

export const cronModalDescriptionProbe: Probe = {
  key: 'cron-modal-frequency',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal strong`),
  next: page => page.getByTestId('cron-expression').locator('strong'),
  internal: true,
}

export const cronModalCommandProbe: Probe = {
  key: 'cron-modal-command',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-input__slot`).nth(6),
  next: page => page.getByTestId('cron-command').locator('.v-field'),
  part: 'box',
  internal: true,
}

export const cronModalSubmitProbe: Probe = {
  key: 'cron-modal-submit',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(0),
  next: page => page.getByTestId('cron-modal').locator('.v-card-actions .v-btn').nth(0),
  internal: true,
}

export const cronModalCancelProbe: Probe = {
  key: 'cron-modal-cancel',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(1),
  next: page => page.getByTestId('cron-modal').locator('.v-card-actions .v-btn').nth(1),
  internal: true,
}

export const cronModalProbes: Probe[] = [
  cronModalProbe,
  cronModalTitleProbe,
  cronModalSelectProbe,
  cronModalMinuteProbe,
  cronModalDescriptionProbe,
  cronModalCommandProbe,
  cronModalSubmitProbe,
  cronModalCancelProbe,
]

export const openAddLegacy: StateAction = async page => {
  await cronAddProbe.legacy(page).click()
  await settled(page.locator(`${LEGACY_DIALOG} .basic-modal`))
}

export const openAddNext: StateAction = async page => {
  await cronAddProbe.next(page).click()
  await settled(page.getByTestId('cron-modal'))
}

export const openEditLegacy: StateAction = async page => {
  await cronRowEditProbe.legacy(page).click()
  await settled(page.locator(`${LEGACY_DIALOG} .basic-modal`))
}

export const openEditNext: StateAction = async page => {
  await cronRowEditProbe.next(page).click()
  await settled(page.getByTestId('cron-modal'))
}

/** Focuses the Command field, then tabs away: the required rule shows its message (both apps validate on blur). */
export const blurEmptyCommandLegacy: StateAction = async page => {
  await cronModalCommandProbe.legacy(page).locator('input').click()
  await page.keyboard.press('Tab')
  await page.locator(`${LEGACY_DIALOG} .basic-modal .v-messages__message`).first().waitFor({ state: 'visible' })
}

export const blurEmptyCommandNext: StateAction = async page => {
  await page.getByTestId('cron-command').locator('input').click()
  await page.keyboard.press('Tab')
  await page.getByTestId('cron-command').locator('.v-messages__message').first().waitFor({ state: 'visible' })
}

// ---------------------------------------------------------------------------------------------
// Delete modal (phase 3). Legacy `showDeleteModal`: one checkbox, Delete disabled until it is ticked.
// ---------------------------------------------------------------------------------------------

export const cronConfirmProbe: Probe = {
  key: 'cron-confirm',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal .v-card__text .checkbox`).first(),
  next: page => page.getByTestId('cron-confirm').locator('.checkbox').first(),
  internal: true,
}

export const cronDeleteProbes: Probe[] = [
  cronModalProbe,
  cronModalTitleProbe,
  cronConfirmProbe,
  cronModalSubmitProbe,
  cronModalCancelProbe,
]

export const openDeleteLegacy: StateAction = async page => {
  await cronRowDeleteProbe.legacy(page).click()
  await settled(page.locator(`${LEGACY_DIALOG} .basic-modal`))
}

export const openDeleteNext: StateAction = async page => {
  await cronRowDeleteProbe.next(page).click()
  await settled(page.getByTestId('cron-modal'))
}

export const tickConfirmLegacy: StateAction = async page => {
  await cronConfirmProbe.legacy(page).click()
}

export const tickConfirmNext: StateAction = async page => {
  await cronConfirmProbe.next(page).click()
}

// ---------------------------------------------------------------------------------------------
// Project mount (S-108 ui-cron, `LITE/views/instance/advanced/Cron.vue:2-38`): the Advanced tab of a project. The header is
// `.page-title--advanced` (no title row, no account selector); next keeps the test ids of the list header (`CronView.vue`), so only the
// legacy selectors differ. The table, row and modal probes above are shared.
// ---------------------------------------------------------------------------------------------

const projectHeader = '.advanced-hosting-page .page-title--advanced'

export const cronProjectTitleProbe: Probe = {
  key: 'cron-title',
  legacy: page => page.locator(`${projectHeader} h4`),
  next: page => page.getByTestId('cron-title'),
}

/** The filter column (search and Add, `v-show` on the whole column while there are jobs, LITE `advanced/Cron.vue:9-38`). */
export const cronProjectFilterColProbe: Probe = {
  key: 'cron-filter-col',
  legacy: page => page.locator(`${projectHeader} .page-title__filter-controls`),
  next: page => page.locator('.v-main .advanced-hosting-page .page-title__filter-controls'),
  internal: true,
}

export const cronProjectAddProbe: Probe = {
  key: 'cron-add',
  legacy: page => page.locator(`${projectHeader} .add-new-button`),
  next: page => page.getByTestId('cron-add'),
}

export const cronProjectAddIconProbe: Probe = {
  key: 'cron-add-icon',
  legacy: page => page.locator(`${projectHeader} .add-new-button .v-icon`).first(),
  next: page => page.getByTestId('cron-add').locator('.v-icon').first(),
}

export const cronProjectSearchProbe: Probe = {
  key: 'cron-search',
  legacy: page => page.locator(`${projectHeader} .my-hostings-search`),
  next: page => page.locator('.v-main .advanced-hosting-page .my-hostings-search'),
}

/** The hover / focus overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const cronProjectAddOverlayProbe: Probe = {
  key: 'cron-add-overlay',
  legacy: cronProjectAddProbe.legacy,
  next: page => cronProjectAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The actions cell of the first row (Edit and Delete icons; the desktop `.actions-row`, on mobile they sit in the card). */
export const cronActionsProbe: Probe = {
  key: 'cron-actions',
  legacy: page => page.locator('.v-main .data-table tbody tr').first().locator('.actions-row'),
  next: page => page.getByTestId('cron-table').locator('tbody tr').first().locator('.actions-row'),
  when: isDesktop,
}

/** The no-results message of the table (`DataIteratorNoResultsContainer` with Clear filter). */
export const cronNoResultsProbe: Probe = {
  key: 'cron-no-results',
  legacy: page => page.locator('.v-main .no-results-container'),
  next: page => page.getByTestId('cron-table').locator('.no-results-container'),
}

/** Opens the Add modal from the project header's Add button. */
export function openProjectAdd (next: boolean): StateAction {
  return async page => {
    await (next ? cronProjectAddProbe.next(page) : cronProjectAddProbe.legacy(page)).click()
    await settled(next ? cronModalProbe.next(page) : cronModalProbe.legacy(page))
  }
}

/** The first row's Edit (index 0) or Delete (index 1) icon button: desktop `.actions-row`, mobile the last row of the card. */
export function rowActionButton (page: Page, next: boolean, index: 0 | 1): Locator {
  const rows = (next ? page.getByTestId('cron-table') : page.locator('.v-main .data-table')).locator('tbody tr')
  return rows.first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(index)
}

/** The Delete icon of the first row's desktop `.actions-row` (absent on mobile, where the icons sit in the card). */
export function rowDeleteButton (page: Page, next: boolean): Locator {
  const rows = (next ? page.getByTestId('cron-table') : page.locator('.v-main .data-table')).locator('tbody tr')
  return rows.first().locator('.actions-row .v-btn').nth(1)
}

/** The hover overlay of the row's Delete icon: V2 paints it as `::before`, V4 as `.v-btn__overlay`. Desktop only. */
export const cronRowDeleteOverlayProbe: Probe = {
  key: 'cron-row-delete-overlay',
  legacy: page => rowDeleteButton(page, false),
  next: page => rowDeleteButton(page, true).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

/** Opens Edit / Delete of the first row by a DOM click (no scrolling, no pointer move; the pattern of `openRowDeleteModal` in `ftp.ts`). */
export function openRowModal (next: boolean, index: 0 | 1): StateAction {
  return async page => {
    await rowActionButton(page, next, index).evaluate(node => (node as HTMLElement).click())
    await settled(next ? cronModalProbe.next(page) : cronModalProbe.legacy(page))
  }
}

/** Types a command into the open Add / Edit modal (the sixth input of the legacy form; next's Command field). */
export function typeCommand (next: boolean, command: string): StateAction {
  return async page => {
    await (next ? page.getByTestId('cron-command') : cronModalCommandProbe.legacy(page)).locator('input').fill(command)
  }
}

/** Presses the modal's submit button (Add / Update / Delete), the first button of the actions row in both apps. */
export function pressSubmit (next: boolean): StateAction {
  return async page => {
    await (next ? cronModalSubmitProbe.next(page) : cronModalSubmitProbe.legacy(page)).click()
  }
}

/** The open menu of the frequency select: legacy `.menuable__content__active` (the only V2 menu over the dialog), next the V4 `.v-select__content`. */
export const cronFrequencyMenuProbe: Probe = {
  key: 'cron-frequency-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.locator('.v-select__content'),
}

/** The first option of the open frequency menu (`Custom`): item height, padding and text colour. */
export const cronFrequencyItemProbe: Probe = {
  key: 'cron-frequency-item',
  legacy: page => cronFrequencyMenuProbe.legacy(page).locator('.v-list-item').first(),
  next: page => cronFrequencyMenuProbe.next(page).locator('.v-list-item').first(),
  internal: true,
}

/** The list of the open frequency menu (its vertical padding). */
export const cronFrequencyListProbe: Probe = {
  key: 'cron-frequency-list',
  legacy: page => cronFrequencyMenuProbe.legacy(page).locator('.v-list').first(),
  next: page => cronFrequencyMenuProbe.next(page).locator('.v-list').first(),
  internal: true,
}

/** Opens the frequency select of the open modal and waits for its menu. */
export function openFrequencyMenu (next: boolean): StateAction {
  return async page => {
    await (next ? cronModalSelectProbe.next(page) : cronModalSelectProbe.legacy(page)).click()
    await settled(next ? cronFrequencyMenuProbe.next(page) : cronFrequencyMenuProbe.legacy(page))
  }
}

/** The project's server account is 1 (`instances.ts`), so the cron calls go to `/server-accounts/1/cron-jobs`. */
export const PROJECT_CRON_JOBS_KEY = 'GET /server-accounts/1/cron-jobs'

/** Handlers of the project's Cron page: the Advanced frame handlers plus the jobs of the project's server account. */
export function cronProjectHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [PROJECT_CRON_JOBS_KEY]: { json: { data: cronJobs } },
    ...overrides,
  })
}

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as `FTP_PROJECT_HOME`). */
const { admin: _projectAdmin, ...liteHomeWithoutAdmin } = liteShellHome()

export const CRON_PROJECT_HOME = liteHomeWithoutAdmin
