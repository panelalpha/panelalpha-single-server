import type { ShellStateOptions, TabKey } from './shell'
import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, tr } from './auth'
import { shellState, singleServerHome, whenPresent } from './shell'

// Style Manager drawer (ui-style-manager, S-135 slice). Not a spec file (testMatch is `*.parity.ts`).
// The drawer has no route: it opens with `?branding` (admin, see `style-manager-rules.ts`) or through the activator tab.
// Target is lite (app-lite is the source of truth; app-lite has the same drawer code as app, see research.md).
// Next locators prefer roles and the `style-manager-*` test ids that the drawer already renders. Classes shared by both
// apps (`.style-drawer`, `.upload-img`, `.color-editor`) are used where a role or test id does not exist.

type Side = 'legacy' | 'next'

/** The open drawer root (`v-navigation-drawer`, class `style-drawer` in both apps). */
function drawerRoot (side: Side): (page: Page) => Locator {
  return page => side === 'legacy'
    ? page.locator('.style-drawer').first()
    : page.getByTestId('style-manager-drawer')
}

/** Waits for the drawer to carry `style-drawer--open` and to be still. A next drawer that never opens is a `missing` delta, not a harness error. */
export function waitDrawerOpen (side: Side): StateAction {
  return async (page: Page): Promise<void> => {
    const open = page.locator('.style-drawer.style-drawer--open').first()
    if (side === 'legacy') {
      await open.waitFor({ state: 'visible' })
      await settled(open)
      return
    }
    await whenPresent(open, () => settled(open))
  }
}

/**
 * Opens the closed drawer by clicking the activator tab (through the DOM, no scroll), then waits for it to be open and still.
 * `?branding=1` would open it too, but legacy `NavbarTopNavigation` matches tabs with `exact: true` (query included), so on
 * `/projects?branding=1` the Mój projekt tab is not highlighted, while next matches the path only (phase 15, G2).
 */
export function openDrawer (side: Side): StateAction {
  return async (page: Page): Promise<void> => {
    const tab = activatorOf(side)(page)
    await tab.waitFor({ state: 'attached' })
    await tab.evaluate(element => (element as HTMLElement).click())
    await waitDrawerOpen(side)(page)
  }
}

/** The closed activator tab. Legacy keeps it inside the drawer, next as a separate fixed element (`StyleManagerMenu.vue`). */
function activatorOf (side: Side): (page: Page) => Locator {
  return page => side === 'legacy'
    ? page.locator('.style-drawer__activator').first()
    : page.getByTestId('style-manager-activator')
}

/**
 * `base` (the closed drawer) with the pointer on the closed tab (phase 9). Legacy moves the drawer 16px in on hover
 * (`margin-right: 16px`, LITE `StyleManagerMenu.vue:509-511`); next moves the tab itself 16px (`right: 14px`). The `activator`
 * probe in `drawerProbes` measures the tab, so the hover is asserted to still be on the tab after the capture.
 */
export function tabHoverState (base: ParityState): ParityState {
  const hover = (side: Side): StateAction => async page => {
    await activatorOf(side)(page).hover()
  }
  const stillHovered = (side: Side): StateAction => async page => {
    expect(await activatorOf(side)(page).evaluate(element => element.matches(':hover')), 'pointer on the tab').toBe(true)
  }
  return {
    ...base,
    pointer: 'keep',
    actions: { legacy: [...base.actions.legacy, hover('legacy')], next: [...base.actions.next, hover('next')] },
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered('legacy')],
      next: [...(base.afterCapture?.next ?? []), stillHovered('next')],
    },
  }
}

/** Drawer probes shared by the open and closed states. Each one resolves to exactly one element (`.first()` where the class repeats). */
export const drawerProbes: Probe[] = [
  {
    key: 'drawer',
    legacy: drawerRoot('legacy'),
    next: drawerRoot('next'),
  },
  {
    key: 'title',
    legacy: page => drawerRoot('legacy')(page).getByRole('heading', { level: 4 }).first(),
    next: page => drawerRoot('next')(page).getByRole('heading', { level: 4 }).first(),
  },
  {
    key: 'section-heading',
    legacy: page => drawerRoot('legacy')(page).getByRole('heading', { level: 5 }).first(),
    next: page => drawerRoot('next')(page).getByRole('heading', { level: 5 }).first(),
  },
  {
    key: 'dark-switch',
    legacy: page => drawerRoot('legacy')(page).locator('.v-input--switch').first(),
    next: page => drawerRoot('next')(page).getByTestId('style-manager-dark-mode'),
  },
  {
    key: 'logo-box-light',
    legacy: page => drawerRoot('legacy')(page).locator('.upload-img').first(),
    next: page => drawerRoot('next')(page).locator('.upload-img').first(),
  },
  {
    key: 'favicon-tile',
    legacy: page => drawerRoot('legacy')(page).locator('.upload-img').nth(2),
    next: page => drawerRoot('next')(page).locator('.upload-img').nth(2),
  },
  {
    key: 'color-groups',
    legacy: page => drawerRoot('legacy')(page).locator('.ga-2').first(),
    next: page => drawerRoot('next')(page).getByTestId('style-manager-color-groups'),
  },
  {
    key: 'primary-editor',
    legacy: page => drawerRoot('legacy')(page).locator('.color-editor').first(),
    next: page => drawerRoot('next')(page).locator('.color-editor').first(),
  },
  {
    key: 'save',
    legacy: page => drawerRoot('legacy')(page).getByRole('button', { name: tr('button.saveChanges', 'lite'), exact: true }).first(),
    next: page => drawerRoot('next')(page).getByTestId('style-manager-save'),
  },
  {
    key: 'restore',
    legacy: page => drawerRoot('legacy')(page).getByRole('button', { name: tr('button.restoreDefault', 'lite'), exact: true }).first(),
    next: page => drawerRoot('next')(page).getByTestId('style-manager-restore'),
  },
  {
    key: 'activator',
    legacy: page => page.locator('.style-drawer__activator').first(),
    next: page => page.getByTestId('style-manager-activator'),
  },
]

