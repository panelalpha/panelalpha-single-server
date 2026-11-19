import type { ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import { alertManagerProbe } from './hosting'
import { INSTANCE_PAGE_DNS, INSTANCE_PAGE_PRIVILEGES } from './instance'
import { DEV_DOMAIN, DEV_HOSTING_ID, DEV_PATH, DEV_PROJECT_ID, devActionsButtonProbe, devActionsCellProbe, devActionsSecondButtonProbe, devAddDirectiveProbe, devDefaultProbes, devDirectiveFieldProbe, devEditRowProbe, devHandlers, devManageOverlayProbe, devModalCancelProbe, devModalCellProbe, devModalFirstRowProbe, devModalHeadCellProbe, devModalProbe, devModalSaveProbe, devModalTableProbe, devModalTitleProbe, devModalValueCellProbe, devPhpAlertProbe, devPhpSettingsManageProbe, devTitleProbe, devValueFieldProbe, editFirstRow, focusManage, hoverManage, manageStillHovered, modal, openPhpSettings, openPhpVersion, PHP_SETTINGS_FIXED, PHP_SETTINGS_LOCKED, waitForCards } from './instance-developer-settings'
import { liteShellHome } from './instances'
import { NOW } from './shell'

// S-100 ui-instance-developer-settings: the Developer Settings page of a project on app-lite (`target: 'lite'`, M-2 default). Each state id is
// a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes:
// `instance-developer-settings.ts`. Plan: context/changes/ui-instance-developer-settings/plan.md.

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Plugins states do). */
const { admin: _styleManagerAdmin, ...liteHome } = liteShellHome()

const base = {
  target: 'lite' as const,
  path: DEV_PATH,
  signedIn: true,
  clock: NOW,
  home: liteHome,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
}

export const instanceDeveloperSettingsDefault: ParityState = {
  ...base,
  id: 'instance-developer-settings-default',
  handlers: devHandlers(),
  actions: waitForCards,
  probes: devDefaultProbes,
}

export const instanceDeveloperSettingsHover: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-hover',
  pointer: 'keep',
  actions: { legacy: [...waitForCards.legacy, hoverManage], next: [...waitForCards.next, hoverManage] },
  probes: [...devDefaultProbes, devManageOverlayProbe],
  afterCapture: { legacy: [manageStillHovered], next: [manageStillHovered] },
}

export const instanceDeveloperSettingsFocus: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-focus',
  pointer: 'keep',
  actions: { legacy: [...waitForCards.legacy, focusManage], next: [...waitForCards.next, focusManage] },
  probes: [...devDefaultProbes, devManageOverlayProbe],
}

// Disabled: the account's PHP settings are not configurable, so the card shows its alert and Manage is disabled.
export const instanceDeveloperSettingsDisabled: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-disabled',
  handlers: devHandlers({ [`GET /server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-settings`]: PHP_SETTINGS_LOCKED }),
  probes: [...devDefaultProbes, devPhpAlertProbe, devPhpSettingsManageProbe],
}

// Error: the PHP settings GET fails (500): the alert shows the message and the card keeps its defaults (not configurable). The debug mode GET is
// not used: legacy requests it twice (the frame's Advanced chip and the page), so two alerts stack, and the frame of next stays silent. The alert closes itself after 5 s, so the
// pointer rests on its text box while the screenshot is taken.
const errorAlert = (page: Page) => page.locator('.alert-manager .alert--error')
const restOnAlert: StateAction = async page => {
  await expect(errorAlert(page)).toBeVisible()
  await errorAlert(page).locator('.alert__text-box').hover()
}

export const instanceDeveloperSettingsError: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-error',
  pointer: 'keep',
  handlers: devHandlers({ [`GET /server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-settings`]: { status: 500, json: { message: 'Server Error' } } }),
  actions: { legacy: [...waitForCards.legacy, restOnAlert], next: [...waitForCards.next, restOnAlert] },
  probes: [...devDefaultProbes, alertManagerProbe],
}

// Empty: a project without the privileges of the cards: the page keeps only its title (legacy `DeveloperSettings.vue:3-11`).
const NO_CARD_PRIVILEGES = INSTANCE_PAGE_PRIVILEGES.filter(privilege => !['wordpress.manage_debug_mode', 'wordpress.manage_maintenance_mode', 'hosting.control_panel_sso'].includes(privilege))
const waitForTitle: StateAction = async page => {
  await expect(page.locator('.page-title__title')).toBeVisible()
}

export const instanceDeveloperSettingsEmpty: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-empty',
  handlers: devHandlers({}, NO_CARD_PRIVILEGES),
  actions: { legacy: [waitForTitle], next: [waitForTitle] },
  probes: [devTitleProbe],
}

