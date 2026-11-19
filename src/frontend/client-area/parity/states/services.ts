import type { Handler, ParityState, Probe, StateAction } from './state'
import { expect, type Locator, type Page } from '@playwright/test'
import { settled, tr } from './auth'
import { alertManagerProbe, listSearch, waitFor } from './hosting'
import { NOW, shellState } from './shell'

// S-120 ui-services (formerly S-49): `/services` (My plans) on app-lite (`target: 'lite'`, M-2). Not a spec file (testMatch is `*.parity.ts`).
// Legacy: `views/Services.vue`, `components/dataIterator/tables/ServicesTable.vue`, `components/buttons/CancelServiceButton.vue`,
// `components/labels/CustomLabel.vue` (identical in app and app-lite; the redirect without billing is measured on the target screen).
// Next test ids are `services-<element>` (`services.parity.ts` is the spec); legacy has none, so its locators use role, copy, then classes.
// Fixtures: `billing_enabled: true` (the lite base has it off, which redirects both apps away), `GET /services` answered here.

export const SERVICES_PATH = '/services'

/** A `GET /services` row (`services.types.ts`); defaults are an active plan without instances. */
export interface ServiceFixture {
  id: number
  plan_name: string
  status: 'active' | 'suspended' | 'cancelled'
  is_trial?: boolean
  trial_expiry_at?: string | null
  plan_settings: { instance_limit: number }
  plan_upgrade_link?: string | null
  instances: Array<{ id: number, domain: string, domain_type?: string | null, parent_id?: number | null }>
}

export function service (overrides: Partial<ServiceFixture> & Pick<ServiceFixture, 'id' | 'plan_name'>): ServiceFixture {
  return {
    status: 'active',
    plan_settings: { instance_limit: 5 },
    plan_upgrade_link: null,
    instances: [],
    ...overrides,
  }
}

export function servicesBody (items: ServiceFixture[]) {
  return { data: items }
}

const DAY = 86_400_000
const trialExpiry = new Date(Date.parse(NOW) + 7 * DAY).toISOString()

/**
 * Five active or suspended plans. Both apps list them by plan name, Starter first (the default sort): Starter (no instance),
 * Growth (three instances: the count is 2, the tooltip shows "+ 2 more"), Free Trial (trial with a link), Business (suspended),
 * Basic (active with a link). Cancelled rows show only under the All filter (`services-filter-all`), not in the default Active list.
 */
export const defaultServices: ServiceFixture[] = [
  service({
    id: 1,
    plan_name: 'Basic Plan',
    plan_upgrade_link: 'https://example.com/upgrade',
    instances: [{ id: 101, domain: 'basic.example.com', domain_type: 'main' }],
  }),
  service({
    id: 2,
    plan_name: 'Business Plan',
    status: 'suspended',
    instances: [{ id: 102, domain: 'business.example.com', domain_type: 'main' }],
  }),
  service({
    id: 3,
    plan_name: 'Free Trial',
    is_trial: true,
    trial_expiry_at: trialExpiry,
    plan_upgrade_link: 'https://example.com/upgrade',
    instances: [{ id: 103, domain: 'trial.example.com', domain_type: 'main' }],
  }),
  service({
    id: 4,
    plan_name: 'Growth Plan',
    instances: [
      { id: 104, domain: 'growth.example.com', domain_type: 'main' },
      { id: 105, domain: 'shop.example.com', domain_type: 'addon', parent_id: 104 },
      { id: 106, domain: 'blog.growth.example.com', domain_type: 'sub', parent_id: 104 },
    ],
  }),
  service({ id: 5, plan_name: 'Starter Plan' }),
]

export interface ServicesStateOptions {
  /** Rows of `GET /services`; default `defaultServices`. */
  services?: ServiceFixture[]
  /** Answer of `GET /services` (overrides `services`), e.g. `'hold'` or a 500. */
  list?: Handler
  /** Answers per `METHOD /path`, on top of the list and the cancel answer. */
  handlers?: Record<string, Handler>
  /** Route the state starts on, with its query when it has one (default `/services`). */
  path?: string
  clock?: string
  masks?: ParityState['masks']
  pointer?: ParityState['pointer']
  legacy?: StateAction[]
  next?: StateAction[]
  probes?: Probe[]
}

