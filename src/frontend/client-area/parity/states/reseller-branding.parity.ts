import type { ParityState } from './state'
import type { Locator, Page } from '@playwright/test'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { tr } from './auth'
import {
  addressMask,
  BRAND_DOMAIN,
  brandingButtonFocusState,
  brandingButtonHoverState,
  brandingCopyIconProbe,
  brandingDnsProbes,
  brandingFieldProbe,
  brandingInputProbe,
  brandingManageButton,
  brandingSaveButton,
  brandingSaveSpinnerMasks,
  brandingSettings,
  brandingSkeletonMasks,
  brandingSkeletonProbe,
  brandingTooltipCopiedProbe,
  brandingTooltipProbe,
  clickNameRow,
  clickSave,
  hoverNameRow,
  hoverResellerSuccessAlert,
  nameRowStillHovered,
  resellerBrandingState,
  waitForBrandingSaveSpinner,
} from './reseller-branding'
import { hoverResellerErrorAlert, resellerAlertProbe } from './reseller-users'
import { focusButton } from './sftp'

// S-123 ui-reseller-branding, measured on app-lite (`target: 'lite'`, M-2 default): the Reseller Area frame and the Branding page.
// Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Builder and probes: `reseller-branding.ts`. Plan: context/changes/ui-reseller-branding/plan.md.

// Phase 6: the default state, the frame and the Branding card with no domain (the DNS Record card is hidden).
export const resellerBrandingDefault: ParityState = {
  id: 'reseller-branding-default',
  ...resellerBrandingState(),
}

// Phase 6: a saved domain shows the DNS Record card (second title, info alert, the gray well with three CNAME rows). The Address value is
// the app's own host, so it is masked in both apps.
export const resellerBrandingDomain: ParityState = {
  id: 'reseller-branding-domain',
  ...resellerBrandingState({
    handlers: { 'GET /reseller/branding-settings': brandingSettings({ domain: BRAND_DOMAIN }) },
    probes: brandingDnsProbes,
    masks: [addressMask],
  }),
}

// Phase 7: hover of the Name row (on the domain state): the copy icon and the "Copy" tooltip. The pointer stays on the row for the capture.
export const resellerBrandingHover: ParityState = {
  id: 'reseller-branding-hover',
  ...resellerBrandingState({
    handlers: { 'GET /reseller/branding-settings': brandingSettings({ domain: BRAND_DOMAIN }) },
    probes: [...brandingDnsProbes, brandingCopyIconProbe, brandingTooltipProbe],
    masks: [addressMask],
    legacy: [hoverNameRow(false)],
    next: [hoverNameRow(true)],
  }),
  pointer: 'keep',
  // On mobile the Name row is below the fold; the scroll reset after the capture would move another element under the pointer.
  keepScroll: true,
  afterCapture: { legacy: [nameRowStillHovered], next: [nameRowStillHovered] },
}

// Phase 7: a click on the Name row copies the domain (clipboard stub) and the tooltip reads "Copied". The pointer stays on the row.
export const resellerBrandingCopied: ParityState = {
  id: 'reseller-branding-copied',
  ...resellerBrandingState({
    handlers: { 'GET /reseller/branding-settings': brandingSettings({ domain: BRAND_DOMAIN }) },
    probes: [...brandingDnsProbes, brandingCopyIconProbe, brandingTooltipCopiedProbe],
    masks: [addressMask],
    legacy: [clickNameRow(false)],
    next: [clickNameRow(true)],
  }),
  pointer: 'keep',
  keepScroll: true,
  afterCapture: { legacy: [nameRowStillHovered], next: [nameRowStillHovered] },
}

// Phase 8: hover of the two main buttons on the default state (matrix state `hover`). Save sits below the fold on mobile, so it keeps the scroll.
export const resellerBrandingManageHover: ParityState = {
  ...brandingButtonHoverState(resellerBrandingDefault, 'reseller-branding-manage-hover', brandingManageButton),
  id: 'reseller-branding-manage-hover',
}

export const resellerBrandingSaveHover: ParityState = {
  ...brandingButtonHoverState(resellerBrandingDefault, 'reseller-branding-save-hover', brandingSaveButton),
  id: 'reseller-branding-save-hover',
  keepScroll: true,
}

// Phase 9: keyboard focus of the Manage Styles button (matrix state `focus-visible`), located in `.v-main` (the drawer has its own buttons).
export const resellerBrandingFocus: ParityState = brandingButtonFocusState(resellerBrandingDefault, 'reseller-branding-focus', brandingManageButton)

// Phase 9: keyboard focus of the Brand Name input (the field's focus outline). The field's placeholder is found in `.v-main` only.
const brandNameInput = (page: Page): Locator => page.locator('.v-main').getByPlaceholder(tr('reseller.brandName.placeholder', 'lite'))

