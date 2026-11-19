import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { clickSizeHeader, DATABASES_PROJECT_HOME, databasesEmptyProbe, databasesNoResultsProbe, databasesProjectAddIconProbe, databasesProjectAddOverlayProbe, databasesProjectAddProbe, databasesProjectFilterProbe, databasesProjectHandlers, databasesProjectInstance, databasesProjectSearchProbe, databasesProjectTabsProbe, databasesProjectTitleProbe, databasesRowDeleteOverlayProbe, databasesRowProbe, databasesSortRowProbe, databasesTableProbe, databasesTabProbe, databaseTooltip, fillFirstInputAndSubmit, hoverUserDatabase, modalProbe, modalSubmitProbe, modalTitleProbe, openPhpmyadminTab, openProjectAddModal, openRowDeleteModal, openRowModal, openSsoModal, openUserDatabaseModal, openUserRowModal, openUsersTab, phpmyadminCardProbe, rowDeleteHoverTarget, searchForNothing, ssoDnsWarningProbe, tickDeleteConfirm, usersEmptyProbe, usersRowProbe, usersTableProbe } from './databases'
import { alertManagerProbe, waitFor } from './hosting'
import { mysqlPrivilegesHandlers, mysqlUsersBody } from './hosting-databases'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PRIVILEGES, ADVANCED_PROJECT_ID, advancedActiveItemProbe } from './instance-advanced-frame'
import { isDesktop, NOW } from './shell'

// S-107 ui-databases: the Databases page in the Advanced tab of a project (`/projects/:id/advanced/databases`), measured on app-lite
// (`target: 'lite'`, M-2 default). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as
// text. Probes, handlers and the project header: `databases.ts`; the frame: `instance-advanced-frame.ts`. The My server frame has its own
// states (`hosting-databases.parity.ts`). Plan: context/changes/ui-databases/plan.md ("Phase 7").

/** Ready when the Advanced sidebar and the first database row are both on the page. Each app has its own hook for the sidebar. */
const waitForDatabases = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(databasesRowProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(databasesRowProbe.next),
  ],
}

/** The probes of the default state, the readiness anchor first (the title is the first probe). */
const databasesDefaultProbes: Probe[] = [
  databasesProjectTitleProbe,
  databasesProjectAddProbe,
  databasesProjectAddIconProbe,
  databasesProjectSearchProbe,
  databasesProjectFilterProbe,
  databasesProjectTabsProbe,
  databasesTabProbe(1),
  databasesTabProbe(2),
  databasesTabProbe(3),
  databasesTableProbe,
  databasesSortRowProbe,
  databasesRowProbe,
  advancedActiveItemProbe,
]

// Phase 7: three databases and two users on the single-server project frame (`DATABASES_PROJECT_HOME`: the lite `/home` without `admin`).
export const instanceAdvancedDatabasesDefault: ParityState = {
  id: 'databases-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/databases`,
  signedIn: true,
  clock: NOW,
  home: DATABASES_PROJECT_HOME,
  handlers: databasesProjectHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForDatabases,
  probes: databasesDefaultProbes,
}

type Target = (page: Page) => Locator

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final), the pattern of `hovered` in
 * `instance-advanced-ftp.parity.ts` (not exported, so it is written here). A target the variant does not render is skipped in that variant.
 * The pointer stays where the action left it and is asserted on the element after the capture.
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

// Phase 8: hover of the header's Add button and of the Delete icon of the first row (desktop `.actions-row`-less cell; on mobile the icon is
// in the card, where a pointer rests on it like on the default state).
export const instanceAdvancedDatabasesHover: ParityState = {
  ...hovered(instanceAdvancedDatabasesDefault, { legacy: databasesProjectAddProbe.legacy, next: databasesProjectAddProbe.next }, [databasesProjectAddOverlayProbe]),
  id: 'databases-hover',
}

export const instanceAdvancedDatabasesRowHover: ParityState = {
  ...hovered(instanceAdvancedDatabasesDefault, { legacy: rowDeleteHoverTarget, next: rowDeleteHoverTarget }, [databasesRowDeleteOverlayProbe]),
  id: 'databases-row-hover',
}

