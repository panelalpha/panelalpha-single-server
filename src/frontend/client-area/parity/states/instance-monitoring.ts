import type { Handler, ParityState, Probe } from './state'
import type { Page } from '@playwright/test'
import { tr } from './auth'
import { dailyRecords, INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from './instance'
import { liteShellHome } from './instances'
import { liteAppUsers, liteAppUsersHandler } from './instances-lite'
import { shellHandlers } from './shell'

// S-87 ui-instance-monitoring: the Monitoring screen of a project on app-lite (`/projects/:id/monitoring`, `target: 'lite'`). Not a spec
// file (testMatch is `*.parity.ts`). Builder and states: `instance-monitoring.parity.ts`. Plan: context/changes/ui-instance-monitoring/plan.md.

/** The single-server `/home` with the report provider on: the Monitoring tab and its cards read `app.integrations.report_provider_enabled`. */
const liteHome = liteShellHome() as { app: Record<string, unknown> }
export const MONITORING_HOME: Record<string, unknown> = {
  ...liteHome,
  app: { ...liteHome.app, integrations: { report_provider_enabled: true } },
}

/** The `GET /projects/{id}/app-health` answer of a project that runs fine (legacy `apis/Instances.js:26-30`, as in the frame states). */
const APP_HEALTH_OK: Handler = {
  json: { data: { available: true, healthy: true, serving: 'ok', ports: [{ port: 8000, status: 'ok', http_code: 200, detail: 'HTTP 200' }], checks: [] } },
}

/** A `visits-by-*` body: `{ data: rows }`. The rows are the legacy shape of each breakdown (`label`, `visits`, and `code` / `country_code` for flags). */
const breakdown = (rows: Array<Record<string, string | number>>): Handler => ({ json: { data: rows } })

/** Visitors report of the week: 7 daily points and the totals the indicators show. */
const VISITORS_WEEK: Handler = {
  json: {
    data: {
      visits: { records: dailyRecords([12, 18, 9, 22, 15, 30, 27]), total: 133, previous_total: 110 },
      visits_length: { records: dailyRecords([120, 300, 90, 600, 240, 480, 360]), total: 2190, previous_total: 1800 },
    },
  },
}

/** The nine `visits-by-*` answers of the week (5+ rows each; `XX` is an unknown country, legacy shows its SVG flag). */
const BREAKDOWN_WEEK: Record<string, Handler> = {
  'page': breakdown([
    { label: '/', visits: 52 },
    { label: '/about', visits: 31 },
    { label: '/blog/hello-world', visits: 27 },
    { label: '/contact', visits: 14 },
    { label: '/shop', visits: 9 },
  ]),
  'country': breakdown([
    { label: 'Poland', visits: 80, code: 'PL' },
    { label: 'Germany', visits: 30, code: 'DE' },
    { label: 'United States', visits: 12, code: 'US' },
    { label: 'Unknown', visits: 6, code: 'XX' },
    { label: 'France', visits: 5, code: 'FR' },
  ]),
  'continent': breakdown([
    { label: 'Europe', visits: 110 },
    { label: 'North America', visits: 14 },
    { label: 'Asia', visits: 6 },
    { label: 'Africa', visits: 2 },
    { label: 'Oceania', visits: 1 },
  ]),
  'region': breakdown([
    { label: 'Mazovia', visits: 40, country_code: 'PL' },
    { label: 'Bavaria', visits: 18, country_code: 'DE' },
    { label: 'California', visits: 8, country_code: 'US' },
    { label: 'Ile-de-France', visits: 4, country_code: 'FR' },
    { label: 'Unknown', visits: 3, country_code: 'XX' },
  ]),
  'referrer': breakdown([
    { label: 'google.com', visits: 60 },
    { label: 'direct', visits: 35 },
    { label: 'facebook.com', visits: 12 },
    { label: 'bing.com', visits: 5 },
    { label: 'news.example.org', visits: 3 },
  ]),
  'device': breakdown([
    { label: 'Desktop', visits: 90 },
    { label: 'Mobile', visits: 40 },
    { label: 'Tablet', visits: 3 },
  ]),
  'device-brand': breakdown([
    { label: 'Apple', visits: 45 },
    { label: 'Samsung', visits: 22 },
    { label: 'Google', visits: 8 },
    { label: 'Huawei', visits: 3 },
    { label: 'Other', visits: 2 },
  ]),
  'device-os': breakdown([
    { label: 'Windows', visits: 60 },
    { label: 'Android', visits: 25 },
    { label: 'iOS', visits: 20 },
    { label: 'macOS', visits: 15 },
    { label: 'Linux', visits: 3 },
  ]),
  'device-browser': breakdown([
    { label: 'Chrome', visits: 70 },
    { label: 'Safari', visits: 30 },
    { label: 'Firefox', visits: 15 },
    { label: 'Edge', visits: 10 },
    { label: 'Samsung Internet', visits: 5 },
  ]),
}

/**
 * Handlers of the Monitoring page on lite: the frame's project GETs (as `instanceFrameLite`) plus the ten reporting calls of the week
 * (`visitors` and the nine `visits-by-*`). `overrides` replace any key, so a state changes one call without losing the rest.
 */
export function monitoringHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  // Phase 15 (month): the month's answers serve the same fixtures as the week's, so a period change draws data again (`month` state).
  const reporting: Record<string, Handler> = {
    'GET /projects/1/reporting/visitors/last-week': VISITORS_WEEK,
    'GET /projects/1/reporting/visitors/last-month': VISITORS_WEEK,
    ...Object.fromEntries(Object.entries(BREAKDOWN_WEEK).flatMap(([metric, handler]) => [
      [`GET /projects/1/reporting/visits-by-${metric}/last-week`, handler],
      [`GET /projects/1/reporting/visits-by-${metric}/last-month`, handler],
    ])),
  }
  return {
    ...shellHandlers([], 'projects'),
    'GET /projects/1': { json: { data: instancePageRaw(1, { type: 'custom', app_type: 'custom', privileges: INSTANCE_PAGE_PRIVILEGES }) } },
    'GET /projects/1/app-health': APP_HEALTH_OK,
    // Legacy `apis/Instances.js` `projectSource` (`/instances/{id}/source`, `.data.data`) runs on this page; the fixture has no `source`.
    'GET /projects/1/source': { json: { data: null } },
    'GET /projects/1/wordpress/maintenance-mode': { json: { status: false } },
    'GET /projects/1/wordpress/debug-mode': { json: { status: false } },
    'GET /projects/1/wordpress/automatic-backup': { json: { data: { enabled: false } } },
    'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
    ...liteAppUsersHandler(1, liteAppUsers),
    ...reporting,
    ...overrides,
  }
}

