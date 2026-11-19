import type { DeployLogEntry } from '@/entities/project/instance-deploy-logs.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDeployLog, getDeployLogsLive } from '@/entities/project/instance-deploy-logs.api'
import { mountKit } from '@/test/mount-kit'
import DeployLogsTab from './DeployLogsTab.vue'
import LogLinesTable from './LogLinesTable.vue'
import LogsNoData from './LogsNoData.vue'

vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  listDeployLogs: vi.fn(),
  getDeployLog: vi.fn(),
  getDeployLogsLive: vi.fn(),
  cancelDeploy: vi.fn(),
  downloadDeployLog: vi.fn(),
}))
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

function run (overrides: Partial<DeployLogEntry> = {}): DeployLogEntry {
  return { id: 31, status: 'success', started_at: '2026-10-19T08:30:00Z', finished_at: '2026-10-19T08:31:00Z', source_type: 'git', ...overrides }
}

async function mountTab (props: { selectedLog: DeployLogEntry | null, listLoading?: boolean, searchTerm?: string }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(DeployLogsTab, {
    props: { instanceId: 9, selectedLog: props.selectedLog, listLoading: props.listLoading ?? false, searchTerm: props.searchTerm ?? '' },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

describe('DeployLogsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDeployLog).mockResolvedValue({ status: 'success', stages: [], lines: [{ msg: 'done' }], error: null })
    vi.mocked(getDeployLogsLive).mockResolvedValue({ panel: null, engine: null })
  })

  it('shows the table skeleton while the run list loads', async () => {
    const wrapper = await mountTab({ selectedLog: null, listLoading: true })

    const table = wrapper.findComponent(LogLinesTable)
    expect(table.props('loading')).toBe(true)
    expect(table.props('kind')).toBe('deploy')
    expect(wrapper.findComponent(LogsNoData).exists()).toBe(false)
  })

  it('shows the empty state when no run is selected', async () => {
    const wrapper = await mountTab({ selectedLog: null })

    const noData = wrapper.findComponent(LogsNoData)
    expect(noData.props('title')).toBe('deployLogs.noDeploys')
    expect(noData.props('description')).toBe('deployLogs.noDeploysSubtitle')
    expect(wrapper.findComponent(LogLinesTable).exists()).toBe(false)
    expect(getDeployLog).not.toHaveBeenCalled()
  })

  it('loads the history of a finished run by its id into the table, newest first', async () => {
    vi.mocked(getDeployLog).mockResolvedValue({ status: 'success', stages: [], lines: [{ msg: 'first' }, { msg: 'last' }], error: null })
    const wrapper = await mountTab({ selectedLog: run() })

    expect(getDeployLog).toHaveBeenCalledWith(9, 31)
    expect(getDeployLogsLive).not.toHaveBeenCalled()
    const table = wrapper.findComponent(LogLinesTable)
    expect(table.props('kind')).toBe('deploy')
    expect(table.props('hasMore')).toBe(false)
    expect(wrapper.emitted('download-target')?.at(-1)).toEqual([31])
    expect(table.props('rows').map((row: { message: string }) => row.message)).toEqual(['last', 'first'])
  })

  it('passes the search term to the table', async () => {
    const wrapper = await mountTab({ selectedLog: run(), searchTerm: 'done' })

    expect(wrapper.findComponent(LogLinesTable).props('searchTerm')).toBe('done')
  })

  it('shows the run error above the table', async () => {
    vi.mocked(getDeployLog).mockResolvedValue({ status: 'failed', stages: [], lines: [], error: 'Boom' })
    const wrapper = await mountTab({ selectedLog: run({ status: 'failed' }) })

    expect(wrapper.get('[data-testid="deploy-logs-tab-error"]').text()).toBe('Boom')
  })

  it('follows a running run live without loading its history', async () => {
    const wrapper = await mountTab({ selectedLog: run({ status: 'running', finished_at: null }) })

    expect(getDeployLogsLive).toHaveBeenCalledWith(9, 0)
    expect(getDeployLog).not.toHaveBeenCalled()
    expect(wrapper.findComponent(LogLinesTable).exists()).toBe(true)
    wrapper.unmount()
  })

  it('emits terminal when the followed run reaches a terminal status', async () => {
    vi.mocked(getDeployLogsLive).mockResolvedValue({
      panel: { id: 31 },
      engine: { status: 'success', stage: 'running', stages: [], lines: [], next_offset: 0 },
    })
    vi.mocked(getDeployLog).mockResolvedValue({ status: 'success', stages: [], lines: [], error: null })

    const wrapper = await mountTab({ selectedLog: run({ status: 'running', finished_at: null }) })

    expect(wrapper.emitted('terminal')).toEqual([['success']])
    wrapper.unmount()
  })
})
