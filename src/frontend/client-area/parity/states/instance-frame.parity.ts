import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState, trPattern } from './auth'
import { alertManagerProbe, waitFor } from './hosting'
import {
  dailyRecords,
  framePageMasks,
  installationStatus,
  INSTANCE_PAGE_DNS,
  INSTANCE_PAGE_PRIVILEGES,
  instanceChangeDomainProbe,
  instancePageHandlers,
  instancePageRaw,
  instanceTabProbe,
  instanceTitleProbe,
  instanceUrlProbe,
  liveSubinstanceProbe,
  stagingCopy,
  subinstanceAddProbe,
  topBarActionProbe,
  topBarSkeletonProbe,
  waitForInstanceTitle,
} from './instance'
import {
  deleteFormProbes,
  instancesState,
  labelHandlers,
  liteShellHome,
  modalFormProbes,
  modalProbes,
  noDataProbes,
  pushDiff,
  pushHandlers,
  rawInstance,
  screenshotHandlers,
  SSO_LEGACY,
} from './instances'
import { liteAppUsers, liteAppUsersHandler, litePushHandlers } from './instances-lite'
import { isDesktop, NOW, shellHandlers, shellHome } from './shell'

// S-10 instance-general, phase 3: the top bar in its base state (live WordPress, full privileges, no Atarim, no staging, DNS in order)
// and the loading skeleton. The frame's router-view is masked: the General screen is measured in its own states.
// Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Plan: context/changes/instance-general/plan.md ("Faza 3", "Stany parity").

/** The top bar of the default instance page: title, URL, Change domain, the subinstance bar and the action buttons, the tabs. */
const topBarProbes = [
  instanceTitleProbe,
  instanceUrlProbe,
  instanceChangeDomainProbe,
  liveSubinstanceProbe,
  subinstanceAddProbe,
  topBarActionProbe('share', 'button.share', 'top-bar-share'),
  topBarActionProbe('admin-area', 'button.adminArea', 'top-bar-admin-area'),
  topBarActionProbe('staging', 'button.staging', 'top-bar-staging'),
  topBarActionProbe('update', 'button.update', 'top-bar-update'),
  topBarActionProbe('copy', 'button.copy', 'top-bar-copy', isDesktop),
  topBarActionProbe('cache', 'button.cache', 'top-bar-cache'),
  topBarActionProbe('delete', 'button.delete', 'top-bar-delete'),
  instanceTabProbe('general', 'heading.instance.tab.siteDetails'),
  instanceTabProbe('backups', 'heading.instance.tab.backups'),
  instanceTabProbe('plugins', 'heading.instance.tab.plugins'),
  instanceTabProbe('advanced', 'heading.instance.tab.advanced'),
]

export const instanceFrameDefault: ParityState = {
  id: 'instance-frame-default',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: topBarProbes,
  masks: framePageMasks,
  viewportOnly: true,
}

export const instanceFrameLoading: ParityState = {
  id: 'instance-frame-loading',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers({ 'GET /instances/1': 'hold' }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [waitFor(page => page.locator('.top-bar .top-bar__container'))],
    next: [waitFor(page => page.locator('.top-bar .top-bar__container'))],
  },
  probes: [topBarSkeletonProbe],
  masks: framePageMasks,
  viewportOnly: true,
}

/** The instances the title menu lists for an empty term: the current one first, then a second account (`GET /instances`, sorted by name). */
const titleMenuItems = [
  rawInstance(1, { name: 'Studio Blog', title: 'Studio Blog', url: 'https://studio.example.com' }),
  rawInstance(2, { name: 'Shop Demo', title: 'Shop Demo', url: 'https://shop.example.com' }),
]

/** The name field of the title in edit mode (legacy `.editor__input-box`, next the same class on its form). */
const titleEditInputProbe: Probe = {
  key: 'title-edit-input',
  legacy: page => page.locator('.editor__input-box input').first(),
  next: page => page.locator('.editor__input-box input').first(),
}

/** The save (check) button of the title in edit mode: the first button of the closed controls. */
const titleEditSaveProbe: Probe = {
  key: 'title-edit-save',
  legacy: page => page.locator('.editor__controls--closed .v-btn').nth(0),
  next: page => page.locator('.editor__controls--closed .v-btn').nth(0),
}

/** The cancel (close) button of the title in edit mode: the second button of the closed controls. */
const titleEditCancelProbe: Probe = {
  key: 'title-edit-cancel',
  legacy: page => page.locator('.editor__controls--closed .v-btn').nth(1),
  next: page => page.locator('.editor__controls--closed .v-btn').nth(1),
}

/** The search field of the title menu (legacy `.instance-search-menu` `v-text-field`, next the same class on the field). */
const titleMenuFieldProbe: Probe = {
  key: 'title-menu-field',
  legacy: page => page.locator('.instance-search-menu input').first(),
  next: page => page.locator('.instance-search-menu input').first(),
}

/** The first result of the title menu. Both apps keep the `.search-item` class. */
const titleMenuItemProbe: Probe = {
  key: 'title-menu-item',
  legacy: page => page.locator('.instance-search-menu .search-item').first(),
  next: page => page.locator('.instance-search-menu .search-item').first(),
}

/** The title with the switcher open: the list of instances and the search field. */
export const instanceFrameTitleMenu: ParityState = {
  id: 'instance-frame-title-menu',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers({
    'GET /instances': { json: { data: titleMenuItems, meta: { total: titleMenuItems.length } } },
    ...screenshotHandlers(titleMenuItems),
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [
      waitFor(page => page.locator('h1.top-bar-title__button')),
      async page => {
        await page.locator('h1.top-bar-title__button').click()
      },
      waitFor(page => page.locator('.instance-search-menu .search-item')),
    ],
    next: [
      waitFor(page => page.getByTestId('instance-title')),
      async page => {
        await page.getByTestId('instance-title').click()
      },
      waitFor(page => page.locator('.instance-search-menu .search-item')),
    ],
  },
  probes: [titleMenuItemProbe, titleMenuFieldProbe, instanceTitleProbe],
  masks: framePageMasks,
  viewportOnly: true,
}

/**
 * The title in edit mode: the name field with its save and cancel buttons. No `clock`: the state holds a text field the user types in
 * (lesson S-36, the clock would freeze a field that changes).
 */
export const instanceFrameTitleEdit: ParityState = {
  id: 'instance-frame-title-edit',
  path: '/instances/1/general',
  signedIn: true,
  home: shellHome(),
  handlers: instancePageHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [
      waitFor(page => page.locator('h1.top-bar-title__button')),
      async page => {
        await page.locator('.editor__controls--open .v-btn').first().click()
      },
      waitFor(page => page.locator('.editor__input-box input')),
    ],
    next: [
      waitFor(page => page.getByTestId('instance-title')),
      async page => {
        await page.getByTestId('instance-title-edit').click()
      },
      waitFor(page => page.locator('.editor__input-box input')),
    ],
  },
  probes: [titleEditInputProbe, titleEditSaveProbe, titleEditCancelProbe],
  masks: framePageMasks,
  viewportOnly: true,
}

/**
 * A top bar action on both sides: legacy by its copy key (the vertical `BaseIconButton`), next by its test id. Clicks only; the
 * probes of the state measure what the click opens.
 */
function clickTopBarAction (copyKey: string, testId: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.v-btn--vertical', { hasText: trPattern(copyKey, 'lite') }).first().click()
    },
    next: async page => {
      await page.getByTestId(testId).click()
    },
  }
}

/** The `GET /projects/{id}/app-health` answer of a probed project that runs fine (legacy `apis/Instances.js:26-30`). */
const APP_HEALTH_OK: Handler = {
  json: { data: { available: true, healthy: true, serving: 'ok', ports: [{ port: 8000, status: 'ok', http_code: 200, detail: 'HTTP 200' }], checks: [] } },
}

/** A custom project whose port does not answer: the deploy issue `deploy.port_mismatch` (legacy `collectInstanceIssues.js:111-124`). */
const APP_HEALTH_PORT_MISMATCH: Handler = {
  json: { data: { available: true, healthy: false, serving: 'ok', ports: [{ port: 8000, status: 'closed', http_code: 0, detail: 'Connection refused' }], checks: [] } },
}

/** The `GET /projects/{id}/source` answer of a custom project deployed from git with a finished last deploy (legacy `apis/Instances.js` `projectSource`, `response.data.data`). */
const SOURCE_API = {
  available: true,
  stack: { label: 'Node.js' },
  database: { present: true, label: 'MariaDB 11' },
  last_deploy: { status: 'finished', commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', finished_at: '2026-10-04T09:30:00Z' },
  deploy_steps: {
    dependencies: { commands: ['npm install'], skippable: true },
    build: { commands: ['npm run build'], skippable: true },
    migrations: { commands: [], skippable: false },
  },
  warnings: [],
}

const SOURCE_OK: Handler = { json: { data: SOURCE_API } }

/** Privileges of a lite custom project whose owner manages its users (Admin Area, `showAdminAreaButton`). */
const LITE_CUSTOM_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'general.manage_users']

/** The `BasicModal` dialog of the top bar: legacy `.v-dialog--active .v-card`, next the host's `instances-modal`. */
const modalReady = {
  legacy: [waitFor(page => page.locator('.v-dialog--active .v-card'))],
  next: [waitFor(page => page.getByTestId('instances-modal'))],
}

/** Delete from the top bar: the BasicModal of the single delete (the wp-cloud alert is not in the base instance). */
export const instanceFrameModalDelete: ParityState = {
  id: 'instance-frame-modal-delete',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, clickTopBarAction('button.delete', 'top-bar-delete').legacy, ...modalReady.legacy],
    next: [...waitForInstanceTitle.next, clickTopBarAction('button.delete', 'top-bar-delete').next, ...modalReady.next],
  },
  probes: [...modalProbes, ...deleteFormProbes],
  masks: framePageMasks,
  viewportOnly: true,
}