export const resellerBrandingFieldFocus: ParityState = {
  ...resellerBrandingDefault,
  id: 'reseller-branding-field-focus',
  pointer: 'keep',
  actions: {
    legacy: [...resellerBrandingDefault.actions.legacy, focusButton(brandNameInput)],
    next: [...resellerBrandingDefault.actions.next, focusButton(brandNameInput)],
  },
  // No outline probe: V2 paints the ring on `<fieldset>` (2px border, sticks out 5px for the legend), V4 on `.v-field__outline` (no border,
  // the border is on its start/notch/end parts), so the geometry of the two elements differs by construction. The ring colour and shadow
  // are measured by the `reseller-branding-field` probe and the pixel diff.
  probes: resellerBrandingDefault.probes,
}

// Phase 10: the GET fails with 500. The fields stay empty, and the error alert shows; the pointer rests on the alert text.
export const resellerBrandingError: ParityState = {
  id: 'reseller-branding-error',
  ...resellerBrandingState({
    handlers: { 'GET /reseller/branding-settings': { status: 500, json: { message: 'Server Error' } } },
    // The input renders before the GET answers (legacy shows the field until `fetchSettings` sets `fetching`), so the alert is the anchor.
    ready: page => page.locator('.alert-manager .alert--error').first(),
    probes: [resellerAlertProbe],
    legacy: [hoverResellerErrorAlert],
    next: [hoverResellerErrorAlert],
  }),
  pointer: 'keep',
}

// Phase 10: the PUT fails with 500 after Save Changes; the error alert shows and the pointer rests on its text.
export const resellerBrandingSaveError: ParityState = {
  id: 'reseller-branding-save-error',
  ...resellerBrandingState({
    handlers: { 'PUT /reseller/branding-settings': { status: 500, json: { message: 'Server Error' } } },
    probes: [resellerAlertProbe],
    legacy: [clickSave(false), hoverResellerErrorAlert],
    next: [clickSave(true), hoverResellerErrorAlert],
  }),
  pointer: 'keep',
}

// Phase 10: a successful PUT after Save Changes; the success alert shows and the pointer rests on its text.
export const resellerBrandingSaved: ParityState = {
  id: 'reseller-branding-saved',
  ...resellerBrandingState({
    probes: [resellerAlertProbe],
    legacy: [clickSave(false), hoverResellerSuccessAlert],
    next: [clickSave(true), hoverResellerSuccessAlert],
  }),
  pointer: 'keep',
}

// Phase 11: the GET answers an empty brand name, so both inputs are empty and show their placeholders (no domain, no DNS card).
export const resellerBrandingEmpty: ParityState = {
  id: 'reseller-branding-empty',
  ...resellerBrandingState({
    handlers: { 'GET /reseller/branding-settings': brandingSettings({ brand_name: '' }) },
  }),
}

// Phase 11: the GET hangs (`'hold'`), so both fields keep their skeleton bones. The fields and inputs do not render, so their probes are
// left out; the first skeleton is the readiness anchor and the bones are masked.
export const resellerBrandingLoading: ParityState = {
  id: 'reseller-branding-loading',
  ...resellerBrandingState({
    handlers: { 'GET /reseller/branding-settings': 'hold' },
    ready: brandingSkeletonProbe.next,
    skipProbes: [brandingFieldProbe, brandingInputProbe],
    probes: [brandingSkeletonProbe],
  }),
  masks: brandingSkeletonMasks,
}

// Phase 11: the PUT hangs (`'hold'`) after Save Changes, so the Save button shows its spinner (`:loading="submitting"`). The spinner is
// masked; the button itself is probed.
export const resellerBrandingSaveLoading: ParityState = {
  id: 'reseller-branding-save-loading',
  ...resellerBrandingState({
    handlers: { 'PUT /reseller/branding-settings': 'hold' },
    legacy: [clickSave(false), waitForBrandingSaveSpinner(false)],
    next: [clickSave(true), waitForBrandingSaveSpinner(true)],
  }),
  masks: brandingSaveSpinnerMasks,
}

const states: ParityState[] = [
  resellerBrandingDefault,
  resellerBrandingDomain,
  resellerBrandingHover,
  resellerBrandingCopied,
  resellerBrandingManageHover,
  resellerBrandingSaveHover,
  resellerBrandingFocus,
  resellerBrandingFieldFocus,
  resellerBrandingError,
  resellerBrandingSaveError,
  resellerBrandingSaved,
  resellerBrandingEmpty,
  resellerBrandingLoading,
  resellerBrandingSaveLoading,
]

// The legacy mobile capture of `domain` never settles: two frames alternate, 15 pixels apart on the rounded corners of the gray well (1 level
// of anti-aliasing, the same with the mask removed, with the scroll kept and with the pointer kept; a raster difference of the legacy page,
// not of the state). `hover` and `copied` measure the same card on light-mobile and the Address row wraps there (host of the deploy vs
// `localhost`), so the DNS card is still compared on mobile.
const notInVariant: Record<string, string[]> = {
  'reseller-branding-domain': ['light-mobile'],
}

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(notInVariant[state.id]?.includes(testInfo.project.name) ?? false, 'the legacy capture does not settle (well corners flicker)')
    await runState(browser, testInfo, state)
  })
}
