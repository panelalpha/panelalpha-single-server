import type { Handler, ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { alertManagerProbe } from './hosting'
import { framePageMasks, INSTANCE_PAGE_DNS, instanceChangeDomainProbe, instancePageRaw, waitForInstanceTitle } from './instance'
import {
  blurEmptyDomainField,
  changeDomainHandlers,
  DNS_MISMATCH_EXTERNAL,
  focusDomainField,
  instanceDnsPropagationProbe,
  openSetDomain,
  openSubdomainPanel,
  openTriggerLoading,
  SET_DOMAIN_HOME,
  setDomainCancelProbe,
  setDomainChangeProbe,
  setDomainCloseActionProbe,
  setDomainCloseProbe,
  setDomainDnsProbe,
  setDomainDomainFieldProbe,
  setDomainErrorProbe,
  setDomainFormProbe,
  setDomainModalProbe,
  setDomainOrderLinkProbe,
  setDomainPreviewButtonProbe,
  setDomainPreviewRowProbe,
  setDomainRowProbe,
  setDomainSkipProbe,
  setDomainSubdomainFieldProbe,
  setDomainTitleProbe,
  setDomainTransferCancelProbe,
  setDomainTransferNowProbe,
  setDomainTransferStepProbe,
  setDomainUseProbe,
  setDomainVerifyAlertProbe,
  setDomainVerifyButtonProbe,
  settleTrigger,
  SUBMIT_ERROR_MESSAGE,
  submitDomainError,
  triggerLoaderProbe,
  triggerSpinnerMasks,
  useDomainAction,
  waitTransferStep,
  waitVerifyStep,
} from './instance-set-domain'
import { NOW } from './shell'

// ui-instance-set-domain, phase 3: the modal in its first states, measured on app-lite (`target: 'lite'`, M-2 default). Each state id is a
// literal `id: '…',` line. Builders and probes: `instance-set-domain.ts`. Plan: context/changes/ui-instance-set-domain/plan.md.

/** The DNS step of the modal (the check passed, the domain points at the IP): the default lite panel, which is single-server. */
const dnsProbes = [
  setDomainModalProbe,
  setDomainTitleProbe,
  setDomainRowProbe,
  setDomainChangeProbe,
  setDomainDnsProbe,
  setDomainCloseProbe,
  setDomainCloseActionProbe,
]

// Lite (single-server) opens the project under `/projects/:id` (`instance.routes.ts` segment); `/instances/1/general` redirects a lite
// build to the project list, as the failed first run showed.
const base = {
  path: '/projects/1/general',
  signedIn: true,
  clock: NOW,
  home: SET_DOMAIN_HOME,
  masks: framePageMasks,
  viewportOnly: true,
} as const

export const instanceSetDomainDns: ParityState = {
  ...base,
  id: 'instance-set-domain-dns',
  target: 'lite',
  handlers: changeDomainHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: openSetDomain('button.setDomain.changeDomain', 'instance-change-domain'),
  probes: [...dnsProbes, instanceChangeDomainProbe],
}

// The DNS check fails: the top bar shows the propagation chip, and the chip opens the same modal at the DNS step.
export const instanceSetDomainPropagation: ParityState = {
  ...base,
  id: 'instance-set-domain-propagation',
  target: 'lite',
  handlers: changeDomainHandlers(),
  external: { 'dns.google': DNS_MISMATCH_EXTERNAL },
  actions: openSetDomain('message.dnsPropagationInProgress', 'instance-dns-propagation'),
  probes: [...dnsProbes, instanceDnsPropagationProbe],
}

// panelalpha.online host: no Preview CTA on the DNS step, and no DNS check (the answer above is never asked for).
export const instanceSetDomainPanelalphaOnline: ParityState = {
  ...base,
  id: 'instance-set-domain-panelalpha-online',
  target: 'lite',
  handlers: changeDomainHandlers({
    'GET /instances/1': {
      json: { data: instancePageRaw(1, { url: 'https://studio.panelalpha.online', domain: 'studio.panelalpha.online' }) },
    },
  }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: openSetDomain('button.setDomain.changeDomain', 'instance-change-domain'),
  probes: [...dnsProbes, instanceChangeDomainProbe],
}

// Single-server (lite): the Preview CTA row with its Generate URL button sits under the domain row.
export const instanceSetDomainPreviewCta: ParityState = {
  ...base,
  id: 'instance-set-domain-preview-cta',
  target: 'lite',
  handlers: changeDomainHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: openSetDomain('button.setDomain.changeDomain', 'instance-change-domain'),
  probes: [...dnsProbes, setDomainPreviewRowProbe, setDomainPreviewButtonProbe],
}

/** Step 0 (the form) opens when the DNS alerts are off: the mount check is skipped and `step` stays 0 (legacy `mounted`). */
const FORM_OPEN = openSetDomain('button.setDomain.changeDomain', 'instance-change-domain', 'form')
const formHandlers = changeDomainHandlers({
  'GET /instances/1': { json: { data: instancePageRaw(1, { details: { dns_alerts_enabled: false } }) } },
})

/** The form probes: the modal, its title, the panels, the Use and Cancel actions. */
const formProbes = [
  setDomainModalProbe,
  setDomainTitleProbe,
  setDomainFormProbe,
  setDomainDomainFieldProbe,
  setDomainUseProbe,
  setDomainCancelProbe,
]

export const instanceSetDomainForm: ParityState = {
  ...base,
  id: 'instance-set-domain-form',
  target: 'lite',
  handlers: formHandlers,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: FORM_OPEN,
  probes: formProbes,
}

// Panel 1 ("Set subdomain") is open: the subdomain field and the affix select replace the domain field.
export const instanceSetDomainFormSubdomain: ParityState = {
  ...base,
  id: 'instance-set-domain-form-subdomain',
  target: 'lite',
  handlers: formHandlers,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...FORM_OPEN.legacy, openSubdomainPanel.legacy],
    next: [...FORM_OPEN.next, openSubdomainPanel.next],
  },
  probes: [
    setDomainModalProbe,
    setDomainTitleProbe,
    setDomainFormProbe,
    setDomainSubdomainFieldProbe,
    setDomainUseProbe,
    setDomainCancelProbe,
  ],
}