// Loading: every GET of the cards is held, so the skeletons stay (the cards read their own state).
const HELD = {
  [`GET /projects/${DEV_PROJECT_ID}/wordpress/debug-mode`]: 'hold',
  [`GET /projects/${DEV_PROJECT_ID}/wordpress/maintenance-mode`]: 'hold',
  [`GET /server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-version`]: 'hold',
  [`GET /server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-settings`]: 'hold',
} as const
const waitForSkeleton: StateAction = async page => {
  await expect(page.locator('.v-skeleton-loader').first()).toBeVisible()
}
const skeletonParts: Probe[] = [0, 1, 2].map(index => ({
  key: `skeleton-loader-${index}`,
  legacy: (page: Page) => page.locator('.v-card .v-skeleton-loader').nth(index),
  next: (page: Page) => page.locator('.v-card .v-skeleton-loader').nth(index),
}))
const skeletonProbe: Probe = {
  key: 'skeleton',
  legacy: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader') }).first(),
  next: page => page.locator('.v-card', { has: page.locator('.v-skeleton-loader') }).first(),
}

export const instanceDeveloperSettingsLoading: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-loading',
  handlers: devHandlers({ ...HELD }),
  actions: { legacy: [waitForSkeleton], next: [waitForSkeleton] },
  probes: [devTitleProbe, skeletonProbe, ...skeletonParts],
  masks: {
    legacy: [page => page.locator('.v-skeleton-loader')],
    next: [page => page.locator('.v-skeleton-loader')],
  },
}

// Modals. Both dialogs carry `.basic-modal`; the PHP version select shows the current version, the settings table the three rows.
const modalProbes: Probe[] = [devModalProbe, devModalTitleProbe, devModalSaveProbe, devModalCancelProbe]

export const instanceDeveloperSettingsPhpVersionModal: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-php-version-modal',
  actions: { legacy: [...waitForCards.legacy, openPhpVersion], next: [...waitForCards.next, openPhpVersion] },
  probes: [devTitleProbe, ...modalProbes],
}

// The save answers 422: the alert shows the message and the dialog stays open.
const saveModal: StateAction = async page => {
  await modal(page).getByRole('button', { name: tr('button.saveChanges', 'lite') }).click()
  await expect(errorAlert(page)).toBeVisible()
  await errorAlert(page).locator('.alert__text-box').hover()
}

export const instanceDeveloperSettingsPhpVersionModalError: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-php-version-modal-error',
  pointer: 'keep',
  handlers: devHandlers({ [`PUT /server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-version`]: { status: 422, json: { message: 'The PHP version could not be changed.' } } }),
  actions: { legacy: [...waitForCards.legacy, openPhpVersion, saveModal], next: [...waitForCards.next, openPhpVersion, saveModal] },
  probes: [devTitleProbe, ...modalProbes, alertManagerProbe],
}

export const instanceDeveloperSettingsPhpSettingsModal: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-php-settings-modal',
  handlers: devHandlers({ [`GET /server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-settings`]: PHP_SETTINGS_FIXED }),
  actions: { legacy: [...waitForCards.legacy, openPhpSettings], next: [...waitForCards.next, openPhpSettings] },
  probes: [devTitleProbe, ...modalProbes, devModalTableProbe, devModalHeadCellProbe, devModalFirstRowProbe, devModalCellProbe, devModalValueCellProbe, devActionsCellProbe, devActionsButtonProbe, devActionsSecondButtonProbe],
}

export const instanceDeveloperSettingsPhpSettingsModalCustom: ParityState = {
  ...instanceDeveloperSettingsDefault,
  id: 'instance-developer-settings-php-settings-modal-custom',
  actions: { legacy: [...waitForCards.legacy, openPhpSettings, editFirstRow], next: [...waitForCards.next, openPhpSettings, editFirstRow] },
  probes: [devTitleProbe, ...modalProbes, devModalTableProbe, devEditRowProbe, devAddDirectiveProbe, devActionsCellProbe, devActionsButtonProbe, devActionsSecondButtonProbe, devDirectiveFieldProbe, devValueFieldProbe],
}

const states: ParityState[] = [
  instanceDeveloperSettingsDefault,
  instanceDeveloperSettingsHover,
  instanceDeveloperSettingsFocus,
  instanceDeveloperSettingsDisabled,
  instanceDeveloperSettingsError,
  instanceDeveloperSettingsEmpty,
  instanceDeveloperSettingsLoading,
  instanceDeveloperSettingsPhpVersionModal,
  instanceDeveloperSettingsPhpVersionModalError,
  instanceDeveloperSettingsPhpSettingsModal,
  instanceDeveloperSettingsPhpSettingsModalCustom,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // A pointer hover has no meaning on the mobile variant (the button is also below the fold there).
    test.skip(state.id.endsWith('-hover') && testInfo.project.name === 'light-mobile', 'hover is a desktop state')
    await runState(browser, testInfo, state)
  })
}
