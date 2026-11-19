import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, tr } from './auth'
import { sftpAccount, sftpAccountsBody, sftpServerInfoBody } from './hosting'
import { advancedFrameHandlers } from './instance-advanced-frame'
import { isDesktop, openLegacyMenu } from './shell'

// S-34 hosting-sftp / S-106 ui-sftp: the probes, row and modal helpers and the shared handlers of the SFTP list, measured in two frames: the
// `/hosting/sftp` page (My server on app-lite, `hosting-sftp.parity.ts`) and the Advanced tab of a project (`instance-advanced-sftp.parity.ts`).
// The frames differ in the header only (the project variant has no title row, `.advanced-hosting-page .page-title--advanced`). The table
// is the FTP one (`HostingFtpTable`), so the legacy selectors under `.v-main .data-table` are shared. Plan: context/changes/ui-sftp/plan.md ("Phase 7").

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/Sftp.vue, components/dataIterator/tables/HostingFtpTable.vue)
// ---------------------------------------------------------------------------------------------

export const sftpTitleProbe: Probe = {
  key: 'sftp-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('sftp-title'),
}

/** Legacy `QuickActionsButton` renders the same classes as Add, so Add is the one button without `aria-haspopup` (V2 menu activator). */
export const sftpAddProbe: Probe = {
  key: 'sftp-add',
  legacy: page => page.locator('.v-main .title-row .add-new-button:not([aria-haspopup])'),
  next: page => page.getByTestId('sftp-add'),
}

export const sftpActionsProbe: Probe = {
  key: 'sftp-actions',
  legacy: page => page.locator('.v-main .title-row .add-new-button[aria-haspopup]'),
  next: page => page.getByTestId('sftp-actions-button'),
}

/** The label span of the Actions button (desktop). */
export const sftpActionsLabelProbe: Probe = {
  key: 'sftp-actions-label',
  legacy: page => page.locator('.v-main .title-row .add-new-button[aria-haspopup] span').filter({ hasText: 'Actions' }).last(),
  next: page => page.getByTestId('sftp-actions-button').locator('span').filter({ hasText: 'Actions' }).last(),
  when: isDesktop,
}

/** The chevron icon of the Actions button (desktop). */
export const sftpActionsChevronProbe: Probe = {
  key: 'sftp-actions-chevron',
  legacy: page => page.locator('.v-main .title-row .add-new-button[aria-haspopup] .v-icon').first(),
  next: page => page.getByTestId('sftp-actions-button').locator('.v-icon').first(),
  when: isDesktop,
}

/** The title column, the first column of the title row (its width sets how much the filter column gets). */
export const sftpTitleColProbe: Probe = {
  key: 'sftp-title-col',
  legacy: page => page.locator('.v-main .title-row > div').first(),
  next: page => page.locator('.title-row > div').first(),
}

export const sftpFilterColProbe: Probe = {
  key: 'sftp-filter-col',
  legacy: page => page.locator('.v-main .title-row .page-title__filter-controls'),
  next: page => page.locator('.title-row .page-title__filter-controls'),
}

export const sftpSearchProbe: Probe = {
  key: 'sftp-search',
  legacy: page => page.locator('.v-main .my-hostings-search'),
  next: page => page.getByTestId('sftp-search'),
}

export const sftpTableProbe: Probe = {
  key: 'sftp-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('sftp-table'),
}

export const sftpRows = (page: Page, next: boolean) => (next ? page.getByTestId('sftp-table') : page.locator('.v-main .data-table')).locator('tbody tr')

export const sftpRowProbe: Probe = {
  key: 'sftp-row',
  legacy: page => sftpRows(page, false).first(),
  next: page => sftpRows(page, true).first(),
}

/** The user is a `b` on desktop only; the mobile row shows it in a `span`. */
export const sftpRowUserProbe: Probe = {
  key: 'sftp-row-user',
  legacy: page => sftpRows(page, false).first().locator('b').first(),
  next: page => sftpRows(page, true).first().locator('b').first(),
  when: isDesktop,
}

