import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import {
  clickProjectAdd,
  DOMAINS_PROJECT_HOME,
  domainsPointsToProbe,
  domainsProjectAddIconProbe,
  domainsProjectAddOverlayProbe,
  domainsProjectAddProbe,
  domainsProjectControlsProbe,
  domainsProjectHandlers,
  domainsProjectSearchProbe,
  domainsProjectTitleProbe,
  domainsRowButtonProbe,
  PROJECT_ACCOUNT_ID,
  projectDomains,
  projectManyDomains,
} from './domains'
import {
  addLabel,
  addService,
  blockedRows,
  chooseCustom,
  legacyBlockedTooltip,
  legacyBlockedWrapper,
  legacyDialog,
  legacyNsDialog,
  legacyNsIcon,
  legacyNsMenu,
  legacyTransfer,
  modalCheckboxProbe,
  modalDnsOptionsProbe,
  modalDocumentRootProbe,
  modalErrorProbe,
  modalFrameProbes,
  modalMessageProbe,
  modalSecondInputProbe,
  nextBlockedTooltip,
  nextBlockedWrapper,
  nextDialog,
  nextNsDialog,
  nextNsIcon,
  nextNsMenu,
  nextTransfer,
  nsDialogCloseProbe,
  nsDialogHeadingProbe,
  nsDialogListProbe,
  nsDialogOptionsProbe,
  nsDialogPanelTextProbe,
  nsDialogPanelTitleProbe,
  nsDialogProbe,
  nsDialogTextProbe,
  nsDialogTitleProbe,
  nsIconProbe,
  nsMenuFixProbe,
  nsMenuProbe,
  nsMenuTextProbe,
  openRowAction,
  openSsl,
  pendingSslProbe,
  pickType,
  rowActionIndex,
  sslModalProbes,
  sslSelectProbe,
  sslTextareaProbe,
  transferCloseProbe,
  transferProbes,
  transferRecord,
  transferTitleH4Probe,
  transferValueProbe,
} from './domains-modals'
import { alertManagerProbe, listSearch, waitFor } from './hosting'
import {
  baseCertificates,
  certificate,
  domainsBody,
  domainsRowActionsProbe,
  domainsRowLinkProbe,
  domainsRowProbe,
  domainsRowRedirectProbe,
  domainsRowSslProbe,
  domainsTableProbe,
  waitForSslSettled,
} from './hosting-domains'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID, advancedActiveItemProbe } from './instance-advanced-frame'
import { isDesktop, NOW } from './shell'

// S-109 ui-domains: the Domains list in the Advanced tab of a project (`/projects/:id/advanced/domains`), measured on app-lite (`target: 'lite'`,
// M-2 default). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Probes, handlers
// and the project header: `domains.ts`; rows and modals: `hosting-domains.ts`; the frame: `instance-advanced-frame.ts`.
// Plan: context/changes/ui-domains/plan.md.

const legacySslSpinners = (page: Page) => page.locator('.v-main .data-table tbody td > .v-progress-circular, .v-main .data-table tbody .mobile-table-item__value > .v-progress-circular')
const nextSslSpinners = (page: Page) => page.getByTestId('domains-row-ssl').and(page.locator('.v-progress-circular'))

/** Ready when the Advanced sidebar and the first domain row are on the page and every SSL cell has its certificates. */
const waitForDomains = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(page => page.locator('.v-main .data-table tbody tr').first()),
    waitForSslSettled(legacySslSpinners),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(page => page.getByTestId('domains-row').first()),
    waitForSslSettled(nextSslSpinners),
  ],
}

/** The probes every list state of the project shares, the readiness anchor (the title) first. */
const domainsBaseProbes: Probe[] = [
  domainsProjectTitleProbe,
  domainsProjectControlsProbe,
  domainsProjectSearchProbe,
  domainsProjectAddProbe,
  domainsProjectAddIconProbe,
  domainsTableProbe,
  domainsRowProbe,
  domainsRowLinkProbe,
  domainsRowSslProbe(0),
  domainsRowSslProbe(1),
  domainsRowSslProbe(2),
  domainsRowSslProbe(3),
  domainsRowSslProbe(4),
  domainsRowRedirectProbe,
  domainsPointsToProbe,
  domainsRowActionsProbe,
  advancedActiveItemProbe,
]

