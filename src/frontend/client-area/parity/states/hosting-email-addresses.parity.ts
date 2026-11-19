import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { settled } from './auth'
import { alertManagerProbe, emailAccount, emailAccountDetails, emailAccountsBody, emailDomain, hostingService, hostingState, listSearch, waitFor } from './hosting'
import { isDesktopViewport } from './instances'
import { hovered } from './sftp'
import { isDesktop } from './shell'

// S-116 ui-email-addresses (My server, `/hosting/email-addresses`): target `lite` (M-2 default). The page is identical in app and app-lite
// (roadmap OQ10), so the legacy side of each state is the same code; plan: context/changes/ui-email-addresses/plan.md.
// S-39 hosting-email-addresses: `/hosting/email-addresses`, target `app` in M-1 (ported page, roadmap OQ10).
// Builder and fixtures: `hosting.ts` (`emailDomain`, `emailAccount`, `emailAccountsBody`, `emailAccountDetails`). Each state id is a
// literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Plan: context/changes/hosting-email-addresses/plan.md.
// Phase 1 covers the list, loading, empty, no-domains, no-results, paged and error states. Phase 2 adds the SPF/DKIM chip, the records
// dot, the domain menu and the records modal (`hosting-email-addresses-records-*`, `-domain-menu`). Phase 3 adds the Add and Edit
// modals (`hosting-email-addresses-add-modal*`, `-edit-modal*`). Phase 4 adds the Delete and Details modals (`-delete-modal`, `-details-modal`).
// Every state runs in all variants (light and dark desktop, light mobile).

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/EmailAddresses.vue, components/dataIterator/tables/HostingTable.vue)
// ---------------------------------------------------------------------------------------------

export const emailTitleProbe: Probe = {
  key: 'email-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('email-addresses-title'),
}

export const emailFilterColProbe: Probe = {
  key: 'email-filter-col',
  legacy: page => page.locator('.v-main .title-row .page-title__filter-controls'),
  next: page => page.locator('.title-row .page-title__filter-controls'),
}

export const emailAddProbe: Probe = {
  key: 'email-add',
  legacy: page => page.locator('.v-main .title-row .add-new-button'),
  next: page => page.getByTestId('email-addresses-add'),
}

export const emailSearchProbe: Probe = {
  key: 'email-search',
  legacy: page => page.locator('.v-main .my-hostings-search'),
  next: page => page.getByTestId('email-addresses-search'),
}

export const emailDomainProbe: Probe = {
  key: 'email-domain',
  legacy: page => page.locator('.v-main .acc-select-group .v-select'),
  next: page => page.getByTestId('email-addresses-domain'),
}

export const emailDomainGroupProbe: Probe = {
  key: 'email-domain-group',
  legacy: page => page.locator('.v-main .acc-select-group'),
  next: page => page.locator('.acc-select-group').first(),
}

// Legacy's group sits directly in its `v-col`; next wraps it once more, so the column is the parent here and the grandparent there.
export const emailDomainColProbe: Probe = {
  key: 'email-domain-col',
  legacy: page => page.locator('.v-main .acc-select-group').locator('xpath=..'),
  next: page => page.locator('.acc-select-group').first().locator('xpath=../..'),
}

export const emailDomainLabelProbe: Probe = {
  key: 'email-domain-label',
  legacy: page => page.locator('.v-main .acc-select-label'),
  next: page => page.locator('.acc-select-label').first(),
}

export const emailTableProbe: Probe = {
  key: 'email-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('email-addresses-table'),
}

const emailRows = (page: Page, next: boolean) => (next ? page.getByTestId('email-addresses-table') : page.locator('.v-main .data-table')).locator('tbody tr')

export const emailRowProbe: Probe = {
  key: 'email-row',
  legacy: page => emailRows(page, false).first(),
  next: page => emailRows(page, true).first(),
}

export const emailActionsProbe: Probe = {
  key: 'email-actions',
  legacy: page => emailRows(page, false).first().locator('.actions-row').first(),
  next: page => emailRows(page, true).first().locator('.actions-row').first(),
  when: isDesktop,
}

export const emailEmptyProbe: Probe = {
  key: 'email-empty',
  legacy: page => page.locator('.v-main .data-table .no-data'),
  next: page => page.getByTestId('email-addresses-empty'),
}

export const emailEmptyAddProbe: Probe = {
  key: 'email-empty-add',
  legacy: page => page.locator('.v-main .data-table .no-data .v-btn'),
  next: page => page.getByTestId('email-addresses-empty-add'),
}