// Phase 9: keyboard focus of the header's Add button, as `buttonFocusState` in auth.ts (Shift, `focus()`, `:focus-visible` asserted; V4 ring
// hidden in next) but located by the test id / class of the other probes: on mobile the button is icon-only, so it has no accessible name.
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
  const ring = await databasesProjectAddProbe.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
  expect(ring, 'V4 focus ring hidden').toBe('0')
}

export const instanceAdvancedDatabasesFocus: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...instanceAdvancedDatabasesDefault.actions.legacy, focusAdd(databasesProjectAddProbe.legacy)],
    next: [...instanceAdvancedDatabasesDefault.actions.next, focusAdd(databasesProjectAddProbe.next)],
  },
  probes: [...instanceAdvancedDatabasesDefault.probes, databasesProjectAddOverlayProbe],
  afterCapture: {
    legacy: [...(instanceAdvancedDatabasesDefault.afterCapture?.legacy ?? [])],
    next: [...(instanceAdvancedDatabasesDefault.afterCapture?.next ?? []), noFocusRing],
  },
}

// Phase 10: the Delete modal before its `confirm` checkbox is ticked (`confirm-required`): the submit button is disabled.
export const instanceAdvancedDatabasesDisabled: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-disabled',
  actions: {
    legacy: [...waitForDatabases.legacy, openRowDeleteModal],
    next: [...waitForDatabases.next, openRowDeleteModal],
  },
  probes: [modalProbe, modalTitleProbe, modalSubmitProbe],
}

// Phase 16: the Delete modal after the `confirm` checkbox is ticked (`confirm-required` lifted): the submit is enabled and red. The state
// ends before the submit is pressed, so no DELETE request is sent.
export const instanceAdvancedDatabasesModalDeleteDb: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-delete-db',
  actions: {
    legacy: [...waitForDatabases.legacy, openRowDeleteModal, tickDeleteConfirm],
    next: [...waitForDatabases.next, openRowDeleteModal, tickDeleteConfirm],
  },
  probes: [modalProbe, modalTitleProbe, modalSubmitProbe],
}

// Phase 11: the databases request fails (500 `Server Error`): the shell's alert and an empty table. The readiness anchor is the header
// title (the table has no row), and the alert is awaited last, since it renders after the failed request.
const waitForDatabasesError = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(databasesProjectTitleProbe.legacy),
    waitFor(alertManagerProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(databasesProjectTitleProbe.next),
    waitFor(alertManagerProbe.next),
  ],
}

export const instanceAdvancedDatabasesError: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-error',
  handlers: databasesProjectHandlers({ 'GET /server-accounts/1/mysql/databases': { status: 500, json: { message: 'Server Error' } } }),
  actions: waitForDatabasesError,
  probes: [databasesProjectTitleProbe, databasesTableProbe, alertManagerProbe, advancedActiveItemProbe],
}

// Phase 12: no databases (`data: []`): the table shows `TableFullScreenMessage` with the illustration and the Add button, and the header has no
// search and no Add (`v-show` on the filter column in both apps). The readiness anchor is the empty message (there is no row to wait for).
const waitForDatabasesEmpty = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(databasesEmptyProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(databasesEmptyProbe.next),
  ],
}

export const instanceAdvancedDatabasesEmpty: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-empty',
  handlers: databasesProjectHandlers({ 'GET /server-accounts/1/mysql/databases': { json: { data: [], meta: { actions: { rename: true } } } } }),
  actions: waitForDatabasesEmpty,
  probes: [databasesProjectTitleProbe, databasesProjectFilterProbe, databasesProjectTabsProbe, databasesTableProbe, databasesEmptyProbe, advancedActiveItemProbe],
}

// Phase 12: the Users tab without users: `TableFullScreenMessage` of the users list. Opened with `openUsersTab(true)`, which waits for it.
export const instanceAdvancedDatabasesUsersEmpty: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-users-empty',
  handlers: databasesProjectHandlers({ 'GET /server-accounts/1/mysql/users': { json: mysqlUsersBody([]) } }),
  actions: {
    legacy: [...waitForDatabases.legacy, openUsersTab(true)],
    next: [...waitForDatabases.next, openUsersTab(true)],
  },
  probes: [databasesProjectTitleProbe, databasesProjectTabsProbe, databasesTabProbe(2), usersEmptyProbe, advancedActiveItemProbe],
}