/** The buttons of the actions of two rows (main domain, addon): only the default state reads them, so a delta lands in one state. */
const domainsButtonProbes: Probe[] = [
  domainsRowButtonProbe(0, 0, 'domains-main-star'),
  domainsRowButtonProbe(1, 0, 'domains-row-star'),
  domainsRowButtonProbe(1, 1, 'domains-row-ssl-button'),
  domainsRowButtonProbe(1, 2, 'domains-row-edit'),
  domainsRowButtonProbe(1, 3, 'domains-row-delete'),
]

// Phase 1: the project's domains (main, redirected addon with a proxy rule, self-signed, sub with a mismatched certificate, no certificate),
// on the single-server project frame (`DOMAINS_PROJECT_HOME`: the lite `/home` without `admin`).
export const instanceAdvancedDomainsDefault: ParityState = {
  id: 'domains-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/domains`,
  signedIn: true,
  clock: NOW,
  home: DOMAINS_PROJECT_HOME,
  handlers: domainsProjectHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForDomains,
  probes: [...domainsBaseProbes, ...domainsButtonProbes],
}

/** The default state without the button probes: the base of every other state, so a delta of a button is read (and excepted) once. */
const listBase: ParityState = { ...instanceAdvancedDomainsDefault, probes: domainsBaseProbes }

type Target = (page: Page) => Locator

// ---------------------------------------------------------------------------------------------
// Phases 6-7: hover and keyboard focus
// ---------------------------------------------------------------------------------------------

/**
 * `base` with the pointer resting on the element of `target` (transitions are frozen, so the hover is final), as `hovered` of
 * `instance-advanced-ftp.parity.ts` (not exported). A target the variant does not render is skipped in that variant. The pointer stays where
 * the action left it and is asserted on the element after the capture.
 */
function hovered (base: ParityState, target: { legacy: Target, next: Target }, probes: Probe[]): ParityState {
  const hover = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    await element.hover()
  }
  const stillHovered = (locate: Target): StateAction => async page => {
    const element = locate(page)
    if (await element.count() === 0) {
      return
    }
    const onTarget = await element.evaluate(node => {
      const box = node.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return top !== null && node.contains(top)
    })
    expect(onTarget, 'pointer on the element after the capture').toBe(true)
  }
  return {
    ...base,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, hover(target.legacy)],
      next: [...base.actions.next, hover(target.next)],
    },
    probes: [...base.probes, ...probes],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered(target.legacy)],
      next: [...(base.afterCapture?.next ?? []), stillHovered(target.next)],
    },
  }
}

// Phase 6: hover of the header's Add button (icon-only on mobile, located by the same test id / class as the other probes) and of the Delete icon
// of the second row (desktop `.actions-row`; on mobile the icon sits in the card and the state reads as the default one).
// The hover target is the desktop `.actions-row` only: on mobile the icon sits in a card below the fold and the harness's scroll reset takes the
// pointer off it (as `rowDeleteButton` of the FTP states); there the state reads as the default one.
const rowDeleteDesktop = {
  legacy: (page: Page) => page.locator('.v-main .data-table tbody tr').nth(1).locator('.actions-row .v-btn').nth(3),
  next: (page: Page) => page.getByTestId('domains-row').nth(1).locator('.actions-row .v-btn').nth(3),
}
const rowDeleteOverlayProbe: Probe = {
  key: 'domains-row-delete-overlay',
  legacy: rowDeleteDesktop.legacy,
  next: page => rowDeleteDesktop.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
  when: isDesktop,
}

export const instanceAdvancedDomainsHover: ParityState = {
  ...hovered(listBase, { legacy: domainsProjectAddProbe.legacy, next: domainsProjectAddProbe.next }, [domainsProjectAddOverlayProbe]),
  id: 'domains-hover',
}

