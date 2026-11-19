import type { ParityState } from './state'
import { readFileSync } from 'node:fs'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { liteTabs } from './shell'
import { errorAlertProbe, errorTextStillHovered, logoProbes, openDrawer, openFromBranding, openPrimaryPicker, pickerProbes, saveClick, saveLoaderMask, saveWithError, styleManagerState, tabHoverState, waitDrawerOpen, waitSaveLoading } from './style-manager'

// ui-style-manager (phases 7-8): the drawer open on `?branding` and the closed activator tab (phase 7), and the drawer
// with an uploaded light logo, dark logo and favicon (phase 8). Target lite (default).
// Each state id is a literal `id: '…',` line, which `registeredStateIds` in report/write-report.ts reads as text.

// Small PNGs from `public/` as `data:` URIs. PNG, not SVG: legacy renders SVG through `v-html`, next through `img` (D4).
const pngDataUri = (file: string) => `data:image/png;base64,${readFileSync(new URL(`../../public/${file}`, import.meta.url)).toString('base64')}`

export const styleManagerDefault: ParityState = {
  id: 'style-manager-default',
  ...styleManagerState({
    path: '/projects',
    localStorage: { '{origin}-style-manager': 'true' },
    legacy: [openDrawer('legacy')],
    next: [openDrawer('next')],
  }),
}

export const styleManagerClosed: ParityState = {
  id: 'style-manager-closed',
  ...styleManagerState({
    path: '/projects',
    localStorage: { '{origin}-style-manager': 'true' },
  }),
}

export const styleManagerLogos: ParityState = {
  id: 'style-manager-logos',
  ...styleManagerState({
    path: '/projects',
    localStorage: { '{origin}-style-manager': 'true' },
    app: {
      theme: {
        logo: pngDataUri('favicon-64.png'),
        darkLogo: pngDataUri('favicon-96.png'),
        favicon: pngDataUri('favicon-32.png'),
      },
    },
    probes: logoProbes,
    legacy: [openDrawer('legacy')],
    next: [openDrawer('next')],
  }),
}

// Hover on Save in the open drawer (phase 9): the button overlay probe from `buttonHoverState`.
export const styleManagerSaveHover: ParityState = {
  ...buttonHoverState(styleManagerDefault, 'style-manager-save-hover', 'button.saveChanges', 'lite'),
  id: 'style-manager-save-hover',
}

// Hover on the closed tab (phase 9). Desktop only: the tab is a pointer target there, not on mobile.
export const styleManagerTabHover: ParityState = {
  ...tabHoverState(styleManagerClosed),
  id: 'style-manager-tab-hover',
}

// Keyboard focus on Save in the open drawer (phase 10). `buttonFocusState` focuses the button itself (no Tab, lekcja „buttonFocusState nie używa Tab”).
export const styleManagerSaveFocus: ParityState = {
  ...buttonFocusState(styleManagerDefault, 'style-manager-save-focus', 'button.saveChanges', 'lite'),
  id: 'style-manager-save-focus',
}

// Save with a failing PUT (phase 11): 422 with `message` and `errors`, the alert shows the same text on both sides (`getErrorMessage`).
// The alert text is hovered so the 5 s timer does not close it before the capture.
export const styleManagerError: ParityState = {
  id: 'style-manager-error',
  ...styleManagerState({
    path: '/projects',
    localStorage: { '{origin}-style-manager': 'true' },
    handlers: {
      'PUT /settings/userapp-branding': {
        status: 422,
        json: { message: 'The given data was invalid.', errors: { primary: ['The primary color is invalid.'] } },
      },
    },
    probes: [errorAlertProbe],
    legacy: [openDrawer('legacy'), saveWithError('legacy')],
    next: [openDrawer('next'), saveWithError('next')],
  }),
  pointer: 'keep',
  afterCapture: {
    legacy: [errorTextStillHovered('legacy')],
    next: [errorTextStillHovered('next')],
  },
}

// Save with a PUT that hangs (phase 12): the button keeps its loader on both sides (`loading` in LITE `StyleManagerMenu.vue:150`; a loading
// primary button stays full with a white loader). The spinner is masked; the `save` probe measures the button.
export const styleManagerLoading: ParityState = {
  id: 'style-manager-loading',
  ...styleManagerState({
    path: '/projects',
    localStorage: { '{origin}-style-manager': 'true' },
    handlers: { 'PUT /settings/userapp-branding': 'hold' },
    legacy: [openDrawer('legacy'), saveClick('legacy'), waitSaveLoading('legacy')],
    next: [openDrawer('next'), saveClick('next'), waitSaveLoading('next')],
    masks: { legacy: [saveLoaderMask('legacy')], next: [saveLoaderMask('next')] },
  }),
}

// Primary colour picker menu open (phase 13): click on the `base` editor button, the menu with `v-color-picker` stays open (keepScroll).
export const styleManagerPickerOpen: ParityState = {
  id: 'style-manager-picker-open',
  ...styleManagerState({
    path: '/projects',
    localStorage: { '{origin}-style-manager': 'true' },
    probes: pickerProbes,
    keepScroll: true,
    legacy: [openDrawer('legacy'), openPrimaryPicker('legacy')],
    next: [openDrawer('next'), openPrimaryPicker('next')],
  }),
}

// Reseller drawer (phase 14): opened from the Branding page with `button.branding.manage`. No activator tab for a reseller (LITE
// `App.vue:7-8` mounts `<style-manager-menu reseller>`), so the `activator` probe is missing on both sides (the harness accepts that).
// The Branding page has its own `reseller-branding-*` states (S-123, `reseller-branding.parity.ts`); this state measures only the drawer
// opened from that page.
export const styleManagerReseller: ParityState = {
  id: 'style-manager-reseller',
  ...styleManagerState({
    path: '/reseller-area/branding',
    reseller: true,
    tabs: [liteTabs[0], { key: 'reseller-area' }],
    activeTab: 'reseller-area',
    handlers: {
      'GET /reseller/branding-settings': { json: { data: { brand_name: 'Acme Hosting', domain: '' } } },
    },
    legacy: [openFromBranding('legacy'), waitDrawerOpen('legacy')],
    next: [openFromBranding('next'), waitDrawerOpen('next')],
  }),
}

const states: ParityState[] = [styleManagerDefault, styleManagerClosed, styleManagerLogos, styleManagerSaveHover, styleManagerTabHover, styleManagerSaveFocus, styleManagerError, styleManagerLoading, styleManagerPickerOpen, styleManagerReseller]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(state.id.endsWith('-tab-hover') && testInfo.project.name.endsWith('mobile'), 'the closed tab hover is a desktop state')
    // ui-style-manager: lite target by default (shellState), drawer probes from style-manager.ts.
    await runState(browser, testInfo, state)
  })
}
