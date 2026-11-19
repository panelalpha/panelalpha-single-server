import type { Probe } from '../lib/probe'
import type { ParityState, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import { waitForInstanceTitle } from './instance'
import {
  cancelDialogProbes,
  cardProbes,
  collaborateCardProbe,
  deleteFormProbes,
  deployingProject,
  dnsDialogPreviewProbes,
  dnsDialogProbes,
  dnsIconProbe,
  dnsMenuButtonProbe,
  dnsMenuProbe,
  dnsMenuTextProbe,
  errorAlertProbes,
  failedInstance,
  headerProbes,
  hoverDnsIndicator,
  hoverErrorAlert,
  importDetails,
  importDetailsProbes,
  instancesState,
  isDesktopViewport,
  LABEL_ADD_BUTTON,
  LABEL_ADD_TAGS,
  labelAddPanelProbe,
  labelAssignPanelProbe,
  labelEmptyProbe,
  labelHandlers,
  labelMenuProbe,
  limitedInstance,
  modalFormProbes,
  modalProbes,
  openAddNewLabel,
  openCardDialog,
  openFixDns,
  openLabelMenu,
  openRowMenu,
  pendingInstance,
  previewBaseProbes,
  previewGetProbe,
  pushDiff,
  pushLoadingProbes,
  pushProbes,
  resolveModalProbes,
  resolveUploadWidgetProbes,
  resolveWithArchive,
  rowMenuProbes,
  shotProject,
  ssoAlertProbe,
  ssoBaseProbes,
  ssoButtonProbe,
  ssoMessageProbe,
  ssoSelectProbes,
  ssoUsers,
  stagingBaseProbes,
  stagingDiskProbes,
  stagingSelectInputProbe,
  stagingSkeletonProbe,
  tableCardProbe,
  tableRowProbes,
  withCollaboration,
} from './instances'
import {
  liteAppUsers,
  liteAppUsersHandler,
  liteDnsItem,
  liteIpProjects,
  liteMenuProjects,
  liteSslOrderExternal,
  liteSslOrderItem,
  liteWpUsersHandler,
} from './instances-lite'
import {
  afterResolveAlert,
  issuePageState,
  labelChipProbes,
  labelProjects,
  liteCollaborateHome,
  liteCopyHome,
  litePreviewHandlers,
  liteUpdatesHandler,
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
  tabIssueProbes,
  wordpressPushHandlers,
  wordpressPushProjects,
} from './project-actions'

// S-70 ui-project-list-actions: the project actions (kebab, overlay, modals, labels, DNS/SSL) on the lite target (`/projects`). Phase 3:
// the base state, the kebab of a WordPress project (row 3 of `liteMenuProjects`, `supports_admin_sso: true`).
const menuItems = liteMenuProjects()

// Replaces the app state `instances-row-menu` (row 2 on `/instances`): the lite menu has "Admin Area" instead of "WP Admin" / "Log In".
export const projectActionsMenuDefault: ParityState = {
  id: 'project-actions-menu-default',
  ...instancesState({
    keepScroll: true,
    lite: true,
    items: menuItems,
    list: true,
    legacy: [openRowMenu(3).legacy],
    next: [openRowMenu(3).next],
    probes: [...headerProbes, tableCardProbe, ...tableRowProbes(0), ...rowMenuProbes],
  }),
}

// Phase 4: the menu variants. Row ids of `liteMenuProjects`: 1 Node API (custom), 3 WP Blog, 4 Studio with the staging sub-row 41.
const liteItems = liteMenuProjects()

export const projectActionsMenuStaging: ParityState = {
  id: 'project-actions-menu-staging',
  ...instancesState({
    keepScroll: true,
    lite: true,
    items: liteItems,
    list: true,
    legacy: [openRowMenu(41).legacy],
    next: [openRowMenu(41).next],
    probes: [...headerProbes, tableCardProbe, ...rowMenuProbes],
  }),
}

// A failed installation: Try again and Cancel installation only. The subject leads a short list (a menu near the page bottom makes the legacy shot unstable).
export const projectActionsMenuFailed: ParityState = {
  id: 'project-actions-menu-failed',
  ...instancesState({
    keepScroll: true,
    lite: true,
    items: [failedInstance(7), ...liteItems.slice(0, 2)],
    list: true,
    legacy: [openRowMenu(7).legacy],
    next: [openRowMenu(7).next],
    probes: [...headerProbes, tableCardProbe, ...rowMenuProbes],
  }),
}

// Custom project (Show logs, Admin Area -> AppSsoModal). Same content as the M-1 `instances-lite-row-menu-custom`.
export const projectActionsMenuCustom: ParityState = {
  id: 'project-actions-menu-custom',
  ...instancesState({
    keepScroll: true,
    lite: true,
    items: liteItems,
    list: true,
    legacy: [openRowMenu(1).legacy],
    next: [openRowMenu(1).next],
    probes: [...headerProbes, tableCardProbe, ...tableRowProbes(0), ...rowMenuProbes],
  }),
}

export const projectActionsMenuCustomFailed: ParityState = {
  id: 'project-actions-menu-custom-failed',
  ...instancesState({
    keepScroll: true,
    lite: true,
    items: [deployingProject(7, 'Broken App', 'failed'), ...liteItems.slice(0, 2)],
    list: true,
    legacy: [openRowMenu(7).legacy],
    next: [openRowMenu(7).next],
    probes: [...headerProbes, tableCardProbe, ...rowMenuProbes],
  }),
}

// A user who may only see and manage: one item (Manage), so the second and last-item probes would be missing on both sides.
export const projectActionsMenuLimited: ParityState = {
  id: 'project-actions-menu-limited',
  ...instancesState({
    keepScroll: true,
    lite: true,
    items: [limitedInstance(7), ...liteItems.slice(0, 2)],
    list: true,
    legacy: [openRowMenu(7).legacy],
    next: [openRowMenu(7).next],
    probes: [...headerProbes, tableCardProbe, ...rowMenuProbes.filter(probe => probe.key !== 'row-menu-item-2' && probe.key !== 'row-menu-item-last')],
  }),
}

// The deploy issues of a custom project are not on the list in app-lite (the card's status menu lists WordPress and backup issues only,
// LITE `collectInstanceIssues.js:26-75`; next the same, `collect-instance-issues.ts`): they come from `GET /projects/:id/app-health` into the
// status alert of the instance page. The issue menu and the resolve dialog are therefore measured there (`issuePageState`), on the hover
// over the alert chip next to Site details; the page behind them is masked like the frame states.
export const projectActionsIssueMenu: ParityState = {
  id: 'project-actions-issue-menu',
  ...issuePageState(),
  actions: {
    legacy: [...waitForInstanceTitle.legacy, openTabIssue(null).legacy],
    next: [...waitForInstanceTitle.next, openTabIssue(null).next],
  },
  pointer: 'keep',
  probes: tabIssueProbes,
}

// Hover and keyboard focus on the "Admin Area" item of the WP Blog kebab. V2 paints the overlay as the item's `::before`, V4 as `.v-list-item__overlay`.
// Next says "WP Admin" there, so that side finds the item by its testid.
const adminAreaItem = {
  legacy: (page: Page) => page.locator('.v-menu__content.menuable__content__active .v-list-item').filter({ hasText: tr('button.adminArea', 'lite') }).first(),
  next: (page: Page) => page.getByTestId('instance-item-menu').getByTestId('instance-menu-admin-area').first(),
}

const adminAreaProbes: Probe[] = [
  { key: 'menu-item-admin-area', legacy: adminAreaItem.legacy, next: adminAreaItem.next, internal: true },
  {
    key: 'menu-item-overlay',
    legacy: adminAreaItem.legacy,
    next: page => adminAreaItem.next(page).locator('.v-list-item__overlay'),
    pseudo: { legacy: '::before' },
    internal: true,
  },
]

const hoverAdminArea: StateAction = async page => {
  await adminAreaItem.legacy(page).hover()
}
const hoverAdminAreaNext: StateAction = async page => {
  await adminAreaItem.next(page).hover()
}
function focusAdminArea (locate: (page: Page) => ReturnType<typeof adminAreaItem.next>): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const item = locate(page)
    await item.focus()
    await expect(item).toBeFocused()
  }
}

