import type { Handler, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { settled } from './auth'
import { accountSelectorSteps, domainsBody, ftpAccount, ftpAccountsBody, ftpServerInfoBody, whenVisible } from './hosting'
import { advancedFrameHandlers } from './instance-advanced-frame'
import { liteShellHome } from './instances'
import { isDesktop } from './shell'

// S-33 hosting-ftp / S-105 ui-ftp: the probes, row and modal helpers and the shared handlers of the FTP list, measured in two frames: the
// `/hosting/ftp` page (My server on app-lite, `hosting-ftp.parity.ts`) and the Advanced tab of a project (`instance-advanced-ftp.parity.ts`).
// Each frame differs in its header only (the project variant has no title row, `.advanced-hosting-page .page-title--advanced`). Plan:
// context/changes/ui-ftp/plan.md ("Phase 7").

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/Ftp.vue, components/dataIterator/tables/HostingFtpTable.vue)
// ---------------------------------------------------------------------------------------------

export const ftpTitleProbe: Probe = {
  key: 'ftp-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('ftp-title'),
}

export const ftpAddProbe: Probe = {
  key: 'ftp-add',
  legacy: page => page.locator('.v-main .title-row .add-new-button'),
  next: page => page.getByTestId('ftp-add'),
}

export const ftpAddIconProbe: Probe = {
  key: 'ftp-add-icon',
  legacy: page => page.locator('.v-main .title-row .add-new-button .v-icon').first(),
  next: page => page.getByTestId('ftp-add').locator('.v-icon').first(),
}

export const ftpFilterColProbe: Probe = {
  key: 'ftp-filter-col',
  legacy: page => page.locator('.v-main .title-row .page-title__filter-controls'),
  next: page => page.locator('.title-row .page-title__filter-controls'),
}

export const ftpSearchProbe: Probe = {
  key: 'ftp-search',
  legacy: page => page.locator('.v-main .my-hostings-search'),
  next: page => page.getByTestId('ftp-search'),
}

export const ftpTableProbe: Probe = {
  key: 'ftp-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('ftp-table'),
}

export const ftpRows = (page: Page, next: boolean) => (next ? page.getByTestId('ftp-table') : page.locator('.v-main .data-table')).locator('tbody tr')

export const ftpRowProbe: Probe = {
  key: 'ftp-row',
  legacy: page => ftpRows(page, false).first(),
  next: page => ftpRows(page, true).first(),
}

/** The user is a `b` on desktop only; the mobile row shows it in a `span`. */
export const ftpRowUserProbe: Probe = {
  key: 'ftp-row-user',
  legacy: page => ftpRows(page, false).first().locator('b').first(),
  next: page => ftpRows(page, true).first().locator('b').first(),
  when: isDesktop,
}

export const ftpUsageChartProbe: Probe = {
  key: 'ftp-usage-chart',
  legacy: page => ftpRows(page, false).first().locator('.v-progress-linear'),
  next: page => ftpRows(page, true).first().locator('.v-progress-linear'),
}

/** The usage text beside the chart exists on desktop only (mobile puts `usage_quota` in its own row). */
export const ftpUsageTextProbe: Probe = {
  key: 'ftp-usage-text',
  legacy: page => ftpRows(page, false).first().locator('.usage-quota'),
  next: page => ftpRows(page, true).first().locator('.usage-quota'),
  when: isDesktop,
}

/** The "not supported" icon button of the usage cell (`.ps-7`, desktop only). */
export const unsupportedButton = (page: Page, next: boolean) => ftpRows(page, next).first().locator('.ps-7 .v-btn')

export const ftpUnsupportedProbe: Probe = {
  key: 'ftp-usage-unsupported',
  legacy: page => unsupportedButton(page, false),
  next: page => unsupportedButton(page, true),
  when: isDesktop,
}

/** The open hover menu of the "not supported" icon: legacy `.menuable__content__active`, next the active V4 overlay. */
export const ftpUsageMenuProbe: Probe = {
  key: 'ftp-usage-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.locator('.v-overlay--active .v-overlay__content'),
  when: isDesktop,
}

export const ftpActionsProbe: Probe = {
  key: 'ftp-actions',
  legacy: page => ftpRows(page, false).first().locator('.actions-row'),
  next: page => ftpRows(page, true).first().locator('.actions-row'),
  when: isDesktop,
}

