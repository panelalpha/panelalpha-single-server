import type { EchoConnection } from '@/shared/realtime/echo-client'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { beginFilesCreate, endFilesCreate, filesCreateCancelled, setFilesCreateProject } from '@/shared/files/files-create'
import { cancelDeploy, downloadDeployLog, getDeployLog, getDeployLogsLive, listDeployLogs } from './instance-deploy-logs.api'
import { POLL_INTERVAL, useDeployLogs } from './use-deploy-logs'

vi.mock('./instance-deploy-logs.api', () => ({
  getDeployLogsLive: vi.fn(),
  getDeployLog: vi.fn(),
  listDeployLogs: vi.fn(),
  cancelDeploy: vi.fn(),
  downloadDeployLog: vi.fn(),
}))
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

type Logs = ReturnType<typeof useDeployLogs>

function running (lines: string[], nextOffset: number, stages: unknown[] = [{ name: 'preparing', started_at: 1 }]) {
  return {
    panel: { id: 31 },
    engine: { status: 'running', stage: 'preparing', stages, lines: lines.map(msg => ({ msg })), next_offset: nextOffset },
  }
}

function setup (initial: { isOpen?: boolean, live?: boolean, logId?: number | null } = {}, connection: EchoConnection | null = null) {
  setActivePinia(createPinia())
  const state = reactive({ isOpen: initial.isOpen ?? true, live: initial.live ?? true, logId: initial.logId ?? null as number | null, instanceId: 5 })
  const onTerminal = vi.fn()
  const onLoadError = vi.fn()
  let logs!: Logs
  const Host = defineComponent({
    setup () {
      logs = useDeployLogs({
        instanceId: () => state.instanceId,
        live: () => state.live,
        logId: () => state.logId,
        active: () => state.isOpen,
        onTerminal,
        onLoadError,
        connection: () => connection,
      })
      return () => null
    },
  })
  const wrapper = mount(Host)
  return { state, logs, wrapper, onTerminal, onLoadError, alerts: useAlertsStore() }
}

function fakeConnection (state = 'connected') {
  const bound = new Map<string, (states: { current: string }) => void>()
  const connection: EchoConnection = {
    state,
    bind: vi.fn((event, callback) => {
      bound.set(event, callback)
    }),
    unbind: vi.fn(event => {
      bound.delete(event)
    }),
  }
  return { connection, bound }
}

