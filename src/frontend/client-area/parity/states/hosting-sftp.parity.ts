import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { accountSelectorSteps, alertManagerProbe, hostingService, hostingState, listSearch, serverAccount, sftpAccountsBody, sftpServerInfoBody } from './hosting'
import { addModalFieldProbes, clickSftpActionsItem, clickSftpAdd, clickSftpRowAction, openActionsMenu, pickSshKey, sftpAccountMenuProbe, sftpAccounts, sftpAccountSelectorProbe, sftpActionsChevronProbe, sftpActionsItemProbe, sftpActionsLabelProbe, sftpActionsMenuProbe, sftpActionsProbe, sftpAddProbe, sftpEmptyAddProbe, sftpEmptyProbe, sftpFilterColProbe, sftpFooterProbe, sftpListPath, sftpManyAccounts, sftpModalFieldProbe, sftpModalInfoItemProbe, sftpModalMessageProbe, sftpModalProbe, sftpModalSubmitProbe, sftpModalTitleProbe, sftpNoResultsProbe, sftpRowActionsProbe, sftpRowProbe, sftpRowUserProbe, sftpSearchProbe, sftpTableProbe, sftpTitleColProbe, sftpTitleProbe } from './sftp'

// S-34 hosting-sftp (S-106 ui-sftp: measured on app-lite, `target: 'lite'`, My server tab): `/hosting/sftp`. Builder and fixtures:
// `hosting.ts` (`sftpAccount`, `sftpAccountsBody`, `sftpServerInfoBody`); probes, helpers and the project frame: `sftp.ts`. Each state id is a literal `id: '…',` line, which
// `registeredStates` in report/write-report.ts reads as text. Plan: context/changes/hosting-sftp/plan.md ("Stany parity").
// Phase 1 covers the frame, the list, the empty and the loading states; Phase 2 the other list states; Phase 3 the account modals
// (states 12–16); Phase 4 the server modals (states 17–18: Disconnect all, Manage access). A probe for an element that a variant does not render takes `when`.
// The probes reuse the shared table's DOM (`HostingFtpTable`), so the legacy selectors are the FTP ones; the testids are `sftp-*`.

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** A PanelAlpha account: the backend keeps `manage_sftp` only on PanelAlpha and WP Cloud (the default `cpanel` account drops it). */
const sftpService = hostingService({
  server_accounts: [serverAccount({ server_type: 'panelalpha', username: 'example' })],
})

/** Two PanelAlpha accounts: the selector shows, the first one stays active. */
const twoAccountsService = hostingService({
  server_accounts: [
    serverAccount({ server_type: 'panelalpha', username: 'example' }),
    serverAccount({ id: 12, domain: 'second.example.com', server_type: 'panelalpha', username: 'second' }),
  ],
})

/** The account in diagnostic mode: the page shows the alert and makes no list request. */
const diagnosticService = hostingService({
  server_accounts: [serverAccount({ server_type: 'panelalpha', username: 'example', diagnostic_mode: true })],
})

/** The SSH variant: a WP Cloud account and a plan that lets the user enable SSH, so the page is titled and labelled SSH. */
const sshBase = hostingService({
  server_accounts: [serverAccount({
    server_type: 'wp-cloud',
    username: 'example',
    details: { homedir: '/home/example', mysql_db_prefix: 'example_', remote_id: 'example-wpc' },
  })],
})
const sshService = { ...sshBase, plan_settings: { ...sshBase.plan_settings, allow_user_enable_ssh_access: true } }

const accountSelector = accountSelectorSteps('sftp-account-selector')

/** Handlers every SFTP state shares; a state overrides the list. */
const base = {
  path: '/hosting/sftp',
  lite: true,
  ready: sftpTitleProbe,
  services: [sftpService],
  handlers: {
    [sftpListPath]: { json: sftpAccountsBody({ items: sftpAccounts }) },
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 1: frame, list, empty and loading
// ---------------------------------------------------------------------------------------------

export const hostingSftpList: ParityState = {
  id: 'hosting-sftp-list',
  ...hostingState({
    ...base,
    probes: [sftpTitleProbe, sftpTitleColProbe, sftpFilterColProbe, sftpAddProbe, sftpSearchProbe, sftpActionsProbe, sftpActionsLabelProbe, sftpActionsChevronProbe, sftpTableProbe, sftpRowProbe, sftpRowUserProbe, sftpRowActionsProbe],
  }),
}

export const hostingSftpEmpty: ParityState = {
  id: 'hosting-sftp-empty',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [sftpListPath]: { json: sftpAccountsBody({ items: [] }) },
    },
    probes: [sftpTitleProbe, sftpTableProbe, sftpEmptyProbe, sftpEmptyAddProbe],
  }),
}

