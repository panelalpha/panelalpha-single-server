import type { ParityState } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import {
  cardProbes,
  deleteFormProbes,
  deployHistoryHandlers,
  deployingProject,
  deployLiveHandlers,
  deployLogsConsoleProbes,
  deployLogsLoaderProbe,
  deployLogsProbes,
  deployOverlayProbes,
  deployPendingProbes,
  dragFilesOver,
  dropZoneProbes,
  filterControlsProbe,
  filterLabels,
  filterMenuProbes,
  filterSelectedChipProbes,
  footerProbe,
  gridInstances,
  headerProbes,
  hoverCard,
  instancesState,
  listInstances,
  liteProject,
  loadErrorFrameProbe,
  modalProbes,
  noDataProbes,
  noResultsButtonPartProbes,
  noResultsProbes,
  openClearCache,
  openDeployLogs,
  openRemove,
  openShare,
  overlayProbes,
  pageInstances,
  pendingInstance,
  pendingProbes,
  rawInstance,
  searchAction,
  selectCards,
  shotProject,
  skeletonCardProbe,
  snackbarProbes,
  sortMenuProbe,
  styleSwitchProbe,
  tableCardProbe,
  tableCellProbes,
  tableRowProbes,
  tableSkeletonRowProbe,
  tableSortProbe,
  tableSubLabelProbe,
  tableSubrowProbe,
  tableSuspendChipProbe,
  titleProbe,
  toolbarClearFilterProbe,
  toolbarFilterCountProbe,
  toolbarFilterProbe,
  toolbarSearchProbe,
  toolbarSortProbe,
  waitForCardCount,
} from './instances'

// S-09 instances-list. Every state is signed in on /instances with the shell fixtures, a fixed clock and one screenshot
// handler per item (see instances.ts). Each state id is a literal `id: '…',` line, which `registeredStateIds` in
// report/write-report.ts reads as text.

export const instancesGrid: ParityState = {
  id: 'instances-grid',
  ...instancesState({
    lite: true,
    items: gridInstances(),
    probes: [...headerProbes, ...cardProbes(0), ...cardProbes(2), ...cardProbes(3), ...cardProbes(5)],
  }),
}

export const instancesLoadingGrid: ParityState = {
  id: 'instances-loading-grid',
  ...instancesState({
    lite: true,
    instances: 'hold',
    probes: [titleProbe, styleSwitchProbe, filterControlsProbe, skeletonCardProbe],
  }),
}

export const instancesEmpty: ParityState = {
  id: 'instances-empty',
  ...instancesState({
    lite: true,
    probes: noDataProbes,
  }),
}

export const instancesLoadError: ParityState = {
  id: 'instances-load-error',
  ...instancesState({
    lite: true,
    instances: { status: 500, json: { message: 'Server error.' } },
    probes: [titleProbe, styleSwitchProbe, filterControlsProbe, loadErrorFrameProbe],
  }),
}

export const instancesList: ParityState = {
  id: 'instances-list',
  ...instancesState({
    lite: true,
    items: listInstances(),
    list: true,
    probes: [...headerProbes, tableCardProbe, tableSortProbe, ...tableRowProbes(0), ...tableRowProbes(1), ...tableRowProbes(2), ...tableRowProbes(3), tableSubrowProbe, ...tableCellProbes(0), ...tableCellProbes(1), tableSuspendChipProbe, tableSubLabelProbe],
  }),
}

export const instancesLoadingList: ParityState = {
  id: 'instances-loading-list',
  ...instancesState({
    lite: true,
    instances: 'hold',
    list: true,
    probes: [titleProbe, styleSwitchProbe, filterControlsProbe, tableCardProbe, tableSortProbe, tableSkeletonRowProbe],
  }),
}

// 20 instances, 8 per page: the footer shows (it hides on a single page of 8).
export const instancesPagination: ParityState = {
  id: 'instances-pagination',
  ...instancesState({
    lite: true,
    items: pageInstances(8),
    total: 20,
    probes: [...headerProbes, ...cardProbes(0), footerProbe,
    ],
  }),
}

export const instancesPaginationList: ParityState = {
  id: 'instances-pagination-list',
  ...instancesState({
    lite: true,
    items: pageInstances(8),
    total: 20,
    list: true,
    probes: [...headerProbes, tableCardProbe, tableSortProbe, ...tableRowProbes(0), footerProbe],
  }),
}