/** Signed in on `/services` with billing on; the frame is the lite single-server shell, the content sits in `.v-main` (masked, as in `account.ts`). */
export function servicesState (options: ServicesStateOptions = {}): Omit<ParityState, 'id'> {
  const state = shellState({
    target: 'lite',
    path: options.path ?? SERVICES_PATH,
    // No navbar tab is active on /services (it is not one of the lite tabs), so the slider probe is dropped.
    tabs: [],
    tabSlider: false,
    clock: options.clock ?? NOW,
    masks: options.masks ?? { legacy: [], next: [] },
    home: { app: { billing_enabled: true } },
    pointer: options.pointer,
    legacy: options.legacy,
    next: options.next,
    probes: [...(options.probes ?? [])],
  })
  return {
    ...state,
    handlers: {
      ...state.handlers,
      'GET /services': options.list ?? { json: servicesBody(options.services ?? defaultServices) },
      'PUT /services/5/cancel': { json: { data: {} } },
      ...options.handlers,
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Probes. Legacy: role/copy first, then the legacy classes; next: `services-*` test ids (attribute only) and the table below them.
// ---------------------------------------------------------------------------------------------

export const titleProbe: Probe = {
  key: 'title',
  legacy: page => page.getByRole('heading', { level: 1, name: tr('general.myPlans', 'lite'), exact: true }),
  next: page => page.getByTestId('services-title'),
}

export const statusFilterProbe: Probe = {
  key: 'status-filter',
  legacy: page => page.locator('.page-title__filter-controls .v-input__slot').first(),
  next: page => page.getByTestId('services-status-filter').locator('.v-field'),
  part: 'box',
  internal: true,
}

/** The column of the title row that holds the status select and the search field (row height and padding). */
export const filterColumnProbe: Probe = {
  key: 'filter-column',
  legacy: page => page.locator('.page-title__filter-controls').first(),
  next: page => page.locator('.page-title__filter-controls').first(),
}

/** The column of the title row that holds the title (margins mt-7 / mb-7 and padding). */
export const titleColumnProbe: Probe = {
  key: 'title-column',
  legacy: page => page.locator('.top-title').locator('xpath=..').first(),
  next: page => page.locator('.top-title').locator('xpath=..').first(),
}

export const topTitleProbe: Probe = {
  key: 'top-title',
  legacy: page => page.locator('.top-title').first(),
  next: page => page.locator('.top-title').first(),
}

export const searchProbe: Probe = {
  key: 'search',
  legacy: page => page.locator('.page-title__filter-controls .full-width-input').first(),
  next: page => page.locator('.page-title__filter-controls .full-width-input').first(),
}

export const tableProbe: Probe = {
  key: 'table',
  legacy: page => page.locator('.v-main .services-table').first(),
  next: page => page.getByTestId('services-table'),
}

/** The first body row (sorted by plan name). */
function firstRow (page: Page, app: 'legacy' | 'next') {
  return app === 'legacy'
    ? page.locator('.v-main .services-table tbody tr').first()
    : page.getByTestId('services-table').locator('tbody tr').first()
}

export const rowProbe: Probe = {
  key: 'row',
  legacy: page => firstRow(page, 'legacy'),
  next: page => firstRow(page, 'next'),
}

export const planNameProbe: Probe = {
  key: 'plan-name',
  legacy: page => page.locator('.v-main .services-table .additional-services-main p').first(),
  next: page => page.getByTestId('services-table').locator('.additional-services-main p').first(),
}

/** The status chip next to a plan name: the first one is the suspended plan (the Basic row has none). */
export const statusChipProbe: Probe = {
  key: 'status-chip',
  legacy: page => page.locator('.v-main .services-table .additional-services-main .v-chip').first(),
  next: page => page.getByTestId('services-status-chip').first(),
}

/** The `instances/limit` chip of the first row. */
export const countChipProbe: Probe = {
  key: 'count-chip',
  legacy: page => page.locator('.v-main .services-table .radius-sm').first(),
  next: page => page.getByTestId('services-count-chip').first(),
}

/** The "+ N more" link of the Growth row (three instances). */
export const moreProbe: Probe = {
  key: 'more',
  // Legacy classes the link `info--text` (V2 colour class); next `text-info`.
  legacy: page => page.locator('.v-main .services-table .cursor-pointer', { hasText: '+ 2' }),
  next: page => page.getByTestId('services-more-sites'),
}

export const cancelProbe: Probe = {
  key: 'cancel',
  legacy: page => firstRow(page, 'legacy').getByRole('button', { name: tr('button.cancel', 'lite'), exact: true }),
  next: page => page.getByTestId('services-cancel-open').first(),
}

export const upgradeProbe: Probe = {
  key: 'upgrade',
  // The first row (Starter) has no link, so the first Upgrade of the table is the Free Trial one. Legacy `v-btn` with `href`
  // has no link role in V2; the button is found by its class and copy.
  legacy: page => page.locator('.v-main .services-table tbody .base-actions .v-btn', { hasText: tr('button.upgrade', 'lite') }).first(),
  next: page => page.getByTestId('services-upgrade').first(),
}

export const footerProbe: Probe = {
  key: 'table-footer',
  legacy: page => page.locator('.v-main .services-table .data-iterator-footer'),
  next: page => page.getByTestId('services-table').locator('.data-iterator-footer'),
}

/** The default list probes (Active filter, five rows, one page). */
export const listProbes: Probe[] = [
  titleProbe,
  statusFilterProbe,
  filterColumnProbe,
  titleColumnProbe,
  topTitleProbe,
  searchProbe,
  tableProbe,
  rowProbe,
  planNameProbe,
  statusChipProbe,
  countChipProbe,
  moreProbe,
  cancelProbe,
  upgradeProbe,
  footerProbe,
]

// ---------------------------------------------------------------------------------------------
// Phase 5: hover states (`services-upgrade-hover`, `services-sites-tooltip`). Both are desktop and mobile; on mobile the
// hover runs only when the element's centre is inside the viewport (a full-page capture that resets the scroll would move
// an element below the fold away from the pointer, lesson "hover/focus tylko powyżej zagięcia").
// ---------------------------------------------------------------------------------------------

/** Whether the element's centre is inside the viewport at the moment of the call. */
async function centreInViewport (page: Page, element: Locator): Promise<boolean> {
  const box = await element.boundingBox()
  const viewport = page.viewportSize()
  if (!box || !viewport) {
    return false
  }
  const centreY = box.y + box.height / 2
  return centreY >= 0 && centreY <= viewport.height
}

/** Per page: whether the hover action did put the pointer on the element (the after-capture check reads it). */
const hoveredOn = new WeakMap<Page, boolean>()

/** The overlay of the first Upgrade button: V2 paints it as `::before`, V4 as `.v-btn__overlay` (as `buttonOverlayProbe`). */
export const upgradeOverlayProbe: Probe = {
  key: 'upgrade-overlay',
  legacy: upgradeProbe.legacy,
  next: page => upgradeProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/**
 * Hovers the first Upgrade link. Two rows have one (Basic, Free Trial), so `getByRole` would be ambiguous; the same
 * `.first()` locators as `upgradeProbe` pick it.
 */
function hoverUpgrade (next: boolean): StateAction {
  const locate = (page: Page) => (next ? upgradeProbe.next : upgradeProbe.legacy)(page)
  return async page => {
    const element = locate(page)
    const inView = await centreInViewport(page, element)
    hoveredOn.set(page, inView)
    if (inView) {
      await element.hover()
    }
  }
}

function stillHoveredUpgrade (next: boolean): StateAction {
  const locate = (page: Page) => (next ? upgradeProbe.next : upgradeProbe.legacy)(page)
  return async page => {
    if (!hoveredOn.get(page)) {
      return
    }
    expect(await locate(page).evaluate(element => element.matches(':hover')), 'pointer on the Upgrade button after the capture').toBe(true)
  }
}

/** `services-upgrade-hover`: the pointer rests on the first Upgrade button. */
export function upgradeHoverState (): Omit<ParityState, 'id'> {
  const base = servicesState({ probes: [...listProbes, upgradeOverlayProbe] })
  return {
    ...base,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, hoverUpgrade(false)],
      next: [...base.actions.next, hoverUpgrade(true)],
    },
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHoveredUpgrade(false)],
      next: [...(base.afterCapture?.next ?? []), stillHoveredUpgrade(true)],
    },
  }
}

