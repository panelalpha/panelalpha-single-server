import type { NotificationFixture } from './shell'
import type { ParityState, Probe } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { settled, tr } from './auth'
import {
  adminActivatorProbe,
  avatarBadgeProbe,
  bellUnreadDotProbe,
  isDesktop,
  legacyAdminActivator,
  legacyBellActivator,
  legacyUserActivator,
  liteTabs,
  NOW,
  openLegacyMenu,
  openMenuProbes,
  openNextMenu,
  settleLegacyMenu,
  shellState,
  singleServerHome,
  trialInfoProbe,
  trialModalProbe,
  trialService,
  whenPresent,
} from './shell'

// F-08 signed-in-shell. Every state is signed in on /instances with an empty list, so the routed view is the real
// `InstanceNoData` in both apps (S-09 removed the content pin). The probes measure the frame: app bar, tabs, Add new,
// bell, user menu, FAB, spacer, footer, trial box and modal.
// Each state id is a literal `id: '…',` line, which `registeredStateIds` in report/write-report.ts reads as text.

function notification (overrides: Partial<NotificationFixture> & Pick<NotificationFixture, 'id'>): NotificationFixture {
  return {
    type: 'instance_created',
    html: '<b>example.com</b> has been created.',
    readAt: NOW,
    minutesAgo: 5,
    ...overrides,
  }
}

const listItems: NotificationFixture[] = [
  notification({ id: 'n1', readAt: null, minutesAgo: 5 }),
  notification({ id: 'n2', type: 'backup_create_failed', html: 'Backup of <b>shop.example.com</b> has failed.', minutesAgo: 95 }),
  notification({ id: 'n3', type: 'plugin_updated', html: 'Plugin <b>Akismet</b> has been updated.', minutesAgo: 60 * 26 }),
]

const trialDangerClose = {
  legacy: [async (page: Page) => {
    // The expired-trial modal opens on load (cold start) and covers the frame: close it before capture.
    const modal = page.locator('.v-dialog__content--active .basic-modal')
    await settled(modal)
    await modal.getByRole('button', { name: tr('button.cancel'), exact: true }).click()
    await modal.waitFor({ state: 'hidden' })
  }],
  next: [async (page: Page) => {
    // Next has no modal until the trial phase. Waiting briefly instead of failing keeps the state a `missing` delta, not a harness error.
    const modal = page.getByTestId('shell-trial-modal')
    await whenPresent(modal, async () => {
      await modal.getByRole('button', { name: tr('button.cancel'), exact: true }).click()
      await modal.waitFor({ state: 'hidden' })
    })
  }],
}

export const shellDefault: ParityState = {
  id: 'shell-default',
  ...shellState(),
}

export const shellTabsAll: ParityState = {
  id: 'shell-tabs-all',
  ...shellState({
    home: { user: { has_hosting_access: true, reseller_settings: {} } },
    tabs: [liteTabs[0], { key: 'reseller-area' }],
  }),
}

export const shellLanguageMenuOpen: ParityState = {
  id: 'shell-language-menu-open',
  ...shellState({
    home: { app: { languages: ['en', 'de', 'fr'], language_flags: { en: 'GB', de: 'DE', fr: 'FR' } } },
    legacy: [async page => {
      // dispatchEvent, not click: on mobile the FAB sits on top of the footer's switcher, so a real click is intercepted.
      await page.locator('#languageSwitcher').getByRole('button').dispatchEvent('click')
      await settleLegacyMenu(page, '#languageSwitcher .v-menu__content')
    }],
    next: [async page => {
      const activator = page.getByTestId('language-activator')
      await whenPresent(activator, async () => {
        await activator.dispatchEvent('click')
        await settled(page.getByTestId('language-menu'))
      })
    }],
    probes: [
      {
        key: 'language-menu',
        legacy: page => page.locator('#languageSwitcher .v-menu__content'),
        next: page => page.getByTestId('language-menu'),
      },
      {
        key: 'language-menu-item',
        legacy: page => page.locator('#languageSwitcher .v-menu__content .v-list-item').first(),
        next: page => page.getByTestId('language-menu').locator('.v-list-item').first(),
        internal: true,
      },
    ],
  }),
}

