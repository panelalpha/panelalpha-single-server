import type { ParityState, StateAction } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { waitFor } from './hosting'
import { resellerLogRows, resellerLogsDateTooltipState, resellerLogsEmptyState, resellerLogsErrorState, resellerLogsLoadingState, resellerLogsPage, resellerLogsPagerNextProbe, resellerLogsPagerPrevProbe, resellerLogsPerPageActiveProbe, resellerLogsProjectFocusProbe, resellerLogsProjectHoverProbe, resellerLogsProjectProbe, resellerLogsSearchEmptyState, resellerLogsSortArrowProbe, resellerLogsSortItemHoverProbe, resellerLogsState, sortDateHeader } from './reseller-logs'
import { focusButton, hovered } from './sftp'
import { NOW } from './shell'

// S-125 ui-reseller-logs, measured on app-lite (`target: 'lite'`, M-2 default): the Reseller Area frame and the Logs page.
// Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Builder and probes: `reseller-logs.ts`. Plan: context/changes/ui-reseller-logs/plan.md.

// Phase 5: the default state, the frame and the first page of the logs (ten rows, date descending, three pages).
export const resellerLogsDefault: ParityState = {
  id: 'reseller-logs-default',
  ...resellerLogsState(),
}

// Phase 6: hover of the first row's project link (every variant: the link is in the mobile card too).
const resellerLogsHoverBase: ParityState = {
  id: 'reseller-logs-hover',
  ...resellerLogsState(),
}

export const resellerLogsHover: ParityState = hovered(resellerLogsHoverBase, { legacy: resellerLogsProjectProbe.legacy, next: resellerLogsProjectProbe.next }, [
  resellerLogsProjectHoverProbe,
])

// Phase 6: hover of the Date sort header (desktop only: the mobile cards have no sort row, so `light-mobile` is skipped).
const resellerLogsSortHoverBase: ParityState = {
  id: 'reseller-logs-sort-hover',
  ...resellerLogsState(),
}

export const resellerLogsSortHover: ParityState = hovered(resellerLogsSortHoverBase, { legacy: resellerLogsSortItemHoverProbe.legacy, next: resellerLogsSortItemHoverProbe.next }, [
  resellerLogsSortItemHoverProbe,
])

// Phase 7: hover of the first row's date, the tooltip with `YYYY-MM-DD HH:mm`. Desktop and mobile: the mobile card shows the date too.
export const resellerLogsDateTooltip: ParityState = {
  id: 'reseller-logs-date-tooltip',
  ...resellerLogsDateTooltipState(),
}

// Phase 8: keyboard focus on the first row's project link, `focusButton` (sftp.ts: Shift, `focus()`, `:focus-visible` asserted; no Tab).
// Every variant has the link (the mobile card too). The per-page button is a separate focus case (see change.md Notes), not in this state.
const resellerLogsFocusBase: ParityState = {
  id: 'reseller-logs-focus',
  ...resellerLogsState(),
}

export const resellerLogsFocus: ParityState = {
  ...resellerLogsFocusBase,
  pointer: 'keep',
  actions: {
    legacy: [...resellerLogsFocusBase.actions.legacy, focusButton(resellerLogsProjectProbe.legacy)],
    next: [...resellerLogsFocusBase.actions.next, focusButton(resellerLogsProjectProbe.next)],
  },
  probes: [...resellerLogsFocusBase.probes, resellerLogsProjectFocusProbe],
}

// Phase 9: one page only (ten rows, total 10, 50 per page), so both arrows are disabled (LITE `LogsTable.vue:173-182`, the only disabled
// state of the page). The footer stays visible with one page. The disabled check runs before the probes measure the arrows,
// so a wrong fixture fails here and not as a pixel delta.
function expectPagerDisabled (side: 'legacy' | 'next'): StateAction {
  return async page => {
    await expect(resellerLogsPagerPrevProbe[side](page), 'previous page disabled on the only page').toBeDisabled()
    await expect(resellerLogsPagerNextProbe[side](page), 'next page disabled on the only page').toBeDisabled()
  }
}

export const resellerLogsLastPage: ParityState = {
  id: 'reseller-logs-last-page',
  ...resellerLogsState({
    handlers: { 'GET /reseller/instances-logs': resellerLogsPage(resellerLogRows(), 10) },
    legacy: [expectPagerDisabled('legacy')],
    next: [expectPagerDisabled('next')],
    probes: [resellerLogsPagerPrevProbe, resellerLogsPagerNextProbe],
  }),
}

