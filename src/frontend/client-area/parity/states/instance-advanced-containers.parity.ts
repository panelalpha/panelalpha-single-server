import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { clickContainersActionsItem, containerGroup, CONTAINERS_PROJECT_HOME, containersBody, containersDialogCancelProbe, containersDialogDownProbe, containersDialogProbe, containersDialogTextProbe, containersDialogTitleProbe, containersLogsPath, containersLogsPreProbe, containersLogsRefreshProbe, containersLogsSpinnerProbe, containersPortWrapperProbe, containersProjectActionsChevronProbe, containersProjectActionsIconProbe, containersProjectActionsItemProbe, containersProjectActionsLabelProbe, containersProjectActionsLoaderProbe, containersProjectActionsMenuProbe, containersProjectActionsOverlayProbe, containersProjectActionsProbe, containersProjectCardProbe, containersProjectDefaultProbes, containersProjectEmptyProbe, containersProjectHandlers, containersProjectHeaderCellProbe, containersProjectInstanceNoProxy, containersProjectRefreshIconProbe, containersProjectRefreshLabelProbe, containersProjectRefreshProbe, containersProjectTableProbe, containersProjectTitleProbe, containersProxyRuleError, containersRowActionProbe, containersUrlsAddProbe, containersUrlsPortProbe, containersUrlsPreviewProbe, containersUrlsSelectProbe, domainsHandler, domainsLoaded, exampleAccount, openContainersActions, openContainersDownDialog, portChip, previewShown, proxiedContainers, proxiedRules, rowAction, waitForContainersProject } from './containers'
import { alertManagerProbe, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID, advancedActiveItemProbe } from './instance-advanced-frame'
import { focusButton, hovered, noFocusRing } from './sftp'
import { NOW } from './shell'

type Target = (page: Page) => Locator

// S-110 ui-containers: the Containers list in the Advanced tab of a project (`/projects/:id/advanced/containers`), measured on app-lite
// (`target: 'lite'`, M-2 default). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as
// text. Probes, handlers and the project header: `containers.ts`; the frame: `instance-advanced-frame.ts`. Plan:
// context/changes/ui-containers/plan.md ("Phase 10").

// Phase 10: the list of a project with one group of three containers (running, exited, restarting) and the Actions button in the header.
// The first load of the first state needs `PARITY_LEGACY_CACHE=refresh` (the deployed lite has a new project chunk).
export const instanceAdvancedContainersDefault: ParityState = {
  id: 'containers-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/containers`,
  signedIn: true,
  clock: NOW,
  home: CONTAINERS_PROJECT_HOME,
  handlers: containersProjectHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForContainersProject,
  probes: containersProjectDefaultProbes,
}

// Phase 11: hover of the Actions button (on mobile the icon alone, located by the test id / class of the other probes) and of the clickable
// wrapper of the first public port: the chip ignores the pointer, so the row carries the hover (`cursor`, the chip and its wrapper probed).
export const instanceAdvancedContainersHover: ParityState = {
  ...hovered(instanceAdvancedContainersDefault, { legacy: containersProjectActionsProbe.legacy, next: containersProjectActionsProbe.next }, [containersProjectActionsOverlayProbe]),
  id: 'containers-hover',
}

export const instanceAdvancedContainersChipHover: ParityState = {
  ...hovered(instanceAdvancedContainersDefault, { legacy: containersPortWrapperProbe.legacy, next: containersPortWrapperProbe.next }, [containersPortWrapperProbe]),
  id: 'containers-chip-hover',
}

// Phase 11: the Actions menu open (a click on the button): the teleported menu (292 px) and its five items, in the project's order. The
// pointer stays on the button: the default reset moves it into the corner, and the menu's screenshots then never settle (harness error).
const actionsMenuProbes: Probe[] = [0, 1, 2, 3, 4].flatMap(index => [containersProjectActionsItemProbe(index), containersProjectActionsIconProbe(index)])

export const instanceAdvancedContainersActionsMenu: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-actions-menu',
  pointer: 'keep',
  actions: {
    legacy: [...instanceAdvancedContainersDefault.actions.legacy, openContainersActions(false)],
    next: [...instanceAdvancedContainersDefault.actions.next, openContainersActions(true)],
  },
  probes: [...containersProjectDefaultProbes, containersProjectActionsMenuProbe, ...actionsMenuProbes],
}

