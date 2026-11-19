import type { McpAction, McpState, McpStatusSnapshot } from './wordpress-mcp-state'
import type { WordpressMcpStatus } from './wordpress-mcp.api'
import { useTranslation } from 'i18next-vue'
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { isPageHidden } from '@/shared/browser/page-visibility'
import { useAppEvent } from '@/shared/events/app-events'
import {
  applyMcpStatus,
  isMcpBusy,
  isMcpOn,
  isTerminalForAction,
  MCP_POLL_INTERVAL_MS,
  mcpActionResult,
  settleMcpStatus,
  shouldKeepPolling,
} from './wordpress-mcp-state'
import { disableWordpressMcp, enableWordpressMcp, getWordpressMcp } from './wordpress-mcp.api'

// The decisions are in `wordpress-mcp-state.ts`; this composable holds the refs, the timer and the requests.

/** Screen state of the MCP page. `fetching` starts `true`, so the skeleton shows until the first GET settles. */
export function useWordpressMcp (instanceId: () => number) {
  const alerts = useAlertsStore()
  const { t } = useTranslation()

  const state = ref<McpState>('disabled')
  const endpoint = ref<string | null>(null)
  const configJson = ref<string | null>(null)
  const fetching = ref(true)
  const submitting = ref(false)
  const awaitingWebsocketUpdate = ref(false)
  const pendingAction = ref<McpAction | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null
  // Bumped on every stopPolling, so a tick that was in flight when polling stopped drops its late response.
  let pollGeneration = 0
  // The component scope; a poll must not start after the view has been unmounted.
  const scope = getCurrentScope()

  const isOn = computed(() => isMcpOn(state.value))
  const isBusy = computed(() => isMcpBusy({
    state: state.value,
    submitting: submitting.value,
    awaitingWebsocketUpdate: awaitingWebsocketUpdate.value,
  }))

  function assign (snapshot: McpStatusSnapshot): void {
    state.value = snapshot.state
    endpoint.value = snapshot.endpoint
    configJson.value = snapshot.configJson
  }

  /** The payload goes through the transient rules for the pending action. */
  function applyPayload (payload: WordpressMcpStatus): void {
    assign(applyMcpStatus(pendingAction.value, payload))
  }

  function stopPolling (): void {
    pollGeneration += 1
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /** Clears the action and the polling first, then shows the result. */
  function completePendingAction (): void {
    const action = pendingAction.value
    if (!action) {
      return
    }

    pendingAction.value = null
    awaitingWebsocketUpdate.value = false
    stopPolling()

    const result = mcpActionResult(action, state.value)
    const message = t(`heading.instance.advanced.wordpressMcp.${result.key}`)
    alerts.addAlert(result.success ? { success: true, successMessage: message } : { success: false, errorMessage: message })
  }

  /** Always stops the previous timer, then polls every 3000 ms while the state asks for it. */
  function maybePoll (): void {
    // The view is gone (a POST resolved after unmount), so no timer starts.
    if (scope && !scope.active) {
      stopPolling()
      return
    }
    stopPolling()
    if (!shouldKeepPolling({
      pending: pendingAction.value,
      state: state.value,
      awaitingWebsocketUpdate: awaitingWebsocketUpdate.value,
    })) {
      return
    }

    // Departure from legacy: legacy allowed overlapping GETs and polled a hidden tab; a tick now waits for
    // the GET in flight and skips a hidden tab.
    let inFlight = false
    pollTimer = setInterval(async () => {
      if (inFlight || isPageHidden()) {
        return
      }
      inFlight = true
      const generation = pollGeneration
      try {
        const payload = await getWordpressMcp(instanceId())
        // The polling stopped while this GET was in flight, so the response is late and must not overwrite the state.
        if (generation !== pollGeneration) {
          return
        }
        applyPayload(payload)

        if (isTerminalForAction(pendingAction.value, state.value)) {
          completePendingAction()
          return
        }

        if (!shouldKeepPolling({
          pending: pendingAction.value,
          state: state.value,
          awaitingWebsocketUpdate: awaitingWebsocketUpdate.value,
        })) {
          awaitingWebsocketUpdate.value = false
          stopPolling()
        }
      } catch (error) {
        if (generation !== pollGeneration) {
          return
        }
        // Legacy: a failed tick stops the polling silently when no action is pending.
        // This deviates only with a pending action: the action ends with an alert, so the loader is not left waiting forever.
        const hadAction = pendingAction.value !== null
        stopPolling()
        if (hadAction) {
          pendingAction.value = null
          awaitingWebsocketUpdate.value = false
          state.value = 'failed'
          alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
        }
      } finally {
        inFlight = false
      }
    }, MCP_POLL_INTERVAL_MS)
  }

  async function fetchStatus (): Promise<void> {
    try {
      const payload = await getWordpressMcp(instanceId())
      applyPayload(payload)
      maybePoll()
    } catch (error) {
      stopPolling()
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      fetching.value = false
    }
  }

  /** The pending action is set before the request; a websocket update during it wins. */
  async function enable (): Promise<void> {
    submitting.value = true
    pendingAction.value = 'enable'
    try {
      await enableWordpressMcp(instanceId())
      if (pendingAction.value === 'enable') {
        state.value = 'installing'
        awaitingWebsocketUpdate.value = true
        maybePoll()
      }
    } catch (error) {
      pendingAction.value = null
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  /** Same sequencing as `enable`, with `removing`. */
  async function disable (): Promise<void> {
    submitting.value = true
    pendingAction.value = 'disable'
    try {
      await disableWordpressMcp(instanceId())
      if (pendingAction.value === 'disable') {
        state.value = 'removing'
        awaitingWebsocketUpdate.value = true
        maybePoll()
      }
    } catch (error) {
      pendingAction.value = null
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  // When the websocket ends the pending action, the state is the raw API state.
  useAppEvent('wordpress-mcp-status-changed', async payload => {
    if (String(payload?.id) !== String(instanceId())) {
      return
    }

    if (!pendingAction.value) {
      await fetchStatus()
      return
    }

    let status: WordpressMcpStatus
    try {
      status = await getWordpressMcp(instanceId())
    } catch (error) {
      pendingAction.value = null
      awaitingWebsocketUpdate.value = false
      stopPolling()
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      return
    }

    // The polling may have ended the action while the GET was in flight; then its result is already shown.
    if (!pendingAction.value) {
      return
    }
    assign(settleMcpStatus(status))
    completePendingAction()
  })

  onScopeDispose(stopPolling)

  return { state, endpoint, configJson, fetching, isOn, isBusy, fetchStatus, enable, disable }
}