// Phase 12: a search term without matches: the table shows `NoResults`, the header keeps its search and Add. `searchForNothing` types the term
// and waits for the message (the project header holds the same search field).
export const instanceAdvancedDatabasesNoResults: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-no-results',
  actions: {
    legacy: [...waitForDatabases.legacy, searchForNothing],
    next: [...waitForDatabases.next, searchForNothing],
  },
  probes: [databasesProjectTitleProbe, databasesProjectAddProbe, databasesProjectSearchProbe, databasesTableProbe, databasesNoResultsProbe, advancedActiveItemProbe],
}

// Phase 13: both lists hang (`'hold'`): the table keeps its loading skeleton and the header's Add its spinner (`:loading`), pressed or not. The
// skeleton bones are masked; the readiness anchor is the header title and the skeleton is awaited last (it renders once the request started).
const databasesSkeletonMasks = {
  legacy: [(page: Page) => page.locator('.v-main .data-table .v-skeleton-loader'), (page: Page) => databasesProjectAddProbe.legacy(page).locator('.v-progress-circular')],
  next: [(page: Page) => page.locator('.v-main .data-table .v-skeleton-loader'), (page: Page) => databasesProjectAddProbe.next(page).locator('.v-progress-circular')],
}

const waitForDatabasesLoading = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(databasesProjectTitleProbe.legacy),
    waitFor(page => page.locator('.v-main .data-table .v-skeleton-loader').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(databasesProjectTitleProbe.next),
    waitFor(page => page.locator('.v-main .data-table .v-skeleton-loader').first()),
  ],
}

export const instanceAdvancedDatabasesLoading: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-loading',
  handlers: databasesProjectHandlers({ 'GET /server-accounts/1/mysql/databases': 'hold', 'GET /server-accounts/1/mysql/users': 'hold' }),
  actions: waitForDatabasesLoading,
  masks: databasesSkeletonMasks,
  probes: [databasesProjectTitleProbe, databasesProjectAddProbe, databasesProjectTabsProbe, databasesTableProbe, advancedActiveItemProbe],
}

// Phase 14: the Users tab (`privileges_supported`, four actions per row, the databases of each user) and the databases table sorted by size.
export const instanceAdvancedDatabasesUsers: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-users',
  actions: {
    legacy: [...waitForDatabases.legacy, openUsersTab()],
    next: [...waitForDatabases.next, openUsersTab()],
  },
  probes: [databasesProjectTitleProbe, databasesProjectTabsProbe, databasesTabProbe(2), usersTableProbe, usersRowProbe, advancedActiveItemProbe],
}

export const instanceAdvancedDatabasesSorted: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-sorted',
  actions: {
    legacy: [...waitForDatabases.legacy, clickSizeHeader],
    next: [...waitForDatabases.next, clickSizeHeader],
  },
  probes: [databasesProjectTitleProbe, databasesProjectSearchProbe, databasesTableProbe, databasesSortRowProbe, databasesRowProbe, advancedActiveItemProbe],
}

// Phase 15: the PHPMyAdmin tab (card, `AlertSm`, `outlined-button`), and a project with only `hosting.phpmyadmin_sso` (one tab, no filters, no Add).
export const instanceAdvancedDatabasesPhpmyadmin: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-phpmyadmin',
  actions: {
    legacy: [...waitForDatabases.legacy, openPhpmyadminTab],
    next: [...waitForDatabases.next, openPhpmyadminTab],
  },
  probes: [databasesProjectTitleProbe, databasesProjectTabsProbe, databasesTabProbe(3), phpmyadminCardProbe, advancedActiveItemProbe],
}

const waitForPhpmyadminOnly = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(databasesProjectTabsProbe.legacy),
    waitFor(phpmyadminCardProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(databasesProjectTabsProbe.next),
    waitFor(phpmyadminCardProbe.next),
  ],
}

