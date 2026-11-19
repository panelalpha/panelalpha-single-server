import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { clickSizeHeader, databasesEmptyProbe, databasesFilterProbe, databasesNoResultsProbe, databasesSelectorProbe, databasesTableProbe, databasesTabProbe, databasesTabsProbe, databaseTooltip, hoverUserDatabase, modalProbe, openAddModal, openPhpmyadminTab, openRowModal, openSsoModal, openUserDatabaseModal, openUserRowModal, openUsersTab, phpmyadminCardProbe, searchForNothing, ssoDnsWarningProbe, tableProbes, usersEmptyProbe, usersRowProbe, usersTableProbe } from './databases'
import { alertManagerProbe, hostingService, hostingState } from './hosting'
import { mysqlAccount, mysqlHandlers, mysqlPrivilegesHandlers, mysqlUsersBody, secondMysqlAccount } from './hosting-databases'
import { isDesktop } from './shell'

// S-35 hosting-databases (S-107 ui-databases: measured on app-lite, `target: 'lite'`, My server tab): `/hosting/databases` with the Databases tab
// (phase 1, states 1-5 and 9-11), its add, rename and delete modals (phase 2, states 12-14), and the Users tab with its add, edit and access
// details modals (phase 3, states 6, 7 and 15-17). The privileges states (phase 4, 18, 19 and 21) open the privileges modals and the database
// tooltip. The PHPMyAdmin tab and its SSO modal are phase 5 (states 8 and 20). Builders and fixtures: `hosting-databases.ts`; probes and
// actions shared with the project frame: `databases.ts`. Each state id is a literal `id: '…',` line, which `registeredStates` in
// report/write-report.ts reads as text. Plan: context/changes/ui-databases/plan.md ("Phase 7").

// ---------------------------------------------------------------------------------------------
// States (phase 1)
// ---------------------------------------------------------------------------------------------

export const hostingDatabases: ParityState = {
  id: 'hosting-databases',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    probes: [...tableProbes, databasesTabProbe(1), databasesTabProbe(2), databasesTabProbe(3)],
  }),
}

export const hostingDatabasesLoading: ParityState = {
  id: 'hosting-databases-loading',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11, { databases: 'hold', users: 'hold' }),
    probes: [...tableProbes, databasesTabProbe(1)],
  }),
}

export const hostingDatabasesEmpty: ParityState = {
  id: 'hosting-databases-empty',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesEmptyProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11, { databases: { json: { data: [], meta: { actions: { rename: true } } } } }),
    probes: [...tableProbes, databasesEmptyProbe],
  }),
}

export const hostingDatabasesSorted: ParityState = {
  id: 'hosting-databases-sorted',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [clickSizeHeader],
    next: [clickSizeHeader],
    probes: [...tableProbes],
  }),
}

export const hostingDatabasesNoResults: ParityState = {
  id: 'hosting-databases-no-results',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [searchForNothing],
    next: [searchForNothing],
    probes: [...tableProbes, databasesNoResultsProbe],
  }),
}

export const hostingDatabasesAccounts: ParityState = {
  id: 'hosting-databases-accounts',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount(), secondMysqlAccount()] })],
    handlers: { ...mysqlHandlers(11), ...mysqlHandlers(12) },
    probes: [...tableProbes, databasesSelectorProbe],
  }),
}

export const hostingDatabasesDiagnostic: ParityState = {
  id: 'hosting-databases-diagnostic',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    services: [hostingService({ server_accounts: [mysqlAccount({ diagnostic_mode: true })] })],
    handlers: mysqlHandlers(11),
    probes: [alertManagerProbe, databasesTabsProbe, databasesFilterProbe],
  }),
}

export const hostingDatabasesSsoOnly: ParityState = {
  id: 'hosting-databases-sso-only',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTabsProbe,
    services: [hostingService({ privileges: ['hosting.phpmyadmin_sso'], server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    probes: [databasesTabsProbe, databasesTabProbe(1)],
  }),
}

// ---------------------------------------------------------------------------------------------
// States (phase 2): the database modals
// ---------------------------------------------------------------------------------------------

export const hostingDatabasesModalAddDb: ParityState = {
  id: 'hosting-databases-modal-add-db',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openAddModal],
    next: [openAddModal],
    probes: [modalProbe],
  }),
}

export const hostingDatabasesModalRenameDb: ParityState = {
  id: 'hosting-databases-modal-rename-db',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openRowModal('first')],
    next: [openRowModal('first')],
    probes: [modalProbe],
  }),
}

export const hostingDatabasesModalDeleteDb: ParityState = {
  id: 'hosting-databases-modal-delete-db',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openRowModal('last')],
    next: [openRowModal('last')],
    probes: [modalProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// States (phase 3): the Users tab and the user modals
// ---------------------------------------------------------------------------------------------

export const hostingDatabasesUsers: ParityState = {
  id: 'hosting-databases-users',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openUsersTab()],
    next: [openUsersTab()],
    probes: [databasesTabsProbe, databasesTabProbe(2), usersTableProbe, usersRowProbe],
  }),
}

export const hostingDatabasesUsersEmpty: ParityState = {
  id: 'hosting-databases-users-empty',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11, { users: { json: mysqlUsersBody([]) } }),
    legacy: [openUsersTab(true)],
    next: [openUsersTab(true)],
    probes: [databasesTabsProbe, databasesTabProbe(2), usersEmptyProbe],
  }),
}