/** Update from the top bar: the versions load first, then the dialog with the version select and the backup checkbox. */
export const instanceFrameModalUpdate: ParityState = {
  id: 'instance-frame-modal-update',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers({
    'GET /instances/1': { json: { data: instancePageRaw(1, { version: '6.4', update_details: { available_updates: ['6.5', '6.6'] } }) } },
    'GET /instances/1/wordpress/updates': { json: { data: { wp_version: '6.4', available_updates: ['6.5', '6.6'] } } },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, clickTopBarAction('button.update', 'top-bar-update').legacy, ...modalReady.legacy],
    next: [...waitForInstanceTitle.next, clickTopBarAction('button.update', 'top-bar-update').next, ...modalReady.next],
  },
  probes: [...modalProbes, ...modalFormProbes],
  masks: framePageMasks,
  viewportOnly: true,
}

/** Create a staging copy from the top bar: the disk usage loads, then the staging dialog. */
export const instanceFrameModalStaging: ParityState = {
  id: 'instance-frame-modal-staging',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers({
    'GET /instances/1/staging/pre-check-disk-usage': { json: { data: { uploads_dir_usage: 0, wordpress_db_usage: 0 } } },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, clickTopBarAction('button.staging', 'top-bar-staging').legacy, ...modalReady.legacy],
    next: [...waitForInstanceTitle.next, clickTopBarAction('button.staging', 'top-bar-staging').next, waitFor(page => page.getByTestId('staging-modal'))],
  },
  probes: [
    { key: 'staging-modal', legacy: page => page.locator('.v-dialog--active .v-card'), next: page => page.getByTestId('staging-modal') },
    // `staging-modal` is the dialog's own testid (the host's `instances-modal` is not used by this dialog).
    { key: 'modal-title', legacy: page => page.locator('.v-dialog--active .v-card__title'), next: page => page.getByTestId('staging-modal').locator('.v-card-title'), internal: true },
    { key: 'modal-icon', legacy: page => page.locator('.v-dialog--active .v-card__title .v-icon').first(), next: page => page.getByTestId('staging-modal').locator('.v-card-title .v-icon').first(), internal: true },
    { key: 'modal-close', legacy: page => page.locator('.v-dialog--active .v-card__title .v-btn .v-icon'), next: page => page.getByTestId('staging-modal').locator('.v-card-title .v-btn .v-icon'), internal: true },
    { key: 'modal-submit', legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first(), next: page => page.getByTestId('staging-modal').locator('.v-card-actions .v-btn').first(), internal: true },
    { key: 'modal-cancel', legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').nth(1), next: page => page.getByTestId('staging-modal').locator('.v-card-actions .v-btn').nth(1), internal: true },
  ],
  masks: framePageMasks,
  viewportOnly: true,
}

/** Share from the top bar with one shared user on the instance: the share dialog with its list of users. */
export const instanceFrameShared: ParityState = {
  id: 'instance-frame-shared',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers({
    'GET /instances/1': {
      json: {
        data: instancePageRaw(1, {
          shared_access: [{ email: 'ann@example.com', name: 'Ann', role: 'editor', accepted_at: '2026-10-01 10:00:00' }],
        }),
      },
    },
    'GET /instances/1/wordpress/users': { json: { data: [{ id: 1, display_name: 'admin', user_email: 'admin@example.com' }] } },
    'GET /invitation-suggestions': { json: { data: [{ email: 'cara@example.com', name: 'Cara Fox' }] } },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, clickTopBarAction('button.share', 'top-bar-share').legacy, waitFor(page => page.locator('.v-dialog--active .share-instance-modal'))],
    next: [...waitForInstanceTitle.next, clickTopBarAction('button.share', 'top-bar-share').next, waitFor(page => page.getByTestId('share-modal'))],
  },
  probes: [
    { key: 'share-modal', legacy: page => page.locator('.v-dialog--active .share-instance-modal'), next: page => page.getByTestId('share-modal') },
    { key: 'share-title', legacy: page => page.locator('.v-dialog--active .share-instance-modal .v-card__title'), next: page => page.getByTestId('share-modal').locator('.v-card-title'), internal: true },
  ],
  masks: framePageMasks,
  viewportOnly: true,
}

/**
 * app-lite project (`/projects/41/general`): the top bar with the single-server buttons (Preview, Admin Area), and the Admin Area dialog
 * of a custom project open with the project users. Measured on the lite target only (the app has no Admin Area).
 */
export const instanceFrameLite: ParityState = {
  id: 'instance-frame-lite',
  target: 'lite',
  path: '/projects/41/general',
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: {
    ...shellHandlers([], 'projects'),
    'GET /projects/41': { json: { data: instancePageRaw(41, { name: 'Studio Blog', url: 'https://studio.example.com', type: 'custom', app_type: 'custom', supports_admin_sso: true, privileges: LITE_CUSTOM_PRIVILEGES }) } },
    'GET /projects/41/app-health': APP_HEALTH_OK,
    'GET /projects/41/wordpress/automatic-backup': { json: { data: { enabled: false } } },
    'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
    'GET /projects/41/reporting/visitors/last-week': {
      json: { data: { visits: { records: [], total: 0, previous_total: 0 }, visits_length: { records: [], total: 0, previous_total: 0 } } },
    },
    'GET /projects/41/reporting/bandwidth/last-week': { json: { data: { records: [], total: 0 } } },
    'GET /projects/41/wordpress/maintenance-mode': { json: { status: false } },
    'GET /projects/41/wordpress/debug-mode': { json: { status: false } },
    ...liteAppUsersHandler(41, liteAppUsers),
  },
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, clickTopBarAction('button.adminArea', 'top-bar-admin-area').legacy, waitFor(page => page.locator(SSO_LEGACY))],
    next: [...waitForInstanceTitle.next, clickTopBarAction('button.adminArea', 'top-bar-admin-area').next, waitFor(page => page.getByTestId('sso-modal'))],
  },
  probes: [
    { key: 'sso-modal', legacy: page => page.locator(SSO_LEGACY), next: page => page.getByTestId('sso-modal') },
    topBarActionProbe('preview', 'button.preview', 'top-bar-preview'),
    topBarActionProbe('admin-area', 'button.adminArea', 'top-bar-admin-area'),
  ],
  viewportOnly: true,
}

/**
 * D1 (ui-instance-general): the lite top bar's Admin Area replaces WP Admin and Log In. A WordPress project with supports_admin_sso
 * (the base fixture) shows it; no click, the button only. The dialog is measured in instance-frame-lite (custom project).
 */
export const instanceFrameAdminArea: ParityState = {
  id: 'instance-frame-admin-area',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [topBarActionProbe('admin-area', 'button.adminArea', 'top-bar-admin-area')],
  masks: framePageMasks,
  viewportOnly: true,
}

/**
 * Phase 9 (ui-instance-general): lite single-server top bar, Open Project before Preview before Admin Area. The project is not on
 * panelalpha.online, so Preview stays. No click: the button row only (the click opens the preview modal, measured with the card).
 */
export const instanceFrameOpenProject: ParityState = {
  id: 'instance-frame-open-project',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [
    topBarActionProbe('open-project', 'button.openProject', 'top-bar-open-project'),
    topBarActionProbe('preview', 'button.preview', 'top-bar-preview'),
    topBarActionProbe('admin-area', 'button.adminArea', 'top-bar-admin-area'),
  ],
  masks: framePageMasks,
  viewportOnly: true,
}

// S-10 instance-general, phase 6: staging. The live page lists one staging copy (41); its sub-instance tab sits after the live tab.

/** The second tab of the subinstance bar: the first staging copy (the live tab is the first). Both apps keep `.subinstance-bar__item`. */
const stagingTabProbe: Probe = {
  key: 'subinstance-staging',
  legacy: page => page.locator('.subinstance-bar__item').nth(1),
  next: page => page.locator('.subinstance-bar__item').nth(1),
}

/** The live page with the staging copy 41 in `staging_apps`; `copy` overrides the copy's fields (its install state). */
function liveWithStaging (copy: Record<string, unknown> = {}): Record<string, Handler> {
  return instancePageHandlers({
    'GET /instances/1': { json: { data: instancePageRaw(1, { staging_apps: [stagingCopy(copy)] }) } },
  })
}

