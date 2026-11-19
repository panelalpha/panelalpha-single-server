import type { DeployLogDetail, DeployLogsLive } from './instance-deploy-logs.api'
import type { EchoConnection } from '@/shared/realtime/echo-client'
import type { DeployLogLine } from '@/entities/project/ui/deploy/deploy-log.types'
import type { DeployStage } from '@/entities/project/ui/deploy/deploy-steps'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { TERMINAL_STATUSES } from '@/entities/project/ui/deploy/deploy-log-ui'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { isPageHidden } from '@/shared/browser/page-visibility'
import { useAppEvent } from '@/shared/events/app-events'
import { cancelFilesCreate } from '@/shared/files/files-create'
import { echoClient } from '@/shared/realtime/echo-client'
import { cancelDeploy as cancelDeployRequest, downloadDeployLog, getDeployLog, getDeployLogsLive, listDeployLogs } from './instance-deploy-logs.api'

// Data layer of the lite `DeployLogsViewer`: the kit viewer only renders what
// it gets, so the screen that opens the logs runs the polling, the websocket push, the history load, cancel and download.

// Prefer the websocket line push when the server really streams `DeployLogUpdated` payloads with content. Until that happens (or
// when the socket drops) poll the live endpoint: production engines without NDJSON streaming still need HTTP.
export const POLL_INTERVAL = 2000

export interface UseDeployLogsOptions {
  instanceId: () => number | string | null | undefined
  /** The modal follows the running deploy; it is live mode only without a `logId`. */
  live: () => boolean
  logId: () => number | string | null | undefined
  /** The modal is open. */
  active: () => boolean
  /** The terminal status of the deploy was reached. */
  onTerminal?: (status: string) => void
  /** The history log could not be loaded (legacy `@load-error`: the modal closes). */
  onLoadError?: (error: unknown) => void
  connection?: () => EchoConnection | null
}

interface DeployLogUpdatedPayload {
  application_id?: number | string
  status?: string
  stages?: DeployStage[]
  stage?: string
  lines?: DeployLogLine[]
  base_offset?: number | string
  next_offset?: number | string
}

function stagesOf (log: { stages?: DeployStage[] | null }): DeployStage[] {
  return Array.isArray(log.stages) ? log.stages : []
}

