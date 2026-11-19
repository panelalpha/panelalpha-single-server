import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { hostingService } from './hosting'
import { baseCertificates, baseDomains, domainItem, domainsBody, domainsListProbes, domainsRowRedirectProbe, domainsRowSslProbe, wpCloudDomains } from './hosting-domains'
import { isDesktop } from './shell'

// S-32 hosting-domains / S-109 ui-domains: the probes, fixtures and open-a-dialog actions of the Domains list that do not depend on the frame
// (the dialogs and cells are the same in `/hosting/domains` and in the Advanced tab of a project). Not a spec file: `hosting-domains.parity.ts`
// and `instance-advanced-domains.parity.ts` import it, and importing one spec from another would register its tests twice.

// S-32 hosting-domains: My Hosting -> Domains (`/hosting/domains`). Builder and fixtures: `hosting-domains.ts`.
// Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Plan: context/changes/hosting-domains/plan.md ("Stany parity"). Phase 1: the base list, loading, empty, two accounts, diagnostic. Phase 2: search, sort, paging, wp-cloud. Phase 3: the NS error icon, its menu and its dialog. Phase 4: the Add dialog. Phase 5: the transfer dialog. Phase 6: Edit, Delete, Set as primary. Phase 7: the pending SSL cell (app) and `SslEditModal` (lite).

// ---------------------------------------------------------------------------------------------
// Phase 1: route, list, loading, empty, accounts selector, diagnostic account
// ---------------------------------------------------------------------------------------------

/** Hover and sort-header actions are measured on desktop only (plan: hover states 11, 25, 28; mobile sort is not in the desktop table). */
export const isDesktopPage = (page: Page) => (page.viewportSize()?.width ?? 0) >= 976

export const baseProbes = [
  ...domainsListProbes,
  domainsRowRedirectProbe,
  domainsRowSslProbe(1),
  domainsRowSslProbe(2),
  domainsRowSslProbe(3),
  domainsRowSslProbe(4),
]

/** 12 domains, so the footer and a second page show. */
export const manyDomains = Array.from({ length: 12 }, (_, index) => domainItem({
  id: 100 + index,
  domain: `site${String(index + 1).padStart(2, '0')}.example.org`,
  document_root: `/home/example/public_html/site${String(index + 1).padStart(2, '0')}`,
}))

// ---------------------------------------------------------------------------------------------
// Phase 3: a domain that does not resolve to the hosting (`DomainsNameserverChecker`, `DnsOptions`)
// ---------------------------------------------------------------------------------------------

// The A record is the only verification method and `dns.google` answers an address other than the account's (192.0.2.10). Only the
// first row (the main domain) has a DNS zone, so only that row is verified, and it fails; a `sub` and a row without a zone are skipped.
export const nsService = hostingService({
  dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any', display_options: ['a_records'], valid_cname_addresses: [] },
})
export const nsDomains = [{ ...baseDomains[0]!, has_dns_zone: true }, ...baseDomains.slice(1)]
export const nsExternal = { 'dns.google': { json: { Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '198.51.100.7' }] } } }

export const legacyNsIcon = (page: Page) => page.locator('.v-main .data-table tbody tr').first().locator('.v-btn--icon').first()
export const nextNsIcon = (page: Page) => page.getByTestId('ns-checker-activator').first()
export const legacyNsMenu = (page: Page) => page.locator('.menuable__content__active')
// The menu box is the overlay content that holds the checker's menu (legacy's `.menuable__content__active` is the box as well).
export const nextNsMenu = (page: Page) => page.locator('.v-menu > .v-overlay__content').filter({ has: page.getByTestId('ns-checker-menu') })
export const legacyNsDialog = (page: Page) => page.locator('.v-dialog--active .v-card')
export const nextNsDialog = (page: Page) => page.getByTestId('ns-checker-dialog')

