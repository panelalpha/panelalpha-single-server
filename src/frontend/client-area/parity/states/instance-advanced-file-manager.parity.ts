import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { FTP_PROJECT_HOME } from './ftp'
import { fileManagerBoxProbe, fileManagerColumnProbe, fileManagerHandlers, fileManagerMasks, fileManagerWpCloudProbes, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { ADVANCED_PROJECT_ID, advancedActiveItemProbe, advancedFirstItemFocus, advancedFirstItemFocusProbes, advancedFrameHandlers, advancedFrameInstance, advancedSecurityHover, advancedSecurityHoverProbes } from './instance-advanced-frame'
import { NOW } from './shell'

// S-111 ui-file-manager: the File Manager screen in the Advanced tab of a project (`/projects/:id/advanced/file-manager`), measured on
// app-lite (`target: 'lite'`, M-2 default). The fm content is masked in both apps (legacy iframe `/fm/`, stubbed blank by the driver;
// next's native file manager). Each state id is a literal `id: '…',` line, which `registeredStates` in
// report/write-report.ts reads as text. Plan: context/changes/ui-file-manager/plan.md ("Phase 3").

/** Ready when the Advanced sidebar and the fm box are both on the page (the title is the first probe). Each app has its own hook. */
const waitForFileManager = {
  legacy: [
    waitFor(page => page.locator('.sticky-sidebar').first()),
    waitFor(page => page.locator('.v-main iframe.file-manager')),
  ],
  next: [
    waitFor(page => page.getByTestId('advanced-sidebar')),
    waitFor(page => page.getByTestId('file-manager')),
  ],
}

/** The page title of the project frame (`h4.page-title__title`, `FileManagerView` project variant on next). Local: `fileManagerTitleProbe` targets the hosting header. */
const projectTitleProbe: Probe = {
  key: 'file-manager-title',
  legacy: page => page.locator('.v-main h4.page-title__title'),
  next: page => page.getByTestId('file-manager-title'),
}

// Phase 3: the File Manager of the project with one account (`hostingId` 1 in the instance fixture). The fm card is masked, so only the
// frame, the title and the active sidebar item are compared. `FTP_PROJECT_HOME` is the lite `/home` without `admin` (no style manager).
export const instanceAdvancedFileManagerDefault: ParityState = {
  id: 'file-manager-default',
  target: 'lite',
  path: `/projects/${ADVANCED_PROJECT_ID}/advanced/file-manager`,
  signedIn: true,
  clock: NOW,
  home: FTP_PROJECT_HOME,
  handlers: advancedFrameHandlers(fileManagerHandlers([1])),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  masks: fileManagerMasks,
  actions: waitForFileManager,
  probes: [projectTitleProbe, fileManagerBoxProbe, fileManagerColumnProbe, advancedActiveItemProbe],
}

// Below `lgAndDown` the Advanced sidebar is a row of tabs that is scrolled to the selected one (File Manager), so the first and the Security
// tabs are outside the viewport on both apps (measured, gate 2, light-mobile). Hover and focus there use the tab right after the selected one
// (Domains), the same element on both apps and inside the viewport.
const isNarrow = (page: Page): boolean => (page.viewportSize()?.width ?? 0) < 976
const tabAfterSelected: Record<'legacy' | 'next', (page: Page) => Locator> = {
  legacy: page => page.locator('.sticky-sidebar .v-tab--active').locator('xpath=following-sibling::*[1]'),
  next: page => page.locator('[data-testid^="advanced-tab-"][aria-selected="true"]').locator('xpath=following-sibling::*[1]'),
}

// Phase 4: the pointer rests on the Security item of the Advanced sidebar (the tab below `lgAndDown`), the same action as the frame's hover
// state. The fm card stays masked; the hover of its rows is measured by e2e (phase 8), not here.
function hoverSecurity (app: 'legacy' | 'next'): StateAction {
  return async page => {
    const item = isNarrow(page) ? tabAfterSelected[app](page) : advancedSecurityHover[app](page)
    await item.hover()
    if ((page.viewportSize()?.width ?? 0) >= 976) {
      await expect(item).toHaveCSS('padding-left', '12px')
    }
  }
}

// The hover is final only while the pointer stays on the item: the scroll reset and the probes must not move it away.
function stillHovered (app: 'legacy' | 'next'): StateAction {
  return async page => {
    // The narrow variant is a touch viewport, where `:hover` is not retained (measured, gate 2): the check covers the desktop item only.
    if (isNarrow(page)) {
      return
    }
    expect(await advancedSecurityHover[app](page).evaluate(element => element.matches(':hover')), 'pointer on the Security item').toBe(true)
  }
}

export const instanceAdvancedFileManagerHover: ParityState = {
  ...instanceAdvancedFileManagerDefault,
  id: 'file-manager-hover',
  target: 'lite',
  pointer: 'keep',
  // The mobile tab is scrolled into view by the hover; the scroll reset would move it from under the pointer.
  keepScroll: true,
  actions: {
    legacy: [...instanceAdvancedFileManagerDefault.actions.legacy, hoverSecurity('legacy')],
    next: [...instanceAdvancedFileManagerDefault.actions.next, hoverSecurity('next')],
  },
  probes: [...instanceAdvancedFileManagerDefault.probes, ...advancedSecurityHoverProbes],
  afterCapture: { legacy: [stillHovered('legacy')], next: [stillHovered('next')] },
}

// Phase 4: keyboard focus on the first item of the Advanced sidebar (Site details) after Tab from the top of the page: the overlay paints as
// the focus ring. The pointer rests in the corner (`pointer: 'keep'`). The Tab presses stop once the item has the focus.
function focusFirstItem (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    const item = isNarrow(page) ? tabAfterSelected[app](page) : advancedFirstItemFocus[app](page)
    if (isNarrow(page)) {
      // The V4 tabs keep a roving tabindex (only the selected tab is tabbable), V2 tabs are all tabbable. One Tab sets the keyboard
      // modality, then the same tab is focused directly on both apps.
      await page.keyboard.press('Tab')
      await item.focus()
    }
    for (let press = 0; press < (isNarrow(page) ? 0 : 60); press += 1) {
      await page.keyboard.press('Tab')
      if (await item.evaluate(element => element.matches(':focus'))) {
        break
      }
    }
    const label = (await item.textContent())?.trim() ?? ''
    expect(label, 'accessible name of the first item').not.toBe('')
    await expect(item).toBeFocused()
    expect(await item.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

// The focus is final only while nothing moves it: the scroll reset and the probes must leave it on the first item.
function stillFocused (app: 'legacy' | 'next'): StateAction {
  return async page => {
    expect(await (isNarrow(page) ? tabAfterSelected[app](page) : advancedFirstItemFocus[app](page)).evaluate(element => element.matches(':focus')), 'focus on the item').toBe(true)
  }
}

export const instanceAdvancedFileManagerFocus: ParityState = {
  ...instanceAdvancedFileManagerDefault,
  id: 'file-manager-focus-visible',
  target: 'lite',
  pointer: 'keep',
  actions: {
    legacy: [...instanceAdvancedFileManagerDefault.actions.legacy, focusFirstItem('legacy')],
    next: [...instanceAdvancedFileManagerDefault.actions.next, focusFirstItem('next')],
  },
  probes: [...instanceAdvancedFileManagerDefault.probes, ...advancedFirstItemFocusProbes],
  afterCapture: { legacy: [stillFocused('legacy')], next: [stillFocused('next')] },
}

// `file-manager-empty` (project in diagnostic mode) is N/A: legacy `views/instance/index.vue:289-296` alerts and redirects a project with
// `diagnostic_mode` to the project list, so the screen is never shown (parity attempt 0, `parity/attempts.md`). `FileManagerView.test.ts` covers it.

// Phase 5: the project of a WP Cloud server. The alert sits in the header of the project variant too (`FileManagerView.vue`
// `isWpCloud(service)`), above the masked card. The fm request errors stay under the mask (e2e, phase 9).
const wpCloudInstance = { ...advancedFrameInstance, hosting_server_type: 'wp-cloud' }

export const instanceAdvancedFileManagerError: ParityState = {
  ...instanceAdvancedFileManagerDefault,
  id: 'file-manager-error',
  target: 'lite',
  handlers: { ...instanceAdvancedFileManagerDefault.handlers, [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: wpCloudInstance } } },
  probes: [...instanceAdvancedFileManagerDefault.probes, ...fileManagerWpCloudProbes],
}

const states: ParityState[] = [
  instanceAdvancedFileManagerDefault,
  instanceAdvancedFileManagerHover,
  instanceAdvancedFileManagerFocus,
  instanceAdvancedFileManagerError,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