const adminAreaBase = instancesState({
  keepScroll: true,
  lite: true,
  items: liteItems,
  list: true,
  legacy: [openRowMenu(3).legacy],
  next: [openRowMenu(3).next],
  pointer: 'keep',
  probes: [...headerProbes, tableCardProbe, ...rowMenuProbes, ...adminAreaProbes],
})

export const projectActionsMenuItemHover: ParityState = {
  id: 'project-actions-menu-item-hover',
  ...adminAreaBase,
  actions: { legacy: [...adminAreaBase.actions.legacy, hoverAdminArea], next: [...adminAreaBase.actions.next, hoverAdminAreaNext] },
}

export const projectActionsMenuItemFocus: ParityState = {
  id: 'project-actions-menu-item-focus',
  ...adminAreaBase,
  actions: {
    legacy: [...adminAreaBase.actions.legacy, focusAdminArea(adminAreaItem.legacy)],
    next: [...adminAreaBase.actions.next, focusAdminArea(adminAreaItem.next)],
  },
}

// A card whose installation is running: the label bar is disabled (`LITE InstanceLabels.vue:17`).
export const projectActionsMenuLabelsDisabled: ParityState = {
  id: 'project-actions-menu-labels-disabled',
  ...instancesState({
    lite: true,
    items: [deployingProject(1, 'Deploying App', 'in_progress'), shotProject(2, 'Node API')],
    probes: [
      ...headerProbes,
      ...cardProbes(0),
      {
        key: 'label-bar-disabled',
        legacy: (page: Page) => page.locator('.data-iterator-card').nth(0).locator('.label-bar--disabled, .label-bar-empty').first(),
        next: (page: Page) => page.getByTestId('instance-card').nth(0).locator('.label-bar--disabled, .label-bar-empty').first(),
        internal: true,
      },
    ],
  }),
}