export const nsIconProbe = { key: 'ns-icon', legacy: legacyNsIcon, next: nextNsIcon }
export const nsMenuFixProbe = {
  key: 'ns-menu-fix',
  legacy: (page: Page) => legacyNsMenu(page).locator('.v-btn--fix-dns'),
  next: (page: Page) => page.getByTestId('ns-checker-fix'),
  internal: true,
  when: isDesktop,
}
export const nsMenuTextProbe = {
  key: 'ns-menu-text',
  legacy: (page: Page) => legacyNsMenu(page).locator('p'),
  next: (page: Page) => nextNsMenu(page).locator('p'),
  internal: true,
  when: isDesktop,
}
export const nsMenuProbe = { key: 'ns-menu', legacy: legacyNsMenu, next: nextNsMenu, when: isDesktop }
export const nsDialogProbe = { key: 'ns-dialog', legacy: legacyNsDialog, next: nextNsDialog }
export const nsDialogTitleProbe = {
  key: 'ns-dialog-title',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-card__title'),
  next: (page: Page) => nextNsDialog(page).locator('.v-card-title'),
  internal: true,
}
export const nsDialogHeadingProbe = {
  key: 'ns-dialog-heading',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-card__title h4'),
  next: (page: Page) => nextNsDialog(page).locator('.v-card-title h4'),
  internal: true,
}
export const nsDialogTextProbe = {
  key: 'ns-dialog-text',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-card__text'),
  next: (page: Page) => nextNsDialog(page).locator('.v-card-text'),
  internal: true,
}
export const nsDialogPanelTitleProbe = {
  key: 'ns-dialog-panel-title',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-expansion-panel-header'),
  next: (page: Page) => nextNsDialog(page).locator('.v-expansion-panel-title'),
  internal: true,
}
export const nsDialogPanelTextProbe = {
  key: 'ns-dialog-panel-text',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-expansion-panel-content__wrap'),
  next: (page: Page) => nextNsDialog(page).locator('.v-expansion-panel-text__wrapper'),
  internal: true,
}
export const nsDialogListProbe = {
  key: 'ns-dialog-list',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-expansion-panel-content ol').first(),
  next: (page: Page) => nextNsDialog(page).locator('.v-expansion-panel-text ol').first(),
  internal: true,
}
export const nsDialogOptionsProbe = {
  key: 'ns-dialog-options',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-expansion-panels--dns'),
  next: (page: Page) => nextNsDialog(page).locator('.v-expansion-panels--dns'),
  internal: true,
}

export const nsDialogCloseProbe = {
  key: 'ns-dialog-close',
  legacy: (page: Page) => legacyNsDialog(page).locator('.v-card__title .v-btn'),
  next: (page: Page) => nextNsDialog(page).locator('.v-card-title .v-btn'),
  internal: true,
}
export const nsBase = {
  service: nsService,
  domains: { json: domainsBody(nsDomains) },
  external: nsExternal,
}

// ---------------------------------------------------------------------------------------------
// Phase 4: the Add dialog and its DNS instructions step
// ---------------------------------------------------------------------------------------------

export const legacyDialog = (page: Page) => page.locator('.v-dialog--active .basic-modal')
export const nextDialog = (page: Page) => page.getByTestId('domains-modal')
export const legacyAddButton = (page: Page) => page.locator('.v-main .page-title__filter-controls .add-new-button')
export const nextAddButton = (page: Page) => page.getByTestId('domains-add')
export const addLabel = tr('button.domain.add')

// The records the live `DnsOptions` of the dialog lists: the A record, and no verification method (so nothing asks dns.google).
export const addService = hostingService({
  dns_settings: { verification_methods: [], verification_mode: 'any', display_options: ['a_records'], valid_cname_addresses: [] },
})

