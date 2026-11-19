import type { Handler, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { settled, trPattern } from './auth'
import { INSTANCE_PAGE_IP, instanceChangeDomainProbe, instancePageHandlers, waitForInstanceTitle } from './instance'
import { liteShellHome } from './instances'
import { shellHandlers } from './shell'

// ui-instance-set-domain, phase 3: the SetYourDomain modal opened from the top bar of a project (lite, `/projects/1/general`).
// Shared building blocks of `instance-set-domain.parity.ts`: the home and the handlers (lite routes), the options fixture, the DNS answer
// that fails the check, the probes of the modal and the open action. Plan: context/changes/ui-instance-set-domain/plan.md ("Faza 3").

// The lite home without the Style Manager admin block, as `instance-git.ts` (`GIT_HOME`).
const { admin: _styleManagerAdmin, ...liteHomeWithoutAdmin } = liteShellHome()
export const SET_DOMAIN_HOME: Record<string, unknown> = liteHomeWithoutAdmin

// `toProjectRoutes` is a local copy (as in `instance-git.ts`): single server rewrites the `/instances` segment to `/projects`.
function toProjectRoutes (handlers: Record<string, Handler>): Record<string, Handler> {
  const routed: Record<string, Handler> = {}
  for (const [key, handler] of Object.entries(handlers)) {
    routed[key.replace(/^(\S+) \/instances(?=[/?]|$)/, '$1 /projects')] = handler
  }
  return routed
}

/** Body of `GET /instances/{id}/change-domain/options`: the free subdomain affix, the IP the domain points at, no CDN records. */
export const CHANGE_DOMAIN_OPTIONS: Handler = {
  json: {
    data: {
      subdomains: ['panelalpha.online'],
      ip_address: INSTANCE_PAGE_IP,
      ipv4_addresses: [INSTANCE_PAGE_IP],
      cdn_dns_records: [],
      nameservers: ['ns1.example.com', 'ns2.example.com'],
    },
  },
}

/**
 * The instance page handlers plus the options fixture, in the lite `/projects` form (`GET /projects/1/change-domain/options`); `extra`
 * replaces fields of a state (the URL, the options) and is keyed by the `/instances` form.
 */
export function changeDomainHandlers (extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    ...shellHandlers([], 'projects'),
    ...toProjectRoutes(instancePageHandlers({
      'GET /instances/1/change-domain/options': CHANGE_DOMAIN_OPTIONS,
      // The frame asks the app health of a running project (`InstanceStatusTabAlert`); a healthy answer keeps the tab alert away.
      'GET /instances/1/app-health': {
        json: { data: { available: true, healthy: true, serving: 'ok', ports: [{ port: 8000, status: 'ok', http_code: 200, detail: 'HTTP 200' }], checks: [] } },
      },
      ...extra,
    })),
  }
}

/** `dns.google` answers the project's host with another address: the DNS check fails and the propagation chip shows. */
export const DNS_MISMATCH_EXTERNAL: Handler = {
  json: { Status: 0, Answer: [{ name: 'studio.example.com.', type: 1, TTL: 300, data: '198.51.100.7' }] },
}

/** The modal of the legacy page: the open `v-dialog` card that carries its title (`heading.instance.modal.setDomain.title`). */
export function legacyModal (page: Page) {
  return page.locator('.v-dialog--active .v-card', { hasText: trPattern('heading.instance.modal.setDomain.title', 'lite') })
}

/** The modal anchor: the card. The first probe of every state, so the capture waits for the dialog. */
export const setDomainModalProbe: Probe = {
  key: 'set-domain-modal',
  legacy: legacyModal,
  next: page => page.getByTestId('set-domain-modal'),
}

export const setDomainTitleProbe: Probe = {
  key: 'set-domain-title',
  legacy: page => legacyModal(page).locator('h4').first(),
  next: page => page.getByTestId('set-domain-title'),
}

/** Step 1, the row with the domain and the Change button (legacy `.domain-container`). */
export const setDomainRowProbe: Probe = {
  key: 'set-domain-domain-row',
  legacy: page => legacyModal(page).locator('.domain-container').first(),
  next: page => page.getByTestId('set-domain-domain-row'),
}

export const setDomainChangeProbe: Probe = {
  key: 'set-domain-change',
  legacy: page => legacyModal(page).locator('.domain-container .v-btn').first(),
  next: page => page.getByTestId('set-domain-change'),
}

/** The Preview CTA row (single-server, not the panelalpha.online host): the second `.domain-container` of legacy step 1. */
export const setDomainPreviewRowProbe: Probe = {
  key: 'set-domain-preview-row',
  legacy: page => legacyModal(page).locator('.domain-container').nth(1),
  next: page => page.getByTestId('set-domain-preview-row'),
}