export const sftpRowActionsProbe: Probe = {
  key: 'sftp-row-actions',
  legacy: page => sftpRows(page, false).first().locator('.actions-row'),
  next: page => sftpRows(page, true).first().locator('.actions-row'),
  when: isDesktop,
}

export const sftpEmptyProbe: Probe = {
  key: 'sftp-empty',
  legacy: page => page.locator('.v-main .data-table .no-data'),
  next: page => page.getByTestId('sftp-empty'),
}

export const sftpEmptyAddProbe: Probe = {
  key: 'sftp-empty-add',
  legacy: page => page.locator('.v-main .data-table .no-data .v-btn'),
  next: page => page.getByTestId('sftp-empty-add'),
}

// Phase 2 probes

export const sftpNoResultsProbe: Probe = {
  key: 'sftp-no-results',
  legacy: page => page.locator('.v-main .data-table .no-results-container'),
  next: page => page.getByTestId('sftp-table').locator('.no-results-container'),
}

export const sftpFooterProbe: Probe = {
  key: 'sftp-footer',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer'),
  next: page => page.getByTestId('sftp-table').locator('.data-iterator-footer'),
}

export const sftpAccountSelectorProbe: Probe = {
  key: 'sftp-account-selector',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.getByTestId('sftp-account-selector'),
}

/** The open account menu of the selector (`ActiveServerAccountSelector`). */
export const sftpAccountMenuProbe: Probe = {
  key: 'sftp-account-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.locator('.v-overlay--active .v-select__content'),
  when: isDesktop,
}

/** The open Actions menu: legacy's active V2 menu, next the menu content (`sftp-actions-menu`). */
export const sftpActionsMenuProbe: Probe = {
  key: 'sftp-actions-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.getByTestId('sftp-actions-menu'),
}

/** One item of the open Actions menu, in legacy order: Disconnect all (0), Manage SSH access (1, SSH only). */
export function sftpActionsItemProbe (index: number): Probe {
  return {
    key: `sftp-actions-item-${index}`,
    legacy: page => page.locator('.menuable__content__active .v-list-item').nth(index),
    next: page => page.getByTestId('sftp-actions-item').nth(index),
  }
}

/** Three accounts; the third was never updated, so its "updated" cell is `-`. */
export const sftpAccounts = [
  sftpAccount({ user: 'example_deploy', updated_at: '2026-09-20T10:00:00.000Z' }),
  sftpAccount({ user: 'example_backup', updated_at: '2026-09-18T08:30:00.000Z' }),
  sftpAccount({ user: 'example_media', updated_at: null }),
]

export const sftpListPath = 'GET /server-accounts/11/sftp-accounts'

/** Ten accounts: two pages of eight and two rows, so the footer shows two pages. */
export const sftpManyAccounts = Array.from({ length: 10 }, (_, index) => sftpAccount({
  user: `example_user${index + 1}`,
  updated_at: '2026-09-20T10:00:00.000Z',
}))

export const sftpModalBox = (page: Page) => page.locator('.basic-modal')

export const sftpModalProbe: Probe = {
  key: 'sftp-modal',
  legacy: page => sftpModalBox(page),
  next: page => page.getByTestId('sftp-modal'),
}

export const sftpModalTitleProbe: Probe = {
  key: 'sftp-modal-title',
  legacy: page => sftpModalBox(page).locator('h6'),
  next: page => page.getByTestId('sftp-modal').locator('h6'),
}

/** A modal field by name; legacy has no name hook, so it is the n-th field of the form (BasicModalField order). */
export function sftpModalFieldProbe (name: string, index: number): Probe {
  return {
    key: `sftp-modal-field-${name}`,
    legacy: page => sftpModalBox(page).locator('form > div').nth(index),
    next: page => page.getByTestId(`sftp-modal-field-${name}`),
  }
}

