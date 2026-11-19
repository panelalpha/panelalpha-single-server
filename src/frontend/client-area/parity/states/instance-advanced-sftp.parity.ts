import type { ParityState, Probe } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertManagerProbe, listSearch, sftpAccountsBody, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID, advancedActiveItemProbe } from './instance-advanced-frame'
import { addModalFieldProbes, clickSftpActionsItem, clickSftpAdd, fillAndSubmitSftpAdd, focusButton, hovered, noFocusRing, openSftpRowModal, pickSshKey, SFTP_ADD_422, SFTP_PROJECT_HOME, sftpEmptyAddProbe, sftpEmptyProbe, sftpFooterProbe, sftpManyAccounts, sftpModalFieldProbe, sftpModalInfoItemProbe, sftpModalMessageProbe, sftpModalProbe, sftpModalSubmitProbe, sftpModalTitleProbe, sftpNoResultsProbe, sftpPageActiveProbe, sftpProjectActionsChevronProbe, sftpProjectActionsProbe, sftpProjectAddIconProbe, sftpProjectAddOverlayProbe, sftpProjectAddProbe, sftpProjectHandlers, sftpProjectSearchProbe, sftpProjectTitleProbe, sftpRowActionButton, sftpRowActionsProbe, sftpRowDeleteOverlayProbe, sftpRowProbe, sftpRowUserProbe, sftpTableProbe, tickSftpConfirm } from './sftp'
import { NOW } from './shell'

// S-106 ui-sftp: the SFTP list in the Advanced tab of a project (`/projects/:id/advanced/sftp`), measured on app-lite (`target: 'lite'`, M-2
// default). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Probes, handlers and
// the project header: `sftp.ts`; the frame: `instance-advanced-frame.ts`. Plan: context/changes/ui-sftp/plan.md ("Phase 7").

/** Ready when the Advanced sidebar and the first account row are both on the page (the title is the first probe). Each app has its own hook. */
const waitForSftp = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(page => page.locator('.v-main .data-table tbody tr').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(page => page.getByTestId('sftp-table').locator('tbody tr').first()),
  ],
}

/** The probes of the default state, the readiness anchor first (the title is the first probe). */
const sftpDefaultProbes: Probe[] = [
  sftpProjectTitleProbe,
  sftpProjectAddProbe,
  sftpProjectAddIconProbe,
  sftpProjectActionsProbe,
  sftpProjectActionsChevronProbe,
  sftpProjectSearchProbe,
  sftpTableProbe,
  sftpRowProbe,
  sftpRowUserProbe,
  sftpRowActionsProbe,
  sftpFooterProbe,
  advancedActiveItemProbe,
]

// Phase 7: the SFTP list of a project with three accounts (`edit_password` action, so the Edit icon shows), on the single-server project
// frame (`SFTP_PROJECT_HOME`: the lite `/home` without `admin`, so the style manager does not widen the shot).
export const instanceAdvancedSftpDefault: ParityState = {
  id: 'sftp-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/sftp`,
  signedIn: true,
  clock: NOW,
  home: SFTP_PROJECT_HOME,
  handlers: sftpProjectHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForSftp,
  probes: sftpDefaultProbes,
}

// Phase 8: hover of the header's Add button (on mobile it is icon-only, located by the same test id / class as the other probes) and hover of
// the Delete icon of the first row (desktop `.actions-row`; on mobile the icon sits in the card and the state reads as the default one).
export const instanceAdvancedSftpHover: ParityState = {
  ...hovered(instanceAdvancedSftpDefault, { legacy: sftpProjectAddProbe.legacy, next: sftpProjectAddProbe.next }, [sftpProjectAddOverlayProbe]),
  id: 'sftp-hover',
}

export const instanceAdvancedSftpRowHover: ParityState = {
  ...hovered(instanceAdvancedSftpDefault, { legacy: page => sftpRowActionButton(page, false, 2), next: page => sftpRowActionButton(page, true, 2) }, [sftpRowDeleteOverlayProbe]),
  id: 'sftp-row-hover',
}

// Phase 9: keyboard focus of the header's Add button and, apart, of the Actions activator (its chevron is probed in the default probes).
export const instanceAdvancedSftpFocus: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...waitForSftp.legacy, focusButton(sftpProjectAddProbe.legacy)],
    next: [...waitForSftp.next, focusButton(sftpProjectAddProbe.next)],
  },
  probes: [...sftpDefaultProbes, sftpProjectAddOverlayProbe],
  afterCapture: { legacy: [], next: [noFocusRing(sftpProjectAddProbe.next)] },
}

export const instanceAdvancedSftpActionsFocus: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-actions-focus',
  pointer: 'keep',
  actions: {
    legacy: [...waitForSftp.legacy, focusButton(sftpProjectActionsProbe.legacy)],
    next: [...waitForSftp.next, focusButton(sftpProjectActionsProbe.next)],
  },
  probes: sftpDefaultProbes,
  afterCapture: { legacy: [], next: [noFocusRing(sftpProjectActionsProbe.next)] },
}