export const instanceAdvancedDomainsRowHover: ParityState = {
  ...hovered(listBase, rowDeleteDesktop, [rowDeleteOverlayProbe]),
  id: 'domains-row-hover',
}

// Phase 7: keyboard focus of the header's Add button, as `focusAdd` of `instance-advanced-ftp.parity.ts` (Shift, `focus()`, `:focus-visible`
// asserted; the V4 ring is hidden in next), located by test id / class because the mobile button has no accessible name.
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
const noFocusRing: StateAction = async page => {
  const ring = await domainsProjectAddProbe.next(page).evaluate(node => getComputedStyle(node, '::after').opacity)
  expect(ring, 'V4 focus ring hidden').toBe('0')
}

export const instanceAdvancedDomainsFocus: ParityState = {
  ...listBase,
  id: 'domains-focus-visible',
  pointer: 'keep',
  actions: {
    legacy: [...waitForDomains.legacy, focusAdd(domainsProjectAddProbe.legacy)],
    next: [...waitForDomains.next, focusAdd(domainsProjectAddProbe.next)],
  },
  probes: [...domainsBaseProbes, domainsProjectAddOverlayProbe],
  afterCapture: { legacy: [], next: [noFocusRing] },
}

// ---------------------------------------------------------------------------------------------
// Phases 8, 13: the dialogs of a row (Delete before and after its confirm box, Edit, Set as primary) and of the header's Add
// ---------------------------------------------------------------------------------------------

/** Only the modal's probes are read, as in the M-1 states: the page behind it is the default state (measured above). */
const modalOnly = (state: Omit<ParityState, 'id'>, id: string): ParityState => ({ ...state, id })

function rowDialog (row: number, action: keyof typeof rowActionIndex, nextAction: string) {
  const open = openRowAction(row, rowActionIndex[action], nextAction)
  return {
    legacy: [...waitForDomains.legacy, open.legacy],
    next: [...waitForDomains.next, open.next],
  }
}

// Phase 8: the Delete dialog before its `confirm` checkbox is ticked: the submit is disabled (`BasicModal` `confirm-required`).
export const instanceAdvancedDomainsDisabled: ParityState = modalOnly({
  ...listBase,
  actions: rowDialog(2, 'delete', 'delete'),
  probes: [...modalFrameProbes, modalCheckboxProbe],
}, 'domains-disabled')

// Phase 13: the same dialog after the box is ticked (the submit is enabled and red). The state ends before the submit, so no DELETE is sent.
const tickConfirm: StateAction = async page => {
  await legacyDialog(page).locator('.checkbox').first().click()
}
const tickConfirmNext: StateAction = async page => {
  await nextDialog(page).locator('.checkbox').first().click()
}

export const instanceAdvancedDomainsDeleteModal: ParityState = modalOnly({
  ...listBase,
  actions: {
    legacy: [...rowDialog(2, 'delete', 'delete').legacy, tickConfirm],
    next: [...rowDialog(2, 'delete', 'delete').next, tickConfirmNext],
  },
  probes: [...modalFrameProbes, modalCheckboxProbe],
}, 'domains-delete-modal')

export const instanceAdvancedDomainsEdit: ParityState = modalOnly({
  ...listBase,
  actions: rowDialog(2, 'edit', 'edit'),
  probes: [...modalFrameProbes, modalDocumentRootProbe, modalCheckboxProbe],
}, 'domains-edit-modal')

export const instanceAdvancedDomainsEditRedirect: ParityState = modalOnly({
  ...listBase,
  actions: rowDialog(1, 'edit', 'edit'),
  probes: [...modalFrameProbes, modalDocumentRootProbe, modalCheckboxProbe, modalSecondInputProbe],
}, 'domains-edit-redirect')

export const instanceAdvancedDomainsSetPrimary: ParityState = modalOnly({
  ...listBase,
  actions: rowDialog(2, 'setPrimary', 'set-primary'),
  probes: [...modalFrameProbes, modalMessageProbe],
}, 'domains-set-primary')

const openAddDialog = {
  legacy: [...waitForDomains.legacy, clickProjectAdd(false)],
  next: [...waitForDomains.next, clickProjectAdd(true)],
}

