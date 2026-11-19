import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import {
  buttonSpinnerMasks,
  clickPageButton,
  EMPTY_EMAIL_SETTINGS_FIXTURE,
  modalSubmitSpinnerMasks,
  openSslMenu,
  openTestEmailModal,
  resellerEmailSettingsFieldProbes,
  resellerEmailSettingsModalProbes,
  resellerEmailSettingsModalProbesNoClose,
  resellerEmailSettingsSelectPlaceholderProbe,
  resellerEmailSettingsSkeletonMasks,
  resellerEmailSettingsSkeletonProbe,
  resellerEmailSettingsSslMenuProbe,
  resellerEmailSettingsSslOptionProbe,
  resellerEmailSettingsState,
  submitTestEmailModal,
  waitForButtonLoading,
  waitForModalSendLoading,
} from './reseller-email-settings'
import { hoverResellerErrorAlert, resellerAlertProbe } from './reseller-users'

// S-124 ui-reseller-email-settings, measured on app-lite (`target: 'lite'`, M-2 default): the Reseller Area frame and the Email Settings page.
// Each state id is a literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text.
// Builder and probes: `reseller-email-settings.ts`. Plan: context/changes/ui-reseller-email-settings/plan.md.

// Phase 5: the default state, the frame and the form with the saved settings.
export const resellerEmailSettingsDefault: ParityState = {
  id: 'reseller-email-settings-default',
  ...resellerEmailSettingsState(),
}

// Phase 6: the hover of Test Connection (matrix `hover`). It is the only button with that name on the page. `keepScroll`,
// because the button may sit below the fold on the mobile variant.
export const resellerEmailSettingsHover: ParityState = {
  ...buttonHoverState(resellerEmailSettingsDefault, 'reseller-email-settings-hover', 'button.testConnection', 'lite'),
  id: 'reseller-email-settings-hover',
  keepScroll: true,
}

// Phase 7: keyboard focus on Test Connection (matrix `focus-visible`). No `keepScroll`: focus does not depend on the pointer.
export const resellerEmailSettingsFocus: ParityState = {
  ...buttonFocusState(resellerEmailSettingsDefault, 'reseller-email-settings-focus', 'button.testConnection', 'lite'),
  id: 'reseller-email-settings-focus',
}

// Phase 8: a reseller who has not saved anything yet. Every field is empty and shows its placeholder; the select has no value.
export const resellerEmailSettingsEmpty: ParityState = {
  id: 'reseller-email-settings-empty',
  ...resellerEmailSettingsState({
    data: EMPTY_EMAIL_SETTINGS_FIXTURE,
    probes: [resellerEmailSettingsSelectPlaceholderProbe],
  }),
}

// Phase 9: the Encryption select with its menu open (not a matrix state; it covers the select options). `keepScroll` and `pointer: 'keep'`:
// the menu must stay open through the screenshot, and the pointer stays on the select.
export const resellerEmailSettingsSslMenu: ParityState = {
  id: 'reseller-email-settings-ssl-menu',
  ...resellerEmailSettingsState({
    legacy: [openSslMenu(false)],
    next: [openSslMenu(true)],
    probes: [resellerEmailSettingsSslMenuProbe, resellerEmailSettingsSslOptionProbe],
  }),
  keepScroll: true,
  pointer: 'keep',
}

// Phase 10: the error states of the page. Each error is an alert (`addAlert`, closed after 5 s unless the pointer is on it), so the state
// hovers the alert and keeps the pointer there (lesson "Toast z timerem"). The probe takes `.first()` (`resellerAlertProbe`).

// `GET /reseller/email-settings` answers 500. The form stays empty and the first input is the readiness anchor.
export const resellerEmailSettingsErrorGet: ParityState = {
  id: 'reseller-email-settings-error-get',
  ...resellerEmailSettingsState({
    handlers: { 'GET /reseller/email-settings': { status: 500, json: { message: 'Server Error' } } },
    legacy: [hoverResellerErrorAlert],
    next: [hoverResellerErrorAlert],
    probes: [resellerAlertProbe],
  }),
  pointer: 'keep',
}

// `PUT /reseller/email-settings` answers 422 with a field error. The alert carries the server message.
export const resellerEmailSettingsErrorSave: ParityState = {
  id: 'reseller-email-settings-error-save',
  ...resellerEmailSettingsState({
    handlers: {
      'PUT /reseller/email-settings': {
        status: 422,
        json: { message: 'The given data was invalid.', errors: { smtp_host: ['The smtp host field is required.'] } },
      },
    },
    legacy: [clickPageButton('button.saveChanges'), hoverResellerErrorAlert],
    next: [clickPageButton('button.saveChanges'), hoverResellerErrorAlert],
    probes: [resellerAlertProbe],
  }),
  pointer: 'keep',
}

// `POST .../test-connection` answers 200 with `success: false`. The page turns it into an error alert (`connectionTestAlert`).
export const resellerEmailSettingsTestFailed: ParityState = {
  id: 'reseller-email-settings-test-failed',
  ...resellerEmailSettingsState({
    handlers: {
      'POST /reseller/email-settings/test-connection': {
        json: { success: false, message: 'Connection could not be established with host smtp.acme-hosting.example' },
      },
    },
    legacy: [clickPageButton('button.testConnection'), hoverResellerErrorAlert],
    next: [clickPageButton('button.testConnection'), hoverResellerErrorAlert],
    probes: [resellerAlertProbe],
  }),
  pointer: 'keep',
}