export const modalProbe = { key: 'modal', legacy: legacyDialog, next: nextDialog }
export const modalTitleProbe = {
  key: 'modal-title',
  legacy: (page: Page) => legacyDialog(page).locator('.v-card__title'),
  next: (page: Page) => nextDialog(page).locator('.v-card-title'),
  internal: true,
}
export const modalTextProbe = {
  key: 'modal-text',
  legacy: (page: Page) => legacyDialog(page).locator('.v-card__text'),
  next: (page: Page) => nextDialog(page).locator('.v-card-text'),
  internal: true,
}
export const modalActionsProbe = {
  key: 'modal-actions',
  legacy: (page: Page) => legacyDialog(page).locator('.v-card__actions'),
  next: (page: Page) => nextDialog(page).locator('.v-card-actions'),
  internal: true,
}
export const modalSubmitProbe = {
  key: 'modal-submit',
  legacy: (page: Page) => legacyDialog(page).locator('.v-card__actions .v-btn').first(),
  next: (page: Page) => nextDialog(page).locator('.v-card-actions .v-btn').first(),
  internal: true,
}
export const modalDnsOptionsProbe = {
  key: 'modal-dns-options',
  legacy: (page: Page) => legacyDialog(page).locator('.v-expansion-panels--dns'),
  next: (page: Page) => nextDialog(page).locator('.v-expansion-panels--dns'),
}
// V2 hid the domain input's message (`.error--text .v-text-field__details { display: none }`) and left the red outline only; the
// port shows the message under the field (the guide names it and the create-project dialog shows it), so an invalid field's box is
// taller than legacy's. The frame itself is the same red outline.
export const modalErrorProbe = {
  key: 'modal-error',
  legacy: (page: Page) => legacyDialog(page).locator('.text-select-input--error:visible').first(),
  next: (page: Page) => nextDialog(page).locator('.text-select-input--error:visible').first(),
}
export const modalInputProbe = {
  key: 'modal-domain-input',
  legacy: (page: Page) => legacyDialog(page).locator('.text-select-input:visible, .v-input:visible').first(),
  next: (page: Page) => nextDialog(page).locator('.text-select-input:visible, .v-input:visible').first(),
  internal: true,
}
export const modalAliasInputProbe = {
  key: 'modal-alias-input',
  legacy: (page: Page) => legacyDialog(page).locator('.v-text-field .v-input__slot:visible').first(),
  next: (page: Page) => nextDialog(page).locator('.v-text-field .v-field:visible').first(),
  internal: true,
}
export const modalFrameProbes = [modalProbe, modalTitleProbe, modalTextProbe, modalActionsProbe, modalSubmitProbe]
export const modalProbes = [...modalFrameProbes, modalInputProbe]

export const openAdd = {
  legacy: async (page: Page) => {
    await legacyAddButton(page).click()
    await expect(legacyDialog(page)).toBeVisible()
  },
  next: async (page: Page) => {
    await nextAddButton(page).click()
    await expect(nextDialog(page)).toBeVisible()
  },
}

