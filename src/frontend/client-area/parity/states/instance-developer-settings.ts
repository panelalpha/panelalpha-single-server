import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { allHostingPrivileges } from './hosting'
import { INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from './instance'
import { advancedFrameHandlers } from './instance-advanced-frame'
import { screenshotHandlers } from './instances'

// S-100 ui-instance-developer-settings: the Developer Settings page of a project on app-lite (`/projects/:id/advanced/developer-settings`,
// `target: 'lite'`). Not a spec file (testMatch is `*.parity.ts`). States: `instance-developer-settings.parity.ts`. Plan:
// context/changes/ui-instance-developer-settings/plan.md.

/** The project of the states: the id and the hosting account the Advanced frame states use. */
export const DEV_PROJECT_ID = 41
export const DEV_HOSTING_ID = 1
export const DEV_DOMAIN = 'studio.example.com'

/** The privileges of the page: the frame set plus the six cards (debug and maintenance are in the frame set already). */
export const DEV_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'wordpress.view_installation_details', ...allHostingPrivileges]

/** The `GET /projects/41` body: a WordPress project on the cPanel account 1 (the phpMyAdmin SSO host is in the account details). */
export function devInstance (privileges: string[] = DEV_PRIVILEGES): Record<string, unknown> {
  return instancePageRaw(DEV_PROJECT_ID, { type: 'wordpress', app_type: 'wordpress', privileges, domain: DEV_DOMAIN, server_account_details: { mysql_php_my_admin_sso_host: DEV_DOMAIN } })
}

const phpVersionPath = `/server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-version`
const phpSettingsPath = `/server-accounts/${DEV_HOSTING_ID}/domains/${DEV_DOMAIN}/php-settings`

/** The versions the PHP version modal offers (`GET /server-accounts/{id}/php-versions`). */
const PHP_VERSIONS = [
  { label: 'PHP 7.4', value: '7.4' },
  { label: 'PHP 8.0', value: '8.0' },
  { label: 'PHP 8.1', value: '8.1' },
  { label: 'PHP 8.2', value: '8.2' },
  { label: 'PHP 8.3', value: '8.3' },
]

/** A configurable account with a custom directive list: three rows, the directive names have tooltips in the translation. */
export const PHP_SETTINGS_CUSTOM: Handler = {
  json: {
    configurable: true,
    custom_directives: true,
    modifiable_directives_list: true,
    directives: [
      { directive: 'memory_limit', value: '256M' },
      { directive: 'max_execution_time', value: '60' },
      { directive: 'display_errors', value: 'Off' },
    ],
    suggested_directives: [
      { directive: 'memory_limit', type: 'text' },
      { directive: 'max_execution_time', type: 'text' },
      { directive: 'display_errors', type: 'select', options: ['On', 'Off'] },
      { directive: 'upload_max_filesize', type: 'text' },
    ],
  },
}

/** A configurable account with a fixed directive list (no Add directive, Edit only). */
export const PHP_SETTINGS_FIXED: Handler = {
  json: {
    ...(PHP_SETTINGS_CUSTOM as { json: Record<string, unknown> }).json,
    custom_directives: false,
  },
}

/** An account whose PHP settings cannot be changed: the card shows its alert and Manage is disabled. */
export const PHP_SETTINGS_LOCKED: Handler = {
  json: { configurable: false, custom_directives: false, directives: [], suggested_directives: [] },
}

/** Handlers of the page: the Advanced frame's, the project with the cards' privileges, the modes and the PHP calls. `overrides` replace any key. */
export function devHandlers (overrides: Record<string, Handler> = {}, privileges: string[] = DEV_PRIVILEGES): Record<string, Handler> {
  const project = devInstance(privileges)
  return advancedFrameHandlers({
    [`GET /projects/${DEV_PROJECT_ID}`]: { json: { data: project } },
    ...screenshotHandlers([project], 'projects'),
    [`GET /projects/${DEV_PROJECT_ID}/wordpress/debug-mode`]: { json: { status: true } },
    [`GET /projects/${DEV_PROJECT_ID}/wordpress/maintenance-mode`]: { json: { status: false } },
    [`GET ${phpVersionPath}`]: { json: { data: { label: 'PHP 8.2', value: '8.2' } } },
    'GET /server-accounts/1/php-versions': { json: { data: PHP_VERSIONS } },
    [`GET ${phpSettingsPath}`]: PHP_SETTINGS_CUSTOM,
    ...overrides,
  })
}

export const DEV_PATH = `/projects/${DEV_PROJECT_ID}/advanced/developer-settings`

// ---------------------------------------------------------------------------------------------
// Probes. The title is the readiness anchor. A card is found by its heading (`.v-card` with the title text, the same on both apps).
// ---------------------------------------------------------------------------------------------