/** Logo and favicon tiles once an image is uploaded (phase 8). `logo-box-light` and `favicon-tile` are in `drawerProbes`. */
export const logoProbes: Probe[] = [
  {
    key: 'logo-box-dark',
    legacy: page => drawerRoot('legacy')(page).locator('.upload-img').nth(1),
    next: page => drawerRoot('next')(page).locator('.upload-img').nth(1),
  },
  {
    // Preview box of the light logo: white background in dark, none in light.
    key: 'logo-preview',
    legacy: page => drawerRoot('legacy')(page).locator('.upload-img__text').nth(0),
    next: page => drawerRoot('next')(page).locator('.upload-img__text').nth(0),
  },
  {
    // Preview box of the dark logo: `secondary-darken2` in light, none in dark.
    key: 'logo-preview-dark',
    legacy: page => drawerRoot('legacy')(page).locator('.upload-img__text').nth(1),
    next: page => drawerRoot('next')(page).locator('.upload-img__text').nth(1),
  },
  {
    key: 'logo-buttons',
    legacy: page => drawerRoot('legacy')(page).locator('.upload-img__control-btns').nth(0),
    next: page => drawerRoot('next')(page).locator('.upload-img__control-btns').nth(0),
  },
  {
    key: 'favicon-buttons',
    legacy: page => drawerRoot('legacy')(page).locator('.upload-img__control-btns').nth(2),
    next: page => drawerRoot('next')(page).locator('.upload-img__control-btns').nth(2),
  },
]

/** The alert stack entry of a failed save (`.alert-manager .alert--error`, first one: the save fires one PUT). */
export const errorAlertProbe: Probe = {
  key: 'alerts',
  legacy: page => page.locator('.alert-manager .alert--error').first(),
  next: page => page.getByTestId('shell-alert-manager').locator('.alert--error').first(),
}

/**
 * Save in the open drawer with a failing PUT (phase 11): the button is clicked through the DOM (`el.click()`, no scroll), then
 * the error alert is awaited and its text is hovered, so the alert timer stops (lekcja „Toast z timerem”).
 */
export function saveWithError (side: Side): StateAction {
  return async page => {
    const save = drawerProbe('save', side)(page)
    await save.evaluate(element => (element as HTMLElement).click())
    const alert = errorAlertProbe[side](page)
    await expect(alert, 'error alert after save').toBeVisible()
    await settled(alert)
    await alert.locator('.alert__text-box').hover()
  }
}

/** The pointer stays on the alert text after the capture (same check as `buttonHoverState`). */
export function errorTextStillHovered (side: Side): StateAction {
  return async page => {
    const text = errorAlertProbe[side](page).locator('.alert__text-box')
    expect(await text.evaluate(element => element.matches(':hover')), `pointer on the alert text (${side})`).toBe(true)
  }
}

/**
 * Save in the open drawer without waiting for a response (phase 12): the PUT hangs (`'hold'`), so the button keeps its loader.
 * Clicked through the DOM like `saveWithError` (no scroll).
 */
export function saveClick (side: Side): StateAction {
  return async page => {
    await drawerProbe('save', side)(page).evaluate(element => (element as HTMLElement).click())
  }
}

/** Waits until the Save loader (`.v-progress-circular`, both apps) is visible and still (phase 12). */
export function waitSaveLoading (side: Side): StateAction {
  return async page => {
    await settled(drawerProbe('save', side)(page).locator('.v-progress-circular'))
  }
}

/** The Save loader spinner, masked in the capture: it animates, so its pixels are not stable (`cron-save-loading`, lekcja „Stan loading”). */
export function saveLoaderMask (side: Side): (page: Page) => Locator {
  return page => drawerProbe('save', side)(page).locator('.v-progress-circular')
}