export const setDomainPreviewButtonProbe: Probe = {
  key: 'set-domain-preview-button',
  legacy: page => legacyModal(page).locator('.domain-container').nth(1).locator('.v-btn'),
  next: page => page.getByTestId('set-domain-preview-button'),
}

/** The DNS config panels of step 1 (`DnsOptions`, both apps keep `.v-expansion-panels--dns`). */
export const setDomainDnsProbe: Probe = {
  key: 'set-domain-dns',
  legacy: page => legacyModal(page).locator('.v-expansion-panels--dns').first(),
  next: page => page.getByTestId('dns-options').locator('.v-expansion-panels--dns').first(),
}

export const setDomainCloseProbe: Probe = {
  key: 'set-domain-close',
  // Legacy is V2: the card title and actions are `.v-card__title` / `.v-card__actions` (lesson: V2 classes on the legacy side).
  legacy: page => legacyModal(page).locator('.v-card__title .v-btn').first(),
  next: page => page.getByTestId('set-domain-close'),
}

export const setDomainCloseActionProbe: Probe = {
  key: 'set-domain-close-action',
  legacy: page => legacyModal(page).locator('.v-card__actions .v-btn').first(),
  next: page => page.getByTestId('set-domain-close-action'),
}

/** The DNS propagation chip, the trigger of the modal while the check fails (legacy `.v-btn` by its copy key). */
export const instanceDnsPropagationProbe: Probe = {
  key: 'instance-dns-propagation',
  legacy: page => page.locator('.v-btn', { hasText: trPattern('message.dnsPropagationInProgress', 'lite') }).first(),
  next: page => page.getByTestId('instance-dns-propagation'),
}

/** Step 0 (the form) as the wait target of `openSetDomain`: the legacy panels and the next form, both visible. */
export function legacyFormPanels (page: Page): Locator {
  return legacyModal(page).locator('.v-expansion-panels').first()
}

/**
 * Opens the modal with a DOM click on its trigger (no scroll, lesson `Modal w stanie parity otwieraj bez przewijania`). The wait is the DNS
 * step (`'dns'`, the step is set only after the mount check) or the form (`'form'`, step 0 when the DNS alerts are off).
 */
export function openSetDomain (legacyCopyKey: string, nextTestId: string, wait: 'dns' | 'form' = 'dns'): { legacy: StateAction[], next: StateAction[] } {
  const openLegacy: StateAction = async page => {
    const trigger = page.locator('.v-btn', { hasText: trPattern(legacyCopyKey, 'lite') }).first()
    await expect(trigger).toBeVisible()
    await trigger.evaluate(el => (el as HTMLElement).click())
  }
  const openNext: StateAction = async page => {
    const trigger = page.getByTestId(nextTestId)
    await expect(trigger).toBeVisible()
    await trigger.evaluate(el => (el as HTMLElement).click())
  }
  const waitLegacy: StateAction = async page => {
    await expect(legacyModal(page)).toBeVisible()
    await expect(wait === 'form' ? legacyFormPanels(page) : legacyModal(page).locator('.domain-container').first()).toBeVisible()
  }
  const waitNext: StateAction = async page => {
    await expect(page.getByTestId('set-domain-modal')).toBeVisible()
    await expect(page.getByTestId(wait === 'form' ? 'set-domain-form' : 'set-domain-domain-row')).toBeVisible()
  }
  return {
    legacy: [...waitForInstanceTitle.legacy, openLegacy, waitLegacy],
    next: [...waitForInstanceTitle.next, openNext, waitNext],
  }
}

/** Form probes. The domain field exists only on panel 0 (legacy `v-if="!panelOpen"`), the subdomain field only on panel 1. */
export const setDomainFormProbe: Probe = {
  key: 'set-domain-form',
  legacy: legacyFormPanels,
  next: page => page.getByTestId('set-domain-form').locator('.v-expansion-panels').first(),
}

export const setDomainDomainFieldProbe: Probe = {
  key: 'set-domain-domain-field',
  legacy: page => legacyModal(page).locator('.v-expansion-panel-content .v-text-field').first(),
  next: page => page.getByTestId('set-domain-domain-field'),
}

export const setDomainSubdomainFieldProbe: Probe = {
  key: 'set-domain-subdomain-field',
  // The first text field of the open panel is the subdomain input (the V2 select root also carries `v-text-field`, so `.first()`).
  legacy: page => legacyModal(page).locator('.v-expansion-panel-content .v-text-field').first(),
  next: page => page.getByTestId('set-domain-subdomain-field'),
}

export const setDomainUseProbe: Probe = {
  key: 'set-domain-use',
  legacy: page => legacyModal(page).locator('.v-card__actions .v-btn').first(),
  next: page => page.getByTestId('set-domain-use'),
}

export const setDomainCancelProbe: Probe = {
  key: 'set-domain-cancel',
  legacy: page => legacyModal(page).locator('.v-card__actions .v-btn').nth(1),
  next: page => page.getByTestId('set-domain-cancel'),
}