export const shellUserMenuOpen: ParityState = {
  id: 'shell-user-menu-open',
  ...shellState({
    home: { app: { billing_enabled: true, support_link: 'https://example.com/support', theme: { style: { allowToChangeMode: true } } } },
    legacy: [openLegacyMenu(legacyUserActivator)],
    next: [openNextMenu('shell-user-activator', 'shell-user-menu')],
    probes: [
      ...openMenuProbes('user', { legacy: '.v-list-item' }),
      // Items below the first one sat 1px lower in next while the item boxes matched (triage harness-dark-seed, G4).
      {
        key: 'user-menu-item-title',
        legacy: page => page.locator('.v-menu__content.menuable__content__active .v-list-item__title').nth(1),
        next: page => page.getByTestId('shell-user-menu').locator('.v-list-item-title').nth(1),
        internal: true,
      },
      {
        key: 'user-menu-item-icon',
        legacy: page => page.locator('.v-menu__content.menuable__content__active .v-list-item__title').nth(1).locator('.v-icon'),
        next: page => page.getByTestId('shell-user-menu').locator('.v-list-item-title').nth(1).locator('.v-icon'),
        internal: true,
      },
    ],
  }),
}

// Free panel user menu (`community_panel: true`, `hub_paired: false`, no Admin Area): Tasks and Settings items with their warning dots,
// a running task lights the Tasks dot, the unpaired hub the Settings dot and the avatar badge.
function userMenuItemDot (copyKey: string): Pick<Probe, 'legacy' | 'next'> {
  return {
    legacy: page => page.locator('.v-menu__content.menuable__content__active .v-list-item', { hasText: tr(copyKey, 'lite') }).locator('.v-badge__badge'),
    next: page => page.getByTestId('shell-user-menu').locator('.v-list-item', { hasText: tr(copyKey, 'lite') }).locator('.v-badge__badge'),
  }
}

export const shellUserMenuFree: ParityState = {
  id: 'shell-user-menu-free',
  ...shellState({
    home: { app: { single_server: { active: true, has_running_tasks: true, has_uncompleted_imports: false } } },
    legacy: [openLegacyMenu(legacyUserActivator)],
    next: [openNextMenu('shell-user-activator', 'shell-user-menu')],
    probes: [
      avatarBadgeProbe,
      ...openMenuProbes('user', { legacy: '.v-list-item' }),
      { key: 'user-menu-tasks-dot', ...userMenuItemDot('general.tasks'), internal: true },
      { key: 'user-menu-settings-dot', ...userMenuItemDot('general.settings'), internal: true },
    ],
  }),
}

export const shellUserBadgeWarning: ParityState = {
  id: 'shell-user-badge-warning',
  ...shellState({
    home: {
      app: { billing_enabled: true },
      user: { services: [trialService({ expiresInDays: 10 })] },
    },
    clock: NOW,
    probes: [avatarBadgeProbe, trialInfoProbe],
  }),
}

export const shellNotificationsUnread: ParityState = {
  id: 'shell-notifications-unread',
  ...shellState({
    notifications: [notification({ id: 'n1', readAt: null })],
    clock: NOW,
    probes: [bellUnreadDotProbe],
  }),
}

export const shellNotificationsEmptyOpen: ParityState = {
  id: 'shell-notifications-empty-open',
  ...shellState({
    legacy: [openLegacyMenu(legacyBellActivator)],
    next: [openNextMenu('shell-bell', 'shell-notifications-menu')],
    probes: [
      ...openMenuProbes('notifications', { legacy: '.notifications-empty', nextId: 'shell-notifications-empty' }),
      // Empty-state illustration (Charge 2): colours come from `--v-illustrations-*`, so the dark variant measures them.
      {
        key: 'notifications-empty-illustration',
        legacy: page => page.locator('.v-menu__content.menuable__content__active .notifications-empty__img').first(),
        next: page => page.getByTestId('shell-notifications-empty').locator('.notifications-empty__img'),
        internal: true,
      },
    ],
  }),
}

export const shellNotificationsListOpen: ParityState = {
  id: 'shell-notifications-list-open',
  ...shellState({
    notifications: listItems,
    clock: NOW,
    legacy: [openLegacyMenu(legacyBellActivator)],
    next: [openNextMenu('shell-bell', 'shell-notifications-menu')],
    probes: openMenuProbes('notifications', { legacy: '.notification', nextId: 'shell-notification-first' }),
  }),
}

export const shellTrialWarning: ParityState = {
  id: 'shell-trial-warning',
  ...shellState({
    home: { user: { services: [trialService({ expiresInDays: 5 })] } },
    clock: NOW,
    probes: [trialInfoProbe],
  }),
}