export function useDeployLogs (options: UseDeployLogsOptions) {
  const alerts = useAlertsStore()
  const connection = options.connection ?? (() => echoClient.connection)

  const status = ref('running')
  const currentStage = ref<string | null>(null)
  const stages = ref<DeployStage[]>([])
  // Replaced as a whole on every batch (the rows get it as a prop), never edited in place: no deep proxy per line.
  const lines = shallowRef<DeployLogLine[]>([])
  const error = ref<string | null>(null)
  const warning = ref<string | null>(null)
  const finishedLogId = ref<number | string | null>(null)
  const cancelling = ref(false)
  const downloading = ref(false)
  const contentLoading = ref(true)

  let offset = 0
  let panelLogId: number | string | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let polling = false
  let finalReadPending = false
  let wsStateHandler: ((states: { current: string }) => void) | null = null
  let boundConnection: EchoConnection | null = null
  // true after at least one contentful `DeployLogUpdated` push
  let streamPushActive = false
  let started = false
  // true after unmount: a poll that was in flight must not schedule another one or bind the socket again
  let disposed = false

  const isLiveMode = computed(() => options.live() && !options.logId())
  const isRunning = computed(() => isLiveMode.value && status.value === 'running')
  const downloadLogId = computed(() => {
    const logId = options.logId()
    if (logId) {
      return logId
    }
    if (TERMINAL_STATUSES.includes(status.value)) {
      return finishedLogId.value
    }
    return null
  })

  function addError (message: string): void {
    alerts.addAlert({ success: false, errorMessage: message })
  }

  function reset (): void {
    status.value = 'running'
    currentStage.value = null
    stages.value = []
    lines.value = []
    error.value = null
    warning.value = null
    offset = 0
    panelLogId = null
    finishedLogId.value = null
    streamPushActive = false
    cancelling.value = false
  }

  function stopPolling (): void {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function wsConnected (): boolean {
    const current = connection()
    return current !== null && current.state === 'connected'
  }

  function bindWebsocketState (): void {
    const current = connection()
    if (disposed || !current || wsStateHandler) {
      return
    }
    wsStateHandler = states => {
      if (!options.active() || !isLiveMode.value) {
        return
      }
      if (states.current === 'connected') {
        // heal any gap created while the connection was down
        void pollLive()
      }
      // reconnect / disconnect may switch between push and poll
      schedulePoll()
    }
    boundConnection = current
    current.bind('state_change', wsStateHandler)
  }

  function unbindWebsocketState (): void {
    if (boundConnection && wsStateHandler) {
      boundConnection.unbind('state_change', wsStateHandler)
    }
    wsStateHandler = null
    boundConnection = null
  }

  function schedulePoll (): void {
    stopPolling()
    if (disposed) {
      return
    }
    bindWebsocketState()
    // Skip the timer only when the socket is healthy AND lines/stages already arrive through `DeployLogUpdated` (the streaming
    // path). A connected socket alone is not enough: engines without NDJSON never push lines and still need HTTP polling.
    if (wsConnected() && streamPushActive) {
      return
    }
    pollTimer = setTimeout(() => {
      // A hidden tab only re-arms the timer; the first visible tick reads the log again.
      if (isPageHidden()) {
        schedulePoll()
        return
      }
      void pollLive()
    }, POLL_INTERVAL)
  }

  async function resolveFinishedLogId (): Promise<void> {
    if (panelLogId) {
      finishedLogId.value = panelLogId
      return
    }
    try {
      const logs = await listDeployLogs(options.instanceId() as number | string)
      if (Array.isArray(logs) && logs.length > 0) {
        finishedLogId.value = logs[0]!.id
      }
    } catch {
      // download button stays hidden
    }
  }

  function applyLog (log: DeployLogDetail): void {
    stages.value = stagesOf(log)
    currentStage.value = stages.value.length > 0 ? stages.value.at(-1)!.name : null
    lines.value = Array.isArray(log.lines) ? log.lines as DeployLogLine[] : []
  }

  async function finishFromTerminalStatus (terminal: string): Promise<void> {
    status.value = terminal
    stopPolling()
    await resolveFinishedLogId()
    if (lines.value.length === 0 && finishedLogId.value) {
      try {
        const log = await getDeployLog(options.instanceId() as number | string, finishedLogId.value)
        applyLog(log)
        error.value = log.error || error.value
        warning.value = log.warning || warning.value
      } catch {
        // keep whatever we already have
      }
    }
    options.onTerminal?.(status.value)
  }

  async function pollLive (final = false): Promise<void> {
    if (disposed || !isLiveMode.value || (!final && !options.active())) {
      return
    }
    if (final && TERMINAL_STATUSES.includes(status.value)) {
      return
    }
    if (!options.instanceId()) {
      if (!final) {
        schedulePoll()
      }
      return
    }
    if (polling) {
      if (final) {
        finalReadPending = true
      }
      return
    }
    polling = true
    let finished = false
    try {
      const data: DeployLogsLive = await getDeployLogsLive(options.instanceId() as number | string, offset)
      if (disposed) {
        return
      }
      contentLoading.value = false

      if (data.panel) {
        panelLogId = data.panel.id
      }

      const engine = data.engine
      if (engine && engine.status !== 'none') {
        status.value = engine.status
        currentStage.value = engine.stage ?? null
        stages.value = Array.isArray(engine.stages) ? engine.stages : []
        if (Array.isArray(engine.lines) && engine.lines.length > 0) {
          lines.value = lines.value.concat(engine.lines as DeployLogLine[])
        }
        offset = engine.next_offset ?? offset
        if (engine.error) {
          error.value = engine.error
        }
        if (engine.warning) {
          warning.value = engine.warning
        }
      }

      if (TERMINAL_STATUSES.includes(status.value)) {
        await finishFromTerminalStatus(status.value)
        finished = true
        return
      }
    } catch {
      // keep polling: the deploy job may not have started on the engine yet
    } finally {
      polling = false
    }
    if (finalReadPending) {
      finalReadPending = false
      await pollLive(true)
      return
    }
    if (finished) {
      return
    }
    if (final) {
      await concludeFromHistory()
      return
    }
    schedulePoll()
  }

  /** One last read of the log after the screen stopped following a live run. */
  async function readFinal (): Promise<void> {
    if (disposed || !isLiveMode.value || TERMINAL_STATUSES.includes(status.value)) {
      return
    }
    await pollLive(true)
  }

  /** The newest history log's end, when the live endpoint no longer serves a deploy that ended at offset 0. */
  async function concludeFromHistory (): Promise<void> {
    if (!options.instanceId()) {
      return
    }
    try {
      const logs = await listDeployLogs(options.instanceId() as number | string)
      const newest = Array.isArray(logs) ? logs[0] : undefined
      if (newest && TERMINAL_STATUSES.includes(newest.status ?? '')) {
        await finishFromTerminalStatus(newest.status as string)
      }
    } catch {
      // the last frame stays as it is
    }
  }

  function onDeployLogUpdated (raw: Record<string, unknown> | undefined): void {
    const payload = (raw ?? {}) as DeployLogUpdatedPayload
    if (!options.active() || !isLiveMode.value || polling) {
      return
    }
    if (Number(payload.application_id) !== Number(options.instanceId())) {
      return
    }
    if (payload.status && payload.status !== 'running') {
      // a terminal status carries no lines: reconcile once, then finish
      const terminal = payload.status
      void pollLive().then(() => {
        if (!TERMINAL_STATUSES.includes(status.value)) {
          void finishFromTerminalStatus(terminal)
        }
      })
      return
    }
    if (Array.isArray(payload.stages) && payload.stages.length > 0) {
      stages.value = payload.stages
      streamPushActive = true
      schedulePoll()
    }
    if (payload.stage) {
      currentStage.value = payload.stage
    }
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      return
    }
    const base = Number(payload.base_offset ?? -1)
    if (base === offset) {
      lines.value = lines.value.concat(payload.lines)
      offset = Number(payload.next_offset ?? offset + payload.lines.length)
      streamPushActive = true
      schedulePoll()
    } else if (base > offset) {
      // event(s) lost while the websocket was reconnecting: one HTTP reconcile closes the gap
      void pollLive()
    }
    // base < offset: stale or duplicate chunk, ignore
  }

  async function loadHistory (): Promise<void> {
    contentLoading.value = true
    reset()
    try {
      const log = await getDeployLog(options.instanceId() as number | string, options.logId() as number | string)
      status.value = log.status
      applyLog(log)
      error.value = log.error ?? null
      warning.value = log.warning ?? null
    } catch (loadError) {
      addError(getErrorMessage(loadError))
      options.onLoadError?.(loadError)
    } finally {
      contentLoading.value = false
    }
  }

  async function cancelDeploy (): Promise<boolean> {
    // The cancel of the create's own project (a files create whose archive this browser still uploads) stops that sequence:
    // there is no Engine deploy yet. A cancel naming another project is that project's deploy, which the Engine cancels.
    if (cancelFilesCreate(options.instanceId() ?? undefined)) {
      return true
    }
    cancelling.value = true
    try {
      await cancelDeployRequest(options.instanceId() as number | string)
      return true
    } catch (cancelError) {
      addError(getErrorMessage(cancelError))
      return false
    } finally {
      cancelling.value = false
    }
  }

  async function download (): Promise<void> {
    if (!downloadLogId.value) {
      return
    }
    downloading.value = true
    try {
      await downloadDeployLog(options.instanceId() as number | string, downloadLogId.value)
    } catch (downloadError) {
      addError(getErrorMessage(downloadError))
    } finally {
      downloading.value = false
    }
  }

  function start (): void {
    stopPolling()
    started = true
    contentLoading.value = true
    if (isLiveMode.value) {
      bindWebsocketState()
      reset()
      void pollLive()
    } else if (options.logId()) {
      void loadHistory()
    } else {
      contentLoading.value = false
    }
  }

  watch(options.active, active => {
    if (active) {
      if (!started) {
        start()
      }
    } else {
      // Closed: nothing may keep polling. The next open starts again (`started` is per open).
      stopPolling()
      started = false
    }
  })

  watch(options.instanceId, id => {
    if (id && options.active() && !started) {
      start()
    }
  })

  watch(options.logId, () => {
    if (options.active()) {
      start()
    }
  })

  // An open screen can learn only after the list is read that the run it shows is still going (its newest log is `running`): switching to
  // live mode has to restart the data layer, or nothing follows that deploy.
  watch(options.live, () => {
    if (options.active() && started) {
      start()
    }
  })

  useAppEvent('deploy-log-updated', onDeployLogUpdated)

  onMounted(() => {
    if (options.active() && !started) {
      start()
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    unbindWebsocketState()
    stopPolling()
  })

  return {
    status,
    currentStage,
    stages,
    lines,
    error,
    warning,
    isLiveMode,
    isRunning,
    downloadLogId,
    finishedLogId,
    contentLoading,
    cancelling,
    downloading,
    cancelDeploy,
    download,
    readFinal,
  }
}