/** The modal's submit button. Legacy is Vuetify 2 (`.v-card__actions`), next Vuetify 4 (`.v-card-actions`). */
export const sftpModalSubmit = (page: Page, next: boolean) => sftpModalBox(page).locator(next ? '.v-card-actions .v-btn' : '.v-card__actions .v-btn').first()

export const sftpModalSubmitProbe: Probe = {
  key: 'sftp-modal-submit',
  legacy: page => sftpModalSubmit(page, false),
  next: page => sftpModalSubmit(page, true),
}

/** One `<li>` of the Info modal, in legacy order: username (0), host (1), port (2). */
export function sftpModalInfoItemProbe (index: number): Probe {
  return {
    key: `sftp-modal-info-item-${index}`,
    legacy: page => sftpModalBox(page).locator('li').nth(index),
    next: page => page.getByTestId('sftp-modal').locator('li').nth(index),
  }
}

export function clickSftpRowAction (next: boolean, index: number): StateAction {
  return async page => {
    await sftpRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(index).click()
    await settled(sftpModalBox(page))
  }
}

/** Opens the Add method select and picks SSH Key (the method select is the second field of the form). */
export function pickSshKey (next: boolean): StateAction {
  return async page => {
    const select = next
      ? page.getByTestId('sftp-modal-field-type').locator('.v-field')
      : sftpModalBox(page).locator('form > div').nth(1).locator('.v-select')
    await select.click()
    const menu = next ? page.locator('.v-overlay--active .v-select__content') : page.locator('.menuable__content__active')
    await settled(menu)
    await menu.locator('.v-list-item').filter({ hasText: tr('form.option.sshKey') }).click()
    await settled(sftpModalBox(page))
  }
}

export const addModalFieldProbes = [
  sftpModalFieldProbe('username', 0),
  sftpModalFieldProbe('type', 1),
  sftpModalFieldProbe('password', 2),
  sftpModalFieldProbe('public_key', 3),
]

/** The modal's message paragraph (legacy `.v-card__text p`, next `.v-card-text p`, the shared BasicModal markup). */
export const sftpModalMessageProbe: Probe = {
  key: 'sftp-modal-message',
  legacy: page => sftpModalBox(page).locator('.v-card__text p').first(),
  next: page => page.getByTestId('sftp-modal').locator('.v-card-text p').first(),
}

// ---------------------------------------------------------------------------------------------
// Frame-dependent steps: the header controls live in `.title-row` (My server) or `.page-title--advanced` (project)
// ---------------------------------------------------------------------------------------------

const projectHeader = '.advanced-hosting-page .page-title--advanced'
const legacyHeader = (project: boolean) => (project ? projectHeader : '.v-main .title-row')

/** Opens the Actions menu: next by its test id, legacy by the activator with `aria-haspopup` (Add has none). */
export function openActionsMenu (next: boolean, project = false): StateAction {
  return async page => {
    if (next) {
      await page.getByTestId('sftp-actions-button').click()
      await settled(page.locator('.v-overlay--active .v-overlay__content.quick-actions-menu'))
      return
    }
    await openLegacyMenu(page => page.locator(`${legacyHeader(project)} .add-new-button[aria-haspopup]`))(page)
  }
}

/** Opens the Add modal from the header's Add button (the one without `aria-haspopup`). */
export function clickSftpAdd (next: boolean, project = false): StateAction {
  return async page => {
    await (next ? page.getByTestId('sftp-add') : page.locator(`${legacyHeader(project)} .add-new-button:not([aria-haspopup])`)).click()
    await settled(sftpModalBox(page))
  }
}

/** Opens the Actions menu and clicks one item: 0 Disconnect all, 1 Manage SSH access (SSH plans only). The menu closes on the click (legacy too). */
export function clickSftpActionsItem (next: boolean, index: number, project = false): StateAction {
  return async page => {
    await openActionsMenu(next, project)(page)
    await (next ? page.getByTestId('sftp-actions-item') : page.locator('.menuable__content__active .v-list-item')).nth(index).click()
    await expect(next ? page.locator('.v-overlay--active .v-overlay__content.quick-actions-menu') : page.locator('.menuable__content__active')).toBeHidden()
    await settled(sftpModalBox(page))
  }
}