/** Picks an option of the dialog's `type` select (the last select of the form). */
export function pickType (label: string) {
  return {
    legacy: async (page: Page) => {
      await legacyDialog(page).locator('.v-select').last().click()
      await page.locator('.menuable__content__active .v-list-item', { hasText: label }).click()
    },
    next: async (page: Page) => {
      await nextDialog(page).locator('.v-select').last().click()
      await page.locator('.v-overlay-container .v-list-item', { hasText: label }).click()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 5: the domain transfer dialog (`verification_required` after Add)
// ---------------------------------------------------------------------------------------------

export const legacyTransfer = (page: Page) => page.locator('.v-dialog--active .v-card').filter({ has: page.locator('.close-model') })
export const nextTransfer = (page: Page) => page.getByTestId('transfer-modal')

export function transferService (transferEnabled: boolean) {
  const base = hostingService()
  return hostingService({
    dns_settings: addService.dns_settings,
    server_settings: { domain_transfer_allowed: true },
    plan_settings: { ...base.plan_settings, domain_transfer_enabled: transferEnabled },
  })
}

export const transferRecord = { type: 'TXT', name: '_panelalpha-verification.taken.example.org', content: 'panelalpha-verification=3f9c2a71b8d44e0f9a5c6d2e1b7a8c90' }

export const transferProbes = [
  { key: 'transfer-modal', legacy: legacyTransfer, next: nextTransfer },
  {
    key: 'transfer-title',
    legacy: (page: Page) => legacyTransfer(page).locator('.v-card__title'),
    next: (page: Page) => nextTransfer(page).locator('.v-card-title'),
    internal: true,
  },
  {
    key: 'transfer-text',
    legacy: (page: Page) => legacyTransfer(page).locator('.v-card__text'),
    next: (page: Page) => nextTransfer(page).locator('.v-card-text'),
    internal: true,
  },
  {
    key: 'transfer-actions',
    legacy: (page: Page) => legacyTransfer(page).locator('.v-card__actions'),
    next: (page: Page) => nextTransfer(page).locator('.v-card-actions'),
    internal: true,
  },
  {
    key: 'transfer-primary',
    legacy: (page: Page) => legacyTransfer(page).locator('.v-card__actions .v-btn').first(),
    next: (page: Page) => nextTransfer(page).locator('.v-card-actions .v-btn').first(),
    internal: true,
  },
]
export const transferTitleH4Probe = {
  key: 'transfer-title-h4',
  legacy: (page: Page) => legacyTransfer(page).locator('.v-card__title h4'),
  next: (page: Page) => nextTransfer(page).locator('.v-card-title h4'),
  internal: true,
}
export const transferCloseProbe = {
  key: 'transfer-close',
  legacy: (page: Page) => legacyTransfer(page).locator('.close-model'),
  next: (page: Page) => nextTransfer(page).locator('.close-model'),
  internal: true,
}
export const transferValueProbe = {
  key: 'transfer-value',
  legacy: (page: Page) => legacyTransfer(page).locator('.long-value-box .box'),
  next: (page: Page) => nextTransfer(page).locator('.long-value-box .box'),
}

/** Opens Add, types a domain and submits: the check answers `verification_required` and the transfer dialog takes over. */
export function openTransfer (domainName: string) {
  return {
    legacy: async (page: Page) => {
      await openAdd.legacy(page)
      await legacyDialog(page).getByPlaceholder('domain.name').fill(domainName)
      await legacyDialog(page).getByRole('button', { name: addLabel, exact: true }).click()
      await expect(legacyTransfer(page)).toBeVisible()
    },
    next: async (page: Page) => {
      await openAdd.next(page)
      await nextDialog(page).getByPlaceholder('domain.name').fill(domainName)
      await nextDialog(page).getByRole('button', { name: addLabel, exact: true }).click()
      await expect(nextTransfer(page)).toBeVisible()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Phase 6: Edit, Delete and Set as primary (the same dialog as Add)
// ---------------------------------------------------------------------------------------------

// Row 1 is `shop.example.net` (an addon with the redirect on), row 2 `selfsigned.example.org` (an addon without it).
// Buttons of a fully capable row, in order: set as primary, SSL, edit, delete (`.actions-row` on desktop, the last value on mobile).
export const rowActionIndex = { edit: 2, delete: 3, setPrimary: 0 }
export function legacyRowButton (page: Page, row: number, action: number) {
  return page.locator('.v-main .data-table tbody tr').nth(row).locator('.actions-row .v-btn, .mobile-table-item__row:last-child .mobile-table-item__value .v-btn').nth(action)
}

export function openRowAction (row: number, legacyAction: number, nextAction: string) {
  return {
    legacy: async (page: Page) => {
      await legacyRowButton(page, row, legacyAction).click()
      await expect(legacyDialog(page)).toBeVisible()
    },
    next: async (page: Page) => {
      await page.getByTestId('domains-row').nth(row).getByTestId(`domains-row-action-${nextAction}`).click()
      await expect(nextDialog(page)).toBeVisible()
    },
  }
}

export const modalCheckboxProbe = {
  key: 'modal-checkbox',
  legacy: (page: Page) => legacyDialog(page).locator('.checkbox').first(),
  next: (page: Page) => nextDialog(page).locator('.checkbox').first(),
}
export const modalMessageProbe = {
  key: 'modal-message',
  legacy: (page: Page) => legacyDialog(page).locator('.v-card__text p').first(),
  next: (page: Page) => nextDialog(page).locator('.v-card-text p').first(),
  internal: true,
}
// The field itself (`.v-input__slot` in V2, `.v-field` in V4), as `modalAliasInputProbe`: the V4 `.v-text-field` root has no radius.
export const modalDocumentRootProbe = {
  key: 'modal-document-root',
  legacy: (page: Page) => legacyDialog(page).locator('.v-text-field .v-input__slot:visible').first(),
  next: (page: Page) => nextDialog(page).locator('.v-text-field .v-field:visible').first(),
  internal: true,
}
export const modalSecondInputProbe = {
  key: 'modal-redirect-url',
  legacy: (page: Page) => legacyDialog(page).locator('.v-text-field .v-input__slot:visible').nth(1),
  next: (page: Page) => nextDialog(page).locator('.v-text-field .v-field:visible').nth(1),
  internal: true,
}

// ---------------------------------------------------------------------------------------------
// Phase 7: SSL. The pending cell on app (the legacy appearance of `PendingSslIndicator`), `SslEditModal` and the blocked button on lite
// ---------------------------------------------------------------------------------------------

export const legacyRowAt = (page: Page, row: number) => page.locator('.v-main .data-table tbody tr').nth(row)

// The pending/failed indicator replaces the SSL text of a row; its wrapper is `span.d-flex.align-center` in both apps.
export function pendingSslProbe (row: number) {
  return {
    key: `domains-row-ssl-pending-${row}`,
    legacy: (page: Page) => legacyRowAt(page, row).locator('span.d-flex.align-center.warning--text, span.d-flex.align-center.error--text').first(),
    next: (page: Page) => page.getByTestId('domains-row-ssl').nth(row).locator('span.d-flex.align-center').first(),
  }
}

// Rows 1, 2 and 4 carry an order. App shows the order whatever the certificate is, lite hides it behind a valid detected certificate,
// so the app states give those rows no valid certificate (the two apps then draw the same cell).
export const sslOrderRows = [
  { ...baseDomains[0]! },
  { ...baseDomains[1]!, ssl_order_status: 'pending' },
  { ...baseDomains[2]!, ssl_order_status: 'awaiting_dns_propagation' },
  baseDomains[3]!,
  { ...baseDomains[4]!, ssl_order_status: 'failed' },
]
export const sslOrderCerts = { ...baseCertificates, 'shop.example.net': { installed: null, detected: null } }

export const legacyPendingMenu = (page: Page) => page.locator('.menuable__content__active').first()
export const nextPendingMenu = (page: Page) => page.locator('.v-overlay__content.v-tooltip').first()
export const legacyPendingActivator = (page: Page) => legacyRowAt(page, 1).locator('td span.d-flex.align-center.warning--text .v-btn').first()
export const nextPendingActivator = (page: Page) => page.getByTestId('domains-row-ssl').nth(1).locator('.v-btn').first()

export const sslLegacyDialog = (page: Page) => page.locator('.v-dialog--active .basic-modal')
export const sslNextDialog = (page: Page) => page.getByTestId('ssl-edit-modal')
export const sslModalProbes = [
  { key: 'ssl-modal', legacy: sslLegacyDialog, next: sslNextDialog },
  { key: 'ssl-modal-title', legacy: (page: Page) => sslLegacyDialog(page).locator('.v-card__title'), next: (page: Page) => sslNextDialog(page).locator('.v-card-title'), internal: true },
  { key: 'ssl-modal-text', legacy: (page: Page) => sslLegacyDialog(page).locator('.v-card__text'), next: (page: Page) => sslNextDialog(page).locator('.v-card-text'), internal: true },
  { key: 'ssl-modal-actions', legacy: (page: Page) => sslLegacyDialog(page).locator('.v-card__actions'), next: (page: Page) => sslNextDialog(page).locator('.v-card-actions'), internal: true },
  { key: 'ssl-modal-submit', legacy: (page: Page) => sslLegacyDialog(page).locator('.v-card__actions .v-btn').first(), next: (page: Page) => sslNextDialog(page).locator('.v-card-actions .v-btn').first(), internal: true },
]
export const sslSelectProbe = {
  key: 'ssl-modal-select',
  legacy: (page: Page) => sslLegacyDialog(page).locator('.v-select .v-input__slot').first(),
  next: (page: Page) => sslNextDialog(page).locator('.v-select .v-field').first(),
  internal: true,
}
export const sslTextareaProbe = {
  key: 'ssl-modal-textarea',
  legacy: (page: Page) => sslLegacyDialog(page).locator('.v-textarea .v-input__slot').first(),
  next: (page: Page) => sslNextDialog(page).locator('.v-textarea .v-field').first(),
  internal: true,
}

// The lock button of a row: the second action of an addon that can be primary (the star is the first), the first of a sub.
export function openSsl (row: number, legacyButton: number) {
  return {
    legacy: async (page: Page) => {
      await legacyRowButton(page, row, legacyButton).click()
      await expect(sslLegacyDialog(page)).toBeVisible()
    },
    next: async (page: Page) => {
      await page.getByTestId('domains-row').nth(row).getByTestId('domains-row-action-ssl-edit').click()
      await expect(sslNextDialog(page)).toBeVisible()
    },
  }
}

// Picks "Custom certificate" (the last option) in the provider select.
export const chooseCustom = {
  legacy: async (page: Page) => {
    await sslLegacyDialog(page).locator('.v-select .v-input__slot').first().click()
    await page.locator('.menuable__content__active .v-list-item').last().click()
    await expect(sslLegacyDialog(page).locator('.v-textarea').first()).toBeVisible()
    // Leaves the hover without the harness blur (`pointer: 'keep'`): V2 keeps the picked select focused.
    await page.mouse.move(0, 0)
  },
  next: async (page: Page) => {
    await sslNextDialog(page).locator('.v-select .v-field').first().click()
    await page.locator('.v-overlay--active .v-list-item').last().click()
    await expect(sslNextDialog(page).locator('.v-textarea').first()).toBeVisible()
    await page.mouse.move(0, 0)
  },
}

// Row 1 has an order and a valid detected certificate (the order is hidden), row 2 an order and a self-signed one (the order shows and
// the lock button is disabled behind a wrapper that carries the tooltip).
export const blockedRows = [baseDomains[0]!, { ...baseDomains[1]!, ssl_order_status: 'pending' }, { ...baseDomains[2]!, ssl_order_status: 'pending' }, baseDomains[3]!, baseDomains[4]!]
export const legacyBlockedWrapper = (page: Page) => legacyRowAt(page, 2).locator('span.d-inline-block:has(.v-btn--disabled)').first()
export const nextBlockedWrapper = (page: Page) => page.getByTestId('domains-row').nth(2).getByTestId('domains-row-action-ssl-edit').locator('..')
export const legacyBlockedTooltip = (page: Page) => page.locator('.v-tooltip__content.menuable__content__active').filter({ hasText: 'selfsigned.example.org' }).first()
export const nextBlockedTooltip = (page: Page) => page.locator('.v-tooltip > .v-overlay__content').filter({ hasText: 'selfsigned.example.org' }).first()

// wp-cloud: no form, the pending/failed indicator and "Retry SSL certificate provisioning" (alias row 1 has a failed order).
export const wpCloudSslDomains = wpCloudDomains.map((item, index) => index === 1 ? { ...item, ssl_order_status: 'failed' } : item)