/** Live with a staging copy: the staging tab next to the live tab, and the `+` is gone (a copy exists). */
export const instanceFrameStaging: ParityState = {
  id: 'instance-frame-staging',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: liveWithStaging(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [instanceTitleProbe, liveSubinstanceProbe, stagingTabProbe],
  masks: framePageMasks,
  viewportOnly: true,
}

/** The staging copy's own page (`/instances/41/general`): the live tab first, then the copy, and Push to live on the copy. */
export const instanceFrameStagingPage: ParityState = {
  id: 'instance-frame-staging-page',
  path: '/instances/41/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: { ...instancePageHandlers(), ...pushHandlers(pushDiff) },
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [
    instanceTitleProbe,
    liveSubinstanceProbe,
    stagingTabProbe,
    topBarActionProbe('push-to-live', 'button.pushToLive', 'top-bar-push-to-live'),
    {
      key: 'dns-propagation',
      legacy: page => page.locator('.v-btn', { hasText: trPattern('message.dnsPropagationInProgress', 'lite') }),
      next: page => page.getByTestId('instance-dns-propagation'),
    },
  ],
  viewportOnly: true,
}

/** A staging copy whose clone is in progress: the tab shows the loader and the in-progress state (the hover menu has no action yet). */
export const instanceFrameStagingProgress: ParityState = {
  id: 'instance-frame-staging-progress',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: liveWithStaging({ async_status: installationStatus('in_progress') }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [instanceTitleProbe, liveSubinstanceProbe, stagingTabProbe],
  masks: framePageMasks,
  viewportOnly: true,
}

/** A staging copy whose clone failed: the tab shows the error chip (the hover menu's Try again and Cancel have no action yet). */
export const instanceFrameStagingError: ParityState = {
  id: 'instance-frame-staging-error',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: liveWithStaging({ async_status: installationStatus('failed') }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [instanceTitleProbe, liveSubinstanceProbe, stagingTabProbe],
  masks: framePageMasks,
  viewportOnly: true,
}

/** Push to live from the staging copy's page: the push dialog with the table diff of the copy. */
export const instanceFrameModalPushToLive: ParityState = {
  id: 'instance-frame-modal-push-to-live',
  path: '/instances/41/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: { ...instancePageHandlers(), ...pushHandlers(pushDiff) },
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, clickTopBarAction('button.pushToLive', 'top-bar-push-to-live').legacy, ...modalReady.legacy],
    next: [...waitForInstanceTitle.next, clickTopBarAction('button.pushToLive', 'top-bar-push-to-live').next, ...modalReady.next],
  },
  probes: [...modalProbes, ...modalFormProbes],
  viewportOnly: true,
}

/** The second checkbox of the push dialog: app-lite's custom project pushes its volumes (`form.label.pushVolumes`), not a database. */
const pushVolumesProbe: Probe = {
  key: 'push-volumes',
  legacy: page => page.locator('.v-dialog--active .v-card__text .checkbox').nth(1),
  next: page => page.getByTestId('instances-modal').locator('.v-card-text .checkbox').nth(1),
  internal: true,
}

/**
 * app-lite custom project push: the dialog with the volumes checkbox and no table selects. A custom project has no diff request, so
 * the state registers none (`litePushHandlers`).
 */
export const instanceFrameLitePush: ParityState = {
  id: 'instance-frame-lite-push',
  target: 'lite',
  path: '/projects/41/general',
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: {
    ...shellHandlers([], 'projects'),
    ...litePushHandlers,
    ...screenshotHandlers([{ id: 41, screenshot_time: '2026-10-01 10:00:00' }], 'projects'),
  },
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, clickTopBarAction('button.pushToLive', 'top-bar-push-to-live').legacy, ...modalReady.legacy],
    next: [...waitForInstanceTitle.next, clickTopBarAction('button.pushToLive', 'top-bar-push-to-live').next, ...modalReady.next],
  },
  probes: [...modalProbes, pushVolumesProbe],
  viewportOnly: true,
}

// S-10 instance-general, phase 7: the tab chips (maintenance on, the report provider in error) and the lite status alert of a custom project.

/** A tab's chip: the legacy `.v-chip` inside the tab, next the `data-testid` the next chip carries. */
function tabChipProbe (key: 'monitoring' | 'backups' | 'plugins' | 'advanced', labelKey: string): Probe {
  return {
    key: `instance-tab-${key}-chip`,
    legacy: page => page.locator('.top-bar__item', { hasText: trPattern(labelKey, 'lite') }).first().locator('.v-chip').first(),
    next: page => page.getByTestId(`instance-tab-${key}-chip`),
  }
}

/** Live page with the maintenance mode on and the report provider in error: Monitoring warns (and opens the code), Advanced warns. */
export const instanceFrameTabsAlerts: ParityState = {
  id: 'instance-frame-tabs-alerts',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers({
    'GET /instances/1': {
      json: {
        data: instancePageRaw(1, {
          health_checks: { report_provider: { status: 'error', message: null, code: '<script src="https://tracking.example.com/t.js"></script>' } },
        }),
      },
    },
    'GET /instances/1/wordpress/maintenance-mode': { json: { status: true } },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [
    tabChipProbe('monitoring', 'heading.instance.tab.monitoring'),
    tabChipProbe('backups', 'heading.instance.tab.backups'),
    tabChipProbe('plugins', 'heading.instance.tab.plugins'),
    tabChipProbe('advanced', 'heading.instance.tab.advanced'),
  ],
  masks: framePageMasks,
  viewportOnly: true,
}

/** app-lite custom project: the deploy issues of a custom project show the status alert next to Site details. */
export const instanceFrameLiteCustom: ParityState = {
  id: 'instance-frame-lite-custom',
  target: 'lite',
  path: '/projects/41/general',
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: {
    ...shellHandlers([], 'projects'),
    'GET /projects/41': { json: { data: instancePageRaw(41, { name: 'Studio Blog', url: 'https://studio.example.com', type: 'custom', app_type: 'custom' }) } },
    'GET /projects/41/wordpress/maintenance-mode': { json: { status: false } },
    'GET /projects/41/wordpress/debug-mode': { json: { status: false } },
    'GET /projects/41/source': SOURCE_OK,
    'GET /projects/41/app-health': APP_HEALTH_PORT_MISMATCH,
    'GET /projects/41/wordpress/automatic-backup': { json: { data: { enabled: false } } },
    'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
    'GET /projects/41/reporting/visitors/last-week': {
      json: { data: { visits: { records: [], total: 0, previous_total: 0 }, visits_length: { records: [], total: 0, previous_total: 0 } } },
    },
    'GET /projects/41/reporting/bandwidth/last-week': { json: { data: { records: [], total: 0 } } },
  },
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [
    {
      key: 'status-tab-alert',
      legacy: page => page.locator('.instance-status-tab-alert .v-chip').first(),
      next: page => page.getByTestId('instance-status-tab-alert'),
    },
  ],
  masks: framePageMasks,
  viewportOnly: true,
}

// S-10 instance-general, phase 10 (reworked in phase 26): WordPress is current and WooCommerce 8.0.0 has 8.5.0 available, so the Installation
// card shows the WooCommerce update button. The click is not measured: lite `General.vue:411` calls `showPluginUpdateModal`, which the lite
// General view does not mix in (a TypeError, no dialog), so there is no legacy dialog to compare with. The card with its update state is.
/** The `GET /projects/{id}/source` answer with deploy warnings (legacy `issueRegistry.js:81-110`): the last deploy finished with
 * warnings, and the project is not deployable; the API lists the not deployable one last, the alert shows it first. */
const SOURCE_WARNINGS: Handler = {
  json: {
    data: {
      ...SOURCE_API,
      warnings: [
        { code: 'deploy.last_deploy_warnings', title: 'The last deploy finished with warnings.', details: ['npm WARN deprecated left-pad', 'Build step skipped the lint'] },
        { code: 'deploy.not_deployable', title: 'The project cannot be deployed.', details: ['Add an index file.'] },
      ],
    },
  },
}

const menuReady = waitFor(page => page.locator('.status-list__issue-title'))

const alertHover: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.instance-status-tab-alert .v-chip').first().hover()
  },
  next: async page => {
    await page.getByTestId('instance-status-tab-alert').hover()
  },
}

/** The status alert of a custom project whose `/source` carries deploy warnings: the chip, and its menu open on hover (the warnings in the Engine's words, `pre-line`). */
export const instanceSourceWarnings: ParityState = {
  ...instanceFrameLiteCustom,
  id: 'instance-source-warnings',
  pointer: 'keep',
  handlers: {
    ...instanceFrameLiteCustom.handlers,
    'GET /projects/41/source': SOURCE_WARNINGS,
    'GET /projects/41/app-health': APP_HEALTH_OK,
  },
  actions: {
    legacy: [...instanceFrameLiteCustom.actions.legacy, alertHover.legacy, menuReady],
    next: [...instanceFrameLiteCustom.actions.next, alertHover.next, menuReady],
  },
  probes: [
    ...instanceFrameLiteCustom.probes,
    {
      key: 'status-list',
      legacy: page => page.locator('.status-list'),
      next: page => page.locator('.status-list'),
    },
  ],
}

const instanceGeneralWooUpdateAvailable: ParityState = {
  id: 'instance-general-woo-update-available',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  handlers: instancePageHandlers({
    'GET /instances/1': {
      json: {
        data: instancePageRaw(1, {
          version: '6.5',
          update_details: { available_updates: [] },
          plugin_details: [{ name: 'woocommerce', version: '8.0.0', update: 'available', update_version: '8.5.0' }],
        }),
      },
    },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, waitFor(page => page.locator('.v-btn', { hasText: trPattern('button.woocommerce.update', 'lite') }).first())],
    next: [...waitForInstanceTitle.next, waitFor(page => page.getByRole('button', { name: trPattern('button.woocommerce.update', 'lite') }))],
  },
  probes: [
    {
      key: 'installation-card',
      legacy: page => page.locator('.v-card', { hasText: trPattern('heading.instance.siteDetails.installation.title', 'lite') }),
      next: page => page.locator('.v-card', { hasText: trPattern('heading.instance.siteDetails.installation.title', 'lite') }),
    },
    {
      key: 'woo-update-button',
      legacy: page => page.locator('.v-btn', { hasText: trPattern('button.woocommerce.update', 'lite') }).first(),
      next: page => page.getByRole('button', { name: trPattern('button.woocommerce.update', 'lite') }),
    },
  ],
  masks: framePageMasks,
  viewportOnly: true,
}

// S-10 instance-general, phase 11: the General analytics (Visitors and Bandwidth cards). The report provider is on in these states, so
// both cards show; the reporting calls answer empty payloads unless a state overrides them. The probes are the card roots and the section
// title (no frame masks: the analytics sit in the router-view the frame masks elsewhere).
const ANALYTICS_HOME = shellHome({ app: { integrations: { report_provider_enabled: true } } })

const INSTALLATION_TITLE = trPattern('heading.instance.siteDetails.installation.title', 'lite')

