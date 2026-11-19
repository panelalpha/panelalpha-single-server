import type { ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertManagerProbe } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { AU_APP_PATH, AU_PATH, auDefaultProbes, auTitleProbe, autoUpdatesAppHandlers, autoUpdatesBody, autoUpdatesHandlers, cardProbes, clickSwitch, errorAlert, focusSelect, hoverSelect, selectStillHovered, switchProbe, waitForCards } from './instance-auto-updates'
import { liteShellHome } from './instances'
import { NOW, shellHome } from './shell'

// S-99 ui-instance-auto-updates: the Auto Updates page of a project on app-lite (`target: 'lite'`, M-2 default) and the two branches only app
// has (`target: 'app'`). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Builder and probes: `instance-auto-updates.ts`. Plan: context/changes/ui-instance-auto-updates/plan.md.
// Matrix: `disabled` is N/A (legacy `ButtonSwitch` is never disabled here, `AutoUpdates.vue:29-33,75-79,97-101`); hover/focus are measured on
// the version select, because the switches have `pointer-events: none` and are not focusable in either app.

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Plugins states do). */
const { admin: _styleManagerAdmin, ...liteHome } = liteShellHome()

const base = {
  target: 'lite' as const,
  path: AU_PATH,
  signedIn: true,
  clock: NOW,
  home: liteHome,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
}

export const instanceAutoUpdatesDefault: ParityState = {
  ...base,
  id: 'instance-auto-updates-default',
  handlers: autoUpdatesHandlers(),
  actions: waitForCards,
  probes: auDefaultProbes,
}

// WordPress auto-update off: no divider and no select under the first card.
export const instanceAutoUpdatesWpOff: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-wp-off',
  handlers: autoUpdatesHandlers({ settings: { json: { data: autoUpdatesBody({ auto_update: 0 }) } } }),
  probes: [auTitleProbe, ...cardProbes(), switchProbe('wordpress')],
}

// Empty: the project has no WordPress auto-updates (`can_auto_updates: {}`), so the first card is absent (`AutoUpdates.vue:13`).
export const instanceAutoUpdatesNoWpCard: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-no-wp-card',
  handlers: autoUpdatesHandlers({ canAutoUpdates: {} }),
  probes: [auTitleProbe, ...cardProbes('lite', ['plugins', 'themes']), switchProbe('plugins'), switchProbe('themes')],
}

export const instanceAutoUpdatesHover: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-hover',
  pointer: 'keep',
  actions: { legacy: [...waitForCards.legacy, hoverSelect], next: [...waitForCards.next, hoverSelect] },
  afterCapture: { legacy: [selectStillHovered], next: [selectStillHovered] },
}

export const instanceAutoUpdatesFocus: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-focus',
  pointer: 'keep',
  actions: { legacy: [...waitForCards.legacy, focusSelect], next: [...waitForCards.next, focusSelect] },
}

// Error: the save answers 422; the alert shows and the switch stays off (the PUT failed, no re-GET). Captured before the alert closes (5 s).
const waitForErrorAlert: StateAction = async page => {
  await expect(errorAlert(page)).toBeVisible()
  await errorAlert(page).locator('.alert__text-box').hover()
}

export const instanceAutoUpdatesError: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-error',
  pointer: 'keep',
  handlers: autoUpdatesHandlers({}, { 'PUT /projects/41/wordpress/auto-update': { status: 422, json: { message: 'The settings could not be saved.' } } }),
  actions: { legacy: [...waitForCards.legacy, clickSwitch('themes'), waitForErrorAlert], next: [...waitForCards.next, clickSwitch('themes'), waitForErrorAlert] },
  probes: [...auDefaultProbes, alertManagerProbe],
}

// Load error: the first GET answers 500; the alert shows, every switch stays off and the select is hidden.
export const instanceAutoUpdatesErrorLoad: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-error-load',
  pointer: 'keep',
  handlers: autoUpdatesHandlers({ settings: { status: 500, json: { message: 'Server Error' } } }),
  actions: { legacy: [...waitForCards.legacy, waitForErrorAlert], next: [...waitForCards.next, waitForErrorAlert] },
  probes: [auTitleProbe, ...cardProbes(), switchProbe('wordpress'), switchProbe('plugins'), switchProbe('themes'), alertManagerProbe],
}

