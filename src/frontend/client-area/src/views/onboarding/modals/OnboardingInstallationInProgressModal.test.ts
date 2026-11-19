// The custom deploy branch of the progress modal.
import type { DeployLogsLive } from '@/entities/project/instance-deploy-logs.api'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { cancelDeploy, getDeployLog, getDeployLogsLive, listDeployLogs } from '@/entities/project/instance-deploy-logs.api'
import { mountKit } from '@/test/mount-kit'
import OnboardingInstallationInProgressModal from './OnboardingInstallationInProgressModal.vue'

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
  engine: { status: 'running', stage: 'preparing', stages: [], lines: [{ msg: 'building' }], next_offset: 1 },
})

const failed = live({
  panel: { id: 31 },
  engine: { status: 'failed', stage: 'preparing', stages: [], lines: [], next_offset: 1, error: 'boom' },
})

let host: HTMLDivElement | undefined

interface ModalProps {
  customDeploy?: boolean
  instanceId?: number | string | null
  completed?: boolean
  error?: boolean
  installedInstance?: Record<string, unknown> | null
  source?: 'files' | 'git' | null
  archivePending?: boolean
}

async function mountModal (props: ModalProps = {}) {
  host = document.createElement('div')
  document.body.append(host)
  return mountKit(OnboardingInstallationInProgressModal, {
    props: {
      modelValue: true,
      theme: null,
      customDeploy: true,
      instanceId: 7,
      completed: false,
      error: false,
      installedInstance: { id: 7 },
      ...props,
    },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
}

const q = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)
const text = (selector: string) => q(selector)?.textContent?.replaceAll(/\s+/g, ' ').trim()
/** The confirmation row's title (the Cancel button carries `text-error` too, so the class alone is not enough). */
const CONFIRM_ROW = '.custom-deploy span.text-error.p-4'
/** `button.project.details` has a `defaultValue` until the backend adds the key, so the test i18n renders that text. */
const DETAILS = 'Project Details'

function button (label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll<HTMLButtonElement>('.v-btn')]
    .find(node => node.textContent?.trim() === label)
}

function clickButton (label: string): void {
  const node = button(label)
  if (!node) {
    throw new Error(`no button ${label}`)
  }
  node.click()
}

function pollCalls (): number {
  return vi.mocked(getDeployLogsLive).mock.calls.length
}

afterEach(() => {
  host?.remove()
  host = undefined
  for (const node of document.body.querySelectorAll('.v-overlay-container')) {
    node.remove()
  }
  vi.useRealTimers()
})