// Phase 5: update and copy modals. Row 3 is the WordPress site "WP Blog"; the items carry the Copy plan flag.
const modalItems = modalProjects()
const updateLabel = tr('button.update', 'lite')

// The update dialog has no message paragraph (legacy `message` stays empty): the probe would be missing on both sides.
const updateProbes = [...headerProbes, ...modalProbes.filter(probe => probe.key !== 'modal-message'), ...modalFormProbes]

export const projectActionsUpdateModal: ParityState = {
  id: 'project-actions-update-modal',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    handlers: liteUpdatesHandler(3, ['6.4.2', '6.5.0']),
    legacy: [openProjectAction(3, updateLabel).legacy],
    next: [openProjectAction(3, updateLabel).next],
    probes: updateProbes,
  }),
}

// Hover on the main action of the dialog (Update): the overlay is `::before` in V2, `.v-btn__overlay` in V4.
const submitButton = {
  legacy: (page: Page) => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
  next: (page: Page) => page.getByTestId('instances-modal').locator('.v-card-actions .v-btn').first(),
}

export const projectActionsModalSubmitHover: ParityState = {
  id: 'project-actions-modal-submit-hover',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    handlers: liteUpdatesHandler(3, ['6.4.2', '6.5.0']),
    legacy: [openProjectAction(3, updateLabel).legacy, async page => submitButton.legacy(page).hover()],
    next: [openProjectAction(3, updateLabel).next, async page => submitButton.next(page).hover()],
    pointer: 'keep',
    probes: [
      ...updateProbes,
      { key: 'modal-submit', legacy: submitButton.legacy, next: submitButton.next, internal: true },
    ],
  }),
}

// The updates request is held: the Update item shows its loader and the menu stays open (legacy `checkingUpdates`).
const updateItem = {
  legacy: (page: Page) => page.locator('.v-menu__content.menuable__content__active .v-list-item').filter({ hasText: updateLabel }).first(),
  next: (page: Page) => page.getByTestId('instance-menu-update'),
}

export const projectActionsUpdateChecking: ParityState = {
  id: 'project-actions-update-checking',
  ...instancesState({
    keepScroll: true,
    items: modalItems,
    list: true,
    lite: true,
    handlers: { 'GET /projects/3/wordpress/updates': 'hold' },
    legacy: [openProjectAction(3, updateLabel, false).legacy, async page => expect(updateItem.legacy(page)).toBeVisible()],
    next: [openProjectAction(3, updateLabel, false).next, async page => expect(updateItem.next(page)).toBeVisible()],
    pointer: 'keep',
    probes: [
      ...headerProbes,
      tableCardProbe,
      ...rowMenuProbes,
      { key: 'menu-item-update', legacy: updateItem.legacy, next: updateItem.next, internal: true },
    ],
  }),
}

// No newer version: only the `message.noUpdates` success alert, no dialog.
export const projectActionsUpdateNoUpdates: ParityState = {
  id: 'project-actions-update-no-updates',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    handlers: liteUpdatesHandler(3, []),
    legacy: [openProjectAction(3, updateLabel, false).legacy, async page => expect(page.locator('.alert-manager .alert--success')).toBeVisible(), // V2 leaves the kebab content active after the Update click (off-screen on mobile it widens the page to 1207px); Escape closes it.
      async page => {
        await page.keyboard.press('Escape')
      }, async page => expect(page.locator('.v-menu__content.menuable__content__active')).toHaveCount(0)],
    next: [openProjectAction(3, updateLabel, false).next, async page => expect(page.locator('.alert-manager .alert--success')).toBeVisible()],
    probes: [
      ...headerProbes,
      { key: 'alert', legacy: page => page.locator('.alert-manager .alert--success'), next: page => page.locator('.alert-manager .alert--success') },
      {
        key: 'alert-text',
        legacy: page => page.locator('.alert-manager .alert--success .alert__text-box p').nth(1),
        next: page => page.locator('.alert-manager .alert--success .alert__text-box p').nth(1),
        internal: true,
      },
    ],
  }),
}

