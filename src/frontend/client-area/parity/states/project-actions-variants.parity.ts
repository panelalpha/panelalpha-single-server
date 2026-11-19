import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import { waitForInstanceTitle } from './instance'
import {
  blockPopups,
  cancelDialogProbes,
  cardProbes,
  chooseCopyService,
  clickCopyUrl,
  collaborateRowProbe,
  collaborateSubrowProbe,
  copiedGuard,
  copyMenuProbe,
  copyOptionsHandler,
  deleteFormProbes,
  DNS_SETTINGS,
  dnsIconProbe,
  dnsMenuButtonProbe,
  dnsMenuProbe,
  dnsMenuTextProbe,
  errorAlertProbes,
  headerProbes,
  hoverCopyUrl,
  hoverDnsIndicator,
  hoverErrorAlert,
  hoverLabelRemove,
  importDetails,
  instancesState,
  LABEL_ADD_BUTTON,
  labelAddPanelProbe,
  labelAssignPanelProbe,
  labelDropdownProbe,
  labelErrorProbe,
  labelHandlers,
  labelMenuProbe,
  labelRemoveDisabledProbe,
  labelTooltipProbe,
  modalFormProbes,
  modalProbes,
  openAddNewLabel,
  openCardDialog,
  openLabelAutocomplete,
  openLabelMenu,
  openPreviewSite,
  pendingInstance,
  previewBaseProbes,
  previewButtonProbe,
  previewExternal,
  previewGetProbe,
  previewHandlers,
  previewItem,
  previewUrlProbes,
  pushLoadingProbes,
  pushProbes,
  requestPreviewUrl,
  resolveModalProbes,
  resolveWithArchive,
  shotProject,
  sslHandlers,
  sslItem,
  ssoAlertProbe,
  ssoBaseProbes,
  ssoButtonProbe,
  ssoMessageProbe,
  ssoSelectProbes,
  ssoUsers,
  stagingBaseProbes,
  stagingBillableProbe,
  stagingDiskProbes,
  stagingSelectInputProbe,
  stagingTextFieldProbe,
  submitEmptyLabel,
  submitSso,
  tableCardProbe,
  tableRowProbes,
  tableSortProbe,
  tableSubrowProbe,
  withCollaboration,
} from './instances'
import {
  liteIpProjects,
  liteMenuProjects,
  litePushHandlers,
  liteSslOrderExternal,
  liteSslOrderItem,
  liteWpUsersHandler,
  openLitePushDialog,
} from './instances-lite'
import {
  afterResolveAlert,
  issuePageState,
  labelProjects,
  liteCollaborateHome,
  liteCopyHome,
  litePreviewHandlers,
  modalProjects,
  openPreviewModal,
  openProjectAction,
  openProjectPushDialog,
  openProjectSso,
  openProjectStaging,
  openTabIssue,
  previewProjects,
  stagingProjects,
  stagingUsage,
  waitForNetworkIdle,
  wordpressPushHandlers,
  wordpressPushProjects,
} from './project-actions'

// S-70 ui-project-list-actions, P2: the variants measured once on `light-desktop` (`parity:quick`), on the lite target.

const modalItems = modalProjects()

// Copy, step 2: the service "Pro" (matched as "Pro (2/9": the lite copy "Projects" contains "Pro") has a user configurable option (region); step 2 has no message paragraph (`resetModal` clears it).
export const projectActionsCopyOptions: ParityState = {
  id: 'project-actions-variants-copy-options',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    handlers: copyOptionsHandler,
    legacy: [openProjectAction(3, tr('button.copy', 'lite')).legacy, chooseCopyService('Pro (2/9').legacy],
    next: [openProjectAction(3, tr('button.copy', 'lite')).next, chooseCopyService('Pro (2/9').next],
    probes: [...headerProbes, ...modalProbes.filter(probe => probe.key !== 'modal-message'), modalFormProbes[0]!],
  }),
  home: liteCopyHome(),
}

// A WP Cloud site has no files or database to keep: the alert replaces the two checkboxes.
export const projectActionsDeleteWpCloud: ParityState = {
  id: 'project-actions-variants-delete-wp-cloud',
  ...instancesState({
    items: modalItems.map(item => item.id === 3 ? { ...item, hosting_server_type: 'wp-cloud' } : item),
    list: true,
    lite: true,
    legacy: [openProjectAction(3, tr('button.delete', 'lite')).legacy],
    next: [openProjectAction(3, tr('button.delete', 'lite')).next],
    // Only the confirm checkbox is left (the first checkbox), plus the wp-cloud alert box.
    probes: [
      ...headerProbes,
      ...modalProbes,
      deleteFormProbes[0]!,
      deleteFormProbes[2]!,
      {
        key: 'modal-alert',
        legacy: page => page.locator('.v-dialog--active .warning-box'),
        next: page => page.getByTestId('instances-modal').locator('.warning-box'),
        internal: true,
      },
    ],
  }),
}

