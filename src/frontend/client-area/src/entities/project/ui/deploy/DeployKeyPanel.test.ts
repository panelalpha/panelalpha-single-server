import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import DeployKeyPanel from './DeployKeyPanel.vue'

const KEY = 'ssh-ed25519 AAAA key'

// The key box has its own copy and more buttons, so the assertions scope to the actions row.
describe('DeployKeyPanel', () => {
  it('renders the fingerprint caption only when it is set', async () => {
    const without = await mountKit(DeployKeyPanel, { props: { publicKey: KEY } })
    expect(without.find('.deploy-key-panel__fingerprint').exists()).toBe(false)
    without.unmount()

    const wrapper = await mountKit(DeployKeyPanel, { props: { publicKey: KEY, fingerprint: 'SHA256:abc' } })
    const caption = wrapper.get('.deploy-key-panel__fingerprint')
    expect(caption.text()).toContain('SHA256:abc')
    wrapper.unmount()
  })

  it('shows the connect button by default and emits connect', async () => {
    const wrapper = await mountKit(DeployKeyPanel, { props: { publicKey: KEY } })
    const button = wrapper.get('.deploy-key-panel__actions button')
    expect(button.text()).toBe('button.onboarding.gitDeploy.connectDeployKey')
    await button.trigger('click')
    expect(wrapper.emitted('connect')).toHaveLength(1)
    wrapper.unmount()
  })

  it('uses connectLabel when given', async () => {
    const wrapper = await mountKit(DeployKeyPanel, { props: { publicKey: KEY, connectLabel: 'custom' } })
    expect(wrapper.get('.deploy-key-panel__actions button').text()).toBe('custom')
    wrapper.unmount()
  })

  it('hides the connect button with hideConnect and emits nothing', async () => {
    const wrapper = await mountKit(DeployKeyPanel, { props: { publicKey: KEY, hideConnect: true } })
    expect(wrapper.find('.deploy-key-panel__actions button').exists()).toBe(false)
    expect(wrapper.emitted('connect')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the regenerate button when only the connect button is hidden', async () => {
    const wrapper = await mountKit(DeployKeyPanel, { props: { publicKey: KEY, hideConnect: true, showRegenerate: true } })
    const buttons = wrapper.findAll('.deploy-key-panel__actions button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.text()).toBe('button.onboarding.gitDeploy.regenerateDeployKey')
    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('regenerate')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the connecting label while loading', async () => {
    const wrapper = await mountKit(DeployKeyPanel, { props: { publicKey: KEY, loading: true } })
    expect(wrapper.get('.deploy-key-panel__actions button').text()).toBe('button.onboarding.gitDeploy.connectingDeployKey')
    wrapper.unmount()
  })

  it('shows the error above the actions', async () => {
    const wrapper = await mountKit(DeployKeyPanel, { props: { publicKey: KEY, error: 'boom' } })
    expect(wrapper.text()).toContain('boom')
    wrapper.unmount()
  })
})
