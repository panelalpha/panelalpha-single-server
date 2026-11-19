import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import WoocommerceUpdateModal from './WoocommerceUpdateModal.vue'

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountModal (props: { modelValue?: boolean, submitting?: boolean, updateVersion?: string | null } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(WoocommerceUpdateModal, {
    props: { modelValue: true, submitting: false, updateVersion: '8.5.0', ...props },
    attachTo: host,
  })
  await flushPromises()
  return wrapper
}

describe('WoocommerceUpdateModal', () => {
  beforeEach(() => {
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('opens with the update title, the message with the version and the update and cancel buttons', async () => {
    const wrapper = await mountModal()
    const card = bodyQuery('[data-testid="woocommerce-update-modal"]')!

    expect(card.textContent).toContain('heading.instance.plugin.update.title')
    expect(card.textContent).toContain('heading.instance.plugin.update.message_one')
    expect(card.querySelectorAll('.v-card-actions .v-btn')).toHaveLength(2)
    wrapper.unmount()
  })

  it('emits confirm from the update button', async () => {
    const wrapper = await mountModal()
    const [submit] = [...document.body.querySelectorAll<HTMLElement>('[data-testid="woocommerce-update-modal"] .v-card-actions .v-btn')]

    submit!.click()
    await flushPromises()

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('closes from the cancel button', async () => {
    const wrapper = await mountModal()
    const cancel = document.body.querySelectorAll<HTMLElement>('[data-testid="woocommerce-update-modal"] .v-card-actions .v-btn')[1]

    cancel!.click()
    await flushPromises()

    expect(wrapper.emitted('update:model-value')).toEqual([[false]])
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

  it('renders nothing when closed', async () => {
    const wrapper = await mountModal({ modelValue: false })

    expect(bodyQuery('[data-testid="woocommerce-update-modal"]')).toBeNull()
    wrapper.unmount()
  })
})