const allItems = gridInstances()
const matchingItems = allItems.slice(0, 1)
const listAnswer = (items: Array<Record<string, unknown>>, total = items.length) => ({ json: { data: items, meta: { total } } })

// Typing in the search field: the first answer is the full first page, the second (one request after the 300 ms + 300 ms
// debounce) the match.
export const instancesSearchResults: ParityState = {
  id: 'instances-search-results',
  ...instancesState({
    lite: true,
    items: allItems,
    instances: [listAnswer(allItems), listAnswer(matchingItems)],
    legacy: [searchAction('acme', 1), waitForCardCount(1)],
    next: [searchAction('acme', 1), waitForCardCount(1)],
    probes: [...headerProbes, toolbarSearchProbe, toolbarSortProbe, ...cardProbes(0)],
  }),
}

async function waitForNoResults (page: Page): Promise<void> {
  await page.locator('.no-results-container .v-btn').waitFor()
}

export const instancesSearchNoResults: ParityState = {
  id: 'instances-search-no-results',
  ...instancesState({
    lite: true,
    items: allItems,
    instances: [listAnswer(allItems), listAnswer([], 0)],
    legacy: [searchAction('acme', 0), waitForCardCount(0), waitForNoResults],
    next: [searchAction('acme', 0), waitForCardCount(0), waitForNoResults],
    probes: [...headerProbes, toolbarSearchProbe, ...noResultsProbes, ...noResultsButtonPartProbes],
  }),
}

async function openFilterMenu (page: Page): Promise<void> {
  await page.locator('.filter-menu .custom-menu').click()
  await page.locator('.label-list .v-list-item').first().waitFor()
}

// An open menu next to cards without a screenshot flaps the blurred "preview not available" backdrop by up to 15 levels
// between two shots (the harness never gets two equal ones), so the menu states list the cards that have a screenshot.
const screenshotItems = [allItems[0]!, allItems[2]!, allItems[3]!]

export const instancesFilterMenu: ParityState = {
  id: 'instances-filter-menu',
  ...instancesState({
    lite: true,
    items: screenshotItems,
    handlers: { 'GET /labels': { json: { data: filterLabels } } },
    legacy: [openFilterMenu],
    next: [openFilterMenu],
    pointer: 'keep',
    probes: [...headerProbes, toolbarFilterProbe, ...filterMenuProbes],
  }),
}

// One label picked, not applied: the field shows it as a removable `LabelChip` (white close icon).
async function pickFirstLabel (page: Page): Promise<void> {
  await openFilterMenu(page)
  await page.locator('.label-list .v-list-item').first().click()
  await page.locator('.v-autocomplete .label-chip').waitFor()
}

export const instancesFilterMenuSelected: ParityState = {
  id: 'instances-filter-menu-selected',
  ...instancesState({
    lite: true,
    items: screenshotItems,
    handlers: { 'GET /labels': { json: { data: filterLabels } } },
    legacy: [pickFirstLabel],
    next: [pickFirstLabel],
    pointer: 'keep',
    probes: [...headerProbes, toolbarFilterProbe, ...filterMenuProbes, ...filterSelectedChipProbes],
  }),
}

