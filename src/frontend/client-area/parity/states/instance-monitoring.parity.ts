import type { ParityState, StateAction } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { trPattern } from './auth'
import { waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { MONITORING_HOME, monitoringEmptyCardProbe, monitoringEmptyDescProbe, monitoringEmptyIllustrationProbe, monitoringEmptyTitleProbe, monitoringHandlers, monitoringHold, monitoringHoldMonth, monitoringLegendProbe, monitoringMasks, monitoringPageError, monitoringPartial, monitoringPeriodOverlayProbe, monitoringPeriodProbe, monitoringPieProbe, monitoringProbes, monitoringSharesProbe, monitoringTitleProbe, monitoringVisitorsEmpty, monitoringVisitsCardProbe } from './instance-monitoring'
import { NOW } from './shell'

// S-87 ui-instance-monitoring: the Monitoring screen of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a
// literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-monitoring.ts`.
// Plan: context/changes/ui-instance-monitoring/plan.md ("Stany parity").

/** Both apps draw the visits chart once the reports are in; the state is captured after that (the readiness anchor is the title probe). */
const waitForCharts = {
  legacy: [waitFor(page => page.locator('.monitoring-card .apexcharts-canvas'))],
  next: [waitFor(page => page.locator('.monitoring-card .apexcharts-canvas'))],
}

// Phase 7: the default state, a week of data on every card.
export const instanceMonitoringDefault: ParityState = {
  id: 'instance-monitoring-default',
  target: 'lite',
  path: '/projects/1/monitoring',
  signedIn: true,
  clock: NOW,
  home: MONITORING_HOME,
  handlers: monitoringHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCharts,
  probes: monitoringProbes,
  masks: monitoringMasks,
}

// Phase 8: the pointer rests on the period select (the only control of the page; its tooltip is inside the chart and masked). The
// overlay probe reads the field's hover layer, and the pointer is checked to still be there after the capture.
const periodHover: StateAction = async page => {
  await page.locator('.page-title .v-select').hover()
}
const periodStillHovered: StateAction = async page => {
  expect(await page.locator('.page-title .v-select').evaluate(element => element.matches(':hover')), 'pointer on the period select').toBe(true)
}

export const instanceMonitoringHover: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-hover',
  pointer: 'keep',
  actions: {
    legacy: [...instanceMonitoringDefault.actions.legacy, periodHover],
    next: [...instanceMonitoringDefault.actions.next, periodHover],
  },
  probes: [...instanceMonitoringDefault.probes, monitoringPeriodOverlayProbe],
  afterCapture: { legacy: [periodStillHovered], next: [periodStillHovered] },
}

// Phase 9: keyboard focus on the period select, reached with real Tab presses from the page start (as `tabFocus` in instance-frame.parity.ts:1412).
// The pointer is moved away first, so only the keyboard drives the focus. The focus ring is read from the field's overlay probe.
// The select has no accessible name in either app (legacy `Monitoring.vue` and next `MonitoringView.vue` set no label), so no name
// lookup is asserted here; the gap is written up in plan.md `## Notes` (decision deferred), not fixed in the view.
const periodTabFocus: StateAction = async page => {
  await page.mouse.move(0, 0)
  const period = page.locator('.page-title .v-select')
  for (let press = 0; press < 60; press += 1) {
    await page.keyboard.press('Tab')
    if (await period.evaluate(element => element.matches(':focus-within'))) {
      return
    }
  }
  throw new Error('Tab did not reach the period select')
}
const periodFocusVisible: StateAction = async page => {
  const visible = await page.locator('.page-title .v-select').evaluate(element => element.matches(':focus-within') && element.querySelector(':focus-visible') !== null)
  expect(visible, 'keyboard focus on the period select').toBe(true)
}

export const instanceMonitoringFocus: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-focus',
  pointer: 'keep',
  actions: {
    legacy: [...instanceMonitoringDefault.actions.legacy, periodTabFocus],
    next: [...instanceMonitoringDefault.actions.next, periodTabFocus],
  },
  probes: [...instanceMonitoringDefault.probes, monitoringPeriodOverlayProbe],
  afterCapture: { legacy: [periodFocusVisible], next: [periodFocusVisible] },
}

// Phase 11: the `visits-by-page` call answers 500, so the page card is replaced by its alert; the other cards keep their default data.
export const instanceMonitoringError: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-error',
  handlers: monitoringHandlers({ 'GET /projects/1/reporting/visits-by-page/last-week': monitoringPageError }),
}