function title (key: string): string {
  return tr(`heading.instance.advanced.developer.${key}.title`, 'lite')
}

/** A card of the page by its heading key (`debug`, `maintenance`, `controlpanel`, `phpmyadmin`, `phpVersion`, `phpSettings`). */
function card (page: Page, key: string): Locator {
  return page.locator('.v-card', { has: page.locator('h6', { hasText: title(key) }) }).first()
}

export const devTitleProbe: Probe = {
  key: 'dev-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

/** The card probes of the default state, in page order. */
export const devCardProbes: Probe[] = ['debug', 'maintenance', 'controlpanel', 'phpmyadmin', 'phpVersion', 'phpSettings'].map(key => ({
  key: `card-${key}`,
  legacy: (page: Page) => card(page, key),
  next: (page: Page) => card(page, key),
}))

export const devSwitchProbe: Probe = {
  key: 'debug-switch',
  legacy: page => card(page, 'debug').locator('.v-input--selection-controls__input'),
  next: page => card(page, 'debug').locator('.v-selection-control__wrapper'),
}

export const devManageProbe: Probe = {
  key: 'php-version-manage',
  legacy: page => card(page, 'phpVersion').getByRole('button', { name: tr('button.manage', 'lite') }),
  next: page => card(page, 'phpVersion').getByRole('button', { name: tr('button.manage', 'lite') }),
}

export const devSsoButtonProbe: Probe = {
  key: 'controlpanel-button',
  legacy: page => card(page, 'controlpanel').locator('.v-btn'),
  next: page => card(page, 'controlpanel').locator('.v-btn'),
}

export const devSsoContentProbe: Probe = {
  key: 'controlpanel-content',
  legacy: page => card(page, 'controlpanel').locator('.v-btn__content'),
  next: page => card(page, 'controlpanel').locator('.v-btn__content'),
}

export const devPhpAlertProbe: Probe = {
  key: 'php-settings-alert',
  legacy: page => card(page, 'phpSettings').locator('.alert-sm'),
  next: page => card(page, 'phpSettings').locator('.alert-sm'),
}

export const devPhpSettingsManageProbe: Probe = {
  key: 'php-settings-manage',
  legacy: page => card(page, 'phpSettings').getByRole('button', { name: tr('button.manage', 'lite') }),
  next: page => card(page, 'phpSettings').getByRole('button', { name: tr('button.manage', 'lite') }),
}

export const devDefaultProbes: Probe[] = [devTitleProbe, ...devCardProbes, devSwitchProbe, devManageProbe, devSsoButtonProbe, devSsoContentProbe]

// ---------------------------------------------------------------------------------------------
// Actions.
// ---------------------------------------------------------------------------------------------

/** Ready: the PHP version card shows its status (the slowest of the cards: a GET behind a skeleton). */
export const waitForCards: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [async page => {
    await expect(card(page, 'phpSettings').getByRole('button', { name: tr('button.manage', 'lite') })).toBeVisible()
  }],
  next: [async page => {
    await expect(card(page, 'phpSettings').getByRole('button', { name: tr('button.manage', 'lite') })).toBeVisible()
  }],
}

/** The Control Panel button: it sits above the fold at 1440x900, so the scroll reset before the probes does not move it from under the pointer (the Manage buttons are below it). */
function ssoButton (page: Page): Locator {
  return card(page, 'controlpanel').locator('.v-btn')
}

/** Hover the Control Panel button. */
export const hoverManage: StateAction = async page => {
  await ssoButton(page).hover()
}

export const manageStillHovered: StateAction = async page => {
  expect(await ssoButton(page).evaluate(element => element.matches(':hover')), 'pointer on the Control Panel button').toBe(true)
}

/** Keyboard focus on the Control Panel button (a key that moves no focus, then `focus()`, as `buttonFocusState`). */
export const focusManage: StateAction = async page => {
  await page.mouse.move(0, 0)
  await page.keyboard.press('Shift')
  const button = ssoButton(page)
  await button.focus()
  await expect(button).toBeFocused()
}

