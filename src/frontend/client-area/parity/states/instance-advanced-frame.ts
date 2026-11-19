import type { Handler, Probe } from './state'
import type { Locator, Page } from '@playwright/test'
import { tr } from './auth'
import { allHostingPrivileges } from './hosting'
import { INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from './instance'
import { screenshotHandlers } from './instances'
import { liteAppUsers, liteAppUsersHandler } from './instances-lite'
import { liteUpdatesHandler } from './project-actions'
import { inDays, isDesktop, isMobile, NOW, shellHandlers, shellHome } from './shell'

// S-89 ui-instance-advanced-frame: the Advanced frame (sidebar, tabs below `lgAndDown`) and the Details page of a project, measured on
// app-lite (`/projects/:id/advanced/details`, `target: 'lite'`). Not a spec file (testMatch is `*.parity.ts`). States and their registration:
// `instance-advanced-frame.parity.ts`. Plan: context/changes/ui-instance-advanced-frame/plan.md ("Phase 6").

/** The project of the states (the plan's id, as `instance-monitoring` uses its own). */
export const ADVANCED_PROJECT_ID = 41

/** The privileges of the Details page: the instance page set, the installation details (WordPress only) and the hosting sections of the sidebar. */
export const ADVANCED_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'wordpress.view_installation_details', 'general.manage_limits', ...allHostingPrivileges]

/** The screenshot time of the project: a UNIX timestamp two hours before `NOW`, so the screenshot handler is registered. */
const SCREENSHOT_TIME = Math.floor(Date.parse(NOW) / 1000) - 7200

const MB = 1024 * 1024

/**
 * project-usage: the `resources` block of the project, so the Project usage cards and the Limits row render (legacy has neither, so they
 * are accepted pixel deltas). The sample is a minute old at run time, so the caption reads the same in every run; legacy ignores the key.
 */
export function advancedResources (): Record<string, unknown> {
  const sampledAt = new Date(Date.now() - 60_000).toISOString()
  return {
    usage: { cpu_percent: 35, memory_bytes: 768 * MB, memory_limit_bytes: 2048 * MB, sampled_at: sampledAt },
    disk: { total_bytes: 4 * 1024 * MB, limit_bytes: 10 * 1024 * MB, measured_at: sampledAt },
    limits: { memory_limit: 2048, cpu_limit: 1, disk_space_limit: 10_240, inodes_limit: 500_000, device_read_bps: -1, device_write_bps: -1 },
    ceilings: { memory_limit: null, cpu_limit: null, disk_space_limit: null, inodes_limit: null, device_read_bps: null, device_write_bps: null },
  }
}

/** The `GET /projects/41` body of the Details page for a privilege list: a WordPress project with a screenshot. `overrides` add fields. */
export function advancedInstance (privileges: string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return instancePageRaw(ADVANCED_PROJECT_ID, {
    type: 'wordpress',
    app_type: 'wordpress',
    privileges,
    screenshot_time: SCREENSHOT_TIME,
    resources: advancedResources(),
    ...overrides,
  })
}

/** The `GET /projects/41` body of the Details page: a WordPress project with a screenshot and the installation details privilege. */
export const advancedFrameInstance = advancedInstance(ADVANCED_PRIVILEGES)

/** The same project without `wordpress.update_site_name` (phase 9): the reversed check (`EditableHeader.vue`) opens the name editor. */
export const advancedFrameInstanceWithoutRename = advancedInstance(ADVANCED_PRIVILEGES.filter(privilege => privilege !== 'wordpress.update_site_name'))

/**
 * Phase 12: the minimal privileges. Without any of the sidebar's privilege gates the list keeps only Details and Security, and without
 * `wordpress.view_installation_details` the Installation card is absent (`hasViewInstallationDetailsPrivilege`).
 */
export const ADVANCED_MINIMAL_PRIVILEGES = ['general.update_site_name']

/** Phase 12: the project with the minimal privileges and no screenshot (`screenshot_time` null, so `screenshot_url` is empty on both apps). */
export const advancedFrameInstanceEmpty = instancePageRaw(ADVANCED_PROJECT_ID, {
  type: 'wordpress',
  app_type: 'wordpress',
  privileges: ADVANCED_MINIMAL_PRIVILEGES,
  screenshot_time: null,
})