describe('useDeployLogs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetAppEvents()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('live mode polling', () => {
    it('polls at once, then every 2000 ms with the offset of the previous answer, and collects the lines', async () => {
      vi.mocked(getDeployLogsLive)
        .mockResolvedValueOnce(running(['one'], 1))
        .mockResolvedValueOnce(running(['two'], 2))
        .mockResolvedValue(running([], 2))
      const { logs, wrapper } = setup()

      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)
      expect(getDeployLogsLive).toHaveBeenLastCalledWith(5, 0)
      expect(logs.lines.value.map(line => line.msg)).toEqual(['one'])
      expect(logs.isRunning.value).toBe(true)
      expect(logs.contentLoading.value).toBe(false)

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL - 1)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(2)
      expect(getDeployLogsLive).toHaveBeenLastCalledWith(5, 1)
      expect(logs.lines.value.map(line => line.msg)).toEqual(['one', 'two'])

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(3)
      expect(getDeployLogsLive).toHaveBeenLastCalledWith(5, 2)
      wrapper.unmount()
    })

    it('does not start while the modal is closed, starts on open and stops on close', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      const { state, wrapper } = setup({ isOpen: false })

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 3)
      expect(getDeployLogsLive).not.toHaveBeenCalled()

      state.isOpen = true
      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(2)

      state.isOpen = false
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(2)
      expect(vi.getTimerCount()).toBe(0)

      // the next open polls again, from a clean slate
      state.isOpen = true
      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(3)
      expect(getDeployLogsLive).toHaveBeenLastCalledWith(5, 0)
      wrapper.unmount()
    })

    it('clears the timer on unmount', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      const { wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(1)

      wrapper.unmount()
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 3)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)
    })

    it('does not schedule another poll or bind the socket when unmounted while a poll is in flight', async () => {
      let resolvePoll!: (value: ReturnType<typeof running>) => void
      vi.mocked(getDeployLogsLive).mockReturnValueOnce(new Promise(resolve => {
        resolvePoll = resolve
      }) as never)
      const { connection } = fakeConnection()
      const { wrapper, onTerminal } = setup({}, connection)
      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)

      wrapper.unmount()
      resolvePoll(running(['late'], 1))
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 3)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      expect(connection.bind).toHaveBeenCalledTimes(1)
      expect(onTerminal).not.toHaveBeenCalled()
    })

    it('keeps polling after a failed poll (the job may not have started on the engine)', async () => {
      vi.mocked(getDeployLogsLive).mockRejectedValueOnce(new Error('404')).mockResolvedValue(running(['x'], 1))
      const { logs, wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)
      expect(logs.lines.value).toEqual([])
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      expect(logs.lines.value.map(line => line.msg)).toEqual(['x'])
      wrapper.unmount()
    })

    it('finishes on a terminal status: stops polling, resolves the log id, reports the status', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue({
        panel: { id: 31 },
        engine: { status: 'finished', stage: 'running', stages: [], lines: [{ msg: 'done' }], next_offset: 1 },
      })
      const { logs, onTerminal, wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)

      expect(onTerminal).toHaveBeenCalledWith('finished')
      expect(logs.status.value).toBe('finished')
      expect(logs.isRunning.value).toBe(false)
      expect(logs.downloadLogId.value).toBe(31)
      expect(vi.getTimerCount()).toBe(0)
      wrapper.unmount()
    })
  })

  describe('websocket push', () => {
    it('stops the HTTP timer while deploy-log-updated delivers lines, and resumes when the socket drops', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running(['one'], 1))
      const { connection, bound } = fakeConnection('connected')
      const { logs, wrapper } = setup({}, connection)
      await vi.advanceTimersByTimeAsync(0)
      expect(connection.bind).toHaveBeenCalledWith('state_change', expect.any(Function))
      expect(vi.getTimerCount()).toBe(1)

      // a chunk that continues at the current offset: pushed, so the timer goes away
      emit('deploy-log-updated', { application_id: 5, base_offset: 1, next_offset: 2, lines: [{ msg: 'pushed' }] })
      expect(logs.lines.value.map(line => line.msg)).toEqual(['one', 'pushed'])
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 3)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)

      // the socket drops: polling resumes
      connection.state = 'unavailable'
      bound.get('state_change')!({ current: 'unavailable' })
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(2)
      expect(getDeployLogsLive).toHaveBeenLastCalledWith(5, 2)

      wrapper.unmount()
      expect(connection.unbind).toHaveBeenCalledWith('state_change', expect.any(Function))
    })

    it('keeps polling when the socket is connected but nothing was pushed', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      const { connection } = fakeConnection('connected')
      const { wrapper } = setup({}, connection)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 2)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(3)
      wrapper.unmount()
    })

    it('ignores pushes of another instance, stale chunks and chunks while closed', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running(['one'], 1))
      const { logs, state, wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)

      emit('deploy-log-updated', { application_id: 99, base_offset: 1, next_offset: 2, lines: [{ msg: 'other' }] })
      emit('deploy-log-updated', { application_id: 5, base_offset: 0, next_offset: 1, lines: [{ msg: 'stale' }] })
      expect(logs.lines.value.map(line => line.msg)).toEqual(['one'])

      state.isOpen = false
      await vi.advanceTimersByTimeAsync(0)
      emit('deploy-log-updated', { application_id: 5, base_offset: 1, next_offset: 2, lines: [{ msg: 'closed' }] })
      expect(logs.lines.value.map(line => line.msg)).toEqual(['one'])
      wrapper.unmount()
    })

    it('reconciles over HTTP when a chunk skips ahead of the offset', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      const { wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(1)
      emit('deploy-log-updated', { application_id: 5, base_offset: 7, next_offset: 8, lines: [{ msg: 'gap' }] })
      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLogsLive).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    })
  })

  describe('history mode', () => {
    it('loads the log of the given id once and never polls', async () => {
      vi.mocked(getDeployLog).mockResolvedValue({ status: 'failed', stages: [{ name: 'preparing' }, { name: 'cloning' }], lines: [{ msg: 'boom' }], error: 'Clone failed' })
      const { logs, wrapper } = setup({ live: false, logId: 31 })
      await vi.advanceTimersByTimeAsync(0)

      expect(getDeployLog).toHaveBeenCalledWith(5, 31)
      expect(logs.status.value).toBe('failed')
      expect(logs.currentStage.value).toBe('cloning')
      expect(logs.error.value).toBe('Clone failed')
      expect(logs.warning.value).toBeNull()
      expect(logs.isLiveMode.value).toBe(false)
      expect(logs.downloadLogId.value).toBe(31)
      expect(logs.contentLoading.value).toBe(false)
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 3)
      expect(getDeployLogsLive).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      wrapper.unmount()
    })

    it('loads the log once the id is resolved after the modal opened', async () => {
      vi.mocked(getDeployLog).mockResolvedValue({ status: 'finished', stages: [], lines: [] })
      const { state, logs, wrapper } = setup({ live: false })
      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLog).not.toHaveBeenCalled()
      expect(logs.contentLoading.value).toBe(false)

      state.logId = 44
      await vi.advanceTimersByTimeAsync(0)
      expect(getDeployLog).toHaveBeenCalledWith(5, 44)
      wrapper.unmount()
    })

    it('carries the warning of a deploy the Engine finished with warnings', async () => {
      vi.mocked(getDeployLog).mockResolvedValue({ status: 'finished', stages: [], lines: [], error: null, warning: 'The application started but did not answer on any port it publishes.' })
      const { state, logs, wrapper } = setup({ live: false, logId: 31 })
      await vi.advanceTimersByTimeAsync(0)

      expect(logs.status.value).toBe('finished')
      expect(logs.error.value).toBeNull()
      expect(logs.warning.value).toBe('The application started but did not answer on any port it publishes.')

      // The next deploy read in the same viewer starts without the previous warning.
      vi.mocked(getDeployLog).mockResolvedValue({ status: 'finished', stages: [], lines: [], error: null, warning: null })
      state.logId = 32
      await vi.advanceTimersByTimeAsync(0)
      expect(logs.warning.value).toBeNull()
      wrapper.unmount()
    })

    it('alerts and asks the host to close when the log cannot be loaded', async () => {
      vi.mocked(getDeployLog).mockRejectedValue({ response: { status: 500, data: { message: 'Gone.' } } })
      const { alerts, onLoadError, wrapper } = setup({ live: false, logId: 31 })
      await vi.advanceTimersByTimeAsync(0)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Gone.' })
      expect(onLoadError).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })
  })

  describe('cancel and download', () => {
    it('cancels the deploy of the instance and reports whether it worked', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      vi.mocked(cancelDeploy).mockResolvedValueOnce().mockRejectedValueOnce({ response: { status: 409, data: { message: 'Too late.' } } })
      const { logs, alerts, wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)

      expect(await logs.cancelDeploy()).toBe(true)
      expect(cancelDeploy).toHaveBeenCalledWith(5)
      expect(await logs.cancelDeploy()).toBe(false)
      expect(alerts.activeAlerts[0]).toMatchObject({ success: false, errorMessage: 'Too late.' })
      expect(logs.cancelling.value).toBe(false)
      wrapper.unmount()
    })

    it('stops the files create of the instance instead of asking the Engine to cancel nothing', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      beginFilesCreate()
      setFilesCreateProject(5)
      const { logs, alerts, wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)

      expect(await logs.cancelDeploy()).toBe(true)
      expect(cancelDeploy).not.toHaveBeenCalled()
      expect(filesCreateCancelled()).toBe(true)
      expect(alerts.activeAlerts).toHaveLength(0)
      endFilesCreate()
      wrapper.unmount()
    })

    it('cancels the deploy of the instance while a files create has not resolved its own project yet', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      beginFilesCreate()
      const { logs, wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)

      expect(await logs.cancelDeploy()).toBe(true)
      expect(cancelDeploy).toHaveBeenCalledWith(5)
      expect(filesCreateCancelled()).toBe(false)
      endFilesCreate()
      wrapper.unmount()
    })

    it('downloads the log of the finished deploy, and does nothing without a log id', async () => {
      vi.mocked(getDeployLogsLive).mockResolvedValue(running([], 0))
      vi.mocked(downloadDeployLog).mockResolvedValue()
      vi.mocked(listDeployLogs).mockResolvedValue([])
      const { logs, wrapper } = setup()
      await vi.advanceTimersByTimeAsync(0)
      await logs.download()
      expect(downloadDeployLog).not.toHaveBeenCalled()
      wrapper.unmount()

      vi.mocked(getDeployLog).mockResolvedValue({ status: 'finished', stages: [], lines: [] })
      const history = setup({ live: false, logId: 31 })
      await vi.advanceTimersByTimeAsync(0)
      await history.logs.download()
      expect(downloadDeployLog).toHaveBeenCalledWith(5, 31)
      history.wrapper.unmount()
    })
  })
})