// Copy, step 1 (the service select). The Copy item shows for the owner of a project with the plan flag.
export const projectActionsCopyModal: ParityState = {
  id: 'project-actions-copy-modal',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    legacy: [openProjectAction(3, tr('button.copy', 'lite')).legacy],
    next: [openProjectAction(3, tr('button.copy', 'lite')).next],
    probes: [...headerProbes, ...modalProbes, modalFormProbes[0]!],
  }),
  home: liteCopyHome(),
}

// Phase 6: confirmation dialogs through `ActionModalHost` (delete, push to live, clear cache). Row 3 is the WordPress site "WP Blog".
export const projectActionsDeleteModal: ParityState = {
  id: 'project-actions-delete-modal',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    legacy: [openProjectAction(3, tr('button.delete', 'lite')).legacy],
    next: [openProjectAction(3, tr('button.delete', 'lite')).next],
    probes: [...headerProbes, ...modalProbes, ...deleteFormProbes],
  }),
}

export const projectActionsClearCacheModal: ParityState = {
  id: 'project-actions-clear-cache-modal',
  ...instancesState({
    items: modalItems,
    list: true,
    lite: true,
    legacy: [openProjectAction(3, tr('button.clearCache', 'lite')).legacy],
    next: [openProjectAction(3, tr('button.clearCache', 'lite')).next],
    probes: [...headerProbes, ...modalProbes],
  }),
}

// Push to live of the WordPress staging sub-row: the database diff held (loading) and loaded (the form).
const pushItems = wordpressPushProjects()

export const projectActionsPushLoading: ParityState = {
  id: 'project-actions-push-loading',
  ...instancesState({
    items: pushItems,
    list: true,
    lite: true,
    handlers: wordpressPushHandlers('hold'),
    legacy: [openProjectPushDialog('loading').legacy],
    next: [openProjectPushDialog('loading').next],
    probes: pushLoadingProbes,
  }),
}

export const projectActionsPushModal: ParityState = {
  id: 'project-actions-push-modal',
  ...instancesState({
    items: pushItems,
    list: true,
    lite: true,
    handlers: wordpressPushHandlers(pushDiff),
    legacy: [openProjectPushDialog('form').legacy],
    next: [openProjectPushDialog('form').next],
    probes: [...pushProbes, modalFormProbes[0]!],
  }),
}

// Phase 7: Create staging of the WordPress site "WP Blog" (row 3). The disk block loads from the pre-check; the domain field is the
// readonly text + select by default.
const stagingDisk = { legacy: '.v-card__text li', next: '.v-card-text li' }
const stagingItems = stagingProjects(3)

export const projectActionsStagingModal: ParityState = {
  id: 'project-actions-staging-modal',
  ...instancesState({
    items: stagingItems,
    list: true,
    lite: true,
    handlers: stagingUsage(3),
    legacy: [openProjectStaging(3, stagingDisk).legacy],
    next: [openProjectStaging(3, stagingDisk).next],
    probes: [...headerProbes, ...stagingBaseProbes, stagingSelectInputProbe, ...stagingDiskProbes],
  }),
}

// The pre-check is held: the skeleton replaces the disk list and the submit is disabled.
export const projectActionsStagingLoading: ParityState = {
  id: 'project-actions-staging-loading',
  ...instancesState({
    items: stagingItems,
    list: true,
    lite: true,
    handlers: { 'GET /projects/3/staging/pre-check-disk-usage': 'hold' },
    legacy: [openProjectStaging(3, { legacy: '.text-select-input', next: '.text-select-input' }).legacy],
    next: [openProjectStaging(3, { legacy: '.text-select-input', next: '.text-select-input' }).next],
    probes: [...headerProbes, ...stagingBaseProbes, stagingSelectInputProbe, stagingSkeletonProbe],
  }),
}

// `POST /projects/3/staging` answers 422: the error alert, the dialog stays open with the submit enabled again.
const submitStaging = {
  legacy: async (page: Page) => {
    await page.locator('.v-dialog--active .basic-modal .v-card__actions .v-btn').first().evaluate(element => (element as HTMLElement).click())
    await expect(page.locator('.alert-manager .alert--error')).toBeVisible()
  },
  next: async (page: Page) => {
    await page.getByTestId('staging-submit').evaluate(element => (element as HTMLElement).click())
    await expect(page.locator('.alert-manager .alert--error')).toBeVisible()
  },
}

