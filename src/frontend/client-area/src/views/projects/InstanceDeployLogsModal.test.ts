// The Show Logs window of the project list.
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDeployLog, getDeployLogsLive, listDeployLogs } from '@/entities/project/instance-deploy-logs.api'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { mountKit } from '@/test/mount-kit'
import InstanceDeployLogsModal from './InstanceDeployLogsModal.vue'

vi.mock('@/entities/project/instance-deploy-logs.api', () => ({
  listDeployLogs: vi.fn(),
  getDeployLog: vi.fn(),
  getDeployLogsLive: vi.fn(),
  cancelDeploy: vi.fn(),
  downloadDeployLog: vi.fn(),
}))
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

const q = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const text = (selector: string) => q(selector)?.textContent?.replaceAll(/\s+/g, ' ').trim()

function live (status: string, lines: string[] = []) {
  return {
    panel: { id: '20261114-170306-042a4a' },
    engine: { status, stage: 'preparing', stages: [{ name: 'preparing', started_at: 1 }], lines: lines.map(msg => ({ msg })), next_offset: lines.length },
  }
}

async function mountModal (props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(InstanceDeployLogsModal, {
    props: { isOpen: true, instanceId: 5, live: true, ...props },
    attachTo: host,
    global: { plugins: [pinia] },
  })
  // the first live read goes out at once; the dialog needs a frame to render its content
  await new Promise(resolve => setTimeout(resolve, 80))
  await flushPromises()
  return wrapper
}

afterEach(() => {
  for (const node of document.body.querySelectorAll('.v-overlay-container')) {
    node.remove()
  }
})

describe('InstanceDeployLogsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAppEvents()
  })

  it('shows the live badge, the hint and Cancel Deploy when the window opens on a deploy that is already running', async () => {
    // The status stays `running` from the first read to the end of the deploy, so nothing ever "changes" after the open.
    vi.mocked(getDeployLogsLive).mockResolvedValue(live('running', ['Deploy requested']))
    const wrapper = await mountModal()

    expect(text('[data-testid="deploy-logs-live"]')).toBe('deployLogs.live')
    expect(text('.deploy-logs-modal__sub')).toBe('deployLogs.liveHint')
    expect(text('[data-testid="deploy-logs-cancel"]')).toBe('deployLogs.cancelDeploy')
    // nothing final to save while the run goes on
    expect(q('[data-testid="deploy-logs-download"]')).toBeNull()
    wrapper.unmount()
  })

  it('drops the badge and offers Download Logs once the run it follows is over', async () => {
    vi.mocked(getDeployLogsLive).mockResolvedValue(live('running', ['Deploy requested']))
    vi.mocked(listDeployLogs).mockResolvedValue([{ id: 31, status: 'running' }])
    const wrapper = await mountModal()
    expect(q('[data-testid="deploy-logs-live"]')).not.toBeNull()

    vi.mocked(getDeployLogsLive).mockResolvedValue(live('finished', ['Deploy requested', 'done']))
    vi.mocked(getDeployLog).mockResolvedValue({ status: 'finished', stages: [], lines: [{ msg: 'done' }], error: null })
    emit('deploy-log-updated', { application_id: 5, status: 'finished' })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 80))
    await flushPromises()

    expect(q('[data-testid="deploy-logs-live"]')).toBeNull()
    expect(q('[data-testid="deploy-logs-cancel"]')).toBeNull()
    expect(text('[data-testid="deploy-logs-download"]')).toBe('deployLogs.downloadLog')
    wrapper.unmount()
  })
})
