import type { ParityState, Probe, StateAction } from './state'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import { alertManagerProbe, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_INSTALLATION_DETAILS_ERROR, ADVANCED_PROJECT_ID, ADVANCED_SITE_NAME_INVALID, advancedActiveItemProbe, advancedFirstItemFocus, advancedFirstItemFocusProbes, advancedFirstItemProbe, advancedFrameHandlers, advancedFrameInstance, advancedFrameInstanceEmpty, advancedFrameInstanceTrial, advancedFrameInstanceWithoutRename, advancedFrameProbes, advancedInstallationCardProbe, advancedInstallationSkeletonProbe, advancedLastItemProbe, advancedScreenshotCardProbe, advancedScreenshotUnavailableProbe, advancedSecurityHover, advancedSecurityHoverProbes, advancedSelectedTabProbe, advancedSidebarListItems, advancedSidebarProbe, advancedSidebarTabs, advancedSiteCardProbe, advancedTitleProbe, liteNoHostingHome, noSingleServerHandlers, siteNameDisabledProbes, siteNameHeaderProbe } from './instance-advanced-frame'
import { liteShellHome } from './instances'
import { NOW } from './shell'

// S-89 ui-instance-advanced-frame: the Details page of a project inside the Advanced frame, measured on app-lite (`target: 'lite'`, M-2
// default). Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and
// probes: `instance-advanced-frame.ts`. Plan: context/changes/ui-instance-advanced-frame/plan.md ("Phase 6", "Stany parity").

/** Ready when the Details card and the sidebar are both on the page (the title is the first probe). Each app has its own sidebar hook. */
const waitForDetails = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(page => page.locator('.details-box').first()),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(page => page.locator('.details-box').first()),
  ],
}

// Phase 6: the Details page of a WordPress project with a screenshot and the installation details, on a single-server account.
export const instanceAdvancedFrameDefault: ParityState = {
  id: 'instance-advanced-frame-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/details`,
  signedIn: true,
  clock: NOW,
  home: liteShellHome(),
  handlers: advancedFrameHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForDetails,
  probes: advancedFrameProbes,
}

// Phase 7: the pointer rests on the Security item (the tab below `lgAndDown`): 12 px right, the title primary, the overlay painted. The
// item moves with a transition, so the capture waits for the computed padding (desktop only; the tab has no padding rule).
function hoverSecurity (app: 'legacy' | 'next'): StateAction {
  return async page => {
    const item = advancedSecurityHover[app](page)
    await item.hover()
    if ((page.viewportSize()?.width ?? 0) >= 976) {
      await expect(item).toHaveCSS('padding-left', '12px')
    }
  }
}

// The hover is final only while the pointer stays on the item: the scroll reset and the probes must not move it away.
function stillHovered (app: 'legacy' | 'next'): StateAction {
  return async page => {
    expect(await advancedSecurityHover[app](page).evaluate(element => element.matches(':hover')), 'pointer on the Security item').toBe(true)
  }
}

export const instanceAdvancedFrameHover: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-hover',
  target: 'lite',
  pointer: 'keep',
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, hoverSecurity('legacy')],
    next: [...instanceAdvancedFrameDefault.actions.next, hoverSecurity('next')],
  },
  probes: [...instanceAdvancedFrameDefault.probes, ...advancedSecurityHoverProbes],
  afterCapture: { legacy: [stillHovered('legacy')], next: [stillHovered('next')] },
}

// Phase 8: keyboard focus on the first item (Site details) after Tab from the top of the page: the overlay paints as the focus ring. The
// pointer rests away from the list (`pointer: 'keep'`, moved to the corner before the Tab presses). Tab presses until the item has the
// focus (the same DOM order on both apps); the item is then checked by its accessible name as a link.
function focusFirstItem (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    const item = advancedFirstItemFocus[app](page)
    for (let press = 0; press < 60; press += 1) {
      await page.keyboard.press('Tab')
      if (await item.evaluate(element => element.matches(':focus'))) {
        break
      }
    }
    const label = (await item.textContent())?.trim() ?? ''
    expect(label, 'accessible name of the first item').not.toBe('')
    // The item itself, not a role query by name: the top bar of the frame has a tab with the same text ("Project Details", General), which
    // made the role locator ambiguous below `lgAndDown`. The role differs by app (link / option / tab) and is not what is measured here.
    await expect(item).toBeFocused()
    expect(await item.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

// The focus is final only while nothing moves it: the scroll reset and the probes must leave it on the first item.
function stillFocused (app: 'legacy' | 'next'): StateAction {
  return async page => {
    expect(await advancedFirstItemFocus[app](page).evaluate(element => element.matches(':focus')), 'focus on the first item').toBe(true)
  }
}

export const instanceAdvancedFrameFocus: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-focus',
  target: 'lite',
  pointer: 'keep',
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, focusFirstItem('legacy')],
    next: [...instanceAdvancedFrameDefault.actions.next, focusFirstItem('next')],
  },
  probes: [...instanceAdvancedFrameDefault.probes, ...advancedFirstItemFocusProbes],
  afterCapture: { legacy: [stillFocused('legacy')], next: [stillFocused('next')] },
}

