import type { HostingStateOptions } from './hosting'
import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled } from './auth'
import { emailDomain, hostingService, hostingState } from './hosting'
import { isDesktop } from './shell'

// S-117 ui-email-forwarders (measured on app-lite, `target: 'lite'`, My server tab): `/hosting/email-forwarders`. Not a spec file
// (testMatch is `*.parity.ts`); the states are in `hosting-email-forwarders.parity.ts`. Legacy: app-lite
// `views/hosting/EmailForwarders.vue` (identical in app). Calls: `email-forwarders.api.ts`, domains from `GET /services/{id}/email/domains`.

export const EMAIL_FORWARDERS_PATH = '/hosting/email-forwarders'

export function forwardersPath (domainId: number): string {
  return `GET /services/1/email/domains/${domainId}/forwarders`
}

// ---------------------------------------------------------------------------------------------
// Probes (legacy `views/hosting/EmailForwarders.vue`, `HostingTable`; next `EmailForwardersView.vue`, `data-testid` `email-forwarders-*`)
// ---------------------------------------------------------------------------------------------

export const forwardersTitleProbe: Probe = {
  key: 'forwarders-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('email-forwarders-title'),
}

export const forwardersTitleColProbe: Probe = {
  key: 'forwarders-title-col',
  legacy: page => page.locator('.v-main .title-row > div').first(),
  next: page => page.locator('.email-forwarders-title-col'),
}

export const forwardersFilterColProbe: Probe = {
  key: 'forwarders-filter-col',
  legacy: page => page.locator('.v-main .title-row .page-title__filter-controls'),
  next: page => page.locator('.title-row .page-title__filter-controls'),
}

export const forwardersAddProbe: Probe = {
  key: 'forwarders-add',
  legacy: page => page.locator('.v-main .title-row .add-new-button'),
  next: page => page.getByTestId('email-forwarders-add'),
}

export const forwardersSearchProbe: Probe = {
  key: 'forwarders-search',
  legacy: page => page.locator('.v-main .my-hostings-search'),
  next: page => page.getByTestId('email-forwarders-search'),
}

export const forwardersDomainProbe: Probe = {
  key: 'forwarders-domain',
  legacy: page => page.locator('.v-main .acc-select-group .v-select'),
  next: page => page.getByTestId('email-forwarders-domain'),
}

export const forwardersDomainGroupProbe: Probe = {
  key: 'forwarders-domain-group',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.locator('.acc-select-group').first(),
}

// Legacy's group sits directly in its `v-col`; next wraps it once more, so the column is the parent here and the grandparent there.
export const forwardersDomainColProbe: Probe = {
  key: 'forwarders-domain-col',
  legacy: page => page.locator('.v-main .acc-select-group').locator('xpath=..'),
  next: page => page.locator('.acc-select-group').first().locator('xpath=../..'),
}

export const forwardersDomainLabelProbe: Probe = {
  key: 'forwarders-domain-label',
  legacy: page => page.locator('.v-main .acc-select-label'),
  next: page => page.locator('.acc-select-label').first(),
}

export const forwardersTableProbe: Probe = {
  key: 'forwarders-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('email-forwarders-table'),
}

const forwardersRows = (page: Page, next: boolean) => (next ? page.getByTestId('email-forwarders-table') : page.locator('.v-main .data-table')).locator('tbody tr')

export const forwardersRowProbe: Probe = {
  key: 'forwarders-row',
  legacy: page => forwardersRows(page, false).first(),
  next: page => forwardersRows(page, true).first(),
}

export const forwardersRowActionsProbe: Probe = {
  key: 'forwarders-row-actions',
  legacy: page => forwardersRows(page, false).first().locator('.actions-row').first(),
  next: page => forwardersRows(page, true).first().locator('.actions-row').first(),
  when: isDesktop,
}

