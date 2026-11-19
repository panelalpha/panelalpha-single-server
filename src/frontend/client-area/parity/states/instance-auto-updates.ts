import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from './instance'
import { advancedFrameHandlers } from './instance-advanced-frame'
import { screenshotHandlers } from './instances'
import { shellHandlers } from './shell'

// S-99 ui-instance-auto-updates: the Auto Updates page of a project on app-lite (`/projects/:id/advanced/auto-updates`, `target: 'lite'`),
// plus the two branches only app has (the blocked-by alert and the "partial" text, `target: 'app'`, `/instances/:id/…`). Not a spec file
// (testMatch is `*.parity.ts`). States: `instance-auto-updates.parity.ts`. Plan: context/changes/ui-instance-auto-updates/plan.md.

export const AU_PROJECT_ID = 41

/** The page set plus the privilege behind the sidebar item (without it the item is absent). */
export const AU_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'wordpress.manage_auto_update']

export const AU_PATH = `/projects/${AU_PROJECT_ID}/advanced/auto-updates`
export const AU_APP_PATH = `/instances/${AU_PROJECT_ID}/advanced/auto-updates`

/** The `GET …/wordpress/auto-update` body: WordPress on (latest), plugins on, themes off. `patch` replaces fields. */
export function autoUpdatesBody (patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { auto_update: 1, auto_update_plugins: 1, auto_update_themes: 0, ...patch }
}

/** The project: a WordPress project; `canAutoUpdates` is explicit because legacy throws when the field is missing (`AutoUpdates.vue:13`). */
function auInstance (canAutoUpdates: Record<string, unknown>, app = false): Record<string, unknown> {
  // App has no Admin Area (`supports_admin_sso`, lite only) and no Security item for a project without `wordpress.manage_security`.
  return instancePageRaw(AU_PROJECT_ID, {
    type: 'wordpress',
    app_type: 'wordpress',
    privileges: app ? AU_PRIVILEGES.filter(privilege => privilege !== 'hosting.manage_ssl') : AU_PRIVILEGES,
    can_auto_updates: canAutoUpdates,
    ...(app ? { supports_admin_sso: false } : {}),
  })
}

export interface AutoUpdatesFixtures {
  /** The `can_auto_updates` of the project (default: WordPress card shown). */
  canAutoUpdates?: Record<string, unknown>
  /** The answer of `GET …/wordpress/auto-update` (default: `autoUpdatesBody()`). */
  settings?: Handler
}

/** Handlers of the page on lite: the Advanced frame's, the project with `can_auto_updates` and the settings call. `overrides` replace any key. */
export function autoUpdatesHandlers (fixtures: AutoUpdatesFixtures = {}, overrides: Record<string, Handler> = {}, app = false): Record<string, Handler> {
  const project = auInstance(fixtures.canAutoUpdates ?? { wordpress: true }, app)
  return advancedFrameHandlers({
    [`GET /projects/${AU_PROJECT_ID}`]: { json: { data: project } },
    ...screenshotHandlers([project], 'projects'),
    [`GET /projects/${AU_PROJECT_ID}/wordpress/auto-update`]: fixtures.settings ?? { json: { data: autoUpdatesBody() } },
    [`PUT /projects/${AU_PROJECT_ID}/wordpress/auto-update`]: { json: {} },
    ...overrides,
  })
}

/** The same on app: the `/projects` keys of the frame become `/instances`, the shell lists `/instances`. */
export function autoUpdatesAppHandlers (fixtures: AutoUpdatesFixtures = {}, overrides: Record<string, Handler> = {}): Record<string, Handler> {
  const routed: Record<string, Handler> = { ...shellHandlers([], 'instances') }
  for (const [key, handler] of Object.entries(autoUpdatesHandlers(fixtures, overrides, true))) {
    routed[key.replace(/^(\S+) \/projects(?=[/?]|$)/, '$1 /instances')] = handler
  }
  return routed
}