const analyticsProbes: Probe[] = [
  // The Installation card of the General grid (title weight, version colour, "Install now" link, body text) and the grid's own origin.
  {
    key: 'installation-card',
    legacy: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }),
    next: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }),
  },
  {
    key: 'installation-title',
    legacy: page => page.locator('.v-card__title', { hasText: INSTALLATION_TITLE }),
    next: page => page.locator('.v-card-title', { hasText: INSTALLATION_TITLE }),
  },
  {
    key: 'installation-version',
    legacy: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }).locator('h1.version').first(),
    next: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }).locator('h1.version').first(),
  },
  {
    key: 'installation-install-link',
    legacy: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }).locator('a', { hasText: trPattern('button.installNow', 'lite') }).first(),
    next: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }).locator('a', { hasText: trPattern('button.installNow', 'lite') }).first(),
  },
  {
    key: 'installation-body',
    legacy: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }).locator('.v-card__text'),
    next: page => page.locator('.v-card', { hasText: INSTALLATION_TITLE }).locator('.v-card-text'),
  },
  {
    key: 'analytics-title',
    legacy: page => page.locator('h4', { hasText: trPattern('heading.instance.siteDetails.analytics.title', 'lite') }),
    next: page => page.locator('h4', { hasText: trPattern('heading.instance.siteDetails.analytics.title', 'lite') }),
  },
  {
    key: 'analytics-visitors',
    legacy: page => page.locator('.analytics-card--visitors'),
    next: page => page.locator('.analytics-card--visitors'),
  },
  {
    key: 'analytics-system',
    legacy: page => page.locator('.analytics-card--system'),
    next: page => page.locator('.analytics-card--system'),
  },
]

const analyticsWaitForCharts: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [...waitForInstanceTitle.legacy, waitFor(page => page.locator('.analytics-card--system .apexcharts-canvas'))],
  next: [...waitForInstanceTitle.next, waitFor(page => page.locator('.analytics-card--system .apexcharts-canvas'))],
}

/** Both reporting calls held: the cards show their skeletons. */
const instanceGeneralAnalyticsLoading: ParityState = {
  id: 'instance-general-analytics-loading',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: ANALYTICS_HOME,
  handlers: instancePageHandlers({
    'GET /instances/1/reporting/visitors/last-week': 'hold',
    'GET /instances/1/reporting/bandwidth/last-week': 'hold',
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, waitFor(page => page.locator('.analytics-card--system .v-skeleton-loader'))],
    next: [...waitForInstanceTitle.next, waitFor(page => page.locator('.analytics-card--system .v-skeleton-loader'))],
  },
  probes: analyticsProbes,
}

/**
 * Phase 10 (ui-instance-general): the General screen of a live WordPress project on lite, unmasked (Installation, Project Details,
 * Security, Loading Speed, plus the analytics cards of the base fixture). Probes: the card roots and titles, the Open Project button.
 * The Source cards (phases 11-13) render only for a custom project with a `source`; this fixture has none.
 */
const instanceGeneralDefault: ParityState = {
  id: 'instance-general-default',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: ANALYTICS_HOME,
  handlers: instancePageHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: analyticsWaitForCharts,
  probes: [
    ...analyticsProbes.filter(probe => probe.key.startsWith('installation-') || probe.key === 'analytics-system'),
    {
      key: 'security-card',
      legacy: page => page.locator('.security-card .v-card'),
      next: page => page.locator('.security-card .v-card'),
    },
    {
      key: 'security-title',
      legacy: page => page.locator('.v-card__title', { hasText: trPattern('heading.instance.siteDetails.security.title', 'lite') }),
      next: page => page.locator('.v-card-title', { hasText: trPattern('heading.instance.siteDetails.security.title', 'lite') }),
    },
    {
      key: 'loading-speed-title',
      legacy: page => page.locator('.v-card__title', { hasText: trPattern('heading.instance.siteDetails.loadingSpeed.title', 'lite') }),
      next: page => page.locator('.v-card-title', { hasText: trPattern('heading.instance.siteDetails.loadingSpeed.title', 'lite') }),
    },
    {
      key: 'open-project',
      legacy: page => page.locator('.visit-button').first(),
      next: page => page.locator('.visit-button').first(),
    },
  ],
}

/**
 * Phase 22 (ui-instance-general): the disabled state of General's Security card. A pending SSL order (`ssl_order_status`) blocks
 * Manage SSL: the button is disabled and loading, the tooltip (`LITE SecurityInfoCard.vue:164-184`, display none at rest) is not probed.
 * The top-bar actions of a non-active project are N/A (redirect to the list, covered by `instance-frame-suspended`).
 */