/**
 * Phase 14 (`instance-advanced-frame-no-hosting`): the account without single-server. The sidebar drops the seven hosting sections
 * (`advancedSidebarItems`, `singleServer`), and the screenshot column hides (`speedCardsEnabled`: no `page_speed_enabled`, no single-server).
 */
export function liteNoHostingHome (): Record<string, unknown> {
  return shellHome({
    app: { beta_mode: false, single_server: { active: false, has_running_tasks: false, has_uncompleted_imports: false }, page_speed_enabled: false },
    user: { is_ss_default: true, has_hosting_access: true },
    admin: { app_url: 'https://admin.example.com' },
  })
}

/**
 * Phase 14: without single-server the API paths are `/instances/41/…` on both apps (`rewriteResourcePath`, `resource-paths.ts`), so the keys
 * of the Details handlers move to that segment. A `/projects/41/…` key left behind would answer as an unmatched request, and the frame
 * would then fall back to the list (`InstanceView.vue` `passFrame`).
 */
export function noSingleServerHandlers (handlers: Record<string, Handler>): Record<string, Handler> {
  return Object.fromEntries(Object.entries(handlers).map(([key, handler]) => [key.replaceAll(`/projects/${ADVANCED_PROJECT_ID}`, `/instances/${ADVANCED_PROJECT_ID}`), handler]))
}

/**
 * Phase 14 (`instance-advanced-frame-trial`): the plan is a trial that expires in ten days, with an upgrade link. The plan row takes the
 * trial colours (`details--expires` on next, `orange--text` on legacy) and the Upgrade button shows.
 */
export const advancedFrameInstanceTrial = advancedInstance(ADVANCED_PRIVILEGES, {
  service_is_trial: true,
  service_trial_expiry_at: inDays(10),
  plan_upgrade_link: 'https://upgrade.example.com/plan',
})

/** The `GET /projects/{id}/app-health` answer of a project that runs fine (as `instance-monitoring.ts`). */
const APP_HEALTH_OK: Handler = {
  json: { data: { available: true, healthy: true, serving: 'ok', ports: [{ port: 8000, status: 'ok', http_code: 200, detail: 'HTTP 200' }], checks: [] } },
}

/** Legacy `Details.vue:87-102` answer: `GET /instances/{id}/installation-details` → `{ data: { … } }` (`installation-details.ts`). */
export const ADVANCED_INSTALLATION_DETAILS: Handler = {
  json: {
    data: {
      directory: '/var/www/studio',
      database_name: 'studio_db',
      database_user: 'studio_user',
      database_password: 'studio-pass',
      database_host: 'localhost',
      redis_host: '127.0.0.1',
      redis_port: 6379,
      redis_password: null,
    },
  },
}

/** Phase 10: the installation details answer with a server error (legacy `Details.vue:93-97` shows the alert, the card keeps its empty rows). */
export const ADVANCED_INSTALLATION_DETAILS_ERROR: Handler = { status: 500, json: { message: 'Server Error' } }

/** Phase 11: the site-name save answers 422 with the validation errors (`Api.getErrorMessages` joins them as `name: …` in the alert, `InstanceModule.js:19-25`). */
export const ADVANCED_SITE_NAME_INVALID: Handler = { status: 422, json: { message: 'The given data was invalid.', errors: { name: ['The site name could not be saved.'] } } }

/**
 * Handlers of the Details page on lite: the shell, the project GET, its installation details, the screenshot (a binary answer keyed by the
 * screenshot time) and the project calls the frame makes. `overrides` replace any key, so a state changes one call without losing the rest.
 */