export const emailNoResultsProbe: Probe = {
  key: 'email-no-results',
  legacy: page => page.locator('.v-main .data-table .no-results-container'),
  next: page => page.getByTestId('email-addresses-table').locator('.no-results-container'),
}

/** The SPF/DKIM chip (legacy `.record-configuration`, the same class on both sides). */
export const emailRecordsProbe: Probe = {
  key: 'email-records',
  legacy: page => page.locator('.v-main .record-configuration'),
  next: page => page.locator('.record-configuration'),
}

/** The selected domain's dot (`.select-dot`) inside the selector group. */
export const emailDomainDotProbe: Probe = {
  key: 'email-domain-dot',
  legacy: page => page.locator('.v-main .acc-select-group .select-dot'),
  next: page => page.locator('.acc-select-group .select-dot'),
}

/** The open domain menu. Legacy is a `v-menu`, next a V4 overlay; both teleported, so the probe reads the overlay. */
const nextDomainMenu = (page: Page) => page.locator('.v-overlay--active .v-overlay__content')

export const emailDomainMenuProbe: Probe = {
  key: 'email-domain-menu',
  legacy: page => page.locator('.menuable__content__active'),
  next: nextDomainMenu,
}

/** The dot of a domain in the open menu (the failing domain). */
export const emailDomainMenuDotProbe: Probe = {
  key: 'email-domain-menu-dot',
  legacy: page => page.locator('.menuable__content__active .select-dot'),
  next: page => nextDomainMenu(page).locator('.select-dot'),
}

/** The SPF & DKIM records modal (`RecordConfiguration`, the card root carries the same class on both sides). */
export const emailRecordsModalProbe: Probe = {
  key: 'email-records-modal',
  legacy: page => page.locator('.record-configuration-modal'),
  next: page => page.locator('.record-configuration-modal'),
}

export const emailRecordsTitleProbe: Probe = {
  key: 'email-records-title',
  legacy: page => page.locator('.record-configuration-modal .v-card__title'),
  next: page => page.locator('.record-configuration-modal .v-card-title'),
}

export const emailRecordsTextProbe: Probe = {
  key: 'email-records-text',
  legacy: page => page.locator('.record-configuration-modal .v-card__text'),
  next: page => page.locator('.record-configuration-modal .v-card-text'),
}

export const emailRecordsBoxTitleProbe: Probe = {
  key: 'email-records-box-title',
  legacy: page => page.locator('.record-configuration-modal .record-box-title').first(),
  next: page => page.locator('.record-configuration-modal .record-box-title').first(),
}

export const emailRecordsActionsProbe: Probe = {
  key: 'email-records-actions',
  legacy: page => page.locator('.record-configuration-modal .v-card__actions'),
  next: page => page.locator('.record-configuration-modal .v-card-actions'),
}

export const emailFooterProbe: Probe = {
  key: 'email-footer',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer'),
  next: page => page.getByTestId('email-addresses-table').locator('.data-iterator-footer'),
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const accountsPath = (domainId: number) => `GET /services/1/email/domains/${domainId}/accounts`

/** The domains answer; the records flag (`is_email_dns_records_showed`) shows the SPF/DKIM chip. Off for the phase-1 states. */
const emailDomainsBody = (domains: unknown[], recordsShown = false) => ({ data: domains, meta: { is_email_dns_records_showed: recordsShown } })

const twoDomains = [
  emailDomain(),
  emailDomain({ id: 2, domain: 'shop.example.com' }),
]

/** Three accounts: two with a limit, one unlimited, one never updated (its "updated" cell is `-`). */
const emailAccounts = [
  emailAccount(),
  emailAccount({ email: 'sales@example.com', disk_usage: 3, disk_quota: 'unlimited', updated_at: '2026-09-18T08:30:00.000Z' }),
  emailAccount({ email: 'support@example.com', disk_usage: 40, disk_quota: 1024, updated_at: null }),
]

/** Ten accounts: two pages of eight and two rows, so the footer shows two pages (page 1, as FTP's paged state). */
const emailManyAccounts = Array.from({ length: 10 }, (_, index) => emailAccount({
  email: `user${index + 1}@example.com`,
  disk_usage: 10 * (index + 1),
  disk_quota: 1024,
  updated_at: '2026-09-20T10:00:00.000Z',
}))

/** Handlers every state shares; a state overrides the domains or the accounts. */
const base = {
  path: '/hosting/email-addresses',
  lite: true,
  ready: emailTitleProbe,
  services: [hostingService({ email_server_enabled: true })],
  emailDomains: { json: emailDomainsBody(twoDomains) },
  handlers: {
    [accountsPath(1)]: { json: emailAccountsBody(emailAccounts) },
    'GET /services/1/email/domains/1/accounts/info@example.com': { json: emailAccountDetails() },
  },
}

// ---------------------------------------------------------------------------------------------
// Phase 1: list, loading, empty, no domains, no results, paged and error
// ---------------------------------------------------------------------------------------------

export const hostingEmailAddressesList: ParityState = {
  id: 'hosting-email-addresses-list',
  ...hostingState({
    ...base,
    probes: [emailTitleProbe, emailFilterColProbe, emailAddProbe, emailSearchProbe, emailDomainColProbe, emailDomainGroupProbe, emailDomainLabelProbe, emailDomainProbe, emailTableProbe, emailRowProbe, emailActionsProbe],
  }),
}

export const hostingEmailAddressesLoading: ParityState = {
  id: 'hosting-email-addresses-loading',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [accountsPath(1)]: 'hold',
    },
    probes: [emailTitleProbe, emailDomainProbe, emailTableProbe],
  }),
}