// ---------------------------------------------------------------------------------------------
// Probes. The title is the readiness anchor. A card is found by the heading of its `h6` (the same markup on both apps).
// ---------------------------------------------------------------------------------------------

type CardKey = 'wordpress' | 'plugins' | 'themes'

const CARD_TITLES: Record<CardKey, string> = {
  wordpress: 'heading.instance.advanced.autoUpdates.upgrade.title',
  plugins: 'heading.instance.advanced.autoUpdates.upgrade.plugin.title',
  themes: 'heading.instance.advanced.autoUpdates.upgrade.theme.title',
}

export function card (page: Page, key: CardKey, target: 'lite' | 'app' = 'lite'): Locator {
  return page.locator('.v-card', { has: page.locator('h6', { hasText: tr(CARD_TITLES[key], target) }) }).first()
}

export function cardProbes (target: 'lite' | 'app' = 'lite', keys: CardKey[] = ['wordpress', 'plugins', 'themes']): Probe[] {
  return keys.map(key => ({
    key: `card-${key}`,
    legacy: (page: Page) => card(page, key, target),
    next: (page: Page) => card(page, key, target),
  }))
}

export const auTitleProbe: Probe = {
  key: 'auto-updates-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export function switchProbe (key: CardKey, target: 'lite' | 'app' = 'lite'): Probe {
  return {
    key: `switch-${key}`,
    legacy: page => card(page, key, target).locator('.switch-container'),
    next: page => card(page, key, target).locator('.switch-container'),
  }
}

/** Layout probe of the page: the cards container (its end sets the page height). The inside of the V4 switch is gated by the pixel diff. */
export const pageLayoutProbes: Probe[] = [
  { key: 'cards-container', legacy: page => page.locator('.page-title + .container'), next: page => page.locator('.page-title + .v-container') },
]

export const selectProbe: Probe = {
  key: 'wordpress-select',
  legacy: page => card(page, 'wordpress').locator('.v-select'),
  next: page => card(page, 'wordpress').locator('.v-select'),
}

export const auDefaultProbes: Probe[] = [auTitleProbe, ...cardProbes(), switchProbe('wordpress'), switchProbe('plugins'), switchProbe('themes'), selectProbe, ...pageLayoutProbes]

export const errorAlert = (page: Page): Locator => page.locator('.alert-manager .alert--error')

/** Ready: the plugins card heading is visible (after the skeletons); 20 s because several harness runs share the server. */
const waitForPluginsCard: StateAction = async page => {
  await expect(page.locator('h6', { hasText: tr(CARD_TITLES.plugins, 'lite') }).first()).toBeVisible({ timeout: 20_000 })
}
export const waitForCards: { legacy: StateAction[], next: StateAction[] } = {
  legacy: [waitForPluginsCard],
  next: [waitForPluginsCard],
}

export function clickSwitch (key: CardKey, target: 'lite' | 'app' = 'lite'): StateAction {
  return async page => {
    await card(page, key, target).locator('.switch-container').evaluate(element => (element as HTMLElement).click())
  }
}

/** Hover on the version select of the WordPress card (the switches have `pointer-events: none` in both apps, so they have no hover). */
export const hoverSelect: StateAction = async page => {
  await card(page, 'wordpress').locator('.v-select').hover()
}

export const selectStillHovered: StateAction = async page => {
  expect(await card(page, 'wordpress').locator('.v-select').evaluate(element => element.matches(':hover')), 'pointer on the select').toBe(true)
}

/** Keyboard focus on the select (the programmatic focus after a key that moves none counts as `:focus-visible`). */
export const focusSelect: StateAction = async page => {
  await page.mouse.move(0, 0)
  await page.keyboard.press('Shift')
  const input = card(page, 'wordpress').locator('.v-select input:not([type="hidden"])').first()
  await input.focus()
  await expect(input).toBeFocused()
}