const instanceGeneralSslPending: ParityState = {
  id: 'instance-general-ssl-pending',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: ANALYTICS_HOME,
  handlers: instancePageHandlers({
    'GET /instances/1': { json: { data: instancePageRaw(1, { ssl_order_status: 'pending' }) } },
    // No valid certificate yet (self-signed): a trusted one would hide the order indicator (`shouldShowSslOrderStatus`).
    'GET /server-accounts/1/ssl/certificate/detected': {
      json: { data: { not_before: '2026-09-25T00:00:00Z', self_signed: true, name_match: false, issuer_name: 'Example CA' } },
    },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: analyticsWaitForCharts,
  probes: [
    {
      key: 'security-card',
      legacy: page => page.locator('.security-card .v-card'),
      next: page => page.locator('.security-card .v-card'),
    },
    {
      key: 'ssl-manage',
      legacy: page => page.locator('.security-card .v-btn', { hasText: trPattern('button.manage', 'lite') }).first(),
      next: page => page.getByTestId('security-ssl-manage'),
    },
  ],
}

/** The default period with no data: the charts draw the normalized zero pair (`[[0, 0]]` with blank labels). */
const instanceGeneralAnalyticsEmpty: ParityState = {
  id: 'instance-general-analytics-empty',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: ANALYTICS_HOME,
  handlers: instancePageHandlers({
    'GET /instances/1/reporting/visitors/last-week': {
      json: { data: { visits: { records: {}, total: 0, previous_total: 0 }, visits_length: { records: {}, total: 0, previous_total: 0 } } },
    },
    'GET /instances/1/reporting/bandwidth/last-week': { json: { data: { records: {}, total: 0 } } },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: analyticsWaitForCharts,
  probes: analyticsProbes,
}

/** The period switched to last month: the select opens, the month is picked and both cards show the month's report. */
const instanceGeneralAnalyticsMonth: ParityState = {
  id: 'instance-general-analytics-month',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: ANALYTICS_HOME,
  handlers: instancePageHandlers({
    'GET /instances/1/reporting/visitors/last-month': {
      json: {
        data: {
          visits: { records: dailyRecords([12, 18, 9, 22, 15, 30, 27]), total: 133, previous_total: 110 },
          visits_length: { records: dailyRecords([120, 300, 90, 600, 240, 480, 360]), total: 2190, previous_total: 1800 },
        },
      },
    },
    'GET /instances/1/reporting/bandwidth/last-month': {
      json: { data: { records: dailyRecords([1_048_576, 2_097_152, 524_288, 3_145_728, 1_572_864, 2_621_440, 1_835_008]), total: 12_582_912 } },
    },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [
      ...analyticsWaitForCharts.legacy,
      async page => {
        await page.locator('.v-select', { hasText: trPattern('form.option.period.lastWeek', 'lite') }).first().click()
      },
      async page => {
        await page.locator('.v-list-item', { hasText: trPattern('form.option.period.lastMonth', 'lite') }).first().click()
      },
      waitFor(page => page.locator('.analytics-card--system .current-data', { hasText: '12 MB' })),
      // The opened select scrolls the page differently in the two apps on a narrow viewport (the fixed header shows mid-page in a full-page capture).
      async page => {
        await page.evaluate(() => window.scrollTo(0, 0))
      },
    ],
    next: [
      ...analyticsWaitForCharts.next,
      async page => {
        await page.locator('.v-select', { hasText: trPattern('form.option.period.lastWeek', 'lite') }).first().click()
      },
      async page => {
        await page.locator('.v-list-item', { hasText: trPattern('form.option.period.lastMonth', 'lite') }).first().click()
      },
      waitFor(page => page.locator('.analytics-card--system .current-data', { hasText: '12 MB' })),
      // The opened select scrolls the page differently in the two apps on a narrow viewport (the fixed header shows mid-page in a full-page capture).
      async page => {
        await page.evaluate(() => window.scrollTo(0, 0))
      },
    ],
  },
  probes: analyticsProbes,
}

/** The report provider is off: no Visitors card, and the Bandwidth card takes the full row (`xl=12`). */
const instanceGeneralNoReportProvider: ParityState = {
  id: 'instance-general-no-report-provider',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: shellHome({ app: { integrations: { report_provider_enabled: false } } }),
  handlers: instancePageHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: analyticsWaitForCharts,
  probes: analyticsProbes,
}

/** No `general.view_reports`: the analytics section is not rendered and no report is requested. */
const instanceGeneralNoPrivileges: ParityState = {
  id: 'instance-general-no-privileges',
  path: '/instances/1/general',
  signedIn: true,
  clock: NOW,
  home: ANALYTICS_HOME,
  handlers: instancePageHandlers({
    'GET /instances/1': {
      json: { data: instancePageRaw(1, { privileges: INSTANCE_PAGE_PRIVILEGES.filter(privilege => privilege !== 'general.view_reports') }) },
    },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForInstanceTitle,
  probes: [],
}

// S-10 instance-general, phase 12: the edge states of the frame. A suspended instance leaves the page for the list with its alert
// (`resolveFrameRedirect`); an unknown id fails the GET and the frame goes to the 404 page (`passFrame`).

/**
 * A suspended instance opened from its page: the frame redirects to the list (`/instances`) and the list shows the service-suspended
 * alert. The list is empty, so the state measures the redirect and the alert only.
 */
export const instanceFrameSuspended: ParityState = {
  ...instancesState({
    handlers: {
      ...labelHandlers,
      'GET /instances/1': { json: { data: instancePageRaw(1, { service_status: 'suspended' }) } },
    },
    probes: [alertManagerProbe, ...noDataProbes.slice(0, 1)],
  }),
  id: 'instance-frame-suspended',
  path: '/instances/1/general',
  actions: {
    legacy: [
      waitFor(page => page.locator('.no-data--instances')),
      waitFor(page => page.locator('.alert-manager', { hasText: trPattern('message.serviceSuspended', 'lite') })),
    ],
    next: [
      waitFor(page => page.getByTestId('instances-no-data')),
      waitFor(page => page.getByTestId('shell-alert-manager').filter({ hasText: trPattern('message.serviceSuspended', 'lite') })),
    ],
  },
}

/**
 * An id the API does not know: the instance GET answers 404, the frame pushes the 404 page and legacy then replaces it with the list
 * (`index.vue:365` and `:273-276`: the empty instance is not active, so `mountInstancePage` goes to `preferredSpaBase`). The state ends
 * on the empty list, like `instance-frame-suspended`; the 404 page itself is measured with `page-not-found`.
 */
export const instanceFrameNotFound: ParityState = {
  ...instancesState({
    handlers: {
      ...labelHandlers,
      'GET /instances/999': { status: 404, json: { message: 'Not found.' } },
    },
    probes: noDataProbes.slice(0, 1),
  }),
  id: 'instance-frame-not-found',
  path: '/instances/999/general',
  actions: {
    legacy: [waitFor(page => page.locator('.no-data--instances'))],
    next: [waitFor(page => page.getByTestId('instances-no-data'))],
  },
}

// S-10 instance-general, phase 13: the Source cards of a custom project on lite (git and uploaded files). They replace the Installation
// card (`General.vue:19-28`). The git card reads the live "behind" count from `GET /projects/41/git` (`data.commits_behind`).
const SOURCE_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'general.redeploy', 'general.manage_git']
const SOURCE_TITLE = trPattern('heading.instance.siteDetails.source.title', 'lite')

const sourceProbes: Probe[] = [
  {
    key: 'source-card',
    legacy: page => page.locator('.v-card', { hasText: SOURCE_TITLE }),
    next: page => page.locator('.v-card', { hasText: SOURCE_TITLE }),
  },
  {
    key: 'source-title',
    legacy: page => page.locator('.v-card__title', { hasText: SOURCE_TITLE }),
    next: page => page.locator('.v-card-title', { hasText: SOURCE_TITLE }),
  },
  {
    key: 'source-body',
    legacy: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card__text'),
    next: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card-text'),
  },
  {
    key: 'source-action',
    legacy: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card__actions .v-btn'),
    next: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card-actions .v-btn'),
  },
]

/** The Database column of the Git card (second column of the card body): the skeleton while `/source` is loading. */
const sourceDatabaseColumn: Probe = {
  key: 'source-database-column',
  legacy: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card__text .row > div').nth(1),
  next: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card-text .v-row > div').nth(1),
}

const sourceStatusLine: Probe = {
  key: 'source-status-line',
  legacy: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.git-meta').first(),
  next: page => page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.git-meta').first(),
}

const sourceWait: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [...waitForInstanceTitle.legacy, waitFor(page => page.locator('.v-card', { hasText: SOURCE_TITLE }))],
  next: [...waitForInstanceTitle.next, waitFor(page => page.locator('.v-card', { hasText: SOURCE_TITLE }))],
}

/** `source` answers `GET /projects/41/source` (default `SOURCE_API`; `'hold'`, `{ status: 500 }` or an own object for the other states). */
function sourceState (id: string, overrides: Record<string, unknown>, extra: Record<string, Handler>, probes: Probe[], source: Handler = SOURCE_OK): ParityState {
  return {
    id,
    target: 'lite',
    path: '/projects/41/general',
    signedIn: true,
    clock: NOW,
    home: liteShellHome(),
    handlers: {
      ...shellHandlers([], 'projects'),
      'GET /projects/41': {
        json: {
          data: instancePageRaw(41, { name: 'Studio Blog', url: 'https://studio.example.com', type: 'custom', app_type: 'custom', privileges: SOURCE_PRIVILEGES, ...overrides }),
        },
      },
      'GET /projects/41/source': source,
      'GET /projects/41/app-health': APP_HEALTH_OK,
      'GET /projects/41/wordpress/maintenance-mode': { json: { status: false } },
      'GET /projects/41/wordpress/debug-mode': { json: { status: false } },
      'GET /projects/41/wordpress/automatic-backup': { json: { data: { enabled: false } } },
      'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
      'GET /projects/41/reporting/visitors/last-week': {
        json: { data: { visits: { records: [], total: 0, previous_total: 0 }, visits_length: { records: [], total: 0, previous_total: 0 } } },
      },
      'GET /projects/41/reporting/bandwidth/last-week': { json: { data: { records: [], total: 0 } } },
      ...extra,
    },
    external: { 'dns.google': INSTANCE_PAGE_DNS },
    actions: sourceWait,
    probes,
  }
}

const GIT_SOURCE = { type: 'git', repo_name: 'acme/studio-blog', branch: 'develop', database: { present: true, label: 'MariaDB 11' } }
const GIT_CONNECTED = { connected: true, id: 3, repo_url: 'https://github.com/acme/studio-blog.git', branch: 'main', commits_behind: 0, last_deployed_commit_hash: 'a1b2c3d' }

/** Connected repository, 3 commits behind, database present: the Redeploy button and the red behind line. */
const instanceGeneralGitSource = sourceState(
  'instance-general-git-source',
  { source: GIT_SOURCE, git_repository: GIT_CONNECTED },
  { 'GET /projects/41/git': { json: { data: { commits_behind: 3 } } } },
  [...sourceProbes, sourceStatusLine],
)

/** Connected repository that is up to date, no database created. */
const instanceGeneralGitSourceUpToDate = sourceState(
  'instance-general-git-source-up-to-date',
  { source: { ...GIT_SOURCE, database: { present: false } }, git_repository: GIT_CONNECTED },
  { 'GET /projects/41/git': { json: { data: { commits_behind: 0 } } } },
  [...sourceProbes, sourceStatusLine],
)

/** The live status request is held: the card shows the skeleton line. */
const instanceGeneralGitSourceLoading = sourceState(
  'instance-general-git-source-loading',
  { source: GIT_SOURCE, git_repository: GIT_CONNECTED },
  { 'GET /projects/41/git': 'hold' },
  [...sourceProbes, sourceStatusLine],
)

/** No connected repository: the Manage Git button. */
const instanceGeneralGitSourceDisconnected = sourceState(
  'instance-general-git-source-disconnected',
  { source: GIT_SOURCE, git_repository: null },
  {},
  sourceProbes,
)

// S-71 phase 16: the redeploy modal of the Git card. Lite opens the dialog only after the branches, the commits and the working
// tree status have loaded (`GitRedeployModal.vue:506-511`), so a held request keeps the dialog closed: no loading state (N/A).
const REDEPLOY_BRANCHES = { json: { data: ['main', 'develop'] } }
const REDEPLOY_COMMITS = {
  json: {
    data: {
      commits: [
        { hash: 'f3a9c1d4e5b6a7980123456789abcdef01234567', message: 'Update footer links' },
        { hash: '9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c', message: 'Fix contact form validation' },
        { hash: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', message: 'Add pricing section' },
      ],
      from: 1,
      to: 3,
      total: 3,
    },
  },
}

const redeployModalReady = {
  legacy: [waitFor(page => page.locator('.v-dialog--active .basic-modal'))],
  next: [waitFor(page => page.getByTestId('git-redeploy-modal'))],
}

const redeployOpen: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [
    ...sourceWait.legacy,
    async page => {
      await page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card__actions .v-btn').click()
    },
    ...redeployModalReady.legacy,
  ],
  next: [
    ...sourceWait.next,
    async page => {
      await page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card-actions .v-btn').click()
    },
    ...redeployModalReady.next,
  ],
}

const redeployProbes: Probe[] = [
  {
    key: 'redeploy-modal',
    legacy: page => page.locator('.v-dialog--active .basic-modal'),
    next: page => page.getByTestId('git-redeploy-modal'),
  },
  {
    key: 'redeploy-title',
    legacy: page => page.locator('.v-dialog--active .v-card__title h6'),
    next: page => page.getByTestId('git-redeploy-modal').locator('.v-card-title h6'),
  },
  {
    key: 'redeploy-branch',
    legacy: page => page.locator('.v-dialog--active .v-select'),
    next: page => page.getByTestId('git-redeploy-branch'),
  },
  {
    key: 'redeploy-commits',
    legacy: page => page.locator('.v-dialog--active .commit-list'),
    next: page => page.getByTestId('git-redeploy-modal').locator('.commit-list'),
  },
  {
    key: 'redeploy-cancel',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
    next: page => page.getByTestId('git-redeploy-cancel'),
  },
  {
    key: 'redeploy-submit',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').last(),
    next: page => page.getByTestId('git-redeploy-submit'),
  },
]

function redeployState (id: string, extra: Record<string, Handler>, actions: { legacy: StateAction[], next: StateAction[] }, probes: Probe[]): ParityState {
  return {
    ...sourceState(
      id,
      { source: GIT_SOURCE, git_repository: GIT_CONNECTED },
      {
        'GET /projects/41/git': { json: { data: { commits_behind: 3 } } },
        'GET /projects/41/git/branches': REDEPLOY_BRANCHES,
        'GET /projects/41/git/commits': REDEPLOY_COMMITS,
        ...extra,
      },
      probes,
    ),
    actions,
  }
}

/** Redeploy modal from the Git card: the repository, the branch select, the commit list, the build checkbox, Cancel and Redeploy. */
const instanceGeneralRedeployDefault = redeployState('instance-general-redeploy-default', {}, redeployOpen, redeployProbes)

/** The commit list request fails: the dialog opens with the red fetch error row in the list. */
const instanceGeneralRedeployError = redeployState(
  'instance-general-redeploy-error',
  { 'GET /projects/41/git/commits': { status: 500, json: { message: 'Server error.' } } },
  redeployOpen,
  redeployProbes,
)

/** Redeploy is refused (422): the dialog stays on the form and the alert manager shows the message. */
const instanceGeneralRedeployRefused = redeployState(
  'instance-general-redeploy-refused',
  { 'POST /projects/41/redeploy': { status: 422, json: { message: 'The branch is not available.' } } },
  {
    legacy: [
      ...redeployOpen.legacy,
      async page => {
        await page.locator('.v-dialog--active .v-card__actions .v-btn').last().click()
      },
      waitFor(page => page.locator('.alert-manager', { hasText: 'The branch is not available.' })),
      // The legacy alert container grows from 16px while the toast enters; measure it once it has its full width.
      async page => {
        await expect.poll(async () => (await page.locator('.alert-manager').boundingBox())?.width ?? 0).toBeGreaterThan(300)
      },
      // Legacy dismisses the toast after 5 s (AlertMixin.js alertTimeout) and `mouseover` stops that timer: pin it so a slow run still measures a visible toast.
      async page => {
        await page.locator('.alert-manager').getByText('The branch is not available.').hover()
      },
      // Clicking the submit button may scroll the dialog by a timing-dependent 34 px on mobile (modal y 14 vs 48): bring both sides back to the opened position.
      async page => {
        await page.locator('.v-dialog--active .basic-modal').evaluate(el => {
          for (let node = el.parentElement; node; node = node.parentElement) {
            node.scrollTop = 0
          }
        })
      },
    ],
    next: [
      ...redeployOpen.next,
      async page => {
        await page.getByTestId('git-redeploy-submit').click()
      },
      waitFor(page => page.getByTestId('shell-alert-manager').filter({ hasText: 'The branch is not available.' })),
      // Same 5 s auto-dismiss as legacy (alert-timeout.ts); `mouseover` pins the toast on a slow run.
      async page => {
        await page.getByTestId('shell-alert-manager').getByText('The branch is not available.').hover()
      },
      async page => {
        await page.getByTestId('git-redeploy-modal').evaluate(el => {
          for (let node = el.parentElement; node; node = node.parentElement) {
            node.scrollTop = 0
          }
        })
      },
    ],
  },
  [...redeployProbes, alertManagerProbe],
)

/** `/source` with all three deploy categories: dependencies and build skippable, migrations required (it has no checkbox). */
const SOURCE_STEPS: Handler = {
  json: {
    data: {
      ...SOURCE_API,
      deploy_steps: {
        dependencies: { commands: ['npm install'], skippable: true },
        build: { commands: ['npm run build'], skippable: true },
        migrations: { commands: ['npm run migrate'], skippable: false },
      },
    },
  },
}

const redeployStepsProbes: Probe[] = [
  {
    key: 'redeploy-steps',
    legacy: page => page.locator('.v-dialog--active .deploy-steps'),
    next: page => page.getByTestId('git-redeploy-modal').locator('.deploy-steps'),
  },
  {
    key: 'redeploy-step-dependencies',
    legacy: page => page.locator('.v-dialog--active [data-step="dependencies"]'),
    next: page => page.getByTestId('git-redeploy-modal').locator('[data-step="dependencies"]'),
  },
  {
    key: 'redeploy-step-checkbox',
    legacy: page => page.locator('.v-dialog--active [data-step="dependencies"] .v-input'),
    next: page => page.getByTestId('git-redeploy-modal').locator('[data-step="dependencies"] .v-input'),
  },
  {
    key: 'redeploy-step-box',
    legacy: page => page.locator('.v-dialog--active [data-step="dependencies"] .v-input--selection-controls__input'),
    next: page => page.getByTestId('git-redeploy-modal').locator('[data-step="dependencies"] .v-selection-control__input'),
  },
  {
    key: 'redeploy-step-migrations',
    legacy: page => page.locator('.v-dialog--active [data-step="migrations"]'),
    next: page => page.getByTestId('git-redeploy-modal').locator('[data-step="migrations"]'),
  },
]

/** Redeploy modal with the deploy steps (kit `DeploySteps`): the build category is unchecked, so the payload skips it. */
const instanceSourceRedeploySteps: ParityState = (() => {
  const base = redeployState(
    'instance-source-redeploy-steps',
    {},
    {
      legacy: [
        ...redeployOpen.legacy,
        async page => {
          await page.locator('.v-dialog--active [data-step="build"] label').evaluate(element => (element as HTMLElement).click())
        },
      ],
      next: [
        ...redeployOpen.next,
        async page => {
          await page.getByTestId('git-redeploy-modal').locator('[data-step="build"] label').evaluate(element => (element as HTMLElement).click())
        },
      ],
    },
    [...redeployProbes, ...redeployStepsProbes],
  )
  return { ...base, handlers: { ...base.handlers, 'GET /projects/41/source': SOURCE_STEPS } }
})()

/** Redeploy modal while `/source` answers `available: false`: no deploy steps, so the steps section is gone and Redeploy sends no `skip`. */
const instanceSourceStepsEmpty = redeployState(
  'instance-source-steps-empty',
  { 'GET /projects/41/source': { json: { data: { available: false } } } },
  redeployOpen,
  [...redeployProbes, redeployStepsProbes[0]],
)

/** Uploaded files, deployed: stack and archive size, deploy time, the Deployed line, the Upload new version button. */
const instanceGeneralFilesSource = sourceState(
  'instance-general-files-source',
  {
    source: { type: 'files', database: { present: true, label: 'MariaDB 11' }, last_deploy: { status: 'finished', finished_at: '2026-10-20T10:15:00Z' } },
    details: { detected_stack: { label: 'Node.js' }, archive_size: 5_242_880 },
  },
  {},
  sourceProbes,
)

/** Uploaded files, nothing deployed yet and no database. */
const instanceGeneralFilesSourceEmpty = sourceState(
  'instance-general-files-source-empty',
  { source: { type: 'files', database: { present: false }, last_deploy: null }, details: {} },
  {},
  sourceProbes,
)

/** `/source` answers the deploy as failed: the Files card shows the red deploy-failed line (`source.deployFailed`). */
const SOURCE_FILES_FAILED: Handler = {
  json: { data: { ...SOURCE_API, last_deploy: { status: 'failed', commit: null, finished_at: '2026-10-20T10:15:00Z' } } },
}

/** `/source` answers a deploy in progress: the Files card shows the running line (`source.deploying`), no deploy time. */
const SOURCE_FILES_RUNNING: Handler = {
  json: { data: { ...SOURCE_API, last_deploy: { status: 'running', commit: null, finished_at: null } } },
}

const FILES_SOURCE_DEPLOYED = {
  source: { type: 'files', database: { present: true, label: 'MariaDB 11' }, last_deploy: { status: 'finished', finished_at: '2026-10-20T10:15:00Z' } },
  details: { detected_stack: { label: 'Node.js' }, archive_size: 5_242_880 },
}

/** Uploaded files, the last deploy failed: the red deploy-failed line under the stack and the deploy time. */
const instanceSourceFilesFailed = sourceState(
  'instance-source-files-failed',
  { ...FILES_SOURCE_DEPLOYED, source: { ...FILES_SOURCE_DEPLOYED.source, last_deploy: { status: 'failed', finished_at: '2026-10-20T10:15:00Z' } } },
  {},
  sourceProbes,
  SOURCE_FILES_FAILED,
)

/** Uploaded files, a deploy is running: the running line instead of the Deployed line. */
const instanceSourceFilesRunning = sourceState(
  'instance-source-files-running',
  { ...FILES_SOURCE_DEPLOYED, source: { ...FILES_SOURCE_DEPLOYED.source, last_deploy: { status: 'running', finished_at: null } } },
  {},
  sourceProbes,
  SOURCE_FILES_RUNNING,
)

/** `/source` answers `available: false` (the Engine is unreachable): the Git card shows the branch and the database of the project payload. */
const instanceSourceFallback = sourceState(
  'instance-source-fallback',
  { source: GIT_SOURCE, git_repository: GIT_CONNECTED },
  { 'GET /projects/41/git': { json: { data: { commits_behind: 0 } } } },
  [...sourceProbes, sourceStatusLine],
  { json: { data: { available: false } } },
)

/** `/source` is still in flight (first load): the Database column shows the skeleton, the branch and the status line come from the payload and `/git`. */
const instanceSourceLoading = sourceState(
  'instance-source-loading',
  { source: GIT_SOURCE, git_repository: GIT_CONNECTED },
  { 'GET /projects/41/git': { json: { data: { commits_behind: 0 } } } },
  [...sourceProbes, sourceStatusLine, sourceDatabaseColumn],
  'hold',
)

const UPLOAD_ARCHIVE = { name: 'site.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') }

const UPLOAD_FILES_SOURCE = {
  source: { type: 'files', database: { present: true, label: 'MariaDB 11' }, last_deploy: { status: 'finished', finished_at: '2026-10-20T10:15:00Z' } },
  details: { detected_stack: { label: 'Node.js' }, archive_size: 5_242_880 },
}

const uploadOpen: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [
    ...sourceWait.legacy,
    async page => {
      await page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card__actions .v-btn').click()
    },
    waitFor(page => page.locator('.v-dialog--active .basic-modal .drop-zone')),
  ],
  next: [
    ...sourceWait.next,
    async page => {
      await page.locator('.v-card', { hasText: SOURCE_TITLE }).locator('.v-card-actions .v-btn').click()
    },
    waitFor(page => page.getByTestId('files-upload-dropzone')),
  ],
}

const uploadSubmit: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [
    ...uploadOpen.legacy,
    async page => {
      await page.locator('.v-dialog--active .basic-modal input[type=file]').setInputFiles(UPLOAD_ARCHIVE)
      await page.locator('.v-dialog--active .v-card__actions .v-btn').last().click()
    },
  ],
  next: [
    ...uploadOpen.next,
    async page => {
      await page.getByTestId('files-upload-input').setInputFiles(UPLOAD_ARCHIVE)
      await page.getByTestId('files-upload-submit').click()
    },
  ],
}

const uploadProbes: Probe[] = [
  {
    key: 'upload-modal',
    legacy: page => page.locator('.v-dialog--active .basic-modal'),
    next: page => page.getByTestId('files-upload-modal'),
  },
  {
    key: 'upload-title',
    legacy: page => page.locator('.v-dialog--active .v-card__title h5'),
    next: page => page.getByTestId('files-upload-modal').locator('.v-card-title h5'),
  },
  {
    key: 'upload-dropzone',
    legacy: page => page.locator('.v-dialog--active .drop-zone'),
    next: page => page.getByTestId('files-upload-dropzone'),
  },
  {
    key: 'upload-cancel',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
    next: page => page.getByTestId('files-upload-cancel'),
  },
  {
    key: 'upload-submit',
    legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').last(),
    next: page => page.getByTestId('files-upload-submit'),
  },
]

function uploadState (id: string, extra: Record<string, Handler>, actions: { legacy: StateAction[], next: StateAction[] }, probes: Probe[]): ParityState {
  return { ...sourceState(id, UPLOAD_FILES_SOURCE, extra, probes), actions }
}

/** Upload new version modal from the Files card: current version line, empty drop zone, overwrite/replace options, Cancel and Upload and deploy (disabled). */
const instanceGeneralUploadDefault = uploadState('instance-general-upload-default', {}, uploadOpen, uploadProbes)

/** The upload is refused (422): the dialog stays on the form with the chosen file and the alert manager shows the message. */
const instanceGeneralUploadError = uploadState(
  'instance-general-upload-error',
  { 'POST /projects/41/deploy/upload': { status: 422, json: { message: 'The archive is not valid.' } } },
  {
    legacy: [
      ...uploadSubmit.legacy,
      waitFor(page => page.locator('.alert-manager', { hasText: 'The archive is not valid.' })),
      // The legacy alert container grows from 16px while the toast enters; measure it once it has its full width (as the redeploy refusal does).
      async page => {
        await expect.poll(async () => (await page.locator('.alert-manager').boundingBox())?.width ?? 0).toBeGreaterThan(300)
      },
      // Legacy dismisses the toast after 5 s (AlertMixin.js alertTimeout) and `mouseover` stops that timer: pin it so a slow run still measures a visible toast.
      async page => {
        await page.locator('.alert-manager').getByText('The archive is not valid.').hover()
      },
    ],
    next: [
      ...uploadSubmit.next,
      waitFor(page => page.getByTestId('shell-alert-manager').filter({ hasText: 'The archive is not valid.' })),
      // Same 5 s auto-dismiss as legacy (alert-timeout.ts); `mouseover` pins the toast on a slow run.
      async page => {
        await page.getByTestId('shell-alert-manager').getByText('The archive is not valid.').hover()
      },
    ],
  },
  [...uploadProbes, alertManagerProbe],
)

/** The upload request stays pending: progress bar at 0 %, the submit button in its loading state. */
const instanceGeneralUploadLoading = uploadState(
  'instance-general-upload-loading',
  { 'POST /projects/41/deploy/upload': 'hold' },
  {
    legacy: [...uploadSubmit.legacy, waitFor(page => page.locator('.v-dialog--active .v-progress-linear'))],
    next: [...uploadSubmit.next, waitFor(page => page.getByTestId('files-upload-progress'))],
  },
  [
    ...uploadProbes,
    {
      key: 'upload-progress',
      legacy: page => page.locator('.v-dialog--active .v-progress-linear'),
      next: page => page.getByTestId('files-upload-progress'),
    },
  ],
)

const uploadStepsProbes: Probe[] = [
  {
    key: 'upload-steps',
    legacy: page => page.locator('.v-dialog--active .deploy-steps'),
    next: page => page.getByTestId('files-upload-modal').locator('.deploy-steps'),
  },
  {
    key: 'upload-step-dependencies',
    legacy: page => page.locator('.v-dialog--active [data-step="dependencies"]'),
    next: page => page.getByTestId('files-upload-modal').locator('[data-step="dependencies"]'),
  },
  {
    key: 'upload-step-checkbox',
    legacy: page => page.locator('.v-dialog--active [data-step="dependencies"] .v-input'),
    next: page => page.getByTestId('files-upload-modal').locator('[data-step="dependencies"] .v-input'),
  },
  {
    key: 'upload-step-migrations',
    legacy: page => page.locator('.v-dialog--active [data-step="migrations"]'),
    next: page => page.getByTestId('files-upload-modal').locator('[data-step="migrations"]'),
  },
]

/** Upload modal with the deploy steps of the project (kit `DeploySteps`, note `basedOnCurrent`): the build category is unchecked, so the payload skips it. */
const instanceSourceUploadSteps: ParityState = (() => {
  const base = uploadState(
    'instance-source-upload-steps',
    {},
    {
      legacy: [
        ...uploadOpen.legacy,
        waitFor(page => page.locator('.v-dialog--active [data-step="build"]')),
        async page => {
          await page.locator('.v-dialog--active [data-step="build"] label').evaluate(element => (element as HTMLElement).click())
        },
      ],
      next: [
        ...uploadOpen.next,
        waitFor(page => page.getByTestId('files-upload-modal').locator('[data-step="build"]')),
        async page => {
          await page.getByTestId('files-upload-modal').locator('[data-step="build"] label').evaluate(element => (element as HTMLElement).click())
        },
      ],
    },
    [...uploadProbes, ...uploadStepsProbes],
  )
  return { ...base, handlers: { ...base.handlers, 'GET /projects/41/source': SOURCE_STEPS } }
})()

// Phase 20 (hover): the pointer rests on the copy button of the URL row (its "Click to copy" tooltip opens after a 150 ms delay) and
// on a top-bar action. The overlay of the hovered button is probed (V2 paints it as `::before`, V4 as `.v-btn__overlay`).

const copyButton = (page: Page) => page.locator('.instance-domain-group .copyButton')

const copyHover: StateAction = async page => {
  await copyButton(page).hover()
}

const copyStillHovered: StateAction = async page => {
  const hovered = await copyButton(page).evaluate(element => element.matches(':hover'))
  if (!hovered) {
    throw new Error('pointer is not on the copy button')
  }
}

// Deployed legacy ships `.v-tooltip{display:none}`, so its tooltip is in the DOM (active class) but never painted; the wait is on
// the DOM there and on visibility in next (same as `login-recovery-copy-hover`). The tooltip is therefore not probed.
const copyTooltipOpen: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(page.locator('.menu-tooltip').filter({ hasText: /\S/ }).first()).toHaveClass(/menuable__content__active/)
  },
  next: async page => {
    await expect(page.locator('.menu-tooltip').filter({ hasText: /\S/ }).first()).toBeVisible()
  },
}

