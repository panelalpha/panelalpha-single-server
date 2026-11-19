import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, tr } from './auth'
import { listSearch, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { clickCreate, confirmAndDelete, createInvalidProbes, createLoadingProbe, createModalProbes, createRefusedHandler, createSubmittingHandler, deleteHeldHandler, deleteModalProbes, emptyProbes, errorProbes, fillCreateForm, FIRST_ROW_EMAIL, goToSecondPage, hoverFirstResetIcon, loadingProbes, modalLoaderMasks, openCreate, openDelete, openReset, protectedDeleteDisabled, protectedDeleteProbe, protectedRows, refusedCreateShown, resetIconOverlayProbe, resetIconStillHovered, resetModalProbes, rowTooltipProbe, searchEmptyProbes, submitCreate, submitEmptyCreate, submittingProbes, USERS_HOME, USERS_PATH, usersHandlers, usersList, usersProbes } from './instance-users'
import { NOW } from './shell'

// S-98 ui-instance-users: the Users page of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a literal
// `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-users.ts`.
// Plan: context/changes/ui-instance-users/plan.md.

/** The readiness anchor: the e-mail of the first row is on the page (the skeleton rows also match `tbody tr`, so the text is the anchor). */
const waitForRows = {
  legacy: [waitFor(page => page.getByText(FIRST_ROW_EMAIL, { exact: true }))],
  next: [waitFor(page => page.getByText(FIRST_ROW_EMAIL, { exact: true }))],
}

// Phase 5: the default state, the first page of the users (8 of 10, id descending as text) with the pagination footer.
export const instanceUsersDefault: ParityState = {
  id: 'instance-users-default',
  target: 'lite',
  path: USERS_PATH,
  signedIn: true,
  clock: NOW,
  home: USERS_HOME,
  handlers: usersHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForRows,
  probes: usersProbes,
}

// Phase 6: the second page of the footer (8 of 10 on page 1): the last two rows, `"11"` and `"10"`, and the footer on page 2.
export const instanceUsersPageTwo: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-page-2',
  actions: {
    legacy: [...waitForRows.legacy, goToSecondPage.legacy],
    next: [...waitForRows.next, goToSecondPage.next],
  },
}

// Phase 7: hover of "Create User" (`buttonHoverState`, the overlay: V2 `::before`, V4 `.v-btn__overlay`) and, on desktop, hover of the reset icon of
// the first row with its tooltip (on mobile the icons are in the card and a tooltip needs no touch, so `row-hover` is desktop only).
export const instanceUsersHover: ParityState = buttonHoverState(instanceUsersDefault, 'instance-users-hover', 'button.user.create', 'lite')

export const instanceUsersRowHover: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-row-hover',
  pointer: 'keep',
  actions: {
    legacy: [...instanceUsersDefault.actions.legacy, hoverFirstResetIcon.legacy],
    next: [...instanceUsersDefault.actions.next, hoverFirstResetIcon.next],
  },
  probes: [...instanceUsersDefault.probes, resetIconOverlayProbe, rowTooltipProbe],
  afterCapture: { legacy: [resetIconStillHovered.legacy], next: [resetIconStillHovered.next] },
}

// Phase 8: keyboard focus on "Create User" (`buttonFocusState`: the cursor is taken off and a key that moves no focus is pressed, so the focus is
// keyboard focus). The search field is the data-iterator kit (measured in S-69/S-88); the mobile sort labels are `div @click`, not focusable in legacy.
export const instanceUsersFocus: ParityState = buttonFocusState(instanceUsersDefault, 'instance-users-focus', 'button.user.create', 'lite')

// Phase 9: Delete disabled for the user with id 1 (desktop only: legacy disables it in the table only).
export const instanceUsersDisabled: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-disabled',
  handlers: usersHandlers({ 'GET /projects/41/users': usersList(protectedRows) }),
  probes: [...instanceUsersDefault.probes, protectedDeleteProbe],
  afterCapture: { legacy: [protectedDeleteDisabled.legacy], next: [protectedDeleteDisabled.next] },
}

// Phase 10: the empty list (`TableFullScreenMessage`) and the search without results (`listSearch` steps the frozen clock past the debounce).
const emptyTitle = (target: 'lite') => waitFor(page => page.getByText(tr('heading.instance.advanced.users.noData', target), { exact: true }))

export const instanceUsersEmpty: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-empty',
  handlers: usersHandlers({ 'GET /projects/41/users': usersList([]) }),
  actions: { legacy: [emptyTitle('lite')], next: [emptyTitle('lite')] },
  probes: emptyProbes,
}

export const instanceUsersSearchEmpty: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-search-empty',
  actions: {
    legacy: [...waitForRows.legacy, listSearch('zzz')],
    next: [...waitForRows.next, listSearch('zzz')],
  },
  probes: searchEmptyProbes,
}

