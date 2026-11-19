import type { ParityState } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import {
  addLabel,
  addService,
  baseProbes,
  blockedRows,
  chooseCustom,
  isDesktopPage,
  legacyBlockedTooltip,
  legacyBlockedWrapper,
  legacyDialog,
  legacyNsDialog,
  legacyNsIcon,
  legacyNsMenu,
  legacyPendingActivator,
  legacyPendingMenu,
  manyDomains,
  modalAliasInputProbe,
  modalCheckboxProbe,
  modalDnsOptionsProbe,
  modalDocumentRootProbe,
  modalErrorProbe,
  modalFrameProbes,
  modalMessageProbe,
  modalProbes,
  modalSecondInputProbe,
  nextBlockedTooltip,
  nextBlockedWrapper,
  nextDialog,
  nextNsDialog,
  nextNsIcon,
  nextNsMenu,
  nextPendingActivator,
  nextPendingMenu,
  nsBase,
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
  openAdd,
  openRowAction,
  openSsl,
  openTransfer,
  pendingSslProbe,
  pickType,
  rowActionIndex,
  sslModalProbes,
  sslOrderCerts,
  sslOrderRows,
  sslSelectProbe,
  sslTextareaProbe,
  transferProbes,
  transferRecord,
  transferService,
  transferValueProbe,
  wpCloudSslDomains,
} from './domains-modals'
import { hostingService, serverAccount, waitFor } from './hosting'
import {
  baseCertificates,
  baseDomains,
  certificate,
  domainsAlertsProbe,
  domainsBody,
  domainsControlsProbe,
  domainsEmptyAddProbe,
  domainsEmptyProbe,
  domainsFilterControlsProbe,
  domainsFooterProbe,
  domainsListProbes,
  domainsNoResultsProbe,
  domainsRowSslProbe,
  domainsSearchProbe,
  domainsSelectorLabelProbe,
  domainsSelectorProbe,
  domainsSelectorSelectProbe,
  domainsSortHeaderProbe,
  domainsState,
  domainsTableProbe,
  domainsTitleColProbe,
  domainsTitleProbe,
  domainsTitleReady,
  liteDomainsState,
  searchDomains,
  twoAccountsService,
  wpCloudDomains,
  wpCloudService,
} from './hosting-domains'
import { isDesktop } from './shell'

export const hostingDomains: ParityState = {
  id: 'hosting-domains',
  ...liteDomainsState({ probes: baseProbes }),
}

export const hostingDomainsLoading: ParityState = {
  id: 'hosting-domains-loading',
  ...liteDomainsState({
    domains: 'hold',
    ready: domainsTitleReady,
    settleSsl: false,
    probes: [domainsTitleProbe, domainsTableProbe],
  }),
}

export const hostingDomainsEmpty: ParityState = {
  id: 'hosting-domains-empty',
  ...liteDomainsState({
    domains: { json: domainsBody([]) },
    ready: { legacy: domainsEmptyProbe.legacy, next: domainsEmptyProbe.next },
    probes: [domainsTitleProbe, domainsTableProbe, domainsEmptyProbe, domainsEmptyAddProbe],
  }),
}

export const hostingDomainsAccounts: ParityState = {
  id: 'hosting-domains-accounts',
  ...liteDomainsState({
    service: twoAccountsService(),
    probes: [...domainsListProbes, domainsSelectorProbe, domainsSelectorLabelProbe, domainsSelectorSelectProbe, domainsTitleColProbe, domainsFilterControlsProbe],
  }),
}

