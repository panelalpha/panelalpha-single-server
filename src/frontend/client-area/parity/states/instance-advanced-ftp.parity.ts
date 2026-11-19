import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { settled } from './auth'
import { blurUsernameAndSubmit, clickProjectAdd, fillAndSubmitFtpAdd, FTP_ADD_422, FTP_PROJECT_ACCOUNTS, FTP_PROJECT_HOME, ftpActionsProbe, ftpAddFieldProbes, ftpEmptyAddProbe, ftpEmptyProbe, ftpFooterProbe, ftpManyAccounts, ftpModalFieldProbe, ftpModalInfoPartProbes, ftpModalInfoTitleNameProbe, ftpModalProbe, ftpModalSubmitProbe, ftpModalTitleProbe, ftpNoResultsProbe, ftpPageActiveProbe, ftpProjectAddIconProbe, ftpProjectAddOverlayProbe, ftpProjectAddProbe, ftpProjectHandlers, ftpProjectSearchProbe, ftpProjectTitleProbe, ftpRowDeleteOverlayProbe, ftpRowProbe, ftpRows, ftpRowUserProbe, ftpTableProbe, ftpUnsupportedProbe, ftpUsageChartProbe, ftpUsageMenuProbe, ftpUsageTextProbe, hoverUnsupported, modalBox, openRowDeleteModal, rowDeleteButton } from './ftp'
import { alertManagerProbe, ftpAccountsBody, listSearch, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID, advancedActiveItemProbe } from './instance-advanced-frame'
import { isMobile, NOW } from './shell'

// S-105 ui-ftp: the FTP list in the Advanced tab of a project (`/projects/:id/advanced/ftp`), measured on app-lite (`target: 'lite'`, M-2
// default). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Probes, handlers and
// the project header: `ftp.ts`; the frame: `instance-advanced-frame.ts`. Plan: context/changes/ui-ftp/plan.md ("Phase 7").

/** Ready when the Advanced sidebar and the first account row are both on the page (the title is the first probe). Each app has its own hook. */
const waitForFtp = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(page => page.locator('.v-main .data-table tbody tr').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(page => page.getByTestId('ftp-table').locator('tbody tr').first()),
  ],
}

/** The probes of the default state, the readiness anchor first (the title is the first probe). */
const ftpDefaultProbes: Probe[] = [
  ftpProjectTitleProbe,
  ftpProjectAddProbe,
  ftpProjectAddIconProbe,
  ftpProjectSearchProbe,
  ftpTableProbe,
  ftpRowProbe,
  ftpRowUserProbe,
  ftpUsageChartProbe,
  ftpUsageTextProbe,
  ftpActionsProbe,
  ftpFooterProbe,
  advancedActiveItemProbe,
]

// Phase 7: the FTP list of a project with two accounts (one limited, one unlimited), on the single-server project frame (`FTP_PROJECT_HOME`:
// the lite `/home` without `admin`, so the style manager does not widen the shot).
export const instanceAdvancedFtpDefault: ParityState = {
  id: 'ftp-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/ftp`,
  signedIn: true,
  clock: NOW,
  home: FTP_PROJECT_HOME,
  handlers: ftpProjectHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForFtp,
  probes: ftpDefaultProbes,
}

type Target = (page: Page) => Locator

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final), the pattern of `hoverState`
 * in `instance-backups.parity.ts` (not exported, so it is written here). A target the variant does not render (the row's icons on mobile
 * are in the card) is skipped in that variant. The pointer stays where the action left it and is asserted on the element after the capture.
 */