export const shellTrialDanger: ParityState = {
  id: 'shell-trial-danger',
  ...shellState({
    home: { user: { services: [trialService({ expiresInDays: -3 })] } },
    clock: NOW,
    ...trialDangerClose,
    probes: [trialInfoProbe],
  }),
}

export const shellTrialExpiredModal: ParityState = {
  id: 'shell-trial-expired-modal',
  ...shellState({
    home: { user: { services: [trialService({ expiresInDays: -3 })] } },
    clock: NOW,
    legacy: [async page => {
      await settled(page.locator('.v-dialog__content--active .basic-modal'))
    }],
    probes: [trialModalProbe, trialInfoProbe],
  }),
}

// Non-Free single-server variant (`community_panel: false`, Admin Area activator). Lite target, `/projects` and the content mask are the
// `shellState` defaults. `singleServerHome` lives in shell.ts (Connect AI reuses it).
export const shellAdminDefault: ParityState = {
  id: 'shell-admin-default',
  ...shellState({
    home: singleServerHome(),
    probes: [adminActivatorProbe],
  }),
}

/** Desktop opens the admin menu on hover (and the activator is a link, so it is never clicked); smaller widths open it on click. */
const ADMIN_HOVER_MIN_WIDTH = 1216

const openAdminDropdown = {
  legacy: [async (page: Page) => {
    const activator = legacyAdminActivator(page)
    await (page.viewportSize()!.width >= ADMIN_HOVER_MIN_WIDTH ? activator.hover() : activator.click())
    await settleLegacyMenu(page)
  }],
  next: [async (page: Page) => {
    const activator = page.getByTestId('shell-admin-activator')
    await whenPresent(activator, async () => {
      await (page.viewportSize()!.width >= ADMIN_HOVER_MIN_WIDTH ? activator.hover() : activator.click())
      await settled(page.getByTestId('shell-admin-menu'))
    })
  }],
}

export const shellAdminDropdownOpen: ParityState = {
  id: 'shell-admin-dropdown-open',
  ...shellState({
    home: singleServerHome(),
    // The pointer has to stay on the activator: moving it to (0,0) would close a hover menu.
    pointer: 'keep',
    ...openAdminDropdown,
    probes: [adminActivatorProbe, ...openMenuProbes('admin', { legacy: '.v-list-item' })],
  }),
}

export const shellTasksRunning: ParityState = {
  id: 'shell-tasks-running',
  ...shellState({
    home: singleServerHome({ runningTasks: true }),
    pointer: 'keep',
    ...openAdminDropdown,
    probes: [
      adminActivatorProbe,
      // The red dot on the activator while a task runs.
      {
        key: 'admin-badge',
        legacy: page => page.locator('.admin-area-btn .v-badge__badge'),
        next: page => page.getByTestId('shell-admin-activator').locator('.v-badge__badge'),
        internal: true,
      },
      ...openMenuProbes('admin', { legacy: '.v-list-item' }),
      // The red dot of the Tasks item (a `v-badge` around the item title).
      {
        key: 'admin-tasks-dot',
        legacy: page => page.locator('.v-menu__content.menuable__content__active .v-list-item', { hasText: tr('appSingleServer.adminAreaDropdown.tasks', 'lite') }).locator('.v-badge__badge'),
        next: page => page.getByTestId('shell-admin-menu').locator('.v-list-item', { hasText: tr('appSingleServer.adminAreaDropdown.tasks', 'lite') }).locator('.v-badge__badge'),
        internal: true,
      },
    ],
  }),
}

// Hover of the frame buttons (matrix state `hover`, pattern of `buttonHoverState` in auth.ts). The pointer stays on the button
// (`pointer: 'keep'`), transitions are frozen, and the overlay probe compares V2 `::before` with V4 `.v-btn__overlay`.
// Add new is desktop-only (mobile has the FAB), so the hover step is skipped below the desktop width.
type Hoverable = (page: Page) => Locator

function hoverStep (target: Hoverable, onlyDesktop: boolean) {
  return async (page: Page) => {
    if (onlyDesktop && page.viewportSize()!.width < 976) {
      return
    }
    const button = target(page)
    await whenPresent(button, async () => {
      await button.hover()
    })
  }
}

function stillHoveredStep (target: Hoverable, onlyDesktop: boolean) {
  return async (page: Page) => {
    if (onlyDesktop && page.viewportSize()!.width < 976) {
      return
    }
    // The scroll reset before the probes could move the pointer off the button; both apps would then pass on an idle overlay.
    const button = target(page)
    if (await button.count() === 0) {
      return
    }
    expect(await button.evaluate(element => element.matches(':hover')), 'pointer on the button').toBe(true)
  }
}

