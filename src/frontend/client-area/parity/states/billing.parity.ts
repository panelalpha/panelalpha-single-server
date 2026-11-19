import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { settled } from './auth'
import { billingBody, billingDownloadOverlayProbe, billingEmptyProbes, billingEmptyRowProbe, billingLoaded, billingNoResultsProbe, billingPageActiveProbe, billingPayOverlayProbe, billingProbes, billingState, billingTooltipProbe, downloadLegacy, downloadNext, focusFirst, hoverForTooltip, invoicesPaged, legacyBillingLoaded, noFocusRing, overdueIconLegacy, overdueIconNext, payNowAllLegacy, payNowAllNext, payNowLegacy, payNowNext, searchNoMatch, waitForEmptyView } from './billing'
import { alertManagerProbe, waitFor } from './hosting'
import { hovered } from './sftp'
import { isDesktop } from './shell'

// S-119 billing (ui-billing). Each state id is a literal `id: '…',` line, which `registeredStateIds` in report/write-report.ts
// reads as text. Lite target throughout (`billing.ts` header).

export const billingDefault: ParityState = {
  id: 'billing-default',
  ...billingState({
    legacy: [legacyBillingLoaded],
    next: [billingLoaded],
    probes: billingProbes,
  }),
}

// Phase 6, hover. The pointer rests on the first "Pay Now" (overlay probe), the first Download (overlay probe and tooltip) and the
// icon of the first overdue invoice (tooltip). `hovered` from `sftp.ts` holds the pointer and checks it after the capture.
function hoveredWithTooltip (target: { legacy: (page: Page) => Locator, next: (page: Page) => Locator }, probes: Probe[]): ParityState {
  const base = hovered(billingDefault, target, probes)
  return {
    ...base,
    actions: {
      legacy: [...base.actions.legacy, hoverForTooltip(false, target.legacy)],
      next: [...base.actions.next, hoverForTooltip(true, target.next)],
    },
  }
}

export const billingPayHover: ParityState = {
  ...hovered(billingDefault, { legacy: payNowLegacy, next: payNowNext }, [billingPayOverlayProbe]),
  id: 'billing-pay-hover',
}

export const billingDownloadHover: ParityState = {
  ...hoveredWithTooltip({ legacy: downloadLegacy, next: downloadNext }, [billingDownloadOverlayProbe, billingTooltipProbe]),
  id: 'billing-download-hover',
}

export const billingOverdueHover: ParityState = {
  ...hoveredWithTooltip({ legacy: overdueIconLegacy, next: overdueIconNext }, [billingTooltipProbe]),
  id: 'billing-overdue-hover',
}

// Phase 7, focus-visible. Keyboard focus on the first "Pay Now" and the first Download, as `buttonFocusState` (`auth.ts:357`) but without
// Tab. Next also checks that V4's focus ring (`.v-btn::after`) is hidden.
function focusedOn (target: { legacy: (page: Page) => Locator, next: (page: Page) => Locator }, probes: Probe[]): ParityState {
  return {
    ...billingDefault,
    pointer: 'keep',
    actions: {
      legacy: [...billingDefault.actions.legacy, focusFirst(target.legacy)],
      next: [...billingDefault.actions.next, focusFirst(target.next), noFocusRing(target.next)],
    },
    probes: [...(billingDefault.probes ?? []), ...probes],
  }
}

export const billingPayFocus: ParityState = {
  ...focusedOn({ legacy: payNowLegacy, next: payNowNext }, [billingPayOverlayProbe]),
  id: 'billing-pay-focus',
}

export const billingDownloadFocus: ParityState = {
  ...focusedOn({ legacy: downloadLegacy, next: downloadNext }, [billingDownloadOverlayProbe]),
  id: 'billing-download-focus',
}

// Phase 8, loading. The default sort is id descending, so the first Unpaid row in table order is invoice 1003. Its payment-url POST is
// held, and the click on its "Pay Now" starts it. Legacy and next share one loading flag for the table (`InvoicesTable.vue` quirk, kept
// 1:1), so both "Pay Now" buttons spin. Disabled is N/A: LITE `InvoicesTable.vue:78-91` has `:loading` only.
const PAY_URL_HOLD = { 'POST /billing/invoices/1003/payment-url': 'hold' } as const