// Phase 10: the Delete modal before its `confirm` checkbox is ticked (`confirm-required`): the submit button is disabled. Opened by a DOM
// click on the first row's Delete icon; only the modal's probes are read.
export const instanceAdvancedSftpDisabled: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-disabled',
  actions: {
    legacy: [...waitForSftp.legacy, openSftpRowModal(false, 2)],
    next: [...waitForSftp.next, openSftpRowModal(true, 2)],
  },
  probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalFieldProbe('confirm', 0), sftpModalSubmitProbe],
}

// Phase 11: the list request fails (500 `Server Error`): the shell's alert and an empty table. The readiness anchor is the header title (the
// table has no row), and the alert is awaited last, since it renders after the failed request.
const waitForSftpError = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(sftpProjectTitleProbe.legacy),
    waitFor(alertManagerProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(sftpProjectTitleProbe.next),
    waitFor(alertManagerProbe.next),
  ],
}

export const instanceAdvancedSftpError: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-error',
  handlers: sftpProjectHandlers({ 'GET /server-accounts/1/sftp-accounts': { status: 500, json: { message: 'Server Error' } } }),
  actions: waitForSftpError,
  probes: [sftpProjectTitleProbe, sftpTableProbe, sftpEmptyProbe, sftpEmptyAddProbe, alertManagerProbe, advancedActiveItemProbe],
}

// Phase 12: the Add modal opened from the header's Add button (project prefix `username_`): the password variant and the SSH Key variant.
// The Add form has no field rules, so there is no `sftp-add-modal-errors` state (N/A, see change.md).
export const instanceAdvancedSftpAddModal: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-add-modal',
  actions: {
    legacy: [...waitForSftp.legacy, clickSftpAdd(false, true)],
    next: [...waitForSftp.next, clickSftpAdd(true, true)],
  },
  probes: [sftpModalProbe, sftpModalTitleProbe, ...addModalFieldProbes, sftpModalSubmitProbe],
}

export const instanceAdvancedSftpAddModalKey: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-add-modal-key',
  actions: {
    legacy: [...waitForSftp.legacy, clickSftpAdd(false, true), pickSshKey(false)],
    next: [...waitForSftp.next, clickSftpAdd(true, true), pickSshKey(true)],
  },
  probes: [sftpModalProbe, sftpModalTitleProbe, ...addModalFieldProbes, sftpModalSubmitProbe],
}

// Phase 13: a valid Add form is submitted and the server answers 422. The modal stays open and the alert is awaited last.
export const instanceAdvancedSftpAddError: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-add-error',
  handlers: sftpProjectHandlers({ 'POST /server-accounts/1/sftp-accounts': SFTP_ADD_422 }),
  actions: {
    legacy: [...waitForSftp.legacy, clickSftpAdd(false, true), fillAndSubmitSftpAdd(false), waitFor(alertManagerProbe.legacy)],
    next: [...waitForSftp.next, clickSftpAdd(true, true), fillAndSubmitSftpAdd(true), waitFor(alertManagerProbe.next)],
  },
  probes: [sftpModalProbe, sftpModalTitleProbe, ...addModalFieldProbes, sftpModalSubmitProbe, alertManagerProbe],
}

// Phase 14: the project has no SFTP accounts: the table shows `TableFullScreenMessage` with the illustration and the Add button, and the
// header has no search, Actions or Add (they render only with items). The readiness anchor is the empty message.
const waitForSftpEmpty = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(sftpEmptyProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(sftpEmptyProbe.next),
  ],
}

export const instanceAdvancedSftpEmpty: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-empty',
  handlers: sftpProjectHandlers({ 'GET /server-accounts/1/sftp-accounts': { json: sftpAccountsBody({ items: [] }) } }),
  actions: waitForSftpEmpty,
  probes: [sftpProjectTitleProbe, sftpTableProbe, sftpEmptyProbe, sftpEmptyAddProbe, advancedActiveItemProbe],
}

// Phase 14: a search term without matches: the table shows `NoResults`, the header keeps its search, Actions and Add. `listSearch` types the
// term and steps the clock until the message renders.
export const instanceAdvancedSftpNoResults: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-no-results',
  actions: {
    legacy: [...waitForSftp.legacy, listSearch('no-such-account')],
    next: [...waitForSftp.next, listSearch('no-such-account')],
  },
  probes: [sftpProjectTitleProbe, sftpProjectAddProbe, sftpProjectActionsProbe, sftpProjectSearchProbe, sftpTableProbe, sftpNoResultsProbe, advancedActiveItemProbe],
}

