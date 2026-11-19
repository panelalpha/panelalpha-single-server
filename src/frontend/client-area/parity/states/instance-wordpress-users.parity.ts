import type { Handler, ParityState, Probe, StateAction } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, tr } from './auth'
import { alertManagerProbe, listSearch, waitFor } from './hosting'
import { ADVANCED_PROJECT_ID, advancedFrameHandlers, advancedFrameInstance } from './instance-advanced-frame'
import { liteShellHome } from './instances'
import { isDesktop, NOW } from './shell'

// S-97 ui-instance-wordpress-users: the WordPress Users page of a project (`/projects/:id/advanced/wordpress-users`), measured on app-lite
// (`target: 'lite'`). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Plan: context/changes/ui-instance-wordpress-users/plan.md ("Phase 6", "Stany parity").
//
// UNVERIFIED: written in a session without the app-lite source or access to the deployed legacy, so every LEGACY locator below (classes of the
// V2 table, the dialog and the mobile card) comes from the M-1 research (`context/archive/2026-10-23-instance-wordpress-users/research.md`),
// not from a run. The first `parity:quick -- --grep instance-wordpress-users` on the server must confirm them (and the fixtures, e.g. no
// `unmatched API requests` in the log) before any delta is read.

const USERS_PATH = `/projects/${ADVANCED_PROJECT_ID}/advanced/wordpress-users`
const USERS_URL = `GET /projects/${ADVANCED_PROJECT_ID}/wordpress/users`
const USER_URL = `/projects/${ADVANCED_PROJECT_ID}/wordpress/users`

/** The roles the table colours (`UserRoleLabel`): all five known ones appear in the list. */
const ROLES = ['administrator', 'editor', 'author', 'contributor', 'subscriber']

/** Ten users, so the first page holds 8 rows and the footer paginates; ids descend by default sort (`id` as text, `WordpressUsers.vue:221-228`). */
function wordpressUser (id: number): Record<string, unknown> {
  return {
    id,
    username: `user${id}`,
    display_name: `User ${id}`,
    email: `user${id}@example.com`,
    role: ROLES[(id - 1) % ROLES.length],
    user_registered: new Date(Date.parse(NOW) - id * 86_400_000 * 9).toISOString(),
  }
}

const USERS = Array.from({ length: 10 }, (_, index) => wordpressUser(index + 1))

/** Handlers of the page: the Details page handlers (shell, project, screenshot) with the user list on top. `overrides` replace any key. */
function usersHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: { ...advancedFrameInstance, privileges: [...(advancedFrameInstance.privileges as string[]), 'wordpress.manage_users'] } } },
    [USERS_URL]: { json: { data: USERS } },
    ...overrides,
  })
}

// ---------------------------------------------------------------------------------------------
// Locators and probes. Next has `wordpress-users-*` test ids; legacy only the classes of its kit (UNVERIFIED, see the header).
// ---------------------------------------------------------------------------------------------