function clickPayHold (next: boolean): StateAction {
  return async page => {
    await (next ? payNowNext(page) : payNowLegacy(page)).click()
  }
}

function waitForPayLoading (next: boolean): StateAction {
  return async page => {
    const buttons = next ? payNowAllNext(page) : payNowAllLegacy(page)
    await expect(buttons).toHaveCount(2)
    await expect(buttons.nth(0)).toHaveClass(/v-btn--loading/)
    await expect(buttons.nth(1)).toHaveClass(/v-btn--loading/)
    await settled(buttons.nth(0).locator('.v-progress-circular'))
  }
}

const billingPaySecondProbe: Probe = {
  key: 'billing-pay-second',
  legacy: page => payNowAllLegacy(page).nth(1),
  next: page => payNowAllNext(page).nth(1),
}

export const billingPayLoading: ParityState = {
  ...billingDefault,
  id: 'billing-pay-loading',
  handlers: { ...billingDefault.handlers, ...PAY_URL_HOLD },
  actions: {
    legacy: [...billingDefault.actions.legacy, clickPayHold(false), waitForPayLoading(false)],
    next: [...billingDefault.actions.next, clickPayHold(true), waitForPayLoading(true)],
  },
  probes: [...(billingDefault.probes ?? []), billingPaySecondProbe],
  // The spinner animates, so it is masked on both sides; the button colour is probed.
  masks: {
    legacy: [...(billingDefault.masks?.legacy ?? []), (page: Page) => payNowAllLegacy(page).locator('.v-progress-circular')],
    next: [...(billingDefault.masks?.next ?? []), (page: Page) => payNowAllNext(page).locator('.v-progress-circular')],
  },
}

// Phase 9, error. `GET /billing` answers 500 `Server Error`: the shell's alert (legacy `Billing.vue:239-243`) and the empty view, because no rows
// load and `NoAvailableInvoicesView` shows when `items` is empty and not loading. The toast is pinned by a hover on its text on both sides
// (`mouseover` stops its 5 s timer), as `hosting-dns-error`.
const billingErrorIntroProbe: Probe = {
  key: 'billing-error-intro',
  legacy: page => page.locator('.intro-page'),
  next: page => page.getByTestId('billing-empty'),
}

export const billingError: ParityState = {
  ...billingState({
    handlers: { 'GET /billing': { status: 500, json: { message: 'Server Error' } } },
    legacy: [waitFor(alertManagerProbe.legacy), page => page.locator('.alert-manager').getByText('Server Error').hover()],
    next: [waitFor(alertManagerProbe.next), page => page.getByTestId('shell-alert-manager').getByText('Server Error').hover()],
    probes: [...billingProbes.filter(probe => probe.key === 'title'), billingErrorIntroProbe, alertManagerProbe],
  }),
  id: 'billing-error',
  pointer: 'keep',
}

// Phase 10, empty. `invoices: []` and `data: null` (no billing account) both give the empty view; only the title stays from the
// page probes, because the table is not rendered.
export const billingEmpty: ParityState = {
  ...billingState({
    body: billingBody([]),
    legacy: [waitForEmptyView(false)],
    next: [waitForEmptyView(true)],
    probes: [...billingProbes.filter(probe => probe.key === 'title'), ...billingEmptyProbes],
  }),
  id: 'billing-empty',
}

export const billingNoData: ParityState = {
  ...billingState({
    body: billingBody(null),
    legacy: [waitForEmptyView(false)],
    next: [waitForEmptyView(true)],
    probes: [...billingProbes.filter(probe => probe.key === 'title'), ...billingEmptyProbes],
  }),
  id: 'billing-no-data',
}

// Phase 10, D2. The rows and their per-row probes go; the card, header, search and footer stay.
const ROW_PROBE_KEYS = new Set(['row', 'status-chip', 'overdue', 'pay-now', 'download'])

export const billingSearchEmpty: ParityState = {
  ...billingDefault,
  id: 'billing-search-empty',
  actions: {
    legacy: [...billingDefault.actions.legacy, searchNoMatch(false)],
    next: [...billingDefault.actions.next, searchNoMatch(true)],
  },
  probes: [
    ...billingProbes.filter(probe => !ROW_PROBE_KEYS.has(probe.key)),
    billingNoResultsProbe,
    billingEmptyRowProbe,
  ],
}

