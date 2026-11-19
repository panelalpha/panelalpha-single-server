import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getGitLogs, getGitStatus } from './git.api'
import { useGitPage } from './use-git-page'

vi.mock('./git.api', () => ({
  getGitStatus: vi.fn(),
  getGitLogs: vi.fn(),
}))

function status (overrides: Record<string, unknown> = {}) {
  return {
    connected: true,
    has_synced_once: true,
    commits_behind: 0,
    commits_ahead: 0,
    async_status: { git_auto_deploy: null },
    ...overrides,
  }
}

function instanceRef () {
  return ref({ id: 9 } as unknown as InstanceResource)
}

const LOGS = { data: [], meta: { total: 0, last_page: 1 } }

describe('useGitPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.mocked(getGitLogs).mockResolvedValue(LOGS)
  })

  describe('fetchGitStatus', () => {
    it('fetches the logs for a connected pair and, before the setup check, re-reads the status once', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ has_synced_once: false }))
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus({ silent: true })
      await flushPromises()

      expect(getGitStatus).toHaveBeenCalledTimes(2)
      expect(getGitLogs).toHaveBeenCalledTimes(1)
      expect(getGitLogs).toHaveBeenCalledWith(9, { page: 1, perPage: 5 })
      expect(page.setupBannerChecked.value).toBe(true)
      expect(page.setupBannerChecking.value).toBe(false)
    })

    it('does not re-read the status when the pair has already synced', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ has_synced_once: true }))
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus({ silent: true })
      await flushPromises()

      expect(getGitStatus).toHaveBeenCalledTimes(1)
      expect(getGitLogs).toHaveBeenCalledTimes(1)
      expect(page.setupBannerChecked.value).toBe(false)
    })

    it('clears the logs and skips the logs request for an unconnected instance', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ connected: false, has_synced_once: false }))
      const page = useGitPage(instanceRef())
      page.logs.value = [{ action: 'pull', status: 'success', commit_hash: null, commit_message: null, error_message: null, created_at: '' }]
      page.logsTotal.value = 4
      page.logsPage.value = 3

      await page.fetchGitStatus()
      await flushPromises()

      expect(getGitLogs).not.toHaveBeenCalled()
      expect(getGitStatus).toHaveBeenCalledTimes(1)
      expect(page.logs.value).toEqual([])
      expect(page.logsTotal.value).toBe(0)
      expect(page.logsPage.value).toBe(1)
    })

    it('clears the loading flag after a non-silent fetch and leaves it alone for a silent one', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ connected: false }))
      const page = useGitPage(instanceRef())
      expect(page.loading.value).toBe(true)

      await page.fetchGitStatus({ silent: true })
      expect(page.loading.value).toBe(true)

      await page.fetchGitStatus()
      expect(page.loading.value).toBe(false)
    })

    it('flags an unsupported hosting without an alert', async () => {
      vi.mocked(getGitStatus).mockRejectedValue({ response: { status: 422, data: { message: 'Git is not supported here.' } } })
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus()

      expect(page.hostingUnsupported.value).toBe(true)
      expect(useAlertsStore().activeAlerts).toEqual([])
      expect(page.loading.value).toBe(false)
    })

    it('shows an alert with the error message for any other failure and keeps the status', async () => {
      vi.mocked(getGitStatus).mockRejectedValue({ response: { status: 500, data: { message: 'Boom.' } } })
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus()

      expect(page.hostingUnsupported.value).toBe(false)
      expect(useAlertsStore().activeAlerts).toEqual([expect.objectContaining({ success: false, errorMessage: 'Boom.' })])
      expect(page.gitStatus.value.connected).toBe(false)
    })
  })

  describe('refreshGitStatus', () => {
    it('only replaces the status: no logs and no loading change', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ branch: 'main' }))
      const page = useGitPage(instanceRef())

      await page.refreshGitStatus()

      expect(getGitStatus).toHaveBeenCalledWith(9)
      expect(page.gitStatus.value.branch).toBe('main')
      expect(getGitLogs).not.toHaveBeenCalled()
      expect(page.loading.value).toBe(true)
    })
  })

  describe('status staleness', () => {
    it('keeps the newer status when an older response arrives later', async () => {
      let resolveSlow: (value: unknown) => void = () => {}
      vi.mocked(getGitStatus)
        .mockReturnValueOnce(new Promise(resolve => {
          resolveSlow = resolve
        }) as never)
        .mockResolvedValueOnce(status({ branch: 'newer' }))
      const page = useGitPage(instanceRef())

      const slowTick = page.fetchGitStatus({ silent: true })
      await page.refreshGitStatus()
      resolveSlow(status({ branch: 'older' }))
      await slowTick

      expect((page.gitStatus.value as { branch?: string }).branch).toBe('newer')
    })
  })

  describe('bootstrap', () => {
    it('reads the status twice for a connected pair', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ has_synced_once: true }))
      const page = useGitPage(instanceRef())

      await page.bootstrap()
      await flushPromises()

      expect(getGitStatus).toHaveBeenCalledTimes(2)
      expect(page.loading.value).toBe(false)
    })

    it('reads the status once for an unconnected instance', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ connected: false }))
      const page = useGitPage(instanceRef())

      await page.bootstrap()

      expect(getGitStatus).toHaveBeenCalledTimes(1)
    })

    it('resolves without an unhandled rejection when the second read fails', async () => {
      vi.mocked(getGitStatus)
        .mockResolvedValueOnce(status({ has_synced_once: true }))
        .mockRejectedValueOnce(new Error('network'))
      const page = useGitPage(instanceRef())

      await expect(page.bootstrap()).resolves.toBeUndefined()
    })
  })

  it('tracks the busy flags per action', () => {
    const page = useGitPage(instanceRef())

    page.setSubmitting('pull', true)
    expect(page.submitting.pull).toBe(true)
    expect(page.submitting.push).toBe(false)

    page.setSubmitting('pull', false)
    expect(page.submitting.pull).toBe(false)
  })

  describe('logs', () => {
    function logRow (action: string) {
      return { action, status: 'success', commit_hash: null, commit_message: null, error_message: null, created_at: '2026-10-20T12:34:56.000000Z' }
    }

    function connectedPage () {
      const page = useGitPage(instanceRef())
      page.gitStatus.value = status() as never
      return page
    }

    it('starts on page 1 with 5 rows per page', () => {
      const page = useGitPage(instanceRef())

      expect(page.logsPage.value).toBe(1)
      expect(page.logsPerPage.value).toBe(5)
    })

    it('loads the current page and size and stores the rows and the total', async () => {
      vi.mocked(getGitLogs).mockResolvedValue({ data: [logRow('pull')], meta: { total: 12, last_page: 3 } })
      const page = connectedPage()

      await page.fetchGitLogs()

      expect(getGitLogs).toHaveBeenCalledWith(9, { page: 1, perPage: 5 })
      expect(page.logs.value).toEqual([logRow('pull')])
      expect(page.logsTotal.value).toBe(12)
      expect(page.logsLoading.value).toBe(false)
    })

    it('does not request the logs of an unconnected instance', async () => {
      const page = useGitPage(instanceRef())

      await page.fetchGitLogs()

      expect(getGitLogs).not.toHaveBeenCalled()
    })

    it('changing the page requests that page', async () => {
      const page = connectedPage()

      await page.changeLogsPage(3)

      expect(getGitLogs).toHaveBeenCalledWith(9, { page: 3, perPage: 5 })
      expect(page.logsPage.value).toBe(3)
    })

    it('changing the size goes back to page 1', async () => {
      const page = connectedPage()
      page.logsPage.value = 4

      await page.changeLogsPerPage(15)

      expect(getGitLogs).toHaveBeenCalledWith(9, { page: 1, perPage: 15 })
      expect(page.logsPage.value).toBe(1)
      expect(page.logsPerPage.value).toBe(15)
    })

    it('ignores a response that a newer request has overtaken', async () => {
      let resolveFirst: (value: unknown) => void = () => {}
      vi.mocked(getGitLogs)
        .mockReturnValueOnce(new Promise(resolve => {
          resolveFirst = resolve
        }) as never)
        .mockResolvedValueOnce({ data: [logRow('second')], meta: { total: 7, last_page: 2 } })
      const page = connectedPage()

      const first = page.fetchGitLogs()
      await page.changeLogsPage(2)
      resolveFirst({ data: [logRow('first')], meta: { total: 99, last_page: 9 } })
      await first

      expect(page.logs.value).toEqual([logRow('second')])
      expect(page.logsTotal.value).toBe(7)
      expect(page.logsLoading.value).toBe(false)
    })

    it('a late response does not refill the logs after a disconnect', async () => {
      let resolveLogs: (value: unknown) => void = () => {}
      vi.mocked(getGitLogs).mockReturnValueOnce(new Promise(resolve => {
        resolveLogs = resolve
      }) as never)
      vi.mocked(getGitStatus).mockResolvedValue(status({ connected: false }))
      const page = connectedPage()

      const pending = page.fetchGitLogs()
      await page.fetchGitStatus({ silent: true })
      resolveLogs({ data: [logRow('pull')], meta: { total: 1, last_page: 1 } })
      await pending

      expect(page.logs.value).toEqual([])
      expect(page.logsTotal.value).toBe(0)
    })
  })

  describe('auto-deploy polling', () => {
    const IN_PROGRESS = status({ async_status: { git_auto_deploy: 'in_progress' } })

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('starts a 5 s poll while the auto-deploy is in progress, and each tick reads the status silently', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(IN_PROGRESS)
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus({ silent: true })
      expect(getGitStatus).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(4999)
      expect(getGitStatus).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(getGitStatus).toHaveBeenCalledTimes(2)
      page.stopPolling()
    })

    it('does not poll when the auto-deploy is not in progress', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(status({ async_status: { git_auto_deploy: 'finished' } }))
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus({ silent: true })
      await vi.advanceTimersByTimeAsync(15_000)

      expect(getGitStatus).toHaveBeenCalledTimes(1)
    })

    it('stops the poll and fetches the logs once more when a tick finds the deploy finished', async () => {
      vi.mocked(getGitStatus)
        .mockResolvedValueOnce(IN_PROGRESS)
        .mockResolvedValue(status({ async_status: { git_auto_deploy: 'finished' } }))
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus({ silent: true })
      expect(getGitLogs).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(5000)
      // The tick's own silent status read fetches the logs, then the poll stopped and the tick fetches them again.
      expect(getGitLogs).toHaveBeenCalledTimes(3)

      await vi.advanceTimersByTimeAsync(20_000)
      expect(getGitStatus).toHaveBeenCalledTimes(2)
    })

    it('keeps a single interval when the status is read again while the poll runs', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(IN_PROGRESS)
      const page = useGitPage(instanceRef())

      await page.fetchGitStatus({ silent: true })
      await page.fetchGitStatus({ silent: true })
      await vi.advanceTimersByTimeAsync(5000)

      expect(getGitStatus).toHaveBeenCalledTimes(3)
      page.stopPolling()
    })

    it('stops the poll when the page scope is disposed', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(IN_PROGRESS)
      const scope = effectScope()
      const page = scope.run(() => useGitPage(instanceRef()))!

      await page.fetchGitStatus({ silent: true })
      scope.stop()
      await vi.advanceTimersByTimeAsync(20_000)

      expect(getGitStatus).toHaveBeenCalledTimes(1)
    })

    it('does not start a poll when a status response arrives after the page scope was disposed', async () => {
      let resolveStatus: (value: unknown) => void = () => {}
      vi.mocked(getGitStatus).mockReturnValueOnce(new Promise(resolve => {
        resolveStatus = resolve
      }) as never)
      const scope = effectScope()
      const page = scope.run(() => useGitPage(instanceRef()))!

      const pending = page.fetchGitStatus({ silent: true })
      scope.stop()
      resolveStatus(IN_PROGRESS)
      await pending
      await vi.advanceTimersByTimeAsync(20_000)

      expect(getGitStatus).toHaveBeenCalledTimes(1)
    })

    it('can be started again after a stop without doubling the interval', async () => {
      vi.mocked(getGitStatus).mockResolvedValue(IN_PROGRESS)
      const page = useGitPage(instanceRef())

      page.startPolling()
      page.stopPolling()
      page.startPolling()
      page.startPolling()
      await vi.advanceTimersByTimeAsync(5000)

      expect(getGitStatus).toHaveBeenCalledTimes(1)
      page.stopPolling()
    })
  })
})
