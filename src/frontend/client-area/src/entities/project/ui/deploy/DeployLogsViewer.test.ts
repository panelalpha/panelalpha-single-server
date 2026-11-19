// Class contract, one line per assertion.
import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DeployLogsViewer from './DeployLogsViewer.vue'

const stages = [{ name: 'preparing', started_at: 1, finished_at: 4 }]
const lines = [{ ts: 1_755_691_262, stage: 'preparing', msg: 'hi', level: 'info' }]

describe('DeployLogsViewer', () => {
  it('live-modal: steps list, console with live cursor while running (legacy :2-9,25-32)', async () => {
    const wrapper = await mountKit(DeployLogsViewer, { props: { live: true, stages, lines, status: 'running' } })
    expectLegacyClasses(wrapper.element, ['deploy-logs-viewer'])
    expectLegacyClasses(wrapper.get('.deploy-steps').element, ['deploy-steps', 'mb-4'])
    expect(wrapper.find('.deploy-console').exists()).toBe(true)
    expect(wrapper.find('.deploy-console__cursor').exists()).toBe(true)
    wrapper.unmount()
  })

  it('live-modal: no steps list when not live and no stages; no cursor once terminal', async () => {
    const wrapper = await mountKit(DeployLogsViewer, { props: { live: false, stages: [], lines: [], status: 'finished' } })
    expect(wrapper.find('.deploy-steps').exists()).toBe(false)
    expect(wrapper.find('.deploy-console__cursor').exists()).toBe(false)
    expect(wrapper.get('.deploy-console__line').text()).toBe('deployLogs.noLines')
    await wrapper.setProps({ stages })
    expect(wrapper.find('.deploy-steps').exists()).toBe(true)
    wrapper.unmount()
  })

  it('live empty text is deployLogs.preparing (legacy :19-21)', async () => {
    const wrapper = await mountKit(DeployLogsViewer, { props: { live: true } })
    expect(wrapper.get('.deploy-console__line').text()).toBe('deployLogs.preparing')
    wrapper.unmount()
  })

  it('warning block: the Engine warnings of a finished deploy, one per line (t3s-1)', async () => {
    const wrapper = await mountKit(DeployLogsViewer, { props: { status: 'finished', warning: 'app_not_answering: nothing answers\nhealth_check_failed: restarting' } })
    const block = wrapper.get('[data-testid="deploy-logs-viewer-warning"]')
    expect(block.classes()).toContain('deploy-logs-viewer__warning')
    expect(block.find('.v-icon').exists()).toBe(true)
    expect(block.get('.deploy-logs-viewer__warning-text').text()).toBe('app_not_answering: nothing answers\nhealth_check_failed: restarting')
    expect(wrapper.find('.deploy-logs-viewer__error').exists()).toBe(false)
    await wrapper.setProps({ warning: null })
    expect(wrapper.find('[data-testid="deploy-logs-viewer-warning"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('error block: $alertcircle icon, message, legacy classes (legacy :11-14,421-435)', async () => {
    const wrapper = await mountKit(DeployLogsViewer, { props: { error: 'Boom' } })
    const block = wrapper.get('.deploy-logs-viewer__error')
    expectLegacyClasses(block.element, ['deploy-logs-viewer__error', 'mb-4'])
    expect(block.find('.v-icon').exists()).toBe(true)
    expectLegacyClasses(block.get('.v-icon').element, ['mr-1', 'text-error'])
    expect(block.text()).toBe('Boom')
    await wrapper.setProps({ error: null })
    expect(wrapper.find('.deploy-logs-viewer__error').exists()).toBe(false)
    wrapper.unmount()
  })
})
