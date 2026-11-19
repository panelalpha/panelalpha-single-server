import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import HubDisconnectModal from './HubDisconnectModal.vue'

function q<T extends HTMLElement = HTMLElement> (selector: string): T | null {
  return document.querySelector<T>(selector)
}

async function mountModal (props: Record<string, unknown> = {}) {
  const wrapper = await mountKit(HubDisconnectModal, { props: { modelValue: true, ...props } })
  await flushPromises()
  return wrapper
}

describe('HubDisconnectModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('warns and offers Confirm and Cancel, with the legacy classes', async () => {
    const wrapper = await mountModal()

    expect(q('.basic-modal.hub-disconnect-modal')).not.toBeNull()
    expect(q('.hub-disconnect-modal h6')!.textContent).toContain('Disconnect from PanelAlpha Hub?')
    expect(q('.hub-disconnect-warning')!.textContent).toContain('Disconnecting removes this server from your PanelAlpha Hub account and turns off "Sign in with PanelAlpha Hub" until you connect again.')
    expect(q('.hub-disconnect-set-password')).toBeNull()
    expect(q('.hub-disconnect-set-password-link')).toBeNull()
    expect(q('.hub-disconnect-confirm')!.textContent).toContain('settings.hub.disconnectConfirm')
    expect(q('.hub-disconnect-cancel')).not.toBeNull()
    expect(q('.card-overlay')).not.toBeNull()
    wrapper.unmount()
  })

  it('emits confirm and does not close by itself', async () => {
    const wrapper = await mountModal()

    q('.hub-disconnect-confirm')!.click()
    await flushPromises()

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes on Cancel', async () => {
    const wrapper = await mountModal()

    q('.hub-disconnect-cancel')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('closes on the overlay', async () => {
    const wrapper = await mountModal()

    q('.card-overlay')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('points a generated-password admin to Set password instead of Confirm', async () => {
    const wrapper = await mountModal({ passwordGenerated: true })

    expect(q('.hub-disconnect-set-password')!.textContent).toContain('PanelAlpha Hub is the only way to sign in to this panel. Set a password in My account first, then disconnect.')
    expect(q('.hub-disconnect-warning')).toBeNull()
    expect(q('.hub-disconnect-confirm')).toBeNull()
    expect(q('.hub-disconnect-set-password-link')!.textContent).toContain('settings.hub.disconnectSetPasswordLink')

    q('.hub-disconnect-set-password-link')!.click()
    await flushPromises()

    expect(wrapper.emitted('set-password')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

  it('loads on Confirm, disables Cancel and cannot be closed while loading', async () => {
    const wrapper = await mountModal({ loading: true })

    const confirm = q('.hub-disconnect-confirm')!
    expect(confirm.classList.contains('v-btn--loading')).toBe(true)
    expect(confirm.textContent).toContain('settings.hub.disconnecting')
    expect(q<HTMLButtonElement>('.hub-disconnect-cancel')!.disabled).toBe(true)
    expect(q('.card-overlay')).toBeNull()

    q('.hub-disconnect-cancel')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes on the X and hides it while loading (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountModal()

    q('.hub-disconnect-modal .modal-close-button')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])

    await wrapper.setProps({ loading: true })
    expect(q('.hub-disconnect-modal .modal-close-button')).toBeNull()
    wrapper.unmount()
  })
})