function hovered (base: ParityState, target: { legacy: Target, next: Target }, probes: Probe[]): ParityState {
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
    const onTarget = await element.evaluate(node => {
      const box = node.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return top !== null && node.contains(top)
    })
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

// Phase 8: hover of the header's Add button (on mobile it is icon-only, located by the same test id / class as the other probes) and hover
// of the Delete icon of the first row (desktop `.actions-row`; on mobile the icon sits in the card and the state reads as the default one).
export const instanceAdvancedFtpHover: ParityState = {
  ...hovered(instanceAdvancedFtpDefault, { legacy: ftpProjectAddProbe.legacy, next: ftpProjectAddProbe.next }, [ftpProjectAddOverlayProbe]),
  id: 'ftp-hover',
}

export const instanceAdvancedFtpRowHover: ParityState = {
  ...hovered(instanceAdvancedFtpDefault, { legacy: page => rowDeleteButton(page, false), next: page => rowDeleteButton(page, true) }, [ftpRowDeleteOverlayProbe]),
  id: 'ftp-row-hover',
}

// Phase 9 (reworked in Phase 19): keyboard focus of the header's Add button, as `buttonFocusState` in auth.ts (Shift, `focus()`, `:focus-visible`
// asserted; V4 ring hidden in next) but located by the test id / class of the other probes: on mobile the button is icon-only, so it has no
// accessible name ("Add Account") for `getByRole`. The pointer is moved off first and stays where it is.
function focusAdd (locate: Target): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = locate(page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}
const noFocusRing: StateAction = async page => {
  const ring = await ftpProjectAddProbe.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
  expect(ring, 'V4 focus ring hidden').toBe('0')
}
export const instanceAdvancedFtpFocus: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...instanceAdvancedFtpDefault.actions.legacy, focusAdd(ftpProjectAddProbe.legacy)],
    next: [...instanceAdvancedFtpDefault.actions.next, focusAdd(ftpProjectAddProbe.next)],
  },
  probes: [...instanceAdvancedFtpDefault.probes, ftpProjectAddOverlayProbe],
  afterCapture: {
    legacy: [...(instanceAdvancedFtpDefault.afterCapture?.legacy ?? [])],
    next: [...(instanceAdvancedFtpDefault.afterCapture?.next ?? []), noFocusRing],
  },
}

// Phase 10: the Delete modal before its `confirm` checkbox is ticked (`BasicModal` `confirm-required`): the submit button is disabled. Opened
// by `openRowDeleteModal` (DOM click on the first row's Delete icon); only the modal's probes are read, as in `hosting-ftp-delete-modal`.
export const instanceAdvancedFtpDisabled: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-disabled',
  actions: {
    legacy: [...waitForFtp.legacy, openRowDeleteModal(false)],
    next: [...waitForFtp.next, openRowDeleteModal(true)],
  },
  probes: [ftpModalProbe, ftpModalTitleProbe, ftpModalFieldProbe('confirm', 0), ftpModalSubmitProbe],
}

// Phase 17: the same Delete modal after its `confirm` checkbox is ticked (`confirm-required` lifted): the submit is enabled and red. The state
// ends before the submit is pressed, so no DELETE request is sent. Only the modal's probes are read, as in `hosting-ftp-delete-modal`.
function tickFtpConfirm (next: boolean): StateAction {
  return async page => {
    await (next ? ftpModalFieldProbe('confirm', 0).next(page) : ftpModalFieldProbe('confirm', 0).legacy(page)).locator('.checkbox').first().click()
  }
}

export const instanceAdvancedFtpDeleteModal: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-delete-modal',
  actions: {
    legacy: [...waitForFtp.legacy, openRowDeleteModal(false), tickFtpConfirm(false)],
    next: [...waitForFtp.next, openRowDeleteModal(true), tickFtpConfirm(true)],
  },
  probes: [ftpModalProbe, ftpModalTitleProbe, ftpModalFieldProbe('confirm', 0), ftpModalSubmitProbe],
}

// Phase 11: the list request fails (500 `Server Error`): the shell's alert and an empty table. The readiness anchor is the header title (the
// table has no row), and the alert is awaited last, since it renders after the failed request.
const waitForFtpError = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(ftpProjectTitleProbe.legacy),
    waitFor(alertManagerProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(ftpProjectTitleProbe.next),
    waitFor(alertManagerProbe.next),
  ],
}

export const instanceAdvancedFtpError: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-error',
  handlers: ftpProjectHandlers({ 'GET /server-accounts/1/ftp-accounts': { status: 500, json: { message: 'Server Error' } } }),
  actions: waitForFtpError,
  probes: [ftpProjectTitleProbe, ftpTableProbe, ftpEmptyProbe, ftpEmptyAddProbe, alertManagerProbe, advancedActiveItemProbe],
}

// Phase 12: the Add modal opened from the header's Add button (`clickProjectAdd`), and the same modal after Add is pressed with the username
// blurred and no data (`blurUsernameAndSubmit`, the rules show). Only the modal's probes are read, as in `hosting-ftp-add-modal`.
export const instanceAdvancedFtpAddModal: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-add-modal',
  actions: {
    legacy: [...waitForFtp.legacy, clickProjectAdd(false)],
    next: [...waitForFtp.next, clickProjectAdd(true)],
  },
  probes: [ftpModalProbe, ftpModalTitleProbe, ...ftpAddFieldProbes, ftpModalSubmitProbe],
}

export const instanceAdvancedFtpAddModalErrors: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-add-modal-errors',
  actions: {
    legacy: [...waitForFtp.legacy, clickProjectAdd(false), blurUsernameAndSubmit(false)],
    next: [...waitForFtp.next, clickProjectAdd(true), blurUsernameAndSubmit(true)],
  },
  probes: [ftpModalProbe, ftpModalTitleProbe, ...ftpAddFieldProbes, ftpModalSubmitProbe],
}