describe('OnboardingInstallationInProgressModal custom deploy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(getDeployLogsLive).mockResolvedValue(running)
    vi.mocked(listDeployLogs).mockResolvedValue([])
    vi.mocked(cancelDeploy).mockResolvedValue(undefined)
  })

  it('keeps the standard progress without the custom deploy flag', async () => {
    const wrapper = await mountModal({ customDeploy: false, instanceId: null })
    await nextTick()
    expect(q('.custom-deploy')).toBeNull()
    expect(text('.installation-card')).toContain('heading.onboarding.installation.subtitle.inProgress')
    expect(button('deployLogs.cancelDeploy')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the creating title, the live hint, the logs, Cancel and Back while the deploy runs', async () => {
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)
    expect(q('.custom-deploy')).not.toBeNull()
    expect(text('.custom-deploy h1')).toBe('deployLogs.creatingProject')
    expect(text('.custom-deploy > p')).toBe('deployLogs.liveHint')
    expect(q('.custom-deploy .deploy-logs-viewer')).not.toBeNull()
    expect(button('deployLogs.cancelDeploy')).toBeDefined()
    expect(button('button.dashboard.back')).toBeDefined()
    expect(button(DETAILS)).toBeUndefined()
    wrapper.unmount()
  })

  it('does not invite closing the window while a files archive is still uploading', async () => {
    const wrapper = await mountModal({ source: 'files', archivePending: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(text('.custom-deploy > p')).toBe('deployLogs.uploadingFiles')
    expect(text('.custom-deploy > p')).not.toContain('deployLogs.liveHint')
    wrapper.unmount()

    // Once the upload is done the deployment really does continue without this window.
    const uploaded = await mountModal({ source: 'files', archivePending: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(text('.custom-deploy > p')).toBe('deployLogs.liveHint')
    uploaded.unmount()
  })

  it('keeps the live hint of a git deploy, whose work the server does from the start', async () => {
    const wrapper = await mountModal({ source: 'git', archivePending: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(text('.custom-deploy > p')).toBe('deployLogs.liveHint')
    wrapper.unmount()
  })

  it('cancel without an instance id sends no request, and the confirmation row closes (the work carries on)', async () => {
    const wrapper = await mountModal({ instanceId: null })
    clickButton('deployLogs.cancelDeploy')
    await nextTick()
    expect(text(CONFIRM_ROW)).toBe('deployLogs.cancelConfirmTitle')

    clickButton('button.confirm')
    await vi.advanceTimersByTimeAsync(0)
    expect(cancelDeploy).not.toHaveBeenCalled()
    expect(q(CONFIRM_ROW)).toBeNull()
    wrapper.unmount()
  })

  it('confirms the cancel to the flow, which stops a files create whose archive it still uploads', async () => {
    // Without an instance id there is no Engine deploy yet: the upload this window promised to keep is what has to stop.
    const wrapper = await mountModal({ instanceId: null, source: 'files', archivePending: true })
    clickButton('deployLogs.cancelDeploy')
    await nextTick()
    clickButton('button.confirm')
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.emitted('cancel-deploy')).toHaveLength(1)
    expect(cancelDeploy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancel with an instance id posts deploy-cancel for it and closes the confirmation row', async () => {
    const wrapper = await mountModal()
    clickButton('deployLogs.cancelDeploy')
    await nextTick()
    clickButton('button.confirm')
    await vi.advanceTimersByTimeAsync(0)
    expect(cancelDeploy).toHaveBeenCalledWith(7)
    expect(q(CONFIRM_ROW)).toBeNull()
    expect(button('deployLogs.cancelDeploy')).toBeDefined()
    wrapper.unmount()
  })

  it('backing out of the confirmation keeps the deploy running', async () => {
    const wrapper = await mountModal()
    clickButton('deployLogs.cancelDeploy')
    await nextTick()
    clickButton('button.cancel')
    await nextTick()
    expect(q(CONFIRM_ROW)).toBeNull()
    expect(cancelDeploy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('a terminal status of the deploy closes the open confirmation row', async () => {
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)
    clickButton('deployLogs.cancelDeploy')
    await nextTick()
    expect(q(CONFIRM_ROW)).not.toBeNull()

    vi.mocked(getDeployLogsLive).mockResolvedValue(failed)
    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()
    expect(q(CONFIRM_ROW)).toBeNull()
    expect(button('deployLogs.cancelDeploy')).toBeDefined()
    wrapper.unmount()
  })

  it('reads the log once more when the install finished, then stops polling', async () => {
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)
    const before = pollCalls()
    await wrapper.setProps({ completed: true, installedInstance: { id: 7 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(pollCalls()).toBe(before + 1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(pollCalls()).toBe(before + 1)
    wrapper.unmount()
  })

  it('ends on the terminal state of the log when the install finished before the log did', async () => {
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)
    expect(q('.deploy-steps__step--progress')).not.toBeNull()

    vi.mocked(getDeployLogsLive).mockResolvedValue(live({
      panel: { id: 31 },
      engine: {
        status: 'partial',
        stage: 'running',
        stages: [{ name: 'preparing', started_at: 10, finished_at: 19 }, { name: 'running', started_at: 24, finished_at: 47 }],
        lines: [],
        next_offset: 40,
      },
    }))
    await wrapper.setProps({ completed: true, installedInstance: { id: 7 } })
    await vi.advanceTimersByTimeAsync(0)

    expect(text('.custom-deploy h1')).toBe('heading.onboarding.installation.title.completed')
    expect(q('.deploy-steps__step--progress')).toBeNull()
    expect([...document.body.querySelectorAll('.deploy-steps__step--done')]).toHaveLength(2)
    expect([...document.body.querySelectorAll('.deploy-steps__step--skipped')]).toHaveLength(1)
    wrapper.unmount()
  })

  it('lets a read already in flight finish and then reads the log again', async () => {
    let answerFirst: (value: DeployLogsLive) => void = () => {}
    vi.mocked(getDeployLogsLive).mockImplementationOnce(() => new Promise(resolve => {
      answerFirst = resolve
    }))
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)
    expect(pollCalls()).toBe(1)

    await wrapper.setProps({ completed: true, installedInstance: { id: 7 } })
    await vi.advanceTimersByTimeAsync(0)
    // the read in flight is the first look; the final read follows it
    expect(pollCalls()).toBe(1)

    vi.mocked(getDeployLogsLive).mockResolvedValue(failed)
    answerFirst(running)
    await vi.advanceTimersByTimeAsync(0)
    expect(pollCalls()).toBe(2)
    expect(q('.deploy-steps__step--progress')).toBeNull()
    wrapper.unmount()
  })

  it('takes the terminal state from the deploy history when the live read has no deploy left', async () => {
    vi.mocked(getDeployLogsLive).mockResolvedValue(live({
      panel: { id: 31 },
      engine: { status: 'running', stage: 'preparing', stages: [], lines: [], next_offset: 1 },
    }))
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)

    vi.mocked(getDeployLogsLive).mockResolvedValue(live({ panel: null, engine: null }))
    vi.mocked(listDeployLogs).mockResolvedValue([{ id: 31, status: 'finished' }])
    vi.mocked(getDeployLog).mockResolvedValue({
      status: 'finished',
      stages: [{ name: 'preparing', started_at: 10, finished_at: 19 }, { name: 'running', started_at: 24, finished_at: 47 }],
      lines: [],
    })
    await wrapper.setProps({ completed: true, installedInstance: { id: 7 } })
    await vi.advanceTimersByTimeAsync(0)

    expect(q('.deploy-steps__step--progress')).toBeNull()
    expect([...document.body.querySelectorAll('.deploy-steps__step--done')]).toHaveLength(2)
    wrapper.unmount()
  })

  it('does not read the log again when the log already ended', async () => {
    vi.mocked(getDeployLogsLive).mockResolvedValue(failed)
    const wrapper = await mountModal()
    await vi.advanceTimersByTimeAsync(0)
    expect(q('.deploy-steps__step--progress')).toBeNull()
    const before = pollCalls()

    await wrapper.setProps({ completed: true, installedInstance: { id: 7 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(pollCalls()).toBe(before)
    wrapper.unmount()
  })

  it('on success it shows the details button only', async () => {
    const wrapper = await mountModal({ completed: true, error: false })
    await nextTick()
    expect(text('.custom-deploy h1')).toBe('heading.onboarding.installation.title.completed')
    expect(button(DETAILS)).toBeDefined()
    expect(button('button.try')).toBeUndefined()
    expect(button('deployLogs.cancelDeploy')).toBeUndefined()
    wrapper.unmount()
  })

  it('on failure it shows Try again and Back, and emits their events', async () => {
    const wrapper = await mountModal({ completed: true, error: true })
    await nextTick()
    expect(text('.custom-deploy h1')).toBe('heading.onboarding.installation.title.failed')
    expect(button(DETAILS)).toBeUndefined()

    clickButton('button.try')
    clickButton('button.dashboard.back')
    expect(wrapper.emitted('try-again')).toHaveLength(1)
    expect(wrapper.emitted('go-to-dashboard')).toHaveLength(1)
    wrapper.unmount()
  })

  it('the details button emits go-to-details with the instance id on success', async () => {
    const wrapper = await mountModal({ completed: true, error: false })
    await nextTick()
    clickButton(DETAILS)
    expect(wrapper.emitted('go-to-details')).toEqual([[7]])
    wrapper.unmount()
  })
})