// The project's DNS settings with a live DNS list in the Add dialog (`addService`): no verification method, so nothing asks dns.google.
const addInstance = { dns_settings: addService.dns_settings }

export const instanceAdvancedDomainsAddModal: ParityState = modalOnly({
  ...listBase,
  handlers: domainsProjectHandlers({ instance: addInstance }),
  actions: openAddDialog,
  probes: [...modalFrameProbes, modalErrorProbe, modalDnsOptionsProbe],
}, 'domains-add-modal')

export const instanceAdvancedDomainsAddSub: ParityState = modalOnly({
  ...listBase,
  handlers: domainsProjectHandlers({ instance: addInstance }),
  actions: {
    legacy: [...openAddDialog.legacy, pickType(tr('form.option.sub')).legacy],
    next: [...openAddDialog.next, pickType(tr('form.option.sub')).next],
  },
  probes: modalFrameProbes,
}, 'domains-add-sub')

// Phase 9: an invalid domain (`www.` prefix) blurred in the Add dialog: the field shows its error outline.
export const instanceAdvancedDomainsAddModalErrors: ParityState = modalOnly({
  ...listBase,
  handlers: domainsProjectHandlers({ instance: addInstance }),
  actions: {
    legacy: [
      ...openAddDialog.legacy,
      async page => {
        await legacyDialog(page).getByPlaceholder('domain.name').fill('www.example.org')
        await page.keyboard.press('Tab')
        await expect(modalErrorProbe.legacy(page)).toBeVisible()
      },
    ],
    next: [
      ...openAddDialog.next,
      async page => {
        await nextDialog(page).getByPlaceholder('domain.name').fill('www.example.org')
        await page.keyboard.press('Tab')
        await expect(modalErrorProbe.next(page)).toBeVisible()
      },
    ],
  },
  probes: [...modalFrameProbes, modalErrorProbe, modalDnsOptionsProbe],
}, 'domains-add-modal-errors')

// ---------------------------------------------------------------------------------------------
// Phases 9-12: error, empty, loading, the list fragments
// ---------------------------------------------------------------------------------------------

const sidebarReady = {
  legacy: waitFor(page => page.locator('.sticky-sidebar').first()),
  next: waitFor(page => page.getByTestId('advanced-sidebar')),
}

// Phase 9: the list request fails (500 `Server Error`): the shell's alert and an empty table (the header title is the readiness anchor, the
// alert is awaited last, since it renders after the failed request).
export const instanceAdvancedDomainsError: ParityState = {
  ...listBase,
  id: 'domains-error',
  handlers: domainsProjectHandlers({ domains: { status: 500, json: { message: 'Server Error' } } }),
  actions: {
    legacy: [sidebarReady.legacy, waitFor(domainsProjectTitleProbe.legacy), waitFor(alertManagerProbe.legacy)],
    next: [sidebarReady.next, waitFor(domainsProjectTitleProbe.next), waitFor(alertManagerProbe.next)],
  },
  probes: [domainsProjectTitleProbe, domainsTableProbe, alertManagerProbe, advancedActiveItemProbe],
}

// Phase 10: no domains: the empty message with the illustration and Add (the header has no search and no Add, both render only with items).
const emptyProbe: Probe = {
  key: 'domains-empty',
  legacy: page => page.locator('.v-main .data-table .no-data'),
  next: page => page.getByTestId('domains-empty'),
}
const emptyAddProbe: Probe = {
  key: 'domains-empty-add',
  legacy: page => page.locator('.v-main .data-table .no-data .v-btn'),
  next: page => page.getByTestId('domains-empty-add'),
}

export const instanceAdvancedDomainsEmpty: ParityState = {
  ...listBase,
  id: 'domains-empty',
  handlers: domainsProjectHandlers({ domains: { json: domainsBody([]) } }),
  actions: {
    legacy: [sidebarReady.legacy, waitFor(emptyProbe.legacy)],
    next: [sidebarReady.next, waitFor(emptyProbe.next)],
  },
  probes: [domainsProjectTitleProbe, domainsTableProbe, emptyProbe, emptyAddProbe, advancedActiveItemProbe],
}

