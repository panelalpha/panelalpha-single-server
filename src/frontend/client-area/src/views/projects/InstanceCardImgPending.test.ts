// Behaviour of the three project card pending images: written on the copies, kept green on the
// `InstancePendingOverlay` pattern. Legacy classes and test ids are what the card tests and the parity probes read.
import type { InstanceResource } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import InstanceCardImgDeployPending from './InstanceCardImgDeployPending.vue'
import InstanceCardImgImportPending from './InstanceCardImgImportPending.vue'
import InstanceCardImgInstallationPending from './InstanceCardImgInstallationPending.vue'

function instance (importDetails: unknown): InstanceResource {
  return { import_details: importDetails } as unknown as InstanceResource
}

describe('InstanceCardImgInstallationPending', () => {
  it('shows only the in-progress message while installing', async () => {
    const wrapper = await mountKit(InstanceCardImgInstallationPending, { props: {} })
    expect(wrapper.find('[data-testid="installation-pending"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="installation-pending-text"]').text()).toBe('message.status.install.inProgress')
    expect(wrapper.get('[data-testid="installation-pending-text"]').classes()).toContain('installation-pending__text')
    expect(wrapper.find('.v-progress-linear').exists()).toBe(false)
    expect(wrapper.find('.v-icon').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('shows the failure with its icon, a full bar and Try again, which emits try-again-click', async () => {
    const wrapper = await mountKit(InstanceCardImgInstallationPending, { props: { status: 'error' } })
    expect(wrapper.get('[data-testid="installation-pending"]').classes()).toContain('installation-pending--error')
    const text = wrapper.get('.installation-pending__text')
    expect(text.text()).toContain('message.status.install.failed')
    expect(text.text()).toContain('button.try')
    expect(wrapper.find('.v-icon').exists()).toBe(true)
    expect(wrapper.get('.v-progress-linear').attributes('aria-valuenow')).toBe('100')
    await wrapper.get('a').trigger('click')
    expect(wrapper.emitted('try-again-click')).toHaveLength(1)
  })

  it('shows the success message', async () => {
    const wrapper = await mountKit(InstanceCardImgInstallationPending, { props: { status: 'success' } })
    expect(wrapper.get('[data-testid="installation-pending"]').classes()).toContain('installation-pending--success')
    expect(wrapper.get('.installation-pending__text').text()).toBe('message.status.install.success')
  })
})

describe('InstanceCardImgImportPending', () => {
  it('shows the import step, its percent and a determinate bar', async () => {
    const wrapper = await mountKit(InstanceCardImgImportPending, {
      props: { instance: instance({ current_step: { name: 'installNewInstance', percent: 40 } }) },
    })
    const step = wrapper.get('[data-testid="import-pending-step"]')
    expect(step.classes()).toContain('import-pending__step')
    expect(step.text()).toContain('message.status.importing.inProgress')
    expect(step.text()).toContain('heading.instance.modal.importDetails.step.installNewInstance.title')
    expect(step.text()).toContain('40%')
    expect(wrapper.find('.import-pending__step-icon').exists()).toBe(true)
    expect(wrapper.get('.import-pending__progress').attributes('aria-valuenow')).toBe('40')
  })

  it('runs an indeterminate bar without a step row when there is no step', async () => {
    const wrapper = await mountKit(InstanceCardImgImportPending, { props: { instance: instance(null) } })
    expect(wrapper.find('.import-pending__progress .v-progress-linear__indeterminate').exists()).toBe(true)
    expect(wrapper.get('.import-pending__progress').attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.find('.import-pending__step .justify-space-between').exists()).toBe(false)
  })

  it('shows a 0 % step as a determinate empty bar without the step row', async () => {
    const wrapper = await mountKit(InstanceCardImgImportPending, {
      props: { instance: instance({ current_step: { name: 'installNewInstance', percent: 0 } }) },
    })
    expect(wrapper.get('.import-pending__progress').attributes('aria-valuenow')).toBe('0')
    expect(wrapper.find('.import-pending__step .justify-space-between').exists()).toBe(false)
  })

  it('shows the failure with a full bar and Try again, which emits try-again-click', async () => {
    const wrapper = await mountKit(InstanceCardImgImportPending, { props: { status: 'error', instance: instance(null) } })
    expect(wrapper.get('[data-testid="import-pending"]').classes()).toContain('import-pending--error')
    const text = wrapper.get('[data-testid="import-pending-text"]')
    expect(text.classes()).toContain('import-pending__text')
    expect(text.text()).toContain('message.status.importing.failed')
    expect(wrapper.get('.import-pending__progress').attributes('aria-valuenow')).toBe('100')
    await wrapper.get('a').trigger('click')
    expect(wrapper.emitted('try-again-click')).toHaveLength(1)
  })

  it('shows the success message without a bar or an icon', async () => {
    const wrapper = await mountKit(InstanceCardImgImportPending, { props: { status: 'success', instance: instance(null) } })
    expect(wrapper.get('.import-pending__text').text()).toBe('message.status.import.success')
    expect(wrapper.find('.v-progress-linear').exists()).toBe(false)
    expect(wrapper.find('.v-icon').exists()).toBe(false)
  })

  it('follows a status pushed after mount (live list update)', async () => {
    const wrapper = await mountKit(InstanceCardImgImportPending, { props: { instance: instance(null) } })
    expect(wrapper.find('.import-pending__step').exists()).toBe(true)
    await wrapper.setProps({ status: 'error' })
    expect(wrapper.find('.import-pending__step').exists()).toBe(false)
    expect(wrapper.get('.import-pending__text').text()).toContain('message.status.importing.failed')
  })
})

describe('InstanceCardImgDeployPending', () => {
  it('shows the terminal and the in-progress message', async () => {
    const wrapper = await mountKit(InstanceCardImgDeployPending, { props: {} })
    expect(wrapper.get('[data-testid="deploy-pending"]').classes()).not.toContain('deploy-pending--error')
    expect(wrapper.find('.deploy-pending__terminal').exists()).toBe(true)
    expect(wrapper.get('[data-testid="deploy-pending-text"]').text()).toBe('deployLogs.deployInProgress')
    expect(wrapper.find('.v-progress-linear').exists()).toBe(false)
    expect(wrapper.find('.instance-pending__message--alert').exists()).toBe(false)
  })

  it('shows the terminal and the failed message on error', async () => {
    const wrapper = await mountKit(InstanceCardImgDeployPending, { props: { status: 'error' } })
    expect(wrapper.get('[data-testid="deploy-pending"]').classes()).toContain('deploy-pending--error')
    expect(wrapper.find('.deploy-pending__terminal').exists()).toBe(true)
    expect(wrapper.get('.deploy-pending__text').text()).toBe('deployLogs.deployFailed')
    expect(wrapper.find('.instance-pending__message--alert').exists()).toBe(true)
    expect(wrapper.find('.instance-pending__message .v-icon').exists()).toBe(true)
  })
})