// Phase 11: the list still loading (`GET users` held: skeleton rows) and "Create User" waiting for the roles (`GET users-roles` held: the button loads).
const skeletonAnchor = waitFor(page => page.locator('.v-card.data-table .v-skeleton-loader').first())

export const instanceUsersLoading: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-loading',
  handlers: usersHandlers({ 'GET /projects/41/users': 'hold' }),
  actions: { legacy: [skeletonAnchor], next: [skeletonAnchor] },
  probes: loadingProbes,
}

export const instanceUsersCreateLoading: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-create-loading',
  handlers: usersHandlers({ 'GET /projects/41/users-roles': 'hold' }),
  actions: {
    legacy: [...waitForRows.legacy, clickCreate.legacy],
    next: [...waitForRows.next, clickCreate.next],
  },
  masks: {
    legacy: [page => page.locator('.add-new-button .v-btn__loader')],
    next: [page => page.locator('.add-new-button .v-btn__loader')],
  },
  probes: [...instanceUsersDefault.probes, createLoadingProbe],
}

// Phase 12: the Create modal (four fields, the role select as text) and its validation (every field empty: the required messages).
export const instanceUsersCreateModal: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-create-modal',
  actions: {
    legacy: [...waitForRows.legacy, openCreate.legacy],
    next: [...waitForRows.next, openCreate.next],
  },
  probes: createModalProbes,
}

export const instanceUsersCreateInvalid: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-create-invalid',
  actions: {
    legacy: [...waitForRows.legacy, openCreate.legacy, submitEmptyCreate.legacy],
    next: [...waitForRows.next, openCreate.next, submitEmptyCreate.next],
  },
  probes: createInvalidProbes,
}

// Phase 13: a valid form refused by the server (422: the alert, the modal stays open) and a valid form still being sent (the modal is persistent).
const createFilled = {
  legacy: [...waitForRows.legacy, openCreate.legacy, fillCreateForm.legacy, submitCreate.legacy],
  next: [...waitForRows.next, openCreate.next, fillCreateForm.next, submitCreate.next],
}

export const instanceUsersError: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-error',
  handlers: usersHandlers(createRefusedHandler),
  actions: {
    legacy: [...createFilled.legacy, refusedCreateShown.legacy],
    next: [...createFilled.next, refusedCreateShown.next],
  },
  probes: errorProbes,
}

export const instanceUsersCreateSubmitting: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-create-submitting',
  handlers: usersHandlers(createSubmittingHandler),
  actions: createFilled,
  masks: modalLoaderMasks,
  probes: submittingProbes,
}

// Phase 14: the reset password modal of the first row (one password field, the warning icon).
export const instanceUsersResetModal: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-reset-modal',
  actions: {
    legacy: [...waitForRows.legacy, openReset.legacy],
    next: [...waitForRows.next, openReset.next],
  },
  probes: resetModalProbes,
}

// Phase 15: the delete modal (the confirmation unchecked: Delete disabled) and the delete request still running.
export const instanceUsersDeleteModal: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-delete-modal',
  actions: {
    legacy: [...waitForRows.legacy, openDelete.legacy],
    next: [...waitForRows.next, openDelete.next],
  },
  probes: deleteModalProbes,
}

export const instanceUsersDeleteSubmitting: ParityState = {
  ...instanceUsersDefault,
  id: 'instance-users-delete-submitting',
  handlers: usersHandlers(deleteHeldHandler),
  actions: {
    legacy: [...waitForRows.legacy, openDelete.legacy, confirmAndDelete.legacy],
    next: [...waitForRows.next, openDelete.next, confirmAndDelete.next],
  },
  masks: modalLoaderMasks,
  probes: deleteModalProbes,
}

const states: ParityState[] = [
  instanceUsersDefault, instanceUsersPageTwo, instanceUsersHover, instanceUsersRowHover, instanceUsersFocus,
  instanceUsersDisabled, instanceUsersEmpty, instanceUsersSearchEmpty, instanceUsersLoading, instanceUsersCreateLoading,
  instanceUsersCreateModal, instanceUsersCreateInvalid, instanceUsersError, instanceUsersCreateSubmitting,
  instanceUsersResetModal, instanceUsersDeleteModal, instanceUsersDeleteSubmitting,
]

/** States that exist on the desktop layout only (the mobile card has no hover target for the row, and the disabled Delete of `id: 1` is desktop only). */
const desktopOnly = new Set<string>(['instance-users-row-hover', 'instance-users-disabled'])

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(desktopOnly.has(state.id) && testInfo.project.name.endsWith('mobile'), 'desktop layout only')
    await runState(browser, testInfo, state)
  })
}