const titleProbe: Probe = {
  key: 'users-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

const addButtonProbe: Probe = {
  key: 'users-add',
  legacy: page => page.locator('.add-new-button'),
  next: page => page.getByTestId('wordpress-users-add'),
}

/** The first data row: a `<tr>` of the desktop table or the mobile card (`.mobile-table-item`). */
const firstRowProbe: Probe = {
  key: 'users-first-row',
  legacy: page => page.locator('.v-data-table tbody tr, .mobile-table-item').first(),
  next: page => page.getByTestId('wordpress-users-table').locator('tbody tr, .mobile-table-item').first(),
}

const tableProbe: Probe = {
  key: 'users-table',
  legacy: page => page.locator('.data-table, .v-data-table').first(),
  next: page => page.getByTestId('wordpress-users-table'),
}

const firstRoleProbe: Probe = {
  key: 'users-first-role',
  when: isDesktop,
  legacy: page => page.locator('.v-data-table tbody tr').first().locator('.v-chip, .role-label').first(),
  next: page => page.getByTestId('wordpress-users-table').locator('tbody tr').first().locator('.v-chip, .role-label').first(),
}

const firstAvatarProbe: Probe = {
  key: 'users-first-avatar',
  when: isDesktop,
  legacy: page => page.locator('.v-data-table tbody tr').first().locator('.v-avatar').first(),
  next: page => page.getByTestId('wordpress-users-table').locator('tbody tr').first().locator('.v-avatar').first(),
}

const emptyProbe: Probe = {
  key: 'users-empty',
  legacy: page => page.locator('.no-data .no-data__title').first(),
  next: page => page.getByTestId('wordpress-users-empty').locator('.no-data__title'),
}

const loadingProbe: Probe = {
  key: 'users-skeleton',
  legacy: page => page.locator('tbody.item .v-skeleton-loader, .mobile-item .v-skeleton-loader').first(),
  next: page => page.getByTestId('wordpress-users-table').locator('tbody.item .v-skeleton-loader, .mobile-item .v-skeleton-loader').first(),
}

const modalProbe: Probe = {
  key: 'users-modal',
  legacy: page => page.locator('.v-dialog--active .v-card').first(),
  next: page => page.getByTestId('wordpress-users-modal'),
}

const waitForList = {
  legacy: [waitFor(page => page.locator('.v-data-table tbody tr, .mobile-table-item'))],
  next: [waitFor(page => page.getByTestId('wordpress-users-table').locator('tbody tr, .mobile-table-item'))],
}

const defaultProbes = [titleProbe, addButtonProbe, tableProbe, firstRowProbe, firstRoleProbe, firstAvatarProbe]

// Phase 6: the list of ten users on the first page (8 rows), light/dark, desktop table (>= 1400 px) and mobile cards.
export const instanceWordpressUsersDefault: ParityState = {
  id: 'instance-wordpress-users-default',
  target: 'lite',
  path: USERS_PATH,
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: usersHandlers(),
  actions: waitForList,
  probes: defaultProbes,
}

// Phase 7: the pointer rests on "Create user" (`button.user.create`).
export const instanceWordpressUsersHover: ParityState = buttonHoverState(instanceWordpressUsersDefault, 'instance-wordpress-users-hover', 'button.user.create', 'lite')

// Phase 8: keyboard focus on "Create user".
export const instanceWordpressUsersFocus: ParityState = buttonFocusState(instanceWordpressUsersDefault, 'instance-wordpress-users-focus', 'button.user.create', 'lite')

/** Opens a row action of the first row: legacy and next differ in the control, so the action is addressed by its tooltip copy key. */
function openRowAction (key: 'edit' | 'reset' | 'delete'): Record<'legacy' | 'next', StateAction[]> {
  const testId = key === 'reset' ? 'wordpress-users-reset-password' : `wordpress-users-${key}`
  return {
    // UNVERIFIED: the legacy icon buttons carry no accessible name; the position in the action row is the order edit, reset, delete.
    legacy: [async page => {
      const row = page.locator('.v-data-table tbody tr, .mobile-table-item').first()
      const index = { edit: 0, reset: 1, delete: 2 }[key]
      await row.locator('.v-btn').nth(index).click()
    }],
    next: [async page => {
      await page.getByTestId('wordpress-users-table').locator(`[data-testid="${testId}"]`).first().click()
    }],
  }
}

function withModal (id: string, key: 'edit' | 'reset' | 'delete' | 'create', extra: StateAction[] = []): ParityState {
  const open = key === 'create'
    ? { legacy: [async (page: Parameters<StateAction>[0]) => {
        await page.locator('.add-new-button').click()
      }], next: [async (page: Parameters<StateAction>[0]) => {
        await page.getByTestId('wordpress-users-add').click()
      }] }
    : openRowAction(key)
  const ready = waitFor(page => page.locator('.v-dialog--active .v-card, [data-testid="wordpress-users-modal"]'))
  return {
    ...instanceWordpressUsersDefault,
    id,
    target: 'lite',
    actions: {
      legacy: [...waitForList.legacy, ...open.legacy, ready, ...extra],
      next: [...waitForList.next, ...open.next, ready, ...extra],
    },
    probes: [modalProbe, ...defaultProbes],
  }
}

export const instanceWordpressUsersModalCreate: ParityState = withModal('instance-wordpress-users-modal-create', 'create')
export const instanceWordpressUsersModalEdit: ParityState = withModal('instance-wordpress-users-modal-edit', 'edit')
export const instanceWordpressUsersModalReset: ParityState = withModal('instance-wordpress-users-modal-reset', 'reset')
export const instanceWordpressUsersModalDelete: ParityState = withModal('instance-wordpress-users-modal-delete', 'delete')

/** The Delete button of the modal stays disabled until the confirm checkbox is ticked: the state measures it as it opens. */
const deleteButton: Probe = {
  key: 'users-delete-confirm',
  legacy: page => page.locator('.v-dialog--active .v-btn', { hasText: tr('button.delete', 'lite') }).first(),
  next: page => page.getByTestId('wordpress-users-modal').getByRole('button', { name: tr('button.delete', 'lite'), exact: true }),
}

// Phase 9: disabled = the Delete button of the modal before the confirmation (`:disabled` until `confirm`).
export const instanceWordpressUsersDisabled: ParityState = {
  ...instanceWordpressUsersModalDelete,
  id: 'instance-wordpress-users-disabled',
  target: 'lite',
  probes: [...instanceWordpressUsersModalDelete.probes, deleteButton],
}

/** Fills the Create form with valid values and submits it. Fields are addressed by the visible label of the legacy form copy. */
const submitCreate: Record<'legacy' | 'next', StateAction[]> = (() => {
  const fill: StateAction = async page => {
    // Labels of the V2 fields are not reliably exposed, so the text inputs are taken by position: username, email, display name, password.
    const dialog = page.locator('.v-dialog--active, [data-testid="wordpress-users-modal"]').first()
    const inputs = dialog.locator('input:not([type=checkbox]):not([readonly])')
    const values = ['newuser', 'newuser@example.com', 'New User', 'Password123!']
    for (const [index, value] of values.entries()) {
      await inputs.nth(index).fill(value)
    }
    // UNVERIFIED: the role select (V2 menu vs V4 list) is opened by clicking it and the first option is taken.
    await dialog.locator('.v-select').first().click()
    // The menu is the last element of the body in both apps; the sidebar and the role chips share the text and the `option` role.
    await page.getByText(tr('form.option.administrator', 'lite'), { exact: true }).last().click()
    await dialog.getByRole('button', { name: tr('button.create', 'lite'), exact: true }).click()
  }
  return { legacy: [fill], next: [fill] }
})()

// Phase 10: error = Create answers 422; the alert shows the API message and the modal closes (`finally`, legacy `UsersActionsMixin.js:60-64`).
export const instanceWordpressUsersError: ParityState = {
  ...withModal('instance-wordpress-users-error', 'create', [...submitCreate.next]),
  id: 'instance-wordpress-users-error',
  target: 'lite',
  handlers: usersHandlers({
    [`POST ${USER_URL}`]: { status: 422, json: { message: 'The given data was invalid.', errors: { email: ['The email has already been taken.'] } } },
  }),
  probes: [alertManagerProbe, ...defaultProbes],
}

// Phase 11: empty = no users: the full-screen message with the plugins illustration.
export const instanceWordpressUsersEmpty: ParityState = {
  ...instanceWordpressUsersDefault,
  id: 'instance-wordpress-users-empty',
  target: 'lite',
  handlers: usersHandlers({ [USERS_URL]: { json: { data: [] } } }),
  actions: {
    legacy: [waitFor(page => page.locator('.no-data'))],
    next: [waitFor(page => page.getByTestId('wordpress-users-empty'))],
  },
  probes: [titleProbe, addButtonProbe, emptyProbe],
}

// Phase 12: loading = the GET is held: the table skeleton.
export const instanceWordpressUsersLoading: ParityState = {
  ...instanceWordpressUsersDefault,
  id: 'instance-wordpress-users-loading',
  target: 'lite',
  handlers: usersHandlers({ [USERS_URL]: 'hold' }),
  actions: {
    legacy: [waitFor(page => page.locator('.v-skeleton-loader'))],
    next: [waitFor(page => page.getByTestId('wordpress-users-table').locator('.v-skeleton-loader'))],
  },
  probes: [titleProbe, addButtonProbe, loadingProbe],
}

// Phase 13: no results = a search term that matches nobody (`listSearch` opens the mobile search and waits for `.no-results-container`).
export const instanceWordpressUsersNoResults: ParityState = {
  ...instanceWordpressUsersDefault,
  id: 'instance-wordpress-users-no-results',
  target: 'lite',
  actions: {
    legacy: [...waitForList.legacy, listSearch('no-such-user')],
    next: [...waitForList.next, listSearch('no-such-user')],
  },
  probes: [titleProbe, addButtonProbe],
}

const states: ParityState[] = [
  instanceWordpressUsersDefault,
  instanceWordpressUsersHover,
  instanceWordpressUsersFocus,
  instanceWordpressUsersDisabled,
  instanceWordpressUsersError,
  instanceWordpressUsersEmpty,
  instanceWordpressUsersLoading,
  instanceWordpressUsersModalCreate,
  instanceWordpressUsersModalEdit,
  instanceWordpressUsersModalReset,
  instanceWordpressUsersModalDelete,
  instanceWordpressUsersNoResults,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