const legacyAddNew: Hoverable = page => page.getByRole('button', { name: tr('button.addNew', 'lite'), exact: true })
const nextAddNew: Hoverable = page => page.getByTestId('shell-add-new')
const legacyBell: Hoverable = page => legacyBellActivator(page)
const nextBell: Hoverable = page => page.getByTestId('shell-bell')

export const shellAddNewHover: ParityState = {
  id: 'shell-add-new-hover',
  ...shellState({
    probes: [
      {
        key: 'add-new-overlay',
        legacy: legacyAddNew,
        next: page => nextAddNew(page).locator('.v-btn__overlay'),
        pseudo: { legacy: '::before' },
        when: isDesktop,
        internal: true,
      },
    ],
    pointer: 'keep',
    legacy: [hoverStep(legacyAddNew, true)],
    next: [hoverStep(nextAddNew, true)],
  }),
  afterCapture: { legacy: [stillHoveredStep(legacyAddNew, true)], next: [stillHoveredStep(nextAddNew, true)] },
}

export const shellBellHover: ParityState = {
  id: 'shell-bell-hover',
  ...shellState({
    probes: [
      {
        key: 'bell-overlay',
        legacy: legacyBell,
        next: page => nextBell(page).locator('.v-btn__overlay'),
        pseudo: { legacy: '::before' },
        internal: true,
      },
    ],
    pointer: 'keep',
    legacy: [hoverStep(legacyBell, false)],
    next: [hoverStep(nextBell, false)],
  }),
  afterCapture: { legacy: [stillHoveredStep(legacyBell, false)], next: [stillHoveredStep(nextBell, false)] },
}

// Hover of the Tasks item of the Admin Area menu (matrix state `hover`; the first legacy item is a shortcuts row hidden on desktop). The menu opens by hover on desktop and by click below 1216 px; the
// pointer then moves from the activator into the menu and stays on the item. The activator hover itself is the open-menu state.
const legacyAdminTasksItem: Hoverable = page => page.locator('.v-menu__content.menuable__content__active .v-list-item', { hasText: tr('appSingleServer.adminAreaDropdown.tasks', 'lite') })
const nextAdminTasksItem: Hoverable = page => page.getByTestId('shell-admin-menu').locator('.v-list-item', { hasText: tr('appSingleServer.adminAreaDropdown.tasks', 'lite') })

export const shellAdminItemHover: ParityState = {
  id: 'shell-admin-item-hover',
  ...shellState({
    home: singleServerHome(),
    pointer: 'keep',
    legacy: [...openAdminDropdown.legacy, hoverStep(legacyAdminTasksItem, false)],
    next: [...openAdminDropdown.next, hoverStep(nextAdminTasksItem, false)],
    probes: [adminActivatorProbe, ...openMenuProbes('admin', { legacy: '.v-list-item' })],
  }),
  afterCapture: { legacy: [stillHoveredStep(legacyAdminTasksItem, false)], next: [stillHoveredStep(nextAdminTasksItem, false)] },
}

// Keyboard focus of the frame (matrix state `focus-visible`). Unlike `buttonFocusState` (auth.ts, `.focus()`), the frame is reached
// with real Tab presses from the start of the page: the order of focus stops is part of the behaviour, so both apps use the SAME
// number of presses per target and side (`FOCUS_TAB_PRESSES`) and fail when the target is not the focused element after them.
// Add new is desktop-only (mobile has the FAB), so that step is skipped below the desktop width.
// KNOWN BEHAVIOUR DELTA (ui-shell, phase 12; written up in plan.md under phase 17): V2 makes each of the three lite tabs its own
// Tab stop, V4 `v-tabs` is one stop (roving tabindex, arrows move between tabs), so Add new / bell / avatar are 2 presses later
// in legacy. The counts differ ONLY by that group; the tab itself is reached after the same 2 presses (logo, first tab).
// The counts are measured per viewport width (the frame reorders below the desktop width: tabs move, Add new is replaced by the FAB).
const FOCUS_TAB_PRESSES = {
  legacy: {
    1440: { tab: 2, addNew: 5, bell: 6, user: 7 },
    960: { tab: 2, addNew: 5, bell: 5, user: 6 },
    375: { tab: 4, addNew: 0, bell: 2, user: 3 },
  },
  next: {
    1440: { tab: 2, addNew: 3, bell: 4, user: 5 },
    960: { tab: 2, addNew: 3, bell: 3, user: 4 },
    375: { tab: 4, addNew: 0, bell: 2, user: 3 },
  },
} as Record<'legacy' | 'next', Record<number, Record<'tab' | 'addNew' | 'bell' | 'user', number>>>
type FocusTarget = 'tab' | 'addNew' | 'bell' | 'user'