// Phase 11, loading. `GET /billing` is held, so the card shows its progress bar and the table its skeleton: the sort header and five rows
// on desktop (`InvoicesTable.vue`, `v-if="loading"`), five mobile cards below `lg`. The skeleton shimmer and the progress bar are masked
// (the state keeps its layout and does not depend on the animation frame). Probes: the row line (`::after`, `--v-skeleton-row-border`,
// the token from phase 2), the first skeleton button on mobile (its margin is set by specificity, not `!important`).
const billingSkeletonMasks = {
  legacy: [
    (page: Page) => page.locator('.data-table .v-skeleton-loader'),
    (page: Page) => page.locator('.sticky-sidebar .v-progress-linear'),
  ],
  next: [
    (page: Page) => page.getByTestId('billing-table').locator('.v-skeleton-loader'),
    (page: Page) => page.getByTestId('billing-details').locator('.v-progress-linear--active'),
  ],
}

function waitForBillingLoading (next: boolean): StateAction {
  return async page => {
    if (next) {
      await settled(page.getByTestId('billing-table').locator('.v-skeleton-loader').first())
      await settled(page.getByTestId('billing-details').locator('.v-progress-linear--active'))
    } else {
      await settled(page.locator('.data-table .v-skeleton-loader').first())
      await settled(page.locator('.sticky-sidebar .v-progress-linear'))
    }
  }
}

export const billingLoading: ParityState = {
  ...billingState({
    handlers: { 'GET /billing': 'hold' },
    legacy: [waitForBillingLoading(false)],
    next: [waitForBillingLoading(true)],
    probes: [
      ...billingProbes.filter(probe => ['title', 'details-card', 'details-title', 'divider', 'invoices-title', 'table'].includes(probe.key)),
      {
        key: 'billing-loading-progress',
        legacy: page => page.locator('.sticky-sidebar .v-progress-linear'),
        next: page => page.getByTestId('billing-details').locator('.v-progress-linear--active'),
        internal: true,
      },
      {
        key: 'billing-loading-sort-skeleton',
        legacy: page => page.locator('.data-table thead.sort'),
        next: page => page.getByTestId('billing-table').locator('thead.sort'),
        internal: true,
        when: isDesktop,
      },
      {
        // The row line is the `::after` of each skeleton row; both apps draw it on the row (`tr`).
        key: 'billing-loading-row-line',
        legacy: page => page.locator('.data-table tbody.item tr').first(),
        next: page => page.getByTestId('billing-table').locator('tbody.item tr').first(),
        pseudo: { legacy: '::after', next: '::after' },
        internal: true,
        when: isDesktop,
      },
      {
        key: 'billing-loading-mobile-card',
        legacy: page => page.locator('.data-table .mobile-item').first(),
        next: page => page.getByTestId('billing-table').locator('.mobile-item').first(),
        internal: true,
        when: variant => !isDesktop(variant),
      },
      {
        // The first bone of the actions row on mobile: no left margin (`:first-child`), the others keep 16 px.
        key: 'billing-loading-mobile-action',
        legacy: page => page.locator('.data-table .mobile-item .actions-container .v-skeleton-loader__avatar').first(),
        next: page => page.getByTestId('billing-table').locator('.mobile-item .actions-container .v-skeleton-loader__avatar').first(),
        internal: true,
        when: variant => !isDesktop(variant),
      },
    ],
  }),
  id: 'billing-loading',
  masks: billingSkeletonMasks,
}

// Phase 12, paged (D1). Twenty-five invoices: the next pager shows three pages of ten rows, while legacy counts NaN pages and shows one
// (`InvoicesTable.vue` `#bottom`). The footer and the active page are probed; the page-count delta is an accepted deviation.
export const billingPaged: ParityState = {
  ...billingState({
    body: billingBody(invoicesPaged),
    legacy: [legacyBillingLoaded],
    next: [billingLoaded],
    probes: [...billingProbes, billingPageActiveProbe],
  }),
  id: 'billing-paged',
}

const states: ParityState[] = [
  billingDefault,
  billingError,
  billingPayHover,
  billingDownloadHover,
  billingOverdueHover,
  billingPayFocus,
  billingDownloadFocus,
  billingPayLoading,
  billingLoading,
  billingEmpty,
  billingNoData,
  billingSearchEmpty,
  billingPaged,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
