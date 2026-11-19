import type { RawInstance } from '@/entities/project/instance-resource'
import { describe, expect, it } from 'vitest'
import { PRIVILEGES } from '@/entities/privileges/privileges'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { mountKit } from '@/test/mount-kit'
import InstallationInfoCard from './InstallationInfoCard.vue'

// The kit maps t(key) to the key, so the assertions name legacy keys, not English copy.
// The mapper derives `status` from `version`, `update_details.available_updates` and `plugin_details` (WooCommerce).

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 3,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    status: 'active',
    version: '6.5.1',
    privileges: [PRIVILEGES.WORDPRESS_UPDATE, PRIVILEGES.MANAGE_PLUGINS],
    labels: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('InstallationInfoCard', () => {
  it('shows the up-to-date state and the disabled current button when nothing needs an update', async () => {
    const instance = toInstanceResource(raw())
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.text()).toContain('message.status.updated')
    expect(wrapper.text()).not.toContain('button.wordpress.update')
    expect(wrapper.get('.current-button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('heading.instance.siteDetails.installation.current.wordpress')
    wrapper.unmount()
  })

  it('offers the WordPress update and emits the instance to the frame', async () => {
    const instance = toInstanceResource(raw({ update_details: { available_updates: ['6.5.2'] } }))
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.text()).toContain('button.wordpress.update')
    await wrapper.get('.v-btn.text-white').trigger('click')
    const emitted = wrapper.emitted('action-button-update')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]).toEqual([instance])
    wrapper.unmount()
  })

  it('offers the WordPress update for a 9.9.0 install with 10.0.0 available', async () => {
    const instance = toInstanceResource(raw({ version: '9.9.0', update_details: { available_updates: ['10.0.0'] } }))
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.text()).toContain('button.wordpress.update')
    expect(wrapper.text()).not.toContain('message.status.updated')
    wrapper.unmount()
  })

  it('offers the WooCommerce update for a 9.0.0 install with 11.3.0 available, not Updated', async () => {
    const instance = toInstanceResource(raw({ plugin_details: [{ name: 'woocommerce', version: '9.0.0', update_version: '11.3.0', update: 'available' }] }))
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.text()).toContain('button.woocommerce.update')
    // WordPress is up to date and keeps its "Updated"; the WooCommerce column must not add a second one.
    expect(wrapper.text().split('message.status.updated')).toHaveLength(2)
    wrapper.unmount()
  })

  it('emits the WooCommerce install for a user with the plugin privilege', async () => {
    const instance = toInstanceResource(raw())
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    // WordPress is installed, so the only "not installed" block is WooCommerce, and its install link is the one shown.
    expect(wrapper.text()).toContain('message.status.install.no')
    const install = wrapper.findAll('a').filter(link => link.text().includes('button.installNow'))
    expect(install).toHaveLength(1)
    await install[0]!.trigger('click')
    expect(wrapper.emitted('action-button-install-woocommerce')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows a failed installation with Try Again instead of Install Now', async () => {
    const instance = toInstanceResource(raw({ version: null, async_status: { installation: 'failed' } }))
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    // Nothing was installed, so neither column's "not installed" block belongs here: the project itself failed.
    expect(wrapper.get('[data-testid="installation-failed"]').text()).toContain('message.status.install.failed')
    expect(wrapper.text()).not.toContain('button.installNow')
    expect(wrapper.text()).not.toContain('message.status.install.no')

    await wrapper.get('[data-testid="installation-retry"]').trigger('click')
    expect(wrapper.emitted('action-button-retry')).toEqual([[instance]])
    wrapper.unmount()
  })

  it('hides the WooCommerce install link without the plugin privilege', async () => {
    const instance = toInstanceResource(raw({ privileges: [PRIVILEGES.WORDPRESS_UPDATE] }))
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.findAll('a').filter(link => link.text().includes('button.installNow'))).toHaveLength(0)
    expect(wrapper.emitted('action-button-install-woocommerce')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the WooCommerce install in progress instead of Not Installed and its install link', async () => {
    const instance = toInstanceResource(raw())
    instance.setWoocommerceInstalling(true)
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.text()).toContain('message.status.install.inProgress')
    expect(wrapper.text()).not.toContain('message.status.install.no')
    expect(wrapper.findAll('a').filter(link => link.text().includes('button.installNow'))).toHaveLength(0)
    wrapper.unmount()
  })

  it('shows the installed version once the project carries it, whatever the running flag was', async () => {
    const instance = toInstanceResource(raw({ plugin_details: [{ name: 'woocommerce', version: '11.3.0' }] }))
    instance.setWoocommerceInstalling(true)
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.text()).toContain('11.3.0')
    expect(wrapper.text()).not.toContain('message.status.install.inProgress')
    expect(wrapper.text()).not.toContain('message.status.install.no')
    wrapper.unmount()
  })

  it('shows the update in progress instead of Not Installed when a running update has no version yet', async () => {
    const instance = toInstanceResource(raw({ version: null, async_status: { update: 'in_progress' } }))
    const wrapper = await mountKit(InstallationInfoCard, { props: { instance } })

    expect(wrapper.text()).toContain('message.status.update.inProgress')
    // The only "Not Installed" left is WooCommerce's column; WordPress keeps its update state.
    expect(wrapper.text().split('message.status.install.no')).toHaveLength(2)
    expect(wrapper.findAll('a').filter(link => link.text().includes('button.installNow'))).toHaveLength(1)
    wrapper.unmount()
  })
})
