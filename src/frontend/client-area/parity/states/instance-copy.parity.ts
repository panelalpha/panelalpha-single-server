import type { ParityState, Probe, StateAction } from './state'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertManagerProbe, waitFor } from './hosting'
import { INSTANCE_PAGE_DNS } from './instance'
import { COPY_PATH, COPY_POST, copyFormProbe, copyHandlers, copyLimitHome, copyModalProbes, copyPageHome, copyPageProbes, copyWarningProbe } from './instance-copy'
import { NOW } from './shell'

// S-104 ui-instance-copy: the Copy Instance page of a project, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a
// literal `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-copy.ts`.
// Plan: context/changes/ui-instance-copy/plan.md ("Stany parity").

/** Ready when the page title and the card button are on the page (the title is the first probe). */
const waitForCard = {
  legacy: [waitFor(page => page.locator('.v-card.elevation-4 .v-btn').first())],
  next: [waitFor(page => page.getByTestId('copy-instance-open'))],
}

// Phase 3: the page with its card, on a single-server account with two services.
export const instanceCopyDefault: ParityState = {
  id: 'instance-copy-default',
  target: 'lite',
  path: COPY_PATH,
  signedIn: true,
  clock: NOW,
  home: copyPageHome(),
  handlers: copyHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: waitForCard,
  probes: copyPageProbes,
}

/** The overlay of the card button: `::before` in V2, `.v-btn__overlay` in V4 (the by-name lookup of `buttonHoverState` matches the sidebar item too). */
const cardButtonOverlay: Probe = {
  key: 'button-overlay',
  legacy: page => page.locator('.v-card.elevation-4 .v-btn').first(),
  next: page => page.getByTestId('copy-instance-open').locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

const cardButton = {
  legacy: (page: Page) => page.locator('.v-card.elevation-4 .v-btn').first(),
  next: (page: Page) => page.getByTestId('copy-instance-open'),
}

// Phase 4: the pointer rests on the Copy Instance button (transitions are frozen, so the hover is final).
export const instanceCopyHover: ParityState = {
  ...instanceCopyDefault,
  id: 'instance-copy-hover',
  pointer: 'keep',
  actions: {
    legacy: [...waitForCard.legacy, async page => cardButton.legacy(page).hover()],
    next: [...waitForCard.next, async page => cardButton.next(page).hover()],
  },
  probes: [...copyPageProbes, cardButtonOverlay],
  afterCapture: {
    legacy: [async page => expect(await cardButton.legacy(page).evaluate(element => element.matches(':hover')), 'pointer on the button').toBe(true)],
    next: [async page => expect(await cardButton.next(page).evaluate(element => element.matches(':hover')), 'pointer on the button').toBe(true)],
  },
}

/** Keyboard focus on the card button: the pointer moves off the card and a key that moves no focus is pressed (the focus then counts as keyboard focus). */
function focusCardButton (app: 'legacy' | 'next'): StateAction {
  return async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const button = cardButton[app](page)
    await button.focus()
    await expect(button).toBeFocused()
    expect(await button.evaluate(element => element.matches(':focus-visible')), 'keyboard focus').toBe(true)
  }
}

// Phase 4: keyboard focus on the Copy Instance button. V2 has no focus ring and the V4 ring is switched off in `_buttons.scss`; the overlay is compared.
export const instanceCopyFocus: ParityState = {
  ...instanceCopyDefault,
  id: 'instance-copy-focus',
  pointer: 'keep',
  actions: {
    legacy: [...waitForCard.legacy, focusCardButton('legacy')],
    next: [...waitForCard.next, focusCardButton('next')],
  },
  probes: [...copyPageProbes, cardButtonOverlay],
}

/** Opens the dialog from the card button and waits for the dialog card (both apps). */
function openCopyModal (): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.v-card.elevation-4 .v-btn').first().click({ timeout: 8000 })
      await page.locator('.v-dialog--active .v-card').first().waitFor({ timeout: 8000 })
    },
    next: async page => {
      await page.getByTestId('copy-instance-open').click({ timeout: 8000 })
      await page.getByTestId('copy-instance-modal').waitFor({ timeout: 8000 })
    },
  }
}

// Phase 5: step 1 of the dialog: the message, the select with the first service chosen (`Starter (1/5) - starter.example.com`).
export const instanceCopyModal: ParityState = {
  ...instanceCopyDefault,
  id: 'instance-copy-modal',
  actions: { legacy: [...waitForCard.legacy, openCopyModal().legacy], next: [...waitForCard.next, openCopyModal().next] },
  probes: [...copyPageProbes, ...copyModalProbes],
}

// Phase 6: the first service is at its instance limit: the `fullServiceAlert` warning shows under the select, and Copy stays active.
export const instanceCopyLimit: ParityState = {
  ...instanceCopyModal,
  id: 'instance-copy-limit',
  home: copyLimitHome(),
  probes: [...copyPageProbes, ...copyModalProbes, copyFormProbe, copyWarningProbe],
}

/** Presses the dialog's Copy button (the first button of the actions). */
const submitCopy = {
  legacy: (async page => {
    await page.locator('.v-dialog--active .v-card__actions .v-btn').first().click({ timeout: 8000 })
  }) satisfies StateAction,
  next: (async page => {
    await page.getByTestId('copy-instance-modal').locator('.v-card-actions .v-btn').first().click({ timeout: 8000 })
  }) satisfies StateAction,
}

// Phase 7: the copy request answers 422: the alert of the page shows (captured before its 5 s close) and the dialog stays open.
export const instanceCopyError: ParityState = {
  ...instanceCopyModal,
  id: 'instance-copy-error',
  handlers: copyHandlers({ [COPY_POST]: { status: 422, json: { message: 'The given data was invalid.', errors: { service_id: ['The selected service is not available.'] } } } }),
  actions: {
    legacy: [...instanceCopyModal.actions.legacy, submitCopy.legacy, waitFor(page => page.locator('.alert-manager .v-alert, .alert-manager .alert').first())],
    next: [...instanceCopyModal.actions.next, submitCopy.next, waitFor(page => page.getByTestId('shell-alert-manager').locator('.v-alert').first())],
  },
  probes: [...copyPageProbes, ...copyModalProbes, alertManagerProbe],
}

// Phase 8: the copy request is held: the dialog is `submitting` (the select is disabled, the close icon is gone, the Copy button shows its
// loader). It is the disabled and the loading state of the page.
export const instanceCopySubmitting: ParityState = {
  ...instanceCopyModal,
  id: 'instance-copy-submitting',
  handlers: copyHandlers({ [COPY_POST]: 'hold' }),
  actions: {
    legacy: [...instanceCopyModal.actions.legacy, submitCopy.legacy, waitFor(page => page.locator('.v-dialog--active .v-select--is-disabled, .v-dialog--active .v-input--is-disabled').first())],
    next: [...instanceCopyModal.actions.next, submitCopy.next, waitFor(page => page.getByTestId('copy-instance-modal').locator('.v-select .v-field--disabled').first())],
  },
  probes: [...copyPageProbes, ...copyModalProbes.filter(probe => probe.key !== 'modal-close')],
}

const states: ParityState[] = [instanceCopyDefault, instanceCopyHover, instanceCopyFocus, instanceCopyModal, instanceCopyLimit, instanceCopyError, instanceCopySubmitting]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
