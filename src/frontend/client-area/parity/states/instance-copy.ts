import type { Handler, Probe } from './state'
import type { Page } from '@playwright/test'
import { ADVANCED_PROJECT_ID, advancedFrameHandlers } from './instance-advanced-frame'
import { copyServices } from './instances'
import { liteCopyHome } from './project-actions'

// S-104 ui-instance-copy: the Copy Instance page of a project, measured on app-lite (`/projects/41/advanced/copy-instance`, `target: 'lite'`).
// Not a spec file (testMatch is `*.parity.ts`). States and their registration: `instance-copy.parity.ts`. Plan:
// context/changes/ui-instance-copy/plan.md ("Stany parity").

export const COPY_PATH = `/projects/${ADVANCED_PROJECT_ID}/advanced/copy-instance`

/** The single-server `/home` with the copy services (arrays replace the base ones): Starter 1/5 and Pro 2/9 (with a user configurable option). */
export { liteCopyHome as copyPageHome } from './project-actions'

/** The `POST /projects/41/copy` handler key (legacy and next both map `/instances/` to `/projects/` on single-server). */
export const COPY_POST = `POST /projects/${ADVANCED_PROJECT_ID}/copy`

/** Handlers of the page: the Advanced frame of the Details page and an answer for the copy request (`overrides` replace any key). */
export function copyHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [COPY_POST]: { status: 202, json: { data: {} } },
    ...overrides,
  })
}

/** The first service of the select reaches its instance limit: the dialog shows the `fullServiceAlert` warning (the Copy button stays active). */
export const copyFullServices = [{ ...copyServices[0]!, instance_count: 5 }, copyServices[1]!]

/** `home` for the limit state: the services above replace the base ones. */
export function copyLimitHome (): Record<string, unknown> {
  const home = liteCopyHome() as { user: Record<string, unknown> }
  return { ...home, user: { ...home.user, services: copyFullServices } }
}

/** The copy modal of the page: next marks it with a test id, legacy is the active dialog's card. */
const modal = {
  legacy: (page: Page) => page.locator('.v-dialog--active .v-card'),
  next: (page: Page) => page.getByTestId('copy-instance-modal'),
}

/** The page: title and the card (title, subtitle, button). The first probe is the readiness anchor. */
export const copyPageProbes: Probe[] = [
  { key: 'title', legacy: page => page.locator('.page-title__title'), next: page => page.locator('.page-title__title') },
  { key: 'card', legacy: page => page.locator('.v-card.elevation-4').first(), next: page => page.getByTestId('copy-instance-card') },
  { key: 'card-title', legacy: page => page.locator('.v-card.elevation-4 h6').first(), next: page => page.getByTestId('copy-instance-card').locator('h6'), internal: true },
  { key: 'card-subtitle', legacy: page => page.locator('.v-card.elevation-4 p').first(), next: page => page.getByTestId('copy-instance-card').locator('p'), internal: true },
  { key: 'card-button', legacy: page => page.locator('.v-card.elevation-4 .v-btn').first(), next: page => page.getByTestId('copy-instance-open') },
]

/** The dialog of step 1: card, title, icon, close icon, message, the select, the two buttons. */
export const copyModalProbes: Probe[] = [
  { key: 'modal', legacy: modal.legacy, next: modal.next },
  { key: 'modal-title', legacy: page => modal.legacy(page).locator('.v-card__title'), next: page => modal.next(page).locator('.v-card-title'), internal: true },
  { key: 'modal-icon', legacy: page => modal.legacy(page).locator('.v-card__title .v-icon').first(), next: page => modal.next(page).locator('.v-card-title .v-icon').first(), internal: true },
  { key: 'modal-close', legacy: page => modal.legacy(page).locator('.v-card__title .v-btn .v-icon'), next: page => modal.next(page).locator('.v-card-title .v-btn .v-icon'), internal: true },
  { key: 'modal-message', legacy: page => modal.legacy(page).locator('.v-card__text p').first(), next: page => modal.next(page).locator('.v-card-text p').first(), internal: true },
  { key: 'modal-select', legacy: page => modal.legacy(page).locator('.v-card__text .v-select').first(), next: page => modal.next(page).locator('.v-card-text .v-select').first(), internal: true },
  { key: 'modal-submit', legacy: page => modal.legacy(page).locator('.v-card__actions .v-btn').first(), next: page => modal.next(page).locator('.v-card-actions .v-btn').first(), internal: true },
  { key: 'modal-cancel', legacy: page => modal.legacy(page).locator('.v-card__actions .v-btn').nth(1), next: page => modal.next(page).locator('.v-card-actions .v-btn').nth(1), internal: true },
]

/** The form that wraps the select (legacy `v-form`, next `v-form`). */
export const copyFormProbe: Probe = {
  key: 'modal-form',
  legacy: page => modal.legacy(page).locator('form'),
  next: page => modal.next(page).locator('form'),
  internal: true,
}

/** The `fullServiceAlert` box under the select. */
export const copyWarningProbe: Probe = {
  key: 'modal-warning',
  legacy: page => modal.legacy(page).locator('.warning-box'),
  next: page => modal.next(page).locator('.warning-box'),
  internal: true,
}

/** The copy key of the page button (the name the hover and focus states look up). */
export const COPY_BUTTON_KEY = 'button.copyInstance'