// One label picked and applied: the list is answered a second time with the labelled instance only.
const labelled = [gridInstances()[5]!]
async function applyLabel (page: Page): Promise<void> {
  await openFilterMenu(page)
  await page.locator('.label-list .v-list-item').first().click()
  await page.getByRole('button', { name: tr('button.apply'), exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.data-iterator-card').length === 1)
  await page.locator('.filter-number').waitFor()
}

export const instancesLabelFiltered: ParityState = {
  id: 'instances-label-filtered',
  ...instancesState({
    lite: true,
    items: allItems,
    instances: [listAnswer(allItems), listAnswer(labelled)],
    handlers: { 'GET /labels': { json: { data: filterLabels } } },
    legacy: [applyLabel],
    next: [applyLabel],
    probes: [...headerProbes, toolbarFilterProbe, toolbarFilterCountProbe, toolbarClearFilterProbe, ...cardProbes(0)],
  }),
}

async function openSortMenu (page: Page): Promise<void> {
  await page.locator('.data-iterator-filter-controls__item--sort-instances .v-select').click()
  await page.locator('.custom-dropdown-select .v-list-item').first().waitFor()
}

export const instancesSortMenu: ParityState = {
  id: 'instances-sort-menu',
  ...instancesState({
    lite: true,
    items: screenshotItems,
    legacy: [openSortMenu],
    next: [openSortMenu],
    pointer: 'keep',
    probes: [...headerProbes, toolbarSortProbe, sortMenuProbe],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 4: selection, mass actions, card variants
// ---------------------------------------------------------------------------------------------

// Cards with a screenshot (an open dialog or overlay above a "preview not available" card flaps the blurred backdrop): Acme Blog,
// Old Shop (suspended, still has its screenshot) and Studio (with a staging).
const selectable = [allItems[0]!, allItems[2]!, allItems[3]!]

export const instancesSelected: ParityState = {
  id: 'instances-selected',
  ...instancesState({
    lite: true,
    items: selectable,
    legacy: [selectCards([0, 2]).legacy],
    next: [selectCards([0, 2]).next],
    probes: [...headerProbes, ...cardProbes(0), ...cardProbes(2), ...snackbarProbes],
  }),
}

export const instancesCardHover: ParityState = {
  id: 'instances-card-hover',
  ...instancesState({
    lite: true,
    items: selectable,
    legacy: [hoverCard(0).legacy],
    next: [hoverCard(0).next],
    pointer: 'keep',
    probes: [...headerProbes, ...cardProbes(0), ...overlayProbes(0)],
  }),
}

// Toolbar hover: the pointer rests on the inactive (list) button of the view switch (the active one is outlined and primary). The
// overlay is V2 `::before`, V4 `.v-btn__overlay`. "Clear filter" is a text span without a hover style (legacy
// `DataIteratorFilter.vue` only sets `cursor: pointer`), so it has nothing to measure.
const switchButton = {
  legacy: (page: Page) => page.locator('h1 + div .v-btn').nth(1),
  next: (page: Page) => page.getByTestId('instances-style-switch').locator('.v-btn').nth(1),
}

export const instancesToolbarHover: ParityState = {
  id: 'instances-toolbar-hover',
  ...instancesState({
    lite: true,
    items: selectable,
    legacy: [async page => {
      await switchButton.legacy(page).hover()
    }],
    next: [async page => {
      await switchButton.next(page).hover()
    }],
    pointer: 'keep',
    probes: [
      ...headerProbes,
      { key: 'view-switch-hover', legacy: switchButton.legacy, next: switchButton.next, internal: true },
      {
        key: 'view-switch-overlay',
        legacy: switchButton.legacy,
        next: page => switchButton.next(page).locator('.v-btn__overlay'),
        pseudo: { legacy: '::before' },
        internal: true,
      },
    ],
  }),
}

// Toolbar keyboard focus (matrix state `focus-visible`). Focus is set on the view-switch button before the control (`.focus()`)
// and moved with real Tab presses from there, so the order of the stops INSIDE the toolbar is part of the behaviour: both apps must
// need the same number of presses (`TOOLBAR_TAB_PRESSES`). The page-level order (V4 `v-tabs` is one stop, V2 three) is covered by
// the shell states, not here.
const TOOLBAR_TAB_PRESSES = 2
// Below 768px the search field is an icon with a hidden input that Tab never reaches in either app, so the target there is the
// sort select (the last real stop of the toolbar) and the press count is whatever legacy needs (next must match it).
const MOBILE_MAX_WIDTH = 975
const toolbarTabTarget = {
  legacy: (page: Page) => (page.viewportSize()?.width ?? Infinity) <= MOBILE_MAX_WIDTH
    ? page.locator('.data-iterator-filter-controls__item--sort-instances input').first()
    : page.locator('.data-iterator-filter-controls__item').last().locator('input'),
  next: (page: Page) => (page.viewportSize()?.width ?? Infinity) <= MOBILE_MAX_WIDTH
    ? page.getByTestId('instances-filter-controls').locator('.data-iterator-filter-controls__item--sort-instances input').last()
    : page.getByTestId('instances-filter-controls').locator('.data-iterator-filter-controls__item').last().locator('input'),
}
// Legacy presses on mobile (measured on the fresh legacy run). Pinned because a cached legacy run (`PARITY_LEGACY_CACHE`) never executes
// the legacy hook, so a module-level variable filled by it would stay empty and fail the next side.
const TOOLBAR_TAB_PRESSES_MOBILE = 1

function tabFromSwitch (side: 'legacy' | 'next'): (page: Page) => Promise<void> {
  return async page => {
    const mobile = (page.viewportSize()?.width ?? Infinity) <= MOBILE_MAX_WIDTH
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    await switchButton[side](page).focus()
    const target = toolbarTabTarget[side](page)
    let presses = 0
    while (presses < 10 && !(await target.evaluate(node => node === document.activeElement))) {
      await page.keyboard.press('Tab')
      presses++
    }
    const active = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160) ?? 'none')
    if (mobile) {
      expect(presses, `Tab presses from the view switch to the sort select (${side}), focus on ${active}`).toBe(TOOLBAR_TAB_PRESSES_MOBILE)
    } else {
      expect(presses, `Tab presses from the view switch to the search field (${side})`).toBe(TOOLBAR_TAB_PRESSES)
    }
    expect(await target.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

export const instancesToolbarFocus: ParityState = {
  id: 'instances-toolbar-focus',
  ...instancesState({
    lite: true,
    items: selectable,
    legacy: [tabFromSwitch('legacy')],
    next: [tabFromSwitch('next')],
    pointer: 'keep',
    probes: [...headerProbes, toolbarSearchProbe],
  }),
}

// Installing and importing cards, then the failed ones, with the overlay of the first card shown. They keep a screenshot card
// last so the list has an image to wait for.
const installing = [pendingInstance(1, 'New Site', 'in_progress'), selectable[0]!]
const importing = [
  pendingInstance(1, 'Imported Site', 'in_progress', { current_step: { name: 'installNewInstance', percent: 40 } }),
  selectable[0]!,
]
const failed = [pendingInstance(1, 'Broken Site', 'failed'), pendingInstance(2, 'Broken Import', 'failed', { current_step: null }), selectable[0]!]

export const instancesInstalling: ParityState = {
  id: 'instances-installing',
  ...instancesState({
    lite: true,
    items: installing,
    legacy: [hoverCard(0).legacy],
    next: [hoverCard(0).next],
    pointer: 'keep',
    probes: [...headerProbes, ...cardProbes(0), ...pendingProbes(0, 'installing'), ...overlayProbes(0)],
  }),
}

export const instancesImport: ParityState = {
  id: 'instances-import',
  ...instancesState({
    lite: true,
    items: importing,
    legacy: [hoverCard(0).legacy],
    next: [hoverCard(0).next],
    pointer: 'keep',
    probes: [...headerProbes, ...cardProbes(0), ...pendingProbes(0, 'import'), ...overlayProbes(0)],
  }),
}

export const instancesInstallFailed: ParityState = {
  id: 'instances-install-failed',
  ...instancesState({
    lite: true,
    items: failed,
    legacy: [hoverCard(0).legacy],
    next: [hoverCard(0).next],
    pointer: 'keep',
    probes: [
      ...headerProbes,
      ...cardProbes(0),
      ...pendingProbes(0, 'failed'),
      ...pendingProbes(1, 'failed-import'),
      ...overlayProbes(0),
    ],
  }),
}

// "Needs Attention" has a missing automatic backup and a pending update: the status indicator shows issues. The menu opens on hover
// over the indicator (`open-on-hover`).
// It gets a screenshot too: an open menu above a card without one flaps the blurred "preview not available" backdrop.
const withIssues = [allItems[0]!, { ...allItems[4]!, screenshot_time: allItems[0]!.screenshot_time }, allItems[3]!]
const hoverStatus: { legacy: (page: Page) => Promise<void>, next: (page: Page) => Promise<void> } = {
  legacy: async page => {
    await page.locator('.data-iterator-card').nth(1).locator('.status-indicator').hover()
    await page.locator('.v-menu__content.menuable__content__active').waitFor()
  },
  next: async page => {
    await page.locator('.data-iterator-card').nth(1).locator('.status-indicator-container').first().hover()
    await page.locator('.status-indicator-menu').waitFor()
  },
}

export const instancesStatusMenu: ParityState = {
  id: 'instances-status-menu',
  ...instancesState({
    keepScroll: true,
    items: withIssues,
    legacy: [hoverStatus.legacy],
    next: [hoverStatus.next],
    pointer: 'keep',
    probes: [
      ...headerProbes,
      ...cardProbes(1),
      {
        key: 'status-indicator',
        legacy: page => page.locator('.data-iterator-card').nth(1).locator('.status-indicator-container'),
        next: page => page.getByTestId('instance-card').nth(1).locator('.status-indicator-container'),
        internal: true,
      },
      {
        key: 'status-menu',
        legacy: page => page.locator('.v-menu__content.menuable__content__active'),
        next: page => page.locator('.status-indicator-menu'),
        internal: true,
      },
    ],
  }),
}

export const instancesModalMassDelete: ParityState = {
  id: 'instances-modal-mass-delete',
  ...instancesState({
    lite: true,
    items: selectable,
    legacy: [selectCards([0, 2]).legacy, openRemove.legacy],
    next: [selectCards([0, 2]).next, openRemove.next],
    probes: [...headerProbes, ...modalProbes, ...deleteFormProbes],
  }),
}

export const instancesModalClearCache: ParityState = {
  id: 'instances-modal-clear-cache',
  ...instancesState({
    lite: true,
    items: selectable,
    legacy: [selectCards([0, 2]).legacy, openClearCache.legacy],
    next: [selectCards([0, 2]).next, openClearCache.next],
    probes: [...headerProbes, ...modalProbes],
  }),
}

// The share dialog of the selection (Acme Blog and Studio): a developer on both, a pending invitation on one only.
const shareA = rawInstance(1, {
  name: 'Acme Blog',
  url: 'https://acme-blog.example.com',
  domain: 'acme-blog.example.com',
  screenshot_time: allItems[0]!.screenshot_time,
  host_ip_address: (allItems[0] as Record<string, unknown>).host_ip_address,
  host_ipv4_addresses: (allItems[0] as Record<string, unknown>).host_ipv4_addresses,
  domain_ssl_details: (allItems[0] as Record<string, unknown>).domain_ssl_details,
  shared_access: [
    { email: 'ann@example.com', name: 'Ann Lee', role: 'developer', accepted_at: '2026-09-01T00:00:00.000Z', invited_at: '2026-09-01T00:00:00.000Z' },
    { email: 'bob@example.com', name: 'Bob Ray', role: 'view_only', accepted_at: null, invited_at: '2026-10-03T12:00:00.000Z', notification_sent_at: '2026-10-03T12:00:00.000Z', resend_available_at: '2026-10-06T12:00:00.000Z' },
  ],
})
const shareB = { ...allItems[3]!, shared_access: [{ email: 'ann@example.com', name: 'Ann Lee', role: 'developer', accepted_at: '2026-09-01T00:00:00.000Z', invited_at: '2026-09-01T00:00:00.000Z' }] }
const shareItems = [shareA, shareB]

export const instancesModalShare: ParityState = {
  id: 'instances-modal-share',
  ...instancesState({
    lite: true,
    items: shareItems,
    handlers: {
      'GET /projects/1/wordpress/users': { json: { data: [{ id: 1, display_name: 'admin', user_email: 'admin@example.com' }] } },
      'GET /invitation-suggestions': { json: { data: [{ email: 'cara@example.com', name: 'Cara Fox' }] } },
    },
    legacy: [selectCards([0, 1]).legacy, openShare.legacy],
    next: [selectCards([0, 1]).next, openShare.next],
    probes: [
      ...headerProbes,
      { key: 'share-modal', legacy: page => page.locator('.v-dialog--active .share-instance-modal'), next: page => page.getByTestId('share-modal') },
      { key: 'share-title', legacy: page => page.locator('.v-dialog--active .share-instance-modal .v-card__title'), next: page => page.getByTestId('share-modal').locator('.v-card-title'), internal: true },
      { key: 'share-invite-form', legacy: page => page.locator('.v-dialog--active .invite-form'), next: page => page.getByTestId('share-invite-form'), internal: true },
      { key: 'share-invite-button', legacy: page => page.locator('.v-dialog--active .invite-form__button'), next: page => page.getByTestId('share-invite'), internal: true },
      { key: 'share-invite-content', legacy: page => page.locator('.v-dialog--active .invite-form__button .v-btn__content'), next: page => page.getByTestId('share-invite').locator('.v-btn__content'), internal: true },
      { key: 'share-table', legacy: page => page.locator('.v-dialog--active .share-access-table'), next: page => page.getByTestId('share-table'), internal: true },
      { key: 'share-row-1', legacy: page => page.locator('.v-dialog--active .share-access-table__body .share-access-table__row').first(), next: page => page.getByTestId('share-user-row').first(), internal: true },
      { key: 'share-row-2', legacy: page => page.locator('.v-dialog--active .share-access-table__body .share-access-table__row').nth(1), next: page => page.getByTestId('share-user-row').nth(1), internal: true },
      { key: 'share-save', legacy: page => page.locator('.v-dialog--active .share-instance-modal .v-card__actions .v-btn').first(), next: page => page.getByTestId('share-save'), internal: true },
    ],
  }),
}

// ---------------------------------------------------------------------------------------------
// Phase 5: app-lite on the lite target (`/projects`, single server)
// ---------------------------------------------------------------------------------------------

// A custom project with a screenshot, one without, and a WordPress site (lite lists both). Custom projects carry the two deploy
// issues, so their cards show the red status chip.
const liteItems = [
  shotProject(1, 'Node API'),
  liteProject(2, { name: 'Static Site' }),
  shotProject(3, 'WP Blog', { type: 'wordpress' }),
]

function liteStatusProbe (index: number) {
  return {
    key: `status-indicator-${index + 1}`,
    legacy: (page: Page) => page.locator('.data-iterator-card').nth(index).locator('.status-indicator-container'),
    next: (page: Page) => page.getByTestId('instance-card').nth(index).locator('.status-indicator-container'),
    internal: true,
  }
}

// `/projects`: the project heading (`heading.instance.titleProjects`) and the cards of a single-server list.
export const instancesLiteProjects: ParityState = {
  id: 'instances-lite-projects',
  ...instancesState({
    lite: true,
    items: liteItems,
    probes: [...headerProbes, ...cardProbes(0), ...cardProbes(1), ...cardProbes(2), liteStatusProbe(0)],
  }),
}

// The three looks of a custom card: idle with a screenshot, deploy in progress and deploy failed (the animated terminal image).
const customCards = [shotProject(1, 'Node API'), deployingProject(2, 'Deploying App', 'in_progress'), deployingProject(3, 'Broken App', 'failed')]

export const instancesLiteCustomCard: ParityState = {
  id: 'instances-lite-custom-card',
  ...instancesState({
    lite: true,
    items: customCards,
    probes: [
      ...headerProbes,
      ...cardProbes(0),
      ...cardProbes(1),
      ...deployPendingProbes(1, 'deploying'),
      ...cardProbes(2),
      ...deployPendingProbes(2, 'failed'),
      liteStatusProbe(0),
    ],
  }),
}

// The hover overlays of the pending cards: "Deploy in progress" (Show logs, Cancel deploy) and "Deploy failed" (Show logs, the
// download icon, Try again, Cancel). The screenshot card is last so the list has an image to wait for.
const deploying = [deployingProject(1, 'Deploying App', 'in_progress'), shotProject(2, 'Node API')]
const deployFailed = [deployingProject(1, 'Broken App', 'failed'), shotProject(2, 'Node API')]

export const instancesLiteCustomDeployProgress: ParityState = {
  id: 'instances-lite-custom-deploy-progress',
  ...instancesState({
    lite: true,
    items: deploying,
    legacy: [hoverCard(0).legacy],
    next: [hoverCard(0).next],
    pointer: 'keep',
    probes: [...headerProbes, ...cardProbes(0), ...deployPendingProbes(0, 'deploying'), ...deployOverlayProbes(0, 'overlay', 'cancel-deploy')],
  }),
}

export const instancesLiteCustomDeployFailed: ParityState = {
  id: 'instances-lite-custom-deploy-failed',
  ...instancesState({
    lite: true,
    items: deployFailed,
    legacy: [hoverCard(0).legacy],
    next: [hoverCard(0).next],
    pointer: 'keep',
    probes: [...headerProbes, ...cardProbes(0), ...deployPendingProbes(0, 'failed'), ...deployOverlayProbes(0, 'overlay', 'download-logs')],
  }),
}

// Deploy logs of a failed deploy: the dialog while the log to show is looked up (the list request is held; the spinner is masked),
// then with the log loaded (steps and console lines). The modal reads the history of a finished deploy, not the live endpoint.
const liteSpinnerMasks = {
  legacy: [(page: Page) => page.locator('.deploy-logs-modal .loader')],
  // Next has the skeleton in place of the spinner (user request 2026-11-09); nothing to mask.
  next: [],
}

export const instancesLiteDeployLogsLoading: ParityState = {
  id: 'instances-lite-deploy-logs-loading',
  ...instancesState({
    lite: true,
    items: deployFailed,
    handlers: { 'GET /projects/1/deploy-logs': 'hold' },
    legacy: [openDeployLogs(0, 'loader').legacy],
    next: [openDeployLogs(0, 'loader').next],
    masks: liteSpinnerMasks,
    probes: [...headerProbes, ...deployLogsProbes, deployLogsLoaderProbe],
  }),
}

export const instancesLiteDeployLogs: ParityState = {
  id: 'instances-lite-deploy-logs',
  ...instancesState({
    lite: true,
    items: deployFailed,
    handlers: deployHistoryHandlers(1, 31),
    legacy: [openDeployLogs(0).legacy],
    next: [openDeployLogs(0).next],
    probes: [...headerProbes, ...deployLogsProbes, ...deployLogsConsoleProbes],
  }),
}

// A deploy that is still running: the dialog follows it live (the polling endpoint answers the lines so far, then nothing new).
// Legacy never shows the live badge, hint or "Cancel deploy" here (its viewer emits `state-change` only when the status changes), so no badge probe.
export const instancesLiteDeployLogsLive: ParityState = {
  id: 'instances-lite-deploy-logs-live',
  ...instancesState({
    lite: true,
    items: deploying,
    handlers: deployLiveHandlers(1),
    legacy: [openDeployLogs(0).legacy],
    next: [openDeployLogs(0).next],
    probes: [
      ...headerProbes,
      ...deployLogsProbes,
      ...deployLogsConsoleProbes,
    ],
  }),
}

// Files dragged over the list: the drop overlay (dashed frame, folder icon, copy) covers the list area.
export const instancesLiteDropZone: ParityState = {
  id: 'instances-lite-drop-zone',
  ...instancesState({
    lite: true,
    items: liteItems,
    legacy: [dragFilesOver],
    next: [dragFilesOver],
    probes: [...headerProbes, ...cardProbes(0), ...dropZoneProbes],
  }),
}

// The issue resolve, preview and collaborate states moved to `project-actions*.parity.ts` (S-70 phase 13).

// The DNS / SSL indicator states moved to `project-actions*.parity.ts` (S-70 phase 12).

const states: ParityState[] = [
  instancesSelected,
  instancesCardHover,
  instancesToolbarHover,
  instancesToolbarFocus,
  instancesInstalling,
  instancesImport,
  instancesInstallFailed,
  instancesStatusMenu,
  instancesModalMassDelete,
  instancesModalClearCache,
  instancesModalShare,
  instancesSearchResults,
  instancesSearchNoResults,
  instancesFilterMenu,
  instancesFilterMenuSelected,
  instancesLabelFiltered,
  instancesSortMenu,
  instancesGrid,
  instancesLoadingGrid,
  instancesEmpty,
  instancesLoadError,
  instancesList,
  instancesLoadingList,
  instancesPagination,
  instancesPaginationList,
  instancesLiteProjects,
  instancesLiteCustomCard,
  instancesLiteCustomDeployProgress,
  instancesLiteCustomDeployFailed,
  instancesLiteDeployLogsLoading,
  instancesLiteDeployLogs,
  instancesLiteDeployLogsLive,
  instancesLiteDropZone,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // explicit app for the states the S-70 (ui-project-list-actions) review has not moved to lite yet; `lite: true` states keep the lite target (S-69)
    await runState(browser, testInfo, { target: 'app', ...state })
  })
}
