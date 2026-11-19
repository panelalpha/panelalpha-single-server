import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID, advancedFrameHandlers, advancedFrameInstance } from './instance-advanced-frame'
import { liteShellHome } from './instances'
import { NOW } from './shell'

// S-96 ui-instance-wordpress-config: the WordPress Config page of a project (`/projects/41/advanced/wordpress-config`), measured on app-lite
// (`target: 'lite'`). Not a spec file (testMatch is `*.parity.ts`). States: `instance-wordpress-config.parity.ts`.
// Plan: context/changes/ui-instance-wordpress-config/plan.md.

const BASE = `/projects/${ADVANCED_PROJECT_ID}`

/** `wordpress.manage_config` shows the page's link in the sidebar; the rest is the Details privilege set. */
const configInstance = {
  ...advancedFrameInstance,
  privileges: [...(advancedFrameInstance.privileges as string[]), 'wordpress.manage_config'],
}

/** The `GET …/wordpress/config` rows (`{ data: [{ name, value, type }] }`): two constants, a secret (masked value) and a variable. */
export const configRows = [
  { name: 'WP_DEBUG', value: 'false', type: 'constant' },
  { name: 'WP_MEMORY_LIMIT', value: '256M', type: 'constant' },
  { name: 'DB_PASSWORD_HINT', value: 'hunter2', type: 'secret' },
  { name: 'WP_ENVIRONMENT_TYPE', value: 'production', type: 'variable' },
]

export function configHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET ${BASE}`]: { json: { data: configInstance } },
    [`GET ${BASE}/wordpress/config`]: { json: { data: configRows } },
    ...overrides,
  })
}

export const CONFIG_HOME = liteShellHome()
export const CONFIG_DNS = INSTANCE_PAGE_DNS

const T = (key: string): string => tr(key, 'lite')

// ---------------------------------------------------------------------------------------------
// Probes. Legacy keeps the page classes (`.page-title__title`, `.v-data-table`); next the same plus `data-testid`s.
// ---------------------------------------------------------------------------------------------

const titleProbe: Probe = { key: 'config-title', legacy: page => page.locator('.page-title__title'), next: page => page.locator('.page-title__title') }
const addProbe: Probe = {
  key: 'config-add',
  legacy: page => page.getByRole('button', { name: T('button.config.create'), exact: true }),
  next: page => page.getByRole('button', { name: T('button.config.create'), exact: true }),
}
const searchProbe: Probe = {
  key: 'config-search',
  legacy: page => page.locator('.page-title__filter-controls input').first(),
  next: page => page.locator('.page-title__filter-controls input').first(),
}
const tableProbe: Probe = { key: 'config-table', legacy: page => page.locator('.v-data-table').first(), next: page => page.locator('.v-data-table').first() }
const firstRowProbe: Probe = {
  key: 'config-first-row',
  legacy: page => page.locator('tbody tr, .mobile-table-item').first(),
  next: page => page.locator('tbody tr, .mobile-table-item').first(),
}

export const configProbes: Probe[] = [titleProbe, addProbe, searchProbe, tableProbe, firstRowProbe]

export const waitForRows = {
  legacy: [waitFor(page => page.locator('tbody tr, .mobile-table-item').first())],
  next: [waitFor(page => page.locator('tbody tr, .mobile-table-item').first())],
}

export const waitForTitle = {
  legacy: [waitFor(page => page.locator('.page-title__title'))],
  next: [waitFor(page => page.locator('.page-title__title'))],
}

// ---------------------------------------------------------------------------------------------
// Dialog helpers: legacy `.v-dialog--active .basic-modal`, next the `wordpress-config-modal` test id.
// ---------------------------------------------------------------------------------------------

export function dialog (page: Page, app: 'legacy' | 'next'): Locator {
  return app === 'legacy' ? page.locator('.v-dialog--active .basic-modal') : page.getByTestId('wordpress-config-modal')
}

export function dialogProbes (): Probe[] {
  return [
    { key: 'config-dialog', legacy: page => dialog(page, 'legacy'), next: page => dialog(page, 'next') },
    {
      key: 'config-dialog-title',
      legacy: page => dialog(page, 'legacy').locator('.v-card__title, .basic-modal__title').first(),
      next: page => dialog(page, 'next').locator('.v-card-title, .basic-modal__title').first(),
      internal: true,
    },
    {
      key: 'config-dialog-actions',
      legacy: page => dialog(page, 'legacy').locator('.v-card__actions'),
      next: page => dialog(page, 'next').locator('.v-card-actions'),
      internal: true,
    },
  ]
}

function click (name: string, within?: 'dialog'): { legacy: StateAction, next: StateAction } {
  const run = (app: 'legacy' | 'next'): StateAction => async page => {
    const root = within === 'dialog' ? dialog(page, app) : page
    await root.getByRole('button', { name, exact: true }).click()
  }
  return { legacy: run('legacy'), next: run('next') }
}

/** Opens a dialog by an action and waits for it. */
export function openDialog (action: (page: Page) => Promise<void>): { legacy: StateAction, next: StateAction } {
  const run = (app: 'legacy' | 'next'): StateAction => async page => {
    await action(page)
    await expect(dialog(page, app), `${app}: config dialog`).toBeVisible()
  }
  return { legacy: run('legacy'), next: run('next') }
}

export const openCreate = openDialog(async page => {
  await page.getByRole('button', { name: T('button.config.create'), exact: true }).click()
})

/** The row's action icons (`$edit`, `$thrash`) are icon buttons; the first row is `WP_DEBUG`. */
function rowAction (index: number): (page: Page) => Promise<void> {
  return async page => {
    await page.locator('tbody tr, .mobile-table-item').first().locator('button').nth(index).evaluate((el: HTMLElement) => el.click())
  }
}

export const openEdit = openDialog(rowAction(0))
export const openDelete = openDialog(rowAction(1))

/** Fills the create dialog: the two text fields, then the type select (`Constant`). */
export function fillCreate (name: string, value: string): { legacy: StateAction, next: StateAction } {
  const run = (app: 'legacy' | 'next'): StateAction => async page => {
    const box = dialog(page, app)
    await box.locator('input[type="text"], input:not([type])').nth(0).fill(name)
    await box.locator('input[type="text"], input:not([type])').nth(1).fill(value)
    await box.locator('.v-select').click()
    await page.getByRole('option', { name: T('form.option.constant') }).first().click()
  }
  return { legacy: run('legacy'), next: run('next') }
}

export const submitCreate = click(T('button.create'), 'dialog')

export const errorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

export const alertProbe: Probe = { key: 'config-alert', legacy: errorAlert, next: errorAlert }

export function searchFor (term: string): { legacy: StateAction, next: StateAction } {
  const run: StateAction = async page => {
    await page.locator('.page-title__filter-controls input').first().fill(term)
  }
  return { legacy: run, next: run }
}

export const CREATE_ERROR: Handler = { status: 422, json: { message: 'The config could not be saved.' } }

export function baseState (overrides: Partial<ParityState> & { id: string }): ParityState {
  return {
    target: 'lite',
    path: `${BASE}/advanced/wordpress-config`,
    signedIn: true,
    clock: NOW,
    home: CONFIG_HOME,
    handlers: configHandlers(),
    external: { 'dns.google': CONFIG_DNS },
    actions: waitForRows,
    probes: configProbes,
    ...overrides,
  }
}

export { NOW } from './shell'