export const instanceFrameCopyHover: ParityState = {
  ...instanceFrameDefault,
  id: 'instance-frame-copy-hover',
  pointer: 'keep',
  actions: {
    legacy: [...instanceFrameDefault.actions.legacy, copyHover, copyTooltipOpen.legacy],
    next: [...instanceFrameDefault.actions.next, copyHover, copyTooltipOpen.next],
  },
  probes: [
    ...topBarProbes,
    {
      key: 'copy-button-overlay',
      legacy: page => page.locator('.instance-domain-group .copyButton'),
      next: page => page.locator('.instance-domain-group .copyButton .v-btn__overlay'),
      pseudo: { legacy: '::before' },
      internal: true,
    },
  ],
  afterCapture: {
    legacy: [copyStillHovered],
    next: [copyStillHovered],
  },
}

const shareHover: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-btn--vertical', { hasText: trPattern('button.share', 'lite') }).first().hover()
  },
  next: async page => {
    await page.getByTestId('top-bar-share').hover()
  },
}

// The vertical action button hides its hover overlay in both apps (`_buttons.scss` `::before{display:none}`, `BaseIconButton.vue`), so
// there is no overlay to probe; the hover is measured through the label colour (`top-bar-share`, `info--text` -> `--v-link-hover`).
export const instanceFrameActionHover: ParityState = {
  ...instanceFrameDefault,
  id: 'instance-frame-action-hover',
  pointer: 'keep',
  actions: {
    legacy: [...instanceFrameDefault.actions.legacy, shareHover.legacy],
    next: [...instanceFrameDefault.actions.next, shareHover.next],
  },
  probes: [
    ...topBarProbes,
  ],
}

