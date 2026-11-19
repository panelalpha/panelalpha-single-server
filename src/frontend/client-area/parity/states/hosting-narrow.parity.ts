import type { ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { emailDomainsBody } from './email-forwarders'
import {
  dnsEmailService,
  hostingState,
  instancesBody,
  summaryChipProbe,
  summaryInstancesCardProbe,
  summaryNsCardProbe,
  summaryPlanProbe,
  summaryRightColumnProbe,
  summaryRowProbe,
  summarySsoProbe,
  summaryTitleProbe,
  threeInstances,
  usageMixed,
} from './hosting'

// Band 1200-1399 px: the sidebar is capped at 163px and the plan tiles stack in a column. The project
// `light-narrow-desktop` (1300x900) runs only this spec (`playwright.config.ts`, `write-report.ts` `variantsFor`).

export const hostingSummaryNarrowDesktop: ParityState = {
  id: 'hosting-summary-narrow-desktop',
  ...hostingState({
    lite: 'multi',
    usage: { json: usageMixed },
    instances: { json: instancesBody(threeInstances) },
    ready: { legacy: summaryRowProbe.legacy, next: summaryRowProbe.next },
    probes: [
      summaryTitleProbe,
      summarySsoProbe,
      summaryRightColumnProbe,
      summaryPlanProbe('card'),
      summaryNsCardProbe,
      summaryInstancesCardProbe,
      summaryChipProbe,
      summaryRowProbe,
    ],
  }),
}

test(`${hostingSummaryNarrowDesktop.id} legacy vs next`, async ({ browser }, testInfo) => {
  await runState(browser, testInfo, hostingSummaryNarrowDesktop)
})

// ---------------------------------------------------------------------------------------------
// S-113 (phase 14): the Usage page on app-lite in the same band. The sidebar list is capped at 163px (`sticky-sidebar__item--narrow`
// in the next kit, `:style` `max-width: 163px` below 1400 px in legacy). Own helpers: `hosting-usage.parity.ts` registers its tests
// on import, which this project would then run too.
// ---------------------------------------------------------------------------------------------

const narrowSidebarItemProbe: Probe = {
  key: 'sidebar-item-narrow',
  legacy: page => page.locator('.v-main .sticky-sidebar .sticky-sidebar__item').first(),
  next: page => page.getByTestId('hosting-sidebar').locator('.sticky-sidebar__item').first(),
}

const narrowGraphsPanel = (page: Page) => page.locator('.v-main .manage-panel:not(.mb-6)')

/** Both apps draw the chart once the first response is in (`waitForChart` in `hosting-usage.parity.ts`). */
const narrowWaitForChart: StateAction = async page => {
  try {
    await page.locator('.apexcharts-canvas').first().waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    // the chart probes and the pixel diff report what is not there
  }
}

const NARROW_CHART_KEYS = ['cpu-percent', 'disk-throughput', 'disk-iops', 'network-traffic', 'network-pps']

// usage-redesign: single-server next has no sidebar for a service without DNS and e-mail, so this state uses one with both and the
// narrow sidebar is still measured (legacy always has the sidebar).
export const hostingUsageNarrowDesktop: ParityState = {
  id: 'hosting-usage-narrow-desktop',
  ...hostingState({
    lite: true,
    path: '/hosting/usage',
    services: [dnsEmailService],
    emailDomains: { json: emailDomainsBody([]) },
    metrics: {},
    masks: {
      legacy: [
        page => narrowGraphsPanel(page).locator('.v-window-item--active'),
        page => narrowGraphsPanel(page).locator('.manage-panel__header-actions .v-progress-circular'),
      ],
      next: [
        ...NARROW_CHART_KEYS.map(key => (page: Page) => page.getByTestId(`graphs-chart-${key}`)),
        page => page.getByTestId('graphs-live-note'),
      ],
    },
    legacy: [narrowWaitForChart],
    next: [narrowWaitForChart],
    probes: [narrowSidebarItemProbe],
  }),
}

test(`${hostingUsageNarrowDesktop.id} legacy vs next`, async ({ browser }, testInfo) => {
  await runState(browser, testInfo, { target: 'lite', ...hostingUsageNarrowDesktop })
})