/** The "+ N more" link's tooltip, once it is open: legacy `.menuable__content__active`, next the overlay of `v-tooltip`. */
export const sitesTooltipProbe: Probe = {
  key: 'sites-tooltip',
  legacy: page => page.locator('.v-tooltip__content.menuable__content__active').filter({ hasText: tr('general.sites', 'lite') }).first(),
  next: page => page.locator('.v-tooltip > .v-overlay__content').filter({ hasText: tr('general.sites', 'lite') }).first(),
  internal: true,
}

/** Domain-type chips inside the tooltip, in the order of the Growth instances: main (purple), addon (green), sub (blue). */
function domainChipProbe (type: 'main' | 'addon' | 'sub', index: number): Probe {
  return {
    key: `domain-chip-${type}`,
    legacy: page => sitesTooltipProbe.legacy(page).locator('li').nth(index).locator('.v-chip'),
    next: page => page.getByTestId(`services-domain-chip-${type}`).first(),
  }
}

export const domainChipProbes: Probe[] = [
  domainChipProbe('main', 0),
  domainChipProbe('addon', 1),
  domainChipProbe('sub', 2),
]

/** Hovers the "+ N more" link of the Growth row and waits for its tooltip (`open-delay` 150 ms); the pointer leaves and comes back until it shows. */
function hoverSites (next: boolean): StateAction {
  const locate = (page: Page) => (next ? moreProbe.next : moreProbe.legacy)(page)
  const tooltip = (page: Page) => (next ? sitesTooltipProbe.next : sitesTooltipProbe.legacy)(page)
  return async page => {
    const element = locate(page)
    const inView = await centreInViewport(page, element)
    hoveredOn.set(page, inView)
    if (!inView) {
      return
    }
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

function stillHoveredSites (next: boolean): StateAction {
  const locate = (page: Page) => (next ? moreProbe.next : moreProbe.legacy)(page)
  const tooltip = (page: Page) => (next ? sitesTooltipProbe.next : sitesTooltipProbe.legacy)(page)
  return async page => {
    if (!hoveredOn.get(page)) {
      return
    }
    expect(await locate(page).evaluate(element => element.matches(':hover')), 'pointer on the "+ N more" link after the capture').toBe(true)
    await expect(tooltip(page), 'sites tooltip still open after the capture').toBeVisible()
  }
}

/** `services-sites-tooltip`: the pointer rests on "+ 2 more" of the Growth row, so the sites tooltip and its three chips show. */
export function sitesTooltipState (): Omit<ParityState, 'id'> {
  const base = servicesState({ probes: [...listProbes, sitesTooltipProbe, ...domainChipProbes] })
  return {
    ...base,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, hoverSites(false)],
      next: [...base.actions.next, hoverSites(true)],
    },
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHoveredSites(false)],
      next: [...(base.afterCapture?.next ?? []), stillHoveredSites(true)],
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 6: focus-visible (`services-cancel-focus`). `buttonFocusState` (auth.ts) finds its button by role and copy, and every
// row has a Cancel button, so that lookup is ambiguous here. The state keeps its helper's steps (Shift, then `focus()`, no Tab)
// on the first row's Cancel button, located as `cancelProbe` does.
// ---------------------------------------------------------------------------------------------

/** The overlay of the first row's Cancel button: V2 paints it as `::before`, V4 as `.v-btn__overlay` (as `upgradeOverlayProbe`). */
export const cancelOverlayProbe: Probe = {
  key: 'cancel-overlay',
  legacy: cancelProbe.legacy,
  next: page => cancelProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** Keyboard focus on the first row's Cancel button: the pointer moves away, Shift is pressed, then `focus()` (lesson "Stan focus-visible"). */
function focusCancel (next: boolean): StateAction {
  const locate = (page: Page) => (next ? cancelProbe.next : cancelProbe.legacy)(page)
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = locate(page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

/** `services-cancel-focus`: the first row's Cancel button has keyboard focus; V4's focus ring stays hidden (as `buttonFocusState`). */
export function cancelFocusState (): Omit<ParityState, 'id'> {
  const base = servicesState({ probes: [...listProbes, cancelOverlayProbe] })
  const noFocusRing: StateAction = async page => {
    const ring = await cancelProbe.next(page).evaluate(element => getComputedStyle(element, '::after').opacity)
    expect(ring, 'V4 focus ring hidden').toBe('0')
  }
  return {
    ...base,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, focusCancel(false)],
      next: [...base.actions.next, focusCancel(true)],
    },
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? [])],
      next: [...(base.afterCapture?.next ?? []), noFocusRing],
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 7: the cancel modal (`services-cancel-modal`, `services-cancel-modal-filled`). Legacy: the one open `.v-dialog--active`
// card (V2 classes `.v-card__title`, `.v-card__actions`); next: the card with the `services-cancel-modal` test id. The modal is
// opened by a DOM click on the first row's Cancel (lesson "Modal w stanie parity otwieraj bez przewijania strony").
// ---------------------------------------------------------------------------------------------

type Side = 'legacy' | 'next'

/** The open cancel dialog's card. */
export const cancelModalProbe: Probe = {
  key: 'cancel-modal',
  legacy: page => page.locator('.v-dialog--active .v-card').first(),
  next: page => page.getByTestId('services-cancel-modal'),
}

/** The modal title (`h6` in the title row, next to the icon and the close button). */
export const cancelModalTitleProbe: Probe = {
  key: 'cancel-modal-title',
  legacy: page => cancelModalProbe.legacy(page).locator('.v-card__title h6'),
  next: page => cancelModalProbe.next(page).locator('.v-card-title h6'),
  internal: true,
}

/** The close (X) button of the title row: the kit `ModalCloseButton` in next, the legacy icon button. */
export const cancelCloseProbe: Probe = {
  key: 'cancel-modal-close',
  legacy: page => cancelModalProbe.legacy(page).locator('.v-card__title .v-btn'),
  next: page => page.getByTestId('services-cancel-close'),
}

/** The warning box above the form (`login-message`, the same class in both apps). */
export const cancelAlertProbe: Probe = {
  key: 'cancel-modal-alert',
  legacy: page => cancelModalProbe.legacy(page).locator('.login-message'),
  next: page => cancelModalProbe.next(page).locator('.login-message'),
  internal: true,
}

/** The reason select (the `v-select` root, which carries the next test id). */
export const cancelReasonProbe: Probe = {
  key: 'cancel-modal-reason',
  legacy: page => cancelModalProbe.legacy(page).locator('.v-select').first(),
  next: page => page.getByTestId('services-cancel-reason'),
}

/** The description field (the `v-textarea` root). */
export const cancelDescribeProbe: Probe = {
  key: 'cancel-modal-describe',
  legacy: page => cancelModalProbe.legacy(page).locator('.v-textarea').first(),
  next: page => page.getByTestId('services-cancel-describe'),
}

/** The primary button of the actions row (Submit: disabled until a reason and 10 characters). */
export const cancelSubmitProbe: Probe = {
  key: 'cancel-modal-submit',
  legacy: page => cancelModalProbe.legacy(page).locator('.v-card__actions .v-btn').first(),
  next: page => page.getByTestId('services-cancel-submit'),
}

/** The text button under Submit (Dismiss). */
export const cancelDismissProbe: Probe = {
  key: 'cancel-modal-dismiss',
  legacy: page => cancelModalProbe.legacy(page).locator('.v-card__actions .v-btn').nth(1),
  next: page => page.getByTestId('services-cancel-dismiss'),
}

export const cancelModalProbes: Probe[] = [
  cancelModalProbe,
  cancelModalTitleProbe,
  cancelCloseProbe,
  cancelAlertProbe,
  cancelReasonProbe,
  cancelDescribeProbe,
  cancelSubmitProbe,
  cancelDismissProbe,
]

/** Description typed into the field: 10+ characters, so Submit turns on with a reason. */
const CANCEL_DESCRIPTION = 'Moving the plan to another provider.'

/** Opens the cancel dialog from the first row's Cancel and waits until its card has settled. */
function openCancelDialog (side: Side): StateAction {
  return async page => {
    await (side === 'legacy' ? cancelProbe.legacy : cancelProbe.next)(page).evaluate(element => (element as HTMLElement).click())
    await settled(cancelModalProbe[side](page))
  }
}

/** Picks the first reason of the open select and types the description; the menu is closed before the capture. */
function fillCancelForm (side: Side): StateAction {
  return async page => {
    const field = side === 'legacy'
      ? cancelReasonProbe.legacy(page).locator('.v-input__slot')
      : cancelReasonProbe.next(page).locator('.v-field')
    await field.click()
    const option = side === 'legacy'
      ? page.locator('.menuable__content__active .v-list-item').first()
      : page.locator('.v-select__content .v-list-item').first()
    await option.click()
    await expect.poll(() => option.isVisible(), { message: 'reason menu closed' }).toBe(false)
    await cancelDescribeProbe[side](page).locator('textarea').fill(CANCEL_DESCRIPTION)
    await settled(cancelModalProbe[side](page))
  }
}

/** `services-cancel-modal` (empty form, Submit disabled) and `services-cancel-modal-filled` (reason and description, Submit on). */
export function cancelModalState (filled: boolean): Omit<ParityState, 'id'> {
  const base = servicesState({ probes: [titleProbe, ...cancelModalProbes] })
  return {
    ...base,
    actions: {
      legacy: [...base.actions.legacy, openCancelDialog('legacy'), ...(filled ? [fillCancelForm('legacy')] : [])],
      next: [...base.actions.next, openCancelDialog('next'), ...(filled ? [fillCancelForm('next')] : [])],
    },
  }
}

// Phase 8: the list and the cancel answer fail. Both apps show one alert with the server message: the list keeps its empty
// state (one `GET /services`, one alert), and the cancel modal stays open with its filled form (the alert is the only change).

/** `GET /services` answers 500 with a message: the list is empty and the alert shows the message. */
export const SERVICES_LIST_500: Handler = { status: 500, json: { message: 'Server Error' } }

/** `PUT /services/5/cancel` answers 422: the modal stays open and the alert shows the message. */
export const SERVICES_CANCEL_422: Handler = { status: 422, json: { message: 'The given data was invalid.', errors: { reason: ['The reason is not valid.'] } } }

/** `services-error`: the list request fails; the alert is awaited last (it closes itself after 5 s). */
export function servicesErrorState (): Omit<ParityState, 'id'> {
  return servicesState({
    list: SERVICES_LIST_500,
    probes: [titleProbe, alertManagerProbe],
    legacy: [waitFor(alertManagerProbe.legacy)],
    next: [waitFor(alertManagerProbe.next)],
  })
}

/** Presses Submit of the open cancel dialog (the form is filled, so it is enabled). */
function submitCancel (side: Side): StateAction {
  return async page => {
    await cancelSubmitProbe[side](page).click()
  }
}

/** `services-cancel-error`: the filled cancel form is submitted and the server answers 422. The modal stays open; the alert is awaited last. */
export function cancelErrorState (): Omit<ParityState, 'id'> {
  const base = cancelModalState(true)
  return {
    ...base,
    handlers: { ...base.handlers, 'PUT /services/5/cancel': SERVICES_CANCEL_422 },
    probes: [...base.probes, alertManagerProbe],
    actions: {
      legacy: [...base.actions.legacy, submitCancel('legacy'), waitFor(alertManagerProbe.legacy)],
      next: [...base.actions.next, submitCancel('next'), waitFor(alertManagerProbe.next)],
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 9: the empty list and the search with no results. Legacy `no-data` slot (V2): `TableFullScreenMessage` while there is no
// search term, `DataIteratorNoResultsContainer` (with "Clear Filter") for a search on an empty list. A search that hides a
// non-empty list shows the Vuetify default text in both apps (`services-no-matches`), which is not one of these states.
// ---------------------------------------------------------------------------------------------

/** The empty-list message (`TableFullScreenMessage`, class `no-data` in both apps). */
export const emptyProbe: Probe = {
  key: 'empty',
  legacy: page => page.locator('.v-main .services-table .no-data'),
  next: page => page.getByTestId('services-empty'),
}

/** The empty-list title copy (`message.emptyTable.services.title`). */
export const emptyTitleProbe: Probe = {
  key: 'empty-title',
  legacy: page => page.getByText(tr('message.emptyTable.services.title', 'lite'), { exact: true }),
  next: page => page.getByText(tr('message.emptyTable.services.title', 'lite'), { exact: true }),
  internal: true,
}

/** The no-results container (`DataIteratorNoResultsContainer`, class `no-results-container` in both apps). */
export const noResultsProbe: Probe = {
  key: 'no-results',
  legacy: page => page.locator('.v-main .services-table .no-results-container'),
  next: page => page.getByTestId('services-no-results'),
}

/** The "Clear Filter" button of the no-results container. */
export const noResultsClearProbe: Probe = {
  key: 'no-results-clear',
  legacy: page => page.locator('.v-main .services-table .no-results-container').getByRole('button', { name: tr('button.clearFilter', 'lite'), exact: true }),
  next: page => page.getByTestId('services-no-results').getByRole('button', { name: tr('button.clearFilter', 'lite'), exact: true }),
}

/** Title, filter controls and table, as the list states (the footer is left out: its pages differ per state). */
const emptyBaseProbes: Probe[] = [titleProbe, statusFilterProbe, searchProbe, tableProbe]

export const emptyProbes: Probe[] = [...emptyBaseProbes, emptyProbe, emptyTitleProbe]

export const searchNoResultsProbes: Probe[] = [...emptyBaseProbes, noResultsProbe, noResultsClearProbe]

/** Search term typed into the list; the list is empty, so the container is the no-results one. */
const NO_RESULTS_TERM = 'zzz-no-match'

/** `services-empty`: `GET /services` answers an empty list and no search term is set. */
export function servicesEmptyState (): Omit<ParityState, 'id'> {
  return servicesState({
    services: [],
    probes: emptyProbes,
    legacy: [waitFor(emptyTitleProbe.legacy)],
    next: [waitFor(emptyTitleProbe.next)],
  })
}

/** `services-search-no-results`: an empty list and a search term that matches nothing. `listSearch` steps the frozen clock past the debounce. */
export function servicesSearchNoResultsState (): Omit<ParityState, 'id'> {
  return servicesState({
    services: [],
    probes: searchNoResultsProbes,
    legacy: [listSearch(NO_RESULTS_TERM), waitFor(noResultsProbe.legacy)],
    next: [listSearch(NO_RESULTS_TERM), waitFor(noResultsProbe.next)],
  })
}

// ---------------------------------------------------------------------------------------------
// Phase 10: loading. Legacy `v-slot:body v-if="loading"` (`ServicesTable.vue:124-132`): five `ServicesTableItemSkeletonMobile` below
// `lgAndDown`, otherwise `ServicesTableSkeletonSort` and `ServicesTableSkeletonItem`. The cancel submit shows its loader while the
// PUT hangs (`CancelServiceButton.vue:87`, `:loading="submitting"`; full primary with a white loader).
// ---------------------------------------------------------------------------------------------

/** The first skeleton bone of the table (desktop sort and item skeletons, or the mobile card skeletons). */
export const skeletonProbe: Probe = {
  key: 'skeleton',
  legacy: page => page.locator('.v-main .services-table .v-skeleton-loader').first(),
  next: page => page.getByTestId('services-table').locator('.v-skeleton-loader').first(),
  internal: true,
}

/** The first skeleton body row (`ServicesTableSkeletonItem`: `tbody.item > tr`); mobile cards have no table row. */
export const skeletonRowProbe: Probe = {
  key: 'skeleton-row',
  legacy: page => page.locator('.v-main .services-table tbody.item tr').first(),
  next: page => page.getByTestId('services-table').locator('tbody.item tr').first(),
}

/** The skeleton bones are masked in both apps (they animate on their own); the probes still read them. */
const skeletonMasks: ParityState['masks'] = {
  legacy: [(page: Page) => page.locator('.v-main .services-table .v-skeleton-loader')],
  next: [(page: Page) => page.getByTestId('services-table').locator('.v-skeleton-loader')],
}

/** `services-loading`: `GET /services` never answers, so the table keeps its skeleton; the skeleton is awaited last (it renders once the request has started). */
export function servicesLoadingState (): Omit<ParityState, 'id'> {
  return servicesState({
    list: 'hold',
    probes: [titleProbe, statusFilterProbe, searchProbe, tableProbe, skeletonRowProbe, skeletonProbe],
    masks: skeletonMasks,
    legacy: [waitFor(skeletonProbe.legacy)],
    next: [waitFor(skeletonProbe.next)],
  })
}

/** Waits until Submit of the open cancel dialog shows its loader (the spinner inside the button). */
function waitForCancelSubmitLoading (side: Side): StateAction {
  return async page => {
    await settled(cancelSubmitProbe[side](page).locator('.v-progress-circular'))
  }
}

/** `services-cancel-loading`: the filled cancel form is submitted and `PUT /services/5/cancel` hangs; Submit shows its loader. */
export function cancelLoadingState (): Omit<ParityState, 'id'> {
  const base = cancelModalState(true)
  const spinnerMask = {
    legacy: [(page: Page) => cancelSubmitProbe.legacy(page).locator('.v-progress-circular')],
    next: [(page: Page) => cancelSubmitProbe.next(page).locator('.v-progress-circular')],
  }
  return {
    ...base,
    handlers: { ...base.handlers, 'PUT /services/5/cancel': 'hold' },
    masks: spinnerMask,
    actions: {
      legacy: [...base.actions.legacy, submitCancel('legacy'), waitForCancelSubmitLoading('legacy')],
      next: [...base.actions.next, submitCancel('next'), waitForCancelSubmitLoading('next')],
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 11: status filter (`services-status-menu`, `services-filter-all`). Legacy `statusFilterOptions` has three options:
// Active, Cancelled, All (`views/Services.vue:137-146`, same in app-lite). Active is `active` + `suspended`; All is every row.
// ---------------------------------------------------------------------------------------------

/** Plan name of the cancelled row added for `services-filter-all` (hidden under Active, so the default fixtures stay as they are). */
const CANCELLED_PLAN = 'Old Plan'

const cancelledService = service({ id: 6, plan_name: CANCELLED_PLAN, status: 'cancelled' })

/** The open status menu: legacy `.menuable__content__active` (the box with the options), next `.v-select__content` in the overlay. */
export const statusMenuProbe: Probe = {
  key: 'status-menu',
  legacy: page => page.locator('.menuable__content__active', { has: page.locator('.v-list-item') }).first(),
  next: page => page.locator('.v-overlay--active .v-select__content').first(),
}

/** The first option of the open menu (Active, the selected one). */
export const statusItemProbe: Probe = {
  key: 'status-item',
  legacy: page => statusMenuProbe.legacy(page).locator('.v-list-item').first(),
  next: page => statusMenuProbe.next(page).locator('.v-list-item').first(),
}

/** The cancelled row (`CANCELLED_PLAN`): shown under All only, without a Cancel button (legacy `ServicesTable.vue:104`). */
export const cancelledRowProbe: Probe = {
  key: 'cancelled-row',
  legacy: page => page.locator('.v-main .services-table tbody tr', { hasText: CANCELLED_PLAN }),
  next: page => page.getByTestId('services-table').locator('tbody tr', { hasText: CANCELLED_PLAN }),
}

/** The status chip of the cancelled row: legacy `CustomLabel` `expires` type, next `services-status-chip`. */
export const cancelledChipProbe: Probe = {
  key: 'cancelled-chip',
  legacy: page => cancelledRowProbe.legacy(page).locator('.additional-services-main .v-chip'),
  next: page => cancelledRowProbe.next(page).getByTestId('services-status-chip'),
}

/** Opens the status menu with a click on the filter field, then waits until the menu is visible and settled. */
function openStatusMenu (side: Side): StateAction {
  return async page => {
    await statusFilterProbe[side](page).click()
    await settled(statusMenuProbe[side](page))
  }
}

/** Picks the option whose text contains `label` and waits until the menu has closed. */
function pickStatus (side: Side, label: string): StateAction {
  return async page => {
    await openStatusMenu(side)(page)
    await statusMenuProbe[side](page).locator('.v-list-item', { hasText: label }).click()
    await expect.poll(() => statusMenuProbe[side](page).isVisible(), { message: 'status menu closed' }).toBe(false)
  }
}

/** `services-status-menu`: the filter menu is open on Active (the pointer stays on the field, so the menu is not reset). */
export function servicesStatusMenuState (): Omit<ParityState, 'id'> {
  const base = servicesState({
    pointer: 'keep',
    probes: [titleProbe, statusFilterProbe, statusMenuProbe, statusItemProbe],
  })
  return {
    ...base,
    actions: {
      legacy: [...base.actions.legacy, openStatusMenu('legacy')],
      next: [...base.actions.next, openStatusMenu('next')],
    },
  }
}

/** `services-filter-all`: All is picked, so the cancelled row shows its status chip and no Cancel button. */
export function servicesFilterAllState (): Omit<ParityState, 'id'> {
  const base = servicesState({
    services: [...defaultServices, cancelledService],
    probes: [...listProbes, cancelledRowProbe, cancelledChipProbe],
  })
  return {
    ...base,
    actions: {
      legacy: [...base.actions.legacy, pickStatus('legacy', 'All'), waitFor(cancelledRowProbe.legacy)],
      next: [...base.actions.next, pickStatus('next', 'All'), waitFor(cancelledRowProbe.next)],
    },
  }
}