// Phase 13: the Restart item of the Actions menu (the menu closes) starts a project action whose POST hangs (`'hold'`). The Actions button
// keeps its loader and is disabled, the service icons of the row are disabled, and the Refresh button stays enabled.
export const instanceAdvancedContainersDisabled: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-disabled',
  handlers: containersProjectHandlers({ 'POST /services/1/containers/11/action': 'hold' }),
  actions: {
    legacy: [...instanceAdvancedContainersDefault.actions.legacy, clickContainersActionsItem(false, 1)],
    next: [...instanceAdvancedContainersDefault.actions.next, clickContainersActionsItem(true, 1)],
  },
  probes: [...containersProjectDefaultProbes, containersProjectActionsLoaderProbe, ...[0, 1, 2, 3].map(index => containersRowActionProbe(index))],
}

// Phase 14: the list request fails (500 `Server Error`): the shell's alert, and the project card with the no-data text and Actions disabled (no
// group). The readiness anchor is the header title (the table has no row), and the alert is awaited last, since it renders after the failed request.
const waitForContainersError = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(containersProjectTitleProbe.legacy),
    waitFor(alertManagerProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(containersProjectTitleProbe.next),
    waitFor(alertManagerProbe.next),
  ],
}

export const instanceAdvancedContainersError: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-error',
  handlers: containersProjectHandlers({ 'GET /services/1/containers': { status: 500, json: { message: 'Server Error' } } }),
  actions: waitForContainersError,
  probes: [containersProjectTitleProbe, containersProjectRefreshProbe, containersProjectActionsProbe, containersProjectActionsLabelProbe, containersProjectActionsChevronProbe, containersProjectCardProbe, containersProjectHeaderCellProbe, containersProjectTableProbe, containersProjectEmptyProbe, alertManagerProbe, advancedActiveItemProbe],
}

// Phase 12: keyboard focus of the project Refresh button (the text button of the header, icon-only on mobile, so it is located by the test id /
// class of the probes, not by its accessible name). `focusButton` (sftp) presses Shift, then `focus()` and asserts `:focus-visible`; no Tab. V4's
// ring is asserted hidden in next. The label and the icon are probed beside the button.
export const instanceAdvancedContainersFocusVisible: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...instanceAdvancedContainersDefault.actions.legacy, focusButton(containersProjectRefreshProbe.legacy)],
    next: [...instanceAdvancedContainersDefault.actions.next, focusButton(containersProjectRefreshProbe.next)],
  },
  probes: [...instanceAdvancedContainersDefault.probes, containersProjectRefreshLabelProbe, containersProjectRefreshIconProbe],
  afterCapture: { legacy: [], next: [noFocusRing(containersProjectRefreshProbe.next)] },
}

// Phase 15: no row in the table, and the two empty variants share the readiness and the probes. The title anchors the card, the no-data text
// is awaited last. Lite takes `groups[0]`, so `containers-empty` is the body without any group (Actions disabled), and
// `containers-group-empty` is one group with `containers: []` (Actions enabled, the same no-data text).
const waitForContainersNoRows = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(containersProjectTitleProbe.legacy),
    waitFor(containersProjectEmptyProbe.legacy),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(containersProjectTitleProbe.next),
    waitFor(containersProjectEmptyProbe.next),
  ],
}

const noRowsProbes: Probe[] = [containersProjectTitleProbe, containersProjectRefreshProbe, containersProjectActionsProbe, containersProjectActionsLabelProbe, containersProjectActionsChevronProbe, containersProjectCardProbe, containersProjectHeaderCellProbe, containersProjectTableProbe, containersProjectEmptyProbe, advancedActiveItemProbe]

export const instanceAdvancedContainersEmpty: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-empty',
  handlers: containersProjectHandlers({ 'GET /services/1/containers': { json: containersBody([]) } }),
  actions: waitForContainersNoRows,
  probes: noRowsProbes,
}

export const instanceAdvancedContainersGroupEmpty: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-group-empty',
  handlers: containersProjectHandlers({ 'GET /services/1/containers': { json: containersBody([containerGroup([])]) } }),
  actions: waitForContainersNoRows,
  probes: noRowsProbes,
}

