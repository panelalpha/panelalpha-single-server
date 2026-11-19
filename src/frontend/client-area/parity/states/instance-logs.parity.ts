import type { ParityState, StateAction } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { alertManagerProbe, waitFor } from './hosting'
import {
  logRows,
  LOGS_EMPTY,
  LOGS_PROJECT_ID,
  logsCustomInstance,
  logsDefaultProbes,
  logsDeployConsoleProbe,
  logsDownloadContentProbe,
  logsDownloadIconProbe,
  logsDownloadProbe,
  logsFileSelectProbe,
  logsFilterProbe,
  logsFooterProbe,
  logsFrameProbes,
  logsHandlers,
  logsInfoRowProbe,
  logsNoDataButtonProbe,
  logsNoDataProbe,
  logsNoDataTitleProbe,
  logsNoPrivilegesInstance,
  logsNoResultsProbe,
  logsNoRowsProbe,
  logsPanelCardProbe,
  logsPreProbe,
  logsSelectedTabProbe,
  logsSkeletonProbe,
  logsSortRowProbe,
  logsTab,
  logsTableProbe,
  logsTabsProbe,
} from './instance-logs'
import { deployHistoryHandlers, liteShellHome } from './instances'
import { NOW } from './shell'

// S-95 ui-instance-logs: the Logs page of a project inside the Advanced frame, measured on app-lite (`target: 'lite'`, M-2 default). Each
// state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes:
// `instance-logs.ts`. Plan: context/changes/ui-instance-logs/plan.md.

const path = `/projects/${LOGS_PROJECT_ID}/advanced/logs`

/** Ready when the first table row is on the page (the rows load after the tab strip). */
const waitForRows = {
  legacy: [waitFor(page => page.locator('.data-table tbody tr').first())],
  next: [waitFor(page => page.locator('.data-table tbody tr').first())],
}

/** A state of this page: the shared frame (single-server `/home`, clock, signed in) plus what differs. */
function logsState (rest: Pick<ParityState, 'id' | 'actions' | 'probes'> & Partial<ParityState>): ParityState {
  return { target: 'lite', path, signedIn: true, clock: NOW, home: liteShellHome(), handlers: logsHandlers(), ...rest }
}

// Phase 1: the Instance Logs tab with ten rows of a three-page list.
export const instanceLogsDefault: ParityState = logsState({
  id: 'instance-logs-default', actions: waitForRows, probes: logsDefaultProbes })

/** Opens tab `index` and waits for `anchor` (the tab's own content). Both apps order the tabs the same way. */
function openTab (index: number, anchor: Parameters<typeof waitFor>[0]): { legacy: StateAction[], next: StateAction[] } {
  const open: StateAction = async page => {
    await waitFor(page => page.locator('.data-table tbody tr').first())(page)
    await page.mouse.move(0, 0)
    await logsTab(index)(page).click()
    await waitFor(anchor)(page)
  }
  return { legacy: [open], next: [open] }
}

const waitPre = (page: Page) => page.locator('.v-window-item--active pre').first()
const waitNoData = (page: Page) => page.locator('.v-window-item--active .nodata-container').first()

// Phase 9: the WordPress tab with the log text (the "max entries" row with Download, then the `<pre>`).
export const instanceLogsWordpress: ParityState = logsState({
  id: 'instance-logs-wordpress',
  actions: openTab(1, waitPre),
  probes: [...logsFrameProbes, logsPanelCardProbe, logsInfoRowProbe, logsDownloadProbe, logsDownloadIconProbe, logsDownloadContentProbe, logsPreProbe],
})

// Phase 5: the pointer on Download of the WordPress tab, then the keyboard focus on it (overlay probe, `auth.ts`).
export const instanceLogsHover: ParityState = {
  ...buttonHoverState(instanceLogsWordpress, 'instance-logs-hover', 'button.download', 'lite'),
  id: 'instance-logs-hover',
  // The page is 21px taller than the viewport: a full-page capture resizes it and drops the pointer off the button.
  viewportOnly: true,
}

export const instanceLogsFocus: ParityState = {
  ...buttonFocusState(instanceLogsWordpress, 'instance-logs-focus', 'button.download', 'lite'),
  id: 'instance-logs-focus',
}

// Phase 6: the WordPress log request fails with a server error: the alert and the empty state of the tab (legacy `Logs.vue:470-482`).
export const instanceLogsError: ParityState = logsState({
  id: 'instance-logs-error',
  handlers: logsHandlers({ [`GET /projects/${LOGS_PROJECT_ID}/wordpress/logs`]: { status: 500, json: { message: 'Server Error' } } }),
  actions: openTab(1, waitNoData),
  probes: [...logsFrameProbes, logsPanelCardProbe, logsNoDataProbe, logsNoDataTitleProbe, alertManagerProbe],
})

// Phase 7: no rows at all, and a search that finds nothing (the no-results container with its illustration and the clear button).
export const instanceLogsEmpty: ParityState = logsState({
  id: 'instance-logs-empty',
  handlers: logsHandlers({ [`GET /projects/${LOGS_PROJECT_ID}/logs`]: LOGS_EMPTY }),
  actions: { legacy: [waitFor(page => page.locator('.data-table').first())], next: [waitFor(page => page.locator('.data-table').first())] },
  probes: [logsTabsProbe, logsSelectedTabProbe, logsFilterProbe, logsTableProbe, logsSortRowProbe, logsNoRowsProbe, logsFooterProbe],
})

// Legacy debounces the search with lodash, which reads `Date.now()`: under the fixed clock no time passes and the term never goes out, so the
// clock moves on after the typing, when the debounce timer is armed (the `submitSiteName` of the frame states moves it before a click).
const searchNothing: StateAction = async page => {
  await waitFor(page => page.locator('.data-table tbody tr').first())(page)
  await page.locator('.page-title__filter-controls input').first().pressSequentially('zzz', { delay: 60 })
  await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
  await waitFor(page => page.locator('.no-results-container .v-btn').first())(page)
}