export const hostingEmailAddressesDomainsLoading: ParityState = {
  id: 'hosting-email-addresses-domains-loading',
  ...hostingState({
    ...base,
    // The accounts are not requested until the domains answer: the empty state shows meanwhile (legacy flag order).
    emailDomains: 'hold',
    probes: [emailTitleProbe, emailDomainProbe, emailTableProbe, emailEmptyProbe],
  }),
}

export const hostingEmailAddressesEmpty: ParityState = {
  id: 'hosting-email-addresses-empty',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [accountsPath(1)]: { json: emailAccountsBody([]) },
    },
    probes: [emailTitleProbe, emailTableProbe, emailEmptyProbe, emailEmptyAddProbe],
  }),
}

export const hostingEmailAddressesNoDomains: ParityState = {
  id: 'hosting-email-addresses-no-domains',
  ...hostingState({
    ...base,
    emailDomains: { json: emailDomainsBody([]) },
    probes: [emailTitleProbe, emailDomainProbe, emailTableProbe, emailEmptyProbe, emailEmptyAddProbe],
  }),
}

export const hostingEmailAddressesNoResults: ParityState = {
  id: 'hosting-email-addresses-no-results',
  ...hostingState({
    ...base,
    legacy: [listSearch('no-such-account')],
    next: [listSearch('no-such-account')],
    probes: [emailTitleProbe, emailAddProbe, emailSearchProbe, emailTableProbe, emailNoResultsProbe],
  }),
}

export const hostingEmailAddressesPaged: ParityState = {
  id: 'hosting-email-addresses-paged',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [accountsPath(1)]: { json: emailAccountsBody(emailManyAccounts) },
    },
    probes: [emailTitleProbe, emailAddProbe, emailSearchProbe, emailTableProbe, emailRowProbe, emailFooterProbe],
  }),
}