export const instanceAdvancedDatabasesSsoOnly: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-sso-only',
  handlers: databasesProjectHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: databasesProjectInstance(ADVANCED_PRIVILEGES.filter(privilege => privilege !== 'hosting.manage_mysql')),
  }),
  actions: waitForPhpmyadminOnly,
  probes: [databasesProjectTitleProbe, databasesProjectFilterProbe, databasesProjectTabsProbe, databasesTabProbe(1), phpmyadminCardProbe, advancedActiveItemProbe],
}

// Phase 16: the database modals (Add and Rename open from the header and the row; Delete is `databases-disabled` and `databases-modal-delete-db`)
// and the Add form answered with 422 (the name is taken). The 422 is shown in the shell's alert, so it is awaited last.
export const instanceAdvancedDatabasesModalAddDb: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-add-db',
  actions: {
    legacy: [...waitForDatabases.legacy, openProjectAddModal(false)],
    next: [...waitForDatabases.next, openProjectAddModal(true)],
  },
  probes: [modalProbe, modalTitleProbe, modalSubmitProbe],
}

export const instanceAdvancedDatabasesModalRenameDb: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-rename-db',
  actions: {
    legacy: [...waitForDatabases.legacy, openRowModal('first')],
    next: [...waitForDatabases.next, openRowModal('first')],
  },
  probes: [modalProbe, modalTitleProbe, modalSubmitProbe],
}

export const instanceAdvancedDatabasesAddError: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-add-error',
  handlers: databasesProjectHandlers({
    'POST /server-accounts/1/mysql/databases': { status: 422, json: { message: 'The given data was invalid.', errors: { name: ['The database name has already been taken.'] } } },
  }),
  actions: {
    legacy: [...waitForDatabases.legacy, openProjectAddModal(false), fillFirstInputAndSubmit(false), waitFor(alertManagerProbe.legacy)],
    next: [...waitForDatabases.next, openProjectAddModal(true), fillFirstInputAndSubmit(true), waitFor(alertManagerProbe.next)],
  },
  probes: [modalProbe, modalTitleProbe, modalSubmitProbe, alertManagerProbe],
}

// Phase 17: the user modals, opened from the Users tab: Add (header Add), Edit (row action 1) and Access details (row action 2).
export const instanceAdvancedDatabasesModalAddUser: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-add-user',
  actions: {
    legacy: [...waitForDatabases.legacy, openUsersTab(), openProjectAddModal(false)],
    next: [...waitForDatabases.next, openUsersTab(), openProjectAddModal(true)],
  },
  probes: [modalProbe, modalTitleProbe, modalSubmitProbe],
}

export const instanceAdvancedDatabasesModalEditUser: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-edit-user',
  actions: {
    legacy: [...waitForDatabases.legacy, openUsersTab(), openUserRowModal(1)],
    next: [...waitForDatabases.next, openUsersTab(), openUserRowModal(1)],
  },
  // Legacy opens no modal on a phone for this action (`{}` row), so the modal exists on desktop only.
  probes: [usersTableProbe, { ...modalProbe, when: isDesktop }, { ...modalTitleProbe, when: isDesktop }, { ...modalSubmitProbe, when: isDesktop }],
}

export const instanceAdvancedDatabasesModalInfo: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-info',
  actions: {
    legacy: [...waitForDatabases.legacy, openUsersTab(), openUserRowModal(2)],
    next: [...waitForDatabases.next, openUsersTab(), openUserRowModal(2)],
  },
  probes: [modalProbe, modalTitleProbe, modalSubmitProbe],
}

// Phase 18: the privileges modals of a user (row action 0) and of one of its databases, and the tooltip of that database button. The privileges
// answers are `example_admin`'s, as in the My server states.
const privilegesHandlers = (answers: Record<string, string[]>) => databasesProjectHandlers(mysqlPrivilegesHandlers(1, 'example_admin', answers))