export function advancedFrameHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...shellHandlers([], 'projects'),
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: advancedFrameInstance } },
    // Both apps request this under the project path on app-lite (the API layer maps `/instances/` to `/projects/` on single-server).
    [`GET /projects/${ADVANCED_PROJECT_ID}/installation-details`]: ADVANCED_INSTALLATION_DETAILS,
    [`GET /projects/${ADVANCED_PROJECT_ID}/app-health`]: APP_HEALTH_OK,
    ...screenshotHandlers([advancedFrameInstance], 'projects'),
    // The frame's project calls, as in `monitoringHandlers` (`GET /projects/1/...`).
    [`GET /projects/${ADVANCED_PROJECT_ID}/source`]: { json: { data: null } },
    [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/maintenance-mode`]: { json: { status: false } },
    [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/debug-mode`]: { json: { status: false } },
    [`GET /projects/${ADVANCED_PROJECT_ID}/wordpress/automatic-backup`]: { json: { data: { enabled: false } } },
    'GET /server-accounts/1/ssl/certificate/detected': { json: { data: null } },
    ...liteAppUsersHandler(ADVANCED_PROJECT_ID, liteAppUsers),
    // The new app asks for the update versions on this page; the harness fails on a request without an answer.
    ...liteUpdatesHandler(ADVANCED_PROJECT_ID, []),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Probes. The page title is the readiness anchor (after the sidebar and the Details card). The desktop list is measured by its items
// and the active item (the pill); the mobile tabs by the selected tab. Legacy classes first, next by its own test ids where it has them.
// ---------------------------------------------------------------------------------------------