/** The order link under the domain label (`user.order_domain_link`). */
export const setDomainOrderLinkProbe: Probe = {
  key: 'set-domain-order-link',
  legacy: page => legacyModal(page).locator('a', { hasText: trPattern('button.domain.order', 'lite') }).first(),
  next: page => page.getByTestId('set-domain-order-link'),
}

/**
 * The domain field in its error state after a blur with the field empty. Legacy `hide-details=""` is a V2 boolean `true`, so V2 renders no
 * message text, only the error colour: the probe is the field root (`.v-input.error--text` in V2, the test id in next).
 */
export const setDomainErrorProbe: Probe = {
  key: 'set-domain-error',
  legacy: page => legacyModal(page).locator('.v-input.error--text').first(),
  next: page => page.getByTestId('set-domain-domain-field'),
}

/** Legacy domain input and its next twin, the same placeholder on both sides. */
export const legacyDomainInput = (page: Page): Locator => legacyModal(page).locator('input[placeholder="mydomain.com"]').first()
export const nextDomainInput = (page: Page): Locator => page.getByTestId('set-domain-domain-field').locator('input')

/**
 * Clicks the subdomain panel header (no scroll): the panel 1 opens and its field renders. The wait is the open panel (header active class)
 * and the field attached, not its visibility: on the mobile layout legacy lays the field out at 0 px width in the 149 px row (V2 flex), so
 * a visibility wait never ends there, while the layout itself is what the state measures.
 */
export const openSubdomainPanel: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    const header = legacyModal(page).locator('.v-expansion-panel-header').nth(1)
    await expect(header).toBeVisible()
    await header.evaluate(el => (el as HTMLElement).click())
    await expect(header).toHaveClass(/v-expansion-panel-header--active/)
    await expect(legacyModal(page).locator('input[placeholder="mydomain"]')).toBeAttached()
  },
  next: async page => {
    const header = page.getByTestId('set-domain-subdomain-title')
    await expect(header).toBeVisible()
    await header.evaluate(el => (el as HTMLElement).click())
    await expect(page.getByTestId('set-domain-subdomain-field')).toBeAttached()
  },
}

/** Blurs the empty domain field on both sides and waits for the error state (legacy `.error--text`, next `.v-field--error`). */
export const blurEmptyDomainField: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    const input = legacyDomainInput(page)
    await input.focus()
    await input.evaluate(el => (el as HTMLElement).blur())
    await expect(setDomainErrorProbe.legacy(page)).toBeVisible()
  },
  next: async page => {
    const input = nextDomainInput(page)
    await input.focus()
    await input.evaluate(el => (el as HTMLElement).blur())
    await expect(page.getByTestId('set-domain-domain-field').locator('.v-field--error')).toBeVisible()
  },
}

/** Keyboard focus of the domain field on both sides (`focus()`, no click, no blur, so the field is not validated). */
export const focusDomainField: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    const input = legacyDomainInput(page)
    await page.mouse.move(0, 0)
    await input.focus()
    await expect(input).toBeFocused()
  },
  next: async page => {
    const input = nextDomainInput(page)
    await page.mouse.move(0, 0)
    await input.focus()
    await expect(input).toBeFocused()
  },
}

/** Waits until the trigger has no spinner: the mount DNS check of the modal shows the spinner too (legacy and next `:loading`). */
export const settleTrigger: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(instanceChangeDomainProbe.legacy(page)).not.toHaveClass(/v-btn--loading/)
  },
  next: async page => {
    await expect(instanceChangeDomainProbe.next(page)).not.toHaveClass(/v-btn--loading/)
  },
}

/** The spinner of the trigger's loader (`.v-btn__loader` in both Vuetify generations); the indeterminate circle is masked separately. */
export const triggerLoaderProbe: Probe = {
  key: 'instance-change-domain-loader',
  legacy: page => instanceChangeDomainProbe.legacy(page).locator('.v-btn__loader'),
  next: page => instanceChangeDomainProbe.next(page).locator('.v-btn__loader'),
  internal: true,
}

/** The indeterminate spinner inside the trigger, masked on both sides. */
export const triggerSpinnerMasks = {
  legacy: [(page: Page) => instanceChangeDomainProbe.legacy(page).locator('.v-progress-circular')],
  next: [(page: Page) => instanceChangeDomainProbe.next(page).locator('.v-progress-circular')],
}

/**
 * Clicks the trigger (no scroll) and waits for its spinner while `GET change-domain/options` is held: the modal must stay closed on both
 * sides (legacy `loadModal` opens it only after the answer, `SetYourDomainModal.vue:578-612`).
 */