// Phase 21 (focus-visible): the first top-bar tab is reached with the keyboard (Tab from the top of the page, so the focus counts as
// keyboard focus: `:focus-visible` in V4, `:focus` in V2). The overlay of the focused tab is probed (V2 `::before`, V4 `.v-btn__overlay`).

// Legacy keeps `.top-bar__item` on the header menu too, so the tab is found by its label (legacy) and by its test id (next).
const instanceTab = {
  legacy: (page: Page) => page.locator('.top-bar__item', { hasText: trPattern('heading.instance.tab.siteDetails', 'lite') }).first(),
  next: (page: Page) => page.getByTestId('instance-tab-general'),
}

function tabFocus (side: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    for (let press = 0; press < 60; press += 1) {
      await page.keyboard.press('Tab')
      if (await instanceTab[side](page).evaluate(element => element.matches(':focus'))) {
        return
      }
    }
    throw new Error('Tab did not reach the Project Details tab')
  }
}

function tabStillFocused (side: 'legacy' | 'next'): StateAction {
  return async page => {
    const focused = await instanceTab[side](page).evaluate(element => element.matches(':focus-visible'))
    if (!focused) {
      throw new Error('the Project Details tab does not have keyboard focus')
    }
  }
}

export const instanceFrameTabFocus: ParityState = {
  ...instanceFrameDefault,
  id: 'instance-frame-tab-focus',
  pointer: 'keep',
  actions: {
    legacy: [...instanceFrameDefault.actions.legacy, tabFocus('legacy')],
    next: [...instanceFrameDefault.actions.next, tabFocus('next')],
  },
  probes: [
    ...topBarProbes,
    {
      key: 'tab-focus-overlay',
      legacy: page => instanceTab.legacy(page),
      next: page => instanceTab.next(page).locator('.v-btn__overlay'),
      pseudo: { legacy: '::before' },
      internal: true,
    },
  ],
  afterCapture: {
    legacy: [tabStillFocused('legacy')],
    next: [tabStillFocused('next')],
  },
}