// Phase 11: the list request hangs (`'hold'`): the loading skeleton (sort row and item on desktop, cards below `lg`), masked; the header title is
// the readiness anchor and the skeleton is awaited last.
const skeleton = {
  legacy: (page: Page) => page.locator('.v-main .data-table .v-skeleton-loader'),
  next: (page: Page) => page.getByTestId('domains-table').locator('.v-skeleton-loader'),
}

export const instanceAdvancedDomainsLoading: ParityState = {
  ...listBase,
  id: 'domains-loading',
  handlers: domainsProjectHandlers({ domains: 'hold' }),
  actions: {
    legacy: [sidebarReady.legacy, waitFor(domainsProjectTitleProbe.legacy), waitFor(page => skeleton.legacy(page).first())],
    next: [sidebarReady.next, waitFor(domainsProjectTitleProbe.next), waitFor(page => skeleton.next(page).first())],
  },
  masks: { legacy: [skeleton.legacy], next: [skeleton.next] },
  probes: [domainsProjectTitleProbe, domainsTableProbe, advancedActiveItemProbe],
}

// Phase 12: a search term without matches (the table shows `NoResults`, the header keeps its search and Add).
const noResultsProbe: Probe = {
  key: 'domains-no-results',
  legacy: page => page.locator('.v-main .data-table .no-results-container'),
  next: page => page.getByTestId('domains-no-results'),
}

export const instanceAdvancedDomainsNoResults: ParityState = {
  ...listBase,
  id: 'domains-no-results',
  actions: {
    legacy: [...waitForDomains.legacy, listSearch('no-such-domain')],
    next: [...waitForDomains.next, listSearch('no-such-domain')],
  },
  probes: [domainsProjectTitleProbe, domainsProjectAddProbe, domainsProjectSearchProbe, domainsTableProbe, noResultsProbe, advancedActiveItemProbe],
}

// Phase 12: more domains than one page (the main one and twelve more: two pages of eight): the footer and its active page.
const footerProbe: Probe = {
  key: 'domains-footer',
  legacy: page => page.locator('.v-main .data-table .data-iterator-footer'),
  next: page => page.getByTestId('domains-table').locator('.data-iterator-footer'),
}

export const instanceAdvancedDomainsPaged: ParityState = {
  ...listBase,
  id: 'domains-paged',
  handlers: domainsProjectHandlers({
    domains: { json: domainsBody([projectDomains[0]!, ...projectManyDomains]) },
    certs: { ...baseCertificates, ...Object.fromEntries(projectManyDomains.map(item => [item.domain, { installed: certificate(), detected: certificate() }])) },
  }),
  probes: [domainsProjectTitleProbe, domainsProjectAddProbe, domainsTableProbe, domainsRowProbe, domainsRowLinkProbe, footerProbe, advancedActiveItemProbe],
}

// Phase 12: no `diagnostic` state in the project: legacy replaces the whole Advanced frame of a project in diagnostic mode (no `.advanced-hosting-page`),
// so the alert of that mode is measured on My server (`hosting-domains-diagnostic`), as `ui-ftp` did.

// ---------------------------------------------------------------------------------------------
// Phase 14: the SSL dialog (lite) and the blocked SSL button
// ---------------------------------------------------------------------------------------------

export const instanceAdvancedDomainsSslModal: ParityState = modalOnly({
  ...listBase,
  actions: {
    legacy: [...waitForDomains.legacy, openSsl(2, 1).legacy],
    next: [...waitForDomains.next, openSsl(2, 1).next],
  },
  probes: [...sslModalProbes, sslSelectProbe],
}, 'domains-ssl-modal')

// A picked `v-select` item keeps the focus: the harness blur races V4's `onAfterLeave`, V2 left the field focused (mapping doc, "Parity fix rules").
export const instanceAdvancedDomainsSslCustom: ParityState = modalOnly({
  ...listBase,
  pointer: 'keep',
  actions: {
    legacy: [...waitForDomains.legacy, openSsl(2, 1).legacy, chooseCustom.legacy],
    next: [...waitForDomains.next, openSsl(2, 1).next, chooseCustom.next],
  },
  probes: [...sslModalProbes, sslSelectProbe, sslTextareaProbe],
}, 'domains-ssl-custom')