// Phase 9: the Site name editor of the card. Legacy opens it only on a privilege list without `wordpress.update_site_name` (the reversed
// check), so legacy gets `advancedFrameInstanceWithoutRename`. The new app opens it only with the key (change `project-details-rename`), so
// it gets the default instance through `handlersByApp.next`. The name is typed and submitted; the held PUT keeps the save in flight, so the field and both icons are disabled and the field
// shows its loading bar. The clock moves on before the click (lessons: a Vue 3 wrapper `@click` needs a later event time).
function submitSiteName (): StateAction {
  return async page => {
    await page.clock.setFixedTime(new Date(Date.parse(NOW) + 60_000))
    await page.locator('.info-panel__data--name').click()
    const field = page.locator('.info-panel__input input').first()
    await field.fill('Studio Shop')
    await field.press('Enter')
  }
}

// The new app answers the project with the default instance, which has the rename key.
const nextWithRename: ParityState['handlersByApp'] = {
  next: { [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: advancedFrameInstance } } },
}

// The save is in flight once the field is disabled (the editor is still open while `savingName` holds).
const savingSiteName = waitFor(page => page.locator('.info-panel__input input:disabled'))

export const instanceAdvancedFrameDisabled: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-disabled',
  target: 'lite',
  handlers: advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: advancedFrameInstanceWithoutRename } },
    [`PUT /projects/${ADVANCED_PROJECT_ID}/wordpress/site-name`]: 'hold',
  }),
  handlersByApp: nextWithRename,
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, submitSiteName(), savingSiteName],
    next: [...instanceAdvancedFrameDefault.actions.next, submitSiteName(), savingSiteName],
  },
  probes: [...instanceAdvancedFrameDefault.probes, ...siteNameDisabledProbes],
}

// Phase 10: the installation details answer 500, so the alert of the page shows (`alertManagerProbe`, captured before its 5 s close) and the
// Installation card keeps its empty rows. The rest of the page is the default state.
export const instanceAdvancedFrameError: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-error',
  target: 'lite',
  handlers: advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}/installation-details`]: ADVANCED_INSTALLATION_DETAILS_ERROR,
  }),
  probes: [...instanceAdvancedFrameDefault.probes, alertManagerProbe],
}

// Phase 11: the same save as phase 9, but the PUT answers 422 with the validation errors. The alert of the save shows them (its error markup
// is the same in both apps), the editor closes and the header keeps the old name. The clock moves on before the click, as in phase 9.
const siteNameErrorAlert = waitFor(page => page.locator('.alert-manager .alert--error'))

export const instanceAdvancedFrameNameError: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-name-error',
  target: 'lite',
  handlers: advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: advancedFrameInstanceWithoutRename } },
    [`PUT /projects/${ADVANCED_PROJECT_ID}/wordpress/site-name`]: ADVANCED_SITE_NAME_INVALID,
  }),
  handlersByApp: nextWithRename,
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, submitSiteName(), siteNameErrorAlert],
    next: [...instanceAdvancedFrameDefault.actions.next, submitSiteName(), siteNameErrorAlert],
  },
  probes: [...instanceAdvancedFrameDefault.probes, alertManagerProbe, siteNameHeaderProbe],
}

// Phase 12: the project has no screenshot (the card shows the not-available placeholder) and the minimal privileges: the sidebar keeps Details
// and Security only, and the Installation card is absent (its probe is missing on both apps). The count is the fixture check: the same two
// items on both apps, on the desktop list or the tabs below `lgAndDown`.
function countSidebarItems (app: 'legacy' | 'next'): StateAction {
  return async page => {
    const items = (page.viewportSize()?.width ?? 0) >= 976 ? advancedSidebarListItems[app](page) : advancedSidebarTabs[app](page)
    expect(await items.count(), 'items of the sidebar').toBe(2)
  }
}

export const instanceAdvancedFrameEmpty: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-empty',
  target: 'lite',
  handlers: advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: advancedFrameInstanceEmpty } },
  }),
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, countSidebarItems('legacy')],
    next: [...instanceAdvancedFrameDefault.actions.next, countSidebarItems('next')],
  },
  probes: [
    advancedTitleProbe,
    advancedSidebarProbe,
    advancedFirstItemProbe,
    advancedLastItemProbe,
    advancedActiveItemProbe,
    advancedSelectedTabProbe,
    advancedSiteCardProbe,
    advancedScreenshotUnavailableProbe,
    advancedInstallationCardProbe,
  ],
}

// Phase 13: the installation details request hangs (`'hold'`), so the Installation card keeps its skeleton over the rest of the default page.
// The readiness anchor is the skeleton text row (the Site card is ready on the `.details-box` wait of the default page). The skeleton's
// animation is not masked here: whether it needs a mask (as `nsSpinnerMasks`, `hosting.ts`) is decided from the first measurement.
const installationSkeletonWait = waitFor(page => page.locator('.v-skeleton-loader__text').first())

export const instanceAdvancedFrameLoading: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-loading',
  target: 'lite',
  handlers: advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}/installation-details`]: 'hold',
  }),
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, installationSkeletonWait],
    next: [...instanceAdvancedFrameDefault.actions.next, installationSkeletonWait],
  },
  probes: [
    advancedTitleProbe,
    advancedSidebarProbe,
    advancedFirstItemProbe,
    advancedLastItemProbe,
    advancedActiveItemProbe,
    advancedSelectedTabProbe,
    advancedSiteCardProbe,
    advancedScreenshotCardProbe,
    advancedInstallationSkeletonProbe,
  ],
}

