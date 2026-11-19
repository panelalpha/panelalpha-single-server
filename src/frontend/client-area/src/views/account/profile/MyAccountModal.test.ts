import type { AccountModalOptions } from './account-modals'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { controlAfterLabel } from '@/test/field-shape'
import { mountKit } from '@/test/mount-kit'
import MyAccountModal from './MyAccountModal.vue'

const infoOptions: AccountModalOptions = {
  title: 'Change email',
  icon: '$edit',
  fields: [{ type: 'info', description: 'Set a password first' }],
  buttons: [
    { label: 'Set password', color: 'primary', type: 'switch' },
    { label: 'Cancel', color: 'normal', type: 'cancel' },
  ],
}

const requiredEmail = (v: unknown) => !!v || 'required'
const emailOptions: AccountModalOptions = {
  title: 'Change email',
  icon: '$edit',
  fields: [{ name: 'email', label: 'Email', type: 'email', rules: [requiredEmail] }],
  buttons: [{ label: 'Change', color: 'primary' }],
}

describe('MyAccountModal', () => {
  it('renders an info field as text without an input or a label', async () => {
    const wrapper = await mountKit(MyAccountModal, { props: { options: infoOptions } })

    expect(wrapper.find('[data-testid="account-modal-info"]').text()).toBe('Set a password first')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('label').exists()).toBe(false)
  })

  it('the switch button emits switch without validating or submitting', async () => {
    const wrapper = await mountKit(MyAccountModal, { props: { options: infoOptions } })

    await wrapper.findAll('button').find(b => b.text().includes('Set password'))!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('switch')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('a primary button still validates before submitting', async () => {
    const wrapper = await mountKit(MyAccountModal, { props: { options: emailOptions } })

    await wrapper.findAll('button').find(b => b.text().includes('Change'))!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.emitted('switch')).toBeUndefined()
  })
})

describe('MyAccountModal labels (kit-form-fields)', () => {
  it('puts the label right above a password and an email field (kit-form-fields)', async () => {
    const options: AccountModalOptions = {
      title: 'Change email',
      icon: '$edit',
      fields: [
        { name: 'password', label: 'Current password', type: 'password', rules: [] },
        { name: 'email', label: 'Email', type: 'email', rules: [requiredEmail] },
      ],
      buttons: [{ label: 'Change', color: 'primary' }],
    }
    const wrapper = await mountKit(MyAccountModal, { props: { options } })
    const root = wrapper.element.parentElement ?? wrapper.element

    for (const name of ['password', 'email']) {
      const label = wrapper.get(`[data-testid="account-modal-label-${name}"]`)
      expect(controlAfterLabel(root, label.element, `[data-testid="account-modal-field-${name}"]`)).not.toBeNull()
    }
    expect(wrapper.get('[data-testid="account-modal-label-password"]').text()).toBe('Current password')
    wrapper.unmount()
  })
})
