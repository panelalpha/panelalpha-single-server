import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { settled } from './auth'
import { hostingService } from './hosting'
import { isDesktop } from './shell'

// DNS page (S-38 hosting-dns, S-115 ui-hosting-dns): probes, fixtures and handlers shared by the states of `/hosting/dns` in My server
// (`hosting-dns.parity.ts`). Not a spec: a spec importing another spec would register its tests twice. Measured on app-lite
// (`target: 'lite'`, M-2); the DNS screen is the same in app and app-lite (ui-hosting-dns research §2). Builder: `hosting.ts`.

// ---------------------------------------------------------------------------------------------
// Probes (legacy views/hosting/Dns.vue, shared HostingTable / TableFullScreenMessage / DataIteratorFilterControls)
// ---------------------------------------------------------------------------------------------

export const dnsTitleProbe: Probe = {
  key: 'dns-title',
  legacy: page => page.locator('.v-main .title-row h4'),
  next: page => page.getByTestId('dns-title'),
}

export const dnsZoneProbe: Probe = {
  key: 'dns-zone-selector',
  legacy: page => page.locator('.v-main .acc-select-group--zone'),
  next: page => page.locator('.v-main .acc-select-group--zone'),
}

/** The server account selector (legacy `active-server-account-selector`, shown with 2+ accounts). Legacy has the zone select in the same row, so the `--zone` class is excluded. */
export const dnsSelectorProbe: Probe = {
  key: 'dns-account-selector',
  legacy: page => page.locator('.v-main .title-row .acc-select-group:not(.acc-select-group--zone)'),
  next: page => page.getByTestId('dns-account-selector'),
}

export const dnsSearchProbe: Probe = {
  key: 'dns-search',
  legacy: page => page.locator('.v-main .my-hostings-search'),
  next: page => page.locator('.v-main .my-hostings-search'),
}

export const dnsAddProbe: Probe = {
  key: 'dns-add',
  legacy: page => page.locator('.v-main .title-row .page-title__add-button'),
  next: page => page.getByTestId('dns-add'),
}

export const dnsTableProbe: Probe = {
  key: 'dns-table',
  legacy: page => page.locator('.v-main .data-table'),
  next: page => page.getByTestId('dns-table'),
}

export const dnsRowProbe: Probe = {
  key: 'dns-row',
  legacy: page => page.locator('.v-main .data-table tbody tr').first(),
  next: page => page.getByTestId('dns-table').locator('tbody tr').first(),
}

/** Desktop only: the Edit icon sits in `.actions-row` (legacy `HostingDnsTable.vue:58-60`); the mobile row has its own layout. */
export const dnsRowEditProbe: Probe = {
  key: 'dns-row-edit',
  legacy: page => page.locator('.v-main .data-table tbody tr').first().locator('.actions-row .v-btn').first(),
  next: page => page.getByTestId('dns-row-edit').first(),
  internal: true,
  when: isDesktop,
}

/** The Edit icon of the first row (index 0 of the desktop `.actions-row`; on mobile the icons sit in the card). Shared by the row hover state. */
export function rowEditButton (page: Page, next: boolean): Locator {
  const rows = (next ? page.getByTestId('dns-table') : page.locator('.v-main .data-table')).locator('tbody tr')
  return rows.first().locator('.actions-row .v-btn').nth(0)
}