export const openTriggerLoading: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    const trigger = instanceChangeDomainProbe.legacy(page)
    await expect(trigger).toBeVisible()
    await trigger.evaluate(el => (el as HTMLElement).click())
    await expect(trigger).toHaveClass(/v-btn--loading/)
    await settled(trigger.locator('.v-progress-circular'))
    await expect(legacyModal(page)).toHaveCount(0)
  },
  next: async page => {
    const trigger = instanceChangeDomainProbe.next(page)
    await expect(trigger).toBeVisible()
    await trigger.evaluate(el => (el as HTMLElement).click())
    await expect(trigger).toHaveClass(/v-btn--loading/)
    await settled(trigger.locator('.v-progress-circular'))
    await expect(page.getByTestId('set-domain-modal')).toHaveCount(0)
  },
}

/** The domain typed on the save-error state (valid for `isValidDomain`). */
export const SUBMIT_DOMAIN = 'shop.example.com'

/** The 422 message of the save-error state: the body has only `message`, so the alert shows it without a field prefix on both sides. */
export const SUBMIT_ERROR_MESSAGE = 'The domain could not be changed.'

/**
 * Types the domain on panel 0 and clicks "Use this domain" on both sides (no scroll). The wait is the alert with the 422 message; the modal
 * stays on step 0 with the typed domain.
 */
export const submitDomainError: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await legacyDomainInput(page).fill(SUBMIT_DOMAIN)
    await setDomainUseProbe.legacy(page).evaluate(el => (el as HTMLElement).click())
    await expect(page.locator('.alert-manager', { hasText: SUBMIT_ERROR_MESSAGE })).toBeVisible()
  },
  next: async page => {
    await nextDomainInput(page).fill(SUBMIT_DOMAIN)
    await page.getByTestId('set-domain-use').evaluate(el => (el as HTMLElement).click())
    await expect(page.getByTestId('shell-alert-manager')).toContainText(SUBMIT_ERROR_MESSAGE)
  },
}

/** Types the domain on panel 0 and clicks "Use this domain" on both sides (no scroll). The caller waits for what the step produces. */
export const useDomainAction: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await legacyDomainInput(page).fill(SUBMIT_DOMAIN)
    await setDomainUseProbe.legacy(page).evaluate(el => (el as HTMLElement).click())
  },
  next: async page => {
    await nextDomainInput(page).fill(SUBMIT_DOMAIN)
    await page.getByTestId('set-domain-use').evaluate(el => (el as HTMLElement).click())
  },
}

/** Step 2 (transfer): the card text, and the actions by position (legacy `.v-card__actions`: "Transfer now" and "Cancel", or one "Cancel"). */
export const setDomainTransferStepProbe: Probe = {
  key: 'set-domain-transfer-step',
  legacy: page => legacyModal(page).locator('.v-card__text').first(),
  next: page => page.getByTestId('set-domain-transfer'),
}

export const setDomainTransferNowProbe: Probe = {
  key: 'set-domain-transfer-now',
  legacy: page => legacyModal(page).locator('.v-card__actions .v-btn').first(),
  next: page => page.getByTestId('set-domain-transfer-now'),
}

/** The last action of step 2 is "Cancel" in both branches (transfer enabled or impossible). */
export const setDomainTransferCancelProbe: Probe = {
  key: 'set-domain-transfer-cancel',
  legacy: page => legacyModal(page).locator('.v-card__actions .v-btn').last(),
  next: page => page.getByTestId('set-domain-transfer-cancel'),
}

/** Step 3 (DNS verification): the message alert (legacy `.alert-box`, next `AlertBox`). */
export const setDomainVerifyAlertProbe: Probe = {
  key: 'set-domain-verify-alert',
  legacy: page => legacyModal(page).locator('.alert-box').first(),
  next: page => page.getByTestId('set-domain-verify-alert'),
}

export const setDomainVerifyButtonProbe: Probe = {
  key: 'set-domain-verify-button',
  legacy: page => legacyModal(page).locator('.v-card__actions .v-btn').first(),
  next: page => page.getByTestId('set-domain-verify-button'),
}

export const setDomainSkipProbe: Probe = {
  key: 'set-domain-skip',
  legacy: page => legacyModal(page).locator('.v-card__actions .v-btn').last(),
  next: page => page.getByTestId('set-domain-skip'),
}

/** Waits for step 2 on both sides: its "Cancel" action is present in both branches. */
export const waitTransferStep: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(setDomainTransferCancelProbe.legacy(page)).toBeVisible()
  },
  next: async page => {
    await expect(setDomainTransferCancelProbe.next(page)).toBeVisible()
  },
}

/** Waits for step 3 on both sides: the message alert is visible. */
export const waitVerifyStep: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(setDomainVerifyAlertProbe.legacy(page)).toBeVisible()
  },
  next: async page => {
    await expect(setDomainVerifyAlertProbe.next(page)).toBeVisible()
  },
}
