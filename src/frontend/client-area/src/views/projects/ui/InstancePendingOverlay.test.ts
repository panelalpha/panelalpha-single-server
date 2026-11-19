import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import InstancePendingOverlay from './InstancePendingOverlay.vue'

describe('InstancePendingOverlay', () => {
  it('builds the legacy classes and test ids from block, with the icon, a determinate bar and the step row', async () => {
    const wrapper = await mountKit(InstancePendingOverlay, {
      props: { block: 'import-pending', message: 'Importing', icon: '$download', progress: 40, step: { label: 'Step one', percent: 40 } },
    })
    const root = wrapper.get('[data-testid="import-pending"]')
    expect(root.classes()).toEqual(expect.arrayContaining(['instance-pending', 'import-pending']))
    expect(wrapper.find('.import-pending__content').exists()).toBe(true)
    expect(wrapper.find('.import-pending__step-icon').exists()).toBe(true)
    const body = wrapper.get('[data-testid="import-pending-step"]')
    expect(body.classes()).toContain('import-pending__step')
    expect(body.text()).toContain('Importing')
    expect(body.text()).toContain('Step one')
    expect(body.text()).toContain('40%')
    expect(wrapper.get('.import-pending__progress').attributes('aria-valuenow')).toBe('40')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('runs an indeterminate bar without a step row', async () => {
    const wrapper = await mountKit(InstancePendingOverlay, {
      props: { block: 'import-pending', message: 'Importing', icon: '$download', progress: 'indeterminate' },
    })
    expect(wrapper.find('.import-pending__progress .v-progress-linear__indeterminate').exists()).toBe(true)
    expect(wrapper.get('.import-pending__progress').attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.find('.justify-space-between').exists()).toBe(false)
  })

  it('shows the error with a full bar and Try again, which emits try-again', async () => {
    const wrapper = await mountKit(InstancePendingOverlay, {
      props: { block: 'installation-pending', status: 'error', message: 'Failed', icon: '$systemInstallations', progress: 100, tryAgain: true },
    })
    expect(wrapper.get('[data-testid="installation-pending"]').classes()).toContain('installation-pending--error')
    const body = wrapper.get('[data-testid="installation-pending-text"]')
    expect(body.classes()).toContain('installation-pending__text')
    expect(body.text()).toContain('Failed')
    expect(wrapper.get('a.text-error').text()).toBe('button.try')
    expect(wrapper.get('.installation-pending__progress').attributes('aria-valuenow')).toBe('100')
    await wrapper.get('a').trigger('click')
    expect(wrapper.emitted('try-again')).toHaveLength(1)
  })

  it('renders the message alone without icon, bar or link', async () => {
    const wrapper = await mountKit(InstancePendingOverlay, {
      props: { block: 'installation-pending', status: 'success', message: 'Installed' },
    })
    expect(wrapper.get('[data-testid="installation-pending"]').classes()).toContain('installation-pending--success')
    expect(wrapper.get('[data-testid="installation-pending-text"]').text()).toBe('Installed')
    expect(wrapper.find('.v-icon').exists()).toBe(false)
    expect(wrapper.find('.v-progress-linear').exists()).toBe(false)
  })

  it('draws the animated terminal instead of the icon and the failed lines on error', async () => {
    const wrapper = await mountKit(InstancePendingOverlay, {
      props: { block: 'deploy-pending', message: 'Deploying', terminal: true, icon: '$download' },
    })
    expect(wrapper.find('.deploy-pending__terminal').exists()).toBe(true)
    expect(wrapper.find('.instance-pending__line--1').exists()).toBe(true)
    expect(wrapper.find('.v-icon').exists()).toBe(false)
    expect(wrapper.get('[data-testid="deploy-pending-text"]').text()).toBe('Deploying')

    await wrapper.setProps({ status: 'error', message: 'Deploy failed' })
    expect(wrapper.get('[data-testid="deploy-pending"]').classes()).toContain('deploy-pending--error')
    expect(wrapper.find('.instance-pending__line--failed').exists()).toBe(true)
    expect(wrapper.find('.instance-pending__line--1').exists()).toBe(false)
    expect(wrapper.get('[data-testid="deploy-pending-text"]').text()).toBe('Deploy failed')
  })

  it('shows the deploy error in red with the alert icon only with errorAlert and on error (K-39)', async () => {
    const wrapper = await mountKit(InstancePendingOverlay, {
      props: { block: 'deploy-pending', message: 'Deploying', terminal: true, errorAlert: true },
    })
    expect(wrapper.find('.instance-pending__message--alert').exists()).toBe(false)
    expect(wrapper.find('.instance-pending__message .v-icon').exists()).toBe(false)

    await wrapper.setProps({ status: 'error', message: 'Deploy failed' })
    expect(wrapper.find('.instance-pending__message--alert').exists()).toBe(true)
    expect(wrapper.get('.instance-pending__message .v-icon').classes()).toContain('text-error')
    expect(wrapper.get('[data-testid="deploy-pending-text"]').text()).toBe('Deploy failed')

    await wrapper.setProps({ errorAlert: false })
    expect(wrapper.find('.instance-pending__message--alert').exists()).toBe(false)
    expect(wrapper.find('.instance-pending__message .v-icon').exists()).toBe(false)
    wrapper.unmount()
  })
})