// `user.order_domain_link` is set: the order link sits under the domain label.
export const instanceSetDomainOrderLink: ParityState = {
  ...base,
  id: 'instance-set-domain-order-link',
  target: 'lite',
  home: {
    ...SET_DOMAIN_HOME,
    user: { ...(SET_DOMAIN_HOME.user as Record<string, unknown>), order_domain_link: 'https://example.com/order-domain' },
  },
  handlers: formHandlers,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: FORM_OPEN,
  probes: [...formProbes, setDomainOrderLinkProbe],
}

// Empty domain field after a blur: the required message shows under the field on both sides.
export const instanceSetDomainFormError: ParityState = {
  ...base,
  id: 'instance-set-domain-form-error',
  target: 'lite',
  handlers: formHandlers,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...FORM_OPEN.legacy, blurEmptyDomainField.legacy],
    next: [...FORM_OPEN.next, blurEmptyDomainField.next],
  },
  // The field root carries the error state; the domain field probe is the same element, so it is left out.
  probes: [setDomainModalProbe, setDomainTitleProbe, setDomainFormProbe, setDomainErrorProbe, setDomainUseProbe, setDomainCancelProbe],
}

// The save fails (422 on `PUT change-domain/domain`): the alert sits above the page; the form stays on step 0 with the typed domain.
const submitErrorHandlers = changeDomainHandlers({
  'GET /instances/1': { json: { data: instancePageRaw(1, { details: { dns_alerts_enabled: false } }) } },
  'PUT /instances/1/change-domain/domain': { status: 422, json: { message: SUBMIT_ERROR_MESSAGE } },
})

