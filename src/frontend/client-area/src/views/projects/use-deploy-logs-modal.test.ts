import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelDeploy, downloadDeployLog, listDeployLogs } from '@/entities/project/instance-deploy-logs.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { beginFilesCreate, endFilesCreate, filesCreateCancelled, setFilesCreateProject } from '@/shared/files/files-create'
import { useDeployLogsModal } from './use-deploy-logs-modal'

vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  listDeployLogs: vi.fn(),
  downloadDeployLog: vi.fn(),
  cancelDeploy: vi.fn(),
}))

function setup () {
  setActivePinia(createPinia())
  return { modal: useDeployLogsModal({ t: key => `t:${key}` }), alerts: useAlertsStore() }
}

const running = { id: 7, hasInstallInProgress: () => true }
const idle = { id: 7, hasInstallInProgress: () => false }

describe('useDeployLogsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    endFilesCreate()
  })

  it('opens live without looking up a log while the deploy runs', async () => {
    const { modal } = setup()
    await modal.openDeployLogs(running)
    expect(modal.isOpen.value).toBe(true)
    expect(modal.live.value).toBe(true)
    expect(modal.instanceId.value).toBe(7)
    expect(modal.logId.value).toBeNull()
    expect(listDeployLogs).not.toHaveBeenCalled()
  })

  it('opens the newest run when no deploy runs, not an older cancelled one', async () => {
    // Show Logs shows the newest run, as Advanced > Logs now does: the tester's finished-with-warnings run, a cancelled one behind it.
    vi.mocked(listDeployLogs).mockResolvedValue([{ id: 31, status: 'finished' }, { id: 30, status: 'cancelled' }])
    const { modal } = setup()
    const opening = modal.openDeployLogs(idle)
    expect(modal.isOpen.value).toBe(true)
    expect(modal.live.value).toBe(false)
    expect(modal.logId.value).toBeNull()
    await opening
    expect(modal.logId.value).toBe(31)
    expect(modal.noLogs.value).toBe(false)
  })

  it('follows the newest run live when it is still running, even though the instance reports no install', async () => {
    // A redeploy or an upload is not an install: `hasInstallInProgress()` is false and the newest log is `running`.
    vi.mocked(listDeployLogs).mockResolvedValue([{ id: 32, status: 'running' }, { id: 31, status: 'finished' }])
    const { modal } = setup()
    await modal.openDeployLogs(idle)
    expect(modal.live.value).toBe(true)
    expect(modal.logId.value).toBeNull()
    expect(modal.noLogs.value).toBe(false)
  })

  it('shows "no deploys" for an empty list and for a failed lookup, and resets on the next open', async () => {
    const { modal } = setup()
    vi.mocked(listDeployLogs).mockResolvedValueOnce([])
    await modal.openDeployLogs(idle)
    expect(modal.noLogs.value).toBe(true)

    vi.mocked(listDeployLogs).mockRejectedValueOnce(new Error('500'))
    await modal.openDeployLogs(idle)
    expect(modal.noLogs.value).toBe(true)

    vi.mocked(listDeployLogs).mockResolvedValueOnce([{ id: 5 }])
    await modal.openDeployLogs(idle)
    expect(modal.noLogs.value).toBe(false)
    expect(modal.logId.value).toBe(5)

    modal.closeDeployLogs()
    expect(modal.isOpen.value).toBe(false)
  })

  it('downloads the latest log, alerts when there is none, alerts the server message on a failure', async () => {
    const { modal, alerts } = setup()
    vi.mocked(listDeployLogs).mockResolvedValueOnce([{ id: 31 }])
    await modal.downloadDeployLogs(idle)
    expect(downloadDeployLog).toHaveBeenCalledWith(7, 31)

    vi.mocked(listDeployLogs).mockResolvedValueOnce([])
    await modal.downloadDeployLogs(idle)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 't:deployLogs.noDeploys' })

    vi.mocked(listDeployLogs).mockRejectedValueOnce({ response: { status: 500, data: { message: 'Down.' } } })
    await modal.downloadDeployLogs(idle)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Down.' })
  })

  it('cancels the deploy with a success alert, or the server message on a failure', async () => {
    const { modal, alerts } = setup()
    vi.mocked(cancelDeploy).mockResolvedValueOnce()
    await modal.cancelDeploy(running)
    expect(cancelDeploy).toHaveBeenCalledWith(7)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 't:deployLogs.deployCancelled' })

    vi.mocked(cancelDeploy).mockRejectedValueOnce({ response: { status: 409, data: { message: 'Too late.' } } })
    await modal.cancelDeploy(running)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Too late.' })
  })

  it('cancels the files create of the project instead of sending a deploy cancel the Engine has nothing for', async () => {
    // The create's archive is still uploading: no Engine deploy exists to cancel, so the sequence has to stop.
    beginFilesCreate()
    setFilesCreateProject(7)
    const { modal, alerts } = setup()

    await modal.cancelDeploy(running)

    expect(cancelDeploy).not.toHaveBeenCalled()
    expect(filesCreateCancelled()).toBe(true)
    // The sequence that stops says what the project waits for; this path adds no second alert.
    expect(alerts.activeAlerts).toHaveLength(0)
  })

  it('cancels the deploy itself when the create of another project runs', async () => {
    beginFilesCreate()
    setFilesCreateProject(8)
    const { modal } = setup()
    vi.mocked(cancelDeploy).mockResolvedValueOnce()

    await modal.cancelDeploy(running)

    expect(cancelDeploy).toHaveBeenCalledWith(7)
    expect(filesCreateCancelled()).toBe(false)
  })

  it('cancels the deploy itself while a files create has not resolved its own project yet', async () => {
    // The cancel names a project, so it is that project's deploy: the Engine cancels it.
    beginFilesCreate()
    const { modal, alerts } = setup()
    vi.mocked(cancelDeploy).mockResolvedValueOnce()

    await modal.cancelDeploy(running)

    expect(cancelDeploy).toHaveBeenCalledWith(7)
    expect(filesCreateCancelled()).toBe(false)
    expect(alerts.activeAlerts.at(-1)).toMatchObject({ success: true, successMessage: 't:deployLogs.deployCancelled' })
  })
})