export const projectActionsStagingError: ParityState = {
  id: 'project-actions-staging-error',
  ...instancesState({
    items: stagingItems,
    list: true,
    lite: true,
    handlers: {
      ...stagingUsage(3),
      'POST /projects/3/staging': { status: 422, json: { message: 'The domain has already been taken.' } },
    },
    legacy: [openProjectStaging(3, stagingDisk).legacy, submitStaging.legacy],
    next: [openProjectStaging(3, stagingDisk).next, submitStaging.next],
    pointer: 'keep',
    probes: [
      ...headerProbes,
      ...stagingBaseProbes,
      ...stagingDiskProbes,
      { key: 'alert', legacy: page => page.locator('.alert-manager .alert--error'), next: page => page.locator('.alert-manager .alert--error') },
    ],
  }),
}

// Admin Area (S-70 phase 8): the lite kebab has one item for WP Admin and Log In. WordPress project (3) opens `WpAdminSsoModal`, a custom
// one (1) `AppSsoModal` (title `button.adminArea`); the url is an IP, so the DNS check is skipped and there is no mismatch warning.
const ssoSelectReady = { legacy: '.v-select', next: '.v-select' }
const ssoNoUsersReady = { legacy: '.warning-box', next: '.warning-box' }

export const projectActionsSsoModal: ParityState = {
  id: 'project-actions-sso-modal',
  ...instancesState({
    lite: true,
    items: liteIpProjects(3),
    list: true,
    handlers: liteWpUsersHandler(3, ssoUsers),
    legacy: [openProjectSso(3, ssoSelectReady).legacy],
    next: [openProjectSso(3, ssoSelectReady).next],
    probes: [...headerProbes, ...ssoBaseProbes, ...ssoSelectProbes, ssoButtonProbe(0)],
  }),
}

export const projectActionsSsoNoUsersModal: ParityState = {
  id: 'project-actions-sso-no-users-modal',
  ...instancesState({
    lite: true,
    items: liteIpProjects(3),
    list: true,
    handlers: liteWpUsersHandler(3, []),
    legacy: [openProjectSso(3, ssoNoUsersReady).legacy],
    next: [openProjectSso(3, ssoNoUsersReady).next],
    probes: [...headerProbes, ...ssoBaseProbes, ssoAlertProbe, ssoButtonProbe(0)],
  }),
}

export const projectActionsAppSsoModal: ParityState = {
  id: 'project-actions-app-sso-modal',
  ...instancesState({
    lite: true,
    items: liteIpProjects(1),
    list: true,
    handlers: liteAppUsersHandler(1, liteAppUsers),
    legacy: [openProjectSso(1, ssoSelectReady).legacy],
    next: [openProjectSso(1, ssoSelectReady).next],
    probes: [...headerProbes, ...ssoBaseProbes, ...ssoSelectProbes, ssoButtonProbe(0)],
  }),
}

export const projectActionsAppSsoNoUsers: ParityState = {
  id: 'project-actions-app-sso-no-users',
  ...instancesState({
    lite: true,
    items: liteIpProjects(1),
    list: true,
    handlers: liteAppUsersHandler(1, []),
    legacy: [openProjectSso(1, ssoNoUsersReady).legacy],
    next: [openProjectSso(1, ssoNoUsersReady).next],
    probes: [...headerProbes, ...ssoBaseProbes, ssoAlertProbe, ssoButtonProbe(0)],
  }),
}

// One administrator: the dialog submits on its own. The held `POST` leaves it submitting: the "logging in" message, only the Cancel button
// (neither app shows a loading button here: "Generate link" needs several users or a DNS mismatch).
const ssoSingleUser = [ssoUsers[0]!]
const ssoLoadingReady = { legacy: '.v-card__text p', next: '.v-card-text p' }

export const projectActionsSsoLoading: ParityState = {
  id: 'project-actions-sso-loading',
  ...instancesState({
    lite: true,
    items: liteIpProjects(3),
    list: true,
    handlers: {
      ...liteWpUsersHandler(3, ssoSingleUser),
      'POST /projects/3/sso-url': 'hold',
      'POST /instances/3/sso-url': 'hold',
    },
    legacy: [openProjectSso(3, ssoLoadingReady).legacy],
    next: [openProjectSso(3, ssoLoadingReady).next],
    probes: [...headerProbes, ...ssoBaseProbes, ssoMessageProbe, ssoButtonProbe(0)],
  }),
}

