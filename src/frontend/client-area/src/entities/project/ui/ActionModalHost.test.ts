import type * as Vuetify from 'vuetify'
import type { ActionModal } from '@/entities/project/action-modal'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { VDialog } from 'vuetify/components'
import BasicModal from '@/shared/ui/modal/BasicModal.vue'
import { mountKit } from '@/test/mount-kit'
import ActionModalHost from './ActionModalHost.vue'

const smAndDown = ref(true)
vi.mock('vuetify', async importOriginal => ({ ...(await importOriginal<typeof Vuetify>()), useDisplay: () => ({ smAndDown }) }))

function modal (props: Partial<ActionModal['props']> = {}): ActionModal {
  return {
    type: 'backup-mass-delete',
    props: {
      title: 'title',
      message: 'message',
      icon: '$alertwarning',
      buttons: [],
      confirmRequired: false,
      ...props,
    },
    fields: [],
    width: '560px',
    persistent: true,
  }
}

async function mountHost (value: ActionModal, extra: { persistent?: boolean, width?: string, values?: Record<string, unknown>, confirmed?: boolean } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(ActionModalHost, {
    props: { modal: value, open: true, values: {}, ...extra },
    attachTo: host,
  })
  await flushPromises()
  return wrapper
}

describe('ActionModalHost', () => {
  it('passes the progress log of the modal to BasicModal', async () => {
    const wrapper = await mountHost(modal({ submittingProgressLog: '\n Deleting 1/2...' }))

    expect(wrapper.findComponent(BasicModal).props('submittingProgressLog')).toBe('\n Deleting 1/2...')
    wrapper.unmount()
  })

  it('leaves the progress log empty when the modal has none', async () => {
    const wrapper = await mountHost(modal())

    expect(wrapper.findComponent(BasicModal).props('submittingProgressLog')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not emit a button click while a field of the modal is invalid', async () => {
    const wrapper = await mountHost({
      ...modal(),
      fields: [{ type: 'text', name: 'name', rules: [v => !!v || 'required'] }],
    })

    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'submit')
    await flushPromises()

    expect(wrapper.emitted('button')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits the button click once the fields of the modal are valid', async () => {
    const wrapper = await mountHost({
      ...modal(),
      fields: [{ type: 'text', name: 'name', rules: [v => !!v || 'required'] }],
    })

    await wrapper.setProps({ values: { name: 'main' } })
    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'submit')
    await flushPromises()

    expect(wrapper.emitted('button')).toEqual([['submit']])
    wrapper.unmount()
  })

  it('opens the confirm gate only when every required checkbox is ticked', async () => {
    const wrapper = await mountHost({
      ...modal({ confirmRequired: true }),
      fields: [
        { type: 'checkbox', name: 'remove_data', label: 'Files', required: true },
        { type: 'checkbox', name: 'remove_database', label: 'Databases', required: true },
        { type: 'checkbox', name: 'confirm', label: 'Proceed', required: true },
        { type: 'checkbox', name: 'send_email', label: 'Send an email' },
      ],
    }, { confirmed: true, values: { remove_data: true, remove_database: true, confirm: true } })

    const confirmed = () => wrapper.findComponent(BasicModal).props('confirmed')
    expect(confirmed()).toBe(true)

    await wrapper.setProps({ values: { remove_data: true, remove_database: null, confirm: true } })
    expect(confirmed()).toBe(false)

    await wrapper.setProps({ values: { remove_data: false, remove_database: true, confirm: true } })
    expect(confirmed()).toBe(false)

    await wrapper.setProps({ values: { remove_data: true, remove_database: true, confirm: false } })
    expect(confirmed()).toBe(false)
    wrapper.unmount()
  })

  it('emits cancel without validating the fields', async () => {
    const wrapper = await mountHost({
      ...modal(),
      fields: [{ type: 'text', name: 'name', rules: [v => !!v || 'required'] }],
    })

    wrapper.findComponent(BasicModal).vm.$emit('button-click', 'cancel')
    await flushPromises()

    expect(wrapper.emitted('button')).toEqual([['cancel']])
    wrapper.unmount()
  })

  it('wraps the modal in a dialog with the custom transition and the persistent prop', async () => {
    const wrapper = await mountHost(modal(), { persistent: true })

    expect(wrapper.findComponent(VDialog).props('transition')).toBe('custom-dialog-transition')
    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(true)
    await wrapper.setProps({ persistent: false })
    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(false)
    wrapper.unmount()
  })

  it('renders one card overlay before the card, with the data-testid and the width on the card', async () => {
    const wrapper = await mountHost(modal(), { width: '560px' })

    const overlays = document.body.querySelectorAll('.card-overlay')
    expect(overlays).toHaveLength(1)
    const card = document.body.querySelector('[data-testid="instances-modal"]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.style.width).toBe('560px')
    expect(overlays[0]!.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    wrapper.unmount()
  })

  it('closes on a click on the overlay unless the modal is persistent', async () => {
    const wrapper = await mountHost(modal(), { persistent: false })

    ;(document.body.querySelector('.card-overlay') as HTMLElement).click()
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ persistent: true })
    ;(document.body.querySelector('.card-overlay') as HTMLElement).click()
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits close when the dialog asks to close, and ignores an open request', async () => {
    const wrapper = await mountHost(modal())

    wrapper.findComponent(VDialog).vm.$emit('update:modelValue', true)
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.findComponent(VDialog).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('holds overflow-y-hidden on <html> while open on a small screen', async () => {
    smAndDown.value = true
    const wrapper = await mountHost(modal())

    expect(document.documentElement.classList.contains('overflow-y-hidden')).toBe(true)
    await wrapper.setProps({ open: false })
    await nextTick()
    expect(document.documentElement.classList.contains('overflow-y-hidden')).toBe(false)
    wrapper.unmount()
  })
})