/**
 * A long project URL: the link in the top bar truncates with an ellipsis inside `.instance-domain-group` (lite `TopBarTitle.vue:264-285`,
 * `min-width: min(100%, 160px)`, `max-width: min(100%, 240px)`), so the DNS badge and the actions stay on the row.
 */
export const instanceFrameUrlRow: ParityState = {
  ...instanceFrameDefault,
  id: 'instance-frame-url-row',
  handlers: instancePageHandlers({
    'GET /instances/1': {
      json: { data: instancePageRaw(1, { url: 'https://a-very-long-project-name-for-the-top-bar.studio-example-domain.com' }) },
    },
  }),
  probes: [instanceTitleProbe, instanceUrlProbe, instanceChangeDomainProbe, topBarActionProbe('share', 'button.share', 'top-bar-share')],
}

// Phase 14 (hover / focus-visible / disabled): the Redeploy button of the Git card, measured on the lite target with the pointer on it
// (`buttonHoverState`) and with keyboard focus (`buttonFocusState`); the first deploy step of the open Redeploy modal gets keyboard focus.

const gitCardRedeployBase: ParityState = sourceState(
  'instance-source-redeploy-hover',
  { source: GIT_SOURCE, git_repository: GIT_CONNECTED },
  { 'GET /projects/41/git': { json: { data: { commits_behind: 3 } } } },
  sourceProbes,
)

const instanceSourceRedeployHover: ParityState = buttonHoverState(gitCardRedeployBase, 'instance-source-redeploy-hover', 'button.redeploy', 'lite')

const instanceSourceRedeployFocus: ParityState = buttonFocusState(gitCardRedeployBase, 'instance-source-redeploy-focus', 'button.redeploy', 'lite')

/** The checkbox of the first skippable step (`dependencies`) in the open Redeploy modal. */
function stepFirstBox (side: 'legacy' | 'next'): (page: Page) => Locator {
  return side === 'legacy'
    ? page => page.locator('.v-dialog--active [data-step="dependencies"] input[type="checkbox"]')
    : page => page.getByTestId('git-redeploy-modal').locator('[data-step="dependencies"] input[type="checkbox"]')
}

/** Tab from the open modal until the first skippable step (`dependencies`) has focus; the keyboard focus is asserted after the capture. */
function stepFocus (side: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    for (let press = 0; press < 60; press += 1) {
      await page.keyboard.press('Tab')
      if (await stepFirstBox(side)(page).evaluate(element => element.matches(':focus'))) {
        return
      }
    }
    throw new Error('Tab did not reach the first deploy step')
  }
}

function stepStillFocused (side: 'legacy' | 'next'): StateAction {
  return async page => {
    const focused = await stepFirstBox(side)(page).evaluate(element => element.matches(':focus-visible'))
    if (!focused) {
      const active = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`)
      throw new Error(`the first deploy step (${side}) does not have keyboard focus; active=${active}`)
    }
  }
}

const instanceSourceStepsFocus: ParityState = (() => {
  const base = redeployState(
    'instance-source-steps-focus',
    { 'GET /projects/41/source': SOURCE_STEPS },
    redeployOpen,
    [
      ...redeployProbes,
      ...redeployStepsProbes,
      {
        key: 'steps-focus-box',
        legacy: page => page.locator('.v-dialog--active [data-step="dependencies"] .v-input--selection-controls__input'),
        next: page => page.getByTestId('git-redeploy-modal').locator('[data-step="dependencies"] .v-selection-control__input'),
        internal: true,
      },
    ],
  )
  return {
    ...base,
    // Focus states keep the focus: the default reset blurs the active element before the capture (`buttonFocusState` does the same).
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, stepFocus('legacy')],
      next: [...base.actions.next, stepFocus('next')],
    },
    afterCapture: {
      legacy: [stepStillFocused('legacy')],
      next: [stepStillFocused('next')],
    },
  }
})()

const states: ParityState[] = [
  instanceGeneralGitSource,
  instanceGeneralGitSourceUpToDate,
  instanceGeneralGitSourceLoading,
  instanceGeneralGitSourceDisconnected,
  instanceGeneralFilesSource,
  instanceGeneralFilesSourceEmpty,
  instanceSourceFilesFailed,
  instanceSourceFilesRunning,
  instanceSourceFallback,
  instanceSourceLoading,
  instanceGeneralRedeployDefault,
  instanceGeneralRedeployError,
  instanceGeneralRedeployRefused,
  instanceSourceRedeploySteps,
  instanceSourceStepsEmpty,
  instanceGeneralUploadDefault,
  instanceGeneralUploadError,
  instanceGeneralUploadLoading,
  instanceSourceUploadSteps,
  instanceFrameSuspended,
  instanceFrameNotFound,
  instanceGeneralWooUpdateAvailable,
  instanceGeneralAnalyticsLoading,
  instanceGeneralSslPending,
  instanceGeneralAnalyticsEmpty,
  instanceGeneralAnalyticsMonth,
  instanceGeneralNoReportProvider,
  instanceGeneralNoPrivileges,
  instanceFrameDefault,
  instanceGeneralDefault,
  instanceFrameLoading,
  instanceFrameTabsAlerts,
  instanceFrameLiteCustom,
  instanceSourceWarnings,
  instanceFrameTitleMenu,
  instanceFrameTitleEdit,
  instanceFrameModalDelete,
  instanceFrameModalUpdate,
  instanceFrameModalStaging,
  instanceFrameShared,
  instanceFrameLite,
  instanceFrameAdminArea,
  instanceFrameOpenProject,
  instanceFrameStaging,
  instanceFrameStagingPage,
  instanceFrameStagingProgress,
  instanceFrameStagingError,
  instanceFrameModalPushToLive,
  instanceFrameLitePush,
  instanceFrameCopyHover,
  instanceFrameActionHover,
  instanceFrameTabFocus,
  instanceFrameUrlRow,
  instanceSourceRedeployHover,
  instanceSourceRedeployFocus,
  instanceSourceStepsFocus,
]

/**
 * M-2: app-lite is the source of truth, so the app states of the frame are measured on the lite target. The state keeps its own
 * definition (app paths); here its route and its `/instances` fixtures move to `/projects` (single server rewrites the resource
 * segment, `utils/resourcePaths.js`) and the `/home` gets the single-server flags of `liteShellHome()`.
 */
function onLite (state: ParityState): ParityState {
  if (state.target === 'lite') {
    // The lite `/home` carries `admin` (the closed Style Manager drawer, shell S-127); see the note below.
    const { admin: _admin, ...ownHome } = (state.home ?? {}) as Record<string, unknown>
    return { ...state, home: ownHome }
  }
  const lite = liteShellHome() as Record<string, Record<string, unknown>>
  const base = (state.home ?? {}) as Record<string, Record<string, unknown>>
  const home: Record<string, unknown> = { ...base }
  for (const key of ['app', 'user', 'admin']) {
    home[key] = { ...base[key], ...lite[key] }
  }
  const handlers: Record<string, Handler> = {}
  for (const [key, handler] of Object.entries(state.handlers ?? {})) {
    handlers[key.replace(/^(\S+) \/instances(?=[/?]|$)/, '$1 /projects')] = handler
    // Some lite calls stay on `/instances/{id}/…` (e.g. `CreateStagingModal.vue:289`); both spellings answer.
    handlers[key] ??= handler
  }
  const id = /\/instances\/(\d+)\//.exec(state.path)?.[1] ?? '1'
  handlers[`GET /projects/${id}/app-health`] ??= APP_HEALTH_OK
  // The lite `/home` carries `admin`, which gives the closed Style Manager drawer (shell, S-127): legacy paints its content in the scroll
  // overflow of a narrow full-page capture, next hides it. The drawer is not this view, so these states drop the admin role.
  // The suspended redirect lands on the project list, whose legacy page needs the admin block (blank page without it).
  if (state.id !== 'instance-frame-suspended') {
    delete home.admin
  }
  return {
    ...state,
    target: 'lite',
    path: state.path.replace('/instances/', '/projects/'),
    home,
    handlers: { ...shellHandlers([], 'projects'), ...handlers },
  }
}

for (const state of states.map(item => onLite(item))) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