export const hostingDomainsDiagnostic: ParityState = {
  id: 'hosting-domains-diagnostic',
  ...liteDomainsState({
    service: hostingService({ server_accounts: [serverAccount({ diagnostic_mode: true })] }),
    ready: domainsTitleReady,
    settleSsl: false,
    probes: [domainsTitleProbe, domainsAlertsProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 2: no results, sort, paging, wp-cloud
// ---------------------------------------------------------------------------------------------

export const hostingDomainsNoResults: ParityState = {
  id: 'hosting-domains-no-results',
  ...liteDomainsState({
    legacy: [searchDomains('no-such-domain', domainsNoResultsProbe.legacy)],
    next: [searchDomains('no-such-domain', domainsNoResultsProbe.next)],
    probes: [domainsTitleProbe, domainsControlsProbe, domainsSearchProbe, domainsTableProbe, domainsNoResultsProbe, domainsFooterProbe],
  }),
}

export const hostingDomainsSorted: ParityState = {
  id: 'hosting-domains-sorted',
  ...liteDomainsState({
    legacy: [
      async page => {
        if (!isDesktopPage(page)) {
          return
        }
        await page.locator('.v-main .data-table tr.custom-sort .custom-sort__item--sortable').first().click()
        await expect(page.locator('.v-main .data-table tbody tr').first().locator('a.font-weight-bold').first()).toHaveText('shop.example.net')
      },
    ],
    next: [
      async page => {
        if (!isDesktopPage(page)) {
          return
        }
        await page.getByTestId('domains-table').locator('tr.custom-sort .custom-sort__item--sortable').first().click()
        await expect(page.getByTestId('domains-row-link').first()).toHaveText('shop.example.net')
      },
    ],
    probes: [...domainsListProbes, { ...domainsSortHeaderProbe, when: isDesktop }],
  }),
}

export const hostingDomainsPaginated: ParityState = {
  id: 'hosting-domains-paginated',
  ...liteDomainsState({
    domains: { json: domainsBody([baseDomains[0]!, ...manyDomains]) },
    certs: { ...baseCertificates, ...Object.fromEntries(manyDomains.map(item => [item.domain, { installed: certificate(), detected: certificate() }])) },
    probes: [...domainsListProbes, domainsFooterProbe],
  }),
}

export const hostingDomainsWpCloud: ParityState = {
  id: 'hosting-domains-wp-cloud',
  ...liteDomainsState({
    service: wpCloudService(),
    domains: { json: domainsBody(wpCloudDomains, ['alias']) },
    certs: Object.fromEntries(wpCloudDomains.map(item => [item.domain, { installed: certificate(), detected: certificate() }])),
    probes: [...domainsListProbes, domainsRowSslProbe(1)],
  }),
}

export const hostingDomainsNsError: ParityState = {
  id: 'hosting-domains-ns-error',
  ...liteDomainsState({
    ...nsBase,
    legacy: [waitFor(legacyNsIcon)],
    next: [waitFor(nextNsIcon)],
    probes: [...domainsListProbes, nsIconProbe],
  }),
}

export const hostingDomainsNsMenu: ParityState = {
  id: 'hosting-domains-ns-menu',
  ...liteDomainsState({
    ...nsBase,
    pointer: 'keep',
    legacy: [
      waitFor(legacyNsIcon),
      async page => {
        await legacyNsIcon(page).hover()
        await waitFor(legacyNsMenu)(page)
      },
    ],
    next: [
      waitFor(nextNsIcon),
      async page => {
        await nextNsIcon(page).hover()
        await waitFor(nextNsMenu)(page)
      },
    ],
    probes: [...domainsListProbes, nsIconProbe, nsMenuProbe, nsMenuFixProbe, nsMenuTextProbe],
  }),
}

export const hostingDomainsNsDialog: ParityState = {
  id: 'hosting-domains-ns-dialog',
  ...liteDomainsState({
    ...nsBase,
    legacy: [
      waitFor(legacyNsIcon),
      async page => {
        await legacyNsIcon(page).hover()
        await page.locator('.v-btn--fix-dns').click()
        await expect(legacyNsDialog(page)).toBeVisible()
      },
    ],
    next: [
      waitFor(nextNsIcon),
      async page => {
        await nextNsIcon(page).hover()
        await page.getByTestId('ns-checker-fix').click()
        await expect(nextNsDialog(page)).toBeVisible()
      },
    ],
    probes: [nsDialogProbe, nsDialogTitleProbe, nsDialogHeadingProbe, nsDialogTextProbe, nsDialogOptionsProbe, nsDialogPanelTitleProbe, nsDialogPanelTextProbe, nsDialogListProbe],
  }),
}

export const hostingDomainsAddAddon: ParityState = {
  id: 'hosting-domains-add-addon',
  ...liteDomainsState({
    service: addService,
    legacy: [openAdd.legacy],
    next: [openAdd.next],
    probes: [...modalProbes, modalDnsOptionsProbe],
  }),
}

export const hostingDomainsAddSub: ParityState = {
  id: 'hosting-domains-add-sub',
  ...liteDomainsState({
    service: addService,
    legacy: [openAdd.legacy, pickType(tr('form.option.sub')).legacy],
    next: [openAdd.next, pickType(tr('form.option.sub')).next],
    probes: modalProbes,
  }),
}

export const hostingDomainsAddInvalid: ParityState = {
  id: 'hosting-domains-add-invalid',
  ...liteDomainsState({
    service: addService,
    legacy: [
      openAdd.legacy,
      async page => {
        await legacyDialog(page).getByPlaceholder('domain.name').fill('www.example.org')
        await page.keyboard.press('Tab')
        await expect(modalErrorProbe.legacy(page)).toBeVisible()
      },
    ],
    next: [
      openAdd.next,
      async page => {
        await nextDialog(page).getByPlaceholder('domain.name').fill('www.example.org')
        await page.keyboard.press('Tab')
        await expect(modalErrorProbe.next(page)).toBeVisible()
      },
    ],
    probes: [...modalProbes, modalErrorProbe, modalDnsOptionsProbe],
  }),
}

// POST answers 201 and the list is asked again: the second answer is held, so the dialog (now the instructions step) is captured at once.
export const hostingDomainsDnsInstructions: ParityState = {
  id: 'hosting-domains-dns-instructions',
  ...liteDomainsState({
    service: addService,
    domains: [{ json: domainsBody(baseDomains) }, 'hold'],
    handlers: { 'POST /server-accounts/11/domains': { status: 201, json: {} } },
    legacy: [
      openAdd.legacy,
      async page => {
        await legacyDialog(page).getByPlaceholder('domain.name').fill('newsite.example.org')
        await legacyDialog(page).getByRole('button', { name: addLabel, exact: true }).click()
        await expect(legacyDialog(page).locator('.v-card__title')).toHaveText(tr('heading.instance.modal.setDomain.title'))
      },
    ],
    next: [
      openAdd.next,
      async page => {
        await nextDialog(page).getByPlaceholder('domain.name').fill('newsite.example.org')
        await nextDialog(page).getByRole('button', { name: addLabel, exact: true }).click()
        await expect(nextDialog(page).locator('.v-card-title')).toHaveText(tr('heading.instance.modal.setDomain.title'))
      },
    ],
    probes: [...modalFrameProbes, modalDnsOptionsProbe],
  }),
}

export const hostingDomainsAddAlias: ParityState = {
  id: 'hosting-domains-add-alias',
  ...liteDomainsState({
    service: wpCloudService(),
    domains: { json: domainsBody(wpCloudDomains, ['alias']) },
    certs: Object.fromEntries(wpCloudDomains.map(item => [item.domain, { installed: certificate(), detected: certificate() }])),
    legacy: [openAdd.legacy],
    next: [openAdd.next],
    probes: [...modalFrameProbes, modalAliasInputProbe],
  }),
}

export const hostingDomainsTransfer: ParityState = {
  id: 'hosting-domains-transfer',
  ...liteDomainsState({
    service: transferService(true),
    verify: { json: { verification_allowed: true, verification_required: true, verification_record: transferRecord } },
    legacy: [openTransfer('taken.example.org').legacy],
    next: [openTransfer('taken.example.org').next],
    probes: [...transferProbes, transferValueProbe],
  }),
}

export const hostingDomainsTransferImpossible: ParityState = {
  id: 'hosting-domains-transfer-impossible',
  ...liteDomainsState({
    service: transferService(false),
    verify: { json: { verification_allowed: true, verification_required: true, verification_record: transferRecord } },
    legacy: [openTransfer('taken.example.org').legacy],
    next: [openTransfer('taken.example.org').next],
    probes: transferProbes,
  }),
}

export const hostingDomainsEdit: ParityState = {
  id: 'hosting-domains-edit',
  ...liteDomainsState({
    service: addService,
    legacy: [openRowAction(2, rowActionIndex.edit, 'edit').legacy],
    next: [openRowAction(2, rowActionIndex.edit, 'edit').next],
    probes: [...modalFrameProbes, modalDocumentRootProbe, modalCheckboxProbe],
  }),
}

export const hostingDomainsEditRedirect: ParityState = {
  id: 'hosting-domains-edit-redirect',
  ...liteDomainsState({
    service: addService,
    legacy: [openRowAction(1, rowActionIndex.edit, 'edit').legacy],
    next: [openRowAction(1, rowActionIndex.edit, 'edit').next],
    probes: [...modalFrameProbes, modalDocumentRootProbe, modalCheckboxProbe, modalSecondInputProbe],
  }),
}

export const hostingDomainsDelete: ParityState = {
  id: 'hosting-domains-delete',
  ...liteDomainsState({
    service: addService,
    legacy: [openRowAction(2, rowActionIndex.delete, 'delete').legacy],
    next: [openRowAction(2, rowActionIndex.delete, 'delete').next],
    probes: [...modalFrameProbes, modalCheckboxProbe],
  }),
}

export const hostingDomainsSetPrimary: ParityState = {
  id: 'hosting-domains-set-primary',
  ...liteDomainsState({
    service: addService,
    legacy: [openRowAction(2, rowActionIndex.setPrimary, 'set-primary').legacy],
    next: [openRowAction(2, rowActionIndex.setPrimary, 'set-primary').next],
    probes: [...modalFrameProbes, modalMessageProbe],
  }),
}

export const hostingDomainsSslPending: ParityState = {
  id: 'hosting-domains-ssl-pending',
  ...domainsState({
    domains: { json: domainsBody(sslOrderRows) },
    certs: sslOrderCerts,
    probes: [...domainsListProbes, pendingSslProbe(1), pendingSslProbe(2), pendingSslProbe(4)],
  }),
}
export const hostingDomainsSslPendingMenu: ParityState = {
  id: 'hosting-domains-ssl-pending-menu',
  ...domainsState({
    domains: { json: domainsBody(sslOrderRows) },
    certs: sslOrderCerts,
    pointer: 'keep',
    legacy: [
      async page => {
        if (!isDesktopPage(page)) {
          return
        }
        await legacyPendingActivator(page).hover()
        await waitFor(legacyPendingMenu)(page)
      },
    ],
    next: [
      async page => {
        if (!isDesktopPage(page)) {
          return
        }
        await nextPendingActivator(page).hover()
        await expect(nextPendingMenu(page)).toBeVisible()
      },
    ],
    probes: [
      ...domainsListProbes,
      pendingSslProbe(1),
      { key: 'ssl-pending-menu', legacy: legacyPendingMenu, next: nextPendingMenu, when: isDesktop },
    ],
  }),
}

export const hostingDomainsLiteSslModal: ParityState = {
  id: 'hosting-domains-lite-ssl-modal',
  ...liteDomainsState({
    legacy: [openSsl(2, 1).legacy],
    next: [openSsl(2, 1).next],
    probes: [...sslModalProbes, sslSelectProbe],
  }),
}

export const hostingDomainsLiteSslCustom: ParityState = {
  id: 'hosting-domains-lite-ssl-custom',
  ...liteDomainsState({
    legacy: [openSsl(2, 1).legacy, chooseCustom.legacy],
    next: [openSsl(2, 1).next, chooseCustom.next],
    // A state that picks a `v-select` item keeps the focus: the harness blur races V4's `onAfterLeave`, which gives the field its
    // focus back, while V2 left the field `isFocused` (mapping doc, "Parity fix rules").
    pointer: 'keep',
    probes: [...sslModalProbes, sslSelectProbe, sslTextareaProbe],
  }),
}

export const hostingDomainsLiteSslBlocked: ParityState = {
  id: 'hosting-domains-lite-ssl-blocked',
  ...liteDomainsState({
    domains: { json: domainsBody(blockedRows) },
    pointer: 'keep',
    legacy: [
      async page => {
        await legacyBlockedWrapper(page).hover()
        await expect(legacyBlockedTooltip(page)).toBeVisible()
      },
    ],
    next: [
      async page => {
        await nextBlockedWrapper(page).hover()
        await expect(nextBlockedTooltip(page)).toBeVisible()
      },
    ],
    probes: [
      domainsRowSslProbe(1),
      pendingSslProbe(2),
      { key: 'ssl-blocked-tooltip', legacy: legacyBlockedTooltip, next: nextBlockedTooltip, when: isDesktop },
    ],
  }),
}

export const hostingDomainsLiteSslWpCloud: ParityState = {
  id: 'hosting-domains-lite-ssl-wp-cloud',
  ...liteDomainsState({
    service: wpCloudService(),
    domains: { json: domainsBody(wpCloudSslDomains, ['alias']) },
    certs: Object.fromEntries(wpCloudDomains.map(item => [item.domain, { installed: null, detected: null }])),
    legacy: [openSsl(1, 1).legacy],
    next: [openSsl(1, 1).next],
    probes: sslModalProbes,
  }),
}

const states: ParityState[] = [
  hostingDomains,
  hostingDomainsLoading,
  hostingDomainsEmpty,
  hostingDomainsAccounts,
  hostingDomainsDiagnostic,
  hostingDomainsNoResults,
  hostingDomainsSorted,
  hostingDomainsPaginated,
  hostingDomainsWpCloud,
  hostingDomainsNsError,
  hostingDomainsNsMenu,
  hostingDomainsNsDialog,
  hostingDomainsAddAddon,
  hostingDomainsAddSub,
  hostingDomainsAddInvalid,
  hostingDomainsDnsInstructions,
  hostingDomainsAddAlias,
  hostingDomainsTransfer,
  hostingDomainsTransferImpossible,
  hostingDomainsEdit,
  hostingDomainsEditRedirect,
  hostingDomainsDelete,
  hostingDomainsSetPrimary,
  hostingDomainsSslPending,
  hostingDomainsSslPendingMenu,
  hostingDomainsLiteSslModal,
  hostingDomainsLiteSslCustom,
  hostingDomainsLiteSslBlocked,
  hostingDomainsLiteSslWpCloud,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // `liteDomainsState` states carry `target: 'lite'` (M-2 default). Only the pending SSL cell states stay on app (its app-only
    // markup): the deployed lite has the live `DnsOptions` in the Add dialog and the DNS instructions step too, so those are measured on lite.
    await runState(browser, testInfo, { target: 'app', ...state })
  })
}