export const hostingSftpLoading: ParityState = {
  id: 'hosting-sftp-loading',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [sftpListPath]: 'hold',
    },
    probes: [sftpTitleProbe, sftpTableProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 2: the other list states (no edit, no results, paged, two accounts, diagnostic, error, Actions menu, SSH)
// ---------------------------------------------------------------------------------------------

export const hostingSftpListNoEdit: ParityState = {
  id: 'hosting-sftp-list-no-edit',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [sftpListPath]: { json: sftpAccountsBody({ items: sftpAccounts, actions: [] }) },
    },
    probes: [sftpTitleProbe, sftpAddProbe, sftpSearchProbe, sftpTableProbe, sftpRowProbe, sftpRowUserProbe, sftpRowActionsProbe],
  }),
}

export const hostingSftpNoResults: ParityState = {
  id: 'hosting-sftp-no-results',
  ...hostingState({
    ...base,
    legacy: [listSearch('no-such-account')],
    next: [listSearch('no-such-account')],
    probes: [sftpTitleProbe, sftpAddProbe, sftpSearchProbe, sftpTableProbe, sftpNoResultsProbe],
  }),
}

export const hostingSftpPaged: ParityState = {
  id: 'hosting-sftp-paged',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [sftpListPath]: { json: sftpAccountsBody({ items: sftpManyAccounts }) },
    },
    probes: [sftpTitleProbe, sftpAddProbe, sftpSearchProbe, sftpTableProbe, sftpRowProbe, sftpRowUserProbe, sftpFooterProbe],
  }),
}

export const hostingSftpTwoAccounts: ParityState = {
  id: 'hosting-sftp-two-accounts',
  ...hostingState({
    ...base,
    services: [twoAccountsService],
    pointer: 'keep',
    legacy: [accountSelector.legacy],
    next: [accountSelector.next],
    probes: [sftpTitleProbe, sftpAddProbe, sftpSearchProbe, sftpTableProbe, sftpRowProbe, sftpAccountSelectorProbe, sftpAccountMenuProbe],
  }),
}

export const hostingSftpDiagnostic: ParityState = {
  id: 'hosting-sftp-diagnostic',
  ...hostingState({
    ...base,
    services: [diagnosticService],
    probes: [sftpTitleProbe, alertManagerProbe],
  }),
}

export const hostingSftpError: ParityState = {
  id: 'hosting-sftp-error',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [sftpListPath]: { status: 500, json: { message: 'Server Error' } },
    },
    ready: sftpEmptyProbe,
    probes: [sftpTitleProbe, sftpTableProbe, sftpEmptyProbe, sftpEmptyAddProbe, alertManagerProbe],
  }),
}

/** A plan without SSH access: the menu has one item, Disconnect all. */
export const hostingSftpActionsMenu: ParityState = {
  id: 'hosting-sftp-actions-menu',
  ...hostingState({
    ...base,
    legacy: [openActionsMenu(false)],
    next: [openActionsMenu(true)],
    probes: [sftpTitleProbe, sftpAddProbe, sftpActionsProbe, sftpActionsMenuProbe, sftpActionsItemProbe(0)],
  }),
}