// Phase 12: the visitors call answers with no data, so both apps show the empty card instead of the charts. There is no canvas to wait for, so the
// readiness anchor is the card's title. The nine cards are not rendered, so the chart probes are replaced by the empty-card probes.
const waitForEmptyTitle = {
  legacy: [waitFor(page => page.locator('.monitoring-card .no-data__title'))],
  next: [waitFor(page => page.locator('.monitoring-card .no-data__title'))],
}

export const instanceMonitoringEmpty: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-empty',
  handlers: monitoringHandlers({ 'GET /projects/1/reporting/visitors/last-week': monitoringVisitorsEmpty }),
  actions: waitForEmptyTitle,
  probes: [monitoringTitleProbe, monitoringEmptyCardProbe, monitoringEmptyTitleProbe, monitoringEmptyDescProbe, monitoringEmptyIllustrationProbe],
}

// Phase 13: all ten reporting calls hang, so the visits card holds its skeleton (`ChartCardSkeleton`) and the other cards are not rendered.
// The readiness anchor is the skeleton. The skeleton's animation is not masked here: whether it needs a mask (as `nsSpinnerMasks`,
// `hosting.ts`) is decided from the first parity measurement, not in advance.
const waitForSkeleton = {
  legacy: [waitFor(page => page.locator('.monitoring-card .v-skeleton-loader'))],
  next: [waitFor(page => page.locator('.monitoring-card .v-skeleton-loader'))],
}

export const instanceMonitoringLoading: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-loading',
  handlers: monitoringHandlers(monitoringHold),
  actions: waitForSkeleton,
  probes: [monitoringTitleProbe, monitoringPeriodProbe, monitoringVisitsCardProbe],
}

// Phase 14: the period select moves to last month while the week's data is on the page. The month calls hang, so every card shows its
// skeleton over the old data. The driver freezes the clock at NOW before `goto`, and a Vue 3 `@click` is skipped when its event is not
// later than the element's mount (lessons.md, the `_vts` note), so the clock moves on before the clicks. The readiness anchor is a skeleton.
const choosePeriodLastMonth: StateAction = async page => {
  await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
  await page.locator('.page-title .v-select').click()
  await page.locator('.v-list-item', { hasText: trPattern('form.option.period.lastMonth', 'lite') }).first().click()
}
// The select shows the picked period's label once the change is applied (the anchor of `instanceMonitoringMonth`).
const waitForMonthPeriod = waitFor(page => page.locator('.page-title .v-select', { hasText: trPattern('form.option.period.lastMonth', 'lite') }))
// The opened select scrolls the page differently in the two apps (as `instanceGeneralAnalyticsMonth`, instance-frame.parity.ts).
const scrollToTop: StateAction = async page => {
  await page.evaluate(() => window.scrollTo(0, 0))
}

export const instanceMonitoringPeriodLoading: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-period-loading',
  handlers: monitoringHandlers(monitoringHoldMonth),
  actions: {
    legacy: [...waitForCharts.legacy, choosePeriodLastMonth, waitForSkeleton.legacy[0], scrollToTop],
    next: [...waitForCharts.next, choosePeriodLastMonth, waitForSkeleton.next[0], scrollToTop],
  },
  probes: [monitoringTitleProbe, monitoringPeriodProbe, monitoringVisitsCardProbe],
}

// Phase 15 (month): the period changes to last month with data on the page. The month answers are served at once, so the anchor is the
// select showing the new period (the picked value) and then the chart canvas; the shares and pies redraw from the month's answers.
export const instanceMonitoringMonth: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-month',
  actions: {
    legacy: [...waitForCharts.legacy, choosePeriodLastMonth, waitForMonthPeriod, ...waitForCharts.legacy, scrollToTop],
    next: [...waitForCharts.next, choosePeriodLastMonth, waitForMonthPeriod, ...waitForCharts.next, scrollToTop],
  },
}

// Phase 15 (partial): the visitors report and the country and browser breakdowns have data; the other seven cards are not rendered.
// The doughnut probe is dropped (the device card is absent) and the pie probe is the browser card, as in the default state.
export const instanceMonitoringPartial: ParityState = {
  ...instanceMonitoringDefault,
  id: 'instance-monitoring-partial',
  handlers: monitoringHandlers(monitoringPartial),
  probes: [monitoringTitleProbe, monitoringPeriodProbe, monitoringVisitsCardProbe, monitoringLegendProbe, monitoringSharesProbe, monitoringPieProbe],
}

const states: ParityState[] = [instanceMonitoringDefault, instanceMonitoringHover, instanceMonitoringFocus, instanceMonitoringError, instanceMonitoringEmpty, instanceMonitoringLoading, instanceMonitoringPeriodLoading, instanceMonitoringMonth, instanceMonitoringPartial]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