export const hostingEmailAddressesError: ParityState = {
  id: 'hosting-email-addresses-error',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      [accountsPath(1)]: { status: 500, json: { message: 'Server Error' } },
    },
    ready: alertManagerProbe,
    probes: [emailTitleProbe, alertManagerProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 2: SPF/DKIM chip, records dot, domain menu, records modal
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
const recordDomains = emailDomainsBody([recordDomain, shopRecordDomain], true)

/** dns.google answers a TXT query with the value of `answers[name]`; any other name has no record (the check fails). */
function dnsAnswers (answers: Record<string, string>) {
  return ({ query }: { query: URLSearchParams }) => {
    const value = answers[query.get('name') ?? '']
    return { json: value === undefined ? { Status: 0 } : { Status: 0, Answer: [{ type: 16, data: value }] } }
  }
}

const recordAnswers = {
  'default._domainkey.example.com': '"v=DKIM1; p=KEY"',
  'example.com': '"v=spf1 include:mail.example.net -all"',
  'default._domainkey.shop.example.com': '"v=DKIM1; p=SHOP"',
  'shop.example.com': '"v=spf1 -all"',
}

/** Chip click (legacy `.v-main .record-configuration`, next `.record-configuration`). */
function clickRecordsChip (selector: string): StateAction {
  return async page => {
    await page.locator(selector).click()
  }
}

/** The records chip: the records are published for both domains, so both verdicts are configured. */
export const hostingEmailAddressesRecordsOk: ParityState = {
  id: 'hosting-email-addresses-records-ok',
  ...hostingState({
    ...base,
    emailDomains: { json: recordDomains },
    external: { 'dns.google': dnsAnswers(recordAnswers) },
    // No failing domain here, so the dot is absent on both sides and is not probed (a both-missing probe would pass silently).
    probes: [emailTitleProbe, emailDomainProbe, emailRecordsProbe, emailTableProbe],
  }),
}

/** No DNS record answers: the selected domain's chip is red and it has the dot. */
export const hostingEmailAddressesRecordsFailed: ParityState = {
  id: 'hosting-email-addresses-records-failed',
  ...hostingState({
    ...base,
    emailDomains: { json: recordDomains },
    probes: [emailTitleProbe, emailDomainProbe, emailRecordsProbe, emailDomainDotProbe, emailTableProbe],
  }),
}

/** dns.google never answers: the chip shows its skeletons. */
export const hostingEmailAddressesRecordsLoading: ParityState = {
  id: 'hosting-email-addresses-records-loading',
  ...hostingState({
    ...base,
    emailDomains: { json: recordDomains },
    external: { 'dns.google': 'hold' },
    probes: [emailTitleProbe, emailDomainProbe, emailRecordsProbe, emailTableProbe],
  }),
}

/** The domain menu open: the failing second domain has the dot in its item. Only example.com has its records in DNS. */
export const hostingEmailAddressesDomainMenu: ParityState = {
  id: 'hosting-email-addresses-domain-menu',
  ...hostingState({
    ...base,
    emailDomains: { json: recordDomains },
    external: {
      'dns.google': dnsAnswers({
        'default._domainkey.example.com': recordAnswers['default._domainkey.example.com'],
        'example.com': recordAnswers['example.com'],
      }),
    },
    pointer: 'keep',
    legacy: [async page => {
      await page.locator('.v-main .acc-select-group .v-select').click()
      await settled(page.locator('.menuable__content__active'))
    }],
    next: [async page => {
      await page.getByTestId('email-addresses-domain').locator('.v-field').click()
      await settled(nextDomainMenu(page))
    }],
    probes: [emailTitleProbe, emailDomainProbe, emailDomainMenuProbe, emailDomainMenuDotProbe],
  }),
}

/** The records modal: the chip opens it for the selected domain; its DKIM list is empty, so it shows the no-records text. */
const modalDomain = emailDomain({
  dkim_records: [],
  spf_records: [{ name: 'example.com', type: 'TXT', value: 'v=spf1 include:mail.example.net -all' }],
})
export const hostingEmailAddressesRecordsModal: ParityState = {
  id: 'hosting-email-addresses-records-modal',
  ...hostingState({
    ...base,
    emailDomains: { json: emailDomainsBody([modalDomain, shopRecordDomain], true) },
    external: { 'dns.google': dnsAnswers(recordAnswers) },
    legacy: [clickRecordsChip('.v-main .record-configuration'), waitFor(page => page.locator('.record-configuration-modal'))],
    next: [clickRecordsChip('.record-configuration'), waitFor(page => page.locator('.record-configuration-modal'))],
    probes: [emailTitleProbe, emailRecordsModalProbe, emailRecordsTitleProbe, emailRecordsTextProbe, emailRecordsActionsProbe, emailRecordsBoxTitleProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 3: the Add and Edit modals (legacy mixins/EmailAddressActionsMixin.js:5-190; next BasicModal `data-testid="email-addresses-modal"`)
// ---------------------------------------------------------------------------------------------

const modalBox = (page: Page) => page.locator('.basic-modal')

export const emailModalProbe: Probe = {
  key: 'email-modal',
  legacy: page => modalBox(page),
  next: page => page.getByTestId('email-addresses-modal'),
}

export const emailModalTitleProbe: Probe = {
  key: 'email-modal-title',
  legacy: page => modalBox(page).locator('h6'),
  next: page => page.getByTestId('email-addresses-modal').locator('h6'),
}

/** A modal field by name; legacy has no name hook, so it is the n-th field of the form (BasicModalField order, hidden ones included). */
function emailModalFieldProbe (name: string, index: number): Probe {
  return {
    key: `email-modal-field-${name}`,
    legacy: page => modalBox(page).locator('form > div').nth(index),
    next: page => page.getByTestId(`email-addresses-modal-field-${name}`),
  }
}

/** The modal's submit button (the first button: Add or Edit). Legacy is Vuetify 2 (`.v-card__actions`), next Vuetify 4. */
const emailModalSubmit = (page: Page, next: boolean) => modalBox(page).locator(next ? '.v-card-actions .v-btn' : '.v-card__actions .v-btn').first()

export const emailModalSubmitProbe: Probe = {
  key: 'email-modal-submit',
  legacy: page => emailModalSubmit(page, false),
  next: page => emailModalSubmit(page, true),
}

const addFieldProbes = [
  emailModalFieldProbe('email', 0),
  emailModalFieldProbe('password', 1),
  emailModalFieldProbe('unlimited_quota', 2),
  emailModalFieldProbe('quota', 3),
]

const editFieldProbes = [
  emailModalFieldProbe('hiddenPassword', 0),
  emailModalFieldProbe('password', 1),
  emailModalFieldProbe('unlimited_quota', 2),
  emailModalFieldProbe('quota', 3),
]

/** Opens Add from the title bar (desktop and mobile share the button). */
function clickAddBar (next: boolean): StateAction {
  return async page => {
    await (next ? page.getByTestId('email-addresses-add') : page.locator('.v-main .title-row .add-new-button')).click()
    await settled(modalBox(page))
  }
}

/** Opens Edit from the first row's first action (`$edit2`). */
function clickRowEdit (next: boolean): StateAction {
  return async page => {
    await emailRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(0).click()
    await settled(modalBox(page))
  }
}

/** Submits the Add form as it is: the empty password (and the address) fail their rules and show their messages. */
function submitEmpty (next: boolean): StateAction {
  return async page => {
    await emailModalSubmit(page, next).click()
    await settled(modalBox(page).locator('.v-messages__message').first())
  }
}

/** "Set New Password" in Edit: the hidden placeholder goes, the generate field comes. */
function setNewPassword (): StateAction {
  return async page => {
    await modalBox(page).getByRole('button', { name: 'Set New Password' }).click()
    await settled(modalBox(page))
  }
}

export const hostingEmailAddressesAddModal: ParityState = {
  id: 'hosting-email-addresses-add-modal',
  ...hostingState({
    ...base,
    legacy: [clickAddBar(false)],
    next: [clickAddBar(true)],
    probes: [emailModalProbe, emailModalTitleProbe, ...addFieldProbes, emailModalSubmitProbe],
  }),
}

export const hostingEmailAddressesAddModalErrors: ParityState = {
  id: 'hosting-email-addresses-add-modal-errors',
  ...hostingState({
    ...base,
    legacy: [clickAddBar(false), submitEmpty(false)],
    next: [clickAddBar(true), submitEmpty(true)],
    probes: [emailModalProbe, emailModalTitleProbe, ...addFieldProbes, emailModalSubmitProbe],
  }),
}

/** Phase 11: the password of the Add form, a fixed value of 8+ characters (the generator is random). */
const EMAIL_ADD_PASSWORD = 'Parity-email-2026'

/** Phase 11: the message of a refused Add: the 422 body the alert shows (`EmailAddressActionsMixin.js:100-105`, next `addEmailAccount`). */
const emailAddRefusedMessage = 'The email account could not be added.'

/** Phase 11: the answer to an Add the server rejects: 422 with a message (the alert shows it; the modal stays open). */
const EMAIL_ADD_422 = { status: 422, json: { message: emailAddRefusedMessage } }

/** Phase 11: fills the Add form with a valid address (the preselected domain comes with it) and the fixed password, then presses Add. */
function fillAndSubmitEmailAdd (next: boolean): StateAction {
  return async page => {
    await (next ? emailModalFieldProbe('email', 0).next(page) : emailModalFieldProbe('email', 0).legacy(page)).locator('input').first().fill('parity-user')
    await (next ? emailModalFieldProbe('password', 1).next(page) : emailModalFieldProbe('password', 1).legacy(page)).locator('input').first().fill(EMAIL_ADD_PASSWORD, { force: true })
    await emailModalSubmit(page, next).click()
  }
}

/**
 * Add refused (phase 11): the POST answers 422, so the modal stays open on its filled form and the alert manager shows the message.
 * Both apps keep the modal open after the error (legacy `submittingError` is only logged in the alert, next `catch`).
 */
export const hostingEmailAddressesAddError: ParityState = {
  id: 'hosting-email-addresses-add-error',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      'POST /services/1/email/domains/1/accounts': EMAIL_ADD_422,
    },
    legacy: [clickAddBar(false), fillAndSubmitEmailAdd(false), waitFor(page => page.locator('.alert-manager', { hasText: emailAddRefusedMessage }))],
    next: [clickAddBar(true), fillAndSubmitEmailAdd(true), waitFor(page => page.getByTestId('shell-alert-manager').filter({ hasText: emailAddRefusedMessage }))],
    probes: [emailModalProbe, emailModalTitleProbe, ...addFieldProbes, emailModalSubmitProbe, alertManagerProbe],
  }),
}

/**
 * Phase 12: the Add form submitted while the POST is held, so the submit button shows its loader (legacy `EmailAddressActionsMixin.js:76`,
 * `submitting` on; next `modalSubmitting`). The POST never answers, so the state waits on the loading button, not on an alert.
 * Loading in the button is an accepted delta per the 2026-10-04 decision (no attempts), see `view-review.md` and `plan.md` Phase 12.
 */
export const hostingEmailAddressesAddLoading: ParityState = {
  id: 'hosting-email-addresses-add-loading',
  ...hostingState({
    ...base,
    handlers: {
      ...base.handlers,
      'POST /services/1/email/domains/1/accounts': 'hold',
    },
    legacy: [clickAddBar(false), fillAndSubmitEmailAdd(false), waitFor(page => modalBox(page).locator('.v-btn--loading'))],
    next: [clickAddBar(true), fillAndSubmitEmailAdd(true), waitFor(page => modalBox(page).locator('.v-btn--loading'))],
    probes: [emailModalProbe, emailModalTitleProbe, ...addFieldProbes, emailModalSubmitProbe],
  }),
}

export const hostingEmailAddressesEditModal: ParityState = {
  id: 'hosting-email-addresses-edit-modal',
  ...hostingState({
    ...base,
    legacy: [clickRowEdit(false)],
    next: [clickRowEdit(true)],
    probes: [emailModalProbe, emailModalTitleProbe, ...editFieldProbes, emailModalSubmitProbe],
  }),
}

export const hostingEmailAddressesEditModalPassword: ParityState = {
  id: 'hosting-email-addresses-edit-modal-password',
  ...hostingState({
    ...base,
    legacy: [clickRowEdit(false), setNewPassword()],
    next: [clickRowEdit(true), setNewPassword()],
    probes: [emailModalProbe, emailModalTitleProbe, ...editFieldProbes, emailModalSubmitProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 4: the Delete and Details modals (legacy mixins/EmailAddressActionsMixin.js:228-315; components/modal/AccountConfigurationDetails.vue)
// ---------------------------------------------------------------------------------------------

/** Opens an action of the first row by its place in the action group (0 Edit, 1 Details, 2 Delete, 3 Webmail); desktop and mobile share it. */
function clickRowAction (next: boolean, index: number): StateAction {
  return async page => {
    await emailRows(page, next).first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(index).click()
  }
}

/** The Details dialog: legacy's card (`.v-dialog__content--active`), next's card (`email-addresses-details`, on the component root). */
function detailsBox (page: Page, next: boolean) {
  return next
    ? page.getByTestId('email-addresses-details')
    : page.locator('.v-dialog__content--active .v-card')
}

export const emailDetailsProbe: Probe = {
  key: 'email-details',
  legacy: page => detailsBox(page, false),
  next: page => detailsBox(page, true),
}

export const emailDetailsTitleProbe: Probe = {
  key: 'email-details-title',
  // V2 markup (`.v-card__title`) in legacy, V4 (`.v-card-title`) in next.
  legacy: page => detailsBox(page, false).locator('.v-card__title'),
  next: page => detailsBox(page, true).locator('.v-card-title'),
}

export const emailDetailsHeadingProbe: Probe = {
  key: 'email-details-heading',
  legacy: page => detailsBox(page, false).locator('.v-card__title h5'),
  next: page => detailsBox(page, true).locator('.v-card-title h5'),
}

export const emailDetailsCloseProbe: Probe = {
  key: 'email-details-close',
  legacy: page => detailsBox(page, false).locator('.v-card__title .v-btn'),
  next: page => detailsBox(page, true).locator('.v-card-title .v-btn'),
}

export const emailDetailsTabsProbe: Probe = {
  key: 'email-details-tabs',
  legacy: page => detailsBox(page, false).locator('.v-tabs').first(),
  next: page => detailsBox(page, true).locator('.v-tabs').first(),
}

/** The selected tab of the Details dialog (legacy `.v-tab--active`, next `.v-tab--selected`): its colour is set by the scoped rules, not `!important`. */
export const emailDetailsTabActiveProbe: Probe = {
  key: 'email-details-tab-active',
  legacy: page => detailsBox(page, false).locator('.v-tab--active').first(),
  next: page => detailsBox(page, true).locator('.v-tab--selected').first(),
}

/** The other tab of the Details dialog (not selected). */
export const emailDetailsTabProbe: Probe = {
  key: 'email-details-tab',
  legacy: page => detailsBox(page, false).locator('.v-tab:not(.v-tab--active)').first(),
  next: page => detailsBox(page, true).locator('.v-tab:not(.v-tab--selected)').first(),
}

export const emailDetailsListProbe: Probe = {
  key: 'email-details-list',
  legacy: page => detailsBox(page, false).locator('.details-list').first(),
  next: page => detailsBox(page, true).locator('.details-list').first(),
}

/** The `confirm` checkbox of Delete (legacy `form > div` first field, next `email-addresses-modal-field-confirm`). */
const emailModalConfirmProbe: Probe = {
  ...emailModalFieldProbe('confirm', 0),
  key: 'email-modal-confirm',
}

/** Asserts the Delete gate before the checkbox is ticked: the submit button is disabled on both sides (legacy `confirm`, `EmailAddressesView.vue:301`). */
function expectDeleteSubmitDisabled (next: boolean): StateAction {
  return async page => {
    await expect(emailModalSubmit(page, next)).toBeDisabled()
  }
}

export const hostingEmailAddressesDeleteModal: ParityState = {
  id: 'hosting-email-addresses-delete-modal',
  ...hostingState({
    ...base,
    legacy: [clickRowAction(false, 2), waitFor(modalBox), expectDeleteSubmitDisabled(false)],
    next: [clickRowAction(true, 2), waitFor(modalBox), expectDeleteSubmitDisabled(true)],
    probes: [emailModalProbe, emailModalTitleProbe, emailModalConfirmProbe, emailModalSubmitProbe],
  }),
}

export const hostingEmailAddressesDetailsModal: ParityState = {
  id: 'hosting-email-addresses-details-modal',
  ...hostingState({
    ...base,
    legacy: [clickRowAction(false, 1), waitFor(page => page.locator('.v-dialog__content--active .v-tab').first())],
    next: [clickRowAction(true, 1), waitFor(page => page.getByTestId('email-addresses-details').locator('.v-tab').first())],
    probes: [emailDetailsProbe, emailDetailsTitleProbe, emailDetailsHeadingProbe, emailDetailsCloseProbe, emailDetailsTabsProbe, emailDetailsTabActiveProbe, emailDetailsTabProbe, emailDetailsListProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 8: hover of the header's Add button and of the first row's Edit icon (desktop waits for its tooltip, mobile is a plain hover)
// ---------------------------------------------------------------------------------------------

type Target = (page: Page) => Locator

/** The overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const emailAddOverlayProbe: Probe = {
  key: 'email-add-overlay',
  legacy: emailAddProbe.legacy,
  next: page => emailAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The Edit icon of the first row: desktop `.actions-row`, mobile the card row (the same locator both apps, by table test id). */
function rowEditButton (next: boolean): Target {
  return page => {
    const rows = (next ? page.getByTestId('email-addresses-table') : page.locator('.v-main .data-table')).locator('tbody tr')
    return rows.first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').first()
  }
}

/** The overlay of the first row's Edit icon. Desktop only (the mobile card has none in the probe set). */
export const emailRowEditOverlayProbe: Probe = {
  key: 'email-row-edit-overlay',
  legacy: page => rowEditButton(false)(page),
  next: page => rowEditButton(true)(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

/** The Edit tooltip of the first row (legacy `.menuable__content__active`, next `.v-overlay__content`). Desktop only. */
export const emailTooltipProbe: Probe = {
  key: 'email-tooltip',
  legacy: page => page.locator('.menuable__content__active'),
  next: page => page.locator('.v-overlay--active .v-overlay__content'),
  when: isDesktop,
}

/**
 * Hovers the first row's Edit icon and waits for its tooltip (`open-delay 150`). The row can reflow once the pointer lands and close the
 * tooltip, so the pointer leaves and comes back until it shows (as `hoverRowEdit` in instance-env-vars.parity.ts). Mobile: plain hover.
 */
function hoverRowEdit (next: boolean): StateAction {
  return async page => {
    const element = rowEditButton(next)(page)
    if (await element.count() === 0) {
      return
    }
    if (!isDesktopViewport(page)) {
      await element.hover()
      return
    }
    const tooltip = next ? emailTooltipProbe.next : emailTooltipProbe.legacy
    await expect(async () => {
      await page.mouse.move(0, 0)
      await element.hover()
      await expect(tooltip(page)).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15_000 })
  }
}

export const hostingEmailAddressesHover: ParityState = {
  ...hovered(hostingEmailAddressesList, { legacy: emailAddProbe.legacy, next: emailAddProbe.next }, [emailAddOverlayProbe]),
  id: 'hosting-email-addresses-hover',
}

const rowEditBase: ParityState = {
  ...hostingEmailAddressesList,
  actions: {
    legacy: [...hostingEmailAddressesList.actions.legacy, hoverRowEdit(false)],
    next: [...hostingEmailAddressesList.actions.next, hoverRowEdit(true)],
  },
}

export const hostingEmailAddressesRowHover: ParityState = {
  ...hovered(rowEditBase, { legacy: rowEditButton(false), next: rowEditButton(true) }, [emailRowEditOverlayProbe, emailTooltipProbe]),
  id: 'hosting-email-addresses-row-hover',
}

// ---------------------------------------------------------------------------------------------
// Phase 9: keyboard focus of the header's Add button (`focus-visible`). Located by the test id like the other probes: on mobile the
// button is icon-only, so it has no accessible name for `buttonFocusState`. Same steps as `buttonFocusState` (Shift, `focus()`,
// `:focus-visible` asserted; V4 ring hidden in next), no Tab (lesson "buttonFocusState nie używa Tab").
// ---------------------------------------------------------------------------------------------

function focusAdd (locate: Target): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = locate(page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

const noAddFocusRing: StateAction = async page => {
  const ring = await emailAddProbe.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
  expect(ring, 'V4 focus ring hidden').toBe('0')
}

export const hostingEmailAddressesFocus: ParityState = {
  ...hostingEmailAddressesList,
  id: 'hosting-email-addresses-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...hostingEmailAddressesList.actions.legacy, focusAdd(emailAddProbe.legacy)],
    next: [...hostingEmailAddressesList.actions.next, focusAdd(emailAddProbe.next)],
  },
  probes: [...hostingEmailAddressesList.probes, emailAddOverlayProbe],
  afterCapture: {
    legacy: [...(hostingEmailAddressesList.afterCapture?.legacy ?? [])],
    next: [...(hostingEmailAddressesList.afterCapture?.next ?? []), noAddFocusRing],
  },
}

const states: ParityState[] = [
  hostingEmailAddressesList,
  hostingEmailAddressesHover,
  hostingEmailAddressesRowHover,
  hostingEmailAddressesFocus,
  hostingEmailAddressesLoading,
  hostingEmailAddressesDomainsLoading,
  hostingEmailAddressesEmpty,
  hostingEmailAddressesNoDomains,
  hostingEmailAddressesNoResults,
  hostingEmailAddressesPaged,
  hostingEmailAddressesError,
  hostingEmailAddressesRecordsOk,
  hostingEmailAddressesRecordsFailed,
  hostingEmailAddressesRecordsLoading,
  hostingEmailAddressesDomainMenu,
  hostingEmailAddressesRecordsModal,
  hostingEmailAddressesAddModal,
  hostingEmailAddressesAddModalErrors,
  hostingEmailAddressesAddError,
  hostingEmailAddressesAddLoading,
  hostingEmailAddressesEditModal,
  hostingEmailAddressesEditModalPassword,
  hostingEmailAddressesDeleteModal,
  hostingEmailAddressesDetailsModal,
]

// Legacy's mobile row passes no row to the action slot, so its Show sends `accounts/undefined` (a harness error).
const desktopOnly = new Set([hostingEmailAddressesDetailsModal.id])

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    testInfo.skip(desktopOnly.has(state.id) && !testInfo.project.name.endsWith('desktop'), 'desktop only: legacy mobile Show sends accounts/undefined')
    await runState(browser, testInfo, state)
  })
}
