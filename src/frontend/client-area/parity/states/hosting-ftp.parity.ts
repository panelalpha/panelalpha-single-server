import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { blurUsernameAndSubmit, clickAdd, clickRowAction, ftpAccountMenuProbe, ftpAccountSelectorProbe, ftpActionsProbe, ftpAddFieldProbes, ftpAddIconProbe, ftpAddProbe, ftpEmptyAddProbe, ftpEmptyProbe, ftpFilterColProbe, ftpFooterProbe, ftpManyAccounts, ftpModalFieldProbe, ftpModalInfoItemProbe, ftpModalInfoPartProbes, ftpModalInfoTitleNameProbe, ftpModalProbe, ftpModalSubmitProbe, ftpModalTitleProbe, ftpNoResultsProbe, ftpRowProbe, ftpRowUserProbe, ftpSearchProbe, ftpTableProbe, ftpTitleProbe, ftpUnsupportedProbe, ftpUsageChartProbe, ftpUsageMenuProbe, ftpUsageTextProbe, hoverUnsupported, openAccountSelector } from './ftp'
import { alertManagerProbe, domainsBody, ftpAccount, ftpAccountsBody, ftpServerInfoBody, hostingService, hostingState, listSearch, serverAccount } from './hosting'
import { isMobile } from './shell'

// S-33 hosting-ftp (S-105 ui-ftp: measured on app-lite, `target: 'lite'`, My server tab): `/hosting/ftp`. Builder and fixtures: `hosting.ts`
// (`ftpAccount`, `ftpAccountsBody`, `ftpServerInfoBody`, `domainsBody`); probes, helpers and the project frame: `ftp.ts`. Each state id is a
// literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Plan: context/changes/ui-ftp/plan.md ("Phase 7").
// Phase 1 covers the frame, the list and the empty and loading states; Phase 2 the other list states; Phase 4 the Add, Info and
// Delete modals (states 10–13). A probe for an element that a variant does not render takes `when`: absent in both apps is a failure.

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** Four accounts: two with a limit, one unlimited, one never updated (its "updated" cell is `-`). `usage: true`, as on cPanel. */
const ftpAccounts = [
  ftpAccount({ user: 'shop@example.com', directory: '/home/example/shop', diskused: 120, diskquota: 1024, updated_at: '2026-09-20T10:00:00.000Z' }),
  ftpAccount({ user: 'blog@example.com', directory: '/home/example/blog', diskused: 300, diskquota: 2048, updated_at: '2026-09-18T08:30:00.000Z' }),
  ftpAccount({ user: 'mail@example.com', directory: '/home/example/mail', diskused: 42, diskquota: 'unlimited', updated_at: '2026-09-01T12:00:00.000Z' }),
  ftpAccount({ user: 'archive@example.com', directory: '/home/example/archive', diskused: 512, diskquota: 512, updated_at: null }),
]

const ftpListPath = 'GET /server-accounts/11/ftp-accounts'

/** Handlers every FTP state shares; a state overrides the list. */
const base = {
  path: '/hosting/ftp',
  lite: true,
  ready: ftpTitleProbe,
  handlers: {
    [ftpListPath]: { json: ftpAccountsBody({ items: ftpAccounts, usage: true }) },
    'GET /server-accounts/11/ftp-accounts/server-info': { json: ftpServerInfoBody() },
    'GET /server-accounts/11/domains': { json: domainsBody(['example.com', 'shop.example.com']) },
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 1: frame, list, empty and loading
// ---------------------------------------------------------------------------------------------

export const hostingFtpList: ParityState = {
  id: 'hosting-ftp-list',
  ...hostingState({
    ...base,
    probes: [ftpTitleProbe, ftpFilterColProbe, ftpAddProbe, ftpAddIconProbe, ftpSearchProbe, ftpTableProbe, ftpRowProbe, ftpRowUserProbe, ftpUsageChartProbe, ftpUsageTextProbe, ftpActionsProbe],
  }),
}

export const hostingFtpEmpty: ParityState = {
  id: 'hosting-ftp-empty',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [ftpListPath]: { json: ftpAccountsBody({ items: [], usage: true }) },
    },
    probes: [ftpTitleProbe, ftpTableProbe, ftpEmptyProbe, ftpEmptyAddProbe],
  }),
}

export const hostingFtpLoading: ParityState = {
  id: 'hosting-ftp-loading',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [ftpListPath]: 'hold',
    },
    probes: [ftpTitleProbe, ftpTableProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 2: the other list states (usage not supported, no results, paged, two accounts, diagnostic, error)
// ---------------------------------------------------------------------------------------------

export const hostingFtpUsageUnsupported: ParityState = {
  id: 'hosting-ftp-usage-unsupported',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [ftpListPath]: { json: ftpAccountsBody({ items: ftpAccounts, usage: false }) },
    },
    pointer: 'keep',
    legacy: [hoverUnsupported(false)],
    next: [hoverUnsupported(true)],
    probes: [
      ftpTitleProbe,
      ftpAddProbe,
      ftpSearchProbe,
      ftpTableProbe,
      ftpRowProbe,
      ftpRowUserProbe,
      { ...ftpUsageChartProbe, when: isMobile },
      ftpUnsupportedProbe,
      ftpUsageMenuProbe,
      ftpActionsProbe,
    ],
  }),
}