function tabToStep (target: Hoverable, name: FocusTarget, onlyDesktop: boolean, side: 'legacy' | 'next') {
  return async (page: Page) => {
    if (onlyDesktop && page.viewportSize()!.width < 976) {
      return
    }
    const element = target(page)
    await whenPresent(element, async () => {
      await page.mouse.move(0, 0)
      let presses = 0
      while (presses < 30 && !(await element.evaluate(node => node === document.activeElement))) {
        await page.keyboard.press('Tab')
        presses++
      }
      expect(presses, `Tab presses from page start to ${name} (${side}, ${page.viewportSize()!.width}px)`).toBe(FOCUS_TAB_PRESSES[side][page.viewportSize()!.width][name])
      expect(await element.evaluate(node => node.matches(':focus-visible')), 'keyboard focus').toBe(true)
    })
  }
}

function stillFocusedStep (target: Hoverable, onlyDesktop: boolean) {
  return async (page: Page) => {
    if (onlyDesktop && page.viewportSize()!.width < 976) {
      return
    }
    const element = target(page)
    if (await element.count() === 0) {
      return
    }
    expect(await element.evaluate(node => node === document.activeElement), 'element still focused').toBe(true)
  }
}

const legacyFirstTab: Hoverable = page => page.getByRole('tab', { name: tr('heading.navbar.tab.myProjects', 'lite'), exact: true })
const nextFirstTab: Hoverable = page => page.getByTestId('shell-tab-my-instances')
const legacyUser: Hoverable = page => legacyUserActivator(page)
const nextUser: Hoverable = page => page.getByTestId('shell-user-activator')

function focusState (id: string, name: FocusTarget, legacy: Hoverable, next: Hoverable, onlyDesktop: boolean, probe: Probe): ParityState {
  return {
    id,
    ...shellState({
      probes: [probe],
      pointer: 'keep',
      legacy: [tabToStep(legacy, name, onlyDesktop, 'legacy')],
      next: [tabToStep(next, name, onlyDesktop, 'next')],
    }),
    afterCapture: { legacy: [stillFocusedStep(legacy, onlyDesktop)], next: [stillFocusedStep(next, onlyDesktop)] },
  }
}

export const shellFocusVisibleTab: ParityState = focusState('shell-focus-visible-tab', 'tab', legacyFirstTab, nextFirstTab, false, {
  key: 'tab-focus',
  legacy: legacyFirstTab,
  next: nextFirstTab,
  internal: true,
})

export const shellFocusVisibleAddNew: ParityState = focusState('shell-focus-visible-add-new', 'addNew', legacyAddNew, nextAddNew, true, {
  key: 'add-new-overlay',
  legacy: legacyAddNew,
  next: page => nextAddNew(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  when: isDesktop,
  internal: true,
})

export const shellFocusVisibleBell: ParityState = focusState('shell-focus-visible-bell', 'bell', legacyBell, nextBell, false, {
  key: 'bell-overlay',
  legacy: legacyBell,
  next: page => nextBell(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
})

export const shellFocusVisibleUser: ParityState = focusState('shell-focus-visible-user', 'user', legacyUser, nextUser, false, {
  key: 'user-focus',
  legacy: legacyUser,
  next: nextUser,
  internal: true,
})

const states: ParityState[] = [
  shellDefault,
  shellTabsAll,
  shellLanguageMenuOpen,
  shellUserMenuOpen,
  shellUserMenuFree,
  shellUserBadgeWarning,
  shellNotificationsUnread,
  shellNotificationsEmptyOpen,
  shellNotificationsListOpen,
  shellTrialWarning,
  shellTrialDanger,
  shellTrialExpiredModal,
  shellAdminDefault,
  shellAdminDropdownOpen,
  shellTasksRunning,
  shellAddNewHover,
  shellBellHover,
  shellAdminItemHover,
  shellFocusVisibleTab,
  shellFocusVisibleAddNew,
  shellFocusVisibleBell,
  shellFocusVisibleUser,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    // M-2 ui-shell: no state of the frame is app-only, so every state carries its target (lite by default in `shellState`).
    await runState(browser, testInfo, state)
  })
}