// The diff request fails: the dialog warns that the database diff is unavailable.
export const projectActionsPushDiffUnavailable: ParityState = {
  id: 'project-actions-variants-push-diff-unavailable',
  ...instancesState({
    items: wordpressPushProjects(),
    list: true,
    lite: true,
    handlers: wordpressPushHandlers({ status: 500, json: { message: 'Server error.' } }),
    legacy: [openProjectPushDialog('form').legacy],
    next: [openProjectPushDialog('form').next],
    probes: pushProbes,
  }),
}

// Push to live of a custom project's staging sub-row: no diff request, the lite checkbox label (`form.label.pushVolumes`) and no table
// selects. Legacy opens the dialog from the instance page (see `openLitePushDialog`), next from the kebab (exception E7).
export const projectActionsPushCustom: ParityState = {
  id: 'project-actions-variants-push-custom',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    handlers: litePushHandlers,
    legacy: [openLitePushDialog().legacy],
    next: [openLitePushDialog().next],
    probes: [...pushLoadingProbes.filter(probe => probe.key !== 'modal-message'), modalFormProbes[1]!],
  }),
}

// Phase 7: Create staging variants on the lite target (row 3 "WP Blog"; the custom project is row 1 "Node API").
const stagingDisk = { legacy: '.v-card__text li', next: '.v-card-text li' }
const stagingDomain = { legacy: '.text-select-input', next: '.text-select-input' }

// The WordPress files do not fit into the free space: the skip-uploads checkbox is forced and disabled.
export const projectActionsStagingLowDisk: ParityState = {
  id: 'project-actions-variants-staging-low-disk',
  ...instancesState({
    items: stagingProjects(3),
    list: true,
    lite: true,
    handlers: stagingUsage(3, true),
    legacy: [openProjectStaging(3, stagingDisk).legacy],
    next: [openProjectStaging(3, stagingDisk).next],
    probes: [...headerProbes, ...stagingBaseProbes, stagingSelectInputProbe, ...stagingDiskProbes],
  }),
}

export const projectActionsStagingBillable: ParityState = {
  id: 'project-actions-variants-staging-billable',
  ...instancesState({
    items: stagingProjects(3, { server: { is_staging_billable: true } }),
    list: true,
    lite: true,
    handlers: stagingUsage(3),
    legacy: [openProjectStaging(3, stagingDisk).legacy],
    next: [openProjectStaging(3, stagingDisk).next],
    probes: [...headerProbes, ...stagingBaseProbes, stagingBillableProbe, stagingSelectInputProbe, ...stagingDiskProbes],
  }),
}

export const projectActionsStagingAnyDomain: ParityState = {
  id: 'project-actions-variants-staging-any-domain',
  ...instancesState({
    items: stagingProjects(3, { plan: { domain_for_staging: { type: 'any_domain' } } }),
    list: true,
    lite: true,
    handlers: stagingUsage(3),
    legacy: [openProjectStaging(3, stagingDisk).legacy],
    next: [openProjectStaging(3, stagingDisk).next],
    probes: [...headerProbes, ...stagingBaseProbes, stagingTextFieldProbe, ...stagingDiskProbes],
  }),
}

// Staging on a separate hosting account: no disk block at all.
export const projectActionsStagingSeparate: ParityState = {
  id: 'project-actions-variants-staging-separate',
  ...instancesState({
    items: stagingProjects(3, { server: { force_separate_accounts: true } }),
    list: true,
    lite: true,
    legacy: [openProjectStaging(3, stagingDomain).legacy],
    next: [openProjectStaging(3, stagingDomain).next],
    probes: [...headerProbes, ...stagingBaseProbes, stagingSelectInputProbe],
  }),
}

// A custom project: the disk block is hidden (lite `CreateStagingModal`), so there is no pre-check request.
export const projectActionsStagingCustom: ParityState = {
  id: 'project-actions-variants-staging-custom',
  ...instancesState({
    items: stagingProjects(1),
    list: true,
    lite: true,
    legacy: [openProjectStaging(1, stagingDomain).legacy],
    next: [openProjectStaging(1, stagingDomain).next],
    probes: [...headerProbes, ...stagingBaseProbes, stagingSelectInputProbe],
  }),
}

