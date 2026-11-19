import type { AccountModalOptions } from './account-modals'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import MyAccountModal from './MyAccountModal.vue'

// The card of the email and password modals before and after it moves to `BasicModal`.
const requiredEmail = (v: unknown) => !!v || 'required'
const options: AccountModalOptions = {
  title: 'Change email',
  icon: '$edit',
  fields: [{ name: 'email', label: 'Email', type: 'email', rules: [requiredEmail] }],
  buttons: [
    { label: 'Change', color: 'primary' },
    { label: 'Cancel', color: 'normal', type: 'cancel' },
  ],
}

describe('MyAccountModal card', () => {
  it('keeps the test ids of the card, the title and the buttons', async () => {
    const wrapper = await mountKit(MyAccountModal, { props: { options } })

    expect(wrapper.attributes('data-testid')).toBe('account-modal')
    expect(wrapper.get('[data-testid="account-modal-title"]').text()).toContain('Change email')
    expect(wrapper.get('[data-testid="account-modal-submit"]').text()).toContain('Change')
    expect(wrapper.get('[data-testid="account-modal-cancel"]').text()).toContain('Cancel')
    wrapper.unmount()
  })

  it('emits modal-close from Cancel and from the X', async () => {
    const wrapper = await mountKit(MyAccountModal, { props: { options } })

    await wrapper.get('[data-testid="account-modal-cancel"]').trigger('click')
    await wrapper.get('.v-card-title button').trigger('click')

    expect(wrapper.emitted('modal-close')).toHaveLength(2)
    wrapper.unmount()
  })

  it('submits the values of a valid form', async () => {
    const wrapper = await mountKit(MyAccountModal, { props: { options } })

    await wrapper.get('[data-testid="account-modal-field-email"] input').setValue('me@example.com')
    await wrapper.get('[data-testid="account-modal-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('submit')).toEqual([[{ email: 'me@example.com' }]])
    wrapper.unmount()
  })
})
