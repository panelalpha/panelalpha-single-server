import type { ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { settled, tr } from './auth'
import { emailDomainsBody } from './email-forwarders'
import { alertManagerProbe, dnsEmailService, hostingService, hostingState, hostingTitleProbe, metricsPeriodBody, serverAccount, whenVisible } from './hosting'
import { openLegacyMenu, whenPresent } from './shell'

// S-31 hosting-usage: `/hosting/usage` (single-server only), measured on the app-lite legacy (`target: 'lite'`). The page is identical in
// app and app-lite, but it exists only with single server, so the lite deploy is the one that can render it (AGENTS.md, target lite).
// Builder and fixtures: `hosting.ts` (`lite`, `metrics`). Each state id is a literal `id: '…',` line, which `registeredStates` in
// report/write-report.ts reads as text. Plan: context/changes/hosting-usage/plan.md ("Stany parity").
// usage-redesign (2026-11-17): the body of Usage and the frame of single-server next differ from legacy on purpose (mockup D, no sidebar
// without DNS or e-mail). The probes measure what is still comparable (frame, title, divider, admin button, period select, alerts); the
// redesigned body is covered by pixel exceptions, and the chart areas and the live note are masked in next.

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/{Usage,UsageCard,GraphsCard}.vue)
// ---------------------------------------------------------------------------------------------

const usagePanel = (page: Page) => page.locator('.v-main .manage-panel.mb-6')
const graphsPanel = (page: Page) => page.locator('.v-main .manage-panel:not(.mb-6)')

const usageAdminButtonProbe: Probe = {
  key: 'usage-admin-button',
  legacy: page => page.locator('.v-main .title-row .v-btn'),
  next: page => page.getByTestId('usage-admin-button'),
}

/** The readiness anchor of the page body (not a probe: the body is redesigned, so its box is not compared). */
const usageReady: Pick<Probe, 'legacy' | 'next'> = {
  legacy: usagePanel,
  next: page => page.getByTestId('usage-card'),
}

const graphsPeriodProbe: Probe = {
  key: 'graphs-period',
  legacy: page => graphsPanel(page).locator('.v-select .v-input__slot'),
  next: page => page.getByTestId('graphs-period').locator('.v-field'),
  part: 'box',
  internal: true,
}

/** Both apps draw the chart once the first response is in; a state is captured only after that. */
const waitForChart: StateAction = async page => {
  try {
    await page.locator('.apexcharts-canvas').first().waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    // the chart probes and the pixel diff report what is not there
  }
}

const cardProbes: Probe[] = [usageAdminButtonProbe, graphsPeriodProbe]

// ---------------------------------------------------------------------------------------------
// Masks: the charts and the Live note (next), the chart, the Live counter and the fetching spinner (legacy) change in time
// ---------------------------------------------------------------------------------------------

const CHART_KEYS = ['cpu-percent', 'disk-throughput', 'disk-iops', 'network-traffic', 'network-pps']

const chartMasks: NonNullable<ParityState['masks']> = {
  legacy: [
    page => graphsPanel(page).locator('.v-window-item--active'),
    page => graphsPanel(page).locator('.manage-panel__header-actions .v-progress-circular'),
  ],
  next: [
    ...CHART_KEYS.map(key => (page: Page) => page.getByTestId(`graphs-chart-${key}`)),
    page => page.getByTestId('graphs-live-note'),
  ],
}

/**
 * Next raises an alert for every failed request, legacy none (it calls `Api.parseErrorMessage`, which does not exist). The stack
 * changes while Live keeps requesting (an alert closes after 5 s), so next hides it: a mask would paint a box legacy does not have.
 * The `alerts` probe still reports the difference (a proposed exception) and Vitest covers the alert itself.
 */
const hideAlerts: StateAction = async page => {
  await page.addStyleTag({ content: '[data-testid="shell-alert-manager"] { display: none !important; }' })
}

const base = {
  lite: true,
  path: '/hosting/usage',
  ready: usageReady,
} as const

// ---------------------------------------------------------------------------------------------
// Phase 1: chrome (both requests held, both failing)
// ---------------------------------------------------------------------------------------------

