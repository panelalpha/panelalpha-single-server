import type { ParityState } from './state'
import { test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { buttonFocusState, buttonHoverState } from './auth'
import { alertProbe, baseState, configHandlers, CREATE_ERROR, dialogProbes, fillCreate, openCreate, openDelete, openEdit, submitCreate, waitForRows, waitForTitle } from './instance-wordpress-config'

// S-96 ui-instance-wordpress-config: the WordPress Config page, measured on app-lite (`target: 'lite'`). Each state id is a literal
// `id: '…',` line, which `registeredStates` in report/write-report.ts reads as text. Builder and probes: `instance-wordpress-config.ts`.

// Phase 2: the list (4 rows: constant, constant, secret, variable) with the search and the Create button.
export const instanceWordpressConfigDefault: ParityState = baseState({
  id: 'instance-wordpress-config-default',
})

// Phase 3: hover and keyboard focus of the Create button.
export const instanceWordpressConfigHover: ParityState = {
  ...buttonHoverState(instanceWordpressConfigDefault, 'instance-wordpress-config-hover', 'button.config.create', 'lite'),
  id: 'instance-wordpress-config-hover',
}
export const instanceWordpressConfigFocus: ParityState = {
  ...buttonFocusState(instanceWordpressConfigDefault, 'instance-wordpress-config-focus', 'button.config.create', 'lite'),
  id: 'instance-wordpress-config-focus',
}

// Phase 4: loading (the list request hangs), the empty list. The search without a hit is not a state: the deployed lite page does not filter the list at all (see change.md).
export const instanceWordpressConfigLoading: ParityState = baseState({
  id: 'instance-wordpress-config-loading',
  handlers: configHandlers({ 'GET /projects/41/wordpress/config': 'hold' }),
  actions: waitForTitle,
})

export const instanceWordpressConfigEmpty: ParityState = baseState({
  id: 'instance-wordpress-config-empty',
  handlers: configHandlers({ 'GET /projects/41/wordpress/config': { json: { data: [] } } }),
  actions: waitForTitle,
})

// Phase 5: the three dialogs. Delete opens with its button disabled (the confirm checkbox is not ticked): the disabled state.
export const instanceWordpressConfigCreateModal: ParityState = baseState({
  id: 'instance-wordpress-config-create-modal',
  actions: { legacy: [...waitForRows.legacy, openCreate.legacy], next: [...waitForRows.next, openCreate.next] },
  probes: [...instanceWordpressConfigDefault.probes, ...dialogProbes()],
})

export const instanceWordpressConfigEditModal: ParityState = baseState({
  id: 'instance-wordpress-config-edit-modal',
  actions: { legacy: [...waitForRows.legacy, openEdit.legacy], next: [...waitForRows.next, openEdit.next] },
  probes: [...instanceWordpressConfigDefault.probes, ...dialogProbes()],
})

export const instanceWordpressConfigDeleteModal: ParityState = baseState({
  id: 'instance-wordpress-config-delete-modal',
  actions: { legacy: [...waitForRows.legacy, openDelete.legacy], next: [...waitForRows.next, openDelete.next] },
  probes: [...instanceWordpressConfigDefault.probes, ...dialogProbes()],
})

// Create answers 422: the dialog closes and the alert shows the message.
export const instanceWordpressConfigCreateError: ParityState = baseState({
  id: 'instance-wordpress-config-create-error',
  handlers: configHandlers({ 'POST /projects/41/wordpress/config': CREATE_ERROR }),
  actions: {
    legacy: [...waitForRows.legacy, openCreate.legacy, fillCreate('WP_NEW', 'value').legacy, submitCreate.legacy],
    next: [...waitForRows.next, openCreate.next, fillCreate('WP_NEW', 'value').next, submitCreate.next],
  },
  probes: [...instanceWordpressConfigDefault.probes, alertProbe],
})

const states: ParityState[] = [instanceWordpressConfigDefault, instanceWordpressConfigHover, instanceWordpressConfigFocus, instanceWordpressConfigLoading, instanceWordpressConfigEmpty, instanceWordpressConfigCreateModal, instanceWordpressConfigEditModal, instanceWordpressConfigDeleteModal, instanceWordpressConfigCreateError]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