// Phase 13: a valid Add form is submitted and the server answers 422 on the username. Legacy shows the message only in the alert (its
// in-modal `submittingError` line is commented out in the template), so the modal stays open and the alert is awaited last.
const waitForFtpAddError = {
  legacy: [...waitForFtp.legacy, clickProjectAdd(false), fillAndSubmitFtpAdd(false), waitFor(alertManagerProbe.legacy)],
  next: [...waitForFtp.next, clickProjectAdd(true), fillAndSubmitFtpAdd(true), waitFor(alertManagerProbe.next)],
}

export const instanceAdvancedFtpAddError: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-add-error',
  handlers: ftpProjectHandlers({ 'POST /server-accounts/1/ftp-accounts': FTP_ADD_422 }),
  actions: waitForFtpAddError,
  probes: [ftpModalProbe, ftpModalTitleProbe, ...ftpAddFieldProbes, ftpModalSubmitProbe, alertManagerProbe],
}

// Phase 14: the project has no FTP accounts (`items: []`): the table shows `TableFullScreenMessage` with the illustration and the Add button,
// and the header has no search and no Add (both render only with items, in both apps). The readiness anchor is the empty message, since
// there is no row to wait for.
const waitForFtpEmpty = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(ftpEmptyProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(ftpEmptyProbe.next),
  ],
}

export const instanceAdvancedFtpEmpty: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-empty',
  handlers: ftpProjectHandlers({ 'GET /server-accounts/1/ftp-accounts': { json: ftpAccountsBody({ items: [], usage: true }) } }),
  actions: waitForFtpEmpty,
  probes: [ftpProjectTitleProbe, ftpTableProbe, ftpEmptyProbe, ftpEmptyAddProbe, advancedActiveItemProbe],
}

// Phase 14: a search term without matches on the project's two accounts: the table shows `NoResults`, the header keeps its search and Add.
// `listSearch` types the term and steps the clock until the message renders (the same helper as `hosting-ftp-no-results`).
export const instanceAdvancedFtpNoResults: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-no-results',
  actions: {
    legacy: [...waitForFtp.legacy, listSearch('no-such-account')],
    next: [...waitForFtp.next, listSearch('no-such-account')],
  },
  probes: [ftpProjectTitleProbe, ftpProjectAddProbe, ftpProjectSearchProbe, ftpTableProbe, ftpNoResultsProbe, advancedActiveItemProbe],
}

// Phase 15: the list request hangs (`'hold'`), so the table keeps its loading skeleton (`LogsTableSortSkeleton` and `LogsTableSkeletonItem`
// on desktop, the card skeletons below `lg`). The header has no Add and no search while `items` is empty (as in `ftp-empty`). The skeleton
// bones are masked (the mask keeps the state independent of the bone layout), and the readiness anchor is the header title. The skeleton is
// awaited last, since it renders only once the list request has started.
const ftpSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-main .data-table .v-skeleton-loader')],
  next: [(page: Page) => page.getByTestId('ftp-table').locator('.v-skeleton-loader')],
}

const waitForFtpLoading = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(ftpProjectTitleProbe.legacy),
    waitFor(page => page.locator('.v-main .data-table .v-skeleton-loader').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(ftpProjectTitleProbe.next),
    waitFor(page => page.getByTestId('ftp-table').locator('.v-skeleton-loader').first()),
  ],
}

export const instanceAdvancedFtpLoading: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-loading',
  handlers: ftpProjectHandlers({ 'GET /server-accounts/1/ftp-accounts': 'hold' }),
  actions: waitForFtpLoading,
  masks: ftpSkeletonMasks,
  probes: [ftpProjectTitleProbe, ftpTableProbe, advancedActiveItemProbe],
}

// Phase 15: the list loads, then the header's Add is pressed while the domains request hangs (`'hold'`): `loadAddModal` keeps the spinner on
// the Add button (`:loading="addButtonLoading"`, legacy `views/instance/advanced/Ftp.vue:33`). The button is clicked without waiting for a
// modal, since none opens while the request is pending. The loader spinner is masked; the button's colour and text state are probed.
function clickProjectAddHold (next: boolean): StateAction {
  return async page => {
    await (next ? ftpProjectAddProbe.next(page) : ftpProjectAddProbe.legacy(page)).click()
  }
}

function waitForAddLoading (next: boolean): StateAction {
  return async page => {
    await settled((next ? ftpProjectAddProbe.next(page) : ftpProjectAddProbe.legacy(page)).locator('.v-progress-circular'))
  }
}