// `hosting-usage-loading` and `hosting-usage-frame-loading` differ from legacy on purpose (decision of the user 2026-11-03, AGENTS.md
// rule 1, "skeletony Usage w My server"): next shows the ring and chart skeletons while GET /services is held. Since usage-redesign (D3)
// it shows them with no sidebar (the sidebar needs a service), where legacy keeps its frame: a recorded exception.

export const hostingUsageLoading: ParityState = {
  id: 'hosting-usage-loading',
  ...hostingState({
    ...base,
    metrics: { current: 'hold', periods: { 'last-5-minutes': 'hold' } },
    masks: chartMasks,
    probes: [...cardProbes, alertManagerProbe],
  }),
}

export const hostingUsageError: ParityState = {
  id: 'hosting-usage-error',
  ...hostingState({
    ...base,
    metrics: {
      current: { status: 500, json: { message: 'Server Error' } },
      periods: { 'last-5-minutes': { status: 500, json: { message: 'Server Error' } } },
    },
    masks: chartMasks,
    next: [hideAlerts],
    probes: [...cardProbes, alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 11: `GET /services` fails, so the frame has no service: title and alert only (no sidebar page, no Usage card)
// ---------------------------------------------------------------------------------------------

export const hostingUsageServicesError: ParityState = {
  id: 'hosting-usage-services-error',
  ...hostingState({
    lite: true,
    path: '/hosting/usage',
    ready: hostingTitleProbe,
    handlers: { 'GET /services': { status: 500, json: { message: 'Server Error' } } },
    probes: [alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 13: `GET /services` held: the frame has the title and the divider only (no sidebar, no page), as legacy `serviceLoading`
// ---------------------------------------------------------------------------------------------

const frameContainerProbe: Probe = {
  key: 'frame-divider',
  legacy: page => page.locator('.v-main__wrap > div:has(.top-title) > .v-divider'),
  next: page => page.locator('.page-frame > .v-divider'),
  internal: true,
}

export const hostingUsageFrameLoading: ParityState = {
  id: 'hosting-usage-frame-loading',
  ...hostingState({
    lite: true,
    path: '/hosting/usage',
    ready: hostingTitleProbe,
    handlers: { 'GET /services': 'hold' },
    // Next renders Usage while the list is held (decision of the user 2026-11-03), so its metrics are held too; legacy never asks.
    metrics: { current: 'hold', periods: { 'last-5-minutes': 'hold' } },
    probes: [alertManagerProbe, frameContainerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 12: the only service is `suspended`: the suspended card (Upgrade and Support) replaces the frame (`NoAvailableHostingView`)
// ---------------------------------------------------------------------------------------------

export const hostingUsageSuspended: ParityState = {
  id: 'hosting-usage-suspended',
  ...hostingState({
    lite: true,
    path: '/hosting/usage',
    services: [hostingService({ status: 'suspended' })],
    home: { app: { support_link: 'https://example.com/support' } },
    frame: false,
    ready: hostingTitleProbe,
    probes: [
      {
        key: 'suspended-card',
        legacy: page => page.locator('.v-main .intro-page'),
        next: page => page.getByTestId('hosting-suspended-card'),
      },
      {
        key: 'suspended-illustration',
        legacy: page => page.locator('.v-main .intro-page__illustration'),
        next: page => page.getByTestId('hosting-suspended-card').locator('.intro-page__illustration'),
      },
      {
        key: 'suspended-upgrade',
        legacy: page => page.getByRole('link', { name: tr('general.upgradePlan', 'lite') }),
        next: page => page.getByTestId('hosting-suspended-upgrade'),
      },
      {
        key: 'suspended-support',
        legacy: page => page.getByRole('link', { name: tr('general.contactSupport', 'lite') }),
        next: page => page.getByTestId('hosting-suspended-support'),
      },
    ],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 2: rings with data, CPU chart in Live
// ---------------------------------------------------------------------------------------------

export const hostingUsage: ParityState = {
  id: 'hosting-usage',
  ...hostingState({
    ...base,
    metrics: {},
    masks: chartMasks,
    legacy: [waitForChart],
    next: [waitForChart],
    probes: cardProbes,
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 8: default with the "Full server management" button (Free panel fixture hides it)
// ---------------------------------------------------------------------------------------------

export const hostingUsageAdmin: ParityState = {
  id: 'hosting-usage-admin',
  ...hostingState({
    ...base,
    home: { app: { community_panel: false }, user: { is_ss_default: true } },
    metrics: {},
    masks: chartMasks,
    legacy: [waitForChart],
    next: [waitForChart],
    probes: cardProbes,
  }),
}

export const hostingUsageNoAdmin: ParityState = {
  id: 'hosting-usage-no-admin',
  ...hostingState({
    ...base,
    home: { user: { is_ss_default: false } },
    metrics: {},
    masks: chartMasks,
    legacy: [waitForChart],
    next: [waitForChart],
    probes: cardProbes.filter(probe => probe !== usageAdminButtonProbe),
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 3: empty buckets (the four other graphs are part of `hosting-usage` now: the grid shows all five)
// ---------------------------------------------------------------------------------------------

export const hostingUsageNoData: ParityState = {
  id: 'hosting-usage-no-data',
  ...hostingState({
    ...base,
    metrics: { periods: { 'last-5-minutes': { json: metricsPeriodBody('last-5-minutes', { gaps: 3 }) } } },
    masks: chartMasks,
    legacy: [waitForChart],
    next: [waitForChart],
    probes: cardProbes,
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 4: period selector
// ---------------------------------------------------------------------------------------------

const legacyPeriodSelect = (page: Page) => graphsPanel(page).locator('.v-select')
const nextPeriodSelect = (page: Page) => page.getByTestId('graphs-period').locator('.v-field')
const legacyMenu = (page: Page) => page.locator('.menuable__content__active')
const nextMenu = (page: Page) => page.locator('.v-overlay--active .v-overlay__content')

const periodMenuProbe: Probe = { key: 'period-menu', legacy: legacyMenu, next: nextMenu }

export const hostingUsagePeriodOpen: ParityState = {
  id: 'hosting-usage-period-open',
  ...hostingState({
    ...base,
    metrics: {},
    masks: chartMasks,
    pointer: 'keep',
    legacy: [waitForChart, openLegacyMenu(legacyPeriodSelect)],
    next: [waitForChart, async page => {
      const selector = nextPeriodSelect(page)
      await whenVisible(selector, async () => {
        await selector.click()
        await settled(nextMenu(page))
        // V4's select closes its menu on the list's `blur`, which the full-page screenshot's resize triggers; legacy's does not.
        await page.evaluate(() => {
          for (const type of ['blur', 'focusout']) {
            window.addEventListener(type, event => event.stopImmediatePropagation(), true)
          }
        })
      })
    }],
    probes: [...cardProbes, periodMenuProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 9: hover on the Usage item of the sidebar in legacy (desktop list item; below 1200 px the tab), on the CPU chart in next
// ---------------------------------------------------------------------------------------------

/** Below 1200 px the sidebar is the plan selector and the tabs (`HostingPagesSidebar.vue`), so the viewport picks the item. */
const narrowSidebar = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1200

function usageItemLegacy (page: Page) {
  return narrowSidebar(page)
    ? page.locator('.v-main .sticky-sidebar .v-tab--active')
    : page.locator('.v-main .sticky-sidebar .v-list-item--active')
}

const usageItemHoverLegacy: StateAction = async page => {
  await usageItemLegacy(page).hover()
}

/** Next has no sidebar item on the lite fixture (usage-redesign): the hover goes to the CPU chart, the first element of the new body. */
const cpuChartNext = (page: Page) => page.getByTestId('graphs-chart-cpu-percent')

const usageItemHoverNext: StateAction = async page => {
  await cpuChartNext(page).hover()
}

// The pointer must still rest on the item after the capture (the scroll reset before the probes can move it away), as in `buttonHoverState`.
const usageItemStillHoveredLegacy: StateAction = async page => {
  expect(await usageItemLegacy(page).evaluate(element => element.matches(':hover')), 'pointer on the Usage sidebar item').toBe(true)
}

const cpuChartStillHoveredNext: StateAction = async page => {
  expect(await cpuChartNext(page).evaluate(element => element.matches(':hover')), 'pointer on the CPU chart').toBe(true)
}

export const hostingUsageHover: ParityState = {
  ...hostingUsageAdmin,
  id: 'hosting-usage-hover',
  pointer: 'keep',
  actions: {
    legacy: [...hostingUsageAdmin.actions.legacy, usageItemHoverLegacy],
    next: [...hostingUsageAdmin.actions.next, usageItemHoverNext],
  },
  // The sidebar item overlay probe is gone: next has no sidebar item here, so the probe would only report `missing`.
  probes: hostingUsageAdmin.probes,
  afterCapture: {
    legacy: [...(hostingUsageAdmin.afterCapture?.legacy ?? []), usageItemStillHoveredLegacy],
    next: [...(hostingUsageAdmin.afterCapture?.next ?? []), cpuChartStillHoveredNext],
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 10: keyboard focus on the Usage item (`focus-visible`), reached with real Tab presses from the page start
// ---------------------------------------------------------------------------------------------

// Both apps use the same sidebar item (desktop list item, below 1200 px the tab), so the press count is measured per side and width.
// usage-redesign: the lite fixture has no sidebar in next, so next focuses the admin button of the frame head (the first stop of the new
// body; the state has the admin button). It sits where the sidebar item was: after logo, tabs, Add new, bell, avatar and the Admin Area button.
// The navbar is one Tab stop for its tabs in next (roving tabindex), so dropping the "My Server" tab does not change the count.
const USAGE_FOCUS_PRESSES = {
  legacy: { 1440: 22, 375: 22 },
  next: { 1440: 7, 375: 7 },
} as Record<'legacy' | 'next', Record<number, number>>

const usageAdminButtonNext = (page: Page) => page.getByTestId('usage-admin-button')

function usageFocusStep (side: 'legacy' | 'next'): StateAction {
  return async page => {
    const element = side === 'legacy' ? usageItemLegacy(page) : usageAdminButtonNext(page)
    await whenPresent(element, async () => {
      await page.mouse.move(0, 0)
      let presses = 0
      while (presses < 60 && !(await element.evaluate(node => node === document.activeElement))) {
        await page.keyboard.press('Tab')
        presses++
      }
      const width = page.viewportSize()!.width
      expect(presses, `Tab presses from page start to the ${side === 'legacy' ? 'Usage item' : 'admin button'} (${side}, ${width}px)`).toBe(USAGE_FOCUS_PRESSES[side][width])
      expect(await element.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
    })
  }
}

// The item keeps the focus after the capture (the scroll reset before the probes), as in `shellFocus` (`stillFocusedStep`).
const usageItemStillFocusedLegacy: StateAction = async page => {
  if (await usageItemLegacy(page).count() === 0) {
    return
  }
  expect(await usageItemLegacy(page).evaluate(node => node === document.activeElement), 'Usage item still focused').toBe(true)
}

// No early return for a missing element in next: the state must fail instead of measuring something else.
const adminButtonStillFocusedNext: StateAction = async page => {
  expect(await usageAdminButtonNext(page).evaluate(node => node === document.activeElement), 'admin button still focused').toBe(true)
}

export const hostingUsageFocus: ParityState = {
  ...hostingUsageAdmin,
  id: 'hosting-usage-focus',
  pointer: 'keep',
  // Legacy's 22 Tab presses walk through the off-canvas Style Manager (the closed V4 drawer is `inert`), which scrolls its content: the panel is
  // shell, not the view, so the drawer is masked in both apps.
  masks: {
    legacy: [...(hostingUsageAdmin.masks?.legacy ?? []), page => page.locator('.v-navigation-drawer.style-drawer')],
    next: [...(hostingUsageAdmin.masks?.next ?? []), page => page.getByTestId('style-manager-drawer')],
  },
  actions: {
    legacy: [...hostingUsageAdmin.actions.legacy, usageFocusStep('legacy')],
    next: [...hostingUsageAdmin.actions.next, usageFocusStep('next')],
  },
  probes: hostingUsageAdmin.probes,
  afterCapture: {
    legacy: [...(hostingUsageAdmin.afterCapture?.legacy ?? []), usageItemStillFocusedLegacy],
    next: [...(hostingUsageAdmin.afterCapture?.next ?? []), adminButtonStillFocusedNext],
  },
}

// Outside Live the counter is absent in both apps (an element missing in both is reported as `missing`), so Vitest covers it, not a probe.

export const hostingUsageLastHour: ParityState = {
  id: 'hosting-usage-last-hour',
  ...hostingState({
    ...base,
    metrics: {},
    masks: chartMasks,
    pointer: 'keep',
    legacy: [
      waitForChart,
      async page => {
        await legacyPeriodSelect(page).locator('.v-input__slot').click()
        await legacyMenu(page).getByText('1 hour').click()
      },
      waitForChart,
    ],
    next: [
      waitForChart,
      async page => {
        await nextPeriodSelect(page).click()
        await nextMenu(page).getByText('1 hour').click()
      },
      waitForChart,
    ],
    probes: cardProbes,
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 14: two services, the plan selector of the sidebar is open (`ActiveHostingPlanSelector`, rendered from two services on both apps)
// ---------------------------------------------------------------------------------------------

const planSelectorProbe: Probe = {
  key: 'plan-selector',
  legacy: page => page.locator('.v-main .sticky-sidebar .v-select'),
  next: page => page.getByTestId('hosting-plan-selector'),
}

const planServices = [
  hostingService(),
  hostingService({ id: 2, domain: 'other.example.com', plan_name: 'Starter', server_accounts: [serverAccount({ id: 21, domain: 'other.example.com', service_id: 2 })] }),
]

function planSelectorLegacy (page: Page) {
  return page.locator('.v-main .sticky-sidebar .v-select')
}

export const hostingUsagePlansOpen: ParityState = {
  id: 'hosting-usage-plans-open',
  ...hostingState({
    ...base,
    services: planServices,
    metrics: {},
    masks: chartMasks,
    pointer: 'keep',
    legacy: [waitForChart, openLegacyMenu(planSelectorLegacy)],
    next: [waitForChart, async page => {
      const selector = page.getByTestId('hosting-plan-selector').locator('.v-field')
      await whenVisible(selector, async () => {
        // The full-page screenshot resizes the window and Chromium drops focus meanwhile; V4's select closes its menu on the list's
        // `blur`, legacy's does not. Swallow both events for the capture (as `hostingFramePlansOpen` does).
        await page.evaluate(() => {
          for (const type of ['blur', 'focusout']) {
            window.addEventListener(type, event => event.stopImmediatePropagation(), true)
          }
        })
        // A menu opened while the metrics still load can be closed again: open it until it stays (3 tries).
        for (let attempt = 0; attempt < 3; attempt++) {
          await selector.click()
          await page.waitForTimeout(1500)
          if (await nextMenu(page).isVisible()) {
            break
          }
        }
        await settled(nextMenu(page))
      })
    }],
    probes: [...cardProbes, planSelectorProbe, { key: 'plan-menu', legacy: legacyMenu, next: nextMenu }],
  }),
}

// ---------------------------------------------------------------------------------------------
// usage-redesign D1: one service with DNS and e-mail on, so single-server next shows the sidebar (Usage first, then DNS and the e-mail pages)
// ---------------------------------------------------------------------------------------------

export const hostingUsageSidebar: ParityState = {
  id: 'hosting-usage-sidebar',
  ...hostingState({
    ...base,
    services: [dnsEmailService],
    emailDomains: { json: emailDomainsBody([]) },
    metrics: {},
    masks: chartMasks,
    legacy: [waitForChart],
    next: [waitForChart],
    probes: cardProbes,
  }),
}

const states: ParityState[] = [
  hostingUsageLoading,
  hostingUsageError,
  hostingUsageServicesError,
  hostingUsageFrameLoading,
  hostingUsagePlansOpen,
  hostingUsageSidebar,
  hostingUsageSuspended,
  hostingUsage,
  hostingUsageAdmin,
  hostingUsageHover,
  hostingUsageFocus,
  hostingUsageNoAdmin,
  hostingUsageNoData,
  hostingUsagePeriodOpen,
  hostingUsageLastHour,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, { ...state, target: 'lite' })
  })
}