/** The overlay of the Control Panel button: `::before` on legacy, `.v-btn__overlay` on next (as `buttonOverlayProbe`). */
export const devManageOverlayProbe: Probe = {
  key: 'sso-overlay',
  legacy: page => ssoButton(page),
  next: page => ssoButton(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

// A DOM click: Playwright's own click scrolls the page to the button, and V4 blocks the scroll while the dialog is open, so the scroll reset
// before the probes could not bring the page back (V2 does not block it).
export const openPhpVersion: StateAction = async page => {
  await card(page, 'phpVersion').getByRole('button', { name: tr('button.manage', 'lite') }).evaluate(element => (element as HTMLElement).click())
  await expect(modal(page)).toBeVisible()
}

export const openPhpSettings: StateAction = async page => {
  await card(page, 'phpSettings').getByRole('button', { name: tr('button.manage', 'lite') }).evaluate(element => (element as HTMLElement).click())
  await expect(modal(page)).toBeVisible()
}

/** The open modal card (the class both apps give it). */
export function modal (page: Page): Locator {
  return page.locator('.basic-modal').first()
}

export const devModalProbe: Probe = {
  key: 'modal',
  legacy: page => modal(page),
  next: page => modal(page),
}

export const devModalTitleProbe: Probe = {
  key: 'modal-title',
  legacy: page => modal(page).locator('h5'),
  next: page => modal(page).locator('h5'),
}

export const devModalSaveProbe: Probe = {
  key: 'modal-save',
  legacy: page => modal(page).getByRole('button', { name: tr('button.saveChanges', 'lite') }),
  next: page => modal(page).getByRole('button', { name: tr('button.saveChanges', 'lite') }),
}

export const devModalCancelProbe: Probe = {
  key: 'modal-cancel',
  legacy: page => modal(page).getByRole('button', { name: tr('button.cancel', 'lite') }),
  next: page => modal(page).getByRole('button', { name: tr('button.cancel', 'lite') }),
}

export const devModalTableProbe: Probe = {
  key: 'modal-table',
  legacy: page => modal(page).locator('table'),
  next: page => modal(page).locator('table'),
}

export const devModalFirstRowProbe: Probe = {
  key: 'modal-first-row',
  legacy: page => modal(page).locator('tbody tr').first(),
  next: page => modal(page).locator('tbody tr').first(),
}

export const devModalHeadCellProbe: Probe = {
  key: 'modal-th',
  legacy: page => modal(page).locator('th').first(),
  next: page => modal(page).locator('th').first(),
}

export const devModalCellProbe: Probe = {
  key: 'modal-td',
  legacy: page => modal(page).locator('tbody tr').first().locator('td').first(),
  next: page => modal(page).locator('tbody tr').first().locator('td').first(),
}

export const devModalValueCellProbe: Probe = {
  key: 'modal-td-value',
  legacy: page => modal(page).locator('tbody tr').first().locator('td').nth(1),
  next: page => modal(page).locator('tbody tr').first().locator('td').nth(1),
}

export const devActionsCellProbe: Probe = {
  key: 'modal-actions-cell',
  legacy: page => modal(page).locator('tbody tr').nth(1).locator('td').last(),
  next: page => modal(page).locator('tbody tr').nth(1).locator('td').last(),
}

export const devActionsButtonProbe: Probe = {
  key: 'modal-actions-button',
  legacy: page => modal(page).locator('tbody tr').nth(1).locator('td').last().locator('.v-btn').first(),
  next: page => modal(page).locator('tbody tr').nth(1).locator('td').last().locator('.v-btn').first(),
}

export const devActionsSecondButtonProbe: Probe = {
  key: 'modal-actions-button-2',
  legacy: page => modal(page).locator('tbody tr').nth(1).locator('td').last().locator('.v-btn').nth(1),
  next: page => modal(page).locator('tbody tr').nth(1).locator('td').last().locator('.v-btn').nth(1),
}

/** The directive field of the open editor: the V2 slot box, the V4 field. */
export const devDirectiveFieldProbe: Probe = {
  key: 'modal-field-directive',
  legacy: page => modal(page).locator('tbody tr').first().locator('td').first().locator('.v-input__slot'),
  next: page => modal(page).locator('tbody tr').first().locator('td').first().locator('.v-field'),
}

export const devValueFieldProbe: Probe = {
  key: 'modal-field-value',
  legacy: page => modal(page).locator('tbody tr').first().locator('td').nth(1).locator('.v-input__slot'),
  next: page => modal(page).locator('tbody tr').first().locator('td').nth(1).locator('.v-field'),
}

export const devAddDirectiveProbe: Probe = {
  key: 'modal-add-directive',
  legacy: page => modal(page).getByRole('button', { name: tr('button.addDirective', 'lite') }),
  next: page => modal(page).getByRole('button', { name: tr('button.addDirective', 'lite') }),
}

/** Opens the editor of the first row of the settings table (the Edit icon of the first row). */
export const editFirstRow: StateAction = async page => {
  await modal(page).locator('tbody tr').first().locator('button').first().click()
  await expect(modal(page).locator('tbody tr').first().locator('input:not([type="hidden"])').first()).toBeVisible()
}

/** The first row once its editor is open: the directive field and the value field (the inputs of the row). */
export const devEditRowProbe: Probe = {
  key: 'modal-edit-row',
  legacy: page => modal(page).locator('tbody tr').first(),
  next: page => modal(page).locator('tbody tr').first(),
}

export { isDesktop } from './shell'
