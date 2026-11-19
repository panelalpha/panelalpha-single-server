import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { baseContainers, cardProbes, containerGroup, containersBase, containersBody, containersDialogProbe, containersLogsPath, containersSpinnerProbe, containersTitleProbe, containersUrlsAddProbe, containersUrlsItemProbe, containersUrlsLinkProbe, containersUrlsRemoveProbe, containersUrlsSubtitleProbe, domainsHandler, domainsLoaded, exampleAccount, groupButton, portChip, previewShown, proxiedContainers, proxiedRules, rowAction } from './containers'
import { alertManagerProbe, allHostingPrivileges, hostingService, hostingState, serverAccount } from './hosting'

// S-41 hosting-containers (list, empty, loading, error, two groups, proxy rules, actions, dialogs): `/hosting/containers`, measured on the
// app-lite (`target: 'lite'`, S-110 default). The page exists only in app-lite (`LITE/views/hosting/Containers.vue`). Builder and fixtures:
// `containers.ts` (shared with the project frame, `instance-advanced-containers.parity.ts`); `hosting.ts` for the service.
// Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Plan: context/changes/hosting-containers/plan.md ("Stany parity").

// ---------------------------------------------------------------------------------------------
// Phase 1: the list, the empty and loading states, the error, two groups
// ---------------------------------------------------------------------------------------------

export const hostingContainers: ParityState = {
  id: 'hosting-containers',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
    },
    probes: [...cardProbes, alertManagerProbe],
  }),
}

export const hostingContainersEmpty: ParityState = {
  id: 'hosting-containers-empty',
  ...hostingState({
    ...containersBase,
    ready: { legacy: page => page.locator('.v-main .title-row h4'), next: page => page.getByTestId('containers-title') },
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([]) },
    },
    probes: [containersTitleProbe, alertManagerProbe],
  }),
}

export const hostingContainersLoading: ParityState = {
  id: 'hosting-containers-loading',
  ...hostingState({
    ...containersBase,
    ready: containersSpinnerProbe,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': 'hold',
    },
    probes: [containersTitleProbe, containersSpinnerProbe, alertManagerProbe],
  }),
}

export const hostingContainersError: ParityState = {
  id: 'hosting-containers-error',
  ...hostingState({
    ...containersBase,
    ready: { legacy: page => page.locator('.v-main .title-row h4'), next: page => page.getByTestId('containers-title') },
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { status: 500, json: { message: 'Server Error' } },
    },
    probes: [containersTitleProbe, alertManagerProbe],
  }),
}

export const hostingContainersTwoGroups: ParityState = {
  id: 'hosting-containers-two-groups',
  ...hostingState({
    ...containersBase,
    services: [hostingService({
      privileges: [...allHostingPrivileges, 'hosting.manage_containers', 'hosting.manage_proxy_routing'],
      server_accounts: [serverAccount(), serverAccount({ id: 12, username: 'second', domain: 'second.example.com', ipv4_addresses: ['192.0.2.11'] })],
    })],
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': {
        json: containersBody([
          containerGroup(baseContainers),
          containerGroup([], { id: 12, username: 'second', domain: 'second.example.com' }),
        ]),
      },
    },
    probes: [...cardProbes, alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 2: proxy rules in the Ports column, and the service without the proxy routing privilege
// ---------------------------------------------------------------------------------------------

export const hostingContainersProxied: ParityState = {
  id: 'hosting-containers-proxied',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/proxy-rules': { json: { data: proxiedRules } },
      'GET /services/1/containers': { json: containersBody([containerGroup(proxiedContainers)]) },
    },
    probes: [...cardProbes, alertManagerProbe],
  }),
}