// Admin Area of the WordPress site (3), several administrators, a url that is not an IP: the DNS lookups answer "no record", so the
// dialog warns. On the single-server lite panel the mismatch offers the temporary URL next to the direct login (`isAppSingleServer`), so
// this one state covers both `sso-dns-mismatch` and the preview variant of the plan.
const ssoWarningReady = { legacy: '.warning-box', next: '.warning-box' }
const ssoSelectReady = { legacy: '.v-select', next: '.v-select' }

export const projectActionsSsoDnsMismatch: ParityState = {
  id: 'project-actions-variants-sso-dns-mismatch',
  ...instancesState({
    lite: true,
    items: liteMenuProjects(),
    list: true,
    handlers: liteWpUsersHandler(3, ssoUsers),
    legacy: [openProjectSso(3, ssoWarningReady).legacy],
    next: [openProjectSso(3, ssoWarningReady).next],
    probes: [...headerProbes, ...ssoBaseProbes, ...ssoSelectProbes, ssoAlertProbe, ssoButtonProbe(0), ssoButtonProbe(1)],
  }),
}

// The popup is blocked (`window.open` answers null): the dialog stays with the success text and a Login button.
export const projectActionsSsoPopupBlocked: ParityState = {
  id: 'project-actions-variants-sso-popup-blocked',
  ...instancesState({
    lite: true,
    items: liteIpProjects(3),
    list: true,
    handlers: {
      ...liteWpUsersHandler(3, ssoUsers),
      'POST /projects/3/sso-url': { json: { data: { sso_url: 'https://wp-blog.example.com/sso' } } },
      'POST /instances/3/sso-url': { json: { data: { sso_url: 'https://wp-blog.example.com/sso' } } },
    },
    legacy: [
      openProjectSso(3, ssoSelectReady).legacy,
      blockPopups,
      submitSso.legacy,
      async page => {
        await page.locator('.v-dialog--active .basic-modal .v-card__text p').waitFor()
      },
    ],
    next: [
      openProjectSso(3, ssoSelectReady).next,
      blockPopups,
      submitSso.next,
      async page => {
        await page.getByTestId('sso-modal').locator('.v-card-text p').waitFor()
      },
    ],
    probes: [...headerProbes, ...ssoBaseProbes, ...ssoSelectProbes, ssoMessageProbe, ssoButtonProbe(0)],
  }),
}

// Cancel import (S-70 phase 10): the same dialog for a pending import (import copy, `button.import.cancel` / `button.import.resume`).
const importingProject = pendingInstance(1, 'Imported Site', 'in_progress', importDetails(false))

export const projectActionsCancelImport: ParityState = {
  id: 'project-actions-variants-cancel-import',
  ...instancesState({
    lite: true,
    items: [importingProject, shotProject(2, 'Static Site')],
    legacy: [openCardDialog(tr('button.import.cancel'), 'cancel-install-dialog').legacy],
    next: [openCardDialog(tr('button.import.cancel'), 'cancel-install-dialog').next],
    pointer: 'keep',
    probes: [...headerProbes, ...cancelDialogProbes],
  }),
}

// Labels (S-70 phase 11), the variants of `project-actions-label-*`: the open autocomplete with the disabled Remove tooltip, the empty
// name error of Add New, and the same Assign menu opened from a table row.
const openFromClient = openLabelMenu('card', 1, LABEL_ADD_BUTTON)

export const projectActionsLabelAssignDropdown: ParityState = {
  id: 'project-actions-variants-label-assign-dropdown',
  ...instancesState({
    lite: true,
    keepScroll: true,
    items: labelProjects,
    handlers: labelHandlers,
    legacy: [openFromClient.legacy, openLabelAutocomplete.legacy, hoverLabelRemove.legacy],
    next: [openFromClient.next, openLabelAutocomplete.next, hoverLabelRemove.next],
    pointer: 'keep',
    probes: [labelMenuProbe, labelAssignPanelProbe, labelDropdownProbe, labelRemoveDisabledProbe, labelTooltipProbe, ...cardProbes(1)],
  }),
}

export const projectActionsLabelAddInvalid: ParityState = {
  id: 'project-actions-variants-label-add-invalid',
  ...instancesState({
    lite: true,
    keepScroll: true,
    items: labelProjects,
    handlers: labelHandlers,
    legacy: [openFromClient.legacy, openAddNewLabel.legacy, submitEmptyLabel.legacy],
    next: [openFromClient.next, openAddNewLabel.next, submitEmptyLabel.next],
    probes: [labelMenuProbe, labelAddPanelProbe, labelErrorProbe, ...cardProbes(1)],
  }),
}