export const instanceLogsSearchEmpty: ParityState = logsState({
  id: 'instance-logs-search-empty',
  handlers: logsHandlers({
    // The first request lists the rows; the search that follows finds nothing (a sequence, so the term's name on the wire does not matter).
    [`GET /projects/${LOGS_PROJECT_ID}/logs`]: [{ json: { data: logRows(), meta: { total: 24 } } }, LOGS_EMPTY],
  }),
  actions: { legacy: [searchNothing], next: [searchNothing] },
  probes: [logsTabsProbe, logsFilterProbe, logsTableProbe, logsNoRowsProbe, logsNoResultsProbe],
})

// Phase 8: the list request is held: the skeleton rows (animation masked by the harness freeze).
export const instanceLogsLoading: ParityState = logsState({
  id: 'instance-logs-loading',
  handlers: logsHandlers({ [`GET /projects/${LOGS_PROJECT_ID}/logs`]: 'hold' }),
  actions: { legacy: [waitFor(page => page.locator('.data-table tbody .v-skeleton-loader').first())], next: [waitFor(page => page.locator('.data-table tbody .v-skeleton-loader').first())] },
  probes: [logsTabsProbe, logsSelectedTabProbe, logsFilterProbe, logsTableProbe, logsSkeletonProbe],
})

// Phase 9: the WordPress tab without a log (`null`): the empty state of the tab.
export const instanceLogsWordpressEmpty: ParityState = logsState({
  id: 'instance-logs-wordpress-empty',
  handlers: logsHandlers({ [`GET /projects/${LOGS_PROJECT_ID}/wordpress/logs`]: { json: { data: null } } }),
  actions: openTab(1, waitNoData),
  probes: [...logsFrameProbes, logsPanelCardProbe, logsNoDataProbe, logsNoDataTitleProbe],
})

// Phase 9: the PHP tab (the info icon of the tab is not measured here: its tooltip needs a hover).
export const instanceLogsPhp: ParityState = logsState({
  id: 'instance-logs-php',
  actions: openTab(2, waitPre),
  probes: [...logsFrameProbes, logsPanelCardProbe, logsInfoRowProbe, logsDownloadProbe, logsPreProbe],
})

// Phase 10: the Webserver tab: the file select in the title row and the text of the first file.
export const instanceLogsWebserver: ParityState = logsState({
  id: 'instance-logs-webserver',
  actions: openTab(3, waitPre),
  probes: [...logsFrameProbes, logsFileSelectProbe, logsPanelCardProbe, logsInfoRowProbe, logsDownloadProbe, logsPreProbe],
})

// Phase 10: the first file is binary (`plain_text: false`): the Download state with its button instead of the text.
export const instanceLogsWebserverBinary: ParityState = logsState({
  id: 'instance-logs-webserver-binary',
  handlers: logsHandlers({
    [`GET /projects/${LOGS_PROJECT_ID}/webserver-logs`]: { json: { data: [{ name: 'access.log.1.gz', size: 104_857, plain_text: false }] } },
  }),
  actions: openTab(3, page => page.locator('.v-window-item--active .nodata-container .v-btn').first()),
  probes: [...logsFrameProbes, logsFileSelectProbe, logsPanelCardProbe, logsNoDataProbe, logsNoDataTitleProbe, logsNoDataButtonProbe],
})

// Phase 11: a custom project: the Deploy Logs tab (second) with the run select and the history of the last run.
const deployHandlers = (instance = logsCustomInstance) => logsHandlers({ ...deployHistoryHandlers(LOGS_PROJECT_ID, 31) }, instance)

export const instanceLogsDeploy: ParityState = logsState({
  id: 'instance-logs-deploy',
  handlers: deployHandlers(),
  actions: openTab(1, page => page.locator('.v-window-item--active .deploy-console').first()),
  probes: [...logsFrameProbes, logsFileSelectProbe, logsPanelCardProbe, logsDeployConsoleProbe],
})

// Phase 11: a custom project without a deploy yet: the empty state of the tab.
export const instanceLogsDeployEmpty: ParityState = logsState({
  id: 'instance-logs-deploy-empty',
  handlers: logsHandlers({ [`GET /projects/${LOGS_PROJECT_ID}/deploy-logs`]: { json: { data: [] } } }, logsCustomInstance),
  actions: openTab(1, waitNoData),
  probes: [...logsFrameProbes, logsPanelCardProbe, logsNoDataProbe, logsNoDataTitleProbe],
})

// Phase 11: no log privilege: no tab and no card, only the empty frame (legacy renders nothing, no redirect).
export const instanceLogsNoTabs: ParityState = logsState({
  id: 'instance-logs-no-tabs',
  handlers: logsHandlers({}, logsNoPrivilegesInstance),
  actions: { legacy: [waitFor(page => page.locator('.page-title').first())], next: [waitFor(page => page.locator('.page-title').first())] },
  probes: [{ key: 'logs-page-title', legacy: page => page.locator('.page-title').first(), next: page => page.locator('.page-title').first() }],
})

const states: ParityState[] = [
  instanceLogsDefault,
  instanceLogsHover,
  instanceLogsFocus,
  instanceLogsError,
  instanceLogsEmpty,
  instanceLogsSearchEmpty,
  instanceLogsLoading,
  instanceLogsWordpress,
  instanceLogsWordpressEmpty,
  instanceLogsPhp,
  instanceLogsWebserver,
  instanceLogsWebserverBinary,
  instanceLogsDeploy,
  instanceLogsDeployEmpty,
  instanceLogsNoTabs,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
