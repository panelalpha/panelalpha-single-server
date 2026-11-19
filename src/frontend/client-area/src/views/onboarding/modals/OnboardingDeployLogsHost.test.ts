// The host runs the deploy logs of the custom progress.
import type { DeployLogsLive } from '@/entities/project/instance-deploy-logs.api'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelDeploy, getDeployLogsLive, listDeployLogs } from '@/entities/project/instance-deploy-logs.api'
import { mountKit } from '@/test/mount-kit'
import OnboardingDeployLogsHost from './OnboardingDeployLogsHost.vue'

vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  getDeployLogsLive: vi.fn(),
  getDeployLog: vi.fn(),
  listDeployLogs: vi.fn(),
  cancelDeploy: vi.fn(),
  downloadDeployLog: vi.fn(),
}))
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

function live (data: unknown): DeployLogsLive {
  return data as DeployLogsLive
}

const running = live({
  panel: { id: 31 },
  engine: { status: 'running', stage: 'preparing', stages: [], lines: [{ msg: 'hello' }], next_offset: 1 },
})

const failed = live({
  panel: { id: 31 },
  engine: { status: 'failed', stage: 'preparing', stages: [], lines: [], next_offset: 1, error: 'boom' },
})

function pollCalls (): number {
  return vi.mocked(getDeployLogsLive).mock.calls.length
}

async function mountHost (props: Record<string, unknown> = {}) {
  return mountKit(OnboardingDeployLogsHost, {
    props: { instanceId: 7, active: true, ...props },
    global: { plugins: [createPinia()] },
  })
}

function hostVm (wrapper: Awaited<ReturnType<typeof mountHost>>): { cancel: () => Promise<boolean> } {
  return wrapper.vm as unknown as { cancel: () => Promise<boolean> }
}

describe('OnboardingDeployLogsHost', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(getDeployLogsLive).mockResolvedValue(running)
    vi.mocked(listDeployLogs).mockResolvedValue([])
    vi.mocked(cancelDeploy).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls the live logs of the instance at once, then every 2 s', async () => {
    const wrapper = await mountHost()
    await vi.advanceTimersByTimeAsync(0)
    expect(getDeployLogsLive).toHaveBeenCalledWith(7, 0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(pollCalls()).toBe(2)
    wrapper.unmount()
  })

  it('without an instance id it does not poll and shows the preparing state', async () => {
    const wrapper = await mountHost({ instanceId: null })
    await vi.advanceTimersByTimeAsync(6000)
    expect(getDeployLogsLive).not.toHaveBeenCalled()
    expect(wrapper.get('.deploy-console__line').text()).toBe('deployLogs.preparing')
    wrapper.unmount()
  })

  it('cancel without an instance id sends no request and resolves true at once (the confirm row closes)', async () => {
    const wrapper = await mountHost({ instanceId: null })
    await expect(hostVm(wrapper).cancel()).resolves.toBe(true)
    expect(cancelDeploy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancel with an instance id posts deploy-cancel for it and resolves true', async () => {
    const wrapper = await mountHost()
    await expect(hostVm(wrapper).cancel()).resolves.toBe(true)
    expect(cancelDeploy).toHaveBeenCalledWith(7)
    wrapper.unmount()
  })

  it('stops polling once it is unmounted', async () => {
    const wrapper = await mountHost()
    await vi.advanceTimersByTimeAsync(0)
    wrapper.unmount()
    const before = pollCalls()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(pollCalls()).toBe(before)
  })

  it('does not poll while it is not active, and resumes when active again', async () => {
    const wrapper = await mountHost({ active: false })
    await vi.advanceTimersByTimeAsync(6000)
    expect(getDeployLogsLive).not.toHaveBeenCalled()

    await wrapper.setProps({ active: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(getDeployLogsLive).toHaveBeenCalledWith(7, 0)

    await wrapper.setProps({ active: false })
    const before = pollCalls()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(pollCalls()).toBe(before)
    wrapper.unmount()
  })

  it('emits terminal with the status the deploy reached', async () => {
    vi.mocked(getDeployLogsLive).mockResolvedValue(failed)
    const wrapper = await mountHost()
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.emitted('terminal')).toEqual([['failed']])
    wrapper.unmount()
  })
})