// Phase 14: no single-server. The seven hosting sections are not in the sidebar on either app (`advancedSidebarItems`, `singleServer`). The
// count of the list is checked by its titles (`heading.hosting.*.title`, the sections of `ADVANCED_HOSTING_SECTIONS`), on the desktop list or
// the tabs. The Details item stays, so the locator is not empty.
const HOSTING_SECTION_TITLE_KEYS = [
  'heading.hosting.fileManager.title',
  'heading.hosting.domains.title',
  'heading.hosting.ftp.title',
  'heading.hosting.sftp.title',
  'heading.hosting.databases.title',
  'heading.hosting.cron.title',
  'heading.hosting.containers.title',
]

function escapeRegExp (text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

function noHostingSidebar (app: 'legacy' | 'next'): StateAction {
  return async page => {
    const items = (page.viewportSize()?.width ?? 0) >= 976 ? advancedSidebarListItems[app](page) : advancedSidebarTabs[app](page)
    expect(await items.count(), 'items of the sidebar').toBeGreaterThan(0)
    for (const key of HOSTING_SECTION_TITLE_KEYS) {
      const title = tr(key, 'lite')
      const exact = new RegExp(String.raw`^\s*${escapeRegExp(title)}\s*$`)
      expect(await items.filter({ hasText: exact }).count(), `"${title}" in the sidebar`).toBe(0)
    }
  }
}

export const instanceAdvancedFrameNoHosting: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-no-hosting',
  target: 'lite',
  home: liteNoHostingHome(),
  handlers: noSingleServerHandlers(instanceAdvancedFrameDefault.handlers ?? {}),
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, noHostingSidebar('legacy')],
    next: [...instanceAdvancedFrameDefault.actions.next, noHostingSidebar('next')],
  },
  // The screenshot column is absent (`speedCardsEnabled` is false), so its probe is left out, as in the empty state.
  probes: [
    advancedTitleProbe,
    advancedSidebarProbe,
    advancedFirstItemProbe,
    advancedLastItemProbe,
    advancedActiveItemProbe,
    advancedSelectedTabProbe,
    advancedSiteCardProbe,
    advancedInstallationCardProbe,
  ],
}

// Phase 14: the plan row of a trial. The row takes the trial colour (next `details--expires` on the row, legacy `orange--text` on the value)
// and the Upgrade button shows with the plan link.
const trialPlanRow: Probe = {
  key: 'trial-plan-row',
  legacy: page => page.locator('.details-box .details').first(),
  next: page => page.locator('.details-box .details').first(),
}

const UPGRADE_HREF = 'https://upgrade.example.com/plan'

function expectTrialPlan (app: 'legacy' | 'next'): StateAction {
  return async page => {
    const row = page.locator('.details-box .details').first()
    await (app === 'legacy' ? expect(row.locator('.orange--text').first(), 'trial colour of the plan value').toBeVisible() : expect(row, 'trial class of the plan row').toHaveClass(/details--expires/))
    expect(await page.locator(`.details-box a[href="${UPGRADE_HREF}"]`).count(), 'upgrade button').toBe(1)
  }
}

export const instanceAdvancedFrameTrial: ParityState = {
  ...instanceAdvancedFrameDefault,
  id: 'instance-advanced-frame-trial',
  target: 'lite',
  handlers: advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: advancedFrameInstanceTrial } },
  }),
  actions: {
    legacy: [...instanceAdvancedFrameDefault.actions.legacy, expectTrialPlan('legacy')],
    next: [...instanceAdvancedFrameDefault.actions.next, expectTrialPlan('next')],
  },
  probes: [...instanceAdvancedFrameDefault.probes, trialPlanRow],
}

const states: ParityState[] = [instanceAdvancedFrameDefault, instanceAdvancedFrameHover, instanceAdvancedFrameFocus, instanceAdvancedFrameDisabled, instanceAdvancedFrameError, instanceAdvancedFrameNameError, instanceAdvancedFrameEmpty, instanceAdvancedFrameLoading, instanceAdvancedFrameNoHosting, instanceAdvancedFrameTrial]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