// Phase 10: the logs endpoint answers 500: the empty copy and the error alert (hovered, so its timer stops). See `resellerLogsErrorState`.
export const resellerLogsError: ParityState = {
  id: 'reseller-logs-error',
  ...resellerLogsErrorState(),
}

// Phase 11: no rows at all: the no-data block with its illustration, title and description (no sort header, no footer).
export const resellerLogsEmpty: ParityState = {
  id: 'reseller-logs-empty',
  ...resellerLogsEmptyState(),
}

// Legacy debounces the search with lodash, which reads `Date.now()`: under the fixed clock no time passes and the term never goes out, so the
// clock moves on after the typing, when the debounce timer is armed (same as `instance-logs.parity.ts`).
const searchNothing: StateAction = async page => {
  await waitFor(page => page.locator('.logs-table__instance').first())(page)
  await page.locator('.page-title__filter-controls input').first().pressSequentially('zzz', { delay: 60 })
  await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
  await waitFor(page => page.locator('.no-results-container .v-btn').first())(page)
}

// Phase 11: a search that finds nothing: the no-results container with the clear button (the term is typed, then the clock moves on).
export const resellerLogsSearchEmpty: ParityState = {
  id: 'reseller-logs-search-empty',
  ...resellerLogsSearchEmptyState({ legacy: [searchNothing], next: [searchNothing] }),
}

// Phase 12: the logs request hangs: the table skeleton (desktop rows, mobile cards), the animated bones masked. See `resellerLogsLoadingState`.
export const resellerLogsLoading: ParityState = {
  id: 'reseller-logs-loading',
  ...resellerLogsLoadingState(),
}

// Phase 13: a click on the Date header turns the order (legacy `toggleSort`: desc to asc). The server sorts (`sort_dir` in the request),
// so the fixture answers the rows reversed for `sort_dir=asc`. The pointer leaves the header after the answer, so its hover colour stays out.
// Both sides wait for the answer with `sort_dir=asc` before the capture.
const sortByDate: StateAction = async page => {
  await page.mouse.move(0, 0)
  const answered = page.waitForResponse(response => response.url().includes('sort_dir=asc'))
  await sortDateHeader(page).click()
  await answered
  await page.mouse.move(0, 0)
}

export const resellerLogsSorted: ParityState = {
  id: 'reseller-logs-sorted',
  ...resellerLogsState({
    handlers: {
      'GET /reseller/instances-logs': ({ query }) => resellerLogsPage(query.get('sort_dir') === 'asc' ? resellerLogRows().toReversed() : resellerLogRows(), 120),
    },
    legacy: [sortByDate],
    next: [sortByDate],
    probes: [resellerLogsSortArrowProbe],
  }),
}

// Phase 13: the size switch in the footer, 20 instead of the default 50 (legacy `options.itemsPerPage`, a new request with `per_page=20` and
// page 1). The answer keeps the ten rows and the total of 120, so the footer shows six pages. The pointer leaves the button after the answer.
const perPageTwenty: StateAction = async page => {
  await page.mouse.move(0, 0)
  const answered = page.waitForResponse(response => response.url().includes('per_page=20'))
  await page.locator('.data-iterator-page-number .v-btn').filter({ hasText: '20' }).first().click()
  await answered
  await page.mouse.move(0, 0)
}

export const resellerLogsPerPage: ParityState = {
  id: 'reseller-logs-per-page',
  ...resellerLogsState({
    legacy: [perPageTwenty],
    next: [perPageTwenty],
    probes: [resellerLogsPerPageActiveProbe],
  }),
}

const states: ParityState[] = [
  resellerLogsDefault,
  resellerLogsHover,
  resellerLogsSortHover,
  resellerLogsDateTooltip,
  resellerLogsFocus,
  resellerLogsLastPage,
  resellerLogsError,
  resellerLogsEmpty,
  resellerLogsSearchEmpty,
  resellerLogsLoading,
  resellerLogsSorted,
  resellerLogsPerPage,
]

/** Variants a state cannot be reached in: the mobile cards have no sort row, and the mobile footer has no size switch. */
const notInVariant: Record<string, string[]> = {
  [resellerLogsSortHover.id]: ['light-mobile'],
  [resellerLogsSorted.id]: ['light-mobile'],
  [resellerLogsPerPage.id]: ['light-mobile'],
}

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(notInVariant[state.id]?.includes(testInfo.project.name) ?? false, 'the mobile cards have no sort row')
    await runState(browser, testInfo, state)
  })
}
