import type { Ref } from 'vue'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { getCurrentScope, onScopeDispose, reactive, ref } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { isPageHidden } from '@/shared/browser/page-visibility'
import { type GitAction, type GitLog, type GitStatus, isAutoDeployInProgress, isHostingUnsupported, showSetupBanner } from './git-status'
import { getGitLogs, getGitStatus } from './git.api'

// `fetchGitStatus` carries the side effects (logs, setup-banner check, polling), `refreshGitStatus` only replaces the status.

const LOGS_PER_PAGE_DEFAULT = 5
// The auto-deploy poll ticks every 5 s.
const AUTO_DEPLOY_POLL_MS = 5000

function initialGitStatus (): GitStatus {
  return {
    connected: false,
    repo_url: null,
    branch: null,
    pair_branch: null,
    last_deployed_commit_hash: null,
    last_deployed_commit_message: null,
    last_deployed_commit_at: null,
    has_synced_once: false,
    drift_status: null,
    commits_behind: null,
    commits_ahead: null,
    remote_branch_exists: null,
    local_repository_exists: null,
    show_drift_banner: false,
    connection_health: { status: 'ok', reason: null },
    auto_deploy_enabled: false,
    webhook_registered: false,
    async_status: { git_attach: null, git_pull: null, git_auto_deploy: null },
  }
}

export function useGitPage (instance: Ref<InstanceResource>) {
  const alerts = useAlertsStore()

  const gitStatus = ref<GitStatus>(initialGitStatus())
  const loading = ref(true)
  const hostingUnsupported = ref(false)
  const setupBannerChecking = ref(false)
  const setupBannerChecked = ref(false)
  const submitting = reactive<Record<GitAction, boolean>>({
    connect: false,
    pull: false,
    push: false,
    revert: false,
    ignoreDrift: false,
    check: false,
    autoDeploy: false,
    credentials: false,
    repair: false,
  })

  const logs = ref<GitLog[]>([])
  const logsTotal = ref(0)
  const logsPage = ref(1)
  const logsPerPage = ref(LOGS_PER_PAGE_DEFAULT)
  const logsLoading = ref(false)
  // Only the newest logs request may write the table: a quick page change must not let an older response win.
  let latestLogsRequest = 0
  let latestStatusRequest = 0

  function setSubmitting (action: GitAction, value: boolean): void {
    submitting[action] = value
  }

  function resetLogs (): void {
    // Also drops a request still in flight, so its late response cannot refill a disconnected page.
    latestLogsRequest += 1
    logs.value = []
    logsTotal.value = 0
    logsPage.value = 1
    logsLoading.value = false
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null
  // Set when the page scope is disposed: a status response still in flight must not start a poll nothing would stop.
  let disposed = false

  /** One interval at a time. */
  function startPolling (): void {
    if (disposed || pollTimer !== null) {
      return
    }
    pollTimer = setInterval(() => {
      // A hidden tab skips the tick; the next visible one reads the status again.
      if (!isPageHidden()) {
        void pollTick()
      }
    }, AUTO_DEPLOY_POLL_MS)
  }

  function stopPolling (): void {
    if (pollTimer === null) {
      return
    }
    clearInterval(pollTimer)
    pollTimer = null
  }

  /**
   * The poll tick: a silent status read, which fetches the logs itself; once the deploy is no longer in progress the
   * tick fetches the logs once more, as legacy does.
   */
  async function pollTick (): Promise<void> {
    await fetchGitStatus({ silent: true })
    if (!isAutoDeployInProgress(gitStatus.value)) {
      void fetchGitLogs()
    }
  }

  /** The poll runs while an auto-deploy is in progress, and stops otherwise. */
  function syncPolling (): void {
    if (isAutoDeployInProgress(gitStatus.value)) {
      startPolling()
    } else {
      stopPolling()
    }
  }

  // The poll stops with the page. Outside a scope (a plain call) there is nothing to dispose.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      stopPolling()
    })
  }

  /** Only the latest request writes the table and clears the loading flag. */
  async function fetchGitLogs (): Promise<void> {
    if (!gitStatus.value.connected) {
      return
    }

    latestLogsRequest += 1
    const request = latestLogsRequest
    logsLoading.value = true
    try {
      const page = await getGitLogs(instance.value.id, { page: logsPage.value, perPage: logsPerPage.value })
      if (request !== latestLogsRequest) {
        return
      }
      logs.value = page.data
      logsTotal.value = page.meta.total
    } catch (error) {
      if (request === latestLogsRequest) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (request === latestLogsRequest) {
        logsLoading.value = false
      }
    }
  }

  function changeLogsPage (page: number): Promise<void> {
    logsPage.value = page
    return fetchGitLogs()
  }

  /** A new size starts again on page 1. */
  function changeLogsPerPage (perPage: number): Promise<void> {
    logsPage.value = 1
    logsPerPage.value = perPage
    return fetchGitLogs()
  }

  /**
   * One `GET /git` that writes `gitStatus`. Only the newest request writes it (as the logs do): a slow poll response must not overwrite the
   * status an action has read since. The side effects of `fetchGitStatus` still run on the current status.
   */
  async function readGitStatus (): Promise<void> {
    latestStatusRequest += 1
    const request = latestStatusRequest
    const status = await getGitStatus(instance.value.id)
    if (request === latestStatusRequest) {
      gitStatus.value = status
    }
  }

  /** A plain `GET /git`, no loading flag, no logs, no polling. */
  async function refreshGitStatus (): Promise<void> {
    await readGitStatus()
  }

  /** Runs on every entry, poll tick and action that refetches the status (silent for the actions). */
  async function fetchGitStatus (options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
      loading.value = true
    }

    try {
      await readGitStatus()
      hostingUnsupported.value = false
      syncPolling()

      if (!gitStatus.value.connected) {
        resetLogs()
        return
      }

      void fetchGitLogs()
      // The setup banner check runs only for a connected pair that has not synced yet.
      if (showSetupBanner(gitStatus.value) && !setupBannerChecked.value) {
        setupBannerChecked.value = true
        setupBannerChecking.value = true
        void refreshGitStatus()
          .catch(() => {})
          .finally(() => {
            setupBannerChecking.value = false
          })
      }
    } catch (error) {
      if (isHostingUnsupported(error)) {
        hostingUnsupported.value = true
      } else {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (!options.silent) {
        loading.value = false
      }
    }
  }

  /** The status, then a second status read for a connected pair. */
  async function bootstrap (): Promise<void> {
    await fetchGitStatus()

    if (!gitStatus.value.connected) {
      return
    }

    // Legacy awaits this with no catch; the empty catch keeps a failed re-read from becoming an unhandled rejection.
    await refreshGitStatus().catch(() => {})
  }

  return {
    gitStatus,
    loading,
    hostingUnsupported,
    setupBannerChecking,
    setupBannerChecked,
    submitting,
    setSubmitting,
    logs,
    logsTotal,
    logsPage,
    logsPerPage,
    logsLoading,
    fetchGitStatus,
    refreshGitStatus,
    fetchGitLogs,
    changeLogsPage,
    changeLogsPerPage,
    bootstrap,
    startPolling,
    stopPolling,
  }
}
