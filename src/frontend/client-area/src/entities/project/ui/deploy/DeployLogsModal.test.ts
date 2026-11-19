// Class contract and the props-only data flow.
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DeployLogsModal from './DeployLogsModal.vue'

let host: HTMLDivElement | undefined

async function mountModal (props: Record<string, unknown> = {}) {
  host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(DeployLogsModal, { props: { isOpen: true, live: true, ...props }, attachTo: host })
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 50))
  return wrapper
}

const q = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)
const text = (selector: string) => q(selector)?.textContent?.replaceAll(/\s+/g, ' ').trim()

afterEach(() => {
  host?.remove()
  host = undefined
  for (const node of document.body.querySelectorAll('.v-overlay-container')) {
    node.remove()
  }
})

describe('DeployLogsModal', () => {
  it('renders the legacy card with the title, a close icon and the close button', async () => {
    const wrapper = await mountModal({ liveMode: true })
    const card = q('.deploy-logs-modal')!
    expectLegacyClasses(card, ['v-card', 'deploy-logs-modal'])
    expect(card.style.width).toBe('680px')
    expectLegacyClasses(q('.v-card-title')!, ['d-flex', 'justify-space-between', 'align-start', 'pb-2'])
    expectLegacyClasses(q('.v-card-title h6')!, ['heading--text', 'd-flex', 'align-center'])
    expect(text('[data-testid="deploy-logs-title"]')).toBe('deployLogs.title')
    // The next card text has no bottom padding, so the buttons touched the console.
    expectLegacyClasses(q('.v-card-actions')!, ['px-6', 'pb-5'])
    expect(q('.v-card-actions')!.classList.contains('pt-0')).toBe(false)
    expect(text('[data-testid="deploy-logs-close"]')).toBe('button.close')
    wrapper.unmount()
  })

  it('shows the live badge, the hint and the cancel button while the deploy runs', async () => {
    const wrapper = await mountModal({ liveMode: true, running: true, status: 'running' })
    expect(text('[data-testid="deploy-logs-live"]')).toBe('deployLogs.live')
    expectLegacyClasses(q('.deploy-logs-modal__sub')!, ['mb-0', 'mt-2'])
    expect(text('.deploy-logs-modal__sub')).toBe('deployLogs.liveHint')
    expect(text('[data-testid="deploy-logs-cancel"]')).toBe('deployLogs.cancelDeploy')
    wrapper.unmount()
  })

  it('has no live badge or cancel button once the deploy is over, nor in history mode', async () => {
    const finished = await mountModal({ liveMode: true, running: false, status: 'finished' })
    expect(q('[data-testid="deploy-logs-live"]')).toBeNull()
    expect(q('[data-testid="deploy-logs-cancel"]')).toBeNull()
    finished.unmount()
    host?.remove()

    const history = await mountModal({ live: false, logId: 31, running: false })
    expect(q('[data-testid="deploy-logs-cancel"]')).toBeNull()
    history.unmount()
  })

  it('asks for confirmation before it emits cancel-deploy, and can back out', async () => {
    const wrapper = await mountModal({ liveMode: true, running: true })
    q('[data-testid="deploy-logs-cancel"]')!.click()
    await nextTick()
    expect(q('[data-testid="deploy-logs-cancel"]')).toBeNull()
    expect(text('.text-error')).toBe('deployLogs.cancelConfirmTitle')
    expect(wrapper.emitted('cancel-deploy')).toBeUndefined()

    q('[data-testid="deploy-logs-cancel-confirm"]')!.click()
    await nextTick()
    expect(wrapper.emitted('cancel-deploy')).toHaveLength(1)

    const buttons = [...document.body.querySelectorAll('.v-card-actions .v-btn')]
    buttons.find(button => button.textContent?.trim() === 'button.cancel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(q('[data-testid="deploy-logs-cancel"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('resets the confirmation when the modal closes', async () => {
    const wrapper = await mountModal({ liveMode: true, running: true })
    q('[data-testid="deploy-logs-cancel"]')!.click()
    await nextTick()
    expect(q('[data-testid="deploy-logs-cancel-confirm"]')).not.toBeNull()
    await wrapper.setProps({ isOpen: false })
    await wrapper.setProps({ isOpen: true })
    await nextTick()
    expect(q('[data-testid="deploy-logs-cancel"]')).not.toBeNull()
    expect(q('[data-testid="deploy-logs-cancel-confirm"]')).toBeNull()
    wrapper.unmount()
  })

  it('shows the download button only with a log id and emits download', async () => {
    const wrapper = await mountModal({ liveMode: true })
    expect(q('[data-testid="deploy-logs-download"]')).toBeNull()
    await wrapper.setProps({ downloadLogId: 31 })
    await nextTick()
    expect(text('[data-testid="deploy-logs-download"]')).toBe('deployLogs.downloadLog')
    q('[data-testid="deploy-logs-download"]')!.click()
    expect(wrapper.emitted('download')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the steps and console skeleton while the log to show is resolved and read (history), then the console', async () => {
    // Legacy had a spinner, then the empty console ("no lines") while the log was read; the three
    // steps with skeleton states and one console-sized bone instead.
    const wrapper = await mountModal({ live: false, logId: null, noLogs: false })
    expect(document.querySelectorAll('[data-testid="deploy-logs-skeleton"] .deploy-steps__step--loading')).toHaveLength(3)
    expect(document.querySelectorAll('[data-testid="deploy-steps-meta-skeleton"]')).toHaveLength(3)
    expect(q('[data-testid="deploy-logs-console-skeleton"]')).not.toBeNull()
    expect(q('.deploy-logs-viewer')).toBeNull()

    await wrapper.setProps({ logId: 31, contentLoading: true })
    await nextTick()
    expect(q('[data-testid="deploy-logs-skeleton"]')).not.toBeNull()
    expect(q('.deploy-logs-viewer')).toBeNull()

    await wrapper.setProps({ contentLoading: false, lines: [{ msg: 'hello', level: 'info' }], status: 'finished' })
    await nextTick()
    expect(q('[data-testid="deploy-logs-skeleton"]')).toBeNull()
    expect(q('.deploy-logs-viewer')).not.toBeNull()
    expect(text('.deploy-console__line')).toBe('hello')
    wrapper.unmount()
  })

  it('shows the skeleton in live mode until the first answer, then the console with its "preparing" line', async () => {
    const wrapper = await mountModal({ live: true, liveMode: true, running: true, contentLoading: true })
    expect(q('[data-testid="deploy-logs-skeleton"]')).not.toBeNull()
    expect(q('.deploy-console')).toBeNull()

    await wrapper.setProps({ contentLoading: false })
    await nextTick()
    expect(q('[data-testid="deploy-logs-skeleton"]')).toBeNull()
    expect(q('.deploy-console')).not.toBeNull()
    wrapper.unmount()
  })

  it('ends the live skeleton when the push brings stages before the first answer', async () => {
    const wrapper = await mountModal({
      live: true,
      liveMode: true,
      running: true,
      contentLoading: true,
      stages: [{ name: 'preparing', started_at: 10, finished_at: null }],
    })
    expect(q('[data-testid="deploy-logs-skeleton"]')).toBeNull()
    expect(q('.deploy-steps')).not.toBeNull()
    wrapper.unmount()
  })

  it('shows the empty state when the instance has no deploys', async () => {
    const wrapper = await mountModal({ live: false, noLogs: true })
    const empty = q('[data-testid="deploy-logs-empty"]')!
    expectLegacyClasses(empty, ['d-flex', 'flex-column', 'align-center', 'py-12', 'text-center'])
    expect(empty.textContent).toContain('deployLogs.noDeploys')
    expect(empty.textContent).toContain('deployLogs.noDeploysSubtitle')
    wrapper.unmount()
  })

  it('feeds the viewer with the stages, lines and error it is given', async () => {
    const wrapper = await mountModal({
      liveMode: true,
      running: true,
      stages: [{ name: 'preparing', started_at: 1, finished_at: 4 }],
      lines: [{ msg: 'cloning', level: 'info' }],
      error: 'Boom',
    })
    expect(q('.deploy-steps')).not.toBeNull()
    expect(text('.deploy-console__line')).toBe('cloning')
    expect(text('.deploy-logs-viewer__error')).toBe('Boom')
    wrapper.unmount()
  })

  it('emits close from the close buttons', async () => {
    const wrapper = await mountModal({ liveMode: true })
    q('[data-testid="deploy-logs-close-icon"]')!.click()
    q('[data-testid="deploy-logs-close"]')!.click()
    expect(wrapper.emitted('close')).toHaveLength(2)
    wrapper.unmount()
  })
})
