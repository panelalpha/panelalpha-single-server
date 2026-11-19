import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, tr } from './auth'
import { isDesktop, NOW, shellState } from './shell'

// S-119 billing (ui-billing). Not a spec file (testMatch is `*.parity.ts`).
// M-2: app-lite is the source of truth, so every state is measured on lite (`target: 'lite'`). Route `/billing`; the lite
// deploy has `billing_enabled: false`, so each state overrides `home.app.billing_enabled` to `true`.
// Next test ids are `billing-<element>`; legacy has none, so its locators use role, copy, then legacy classes.

export const BILLING_PATH = '/billing'

export interface Invoice {
  id: number
  number?: string
  date: string
  duedate: string
  total: number
  total_formatted: string
  status: 'Paid' | 'Unpaid' | 'Cancelled'
}

/** One invoice; the defaults are a paid invoice in the past. */
export function invoice (overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1001,
    date: '2026-08-01',
    duedate: '2026-08-15',
    total: 49.99,
    total_formatted: '$49.99',
    status: 'Paid',
    ...overrides,
  }
}

/** Four rows: paid, unpaid (not due yet), unpaid past its due date (`NOW` is 2026-10-05), cancelled. The table sorts by id descending. */
export const invoices: Invoice[] = [
  invoice({ id: 1001, status: 'Paid' }),
  invoice({ id: 1002, date: '2026-09-20', duedate: '2026-10-20', total: 120, total_formatted: '$120.00', status: 'Unpaid' }),
  invoice({ id: 1003, date: '2026-08-20', duedate: '2026-09-20', total: 75.5, total_formatted: '$75.50', status: 'Unpaid' }),
  invoice({ id: 1004, date: '2026-07-01', duedate: '2026-07-15', total: 30, total_formatted: '$30.00', status: 'Cancelled' }),
]

/** Twenty-five paid invoices: three pages of ten, so the footer shows three pages (phase 12, D1). Ids 1001 to 1025, sorted by id descending. */
export const invoicesPaged: Invoice[] = Array.from({ length: 25 }, (_, index) => invoice({
  id: 1001 + index,
  total: 10 + index,
  total_formatted: `$${(10 + index).toFixed(2)}`,
  status: 'Paid',
}))

export const billingDetails = {
  companyname: 'Acme Inc.',
  firstname: 'Jane',
  lastname: 'Doe',
  address1: '1 Main Street',
  postcode: '00-001',
  city: 'Warsaw',
  state: 'Mazowieckie',
  country: 'PL',
}

/** `GET /billing` body: `null` for a client without a billing account, otherwise the details with the invoices. */
export function billingBody (list: Invoice[] | null = invoices): { data: unknown } {
  return { data: list === null ? null : { ...billingDetails, invoices: list } }
}

export interface BillingStateOptions {
  body?: { data: unknown }
  handlers?: Record<string, Handler>
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
  clock?: string
}