// Phase 15: the list request hangs (`'hold'`), so the table keeps its loading skeleton and the header has no search, Actions or Add (no items
// yet). The skeleton bones are masked; the readiness anchor is the header title and the skeleton is awaited last.
// `sftp-add-loading` is N/A: legacy `addButtonLoading` is never true (see change.md).
const sftpSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-main .data-table .v-skeleton-loader')],
  next: [(page: Page) => page.getByTestId('sftp-table').locator('.v-skeleton-loader')],
}

const waitForSftpLoading = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(sftpProjectTitleProbe.legacy),
    waitFor(page => page.locator('.v-main .data-table .v-skeleton-loader').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(sftpProjectTitleProbe.next),
    waitFor(page => page.getByTestId('sftp-table').locator('.v-skeleton-loader').first()),
  ],
}

export const instanceAdvancedSftpLoading: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-loading',
  handlers: sftpProjectHandlers({ 'GET /server-accounts/1/sftp-accounts': 'hold' }),
  actions: waitForSftpLoading,
  masks: sftpSkeletonMasks,
  probes: [sftpProjectTitleProbe, sftpTableProbe, advancedActiveItemProbe],
}

// Phase 16: the Edit modal (password / key change, the row has `edit_password`) and the Info modal (`GET …/server-info`: username, host, port).
// Both are opened by a DOM click on the first row's icon.
export const instanceAdvancedSftpEditModal: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-edit-modal',
  actions: {
    legacy: [...waitForSftp.legacy, openSftpRowModal(false, 1)],
    next: [...waitForSftp.next, openSftpRowModal(true, 1)],
  },
  probes: [
    sftpModalProbe,
    sftpModalTitleProbe,
    sftpModalFieldProbe('type', 0),
    sftpModalFieldProbe('password', 1),
    sftpModalFieldProbe('public_key', 2),
    sftpModalSubmitProbe,
  ],
}

export const instanceAdvancedSftpInfoModal: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-info-modal',
  actions: {
    legacy: [...waitForSftp.legacy, openSftpRowModal(false, 0)],
    next: [...waitForSftp.next, openSftpRowModal(true, 0)],
  },
  probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalInfoItemProbe(0), sftpModalInfoItemProbe(1), sftpModalInfoItemProbe(2), sftpModalSubmitProbe],
}

// Phase 17: the Delete modal after its `confirm` checkbox is ticked (the submit is enabled; the state ends before it is pressed, so no DELETE
// is sent) and the Disconnect all modal (Actions menu, the project's only item). Menu itself is measured on `hosting-sftp-actions-menu`.
export const instanceAdvancedSftpDeleteModal: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-delete-modal',
  actions: {
    legacy: [...waitForSftp.legacy, openSftpRowModal(false, 2), tickSftpConfirm(false)],
    next: [...waitForSftp.next, openSftpRowModal(true, 2), tickSftpConfirm(true)],
  },
  probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalFieldProbe('confirm', 0), sftpModalSubmitProbe],
}

export const instanceAdvancedSftpDisconnectModal: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-disconnect-modal',
  actions: {
    legacy: [...waitForSftp.legacy, clickSftpActionsItem(false, 0, true)],
    next: [...waitForSftp.next, clickSftpActionsItem(true, 0, true)],
  },
  probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalMessageProbe, sftpModalSubmitProbe],
}

// Phase 18: more accounts than one page (ten, two pages of eight): the table shows the first page, the footer and its active page number.
export const instanceAdvancedSftpPaged: ParityState = {
  ...instanceAdvancedSftpDefault,
  id: 'sftp-paged',
  handlers: sftpProjectHandlers({ 'GET /server-accounts/1/sftp-accounts': { json: sftpAccountsBody({ items: sftpManyAccounts }) } }),
  probes: [sftpProjectTitleProbe, sftpProjectAddProbe, sftpProjectSearchProbe, sftpTableProbe, sftpRowProbe, sftpRowUserProbe, sftpFooterProbe, sftpPageActiveProbe, advancedActiveItemProbe],
}

const states: ParityState[] = [
  instanceAdvancedSftpDefault,
  instanceAdvancedSftpHover,
  instanceAdvancedSftpRowHover,
  instanceAdvancedSftpFocus,
  instanceAdvancedSftpActionsFocus,
  instanceAdvancedSftpDisabled,
  instanceAdvancedSftpError,
  instanceAdvancedSftpAddModal,
  instanceAdvancedSftpAddModalKey,
  instanceAdvancedSftpAddError,
  instanceAdvancedSftpEmpty,
  instanceAdvancedSftpNoResults,
  instanceAdvancedSftpLoading,
  instanceAdvancedSftpEditModal,
  instanceAdvancedSftpInfoModal,
  instanceAdvancedSftpDeleteModal,
  instanceAdvancedSftpDisconnectModal,
  instanceAdvancedSftpPaged,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