// Import details (S-70 phase 9): the card overlay's "Import details" of a pending import opens `ImportInstanceDetailsModal` (identical in both
// sources). The state is static (the `import-status-changed` Echo event never fires in the harness). Card 1 is the importing project.
const importDetailsButton = tr('button.import.details')
const importingProject = pendingInstance(1, 'Imported Site', 'in_progress', importDetails(false))
const importFailedProject = pendingInstance(1, 'Broken Import', 'failed', importDetails(true))

export const projectActionsImportProgressModal: ParityState = {
  id: 'project-actions-import-progress-modal',
  ...instancesState({
    lite: true,
    items: [importingProject, shotProject(2, 'Static Site')],
    legacy: [openCardDialog(importDetailsButton, 'import-details-modal').legacy],
    next: [openCardDialog(importDetailsButton, 'import-details-modal').next],
    pointer: 'keep',
    probes: [...headerProbes, ...importDetailsProbes(false)],
  }),
}

export const projectActionsImportFailedModal: ParityState = {
  id: 'project-actions-import-failed-modal',
  ...instancesState({
    lite: true,
    items: [importFailedProject, shotProject(2, 'Static Site')],
    legacy: [openCardDialog(importDetailsButton, 'import-details-modal').legacy],
    next: [openCardDialog(importDetailsButton, 'import-details-modal').next],
    pointer: 'keep',
    probes: [...headerProbes, ...importDetailsProbes(true)],
  }),
}

// Cancel installation (S-70 phase 10): the card overlay's Cancel opens `CancelInstallationDialog` with the checkbox unchecked (the red button is
// disabled, the look of the F-07 decision). Card 1 is the installing project; Show logs opens `InstanceDeployLogsModal` (measured by S-69).
const cancelInstallButton = tr('button.installation.cancel')
const installingProject = pendingInstance(1, 'New Site', 'in_progress')

export const projectActionsCancelInstallModal: ParityState = {
  id: 'project-actions-cancel-install-modal',
  ...instancesState({
    lite: true,
    items: [installingProject, shotProject(2, 'Static Site')],
    legacy: [openCardDialog(cancelInstallButton, 'cancel-install-dialog').legacy],
    next: [openCardDialog(cancelInstallButton, 'cancel-install-dialog').next],
    pointer: 'keep',
    probes: [...headerProbes, ...cancelDialogProbes],
  }),
}

// The checkbox is ticked, so the red button is enabled and takes keyboard focus (V2 has no ring; V4's `::after` ring is switched off).
const cancelSubmit = {
  legacy: (page: Page) => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
  next: (page: Page) => page.getByTestId('cancel-install-dialog').locator('.v-card-actions .v-btn').first(),
}