export const hostingDatabasesModalAddUser: ParityState = {
  id: 'hosting-databases-modal-add-user',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openUsersTab(), openAddModal],
    next: [openUsersTab(), openAddModal],
    probes: [modalProbe],
  }),
}

export const hostingDatabasesModalEditUser: ParityState = {
  id: 'hosting-databases-modal-edit-user',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openUsersTab(), openUserRowModal(1)],
    next: [openUsersTab(), openUserRowModal(1)],
    // Legacy opens no modal on a phone for this action (`{}` row), so the modal exists on desktop only.
    probes: [usersTableProbe, { ...modalProbe, when: isDesktop }],
  }),
}

export const hostingDatabasesModalInfo: ParityState = {
  id: 'hosting-databases-modal-info',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openUsersTab(), openUserRowModal(2)],
    next: [openUsersTab(), openUserRowModal(2)],
    probes: [modalProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// States (phase 4): the privileges of the users
// ---------------------------------------------------------------------------------------------

export const hostingDatabasesModalUserPrivileges: ParityState = {
  id: 'hosting-databases-modal-user-privileges',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: {
      ...mysqlHandlers(11),
      ...mysqlPrivilegesHandlers(11, 'example_admin', { example_shop: ['SELECT', 'INSERT'], example_blog: ['SELECT'] }),
    },
    legacy: [openUsersTab(), openUserRowModal(0)],
    next: [openUsersTab(), openUserRowModal(0)],
    // Legacy opens no modal on a phone for this action (`{}` row), so the modal exists on desktop only.
    probes: [usersTableProbe, { ...modalProbe, when: isDesktop }],
  }),
}

export const hostingDatabasesModalDbPrivileges: ParityState = {
  id: 'hosting-databases-modal-db-privileges',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: {
      ...mysqlHandlers(11),
      ...mysqlPrivilegesHandlers(11, 'example_admin', { example_shop: ['SELECT', 'INSERT'] }),
    },
    legacy: [openUserDatabaseModal('legacy')],
    next: [openUserDatabaseModal('next')],
    // The mobile card has no database buttons, so the modal exists on desktop only.
    probes: [usersTableProbe, { ...modalProbe, when: isDesktop }],
  }),
}

export const hostingDatabasesUsersPrivilegesTooltip: ParityState = {
  id: 'hosting-databases-users-privileges-tooltip',
  // The pointer stays on the database button for the screenshot.
  pointer: 'keep',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: {
      ...mysqlHandlers(11),
      ...mysqlPrivilegesHandlers(11, 'example_admin', { example_shop: ['ALL PRIVILEGES'] }),
    },
    legacy: [hoverUserDatabase('legacy')],
    next: [hoverUserDatabase('next')],
    probes: [
      usersTableProbe,
      usersRowProbe,
      { key: 'users-privileges-tooltip', legacy: databaseTooltip.legacy, next: databaseTooltip.next, internal: true, when: isDesktop },
    ],
  }),
}

// ---------------------------------------------------------------------------------------------
// States (phase 5): the PHPMyAdmin tab and its SSO modal
// ---------------------------------------------------------------------------------------------

export const hostingDatabasesPhpmyadmin: ParityState = {
  id: 'hosting-databases-phpmyadmin',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    legacy: [openPhpmyadminTab],
    next: [openPhpmyadminTab],
    probes: [databasesTabProbe(3), phpmyadminCardProbe],
  }),
}

export const hostingDatabasesSsoModal: ParityState = {
  id: 'hosting-databases-sso-modal',
  ...hostingState({
    lite: true,
    path: '/hosting/databases',
    ready: databasesTableProbe,
    services: [hostingService({ server_accounts: [mysqlAccount()] })],
    handlers: mysqlHandlers(11),
    // The preview site provider is on (`home.json` has it too; set here so the state states its own condition).
    home: { app: { integrations: { preview_site_provider_enabled: true } } },
    // dns.google answers "no record" for the SSO host (`Status: 3`), so the modal shows the DNS warning.
    external: { 'dns.google': { json: { Status: 3 } } },
    legacy: [openSsoModal],
    next: [openSsoModal],
    probes: [modalProbe, ssoDnsWarningProbe],
  }),
}

const states: ParityState[] = [
  hostingDatabases,
  hostingDatabasesLoading,
  hostingDatabasesEmpty,
  hostingDatabasesSorted,
  hostingDatabasesNoResults,
  hostingDatabasesAccounts,
  hostingDatabasesDiagnostic,
  hostingDatabasesSsoOnly,
  hostingDatabasesModalAddDb,
  hostingDatabasesModalRenameDb,
  hostingDatabasesModalDeleteDb,
  hostingDatabasesUsers,
  hostingDatabasesUsersEmpty,
  hostingDatabasesModalAddUser,
  hostingDatabasesModalEditUser,
  hostingDatabasesModalInfo,
  hostingDatabasesModalUserPrivileges,
  hostingDatabasesModalDbPrivileges,
  hostingDatabasesUsersPrivilegesTooltip,
  hostingDatabasesPhpmyadmin,
  hostingDatabasesSsoModal,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // explicit lite (the default target): the same target as the project frame states in `instance-advanced-databases.parity.ts`
    await runState(browser, testInfo, { ...state, target: 'lite' })
  })
}