// Without `hosting.manage_proxy_routing`: the chips are not clickable and the rules are not asked (no `proxy-rules` handler).
export const hostingContainersNoProxy: ParityState = {
  id: 'hosting-containers-no-proxy',
  ...hostingState({
    ...containersBase,
    services: [hostingService({ privileges: [...allHostingPrivileges, 'hosting.manage_containers'] })],
    handlers: {
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
    },
    probes: [...cardProbes, alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phases 3–5: the project action in flight, the Down dialog, the Logs dialog, the Manage Public URLs dialog
// ---------------------------------------------------------------------------------------------

export const hostingContainersActionLoading: ParityState = {
  id: 'hosting-containers-action-loading',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
      'POST /services/1/containers/11/action': 'hold',
    },
    legacy: [groupButton(0)],
    next: [groupButton(0)],
    probes: [...cardProbes, alertManagerProbe],
  }),
}

export const hostingContainersDownModal: ParityState = {
  id: 'hosting-containers-down-modal',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
    },
    legacy: [groupButton(4)],
    next: [groupButton(4)],
    probes: [containersDialogProbe, ...cardProbes, alertManagerProbe],
  }),
}

export const hostingContainersLogs: ParityState = {
  id: 'hosting-containers-logs',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
      [containersLogsPath]: { json: { data: 'nginx: starting\nlistening on 0.0.0.0:80\nready for connections\n' } },
    },
    legacy: [rowAction(3, 'legacy')],
    next: [rowAction(3, 'next')],
    probes: [containersDialogProbe, ...cardProbes, alertManagerProbe],
  }),
}

export const hostingContainersLogsLoading: ParityState = {
  id: 'hosting-containers-logs-loading',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
      [containersLogsPath]: 'hold',
    },
    legacy: [rowAction(3, 'legacy')],
    next: [rowAction(3, 'next')],
    probes: [containersDialogProbe, ...cardProbes, alertManagerProbe],
  }),
}

export const hostingContainersLogsEmpty: ParityState = {
  id: 'hosting-containers-logs-empty',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
      [containersLogsPath]: { json: { data: '' } },
    },
    legacy: [rowAction(3, 'legacy')],
    next: [rowAction(3, 'next')],
    probes: [containersDialogProbe, ...cardProbes, alertManagerProbe],
  }),
}

// The external chip 8080 of `web`: no rule yet, the dialog lists the account domains and the form.
export const hostingContainersUrlsModal: ParityState = {
  id: 'hosting-containers-urls-modal',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/containers': { json: containersBody([containerGroup(baseContainers)]) },
      [`GET /server-accounts/${exampleAccount.id}/domains`]: domainsHandler,
    },
    legacy: [portChip('legacy'), previewShown],
    next: [portChip('next'), domainsLoaded],
    probes: [containersDialogProbe, ...cardProbes, alertManagerProbe],
  }),
}

// The proxied chip 8080 of `web`: the dialog lists the existing HTTP rule of the port.
export const hostingContainersUrlsExisting: ParityState = {
  id: 'hosting-containers-urls-existing',
  ...hostingState({
    ...containersBase,
    handlers: {
      ...containersBase.handlers,
      'GET /services/1/proxy-rules': { json: { data: proxiedRules } },
      'GET /services/1/containers': { json: containersBody([containerGroup(proxiedContainers)]) },
      [`GET /server-accounts/${exampleAccount.id}/domains`]: domainsHandler,
    },
    legacy: [portChip('legacy'), previewShown],
    next: [portChip('next'), domainsLoaded],
    probes: [containersDialogProbe, containersUrlsItemProbe, containersUrlsLinkProbe, containersUrlsSubtitleProbe, containersUrlsRemoveProbe, containersUrlsAddProbe, ...cardProbes, alertManagerProbe],
  }),
}

const states: ParityState[] = [
  hostingContainers,
  hostingContainersEmpty,
  hostingContainersLoading,
  hostingContainersError,
  hostingContainersTwoGroups,
  hostingContainersProxied,
  hostingContainersNoProxy,
  hostingContainersActionLoading,
  hostingContainersDownModal,
  hostingContainersLogs,
  hostingContainersLogsLoading,
  hostingContainersLogsEmpty,
  hostingContainersUrlsModal,
  hostingContainersUrlsExisting,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // S-110: lite (the M-2 default; the page exists only in app-lite)
    await runState(browser, testInfo, { ...state, target: 'lite' })
  })
}