// Hover overlays (V2 paints `::before`, V4 `.v-btn__overlay`) and the Delete tooltip of the first row (`open-delay` 150 ms, desktop only).
export const forwardersAddOverlayProbe: Probe = {
  key: 'forwarders-add-overlay',
  legacy: forwardersAddProbe.legacy,
  next: page => forwardersAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The first row's Delete icon (the only icon of `.actions-row`). */
export const forwardersRowDeleteProbe: Probe = {
  key: 'forwarders-row-delete',
  legacy: page => forwardersRows(page, false).first().locator('.actions-row .v-btn').first(),
  next: page => forwardersRows(page, true).first().locator('.actions-row .v-btn').first(),
  when: isDesktop,
}

export const forwardersDeleteOverlayProbe: Probe = {
  key: 'forwarders-delete-overlay',
  legacy: forwardersRowDeleteProbe.legacy,
  next: page => forwardersRowDeleteProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

export const forwardersDeleteTooltipProbe: Probe = {
  key: 'forwarders-delete-tooltip',
  legacy: page => page.locator('.menuable__content__active').filter({ hasText: 'Delete' }),
  next: page => page.locator('.v-overlay--active .v-overlay__content').filter({ hasText: 'Delete' }),
  when: isDesktop,
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** The service with the email server on (the page is hidden without it). */
export const emailService = hostingService({ email_server_enabled: true })

/** One `GET /services/{id}/email/domains/{domainId}/forwarders` item. */
export function emailForwarder (overrides: Record<string, unknown> = {}) {
  return {
    email: 'info@example.com',
    forward_to: 'owner@gmail.com',
    updated_at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

export function emailForwardersBody (items: unknown[]) {
  return { data: items }
}

/** The domains answer; the records flag (`is_email_dns_records_showed`) shows the SPF/DKIM chip. Off for the default state. */
export function emailDomainsBody (domains: unknown[], recordsShown = false) {
  return { data: domains, meta: { is_email_dns_records_showed: recordsShown } }
}

export const twoDomains = [
  emailDomain(),
  emailDomain({ id: 2, domain: 'shop.example.com' }),
]

/** Three forwarders; the third was never updated, so its "updated" cell is `-`. */
export const forwarders = [
  emailForwarder(),
  emailForwarder({ email: 'sales@example.com', forward_to: 'sales-team@gmail.com', updated_at: '2026-09-18T08:30:00.000Z' }),
  emailForwarder({ email: 'support@example.com', forward_to: 'support@gmail.com', updated_at: null }),
]

/** Twelve forwarders: two pages of eight and four rows, so the footer shows two pages (page 1 of a paged list, as the FTP and email paged states). */
export const manyForwarders = Array.from({ length: 12 }, (_, index) => emailForwarder({
  email: `info${index + 1}@example.com`,
  forward_to: `owner${index + 1}@gmail.com`,
  updated_at: '2026-09-20T10:00:00.000Z',
}))

// ---------------------------------------------------------------------------------------------
// Base state builder
// ---------------------------------------------------------------------------------------------

/**
 * The page on lite: `hostingState` with the lite shell and the email service. The forwarders list and the domains answer
 * are the defaults; a state overrides them through `options` (`handlers` extends the map).
 */
export function forwardersBase (options: Partial<HostingStateOptions> = {}): Omit<ParityState, 'id'> {
  const { handlers, ...rest } = options
  const listHandler: Record<string, Handler> = { [forwardersPath(1)]: { json: emailForwardersBody(forwarders) } }
  return hostingState({
    lite: true,
    path: EMAIL_FORWARDERS_PATH,
    services: [emailService],
    emailDomains: { json: emailDomainsBody(twoDomains) },
    ready: forwardersTitleProbe,
    ...rest,
    handlers: { ...listHandler, ...handlers },
    probes: [
      forwardersTitleProbe,
      forwardersTitleColProbe,
      forwardersFilterColProbe,
      forwardersAddProbe,
      forwardersSearchProbe,
      forwardersDomainColProbe,
      forwardersDomainGroupProbe,
      forwardersDomainLabelProbe,
      forwardersDomainProbe,
      forwardersTableProbe,
      forwardersRowProbe,
      forwardersRowActionsProbe,
      ...(rest.probes ?? []),
    ],
  })
}

// ---------------------------------------------------------------------------------------------
// Phase 8: the Add modal (legacy `EmailForwardersActionsMixin.js:5-48`; next `BasicModal` `data-testid="email-forwarders-modal"`)
// ---------------------------------------------------------------------------------------------

const forwardersModalBox = (page: Page) => page.locator('.basic-modal')

export const forwardersModalProbe: Probe = {
  key: 'forwarders-modal',
  legacy: page => forwardersModalBox(page),
  next: page => page.getByTestId('email-forwarders-modal'),
}

export const forwardersModalTitleProbe: Probe = {
  key: 'forwarders-modal-title',
  legacy: page => forwardersModalBox(page).locator('h6'),
  next: page => page.getByTestId('email-forwarders-modal').locator('h6'),
}

/** A modal field by name; legacy has no name hook, so it is the n-th field of the form (BasicModalField order). */
export function forwardersModalFieldProbe (name: string, index: number): Probe {
  return {
    key: `forwarders-modal-field-${name}`,
    legacy: page => forwardersModalBox(page).locator('form > div').nth(index),
    next: page => page.getByTestId(`email-forwarders-modal-field-${name}`),
  }
}

/** The modal's submit button (Add). Legacy is Vuetify 2 (`.v-card__actions`), next Vuetify 4 (`.v-card-actions`). */
export const forwardersModalSubmit = (page: Page, next: boolean) => forwardersModalBox(page).locator(next ? '.v-card-actions .v-btn' : '.v-card__actions .v-btn').first()

export const forwardersModalSubmitProbe: Probe = {
  key: 'forwarders-modal-submit',
  legacy: page => forwardersModalSubmit(page, false),
  next: page => forwardersModalSubmit(page, true),
}

/** The two fields of the Add form: the address (`text-select`, the domain picked on the page) and the destination. */
const forwardersAddEmailProbe = forwardersModalFieldProbe('email', 0)
const forwardersAddDestinationProbe = forwardersModalFieldProbe('destination', 1)
export const forwardersAddFieldProbes = [forwardersAddEmailProbe, forwardersAddDestinationProbe]

/** Opens the Add modal from the header's Add button (desktop and mobile share it). */
export function openAddModal (next: boolean): StateAction {
  return async page => {
    await (next ? forwardersAddProbe.next(page) : forwardersAddProbe.legacy(page)).click()
    await settled(forwardersModalBox(page))
  }
}

/**
 * Focuses the address, then the destination (the address rule shows on blur, as legacy `TextSelectInput.setFocus`), then presses Add.
 * The submit runs the form rules: the destination shows its required message. Legacy never sends the request, so no POST handler is needed.
 */
export function submitAddWithErrors (next: boolean): StateAction {
  return async page => {
    const email = next ? forwardersAddEmailProbe.next : forwardersAddEmailProbe.legacy
    const destination = next ? forwardersAddDestinationProbe.next : forwardersAddDestinationProbe.legacy
    await email(page).locator('input').first().click()
    await destination(page).locator('input').first().click()
    await forwardersModalSubmit(page, next).click()
    await expect(destination(page).locator('.v-messages__message').first()).toBeVisible()
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 9: error states (legacy `EmailForwarders.vue` list `catch` and `EmailForwardersActionsMixin.js` Add `catch`: both show the alert)
// ---------------------------------------------------------------------------------------------

/** The list request fails: the alert shows and the table is gone (next `isError` hides it, legacy has no table either). */
export const forwardersListError: Handler = { status: 500, json: { message: 'Server Error' } }

/** The POST of the Add form answers 422 (the address is taken): the modal stays open and the alert shows. */
export const forwardersAddError: Handler = { status: 422, json: { message: 'The given data was invalid.', errors: { email: ['The email has already been taken.'] } } }

/** The POST of the Add form for the first domain (`forwardersPath(1)` with `POST`). */
export const forwardersPostPath = forwardersPath(1).replace('GET ', 'POST ')

/** Fills the Add form with a valid address and destination, then presses Add (the POST answers with the state's handler). */
export function fillAndSubmitAdd (next: boolean): StateAction {
  return async page => {
    const email = next ? forwardersAddEmailProbe.next : forwardersAddEmailProbe.legacy
    const destination = next ? forwardersAddDestinationProbe.next : forwardersAddDestinationProbe.legacy
    await email(page).locator('input').first().fill('parity-forward')
    await destination(page).locator('input').first().fill('owner@gmail.com')
    await forwardersModalSubmit(page, next).click()
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 10: the Delete modal (legacy `EmailForwardersActionsMixin.js:86-110`; next `BasicModal` `data-testid="email-forwarders-modal"`, the
// checkbox field `email-forwarders-modal-field-confirm`). One checkbox; Delete stays disabled until it is ticked.
// ---------------------------------------------------------------------------------------------

/** The `confirm` checkbox of the Delete modal (the only field of the form). */
export const forwardersDeleteConfirmProbe = forwardersModalFieldProbe('confirm', 0)

/**
 * Opens the Delete modal from the first row's icon by a DOM click (desktop: the `.actions-row` icon; mobile: the actions row of the card,
 * which HostingTable renders on both sides). A DOM click neither scrolls nor moves the pointer.
 */
export function openForwarderDeleteModal (next: boolean): StateAction {
  return async page => {
    await forwardersRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').first().evaluate(node => (node as HTMLElement).click())
    await settled(forwardersModalBox(page))
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 11: empty states (legacy `HostingTable` `.no-data` and `.no-results-container`; next `email-forwarders-empty`, `-empty-add`, `.no-results-container` in the table)
// ---------------------------------------------------------------------------------------------

export const forwardersEmptyProbe: Probe = {
  key: 'forwarders-empty',
  legacy: page => page.locator('.v-main .data-table .no-data'),
  next: page => page.getByTestId('email-forwarders-empty'),
}

export const forwardersEmptyAddProbe: Probe = {
  key: 'forwarders-empty-add',
  legacy: page => page.locator('.v-main .data-table .no-data .v-btn'),
  next: page => page.getByTestId('email-forwarders-empty-add'),
}

export const forwardersNoResultsProbe: Probe = {
  key: 'forwarders-no-results',
  legacy: page => page.locator('.v-main .data-table .no-results-container'),
  next: page => page.getByTestId('email-forwarders-table').locator('.no-results-container'),
}

// ---------------------------------------------------------------------------------------------
// Phase 13: SPF/DKIM chip, records dot, domain menu, records modal (legacy `EmailForwarders.vue` `.record-configuration` and `.select-dot`,
// the same markup as `EmailAddresses.vue`; next the shared `EmailDomainSelector` and `RecordConfiguration`, kit not edited here)
// ---------------------------------------------------------------------------------------------

/** Domain 1 with a DKIM and an SPF record; domain 2 (`shop.example.com`) with its own records. */
const recordDomain = emailDomain({
  dkim_records: [{ name: 'default._domainkey.example.com', type: 'TXT', value: 'v=DKIM1; p=KEY' }],
  spf_records: [{ name: 'example.com', type: 'TXT', value: 'v=spf1 include:mail.example.net -all' }],
})
const shopRecordDomain = emailDomain({
  id: 2,
  domain: 'shop.example.com',
  dkim_records: [{ name: 'default._domainkey.shop.example.com', type: 'TXT', value: 'v=DKIM1; p=SHOP' }],
  spf_records: [{ name: 'shop.example.com', type: 'TXT', value: 'v=spf1 -all' }],
})
/** The domains answer with the records flag on: the SPF/DKIM chip shows. */
export const recordDomains = emailDomainsBody([recordDomain, shopRecordDomain], true)

/** dns.google answers a TXT query with the value of `answers[name]`; any other name has no record (the check fails). */
export function dnsAnswers (answers: Record<string, string>) {
  return ({ query }: { query: URLSearchParams }) => {
    const value = answers[query.get('name') ?? '']
    return { json: value === undefined ? { Status: 0 } : { Status: 0, Answer: [{ type: 16, data: value }] } }
  }
}

export const recordAnswers = {
  'default._domainkey.example.com': '"v=DKIM1; p=KEY"',
  'example.com': '"v=spf1 include:mail.example.net -all"',
  'default._domainkey.shop.example.com': '"v=DKIM1; p=SHOP"',
  'shop.example.com': '"v=spf1 -all"',
}

/** The SPF/DKIM chip (legacy `.v-main .record-configuration`, next `.record-configuration`; the same class on both sides). */
export const forwardersRecordsProbe: Probe = {
  key: 'forwarders-records',
  legacy: page => page.locator('.v-main .record-configuration'),
  next: page => page.locator('.record-configuration'),
}

/** The selected domain's dot (`.select-dot`) inside the selector group. */
export const forwardersDomainDotProbe: Probe = {
  key: 'forwarders-domain-dot',
  legacy: page => page.locator('.v-main .acc-select-group .select-dot'),
  next: page => page.locator('.acc-select-group .select-dot'),
}

/** The open domain menu. Legacy is a `v-menu`, next a V4 overlay; both teleported, so the probe reads the overlay. */
const nextForwardersDomainMenu = (page: Page) => page.locator('.v-overlay--active .v-overlay__content')

export const forwardersDomainMenuProbe: Probe = {
  key: 'forwarders-domain-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: nextForwardersDomainMenu,
}

/** The dot of a domain in the open menu (the failing domain). */
export const forwardersDomainMenuDotProbe: Probe = {
  key: 'forwarders-domain-menu-dot',
  legacy: page => page.locator('.menuable__content__active .select-dot'),
  next: page => nextForwardersDomainMenu(page).locator('.select-dot'),
}

/** The SPF & DKIM records modal (`RecordConfiguration`, the card root carries the same class on both sides). */
export const forwardersRecordsModalProbe: Probe = {
  key: 'forwarders-records-modal',
  legacy: page => page.locator('.record-configuration-modal'),
  next: page => page.locator('.record-configuration-modal'),
}

export const forwardersRecordsTitleProbe: Probe = {
  key: 'forwarders-records-title',
  legacy: page => page.locator('.record-configuration-modal .v-card__title'),
  next: page => page.locator('.record-configuration-modal .v-card-title'),
}

export const forwardersRecordsTextProbe: Probe = {
  key: 'forwarders-records-text',
  legacy: page => page.locator('.record-configuration-modal .v-card__text'),
  next: page => page.locator('.record-configuration-modal .v-card-text'),
}

export const forwardersRecordsBoxTitleProbe: Probe = {
  key: 'forwarders-records-box-title',
  legacy: page => page.locator('.record-configuration-modal .record-box-title').first(),
  next: page => page.locator('.record-configuration-modal .record-box-title').first(),
}

export const forwardersRecordsActionsProbe: Probe = {
  key: 'forwarders-records-actions',
  legacy: page => page.locator('.record-configuration-modal .v-card__actions'),
  next: page => page.locator('.record-configuration-modal .v-card-actions'),
}

/** Clicks the records chip (legacy `.v-main .record-configuration`, next `.record-configuration`). */
export function clickForwardersRecordsChip (next: boolean): StateAction {
  return async page => {
    // DOM click, no scrollIntoView: on mobile the page overflows horizontally (Style Manager panel) and a Playwright click would scroll it on one side only.
    await (next ? forwardersRecordsProbe.next : forwardersRecordsProbe.legacy)(page).evaluate(node => (node as HTMLElement).click())
  }
}

/** Opens the domain menu by a click on the selector (the same element on both sides). */
export function openForwardersDomainMenu (next: boolean): StateAction {
  return async page => {
    await (next ? forwardersDomainProbe.next : forwardersDomainProbe.legacy)(page).click()
    await settled(next ? nextForwardersDomainMenu(page) : page.locator('.menuable__content__active'))
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 14: pagination (legacy `HostingTable` footer, `.data-iterator-footer`; next the same class in `email-forwarders-table`)
// ---------------------------------------------------------------------------------------------

/** The pagination footer of the forwarders table (`DataIteratorFooter`). */
export const forwardersFooterProbe: Probe = {
  key: 'forwarders-footer',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer'),
  next: page => page.getByTestId('email-forwarders-table').locator('.data-iterator-footer'),
}

/** The active page number of the footer (V2 `v-pagination__item--active` on the button, V4 `v-pagination__item--is-active` on the `li`; the probe takes its `.v-btn`). */
export const forwardersPageActiveProbe: Probe = {
  key: 'forwarders-page-active',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer .v-pagination__item--active'),
  next: page => page.getByTestId('email-forwarders-table').locator('.data-iterator-footer .v-pagination__item--is-active .v-btn'),
}