// Phase 16: the list request hangs (`'hold'`): the project skeleton in the card (sort row and item on desktop, cards below `lg`), masked. The
// title anchors the card and the skeleton is awaited last. Refresh stays disabled, and Actions is disabled (no group yet).
const skeletonLoader = {
  legacy: (page: Page) => page.locator('.v-main .data-table .v-skeleton-loader'),
  next: (page: Page) => page.getByTestId('containers-card').locator('.v-skeleton-loader'),
}

const waitForContainersSkeleton = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(containersProjectTitleProbe.legacy),
    waitFor(page => skeletonLoader.legacy(page).first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(containersProjectTitleProbe.next),
    waitFor(page => skeletonLoader.next(page).first()),
  ],
}

export const instanceAdvancedContainersLoading: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-loading',
  handlers: containersProjectHandlers({ 'GET /services/1/containers': 'hold' }),
  actions: waitForContainersSkeleton,
  masks: { legacy: [skeletonLoader.legacy], next: [skeletonLoader.next] },
  probes: [containersProjectTitleProbe, containersProjectRefreshProbe, containersProjectActionsProbe, containersProjectActionsLabelProbe, containersProjectActionsChevronProbe, containersProjectCardProbe, containersProjectHeaderCellProbe, containersProjectTableProbe, advancedActiveItemProbe],
}

// Phase 17: the Ports column with the proxy rules of the service (http on 8080, sensitive http on 3306, stream on 9090): the chips carry the
// address and the arrow. The rules answer `GET /services/1/proxy-rules`, asked because the instance has the proxy routing privilege.
export const instanceAdvancedContainersProxied: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-proxied',
  handlers: containersProjectHandlers({
    'GET /services/1/proxy-rules': { json: { data: proxiedRules } },
    'GET /services/1/containers': { json: containersBody([containerGroup(proxiedContainers)]) },
  }),
}

// Phase 17: the instance without `hosting.manage_proxy_routing`: the Ports chips are not clickable (no `port-chip--clickable`), and the list
// does not ask for the rules.
export const instanceAdvancedContainersNoProxy: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-no-proxy',
  handlers: containersProjectHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: containersProjectInstanceNoProxy } },
  }),
}

// Phase 18: the Down dialog of the project, opened from the Actions menu (its fifth item). The menu closes; the card carries the title, the
// text and the Cancel and Down buttons (Down in the error colour). The click is a DOM click (no page scroll, see lessons "Modal w stanie parity").
export const instanceAdvancedContainersDownModal: ParityState = {
  ...instanceAdvancedContainersDefault,
  id: 'containers-down-modal',
  actions: {
    legacy: [...instanceAdvancedContainersDefault.actions.legacy, openContainersDownDialog(false)],
    next: [...instanceAdvancedContainersDefault.actions.next, openContainersDownDialog(true)],
  },
  probes: [...containersProjectDefaultProbes, containersDialogProbe, containersDialogTitleProbe, containersDialogTextProbe, containersDialogCancelProbe, containersDialogDownProbe],
}

// Phase 19: the Logs dialog of the first row's service (the logs icon, index 3 of the row's actions). The log answers
// `GET /services/1/containers/11/web/logs`; the card is 860 px, the console block `pre.logs-pre` (tokens of phase 1) holds the text. The
// dialog opens by a click on the row's icon; the body is awaited (the console block, or the spinner while the request hangs).
function logsOpened (handlers: Record<string, Handler>, ready: Target): ParityState {
  return {
    ...instanceAdvancedContainersDefault,
    handlers: containersProjectHandlers(handlers),
    actions: {
      legacy: [...instanceAdvancedContainersDefault.actions.legacy, rowAction(3, 'legacy'), waitFor(ready)],
      next: [...instanceAdvancedContainersDefault.actions.next, rowAction(3, 'next'), waitFor(ready)],
    },
    probes: [...containersProjectDefaultProbes, containersDialogProbe, containersDialogTitleProbe, containersLogsRefreshProbe, containersLogsPreProbe],
  }
}

export const instanceAdvancedContainersLogs: ParityState = {
  ...logsOpened({
    [containersLogsPath]: { json: { data: 'nginx: starting\nlistening on 0.0.0.0:80\nready for connections\n' } },
  }, page => page.locator('.v-dialog .logs-pre')),
  id: 'containers-logs',
}