/** The hover / focus overlay of the header's Add button: V2 paints it as `::before`, V4 as `.v-btn__overlay`. */
export const dnsAddOverlayProbe: Probe = {
  key: 'dns-add-overlay',
  legacy: dnsAddProbe.legacy,
  next: page => dnsAddProbe.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The hover overlay of the first row's Edit icon: V2 paints it as `::before`, V4 as `.v-btn__overlay`. Desktop only. */
export const dnsRowEditOverlayProbe: Probe = {
  key: 'dns-row-edit-overlay',
  legacy: page => rowEditButton(page, false),
  next: page => rowEditButton(page, true).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

/** Desktop only: the proxy button of the first proxiable row (`.btn-proxy-status`, legacy `HostingDnsTable.vue:92-102`). */
export const dnsProxyProbe: Probe = {
  key: 'dns-proxy',
  legacy: page => page.locator('.v-main .data-table tbody tr .btn-proxy-status').first(),
  next: page => page.getByTestId('dns-table').locator('.btn-proxy-status').first(),
  internal: true,
  when: isDesktop,
}

// ---------------------------------------------------------------------------------------------
// Delete modal (phase 8). Legacy `showDeleteRecordModal` (`DnsActionsMixin.js:529-591`): one `confirm` checkbox, Delete disabled until it
// is ticked. The modal probes follow `cron.ts` (`LEGACY_DIALOG` is repeated here so this module does not import the cron module).
// ---------------------------------------------------------------------------------------------

const LEGACY_DIALOG = '.v-dialog__content--active'

/** The Delete modal's root (legacy `.basic-modal` in the active dialog; next the `BasicModal` with `data-testid="dns-modal"`). */
export const dnsModalProbe: Probe = {
  key: 'dns-modal',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal`),
  next: page => page.getByTestId('dns-modal'),
}

export const dnsModalTitleProbe: Probe = {
  key: 'dns-modal-title',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal .v-card__title h6`),
  next: page => page.getByTestId('dns-modal').locator('.v-card-title h6'),
  internal: true,
}

/** The `confirm` checkbox that gates the Delete button (`confirmRequired` on the `BasicModal`). */
export const dnsConfirmProbe: Probe = {
  key: 'dns-confirm',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal .v-card__text .checkbox`).first(),
  next: page => page.getByTestId('dns-modal-field-confirm').locator('.checkbox').first(),
  internal: true,
}

export const dnsModalSubmitProbe: Probe = {
  key: 'dns-modal-submit',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(0),
  next: page => page.getByTestId('dns-modal').locator('.v-card-actions .v-btn').nth(0),
  internal: true,
}

export const dnsModalCancelProbe: Probe = {
  key: 'dns-modal-cancel',
  legacy: page => page.locator(`${LEGACY_DIALOG} .v-card__actions .v-btn`).nth(1),
  next: page => page.getByTestId('dns-modal').locator('.v-card-actions .v-btn').nth(1),
  internal: true,
}

export const dnsDeleteProbes: Probe[] = [dnsModalProbe, dnsModalTitleProbe, dnsConfirmProbe, dnsModalSubmitProbe, dnsModalCancelProbe]

// ---------------------------------------------------------------------------------------------
// Add and Edit modals (phase 10). Legacy `formFields("A")` renders the visible fields in order type, name, ttl, address; hidden fields
// use `v-show`, so the legacy index counts only the first four slots. Next reads the field by its `dns-modal-field-<name>` test id.
// ---------------------------------------------------------------------------------------------

/** One field of the record form: legacy `.v-input__slot` at `index` (the `v-show` fields count, so the index is the visible order). */
export function dnsModalFieldProbe (index: number, name: string, key: string): Probe {
  return {
    key,
    legacy: page => page.locator(`${LEGACY_DIALOG} .v-input__slot`).nth(index),
    next: page => page.getByTestId(`dns-modal-field-${name}`).locator('.v-field'),
    part: 'box',
    internal: true,
  }
}

export const dnsModalTypeProbe = dnsModalFieldProbe(0, 'type', 'dns-modal-type')
export const dnsModalNameProbe = dnsModalFieldProbe(1, 'name', 'dns-modal-name')
export const dnsModalTtlProbe = dnsModalFieldProbe(2, 'ttl', 'dns-modal-ttl')
export const dnsModalAddressProbe = dnsModalFieldProbe(3, 'address', 'dns-modal-address')

export const dnsModalProbes: Probe[] = [
  dnsModalProbe,
  dnsModalTitleProbe,
  dnsModalTypeProbe,
  dnsModalNameProbe,
  dnsModalTtlProbe,
  dnsModalAddressProbe,
  dnsModalSubmitProbe,
  dnsModalCancelProbe,
]

/** Fills the Add form (an A record): `test` in name, `192.0.2.20` in address. The fields are read by their probes (see `dnsModalProbes`). */
export function fillAddForm (next: boolean): StateAction {
  return async page => {
    await (next ? dnsModalNameProbe.next(page) : dnsModalNameProbe.legacy(page)).locator('input').fill('test')
    await (next ? dnsModalAddressProbe.next(page) : dnsModalAddressProbe.legacy(page)).locator('input').fill('192.0.2.20')
  }
}

/** Presses the modal's submit button (Add / Update / Delete), the first button of the actions row in both apps. */
export function pressSubmit (next: boolean): StateAction {
  return async page => {
    await (next ? dnsModalSubmitProbe.next(page) : dnsModalSubmitProbe.legacy(page)).click()
  }
}

/** Opens the Add modal by a DOM click on the header's Add button (no scrolling, no pointer move). */
export function openAdd (next: boolean): StateAction {
  return async page => {
    const button = next ? dnsAddProbe.next(page) : dnsAddProbe.legacy(page)
    await button.evaluate(node => (node as HTMLElement).click())
    await settled(next ? dnsModalProbe.next(page) : dnsModalProbe.legacy(page))
  }
}

/** The action icon of the first row: index 0 is Edit, index 1 is Delete (desktop `.actions-row`; on mobile the icons sit in the card). */
export function rowActionButton (page: Page, next: boolean, index: 0 | 1): Locator {
  const rows = (next ? page.getByTestId('dns-table') : page.locator('.v-main .data-table')).locator('tbody tr')
  return rows.first().locator('.actions-row .v-btn, .mobile-table-item__row:last-child .v-btn').nth(index)
}

/** Opens Edit / Delete of the first row by a DOM click (no scrolling, no pointer move; the pattern of `openRowModal` in `cron.ts`). */
export function openRowModal (next: boolean, index: 0 | 1): StateAction {
  return async page => {
    await rowActionButton(page, next, index).evaluate(node => (node as HTMLElement).click())
    await settled(next ? dnsModalProbe.next(page) : dnsModalProbe.legacy(page))
  }
}

export const rowsReady = { legacy: dnsRowProbe.legacy, next: dnsRowProbe.next }

// ---------------------------------------------------------------------------------------------
// Proxy warning modal (phase 12). Legacy `showProxyCloudflareWarningModal` (`Dns.vue:448-486`): the warning before a record goes behind the
// Cloudflare proxy. The enable button is first (legacy `buttons.unshift`), Cancel second. The modal alert is the `.warning-box` in both apps
// (`BasicModal.vue:68`, legacy `BasicModal.vue:66`), not a `.v-alert`.
// ---------------------------------------------------------------------------------------------

export const dnsModalAlertProbe: Probe = {
  key: 'dns-modal-alert',
  legacy: page => page.locator(`${LEGACY_DIALOG} .basic-modal .warning-box`),
  next: page => page.getByTestId('dns-modal').locator('.warning-box'),
  internal: true,
}

export const dnsProxyWarningProbes: Probe[] = [dnsModalProbe, dnsModalTitleProbe, dnsModalAlertProbe, dnsModalSubmitProbe, dnsModalCancelProbe]

/** Opens the proxy warning by a DOM click on the first proxy-off icon (desktop `.actions-row`; the mobile card has no proxy). Legacy `btn-proxy-status--off`. */
export function openProxyWarning (next: boolean): StateAction {
  return async page => {
    const button = next ? page.getByTestId('dns-proxy-off').first() : page.locator('.v-main .data-table tbody tr .btn-proxy-status--off').first()
    await button.evaluate(node => (node as HTMLElement).click())
    await settled(next ? dnsModalProbe.next(page) : dnsModalProbe.legacy(page))
  }
}

/** Probes of every DNS state: the title, the zone selector, the search, Add, the table and its first row. */
export const dnsDefaultProbes: Probe[] = [dnsTitleProbe, dnsZoneProbe, dnsSearchProbe, dnsAddProbe, dnsTableProbe, dnsRowProbe, dnsRowEditProbe]

// ---------------------------------------------------------------------------------------------
// Empty states (phase 13). Legacy `Dns.vue:143-152` renders the full-screen message in the table when there are no zones or no records;
// `.no-data` is the same class in both apps (`cronEmptyProbe`). The no-results container is the `DataIteratorNoResultsContainer` of the
// table. The cannot-manage alert is the warning under the title row (legacy `Dns.vue:111-118`, next `DnsView.vue` `cannotManageAlert`).
// ---------------------------------------------------------------------------------------------

/** The empty message of the table (`TableFullScreenMessage`, class `no-data`) in both apps. */
export const dnsEmptyProbe: Probe = {
  key: 'dns-empty',
  legacy: page => page.locator('.v-main .no-data'),
  next: page => page.locator('.v-main .no-data'),
}

/** The Clear filter container shown when a search matches no record. */
export const dnsNoResultsProbe: Probe = {
  key: 'dns-no-results',
  legacy: page => page.locator('.v-main .no-results-container'),
  next: page => page.getByTestId('dns-table').locator('.no-results-container'),
}

/** The warning that the provider's records cannot be managed via API (no record types). Scoped to the table's container, so the shell alerts do not match. */
export const dnsCannotManageProbe: Probe = {
  key: 'dns-cannot-manage',
  legacy: page => page.locator('.v-main .container.mt-3 .v-alert'),
  next: page => page.locator('.v-main .v-container.mt-3 .v-alert'),
}

// ---------------------------------------------------------------------------------------------
// Loading states (phase 14). Legacy `records.loading` (`Dns.vue:314,378`, `HostingTable` `itemsLoading`) puts `data-table--loading` on the
// table while the records request is pending (the skeleton, as `cronLoadingProbe`). The submit spinner is the `.v-progress-circular` inside the
// modal's submit button (legacy `submitting` on the `BasicModal`, next the same prop).
// ---------------------------------------------------------------------------------------------

export const dnsLoadingProbe: Probe = {
  key: 'dns-loading',
  legacy: page => page.locator('.v-main .data-table--loading'),
  next: page => page.locator('.v-main .data-table--loading'),
}

/** Waits until the submit button of the modal shows its spinner (the request is in flight). */
export function waitForSubmitSpinner (next: boolean): StateAction {
  return async page => {
    await settled((next ? dnsModalSubmitProbe.next(page) : dnsModalSubmitProbe.legacy(page)).locator('.v-progress-circular'))
  }
}

// ---------------------------------------------------------------------------------------------
// Fixtures: one zone with six records (the last one with TTL `Auto`); the proxy variant marks A/AAAA/CNAME as proxiable
// ---------------------------------------------------------------------------------------------

/** The DNS screen reads `/services/{id}/dns/…`; the default service id is 1. */
export const DNS_ZONES_KEY = 'GET /services/1/dns/zones'
export const DNS_RECORDS_KEY = 'GET /services/1/dns/zones/1/records'
export const DNS_TYPES_KEY = 'GET /services/1/dns/record-types'
export const DNS_POST_KEY = 'POST /services/1/dns/zones/1/records'

/** A DNS service: `dns_server_enabled` on, so the sidebar and the page show DNS (`hostingService` defaults it to off). */
export const dnsService = hostingService({ dns_server_enabled: true })

export const dnsZones = [
  { id: 1, name: 'example.com' },
  { id: 2, name: 'example.org' },
]

export const dnsRecords = [
  { line: 1, name: 'example.com', ttl: 14_400, type: 'A', content: '192.0.2.10', address: '192.0.2.10', proxiable: false, proxied: false },
  { line: 2, name: 'example.com', ttl: 14_400, type: 'AAAA', content: '2001:db8::10', address: '2001:db8::10', proxiable: false, proxied: false },
  { line: 3, name: 'www.example.com', ttl: 14_400, type: 'CNAME', content: 'example.com', cname: 'example.com', proxiable: false, proxied: false },
  { line: 4, name: 'example.com', ttl: 14_400, type: 'MX', content: '10 mail.example.com', preference: 10, exchange: 'mail.example.com', proxiable: false, proxied: false },
  { line: 5, name: 'example.com', ttl: 14_400, type: 'TXT', content: '"v=spf1 a mx ~all"', txtdata: '"v=spf1 a mx ~all"', proxiable: false, proxied: false },
  { line: 6, name: 'ftp.example.com', ttl: 1, type: 'A', content: '192.0.2.11', address: '192.0.2.11', proxiable: false, proxied: false },
]

/** Same rows as `dnsRecords`, with the proxy on A (`proxied`), off on AAAA and CNAME, and no proxy on the other rows. */
export const dnsProxyRecords = dnsRecords.map(record => {
  if (['A', 'AAAA', 'CNAME'].includes(record.type)) {
    return { ...record, proxiable: true, proxied: record.line === 1 }
  }
  return record
})

export const dnsRecordTypes = ['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'PTR', 'SRV', 'TXT']

/** The default answers of the DNS screen; a state overrides one key (`overrides`). */
export function dnsHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    [DNS_ZONES_KEY]: { json: { data: dnsZones } },
    [DNS_RECORDS_KEY]: { json: { data: dnsRecords, meta: { allow_proxy: false } } },
    [DNS_TYPES_KEY]: { json: { data: dnsRecordTypes } },
    ...overrides,
  }
}

/** The answers with the Cloudflare proxy allowed (`meta.allow_proxy`) and the proxiable rows. */
export function dnsProxyHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return dnsHandlers({
    [DNS_RECORDS_KEY]: { json: { data: dnsProxyRecords, meta: { allow_proxy: true } } },
    ...overrides,
  })
}