/** The page title (`h4`), the same class on both apps. */
export const advancedTitleProbe: Probe = {
  key: 'advanced-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

/** The sidebar column: `.sticky-sidebar` on legacy, `advanced-sidebar` test id on next. */
export const advancedSidebarProbe: Probe = {
  key: 'advanced-sidebar',
  legacy: page => page.locator('.sticky-sidebar').first(),
  next: page => page.getByTestId('advanced-sidebar'),
}

/** The first item of the desktop list (order of the list). */
export const advancedFirstItemProbe: Probe = {
  key: 'advanced-first-item',
  when: isDesktop,
  legacy: page => page.locator('.sticky-sidebar .v-list-item').first(),
  next: page => page.getByTestId('advanced-sidebar').locator('.v-list-item').first(),
}

/** The last item of the desktop list (order of the list, the hosting sections come last on single-server). */
export const advancedLastItemProbe: Probe = {
  key: 'advanced-last-item',
  when: isDesktop,
  legacy: page => page.locator('.sticky-sidebar .v-list-item').last(),
  next: page => page.getByTestId('advanced-sidebar').locator('.v-list-item').last(),
}

/** The active item of the desktop list: the Details item and its pill. */
export const advancedActiveItemProbe: Probe = {
  key: 'advanced-active-item',
  when: isDesktop,
  legacy: page => page.locator('.sticky-sidebar .v-list-item--active').first(),
  next: page => page.getByTestId('advanced-sidebar').locator('.v-list-item--active').first(),
}

/** The selected tab below `lgAndDown` (the Details tab), centred by `centerActiveTabOnMount`. */
export const advancedSelectedTabProbe: Probe = {
  key: 'advanced-selected-tab',
  when: isMobile,
  legacy: page => page.locator('.sticky-sidebar .v-tab--active').first(),
  next: page => page.getByTestId('advanced-sidebar').locator('.v-tab--selected').first(),
}

/** The Site details card (the card with the `details-box` of the site rows). */
export const advancedSiteCardProbe: Probe = {
  key: 'site-details-card',
  legacy: page => page.locator('.v-card', { has: page.locator('.details-box') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.details-box') }).first(),
}

/** The screenshot card: the second card of the row (its image is the project's screenshot). */
export const advancedScreenshotCardProbe: Probe = {
  key: 'screenshot-card',
  when: isDesktop,
  legacy: page => page.locator('.v-card', { has: page.locator('.v-image') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.v-img') }).first(),
}

/** The Installation details card: the card with the second `details-box` (its redis and database rows). */
export const advancedInstallationCardProbe: Probe = {
  key: 'installation-details-card',
  legacy: page => page.locator('.v-card', { has: page.locator('.details-box') }).nth(1),
  next: page => page.locator('.v-card', { has: page.locator('.details-box') }).nth(1),
}

/** The probes of the default state, the readiness anchor first (the title is the first probe). */
export const advancedFrameProbes: Probe[] = [
  advancedTitleProbe,
  advancedSidebarProbe,
  advancedFirstItemProbe,
  advancedLastItemProbe,
  advancedActiveItemProbe,
  advancedSelectedTabProbe,
  advancedSiteCardProbe,
  advancedScreenshotCardProbe,
  advancedInstallationCardProbe,
]

// ---------------------------------------------------------------------------------------------
// Hover (Phase 7). The Security item of the desktop list (`advanced-sidebar-security`) moves 12 px right and its title turns primary
// (next `AdvancedPagesSidebar.scss` `&:hover`, LITE `AdvancedPagesSidebar.vue:472-477`). Below `lgAndDown` the same item is a tab
// (`advanced-tab-security`); only one of the two is rendered at a time.
// ---------------------------------------------------------------------------------------------

/** The Security title as the lite sidebar shows it (`heading.instance.advanced.security.title`). */
const securityTitle = (): string => tr('heading.instance.advanced.security.title', 'lite')

/** The legacy Security item of the desktop list (`.v-list-item`) or of the tabs (`.v-tab`); only one list is rendered. */
function legacySecurityItem (page: Page): Locator {
  return page.locator('.sticky-sidebar .v-list-item, .sticky-sidebar .v-tab').filter({ hasText: securityTitle() }).first()
}

/** The element the pointer rests on in the hover state: the desktop item, or the tab below `lgAndDown`. */
export const advancedSecurityHover: Record<'legacy' | 'next', (page: Page) => Locator> = {
  legacy: legacySecurityItem,
  next: page => page.getByTestId('advanced-sidebar-security').or(page.getByTestId('advanced-tab-security')),
}

/** The Security item of the desktop list: its box and computed padding (12 px on hover). */
export const advancedSecurityItemProbe: Probe = {
  key: 'advanced-security-item',
  when: isDesktop,
  legacy: legacySecurityItem,
  next: page => page.getByTestId('advanced-sidebar-security'),
}

/** The hover overlay of the Security item: `::before` on legacy, `.v-list-item__overlay` on next (as the button overlay probe). */
export const advancedSecurityOverlayProbe: Probe = {
  key: 'advanced-security-overlay',
  when: isDesktop,
  legacy: legacySecurityItem,
  next: page => page.getByTestId('advanced-sidebar-security').locator('.v-list-item__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The title of the Security item, which turns primary on hover. */
export const advancedSecurityTitleProbe: Probe = {
  key: 'advanced-security-title',
  when: isDesktop,
  legacy: page => legacySecurityItem(page).locator('.v-list-item__title'),
  next: page => page.getByTestId('advanced-sidebar-security').locator('.v-list-item-title'),
  internal: true,
}

/** The probes of the hover state, added to the default ones. */
export const advancedSecurityHoverProbes: Probe[] = [advancedSecurityItemProbe, advancedSecurityOverlayProbe, advancedSecurityTitleProbe]

// ---------------------------------------------------------------------------------------------
// Focus (Phase 8). The first item of the desktop list (`advanced-sidebar-details`, the Site details item) takes keyboard focus after Tab:
// its overlay paints as the focus ring (`:focus-visible`). Below `lgAndDown` the same item is the first tab (`advanced-tab-details`).
// ---------------------------------------------------------------------------------------------

/** The legacy first item of the desktop list (`.v-list-item`) or of the tabs (`.v-tab`): the Site details item, always shown first. */
function legacyFirstItem (page: Page): Locator {
  return page.locator('.sticky-sidebar .v-list-item, .sticky-sidebar .v-tab').first()
}

/** The element that takes focus in the focus state: the first desktop item, or the first tab below `lgAndDown`. */
export const advancedFirstItemFocus: Record<'legacy' | 'next', (page: Page) => Locator> = {
  legacy: legacyFirstItem,
  next: page => page.getByTestId('advanced-sidebar-details').or(page.getByTestId('advanced-tab-details')),
}

/** The focus overlay of the first desktop item: `::before` on legacy, `.v-list-item__overlay` on next (as the hover overlay probe). */
export const advancedFirstItemOverlayProbe: Probe = {
  key: 'advanced-focus-overlay',
  when: isDesktop,
  legacy: legacyFirstItem,
  next: page => page.getByTestId('advanced-sidebar-details').locator('.v-list-item__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

/** The probes of the focus state, added to the default ones. */
export const advancedFirstItemFocusProbes: Probe[] = [advancedFirstItemOverlayProbe]

// ---------------------------------------------------------------------------------------------
// Disabled (Phase 9). The Site name editor of the card, opened on a privilege list without `wordpress.update_site_name`: a save in flight
// (`PUT .../wordpress/site-name` held) disables the field and both icons and shows the field's loading bar (`EditableHeader.vue:12,22,30`).
// ---------------------------------------------------------------------------------------------

/** The Site name field of the open editor (the `v-text-field` input inside the editor form). */
export const siteNameFieldProbe: Probe = {
  key: 'site-name-field',
  legacy: page => page.locator('.info-panel__input input').first(),
  next: page => page.locator('.info-panel__input input').first(),
}

/** The save icon (`$check`) of the open editor. */
export const siteNameSubmitProbe: Probe = {
  key: 'site-name-submit',
  legacy: page => page.locator('.info-panel__input .edit-icon--submit'),
  next: page => page.locator('.info-panel__input .edit-icon--submit'),
}

/** The cancel icon (`$close`) of the open editor. */
export const siteNameCancelProbe: Probe = {
  key: 'site-name-cancel',
  legacy: page => page.locator('.info-panel__input .edit-icon--cancel'),
  next: page => page.locator('.info-panel__input .edit-icon--cancel'),
}

/** The probes of the disabled state, added to the default ones. */
export const siteNameDisabledProbes: Probe[] = [siteNameFieldProbe, siteNameSubmitProbe, siteNameCancelProbe]

// ---------------------------------------------------------------------------------------------
// Name error (Phase 11). The save answers 422: the alert shows the errors and the editor closes; the name header keeps the old name
// (legacy sets the title only on success, `Instance.updateSiteName`).
// ---------------------------------------------------------------------------------------------

/** The site name as the header shows it once the editor is closed (the plain name row, the same class on both apps). */
export const siteNameHeaderProbe: Probe = {
  key: 'site-name-header',
  legacy: page => page.locator('.info-panel__data--name'),
  next: page => page.locator('.info-panel__data--name'),
}

// ---------------------------------------------------------------------------------------------
// Empty (Phase 12). No screenshot: the card shows `InstanceCardImgNotAvailable` (the `preview-not-available` placeholder, the same class on
// both apps). The sidebar items are the list's `.v-list-item` on desktop and the tabs `.v-tab` below `lgAndDown` (only one is rendered).
// ---------------------------------------------------------------------------------------------

/** The placeholder card of the screenshot column (`InstanceCardImgNotAvailable`), the card that holds `.preview-not-available`. */
export const advancedScreenshotUnavailableProbe: Probe = {
  key: 'screenshot-not-available',
  when: isDesktop,
  legacy: page => page.locator('.v-card', { has: page.locator('.preview-not-available') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.preview-not-available') }).first(),
}

/** The items of the desktop list, counted by the action of the empty state (Details and Security only). */
export const advancedSidebarListItems: Record<'legacy' | 'next', (page: Page) => Locator> = {
  legacy: page => page.locator('.sticky-sidebar .v-list-item'),
  next: page => page.getByTestId('advanced-sidebar').locator('.v-list-item'),
}

/** The tabs below `lgAndDown`, counted by the action of the empty state (the same two items as the list). */
export const advancedSidebarTabs: Record<'legacy' | 'next', (page: Page) => Locator> = {
  legacy: page => page.locator('.sticky-sidebar .v-tab'),
  next: page => page.getByTestId('advanced-sidebar').locator('.v-tab'),
}

// ---------------------------------------------------------------------------------------------
// Loading (Phase 13). The installation details request hangs, so the Installation card keeps its text skeleton (four `text@2` rows, the
// same on both apps). The card is the one that holds the skeleton text: the Site card has `.details-box` rows, the screenshot has its image.
// ---------------------------------------------------------------------------------------------

/** The Installation card while its details load: the card that holds the skeleton text rows (`.v-skeleton-loader__text`). */
export const advancedInstallationSkeletonProbe: Probe = {
  key: 'installation-skeleton-card',
  legacy: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader__text') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader__text') }).first(),
}
