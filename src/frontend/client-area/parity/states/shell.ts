import type { Handler, LegacyTarget, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { settled, tr } from './auth'

// Shared building blocks of the signed-in shell states (F-08). Not a spec file (testMatch is `*.parity.ts`).
//
// Next locators use the `shell-*` data-testid vocabulary. Next renders none of it yet (the placeholder navbar has no
// test ids), so those probes report `missing` until the phase that ports the element adds the attribute and updates the
// locator in the same reviewed diff. Assertions are never edited to match. The readiness anchor is the exception: it has
// to exist in next today, so it is the `.v-app-bar` class both frameworks render.

/** The frozen clock of every state that shows relative time (`fromNow`). */
export const NOW = '2026-10-05T12:00:00.000Z'
const DAY = 86_400_000
const MINUTE = 60_000

export const isoFromNow = (offsetMs: number): string => new Date(Date.parse(NOW) + offsetMs).toISOString()
export const inDays = (days: number): string => isoFromNow(days * DAY)

// ---------------------------------------------------------------------------------------------
// Variants. A state only knows the viewport, so conditions are widths. 976 is the V2 `mobile` edge (the measured value
// is recorded in change.md Notes); the shell variants sit at 375, 960 and 1440, so the exact edge does not matter here.
// ---------------------------------------------------------------------------------------------

type ProbeVariant = Parameters<NonNullable<Probe['when']>>[0]
export const isMobile = (variant: ProbeVariant): boolean => variant.viewport.width < 976
export const isDesktop = (variant: ProbeVariant): boolean => variant.viewport.width >= 976

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

export const baseUser = {
  email: 'jane@example.com',
  name: 'Jane Doe',
  gravatar_hash: '9e26471d35a78862c17e467d87cddedf',
  language: 'en',
  services: [] as unknown[],
  has_hosting_access: false,
  reseller_settings: null as unknown,
}

export interface TrialOptions {
  /** Offset from `NOW`, in days. Negative: already expired. */
  expiresInDays: number
}

export function trialService ({ expiresInDays }: TrialOptions) {
  return {
    id: 1,
    name: 'Trial plan',
    status: 'active',
    is_trial: true,
    trial_expiry_at: inDays(expiresInDays),
    plan_upgrade_link: 'https://example.com/upgrade',
  }
}

export interface ShellHomeOptions {
  user?: Record<string, unknown>
  app?: Record<string, unknown>
  admin?: Record<string, unknown>
}

/** `home` override of a shell state: the base user plus the state's differences (arrays are replaced, objects merged). */
export function shellHome ({ user = {}, app = {}, admin }: ShellHomeOptions = {}): Record<string, unknown> {
  return {
    user: { ...baseUser, ...user },
    ...(Object.keys(app).length > 0 ? { app } : {}),
    ...(admin === undefined ? {} : { admin }),
  }
}

export interface NotificationFixture {
  id: string
  type: string
  html: string
  readAt: string | null
  /** Offset from `NOW`, in minutes (negative: in the past). */
  minutesAgo: number
}

export function notificationsBody (items: NotificationFixture[]) {
  return {
    data: items.map(item => ({
      id: item.id,
      type: item.type,
      data: { html_text: item.html },
      read_at: item.readAt,
      created_at: isoFromNow(-item.minutesAgo * MINUTE),
    })),
    meta: { total: items.length },
  }
}

/**
 * Every `/api` request legacy makes on `/instances` with a session, plus the ones next makes once the shell is ported.
 * The list comes from the unmatched list of the first run, not from reading the code. `GET /home`, `GET /<lng>/translation.json`
 * and `GET /csrf-cookie` are built in. `segment` is `projects` where app-lite rewrites `instances` (single server, `utils/resourcePaths.js`).
 */
export function shellHandlers (notifications: NotificationFixture[] = [], segment: 'instances' | 'projects' = 'instances'): Record<string, Handler> {
  return {
    'GET /notifications': { json: notificationsBody(notifications) },
    'PUT /notifications/mark-as-read': { status: 204, body: '' },
    'GET /labels': { json: { data: [] } },
    [`GET /${segment}`]: { json: { data: [], meta: { total: 0 } } },
    // Pusher never reaches the auth endpoint while the harness closes sockets; answered only in case a run proves otherwise.
    'POST /broadcasting/auth': { status: 403, json: { message: 'Harness: websocket disabled.' } },
  }
}

// ---------------------------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------------------------

const MENU_OPEN = '.v-menu__content.menuable__content__active'

export const appBarProbe: Probe = {
  // Anchor. The class exists in next today; `shell-app-bar` replaces it when the shell is ported.
  key: 'app-bar',
  legacy: page => page.locator('.v-app-bar'),
  next: page => page.locator('.v-app-bar'),
}

export const logoProbe: Probe = {
  key: 'logo',
  legacy: page => page.locator('.v-app-bar .logo-link'),
  next: page => page.getByTestId('shell-logo'),
}

export type TabKey = 'my-instances' | 'my-hosting' | 'reseller-area' | 'connect-ai'

const tabCopy: Record<TabKey, string> = {
  'my-instances': 'heading.navbar.tab.myInstances',
  'my-hosting': 'heading.navbar.tab.myHosting',
  'reseller-area': 'heading.navbar.tab.resellerArea',
  'connect-ai': 'heading.navbar.tab.connectAi',
}

export function tabProbe (key: TabKey, copyKey = tabCopy[key], target: LegacyTarget = 'app', probeKey: string = key): Probe {
  return {
    key: `tab-${probeKey}`,
    legacy: page => page.getByRole('tab', { name: tr(copyKey, target), exact: true }),
    next: page => page.getByTestId(`shell-tab-${key}`),
  }
}

/** Slider of the active tab: a sibling wrapper of the tabs in V2, a child of the active tab in V4. `key` is the active tab (default `my-instances`). */
export function tabSliderProbeFor (key: TabKey = 'my-instances'): Probe {
  return {
    key: 'tab-slider',
    legacy: page => page.locator('.navbar-tabs .v-tabs-slider'),
    next: page => page.getByTestId(`shell-tab-${key}`).locator('.v-tab__slider'),
    internal: true,
  }
}

export const tabSliderProbe = tabSliderProbeFor()

/**
 * Single-server `/home` of the lite frame (F-10): app-lite has the `myProjects`, Connect AI and Tasks items app lacks.
 * `beta_mode` off: the lite feedback/beta button belongs to the demo-mode slice. `community_panel` off: these states measure the non-Free
 * single-server frame (the refreshed lite fixture is the Community panel, which has no Admin Area).
 */
export function singleServerHome (flags: { runningTasks?: boolean } = {}) {
  return {
    app: { beta_mode: false, community_panel: false, single_server: { active: true, has_running_tasks: flags.runningTasks ?? false, has_uncompleted_imports: false } },
    user: { is_ss_default: true, has_hosting_access: true },
    admin: { app_url: 'https://admin.example.com' },
  }
}

/**
 * The tabs of the single-server frame in next: the list tab is `my-projects`, then Connect AI. Legacy still has a "My Server" tab between
 * them; next moved it to the user menu (decision of the user 2026-11-17, usage-redesign), so it has no probe.
 */
export const liteTabs = [
  { key: 'my-instances', copyKey: 'heading.navbar.tab.myProjects', probeKey: 'my-projects' },
  { key: 'connect-ai' },
] as const

export function addNewProbeFor (target: LegacyTarget): Probe {
  return {
    key: 'add-new',
    legacy: page => page.getByRole('button', { name: tr('button.addNew', target), exact: true }),
    next: page => page.getByTestId('shell-add-new'),
    when: isDesktop,
  }
}

/** The `$plus` icon: 24px of stroke is far under the pixel threshold, so its colour is probed on its own. */
export function addNewIconProbeFor (target: LegacyTarget): Probe {
  return {
    key: 'add-new-icon',
    legacy: page => page.getByRole('button', { name: tr('button.addNew', target), exact: true }).locator('.v-icon'),
    next: page => page.getByTestId('shell-add-new').locator('.v-icon'),
    when: isDesktop,
    internal: true,
  }
}

export const addNewProbe = addNewProbeFor('app')

export const bellProbe: Probe = {
  key: 'bell',
  legacy: page => page.locator('.navbar__menu-items .v-btn--icon'),
  next: page => page.getByTestId('shell-bell'),
}

export const bellUnreadDotProbe: Probe = {
  key: 'bell-unread-dot',
  legacy: page => page.locator('.navbar__menu-items .notifications-unread'),
  next: page => page.getByTestId('shell-bell-unread'),
}

export const userActivatorProbe: Probe = {
  key: 'user-activator',
  legacy: page => page.locator('.navbar__menu-items .button-activator'),
  next: page => page.getByTestId('shell-user-activator'),
}

export const avatarProbe: Probe = {
  key: 'avatar',
  legacy: page => page.locator('.button-activator .user-avatar'),
  next: page => page.getByTestId('shell-user-activator').locator('.user-avatar'),
}

/** Warning dot of the avatar badge. Its element is always in the DOM in legacy (`display: none` when off). */
export const avatarBadgeProbe: Probe = {
  key: 'avatar-badge',
  legacy: page => page.locator('.button-activator .user-dot-badge .v-badge__badge'),
  next: page => page.getByTestId('shell-user-activator').locator('.user-dot-badge .v-badge__badge'),
  internal: true,
}

export const adminActivatorProbe: Probe = {
  key: 'admin-activator',
  legacy: page => page.locator('.admin-area-btn'),
  next: page => page.getByTestId('shell-admin-activator'),
}

export const fabProbe: Probe = {
  key: 'fab',
  legacy: page => page.locator('.floating-button .v-btn'),
  next: page => page.getByTestId('shell-fab'),
  when: isMobile,
}

/** The FAB `$plus` icon: its colour is under the pixel threshold (see `addNewIconProbeFor`). */
export const fabIconProbe: Probe = {
  key: 'fab-icon',
  legacy: page => page.locator('.floating-button .v-btn .v-icon'),
  next: page => page.getByTestId('shell-fab').locator('.v-icon'),
  when: isMobile,
  internal: true,
}

export const footerProbe: Probe = {
  key: 'footer',
  legacy: page => page.locator('footer'),
  next: page => page.getByTestId('shell-footer'),
}

/** Same pair as the login screen: legacy `#languageSwitcher`, next's kit `language-activator` (one switcher on a shell screen). */
export const languageActivatorProbe: Probe = {
  key: 'language-activator',
  legacy: page => page.locator('#languageSwitcher').getByRole('button'),
  next: page => page.getByTestId('language-activator'),
}

export const trialInfoProbe: Probe = {
  key: 'alert-header',
  legacy: page => page.locator('.alert-header'),
  next: page => page.getByTestId('shell-trial-info'),
}

export const trialModalProbe: Probe = {
  key: 'trial-modal',
  legacy: page => page.locator('.v-dialog__content--active .basic-modal'),
  next: page => page.getByTestId('shell-trial-modal'),
}

/** The open menu's content box and its first item. `kind` is the next test id prefix (`shell-<kind>-menu`). */
export function openMenuProbes (kind: string, firstItem: { legacy: string, nextId?: string }): Probe[] {
  return [
    {
      key: `${kind}-menu`,
      legacy: page => page.locator(MENU_OPEN),
      next: page => page.getByTestId(`shell-${kind}-menu`),
    },
    {
      key: `${kind}-menu-first-item`,
      legacy: page => page.locator(`${MENU_OPEN} ${firstItem.legacy}`).first(),
      next: page => page.getByTestId(firstItem.nextId ?? `shell-${kind}-menu-first-item`),
      internal: true,
    },
  ]
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** Waits for the menu content to be open and still, then makes V2 measure its position again (see login-language-menu). */
export async function settleLegacyMenu (page: Page, selector = MENU_OPEN): Promise<void> {
  await settled(page.locator(selector))
  await page.evaluate(async () => {
    await Promise.all([...document.querySelectorAll<HTMLImageElement>('img')].map(image => image.decode().catch(() => undefined)))
    await document.fonts.ready
    window.dispatchEvent(new Event('resize'))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

export function openLegacyMenu (activator: (page: Page) => ReturnType<Page['locator']>): StateAction {
  return async page => {
    await activator(page).click()
    await settleLegacyMenu(page)
  }
}

/**
 * Next renders none of the shell yet, and a Playwright action has no timeout of its own: clicking an element that is not
 * there would hang until the test timeout. An element still absent after a short wait is reported by its probe as
 * `missing` (and by the pixel diff) instead of failing the state with a harness error.
 */
export async function whenPresent (locator: Locator, action: () => Promise<void>): Promise<void> {
  try {
    await locator.waitFor({ state: 'visible', timeout: 3000 })
  } catch {
    return
  }
  await action()
}

export function openNextMenu (activatorId: string, menuId: string): StateAction {
  return async page => {
    const activator = page.getByTestId(activatorId)
    await whenPresent(activator, async () => {
      await activator.click()
      await settled(page.getByTestId(menuId))
    })
  }
}

export const legacyUserActivator = (page: Page) => page.locator('.navbar__menu-items .button-activator')
export const legacyBellActivator = (page: Page) => page.locator('.navbar__menu-items .v-btn--icon')
export const legacyAdminActivator = (page: Page) => page.locator('.admin-area-btn')

// ---------------------------------------------------------------------------------------------
// State skeleton
// ---------------------------------------------------------------------------------------------

export interface ShellStateOptions {
  home?: ShellHomeOptions
  notifications?: NotificationFixture[]
  clock?: string
  /** Steps after load (open a menu, close a modal). */
  legacy?: StateAction[]
  next?: StateAction[]
  /** Probes after the app bar, logo and tabs, which every state has. */
  probes?: Probe[]
  /** `probeKey` renames the probe (next's test id stays `shell-tab-<key>`): the lite list tab is `my-projects`. */
  tabs?: Array<{ key: TabKey, copyKey?: string, probeKey?: string }>
  /** `false` drops the slider probe, which follows `activeTab` (no navbar tab is active off the tab routes, e.g. `/my-account`). Default `true`. */
  tabSlider?: boolean
  pointer?: ParityState['pointer']
  /** Default `lite` on `/projects` (M-2: app-lite is the source of truth), with the lite copy and the `GET /projects` list; `app` on `/instances` only when set. */
  target?: LegacyTarget
  path?: string
  masks?: ParityState['masks']
  /** The tab the routed screen activates (its slider is probed). Default `my-instances`. */
  activeTab?: TabKey
}

/** Everything a shell state shares: signed in, `/instances` (an empty list: the real `InstanceNoData` in both apps), the common frame probes. `id` stays a literal in the spec file. */
/** The routed `/projects` content belongs to S-09 phase 5: it is masked in both apps, the frame is measured. */
export const liteContentMasks = {
  legacy: [(page: Page) => page.locator('.v-main')],
  next: [(page: Page) => page.locator('.v-main')],
}

export function shellState (options: ShellStateOptions = {}): Omit<ParityState, 'id'> {
  const target = options.target ?? 'lite'
  const tabs: NonNullable<ShellStateOptions['tabs']> = options.tabs ?? (target === 'lite' ? [...liteTabs] : [{ key: 'my-instances' }])
  const masks = options.masks ?? (target === 'lite' ? liteContentMasks : undefined)
  return {
    path: options.path ?? (target === 'lite' ? '/projects' : '/instances'),
    target,
    ...(masks === undefined ? {} : { masks }),
    signedIn: true,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    // Lite base is the Community panel fixture (`community_panel: true`, `hub_paired: false`); the user has hosting access like the lite deploy.
    home: shellHome(target === 'lite' ? { ...options.home, user: { has_hosting_access: true, ...options.home?.user } } : options.home),
    handlers: shellHandlers(options.notifications, target === 'lite' ? 'projects' : 'instances'),
    actions: {
      legacy: options.legacy ?? [],
      next: options.next ?? [],
    },
    ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
    probes: [
      appBarProbe,
      logoProbe,
      ...tabs.map(tab => tabProbe(tab.key, tab.copyKey, target, tab.probeKey)),
      ...(options.tabSlider === false
        ? []
        : [options.activeTab === undefined ? tabSliderProbe : tabSliderProbeFor(options.activeTab)]),
      addNewProbeFor(target),
      addNewIconProbeFor(target),
      bellProbe,
      userActivatorProbe,
      avatarProbe,
      fabProbe,
      fabIconProbe,
      footerProbe,
      languageActivatorProbe,
      ...(options.probes ?? []),
    ],
  }
}