export const projectActionsTableLabelAssign: ParityState = {
  id: 'project-actions-variants-table-label-assign',
  ...instancesState({
    lite: true,
    keepScroll: true,
    items: labelProjects,
    handlers: labelHandlers,
    list: true,
    legacy: [openLabelMenu('row', 1, LABEL_ADD_BUTTON).legacy],
    next: [openLabelMenu('row', 1, LABEL_ADD_BUTTON).next],
    probes: [labelMenuProbe, labelAssignPanelProbe, ...tableRowProbes(1)],
  }),
}

// Phase 12: DNS / SSL variants on card 1 (WP Blog). DNS alerts ignored: the menu says so and offers "Restore Alerts" (its only button).
const dnsVariantProbes = [...headerProbes, ...cardProbes(0), dnsIconProbe(0), dnsMenuProbe, dnsMenuTextProbe]

export const projectActionsDnsMenuIgnored: ParityState = {
  id: 'project-actions-variants-dns-menu-ignored',
  ...instancesState({
    lite: true,
    items: [shotProject(1, 'WP Blog', { type: 'wordpress', dns_settings: DNS_SETTINGS, details: { dns_alerts_enabled: false } })],
    legacy: [hoverDnsIndicator(0)],
    next: [hoverDnsIndicator(0)],
    pointer: 'keep',
    probes: [...dnsVariantProbes, dnsMenuButtonProbe(0)],
  }),
}

// A valid certificate: the menu shows the SSL text and the indicator the green lock (no DNS lookup).
const sslCard = sslItem()
export const projectActionsDnsMenuSsl: ParityState = {
  id: 'project-actions-variants-dns-menu-ssl',
  ...instancesState({
    lite: true,
    items: [shotProject(1, 'WP Blog', {
      type: 'wordpress',
      dns_settings: DNS_SETTINGS,
      host_ip_address: sslCard.host_ip_address,
      host_ipv4_addresses: sslCard.host_ipv4_addresses,
      domain_ssl_details: sslCard.domain_ssl_details,
    })],
    handlers: sslHandlers,
    legacy: [hoverDnsIndicator(0)],
    next: [hoverDnsIndicator(0)],
    pointer: 'keep',
    probes: dnsVariantProbes,
  }),
}

// The SSL order failed: the red warning icon and its menu text.
export const projectActionsSslOrderFailed: ParityState = {
  id: 'project-actions-variants-ssl-order-failed',
  ...instancesState({
    lite: true,
    items: [liteSslOrderItem('failed')],
    external: liteSslOrderExternal,
    legacy: [hoverDnsIndicator(0)],
    next: [hoverDnsIndicator(0)],
    pointer: 'keep',
    probes: dnsVariantProbes,
  }),
}

// Phase 13: the preview modal after "Get temporary URL" (lite: the card overlay's "Open Project"), its copy tooltip, the collaborate chips of the
// table, the issue resolve variants (opened from the status alert of the instance page, see `projectActionsIssueMenu`) and, on the app target,
// the card's "Preview site" button (the list of app-lite has no such button on the card).
const previewProbes = [...headerProbes, ...cardProbes(0), ...previewBaseProbes, ...previewUrlProbes]

export const projectActionsPreviewGenerated: ParityState = {
  id: 'project-actions-variants-preview-generated',
  ...instancesState({
    lite: true,
    items: previewProjects,
    handlers: litePreviewHandlers,
    legacy: [openPreviewModal.legacy, requestPreviewUrl.legacy, waitForNetworkIdle],
    next: [openPreviewModal.next, requestPreviewUrl.next, waitForNetworkIdle],
    probes: previewProbes,
  }),
}

export const projectActionsPreviewCopyHover: ParityState = {
  id: 'project-actions-variants-preview-copy-hover',
  ...instancesState({
    lite: true,
    items: previewProjects,
    handlers: litePreviewHandlers,
    legacy: [openPreviewModal.legacy, requestPreviewUrl.legacy, waitForNetworkIdle, hoverCopyUrl.legacy],
    next: [openPreviewModal.next, requestPreviewUrl.next, waitForNetworkIdle, hoverCopyUrl.next],
    pointer: 'keep',
    probes: [...previewProbes, copyMenuProbe],
  }),
}