export const instanceSetDomainSubmitError: ParityState = {
  ...base,
  id: 'instance-set-domain-submit-error',
  target: 'lite',
  handlers: submitErrorHandlers,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...FORM_OPEN.legacy, submitDomainError.legacy],
    next: [...FORM_OPEN.next, submitDomainError.next],
  },
  probes: [...formProbes, alertManagerProbe],
}

/**
 * The raw instance of the transfer and verify states: the form opens first (DNS alerts off), the plan and server flags say what the modal
 * does after "Use this domain", and `service_id` is the key of `GET /services/{id}/domains/verify` (legacy `SetYourDomainModal.vue:698`).
 */
function transferHandlers (
  planSettings: Record<string, unknown>,
  serverSettings: Record<string, unknown>,
  verify: Handler,
): Record<string, Handler> {
  return changeDomainHandlers({
    'GET /instances/1': {
      json: {
        data: instancePageRaw(1, {
          service_id: 1,
          details: { dns_alerts_enabled: false },
          server_settings: { uses_own_backup_system: false, ...serverSettings },
          plan_settings: { copy_instance_allowed: true, dns_management_enabled: false, domain_for_staging: { type: 'any_domain' }, ...planSettings },
        }),
      },
    },
    'GET /services/1/domains/verify': verify,
  })
}

// Step 2, transfer enabled: the registrar asks for the DNS record, so the modal goes to the transfer step with its "Transfer now".
export const instanceSetDomainTransfer: ParityState = {
  ...base,
  id: 'instance-set-domain-transfer',
  target: 'lite',
  handlers: transferHandlers(
    { domain_transfer_enabled: true },
    { domain_transfer_allowed: true },
    { json: { verification_required: true, verification_record: { name: 'shop.example.com', type: 'TXT', content: 'panelalpha-verify=7f3a9c' } } },
  ),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...FORM_OPEN.legacy, useDomainAction.legacy, waitTransferStep.legacy],
    next: [...FORM_OPEN.next, useDomainAction.next, waitTransferStep.next],
  },
  probes: [setDomainModalProbe, setDomainTitleProbe, setDomainTransferStepProbe, setDomainTransferNowProbe, setDomainTransferCancelProbe],
}

// Step 2, the plan has no transfer: the same trigger, the "impossible" copy and a single "Cancel".
export const instanceSetDomainTransferImpossible: ParityState = {
  ...base,
  id: 'instance-set-domain-transfer-impossible',
  target: 'lite',
  handlers: transferHandlers(
    { domain_transfer_enabled: false },
    { domain_transfer_allowed: true },
    { json: { verification_required: true, verification_record: { name: 'shop.example.com', type: 'TXT', content: 'panelalpha-verify=7f3a9c' } } },
  ),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...FORM_OPEN.legacy, useDomainAction.legacy, waitTransferStep.legacy],
    next: [...FORM_OPEN.next, useDomainAction.next, waitTransferStep.next],
  },
  probes: [setDomainModalProbe, setDomainTitleProbe, setDomainTransferStepProbe, setDomainTransferCancelProbe],
}

// Step 3, the eager DNS verification: the plan asks for it, the registrar does not require a record, and `dns.google` answers another
// address, so the first check fails and the modal shows the "incorrect" message (step 3) and stops there.
// Known deviation (fix 2, AGENTS.md rule 1): legacy renders `{{domain}}` in this message empty, next fills in the typed domain. The text
// delta is informational; the computed styles and the box of the alert are measured as usual.
export const instanceSetDomainVerify: ParityState = {
  ...base,
  id: 'instance-set-domain-verify',
  target: 'lite',
  handlers: transferHandlers(
    { eager_domain_dns_verification_enabled: true },
    { domain_transfer_allowed: true },
    { json: { verification_required: false } },
  ),
  external: { 'dns.google': DNS_MISMATCH_EXTERNAL },
  actions: {
    legacy: [...FORM_OPEN.legacy, useDomainAction.legacy, waitVerifyStep.legacy],
    next: [...FORM_OPEN.next, useDomainAction.next, waitVerifyStep.next],
  },
  probes: [setDomainModalProbe, setDomainTitleProbe, setDomainVerifyAlertProbe, setDomainVerifyButtonProbe, setDomainSkipProbe],
}