/** The SSH variant: the title and Add say SSH, and the menu has two items. */
export const hostingSftpSsh: ParityState = {
  id: 'hosting-sftp-ssh',
  ...hostingState({
    ...base,
    services: [sshService],
    handlers: {
      ...base.handlers,
      [sftpListPath]: { json: sftpAccountsBody({ items: sftpAccounts, accessType: 'ssh' }) },
    },
    legacy: [openActionsMenu(false)],
    next: [openActionsMenu(true)],
    probes: [sftpTitleProbe, sftpAddProbe, sftpActionsProbe, sftpActionsMenuProbe, sftpActionsItemProbe(0), sftpActionsItemProbe(1)],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 3: the account modals (Add, Edit, Info, Delete)
// ---------------------------------------------------------------------------------------------

/** Clicks a row action of the first row: 0 Info, 1 Edit, 2 Delete (legacy order for `edit_password`). */

export const hostingSftpAddModal: ParityState = {
  id: 'hosting-sftp-add-modal',
  ...hostingState({
    ...base,
    legacy: [clickSftpAdd(false)],
    next: [clickSftpAdd(true)],
    probes: [sftpModalProbe, sftpModalTitleProbe, ...addModalFieldProbes, sftpModalSubmitProbe],
  }),
}

export const hostingSftpAddModalKey: ParityState = {
  id: 'hosting-sftp-add-modal-key',
  ...hostingState({
    ...base,
    legacy: [clickSftpAdd(false), pickSshKey(false)],
    next: [clickSftpAdd(true), pickSshKey(true)],
    probes: [sftpModalProbe, sftpModalTitleProbe, ...addModalFieldProbes, sftpModalSubmitProbe],
  }),
}

export const hostingSftpEditModal: ParityState = {
  id: 'hosting-sftp-edit-modal',
  ...hostingState({
    ...base,
    legacy: [clickSftpRowAction(false, 1)],
    next: [clickSftpRowAction(true, 1)],
    probes: [
      sftpModalProbe,
      sftpModalTitleProbe,
      sftpModalFieldProbe('type', 0),
      sftpModalFieldProbe('password', 1),
      sftpModalFieldProbe('public_key', 2),
      sftpModalSubmitProbe,
    ],
  }),
}

export const hostingSftpInfoModal: ParityState = {
  id: 'hosting-sftp-info-modal',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      'GET /server-accounts/11/sftp-accounts/server-info': { json: sftpServerInfoBody() },
    },
    legacy: [clickSftpRowAction(false, 0)],
    next: [clickSftpRowAction(true, 0)],
    probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalInfoItemProbe(0), sftpModalInfoItemProbe(1), sftpModalInfoItemProbe(2)],
  }),
}

export const hostingSftpDeleteModal: ParityState = {
  id: 'hosting-sftp-delete-modal',
  ...hostingState({
    ...base,
    legacy: [clickSftpRowAction(false, 2)],
    next: [clickSftpRowAction(true, 2)],
    probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalFieldProbe('confirm', 0), sftpModalSubmitProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 4: the server modals (Disconnect all, Manage access)
// ---------------------------------------------------------------------------------------------

export const hostingSftpDisconnectModal: ParityState = {
  id: 'hosting-sftp-disconnect-modal',
  ...hostingState({
    ...base,
    legacy: [clickSftpActionsItem(false, 0)],
    next: [clickSftpActionsItem(true, 0)],
    probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalMessageProbe, sftpModalSubmitProbe],
  }),
}

/** The SSH variant: the access select starts at the access type the list reports (`ssh`). */
export const hostingSftpAccessModal: ParityState = {
  id: 'hosting-sftp-access-modal',
  ...hostingState({
    ...base,
    services: [sshService],
    handlers: {
      ...base.handlers,
      [sftpListPath]: { json: sftpAccountsBody({ items: sftpAccounts, accessType: 'ssh' }) },
    },
    legacy: [clickSftpActionsItem(false, 1)],
    next: [clickSftpActionsItem(true, 1)],
    probes: [sftpModalProbe, sftpModalTitleProbe, sftpModalMessageProbe, sftpModalFieldProbe('access_type', 0), sftpModalSubmitProbe],
  }),
}

const states: ParityState[] = [
  hostingSftpList,
  hostingSftpEmpty,
  hostingSftpLoading,
  hostingSftpListNoEdit,
  hostingSftpNoResults,
  hostingSftpPaged,
  hostingSftpTwoAccounts,
  hostingSftpDiagnostic,
  hostingSftpError,
  hostingSftpActionsMenu,
  hostingSftpSsh,
  hostingSftpAddModal,
  hostingSftpAddModalKey,
  hostingSftpEditModal,
  hostingSftpInfoModal,
  hostingSftpDeleteModal,
  hostingSftpDisconnectModal,
  hostingSftpAccessModal,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // explicit lite (the default target): the same target as the project frame states in `instance-advanced-sftp.parity.ts`
    await runState(browser, testInfo, { ...state, target: 'lite' })
  })
}