export const projectActionsPreviewCopied: ParityState = {
  id: 'project-actions-variants-preview-copied',
  ...instancesState({
    lite: true,
    items: previewProjects,
    handlers: litePreviewHandlers,
    legacy: [openPreviewModal.legacy, requestPreviewUrl.legacy, waitForNetworkIdle, clickCopyUrl.legacy],
    next: [openPreviewModal.next, requestPreviewUrl.next, waitForNetworkIdle, clickCopyUrl.next],
    pointer: 'keep',
    probes: [...previewProbes, copyMenuProbe],
  }),
  afterCapture: copiedGuard,
}

// The "Preview site" button under the card (app InstanceItem.vue:188,366-373): a live site on an IP host with no certificate fails the DNS check.
export const projectActionsPreviewButtonApp: ParityState = {
  id: 'project-actions-variants-preview-button-app',
  ...instancesState({
    items: [previewItem()],
    external: previewExternal,
    handlers: previewHandlers,
    legacy: [openPreviewSite.legacy],
    next: [openPreviewSite.next],
    probes: [...headerProbes, ...cardProbes(0), previewButtonProbe, ...previewBaseProbes, previewGetProbe],
  }),
  target: 'app',
}

// The collaborate chip in the table (the `item--collaborate` column) and on the staging sub-row of "Studio" (it follows the parent's gate).
export const projectActionsTableCollaborate: ParityState = {
  id: 'project-actions-variants-table-collaborate',
  ...instancesState({
    lite: true,
    items: withCollaboration(wordpressPushProjects()),
    home: liteCollaborateHome(),
    list: true,
    probes: [
      ...headerProbes,
      tableCardProbe,
      tableSortProbe,
      ...tableRowProbes(0),
      ...tableRowProbes(3),
      tableSubrowProbe,
      collaborateRowProbe(0),
      collaborateRowProbe(3),
      collaborateSubrowProbe,
    ],
  }),
}

// Issue 1 ("not answering on its port"). Each deploy issue of the lite registry has one solution (`issueRegistry.js:54-75`: "upload a new version"),
// so the M-1 state of the second solution (a server file) has no counterpart: N/A, the select widget no longer exists in lite.
export const projectActionsIssueResolvePort: ParityState = {
  id: 'project-actions-variants-issue-resolve-port',
  ...issuePageState(),
  actions: {
    legacy: [...waitForInstanceTitle.legacy, openTabIssue(1).legacy],
    next: [...waitForInstanceTitle.next, openTabIssue(1).next],
  },
  probes: resolveModalProbes,
}

// The upload works, the redeploy answers 409 because a deploy is already running: the dialog stays open and the shell shows the error.
export const projectActionsIssueResolveConflict: ParityState = {
  id: 'project-actions-variants-issue-resolve-conflict',
  ...issuePageState({
    'POST /projects/1/deploy/upload': { json: { remote_filepath: '/tmp/site.zip' } },
    'POST /projects/1/redeploy': { status: 409, json: { message: 'A redeploy is already in progress.' } },
  }),
  actions: {
    legacy: [...waitForInstanceTitle.legacy, openTabIssue(0).legacy, ...resolveWithArchive(hoverErrorAlert).legacy],
    next: [...waitForInstanceTitle.next, openTabIssue(0).next, ...resolveWithArchive(hoverErrorAlert).next],
  },
  pointer: 'keep',
  probes: [...resolveModalProbes, ...errorAlertProbes],
  afterCapture: afterResolveAlert,
}

const states: ParityState[] = [
  projectActionsPreviewGenerated,
  projectActionsPreviewCopyHover,
  projectActionsPreviewCopied,
  projectActionsPreviewButtonApp,
  projectActionsTableCollaborate,
  projectActionsIssueResolvePort,
  projectActionsIssueResolveConflict,
  projectActionsCopyOptions,
  projectActionsDeleteWpCloud,
  projectActionsPushDiffUnavailable,
  projectActionsPushCustom,
  projectActionsStagingLowDisk,
  projectActionsStagingBillable,
  projectActionsStagingAnyDomain,
  projectActionsStagingSeparate,
  projectActionsStagingCustom,
  projectActionsSsoDnsMismatch,
  projectActionsSsoPopupBlocked,
  projectActionsCancelImport,
  projectActionsLabelAssignDropdown,
  projectActionsLabelAddInvalid,
  projectActionsTableLabelAssign,
  projectActionsDnsMenuIgnored,
  projectActionsDnsMenuSsl,
  projectActionsSslOrderFailed,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