// Phase 11: the loading states. The request hangs (`'hold'`), so the loader stays on screen. The loader masks replace the skeletons and the
// button spinners; their colour follows app, so they are not a measured delta.

// `GET /reseller/email-settings` pending: the fields are skeletons. The skeleton is the readiness anchor.
export const resellerEmailSettingsLoading: ParityState = {
  id: 'reseller-email-settings-loading',
  ...resellerEmailSettingsState({
    handlers: { 'GET /reseller/email-settings': 'hold' },
    ready: page => page.locator('.email-settings .v-skeleton-loader').first(),
    masks: resellerEmailSettingsSkeletonMasks,
    omitProbes: resellerEmailSettingsFieldProbes,
    probes: [resellerEmailSettingsSkeletonProbe],
  }),
}

// `POST .../test-connection` pending: Test Connection shows its loader.
export const resellerEmailSettingsTesting: ParityState = {
  id: 'reseller-email-settings-testing',
  ...resellerEmailSettingsState({
    handlers: { 'POST /reseller/email-settings/test-connection': 'hold' },
    legacy: [clickPageButton('button.testConnection'), waitForButtonLoading('button.testConnection')],
    next: [clickPageButton('button.testConnection'), waitForButtonLoading('button.testConnection')],
    masks: buttonSpinnerMasks('button.testConnection'),
  }),
}

// `PUT /reseller/email-settings` pending: Save shows its loader.
export const resellerEmailSettingsSaving: ParityState = {
  id: 'reseller-email-settings-saving',
  ...resellerEmailSettingsState({
    handlers: { 'PUT /reseller/email-settings': 'hold' },
    legacy: [clickPageButton('button.saveChanges'), waitForButtonLoading('button.saveChanges')],
    next: [clickPageButton('button.saveChanges'), waitForButtonLoading('button.saveChanges')],
    masks: buttonSpinnerMasks('button.saveChanges'),
  }),
}

// Phase 12: the Send Test Email modal, open (`SendTestEmailModal.vue`, legacy `STM`). The e-mail prefills from the session. The probes
// are scoped to the modal card, because the page and the modal share the button text.
export const resellerEmailSettingsModal: ParityState = {
  id: 'reseller-email-settings-modal',
  ...resellerEmailSettingsState({
    legacy: [openTestEmailModal(false)],
    next: [openTestEmailModal(true)],
    probes: resellerEmailSettingsModalProbes,
  }),
}

// Phase 13: the Send request hangs (`'hold'`), so Send shows its loader and the X is hidden. The loader is masked (app colour, decision
// 2026-10-04), so it is not a measured delta.
export const resellerEmailSettingsModalSending: ParityState = {
  id: 'reseller-email-settings-modal-sending',
  ...resellerEmailSettingsState({
    handlers: { 'POST /reseller/email-settings/send-test-email': 'hold' },
    legacy: [openTestEmailModal(false), submitTestEmailModal(false), waitForModalSendLoading(false)],
    next: [openTestEmailModal(true), submitTestEmailModal(true), waitForModalSendLoading(true)],
    masks: modalSubmitSpinnerMasks,
    probes: resellerEmailSettingsModalProbesNoClose,
  }),
}

// Phase 13: the Send request answers 500. The modal stays open with its alert (`addAlert` in the catch on both sides). The alert is hovered
// and the pointer stays on it, as in the other error states.
export const resellerEmailSettingsModalError: ParityState = {
  id: 'reseller-email-settings-modal-error',
  ...resellerEmailSettingsState({
    handlers: { 'POST /reseller/email-settings/send-test-email': { status: 500, json: { message: 'Server Error' } } },
    legacy: [openTestEmailModal(false), submitTestEmailModal(false), hoverResellerErrorAlert],
    next: [openTestEmailModal(true), submitTestEmailModal(true), hoverResellerErrorAlert],
    probes: [...resellerEmailSettingsModalProbes, resellerAlertProbe],
  }),
  pointer: 'keep',
}

const states: ParityState[] = [
  resellerEmailSettingsDefault,
  resellerEmailSettingsHover,
  resellerEmailSettingsFocus,
  resellerEmailSettingsEmpty,
  resellerEmailSettingsSslMenu,
  resellerEmailSettingsErrorGet,
  resellerEmailSettingsErrorSave,
  resellerEmailSettingsTestFailed,
  resellerEmailSettingsLoading,
  resellerEmailSettingsTesting,
  resellerEmailSettingsSaving,
  resellerEmailSettingsModal,
  resellerEmailSettingsModalSending,
  resellerEmailSettingsModalError,
]

/** Variants a state cannot be reached in. Empty for now. */
const notInVariant: Record<string, string[]> = {}

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    test.skip(notInVariant[state.id]?.includes(testInfo.project.name) ?? false, 'not reachable in this variant')
    await runState(browser, testInfo, state)
  })
}