/**
 * Opens the drawer from the reseller Branding page: the `button.branding.manage` button, shown as „Manage Styles” in both apps (lite fixture).
 * Legacy has no test id, so it is found by role and name; next also has `branding-manage-styles`.
 * Clicked through the DOM (no scroll, lekcja „Modal w stanie parity”).
 */
export function openFromBranding (side: Side): StateAction {
  return async page => {
    const button = side === 'legacy'
      ? page.getByRole('button', { name: 'Manage Styles', exact: true }).first()
      : page.getByTestId('branding-manage-styles')
    await button.evaluate(element => (element as HTMLElement).click())
  }
}

/** The primary colour editor button that opens the picker menu (phase 13). Legacy: first `.color-editor .v-btn`; next: the `base` editor wrapper. */
function pickerTrigger (side: Side): (page: Page) => Locator {
  return page => side === 'legacy'
    ? drawerRoot('legacy')(page).locator('.color-editor .v-btn').first()
    : drawerRoot('next')(page).getByTestId('style-manager-editor-base').locator('.v-btn').first()
}

/**
 * Picker menu probes (phase 13). The menu is teleported out of the drawer (V2 `.v-menu__content`, V4 `.v-overlay`), so the probes
 * are page-level. Picker V2 and V4 have different DOM: the sizes are the candidates for the phase 15 exceptions.
 */
export const pickerProbes: Probe[] = [
  {
    key: 'picker',
    legacy: page => page.locator('.menuable__content__active .v-color-picker').first(),
    next: page => page.locator('.v-overlay--active .v-color-picker').first(),
  },
  {
    key: 'picker-input',
    legacy: page => page.locator('.menuable__content__active .v-color-picker__input input').first(),
    next: page => page.locator('.v-overlay--active .v-color-picker-edit__input input').first(),
  },
]

/** Opens the primary colour picker menu through the DOM (no scroll, lekcja „Modal w stanie parity”), then waits until the picker is visible and still. */
export function openPrimaryPicker (side: Side): StateAction {
  return async page => {
    await pickerTrigger(side)(page).evaluate(element => (element as HTMLElement).click())
    await settled(pickerProbe('picker', side)(page))
  }
}

/** One picker probe by key, resolved for one side. */
function pickerProbe (key: string, side: Side): (page: Page) => Locator {
  const probe = pickerProbes.find(item => item.key === key)
  if (!probe) {
    throw new Error(`no picker probe "${key}"`)
  }
  return probe[side]
}

/** One drawer probe by key, resolved for one side. */
function drawerProbe (key: string, side: Side): (page: Page) => Locator {
  const probe = drawerProbes.find(item => item.key === key)
  if (!probe) {
    throw new Error(`no drawer probe "${key}"`)
  }
  return probe[side]
}

export interface StyleManagerStateOptions {
  path: string
  /** Keys written to `localStorage` before load (`{origin}-style-manager`: any non-empty value keeps the tab closed). */
  localStorage?: Record<string, string>
  /** Merged into the lite `app` of `/home` (the theme with the uploaded images, phase 8). */
  app?: Record<string, unknown>
  /** Merged over the shell handlers (phase 11: the failing `PUT /settings/userapp-branding`). */
  handlers?: Record<string, Handler>
  probes?: Probe[]
  /** Masks for the capture (phase 12: the Save loader spinner). */
  masks?: { legacy: Array<(page: Page) => Locator>, next: Array<(page: Page) => Locator> }
  /** Skips the scroll reset before the probes (phase 13: the open picker menu follows its activator). */
  keepScroll?: boolean
  /** Reseller user (`reseller_settings` present, no `admin` key), phase 14: the drawer has no activator tab. */
  reseller?: boolean
  /** Shell tabs and the active one, for a routed page other than `/projects` (phase 14: the reseller frame). */
  tabs?: NonNullable<ShellStateOptions['tabs']>
  activeTab?: TabKey
  legacy?: StateAction[]
  next?: StateAction[]
}

/** Signed-in single-server admin (`admin` key present, `reseller_settings` absent) on the lite shell with the drawer probes. */
export function styleManagerState (options: StyleManagerStateOptions): Omit<ParityState, 'id'> {
  const home = singleServerHome()
  const base = options.reseller === true
    ? { app: home.app, user: { has_hosting_access: true, reseller_settings: {} } }
    : home
  const shell = shellState({
    target: 'lite',
    path: options.path,
    home: { ...base, app: { ...base.app, ...options.app } },
    legacy: options.legacy,
    next: options.next,
    probes: [...drawerProbes, ...(options.probes ?? [])],
    ...(options.tabs === undefined ? {} : { tabs: options.tabs }),
    ...(options.activeTab === undefined ? {} : { activeTab: options.activeTab }),
  })
  return {
    ...shell,
    ...(options.handlers === undefined ? {} : { handlers: { ...shell.handlers, ...options.handlers } }),
    ...(options.localStorage === undefined ? {} : { localStorage: options.localStorage }),
    ...(options.masks === undefined ? {} : { masks: options.masks }),
    ...(options.keepScroll === undefined ? {} : { keepScroll: options.keepScroll }),
  }
}