/**
 * Phase 11 (error): the `visits-by-page` call fails with 500. Legacy `MonitoringView.vue:181-183` and lite `Monitoring.vue:265-269` show an
 * alert for this call only; the other nine breakdowns and `visitors` swallow their error and hide the card, so the rest stays as default.
 */
export const monitoringPageError: Handler = { status: 500, json: { message: 'Server Error' } }

/**
 * Phase 12 (empty): the visitors call answers with no provider data (`{ data: [] }`, `ReportingController.php:90`). Legacy and lite
 * `Monitoring.vue` treat the empty dataset as `noData`: the nine cards are hidden and one `TableFullScreenMessage` card is shown instead.
 */
export const monitoringVisitorsEmpty: Handler = { json: { data: [] } }

/**
 * Phase 13 (loading): the ten reporting calls of the week stay pending, so the visits card shows its `ChartCardSkeleton` and the other
 * cards are not rendered (`v-if data.length > 0`, `MonitoringVisitorsCard.vue`). The page header and the period select are already there.
 */
export const monitoringHold: Record<string, Handler> = Object.fromEntries(
  [
    'GET /projects/1/reporting/visitors/last-week',
    ...Object.keys(BREAKDOWN_WEEK).map(metric => `GET /projects/1/reporting/visits-by-${metric}/last-week`),
  ].map(key => [key, 'hold' as const]),
)

/**
 * Phase 14 (period loading): the ten reporting calls of the month stay pending once the period select moves to last month. The week's
 * answers are still served until then, so the page first shows its data and then the skeletons over it (`MonitoringView.vue` `changePeriod`).
 */
export const monitoringHoldMonth: Record<string, Handler> = Object.fromEntries(
  [
    'GET /projects/1/reporting/visitors/last-month',
    ...Object.keys(BREAKDOWN_WEEK).map(metric => `GET /projects/1/reporting/visits-by-${metric}/last-month`),
  ].map(key => [key, 'hold' as const]),
)

/**
 * Phase 15 (partial): the visitors report and only the country and browser breakdowns have rows. The other seven answer an empty list,
 * so their cards are not rendered (`v-if` per card, `MonitoringView.vue`); the card order of the rest stays as default.
 */
export const monitoringPartial: Record<string, Handler> = Object.fromEntries(
  Object.keys(BREAKDOWN_WEEK)
    .filter(metric => metric !== 'country' && metric !== 'device-browser')
    .map(metric => [`GET /projects/1/reporting/visits-by-${metric}/last-week`, { json: { data: [] } } as Handler]),
)

// ---------------------------------------------------------------------------------------------
// Probes (plan "Overview"): the title is the readiness anchor, then the period select, the visits card and its legend, the first
// shares card, the doughnut and a pie card. Cards are found by their exact title copy (`Visits By Device` is a prefix of `… Device Brand`).
// ---------------------------------------------------------------------------------------------