// Loading: the settings GET is held, so the three skeletons stay.
const waitForSkeleton: StateAction = async page => {
  await expect(page.locator('.v-skeleton-loader').first()).toBeVisible()
}
const skeletonParts: Probe[] = [0, 1, 2].map(index => ({
  key: `skeleton-card-${index}`,
  legacy: (page: Page) => page.locator('.v-card', { has: page.locator('.v-skeleton-loader') }).nth(index),
  next: (page: Page) => page.locator('.v-card', { has: page.locator('.v-skeleton-loader') }).nth(index),
}))
export const instanceAutoUpdatesLoading: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-loading',
  handlers: autoUpdatesHandlers({ settings: 'hold' }),
  actions: { legacy: [waitForSkeleton], next: [waitForSkeleton] },
  probes: [auTitleProbe, ...skeletonParts],
  masks: {
    legacy: [page => page.locator('.v-skeleton-loader')],
    next: [page => page.locator('.v-skeleton-loader')],
  },
}

// Saving: the PUT is held after a click on the themes switch; its loader runs (indeterminate: masked).
const waitForSavingLoader: StateAction = async page => {
  await expect(page.locator('.switch-container .v-progress-linear, .switch-container .v-progress-circular, .switch-container .v-input--is-loading, .switch-container .v-input--loading').first()).toBeAttached()
}
export const instanceAutoUpdatesSaving: ParityState = {
  ...instanceAutoUpdatesDefault,
  id: 'instance-auto-updates-saving',
  handlers: autoUpdatesHandlers({}, { 'PUT /projects/41/wordpress/auto-update': 'hold' }),
  actions: { legacy: [...waitForCards.legacy, clickSwitch('themes'), waitForSavingLoader], next: [...waitForCards.next, clickSwitch('themes'), waitForSavingLoader] },
  probes: [...auDefaultProbes],
  masks: {
    legacy: [page => page.locator('.switch-container .v-progress-linear, .switch-container .v-progress-circular')],
    next: [page => page.locator('.switch-container .v-progress-linear, .switch-container .v-progress-circular')],
  },
}

// App only (the deployed lite does not read `updater_blocked_by` or `plugins`): measured on app, `/instances/41/advanced/auto-updates`.
const appBase = {
  target: 'app' as const,
  path: AU_APP_PATH,
  signedIn: true,
  clock: NOW,
  home: shellHome(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
}

const blockedAlertProbe: Probe = {
  key: 'blocked-alert',
  legacy: page => page.locator('.v-alert', { hasText: 'DISALLOW_FILE_MODS' }),
  next: page => page.locator('.v-alert', { hasText: 'DISALLOW_FILE_MODS' }),
}

const waitForBlocked: StateAction = async page => {
  await expect(page.locator('.v-alert', { hasText: 'DISALLOW_FILE_MODS' })).toBeVisible()
}

export const instanceAutoUpdatesBlocked: ParityState = {
  ...appBase,
  id: 'instance-auto-updates-blocked',
  handlers: autoUpdatesAppHandlers({ settings: { json: { data: autoUpdatesBody({ updater_blocked_by: ['DISALLOW_FILE_MODS', 'WP_AUTO_UPDATE_CORE'] }) } } }),
  actions: { legacy: [waitForBlocked], next: [waitForBlocked] },
  probes: [auTitleProbe, blockedAlertProbe, ...cardProbes('app')],
}

const partialProbe: Probe = {
  key: 'plugins-partial',
  legacy: page => page.locator('.v-card p.warning--text, .v-card p.text-warning').first(),
  next: page => page.locator('.v-card p.text-warning').first(),
}
const waitForPartial: StateAction = async page => {
  await expect(page.locator('.v-card p.warning--text, .v-card p.text-warning').first()).toBeVisible()
}

export const instanceAutoUpdatesPartial: ParityState = {
  ...appBase,
  id: 'instance-auto-updates-partial',
  handlers: autoUpdatesAppHandlers({ settings: { json: { data: autoUpdatesBody({ plugins: 'partial' }) } } }),
  actions: { legacy: [waitForPartial], next: [waitForPartial] },
  probes: [auTitleProbe, partialProbe, ...cardProbes('app')],
}

const states: ParityState[] = [
  instanceAutoUpdatesDefault,
  instanceAutoUpdatesWpOff,
  instanceAutoUpdatesNoWpCard,
  instanceAutoUpdatesHover,
  instanceAutoUpdatesFocus,
  instanceAutoUpdatesError,
  instanceAutoUpdatesErrorLoad,
  instanceAutoUpdatesLoading,
  instanceAutoUpdatesSaving,
  instanceAutoUpdatesBlocked,
  instanceAutoUpdatesPartial,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // A pointer hover has no meaning on the mobile variant.
    test.skip(state.id.endsWith('-hover') && testInfo.project.name === 'light-mobile', 'hover is a desktop state')
    await runState(browser, testInfo, state)
  })
}