// Row 2 has an order and a self-signed certificate: the order shows and the lock button is disabled behind a wrapper that carries the tooltip.
export const instanceAdvancedDomainsSslBlocked: ParityState = {
  ...listBase,
  id: 'domains-ssl-blocked',
  pointer: 'keep',
  handlers: domainsProjectHandlers({ domains: { json: domainsBody(blockedRows.map(item => ({ ...item, server_account_id: PROJECT_ACCOUNT_ID }))) } }),
  actions: {
    legacy: [
      ...waitForDomains.legacy,
      async page => {
        await legacyBlockedWrapper(page).hover()
        await expect(legacyBlockedTooltip(page)).toBeVisible()
      },
    ],
    next: [
      ...waitForDomains.next,
      async page => {
        await nextBlockedWrapper(page).hover()
        await expect(nextBlockedTooltip(page)).toBeVisible()
      },
    ],
  },
  probes: [domainsRowSslProbe(1), pendingSslProbe(2), { key: 'ssl-blocked-tooltip', legacy: legacyBlockedTooltip, next: nextBlockedTooltip, when: isDesktop }],
}

// ---------------------------------------------------------------------------------------------
// Phase 15: the domain transfer dialog and a domain that does not resolve to the hosting
// ---------------------------------------------------------------------------------------------

function transferInstance (enabled: boolean) {
  return {
    dns_settings: addService.dns_settings,
    server_settings: { domain_transfer_allowed: true },
    plan_settings: { copy_instance_allowed: true, dns_management_enabled: false, domain_for_staging: { type: 'any_domain' }, domain_transfer_enabled: enabled },
  }
}
const verifyRequired: Handler = { json: { verification_allowed: true, verification_required: true, verification_record: transferRecord } }

/** Opens Add, types a domain and submits: the check answers `verification_required` and the transfer dialog takes over. */
const openTransfer = {
  legacy: async (page: Page) => {
    await legacyDialog(page).getByPlaceholder('domain.name').fill('taken.example.org')
    await legacyDialog(page).getByRole('button', { name: addLabel, exact: true }).click()
    await expect(legacyTransfer(page)).toBeVisible()
  },
  next: async (page: Page) => {
    await nextDialog(page).getByPlaceholder('domain.name').fill('taken.example.org')
    await nextDialog(page).getByRole('button', { name: addLabel, exact: true }).click()
    await expect(nextTransfer(page)).toBeVisible()
  },
}

export const instanceAdvancedDomainsTransfer: ParityState = modalOnly({
  ...listBase,
  handlers: domainsProjectHandlers({ instance: transferInstance(true), overrides: { 'GET /services/1/domains/verify': verifyRequired } }),
  actions: {
    legacy: [...openAddDialog.legacy, openTransfer.legacy],
    next: [...openAddDialog.next, openTransfer.next],
  },
  probes: [...transferProbes, transferValueProbe, transferTitleH4Probe, transferCloseProbe],
}, 'domains-transfer')

export const instanceAdvancedDomainsTransferImpossible: ParityState = modalOnly({
  ...listBase,
  handlers: domainsProjectHandlers({ instance: transferInstance(false), overrides: { 'GET /services/1/domains/verify': verifyRequired } }),
  actions: {
    legacy: [...openAddDialog.legacy, openTransfer.legacy],
    next: [...openAddDialog.next, openTransfer.next],
  },
  probes: [...transferProbes, transferTitleH4Probe, transferCloseProbe],
}, 'domains-transfer-impossible')