// ---------------------------------------------------------------------------------------------
// Project frame (S-106, `LITE/views/instance/advanced/Sftp.vue`): the Advanced tab of a project. No title row, no account selector. Next keeps
// the test ids of the list header (`SftpView.vue`), so only the legacy selectors differ.
// ---------------------------------------------------------------------------------------------

export const sftpProjectTitleProbe: Probe = {
  key: 'sftp-title',
  legacy: page => page.locator(`${projectHeader} h4`),
  next: page => page.getByTestId('sftp-title'),
}

export const sftpProjectAddProbe: Probe = {
  key: 'sftp-add',
  legacy: page => page.locator(`${projectHeader} .add-new-button:not([aria-haspopup])`),
  next: page => page.getByTestId('sftp-add'),
}

export const sftpProjectAddIconProbe: Probe = {
  key: 'sftp-add-icon',
  legacy: page => page.locator(`${projectHeader} .add-new-button:not([aria-haspopup]) .v-icon`).first(),
  next: page => page.getByTestId('sftp-add').locator('.v-icon').first(),
}

export const sftpProjectActionsProbe: Probe = {
  key: 'sftp-actions',
  legacy: page => page.locator(`${projectHeader} .add-new-button[aria-haspopup]`),
  next: page => page.getByTestId('sftp-actions-button'),
}

/** The chevron icon of the Actions button (desktop). */
export const sftpProjectActionsChevronProbe: Probe = {
  key: 'sftp-actions-chevron',
  legacy: page => page.locator(`${projectHeader} .add-new-button[aria-haspopup] .v-icon`).first(),
  next: page => page.getByTestId('sftp-actions-button').locator('.v-icon').first(),
  when: isDesktop,
}

export const sftpProjectSearchProbe: Probe = {
  key: 'sftp-search',
  legacy: page => page.locator(`${projectHeader} .my-hostings-search`),
  next: page => page.getByTestId('sftp-search'),
}

/** The hover overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const sftpProjectAddOverlayProbe: Probe = {
  key: 'sftp-add-overlay',
  legacy: sftpProjectAddProbe.legacy,
  next: page => sftpProjectAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** Handlers of the project's SFTP page: the Advanced frame handlers plus the SFTP calls of the project's server account (id 1). */
export function sftpProjectHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    'GET /server-accounts/1/sftp-accounts': { json: sftpAccountsBody({ items: sftpAccounts }) },
    'GET /server-accounts/1/sftp-accounts/server-info': { json: sftpServerInfoBody() },
    ...overrides,
  })
}

/** The single-server `/home` without the `admin` key (as the FTP project states): the style manager drawer would widen the full-page shot. */

export { FTP_PROJECT_HOME as SFTP_PROJECT_HOME } from './ftp'

// ---------------------------------------------------------------------------------------------
// Shared steps of the project states (S-106 phases 8-17)
// ---------------------------------------------------------------------------------------------

type Target = (page: Page) => Locator

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final), the pattern of `hovered` in
 * `instance-advanced-ftp.parity.ts` (a spec cannot be imported). A target the variant does not render (the row's icons on mobile are in the
 * card) is skipped in that variant. The pointer stays where the action left it and is asserted on the element after the capture.
 */
export function hovered (base: ParityState, target: { legacy: Target, next: Target }, probes: Probe[]): ParityState {
  const hover = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    await element.hover()
  }
  const stillHovered = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    const onTarget = await element.evaluate((node, phone) => {
      const box = node.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      // `null`: the centre is outside the viewport. Allowed on a phone only: the header's buttons overflow the 375 px viewport in lite too (the
      // page is 490 px wide), the scroll reset after `hover()` moves them off-screen, and the state reads as the default one there.
      return top === null ? phone : node.contains(top)
    }, (page.viewportSize()?.width ?? 1440) < 768)
    expect(onTarget, 'pointer on the element after the capture').toBe(true)
  }
  return {
    ...base,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, hover(target.legacy)],
      next: [...base.actions.next, hover(target.next)],
    },
    probes: [...base.probes, ...probes],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered(target.legacy)],
      next: [...(base.afterCapture?.next ?? []), stillHovered(target.next)],
    },
  }
}