function focusCancelSubmit (target: 'legacy' | 'next'): StateAction {
  return async page => {
    const checkbox = target === 'legacy'
      ? page.locator('.v-dialog--active .v-card__text .checkbox')
      : page.getByTestId('cancel-install-dialog').locator('.v-card-text .checkbox')
    await checkbox.evaluate(element => (element as HTMLElement).click())
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = cancelSubmit[target](page)
    await expect(button).toBeEnabled()
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

const cancelBase = projectActionsCancelInstallModal

export const projectActionsCancelInstallSubmitFocus: ParityState = {
  ...cancelBase,
  id: 'project-actions-cancel-install-modal-submit-focus',
  actions: {
    legacy: [...cancelBase.actions.legacy, focusCancelSubmit('legacy')],
    next: [...cancelBase.actions.next, focusCancelSubmit('next')],
  },
  probes: [
    ...cancelBase.probes,
    {
      key: 'cancel-submit-overlay',
      legacy: cancelSubmit.legacy,
      next: page => cancelSubmit.next(page).locator('.v-btn__overlay'),
      pseudo: { legacy: '::before' },
      internal: true,
    },
  ],
}

// A custom project whose installation runs: the kebab lists Show logs (the custom-only item that opens the deploy logs modal).
// The row gets a screenshot: without one the running-deploy row left an image pending ("images or fonts still loading" on every run).
const showLogsItem = {
  legacy: (page: Page) => page.locator('.v-menu__content.menuable__content__active .v-list-item').filter({ hasText: tr('deployLogs.showLogs', 'lite') }).first(),
  next: (page: Page) => page.getByTestId('instance-menu-show-logs'),
}

export const projectActionsShowLogsMenu: ParityState = {
  id: 'project-actions-show-logs-menu',
  ...instancesState({
    keepScroll: true,
    lite: true,
    items: [{ ...deployingProject(7, 'Deploying App', 'in_progress'), screenshot_time: shotProject(7, 'Deploying App').screenshot_time }, ...liteItems.slice(0, 2)],
    list: true,
    legacy: [openRowMenu(7).legacy],
    next: [openRowMenu(7).next],
    probes: [
      ...headerProbes,
      tableCardProbe,
      ...rowMenuProbes,
      { key: 'menu-item-show-logs', legacy: showLogsItem.legacy, next: showLogsItem.next, internal: true },
    ],
  }),
}

// Labels (S-70 phase 11): the card's label bar opens `AssignExistingLabel` (a menu with the chips of the card and the Add New button),
// whose Add New opens `AddNewLabel`. Two projects: `Acme Blog` (no labels, "Add tags") and `Client Site` (two labels, the `+` button).
// Both get a screenshot: an open menu next to a card without one flaps (see the filter states of `instances.parity.ts`).
const openFromClient = openLabelMenu('card', 1, LABEL_ADD_BUTTON)

export const projectActionsLabelAssign: ParityState = {
  id: 'project-actions-label-assign',
  ...instancesState({
    lite: true,
    keepScroll: true,
    items: labelProjects,
    handlers: labelHandlers,
    legacy: [openFromClient.legacy],
    next: [openFromClient.next],
    probes: [labelMenuProbe, labelAssignPanelProbe, ...labelChipProbes, ...cardProbes(1)],
  }),
}

export const projectActionsLabelAssignEmpty: ParityState = {
  id: 'project-actions-label-assign-empty',
  ...instancesState({
    lite: true,
    keepScroll: true,
    items: labelProjects,
    handlers: labelHandlers,
    legacy: [openLabelMenu('card', 0, LABEL_ADD_TAGS).legacy],
    next: [openLabelMenu('card', 0, LABEL_ADD_TAGS).next],
    probes: [labelMenuProbe, labelAssignPanelProbe, labelEmptyProbe, ...cardProbes(0)],
  }),
}

export const projectActionsLabelAdd: ParityState = {
  id: 'project-actions-label-add',
  ...instancesState({
    lite: true,
    keepScroll: true,
    items: labelProjects,
    handlers: labelHandlers,
    legacy: [openFromClient.legacy, openAddNewLabel.legacy],
    next: [openFromClient.next, openAddNewLabel.next],
    probes: [labelMenuProbe, labelAddPanelProbe, ...cardProbes(1)],
  }),
}

// Phase 12: the DNS / SSL indicator of card 1 (WP Blog, no IP in the URL) and the Fix DNS dialog with the single-server preview box.
// `dns.google` answers through `external` (`liteSslOrderExternal`) where the DNS check runs; the fixed `clock` of `instancesState` keeps `instanceAge` stable.
const dnsMenuProbes = [...headerProbes, ...cardProbes(0), dnsIconProbe(0), dnsMenuProbe, dnsMenuTextProbe]

export const projectActionsDnsMenuAlert: ParityState = {
  id: 'project-actions-dns-menu-alert',
  ...instancesState({
    lite: true,
    items: [liteDnsItem],
    legacy: [hoverDnsIndicator(0)],
    next: [hoverDnsIndicator(0)],
    pointer: 'keep',
    probes: [...dnsMenuProbes, dnsMenuButtonProbe(0), dnsMenuButtonProbe(1)],
  }),
}

// The pointer rests on the first menu button ("Fix it now"): the button hover overlay.
const hoverDnsMenuButton: StateAction = async page => {
  // The menu opens on hover only on desktop (`hoverDnsIndicator` skips mobile): nothing to rest the pointer on there.
  if (!isDesktopViewport(page)) {
    return
  }
  await page.locator('.menuable__content__active .v-btn, .v-menu > .v-overlay__content .v-btn').first().hover()
}

export const projectActionsDnsMenuButtonHover: ParityState = {
  id: 'project-actions-dns-menu-button-hover',
  ...instancesState({
    lite: true,
    items: [liteDnsItem],
    legacy: [hoverDnsIndicator(0), hoverDnsMenuButton],
    next: [hoverDnsIndicator(0), hoverDnsMenuButton],
    pointer: 'keep',
    probes: [...dnsMenuProbes, dnsMenuButtonProbe(0), dnsMenuButtonProbe(1)],
  }),
}

// "Fix it now" closes the menu and opens the dialog with the domain, the single-server preview box (Generate URL) and `DnsOptions`.
export const projectActionsDnsFixModal: ParityState = {
  id: 'project-actions-dns-fix-modal',
  ...instancesState({
    lite: true,
    items: [liteDnsItem],
    legacy: [openFixDns(0).legacy],
    next: [openFixDns(0).next],
    probes: [...headerProbes, ...cardProbes(0), dnsIconProbe(0), ...dnsDialogProbes, ...dnsDialogPreviewProbes],
  }),
}

// The SSL order replaces the icon with a spinner; the menu explains it.
export const projectActionsSslOrderPending: ParityState = {
  id: 'project-actions-ssl-order-pending',
  ...instancesState({
    lite: true,
    items: [liteSslOrderItem('pending')],
    external: liteSslOrderExternal,
    legacy: [hoverDnsIndicator(0)],
    next: [hoverDnsIndicator(0)],
    pointer: 'keep',
    probes: dnsMenuProbes,
  }),
}

// Phase 13: the preview modal (the card overlay's "Open Project" of a project whose host is not `panelalpha.online`), the collaborate chip
// and the issue resolve dialog (opened from the status alert of the instance page, see `projectActionsIssueMenu`).
export const projectActionsPreviewModal: ParityState = {
  id: 'project-actions-preview-modal',
  ...instancesState({
    lite: true,
    items: previewProjects,
    handlers: litePreviewHandlers,
    legacy: [openPreviewModal.legacy],
    next: [openPreviewModal.next],
    probes: [...headerProbes, ...cardProbes(0), ...previewBaseProbes, previewGetProbe],
  }),
}

// The Atarim integration is on and the project carries `general.collaboration`: the chip of the card's action row.
export const projectActionsCollaborate: ParityState = {
  id: 'project-actions-collaborate',
  ...instancesState({
    lite: true,
    items: withCollaboration(previewProjects),
    home: liteCollaborateHome(),
    probes: [...headerProbes, ...cardProbes(0), collaborateCardProbe(0)],
  }),
}

// Issue 0 (missing index file): the first solution ("upload a new version") shows the archive drop area.
export const projectActionsIssueResolveUpload: ParityState = {
  id: 'project-actions-issue-resolve-upload',
  ...issuePageState(),
  actions: {
    legacy: [...waitForInstanceTitle.legacy, openTabIssue(0).legacy],
    next: [...waitForInstanceTitle.next, openTabIssue(0).next],
  },
  probes: [...resolveModalProbes, ...resolveUploadWidgetProbes],
}

export const projectActionsIssueResolveUploadError: ParityState = {
  id: 'project-actions-issue-resolve-upload-error',
  ...issuePageState({ 'POST /projects/1/deploy/upload': { status: 500, json: { message: 'The archive could not be stored.' } } }),
  actions: {
    legacy: [...waitForInstanceTitle.legacy, openTabIssue(0).legacy, ...resolveWithArchive(hoverErrorAlert).legacy],
    next: [...waitForInstanceTitle.next, openTabIssue(0).next, ...resolveWithArchive(hoverErrorAlert).next],
  },
  pointer: 'keep',
  probes: [...resolveModalProbes, ...errorAlertProbes],
  afterCapture: afterResolveAlert,
}

const states: ParityState[] = [
  projectActionsMenuDefault,
  projectActionsMenuStaging,
  projectActionsMenuFailed,
  projectActionsMenuCustom,
  projectActionsMenuCustomFailed,
  projectActionsMenuLimited,
  projectActionsIssueMenu,
  projectActionsMenuItemHover,
  projectActionsMenuItemFocus,
  projectActionsMenuLabelsDisabled,
  projectActionsUpdateModal,
  projectActionsModalSubmitHover,
  projectActionsUpdateChecking,
  projectActionsUpdateNoUpdates,
  projectActionsCopyModal,
  projectActionsDeleteModal,
  projectActionsPushModal,
  projectActionsPushLoading,
  projectActionsClearCacheModal,
  projectActionsStagingModal,
  projectActionsStagingLoading,
  projectActionsStagingError,
  projectActionsSsoModal,
  projectActionsSsoNoUsersModal,
  projectActionsAppSsoModal,
  projectActionsAppSsoNoUsers,
  projectActionsSsoLoading,
  projectActionsImportProgressModal,
  projectActionsImportFailedModal,
  projectActionsCancelInstallModal,
  projectActionsCancelInstallSubmitFocus,
  projectActionsShowLogsMenu,
  projectActionsLabelAssign,
  projectActionsLabelAssignEmpty,
  projectActionsLabelAdd,
  projectActionsDnsMenuAlert,
  projectActionsDnsMenuButtonHover,
  projectActionsDnsFixModal,
  projectActionsSslOrderPending,
  projectActionsPreviewModal,
  projectActionsCollaborate,
  projectActionsIssueResolveUpload,
  projectActionsIssueResolveUploadError,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