export const instanceAdvancedDatabasesModalUserPrivileges: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-user-privileges',
  handlers: privilegesHandlers({ example_shop: ['SELECT', 'INSERT'], example_blog: ['SELECT'] }),
  actions: {
    legacy: [...waitForDatabases.legacy, openUsersTab(), openUserRowModal(0)],
    next: [...waitForDatabases.next, openUsersTab(), openUserRowModal(0)],
  },
  // Legacy opens no modal on a phone for this action (`{}` row), so the modal exists on desktop only.
  probes: [usersTableProbe, { ...modalProbe, when: isDesktop }, { ...modalTitleProbe, when: isDesktop }, { ...modalSubmitProbe, when: isDesktop }],
}

export const instanceAdvancedDatabasesModalDbPrivileges: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-modal-db-privileges',
  handlers: privilegesHandlers({ example_shop: ['SELECT', 'INSERT'] }),
  actions: {
    legacy: [...waitForDatabases.legacy, openUserDatabaseModal('legacy')],
    next: [...waitForDatabases.next, openUserDatabaseModal('next')],
  },
  // The mobile card has no database buttons, so the modal exists on desktop only.
  probes: [usersTableProbe, { ...modalProbe, when: isDesktop }, { ...modalTitleProbe, when: isDesktop }, { ...modalSubmitProbe, when: isDesktop }],
}

export const instanceAdvancedDatabasesUsersPrivilegesTooltip: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-users-privileges-tooltip',
  // The pointer stays on the database button for the screenshot.
  pointer: 'keep',
  handlers: privilegesHandlers({ example_shop: ['ALL PRIVILEGES'] }),
  actions: {
    legacy: [...waitForDatabases.legacy, hoverUserDatabase('legacy')],
    next: [...waitForDatabases.next, hoverUserDatabase('next')],
  },
  probes: [
    usersTableProbe,
    usersRowProbe,
    { key: 'users-privileges-tooltip', legacy: databaseTooltip.legacy, next: databaseTooltip.next, internal: true, when: isDesktop },
  ],
}

// Phase 19: "Log In to PHPMyAdmin" with a host that has no DNS record: the SSO modal opens with the DNS warning (the preview site provider is on).
export const instanceAdvancedDatabasesSsoModal: ParityState = {
  ...instanceAdvancedDatabasesDefault,
  id: 'databases-sso-modal',
  home: {
    ...DATABASES_PROJECT_HOME,
    app: { ...(DATABASES_PROJECT_HOME as { app: Record<string, unknown> }).app, integrations: { preview_site_provider_enabled: true } },
  },
  // dns.google answers "no record" for the SSO host (`Status: 3`), so the modal shows the DNS warning.
  external: { 'dns.google': { json: { Status: 3 } } },
  actions: {
    legacy: [...waitForDatabases.legacy, openSsoModal],
    next: [...waitForDatabases.next, openSsoModal],
  },
  probes: [modalProbe, modalTitleProbe, ssoDnsWarningProbe],
}

const states: ParityState[] = [
  instanceAdvancedDatabasesDefault,
  instanceAdvancedDatabasesHover,
  instanceAdvancedDatabasesRowHover,
  instanceAdvancedDatabasesFocus,
  instanceAdvancedDatabasesDisabled,
  instanceAdvancedDatabasesError,
  instanceAdvancedDatabasesEmpty,
  instanceAdvancedDatabasesUsersEmpty,
  instanceAdvancedDatabasesNoResults,
  instanceAdvancedDatabasesLoading,
  instanceAdvancedDatabasesUsers,
  instanceAdvancedDatabasesSorted,
  instanceAdvancedDatabasesPhpmyadmin,
  instanceAdvancedDatabasesSsoOnly,
  instanceAdvancedDatabasesModalAddDb,
  instanceAdvancedDatabasesModalRenameDb,
  instanceAdvancedDatabasesModalDeleteDb,
  instanceAdvancedDatabasesAddError,
  instanceAdvancedDatabasesModalAddUser,
  instanceAdvancedDatabasesModalEditUser,
  instanceAdvancedDatabasesModalInfo,
  instanceAdvancedDatabasesModalUserPrivileges,
  instanceAdvancedDatabasesModalDbPrivileges,
  instanceAdvancedDatabasesUsersPrivilegesTooltip,
  instanceAdvancedDatabasesSsoModal,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