export const hostingFtpNoResults: ParityState = {
  id: 'hosting-ftp-no-results',
  ...hostingState({
    ...base,
    legacy: [listSearch('no-such-account')],
    next: [listSearch('no-such-account')],
    probes: [ftpTitleProbe, ftpAddProbe, ftpSearchProbe, ftpTableProbe, ftpNoResultsProbe],
  }),
}

export const hostingFtpPaged: ParityState = {
  id: 'hosting-ftp-paged',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [ftpListPath]: { json: ftpAccountsBody({ items: ftpManyAccounts, usage: true }) },
    },
    probes: [ftpTitleProbe, ftpAddProbe, ftpSearchProbe, ftpTableProbe, ftpRowProbe, ftpRowUserProbe, ftpFooterProbe],
  }),
}

export const hostingFtpTwoAccounts: ParityState = {
  id: 'hosting-ftp-two-accounts',
  ...hostingState({
    ...base,
    services: [hostingService({ server_accounts: [serverAccount(), serverAccount({ id: 12, domain: 'second.example.com', username: 'second' })] })],
    pointer: 'keep',
    legacy: [openAccountSelector.legacy],
    next: [openAccountSelector.next],
    probes: [ftpTitleProbe, ftpAddProbe, ftpSearchProbe, ftpTableProbe, ftpRowProbe, ftpAccountSelectorProbe, ftpAccountMenuProbe],
  }),
}

export const hostingFtpDiagnostic: ParityState = {
  id: 'hosting-ftp-diagnostic',
  ...hostingState({
    ...base,
    services: [hostingService({ server_accounts: [serverAccount({ diagnostic_mode: true })] })],
    probes: [ftpTitleProbe, alertManagerProbe],
  }),
}

export const hostingFtpError: ParityState = {
  id: 'hosting-ftp-error',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [ftpListPath]: { status: 500, json: { message: 'Server Error' } },
    },
    ready: ftpEmptyProbe,
    probes: [ftpTitleProbe, ftpTableProbe, ftpEmptyProbe, ftpEmptyAddProbe, alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 4: Add, Info and Delete modals
// ---------------------------------------------------------------------------------------------

export const hostingFtpAddModal: ParityState = {
  id: 'hosting-ftp-add-modal',
  ...hostingState({
    ...base,
    legacy: [clickAdd(false)],
    next: [clickAdd(true)],
    probes: [ftpModalProbe, ftpModalTitleProbe, ...ftpAddFieldProbes, ftpModalSubmitProbe],
  }),
}

export const hostingFtpAddModalErrors: ParityState = {
  id: 'hosting-ftp-add-modal-errors',
  ...hostingState({
    ...base,
    legacy: [clickAdd(false), blurUsernameAndSubmit(false)],
    next: [clickAdd(true), blurUsernameAndSubmit(true)],
    probes: [ftpModalProbe, ftpModalTitleProbe, ...ftpAddFieldProbes, ftpModalSubmitProbe],
  }),
}

export const hostingFtpInfoModal: ParityState = {
  id: 'hosting-ftp-info-modal',
  ...hostingState({
    ...base,
    legacy: [clickRowAction(false, 0)],
    next: [clickRowAction(true, 0)],
    probes: [ftpModalProbe, ftpModalTitleProbe, ftpModalInfoTitleNameProbe, ftpModalInfoItemProbe(0), ftpModalInfoItemProbe(1), ftpModalInfoItemProbe(2), ...ftpModalInfoPartProbes],
  }),
}

export const hostingFtpDeleteModal: ParityState = {
  id: 'hosting-ftp-delete-modal',
  ...hostingState({
    ...base,
    legacy: [clickRowAction(false, 1)],
    next: [clickRowAction(true, 1)],
    probes: [ftpModalProbe, ftpModalTitleProbe, ftpModalFieldProbe('confirm', 0), ftpModalSubmitProbe],
  }),
}

const states: ParityState[] = [
  hostingFtpList,
  hostingFtpEmpty,
  hostingFtpLoading,
  hostingFtpUsageUnsupported,
  hostingFtpNoResults,
  hostingFtpPaged,
  hostingFtpTwoAccounts,
  hostingFtpDiagnostic,
  hostingFtpError,
  hostingFtpAddModal,
  hostingFtpAddModalErrors,
  hostingFtpInfoModal,
  hostingFtpDeleteModal,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // explicit lite (the default target): the same target as the project frame states in `instance-advanced-ftp.parity.ts`
    await runState(browser, testInfo, { ...state, target: 'lite' })
  })
}
