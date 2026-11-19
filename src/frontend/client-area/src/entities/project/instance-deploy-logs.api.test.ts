import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { cancelDeploy, downloadDeployLog, getDeployLog, getDeployLogsLive, listDeployLogs } from './instance-deploy-logs.api'

vi.mock('@/shared/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiBaseUrl: () => '/api',
}))

describe('instance-deploy-logs.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists the deploy logs of an instance and unwraps data', async () => {
    const logs = [{ id: 31, status: 'finished', source_type: 'git', created_at: '2026-10-01T10:00:00Z' }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: logs } })

    expect(await listDeployLogs(7)).toEqual(logs)
    expect(api.get).toHaveBeenCalledWith('/instances/7/deploy-logs')
  })

  it('reads one deploy log by id and unwraps data', async () => {
    const log = { status: 'failed', stages: [{ name: 'build' }], lines: [{ msg: 'boom' }], error: 'x' }
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: log } })

    expect(await getDeployLog(7, 31)).toEqual(log)
    expect(api.get).toHaveBeenCalledWith('/instances/7/deploy-logs/31')
  })

  it('reads the live deploy state from the given offset, defaulting to 0', async () => {
    const live = { panel: { id: 31 }, engine: { status: 'running', next_offset: 4 } }
    vi.mocked(api.get).mockResolvedValue({ data: { data: live } })

    expect(await getDeployLogsLive(7, 4)).toEqual(live)
    expect(api.get).toHaveBeenLastCalledWith('/instances/7/deploy-logs/live?offset=4')

    await getDeployLogsLive(7)
    expect(api.get).toHaveBeenLastCalledWith('/instances/7/deploy-logs/live?offset=0')
  })

  it('posts the cancel request for the instance deploy', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({})

    await cancelDeploy(7)

    expect(api.post).toHaveBeenCalledWith('/instances/7/deploy-cancel')
  })

  it('saves the log text as a txt file named by the server, falling back to the log id', async () => {
    const click = vi.fn()
    const revokeObjectURL = vi.fn()
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:deploy')
    URL.revokeObjectURL = revokeObjectURL
    const link = { href: '', download: '', click }
    vi.spyOn(document, 'createElement').mockReturnValueOnce(link as unknown as HTMLElement)

    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: 'log text', filename: 'deploy.txt' } })
    await downloadDeployLog(7, 31)
    expect(api.get).toHaveBeenCalledWith('/instances/7/deploy-logs/31/download')
    expect(link.download).toBe('deploy.txt')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:deploy')

    vi.spyOn(document, 'createElement').mockReturnValueOnce(link as unknown as HTMLElement)
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: 'log text' } })
    await downloadDeployLog(7, 31)
    expect(link.download).toBe('deploy-log-31.txt')

    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    vi.restoreAllMocks()
  })
})