// Trigger states (matrix `hover`, `focus-visible`, `loading`). `disabled` is N/A: the modal has no disabled buttons, and the trigger is never
// disabled (legacy `v-btn` has no `disabled` binding, `TopBarTitle.vue` / `SetYourDomainModal.vue` trigger). The base is the top bar with the
// modal closed; the readiness anchor is the trigger, and the mount DNS check (spinner on the trigger) must be over first.
const triggerBase: ParityState = {
  ...base,
  id: 'instance-set-domain-trigger',
  target: 'lite',
  handlers: changeDomainHandlers(),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, settleTrigger.legacy],
    next: [...waitForInstanceTitle.next, settleTrigger.next],
  },
  probes: [instanceChangeDomainProbe],
}

// Hover of the trigger (`buttonHoverState`, pointer kept on the button; overlay probe on both sides).
export const instanceSetDomainHover: ParityState = buttonHoverState(triggerBase, 'instance-set-domain-hover', 'button.setDomain.changeDomain', 'lite')

// Keyboard focus of the trigger (`buttonFocusState`, no Tab: see lesson "buttonFocusState nie używa Tab").
export const instanceSetDomainFocus: ParityState = buttonFocusState(triggerBase, 'instance-set-domain-focus', 'button.setDomain.changeDomain', 'lite')

// Focus of the domain field of the form (step 0). `pointer: 'keep'`, so the reset before the capture does not blur the field.
export const instanceSetDomainFormFocus: ParityState = {
  ...base,
  id: 'instance-set-domain-form-focus',
  target: 'lite',
  pointer: 'keep',
  handlers: formHandlers,
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  actions: {
    legacy: [...FORM_OPEN.legacy, focusDomainField.legacy],
    next: [...FORM_OPEN.next, focusDomainField.next],
  },
  probes: formProbes,
}

// `GET change-domain/options` is held: the trigger shows its spinner and the modal never opens (legacy `loading` / `loadModal`).
export const instanceSetDomainLoading: ParityState = {
  ...base,
  id: 'instance-set-domain-loading',
  target: 'lite',
  handlers: changeDomainHandlers({ 'GET /instances/1/change-domain/options': 'hold' }),
  external: { 'dns.google': INSTANCE_PAGE_DNS },
  masks: {
    legacy: [...framePageMasks.legacy, triggerSpinnerMasks.legacy[0]],
    next: [...framePageMasks.next, triggerSpinnerMasks.next[0]],
  },
  actions: {
    legacy: [...waitForInstanceTitle.legacy, settleTrigger.legacy, openTriggerLoading.legacy],
    next: [...waitForInstanceTitle.next, settleTrigger.next, openTriggerLoading.next],
  },
  probes: [instanceChangeDomainProbe, triggerLoaderProbe],
}

const states = [
  instanceSetDomainForm,
  instanceSetDomainFormSubdomain,
  instanceSetDomainFormFocus,
  instanceSetDomainOrderLink,
  instanceSetDomainFormError,
  instanceSetDomainSubmitError,
  instanceSetDomainTransfer,
  instanceSetDomainTransferImpossible,
  instanceSetDomainVerify,
  instanceSetDomainHover,
  instanceSetDomainFocus,
  instanceSetDomainLoading,

  instanceSetDomainDns,
  instanceSetDomainPropagation,
  instanceSetDomainPanelalphaOnline,
  instanceSetDomainPreviewCta,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