/** The Delete icon of the first row's actions (`$thrash`, index 1 as in `clickRowAction`; the desktop `.actions-row` only). */
export const rowDeleteButton = (page: Page, next: boolean) => ftpRows(page, next).first().locator('.actions-row .v-btn').nth(1)

/** The hover overlay of the row's Delete icon: V2 paints it as `::before`, V4 as `.v-btn__overlay`. Desktop only. */
export const ftpRowDeleteOverlayProbe: Probe = {
  key: 'ftp-row-delete-overlay',
  legacy: page => rowDeleteButton(page, false),
  next: page => rowDeleteButton(page, true).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

export const ftpEmptyProbe: Probe = {
  key: 'ftp-empty',
  legacy: page => page.locator('.v-main .data-table .no-data'),
  next: page => page.getByTestId('ftp-empty'),
}

export const ftpEmptyAddProbe: Probe = {
  key: 'ftp-empty-add',
  legacy: page => page.locator('.v-main .data-table .no-data .v-btn'),
  next: page => page.getByTestId('ftp-empty-add'),
}

export const ftpNoResultsProbe: Probe = {
  key: 'ftp-no-results',
  legacy: page => page.locator('.v-main .data-table .no-results-container'),
  next: page => page.getByTestId('ftp-table').locator('.no-results-container'),
}

export const ftpFooterProbe: Probe = {
  key: 'ftp-footer',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer'),
  next: page => page.getByTestId('ftp-table').locator('.data-iterator-footer'),
}

export const ftpAccountSelectorProbe: Probe = {
  key: 'ftp-account-selector',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.getByTestId('ftp-account-selector'),
}

/** The open account menu of the selector (`ActiveServerAccountSelector`). */
export const ftpAccountMenuProbe: Probe = {
  key: 'ftp-account-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.locator('.v-overlay--active .v-overlay__content'),
  when: isDesktop,
}

// ---------------------------------------------------------------------------------------------
// Phase 4 probes: the modal (legacy views/hosting/Ftp.vue:120-130, BasicModal.vue; next BasicModal `data-testid="ftp-modal"`)
// ---------------------------------------------------------------------------------------------

export const modalBox = (page: Page) => page.locator('.basic-modal')

export const ftpModalProbe: Probe = {
  key: 'ftp-modal',
  legacy: page => modalBox(page),
  next: page => page.getByTestId('ftp-modal'),
}

export const ftpModalTitleProbe: Probe = {
  key: 'ftp-modal-title',
  legacy: page => modalBox(page).locator('h6'),
  next: page => page.getByTestId('ftp-modal').locator('h6'),
}

/** A modal field by name; legacy has no name hook, so it is the n-th field of the form (BasicModalField order). */
export function ftpModalFieldProbe (name: string, index: number): Probe {
  return {
    key: `ftp-modal-field-${name}`,
    legacy: page => modalBox(page).locator('form > div').nth(index),
    next: page => page.getByTestId(`ftp-modal-field-${name}`),
  }
}

/** The Add modal's fields in legacy order (BasicModalField): user (0), password (1), directory (2), unlimited quota (3), quota (4). */
export const ftpAddFieldProbes: Probe[] = [
  ftpModalFieldProbe('user', 0),
  ftpModalFieldProbe('password', 1),
  ftpModalFieldProbe('directory', 2),
  ftpModalFieldProbe('unlimited_quota', 3),
  ftpModalFieldProbe('quota', 4),
]

/** The modal's submit button. Legacy is Vuetify 2 (`.v-card__actions`), next Vuetify 4 (`.v-card-actions`). */
export const modalSubmit = (page: Page, next: boolean) => modalBox(page).locator(next ? '.v-card-actions .v-btn' : '.v-card__actions .v-btn').first()

export const ftpModalSubmitProbe: Probe = {
  key: 'ftp-modal-submit',
  legacy: page => modalSubmit(page, false),
  next: page => modalSubmit(page, true),
}

/** One `<li>` of the Info modal, in legacy order: username (0), host (1), port (2). */
export function ftpModalInfoItemProbe (index: number): Probe {
  return {
    key: `ftp-modal-info-item-${index}`,
    legacy: page => modalBox(page).locator('li').nth(index),
    next: page => page.getByTestId('ftp-modal').locator('li').nth(index),
  }
}

/** Phase 16: the username inside the Info modal's title (`span` in the `h6`: `text-no-wrap` in next, the inline `text-wrap: nowrap` in legacy). */
export const ftpModalInfoTitleNameProbe: Probe = {
  key: 'ftp-modal-info-title-name',
  legacy: page => modalBox(page).locator('h6 span span'),
  next: page => page.getByTestId('ftp-modal').locator('h6 span span'),
}

/** Phase 16: the `strong` (label) or the `span` (value) of one `<li>` of the Info modal, in legacy order (username 0, host 1, port 2). */
export function ftpModalInfoPartProbe (index: number, part: 'strong' | 'span'): Probe {
  return {
    key: `ftp-modal-info-${part}-${index}`,
    legacy: page => modalBox(page).locator('li').nth(index).locator(part),
    next: page => page.getByTestId('ftp-modal').locator('li').nth(index).locator(part),
  }
}

/** Phase 16: the label and the value of each of the three Info rows (`display` of `strong` and `span`, moved to classes in phase 5). */
export const ftpModalInfoPartProbes: Probe[] = [0, 1, 2].flatMap(index => [ftpModalInfoPartProbe(index, 'strong'), ftpModalInfoPartProbe(index, 'span')])

/** Opens the modal from the title-bar Add button. */
export function clickAdd (next: boolean): StateAction {
  return async page => {
    await (next ? page.getByTestId('ftp-add') : page.locator('.v-main .title-row .add-new-button')).click()
    await settled(modalBox(page))
  }
}

/** The row action at `index` of the first row: 0 is Info (`$help`), 1 is Delete (`$thrash`). */
export function clickRowAction (next: boolean, index: number): StateAction {
  return async page => {
    await ftpRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(index).click()
    await settled(modalBox(page))
  }
}

/** Opens the Delete modal of the first row by a DOM click on its Delete icon (index 1). Unlike `clickRowAction`, it neither scrolls nor moves the pointer. */
export function openRowDeleteModal (next: boolean): StateAction {
  return async page => {
    await ftpRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(1).evaluate(node => (node as HTMLElement).click())
    await settled(modalBox(page))
  }
}

/** Stage 11: focus and blur the username (text-select) so its rules show on blur, then press Add. */
export function blurUsernameAndSubmit (next: boolean): StateAction {
  return async page => {
    const username = modalBox(page).getByRole('textbox').first()
    await username.focus()
    await username.blur()
    await settled(modalBox(page).locator('.v-messages__message').first())
    await modalSubmit(page, next).click()
    await settled(modalBox(page))
  }
}

/** Phase 13: the password of the Add form, a fixed value (the generator is random) of 8+ characters as `passwordRules` need. */
export const FTP_ADD_PASSWORD = 'Parity-ftp-2026'

/** Phase 13: the answer to an Add the server rejects: 422 on the username (the alert shows the message; the modal stays open). */
export const FTP_ADD_422: Handler = { status: 422, json: { message: 'The given data was invalid.', errors: { user: ['The user has already been taken.'] } } }

/** Phase 13: fills the Add form with a valid username (the preselected domain comes with it) and the fixed password, then presses Add. */
/** `force` on the password: on a phone legacy V2 squeezes that input to zero width (the Generate button takes the row), so Playwright finds it not visible. */
export function fillAndSubmitFtpAdd (next: boolean): StateAction {
  return async page => {
    await (next ? ftpModalFieldProbe('user', 0).next(page) : ftpModalFieldProbe('user', 0).legacy(page)).locator('input').first().fill('parity-user')
    await (next ? ftpModalFieldProbe('password', 1).next(page) : ftpModalFieldProbe('password', 1).legacy(page)).locator('input').first().fill(FTP_ADD_PASSWORD, { force: true })
    await modalSubmit(page, next).click()
  }
}

/** Hovers the "not supported" icon of the first row and waits for its menu (desktop only; absent on mobile, so the step is skipped). */
export function hoverUnsupported (next: boolean): StateAction {
  return async page => {
    const button = unsupportedButton(page, next)
    await whenVisible(button, async () => {
      await button.hover()
      await settled(next ? page.locator('.v-overlay--active .v-overlay__content') : page.locator('.menuable__content__active'))
    })
  }
}

export const openAccountSelector = accountSelectorSteps('ftp-account-selector')

// ---------------------------------------------------------------------------------------------
// Project frame (S-105, `LITE/views/instance/advanced/Ftp.vue`): the Advanced tab of a project. The header is `.page-title--advanced` (no
// title row, no account selector). Next keeps the test ids of the list header (`FtpView.vue`), so only the legacy selectors differ.
// ---------------------------------------------------------------------------------------------

const projectHeader = '.advanced-hosting-page .page-title--advanced'

export const ftpProjectTitleProbe: Probe = {
  key: 'ftp-title',
  legacy: page => page.locator(`${projectHeader} h4`),
  next: page => page.getByTestId('ftp-title'),
}

export const ftpProjectAddProbe: Probe = {
  key: 'ftp-add',
  legacy: page => page.locator(`${projectHeader} .add-new-button`),
  next: page => page.getByTestId('ftp-add'),
}

export const ftpProjectAddIconProbe: Probe = {
  key: 'ftp-add-icon',
  legacy: page => page.locator(`${projectHeader} .add-new-button .v-icon`).first(),
  next: page => page.getByTestId('ftp-add').locator('.v-icon').first(),
}

export const ftpProjectSearchProbe: Probe = {
  key: 'ftp-search',
  legacy: page => page.locator(`${projectHeader} .my-hostings-search`),
  next: page => page.getByTestId('ftp-search'),
}

/** The hover overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const ftpProjectAddOverlayProbe: Probe = {
  key: 'ftp-add-overlay',
  legacy: ftpProjectAddProbe.legacy,
  next: page => ftpProjectAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** Opens the Add modal from the project header's Add button (no title row here, so `clickAdd` does not match). */
export function clickProjectAdd (next: boolean): StateAction {
  return async page => {
    await (next ? ftpProjectAddProbe.next(page) : ftpProjectAddProbe.legacy(page)).click()
    await settled(modalBox(page))
  }
}

/** The project's FTP accounts (its `server_account_id` is 1): one limited and one unlimited account, `usage: true` as on cPanel. */
export const FTP_PROJECT_ACCOUNTS = [
  ftpAccount({ user: 'shop@example.com', directory: '/home/example/shop', diskused: 120, diskquota: 1024, updated_at: '2026-09-20T10:00:00.000Z' }),
  ftpAccount({ user: 'mail@example.com', directory: '/home/example/mail', diskused: 42, diskquota: 'unlimited', updated_at: '2026-09-01T12:00:00.000Z' }),
]

/** Ten accounts: two pages of eight and two rows, so the footer shows two pages (shared by the My server and the project paged states). */
export const ftpManyAccounts = Array.from({ length: 10 }, (_, index) => ftpAccount({
  user: `user${index + 1}@example.com`,
  directory: `/home/example/user${index + 1}`,
  diskused: 10 * (index + 1),
  diskquota: 1024,
  updated_at: '2026-09-20T10:00:00.000Z',
}))

/** The active page number of the footer's pagination (V2 `v-pagination__item--active` on the button, V4 `v-pagination__item--is-active` on the `li`, the probe takes its `.v-btn`; page 1 of a paged list). */
export const ftpPageActiveProbe: Probe = {
  key: 'ftp-page-active',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer .v-pagination__item--active'),
  next: page => page.getByTestId('ftp-table').locator('.data-iterator-footer .v-pagination__item--is-active .v-btn'),
}

/** Handlers of the project's FTP page: the Advanced frame handlers plus the FTP calls of the project's server account (id 1). */
export function ftpProjectHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    'GET /server-accounts/1/ftp-accounts': { json: ftpAccountsBody({ items: FTP_PROJECT_ACCOUNTS, usage: true }) },
    'GET /server-accounts/1/ftp-accounts/server-info': { json: ftpServerInfoBody() },
    'GET /server-accounts/1/domains': { json: domainsBody(['example.com', 'shop.example.com']) },
    ...overrides,
  })
}

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Plugins states do). */
const { admin: _projectAdmin, ...liteHomeWithoutAdmin } = liteShellHome()

export const FTP_PROJECT_HOME = liteHomeWithoutAdmin
