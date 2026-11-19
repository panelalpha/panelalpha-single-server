import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { blurEmptyCommandLegacy, blurEmptyCommandNext, CRON_JOBS_KEY, cronAddProbe, cronDeleteProbes, cronEmptyAddProbe, cronEmptyProbe, cronFrequencyItemProbe, cronFrequencyListProbe, cronFrequencyMenuProbe, cronJobs, cronLoadingProbe, cronModalProbes, cronRowEditProbe, cronRowProbe, cronSearchProbe, cronSelectorProbe, cronTableProbe, cronTitleProbe, openAddLegacy, openAddNext, openDeleteLegacy, openDeleteNext, openEditLegacy, openEditNext, openFrequencyMenu, rowsReady, searchNothing, sortByCommand, tickConfirmLegacy, tickConfirmNext } from './cron'
import { alertManagerProbe, hostingService, hostingState, serverAccount } from './hosting'

// S-36 hosting-cron (S-108 ui-cron: measured on app-lite, `target: 'lite'`, My server tab): `/hosting/cron` (list, empty, loading, search,
// sort, accounts, diagnostic, error), the Add and Edit modal and the Delete modal. Builder and fixtures: `hosting.ts`; probes, fixtures and
// actions shared with the project mount: `cron.ts`. Each state id is a literal `id: '…',` line, which `registeredStates` in
// report/write-report.ts reads as text. Plans: context/archive/2026-10-08-hosting-cron/plan.md, context/changes/ui-cron/plan.md ("Phase 4").

const twoAccounts = hostingService({
  server_accounts: [serverAccount(), serverAccount({ id: 12, domain: 'second.example.com', username: 'second' })],
})

// ---------------------------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------------------------

export const hostingCron: ParityState = {
  id: 'hosting-cron',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    probes: [cronTitleProbe, cronAddProbe, cronSearchProbe, cronTableProbe, cronRowProbe, cronRowEditProbe],
  }),
}

export const hostingCronEmpty: ParityState = {
  id: 'hosting-cron-empty',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: [] } } },
    ready: { legacy: cronEmptyProbe.legacy, next: cronEmptyProbe.next },
    probes: [cronTitleProbe, cronTableProbe, cronEmptyProbe, cronEmptyAddProbe],
  }),
}

export const hostingCronLoading: ParityState = {
  id: 'hosting-cron-loading',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: 'hold' },
    ready: { legacy: cronLoadingProbe.legacy, next: cronLoadingProbe.next },
    probes: [cronTitleProbe, cronTableProbe, cronLoadingProbe],
  }),
}

export const hostingCronNoResults: ParityState = {
  id: 'hosting-cron-no-results',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [searchNothing],
    next: [searchNothing],
    probes: [cronTitleProbe, cronSearchProbe, cronTableProbe],
  }),
}

export const hostingCronSorted: ParityState = {
  id: 'hosting-cron-sorted',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [sortByCommand],
    next: [sortByCommand],
    probes: [cronTitleProbe, cronTableProbe, cronRowProbe],
  }),
}

export const hostingCronAccounts: ParityState = {
  id: 'hosting-cron-accounts',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    services: [twoAccounts],
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    probes: [cronTitleProbe, cronAddProbe, cronSelectorProbe, cronTableProbe, cronRowProbe],
  }),
}

export const hostingCronDiagnostic: ParityState = {
  id: 'hosting-cron-diagnostic',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    services: [hostingService({ server_accounts: [serverAccount({ diagnostic_mode: true })] })],
    ready: { legacy: alertManagerProbe.legacy, next: alertManagerProbe.next },
    probes: [cronTitleProbe, alertManagerProbe],
  }),
}

export const hostingCronError: ParityState = {
  id: 'hosting-cron-error',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { status: 422, json: { message: 'Hosting Server is not accessible' } } },
    ready: { legacy: alertManagerProbe.legacy, next: alertManagerProbe.next },
    probes: [cronTitleProbe, cronTableProbe, cronEmptyProbe, alertManagerProbe],
  }),
}

export const hostingCronAddOpen: ParityState = {
  id: 'hosting-cron-add-open',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [openAddLegacy],
    next: [openAddNext],
    probes: cronModalProbes,
  }),
}

export const hostingCronAddValidation: ParityState = {
  id: 'hosting-cron-add-validation',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [openAddLegacy, blurEmptyCommandLegacy],
    next: [openAddNext, blurEmptyCommandNext],
    probes: cronModalProbes,
  }),
}

export const hostingCronEditOpen: ParityState = {
  id: 'hosting-cron-edit-open',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [openEditLegacy],
    next: [openEditNext],
    probes: cronModalProbes,
  }),
}

/** WP Cloud host: the same Add dialog with its frequency select open on the seven WP Cloud options (app == deployed app-lite, ui-cron research §2; the menu is opened since ui-cron impl-review F4). */
export const hostingCronWpCloudAddOpen: ParityState = {
  id: 'hosting-cron-wpcloud-add-open',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    services: [hostingService({ hosting_server_type: 'wp-cloud' })],
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [openAddLegacy, openFrequencyMenu(false)],
    next: [openAddNext, openFrequencyMenu(true)],
    probes: [...cronModalProbes, cronFrequencyMenuProbe, cronFrequencyListProbe, cronFrequencyItemProbe],
  }),
}

export const hostingCronDeleteOpen: ParityState = {
  id: 'hosting-cron-delete-open',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [openDeleteLegacy],
    next: [openDeleteNext],
    probes: cronDeleteProbes,
  }),
}

export const hostingCronDeleteConfirmed: ParityState = {
  id: 'hosting-cron-delete-confirmed',
  ...hostingState({
    path: '/hosting/cron',
    lite: true,
    handlers: { [CRON_JOBS_KEY]: { json: { data: cronJobs } } },
    ready: rowsReady,
    legacy: [openDeleteLegacy, tickConfirmLegacy],
    next: [openDeleteNext, tickConfirmNext],
    probes: cronDeleteProbes,
  }),
}

const states: ParityState[] = [
  hostingCron,
  hostingCronEmpty,
  hostingCronLoading,
  hostingCronNoResults,
  hostingCronSorted,
  hostingCronAccounts,
  hostingCronDiagnostic,
  hostingCronError,
  hostingCronAddOpen,
  hostingCronAddValidation,
  hostingCronEditOpen,
  hostingCronWpCloudAddOpen,
  hostingCronDeleteOpen,
  hostingCronDeleteConfirmed,
]

// Variants a state cannot be reached in. Legacy `HostingTable.vue` renders the sort header only when `!$vuetify.breakpoint.mobile`,
// so there is nothing to click on mobile (the state timed out on `.custom-sort`).
const notInVariant: Record<string, string[]> = {
  [hostingCronSorted.id]: ['light-mobile'],
}

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(notInVariant[state.id]?.includes(testInfo.project.name) ?? false, 'legacy has no sort header on mobile')
    await runState(browser, testInfo, state)
  })
}