export const instanceAdvancedContainersLogsEmpty: ParityState = {
  ...logsOpened({ [containersLogsPath]: { json: { data: '' } } }, page => page.locator('.v-dialog .logs-pre')),
  id: 'containers-logs-empty',
}

// The log request hangs: the spinner stands in the body, and the refresh button of the title carries its loader.
export const instanceAdvancedContainersLogsLoading: ParityState = {
  ...logsOpened({ [containersLogsPath]: 'hold' }, page => page.locator('.v-dialog .v-progress-circular')),
  id: 'containers-logs-loading',
  probes: [...containersProjectDefaultProbes, containersDialogProbe, containersDialogTitleProbe, containersLogsRefreshProbe, containersLogsSpinnerProbe],
}

// Phase 20: the Manage Public URLs dialog of the 8080 chip (`port-chip--clickable`; the chip ignores the pointer on external ports, so the
// click is forced). The dialog asks the account domains after it opens: the domain select holds `example.com` (the primary domain), the
// listen port is 8080 and the preview reads the example.com address on port 8080 (next waits for it; legacy waits for any preview).
const urlsDialogProbes: Probe[] = [...containersProjectDefaultProbes, containersDialogProbe, containersDialogTitleProbe, containersUrlsSelectProbe, containersUrlsPortProbe, containersUrlsPreviewProbe]

function urlsOpened (handlers: Record<string, Handler>): ParityState {
  return {
    ...instanceAdvancedContainersDefault,
    handlers: containersProjectHandlers({ [`GET /server-accounts/${exampleAccount.id}/domains`]: domainsHandler, ...handlers }),
    actions: {
      legacy: [...instanceAdvancedContainersDefault.actions.legacy, portChip('legacy'), previewShown],
      next: [...instanceAdvancedContainersDefault.actions.next, portChip('next'), domainsLoaded],
    },
    probes: urlsDialogProbes,
  }
}

// No rule of the port yet: the dialog shows the no-URL text and the add form only.
export const instanceAdvancedContainersUrlsModal: ParityState = {
  ...urlsOpened({}),
  id: 'containers-urls-modal',
}

// The proxied chip 8080 (the HTTP rule of the port): the dialog lists its public URL, the form stays below it.
export const instanceAdvancedContainersUrlsExisting: ParityState = {
  ...urlsOpened({
    'GET /services/1/proxy-rules': { json: { data: proxiedRules } },
    'GET /services/1/containers': { json: containersBody([containerGroup(proxiedContainers)]) },
  }),
  id: 'containers-urls-existing',
  probes: [...urlsDialogProbes, containersDialogTextProbe],
}

// The add button submits the default form; the proxy refuses the rule (422): the alert shows the message, and the dialog stays open.
function submitUrl (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await (app === 'legacy' ? containersUrlsAddProbe.legacy : containersUrlsAddProbe.next)(page).click()
  }
}

export const instanceAdvancedContainersUrlsError: ParityState = {
  ...urlsOpened({ 'POST /services/1/proxy-rules': containersProxyRuleError }),
  id: 'containers-urls-error',
  actions: {
    legacy: [...instanceAdvancedContainersDefault.actions.legacy, portChip('legacy'), previewShown, submitUrl('legacy'), waitFor(alertManagerProbe.legacy)],
    next: [...instanceAdvancedContainersDefault.actions.next, portChip('next'), domainsLoaded, submitUrl('next'), waitFor(alertManagerProbe.next)],
  },
  probes: [...urlsDialogProbes, alertManagerProbe],
}

const states: ParityState[] = [
  instanceAdvancedContainersDefault,
  instanceAdvancedContainersHover,
  instanceAdvancedContainersChipHover,
  instanceAdvancedContainersActionsMenu,
  instanceAdvancedContainersDisabled,
  instanceAdvancedContainersError,
  instanceAdvancedContainersFocusVisible,
  instanceAdvancedContainersEmpty,
  instanceAdvancedContainersGroupEmpty,
  instanceAdvancedContainersLoading,
  instanceAdvancedContainersProxied,
  instanceAdvancedContainersNoProxy,
  instanceAdvancedContainersDownModal,
  instanceAdvancedContainersLogs,
  instanceAdvancedContainersLogsEmpty,
  instanceAdvancedContainersLogsLoading,
  instanceAdvancedContainersUrlsModal,
  instanceAdvancedContainersUrlsExisting,
  instanceAdvancedContainersUrlsError,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