/** Signed in on `/billing` with billing enabled; the invoices answer `GET /billing`. */
export function billingState (options: BillingStateOptions = {}): Omit<ParityState, 'id'> {
  return {
    ...shellState({
      target: 'lite',
      path: BILLING_PATH,
      // No navbar tab is active on /billing, and the shell states already measure the tabs.
      tabs: [],
      tabSlider: false,
      // The content sits in `.v-main`, which the lite routed-content mask would hide.
      masks: { legacy: [], next: [] },
      home: { app: { billing_enabled: true } },
      clock: options.clock ?? NOW,
      legacy: options.legacy,
      next: options.next,
      probes: options.probes,
    }),
    handlers: {
      ...shellState({ target: 'lite' }).handlers,
      'GET /billing': { json: options.body ?? billingBody() },
      ...options.handlers,
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** The table has its first row (next test id rows). */
export const billingLoaded: StateAction = async page => {
  await settled(page.getByTestId('billing-row').first())
}

/** The table has its first row (legacy class rows). */
export const legacyBillingLoaded: StateAction = async page => {
  await settled(page.locator('.custom-data-table tbody tr').first())
}

// ---------------------------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------------------------

const legacyRow = (page: Page) => page.locator('.custom-data-table tbody tr').first()

/** The first "Pay Now" button (legacy: a button with the copy; next: test id). */
export const payNowLegacy = (page: Page): Locator => page.locator('.custom-data-table tbody button', { hasText: tr('button.billing.pay_now', 'lite') }).first()
export const payNowNext = (page: Page): Locator => page.getByTestId('billing-pay-now').first()

/** Every "Pay Now" button, in table order (phase 8 loading reads the second one too). */
export const payNowAllLegacy = (page: Page): Locator => page.locator('.custom-data-table tbody button', { hasText: tr('button.billing.pay_now', 'lite') })
export const payNowAllNext = (page: Page): Locator => page.getByTestId('billing-pay-now')

/** The first Download icon button. */
export const downloadLegacy = (page: Page): Locator => page.locator('.custom-data-table tbody .btn-icon').first()
export const downloadNext = (page: Page): Locator => page.getByTestId('billing-download').first()

/** The icon of the first overdue invoice (`InvoicesTable.vue` next, `InvoicesTable.vue:48-64` LITE). */
export const overdueIconLegacy = (page: Page): Locator => page.locator('.custom-data-table tbody .text--error-base .v-icon').first()
export const overdueIconNext = (page: Page): Locator => page.getByTestId('billing-overdue').first().locator('.v-icon')

/** The active page number of the footer (V2 `v-pagination__item--active` on the button, V4 `v-pagination__item--is-active` on the `li`; the probe takes its `.v-btn`). */
export const billingPageActiveProbe: Probe = {
  key: 'billing-page-active',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer .v-pagination__item--active'),
  next: page => page.getByTestId('billing-footer').locator('.v-pagination__item--is-active .v-btn'),
}

// Overlay of a button: legacy paints it as `::before`, next as `.v-btn__overlay` (the `buttonOverlayProbe` pattern in `auth.ts`).
export const billingPayOverlayProbe: Probe = {
  key: 'billing-pay-overlay',
  legacy: payNowLegacy,
  next: page => payNowNext(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

export const billingDownloadOverlayProbe: Probe = {
  key: 'billing-download-overlay',
  legacy: downloadLegacy,
  next: page => downloadNext(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/**
 * Keyboard focus on the button `locate` finds (`.first()` in the locator), as `buttonFocusState` (`auth.ts:357`): the pointer leaves
 * the page, a key that moves no focus is pressed, then `focus()`. No Tab: the tab order is not what is measured.
 */
export function focusFirst (locate: (page: Page) => Locator): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = locate(page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

/** V4 paints the focus ring on `.v-btn::after`; `_buttons.scss` switches it off, so the opacity must be 0 (next only, as `auth.ts:368`). */
export function noFocusRing (locate: (page: Page) => Locator): StateAction {
  return async page => {
    const ring = await locate(page).evaluate(element => getComputedStyle(element, '::after').opacity)
    expect(ring, 'V4 focus ring hidden').toBe('0')
  }
}

/** The open tooltip (legacy `.menuable__content__active`, next `.v-overlay__content`). Desktop only. */
export const billingTooltipProbe: Probe = {
  key: 'billing-tooltip',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.locator('.v-overlay--active .v-overlay__content'),
  internal: true,
  when: isDesktop,
}

/**
 * Hovers the element and waits for its tooltip (`open-delay` 150 ms). The row can reflow once the pointer lands and close the tooltip,
 * so the pointer leaves and comes back until it shows (as `hoverRowDelete` in `hosting-email-forwarders.parity.ts`). Phone: plain hover.
 */
export function hoverForTooltip (next: boolean, locate: (page: Page) => Locator): StateAction {
  return async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    if ((page.viewportSize()?.width ?? 1440) < 976) {
      return
    }
    const tooltip = next ? billingTooltipProbe.next : billingTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

export const billingProbes: Probe[] = [
  {
    key: 'title',
    legacy: page => page.getByRole('heading', { level: 1, name: tr('heading.billing.title', 'lite'), exact: true }),
    next: page => page.getByTestId('billing-title'),
  },
  {
    key: 'details-card',
    legacy: page => page.locator('.sticky-sidebar .v-card').first(),
    next: page => page.getByTestId('billing-details'),
  },
  {
    key: 'divider',
    legacy: page => page.locator('hr.v-divider').first(),
    next: page => page.locator('hr.v-divider').first(),
  },
  {
    key: 'details-title',
    legacy: page => page.locator('.sticky-sidebar p', { hasText: tr('heading.billing.details.title', 'lite') }).first(),
    next: page => page.getByTestId('billing-details-title'),
  },
  {
    key: 'details-list',
    legacy: page => page.locator('.sticky-sidebar ul').first(),
    next: page => page.getByTestId('billing-details-list'),
  },
  {
    key: 'invoices-title',
    legacy: page => page.getByRole('heading', { level: 4, name: tr('heading.billing.invoice.title', 'lite'), exact: true }),
    next: page => page.getByTestId('billing-invoices-title'),
  },
  {
    key: 'search',
    legacy: page => page.locator('.page-title__filter-controls .data-iterator-filter-controls').first(),
    next: page => page.getByTestId('billing-search'),
  },
  {
    key: 'table',
    legacy: page => page.locator('.data-table').first(),
    next: page => page.getByTestId('billing-table').locator('.data-table').first(),
    internal: true,
  },
  {
    key: 'row',
    legacy: legacyRow,
    next: page => page.getByTestId('billing-row').first(),
  },
  {
    key: 'status-chip',
    legacy: page => page.locator('.custom-data-table tbody .v-chip').first(),
    next: page => page.getByTestId('billing-status-chip').first(),
  },
  {
    key: 'overdue',
    legacy: page => page.locator('.custom-data-table tbody .text--error-base').first(),
    next: page => page.getByTestId('billing-overdue').first(),
  },
  {
    key: 'pay-now',
    legacy: payNowLegacy,
    next: payNowNext,
  },
  {
    key: 'download',
    legacy: downloadLegacy,
    next: downloadNext,
  },
  {
    // `footer` is the shell's key (`shell.ts` footerProbe); the invoices pager needs its own.
    key: 'invoices-footer',
    legacy: page => page.locator('.data-iterator-footer').first(),
    next: page => page.getByTestId('billing-footer'),
  },
]

// ---------------------------------------------------------------------------------------------
// Phase 10, empty. `NoAvailableInvoicesView` replaces the screen when `items` is empty and not loading (next `BillingView.vue`,
// legacy `Billing.vue:239-243` and `:250`). `invoices: []` and `data: null` (no billing account) give the same view.
// ---------------------------------------------------------------------------------------------

/** Waits for the empty view: the card (legacy `.intro-page`, next test id `billing-empty`). */
export function waitForEmptyView (next: boolean): StateAction {
  return async page => {
    await settled(next ? page.getByTestId('billing-empty') : page.locator('.intro-page'))
  }
}

export const billingEmptyProbes: Probe[] = [
  {
    key: 'billing-empty-card',
    legacy: page => page.locator('.intro-page'),
    next: page => page.getByTestId('billing-empty'),
  },
  {
    key: 'billing-empty-illustration',
    legacy: page => page.locator('.intro-page__illustration'),
    next: page => page.getByTestId('billing-empty').locator('.intro-page__illustration'),
  },
  {
    key: 'billing-empty-title',
    legacy: page => page.locator('.intro-page__title'),
    next: page => page.getByTestId('billing-empty').locator('.intro-page__title'),
  },
  {
    key: 'billing-empty-desc',
    legacy: page => page.locator('.intro-page__desc'),
    next: page => page.getByTestId('billing-empty').locator('.intro-page__desc'),
  },
  {
    key: 'billing-empty-back',
    legacy: page => page.locator('.intro-page__actions .v-btn').first(),
    next: page => page.getByTestId('billing-empty-back'),
  },
  {
    // The copy span carries `text-white` (next) and `white--text` (legacy `NoAvailableInvoicesView.vue`); the button's own span does not.
    key: 'billing-empty-back-text',
    legacy: page => page.locator('.intro-page__actions .v-btn span.white--text').first(),
    next: page => page.getByTestId('billing-empty-back').locator('span.text-white').first(),
  },
]

// ---------------------------------------------------------------------------------------------
// Phase 10, search without a match (D2). The table keeps its card and header; the rows go and the no-results container shows.
// ---------------------------------------------------------------------------------------------

export const billingNoResultsProbe: Probe = {
  key: 'billing-no-results',
  legacy: page => page.locator('.no-results-container').first(),
  next: page => page.locator('.no-results-container').first(),
}

/** Legacy: the V2 empty wrapper row; next: the V4 `no-data` row (`VDataTableRows`). Both hold the no-results container. */
export const billingEmptyRowProbe: Probe = {
  key: 'billing-empty-row',
  legacy: page => page.locator('.v-data-table__empty-wrapper').first(),
  next: page => page.locator('.v-data-table-rows-no-data').first(),
}

const NO_MATCH_TERM = 'zzz-no-match'

/**
 * Types a term that matches no invoice and waits for the no-results container. Same steps as `listSearch` (`hosting.ts:737`): the
 * mobile search is an icon that opens the field, and legacy's debounce reads `Date.now()`, so the frozen clock moves a second per step.
 */
export function searchNoMatch (next: boolean): StateAction {
  return async page => {
    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await page.locator('.data-iterator-filter-controls__item').last().locator('.v-input').click()
    }
    await page.getByPlaceholder(tr('form.placeholder.search', 'lite')).fill(NO_MATCH_TERM)
    const base = Date.parse(NOW)
    // D2: deployed LITE shows the plain V2 "No matching records found" row (no container); next shows the no-results container.
    const ready = next
      ? '.v-data-table-rows-no-data .no-results-container'
      : '.v-data-table__empty-wrapper'
    for (let step = 1; step <= 20; step++) {
      await page.clock.setFixedTime(new Date(base + step * 1000))
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)))
      if (await page.locator(ready).count() > 0) {
        return
      }
    }
    await expect(page.locator(ready).first(), 'no-results container after the search').toBeVisible()
  }
}