export const instanceAdvancedFtpAddLoading: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-add-loading',
  handlers: ftpProjectHandlers({ 'GET /server-accounts/1/domains': 'hold' }),
  actions: {
    legacy: [...waitForFtp.legacy, clickProjectAddHold(false), waitForAddLoading(false)],
    next: [...waitForFtp.next, clickProjectAddHold(true), waitForAddLoading(true)],
  },
  masks: {
    legacy: [(page: Page) => ftpProjectAddProbe.legacy(page).locator('.v-progress-circular')],
    next: [(page: Page) => ftpProjectAddProbe.next(page).locator('.v-progress-circular')],
  },
  probes: [ftpProjectTitleProbe, ftpProjectAddProbe, ftpTableProbe, ftpRowProbe, advancedActiveItemProbe],
}

// Phase 16: the Info modal of the first row, opened by a DOM click on its Info icon (index 0; `openRowDeleteModal` does the same for Delete).
// The modal lists the username, host and port, and has only the Cancel button. The probes read the card, the title with its username, the
// label and value of each row (`display`, moved to classes in phase 5) and Cancel; the modal opens once the server-info answer comes back.
function openRowInfoModal (next: boolean): StateAction {
  return async page => {
    await ftpRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(0).evaluate(node => (node as HTMLElement).click())
    await settled(modalBox(page))
  }
}

export const instanceAdvancedFtpInfoModal: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-info-modal',
  actions: {
    legacy: [...waitForFtp.legacy, openRowInfoModal(false)],
    next: [...waitForFtp.next, openRowInfoModal(true)],
  },
  probes: [ftpModalProbe, ftpModalTitleProbe, ftpModalInfoTitleNameProbe, ...ftpModalInfoPartProbes, ftpModalSubmitProbe],
}

// Phase 18: the account's usage is not supported (`usage: false`, as on a server without quota reporting): the usage cell shows the "not
// supported" icon button instead of the bar (desktop only, `.ps-7`). The hover opens its menu (`hoverUnsupported`, the same action as
// `hosting-ftp-usage-unsupported`); the pointer stays on the icon for the capture. The bar of the mobile card (`when: isMobile`) is the
// usage chart; its probe is read on mobile only, as the list states do.
export const instanceAdvancedFtpUsageUnsupported: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-usage-unsupported',
  pointer: 'keep',
  handlers: ftpProjectHandlers({ 'GET /server-accounts/1/ftp-accounts': { json: ftpAccountsBody({ items: FTP_PROJECT_ACCOUNTS, usage: false }) } }),
  actions: {
    legacy: [...waitForFtp.legacy, hoverUnsupported(false)],
    next: [...waitForFtp.next, hoverUnsupported(true)],
  },
  probes: [
    ftpProjectTitleProbe,
    ftpProjectAddProbe,
    ftpProjectSearchProbe,
    ftpTableProbe,
    ftpRowProbe,
    ftpRowUserProbe,
    { ...ftpUsageChartProbe, when: isMobile },
    ftpUnsupportedProbe,
    ftpUsageMenuProbe,
    ftpActionsProbe,
    advancedActiveItemProbe,
  ],
}

// Phase 18: more accounts than one page (ten, two pages of eight, `ftpManyAccounts`): the table shows the first page and the footer's second
// page button. The active page number is probed (page 1), beside the footer and the active sidebar item.
export const instanceAdvancedFtpPaged: ParityState = {
  ...instanceAdvancedFtpDefault,
  id: 'ftp-paged',
  handlers: ftpProjectHandlers({ 'GET /server-accounts/1/ftp-accounts': { json: ftpAccountsBody({ items: ftpManyAccounts, usage: true }) } }),
  probes: [ftpProjectTitleProbe, ftpProjectAddProbe, ftpProjectSearchProbe, ftpTableProbe, ftpRowProbe, ftpRowUserProbe, ftpFooterProbe, ftpPageActiveProbe, advancedActiveItemProbe],
}

const states: ParityState[] = [instanceAdvancedFtpDefault, instanceAdvancedFtpHover, instanceAdvancedFtpRowHover, instanceAdvancedFtpFocus, instanceAdvancedFtpDisabled, instanceAdvancedFtpDeleteModal, instanceAdvancedFtpError, instanceAdvancedFtpAddModal, instanceAdvancedFtpAddModalErrors, instanceAdvancedFtpAddError, instanceAdvancedFtpEmpty, instanceAdvancedFtpNoResults, instanceAdvancedFtpLoading, instanceAdvancedFtpAddLoading, instanceAdvancedFtpInfoModal, instanceAdvancedFtpUsageUnsupported, instanceAdvancedFtpPaged]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