function exactTitle (key: string): RegExp {
  const text = tr(key, 'lite').replace(/\{\{.*$/, '').trim()
  const escaped = text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  return new RegExp(String.raw`^\s*${escaped}\s*$`)
}

const card = (page: Page, titleKey: string) => page.locator('.monitoring-card', { has: page.locator('h6', { hasText: exactTitle(titleKey) }) }).first()

// The copy is `Project Analytics` on the lite page (the fixture's `Instance Analytics` is the app key), so the title is found by its class.
export const monitoringTitleProbe: Probe = {
  key: 'monitoring-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export const monitoringPeriodProbe: Probe = {
  key: 'period-select',
  legacy: page => page.locator('.page-title .v-select'),
  next: page => page.locator('.page-title .v-select'),
}

/**
 * Phase 8 (hover): the period select's state overlay. V2 paints the field hover on the `.v-input__slot` `::before`; V4 has the
 * `.v-field__overlay` element, so the probe reads the pseudo-element on legacy only (the same split as `buttonOverlayProbe`).
 */
export const monitoringPeriodOverlayProbe: Probe = {
  key: 'period-overlay',
  legacy: page => page.locator('.page-title .v-select .v-input__slot'),
  next: page => page.locator('.page-title .v-select .v-field__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

export const monitoringVisitsCardProbe: Probe = {
  key: 'visits-card',
  legacy: page => page.locator('.monitoring-card').first(),
  next: page => page.locator('.monitoring-card').first(),
}

export const monitoringLegendProbe: Probe = {
  key: 'visits-legend',
  legacy: page => page.locator('.monitoring-card').first().locator('.apexcharts-legend'),
  next: page => page.locator('.monitoring-card').first().locator('.apexcharts-legend'),
}

export const monitoringSharesProbe: Probe = {
  key: 'shares-first',
  legacy: page => page.locator('.monitoring-card', { has: page.locator('.item-list') }).first(),
  next: page => page.locator('.monitoring-card', { has: page.locator('.item-list') }).first(),
}

export const monitoringDoughnutProbe: Probe = {
  key: 'doughnut-device',
  legacy: page => card(page, 'heading.instance.monitoring.chart.visits.device'),
  next: page => card(page, 'heading.instance.monitoring.chart.visits.device'),
}

export const monitoringPieProbe: Probe = {
  key: 'pie-browser',
  legacy: page => card(page, 'heading.instance.monitoring.chart.visits.browser'),
  next: page => card(page, 'heading.instance.monitoring.chart.visits.browser'),
}

// Phase 12 (empty): the single `.monitoring-card` holds the shared `TableFullScreenMessage` (`.no-data`), with its illustration, title and description.
export const monitoringEmptyCardProbe: Probe = {
  key: 'empty-card',
  legacy: page => page.locator('.monitoring-card').first(),
  next: page => page.locator('.monitoring-card').first(),
}

export const monitoringEmptyTitleProbe: Probe = {
  key: 'empty-title',
  legacy: page => page.locator('.monitoring-card .no-data__title'),
  next: page => page.locator('.monitoring-card .no-data__title'),
}

export const monitoringEmptyDescProbe: Probe = {
  key: 'empty-description',
  legacy: page => page.locator('.monitoring-card .no-data__desc'),
  next: page => page.locator('.monitoring-card .no-data__desc'),
}

export const monitoringEmptyIllustrationProbe: Probe = {
  key: 'empty-illustration',
  legacy: page => page.locator('.monitoring-card .no-data__img svg'),
  next: page => page.locator('.monitoring-card .no-data__img svg'),
  internal: true,
}

export const monitoringProbes: Probe[] = [
  monitoringTitleProbe,
  monitoringPeriodProbe,
  monitoringVisitsCardProbe,
  monitoringLegendProbe,
  monitoringSharesProbe,
  monitoringDoughnutProbe,
  monitoringPieProbe,
]

// ---------------------------------------------------------------------------------------------
// Masks (plan "Overview", wzór `hosting-usage.parity.ts`): the chart SVG and the pie and doughnut drawings. The Apex legend lies inside
// `.apexcharts-canvas`, so the container is not masked: only the SVG of the visits chart and the `.chart` of pie and doughnut cards.
// ---------------------------------------------------------------------------------------------

export const monitoringMasks: NonNullable<ParityState['masks']> = {
  legacy: [
    page => page.locator('.monitoring-card').first().locator('svg.apexcharts-svg'),
    page => page.locator('.monitoring-card .chart'),
  ],
  next: [
    page => page.locator('.monitoring-card').first().locator('svg.apexcharts-svg'),
    page => page.locator('.monitoring-card .chart'),
  ],
}