// The A record is the only verification method and `dns.google` answers an address other than the project's: only the main domain has a DNS
// zone, so only that row is verified, and it fails (the icon, its menu and the dialog it opens).
const nsInstance = { dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any', display_options: ['a_records'], valid_cname_addresses: [] } }
const nsDomains = [{ ...projectDomains[0]!, has_dns_zone: true }, ...projectDomains.slice(1)]
const nsAnswer = { 'dns.google': { json: { Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '198.51.100.7' }] } } }
const nsBase = {
  ...listBase,
  handlers: domainsProjectHandlers({ instance: nsInstance, domains: { json: domainsBody(nsDomains) } }),
  external: nsAnswer,
}
const waitForNsIcon = { legacy: [...waitForDomains.legacy, waitFor(legacyNsIcon)], next: [...waitForDomains.next, waitFor(nextNsIcon)] }

export const instanceAdvancedDomainsNsError: ParityState = {
  ...nsBase,
  id: 'domains-ns-error',
  actions: waitForNsIcon,
  probes: [...domainsBaseProbes, nsIconProbe],
}

export const instanceAdvancedDomainsNsMenu: ParityState = {
  ...nsBase,
  id: 'domains-ns-menu',
  pointer: 'keep',
  actions: {
    legacy: [
      ...waitForNsIcon.legacy,
      async page => {
        await legacyNsIcon(page).hover()
        await waitFor(legacyNsMenu)(page)
      },
    ],
    next: [
      ...waitForNsIcon.next,
      async page => {
        await nextNsIcon(page).hover()
        await waitFor(nextNsMenu)(page)
      },
    ],
  },
  probes: [nsIconProbe, nsMenuProbe, nsMenuFixProbe, nsMenuTextProbe],
}

export const instanceAdvancedDomainsNsDialog: ParityState = {
  ...nsBase,
  id: 'domains-ns-dialog',
  actions: {
    legacy: [
      ...waitForNsIcon.legacy,
      async page => {
        await legacyNsIcon(page).hover()
        await page.locator('.v-btn--fix-dns').click()
        await expect(legacyNsDialog(page)).toBeVisible()
        await page.mouse.move(0, 0)
        await expect(legacyNsMenu(page)).toHaveCount(0)
        await expect(legacyNsDialog(page)).toBeVisible()
      },
    ],
    next: [
      ...waitForNsIcon.next,
      async page => {
        await nextNsIcon(page).hover()
        await page.getByTestId('ns-checker-fix').click()
        await expect(nextNsDialog(page)).toBeVisible()
        // The hover menu closes after its delay once the pointer has left; capturing before that raced the dialog in dark-desktop.
        await page.mouse.move(0, 0)
        await expect(nextNsMenu(page)).toHaveCount(0)
        await expect(nextNsDialog(page)).toBeVisible()
      },
    ],
  },
  probes: [nsDialogProbe, nsDialogTitleProbe, nsDialogHeadingProbe, nsDialogCloseProbe, nsDialogTextProbe, nsDialogOptionsProbe, nsDialogPanelTitleProbe, nsDialogPanelTextProbe, nsDialogListProbe],
}

const states: ParityState[] = [
  instanceAdvancedDomainsDefault,
  instanceAdvancedDomainsHover,
  instanceAdvancedDomainsRowHover,
  instanceAdvancedDomainsFocus,
  instanceAdvancedDomainsDisabled,
  instanceAdvancedDomainsDeleteModal,
  instanceAdvancedDomainsError,
  instanceAdvancedDomainsAddModal,
  instanceAdvancedDomainsAddSub,
  instanceAdvancedDomainsAddModalErrors,
  instanceAdvancedDomainsEmpty,
  instanceAdvancedDomainsLoading,
  instanceAdvancedDomainsNoResults,
  instanceAdvancedDomainsPaged,
  instanceAdvancedDomainsEdit,
  instanceAdvancedDomainsEditRedirect,
  instanceAdvancedDomainsSetPrimary,
  instanceAdvancedDomainsSslModal,
  instanceAdvancedDomainsSslCustom,
  instanceAdvancedDomainsSslBlocked,
  instanceAdvancedDomainsTransfer,
  instanceAdvancedDomainsTransferImpossible,
  instanceAdvancedDomainsNsError,
  instanceAdvancedDomainsNsMenu,
  instanceAdvancedDomainsNsDialog,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