/** The icon button `index` of the first row's `.actions-row` (0 Info, 1 Edit, 2 Delete for `edit_password` rows); absent on mobile (the card has its own row). */
export const sftpRowActionButton = (page: Page, next: boolean, index: number) => sftpRows(page, next).first().locator('.actions-row .v-btn').nth(index)

/** The hover overlay of the first row's Delete icon: V2 `::before`, V4 `.v-btn__overlay`. */
export const sftpRowDeleteOverlayProbe: Probe = {
  key: 'sftp-row-delete-overlay',
  legacy: page => sftpRowActionButton(page, false, 2),
  next: page => sftpRowActionButton(page, true, 2).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/**
 * Keyboard focus of a header button, as `buttonFocusState` in auth.ts (Shift, `focus()`, `:focus-visible` asserted; V4 ring hidden in next)
 * but located by the test id / class of the other probes: on mobile the buttons are icon-only, so `getByRole` finds no name. The pointer is
 * moved off first and stays where it is.
 */
export function focusButton (locate: Target): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = locate(page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

/** Asserts that V4's focus ring (`::after`) of the button is hidden in next, where V2 has none. */
export function noFocusRing (locate: Target): StateAction {
  return async page => {
    const ring = await locate(page).evaluate(node => getComputedStyle(node, '::after').opacity)
    expect(ring, 'V4 focus ring hidden').toBe('0')
  }
}

/** Opens the modal of the first row by a DOM click on its icon `index` (0 Info, 1 Edit, 2 Delete): neither scrolls nor moves the pointer. */
export function openSftpRowModal (next: boolean, index: number): StateAction {
  return async page => {
    await sftpRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(index).evaluate(node => (node as HTMLElement).click())
    await settled(sftpModalBox(page))
  }
}

/** Ticks the `confirm` checkbox of the Delete modal (lifts `confirm-required`). */
export function tickSftpConfirm (next: boolean): StateAction {
  return async page => {
    const field = sftpModalFieldProbe('confirm', 0)
    await (next ? field.next(page) : field.legacy(page)).locator('.checkbox').first().click()
  }
}

/** The password of the Add form, a fixed value (the generator is random) of 8+ characters. */
export const SFTP_ADD_PASSWORD = 'Parity-sftp-2026'

/** The answer to an Add the server rejects: 422 on the username (the alert shows the message; the modal stays open). */
export const SFTP_ADD_422: Handler = { status: 422, json: { message: 'The given data was invalid.', errors: { username: ['The username has already been taken.'] } } }

/** Fills the Add form with a username and the fixed password, then presses Add. `force` on the password: on a phone legacy V2 squeezes that input. */
export function fillAndSubmitSftpAdd (next: boolean): StateAction {
  return async page => {
    await (next ? sftpModalFieldProbe('username', 0).next(page) : sftpModalFieldProbe('username', 0).legacy(page)).locator('input').first().fill('parity-user')
    await (next ? sftpModalFieldProbe('password', 2).next(page) : sftpModalFieldProbe('password', 2).legacy(page)).locator('input').first().fill(SFTP_ADD_PASSWORD, { force: true })
    await sftpModalBox(page).locator(next ? '.v-card-actions .v-btn' : '.v-card__actions .v-btn').first().click()
  }
}

/** The active page number of the footer's pagination (V2 `v-pagination__item--active` on the button, V4 `v-pagination__item--is-active` on the `li`, the probe takes its `.v-btn`; page 1 of a paged list). */
export const sftpPageActiveProbe: Probe = {
  key: 'sftp-page-active',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer .v-pagination__item--active'),
  next: page => page.getByTestId('sftp-table').locator('.data-iterator-footer .v-pagination__item--is-active .v-btn'),
}
