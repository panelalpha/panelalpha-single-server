import type * as Vuetify from 'vuetify'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { VDialog } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import McpTokenModal from './McpTokenModal.vue'

vi.mock('vuetify', async importOriginal => ({ ...(await importOriginal<typeof Vuetify>()), useDisplay: () => ({ smAndDown: { value: false } }) }))

const body = () => h('p', { 'data-testid': 'body' }, 'body')

async function mountModal (props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(McpTokenModal, {
    props: { modelValue: true, variant: 'create', title: 'Title', testId: 'mcp-modal', ...props },
    attachTo: host,
    slots: { default: body as never, actions: (() => h('button', { 'data-testid': 'act' }, 'act')) as never },
  })
  await flushPromises()
  return { wrapper, host }
}

describe('McpTokenModal', () => {
  it('renders a plain V4 dialog: no custom transition, not persistent, no overlay', async () => {
    const { wrapper, host } = await mountModal()
    const bare = await mountKit(VDialog, { props: { modelValue: true } })

    expect(wrapper.findComponent(VDialog).props('transition')).toEqual(bare.findComponent(VDialog).props('transition'))
    expect(wrapper.findComponent(VDialog).props('persistent')).toBe(false)
    expect(document.body.querySelector('.card-overlay')).toBeNull()
    bare.unmount()
    wrapper.unmount()
    host.remove()
  })

  it('emits after-leave from the dialog and update:model-value false from the close button', async () => {
    const { wrapper, host } = await mountModal()

    wrapper.findComponent(VDialog).vm.$emit('afterLeave')
    expect(wrapper.emitted('after-leave')).toHaveLength(1)

    document.querySelector<HTMLButtonElement>('.modal-close-button')!.click()
    expect(wrapper.emitted('update:model-value')).toEqual([[false]])
    wrapper.unmount()
    host.remove()
  })

  it('locks the close button with mcp-modal-close--locked and hides it when closeVisible is false', async () => {
    const { wrapper, host } = await mountModal({ closeLocked: true })
    expect(document.querySelector('.modal-close-button')!.classList.contains('mcp-modal-close--locked')).toBe(true)

    await wrapper.setProps({ closeLocked: false })
    expect(document.querySelector('.modal-close-button')!.classList.contains('mcp-modal-close--locked')).toBe(false)

    await wrapper.setProps({ closeVisible: false })
    expect(document.querySelector('.modal-close-button')).toBeNull()
    wrapper.unmount()
    host.remove()
  })

  it('sets data-testid and width 560 on the card and renders the slots', async () => {
    const { wrapper, host } = await mountModal()
    const card = document.querySelector<HTMLElement>('[data-testid="mcp-modal"]')!

    expect(card.classList.contains('basic-modal')).toBe(true)
    expect(card.style.width).toBe('560px')
    expect(card.querySelector('[data-testid="body"]')).not.toBeNull()
    expect(card.querySelector('[data-testid="act"]')).not.toBeNull()
    expect(card.querySelector('h6 span')!.textContent).toBe('Title')
    wrapper.unmount()
    host.remove()
  })

  it('uses the lock icon in the primary colour for create and the warning icon in the error colour for danger', async () => {
    const create = await mountModal()
    expect(document.querySelector('h6 .v-icon')!.className).toContain('text-primary')
    create.wrapper.unmount()
    create.host.remove()

    const danger = await mountModal({ variant: 'danger' })
    expect(document.querySelector('h6 .v-icon')!.className).toContain('text-error')
    danger.wrapper.unmount()
    danger.host.remove()
  })
})
